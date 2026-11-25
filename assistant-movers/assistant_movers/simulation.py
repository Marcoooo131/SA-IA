"""Mode Test : le parcours complet sur le vrai CRM, sans aucune écriture.

Les lectures (recherche du compte, installations, contrats, avertissements, file Movers) se font pour de vrai.
Chaque écriture est **construite exactement comme en mode Supervisé** (mêmes champs, mêmes valeurs, même
adresse d'API), affichée à l'agent dans « Ce qui aurait été écrit », puis **remplacée par un résultat fictif**
(case « TEST », WO « FR-TEST », créneaux fictifs). Rien ne part : ni case, ni WO, ni SMS, ni email.

C'est le mode à utiliser pour remplir et vérifier la configuration : un nom technique manquant ou faux
apparaît à l'étape concernée, sans risque pour le client.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, time, timedelta

from .crm import PARIS
from .fake import EMAIL_HTML
from .models import Compte, CrmError, Creneau, WorkOrder


class SimulationGateway:
    def __init__(self, reel):
        self.reel = reel                 # DataverseGateway (vrai CRM, lectures seulement) ou FakeCrm (démo)
        self.writes = 0                  # aucune écriture réelle
        self.simulees: list[dict] = []   # ce qui aurait été écrit, dans l'ordre
        self.wo: WorkOrder | None = None
        self._fenetre = (date.today(), date.today() + timedelta(days=7))

    # ---------------------------------------------------------------- outils
    def _note(self, etape: str, methode: str, chemin: str, corps: dict | None = None) -> None:
        self.simulees.append({"etape": etape, "methode": methode, "chemin": chemin, "corps": corps or {}})

    def _corps(self, nom: str, *a):
        """Corps exact du mode Supervisé quand on est branché sur le vrai CRM ; résumé en démo."""
        f = getattr(self.reel, nom, None)
        return f(*a) if f else None

    # ---------------------------------------------------------------- lectures réelles
    def whoami(self) -> str:
        return self.reel.whoami()

    def chercher_compte(self, numero: str) -> Compte:
        return self.reel.chercher_compte(numero)

    # ---------------------------------------------------------------- écritures simulées
    def creer_case(self, compte, installation_id, contrat_id, adresse):
        corps = self._corps("corps_case", compte, installation_id, contrat_id, adresse) or {
            "title": "Movers - Déménagement", "compte": compte.numero, "adresse": adresse.texte(),
            "moving_out_date": adresse.date_demenagement.isoformat()}
        self._note("Création du case", "POST", "incidents", corps)
        return "sim-" + uuid.uuid4().hex[:12], "CAS-TEST"

    def terminer_move_out(self, case_id):
        self._note("Completed Move Out Info", "PATCH", f"incidents({case_id})", self._corps("corps_move_out") or {"completed_move_out": "Yes"})

    def wo_du_case(self, case_id):
        if not self.wo:
            self.wo = WorkOrder(id="sim-wo", numero="FR-TEST", type_nom="Installation (fictif)", statut="Open (test)")
        return self.wo

    def lire_wo(self, wo_id):
        return self.wo

    def completer_wo(self, wo, description):
        r = self._corps("corps_wo", wo.id, description)
        path, corps = r if r else ("work_order(sim-wo)", {"description": description})
        self._note("Mise à jour du WO", "PATCH", path, corps)
        self.wo.description = description

    def ajouter_produit(self, wo, pack):
        r = self._corps("corps_produit", wo.id, pack)
        path, corps = r if r else ("work_order_products", {"produit": pack.nom})
        self._note(f"Ajout du produit « {pack.nom} »", "POST", path, corps)
        self.wo.produits.append(pack.nom)

    def fenetre_booking(self, wo, debut, fin):
        self._fenetre = (debut, fin)
        r = self._corps("corps_fenetre", wo.id, debut, fin)
        path, corps = r if r else ("work_order(sim-wo)", {"debut": debut.isoformat(), "fin": fin.isoformat()})
        self._note("Période de recherche du booking", "PATCH", path, corps)

    def creneaux(self, wo):
        debut, fin = self._fenetre
        out, d = [], max(debut, date.today()) + timedelta(days=1)
        while d <= fin + timedelta(days=7) and len(out) < 4:
            if d.weekday() < 5:
                for h1, h2 in ((time(8, 30), time(12, 30)), (time(13, 30), time(17, 30))):
                    out.append(Creneau(id=f"test-{d}-{h1:%H%M}", debut=datetime.combine(d, h1, PARIS), fin=datetime.combine(d, h2, PARIS)))
            d += timedelta(days=1)
        return out[:4]

    def reserver(self, wo, creneau):
        self._note("Réservation du créneau (« Get appointments »)", "—", "fiche du WO dans le CRM",
                   {"créneau": creneau.libelle(), "note": "en mode Supervisé, c'est vous qui réservez dans le CRM (méthode assistée)"})
        self.wo.debut, self.wo.fin, self.wo.statut = creneau.debut, creneau.fin, "Scheduled (test)"

    def sms_du_case(self, case_id, wo_id=""):
        return []

    def envoyer_sms(self, case_id, mobile, texte):
        r = self._corps("corps_sms", case_id, mobile, texte)
        path, corps = r if r else ("sms", {"mobile": mobile, "texte": texte})
        self._note("Envoi du SMS", "POST", path, corps)
        return "non envoyé (mode Test)"

    def preparer_email(self, case_id):
        # Le vrai modèle s'instancie sur un case existant : en Test, aperçu sur un modèle de démonstration.
        return "Sector Alarm - Récapitulatif concernant votre déménagement", EMAIL_HTML

    def envoyer_email(self, case_id, compte, sujet, html):
        f = getattr(self.reel, "file_expediteur", None)
        if f:
            try:
                q = f()
            except CrmError as e:
                raise CrmError(f"{e} (vérifiez email.file_expediteur)") from e
            corps = self.reel.corps_email(case_id, compte, sujet, "(contenu de l'email ci-dessus)", q)
        else:
            corps = {"objet": sujet, "de": "file Movers", "à": compte.nom}
        self._note("Envoi de l'email", "POST", "emails puis SendEmail", corps)
        return "non envoyé (mode Test)"

    def ouvrir_fiche(self, entite, record_id):
        return None

    def simuler_finish(self, case_id):
        return None
