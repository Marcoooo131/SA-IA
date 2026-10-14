"""Fills the Phone Call template WITHOUT AI, with explicit rules on the transcript.

The program does not understand the call. It quotes what was said (never reworded), classifies
sentences with markers configured in the template, extracts numbers / dates / references with
regular expressions, and uses the PC metadata (clock, advisor name, call type chosen) as the only
other source. Anything else is « Aucune information notifiée ». Heard-but-unreliable data (names,
numbers, references, automatic detections) is « À confirmer »; different values for the same
item are reported as a contradiction.
"""

from __future__ import annotations

import difflib
import re
import time
from collections.abc import Callable

from ..business import Category
from ..local_summary import (
    FIGURES,
    PHONE,
    Sentence,
    _clean,
    _quote,
    _substantive,
    detect_category,
    find_agent_name,
    find_figures,
    norm,
)
from . import CallContext, FieldSpec, FieldValue, FilledNote, Template

OUTGOING_OPENERS = tuple(norm(m) for m in (
    "je vous appelle de la part", "je me permets de vous appeler", "je cherche à joindre", "est-ce que je suis bien",
    "suis-je bien", "je souhaiterais parler à", "je voudrais parler à", "je vous appelle au sujet",
    "je vous appelle concernant", "je vous appelle suite", "je vous rappelle au sujet", "je vous recontacte"))
INCOMING_OPENERS = tuple(norm(m) for m in (
    "sector alarm bonjour", "sector alarm, bonjour", "je vous écoute", "que puis-je faire", "service client",
    "en quoi puis-je"))
HEDGES = tuple(norm(m) for m in ("je crois", "je pense que", "peut-être", "il me semble", "je ne sais pas", "normalement",
                                 "je ne suis pas sûr", "je ne suis pas sure", "sauf erreur", "à peu près", "environ"))
INTERROGATIVES = tuple(norm(m) for m in ("est-ce que", "est-ce qu'", "pourquoi", "comment", "combien", "quand ", "quel ",
                                          "quelle ", "quels ", "quelles ", "où ", "pouvez-vous", "pourriez-vous"))
ACCEPT = tuple(norm(m) for m in ("j'accepte", "d'accord pour", "ça me va", "je garde", "ok pour", "je veux bien",
                                 "c'est d'accord", "allons-y", "je prends", "ça marche", "je suis d'accord", "je valide"))
REFUSE = tuple(norm(m) for m in ("je refuse", "non merci", "je ne souhaite pas", "je ne veux pas", "pas intéressé",
                                 "pas intéressée", "je maintiens", "je préfère résilier", "ça ne m'intéresse pas"))
REFLECT = tuple(norm(m) for m in ("je vais réfléchir", "je réfléchis", "je préfère en parler", "je vous rappellerai",
                                  "je rappellerai", "je vais voir", "laissez-moi réfléchir", "je reviens vers vous"))
WEAK_ACCEPT = tuple(norm(m) for m in ("d'accord", "très bien", "parfait", "ok"))
FUTURE_ADVISOR = tuple(norm(m) for m in (
    "je vais", "nous allons", "on va", "je vous enverrai", "je transmets", "je vous rappellerai", "je vous rappelle demain",
    "je vous rappelle la semaine", "je vous rappelle dans", "je vous recontacte", "vous allez recevoir", "vous recevrez",
    "un technicien va", "un technicien passera", "le technicien passera", "le service", "il faudra", "vous devez",
    "vous devrez", "pensez à", "n'oubliez pas", "merci de nous", "je programme", "je vous programme",
    "vous allez la recevoir", "vous allez le recevoir", "vous allez les recevoir", "vous la recevrez", "vous le recevrez",
    "vous les recevrez", "vous serez contacté", "vous serez rappelé", "va vous appeler", "va vous contacter",
    "va vous rappeler",
    *(f"je vous rappelle {d}" for d in ("lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "cet après-midi",
                                         "ce soir", "en fin de", "d'ici", "le ", "dès que", "après"))))
FUTURE_REMOTE = tuple(norm(m) for m in ("je vais", "je vous rappellerai", "je rappellerai", "je vous enverrai",
                                        "je vais vous envoyer", "je vous renvoie", "je reviens vers vous", "je vous envoie",
                                        "je vous l'envoie", "je vous l'enverrai", "je vous les envoie", "je m'en occupe"))
CUSTOMER_TASK = tuple(norm(m) for m in ("vous devez", "vous devrez", "il faudra que vous", "pensez à", "n'oubliez pas",
                                        "merci de nous", "il faudra nous", "vous pouvez nous envoyer"))
DELIVERY = tuple(norm(m) for m in ("vous allez recevoir", "vous recevrez", "vous allez la recevoir", "vous allez le recevoir",
                                   "vous allez les recevoir", "vous la recevrez", "vous le recevrez", "vous les recevrez"))
APPOINTMENT = tuple(norm(m) for m in ("rendez-vous", "rdv", "passage d'un technicien", "intervention", "visite",
                                      "technicien passera", "technicien viendra", "le technicien"))
FIXED = tuple(norm(m) for m in ("est fixé", "c'est noté pour", "je vous programme", "j'ai programmé", "je programme",
                                "je vous confirme", "prévu le", "prévue le", "passera le", "viendra le", "c'est fixé",
                                "c'est réservé", "j'ai réservé", "je vous inscris"))
DEADLINE = re.compile(r"\b(?:cette semaine|ce mois-ci|aujourd'hui|dans la journee|sous \d+\s?(?:h|heures|jours)|dans (?:les )?\d+ (?:jours|semaines|heures)|d'ici (?:la fin|demain|"
                      r"lundi|mardi|mercredi|jeudi|vendredi|\d+)[^,.;]*|avant le [^,.;]+|au plus tard [^,.;]+)")
CASE_STATE = re.compile(r"\b(?:dossier (?:est )?(?:cl[oô]tur[ée]|clos|ferm[ée]|en cours|transmis|ouvert|trait[ée]|r[ée]gl[ée])"
                        r"|je cl[ôo]ture|je transmets (?:votre dossier|votre demande|au service)|c'est r[ée]gl[ée]"
                        r"|votre demande est (?:enregistr[ée]e|transmise|en cours))")
WO = re.compile(r"\b(?:WO|W\.O\.?|work order|bon de travail|ordre de travail|num[ée]ro d'intervention|num[ée]ro de dossier"
                r"|dossier num[ée]ro|r[ée]f[ée]rence)\s*(?:n°|num[ée]ro|number|:|est le|c'est le|est)?\s*"
                r"([A-Z]{0,3}[- ]?\d[\d -]{2,}\d)", re.IGNORECASE)
ADDRESS = re.compile(r"\b\d{1,4}(?:\s?(?:bis|ter))?,?\s+(?:rue|avenue|av\.|boulevard|bd|allée|chemin|place|impasse|route"
                     r"|quai|cours|square|résidence|lotissement|hameau|lieu-dit)\s+[^,.;!?]{2,60}"
                     r"(?:,?\s*(?:à\s+)?\d{5}\s+[A-ZÀ-Ý][\w' -]{1,40}|\s+à\s+[A-ZÀ-Ý][\w'-]+(?:[ -][A-ZÀ-Ý][\w'-]+)?)?",
                     re.IGNORECASE)
NEW_ADDRESS = tuple(norm(m) for m in ("nouvelle adresse", "nouveau logement", "je vais habiter", "on emménage", "j'emménage",
                                      "on déménage", "je déménage", "nous déménageons", "future adresse"))
MOVE_WORDS = tuple(norm(m) for m in ("déménag", "emménag", "nouveau logement", "nouvelle adresse", "les clés", "état des lieux"))
MONTH_PERIOD = re.compile(r"\b(?:debut|fin|mi-|courant|en)\s?(?:janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre"
                          r"|octobre|novembre|decembre)\b")


def is_question(s: Sentence) -> bool:
    return s.text.rstrip().endswith("?") or s.n.startswith(INTERROGATIVES)


def _similar(a: str, b: str) -> bool:
    return difflib.SequenceMatcher(None, a, b).ratio() > 0.85


class RuleFiller:
    def __init__(self, template: Template, sentences: list[Sentence], categories: list[Category], ctx: CallContext):
        self.t, self.sentences, self.categories, self.ctx = template, sentences, categories, ctx
        self.used: set[int] = set()
        self.values: dict[str, FieldValue] = {}
        self.category, self.category_hits = detect_category(sentences, categories)
        self.figures, self.unsure_figures = find_figures(sentences)
        self.direction, self.variant, self.type_source = self._call_type()

    # ------------------------------------------------------------------ type of call

    def _call_type(self) -> tuple[str | None, str, str]:
        direction = self.ctx.direction
        if direction is None:
            opening = [s for s in self.sentences[:6]]
            if any(s.speaker == "advisor" and s.has(OUTGOING_OPENERS) for s in opening):
                direction = "sortant"
            elif any(s.speaker == "advisor" and s.has(INCOMING_OPENERS) for s in opening[:3]):
                direction = "entrant"
        variant = self.ctx.variant
        if variant is None:
            movers = Category("movers", "Movers", list(self.t.call_types.get("movers", {}).get("keywords", [])))
            if movers.keywords and detect_category(self.sentences, [movers])[0]:
                variant = "movers"
            elif direction == "entrant":
                variant = "frontline"
            else:
                variant = "autre"
        detected = [part for part, chosen in (("sens", self.ctx.direction), ("type", self.ctx.variant)) if not chosen]
        source = "choisi par le conseiller" if not detected else f"{' et '.join(detected)} détecté(s) automatiquement"
        return direction, variant, source

    # ------------------------------------------------------------------ main

    def fill(self) -> FilledNote:
        note = FilledNote(self.t, self.direction, self.variant, self.type_source, self.values)
        for _section, fields in note.visible_fields():
            for spec in fields:
                self.values[spec.id] = self._apply(spec)
        return note

    def _apply(self, spec: FieldSpec) -> FieldValue:
        rule = spec.rule
        if "meta" in rule:
            return getattr(self, f"meta_{rule['meta']}")()
        if "extract" in rule:
            return getattr(self, f"extract_{rule['extract']}")()
        if "quotes" in rule:
            return self.quotes(**rule["quotes"])
        return FieldValue.absent()

    # ------------------------------------------------------------------ quotes

    def pool(self, speaker: str) -> list[Sentence]:
        return [s for s in self.sentences if (speaker == "any" or s.speaker == speaker) and not PHONE.search(s.text)
                and (_substantive(s) or (s.uncertain and s.words >= 3))]

    def quotes(self, speaker: str = "any", markers: list[str] | None = None, exclude: list[str] | None = None,
               questions: str | None = None, late: bool = False, max: int = 3, fallback: bool = False,
               exclude_used: bool = False) -> FieldValue:
        marks = tuple(norm(m) for m in markers or [])
        excl = tuple(norm(m) for m in exclude or [])
        cands = []
        for s in self.pool(speaker):
            if excl and s.has(excl):
                continue
            if questions == "only":
                if not (is_question(s) or marks and s.has(marks)):
                    continue
            elif marks and not s.has(marks):
                continue
            if questions == "exclude" and is_question(s):
                continue
            if late and s.index < len(self.sentences) // 2 or exclude_used and s.index in self.used:
                continue
            cands.append(s)
        if not cands and fallback:
            cands = [s for s in self.pool(speaker) if not s.uncertain and not (excl and s.has(excl))][:1]
        chosen: list[Sentence] = []
        for s in cands:
            if len(chosen) < max and not any(_similar(s.n, c.n) for c in chosen):
                chosen.append(s)
        if not chosen:
            return FieldValue.absent()
        self.used.update(s.index for s in chosen)
        items = [self._item(s) for s in chosen]
        if all(s.uncertain for s in chosen):
            return FieldValue("uncertain", items, "passage mal compris par la transcription", "conversation")
        return FieldValue("present", items, source="conversation")

    @staticmethod
    def _item(s: Sentence, prefix: str = "") -> str:
        text = prefix + _quote(s.text)
        if s.uncertain:
            return "À confirmer (passage mal compris) : " + text
        if s.speaker == "remote" and s.has(HEDGES):
            return text + " (propos hésitant, à confirmer)"
        return text

    # ------------------------------------------------------------------ metadata of the PC

    def meta_call_type(self) -> FieldValue:
        direction = self.t.directions.get(self.direction or "", "")
        label = " — ".join(x for x in (direction or "sens de l'appel non identifié", self.t.variant_label(self.variant)) if x)
        if self.type_source == "choisi par le conseiller":
            return FieldValue("present", [f"{label} (choisi par le conseiller)"], source="poste")
        return FieldValue("uncertain", [label], self.type_source, "déduit")

    def meta_service(self) -> FieldValue:
        if not self.category:
            return FieldValue.absent()
        return FieldValue("uncertain", [self.category.label],
                          f"détecté par mots-clés ({', '.join(self.category_hits[:3])})", "mots-clés")

    def meta_agent(self) -> FieldValue:
        if self.ctx.agent_name.strip():
            return FieldValue("present", [f"{self.ctx.agent_name.strip()} (paramètre du poste)"], source="poste")
        if heard := find_agent_name(self.sentences):
            return FieldValue("uncertain", [heard], "entendu dans la conversation", "conversation")
        return FieldValue.absent()

    def meta_datetime(self) -> FieldValue:
        if not self.ctx.started_at:
            return FieldValue.absent()
        when = time.strftime("%d/%m/%Y à %H:%M", time.localtime(self.ctx.started_at))
        return FieldValue("present", [f"{when} (horloge du poste)"], source="poste")

    def meta_subject(self) -> FieldValue:
        if self.category:
            return FieldValue("uncertain", [self.category.label], "déduit des mots-clés de la conversation", "mots-clés")
        first = next((s for s in self.pool("remote") if not s.uncertain and not is_question(s)), None)
        if first:
            return FieldValue("uncertain", [_quote(first.text)], "première demande du client", "conversation")
        return FieldValue.absent()

    # ------------------------------------------------------------------ dedicated extractors

    def _distinct(self, found: list[tuple[str, Sentence]], reason: str, key: Callable[[str], str] = norm) -> FieldValue:
        values: dict[str, str] = {}
        for value, s in found:
            values.setdefault(key(value), f"{value} (« {s.text.strip()} »)" if len(s.text) < 160 else value)
        if not values:
            return FieldValue.absent()
        if len(values) > 1:
            return FieldValue("contradictory", list(values.values()), "plusieurs valeurs différentes citées", "conversation")
        return FieldValue("uncertain", [next(iter(values.values()))], reason, "conversation")

    def extract_customer_name(self) -> FieldValue:
        from ..local_summary import ADDRESSED, SELF_INTRO, _name

        own = [(n, s) for s in self.sentences if s.speaker == "remote"
               and (n := _name(SELF_INTRO.search(_clean(s.text)), 1, 2))]
        if own:
            return self._distinct(own, "entendu dans la conversation, orthographe non vérifiée")
        heard = [(n, s) for s in self.sentences if (n := _name(ADDRESSED.search(_clean(s.text)), 1, 2))]
        if heard:
            return FieldValue("uncertain", [heard[0][0]], "nom entendu dans la conversation, orthographe non vérifiée",
                              "conversation")
        return FieldValue.absent()

    def extract_phone(self) -> FieldValue:
        found = []
        for s in self.sentences:
            for m in PHONE.finditer(s.text):
                digits = re.sub(r"\D", "", m.group(0).replace("+33", "0"))
                found.append((" ".join(digits[i:i + 2] for i in range(0, 10, 2)), s))
        return self._distinct(found, "chiffres entendus dans la conversation, à vérifier", key=lambda v: v)

    def extract_wo_number(self) -> FieldValue:
        found = [(re.sub(r"\s+", " ", m.group(1)).strip().upper(), s) for s in self.sentences for m in WO.finditer(s.text)]
        return self._distinct(found, "référence entendue dans la conversation, à vérifier",
                              key=lambda v: re.sub(r"\W", "", v))

    def extract_address(self) -> FieldValue:
        items = []
        for s in self.sentences:
            for m in ADDRESS.finditer(s.text):
                kind = "Nouvelle adresse" if s.has(NEW_ADDRESS) else "Adresse"
                items.append(f"{kind} : {m.group(0).strip()} (« {s.text.strip()} »)")
        if items:
            return FieldValue("uncertain", items, "adresse entendue dans la conversation, à vérifier", "conversation")
        mentioned = [s for s in self.pool("any") if s.has(tuple(norm(m) for m in ("nouvelle adresse", "adresse")))]
        if mentioned:
            return FieldValue("uncertain", [_quote(mentioned[0].text)], "adresse évoquée mais non dictée", "conversation")
        return FieldValue.absent()

    def extract_move_date(self) -> FieldValue:
        found = []
        for s in self.sentences:
            if not s.has(MOVE_WORDS):
                continue
            for rx in (*FIGURES[1:5], MONTH_PERIOD):
                for m in rx.finditer(s.n):
                    found.append((m.group(0).strip(), s))
        if not found:
            return FieldValue.absent()
        value = self._distinct(found, "")
        if value.status == "uncertain":  # a single date said in the call: reported as said
            value.status, value.reason = "present", ""
        else:
            value.reason = "plusieurs dates de déménagement citées"
        return value

    def extract_answers_to_questions(self) -> FieldValue:
        items = []
        for i, s in enumerate(self.sentences):
            if s.speaker != "remote" or not _substantive(s) or not (
                    is_question(s) or s.has(tuple(norm(m) for m in ("trop cher", "pas d'accord", "pas satisfait")))):
                continue
            answer = next((a for a in self.sentences[i + 1:i + 6]
                           if a.speaker == "advisor" and _substantive(a) and not is_question(a)), None)
            if answer:
                items.append(f"{_quote(s.text)} → {_quote(answer.text)}")
        if not items:
            return FieldValue.absent()
        return FieldValue("present", items[:5], source="conversation")

    def extract_decision(self) -> FieldValue:
        late = [s for s in self.pool("remote") if s.index >= len(self.sentences) // 3]
        accept = [s for s in late if s.has(ACCEPT)]
        refuse = [s for s in late if s.has(REFUSE)]
        reflect = [s for s in late if s.has(REFLECT)]
        if accept and refuse:
            items = [f"Accord : {_quote(accept[-1].text)}", f"Refus : {_quote(refuse[-1].text)}"]
            return FieldValue("contradictory", items, "accord et refus exprimés dans l'appel", "conversation")
        if accept:
            return FieldValue("present", [f"Accord : {_quote(accept[-1].text)}"], source="conversation")
        if refuse:
            return FieldValue("present", [f"Refus : {_quote(refuse[-1].text)}"], source="conversation")
        if reflect:
            return FieldValue("present", [f"En réflexion : {_quote(reflect[-1].text)}"], source="conversation")
        weak = [s for s in self.sentences[len(self.sentences) // 2:] if s.speaker == "remote" and s.has(WEAK_ACCEPT)]
        if weak:
            return FieldValue("uncertain", [_quote(weak[-1].text)], "accord simple, objet non précisé", "conversation")
        return FieldValue.absent()

    def extract_outcome(self) -> FieldValue:
        get = lambda fid: self.values.get(fid, FieldValue())  # noqa: E731 - fields filled before this one
        parts = []
        decision = get("decision")
        if decision.status == "present":
            parts.append(decision.items[0].split(" : ", 1)[0] + " du client")
        elif decision.status == "contradictory":
            parts.append("Décision du client contradictoire (voir ci-dessus)")
        if get("actions_effectuees").status in ("present", "uncertain"):
            parts.append(f"{len(get('actions_effectuees').items)} action(s) effectuée(s) pendant l'appel")
        if get("solutions").status == "present":
            parts.append("solution(s) proposée(s)")
        if self._remaining:
            parts.append(f"{len(self._remaining)} action(s) de suivi à réaliser")
        if not parts:
            return FieldValue.absent()
        text = "; ".join(parts)
        return FieldValue("present", [text[0].upper() + text[1:] + " (d'après les éléments ci-dessus)"], source="déduit")

    @property
    def _remaining(self) -> list[tuple[Sentence, str]]:
        out = []
        for s in self.pool("any"):
            if s.speaker == "advisor" and s.has(FUTURE_ADVISOR) and not is_question(s):
                if s.has(CUSTOMER_TASK):
                    who = "client"
                elif s.has(DELIVERY):
                    who = "Sector Alarm (envoi)"
                elif "technicien" in s.n:
                    who = "technicien"
                elif "le service" in s.n:
                    who = "service concerné"
                else:
                    who = "conseiller"
                out.append((s, who))
            elif s.speaker == "remote" and s.has(FUTURE_REMOTE) and not is_question(s):
                out.append((s, "client"))
        return out

    def extract_remaining_actions(self) -> FieldValue:
        items, kept = [], []
        for s, who in self._remaining:
            if not any(_similar(s.n, k.n) for k in kept):
                kept.append(s)
                items.append(f"{self._item(s)} — responsable : {who}")
        return FieldValue("present", items, source="conversation") if items else FieldValue.absent()

    def extract_appointment(self) -> FieldValue:
        cands = [s for s in self.pool("any") if s.has(APPOINTMENT)]
        fixed = [s for s in cands if s.has(FIXED) and any(rx.search(s.n) for rx in FIGURES[1:])]
        if fixed:
            dates = {m.group(0) for s in fixed for rx in FIGURES[1:] for m in rx.finditer(s.n)}
            items = [_quote(s.text) for s in fixed]
            if len(fixed) > 1 and len(dates) > 1:
                return FieldValue("contradictory", items, "plusieurs dates de rendez-vous citées", "conversation")
            return FieldValue("present", [f"Fixé : {items[-1]}"], source="conversation")
        if cands:
            return FieldValue("uncertain", [_quote(cands[-1].text)], "rendez-vous évoqué mais non fixé", "conversation")
        return FieldValue.absent()

    def extract_deadline(self) -> FieldValue:
        items = []
        for s, _who in self._remaining:
            found = [m.group(0).strip() for m in [*DEADLINE.finditer(s.n), *(m for rx in FIGURES[1:6] for m in rx.finditer(s.n))]]
            found = [f for f in dict.fromkeys(found) if not any(f != o and f in o for o in found)]
            if found:
                items.append(f"{', '.join(found)} (« {s.text.strip()} »)")
        items = list(dict.fromkeys(items))
        return FieldValue("present", items[:4], source="conversation") if items else FieldValue.absent()

    def extract_case_state(self) -> FieldValue:
        said = [s for s in self.sentences if CASE_STATE.search(s.n)]
        return FieldValue("present", [_quote(said[-1].text)], source="conversation") if said else FieldValue.absent()

    def extract_complements(self) -> FieldValue:
        written = " ".join(i for v in self.values.values() for i in v.items).lower()
        items = []
        others = [f for f in self.figures if norm(f) not in norm(written)]
        if others:
            items.append("Éléments chiffrés cités : " + ", ".join(others))
        for f in self.unsure_figures:
            items.append(f"À confirmer (passage mal compris) : « {f} »")
        minutes, seconds = divmod(int(self.ctx.duration_s or 0), 60)
        if self.ctx.duration_s:
            items.append(f"Durée de l'appel : {f'{minutes} min {seconds:02d} s' if minutes else f'{seconds} s'} (horloge du poste)")
        n_unsure = len({s.index for s in self.sentences if s.uncertain})
        if n_unsure:
            items.append(f"{n_unsure} passage(s) de la transcription mal compris : relire la transcription")
        return FieldValue("present", items, source="conversation") if items else FieldValue.absent()


def fill(template: Template, sentences: list[Sentence], categories: list[Category], ctx: CallContext) -> FilledNote:
    return RuleFiller(template, sentences, categories, ctx).fill()
