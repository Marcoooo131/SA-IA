"""CRM fictif pour la démo et les tests. Données inventées, aucun appel réseau.

Comptes de démonstration :
  10000001  cas normal
  10000002  un case Movers déjà ouvert (avertissement)
  10000003  aucun créneau disponible (No Cap)
  10000004  le CRM ne crée pas le WO tout seul (il faut cliquer Finish)
  10000005  un SMS existe déjà sur le case juste après le booking (contrôle de doublon)
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, time, timedelta

from .config import Pack
from .crm import PARIS
from .models import Compte, CrmError, Creneau, Ref, WorkOrder

EMAIL_HTML = """<p>Bonjour,</p>
<p>Nous vous confirmons votre rendez-vous de réinstallation :</p>
<p><b>Jour de l'intervention :</b> le <span style="background-color:yellow">[DATE]</span><br>
<b>Créneau d'arrivée du technicien :</b> entre <span style="background-color:yellow">[DEBUT]</span> et <span style="background-color:yellow">[FIN]</span><br>
<b>Durée de l'intervention :</b> <span style="background-color:yellow">[DUREE]</span> minutes</p>
<p>Nous vous rappelons que le titulaire du contrat doit impérativement être présent sur place le jour de la
réinstallation ; tout rendez-vous non honoré sera facturé 89 €.</p>
<ul><li>Électricité sur place : <span style="background-color:yellow">[ELECTRICITE]</span></li>
<li>Réseau : <span style="background-color:yellow">[RESEAU]</span></li>
<li>Travaux prévus : <span style="background-color:yellow">[TRAVAUX]</span></li>
<li>Matériel à réinstaller : <span style="background-color:yellow">[MATERIEL]</span></li></ul>
<p>Sector Alarm — Service Movers</p>"""


class FakeCrm:
    def __init__(self):
        self.writes = 0
        self.comptes = {
            n: Compte(id=str(uuid.uuid4()), numero=n, nom=nom, mobile="06 12 34 56 78", email="client.demo@example.com",
                      adresse="12 rue des Exemples, 75010 Paris",
                      installations=[Ref(str(uuid.uuid4()), "Installation principale — SAS")],
                      contrats=[Ref(str(uuid.uuid4()), "C-SFR-DEMO" + n[-3:] + " — Home")])
            for n, nom in (("10000001", "DEMO Martin Claire"), ("10000002", "DEMO Durand Paul"),
                           ("10000003", "DEMO Petit Inès"), ("10000004", "DEMO Moreau Luc"), ("10000005", "DEMO Garcia Léa"))}
        self.comptes["10000002"].cases_movers_ouverts = [Ref(str(uuid.uuid4()), "CAS-000123 Movers - Déménagement")]
        self.cases: dict[str, dict] = {}
        self.wos: dict[str, WorkOrder] = {}
        self.sms: dict[str, list[str]] = {}
        self.emails: list[dict] = []

    def whoami(self) -> str:
        return "demo"

    def chercher_compte(self, numero: str) -> Compte:
        c = self.comptes.get(numero.strip())
        if not c:
            raise CrmError(f"Aucun compte actif avec le numéro {numero}. (Démo : essayez 10000001 à 10000005.)")
        return c

    def _numero_compte(self, case_id: str) -> str:
        return self.cases[case_id]["compte"].numero

    def creer_case(self, compte, installation_id, contrat_id, adresse):
        cid = str(uuid.uuid4())
        num = f"CAS-{len(self.cases) + 200000}"
        self.cases[cid] = {"compte": compte, "numero": num, "adresse": adresse, "complete": False, "wo": None}
        self.writes += 1
        return cid, num

    def terminer_move_out(self, case_id):
        self.cases[case_id]["complete"] = True
        self.writes += 1
        if self._numero_compte(case_id) != "10000004":
            self._creer_wo(case_id)

    def _creer_wo(self, case_id):
        wid = str(uuid.uuid4())
        self.wos[wid] = WorkOrder(id=wid, numero=f"FR-{9000000 + len(self.wos)}", type_nom="Installation", statut="Open")
        self.cases[case_id]["wo"] = wid

    def simuler_finish(self, case_id):
        """Démo : l'agent a cliqué Finish dans le CRM."""
        if not self.cases[case_id]["wo"]:
            self._creer_wo(case_id)

    def wo_du_case(self, case_id):
        wid = self.cases[case_id]["wo"]
        return self.wos[wid] if wid else None

    def lire_wo(self, wo_id):
        return self.wos[wo_id]

    def completer_wo(self, wo, description):
        self.wos[wo.id].description = description
        self.writes += 1

    def ajouter_produit(self, wo, pack: Pack):
        self.wos[wo.id].produits.append(pack.nom)
        self.writes += 1

    def fenetre_booking(self, wo, debut, fin):
        self._fenetre = (debut, fin)
        self.writes += 1

    def _case_du_wo(self, wo):
        return next(k for k, v in self.cases.items() if v["wo"] == wo.id)

    def creneaux(self, wo):
        if self._numero_compte(self._case_du_wo(wo)) == "10000003":
            raise CrmError("ERROR (code: 8) An appointment for the criteria supplied is not available")
        debut, fin = getattr(self, "_fenetre", (date.today(), date.today() + timedelta(days=7)))
        out, d = [], debut + timedelta(days=1)
        while d <= fin and len(out) < 6:
            if d.weekday() < 5:
                for h1, h2 in ((time(8, 30), time(12, 30)), (time(13, 30), time(17, 30))):
                    out.append(Creneau(id=f"{d}-{h1:%H%M}", debut=datetime.combine(d, h1, PARIS), fin=datetime.combine(d, h2, PARIS)))
            d += timedelta(days=1)
        return out[:6]

    def reserver(self, wo, creneau):
        w = self.wos[wo.id]
        w.debut, w.fin, w.statut = creneau.debut, creneau.fin, "Scheduled"
        self.writes += 1
        cid = self._case_du_wo(wo)
        if self._numero_compte(cid) == "10000005":
            self.sms.setdefault(cid, []).append(f"RDV confirmé le {creneau.debut:%d/%m/%Y} (SMS déjà parti)")

    def sms_du_case(self, case_id):
        return list(self.sms.get(case_id, []))

    def envoyer_sms(self, case_id, mobile, texte):
        self.sms.setdefault(case_id, []).append(texte)
        self.writes += 1
        return "Envoyé (démo)"

    def preparer_email(self, case_id):
        return "Sector Alarm - Récapitulatif concernant votre déménagement", EMAIL_HTML

    def envoyer_email(self, case_id, compte, sujet, html):
        self.emails.append({"case": case_id, "sujet": sujet, "html": html})
        self.writes += 1
        return "Envoyé (démo)"

    def ouvrir_fiche(self, entite, record_id):
        return None
