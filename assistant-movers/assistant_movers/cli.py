"""Commandes : demo | lancer | decouvrir."""

from __future__ import annotations

import argparse
import logging
import secrets
import socket
import sys
import threading
import webbrowser
from pathlib import Path

from . import config as cfgmod


def _port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _serve(assistant, ouvrir: bool) -> None:
    import uvicorn

    from .web.app import create_app

    token = secrets.token_urlsafe(24)
    port = _port()
    url = f"http://127.0.0.1:{port}/?token={token}"
    print("\nAssistant Movers prêt. Lien (valable pour cette session uniquement) :\n  " + url)
    print("Pour arrêter : fermer cette fenêtre (tout est effacé).\n")
    if ouvrir:
        threading.Timer(1.2, lambda: webbrowser.open(url)).start()
    uvicorn.run(create_app(assistant, token), host="127.0.0.1", port=port, log_level="warning")


def _session(cfg):
    from .crm import DataverseGateway
    from .transport import BrowserSessionTransport

    t = BrowserSessionTransport(cfg.connexion)
    print("Une fenêtre Edge s'ouvre sur le CRM : connectez-vous comme d'habitude…")
    t.wait_for_login()
    print("Connecté.")
    return t, DataverseGateway(cfg, t)


def main(argv=None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s", datefmt="%H:%M:%S")
    ap = argparse.ArgumentParser(prog="assistant-movers")
    sub = ap.add_subparsers(dest="cmd", required=True)
    d = sub.add_parser("demo", help="CRM fictif, aucune donnée réelle")
    d.add_argument("--no-open", action="store_true")
    l = sub.add_parser("lancer", help="sur le vrai CRM (session Edge de l'agent)")
    l.add_argument("-c", "--config", default="assistant.toml")
    l.add_argument("--no-open", action="store_true")
    k = sub.add_parser("decouvrir", help="relève les noms techniques du CRM (lecture seule)")
    k.add_argument("-c", "--config", default="assistant.toml")
    k.add_argument("--observer-booking", type=int, metavar="SECONDES", default=0,
                   help="note les appels du CRM pendant que VOUS cliquez « Get appointments » sur un WO")
    args = ap.parse_args(argv)

    from .parcours import Assistant

    if args.cmd == "demo":
        from .fake import FakeCrm
        cfg = cfgmod.load(Path(__file__).parent / "demo.toml")
        _serve(Assistant(cfg, FakeCrm(), demo=True), not args.no_open)
        return 0

    cfg = cfgmod.load(args.config)
    if cfg.connexion.kind != "browser":
        print("connexion.kind doit valoir \"browser\" pour le vrai CRM (ou utilisez `demo`).")
        return 2
    t, gw = _session(cfg)
    try:
        if args.cmd == "decouvrir":
            from .decouverte import Decouverte
            lignes = Decouverte(gw).lancer()
            if args.observer_booking:
                print(f"\nOuvrez un WO de test dans Edge et cliquez « Get appointments » (observation {args.observer_booking} s)…")
                vues = t.observer_requetes(args.observer_booking)
                lignes += ["", "[Appels observés pendant Get appointments]"] + [f"    {v}" for v in vues]
                print("\n".join(lignes[-len(vues) - 1:]))
            Path("decouverte.txt").write_text("\n".join(lignes), encoding="utf-8")
            print("\nRapport : decouverte.txt (noms techniques uniquement, aucune donnée client).")
            return 0
        _serve(Assistant(cfg, gw, demo=False), not args.no_open)
        return 0
    finally:
        t.close()


if __name__ == "__main__":
    sys.exit(main())
