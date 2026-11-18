"""Règles pures du module appels manqués : numéros, segments SMS, moteur de décision (sans base)."""
from dataclasses import replace
from datetime import datetime, time
from zoneinfo import ZoneInfo

import pytest

from venio.telephony import phone, sms
from venio.telephony.rules import Facts, MissedCallConfig, decide, next_window_start

PARIS = ZoneInfo("Europe/Paris")
NO_HOLIDAY = lambda d: False  # noqa: E731


@pytest.mark.parametrize("raw,expected", [
    ("06 12 34 56 78", "+33612345678"), ("+33 6 12 34 56 78", "+33612345678"), ("0033612345678", "+33612345678"),
    ("06.12.34.56.78", "+33612345678"), ("+33 0612345678", "+33612345678"), ("01 23 45 67 89", "+33123456789"),
    ("anonymous", None), ("Restricted", None), ("+266696687", None), ("", None), (None, None), ("12", None),
])
def test_normalize(raw, expected):
    assert phone.normalize(raw) == expected


def test_mobile_and_mask():
    assert phone.is_fr_mobile("+33612345678") and phone.is_fr_mobile("+33712345678")
    assert not phone.is_fr_mobile("+33123456789") and not phone.is_fr_mobile("+32470123456") and not phone.is_fr_mobile(None)
    assert phone.mask("+33612345678") == "06 •• •• 56 78"
    assert phone.display("+33612345678") == "06 12 34 56 78"


def test_sms_segments():
    assert sms.segments("a" * 160) == {"length": 160, "encoding": "GSM-7", "segments": 1, "costly_chars": []}
    assert sms.segments("a" * 161)["segments"] == 2
    assert sms.segments("é è à ù É ' :")["encoding"] == "GSM-7"     # accents de base : gratuits
    s = sms.segments("À bientôt")
    assert s["encoding"] == "UCS-2" and set(s["costly_chars"]) == {"À", "ô"}
    assert sms.segments("x" * 71 + "ô")["segments"] == 2
    assert sms.segments("€" * 80)["segments"] == 1                   # caractère étendu compté double : 160
    assert sms.segments("€" * 81)["segments"] == 2
    # L'exemple du cahier des charges coûte 4 SMS, nos modèles un seul (05 §A.7).
    example = ("Bonjour, nous avons tenté de répondre à votre appel, mais nous n'avons malheureusement pas pu vous "
               "joindre. Pour faciliter votre demande, vous pouvez nous expliquer votre besoin et réserver directement "
               "votre rendez-vous ici : https://vnio.fr/c/Ab3dEf9h. À bientôt !")
    assert sms.segments(example)["segments"] == 4
    for tone, t in sms.TEMPLATES.items():
        text = sms.render(t["text"], "Renovation Dupo", "https://vnio.fr/c/Ab3dEf9h", "STOP au 36173")
        assert sms.segments(text)["segments"] == 1, tone


def _facts(**kw) -> Facts:
    now = datetime(2026, 11, 18, 10, 0, tzinfo=PARIS)  # mercredi
    base = Facts(enabled=True, line_active=True, outcome="missed", from_number="+33612345678", is_mobile=True,
                 excluded=False, opted_out=False, sent_in_burst_window=0, sent_30d=0, called_back=False,
                 recent_request=False, has_page=True, local_now=now, call_ended_local=now, credits_needed=1,
                 credits_left=10, sent_today=0, daily_limit=200, config=MissedCallConfig())
    return replace(base, **kw)


@pytest.mark.parametrize("override,reason", [
    ({}, "sent"),
    ({"enabled": False}, "disabled"),
    ({"line_active": False}, "line_paused"),
    ({"outcome": "answered"}, "call_answered"),
    ({"outcome": "transferred"}, "call_answered"),
    ({"outcome": "pending"}, "call_uncertain"),
    ({"from_number": None, "is_mobile": False}, "masked"),
    ({"is_mobile": False}, "not_mobile"),
    ({"excluded": True}, "excluded"),
    ({"opted_out": True}, "opted_out"),
    ({"sent_in_burst_window": 1}, "burst"),
    ({"sent_30d": 3}, "cap"),
    ({"called_back": True}, "called_back"),
    ({"recent_request": True}, "recent_request"),
    ({"has_page": False}, "no_page"),
    ({"sent_today": 200}, "daily_safety"),
    ({"credits_left": 0}, "quota"),
])
def test_each_rule(override, reason):
    assert decide(_facts(**override), NO_HOLIDAY).reason == reason


def test_rule_order_first_blocking_rule_wins():
    # Numéro masqué ET module désactivé : c'est la première règle (désactivé) qui est retenue.
    assert decide(_facts(enabled=False, from_number=None), NO_HOLIDAY).reason == "disabled"
    assert decide(_facts(excluded=True, credits_left=0), NO_HOLIDAY).reason == "excluded"


def test_out_of_hours_defers_to_next_opening_or_skips():
    evening = datetime(2026, 11, 18, 22, 15, tzinfo=PARIS)
    d = decide(_facts(local_now=evening, call_ended_local=evening), NO_HOLIDAY)
    assert d.action == "defer" and d.run_at_local == datetime(2026, 11, 19, 8, 0, tzinfo=PARIS)
    # Samedi soir → lundi 8 h : plus de 12 h d'attente → pas d'envoi.
    saturday = datetime(2026, 11, 21, 20, 30, tzinfo=PARIS)
    assert decide(_facts(local_now=saturday, call_ended_local=saturday), NO_HOLIDAY).reason == "outside_hours_late"
    # Réglage « ne pas différer ».
    cfg = MissedCallConfig(out_of_hours="skip")
    assert decide(_facts(local_now=evening, call_ended_local=evening, config=cfg), NO_HOLIDAY).reason == "outside_hours_late"
    # Jour férié : on saute au lendemain.
    holiday = lambda d: d.isoformat() == "2026-11-19"  # noqa: E731
    assert next_window_start(evening, MissedCallConfig(), holiday) == datetime(2026, 11, 20, 8, 0, tzinfo=PARIS)


def test_config_bounds():
    with pytest.raises(ValueError):
        MissedCallConfig(send_start=time(7, 0))
    with pytest.raises(ValueError):
        MissedCallConfig(send_end=time(22, 0))
    with pytest.raises(ValueError):
        MissedCallConfig(tone="personnalise", custom_text="Sans lien")
    with pytest.raises(ValueError):
        MissedCallConfig(send_days=[0])
    with pytest.raises(ValueError):
        MissedCallConfig(sender="Trop-long-expediteur")
    assert MissedCallConfig(tone="personnalise", custom_text="Rappel : {lien}").template_text() == "Rappel : {lien}"
