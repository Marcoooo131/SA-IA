import { useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { GoalType } from '../../lib/types';
import { Button, Card, Field, Notice, NumberInput, PageHeader, SectionTitle, Segmented, SubNav } from '../../components/ui';
import { NUTRITION_NAV } from './Journal';
import { useCtx, useToday } from '../../lib/useCtx';
import { ACTIVITY_LEVELS, ADJUSTMENT_LIMITS, DEFAULT_ADJUSTMENT, DEFAULT_PROTEIN_PER_KG, caloriesFromMacros, computeMetabolicPlan, macroSplit, observedTdee } from '../../lib/calc/metabolism';
import { ageFromBirthDate, addDays, formatDate } from '../../lib/dates';
import { movingAverage, weightSlope } from '../../lib/calc/weight';
import { nutritionAverages } from '../../lib/analytics/stats';
import { recomputeNutritionGoal, saveNutritionGoal } from '../../lib/actions';
import { store } from '../../lib/store/store';
import { fmt, fmtSigned, fmtSmart } from '../../lib/format';
import { toast } from '../../components/toast';
import { confirmDialog } from '../../components/confirm';

export default function NutritionGoals() {
  const ctx = useCtx();
  const t = useToday();
  const p = ctx.data.profile!;
  const cur = ctx.goalOn(t);
  const weight = movingAverage(ctx.data.weights, t, 7) ?? p.startWeightKg;
  const [goal, setGoal] = useState<GoalType>(cur?.goal ?? p.goal);
  const [adj, setAdj] = useState(cur && cur.goal === goal ? cur.calorieAdjustment : DEFAULT_ADJUSTMENT[goal]);
  const [ppk, setPpk] = useState(cur?.proteinPerKg ?? DEFAULT_PROTEIN_PER_KG[goal]);
  const [fpk, setFpk] = useState(cur?.fatPerKg ?? 0.9);
  const plan = useMemo(() => computeMetabolicPlan({ sex: p.sex, age: ageFromBirthDate(p.birthDate), heightCm: p.heightCm, weightKg: weight, activityLevel: p.activityLevel, goal, adjustment: adj, proteinPerKg: ppk, fatPerKg: fpk }), [p, weight, goal, adj, ppk, fpk]);

  // Saisie manuelle
  const [mKcal, setMKcal] = useState<number | null>(cur?.calories ?? null);
  const [mP, setMP] = useState<number | null>(cur?.proteinG ?? null);
  const [mC, setMC] = useState<number | null>(cur?.carbsG ?? null);
  const [mF, setMF] = useState<number | null>(cur?.fatG ?? null);
  const macroKcal = mP !== null && mC !== null && mF !== null ? caloriesFromMacros(mP, mC, mF) : null;

  // Dépense observée (28 jours)
  const n28 = nutritionAverages(ctx, addDays(t, -27), t);
  const slope = weightSlope(ctx.data.weights, t, 28);
  const obs = n28.loggedDays >= 14 && slope !== null && n28.avgKcal ? observedTdee(n28.avgKcal, slope) : null;

  const history = [...ctx.data.nutritionGoals].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom)).slice(0, 8);

  const applyAuto = () => {
    if (goal !== p.goal) store().saveProfile({ ...p, goal });
    saveNutritionGoal({ goal, calorieAdjustment: plan.adjustment, maintenanceKcal: plan.maintenance, calories: plan.calories, proteinG: plan.proteinG, carbsG: plan.carbsG, fatG: plan.fatG, mode: 'auto', proteinPerKg: ppk, fatPerKg: fpk });
    setMKcal(plan.calories);
    setMP(plan.proteinG);
    setMC(plan.carbsG);
    setMF(plan.fatG);
    toast('Objectifs mis à jour', `${fmt(plan.calories)} kcal · P ${plan.proteinG} g · G ${plan.carbsG} g · L ${plan.fatG} g`);
  };

  return (
    <div>
      <PageHeader title="Objectifs" subtitle="Calculateur métabolique et cibles nutritionnelles" />
      <SubNav items={NUTRITION_NAV} active="/nutrition/goals" />

      {cur && (
        <Card className="mb-5 !border-accent/30">
          <div className="text-xs text-muted mb-2">Objectif actuel {cur.mode === 'manual' ? '(saisi manuellement)' : '(calculé)'} — depuis le {formatDate(cur.effectiveFrom, { day: 'numeric', month: 'long', year: 'numeric' })}</div>
          <div className="grid grid-cols-4 gap-2 text-center">
            {[
              ['Calories', `${fmt(cur.calories)}`, 'kcal'],
              ['Protéines', `${fmt(cur.proteinG)}`, 'g'],
              ['Glucides', `${fmt(cur.carbsG)}`, 'g'],
              ['Lipides', `${fmt(cur.fatG)}`, 'g'],
            ].map(([l, v, u]) => (
              <div key={l}>
                <div className="display text-2xl font-bold tnum">{v}</div>
                <div className="text-[10px] uppercase text-muted">
                  {l} ({u})
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid lg:grid-cols-2 gap-5">
        <section>
          <SectionTitle>Calcul automatique</SectionTitle>
          <Card className="space-y-4">
            <Segmented
              className="w-full"
              value={goal}
              onChange={(g) => {
                setGoal(g);
                setAdj(DEFAULT_ADJUSTMENT[g]);
                setPpk(DEFAULT_PROTEIN_PER_KG[g]);
              }}
              options={[
                { value: 'bulk', label: 'Prise de masse' },
                { value: 'maintain', label: 'Maintien' },
                { value: 'cut', label: 'Sèche' },
              ]}
            />
            {goal !== 'maintain' && (
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="label !mb-0">{goal === 'bulk' ? 'Surplus' : 'Déficit'} quotidien</span>
                  <span className="tnum font-semibold">{fmtSigned(adj, 0, 'kcal')}</span>
                </div>
                <input type="range" className="w-full accent-[var(--color-accent)]" min={ADJUSTMENT_LIMITS[goal][0]} max={ADJUSTMENT_LIMITS[goal][1]} step={25} value={adj} onChange={(e) => setAdj(Number(e.target.value))} aria-label="Ajustement calorique" />
                <div className="text-[11px] text-faint">
                  Variation de départ estimée : {fmtSigned(plan.weeklyChangeKg, 2, 'kg')} par semaine ({fmtSigned((plan.weeklyChangeKg / weight) * 100, 2)} % du poids). Bornes volontairement modérées.
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Protéines (g/kg)" hint="1,6 à 2,2 g/kg conseillés pour la musculation">
                <input type="range" className="w-full accent-[var(--color-accent)]" min={1.2} max={2.5} step={0.1} value={ppk} onChange={(e) => setPpk(Number(e.target.value))} />
                <div className="text-sm tnum">{ppk.toLocaleString('fr-FR')} g/kg → {Math.round(ppk * weight)} g</div>
              </Field>
              <Field label="Lipides (g/kg)" hint="Minimum 0,6 g/kg">
                <input type="range" className="w-full accent-[var(--color-accent)]" min={0.6} max={1.5} step={0.1} value={fpk} onChange={(e) => setFpk(Number(e.target.value))} />
                <div className="text-sm tnum">{fpk.toLocaleString('fr-FR')} g/kg → {Math.round(fpk * weight)} g</div>
              </Field>
            </div>
            <div className="rounded-xl bg-surface-2 p-3 text-sm space-y-1.5 tnum">
              <Row l="Métabolisme de base (Mifflin-St Jeor)" v={`${fmt(plan.bmr)} kcal`} />
              <Row l={`Dépense journalière (× ${ACTIVITY_LEVELS.find((a) => a.value === p.activityLevel)?.factor.toLocaleString('fr-FR')})`} v={`${fmt(plan.tdee)} kcal`} />
              <Row l="Maintien estimé" v={`${fmt(plan.maintenance)} kcal`} />
              <Row l="Calories recommandées" v={`${fmt(plan.calories)} kcal`} strong />
              <Row l="Protéines · Glucides · Lipides" v={`${plan.proteinG} · ${plan.carbsG} · ${plan.fatG} g`} />
            </div>
            <p className="text-[11px] text-faint">
              Calcul basé sur ton poids moyen ({fmtSmart(weight, 1)} kg), ta taille, ton âge et ton niveau d'activité ({ACTIVITY_LEVELS.find((a) => a.value === p.activityLevel)?.label.toLowerCase()}, modifiable dans le Profil). Les glucides complètent les calories restantes. Ce sont des estimations.
            </p>
            <Button variant="primary" className="w-full" onClick={applyAuto}>
              Appliquer ces objectifs
            </Button>
          </Card>

          {obs !== null && cur && (
            <Card className="mt-4">
              <div className="font-semibold text-sm">Correction par tes données réelles</div>
              <p className="text-sm text-muted mt-1">
                Sur 28 jours : apport moyen de {fmt(n28.avgKcal)} kcal ({n28.loggedDays} jours saisis) et poids {fmtSigned((slope ?? 0) * 7, 2, 'kg')}/semaine. Ta dépense réelle serait d'environ <strong className="text-ink">{fmt(obs)} kcal</strong> (estimation : {fmt(cur.maintenanceKcal)} kcal).
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-3"
                icon={<RefreshCw size={14} />}
                onClick={async () => {
                  if (await confirmDialog({ title: 'Utiliser ta dépense observée ?', text: `Le maintien passera à ${fmt(Math.round(obs / 10) * 10)} kcal, avec le même ${cur.goal === 'cut' ? 'déficit' : 'surplus'}.`, confirmLabel: 'Appliquer' })) {
                    recomputeNutritionGoal({ maintenanceOverride: Math.round(obs / 10) * 10 });
                    toast('Maintien recalé sur tes données');
                  }
                }}
              >
                Recaler mon maintien
              </Button>
              <p className="text-[11px] text-faint mt-2">Oublis de saisie et variations d'eau ou de glycogène peuvent fausser ce calcul. Il n'est appliqué qu'avec ta validation.</p>
            </Card>
          )}
        </section>

        <section>
          <SectionTitle>Saisie manuelle</SectionTitle>
          <Card className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Calories cibles">
                <NumberInput value={mKcal} onChange={setMKcal} suffix="kcal" inputMode="numeric" />
              </Field>
              <Field label="Protéines">
                <NumberInput value={mP} onChange={setMP} suffix="g" />
              </Field>
              <Field label="Glucides">
                <NumberInput value={mC} onChange={setMC} suffix="g" />
              </Field>
              <Field label="Lipides">
                <NumberInput value={mF} onChange={setMF} suffix="g" />
              </Field>
            </div>
            {macroKcal !== null && mKcal !== null && Math.abs(macroKcal - mKcal) > 50 && (
              <Notice tone="warn">
                Tes macros correspondent à {fmt(macroKcal)} kcal (4/4/9), soit {fmtSigned(macroKcal - mKcal, 0)} kcal par rapport à ta cible.{' '}
                <button type="button" className="underline" onClick={() => mKcal && cur && (() => { const m = macroSplit(mKcal, weight, mP && weight ? mP / weight : cur.proteinPerKg, mF && weight ? mF / weight : cur.fatPerKg); setMC(m.carbsG); })()}>
                  Ajuster les glucides
                </button>
              </Notice>
            )}
            <Button
              variant="secondary"
              className="w-full"
              disabled={!mKcal || mKcal < 1000 || mKcal > 6000 || mP === null || mC === null || mF === null}
              onClick={() => {
                saveNutritionGoal({ goal: p.goal, calorieAdjustment: mKcal! - (cur?.maintenanceKcal ?? plan.maintenance), maintenanceKcal: cur?.maintenanceKcal ?? plan.maintenance, calories: Math.round(mKcal!), proteinG: Math.round(mP!), carbsG: Math.round(mC!), fatG: Math.round(mF!), mode: 'manual', proteinPerKg: mP! / weight, fatPerKg: mF! / weight });
                toast('Objectifs manuels enregistrés');
              }}
            >
              Enregistrer mes valeurs
            </Button>
            <p className="text-[11px] text-faint">Entre 1 000 et 6 000 kcal. L'historique des objectifs est conservé : les jours passés restent comparés à l'objectif en vigueur à cette date.</p>
          </Card>

          {history.length > 1 && (
            <Card className="mt-4">
              <div className="label">Historique des objectifs</div>
              <ul className="text-sm divide-y divide-line">
                {history.map((g) => (
                  <li key={g.id} className="py-2 flex justify-between tnum">
                    <span className="text-muted">{formatDate(g.effectiveFrom, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    <span>
                      {fmt(g.calories)} kcal · P {g.proteinG} · G {g.carbsG} · L {g.fatG}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </section>
      </div>
    </div>
  );
}

function Row({ l, v, strong }: { l: string; v: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted">{l}</span>
      <span className={strong ? 'text-accent font-semibold' : ''}>{v}</span>
    </div>
  );
}
