"""Desktop application: the sms-reminders web app and its scheduler in one local process.

- Data: SQLite database in %LOCALAPPDATA%\\RelancesSMS (Linux/macOS: ~/.local/share/relances-sms).
- Configuration: optional %APPDATA%\\RelancesSMS\\config.env (SMR_* variables, see config.example.env);
  the SMS provider can also be set from the application (Paramètres → Fournisseur SMS), the
  secret token then goes to the Windows Credential Manager.
- Server bound to 127.0.0.1 on a random port; access through a one-time token generated at each
  launch (the Windows user is logged in as administrator). Nothing listens on the network.
- Window: Microsoft Edge in « app » mode (separate profile), or the default browser. No embedded
  engine / .NET (pywebview failed when Windows blocked its DLLs in a downloaded zip).
- The scheduler runs in a background thread while the application is open. Closing the window
  (or « Quitter l'application ») stops it: reminders only go out while the application is open and the computer is on.
"""

from __future__ import annotations

import argparse
import getpass
import logging
import os
import secrets
import socket
import sys
import threading
import time
from logging.handlers import RotatingFileHandler
from pathlib import Path

log = logging.getLogger("sms_desktop")
APP_NAME = "RelancesSMS"
WINDOW_TITLE = "Relances SMS — Movers & Takeovers"


def data_dir() -> Path:
    if os.environ.get("SMRD_DATA_DIR"):
        return Path(os.environ["SMRD_DATA_DIR"])
    if sys.platform == "win32":
        return Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local")) / APP_NAME
    return Path.home() / ".local" / "share" / "relances-sms"


def config_file() -> Path:
    if os.environ.get("SMRD_CONFIG"):
        return Path(os.environ["SMRD_CONFIG"])
    if sys.platform == "win32":
        return Path(os.environ.get("APPDATA", Path.home() / "AppData" / "Roaming")) / APP_NAME / "config.env"
    return Path.home() / ".config" / "relances-sms" / "config.env"


def read_config(path: Path) -> dict[str, str]:
    """KEY=VALUE lines; only SMR_* keys are accepted."""
    values: dict[str, str] = {}
    if not path.is_file():
        return values
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key, value = key.strip(), value.strip().strip('"').strip("'")
        if key.startswith("SMR_"):
            values[key] = value
    return values


# Never taken from the configuration file: set by the launcher at each start.
FORCED = ("SMR_ENVIRONMENT", "SMR_LOCAL_LOGIN_TOKEN", "SMR_LOCAL_USER", "SMR_SESSION_SECRET", "SMR_COOKIE_SECURE")


def prepare_environment(directory: Path, token: str) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    for key, value in read_config(config_file()).items():
        if key not in FORCED:
            os.environ.setdefault(key, value)
    from .provider_store import SERVICES, ProviderStore

    store = ProviderStore(config_file())
    for sv in SERVICES:
        key = f"SMR_PHONE_{sv.upper()}_PASSWORD"
        if not os.environ.get(key):
            password = store.get_password(sv)
            if password:
                os.environ[key] = password
    # Real sending by default, from the company's phones (no account, no simulation): until a phone
    # is linked, reminders are blocked (and the application says so) instead of being sent.
    os.environ.setdefault("SMR_SMS_PROVIDER", "telephone")
    if os.environ["SMR_SMS_PROVIDER"] == "twilio":  # earlier versions: no third-party account any more
        os.environ["SMR_SMS_PROVIDER"] = "telephone"
    os.environ.setdefault("SMR_DATABASE_URL", f"sqlite:///{(directory / 'relances.db').as_posix()}")
    os.environ["SMR_ENVIRONMENT"] = "desktop"
    os.environ["SMR_LOCAL_LOGIN_TOKEN"] = token
    os.environ["SMR_LOCAL_USER"] = _windows_user()
    os.environ["SMR_SESSION_SECRET"] = secrets.token_urlsafe(48)
    os.environ["SMR_COOKIE_SECURE"] = "false"  # plain HTTP on 127.0.0.1 only

    from sms_reminders import container as container_mod
    from sms_reminders.config import get_settings
    from sms_reminders.db import reset_caches

    get_settings.cache_clear()
    reset_caches()
    container_mod.set_container(None)


def _windows_user() -> str:
    try:
        return getpass.getuser()[:80] or "poste local"
    except Exception:  # noqa: BLE001
        return "poste local"


def setup_logging(directory: Path) -> None:
    from sms_reminders.logging_setup import RedactingFilter

    handler = RotatingFileHandler(directory / "relances.log", maxBytes=2_000_000, backupCount=3, encoding="utf-8")
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s"))
    handler.addFilter(RedactingFilter())
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(logging.INFO)
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)


class SchedulerThread(threading.Thread):
    """The sms-reminders worker loop, in-process."""

    def __init__(self, container, poll_seconds: int):
        super().__init__(name="relances-scheduler", daemon=True)
        self.container = container
        self.poll_seconds = poll_seconds
        self.stopped = threading.Event()
        self.ticks = 0

    def run(self) -> None:
        from sms_reminders.retention import purge_expired
        from sms_reminders.scheduler import run_due

        last_purge = 0.0
        while not self.stopped.is_set():
            try:
                out = run_due(self.container)
                if any(out.values()):
                    log.info("tick: %s", out)
                if time.time() - last_purge > 3600:
                    purge_expired()
                    last_purge = time.time()
            except Exception:  # keep running; details are in the log, without personal data
                log.exception("scheduler tick failed")
            self.ticks += 1
            self.stopped.wait(self.poll_seconds)

    def stop(self) -> None:
        self.stopped.set()


class Runtime:
    def __init__(self, directory: Path | None = None):
        self.directory = directory or data_dir()
        self.token = secrets.token_urlsafe(32)
        prepare_environment(self.directory, self.token)

        from sms_reminders.container import get_container
        from sms_reminders.scheduler import recover_stale
        from sms_reminders.web.app import create_app

        from .provider_store import ProviderStore

        self.container = get_container()
        self.container.provider_store = ProviderStore(config_file())
        self.app = create_app(self.container)  # also creates the tables
        from sms_reminders.db import session_scope

        from .preset import apply_preset

        with session_scope() as s:
            log.info("preset: %s", apply_preset(s) or "already applied")
        log.info("recovery: %s", recover_stale(self.container))
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self.sock.bind(("127.0.0.1", 0))
        self.port = self.sock.getsockname()[1]
        self.server = None
        self.scheduler = SchedulerThread(self.container, self.container.settings.worker_poll_seconds)
        self.quit_requested = threading.Event()
        self.container.on_quit = self.quit_requested.set

    @property
    def base_url(self) -> str:
        return f"http://127.0.0.1:{self.port}"

    @property
    def login_url(self) -> str:
        return f"{self.base_url}/local-login?t={self.token}"

    def start(self) -> None:
        import uvicorn

        # log_config=None: keep our own logging (uvicorn's default config needs a console)
        self.server = uvicorn.Server(uvicorn.Config(self.app, log_level="warning", access_log=False, log_config=None))
        threading.Thread(target=self.server.run, kwargs={"sockets": [self.sock]}, name="relances-web", daemon=True).start()
        deadline = time.time() + 20
        while not self.server.started:
            if time.time() > deadline:
                raise RuntimeError("le serveur local n'a pas démarré")
            time.sleep(0.05)
        self.scheduler.start()
        log.info("started on 127.0.0.1:%s (provider=%s)", self.port, self.container.provider.name)

    def stop(self) -> None:
        self.scheduler.stop()
        if self.server:
            self.server.should_exit = True
        if self.scheduler.is_alive():
            self.scheduler.join(timeout=10)
        log.info("stopped")


def selftest(directory: Path | None = None) -> int:
    """Start everything, check the pages and one scheduler pass, then exit."""
    import httpx

    rt = Runtime(directory)
    rt.start()
    try:
        with httpx.Client(base_url=rt.base_url, follow_redirects=True, timeout=20) as c:
            assert c.get("/healthz").json()["status"] == "ok"
            assert c.get("/local-login?t=wrong", follow_redirects=False).status_code == 403
            page = c.get(f"/local-login?t={rt.token}")
            assert page.status_code == 200 and "Tableau de bord" in page.text, "dashboard not reached"
            for url in ("/appointments", "/sms", "/import", "/settings"):
                assert c.get(url).status_code == 200, url
        deadline = time.time() + 15
        while rt.scheduler.ticks < 1 and time.time() < deadline:
            time.sleep(0.1)
        assert rt.scheduler.ticks >= 1, "scheduler did not run"
        print(f"selftest ok: port={rt.port} provider={rt.container.provider.name} data={rt.directory}")
        return 0
    except AssertionError as exc:
        print(f"selftest FAILED: {exc}")
        return 1
    finally:
        rt.stop()


def find_edge() -> str | None:
    """Microsoft Edge (present on Windows 10/11): used in « app » mode as the application window.
    No embedded browser engine, no .NET: nothing that Windows can block in a downloaded zip."""
    import shutil

    candidates = []
    for var in ("PROGRAMFILES(X86)", "PROGRAMFILES", "LOCALAPPDATA"):
        base = os.environ.get(var)
        if base:
            candidates.append(Path(base) / "Microsoft" / "Edge" / "Application" / "msedge.exe")
    for path in candidates:
        if path.is_file():
            return str(path)
    return shutil.which("msedge")


def open_window(url: str, profile_dir: Path):
    """Open the application window. Returns the Edge process, or None if the default browser
    was used instead."""
    import subprocess
    import webbrowser

    edge = find_edge()
    if edge:
        try:
            return subprocess.Popen([
                edge, f"--app={url}", f"--user-data-dir={profile_dir}", "--no-first-run",
                "--no-default-browser-check", "--disable-features=Translate", "--window-size=1440,900",
            ])
        except OSError:
            log.warning("could not start Edge, using the default browser")
    webbrowser.open(url)
    return None


def wait_until_closed(rt: Runtime, window, handoff_seconds: float = 5) -> None:
    """Run until the window is closed or « Quitter l'application » is clicked.
    If Edge handed the window over to an already running Edge (process ends at once), the
    window cannot be tracked: the application then runs until « Quitter »."""
    opened = time.time()
    while not rt.quit_requested.is_set():
        if window is not None and window.poll() is not None:
            if time.time() - opened > handoff_seconds:
                log.info("window closed")
                return
            window = None
        rt.quit_requested.wait(0.5)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="RelancesSMS")
    parser.add_argument("--browser", action="store_true", help="ouvrir dans le navigateur par défaut")
    parser.add_argument("--selftest", action="store_true", help="démarrer, vérifier, quitter")
    parser.add_argument("--window-test", action="store_true", help=argparse.SUPPRESS)  # CI: open the window, quit
    parser.add_argument("--data-dir", help="dossier des données (défaut : %%LOCALAPPDATA%%\\RelancesSMS)")
    args = parser.parse_args(argv)
    directory = Path(args.data_dir) if args.data_dir else data_dir()
    directory.mkdir(parents=True, exist_ok=True)
    if args.selftest:
        logging.basicConfig(level=logging.WARNING)
        return selftest(directory)
    setup_logging(directory)
    rt = Runtime(directory)
    rt.start()
    try:
        if args.window_test:
            window = open_window(rt.login_url, directory / "fenetre")
            time.sleep(5)
            ok = window is not None
            log.info("window test: edge=%s", ok)
            if window is not None and window.poll() is None:
                window.terminate()
            return 0 if ok else 2
        if args.browser:
            import webbrowser

            webbrowser.open(rt.login_url)
            window = None
        else:
            window = open_window(rt.login_url, directory / "fenetre")
        wait_until_closed(rt, window)
    except KeyboardInterrupt:
        pass
    except Exception:  # never leave the user with a Python error dialog
        log.exception("unexpected error")
    finally:
        rt.stop()
    return 0


if __name__ == "__main__":
    sys.exit(main())
