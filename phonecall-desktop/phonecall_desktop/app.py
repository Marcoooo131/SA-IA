"""Entry point: ``python -m phonecall_desktop`` (or PhoneCallDesktop.exe).

Starts the local server on 127.0.0.1 (random port) and opens the interface in a native
WebView2 window (pywebview). ``--browser`` uses the default browser instead. Closing the window
stops any capture immediately.
"""

from __future__ import annotations

import argparse
import logging
import secrets
import socket
import sys
import threading
import time
import webbrowser

from .config import app_dir, get_settings
from .errors import AppError
from .logging_setup import configure_logging
from .web.server import Hub, create_app, start_ui_watchdog

log = logging.getLogger("phonecall_desktop")


def _serve(app, sock):
    import uvicorn

    # log_config=None: keep our own logging (uvicorn's default config needs a console)
    server = uvicorn.Server(uvicorn.Config(app, log_level="warning", access_log=False, ws_ping_interval=None,
                                           log_config=None))
    thread = threading.Thread(target=server.run, kwargs={"sockets": [sock]}, daemon=True, name="ui-server")
    thread.start()
    deadline = time.monotonic() + 15
    while not server.started:
        if time.monotonic() > deadline:
            raise RuntimeError("local server did not start")
        time.sleep(0.05)
    return server, thread


def build(settings=None):
    settings = settings or get_settings()
    hub = Hub()
    from .factory import build_controller

    controller = build_controller(settings, hub.emit)
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    token = secrets.token_urlsafe(32)
    app = create_app(controller, token, lambda: port, hub)
    return settings, controller, hub, app, sock, port, token


def selftest() -> int:
    """Non-interactive check used by CI and by IT after installation (no audio recorded)."""
    import httpx

    settings, controller, hub, app, sock, port, token = build()
    server, thread = _serve(app, sock)
    base = f"http://127.0.0.1:{port}"
    try:
        with httpx.Client(base_url=base, cookies={"pcd_session": token}, headers={"X-PCD-Token": token}) as c:
            assert c.get("/api/state").json()["state"] == "ready"
            devices = c.get("/api/devices").json()
            assert httpx.get(base + "/api/state").status_code == 401
            print(f"selftest ok: backend={devices.get('backend')} devices={len(devices['devices'])}"
                  + (f" error={devices['error']['code']}" if devices.get("error") else ""))
            for d in devices["devices"]:
                print(f"  - [{d['channel']}] {d['name']}{' (défaut)' if d['is_default'] else ''}")
        return 0
    finally:
        server.should_exit = True
        thread.join(5)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="phonecall-desktop")
    parser.add_argument("--browser", action="store_true", help="open the interface in the default browser")
    parser.add_argument("--selftest", action="store_true", help="start, check and exit (no capture)")
    parser.add_argument("--port-file", help=argparse.SUPPRESS)  # tests: write port and token
    args = parser.parse_args(argv)

    settings = get_settings()
    configure_logging(app_dir("data") / "logs", settings.log_level)
    if args.selftest:
        return selftest()
    try:
        settings, controller, hub, app, sock, port, token = build(settings)
    except AppError as exc:
        print(exc.user_message, file=sys.stderr)
        return 2
    server, thread = _serve(app, sock)
    threading.Thread(target=controller.warmup, daemon=True, name="warmup").start()
    start_ui_watchdog(controller, hub, settings.ui_disconnect_stop_s)
    url = f"http://127.0.0.1:{port}/?t={token}"
    if args.port_file:
        with open(args.port_file, "w", encoding="utf-8") as fh:
            fh.write(f"{port}\n{token}\n")
    log.info("interface ready on port %s", port)
    try:
        if args.browser or args.port_file:
            if not args.port_file:
                webbrowser.open(url)
            while thread.is_alive():
                time.sleep(0.5)
        else:
            import webview  # pywebview: Edge WebView2 on Windows

            webview.create_window("Phone Call – prise de notes", url, width=1360, height=860, min_size=(900, 600))
            webview.start(private_mode=True)
    except KeyboardInterrupt:
        pass
    finally:
        controller.emergency_stop()  # the window is closed: stop listening right now
        server.should_exit = True
        thread.join(5)
    return 0


if __name__ == "__main__":
    sys.exit(main())
