"""Page « Analyse d'un appel » : import, transcription, attribution des locuteurs, analyse, sauvegarde."""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, time

import streamlit as st

from app import state, ui
from sales_coach.config import PROJECT_ROOT, get_settings
from sales_coach.core.models import AGENT, CLIENT
from sales_coach.security.auth import audit
from sales_coach.services import run_analysis
from sales_coach.storage import repo
from sales_coach.transcription import apply_speaker_mapping, load_transcript_file, parse_text, unknown_labels
from sales_coach.transcription.audio import SUPPORTED_AUDIO, TranscriptionUnavailable, available_backends, transcribe_audio

SAMPLES = PROJECT_ROOT / "data" / "samples"


def _choose_agent():
    u = state.user()
    agents = state.visible_agents()
    if not state.allowed("view_all"):
        mine = [a for a in agents if a.id == u.get("agent_id")]
        if not mine:
            st.error("Votre compte n'est rattaché à aucun commercial : demandez à un administrateur de le rattacher.")
            st.stop()
        st.markdown(f"**Commercial :** {mine[0].name}")
        return mine[0].id, mine[0].name
    names = [a.name for a in agents]
    choice = st.selectbox("Commercial", names + ["➕ Nouveau commercial…"], key="an_agent")
    if choice == "➕ Nouveau commercial…":
        new = st.text_input("Nom ou identifiant du commercial (ex. « Agent 04 »)", key="an_new_agent")
        return None, new.strip()
    return next(a.id for a in agents if a.name == choice), choice


def render() -> None:
    state.require("analyze_own")
    cfg = get_settings()
    st.title("Analyse d'un appel")
    st.caption("Importez un enregistrement ou une transcription. Chaque critique sera justifiée par un extrait réel de la conversation.")

    c1, c2, c3 = st.columns([2, 2, 1])
    with c1:
        agent_id, agent_name = _choose_agent()
    with c2:
        title = st.text_input("Titre de l'appel", value=st.session_state.get("an_title_default", ""), placeholder="ex. Résiliation déménagement — Bordeaux")
    with c3:
        call_day = st.date_input("Date de l'appel", value=datetime.now().date(), format="DD/MM/YYYY")

    tab_file, tab_audio, tab_paste, tab_demo = st.tabs(["📄 Transcription (TXT / DOCX)", "🎙️ Audio (MP3 / WAV / M4A)", "✍️ Coller le texte", "🧪 Appels fictifs"])
    with tab_file:
        f = st.file_uploader("Fichier de transcription", type=["txt", "docx", "srt", "vtt", "md"], key="an_tfile")
        st.caption("Format : une réplique par ligne, « COMMERCIAL : … » / « CLIENT : … », horodatage optionnel « [00:01:12] ».")
        if f is not None and st.button("Charger la transcription", key="load_t"):
            try:
                _set_transcript(load_transcript_file(f.name, f.getvalue()), f.name, None)
            except Exception as exc:
                st.error(f"Lecture impossible : {exc}")
    with tab_audio:
        backends = available_backends()
        if not backends:
            st.warning("Aucun moteur Whisper local n'est installé : la transcription audio est indisponible. "
                       "Installez-le avec `pip install -r requirements-audio.txt` (voir README), ou importez une transcription.")
        else:
            st.caption(f"Transcription 100 % locale : {', '.join(backends)} · modèle « {cfg.whisper_model} » sur {cfg.whisper_device}. Aucun audio n'est envoyé à l'extérieur.")
        a = st.file_uploader("Enregistrement audio", type=[e.strip(".") for e in SUPPORTED_AUDIO], key="an_afile", disabled=not backends)
        if a is not None and st.button("Transcrire", key="do_transcribe", type="primary"):
            with st.spinner("Transcription en cours (peut prendre plusieurs minutes sur CPU)…"):
                try:
                    t = transcribe_audio(a.getvalue(), a.name, cfg.transcription_backend, cfg.whisper_model, cfg.whisper_device)
                    _set_transcript(t, a.name, (a.getvalue(), "." + a.name.rsplit(".", 1)[-1].lower()))
                except (TranscriptionUnavailable, ValueError) as exc:
                    st.error(str(exc))
    with tab_paste:
        txt = st.text_area("Transcription", height=220, placeholder="COMMERCIAL : Bonjour…\nCLIENT : Bonjour, je déménage…")
        if st.button("Utiliser ce texte", key="use_paste") and txt.strip():
            _set_transcript(parse_text(txt), "texte collé", None)
    with tab_demo:
        files = sorted(SAMPLES.glob("appel_*.txt"))
        st.caption("Appels entièrement fictifs, fournis pour tester l'outil sans données réelles.")
        pick = st.selectbox("Appel fictif", [p.name for p in files])
        if st.button("Charger cet appel fictif", key="load_demo"):
            p = SAMPLES / pick
            _set_transcript(load_transcript_file(p.name, p.read_bytes()), p.name, None, demo=True)

    t = st.session_state.get("an_transcript")
    if t is None:
        return

    st.divider()
    st.subheader("Transcription chargée")
    st.caption(f"Source : {st.session_state.get('an_source_name')} · {len(t.utterances)} répliques · attribution des locuteurs : {t.speaker_attribution}")
    for w in t.warnings:
        st.warning(w)
    labels = unknown_labels(t)
    if labels:
        st.markdown("**Attribuez chaque locuteur avant l'analyse :**")
        cols = st.columns(min(4, len(labels)))
        mapping = {}
        for i, lab in enumerate(labels):
            sample = next((u.text for l2, u in zip(t.audio_metrics.get("raw_labels", []), t.utterances) if l2 == lab), "")
            with cols[i % len(cols)]:
                mapping[lab] = st.selectbox(f"« {lab} »", [AGENT, CLIENT], index=0 if i == 0 else 1, key=f"map_{lab}", help=f"Exemple : {sample[:120]}")
        if st.button("Appliquer l'attribution", type="primary"):
            st.session_state["an_transcript"] = apply_speaker_mapping(t, mapping)
            st.rerun()
        return
    with st.expander("Aperçu de la transcription", expanded=False):
        for u in t.utterances:
            ts = f"[{u.timestamp}] " if u.start is not None else ""
            st.markdown(f"`#{u.index + 1}` {ts}**{u.speaker}** : {u.text}")

    st.subheader("Options d'analyse")
    o1, o2, o3 = st.columns(3)
    with o1:
        anonymize = st.checkbox("Anonymiser (noms, téléphones, e-mails, adresses, IBAN, n° de contrat)", value=cfg.anonymize_by_default)
    llm_ready = cfg.llm_provider not in {"", "none"}
    with o2:
        use_llm = st.checkbox(f"Enrichir avec le modèle IA ({cfg.llm_provider})" if llm_ready else "Enrichir avec un modèle IA (non configuré)",
                              value=False, disabled=not llm_ready)
    authorize_external = False
    with o3:
        if llm_ready and cfg.external_llm:
            if not cfg.allow_external_api:
                st.error("Fournisseur externe bloqué (ASC_ALLOW_EXTERNAL_API=false).")
            else:
                authorize_external = st.checkbox("J'autorise l'envoi de CET appel (anonymisé) au service IA externe", value=False)
        elif llm_ready:
            st.caption("Modèle local : aucune donnée ne quitte la machine.")
    demo = st.session_state.get("an_demo", False)
    consent = st.checkbox("Appel fictif (données de démonstration)" if demo else "Je confirme que le client et le commercial ont été informés de l'enregistrement et de son usage pour la formation (base légale validée).",
                          value=demo)
    keep_audio = False
    if st.session_state.get("an_audio"):
        keep_audio = st.checkbox(f"Conserver l'audio (chiffré, supprimé après {cfg.retention_days} jours)", value=False)

    if st.button("🔎 Analyser l'appel", type="primary"):
        with st.spinner("Analyse en cours…"):
            import copy

            res = run_analysis(copy.deepcopy(t), anonymize=anonymize, use_llm=use_llm, authorize_external=authorize_external)
        st.session_state["an_result"] = res
        audit(state.user()["username"], "analyse d'appel", target=title or st.session_state.get("an_source_name", ""),
              detail=f"moteur={res.report.engine}; anonymisé={anonymize}")

    res = st.session_state.get("an_result")
    if res is None:
        return
    st.divider()
    if res.anonymized and res.anonymization_counts:
        st.caption("Anonymisation : " + ", ".join(f"{k.lower()} ×{v}" for k, v in res.anonymization_counts.items()))
    ui.render_report(res.report, res.transcript, key="analysis")

    st.divider()
    s1, s2, s3 = st.columns(3)
    with s1:
        if st.button("💾 Enregistrer l'analyse", type="primary"):
            if not consent:
                st.error("Confirmez le consentement / la base légale avant d'enregistrer.")
            elif not agent_name:
                st.error("Indiquez le commercial.")
            else:
                aid = agent_id or repo.get_or_create_agent(agent_name)
                an_id = repo.save_analysis(
                    aid, title or st.session_state.get("an_source_name", "Appel"), res.transcript, res.report, consent=consent,
                    anonymized=res.anonymized, created_by=state.user()["username"], call_date=datetime.combine(call_day, time(12)),
                    audio=st.session_state.get("an_audio"), keep_audio=keep_audio,
                )
                audit(state.user()["username"], "enregistrement analyse", target=f"analyse #{an_id}", detail=f"agent={agent_name}")
                st.success(f"Analyse #{an_id} enregistrée pour {agent_name}.")
                for k in ("an_transcript", "an_result", "an_audio"):
                    st.session_state.pop(k, None)
    with s2:
        st.download_button("⬇️ Rapport (Markdown)", ui.report_markdown(res.report, title), file_name="rapport_coaching.md")
    with s3:
        st.download_button("⬇️ Rapport (JSON)", json.dumps(res.report.to_dict(), ensure_ascii=False, indent=2), file_name="rapport_coaching.json")


def _set_transcript(t, source_name: str, audio, demo: bool = False) -> None:
    st.session_state["an_transcript"] = t
    st.session_state["an_source_name"] = source_name
    st.session_state["an_audio"] = audio
    st.session_state["an_demo"] = demo
    st.session_state["an_title_default"] = source_name.rsplit(".", 1)[0].replace("_", " ")
    st.session_state.pop("an_result", None)
    st.session_state["an_hash"] = hashlib.sha256(t.to_text().encode()).hexdigest()
