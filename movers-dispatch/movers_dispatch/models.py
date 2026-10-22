"""CRM records as read by the agent, reduced to the fields the dispatch needs.

Nothing else from Dynamics 365 is kept: no email body, no address, no phone number.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum


class Mode(str, Enum):
    SIMULATION = "simulation"
    SUPERVISED = "supervise"
    AUTOMATIC = "automatique"


class Status(str, Enum):
    PENDING = "en_attente"            # detected, not evaluated yet
    PROPOSED = "propose"              # simulation: Worked By proposed, nothing written
    AWAITING_APPROVAL = "a_valider"   # supervised: proposal waiting for a human decision
    REVIEW = "validation_humaine"     # ambiguous or incomplete: a human must handle it
    ASSIGNED = "affecte"              # Worked By written and verified
    SKIPPED = "ignore"                # already processed / already correct
    REJECTED = "refuse"               # supervised proposal rejected by a human
    ERROR = "erreur"


@dataclass(frozen=True)
class Lookup:
    id: str
    entity: str          # logical name of the target table, e.g. "account", "systemuser", "team"
    name: str = ""


@dataclass(frozen=True)
class QueueItem:
    id: str              # queueitemid: the unique key of the element being processed
    title: str
    object: Lookup | None          # the email (objectid)
    worker: Lookup | None          # Worked By (workerid)
    etag: str = ""                 # optimistic concurrency token (@odata.etag)
    modified_on: str = ""


@dataclass(frozen=True)
class Email:
    """The activity carried by the queue item: an email or a task (same fields used)."""

    id: str
    subject: str
    regarding: Lookup | None
    kind: str = "email"
    text: str = ""       # description as plain text: read in memory to classify / find the client, never stored
    sender: str = ""     # e-mail address of the sender (emails only)
    etag: str = ""


@dataclass(frozen=True)
class Case:
    id: str
    number: str          # ticketnumber
    title: str
    state: int           # statecode: 0 active, 1 resolved, 2 cancelled
    status: int | None   # statuscode
    owner: Lookup | None
    created_on: str = ""
    fields: dict = field(default_factory=dict)   # extra fields named in the configuration rules
    customer: Lookup | None = None               # customerid: the account the case belongs to


@dataclass(frozen=True)
class User:
    id: str
    first_name: str
    full_name: str
    disabled: bool
