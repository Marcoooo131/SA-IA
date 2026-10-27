import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { AppointmentDetail } from '../components/AppointmentDetail';
import { AppointmentForm } from '../components/AppointmentForm';
import { navigate, useRoute } from '../lib/router';
import type { AppointmentRow } from '../lib/types';
import { appointmentToForm, emptyForm, type AppointmentFormValues } from '../lib/validation';
import { useAuth } from './AuthContext';
import { useTeam } from './TeamContext';

interface EditorApi {
  /** Ouvre le formulaire de création, éventuellement sur un créneau */
  openNew: (slot?: { start?: string; end?: string; allDay?: boolean }) => void;
  openEdit: (row: AppointmentRow) => void;
  openDetail: (id: string) => void;
}

const EditorContext = createContext<EditorApi | null>(null);

/** Formulaire et fiche détaillée accessibles depuis n'importe quelle page */
export function EditorProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const { settings, zone, bumpAppointments } = useTeam();
  const route = useRoute();
  const [form, setForm] = useState<{ open: boolean; editingId: string | null; values: AppointmentFormValues } | null>(null);

  const openNew = useCallback<EditorApi['openNew']>(
    (slot) => {
      setForm({
        open: true,
        editingId: null,
        values: emptyForm({
          zone,
          start: slot?.start,
          end: slot?.end,
          allDay: slot?.allDay,
          defaultDurationMinutes: settings?.default_duration_minutes ?? 60,
          responsibleId: profile?.id,
        }),
      });
    },
    [zone, settings?.default_duration_minutes, profile?.id],
  );

  const openEdit = useCallback(
    (row: AppointmentRow) => {
      setForm({ open: true, editingId: row.id, values: appointmentToForm({ ...row, masked: false, can_edit: true, can_delete: false }, zone) });
    },
    [zone],
  );

  const openDetail = useCallback((id: string) => navigate({ appointmentId: id }), []);

  const api = useMemo(() => ({ openNew, openEdit, openDetail }), [openNew, openEdit, openDetail]);

  return (
    <EditorContext.Provider value={api}>
      {children}
      <AppointmentDetail
        appointmentId={route.appointmentId}
        onClose={() => navigate({ appointmentId: null })}
        onEdit={(row) => openEdit(row)}
      />
      {form && (
        <AppointmentForm
          open={form.open}
          editingId={form.editingId}
          initialValues={form.values}
          onClose={() => setForm(null)}
          onSaved={(row) => {
            bumpAppointments();
            if (!form.editingId) navigate({ appointmentId: row.id });
          }}
        />
      )}
    </EditorContext.Provider>
  );
}

export function useEditor(): EditorApi {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error('useEditor hors de EditorProvider');
  return ctx;
}
