"""Exécute chaque page Streamlit (sans navigateur) et vérifie l'absence d'exception."""
import pytest
from streamlit.testing.v1 import AppTest

from conftest import ROOT

PAGES = ["dashboard", "analyze", "history", "coaching", "training", "performance", "knowledge", "settings"]


@pytest.fixture
def demo_data(monkeypatch):
    monkeypatch.setenv("ASC_REQUIRE_LOGIN", "false")
    from sales_coach.config import get_settings
    from sales_coach.demo import load_demo

    get_settings(reload=True)
    load_demo()


SCRIPT = """
import sys
sys.path.insert(0, {root!r})
import streamlit as st
from app import ui
from app.views import {page}
st.session_state.setdefault("user", {{"username": "test", "role": "admin", "agent_id": None}})
ui.inject_css()
{page}.render()
"""


@pytest.mark.parametrize("page", PAGES)
def test_page_renders(page, demo_data):
    at = AppTest.from_string(SCRIPT.format(root=str(ROOT), page=page), default_timeout=60)
    at.run()
    assert not at.exception, at.exception


def test_login_screen_on_first_launch(monkeypatch):
    from sales_coach.config import get_settings

    monkeypatch.setenv("ASC_REQUIRE_LOGIN", "true")
    get_settings(reload=True)
    at = AppTest.from_file(str(ROOT / "app" / "main.py"), default_timeout=60)
    at.run()
    assert not at.exception
    assert any("administrateur" in s.value for s in at.subheader)
