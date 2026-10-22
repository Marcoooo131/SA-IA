"""Configuration file (TOML). See ``config/dispatch.example.toml`` for every key.

Everything that is specific to the Sector Alarm Dynamics 365 tenant (environment URL, queue or
view, collaborator user ids, Movers case rules) is a configuration value filled from what
``movers-dispatch discover`` reads in the CRM. Nothing tenant-specific is hard-coded.
"""

from __future__ import annotations

import tomllib
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path

from .models import Mode

GUID_LEN = 36


class ConfigError(ValueError):
    pass


def normalize_name(value: str) -> str:
    """Case- and accent-insensitive form used only to cross-check a first name, never to find a user."""
    decomposed = unicodedata.normalize("NFKD", value or "")
    return "".join(c for c in decomposed if not unicodedata.combining(c)).casefold().strip()


@dataclass(frozen=True)
class Collaborator:
    key: str
    first_name: str          # expected value displayed in Worked By (cross-check of systemuser.firstname)
    systemuser_id: str       # the real Dynamics 365 user record; empty = not configured yet


@dataclass(frozen=True)
class CaseRule:
    field: str
    equals: object = None
    in_: tuple = ()
    contains: str = ""

    def matches(self, value: object) -> bool:
        if self.contains:
            return isinstance(value, str) and normalize_name(self.contains) in normalize_name(value)
        if self.in_:
            return value in self.in_
        return value == self.equals


@dataclass(frozen=True)
class CaseRules:
    # In the recorded procedure the retained cases were "Canceled": status is not a criterion by default.
    active_only: bool = False
    rules: tuple[CaseRule, ...] = ()
    # Several relevant cases, all owned by the same collaborator: "review" (default) or "assign".
    multiple_same_owner: str = "review"

    @property
    def extra_fields(self) -> tuple[str, ...]:
        return tuple(sorted({r.field for r in self.rules}))


@dataclass(frozen=True)
class Source:
    """Where the Movers items come from: views by name (dashboard sub-grids), a queue, or a view id."""

    view_names: tuple[str, ...] = ()   # e.g. "Queue Item - Movers - Emails", "Queue Item - Movers tasks"
    queue_name: str = ""
    saved_view_id: str = ""
    user_view_id: str = ""

    @property
    def configured(self) -> bool:
        return bool(self.view_names or self.queue_name or self.saved_view_id or self.user_view_id)


CATEGORY_LABELS = {"resiliation": "Résiliation", "demenagement": "Déménagement"}


@dataclass(frozen=True)
class Categories:
    """Reading a request: Résiliation or Déménagement (decides the rotation used)."""

    # every task (chatbot "Termination of contract", "Moving - CS"…) is a Résiliation for the team
    tasks: str = "resiliation"
    # words searched in the subject and the text, without case or accents; Résiliation is checked first
    # ("Termination of contract due to moving" is a Résiliation)
    resiliation: tuple[str, ...] = ("resili", "termination", "desactiv", "deces", "mettre fin", "arreter mon contrat",
                                    "cancel")
    demenagement: tuple[str, ...] = ("demenag", "moving home", "nouvelle adresse", "moving", "changement d'adresse")


@dataclass(frozen=True)
class Rotation:
    """1:1 turn per category when no case designates one of the four collaborators."""

    enabled: bool = True
    # "sans_owner": only when no relevant case is owned by one of the four (the client keeps their
    # contact); "toujours": every categorised element follows the rotation
    applies: str = "sans_owner"
    members: dict = field(default_factory=dict)   # category → tuple of collaborator keys, in turn order


@dataclass(frozen=True)
class ClientMatching:
    """Regarding empty: find the account like the recorded procedure (e-mail address, customer number
    written in the text, phone) and fill the Regarding with it — only on a single, consistent match."""

    enabled: bool = True
    automatic: bool = False            # write the Regarding without a human check (Automatic mode only)
    email_fields: tuple[str, ...] = ("emailaddress1", "emailaddress2", "emailaddress3")
    phone_fields: tuple[str, ...] = ("telephone1", "telephone2", "telephone3")
    ignored_domains: tuple[str, ...] = ("sectoralarm.fr", "sectoralarm.com", "sectoralarm.net", "hubspot.com",
                                        "hubspotemail.net", "outlook.com.safelinks")
    regarding_navigation: dict = field(default_factory=lambda: {
        "email": "regardingobjectid_account_email", "task": "regardingobjectid_account_task"})
    # Regarding pointing to another table (e.g. a contract « C-SFR-… ») or the activity's own account
    # field: table logical name → lookup column holding the account (relevé avec `discover --table`)
    account_links: dict = field(default_factory=dict)


@dataclass(frozen=True)
class Connection:
    kind: str = "fake"                  # "fake" (demo data), "msal" or "browser"
    environment_url: str = ""           # e.g. https://<org>.crm4.dynamics.com
    api_version: str = "v8.2"           # on-premises Dynamics 365 (8.x); `discover` reports the version that answers
    tenant_id: str = ""
    client_id: str = ""                 # app registration approved by IT (msal only)
    browser_profile_dir: str = ".browser-profile"
    browser_channel: str = ""           # "msedge" to use the installed Edge, empty = Playwright Chromium
    browser_executable: str = ""        # explicit browser path, when neither channel nor Playwright's own fits
    browser_headless: bool = False      # tests only: the user must see the window to sign in
    timeout_seconds: float = 30.0


@dataclass(frozen=True)
class Config:
    connection: Connection
    source: Source
    collaborators: tuple[Collaborator, ...]
    cases: CaseRules
    default_mode: Mode = Mode.SIMULATION
    automatic_allowed: bool = False
    worked_by_navigation: str = "workerid_systemuser"
    database: str = "movers_dispatch.db"
    max_items_per_run: int = 200
    categories: Categories = field(default_factory=Categories)
    rotation: Rotation = field(default_factory=Rotation)
    client: ClientMatching = field(default_factory=ClientMatching)
    # supervised decisions in a row accepted without correction before Automatic mode is advisable
    readiness_streak: int = 100
    path: Path | None = None

    def collaborator(self, key: str) -> Collaborator | None:
        return next((c for c in self.collaborators if c.key == key), None)

    def collaborator_for(self, systemuser_id: str) -> Collaborator | None:
        sid = (systemuser_id or "").lower()
        return next((c for c in self.collaborators if c.systemuser_id and c.systemuser_id.lower() == sid), None)

    def problems(self) -> list[str]:
        """Blocking configuration gaps, shown in the dashboard and enforced before any write."""
        out = []
        for c in self.collaborators:
            if len(c.systemuser_id) != GUID_LEN:
                out.append(f"Collaborateur « {c.first_name} » : systemuserid non renseigné (voir `discover`).")
        if self.connection.kind != "fake":
            if not self.connection.environment_url.startswith("https://") or "SERVEUR-CRM" in self.connection.environment_url:
                out.append("connection.environment_url doit être l'adresse https de l'environnement Dynamics 365.")
            if not self.source.configured:
                out.append("source : indiquer view_names, queue_name, saved_view_id ou user_view_id (voir `discover`).")
            if self.connection.kind == "msal" and not (self.connection.client_id and self.connection.tenant_id):
                out.append("connection.client_id / tenant_id requis pour la connexion msal (application approuvée par l'IT).")
        return out


def _rule(raw: dict) -> CaseRule:
    if "field" not in raw:
        raise ConfigError(f"Règle de Case sans « field » : {raw}")
    keys = {"equals", "in", "contains"} & raw.keys()
    if len(keys) != 1:
        raise ConfigError(f"Règle de Case « {raw['field']} » : un seul critère parmi equals / in / contains.")
    return CaseRule(field=raw["field"], equals=raw.get("equals"), in_=tuple(raw.get("in", ())), contains=raw.get("contains", ""))


def parse(raw: dict, path: Path | None = None) -> Config:
    agent = raw.get("agent", {})
    cases = raw.get("cases", {})
    collabs = tuple(
        Collaborator(key=c.get("key") or normalize_name(c["first_name"]), first_name=c["first_name"],
                     systemuser_id=(c.get("systemuser_id") or "").strip().lower())
        for c in raw.get("collaborators", [])
    )
    if not collabs:
        raise ConfigError("Aucun collaborateur configuré ([[collaborators]]).")
    multiple = cases.get("multiple_same_owner", "review")
    if multiple not in ("review", "assign"):
        raise ConfigError("cases.multiple_same_owner : « review » ou « assign ».")
    mode = Mode(agent.get("default_mode", Mode.SIMULATION.value))
    if mode is Mode.AUTOMATIC:
        raise ConfigError("Le mode automatique ne peut pas être le mode par défaut : il s'active explicitement à chaque lancement.")
    cats = raw.get("categories", {})
    categories = Categories(
        tasks=cats.get("taches", "resiliation"),
        resiliation=tuple(normalize_name(w) for w in cats.get("resiliation", Categories.resiliation)),
        demenagement=tuple(normalize_name(w) for w in cats.get("demenagement", Categories.demenagement)))
    if categories.tasks not in (*CATEGORY_LABELS, ""):
        raise ConfigError("categories.taches : « resiliation », « demenagement » ou \"\".")
    rot = raw.get("rotation", {})
    keys = [c.key for c in collabs]
    members = {}
    for cat in CATEGORY_LABELS:
        order = tuple(rot.get(cat, keys))
        unknown = [k for k in order if k not in keys]
        if unknown:
            raise ConfigError(f"rotation.{cat} : collaborateur(s) inconnu(s) {unknown} (clés possibles : {keys}).")
        members[cat] = order
    rotation = Rotation(enabled=bool(rot.get("active", True)), applies=rot.get("applique", "sans_owner"), members=members)
    if rotation.applies not in ("sans_owner", "toujours"):
        raise ConfigError("rotation.applique : « sans_owner » ou « toujours ».")
    cl = raw.get("client", {})
    client = ClientMatching(
        enabled=bool(cl.get("active", True)), automatic=bool(cl.get("automatique", False)),
        email_fields=tuple(cl.get("champs_email", ClientMatching.email_fields)),
        phone_fields=tuple(cl.get("champs_telephone", ClientMatching.phone_fields)),
        ignored_domains=tuple(d.lower() for d in cl.get("domaines_ignores", ClientMatching.ignored_domains)),
        regarding_navigation={**ClientMatching().regarding_navigation, **cl.get("navigation_regarding", {})},
        account_links=dict(cl.get("liens_compte", {})))
    db = agent.get("database", "movers_dispatch.db")
    if path is not None and not Path(db).is_absolute():
        db = str(path.parent / db)
    return Config(
        connection=Connection(**raw.get("connection", {})),
        source=Source(**{**raw.get("source", {}), "view_names": tuple(raw.get("source", {}).get("view_names", ()))}),
        collaborators=collabs,
        cases=CaseRules(active_only=cases.get("active_only", False),
                        rules=tuple(_rule(r) for r in cases.get("rules", [])), multiple_same_owner=multiple),
        default_mode=mode,
        automatic_allowed=bool(agent.get("automatic_allowed", False)),
        worked_by_navigation=agent.get("worked_by_navigation", "workerid_systemuser"),
        database=db,
        max_items_per_run=int(agent.get("max_items_per_run", 200)),
        readiness_streak=int(agent.get("readiness_streak", 100)),
        categories=categories, rotation=rotation, client=client,
        path=path,
    )


def load(path: str | Path) -> Config:
    p = Path(path)
    raw = p.read_bytes()
    # Notepad may save with a BOM (UTF-8) or in ANSI (Windows-1252): accept both
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("cp1252")
    try:
        return parse(tomllib.loads(text), p)
    except tomllib.TOMLDecodeError as e:
        raise ConfigError(f"{p.name} : faute de frappe — {e}. Chaque valeur doit être entre guillemets droits, "
                          'par exemple environment_url = "https://serveur/Organisation" (sans espace avant le nom).') from e
    except (TypeError, ValueError) as e:  # unknown key in a section, bad enum value
        raise ConfigError(f"{p.name} : {e}") from e
