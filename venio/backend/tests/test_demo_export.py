from pathlib import Path

from scripts.export_templates import dumps

EXPORTED = Path(__file__).resolve().parents[2] / "web" / "src" / "lib" / "demo" / "templates.json"


def test_demo_templates_are_up_to_date():
    assert EXPORTED.read_text(encoding="utf-8") == dumps(), (
        "Modèles de la démo obsolètes : python scripts/export_templates.py ../web/src/lib/demo/templates.json")
