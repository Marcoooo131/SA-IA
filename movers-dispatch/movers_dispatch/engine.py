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
from dataclasses import dataclass, field

from .config import Config, normalize_name
from .dataverse import ConcurrentModification, CrmError, Gateway, SessionExpired, UncertainWrite
from .journal import Journal
from .models import Mode, QueueItem, Status, User
from .rules import Decision, decide

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


@dataclass
class Evaluation:
    item: QueueItem
    decision: Decision
    email_id: str = ""
    subject: str = ""
    account_id: str = ""
    account_name: str = ""


@dataclass
class State:
    running: bool = False
    mode: str = ""
    run_id: int | None = None
    current: str = ""
    message: str = ""
    problems: list[str] = field(default_factory=list)


class Agent:
    def __init__(self, cfg: Config, gateway: Gateway, journal: Journal):
        self.cfg = cfg
        self.gw = gateway
        self.journal = journal
        self.stop_event = threading.Event()
        self.busy = threading.Lock()
        self.state = State(mode=cfg.default_mode.value)

    # ------------------------------------------------------------------ reading
    def evaluate(self, gw: Gateway, queueitem_id: str, users: dict[str, User]) -> Evaluation:
        item = gw.get_queue_item(queueitem_id)
        if item.object is None or item.object.entity not in ("email", "task"):
            return Evaluation(item, Decision(Status.REVIEW, "Le Queue Item ne porte ni un mail ni une tâche."))
        email = gw.get_activity(item.object.entity, item.object.id)
        ev = Evaluation(item, Decision(Status.REVIEW, ""), email_id=email.id, subject=email.subject)
        cases = None
        if email.regarding and email.regarding.entity == "account":
            ev.account_id, ev.account_name = email.regarding.id, email.regarding.name
            cases = gw.list_cases(email.regarding.id, self.cfg.cases.extra_fields)
        elif email.regarding and email.regarding.entity == "incident":
            case = gw.get_case(email.regarding.id, self.cfg.cases.extra_fields)
            cases = [case]
            if case.customer:
                ev.account_id, ev.account_name = case.customer.id, case.customer.name
        for c in cases or []:
            if c.owner and c.owner.entity == "systemuser" and self.cfg.collaborator_for(c.owner.id) \
                    and c.owner.id not in users:
                users[c.owner.id] = gw.get_user(c.owner.id)
        ev.decision = decide(self.cfg, item, email, cases, users)
        return ev

    def _record(self, run_id: int | None, ev: Evaluation, status: Status, reason: str, mode: str) -> None:
        d = ev.decision
        self.journal.upsert(
            ev.item.id, email_id=ev.email_id, subject=ev.subject, account_id=ev.account_id,
            account_name=ev.account_name, case_id=d.case.id if d.case else None,
            case_number=d.case.number if d.case else None,
            owner_name=d.case.owner.name if d.case and d.case.owner else None,
            worked_by_user_id=d.user.id if d.user else None,
            worked_by_name=d.user.first_name if d.user else None,
            status=status, reason=reason, considered=d.considered, mode=mode, run_id=run_id)

    # ------------------------------------------------------------------ writing
    def _write(self, run_id: int | None, ev: Evaluation, actor: str, mode: str) -> None:
        """Writes Worked By once, then reads it back. Raises Stopped on any failure."""
        if self.stop_event.is_set():
            raise Stopped("Arrêt demandé avant l'enregistrement.")
        user = ev.decision.user
        case_no = ev.decision.case.number if ev.decision.case else None
        detail = {"case": case_no, "systemuserid": user.id, "worked_by": user.first_name}
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
            items = gw.list_queue_items()[: self.cfg.max_items_per_run]
            self.journal.event(run_id, None, "file_lue", {"elements": len(items)}, actor)
            for it in items:
                if self.journal.item(it.id) is None:
                    self.journal.upsert(it.id, status=Status.PENDING, subject=it.title, run_id=run_id)
            users: dict[str, User] = {}
            for it in items:
                if self.stop_event.is_set():
                    raise Stopped("Arrêt demandé.")
                self.state.current = it.id
                self._process(gw, run_id, it.id, users, mode, actor)
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

    def _process(self, gw: Gateway, run_id: int, queueitem_id: str, users: dict, mode: Mode, actor: str) -> None:
        previous = self.journal.item(queueitem_id) or {}
        if previous.get("status") == Status.REJECTED.value:
            return  # a human rejected the proposal: left to them
        try:
            ev = self.evaluate(gw, queueitem_id, users)
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
            "worked_by": d.user.first_name if d.user and d.assignable else None, "cases_vus": list(d.considered)}, actor)
        if d.status is Status.SKIPPED and previous.get("status") == Status.ASSIGNED.value:
            return  # assigned by the agent on an earlier run and still correct: keep that outcome
        if not d.assignable:
            self._record(run_id, ev, d.status, d.reason, mode.value)
        elif mode is Mode.SIMULATION:
            self._record(run_id, ev, Status.PROPOSED, f"Simulation — proposerait Worked By = {d.user.first_name}. {d.reason}", mode.value)
        elif mode is Mode.SUPERVISED:
            self._record(run_id, ev, Status.AWAITING_APPROVAL, f"À valider : Worked By = {d.user.first_name}. {d.reason}", mode.value)
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
            ev = self.evaluate(self.gw, queueitem_id, {})
            d = ev.decision
            if not d.assignable or d.case.id != saved["case_id"] or d.user.id != saved["worked_by_user_id"]:
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
        return self._human_assign(saved, collaborator_key, actor, "attribution_manuelle",
                                  {"motif_initial": saved["reason"], "cases_vus": _json_list(saved["considered"])})

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
        return self._human_assign(saved, collaborator_key, actor, "correction", {
            "propose": saved["worked_by_name"], "case_propose": saved["case_number"], "motif_agent": saved["reason"],
            "cases_vus": _json_list(saved["considered"]), "note": note[:300]})

    def _human_assign(self, saved: dict, collaborator_key: str, actor: str, action: str, detail: dict) -> dict:
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
            ev.decision = Decision(Status.ASSIGNED, "", None, user, ev.decision.considered)
            try:
                self._write(None, ev, actor, "manuel")
            except Stopped:
                pass
            return self.journal.item(queueitem_id)
        finally:
            self.busy.release()

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
