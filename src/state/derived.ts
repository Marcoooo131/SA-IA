import { useMemo } from 'react';
import type { Catalog, Dossier } from '@/domain/types';
import { runAudit, type AuditResult } from '@/rules/engine';
import type { RulesConfig } from '@/rules/config';
import { quoteForDossier } from '@/quote/compare';
import type { QuoteResult } from '@/quote/calculator';
import { useApp } from './store';

export function useAudit(dossier: Dossier | null): AuditResult | null {
  const rules = useApp((s) => s.rules);
  const products = useApp((s) => s.catalog.products);
  return useMemo(() => (dossier ? runAudit(dossier, rules, products) : null), [dossier, rules, products]);
}

export function useQuote(dossier: Dossier | null): QuoteResult | null {
  const catalog = useApp((s) => s.catalog);
  return useMemo(() => (dossier ? quoteForDossier(dossier, catalog) : null), [dossier, catalog]);
}

export interface StepState {
  key: 'dossier' | 'plan' | 'vue3d' | 'audit' | 'offres' | 'devis';
  label: string;
  done: boolean;
  missing: string[];
}

/** État du parcours guidé en 6 étapes. */
export function journeySteps(dossier: Dossier, audit: AuditResult, catalog: Catalog, rules: RulesConfig): StepState[] {
  void rules;
  const info = dossier.info;
  const dossierMissing = [
    !info.clientName.trim() && 'nom ou identifiant du client',
    !info.address.trim() && 'adresse',
    !info.surface && 'surface',
    !info.installationDate && "date d'installation",
  ].filter(Boolean) as string[];
  const rooms = dossier.plan.levels.reduce((s, l) => s + l.rooms.length, 0);
  const extOpenings = audit.inventory.exteriorOpenings.length;
  const planMissing = [rooms === 0 && 'aucune pièce', rooms > 0 && extOpenings === 0 && 'aucune ouverture extérieure'].filter(Boolean) as string[];
  const open = audit.alerts.filter((a) => a.status === 'manquant' || a.status === 'a_verifier').length;
  const auditMissing = [
    dossier.devices.length === 0 && 'aucun équipement positionné',
    open > 0 && `${open} point(s) à traiter`,
  ].filter(Boolean) as string[];
  const pack = dossier.quoteDraft.packId ? catalog.packs.find((p) => p.id === dossier.quoteDraft.packId) : null;
  const offerMissing = [dossier.quoteDraft.packId && !pack && 'offre introuvable'].filter(Boolean) as string[];
  return [
    { key: 'dossier', label: 'Dossier', done: dossierMissing.length === 0, missing: dossierMissing },
    { key: 'plan', label: 'Plan', done: planMissing.length === 0, missing: planMissing },
    { key: 'vue3d', label: 'Visualisation 2D/3D', done: rooms > 0, missing: rooms ? [] : ['plan vide'] },
    { key: 'audit', label: 'Audit & équipements', done: auditMissing.length === 0, missing: auditMissing },
    { key: 'offres', label: 'Offres', done: offerMissing.length === 0 && dossier.devices.length > 0, missing: offerMissing },
    { key: 'devis', label: 'Devis PDF', done: dossier.quotes.length > 0, missing: dossier.quotes.length ? [] : ['aucun devis généré'] },
  ];
}
