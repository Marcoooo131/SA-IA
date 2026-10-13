import json

import pytest

from phonecall_agent.config import load_business_config
from phonecall_agent.demo_data import load_ai_response_fixture, load_transcript_fixture
from phonecall_agent.errors import InvalidAIResponse
from phonecall_agent.generation.base import parse_structured, render_text
from phonecall_agent.quality import ReportValidator
from phonecall_agent.transcription.base import TranscriptResult, normalise


@pytest.fixture
def business():
    return load_business_config("config/business.example.yaml")


def load(transcript: str, ai: str):
    t = normalise(TranscriptResult.from_dict(load_transcript_fixture(transcript)))
    r = parse_structured(load_ai_response_fixture(ai))
    return t, r


def codes(result, severity=None):
    return {f.code for f in result.flags if severity is None or f.severity == severity}


def test_good_reports_have_no_blocking_flag(business):
    for name in ("demenagement", "resiliation_retention"):
        t, r = load(name, name)
        res = ReportValidator(business).validate(r, r.phone_call_text, t)
        assert not res.blocking, (name, res.flags)
        assert res.score == 100


def test_review_required_while_config_not_validated(business):
    t, r = load("demenagement", "demenagement")
    assert ReportValidator(business).validate(r, r.phone_call_text, t).needs_review
    business.validated = True
    business.quality.always_human_review = False
    assert not ReportValidator(business).validate(r, r.phone_call_text, t).needs_review


def test_hallucinations_detected(business):
    t, r = load("demenagement", "demenagement_hallucination")
    res = ReportValidator(business).validate(r, r.phone_call_text, t)
    assert {"possible_action_as_done", "done_and_todo", "unsupported_number"} <= codes(res, "blocking")
    assert "internal_reference_in_text" in codes(res)
    assert res.needs_review


def test_empty_text_blocked(business):
    t, r = load("demenagement", "demenagement")
    assert "empty_text" in codes(ReportValidator(business).validate(r, "   ", t), "blocking")


def test_too_long_blocked(business):
    t, r = load("demenagement", "demenagement")
    res = ReportValidator(business).validate(r, "x " * 1500, t)
    assert "too_long" in codes(res, "blocking")


def test_unknown_evidence_and_category(business):
    t, r = load("demenagement", "demenagement")
    r.customer_statements[0].evidence = ["S99"]
    r.category = "invented"
    res = ReportValidator(business).validate(r, r.phone_call_text, t)
    assert {"unknown_evidence", "unknown_category"} <= codes(res, "blocking")


def test_missing_evidence(business):
    t, r = load("demenagement", "demenagement")
    r.actions_done[0].evidence = []
    assert "missing_evidence" in codes(ReportValidator(business).validate(r, r.phone_call_text, t), "blocking")


def test_assertion_from_uncertain_segment(business):
    t, r = load("incomplet", "incomplet")
    r.advisor_information[0].to_verify = False
    res = ReportValidator(business).validate(r, r.phone_call_text, t)
    assert "asserted_from_uncertain" in codes(res, "blocking")


def test_no_content_contradictions(business):
    t, r = load("demenagement", "sans_contenu")
    assert "no_content_contradiction" in codes(ReportValidator(business).validate(r, r.phone_call_text, t), "blocking")
    t, r = load("sans_contenu", "demenagement")
    assert "content_from_empty_call" in codes(ReportValidator(business).validate(r, r.phone_call_text, t), "blocking")


def test_unsupported_written_quantity(business):
    t, r = load("resiliation_retention", "resiliation_retention")
    text = r.phone_call_text.replace("deux mois", "trois mois")
    assert "unsupported_number" in codes(ReportValidator(business).validate(r, text, t), "blocking")


def test_personal_data_warning(business):
    t, r = load("demenagement", "demenagement")
    res = ReportValidator(business).validate(r, r.phone_call_text + " Joignable au 06 12 34 56 78.", t)
    assert "personal_data_in_text" in codes(res)


def test_speakers_unknown_warning(business):
    t, r = load("demenagement", "demenagement")
    t.speaker_labels = False
    assert "speakers_unknown" in codes(ReportValidator(business).validate(r, r.phone_call_text, t), "warning")


def test_score_is_deterministic_rule_sum(business):
    t, r = load("incomplet", "incomplet")
    res = ReportValidator(business).validate(r, r.phone_call_text, t)
    assert res.score == 100 - 10 * len([f for f in res.flags if f.severity == "warning"]) - 40 * len(res.blocking)


@pytest.mark.parametrize("raw", ["", "not json", '{"category": 1}', json.dumps([1, 2]), '{"a":'])
def test_invalid_ai_responses_rejected(raw):
    with pytest.raises(InvalidAIResponse):
        parse_structured(raw)


def test_company_template_rendering():
    r = parse_structured(load_ai_response_fixture("demenagement"))
    tpl = "Motif : {{ r.category }}\n{% for a in r.actions_todo %}- {{ a.text }}\n{% endfor %}"
    out = render_text(r, tpl)
    assert out.startswith("Motif : demenagement") and out.count("- ") == 2


def test_template_sandboxed():
    from jinja2.exceptions import SecurityError

    r = parse_structured(load_ai_response_fixture("demenagement"))
    with pytest.raises(SecurityError):
        render_text(r, "{{ r.__class__.__mro__[1].__subclasses__() }}")
