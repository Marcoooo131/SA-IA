import { Ban, Check, KeyRound, Loader2, Mail, Plus, Save, Settings2, Shield, Tags, Trash2, UserPlus, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { DispatchConnection } from '../components/IntegrationSettings';
import { Avatar, ConfirmDialog, EmptyState, Modal, Toggle, displayName } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useTeam } from '../context/TeamContext';
import { useToast } from '../context/ToastContext';
import { adminUsers, deleteCategory, updateProfile, updateSettings, upsertCategory } from '../data/api';
import { listTimeZones } from '../lib/datetime';
import { isAdmin } from '../lib/permissions';
import { appBaseUrl } from '../lib/supabase';
import type { AppSettings, Category, Profile } from '../lib/types';

type Tab = 'users' | 'categories' | 'settings';

export function AdminPage() {
  const { profile } = useAuth();
  const [tab, setTab] = useState<Tab>('users');

  if (!isAdmin(profile)) {
    return (
      <div className="card">
        <EmptyState icon={<Shield className="h-6 w-6" />} title="Accès réservé aux administrateurs" />
      </div>
    );
  }

  const tabs = [
    { id: 'users' as const, label: 'Utilisateurs', icon: Users },
    { id: 'categories' as const, label: 'Catégories', icon: Tags },
    { id: 'settings' as const, label: 'Paramètres', icon: Settings2 },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Administration</h1>
        <p className="text-sm text-neutral-500">Comptes, droits, catégories et réglages de l'agenda.</p>
      </div>
      <div className="flex gap-1 overflow-x-auto rounded-xl bg-white p-1 shadow-sm ring-1 ring-neutral-200" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${tab === t.id ? 'bg-ink text-white' : 'text-neutral-600 hover:bg-neutral-100'}`}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'users' && <UsersTab />}
      {tab === 'categories' && <CategoriesTab />}
      {tab === 'settings' && <SettingsTab />}
    </div>
  );
}

// ------------------------------------------------------------------ utilisateurs
function UsersTab() {
  const { profile: me } = useAuth();
  const { profiles, reloadTeam } = useTeam();
  const toast = useToast();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Profile | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const patch = async (p: Profile, change: Parameters<typeof updateProfile>[1]) => {
    setBusyId(p.id);
    try {
      if (change.is_active !== undefined) {
        // Bloque aussi la connexion côté authentification (si la fonction admin-users est déployée)
        try {
          await adminUsers({ action: change.is_active ? 'unban' : 'ban', user_id: p.id });
        } catch {
          await updateProfile(p.id, change);
          toast.info("Compte mis à jour. Déployez la fonction « admin-users » pour bloquer aussi la connexion.");
        }
      } else {
        await updateProfile(p.id, change);
      }
      await reloadTeam();
      toast.success('Utilisateur mis à jour');
    } catch (e) {
      toast.error(e);
    } finally {
      setBusyId(null);
    }
  };

  const remove = async () => {
    if (!toDelete) return;
    setBusyId(toDelete.id);
    try {
      await adminUsers({ action: 'delete', user_id: toDelete.id });
      toast.success('Compte supprimé');
      setToDelete(null);
      await reloadTeam();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-neutral-100 p-4">
        <div className="flex-1">
          <h2 className="font-bold">Équipe ({profiles.length})</h2>
          <p className="text-xs text-neutral-500">
            Vous êtes le seul administrateur. Un compte créé hors de l'application reste « en attente » tant que vous ne l'activez pas.
          </p>
        </div>
        <button className="btn-primary" onClick={() => setInviteOpen(true)}>
          <UserPlus className="h-4 w-4" /> Ajouter un collaborateur
        </button>
      </div>
      <ul className="divide-y divide-neutral-100">
        {profiles.map((p) => {
          const self = p.id === me?.id || p.role === 'admin';
          return (
            <li key={p.id} className={`flex flex-col gap-3 p-4 lg:flex-row lg:items-center ${p.is_active ? '' : 'bg-neutral-50 opacity-70'}`}>
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <Avatar profile={p} />
                <div className="min-w-0">
                  <p className="truncate font-semibold">
                    {displayName(p)} {self && <span className="text-xs font-normal text-neutral-500">(vous)</span>}
                    {!p.is_active && <span className="ml-2 rounded bg-amber-100 px-1.5 text-xs font-medium text-amber-800">en attente / désactivé</span>}
                  </p>
                  <p className="truncate text-sm text-neutral-500">{p.email}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
                <span
                  className={`inline-flex w-32 justify-center rounded-full px-2.5 py-1 text-xs font-semibold ${p.role === 'admin' ? 'bg-ink text-white' : 'bg-neutral-100 text-neutral-700'}`}
                >
                  {p.role === 'admin' ? 'Administrateur' : 'Collaborateur'}
                </span>
                <Toggle
                  checked={p.role === 'admin' || p.can_edit_all}
                  disabled={p.role === 'admin' || busyId === p.id}
                  onChange={(v) => patch(p, { can_edit_all: v })}
                  label="Modifie tous les RDV"
                />
                <Toggle checked={p.is_active} disabled={self || busyId === p.id} onChange={(v) => patch(p, { is_active: v })} label={p.is_active ? 'Actif' : 'Activer'} />
                <button className="btn-icon hover:text-brand" disabled={self} onClick={() => setToDelete(p)} aria-label={`Supprimer ${displayName(p)}`} title="Supprimer le compte">
                  {busyId === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="border-t border-neutral-100 bg-neutral-50 p-4 text-xs text-neutral-600">
        <p>
          <strong>Collaborateur :</strong> consulte l'agenda, crée des rendez-vous, modifie ceux qu'il a créés ou dont il est responsable (ou tous, si
          « Modifie tous les RDV » est activé), commente. <strong>Administrateur (unique) :</strong> tous les droits, y compris la suppression et la
          configuration. La base refuse la création d'un second administrateur.
        </p>
      </div>
      <InviteModal open={inviteOpen} onClose={() => setInviteOpen(false)} onDone={reloadTeam} />
      <ConfirmDialog
        open={!!toDelete}
        title="Supprimer ce compte ?"
        message={
          <>
            Le compte de <strong>{displayName(toDelete)}</strong> sera définitivement supprimé. Ses rendez-vous restent dans l'agenda (sans responsable). Pour
            simplement couper l'accès, préférez « Actif ».
          </>
        }
        confirmLabel="Supprimer"
        danger
        busy={!!busyId}
        onConfirm={remove}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}

function InviteModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => Promise<void> }) {
  const toast = useToast();
  const [mode, setMode] = useState<'invite' | 'password'>('password');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setEmail('');
      setFullName('');
      setPassword('');
    }
  }, [open]);

  const submit = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return toast.warning('Adresse e-mail invalide');
    if (mode === 'password' && password.length < 8) return toast.warning('Mot de passe provisoire : 8 caractères minimum');
    setBusy(true);
    try {
      await adminUsers({
        action: 'invite',
        email: email.trim(),
        full_name: fullName.trim(),
        role: 'collaborator',
        password: mode === 'password' ? password : undefined,
        redirect_to: appBaseUrl(),
      });
      toast.success(mode === 'invite' ? `Invitation envoyée à ${email.trim()}` : `Compte créé pour ${email.trim()}`);
      await onDone();
      onClose();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title="Ajouter un collaborateur"
      footer={
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose} disabled={busy}>
            Annuler
          </button>
          <button className="btn-primary" onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === 'invite' ? <Mail className="h-4 w-4" /> : <Check className="h-4 w-4" />}
            {mode === 'invite' ? "Envoyer l'invitation" : 'Créer le compte'}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2 rounded-lg bg-neutral-100 p-1">
          <button className={`rounded-md px-3 py-2 text-sm font-semibold ${mode === 'password' ? 'bg-white shadow' : 'text-neutral-600'}`} onClick={() => setMode('password')}>
            <KeyRound className="mr-1 inline h-4 w-4" /> Mot de passe provisoire
          </button>
          <button className={`rounded-md px-3 py-2 text-sm font-semibold ${mode === 'invite' ? 'bg-white shadow' : 'text-neutral-600'}`} onClick={() => setMode('invite')}>
            <Mail className="mr-1 inline h-4 w-4" /> Invitation par e-mail
          </button>
        </div>
        <div>
          <label className="label">Nom complet</label>
          <input className="field" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Prénom Nom" autoComplete="off" />
        </div>
        <div>
          <label className="label">
            Adresse e-mail <span className="text-brand">*</span>
          </label>
          <input className="field" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="prenom.nom@entreprise.fr" autoComplete="off" />
        </div>
        {mode === 'password' && (
          <div>
            <label className="label">
              Mot de passe provisoire <span className="text-brand">*</span>
            </label>
            <input className="field" type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="8 caractères minimum" autoComplete="new-password" />
            <p className="mt-1 text-xs text-neutral-500">Communiquez-le de vive voix ; le collaborateur pourra le changer dans « Mon profil ».</p>
          </div>
        )}
        {mode === 'invite' && (
          <p className="rounded-lg bg-neutral-50 p-3 text-xs text-neutral-600">
            La personne reçoit un e-mail avec un lien pour choisir son mot de passe. Le service d'e-mail intégré de Supabase est limité à quelques envois par
            heure : pour une équipe importante, configurez un SMTP (voir le guide) ou utilisez le mot de passe provisoire.
          </p>
        )}
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ catégories
function CategoriesTab() {
  const { categories, reloadTeam } = useTeam();
  const toast = useToast();
  const [drafts, setDrafts] = useState<Record<string, Category>>({});
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#E30613');
  const [toDelete, setToDelete] = useState<Category | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => setDrafts(Object.fromEntries(categories.map((c) => [c.id, c]))), [categories]);

  const save = async (c: Category) => {
    if (!c.name.trim()) return toast.warning('Le nom est obligatoire');
    try {
      await upsertCategory({ id: c.id, name: c.name.trim(), color: c.color, is_active: c.is_active, position: c.position });
      await reloadTeam();
      toast.success('Catégorie enregistrée');
    } catch (e) {
      toast.error(e);
    }
  };

  const add = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    try {
      await upsertCategory({ name: newName.trim(), color: newColor, position: categories.length + 1 });
      setNewName('');
      await reloadTeam();
      toast.success('Catégorie ajoutée');
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!toDelete) return;
    setBusy(true);
    try {
      await deleteCategory(toDelete.id);
      await reloadTeam();
      setToDelete(null);
      toast.success('Catégorie supprimée');
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <div className="border-b border-neutral-100 p-4">
        <h2 className="font-bold">Catégories de rendez-vous</h2>
        <p className="text-xs text-neutral-500">Une catégorie désactivée n'est plus proposée mais reste affichée sur les anciens rendez-vous.</p>
      </div>
      <ul className="divide-y divide-neutral-100">
        {categories.map((c) => {
          const d = drafts[c.id] ?? c;
          const dirty = d.name !== c.name || d.color !== c.color || d.is_active !== c.is_active;
          return (
            <li key={c.id} className="flex flex-wrap items-center gap-3 p-4">
              <input
                type="color"
                value={d.color}
                onChange={(e) => setDrafts({ ...drafts, [c.id]: { ...d, color: e.target.value.toUpperCase() } })}
                className="h-10 w-12 cursor-pointer rounded-lg border border-neutral-300 bg-white p-1"
                aria-label="Couleur"
              />
              <input className="field min-w-40 flex-1" value={d.name} maxLength={60} onChange={(e) => setDrafts({ ...drafts, [c.id]: { ...d, name: e.target.value } })} aria-label="Nom" />
              <Toggle checked={d.is_active} onChange={(v) => setDrafts({ ...drafts, [c.id]: { ...d, is_active: v } })} label="Active" />
              <button className="btn-dark py-2" disabled={!dirty} onClick={() => save(d)}>
                <Save className="h-4 w-4" /> Enregistrer
              </button>
              <button className="btn-icon hover:text-brand" onClick={() => setToDelete(c)} aria-label={`Supprimer ${c.name}`}>
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center gap-3 border-t border-neutral-100 bg-neutral-50 p-4">
        <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value.toUpperCase())} className="h-10 w-12 cursor-pointer rounded-lg border border-neutral-300 bg-white p-1" aria-label="Couleur de la nouvelle catégorie" />
        <input className="field min-w-40 flex-1" placeholder="Nouvelle catégorie" value={newName} maxLength={60} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button className="btn-primary" onClick={add} disabled={busy || !newName.trim()}>
          <Plus className="h-4 w-4" /> Ajouter
        </button>
      </div>
      <ConfirmDialog
        open={!!toDelete}
        title="Supprimer la catégorie ?"
        message={<>Les rendez-vous de la catégorie « {toDelete?.name} » seront conservés, sans catégorie. Vous pouvez aussi simplement la désactiver.</>}
        confirmLabel="Supprimer"
        danger
        busy={busy}
        onConfirm={remove}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}

// ------------------------------------------------------------------ paramètres
function SettingsTab() {
  const { settings, reloadTeam } = useTeam();
  const toast = useToast();
  const [draft, setDraft] = useState<AppSettings | null>(settings);
  const [saving, setSaving] = useState(false);
  const zones = listTimeZones();

  useEffect(() => setDraft(settings), [settings]);
  if (!draft) return null;

  const set = <K extends keyof AppSettings>(k: K, v: AppSettings[K]) => setDraft({ ...draft, [k]: v });

  const save = async () => {
    if (draft.day_end <= draft.day_start) return toast.warning('La fin de journée doit être après le début.');
    setSaving(true);
    try {
      await updateSettings({
        organization_name: draft.organization_name.trim(),
        timezone: draft.timezone,
        day_start: draft.day_start.slice(0, 5),
        day_end: draft.day_end.slice(0, 5),
        default_duration_minutes: Number(draft.default_duration_minutes),
        collaborators_can_delete: draft.collaborators_can_delete,
      });
      await reloadTeam();
      toast.success('Paramètres enregistrés');
    } catch (e) {
      toast.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card space-y-5 p-4 md:p-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="label">Nom affiché</label>
          <input className="field" value={draft.organization_name} maxLength={80} onChange={(e) => set('organization_name', e.target.value)} />
        </div>
        <div>
          <label className="label">Fuseau horaire de l'équipe</label>
          <select className="field" value={draft.timezone} onChange={(e) => set('timezone', e.target.value)}>
            {zones.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-neutral-500">Chacun peut choisir un autre fuseau dans son profil. Les rendez-vous sont stockés en UTC.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Début de journée</label>
            <input type="time" className="field" value={draft.day_start.slice(0, 5)} onChange={(e) => set('day_start', e.target.value)} />
          </div>
          <div>
            <label className="label">Fin de journée</label>
            <input type="time" className="field" value={draft.day_end.slice(0, 5)} onChange={(e) => set('day_end', e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label">Durée par défaut d'un rendez-vous</label>
          <select className="field" value={draft.default_duration_minutes} onChange={(e) => set('default_duration_minutes', Number(e.target.value))}>
            {[15, 30, 45, 60, 90, 120, 180, 240].map((m) => (
              <option key={m} value={m}>
                {m < 60 ? `${m} min` : `${m / 60} h${m % 60 ? ` ${m % 60}` : ''}`}
              </option>
            ))}
          </select>
        </div>
      </div>
      <Toggle
        checked={draft.collaborators_can_delete}
        onChange={(v) => set('collaborators_can_delete', v)}
        label="Les collaborateurs peuvent supprimer les rendez-vous qu'ils ont créés"
        description="Sinon, seuls les administrateurs suppriment ; les collaborateurs peuvent passer un rendez-vous en « Annulé »."
      />
      <div className="flex justify-end">
        <button className="btn-primary" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Enregistrer
        </button>
      </div>
      <DispatchConnection />
      <div className="rounded-xl border border-dashed border-neutral-300 p-4 text-sm text-neutral-600">
        <p className="flex items-center gap-2 font-semibold text-ink">
          <Ban className="h-4 w-4 text-brand" /> Services payants non activés
        </p>
        <p className="mt-1">
          Rappels par e-mail ou SMS, synchronisation Google / Outlook : la base est prête (notifications internes, historique), mais aucun service externe
          n'est branché sans votre validation. Voir « Évolutions » dans le guide.
        </p>
      </div>
    </div>
  );
}
