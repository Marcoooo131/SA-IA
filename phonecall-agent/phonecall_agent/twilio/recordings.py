"""Server-side, authenticated retrieval of Twilio recordings.

- Metadata: ``GET /2010-04-01/Accounts/{AccountSid}/Recordings/{RecordingSid}.json``
- Media:    ``GET /2010-04-01/Accounts/{AccountSid}/Recordings/{RecordingSid}.mp3`` (or ``.wav``)
- Delete:   ``DELETE /2010-04-01/Accounts/{AccountSid}/Recordings/{RecordingSid}.json``

Media is only fetchable once the recording status is ``completed``. Credentials are sent with
HTTP Basic auth (API Key SID/Secret preferred, Account SID/Auth Token otherwise). Twilio may
redirect media requests to storage; httpx drops the Authorization header on cross-origin
redirects, so credentials never leave api.twilio.com.
"""

from __future__ import annotations

import hashlib
import logging
import time
from dataclasses import dataclass

import httpx

from ..config import Settings
from ..errors import InvalidAudio, RecordingNotReady, RecordingUnavailable, TransientError

log = logging.getLogger(__name__)

ALLOWED_CONTENT_TYPES = {
    "mp3": {"audio/mpeg", "audio/mp3", "audio/mpeg3"},
    "wav": {"audio/wav", "audio/x-wav", "audio/wave"},
}


@dataclass(frozen=True)
class RecordingMetadata:
    sid: str
    call_sid: str | None
    status: str
    duration: int | None
    channels: int | None


@dataclass(frozen=True)
class DownloadedAudio:
    data: bytes
    content_type: str
    sha256: str
    extension: str

    @property
    def size(self) -> int:
        return len(self.data)


def looks_like_audio(data: bytes, extension: str) -> bool:
    """Magic-number check, to reject HTML error pages or truncated files served as audio."""
    if len(data) < 12:
        return False
    if extension == "wav":
        return data[:4] == b"RIFF" and data[8:12] == b"WAVE"
    # MP3: ID3 tag or MPEG frame sync (11 set bits)
    return data[:3] == b"ID3" or (data[0] == 0xFF and (data[1] & 0xE0) == 0xE0)


class TwilioRecordingClient:
    def __init__(self, settings: Settings, transport: httpx.BaseTransport | None = None, sleep=time.sleep):
        self.settings = settings
        self._sleep = sleep
        if settings.twilio_api_key_sid:
            auth = (settings.twilio_api_key_sid, settings.twilio_api_key_secret.get_secret_value())
        else:
            auth = (settings.twilio_account_sid, settings.twilio_auth_token.get_secret_value())
        self._client = httpx.Client(
            base_url=settings.twilio_api_base,
            auth=auth,
            timeout=httpx.Timeout(settings.http_timeout_seconds, connect=10.0),
            follow_redirects=True,
            transport=transport,
            headers={"User-Agent": "sector-alarm-phonecall-agent/0.1"},
        )

    def close(self) -> None:
        self._client.close()

    def _path(self, account_sid: str, recording_sid: str, ext: str) -> str:
        return f"/2010-04-01/Accounts/{account_sid}/Recordings/{recording_sid}.{ext}"

    def _with_retries(self, func, what: str):
        attempts = max(1, self.settings.download_max_attempts)
        last: Exception | None = None
        for attempt in range(1, attempts + 1):
            try:
                return func()
            except TransientError as exc:
                last = exc
            except (httpx.TimeoutException, httpx.NetworkError, httpx.RemoteProtocolError) as exc:
                last = TransientError(f"{what}: {type(exc).__name__}", code="network_error")
            if attempt < attempts:
                self._sleep(min(2 ** attempt, 30))
        assert last is not None
        raise last

    @staticmethod
    def _raise_for_status(resp: httpx.Response, what: str) -> None:
        if resp.status_code == 404:
            raise RecordingUnavailable(f"{what}: not found (deleted or stored externally)")
        if resp.status_code in (401, 403):
            raise RecordingUnavailable(f"{what}: authentication refused ({resp.status_code})", code="twilio_auth")
        if resp.status_code == 429 or resp.status_code >= 500:
            raise TransientError(f"{what}: HTTP {resp.status_code}", code="twilio_http")
        if resp.status_code >= 400:
            raise RecordingUnavailable(f"{what}: HTTP {resp.status_code}", code="twilio_http")

    def fetch_metadata(self, account_sid: str, recording_sid: str) -> RecordingMetadata:
        def _do():
            resp = self._client.get(self._path(account_sid, recording_sid, "json"))
            self._raise_for_status(resp, "metadata")
            body = resp.json()
            duration = body.get("duration")
            channels = body.get("channels")
            return RecordingMetadata(
                sid=body.get("sid", recording_sid),
                call_sid=body.get("call_sid"),
                status=body.get("status", "unknown"),
                duration=int(duration) if duration not in (None, "") else None,
                channels=int(channels) if channels not in (None, "") else None,
            )

        return self._with_retries(_do, "metadata")

    def ensure_completed(self, account_sid: str, recording_sid: str) -> RecordingMetadata:
        meta = self.fetch_metadata(account_sid, recording_sid)
        if meta.status in ("in-progress", "processing", "paused", "stopped"):
            raise RecordingNotReady(f"recording status is {meta.status}")
        if meta.status != "completed":
            raise RecordingUnavailable(f"recording status is {meta.status}", code="recording_status")
        if meta.duration is not None and meta.duration > self.settings.audio_max_duration_seconds:
            raise InvalidAudio("recording longer than the configured maximum", code="audio_too_long")
        return meta

    def download(self, account_sid: str, recording_sid: str) -> DownloadedAudio:
        ext = self.settings.twilio_media_format
        max_bytes = self.settings.audio_max_bytes

        def _do():
            with self._client.stream("GET", self._path(account_sid, recording_sid, ext)) as resp:
                self._raise_for_status(resp, "media")
                content_type = resp.headers.get("content-type", "").split(";")[0].strip().lower()
                if content_type not in ALLOWED_CONTENT_TYPES[ext]:
                    raise InvalidAudio(f"unexpected content type {content_type!r}", code="bad_content_type")
                declared = resp.headers.get("content-length")
                if declared and declared.isdigit() and int(declared) > max_bytes:
                    raise InvalidAudio("audio larger than the configured maximum", code="audio_too_large")
                chunks, total = [], 0
                for chunk in resp.iter_bytes():
                    total += len(chunk)
                    if total > max_bytes:
                        raise InvalidAudio("audio larger than the configured maximum", code="audio_too_large")
                    chunks.append(chunk)
                if declared and declared.isdigit() and int(declared) != total:
                    raise TransientError("truncated download", code="truncated_download")
            data = b"".join(chunks)
            if not looks_like_audio(data, ext):
                raise InvalidAudio("file is not a valid audio stream", code="corrupted_audio")
            return DownloadedAudio(
                data=data, content_type=content_type, sha256=hashlib.sha256(data).hexdigest(), extension=ext
            )

        return self._with_retries(_do, "media")

    def delete_recording(self, account_sid: str, recording_sid: str) -> None:
        resp = self._client.delete(self._path(account_sid, recording_sid, "json"))
        if resp.status_code not in (204, 404):
            self._raise_for_status(resp, "delete")
