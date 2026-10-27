import { useId, useState, type CSSProperties, type ReactNode } from 'react';
import { ArrowRight, Check, CircleHelp, RefreshCw, TriangleAlert, Users, X } from 'lucide-react';
import {
  administratif,
  changes,
  cover,
  day,
  prioExample,
  questions,
  resiliation,
  roles,
  rolesMessage,
  rotation,
  slides,
  takeovers,
  templateById,
  templates,
  templatesOverview,
  together,
  workload,
  type SlideMeta,
  type Template,
} from './content';
import { Icon } from './icons';

export type SlideProps = {
  meta: SlideMeta;
  goTo: (id: string) => void;
};

// Décalage d'animation : chaque élément « reveal » apparaît après le précédent.
const delay = (i: number): CSSProperties => ({ '--i': i }) as CSSProperties;

function Frame({ meta, children, className = '' }: { meta: SlideMeta; children: ReactNode; className?: string }) {
  return (
    <section className={`slide slide--${meta.theme} slide-${meta.id} ${className}`} aria-label={meta.title}>
      <header className="slide-head reveal" style={delay(0)}>
        <span className="kicker">{meta.kicker}</span>
        <h2>{meta.title}</h2>
      </header>
      <div className="slide-body">{children}</div>
    </section>
  );
}

function TemplateForm({ template, compact = false }: { template: Template; compact?: boolean }) {
  return (
    <div className={`form-card ${compact ? 'form-card--compact' : ''}`}>
      <div className="form-card__head">
        <span className="form-card__num">{template.number}</span>
        <Icon name={template.icon} size={26} />
        <span>{template.name}</span>
      </div>
      <ol className="form-card__fields">
        {template.fields.map((field) => (
          <li key={field}>
            <span className="field-box" aria-hidden="true" />
            {field}
          </li>
        ))}
      </ol>
    </div>
  );
}

// ── 1. Couverture ────────────────────────────────────────────────
function CoverSlide({ meta }: SlideProps) {
  return (
    <section className={`slide slide--dark slide-${meta.id}`} aria-label={meta.title}>
      <div className="cover-stripes" aria-hidden="true" />
      <div className="cover-content">
        <span className="kicker reveal" style={delay(0)}>
          {cover.kicker}
        </span>
        <h1 className="reveal" style={delay(1)}>
          Nouvelle organisation <span className="accent">Movers</span>
        </h1>
        <p className="cover-subtitle reveal" style={delay(2)}>
          {cover.subtitle}
        </p>
        <ul className="cover-pillars">
          {cover.pillars.map((pillar, i) => (
            <li key={pillar.label} className="reveal" style={delay(3 + i)}>
              <Icon name={pillar.icon} size={30} />
              <span>{pillar.label}</span>
            </li>
          ))}
        </ul>
        <p className="cover-footer reveal" style={delay(6)}>
          <Users size={22} aria-hidden="true" /> {cover.footer}
        </p>
      </div>
    </section>
  );
}

// ── 2. La journée ────────────────────────────────────────────────
function Timeline({ label, blocks, special = false }: { label: string; blocks: typeof day.usual.blocks | typeof day.special.blocks; special?: boolean }) {
  return (
    <div className={`timeline ${special ? 'timeline--special' : ''}`}>
      <span className="timeline__label">{label}</span>
      <div className="timeline__bar">
        {blocks.map((block) => (
          <div key={block.kind} className={`timeline__block timeline__block--${block.kind}`} style={{ flexGrow: block.hours }}>
            <strong>{block.hours} h</strong>
            <span>
              {block.title}
              <small>{block.subtitle}</small>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DaySlide(props: SlideProps) {
  return (
    <Frame meta={props.meta}>
      <p className="lead reveal" style={delay(1)}>
        {day.intro}
      </p>
      <div className="timelines reveal" style={delay(2)}>
        <Timeline label={day.usual.label} blocks={day.usual.blocks} />
        <Timeline label={day.special.label} blocks={day.special.blocks} special />
        <p className="note">{day.planningNote}</p>
      </div>
      <div className="activities">
        {day.activities.map((activity, i) => (
          <div key={activity.kind} className={`activity activity--${activity.kind} reveal`} style={delay(3 + i)}>
            <div className="activity__title">
              <Icon name={activity.icon} size={30} />
              {activity.title}
            </div>
            <ol className="activity__steps">
              {activity.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </Frame>
  );
}

// ── 3. Qui fait quoi ─────────────────────────────────────────────
function RolesSlide(props: SlideProps) {
  return (
    <Frame meta={props.meta}>
      <div className="roles">
        {roles.map((role, i) => (
          <article key={role.count} className={`role ${i < 2 ? 'role--team' : 'role--lead'} reveal`} style={delay(1 + i)}>
            <div className="role__icon">
              <Icon name={role.icon} size={34} />
            </div>
            <h3>{role.count}</h3>
            <span className="role__tag">{role.title}</span>
            <ul>
              {role.tasks.map((task) => (
                <li key={task}>
                  <Check size={18} aria-hidden="true" />
                  {task}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
      <p className="banner reveal" style={delay(5)}>
        <Users size={26} aria-hidden="true" />
        {rolesMessage}
      </p>
    </Frame>
  );
}

// ── 4. Les cinq templates ────────────────────────────────────────
const templateSlide: Record<string, string> = {
  prio: 'prio',
  resiliation: 'resiliation',
  'resiliation-exception': 'resiliation',
  takeovers: 'takeovers',
  administratif: 'administratif',
};

function TemplatesSlide(props: SlideProps) {
  return (
    <Frame meta={props.meta}>
      <p className="lead reveal" style={delay(1)}>
        {templatesOverview.rule}
      </p>
      <div className="template-cards">
        {templates.map((template, i) => (
          <button
            key={template.id}
            type="button"
            className={`template-card ${template.id === 'prio' ? 'template-card--prio' : ''} reveal`}
            style={delay(2 + i)}
            onClick={() => props.goTo(templateSlide[template.id])}
            title={`Voir le template ${template.name}`}
          >
            <span className="template-card__num">{template.number}</span>
            <Icon name={template.icon} size={40} />
            <span className="template-card__name">{template.name}</span>
            <span className="template-card__count">{template.fields.length} champs</span>
          </button>
        ))}
      </div>
      <h3 className="section-label reveal" style={delay(7)}>
        {templatesOverview.goalsTitle}
      </h3>
      <ul className="goals reveal" style={delay(8)}>
        {templatesOverview.goals.map((goal) => (
          <li key={goal.label}>
            <Icon name={goal.icon} size={26} />
            <span>{goal.label}</span>
          </li>
        ))}
      </ul>
    </Frame>
  );
}

// ── 5. PRIO / Déménagement ───────────────────────────────────────
function PrioSlide(props: SlideProps) {
  return (
    <Frame meta={props.meta}>
      <div className="two-cols two-cols--form">
        <div className="reveal" style={delay(1)}>
          <TemplateForm template={templateById('prio')} />
        </div>
        <div className="example reveal" style={delay(2)}>
          <div className="crm-window">
            <div className="crm-window__bar">
              <span className="dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              CRM · Nouvelle tâche
              <span className="badge">Exemple fictif</span>
            </div>
            <div className="crm-window__title">
              <span className="pill pill--red">PRIO</span> Movers / Déménagement
            </div>
            <dl className="crm-window__rows">
              {prioExample.values.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="avoid">
            <X size={20} aria-hidden="true" />
            <span>
              <strong>À éviter&nbsp;:</strong> {prioExample.avoid}
            </span>
          </div>
        </div>
      </div>
      <p className="banner banner--red reveal" style={delay(3)}>
        <ArrowRight size={26} aria-hidden="true" />
        {prioExample.message}
      </p>
    </Frame>
  );
}

// ── 6. Résiliation / Résiliation Exception ───────────────────────
function ResiliationSlide(props: SlideProps) {
  return (
    <Frame meta={props.meta}>
      <div className="side-by-side">
        <div className="reveal" style={delay(1)}>
          <TemplateForm template={templateById('resiliation')} compact />
        </div>
        <div className="equal reveal" style={delay(2)}>
          <span className="equal__sign">=</span>
          <span>{resiliation.sameFields}</span>
        </div>
        <div className="reveal" style={delay(3)}>
          <TemplateForm template={templateById('resiliation-exception')} compact />
        </div>
      </div>
      <div className="callouts reveal" style={delay(4)}>
        <p className="banner banner--red">
          <TriangleAlert size={26} aria-hidden="true" />
          {resiliation.rule}
        </p>
        <p className="banner">
          <CircleHelp size={26} aria-hidden="true" />
          {resiliation.doubt}
        </p>
      </div>
    </Frame>
  );
}

// ── 7. Takeovers ─────────────────────────────────────────────────
function TakeoversSlide(props: SlideProps) {
  const template = templateById('takeovers');
  return (
    <Frame meta={props.meta}>
      <div className="takeovers">
        <div className="takeovers__intro reveal" style={delay(1)}>
          <Icon name={template.icon} size={64} />
          <strong>{template.fields.length} champs</strong>
          <span>à renseigner pour chaque dossier Takeovers</span>
        </div>
        <div className="field-groups">
          {takeovers.groups.map((group, i) => (
            <div key={group.label} className="field-group reveal" style={delay(2 + i)}>
              <span className="field-group__label">{group.label}</span>
              <ul>
                {group.fields.map((field) => (
                  <li key={field}>
                    <span className="field-box" aria-hidden="true" />
                    {field}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <p className="banner banner--red reveal" style={delay(6)}>
        <ArrowRight size={26} aria-hidden="true" />
        {takeovers.message}
      </p>
    </Frame>
  );
}

// ── 8. Administratif ─────────────────────────────────────────────
function AdministratifSlide(props: SlideProps) {
  return (
    <Frame meta={props.meta}>
      <div className="admin">
        <div className="reveal" style={delay(1)}>
          <TemplateForm template={templateById('administratif')} compact />
        </div>
        <div className="admin__right">
          <div className="essentials">
            {administratif.essentials.map((item, i) => (
              <div key={item.title} className="essential reveal" style={delay(2 + i)}>
                <span className="essential__num">{i + 1}</span>
                <div>
                  <strong>{item.title}</strong>
                  <span>{item.text}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="before-after reveal" style={delay(4)}>
            <div className="before">
              <span className="ba-label">
                <X size={18} aria-hidden="true" /> {administratif.before.label}
              </span>
              <p>{administratif.before.text}</p>
            </div>
            <ArrowRight className="ba-arrow" size={34} aria-hidden="true" />
            <div className="after">
              <span className="ba-label">
                <Check size={18} aria-hidden="true" /> {administratif.after.label}
              </span>
              <dl>
                {administratif.after.lines.map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <span className="badge badge--corner">{administratif.exampleNote}</span>
          </div>
        </div>
      </div>
      <p className="banner banner--red reveal" style={delay(5)}>
        <ArrowRight size={26} aria-hidden="true" />
        {administratif.key}
      </p>
    </Frame>
  );
}

// ── 9. Rotation ──────────────────────────────────────────────────
function RotationSlide(props: SlideProps) {
  // Étape mise en avant : 0 à 3 = catégories, 4 = nouveau cycle.
  const [active, setActive] = useState(0);
  // Identifiant unique : la diapositive est aussi rendue en vignette dans le sommaire.
  const arrowId = useId();
  const total = rotation.steps.length + 1;
  return (
    <Frame meta={props.meta}>
      <div className="rotation">
        <div className="cycle reveal" style={delay(1)}>
          <svg className="cycle__ring" viewBox="0 0 400 400" aria-hidden="true">
            <defs>
              <marker id={arrowId} viewBox="0 0 10 10" markerWidth="4" markerHeight="4" refX="5" refY="5" orient="auto">
                <path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
              </marker>
            </defs>
            {[0, 1, 2, 3].map((q) => {
              // Quatre arcs entre les positions haut → droite → bas → gauche, avec une marge autour des pastilles.
              const start = -90 + q * 90 + 20;
              const end = -90 + (q + 1) * 90 - 20;
              const r = 160;
              const p = (deg: number) => [200 + r * Math.cos((deg * Math.PI) / 180), 200 + r * Math.sin((deg * Math.PI) / 180)];
              const [x1, y1] = p(start);
              const [x2, y2] = p(end);
              return (
                <path
                  key={q}
                  d={`M${x1},${y1} A${r},${r} 0 0 1 ${x2},${y2}`}
                  className={q === active || (active === 4 && q === 3) ? 'arc arc--on' : 'arc'}
                  markerEnd={`url(#${arrowId})`}
                />
              );
            })}
          </svg>
          {rotation.steps.map((step, i) => (
            <button
              key={step}
              type="button"
              className={`cycle__node cycle__node--${i} ${active === i ? 'is-active' : ''}`}
              onClick={() => setActive(i)}
              aria-pressed={active === i}
            >
              <span className="cycle__num">{i + 1}</span>
              {step}
            </button>
          ))}
          <button
            type="button"
            className={`cycle__center ${active === 4 ? 'is-active' : ''}`}
            onClick={() => setActive(4)}
            aria-pressed={active === 4}
          >
            <RefreshCw size={34} aria-hidden="true" />
            <span>
              <span className="cycle__num">5</span> {rotation.restart}
            </span>
          </button>
        </div>
        <div className="rotation__side">
          <p className="lead reveal" style={delay(2)}>
            {rotation.purpose}
          </p>
          <ol className="rotation__list reveal" style={delay(3)}>
            {rotation.steps.map((step, i) => (
              <li key={step} className={active === i ? 'is-active' : ''}>
                <span className="cycle__num">{i + 1}</span>
                {step}
              </li>
            ))}
            <li className={active === 4 ? 'is-active' : ''}>
              <span className="cycle__num">5</span>
              {rotation.restart}&nbsp;: retour au déménagement
            </li>
          </ol>
          <button type="button" className="step-button reveal" style={delay(4)} onClick={() => setActive((active + 1) % total)}>
            Étape suivante <ArrowRight size={20} aria-hidden="true" />
          </button>
          <div className="now-later reveal" style={delay(5)}>
            <div>
              <span className="pill pill--red">{rotation.now.label}</span>
              <p>{rotation.now.text}</p>
            </div>
            <ArrowRight size={28} aria-hidden="true" />
            <div>
              <span className="pill pill--outline">{rotation.later.label}</span>
              <p>{rotation.later.text}</p>
            </div>
          </div>
        </div>
      </div>
    </Frame>
  );
}

// ── 10. Charge de travail ────────────────────────────────────────
function WorkloadSlide(props: SlideProps) {
  return (
    <Frame meta={props.meta}>
      <p className="lead reveal" style={delay(1)}>
        {workload.intro}
      </p>
      <div className="rules">
        {workload.rules.map((rule, i) => (
          <article key={rule.situation} className="rule reveal" style={delay(2 + i)}>
            <div className="rule__top">
              <Icon name={rule.icon} size={34} />
              <div>
                <span className="rule__label">En cas de</span>
                <h3>{rule.situation}</h3>
              </div>
            </div>
            <div className="rule__effect">
              <ArrowRight size={22} aria-hidden="true" />
              <p>{rule.effect}</p>
            </div>
          </article>
        ))}
      </div>
      <div className="goals-band reveal" style={delay(5)}>
        <strong>{workload.goalsTitle}</strong>
        <ul>
          {workload.goals.map((goal) => (
            <li key={goal}>
              <Check size={22} aria-hidden="true" />
              {goal}
            </li>
          ))}
        </ul>
      </div>
    </Frame>
  );
}

// ── 11. Ce qui change ────────────────────────────────────────────
function ChangesSlide(props: SlideProps) {
  return (
    <Frame meta={props.meta}>
      <div className="changes" role="table" aria-label={props.meta.title}>
        {changes.columns.map((column, i) => (
          <div key={column.title} className={`changes__col changes__col--${column.tone} reveal`} style={delay(1 + i)} role="rowgroup">
            <div className="changes__head" role="row">
              <Icon name={column.icon} size={30} />
              <div role="columnheader">
                <h3>{column.title}</h3>
                <span className="changes__tag">{column.tag}</span>
              </div>
            </div>
            <ul>
              {column.items.map((item) => (
                <li key={item} role="cell">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Frame>
  );
}

// ── 12. On avance ensemble ───────────────────────────────────────
function TogetherSlide(props: SlideProps) {
  return (
    <Frame meta={props.meta}>
      <div className="together">
        <blockquote className="reveal" style={delay(1)}>
          {together.quote}
        </blockquote>
        <div className="reflexes">
          <h3 className="reveal" style={delay(2)}>
            {together.reflexesTitle}
          </h3>
          <ol>
            {together.reflexes.map((reflex, i) => (
              <li key={reflex} className="reveal" style={delay(3 + i)}>
                <span className="reflex__num">{i + 1}</span>
                {reflex}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </Frame>
  );
}

// ── 13. Questions ────────────────────────────────────────────────
function QuestionsSlide({ meta, goTo }: SlideProps) {
  const topics = slides.filter((s) => s.id !== 'cover' && s.id !== 'questions');
  return (
    <section className={`slide slide--dark slide-${meta.id}`} aria-label={meta.title}>
      <div className="questions">
        <span className="questions__mark reveal" style={delay(0)} aria-hidden="true">
          ?
        </span>
        <div>
          <h2 className="reveal" style={delay(1)}>
            {questions.title}
          </h2>
          <p className="questions__subtitle reveal" style={delay(2)}>
            {questions.subtitle}
          </p>
          <span className="kicker reveal" style={delay(3)}>
            {questions.revisit}
          </span>
          <ul className="topics reveal" style={delay(4)}>
            {topics.map((topic) => (
              <li key={topic.id}>
                <button type="button" onClick={() => goTo(topic.id)}>
                  {topic.title}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

const registry: Record<string, (props: SlideProps) => ReactNode> = {
  cover: CoverSlide,
  day: DaySlide,
  roles: RolesSlide,
  templates: TemplatesSlide,
  prio: PrioSlide,
  resiliation: ResiliationSlide,
  takeovers: TakeoversSlide,
  administratif: AdministratifSlide,
  rotation: RotationSlide,
  workload: WorkloadSlide,
  changes: ChangesSlide,
  together: TogetherSlide,
  questions: QuestionsSlide,
};

export function Slide(props: SlideProps) {
  const Component = registry[props.meta.id];
  if (!Component) throw new Error(`Diapositive inconnue : ${props.meta.id}`);
  return <Component {...props} />;
}
