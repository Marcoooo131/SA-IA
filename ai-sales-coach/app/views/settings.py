"""Page « Paramètres » : configuration active, modes IA, utilisateurs, confidentialité, journal."""
from __future__ import annotations

import pandas as pd
import streamlit as st

from app import state
from sales_coach.config import get_settings
from sales_coach.llm.factory import MODE_LIMITATIONS
from sales_coach.security import auth, crypto
from sales_coach.storage import repo
from sales_coach.transcription.audio import available_backends, diarization_available


def render() -> None:
    st.title("Paramètres")
    cfg = get_settings()
    st.caption("La configuration se fait dans le fichier .env (voir .env.example) puis redémarrage. Aucune clé n'est stockée dans le code.")

    st.subheader("Configuration active")
    rows = [
        ("Moteur IA", cfg.llm_provider or "none"), ("Modèle", cfg.llm_model or "(défaut)"), ("URL du modèle", cfg.llm_base_url or "(défaut)"),
        ("Clé API fournie", "oui" if cfg.llm_api_key else "non"), ("Données envoyées hors machine", "oui" if cfg.external_llm else "non"),
        ("API externes autorisées", "oui" if cfg.allow_external_api else "non (bloquées)"),
        ("Transcription", f"{cfg.transcription_backend} — installés : {', '.join(available_backends()) or 'aucun'}"),
        ("Diarisation (pyannote)", "disponible" if diarization_available() else "non disponible (attribution heuristique)"),
        ("Modèle Whisper", f"{cfg.whisper_model} ({cfg.whisper_device})"), ("Recherche documentaire", cfg.embedding_backend),
        ("Base de données", cfg.database_url.split("@")[-1]), ("Anonymisation par défaut", "oui" if cfg.anonymize_by_default else "non"),
        ("Conservation des appels", f"{cfg.retention_days} jours" if cfg.retention_days > 0 else "illimitée"),
        ("Clé de chiffrement", crypto.key_source() or "chargée à la première écriture"), ("Connexion obligatoire", "oui" if cfg.require_login else "non (poste local)"),
    ]
    st.dataframe(pd.DataFrame(rows, columns=["Paramètre", "Valeur"]), hide_index=True, use_container_width=True)

    st.subheader("Modes IA : limites matérielles et de qualité")
    for k, v in MODE_LIMITATIONS.items():
        st.markdown(f"**{k}** — {v}")
    st.markdown("**Transcription Whisper (locale)** — modèle *small* : ~2 Go de RAM, environ 1× à 3× la durée de l'appel sur un CPU récent ; "
                "*medium* : meilleure précision en français, ~5 Go, nettement plus lent sans GPU. La qualité dépend fortement de l'enregistrement (téléphonie 8 kHz).")

    if state.allowed("purge"):
        st.subheader("Confidentialité")
        c1, c2 = st.columns(2)
        with c1:
            if st.button("Purger maintenant les appels expirés"):
                n = repo.purge_expired()
                auth.audit(state.user()["username"], "purge manuelle", detail=f"{n} appel(s)")
                st.success(f"{n} appel(s) purgé(s).")
        with c2:
            if st.button("Charger la démonstration (appels fictifs, 3 agents)"):
                from sales_coach.demo import load_demo

                n = load_demo()
                auth.audit(state.user()["username"], "chargement démonstration", detail=f"{n} analyses")
                st.success(f"{n} analyses fictives créées.")

    if state.allowed("manage_users"):
        st.subheader("Utilisateurs et rôles")
        users = auth.list_users()
        agents = repo.list_agents()
        agent_names = {a.id: a.name for a in agents}
        st.dataframe(pd.DataFrame([{"Identifiant": u.username, "Rôle": auth.ROLE_LABELS[u.role], "Commercial rattaché": agent_names.get(u.agent_id, ""),
                                    "Actif": u.active} for u in users]), hide_index=True, use_container_width=True)
        with st.form("new_user"):
            c1, c2, c3 = st.columns(3)
            with c1:
                name = st.text_input("Identifiant")
                pwd = st.text_input("Mot de passe (10 caractères min.)", type="password")
            with c2:
                role = st.selectbox("Rôle", list(auth.ROLES), format_func=lambda r: auth.ROLE_LABELS[r])
            with c3:
                agent_name = st.text_input("Commercial rattaché (pour le rôle Commercial)")
            if st.form_submit_button("Créer l'utilisateur"):
                try:
                    aid = repo.get_or_create_agent(agent_name) if agent_name.strip() else None
                    auth.create_user(name, pwd, role, aid)
                    auth.audit(state.user()["username"], "création utilisateur", target=name, detail=role)
                    st.success("Utilisateur créé.")
                    st.rerun()
                except ValueError as exc:
                    st.error(str(exc))
        others = [u for u in users if u.username != state.user()["username"]]
        if others:
            c1, c2 = st.columns([2, 1])
            with c1:
                target = st.selectbox("Activer / désactiver", [u.username for u in others])
            with c2:
                st.write("")
                if st.button("Basculer"):
                    u = next(x for x in others if x.username == target)
                    auth.set_user_active(u.id, not u.active)
                    auth.audit(state.user()["username"], "activation utilisateur" if not u.active else "désactivation utilisateur", target=target)
                    st.rerun()

    if state.allowed("view_audit"):
        st.subheader("Journal des accès")
        logs = auth.read_audit(300)
        if logs:
            st.dataframe(pd.DataFrame([{"Date": l.ts.strftime("%d/%m/%Y %H:%M:%S"), "Utilisateur": l.username, "Action": l.action, "Cible": l.target,
                                        "Détail": l.detail} for l in logs]), hide_index=True, use_container_width=True)
