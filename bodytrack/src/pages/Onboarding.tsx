import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Flame, Scale, Sparkles, TrendingDown, TrendingUp } from 'lucide-react';
import type { ActivityLevel, GoalType, Sex } from '../lib/types';
import { Button, Field, NumberInput, Notice, cx } from '../components/ui';
import { ACTIVITY_LEVELS, ADJUSTMENT_LIMITS, DEFAULT_ADJUSTMENT, computeMetabolicPlan, suggestActivityLevel } from '../lib/calc/metabolism';
import { ageFromBirthDate, today } from '../lib/dates';
import { completeOnboarding } from '../lib/actions';
import { useStore } from '../lib/store/store';
import { buildDemoData } from '../data/demo';
import { fmt, fmtSigned } from '../lib/format';

export const GOALS: { value: GoalType; label: string; text: string; icon: typeof Flame }[] = [
  { value: 'bulk', label: 'Prise de masse', text: 'Léger surplus calorique pour gagner du muscle en limitant la graisse.', icon: TrendingUp },
  { value: 'maintain', label: 'Maintien', text: 'Calories proches de ta dépense pour stabiliser ton poids.', icon: Scale },
  { value: 'cut', label: 'Sèche', text: 'Déficit modéré pour perdre du gras en préservant tes performances.', icon: TrendingDown },
];

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [sex, setSex] = useState<Sex>('male');
  const [birthDate, setBirthDate] = useState('1996-01-01');
  const [height, setHeight] = useState<number | null>(null);
  const [weight, setWeight] = useState<number | null>(null);
  const [target, setTarget] = useState<number | null>(null);
  const [days, setDays] = useState(3);
  const [activity, setActivity] = useState<ActivityLevel>('moderate');
  const [activityTouched, setActivityTouched] = useState(false);
  const [goal, setGoal] = useState<GoalType>('bulk');
  const [adjustment, setAdjustment] = useState(DEFAULT_ADJUSTMENT.bulk);
  const [physique, setPhysique] = useState('');
  const switchWorkspace = useStore((s) => s.switchWorkspace);

  const age = ageFromBirthDate(birthDate);
  const valid = [
    true,
    age >= 14 && age <= 100 && !!height && height >= 120 && height <= 230,
    !!weight && weight >= 30 && weight <= 300 && !!target && target >= 30 && target <= 300,
    true,
    true,
    true,
  ];
  const plan = useMemo(
    () => (weight && height ? computeMetabolicPlan({ sex, age, heightCm: height, weightKg: weight, activityLevel: activity, goal, adjustment }) : null),
    [sex, age, height, weight, activity, goal, adjustment],
  );

  const finish = () => {
    if (!weight || !height || !target) return;
    completeOnboarding({ displayName: name || 'Athlète', sex, birthDate, heightCm: height, weightKg: weight, targetWeightKg: target, activityLevel: activity, trainingDaysPerWeek: days, goal, physiqueGoal: physique, adjustment });
  };

  const steps = ['Bienvenue', 'Toi', 'Poids', 'Activité', 'Objectif', 'Résultats'];

  return (
    <div className="min-h-dvh flex flex-col items-center px-4 py-8 safe-top">
      <div className="w-full max-w-md flex-1 flex flex-col">
        {step > 0 && (
          <div className="flex items-center gap-3 mb-8">
            <button type="button" onClick={() => setStep(step - 1)} className="text-muted hover:text-ink" aria-label="Étape précédente">
              <ArrowLeft size={20} />
            </button>
            <div className="flex-1 flex gap-1.5">
              {steps.slice(1).map((s, i) => (
                <div key={s} className={cx('h-1 flex-1 rounded-full transition', i < step ? 'bg-accent' : 'bg-surface-3')} />
              ))}
            </div>
            <span className="text-xs text-muted tnum">
              {step}/{steps.length - 1}
            </span>
          </div>
        )}

        <div className="flex-1 anim-fade-up" key={step}>
          {step === 0 && (
            <div className="flex flex-col items-center text-center pt-10">
              <div className="size-20 rounded-3xl bg-surface border border-line grid place-items-center shadow-[0_0_80px_-10px_var(--color-accent)] mb-8">
                <svg width="44" height="44" viewBox="0 0 64 64" fill="none" aria-hidden>
                  <path d="M10 40 L22 28 L32 36 L46 18 L54 24" stroke="var(--color-accent)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <h1 className="display text-5xl font-bold tracking-[0.12em]">BODYTRACK</h1>
              <p className="text-muted mt-4 max-w-sm">Ton coach personnel : séances, records, nutrition, poids, mensurations et bilans. Tout est calculé à partir de tes propres données.</p>
              <div className="w-full mt-12 flex flex-col gap-3">
                <Button variant="primary" size="lg" onClick={() => setStep(1)} icon={<ArrowRight size={18} />}>
                  Créer mon profil
                </Button>
                <Button variant="secondary" size="lg" onClick={() => void switchWorkspace('demo', buildDemoData(today()))} icon={<Sparkles size={18} />}>
                  Explorer la démo
                </Button>
                <p className="text-xs text-faint mt-2">La démo utilise des données fictives, séparées de tes données. Tu pourras la quitter à tout moment.</p>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5">
              <StepTitle title="Faisons connaissance" text="Ces informations servent au calcul de ton métabolisme. Elles restent privées." />
              <Field label="Prénom ou pseudo">
                <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Alex" maxLength={40} />
              </Field>
              <div>
                <span className="label">Sexe utilisé pour le calcul métabolique</span>
                <div className="grid grid-cols-2 gap-2">
                  {(['male', 'female'] as Sex[]).map((s) => (
                    <Choice key={s} active={sex === s} onClick={() => setSex(s)}>
                      {s === 'male' ? 'Homme' : 'Femme'}
                    </Choice>
                  ))}
                </div>
                <p className="text-[11px] text-faint mt-1.5">L'équation de Mifflin-St Jeor utilise une constante différente selon ce paramètre.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Date de naissance" hint={age > 0 ? `${age} ans` : undefined}>
                  <input type="date" className="field" value={birthDate} max={today()} onChange={(e) => setBirthDate(e.target.value)} />
                </Field>
                <Field label="Taille">
                  <NumberInput value={height} onChange={setHeight} placeholder="178" suffix="cm" />
                </Field>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <StepTitle title="Ton poids" text="Ton poids actuel sert de point de départ ; ta progression sera suivie avec une moyenne sur 7 jours." />
              <Field label="Poids actuel">
                <NumberInput value={weight} onChange={setWeight} placeholder="73,0" suffix="kg" />
              </Field>
              <Field label="Poids objectif">
                <NumberInput value={target} onChange={setTarget} placeholder="77,0" suffix="kg" />
              </Field>
              <Field label="Objectif physique (facultatif)">
                <input className="field" value={physique} onChange={(e) => setPhysique(e.target.value)} placeholder="Ex. : prendre du muscle sur le haut du corps" maxLength={120} />
              </Field>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <StepTitle title="Ton activité" text="Le niveau d'activité multiplie ton métabolisme de base pour estimer ta dépense quotidienne." />
              <div>
                <span className="label">Entraînements par semaine</span>
                <div className="grid grid-cols-7 gap-1.5">
                  {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                    <Choice
                      key={n}
                      active={days === n}
                      onClick={() => {
                        setDays(n);
                        if (!activityTouched) setActivity(suggestActivityLevel(n));
                      }}
                    >
                      {n}
                    </Choice>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <span className="label">Niveau d'activité global</span>
                {ACTIVITY_LEVELS.map((a) => (
                  <button
                    key={a.value}
                    type="button"
                    onClick={() => {
                      setActivity(a.value);
                      setActivityTouched(true);
                    }}
                    className={cx('w-full text-left card px-4 py-3 transition', activity === a.value ? '!border-accent bg-accent/5' : 'hover:border-faint')}
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-sm">{a.label}</span>
                      <span className="text-xs text-muted tnum">× {a.factor.toLocaleString('fr-FR')}</span>
                    </div>
                    <div className="text-xs text-muted mt-0.5">{a.hint}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-5">
              <StepTitle title="Ton objectif" text="Les objectifs restent volontairement modérés pour être tenables et sains." />
              <div className="space-y-2">
                {GOALS.map((g) => (
                  <button
                    key={g.value}
                    type="button"
                    onClick={() => {
                      setGoal(g.value);
                      setAdjustment(DEFAULT_ADJUSTMENT[g.value]);
                    }}
                    className={cx('w-full text-left card px-4 py-3 flex gap-3 items-start transition', goal === g.value ? '!border-accent bg-accent/5' : 'hover:border-faint')}
                  >
                    <g.icon size={20} className={goal === g.value ? 'text-accent mt-0.5' : 'text-muted mt-0.5'} />
                    <span>
                      <span className="block font-medium text-sm">{g.label}</span>
                      <span className="block text-xs text-muted mt-0.5">{g.text}</span>
                    </span>
                  </button>
                ))}
              </div>
              {goal !== 'maintain' && (
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="label !mb-0">{goal === 'bulk' ? 'Surplus calorique' : 'Déficit calorique'}</span>
                    <span className="tnum font-semibold">{fmtSigned(adjustment, 0, 'kcal/jour')}</span>
                  </div>
                  <input
                    type="range"
                    className="w-full accent-[var(--color-accent)]"
                    min={ADJUSTMENT_LIMITS[goal][0]}
                    max={ADJUSTMENT_LIMITS[goal][1]}
                    step={25}
                    value={adjustment}
                    onChange={(e) => setAdjustment(Number(e.target.value))}
                    aria-label="Ajustement calorique"
                  />
                  <p className="text-[11px] text-faint mt-1">
                    Bornes : {fmtSigned(ADJUSTMENT_LIMITS[goal][0], 0)} à {fmtSigned(ADJUSTMENT_LIMITS[goal][1], 0)} kcal. Soit environ {fmtSigned((adjustment * 7) / 7700, 2, 'kg')} par semaine au départ (estimation).
                  </p>
                </div>
              )}
            </div>
          )}

          {step === 5 && plan && (
            <div className="space-y-4">
              <StepTitle title="Ton plan de départ" text="Voici comment ces chiffres sont obtenus. Ce sont des estimations : elles seront affinées avec l'évolution réelle de ton poids." />
              <ResultRow n="1" label="Métabolisme de base" value={`${fmt(plan.bmr)} kcal`} text={`Mifflin-St Jeor : 10 × ${fmt(weight, 1)} kg + 6,25 × ${fmt(height)} cm − 5 × ${age} ans ${sex === 'male' ? '+ 5' : '− 161'}. Énergie dépensée au repos.`} />
              <ResultRow n="2" label="Dépense journalière (TDEE)" value={`${fmt(plan.tdee)} kcal`} text={`Métabolisme de base × ${ACTIVITY_LEVELS.find((a) => a.value === activity)?.factor.toLocaleString('fr-FR')} (niveau d'activité).`} />
              <ResultRow n="3" label="Calories de maintien" value={`${fmt(plan.maintenance)} kcal`} text="Dépense arrondie : l'apport qui devrait stabiliser ton poids." />
              <ResultRow n="4" label="Calories recommandées" value={`${fmt(plan.calories)} kcal`} text={goal === 'maintain' ? 'Maintien.' : `${fmtSigned(plan.adjustment, 0, 'kcal')} par rapport au maintien${plan.floorApplied ? ' (relevé au plancher de sécurité)' : ''}.`} highlight />
              <div className="card p-4 grid grid-cols-3 gap-3 text-center">
                <Macro label="Protéines" value={plan.proteinG} sub={`${plan.proteinPerKg.toLocaleString('fr-FR')} g/kg`} color="var(--color-protein)" />
                <Macro label="Glucides" value={plan.carbsG} sub="le reste" color="var(--color-carbs)" />
                <Macro label="Lipides" value={plan.fatG} sub={`${plan.fatPerKg.toLocaleString('fr-FR')} g/kg`} color="var(--color-fat)" />
              </div>
              <Notice>Tu pourras modifier manuellement tes calories et tes macros à tout moment (Nutrition → Objectifs). Ces calculs ne remplacent pas l'avis d'un professionnel de santé.</Notice>
            </div>
          )}
        </div>

        {step > 0 && (
          <div className="pt-6 pb-2 safe-bottom">
            {step < 5 ? (
              <Button variant="primary" size="lg" className="w-full" disabled={!valid[step]} onClick={() => setStep(step + 1)} icon={<ArrowRight size={18} />}>
                Continuer
              </Button>
            ) : (
              <Button variant="primary" size="lg" className="w-full" onClick={finish}>
                C'est parti
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StepTitle({ title, text }: { title: string; text: string }) {
  return (
    <div className="mb-2">
      <h2 className="display text-3xl font-bold uppercase">{title}</h2>
      <p className="text-sm text-muted mt-1.5">{text}</p>
    </div>
  );
}

function Choice({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={cx('h-11 rounded-xl border text-sm font-medium transition', active ? 'border-accent bg-accent/10 text-accent' : 'border-line bg-surface text-muted hover:text-ink')}>
      {children}
    </button>
  );
}

function ResultRow({ n, label, value, text, highlight }: { n: string; label: string; value: string; text: string; highlight?: boolean }) {
  return (
    <div className={cx('card p-4 flex gap-3', highlight && '!border-accent/50 bg-accent/5')}>
      <span className={cx('size-6 shrink-0 rounded-full grid place-items-center text-xs font-bold', highlight ? 'bg-accent text-accent-ink' : 'bg-surface-3 text-muted')}>{n}</span>
      <div className="min-w-0 flex-1">
        <div className="flex justify-between gap-2 items-baseline">
          <span className="text-sm font-medium">{label}</span>
          <span className={cx('display text-xl font-bold tnum', highlight && 'text-accent')}>{value}</span>
        </div>
        <p className="text-xs text-muted mt-1">{text}</p>
      </div>
    </div>
  );
}

function Macro({ label, value, sub, color }: { label: string; value: number; sub: string; color: string }) {
  return (
    <div>
      <div className="text-[11px] text-muted uppercase tracking-wide flex items-center justify-center gap-1.5">
        <span className="size-2 rounded-full" style={{ background: color }} />
        {label}
      </div>
      <div className="display text-2xl font-bold tnum mt-1">{value} g</div>
      <div className="text-[11px] text-faint">{sub}</div>
    </div>
  );
}
