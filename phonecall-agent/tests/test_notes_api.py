"""Notes API used by the desktop app (no Twilio)."""

import hashlib

import pytest

TOKEN = "pcn_test-token-0123456789"


@pytest.fixture
def api(env, monkeypatch, container):
    container.settings.note_api_tokens_sha256 = hashlib.sha256(TOKEN.encode()).hexdigest()
    container.settings.note_api_rate_per_minute = 5
    from fastapi.testclient import TestClient

    from phonecall_agent.web.app import create_app

    return TestClient(create_app(container), base_url="https://agent.example.test")


def body(lines, **kw):
    from phonecall_agent.demo_data import load_transcript_fixture

    if isinstance(lines, str):
        segs = load_transcript_fixture(lines)["segments"]
        lines = [{"start": s["start"], "end": s["end"], "speaker": {"customer": "remote"}.get(s["speaker"], s["speaker"]),
                  "text": s["text"], "uncertain": False} for s in segs]
    return {"segments": lines, "speaker_labels": True, "duration_s": 60, **kw}


def auth(token=TOKEN):
    return {"Authorization": f"Bearer {token}"}


def test_requires_valid_token(api):
    assert api.post("/api/v1/notes", json=body("demenagement")).status_code == 401
    assert api.post("/api/v1/notes", json=body("demenagement"), headers=auth("pcn_wrong")).status_code == 401


def test_generates_free_text_note_with_sections(api):
    r = api.post("/api/v1/notes", json=body("demenagement"), headers=auth())
    assert r.status_code == 200, r.text
    data = r.json()
    assert "formulaire" in data["note_text"] and not data["note_text"].lstrip().startswith("{")
    assert data["category"] == "demenagement"
    assert data["structured"]["solutions_proposed"] and data["structured"]["outcome"]
    assert data["quality"]["needs_review"] is True
    assert data["prompt_version"] == "2026-10-v2"
    assert not [f for f in data["quality"]["flags"] if f["severity"] == "blocking"]


def test_closest_scenario_is_used_by_the_simulation(api):
    data = api.post("/api/v1/notes", json=body("resiliation_retention"), headers=auth()).json()
    assert data["category"] == "retention"


def test_empty_transcript_does_not_call_the_ai(api, container):
    r = api.post("/api/v1/notes", json=body([{"text": "Allô ?", "speaker": "remote"}]), headers=auth())
    assert r.status_code == 200 and r.json()["no_usable_content"] is True
    assert container.generator.calls == 0


def test_idempotent_retries(api, container):
    b = body("demenagement", client_request_id="req-12345678")
    first = api.post("/api/v1/notes", json=b, headers=auth()).json()
    second = api.post("/api/v1/notes", json=b, headers=auth()).json()
    assert first == second and container.generator.calls == 1


def test_rate_limit(api):
    b = body([{"text": "Allô ?"}])
    codes = [api.post("/api/v1/notes", json=b, headers=auth()).status_code for _ in range(6)]
    assert codes[-1] == 429


def test_strict_input(api):
    assert api.post("/api/v1/notes", json={"segments": [{"text": "x", "phone": "+33600000000"}]}, headers=auth()).status_code == 422
    assert api.post("/api/v1/notes", json={"segments": [{"text": "x" * 6000}]}, headers=auth()).status_code == 422


def test_generation_outage_is_retryable_error(api, container):
    container.generator.fail_next = 5
    assert api.post("/api/v1/notes", json=body("demenagement"), headers=auth()).status_code == 503


def test_invalid_ai_response_gives_502(api, container):
    container.generator.default = "invalid_json"
    from phonecall_agent.generation import simulated

    container.generator.mapping = {}
    orig = simulated._closest_fixture
    simulated._closest_fixture = lambda t, d: "invalid_json"
    try:
        assert api.post("/api/v1/notes", json=body("demenagement"), headers=auth()).status_code == 502
    finally:
        simulated._closest_fixture = orig


def test_no_content_logged(api, caplog):
    import logging

    with caplog.at_level(logging.DEBUG):
        api.post("/api/v1/notes", json=body("demenagement"), headers=auth())
    assert "déménage" not in caplog.text and "formulaire" not in caplog.text


def test_prompt_file_is_versioned_and_overridable(tmp_path, container):
    from phonecall_agent.generation.prompt import build_system_prompt, prompt_version

    assert prompt_version(container.business) == "2026-10-v2"
    sp = build_system_prompt(container.business)
    assert "{{" not in sp and "demenagement : Déménagement" in sp and "2000 caractères" in sp
    custom = tmp_path / "p.md"
    custom.write_text("{#- version: test-9 -#}\nPrompt {{ max_chars }}", encoding="utf-8")
    container.business.report.prompt_file = str(custom)
    assert prompt_version(container.business) == "test-9"
    assert build_system_prompt(container.business) == "Prompt 2000"
    bad = tmp_path / "bad.md"
    bad.write_text("no header", encoding="utf-8")
    container.business.report.prompt_file = str(bad)
    with pytest.raises(ValueError):
        prompt_version(container.business)


def test_subjective_wording_flagged(container):
    from phonecall_agent.demo_data import load_ai_response_fixture, load_transcript_fixture
    from phonecall_agent.generation.base import parse_structured
    from phonecall_agent.quality import ReportValidator
    from phonecall_agent.transcription.base import TranscriptResult, normalise

    t = normalise(TranscriptResult.from_dict(load_transcript_fixture("demenagement")))
    r = parse_structured(load_ai_response_fixture("demenagement"))
    res = ReportValidator(container.business).validate(r, r.phone_call_text + " Client agressif.", t)
    assert "subjective_wording" in {f.code for f in res.flags}
