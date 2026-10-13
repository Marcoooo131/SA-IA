import { lazy, Suspense } from 'react';
import { ArrowLeft, Box, Check, ClipboardCheck, DoorOpen, FileText, Home, Map as MapIcon, Package, Sparkles } from 'lucide-react';
import { JoineryTab } from './JoineryTab';
import { useApp, useActiveDossier, type WorkspaceTab } from '@/state/store';
import { journeySteps, useAudit } from '@/state/derived';
import { cx } from '../kit';
import { StatusBadge } from '../Dashboard';
import { PlanEditor } from './PlanEditor';
import { PlanToolbar } from './PlanToolbar';
import { EquipmentLibrary, LevelsPanel, RoomsPanel } from './LeftPanels';
import { PropertiesPanel } from './PropertiesPanel';
import { AuditMini, PriceSummary } from './SummaryPanels';
import { LogementTab } from './LogementTab';
import { AuditTab } from './AuditTab';
import { EquipmentTab } from './EquipmentTab';
import { QuoteTab } from './QuoteTab';
import { GenerationBanner, PlanWizard } from './PlanWizard';

const View3D = lazy(() => import('@/view3d/View3D').then((m) => ({ default: m.View3D })));

const TABS: { key: WorkspaceTab; label: string; icon: React.ReactNode }[] = [
  { key: 'logement', label: 'Logement', icon: <Home size={15} /> },
  { key: 'questionnaire', label: 'Questionnaire', icon: <Sparkles size={15} /> },
  { key: 'menuiseries', label: 'Pièces & menuiseries', icon: <DoorOpen size={15} /> },
  { key: 'plan', label: 'Plan 2D', icon: <MapIcon size={15} /> },
  { key: 'vue3d', label: 'Vue 3D', icon: <Box size={15} /> },
  { key: 'audit', label: 'Audit', icon: <ClipboardCheck size={15} /> },
  { key: 'equipements', label: 'Équipements', icon: <Package size={15} /> },
  { key: 'devis', label: 'Devis', icon: <FileText size={15} /> },
];

const STEP_TAB: Record<string, WorkspaceTab> = {
  dossier: 'logement',
  plan: 'plan',
  vue3d: 'vue3d',
  audit: 'audit',
  offres: 'devis',
  devis: 'devis',
};

function Stepper() {
  const dossier = useActiveDossier();
  const audit = useAudit(dossier);
  const catalog = useApp((s) => s.catalog);
  const rules = useApp((s) => s.rules);
  const tab = useApp((s) => s.tab);
  const setTab = useApp((s) => s.setTab);
  if (!dossier || !audit) return null;
  const steps = journeySteps(dossier, audit, catalog, rules);
  const currentIdx = Math.max(
    0,
    steps.findIndex((s) => STEP_TAB[s.key] === tab),
  );
  return (
    <ol className="flex items-center gap-1" aria-label="Parcours guidé">
      {steps.map((s, i) => {
        const current = i === currentIdx || (tab === 'devis' && s.key === 'devis') || (tab === 'equipements' && s.key === 'audit');
        return (
          <li key={s.key} className="flex items-center gap-1">
            <button
              onClick={() => setTab(STEP_TAB[s.key])}
              title={s.missing.length ? `À compléter : ${s.missing.join(', ')}` : 'Étape complète'}
              className={cx(
                'flex items-center gap-1.5 rounded-full py-1 pr-2.5 pl-1 text-xs font-medium transition-colors',
                current ? 'bg-brand-700 text-white' : 'text-slate-600 hover:bg-slate-100',
              )}
              aria-current={current ? 'step' : undefined}
            >
              <span
                className={cx(
                  'flex h-5 w-5 items-center justify-center rounded-full text-[10px]',
                  s.done ? 'bg-emerald-500 text-white' : current ? 'bg-white text-brand-700' : 'bg-slate-200 text-slate-600',
                )}
              >
                {s.done ? <Check size={11} /> : i + 1}
              </span>
              {s.label}
              {!s.done && s.missing.length > 0 && <span className={cx('h-1.5 w-1.5 rounded-full', current ? 'bg-amber-300' : 'bg-amber-500')} />}
            </button>
            {i < steps.length - 1 && <span className="h-px w-3 bg-slate-300" />}
          </li>
        );
      })}
    </ol>
  );
}

function MissingBanner() {
  const dossier = useActiveDossier();
  const audit = useAudit(dossier);
  const catalog = useApp((s) => s.catalog);
  const rules = useApp((s) => s.rules);
  const tab = useApp((s) => s.tab);
  if (!dossier || !audit) return null;
  const steps = journeySteps(dossier, audit, catalog, rules);
  const step = steps.find((s) => STEP_TAB[s.key] === tab && !s.done);
  if (!step || !step.missing.length) return null;
  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-xs text-amber-900" role="status">
      <strong>Pour poursuivre ({step.label}) :</strong> {step.missing.join(' · ')}
    </div>
  );
}

function ThreeColumn({ left, center, right }: { left: React.ReactNode; center: React.ReactNode; right: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-0">
      <aside className="scroll-thin w-72 shrink-0 overflow-y-auto border-r border-slate-200 bg-white">{left}</aside>
      <section className="flex min-w-0 flex-1 flex-col">{center}</section>
      <aside className="scroll-thin w-80 shrink-0 overflow-y-auto border-l border-slate-200 bg-white">{right}</aside>
    </div>
  );
}

export function Workspace() {
  const dossier = useActiveDossier();
  const tab = useApp((s) => s.tab);
  const setTab = useApp((s) => s.setTab);
  const setView = useApp((s) => s.setView);
  if (!dossier) {
    return (
      <div className="p-6 text-sm text-slate-600">
        Dossier introuvable.{' '}
        <button className="text-brand-600 underline" onClick={() => setView('dashboard')}>
          Retour au tableau de bord
        </button>
      </div>
    );
  }
  const right = (
    <>
      <PropertiesPanel />
      <AuditMini />
      <PriceSummary />
    </>
  );
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 py-2">
        <button onClick={() => setView('dashboard')} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800" aria-label="Retour au tableau de bord">
          <ArrowLeft size={14} />
        </button>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-sm font-semibold text-slate-900" data-testid="dossier-title">
              {dossier.info.reference}
            </h1>
            <StatusBadge status={dossier.status} />
          </div>
          <div className="truncate text-xs text-slate-500">{dossier.info.clientName || 'Client non renseigné'} · {dossier.info.address || 'Adresse non renseignée'}</div>
        </div>
        <div className="ml-auto">
          <Stepper />
        </div>
      </div>
      <nav className="flex shrink-0 gap-1 border-b border-slate-200 bg-slate-50 px-3" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cx(
              '-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              tab === t.key ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800',
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </nav>
      <MissingBanner />
      <div className="min-h-0 flex-1">
        {tab === 'logement' && <LogementTab />}
        {tab === 'questionnaire' && <PlanWizard />}
        {tab === 'menuiseries' && <JoineryTab />}
        {tab === 'plan' && (
          <ThreeColumn
            left={
              <>
                <LevelsPanel />
                <RoomsPanel />
                <EquipmentLibrary />
              </>
            }
            center={
              <>
                <PlanToolbar />
                <GenerationBanner />
                <div className="min-h-0 flex-1">
                  <PlanEditor />
                </div>
              </>
            }
            right={right}
          />
        )}
        {tab === 'vue3d' && (
          <ThreeColumn
            left={
              <>
                <LevelsPanel />
                <EquipmentLibrary />
              </>
            }
            center={
              <>
                <GenerationBanner />
                <Suspense fallback={<div className="p-6 text-sm text-slate-500">Chargement du moteur 3D…</div>}>
                  <View3D />
                </Suspense>
              </>
            }
            right={right}
          />
        )}
        {tab === 'audit' && <AuditTab />}
        {tab === 'equipements' && (
          <ThreeColumn left={<EquipmentLibrary onArm={() => setTab('plan')} />} center={<EquipmentTab />} right={right} />
        )}
        {tab === 'devis' && <QuoteTab />}
      </div>
    </div>
  );
}
