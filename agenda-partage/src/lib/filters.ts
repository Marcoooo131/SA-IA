import type { Appointment, AppointmentStatus, Category, Profile } from './types';

export interface AgendaFilters {
  responsibleId: string; // '' = toute l'équipe
  categoryId: string;
  status: AppointmentStatus | '';
  query: string;
  hideCancelled: boolean;
}

export const DEFAULT_FILTERS: AgendaFilters = {
  responsibleId: '',
  categoryId: '',
  status: '',
  query: '',
  hideCancelled: false,
};

function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Filtre local (instantané) des rendez-vous déjà chargés */
export function applyFilters(
  list: Appointment[],
  f: AgendaFilters,
  profiles: Map<string, Profile>,
  categories: Map<string, Category>,
): Appointment[] {
  const terms = normalize(f.query.trim()).split(/\s+/).filter(Boolean);
  return list.filter((a) => {
    if (f.responsibleId && a.responsible_id !== f.responsibleId) return false;
    if (f.categoryId && a.category_id !== f.categoryId) return false;
    if (f.status && (a.masked || a.status !== f.status)) return false;
    if (f.hideCancelled && !a.masked && a.status === 'annule') return false;
    if (terms.length) {
      if (a.masked) return false;
      const haystack = normalize(
        [
          a.title,
          a.client_name,
          a.location,
          a.description,
          a.notes,
          a.responsible_id ? profiles.get(a.responsible_id)?.full_name : '',
          a.category_id ? categories.get(a.category_id)?.name : '',
        ]
          .filter(Boolean)
          .join(' '),
      );
      if (!terms.every((t) => haystack.includes(t))) return false;
    }
    return true;
  });
}

export function activeFilterCount(f: AgendaFilters): number {
  return [f.responsibleId, f.categoryId, f.status, f.hideCancelled ? 'x' : ''].filter(Boolean).length;
}

/** Deux intervalles [début, fin[ se chevauchent-ils ? */
export function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return Date.parse(aStart) < Date.parse(bEnd) && Date.parse(aEnd) > Date.parse(bStart);
}

/** Chevauchements locaux pour un responsable (contrôle instantané avant la vérification serveur) */
export function localConflicts(
  list: Appointment[],
  responsibleId: string | null,
  startsAt: string,
  endsAt: string,
  excludeId?: string | null,
): Appointment[] {
  if (!responsibleId) return [];
  return list.filter(
    (a) =>
      a.responsible_id === responsibleId &&
      a.id !== excludeId &&
      !(['annule', 'reporte'] as string[]).includes(a.status) &&
      overlaps(a.starts_at, a.ends_at, startsAt, endsAt),
  );
}
