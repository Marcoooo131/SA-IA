from datetime import date
from pathlib import Path

from assistant_movers import config as cfgmod
from assistant_movers.crm import DataverseGateway
from assistant_movers.fake import FakeCrm
from assistant_movers.journal import masquer
from assistant_movers.models import Compte, NouvelleAdresse
from assistant_movers.parcours import Assistant
from assistant_movers.transport import Response

EX = Path(__file__).parents[1] / "config" / "assistant.example.toml"


def test_exemple_bloque_les_ecritures():
    cfg = cfgmod.load(EX)
    assert "connexion.environment_url" in cfg.manquants() and "case.champs.moving_out_or_in" in cfg.manquants()
    a = Assistant(cfg, FakeCrm(), demo=False)
    a.ouvrir_compte("10000001")
    a.saisir_adresse("8 avenue des Tests", "69003", "Lyon", date.today().isoformat(), "", "")
    a.creer_case()
    assert "configuration incomplète" in a.d.blocage["message"] and a.gw.writes == 0


def test_masquage():
    m = masquer("Client joint au 06 12 34 56 78 ou +33 6 12 34 56 78, mail jean.dupont@exemple.fr")
    assert "56 78" not in m and "jean.dupont" not in m and "@exemple.fr" in m


class T:
    def __init__(self):
        self.calls = []

    def request(self, method, path, *, params=None, json=None, headers=None):
        self.calls.append((method, path, json))
        if method == "POST" and path.startswith("incidents"):
            return Response(201, {"incidentid": "11111111-1111-1111-1111-111111111111"}, {})
        if method == "GET" and path.startswith("incidents("):
            return Response(200, {"ticketnumber": "CAS-1"}, {})
        if method == "GET" and path == "queues":
            return Response(200, {"value": [{"queueid": "22222222-2222-2222-2222-222222222222"}]}, {})
        if method == "POST" and path == "emails":
            return Response(204, None, {"odata-entityid": "https://x/api/data/v8.2/emails(33333333-3333-3333-3333-333333333333)"})
        if method == "GET" and path.startswith("emails("):
            return Response(200, {"statuscode@OData.Community.Display.V1.FormattedValue": "Pending Send"}, {})
        return Response(204, None, {})


def cfg_complete():
    c = cfgmod.load(EX)
    c.case.champs = {k: f"new_{k}" for k in c.case.REQUIS}
    c.case.valeurs = {"moving_out_or_in_out": 100000001, "oui": True}
    c.case.installation = cfgmod.Lookup("new_installationid", "new_installations")
    return c


def test_creation_case_corps_web_api():
    t = T()
    gw = DataverseGateway(cfg_complete(), t)
    cid, num = gw.creer_case(Compte(id="44444444-4444-4444-4444-444444444444", numero="1", nom="X"),
                             "55555555-5555-5555-5555-555555555555", "", NouvelleAdresse("8 av", "69003", "LYON", date(2026, 12, 1)))
    _, path, body = t.calls[0]
    assert cid.startswith("1111") and num == "CAS-1"
    assert body["customerid_account@odata.bind"] == "/accounts(44444444-4444-4444-4444-444444444444)"
    assert body["new_installationid@odata.bind"] == "/new_installations(55555555-5555-5555-5555-555555555555)"
    assert body["new_moving_out_or_in"] == 100000001 and body["new_moving_out_date"] == "2026-12-01"


def test_email_depuis_la_file_movers():
    t = T()
    gw = DataverseGateway(cfg_complete(), t)
    etat = gw.envoyer_email("11111111-1111-1111-1111-111111111111", Compte(id="44444444-4444-4444-4444-444444444444", numero="1", nom="X"),
                            "Sujet", "<p>ok</p>")
    post = next(c for c in t.calls if c[1] == "emails")
    parties = post[2]["email_activity_parties"]
    assert parties[0] == {"partyid_queue@odata.bind": "/queues(22222222-2222-2222-2222-222222222222)", "participationtypemask": 1}
    assert any(c[1].endswith("Microsoft.Dynamics.CRM.SendEmail") for c in t.calls) and etat == "Pending Send"
