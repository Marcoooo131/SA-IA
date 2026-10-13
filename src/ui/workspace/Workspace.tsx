import { lazy, Suspense, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, ClipboardCheck, Package, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { JoineryTab } from './JoineryTab';
import { useApp, useActiveDossier } from '@/state/store';
import { auditSteps, useAudit } from '@/state/derived';
import { Button, ProgressBar, cx } from '../kit';
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
import { QuoteSummary } from './QuoteSummary';
import { GenerationBanner, PlanWizard } from './PlanWizard';
import { FurnitureLibrary } from './FurniturePanel';
import { DisplayModeBar } from './DisplayModeBar';

const View3D = lazy(() => import('@/view3d/View3D').then((m) => ({ default: m.View3D })));

/** Barre de progression du parcours (9 étapes), accessible à tout moment. */
function Stepper() {
  const dossier = useActiveDossier();
  const audit = useAudit(dossier);
  const tab = useApp((s) => s.tab);
  const setTab = useApp((s) => s.setTab);
  if (!dossier || !audit) return null;
  const steps = auditSteps(dossier, audit);
  const activeTab = tab === 'equipements' ? 'audit' : tab;
  const activeIdx = Math.max(0, steps.findIndex((s) => s.tab === activeTab));
  const done = steps.filter((s) => s.done).length;
  return (
    <div className="border-b border-slate-200 bg-white">
      <nav className="scroll-thin flex items-stretch gap-0.5 overflow-x-auto px-2 lg:px-4" role="tablist" aria-label="Parcours de l'audit">
        {steps.map((s, i) => {
          const active = i === activeIdx;
          return (
            <button
              key={s.key}
              role="tab"
              aria-selected={active}
              aria-label={s.label}
              onClick={() => setTab(s.tab)}
              title={s.done ? `${s.label} : étape complète` : `${s.label} — à compléter : ${s.missing.join(', ')}`}
              className={cx('group relative flex shrink-0 items-center gap-2 px-2 py-2.5 text-xs font-medium xl:px-2.5', active ? 'text-slate-900' : 'text-slate-500 hover:text-slate-900')}
              data-testid={`step-${s.key}`}
              data-done={s.done || undefined}
            >
              <span
                className={cx(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
                  active ? 'bg-brand-600 text-white' : s.done ? 'bg-slate-900 text-white' : 'border border-slate-300 bg-white text-slate-500',
                )}
                aria-hidden
              >
                {s.done && !active ? <Check size={12} strokeWidth={3} /> : i + 1}
              </span>
              <span className={cx('whitespace-nowrap', active ? 'inline font-semibold' : 'hidden xl:inline')}>{active ? s.label : s.short}</span>
              {active && <span className="absolute inset-x-1 bottom-0 h-0.5 rounded-full bg-brand-600" />}
            </button>
          );
        })}
        <div className="ml-auto hidden shrink-0 items-center gap-2 pl-4 2xl:flex">
          <span className="text-[11px] whitespace-nowrap text-slate-500 tabular-nums">
            Étape {activeIdx + 1}/{steps.length} · {done} terminée(s)
          </span>
          <ProgressBar value={done / steps.length} className="w-28" label="Avancement de l'audit" />
        </div>
      </nav>
      <div className="h-[3px] w-full bg-slate-100" aria-hidden>
        <div className="h-full bg-brand-600 transition-all" style={{ width: `${(done / steps.length) * 100}%` }} />
      </div>
    </div>
  );
}

/** Sous-onglets de l'étape « Audit et équipements ». */
function AuditSubTabs() {
  const tab = useApp((s) => s.tab);
  const setTab = useApp((s) => s.setTab);
  if (tab !== 'audit' && tab !== 'equipements') return null;
  return (
    <div className="flex gap-1 border-b border-slate-200 bg-slate-50 px-3 py-1.5 lg:px-5" role="tablist" aria-label="Audit et équipements">
      {(
        [
          ['audit', 'Audit', <ClipboardCheck key="a" size={14} />],
          ['equipements', 'Équipements', <Package key="e" size={14} />],
        ] as const
      ).map(([k, label, icon]) => (
        <button
          key={k}
          role="tab"
          aria-selected={tab === k}
          onClick={() => setTab(k)}
          className={cx('flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium', tab === k ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-200/70')}
        >
          {icon}
          {label}
        </button>
      ))}
    </div>
  );
}

function MissingBanner() {
  const dossier = useActiveDossier();
  const audit = useAudit(dossier);
  const tab = useApp((s) => s.tab);
  if (!dossier || !audit) return null;
  const step = auditSteps(dossier, audit).find((s) => s.tab === (tab === 'equipements' ? 'audit' : tab) && !s.done);
  if (!step || !step.missing.length) return null;
  return (
    <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-xs text-amber-900" role="status">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
      <strong>Pour terminer cette étape :</strong> {step.missing.join(' · ')}
    </div>
  );
}

const STEP_ORDER = ['logement', 'modele', 'questionnaire', 'menuiseries', 'plan', 'vue3d', 'audit', 'proposition', 'devis'] as const;

/** Navigation Précédent / Continuer en bas des étapes de formulaire. */
function StepFooter() {
  const tab = useApp((s) => s.tab);
  const setTab = useApp((s) => s.setTab);
  const dossier = useActiveDossier();
  const audit = useAudit(dossier);
  if (!dossier || !audit) return null;
  const steps = auditSteps(dossier, audit);
  const i = STEP_ORDER.indexOf((tab === 'equipements' ? 'audit' : tab) as (typeof STEP_ORDER)[number]);
  if (i < 0) return null;
  const prev = i > 0 ? steps[i - 1] : null;
  const next = i < steps.length - 1 ? steps[i + 1] : null;
  return (
    <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-2.5 lg:px-6" data-testid="step-footer">
      {prev ? (
        <Button icon={<ArrowLeft size={15} />} onClick={() => setTab(prev.tab)}>
          Précédent<span className="hidden sm:inline"> : {prev.label}</span>
        </Button>
      ) : (
        <span />
      )}
      {next && (
        <Button variant="primary" onClick={() => setTab(next.tab)}>
          Continuer<span className="hidden sm:inline"> : {next.label}</span> <ArrowRight size={15} />
        </Button>
      )}
    </div>
  );
}

/** Trois zones : outils à gauche, conception au centre, propriétés à droite (panneaux repliables). */
function ThreeColumn({ left, center, right }: { left: React.ReactNode; center: React.ReactNode; right: React.ReactNode }) {
  const narrow = typeof window !== 'undefined' && window.innerWidth < 1200;
  const [leftOpen, setLeftOpen] = useState(!narrow);
  const [rightOpen, setRightOpen] = useState(!narrow);
  return (
    <div className="flex h-full min-h-0">
      {leftOpen && <aside className="scroll-thin w-72 shrink-0 overflow-y-auto border-r border-slate-200 bg-white" data-testid="panel-left">{left}</aside>}
      <section className="relative flex min-w-0 flex-1 flex-col">
        {center}
        <button
          onClick={() => setLeftOpen((v) => !v)}
          className="absolute bottom-10 left-3 z-10 flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm hover:text-slate-900"
          aria-label={leftOpen ? 'Masquer le panneau des outils' : 'Afficher le panneau des outils'}
          title={leftOpen ? 'Masquer le panneau des outils' : 'Afficher le panneau des outils'}
        >
          {leftOpen ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
        </button>
        <button
          onClick={() => setRightOpen((v) => !v)}
          className="absolute right-3 bottom-10 z-10 flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm hover:text-slate-900"
          aria-label={rightOpen ? 'Masquer le panneau des propriétés' : 'Afficher le panneau des propriétés'}
          title={rightOpen ? 'Masquer le panneau des propriétés' : 'Afficher le panneau des propriétés'}
        >
          {rightOpen ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
        </button>
      </section>
      {rightOpen && <aside className="scroll-thin w-80 shrink-0 overflow-y-auto border-l border-slate-200 bg-white" data-testid="panel-right">{right}</aside>}
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
      <div className="flex shrink-0 items-center gap-3 border-b border-slate-100 bg-white px-4 py-2.5 lg:px-5">
        <button onClick={() => setView('dossiers')} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900" aria-label="Retour aux dossiers">
          <ArrowLeft size={16} />
        </button>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-base font-bold text-slate-900" data-testid="dossier-title">
              {dossier.info.reference}
            </h1>
            <StatusBadge status={dossier.status} />
          </div>
          <div className="truncate text-xs text-slate-500">{dossier.info.clientName || 'Client non renseigné'} · {dossier.info.address || 'Adresse non renseignée'}</div>
        </div>
      </div>
      <Stepper />
      <AuditSubTabs />
      <MissingBanner />
      <div className="min-h-0 flex-1">
        {tab === 'logement' && <LogementTab />}
        {tab === 'modele' && <PlanWizard mode="modele" key="modele" />}
        {tab === 'questionnaire' && <PlanWizard mode="questionnaire" key="questionnaire" />}
        {tab === 'menuiseries' && <JoineryTab />}
        {tab === 'plan' && (
          <ThreeColumn
            left={
              <>
                <LevelsPanel />
                <RoomsPanel />
                <FurnitureLibrary />
                <EquipmentLibrary />
              </>
            }
            center={
              <>
                <PlanToolbar />
                <DisplayModeBar />
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
                <FurnitureLibrary />
                <EquipmentLibrary />
              </>
            }
            center={
              <>
                <DisplayModeBar />
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
        {tab === 'proposition' && <QuoteTab />}
        {tab === 'devis' && <QuoteSummary />}
      </div>
      {(['logement', 'menuiseries', 'audit', 'equipements', 'proposition', 'devis'] as string[]).includes(tab) && <StepFooter />}
    </div>
  );
}
