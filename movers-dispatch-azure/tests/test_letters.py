"""Reading of scanned letters (Azure AI Document Intelligence, here faked) — FICTITIOUS data only."""

from __future__ import annotations

import io
import json
from dataclasses import replace

import pytest

from movers_dispatch.config import ConfigError, LetterReading, parse
from movers_dispatch.engine import Agent, RunBlocked
from movers_dispatch.fake import FakeCrm, demo_config, demo_pdf
from movers_dispatch.journal import Journal
from movers_dispatch.letters import AzureReader, ReadingError, letter_signals, make_reader
from movers_dispatch.models import Mode, Status

READING = LetterReading(enabled=True, kind="fake")


def make(reading=READING, **cfg):
    crm = FakeCrm()
    return Agent(demo_config(reading=reading, **cfg), crm, Journal(":memory:")), crm


def letter(crm, label="l", number="10090016", lines=None, mime="application/pdf"):
    return crm.add(label, "Voir document joint", "Client Lettre", [], regarding_entity=None, account_number=number,
                   sender="noreply@sectoralarm.fr", text="%Sector Alarm RENNES CDE",
                   files=[("lettre.pdf", mime, demo_pdf(lines if lines is not None else [f"n° client {number}"]))])


def test_identifiers_read_in_a_letter():
    cfg = demo_config()
    s = letter_signals(cfg, "Madame, n° client : 10086592\nTél 06 72 87 01 35, résiliation au 27/10/2026")
    assert s.numbers == ["10086592"] and s.phones == ["0672870135"]
    s = letter_signals(cfg, "Monsieur Démo\n10 086 592\nmerci")         # number written alone, with spaces
    assert s.numbers == ["10086592"] and not s.phones


def test_client_found_in_the_letter_is_always_validated_by_a_person():
    agent, crm = make(automatic_allowed=True)
    agent.cfg = replace(agent.cfg, client=replace(agent.cfg.client, automatic=True))
    qid = letter(crm, lines=["Par la presente je resilie mon contrat", "n° client 10090016"])
    agent.run(Mode.AUTOMATIC, confirm_automatic=True)
    r = agent.journal.item(qid)
    assert crm.writes == 0 and "lu dans la pièce jointe" in r["client_via"] and "j'ai lu : n° 10090016" in r["client_via"]
    assert r["client_name"].startswith("Client Lettre") and r["status"] in (Status.REVIEW.value, Status.AWAITING_APPROVAL.value)
    saved = json.dumps([agent.journal.events(qid), r], default=str)
    assert "presente" not in saved                                   # the text of the letter is never kept


def test_letter_without_known_number_says_what_was_read():
    agent, crm = make()
    qid = letter(crm, lines=["n° client 10090099"])                 # misread / unknown number
    agent.run(Mode.SUPERVISED)
    r = agent.journal.item(qid)
    assert r["status"] == Status.REVIEW.value and "J'ai lu dans la pièce jointe : n° 10090099" in r["reason"]
    assert crm.writes == 0


def test_read_letter_on_demand_proposes_the_number_without_writing():
    agent, crm = make(reading=replace(READING, during_run=False))
    qid = letter(crm)
    agent.run(Mode.SUPERVISED)
    assert agent.journal.item(qid)["status"] == Status.REVIEW.value
    out = agent.read_letter(qid, "local")
    assert out["proposal"] == "10090016" and out["numbers"][0]["name"].startswith("Client Lettre") and crm.writes == 0
    assert any(e["action"] == "lecture_lettre" for e in agent.journal.events(qid))


def test_reading_off_or_without_key():
    agent, crm = make(reading=LetterReading())
    qid = letter(crm)
    agent.run(Mode.SUPERVISED)
    with pytest.raises(RunBlocked, match="non activée"):
        agent.read_letter(qid, "local")
    cfg = demo_config(reading=LetterReading(enabled=True, endpoint="https://demo.cognitiveservices.azure.com",
                                            key_env="MD_TEST_ABSENT_KEY"))
    with pytest.raises(ReadingError, match="MD_TEST_ABSENT_KEY"):
        make_reader(cfg)
    agent = Agent(cfg, FakeCrm(), Journal(":memory:"))
    agent.run(Mode.SIMULATION)
    assert any("Lecture des lettres désactivée" in w for w in agent.state.warnings)


def test_config_section():
    base = {"collaborators": [{"first_name": "Chloé"}]}
    assert not parse(base).reading.enabled
    with pytest.raises(ConfigError, match="endpoint"):
        parse({**base, "lecture": {"active": True, "endpoint": "http://x"}})
    r = parse({**base, "lecture": {"active": True, "endpoint": "https://demo.cognitiveservices.azure.com/"}}).reading
    assert r.endpoint == "https://demo.cognitiveservices.azure.com" and r.key_env == "MD_AZURE_DI_KEY"


class _Resp(io.BytesIO):
    def __init__(self, status, body=b"", headers=None):
        super().__init__(body)
        self.status, self.headers = status, headers or {}

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def test_azure_reader_posts_then_polls(monkeypatch):
    ep = "https://demo.cognitiveservices.azure.com"
    calls = []
    answers = [_Resp(202, headers={"Operation-Location": ep + "/documentintelligence/documentModels/prebuilt-read/analyzeResults/1"}),
               _Resp(200, json.dumps({"status": "running"}).encode()),
               _Resp(200, json.dumps({"status": "succeeded", "analyzeResult": {"content": "n° client 10086592"}}).encode())]

    def urlopen(req, timeout, context):
        calls.append((req.get_method(), req.full_url, req.get_header("Ocp-apim-subscription-key")))
        return answers.pop(0)

    monkeypatch.setattr("movers_dispatch.letters.urllib.request.urlopen", urlopen)
    monkeypatch.setattr("movers_dispatch.letters.time.sleep", lambda s: None)
    text = AzureReader(LetterReading(enabled=True, endpoint=ep), "k").read(b"%PDF", "application/pdf")
    assert text == "n° client 10086592"
    assert calls[0] == ("POST", ep + "/documentintelligence/documentModels/prebuilt-read:analyze?api-version=2024-11-30", "k")
    assert [c[0] for c in calls[1:]] == ["GET", "GET"]


def test_azure_reader_refuses_a_redirect_elsewhere(monkeypatch):
    ep = "https://demo.cognitiveservices.azure.com"
    monkeypatch.setattr("movers_dispatch.letters.urllib.request.urlopen",
                        lambda req, timeout, context: _Resp(202, headers={"Operation-Location": "https://ailleurs.example/x"}))
    with pytest.raises(ReadingError, match="inattendue"):
        AzureReader(LetterReading(enabled=True, endpoint=ep), "k").read(b"%PDF")
