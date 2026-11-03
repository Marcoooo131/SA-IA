import type { MonthlyReport, WeeklyReport } from './analytics/reports';
import type { Ctx } from './analytics/context';
import { formatDate, formatDuration, formatMonth } from './dates';
import { fmt, fmtSigned, fmtSmart } from './format';
import { MEASUREMENT_FIELDS } from './analytics/reports';
import { RECORD_LABELS } from './calc/training';

/** Les polices standard du PDF ne couvrent que le jeu WinAnsi : on remplace les symboles absents */
export function pdfText(v: string | number): string {
  return String(v)
    .replace(/[\u202f\u00a0]/g, ' ')
    .replace(/\u2212/g, '-')
    .replace(/\u2192/g, '->')
    .replace(/\u2265/g, '>=')
    .replace(/\u2264/g, '<=')
    .replace(/\u00b1/g, '+/-')
    .replace(/\u2248/g, '~');
}

/** Export PDF des bilans (généré dans le navigateur, aucune donnée envoyée) */
async function doc() {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const d = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = 18;
  const W = 210;
  const header = (title: string, sub: string) => {
    d.setFillColor(10, 11, 13);
    d.rect(0, 0, W, 30, 'F');
    d.setTextColor(46, 252, 134);
    d.setFont('helvetica', 'bold');
    d.setFontSize(9);
    d.text('BODYTRACK', 14, 11);
    d.setTextColor(255, 255, 255);
    d.setFontSize(18);
    d.text(pdfText(title), 14, 21);
    d.setFontSize(9);
    d.setTextColor(170, 170, 170);
    d.text(pdfText(sub), 14, 27);
    y = 40;
  };
  const section = (t: string) => {
    if (y > 260) {
      d.addPage();
      y = 18;
    }
    d.setTextColor(20, 20, 20);
    d.setFont('helvetica', 'bold');
    d.setFontSize(12);
    d.text(pdfText(t.toUpperCase()), 14, y);
    y += 2;
  };
  const table = (rows: (string | number)[][], head?: string[]) => {
    autoTable(d, {
      startY: y + 2,
      head: head ? [head.map(pdfText)] : undefined,
      body: rows.map((r) => r.map(pdfText)),
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: [27, 30, 34], textColor: [255, 255, 255] },
      margin: { left: 14, right: 14 },
    });
    y = (d as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  };
  const para = (text: string) => {
    d.setFont('helvetica', 'normal');
    d.setFontSize(9);
    d.setTextColor(80, 80, 80);
    const lines = d.splitTextToSize(pdfText(text), W - 28);
    if (y + lines.length * 4.5 > 285) {
      d.addPage();
      y = 18;
    }
    d.text(lines, 14, y + 4);
    y += lines.length * 4.5 + 4;
  };
  return { d, header, section, table, para };
}

export async function exportMonthlyPdf(r: MonthlyReport, ctx: Ctx) {
  const { d, header, section, table, para } = await doc();
  header(`Bilan de ${formatMonth(r.monthStart)}`, `Du ${formatDate(r.monthStart, { day: 'numeric', month: 'long' })} au ${formatDate(r.monthEnd, { day: 'numeric', month: 'long', year: 'numeric' })} · généré le ${new Date().toLocaleDateString('fr-FR')}`);
  section('Physique');
  table([
    ['Poids début de mois (moy. 7 premiers jours)', r.weightStart !== null ? `${fmtSmart(r.weightStart, 1)} kg` : '—'],
    ['Poids fin de mois (moy. 7 derniers jours)', r.weightEnd !== null ? `${fmtSmart(r.weightEnd, 1)} kg` : '—'],
    ['Évolution', r.weightChange !== null ? fmtSigned(r.weightChange, 1, 'kg') : '—'],
  ]);
  if (r.measurementsEnd) table(MEASUREMENT_FIELDS.map((f) => [f.label, r.measurementsStart?.[f.key] ?? '—', r.measurementsEnd?.[f.key] ?? '—']), ['Mensuration (cm)', 'Début', 'Fin']);
  section('Musculation');
  table([
    ['Séances', r.sessions],
    ['Temps total', formatDuration(r.durationMs)],
    ['Séries de travail', r.sets],
    ['Volume total', `${fmt(r.volume)} kg`],
    ['Records personnels', r.records.length],
  ]);
  if (r.mostProgressed.length) table(r.mostProgressed.map((c) => [c.name, `${fmtSmart(c.before, 1)} kg`, `${fmtSmart(c.after, 1)} kg`, fmtSigned(c.deltaPct, 1, '%')]), ['Exercice ayant le plus progressé', 'Avant (1RM est.)', 'Après', 'Évolution']);
  if (r.records.length) table(r.records.slice(0, 15).map((e) => [formatDate(e.date), ctx.exById.get(e.exerciseId)?.name ?? '', RECORD_LABELS[e.type], `${fmtSmart(e.weightKg, 2)} kg × ${e.reps}`]), ['Date', 'Exercice', 'Record', 'Série']);
  if (r.stagnating.length) para(`Exercices en stagnation : ${r.stagnating.map((s) => s.name).join(', ')}.`);
  section('Nutrition');
  table([
    ['Calories moyennes (jours saisis)', r.nutrition.avgKcal !== null ? `${fmt(r.nutrition.avgKcal)} kcal` : '—', r.targetKcal ? `objectif ${fmt(r.targetKcal)}` : ''],
    ['Protéines moyennes', r.nutrition.avgProtein !== null ? `${fmt(r.nutrition.avgProtein)} g` : '—', r.targetProtein ? `objectif ${fmt(r.targetProtein)} g` : ''],
    ['Régularité alimentaire', `${r.nutrition.loggedDays} / ${r.nutrition.days} jours`, ''],
    ['Jours dans l\'objectif calorique (± 10 %)', r.nutrition.kcalOnTargetDays, ''],
    ['Jours objectif protéique atteint (≥ 90 %)', r.nutrition.proteinOnTargetDays, ''],
  ]);
  section(`Score de régularité : ${r.consistency.score} / 100`);
  table(r.consistency.components.map((c) => [c.label, `${c.weight} pts`, `${Math.round(c.ratio * c.weight)} pts`, c.detail]), ['Composante', 'Poids', 'Obtenu', 'Détail']);
  para("Le score mesure l'assiduité du suivi (séances prévues, saisie alimentaire, protéines, pesées). Ce n'est pas une mesure scientifique de la qualité physique. Les calories sont des estimations issues des valeurs de référence des aliments.");
  d.save(`bodytrack-bilan-${r.monthStart.slice(0, 7)}.pdf`);
}

export async function exportWeeklyPdf(r: WeeklyReport, ctx: Ctx) {
  const { d, header, section, table, para } = await doc();
  header(`Bilan de la semaine`, `Du ${formatDate(r.weekStart, { day: 'numeric', month: 'long' })} au ${formatDate(r.weekEnd, { day: 'numeric', month: 'long', year: 'numeric' })}`);
  section('Entraînement');
  table([
    ['Séances', `${r.sessions}${r.plannedSessions ? ` / ${r.plannedSessions} prévues` : ''}`],
    ['Séries', r.sets],
    ['Volume', `${fmt(r.volume)} kg (semaine précédente : ${fmt(r.prevVolume)} kg)`],
    ['Records battus', r.records.length],
  ]);
  if (r.records.length) table(r.records.slice(0, 10).map((e) => [formatDate(e.date), ctx.exById.get(e.exerciseId)?.name ?? '', RECORD_LABELS[e.type], `${fmtSmart(e.weightKg, 2)} kg × ${e.reps}`]), ['Date', 'Exercice', 'Record', 'Série']);
  if (r.loadChanges.length) table(r.loadChanges.slice(0, 10).map((c) => [c.name, `${fmtSmart(c.before, 1)} → ${fmtSmart(c.after, 1)} kg`, fmtSigned(c.deltaPct, 1, '%')]), ['Évolution des charges (1RM est.)', '', '']);
  section('Nutrition & poids');
  table([
    ['Calories moyennes', r.nutrition.avgKcal !== null ? `${fmt(r.nutrition.avgKcal)} kcal${r.targetKcal ? ` (objectif ${fmt(r.targetKcal)})` : ''}` : '—'],
    ['Protéines moyennes', r.nutrition.avgProtein !== null ? `${fmt(r.nutrition.avgProtein)} g${r.targetProtein ? ` (objectif ${fmt(r.targetProtein)} g)` : ''}` : '—'],
    ['Jours saisis', `${r.nutrition.loggedDays} / ${r.nutrition.days}`],
    ['Poids moyen', r.weightAvg !== null ? `${fmtSmart(r.weightAvg, 2)} kg${r.prevWeightAvg !== null ? ` (${fmtSigned(r.weightAvg - r.prevWeightAvg, 2, 'kg')})` : ''}` : '—'],
    ['Score de régularité', `${r.consistency.score} / 100`],
  ]);
  section('Recommandations prioritaires');
  r.recommendations.forEach((i, k) => para(`${k + 1}. ${i.title} — ${i.text}`));
  d.save(`bodytrack-semaine-${r.weekStart}.pdf`);
}
