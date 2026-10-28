import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useEditor } from '../context/EditorContext';
import { useTeam } from '../context/TeamContext';
import { useToast } from '../context/ToastContext';
import { fetchAgenda } from '../data/api';
import { formatTime } from '../lib/datetime';
import { dueReminders, getAlertPrefs, notificationSupport, onAlertPrefsChange } from '../lib/alerts';

const REMINDED_KEY = 'agenda.reminded';

function loadReminded(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(REMINDED_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

function saveReminded(set: Set<string>): void {
  try {
    localStorage.setItem(REMINDED_KEY, JSON.stringify([...set].slice(-200)));
  } catch {
    /* stockage indisponible */
  }
}

/**
 * Notifications sur l'ordinateur tant que l'agenda est ouvert (même en arrière-plan) :
 * rendez-vous confié / modifié par un collègue (ou l'agent Dispatch), et rappel avant chaque rendez-vous.
 */
export function DesktopAlerts() {
  const { profile } = useAuth();
  const { notifications, zone } = useTeam();
  const { openDetail } = useEditor();
  const toast = useToast();
  const [prefs, setPrefs] = useState(getAlertPrefs);
  const mountedAt = useRef(Date.now());
  const shown = useRef(new Set<number>());
  const reminded = useRef(loadReminded());
  const openRef = useRef(openDetail);
  openRef.current = openDetail;

  useEffect(() => onAlertPrefsChange(() => setPrefs(getAlertPrefs())), []);

  const show = (title: string, body: string, tag: string, appointmentId: string | null) => {
    if (prefs.enabled && notificationSupport() === 'granted') {
      try {
        const n = new Notification(title, { body, tag, icon: './favicon.svg', requireInteraction: tag.startsWith('rappel') });
        n.onclick = () => {
          window.focus();
          if (appointmentId) openRef.current(appointmentId);
          n.close();
        };
        return;
      } catch {
        /* certains navigateurs mobiles refusent « new Notification » : message dans la page */
      }
    }
    if (document.visibilityState === 'visible') toast.info(`${title} — ${body}`);
  };

  // Nouvelles notifications internes (rendez-vous confié, modifié, commenté…). Seules celles arrivées
  // depuis l'ouverture de l'agenda (à une minute près) déclenchent une alerte : pas de rafale au chargement.
  useEffect(() => {
    for (const n of notifications) {
      if (n.read_at || shown.current.has(n.id) || Date.parse(n.created_at) < mountedAt.current - 60_000) continue;
      shown.current.add(n.id);
      show(n.title, n.body, `notif-${n.id}`, n.appointment_id);
    }
  }, [notifications]);

  // Rappels avant les rendez-vous dont je suis responsable
  useEffect(() => {
    if (!profile || !prefs.enabled) return;
    let cancelled = false;
    const tick = async () => {
      const now = Date.now();
      try {
        const list = await fetchAgenda(new Date(now - 2 * 60_000), new Date(now + (prefs.lead + 2) * 60_000));
        if (cancelled) return;
        for (const a of dueReminders(list, profile.id, prefs.lead, now, reminded.current)) {
          reminded.current.add(`${a.id}|${a.starts_at}`);
          const minutes = Math.max(0, Math.round((Date.parse(a.starts_at) - now) / 60_000));
          const when = minutes <= 0 ? 'Maintenant' : `Dans ${minutes} min`;
          show(`${when} : ${a.title}`, [formatTime(a.starts_at, zone), a.client_name, a.location].filter(Boolean).join(' · '), `rappel-${a.id}`, a.id);
        }
        saveReminded(reminded.current);
      } catch {
        /* hors ligne : nouvel essai au prochain passage */
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), 30_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [profile?.id, prefs.enabled, prefs.lead, zone]);

  return null;
}
