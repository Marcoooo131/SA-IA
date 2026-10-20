"""Entry point of the web « Améliorateur Phone Call » (Python in the browser, with Pyodide).

Only the pure-Python part of phonecall_desktop is shipped (parse, enhancer, rules, formatter); the
modules it imports but does not use here (numpy, httpx, settings) are replaced by small stand-ins.
The YAML files are shipped as JSON (valid YAML), read with ``json``.
"""

from __future__ import annotations

import json
import sys
import types


def _stand_ins() -> None:
    def module(name: str, **attrs) -> None:
        if name not in sys.modules:
            m = types.ModuleType(name)
            m.__dict__.update(attrs)
            sys.modules[name] = m

    module("numpy", ndarray=object)
    module("httpx")
    module("yaml", safe_load=lambda text: json.loads(text) if str(text).strip() else None)
    module("phonecall_desktop.config", Settings=object, install_dir=lambda: None)


_stand_ins()

from phonecall_desktop.notes.formatter import format_transcript_text, load_facts
from phonecall_desktop.notes.template import load_template
from phonecall_desktop.transcript.enhancer import TextEnhancer

TEMPLATE = load_template()
FACTS = load_facts()


def format_json(text: str, variant: str = "") -> str:
    result = format_transcript_text(text, TEMPLATE, FACTS, variant=variant or None, enhancer=TextEnhancer(),
                                    with_duration=False)
    if result is None:
        result = {"error": "Aucune prise de parole reconnue dans le texte collé."}
    return json.dumps(result, ensure_ascii=False)
