"""Journal de la session, en mémoire uniquement (effacé à la fermeture). Les téléphones et emails sont
masqués dans les messages ; le compte rendu affiché à l'agent, lui, garde les vraies valeurs."""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from datetime import datetime

_PHONE = re.compile(r"(?<!\d)(?:\+33\s?|0)[1-9](?:[\s.-]?\d{2}){4}(?!\d)")
_EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")

log = logging.getLogger("assistant_movers")


def masquer(texte: str) -> str:
    texte = _PHONE.sub(lambda m: m.group(0)[:4] + " •• •• ••", texte)
    return _EMAIL.sub(lambda m: m.group(0)[0] + "•••@" + m.group(0).split("@")[1], texte)


@dataclass
class Ligne:
    heure: str
    niveau: str      # info | ok | warn | err | sim
    message: str


class Journal:
    def __init__(self, maxi: int = 500):
        self.lignes: list[Ligne] = []
        self.maxi = maxi

    def _add(self, niveau: str, message: str) -> None:
        m = masquer(message)
        self.lignes.append(Ligne(datetime.now().strftime("%H:%M:%S"), niveau, m))
        del self.lignes[:-self.maxi]
        log.info("[%s] %s", niveau, m)

    def info(self, m: str) -> None: self._add("info", m)
    def ok(self, m: str) -> None: self._add("ok", m)
    def warn(self, m: str) -> None: self._add("warn", m)
    def err(self, m: str) -> None: self._add("err", m)
    def sim(self, m: str) -> None: self._add("sim", m)

    def vider(self) -> None:
        self.lignes.clear()

    def vue(self) -> list[dict]:
        return [l.__dict__ for l in self.lignes]
