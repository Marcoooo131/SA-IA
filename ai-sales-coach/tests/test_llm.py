import json

import pytest
from conftest import load_sample

from sales_coach.analysis.analyzer import analyze
from sales_coach.analysis.llm_analyzer import enrich_with_llm, locate_quote
from sales_coach.config import get_settings
from sales_coach.llm.factory import LLM, ExternalApiBlocked, get_llm, parse_json, provider_is_external


class FakeLLM(LLM):
    name, model, external = "fake", "test", False

    def __init__(self, payload):
        self.payload = payload
        self.last = None

    def chat(self, messages, temperature=0.3, max_tokens=2000, json_mode=False):
        self.last = messages
        return "```json\n" + json.dumps(self.payload) + "\n```"


def test_provider_external_detection():
    assert not provider_is_external("none")
    assert not provider_is_external("ollama", "http://localhost:11434")
    assert provider_is_external("ollama", "http://ollama.example.com:11434")
    assert not provider_is_external("openai_compatible", "http://127.0.0.1:1234/v1")
    assert provider_is_external("openai_compatible", "https://api.openai.com/v1")
    assert provider_is_external("anthropic")


def test_external_provider_blocked_by_default(monkeypatch):
    monkeypatch.setenv("ASC_LLM_PROVIDER", "anthropic")
    monkeypatch.setenv("ASC_LLM_API_KEY", "dummy")
    with pytest.raises(ExternalApiBlocked):
        get_llm(get_settings(reload=True))


def test_none_provider_returns_none():
    assert get_llm(get_settings()) is None


def test_parse_json_with_fences():
    assert parse_json('Voici : ```json {"a": 1} ```') == {"a": 1}


def test_llm_findings_are_verified_and_inventions_rejected():
    t = load_sample("appel_06_proprietaire_moyen.txt")
    r = analyze(t)
    n_before = len(r.findings)
    llm = FakeLLM({
        "findings": [
            {"utterance": 3, "quote": "C'est une maison ou un appartement que vous quittez ?", "criterion": "raisons", "title": "Question sur l'ancien logement",
             "why_wrong": "x", "should_understand": "y", "should_say": "z", "better_phrasing": "w", "consequence": "c", "severity": 2},
            {"utterance": 3, "quote": "Je vous offre 50 % de remise", "criterion": "proposition", "title": "Invention",
             "why_wrong": "x", "should_understand": "y", "should_say": "z", "better_phrasing": "w", "severity": 3},
            {"utterance": 2, "quote": "on a acheté une maison", "criterion": "raisons", "title": "Citation du client attribuée au commercial",
             "why_wrong": "x", "should_understand": "y", "should_say": "z", "better_phrasing": "w", "severity": 2},
        ],
        "missed_opportunities": [{"utterance": 4, "quote": "c'est une maison avec un garage", "title": "Garage", "description": "d", "suggested_question": "q"}],
        "coach_summary": "Synthèse.",
    })
    r = enrich_with_llm(r, t, llm)
    added = [f for f in r.findings if f.origin == "ia (vérifiée)"]
    assert len(added) == 1 and added[0].evidence.quote == "C'est une maison ou un appartement que vous quittez ?"
    assert len(r.findings) == n_before + 1
    assert any("rejeté" in w for w in r.warnings)
    assert r.stats["coach_summary"] == "Synthèse."
    assert "IA" in r.engine
    # La transcription numérotée et la règle anti-invention sont bien dans le prompt.
    assert "#4 COMMERCIAL" in llm.last[1].content.replace("[00:10] ", "") or "#4" in llm.last[1].content
    assert "n'inventes jamais" in llm.last[0].content


def test_locate_quote_tolerates_whitespace_and_quotes():
    t = load_sample("appel_01_budget_acceptation_rapide.txt")
    ev = locate_quote(t, 7, "« Pas de souci,   je lance la résiliation. »")
    assert ev is not None and ev.utterance_index == 6
    assert locate_quote(t, 7, "phrase inexistante") is None


def test_pipeline_refuses_external_without_authorization(monkeypatch):
    from sales_coach import services

    class Ext(FakeLLM):
        external = True

    monkeypatch.setattr(services, "get_llm", lambda s: Ext({"findings": []}))
    res = services.run_analysis(load_sample("appel_03_deja_equipe_moyen.txt"), use_llm=True, authorize_external=False, use_kb=False)
    assert res.report.engine == "règles"
    assert any("non autorisé" in w for w in res.report.warnings)
    res2 = services.run_analysis(load_sample("appel_03_deja_equipe_moyen.txt"), anonymize=False, use_llm=True, authorize_external=True, use_kb=False)
    assert res2.report.engine == "règles"
    assert any("anonymisation est obligatoire" in w for w in res2.report.warnings)
