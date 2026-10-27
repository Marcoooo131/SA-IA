import { AlertTriangle, Link2, Loader2, Lock, Paperclip, Plus, Trash2, Upload } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTeam } from '../context/TeamContext';
import { useToast } from '../context/ToastContext';
import { createAppointment, findConflicts, MAX_ATTACHMENT_BYTES, updateAppointment, uploadAttachment } from '../data/api';
import { formatRange, zoneOffsetLabel } from '../lib/datetime';
import { friendlyError } from '../lib/errors';
import { STATUS_META } from '../lib/status';
import { STATUSES, type AppointmentRow, type Conflict } from '../lib/types';
import {
  formToPayload,
  validateAppointmentForm,
  type AppointmentFormValues,
  type FormErrors,
} from '../lib/validation';
import { Modal, Toggle, displayName } from './ui';

export interface AppointmentFormProps {
  open: boolean;
  onClose: () => void;
  /** Rendez-vous modifié (absent = création) */
  editingId?: string | null;
  initialValues: AppointmentFormValues;
  onSaved?: (row: AppointmentRow) => void;
}

function Field({ label, error, children, required, hint }: { label: string; error?: string; children: ReactNode; required?: boolean; hint?: ReactNode }) {
  return (
    <div>
      <label className="label">
        {label}
        {required && <span className="text-brand"> *</span>}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-neutral-500">{hint}</p>}
      {error && <p className="mt-1 text-xs font-medium text-brand">{error}</p>}
    </div>
  );
}

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} Ko` : `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}

export function AppointmentForm({ open, onClose, editingId, initialValues, onSaved }: AppointmentFormProps) {
  const { profile } = useAuth();
  const { activeProfiles, profileMap, categories, zone } = useTeam();
  const toast = useToast();
  const [values, setValues] = useState<AppointmentFormValues>(initialValues);
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [checking, setChecking] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [multiDay, setMultiDay] = useState(initialValues.endDate !== initialValues.date);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setValues(initialValues);
      setErrors({});
      setFiles([]);
      setConflicts([]);
      setMultiDay(initialValues.endDate !== initialValues.date);
    }
  }, [open, initialValues]);

  const set = <K extends keyof AppointmentFormValues>(key: K, v: AppointmentFormValues[K]) => {
    setValues((prev) => {
      const next = { ...prev, [key]: v };
      // Sans « plusieurs jours », la date de fin suit la date de début
      if (key === 'date' && !multiDay) next.endDate = v as string;
      return next;
    });
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  // Payload calculé en continu pour l'aperçu et la détection des chevauchements
  const preview = useMemo(() => {
    const v = validateAppointmentForm(values);
    if (!v.ok) return null;
    try {
      return formToPayload(v.data, zone);
    } catch {
      return null;
    }
  }, [values, zone]);

  useEffect(() => {
    if (!open || !preview?.responsible_id || ['annule', 'reporte'].includes(preview.status)) {
      setConflicts([]);
      return;
    }
    let cancelled = false;
    setChecking(true);
    const t = setTimeout(async () => {
      try {
        const list = await findConflicts(preview.responsible_id!, preview.starts_at, preview.ends_at, editingId);
        if (!cancelled) setConflicts(list);
      } catch {
        if (!cancelled) setConflicts([]);
      } finally {
        if (!cancelled) setChecking(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open, preview?.responsible_id, preview?.starts_at, preview?.ends_at, preview?.status, editingId]);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const accepted: File[] = [];
    for (const f of Array.from(list)) {
      if (f.size > MAX_ATTACHMENT_BYTES) toast.warning(`« ${f.name} » dépasse 10 Mo et n'a pas été ajouté.`);
      else accepted.push(f);
    }
    setFiles((prev) => [...prev, ...accepted].slice(0, 10));
  };

  const submit = async () => {
    const v = validateAppointmentForm(values);
    if (!v.ok) {
      setErrors(v.errors);
      toast.warning('Vérifiez les champs signalés en rouge.');
      return;
    }
    setSaving(true);
    try {
      const payload = formToPayload(v.data, zone);
      const row = editingId ? await updateAppointment(editingId, payload) : await createAppointment(payload);
      let failedUploads = 0;
      for (const f of files) {
        try {
          await uploadAttachment(row.id, f);
        } catch (e) {
          failedUploads++;
          toast.error(`Pièce jointe « ${f.name} » : ${friendlyError(e)}`);
        }
      }
      toast.success(editingId ? 'Rendez-vous mis à jour' : 'Rendez-vous créé');
      if (conflicts.length) toast.warning('Attention : ce créneau chevauche un autre rendez-vous du responsable.');
      if (!failedUploads) setFiles([]);
      onSaved?.(row);
      onClose();
    } catch (e) {
      toast.error(e);
    } finally {
      setSaving(false);
    }
  };

  const responsibleName = displayName(profileMap.get(values.responsibleId), 'ce collaborateur');
  const activeCategories = categories.filter((c) => c.is_active || c.id === values.categoryId);

  return (
    <Modal
      open={open}
      onClose={() => !saving && onClose()}
      size="lg"
      title={editingId ? 'Modifier le rendez-vous' : 'Nouveau rendez-vous'}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="hidden text-xs text-neutral-500 sm:block">
            Heures en {zone} ({zoneOffsetLabel(zone)})
          </p>
          <div className="flex gap-2">
            <button className="btn-ghost flex-1 sm:flex-none" onClick={onClose} disabled={saving}>
              Annuler
            </button>
            <button className="btn-primary flex-1 sm:flex-none" onClick={submit} disabled={saving} data-testid="save-appointment">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {conflicts.length ? 'Enregistrer malgré tout' : 'Enregistrer'}
            </button>
          </div>
        </div>
      }
    >
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field label="Titre du rendez-vous" required error={errors.title}>
          <input
            className={`field ${errors.title ? 'field-error' : ''}`}
            value={values.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder="Ex. Visite technique, rendez-vous client…"
            maxLength={200}
            autoFocus
            name="title"
          />
        </Field>

        {/* Date et heures */}
        <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 md:p-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="col-span-2 md:col-span-2">
              <Field label={multiDay || values.allDay ? 'Date de début' : 'Date'} required error={errors.date}>
                <input type="date" className="field" value={values.date} onChange={(e) => set('date', e.target.value)} name="date" />
              </Field>
            </div>
            {(multiDay || values.allDay) && (
              <div className="col-span-2 md:col-span-2">
                <Field label="Date de fin" required error={errors.endDate}>
                  <input type="date" className="field" value={values.endDate} min={values.date} onChange={(e) => set('endDate', e.target.value)} name="endDate" />
                </Field>
              </div>
            )}
            {!values.allDay && (
              <>
                <Field label="Début" required error={errors.startTime}>
                  <input type="time" step={300} className="field" value={values.startTime} onChange={(e) => set('startTime', e.target.value)} name="startTime" />
                </Field>
                <Field label="Fin" required error={errors.endTime}>
                  <input type="time" step={300} className="field" value={values.endTime} onChange={(e) => set('endTime', e.target.value)} name="endTime" />
                </Field>
              </>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
            <Toggle checked={values.allDay} onChange={(v) => set('allDay', v)} label="Journée entière" />
            {!values.allDay && (
              <Toggle
                checked={multiDay}
                onChange={(v) => {
                  setMultiDay(v);
                  if (!v) set('endDate', values.date);
                }}
                label="Sur plusieurs jours"
              />
            )}
          </div>
          {preview && (
            <p className="mt-3 text-sm font-medium text-neutral-700">
              {formatRange(preview.starts_at, preview.ends_at, preview.all_day, zone)}
            </p>
          )}
        </div>

        {/* Avertissement de chevauchement */}
        {(conflicts.length > 0 || checking) && (
          <div
            className={`flex gap-3 rounded-xl border p-3 text-sm ${conflicts.length ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-neutral-200 text-neutral-500'}`}
            role={conflicts.length ? 'alert' : undefined}
          >
            {conflicts.length ? <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" /> : <Loader2 className="h-4 w-4 animate-spin" />}
            {conflicts.length ? (
              <div>
                <p className="font-semibold">Chevauchement : {responsibleName} a déjà un rendez-vous sur ce créneau.</p>
                <ul className="mt-1 space-y-0.5">
                  {conflicts.map((c) => (
                    <li key={c.id}>
                      • {c.title} — <span>{formatRange(c.starts_at, c.ends_at, false, zone)}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-xs">Vous pouvez enregistrer quand même ou choisir un autre créneau.</p>
              </div>
            ) : (
              <span>Vérification des disponibilités…</span>
            )}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Client ou participant" error={errors.clientName}>
            <input className="field" value={values.clientName} onChange={(e) => set('clientName', e.target.value)} placeholder="Nom du client" autoComplete="off" name="clientName" />
          </Field>
          <Field label="Collaborateur responsable" error={errors.responsibleId}>
            <select className="field" value={values.responsibleId} onChange={(e) => set('responsibleId', e.target.value)} name="responsibleId">
              <option value="">— Non attribué —</option>
              {activeProfiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {displayName(p)}
                  {p.id === profile?.id ? ' (moi)' : ''}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Catégorie" error={errors.categoryId}>
            <select className="field" value={values.categoryId} onChange={(e) => set('categoryId', e.target.value)} name="categoryId">
              <option value="">— Aucune —</option>
              {activeCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Lieu" error={errors.location}>
            <input className="field" value={values.location} onChange={(e) => set('location', e.target.value)} placeholder="Adresse, salle, visio…" name="location" />
          </Field>
        </div>

        <div>
          <span className="label">Statut</span>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Statut">
            {STATUSES.map((s) => {
              const active = values.status === s;
              return (
                <button
                  type="button"
                  key={s}
                  role="radio"
                  aria-checked={active}
                  onClick={() => set('status', s)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                    active ? 'border-ink bg-ink text-white' : 'border-neutral-300 bg-white text-neutral-700 hover:border-neutral-400'
                  }`}
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: STATUS_META[s].color }} />
                  {STATUS_META[s].label}
                </button>
              );
            })}
          </div>
        </div>

        <Field label="Description" error={errors.description}>
          <textarea className="field min-h-24" value={values.description} onChange={(e) => set('description', e.target.value)} placeholder="Objet du rendez-vous, informations utiles…" name="description" />
        </Field>
        <Field label="Notes complémentaires" error={errors.notes}>
          <textarea className="field min-h-20" value={values.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Code d'accès, matériel à prévoir…" name="notes" />
        </Field>

        {/* Liens */}
        <div>
          <span className="label">Liens</span>
          <div className="space-y-2">
            {values.links.map((l, i) => (
              <div key={i} className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-2 sm:flex-row sm:border-0 sm:p-0">
                <input
                  className="field sm:w-40"
                  placeholder="Libellé"
                  value={l.label}
                  onChange={(e) => set('links', values.links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                />
                <div className="flex flex-1 gap-2">
                  <input
                    className={`field flex-1 ${errors[`links.${i}.url`] ? 'field-error' : ''}`}
                    placeholder="https://…"
                    type="url"
                    inputMode="url"
                    value={l.url}
                    onChange={(e) => set('links', values.links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))}
                  />
                  <button type="button" className="btn-icon" aria-label="Retirer le lien" onClick={() => set('links', values.links.filter((_, j) => j !== i))}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                {errors[`links.${i}.url`] && <p className="text-xs text-brand sm:hidden">{errors[`links.${i}.url`]}</p>}
              </div>
            ))}
            {Object.keys(errors).some((k) => k.startsWith('links.')) && (
              <p className="hidden text-xs font-medium text-brand sm:block">Un lien doit commencer par http:// ou https://</p>
            )}
            <button type="button" className="btn-ghost py-2" onClick={() => set('links', [...values.links, { label: '', url: '' }])} disabled={values.links.length >= 20}>
              <Link2 className="h-4 w-4" /> Ajouter un lien
            </button>
          </div>
        </div>

        {/* Pièces jointes */}
        <div>
          <span className="label">Pièces jointes</span>
          {files.length > 0 && (
            <ul className="mb-2 space-y-1">
              {files.map((f, i) => (
                <li key={i} className="flex items-center gap-2 rounded-lg bg-neutral-50 px-3 py-2 text-sm">
                  <Paperclip className="h-4 w-4 text-neutral-400" />
                  <span className="flex-1 truncate">{f.name}</span>
                  <span className="text-xs text-neutral-500">{formatSize(f.size)}</span>
                  <button type="button" className="text-neutral-400 hover:text-brand" onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label="Retirer">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <input ref={fileInput} type="file" multiple className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
          <button type="button" className="btn-ghost py-2" onClick={() => fileInput.current?.click()}>
            <Upload className="h-4 w-4" /> Joindre des fichiers
          </button>
          <p className="mt-1 text-xs text-neutral-500">10 Mo maximum par fichier. Stockage privé, visible uniquement par ceux qui voient le rendez-vous.</p>
        </div>

        <div className="rounded-xl border border-neutral-200 p-3">
          <Toggle
            checked={values.isPrivate}
            onChange={(v) => set('isPrivate', v)}
            label={
              <span className="inline-flex items-center gap-1.5">
                <Lock className="h-4 w-4" /> Rendez-vous confidentiel
              </span>
            }
            description="Seuls vous, le responsable et les administrateurs en verront le contenu. Les autres collègues verront seulement un créneau « Occupé »."
          />
        </div>
        <button type="submit" className="hidden" aria-hidden tabIndex={-1}>
          <Plus />
        </button>
      </form>
    </Modal>
  );
}
