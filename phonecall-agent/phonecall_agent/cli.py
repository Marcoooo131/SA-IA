"""Command line: ``python -m phonecall_agent.cli <command>``."""

from __future__ import annotations

import argparse
import getpass
import os
import secrets
import sys
import time


def cmd_gen_key(_args) -> None:
    from cryptography.fernet import Fernet

    print(Fernet.generate_key().decode())


def cmd_hash_password(args) -> None:
    from .web.auth import ROLE_NAMES, hash_password

    if args.role not in ROLE_NAMES:
        sys.exit(f"role must be one of {', '.join(ROLE_NAMES)}")
    password = getpass.getpass("Mot de passe : ")
    if len(password) < 12:
        sys.exit("12 caractères minimum")
    print(f"{args.login}:{args.role}:{hash_password(password)}")


def cmd_init_db(_args) -> None:
    from .db import init_db
    from .logging_setup import configure_logging

    configure_logging()
    init_db()
    print("database initialised")


def cmd_serve(args) -> None:
    import uvicorn

    from .logging_setup import configure_logging
    from .web.app import create_app

    configure_logging()
    uvicorn.run(create_app(), host=args.host, port=args.port, proxy_headers=True, forwarded_allow_ips="*")


def cmd_worker(_args) -> None:
    from redis import Redis
    from rq import Queue, Worker

    from .config import get_settings
    from .container import get_container
    from .db import init_db
    from .logging_setup import configure_logging

    configure_logging()
    get_container()  # fail fast on bad configuration
    init_db()
    redis = Redis.from_url(get_settings().redis_url)
    Worker([Queue("phonecall", connection=redis)], connection=redis).work(with_scheduler=True)


def cmd_maintenance(args) -> None:
    from .container import get_container
    from .db import init_db
    from .logging_setup import configure_logging
    from .retention import purge_expired

    configure_logging()
    init_db()
    c = get_container()
    from .pipeline import requeue_stale

    while True:
        print(purge_expired(c), {"requeued": requeue_stale(c)})
        if not args.loop:
            return
        time.sleep(c.business.retention.purge_interval_minutes * 60)


def cmd_demo(args) -> None:
    """End-to-end run on synthetic data: signed webhooks → fake Twilio → simulated transcription/AI → UI."""
    os.environ.setdefault("PCA_ENVIRONMENT", "dev")
    os.environ.setdefault("PCA_DATABASE_URL", "sqlite:///./demo.db")
    os.environ.setdefault("PCA_CRM_CONNECTOR", "simulated" if args.with_simulated_crm else "disabled")
    os.environ["PCA_TRANSCRIPTION_PROVIDER"] = "simulated"
    os.environ["PCA_GENERATION_PROVIDER"] = "simulated"
    os.environ.setdefault("PCA_COOKIE_SECURE", "false")
    os.environ.setdefault("PCA_TWILIO_ACCOUNT_SID", "AC" + "d" * 32)
    os.environ.setdefault("PCA_TWILIO_AUTH_TOKEN", secrets.token_hex(16))
    os.environ.setdefault("PCA_PUBLIC_BASE_URL", "http://testserver")
    os.environ.setdefault("PCA_DATA_ENCRYPTION_KEY", "")
    from .web.auth import hash_password

    password = "demo-" + secrets.token_urlsafe(6)
    users = ";".join(f"{r}:{r}:{hash_password(password)}" for r in ("advisor", "supervisor", "admin"))
    os.environ["PCA_UI_USERS"] = users

    from fastapi.testclient import TestClient
    from twilio.request_validator import RequestValidator

    from .config import get_settings
    from .container import build_container, set_container
    from .fake_twilio import FakeRecording, FakeTwilio
    from .logging_setup import configure_logging
    from .twilio.recordings import TwilioRecordingClient
    from .web.app import create_app

    configure_logging("WARNING")
    settings = get_settings()
    if os.path.exists("demo.db") and settings.database_url == "sqlite:///./demo.db":
        os.remove("demo.db")
    container = build_container(settings)
    fake = FakeTwilio(settings.twilio_account_sid)
    container.recording_client_factory = lambda: TwilioRecordingClient(settings, transport=fake.transport(), sleep=lambda s: None)
    scenarios = {
        "demenagement": "demenagement",
        "resiliation_retention": "resiliation_retention",
        "incomplet": "incomplet",
        "sans_contenu": "sans_contenu",
        "hallucination": "demenagement_hallucination",
    }
    sids = {}
    for i, (name, ai_fixture) in enumerate(scenarios.items(), start=1):
        sid = "RE" + f"{i:032x}"
        sids[name] = sid
        fake.recordings[sid] = FakeRecording(duration=60)
        container.transcriber.mapping[sid] = "demenagement" if name == "hallucination" else name
        container.generator.mapping[sid] = ai_fixture
    set_container(container)
    app = create_app(container)
    client = TestClient(app)
    validator = RequestValidator(settings.twilio_auth_token.get_secret_value())
    url = "http://testserver/twilio/recording-status"
    for name, sid in sids.items():
        params = {
            "AccountSid": settings.twilio_account_sid, "CallSid": "CA" + sid[2:], "RecordingSid": sid,
            "RecordingStatus": "completed", "RecordingDuration": "60", "RecordingChannels": "2",
            "RecordingSource": "DialVerb",
        }
        sig = validator.compute_signature(url, params)
        for _ in range(2 if name == "demenagement" else 1):  # second delivery = duplicate
            r = client.post("/twilio/recording-status", data=params, headers={"X-Twilio-Signature": sig})
            print(f"webhook {name:<22} → HTTP {r.status_code}")

    from .db import session_scope
    from .models import Call

    with session_scope() as s:
        for call in s.query(Call).order_by(Call.received_at):
            rep = call.latest_report
            print(f"- {call.recording_sid[-4:]} {call.status.value:<14} score={rep.quality_score if rep else '-'} "
                  f"flags={[f['code'] for f in rep.quality_flags] if rep else '-'}")
    if not args.serve:
        return
    print(f"\nUI : http://127.0.0.1:{args.port}  — comptes advisor / supervisor / admin, mot de passe : {password}")
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=args.port)


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(prog="phonecall_agent")
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("gen-key").set_defaults(func=cmd_gen_key)
    hp = sub.add_parser("hash-password")
    hp.add_argument("login")
    hp.add_argument("role")
    hp.set_defaults(func=cmd_hash_password)
    sub.add_parser("init-db").set_defaults(func=cmd_init_db)
    sv = sub.add_parser("serve")
    sv.add_argument("--host", default="0.0.0.0")
    sv.add_argument("--port", type=int, default=8000)
    sv.set_defaults(func=cmd_serve)
    sub.add_parser("worker").set_defaults(func=cmd_worker)
    pg = sub.add_parser("maintenance", help="retention purge + requeue of stuck calls")
    pg.add_argument("--loop", action="store_true")
    pg.set_defaults(func=cmd_maintenance)
    dm = sub.add_parser("demo")
    dm.add_argument("--serve", action="store_true")
    dm.add_argument("--port", type=int, default=8000)
    dm.add_argument("--with-simulated-crm", action="store_true")
    dm.set_defaults(func=cmd_demo)
    args = p.parse_args(argv)
    args.func(args)


if __name__ == "__main__":
    main()
