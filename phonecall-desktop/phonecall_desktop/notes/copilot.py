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
from .template import CallContext, FieldSpec, Template, section_heading

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
    title = (f"{t.title} — {kind}" if kind else t.title) if t.title else ""

    type_label = " — ".join(x for x in (t.directions.get(probe.direction or "", "sens de l'appel non identifié"),
                                        t.variant_label(probe.variant)) if x)
    prefilled = {}
    if probe.type_source == "choisi par le conseiller":
        prefilled["type_appel"] = f"{type_label} (choisi par le conseiller)"
    prefilled["date_heure"] = f"{_when(ctx)} (horloge du poste)" if _when(ctx) else t.absent
    if ctx.agent_name.strip():
        prefilled["agent"] = ctx.agent_name.strip()
    prefilled = {k: v for k, v in prefilled.items() if any(f.id == k for f in fields)}

    skeleton = [title] if title else []
    for section in t.sections:
        visible = [f for f in section.fields if f in fields]
        if visible:
            if skeleton and t.blank_lines:
                skeleton.append("")
            skeleton.append(section_heading(t, section))
            for f in visible:
                skeleton.append(f"[lignes libres : {f.help or f.label}]" if f.bare
                                else f"{f.label} : {prefilled.get(f.id, '')}".rstrip())
    several = ("plusieurs éléments sur la même ligne, séparés par « ; »" if t.list_style == "inline"
               else "pour plusieurs éléments, « Intitulé : » puis une ligne par élément commençant par « - »")

    lines = [
        "Tu rédiges le compte rendu d'un appel téléphonique du service client de Sector Alarm (Phone Call), "
        "à partir de la transcription complète ci-dessous, pour qu'il soit copié dans le CRM.",
        "",
        "Règles absolues :",
        "- Réponds UNIQUEMENT avec le compte rendu rempli, en texte simple : pas d'introduction, pas de conclusion, "
        "pas de tableau, pas de gras, pas de Markdown.",
        "- Garde exactement les titres et les intitulés du modèle, dans le même ordre : une ligne « Intitulé : valeur » "
        f"par champ ({several}). Remplace chaque « [lignes libres : ...] » par une information par ligne, sans "
        "intitulé ni tiret.",
        f"- Chaque champ reçoit une valeur. Information absente de la conversation : écris exactement « {t.absent} ».",
        f"- Information évoquée mais incertaine : « {t.uncertain} — raison : valeur ». Informations contradictoires : "
        + ("« Contradiction à vérifier : version 1 / version 2 », sans choisir. " if t.list_style == "inline" else
           "« Contradiction à vérifier », puis chaque version sur une ligne « - », sans choisir. ")
        + f"Champ réellement sans objet pour cet appel : « {t.not_applicable} — raison ».",
        "- N'invente rien et ne complète jamais avec ce qui serait habituel ou probable.",
        f"- Nom, numéro de téléphone et numéro WO entendus dans la conversation : « {t.uncertain} — entendu dans la "
        "conversation : valeur ».",
        "- Les valeurs déjà écrites dans le modèle viennent du poste du conseiller (source fiable) : recopie-les sans "
        "les modifier.",
        "- Distingue ce qui a été fait pendant l'appel, ce qui a seulement été proposé et ce qui reste à faire (avec "
        "qui s'en charge : conseiller, client, technicien, service).",
        "- Rédige des phrases courtes et factuelles, comme dans l'exemple : reformule fidèlement, sans citer la "
        "transcription mot pour mot. Garde toutes les informations utiles au dossier.",
        "- La transcription peut contenir des erreurs de reconnaissance (mots mal entendus, phrases coupées, "
        "« Sector Alarm » répété sans raison) : ne t'appuie que sur ce qui est clair ; sinon « À confirmer ».",
    ]
    if probe.type_source != "choisi par le conseiller":
        lines.append(f"- Type d'appel : détermine-le d'après la conversation (proposition automatique : {type_label}) "
                     f"et écris « {t.uncertain} — déterminé d'après la conversation : ... ».")
    lines += ["", "Contenu attendu par champ :"]
    lines += [f"- {f.label}{' (lignes libres)' if f.bare else ''} : {f.help}" for f in fields
              if f.help and f.id not in prefilled]
    if t.example:
        lines += ["", "Exemple de Phone Call attendu (forme à reproduire ; il concerne un autre appel : n'en reprends "
                  "aucune information) :", "---", t.example, "---"]
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

    # Locate each expected field: « Label : value » + its bullets (fields without label: free lines)
    labels = {f.label: f for f in prompt.fields if not f.bare}
    headings = [section_heading(t, s) for s in t.sections if any(f in prompt.fields for f in s.fields)]
    missing_sections = [h for h in headings if not any(line.strip().lower() == h.strip().lower() for line in lines)]
    if missing_sections:
        flags.append(_flag("rubriques_manquantes", "warning", "Rubriques absentes : " + ", ".join(missing_sections)))
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
        if not value or (not bullets and head != t.absent and VAGUE.match(head)):
            lines[i] = f"{spec.label} : {t.absent}"
            normalised += 1
            continue
        if value.startswith(t.uncertain) or value.startswith("Contradiction"):
            points.append(f"{label} : {value[:140]}")
        if spec.id in UNRELIABLE and not value.startswith((t.uncertain, t.absent, "Contradiction")):
            points.append(f"{label} : entendu dans la conversation, à confirmer")
        if spec.id == "actions_effectuees":
            for item in bullets or [head]:
                low = item.lower()
                if any(w in low for w in PROPOSAL) and not any(w in low for w in DONE) and t.absent not in item:
                    flags.append(_flag("action_non_effectuee", "blocking",
                                       f"Actions réellement effectuées : « {item[:80]} » ressemble à une proposition ou à "
                                       "une action future."))
    # Every line, with or without label: quotes and figures must come from the call or the PC
    for line in lines:
        where = line.split(" :", 1)[0][:40] if " :" in line else line[:40]
        for q in re.findall(r"« (.+?) »", line):
            if len(q) > 12 and q.rstrip("…").strip() not in flat_transcript:
                flags.append(_flag("citation_introuvable", "warning", f"{where} : citation absente de la transcription ({q[:60]})."))
        unknown = sorted(n for n in _numbers(line) if len(n) > 1 and n not in source_numbers)
        if unknown:
            flags.append(_flag("chiffre_non_trouve", "blocking",
                               f"« {where}… » : {', '.join(unknown)} ne figure ni dans la conversation ni dans les informations du poste."))
    if normalised:
        flags.append(_flag("absents_normalises", "info", f"{normalised} champ(s) vide(s) ou imprécis remplacé(s) par « {t.absent} »."))
    steps = [label for label, f in labels.items() if f.id in ("rendez_vous", "actions_restantes", "echeance")]
    if steps and all(t.absent in lines[starts[s]] for s in steps if s in starts) and all(s in starts for s in steps):
        flags.append(_flag("pas_de_suite", "warning", "Aucune prochaine étape identifiée."))
    return "\n".join(lines), flags, points


def _flag(code: str, severity: str, message: str) -> dict:
    return {"code": code, "severity": severity, "message": message}
