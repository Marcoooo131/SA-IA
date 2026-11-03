import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { BodyMeasurement, MeasurementKey } from '../../lib/types';
import { Button, Card, Chip, Delta, EmptyState, Field, IconButton, NumberInput, PageHeader, Sheet, SubNav } from '../../components/ui';
import { ACCENT, ChartTooltip, DataTable, axisProps, gridProps } from '../../components/charts';
import { PROGRESS_NAV } from './nav';
import { useCtx, useToday } from '../../lib/useCtx';
import { MEASUREMENT_FIELDS } from '../../lib/analytics/reports';
import { formatDate } from '../../lib/dates';
import { fmtSmart, nowISO, uid } from '../../lib/format';
import { store } from '../../lib/store/store';
import { confirmDialog } from '../../components/confirm';
import { toast } from '../../components/toast';

export default function Measurements() {
  const ctx = useCtx();
  const [edit, setEdit] = useState<BodyMeasurement | 'new' | null>(null);
  const [key, setKey] = useState<MeasurementKey>('waistCm');
  const list = useMemo(() => [...ctx.data.measurements].sort((a, b) => a.date.localeCompare(b.date)), [ctx]);
  const series = list.filter((m) => m[key] !== null).map((m) => ({ label: formatDate(m.date), value: m[key] }));

  return (
    <div>
      <PageHeader title="Mensurations" subtitle="Tours mesurés au mètre ruban, en centimètres" action={<Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => setEdit('new')}>Mesurer</Button>} />
      <SubNav items={PROGRESS_NAV} active="/progress/measurements" />
      {!list.length ? (
        <EmptyState title="Aucune mensuration" text="Mesure-toi toutes les 2 à 4 semaines, au même moment de la journée, pour suivre ton évolution au-delà du poids." action={<Button variant="primary" onClick={() => setEdit('new')}>Ajouter des mesures</Button>} />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
            {MEASUREMENT_FIELDS.map((f) => {
              const vals = list.filter((m) => m[f.key] !== null);
              const first = vals[0]?.[f.key] ?? null;
              const last = vals[vals.length - 1]?.[f.key] ?? null;
              return (
                <Card key={f.key} onClick={() => setKey(f.key)} className={key === f.key ? '!border-accent/50' : ''}>
                  <div className="text-[11px] uppercase tracking-wider text-muted">{f.label}</div>
                  <div className="display text-2xl font-bold tnum">{last !== null ? `${fmtSmart(last, 1)} cm` : '—'}</div>
                  <div className="text-xs text-muted">
                    {vals.length >= 2 ? (
                      <>
                        <Delta value={last! - first!} unit="cm" invert={f.key === 'waistCm' || f.key === 'hipsCm'} /> depuis le {formatDate(vals[0].date)}
                      </>
                    ) : (
                      'Une seule mesure'
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
          <Card className="mb-4">
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar mb-3">
              {MEASUREMENT_FIELDS.map((f) => (
                <Chip key={f.key} active={key === f.key} onClick={() => setKey(f.key)}>
                  {f.label}
                </Chip>
              ))}
            </div>
            {series.length >= 2 ? (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
                    <CartesianGrid {...gridProps} />
                    <XAxis dataKey="label" {...axisProps} minTickGap={24} />
                    <YAxis {...axisProps} domain={['dataMin - 1', 'dataMax + 1']} width={44} />
                    <Tooltip content={<ChartTooltip valueFormatter={(v) => `${fmtSmart(v, 1)} cm`} />} cursor={{ stroke: '#5b626b' }} />
                    <Line dataKey="value" name={MEASUREMENT_FIELDS.find((f) => f.key === key)!.label} stroke={ACCENT} strokeWidth={2} dot={{ r: 4, fill: ACCENT, stroke: 'var(--color-surface)', strokeWidth: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-sm text-muted text-center py-8">Au moins deux mesures sont nécessaires pour tracer l'évolution.</p>
            )}
            <DataTable columns={['Date', ...MEASUREMENT_FIELDS.map((f) => f.label)]} rows={[...list].reverse().map((m) => [formatDate(m.date), ...MEASUREMENT_FIELDS.map((f) => m[f.key] ?? '—')])} summary="Voir toutes les mesures" />
          </Card>
          <div className="space-y-2">
            {[...list].reverse().map((m) => (
              <Card key={m.id} className="!p-3">
                <div className="flex items-center gap-3">
                  <button type="button" className="flex-1 text-left min-w-0" onClick={() => setEdit(m)}>
                    <div className="text-sm font-medium">{formatDate(m.date, { day: 'numeric', month: 'long', year: 'numeric' })}</div>
                    <div className="text-xs text-muted truncate tnum">
                      {MEASUREMENT_FIELDS.filter((f) => m[f.key] !== null)
                        .map((f) => `${f.label} ${fmtSmart(m[f.key], 1)}`)
                        .join(' · ')}
                    </div>
                  </button>
                  <IconButton
                    label="Supprimer"
                    onClick={async () => {
                      if (await confirmDialog({ title: 'Supprimer ces mesures ?', confirmLabel: 'Supprimer', danger: true })) store().remove('measurements', m.id);
                    }}
                  >
                    <Trash2 size={14} />
                  </IconButton>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
      {edit && <MeasurementSheet initial={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function MeasurementSheet({ initial, onClose }: { initial?: BodyMeasurement; onClose: () => void }) {
  const t = useToday();
  const ctx = useCtx();
  const last = [...ctx.data.measurements].sort((a, b) => b.date.localeCompare(a.date))[0];
  const [m, setM] = useState<BodyMeasurement>(initial ?? { id: uid(), date: t, chestCm: null, waistCm: null, armCm: null, thighCm: null, hipsCm: null, calfCm: null, note: '', updatedAt: nowISO() });
  const any = MEASUREMENT_FIELDS.some((f) => m[f.key] !== null) && MEASUREMENT_FIELDS.every((f) => m[f.key] === null || (m[f.key]! >= 10 && m[f.key]! <= 250));
  return (
    <Sheet
      open
      onClose={onClose}
      title={initial ? 'Modifier les mesures' : 'Nouvelles mesures'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button
            variant="primary"
            disabled={!any}
            onClick={() => {
              store().upsert('measurements', m);
              toast('Mesures enregistrées');
              onClose();
            }}
          >
            Enregistrer
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Date">
          <input type="date" className="field" value={m.date} max={t} onChange={(e) => setM({ ...m, date: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          {MEASUREMENT_FIELDS.map((f) => (
            <Field key={f.key} label={f.label} hint={last && !initial && last[f.key] !== null ? `Précédent : ${fmtSmart(last[f.key], 1)} cm` : undefined}>
              <NumberInput value={m[f.key]} onChange={(v) => setM({ ...m, [f.key]: v })} suffix="cm" />
            </Field>
          ))}
        </div>
        <Field label="Note">
          <input className="field" value={m.note} onChange={(e) => setM({ ...m, note: e.target.value })} maxLength={140} />
        </Field>
        <p className="text-[11px] text-faint">Laisse vide une mesure non prise. Bras et cuisse : mesure toujours le même côté, au point le plus large.</p>
      </div>
    </Sheet>
  );
}
