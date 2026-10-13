"""Claude generator tested with a fake client (no network, no real call)."""

from types import SimpleNamespace

import pytest

from phonecall_agent.config import Settings, load_business_config
from phonecall_agent.demo_data import load_ai_response_fixture, load_transcript_fixture
from phonecall_agent.errors import GenerationFailed, InvalidAIResponse, PermanentError
from phonecall_agent.generation.anthropic_generator import AnthropicReportGenerator, estimate_cost
from phonecall_agent.generation.prompt import GenerationContext, build_user_message
from phonecall_agent.generation.schema import report_json_schema
from phonecall_agent.transcription.base import TranscriptResult, normalise


class FakeMessages:
    def __init__(self, response):
        self.response, self.kwargs = response, None

    def create(self, **kwargs):
        self.kwargs = kwargs
        return self.response


def fake_client(text: str, stop_reason: str = "end_turn"):
    response = SimpleNamespace(
        content=[SimpleNamespace(type="thinking", thinking=""), SimpleNamespace(type="text", text=text)],
        stop_reason=stop_reason,
        usage=SimpleNamespace(input_tokens=3000, output_tokens=800),
        model="claude-opus-5-5",
    )
    messages = FakeMessages(response)
    return SimpleNamespace(messages=messages, beta=SimpleNamespace(messages=messages)), messages


@pytest.fixture
def ctx():
    return GenerationContext(
        business=load_business_config("config/business.example.yaml"),
        metadata={"_recording_sid": "RE123", "durée de l'enregistrement (s)": 60},
    )


@pytest.fixture
def transcript():
    return normalise(TranscriptResult.from_dict(load_transcript_fixture("demenagement")))


def test_generates_and_estimates_cost(env, ctx, transcript):
    client, messages = fake_client(load_ai_response_fixture("demenagement"))
    gen = AnthropicReportGenerator(Settings(), client=client).generate(transcript, ctx)
    assert gen.structured.category == "demenagement"
    assert gen.cost_usd == estimate_cost("claude-opus-5-5", 3000, 800) == pytest.approx(0.028)
    kw = messages.kwargs
    assert kw["model"] == "claude-opus-5-5"
    assert kw["output_config"]["format"]["type"] == "json_schema"
    assert kw["fallbacks"] == "default" and kw["betas"] == ["server-side-fallback-2026-07-01"]
    assert "thinking" not in kw  # always-on adaptive thinking on this model; effort is the control
    assert "RE123" not in kw["messages"][0]["content"]  # technical ids are not sent to the model


def test_refusal_is_permanent(env, ctx, transcript):
    client, _ = fake_client("", stop_reason="refusal")
    with pytest.raises(PermanentError):
        AnthropicReportGenerator(Settings(), client=client).generate(transcript, ctx)


def test_truncation_is_retryable(env, ctx, transcript):
    client, _ = fake_client('{"a"', stop_reason="max_tokens")
    with pytest.raises(GenerationFailed):
        AnthropicReportGenerator(Settings(), client=client).generate(transcript, ctx)


def test_invalid_json_rejected(env, ctx, transcript):
    client, _ = fake_client("Voici le compte rendu : ...")
    with pytest.raises(InvalidAIResponse):
        AnthropicReportGenerator(Settings(), client=client).generate(transcript, ctx)


def test_schema_is_strict():
    def walk(node):
        if isinstance(node, dict):
            if node.get("type") == "object" and "properties" in node:
                assert node["additionalProperties"] is False
                assert set(node["required"]) == set(node["properties"])
            for v in node.values():
                walk(v)
        elif isinstance(node, list):
            for v in node:
                walk(v)

    walk(report_json_schema())


def test_prompt_marks_uncertain_segments(ctx):
    t = normalise(TranscriptResult.from_dict(load_transcript_fixture("incomplet")))
    msg = build_user_message(t, ctx)
    assert "[S4] [00:14] [client] [incertain] [inaudible]" in msg
