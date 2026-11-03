import { useMemo, useState } from 'react';
import { Medal, Trophy } from 'lucide-react';
import { Badge, Card, EmptyState, PageHeader, Segmented, SubNav } from '../../components/ui';
import { MuscleDot } from '../../components/ExercisePicker';
import { useCtx } from '../../lib/useCtx';
import { TRAINING_NAV } from './TrainingHome';
import { exerciseRecords, RECORD_LABELS } from '../../lib/calc/training';
import { allRecordEvents } from '../../lib/analytics/stats';
import { formatDate } from '../../lib/dates';
import { fmt, fmtSmart } from '../../lib/format';
import { navigate } from '../../lib/router';

type Cat = 'e1rm' | 'set' | 'volume' | 'timeline';

export default function Records() {
  const ctx = useCtx();
  const [cat, setCat] = useState<Cat>('e1rm');
  const rows = useMemo(
    () =>
      [...ctx.practicedExerciseIds]
        .map((id) => ({ id, ex: ctx.exById.get(id)!, r: exerciseRecords(ctx.history(id)) }))
        .filter((x) => x.ex),
    [ctx],
  );
  const timeline = useMemo(() => allRecordEvents(ctx).filter((e) => e.type !== 'setVolume').slice(0, 60), [ctx]);
  const sorted = [...rows].sort((a, b) =>
    cat === 'e1rm' ? (b.r.bestE1rm?.value ?? 0) - (a.r.bestE1rm?.value ?? 0) : cat === 'set' ? (b.r.bestSetVolume?.value ?? 0) - (a.r.bestSetVolume?.value ?? 0) : (b.r.bestSessionVolume?.value ?? 0) - (a.r.bestSessionVolume?.value ?? 0),
  );

  return (
    <div>
      <PageHeader title="Records" subtitle="Calculés à partir de toutes tes séries validées (hors échauffement)" />
      <SubNav items={TRAINING_NAV} active="/training/records" />
      <Segmented
        className="w-full mb-4"
        value={cat}
        onChange={setCat}
        options={[
          { value: 'e1rm', label: 'Force max.' },
          { value: 'set', label: 'Meilleure série' },
          { value: 'volume', label: 'Volume' },
          { value: 'timeline', label: 'Historique' },
        ]}
      />
      {!rows.length && <EmptyState icon={<Trophy size={22} />} title="Aucun record pour l'instant" text="Termine des séances : tes meilleures performances par exercice apparaîtront ici." />}
      {cat !== 'timeline' ? (
        <div className="space-y-2">
          {sorted.map(({ id, ex, r }, i) => (
            <Card key={id} onClick={() => navigate(`/exercises/${id}`)} className="!p-3">
              <div className="flex items-center gap-3">
                <span className="w-6 text-center display font-bold text-faint">{i + 1}</span>
                <MuscleDot muscle={ex.primaryMuscle} size={32} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{ex.name}</div>
                  <div className="text-xs text-muted">
                    {cat === 'e1rm' && r.bestE1rm && `${fmtSmart(r.bestE1rm.weightKg, 2)} kg × ${r.bestE1rm.reps} · ${formatDate(r.bestE1rm.date)}`}
                    {cat === 'e1rm' && !r.bestE1rm && r.maxReps && `${r.maxReps.value} reps (poids du corps)`}
                    {cat === 'set' && r.bestSetVolume && `${fmtSmart(r.bestSetVolume.weightKg, 2)} kg × ${r.bestSetVolume.reps} · ${formatDate(r.bestSetVolume.date)}`}
                    {cat === 'volume' && r.bestSessionVolume && `Séance du ${formatDate(r.bestSessionVolume.date)} · ${r.sessions} séances au total`}
                  </div>
                </div>
                <div className="text-right">
                  <div className="display text-xl font-bold tnum">
                    {cat === 'e1rm' ? (r.bestE1rm ? `${fmtSmart(r.bestE1rm.value, 1)}` : r.maxReps?.value ?? '—') : cat === 'set' ? fmt(r.bestSetVolume?.value ?? 0) : fmt(r.bestSessionVolume?.value ?? 0)}
                  </div>
                  <div className="text-[10px] text-muted">{cat === 'e1rm' ? (r.bestE1rm ? 'kg estimés' : 'reps') : 'kg'}</div>
                </div>
              </div>
            </Card>
          ))}
          {cat === 'e1rm' && rows.length > 0 && <p className="text-[11px] text-faint pt-2">1RM estimé avec la formule d'Epley : charge × (1 + reps / 30). C'est une estimation, moins fiable au-delà de 10 répétitions.</p>}
        </div>
      ) : (
        <div className="space-y-2">
          {timeline.map((e, i) => (
            <Card key={i} className="!p-3" onClick={() => navigate(`/exercises/${e.exerciseId}`)}>
              <div className="flex items-center gap-3">
                <Medal size={18} className="text-accent shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{ctx.exById.get(e.exerciseId)?.name}</div>
                  <div className="text-xs text-muted">
                    {RECORD_LABELS[e.type]} : {e.type === 'reps' ? `${e.value} reps à ${fmtSmart(e.weightKg, 2)} kg` : e.type === 'sessionVolume' ? `${fmt(e.value)} kg` : `${fmtSmart(e.value, 1)} kg`}
                    {e.previous !== null && e.previous > 0 && <span className="text-faint"> (avant : {e.type === 'reps' ? e.previous : fmtSmart(e.previous, 1)})</span>}
                  </div>
                </div>
                <Badge>{formatDate(e.date)}</Badge>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
