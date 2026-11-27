"""Replacing a collaborator who leaves the team (fictitious names and identifiers)."""

from __future__ import annotations

import shutil
from pathlib import Path

import pytest

from movers_dispatch import config, team
from movers_dispatch.journal import Journal

EXAMPLE = Path(__file__).parent.parent / "config" / "dispatch.example.toml"
NEW_ID = "0b0b0b0b-1111-2222-3333-444444444444"


def setup(tmp_path, encoding="utf-8"):
    p = tmp_path / "dispatch.toml"
    text = EXAMPLE.read_text(encoding="utf-8").replace('key = "agathe"', 'key = "estefania"') \
        .replace('first_name = "Agathe"', 'first_name = "Estefania"').replace('"agathe"', '"estefania"')
    text += "\n# commentaire de fin à garder\n"
    p.write_bytes(text.encode(encoding, errors="replace"))   # Notepad « ANSI » cannot hold every character
    return p


def test_pick_user_needs_one_active_match():
    rows = [{"systemuserid": "a", "firstname": "Agathe", "lastname": "Exemple", "isdisabled": False, "fullname": "Agathe Exemple"},
            {"systemuserid": "b", "firstname": "Agathe", "lastname": "Autre", "isdisabled": False, "fullname": "Agathe Autre"},
            {"systemuserid": "c", "firstname": "Agathe", "lastname": "Exemple", "isdisabled": True, "fullname": "Agathe Exemple"}]
    assert team.pick_user(rows, "agathe", "EXEMPLE")["systemuserid"] == "a"
    with pytest.raises(team.TeamError, match="0 actif"):
        team.pick_user(rows, "Agathe", "Inconnue")
    with pytest.raises(team.TeamError, match="2 actif"):
        team.pick_user(rows + [dict(rows[0], systemuserid="d")], "Agathe", "Exemple")
    assert team.make_key("Chloé") == "chloe" and team.make_key("Marc Antoine") == "marc-antoine"


@pytest.mark.parametrize("encoding", ["utf-8", "utf-8-sig", "cp1252"])
def test_replace_in_dispatch_toml_and_rotations(tmp_path, encoding):
    p = setup(tmp_path, encoding)
    j = Journal(str(tmp_path / "j.db"))
    j.set_setting("rotation:resiliation", "estefania")
    j.set_setting("rotation:takeover", "kader")
    j.set_setting("absents", ["estefania", "chloe"])
    backup = team.apply(p, j, "estefania", "agathe", "Agathe", NEW_ID)
    cfg = config.load(p)
    assert [c.key for c in cfg.collaborators] == ["kader", "agathe", "marc-antoine", "chloe"]
    assert cfg.collaborator("agathe").systemuser_id == NEW_ID and cfg.collaborator("agathe").first_name == "Agathe"
    assert all("estefania" not in m and "agathe" in m for m in cfg.rotation.members.values())
    text, enc = team.read_text(p)
    assert enc == encoding and "commentaire de fin à garder" in text and "Chloé" in text and "estefania" not in text.lower()
    assert "estefania" in team.read_text(backup)[0]
    assert j.setting("rotation:resiliation") == "agathe" and j.setting("rotation:takeover") == "kader"
    assert j.setting("absents") == ["chloe"]


def test_unknown_or_existing_key_changes_nothing(tmp_path):
    p = setup(tmp_path)
    before = p.read_bytes()
    j = Journal(":memory:")
    with pytest.raises(team.TeamError, match="introuvable"):
        team.apply(p, j, "personne", "agathe", "Agathe", NEW_ID)
    with pytest.raises(team.TeamError, match="déjà"):
        team.apply(p, j, "estefania", "kader", "Kader", NEW_ID)
    assert p.read_bytes() == before and list(tmp_path.glob("*.avant-*")) == []


def test_command_reads_the_crm_then_writes_after_confirmation(tmp_path, monkeypatch, capsys):
    from movers_dispatch import cli
    from movers_dispatch.dataverse import DataverseGateway

    p = setup(tmp_path)

    class Gw(DataverseGateway):
        def __init__(self):
            pass

        def find_users(self, first_name):
            return [{"systemuserid": NEW_ID.upper(), "firstname": "Agathe", "lastname": "Exemple", "fullname": "Agathe Exemple",
                     "domainname": "DOMAINE\\agathe.exemple", "isdisabled": False}]

    monkeypatch.setattr(cli, "connect", lambda cfg: (Gw(), None))
    monkeypatch.setattr("builtins.input", lambda prompt="": "n")
    with pytest.raises(SystemExit, match="Rien"):
        cli.main(["collegue", "-c", str(p), "--ancien", "estefania", "--prenom", "Agathe", "--nom", "Exemple"])
    assert config.load(p).collaborator("estefania")
    monkeypatch.setattr("builtins.input", lambda prompt="": "O")
    cli.main(["collegue", "-c", str(p), "--ancien", "Estefania", "--prenom", "Agathe", "--nom", "Exemple"])
    assert config.load(p).collaborator("agathe").systemuser_id == NEW_ID
    assert "C'est fait" in capsys.readouterr().out
