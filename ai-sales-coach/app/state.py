"""Session utilisateur et contrôle d'accès dans l'interface."""
from __future__ import annotations

import streamlit as st

from sales_coach.security.auth import can
from sales_coach.storage import repo


def user() -> dict:
    return st.session_state.get("user") or {}


def allowed(permission: str) -> bool:
    u = user()
    return bool(u) and can(u["role"], permission)


def require(permission: str) -> None:
    if not allowed(permission):
        st.error("Accès refusé : votre rôle ne permet pas d'afficher cette page.")
        st.stop()


def visible_agents() -> list:
    """Agents que l'utilisateur a le droit de voir (un commercial ne voit que lui-même)."""
    u = user()
    agents = repo.list_agents()
    if allowed("view_all"):
        return agents
    return [a for a in agents if a.id == u.get("agent_id")]


def agent_selector(label: str = "Commercial", key: str = "agent_sel", allow_all: bool = False):
    agents = visible_agents()
    if not agents:
        st.info("Aucun commercial enregistré pour l'instant : analysez un premier appel ou chargez la démonstration (Paramètres).")
        return None
    options = (["Tous"] if allow_all and len(agents) > 1 else []) + [a.name for a in agents]
    choice = st.selectbox(label, options, key=key)
    if choice == "Tous":
        return "all"
    return next(a for a in agents if a.name == choice)
