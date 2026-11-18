// Moteur de parcours (version navigateur, pour la démonstration).
// Traduction fidèle de backend/venio/flows/engine.py : mêmes règles de chemin, de validation et de résumé.
import type { Answers, FlowDefinition, Step } from "@/lib/flow";
import { displayValue } from "@/lib/flow";

export const END = "@end";

type Cond =
  | { field: string; op: string; value?: unknown }
  | { all: Cond[] } | { any: Cond[] } | { not: Cond };
type Route = { when: Cond; goto: string };
type Rule = { when?: Cond; service: string };

export class AnswerError extends Error {
  constructor(public step: string, message: string) { super(message); }
}

export const isAnswered = (v: unknown) => v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0);

export function evaluate(c: Cond, a: Answers): boolean {
  if ("all" in c) return c.all.every((x) => evaluate(x, a));
  if ("any" in c) return c.any.some((x) => evaluate(x, a));
  if ("not" in c) return !evaluate(c.not, a);
  const v = a[c.field];
  if (c.op === "answered") return isAnswered(v);
  if (c.op === "not_answered") return !isAnswered(v);
  if (!isAnswered(v)) return false;
  switch (c.op) {
    case "eq": return v === c.value;
    case "neq": return v !== c.value;
    case "in": return ((c.value as unknown[]) ?? []).includes(v);
    case "not_in": return !((c.value as unknown[]) ?? []).includes(v);
    case "contains": return Array.isArray(v) && v.includes(c.value);
    case "gt": return Number(v) > Number(c.value);
    case "gte": return Number(v) >= Number(c.value);
    case "lt": return Number(v) < Number(c.value);
    case "lte": return Number(v) <= Number(c.value);
  }
  return false;
}

const step = (d: FlowDefinition, id: string) => d.steps.find((s) => s.id === id)!;

export function nextStepId(d: FlowDefinition, id: string, a: Answers): string {
  const s = step(d, id);
  for (const r of (s.routes ?? []) as Route[]) if (evaluate(r.when, a)) return r.goto;
  if (s.next) return s.next;
  const i = d.steps.findIndex((x) => x.id === id);
  return i + 1 < d.steps.length ? d.steps[i + 1].id : END;
}

export function walk(d: FlowDefinition, a: Answers) {
  const visited: string[] = [];
  let current: string | null = null;
  let node = d.steps[0].id;
  let guard = 0;
  while (node !== END && guard++ <= d.steps.length) {
    const s = step(d, node);
    if (!isAnswered(a[node]) && !(!s.required && node in a)) { current = node; break; }
    visited.push(node);
    node = nextStepId(d, node, a);
  }
  let remaining = 0;
  let probe: string | null = current;
  guard = 0;
  while (probe !== null && probe !== END && guard++ <= d.steps.length) { remaining++; probe = nextStepId(d, probe, a); }
  return { visited, current, estimated_total: visited.length + remaining };
}

export function state(d: FlowDefinition, a: Answers) {
  const w = walk(d, a);
  const done = w.current === null;
  return {
    current_step: w.current, visited: w.visited, answered: w.visited.length, estimated_total: w.estimated_total,
    progress: Math.round((100 * w.visited.length) / Math.max(w.estimated_total, 1)),
    qualification_done: done, service_key: done ? resolveService(d, a) : null,
  };
}

export function resolveService(d: FlowDefinition, a: Answers): string {
  const rules = d.service_rules as Rule[];
  for (const r of rules) if (!r.when || evaluate(r.when, a)) return r.service;
  return rules[rules.length - 1].service;
}

export function validateAnswer(s: Step, v: unknown): unknown {
  if (!isAnswered(v)) {
    if (s.required) throw new AnswerError(s.id, "Cette réponse est nécessaire.");
    return null;
  }
  switch (s.type) {
    case "single_choice":
      if (!s.options.some((o) => o.value === v)) throw new AnswerError(s.id, "Choix invalide.");
      return v;
    case "multi_choice": {
      if (!Array.isArray(v) || !v.length) throw new AnswerError(s.id, "Sélectionnez au moins un choix.");
      const order = s.options.map((o) => o.value);
      if (v.some((x) => !order.includes(x))) throw new AnswerError(s.id, "Choix invalide.");
      return [...new Set(v as string[])].sort((x, y) => order.indexOf(x) - order.indexOf(y));
    }
    case "yes_no":
      if (typeof v !== "boolean") throw new AnswerError(s.id, "Répondez par oui ou non.");
      return v;
    case "text": case "long_text": {
      if (typeof v !== "string") throw new AnswerError(s.id, "Texte attendu.");
      const t = v.trim();
      const limit = s.type === "text" ? 200 : 2000;
      if (t.length > limit) throw new AnswerError(s.id, `${limit} caractères maximum.`);
      if (!t && s.required) throw new AnswerError(s.id, "Cette réponse est nécessaire.");
      return t || null;
    }
    case "number": case "slider": {
      const n = Number(v);
      if (typeof v === "boolean" || Number.isNaN(n)) throw new AnswerError(s.id, "Nombre attendu.");
      if (s.min !== undefined && n < s.min) throw new AnswerError(s.id, `Minimum : ${s.min}.`);
      if (s.max !== undefined && n > s.max) throw new AnswerError(s.id, `Maximum : ${s.max}.`);
      return n;
    }
    case "date":
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v))) throw new AnswerError(s.id, "Date invalide.");
      return v;
    case "photos":
      if (!Array.isArray(v)) throw new AnswerError(s.id, "Fichiers invalides.");
      if (v.length > s.max_files) throw new AnswerError(s.id, `${s.max_files} fichiers maximum.`);
      return v;
  }
  throw new AnswerError(s.id, "Type de question inconnu.");
}

export function summarize(d: FlowDefinition, a: Answers) {
  return walk(d, a).visited.map((id) => {
    const s = step(d, id);
    return { step: id, type: s.type, question: s.title, value: a[id] ?? null, display: displayValue(s, a[id]) };
  });
}

export const summaryText = (items: ReturnType<typeof summarize>) =>
  items.filter((i) => i.display !== "—").map((i) => `${i.question.replace(/ \?$/, "")} : ${i.display}`).join(" · ");

/** Validation minimale d'un parcours modifié dans l'éditeur (textes uniquement dans cette version). */
export function checkDefinition(d: FlowDefinition): string | null {
  for (const s of d.steps) {
    if (!s.title.trim()) return `Question ${s.id} : le libellé est vide.`;
    for (const o of s.options) if (!o.label.trim()) return `Question ${s.id} : un choix n'a pas de libellé.`;
  }
  return null;
}
