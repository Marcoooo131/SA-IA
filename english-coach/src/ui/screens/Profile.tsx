import { useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, Cloud, CloudOff, Copy, Download, KeyRound, RefreshCw, Smartphone } from 'lucide-react';
import { PROGRAM_DAYS } from '../../curriculum';
import { ApiError, apiFetch, errorMessage } from '../../core/api';
import { accuracy, setDailyGoal, totalSeconds, vocabularyStats, streak } from '../../core/state';
import { setState, useAppState, useMeta } from '../../core/store';
import { ensureAccount, formatKey, getSyncStatus, linkWithKey, onSyncStatus, syncNow, type SyncStatus } from '../../core/sync';
import { formatMinutes } from '../../core/util';
import { Page } from '../components/Page';
import { detectPlatform, isStandalone, useInstallPrompt, useOnline } from '../pwa';

const GOALS = [5, 10, 15, 20, 30];

function useSyncStatus() {
  const [status, setStatus] = useState<SyncStatus>(getSyncStatus());
  useEffect(() => onSyncStatus(setStatus), []);
  return status;
}

export function Profile() {
  const state = useAppState();
  const done = Object.keys(state.completed).length;
  const vocab = vocabularyStats(state);
  const acc = accuracy(state);

  return (
    <Page title="Profil" subtitle="Ta progression et tes réglages">
      <section className="stats" aria-label="Bilan">
        <div className="stat">
          <strong>
            {done}/{PROGRAM_DAYS}
          </strong>
          <span>journées terminées</span>
        </div>
        <div className="stat">
          <strong>{vocab.acquired}</strong>
          <span>mots acquis ({vocab.seen} vus)</span>
        </div>
        <div className="stat">
          <strong>{acc === null ? '—' : `${Math.round(acc * 100)} %`}</strong>
          <span>de réussite récente</span>
        </div>
        <div className="stat">
          <strong>{formatMinutes(totalSeconds(state))}</strong>
          <span>d'apprentissage au total</span>
        </div>
        <div className="stat">
          <strong>{streak(state)}</strong>
          <span>{streak(state) > 1 ? 'jours de suite' : 'jour de suite'}</span>
        </div>
        <div className="stat">
          <strong>{state.activeDays.length}</strong>
          <span>{state.activeDays.length > 1 ? "jours d'étude" : "jour d'étude"}</span>
        </div>
      </section>

      <section className="card">
        <h2>Objectif quotidien</h2>
        <p className="hint">Minutes d'apprentissage visées chaque jour.</p>
        <div className="segmented" role="group" aria-label="Objectif quotidien en minutes">
          {GOALS.map((g) => (
            <button
              key={g}
              type="button"
              aria-pressed={state.settings.dailyGoalMin === g}
              aria-label={`${g} minutes`}
              onClick={() => setState((s) => setDailyGoal(s, g))}
            >
              {g}
            </button>
          ))}
        </div>
      </section>

      <InstallCard />
      <SyncCard />

      <section className="card">
        <h2>À propos</h2>
        <p className="hint">
          English Coach est un professeur d'anglais <strong>écrit</strong> : aucune fonctionnalité vocale. Les leçons et révisions fonctionnent hors ligne ; le
          professeur IA (conversation et vérification des traductions libres) nécessite une connexion Internet.
        </p>
      </section>
    </Page>
  );
}

function InstallCard() {
  const install = useInstallPrompt();
  const standalone = isStandalone();
  return (
    <section className="card">
      <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Smartphone size={20} aria-hidden="true" /> Application sur l'écran d'accueil
      </h2>
      {standalone ? (
        <p style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <CheckCircle2 size={18} color="var(--ok)" aria-hidden="true" /> English Coach est ouvert comme une application.
        </p>
      ) : (
        <>
          <p className="hint">L'application n'est pas installée automatiquement : tu peux l'ajouter toi-même en quelques secondes.</p>
          <div className="row">
            {install && (
              <button type="button" className="btn btn-primary btn-small" onClick={() => void install()}>
                <Download size={18} aria-hidden="true" /> Installer
              </button>
            )}
            <a className="btn btn-secondary btn-small" href="#/install">
              Voir comment faire
            </a>
          </div>
        </>
      )}
    </section>
  );
}

function SyncCard() {
  const meta = useMeta();
  const online = useOnline();
  const status = useSyncStatus();
  const [linking, setLinking] = useState(false);
  const [code, setCode] = useState('');
  const [invite, setInvite] = useState('');
  const [needsInvite, setNeedsInvite] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (meta.syncKey || !online) return;
    void apiFetch<{ inviteRequired: boolean }>('/health')
      .then((h) => setNeedsInvite(h.inviteRequired))
      .catch(() => {});
  }, [meta.syncKey, online]);

  async function link(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    try {
      await linkWithKey(code);
      setLinking(false);
      setCode('');
      setMessage('Appareil relié : ta progression a été fusionnée.');
    } catch (err) {
      setMessage(errorMessage(err));
    }
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    try {
      const key = await ensureAccount(invite.trim());
      if (key) await syncNow();
      else setMessage(meta.syncError ?? 'Impossible de créer la sauvegarde.');
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : errorMessage(err));
    }
  }

  async function copy() {
    if (!meta.syncKey) return;
    try {
      await navigator.clipboard.writeText(formatKey(meta.syncKey));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setMessage('Copie impossible : sélectionne le code et copie-le manuellement.');
    }
  }

  const last = meta.lastSyncAt ? new Date(meta.lastSyncAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : null;
  const statusText =
    status === 'syncing'
      ? 'Synchronisation en cours…'
      : !online
        ? 'Hors connexion : la progression est enregistrée sur cet appareil et sera envoyée au retour du réseau.'
        : status === 'error' && meta.syncError
          ? meta.syncError
          : last
            ? `Dernière sauvegarde en ligne : ${last}`
            : 'Pas encore sauvegardé en ligne.';

  return (
    <section className="card">
      <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {online && meta.lastSyncAt ? <Cloud size={20} aria-hidden="true" /> : <CloudOff size={20} aria-hidden="true" />} Sauvegarde et synchronisation
      </h2>
      <p className="hint">
        Ta progression est enregistrée sur ce téléphone (elle survit à la fermeture et au redémarrage) et sauvegardée sur le serveur pour la retrouver sur
        un autre appareil.
      </p>
      <p role="status" style={{ fontSize: '0.92rem' }}>
        {statusText}
      </p>

      {meta.syncKey ? (
        <>
          <p style={{ marginBottom: 6 }}>
            <strong>Ton code de synchronisation</strong> — garde-le précieusement, il permet de récupérer ta progression :
          </p>
          <div className="code" aria-label="Code de synchronisation">
            {formatKey(meta.syncKey)}
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <button type="button" className="btn btn-secondary btn-small" onClick={() => void copy()}>
              <Copy size={18} aria-hidden="true" /> {copied ? 'Copié !' : 'Copier le code'}
            </button>
            <button type="button" className="btn btn-ghost btn-small" onClick={() => void syncNow()} disabled={!online || status === 'syncing'}>
              <RefreshCw size={18} aria-hidden="true" /> Synchroniser
            </button>
          </div>
        </>
      ) : (
        online &&
        needsInvite && (
          <form onSubmit={create} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label htmlFor="invite">Code d'invitation (demandé par ce serveur)</label>
            <input id="invite" className="text-input" value={invite} onChange={(e) => setInvite(e.target.value)} autoComplete="off" enterKeyHint="go" />
            <button type="submit" className="btn btn-primary btn-small" disabled={!invite.trim()}>
              Activer la sauvegarde en ligne
            </button>
          </form>
        )
      )}

      <div style={{ marginTop: 12 }}>
        {linking ? (
          <form onSubmit={link} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label htmlFor="sync-code">Code affiché sur ton autre appareil</label>
            <input
              id="sync-code"
              className="text-input"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoCapitalize="characters"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder="XXXX-XXXX-XXXX-XXXX-XXXX"
              enterKeyHint="go"
            />
            <div className="row">
              <button type="submit" className="btn btn-primary btn-small" disabled={!online || code.trim().length < 16}>
                Relier cet appareil
              </button>
              <button type="button" className="btn btn-ghost btn-small" onClick={() => setLinking(false)}>
                Annuler
              </button>
            </div>
          </form>
        ) : (
          <button type="button" className="link-btn" onClick={() => setLinking(true)}>
            <KeyRound size={16} aria-hidden="true" style={{ verticalAlign: '-3px', marginRight: 6 }} />
            J'ai déjà un code (autre téléphone ou ordinateur)
          </button>
        )}
      </div>
      {message && (
        <p role="alert" style={{ marginTop: 8 }}>
          {message}
        </p>
      )}
    </section>
  );
}

export function InstallGuide() {
  const install = useInstallPrompt();
  const { platform, browser } = detectPlatform();
  const standalone = isStandalone();

  return (
    <Page
      title="Installer l'application"
      action={
        <a className="btn btn-ghost btn-small" href="#/profile">
          Retour
        </a>
      }
    >
      {standalone && (
        <div className="banner info">
          <CheckCircle2 size={18} aria-hidden="true" />
          <span>C'est fait : English Coach est déjà ouvert comme une application.</span>
        </div>
      )}
      {install && !standalone && (
        <section className="card">
          <h2>Installation en un geste</h2>
          <p className="hint">Ton navigateur propose l'installation directe.</p>
          <button type="button" className="btn btn-primary btn-block" onClick={() => void install()}>
            <Download size={20} aria-hidden="true" /> Installer English Coach
          </button>
        </section>
      )}

      <section className="card" aria-labelledby="ios">
        <h2 id="ios">iPhone et iPad {platform === 'ios' && <span className="pill ok">ton appareil</span>}</h2>
        <ol className="steps">
          <li>
            Ouvre cette page dans <strong>Safari</strong>
            {platform === 'ios' && browser !== 'safari' ? ' (ou dans ton navigateur s\'il propose « Ajouter à l\'écran d\'accueil » dans son menu Partager)' : ''}.
          </li>
          <li>
            Touche le bouton <strong>Partager</strong> (carré avec une flèche vers le haut).
          </li>
          <li>
            Choisis <strong>« Sur l'écran d'accueil »</strong>, puis <strong>Ajouter</strong>.
          </li>
          <li>Lance English Coach depuis sa nouvelle icône.</li>
        </ol>
      </section>

      <section className="card" aria-labelledby="android">
        <h2 id="android">Android {platform === 'android' && <span className="pill ok">ton appareil</span>}</h2>
        <ol className="steps">
          <li>
            Dans <strong>Chrome</strong>, touche le menu <strong>⋮</strong> en haut à droite.
          </li>
          <li>
            Choisis <strong>« Installer l'application »</strong> ou <strong>« Ajouter à l'écran d'accueil »</strong>.
          </li>
          <li>Confirme : l'icône English Coach apparaît avec tes applications.</li>
        </ol>
        <p className="hint">Samsung Internet : menu ☰ puis « Ajouter la page à » → « Écran d'accueil ». Firefox : menu ⋮ puis « Installer ».</p>
      </section>

      <section className="card" aria-labelledby="desktop">
        <h2 id="desktop">Ordinateur {platform === 'desktop' && <span className="pill ok">ton appareil</span>}</h2>
        <p className="hint">
          Chrome ou Edge : icône d'installation à droite de la barre d'adresse, ou menu → « Installer English Coach ». Safari (macOS) : menu Fichier →
          « Ajouter au Dock ». Tu peux aussi simplement utiliser l'application dans le navigateur.
        </p>
      </section>

      <p className="hint">
        Une fois installée, l'application s'ouvre en plein écran et ses leçons fonctionnent sans connexion. L'installation nécessite une adresse sécurisée
        (https).
      </p>
    </Page>
  );
}
