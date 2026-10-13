import { useState } from 'react';
import { AlertTriangle, BadgeCheck, Download, FileDown, Loader2, PencilLine } from 'lucide-react';
import { useApp, useActiveDossier } from '@/state/store';
import { useAudit, useQuote } from '@/state/derived';
import { HOUSING_TYPE_LABELS } from '@/domain/labels';
import { levelArea } from '@/plan/geometry';
import { formatDateTime, formatEuro, formatMonthly, formatNumber } from '@/lib/format';
import { downloadBlob } from '@/catalog/excel';
import { getAsset, putAsset } from '@/persistence/assets';
import { getLastViewSnapshot } from '@/view3d/lastView';
import { IsoThumbnail } from '@/generator/IsoThumbnail';
import { Badge, Button, Card, Toggle, cx } from '../kit';
import { PlanThumb } from './PlanWizard';
import { CategoryDot } from './LeftPanels';

/**
 * Étape 9 : synthèse de la proposition (outil de vente) et génération du devis PDF.
 * Coûts initiaux et mensuels toujours séparés ; aucun prix manquant n'est inventé.
 */
export function QuoteSummary() {
  const dossier = useActiveDossier();
  const quote = useQuote(dossier);
  const audit = useAudit(dossier);
  const catalog = useApp((s) => s.catalog);
  const rules = useApp((s) => s.rules);
  const setTab = useApp((s) => s.setTab);
  const addQuoteRecord = useApp((s) => s.addQuoteRecord);
  const validateDemo = useApp((s) => s.validateDemo);
  const toast = useApp((s) => s.toast);
  const [busy, setBusy] = useState(false);
  const [include3d, setInclude3d] = useState(true);
  if (!dossier || !quote || !audit) return null;

  const generate = async () => {
    setBusy(true);
    try {
      const { generateQuoteForDossier } = await import('@/export/generate');
      const { record, blob } = await generateQuoteForDossier(dossier, catalog, rules, { view3d: getLastViewSnapshot(dossier.id), include3d });
      const dataUrl: string = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(r.error);
        r.readAsDataURL(blob);
      });
      await putAsset(`pdf:${record.id}`, dataUrl);
      addQuoteRecord(record);
      downloadBlob(blob, `${record.reference}.pdf`);
      toast('success', `Devis ${record.reference} généré. Les prix appliqués sont conservés dans l'historique.`);
    } catch (e) {
      toast('error', `Génération du PDF impossible : ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const levels = [...dossier.plan.levels].sort((a, b) => a.index - b.index);
  const first = levels.find((l) => l.rooms.length);
  const rooms = levels.reduce((n, l) => n + l.rooms.length, 0);
  const area = levels.reduce((n, l) => n + levelArea(l), 0);
  const extras = quote.lines.filter((l) => l.extra > 0);
  const toValidate = audit.alerts.filter((a) => a.status === 'manquant' || a.status === 'a_verifier');
  const hasCentrale = quote.lines.some((l) => l.category === 'centrale');

  return (
    <div className="scroll-thin h-full overflow-auto">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-6 lg:px-8" data-testid="quote-summary">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Synthèse de la proposition</h2>
            <p className="text-sm text-slate-600">
              {dossier.info.reference} · {dossier.info.clientName || 'Client non renseigné'} · {quote.pack ? quote.pack.name : 'Sans forfait (à la carte)'}
            </p>
          </div>
          <div className="flex gap-2">
            <Button icon={<PencilLine size={15} />} onClick={() => setTab('proposition')}>
              Modifier la configuration
            </Button>
            <Button variant="primary" icon={busy ? <Loader2 size={15} className="animate-spin" /> : <FileDown size={15} />} onClick={generate} disabled={busy}>
              {busy ? 'Génération…' : 'Générer le devis PDF'}
            </Button>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
          {/* Logement et équipements */}
          <Card title="Le logement" bodyClassName="p-4">
            <div className="flex flex-col gap-4 sm:flex-row">
              <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-1">
                <div className="overflow-hidden rounded-lg border border-slate-100 bg-slate-50">{first ? <PlanThumb level={first} width={210} height={140} /> : <div className="h-[140px] w-[210px]" />}</div>
                <div className="flex items-center justify-center overflow-hidden rounded-lg border border-slate-100 bg-slate-50">
                  <IsoThumbnail levels={levels} width={210} height={140} />
                </div>
              </div>
              <dl className="grid flex-1 grid-cols-2 content-start gap-x-4 gap-y-3 text-sm">
                <div>
                  <dt className="text-[11px] tracking-wide text-slate-500 uppercase">Type</dt>
                  <dd className="font-medium text-slate-900">{HOUSING_TYPE_LABELS[dossier.info.housingType]}</dd>
                </div>
                <div>
                  <dt className="text-[11px] tracking-wide text-slate-500 uppercase">Surface du plan</dt>
                  <dd className="font-medium text-slate-900">{formatNumber(area, 0)} m²</dd>
                </div>
                <div>
                  <dt className="text-[11px] tracking-wide text-slate-500 uppercase">Niveaux / pièces</dt>
                  <dd className="font-medium text-slate-900">
                    {levels.length} / {rooms}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] tracking-wide text-slate-500 uppercase">Équipements</dt>
                  <dd className="text-2xl font-bold text-slate-900 tabular-nums" data-testid="summary-equipment-count">
                    {quote.equipmentCount}
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-[11px] tracking-wide text-slate-500 uppercase">Ouvertures extérieures recensées</dt>
                  <dd className="font-medium text-slate-900">{audit.inventory.exteriorOpenings.length}</dd>
                </div>
              </dl>
            </div>
          </Card>

          {/* Montants */}
          <Card title="Montants" bodyClassName="p-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-200 px-4 py-3">
                <div className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">Frais matériels initiaux</div>
                <div className="mt-1 text-3xl font-bold text-slate-900 tabular-nums" data-testid="summary-initial">
                  {formatEuro(quote.totals.initial)}
                </div>
                {quote.hasUnpricedItems && <div className="text-[11px] font-medium text-amber-700">+ éléments à confirmer</div>}
              </div>
              <div className="rounded-xl bg-slate-900 px-4 py-3 text-white">
                <div className="text-[11px] font-semibold tracking-wide text-slate-300 uppercase">Montant mensuel</div>
                <div className="mt-1 text-3xl font-bold tabular-nums" data-testid="summary-monthly">
                  {formatMonthly(quote.totals.monthly)}
                </div>
              </div>
            </div>
            <dl className="mt-4 space-y-1.5 text-sm">
              {quote.pack && (
                <div className="flex justify-between">
                  <dt className="text-slate-600">
                    Forfait {quote.pack.name}
                    {quote.pack.transferred && <Badge tone="amber" className="ml-1">abonnement transféré</Badge>}
                  </dt>
                  <dd className="tabular-nums">
                    {formatEuro(quote.pack.initial)} · {formatMonthly(quote.pack.monthly)}
                  </dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-slate-600">Équipements supplémentaires</dt>
                <dd className="tabular-nums">
                  {formatEuro(quote.extras.initial)} · {formatMonthly(quote.extras.monthly)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-600">Frais d'installation</dt>
                <dd className={cx('tabular-nums', quote.installation === null && 'text-amber-700')}>{formatEuro(quote.installation)}</dd>
              </div>
              {quote.discounts.map((d) => (
                <div key={d.id} className="flex justify-between text-emerald-700">
                  <dt>Remise : {d.label}</dt>
                  <dd className="tabular-nums">- {d.target === 'mensuel_total' ? formatMonthly(d.amount) : formatEuro(d.amount)}</dd>
                </div>
              ))}
              {hasCentrale && (
                <div className="flex justify-between text-slate-500">
                  <dt>Centrale</dt>
                  <dd>0 €/mois (aucun supplément mensuel)</dd>
                </div>
              )}
            </dl>
            <p className="mt-3 text-[11px] text-slate-500">
              {catalog.settings.vatRate === null || catalog.settings.priceBasis === 'inconnue'
                ? 'TVA non renseignée : montants tels que communiqués (HT/TTC à confirmer).'
                : `Prix ${catalog.settings.priceBasis}, TVA ${catalog.settings.vatRate} %.`}{' '}
              Tarifs de démonstration, non officiels.
            </p>
          </Card>
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          <Card title="Inclus dans le forfait">
            {!quote.pack ? (
              <p className="text-sm text-slate-500">Sans forfait : tous les équipements sont facturés à l'unité.</p>
            ) : (
              <ul className="space-y-1.5 text-sm" data-testid="summary-included">
                {quote.pack.items.map((i) => (
                  <li key={i.productId} className="flex justify-between gap-2">
                    <span className="text-slate-800">{i.name}</span>
                    <span className={cx('tabular-nums', i.used < i.quantity ? 'text-slate-500' : 'text-slate-900')}>
                      {i.used}/{i.quantity}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Équipements supplémentaires">
            {extras.length === 0 && quote.bundles.length === 0 ? (
              <p className="text-sm text-slate-500">Aucun équipement hors forfait.</p>
            ) : (
              <ul className="space-y-1.5 text-sm" data-testid="summary-extras">
                {extras.map((l) => (
                  <li key={l.productId} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-slate-800">
                      <CategoryDot category={l.category} />
                      {l.extra} × {l.name}
                    </span>
                    <span className="text-right text-xs tabular-nums text-slate-600">
                      {l.extraInitial === null ? 'à confirmer' : formatEuro(l.extraInitial)} · {l.extraMonthly === null ? 'à confirmer' : formatMonthly(l.extraMonthly)}
                    </span>
                  </li>
                ))}
                {quote.bundles.map((b) => (
                  <li key={`${b.productId}-${b.coveredProductId}`} className="flex justify-between gap-2">
                    <span className="text-slate-800">
                      {b.count} × {b.name}
                    </span>
                    <span className="text-xs tabular-nums text-slate-600">
                      {formatEuro(b.initial)} · {formatMonthly(b.monthly)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Points à valider">
            {toValidate.length === 0 && quote.unpriced.length === 0 ? (
              <p className="text-sm text-emerald-700">Aucun point en attente.</p>
            ) : (
              <ul className="space-y-1.5 text-sm" data-testid="summary-to-validate">
                {quote.unpriced.map((u) => (
                  <li key={u.productId} className="flex gap-1.5 text-amber-800">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" /> Prix à confirmer : {u.name}
                  </li>
                ))}
                {toValidate.slice(0, 6).map((a) => (
                  <li key={a.id} className="flex gap-1.5 text-slate-700">
                    <span className={cx('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', a.status === 'manquant' ? 'bg-brand-600' : 'bg-amber-500')} />
                    {a.title}
                  </li>
                ))}
                {toValidate.length > 6 && (
                  <li>
                    <button className="text-xs font-medium text-slate-900 underline" onClick={() => setTab('audit')}>
                      + {toValidate.length - 6} autre(s) point(s) dans l'audit
                    </button>
                  </li>
                )}
              </ul>
            )}
          </Card>
        </div>

        <Card title="Options du devis PDF">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <Toggle checked={include3d} onChange={setInclude3d} label="Inclure la maquette 3D" />
              <p className="mt-1 text-[11px] text-slate-500">
                {getLastViewSnapshot(dossier.id) ? 'La vue 3D choisie dans la visualisation 3D sera utilisée.' : 'Une vue isométrique sera générée automatiquement.'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                icon={<BadgeCheck size={15} />}
                disabled={!dossier.quotes.length}
                onClick={() => {
                  validateDemo();
                  toast('success', 'Proposition marquée « validée » (action de démonstration, sans intégration).');
                }}
              >
                Marquer la proposition validée (démo)
              </Button>
            </div>
          </div>
        </Card>

        <Card title="Historique des devis" bodyClassName="p-0 overflow-x-auto">
          {dossier.quotes.length === 0 ? (
            <p className="px-4 py-4 text-sm text-slate-500">Aucun devis généré pour ce dossier.</p>
          ) : (
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-left text-[11px] tracking-wide text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-2 font-semibold">Référence</th>
                  <th className="px-4 py-2 font-semibold">Date</th>
                  <th className="px-4 py-2 font-semibold">Offre</th>
                  <th className="px-4 py-2 text-right font-semibold">Initial (prix figés)</th>
                  <th className="px-4 py-2 text-right font-semibold">Mensuel (prix figés)</th>
                  <th className="px-4 py-2 font-semibold">Catalogue</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {dossier.quotes.map((q) => (
                  <tr key={q.id} className="border-t border-slate-100" data-testid={`quote-record-${q.reference}`}>
                    <td className="px-4 py-2 font-mono text-xs">{q.reference}</td>
                    <td className="px-4 py-2">{formatDateTime(q.createdAt)}</td>
                    <td className="px-4 py-2">{q.packName}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatEuro(q.totals.initial)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatMonthly(q.totals.monthly)}</td>
                    <td className="px-4 py-2 text-xs text-slate-500">
                      v{q.priceSnapshot.catalogVersion}
                      {q.priceSnapshot.catalogVersion !== catalog.version && <span className="ml-1 text-amber-700">(catalogue modifié depuis)</span>}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Button
                        size="sm"
                        icon={<Download size={13} />}
                        onClick={async () => {
                          const url = await getAsset(`pdf:${q.id}`);
                          if (!url) return toast('error', 'PDF introuvable dans ce navigateur (stockage effacé ?).');
                          const blob = await (await fetch(url)).blob();
                          downloadBlob(blob, `${q.reference}.pdf`);
                        }}
                      >
                        PDF
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}
