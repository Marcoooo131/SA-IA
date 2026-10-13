import { useMemo, useState } from 'react';
import { Copy, FileText, FolderPlus, ImageUp, Map as MapIcon, PencilRuler, RotateCcw, Search, Sparkles, Trash2 } from 'lucide-react';
import { useEditor } from '@/state/editor';
import { useApp } from '@/state/store';
import type { DossierInfo, DossierStatus } from '@/domain/types';
import { HOUSING_TYPE_LABELS, STATUS_LABELS, STATUS_ORDER } from '@/domain/labels';
import { quoteForDossier } from '@/quote/compare';
import { formatDate, formatDateTime, formatEuro, formatMonthly } from '@/lib/format';
import { Badge, Button, Card, EmptyState, IconButton, Modal, Select, Stat, TextInput } from './kit';
import { DossierForm } from './DossierForm';
import { emptyDossier } from '@/demo/demoData';

const STATUS_TONE: Record<DossierStatus, 'slate' | 'blue' | 'amber' | 'violet' | 'green' | 'teal'> = {
  brouillon: 'slate',
  audit_en_cours: 'blue',
  audit_a_verifier: 'amber',
  devis_genere: 'violet',
  proposition_validee: 'green',
  cloture: 'teal',
};

export function StatusBadge({ status }: { status: DossierStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{STATUS_LABELS[status]}</Badge>;
}

type Intent = 'questionnaire' | 'dessin' | 'import';

function NewDossierDialog({ onClose, intent }: { onClose: () => void; intent: Intent }) {
  const createDossier = useApp((s) => s.createDossier);
  const openDossier = useApp((s) => s.openDossier);
  const dossiers = useApp((s) => s.dossiers);
  const [info, setInfo] = useState<DossierInfo>(() => {
    const d = emptyDossier('tmp', `MOV-${new Date().getFullYear()}-${String(dossiers.length + 1).padStart(4, '0')}`);
    return d.info;
  });
  const [error, setError] = useState<string | null>(null);
  const submit = () => {
    if (!info.reference.trim()) return setError('La référence est obligatoire.');
    if (dossiers.some((d) => d.info.reference.trim().toLowerCase() === info.reference.trim().toLowerCase()))
      return setError('Cette référence existe déjà.');
    if (!info.clientName.trim()) return setError('Le nom ou identifiant du client est obligatoire.');
    const id = createDossier({ ...info, createdAt: new Date().toISOString() });
    onClose();
    if (intent === 'questionnaire') {
      openDossier(id, 'questionnaire');
      return;
    }
    openDossier(id, 'plan');
    if (intent === 'dessin') useEditor.getState().setTool('room');
    else {
      useEditor.getState().set({ highlightImport: true });
      useApp.getState().toast('info', 'Cliquez sur « Importer un plan » (PNG, JPG, photo ou PDF) pour l’afficher en fond, puis définissez l’échelle.');
    }
  };
  return (
    <Modal
      title="Nouvel audit – création du dossier"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Annuler</Button>
          <Button variant="primary" onClick={submit}>
            {intent === 'questionnaire' ? 'Créer et répondre au questionnaire' : intent === 'import' ? 'Créer et importer le plan' : 'Créer et dessiner le plan'}
          </Button>
        </>
      }
    >
      <DossierForm info={info} onChange={(p) => setInfo((i) => ({ ...i, ...p }))} compact />
      {error && (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}

export function Dashboard() {
  const dossiers = useApp((s) => s.dossiers);
  const catalog = useApp((s) => s.catalog);
  const openDossier = useApp((s) => s.openDossier);
  const duplicate = useApp((s) => s.duplicateDossier);
  const remove = useApp((s) => s.deleteDossier);
  const setStatus = useApp((s) => s.setStatus);
  const resetDemo = useApp((s) => s.resetDemo);
  const toast = useApp((s) => s.toast);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<DossierStatus | 'tous'>('tous');
  const [creating, setCreating] = useState<Intent | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const rows = useMemo(
    () =>
      dossiers
        .map((d) => ({ d, q: quoteForDossier(d, catalog) }))
        .filter(({ d }) => {
          const q = query.trim().toLowerCase();
          const matches = !q || d.info.reference.toLowerCase().includes(q) || d.info.clientName.toLowerCase().includes(q);
          return matches && (statusFilter === 'tous' || d.status === statusFilter);
        })
        .sort((a, b) => b.d.updatedAt.localeCompare(a.d.updatedAt)),
    [dossiers, catalog, query, statusFilter],
  );

  const toVerify = dossiers.filter((d) => d.status === 'audit_a_verifier' || d.status === 'audit_en_cours').length;
  const quoted = dossiers.filter((d) => d.quotes.length > 0).length;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5 p-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Tableau de bord des audits</h1>
          <p className="text-sm text-slate-500">
            Données enregistrées localement dans ce navigateur (non partagées entre conseillers). Dossiers de démonstration fictifs.
          </p>
        </div>
        <div className="flex gap-2">
          <Button icon={<RotateCcw size={15} />} onClick={() => setConfirmReset(true)}>
            Réinitialiser la démo
          </Button>
          <Button variant="primary" icon={<FolderPlus size={15} />} onClick={() => setCreating('questionnaire')}>
            Nouvel audit
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3" data-testid="start-options">
        {(
          [
            ['questionnaire', <Sparkles key="q" size={22} />, 'Créer un plan avec le questionnaire', 'Recommandé : choisissez un modèle, répondez à quelques questions, le plan 2D et la maquette 3D sont générés.', true],
            ['dessin', <PencilRuler key="d" size={22} />, 'Dessiner mon logement en 2D', 'Tracez pièces, murs et ouvertures sur une grille magnétique.', false],
            ['import', <ImageUp key="i" size={22} />, 'Importer un plan ou une photo', 'PNG, JPG, photo ou PDF en fond de référence, à calibrer puis à retracer.', false],
          ] as [Intent, React.ReactNode, string, string, boolean][]
        ).map(([intent, icon, title, text, recommended]) => (
          <button
            key={intent}
            onClick={() => setCreating(intent)}
            className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-shadow hover:shadow-md ${recommended ? 'border-brand-500 bg-brand-50' : 'border-slate-200 bg-white'}`}
            data-testid={`start-${intent}`}
          >
            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${recommended ? 'bg-brand-700 text-white' : 'bg-slate-100 text-slate-600'}`}>{icon}</span>
            <span>
              <span className="flex items-center gap-2 font-semibold text-slate-900">
                {title}
                {recommended && <Badge tone="blue">Recommandé</Badge>}
              </span>
              <span className="mt-0.5 block text-xs text-slate-600">{text}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-4 gap-3">
        <Stat label="Dossiers" value={dossiers.length} />
        <Stat label="Audits en cours / à vérifier" value={toVerify} />
        <Stat label="Dossiers avec devis" value={quoted} />
        <Stat label="Propositions validées (démo)" value={dossiers.filter((d) => d.status === 'proposition_validee').length} />
      </div>

      <Card
        title="Dossiers"
        actions={
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-slate-400" />
              <TextInput
                placeholder="Rechercher une référence ou un client"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-72 pl-8"
                aria-label="Rechercher par référence"
              />
            </div>
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as DossierStatus | 'tous')} className="w-48" aria-label="Filtrer par statut">
              <option value="tous">Tous les statuts</option>
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          </div>
        }
        bodyClassName="p-0"
      >
        {rows.length === 0 ? (
          <EmptyState title="Aucun dossier ne correspond à la recherche." />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Référence</th>
                <th className="px-4 py-2 font-medium">Client / logement</th>
                <th className="px-4 py-2 font-medium">Statut</th>
                <th className="px-4 py-2 font-medium">Dernière modification</th>
                <th className="px-4 py-2 text-right font-medium">Initial estimé</th>
                <th className="px-4 py-2 text-right font-medium">Mensuel estimé</th>
                <th className="px-4 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ d, q }) => (
                <tr key={d.id} className="border-t border-slate-100 hover:bg-slate-50/60" data-testid={`dossier-row-${d.info.reference}`}>
                  <td className="px-4 py-2.5">
                    <button className="font-semibold text-brand-700 hover:underline" onClick={() => openDossier(d.id)}>
                      {d.info.reference}
                    </button>
                    <div className="text-[11px] text-slate-400">Créé le {formatDate(d.info.createdAt)}</div>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-slate-800">{d.info.clientName || '—'}</div>
                    <div className="text-xs text-slate-500">
                      {HOUSING_TYPE_LABELS[d.info.housingType]} · {d.plan.levels.length} niveau(x) · {d.devices.length} équipement(s) placé(s)
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <StatusBadge status={d.status} />
                      <select
                        aria-label={`Statut du dossier ${d.info.reference}`}
                        className="rounded border border-slate-200 bg-white px-1 py-0.5 text-xs text-slate-600"
                        value={d.status}
                        onChange={(e) => setStatus(e.target.value as DossierStatus, d.id)}
                      >
                        {STATUS_ORDER.map((s) => (
                          <option key={s} value={s}>
                            {STATUS_LABELS[s]}
                          </option>
                        ))}
                      </select>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{formatDateTime(d.updatedAt)}</td>
                  <td className="px-4 py-2.5 text-right font-medium tabular-nums">
                    {d.devices.length ? formatEuro(q.totals.initial) : '—'}
                    {d.devices.length > 0 && q.hasUnpricedItems && <div className="text-[11px] text-amber-700">+ à confirmer</div>}
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium tabular-nums">{d.devices.length ? formatMonthly(q.totals.monthly) : '—'}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" icon={<MapIcon size={13} />} onClick={() => openDossier(d.id, 'plan')}>
                        Plan
                      </Button>
                      <Button size="sm" icon={<FileText size={13} />} onClick={() => openDossier(d.id, 'devis')}>
                        Devis
                      </Button>
                      <IconButton
                        label="Dupliquer le dossier"
                        onClick={() => {
                          duplicate(d.id);
                          toast('success', `Dossier ${d.info.reference} dupliqué.`);
                        }}
                      >
                        <Copy size={15} />
                      </IconButton>
                      <IconButton label="Supprimer le dossier" onClick={() => setConfirmDelete(d.id)}>
                        <Trash2 size={15} />
                      </IconButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {creating && <NewDossierDialog intent={creating} onClose={() => setCreating(null)} />}
      {confirmDelete && (
        <Modal
          title="Supprimer le dossier ?"
          onClose={() => setConfirmDelete(null)}
          footer={
            <>
              <Button onClick={() => setConfirmDelete(null)}>Annuler</Button>
              <Button
                variant="danger"
                onClick={() => {
                  remove(confirmDelete);
                  setConfirmDelete(null);
                  toast('info', 'Dossier supprimé.');
                }}
              >
                Supprimer définitivement
              </Button>
            </>
          }
        >
          <p className="text-sm text-slate-600">Le dossier, son plan et ses devis seront supprimés de ce navigateur.</p>
        </Modal>
      )}
      {confirmReset && (
        <Modal
          title="Réinitialiser la démonstration ?"
          onClose={() => setConfirmReset(false)}
          footer={
            <>
              <Button onClick={() => setConfirmReset(false)}>Annuler</Button>
              <Button
                variant="danger"
                onClick={() => {
                  resetDemo();
                  setConfirmReset(false);
                  toast('success', 'Données de démonstration rechargées.');
                }}
              >
                Réinitialiser
              </Button>
            </>
          }
        >
          <p className="text-sm text-slate-600">
            Tous les dossiers et le catalogue enregistrés dans ce navigateur seront remplacés par les données de démonstration fictives.
          </p>
        </Modal>
      )}
    </div>
  );
}
