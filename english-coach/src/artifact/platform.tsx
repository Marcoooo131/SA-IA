import { useEffect, useState } from 'react';
import { Cloud, CloudOff, RefreshCw, Smartphone } from 'lucide-react';
import { useMeta } from '../core/store';
import { Page } from '../ui/components/Page';
import { useOnline } from '../ui/pwa';
import { getSyncError, getSyncStatus, onSyncStatus, syncNow, type SyncStatus } from './sync';

/** Version artefact claude.ai : utilisation sur téléphone et mémoire liée au compte Claude. */

function useSyncStatus() {
  const [status, setStatus] = useState<SyncStatus>(getSyncStatus());
  useEffect(() => onSyncStatus(setStatus), []);
  return status;
}

export function InstallCard() {
  return (
    <section className="card">
      <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Smartphone size={20} aria-hidden="true" /> Sur ton téléphone
      </h2>
      <p className="hint">
        Ouvre le lien de cette page dans l'application Claude ou dans le navigateur de ton téléphone. Tu peux aussi l'ajouter à ton écran d'accueil.
      </p>
      <a className="btn btn-secondary btn-small" href="#/install">
        Voir comment faire
      </a>
    </section>
  );
}

export function SyncCard() {
  const meta = useMeta();
  const online = useOnline();
  const status = useSyncStatus();
  const last = meta.lastSyncAt ? new Date(meta.lastSyncAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : null;
  const text =
    status === 'syncing'
      ? 'Enregistrement en cours…'
      : status === 'local'
        ? "Mémoire en ligne indisponible ici (ouvre la page connecté à ton compte Claude). La progression est enregistrée sur cet appareil."
        : !online || status === 'offline'
          ? 'Hors connexion : la progression est enregistrée sur cet appareil et sera mise en mémoire au retour du réseau.'
          : status === 'error'
            ? getSyncError() ?? meta.syncError ?? 'La mémoire en ligne n\'a pas répondu.'
            : last
              ? `Dernier enregistrement en mémoire : ${last}`
              : 'Pas encore enregistrée en mémoire.';
  const saved = status === 'ok' || (status === 'idle' && Boolean(last));
  return (
    <section className="card">
      <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {saved ? <Cloud size={20} aria-hidden="true" /> : <CloudOff size={20} aria-hidden="true" />} Mémoire de ta progression
      </h2>
      <p className="hint">
        Leçons terminées, réponses, vocabulaire, erreurs, révisions et jour du programme sont enregistrés dans la mémoire de cette page, liée à ton
        compte Claude. Ouvre le même lien sur un autre appareil, connecté au même compte, pour tout retrouver.
      </p>
      <p role="status" style={{ fontSize: '0.92rem' }}>
        {text}
      </p>
      <button type="button" className="btn btn-ghost btn-small" onClick={() => void syncNow()} disabled={!online || status === 'syncing'}>
        <RefreshCw size={18} aria-hidden="true" /> Enregistrer maintenant
      </button>
    </section>
  );
}

export function InstallGuide() {
  return (
    <Page
      title="Utiliser sur téléphone"
      action={
        <a className="btn btn-ghost btn-small" href="#/profile">
          Retour
        </a>
      }
    >
      <section className="card">
        <h2>Le plus simple</h2>
        <p>
          Ouvre le lien de cette page dans l'<strong>application Claude</strong> sur ton téléphone (connecté au même compte). Ta progression y est déjà.
        </p>
      </section>
      <section className="card" aria-labelledby="ios">
        <h2 id="ios">iPhone et iPad : raccourci sur l'écran d'accueil</h2>
        <ol className="steps">
          <li>
            Ouvre le lien dans <strong>Safari</strong> et connecte-toi à Claude si besoin.
          </li>
          <li>
            Touche <strong>Partager</strong> (carré avec une flèche vers le haut).
          </li>
          <li>
            Choisis <strong>« Sur l'écran d'accueil »</strong>, puis <strong>Ajouter</strong>.
          </li>
        </ol>
      </section>
      <section className="card" aria-labelledby="android">
        <h2 id="android">Android : raccourci sur l'écran d'accueil</h2>
        <ol className="steps">
          <li>
            Ouvre le lien dans <strong>Chrome</strong> et connecte-toi à Claude si besoin.
          </li>
          <li>
            Menu <strong>⋮</strong> → <strong>« Ajouter à l'écran d'accueil »</strong>.
          </li>
        </ol>
      </section>
      <p className="hint">
        Les leçons et révisions fonctionnent à partir de l'appareil. Le professeur IA et l'enregistrement en mémoire en ligne demandent une connexion
        Internet. La première utilisation du professeur IA demande ton accord : il utilise ton compte Claude.
      </p>
    </Page>
  );
}
