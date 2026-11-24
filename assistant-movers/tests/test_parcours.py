from datetime import date, timedelta
from pathlib import Path

import pytest

from assistant_movers import config as cfgmod
from assistant_movers.fake import FakeCrm
from assistant_movers.parcours import Assistant

DEMO = Path(__file__).parents[1] / "assistant_movers" / "demo.toml"
DATE = (date.today() + timedelta(days=10)).isoformat()


@pytest.fixture
def a():
    return Assistant(cfgmod.load(DEMO), FakeCrm(), demo=True)


def jusqu_au_booking(a, numero="10000001"):
    a.ouvrir_compte(numero)
    if a.d.etape == "compte":
        a.accepter_avertissement()
    a.saisir_adresse("8 avenue des Tests", "69003", "Lyon", DATE, "", "")
    a.creer_case()
    if a.d.etape == "case":
        a.reprendre_wo()
    a.completer_wo(a.description_proposee(), ["Pack Sérénité Home SAS"], False)


def test_parcours_complet(a):
    jusqu_au_booking(a)
    assert a.d.etape == "booking" and a.d.creneaux
    assert all(c.debut.date() >= date.fromisoformat(DATE) for c in a.d.creneaux)
    a.reserver(a.d.creneaux[0].id)
    assert a.d.etape == "sms" and a.d.wo.statut == "Scheduled"
    assert f"{a.d.wo.debut:%d/%m/%Y}" in a.d.sms_texte
    a.envoyer_sms(a.d.sms_texte)
    assert a.d.sms_envoye and a.d.etape == "email"
    a.preparer_email({"duree": "120", "electricite": "oui", "reseau": "GSM / Wifi", "travaux": "Pas de travaux", "materiel": "1x DOC"})
    assert a.etat()["email_zones"] == []
    a.envoyer_email()
    assert a.d.etape == "fin" and a.d.email_envoye
    cr = a.compte_rendu()
    assert "CAS-" in cr and "FR-" in cr and "SMS : envoyé" in cr
    assert a.gw.emails[0]["html"].count("background-color:yellow") == 0


def test_numero_invalide(a):
    a.ouvrir_compte("12ab")
    assert a.d.blocage and not a.d.blocage["reprise"] and a.d.etape == "compte"


def test_avertissement_case_deja_ouvert_arrete(a):
    a.ouvrir_compte("10000002")
    assert a.d.etape == "compte" and "déjà ouvert" in a.d.blocage["message"]
    a.accepter_avertissement()
    assert a.d.etape == "adresse" and a.d.avertissements_acceptes


def test_adresse_invalide(a):
    a.ouvrir_compte("10000001")
    a.saisir_adresse("x", "690", "", "2020-01-01", "", "")
    assert a.d.etape == "adresse" and "code postal" in a.d.blocage["message"]


def test_wo_non_cree_demande_finish(a):
    a.ouvrir_compte("10000004")
    a.saisir_adresse("8 avenue des Tests", "69003", "Lyon", DATE, "", "")
    a.creer_case()
    assert a.d.etape == "case" and "Finish" in a.d.blocage["action"]
    writes = a.gw.writes
    a.reprendre_wo()                       # ne recrée pas le case
    assert a.d.etape == "wo" and len(a.gw.cases) == 1 and a.gw.writes == writes


def test_pas_de_creneau_no_cap(a):
    jusqu_au_booking(a, "10000003")
    assert a.d.etape == "booking" and "code: 8" in a.d.blocage["message"]
    msg = a.message_no_cap("7/12, 14/12")
    assert msg.startswith("FR-") and "69003" in msg and "7/12" in msg


def test_sms_doublon_arrete_puis_forcer(a):
    jusqu_au_booking(a, "10000005")
    a.reserver(a.d.creneaux[0].id)
    a.envoyer_sms(a.d.sms_texte)
    assert not a.d.sms_envoye and "existe déjà" in a.d.blocage["message"]
    a.envoyer_sms(a.d.sms_texte, forcer=True)
    assert a.d.sms_envoye


def test_sms_sans_la_date_refuse(a):
    jusqu_au_booking(a)
    a.reserver(a.d.creneaux[0].id)
    a.envoyer_sms("Bonjour, votre RDV est confirmé.")
    assert not a.d.sms_envoye and "date" in a.d.blocage["message"]


def test_email_champ_manquant_refuse(a):
    jusqu_au_booking(a)
    a.reserver(a.d.creneaux[0].id)
    a.envoyer_sms(a.d.sms_texte)
    a.preparer_email({"duree": "120"})
    assert "[ELECTRICITE]" in a.etat()["email_zones"]
    a.envoyer_email()
    assert not a.d.email_envoye and a.d.blocage


def test_etape_dans_le_desordre(a):
    a.creer_case()
    assert a.d.blocage and a.gw.writes == 0


def test_nouveau_efface_le_dossier(a):
    a.ouvrir_compte("10000001")
    a.nouveau()
    assert a.d.compte is None and a.d.etape == "compte"
