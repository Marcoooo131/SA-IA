import { Fragment, useState } from 'react';
import { ChevronDown, ChevronRight, Download, FileSpreadsheet, History, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useApp } from '@/state/store';
import type { BillingType, DiscountTarget, ProductCategory } from '@/domain/types';
import { BILLING_LABELS, CATEGORY_LABELS, DISCOUNT_TARGET_LABELS } from '@/domain/labels';
import { buildTemplateBlob, downloadBlob, exportCatalogBlob, exportCatalogCsv } from '@/catalog/excel';
import { uid } from '@/lib/id';
import { formatDateTime } from '@/lib/format';
import { DEFAULT_RULES_CONFIG } from '@/rules/config';
import { Badge, Button, Card, Field, IconButton, NumberInput, Select, TextInput, Toggle, cx, inputCls } from '../kit';
import { ImportWizard } from './ImportWizard';

type Section = 'produits' | 'packs' | 'tarifs' | 'import' | 'regles' | 'historique';

function Products() {
  const products = useApp((s) => s.catalog.products);
  const updateProduct = useApp((s) => s.updateProduct);
  const addProduct = useApp((s) => s.addProduct);
  const [open, setOpen] = useState<string | null>(null);
  const dupRefs = new Set(products.map((p) => p.reference.trim().toUpperCase()).filter((r, i, a) => a.indexOf(r) !== i));
  return (
    <Card
      title={`Produits (${products.length})`}
      actions={
        <Button
          size="sm"
          variant="primary"
          icon={<Plus size={13} />}
          onClick={() => {
            const id = uid('prd');
            addProduct({
              id,
              reference: `NOUVEAU-${products.length + 1}`,
              name: 'Nouveau produit',
              category: 'autre',
              description: '',
              priceInitial: null,
              monthly: null,
              billing: 'unitaire',
              packQuantity: 1,
              icon: 'autre',
              compatibility: '',
              active: false,
              comments: 'Prix à renseigner avant activation.',
            });
            setOpen(id);
          }}
        >
          Ajouter un produit
        </Button>
      }
      bodyClassName="p-0"
    >
      <table className="w-full text-sm" data-testid="products-table">
        <thead className="bg-slate-50 text-left text-xs text-slate-500">
          <tr>
            <th className="w-6" />
            <th className="px-2 py-2 font-medium">Référence</th>
            <th className="px-2 py-2 font-medium">Nom</th>
            <th className="px-2 py-2 font-medium">Catégorie</th>
            <th className="w-28 px-2 py-2 font-medium">Prix matériel</th>
            <th className="w-28 px-2 py-2 font-medium">Suppl. mensuel</th>
            <th className="px-2 py-2 font-medium">Facturation</th>
            <th className="w-20 px-2 py-2 font-medium">Qté lot</th>
            <th className="px-2 py-2 font-medium">Statut</th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <Fragment key={p.id}>
              <tr className={cx('border-t border-slate-100', !p.active && 'bg-slate-50/70 text-slate-500')} data-testid={`product-row-${p.reference}`}>
                <td className="pl-2">
                  <IconButton label="Détails" className="h-6 w-6" onClick={() => setOpen(open === p.id ? null : p.id)}>
                    {open === p.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </IconButton>
                </td>
                <td className="px-2 py-1.5">
                  <TextInput
                    value={p.reference}
                    onChange={(e) => updateProduct(p.id, { reference: e.target.value })}
                    className={cx('font-mono text-xs', dupRefs.has(p.reference.trim().toUpperCase()) && 'border-red-400')}
                    aria-label="Référence"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <TextInput value={p.name} onChange={(e) => updateProduct(p.id, { name: e.target.value })} aria-label="Nom" className="text-xs" />
                </td>
                <td className="px-2 py-1.5">
                  <Select value={p.category} onChange={(e) => updateProduct(p.id, { category: e.target.value as ProductCategory })} className="text-xs" aria-label="Catégorie">
                    {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </Select>
                </td>
                <td className="px-2 py-1.5">
                  <NumberInput value={p.priceInitial} onChange={(v) => updateProduct(p.id, { priceInitial: v })} allowNull min={0} step={1} suffix="€" aria-label={`Prix matériel ${p.reference}`} placeholder="—" />
                </td>
                <td className="px-2 py-1.5">
                  {p.category === 'centrale' ? (
                    <div className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm text-slate-600" title="Règle métier validée : la centrale n'a pas de supplément mensuel" data-testid="centrale-monthly-locked">
                      0 € <span className="text-[10px] text-slate-400">(règle)</span>
                    </div>
                  ) : (
                    <NumberInput value={p.monthly} onChange={(v) => updateProduct(p.id, { monthly: v })} allowNull min={0} step={0.5} suffix="€" aria-label={`Supplément mensuel ${p.reference}`} placeholder="—" />
                  )}
                </td>
                <td className="px-2 py-1.5">
                  <Select value={p.billing} onChange={(e) => updateProduct(p.id, { billing: e.target.value as BillingType })} className="text-xs" aria-label="Facturation">
                    {Object.entries(BILLING_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </Select>
                </td>
                <td className="px-2 py-1.5">
                  <NumberInput value={p.packQuantity} onChange={(v) => v && updateProduct(p.id, { packQuantity: Math.max(1, Math.round(v)) })} min={1} step={1} aria-label="Quantité lot" />
                </td>
                <td className="px-2 py-1.5">
                  <Toggle checked={p.active} onChange={(v) => updateProduct(p.id, { active: v })} label={p.active ? 'Actif' : 'Inactif'} />
                </td>
              </tr>
              {open === p.id && (
                <tr className="border-t border-slate-100 bg-slate-50/50">
                  <td />
                  <td colSpan={8} className="px-2 py-3">
                    <div className="grid grid-cols-3 gap-3">
                      <Field label="Description">
                        <textarea className={inputCls} rows={2} value={p.description} onChange={(e) => updateProduct(p.id, { description: e.target.value })} />
                      </Field>
                      <Field label="Compatibilité">
                        <textarea className={inputCls} rows={2} value={p.compatibility} onChange={(e) => updateProduct(p.id, { compatibility: e.target.value })} />
                      </Field>
                      <Field label="Commentaires">
                        <textarea className={inputCls} rows={2} value={p.comments} onChange={(e) => updateProduct(p.id, { comments: e.target.value })} />
                      </Field>
                      {p.billing === 'lot' && (
                        <Field label="Lot composé de">
                          <Select value={p.bundleOf ?? ''} onChange={(e) => updateProduct(p.id, { bundleOf: (e.target.value || undefined) as ProductCategory | undefined })}>
                            <option value="">—</option>
                            {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                              <option key={k} value={k}>
                                {v}
                              </option>
                            ))}
                          </Select>
                        </Field>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
      {dupRefs.size > 0 && <p className="px-4 py-2 text-xs text-red-700">Références en doublon : {Array.from(dupRefs).join(', ')}.</p>}
      <p className="px-4 py-2 text-[11px] text-slate-500">
        Références « DEMO-… » fictives. Prix de démonstration communiqués pour le prototype, non officiels. Un prix vide signifie « à confirmer » et n'est jamais remplacé
        par une valeur inventée.
      </p>
    </Card>
  );
}

function Packs() {
  const catalog = useApp((s) => s.catalog);
  const updatePack = useApp((s) => s.updatePack);
  const placeable = catalog.products.filter((p) => p.billing !== 'lot');
  return (
    <div className="grid grid-cols-2 gap-5">
      {catalog.packs.map((pack) => (
        <Card key={pack.id} title={pack.name} actions={<Toggle checked={pack.active} onChange={(v) => updatePack(pack.id, { active: v })} label={pack.active ? 'Actif' : 'Inactif'} />}>
          <div className="mb-3 grid grid-cols-3 gap-3">
            <Field label="Nom">
              <TextInput value={pack.name} onChange={(e) => updatePack(pack.id, { name: e.target.value })} />
            </Field>
            <Field label="Frais matériel (forfait)">
              <NumberInput value={pack.initial} onChange={(v) => v !== null && updatePack(pack.id, { initial: v })} min={0} step={10} suffix="€" aria-label={`Frais matériel ${pack.name}`} />
            </Field>
            <Field label="Mensualité (forfait)">
              <NumberInput value={pack.monthly} onChange={(v) => v !== null && updatePack(pack.id, { monthly: v })} min={0} step={0.5} suffix="€" aria-label={`Mensualité ${pack.name}`} />
            </Field>
          </div>
          <h4 className="mb-1 text-xs font-semibold text-slate-500 uppercase">Composition</h4>
          <ul className="space-y-1">
            {placeable.map((p) => {
              const item = pack.items.find((i) => i.productId === p.id);
              return (
                <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className={cx(!item?.quantity && 'text-slate-400')}>{p.name}</span>
                  <NumberInput
                    value={item?.quantity ?? 0}
                    min={0}
                    max={50}
                    step={1}
                    className="w-20"
                    aria-label={`Quantité ${p.name} dans ${pack.name}`}
                    onChange={(v) => {
                      const q = Math.max(0, Math.round(v ?? 0));
                      const others = pack.items.filter((i) => i.productId !== p.id);
                      updatePack(pack.id, { items: q ? [...others, { productId: p.id, quantity: q }] : others });
                    }}
                  />
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-[11px] text-slate-500">Le prix du pack est un forfait : il n'est pas recalculé à partir des prix unitaires de sa composition.</p>
        </Card>
      ))}
    </div>
  );
}

function Pricing() {
  const catalog = useApp((s) => s.catalog);
  const updateSettings = useApp((s) => s.updateSettings);
  const updateDiscount = useApp((s) => s.updateDiscount);
  const addDiscount = useApp((s) => s.addDiscount);
  const removeDiscount = useApp((s) => s.removeDiscount);
  const s = catalog.settings;
  return (
    <div className="grid grid-cols-2 gap-5">
      <Card title="Paramètres de tarification">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Base des prix communiqués" hint="Laisser « inconnue » tant que non confirmé.">
            <Select value={s.priceBasis} onChange={(e) => updateSettings({ priceBasis: e.target.value as typeof s.priceBasis })}>
              <option value="inconnue">Inconnue</option>
              <option value="HT">HT</option>
              <option value="TTC">TTC</option>
            </Select>
          </Field>
          <Field label="Taux de TVA" hint="Vide = non renseigné (aucune TVA n'est inventée).">
            <NumberInput value={s.vatRate} onChange={(v) => updateSettings({ vatRate: v })} allowNull min={0} max={100} step={0.5} suffix="%" />
          </Field>
          <Field label="Frais d'installation" hint="Vide = à confirmer.">
            <NumberInput value={s.installationFee} onChange={(v) => updateSettings({ installationFee: v })} allowNull min={0} step={10} suffix="€" />
          </Field>
          <Field label="Validité du devis">
            <NumberInput value={s.validityDays} onChange={(v) => v && updateSettings({ validityDays: Math.round(v) })} min={1} step={1} suffix="jours" />
          </Field>
          <div className="col-span-2">
            <Toggle checked={s.autoBundle} onChange={(v) => updateSettings({ autoBundle: v })} label="Regrouper automatiquement en lot (ex. pack périmétrique) quand c'est moins cher" />
          </div>
          <Field label="Conditions commerciales (affichées sur le devis)" className="col-span-2">
            <textarea className={inputCls} rows={4} value={s.conditions} onChange={(e) => updateSettings({ conditions: e.target.value })} />
          </Field>
        </div>
      </Card>
      <Card
        title="Remises configurées"
        actions={
          <Button size="sm" icon={<Plus size={13} />} onClick={addDiscount}>
            Ajouter
          </Button>
        }
      >
        {catalog.discounts.length === 0 && <p className="text-sm text-slate-500">Aucune remise.</p>}
        {catalog.discounts.map((d) => (
          <div key={d.id} className="mb-3 rounded-md border border-slate-200 p-3">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Libellé" className="col-span-2">
                <TextInput value={d.label} onChange={(e) => updateDiscount(d.id, { label: e.target.value })} />
              </Field>
              <Field label="S'applique à">
                <Select value={d.target} onChange={(e) => updateDiscount(d.id, { target: e.target.value as DiscountTarget })}>
                  {Object.entries(DISCOUNT_TARGET_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Valeur">
                <div className="flex gap-1">
                  <NumberInput value={d.value} onChange={(v) => v !== null && updateDiscount(d.id, { value: v })} min={0} step={1} className="flex-1" />
                  <Select value={d.kind} onChange={(e) => updateDiscount(d.id, { kind: e.target.value as 'pourcentage' | 'montant' })} className="w-20">
                    <option value="pourcentage">%</option>
                    <option value="montant">€</option>
                  </Select>
                </div>
              </Field>
              <Field label="Note" className="col-span-2">
                <TextInput value={d.note} onChange={(e) => updateDiscount(d.id, { note: e.target.value })} />
              </Field>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <Toggle checked={d.active} onChange={(v) => updateDiscount(d.id, { active: v })} label="Disponible dans les devis" />
              <IconButton label="Supprimer la remise" onClick={() => removeDiscount(d.id)}>
                <Trash2 size={14} />
              </IconButton>
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}

function Rules() {
  const rules = useApp((s) => s.rules);
  const update = useApp((s) => s.updateRules);
  const num = (label: string, value: number, set: (v: number) => void, suffix?: string, step = 1) => (
    <Field label={label}>
      <NumberInput value={value} onChange={(v) => v !== null && v >= 0 && set(v)} min={0} step={step} suffix={suffix} />
    </Field>
  );
  return (
    <Card
      title="Règles d'audit (hypothèses de configuration)"
      actions={
        <Button size="sm" icon={<RotateCcw size={13} />} onClick={() => update(DEFAULT_RULES_CONFIG)}>
          Valeurs communiquées
        </Button>
      }
    >
      <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
        Ces paramètres proviennent des données de travail communiquées pour le projet. Ils restent des hypothèses tant qu'ils n'ont pas été validés par le
        responsable métier. Ils ne déterminent pas une couverture réelle : obstacles, murs, orientation et spécifications fabricant doivent être vérifiés.
      </p>
      <div className="grid grid-cols-4 gap-4">
        {num('Centrales par logement', rules.centralPerDwelling, (v) => update({ ...rules, centralPerDwelling: Math.round(v) }))}
        {num('Claviers proposés', rules.keypad.default, (v) => update({ ...rules, keypad: { ...rules.keypad, default: Math.round(v) } }))}
        {num('Claviers maximum', rules.keypad.max, (v) => update({ ...rules, keypad: { ...rules.keypad, max: Math.round(v) } }))}
        {num('Mouvement : minimum par étage', rules.motion.minPerLevel, (v) => update({ ...rules, motion: { ...rules.motion, minPerLevel: Math.round(v) } }))}
        {num('Mouvement : angle de référence', rules.motion.angleDeg, (v) => update({ ...rules, motion: { ...rules.motion, angleDeg: v } }), '°')}
        {num('Mouvement : portée de référence', rules.motion.rangeM, (v) => update({ ...rules, motion: { ...rules.motion, rangeM: v } }), 'm', 0.5)}
        {num('Couloir à protéger dès', rules.motion.corridorMinLength, (v) => update({ ...rules, motion: { ...rules.motion, corridorMinLength: v } }), 'm', 0.5)}
        {num('Fumée : couverture indicative', rules.smoke.coverageM2, (v) => v > 0 && update({ ...rules, smoke: { ...rules.smoke, coverageM2: v } }), 'm²', 5)}
        {num('Choc : par menuiserie', rules.shock.perOpening, (v) => update({ ...rules, shock: { ...rules.shock, perOpening: Math.round(v) } }))}
        {num('Choc : par baie vitrée', rules.shock.perBay, (v) => update({ ...rules, shock: { ...rules.shock, perBay: Math.round(v) } }))}
        <Field label="Volumétrique : ouvertures équipées">
          <Select value={rules.shock.volumetricScope} onChange={(e) => update({ ...rules, shock: { ...rules.shock, volumetricScope: e.target.value as typeof rules.shock.volumetricScope } })}>
            <option value="acces">Accès (portes) uniquement</option>
            <option value="toutes">Toutes les ouvertures extérieures</option>
            <option value="aucune">Aucune</option>
          </Select>
        </Field>
        <div className="flex flex-col justify-end gap-2">
          <Toggle checked={rules.shock.skipSectional} onChange={(v) => update({ ...rules, shock: { ...rules.shock, skipSectional: v } })} label="Exclure les portes sectionnelles" />
          <Toggle checked={rules.motion.studyGarage} onChange={(v) => update({ ...rules, motion: { ...rules.motion, studyGarage: v } })} label="Proposer un détecteur garage" />
          <Toggle checked={rules.smoke.includeGarage} onChange={(v) => update({ ...rules, smoke: { ...rules.smoke, includeGarage: v } })} label="Garage inclus dans la surface fumée" />
        </div>
      </div>
    </Card>
  );
}

function HistoryPanel() {
  const history = useApp((s) => s.catalogHistory);
  const restore = useApp((s) => s.restoreCatalog);
  const toast = useApp((s) => s.toast);
  const version = useApp((s) => s.catalog.version);
  return (
    <Card title={`Versions précédentes du catalogue (version actuelle : v${version})`}>
      {history.length === 0 ? (
        <p className="text-sm text-slate-500">Aucune version archivée. Chaque import validé archive la version précédente.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {history.map((h, i) => (
            <li key={h.savedAt + i} className="flex items-center justify-between py-2 text-sm">
              <div>
                <div className="font-medium">
                  v{h.catalog.version} · {h.catalog.products.length} produits
                </div>
                <div className="text-xs text-slate-500">
                  Archivée le {formatDateTime(h.savedAt)} – {h.reason}
                </div>
              </div>
              <Button
                size="sm"
                icon={<History size={13} />}
                onClick={() => {
                  restore(i);
                  toast('success', 'Version restaurée (la version courante a été archivée).');
                }}
              >
                Restaurer
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function CatalogAdmin() {
  const [section, setSection] = useState<Section>('produits');
  const catalog = useApp((s) => s.catalog);
  const toast = useApp((s) => s.toast);
  const sections: { key: Section; label: string }[] = [
    { key: 'produits', label: 'Produits' },
    { key: 'packs', label: 'Offres (packs)' },
    { key: 'tarifs', label: 'Remises & paramètres' },
    { key: 'import', label: 'Import / export Excel' },
    { key: 'regles', label: "Règles d'audit" },
    { key: 'historique', label: 'Historique' },
  ];
  return (
    <div className="scroll-thin h-full overflow-auto">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 p-6">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Catalogue, tarifs et règles</h1>
            <p className="text-sm text-slate-500">
              Version v{catalog.version} · modifiée le {formatDateTime(catalog.updatedAt)} · <Badge tone="amber">Tarifs de démonstration, non officiels</Badge>
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              icon={<FileSpreadsheet size={14} />}
              onClick={async () => {
                try {
                  downloadBlob(await buildTemplateBlob(), 'modele-catalogue.xlsx');
                } catch (e) {
                  toast('error', (e as Error).message);
                }
              }}
            >
              Modèle Excel
            </Button>
            <Button
              icon={<Download size={14} />}
              onClick={async () => {
                try {
                  downloadBlob(await exportCatalogBlob(catalog), `catalogue-v${catalog.version}.xlsx`);
                } catch (e) {
                  toast('error', (e as Error).message);
                }
              }}
            >
              Exporter (.xlsx)
            </Button>
            <Button icon={<Download size={14} />} onClick={() => downloadBlob(exportCatalogCsv(catalog), `catalogue-v${catalog.version}.csv`)}>
              Exporter (.csv)
            </Button>
          </div>
        </div>
        <nav className="flex gap-1 border-b border-slate-200">
          {sections.map((s) => (
            <button
              key={s.key}
              onClick={() => setSection(s.key)}
              className={cx(
                '-mb-px border-b-2 px-3 py-2 text-sm font-medium',
                section === s.key ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800',
              )}
            >
              {s.label}
            </button>
          ))}
        </nav>
        {section === 'produits' && <Products />}
        {section === 'packs' && <Packs />}
        {section === 'tarifs' && <Pricing />}
        {section === 'import' && <ImportWizard />}
        {section === 'regles' && <Rules />}
        {section === 'historique' && <HistoryPanel />}
      </div>
    </div>
  );
}
