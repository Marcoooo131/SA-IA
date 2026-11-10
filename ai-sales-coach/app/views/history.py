"""Page « Historique des analyses »."""
from __future__ import annotations

import pandas as pd
import streamlit as st

from app import state, ui
from sales_coach.security.auth import audit
from sales_coach.storage import repo


def load_rows(include_training: bool = False) -> list[dict]:
    agents = {a.id for a in state.visible_agents()}
    return [r for r in repo.list_analyses(include_training=include_training) if r["agent_id"] in agents]


def render() -> None:
    st.title("Historique des analyses")
    rows = load_rows(include_training=st.toggle("Inclure les entraînements", value=False))
    if not rows:
        st.info("Aucune analyse enregistrée.")
        return
    df = pd.DataFrame(rows)
    f1, f2, f3 = st.columns(3)
    with f1:
        agents = ["Tous"] + sorted(df["agent"].unique())
        ag = st.selectbox("Commercial", agents)
    with f2:
        dmin, dmax = df["call_date"].min().date(), df["call_date"].max().date()
        period = st.date_input("Période", value=(dmin, dmax), format="DD/MM/YYYY")
    with f3:
        codes = sorted({c for r in rows for c in r["error_codes"]})
        err = st.selectbox("Contenant l'erreur", ["Toutes"] + codes)
    if ag != "Tous":
        df = df[df["agent"] == ag]
    if isinstance(period, tuple) and len(period) == 2:
        df = df[(df["call_date"].dt.date >= period[0]) & (df["call_date"].dt.date <= period[1])]
    if err != "Toutes":
        df = df[df["error_codes"].apply(lambda c: err in c)]

    show = df[["id", "call_date", "agent", "title", "total_score", "level", "retention_potential", "outcome", "engine"]].copy()
    show["call_date"] = show["call_date"].dt.strftime("%d/%m/%Y")
    show["outcome"] = show["outcome"].fillna("non renseigné")
    st.dataframe(show.sort_values("id", ascending=False), hide_index=True, use_container_width=True, column_config={
        "id": "N°", "call_date": "Date", "agent": "Commercial", "title": "Appel", "total_score": st.column_config.ProgressColumn("Note", min_value=0, max_value=100, format="%.1f"),
        "level": "Niveau", "retention_potential": "Potentiel (estimé)", "outcome": "Résultat réel", "engine": "Moteur"})

    ids = df.sort_values("id", ascending=False)["id"].tolist()
    if not ids:
        return
    sel = st.selectbox("Ouvrir l'analyse n°", ids)
    report, transcript, meta = repo.load_analysis(sel)
    audit(state.user()["username"], "consultation analyse", target=f"analyse #{sel}")
    st.subheader(f"#{sel} — {meta.get('title', '')}")
    if state.allowed("record_outcome"):
        with st.expander("Résultat commercial réel (distinct de la note de qualité)"):
            c1, c2 = st.columns([1, 2])
            with c1:
                res = st.selectbox("Résultat", repo.OUTCOMES, key=f"oc_{sel}")
            with c2:
                note = st.text_input("Note", key=f"ocn_{sel}")
            if st.button("Enregistrer le résultat", key=f"ocb_{sel}"):
                repo.record_outcome(meta["call_id"], res, note, by=state.user()["username"])
                audit(state.user()["username"], "résultat commercial", target=f"appel #{meta['call_id']}", detail=res)
                st.success("Résultat enregistré.")
    if meta.get("purged") or report is None:
        st.warning("Détail purgé (durée de conservation dépassée) : seules les notes chiffrées et les codes d'erreur sont conservés.")
    else:
        ui.render_report(report, transcript, key=f"hist_{sel}")
        st.download_button("⬇️ Rapport (Markdown)", ui.report_markdown(report, meta.get("title", "")), file_name=f"rapport_{sel}.md")
    if state.allowed("purge"):
        with st.expander("Supprimer cet appel"):
            if st.button("Supprimer définitivement (transcription, audio, analyse)", key=f"del_{sel}"):
                repo.delete_call(meta["call_id"])
                audit(state.user()["username"], "suppression appel", target=f"appel #{meta['call_id']}")
                st.success("Appel supprimé.")
                st.rerun()
