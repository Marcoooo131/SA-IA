"""Pure decision: from what was read in the CRM, which Worked By (if any) may be written.

No I/O here, so every business case is tested directly. The decision only ever proposes the
owner of the relevant case; when that owner cannot be established with certainty the item goes
to human review, it is never guessed.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .config import CaseRules, Config, normalize_name
from .models import Case, Email, QueueItem, Status, User


@dataclass(frozen=True)
class Decision:
    status: Status            # ASSIGNED here means "may be assigned"; SKIPPED, REVIEW or ERROR otherwise
    reason: str
    case: Case | None = None
    user: User | None = None
    considered: tuple[str, ...] = field(default_factory=tuple)   # "CAS-001 (Kader)" — trace only
    code: str = ""            # machine-readable outcome (e.g. "no_case": the rotation may take over)
    method: str = "case"      # "case" (owner of the case), "rotation", "manual"

    @property
    def assignable(self) -> bool:
        return self.status is Status.ASSIGNED


PREFERRED_STATES = (0, 2)   # statecode Active, Canceled — preferred over Resolved (1)

STANDARD = {"title": lambda c: c.title, "ticketnumber": lambda c: c.number, "statecode": lambda c: c.state,
            "statuscode": lambda c: c.status}


def relevant(case: Case, rules: CaseRules) -> bool:
    if rules.active_only and case.state != 0:
        return False
    return all(r.matches(STANDARD[r.field](case) if r.field in STANDARD else case.fields.get(r.field))
               for r in rules.rules)


STATE_LABELS = {0: "actif", 1: "résolu", 2: "annulé"}


def _label(case: Case) -> str:
    """Trace of a case seen, detailed enough to understand a human correction later."""
    owner = case.owner.name if case.owner else "sans owner"
    return f"{case.number or case.id} « {case.title} » {STATE_LABELS.get(case.state, case.state)} ({owner})"


def decide(cfg: Config, item: QueueItem, email: Email | None, cases: list[Case] | None,
           users: dict[str, User]) -> Decision:
    d = _decide(cfg, item, email, cases, users)
    if d.status is Status.REVIEW and d.user is None and item.worker is not None:
        # nothing to propose but someone already filled Worked By (by hand or with the drop-down): handled
        return Decision(Status.SKIPPED, f"Worked By déjà renseigné ({item.worker.name or item.worker.id}) : "
                        "élément déjà traité.", d.case, None, d.considered, code="already_filled")
    return d


def _decide(cfg: Config, item: QueueItem, email: Email | None, cases: list[Case] | None,
            users: dict[str, User]) -> Decision:
    """``users`` holds the systemuser records of the configured collaborators that own a case.

    Regarding = a case: the mail is attached to that very case, which is the one retained whatever its
    title or status (recorded procedure, 2nd mail: Regarding "MOVERS", Canceled → its owner).
    Regarding = an account: the account's cases filtered by the [cases] rules (1st mail).
    """
    if email is None or email.regarding is None:
        return Decision(Status.REVIEW, "Élément sans champ Regarding : compte client inconnu.", code="no_regarding")
    cases = cases or []
    considered = tuple(_label(c) for c in cases)
    if email.regarding.entity == "incident":
        if not cases:
            return Decision(Status.ERROR, "Case indiqué dans Regarding illisible.")
        pertinent = cases[:1]
    elif email.regarding.entity == "account":
        pertinent = [c for c in cases if relevant(c, cfg.cases)]
        if not pertinent:
            return Decision(Status.REVIEW, "Aucun Case pertinent sur le compte client : aucune affectation.",
                            considered=considered, code="no_case")
    else:
        return Decision(Status.REVIEW, f"Regarding ne pointe ni vers un compte client ni vers un Case mais vers "
                        f"« {email.regarding.entity} » : pour le prendre en charge, indiquer dans dispatch.toml "
                        f"[client] liens_compte la colonne « compte » de cette table (voir 3-decouvrir.bat).",
                        code="regarding_other")
    owned = [c for c in pertinent if c.owner and c.owner.entity == "systemuser" and cfg.collaborator_for(c.owner.id)]
    if not owned:
        return Decision(Status.REVIEW, "Owner non reconnu : aucun Case pertinent n'appartient à Kader, Estefania, "
                        "Marc-Antoine ou Chloé.", considered=considered, code="owner_unknown")
    owners = {c.owner.id.lower() for c in owned}
    if len(owners) > 1:
        # Rule from the business: between cases of different collaborators, the Active or Canceled one
        # wins over a Resolved one. Still several owners after that → a human decides.
        preferred = [c for c in owned if c.state in PREFERRED_STATES]
        if preferred and len({c.owner.id.lower() for c in preferred}) == 1:
            owned = preferred
        else:
            return Decision(Status.REVIEW, "Plusieurs Cases pertinents (actifs ou annulés) avec des Owners différents : "
                            "choix impossible avec certitude.", considered=considered, code="ambiguous")
    if len(owned) > 1 and cfg.cases.multiple_same_owner != "assign":
        return Decision(Status.REVIEW, "Plusieurs Cases pertinents (même Owner) : validation demandée par la "
                        "configuration.", considered=considered, code="ambiguous")
    case = sorted(owned, key=lambda c: c.created_on, reverse=True)[0]
    collab = cfg.collaborator_for(case.owner.id)
    user = users.get(case.owner.id.lower())
    if user is None:
        return Decision(Status.ERROR, "Fiche utilisateur de l'Owner illisible.", case, considered=considered)
    if user.disabled:
        return Decision(Status.REVIEW, f"Collaborateur {user.full_name} inactif dans Dynamics 365.", case, user, considered)
    if normalize_name(user.first_name) != normalize_name(collab.first_name):
        return Decision(Status.ERROR, f"Prénom CRM « {user.first_name} » différent du prénom configuré "
                        f"« {collab.first_name} » pour ce systemuserid : configuration à vérifier.", case, user, considered)
    if item.worker is not None:
        if item.worker.entity == "systemuser" and item.worker.id.lower() == user.id.lower():
            return Decision(Status.SKIPPED, "Worked By déjà renseigné avec le bon collaborateur.", case, user, considered)
        return Decision(Status.REVIEW, f"Worked By déjà renseigné ({item.worker.name or item.worker.id}) avec un autre "
                        "collaborateur : jamais écrasé automatiquement.", case, user, considered)
    return Decision(Status.ASSIGNED, f"Case {case.number} — Owner {user.full_name}.", case, user, considered)


# outcomes where no case designates one of the four: the category rotation may decide instead
ROTATION_CODES = ("no_case", "owner_unknown")


def by_rotation(d: Decision, category_label: str, user: User) -> Decision:
    return Decision(Status.ASSIGNED, f"Rotation {category_label} : au tour de {user.first_name}. ({d.reason})",
                    None, user, d.considered, code="rotation", method="rotation")
