/** Préférences de notifications sur cet appareil (stockées dans le navigateur) */
export interface AlertPrefs {
  enabled: boolean;
  /** Minutes avant le rendez-vous pour le rappel */
  lead: number;
}

const KEY = 'agenda.alerts';
const EVENT = 'agenda-alerts-changed';
export const DEFAULT_ALERTS: AlertPrefs = { enabled: true, lead: 15 };

export function getAlertPrefs(): AlertPrefs {
  try {
    return { ...DEFAULT_ALERTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return DEFAULT_ALERTS;
  }
}

export function setAlertPrefs(prefs: AlertPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* stockage indisponible : préférence non mémorisée */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function onAlertPrefsChange(cb: () => void): () => void {
  window.addEventListener(EVENT, cb);
  window.addEventListener('storage', cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener('storage', cb);
  };
}

export function notificationSupport(): 'unsupported' | NotificationPermission {
  return typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported';
}

/** Rendez-vous dont le rappel doit sonner maintenant : début dans moins de `lead` minutes (et pas encore commencé depuis plus d'une minute) */
export function dueReminders<T extends { id: string; starts_at: string; all_day: boolean; status: string; masked: boolean; responsible_id: string | null }>(
  list: T[],
  me: string,
  lead: number,
  now: number,
  already: Set<string>,
): T[] {
  return list.filter((a) => {
    if (a.responsible_id !== me || a.masked || a.all_day || ['annule', 'reporte', 'termine'].includes(a.status)) return false;
    const start = Date.parse(a.starts_at);
    return now >= start - lead * 60_000 && now < start + 60_000 && !already.has(`${a.id}|${a.starts_at}`);
  });
}
