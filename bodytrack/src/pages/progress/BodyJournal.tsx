import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { JournalEntry } from '../../lib/types';
import { Button, Card, EmptyState, Field, IconButton, NumberInput, PageHeader, Sheet, SubNav, cx } from '../../components/ui';
import { PROGRESS_NAV } from './nav';
import { useCtx, useToday } from '../../lib/useCtx';
import { formatDate } from '../../lib/dates';
import { fmtSmart, mean, nowISO, uid } from '../../lib/format';
import { store } from '../../lib/store/store';
import { confirmDialog } from '../../components/confirm';

const SCALES: { key: 'energy' | 'sleepQuality' | 'motivation'; label: string }[] = [
  { key: 'energy', label: 'Énergie' },
  { key: 'sleepQuality', label: 'Sommeil' },
  { key: 'motivation', label: 'Motivation' },
];

export default function BodyJournal() {
  const ctx = useCtx();
  const [edit, setEdit] = useState<JournalEntry | 'new' | null>(null);
  const list = [...ctx.data.journal].sort((a, b) => b.date.localeCompare(a.date));
  const recent = list.slice(0, 7);
  return (
    <div>
      <PageHeader title="Journal" subtitle="Sensations, énergie, sommeil, motivation" action={<Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => setEdit('new')}>Écrire</Button>} />
      <SubNav items={PROGRESS_NAV} active="/progress/journal" />
      {recent.length >= 2 && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          {SCALES.map((s) => (
            <Card key={s.key} className="!p-3 text-center">
              <div className="text-[11px] uppercase text-muted">{s.label}</div>
              <div className="display text-2xl font-bold tnum">{fmtSmart(mean(recent.map((e) => e[s.key]).filter((v): v is number => v !== null)), 1)}<span className="text-sm text-muted"> /5</span></div>
              <div className="text-[10px] text-faint">{recent.length} dernières entrées</div>
            </Card>
          ))}
        </div>
      )}
      {!list.length ? (
        <EmptyState title="Journal vide" text="Note régulièrement tes sensations : le contexte aide à comprendre une séance difficile ou une variation de poids." action={<Button variant="primary" onClick={() => setEdit('new')}>Première entrée</Button>} />
      ) : (
        <div className="space-y-2">
          {list.map((e) => (
            <Card key={e.id} className="!p-3">
              <div className="flex gap-3 items-start">
                <button type="button" className="flex-1 min-w-0 text-left" onClick={() => setEdit(e)}>
                  <div className="text-sm font-medium first-letter:uppercase">{formatDate(e.date, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
                  <div className="flex flex-wrap gap-x-3 text-xs text-muted mt-0.5">
                    {SCALES.map((s) => e[s.key] !== null && <span key={s.key}>{s.label} {e[s.key]}/5</span>)}
                    {e.sleepHours !== null && <span>{fmtSmart(e.sleepHours, 1)} h de sommeil</span>}
                  </div>
                  {e.text && <p className="text-sm mt-1.5">{e.text}</p>}
                  {e.difficulties && <p className="text-xs text-warn mt-1">Difficultés : {e.difficulties}</p>}
                </button>
                <IconButton
                  label="Supprimer"
                  onClick={async () => {
                    if (await confirmDialog({ title: 'Supprimer cette entrée ?', confirmLabel: 'Supprimer', danger: true })) store().remove('journal', e.id);
                  }}
                >
                  <Trash2 size={14} />
                </IconButton>
              </div>
            </Card>
          ))}
        </div>
      )}
      {edit && <JournalSheet initial={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function JournalSheet({ initial, onClose }: { initial?: JournalEntry; onClose: () => void }) {
  const t = useToday();
  const [e, setE] = useState<JournalEntry>(initial ?? { id: uid(), date: t, energy: null, sleepQuality: null, sleepHours: null, motivation: null, difficulties: '', text: '', updatedAt: nowISO() });
  return (
    <Sheet
      open
      onClose={onClose}
      title={initial ? 'Modifier l\'entrée' : 'Nouvelle entrée'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              store().upsert('journal', e);
              onClose();
            }}
            disabled={!e.text.trim() && !e.difficulties.trim() && e.energy === null && e.sleepQuality === null && e.motivation === null && e.sleepHours === null}
          >
            Enregistrer
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">
            <input type="date" className="field" value={e.date} max={t} onChange={(x) => setE({ ...e, date: x.target.value })} />
          </Field>
          <Field label="Heures de sommeil">
            <NumberInput value={e.sleepHours} onChange={(v) => setE({ ...e, sleepHours: v === null ? null : Math.max(0, Math.min(16, v)) })} suffix="h" />
          </Field>
        </div>
        {SCALES.map((s) => (
          <div key={s.key}>
            <span className="label">{s.label}</span>
            <div className="grid grid-cols-5 gap-1.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" onClick={() => setE({ ...e, [s.key]: e[s.key] === n ? null : n })} className={cx('h-10 rounded-xl border text-sm font-semibold', e[s.key] === n ? 'border-accent bg-accent/10 text-accent' : 'border-line text-muted')}>
                  {n}
                </button>
              ))}
            </div>
          </div>
        ))}
        <Field label="Sensations, ressenti">
          <textarea className="field min-h-20" value={e.text} onChange={(x) => setE({ ...e, text: x.target.value })} maxLength={1500} />
        </Field>
        <Field label="Difficultés rencontrées">
          <input className="field" value={e.difficulties} onChange={(x) => setE({ ...e, difficulties: x.target.value })} maxLength={300} />
        </Field>
      </div>
    </Sheet>
  );
}
