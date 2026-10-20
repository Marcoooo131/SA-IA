"""In-memory CRM with FICTITIOUS data, for tests and for trying the dashboard (connection "fake").

It reproduces the behaviours the agent relies on: lookups with their target table, ETag
concurrency (412), expired session (401), refused write, write without answer.
"""

from __future__ import annotations

import itertools
import uuid
from dataclasses import dataclass, field, replace

from .config import CaseRules, Collaborator, Config, Connection, Source
from .dataverse import ConcurrentModification, CrmError, SessionExpired, UncertainWrite
from .models import Case, Email, Lookup, QueueItem, User


def gid(label: str) -> str:
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"movers-dispatch-demo/{label}"))


USERS = {
    "kader": User(gid("u/kader"), "Kader", "Kader Exemple", False),
    "estefania": User(gid("u/estefania"), "Estefania", "Estefania Exemple", False),
    "marc-antoine": User(gid("u/marc-antoine"), "Marc-Antoine", "Marc-Antoine Exemple", False),
    "chloe": User(gid("u/chloe"), "Chloé", "Chloé Exemple", False),
    "autre": User(gid("u/autre"), "Camille", "Camille Autre-Service", False),
}


def demo_config(database: str = ":memory:", **agent) -> Config:
    return Config(
        connection=Connection(kind="fake"), source=Source(queue_name="Movers Emails (démo)"),
        collaborators=tuple(Collaborator(k, u.first_name, u.id) for k, u in USERS.items() if k != "autre"),
        cases=CaseRules(), database=database, **agent)


@dataclass
class FakeCrm:
    items: dict[str, QueueItem] = field(default_factory=dict)
    emails: dict[str, Email] = field(default_factory=dict)
    cases: dict[str, list[Case]] = field(default_factory=dict)
    users: dict[str, User] = field(default_factory=lambda: {u.id: u for u in USERS.values()})
    writes: int = 0
    write_log: list[tuple[str, str]] = field(default_factory=list)
    # failure injection
    session_expired: bool = False
    refuse_write: bool = False
    lost_answer: bool = False          # the write is applied but the answer never arrives
    concurrent_edit: set[str] = field(default_factory=set)
    preflight_problems: list[str] = field(default_factory=list)
    _etags: itertools.count = field(default_factory=lambda: itertools.count(1))

    def _check(self):
        if self.session_expired:
            raise SessionExpired("Session Dynamics 365 expirée ou non connectée.", 401)

    # --- building data
    def add(self, label: str, subject: str, account: str | None, cases: list[tuple[str, str, int]],
            worker: str | None = None, regarding_entity: str = "account") -> str:
        """cases: (ticket number, owner key in USERS or "team", statecode)."""
        qid, eid, aid = gid(f"qi/{label}"), gid(f"em/{label}"), gid(f"acc/{label}")
        regarding = Lookup(aid, regarding_entity, account) if account else None
        self.emails[eid] = Email(eid, subject, regarding)
        w = USERS[worker] if worker else None
        self.items[qid] = QueueItem(qid, subject, Lookup(eid, "email", subject),
                                    Lookup(w.id, "systemuser", w.full_name) if w else None, f'W/"{next(self._etags)}"')
        rows = []
        for n, (number, owner, state) in enumerate(cases):
            if owner == "team":
                lk = Lookup(gid(f"team/{label}"), "team", "Équipe Movers")
            else:
                lk = Lookup(USERS[owner].id, "systemuser", USERS[owner].full_name)
            rows.append(Case(gid(f"case/{label}/{n}"), number, "Déménagement", state, None, lk, f"2026-10-{10 + n:02d}"))
        self.cases[aid] = rows
        return qid

    # --- Gateway
    def preflight(self) -> list[str]:
        self._check()
        return list(self.preflight_problems)

    def list_queue_items(self) -> list[QueueItem]:
        self._check()
        return list(self.items.values())

    def get_queue_item(self, queueitem_id: str) -> QueueItem:
        self._check()
        if queueitem_id not in self.items:
            raise CrmError("Lecture du Queue Item : HTTP 404", 404)
        return self.items[queueitem_id]

    def get_email(self, email_id: str) -> Email:
        self._check()
        return self.emails[email_id]

    def list_cases(self, account_id: str, extra_fields) -> list[Case]:
        self._check()
        return list(self.cases.get(account_id, []))

    def get_user(self, systemuser_id: str) -> User:
        self._check()
        return self.users[systemuser_id]

    def set_worked_by(self, item: QueueItem, systemuser_id: str) -> None:
        self._check()
        self.writes += 1
        current = self.items[item.id]
        if item.id in self.concurrent_edit or current.etag != item.etag:
            raise ConcurrentModification("Enregistrement de Worked By : modifié par un autre utilisateur.", 412)
        if self.refuse_write:
            raise CrmError("Enregistrement de Worked By : HTTP 403 — privilège insuffisant", 403)
        u = self.users[systemuser_id]
        self.items[item.id] = replace(current, worker=Lookup(u.id, "systemuser", u.full_name), etag=f'W/"{next(self._etags)}"')
        self.write_log.append((item.id, systemuser_id))
        if self.lost_answer:
            raise UncertainWrite("Enregistrement sans réponse : résultat inconnu, vérification nécessaire.")


def demo_crm() -> FakeCrm:
    """Fictitious queue covering the cases listed in the specification."""
    crm = FakeCrm()
    crm.add("1", "Déménagement — demande de transfert (démo 1)", "Client Démo A", [("CAS-1001", "kader", 0)])
    crm.add("2", "Changement d'adresse (démo 2)", "Client Démo B", [("CAS-1002", "estefania", 0)])
    crm.add("3", "Nouveau logement (démo 3)", "Client Démo C", [("CAS-1003", "marc-antoine", 0), ("CAS-0950", "kader", 1)])
    crm.add("4", "Transfert d'installation (démo 4)", "Client Démo D", [("CAS-1004", "chloe", 0)])
    crm.add("5", "Déménagement (démo 5)", "Client Démo E", [("CAS-1005", "kader", 0), ("CAS-1006", "chloe", 0)])
    crm.add("6", "Question sur contrat (démo 6)", "Client Démo F", [("CAS-1007", "chloe", 1)])
    crm.add("7", "Déménagement (démo 7)", "Client Démo G", [("CAS-1008", "autre", 0), ("CAS-1009", "team", 0)])
    crm.add("8", "Déménagement (démo 8)", "Client Démo H", [("CAS-1010", "estefania", 0)], worker="estefania")
    crm.add("9", "Mail sans compte (démo 9)", None, [])
    return crm
