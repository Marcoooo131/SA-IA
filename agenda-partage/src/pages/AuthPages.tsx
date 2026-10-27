import { ArrowLeft, CalendarDays, KeyRound, Loader2, Lock, Mail, ShieldCheck, Terminal } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useAuth } from '../context/AuthContext';
import { friendlyError } from '../lib/errors';
import { authLinkError } from '../lib/supabase';

function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full items-center justify-center bg-ink px-4 py-10" style={{ backgroundImage: 'radial-gradient(circle at 15% 10%, rgba(227,6,19,0.35), transparent 45%), radial-gradient(circle at 90% 90%, rgba(184,0,10,0.3), transparent 40%)' }}>
      <div className="animate-sheet w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-3 text-white">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand shadow-lg shadow-brand/40">
            <CalendarDays className="h-6 w-6" />
          </span>
          <div>
            <p className="text-xl font-extrabold tracking-tight">Agenda d'équipe</p>
            <p className="text-sm text-neutral-400">Planning partagé en temps réel</p>
          </div>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-2xl md:p-8">{children}</div>
        <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-neutral-500">
          <ShieldCheck className="h-3.5 w-3.5" /> Accès réservé aux membres de l'équipe
        </p>
      </div>
    </div>
  );
}

export function LoginPage() {
  const { signIn, sendPasswordReset } = useAuth();
  const [mode, setMode] = useState<'login' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(authLinkError);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'login') await signIn(email, password);
      else {
        await sendPasswordReset(email);
        setSent(true);
      }
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <h1 className="text-xl font-bold">{mode === 'login' ? 'Connexion' : 'Mot de passe oublié'}</h1>
      <p className="mb-5 text-sm text-neutral-500">
        {mode === 'login' ? 'Identifiez-vous pour accéder à l’agenda.' : 'Recevez un lien pour choisir un nouveau mot de passe.'}
      </p>
      {error && (
        <p className="mb-4 rounded-lg border border-brand/30 bg-brand-soft px-3 py-2 text-sm text-brand-dark" role="alert">
          {error}
        </p>
      )}
      {sent && mode === 'forgot' ? (
        <div className="space-y-4">
          <p className="rounded-lg bg-green-50 px-3 py-3 text-sm text-green-800">
            Si un compte existe pour <strong>{email}</strong>, un e-mail vient d'être envoyé. Pensez à vérifier les indésirables.
          </p>
          <button className="btn-ghost w-full" onClick={() => { setMode('login'); setSent(false); }}>
            <ArrowLeft className="h-4 w-4" /> Retour à la connexion
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label" htmlFor="email">Adresse e-mail</label>
            <div className="relative">
              <Mail className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <input id="email" className="field pl-9" type="email" inputMode="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>
          {mode === 'login' && (
            <div>
              <label className="label" htmlFor="password">Mot de passe</label>
              <div className="relative">
                <Lock className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                <input id="password" className="field pl-9" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
            </div>
          )}
          <button className="btn-primary w-full py-3" disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === 'login' ? 'Se connecter' : 'Envoyer le lien'}
          </button>
          <button
            type="button"
            className="w-full text-center text-sm font-medium text-neutral-600 hover:text-brand"
            onClick={() => { setMode(mode === 'login' ? 'forgot' : 'login'); setError(null); }}
          >
            {mode === 'login' ? 'Mot de passe oublié ?' : 'Retour à la connexion'}
          </button>
        </form>
      )}
    </AuthShell>
  );
}

export function SetPasswordPage() {
  const { setPassword, profile, signOut } = useAuth();
  const [pwd, setPwd] = useState('');
  const [pwd2, setPwd2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwd.length < 8) return setError('Le mot de passe doit contenir au moins 8 caractères.');
    if (pwd !== pwd2) return setError('Les deux mots de passe sont différents.');
    setBusy(true);
    try {
      await setPassword(pwd);
      window.history.replaceState(null, '', window.location.pathname + '#/');
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <h1 className="flex items-center gap-2 text-xl font-bold">
        <KeyRound className="h-5 w-5 text-brand" /> Choisissez votre mot de passe
      </h1>
      <p className="mb-5 text-sm text-neutral-500">{profile ? `Compte : ${profile.email}` : 'Dernière étape avant d’accéder à l’agenda.'}</p>
      {error && (
        <p className="mb-4 rounded-lg border border-brand/30 bg-brand-soft px-3 py-2 text-sm text-brand-dark" role="alert">
          {error}
        </p>
      )}
      <form onSubmit={submit} className="space-y-4">
        <input className="field" type="password" placeholder="Nouveau mot de passe (8 caractères min.)" autoComplete="new-password" value={pwd} onChange={(e) => setPwd(e.target.value)} />
        <input className="field" type="password" placeholder="Confirmer le mot de passe" autoComplete="new-password" value={pwd2} onChange={(e) => setPwd2(e.target.value)} />
        <button className="btn-primary w-full py-3" disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Valider
        </button>
        <button type="button" className="w-full text-center text-sm text-neutral-500 hover:text-brand" onClick={() => void signOut()}>
          Annuler et se déconnecter
        </button>
      </form>
    </AuthShell>
  );
}

export function MessagePage({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <AuthShell>
      <h1 className="mb-2 text-xl font-bold">{title}</h1>
      <div className="space-y-3 text-sm text-neutral-600">{children}</div>
      {action && <div className="mt-5">{action}</div>}
    </AuthShell>
  );
}

/** Affiché tant que la connexion à Supabase n'est pas correctement configurée */
export function SetupPage({ problem }: { problem: string | null }) {
  return (
    <MessagePage title="Configuration requise">
      <p>L'agenda n'est pas encore relié à sa base de données Supabase.</p>
      {problem && (
        <p className="rounded-lg border border-brand/30 bg-brand-soft px-3 py-2 text-brand-dark" role="alert">
          {problem}
        </p>
      )}
      <ol className="list-decimal space-y-1 pl-5">
        <li>
          GitHub › <strong>Settings</strong> › <strong>Secrets and variables</strong> › <strong>Actions</strong> › onglet <strong>Variables</strong>.
        </li>
        <li>
          <code className="rounded bg-neutral-100 px-1">AGENDA_SUPABASE_URL</code> : l'URL du projet, ex.{' '}
          <code className="rounded bg-neutral-100 px-1">https://abcdefghijklmnop.supabase.co</code>
        </li>
        <li>
          <code className="rounded bg-neutral-100 px-1">AGENDA_SUPABASE_ANON_KEY</code> : la clé « anon public » ou « publishable » (jamais la clé secrète).
        </li>
        <li>Relancez la publication (Actions › Déploiement GitHub Pages › Run workflow).</li>
      </ol>
      <p className="flex items-center gap-2 rounded-lg bg-neutral-100 p-3 font-mono text-xs">
        <Terminal className="h-4 w-4 shrink-0" /> Détails : agenda-partage/README.md
      </p>
    </MessagePage>
  );
}
