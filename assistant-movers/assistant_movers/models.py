"""Données d'un dossier Movers, gardées en mémoire pour la session seulement."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import date, datetime


class Blocage(Exception):
    """Arrêt du parcours : l'agent doit agir (ou valider) avant de reprendre. `action` = consigne affichée."""

    def __init__(self, message: str, action: str = "", reprise: bool = True):
        super().__init__(message)
        self.action = action
        self.reprise = reprise


class CrmError(Exception):
    def __init__(self, message: str, status: int | None = None):
        super().__init__(message)
        self.status = status


class SessionExpired(CrmError):
    pass


@dataclass
class Ref:
    id: str
    nom: str = ""


@dataclass
class Compte:
    id: str
    numero: str
    nom: str
    mobile: str = ""
    email: str = ""
    adresse: str = ""
    installations: list[Ref] = field(default_factory=list)
    contrats: list[Ref] = field(default_factory=list)
    cases_movers_ouverts: list[Ref] = field(default_factory=list)
    wo_ouverts: list[Ref] = field(default_factory=list)


@dataclass
class NouvelleAdresse:
    rue: str
    code_postal: str
    ville: str
    date_demenagement: date

    def texte(self) -> str:
        return f"{self.rue}, {self.code_postal} {self.ville}"


@dataclass
class WorkOrder:
    id: str
    numero: str = ""
    type_nom: str = ""
    statut: str = ""
    description: str = ""
    debut: datetime | None = None
    fin: datetime | None = None
    produits: list[str] = field(default_factory=list)


@dataclass
class Creneau:
    id: str
    debut: datetime
    fin: datetime

    def libelle(self) -> str:
        return f"{self.debut:%d/%m/%Y} · {self.debut:%Hh%M} – {self.fin:%Hh%M}"


@dataclass
class Dossier:
    """État du parcours en cours. Remis à zéro par « Nouveau dossier » et à chaque lancement."""
    etape: str = "compte"
    compte: Compte | None = None
    installation_id: str = ""
    contrat_id: str = ""
    adresse: NouvelleAdresse | None = None
    case_id: str = ""
    case_numero: str = ""
    wo: WorkOrder | None = None
    creneaux: list[Creneau] = field(default_factory=list)
    sms_texte: str = ""
    sms_envoye: bool = False
    email_sujet: str = ""
    email_html: str = ""
    email_envoye: bool = False
    blocage: dict | None = None
    avertissements_acceptes: list[str] = field(default_factory=list)
    infos: dict[str, str] = field(default_factory=dict)   # durée, électricité, réseau, travaux, matériel (saisis au case)

    def vue(self) -> dict:
        d = asdict(self)
        return d
