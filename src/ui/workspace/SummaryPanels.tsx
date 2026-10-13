import { AlertCircle, CheckCircle2, CircleHelp, Lightbulb } from 'lucide-react';
import { useApp, useActiveDossier } from '@/state/store';
import { useAudit, useQuote } from '@/state/derived';
import { alertCounts, type AlertStatus } from '@/rules/engine';
import { formatEuro, formatMonthly } from '@/lib/format';
import { PanelSection } from '../kit';
import { CategoryDot } from './LeftPanels';
import type { ProductCategory } from '@/domain/types';
import { CATEGORY_SHORT } from '@/domain/labels';

export const STATUS_ICON: Record<AlertStatus, React.ReactNode> = {
  manquant: <CircleHelp size={14} className="text-red-600" />,
  a_verifier: <AlertCircle size={14} className="text-amber-600" />,
  suggestion: <Lightbulb size={14} className="text-slate-900" />,
  valide: <CheckCircle2 size={14} className="text-emerald-600" />,
};

export function AuditMini() {
  const dossier = useActiveDossier();
  const audit = useAudit(dossier);
  const setTab = useApp((s) => s.setTab);
  if (!audit) return null;
  const c = alertCounts(audit.alerts);
  return (
    <PanelSection
      title="Audit"
      actions={
        <button className="text-xs font-medium text-brand-600 hover:underline" onClick={() => setTab('audit')}>
          Détail
        </button>
      }
    >
      <div className="grid grid-cols-2 gap-1.5 text-xs">
        <div className="flex items-center gap-1.5">{STATUS_ICON.manquant} {c.manquant} info. manquante(s)</div>
        <div className="flex items-center gap-1.5">{STATUS_ICON.a_verifier} {c.a_verifier} à vérifier</div>
        <div className="flex items-center gap-1.5">{STATUS_ICON.suggestion} {c.suggestion} suggestion(s)</div>
        <div className="flex items-center gap-1.5">{STATUS_ICON.valide} {c.valide} validé(s)</div>
      </div>
    </PanelSection>
  );
}

export function PriceSummary() {
  const dossier = useActiveDossier();
  const quote = useQuote(dossier);
  const catalog = useApp((s) => s.catalog);
  const setTab = useApp((s) => s.setTab);
  if (!dossier || !quote) return null;
  const counts = new Map<ProductCategory, number>();
  for (const l of quote.lines) counts.set(l.category, (counts.get(l.category) ?? 0) + l.requested);
  const pack = catalog.packs.find((p) => p.id === dossier.quoteDraft.packId);
  return (
    <PanelSection
      title="Synthèse tarifaire"
      actions={
        <button className="text-xs font-medium text-brand-600 hover:underline" onClick={() => setTab('devis')}>
          Devis
        </button>
      }
    >
      <div className="mb-2 flex flex-wrap gap-1.5">
        {Array.from(counts.entries()).map(([cat, n]) => (
          <span key={cat} className="flex items-center gap-1 rounded-full bg-slate-100 py-0.5 pr-2 pl-0.5 text-[11px] text-slate-700" title={CATEGORY_SHORT[cat]}>
            <CategoryDot category={cat} /> {n}
          </span>
        ))}
        {!counts.size && <span className="text-xs text-slate-500">Aucun équipement placé.</span>}
      </div>
      <div className="text-xs text-slate-500">{pack ? pack.name : 'Sans forfait'} · {quote.equipmentCount} équipement(s)</div>
      <div className="mt-1.5 grid grid-cols-2 gap-2">
        <div className="rounded-md bg-slate-50 px-2 py-1.5">
          <div className="text-[10px] text-slate-500 uppercase">Frais initiaux</div>
          <div className="text-base font-semibold tabular-nums" data-testid="summary-initial">
            {formatEuro(quote.totals.initial)}
          </div>
        </div>
        <div className="rounded-md bg-slate-900 px-2 py-1.5 text-white">
          <div className="text-[10px] text-slate-300 uppercase">Mensuel</div>
          <div className="text-base font-semibold tabular-nums" data-testid="summary-monthly">
            {formatMonthly(quote.totals.monthly)}
          </div>
        </div>
      </div>
      {quote.hasUnpricedItems && <p className="mt-1.5 text-[11px] text-amber-700">Certains éléments ont un prix à confirmer (exclus des totaux).</p>}
      {quote.extras.initial > 0 && (
        <p className="mt-1 text-[11px] text-slate-500">
          Dont suppléments : {formatEuro(quote.extras.initial)} et {formatMonthly(quote.extras.monthly)}
        </p>
      )}
    </PanelSection>
  );
}
