from pathlib import Path

from fastapi.testclient import TestClient

from assistant_movers import config as cfgmod
from assistant_movers.fake import FakeCrm
from assistant_movers.parcours import Assistant
from assistant_movers.web.app import create_app

DEMO = Path(__file__).parents[1] / "assistant_movers" / "demo.toml"
H = {"X-Requested-With": "assistant-movers"}


def client():
    c = TestClient(create_app(Assistant(cfgmod.load(DEMO), FakeCrm(), demo=True), "secret"))
    c.get("/?token=secret", follow_redirects=False)
    return c


def test_acces_refuse_sans_lien():
    c = TestClient(create_app(Assistant(cfgmod.load(DEMO), FakeCrm(), demo=True), "secret"))
    assert c.get("/api/etat").status_code == 401


def test_post_sans_entete_refuse():
    assert client().post("/api/compte", json={"numero": "10000001"}).status_code == 403


def test_recherche_compte():
    j = client().post("/api/compte", json={"numero": "10000001"}, headers=H).json()
    assert j["etape"] == "adresse" and j["dossier"]["compte"]["nom"].startswith("DEMO")
