"""Composants d'interface partagés : thème noir / blanc / rouge, cartes, rendu du rapport."""
from __future__ import annotations

import html

import plotly.graph_objects as go
import streamlit as st

from sales_coach.analysis.catalog import CRITERIA_LABELS
from sales_coach.core.models import AnalysisReport, Transcript

RED = "#E10600"
WHITE = "#F5F5F5"
MUTED = "#9A9A9A"
GRID = "#2A2A2A"
SURFACE = "#171717"
# Palette catégorielle validée (mode sombre) — ordre fixe, jamais recyclée.
CATEGORICAL = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"]

CSS = f"""
<style>
:root {{ --red: {RED}; }}
.block-container {{ padding-top: 1.6rem; max-width: 1350px; }}
h1, h2, h3 {{ letter-spacing: -0.01em; }}
h1 {{ border-left: 6px solid var(--red); padding-left: .6rem; }}
[data-testid="stSidebar"] {{ background: #000; border-right: 1px solid #222; }}
.asc-card {{ background: {SURFACE}; border: 1px solid #262626; border-radius: 10px; padding: 14px 16px; height: 100%; min-height: 118px; }}
.asc-card .lbl {{ color: {MUTED}; font-size: .78rem; text-transform: uppercase; letter-spacing: .06em; }}
.asc-card .val {{ color: {WHITE}; font-size: 1.9rem; font-weight: 700; line-height: 1.2; }}
.asc-card .sub {{ color: {MUTED}; font-size: .8rem; }}
.asc-card.accent {{ border-top: 3px solid var(--red); }}
.asc-badge {{ display:inline-block; padding: 2px 8px; border-radius: 999px; font-size: .75rem; border: 1px solid #333; margin-right: 4px; color: {WHITE}; }}
.asc-badge.red {{ background: rgba(225,6,0,.15); border-color: var(--red); }}
.asc-quote {{ border-left: 3px solid var(--red); background: #121212; padding: 8px 12px; border-radius: 4px; margin: 6px 0; }}
.asc-quote .who {{ color: {MUTED}; font-size: .75rem; text-transform: uppercase; }}
.asc-better {{ border-left: 3px solid {WHITE}; background: #141414; padding: 8px 12px; border-radius: 4px; margin: 6px 0; }}
.asc-dialog .role {{ font-weight: 700; font-size: .8rem; letter-spacing: .05em; }}
.asc-dialog .client {{ color: {WHITE}; }} .asc-dialog .agent {{ color: {MUTED}; }} .asc-dialog .coach {{ color: {RED}; }} .asc-dialog .best {{ color: #ffffff; }}
.asc-note {{ color: {MUTED}; font-size: .8rem; }}
div.stButton > button[kind="primary"] {{ background: var(--red); border-color: var(--red); }}
</style>
"""


def inject_css() -> None:
    st.markdown(CSS, unsafe_allow_html=True)


def card(label: str, value: str, sub: str = "", accent: bool = False) -> None:
    st.markdown(
        f'<div class="asc-card {"accent" if accent else ""}"><div class="lbl">{html.escape(label)}</div>'
        f'<div class="val">{html.escape(value)}</div><div class="sub">{html.escape(sub)}</div></div>',
        unsafe_allow_html=True,
    )


def quote(who: str, text: str, ts: str = "") -> None:
    t = f" · {html.escape(ts)}" if ts else ""
    st.markdown(f'<div class="asc-quote"><div class="who">{html.escape(who)}{t}</div>« {html.escape(text)} »</div>', unsafe_allow_html=True)


def better(text: str) -> None:
    st.markdown(f'<div class="asc-better">💬 {html.escape(text)}</div>', unsafe_allow_html=True)


def base_layout(fig: go.Figure, height: int = 320, title: str = "") -> go.Figure:
    fig.update_layout(
        template="plotly_dark", paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)", height=height,
        margin=dict(l=10, r=10, t=40 if title else 10, b=10), title=dict(text=title, font=dict(size=14, color=WHITE)),
        font=dict(color=WHITE), hoverlabel=dict(bgcolor="#111", font_color=WHITE),
        legend=dict(orientation="h", yanchor="bottom", y=1.02, x=0),
    )
    fig.update_xaxes(gridcolor=GRID, zeroline=False, linecolor="#333")
    fig.update_yaxes(gridcolor=GRID, zeroline=False, linecolor="#333")
    return fig


def criteria_chart(report: AnalysisReport) -> go.Figure:
    crit = [c for c in report.criteria]
    labels = [f"{c.label} ({c.max_points})" for c in crit]
    pct = [round(100 * c.ratio) if c.evaluated else None for c in crit]
    text = [f"{c.score:g}/{c.max_points}" if c.evaluated else "non évaluable" for c in crit]
    fig = go.Figure(go.Bar(
        x=pct, y=labels, orientation="h", marker=dict(color=RED, cornerradius=4), text=text, textposition="outside",
        textfont=dict(color=WHITE), hovertemplate="%{y}<br>%{text} (%{x} %)<extra></extra>",
    ))
    fig.update_xaxes(range=[0, 115], title="% des points du critère")
    fig.update_yaxes(autorange="reversed")
    return base_layout(fig, height=300)


def score_color_label(score: float) -> str:
    return "🟥" if score < 40 else ("🟧" if score < 60 else ("⬜" if score < 75 else "✅"))


def render_report(report: AnalysisReport, transcript: Transcript | None = None, key: str = "rep") -> None:
    """Rapport de correction structuré A → E."""
    if report.warnings:
        with st.expander(f"⚠️ Avertissements ({len(report.warnings)})", expanded=False):
            for w in report.warnings:
                st.markdown(f"- {w}")

    st.subheader("A. Résultat général")
    c1, c2, c3, c4 = st.columns(4)
    with c1:
        card("Note globale", f"{report.total_score:g}/100", report.quality_label, accent=True)
    with c2:
        card("Niveau commercial", report.level)
    with c3:
        card("Potentiel de rétention", report.retention_potential, report.stats.get("retention_potential_reasons", "")[:90])
    with c4:
        q = report.stats.get("questions", {})
        card("Questions ouvertes / fermées", f"{q.get('ouverte', 0)} / {q.get('fermée', 0) + q.get('fermée orientée négativement', 0)}",
             f"Temps de parole commercial : {int(100 * report.stats.get('talk_ratio_agent', 0))} %")
    st.markdown(
        " ".join(f'<span class="asc-badge red">{html.escape(s)}</span>' for s in report.situations)
        + f' <span class="asc-note">Moteur : {html.escape(report.engine)}</span>', unsafe_allow_html=True)
    if report.stats.get("coach_summary"):
        st.info(f"**Synthèse du coach (IA, vérifiée)** — {report.stats['coach_summary']}")

    left, right = st.columns([3, 2])
    with left:
        st.plotly_chart(criteria_chart(report), use_container_width=True, key=f"{key}_crit")
    with right:
        st.markdown("**Étapes de la conversation**")
        for sgm in report.stages:
            rng = f"#{sgm['start'] + 1}–#{sgm['end'] + 1}"
            ts = f" ({sgm['start_ts']}–{sgm['end_ts']})" if sgm.get("start_ts") else ""
            st.markdown(f"- **{sgm['stage']}** : répliques {rng}{ts}")
        audio = report.stats.get("audio") or {}
        if audio.get("duration_s"):
            st.markdown(f"**Audio** : {audio['duration_s']} s · {audio.get('words_per_minute')} mots/min · "
                        f"{len(audio.get('silences') or [])} silence(s) ≥ 2 s · interruptions : "
                        f"{'non mesurables (pas de diarisation)' if audio.get('interruptions') is None else len(audio['interruptions'])}")
        if report.stats.get("repetitions"):
            st.markdown("**Répétitions du commercial** : " + ", ".join(f"« {g} » ×{c}" for g, c in report.stats["repetitions"]))

    with st.expander("Détail de la notation par critère (justifications)", expanded=False):
        for c in report.criteria:
            st.markdown(f"#### {c.label} — {('%g' % c.score) + '/' + str(c.max_points) if c.evaluated else 'non évaluable'}")
            if c.positives:
                st.markdown("**Points positifs** : " + " · ".join(c.positives))
            if c.errors:
                st.markdown("**Erreurs / manques** :\n" + "\n".join(f"- {e}" for e in c.errors))
            for e in c.evidence[:3]:
                quote(e.speaker, e.quote, e.timestamp)
            if c.consequences:
                st.markdown(f"**Conséquence possible** : {c.consequences}")
            if c.correction:
                st.markdown(f"**Correction recommandée** : {c.correction}")

    st.subheader(f"B. Les erreurs du commercial ({len(report.findings)})")
    if not report.findings:
        st.success("Aucune erreur détectée par les règles. Vérifiez tout de même les occasions manquées ci-dessous.")
    groups: dict[int, list] = {}
    for f in report.findings:
        groups.setdefault(f.evidence.utterance_index, []).append(f)
    for idx, fs in groups.items():
        ev = fs[0].evidence
        sev = max(f.severity for f in fs)
        icon = {3: "🟥", 2: "🟧", 1: "⬜"}[sev]
        with st.expander(f"{icon} Réplique #{idx + 1}{' · ' + ev.timestamp if ev.timestamp else ''} — " + " / ".join(f.title for f in fs), expanded=sev == 3):
            st.markdown("**1. Ce que le commercial a dit**")
            quote("Commercial", ev.quote, ev.timestamp)
            for f in fs:
                st.markdown(f"##### {f.title}  <span class='asc-badge'>{CRITERIA_LABELS.get(f.criterion, f.criterion)}</span> <span class='asc-badge'>{f.origin}</span>", unsafe_allow_html=True)
                st.markdown(f"**2. Pourquoi c'est une erreur** — {f.why_wrong}")
                if f.consequence:
                    st.markdown(f"*Conséquence commerciale possible : {f.consequence}*")
                st.markdown(f"**3. Ce qu'il aurait dû comprendre** — {f.should_understand}")
                st.markdown(f"**4. Ce qu'il aurait dû faire** — {f.should_say}")
                st.markdown("**5. Meilleure formulation (recommandation du coach)**")
                better(f.better_phrasing)

    st.subheader(f"C. Les occasions manquées ({len(report.missed_opportunities)})")
    for m in report.missed_opportunities:
        with st.expander(f"🎯 {m.title}"):
            if m.evidence:
                quote(m.evidence.speaker, m.evidence.quote, m.evidence.timestamp)
            st.markdown(m.description)
            st.markdown("**Question à poser :**")
            better(m.suggested_question)
            if m.origin != "règles":
                st.caption(f"Origine : {m.origin}")
    if report.retention_checklist:
        with st.expander("Checklist rétention de la situation (playbook déménagement)"):
            for row in report.retention_checklist:
                mark = "✅" if row["covered"] else ("ℹ️" if row.get("known_from_client") else "❌")
                extra = " (information donnée spontanément par le client)" if (not row["covered"] and row.get("known_from_client")) else ""
                st.markdown(f"{mark} *{row['situation']}* — {row['item']}{extra}")
    st.markdown("**Documentation entreprise consultée**")
    if report.company_sources:
        for s in report.company_sources:
            st.markdown(f"- 📄 **{s.title}** — {s.source} {('(' + s.url + ')') if s.url else ''}")
            st.caption(s.excerpt[:300] + "…")
    else:
        st.caption("Aucun document entreprise pertinent : aucune offre, aucun tarif, aucune condition n'est affirmé. Importez vos procédures dans « Base de connaissances ».")

    st.subheader("D. La conversation idéale")
    st.caption("Passages réels de l'appel, commentés, avec une meilleure réponse (recommandation du coach).")
    for x in report.ideal_conversation:
        parts = ['<div class="asc-dialog asc-card" style="margin-bottom:10px">']
        if x.client_line:
            parts.append(f'<div class="role client">CLIENT</div><div>« {html.escape(x.client_line.quote)} »</div><br>')
        parts.append(f'<div class="role agent">COMMERCIAL</div><div>« {html.escape(x.agent_line.quote)} »</div><br>')
        parts.append(f'<div class="role coach">COACH</div><div>{html.escape(x.coach_comment)}</div><br>')
        parts.append(f'<div class="role best">MEILLEURE RÉPONSE</div><div>« {html.escape(x.better_response)} »</div></div>')
        st.markdown("".join(parts), unsafe_allow_html=True)

    st.subheader("E. Plan d'amélioration — 3 actions pour le prochain appel")
    for i, a in enumerate(report.improvement_plan, 1):
        st.markdown(f"**{i}.** {a}")

    if transcript is not None:
        with st.expander("Transcription analysée"):
            for u in transcript.utterances:
                ts = f"[{u.timestamp}] " if u.start is not None else ""
                st.markdown(f"`#{u.index + 1}` {ts}**{u.speaker}** : {html.escape(u.text)}")


def report_markdown(report: AnalysisReport, title: str = "") -> str:
    """Export texte du rapport (téléchargeable)."""
    L = [f"# Rapport de coaching — {title}", "", f"Note : {report.total_score:g}/100 · Niveau : {report.level} · Potentiel de rétention : {report.retention_potential}",
         f"Situations : {', '.join(report.situations)}", f"Moteur : {report.engine}", "", "## Notation"]
    for c in report.criteria:
        L.append(f"- {c.label} : {('%g' % c.score) + '/' + str(c.max_points) if c.evaluated else 'non évaluable'}")
    L += ["", "## Erreurs"]
    for f in report.findings:
        L += [f"### {f.title} ({f.evidence.label()})", f"- Pourquoi : {f.why_wrong}", f"- À comprendre : {f.should_understand}",
              f"- À faire : {f.should_say}", f"- Meilleure formulation : « {f.better_phrasing} »", ""]
    L += ["## Occasions manquées"] + [f"- {m.title} → « {m.suggested_question} »" for m in report.missed_opportunities]
    L += ["", "## Conversation idéale"]
    for x in report.ideal_conversation:
        if x.client_line:
            L.append(f"CLIENT : {x.client_line.quote}")
        L += [f"COMMERCIAL : {x.agent_line.quote}", f"COACH : {x.coach_comment}", f"MEILLEURE RÉPONSE : {x.better_response}", ""]
    L += ["## Plan d'amélioration"] + [f"{i}. {a}" for i, a in enumerate(report.improvement_plan, 1)]
    L += ["", "## Avertissements"] + [f"- {w}" for w in report.warnings]
    return "\n".join(L)
