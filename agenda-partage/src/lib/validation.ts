import { DateTime } from 'luxon';
import { z } from 'zod';
import { localToIso, toZone } from './datetime';
import { STATUSES, type Appointment, type AppointmentWrite } from './types';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const URL_RE = /^https?:\/\/\S+$/i;

const optionalText = (max: number, label: string) =>
  z.string().trim().max(max, `${label} : ${max} caractères maximum`);

export const linkSchema = z.object({
  label: optionalText(200, 'Libellé du lien'),
  url: z
    .string()
    .trim()
    .max(2000, 'Lien trop long')
    .regex(URL_RE, 'Le lien doit commencer par http:// ou https://'),
});

export const appointmentFormSchema = z
  .object({
    title: z.string().trim().min(1, 'Le titre est obligatoire').max(200, 'Titre : 200 caractères maximum'),
    date: z.string().regex(DATE_RE, 'Date invalide'),
    endDate: z.string().regex(DATE_RE, 'Date de fin invalide'),
    startTime: z.string(),
    endTime: z.string(),
    allDay: z.boolean(),
    clientName: optionalText(200, 'Client'),
    responsibleId: z.string(),
    categoryId: z.string(),
    location: optionalText(300, 'Lieu'),
    description: optionalText(5000, 'Description'),
    notes: optionalText(5000, 'Notes'),
    status: z.enum(STATUSES),
    isPrivate: z.boolean(),
    links: z.array(linkSchema).max(20, '20 liens maximum'),
  })
  .superRefine((v, ctx) => {
    if (v.allDay) {
      if (v.endDate < v.date) {
        ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'La date de fin précède la date de début' });
      }
      return;
    }
    if (!TIME_RE.test(v.startTime)) ctx.addIssue({ code: 'custom', path: ['startTime'], message: 'Heure de début invalide' });
    if (!TIME_RE.test(v.endTime)) ctx.addIssue({ code: 'custom', path: ['endTime'], message: 'Heure de fin invalide' });
    if (TIME_RE.test(v.startTime) && TIME_RE.test(v.endTime) && `${v.endDate}T${v.endTime}` <= `${v.date}T${v.startTime}`) {
      ctx.addIssue({ code: 'custom', path: ['endTime'], message: "L'heure de fin doit être après l'heure de début" });
    }
    if (DateTime.fromISO(v.endDate).diff(DateTime.fromISO(v.date), 'days').days > 62) {
      ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'Un rendez-vous ne peut pas dépasser 62 jours' });
    }
  });

export type AppointmentFormValues = z.infer<typeof appointmentFormSchema>;
export type FormErrors = Partial<Record<keyof AppointmentFormValues | string, string>>;

export function validateAppointmentForm(
  values: AppointmentFormValues,
): { ok: true; data: AppointmentFormValues } | { ok: false; errors: FormErrors } {
  const parsed = appointmentFormSchema.safeParse(values);
  if (parsed.success) return { ok: true, data: parsed.data };
  const errors: FormErrors = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path.join('.');
    if (!errors[key]) errors[key] = issue.message;
  }
  return { ok: false, errors };
}

const emptyToNull = (s: string) => (s.trim() === '' ? null : s.trim());

/** Valeurs du formulaire → ligne à écrire en base (instants en UTC) */
export function formToPayload(v: AppointmentFormValues, zone: string): AppointmentWrite {
  let startsAt: string | null;
  let endsAt: string | null;
  if (v.allDay) {
    startsAt = localToIso(v.date, '00:00', zone);
    const nextDay = DateTime.fromISO(v.endDate).plus({ days: 1 }).toISODate()!;
    endsAt = localToIso(nextDay, '00:00', zone);
  } else {
    startsAt = localToIso(v.date, v.startTime, zone);
    endsAt = localToIso(v.endDate, v.endTime, zone);
  }
  if (!startsAt || !endsAt) throw new Error('Date ou heure invalide');
  return {
    title: v.title.trim(),
    starts_at: startsAt,
    ends_at: endsAt,
    all_day: v.allDay,
    client_name: emptyToNull(v.clientName),
    responsible_id: v.responsibleId || null,
    category_id: v.categoryId || null,
    location: emptyToNull(v.location),
    description: emptyToNull(v.description),
    notes: emptyToNull(v.notes),
    status: v.status,
    is_private: v.isPrivate,
    links: v.links.map((l) => ({ label: l.label.trim(), url: l.url.trim() })),
  };
}

/** Rendez-vous existant → valeurs du formulaire, exprimées dans le fuseau `zone` */
export function appointmentToForm(a: Appointment, zone: string): AppointmentFormValues {
  const start = toZone(a.starts_at, zone);
  let end = toZone(a.ends_at, zone);
  if (a.all_day) end = end.minus({ days: 1 });
  return {
    title: a.title,
    date: start.toISODate()!,
    endDate: end.toISODate()!,
    startTime: start.toFormat('HH:mm'),
    endTime: a.all_day ? '' : end.toFormat('HH:mm'),
    allDay: a.all_day,
    clientName: a.client_name ?? '',
    responsibleId: a.responsible_id ?? '',
    categoryId: a.category_id ?? '',
    location: a.location ?? '',
    description: a.description ?? '',
    notes: a.notes ?? '',
    status: a.status,
    isPrivate: a.is_private,
    links: a.links ?? [],
  };
}

/**
 * Formulaire vierge, pré-rempli avec un créneau (sélection dans le calendrier) ou l'heure suivante.
 * `start` / `end` : chaîne ISO (avec décalage, ou sans → interprétée dans `zone`, ou simple date).
 */
export function emptyForm(opts: {
  zone: string;
  start?: string;
  end?: string;
  allDay?: boolean;
  defaultDurationMinutes: number;
  responsibleId?: string;
}): AppointmentFormValues {
  const allDay = !!opts.allDay;
  let start = opts.start
    ? DateTime.fromISO(opts.start, { zone: opts.zone })
    : DateTime.now().setZone(opts.zone).startOf('hour').plus({ hours: 1 });
  if (!start.isValid) start = DateTime.now().setZone(opts.zone).startOf('hour').plus({ hours: 1 });
  let end = opts.end ? DateTime.fromISO(opts.end, { zone: opts.zone }) : start.plus({ minutes: opts.defaultDurationMinutes });
  if (!end.isValid || end <= start) end = start.plus({ minutes: opts.defaultDurationMinutes });
  // Fin exclusive d'une sélection « journée entière » : le dernier jour est la veille
  const lastDay = allDay ? end.minus({ days: 1 }) : end;
  const defaultStart = DateTime.fromObject({ hour: 9 });
  return {
    title: '',
    date: start.toISODate()!,
    endDate: (lastDay < start ? start : lastDay).toISODate()!,
    startTime: allDay ? defaultStart.toFormat('HH:mm') : start.toFormat('HH:mm'),
    endTime: allDay ? defaultStart.plus({ minutes: opts.defaultDurationMinutes }).toFormat('HH:mm') : end.toFormat('HH:mm'),
    allDay,
    clientName: '',
    responsibleId: opts.responsibleId ?? '',
    categoryId: '',
    location: '',
    description: '',
    notes: '',
    status: 'a_confirmer',
    isPrivate: false,
    links: [],
  };
}
