"""Direct mode (key entered in the app): fake Claude client, no network, no real call."""

import json
from types import SimpleNamespace

import anthropic
import httpx
import pytest
from fastapi.testclient import TestClient

from phonecall_desktop import secrets_store
from phonecall_desktop.audio.devices import SyntheticFileBackend
from phonecall_desktop.audio.types import Channel
from phonecall_desktop.config import Environment, Settings
from phonecall_desktop.errors import AppError, ErrorCode
from phonecall_desktop.notes.business import business_config_path
from phonecall_desktop.notes.direct import DirectAINoteClient, validate_key_format
from phonecall_desktop.session import SessionController
from phonecall_desktop.stt.scripted import ScriptedRecognizer
from phonecall_desktop.synthetic import generate_wav
from phonecall_desktop.transcript.assembler import Segment
from phonecall_desktop.web.server import Hub, create_app

from call_scripts import MOVERS  # noqa: E402

from phonecall_desktop.notes.template import DEFAULT_TEMPLATE, load_template  # noqa: E402

GENERAL = DEFAULT_TEMPLATE.with_name("phone_call_template_general.yaml")
TEMPLATE = load_template(GENERAL)  # these tests use the 8-section template; the team format is tested below

KEY = "sk-ant-api03-" + "x" * 40
REQUEST = httpx.Request("POST", "https://api.anthropic.com/v1/messages")


class FakeMessages:
    def __init__(self, text=None, error=None):
        self.text, self.error, self.calls = text, error, []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        if self.error:
            raise self.error
        return SimpleNamespace(
            content=[SimpleNamespace(type="thinking", thinking=""), SimpleNamespace(type="text", text=self.text)],
            stop_reason="end_turn", usage=SimpleNamespace(input_tokens=3000, output_tokens=800), model="claude-opus-5-5",
        )


class FakeModels:
    def __init__(self, error=None):
        self.error, self.calls = error, []

    def retrieve(self, model):
        self.calls.append(model)
        if self.error:
            raise self.error
        return SimpleNamespace(id=model)


def fake_factory(messages=None, models=None):
    keys = []

    def factory(key):
        keys.append(key)
        return SimpleNamespace(messages=messages, beta=SimpleNamespace(messages=messages), models=models or FakeModels())

    factory.keys = keys
    return factory


def settings(**kw):
    return Settings(**{"environment": Environment.TEST, "audio_backend": "test-files", "recognizer": "scripted",
                       "notes_client": "anthropic", "note_template": GENERAL, **kw})


def conversation() -> list[Segment]:
    return [Segment(f"u{i}", Channel(ch), i * 5.0, i * 5.0 + 4, text, final=True) for i, (ch, text) in enumerate(MOVERS)]


def model_output(**fields) -> str:
    """What Claude returns: every field of the template (absent unless given)."""
    out = {f.id: {"status": "absent", "items": [], "reason": "", "evidence": []} for f in TEMPLATE.all_fields()}
    for fid, v in fields.items():
        out[fid] = {"status": "present", "items": [], "reason": "", "evidence": [], **v}
    return json.dumps({"direction": "entrant", "variant": "movers", "fields": out}, ensure_ascii=False)


GOOD_OUTPUT = model_output(
    demande={"items": ["Transférer l'alarme suite au déménagement du 15 mars"], "evidence": ["S3"]},
    nom={"items": ["Madame Durand"], "evidence": ["S2"]},
    date_heure={"items": ["01/01/2020 à 08:00"], "evidence": []},
    date_demenagement={"items": ["15 mars"], "evidence": ["S3"]},
    numero_wo={"status": "uncertain", "items": ["458213"], "reason": "référence entendue", "evidence": ["S8"]},
    actions_effectuees={"items": ["Audit programmé pour le 10 mars à 9 h"], "evidence": ["S15"]},
    actions_restantes={"items": ["Envoyer l'attestation de vente — responsable : client"], "evidence": ["S16", "S99"]},
    offre={"items": ["Un mois d'abonnement offert pour le transfert"], "evidence": ["S11"]},
    decision={"items": ["Accord du client : « D'accord, ça me va. »"], "evidence": ["S12"]},
    historique={"items": ["Non précisé"]},
)


def status_error(cls, code):
    return cls("error", response=httpx.Response(code, request=REQUEST), body=None)


def test_fills_the_template_from_the_whole_transcript():
    messages = FakeMessages(GOOD_OUTPUT)
    factory = fake_factory(messages)
    client = DirectAINoteClient(settings(agent_name="Julie M."), lambda: KEY, client_factory=factory)
    clock = 1_776_155_520.0  # data of the PC
    note = client.generate(conversation(), 95, "req-1", meta={"started_at": clock, "variant": "movers"})
    t = note.text
    assert t.startswith("COMPTE RENDU D'APPEL — Movers · Appel entrant")
    assert "Demande du client : Transférer l'alarme suite au déménagement du 15 mars" in t
    assert "Nom et prénom : À confirmer — entendu dans la conversation, non vérifié : Madame Durand" in t
    assert "Agent : Julie M. (paramètre du poste)" in t
    assert "01/01/2020" not in t and "(horloge du poste)" in t  # the date comes from the PC, never from the model
    assert "Numéro WO : À confirmer — référence entendue : 458213" in t
    assert "Historique utile : Aucune information notifiée" in t  # vague wording normalised
    assert "Situation actuelle : Aucune information notifiée" in t
    codes = {f["code"] for f in note.flags}
    assert "preuve_inconnue" in codes  # S99 does not exist
    assert not [f for f in note.flags if f["severity"] == "blocking"], note.flags
    assert note.model == "claude-opus-5-5" and note.cost_usd > 0 and note.prompt_version == TEMPLATE.version
    assert factory.keys == [KEY]
    sent = messages.calls[0]
    assert sent["model"] == "claude-opus-5-5" and sent["output_config"]["effort"] == "medium"
    assert sent["fallbacks"] == "default" and sent["betas"] == ["server-side-fallback-2026-07-01"]
    schema = sent["output_config"]["format"]["schema"]
    assert set(schema["properties"]["fields"]["required"]) == {f.id for f in TEMPLATE.all_fields()}
    assert "Aucune information notifiée" in sent["system"] and "Numéro WO" in sent["system"]
    user = sent["messages"][0]["content"]
    assert "[S1] [00:00] [conseiller]" in user and "[interlocuteur]" in user and "12 rue des Lilas" in user
    assert "horloge du poste" in user and "Julie M." in user and "Movers" in user
    assert KEY not in json.dumps(sent, ensure_ascii=False, default=str)


def test_model_claims_are_checked():
    output = model_output(
        actions_effectuees={"items": ["Je vous propose un rendez-vous"], "evidence": ["S11"]},
        solutions={"items": ["Remise de 30 euros"], "evidence": ["S11"]},
    )
    note = DirectAINoteClient(settings(), lambda: KEY, client_factory=fake_factory(FakeMessages(output))).generate(
        conversation(), 95, "req-2")
    codes = {f["code"] for f in note.flags}
    assert {"action_non_effectuee", "chiffre_non_trouve", "pas_de_suite"} <= codes


def test_short_transcript_does_not_call_the_ai():
    messages = FakeMessages("{}")
    client = DirectAINoteClient(settings(), lambda: KEY, client_factory=fake_factory(messages))
    seg = Segment("u1", Channel.MIC, 0.0, 1.0, "Allô ?", final=True)
    note = client.generate([seg], 3, "req-2")
    assert note.no_usable_content and messages.calls == []


def test_missing_key_is_a_retryable_user_error():
    client = DirectAINoteClient(settings(), lambda: None, client_factory=fake_factory(FakeMessages("{}")))
    with pytest.raises(AppError) as err:
        client.generate(conversation(), 95, "req-3")
    assert err.value.code == ErrorCode.AI_KEY_MISSING and err.value.retryable


@pytest.mark.parametrize("error, code", [
    (status_error(anthropic.AuthenticationError, 401), ErrorCode.AI_KEY_INVALID),
    (status_error(anthropic.PermissionDeniedError, 403), ErrorCode.AI_KEY_INVALID),
    (anthropic.APIConnectionError(request=REQUEST), ErrorCode.NOTE_NETWORK),
    (status_error(anthropic.RateLimitError, 429), ErrorCode.NOTE_SERVER),
    (status_error(anthropic.BadRequestError, 400), ErrorCode.NOTE_REJECTED),
])
def test_api_errors_are_mapped(error, code):
    client = DirectAINoteClient(settings(), lambda: KEY, client_factory=fake_factory(FakeMessages(error=error)))
    with pytest.raises(AppError) as err:
        client.generate(conversation(), 95, "req-4")
    assert err.value.code == code


def test_invalid_ai_output_is_retried_then_reported():
    messages = FakeMessages('{"direction": "entrant", "fields": ')
    client = DirectAINoteClient(settings(), lambda: KEY, client_factory=fake_factory(messages))
    with pytest.raises(AppError) as err:
        client.generate(conversation(), 95, "req-5")
    assert err.value.code == ErrorCode.NOTE_SERVER and err.value.retryable and len(messages.calls) == 2


def test_new_key_rebuilds_the_client():
    keys = iter([KEY, KEY, KEY + "b"])
    factory = fake_factory(FakeMessages(GOOD_OUTPUT))
    client = DirectAINoteClient(settings(), lambda: next(keys), client_factory=factory)
    for i in range(3):
        client.generate(conversation(), 95, f"req-{i}")
    assert factory.keys == [KEY, KEY + "b"]


def test_describe_for_selftest():
    info = DirectAINoteClient(settings(), lambda: None, client_factory=fake_factory()).describe()
    assert info["template"] == TEMPLATE.version and info["prompt_chars"] > 1000 and info["categories"] > 0
    assert info["schema_fields"] == info["fields"] == len(TEMPLATE.all_fields())
    assert info["key"] == "absent" and info["model"] == "claude-opus-5-5"


def test_check_key():
    models = FakeModels()
    client = DirectAINoteClient(settings(), lambda: None, client_factory=fake_factory(models=models))
    client.check_key(KEY)
    assert models.calls == ["claude-opus-5-5"]
    bad = DirectAINoteClient(settings(), lambda: None,
                             client_factory=fake_factory(models=FakeModels(status_error(anthropic.AuthenticationError, 401))))
    with pytest.raises(AppError) as err:
        bad.check_key(KEY)
    assert err.value.code == ErrorCode.AI_KEY_INVALID


@pytest.mark.parametrize("key", ["", "abc", "sk-ant-court", "sk-ant-api03-" + "x" * 20 + " y", "sk-" + "x" * 40])
def test_key_format_is_validated(key):
    with pytest.raises(AppError):
        validate_key_format(key)
    assert validate_key_format(f"  {KEY}\n") == KEY


def test_business_config_found_in_sources(tmp_path):
    assert business_config_path(settings()).name == "business.example.yaml"
    own = tmp_path / "metier.yaml"
    own.write_text("version: x\n", encoding="utf-8")
    assert business_config_path(settings(business_config=own)) == own


def test_production_accepts_direct_mode():
    Settings(environment=Environment.PRODUCTION, notes_client="anthropic").assert_safe()
    with pytest.raises(AppError):
        Settings(environment=Environment.PRODUCTION, notes_client="simulated").assert_safe()


def test_production_ignores_key_from_environment(monkeypatch):
    monkeypatch.setenv("PCD_ANTHROPIC_API_KEY", KEY)
    monkeypatch.setattr("keyring.get_password", lambda *a: None)
    assert secrets_store.get_ai_key(Settings(environment=Environment.TEST)) == KEY
    assert secrets_store.get_ai_key(Settings(environment=Environment.PRODUCTION)) is None


# ---------------------------------------------------------------- key endpoints (write-only)

TOKEN = "t" * 43
PORT = 5556


@pytest.fixture
def vault(monkeypatch):
    store = {}
    monkeypatch.setattr(secrets_store, "get_ai_key", lambda s: store.get("key"))
    monkeypatch.setattr(secrets_store, "set_ai_key", lambda k: store.__setitem__("key", k))
    monkeypatch.setattr(secrets_store, "delete_ai_key", lambda: store.pop("key", None))
    return store


def make_client(tmp_path, notes_client, models=None):
    generate_wav("demenagement", tmp_path)
    s = settings() if notes_client == "anthropic" else Settings(environment=Environment.TEST, notes_client=notes_client)
    note_client = DirectAINoteClient(s, lambda: None, client_factory=fake_factory(models=models))
    if notes_client != "anthropic":
        from phonecall_desktop.notes.client import SimulatedNoteClient

        note_client = SimulatedNoteClient()
    ctl = SessionController(s, SyntheticFileBackend(tmp_path, speed=20),
                            ScriptedRecognizer.from_file(tmp_path / "demenagement.script.json"), note_client)
    c = TestClient(create_app(ctl, TOKEN, lambda: PORT, Hub()), base_url=f"http://127.0.0.1:{PORT}")
    c.cookies.set("pcd_session", TOKEN)
    c.headers["X-PCD-Token"] = TOKEN
    return c


def test_key_endpoints_store_but_never_return_the_key(tmp_path, vault):
    c = make_client(tmp_path, "anthropic")
    assert c.get("/api/ai-key").json() == {"mode": "anthropic", "model": "claude-opus-5-5", "configured": False}
    r = c.put("/api/ai-key", json={"key": KEY})
    assert r.status_code == 200 and r.json()["configured"] and KEY not in r.text
    assert vault["key"] == KEY
    assert KEY not in c.get("/api/ai-key").text and KEY not in c.get("/api/state").text
    assert c.delete("/api/ai-key").json()["configured"] is False and "key" not in vault


def test_rejected_key_is_not_stored(tmp_path, vault):
    c = make_client(tmp_path, "anthropic", models=FakeModels(status_error(anthropic.AuthenticationError, 401)))
    r = c.put("/api/ai-key", json={"key": KEY})
    assert r.status_code == 400 and r.json()["error"]["code"] == "ai_key_invalid" and "key" not in vault
    r = c.put("/api/ai-key", json={"key": "pas-une-cle"})
    assert r.status_code == 400 and r.json()["error"]["code"] == "ai_key_format" and "key" not in vault


def test_key_endpoints_require_direct_mode_and_auth(tmp_path, vault):
    c = make_client(tmp_path, "simulated")
    assert c.get("/api/ai-key").json()["configured"] is False
    assert c.put("/api/ai-key", json={"key": KEY}).status_code == 409 and "key" not in vault
    c.headers.pop("X-PCD-Token")
    assert c.put("/api/ai-key", json={"key": KEY}).status_code == 401


def test_team_format_with_claude():
    team = load_template()
    output = {f.id: {"status": "absent", "items": [], "reason": "", "evidence": []} for f in team.all_fields()}
    output["demenagement"] = {"status": "present", "items": ["Oui, déménagement dans une maison"], "reason": "",
                              "evidence": ["S3"]}
    output["complements_echanges"] = {"status": "present", "items": ["Le client enverra l'attestation de vente.",
                                                                     "Le client est disponible le matin."],
                                      "reason": "", "evidence": ["S17"]}
    raw = json.dumps({"direction": "entrant", "variant": "movers", "fields": output}, ensure_ascii=False)
    messages = FakeMessages(raw)
    client = DirectAINoteClient(settings(note_template=None), lambda: KEY, client_factory=fake_factory(messages))
    note = client.generate(conversation(), 95, "req-team", meta={"variant": "movers"})
    assert note.text.startswith("Interlocuteur :\nNom : Non communiqué\nNuméro de téléphone : Non communiqué")
    assert "Déménagement : Oui, déménagement dans une maison" in note.text
    assert note.text.endswith("Informations Complémentaires :\nLe client enverra l'attestation de vente.\n"
                              "Le client est disponible le matin.")
    assert "Agent : Camille" in messages.calls[0]["system"]  # the example, as a model of form
