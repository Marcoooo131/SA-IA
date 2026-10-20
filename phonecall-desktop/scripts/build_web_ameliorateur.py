"""Builds the static web « Améliorateur Phone Call » (published on GitHub Pages, under /ameliorateur/).

    python scripts/build_web_ameliorateur.py OUT_DIR [--pyodide PYODIDE_DIR]

The page runs the formatter of the desktop app in the browser (Pyodide, self-hosted: no third-party
site). Only the pure-Python modules it needs are copied; YAML files are converted to JSON.
"""

from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
PACKAGE = ROOT / "phonecall_desktop"
WEB = ROOT / "web_ameliorateur"
MODULES = [
    "__init__.py", "errors.py", "audio/__init__.py", "audio/types.py", "stt/__init__.py", "stt/base.py",
    "transcript/__init__.py", "transcript/assembler.py", "transcript/enhancer.py", "transcript/parse.py",
    "notes/__init__.py", "notes/client.py", "notes/business.py", "notes/local_summary.py", "notes/formatter.py",
    "notes/template/__init__.py", "notes/template/rules.py",
]
DATA = ["notes/template/phone_call_template.yaml", "notes/template/phone_call_facts.yaml"]
PYODIDE_FILES = ["pyodide.js", "pyodide.asm.js", "pyodide.asm.wasm", "python_stdlib.zip", "pyodide-lock.json"]


def build(out: Path, pyodide: Path | None = None) -> list[str]:
    out.mkdir(parents=True, exist_ok=True)
    for name in ("index.html", "app.js", "app.css"):
        shutil.copy(WEB / name, out / name)
    py = out / "py"
    files = ["ameliorateur.py"]
    (py / "phonecall_desktop").mkdir(parents=True, exist_ok=True)
    shutil.copy(WEB / "ameliorateur.py", py / "ameliorateur.py")
    for rel in MODULES:
        dest = py / "phonecall_desktop" / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(PACKAGE / rel, dest)
        files.append(f"phonecall_desktop/{rel}")
    for rel in DATA:  # JSON is valid YAML: the page reads it without a YAML library
        data = yaml.safe_load((PACKAGE / rel).read_text(encoding="utf-8"))
        (py / "phonecall_desktop" / rel).write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        files.append(f"phonecall_desktop/{rel}")
    (py / "manifest.json").write_text(json.dumps(files), encoding="utf-8")
    if pyodide:
        (out / "pyodide").mkdir(exist_ok=True)
        for name in PYODIDE_FILES:
            shutil.copy(pyodide / name, out / "pyodide" / name)
    return files


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("out", type=Path)
    parser.add_argument("--pyodide", type=Path, help="folder of the Pyodide core release (self-hosted)")
    args = parser.parse_args()
    print(f"{len(build(args.out, args.pyodide))} files -> {args.out}")
