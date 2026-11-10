from conftest import SAMPLES
from fastapi.testclient import TestClient

from sales_coach.api.main import app
from sales_coach.config import get_settings


def test_api_requires_token(monkeypatch):
    c = TestClient(app)
    assert c.get("/health").json()["status"] == "ok"
    assert c.post("/analyze", json={"transcript": "x"}).status_code == 503
    monkeypatch.setenv("ASC_API_TOKEN", "secret-token")
    get_settings(reload=True)
    assert c.post("/analyze", json={"transcript": "x"}, headers={"X-API-Token": "faux"}).status_code == 401


def test_api_analyze_and_profile(monkeypatch):
    monkeypatch.setenv("ASC_API_TOKEN", "secret-token")
    get_settings(reload=True)
    c = TestClient(app)
    h = {"X-API-Token": "secret-token"}
    text = (SAMPLES / "appel_02_autre_region_excellent.txt").read_text(encoding="utf-8")
    r = c.post("/analyze", json={"transcript": text, "agent": "Agent API", "save": True}, headers=h)
    assert r.status_code == 422  # consentement manquant
    r = c.post("/analyze", json={"transcript": text, "agent": "Agent API", "save": True, "consent": True}, headers=h)
    assert r.status_code == 200 and r.json()["report"]["total_score"] > 80 and r.json()["analysis_id"]
    agents = c.get("/agents", headers=h).json()
    prof = c.get(f"/agents/{agents[0]['id']}/profile", headers=h).json()
    assert prof["n_calls"] == 1
    assert c.get("/kb/search", params={"q": "négociation raisonnée"}, headers=h).json()
    t = c.post("/training/turn", json={"persona": "indecis"}, headers=h).json()
    t2 = c.post("/training/turn", json={"state": t["state"], "message": "Qu'est-ce qui vous amène à déménager ?"}, headers=h).json()
    assert t2["client"] and not t2["finished"]
