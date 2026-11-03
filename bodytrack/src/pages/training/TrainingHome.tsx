import { useState } from 'react';
import { CheckCircle2, Copy, Dumbbell, MoreHorizontal, Pencil, Play, Plus, Star, Trash2, Zap } from 'lucide-react';
import { Badge, Button, Card, EmptyState, IconButton, PageHeader, SectionTitle, Sheet, SubNav, cx } from '../../components/ui';
import { useCtx, useToday } from '../../lib/useCtx';
import { usePath, navigate } from '../../lib/router';
import { deleteSession, duplicateProgram, setActiveProgram, startSession } from '../../lib/actions';
import { store } from '../../lib/store/store';
import { PROGRAM_TEMPLATES, programFromTemplate } from '../../data/programTemplates';
import { nextSession, sessionSummary } from '../../lib/analytics/stats';
import { dateOf, formatDate, formatDuration, formatMonth, weekdayShort } from '../../lib/dates';
import { fmtVolume, nowISO, uid } from '../../lib/format';
import { confirmDialog } from '../../components/confirm';
import { toast } from '../../components/toast';
import type { WorkoutProgram } from '../../lib/types';

export const TRAINING_NAV = [
  { to: '/training', label: 'Programmes' },
  { to: '/training/history', label: 'Historique' },
  { to: '/training/records', label: 'Records' },
  { to: '/training/volume', label: 'Volume musculaire' },
];

export default function TrainingHome() {
  const path = usePath().split('?')[0];
  return (
    <div>
      <PageHeader title="Entraînement" subtitle="Programmes, séances et historique" />
      <SubNav items={TRAINING_NAV} active={path} />
      {path === '/training/history' ? <History /> : <Programs />}
    </div>
  );
}

function Programs() {
  const ctx = useCtx();
  const t = useToday();
  const [newOpen, setNewOpen] = useState(false);
  const [menu, setMenu] = useState<WorkoutProgram | null>(null);
  const programs = [...ctx.data.programs].sort((a, b) => Number(b.isActive) - Number(a.isActive) || b.createdAt.localeCompare(a.createdAt));
  const next = nextSession(ctx, t);

  const go = (programId?: string, dayId?: string) => {
    if (ctx.activeSession) {
      toast('Une séance est déjà en cours', 'Termine-la ou supprime-la avant d\'en commencer une autre.', 'info');
      return navigate(`/training/session/${ctx.activeSession.id}`);
    }
    navigate(`/training/session/${startSession({ programId, dayId })}`);
  };

  const createBlank = () => {
    const now = nowISO();
    const p: WorkoutProgram = { id: uid(), name: 'Nouveau programme', description: '', days: [{ id: uid(), name: 'Séance A', weekday: null, exercises: [] }], isActive: programs.length === 0, createdAt: now, updatedAt: now };
    store().upsert('programs', p);
    setNewOpen(false);
    navigate(`/training/program/${p.id}`);
  };

  const fromTemplate = (key: string) => {
    const p = programFromTemplate(PROGRAM_TEMPLATES.find((x) => x.key === key)!, programs.length === 0);
    store().upsert('programs', p);
    setNewOpen(false);
    toast('Programme ajouté', p.name);
    navigate(`/training/program/${p.id}`);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-2">
        <Button variant="primary" size="lg" icon={<Zap size={18} />} onClick={() => (next ? go(next.programId, next.dayId) : go())}>
          {ctx.activeSession ? 'Reprendre' : next ? next.dayName : 'Séance libre'}
        </Button>
        <Button variant="secondary" size="lg" icon={<Play size={18} />} onClick={() => go()}>
          Séance libre
        </Button>
      </div>

      <section>
        <SectionTitle action={<Button size="sm" variant="outline" icon={<Plus size={14} />} onClick={() => setNewOpen(true)}>Nouveau</Button>}>Mes programmes</SectionTitle>
        {!programs.length && (
          <EmptyState icon={<Dumbbell size={22} />} title="Aucun programme" text="Crée ton propre programme ou pars d'un modèle (Push/Pull/Legs, Upper/Lower, Full Body…)." action={<Button variant="primary" onClick={() => setNewOpen(true)}>Créer un programme</Button>} />
        )}
        <div className="space-y-3">
          {programs.map((p) => (
            <Card key={p.id} className={cx(p.isActive && '!border-accent/40')}>
              <div className="flex items-start justify-between gap-2">
                <button type="button" className="min-w-0 text-left" onClick={() => navigate(`/training/program/${p.id}`)}>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold truncate">{p.name}</h3>
                    {p.isActive && <Badge tone="accent">Actif</Badge>}
                  </div>
                  {p.description && <p className="text-xs text-muted mt-0.5 line-clamp-2">{p.description}</p>}
                </button>
                <IconButton label="Actions du programme" onClick={() => setMenu(p)}>
                  <MoreHorizontal size={18} />
                </IconButton>
              </div>
              <div className="mt-3 grid sm:grid-cols-2 gap-2">
                {p.days.map((d) => (
                  <div key={d.id} className="flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-2">
                    <span className="text-[11px] text-muted w-8 shrink-0 uppercase">{d.weekday ? weekdayShort(d.weekday) : '—'}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium truncate">{d.name}</span>
                      <span className="block text-[11px] text-muted">{d.exercises.length} exercice{d.exercises.length > 1 ? 's' : ''}</span>
                    </span>
                    <IconButton label={`Démarrer ${d.name}`} className="!text-accent" onClick={() => go(p.id, d.id)} disabled={!d.exercises.length}>
                      <Play size={16} />
                    </IconButton>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      </section>

      <Sheet open={newOpen} onClose={() => setNewOpen(false)} title="Nouveau programme">
        <button type="button" onClick={createBlank} className="w-full card p-4 text-left hover:border-accent mb-4">
          <div className="font-semibold flex items-center gap-2">
            <Plus size={16} className="text-accent" /> Programme vierge
          </div>
          <div className="text-xs text-muted mt-1">Construis tes séances exercice par exercice.</div>
        </button>
        <div className="label">Ou à partir d'un modèle (entièrement modifiable)</div>
        <div className="space-y-2">
          {PROGRAM_TEMPLATES.map((tp) => (
            <button key={tp.key} type="button" onClick={() => fromTemplate(tp.key)} className="w-full card p-4 text-left hover:border-accent">
              <div className="font-semibold">{tp.name}</div>
              <div className="text-xs text-muted mt-1">{tp.description}</div>
              <div className="text-[11px] text-faint mt-1">{tp.days.map((d) => d.name).join(' · ')}</div>
            </button>
          ))}
        </div>
      </Sheet>

      <Sheet open={!!menu} onClose={() => setMenu(null)} title={menu?.name ?? ''}>
        {menu && (
          <div className="grid gap-2">
            <Button className="justify-start" icon={<Pencil size={16} />} onClick={() => navigate(`/training/program/${menu.id}`)}>
              Modifier
            </Button>
            {!menu.isActive ? (
              <Button
                className="justify-start"
                icon={<Star size={16} />}
                onClick={() => {
                  setActiveProgram(menu.id);
                  setMenu(null);
                  toast('Programme actif', menu.name);
                }}
              >
                Définir comme programme actif
              </Button>
            ) : (
              <Button
                className="justify-start"
                icon={<CheckCircle2 size={16} />}
                onClick={() => {
                  setActiveProgram(null);
                  setMenu(null);
                }}
              >
                Ne plus utiliser comme programme actif
              </Button>
            )}
            <Button
              className="justify-start"
              icon={<Copy size={16} />}
              onClick={() => {
                const id = duplicateProgram(menu);
                setMenu(null);
                toast('Programme dupliqué');
                navigate(`/training/program/${id}`);
              }}
            >
              Dupliquer
            </Button>
            <Button
              variant="danger"
              className="justify-start"
              icon={<Trash2 size={16} />}
              onClick={async () => {
                if (await confirmDialog({ title: 'Supprimer ce programme ?', text: 'Les séances déjà réalisées restent dans ton historique.', confirmLabel: 'Supprimer', danger: true })) {
                  store().remove('programs', menu.id);
                  setMenu(null);
                }
              }}
            >
              Supprimer
            </Button>
          </div>
        )}
      </Sheet>
    </div>
  );
}

function History() {
  const ctx = useCtx();
  const [limit, setLimit] = useState(30);
  const sessions = [...ctx.doneSessions].reverse();
  if (!sessions.length) return <EmptyState icon={<Dumbbell size={22} />} title="Aucune séance terminée" text="Tes séances apparaîtront ici avec leur durée, leur volume et leurs séries." />;
  let month = '';
  return (
    <div className="space-y-2">
      {sessions.slice(0, limit).map((s) => {
        const d = dateOf(s.startedAt);
        const m = d.slice(0, 7);
        const header = m !== month ? ((month = m), <h3 key={`h${m}`} className="display text-sm uppercase text-muted pt-4 first:pt-0 first-letter:uppercase">{formatMonth(d)}</h3>) : null;
        const sum = sessionSummary(ctx, s);
        return (
          <div key={s.id}>
            {header}
            <Card className="!p-3">
              <div className="flex items-center gap-3">
                <button type="button" className="flex items-center gap-3 min-w-0 flex-1 text-left" onClick={() => navigate(`/training/session/${s.id}`)}>
                <div className="w-11 shrink-0 text-center">
                  <div className="display text-xl font-bold leading-none">{formatDate(d, { day: 'numeric' })}</div>
                  <div className="text-[10px] uppercase text-muted">{formatDate(d, { weekday: 'short' })}</div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm truncate">{s.name}</div>
                  <div className="text-xs text-muted truncate">
                    {sum.exerciseIds.length} exercices · {sum.sets} séries · {fmtVolume(sum.volume)} · {formatDuration(sum.durationMs)}
                  </div>
                </div>
                </button>
                <IconButton
                  label="Supprimer la séance"
                  onClick={async () => {
                    if (await confirmDialog({ title: 'Supprimer cette séance ?', text: 'Ses séries et records associés disparaîtront de tes statistiques.', confirmLabel: 'Supprimer', danger: true })) deleteSession(s.id);
                  }}
                >
                  <Trash2 size={15} />
                </IconButton>
              </div>
            </Card>
          </div>
        );
      })}
      {sessions.length > limit && (
        <Button variant="ghost" className="w-full" onClick={() => setLimit(limit + 30)}>
          Afficher plus
        </Button>
      )}
    </div>
  );
}
