import type { GoalType, ISODate, MuscleGroup } from '../types';
import type { Ctx } from './context';
import { addDays, startOfWeek } from '../dates';
import { averageChange, movingAverage, weightSlope } from '../calc/weight';
import { epley1RM, isStagnating, MUSCLE_LABELS, progressionSuggestion, strengthTrend, workingSets } from '../calc/training';
import { observedTdee } from '../calc/metabolism';
import { activityStats, nutritionAverages, sessionsBetween, weeklyMuscleVolume } from './stats';
import { fmt, fmtSigned, mean } from '../format';
import { muscleVolume } from '../calc/training';

export type InsightCategory = 'nutrition' | 'training' | 'cross' | 'regularity';
export type InsightLevel = 'positive' | 'info' | 'warning';

export interface Insight {
  id: string;
  category: InsightCategory;
  level: InsightLevel;
  /** Plus la valeur est élevée, plus la recommandation est prioritaire */
  priority: number;
  title: string;
  text: string;
  evidence?: string;
  action?: { kind: 'adjustCalories'; deltaKcal: number; label: string } | { kind: 'setMaintenance'; maintenanceKcal: number; label: string } | { kind: 'link'; to: string; label: string };
}

const GOAL_LABEL: Record<GoalType, string> = { bulk: 'prise de masse', maintain: 'maintien', cut: 'sèche' };

/** Coach nutritionnel : apports, protéines, tendance du poids par rapport à l'objectif */
export function nutritionInsights(ctx: Ctx, onDate: ISODate): Insight[] {
  const out: Insight[] = [];
  const p = ctx.data.profile;
  const goal = ctx.goalOn(onDate);
  if (!p || !goal) return out;
  const n7 = nutritionAverages(ctx, addDays(onDate, -6), onDate);
  const n30 = nutritionAverages(ctx, addDays(onDate, -29), onDate);

  if (n7.loggedDays < 4) {
    out.push({
      id: 'nutri-data',
      category: 'nutrition',
      level: 'info',
      priority: 40,
      title: 'Journal alimentaire incomplet',
      text: `Seulement ${n7.loggedDays} jour${n7.loggedDays > 1 ? 's' : ''} saisi${n7.loggedDays > 1 ? 's' : ''} sur les 7 derniers. Avec au moins 4 jours par semaine, les analyses caloriques deviennent fiables.`,
      action: { kind: 'link', to: '/nutrition', label: 'Ouvrir le journal' },
    });
  } else {
    const diff = (n7.avgKcal ?? 0) - goal.calories;
    const diffPct = (diff / goal.calories) * 100;
    if (Math.abs(diffPct) > 10) {
      out.push({
        id: 'nutri-kcal-gap',
        category: 'nutrition',
        level: 'warning',
        priority: 70,
        title: diff > 0 ? 'Apports au-dessus de ton objectif' : 'Apports en dessous de ton objectif',
        text: `Ta moyenne sur 7 jours est de ${fmt(n7.avgKcal)} kcal pour un objectif de ${fmt(goal.calories)} kcal (${fmtSigned(diffPct, 0)} %).`,
        evidence: `${n7.loggedDays} jours saisis sur 7.`,
      });
    } else {
      out.push({
        id: 'nutri-kcal-ok',
        category: 'nutrition',
        level: 'positive',
        priority: 20,
        title: 'Calories alignées sur ton objectif',
        text: `Moyenne de ${fmt(n7.avgKcal)} kcal sur 7 jours, à ${fmtSigned(diffPct, 0)} % de ton objectif.`,
      });
    }
    const protPct = ((n7.avgProtein ?? 0) / goal.proteinG) * 100;
    if (protPct < 85) {
      out.push({
        id: 'nutri-protein-low',
        category: 'nutrition',
        level: 'warning',
        priority: 65,
        title: 'Protéines en dessous de l\'objectif',
        text: `Tu consommes en moyenne ${fmt(n7.avgProtein)} g de protéines par jour, soit ${fmt(protPct)} % de ton objectif de ${fmt(goal.proteinG)} g. Une source de protéines à chaque repas aide à l'atteindre.`,
      });
    } else {
      out.push({ id: 'nutri-protein-ok', category: 'nutrition', level: 'positive', priority: 15, title: 'Protéines au rendez-vous', text: `${fmt(protPct)} % de ton objectif protéique en moyenne sur 7 jours.` });
    }
  }

  // Tendance du poids sur 3 semaines par rapport à l'objectif
  const slope = weightSlope(ctx.data.weights, onDate, 21);
  const avg = movingAverage(ctx.data.weights, onDate, 7);
  if (slope !== null && avg) {
    const weekly = slope * 7;
    const weeklyPct = (weekly / avg) * 100;
    const g = goal.goal;
    const w = `${fmtSigned(weekly, 2)} kg/semaine`;
    if (g === 'bulk' && weekly < 0.05) {
      out.push({
        id: 'weight-bulk-stall',
        category: 'nutrition',
        level: 'warning',
        priority: 85,
        title: 'Poids stable malgré la prise de masse',
        text: `Ton poids moyen n'évolue presque plus depuis trois semaines (${w}) alors que ton objectif est une prise de masse. Tu pourrais envisager d'augmenter légèrement tes calories (environ +100 à +150 kcal par jour).`,
        evidence: n30.loggedDays >= 10 ? `Apport moyen sur 30 jours : ${fmt(n30.avgKcal)} kcal.` : undefined,
        action: { kind: 'adjustCalories', deltaKcal: 125, label: 'Ajouter 125 kcal à mon objectif' },
      });
    } else if (g === 'bulk' && weeklyPct > 0.5) {
      out.push({
        id: 'weight-bulk-fast',
        category: 'nutrition',
        level: 'warning',
        priority: 75,
        title: 'Prise de poids plus rapide que prévu',
        text: `Ton poids progresse d'environ ${w} (${fmt(weeklyPct, 1)} % par semaine). Vérifie si ton surplus calorique est toujours adapté à ton objectif : une prise plus lente limite généralement le gain de masse grasse.`,
        action: { kind: 'adjustCalories', deltaKcal: -125, label: 'Retirer 125 kcal de mon objectif' },
      });
    } else if (g === 'cut' && weekly > -0.05) {
      out.push({
        id: 'weight-cut-stall',
        category: 'nutrition',
        level: 'warning',
        priority: 85,
        title: 'Perte de poids à l\'arrêt',
        text: `Ton poids moyen ne baisse plus depuis trois semaines (${w}) alors que tu es en sèche. Tu pourrais réduire légèrement tes calories (environ −100 à −150 kcal) ou augmenter ton activité quotidienne.`,
        action: { kind: 'adjustCalories', deltaKcal: -125, label: 'Retirer 125 kcal de mon objectif' },
      });
    } else if (g === 'cut' && weeklyPct < -1) {
      out.push({
        id: 'weight-cut-fast',
        category: 'nutrition',
        level: 'warning',
        priority: 80,
        title: 'Perte de poids rapide',
        text: `Tu perds environ ${w} (${fmt(-weeklyPct, 1)} % par semaine). Au-delà de 1 % par semaine, il devient plus difficile de préserver tes performances : un déficit un peu plus modéré peut être préférable.`,
        action: { kind: 'adjustCalories', deltaKcal: 125, label: 'Ajouter 125 kcal à mon objectif' },
      });
    } else if (g === 'maintain' && Math.abs(weekly) > 0.25) {
      out.push({
        id: 'weight-maintain-drift',
        category: 'nutrition',
        level: 'info',
        priority: 60,
        title: 'Poids en mouvement pendant le maintien',
        text: `Ton poids moyen évolue de ${w} alors que ton objectif est le maintien. Ajuste légèrement tes apports si cela se confirme.`,
        action: { kind: 'adjustCalories', deltaKcal: weekly > 0 ? -100 : 100, label: weekly > 0 ? 'Retirer 100 kcal' : 'Ajouter 100 kcal' },
      });
    } else {
      out.push({
        id: 'weight-on-track',
        category: 'nutrition',
        level: 'positive',
        priority: 25,
        title: 'Évolution du poids cohérente',
        text: `Tendance sur 3 semaines : ${w}, cohérente avec ton objectif de ${GOAL_LABEL[g]}.`,
      });
    }
  }

  // Dépense observée vs estimée (nécessite des données suffisantes)
  const window = 28;
  const nW = nutritionAverages(ctx, addDays(onDate, -(window - 1)), onDate);
  const slopeW = weightSlope(ctx.data.weights, onDate, window);
  if (nW.loggedDays >= 18 && slopeW !== null && nW.avgKcal) {
    const obs = observedTdee(nW.avgKcal, slopeW);
    const delta = obs - goal.maintenanceKcal;
    if (Math.abs(delta) >= 150) {
      out.push({
        id: 'tdee-observed',
        category: 'nutrition',
        level: 'info',
        priority: 55,
        title: 'Ta dépense réelle semble différente de l\'estimation',
        text: `D'après tes apports (${fmt(nW.avgKcal)} kcal/j sur ${nW.loggedDays} jours saisis) et l'évolution de ton poids, ta dépense se situerait autour de ${fmt(obs)} kcal, contre ${fmt(goal.maintenanceKcal)} kcal estimés. C'est une approximation : oublis de saisie et variations d'eau la faussent.`,
        action: { kind: 'setMaintenance', maintenanceKcal: Math.round(obs / 10) * 10, label: `Utiliser ${fmt(Math.round(obs / 10) * 10)} kcal comme maintien` },
      });
    }
  }
  return out;
}

/** Coach sportif : progression des exercices, stagnation, équilibre musculaire, régularité */
export function trainingInsights(ctx: Ctx, onDate: ISODate): Insight[] {
  const out: Insight[] = [];
  const p = ctx.data.profile;
  const from28 = addDays(onDate, -27);
  const recent = sessionsBetween(ctx, from28, onDate);
  if (!ctx.doneSessions.length) {
    out.push({ id: 'train-start', category: 'training', level: 'info', priority: 50, title: 'Aucune séance enregistrée', text: 'Lance ta première séance depuis l\'onglet Entraînement : les analyses apparaîtront dès les premières données.', action: { kind: 'link', to: '/training', label: 'Démarrer une séance' } });
    return out;
  }
  // Exercices pratiqués récemment
  const exIds = new Set<string>();
  for (const s of recent) for (const x of workingSets(ctx.setsBySession.get(s.id) ?? [])) exIds.add(x.exerciseId);
  const progressing: { name: string; pct: number }[] = [];
  for (const id of exIds) {
    const h = ctx.history(id);
    const ex = ctx.exById.get(id);
    if (!ex) continue;
    const last = h[h.length - 1];
    if (last && last.date >= addDays(onDate, -21) && isStagnating(h, 3)) {
      out.push({
        id: `stall-${id}`,
        category: 'training',
        level: 'warning',
        priority: 60,
        title: `${ex.name} : performances stables`,
        text: `Tes performances sur ${ex.name.toLowerCase()} n'ont pas progressé depuis 3 séances. Vérifie ta récupération (sommeil, alimentation) et la qualité de ton programme ; varier la fourchette de répétitions peut aussi aider.`,
      });
    }
    const tr = strengthTrend(h, from28);
    if (tr && tr.points >= 3 && tr.changePct >= 2 && tr.slopePerWeek > 0) progressing.push({ name: ex.name, pct: tr.changePct });
  }
  progressing.sort((a, b) => b.pct - a.pct);
  if (progressing.length) {
    const top = progressing.slice(0, 3);
    out.push({
      id: 'train-progress',
      category: 'training',
      level: 'positive',
      priority: 30,
      title: 'Progression régulière',
      text: top.length === 1 ? `Ton ${top[0].name.toLowerCase()} progresse régulièrement depuis quatre semaines (${fmtSigned(top[0].pct, 1)} % de 1RM estimé).` : `Belle progression sur 4 semaines : ${top.map((t) => `${t.name} (${fmtSigned(t.pct, 1)} %)`).join(', ')}.`,
    });
  }

  // Suggestions de surcharge progressive prêtes (programme actif)
  const program = ctx.data.programs.find((x) => x.isActive);
  if (program) {
    const ready: string[] = [];
    for (const d of program.days)
      for (const pe of d.exercises) {
        const h = ctx.history(pe.exerciseId);
        const ex = ctx.exById.get(pe.exerciseId);
        if (ex && progressionSuggestion(h[h.length - 1], pe, ex.loadIncrementKg)) ready.push(ex.name);
      }
    if (ready.length)
      out.push({
        id: 'train-overload',
        category: 'training',
        level: 'positive',
        priority: 45,
        title: 'Prêt à augmenter la charge',
        text: `Tu as atteint le haut de ta fourchette de répétitions sur : ${[...new Set(ready)].slice(0, 4).join(', ')}. Une légère hausse de charge te sera proposée en séance (jamais appliquée sans ton accord).`,
      });
  }

  // Équilibre musculaire sur 14 jours
  const sets14 = sessionsBetween(ctx, addDays(onDate, -13), onDate).flatMap((s) => ctx.setsBySession.get(s.id) ?? []);
  const mv = muscleVolume(sets14, ctx.exById).map((r) => ({ ...r, perWeek: r.weighted / 2 }));
  const max = Math.max(...mv.map((r) => r.perWeek));
  if (max >= 6) {
    const maxRow = mv.find((r) => r.perWeek === max)!;
    const pairs: [MuscleGroup, MuscleGroup][] = [['shoulders', 'chest'], ['back', 'chest'], ['hamstrings', 'quads'], ['biceps', 'triceps']];
    for (const [a, b] of pairs) {
      const ra = mv.find((r) => r.muscle === a)!;
      const rb = mv.find((r) => r.muscle === b)!;
      if (rb.perWeek >= 6 && ra.perWeek < rb.perWeek * 0.5) {
        out.push({
          id: `balance-${a}-${b}`,
          category: 'training',
          level: 'info',
          priority: 50,
          title: `Volume ${MUSCLE_LABELS[a].toLowerCase()} plus faible`,
          text: `Ton volume d'entraînement des ${MUSCLE_LABELS[a].toLowerCase()} (${fmt(ra.perWeek, 1)} séries/semaine) est nettement inférieur à celui des ${MUSCLE_LABELS[b].toLowerCase()} (${fmt(rb.perWeek, 1)}). Les séries secondaires comptent pour moitié.`,
          action: { kind: 'link', to: '/training/volume', label: 'Voir le volume par muscle' },
        });
      }
    }
    const untouched = mv.filter((r) => r.perWeek === 0 && r.muscle !== 'abs' && r.muscle !== 'calves');
    if (untouched.length && recent.length >= 4)
      out.push({
        id: 'balance-untouched',
        category: 'training',
        level: 'info',
        priority: 35,
        title: 'Groupes musculaires non travaillés',
        text: `Aucune série sur 14 jours pour : ${untouched.map((u) => MUSCLE_LABELS[u.muscle].toLowerCase()).join(', ')}. Ton groupe le plus travaillé est ${MUSCLE_LABELS[maxRow.muscle].toLowerCase()} (${fmt(max, 1)} séries/semaine).`,
      });
  }

  // Régularité
  if (p) {
    const ws = startOfWeek(onDate);
    const done = activityStats(ctx, ws, onDate).sessions;
    const per4 = recent.length / 4;
    if (done >= p.trainingDaysPerWeek)
      out.push({ id: 'reg-week', category: 'regularity', level: 'positive', priority: 25, title: 'Objectif de la semaine atteint', text: `${done} séance${done > 1 ? 's' : ''} réalisée${done > 1 ? 's' : ''} cette semaine pour un objectif de ${p.trainingDaysPerWeek}. Pense aussi à récupérer.` });
    else if (per4 < p.trainingDaysPerWeek * 0.6 && ctx.doneSessions.length >= 3)
      out.push({ id: 'reg-low', category: 'regularity', level: 'info', priority: 40, title: 'Régularité à retrouver', text: `Tu as fait en moyenne ${fmt(per4, 1)} séance par semaine sur 4 semaines pour un objectif de ${p.trainingDaysPerWeek}. Un programme plus court ou moins de séances prévues peut être plus facile à tenir.` });
  }
  return out;
}

export interface WeekPoint {
  weekStart: ISODate;
  weight: number | null;
  kcal: number | null;
  protein: number | null;
  sessions: number;
  volume: number;
  strengthIndex: number | null;
}

/**
 * Série hebdomadaire croisée : poids moyen, apports, séances, volume et indice de force
 * (moyenne, sur les exercices pratiqués, du meilleur 1RM estimé de la semaine rapporté à celui de la première semaine).
 */
export function weeklySeries(ctx: Ctx, onDate: ISODate, weeks = 12): WeekPoint[] {
  const first = addDays(startOfWeek(onDate), -7 * (weeks - 1));
  const baseline = new Map<string, number>();
  const out: WeekPoint[] = [];
  for (let i = 0; i < weeks; i++) {
    const ws = addDays(first, 7 * i);
    const we = addDays(ws, 6) > onDate ? onDate : addDays(ws, 6);
    const a = activityStats(ctx, ws, we);
    const n = nutritionAverages(ctx, ws, we);
    const best = new Map<string, number>();
    for (const s of a.sessionList)
      for (const x of workingSets(ctx.setsBySession.get(s.id) ?? [])) {
        const e = epley1RM(x.weightKg, x.reps);
        if (e && e > (best.get(x.exerciseId) ?? 0)) best.set(x.exerciseId, e);
      }
    const ratios: number[] = [];
    for (const [id, e] of best) {
      if (!baseline.has(id)) baseline.set(id, e);
      ratios.push((e / baseline.get(id)!) * 100);
    }
    out.push({
      weekStart: ws,
      weight: mean(ctx.data.weights.filter((w) => w.date >= ws && w.date <= we).map((w) => w.weightKg)),
      kcal: n.avgKcal,
      protein: n.avgProtein,
      sessions: a.sessions,
      volume: a.volume,
      strengthIndex: ratios.length ? mean(ratios) : null,
    });
  }
  return out;
}

/** Analyse croisée : observations de tendances, sans conclusion causale */
export function crossInsights(ctx: Ctx, onDate: ISODate): Insight[] {
  const out: Insight[] = [];
  const series = weeklySeries(ctx, onDate, 5);
  const s = series.filter((x) => x.strengthIndex !== null);
  const wChange = averageChange(ctx.data.weights, onDate, 28);
  if (s.length >= 3 && wChange !== null) {
    const strength = s[s.length - 1].strengthIndex! - s[0].strengthIndex!;
    const n = nutritionAverages(ctx, addDays(onDate, -27), onDate);
    const goal = ctx.goalOn(onDate);
    const protPct = goal && n.avgProtein ? (n.avgProtein / goal.proteinG) * 100 : null;
    const parts = [`poids moyen ${fmtSigned(wChange, 1, 'kg')}`, `indice de force ${fmtSigned(strength, 1)} points`];
    if (n.loggedDays >= 10) parts.push(`${fmt(n.avgKcal)} kcal/j en moyenne`);
    if (protPct) parts.push(`protéines à ${fmt(protPct)} % de l'objectif`);
    parts.push(`${fmt(series.slice(-4).reduce((a, b) => a + b.sessions, 0))} séances`);
    let text = `Sur 4 semaines : ${parts.join(', ')}.`;
    let level: InsightLevel = 'info';
    if (wChange < -0.5 && strength < -2) {
      text += ' Ta force estimée recule pendant la baisse de poids : c\'est fréquent en déficit, surveille tes protéines, ton sommeil et l\'ampleur du déficit.';
      level = 'warning';
    } else if (strength > 2) {
      text += ' Ta force progresse sur la période.';
      level = 'positive';
    }
    out.push({ id: 'cross-4w', category: 'cross', level, priority: level === 'warning' ? 55 : 22, title: 'Musculation × nutrition', text, evidence: 'Tendances observées simultanément : elles ne prouvent pas un lien de cause à effet.' });
  }
  return out;
}

export function allInsights(ctx: Ctx, onDate: ISODate): Insight[] {
  return [...nutritionInsights(ctx, onDate), ...trainingInsights(ctx, onDate), ...crossInsights(ctx, onDate)].sort((a, b) => b.priority - a.priority);
}

/** Trois recommandations prioritaires (hors messages purement positifs si possible) */
export function topRecommendations(insights: Insight[], n = 3): Insight[] {
  const actionable = insights.filter((i) => i.level !== 'positive');
  const rest = insights.filter((i) => i.level === 'positive');
  return [...actionable, ...rest].slice(0, n);
}

export { weeklyMuscleVolume };
