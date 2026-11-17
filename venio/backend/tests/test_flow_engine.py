import pytest
from pydantic import ValidationError

from venio.flows.engine import AnswerError, resolve_service_key, summarize, validate_answer, walk
from venio.flows.schema import FlowDefinition
from venio.flows.templates import TEMPLATES, template_flow


@pytest.mark.parametrize("code", list(TEMPLATES))
def test_templates_are_valid(code):
    defn = template_flow(code)
    assert defn.steps and walk(defn, {}).current == defn.steps[0].id


def test_renovation_branches_and_skips_irrelevant_questions():
    d = template_flow("renovation")
    st = walk(d, {"projet": "menuiseries", "menuiseries_type": ["fenetres"], "menuiseries_nombre": 4})
    assert st.visited == ["projet", "menuiseries_type", "menuiseries_nombre"]
    assert st.current == "logement"
    assert "surface" not in st.visited  # question inutile évitée


def test_service_depends_on_answers():
    d = template_flow("renovation")
    assert resolve_service_key(d, {"delai": "je_me_renseigne"}) == "appel_decouverte"
    assert resolve_service_key(d, {"delai": "au_plus_vite"}) == "visite_technique"
    m = template_flow("demenagement")
    assert resolve_service_key(m, {"logement_depart": "t2"}) == "visio_estimation"
    assert resolve_service_key(m, {"logement_depart": "maison"}) == "visite_estimation"


def test_numeric_route_condition():
    d = template_flow("demenagement")
    base = {"client": "particulier", "logement_depart": "t3", "surface": 60}
    assert walk(d, {**base, "etage_depart": 0}).current == "distance"
    assert walk(d, {**base, "etage_depart": 3}).current == "ascenseur_depart"


def test_optional_step_skipped_with_none():
    d = template_flow("generique")
    answers = {"besoin": "devis", "description": "x", "delai": "au_plus_vite", "photos": None}
    assert walk(d, answers).current == "precisions"
    answers["precisions"] = None
    assert walk(d, answers).current is None


def test_validation():
    d = template_flow("renovation")
    with pytest.raises(AnswerError):
        validate_answer(d.step("projet"), "piscine")
    with pytest.raises(AnswerError):
        validate_answer(d.step("surface"), 999)
    with pytest.raises(AnswerError):
        validate_answer(d.step("projet"), None)
    assert validate_answer(d.step("surface"), "12") == 12
    assert validate_answer(d.step("sdb_travaux"), ["carrelage", "baignoire", "carrelage"]) == ["baignoire", "carrelage"]
    assert validate_answer(d.step("budget"), None) is None  # facultative


def test_summary_only_contains_followed_path():
    d = template_flow("renovation")
    answers = {"projet": "cuisine", "cuisine_travaux": "pose_seule", "sdb_travaux": ["baignoire"], "surface": 9}
    steps = [i["step"] for i in summarize(d, answers)]
    assert steps == ["projet", "cuisine_travaux", "surface"]


def _flow(steps, rules=None):
    return {"steps": steps, "service_rules": rules or [{"service": "rdv"}]}


def test_rejects_cycles_unknown_targets_and_bad_rules():
    a = {"id": "a", "type": "text", "title": "A", "next": "b"}
    b = {"id": "b", "type": "text", "title": "B", "next": "a"}
    with pytest.raises(ValidationError, match="boucle"):
        FlowDefinition.model_validate(_flow([a, b]))
    with pytest.raises(ValidationError, match="destination inconnue"):
        FlowDefinition.model_validate(_flow([{**a, "next": "zz"}]))
    with pytest.raises(ValidationError, match="étape inconnue"):
        FlowDefinition.model_validate(_flow([{**a, "next": None}], [
            {"when": {"field": "nope", "op": "eq", "value": 1}, "service": "x"}, {"service": "rdv"}]))
    with pytest.raises(ValidationError, match="par défaut"):
        FlowDefinition.model_validate(_flow([{**a, "next": None}], [
            {"when": {"field": "a", "op": "answered"}, "service": "x"}]))
    with pytest.raises(ValidationError, match="2 choix"):
        FlowDefinition.model_validate(_flow([{"id": "c", "type": "single_choice", "title": "C",
                                              "options": [{"value": "x", "label": "X"}]}]))
