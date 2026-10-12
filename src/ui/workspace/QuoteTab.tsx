import { useMemo, useState } from 'react';
import { BadgeCheck, Download, FileDown, Loader2, Minus, Plus, Settings2 } from 'lucide-react';
import { useApp, useActiveDossier } from '@/state/store';
import { useAudit, useQuote } from '@/state/derived';
import { buildComparison } from '@/quote/compare';
import { formatDateTime, formatEuro, formatMonthly } from '@/lib/format';
import { DISCOUNT_TARGET_LABELS } from '@/domain/labels';
import { Badge, Button, Card, IconButton, Select, Toggle, cx } from '../kit';
import { CategoryDot } from './LeftPanels';
import { downloadBlob } from '@/catalog/excel';
import { getAsset, putAsset } from '@/persistence/assets';
import { getLastViewSnapshot } from '@/view3d/lastView';

function Comparator() {
  const dossier = useActiveDossier()!;
  const audit = useAudit(dossier)!;
  const catalog = useApp((s) => s.catalog);
  const setPack = useApp((s) => s.setQuotePack);
  const comparison = useMemo(() => buildComparison(dossier, catalog, audit), [dossier, catalog, audit]);
  return (
    <Card title="Comparateur d'offres" actions={<span className="text-xs text-slate-500">Frais initiaux · mensualité (remises sélectionnées incluses)</span>} bodyClassName="p-0">
      <table className="w-full text-sm" data-testid="comparator">
        <thead className="bg-slate-50 text-left text-xs text-slate-500">
          <tr>
            <th className="px-4 py-2 font-medium">Configuration</th>
            {comparison.offers.map((o) => (
              <th key={o.packId ?? 'none'} className="px-4 py-2 font-medium">
                {o.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {comparison.configs.map((c) => (
            <tr key={c.key} className="border-t border-slate-100">
              <td className="px-4 py-2.5">
                <div className="font-medium text-slate-800">{c.label}</div>
                <div className="text-[11px] text-slate-500">{c.total} équipement(s)</div>
              </td>
              {comparison.offers.map((o) => {
                const cell = comparison.cells.find((x) => x.config === c.key && x.packId === o.packId)!;
                const selected = c.key === 'plan' && dossier.quoteDraft.packId === o.packId;
                return (
                  <td key={o.packId ?? 'none'} className="px-2 py-1.5">
                    <button
                      disabled={c.key !== 'plan'}
                      onClick={() => setPack(o.packId)}
                      className={cx(
                        'w-full rounded-md border px-3 py-2 text-left transition-colors',
                        selected ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-100' : 'border-slate-200',
                        c.key === 'plan' ? 'hover:border-brand-300' : 'cursor-default',
                      )}
                      data-testid={`cell-${c.key}-${o.packId ?? 'none'}`}
                    >
                      <div className="font-semibold tabular-nums">{formatEuro(cell.result.totals.initial)}</div>
                      <div className="text-xs tabular-nums text-slate-600">{formatMonthly(cell.result.totals.monthly)}</div>
                      {cell.result.hasUnpricedItems && <div className="text-[10px] text-amber-700">+ éléments à confirmer</div>}
                      {cell.result.extras.initial > 0 && cell.result.pack && (
                        <div className="text-[10px] text-slate-500">dont suppl. {formatEuro(cell.result.extras.initial)}</div>
                      )}
                      {selected && <div className="mt-0.5 text-[10px] font-semibold text-brand-700">Offre retenue</div>}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-4 py-2 text-[11px] text-slate-500">
        Cliquez sur une case de la ligne « Configuration retenue » pour choisir l'offre du devis. Le prix d'un pack est un forfait : il n'est jamais calculé comme la somme des
        prix unitaires, et un équipement inclus n'est jamais facturé deux fois.
      </p>
    </Card>
  );
}

export function QuoteTab() {
  const dossier = useActiveDossier();
  const quote = useQuote(dossier);
  const catalog = useApp((s) => s.catalog);
  const rules = useApp((s) => s.rules);
  const setPack = useApp((s) => s.setQuotePack);
  const setAdjustment = useApp((s) => s.setAdjustment);
  const toggleDiscount = useApp((s) => s.toggleDiscount);
  const addQuoteRecord = useApp((s) => s.addQuoteRecord);
  const validateDemo = useApp((s) => s.validateDemo);
  const setView = useApp((s) => s.setView);
  const toast = useApp((s) => s.toast);
  const [busy, setBusy] = useState(false);
  const [include3d, setInclude3d] = useState(true);
  if (!dossier || !quote) return null;
  const adj = (productId: string) => dossier.quoteDraft.adjustments.find((a) => a.productId === productId)?.delta ?? 0;
  const addable = catalog.products.filter((p) => p.active && p.billing !== 'lot' && !quote.lines.some((l) => l.productId === p.id));

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

  return (
    <div className="scroll-thin h-full overflow-auto">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 p-6">
        <Comparator />
        <div className="grid grid-cols-3 gap-5">
          <Card
            title="Devis – configuration retenue"
            className="col-span-2"
            actions={
              <Select value={dossier.quoteDraft.packId ?? ''} onChange={(e) => setPack(e.target.value || null)} className="w-56" aria-label="Offre du devis">
                {catalog.packs
                  .filter((p) => p.active || p.id === dossier.quoteDraft.packId)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                <option value="">Sans forfait (à la carte)</option>
              </Select>
            }
            bodyClassName="p-0"
          >
            {quote.pack && (
              <div className="border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800">{quote.pack.name} – forfait</span>
                  <span className="tabular-nums">
                    <strong>{formatEuro(quote.pack.initial)}</strong> de frais matériel · <strong>{formatMonthly(quote.pack.monthly)}</strong>
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {quote.pack.items.map((i) => (
                    <Badge key={i.productId} tone={i.used >= i.quantity ? 'green' : 'slate'}>
                      {i.quantity} × {i.name} {i.used < i.quantity ? `(${i.used} utilisé${i.used > 1 ? 's' : ''})` : ''}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            <table className="w-full text-sm" data-testid="quote-lines">
              <thead className="text-left text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Équipement</th>
                  <th className="px-2 py-2 text-center font-medium">Plan</th>
                  <th className="px-2 py-2 text-center font-medium">Ajustement</th>
                  <th className="px-2 py-2 text-center font-medium">Total</th>
                  <th className="px-2 py-2 text-center font-medium">Inclus</th>
                  <th className="px-2 py-2 text-center font-medium">Suppl.</th>
                  <th className="px-2 py-2 text-right font-medium">Prix unit.</th>
                  <th className="px-4 py-2 text-right font-medium">Supplément</th>
                </tr>
              </thead>
              <tbody>
                {quote.lines.map((l) => {
                  const a = adj(l.productId);
                  return (
                    <tr key={l.productId} className="border-t border-slate-100" data-testid={`quote-line-${l.reference}`}>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <CategoryDot category={l.category} />
                          <div>
                            <div className="font-medium text-slate-800">{l.name}</div>
                            <div className="text-[11px] text-slate-500">{l.reference}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-2 py-2 text-center tabular-nums text-slate-500">{l.requested - a}</td>
                      <td className="px-2 py-2">
                        <div className="flex items-center justify-center gap-1">
                          <IconButton label="Retirer une unité" className="h-6 w-6" onClick={() => setAdjustment(l.productId, a - 1)} disabled={l.requested <= 0}>
                            <Minus size={12} />
                          </IconButton>
                          <span className={cx('w-6 text-center text-xs tabular-nums', a > 0 ? 'text-emerald-700' : a < 0 ? 'text-red-700' : 'text-slate-400')}>
                            {a > 0 ? `+${a}` : a}
                          </span>
                          <IconButton label="Ajouter une unité" className="h-6 w-6" onClick={() => setAdjustment(l.productId, a + 1)}>
                            <Plus size={12} />
                          </IconButton>
                        </div>
                      </td>
                      <td className="px-2 py-2 text-center font-semibold tabular-nums">{l.requested}</td>
                      <td className="px-2 py-2 text-center tabular-nums text-emerald-700">{l.included || '—'}</td>
                      <td className="px-2 py-2 text-center tabular-nums">
                        {l.extra || '—'}
                        {l.bundled > 0 && <div className="text-[10px] text-slate-500">dont {l.bundled} en lot</div>}
                      </td>
                      <td className="px-2 py-2 text-right text-xs tabular-nums text-slate-600">
                        {l.priceKnown ? (
                          <>
                            {formatEuro(l.unitInitial)}
                            <div>{formatMonthly(l.unitMonthly)}</div>
                          </>
                        ) : (
                          <Badge tone="amber">À confirmer</Badge>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {l.extra - l.bundled > 0 ? (
                          l.extraInitial === null ? (
                            <Badge tone="amber">À confirmer</Badge>
                          ) : (
                            <>
                              {formatEuro(l.extraInitial)}
                              <div className="text-xs text-slate-500">{formatMonthly(l.extraMonthly)}</div>
                            </>
                          )
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {quote.bundles.map((b) => (
                  <tr key={`${b.productId}-${b.coveredProductId}`} className="border-t border-slate-100 bg-emerald-50/40">
                    <td className="px-4 py-2" colSpan={5}>
                      <div className="font-medium text-slate-800">
                        {b.count} × {b.name}
                      </div>
                      <div className="text-[11px] text-emerald-700">
                        Regroupement automatique de {b.covers} détecteurs supplémentaires · économie {formatEuro(b.savingInitial)} et {formatMonthly(b.savingMonthly)}
                      </div>
                    </td>
                    <td className="px-2 py-2 text-center tabular-nums">{b.covers}</td>
                    <td className="px-2 py-2 text-right text-xs tabular-nums text-slate-600">
                      {formatEuro(b.unitInitial)}
                      <div>{formatMonthly(b.unitMonthly)}</div>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {formatEuro(b.initial)}
                      <div className="text-xs text-slate-500">{formatMonthly(b.monthly)}</div>
                    </td>
                  </tr>
                ))}
                {quote.includedUnused.map((u) => (
                  <tr key={`unused-${u.productId}`} className="border-t border-slate-100 text-slate-500">
                    <td className="px-4 py-2 text-xs" colSpan={8}>
                      Inclus dans le forfait mais non positionné sur le plan : {u.quantity} × {u.name}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex items-center gap-2 border-t border-slate-100 px-4 py-2.5">
              <span className="text-xs text-slate-500">Ajouter un équipement au devis :</span>
              <Select
                value=""
                onChange={(e) => e.target.value && setAdjustment(e.target.value, adj(e.target.value) + 1)}
                className="h-8 w-72 py-0 text-xs"
                aria-label="Ajouter un équipement"
              >
                <option value="">Choisir…</option>
                {addable.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
          </Card>

          <div className="flex flex-col gap-5">
            <Card title="Récapitulatif">
              <dl className="space-y-1.5 text-sm">
                {quote.pack && (
                  <div className="flex justify-between">
                    <dt className="text-slate-600">Forfait {quote.pack.name}</dt>
                    <dd className="text-right tabular-nums">
                      {formatEuro(quote.pack.initial)}
                      <div className="text-xs text-slate-500">{formatMonthly(quote.pack.monthly)}</div>
                    </dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-slate-600">Équipements supplémentaires</dt>
                  <dd className="text-right tabular-nums">
                    {formatEuro(quote.extras.initial)}
                    <div className="text-xs text-slate-500">{formatMonthly(quote.extras.monthly)}</div>
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
              </dl>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-slate-100 px-3 py-2">
                  <div className="text-[10px] text-slate-500 uppercase">Frais initiaux</div>
                  <div className="text-xl font-semibold tabular-nums" data-testid="quote-initial">
                    {formatEuro(quote.totals.initial)}
                  </div>
                </div>
                <div className="rounded-lg bg-brand-700 px-3 py-2 text-white">
                  <div className="text-[10px] text-brand-100 uppercase">Mensuel</div>
                  <div className="text-xl font-semibold tabular-nums" data-testid="quote-monthly">
                    {formatMonthly(quote.totals.monthly)}
                  </div>
                </div>
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                {catalog.settings.vatRate === null || catalog.settings.priceBasis === 'inconnue'
                  ? 'TVA non renseignée : montants tels que communiqués (HT/TTC à confirmer).'
                  : `Prix ${catalog.settings.priceBasis}, TVA ${catalog.settings.vatRate} %.`}
              </p>
              {quote.warnings.length > 0 && (
                <ul className="mt-2 space-y-1 text-[11px] text-amber-800">
                  {quote.warnings.map((w) => (
                    <li key={w}>• {w}</li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title="Remises configurées" actions={<IconButton label="Configurer les remises" onClick={() => setView('catalog')}><Settings2 size={15} /></IconButton>}>
              {catalog.discounts.filter((d) => d.active).length === 0 ? (
                <p className="text-xs text-slate-500">Aucune remise active dans le catalogue.</p>
              ) : (
                catalog.discounts
                  .filter((d) => d.active)
                  .map((d) => (
                    <div key={d.id} className="mb-2">
                      <Toggle
                        checked={dossier.quoteDraft.discountIds.includes(d.id)}
                        onChange={() => toggleDiscount(d.id)}
                        label={`${d.label} (${d.kind === 'pourcentage' ? `${d.value} %` : formatEuro(d.value)})`}
                      />
                      <p className="ml-11 text-[11px] text-slate-500">
                        {DISCOUNT_TARGET_LABELS[d.target]}
                        {d.note ? ` · ${d.note}` : ''}
                      </p>
                    </div>
                  ))
              )}
            </Card>
            <Card title="Génération du devis PDF">
              <Toggle checked={include3d} onChange={setInclude3d} label="Inclure la maquette 3D" />
              <p className="mt-1 mb-3 text-[11px] text-slate-500">
                {getLastViewSnapshot(dossier.id) ? 'La vue 3D choisie dans l’onglet Vue 3D sera utilisée.' : 'Une vue isométrique sera générée automatiquement.'}
              </p>
              <Button variant="primary" className="w-full" icon={busy ? <Loader2 size={15} className="animate-spin" /> : <FileDown size={15} />} onClick={generate} disabled={busy}>
                {busy ? 'Génération…' : 'Générer le devis PDF'}
              </Button>
              <Button
                className="mt-2 w-full"
                icon={<BadgeCheck size={15} />}
                disabled={!dossier.quotes.length}
                onClick={() => {
                  validateDemo();
                  toast('success', 'Proposition marquée « validée » (action de démonstration, sans intégration).');
                }}
              >
                Marquer la proposition validée (démo)
              </Button>
            </Card>
          </div>
        </div>

        <Card title="Historique des devis" bodyClassName="p-0">
          {dossier.quotes.length === 0 ? (
            <p className="px-4 py-4 text-sm text-slate-500">Aucun devis généré pour ce dossier.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Référence</th>
                  <th className="px-4 py-2 font-medium">Date</th>
                  <th className="px-4 py-2 font-medium">Offre</th>
                  <th className="px-4 py-2 text-right font-medium">Initial (prix figés)</th>
                  <th className="px-4 py-2 text-right font-medium">Mensuel (prix figés)</th>
                  <th className="px-4 py-2 font-medium">Catalogue</th>
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
