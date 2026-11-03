import { useRef, useState } from 'react';
import { Bell, Cloud, Download, LogOut, RefreshCw, Shield, Sparkles, Trash2, Upload, User } from 'lucide-react';
import type { ActivityLevel, AppData, GoalType, Preferences, Profile, Sex } from '../lib/types';
import { Badge, Button, Card, Field, Notice, NumberInput, PageHeader, SectionTitle, Segmented, Toggle } from '../components/ui';
import { useCtx, useToday } from '../lib/useCtx';
import { COLLECTIONS, emptyData, store, useStore } from '../lib/store/store';
import { ACTIVITY_LEVELS } from '../lib/calc/metabolism';
import { ageFromBirthDate, formatDate, today } from '../lib/dates';
import { recomputeNutritionGoal } from '../lib/actions';
import { buildDemoData } from '../data/demo';
import { confirmDialog } from '../components/confirm';
import { toast } from '../components/toast';
import { configError, isSupabaseConfigured, supabase } from '../lib/sync/supabase';
import { deleteRemoteAccount, signOut, syncNow, useSyncStatus, useSyncStore } from '../lib/sync/sync';
import { navigate } from '../lib/router';
import { REST_OPTIONS } from './training/restOptions';
import { persistenceAvailable } from '../lib/db/idb';

export default function ProfilePage() {
  const ctx = useCtx();
  const t = useToday();
  const p = ctx.data.profile!;
  const ws = useStore((s) => s.workspace);
  const [draft, setDraft] = useState<Profile>(p);
  const dirty = JSON.stringify({ ...draft, updatedAt: '', preferences: null }) !== JSON.stringify({ ...p, updatedAt: '', preferences: null });
  const setPref = (patch: Partial<Preferences>) => store().saveProfile({ ...p, preferences: { ...p.preferences, ...patch } });
  const validProfile = draft.heightCm >= 120 && draft.heightCm <= 230 && draft.targetWeightKg >= 30 && draft.targetWeightKg <= 300 && ageFromBirthDate(draft.birthDate) >= 14;

  const saveProfile = async () => {
    const changedCalc = draft.sex !== p.sex || draft.birthDate !== p.birthDate || draft.heightCm !== p.heightCm || draft.activityLevel !== p.activityLevel || draft.goal !== p.goal;
    store().saveProfile(draft);
    toast('Profil enregistré');
    if (changedCalc && (await confirmDialog({ title: 'Recalculer tes objectifs nutritionnels ?', text: 'Ton métabolisme, ta dépense et tes calories cibles seront mis à jour avec ces nouvelles informations.', confirmLabel: 'Recalculer' }))) {
      recomputeNutritionGoal({});
      toast('Objectifs recalculés');
    }
  };

  return (
    <div>
      <PageHeader title="Profil" subtitle={`${p.displayName} · membre depuis le ${formatDate(p.createdAt.slice(0, 10), { day: 'numeric', month: 'long', year: 'numeric' })}`} />
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <section>
            <SectionTitle>
              <span className="flex items-center gap-2">
                <User size={18} className="text-accent" /> Informations
              </span>
            </SectionTitle>
            <Card className="space-y-4">
              <Field label="Prénom ou pseudo">
                <input className="field" value={draft.displayName} onChange={(e) => setDraft({ ...draft, displayName: e.target.value })} maxLength={40} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Sexe (calcul métabolique)">
                  <select className="field" value={draft.sex} onChange={(e) => setDraft({ ...draft, sex: e.target.value as Sex })}>
                    <option value="male">Homme</option>
                    <option value="female">Femme</option>
                  </select>
                </Field>
                <Field label="Date de naissance" hint={`${ageFromBirthDate(draft.birthDate)} ans`}>
                  <input type="date" className="field" value={draft.birthDate} max={t} onChange={(e) => setDraft({ ...draft, birthDate: e.target.value })} />
                </Field>
                <Field label="Taille">
                  <NumberInput value={draft.heightCm} onChange={(v) => setDraft({ ...draft, heightCm: v ?? 0 })} suffix="cm" />
                </Field>
                <Field label="Poids objectif">
                  <NumberInput value={draft.targetWeightKg} onChange={(v) => setDraft({ ...draft, targetWeightKg: v ?? 0 })} suffix="kg" />
                </Field>
                <Field label="Poids de départ">
                  <NumberInput value={draft.startWeightKg} onChange={(v) => setDraft({ ...draft, startWeightKg: v ?? 0 })} suffix="kg" />
                </Field>
                <Field label="Séances / semaine">
                  <NumberInput value={draft.trainingDaysPerWeek} onChange={(v) => setDraft({ ...draft, trainingDaysPerWeek: Math.max(0, Math.min(14, Math.round(v ?? 0))) })} inputMode="numeric" step={1} />
                </Field>
              </div>
              <Field label="Niveau d'activité">
                <select className="field" value={draft.activityLevel} onChange={(e) => setDraft({ ...draft, activityLevel: e.target.value as ActivityLevel })}>
                  {ACTIVITY_LEVELS.map((a) => (
                    <option key={a.value} value={a.value}>
                      {a.label} (× {a.factor.toLocaleString('fr-FR')}) — {a.hint}
                    </option>
                  ))}
                </select>
              </Field>
              <div>
                <span className="label">Objectif</span>
                <Segmented<GoalType>
                  className="w-full"
                  value={draft.goal}
                  onChange={(g) => setDraft({ ...draft, goal: g })}
                  options={[
                    { value: 'bulk', label: 'Prise de masse' },
                    { value: 'maintain', label: 'Maintien' },
                    { value: 'cut', label: 'Sèche' },
                  ]}
                />
              </div>
              <Field label="Objectif physique">
                <input className="field" value={draft.physiqueGoal} onChange={(e) => setDraft({ ...draft, physiqueGoal: e.target.value })} maxLength={120} />
              </Field>
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" disabled={!dirty} onClick={() => setDraft(p)}>
                  Annuler
                </Button>
                <Button variant="primary" disabled={!dirty || !validProfile} onClick={() => void saveProfile()}>
                  Enregistrer
                </Button>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <a className="text-accent" href="#/nutrition/goals">
                  Calories et macros →
                </a>
                <a className="text-accent" href="#/training">
                  Programmes →
                </a>
                <a className="text-accent" href="#/progress/goals">
                  Objectifs personnels →
                </a>
              </div>
            </Card>
          </section>

          <section>
            <SectionTitle>
              <span className="flex items-center gap-2">
                <Bell size={18} className="text-accent" /> Préférences & notifications
              </span>
            </SectionTitle>
            <Card className="divide-y divide-line">
              <div className="pb-3">
                <span className="label">Repos par défaut (exercices personnalisés et séances libres)</span>
                <select className="field" value={p.preferences.defaultRestSec} onChange={(e) => setPref({ defaultRestSec: Number(e.target.value) })}>
                  {REST_OPTIONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
              <Toggle checked={p.preferences.autoStartRest} onChange={(v) => setPref({ autoStartRest: v })} label="Lancer le chrono après chaque série" />
              <Toggle checked={p.preferences.restSound} onChange={(v) => setPref({ restSound: v })} label="Son en fin de repos" />
              <Toggle checked={p.preferences.restVibration} onChange={(v) => setPref({ restVibration: v })} label="Vibration en fin de repos" hint="Sur les téléphones compatibles" />
              <Toggle
                checked={p.preferences.restNotification}
                onChange={async (v) => {
                  if (v && 'Notification' in window && Notification.permission !== 'granted') {
                    const r = await Notification.requestPermission();
                    if (r !== 'granted') {
                      toast('Notifications refusées', 'Autorise-les dans les réglages du navigateur.', 'error');
                      return;
                    }
                  }
                  if (v && !('Notification' in window)) {
                    toast('Notifications indisponibles sur ce navigateur', undefined, 'error');
                    return;
                  }
                  setPref({ restNotification: v });
                }}
                label="Notification système en fin de repos"
                hint="Quand l'application est en arrière-plan"
              />
              <Toggle checked={p.preferences.prefillFromLastSession} onChange={(v) => setPref({ prefillFromLastSession: v })} label="Pré-remplir avec la dernière séance" hint="Charges et répétitions proposées comme point de départ" />
            </Card>
          </section>
        </div>

        <div className="space-y-6">
          <AccountSection />
          <DataSection />
          {ws === 'demo' ? (
            <Card className="!border-warn/40">
              <div className="flex items-center gap-2 font-semibold">
                <Sparkles size={16} className="text-warn" /> Mode démonstration
              </div>
              <p className="text-sm text-muted mt-1">Tu explores des données fictives. Elles sont stockées à part et seront supprimées en quittant la démo.</p>
              <Button
                variant="primary"
                className="mt-3 w-full"
                onClick={async () => {
                  await store().wipeWorkspace('demo');
                  await store().switchWorkspace('local');
                  navigate('/', { replace: true });
                  toast('Démo quittée', 'Tes données réelles sont de retour.');
                }}
              >
                Quitter la démo
              </Button>
            </Card>
          ) : (
            <Card>
              <div className="flex items-center gap-2 font-semibold">
                <Sparkles size={16} className="text-accent" /> Démonstration
              </div>
              <p className="text-sm text-muted mt-1">Explore BODYTRACK avec 12 semaines de données fictives. Tes données restent intactes et séparées.</p>
              <Button className="mt-3 w-full" onClick={() => void store().switchWorkspace('demo', buildDemoData(today())).then(() => navigate('/', { replace: true }))}>
                Explorer la démo
              </Button>
            </Card>
          )}
          {!persistenceAvailable && <Notice tone="warn">Le stockage local est indisponible (navigation privée ?) : tes données seront perdues à la fermeture.</Notice>}
          <p className="text-[11px] text-faint">BODYTRACK fournit des estimations à visée de suivi sportif. Il ne remplace pas l'avis d'un médecin, d'un diététicien ou d'un coach diplômé.</p>
        </div>
      </div>
    </div>
  );
}

function AccountSection() {
  const sync = useSyncStatus();
  const session = useSyncStore((s) => s.session);
  const ws = useStore((s) => s.workspace);
  const lastSyncAt = useStore((s) => s.lastSyncAt);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'signin' | 'signup' | 'magic'>('signin');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const submit = async () => {
    if (!supabase) return;
    setBusy(true);
    setMsg(null);
    try {
      const redirect = window.location.href.split('#')[0];
      if (mode === 'magic') {
        const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect } });
        if (error) throw error;
        setMsg('Lien de connexion envoyé : ouvre-le depuis cet appareil.');
      } else if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirect } });
        if (error) throw error;
        setMsg(data.session ? 'Compte créé, synchronisation en cours.' : 'Compte créé : confirme ton adresse e-mail via le lien reçu.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (e) {
      const m = (e as Error).message;
      setMsg(/invalid login/i.test(m) ? 'E-mail ou mot de passe incorrect.' : m);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <SectionTitle>
        <span className="flex items-center gap-2">
          <Cloud size={18} className="text-accent" /> Compte & synchronisation
        </span>
      </SectionTitle>
      <Card className="space-y-3">
        {!isSupabaseConfigured ? (
          <>
            <div className="flex items-center gap-2">
              <Badge>Mode local</Badge>
              <span className="text-sm text-muted">Données enregistrées sur cet appareil</span>
            </div>
            {configError && <Notice tone="warn">{configError}</Notice>}
            <p className="text-xs text-muted">
              Le cloud n'est pas configuré pour cette installation. Tout fonctionne hors connexion ; pense à exporter régulièrement une sauvegarde. Pour activer les comptes et la synchronisation multi-appareils, renseigne l'adresse et la clé publique d'un projet Supabase (voir le README).
            </p>
          </>
        ) : ws === 'demo' ? (
          <p className="text-sm text-muted">La synchronisation est désactivée en mode démonstration.</p>
        ) : session ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{session.user.email}</div>
                <div className="text-xs text-muted">
                  {sync.label}
                  {lastSyncAt && ` · ${new Date(lastSyncAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}`}
                </div>
                {sync.state === 'error' && <div className="text-xs text-danger mt-1">{sync.detail}</div>}
              </div>
              <Shield size={18} className="text-accent shrink-0" />
            </div>
            <div className="flex gap-2">
              <Button size="sm" icon={<RefreshCw size={14} />} onClick={() => void syncNow()}>
                Synchroniser
              </Button>
              <Button size="sm" variant="ghost" icon={<LogOut size={14} />} onClick={() => void signOut()}>
                Se déconnecter
              </Button>
            </div>
            <p className="text-[11px] text-faint">Tes données et tes photos sont protégées par des règles d'accès par utilisateur (Row Level Security) : personne d'autre ne peut les lire.</p>
          </>
        ) : (
          <>
            <p className="text-sm text-muted">Connecte-toi pour sauvegarder tes données dans le cloud et les retrouver sur tous tes appareils. Tes données locales actuelles seront envoyées sur ton compte.</p>
            <Segmented
              size="sm"
              className="w-full"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'signin', label: 'Connexion' },
                { value: 'signup', label: 'Créer un compte' },
                { value: 'magic', label: 'Lien e-mail' },
              ]}
            />
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              <input className="field" type="email" autoComplete="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} required />
              {mode !== 'magic' && <input className="field" type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} placeholder="Mot de passe (8 caractères min.)" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />}
              <Button type="submit" variant="primary" className="w-full" disabled={busy}>
                {mode === 'signup' ? 'Créer mon compte' : mode === 'magic' ? 'Recevoir un lien' : 'Se connecter'}
              </Button>
            </form>
            {msg && <Notice>{msg}</Notice>}
          </>
        )}
      </Card>
    </section>
  );
}

function DataSection() {
  const ctx = useCtx();
  const session = useSyncStore((s) => s.session);
  const ws = useStore((s) => s.workspace);
  const file = useRef<HTMLInputElement>(null);

  const exportJson = () => {
    const payload = { app: 'bodytrack', version: 1, exportedAt: new Date().toISOString(), data: ctx.data };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `bodytrack-sauvegarde-${today()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('Sauvegarde exportée', 'Fichier JSON (les photos ne sont pas incluses)');
  };

  const exportCsv = () => {
    const rows = [['date', 'seance', 'exercice', 'serie', 'charge_kg', 'reps', 'echauffement']];
    for (const s of ctx.doneSessions)
      for (const x of (ctx.setsBySession.get(s.id) ?? []).filter((y) => y.done).sort((a, b) => a.position - b.position))
        rows.push([s.startedAt.slice(0, 10), s.name, ctx.exById.get(x.exerciseId)?.name ?? x.exerciseId, String(x.position + 1), String(x.weightKg ?? ''), String(x.reps ?? ''), x.isWarmup ? 'oui' : 'non']);
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(';')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `bodytrack-series-${today()}.csv`;
    a.click();
  };

  const importJson = async (f: File | undefined) => {
    if (!f) return;
    try {
      const json = JSON.parse(await f.text());
      if (json?.app !== 'bodytrack' || !json.data) throw new Error('Ce fichier n\'est pas une sauvegarde BODYTRACK.');
      const data: AppData = { ...emptyData(), ...json.data };
      for (const n of COLLECTIONS) if (!Array.isArray(data[n])) throw new Error(`Collection invalide : ${n}`);
      if (!(await confirmDialog({ title: 'Restaurer cette sauvegarde ?', text: `Sauvegarde du ${new Date(json.exportedAt).toLocaleString('fr-FR')}. Toutes les données actuelles de cet espace seront remplacées.`, confirmLabel: 'Restaurer', danger: true }))) return;
      store().replaceData(data, true);
      toast('Sauvegarde restaurée');
    } catch (e) {
      toast('Import impossible', (e as Error).message, 'error');
    } finally {
      if (file.current) file.current.value = '';
    }
  };

  const deleteAll = async () => {
    const remote = !!session && ws === 'local';
    if (!(await confirmDialog({ title: remote ? 'Supprimer ton compte et toutes tes données ?' : 'Supprimer toutes tes données ?', text: remote ? 'Ton compte, tes données et tes photos seront définitivement supprimés du cloud et de cet appareil. Cette action est irréversible.' : 'Toutes les données de cet appareil seront définitivement effacées. Exporte une sauvegarde avant si besoin.', confirmLabel: 'Tout supprimer', danger: true }))) return;
    try {
      if (remote) await deleteRemoteAccount();
      await store().wipeWorkspace(ws);
      if (ws === 'demo') await store().switchWorkspace('local');
      toast('Données supprimées');
      navigate('/', { replace: true });
    } catch (e) {
      toast('Suppression impossible', (e as Error).message, 'error');
    }
  };

  return (
    <section>
      <SectionTitle>
        <span className="flex items-center gap-2">
          <Download size={18} className="text-accent" /> Mes données
        </span>
      </SectionTitle>
      <Card className="space-y-2">
        <div className="text-xs text-muted mb-1 tnum">
          {ctx.doneSessions.length} séances · {ctx.data.sets.length} séries · {ctx.loggedDates.size} jours de nutrition · {ctx.data.weights.length} pesées · {ctx.data.photos.length} photos
        </div>
        <Button className="w-full justify-start" icon={<Download size={16} />} onClick={exportJson}>
          Exporter une sauvegarde complète (JSON)
        </Button>
        <Button className="w-full justify-start" icon={<Download size={16} />} onClick={exportCsv}>
          Exporter mes séries (CSV, tableur)
        </Button>
        <input ref={file} type="file" accept="application/json,.json" className="hidden" onChange={(e) => void importJson(e.target.files?.[0])} />
        <Button className="w-full justify-start" icon={<Upload size={16} />} onClick={() => file.current?.click()}>
          Restaurer une sauvegarde
        </Button>
        <Button variant="danger" className="w-full justify-start" icon={<Trash2 size={16} />} onClick={() => void deleteAll()}>
          {session && ws === 'local' ? 'Supprimer mon compte et mes données' : 'Supprimer toutes mes données'}
        </Button>
      </Card>
    </section>
  );
}
