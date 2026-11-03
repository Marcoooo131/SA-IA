import type { ISODate } from '../types';
import type { Ctx } from './context';
import { addDays, startOfWeek } from '../dates';
import { averageChange } from '../calc/weight';
import { activityStats } from './stats';
import { fmt, fmtSmart } from '../format';

export interface SummaryLine {
  id: string;
  tone: 'positive' | 'neutral' | 'warning';
  text: string;
}

/** « Ton bilan du jour » : phrases calculées uniquement à partir des données enregistrées */
export function dailySummary(ctx: Ctx, onDate: ISODate): SummaryLine[] {
  const out: SummaryLine[] = [];
  const week = activityStats(ctx, startOfWeek(onDate), onDate);
  const p = ctx.data.profile;
  if (week.sessions > 0) {
    const target = p?.trainingDaysPerWeek;
    out.push({ id: 'week', tone: 'positive', text: `Tu as réalisé ${week.sessions} entraînement${week.sessions > 1 ? 's' : ''} cette semaine${target ? ` (objectif : ${target})` : ''}.` });
  } else if (ctx.doneSessions.length) {
    out.push({ id: 'week', tone: 'neutral', text: 'Aucun entraînement cette semaine pour l\'instant.' });
  }

  const goal = ctx.goalOn(onDate);
  const t = ctx.dayTotals(onDate);
  if (goal) {
    if (ctx.loggedDates.has(onDate)) {
      const rem = Math.round(goal.calories - t.kcal);
      out.push(
        rem >= 0
          ? { id: 'kcal', tone: 'neutral', text: `Il te reste ${fmt(rem)} kcal à consommer aujourd'hui.` }
          : { id: 'kcal', tone: 'warning', text: `Tu as dépassé ton objectif calorique de ${fmt(-rem)} kcal aujourd'hui.` },
      );
      const protPct = Math.round((t.protein / goal.proteinG) * 100);
      out.push({ id: 'prot', tone: protPct >= 90 ? 'positive' : 'neutral', text: `Tu es à ${protPct} % de ton objectif protéique (${fmt(t.protein)} / ${fmt(goal.proteinG)} g).` });
    } else {
      out.push({ id: 'kcal', tone: 'neutral', text: `Aucun repas saisi aujourd'hui : objectif de ${fmt(goal.calories)} kcal et ${fmt(goal.proteinG)} g de protéines.` });
    }
  }

  // Exercice ayant le plus progressé en charge sur 30 jours
  const from = addDays(onDate, -30);
  let best: { name: string; delta: number } | null = null;
  for (const id of ctx.practicedExerciseIds) {
    const h = ctx.history(id).filter((x) => x.date >= from && x.bestWeight > 0);
    if (h.length < 2) continue;
    const delta = h[h.length - 1].bestWeight - h[0].bestWeight;
    if (delta > 0 && (!best || delta > best.delta)) best = { name: ctx.exById.get(id)?.name ?? '', delta };
  }
  if (best) out.push({ id: 'lift', tone: 'positive', text: `Ton ${best.name.toLowerCase()} a progressé de ${fmtSmart(best.delta, 2)} kg sur le dernier mois.` });

  const wc = averageChange(ctx.data.weights, onDate, 7);
  if (wc !== null) {
    const g = Math.round(Math.abs(wc) * 1000);
    out.push({
      id: 'weight',
      tone: 'neutral',
      text: g < 100 ? 'Ton poids moyen est stable cette semaine.' : `Ton poids moyen a ${wc > 0 ? 'augmenté' : 'baissé'} de ${g >= 1000 ? `${fmtSmart(Math.abs(wc), 1)} kg` : `${fmt(g)} g`} cette semaine.`,
    });
  }
  return out;
}
