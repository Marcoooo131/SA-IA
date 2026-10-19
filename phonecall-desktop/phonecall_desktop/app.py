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
    from pathlib import Path

    import httpx

    from .config import config_files, install_dir

    print(f"install dir: {install_dir()}  (frozen={getattr(sys, 'frozen', False)}, executable={sys.executable})")
    for f in config_files():
        print(f"config file: {f} -> {'found' if Path(f).exists() else 'absent'}")
    print(f"environment: {get_settings().environment.value}")

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
            # « Mettre en forme la transcription »: script, template and rules files found in the package
            sample = ("Interlocuteur : bonjour, je déménage le mois prochain et le nouvel occupant va reprendre "
                      "mon contrat, c'est Monsieur Exemple au 06 39 98 12 34\nConseiller : très bien, c'est noté")
            r = c.post("/api/format", json={"text": sample}).json()
            assert r["text"].startswith("Interlocuteur :"), r
            print(f"format ok: engine={r['engine']} lines={r['text'].count(chr(10)) + 1}")
        if settings.recognizer == "whisper":
            from .factory import whisper_model_source

            source, local = whisper_model_source(settings)
            print(f"transcription model: {source} (offline={local})")
        print(f"notes: {settings.notes_client}")
        if hasattr(controller.note_client, "describe"):
            info = controller.note_client.describe()
            print("note engine ok: " + " ".join(f"{k}={v}" for k, v in info.items()))
        return 0
    finally:
        server.should_exit = True
        thread.join(5)


def show_error(message: str) -> None:
    """The packaged app has no console: errors must be shown in a dialog box."""
    log.error("startup error: %s", message)
    if sys.platform == "win32":
        try:
            import ctypes

            ctypes.windll.user32.MessageBoxW(None, message, "Phone Call – erreur", 0x10)
            return
        except Exception:  # noqa: BLE001
            pass
    print(message, file=sys.stderr)


def selftest_recognizer(model: str) -> int:
    """Loads the transcription model (the one delivered in the package if present, otherwise downloaded
    the first time) and transcribes 1 s of silence."""
    import numpy as np

    from .factory import whisper_model_source
    from .stt.whisper_local import WhisperRecognizer

    source, local = whisper_model_source(get_settings().model_copy(update={"whisper_model": model}))
    t0 = time.monotonic()
    rec = WhisperRecognizer(model=source, local_files_only=local)
    rec.warmup()
    rec.transcribe(np.zeros(16_000, dtype=np.float32))
    print(f"recognizer ok: model={model} source={source} offline={local} in {time.monotonic() - t0:.1f}s")
    return 0


def _wait_browser_session(thread, hub, controller) -> None:
    """Browser mode: run until the page has been closed for a while (no capture running)."""
    from .session import State

    seen = False
    while thread.is_alive():
        time.sleep(0.5)
        if hub.clients:
            seen = True
        elif seen and controller.state != State.CAPTURING and time.monotonic() - hub.last_client_seen > 60:
            return


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="phonecall-desktop")
    parser.add_argument("--browser", action="store_true", help="open the interface in the default browser")
    parser.add_argument("--selftest", action="store_true", help="start, check and exit (no capture)")
    parser.add_argument("--selftest-recognizer", metavar="MODEL", help="load the transcription model and exit")
    parser.add_argument("--smoke-window", type=float, metavar="SECONDS",
                        help="open the window, check that the page loads, close it after SECONDS")
    parser.add_argument("--diag", type=float, metavar="SECONDS",
                        help="audio diagnostic: list devices and capture SECONDS from each channel (0 = list only)")
    parser.add_argument("--report", metavar="FILE", help="write the output of --selftest/--diag to FILE")
    parser.add_argument("--port-file", help=argparse.SUPPRESS)  # tests: write port and token
    args = parser.parse_args(argv)

    report = None
    if args.report:  # the windowed executable has no console: write the output to a file
        report = open(args.report, "w", encoding="utf-8")  # noqa: SIM115
        sys.stdout = report
    elif sys.stdout is not None and hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    settings = get_settings()
    configure_logging(app_dir("data") / "logs", settings.log_level)
    try:
        if args.diag is not None:
            from .diag import main as diag_main

            return diag_main(["--record", str(args.diag)] if args.diag > 0 else [])
        if args.selftest_recognizer:
            return selftest_recognizer(args.selftest_recognizer)
        if args.selftest:
            return selftest()
    except Exception as exc:  # noqa: BLE001 - make the failure visible in the report
        print(f"ERREUR : {type(exc).__name__}: {exc}")
        return 1
    finally:
        if report is not None:
            report.flush()
    return _run_ui(args, settings)


def _run_ui(args, settings) -> int:
    try:
        settings, controller, hub, app, sock, port, token = build(settings)
    except AppError as exc:
        show_error(exc.user_message + "\n\nVérifiez le fichier config.env (à côté de PhoneCallDesktop.exe).")
        return 2
    server, thread = _serve(app, sock)
    threading.Thread(target=controller.warmup, daemon=True, name="warmup").start()
    start_ui_watchdog(controller, hub, settings.ui_disconnect_stop_s)
    url = f"http://127.0.0.1:{port}/?t={token}"
    if args.port_file:
        with open(args.port_file, "w", encoding="utf-8") as fh:
            fh.write(f"{port}\n{token}\n")
    log.info("interface ready on port %s", port)
    exit_code = 0
    try:
        if args.port_file:
            while thread.is_alive():
                time.sleep(0.5)
        elif args.browser:
            webbrowser.open(url)
            _wait_browser_session(thread, hub, controller)
        else:
            try:
                import webview  # pywebview: Edge WebView2 on Windows

                window = webview.create_window("Phone Call – prise de notes", url, width=1360, height=860,
                                               min_size=(900, 600))
                if args.smoke_window:
                    result = {"loaded": False}

                    def close_when_loaded():
                        end = time.monotonic() + max(args.smoke_window, 60)
                        while time.monotonic() < end and not hub.clients:
                            time.sleep(0.2)
                        result["loaded"] = bool(hub.clients)
                        time.sleep(min(args.smoke_window, 5))
                        window.destroy()

                    threading.Thread(target=close_when_loaded, daemon=True).start()
                    webview.start(private_mode=True)
                    exit_code = 0 if result["loaded"] else 3
                    log.info("smoke window: page loaded=%s", result["loaded"])
                else:
                    webview.start(private_mode=True)
            except Exception as exc:  # noqa: BLE001 - WebView2 missing or broken: use the browser
                log.warning("native window unavailable (%s): opening the browser", type(exc).__name__)
                if args.smoke_window:
                    exit_code = 4
                else:
                    webbrowser.open(url)
                    _wait_browser_session(thread, hub, controller)
    except KeyboardInterrupt:
        pass
    finally:
        controller.emergency_stop()  # the window is closed: stop listening right now
        server.should_exit = True
        thread.join(5)
    return exit_code


if __name__ == "__main__":
    sys.exit(main())
