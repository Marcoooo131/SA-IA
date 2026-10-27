import { formatDate, formatTime } from './datetime';
import { statusLabel } from './status';
import type { Appointment, Category, Profile } from './types';

function escapeCell(value: string): string {
  // Neutralise les formules (=, +, -, @) interprétées par Excel
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Export CSV (séparateur « ; » et BOM UTF-8 : s'ouvre directement dans Excel en français) */
export function appointmentsToCsv(
  appointments: Appointment[],
  profiles: Map<string, Profile>,
  categories: Map<string, Category>,
  zone: string,
): string {
  const header = [
    'Date', 'Début', 'Fin', 'Journée entière', 'Titre', 'Client / participant', 'Responsable',
    'Catégorie', 'Statut', 'Lieu', 'Description', 'Notes', 'Confidentiel', 'Liens',
  ];
  const rows = appointments
    .filter((a) => !a.masked)
    .map((a) => [
      formatDate(a.starts_at, zone, 'dd/LL/yyyy'),
      a.all_day ? '' : formatTime(a.starts_at, zone),
      a.all_day ? '' : formatTime(a.ends_at, zone),
      a.all_day ? 'oui' : 'non',
      a.title,
      a.client_name ?? '',
      (a.responsible_id && profiles.get(a.responsible_id)?.full_name) || '',
      (a.category_id && categories.get(a.category_id)?.name) || '',
      statusLabel(a.status),
      a.location ?? '',
      a.description ?? '',
      a.notes ?? '',
      a.is_private ? 'oui' : 'non',
      (a.links ?? []).map((l) => l.url).join(' '),
    ]);
  return '﻿' + [header, ...rows].map((r) => r.map(escapeCell).join(';')).join('\r\n');
}

export function downloadText(content: string, fileName: string, mime = 'text/csv;charset=utf-8'): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
