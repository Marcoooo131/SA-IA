"""The agent: walks the Movers Emails items one by one in a controlled sequence.

For each queue item (key: queueitemid): re-read it, read the email and its Regarding, read the
account's cases, resolve the owner to the real systemuser record, decide (``rules.decide``),
then — depending on the mode — propose, wait for approval, or write Worked By once and verify
the write by reading it back. Any write failure or expired session stops the run.
"""

from __future__ import annotations

import json
import logging
import threading
from dataclasses import dataclass, field, replace

from .config import Config, normalize_name
from .dataverse import ConcurrentModification, CrmError, Gateway, SessionExpired, UncertainWrite
from .journal import Journal
from .models import Email, Lookup, Mode, QueueItem, Status, User
from .reading import SIGNAL_LABELS, categorize, category_label, extract, mask, phone_variants
from .rules import ROTATION_CODES, Decision, by_rotation, decide

log = logging.getLogger("movers_dispatch")


def _json_list(value: str | None) -> list:
    try:
        return json.loads(value or "[]")
    except ValueError:
        return []


class Stopped(Exception):
    pass


class RunBlocked(Exception):
    pass


class ReadOnlyGateway:
    """Gateway used in simulation: any write attempt is a bug and raises."""

    def __init__(self, inner: Gateway):
        self._inner = inner

    def __getattr__(self, name):
        return getattr(self._inner, name)

    def set_worked_by(self, item, systemuser_id):
        raise AssertionError("Écriture interdite en mode Simulation.")

    def set_regarding(self, activity, account_id):
        raise AssertionError("Écriture interdite en mode Simulation.")


@dataclass
class Evaluation:
    item: QueueItem
    decision: Decision
    email_id: str = ""
    subject: str = ""
    account_id: str = ""
    account_name: str = ""
    activity: Email | None = None
    category: str | None = None
    category_why: str = ""
    category_sure: bool = False   # found by the task name (not read from the words of the request)
    client_via: str = ""          # how the account was found (masked values), when the Regarding was empty
    client_to_link: bool = False  # the Regarding must be filled with this account before Worked By
    attachments: int = 0          # files attached to a mail whose client was not found (scanned letters)


@dataclass
class State:
    running: bool = False
    mode: str = ""
    run_id: int | None = None
    current: str = ""
    message: str = ""
    problems: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


class Agent:
    def __init__(self, cfg: Config, gateway: Gateway, journal: Journal):
        self.cfg = cfg
        self.gw = gateway
        self.journal = journal
        self.stop_event = threading.Event()
        self.busy = threading.Lock()
        self.state = State(mode=cfg.default_mode.value)
        self.client_ready = True    # set at each run from the client preflight

    # ------------------------------------------------------------------ reading
    def evaluate(self, gw: Gateway, queueitem_id: str, users: dict[str, User], cursor: dict | None = None,
                 pinned_user_id: str | None = None) -> Evaluation:
        """Reads everything needed for one element and decides. ``cursor``: the run's own position in each
        rotation (proposals of a same run take turns); ``pinned_user_id``: re-check of a rotation proposal
        being approved, which keeps the person proposed."""
        item = gw.get_queue_item(queueitem_id)
        if item.object is None or item.object.entity not in ("email", "task"):
            return Evaluation(item, Decision(Status.REVIEW, "Le Queue Item ne porte ni un mail ni une tâche."))
        act = gw.get_activity(item.object.entity, item.object.id)
        ev = Evaluation(item, Decision(Status.REVIEW, ""), email_id=act.id, subject=act.subject, activity=act)
        ev.category, ev.category_why, ev.category_sure = categorize(self.cfg, act)
        links = self.cfg.client.account_links
        reg = act.regarding
        account: Lookup | None = None
        cases = None
        if reg and reg.entity == "account":
            account = reg
        elif reg and reg.entity == "incident":
            case = gw.get_case(reg.id, self.cfg.cases.extra_fields)
            cases = [case]
            if case.customer:
                ev.account_id, ev.account_name = case.customer.id, case.customer.name
        else:
            # Regarding empty or pointing to another table (contract « C-SFR-… »): like the recorded
            # procedure on tasks, the activity's own « Account » field gives the client
            own = links.get(act.kind) or gw.activity_account_field(act.kind)
            if own:
                account = gw.account_link(act.kind, act.id, own)
                ev.client_via = "champ Account de la tâche" if account and act.kind == "task" else (
                    "champ compte de l'activité" if account else "")
            if account is None and reg is not None and reg.entity in links:
                account = gw.account_link(reg.entity, reg.id, links[reg.entity])
                ev.client_via = f"compte du {reg.entity} en Regarding" if account else ""
            if account is None and reg is None and self.cfg.client.enabled and self.client_ready:
                account, why = self._find_client(gw, act)
                if account is None:
                    hint = ""
                    if act.kind == "email":
                        try:
                            ev.attachments = len(gw.list_attachments(act.id))
                        except CrmError:
                            ev.attachments = 0
                        if ev.attachments:
                            hint = (" Pièce jointe à lire (courrier scanné : le n° client y est souvent écrit à la main) : "
                                    "« Voir la pièce jointe », puis saisir le n° de compte.")
                    ev.decision = Decision(Status.REVIEW, f"Regarding vide et client non retrouvé : {why}{hint}", code="no_client")
                    return self._maybe_skip(ev)
                ev.client_via, ev.client_to_link = why, True
        if account is not None:
            ev.account_id, ev.account_name = account.id, account.name
            cases = gw.list_cases(account.id, self.cfg.cases.extra_fields)
        for c in cases or []:
            if c.owner and c.owner.entity == "systemuser" and self.cfg.collaborator_for(c.owner.id) \
                    and c.owner.id not in users:
                users[c.owner.id] = gw.get_user(c.owner.id)
        seen = replace(act, regarding=account) if account is not None and (reg is None or reg.entity != "incident") else act
        ev.decision = decide(self.cfg, item, seen, cases, users)
        self._rotation(gw, ev, users, cursor, pinned_user_id)
        return ev

    def _maybe_skip(self, ev: Evaluation) -> Evaluation:
        if ev.item.worker is not None:
            ev.decision = Decision(Status.SKIPPED, f"Worked By déjà renseigné ({ev.item.worker.name or ev.item.worker.id}) : "
                                   "élément déjà traité.", code="already_filled")
        return ev

    def _find_client(self, gw: Gateway, act) -> tuple[Lookup | None, str]:
        """Like the recorded procedure: search the account with what the mail gives (customer number,
        sender address, address written in the form, phone). Only a single, consistent account is kept."""
        c = self.cfg.client
        sig = extract(self.cfg, act)
        if sig.empty():
            return None, "aucune adresse e-mail, aucun n° client et aucun téléphone dans l'élément."
        found: dict[str, Lookup] = {}
        via: list[str] = []
        searches = [("number", ("accountnumber",), [[n] for n in sig.numbers]),
                    ("sender", c.email_fields, [[e] for e in sig.sender]),
                    ("email", c.email_fields, [[e] for e in sig.emails]),
                    ("phone", c.phone_fields, [phone_variants(p) for p in sig.phones])]
        for kind, fields, groups in searches:
            for values in groups:
                hits = gw.find_accounts(fields, values)
                shown = mask("email" if kind in ("sender", "email") else kind, values[0])
                if len(hits) > 1:
                    return None, f"{SIGNAL_LABELS[kind]} {shown} correspond à {len(hits)} comptes."
                if hits:
                    found[hits[0].id] = hits[0]
                    via.append(f"{SIGNAL_LABELS[kind]} {shown}")
        if not found:
            return None, "aucun compte actif ne correspond aux indices trouvés."
        if len(found) > 1:
            return None, "indices contradictoires : " + " ; ".join(via) + f" → {len(found)} comptes différents."
        return next(iter(found.values())), "via " + " + ".join(via)

    def _rotation(self, gw: Gateway, ev: Evaluation, users: dict, cursor: dict | None, pinned_user_id: str | None) -> None:
        rot, d = self.cfg.rotation, ev.decision
        if not (rot.enabled and ev.category and ev.item.worker is None):
            return
        codes = ROTATION_CODES + (("ambiguous", "") if rot.applies == "toujours" else ())
        if d.code not in codes or d.status is Status.ERROR:
            return
        if d.status is Status.ASSIGNED and rot.applies != "toujours":
            return
        cat = self.cfg.categories.get(ev.category)
        if not pinned_user_id and not ev.category_sure and cat and cat.choose_among:
            # e.g. a résiliation read in a mail: « Movers - Résiliation » or « … exception » is the team's call
            options = " ou ".join(f"« Suivant en {self.cfg.categories.label(k)} »" for k in cat.choose_among)
            ev.decision = Decision(Status.REVIEW, f"{cat.label} d'après la demande ({ev.category_why}) : à valider — "
                                   f"choisir {options} dans « Attribuer à… ». ({d.reason})",
                                   considered=d.considered, code="rotation_to_choose")
            return
        user = None
        if pinned_user_id:
            user = users.get(pinned_user_id) or gw.get_user(pinned_user_id)
        else:
            key = self.next_in_rotation(ev.category, cursor)
            if key is None:
                ev.decision = Decision(Status.REVIEW, f"Rotation {category_label(self.cfg, ev.category)} : personne de disponible "
                                       "(tous absents ou non configurés).", considered=d.considered, code="rotation_empty")
                return
            collab = self.cfg.collaborator(key)
            user = users.get(collab.systemuser_id) or gw.get_user(collab.systemuser_id)
            users[collab.systemuser_id] = user
            if user.disabled or normalize_name(user.first_name) != normalize_name(collab.first_name):
                ev.decision = Decision(Status.REVIEW, f"Rotation : {collab.first_name} inactif ou fiche CRM différente.",
                                       considered=d.considered, code="rotation_empty")
                return
            if cursor is not None:
                cursor[ev.category] = key
        ev.decision = by_rotation(d, category_label(self.cfg, ev.category), user)

    def next_in_rotation(self, category: str, cursor: dict | None = None) -> str | None:
        members = self.cfg.rotation.members.get(category) or tuple(c.key for c in self.cfg.collaborators)
        absent = set(self.journal.setting("absents", []))
        last = cursor[category] if cursor is not None and category in cursor else self.journal.setting(f"rotation:{category}")
        start = members.index(last) + 1 if last in members else 0
        for i in range(len(members)):
            key = members[(start + i) % len(members)]
            collab = self.cfg.collaborator(key)
            if key not in absent and collab and collab.systemuser_id:
                return key
        return None

    def _record(self, run_id: int | None, ev: Evaluation, status: Status, reason: str, mode: str) -> None:
        d = ev.decision
        self.journal.upsert(
            ev.item.id, email_id=ev.email_id, subject=ev.subject, account_id=ev.account_id,
            account_name=ev.account_name, case_id=d.case.id if d.case else None,
            case_number=d.case.number if d.case else None,
            owner_name=d.case.owner.name if d.case and d.case.owner else None,
            worked_by_user_id=d.user.id if d.user else None,
            worked_by_name=d.user.first_name if d.user else None,
            status=status, reason=reason, considered=d.considered, mode=mode, run_id=run_id,
            category=ev.category, client_account_id=ev.account_id if ev.client_to_link else None,
            client_name=ev.account_name if ev.client_to_link else None, client_via=ev.client_via or None,
            client_to_link=1 if ev.client_to_link else (1 if d.code == "no_client" else 0), method=d.method,
            attachments=ev.attachments)

    # ------------------------------------------------------------------ writing
    def _link_client(self, run_id: int | None, ev: Evaluation, actor: str, mode: str) -> None:
        """Fills the Regarding with the account found, once, then reads it back. Raises Stopped on failure."""
        detail = {"client": ev.account_name, "via": ev.client_via}
        self.journal.event(run_id, ev.item.id, "ecriture_regarding", detail, actor)
        try:
            self.gw.set_regarding(ev.activity, ev.account_id)
        except UncertainWrite as e:
            self.journal.event(run_id, ev.item.id, "ecriture_incertaine", {"erreur": str(e)}, actor)
        except (ConcurrentModification, SessionExpired, CrmError) as e:
            self._record(run_id, ev, Status.ERROR, f"Regarding refusé : {e}", mode)
            self.journal.event(run_id, ev.item.id, "echec_enregistrement", {"erreur": str(e)}, actor)
            raise Stopped(str(e)) from e
        try:
            check = self.gw.get_activity(ev.activity.kind, ev.activity.id)
        except CrmError as e:
            self._record(run_id, ev, Status.ERROR, f"Vérification du Regarding impossible : {e}", mode)
            raise Stopped(str(e)) from e
        if not (check.regarding and check.regarding.entity == "account" and check.regarding.id == ev.account_id):
            self._record(run_id, ev, Status.ERROR, "Vérification échouée : Regarding relu différent du client.", mode)
            raise Stopped("Regarding relu différent du client.")
        self.journal.event(run_id, ev.item.id, "regarding_verifie", detail, actor)
        ev.activity = check
        ev.client_to_link = False
        ev.client_via = f"rattaché ({ev.client_via})"

    def _write(self, run_id: int | None, ev: Evaluation, actor: str, mode: str) -> None:
        """Fills the Regarding when the client had to be found, then writes Worked By once and reads it
        back. Raises Stopped on any failure."""
        if self.stop_event.is_set():
            raise Stopped("Arrêt demandé avant l'enregistrement.")
        if ev.client_to_link:
            self._link_client(run_id, ev, actor, mode)
        user = ev.decision.user
        case_no = ev.decision.case.number if ev.decision.case else None
        detail = {"case": case_no, "systemuserid": user.id, "worked_by": user.first_name, "methode": ev.decision.method}
        self.journal.event(run_id, ev.item.id, "ecriture_worked_by", detail, actor)
        try:
            self.gw.set_worked_by(ev.item, user.id)
        except UncertainWrite as e:
            self.journal.event(run_id, ev.item.id, "ecriture_incertaine", {"erreur": str(e)}, actor)
        except (ConcurrentModification, SessionExpired, CrmError) as e:
            self._record(run_id, ev, Status.ERROR, f"Enregistrement refusé : {e}", mode)
            self.journal.event(run_id, ev.item.id, "echec_enregistrement", {"erreur": str(e)}, actor)
            raise Stopped(str(e)) from e
        try:
            check = self.gw.get_queue_item(ev.item.id)
        except CrmError as e:
            self._record(run_id, ev, Status.ERROR, f"Vérification impossible après enregistrement : {e}", mode)
            raise Stopped(str(e)) from e
        if not (check.worker and check.worker.entity == "systemuser" and check.worker.id == user.id):
            found = check.worker.name if check.worker else "vide"
            self._record(run_id, ev, Status.ERROR, f"Vérification échouée : Worked By relu = {found}.", mode)
            self.journal.event(run_id, ev.item.id, "verification_echouee", {"relu": found}, actor)
            raise Stopped("Worked By relu différent de la valeur enregistrée.")
        if ev.decision.method == "rotation" and ev.category:
            collab = self.cfg.collaborator_for(user.id)
            self.journal.set_setting(f"rotation:{ev.category}", collab.key)
            origin = f"rotation {category_label(self.cfg, ev.category)}"
        else:
            origin = f"Case {case_no}" if case_no else f"choix manuel de {actor}"
        self._record(run_id, ev, Status.ASSIGNED, f"Worked By = {user.first_name} ({origin}), vérifié.", mode)
        self.journal.event(run_id, ev.item.id, "worked_by_verifie", detail, actor)

    def _writes_blocked(self) -> list[str]:
        out = list(self.cfg.problems())
        try:
            out += self.gw.preflight()
        except SessionExpired:
            raise
        except CrmError as e:
            out.append(f"Contrôle préalable impossible : {e}")
        return out

    # ------------------------------------------------------------------ run
    def run(self, mode: Mode, actor: str = "local", confirm_automatic: bool = False) -> dict:
        if mode is Mode.AUTOMATIC and not (self.cfg.automatic_allowed and confirm_automatic):
            raise RunBlocked("Mode Automatique : activer agent.automatic_allowed dans la configuration (règles validées) "
                             "et confirmer explicitement le lancement.")
        if not self.busy.acquire(blocking=False):
            raise RunBlocked("Un traitement est déjà en cours.")
        self.stop_event.clear()
        run_id = self.journal.start_run(mode.value, actor)
        self.state = State(running=True, mode=mode.value, run_id=run_id, message="Contrôles préalables…")
        gw = ReadOnlyGateway(self.gw) if mode is Mode.SIMULATION else self.gw
        outcome = "terminé"
        try:
            problems = self._writes_blocked()
            self.state.problems = problems
            for p in problems:
                self.journal.event(run_id, None, "controle_prealable", {"probleme": p}, actor)
            if problems and mode is not Mode.SIMULATION:
                raise Stopped("Contrôles préalables non satisfaits : aucune écriture possible.")
            self._client_check(run_id, actor)
            items = gw.list_queue_items()[: self.cfg.max_items_per_run]
            self.journal.event(run_id, None, "file_lue", {"elements": len(items)}, actor)
            for it in items:
                if self.journal.item(it.id) is None:
                    self.journal.upsert(it.id, status=Status.PENDING, subject=it.title, run_id=run_id)
            users: dict[str, User] = {}
            cursor: dict[str, str] = {}   # this run's turn in each rotation
            for it in items:
                if self.stop_event.is_set():
                    raise Stopped("Arrêt demandé.")
                self.state.current = it.id
                self._process(gw, run_id, it.id, users, mode, actor, cursor)
        except Stopped as e:
            outcome = f"interrompu : {e}"
        except SessionExpired as e:
            outcome = f"interrompu : {e}"
        except CrmError as e:
            outcome = f"interrompu : {e}"
        finally:
            self.journal.end_run(run_id, outcome)
            self.journal.event(run_id, None, "fin_traitement", {"resultat": outcome}, actor)
            self.state.running = False
            self.state.current = ""
            self.state.message = outcome
            self.busy.release()
        return {"run_id": run_id, "outcome": outcome, **self.journal.counters()}

    def _client_check(self, run_id: int | None, actor: str) -> None:
        """Finding the client is optional: if its columns are missing, it is switched off (with a warning)
        and the rest of the agent keeps working."""
        self.client_ready, self.state.warnings = True, []
        if not self.cfg.client.enabled:
            return
        try:
            warnings = self.gw.client_preflight()
        except SessionExpired:
            raise
        except CrmError as e:
            warnings = [f"Recherche du client indisponible : {e}"]
        if warnings:
            self.client_ready = False
            self.state.warnings = ["Recherche du client désactivée : " + w for w in warnings]
            for w in warnings:
                self.journal.event(run_id, None, "controle_client", {"probleme": w}, actor)

    def _process(self, gw: Gateway, run_id: int, queueitem_id: str, users: dict, mode: Mode, actor: str,
                 cursor: dict | None = None) -> None:
        previous = self.journal.item(queueitem_id) or {}
        if previous.get("status") == Status.REJECTED.value:
            return  # a human rejected the proposal: left to them
        try:
            ev = self.evaluate(gw, queueitem_id, users, cursor)
        except SessionExpired:
            raise
        except CrmError as e:  # this item could not be read: nothing was written, go on with the next one
            self.journal.upsert(queueitem_id, status=Status.ERROR, reason=f"Lecture impossible : {e}", run_id=run_id)
            self.journal.event(run_id, queueitem_id, "erreur_lecture", {"erreur": str(e)}, actor)
            return
        d = ev.decision
        self.journal.event(run_id, queueitem_id, "evaluation", {
            "statut": d.status.value, "motif": d.reason, "case": d.case.number if d.case else None,
            "owner": d.case.owner.name if d.case and d.case.owner else None,
            "worked_by": d.user.first_name if d.user and d.assignable else None, "cases_vus": list(d.considered),
            "categorie": ev.category, "pourquoi_categorie": ev.category_why, "methode": d.method,
            "client": ev.account_name if ev.client_to_link else None, "client_via": ev.client_via or None}, actor)
        if d.status is Status.SKIPPED and previous.get("status") == Status.ASSIGNED.value:
            return  # assigned by the agent on an earlier run and still correct: keep that outcome
        link = f"rattacher au client {ev.account_name} ({ev.client_via}), puis " if ev.client_to_link else ""
        if not d.assignable:
            self._record(run_id, ev, d.status, (f"Client trouvé : {ev.account_name} ({ev.client_via}). " if ev.client_to_link
                                                else "") + d.reason, mode.value)
        elif mode is Mode.SIMULATION:
            self._record(run_id, ev, Status.PROPOSED, f"Simulation — proposerait : {link}Worked By = {d.user.first_name}. {d.reason}", mode.value)
        elif mode is Mode.SUPERVISED or (ev.client_to_link and not self.cfg.client.automatic):
            self._record(run_id, ev, Status.AWAITING_APPROVAL, f"À valider : {link}Worked By = {d.user.first_name}. {d.reason}", mode.value)
        else:
            self._write(run_id, ev, actor, mode.value)

    # ------------------------------------------------------------------ supervised decisions
    def approve(self, queueitem_id: str, actor: str) -> dict:
        saved = self.journal.item(queueitem_id)
        if not saved or saved["status"] != Status.AWAITING_APPROVAL.value:
            raise RunBlocked("Cet élément n'attend pas de validation.")
        if not self.busy.acquire(timeout=30):
            raise RunBlocked("Un traitement est en cours, réessayer dans un instant.")
        self.stop_event.clear()
        try:
            self.journal.event(None, queueitem_id, "validation_humaine",
                               {"decision": "acceptee", "worked_by": saved["worked_by_name"], "case": saved["case_number"]}, actor)
            problems = self._writes_blocked()
            if problems:
                raise RunBlocked("Contrôles préalables non satisfaits : " + " ; ".join(problems))
            if saved.get("client_account_id"):
                self._client_check(None, actor)
                if not self.client_ready:
                    raise RunBlocked(" ; ".join(self.state.warnings))
            pinned = saved["worked_by_user_id"] if saved.get("method") == "rotation" else None
            ev = self.evaluate(self.gw, queueitem_id, {}, pinned_user_id=pinned)
            d = ev.decision
            same_case = (d.case.id if d.case else None) == saved["case_id"]
            same_client = (ev.account_id if ev.client_to_link else None) == saved.get("client_account_id")
            if not d.assignable or not same_case or not same_client or d.user.id != saved["worked_by_user_id"]:
                self._record(None, ev, Status.REVIEW if d.status is not Status.SKIPPED else Status.SKIPPED,
                             "La situation dans le CRM a changé depuis la proposition : " + d.reason, Mode.SUPERVISED.value)
                return self.journal.item(queueitem_id)
            try:
                self._write(None, ev, actor, Mode.SUPERVISED.value)
            except Stopped:
                pass
            return self.journal.item(queueitem_id)
        finally:
            self.busy.release()

    def assign_manually(self, queueitem_id: str, collaborator_key: str, actor: str) -> dict:
        """Dashboard drop-down on an item in human review (no case owned by one of the four, ambiguity…):
        a person picks the collaborator; the agent re-reads the item, never overwrites a Worked By,
        writes once and reads back."""
        saved = self.journal.item(queueitem_id)
        if not saved or saved["status"] != Status.REVIEW.value:
            raise RunBlocked("Seuls les éléments en validation humaine s'attribuent à la main.")
        category = None
        if collaborator_key.startswith("rotation:"):
            # « Suivant en Résiliation » : the person decides the category (e.g. a scanned letter), the turn decides who
            category = collaborator_key.split(":", 1)[1]
            if self.cfg.categories.get(category) is None:
                raise RunBlocked("Catégorie inconnue.")
            collaborator_key = self.next_in_rotation(category)
            if collaborator_key is None:
                raise RunBlocked(f"Rotation {self.cfg.categories.label(category)} : personne de disponible.")
        return self._human_assign(saved, collaborator_key, actor, "attribution_manuelle",
                                  {"motif_initial": saved["reason"], "cases_vus": _json_list(saved["considered"]),
                                   "rotation": category}, rotation_category=category)

    def correct(self, queueitem_id: str, collaborator_key: str, actor: str, note: str = "") -> dict:
        """Supervised mode: the proposal is wrong, the person gives the right collaborator. The correction
        is written to the CRM like a manual assignment and kept with what the agent had seen, so that the
        rules can be fixed from these cases (the agent does not change its rules by itself)."""
        saved = self.journal.item(queueitem_id)
        if not saved or saved["status"] != Status.AWAITING_APPROVAL.value:
            raise RunBlocked("Cet élément n'attend pas de validation.")
        collab = next((c for c in self.cfg.collaborators if c.key == collaborator_key), None)
        if collab and collab.systemuser_id == (saved["worked_by_user_id"] or "") and collab.systemuser_id:
            raise RunBlocked("C'est déjà la proposition de l'agent : utiliser « Valider ».")
        out = self._human_assign(saved, collaborator_key, actor, "correction", {
            "propose": saved["worked_by_name"], "case_propose": saved["case_number"] or (
                f"rotation {category_label(self.cfg, saved.get('category'))}" if saved.get("method") == "rotation" else None),
            "motif_agent": saved["reason"], "cases_vus": _json_list(saved["considered"]), "note": note[:300]})
        if saved.get("method") == "rotation" and saved.get("category") and out["status"] == Status.ASSIGNED.value:
            self.journal.set_setting(f"rotation:{saved['category']}", collaborator_key)   # the turn goes on from them
        return out

    def _human_assign(self, saved: dict, collaborator_key: str, actor: str, action: str, detail: dict,
                      rotation_category: str | None = None) -> dict:
        queueitem_id = saved["queueitem_id"]
        collab = next((c for c in self.cfg.collaborators if c.key == collaborator_key), None)
        if collab is None:
            raise RunBlocked("Collaborateur inconnu.")
        if not self.busy.acquire(timeout=30):
            raise RunBlocked("Un traitement est en cours, réessayer dans un instant.")
        self.stop_event.clear()
        try:
            problems = self._writes_blocked()
            if problems:
                raise RunBlocked("Contrôles préalables non satisfaits : " + " ; ".join(problems))
            ev = self.evaluate(self.gw, queueitem_id, {})
            if ev.item.worker is not None:
                raise RunBlocked(f"Worked By déjà renseigné ({ev.item.worker.name or ev.item.worker.id}) : jamais écrasé.")
            user = self.gw.get_user(collab.systemuser_id)
            if user.disabled:
                raise RunBlocked(f"{user.full_name} est inactif dans le CRM.")
            if normalize_name(user.first_name) != normalize_name(collab.first_name):
                raise RunBlocked(f"Prénom CRM « {user.first_name} » différent du prénom configuré « {collab.first_name} ».")
            self.journal.event(None, queueitem_id, action, {"worked_by": collab.first_name, **detail}, actor)
            ev.decision = Decision(Status.ASSIGNED, "", None, user, ev.decision.considered,
                                   method="rotation" if rotation_category else "manual")
            if rotation_category:
                ev.category = rotation_category
            try:
                self._write(None, ev, actor, "manuel")
            except Stopped:
                pass
            return self.journal.item(queueitem_id)
        finally:
            self.busy.release()

    def link_client(self, queueitem_id: str, account_number: str, actor: str, note: str = "") -> dict:
        """The person gives the account number (as typed in the Regarding in the recorded procedure):
        the agent checks it designates exactly one active account, fills the Regarding, reads it back, then
        re-evaluates the element (cases, owner or rotation) as a supervised proposal."""
        saved = self.journal.item(queueitem_id)
        if not saved or saved["status"] not in (Status.AWAITING_APPROVAL.value, Status.REVIEW.value):
            raise RunBlocked("Seuls les éléments à valider ou en validation humaine se rattachent à un client.")
        number = "".join(ch for ch in account_number if ch.isdigit())
        if not number:
            raise RunBlocked("Indiquer le numéro de compte du client (Account Number).")
        if saved.get("client_account_id") and (saved.get("client_name") or "").endswith(f"({number})"):
            raise RunBlocked("C'est déjà le client proposé : utiliser « Valider ».")
        if not self.busy.acquire(timeout=30):
            raise RunBlocked("Un traitement est en cours, réessayer dans un instant.")
        self.stop_event.clear()
        try:
            problems = self._writes_blocked()
            self._client_check(None, actor)
            problems += [] if self.client_ready else self.state.warnings
            if problems:
                raise RunBlocked("Contrôles préalables non satisfaits : " + " ; ".join(problems))
            ev = self.evaluate(self.gw, queueitem_id, {})
            if ev.activity is None or ev.activity.regarding is not None:
                raise RunBlocked("Le Regarding est déjà renseigné dans le CRM : jamais écrasé.")
            hits = self.gw.find_accounts(("accountnumber",), [number])
            if len(hits) != 1:
                raise RunBlocked(f"Le numéro {number} correspond à {len(hits)} compte(s) actif(s) : un seul attendu.")
            action = "correction_client" if saved.get("client_account_id") else "rattachement_manuel"
            self.journal.event(None, queueitem_id, action, {"propose": saved.get("client_name"), "retenu": hits[0].name,
                                                            "via": saved.get("client_via"), "note": note[:300]}, actor)
            ev.account_id, ev.account_name, ev.client_via, ev.client_to_link = hits[0].id, hits[0].name, f"n° saisi par {actor}", True
            try:
                self._link_client(None, ev, actor, "manuel")
            except Stopped:
                return self.journal.item(queueitem_id)
            ev = self.evaluate(self.gw, queueitem_id, {})
            d = ev.decision
            if d.assignable:
                self._record(None, ev, Status.AWAITING_APPROVAL, f"Client rattaché. À valider : Worked By = {d.user.first_name}. "
                             f"{d.reason}", Mode.SUPERVISED.value)
            else:
                self._record(None, ev, d.status, "Client rattaché. " + d.reason, Mode.SUPERVISED.value)
            return self.journal.item(queueitem_id)
        finally:
            self.busy.release()

    # ------------------------------------------------------------------ reading help for the person
    def check_account(self, account_number: str) -> dict:
        """Before linking a number read on a scanned letter: which active account it designates (a misread
        digit may designate another real client — the person confirms the name first)."""
        number = "".join(ch for ch in account_number if ch.isdigit())
        if not number:
            raise RunBlocked("Indiquer le numéro de compte du client (Account Number).")
        hits = self.gw.find_accounts(("accountnumber",), [number])
        if len(hits) != 1:
            raise RunBlocked(f"Le numéro {number} correspond à {len(hits)} compte(s) actif(s) : vérifier la lecture.")
        return {"number": number, "name": hits[0].name}

    def attachments(self, queueitem_id: str) -> list[dict]:
        saved = self.journal.item(queueitem_id)
        if not saved or not saved.get("email_id"):
            raise RunBlocked("Élément inconnu.")
        return self.gw.list_attachments(saved["email_id"])

    def attachment(self, queueitem_id: str, attachment_id: str) -> dict:
        """Only a file attached to this element's mail can be opened (read on demand, never stored)."""
        saved = self.journal.item(queueitem_id)
        if not saved or not saved.get("email_id"):
            raise RunBlocked("Élément inconnu.")
        f = self.gw.get_attachment(attachment_id)
        if f["object_id"] != saved["email_id"]:
            raise RunBlocked("Cette pièce jointe n'appartient pas à cet élément.")
        return f

    # ------------------------------------------------------------------ rotation settings
    def rotation_state(self) -> dict:
        absent = set(self.journal.setting("absents", []))
        out = {"active": self.cfg.rotation.enabled, "applique": self.cfg.rotation.applies,
               "collaborateurs": [{"key": c.key, "first_name": c.first_name, "absent": c.key in absent}
                                  for c in self.cfg.collaborators], "categories": []}
        counts = self.journal.rotation_counts()
        for cat, label in ((c.key, c.label) for c in self.cfg.categories.items):
            members = self.cfg.rotation.members.get(cat) or tuple(c.key for c in self.cfg.collaborators)
            nxt = self.next_in_rotation(cat)
            c = counts.get(cat, {})
            out["categories"].append({"key": cat, "label": label,
                                      "ordre": [self.cfg.collaborator(k).first_name for k in members],
                                      "prochain": self.cfg.collaborator(nxt).first_name if nxt else None,
                                      "total": c.get("total", 0), "aujourdhui": c.get("aujourdhui", 0),
                                      "par_personne": c.get("par_personne", {}),
                                      "par_personne_aujourdhui": c.get("par_personne_aujourdhui", {})})
        return out

    def set_absent(self, key: str, absent: bool, actor: str) -> dict:
        if self.cfg.collaborator(key) is None:
            raise RunBlocked("Collaborateur inconnu.")
        current = set(self.journal.setting("absents", []))
        current = current | {key} if absent else current - {key}
        self.journal.set_setting("absents", sorted(current))
        self.journal.event(None, None, "absence", {"collaborateur": key, "absent": absent}, actor)
        return self.rotation_state()

    def reject(self, queueitem_id: str, actor: str, note: str = "") -> dict:
        saved = self.journal.item(queueitem_id)
        if not saved or saved["status"] != Status.AWAITING_APPROVAL.value:
            raise RunBlocked("Cet élément n'attend pas de validation.")
        self.journal.upsert(queueitem_id, status=Status.REJECTED, reason=f"Proposition refusée par {actor}. {note}".strip())
        self.journal.event(None, queueitem_id, "validation_humaine", {"decision": "refusee", "note": note[:200]}, actor)
        return self.journal.item(queueitem_id)

    def stop(self, actor: str = "local") -> None:
        self.stop_event.set()
        self.journal.event(self.state.run_id, None, "arret_demande", {}, actor)
