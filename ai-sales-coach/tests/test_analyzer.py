import re

import pytest
from conftest import SAMPLES, load_sample

from sales_coach.analysis.analyzer import analyze, verify_report
from sales_coach.transcription import parse_text

ALL = sorted(p.name for p in SAMPLES.glob("appel_*.txt"))


@pytest.mark.parametrize("name", ALL)
def test_every_citation_is_real(name):
    t = load_sample(name)
    r = analyze(t)
    assert verify_report(r, t) == []
    for f in r.findings:
        # Une erreur cite toujours une phrase du COMMERCIAL, présente mot pour mot.
        assert f.evidence.speaker == "COMMERCIAL"
        assert f.evidence.quote in t.utterances[f.evidence.utterance_index].text
        assert f.why_wrong and f.should_understand and f.should_say and f.better_phrasing


@pytest.mark.parametrize("name", ALL)
def test_report_structure_and_no_invented_prices(name):
    r = analyze(load_sample(name))
    assert 0 <= r.total_score <= 100
    assert len(r.criteria) == 7 and sum(c.max_points for c in r.criteria) == 100
    assert len(r.improvement_plan) == 3
    blob = str(r.to_dict())
    assert not re.search(r"\d+\s?(€|euros?)\b", blob), "aucun tarif ne doit être inventé"


def test_bad_call_detects_rapid_acceptance():
    r = analyze(load_sample("appel_01_budget_acceptation_rapide.txt"))
    codes = {f.code for f in r.findings}
    assert {"ACCEPTATION_RAPIDE", "QUESTION_ORIENTEE_NEGATIVE", "PAS_DE_PROPOSITION"} <= codes
    assert r.total_score < 30
    assert "Problème de budget" in r.situations
    assert any(m.code.startswith("budget:") for m in r.missed_opportunities)


def test_excellent_call_scores_high():
    r = analyze(load_sample("appel_02_autre_region_excellent.txt"))
    assert r.total_score >= 80
    assert not [f for f in r.findings if f.severity == 3]
    assert r.retention_potential == "Élevé"


def test_pressure_detected():
    r = analyze(load_sample("appel_04_insatisfait_pression.txt"))
    assert any(f.code == "PRESSION" and "Calmez-vous" in f.evidence.quote for f in r.findings)
    assert r.retention_potential == "Faible"


def test_ranking_matches_expert_expectation():
    s = {n: analyze(load_sample(n)).total_score for n in ALL}
    assert s["appel_02_autre_region_excellent.txt"] > s["appel_05_etranger_definitif.txt"] > s["appel_03_deja_equipe_moyen.txt"]
    assert s["appel_03_deja_equipe_moyen.txt"] > s["appel_01_budget_acceptation_rapide.txt"]


def test_non_observable_criterion_is_not_scored():
    t = parse_text("COMMERCIAL : Bonjour, je suis Paul du service clients.\nCLIENT : Bonjour, je voulais une information sur mon application.\nCOMMERCIAL : Bien sûr. Bonne journée.")
    r = analyze(t)
    crit = {c.key: c for c in r.criteria}
    assert not crit["objections"].evaluated and not crit["raisons"].evaluated
    assert any("non évaluable" in w for w in r.warnings)


def test_requires_both_speakers():
    with pytest.raises(ValueError):
        analyze(parse_text("CLIENT : Bonjour"))


def test_timestamps_in_evidence():
    r = analyze(load_sample("appel_01_budget_acceptation_rapide.txt"))
    assert all(f.evidence.timestamp for f in r.findings)
