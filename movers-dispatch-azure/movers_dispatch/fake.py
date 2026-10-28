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
    client_problems: list[str] = field(default_factory=list)
    accounts: dict[str, dict] = field(default_factory=dict)   # id → name, number, emails, phones, active
    regarding_log: list[tuple[str, str]] = field(default_factory=list)
    attachments: dict[str, list[dict]] = field(default_factory=dict)   # email id → files
    own_accounts: dict[str, str] = field(default_factory=dict)        # task id → its « Account » field
    _etags: itertools.count = field(default_factory=lambda: itertools.count(1))

    def _check(self):
        if self.session_expired:
            raise SessionExpired("Session Dynamics 365 expirée ou non connectée.", 401)

    # --- building data
    def add_account(self, label: str, name: str, number: str = "", emails=(), phones=(), active: bool = True) -> str:
        aid = gid(f"acc/{label}")
        self.accounts[aid] = {"name": name, "number": number or str(10000000 + int(uuid.UUID(aid)) % 9000000),
                              "emails": [e.lower() for e in emails], "phones": list(phones), "active": active}
        return aid

    def add(self, label: str, subject: str, account: str | None, cases: list[tuple],
            worker: str | None = None, regarding_entity: str | None = "account", regarding_case: int = 0,
            kind: str = "email", text: str = "", sender: str = "", account_number: str = "",
            account_emails=(), account_phones=(), files=(), own_account: bool = False) -> str:
        """cases: (ticket number, owner key in USERS or "team", statecode[, title — default "Mover"]).
        regarding_entity "incident": the mail's Regarding is the case at index ``regarding_case``;
        None: Regarding empty (the account still exists, to be found from ``text`` / ``sender``)."""
        qid, eid, aid = gid(f"qi/{label}"), gid(f"em/{label}"), gid(f"acc/{label}")
        if account:
            self.add_account(label, account, account_number, account_emails, account_phones)
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
        elif regarding_entity is None:
            regarding = None
        elif regarding_entity == "contract":
            regarding = Lookup(gid(f"contract/{label}"), "contract", "C-SFR-000000000")
        else:
            regarding = Lookup(aid, regarding_entity, self._account_label(aid) if account else "") if account else None
        self.emails[eid] = Email(eid, subject, regarding, kind, text=text, sender=sender, etag=f'W/"{next(self._etags)}"')
        if own_account and account:
            self.own_accounts[eid] = aid
        self.attachments[eid] = [{"id": gid(f"att/{label}/{n}"), "filename": name, "mimetype": mime, "size": len(data),
                                  "content": data} for n, (name, mime, data) in enumerate(files)]
        return qid

    def _account_label(self, aid: str) -> str:
        a = self.accounts[aid]
        return f"{a['name']} ({a['number']})"

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

    def client_preflight(self) -> list[str]:
        self._check()
        return list(self.client_problems)

    def find_accounts(self, fields, values) -> list[Lookup]:
        self._check()
        values = {v.lower() for v in values}
        key = "number" if "accountnumber" in fields else ("emails" if any(f.startswith("email") for f in fields) else "phones")
        out = []
        for aid, a in self.accounts.items():
            have = {a["number"]} if key == "number" else set(a[key])
            if a["active"] and have & values:
                out.append(Lookup(aid, "account", self._account_label(aid)))
        return out

    def list_attachments(self, email_id: str) -> list[dict]:
        self._check()
        return [{k: v for k, v in a.items() if k != "content"} for a in self.attachments.get(email_id, [])]

    def get_attachment(self, attachment_id: str) -> dict:
        self._check()
        for eid, files in self.attachments.items():
            for a in files:
                if a["id"] == attachment_id:
                    return {"filename": a["filename"], "mimetype": a["mimetype"], "object_id": eid, "content": a["content"]}
        raise CrmError("Lecture de la pièce jointe : HTTP 404", 404)

    def activity_account_field(self, kind: str):
        return "sa_accountid" if kind == "task" else None

    def account_link(self, entity, record_id, attribute):
        self._check()
        aid = self.own_accounts.get(record_id) if entity == "task" else None
        return Lookup(aid, "account", self._account_label(aid)) if aid else None

    def set_regarding(self, activity: Email, account_id: str) -> None:
        self._check()
        self.writes += 1
        current = self.emails[activity.id]
        if current.etag != activity.etag:
            raise ConcurrentModification("Enregistrement du Regarding : modifié par un autre utilisateur.", 412)
        if self.refuse_write:
            raise CrmError("Enregistrement du Regarding : HTTP 403 — privilège insuffisant", 403)
        self.emails[activity.id] = replace(current, regarding=Lookup(account_id, "account", self._account_label(account_id)),
                                           etag=f'W/"{next(self._etags)}"')
        self.regarding_log.append((activity.id, account_id))

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


def demo_pdf(lines: list[str]) -> bytes:
    """A one-page PDF with the given lines (stands for a scanned letter in the demo)."""
    text = "BT /F1 16 Tf 60 760 Td 22 TL " + " ".join(
        "(" + ln.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)") + ") '" for ln in lines) + " ET"
    stream = text.encode("latin-1", "replace")
    objs = [b"<< /Type /Catalog /Pages 2 0 R >>", b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
            b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
            b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream"]
    out, offsets = bytearray(b"%PDF-1.4\n"), []
    for n, body in enumerate(objs, 1):
        offsets.append(len(out))
        out += b"%d 0 obj\n" % n + body + b"\nendobj\n"
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objs) + 1) + b"".join(b"%010d 00000 n \n" % o for o in offsets)
    out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objs) + 1, xref)
    return bytes(out)


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
    # recorded procedure n°2 (Regarding empty): the client is found like a person would do it
    crm.add("11", "Résiliation Sector alarme (démo 11)", "Client Démo J", [], regarding_entity=None,
            sender="client.demo.j@example.com", account_emails=["client.demo.j@example.com"],
            text="Suite à votre mail, je souhaite résilier mon contrat.")
    crm.add("12", "RE: Désactivation alarme (démo 12)", "Client Démo K", [], regarding_entity=None,
            sender="gestion@agence-demo.example", account_number="10008799",
            text="Voici les références : Numéro de client : 10008799. L'alarme sera désactivée demain.")
    crm.add("13", 'You\'ve got a new submission on the HubSpot Form "[FR] - CS | Moving Home" (démo 13)', "Client Démo L",
            [], regarding_entity=None, sender="noreply@notifications.hubspot.com", account_emails=["client.demo.l@example.com"],
            text="Email\nclient.demo.l@example.com\nVotre nouvelle adresse\n7 rue de la Démo 25000\nDate de déménagement")
    crm.add("14", "Chatbot customer request: Termination of contract due to moving (démo 14)", "Client Démo M", [],
            kind="task", text="Termination of contract due to moving home. Customer Démo M, Phone: +33600000014.")
    crm.add("15", "Déménagement sans indice (démo 15)", None, [], regarding_entity=None, sender="inconnu@example.com",
            text="Bonjour, je déménage le mois prochain.")
    # recorded procedure n°3: scanned letter, the customer number is handwritten in the PDF
    crm.add("16", "Voir document joint (démo 16)", "Client Démo N", [], regarding_entity=None, account_number="10090016",
            sender="noreply@sectoralarm.fr", text="%Sector Alarm RENNES CDE", files=[("lettre-scannee.pdf", "application/pdf",
            demo_pdf(["LETTRE FICTIVE DE DEMONSTRATION", "", "Client Demo N", "n° client 10090016",
                      "Par la presente, je demande la resiliation de mon contrat", "suite a mon demenagement."]))])
    # recorded procedure n°4: task whose Regarding is a contract; the client is in its « Account » field
    crm.add("17", "Movers - Résiliation (démo 17)", "Client Démo O", [("CAS-1013", "autre", 1, "Collection case ECHURN"),
            ("CAS-1014", "chloe", 0, "MOVERS")], kind="task", regarding_entity="contract", own_account=True)
    # organisation of 27/10: one rotation per task name
    crm.add("18", "Movers - Takeovers (démo 18)", "Client Démo P", [], kind="task", regarding_entity="contract", own_account=True)
    crm.add("19", "Prio - Movers - Déménagement (démo 19)", "Client Démo Q", [], kind="task", own_account=True)
    crm.add("20", "Movers - Résiliation exception (démo 20)", "Client Démo R", [], kind="task", own_account=True)
    crm.add("21", "Movers - Résiliation (démo 21)", "Client Démo S", [], kind="task", own_account=True)
    return crm
