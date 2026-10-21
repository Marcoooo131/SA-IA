"""Browser-session transport in a real Chromium against a local stand-in for the Web API.

Checks what the unit tests cannot: the request really leaves from the page, with its cookies,
the ETag and the status come back, a slow answer becomes a timeout (never a silent retry)."""

from __future__ import annotations

import json
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest

pytest.importorskip("playwright.sync_api")

from movers_dispatch.config import Connection  # noqa: E402
from movers_dispatch.transports import BrowserSessionTransport  # noqa: E402

SEEN = []


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _send(self, status, body=None, headers=()):
        data = json.dumps(body).encode() if body is not None else b""
        self.send_response(status)
        if body is not None:
            self.send_header("Content-Type", "application/json; odata.metadata=minimal")
        for k, v in headers:
            self.send_header(k, v)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if "/api/" not in self.path:   # the CRM page itself (on-premises: https://<server>/<Organisation>)
            return self._send(200, {}, [("Set-Cookie", "CrmOwinAuth=ok; Path=/")])
        if "session=1" not in self.headers.get("Cookie", "") and "CrmOwinAuth=ok" not in self.headers.get("Cookie", ""):
            return self._send(401, {"error": {"message": "unauthorized"}})
        if self.path.endswith("/WhoAmI"):
            return self._send(200, {"UserId": "x"})
        if "/slow" in self.path:
            import time
            time.sleep(2)
            return self._send(200, {})
        SEEN.append(("GET", self.path, self.headers.get("Prefer")))
        return self._send(200, {"queueitemid": "a", "@odata.etag": 'W/"5"'}, [("ETag", 'W/"5"')])

    def do_PATCH(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        SEEN.append(("PATCH", self.path, self.headers.get("If-Match"), body))
        return self._send(412 if self.headers.get("If-Match") != 'W/"5"' else 204)


@pytest.fixture(scope="module")
def transport(tmp_path_factory):
    srv = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    conn = Connection(kind="browser", environment_url=f"http://127.0.0.1:{srv.server_port}/SectorAlarmDemo", browser_headless=True,
                      browser_executable=os.environ.get("MD_TEST_BROWSER", ""), timeout_seconds=1)
    t = BrowserSessionTransport(conn, tmp_path_factory.mktemp("profile"))
    try:
        t.wait_for_login(timeout_s=20)
    except Exception as e:  # no browser in this environment
        pytest.skip(f"Chromium indisponible : {e}")
    yield t
    t.close()
    srv.shutdown()


def test_get_with_params_and_annotations(transport):
    r = transport.request("GET", "queueitems(a)", params={"$select": "title"}, headers={"Prefer": 'odata.include-annotations="*"'})
    assert r.status == 200 and r.body["@odata.etag"] == 'W/"5"' and r.headers["etag"] == 'W/"5"'
    assert SEEN[-1][1] == "/SectorAlarmDemo/api/data/v8.2/queueitems(a)?%24select=title" and "include-annotations" in SEEN[-1][2]


def test_patch_sends_json_and_if_match(transport):
    r = transport.request("PATCH", "queueitems(a)", json={"k": "v"}, headers={"If-Match": 'W/"5"'})
    assert r.status == 204 and SEEN[-1] == ("PATCH", "/SectorAlarmDemo/api/data/v8.2/queueitems(a)", 'W/"5"', {"k": "v"})
    assert transport.request("PATCH", "queueitems(a)", json={}, headers={"If-Match": 'W/"4"'}).status == 412


def test_slow_answer_is_a_timeout(transport):
    with pytest.raises(TimeoutError):
        transport.request("GET", "slow")


class LoginHandler(BaseHTTPRequestHandler):
    """CRM that redirects to a sign-in page; the 'user' signs in after 2 s and is sent back."""

    def log_message(self, *a):
        pass

    def _send(self, code, body=b"", headers=()):
        self.send_response(code)
        for k, v in headers:
            self.send_header(k, v)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        authed = "auth=ok" in self.headers.get("Cookie", "")
        if self.path.startswith("/Org/api/"):
            return self._send(200, b'{"UserId":"x"}', [("Content-Type", "application/json")]) if authed else self._send(401)
        if self.path.startswith("/login"):
            page = (b"<html><body>login<script>setTimeout(()=>{document.cookie='auth=ok;path=/';"
                    b"location.href='/Org/main.aspx'}," + self.server.delay_ms + b")</script></body></html>")
            return self._send(200, page, [("Content-Type", "text/html")])
        if not authed:
            return self._send(302, b"", [("Location", "/login")])
        return self._send(200, b"<html><body>CRM</body></html>", [("Content-Type", "text/html")])


def _login_transport(tmp_path, delay_ms: bytes):
    srv = ThreadingHTTPServer(("127.0.0.1", 0), LoginHandler)
    srv.delay_ms = delay_ms
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    conn = Connection(kind="browser", environment_url=f"http://127.0.0.1:{srv.server_port}/Org", browser_headless=True,
                      browser_executable=os.environ.get("MD_TEST_BROWSER", ""))
    return srv, BrowserSessionTransport(conn, tmp_path)


def test_waits_for_the_sign_in_across_page_navigations(tmp_path):
    """Regression: the wait used to return at once (the page-side check returned a promise, always
    truthy), so the agent queried the CRM before the user had signed in and got HTTP 401."""
    from movers_dispatch.dataverse import SessionExpired

    srv, t = _login_transport(tmp_path, b"2000")
    try:
        try:
            t.wait_for_login(timeout_s=20)
        except SessionExpired as e:
            if "Executable" in repr(e.__cause__) or "executable" in repr(e.__cause__):
                pytest.skip("Chromium indisponible")
            raise
        assert t.request("GET", "WhoAmI").status == 200
    finally:
        t.close()
        srv.shutdown()


def test_sign_in_not_done_in_time_is_reported(tmp_path):
    from movers_dispatch.dataverse import SessionExpired

    srv, t = _login_transport(tmp_path, b"600000")
    try:
        with pytest.raises(SessionExpired) as e:
            t.wait_for_login(timeout_s=3)
        if "xecutable" in repr(e.value.__cause__):
            pytest.skip("Chromium indisponible")
        assert "délai" in str(e.value)
    finally:
        t.close()
        srv.shutdown()
