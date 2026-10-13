import base64

import httpx
import pytest

from conftest import ACCOUNT_SID, add_recording, get_call, post_webhook, recording_sid, webhook_params
from phonecall_agent.errors import InvalidAudio, RecordingNotReady, RecordingUnavailable, TransientError
from phonecall_agent.fake_twilio import FAKE_MP3, FakeRecording, FakeTwilio
from phonecall_agent.models import CallStatus
from phonecall_agent.twilio.recordings import TwilioRecordingClient, looks_like_audio


def make_client(settings, fake, **overrides):
    for k, v in overrides.items():
        setattr(settings, k, v)
    return TwilioRecordingClient(settings, transport=fake.transport(), sleep=lambda s: None)


@pytest.fixture
def settings(env):
    from phonecall_agent.config import Settings

    return Settings()


def test_download_uses_basic_auth_server_side(settings):
    fake = FakeTwilio(ACCOUNT_SID, {recording_sid(1): FakeRecording()})
    audio = make_client(settings, fake).download(ACCOUNT_SID, recording_sid(1))
    assert audio.data == FAKE_MP3 and audio.extension == "mp3"
    expected = "Basic " + base64.b64encode(f"{ACCOUNT_SID}:{settings.twilio_auth_token.get_secret_value()}".encode()).decode()
    assert fake.seen_auth[-1] == expected


def test_api_key_preferred_when_configured(settings):
    fake = FakeTwilio(ACCOUNT_SID, {recording_sid(1): FakeRecording()})
    client = make_client(settings, fake, twilio_api_key_sid="SK" + "1" * 32)
    client.download(ACCOUNT_SID, recording_sid(1))
    assert base64.b64decode(fake.seen_auth[-1].split()[1]).decode().startswith("SK")


def test_recording_not_completed_is_retryable(settings):
    fake = FakeTwilio(ACCOUNT_SID, {recording_sid(1): FakeRecording(status="processing")})
    with pytest.raises(RecordingNotReady):
        make_client(settings, fake).ensure_completed(ACCOUNT_SID, recording_sid(1))


def test_recording_absent_is_permanent(settings):
    fake = FakeTwilio(ACCOUNT_SID, {recording_sid(1): FakeRecording(status="absent")})
    with pytest.raises(RecordingUnavailable):
        make_client(settings, fake).ensure_completed(ACCOUNT_SID, recording_sid(1))


def test_recording_deleted_404(settings):
    fake = FakeTwilio(ACCOUNT_SID, {})
    with pytest.raises(RecordingUnavailable):
        make_client(settings, fake).download(ACCOUNT_SID, recording_sid(1))


def test_transient_errors_are_retried(settings):
    fake = FakeTwilio(ACCOUNT_SID, {recording_sid(1): FakeRecording(fail_media_times=2, timeout_media_times=1)})
    audio = make_client(settings, fake, download_max_attempts=4).download(ACCOUNT_SID, recording_sid(1))
    assert audio.size == len(FAKE_MP3)
    assert fake.media_requests == 4


def test_transient_errors_exhausted(settings):
    fake = FakeTwilio(ACCOUNT_SID, {recording_sid(1): FakeRecording(fail_media_times=10)})
    with pytest.raises(TransientError):
        make_client(settings, fake, download_max_attempts=3).download(ACCOUNT_SID, recording_sid(1))
    assert fake.media_requests == 3


def test_size_limit(settings):
    fake = FakeTwilio(ACCOUNT_SID, {recording_sid(1): FakeRecording()})
    with pytest.raises(InvalidAudio, match="larger"):
        make_client(settings, fake, audio_max_bytes=100).download(ACCOUNT_SID, recording_sid(1))


def test_content_type_checked(settings):
    fake = FakeTwilio(ACCOUNT_SID, {recording_sid(1): FakeRecording(content_type="text/html")})
    with pytest.raises(InvalidAudio, match="content type"):
        make_client(settings, fake).download(ACCOUNT_SID, recording_sid(1))


def test_corrupted_audio_rejected(settings):
    fake = FakeTwilio(ACCOUNT_SID, {recording_sid(1): FakeRecording(audio=b"<html>error page</html>" * 3)})
    with pytest.raises(InvalidAudio, match="not a valid audio"):
        make_client(settings, fake).download(ACCOUNT_SID, recording_sid(1))


def test_magic_numbers():
    assert looks_like_audio(FAKE_MP3, "mp3")
    assert looks_like_audio(b"RIFF\x00\x00\x00\x00WAVEfmt ", "wav")
    assert not looks_like_audio(b"RIFF\x00\x00\x00\x00AVI LIST", "wav")
    assert not looks_like_audio(b"", "mp3")


def test_credentials_not_forwarded_on_cross_origin_redirect(settings):
    seen: list[tuple[str, str | None]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append((request.url.host, request.headers.get("authorization")))
        if request.url.host == "api.twilio.com":
            return httpx.Response(302, headers={"location": "https://storage.example.com/media.mp3"})
        return httpx.Response(200, content=FAKE_MP3, headers={"content-type": "audio/mpeg"})

    client = TwilioRecordingClient(settings, transport=httpx.MockTransport(handler), sleep=lambda s: None)
    client.download(ACCOUNT_SID, recording_sid(1))
    assert seen[0][1] is not None
    assert seen[1] == ("storage.example.com", None)


def test_pipeline_marks_absent_recording(client, container, fake_twilio):
    # Webhook says completed but the recording was deleted meanwhile.
    post_webhook(client, webhook_params(20))
    call = get_call(recording_sid(20))
    assert call.status == CallStatus.RECORDING_ABSENT
    assert call.errors and call.errors[-1].error_code == "recording_unavailable"


def test_pipeline_retries_download_errors(client, container, fake_twilio):
    add_recording(fake_twilio, container, 21, fail_media_times=5)
    container.settings.download_max_attempts = 2
    post_webhook(client, webhook_params(21))
    call = get_call(recording_sid(21))
    assert call.status == CallStatus.NEEDS_REVIEW  # recovered on a later job attempt
    assert {e.stage for e in call.errors} == {"download"}


def test_pipeline_corrupted_audio_fails_permanently(client, container, fake_twilio):
    add_recording(fake_twilio, container, 22, audio=b"not audio at all, really not")
    post_webhook(client, webhook_params(22))
    call = get_call(recording_sid(22))
    assert call.status == CallStatus.FAILED
    assert call.errors[-1].error_code == "corrupted_audio"
    assert len(call.errors) == 1  # permanent: no pointless retries


def test_too_short_recording_not_downloaded(client, container, fake_twilio):
    add_recording(fake_twilio, container, 23, duration=1)
    post_webhook(client, webhook_params(23))
    assert get_call(recording_sid(23)).status == CallStatus.NO_CONTENT
    assert fake_twilio.media_requests == 0
