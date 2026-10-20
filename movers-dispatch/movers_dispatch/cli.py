"""Command line: python -m movers_dispatch.cli <command> (or `movers-dispatch <command>`)."""

from __future__ import annotations

import argparse
import csv
import json
import logging
import secrets
import sys
from pathlib import Path

from . import config as config_mod
from .dataverse import CrmError, DataverseGateway
from .engine import Agent, RunBlocked
from .journal import Journal
from .models import Mode, Status


def connect(cfg: config_mod.Config):
    """Returns (gateway, transport or None). Opens the user's session; never asks for a password."""
    kind = cfg.connection.kind
    if kind == "fake":
        from .fake import demo_crm

        return demo_crm(), None
    base = cfg.path.parent if cfg.path else Path.cwd()
    if kind == "msal":
        from .transports import MsalTransport

        t = MsalTransport(cfg.connection, base / ".token-cache.json")
        t.login()
    elif kind == "browser":
        from .transports import BrowserSessionTransport

        t = BrowserSessionTransport(cfg.connection, base / cfg.connection.browser_profile_dir)
        print("Une fenêtre de navigateur s'ouvre : connectez-vous à Dynamics 365 comme d'habitude.")
        t.wait_for_login()
    else:
        sys.exit(f"connection.kind inconnu : {kind} (fake, msal ou browser).")
    return DataverseGateway(cfg, t), t


def _load(args) -> config_mod.Config:
    if not getattr(args, "demo", False) and not args.config:
        sys.exit("Indiquer --config dispatch.toml (ou --demo pour les données fictives).")
    if getattr(args, "demo", False):
        from .fake import demo_config

        db = str(Path(args.database or "movers_dispatch_demo.db"))
        return demo_config(database=db, automatic_allowed=True)
    try:
        return config_mod.load(args.config)
    except (OSError, config_mod.ConfigError) as e:
        sys.exit(f"Configuration : {e}")


def cmd_discover(args) -> None:
    """Read-only: checks the real metadata and lists what the configuration must reference."""
    cfg = _load(args)
    gw, t = connect(cfg)
    try:
        if not isinstance(gw, DataverseGateway):
            print("Connexion de démonstration : rien à découvrir.")
            return
        print("== Versions du Web API qui répondent")
        versions = gw.api_versions()
        print(f"  {', '.join(versions) or 'aucune'}  (configurée : {cfg.connection.api_version})")
        if versions and cfg.connection.api_version not in versions:
            print(f"  ! Mettre connection.api_version = \"{versions[0]}\" puis relancer discover.")
            return
        print("\n== Contrôles préalables")
        problems = gw.preflight()
        print("  OK" if not problems else "\n".join(f"  ! {p}" for p in problems))
        print(f"\n== Files dont le nom contient « {args.text} »")
        for q in gw.find_queues(args.text):
            print(f"  queue_name = \"{q['name']}\"   (queueid {q['queueid']})")
        print(f"\n== Vues de Queue Items dont le nom contient « {args.text} »")
        for v in gw.find_views(args.text):
            print(f"  {v['type']} = \"{v['id']}\"   ({v['name']})")
        print("\n== Utilisateurs Dynamics 365 par prénom (à reporter dans [[collaborators]] après vérification)")
        for c in cfg.collaborators:
            rows = gw.find_users(c.first_name)
            print(f"  {c.first_name} : {len(rows)} résultat(s)")
            for u in rows:
                state = "INACTIF" if u.get("isdisabled") else "actif"
                print(f"    systemuser_id = \"{u['systemuserid']}\"   {u.get('fullname')}  <{u.get('domainname')}>  {state}")
    except CrmError as e:
        sys.exit(f"Dynamics 365 : {e}")
    finally:
        if t:
            t.close()


def cmd_login(args) -> None:
    cfg = _load(args)
    _, t = connect(cfg)
    if t:
        t.close()
    print("Connexion établie.")


def cmd_run(args) -> None:
    cfg = _load(args)
    mode = Mode(args.mode)
    gw, t = connect(cfg)
    agent = Agent(cfg, gw, Journal(cfg.database))
    try:
        out = agent.run(mode, actor=args.actor, confirm_automatic=args.confirm_automatic)
    except RunBlocked as e:
        sys.exit(str(e))
    try:
        print(json.dumps(out, ensure_ascii=False, indent=2))
        if mode is Mode.SUPERVISED:
            for item in [i for i in agent.journal.items() if i["status"] == Status.AWAITING_APPROVAL.value]:
                print(f"\n{item['queueitem_id']}  {item['subject']}\n  Case {item['case_number']} — Owner "
                      f"{item['owner_name']} → Worked By = {item['worked_by_name']}")
                answer = input("  Écrire cette valeur dans Dynamics 365 ? [o/N/stop] ").strip().lower()
                if answer == "stop":
                    break
                if answer == "o":
                    print("  →", agent.approve(item["queueitem_id"], args.actor)["reason"])
                else:
                    agent.reject(item["queueitem_id"], args.actor, "refus en ligne de commande")
    finally:
        if t:
            t.close()


def cmd_serve(args) -> None:
    import uvicorn

    from .web.app import create_app

    cfg = _load(args)
    gw, t = connect(cfg)
    agent = Agent(cfg, gw, Journal(cfg.database))
    token = secrets.token_urlsafe(24)
    print(f"\nTableau de bord : http://127.0.0.1:{args.port}/?token={token}\n(lien valable pour cette session uniquement)\n")
    try:
        uvicorn.run(create_app(agent, token, actor=args.actor), host="127.0.0.1", port=args.port, log_level="warning")
    finally:
        if t:
            t.close()


def cmd_journal(args) -> None:
    cfg = _load(args)
    j = Journal(cfg.database)
    rows = j.events() if args.events else j.items()
    if not rows:
        print("Journal vide.")
        return
    w = csv.DictWriter(sys.stdout, fieldnames=list(rows[0].keys()), delimiter=";")
    w.writeheader()
    w.writerows(rows)


def main(argv: list[str] | None = None) -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    p = argparse.ArgumentParser(prog="movers-dispatch", description=__doc__)
    sub = p.add_subparsers(dest="cmd", required=True)

    def common(sp, demo=True):
        sp.add_argument("--config", "-c", help="fichier TOML (voir config/dispatch.example.toml)")
        sp.add_argument("--database", help="base SQLite du mode démo")
        sp.add_argument("--actor", default="local", help="nom inscrit dans l'historique pour les validations")
        if demo:
            sp.add_argument("--demo", action="store_true", help="données FICTIVES, sans Dynamics 365")

    sp = sub.add_parser("discover", help="lecture seule : métadonnées, files, vues, utilisateurs")
    common(sp, demo=False)
    sp.add_argument("--text", default="Movers", help="texte recherché dans les noms de files et de vues")
    sp.set_defaults(func=cmd_discover)

    sp = sub.add_parser("login", help="ouvre la session Dynamics 365 de l'utilisateur")
    common(sp, demo=False)
    sp.set_defaults(func=cmd_login)

    sp = sub.add_parser("run", help="traite la file une fois")
    common(sp)
    sp.add_argument("--mode", choices=[m.value for m in Mode], default=Mode.SIMULATION.value)
    sp.add_argument("--confirm-automatic", action="store_true", help="confirmation explicite du mode Automatique")
    sp.set_defaults(func=cmd_run)

    sp = sub.add_parser("serve", help="tableau de bord local")
    common(sp)
    sp.add_argument("--port", type=int, default=8765)
    sp.set_defaults(func=cmd_serve)

    sp = sub.add_parser("journal", help="exporte le journal (CSV ; séparateur point-virgule)")
    common(sp)
    sp.add_argument("--events", action="store_true", help="historique détaillé au lieu de l'état des éléments")
    sp.set_defaults(func=cmd_journal)

    args = p.parse_args(argv)
    args.func(args)


if __name__ == "__main__":
    main()
