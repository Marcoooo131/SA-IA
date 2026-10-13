import { useMemo } from 'react';
import { ArrowRight, Minus, Plus, RotateCcw, Settings2 } from 'lucide-react';
import { useApp, useActiveDossier } from '@/state/store';
import { useAudit, useQuote } from '@/state/derived';
import { buildComparison, variantKey } from '@/quote/compare';
import { formatEuro, formatMonthly, formatNumber } from '@/lib/format';
import { DISCOUNT_TARGET_LABELS } from '@/domain/labels';
import { Badge, Button, Card, IconButton, NumberInput, Select, TextInput, Toggle, cx } from '../kit';
import { CategoryDot } from './LeftPanels';

const signed = (v: number) => `${v >= 0 ? '+' : '-'} ${formatEuro(Math.abs(v))}`;

function Comparator() {
  const dossier = useActiveDossier()!;
  const audit = useAudit(dossier)!;
  const catalog = useApp((s) => s.catalog);
  const setPack = useApp((s) => s.setQuotePack);
  const toggleVariant = useApp((s) => s.togglePdfVariant);
  const shownKeys = new Set(dossier.quoteDraft.pdfVariants ?? []);
  const comparison = useMemo(() => buildComparison(dossier, catalog, audit), [dossier, catalog, audit]);
  return (
    <Card
      title="Comparateur d'offres"
      actions={
        <span className="text-xs text-slate-500" data-testid="variants-count">
          Frais initiaux · mensualité (remises incluses) ·{' '}
          {(() => {
            const n = comparison.cells.filter((c) => shownKeys.has(variantKey(c.config, c.packId)) && !(c.config === 'plan' && c.packId === dossier.quoteDraft.packId)).length;
            return n ? `${n} variante(s) affichée(s) sur le devis` : 'aucune variante sur le devis';
          })()}
        </span>
      }
      bodyClassName="p-0"
    >
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
                const key = variantKey(c.key, o.packId);
                return (
                  <td key={o.packId ?? 'none'} className="px-2 py-1.5 align-top">
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
                    {!selected && (
                      <label className="mt-1 flex items-center gap-1 px-1 text-[10px] text-slate-600">
                        <input
                          type="checkbox"
                          className="h-3 w-3 accent-brand-600"
                          checked={shownKeys.has(key)}
                          onChange={() => toggleVariant(key)}
                          data-testid={`variant-${key}`}
                        />
                        Afficher sur le devis
                      </label>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-4 py-2 text-[11px] text-slate-500">
        Cliquez sur une case de la ligne « Configuration retenue » pour choisir l'offre du devis. Les autres variantes n'apparaissent dans le PDF que si vous cochez
        « Afficher sur le devis ». Le prix d'un pack est un forfait : il n'est jamais calculé comme la somme des
        prix unitaires, et un équipement inclus n'est jamais facturé deux fois.
      </p>
    </Card>
  );
}

export function QuoteTab() {
  const dossier = useActiveDossier();
  const quote = useQuote(dossier);
  const catalog = useApp((s) => s.catalog);
  const setPack = useApp((s) => s.setQuotePack);
  const setAdjustment = useApp((s) => s.setAdjustment);
  const setPriceOverride = useApp((s) => s.setPriceOverride);
  const setMoved = useApp((s) => s.setMoved);
  const setPackOverride = useApp((s) => s.setPackOverride);
  const setPackTransferred = useApp((s) => s.setPackTransferred);
  const setMovingAll = useApp((s) => s.setMovingAll);
  const setTotalOverride = useApp((s) => s.setTotalOverride);
  const toggleDiscount = useApp((s) => s.toggleDiscount);
  const setView = useApp((s) => s.setView);
  const setTab = useApp((s) => s.setTab);
  if (!dossier || !quote) return null;
  const adj = (productId: string) => dossier.quoteDraft.adjustments.find((a) => a.productId === productId)?.delta ?? 0;
  const addable = catalog.products.filter((p) => p.active && p.billing !== 'lot' && !quote.lines.some((l) => l.productId === p.id));

  return (
    <div className="scroll-thin h-full overflow-auto">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-6 lg:px-8">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Proposition commerciale</h2>
          <p className="text-sm text-slate-600">Comparez les offres, choisissez le forfait et ajustez la configuration. Les prix manquants restent « à confirmer », jamais inventés.</p>
        </div>
        <Comparator />
        <div className="grid gap-5 xl:grid-cols-3">
          <Card
            title="Devis – configuration retenue"
            className="xl:col-span-2"
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
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm" data-testid="moving-bar">
              <div>
                <div className="font-semibold text-amber-900">Déménagement</div>
                <div className="text-[11px] text-amber-800">
                  Équipements repris du logement précédent et abonnement transféré : frais matériels à 0 €, la mensualité reste due.
                  {quote.movedCount > 0 && ` ${quote.movedCount} équipement(s) repris.`}
                  {quote.pack?.transferred && ' Abonnement transféré.'}
                </div>
              </div>
              <Toggle
                checked={(!quote.pack || quote.pack.transferred) && quote.lines.every((l) => l.moved === l.extra) && (quote.movedCount > 0 || !!quote.pack?.transferred)}
                onChange={(on) => setMovingAll(on, quote.lines.map((l) => ({ productId: l.productId, quantity: l.extra })))}
                label="Tout passer en déménagement"
              />
            </div>
            {quote.pack && (
              <div className="border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-slate-800">
                    {quote.pack.name} – forfait
                    {quote.pack.transferred && (
                      <Badge tone="amber" className="ml-2">
                        Abonnement transféré
                      </Badge>
                    )}
                    {quote.pack.overridden && (
                      <Badge tone="blue" className="ml-2">
                        Prix modifié
                      </Badge>
                    )}
                  </span>
                  <div className="flex items-center gap-2">
                    <NumberInput
                      value={dossier.quoteDraft.packOverride?.initial ?? null}
                      onChange={(v) => setPackOverride({ initial: v })}
                      allowNull
                      min={0}
                      step={10}
                      suffix="€"
                      placeholder={formatNumber(quote.pack.catalogInitial, 0)}
                      className="w-28"
                      disabled={quote.pack.transferred}
                      aria-label="Frais matériel du forfait"
                    />
                    <NumberInput
                      value={dossier.quoteDraft.packOverride?.monthly ?? null}
                      onChange={(v) => setPackOverride({ monthly: v })}
                      allowNull
                      min={0}
                      step={0.5}
                      suffix="€/m"
                      placeholder={formatNumber(quote.pack.catalogMonthly)}
                      className="w-28"
                      aria-label="Mensualité du forfait"
                    />
                    {quote.pack.overridden && (
                      <IconButton label="Revenir au prix du catalogue" className="h-7 w-7" onClick={() => setPackOverride(null)}>
                        <RotateCcw size={13} />
                      </IconButton>
                    )}
                  </div>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-1.5">
                    {quote.pack.items.map((i) => (
                      <Badge key={i.productId} tone={i.used >= i.quantity ? 'green' : 'slate'}>
                        {i.quantity} × {i.name} {i.used < i.quantity ? `(${i.used} utilisé${i.used > 1 ? 's' : ''})` : ''}
                      </Badge>
                    ))}
                  </div>
                  <Toggle checked={quote.pack.transferred} onChange={setPackTransferred} label="Abonnement transféré (frais matériels à 0 €, mensualité conservée)" />
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  Appliqué : <strong>{formatEuro(quote.pack.initial)}</strong> · <strong>{formatMonthly(quote.pack.monthly)}</strong>
                  {(quote.pack.overridden || quote.pack.transferred) && ` (catalogue : ${formatEuro(quote.pack.catalogInitial)} · ${formatMonthly(quote.pack.catalogMonthly)})`}. Laisser un
                  champ vide pour revenir au prix du catalogue.
                </p>
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
                  <th className="px-2 py-2 text-center font-medium">Déménag.</th>
                  <th className="px-2 py-2 text-right font-medium">Prix unitaire (modifiable)</th>
                  <th className="px-4 py-2 text-right font-medium">Supplément</th>
                </tr>
              </thead>
              <tbody>
                {quote.lines.map((l) => {
                  const a = adj(l.productId);
                  const o = dossier.quoteDraft.priceOverrides.find((x) => x.productId === l.productId);
                  const billable = l.extra - l.moved - l.bundled;
                  return (
                    <tr key={l.productId} className="border-t border-slate-100 align-top" data-testid={`quote-line-${l.reference}`}>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <CategoryDot category={l.category} />
                          <div>
                            <div className="font-medium text-slate-800">{l.name}</div>
                            <div className="text-[11px] text-slate-500">
                              {l.reference}
                              {l.overridden && <span className="ml-1 font-medium text-slate-900">· prix modifié</span>}
                            </div>
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
                      <td className="px-2 py-2 text-center">
                        {l.extra > 0 ? (
                          <div className="flex flex-col items-center gap-1">
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-amber-600"
                              checked={l.moved > 0}
                              onChange={(e) => setMoved(l.productId, e.target.checked ? l.extra : 0)}
                              aria-label={`Déménagement : ${l.name}`}
                            />
                            {l.extra > 1 && l.moved > 0 && (
                              <NumberInput value={l.moved} onChange={(v) => setMoved(l.productId, Math.min(l.extra, v ?? 0))} min={0} max={l.extra} step={1} className="w-14" aria-label={`Unités reprises : ${l.name}`} />
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <div className="ml-auto flex w-32 flex-col gap-1">
                          <NumberInput
                            value={o?.initial ?? null}
                            onChange={(v) => setPriceOverride(l.productId, { initial: v })}
                            allowNull
                            min={0}
                            step={1}
                            suffix="€"
                            placeholder={l.catalogInitial === null ? 'à confirmer' : formatNumber(l.catalogInitial, l.catalogInitial % 1 ? 2 : 0)}
                            aria-label={`Prix matériel ${l.reference}`}
                          />
                          <NumberInput
                            disabled={l.category === 'centrale'}
                            title={l.category === 'centrale' ? 'Règle métier : la centrale n’a pas de supplément mensuel (0 €)' : undefined}
                            value={l.category === 'centrale' ? 0 : (o?.monthly ?? null)}
                            onChange={(v) => setPriceOverride(l.productId, { monthly: v })}
                            allowNull
                            min={0}
                            step={0.5}
                            suffix="€/m"
                            placeholder={l.catalogMonthly === null ? 'à confirmer' : formatNumber(l.catalogMonthly, l.catalogMonthly % 1 ? 2 : 0)}
                            aria-label={`Mensualité ${l.reference}`}
                          />
                          {l.overridden && (
                            <button className="text-right text-[10px] text-slate-900 hover:underline" onClick={() => setPriceOverride(l.productId, { initial: null, monthly: null })}>
                              Prix du catalogue
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {billable > 0 ? (
                          <>
                            {l.extraInitial === null ? <Badge tone="amber">À confirmer</Badge> : formatEuro(l.extraInitial)}
                            <div className="text-xs text-slate-500">{l.extraMonthly === null ? 'Mensuel à confirmer' : formatMonthly(l.extraMonthly)}</div>
                          </>
                        ) : l.moved > 0 ? (
                          <>
                            <span className="text-xs text-amber-700">Repris : 0 €</span>
                            <div className="text-xs text-slate-500">{l.extraMonthly === null ? 'Mensuel à confirmer' : formatMonthly(l.extraMonthly)}</div>
                          </>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                        {billable > 0 && l.moved > 0 && <div className="text-[10px] text-amber-700">{l.moved} repris : matériel à 0 €, mensualité conservée</div>}
                      </td>
                    </tr>
                  );
                })}
                {quote.bundles.map((b) => (
                  <tr key={`${b.productId}-${b.coveredProductId}`} className="border-t border-slate-100 bg-emerald-50/40">
                    <td className="px-4 py-2" colSpan={6}>
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
                    <td className="px-4 py-2 text-xs" colSpan={9}>
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
                {quote.movedCount > 0 && (
                  <div className="flex justify-between text-amber-800">
                    <dt>Équipements repris (déménagement) : {quote.movedCount}</dt>
                    <dd className="tabular-nums">matériel 0 € · mensualité conservée</dd>
                  </div>
                )}
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
                {quote.manualAdjustment && (quote.manualAdjustment.initial !== null || quote.manualAdjustment.monthly !== null) && (
                  <div className="flex justify-between text-slate-900" data-testid="manual-adjustment">
                    <dt>Ajustement manuel{quote.manualAdjustment.note ? ` : ${quote.manualAdjustment.note}` : ''}</dt>
                    <dd className="text-right tabular-nums">
                      {quote.manualAdjustment.initial !== null && <div>{signed(quote.manualAdjustment.initial)}</div>}
                      {quote.manualAdjustment.monthly !== null && <div className="text-xs">{signed(quote.manualAdjustment.monthly)}/mois</div>}
                    </dd>
                  </div>
                )}
              </dl>
              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-900">Modifier manuellement les montants du devis</span>
                  {dossier.quoteDraft.totalOverride && (
                    <button className="text-[11px] text-slate-900 hover:underline" onClick={() => setTotalOverride(null)}>
                      Revenir au calcul
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <NumberInput
                    value={dossier.quoteDraft.totalOverride?.initial ?? null}
                    onChange={(v) => setTotalOverride({ initial: v })}
                    allowNull
                    min={0}
                    step={10}
                    suffix="€"
                    placeholder={formatNumber(quote.totals.initialComputed, quote.totals.initialComputed % 1 ? 2 : 0)}
                    aria-label="Frais initiaux du devis"
                  />
                  <NumberInput
                    value={dossier.quoteDraft.totalOverride?.monthly ?? null}
                    onChange={(v) => setTotalOverride({ monthly: v })}
                    allowNull
                    min={0}
                    step={0.5}
                    suffix="€/m"
                    placeholder={formatNumber(quote.totals.monthlyComputed)}
                    aria-label="Mensualité du devis"
                  />
                </div>
                <TextInput
                  className="mt-2 text-xs"
                  placeholder="Motif (ex. geste commercial, arrondi)"
                  value={dossier.quoteDraft.totalOverride?.note ?? ''}
                  onChange={(e) => setTotalOverride({ note: e.target.value })}
                  aria-label="Motif de l'ajustement"
                />
                <p className="mt-1 text-[10px] text-slate-500">
                  Calculé : {formatEuro(quote.totals.initialComputed)} · {formatMonthly(quote.totals.monthlyComputed)}. Laisser vide pour garder le calcul.
                </p>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-slate-100 px-3 py-2">
                  <div className="text-[10px] text-slate-500 uppercase">Frais initiaux</div>
                  <div className="text-xl font-semibold tabular-nums" data-testid="quote-initial">
                    {formatEuro(quote.totals.initial)}
                  </div>
                </div>
                <div className="rounded-lg bg-slate-900 px-3 py-2 text-white">
                  <div className="text-[10px] text-slate-300 uppercase">Mensuel</div>
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
            <Card title="Étape suivante">
              <p className="mb-3 text-xs text-slate-600">Vérifiez la synthèse de la proposition, puis générez le devis PDF.</p>
              <Button variant="primary" className="w-full" icon={<ArrowRight size={15} />} onClick={() => setTab('devis')}>
                Voir la synthèse et le devis
              </Button>
            </Card>
          </div>
        </div>

      </div>
    </div>
  );
}
