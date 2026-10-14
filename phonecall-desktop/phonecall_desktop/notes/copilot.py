"""Note written with Microsoft 365 Copilot Chat (work account), by copy and paste.

Copilot Chat has no official programmatic access, and driving its web page in place of the user
would be a workaround: the advisor stays in the loop.
1. ``build_prompt``: instructions + the Phone Call template to fill (from ``phone_call_template.yaml``,
   with the PC data already written) + the transcript, copied to the clipboard; Copilot Chat opens in
   the default browser (signed in with the work account: enterprise data protection).
2. The advisor pastes Copilot's answer back; ``check_answer`` normalises it and runs the automatic
   check (missing fields, figures and quotes absent from the transcript, actions done vs proposed...).
The transcript is never put in a URL (it would stay in the browser history).
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from ..transcript.assembler import Segment
from .business import Category
from .template import CallContext, FieldSpec, Template

SPEAKERS = {"advisor": "Conseiller", "remote": "Interlocuteur"}
VAGUE = re.compile(r"^(?:n/?a|na|-|—|aucune?|néant|neant|non précisé(?:e)?|non renseigné(?:e)?|non communiqué(?:e)?|"
                   r"inconnu(?:e)?|rien|aucune information|pas d'information|non mentionné(?:e)?|non indiqué(?:e)?)\.?$",
                   re.IGNORECASE)
PROPOSAL = ("je vous propose", "je peux vous proposer", "proposé", "propose", "pourrait", "on pourrait", "sera ",
            "va être", "à faire", "prévu", "prévoit")
DONE = ("j'ai ", "a été", "effectué", "envoyé", "enregistré", "appliqué", "c'est fait", "c'est noté")
UNRELIABLE = ("nom", "telephone", "numero_wo")


@dataclass
class CopilotPrompt:
    text: str
    fields: list[FieldSpec]  # fields expected in the answer (visible for this call)
    title: str
    prefilled: dict[str, str]  # field id -> value given by the PC


def _when(ctx: CallContext) -> str | None:
    import time

    return time.strftime("%d/%m/%Y à %H:%M", time.localtime(ctx.started_at)) if ctx.started_at else None


def build_prompt(t: Template, segments: list[Segment], ctx: CallContext, categories: list[Category]) -> CopilotPrompt:
    from .local_summary import split_sentences
    from .template.rules import RuleFiller

    # Which conditional fields apply: type chosen by the advisor, otherwise detected on the transcript
    probe = RuleFiller(t, split_sentences(segments), categories, ctx)
    tags = {x for x in (probe.direction, probe.variant) if x}
    fields = [f for f in t.all_fields() if f.visible(tags)]
    kind = " · ".join(x for x in (t.variant_label(probe.variant), t.directions.get(probe.direction or "", "")) if x)
    title = f"{t.title} — {kind}" if kind else t.title

    type_label = " — ".join(x for x in (t.directions.get(probe.direction or "", "sens de l'appel non identifié"),
                                        t.variant_label(probe.variant)) if x)
    prefilled = {}
    if probe.type_source == "choisi par le conseiller":
        prefilled["type_appel"] = f"{type_label} (choisi par le conseiller)"
    prefilled["date_heure"] = f"{_when(ctx)} (horloge du poste)" if _when(ctx) else t.absent
    if ctx.agent_name.strip():
        prefilled["agent"] = f"{ctx.agent_name.strip()} (paramètre du poste)"

    skeleton = [title]
    for section in t.sections:
        visible = [f for f in section.fields if f in fields]
        if visible:
            skeleton += ["", section.title.upper()]
            skeleton += [f"{f.label} : {prefilled.get(f.id, '')}".rstrip() for f in visible]

    lines = [
        "Tu rédiges le compte rendu d'un appel téléphonique du service client de Sector Alarm (Phone Call), "
        "à partir de la transcription complète ci-dessous, pour qu'il soit copié dans le CRM.",
        "",
        "Règles absolues :",
        "- Réponds UNIQUEMENT avec le compte rendu rempli, en texte simple : pas d'introduction, pas de conclusion, "
        "pas de tableau, pas de gras, pas de Markdown.",
        "- Garde exactement les titres et les intitulés du modèle, dans le même ordre : une ligne « Intitulé : valeur » "
        "par champ ; pour plusieurs éléments, écris « Intitulé : » puis une ligne par élément commençant par « - ».",
        f"- Chaque champ reçoit une valeur. Information absente de la conversation : écris exactement « {t.absent} ».",
        f"- Information évoquée mais incertaine : « {t.uncertain} — raison : valeur ». Informations contradictoires : "
        "« Contradiction à vérifier », puis chaque version sur une ligne « - », sans choisir. Champ réellement sans "
        f"objet pour cet appel : « {t.not_applicable} — raison ».",
        "- N'invente rien et ne complète jamais avec ce qui serait habituel ou probable.",
        f"- Nom, numéro de téléphone et numéro WO entendus dans la conversation : « {t.uncertain} — entendu dans la "
        "conversation : valeur ».",
        "- Les valeurs déjà écrites dans le modèle viennent du poste du conseiller (source fiable) : recopie-les sans "
        "les modifier. La date et l'heure de l'appel ne viennent jamais de la conversation.",
        "- « Actions réellement effectuées » : seulement ce qui a été fait pendant l'appel. Une proposition va dans "
        "« Solutions proposées » ; une action à faire va dans « Actions restantes (responsable) » avec son "
        "responsable (conseiller, client, technicien, service) ou « responsable non identifié ».",
        "- Sois concis mais complet : garde toutes les informations utiles au dossier ; cite entre « » les mots exacts "
        "du client quand ils comptent (montants, refus, dates).",
    ]
    if probe.type_source != "choisi par le conseiller":
        lines.append(f"- Type d'appel : détermine-le d'après la conversation (proposition automatique : {type_label}) "
                     f"et écris « {t.uncertain} — déterminé d'après la conversation : ... ».")
    lines += ["", "Contenu attendu par champ :"]
    lines += [f"- {f.label} : {f.help}" for f in fields if f.help and f.id not in prefilled]
    lines += ["", "Modèle à remplir :", "", *skeleton, "", "Transcription (Conseiller = micro du conseiller, "
              "Interlocuteur = son du PC ; [incertain] = passage mal compris) :"]
    for s in segments:
        ts = f"{int(s.t_start // 60):02d}:{int(s.t_start % 60):02d}"
        lines.append(f"[{ts}] {SPEAKERS.get(s.speaker, s.speaker)}{' [incertain]' if s.uncertain else ''} : {s.text.strip()}")
    return CopilotPrompt("\n".join(lines), fields, title, prefilled)


# ---------------------------------------------------------------- answer pasted back


def _strip_markdown(text: str) -> str:
    out = []
    for line in text.replace("\r\n", "\n").split("\n"):
        line = re.sub(r"\*\*|__|`", "", line).rstrip()
        line = re.sub(r"^#{1,6}\s*", "", line)
        line = re.sub(r"^\s*[*•·]\s+", "- ", line)
        line = re.sub(r"^\s+-\s+", "- ", line)
        out.append(line)
    return "\n".join(out).strip()


def _numbers(text: str) -> set[str]:
    return {re.sub(r"\D", "", m) for m in re.findall(r"\d(?:[\d .-]*\d)?", text)}


def check_answer(t: Template, prompt: CopilotPrompt, answer: str, transcript: str,
                 metadata: str) -> tuple[str, list[dict], list[str]]:
    """Returns (normalised note, flags, points to verify). The advisor keeps the last word."""
    text = _strip_markdown(answer)
    lines = text.split("\n")
    flags: list[dict] = [{"code": "copilot", "severity": "warning",
                          "message": "Note rédigée par Copilot puis vérifiée par l'application : relisez-la avant de "
                                     "la coller dans le CRM."}]
    points: list[str] = []
    if not text:
        return text, flags + [_flag("reponse_vide", "blocking", "La réponse collée est vide.")], points

    # Locate each expected field: « Label : value » + its bullets
    labels = {f.label: f for f in prompt.fields}
    starts = {}
    for i, line in enumerate(lines):
        for label in labels:
            if re.match(rf"^{re.escape(label)}\s*:", line, re.IGNORECASE) and label not in starts:
                starts[label] = i
    missing = [label for label in labels if label not in starts]
    if missing:
        flags.append(_flag("champs_manquants", "blocking", "Champs absents de la réponse de Copilot : " + ", ".join(missing)))

    normalised = 0
    source_numbers = _numbers(transcript) | _numbers(metadata)
    flat_transcript = re.sub(r"\s+", " ", transcript)
    for label, i in starts.items():
        spec = labels[label]
        head = lines[i].split(":", 1)[1].strip()
        bullets = []
        for nxt in lines[i + 1:]:
            if not nxt.startswith("- "):
                break
            bullets.append(nxt[2:].strip())
        value = " ".join([head, *bullets]).strip()
        if spec.id in prompt.prefilled and prompt.prefilled[spec.id] not in lines[i]:
            lines[i] = f"{spec.label} : {prompt.prefilled[spec.id]}"  # data of the PC is authoritative
            flags.append(_flag("valeur_poste_restauree", "warning", f"{label} : valeur du poste rétablie."))
            continue
        if not value or (not bullets and VAGUE.match(head)):
            lines[i] = f"{spec.label} : {t.absent}"
            normalised += 1
            continue
        if value.startswith(t.uncertain) or value.startswith("Contradiction"):
            points.append(f"{label} : {value[:140]}")
        if spec.id in UNRELIABLE and not value.startswith((t.uncertain, t.absent, "Contradiction")):
            points.append(f"{label} : entendu dans la conversation, à confirmer")
        for q in re.findall(r"« (.+?) »", value):
            if len(q) > 12 and q.rstrip("…").strip() not in flat_transcript:
                flags.append(_flag("citation_introuvable", "warning", f"{label} : citation absente de la transcription ({q[:60]})."))
        unknown = sorted(n for n in _numbers(value) if len(n) > 1 and n not in source_numbers)
        if unknown:
            flags.append(_flag("chiffre_non_trouve", "blocking",
                               f"{label} : {', '.join(unknown)} ne figure ni dans la conversation ni dans les informations du poste."))
        if spec.id == "actions_effectuees":
            for item in bullets or [head]:
                low = item.lower()
                if any(w in low for w in PROPOSAL) and not any(w in low for w in DONE) and t.absent not in item:
                    flags.append(_flag("action_non_effectuee", "blocking",
                                       f"Actions réellement effectuées : « {item[:80]} » ressemble à une proposition ou à "
                                       "une action future."))
    if normalised:
        flags.append(_flag("absents_normalises", "info", f"{normalised} champ(s) vide(s) ou imprécis remplacé(s) par « {t.absent} »."))
    steps = [label for label, f in labels.items() if f.id in ("rendez_vous", "actions_restantes", "echeance")]
    if steps and all(t.absent in lines[starts[s]] for s in steps if s in starts) and all(s in starts for s in steps):
        flags.append(_flag("pas_de_suite", "warning", "Aucune prochaine étape identifiée."))
    return "\n".join(lines), flags, points


def _flag(code: str, severity: str, message: str) -> dict:
    return {"code": code, "severity": severity, "message": message}
