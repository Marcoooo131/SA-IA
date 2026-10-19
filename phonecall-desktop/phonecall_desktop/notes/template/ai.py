"""Fills the Phone Call template with Claude (structured output), from the whole transcript.

The prompt and the JSON schema are generated from the template configuration: adding or renaming a
field in ``phone_call_template.yaml`` changes what Claude fills, without touching this code.
Data from the PC (clock, advisor name, call type chosen) always overrides the model, and the
result goes through the same automatic check as the note without AI.
"""

from __future__ import annotations

import json
import time

from ...transcript.assembler import Segment
from . import STATUSES, CallContext, FieldValue, FilledNote, Template

SPEAKERS = {"advisor": "conseiller", "remote": "interlocuteur"}
STATUS_HELP = {
    "present": "information dite dans la conversation (ou donnée par les métadonnées du poste)",
    "absent": "information absente de la conversation et des métadonnées",
    "uncertain": "information évoquée mais incertaine (mal comprise, hésitante, non vérifiable) : préciser la raison",
    "contradictory": "plusieurs versions incompatibles : les mettre toutes dans items, sans choisir",
    "not_applicable": "le champ ne concerne réellement pas cet appel : préciser la raison",
}


def system_prompt(t: Template) -> str:
    lines = [
        "Tu remplis le compte rendu d'un appel téléphonique du service client de Sector Alarm, à partir de la "
        "transcription COMPLÈTE de l'appel, pour qu'il soit copié dans le CRM par le conseiller.",
        "",
        "Règles absolues :",
        f"- Chaque champ reçoit un statut parmi : {', '.join(f'{k} ({v})' for k, v in STATUS_HELP.items())}.",
        f"- Pour une information absente : status \"absent\" et items vide (le texte « {t.absent} » est ajouté par "
        "l'application). Ne confonds pas absent, incertain, contradictoire et non applicable.",
        "- N'invente rien et ne complète jamais un champ avec ce qui serait habituel ou probable.",
        "- Le nom du client, le numéro de téléphone, le nom de l'agent, la date de l'appel et les références de "
        "dossier (WO) entendus dans la transcription ne sont pas fiables : status \"uncertain\" avec la raison, "
        "sauf s'ils figurent dans les métadonnées autorisées.",
        "- La date et l'heure de l'appel viennent UNIQUEMENT des métadonnées.",
        "- « Actions réellement effectuées » : seulement ce qui a été fait pendant l'appel ; une proposition ou une "
        "action future va dans « Solutions proposées » ou « Actions restantes ».",
        "- Pour chaque action restante, indique le responsable s'il est identifié (conseiller, client, technicien, "
        "service), sinon « responsable non identifié ».",
        "- Contradiction : status \"contradictory\", chaque version dans items, sans arbitrer.",
        "- Maximise les informations fiables et exploitables : sois concis mais complet, un élément par item, en "
        "reformulant fidèlement ; cite entre « » les mots exacts du client quand ils comptent (montants, refus...).",
        "- evidence : identifiants des segments qui justifient le champ (ex. [\"S3\", \"S4\"]), vide si absent.",
        "- direction : entrant ou sortant d'après la conversation (inconnu si on ne peut pas savoir) ; "
        f"variant parmi {', '.join(t.call_types)} : "
        + "; ".join(f"{k} = {v.get('label', k)}" for k, v in t.call_types.items()) + ".",
        "",
        "Transcription automatique et cohérence :",
        "- Les noms propres, les rues et les mots rares sont souvent mal reconnus (« Bas tiens » pour « Bastien », un "
        "nom épelé lettre par lettre). Restitue la forme la plus probable seulement si le contexte la rend évidente "
        "(épellation, répétition, nom repris par l'autre locuteur), avec status \"uncertain\" ; ne reconstruis jamais "
        "un mot incompréhensible.",
        "- Un numéro de téléphone peut être dicté en plusieurs morceaux, répété ou relu par le conseiller : reprends la "
        "version complète la plus explicite au format 06 12 34 56 78 ; si les chiffres diffèrent d'une dictée ou d'une "
        "relecture à l'autre, status \"uncertain\" avec les variantes entendues dans reason.",
        "- N'attribue jamais une cause qui n'est pas dite : une reprise de contrat par un nouvel occupant n'implique ni "
        "vente, ni location, ni décès, sauf si c'est prononcé.",
        "- Une demande du client n'est jamais une offre commerciale : l'offre est ce que PROPOSE le conseiller.",
        "- Ce que le conseiller fait pendant l'appel (« je demande à ce qu'on le rappelle tout de suite », « c'est "
        "noté ») est une action réalisée.",
        "- Les champs sont cohérents entre eux : si le client a quitté le logement ou si un nouvel occupant a emménagé, "
        "Déménagement = « Oui » et la date ou « Déjà réalisé » va dans la date de déménagement.",
        "- Les noms lus par le conseiller à l'écran (comptes trouvés dans le système) ne sont pas forcément ceux de "
        "l'interlocuteur : status \"uncertain\".",
        "- Coordonnées d'un repreneur (nom, téléphone) : à reporter dans le champ des repreneurs ; l'adresse concernée "
        "va dans les informations complémentaires.",
        "- Rien d'utile ne doit être perdu : toute information qui n'a pas de champ dédié va dans les informations "
        "complémentaires, une par élément, sans répéter les autres champs.",
        "",
        "- Rédige des éléments courts et factuels, comme dans l'exemple ci-dessous s'il y en a un.",
        "",
        "Champs (id — intitulé — consigne ; les champs « si … » ne concernent que ces types d'appel, sinon "
        "status \"not_applicable\") :",
    ]
    for section in t.sections:
        lines.append(f"{section.title}")
        for f in section.fields:
            cond = f" (si {', '.join(sorted(f.when))})" if f.when else ""
            cond += f" (jamais si {', '.join(sorted(f.unless))})" if f.unless else ""
            lines.append(f"- {f.id} — {f.label}{cond} — {f.help or 'information correspondante'}"
                         + (" (plusieurs éléments possibles)" if f.multi else ""))
    if t.example:
        lines += ["", "Exemple de compte rendu attendu (forme seulement ; il concerne un autre appel) :", t.example]
    return "\n".join(lines)


def output_schema(t: Template) -> dict:
    def field_schema() -> dict:
        return {
            "type": "object", "additionalProperties": False, "required": ["status", "items", "reason", "evidence"],
            "properties": {
                "status": {"type": "string", "enum": list(STATUSES)},
                "items": {"type": "array", "items": {"type": "string"}},
                "reason": {"type": "string"},
                "evidence": {"type": "array", "items": {"type": "string"}},
            },
        }

    ids = [f.id for f in t.all_fields()]
    return {
        "type": "object", "additionalProperties": False, "required": ["direction", "variant", "fields"],
        "properties": {
            "direction": {"type": "string", "enum": ["entrant", "sortant", "inconnu"]},
            "variant": {"type": "string", "enum": list(t.call_types) or ["autre"]},
            "fields": {"type": "object", "additionalProperties": False, "required": ids,
                       "properties": {i: field_schema() for i in ids}},
        },
    }


def metadata_lines(t: Template, ctx: CallContext) -> list[str]:
    lines = []
    if ctx.started_at:
        lines.append(f"- date et heure de l'appel (horloge du poste) : {time.strftime('%d/%m/%Y à %H:%M', time.localtime(ctx.started_at))}")
    if ctx.duration_s:
        lines.append(f"- durée de la capture : {ctx.duration_s} s")
    if ctx.agent_name.strip():
        lines.append(f"- agent (paramètre du poste) : {ctx.agent_name.strip()}")
    if ctx.direction:
        lines.append(f"- sens de l'appel choisi par le conseiller : {ctx.direction}")
    if ctx.variant:
        lines.append(f"- type d'appel choisi par le conseiller : {t.variant_label(ctx.variant)}")
    return lines or ["- (aucune)"]


def user_message(t: Template, segments: list[Segment], ctx: CallContext) -> str:
    transcript = []
    for i, s in enumerate(segments, start=1):
        ts = f"{int(s.t_start // 60):02d}:{int(s.t_start % 60):02d}"
        flag = " [passage incertain]" if s.uncertain else ""
        transcript.append(f"[S{i}] [{ts}] [{SPEAKERS.get(s.speaker, s.speaker)}]{flag} {s.text}")
    return ("Métadonnées autorisées (source fiable, distincte de la conversation) :\n" + "\n".join(metadata_lines(t, ctx))
            + "\n\nLocuteurs : identifiés par la source audio (micro = conseiller, son du PC = interlocuteur).\n\n"
            + "<transcription>\n" + "\n".join(transcript) + "\n</transcription>\n\nRemplis le compte rendu.")


def parse(t: Template, raw: str, ctx: CallContext, n_segments: int) -> tuple[FilledNote, list[dict]]:
    """Strict reading of the model output, then data of the PC applied on top. Raises ValueError."""
    data = json.loads(raw)
    direction = ctx.direction or (data.get("direction") if data.get("direction") in ("entrant", "sortant") else None)
    variant = ctx.variant or (data.get("variant") if data.get("variant") in t.call_types else "autre")
    chosen = ctx.direction is not None and ctx.variant is not None
    flags, values = [], {}
    valid_ids = {f"S{i}" for i in range(1, n_segments + 1)}
    for spec in t.all_fields():
        raw_value = (data.get("fields") or {}).get(spec.id)
        if not isinstance(raw_value, dict) or raw_value.get("status") not in STATUSES:
            continue  # reported as missing by the check
        evidence = [str(e) for e in raw_value.get("evidence") or []]
        unknown = [e for e in evidence if e not in valid_ids]
        if unknown:
            flags.append({"code": "preuve_inconnue", "severity": "warning",
                          "message": f"{spec.label} : segments cités inexistants ({', '.join(unknown)})."})
        values[spec.id] = FieldValue(raw_value["status"], [str(i) for i in raw_value.get("items") or []],
                                     str(raw_value.get("reason") or ""), "claude", evidence)
    # Authorised metadata of the PC: always preferred to the model
    when = time.strftime("%d/%m/%Y à %H:%M", time.localtime(ctx.started_at)) if ctx.started_at else None
    values["date_heure"] = (FieldValue("present", [f"{when} (horloge du poste)"], source="poste") if when
                            else FieldValue.absent())
    if ctx.agent_name.strip():
        values["agent"] = FieldValue("present", [f"{ctx.agent_name.strip()} (paramètre du poste)"], source="poste")
    label = " — ".join(x for x in (t.directions.get(direction or "", "sens de l'appel non identifié"),
                                    t.variant_label(variant)) if x)
    values["type_appel"] = (FieldValue("present", [f"{label} (choisi par le conseiller)"], source="poste") if chosen
                            else FieldValue("uncertain", [label], "déterminé d'après la conversation", "claude"))
    note = FilledNote(t, direction, variant, "choisi par le conseiller" if chosen else "déterminé par Claude", values)
    return note, flags
