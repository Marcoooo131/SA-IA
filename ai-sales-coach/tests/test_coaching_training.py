from sales_coach.coaching.engine import build_profile
from sales_coach.demo import load_demo
from sales_coach.storage import repo
from sales_coach.training import simulator as sim


def _profiles():
    load_demo()
    return {a.name: build_profile(a.id, a.name, repo.list_analyses(agent_id=a.id)) for a in repo.list_agents()}


def test_profiles_are_individualized():
    p = _profiles()
    assert set(p) == {"Agent 01", "Agent 02", "Agent 03"}
    for prof in p.values():
        assert prof.n_calls >= 4 and prof.progression is not None
        assert 1 <= len(prof.difficulties) <= 3 and len(prof.program) == len(prof.difficulties)
        assert all(step.options and step.goal and step.measure for step in prof.program)
    assert p["Agent 02"].avg_score > p["Agent 03"].avg_score
    # Pas le même programme pour tout le monde
    assert [d.code for d in p["Agent 02"].difficulties] != [d.code for d in p["Agent 03"].difficulties]


def test_profile_with_little_data_says_so():
    prof = build_profile(1, "X", [])
    assert prof.avg_score is None and prof.progression is None and prof.notes


def test_good_training_path_retains_client():
    st = sim.start("presse", 2, seed=1)
    for m in ["Bonjour, je suis Léa du service clients. Je comprends, on va faire simple. Où partez-vous ?",
              "Je comprends. Comment se présente votre future maison, qu'est-ce qui compte pour vous côté sécurité ?",
              "Si je comprends bien, votre femme n'est pas rassurée. Je vous propose de vérifier la continuité du service à votre nouvelle adresse, je m'occupe de tout. Qu'en pensez-vous ?",
              "Je récapitule : je vérifie la continuité à Nantes et je vous envoie les modalités sous 48 heures. Cela vous convient-il ?"]:
        st = sim.reply(st, m)
    assert st.finished and st.outcome == "conservé"
    assert {"destination", "security"} <= set(st.revealed)


def test_rapid_acceptance_ends_call():
    st = sim.reply(sim.start("indecis", 1, seed=2), "Pas de souci, je lance la résiliation.")
    assert st.finished and st.outcome == "résilié"


def test_pressure_angers_aggressive_client():
    st = sim.start("agressif", 3, seed=3)
    st = sim.reply(st, "Calmez-vous monsieur, c'est la procédure.")
    assert st.finished and "irrité" in st.outcome


def test_premature_proposal_is_resisted():
    st = sim.start("deja_equipe", 3, seed=4)
    st = sim.reply(st, "Je vous propose de garder votre contrat.")
    assert not st.proposal_accepted and not st.finished


def test_client_never_coaches_during_exercise():
    st = sim.start("mecontent", 2, seed=5)
    for m in ["Vous avez reçu la facture ?", "D'accord.", "Vous voulez résilier ?"]:
        st = sim.reply(st, m)
    client_text = " ".join(t["text"] for t in st.turns if t["speaker"] == "CLIENT").lower()
    for word in ["question ouverte", "vous auriez dû", "conseil", "reformul"]:
        assert word not in client_text


def test_state_roundtrip_and_difficulty_progression():
    st = sim.start("indecis", 2, seed=6)
    assert sim.SimState.from_dict(st.to_dict()).to_dict() == st.to_dict()
    assert sim.next_difficulty(80, 2) == 3 and sim.next_difficulty(30, 2) == 1 and sim.next_difficulty(60, 2) == 2


def test_replay_evaluation():
    good, _ = sim.evaluate_reply("C'est trop cher", "Je comprends, le budget compte. Qu'est-ce qui pèse le plus en ce moment ?")
    bad, _ = sim.evaluate_reply("C'est trop cher", "Pas de souci, je lance la résiliation.")
    assert good >= 80 and bad <= 10
