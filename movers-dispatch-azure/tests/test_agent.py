"""Agent behaviour on the fictitious CRM: the ten scenarios of the specification and the safety rules."""

from __future__ import annotations

import pytest

from movers_dispatch.engine import Agent, RunBlocked
from movers_dispatch.fake import USERS, FakeCrm, demo_config
from movers_dispatch.journal import Journal
from movers_dispatch.models import Mode, Status


def make(crm: FakeCrm | None = None, **cfg):
    crm = crm or FakeCrm()
    config = demo_config(**cfg)
    return Agent(config, crm, Journal(":memory:")), crm


def row(agent, qid):
    return agent.journal.item(qid)


@pytest.mark.parametrize("owner,first", [("kader", "Kader"), ("estefania", "Estefania"),
                                         ("marc-antoine", "Marc-Antoine"), ("chloe", "Chloé")])
def test_case_owned_by_each_collaborator_is_assigned(owner, first):
    agent, crm = make(automatic_allowed=True)
    qid = crm.add("a", "Déménagement", "Client fictif", [("CAS-1", owner, 0)])
    out = agent.run(Mode.AUTOMATIC, confirm_automatic=True)
    r = row(agent, qid)
    assert r["status"] == Status.ASSIGNED.value, r["reason"]
    assert r["worked_by_name"] == first and r["case_number"] == "CAS-1"
    assert crm.items[qid].worker.id == USERS[owner].id      # written to the CRM and read back
    assert crm.write_log == [(qid, USERS[owner].id)]
    assert out["affectes"] == 1


def test_several_cases_only_the_relevant_one_counts():
    agent, crm = make(automatic_allowed=True)
    # a non-Movers case of Kader + a Canceled "Mover" case of Marc-Antoine: only the Mover one is relevant,
    # whatever its status (in the recorded procedure the retained cases were Canceled)
    qid = crm.add("a", "s", "c", [("CAS-OLD", "kader", 1, "CARE - Separation Contrat"), ("CAS-NEW", "marc-antoine", 2)])
    agent.run(Mode.AUTOMATIC, confirm_automatic=True)
    r = row(agent, qid)
    assert r["status"] == Status.ASSIGNED.value and r["case_number"] == "CAS-NEW" and r["worked_by_name"] == "Marc-Antoine"


def test_several_relevant_cases_with_different_owners_go_to_review():
    agent, crm = make(automatic_allowed=True)
    qid = crm.add("a", "s", "c", [("CAS-1", "kader", 0), ("CAS-2", "chloe", 0)])
    agent.run(Mode.AUTOMATIC, confirm_automatic=True)
    assert row(agent, qid)["status"] == Status.REVIEW.value
    assert crm.writes == 0


def test_several_cases_same_owner_follow_configuration():
    agent, crm = make(automatic_allowed=True)
    qid = crm.add("a", "s", "c", [("CAS-1", "kader", 0), ("CAS-2", "kader", 0)])
    agent.run(Mode.AUTOMATIC, confirm_automatic=True)
    assert row(agent, qid)["status"] == Status.REVIEW.value and crm.writes == 0


def test_no_relevant_case_means_no_assignment():
    agent, crm = make(automatic_allowed=True)
    q1 = crm.add("a", "s", "c", [])
    q2 = crm.add("b", "s", "c", [("CAS-1", "chloe", 0, "Reactive Upgrade - 108180")])
    agent.run(Mode.AUTOMATIC, confirm_automatic=True)
    for q in (q1, q2):
        assert row(agent, q)["status"] == Status.REVIEW.value
        assert "Aucun Case pertinent" in row(agent, q)["reason"]
    assert crm.writes == 0


def test_unrecognized_owner_user_or_team():
    agent, crm = make(automatic_allowed=True)
    qid = crm.add("a", "s", "c", [("CAS-1", "autre", 0), ("CAS-2", "team", 0)])
    agent.run(Mode.AUTOMATIC, confirm_automatic=True)
    assert row(agent, qid)["status"] == Status.REVIEW.value and "Owner non reconnu" in row(agent, qid)["reason"]
    assert crm.writes == 0


def test_mail_already_processed_is_skipped_and_never_overwritten():
    agent, crm = make(automatic_allowed=True)
    same = crm.add("a", "s", "c", [("CAS-1", "kader", 0)], worker="kader")
    other = crm.add("b", "s", "c", [("CAS-2", "kader", 0)], worker="chloe")
    out = agent.run(Mode.AUTOMATIC, confirm_automatic=True)
    assert row(agent, same)["status"] == Status.SKIPPED.value
    assert row(agent, other)["status"] == Status.REVIEW.value
    assert crm.items[other].worker.id == USERS["chloe"].id
    assert crm.writes == 0 and out["ignores"] == 1
    # second run after an assignment: the item stays "assigned", no new write
    agent2, crm2 = make(automatic_allowed=True)
    q = crm2.add("c", "s", "c", [("CAS-3", "estefania", 0)])
    agent2.run(Mode.AUTOMATIC, confirm_automatic=True)
    agent2.run(Mode.AUTOMATIC, confirm_automatic=True)
    assert crm2.writes == 1 and row(agent2, q)["status"] == Status.ASSIGNED.value


def test_refused_write_stops_the_run():
    agent, crm = make(automatic_allowed=True)
    crm.refuse_write = True
    q1 = crm.add("a", "s", "c", [("CAS-1", "kader", 0)])
    q2 = crm.add("b", "s", "c", [("CAS-2", "chloe", 0)])
    out = agent.run(Mode.AUTOMATIC, confirm_automatic=True)
    assert out["outcome"].startswith("interrompu")
    assert row(agent, q1)["status"] == Status.ERROR.value and "403" in row(agent, q1)["reason"]
    assert row(agent, q2)["status"] == Status.PENDING.value     # not touched after the failure
    assert crm.writes == 1


def test_concurrent_modification_is_not_overwritten():
    agent, crm = make(automatic_allowed=True)
    qid = crm.add("a", "s", "c", [("CAS-1", "kader", 0)])
    crm.concurrent_edit.add(qid)
    out = agent.run(Mode.AUTOMATIC, confirm_automatic=True)
    assert row(agent, qid)["status"] == Status.ERROR.value and "autre utilisateur" in row(agent, qid)["reason"]
    assert crm.items[qid].worker is None and out["outcome"].startswith("interrompu")


def test_lost_answer_is_verified_not_retried():
    agent, crm = make(automatic_allowed=True)
    crm.lost_answer = True
    qid = crm.add("a", "s", "c", [("CAS-1", "chloe", 0)])
    agent.run(Mode.AUTOMATIC, confirm_automatic=True)
    assert crm.writes == 1                                      # never clicked twice
    assert row(agent, qid)["status"] == Status.ASSIGNED.value   # confirmed by reading it back
    actions = [e["action"] for e in agent.journal.events(qid)]
    assert "ecriture_incertaine" in actions and "worked_by_verifie" in actions


def test_expired_session_stops_without_writing():
    agent, crm = make(automatic_allowed=True)
    crm.add("a", "s", "c", [("CAS-1", "kader", 0)])
    crm.session_expired = True
    out = agent.run(Mode.AUTOMATIC, confirm_automatic=True)
    assert "Session" in out["outcome"] and crm.writes == 0
    assert not agent.state.running


def test_recorded_mail_1_account_with_one_canceled_mover_case():
    """Video, 1st mail: Regarding = account; its only case "Mover" is Canceled, owner Estefania."""
    agent, crm = make(automatic_allowed=True)
    qid = crm.add("a", "Voir document joint", "Client fictif", [("CAS-186840", "estefania", 2)])
    agent.run(Mode.AUTOMATIC, confirm_automatic=True)
    assert row(agent, qid)["worked_by_name"] == "Estefania" and row(agent, qid)["status"] == Status.ASSIGNED.value


def test_recorded_mail_2_regarding_is_the_movers_case():
    """Video, 2nd mail: Regarding = the case "MOVERS" (Canceled, owner Kader). The account also holds a more
    recent resolved "Mover" case of Estefania: the case named in Regarding wins."""
    agent, crm = make(automatic_allowed=True)
    qid = crm.add("a", "Re :Contrat", "Client fictif",
                  [("CAS-167719", "estefania", 1, "Mover"), ("CAS-163699", "kader", 2, "MOVERS"),
                   ("CAS-151076", "autre", 1, "108180 - CARE - Separation Contrat")],
                  regarding_entity="incident", regarding_case=1)
    agent.run(Mode.AUTOMATIC, confirm_automatic=True)
    r = row(agent, qid)
    assert r["status"] == Status.ASSIGNED.value and r["case_number"] == "CAS-163699" and r["worked_by_name"] == "Kader"
    assert r["account_name"] == "Client fictif"


def test_different_owners_the_active_or_canceled_case_wins_over_resolved():
    """Business rule: same cases as the 2nd mail but Regarding = account — Resolved (Estefania) vs
    Canceled (Kader): the Canceled one wins. Same with Active vs Resolved."""
    agent, crm = make(automatic_allowed=True)
    q1 = crm.add("a", "s", "c", [("CAS-167719", "estefania", 1, "Mover"), ("CAS-163699", "kader", 2, "MOVERS")])
    q2 = crm.add("b", "s", "c", [("CAS-1", "chloe", 0), ("CAS-2", "estefania", 1)])
    agent.run(Mode.AUTOMATIC, confirm_automatic=True)
    assert row(agent, q1)["worked_by_name"] == "Kader" and row(agent, q1)["case_number"] == "CAS-163699"
    assert row(agent, q2)["worked_by_name"] == "Chloé" and row(agent, q2)["status"] == Status.ASSIGNED.value


def test_different_owners_both_active_or_canceled_stay_ambiguous():
    agent, crm = make(automatic_allowed=True)
    q1 = crm.add("a", "s", "c", [("CAS-1", "chloe", 0), ("CAS-2", "estefania", 2)])
    q2 = crm.add("b", "s", "c", [("CAS-3", "chloe", 1), ("CAS-4", "estefania", 1)])   # both Resolved
    agent.run(Mode.AUTOMATIC, confirm_automatic=True)
    assert row(agent, q1)["status"] == row(agent, q2)["status"] == Status.REVIEW.value and crm.writes == 0


def test_tasks_of_the_movers_tasks_view_are_processed_like_mails():
    agent, crm = make(automatic_allowed=True)
    qid = crm.add("t", "Rappeler le client", "c", [("CAS-9", "marc-antoine", 0, "MOVERS")], kind="task")
    agent.run(Mode.AUTOMATIC, confirm_automatic=True)
    assert row(agent, qid)["worked_by_name"] == "Marc-Antoine" and row(agent, qid)["status"] == Status.ASSIGNED.value


def test_manual_assignment_from_the_dropdown():
    agent, crm = make()
    qid = crm.add("a", "s", "c", [("CAS-1", "autre", 0)])            # owner is not one of the four
    agent.run(Mode.SIMULATION)
    assert row(agent, qid)["status"] == Status.REVIEW.value and crm.writes == 0
    r = agent.assign_manually(qid, "chloe", "marc-antoine.b")
    assert r["status"] == Status.ASSIGNED.value and "choix manuel de marc-antoine.b" in r["reason"]
    assert crm.items[qid].worker.id == USERS["chloe"].id and crm.writes == 1
    assert any(e["action"] == "attribution_manuelle" and e["actor"] == "marc-antoine.b" for e in agent.journal.events(qid))
    agent.run(Mode.SIMULATION)                        # next pass: stays assigned, no drop-down again
    assert row(agent, qid)["status"] == Status.ASSIGNED.value and crm.writes == 1


def test_worked_by_filled_elsewhere_without_proposal_is_ignored():
    agent, crm = make()
    qid = crm.add("a", "s", "c", [("CAS-1", "autre", 0)], worker="kader")   # filled by hand in the CRM
    agent.run(Mode.SIMULATION)
    assert row(agent, qid)["status"] == Status.SKIPPED.value


def test_manual_assignment_never_overwrites_and_needs_review_status():
    agent, crm = make()
    other = crm.add("a", "s", "c", [("CAS-1", "kader", 0)], worker="chloe")   # review: Worked By set by someone else
    proposed = crm.add("b", "s", "c", [("CAS-2", "kader", 0)])                # simulation proposal, not review
    agent.run(Mode.SIMULATION)
    with pytest.raises(RunBlocked, match="jamais écrasé"):
        agent.assign_manually(other, "kader", "local")
    with pytest.raises(RunBlocked, match="validation humaine"):
        agent.assign_manually(proposed, "kader", "local")
    with pytest.raises(RunBlocked, match="inconnu"):
        agent.assign_manually(other, "personne", "local")
    assert crm.writes == 0


def test_regarding_case_owned_by_someone_else_is_not_assigned():
    agent, crm = make(automatic_allowed=True)
    qid = crm.add("a", "s", "c", [("CAS-1", "autre", 0, "MOVERS")], regarding_entity="incident")
    agent.run(Mode.AUTOMATIC, confirm_automatic=True)
    assert "Owner non reconnu" in row(agent, qid)["reason"] and crm.writes == 0


def test_mail_without_account_and_inactive_collaborator():
    agent, crm = make(automatic_allowed=True)
    no_account = crm.add("a", "s", None, [])
    contact = crm.add("b", "s", "Contact", [], regarding_entity="contact")
    inactive = crm.add("c", "s", "c", [("CAS-1", "estefania", 0)])
    u = USERS["estefania"]
    crm.users[u.id] = type(u)(u.id, u.first_name, u.full_name, True)
    agent.run(Mode.AUTOMATIC, confirm_automatic=True)
    assert "Regarding" in row(agent, no_account)["reason"]
    assert "ni vers un Case" in row(agent, contact)["reason"]
    assert "inactif" in row(agent, inactive)["reason"]
    assert crm.writes == 0


def test_first_name_mismatch_with_configuration_is_an_error():
    agent, crm = make(automatic_allowed=True)
    qid = crm.add("a", "s", "c", [("CAS-1", "kader", 0)])
    u = USERS["kader"]
    crm.users[u.id] = type(u)(u.id, "Karim", "Karim Autre", False)
    agent.run(Mode.AUTOMATIC, confirm_automatic=True)
    assert row(agent, qid)["status"] == Status.ERROR.value and crm.writes == 0


def test_simulation_never_writes():
    from movers_dispatch.fake import demo_crm

    crm = demo_crm()
    agent, _ = make(crm)
    out = agent.run(Mode.SIMULATION)
    assert crm.writes == 0 and crm.write_log == []
    statuses = {r["status"] for r in agent.journal.items()}
    assert Status.ASSIGNED.value not in statuses and Status.PROPOSED.value in statuses
    assert out["detectes"] == len(crm.items) and out["affectes"] == 0


def test_simulation_is_read_only_even_if_preflight_fails():
    agent, crm = make()
    crm.preflight_problems = ["Worked By non modifiable"]
    crm.add("a", "s", "c", [("CAS-1", "kader", 0)])
    agent.run(Mode.SIMULATION)
    assert crm.writes == 0 and agent.state.problems == ["Worked By non modifiable"]


def test_writes_blocked_when_preflight_or_config_incomplete():
    agent, crm = make()
    crm.preflight_problems = ["Worked By non modifiable"]
    qid = crm.add("a", "s", "c", [("CAS-1", "kader", 0)])
    out = agent.run(Mode.SUPERVISED)
    assert out["outcome"].startswith("interrompu") and crm.writes == 0
    assert row(agent, qid) is None                              # the queue was not even read


def test_automatic_requires_configuration_and_explicit_confirmation():
    agent, crm = make()                                   # automatic_allowed = False
    with pytest.raises(RunBlocked):
        agent.run(Mode.AUTOMATIC, confirm_automatic=True)
    agent, crm = make(automatic_allowed=True)
    with pytest.raises(RunBlocked):
        agent.run(Mode.AUTOMATIC)
    assert crm.writes == 0


def test_supervised_approval_writes_after_fresh_check():
    agent, crm = make()
    qid = crm.add("a", "s", "c", [("CAS-1", "chloe", 0)])
    agent.run(Mode.SUPERVISED)
    assert row(agent, qid)["status"] == Status.AWAITING_APPROVAL.value and crm.writes == 0
    r = agent.approve(qid, "marc-antoine.b")
    assert r["status"] == Status.ASSIGNED.value and crm.items[qid].worker.id == USERS["chloe"].id
    approvals = [e for e in agent.journal.events(qid) if e["action"] == "validation_humaine"]
    assert approvals and approvals[0]["actor"] == "marc-antoine.b"


def test_supervised_approval_refused_when_crm_changed():
    agent, crm = make()
    qid = crm.add("a", "s", "c", [("CAS-1", "chloe", 0)])
    agent.run(Mode.SUPERVISED)
    # meanwhile a second relevant case owned by someone else appears
    account = crm.emails[crm.items[qid].object.id].regarding.id
    crm.cases[account].append(type(crm.cases[account][0])("x", "CAS-2", "Mover", 0, None,
                              crm.cases[account][0].owner.__class__(USERS["kader"].id, "systemuser", "Kader Exemple")))
    r = agent.approve(qid, "local")
    assert r["status"] == Status.REVIEW.value and "changé" in r["reason"] and crm.writes == 0


def test_reject_and_rejected_items_are_left_alone():
    agent, crm = make()
    qid = crm.add("a", "s", "c", [("CAS-1", "chloe", 0)])
    agent.run(Mode.SUPERVISED)
    agent.reject(qid, "local", "à voir")
    agent.run(Mode.SUPERVISED)
    assert row(agent, qid)["status"] == Status.REJECTED.value and crm.writes == 0
    with pytest.raises(RunBlocked):
        agent.approve(qid, "local")


def test_stop_prevents_any_further_write():
    agent, crm = make(automatic_allowed=True)
    for n in range(3):
        crm.add(str(n), "s", "c", [(f"CAS-{n}", "kader", 0)])
    original = crm.set_worked_by

    def write_then_stop(item, uid):
        original(item, uid)
        agent.stop()
    crm.set_worked_by = write_then_stop
    out = agent.run(Mode.AUTOMATIC, confirm_automatic=True)
    assert crm.writes == 1 and "Arrêt" in out["outcome"]


def test_journal_keeps_no_email_body_and_truncates_subject():
    agent, crm = make()
    crm.add("a", "Déménagement " + "x" * 300, "c", [("CAS-1", "kader", 0)])
    agent.run(Mode.SIMULATION)
    r = agent.journal.items()[0]
    assert len(r["subject"]) <= 80
    assert "body" not in r and "description" not in r


def test_correction_writes_the_right_collaborator_and_keeps_what_the_agent_saw():
    agent, crm = make(readiness_streak=2)
    good = crm.add("a", "s", "c", [("CAS-1", "kader", 0)])
    wrong = crm.add("b", "s", "c", [("CAS-2", "chloe", 0), ("CAS-3", "estefania", 1)])   # agent proposes Chloé
    agent.run(Mode.SUPERVISED)
    agent.approve(good, "marc-antoine")
    r = agent.correct(wrong, "estefania", "marc-antoine", "le Case résolu était le bon")
    assert r["status"] == Status.ASSIGNED.value and crm.items[wrong].worker.id == USERS["estefania"].id
    s = agent.journal.supervision(agent.cfg.readiness_streak)
    assert (s["acceptees"], s["corrigees"], s["serie"], s["taux_accord"], s["pret"]) == (1, 1, 0, 50, False)
    c = s["corrections"][0]
    assert (c["propose"], c["retenu"], c["case_propose"], c["note"]) == ("Chloé", "Estefania", "CAS-2", "le Case résolu était le bon")
    assert any("CAS-3 « Mover » résolu" in x for x in c["cases_vus"])


def test_correction_rules_and_readiness_streak():
    agent, crm = make(readiness_streak=2)
    ids = [crm.add(str(n), "s", "c", [(f"CAS-{n}", "kader", 0)]) for n in range(3)]
    agent.run(Mode.SUPERVISED)
    with pytest.raises(RunBlocked, match="Valider"):
        agent.correct(ids[0], "kader", "local")          # same as the proposal
    agent.approve(ids[0], "local")
    with pytest.raises(RunBlocked, match="n'attend pas"):
        agent.correct(ids[0], "chloe", "local")          # already decided
    agent.approve(ids[1], "local")
    s = agent.journal.supervision(2)
    assert s["serie"] == 2 and s["pret"] is True
