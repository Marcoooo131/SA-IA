"""Dashboard access rules and configuration loading."""

from __future__ import annotations

import time

import pytest
from fastapi.testclient import TestClient

from movers_dispatch import config as config_mod
from movers_dispatch.engine import Agent
from movers_dispatch.fake import demo_config, demo_crm
from movers_dispatch.journal import Journal
from movers_dispatch.web.app import create_app

H = {"X-Requested-With": "movers-dispatch"}


def client(**cfg):
    crm = demo_crm()
    agent = Agent(demo_config(**cfg), crm, Journal(":memory:"))
    c = TestClient(create_app(agent, "secret-token"))
    return c, agent, crm


def wait(agent):
    for _ in range(200):
        if not agent.state.running and not agent.busy.locked():
            return
        time.sleep(0.01)


def test_requires_the_launch_link():
    c, _, _ = client()
    assert c.get("/api/state").status_code == 401
    assert c.get("/?token=wrong", follow_redirects=False).status_code == 403
    assert c.get("/?token=secret-token", follow_redirects=False).status_code == 303
    assert c.get("/api/state").status_code == 200
    assert c.get("/").status_code == 200 and c.get("/static/app.js").status_code == 200


def test_post_needs_custom_header():
    c, _, _ = client()
    c.get("/?token=secret-token")
    assert c.post("/api/run", json={"mode": "simulation"}).status_code == 403


def test_simulation_run_from_dashboard_and_counters():
    c, agent, crm = client()
    c.get("/?token=secret-token")
    assert c.post("/api/run", json={"mode": "simulation"}, headers=H).status_code == 200
    time.sleep(0.05)
    wait(agent)
    s = c.get("/api/state").json()
    assert s["counters"]["detectes"] == len(crm.items) and crm.writes == 0
    assert {"queueitem_id", "subject", "case_number", "owner_name", "worked_by_name", "status", "reason"} <= s["items"][0].keys()


def test_automatic_needs_typed_confirmation_and_permission():
    c, _, crm = client()
    c.get("/?token=secret-token")
    assert c.post("/api/run", json={"mode": "automatique", "confirmation": "AUTOMATIQUE"}, headers=H).status_code == 409
    c, agent, crm = client(automatic_allowed=True)
    c.get("/?token=secret-token")
    assert c.post("/api/run", json={"mode": "automatique", "confirmation": "oui"}, headers=H).status_code == 409
    assert c.post("/api/run", json={"mode": "automatique", "confirmation": "AUTOMATIQUE"}, headers=H).status_code == 200
    time.sleep(0.05)
    wait(agent)
    assert crm.writes >= 1


def test_supervised_approval_endpoint():
    c, agent, crm = client()
    c.get("/?token=secret-token")
    c.post("/api/run", json={"mode": "supervise"}, headers=H)
    time.sleep(0.05)
    wait(agent)
    pending = [i for i in c.get("/api/state").json()["items"] if i["status"] == "a_valider"]
    assert pending and crm.writes == 0
    r = c.post(f"/api/items/{pending[0]['queueitem_id']}/approve", headers=H)
    assert r.status_code == 200 and r.json()["status"] == "affecte" and crm.writes == 1


def test_dropdown_assignment_and_ignored_items_hidden():
    c, agent, crm = client()
    c.get("/?token=secret-token")
    c.post("/api/run", json={"mode": "simulation"}, headers=H)
    time.sleep(0.05)
    wait(agent)
    s = c.get("/api/state").json()
    assert all(i["status"] != "ignore" for i in s["items"]) and s["counters"]["ignores"] == 1
    assert {"key": "chloe", "first_name": "Chloé"} in s["config"]["collaborators"]
    review = [i for i in s["items"] if "Owner non reconnu" in (i["reason"] or "")]
    r = c.post(f"/api/items/{review[0]['queueitem_id']}/assign", json={"collaborator": "chloe"}, headers=H)
    assert r.status_code == 200 and r.json()["status"] == "affecte" and r.json()["worked_by_name"] == "Chloé"
    proposed = [i for i in s["items"] if i["status"] == "propose"][0]
    assert c.post(f"/api/items/{proposed['queueitem_id']}/assign", json={"collaborator": "chloe"}, headers=H).status_code == 409


def test_example_configuration_loads_and_blocks_writes(tmp_path):
    from pathlib import Path

    cfg = config_mod.load(Path(__file__).parent.parent / "config" / "dispatch.example.toml")
    assert cfg.default_mode.value == "simulation" and not cfg.automatic_allowed
    assert len(cfg.problems()) == 5        # four user ids + the CRM address
    assert cfg.source.view_names == ("Queue Item - Movers - Emails", "Queue Item - Movers tasks")
    assert not cfg.cases.active_only


def test_automatic_cannot_be_the_default(tmp_path):
    p = tmp_path / "c.toml"
    p.write_text('[agent]\ndefault_mode = "automatique"\n[[collaborators]]\nfirst_name = "Kader"\n')
    with pytest.raises(config_mod.ConfigError):
        config_mod.load(p)
