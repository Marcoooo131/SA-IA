"""Dataverse Web API (the official API behind Dynamics 365) — the reads and the single write.

Every table, column and navigation property used below is a standard Dataverse name documented
by Microsoft (queueitem, email, account, incident, systemuser). ``preflight`` checks them against
the metadata of the real environment before anything runs, so a difference is reported instead
of being guessed. The transport carries the user's authorized session (see ``transports.py``):
the agent has exactly the rights of that user, nothing more.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Protocol

from .config import Config
from .models import Case, Email, Lookup, QueueItem, User

ANNOTATIONS = 'odata.include-annotations="*"'
LOOKUP_NAME = "@OData.Community.Display.V1.FormattedValue"
LOOKUP_ENTITY = "@Microsoft.Dynamics.CRM.lookuplogicalname"
EMAIL_OTC = 4202          # objecttypecode of the email activity
_GUID = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")


class CrmError(Exception):
    """A read or write failed. ``status`` is the HTTP status when there is one."""

    def __init__(self, message: str, status: int | None = None):
        super().__init__(message)
        self.status = status


class SessionExpired(CrmError):
    pass


class ConcurrentModification(CrmError):
    pass


class UncertainWrite(CrmError):
    """The write request got no answer: it may or may not have been applied."""


@dataclass
class Response:
    status: int
    body: dict | None
    headers: dict


class Transport(Protocol):
    def request(self, method: str, path: str, *, params: dict | None = None, json: dict | None = None,
                headers: dict | None = None) -> Response: ...

    def close(self) -> None: ...


class Gateway(Protocol):
    """What the agent needs from the CRM. Implemented by DataverseGateway and fake.FakeCrm."""

    writes: int

    def preflight(self) -> list[str]: ...
    def list_queue_items(self) -> list[QueueItem]: ...
    def get_queue_item(self, queueitem_id: str) -> QueueItem: ...
    def get_email(self, email_id: str) -> Email: ...
    def list_cases(self, account_id: str, extra_fields: tuple[str, ...]) -> list[Case]: ...
    def get_case(self, case_id: str, extra_fields: tuple[str, ...]) -> Case: ...
    def get_user(self, systemuser_id: str) -> User: ...
    def set_worked_by(self, item: QueueItem, systemuser_id: str) -> None: ...


def guid(value: str) -> str:
    if not _GUID.match(value or ""):
        raise CrmError(f"Identifiant invalide : {value!r}")
    return value.lower()


def _q(value: str) -> str:
    return value.replace("'", "''")


def _lookup(row: dict, attr: str) -> Lookup | None:
    key = f"_{attr}_value"
    if not row.get(key):
        return None
    return Lookup(id=row[key].lower(), entity=row.get(key + LOOKUP_ENTITY, ""), name=row.get(key + LOOKUP_NAME, ""))


def _error(resp: Response, what: str) -> CrmError:
    msg = ""
    if isinstance(resp.body, dict):
        msg = (resp.body.get("error") or {}).get("message", "")
    text = f"{what} : HTTP {resp.status}" + (f" — {msg[:200]}" if msg else "")
    if resp.status == 401:
        return SessionExpired(f"Session Dynamics 365 expirée ou non connectée ({what}).", 401)
    if resp.status == 412:
        return ConcurrentModification(f"{what} : l'élément a été modifié par un autre utilisateur entre-temps.", 412)
    return CrmError(text, resp.status)


class DataverseGateway:
    def __init__(self, cfg: Config, transport: Transport):
        self.cfg = cfg
        self.t = transport
        self.writes = 0
        self._queue_id: str | None = None

    # --- low level
    def _get(self, path: str, what: str, params: dict | None = None) -> dict:
        resp = self.t.request("GET", path, params=params, headers={"Prefer": ANNOTATIONS})
        if resp.status != 200:
            raise _error(resp, what)
        return resp.body or {}

    def _get_all(self, path: str, what: str, params: dict) -> list[dict]:
        out: list[dict] = []
        body = self._get(path, what, params)
        while True:
            out.extend(body.get("value", []))
            nxt = body.get("@odata.nextLink")
            if not nxt or len(out) >= self.cfg.max_items_per_run * 5:
                return out
            body = self._get(nxt, what)

    # --- checks
    def preflight(self) -> list[str]:
        """Reads the real metadata. Returns blocking problems (empty list = ready)."""
        problems: list[str] = []
        self._get("WhoAmI", "Connexion (WhoAmI)")
        attr = self._get("EntityDefinitions(LogicalName='queueitem')/Attributes(LogicalName='workerid')",
                         "Métadonnées queueitem.workerid")
        label = ((attr.get("DisplayName") or {}).get("UserLocalizedLabel") or {}).get("Label", "")
        if not attr.get("IsValidForUpdate", False):
            problems.append(f"Le champ Worked By (queueitem.workerid, libellé « {label} ») n'est pas modifiable.")
        rels = self._get("EntityDefinitions(LogicalName='queueitem')/ManyToOneRelationships",
                         "Relations de queueitem",
                         {"$select": "ReferencingAttribute,ReferencedEntity,ReferencingEntityNavigationPropertyName"})
        navs = {r.get("ReferencingEntityNavigationPropertyName") for r in rels.get("value", [])
                if r.get("ReferencingAttribute") == "workerid" and r.get("ReferencedEntity") == "systemuser"}
        if self.cfg.worked_by_navigation not in navs:
            problems.append(f"Propriété de navigation « {self.cfg.worked_by_navigation} » absente pour Worked By "
                            f"(trouvées : {sorted(n for n in navs if n)}) : corriger agent.worked_by_navigation.")
        for f in self.cfg.cases.extra_fields:
            r = self.t.request("GET", f"EntityDefinitions(LogicalName='incident')/Attributes(LogicalName='{_q(f)}')")
            if r.status != 200:
                problems.append(f"Règle de Case : la colonne incident.{f} n'existe pas.")
        try:
            self.queue_id()
        except CrmError as e:
            problems.append(str(e))
        return problems

    def queue_id(self) -> str | None:
        src = self.cfg.source
        if not src.queue_name or self._queue_id:
            return self._queue_id
        rows = self._get("queues", "Recherche de la file", {"$select": "queueid,name",
                         "$filter": f"name eq '{_q(src.queue_name)}'"}).get("value", [])
        if len(rows) != 1:
            raise CrmError(f"File « {src.queue_name} » : {len(rows)} résultat(s), une seule attendue.")
        self._queue_id = rows[0]["queueid"].lower()
        return self._queue_id

    # --- reads
    def _item(self, row: dict) -> QueueItem:
        return QueueItem(id=row["queueitemid"].lower(), title=row.get("title") or "", object=_lookup(row, "objectid"),
                         worker=_lookup(row, "workerid"), etag=row.get("@odata.etag", ""),
                         modified_on=row.get("modifiedon", ""))

    def list_queue_items(self) -> list[QueueItem]:
        src = self.cfg.source
        select = "queueitemid,title,objecttypecode,_objectid_value,_workerid_value,modifiedon,statecode"
        if src.saved_view_id or src.user_view_id:
            params = {"savedQuery": guid(src.saved_view_id)} if src.saved_view_id else {"userQuery": guid(src.user_view_id)}
            rows = self._get_all("queueitems", "Lecture de la vue Movers Emails", params)
        else:
            params = {"$select": select, "$orderby": "createdon asc",
                      "$filter": f"_queueid_value eq {self.queue_id()} and statecode eq 0 and objecttypecode eq {EMAIL_OTC}"}
            rows = self._get_all("queueitems", "Lecture de la file Movers Emails", params)
        items = [self._item(r) for r in rows]
        # a view may carry other activity types or omit columns: keep emails only, re-read when needed
        return [i for i in items if i.object is None or i.object.entity in ("email", "")]

    def get_queue_item(self, queueitem_id: str) -> QueueItem:
        row = self._get(f"queueitems({guid(queueitem_id)})", "Lecture du Queue Item",
                        {"$select": "queueitemid,title,_objectid_value,_workerid_value,modifiedon,statecode"})
        return self._item(row)

    def get_email(self, email_id: str) -> Email:
        row = self._get(f"emails({guid(email_id)})", "Lecture du mail", {"$select": "activityid,subject,_regardingobjectid_value"})
        return Email(id=row["activityid"].lower(), subject=row.get("subject") or "", regarding=_lookup(row, "regardingobjectid"))

    _CASE_BASE = ["incidentid", "ticketnumber", "title", "statecode", "statuscode", "_ownerid_value",
                  "_customerid_value", "createdon"]

    @staticmethod
    def _case(r: dict, extra_fields: tuple[str, ...]) -> Case:
        return Case(id=r["incidentid"].lower(), number=r.get("ticketnumber") or "", title=r.get("title") or "",
                    state=r.get("statecode", -1), status=r.get("statuscode"), owner=_lookup(r, "ownerid"),
                    created_on=r.get("createdon", ""), fields={f: r.get(f) for f in extra_fields},
                    customer=_lookup(r, "customerid"))

    def _case_select(self, extra_fields: tuple[str, ...]) -> str:
        return ",".join(self._CASE_BASE + [f for f in extra_fields if f not in self._CASE_BASE + ["title"]])

    def list_cases(self, account_id: str, extra_fields: tuple[str, ...]) -> list[Case]:
        rows = self._get_all("incidents", "Lecture des Cases du compte", {
            "$select": self._case_select(extra_fields),
            "$filter": f"_customerid_value eq {guid(account_id)}", "$orderby": "createdon desc"})
        return [self._case(r, extra_fields) for r in rows]

    def get_case(self, case_id: str, extra_fields: tuple[str, ...]) -> Case:
        r = self._get(f"incidents({guid(case_id)})", "Lecture du Case (Regarding)", {"$select": self._case_select(extra_fields)})
        return self._case(r, extra_fields)

    def get_user(self, systemuser_id: str) -> User:
        r = self._get(f"systemusers({guid(systemuser_id)})", "Lecture de l'utilisateur",
                      {"$select": "systemuserid,firstname,fullname,isdisabled"})
        return User(id=r["systemuserid"].lower(), first_name=r.get("firstname") or "", full_name=r.get("fullname") or "",
                    disabled=bool(r.get("isdisabled")))

    # --- the only write
    def set_worked_by(self, item: QueueItem, systemuser_id: str) -> None:
        if not item.etag:
            raise CrmError("Écriture refusée : version (ETag) du Queue Item inconnue.")
        self.writes += 1
        body = {f"{self.cfg.worked_by_navigation}@odata.bind": f"/systemusers({guid(systemuser_id)})"}
        try:
            resp = self.t.request("PATCH", f"queueitems({guid(item.id)})", json=body, headers={"If-Match": item.etag})
        except TimeoutError as e:
            raise UncertainWrite("Enregistrement sans réponse : résultat inconnu, vérification nécessaire.") from e
        if resp.status not in (200, 204):
            raise _error(resp, "Enregistrement de Worked By")

    # --- discovery helpers (read-only, used by the `discover` command)
    def api_versions(self) -> list[str]:
        """Web API versions that answer for this session (on-premises 8.x or online 9.x)."""
        root = self.cfg.connection.environment_url.rstrip("/")
        ok = []
        for v in ("v9.2", "v9.1", "v9.0", "v8.2", "v8.1", "v8.0"):
            try:
                if self.t.request("GET", f"{root}/api/data/{v}/WhoAmI").status == 200:
                    ok.append(v)
            except (CrmError, TimeoutError):
                pass
        return ok

    def find_queues(self, text: str) -> list[dict]:
        return self._get("queues", "Recherche des files", {"$select": "queueid,name",
                         "$filter": f"contains(name,'{_q(text)}')"}).get("value", [])

    def find_views(self, text: str) -> list[dict]:
        saved = self._get("savedqueries", "Vues système", {"$select": "savedqueryid,name",
                          "$filter": f"returnedtypecode eq 'queueitem' and contains(name,'{_q(text)}')"}).get("value", [])
        mine = self._get("userqueries", "Vues personnelles", {"$select": "userqueryid,name",
                         "$filter": f"returnedtypecode eq 'queueitem' and contains(name,'{_q(text)}')"}).get("value", [])
        return [{"type": "saved_view_id", "id": v["savedqueryid"], "name": v["name"]} for v in saved] + \
               [{"type": "user_view_id", "id": v["userqueryid"], "name": v["name"]} for v in mine]

    def find_users(self, first_name: str) -> list[dict]:
        return self._get("systemusers", "Recherche des utilisateurs", {
            "$select": "systemuserid,firstname,lastname,fullname,domainname,isdisabled",
            "$filter": f"startswith(firstname,'{_q(first_name)}')"}).get("value", [])
