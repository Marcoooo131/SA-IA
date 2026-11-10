"""AI SALES COACH — point d'entrée Streamlit.

Lancement : ``streamlit run app/main.py`` (depuis le dossier ai-sales-coach).
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import streamlit as st  # noqa: E402

from app import state, ui  # noqa: E402
from app.views import analyze, coaching, dashboard, history, knowledge, performance, settings, training  # noqa: E402
from sales_coach.config import get_settings  # noqa: E402
from sales_coach.security import auth  # noqa: E402
from sales_coach.storage import repo  # noqa: E402

st.set_page_config(page_title="AI Sales Coach", page_icon="🎯", layout="wide")
ui.inject_css()
cfg = get_settings()

# Purge automatique des données expirées (une fois par session)
if "purged_once" not in st.session_state:
    n = repo.purge_expired()
    st.session_state["purged_once"] = True
    if n:
        auth.audit("système", "purge automatique", detail=f"{n} appel(s) expiré(s) purgé(s)")


def login_screen() -> None:
    st.title("AI Sales Coach")
    st.caption("Coach IA de rétention commerciale — déménagement")
    if not auth.has_users():
        st.subheader("Premier lancement : créer le compte administrateur")
        with st.form("first_admin"):
            u = st.text_input("Identifiant", value="admin")
            p1 = st.text_input("Mot de passe (10 caractères minimum)", type="password")
            p2 = st.text_input("Confirmer le mot de passe", type="password")
            if st.form_submit_button("Créer le compte", type="primary"):
                if p1 != p2:
                    st.error("Les mots de passe ne correspondent pas.")
                else:
                    try:
                        auth.create_user(u, p1, "admin")
                        auth.audit(u, "création du compte administrateur")
                        st.success("Compte créé. Connectez-vous.")
                        st.rerun()
                    except ValueError as exc:
                        st.error(str(exc))
        return
    with st.form("login"):
        u = st.text_input("Identifiant")
        p = st.text_input("Mot de passe", type="password")
        if st.form_submit_button("Se connecter", type="primary"):
            user = auth.authenticate(u, p)
            if user:
                st.session_state["user"] = {"username": user.username, "role": user.role, "agent_id": user.agent_id}
                st.rerun()
            else:
                st.error("Identifiants incorrects.")


if not cfg.require_login and "user" not in st.session_state:
    st.session_state["user"] = {"username": "local", "role": "admin", "agent_id": None}

if "user" not in st.session_state:
    login_screen()
    st.stop()

u = state.user()
with st.sidebar:
    st.markdown("## 🎯 AI SALES COACH")
    st.caption("Rétention commerciale · Déménagement")
    st.markdown(f"**{u['username']}** · {auth.ROLE_LABELS.get(u['role'], u['role'])}")
    llm_label = cfg.llm_provider if cfg.llm_provider not in {"", "none"} else "règles (hors ligne)"
    st.caption(f"Moteur IA : {llm_label}{' · externe ' + ('autorisé' if cfg.allow_external_api else 'BLOQUÉ') if cfg.external_llm else ''}")
    if cfg.require_login and st.button("Se déconnecter"):
        auth.audit(u["username"], "déconnexion")
        st.session_state.clear()
        st.rerun()

pages = [
    st.Page(dashboard.render, title="Dashboard", icon="📊", url_path="dashboard", default=True),
    st.Page(analyze.render, title="Analyse d'un appel", icon="🎧", url_path="analyse"),
    st.Page(history.render, title="Historique des analyses", icon="🗂️", url_path="historique"),
    st.Page(coaching.render, title="Coaching individuel", icon="🧭", url_path="coaching"),
    st.Page(training.render, title="Entraînement commercial", icon="🥊", url_path="entrainement"),
]
if state.allowed("view_all"):
    pages.append(st.Page(performance.render, title="Performances des agents", icon="📈", url_path="performances"))
pages.append(st.Page(knowledge.render, title="Base de connaissances", icon="📚", url_path="connaissances"))
pages.append(st.Page(settings.render, title="Paramètres", icon="⚙️", url_path="parametres"))

st.navigation(pages).run()
