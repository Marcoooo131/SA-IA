"""Mode Test : lectures réelles, aucune écriture, corps identiques au mode Supervisé."""
from datetime import date, timedelta
from pathlib import Path

from assistant_movers import config as cfgmod
from assistant_movers.crm import DataverseGateway
from assistant_movers.fake import FakeCrm
from assistant_movers.parcours import Assistant
from assistant_movers.transport import Response

EX = Path(__file__).parents[1] / "config" / "assistant.example.toml"
DEMO = Path(__file__).parents[1] / "assistant_movers" / "demo.toml"
DATE = (date.today() + timedelta(days=10)).isoformat()
ACC = "44444444-4444-4444-4444-444444444444"
INST = "55555555-5555-5555-5555-555555555555"
INFOS = {"duree": "120", "electricite": "oui", "reseau": "GSM", "travaux": "", "materiel": "1x DOC"}


class LectureSeule:
    """Faux CRM HTTP : répond aux lectures, échoue le test à la moindre écriture."""

    def __init__(self):
        self.calls = []

    def request(self, method, path, *, params=None, json=None, headers=None):
        self.calls.append((method, path))
        assert method == "GET", f"écriture interdite en mode Test : {method} {path}"
        if path == "accounts":
            return Response(200, {"value": [{"accountid": ACC, "name": "CLIENT TEST", "accountnumber": "10031562",
                                             "telephone1": "0612345678", "emailaddress1": "c@exemple.fr"}]}, {})
        if path == "new_installations":
            return Response(200, {"value": [{"new_installationid": INST, "new_name": "Installation SAS"}]}, {})
        if path == "queues":
            return Response(200, {"value": [{"queueid": "22222222-2222-2222-2222-222222222222"}]}, {})
        return Response(200, {"value": []}, {})


def cfg_complete():
    c = cfgmod.load(EX)
    c.connexion.environment_url = "https://crm.exemple/ORG"
    c.case.champs = {k: f"new_{k}" for k in c.case.REQUIS}
    c.case.valeurs = {"moving_out_or_in_out": 100000001, "oui": True, "interesse_oui": True}
    c.case.installation = cfgmod.Lookup("new_installationid", "new_installations", "new_accountid", "new_name")
    c.work_order.entite, c.work_order.entity_set = "new_workorder", "new_workorders"
    c.sms.entity_set, c.sms.texte, c.sms.mobile, c.sms.regarding_nav = "new_smses", "new_text", "new_mobile", "regardingobjectid_incident_new_sms"
    c.email.remplacements = {f"[{k.upper()}]": k for k in ("date", "debut", "fin", "duree", "electricite", "reseau", "travaux", "materiel")}
    return c


def test_parcours_test_sans_aucune_ecriture():
    t = LectureSeule()
    a = Assistant(cfg_complete(), DataverseGateway(cfg_complete(), t), demo=False, mode="test")
    a.ouvrir_compte("10031562")
    assert a.d.etape == "adresse" and a.d.installation_id == INST
    a.saisir_adresse("8 avenue des Tests", "69003", "Lyon", DATE, "", "", INFOS)
    a.creer_case()
    assert a.d.etape == "wo" and a.d.case_numero == "CAS-TEST", a.d.blocage
    a.completer_wo(a.description_proposee(), [], True)
    a.reserver(a.d.creneaux[0].id)
    a.envoyer_sms(a.d.sms_texte)
    a.preparer_email({k: "x" for k in ("duree", "electricite", "reseau", "travaux", "materiel")})
    a.envoyer_email()
    assert a.d.etape == "fin" and a.reel.writes == 0
    assert all(m == "GET" for m, _ in t.calls)
    sim = a.etat()["simulees"]
    case = sim[0]["corps"]
    assert case["customerid_account@odata.bind"] == f"/accounts({ACC})"
    assert case["new_installationid@odata.bind"] == f"/new_installations({INST})"
    assert case["new_moving_out_or_in"] == 100000001 and case["new_new_city"] == "LYON"
    assert any(x["etape"] == "Envoi du SMS" and x["chemin"] == "new_smses" for x in sim)
    assert a.compte_rendu().startswith("MODE TEST")


def test_zones_remplies_par_libelle_sans_config_et_zone_inconnue_bloque():
    cfg = cfg_complete()
    cfg.email.remplacements = {}
    a = Assistant(cfg, DataverseGateway(cfg, LectureSeule()), demo=False, mode="test")
    a.ouvrir_compte("10031562")
    a.saisir_adresse("8 avenue des Tests", "69003", "Lyon", DATE, "", "", INFOS)
    a.creer_case(); a.completer_wo("desc", [], True); a.reserver(a.d.creneaux[0].id); a.envoyer_sms(a.d.sms_texte)
    assert a.etat()["email_zones"] == []
    assert "120" in a.d.email_html and "GSM" in a.d.email_html and f"{a.d.wo.debut:%d/%m/%Y}" in a.d.email_html
    a.sim.preparer_email = lambda case_id: ("S", '<p>Code porte : <span style="background-color:yellow">XXXX</span></p>')
    a.preparer_email()
    assert a.etat()["email_zones"] == ["XXXX"]
    a.envoyer_email()
    assert a.d.etape == "email" and a.d.blocage


def test_mode_test_signale_le_champ_manquant():
    cfg = cfg_complete()
    cfg.case.champs["new_street"] = ""
    a = Assistant(cfg, DataverseGateway(cfg, LectureSeule()), demo=False, mode="test")
    a.ouvrir_compte("10031562")
    a.saisir_adresse("8 avenue des Tests", "69003", "Lyon", DATE, "", "", INFOS)
    a.creer_case()
    assert "case.champs.new_street" in a.d.blocage["message"]


def test_supervise_refuse_si_config_incomplete():
    a = Assistant(cfgmod.load(EX), FakeCrm(), demo=False, mode="test")
    a.changer_mode("supervise")
    assert a.mode == "test" and "incomplète" in a.d.blocage["message"]


def test_pas_de_changement_de_mode_en_plein_dossier():
    a = Assistant(cfgmod.load(DEMO), FakeCrm(), demo=True, mode="test")
    a.ouvrir_compte("10000001")
    a.changer_mode("supervise")
    assert a.mode == "test" and a.d.blocage
    a.nouveau()
    a.changer_mode("supervise")
    assert a.mode == "supervise" and a.d.blocage is None
