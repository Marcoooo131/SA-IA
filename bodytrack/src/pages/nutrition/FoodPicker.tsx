import { useEffect, useMemo, useRef, useState } from 'react';
import { Barcode, Camera, Globe, Loader2, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import type { Food, FoodUnit } from '../../lib/types';
import { Badge, Button, Field, NumberInput, Notice, Segmented, Sheet, cx } from '../../components/ui';
import { normalize } from '../../components/ExercisePicker';
import { useCtx } from '../../lib/useCtx';
import { macroKcalMismatch, nutrientsFor, roundNutrients } from '../../lib/calc/nutrition';
import { recentFoodIds } from '../../lib/actions';
import { lookupBarcode, searchProducts, type OffResult } from '../../lib/openfoodfacts';
import { store } from '../../lib/store/store';
import { fmt, fmtSmart, nowISO, uid } from '../../lib/format';
import { toast } from '../../components/toast';
import { confirmDialog } from '../../components/confirm';

type Tab = 'local' | 'off' | 'create';

/** Recherche d'aliment → choix de la quantité → ajout */
export function FoodPicker({ open, onClose, onAdd, title }: { open: boolean; onClose: () => void; onAdd: (food: Food, quantity: number) => void; title: string }) {
  const [tab, setTab] = useState<Tab>('local');
  const [selected, setSelected] = useState<Food | null>(null);
  const [editFood, setEditFood] = useState<Food | null>(null);
  const [prefill, setPrefill] = useState<Partial<Food> | null>(null);
  useEffect(() => {
    if (!open) {
      setSelected(null);
      setTab('local');
    }
  }, [open]);
  return (
    <Sheet open={open} onClose={onClose} title={selected ? 'Quantité' : title} wide>
      {selected ? (
        <QuantityStep food={selected} onBack={() => setSelected(null)} onConfirm={(q) => onAdd(selected, q)} />
      ) : (
        <>
          <Segmented
            className="w-full mb-4"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'local', label: 'Mes aliments' },
              { value: 'off', label: 'Open Food Facts' },
              { value: 'create', label: 'Créer' },
            ]}
          />
          {tab === 'local' && <LocalSearch onPick={setSelected} onEdit={(f) => { setEditFood(f); setTab('create'); }} />}
          {tab === 'off' && (
            <OffSearch
              onPick={(r) => {
                if (r.complete) setSelected(r.food);
                else {
                  setPrefill(r.food);
                  setTab('create');
                  toast('Valeurs incomplètes', `Complète : ${r.missing.join(', ')} (voir l'étiquette).`, 'info', 5000);
                }
              }}
            />
          )}
          {tab === 'create' && (
            <FoodForm
              initial={editFood ?? prefill ?? undefined}
              onSaved={(f) => {
                setEditFood(null);
                setPrefill(null);
                setSelected(f);
              }}
            />
          )}
        </>
      )}
    </Sheet>
  );
}

function LocalSearch({ onPick, onEdit }: { onPick: (f: Food) => void; onEdit: (f: Food) => void }) {
  const ctx = useCtx();
  const [q, setQ] = useState('');
  const recent = useMemo(() => recentFoodIds(10).map((id) => ctx.foodById.get(id)).filter((f): f is Food => !!f), [ctx]);
  const list = useMemo(() => {
    const nq = normalize(q.trim());
    if (!nq) return null;
    return ctx.foods.filter((f) => normalize(`${f.name} ${f.brand} ${f.category}`).includes(nq)).slice(0, 60);
  }, [ctx, q]);
  return (
    <div>
      <div className="relative mb-3">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
        <input className="field pl-9" placeholder="Riz, poulet, skyr…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      </div>
      {!list && recent.length > 0 && <div className="label">Récents</div>}
      <FoodList foods={list ?? (recent.length ? recent : ctx.foods.slice(0, 30))} onPick={onPick} onEdit={onEdit} />
      {list && !list.length && <p className="text-sm text-muted text-center py-6">Aucun aliment. Cherche sur Open Food Facts ou crée-le.</p>}
      {!list && !recent.length && <p className="text-[11px] text-faint mt-3">Valeurs moyennes de référence (tables Ciqual – Anses et USDA). Vérifie les étiquettes des produits précis.</p>}
    </div>
  );
}

function FoodList({ foods, onPick, onEdit }: { foods: Food[]; onPick: (f: Food) => void; onEdit?: (f: Food) => void }) {
  return (
    <ul className="divide-y divide-line">
      {foods.map((f) => (
        <li key={f.id} className="flex items-center gap-2">
          <button type="button" onClick={() => onPick(f)} className="flex-1 min-w-0 text-left py-2.5 flex items-center gap-3">
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium truncate">
                {f.name}
                {f.brand && <span className="text-muted font-normal"> · {f.brand}</span>}
              </span>
              <span className="block text-xs text-muted tnum">
                {fmt(f.kcal100)} kcal · P {fmtSmart(f.protein100)} · G {fmtSmart(f.carbs100)} · L {fmtSmart(f.fat100)} <span className="text-faint">/ 100 {f.unit}</span>
              </span>
            </span>
            {f.source === 'custom' && <Badge tone="info">Perso</Badge>}
            {f.source === 'openfoodfacts' && <Badge>OFF</Badge>}
            <Plus size={16} className="text-accent shrink-0" />
          </button>
          {onEdit && f.source !== 'builtin' && (
            <button type="button" onClick={() => onEdit(f)} className="p-2 text-faint hover:text-ink" aria-label={`Modifier ${f.name}`}>
              <Pencil size={14} />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

function OffSearch({ onPick }: { onPick: (r: OffResult) => void }) {
  const [q, setQ] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<OffResult[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const online = typeof navigator === 'undefined' || navigator.onLine;
  const canScan = typeof window !== 'undefined' && 'BarcodeDetector' in window && !!navigator.mediaDevices?.getUserMedia;

  const run = async (fn: () => Promise<OffResult[] | OffResult | null>) => {
    setLoading(true);
    setError(null);
    try {
      const r = await fn();
      if (Array.isArray(r)) setResults(r);
      else if (r) onPick(r);
      else setError('Produit introuvable dans Open Food Facts. Tu peux le créer manuellement.');
    } catch (e) {
      setError(navigator.onLine ? `Recherche impossible : ${(e as Error).message}` : 'Hors connexion : la recherche Open Food Facts nécessite internet. Utilise tes aliments ou crée-le.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {!online && <Notice tone="warn">Tu es hors connexion. La base Open Food Facts n'est pas accessible ; tes aliments enregistrés restent disponibles.</Notice>}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim().length >= 2) void run(() => searchProducts(q.trim()));
        }}
      >
        <input className="field" placeholder="Nom du produit ou marque" value={q} onChange={(e) => setQ(e.target.value)} />
        <Button type="submit" variant="primary" icon={<Globe size={16} />} disabled={q.trim().length < 2 || loading}>
          Chercher
        </Button>
      </form>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (code.trim()) void run(() => lookupBarcode(code));
        }}
      >
        <input className="field tnum" inputMode="numeric" placeholder="Code-barres (EAN)" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
        <Button type="submit" icon={<Barcode size={16} />} disabled={code.length < 6 || loading}>
          Trouver
        </Button>
        {canScan && (
          <Button type="button" icon={<Camera size={16} />} onClick={() => setScanning(true)} aria-label="Scanner un code-barres" />
        )}
      </form>
      {scanning && (
        <Scanner
          onClose={() => setScanning(false)}
          onCode={(c) => {
            setScanning(false);
            setCode(c);
            void run(() => lookupBarcode(c));
          }}
        />
      )}
      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted">
          <Loader2 size={16} className="animate-spin" /> Recherche en cours…
        </div>
      )}
      {error && <Notice tone="warn">{error}</Notice>}
      {results && (
        <ul className="divide-y divide-line">
          {results.map((r) => (
            <li key={r.food.id}>
              <button type="button" onClick={() => onPick(r)} className="w-full text-left py-2.5 flex items-center gap-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium truncate">
                    {r.food.name}
                    {r.food.brand && <span className="text-muted font-normal"> · {r.food.brand}</span>}
                  </span>
                  <span className="block text-xs text-muted tnum">{r.complete ? `${fmt(r.food.kcal100)} kcal · P ${fmtSmart(r.food.protein100)} · G ${fmtSmart(r.food.carbs100)} · L ${fmtSmart(r.food.fat100)} / 100 ${r.food.unit}` : `Valeurs manquantes : ${r.missing.join(', ')}`}</span>
                </span>
                {!r.complete && <Badge tone="warn">Incomplet</Badge>}
              </button>
            </li>
          ))}
          {!results.length && <li className="py-6 text-center text-sm text-muted">Aucun résultat.</li>}
        </ul>
      )}
      <p className="text-[11px] text-faint">Données Open Food Facts (base collaborative, licence ODbL). Les valeurs affichées sont celles du produit, jamais estimées ; un produit incomplet doit être complété à partir de son étiquette.</p>
    </div>
  );
}

/** Lecture de code-barres via l'appareil photo (API BarcodeDetector, si le navigateur la propose) */
function Scanner({ onCode, onClose }: { onCode: (c: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let stream: MediaStream | null = null;
    let stop = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (!video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        const Detector = (window as unknown as { BarcodeDetector: new (o: unknown) => { detect(v: HTMLVideoElement): Promise<{ rawValue: string }[]> } }).BarcodeDetector;
        const det = new Detector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
        const tick = async () => {
          if (stop || !video.current) return;
          const codes = await det.detect(video.current).catch(() => []);
          if (codes[0]?.rawValue) return onCode(codes[0].rawValue);
          setTimeout(tick, 250);
        };
        void tick();
      } catch (e) {
        setErr(`Caméra indisponible : ${(e as Error).message}`);
      }
    })();
    return () => {
      stop = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onCode]);
  return (
    <div className="rounded-2xl overflow-hidden border border-line relative bg-black">
      {err ? <div className="p-4 text-sm text-warn">{err}</div> : <video ref={video} className="w-full max-h-64 object-cover" muted playsInline />}
      <div className="absolute inset-x-10 top-1/2 h-0.5 bg-accent/70" />
      <Button size="sm" className="absolute top-2 right-2" onClick={onClose}>
        Fermer
      </Button>
    </div>
  );
}

export function FoodForm({ initial, onSaved }: { initial?: Partial<Food>; onSaved: (f: Food) => void }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [brand, setBrand] = useState(initial?.brand ?? '');
  const [unit, setUnit] = useState<FoodUnit>(initial?.unit ?? 'g');
  const [kcal, setKcal] = useState<number | null>(initial?.kcal100 || null);
  const [p, setP] = useState<number | null>(initial?.protein100 ?? null);
  const [c, setC] = useState<number | null>(initial?.carbs100 ?? null);
  const [f, setF] = useState<number | null>(initial?.fat100 ?? null);
  const [serving, setServing] = useState<number | null>(initial?.servingSize ?? null);
  const isEdit = !!initial?.id && (initial.source === 'custom' || initial.source === 'openfoodfacts') && !!store().data.foods.find((x) => x.id === initial.id);
  const valid = name.trim().length >= 2 && kcal !== null && p !== null && c !== null && f !== null && kcal <= 950 && p + c + f <= 101;
  const mismatch = valid ? macroKcalMismatch({ kcal100: kcal!, protein100: p!, carbs100: c!, fat100: f! }) : 0;
  const save = () => {
    if (!valid) return;
    const food: Food = {
      id: isEdit ? initial!.id! : initial?.source === 'openfoodfacts' && initial.id ? initial.id : `food-custom-${uid()}`,
      name: name.trim(),
      brand: brand.trim(),
      unit,
      kcal100: kcal!,
      protein100: p!,
      carbs100: c!,
      fat100: f!,
      servingSize: serving,
      servingLabel: initial?.servingLabel ?? '',
      category: initial?.category ?? 'Mes aliments',
      source: initial?.source === 'openfoodfacts' ? 'openfoodfacts' : 'custom',
      barcode: initial?.barcode ?? null,
      updatedAt: nowISO(),
    };
    store().upsert('foods', food);
    toast(isEdit ? 'Aliment modifié' : 'Aliment enregistré', food.name);
    onSaved(food);
  };
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nom">
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        </Field>
        <Field label="Marque (facultatif)">
          <input className="field" value={brand} onChange={(e) => setBrand(e.target.value)} maxLength={60} />
        </Field>
      </div>
      <div>
        <span className="label">Valeurs nutritionnelles pour 100</span>
        <Segmented size="sm" value={unit} onChange={setUnit} options={[{ value: 'g', label: 'grammes' }, { value: 'ml', label: 'millilitres' }]} />
      </div>
      <div className="grid grid-cols-4 gap-2">
        <Field label="kcal">
          <NumberInput value={kcal} onChange={setKcal} />
        </Field>
        <Field label="Protéines">
          <NumberInput value={p} onChange={setP} suffix="g" />
        </Field>
        <Field label="Glucides">
          <NumberInput value={c} onChange={setC} suffix="g" />
        </Field>
        <Field label="Lipides">
          <NumberInput value={f} onChange={setF} suffix="g" />
        </Field>
      </div>
      <Field label={`Portion usuelle (${unit}, facultatif)`}>
        <NumberInput value={serving} onChange={setServing} />
      </Field>
      {mismatch > 0.2 && <Notice tone="warn">Les calories ne correspondent pas aux macros (≈ {fmt(p! * 4 + c! * 4 + f! * 9)} kcal calculées avec 4/4/9). Vérifie l'étiquette.</Notice>}
      <div className="flex gap-2 justify-end">
        {isEdit && (
          <Button
            variant="danger"
            icon={<Trash2 size={14} />}
            onClick={async () => {
              if (await confirmDialog({ title: 'Supprimer cet aliment ?', text: 'Les repas déjà saisis conservent leurs valeurs.', confirmLabel: 'Supprimer', danger: true })) {
                store().remove('foods', initial!.id!);
                toast('Aliment supprimé');
              }
            }}
          >
            Supprimer
          </Button>
        )}
        <Button variant="primary" onClick={save} disabled={!valid}>
          {isEdit ? 'Enregistrer' : 'Enregistrer et ajouter'}
        </Button>
      </div>
    </div>
  );
}

export function QuantityStep({ food, initial, onBack, onConfirm, confirmLabel = 'Ajouter' }: { food: Pick<Food, 'name' | 'unit' | 'kcal100' | 'protein100' | 'carbs100' | 'fat100'> & { servingSize?: number | null; servingLabel?: string; brand?: string }; initial?: number; onBack?: () => void; onConfirm: (q: number) => void; confirmLabel?: string }) {
  const [q, setQ] = useState<number | null>(initial ?? food.servingSize ?? 100);
  const n = roundNutrients(nutrientsFor(food, q ?? 0));
  const presets = [...new Set([food.servingSize, 50, 100, 150, 200, 250].filter((x): x is number => !!x))].slice(0, 5);
  return (
    <div className="space-y-4">
      <div>
        <div className="font-semibold">{food.name}</div>
        {food.brand && <div className="text-xs text-muted">{food.brand}</div>}
      </div>
      <Field label={`Quantité (${food.unit})`} hint={food.servingSize ? `Portion : ${food.servingSize} ${food.unit}${food.servingLabel ? ` (${food.servingLabel})` : ''}` : undefined}>
        <NumberInput value={q} onChange={setQ} suffix={food.unit} onEnter={() => q && q > 0 && onConfirm(q)} />
      </Field>
      <div className="flex flex-wrap gap-1.5">
        {presets.map((p) => (
          <button key={p} type="button" onClick={() => setQ(p)} className={cx('rounded-full px-3 py-1 text-xs border tnum', q === p ? 'border-accent text-accent bg-accent/10' : 'border-line text-muted')}>
            {p} {food.unit}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-4 gap-2 text-center">
        {[
          ['kcal', n.kcal, ''],
          ['Protéines', n.protein, 'g'],
          ['Glucides', n.carbs, 'g'],
          ['Lipides', n.fat, 'g'],
        ].map(([l, v, u]) => (
          <div key={l as string} className="rounded-xl bg-surface-2 py-2">
            <div className="display text-xl font-bold tnum">
              {fmtSmart(v as number, 1)}
              {u && <span className="text-xs text-muted"> {u}</span>}
            </div>
            <div className="text-[10px] uppercase text-muted">{l}</div>
          </div>
        ))}
      </div>
      <div className="flex gap-2 justify-end">
        {onBack && (
          <Button variant="ghost" onClick={onBack}>
            Retour
          </Button>
        )}
        <Button variant="primary" disabled={!q || q <= 0} onClick={() => q && onConfirm(q)}>
          {confirmLabel}
        </Button>
      </div>
    </div>
  );
}
