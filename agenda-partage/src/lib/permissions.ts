import type { AppSettings, AppointmentRow, Profile } from './types';

/**
 * Reflet côté interface des règles appliquées par la base (fonctions can_*_appointment).
 * Sert uniquement à afficher ou masquer des boutons : la base reste seule juge.
 */
export function canViewAppointment(a: Pick<AppointmentRow, 'created_by' | 'responsible_id' | 'is_private'>, me: Profile | null): boolean {
  if (!me?.is_active) return false;
  return !a.is_private || me.role === 'admin' || a.created_by === me.id || a.responsible_id === me.id;
}

export function canEditAppointment(a: Pick<AppointmentRow, 'created_by' | 'responsible_id' | 'is_private'>, me: Profile | null): boolean {
  if (!me?.is_active) return false;
  if (me.role === 'admin') return true;
  return a.created_by === me.id || a.responsible_id === me.id || (!a.is_private && me.can_edit_all);
}

export function canDeleteAppointment(
  a: Pick<AppointmentRow, 'created_by'>,
  me: Profile | null,
  settings: Pick<AppSettings, 'collaborators_can_delete'> | null,
): boolean {
  if (!me?.is_active) return false;
  if (me.role === 'admin') return true;
  return a.created_by === me.id && !!settings?.collaborators_can_delete;
}

export function isAdmin(me: Profile | null): boolean {
  return !!me && me.is_active && me.role === 'admin';
}
