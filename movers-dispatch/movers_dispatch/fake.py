"""In-memory CRM with FICTITIOUS data, for tests and for trying the dashboard (connection "fake").

It reproduces the behaviours the agent relies on: lookups with their target table, ETag
concurrency (412), expired session (401), refused write, write without answer.
"""

from __future__ import annotations

import itertools
import uuid
from dataclasses import dataclass, field, replace

from .config import CaseRule, CaseRules, Collaborator, Config, Connection, Source
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
        connection=Connection(kind="fake"), source=Source(view_names=("Queue Item - Movers - Emails", "Queue Item - Movers tasks")),
        collaborators=tuple(Collaborator(k, u.first_name, u.id) for k, u in USERS.items() if k != "autre"),
        cases=CaseRules(rules=(CaseRule("title", contains="mover"),)), database=database, **agent)


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
    def add(self, label: str, subject: str, account: str | None, cases: list[tuple],
            worker: str | None = None, regarding_entity: str = "account", regarding_case: int = 0,
            kind: str = "email") -> str:
        """cases: (ticket number, owner key in USERS or "team", statecode[, title — default "Mover"]).
        regarding_entity "incident": the mail's Regarding is the case at index ``regarding_case``."""
        qid, eid, aid = gid(f"qi/{label}"), gid(f"em/{label}"), gid(f"acc/{label}")
        w = USERS[worker] if worker else None
        self.items[qid] = QueueItem(qid, subject, Lookup(eid, kind, subject),
                                    Lookup(w.id, "systemuser", w.full_name) if w else None, f'W/"{next(self._etags)}"')
        rows = []
        for n, (number, owner, state, *title) in enumerate(cases):
            if owner == "team":
                lk = Lookup(gid(f"team/{label}"), "team", "Équipe Movers")
            else:
                lk = Lookup(USERS[owner].id, "systemuser", USERS[owner].full_name)
            rows.append(Case(gid(f"case/{label}/{n}"), number, title[0] if title else "Mover", state, None, lk,
                             f"2026-10-{10 + n:02d}", customer=Lookup(aid, "account", account or "")))
        self.cases[aid] = rows
        if regarding_entity == "incident":
            c = rows[regarding_case]
            regarding = Lookup(c.id, "incident", c.title)
        else:
            regarding = Lookup(aid, regarding_entity, account) if account else None
        self.emails[eid] = Email(eid, subject, regarding, kind)
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

    def get_activity(self, entity: str, activity_id: str) -> Email:
        self._check()
        return self.emails[activity_id]

    def list_cases(self, account_id: str, extra_fields) -> list[Case]:
        self._check()
        return list(self.cases.get(account_id, []))

    def get_case(self, case_id: str, extra_fields) -> Case:
        self._check()
        for rows in self.cases.values():
            for c in rows:
                if c.id == case_id:
                    return c
        raise CrmError("Lecture du Case (Regarding) : HTTP 404", 404)

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
    """Fictitious queue covering the cases listed in the specification and the two recorded mails."""
    crm = FakeCrm()
    # recorded mail 1: Regarding = account, one "Mover" case, Canceled (statecode 2)
    crm.add("1", "Voir document joint (démo 1)", "Client Démo A", [("CAS-1001", "estefania", 2)])
    # recorded mail 2: Regarding = the "MOVERS" case (Canceled), the account also has a resolved "Mover" case
    crm.add("2", "Re : Contrat (démo 2)", "Client Démo B",
            [("CAS-1002", "estefania", 1, "Mover"), ("CAS-1003", "kader", 2, "MOVERS")],
            regarding_entity="incident", regarding_case=1)
    crm.add("3", "Changement de titulaire (démo 3)", "Client Démo C",
            [("CAS-1004", "marc-antoine", 0), ("CAS-0950", "kader", 1, "CARE - Separation Contrat")])
    crm.add("4", "Résiliation et restitution (démo 4)", "Client Démo D", [("CAS-1005", "chloe", 0)])
    crm.add("5", "Déménagement (démo 5)", "Client Démo E", [("CAS-1006", "kader", 1), ("CAS-1007", "chloe", 0)])
    crm.add("6", "Question sur contrat (démo 6)", "Client Démo F", [("CAS-1008", "chloe", 1, "Reactive Upgrade")])
    crm.add("7", "Déménagement (démo 7)", "Client Démo G", [("CAS-1009", "autre", 0), ("CAS-1010", "team", 0)])
    crm.add("8", "Déménagement (démo 8)", "Client Démo H", [("CAS-1011", "estefania", 0)], worker="estefania")
    crm.add("9", "Mail sans compte (démo 9)", None, [])
    crm.add("10", "Rappeler le client (tâche démo 10)", "Client Démo I", [("CAS-1012", "marc-antoine", 0, "MOVERS")],
            kind="task")
    return crm
