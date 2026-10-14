"""Command line: python -m sms_reminders.cli <command>."""

from __future__ import annotations

import argparse
import getpass
import logging
import signal
import sys
import time as _time
from datetime import datetime, time, timedelta

log = logging.getLogger("sms_reminders.worker")


def cmd_serve(args) -> None:
    import uvicorn

    from .logging_setup import setup_logging
    from .web.app import create_app

    setup_logging()
    uvicorn.run(create_app(), host=args.host, port=args.port, proxy_headers=True, log_config=None)


def cmd_worker(args) -> None:
    """Persistent scheduler. Runs independently of any browser; several instances are safe
    (atomic claims). Restart-safe: interrupted jobs are recovered, never resent blindly."""
    from .container import get_container
    from .db import init_db
    from .logging_setup import setup_logging
    from .retention import purge_expired
    from .scheduler import recover_stale, run_due

    setup_logging()
    init_db()
    c = get_container()
    log.info("worker started (provider=%s, simulated=%s)", c.provider.name, c.provider.simulated)
    log.info("recovery: %s", recover_stale(c))
    stop = {"flag": False}

    def _stop(*_):
        stop["flag"] = True

    signal.signal(signal.SIGTERM, _stop)
    signal.signal(signal.SIGINT, _stop)
    last_purge = 0.0
    while not stop["flag"]:
        try:
            out = run_due(c)
            if any(out.values()):
                log.info("tick: %s", out)
            if _time.time() - last_purge > 3600:
                log.info("retention: %s", purge_expired())
                last_purge = _time.time()
        except Exception:  # keep the worker alive; the error is logged without personal data
            log.exception("tick failed")
        if args.once:
            break
        for _ in range(c.settings.worker_poll_seconds):
            if stop["flag"]:
                break
            _time.sleep(1)
    log.info("worker stopped")


def cmd_init_db(args) -> None:
    from .db import init_db

    init_db()
    print("Base de données initialisée.")


def cmd_hash_password(args) -> None:
    from .web.auth import hash_password

    pw = getpass.getpass("Mot de passe : ")
    if len(pw) < 12:
        sys.exit("Choisissez au moins 12 caractères.")
    if pw != getpass.getpass("Confirmation : "):
        sys.exit("Les mots de passe ne correspondent pas.")
    print(hash_password(pw))


def cmd_purge(args) -> None:
    from .db import init_db
    from .retention import purge_expired

    init_db()
    print(purge_expired())


def cmd_schema(args) -> None:
    from sqlalchemy.dialects import postgresql
    from sqlalchemy.schema import CreateIndex, CreateTable

    from . import models  # noqa: F401
    from .db import Base

    dialect = postgresql.dialect()
    for table in Base.metadata.sorted_tables:
        print(str(CreateTable(table).compile(dialect=dialect)).strip() + ";\n")
        for index in sorted(table.indexes, key=lambda i: i.name):
            print(str(CreateIndex(index).compile(dialect=dialect)).strip() + ";")
        print()


EXAMPLE_PREFIX = "[EXEMPLE A REMPLACER] "


def cmd_demo(args) -> None:
    """Fictitious data for a local demonstration (dev only)."""
    from .appointments import AppointmentData, create_appointment, confirm
    from .config import Environment, get_settings
    from .db import init_db, session_scope
    from .models import Service, ServiceConfig, Step, TemplateSlot
    from .policy import load_policy
    from .template_admin import activate, save_version
    from .timeutil import PARIS

    if get_settings().environment not in (Environment.DEV, Environment.TEST) or not get_settings().is_simulation:
        sys.exit("La démonstration n'est disponible qu'en environnement dev avec SMR_SMS_PROVIDER=simulation.")
    init_db()
    now = datetime.now(PARIS)
    people = [("CLI-900001", "Marie", "DUPONT"), ("CLI-900002", "Paul", "MARTIN"), ("CLI-900003", "Sophie", "BERNARD"),
              ("CLI-900004", "Karim", "BENALI"), ("CLI-900005", "Julie", "PETIT"), ("CLI-900006", "Thomas", "ROUX")]
    offsets = [timedelta(hours=50), timedelta(hours=30), timedelta(hours=72), timedelta(hours=26), timedelta(days=5), timedelta(hours=49)]
    with session_scope() as s:
        policy = load_policy(s)
        if args.with_example_templates:
            for sv in Service.ALL:
                cfg = s.get(ServiceConfig, sv)
                cfg.sender_id = cfg.sender_id or ("SIM-MOVERS" if sv == Service.MOVERS else "SIM-TAKEOVR")
            for slot in s.query(TemplateSlot).all():
                if slot.active_version_id:
                    continue
                label = Service.LABELS[slot.service]
                body = (EXAMPLE_PREFIX + "Bonjour {{prenom}}, rappel de votre rendez-vous " + label +
                        " le {{date_rendez_vous}} à {{heure_rendez_vous}}.")
                if slot.step == Step.J1_SECOND:
                    body += " Merci de nous confirmer votre présence."
                v = save_version(s, slot, body, actor="démo")
                activate(s, slot, v, actor="démo", policy=policy)
        for i, ((ref, first, last), off) in enumerate(zip(people, offsets)):
            local = (now + off).replace(minute=0 if i % 2 else 30, second=0, microsecond=0)
            data = AppointmentData(ref, first, last, f"06 00 00 00 {i + 10:02d}", local.date(), time(local.hour, local.minute),
                                   Service.MOVERS if i % 2 == 0 else Service.TAKEOVERS)
            from sqlalchemy import select

            from .appointments import business_key
            from .models import Appointment

            if s.scalar(select(Appointment.id).where(Appointment.business_key == business_key(None, ref, data.service, data.appointment_date, data.appointment_time))):
                continue
            appt = create_appointment(s, data, actor="démo", policy=policy, now=datetime.now(PARIS), origin="démonstration")
            if i == 2:
                confirm(s, appt, actor="démo", now=datetime.now(PARIS))
    print("Données fictives créées." + (" Templates d'EXEMPLE activés (à remplacer)." if args.with_example_templates else ""))


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="sms_reminders")
    sub = parser.add_subparsers(dest="command", required=True)
    p = sub.add_parser("serve", help="interface web")
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=8000)
    p.set_defaults(func=cmd_serve)
    p = sub.add_parser("worker", help="moteur de planification persistant")
    p.add_argument("--once", action="store_true", help="un seul passage (cron)")
    p.set_defaults(func=cmd_worker)
    sub.add_parser("init-db", help="crée les tables").set_defaults(func=cmd_init_db)
    sub.add_parser("hash-password", help="hache un mot de passe pour SMR_UI_USERS").set_defaults(func=cmd_hash_password)
    sub.add_parser("purge", help="purge de conservation").set_defaults(func=cmd_purge)
    sub.add_parser("schema", help="affiche le schéma SQL (PostgreSQL)").set_defaults(func=cmd_schema)
    p = sub.add_parser("demo", help="données fictives (dev)")
    p.add_argument("--with-example-templates", action="store_true")
    p.set_defaults(func=cmd_demo)
    args = parser.parse_args(argv)
    args.func(args)


if __name__ == "__main__":
    main()
