export type Role = 'admin' | 'collaborator';

export const STATUSES = ['a_confirmer', 'confirme', 'en_cours', 'termine', 'annule', 'reporte'] as const;
export type AppointmentStatus = (typeof STATUSES)[number];

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  can_edit_all: boolean;
  is_active: boolean;
  color: string;
  phone: string | null;
  timezone: string | null;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  name: string;
  color: string;
  position: number;
  is_active: boolean;
}

export interface AppSettings {
  organization_name: string;
  timezone: string;
  day_start: string;
  day_end: string;
  default_duration_minutes: number;
  collaborators_can_delete: boolean;
  updated_at: string;
}

export interface AppointmentLink {
  label: string;
  url: string;
}

export interface Appointment {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  client_name: string | null;
  responsible_id: string | null;
  category_id: string | null;
  location: string | null;
  description: string | null;
  notes: string | null;
  status: AppointmentStatus;
  is_private: boolean;
  links: AppointmentLink[];
  created_by: string | null;
  updated_by: string | null;
  created_at: string | null;
  updated_at: string | null;
  /** Rendez-vous privé d'un autre : seul le créneau est connu */
  masked: boolean;
  can_edit: boolean;
  can_delete: boolean;
}

/** Ligne brute de la table appointments (sans les champs calculés) */
export type AppointmentRow = Omit<Appointment, 'masked' | 'can_edit' | 'can_delete'>;

export type AppointmentWrite = Pick<
  AppointmentRow,
  | 'title'
  | 'starts_at'
  | 'ends_at'
  | 'all_day'
  | 'client_name'
  | 'responsible_id'
  | 'category_id'
  | 'location'
  | 'description'
  | 'notes'
  | 'status'
  | 'is_private'
  | 'links'
>;

export interface Comment {
  id: string;
  appointment_id: string;
  author_id: string | null;
  kind: 'comment' | 'post_note';
  body: string;
  created_at: string;
  updated_at: string;
}

export interface Attachment {
  id: string;
  appointment_id: string;
  storage_path: string;
  file_name: string;
  size_bytes: number;
  mime_type: string | null;
  uploaded_by: string | null;
  created_at: string;
}

export interface HistoryEntry {
  id: number;
  appointment_id: string;
  appointment_title: string;
  action: 'created' | 'updated' | 'deleted' | 'comment' | 'attachment';
  changes: Record<string, unknown>;
  actor_id: string | null;
  responsible_id: string | null;
  created_at: string;
}

export interface AppNotification {
  id: number;
  user_id: string;
  appointment_id: string | null;
  kind: 'assigned' | 'updated' | 'cancelled' | 'comment' | 'deleted';
  title: string;
  body: string;
  actor_id: string | null;
  read_at: string | null;
  created_at: string;
}

export interface Conflict {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  masked: boolean;
}
