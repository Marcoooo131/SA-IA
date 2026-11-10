"""Page « Dashboard »."""
from __future__ import annotations

import plotly.graph_objects as go
import streamlit as st

from app import state, ui
from app.views.history import load_rows
from sales_coach import analytics


def filters(df, key: str):
    c1, c2, c3 = st.columns(3)
    with c1:
        agent = st.selectbox("Commercial", ["Tous"] + sorted(df["agent"].unique()), key=f"{key}_ag")
    with c2:
        period = st.date_input("Période", value=(df["call_date"].min().date(), df["call_date"].max().date()), format="DD/MM/YYYY", key=f"{key}_per")
    with c3:
        freq = analytics.error_frequency(df, top=50)
        opts = ["Toutes"] + freq["code"].tolist()
        labels = dict(zip(freq["code"], freq["erreur"]))
        err = st.selectbox("Catégorie d'erreur", opts, format_func=lambda c: labels.get(c, c), key=f"{key}_err")
    start, end = (period if isinstance(period, tuple) and len(period) == 2 else (None, None))
    return analytics.filter_frame(df, agent, start, end, err)


def render() -> None:
    st.title("Dashboard")
    df = analytics.to_frame(load_rows())
    if df.empty:
        st.info("Aucune analyse enregistrée. Commencez par « Analyse d'un appel » (des appels fictifs sont fournis) ou chargez la démonstration dans « Paramètres ».")
        return
    df = filters(df, "dash")
    k = analytics.kpis(df)
    if not k["n"]:
        st.warning("Aucune analyse ne correspond aux filtres.")
        return
    c = st.columns(5)
    with c[0]:
        ui.card("Appels analysés", str(k["n"]), f"{k['agents']} commercial(aux)", accent=True)
    with c[1]:
        ui.card("Note commerciale moyenne", f"{k['avg']:g}/100", "qualité de l'appel")
    with c[2]:
        ui.card("Qualité de la découverte", f"{k['discovery_pct']:.0f} %" if k["discovery_pct"] is not None else "—", "des points du critère")
    with c[3]:
        ui.card("Traitement des objections", f"{k['objections_pct']:.0f} %" if k["objections_pct"] is not None else "—", "des points (appels évaluables)")
    with c[4]:
        ui.card("Occasions manquées", str(k["missed_total"]), f"{k['missed_avg']:g} par appel")

    st.markdown("#### Résultats commerciaux réels")
    st.caption("Saisis manuellement dans l'historique. À ne pas confondre avec la note de qualité : un bon appel n'aboutit pas toujours à une rétention.")
    r = st.columns(4)
    with r[0]:
        ui.card("Taux de rétention réel", f"{k['retention_rate']:.0f} %" if k["retention_rate"] is not None else "non disponible",
                f"sur {k['retained'] + k['lost']} résultat(s) décidé(s)")
    with r[1]:
        ui.card("Clients conservés", str(k["retained"]))
    with r[2]:
        ui.card("Résiliations", str(k["lost"]))
    with r[3]:
        ui.card("En attente / non renseignés", f"{k['pending']} / {k['n'] - k['outcomes_known']}")

    left, right = st.columns(2)
    with left:
        w = analytics.weekly_scores(df)
        fig = go.Figure(go.Scatter(x=w["call_date"], y=w["mean"], mode="lines+markers", line=dict(color=ui.RED, width=2),
                                   marker=dict(size=9, color=ui.RED, line=dict(color=ui.SURFACE, width=2)), customdata=w["count"],
                                   hovertemplate="Semaine du %{x|%d/%m/%Y}<br>Note moyenne : %{y:.1f}<br>%{customdata} appel(s)<extra></extra>"))
        fig.update_yaxes(range=[0, 100], title="Note moyenne /100")
        st.plotly_chart(ui.base_layout(fig, 320, "Évolution des notes (moyenne hebdomadaire)"), use_container_width=True)
    with right:
        lv = analytics.level_distribution(df)
        fig = go.Figure(go.Bar(x=lv["niveau"], y=lv["appels"], marker=dict(color=ui.RED, cornerradius=4), text=lv["appels"], textposition="outside",
                               textfont=dict(color=ui.WHITE), hovertemplate="%{x} : %{y} appel(s)<extra></extra>"))
        st.plotly_chart(ui.base_layout(fig, 320, "Répartition des niveaux"), use_container_width=True)

    ef = analytics.error_frequency(df, top=8)
    if not ef.empty:
        fig = go.Figure(go.Bar(x=ef["part"], y=ef["erreur"], orientation="h", marker=dict(color=ui.RED, cornerradius=4),
                               text=[f"{p:.0f} % ({n})" for p, n in zip(ef["part"], ef["appels"])], textposition="outside", textfont=dict(color=ui.WHITE),
                               hovertemplate="%{y}<br>%{x:.0f} % des appels<extra></extra>"))
        fig.update_xaxes(range=[0, 115], title="% des appels concernés")
        fig.update_yaxes(autorange="reversed")
        st.plotly_chart(ui.base_layout(fig, 360, "Difficultés les plus fréquentes"), use_container_width=True)

    if state.allowed("view_all") and df["agent"].nunique() > 1:
        st.markdown("#### Progression individuelle")
        st.dataframe(analytics.per_agent(df), hide_index=True, use_container_width=True)
