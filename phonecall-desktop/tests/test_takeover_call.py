"""Anonymised real call (contract takeover by the new occupant): text enhancer, team Phone Call filled by
Claude (fake client) and automatic checks. Names, street and phone number are fictitious; the
recognition errors of the original call are kept (numbers dictated in pieces, wrong read-back,
misheard names)."""

import json

from phonecall_desktop.audio.types import Channel
from phonecall_desktop.notes.direct import DirectAINoteClient
from phonecall_desktop.notes.local_summary import transcript_text
from phonecall_desktop.notes.template import CallContext, check, load_template
from phonecall_desktop.notes.template.ai import parse
from phonecall_desktop.stt.base import TranscriptEvent
from phonecall_desktop.transcript.assembler import TranscriptAssembler
from phonecall_desktop.transcript.enhancer import TextEnhancer

from test_direct_note import KEY, FakeMessages, fake_factory, settings

A, R = "mic", "system"
TAKEOVER = [
    (A, "Sector Alarm, télésurveillance, déménagement"),
    (R, "oui bonjour euh j'aimerais transférer le contact d'une personne qui donc moi je suis chez Sector Alarm et il va reprendre mon contrat"),
    (A, "D'accord"),
    (R, "donc j'aimerais vous transmettre son contact afin que vous puissiez le contacter au plus vite parce que du coup il en a besoin là il a emménagé dans la maison"),
    (A, "OK, ça marche, parce qu'attendez là, avec votre numéro de téléphone, j'ai deux comptes clients qui s'affichent"),
    (R, "c'est 12 bis, 12 bis rue des Tieuls avec fait sur main"),
    (A, "OK, on en a deux, du val, Léa"),
    (R, "C'est ça"),
    (A, "Monsieur, pour enlucleriser le système"),
    (A, "et donc faudrait mettre une nouvelle personne, c'est ça ?"),
    (R, "C'est ça"),
    (A, "Ok, je vais prendre le contact, s'il vous plaît."),
    (R, "0649"),
    (R, "98 12"),
    (A, "Oui."),
    (R, "34"),
    (A, "Alors 064, 998, 1234."),
    (R, "06, 39, 98, 12, 34 et c'est Monsieur Garnier, GA, GA RN, IER, comme garnier"),
    (R, "et Bastien son prénom"),
    (A, "Bas tiens, ça marche."),
    (A, "Ce serait pour une reprise à la même adresse ou à une autre."),
    (R, "oui, la même adresse, vous pouvez l'appeler rapidement"),
    (A, "Ça marche, là je demande à ce qu'on l'appelle tout de suite."),
    (R, "OK, magnifique, je vous remercie"),
    (A, "Merci à vous, je vous souhaite une bonne journée."),
    (R, "Bonne journée, au revoir"),
]


def segments():
    asm = TranscriptAssembler(enhancer=TextEnhancer())
    for i, (ch, text) in enumerate(TAKEOVER):
        asm.apply(TranscriptEvent("final", Channel(ch), f"u{i}", i * 4.0, i * 4.0 + 3, text, False))
    return asm.final_segments()


def field(items, evidence, status="present", reason=""):
    return {"status": status, "items": items, "reason": reason, "evidence": evidence}


def claude_output(team, **fields):
    out = {f.id: field([], [], "absent") for f in team.all_fields()}
    out.update(fields)
    return json.dumps({"direction": "entrant", "variant": "movers", "fields": out}, ensure_ascii=False)


def good_fields():
    return dict(
        nom=field(["Léa Duval"], ["S7"], "uncertain", "nom lu par le conseiller à l'écran (« du val, Léa »)"),
        demenagement=field(["Oui, le client a quitté le logement ; le nouvel occupant a déjà emménagé"], ["S2", "S4"]),
        resiliation=field(["Reprise du contrat par le nouvel occupant"], ["S2"]),
        materiel=field(["Installation Sector Alarm en place, reprise par le nouvel occupant"], ["S2"]),
        date_demenagement=field(["Déjà réalisé"], ["S4"]),
        tiers=field(["Bastien Garnier, 06 39 98 12 34"], ["S18", "S19"], "uncertain",
                    "numéro dicté en plusieurs fois (0649…, relecture 064 998 1234)"),
        complements_echanges=field([
            "Le client transmet les coordonnées du nouvel occupant pour qu'il reprenne son contrat au plus vite.",
            "Deux comptes clients sont associés au numéro de téléphone du client.",
            "Adresse concernée : 12 bis rue des Tieuls (nom de rue mal reconnu, à vérifier).",
            "La reprise concerne la même adresse.",
            "Le conseiller a demandé que le repreneur soit rappelé tout de suite.",
        ], ["S2", "S5", "S6", "S22", "S23"]),
    )


def test_enhancer_cleans_the_takeover_call():
    texts = [s.text for s in segments()]
    assert texts[1].startswith("Oui bonjour j'aimerais transférer")  # « euh » removed, capital letter
    assert ["0649", "98 12", "34"] == [texts[12], texts[13], texts[15]]  # pieces of a number: no full stop
    assert texts[17].startswith("06 39 98 12 34 et c'est Monsieur Garnier, GA, GA RN, IER")


def test_team_note_for_the_takeover_call():
    team = load_template()
    messages = FakeMessages(claude_output(team, **good_fields()))
    client = DirectAINoteClient(settings(note_template=None), lambda: KEY, client_factory=fake_factory(messages))
    note = client.generate(segments(), 125, "req-takeover", meta={"variant": "movers"})
    text = note.text
    assert text.startswith("Interlocuteur :\nNom : À confirmer")
    assert "Déménagement : Oui" in text and "Date de déménagement : Déjà réalisé" in text
    assert "Contact Repreneurs : À confirmer" in text and "Bastien Garnier, 06 39 98 12 34" in text
    assert "Offre commercial : Non communiqué" in text and "vente" not in text
    codes = {f["code"]: f for f in note.flags}
    assert not [f for f in note.flags if f["severity"] == "blocking"], note.flags
    assert "0649" in codes["numero_variantes"]["message"]
    system = messages.calls[0]["system"]
    assert "N'attribue jamais une cause" in system and "dicté en plusieurs morceaux" in system


def _check(**changes):
    team = load_template()
    fields = {**good_fields(), **changes}
    note, _ = parse(team, claude_output(team, **fields), CallContext(direction="entrant", variant="movers"), 26)
    return {f["code"] for f in check(note, transcript_text(segments()))}


def test_wrong_phone_number_is_blocking():
    assert "numero_non_trouve" in _check(tiers=field(["Bastien Garnier, 06 39 98 12 43"], ["S18"]))


def test_number_only_given_in_pieces_is_a_warning():
    codes = _check(tiers=field(["Bastien Garnier, 06 49 98 12 34"], ["S13"]))
    assert "numero_non_trouve" not in codes and "chiffre_non_trouve" not in codes


def test_moving_no_with_a_moving_date_is_inconsistent():
    assert "incoherence" in _check(demenagement=field(["Non"], ["S2"]))

