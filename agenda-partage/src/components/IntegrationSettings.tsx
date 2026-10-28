import { Bell, CalendarSync, Copy, KeyRound, Loader2, RefreshCw, Workflow } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useToast } from '../context/ToastContext';
import { calendarFeedToken, dispatchTokenDate, rotateDispatchToken } from '../data/api';
import { getAlertPrefs, notificationSupport, onAlertPrefsChange, setAlertPrefs } from '../lib/alerts';
import { relativeTime } from '../lib/datetime';
import { functionsUrl } from '../lib/supabase';
import { ConfirmDialog, Toggle } from './ui';

async function copy(text: string, toast: ReturnType<typeof useToast>, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copié`);
  } catch {
    toast.info(text);
  }
}

/** Notifications sur l'ordinateur et rappel avant les rendez-vous (réglage propre à cet appareil) */
export function NotificationSettings() {
  const toast = useToast();
  const [prefs, setPrefs] = useState(getAlertPrefs);
  const [permission, setPermission] = useState(notificationSupport);

  useEffect(() => onAlertPrefsChange(() => setPrefs(getAlertPrefs())), []);

  const update = (next: typeof prefs) => {
    setPrefs(next);
    setAlertPrefs(next);
  };

  const ask = async () => {
    if (permission === 'unsupported') return;
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === 'granted') {
      update({ ...prefs, enabled: true });
      new Notification('Notifications activées', { body: 'Vous serez prévenu ici des rendez-vous et des rappels.', icon: './favicon.svg' });
    } else {
      toast.warning('Notifications refusées : autorisez-les dans les réglages du navigateur (icône du cadenas, à gauche de l’adresse).');
    }
  };

  return (
    <div className="card space-y-4 p-5">
      <h2 className="flex items-center gap-2 font-bold">
        <Bell className="h-4 w-4 text-brand" /> Notifications sur cet appareil
      </h2>
      <p className="text-sm text-neutral-600">
        Une notification apparaît quand un collègue (ou l'agent Dispatch) vous confie ou modifie un rendez-vous, puis un rappel avant chacun de vos
        rendez-vous. L'agenda doit rester ouvert dans un onglet (il peut être réduit) — pour l'avoir toujours ouvert, installez-le : menu du navigateur ›
        « Installer l'application ».
      </p>
      {permission === 'unsupported' ? (
        <p className="rounded-lg bg-neutral-100 p-3 text-sm">Ce navigateur ne gère pas les notifications : les alertes s'affichent dans la page.</p>
      ) : permission !== 'granted' ? (
        <button className="btn-primary" onClick={ask}>
          <Bell className="h-4 w-4" /> Autoriser les notifications
        </button>
      ) : (
        <p className="rounded-lg bg-green-50 p-3 text-sm text-green-800">Notifications autorisées sur ce navigateur.</p>
      )}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <Toggle checked={prefs.enabled} onChange={(v) => update({ ...prefs, enabled: v })} label="Alertes et rappels activés" />
        <label className="flex items-center gap-2 text-sm">
          Rappel
          <select className="field w-auto py-1.5" value={prefs.lead} onChange={(e) => update({ ...prefs, lead: Number(e.target.value) })} disabled={!prefs.enabled}>
            {[5, 10, 15, 30, 60].map((m) => (
              <option key={m} value={m}>
                {m} min avant
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

/** Lien d'abonnement à coller dans Outlook (ou Google Agenda, Apple Calendrier) */
export function OutlookSubscription() {
  const toast = useToast();
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    calendarFeedToken()
      .then(setToken)
      .catch(() => setToken(null));
  }, []);

  const link = token ? `${functionsUrl}/calendar-feed?t=${token}` : '';

  const rotate = async () => {
    setBusy(true);
    try {
      setToken(await calendarFeedToken(true));
      toast.success('Nouveau lien créé : remplacez l’abonnement dans Outlook.');
      setConfirm(false);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card space-y-4 p-5">
      <h2 className="flex items-center gap-2 font-bold">
        <CalendarSync className="h-4 w-4 text-brand" /> Mes rendez-vous dans Outlook
      </h2>
      <p className="text-sm text-neutral-600">
        Vos rendez-vous (dont vous êtes responsable) apparaissent dans Outlook, avec un rappel 15 minutes avant. Lecture seule : les modifications se
        font dans l'agenda, Outlook les reprend à sa prochaine mise à jour (souvent toutes les 30 minutes à quelques heures, selon Outlook).
      </p>
      <div className="flex gap-2">
        <input className="field font-mono text-xs" readOnly value={link || 'Chargement…'} onFocus={(e) => e.target.select()} aria-label="Lien d'abonnement" />
        <button className="btn-dark shrink-0" disabled={!link} onClick={() => copy(link, toast, 'Lien')}>
          <Copy className="h-4 w-4" /> Copier
        </button>
      </div>
      <ol className="list-decimal space-y-1 pl-5 text-sm text-neutral-700">
        <li>
          <strong>Outlook (nouveau / web)</strong> : Calendrier › <em>Ajouter un calendrier</em> › <em>S'abonner à partir du web</em> › coller le lien › nom
          « Agenda équipe » › <em>Importer</em>.
        </li>
        <li>
          <strong>Outlook classique (Windows)</strong> : Calendrier › <em>Ajouter un calendrier</em> › <em>À partir d'Internet…</em> › coller le lien › <em>OK</em>.
        </li>
      </ol>
      <p className="text-xs text-neutral-500">
        Ce lien est personnel : quiconque le possède voit vos rendez-vous. En cas de doute, générez-en un nouveau.
      </p>
      <button className="btn-ghost" onClick={() => setConfirm(true)} disabled={!token}>
        <RefreshCw className="h-4 w-4" /> Générer un nouveau lien
      </button>
      <ConfirmDialog
        open={confirm}
        title="Générer un nouveau lien ?"
        message="L’ancien lien cessera immédiatement de fonctionner : il faudra refaire l’abonnement dans Outlook."
        confirmLabel="Générer"
        busy={busy}
        onConfirm={rotate}
        onCancel={() => setConfirm(false)}
      />
    </div>
  );
}

/** Administration : jeton de l'agent Dispatch Movers (réservations automatiques) */
export function DispatchConnection() {
  const toast = useToast();
  const [since, setSince] = useState<string | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const endpoint = `${functionsUrl}/dispatch-booking`;

  useEffect(() => {
    dispatchTokenDate()
      .then(setSince)
      .catch(() => setSince(null));
  }, []);

  const generate = async () => {
    setBusy(true);
    try {
      setFresh(await rotateDispatchToken());
      setSince(new Date().toISOString());
      setConfirm(false);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-neutral-200 p-4">
      <p className="flex items-center gap-2 font-semibold text-ink">
        <Workflow className="h-4 w-4 text-brand" /> Agent Dispatch Movers
      </p>
      <p className="text-sm text-neutral-600">
        Quand l'agent attribue une tâche CRM (Worked By), il réserve dans l'agenda du collaborateur l'horaire de rappel écrit dans la tâche. À recopier dans la section{' '}
        <code className="rounded bg-neutral-100 px-1">[agenda]</code> de <code className="rounded bg-neutral-100 px-1">dispatch.toml</code>.
      </p>
      <label className="label">Adresse (endpoint)</label>
      <div className="flex gap-2">
        <input className="field font-mono text-xs" readOnly value={endpoint} onFocus={(e) => e.target.select()} />
        <button className="btn-ghost shrink-0" onClick={() => copy(endpoint, toast, 'Adresse')}>
          <Copy className="h-4 w-4" />
        </button>
      </div>
      {fresh ? (
        <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
          <p className="text-sm font-semibold text-amber-900">Jeton (affiché une seule fois) :</p>
          <div className="flex gap-2">
            <input className="field font-mono text-xs" readOnly value={fresh} onFocus={(e) => e.target.select()} />
            <button className="btn-dark shrink-0" onClick={() => copy(fresh, toast, 'Jeton')}>
              <Copy className="h-4 w-4" /> Copier
            </button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-neutral-600">{since ? `Jeton actif, créé ${relativeTime(since)}.` : 'Aucun jeton : l’agent ne peut pas encore réserver.'}</p>
      )}
      <button className="btn-ghost" onClick={() => (since ? setConfirm(true) : void generate())} disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
        {since ? 'Générer un nouveau jeton' : 'Générer le jeton'}
      </button>
      <ConfirmDialog
        open={confirm}
        title="Remplacer le jeton de l'agent ?"
        message="L’ancien jeton cessera aussitôt de fonctionner : il faudra copier le nouveau dans dispatch.toml."
        confirmLabel="Remplacer"
        busy={busy}
        onConfirm={generate}
        onCancel={() => setConfirm(false)}
      />
    </div>
  );
}
