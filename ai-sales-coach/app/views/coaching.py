"""Page « Coaching individuel » : profil, 3 difficultés, programme GROW personnalisé."""
from __future__ import annotations

import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from app import state, ui
from sales_coach.analysis.catalog import CRITERIA, CRITERIA_LABELS
from sales_coach.coaching.engine import build_profile
from sales_coach.storage import repo
from sales_coach.training.personas import PERSONAS


def render() -> None:
    st.title("Coaching individuel")
    agent = state.agent_selector()
    if agent is None:
        return
    rows = repo.list_analyses(agent_id=agent.id)
    trainings = repo.list_training(agent_id=agent.id)
    p = build_profile(agent.id, agent.name, rows, trainings, agent.objectives or "")

    c1, c2, c3, c4 = st.columns(4)
    with c1:
        ui.card("Appels analysés", str(p.n_calls), f"{p.training_sessions} entraînement(s)", accent=True)
    with c2:
        ui.card("Note moyenne", f"{p.avg_score:g}/100" if p.avg_score is not None else "—", p.level)
    with c3:
        prog = "—" if p.progression is None else f"{p.progression:+g} pts"
        ui.card("Progression", prog, "moyenne des 3 derniers vs 3 premiers appels")
    with c4:
        ui.card("Dernière note", f"{p.last_score:g}/100" if p.last_score is not None else "—", f"meilleure : {p.best_score:g}" if p.best_score is not None else "")
    for n in p.notes:
        st.caption(n)
    if not p.n_calls:
        st.info("Aucun appel analysé pour ce commercial : le profil se construira au fil des analyses.")
        return

    left, right = st.columns([3, 2])
    with left:
        df = pd.DataFrame(rows)
        fig = go.Figure(go.Scatter(x=df["call_date"], y=df["total_score"], mode="lines+markers", line=dict(color=ui.RED, width=2),
                                   marker=dict(size=9, color=ui.RED, line=dict(color=ui.SURFACE, width=2)),
                                   hovertemplate="%{x|%d/%m/%Y}<br>Note : %{y:.1f}/100<extra></extra>", name="Note"))
        fig.update_yaxes(range=[0, 100], title="Note /100")
        st.plotly_chart(ui.base_layout(fig, 300, "Évolution de la note"), use_container_width=True)
    with right:
        labels = [CRITERIA_LABELS[k] for k, _, _ in CRITERIA]
        vals = [p.criteria_pct.get(k) for k, _, _ in CRITERIA]
        fig2 = go.Figure(go.Bar(x=[v if v is not None else 0 for v in vals], y=labels, orientation="h", marker=dict(color=ui.RED, cornerradius=4),
                                text=[f"{v:.0f} %" if v is not None else "n.é." for v in vals], textposition="outside", textfont=dict(color=ui.WHITE),
                                hovertemplate="%{y}<br>%{x:.0f} % des points<extra></extra>"))
        fig2.update_xaxes(range=[0, 115])
        fig2.update_yaxes(autorange="reversed")
        st.plotly_chart(ui.base_layout(fig2, 300, "Maîtrise par critère (moyenne)"), use_container_width=True)

    s, d = st.columns(2)
    with s:
        st.subheader("Points forts")
        for x in p.strengths or ["Pas encore de point fort net (aucun critère ≥ 70 %)."]:
            st.markdown(f"- ✅ {x}")
        if p.recurring_errors:
            st.subheader("Erreurs récurrentes")
            for title, cnt in p.recurring_errors:
                st.markdown(f"- {title} — **{cnt}** appel(s)")
    with d:
        st.subheader("Les 3 principales difficultés")
        if not p.difficulties:
            st.success("Aucune erreur récurrente détectée.")
        for i, x in enumerate(p.difficulties, 1):
            st.markdown(f"**{i}. {x.title}**  \n<span class='asc-note'>{x.criterion} · {x.calls_with_error}/{x.total_calls} appels</span>", unsafe_allow_html=True)

    st.subheader("Programme de progression personnalisé (GROW)")
    st.caption("Construit à partir des erreurs réellement observées chez ce commercial : les exercices diffèrent d'un commercial à l'autre.")
    for i, step in enumerate(p.program, 1):
        with st.expander(f"Étape {i} — {step.difficulty}", expanded=i == 1):
            st.markdown(f"**🎯 Objectif (Goal)** — {step.goal}")
            st.markdown(f"**📍 Réalité (Reality)** — {step.reality}")
            st.markdown("**🧩 Options (exercices)**")
            for o in step.options:
                st.markdown(f"- {o}")
            st.markdown(f"**✅ Engagement (Will)** — {step.will}")
            st.markdown(f"**📏 Mesure** — {step.measure}")
            st.markdown("**🥊 Simulations recommandées** : " + ", ".join(PERSONAS[k].label for k in step.personas if k in PERSONAS)
                        + f" — niveau conseillé {p.recommended_difficulty}/5")

    st.subheader("Objectifs de progression")
    for o in p.objectives:
        st.markdown(f"- {o}")
    if state.allowed("view_all"):
        with st.form("objectives"):
            txt = st.text_area("Objectifs fixés par le manager (un par ligne)", value=agent.objectives or "")
            if st.form_submit_button("Enregistrer les objectifs"):
                repo.set_agent_objectives(agent.id, txt)
                st.success("Objectifs enregistrés.")
                st.rerun()

    if trainings:
        st.subheader("Entraînements")
        tdf = pd.DataFrame(trainings)
        tdf["persona"] = tdf["persona"].map(lambda k: PERSONAS[k].label if k in PERSONAS else k)
        tdf["created_at"] = tdf["created_at"].dt.strftime("%d/%m/%Y %H:%M")
        st.dataframe(tdf[["created_at", "persona", "difficulty", "score", "outcome", "engine"]], hide_index=True, use_container_width=True,
                     column_config={"created_at": "Date", "persona": "Client simulé", "difficulty": "Niveau", "score": "Note", "outcome": "Issue", "engine": "Moteur"})
