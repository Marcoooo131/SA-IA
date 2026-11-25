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
INFOS = {"duree": "120", "electricite": "oui", "reseau": "GSM", "travaux": "", "materiel": "1x DOC"}


def test_exemple_bloque_les_ecritures():
    cfg = cfgmod.load(EX)
    assert "connexion.environment_url" in cfg.manquants() and "case.champs.moving_out_or_in" in cfg.manquants()
    a = Assistant(cfg, FakeCrm(), demo=False, mode="supervise")
    a.ouvrir_compte("10000001")
    a.saisir_adresse("8 avenue des Tests", "69003", "Lyon", date.today().isoformat(), "", "", INFOS)
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
    c.case.valeurs = {"moving_out_or_in_out": 100000001, "oui": True, "interesse_oui": True}
    c.case.installation = cfgmod.Lookup("new_installationid", "new_installations")
    return c


def test_creation_case_corps_web_api():
    t = T()
    gw = DataverseGateway(cfg_complete(), t)
    cid, num = gw.creer_case(Compte(id="44444444-4444-4444-4444-444444444444", numero="1", nom="X"),
                             "55555555-5555-5555-5555-555555555555", "", NouvelleAdresse("8 av", "69003", "LYON", date(2026, 12, 1)))
    _, path, body = next(c for c in t.calls if c[0] == "POST")
    assert cid.startswith("1111") and num == "CAS-1"
    assert body["customerid_account@odata.bind"] == "/accounts(44444444-4444-4444-4444-444444444444)"
    assert body["new_installationid@odata.bind"] == "/new_installations(55555555-5555-5555-5555-555555555555)"
    assert body["new_moving_out_or_in"] == 100000001 and body["new_moving_out_date"] == "2026-12-01T11:00:00Z"


def test_email_depuis_la_file_movers():
    t = T()
    gw = DataverseGateway(cfg_complete(), t)
    etat = gw.envoyer_email("11111111-1111-1111-1111-111111111111", Compte(id="44444444-4444-4444-4444-444444444444", numero="1", nom="X"),
                            "Sujet", "<p>ok</p>")
    post = next(c for c in t.calls if c[1] == "emails")
    parties = post[2]["email_activity_parties"]
    assert parties[0] == {"partyid_queue@odata.bind": "/queues(22222222-2222-2222-2222-222222222222)", "participationtypemask": 1}
    assert any(c[1].endswith("Microsoft.Dynamics.CRM.SendEmail") for c in t.calls) and etat == "Pending Send"


class Meta(T):
    """Champ date seule + code postal en table."""

    def request(self, method, path, *, params=None, json=None, headers=None):
        if "DateTimeAttributeMetadata" in path:
            return Response(200, {"DateTimeBehavior": {"Value": "DateOnly"}}, {})
        if path == "log_postcodes":
            return Response(200, {"value": [{"log_postcodeid": "66666666-6666-6666-6666-666666666666", "log_name": "69003"}]}, {})
        return super().request(method, path, params=params, json=json, headers=headers)


def test_date_seule_et_code_postal_en_table():
    cfg = cfg_complete()
    cfg.case.code_postal = cfgmod.Lookup("log_PostalCode", "log_postcodes", "", "log_name")
    t = Meta()
    DataverseGateway(cfg, t).creer_case(Compte(id="44444444-4444-4444-4444-444444444444", numero="1", nom="X"), "",
                                        "", NouvelleAdresse("8 av", "69003", "LYON", date(2026, 12, 1)))
    body = next(c for c in t.calls if c[0] == "POST")[2]
    assert body["new_moving_out_date"] == "2026-12-01"
    assert body["log_PostalCode@odata.bind"] == "/log_postcodes(66666666-6666-6666-6666-666666666666)"
    assert "new_new_postcode" not in body


class Annuaire(T):
    def request(self, method, path, *, params=None, json=None, headers=None):
        if method == "GET" and path == "accounts":
            return Response(200, {"value": [{"accountid": "44444444-4444-4444-4444-444444444444", "name": "X", "accountnumber": "1",
                                             "telephone1": "02 99 00 00 00", "telephone2": "06 71 95 11 00"}]}, {})
        if method == "GET" and path == "sa_smsservices":
            return Response(200, {"value": [{"sa_smsserviceid": "77777777-7777-7777-7777-777777777777"}]}, {})
        if method == "GET" and path == "log_smstemplates":
            return Response(200, {"value": [{"log_smstemplateid": "88888888-8888-8888-8888-888888888888"}]}, {})
        if method == "GET" and path == "accounts(44444444-4444-4444-4444-444444444444)":
            return Response(200, {"accountid": "44444444-4444-4444-4444-444444444444", "telephone1": "02 99 00 00 00",
                                  "log_mobilephone2": "0620134709", "log_mobilephone": "06 71 95 11 00",
                                  "log_workphone": "+33 7 11 22 33 44", "emailaddress1": "x@y.fr"}, {})
        if method == "GET" and path in ("incidents", "log_installations", "log_contracts"):
            return Response(200, {"value": []}, {})
        return super().request(method, path, params=params, json=json, headers=headers)


def test_mobile_prefere_un_06_07():
    c = DataverseGateway(cfg_complete(), Annuaire()).chercher_compte("1")
    assert c.mobile == "06 71 95 11 00"                       # « Mobile Phone » d'abord
    assert c.mobiles == ["06 71 95 11 00", "0620134709", "+33 7 11 22 33 44"]   # puis Mobile Phone 2, puis les autres 06/07


def test_sms_rattache_service_et_modele():
    cfg = cfg_complete()
    cfg.sms.entity_set, cfg.sms.texte, cfg.sms.mobile, cfg.sms.regarding_nav = "log_smses", "description", "log_manualnumber", "regardingobjectid_incident_log_sms"
    cfg.sms.liens = [{"nav": "sa_smsservice_log_sms", "set": "sa_smsservices", "nom_attr": "sa_name", "nom": "Sector Alarm"},
                     {"nav": "log_SMSTemplateId_log_sms", "set": "log_smstemplates", "nom_attr": "log_name", "nom": "Booking Confirmation"}]
    path, corps = DataverseGateway(cfg, Annuaire()).corps_sms("11111111-1111-1111-1111-111111111111", "0671951100", "Bonjour")
    assert corps["sa_smsservice_log_sms@odata.bind"] == "/sa_smsservices(77777777-7777-7777-7777-777777777777)"
    assert corps["log_SMSTemplateId_log_sms@odata.bind"] == "/log_smstemplates(88888888-8888-8888-8888-888888888888)"
