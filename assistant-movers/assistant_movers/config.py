"""Configuration locale (assistant.toml). Rien n'est deviné : chaque nom technique du CRM se relève avec
`decouvrir`. Tant qu'un nom manque, l'étape qui en a besoin est bloquée et l'interface dit lequel."""

from __future__ import annotations

import tomllib
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class Connexion:
    kind: str = "fake"                      # "browser" (session Edge de l'utilisateur) ou "fake" (démo)
    environment_url: str = ""
    api_version: str = "v8.2"
    browser_channel: str = "msedge"
    browser_executable: str = ""
    browser_headless: bool = False
    timeout_seconds: float = 30.0


@dataclass
class Lookup:
    """Champ de recherche : `nav` = propriété de navigation (pour écrire), `set` = table visée."""
    nav: str = ""
    set: str = ""
    compte_attr: str = ""          # attribut de la table visée qui pointe vers le compte (pour lister les choix)
    nom_attr: str = ""             # colonne affichée (nom principal)

    @property
    def ok(self) -> bool:
        return bool(self.nav and self.set)


@dataclass
class CaseCfg:
    titre: str = "Movers - Déménagement"
    client_nav: str = "customerid_account"   # standard Dynamics
    installation: Lookup = field(default_factory=Lookup)
    contrat: Lookup = field(default_factory=Lookup)
    code_postal: Lookup = field(default_factory=Lookup)   # si le code postal du CRM est une table (ex. log_postcode)
    composants_entite: str = "log_installationproduct"    # composants de l'installation (matériel à réinstaller)
    composants_set: str = "log_installationproducts"
    champs: dict[str, str] = field(default_factory=dict)     # clé métier → nom logique
    valeurs: dict[str, int | bool | str] = field(default_factory=dict)  # clé métier → valeur à écrire
    fixes: dict[str, int | bool | str] = field(default_factory=dict)    # nom logique → valeur fixe (type, catégorie…)

    REQUIS = ("moving_out_or_in", "moving_out_interested", "completed_move_out",
              "new_street", "new_postcode", "new_city", "moving_out_date")
    VALEURS_REQUISES = ("moving_out_or_in_out", "oui", "interesse_oui")

    def manquants(self) -> list[str]:
        m = [f"case.champs.{k}" for k in self.REQUIS if not self.champs.get(k)]
        m += [f"case.valeurs.{k}" for k in self.VALEURS_REQUISES if k not in self.valeurs]
        if not self.installation.ok:
            m.append("case.installation")
        return m


@dataclass
class Pack:
    nom: str
    produit_id: str = ""
    nav: str = ""                  # facultatif : lien produit propre au pack (ex. produit matériel ou produit de contrat)
    prix: str = ""                 # facultatif : prix catalogue affiché (sinon lu sur le produit)
    mensualite: str = ""           # facultatif : mensualité affichée (sinon lue sur le produit)


@dataclass
class WorkOrderCfg:
    entite: str = ""               # nom logique (pour ouvrir la fiche)
    entity_set: str = ""
    compte_attr: str = ""          # facultatif : repérer les WO déjà ouverts du compte
    case_attr: str = ""            # lookup vers le Case (nom d'attribut, lecture)
    numero: str = ""               # « Activity Number » FR-xxxxxxx
    type_attr: str = ""
    type_installation: int | None = None
    template_nav: str = ""
    template_set: str = ""
    template_mover_m_id: str = ""
    description: str = ""
    timeband: str = ""
    timeband_valeur: int | None = None
    booked_start: str = ""
    booked_end: str = ""
    date_debut_recherche: str = ""
    date_fin_recherche: str = ""
    statut_attr: str = "statuscode"
    produits_set: str = ""
    produit_wo_nav: str = ""
    produit_nav: str = ""
    packs: list[Pack] = field(default_factory=list)
    options: list[Pack] = field(default_factory=list)   # produits complémentaires (DOC, DMP, DF, SAVE…) avec quantité
    prix_attr: str = "price"       # colonne du prix catalogue sur le produit
    mensualite_attr: str = ""      # colonne de la mensualité sur le produit
    duree_attr: str = ""           # facultatif : colonne « durée » du WO (sinon détectée, sinon choisie par l'agent)
    description_modele: str = ""

    def manquants(self) -> list[str]:
        req = {"entite": self.entite, "entity_set": self.entity_set, "case_attr": self.case_attr, "numero": self.numero,
               "description": self.description, "booked_start": self.booked_start, "booked_end": self.booked_end}
        return [f"work_order.{k}" for k, v in req.items() if not v]


@dataclass
class BookingCfg:
    methode: str = "assiste"       # "assiste" : l'agent clique Get appointments dans la fenêtre CRM
    action_creneaux: str = ""      # "action" : action CRM relevée par `decouvrir --observer-booking`
    action_reserver: str = ""
    jours_recherche: int = 7
    attente_minutes: int = 10


@dataclass
class SmsCfg:
    entity_set: str = ""
    texte: str = ""
    mobile: str = ""
    sujet: str = "subject"
    regarding_nav: str = ""        # ex. regardingobjectid_incident_<entité sms>
    wo_attr: str = ""              # facultatif : lien du SMS vers le WO (contrôle de doublon des SMS envoyés par le CRM)
    envoi: dict[str, int | str] = field(default_factory=dict)  # champs à passer après création pour déclencher l'envoi
    # Fiches à rattacher au SMS, retrouvées par leur nom (ex. service d'envoi « Sector Alarm », modèle « Booking Confirmation »)
    liens: list[dict] = field(default_factory=list)
    modele: str = ("Sector Alarm : votre rendez-vous de réinstallation est confirmé le {date} "
                   "entre {debut} et {fin}. Le titulaire du contrat doit être présent.")
    verifier_doublon: bool = True

    def manquants(self) -> list[str]:
        req = {"entity_set": self.entity_set, "texte": self.texte, "mobile": self.mobile, "regarding_nav": self.regarding_nav}
        return [f"sms.{k}" for k, v in req.items() if not v]


@dataclass
class EmailCfg:
    modele: str = "Sector Alarm - Récapitulatif concernant votre déménagement"
    file_expediteur: str = "Movers"
    # texte exact surligné dans le modèle → clé de la valeur à mettre (date, debut, fin, duree, electricite, reseau,
    # travaux, materiel). `decouvrir` affiche les zones surlignées du modèle.
    remplacements: dict[str, str] = field(default_factory=dict)


@dataclass
class Config:
    connexion: Connexion = field(default_factory=Connexion)
    mode_defaut: str = "test"              # "test" (aucune écriture) ou "supervise" (écritures validées une à une)
    case: CaseCfg = field(default_factory=CaseCfg)
    work_order: WorkOrderCfg = field(default_factory=WorkOrderCfg)
    booking: BookingCfg = field(default_factory=BookingCfg)
    sms: SmsCfg = field(default_factory=SmsCfg)
    email: EmailCfg = field(default_factory=EmailCfg)
    attente_wo_secondes: int = 90
    compte_champ_numero: str = "accountnumber"
    compte_champ_mobile: str = ""          # facultatif : colonne « Mobile Phone » du compte (sinon détection d'un 06/07)

    def manquants(self) -> list[str]:
        if self.connexion.kind == "fake":
            return []
        m = []
        if not self.connexion.environment_url or "SERVEUR" in self.connexion.environment_url:
            m.append("connexion.environment_url")
        return m + self.case.manquants() + self.work_order.manquants() + self.sms.manquants()


def _lookup(d: dict | None) -> Lookup:
    d = d or {}
    return Lookup(nav=d.get("nav", ""), set=d.get("set", ""), compte_attr=d.get("compte_attr", ""), nom_attr=d.get("nom_attr", ""))


def load(path: str | Path) -> Config:
    raw = tomllib.loads(Path(path).read_text(encoding="utf-8"))
    c = Config()
    c.connexion = Connexion(**raw.get("connexion", {}))
    a = raw.get("assistant", {})
    c.mode_defaut = a.get("mode_defaut", c.mode_defaut)
    c.attente_wo_secondes = int(a.get("attente_wo_secondes", c.attente_wo_secondes))
    c.compte_champ_numero = raw.get("compte", {}).get("champ_numero", c.compte_champ_numero)
    c.compte_champ_mobile = raw.get("compte", {}).get("champ_mobile", "")
    k = raw.get("case", {})
    c.case = CaseCfg(titre=k.get("titre", c.case.titre), client_nav=k.get("client_nav", c.case.client_nav),
                     installation=_lookup(k.get("installation")), contrat=_lookup(k.get("contrat")),
                     code_postal=_lookup(k.get("code_postal")),
                     composants_entite=k.get("composants_entite", "log_installationproduct"),
                     composants_set=k.get("composants_set", "log_installationproducts"),
                     champs=dict(k.get("champs", {})), valeurs=dict(k.get("valeurs", {})),
                     fixes=dict(k.get("fixes", {})))
    w = dict(raw.get("work_order", {}))
    packs = [Pack(**p) for p in w.pop("packs", [])]
    options = [Pack(**p) for p in w.pop("options", [])]
    c.work_order = WorkOrderCfg(**w, packs=packs, options=options)
    c.booking = BookingCfg(**raw.get("booking", {}))
    c.sms = SmsCfg(**raw.get("sms", {}))
    e = raw.get("email", {})
    c.email = EmailCfg(modele=e.get("modele", c.email.modele), file_expediteur=e.get("file_expediteur", c.email.file_expediteur),
                       remplacements=dict(e.get("remplacements", {})))
    c.mode_defaut = {"simulation": "test", "reel": "supervise"}.get(c.mode_defaut, c.mode_defaut)
    if c.mode_defaut not in ("test", "supervise"):
        raise ValueError("assistant.mode_defaut doit valoir \"test\" ou \"supervise\".")
    return c
