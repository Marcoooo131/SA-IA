"""Replacing a collaborator who leaves the Movers team by a new one, in dispatch.toml and the journal.

The new person's systemuser_id is read in the CRM (first name + last name, exactly one active user),
shown to the person, and written only after their confirmation. dispatch.toml is saved first.
"""

from __future__ import annotations

import re
import shutil
from datetime import datetime
from pathlib import Path

from . import config as config_mod
from .config import normalize_name


class TeamError(Exception):
    pass


def read_text(path: Path) -> tuple[str, str]:
    raw = path.read_bytes()
    if raw.startswith(b"\xef\xbb\xbf"):
        return raw[3:].decode("utf-8"), "utf-8-sig"
    try:
        return raw.decode("utf-8"), "utf-8"
    except UnicodeDecodeError:
        return raw.decode("cp1252"), "cp1252"


def make_key(first_name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", normalize_name(first_name)).strip("-")


def pick_user(rows: list[dict], first_name: str, last_name: str) -> dict:
    """The single active CRM user with this first and last name."""
    same = [u for u in rows if normalize_name(u.get("firstname") or "") == normalize_name(first_name)
            and normalize_name(u.get("lastname") or "") == normalize_name(last_name)]
    active = [u for u in same if not u.get("isdisabled")]
    if len(active) != 1:
        found = ", ".join(f"{u.get('fullname')} ({'inactif' if u.get('isdisabled') else 'actif'})" for u in same) or "aucun"
        raise TeamError(f"Utilisateur CRM « {first_name} {last_name} » : {len(active)} actif(s) trouvé(s), un seul attendu "
                        f"(trouvés : {found}). Vérifier l'orthographe.")
    return active[0]


# the header and its « name = value » lines (comments and blank lines after it are left untouched)
_BLOCK = re.compile(r"^\[\[collaborators\]\][ \t]*\n(?:[ \t]*[\w-]+[ \t]*=.*(?:\n|$))*", re.MULTILINE)


def replace_in_toml(text: str, old_key: str, new_key: str, first_name: str, systemuser_id: str) -> str:
    """The [[collaborators]] block of old_key becomes the new person's; old_key becomes new_key in the rotations."""
    blocks = [m for m in _BLOCK.finditer(text) if re.search(rf'^\s*key\s*=\s*"{re.escape(old_key)}"\s*$', m.group(), re.MULTILINE)]
    if len(blocks) != 1:
        raise TeamError(f"Collègue « {old_key} » introuvable dans dispatch.toml (section [[collaborators]]).")
    if any(re.search(rf'^\s*key\s*=\s*"{re.escape(new_key)}"\s*$', m.group(), re.MULTILINE) for m in _BLOCK.finditer(text)):
        raise TeamError(f"« {new_key} » est déjà dans dispatch.toml.")
    m = blocks[0]
    tail = "\n" if m.group().endswith("\n") else ""
    lines = ["[[collaborators]]", f'key = "{new_key}"', f'first_name = "{first_name}"', f'systemuser_id = "{systemuser_id}"']
    if re.search(r"^\s*email_agenda\s*=", m.group(), re.MULTILINE):
        lines.append('email_agenda = ""')
    text = text[:m.start()] + "\n".join(lines) + tail + text[m.end():]
    # rotation orders: lists of keys, e.g. resiliation = ["chloe", "kader", "estefania", "marc-antoine"]
    return re.sub(rf'^(\s*[\w-]+\s*=\s*\[[^\]\n]*)"{re.escape(old_key)}"', rf'\1"{new_key}"', text, flags=re.MULTILINE)


def apply(path: Path, journal, old_key: str, new_key: str, first_name: str, systemuser_id: str) -> Path:
    """Writes dispatch.toml (after a dated copy) and moves the journal's rotation positions and absents."""
    text, encoding = read_text(path)
    new_text = replace_in_toml(text, old_key, new_key, first_name, systemuser_id)
    cfg = config_mod.parse(config_mod.tomllib.loads(new_text), path)    # never write a file that does not load
    backup = path.with_name(f"{path.stem}.avant-{datetime.now():%Y%m%d-%H%M%S}{path.suffix}")
    shutil.copy2(path, backup)
    path.write_bytes(new_text.encode(encoding))
    for key in (f"rotation:{c.key}" for c in cfg.categories.items):
        if journal.setting(key) == old_key:
            journal.set_setting(key, new_key)          # the newcomer takes the leaver's place in each rotation
    absents = journal.setting("absents", [])
    if old_key in absents:
        journal.set_setting("absents", [k for k in absents if k != old_key])
    return backup
