"""Chef d'orchestre : enchaîne les étapes dans l'ordre du guide, une action de l'agent à la fois.

Règles :
- chaque écriture dans le CRM part d'un clic de l'agent, après un aperçu de ce qui sera écrit ;
- au moindre problème (erreur CRM, avertissement, valeur relue différente), le parcours s'arrête,
  affiche le message et la consigne, et attend « Reprendre » ou « Nouveau dossier » ;
- rien n'est conservé après la fermeture : le dossier et le journal vivent en mémoire.
"""

from __future__ import annotations

import re
import threading
from dataclasses import asdict

from . import adresse as m_adresse
from . import booking as m_booking
from . import case_movers as m_case
from . import compte as m_compte
from . import email_confirmation as m_email
from . import rapport as m_rapport
from . import sms as m_sms
from . import work_order as m_wo
from .config import Config
from .journal import Journal
from .models import Blocage, CrmError, Dossier, SessionExpired
from .simulation import SimulationGateway

MODES = {"test": "Test — aucune écriture", "supervise": "Supervisé — vous validez chaque écriture"}
ETAPES = ["compte", "adresse", "case", "wo", "booking", "sms", "email", "fin"]
LIBELLES = {"compte": "Client", "adresse": "Nouvelle adresse", "case": "Case Movers", "wo": "Work Order",
            "booking": "Rendez-vous", "sms": "SMS", "email": "Email", "fin": "Compte rendu"}


class Assistant:
    def __init__(self, cfg: Config, gw, demo: bool, mode: str | None = None):
        self.cfg, self.reel, self.demo = cfg, gw, demo
        self.mode = mode or cfg.mode_defaut
        self.journal = Journal()
        self.d = Dossier()
        self.sim = SimulationGateway(gw)
        self.lock = threading.Lock()
        self.occupe = ""
        self.manquants = cfg.manquants()
        if demo:
            self.journal.sim("Démo : CRM fictif, aucune donnée réelle.")
        elif self.manquants:
            self.journal.warn(f"Configuration incomplète ({len(self.manquants)} valeurs) : mode Supervisé bloqué. "
                              "Utilisez le mode Test pour la compléter (TUTORIEL.md).")
        self.journal.info(f"Mode {MODES[self.mode]}.")

    @property
    def gw(self):
        return self.sim if self.mode == "test" else self.reel

    def _ok(self, m: str) -> None:
        (self.journal.sim if self.mode == "test" else self.journal.ok)(("TEST — " if self.mode == "test" else "") + m)

    def changer_mode(self, mode: str):
        def go():
            if mode not in MODES:
                raise Blocage("Mode inconnu.", reprise=False)
            if self.d.etape not in ("compte", "fin"):
                raise Blocage("Terminez ou abandonnez le dossier en cours (« Nouveau dossier ») avant de changer de mode.", reprise=False)
            if mode == "supervise" and not self.demo and self.manquants:
                raise Blocage("Mode Supervisé indisponible : configuration incomplète.",
                              action="Valeurs manquantes : " + ", ".join(self.manquants[:8]) + ("…" if len(self.manquants) > 8 else ""),
                              reprise=False)
            self.mode = mode
            self.d = Dossier()
            self.sim = SimulationGateway(self.reel)
            self.journal.info(f"Mode {MODES[mode]}.")
        self._run("Changement de mode", go)

    # ------------------------------------------------------------------ outils
    def _run(self, libelle: str, fn, *a, **kw):
        """Exécute une action ; transforme toute erreur en arrêt affiché à l'agent."""
        if not self.lock.acquire(blocking=False):
            raise Blocage("Une action est déjà en cours.", reprise=False)
        self.occupe = libelle
        try:
            self.d.blocage = None
            return fn(*a, **kw)
        except Blocage as b:
            self.d.blocage = {"message": str(b), "action": b.action, "reprise": b.reprise}
            (self.journal.warn if b.reprise else self.journal.info)(f"{libelle} : {b}")
        except SessionExpired as e:
            self.d.blocage = {"message": str(e), "action": "Reconnectez-vous au CRM dans la fenêtre Edge, puis « Reprendre ».", "reprise": True}
            self.journal.err(str(e))
        except (CrmError, TimeoutError) as e:
            self.d.blocage = {"message": str(e), "action": "Vérifiez dans le CRM avant de reprendre : rien n'est refait automatiquement.",
                              "reprise": True}
            self.journal.err(f"{libelle} : {e}")
        finally:
            self.occupe = ""
            self.lock.release()

    def _exiger(self, etape: str):
        if self.d.etape != etape:
            raise Blocage(f"Action impossible à l'étape « {LIBELLES[self.d.etape]} ».", reprise=False)

    def _ecriture_permise(self):
        if self.mode == "supervise" and not self.demo and self.manquants:
            raise Blocage("Écriture bloquée : configuration incomplète.",
                          action="Valeurs manquantes : " + ", ".join(self.manquants[:8]) + ("…" if len(self.manquants) > 8 else ""),
                          reprise=False)

    # ------------------------------------------------------------------ 1-3
    def ouvrir_compte(self, numero: str):
        def go():
            self.d = Dossier()
            c = m_compte.charger_compte(self.gw, numero)
            self.d.compte = c
            if len(c.installations) == 1:
                self.d.installation_id = c.installations[0].id
            if len(c.contrats) == 1:
                self.d.contrat_id = c.contrats[0].id
            try:
                self.d.agent = self.gw.agent_nom()
            except CrmError:
                self.d.agent = ""
            self.journal.ok(f"Compte {c.numero} trouvé : {c.nom}")
            av = m_compte.avertissements(c)
            if av:
                raise Blocage(" · ".join(av), action="Lisez l'avertissement : « Continuer quand même » ou « Nouveau dossier ».")
            self.d.etape = "adresse"
        self._run("Recherche du compte", go)

    def accepter_avertissement(self):
        def go():
            self._exiger("compte")
            if not self.d.compte:
                raise Blocage("Aucun compte chargé.", reprise=False)
            self.d.avertissements_acceptes += m_compte.avertissements(self.d.compte)
            self.journal.warn("Avertissement accepté par l'agent.")
            self.d.etape = "adresse"
        self._run("Avertissement", go)

    # ------------------------------------------------------------------ 4
    def saisir_adresse(self, rue, cp, ville, date_dem, installation_id, contrat_id, infos: dict | None = None):
        def go():
            self._exiger("adresse")
            self.d.adresse = m_adresse.valider_adresse(rue, cp, ville, date_dem)
            self.d.infos = {}
            ids_inst = {i.id for i in self.d.compte.installations}
            if installation_id:
                if ids_inst and installation_id not in ids_inst:
                    raise Blocage("Installation inconnue pour ce compte.", reprise=False)
                self.d.installation_id = installation_id
            if not self.d.installation_id and self.d.compte.installations:
                raise Blocage("Choisissez l'installation qui déménage.", reprise=False)
            if contrat_id:
                self.d.contrat_id = contrat_id
            self.d.infos = m_adresse.valider_infos(infos or {}, self.d.compte.composants.get(self.d.installation_id, ""))
            self.journal.ok(f"Nouvelle adresse : {self.d.adresse.texte()}")
            self.d.etape = "case"
        self._run("Nouvelle adresse", go)

    def apercu_case(self) -> list[tuple[str, str]]:
        if self.d.etape != "case" or not self.d.adresse:
            return []
        return m_case.apercu(self.d, self.cfg.case.titre)

    # ------------------------------------------------------------------ 5-7
    def creer_case(self):
        def go():
            self._exiger("case")
            self._ecriture_permise()
            if not self.d.case_id:
                m_case.creer(self.gw, self.d)
                self._ok(f"Case {self.d.case_numero} créé, Moving Out renseigné, Completed Move Out Info = Yes.")
            self._attendre_wo()
        self._run("Création du case", go)

    def _attendre_wo(self):
        try:
            rapide = self.demo or self.mode == "test"
            m_case.attendre_wo(self.gw, self.d, 4 if rapide else self.cfg.attente_wo_secondes, pause=1 if rapide else 3)
        except Blocage:
            if not self.demo and self.mode == "supervise":
                self.gw.ouvrir_fiche("incident", self.d.case_id)
            raise
        self._ok(f"Work Order {self.d.wo.numero} créé par le CRM ({self.d.wo.type_nom or 'Installation'}).")
        self.d.etape = "wo"

    def reprendre_wo(self):
        def go():
            self._exiger("case")
            if not self.d.case_id:
                raise Blocage("Le case n'est pas encore créé.", reprise=False)
            if self.demo and self.mode == "supervise":
                self.gw.simuler_finish(self.d.case_id)
                self.journal.sim("Démo : « Finish » cliqué dans le CRM.")
            self._attendre_wo()
        self._run("Recherche du Work Order", go)

    # ------------------------------------------------------------------ 8
    def description_proposee(self) -> str:
        if not self.d.adresse:
            return ""
        hwid = next((i.nom for i in self.d.compte.installations if i.id == self.d.installation_id), "")
        return m_wo.description(self.cfg, self.d, agent=self.d.agent, hwid=hwid, materiel=self.d.infos.get("materiel", ""))

    def _resoudre_produits(self) -> None:
        """Traduit une seule fois les numéros produit (config `numero`) en identifiants CRM."""
        if getattr(self, "_produits_resolus", False):
            return
        for p in list(self.cfg.work_order.packs) + list(self.cfg.work_order.options):
            if p.numero and not p.produit_id:
                try:
                    p.produit_id = self.gw.produit_par_numero(p.numero)
                except CrmError as e:
                    self.journal.info(f"« {p.nom} » non proposé : {e}")
        self._produits_resolus = True

    def tarifs_options(self) -> list[dict]:
        self._resoudre_produits()
        if not hasattr(self, "_tarifs"):
            self._tarifs = {}
        out = []
        for o in self.cfg.work_order.options:
            if not (o.produit_id or self.demo):
                continue
            if o.nom not in self._tarifs:
                try:
                    lu = self.gw.prix_produit(o.produit_id) if o.produit_id else ("", "")
                except CrmError:
                    lu = ("", "")
                self._tarifs[o.nom] = (o.prix or lu[0], o.mensualite or lu[1])
            p, m = self._tarifs[o.nom]
            out.append({"nom": o.nom, "prix": p, "mensualite": m})
        return out

    def completer_wo(self, texte: str, packs: list[str], produits_verifies: bool, options: dict | None = None):
        def go():
            self._exiger("wo")
            self._ecriture_permise()
            self._resoudre_produits()
            m_wo.completer(self.gw, self.cfg, self.d, texte, packs, produits_verifies, options)
            ajouts = packs + [f"{q}x {n}" for n, q in self.d.options.items()]
            self._ok(f"WO {self.d.wo.numero} complété" + (f" — produits : {', '.join(ajouts)}" if ajouts else "") + ".")
            m_booking.preparer(self.gw, self.cfg, self.d)
            self.d.etape = "booking"
            self._ouvrir_booking()
        self._run("Work Order", go)

    # ------------------------------------------------------------------ 9-11
    def _methode(self) -> str:
        return "action" if (self.demo or self.mode == "test") else self.cfg.booking.methode

    def _ouvrir_booking(self):
        if self._methode() == "action":
            m_booking.charger_creneaux(self.gw, self.d)
            self.journal.info(f"{len(self.d.creneaux)} créneaux disponibles.")
        else:
            self.gw.ouvrir_fiche(self.cfg.work_order.entite, self.d.wo.id)
            self.journal.info("Fiche du WO ouverte dans Edge : « Get appointments », choisissez le créneau avec le client.")

    def recharger_creneaux(self):
        def go():
            self._exiger("booking")
            self._ouvrir_booking()
        self._run("Créneaux", go)

    def reserver(self, creneau_id: str):
        def go():
            self._exiger("booking")
            self._ecriture_permise()
            m_booking.reserver(self.gw, self.d, creneau_id)
            self._booke()
        self._run("Réservation", go)

    def verifier_booking(self):
        def go():
            self._exiger("booking")
            m_booking.verifier(self.gw, self.d)
            self._booke()
        self._run("Vérification de la réservation", go)

    def _booke(self):
        wo = self.d.wo
        self._ok(f"Rendez-vous réservé : {wo.debut:%d/%m/%Y} entre {wo.debut:%Hh%M} et {wo.fin:%Hh%M} ({wo.statut}).")
        self.d.sms_texte = m_sms.texte(self.cfg, self.d)
        self.d.etape = "sms"

    def message_no_cap(self, dispos: str) -> str:
        return m_booking.message_no_cap(self.d, dispos)

    # ------------------------------------------------------------------ 12
    def envoyer_sms(self, texte: str, forcer: bool = False, mobile: str = ""):
        def go():
            self._exiger("sms")
            self._ecriture_permise()
            if mobile:
                if re.sub(r"[\s.\-]", "", mobile) and not re.fullmatch(r"(?:0|\+33)[67]\d{8}", re.sub(r"[\s.\-]", "", mobile)):
                    raise Blocage("Numéro de mobile invalide (06 ou 07, 10 chiffres).", reprise=False)
                self.d.compte.mobile = mobile.strip()
            etat = m_sms.envoyer(self.gw, self.cfg, self.d, texte, forcer)
            self._ok(f"SMS envoyé ({etat}).")
            self.d.etape = "email"
            try:
                duree = self.gw.duree_wo(self.d.wo.id)
            except CrmError:
                duree = ""
            if duree:
                self.d.infos["duree"] = duree
            m_email.preparer(self.gw, self.cfg, self.d, self.d.infos)
            restes = m_email.zones_surlignees(self.d.email_html)
            self.journal.info("Email préparé avec les infos saisies au case" + (f" — {len(restes)} zone(s) encore surlignée(s)." if restes else "."))
        self._run("SMS", go)

    # ------------------------------------------------------------------ 13
    def preparer_email(self, saisies: dict[str, str] | None = None):
        def go():
            self._exiger("email")
            if saisies:   # corrections éventuelles de l'agent à l'étape Email
                self.d.infos.update({k: v.strip() for k, v in saisies.items() if v and v.strip()})
            m_email.preparer(self.gw, self.cfg, self.d, self.d.infos)
            restes = m_email.zones_surlignees(self.d.email_html)
            self.journal.info("Email préparé depuis le modèle CRM" + (f" — {len(restes)} champ(s) encore surligné(s)." if restes else "."))
        self._run("Préparation de l'email", go)

    def envoyer_email(self):
        def go():
            self._exiger("email")
            self._ecriture_permise()
            if not self.d.email_html:
                raise Blocage("Préparez d'abord l'email.", reprise=False)
            etat = m_email.envoyer(self.gw, self.d)
            self._ok(f"Email de confirmation envoyé depuis la file {self.cfg.email.file_expediteur} ({etat}).")
            self.d.etape = "fin"
        self._run("Email", go)

    # ------------------------------------------------------------------ 14 / divers
    def compte_rendu(self) -> str:
        cr = m_rapport.compte_rendu(self.d)
        return ("MODE TEST — rien n'a été écrit ni envoyé dans le CRM.\n" + cr) if self.mode == "test" else cr

    def nouveau(self):
        self.d = Dossier()
        self.sim = SimulationGateway(self.reel)
        self.journal.info("Nouveau dossier.")

    def etat(self) -> dict:
        d = self.d
        return {
            "demo": self.demo, "mode": self.mode, "modes": MODES, "simulees": self.sim.simulees if self.mode == "test" else [],
            "occupe": self.occupe, "etape": d.etape, "etapes": ETAPES, "libelles": LIBELLES,
            "manquants": self.manquants, "methode_booking": self._methode(),
            "dossier": d.vue(), "apercu_case": self.apercu_case(),
            "description": self.description_proposee() if d.etape == "wo" else "",
            "packs": [p.nom for p in self.cfg.work_order.packs if p.produit_id or p.numero or self.demo],
            "options": self.tarifs_options() if d.etape == "wo" else [],
            "email_zones": m_email.zones_surlignees(d.email_html) if d.email_html else [],
            "compte_rendu": self.compte_rendu() if d.etape == "fin" else "",
            "journal": self.journal.vue(), "ecritures": self.reel.writes,
        }
