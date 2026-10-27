import type { AppointmentStatus } from './types';

export const STATUS_META: Record<AppointmentStatus, { label: string; color: string; badge: string }> = {
  a_confirmer: { label: 'À confirmer', color: '#F59E0B', badge: 'bg-amber-100 text-amber-800 ring-amber-200' },
  confirme: { label: 'Confirmé', color: '#16A34A', badge: 'bg-green-100 text-green-800 ring-green-200' },
  en_cours: { label: 'En cours', color: '#2563EB', badge: 'bg-blue-100 text-blue-800 ring-blue-200' },
  termine: { label: 'Terminé', color: '#525252', badge: 'bg-neutral-200 text-neutral-700 ring-neutral-300' },
  annule: { label: 'Annulé', color: '#E30613', badge: 'bg-red-100 text-red-800 ring-red-200' },
  reporte: { label: 'Reporté', color: '#9333EA', badge: 'bg-purple-100 text-purple-800 ring-purple-200' },
};

export function statusLabel(status: AppointmentStatus): string {
  return STATUS_META[status]?.label ?? status;
}

/** Libellés des champs pour l'historique des modifications */
export const FIELD_LABELS: Record<string, string> = {
  title: 'Titre',
  starts_at: 'Début',
  ends_at: 'Fin',
  all_day: 'Journée entière',
  client_name: 'Client / participant',
  responsible_id: 'Responsable',
  category_id: 'Catégorie',
  location: 'Lieu',
  description: 'Description',
  notes: 'Notes',
  status: 'Statut',
  is_private: 'Confidentiel',
  links: 'Liens',
};
