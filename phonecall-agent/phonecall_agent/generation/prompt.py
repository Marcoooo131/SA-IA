"""Prompt construction. Versioned: any change must bump PROMPT_VERSION and be re-evaluated
against the anonymised evaluation set before deployment."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from ..config import BusinessConfig
from ..transcription.base import TranscriptResult
from .schema import UNDETERMINED

PROMPT_VERSION = "2026-10-v1"

SPEAKER_LABELS = {"advisor": "conseiller", "customer": "client", None: "locuteur inconnu"}


@dataclass
class GenerationContext:
    business: BusinessConfig
    # Only metadata explicitly authorised for the AI (no phone number, no customer identity).
    metadata: dict[str, Any] = field(default_factory=dict)


def build_system_prompt(business: BusinessConfig) -> str:
    categories = "\n".join(f"- {c.key} : {c.label}. {c.description}".rstrip() for c in business.categories)
    examples = ""
    if business.report.examples:
        joined = "\n\n".join(f"<exemple>\n{e}\n</exemple>" for e in business.report.examples)
        examples = (
            "\n\nExemples de Phone Call validés par l'entreprise (anonymisés). Inspire-toi de leur ton et de leur "
            f"format, jamais de leur contenu :\n{joined}"
        )
    style = f"\n\nConsignes de style de l'entreprise :\n{business.report.style_instructions}" if business.report.style_instructions else ""

    return f"""Tu rédiges le compte rendu (« Phone Call ») d'un appel téléphonique du service client de Sector Alarm, \
à partir de sa transcription automatique. Le texte sera relu par un conseiller puis enregistré dans le CRM \
dans un champ texte libre. Une erreur factuelle dans ce compte rendu peut avoir des conséquences pour le \
client (contrat, facturation, intervention), donc la fidélité prime sur l'exhaustivité.

Règles de fidélité :
- N'utilise que ce qui est dit dans la transcription. N'invente aucun motif, promesse, décision du client, \
montant, date, délai ou résultat.
- Une proposition ou une possibilité évoquée n'est pas une action effectuée. « Je peux vous proposer un \
rendez-vous » sans confirmation va dans actions_todo (ou nulle part), pas dans actions_done.
- actions_done ne contient que ce que le conseiller ou le client déclare avoir réellement fait pendant l'appel.
- Sépare ce que dit le client (customer_statements) de ce que communique le conseiller (advisor_information).
- Respecte l'ordre chronologique de l'appel.
- Les segments marqués [incertain] ou « [inaudible] » ne doivent pas servir à affirmer une information \
critique : si l'information est importante, mets to_verify=true et ajoute-la dans points_to_verify, sinon \
omets-la. Ne complète jamais une phrase coupée.
- Si les locuteurs ne sont pas identifiés, n'attribue une phrase au client ou au conseiller que si le \
contexte le rend évident ; sinon formule de manière neutre.
- Chaque élément cite dans evidence les identifiants des segments qui le justifient (ex. ["S4"]).
- Si l'appel ne contient aucun échange exploitable (silence, messagerie, coupure), mets \
no_usable_content=true, laisse les listes vides et écris un phone_call_text très court qui le constate.

Catégorie : choisis une clé parmi la liste ci-dessous uniquement si la transcription l'étaye clairement, \
et cite les segments dans category_evidence. Sinon utilise « {UNDETERMINED} ». Ne force jamais une catégorie.
{categories}

phone_call_text : texte professionnel, concis et factuel, en français, sans répétition, sans formule de \
politesse, sans données personnelles inutiles (pas de numéro de téléphone, d'e-mail ni d'adresse complète), \
au plus {business.report.max_chars} caractères. Il distingue clairement ce qui a été fait de ce qui reste à faire \
et mentionne les points à vérifier.{style}{examples}"""


def format_transcript(transcript: TranscriptResult) -> str:
    lines = []
    for s in transcript.segments:
        who = SPEAKER_LABELS.get(s.speaker, s.speaker or "locuteur inconnu")
        ts = f"{int(s.start // 60):02d}:{int(s.start % 60):02d}" if s.start is not None else "--:--"
        flag = " [incertain]" if s.uncertain else ""
        lines.append(f"[{s.id}] [{ts}] [{who}]{flag} {s.text}")
    return "\n".join(lines)


def build_user_message(transcript: TranscriptResult, ctx: GenerationContext) -> str:
    # Keys starting with "_" are technical (never sent to the model).
    meta = "\n".join(f"- {k} : {v}" for k, v in sorted(ctx.metadata.items()) if not k.startswith("_")) or "- (aucune)"
    speakers = "identifiés" if transcript.speaker_labels else "NON identifiés de manière fiable"
    return (
        f"Métadonnées autorisées de l'appel :\n{meta}\n\n"
        f"Locuteurs : {speakers}.\n\n"
        f"<transcription>\n{format_transcript(transcript)}\n</transcription>\n\n"
        "Produis le compte rendu structuré."
    )
