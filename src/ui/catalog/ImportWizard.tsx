import { useMemo, useRef, useState } from 'react';
import { FileSpreadsheet, Upload, X } from 'lucide-react';
import { useApp } from '@/state/store';
import { readSpreadsheet, type SheetData } from '@/catalog/excel';
import { IMPORT_COLUMNS, applyImport, autoMapColumns, buildImportPreview, type ColumnKey, type ColumnMapping, type RowAction } from '@/catalog/importer';
import { CATEGORY_LABELS } from '@/domain/labels';
import { formatEuro } from '@/lib/format';
import { Badge, Button, Card, Select, Toggle } from '../kit';

const ACTION_BADGE: Record<RowAction, { tone: 'green' | 'blue' | 'slate' | 'red'; label: string }> = {
  creer: { tone: 'green', label: 'Nouveau' },
  mettre_a_jour: { tone: 'blue', label: 'Mise à jour' },
  identique: { tone: 'slate', label: 'Identique' },
  erreur: { tone: 'red', label: 'Erreur' },
};

const fmtValue = (v: unknown) => (v === null || v === undefined ? '—' : typeof v === 'number' ? String(v).replace('.', ',') : typeof v === 'boolean' ? (v ? 'Actif' : 'Inactif') : String(v));

export function ImportWizard() {
  const catalog = useApp((s) => s.catalog);
  const replaceCatalog = useApp((s) => s.replaceCatalog);
  const toast = useApp((s) => s.toast);
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [sheets, setSheets] = useState<SheetData[] | null>(null);
  const [sheetIdx, setSheetIdx] = useState(0);
  const [headerRow, setHeaderRow] = useState(0);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [updateExisting, setUpdateExisting] = useState(false);
  const [confirmCentrale, setConfirmCentrale] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rows = sheets?.[sheetIdx]?.rows ?? [];
  const headers = (rows[headerRow] ?? []) as unknown[];
  const preview = useMemo(() => (mapping && rows.length ? buildImportPreview(rows, mapping, catalog.products, headerRow) : null), [mapping, rows, catalog.products, headerRow]);

  const reset = () => {
    setSheets(null);
    setMapping(null);
    setFileName(null);
    setError(null);
    setConfirmCentrale(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const onFile = async (file?: File) => {
    if (!file) return;
    setError(null);
    try {
      const data = await readSpreadsheet(file);
      setSheets(data);
      setFileName(file.name);
      setSheetIdx(0);
      const firstRow = data[0].rows.findIndex((r) => r && r.some((c) => String(c ?? '').trim() !== ''));
      const hr = Math.max(0, firstRow);
      setHeaderRow(hr);
      setMapping(autoMapColumns(data[0].rows[hr] ?? []));
    } catch (e) {
      setError((e as Error).message);
      setSheets(null);
    }
  };

  const confirm = () => {
    if (!preview) return;
    try {
      const res = applyImport(catalog, preview, { updateExisting, confirmCentraleRule: confirmCentrale });
      replaceCatalog(res.catalog, `Import ${fileName ?? ''} : ${res.created} créé(s), ${res.updated} mis à jour`);
      toast('success', `Import validé : ${res.created} produit(s) créé(s), ${res.updated} mis à jour. Version précédente conservée dans l'historique.`);
      reset();
    } catch (e) {
      toast('error', (e as Error).message);
    }
  };

  const importable = preview ? preview.summary.creer + (updateExisting ? preview.summary.mettre_a_jour : 0) : 0;

  return (
    <Card title="Import d'un catalogue (Excel .xlsx ou CSV)" actions={fileName && <Badge tone="blue">{fileName}</Badge>}>
      {!sheets ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border-2 border-dashed border-slate-300 py-8 text-center">
          <FileSpreadsheet size={32} className="text-slate-400" />
          <p className="text-sm text-slate-600">Sélectionnez un fichier .xlsx ou .csv. Un aperçu sera présenté avant toute modification du catalogue.</p>
          <input ref={fileRef} type="file" accept=".xlsx,.csv,text/csv" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} data-testid="catalog-import-input" />
          <Button variant="primary" icon={<Upload size={15} />} onClick={() => fileRef.current?.click()}>
            Choisir un fichier
          </Button>
          {error && (
            <p className="rounded bg-red-50 px-3 py-1.5 text-sm text-red-700" role="alert">
              {error}
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-3">
            {sheets.length > 1 && (
              <label className="text-xs text-slate-600">
                Feuille
                <Select
                  value={sheetIdx}
                  onChange={(e) => {
                    const i = Number(e.target.value);
                    setSheetIdx(i);
                    setHeaderRow(0);
                    setMapping(autoMapColumns(sheets[i].rows[0] ?? []));
                  }}
                  className="mt-1 w-48"
                >
                  {sheets.map((s, i) => (
                    <option key={s.name} value={i}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </label>
            )}
            <label className="text-xs text-slate-600">
              Ligne d'en-tête
              <Select
                value={headerRow}
                onChange={(e) => {
                  const h = Number(e.target.value);
                  setHeaderRow(h);
                  setMapping(autoMapColumns(rows[h] ?? []));
                }}
                className="mt-1 w-32"
              >
                {rows.slice(0, 10).map((_, i) => (
                  <option key={i} value={i}>
                    Ligne {i + 1}
                  </option>
                ))}
              </Select>
            </label>
            <Button className="ml-auto" icon={<X size={14} />} onClick={reset}>
              Annuler l'import
            </Button>
          </div>

          <div>
            <h4 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Correspondance des colonnes</h4>
            <div className="grid grid-cols-5 gap-2">
              {IMPORT_COLUMNS.map((c) => (
                <label key={c.key} className="text-xs text-slate-600">
                  {c.label}
                  {c.required && <span className="text-red-600"> *</span>}
                  <Select
                    value={mapping?.[c.key] ?? ''}
                    onChange={(e) => setMapping((m) => ({ ...(m as ColumnMapping), [c.key]: e.target.value === '' ? null : Number(e.target.value) }) as Record<ColumnKey, number | null>)}
                    className="mt-1 text-xs"
                    aria-label={`Colonne pour ${c.label}`}
                  >
                    <option value="">— non importée —</option>
                    {headers.map((h, i) => (
                      <option key={i} value={i}>
                        {String(h ?? '') || `Colonne ${i + 1}`}
                      </option>
                    ))}
                  </Select>
                </label>
              ))}
            </div>
            {preview && preview.missingRequiredColumns.length > 0 && (
              <p className="mt-2 rounded bg-red-50 px-3 py-1.5 text-sm text-red-700" role="alert">
                Colonnes obligatoires non associées : {preview.missingRequiredColumns.map((c) => c.label).join(', ')}.
              </p>
            )}
          </div>

          {preview && (
            <>
              <div className="flex flex-wrap items-center gap-2 text-sm" data-testid="import-summary">
                <Badge tone="green">{preview.summary.creer} nouveau(x)</Badge>
                <Badge tone="blue">{preview.summary.mettre_a_jour} mise(s) à jour</Badge>
                <Badge>{preview.summary.identique} identique(s)</Badge>
                <Badge tone="red">{preview.summary.erreur} erreur(s)</Badge>
                <Badge tone="amber">{preview.summary.warnings} avec avertissement</Badge>
              </div>
              <div className="max-h-[420px] overflow-auto rounded-md border border-slate-200 scroll-thin">
                <table className="w-full text-xs" data-testid="import-preview">
                  <thead className="sticky top-0 bg-slate-50 text-left text-slate-500">
                    <tr>
                      <th className="px-2 py-1.5">Ligne</th>
                      <th className="px-2 py-1.5">Action</th>
                      <th className="px-2 py-1.5">Référence</th>
                      <th className="px-2 py-1.5">Nom</th>
                      <th className="px-2 py-1.5">Catégorie</th>
                      <th className="px-2 py-1.5 text-right">Prix</th>
                      <th className="px-2 py-1.5 text-right">Mensuel</th>
                      <th className="px-2 py-1.5">Contrôles</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((r) => (
                      <tr key={r.rowNumber} className="border-t border-slate-100 align-top">
                        <td className="px-2 py-1.5 text-slate-400">{r.rowNumber}</td>
                        <td className="px-2 py-1.5">
                          <Badge tone={ACTION_BADGE[r.action].tone}>{ACTION_BADGE[r.action].label}</Badge>
                        </td>
                        <td className="px-2 py-1.5 font-mono">{r.reference || '—'}</td>
                        <td className="px-2 py-1.5">{r.name || '—'}</td>
                        <td className="px-2 py-1.5">{r.product ? CATEGORY_LABELS[r.product.category] : '—'}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{r.product ? formatEuro(r.product.priceInitial) : '—'}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{r.product ? formatEuro(r.product.monthly) : '—'}</td>
                        <td className="px-2 py-1.5">
                          {r.errors.map((e) => (
                            <div key={e} className="text-red-700">
                              ✕ {e}
                            </div>
                          ))}
                          {r.warnings.map((w) => (
                            <div key={w} className="text-amber-700">
                              ! {w}
                            </div>
                          ))}
                          {r.changes.map((c) => (
                            <div key={c.field} className="text-blue-700">
                              {c.field} : {fmtValue(c.before)} → {fmtValue(c.after)}
                            </div>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.rows.some((r) => r.centraleMonthlyConflict !== undefined) && (
                <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-900" role="alert" data-testid="centrale-alert">
                  <p className="font-semibold">Mensualité de la centrale différente de 0 € dans le fichier</p>
                  <p className="text-xs">
                    Le fichier indique {preview.rows.filter((r) => r.centraleMonthlyConflict !== undefined).map((r) => `${String(r.centraleMonthlyConflict).replace('.', ',')} €/mois (ligne ${r.rowNumber})`).join(', ')}.
                    La règle métier validée s'applique : la centrale reste à <strong>0 €/mois</strong>. Son prix matériel est importé normalement.
                  </p>
                  <label className="mt-1.5 flex items-center gap-2 text-xs font-medium">
                    <input type="checkbox" checked={confirmCentrale} onChange={(e) => setConfirmCentrale(e.target.checked)} className="h-4 w-4" />
                    Je confirme : la mensualité de la centrale reste à 0 €.
                  </label>
                </div>
              )}
              <div className="flex items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-2.5">
                <div className="flex flex-col gap-1">
                  <Toggle checked={updateExisting} onChange={setUpdateExisting} label={`Mettre à jour les ${preview.summary.mettre_a_jour} produit(s) existant(s) modifié(s)`} />
                  <p className="text-[11px] text-slate-500">
                    Sinon, les produits existants sont conservés tels quels. Les produits absents du fichier ne sont jamais supprimés. Les lignes en erreur sont ignorées.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button onClick={reset}>Annuler</Button>
                  <Button variant="primary" disabled={!importable || preview.missingRequiredColumns.length > 0 || (preview.rows.some((r) => r.centraleMonthlyConflict !== undefined) && !confirmCentrale)} onClick={confirm}>
                    Valider l'import ({importable} ligne{importable > 1 ? 's' : ''})
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
