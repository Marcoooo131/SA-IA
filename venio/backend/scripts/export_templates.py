"""Exporte les modèles métier (prestations, parcours, horaires) pour la version de démonstration web.

Usage : python scripts/export_templates.py ../web/src/lib/demo/templates.json
Un test vérifie que le fichier exporté est à jour.
"""
import json
import sys

from venio.flows.templates import DEFAULT_HOURS, TEMPLATES, template_flow


def export() -> dict:
    return {
        "default_hours": [list(h) for h in DEFAULT_HOURS],
        "templates": {
            code: {
                "code": code, "label": t["label"], "services": t["services"],
                "flow": template_flow(code).model_dump(by_alias=True, exclude_none=True),
            }
            for code, t in TEMPLATES.items()
        },
    }


def dumps() -> str:
    return json.dumps(export(), ensure_ascii=False, indent=1, sort_keys=True) + "\n"


if __name__ == "__main__":
    with open(sys.argv[1], "w", encoding="utf-8") as f:
        f.write(dumps())
