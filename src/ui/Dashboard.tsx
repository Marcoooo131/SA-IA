import { useMemo, useState } from 'react';
import { ArrowRight, ClipboardCheck, Copy, FileText, FolderOpen, FolderPlus, ImageUp, Map as MapIcon, PencilRuler, RotateCcw, Search, Sparkles, Trash2 } from 'lucide-react';
import { useEditor } from '@/state/editor';
import { useApp } from '@/state/store';
import type { Dossier, DossierInfo, DossierStatus } from '@/domain/types';
import { HOUSING_TYPE_LABELS, STATUS_LABELS, STATUS_ORDER } from '@/domain/labels';
import { quoteForDossier } from '@/quote/compare';
import { formatDate, formatDateTime, formatEuro, formatMonthly } from '@/lib/format';
import { Badge, Button, Card, EmptyState, IconButton, Modal, ProgressBar, Select, TextInput, cx } from './kit';
import { PlanThumb } from './workspace/PlanWizard';
import { alertCounts, runAudit } from '@/rules/engine';
import { auditSteps } from '@/state/derived';
import { DossierForm } from './DossierForm';
import { emptyDossier } from '@/demo/demoData';

const STATUS_TONE: Record<DossierStatus, 'slate' | 'blue' | 'amber' | 'red' | 'green' | 'teal'> = {
  brouillon: 'slate',
  audit_en_cours: 'blue',
  audit_a_verifier: 'amber',
  devis_genere: 'red',
  proposition_validee: 'green',
  cloture: 'teal',
};

export function StatusBadge({ status }: { status: DossierStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{STATUS_LABELS[status]}</Badge>;
}

type Intent = 'questionnaire' | 'dessin' | 'import';

function NewDossierDialog({ onClose, intent }: { onClose: () => void; intent: Intent }) {
  const createDossier = useApp((s) => s.createDossier);
  const openDossier = useApp((s) => s.openDossier);
  const dossiers = useApp((s) => s.dossiers);
  const [info, setInfo] = useState<DossierInfo>(() => {
    const d = emptyDossier('tmp', `MOV-${new Date().getFullYear()}-${String(dossiers.length + 1).padStart(4, '0')}`);
    return d.info;
  });
  const [error, setError] = useState<string | null>(null);
  const submit = () => {
    if (!info.reference.trim()) return setError('La référence est obligatoire.');
    if (dossiers.some((d) => d.info.reference.trim().toLowerCase() === info.reference.trim().toLowerCase()))
      return setError('Cette référence existe déjà.');
    if (!info.clientName.trim()) return setError('Le nom ou identifiant du client est obligatoire.');
    const id = createDossier({ ...info, createdAt: new Date().toISOString() });
    onClose();
    if (intent === 'questionnaire') {
      openDossier(id, 'modele');
      return;
    }
    openDossier(id, 'plan');
    if (intent === 'dessin') useEditor.getState().setTool('room');
    else {
      useEditor.getState().set({ highlightImport: true });
      useApp.getState().toast('info', 'Cliquez sur « Importer un plan » (PNG, JPG, photo ou PDF) pour l’afficher en fond, puis définissez l’échelle.');
    }
  };
  return (
    <Modal
      title="Nouvel audit – création du dossier"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Annuler</Button>
          <Button variant="primary" onClick={submit}>
            {intent === 'questionnaire' ? 'Créer et répondre au questionnaire' : intent === 'import' ? 'Créer et importer le plan' : 'Créer et dessiner le plan'}
          </Button>
        </>
      }
    >
      <DossierForm info={info} onChange={(p) => setInfo((i) => ({ ...i, ...p }))} compact />
      {error && (
        <p className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700" role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}

type Row = { d: Dossier; q: ReturnType<typeof quoteForDossier> };

function useDossierRows(): Row[] {
  const dossiers = useApp((s) => s.dossiers);
  const catalog = useApp((s) => s.catalog);
  return useMemo(() => dossiers.map((d) => ({ d, q: quoteForDossier(d, catalog) })).sort((a, b) => b.d.updatedAt.localeCompare(a.d.updatedAt)), [dossiers, catalog]);
}

/** Miniature du plan du dossier (premier niveau), générée depuis ses données réelles. */
function DossierThumb({ d, width = 132, height = 88 }: { d: Dossier; width?: number; height?: number }) {
  const level = [...d.plan.levels].sort((a, b) => a.index - b.index).find((l) => l.rooms.length);
  if (!level)
    return (
      <div className="flex items-center justify-center rounded-lg bg-slate-50 text-slate-300" style={{ width, height }}>
        <MapIcon size={22} />
      </div>
    );
  return (
    <div className="overflow-hidden rounded-lg bg-slate-50" style={{ width, height }}>
      <PlanThumb level={level} width={width} height={height} />
    </div>
  );
}

function Kpi({ label, value, hint, onClick }: { label: string; value: number; hint: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="flex flex-col items-start rounded-xl border border-slate-200 bg-white px-4 py-3 text-left hover:border-slate-400">
      <span className="text-[11px] font-semibold tracking-[0.08em] text-slate-500 uppercase">{label}</span>
      <span className="mt-0.5 text-2xl font-semibold text-slate-900 tabular-nums">{value}</span>
      <span className="text-xs text-slate-500">{hint}</span>
    </button>
  );
}

export function Dashboard() {
  const dossiers = useApp((s) => s.dossiers);
  const openDossier = useApp((s) => s.openDossier);
  const setView = useApp((s) => s.setView);
  const [creating, setCreating] = useState<Intent | null>(null);
  const rows = useDossierRows();
  const inProgress = dossiers.filter((d) => d.status === 'audit_en_cours' || d.status === 'brouillon').length;
  const toVerify = dossiers.filter((d) => d.status === 'audit_a_verifier').length;
  const quoted = dossiers.filter((d) => d.quotes.length > 0).length;

  return (
    <div className="scroll-thin h-full overflow-auto">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-8 lg:px-8">
        {/* Accueil et action principale */}
        <section className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-[0.12em] text-brand-600 uppercase">Tableau de bord</p>
            <h1 className="mt-1 text-3xl font-bold text-slate-900">Bienvenue sur Sector Alarm Movers</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              Préparez l'audit de sécurité du nouveau logement : plan, maquette 3D, équipements et devis, dans un seul parcours guidé.
            </p>
          </div>
          <Button variant="primary" size="lg" icon={<FolderPlus size={17} />} onClick={() => setCreating('questionnaire')} data-testid="new-audit">
            Nouvel audit
          </Button>
        </section>

        {/* Accès rapides */}
        <section className="grid gap-3 md:grid-cols-3" data-testid="start-options">
          {(
            [
              ['questionnaire', <Sparkles key="q" size={20} />, 'Créer un plan avec le questionnaire', 'Choisissez un modèle, répondez à quelques questions : plan 2D et maquette 3D sont générés.', true],
              ['import', <ImageUp key="i" size={20} />, 'Importer un plan ou une photo', 'PNG, JPG, photo ou PDF en fond de référence, à calibrer puis à retracer.', false],
              ['dessin', <PencilRuler key="d" size={20} />, 'Dessiner mon logement en 2D', 'Tracez pièces, murs et ouvertures sur une grille magnétique.', false],
            ] as [Intent, React.ReactNode, string, string, boolean][]
          ).map(([intent, icon, title, text, recommended]) => (
            <button
              key={intent}
              onClick={() => setCreating(intent)}
              className={cx(
                'group flex flex-col gap-3 rounded-xl border bg-white p-5 text-left hover:border-slate-900',
                recommended ? 'border-slate-900' : 'border-slate-200',
              )}
              data-testid={`start-${intent}`}
            >
              <span className="flex items-center justify-between">
                <span className={cx('flex h-10 w-10 items-center justify-center rounded-lg', recommended ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-800')}>{icon}</span>
                {recommended && <Badge tone="red">Recommandé</Badge>}
              </span>
              <span>
                <span className="block font-semibold text-slate-900">{title}</span>
                <span className="mt-1 block text-xs leading-relaxed text-slate-600">{text}</span>
              </span>
              <span className="mt-auto flex items-center gap-1 text-xs font-semibold text-slate-900 group-hover:text-brand-600">
                Commencer <ArrowRight size={13} />
              </span>
            </button>
          ))}
        </section>

        {/* Indicateurs (secondaires) */}
        <section className="grid gap-3 sm:grid-cols-3" aria-label="Indicateurs">
          <Kpi label="Audits en cours" value={inProgress} hint="Brouillons et audits ouverts" onClick={() => setView('audits')} />
          <Kpi label="Devis générés" value={quoted} hint="Dossiers avec au moins un devis" onClick={() => setView('dossiers')} />
          <Kpi label="Dossiers à vérifier" value={toVerify} hint="Points d'audit à contrôler" onClick={() => setView('audits')} />
        </section>

        {/* Dossiers récents */}
        <section>
          <div className="mb-3 flex items-end justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Dossiers récents</h2>
            {rows.length > 0 && (
              <button className="flex items-center gap-1 text-sm font-medium text-slate-900 hover:text-brand-600" onClick={() => setView('dossiers')}>
                Tous les dossiers <ArrowRight size={14} />
              </button>
            )}
          </div>
          {rows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white">
              <EmptyState
                icon={<FolderOpen size={22} />}
                title="Aucun dossier pour le moment"
                action={
                  <Button variant="primary" icon={<FolderPlus size={15} />} onClick={() => setCreating('questionnaire')}>
                    Créer mon premier audit
                  </Button>
                }
              >
                Lancez un audit à partir d'un modèle de logement, d'un plan importé ou d'un dessin.
              </EmptyState>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {rows.slice(0, 6).map(({ d, q }) => (
                <article key={d.id} className="flex gap-4 rounded-xl border border-slate-200 bg-white p-3 hover:border-slate-400" data-testid={`dossier-row-${d.info.reference}`}>
                  <button onClick={() => openDossier(d.id)} aria-label="Ouvrir le plan du dossier" className="shrink-0">
                    <DossierThumb d={d} />
                  </button>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <button className="font-semibold text-slate-900 hover:text-brand-600" onClick={() => openDossier(d.id)}>
                          {d.info.reference}
                        </button>
                        <div className="truncate text-xs text-slate-500">{d.info.clientName || '—'}</div>
                      </div>
                      <StatusBadge status={d.status} />
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500">
                      {HOUSING_TYPE_LABELS[d.info.housingType]} · {d.plan.levels.length} niveau(x) · {d.devices.length} équipement(s) · modifié le {formatDateTime(d.updatedAt)}
                    </div>
                    <div className="mt-auto flex items-end justify-between gap-2 pt-2">
                      <div className="flex gap-4 text-sm">
                        <span>
                          <span className="block text-[10px] tracking-wide text-slate-500 uppercase">Initial</span>
                          <span className="font-semibold text-slate-900 tabular-nums">{d.devices.length ? formatEuro(q.totals.initial) : '—'}</span>
                        </span>
                        <span>
                          <span className="block text-[10px] tracking-wide text-slate-500 uppercase">Mensuel</span>
                          <span className="font-semibold text-slate-900 tabular-nums">{d.devices.length ? formatMonthly(q.totals.monthly) : '—'}</span>
                        </span>
                      </div>
                      <div className="flex gap-1">
                        <Button size="sm" icon={<MapIcon size={13} />} onClick={() => openDossier(d.id, 'plan')}>
                          Plan
                        </Button>
                        <Button size="sm" icon={<FileText size={13} />} onClick={() => openDossier(d.id, 'devis')}>
                          Devis
                        </Button>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
        <p className="text-center text-[11px] text-slate-400">
          Données enregistrées localement dans ce navigateur (non partagées entre conseillers). Dossiers de démonstration fictifs. Prototype non officiel.
        </p>
      </div>
      {creating && <NewDossierDialog intent={creating} onClose={() => setCreating(null)} />}
    </div>
  );
}

/** Liste complète des dossiers : recherche, filtre, statut, duplication, suppression. */
export function DossiersView() {
  const openDossier = useApp((s) => s.openDossier);
  const duplicate = useApp((s) => s.duplicateDossier);
  const remove = useApp((s) => s.deleteDossier);
  const setStatus = useApp((s) => s.setStatus);
  const resetDemo = useApp((s) => s.resetDemo);
  const toast = useApp((s) => s.toast);
  const all = useDossierRows();
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<DossierStatus | 'tous'>('tous');
  const [creating, setCreating] = useState<Intent | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const rows = all.filter(({ d }) => {
    const q = query.trim().toLowerCase();
    const matches = !q || d.info.reference.toLowerCase().includes(q) || d.info.clientName.toLowerCase().includes(q);
    return matches && (statusFilter === 'tous' || d.status === statusFilter);
  });

  return (
    <div className="scroll-thin h-full overflow-auto">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-8 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Dossiers</h1>
            <p className="text-sm text-slate-500">{all.length} dossier(s) enregistrés dans ce navigateur.</p>
          </div>
          <div className="flex gap-2">
            <Button icon={<RotateCcw size={15} />} onClick={() => setConfirmReset(true)}>
              Réinitialiser la démo
            </Button>
            <Button variant="primary" icon={<FolderPlus size={15} />} onClick={() => setCreating('questionnaire')}>
              Nouvel audit
            </Button>
          </div>
        </div>
        <Card
          title="Tous les dossiers"
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search size={14} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-slate-400" />
                <TextInput
                  placeholder="Rechercher une référence ou un client"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-64 pl-8"
                  aria-label="Rechercher par référence"
                />
              </div>
              <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as DossierStatus | 'tous')} className="w-48" aria-label="Filtrer par statut">
                <option value="tous">Tous les statuts</option>
                {STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </Select>
            </div>
          }
          bodyClassName="p-0 overflow-x-auto"
        >
          {rows.length === 0 ? (
            <EmptyState icon={<Search size={20} />} title="Aucun dossier ne correspond à la recherche." />
          ) : (
            <table className="w-full min-w-[860px] text-sm">
              <thead className="text-left text-[11px] tracking-wide text-slate-500 uppercase">
                <tr className="border-b border-slate-200">
                  <th className="px-4 py-2.5 font-semibold">Référence</th>
                  <th className="px-4 py-2.5 font-semibold">Client / logement</th>
                  <th className="px-4 py-2.5 font-semibold">Statut</th>
                  <th className="px-4 py-2.5 font-semibold">Dernière modification</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Initial estimé</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Mensuel estimé</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ d, q }) => (
                  <tr key={d.id} className="border-t border-slate-100 hover:bg-slate-50" data-testid={`dossier-row-${d.info.reference}`}>
                    <td className="px-4 py-2.5">
                      <button className="font-semibold text-slate-900 hover:text-brand-600" onClick={() => openDossier(d.id)}>
                        {d.info.reference}
                      </button>
                      <div className="text-[11px] text-slate-400">Créé le {formatDate(d.info.createdAt)}</div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-slate-800">{d.info.clientName || '—'}</div>
                      <div className="text-xs text-slate-500">
                        {HOUSING_TYPE_LABELS[d.info.housingType]} · {d.plan.levels.length} niveau(x) · {d.devices.length} équipement(s) placé(s)
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <StatusBadge status={d.status} />
                        <select
                          aria-label={`Statut du dossier ${d.info.reference}`}
                          className="rounded-md border border-slate-200 bg-white px-1 py-0.5 text-xs text-slate-600"
                          value={d.status}
                          onChange={(e) => setStatus(e.target.value as DossierStatus, d.id)}
                        >
                          {STATUS_ORDER.map((s) => (
                            <option key={s} value={s}>
                              {STATUS_LABELS[s]}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{formatDateTime(d.updatedAt)}</td>
                    <td className="px-4 py-2.5 text-right font-medium tabular-nums">
                      {d.devices.length ? formatEuro(q.totals.initial) : '—'}
                      {d.devices.length > 0 && q.hasUnpricedItems && <div className="text-[11px] text-amber-700">+ à confirmer</div>}
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium tabular-nums">{d.devices.length ? formatMonthly(q.totals.monthly) : '—'}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" icon={<MapIcon size={13} />} onClick={() => openDossier(d.id, 'plan')}>
                          Plan
                        </Button>
                        <Button size="sm" icon={<FileText size={13} />} onClick={() => openDossier(d.id, 'devis')}>
                          Devis
                        </Button>
                        <IconButton
                          label="Dupliquer le dossier"
                          onClick={() => {
                            duplicate(d.id);
                            toast('success', `Dossier ${d.info.reference} dupliqué.`);
                          }}
                        >
                          <Copy size={15} />
                        </IconButton>
                        <IconButton label="Supprimer le dossier" onClick={() => setConfirmDelete(d.id)}>
                          <Trash2 size={15} />
                        </IconButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
      {creating && <NewDossierDialog intent={creating} onClose={() => setCreating(null)} />}
      {confirmDelete && (
        <Modal
          title="Supprimer le dossier ?"
          onClose={() => setConfirmDelete(null)}
          footer={
            <>
              <Button onClick={() => setConfirmDelete(null)}>Annuler</Button>
              <Button
                variant="danger"
                onClick={() => {
                  remove(confirmDelete);
                  setConfirmDelete(null);
                  toast('info', 'Dossier supprimé.');
                }}
              >
                Supprimer définitivement
              </Button>
            </>
          }
        >
          <p className="text-sm text-slate-600">Le dossier, son plan et ses devis seront supprimés de ce navigateur.</p>
        </Modal>
      )}
      {confirmReset && (
        <Modal
          title="Réinitialiser la démonstration ?"
          onClose={() => setConfirmReset(false)}
          footer={
            <>
              <Button onClick={() => setConfirmReset(false)}>Annuler</Button>
              <Button
                variant="danger"
                onClick={() => {
                  resetDemo();
                  setConfirmReset(false);
                  toast('success', 'Données de démonstration rechargées.');
                }}
              >
                Réinitialiser
              </Button>
            </>
          }
        >
          <p className="text-sm text-slate-600">
            Tous les dossiers et le catalogue enregistrés dans ce navigateur seront remplacés par les données de démonstration fictives.
          </p>
        </Modal>
      )}
    </div>
  );
}

/** Suivi des audits : avancement du parcours et points à traiter, par dossier. */
export function AuditsView() {
  const dossiers = useApp((s) => s.dossiers);
  const catalog = useApp((s) => s.catalog);
  const rules = useApp((s) => s.rules);
  const openDossier = useApp((s) => s.openDossier);
  const items = useMemo(
    () =>
      [...dossiers]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map((d) => {
          const audit = runAudit(d, rules, catalog.products);
          const steps = auditSteps(d, audit);
          const counts = alertCounts(audit.alerts);
          return { d, steps, counts, done: steps.filter((s) => s.done).length };
        }),
    [dossiers, catalog, rules],
  );
  return (
    <div className="scroll-thin h-full overflow-auto">
      <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-8 lg:px-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Audits</h1>
          <p className="text-sm text-slate-500">Avancement du parcours en 9 étapes et points d'audit à traiter pour chaque dossier.</p>
        </div>
        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white">
            <EmptyState icon={<ClipboardCheck size={22} />} title="Aucun audit">
              Créez un dossier depuis le tableau de bord pour démarrer un audit.
            </EmptyState>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {items.map(({ d, steps, counts, done }) => {
              const next = steps.find((s) => !s.done);
              return (
                <article key={d.id} className="grid items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-[1.2fr_2fr_auto]" data-testid={`audit-row-${d.info.reference}`}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900">{d.info.reference}</span>
                      <StatusBadge status={d.status} />
                    </div>
                    <div className="truncate text-xs text-slate-500">{d.info.clientName || '—'}</div>
                  </div>
                  <div>
                    <div className="mb-1 flex justify-between text-[11px] text-slate-500">
                      <span>
                        {done}/{steps.length} étapes · prochaine : <strong className="text-slate-800">{next?.label ?? 'terminé'}</strong>
                      </span>
                      <span className="flex gap-2">
                        {counts.manquant > 0 && <span className="font-semibold text-brand-700">{counts.manquant} manquant(s)</span>}
                        {counts.a_verifier > 0 && <span className="text-amber-700">{counts.a_verifier} à vérifier</span>}
                      </span>
                    </div>
                    <ProgressBar value={done / steps.length} label={`Avancement ${d.info.reference}`} />
                  </div>
                  <div className="flex gap-1.5">
                    <Button size="sm" onClick={() => openDossier(d.id, next?.tab ?? 'devis')}>
                      Reprendre
                    </Button>
                    <Button size="sm" variant="dark" onClick={() => openDossier(d.id, 'audit')}>
                      Voir l'audit
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
