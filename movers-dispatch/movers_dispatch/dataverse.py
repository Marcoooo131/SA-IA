"""Dataverse Web API (the official API behind Dynamics 365) — the reads and the single write.

Every table, column and navigation property used below is a standard Dataverse name documented
by Microsoft (queueitem, email, account, incident, systemuser). ``preflight`` checks them against
the metadata of the real environment before anything runs, so a difference is reported instead
of being guessed. The transport carries the user's authorized session (see ``transports.py``):
the agent has exactly the rights of that user, nothing more.
"""

from __future__ import annotations

import base64
import re
from dataclasses import dataclass
from typing import Protocol

from .config import Config
from .models import Case, Email, Lookup, QueueItem, User
from .reading import html_to_text

ANNOTATIONS = 'odata.include-annotations="*"'
LOOKUP_NAME = "@OData.Community.Display.V1.FormattedValue"
LOOKUP_ENTITY = "@Microsoft.Dynamics.CRM.lookuplogicalname"
EMAIL_OTC = 4202          # objecttypecode of the email activity
TASK_OTC = 4212           # objecttypecode of the task activity
ACTIVITY_SETS = {"email": "emails", "task": "tasks"}   # activities the agent handles → Web API entity sets
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
    def get_activity(self, entity: str, activity_id: str) -> Email: ...
    def list_cases(self, account_id: str, extra_fields: tuple[str, ...]) -> list[Case]: ...
    def get_case(self, case_id: str, extra_fields: tuple[str, ...]) -> Case: ...
    def get_user(self, systemuser_id: str) -> User: ...
    def set_worked_by(self, item: QueueItem, systemuser_id: str) -> None: ...
    def client_preflight(self) -> list[str]: ...
    def find_accounts(self, fields: tuple[str, ...], values: list[str]) -> list[Lookup]: ...
    def account_link(self, entity: str, record_id: str, attribute: str) -> Lookup | None: ...
    def activity_account_field(self, kind: str) -> str | None: ...
    def set_regarding(self, activity: Email, account_id: str) -> None: ...
    def list_attachments(self, email_id: str) -> list[dict]: ...
    def get_attachment(self, attachment_id: str) -> dict: ...


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
            self.views()
        except CrmError as e:
            problems.append(str(e))
        return problems

    def views(self) -> list[dict]:
        """Resolves each configured view name to exactly one system view, else one personal view."""
        if getattr(self, "_views", None) is None:
            out = []
            for name in self.cfg.source.view_names:
                flt = f"returnedtypecode eq 'queueitem' and name eq '{_q(name)}'"
                rows = self._get("savedqueries", "Recherche de vue", {"$select": "savedqueryid,name", "$filter": flt}).get("value", [])
                if len(rows) == 1:
                    out.append({"name": name, "param": "savedQuery", "id": rows[0]["savedqueryid"].lower()})
                    continue
                mine = self._get("userqueries", "Recherche de vue personnelle", {"$select": "userqueryid,name", "$filter": flt}).get("value", [])
                if len(rows) == 0 and len(mine) == 1:
                    out.append({"name": name, "param": "userQuery", "id": mine[0]["userqueryid"].lower()})
                    continue
                raise CrmError(f"Vue « {name} » : {len(rows) + len(mine)} résultat(s), une seule attendue "
                               "(vérifier le nom exact avec `discover`).")
            self._views = out
        return self._views

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
        if src.view_names:
            rows = []
            for v in self.views():
                rows += self._get_all("queueitems", f"Lecture de la vue « {v['name']} »", {v["param"]: v["id"]})
        elif src.saved_view_id or src.user_view_id:
            params = {"savedQuery": guid(src.saved_view_id)} if src.saved_view_id else {"userQuery": guid(src.user_view_id)}
            rows = self._get_all("queueitems", "Lecture de la vue Movers", params)
        else:
            params = {"$select": select, "$orderby": "createdon asc",
                      "$filter": f"_queueid_value eq {self.queue_id()} and statecode eq 0 and "
                                 f"(objecttypecode eq {EMAIL_OTC} or objecttypecode eq {TASK_OTC})"}
            rows = self._get_all("queueitems", "Lecture de la file Movers", params)
        items, seen = [], set()
        for i in (self._item(r) for r in rows):
            # the same item can appear in two views; a view may carry other activity types or omit columns
            if i.id not in seen and (i.object is None or i.object.entity in (*ACTIVITY_SETS, "")):
                seen.add(i.id)
                items.append(i)
        return items

    def get_queue_item(self, queueitem_id: str) -> QueueItem:
        row = self._get(f"queueitems({guid(queueitem_id)})", "Lecture du Queue Item",
                        {"$select": "queueitemid,title,_objectid_value,_workerid_value,modifiedon,statecode"})
        return self._item(row)

    def get_activity(self, entity: str, activity_id: str) -> Email:
        if entity not in ACTIVITY_SETS:
            raise CrmError(f"Type d'activité non pris en charge : {entity}")
        select = "activityid,subject,_regardingobjectid_value,description" + (",sender" if entity == "email" else "")
        row = self._get(f"{ACTIVITY_SETS[entity]}({guid(activity_id)})", "Lecture du mail" if entity == "email" else "Lecture de la tâche",
                        {"$select": select})
        return Email(id=row["activityid"].lower(), subject=row.get("subject") or "", regarding=_lookup(row, "regardingobjectid"),
                     kind=entity, text=html_to_text(row.get("description") or ""), sender=(row.get("sender") or "").strip(),
                     etag=row.get("@odata.etag", ""))

    def get_email(self, email_id: str) -> Email:
        return self.get_activity("email", email_id)

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

    # --- finding the client when the Regarding is empty
    def client_preflight(self) -> list[str]:
        """Checks the columns and relations used to find the client and fill the Regarding."""
        c = self.cfg.client
        problems = []
        for f in (*c.email_fields, *c.phone_fields, "accountnumber"):
            if self.t.request("GET", f"EntityDefinitions(LogicalName='account')/Attributes(LogicalName='{_q(f)}')").status != 200:
                problems.append(f"Recherche du client : la colonne account.{f} n'existe pas (corriger [client] dans dispatch.toml).")
        for kind, nav in c.regarding_navigation.items():
            rels = self._get(f"EntityDefinitions(LogicalName='{_q(kind)}')/ManyToOneRelationships", f"Relations de {kind}",
                             {"$select": "ReferencingAttribute,ReferencedEntity,ReferencingEntityNavigationPropertyName"})
            navs = {r.get("ReferencingEntityNavigationPropertyName") for r in rels.get("value", [])
                    if r.get("ReferencingAttribute") == "regardingobjectid" and r.get("ReferencedEntity") == "account"}
            if nav not in navs:
                problems.append(f"Regarding de {kind} : propriété « {nav} » absente (trouvées : {sorted(n for n in navs if n)}).")
        for entity, attr in c.account_links.items():
            if self.t.request("GET", f"EntityDefinitions(LogicalName='{_q(entity)}')/Attributes(LogicalName='{_q(attr)}')").status != 200:
                problems.append(f"liens_compte : la colonne {entity}.{attr} n'existe pas (voir `discover --table {entity}`).")
        return problems

    def find_accounts(self, fields: tuple[str, ...], values: list[str]) -> list[Lookup]:
        """Active accounts whose one of ``fields`` equals one of ``values`` exactly (case-insensitive)."""
        if not fields or not values:
            return []
        cond = " or ".join(f"{f} eq '{_q(v)}'" for f in fields for v in values)
        rows = self._get("accounts", "Recherche du client", {
            "$select": "accountid,name,accountnumber", "$filter": f"statecode eq 0 and ({cond})", "$top": "10"}).get("value", [])
        return [Lookup(r["accountid"].lower(), "account", f"{r.get('name') or ''} ({r.get('accountnumber') or '?'})") for r in rows]

    def _entity_set(self, entity: str) -> str:
        cache = self.__dict__.setdefault("_sets", dict(ACTIVITY_SETS))
        if entity not in cache:
            cache[entity] = self._get(f"EntityDefinitions(LogicalName='{_q(entity)}')", f"Métadonnées de {entity}",
                                      {"$select": "EntitySetName"})["EntitySetName"]
        return cache[entity]

    def activity_account_field(self, kind: str) -> str | None:
        """The activity's own « Account » column (the tasks show one, set by the chatbot or the advisor),
        found in the CRM metadata: the only lookup to an account other than the Regarding."""
        cache = self.__dict__.setdefault("_own_account", {})
        if kind not in cache:
            try:
                rels = self._get(f"EntityDefinitions(LogicalName='{_q(kind)}')/ManyToOneRelationships", f"Relations de {kind}",
                                 {"$select": "ReferencingAttribute,ReferencedEntity"}).get("value", [])
                found = sorted({r["ReferencingAttribute"] for r in rels if r.get("ReferencedEntity") == "account"
                                and r.get("ReferencingAttribute") not in ("regardingobjectid", "owningbusinessunit")})
            except SessionExpired:
                raise
            except CrmError:
                found = []
            cache[kind] = found[0] if len(found) == 1 else None
        return cache[kind]

    def account_link(self, entity: str, record_id: str, attribute: str) -> Lookup | None:
        row = self._get(f"{self._entity_set(entity)}({guid(record_id)})", f"Lecture du compte lié ({entity})",
                        {"$select": f"_{attribute}_value"})
        link = _lookup(row, attribute)
        return link if link and link.entity == "account" else None

    def set_regarding(self, activity: Email, account_id: str) -> None:
        if not activity.etag:
            raise CrmError("Écriture refusée : version (ETag) de l'activité inconnue.")
        nav = self.cfg.client.regarding_navigation.get(activity.kind)
        if not nav:
            raise CrmError(f"Pas de propriété Regarding configurée pour {activity.kind}.")
        self.writes += 1
        body = {f"{nav}@odata.bind": f"/accounts({guid(account_id)})"}
        try:
            resp = self.t.request("PATCH", f"{ACTIVITY_SETS[activity.kind]}({guid(activity.id)})", json=body,
                                  headers={"If-Match": activity.etag})
        except TimeoutError as e:
            raise UncertainWrite("Enregistrement du Regarding sans réponse : résultat inconnu, vérification nécessaire.") from e
        if resp.status not in (200, 204):
            raise _error(resp, "Enregistrement du Regarding")

    # --- attachments of a mail (scanned letters): shown to the person, never stored
    def list_attachments(self, email_id: str) -> list[dict]:
        rows = self._get("activitymimeattachments", "Pièces jointes du mail", {
            "$select": "activitymimeattachmentid,filename,mimetype,filesize",
            "$filter": f"_objectid_value eq {guid(email_id)}"}).get("value", [])
        return [{"id": r["activitymimeattachmentid"].lower(), "filename": r.get("filename") or "piece-jointe",
                 "mimetype": r.get("mimetype") or "", "size": r.get("filesize") or 0} for r in rows]

    def get_attachment(self, attachment_id: str) -> dict:
        r = self._get(f"activitymimeattachments({guid(attachment_id)})", "Lecture de la pièce jointe",
                      {"$select": "filename,mimetype,body,_objectid_value"})
        return {"filename": r.get("filename") or "piece-jointe", "mimetype": r.get("mimetype") or "",
                "object_id": (r.get("_objectid_value") or "").lower(), "content": base64.b64decode(r.get("body") or "")}

    # --- discovery helpers (read-only, used by the `discover` command)
    def account_lookups(self, entity: str) -> list[str]:
        rels = self._get(f"EntityDefinitions(LogicalName='{_q(entity)}')/ManyToOneRelationships", f"Relations de {entity}",
                         {"$select": "ReferencingAttribute,ReferencedEntity"})
        return sorted({r["ReferencingAttribute"] for r in rels.get("value", []) if r.get("ReferencedEntity") == "account"})

    def phone_like_columns(self) -> list[tuple[str, str]]:
        rows = self._get("EntityDefinitions(LogicalName='account')/Attributes", "Colonnes du compte",
                         {"$select": "LogicalName,DisplayName,AttributeType"}).get("value", [])
        out = []
        for r in rows:
            label = ((r.get("DisplayName") or {}).get("UserLocalizedLabel") or {}).get("Label", "") or ""
            if r.get("AttributeType") == "String" and any(w in label.lower() for w in ("phone", "téléphone", "mobile", "tel")):
                out.append((r["LogicalName"], label))
        return sorted(out)


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
