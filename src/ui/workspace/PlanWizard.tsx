import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, Check, Eye, RotateCcw, Sparkles, Wand2 } from 'lucide-react';
import type { HousingAnswers, Level } from '@/domain/types';
import { useApp, useActiveDossier, type WorkspaceTab } from '@/state/store';
import { TEMPLATES, SURFACE_BANDS, getTemplate, targetSurface, type HousingTemplate } from '@/generator/templates';
import { generatePlan, normalizeAnswers, type GenerationResult } from '@/generator/generate';
import { hasManualChanges } from '@/generator/provenance';
import { IsoThumbnail } from '@/generator/IsoThumbnail';
import { PlanDrawing } from '@/plan/PlanDrawing';
import { levelBounds } from '@/plan/geometry';
import { formatNumber } from '@/lib/format';
import { Badge, Button, Card, Field, Modal, NumberInput, cx, inputCls } from '../kit';

const GenerationPreview3D = lazy(() => import('@/view3d/LevelsPreview3D').then((m) => ({ default: m.LevelsPreview3D })));

// ---------------------------------------------------------------------------
// Progression globale
// ---------------------------------------------------------------------------

const PROGRESS: { label: string; tab?: WorkspaceTab }[] = [
  { label: 'Choix du logement' },
  { label: 'Questionnaire' },
  { label: 'Génération du plan' },
  { label: 'Vérification et correction', tab: 'plan' },
  { label: 'Visualisation 3D', tab: 'vue3d' },
  { label: 'Audit de sécurité', tab: 'audit' },
  { label: 'Devis', tab: 'devis' },
];

function Progress({ step, onStep, generated }: { step: number; onStep: (i: number) => void; generated: boolean }) {
  const setTab = useApp((s) => s.setTab);
  return (
    <ol className="flex flex-wrap items-center gap-1" aria-label="Progression de la création du plan">
      {PROGRESS.map((p, i) => {
        const enabled = i <= 2 ? i <= step || generated : generated;
        const current = i === step;
        return (
          <li key={p.label} className="flex items-center gap-1">
            <button
              disabled={!enabled}
              onClick={() => (p.tab ? setTab(p.tab) : onStep(i))}
              className={cx(
                'flex items-center gap-1.5 rounded-full py-1 pr-3 pl-1 text-xs font-medium transition-colors disabled:opacity-40',
                current ? 'bg-brand-700 text-white' : 'text-slate-600 hover:bg-slate-100',
              )}
              aria-current={current ? 'step' : undefined}
            >
              <span className={cx('flex h-5 w-5 items-center justify-center rounded-full text-[10px]', current ? 'bg-white text-brand-700' : i < step ? 'bg-emerald-500 text-white' : 'bg-slate-200')}>
                {i < step ? <Check size={11} /> : i + 1}
              </span>
              {p.label}
            </button>
            {i < PROGRESS.length - 1 && <span className="h-px w-3 bg-slate-300" />}
          </li>
        );
      })}
    </ol>
  );
}

// ---------------------------------------------------------------------------
// Vignettes
// ---------------------------------------------------------------------------

export function PlanThumb({ level, width, height, labels = false }: { level: Level; width: number; height: number; labels?: boolean }) {
  const b = levelBounds(level) ?? { minX: 0, minY: 0, maxX: 10, maxY: 8 };
  const pad = 0.6;
  const vw = b.maxX - b.minX + pad * 2;
  const vh = b.maxY - b.minY + pad * 2;
  const px = Math.min(width / vw, height / vh);
  return (
    <svg viewBox={`${b.minX - pad} ${b.minY - pad} ${vw} ${vh}`} width={width} height={height} className="block">
      <PlanDrawing level={level} devices={[]} products={[]} pxPerMeter={px} showLabels={labels} showDimensions={false} showCoverage={false} />
    </svg>
  );
}

function TemplateCard({ t, selected, onSelect, onPreview }: { t: HousingTemplate; selected: boolean; onSelect: () => void; onPreview: () => void }) {
  const result = useMemo(() => generatePlan(t, t.defaults), [t]);
  return (
    <div
      className={cx('flex flex-col overflow-hidden rounded-lg border bg-white transition-shadow', selected ? 'border-brand-500 ring-2 ring-brand-100' : 'border-slate-200 hover:shadow-md')}
      data-testid={`template-${t.id}`}
    >
      <button onClick={onSelect} className="grid grid-cols-2 gap-1 bg-slate-50 p-2" aria-label={`Choisir le modèle ${t.name}`}>
        <div className="flex items-center justify-center rounded bg-white">
          <PlanThumb level={result.levels[0]} width={130} height={95} />
        </div>
        <div className="flex items-center justify-center rounded bg-white">
          <IsoThumbnail levels={result.levels} width={130} height={95} />
        </div>
      </button>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-slate-800">{t.name}</span>
          {selected && <Badge tone="blue">Sélectionné</Badge>}
        </div>
        <p className="text-xs text-slate-500">{t.description}</p>
        <p className="text-[11px] text-slate-400">
          ≈ {formatNumber(result.stats.habitableArea, 0)} m² · {result.levels.length} niveau(x) · {t.defaults.bedrooms} chambre(s)
        </p>
        <div className="mt-auto flex gap-2 pt-1">
          <Button size="sm" icon={<Eye size={13} />} onClick={onPreview}>
            Aperçu
          </Button>
          <Button size="sm" variant={selected ? 'primary' : 'secondary'} onClick={onSelect}>
            {selected ? 'Modèle choisi' : 'Choisir'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function GeneratedView({ result, compact }: { result: GenerationResult; compact?: boolean }) {
  return (
    <div className={cx('grid gap-3', compact ? 'grid-cols-1' : 'grid-cols-2')}>
      <div className="flex flex-col gap-2">
        {result.levels.map((l) => (
          <div key={l.id} className="rounded-md border border-slate-200 bg-white p-2">
            <div className="mb-1 text-xs font-semibold text-slate-600">{l.name}</div>
            <PlanThumb level={l} width={compact ? 360 : 520} height={compact ? 230 : 300} labels />
          </div>
        ))}
      </div>
      {!compact && (
        <div className="min-h-[420px] overflow-hidden rounded-md border border-slate-200 bg-slate-100" data-testid="generation-3d">
          <Suspense fallback={<div className="p-4 text-sm text-slate-500">Chargement de la maquette 3D…</div>}>
            <GenerationPreview3D levels={result.levels} />
          </Suspense>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Questionnaire
// ---------------------------------------------------------------------------

function Choice<T extends string | number>({ value, options, onChange, name }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; name: string }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={name}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'rounded-md border px-3 py-1.5 text-sm transition-colors',
            value === o.value ? 'border-brand-600 bg-brand-700 text-white' : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Question({ n, title, hint, children }: { n: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 border-b border-slate-100 py-3 last:border-0">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">{n}</span>
      <div className="flex-1">
        <div className="mb-1.5 text-sm font-medium text-slate-800">{title}</div>
        {children}
        {hint && <p className="mt-1 text-[11px] text-slate-500">{hint}</p>}
      </div>
    </div>
  );
}

function Questionnaire({ answers, onChange }: { answers: HousingAnswers; onChange: (a: HousingAnswers) => void }) {
  const set = (patch: Partial<HousingAnswers>) => onChange({ ...answers, ...patch });
  const setF = (patch: Partial<HousingAnswers['features']>) => onChange({ ...answers, features: { ...answers.features, ...patch } });
  const appt = answers.housingType === 'appartement';
  return (
    <div data-testid="questionnaire">
      <Question n={1} title="Quel est le type de logement ?">
        <Choice
          name="Type de logement"
          value={answers.housingType}
          onChange={(v) => set({ housingType: v, ...(v === 'appartement' ? { garage: 'aucun' as const } : {}) })}
          options={[
            { value: 'appartement', label: 'Appartement' },
            { value: 'maison', label: 'Maison' },
            { value: 'autre', label: 'Autre logement' },
          ]}
        />
      </Question>
      <Question n={2} title="Quelle est la surface approximative ?">
        <div className="flex flex-wrap items-center gap-2">
          <Choice name="Surface" value={answers.surfaceBand} onChange={(v) => set({ surfaceBand: v })} options={SURFACE_BANDS.map((b) => ({ value: b.value, label: b.value === 'exacte' ? 'Surface exacte à renseigner' : b.label }))} />
          {answers.surfaceBand === 'exacte' && (
            <NumberInput value={answers.surfaceExact} onChange={(v) => set({ surfaceExact: v })} allowNull min={15} max={600} step={1} suffix="m²" className="w-32" aria-label="Surface exacte" />
          )}
        </div>
      </Question>
      <Question n={3} title="Combien de niveaux comporte le logement ?" hint={answers.levels > 1 ? 'Un escalier est ajouté automatiquement entre les niveaux.' : undefined}>
        <Choice
          name="Niveaux"
          value={answers.levels}
          onChange={(v) => set({ levels: v, features: { ...answers.features, stairs: v > 1 ? true : answers.features.stairs } })}
          options={appt ? [{ value: 1 as const, label: '1 niveau (plain-pied)' }, { value: 2 as const, label: '2 niveaux (duplex)' }] : [{ value: 1 as const, label: '1 niveau' }, { value: 2 as const, label: '2 niveaux' }, { value: 3 as const, label: '3 niveaux ou plus' }]}
        />
      </Question>
      <Question n={4} title="Combien de chambres y a-t-il ?" hint={answers.bedrooms === 0 ? 'Logement sans chambre séparée : plan de type studio.' : undefined}>
        <Choice name="Chambres" value={Math.min(5, answers.bedrooms)} onChange={(v) => set({ bedrooms: v })} options={[0, 1, 2, 3, 4, 5].map((n) => ({ value: n, label: n === 5 ? '5 ou plus' : String(n) }))} />
        {answers.bedrooms >= 5 && (
          <NumberInput value={answers.bedrooms} onChange={(v) => v && set({ bedrooms: Math.round(v) })} min={5} max={8} step={1} className="mt-2 w-28" aria-label="Nombre exact de chambres" />
        )}
      </Question>
      <Question n={5} title="Quelle est la configuration du séjour et de la cuisine ?">
        <Choice
          name="Cuisine"
          value={answers.kitchen}
          onChange={(v) => set({ kitchen: v })}
          options={[
            { value: 'ouverte', label: 'Cuisine ouverte sur le séjour' },
            { value: 'separee', label: 'Cuisine séparée' },
            { value: 'partielle', label: 'Cuisine partiellement ouverte' },
          ]}
        />
      </Question>
      {answers.bedrooms > 0 && (
        <Question n={6} title="Le logement comprend-il un couloir ?" hint={answers.levels > 1 ? 'Un palier est toujours prévu à l’étage.' : undefined}>
          <Choice name="Couloir" value={answers.corridor ? 'oui' : 'non'} onChange={(v) => set({ corridor: v === 'oui' })} options={[{ value: 'oui', label: 'Oui' }, { value: 'non', label: 'Non' }]} />
        </Question>
      )}
      {!appt && (
        <Question n={7} title="Le logement comprend-il un garage ?">
          <Choice
            name="Garage"
            value={answers.garage}
            onChange={(v) => set({ garage: v })}
            options={[
              { value: 'aucun', label: 'Aucun garage' },
              { value: 'attenant', label: 'Garage attenant' },
              { value: 'separe', label: 'Garage séparé' },
            ]}
          />
        </Question>
      )}
      <Question n={8} title="Combien y a-t-il d'accès extérieurs ?" hint="Porte d'entrée comprise (hors porte de garage).">
        <Choice name="Accès extérieurs" value={Math.min(4, answers.exteriorAccesses)} onChange={(v) => set({ exteriorAccesses: v })} options={[1, 2, 3, 4].map((n) => ({ value: n, label: n === 4 ? '4 ou plus' : String(n) }))} />
      </Question>
      <Question n={9} title="Combien de fenêtres et de baies vitrées environ ?">
        <div className="grid max-w-lg grid-cols-3 gap-3">
          <Field label="Fenêtres">
            <NumberInput value={answers.windows} onChange={(v) => v !== null && set({ windows: Math.round(v) })} min={0} max={30} step={1} aria-label="Nombre de fenêtres" />
          </Field>
          <Field label="Baies vitrées">
            <NumberInput value={answers.bays} onChange={(v) => v !== null && set({ bays: Math.round(v) })} min={0} max={8} step={1} aria-label="Nombre de baies vitrées" />
          </Field>
          <Field label="Portes ext. supplémentaires">
            <NumberInput value={answers.extraDoors} onChange={(v) => v !== null && set({ extraDoors: Math.round(v) })} min={0} max={4} step={1} aria-label="Portes extérieures supplémentaires" />
          </Field>
        </div>
      </Question>
      <Question n={10} title="Existe-t-il des particularités ?">
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
          {(
            [
              ['stairs', 'Escalier intérieur'],
              ['extension', 'Extension'],
              ['veranda', 'Véranda'],
              ['extraRoom', 'Pièce supplémentaire (bureau)'],
              ...(answers.garage === 'attenant' ? [['garageCommunicating', 'Garage communicant avec le logement']] : []),
              ['other', 'Autre particularité'],
            ] as [keyof HousingAnswers['features'], string][]
          ).map(([k, label]) => (
            <label key={k} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                className="h-4 w-4 accent-brand-700"
                checked={answers.features[k]}
                disabled={k === 'stairs' && answers.levels > 1}
                onChange={(e) => setF({ [k]: e.target.checked })}
              />
              {label}
            </label>
          ))}
        </div>
        <textarea
          className={cx(inputCls, 'mt-2')}
          rows={2}
          placeholder="Commentaire libre : éléments non couverts par les choix ci-dessus (mezzanine, sous-sol, accès par le jardin…)"
          value={answers.comment}
          onChange={(e) => set({ comment: e.target.value })}
          aria-label="Commentaire libre"
        />
      </Question>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Assistant complet
// ---------------------------------------------------------------------------

export function PlanWizard() {
  const dossier = useActiveDossier();
  const saveDraft = useApp((s) => s.saveWizardDraft);
  const applyGeneration = useApp((s) => s.applyGeneration);
  const setTab = useApp((s) => s.setTab);
  const toast = useApp((s) => s.toast);
  const draft = dossier?.wizardDraft ?? null;
  const [step, setStep] = useState<number>(() => (dossier?.generation ? 1 : draft?.templateId ? 1 : 0));
  const [templateId, setTemplateId] = useState<string | null>(draft?.templateId ?? dossier?.generation?.templateId ?? null);
  const [answers, setAnswers] = useState<HousingAnswers | null>(draft?.answers ?? dossier?.generation?.answers ?? null);
  const [preview, setPreview] = useState<HousingTemplate | null>(null);
  const [confirm, setConfirm] = useState<null | 'regenerer' | 'remplacer'>(null);
  const template = getTemplate(templateId);
  const effective = answers ?? template.defaults;
  const result = useMemo(() => generatePlan(template, effective), [template, effective]);

  useEffect(() => {
    if (!dossier) return;
    if (templateId !== (dossier.wizardDraft?.templateId ?? null) || answers !== (dossier.wizardDraft?.answers ?? null)) saveDraft(templateId, answers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, answers]);

  if (!dossier) return null;

  const chooseTemplate = (t: HousingTemplate) => {
    setTemplateId(t.id);
    setAnswers(structuredClone(t.defaults));
  };

  const apply = (mode: 'remplacer' | 'conserver') => {
    const notes = applyGeneration({ answers: normalizeAnswers(effective), result, mode });
    setConfirm(null);
    toast('success', 'Plan généré. Vérifiez les dimensions, les ouvertures et la disposition des pièces avant de commencer l’audit.');
    notes.forEach((n) => toast('info', n));
    setTab('plan');
  };
  const onUsePlan = () => {
    if (dossier.generation && hasManualChanges(dossier.plan.levels, dossier.generation)) setConfirm('regenerer');
    else if (!dossier.generation && dossier.plan.levels.some((l) => l.rooms.length)) setConfirm('remplacer');
    else apply('remplacer');
  };

  const groups = ['Appartement', 'Maison', 'Modèles complémentaires'] as const;

  return (
    <div className="scroll-thin h-full overflow-auto">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 p-6">
        <div className="flex flex-col gap-2 rounded-lg border border-brand-100 bg-white px-4 py-3">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-brand-600" />
            <h2 className="text-base font-semibold text-slate-900">Créer mon plan en quelques questions</h2>
            {dossier.generation && <Badge tone="violet">Plan déjà généré – vous pouvez modifier les réponses et régénérer</Badge>}
          </div>
          <Progress step={step} onStep={setStep} generated={!!dossier.generation} />
        </div>

        {step === 0 && (
          <>
            <p className="text-sm text-slate-600">
              Choisissez le modèle le plus proche du logement. Chaque modèle est un vrai plan modifiable (pièces, murs, ouvertures) : vous l'adapterez ensuite avec le questionnaire puis
              dans l'éditeur.
            </p>
            {groups.map((g) => (
              <section key={g}>
                <h3 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">{g}</h3>
                <div className="grid grid-cols-4 gap-3">
                  {TEMPLATES.filter((t) => t.group === g).map((t) => (
                    <TemplateCard key={t.id} t={t} selected={templateId === t.id} onSelect={() => chooseTemplate(t)} onPreview={() => setPreview(t)} />
                  ))}
                </div>
              </section>
            ))}
            <div className="sticky bottom-0 flex justify-end border-t border-slate-200 bg-slate-100/95 py-3">
              <Button variant="primary" icon={<ArrowRight size={15} />} disabled={!templateId} onClick={() => setStep(1)}>
                Continuer vers le questionnaire
              </Button>
            </div>
          </>
        )}

        {step === 1 && (
          <div className="grid grid-cols-5 gap-4">
            <Card
              title={`Questionnaire – modèle « ${template.name} »`}
              className="col-span-3"
              actions={
                <Button size="sm" icon={<RotateCcw size={13} />} onClick={() => setAnswers(structuredClone(template.defaults))}>
                  Réponses du modèle
                </Button>
              }
            >
              <Questionnaire answers={effective} onChange={setAnswers} />
            </Card>
            <div className="col-span-2 flex flex-col gap-3">
              <Card title="Aperçu en direct" bodyClassName="p-3">
                <GeneratedView result={result} compact />
                <p className="mt-2 text-xs text-slate-500">
                  ≈ {formatNumber(result.stats.habitableArea, 0)} m² habitables pour {targetSurface(normalizeAnswers(effective))} m² demandés · {result.stats.bedrooms} chambre(s) ·{' '}
                  {result.stats.exteriorDoors} accès · {result.stats.windows} fenêtre(s) · {result.stats.bays} baie(s)
                </p>
              </Card>
              <div className="flex justify-between">
                <Button icon={<ArrowLeft size={15} />} onClick={() => setStep(0)}>
                  Changer de modèle
                </Button>
                <Button variant="primary" icon={<Wand2 size={15} />} onClick={() => setStep(2)}>
                  Générer le plan
                </Button>
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <>
            <Card title="Plan généré : 2D et maquette 3D" actions={<Badge tone="amber">Plan générique à vérifier</Badge>}>
              <div className="mb-3 flex flex-wrap gap-2 text-xs">
                <Badge>Modèle : {result.template.name}</Badge>
                <Badge>Surface ≈ {formatNumber(result.stats.habitableArea, 0)} m² (demandé {result.stats.targetArea} m²)</Badge>
                <Badge>{result.levels.length} niveau(x)</Badge>
                <Badge>{result.levels.reduce((s, l) => s + l.rooms.length, 0)} pièces</Badge>
                <Badge>{result.stats.exteriorDoors} accès · {result.stats.windows} fenêtres · {result.stats.bays} baies</Badge>
              </div>
              {result.needsManualFix && (
                <div className="mb-3 flex gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                  Les réponses ne permettent pas un plan entièrement cohérent : le modèle le plus proche est proposé, une correction manuelle est nécessaire.
                </div>
              )}
              {result.warnings.length > 0 && (
                <ul className="mb-3 space-y-0.5 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900" data-testid="generation-warnings">
                  {result.warnings.map((w) => (
                    <li key={w}>• {w}</li>
                  ))}
                </ul>
              )}
              <GeneratedView result={result} />
            </Card>
            <div className="flex justify-between">
              <Button icon={<ArrowLeft size={15} />} onClick={() => setStep(1)}>
                Modifier mes réponses
              </Button>
              <Button variant="primary" icon={<Check size={15} />} onClick={onUsePlan}>
                Utiliser ce plan et le vérifier
              </Button>
            </div>
          </>
        )}
      </div>

      {preview && (
        <Modal
          title={`Aperçu – ${preview.name}`}
          onClose={() => setPreview(null)}
          wide
          footer={
            <>
              <Button onClick={() => setPreview(null)}>Fermer</Button>
              <Button
                variant="primary"
                onClick={() => {
                  chooseTemplate(preview);
                  setPreview(null);
                  setStep(1);
                }}
              >
                Choisir ce modèle
              </Button>
            </>
          }
        >
          <p className="mb-3 text-sm text-slate-600">{preview.description}</p>
          <GeneratedView result={generatePlan(preview, preview.defaults)} />
        </Modal>
      )}

      {confirm === 'regenerer' && (
        <Modal
          title="Régénérer le plan ?"
          onClose={() => setConfirm(null)}
          footer={
            <>
              <Button onClick={() => setConfirm(null)}>Annuler</Button>
              <Button onClick={() => apply('remplacer')}>Repartir du modèle</Button>
              <Button variant="primary" onClick={() => apply('conserver')}>
                Conserver mes modifications
              </Button>
            </>
          }
        >
          <p className="text-sm text-slate-600">
            Le plan actuel contient des corrections manuelles (pièces ou ouvertures ajoutées, déplacées ou supprimées). Voulez-vous les réappliquer sur le nouveau plan, ou repartir du
            modèle généré ? Dans les deux cas, l'opération peut être annulée avec Ctrl+Z dans le Plan 2D.
          </p>
        </Modal>
      )}
      {confirm === 'remplacer' && (
        <Modal
          title="Remplacer le plan existant ?"
          onClose={() => setConfirm(null)}
          footer={
            <>
              <Button onClick={() => setConfirm(null)}>Annuler</Button>
              <Button variant="danger" onClick={() => apply('remplacer')}>
                Remplacer par le plan généré
              </Button>
            </>
          }
        >
          <p className="text-sm text-slate-600">
            Ce dossier contient déjà un plan dessiné. Le plan généré le remplacera (annulable avec Ctrl+Z dans le Plan 2D). Les équipements manuels et validés sont conservés.
          </p>
        </Modal>
      )}
    </div>
  );
}

export function GenerationBanner() {
  const dossier = useActiveDossier();
  const validate = useApp((s) => s.validateGeneratedPlan);
  const setTab = useApp((s) => s.setTab);
  const toast = useApp((s) => s.toast);
  if (!dossier?.generation || dossier.generation.validatedAt) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-violet-200 bg-violet-50 px-4 py-2 text-sm text-violet-900" role="status" data-testid="generation-banner">
      <Sparkles size={16} className="shrink-0" />
      <span className="flex-1">
        Votre plan a été généré à partir de vos réponses. Vérifiez les dimensions, les ouvertures et la disposition des pièces avant de commencer l'audit de sécurité.
      </span>
      <Button size="sm" onClick={() => setTab('questionnaire')}>
        Revenir au questionnaire
      </Button>
      <Button
        size="sm"
        variant="success"
        icon={<Check size={13} />}
        onClick={() => {
          validate();
          toast('success', 'Plan vérifié par le conseiller : il peut servir de base à l’audit.');
        }}
      >
        Valider le plan
      </Button>
    </div>
  );
}

