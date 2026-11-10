"""Page « Performances des agents » (managers)."""
from __future__ import annotations

import plotly.graph_objects as go
import streamlit as st

from app import state, ui
from app.views.dashboard import filters
from app.views.history import load_rows
from sales_coach import analytics
from sales_coach.analysis.catalog import CRITERIA


def render() -> None:
    state.require("view_all")
    st.title("Performances des agents")
    df = analytics.to_frame(load_rows())
    if df.empty:
        st.info("Aucune analyse enregistrée.")
        return
    df = filters(df, "perf")
    if df.empty:
        st.warning("Aucune analyse ne correspond aux filtres.")
        return
    table = analytics.per_agent(df)
    st.dataframe(table, hide_index=True, use_container_width=True, column_config={
        "Note moyenne": st.column_config.ProgressColumn("Note moyenne", min_value=0, max_value=100, format="%.1f")})
    st.caption("« Rétention réelle » ne s'affiche que si des résultats commerciaux ont été saisis ; elle est indépendante de la note de qualité.")

    agents = table["Commercial"].tolist()
    shown = agents[:8]
    if len(agents) > 8:
        st.caption("Courbes limitées aux 8 commerciaux ayant la meilleure note moyenne (filtrez par commercial pour les autres).")
    fig = go.Figure()
    for i, a in enumerate(shown):
        g = df[df["agent"] == a].sort_values("call_date")
        fig.add_trace(go.Scatter(x=g["call_date"], y=g["total_score"], mode="lines+markers", name=a,
                                 line=dict(color=ui.CATEGORICAL[i], width=2), marker=dict(size=8, line=dict(color=ui.SURFACE, width=2)),
                                 hovertemplate=f"{a}<br>%{{x|%d/%m/%Y}} : %{{y:.1f}}/100<extra></extra>"))
    fig.update_yaxes(range=[0, 100], title="Note /100")
    st.plotly_chart(ui.base_layout(fig, 380, "Évolution des notes par commercial"), use_container_width=True)

    st.markdown("#### Maîtrise moyenne par critère (%)")
    crit = df.groupby("agent")[[f"{k}_pct" for k, _, _ in CRITERIA]].mean().round(0)
    crit.columns = [label for _, label, _ in CRITERIA]
    st.dataframe(crit, use_container_width=True)
