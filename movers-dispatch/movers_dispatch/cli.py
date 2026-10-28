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
        try:
            t.wait_for_login()
        except CrmError as e:
            t.close()
            sys.exit(f"{e}\nRelancer, puis se connecter dans la fenêtre Edge (5 minutes maximum).")
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
        problems = cfg.problems() + gw.preflight()
        print("  OK" if not problems else "\n".join(f"  ! {p}" for p in problems))
        print(f"\n== Files dont le nom contient « {args.text} »")
        for q in gw.find_queues(args.text):
            print(f"  queue_name = \"{q['name']}\"   (queueid {q['queueid']})")
        print(f"\n== Vues de Queue Items dont le nom contient « {args.text} »")
        for v in gw.find_views(args.text):
            print(f"  \"{v['name']}\"   ({'vue système' if v['type'] == 'saved_view_id' else 'vue personnelle'})")
        if cfg.source.view_names:
            try:
                for v in gw.views():
                    print(f"  OK : « {v['name']} » trouvée")
            except CrmError as e:
                print(f"  ! {e}")
        print("\n== Recherche du client (Regarding vide)")
        client_problems = gw.client_preflight() if cfg.client.enabled else []
        print("  désactivée dans dispatch.toml" if not cfg.client.enabled else
              ("  OK" if not client_problems else "\n".join(f"  ! {p}" for p in client_problems)))
        print("  Colonnes « téléphone » du compte (à mettre dans [client] champs_telephone) :")
        for name, label in gw.phone_like_columns():
            print(f"    \"{name}\"   ({label})")
        for table in args.table:
            print(f"\n== Colonnes de « {table} » qui pointent vers un compte (pour [client] liens_compte)")
            try:
                for name in gw.account_lookups(table):
                    print(f"  {table} = \"{name}\"")
            except CrmError as e:
                print(f"  ! table « {table} » introuvable ({e.status or e})")
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


def reserve_port(first: int, tries: int = 10):
    """Takes the first free local port from `first` on, before the CRM login (so a port already used by
    another agent window does not make the user log in for nothing). Returns the bound socket."""
    import socket

    for port in range(first, first + tries):
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        if hasattr(socket, "SO_EXCLUSIVEADDRUSE"):          # Windows: never share a port with another program
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        try:
            sock.bind(("127.0.0.1", port))
        except OSError:
            sock.close()
            continue
        if port != first:
            print(f"Le port {first} est déjà pris (une autre fenêtre de l'agent est sans doute encore ouverte) : "
                  f"le tableau de bord utilise le port {port}.")
        return sock
    raise SystemExit(f"Les ports {first} à {first + tries - 1} sont tous déjà utilisés. Fermer les autres fenêtres "
                     "noires de l'agent (ou terminer « Python » dans le Gestionnaire des tâches), puis relancer.")


def cmd_serve(args) -> None:
    import uvicorn

    from .web.app import create_app

    sock = reserve_port(args.port)
    port = sock.getsockname()[1]
    cfg = _load(args)
    gw, t = connect(cfg)
    agent = Agent(cfg, gw, Journal(cfg.database))
    token = secrets.token_urlsafe(24)
    url = f"http://127.0.0.1:{port}/?token={token}"
    print(f"\nTableau de bord : {url}\n(lien valable pour cette session uniquement ; fermer cette fenêtre arrête l'agent)\n")
    if args.open:
        import threading
        import webbrowser

        threading.Timer(1.5, webbrowser.open, [url]).start()
    try:
        sock.listen(128)
        server = uvicorn.Server(uvicorn.Config(create_app(agent, token, actor=args.actor), log_level="warning"))
        server.run(sockets=[sock])
    finally:
        sock.close()
        if t:
            t.close()


def cmd_journal(args) -> None:
    cfg = _load(args)
    j = Journal(cfg.database)
    if args.corrections:
        rows = [{**c, "cases_vus": " | ".join(c["cases_vus"])} for c in j.supervision(cfg.readiness_streak)["corrections"]]
    else:
        rows = j.events() if args.events else j.items()
    if not rows:
        print("Rien à exporter pour l'instant.")
        return
    # utf-8 with BOM: Excel opens the accents correctly
    out = open(args.output, "w", encoding="utf-8-sig", newline="") if args.output else sys.stdout
    try:
        w = csv.DictWriter(out, fieldnames=list(rows[0].keys()), delimiter=";")
        w.writeheader()
        w.writerows(rows)
    finally:
        if args.output:
            out.close()
            print(f"{len(rows)} ligne(s) exportée(s) dans {args.output}")


def cmd_rappels(args) -> None:
    """Writes the team reminders file now (and optionally a test reminder), or says what blocks it."""
    from datetime import datetime, timedelta, timezone

    from . import team_reminders

    cfg = _load(args)
    rc = cfg.reminders
    print(f"Configuration : {cfg.path or '(démo)'}")
    if not rc.enabled and cfg.path is not None:
        config_mod.enable_reminders(cfg.path)
        cfg = config_mod.load(cfg.path)
        rc = cfg.reminders
        print("Rappels activés dans dispatch.toml (section [rappels], active = true).")
    if not rc.enabled:
        print("\nLes rappels sont désactivés : dans dispatch.toml, ajoutez la section [rappels] avec active = true")
        return
    print(f"Dossier des rappels : {rc.resolved_folder() or '(introuvable)'}")
    problems = rc.problems()
    if problems:
        print("\nImpossible d'écrire le fichier :")
        for pb in problems:
            print("  - " + pb)
        return
    j = Journal(cfg.database)
    if args.essai:
        collab = cfg.collaborator(args.essai) if args.essai != "tous" else None
        targets = [collab] if collab else list(cfg.collaborators)
        start = (datetime.now(timezone.utc) + timedelta(minutes=20)).replace(second=0, microsecond=0)
        for c in targets:
            j.upsert_reminder(f"essai-{c.key}", starts_at=start.isoformat().replace("+00:00", "Z"), collaborator_key=c.key,
                              collaborator_name=c.first_name, subject="ESSAI - rappel de test", client_name="(aucun client)")
        print(f"Rappel d'essai ajouté dans 20 minutes pour : {', '.join(c.first_name for c in targets)}")
    path = team_reminders.export(cfg, j)
    n = len(team_reminders.payload(cfg, j)["reminders"])
    print(f"\nFichier écrit : {path}\n{n} rappel(s) dedans. Partagez ce dossier « Rappels » aux agents (clic droit › Partager).")


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
    sp.add_argument("--table", action="append", default=[],
                    help="table dont lister les colonnes « compte » (ex. contract, task) ; répétable")
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
    sp.add_argument("--open", action="store_true", help="ouvre le tableau de bord dans le navigateur")
    sp.set_defaults(func=cmd_serve)

    sp = sub.add_parser("journal", help="exporte le journal (CSV ; séparateur point-virgule)")
    common(sp)
    sp.add_argument("--events", action="store_true", help="historique détaillé au lieu de l'état des éléments")
    sp.add_argument("--corrections", action="store_true", help="corrections faites en mode Supervisé (à analyser)")
    sp.add_argument("--output", "-o", help="fichier CSV à écrire (sinon : affichage)")
    sp.set_defaults(func=cmd_journal)

    sp = sub.add_parser("rappels", help="écrit le fichier des rappels de l'équipe maintenant (ou dit ce qui bloque)")
    common(sp)
    sp.add_argument("--essai", help="ajoute un rappel d'essai dans 20 min pour ce collaborateur (clé) ou « tous »")
    sp.set_defaults(func=cmd_rappels)

    args = p.parse_args(argv)
    args.func(args)


if __name__ == "__main__":
    main()
