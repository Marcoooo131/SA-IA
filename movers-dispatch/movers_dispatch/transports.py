"""How the agent reaches Dynamics 365 with the user's own authorized session. No password is ever
asked, stored or sent by the agent.

- ``msal``: delegated Microsoft Entra ID token for the signed-in user (interactive sign-in in the
  system browser, MFA included), through an app registration approved by IT. Official route.
- ``browser``: a Playwright-driven browser window; the user signs in to Dynamics 365 themselves,
  then the agent calls the same Web API the Dynamics page uses, from inside that page, with the
  session cookies of that page. The agent has exactly the user's CRM rights.
"""

from __future__ import annotations

import json as _json
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import httpx

from .config import Connection
from .dataverse import CrmError, Response, SessionExpired

ODATA_HEADERS = {"OData-MaxVersion": "4.0", "OData-Version": "4.0", "Accept": "application/json"}


def api_root(conn: Connection) -> str:
    return f"{conn.environment_url.rstrip('/')}/api/data/{conn.api_version}/"


class MsalTransport:
    def __init__(self, conn: Connection, cache_path: Path):
        import msal  # optional dependency: pip install -e ".[msal]"

        self.conn = conn
        self.cache_path = cache_path
        self.cache = msal.SerializableTokenCache()
        if cache_path.exists():
            self.cache.deserialize(cache_path.read_text())
        self.app = msal.PublicClientApplication(conn.client_id, authority=f"https://login.microsoftonline.com/{conn.tenant_id}",
                                                token_cache=self.cache)
        self.scopes = [f"{conn.environment_url.rstrip('/')}/user_impersonation"]
        self.http = httpx.Client(base_url=api_root(conn), timeout=conn.timeout_seconds, headers=ODATA_HEADERS)
        self._lock = threading.Lock()

    def _token(self, interactive: bool) -> str:
        with self._lock:
            accounts = self.app.get_accounts()
            result = self.app.acquire_token_silent(self.scopes, account=accounts[0]) if accounts else None
            if not result and interactive:
                result = self.app.acquire_token_interactive(self.scopes)
            if self.cache.has_state_changed:
                self.cache_path.write_text(self.cache.serialize())
        if not result or "access_token" not in result:
            raise SessionExpired("Connexion Microsoft requise : lancer `movers-dispatch login`.")
        return result["access_token"]

    def login(self) -> None:
        self._token(interactive=True)

    def request(self, method, path, *, params=None, json=None, headers=None) -> Response:
        h = {"Authorization": f"Bearer {self._token(interactive=False)}", **(headers or {})}
        try:
            r = self.http.request(method, path, params=params, json=json, headers=h)
        except httpx.TimeoutException as e:
            raise TimeoutError(str(e)) from e
        except httpx.HTTPError as e:
            raise CrmError(f"Dynamics 365 injoignable : {e.__class__.__name__}") from e
        body = r.json() if r.content and "json" in r.headers.get("content-type", "") else None
        return Response(r.status_code, body, dict(r.headers))

    def close(self) -> None:
        self.http.close()


_FETCH_JS = """async ([url, method, headers, body, timeoutMs]) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {method, headers, body, credentials: "same-origin", signal: ctrl.signal});
    const text = await r.text();
    return {status: r.status, text, etag: r.headers.get("etag") || "", type: r.headers.get("content-type") || ""};
  } catch (e) {
    return {status: 0, text: String(e && e.name), etag: "", type: ""};
  } finally { clearTimeout(timer); }
}"""


class BrowserSessionTransport:
    """All Playwright calls run on one dedicated thread (the sync API is bound to its thread)."""

    def __init__(self, conn: Connection, profile_dir: Path):
        self.conn = conn
        self.profile_dir = profile_dir
        self.pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="dynamics-browser")
        self.page = None
        self._pw = self._ctx = None

    def _start(self):
        from playwright.sync_api import sync_playwright  # optional dependency: pip install -e ".[browser]"

        self._pw = sync_playwright().start()
        kw = {"channel": self.conn.browser_channel} if self.conn.browser_channel else {}
        if self.conn.browser_executable:
            kw = {"executable_path": self.conn.browser_executable}
        self._ctx = self._pw.chromium.launch_persistent_context(str(self.profile_dir), headless=self.conn.browser_headless, **kw)
        self.page = self._ctx.pages[0] if self._ctx.pages else self._ctx.new_page()
        self.page.goto(self.conn.environment_url, wait_until="domcontentloaded")

    def _call(self, fn, *a):
        return self.pool.submit(fn, *a).result()

    def wait_for_login(self, timeout_s: float = 300) -> None:
        """Opens the window; the user signs in with the company's usual method. Waits for the
        Web API to answer for that session (WhoAmI), without reading or typing anything."""
        def run():
            if self.page is None:
                self._start()
            self.page.wait_for_function(
                """async (u) => { try { const r = await fetch(u, {credentials: 'same-origin',
                     headers: {'Accept': 'application/json'}}); return r.status === 200; } catch (e) { return false; } }""",
                arg=api_root(self.conn) + "WhoAmI", timeout=timeout_s * 1000, polling=2000)
        try:
            self._call(run)
        except Exception as e:
            raise SessionExpired(f"Session Dynamics 365 non ouverte dans la fenêtre du navigateur ({e.__class__.__name__}).") from e

    def request(self, method, path, *, params=None, json=None, headers=None) -> Response:
        url = path if path.startswith("https://") else api_root(self.conn) + path
        if params:
            url = str(httpx.URL(url, params=params))
        h = {**ODATA_HEADERS, **(headers or {})}
        body = None
        if json is not None:
            h["Content-Type"] = "application/json"
            body = _json.dumps(json)

        def run():
            if self.page is None:
                raise SessionExpired("Fenêtre Dynamics 365 non ouverte.")
            return self.page.evaluate(_FETCH_JS, [url, method, h, body, int(self.conn.timeout_seconds * 1000)])

        r = self._call(run)
        if r["status"] == 0:
            if r["text"] == "AbortError":
                raise TimeoutError("Dynamics 365 n'a pas répondu à temps.")
            raise CrmError("Dynamics 365 injoignable depuis la fenêtre du navigateur.")
        data = _json.loads(r["text"]) if r["text"] and "json" in r["type"] else None
        return Response(r["status"], data, {"etag": r["etag"]})

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
