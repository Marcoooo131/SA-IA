"""Accès au CRM avec la session de l'agent, repris de movers-dispatch.

Une fenêtre Edge (pilotée par Playwright) s'ouvre sur le CRM ; l'agent s'y connecte comme d'habitude.
L'assistant appelle ensuite l'API Web du CRM *depuis cette page*, avec ses cookies : il a exactement les
droits de l'agent, aucun mot de passe ne lui est transmis. Le profil du navigateur est temporaire et
effacé à la fermeture (rien n'est conservé d'une session à l'autre).
"""

from __future__ import annotations

import json as _json
import shutil
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlencode

from .config import Connexion
from .models import CrmError, SessionExpired

ODATA_HEADERS = {"OData-MaxVersion": "4.0", "OData-Version": "4.0", "Accept": "application/json"}


@dataclass
class Response:
    status: int
    body: dict | None
    headers: dict


def api_root(conn: Connexion) -> str:
    return f"{conn.environment_url.rstrip('/')}/api/data/{conn.api_version}/"


_FETCH_JS = """async ([url, method, headers, body, timeoutMs]) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {method, headers, body, credentials: "same-origin", signal: ctrl.signal});
    const text = await r.text();
    return {status: r.status, text, etag: r.headers.get("etag") || "", type: r.headers.get("content-type") || "",
            entityId: r.headers.get("OData-EntityId") || ""};
  } catch (e) {
    return {status: 0, text: String(e && e.name), etag: "", type: "", entityId: ""};
  } finally { clearTimeout(timer); }
}"""

_WHOAMI_JS = """async (u) => {
  try { const r = await fetch(u, {credentials: "same-origin", headers: {"Accept": "application/json"}}); return r.status; }
  catch (e) { return 0; }
}"""


class BrowserSessionTransport:
    """Tous les appels Playwright passent par un seul fil (l'API synchrone y est liée)."""

    def __init__(self, conn: Connexion):
        self.conn = conn
        self.pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="crm-browser")
        self.profile = Path(tempfile.mkdtemp(prefix="assistant-movers-"))
        self.page = None
        self.fiche = None
        self._pw = self._ctx = None

    def _start(self):
        from playwright.sync_api import sync_playwright

        self._pw = sync_playwright().start()
        kw = {"channel": self.conn.browser_channel} if self.conn.browser_channel else {}
        if self.conn.browser_executable:
            kw = {"executable_path": self.conn.browser_executable}
        self._ctx = self._pw.chromium.launch_persistent_context(str(self.profile), headless=self.conn.browser_headless, **kw)
        self.page = self._ctx.pages[0] if self._ctx.pages else self._ctx.new_page()
        self.page.goto(self.conn.environment_url, wait_until="domcontentloaded")

    def _call(self, fn, *a):
        return self.pool.submit(fn, *a).result()

    def wait_for_login(self, timeout_s: float = 300) -> None:
        def run():
            if self.page is None:
                self._start()
            url = api_root(self.conn) + "WhoAmI"
            deadline = time.monotonic() + timeout_s
            while time.monotonic() < deadline:
                if self.page.is_closed():
                    raise SessionExpired("La fenêtre du navigateur a été fermée avant la connexion.")
                try:
                    if self.page.evaluate(_WHOAMI_JS, url) == 200:
                        return
                except Exception:  # navigation de connexion en cours
                    pass
                self.page.wait_for_timeout(2000)
            raise SessionExpired("Connexion au CRM non faite dans le délai.")

        try:
            self._call(run)
        except SessionExpired:
            raise
        except Exception as e:
            raise SessionExpired(f"Session CRM non ouverte dans la fenêtre ({e.__class__.__name__}).") from e

    def request(self, method, path, *, params=None, json=None, headers=None) -> Response:
        url = path if path.startswith("http") else api_root(self.conn) + path
        if params:
            url += ("&" if "?" in url else "?") + urlencode(params, safe="$',()=/ ")
        h = {**ODATA_HEADERS, **(headers or {})}
        body = None
        if json is not None:
            h["Content-Type"] = "application/json"
            body = _json.dumps(json)

        def run():
            if self.page is None:
                raise SessionExpired("Fenêtre CRM non ouverte.")
            return self.page.evaluate(_FETCH_JS, [url, method, h, body, int(self.conn.timeout_seconds * 1000)])

        r = self._call(run)
        if r["status"] == 0:
            if r["text"] == "AbortError":
                raise TimeoutError("Le CRM n'a pas répondu à temps.")
            raise CrmError("CRM injoignable depuis la fenêtre du navigateur.")
        data = _json.loads(r["text"]) if r["text"] and "json" in r["type"] else None
        return Response(r["status"], data, {"etag": r["etag"], "odata-entityid": r["entityId"]})

    def ouvrir_fiche(self, entite: str, record_id: str) -> None:
        """Affiche la fiche dans un 2e onglet (l'onglet principal reste réservé aux appels API)."""
        url = f"{self.conn.environment_url.rstrip('/')}/main.aspx?etn={entite}&id=%7b{record_id}%7d&pagetype=entityrecord"

        def run():
            if self.fiche is None or self.fiche.is_closed():
                self.fiche = self._ctx.new_page()
            self.fiche.goto(url, wait_until="domcontentloaded")
            self.fiche.bring_to_front()

        self._call(run)

    def observer_requetes(self, duree_s: int) -> list[str]:
        """Pour `decouvrir --observer-booking` : note méthode + adresse (sans en-têtes ni contenu) des appels
        faits par le CRM pendant que l'agent clique lui-même « Get appointments »."""
        vues: list[str] = []

        def run():
            def note(req):
                u = req.url.split("?")[0]
                if req.resource_type in ("xhr", "fetch") and ("/api/" in u or ".svc" in u or ".asmx" in u or ".ashx" in u):
                    vues.append(f"{req.method} {u}")
            self._ctx.on("request", note)
            end = time.monotonic() + duree_s
            while time.monotonic() < end:
                self.page.wait_for_timeout(1000)
            self._ctx.remove_listener("request", note)

        self._call(run)
        return sorted(set(vues))

    def close(self) -> None:
        def run():
            if self._ctx:
                self._ctx.close()
            if self._pw:
                self._pw.stop()
        try:
            self._call(run)
        finally:
            self.pool.shutdown(wait=False)
            shutil.rmtree(self.profile, ignore_errors=True)
