"""Web « Améliorateur Phone Call »: the formatter runs in the browser (Pyodide) and nothing leaves the page.

The browser test needs the Pyodide core release (PCD_PYODIDE_DIR, downloaded by the CI)."""

import functools
import json
import os
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest

from test_format import EXPECTED, TAKEOVER
from test_web import CHROMIUM, HAS_PLAYWRIGHT

ROOT = Path(__file__).resolve().parent.parent
PYODIDE = os.environ.get("PCD_PYODIDE_DIR")


def build(out: Path, pyodide: Path | None = None) -> list[str]:
    import importlib.util

    spec = importlib.util.spec_from_file_location("build_web", ROOT / "scripts" / "build_web_ameliorateur.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.build(out, pyodide)


def test_build_ships_only_what_the_page_needs(tmp_path):
    files = build(tmp_path)
    manifest = json.loads((tmp_path / "py" / "manifest.json").read_text())
    assert manifest == files and "phonecall_desktop/notes/formatter.py" in files
    assert not any(x in f for f in files for x in ("session", "web/", "capture", "secrets", "direct"))
    facts = json.loads((tmp_path / "py/phonecall_desktop/notes/template/phone_call_facts.yaml").read_text())
    assert facts["facts"][0]["id"] == "reprise_contrat"  # YAML shipped as JSON
    html = (tmp_path / "index.html").read_text()
    assert "connect-src 'self'" in html and "http" not in html.split("<body>")[1]  # no third-party resource


def test_entry_point_gives_the_same_phone_call():
    import sys

    sys.path.insert(0, str(ROOT / "web_ameliorateur"))
    import ameliorateur

    r = json.loads(ameliorateur.format_json(TAKEOVER))
    assert r["text"] == EXPECTED.rsplit("\nDurée de l'appel", 1)[0]  # no PC clock on the web
    assert "error" in json.loads(ameliorateur.format_json("   "))


@pytest.mark.skipif(not (HAS_PLAYWRIGHT and PYODIDE), reason="Pyodide core release not available (PCD_PYODIDE_DIR)")
def test_page_formats_in_the_browser_without_sending_anything(tmp_path):
    from playwright.sync_api import expect, sync_playwright

    build(tmp_path / "ameliorateur", Path(PYODIDE))
    handler = functools.partial(SimpleHTTPRequestHandler, directory=str(tmp_path))
    handler.log_message = lambda *a: None
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{server.server_address[1]}/ameliorateur/"
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path=CHROMIUM)
            page = browser.new_page(viewport={"width": 1300, "height": 900})
            requests, errors = [], []
            page.on("console", lambda m: m.type == "error" and errors.append(m.text))
            page.goto(url)
            expect(page.locator("#engine-status")).to_have_text("Prêt — traitement local", timeout=90000)
            page.on("request", lambda r: requests.append(r.url))  # from here on: the transcript is in the page
            page.fill("#input", TAKEOVER)
            page.click("#run")
            expect(page.locator("#output")).not_to_have_value("")
            assert page.locator("#output").input_value() == EXPECTED.rsplit("\nDurée de l'appel", 1)[0]
            expect(page.locator("#flags")).to_contain_text("d'autres chiffres ont été dictés")
            page.screenshot(path=str(tmp_path / "ameliorateur.png"), full_page=True)
            page.click("#clear")
            assert page.locator("#input").input_value() == "" and page.locator("#output").input_value() == ""
            assert requests == [], requests  # nothing sent anywhere, not even to the site itself
            assert not errors, errors
            browser.close()
    finally:
        server.shutdown()
    out = os.environ.get("PCD_SCREENSHOT_DIR")
    if out:
        import shutil

        shutil.copy(tmp_path / "ameliorateur.png", Path(out) / "ameliorateur.png")
