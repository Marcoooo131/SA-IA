from __future__ import annotations

import pytest

from sms_reminders.db import session_scope
from sms_reminders.models import TemplateSlot
from sms_reminders.policy import load_policy
from sms_reminders.template_admin import TemplateError, activate, save_version
from sms_reminders.templating import render, segment_info, validate


def test_segments_gsm_and_ucs2():
    assert segment_info("a" * 160).segments == 1
    assert segment_info("a" * 161).segments == 2
    assert segment_info("a" * 306).segments == 2 and segment_info("a" * 307).segments == 3
    assert segment_info("é" * 160).encoding == "GSM-7"  # é is in the GSM alphabet
    info = segment_info("€" * 80)  # extension character counts double
    assert info.units == 160 and info.segments == 1
    ucs = segment_info("ê" * 70)  # ê is not GSM-7
    assert ucs.encoding == "UCS-2" and ucs.segments == 1 and "ê" in ucs.non_gsm
    assert segment_info("ê" * 71).segments == 2
    assert segment_info("").segments == 0


def test_validation():
    assert validate("", 3) == ["Le texte est vide."]
    assert any("inconnues" in e for e in validate("Bonjour {{prénom}}", 3))
    assert any("Accolades" in e for e in validate("Bonjour {{prenom}", 3))
    assert any("trop long" in e for e in validate("x" * 500, 3))
    assert validate("Bonjour {{prenom}} {{ nom }}, RDV {{service}} le {{date_rendez_vous}} à {{heure_rendez_vous}}.", 3) == []


def test_render_and_missing_values():
    r = render("Bonjour {{prenom}}, dossier {{numero_client}}", {"prenom": "Marie", "numero_client": ""})
    assert r.text.startswith("Bonjour Marie") and r.missing == ["numero_client"]
    # The customer number appears only when the template asks for it.
    assert "CLI" not in render("Bonjour {{prenom}}", {"prenom": "Marie", "numero_client": "CLI-1"}).text


def test_versions_are_immutable(env):
    with session_scope() as s:
        slot = s.query(TemplateSlot).filter_by(service="movers", step="j2").one()
        policy = load_policy(s)
        v1 = save_version(s, slot, "Bonjour {{prenom}}", actor="ada")
        activate(s, slot, v1, actor="ada", policy=policy)
        same = save_version(s, slot, "Bonjour {{prenom}}", actor="ada")
        assert same.id == v1.id
        v2 = save_version(s, slot, "Bonsoir {{prenom}}", actor="ada")
        assert v2.version == 2 and v1.body == "Bonjour {{prenom}}"
        assert slot.active_version_id == v1.id  # saving never activates
        bad = save_version(s, slot, "Bonjour {{inconnue}}", actor="ada")
        with pytest.raises(TemplateError):
            activate(s, slot, bad, actor="ada", policy=policy)
        with pytest.raises(TemplateError):
            save_version(s, slot, "   ", actor="ada")
