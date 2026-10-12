import { Check, Crosshair, Trash2 } from 'lucide-react';
import { useApp, useActiveDossier } from '@/state/store';
import { useQuote } from '@/state/derived';
import { CATEGORY_LABELS } from '@/domain/labels';
import { formatEuro, formatMonthly } from '@/lib/format';
import { Badge, Button, EmptyState, IconButton, NumberInput, cx } from '../kit';
import { CategoryDot } from './LeftPanels';
import { categoryOrder } from '@/quote/calculator';

export function EquipmentTab() {
  const dossier = useActiveDossier();
  const quote = useQuote(dossier);
  const products = useApp((s) => s.catalog.products);
  const mutate = useApp((s) => s.mutate);
  const select = useApp((s) => s.select);
  const selection = useApp((s) => s.selection);
  const setTab = useApp((s) => s.setTab);
  const setLevel = useApp((s) => s.setActiveLevel);
  if (!dossier || !quote) return null;
  const levels = [...dossier.plan.levels].sort((a, b) => a.index - b.index);
  const upd = (id: string, patch: Record<string, unknown>) =>
    mutate((d) => {
      const x = d.devices.find((y) => y.id === id);
      if (x) Object.assign(x, patch);
    });

  return (
    <div className="scroll-thin h-full overflow-auto p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Équipements positionnés</h2>
          <p className="text-xs text-slate-500">Toute modification est répercutée instantanément sur le plan 2D, la vue 3D et le devis.</p>
        </div>
        <div className="flex gap-2 text-sm">
          <span className="rounded-md bg-slate-100 px-3 py-1.5">
            <strong>{quote.equipmentCount}</strong> équipement(s)
          </span>
          <span className="rounded-md bg-slate-100 px-3 py-1.5">
            <strong>{formatEuro(quote.totals.initial)}</strong> · <strong>{formatMonthly(quote.totals.monthly)}</strong>
          </span>
        </div>
      </div>
      {dossier.devices.length === 0 ? (
        <EmptyState title="Aucun équipement positionné">
          Appliquez une proposition depuis l'onglet Audit ou placez des équipements depuis la bibliothèque.
          <div className="mt-3">
            <Button variant="primary" onClick={() => setTab('audit')}>
              Aller à l'audit
            </Button>
          </div>
        </EmptyState>
      ) : (
        levels.map((level) => {
          const devs = dossier.devices
            .filter((d) => d.levelId === level.id)
            .sort((a, b) => {
              const pa = products.find((p) => p.id === a.productId);
              const pb = products.find((p) => p.id === b.productId);
              return categoryOrder(pa?.category ?? 'autre') - categoryOrder(pb?.category ?? 'autre');
            });
          if (!devs.length) return null;
          return (
            <div key={level.id} className="mb-5 overflow-hidden rounded-lg border border-slate-200 bg-white">
              <div className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">{level.name}</div>
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-slate-500">
                  <tr>
                    <th className="px-4 py-1.5 font-medium">Équipement</th>
                    <th className="px-2 py-1.5 font-medium">Emplacement</th>
                    <th className="px-2 py-1.5 font-medium">Origine</th>
                    <th className="w-24 px-2 py-1.5 font-medium">Quantité</th>
                    <th className="w-24 px-2 py-1.5 font-medium">Orientation</th>
                    <th className="px-2 py-1.5 text-right font-medium">Prix unitaire</th>
                    <th className="px-4 py-1.5 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {devs.map((d) => {
                    const p = products.find((x) => x.id === d.productId);
                    const room = level.rooms.find((r) => r.id === d.roomId);
                    const opening = level.openings.find((o) => o.id === d.openingId);
                    const sel = selection?.kind === 'device' && selection.id === d.id;
                    return (
                      <tr key={d.id} className={cx('border-t border-slate-100', sel && 'bg-blue-50/60')} data-testid={`equipment-row-${d.id}`}>
                        <td className="px-4 py-1.5">
                          <div className="flex items-center gap-2">
                            {p && <CategoryDot category={p.category} suggested={d.origin === 'suggere' && !d.validated} />}
                            <div>
                              <div className="font-medium text-slate-800">{p?.name ?? 'Produit introuvable'}</div>
                              <div className="text-[11px] text-slate-500">
                                {p?.reference} · {p ? CATEGORY_LABELS[p.category] : ''}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-2 py-1.5 text-xs text-slate-600">
                          {room?.name ?? '—'}
                          {opening ? ` · ${opening.code}` : ''}
                        </td>
                        <td className="px-2 py-1.5">
                          {d.origin === 'manuel' ? <Badge tone="blue">Manuel</Badge> : d.validated ? <Badge tone="green">Suggéré · validé</Badge> : <Badge tone="amber">Suggéré</Badge>}
                        </td>
                        <td className="px-2 py-1.5">
                          <NumberInput value={d.quantity} onChange={(v) => v && upd(d.id, { quantity: Math.max(1, Math.round(v)) })} min={1} max={50} step={1} aria-label="Quantité" />
                        </td>
                        <td className="px-2 py-1.5">
                          <NumberInput value={d.rotation} onChange={(v) => v !== null && upd(d.id, { rotation: ((v % 360) + 360) % 360 })} step={15} suffix="°" aria-label="Orientation" />
                        </td>
                        <td className="px-2 py-1.5 text-right text-xs tabular-nums text-slate-600">
                          {p?.priceInitial === null ? 'Forfait / à confirmer' : `${formatEuro(p?.priceInitial)} · ${formatMonthly(p?.monthly)}`}
                        </td>
                        <td className="px-4 py-1.5">
                          <div className="flex justify-end gap-1">
                            {d.origin === 'suggere' && !d.validated && (
                              <IconButton label="Valider la suggestion" onClick={() => upd(d.id, { validated: true })}>
                                <Check size={15} />
                              </IconButton>
                            )}
                            <IconButton
                              label="Voir sur le plan"
                              onClick={() => {
                                setLevel(level.id);
                                select({ kind: 'device', id: d.id });
                                setTab('plan');
                              }}
                            >
                              <Crosshair size={15} />
                            </IconButton>
                            <IconButton label="Supprimer" onClick={() => mutate((dr) => void (dr.devices = dr.devices.filter((x) => x.id !== d.id)))}>
                              <Trash2 size={15} />
                            </IconButton>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })
      )}
      {quote.lines.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-800">Total des équipements sélectionnés</h3>
          <div className="grid grid-cols-3 gap-2 text-sm">
            {quote.lines.map((l) => (
              <div key={l.productId} className="flex items-center justify-between rounded bg-slate-50 px-2 py-1">
                <span className="flex items-center gap-2">
                  <CategoryDot category={l.category} />
                  {l.name}
                </span>
                <strong className="tabular-nums">{l.requested}</strong>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
