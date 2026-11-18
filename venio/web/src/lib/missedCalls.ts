// Types de l'API « Récupération des appels manqués » (backend : venio/modules/missed_calls.py).

export type McConfig = {
  validation_delay_s: number;
  tone: string;
  custom_text: string | null;
  stop_mention: string | null;
  sender: string | null;
  send_days: number[];
  send_start: string;
  send_end: string;
  skip_holidays: boolean;
  out_of_hours: "defer" | "skip";
  max_defer_hours: number;
  burst_window_hours: number;
  max_per_number_30d: number;
  recent_request_days: number;
};

export type SmsPreview = { text: string; length: number; encoding: "GSM-7" | "UCS-2"; segments: number; costly_chars: string[] };

export type McSettings = {
  enabled: boolean;
  config: McConfig;
  preview: SmsPreview;
  templates: { tone: string; label: string; text: string }[];
  credits: { limit: number | null; used: number };
  paid_sending_enabled: boolean;
  max_segments: number;
};

export type McLine = {
  id: string; label: string; mode: string; provider: string; status: "active" | "paused";
  business_number: string | null; last_event_at: string | null; is_test: boolean;
};

export type McExclusion = { number: string; display: string; kind: "excluded" | "opt_out"; label: string | null; created_at: string };

export type McCall = {
  call_id: string; recovery_id: string | null; case_file_id: string | null; is_test: boolean;
  outcome: "pending" | "answered" | "transferred" | "missed" | "abandoned";
  started_at: string; ended_at: string | null; line_label: string;
  decision: "pending" | "sent" | "not_sent" | null; reason: string | null; reason_label: string | null; decided_at: string | null;
  clicked_at: string | null; click_count: number | null; form_started_at: string | null; booked_at: string | null; handled_at: string | null;
  credits: number | null; sms_status: string | null; sms_provider: string | null; sms_body: string | null; sms_error: string | null;
  number_masked: string; number_display: string; number_tel: string | null;
};

export type McStats = {
  days: number; calls: number; answered: number; missed: number; triggered: number; sent: number; not_delivered: number;
  failed: number; clicked: number; started: number; booked: number; pending: number;
  recovery_rate: number | null; reliable: boolean;
  not_sent_reasons: { reason: string; label: string; count: number }[];
  credits: { limit: number | null; used: number };
};

export const OUTCOME_LABELS: Record<McCall["outcome"], string> = {
  pending: "En cours", answered: "Décroché", transferred: "Transféré", missed: "Manqué", abandoned: "Raccroché avant réponse",
};

/** Ce qui est réellement arrivé au SMS : on ne présente jamais un SMS simulé comme envoyé. */
export function smsState(c: McCall): { label: string; tone: "good" | "bad" | "neutral" | "warning" | "info" } {
  if (c.decision === null) return { label: "—", tone: "neutral" };
  if (c.decision === "pending") return { label: "En attente de validation", tone: "info" };
  if (c.decision === "not_sent") return { label: "Non envoyé", tone: "neutral" };
  if (c.sms_status === "sent") return { label: "Envoyé", tone: "good" };
  if (c.sms_status === "failed") return { label: "Échec d'envoi", tone: "bad" };
  if (c.sms_status === "logged" && c.sms_provider === "simulateur") return { label: "Simulé (ligne de test)", tone: "info" };
  if (c.sms_status === "logged" && c.sms_provider === "demonstration") return { label: "Simulé (démonstration)", tone: "info" };
  if (c.sms_status === "logged") return { label: "Non envoyé : envois payants désactivés", tone: "warning" };
  return { label: "En cours d'envoi", tone: "info" };
}

export const WEEKDAYS = [[1, "Lun."], [2, "Mar."], [3, "Mer."], [4, "Jeu."], [5, "Ven."], [6, "Sam."], [7, "Dim."]] as const;
