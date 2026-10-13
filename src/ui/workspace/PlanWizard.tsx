import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, Building2, Check, Eye, HelpCircle, Home, ImageUp, PencilRuler, RotateCcw, Sparkles, Wand2 } from 'lucide-react';
import type { HousingAnswers, Level } from '@/domain/types';
import { useEditor } from '@/state/editor';
import { useApp, useActiveDossier } from '@/state/store';
import { TEMPLATES, SURFACE_BANDS, getTemplate, targetSurface, type HousingTemplate } from '@/generator/templates';
import { generatePlan, normalizeAnswers, type GenerationResult } from '@/generator/generate';
import { hasManualChanges } from '@/generator/provenance';
import { IsoThumbnail } from '@/generator/IsoThumbnail';
import { PlanDrawing } from '@/plan/PlanDrawing';
import { levelBounds } from '@/plan/geometry';
import { formatNumber } from '@/lib/format';
import { Badge, Button, Card, Counter, Modal, NumberInput, cx, inputCls } from '../kit';

const GenerationPreview3D = lazy(() => import('@/view3d/LevelsPreview3D').then((m) => ({ default: m.LevelsPreview3D })));

// ---------------------------------------------------------------------------
// Progression globale
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
  // vignettes issues du plan réellement généré par le modèle
  const result = useMemo(() => generatePlan(t, t.defaults), [t]);
  return (
    <div
      className={cx(
        'flex flex-col overflow-hidden rounded-xl border bg-white transition-colors',
        selected ? 'border-brand-600 bg-brand-50/40 ring-1 ring-brand-600' : 'border-slate-200 hover:border-slate-400',
      )}
      data-testid={`template-${t.id}`}
      data-selected={selected || undefined}
    >
      <button onClick={onSelect} className="grid grid-cols-2 gap-1.5 p-2" aria-label={`Choisir le modèle ${t.name}`}>
        <div className="flex items-center justify-center rounded-lg bg-slate-50">
          <PlanThumb level={result.levels[0]} width={130} height={95} />
        </div>
        <div className="flex items-center justify-center rounded-lg bg-slate-50">
          <IsoThumbnail levels={result.levels} width={130} height={95} />
        </div>
      </button>
      <div className="flex flex-1 flex-col gap-1.5 px-3 pt-1 pb-3">
        <div className="flex items-start justify-between gap-2">
          <span className="text-sm font-semibold text-slate-900">{t.name}</span>
          {selected && <Check size={16} className="shrink-0 text-brand-600" aria-label="Modèle sélectionné" />}
        </div>
        <div className="flex flex-wrap gap-1 text-[11px]">
          <Badge>{t.defaults.housingType === 'appartement' ? 'Appartement' : 'Maison'}</Badge>
          <Badge>
            {result.levels.length} niveau{result.levels.length > 1 ? 'x' : ''}
          </Badge>
          <Badge>≈ {formatNumber(result.stats.habitableArea, 0)} m²</Badge>
          <Badge>{t.defaults.bedrooms} ch.</Badge>
        </div>
        <p className="text-xs leading-relaxed text-slate-500">{t.description}</p>
        <div className="mt-auto flex gap-2 pt-1">
          <Button size="sm" icon={<Eye size={13} />} onClick={onPreview}>
            Aperçu
          </Button>
          <Button size="sm" variant={selected ? 'primary' : 'secondary'} onClick={onSelect} className="flex-1">
            {selected ? 'Modèle choisi' : 'Choisir ce modèle'}
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
            value === o.value ? 'border-brand-600 bg-brand-50 text-brand-700 ring-1 ring-brand-600' : 'border-slate-300 bg-white text-slate-700 hover:border-slate-500',
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
    <div className="flex gap-3 border-b border-slate-100 py-4 last:border-0">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">{n}</span>
      <div className="flex-1">
        <div className="mb-2 text-sm font-semibold text-slate-900">{title}</div>
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
  const extras = Math.max(0, answers.mainRooms - 1 - answers.bedrooms);
  return (
    <div data-testid="questionnaire">
      <Question n={1} title="Quel est le type de logement ?">
        <div className="grid max-w-xl grid-cols-3 gap-2" role="radiogroup" aria-label="Type de logement">
          {(
            [
              ['appartement', 'Appartement', <Building2 key="a" size={20} />],
              ['maison', 'Maison', <Home key="m" size={20} />],
              ['autre', 'Autre logement', <HelpCircle key="o" size={20} />],
            ] as const
          ).map(([v, label, icon]) => (
            <button
              key={v}
              role="radio"
              aria-checked={answers.housingType === v}
              onClick={() => set({ housingType: v, ...(v === 'appartement' ? { garage: 'aucun' as const } : {}) })}
              className={cx(
                'flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-sm font-medium',
                answers.housingType === v ? 'border-brand-600 bg-brand-50 text-brand-700 ring-1 ring-brand-600' : 'border-slate-200 bg-white text-slate-800 hover:border-slate-500',
              )}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>
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
        <Choice name="Chambres" value={Math.min(5, answers.bedrooms)} onChange={(v) => set({ bedrooms: v, mainRooms: 1 + v + extras })} options={[0, 1, 2, 3, 4, 5].map((n) => ({ value: n, label: n === 5 ? '5 ou plus' : String(n) }))} />
        {answers.bedrooms >= 5 && (
          <NumberInput value={answers.bedrooms} onChange={(v) => v && set({ bedrooms: Math.round(v), mainRooms: 1 + Math.round(v) + extras })} min={5} max={8} step={1} className="mt-2 w-28" aria-label="Nombre exact de chambres" />
        )}
      </Question>
      <Question
        n={5}
        title="Combien de pièces principales (séjour + chambres + bureau…) ?"
        hint={
          answers.mainRooms < 1 + answers.bedrooms
            ? `Au moins ${1 + answers.bedrooms} pièces avec ${answers.bedrooms} chambre(s) : le nombre de chambres sera retenu.`
            : extras > 0
              ? `${extras} pièce(s) supplémentaire(s) (bureau…) seront ajoutées au plan.`
              : 'Hors cuisine, salle de bain, WC, entrée et couloir.'
        }
      >
        <div className="flex items-center gap-2">
          <Counter
            value={answers.mainRooms}
            min={1}
            max={12}
            onChange={(v) => {
              const ex = Math.max(0, v - 1 - answers.bedrooms);
              onChange({ ...answers, mainRooms: v, features: { ...answers.features, extraRoom: ex > 0 } });
            }}
            label="Nombre de pièces principales"
            testId="q-main-rooms"
          />
          <span className="text-xs text-slate-500">pièce(s) principale(s)</span>
        </div>
      </Question>
      <Question n={6} title="Quelle est la configuration du séjour et de la cuisine ?">
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
        <Question n={7} title="Le logement comprend-il un couloir ?" hint={answers.levels > 1 ? 'Un palier est toujours prévu à l’étage.' : undefined}>
          <Choice name="Couloir" value={answers.corridor ? 'oui' : 'non'} onChange={(v) => set({ corridor: v === 'oui' })} options={[{ value: 'oui', label: 'Oui' }, { value: 'non', label: 'Non' }]} />
        </Question>
      )}
      {!appt && (
        <Question n={8} title="Le logement comprend-il un garage ?">
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
      <Question n={9} title="Combien y a-t-il d'accès extérieurs ?" hint="Porte d'entrée comprise (hors porte de garage).">
        <Choice name="Accès extérieurs" value={Math.min(4, answers.exteriorAccesses)} onChange={(v) => set({ exteriorAccesses: v })} options={[1, 2, 3, 4].map((n) => ({ value: n, label: n === 4 ? '4 ou plus' : String(n) }))} />
      </Question>
      <Question n={10} title="Combien de fenêtres et de baies vitrées environ ?">
        <div className="flex flex-wrap gap-5">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-700">Fenêtres</span>
            <Counter value={answers.windows} onChange={(v) => set({ windows: v })} max={30} label="Nombre de fenêtres" />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-700">Baies vitrées</span>
            <Counter value={answers.bays} onChange={(v) => set({ bays: v })} max={8} label="Nombre de baies vitrées" />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-700">Portes ext. supplémentaires</span>
            <Counter value={answers.extraDoors} onChange={(v) => set({ extraDoors: v })} max={4} label="Portes extérieures supplémentaires" />
          </div>
        </div>
      </Question>
      <Question n={11} title="Existe-t-il des particularités ?">
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
                className="h-4 w-4 accent-brand-600"
                checked={answers.features[k]}
                disabled={k === 'stairs' && answers.levels > 1}
                onChange={(e) =>
                  k === 'extraRoom'
                    ? onChange({
                        ...answers,
                        mainRooms: 1 + answers.bedrooms + (e.target.checked ? Math.max(1, extras) : 0),
                        features: { ...answers.features, extraRoom: e.target.checked },
                      })
                    : setF({ [k]: e.target.checked })
                }
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

export function PlanWizard({ mode = 'modele' }: { mode?: 'modele' | 'questionnaire' }) {
  const dossier = useActiveDossier();
  const saveDraft = useApp((s) => s.saveWizardDraft);
  const applyGeneration = useApp((s) => s.applyGeneration);
  const setTab = useApp((s) => s.setTab);
  const toast = useApp((s) => s.toast);
  const draft = dossier?.wizardDraft ?? null;
  // étape 2 du parcours (choix du modèle) ou étape 3 (questionnaire puis génération)
  const [subStep, setSubStep] = useState<1 | 2>(1);
  const step = mode === 'modele' ? 0 : subStep;
  const setStep = (n: number) => {
    if (n === 0) setTab('modele');
    else {
      setSubStep(n as 1 | 2);
      if (mode === 'modele') setTab('questionnaire');
    }
  };
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
    toast('success', 'Plan généré. Vérifiez maintenant les pièces et les menuiseries, puis le plan 2D, avant de commencer l’audit.');
    notes.forEach((n) => toast('info', n));
    setTab('menuiseries');
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
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-900">{step === 0 ? 'Choisissez le modèle de logement' : step === 1 ? 'Créer mon plan en quelques questions' : 'Plan généré'}</h2>
            <p className="mt-0.5 max-w-3xl text-sm text-slate-600">
              {step === 0
                ? "Chaque modèle est un vrai plan modifiable (pièces, murs, menuiseries, mobilier) : vous l'adapterez avec le questionnaire puis dans l'éditeur."
                : step === 1
                  ? 'Les réponses mettent à jour l’aperçu en direct. Rien n’est enregistré sur le plan tant que vous ne l’utilisez pas.'
                  : 'Vérifiez le plan 2D et la maquette 3D avant de l’utiliser.'}
            </p>
          </div>
          {dossier.generation && <Badge tone="violet">Plan déjà généré – modifiez les réponses pour le régénérer</Badge>}
        </div>

        {step === 0 && (
          <>
            <div className="grid gap-3 md:grid-cols-2">
              <button
                onClick={() => {
                  setTab('plan');
                  useEditor.getState().set({ highlightImport: true });
                  toast('info', 'Cliquez sur « Importer un plan » (PNG, JPG, photo ou PDF) pour l’afficher en fond, puis définissez l’échelle.');
                }}
                className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left hover:border-slate-900"
                data-testid="choose-import"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-800">
                  <ImageUp size={18} />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-slate-900">Importer un plan ou une photo</span>
                  <span className="block text-xs text-slate-500">Plan existant en fond, à calibrer puis à retracer.</span>
                </span>
              </button>
              <button
                onClick={() => {
                  setTab('plan');
                  useEditor.getState().setTool('room');
                }}
                className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left hover:border-slate-900"
                data-testid="choose-draw"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-800">
                  <PencilRuler size={18} />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-slate-900">Dessiner le logement</span>
                  <span className="block text-xs text-slate-500">Tracé libre des pièces sur une grille magnétique.</span>
                </span>
              </button>
            </div>
            {groups.map((g) => (
              <section key={g}>
                <h3 className="mb-2 text-[11px] font-semibold tracking-[0.08em] text-slate-900 uppercase">{g}</h3>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4">
                  {TEMPLATES.filter((t) => t.group === g).map((t) => (
                    <TemplateCard key={t.id} t={t} selected={templateId === t.id} onSelect={() => chooseTemplate(t)} onPreview={() => setPreview(t)} />
                  ))}
                </div>
              </section>
            ))}
            <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-slate-200 bg-white/95 px-1 py-3 backdrop-blur-sm">
              <span className="text-sm text-slate-600">{templateId ? <>Modèle choisi : <strong className="text-slate-900">{template.name}</strong></> : 'Aucun modèle choisi'}</span>
              <Button variant="primary" icon={<ArrowRight size={15} />} disabled={!templateId} onClick={() => setStep(1)}>
                Continuer vers le questionnaire
              </Button>
            </div>
          </>
        )}

        {step === 1 && (
          <div className="grid gap-4 lg:grid-cols-5">
            <Card
              title={`Questionnaire – modèle « ${template.name} »`}
              className="lg:col-span-3"
              actions={
                <Button size="sm" icon={<RotateCcw size={13} />} onClick={() => setAnswers(structuredClone(template.defaults))}>
                  Réponses du modèle
                </Button>
              }
            >
              <Questionnaire answers={effective} onChange={setAnswers} />
            </Card>
            <div className="flex flex-col gap-3 lg:col-span-2">
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
                  setTab('questionnaire');
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
          const res = validate();
          if (res.ok) toast('success', 'Plan vérifié par le conseiller : il peut servir de base à l’audit.');
          else toast('error', `${res.unplaced} ouverture(s) restent à positionner sur le plan avant validation (onglet « Pièces & menuiseries »).`);
        }}
      >
        Valider le plan
      </Button>
    </div>
  );
}

