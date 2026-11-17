const TZ_DEFAULT = "Europe/Paris";

export function fmtDateTime(iso: string, tz = TZ_DEFAULT): string {
  return new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: tz }).format(new Date(iso));
}
export function fmtDate(iso: string, tz = TZ_DEFAULT): string {
  return new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: tz }).format(new Date(iso));
}
export function fmtTime(iso: string, tz = TZ_DEFAULT): string {
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: tz }).format(new Date(iso));
}
export function fmtDayLabel(isoDate: string): { weekday: string; day: string; month: string } {
  const d = new Date(`${isoDate}T12:00:00`);
  return {
    weekday: new Intl.DateTimeFormat("fr-FR", { weekday: "short" }).format(d).replace(".", ""),
    day: String(d.getDate()),
    month: new Intl.DateTimeFormat("fr-FR", { month: "short" }).format(d).replace(".", ""),
  };
}
export function addDays(isoDate: string, n: number): string {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
export function todayIso(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
export function pct(v: number | null | undefined): string {
  return v === null || v === undefined ? "—" : `${Math.round(v * 100)} %`;
}

export const MEETING_LABELS: Record<string, string> = {
  on_site: "À domicile / sur place", at_location: "Dans nos locaux", video: "En visio", phone: "Par téléphone",
};
export const CASE_STATUS: Record<string, string> = {
  new: "Nouvelle demande", to_process: "À traiter", waiting: "En attente", confirmed: "Confirmée",
  to_recontact: "À recontacter", postponed: "Reportée", cancelled: "Annulée", done: "Terminée", no_show: "Client absent",
};
export const BOOKING_STATUS: Record<string, string> = {
  confirmed: "Confirmé", cancelled: "Annulé", completed: "Terminé", no_show: "Absent", held: "En cours", expired: "Expiré",
};

export const NOTIF_STATUS: Record<string, string> = {
  scheduled: "Programmé", sent: "Envoyé", logged: "Non envoyé (mode test)", failed: "Échec", cancelled: "Annulé", skipped: "Ignoré", sending: "En cours",
};
export const TEMPLATE_LABELS: Record<string, string> = {
  client_confirmation: "Confirmation au client", client_reminder: "Rappel J-1 au client", client_cancellation: "Annulation au client",
  client_rescheduled: "Report au client", business_new_booking: "Alerte nouvelle demande", business_cancellation: "Alerte annulation", business_rescheduled: "Alerte report",
};
