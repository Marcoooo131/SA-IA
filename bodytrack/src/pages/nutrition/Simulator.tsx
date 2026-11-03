import { useMemo, useState } from 'react';
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, Field, Notice, NumberInput, PageHeader, SectionTitle, Segmented, SubNav, cx } from '../../components/ui';
import { ChartTooltip, Legend, SERIES, axisProps, gridProps } from '../../components/charts';
import { NUTRITION_NAV } from './Journal';
import { useCtx, useToday } from '../../lib/useCtx';
import { HORIZONS, daysToTarget, equilibriumWeight, naiveLinear, simulate } from '../../lib/calc/simulation';
import { activityFactor } from '../../lib/calc/metabolism';
import { movingAverage } from '../../lib/calc/weight';
import { addDays, formatDate } from '../../lib/dates';
import { fmt, fmtSigned, fmtSmart } from '../../lib/format';

const NAMES = ['A', 'B', 'C', 'D'];

export default function Simulator() {
  const ctx = useCtx();
  const t = useToday();
  const p = ctx.data.profile!;
  const goal = ctx.goalOn(t);
  const startDefault = Math.round((movingAverage(ctx.data.weights, t, 7) ?? p.startWeightKg) * 10) / 10;
  const maint = goal?.maintenanceKcal ?? 2500;
  const sign = p.goal === 'cut' ? -1 : 1;
  const [weight, setWeight] = useState<number | null>(startDefault);
  const [target, setTarget] = useState<number | null>(p.targetWeightKg);
  const [maintenance, setMaintenance] = useState<number | null>(maint);
  const [intakes, setIntakes] = useState<(number | null)[]>([0, 200, 400, 600].map((d) => Math.round((maint + sign * d) / 50) * 50));
  const [active, setActive] = useState(goal ? Math.max(0, [0, 200, 400, 600].findIndex((d) => Math.abs(maint + sign * d - goal.calories) < 100)) : 1);
  const [horizon, setHorizon] = useState('182');
  const af = activityFactor(p.activityLevel);
  const days = Number(horizon);
  const valid = !!weight && weight > 30 && !!maintenance && maintenance > 1000;

  const sims = useMemo(
    () => (valid ? intakes.map((kcal) => (kcal ? simulate({ startWeightKg: weight!, maintenanceKcal: maintenance!, intakeKcal: kcal, days: 365, activityFactor: af }) : null)) : []),
    [valid, intakes, weight, maintenance, af],
  );
  const step = days <= 31 ? 1 : days <= 182 ? 3 : 7;
  const chart = useMemo(() => {
    const out: Record<string, number | string | number[] | null>[] = [];
    for (let d = 0; d <= days; d += step) {
      const row: Record<string, number | string | number[] | null> = { day: d, label: formatDate(addDays(t, d)) };
      sims.forEach((s, i) => {
        if (!s) return;
        row[`s${i}`] = s[d].central;
        if (i === active) row.band = [s[d].low, s[d].high];
      });
      out.push(row);
    }
    return out;
  }, [sims, days, step, t, active]);

  return (
    <div>
      <PageHeader title="Simulateur" subtitle="Projection de l'évolution du poids selon tes apports" />
      <SubNav items={NUTRITION_NAV} active="/nutrition/simulator" />
      <div className="grid lg:grid-cols-[320px_1fr] gap-5">
        <div className="space-y-4">
          <Card className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Poids actuel">
                <NumberInput value={weight} onChange={setWeight} suffix="kg" />
              </Field>
              <Field label="Objectif">
                <NumberInput value={target} onChange={setTarget} suffix="kg" />
              </Field>
            </div>
            <Field label="Dépense de maintien estimée" hint="Issue de ton objectif actuel ; modifiable pour tester">
              <NumberInput value={maintenance} onChange={setMaintenance} suffix="kcal" inputMode="numeric" />
            </Field>
          </Card>
          <Card>
            <div className="label">Scénarios (apport quotidien)</div>
            <div className="space-y-2">
              {intakes.map((v, i) => (
                <div key={i} className={cx('flex items-center gap-2 rounded-xl p-1.5 transition', active === i && 'bg-surface-2')}>
                  <button type="button" onClick={() => setActive(i)} className={cx('size-8 shrink-0 rounded-lg grid place-items-center text-xs font-bold', active === i ? 'text-accent-ink' : 'text-ink')} style={{ background: active === i ? SERIES[i] : `${SERIES[i]}33` }} aria-label={`Afficher la fourchette du scénario ${NAMES[i]}`}>
                    {NAMES[i]}
                  </button>
                  <NumberInput value={v} onChange={(n) => setIntakes(intakes.map((x, j) => (j === i ? n : x)))} suffix="kcal" inputMode="numeric" className="flex-1" />
                  <span className="text-xs text-muted w-16 text-right tnum">{v && maintenance ? fmtSigned(v - maintenance, 0) : '—'}</span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-faint mt-2">Touche une lettre pour afficher la fourchette de ce scénario.</p>
          </Card>
        </div>

        <div className="space-y-4">
          <Segmented className="w-full" value={horizon} onChange={setHorizon} options={HORIZONS.map((h) => ({ value: String(h.days), label: h.label }))} />
          <Card>
            {valid ? (
              <>
                <Legend items={[...intakes.map((v, i) => ({ label: `${NAMES[i]} · ${v ? fmt(v) : '—'} kcal`, color: SERIES[i] })), ...(target ? [{ label: 'Objectif', color: '#8b929c', dashed: true }] : [])]} />
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chart} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
                      <CartesianGrid {...gridProps} />
                      <XAxis dataKey="label" {...axisProps} minTickGap={28} />
                      <YAxis {...axisProps} domain={['auto', 'auto']} width={44} tickFormatter={(v: number) => fmtSmart(v, 1)} />
                      <Tooltip content={<ChartTooltip valueFormatter={(v) => `${fmtSmart(v, 1)} kg`} />} cursor={{ stroke: '#5b626b' }} />
                      <Area dataKey="band" name="_band" stroke="none" fill={SERIES[active]} fillOpacity={0.15} isAnimationActive={false} />
                      {target && <ReferenceLine y={target} stroke="#8b929c" strokeDasharray="4 4" />}
                      {intakes.map((v, i) => v && <Line key={i} dataKey={`s${i}`} name={`Scénario ${NAMES[i]}`} stroke={SERIES[i]} strokeWidth={i === active ? 2.5 : 1.5} dot={false} isAnimationActive={false} />)}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-[11px] text-faint mt-2">Zone colorée : fourchette du scénario {NAMES[active]} (incertitude de ± 5 % sur le maintien et sur la nature des tissus gagnés ou perdus).</p>
              </>
            ) : (
              <p className="text-sm text-muted py-10 text-center">Renseigne ton poids et ta dépense de maintien.</p>
            )}
          </Card>

          {valid && (
            <Card className="overflow-x-auto">
              <table className="w-full text-sm tnum min-w-[520px]">
                <thead>
                  <tr className="text-xs text-muted text-left">
                    <th className="py-2 font-medium">Horizon</th>
                    {intakes.map((v, i) => (
                      <th key={i} className="py-2 font-medium">
                        <span className="inline-block size-2 rounded-full mr-1.5" style={{ background: SERIES[i] }} />
                        {NAMES[i]} · {v ? fmt(v) : '—'}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {HORIZONS.map((h) => (
                    <tr key={h.days} className="border-t border-line">
                      <td className="py-2 text-muted">{h.label}</td>
                      {sims.map((s, i) => (
                        <td key={i} className="py-2">
                          {s ? (
                            <>
                              <div className="font-semibold">{fmtSmart(s[h.days].central, 1)} kg</div>
                              <div className="text-[11px] text-faint">
                                {fmtSmart(s[h.days].low, 1)} – {fmtSmart(s[h.days].high, 1)} · {fmtSigned(s[h.days].central - weight!, 1)}
                              </div>
                            </>
                          ) : (
                            '—'
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {target && (
                    <tr className="border-t border-line">
                      <td className="py-2 text-muted">Objectif {fmtSmart(target, 1)} kg</td>
                      {sims.map((s, i) => {
                        const d = s ? daysToTarget(s, weight!, target) : null;
                        return (
                          <td key={i} className="py-2 text-xs">
                            {d === null ? <span className="text-faint">Non atteint en 1 an</span> : d === 0 ? 'Déjà atteint' : `≈ ${d < 60 ? `${d} jours` : `${fmtSmart(d / 30.4, 1)} mois`}`}
                          </td>
                        );
                      })}
                    </tr>
                  )}
                </tbody>
              </table>
            </Card>
          )}

          {valid && sims[active] && (
            <>
              <SectionTitle>Pourquoi pas une simple règle de 7 700 kcal ?</SectionTitle>
              <Card className="text-sm text-muted space-y-2">
                <p>
                  Le modèle tient compte de l'évolution de ta dépense avec ton poids : en prenant du poids, tu dépenses davantage (≈ {fmt(10 * af)} kcal par kg et par jour selon ton niveau d'activité), si bien que l'écart calorique se réduit.
                </p>
                <p className="tnum">
                  Scénario {NAMES[active]} à 12 mois : <strong className="text-ink">{fmtSmart(sims[active]![365].central, 1)} kg</strong> (fourchette {fmtSmart(sims[active]![365].low, 1)} – {fmtSmart(sims[active]![365].high, 1)}), contre {fmtSmart(naiveLinear(weight!, intakes[active]! - maintenance!, 365), 1)} kg avec la règle linéaire. Dépense estimée en fin de période : {fmt(sims[active]![365].tdee)} kcal. Équilibre théorique : {fmtSmart(equilibriumWeight(weight!, maintenance!, intakes[active]!, af), 1)} kg.
                </p>
              </Card>
            </>
          )}
          <Notice>
            Projection théorique, pas une prédiction. Le poids réel fluctue de jour en jour (eau, glycogène, sel, contenu digestif) : un changement de 1 à 2 kg en quelques jours est courant, surtout au début d'une prise de masse ou d'une sèche. Fie-toi à la moyenne sur 7 jours et ajuste après quelques semaines.
          </Notice>
        </div>
      </div>
    </div>
  );
}
