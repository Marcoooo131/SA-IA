"""Page « Entraînement commercial » : l'IA joue un client qui veut résilier pour cause de déménagement."""
from __future__ import annotations

import streamlit as st

from app import state, ui
from sales_coach.analysis.analyzer import analyze
from sales_coach.coaching.engine import build_profile
from sales_coach.config import get_settings
from sales_coach.core.models import AGENT
from sales_coach.llm.factory import ExternalApiBlocked, LLMError, get_llm
from sales_coach.security.auth import audit
from sales_coach.storage import repo
from sales_coach.training import simulator as sim
from sales_coach.training.personas import PERSONAS


def _get_llm_for_training():
    cfg = get_settings()
    if cfg.llm_provider in {"", "none"}:
        return None, "Aucun modèle IA configuré."
    try:
        llm = get_llm(cfg)
    except (ExternalApiBlocked, LLMError) as exc:
        return None, str(exc)
    return llm, ""


def render() -> None:
    state.require("training")
    st.title("Entraînement commercial")
    st.caption("Menez la conversation : le client simulé veut résilier à cause d'un déménagement. Aucune aide pendant l'exercice — le débriefing arrive à la fin.")
    agent = state.agent_selector(key="tr_agent")
    if agent is None:
        return
    sess = st.session_state.get("tr_state")

    if sess is None:
        profile = build_profile(agent.id, agent.name, repo.list_analyses(agent_id=agent.id), repo.list_training(agent_id=agent.id))
        recommended = [k for s in profile.program for k in s.personas]
        c1, c2, c3 = st.columns(3)
        with c1:
            keys = list(PERSONAS)
            default = keys.index(recommended[0]) if recommended else 0
            persona = st.selectbox("Profil du client", keys, index=default, format_func=lambda k: PERSONAS[k].label + (" ⭐ recommandé" if k in recommended else ""))
        with c2:
            diff = st.select_slider("Difficulté", options=[1, 2, 3, 4, 5], value=profile.recommended_difficulty, format_func=lambda d: f"{d} — {sim.DIFFICULTY_LABELS[d]}")
        with c3:
            llm, why = _get_llm_for_training()
            engines = ["scénario"] + (["IA"] if llm is not None and not llm.external else [])
            engine = st.radio("Moteur du client", engines, horizontal=True, help="« IA » : modèle local configuré. Les modèles externes ne sont pas utilisés en entraînement." + (f" ({why})" if why else ""))
        st.markdown(f"> {PERSONAS[persona].description}" if diff <= 2 else "> Profil caché : découvrez la situation du client par vos questions.")
        if st.button("📞 Décrocher", type="primary"):
            st.session_state["tr_state"] = sim.start(persona, diff, engine=engine).to_dict()
            st.session_state["tr_agent_id"] = agent.id
            st.session_state.pop("tr_result", None)
            st.rerun()
        _show_history(agent.id)
        return

    stt = sim.SimState.from_dict(sess)
    p = PERSONAS[stt.persona_key]
    st.markdown(f"**Client : {p.label}** · difficulté {stt.difficulty}/5 · moteur : {stt.engine}")
    for t in stt.turns:
        with st.chat_message("user" if t["speaker"] == AGENT else "assistant", avatar="🧑‍💼" if t["speaker"] == AGENT else "📞"):
            st.markdown(t["text"])

    if not stt.finished:
        msg = st.chat_input("Votre réponse au client…")
        c1, c2 = st.columns([1, 4])
        with c1:
            stop = st.button("Terminer l'appel")
        if msg:
            if stt.engine == "IA":
                llm, why = _get_llm_for_training()
                if llm is None:
                    st.error(why)
                    return
                try:
                    stt = sim.reply_llm(stt, msg, llm)
                except RuntimeError as exc:
                    st.error(str(exc))
                    return
            else:
                stt = sim.reply(stt, msg)
            st.session_state["tr_state"] = stt.to_dict()
            st.rerun()
        if stop:
            stt = sim.end_by_agent(stt)
            st.session_state["tr_state"] = stt.to_dict()
            st.rerun()
        return

    # ---------------------------------------------------------------- débriefing
    result = st.session_state.get("tr_result")
    if result is None:
        transcript = sim.to_transcript(stt)
        if not transcript.agent_turns():
            st.warning("Aucune réplique du commercial : rien à évaluer.")
            if st.button("Nouvel exercice"):
                st.session_state.pop("tr_state", None)
                st.rerun()
            return
        report = analyze(transcript)
        an_id = repo.save_analysis(st.session_state["tr_agent_id"], f"Entraînement — {p.label} (niveau {stt.difficulty})", transcript, report,
                                   consent=True, anonymized=False, created_by=state.user()["username"], is_training=True)
        repo.save_training(st.session_state["tr_agent_id"], stt.persona_key, stt.difficulty, stt.engine, report.total_score, stt.outcome, an_id)
        audit(state.user()["username"], "entraînement", target=p.label, detail=f"note={report.total_score}; issue={stt.outcome}")
        result = {"report": report, "transcript": transcript}
        st.session_state["tr_result"] = result
    report, transcript = result["report"], result["transcript"]

    st.divider()
    st.header("Débriefing")
    nxt = sim.next_difficulty(report.total_score, stt.difficulty)
    c1, c2, c3 = st.columns(3)
    with c1:
        ui.card("Note de l'exercice", f"{report.total_score:g}/100", report.level, accent=True)
    with c2:
        ui.card("Issue de la simulation", stt.outcome or "—", "résultat simulé, pas un résultat réel")
    with c3:
        ui.card("Prochain niveau conseillé", f"{nxt}/5", sim.DIFFICULTY_LABELS[nxt])
    if not p.retainable:
        st.info("Ce profil part définitivement : la réussite se mesure à la qualité de la sortie (respect, question d'ouverture, solution pour le repreneur), pas à la conservation.")

    tab_r, tab_replay = st.tabs(["📋 Rapport complet", "🔁 Rejouer les passages ratés"])
    with tab_r:
        ui.render_report(report, transcript, key="training")
    with tab_replay:
        if not report.ideal_conversation:
            st.success("Aucun passage raté identifié.")
        for i, x in enumerate(report.ideal_conversation):
            st.markdown(f"#### Passage {i + 1}")
            if x.client_line:
                ui.quote("Client", x.client_line.quote)
            ui.quote("Votre réponse initiale", x.agent_line.quote)
            new = st.text_area("Votre nouvelle réponse", key=f"replay_{i}", height=80)
            if st.button("Évaluer ma réponse", key=f"replay_btn_{i}") and new.strip():
                score, comments = sim.evaluate_reply(x.client_line.quote if x.client_line else "", new)
                st.markdown(f"**Évaluation : {score}/100**")
                for c in comments:
                    st.markdown(f"- {c}")
                st.markdown("**Réponse de référence du coach :**")
                ui.better(x.better_response)
    if st.button("🔄 Nouvel exercice", type="primary"):
        st.session_state.pop("tr_state", None)
        st.session_state.pop("tr_result", None)
        st.rerun()


def _show_history(agent_id: int) -> None:
    rows = repo.list_training(agent_id=agent_id)
    if rows:
        st.subheader("Derniers entraînements")
        for r in reversed(rows[-5:]):
            st.markdown(f"- {r['created_at']:%d/%m %H:%M} · {PERSONAS.get(r['persona']).label if r['persona'] in PERSONAS else r['persona']} · niveau {r['difficulty']} · **{r['score']:g}/100** · {r['outcome']}")
