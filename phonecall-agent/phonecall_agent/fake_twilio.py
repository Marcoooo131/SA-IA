"""SIMULATION — a fake Twilio REST API (httpx MockTransport) for tests and the local demo.

No network call is made and no real recording is involved.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

import httpx

FAKE_MP3 = b"ID3\x04\x00\x00\x00\x00\x00\x00" + b"\xff\xfb\x90\x00" * 256  # header-only, not real audio


@dataclass
class FakeRecording:
    status: str = "completed"
    duration: int = 60
    channels: int = 2
    audio: bytes = FAKE_MP3
    content_type: str = "audio/mpeg"
    media_status: int = 200
    fail_media_times: int = 0  # number of 503 responses before success
    timeout_media_times: int = 0


@dataclass
class FakeTwilio:
    account_sid: str
    recordings: dict[str, FakeRecording] = field(default_factory=dict)
    media_requests: int = 0
    deleted: list[str] = field(default_factory=list)
    seen_auth: list[str | None] = field(default_factory=list)

    _path = re.compile(r"^/2010-04-01/Accounts/(AC\w+)/Recordings/(RE\w+)\.(json|mp3|wav)$")

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.seen_auth.append(request.headers.get("authorization"))
        m = self._path.match(request.url.path)
        if not m or m.group(1) != self.account_sid:
            return httpx.Response(404, json={"code": 20404})
        sid, ext = m.group(2), m.group(3)
        rec = self.recordings.get(sid)
        if rec is None:
            return httpx.Response(404, json={"code": 20404})
        if request.method == "DELETE":
            self.deleted.append(sid)
            self.recordings.pop(sid)
            return httpx.Response(204)
        if ext == "json":
            return httpx.Response(
                200,
                json={"sid": sid, "status": rec.status, "duration": str(rec.duration), "channels": rec.channels,
                      "call_sid": "CA" + "0" * 32},
            )
        self.media_requests += 1
        if rec.timeout_media_times > 0:
            rec.timeout_media_times -= 1
            raise httpx.ReadTimeout("simulated timeout", request=request)
        if rec.fail_media_times > 0:
            rec.fail_media_times -= 1
            return httpx.Response(503)
        if rec.media_status != 200:
            return httpx.Response(rec.media_status)
        return httpx.Response(200, content=rec.audio, headers={"content-type": rec.content_type})

    def transport(self) -> httpx.MockTransport:
        return httpx.MockTransport(self.handler)
