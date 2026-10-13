import { useMemo, useState } from 'react';
import { CheckCheck, Eye, Info, Wand2 } from 'lucide-react';
import { useApp, useActiveDossier } from '@/state/store';
import { useAudit } from '@/state/derived';
import { ALERT_STATUS_LABELS, alertCounts, type AlertStatus, type AuditAlert } from '@/rules/engine';
import { proposalBom } from '@/rules/apply';
import { computeQuote } from '@/quote/calculator';
import { CATEGORY_LABELS, MODE_LABELS } from '@/domain/labels';
import type { ProductCategory, ProtectionMode } from '@/domain/types';
import { formatArea, formatEuro, formatMonthly } from '@/lib/format';
import { Badge, Button, Card, cx } from '../kit';
import { STATUS_ICON } from './SummaryPanels';
import { CategoryDot } from './LeftPanels';

const CATS: ProductCategory[] = ['centrale', 'clavier', 'detecteur_mouvement', 'detecteur_choc', 'detecteur_fumee'];

function ModeComparison() {
  const dossier = useActiveDossier()!;
  const audit = useAudit(dossier)!;
  const catalog = useApp((s) => s.catalog);
  const apply = useApp((s) => s.applyModeProposal);
  const setMode = useApp((s) => s.setProtectionMode);
  const toast = useApp((s) => s.toast);
  const modes: ProtectionMode[] = ['volumetrique', 'perimetrique'];
  const priced = useMemo(
    () =>
      Object.fromEntries(
        modes.map((m) => [
          m,
          computeQuote(proposalBom(audit.proposals[m], catalog.products), { ...dossier.quoteDraft, adjustments: [], discountIds: [], moved: [], packTransferred: false, totalOverride: null }, catalog),
        ]),
      ) as Record<ProtectionMode, ReturnType<typeof computeQuote>>,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [audit, catalog, dossier.quoteDraft],
  );
  const packName = catalog.packs.find((p) => p.id === dossier.quoteDraft.packId)?.name ?? 'sans forfait';
  return (
    <Card title="Modes de protection : propositions du moteur de règles" actions={<span className="text-xs text-slate-500">Prix calculés avec : {packName}</span>}>
      <div className="grid grid-cols-2 gap-4">
        {modes.map((m) => {
          const p = audit.proposals[m];
          const q = priced[m];
          const active = dossier.protectionMode === m;
          return (
            <div key={m} className={cx('rounded-lg border p-4', active ? 'border-brand-500 ring-2 ring-brand-100' : 'border-slate-200')} data-testid={`mode-${m}`}>
              <div className="mb-2 flex items-center justify-between">
                <h4 className="font-semibold text-slate-800">
                  {m === 'volumetrique' ? 'Configuration standard' : 'Configuration alternative'} – {MODE_LABELS[m]}
                </h4>
                {active ? <Badge tone="blue">Mode retenu</Badge> : <button className="text-xs text-brand-600 hover:underline" onClick={() => setMode(m)}>Retenir ce mode</button>}
              </div>
              <ul className="mb-3 space-y-1 text-sm">
                {CATS.map((c) => (
                  <li key={c} className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <CategoryDot category={c} />
                      {CATEGORY_LABELS[c]}
                    </span>
                    <span className="font-semibold tabular-nums" data-testid={`count-${m}-${c}`}>
                      {p.counts[c] ?? 0}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mb-3 grid grid-cols-2 gap-2">
                <div className="rounded-md bg-slate-50 px-2 py-1.5">
                  <div className="text-[10px] text-slate-500 uppercase">Frais initiaux</div>
                  <div className="font-semibold tabular-nums">{formatEuro(q.totals.initial)}</div>
                </div>
                <div className="rounded-md bg-slate-50 px-2 py-1.5">
                  <div className="text-[10px] text-slate-500 uppercase">Mensuel</div>
                  <div className="font-semibold tabular-nums">{formatMonthly(q.totals.monthly)}</div>
                </div>
              </div>
              <div className="mb-3 space-y-1">
                {p.limits.map((l) => (
                  <p key={l} className="flex gap-1.5 text-[11px] text-slate-600">
                    <Info size={12} className="mt-0.5 shrink-0 text-slate-400" />
                    {l}
                  </p>
                ))}
              </div>
              <Button
                variant={active ? 'primary' : 'secondary'}
                icon={<Wand2 size={14} />}
                className="w-full"
                onClick={() => {
                  const delta = apply(m);
                  toast('success', `Proposition ${MODE_LABELS[m].toLowerCase()} appliquée sur le plan (${delta >= 0 ? '+' : ''}${delta} équipement(s)). Les équipements manuels et validés sont conservés.`);
                }}
              >
                Appliquer sur le plan
              </Button>
            </div>
          );
        })}
      </div>
      <table className="mt-4 w-full text-sm">
        <thead className="text-left text-xs text-slate-500">
          <tr>
            <th className="py-1 font-medium">Différences</th>
            <th className="py-1 text-right font-medium">Volumétrique</th>
            <th className="py-1 text-right font-medium">Périmétrique</th>
            <th className="py-1 text-right font-medium">Écart</th>
          </tr>
        </thead>
        <tbody>
          {CATS.map((c) => {
            const a = audit.proposals.volumetrique.counts[c] ?? 0;
            const b = audit.proposals.perimetrique.counts[c] ?? 0;
            return (
              <tr key={c} className="border-t border-slate-100">
                <td className="py-1">{CATEGORY_LABELS[c]}</td>
                <td className="py-1 text-right tabular-nums">{a}</td>
                <td className="py-1 text-right tabular-nums">{b}</td>
                <td className={cx('py-1 text-right tabular-nums', b - a > 0 ? 'text-amber-700' : b - a < 0 ? 'text-emerald-700' : 'text-slate-400')}>{b - a > 0 ? `+${b - a}` : b - a}</td>
              </tr>
            );
          })}
          <tr className="border-t border-slate-200 font-semibold">
            <td className="py-1">Frais initiaux / mensuel</td>
            <td className="py-1 text-right tabular-nums">
              {formatEuro(priced.volumetrique.totals.initial)} · {formatMonthly(priced.volumetrique.totals.monthly)}
            </td>
            <td className="py-1 text-right tabular-nums">
              {formatEuro(priced.perimetrique.totals.initial)} · {formatMonthly(priced.perimetrique.totals.monthly)}
            </td>
            <td className="py-1 text-right tabular-nums">{formatEuro(priced.perimetrique.totals.initial - priced.volumetrique.totals.initial)}</td>
          </tr>
        </tbody>
      </table>
    </Card>
  );
}

/** Synthèse des menuiseries par pièce, issue du même modèle que le plan et le tableau. */
function JoinerySummary() {
  const dossier = useActiveDossier()!;
  const audit = useAudit(dossier)!;
  const setTab = useApp((s) => s.setTab);
  const lines = audit.rooms.filter((r) => r.counts.total > 0);
  const detectors = lines.reduce((n, r) => n + r.calc.detectors, 0);
  const pending = lines.reduce((n, r) => n + r.counts.aPositionner, 0);
  return (
    <Card
      title="Menuiseries par pièce (détecteurs de choc et d'ouverture indicatifs)"
      actions={
        <button className="text-xs text-brand-600 hover:underline" onClick={() => setTab('menuiseries')}>
          Modifier les menuiseries
        </button>
      }
    >
      {lines.length === 0 ? (
        <p className="text-sm text-slate-500">Aucune menuiserie renseignée.</p>
      ) : (
        <div data-testid="audit-joinery">
          <ul className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-slate-700">
            {lines.map((r) => (
              <li key={r.roomId} className="flex justify-between gap-2">
                <span>
                  <span className="text-slate-400">{r.levelName} · </span>
                  {r.calc.explanation}
                </span>
                {r.counts.aPositionner > 0 && <Badge tone="amber">{r.counts.aPositionner} à positionner</Badge>}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm font-semibold text-slate-800">
            Total : <span data-testid="audit-joinery-detectors">{detectors}</span> détecteur(s) indicatif(s) pour {lines.reduce((n, r) => n + r.counts.total, 0)} menuiserie(s)
            {pending > 0 ? `, dont ${pending} à positionner sur le plan` : ''}.
          </p>
        </div>
      )}
    </Card>
  );
}

function AlertRow({ alert }: { alert: AuditAlert }) {
  const validate = useApp((s) => s.validateAlert);
  const unvalidate = useApp((s) => s.unvalidateAlert);
  const setTab = useApp((s) => s.setTab);
  const select = useApp((s) => s.select);
  const setLevel = useApp((s) => s.setActiveLevel);
  const [note, setNote] = useState('');
  const [editing, setEditing] = useState(false);
  const goto = () => {
    if (alert.levelId) setLevel(alert.levelId);
    if (alert.target?.kind === 'room') select({ kind: 'room', id: alert.target.id });
    if (alert.target?.kind === 'opening') select({ kind: 'opening', id: alert.target.id });
    setTab(alert.target?.kind === 'dossier' ? 'logement' : 'plan');
  };
  return (
    <li className="flex gap-3 px-4 py-3" data-testid={`alert-${alert.id}`}>
      <div className="pt-0.5">{STATUS_ICON[alert.status]}</div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-slate-800">{alert.title}</span>
          <Badge tone={alert.status === 'manquant' ? 'red' : alert.status === 'a_verifier' ? 'amber' : alert.status === 'suggestion' ? 'blue' : 'green'}>{ALERT_STATUS_LABELS[alert.status]}</Badge>
          {alert.mode && <Badge>{MODE_LABELS[alert.mode]}</Badge>}
          <span className="text-[10px] text-slate-400">{alert.ruleId}</span>
        </div>
        <p className="text-sm text-slate-600">
          <span className="text-slate-400">Motif : </span>
          {alert.reason}
        </p>
        <p className="text-sm text-slate-700">
          <span className="text-slate-400">Action recommandée : </span>
          {alert.nextAction}
        </p>
        {alert.status === 'valide' && alert.validationNote && <p className="text-xs text-emerald-700">Note du conseiller : {alert.validationNote}</p>}
        {editing && (
          <div className="mt-2 flex gap-2">
            <input className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm" placeholder="Justification (facultatif)" value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
            <Button
              size="sm"
              variant="success"
              onClick={() => {
                validate(alert.id, note);
                setEditing(false);
              }}
            >
              Confirmer
            </Button>
            <Button size="sm" onClick={() => setEditing(false)}>
              Annuler
            </Button>
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-start gap-1">
        {(alert.levelId || alert.target) && (
          <Button size="sm" variant="ghost" icon={<Eye size={13} />} onClick={goto}>
            Voir
          </Button>
        )}
        {alert.status === 'valide' ? (
          <Button size="sm" onClick={() => unvalidate(alert.id)}>
            Rouvrir
          </Button>
        ) : (
          !editing && (
            <Button size="sm" variant="secondary" icon={<CheckCheck size={13} />} onClick={() => setEditing(true)}>
              Valider
            </Button>
          )
        )}
      </div>
    </li>
  );
}

export function AuditTab() {
  const dossier = useActiveDossier();
  const audit = useAudit(dossier);
  const validateSuggested = useApp((s) => s.validateSuggestedDevices);
  const setStatus = useApp((s) => s.setStatus);
  const toast = useApp((s) => s.toast);
  const [filter, setFilter] = useState<AlertStatus | 'tous' | 'ouverts'>('ouverts');
  if (!dossier || !audit) return null;
  const counts = alertCounts(audit.alerts);
  const order: AlertStatus[] = ['manquant', 'a_verifier', 'suggestion', 'valide'];
  const list = audit.alerts
    .filter((a) => (filter === 'tous' ? true : filter === 'ouverts' ? a.status !== 'valide' : a.status === filter))
    .sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));
  const pendingSuggested = dossier.devices.filter((d) => d.origin === 'suggere' && !d.validated).length;
  return (
    <div className="scroll-thin h-full overflow-auto">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 p-6">
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm text-blue-900">
          Aide à la préparation de l'audit, pas une certification de sécurité. Les règles appliquées sont des hypothèses de configuration à valider par le
          responsable métier ; les exigences applicables et préconisations des fabricants doivent être vérifiées indépendamment.
        </div>
        <ModeComparison />
        <JoinerySummary />
        <div className="grid grid-cols-3 gap-5">
          <Card
            title="Points d'audit"
            className="col-span-2"
            bodyClassName="p-0"
            actions={
              <div className="flex gap-1">
                {(['ouverts', 'manquant', 'a_verifier', 'suggestion', 'valide', 'tous'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={cx('rounded-full px-2 py-0.5 text-xs', filter === f ? 'bg-brand-700 text-white' : 'text-slate-600 hover:bg-slate-100')}
                  >
                    {f === 'ouverts' ? 'À traiter' : f === 'tous' ? 'Tous' : ALERT_STATUS_LABELS[f]} {f in counts ? `(${counts[f as AlertStatus]})` : ''}
                  </button>
                ))}
              </div>
            }
          >
            {list.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-500">Aucun point dans cette catégorie.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {list.map((a) => (
                  <AlertRow key={a.id} alert={a} />
                ))}
              </ul>
            )}
          </Card>
          <div className="flex flex-col gap-5">
            <Card title="Inventaire par niveau">
              {audit.inventory.levels.map((l) => (
                <div key={l.levelId} className="mb-2 rounded-md bg-slate-50 p-2 text-xs">
                  <div className="font-semibold text-slate-700">{l.name}</div>
                  <div className="text-slate-600">
                    {l.rooms} pièce(s) · {formatArea(l.area)} (dont {formatArea(l.habitableArea)} retenus pour la fumée)
                  </div>
                  <div className="text-slate-600">
                    {l.exteriorOpenings} ouverture(s) extérieure(s) · fumée : {l.smokeEstimate} estimé(s)
                  </div>
                </div>
              ))}
            </Card>
            <Card title="Confirmation de la proposition">
              <p className="mb-3 text-sm text-slate-600">
                {pendingSuggested} suggestion(s) non validée(s) sur le plan. Ajustez les quantités dans l'onglet Équipements, puis confirmez.
              </p>
              <div className="flex flex-col gap-2">
                <Button
                  variant="success"
                  icon={<CheckCheck size={14} />}
                  disabled={!pendingSuggested}
                  onClick={() => {
                    validateSuggested();
                    toast('success', 'Suggestions validées par le conseiller.');
                  }}
                >
                  Valider les suggestions placées
                </Button>
                <Button
                  onClick={() => {
                    const open = counts.manquant + counts.a_verifier;
                    setStatus(open ? 'audit_a_verifier' : 'audit_en_cours');
                    toast('info', open ? `Dossier marqué « audit à vérifier » (${open} point(s) ouverts).` : 'Audit complet.');
                  }}
                >
                  Mettre à jour le statut du dossier
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
