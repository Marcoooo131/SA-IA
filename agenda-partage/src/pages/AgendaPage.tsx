import type { DateSelectArg, EventClickArg, EventContentArg, EventDropArg, EventInput } from '@fullcalendar/core';
import frLocale from '@fullcalendar/core/locales/fr';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin, { type EventResizeDoneArg } from '@fullcalendar/interaction';
import listPlugin from '@fullcalendar/list';
import luxonPlugin from '@fullcalendar/luxon3';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import {
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Download,
  Filter,
  List,
  Lock,
  RotateCw,
  Search,
  Square,
  UserRound,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Spinner, displayName } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useEditor } from '../context/EditorContext';
import { useTeam } from '../context/TeamContext';
import { useToast } from '../context/ToastContext';
import { findConflicts, updateAppointment } from '../data/api';
import { useAgenda } from '../data/useAgenda';
import { appointmentsToCsv, downloadText } from '../lib/csv';
import { localToIso, ucfirst, zoneOffsetLabel } from '../lib/datetime';
import { activeFilterCount, applyFilters, DEFAULT_FILTERS, type AgendaFilters } from '../lib/filters';
import { STATUS_META } from '../lib/status';
import { STATUSES, type Appointment, type AppointmentStatus } from '../lib/types';

type ViewType = 'timeGridDay' | 'timeGridWeek' | 'dayGridMonth' | 'listWeek';
const VIEWS: { id: ViewType; label: string; icon: typeof CalendarDays }[] = [
  { id: 'timeGridDay', label: 'Jour', icon: Square },
  { id: 'timeGridWeek', label: 'Semaine', icon: CalendarRange },
  { id: 'dayGridMonth', label: 'Mois', icon: CalendarDays },
  { id: 'listWeek', label: 'Liste', icon: List },
];

function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function storageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* stockage indisponible : préférence non mémorisée */
  }
}

const isMobile = () => window.matchMedia('(max-width: 767px)').matches;

/** Convertit une date FullCalendar (ISO avec décalage, ou simple date) en instant UTC */
function fcToIso(str: string, zone: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(str) ? localToIso(str, '00:00', zone)! : new Date(str).toISOString();
}

export function AgendaPage() {
  const { profile } = useAuth();
  const { profileMap, categoryMap, activeProfiles, categories, settings, zone, bumpAppointments } = useTeam();
  const { openNew, openDetail } = useEditor();
  const toast = useToast();
  const calRef = useRef<FullCalendar>(null);
  const [range, setRange] = useState<{ from: Date; to: Date; title: string; view: ViewType } | null>(null);
  const [filters, setFilters] = useState<AgendaFilters>(() => {
    try {
      return { ...DEFAULT_FILTERS, ...JSON.parse(storageGet('agenda.filters') ?? '{}'), query: '' };
    } catch {
      return DEFAULT_FILTERS;
    }
  });
  const [showFilters, setShowFilters] = useState(false);
  const { appointments, setAppointments, loading, error, reload } = useAgenda(range?.from ?? null, range?.to ?? null);

  useEffect(() => {
    const { query: _q, ...persisted } = filters;
    storageSet('agenda.filters', JSON.stringify(persisted));
  }, [filters]);

  const initialView = useMemo<ViewType>(() => {
    const saved = storageGet('agenda.view') as ViewType | null;
    if (saved && VIEWS.some((v) => v.id === saved)) return saved;
    return isMobile() ? 'timeGridDay' : 'timeGridWeek';
  }, []);

  const visible = useMemo(() => applyFilters(appointments, filters, profileMap, categoryMap), [appointments, filters, profileMap, categoryMap]);

  const events = useMemo<EventInput[]>(
    () =>
      visible.map((a) => {
        const color = (a.category_id && categoryMap.get(a.category_id)?.color) || (a.responsible_id && profileMap.get(a.responsible_id)?.color) || '#E30613';
        return {
          id: a.id,
          title: a.title,
          start: a.starts_at,
          end: a.ends_at,
          allDay: a.all_day,
          editable: a.can_edit && !a.masked,
          color,
          extendedProps: { appt: a, color },
        };
      }),
    [visible, categoryMap, profileMap],
  );

  const api = () => calRef.current?.getApi();
  const changeView = (v: ViewType) => {
    api()?.changeView(v);
    storageSet('agenda.view', v);
  };

  const onSelect = (arg: DateSelectArg) => {
    api()?.unselect();
    if (arg.allDay && arg.view.type === 'dayGridMonth') {
      const days = Math.round((arg.end.getTime() - arg.start.getTime()) / 86_400_000);
      // Clic sur un jour du mois : rendez-vous à 9 h ; sélection de plusieurs jours : journée entière
      if (days <= 1) return openNew({ start: `${arg.startStr}T09:00` });
      return openNew({ start: arg.startStr, end: arg.endStr, allDay: true });
    }
    openNew({ start: arg.startStr, end: arg.endStr, allDay: arg.allDay });
  };

  const onEventClick = (arg: EventClickArg) => {
    const a = arg.event.extendedProps.appt as Appointment;
    if (a.masked) {
      toast.info(`Créneau confidentiel : ${displayName(profileMap.get(a.responsible_id ?? ''), 'un collègue')} est occupé.`);
      return;
    }
    openDetail(a.id);
  };

  const onMove = async (arg: EventDropArg | EventResizeDoneArg) => {
    const a = arg.event.extendedProps.appt as Appointment;
    const allDay = arg.event.allDay;
    const startsAt = fcToIso(arg.event.startStr, zone);
    let endsAt: string;
    if (arg.event.endStr) endsAt = fcToIso(arg.event.endStr, zone);
    else {
      const duration = allDay ? 86_400_000 : (settings?.default_duration_minutes ?? 60) * 60_000;
      endsAt = new Date(Date.parse(startsAt) + duration).toISOString();
    }
    // Mise à jour optimiste, annulée en cas de refus du serveur
    setAppointments((list) => list.map((x) => (x.id === a.id ? { ...x, starts_at: startsAt, ends_at: endsAt, all_day: allDay } : x)));
    try {
      await updateAppointment(a.id, { starts_at: startsAt, ends_at: endsAt, all_day: allDay });
      toast.success('Rendez-vous déplacé');
      bumpAppointments();
      if (a.responsible_id && !['annule', 'reporte'].includes(a.status)) {
        const conflicts = await findConflicts(a.responsible_id, startsAt, endsAt, a.id).catch(() => []);
        if (conflicts.length) {
          toast.warning(`Chevauchement : ${displayName(profileMap.get(a.responsible_id))} a déjà « ${conflicts[0]!.title} » sur ce créneau.`);
        }
      }
    } catch (e) {
      arg.revert();
      void reload();
      toast.error(e);
    }
  };

  const renderEvent = (arg: EventContentArg) => {
    const a = arg.event.extendedProps.appt as Appointment;
    const color = arg.event.extendedProps.color as string;
    const responsible = a.responsible_id ? profileMap.get(a.responsible_id) : undefined;
    const isList = arg.view.type.startsWith('list');
    const status = STATUS_META[a.status];
    if (isList) {
      return (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className={`font-semibold ${a.status === 'annule' ? 'line-through opacity-60' : ''}`}>
            {a.masked && <Lock className="mr-1 inline h-3.5 w-3.5" />}
            {a.title}
          </span>
          {a.client_name && <span className="text-neutral-600">· {a.client_name}</span>}
          {!a.masked && (
            <span className="inline-flex items-center gap-1 text-xs text-neutral-600">
              <span className="h-2 w-2 rounded-full" style={{ background: status.color }} />
              {status.label}
            </span>
          )}
          {responsible && <span className="text-xs text-neutral-500">· {displayName(responsible)}</span>}
        </div>
      );
    }
    const compact = arg.view.type === 'dayGridMonth';
    return (
      <div
        className={`appt-chip ${a.masked ? 'is-masked' : ''} ${a.status === 'annule' ? 'is-cancelled' : ''}`}
        style={{ ['--appt-color' as string]: color }}
        title={`${a.title}${a.client_name ? ` — ${a.client_name}` : ''}`}
      >
        <div className="flex items-center gap-1">
          {!a.masked && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: status.color }} />}
          {a.is_private && <Lock className="h-3 w-3 shrink-0" />}
          {compact && arg.timeText && <span className="shrink-0 font-medium opacity-70">{arg.timeText}</span>}
          <span className="appt-title truncate font-semibold">{a.title}</span>
        </div>
        {!compact && arg.timeText && <div className="truncate text-[11px] opacity-70">{arg.timeText}</div>}
        {!compact && a.client_name && <div className="truncate text-[11px]">{a.client_name}</div>}
        {!compact && responsible && <div className="truncate text-[11px] opacity-70">{displayName(responsible)}</div>}
      </div>
    );
  };

  const exportCsv = () => {
    if (!range) return;
    const rows = visible.filter((a) => !a.masked);
    if (!rows.length) return toast.info('Aucun rendez-vous à exporter sur cette période.');
    const csv = appointmentsToCsv(rows, profileMap, categoryMap, zone);
    const day = (d: Date) => d.toISOString().slice(0, 10);
    downloadText(csv, `agenda_${day(range.from)}_${day(range.to)}.csv`);
    toast.success(`${rows.length} rendez-vous exportés`);
  };

  const filterCount = activeFilterCount(filters);
  const setFilter = <K extends keyof AgendaFilters>(k: K, v: AgendaFilters[K]) => setFilters((f) => ({ ...f, [k]: v }));

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* Barre d'outils */}
      <div className="card flex flex-col gap-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <button className="btn-icon" onClick={() => api()?.prev()} aria-label="Période précédente">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button className="btn-ghost px-3 py-2" onClick={() => api()?.today()}>
              Aujourd'hui
            </button>
            <button className="btn-icon" onClick={() => api()?.next()} aria-label="Période suivante">
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
          <h2 className="min-w-0 flex-1 truncate text-base font-bold md:text-lg">{range ? ucfirst(range.title) : ''}</h2>
          {loading && <Spinner className="h-4 w-4" />}
          <div className="order-last flex w-full rounded-lg bg-neutral-100 p-1 md:order-none md:w-auto" role="tablist" aria-label="Vue">
            {VIEWS.map((v) => {
              const Icon = v.icon;
              const active = range?.view === v.id;
              return (
                <button
                  key={v.id}
                  role="tab"
                  aria-selected={active}
                  onClick={() => changeView(v.id)}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition md:flex-none ${
                    active ? 'bg-ink text-white shadow' : 'text-neutral-600 hover:text-ink'
                  }`}
                >
                  <Icon className="hidden h-4 w-4 sm:block" />
                  {v.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 basis-48">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              className="field py-2 pl-9"
              placeholder="Filtrer : client, titre, mot-clé…"
              value={filters.query}
              onChange={(e) => setFilter('query', e.target.value)}
              aria-label="Filtrer les rendez-vous affichés"
            />
          </div>
          <button
            className={`btn-ghost py-2 ${filters.responsibleId === profile?.id ? 'border-ink bg-ink text-white hover:bg-ink-soft' : ''}`}
            onClick={() => setFilter('responsibleId', filters.responsibleId === profile?.id ? '' : (profile?.id ?? ''))}
          >
            <UserRound className="h-4 w-4" /> Mes rendez-vous
          </button>
          <button className={`btn-ghost py-2 ${showFilters ? 'border-brand' : ''}`} onClick={() => setShowFilters((s) => !s)} aria-expanded={showFilters}>
            <Filter className="h-4 w-4" /> Filtres
            {filterCount > 0 && <span className="rounded-full bg-brand px-1.5 text-xs text-white">{filterCount}</span>}
          </button>
          <button className="btn-ghost py-2" onClick={exportCsv} title="Exporter la période affichée (CSV / Excel)">
            <Download className="h-4 w-4" /> <span className="hidden sm:inline">Export CSV</span>
          </button>
        </div>

        {showFilters && (
          <div className="animate-fade grid gap-3 border-t border-neutral-200 pt-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="label">Collaborateur</label>
              <select className="field" value={filters.responsibleId} onChange={(e) => setFilter('responsibleId', e.target.value)}>
                <option value="">Toute l'équipe</option>
                {activeProfiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {displayName(p)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Catégorie</label>
              <select className="field" value={filters.categoryId} onChange={(e) => setFilter('categoryId', e.target.value)}>
                <option value="">Toutes</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Statut</label>
              <select className="field" value={filters.status} onChange={(e) => setFilter('status', e.target.value as AppointmentStatus | '')}>
                <option value="">Tous</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_META[s].label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end gap-2">
              <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-lg border border-neutral-300 px-3 py-2.5 text-sm">
                <input type="checkbox" className="h-4 w-4 accent-[#E30613]" checked={filters.hideCancelled} onChange={(e) => setFilter('hideCancelled', e.target.checked)} />
                Masquer les annulés
              </label>
              <button className="btn-icon" onClick={() => setFilters(DEFAULT_FILTERS)} title="Réinitialiser les filtres" aria-label="Réinitialiser les filtres">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {categories.some((c) => c.is_active) && (
          <div className="hidden flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-600 md:flex">
            {categories
              .filter((c) => c.is_active)
              .map((c) => (
                <button key={c.id} onClick={() => setFilter('categoryId', filters.categoryId === c.id ? '' : c.id)} className={`inline-flex items-center gap-1.5 hover:text-ink ${filters.categoryId === c.id ? 'font-semibold text-ink' : ''}`}>
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: c.color }} />
                  {c.name}
                </button>
              ))}
            <span className="ml-auto text-neutral-400">
              Fuseau : {zone} ({zoneOffsetLabel(zone)})
            </span>
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-brand/30 bg-brand-soft px-4 py-3 text-sm text-brand-dark" role="alert">
          <span className="flex-1">Impossible de charger l'agenda : {error}</span>
          <button className="btn-ghost py-1.5" onClick={() => void reload()}>
            <RotateCw className="h-4 w-4" /> Réessayer
          </button>
        </div>
      )}

      <div className="card min-h-[520px] flex-1 overflow-hidden p-2 md:p-3">
        <FullCalendar
          ref={calRef}
          plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin, luxonPlugin]}
          locale={frLocale}
          timeZone={zone}
          initialView={initialView}
          headerToolbar={false}
          height="100%"
          events={events}
          nowIndicator
          selectable
          selectMirror
          selectLongPressDelay={350}
          eventLongPressDelay={350}
          dayMaxEvents={3}
          eventDisplay="block"
          allDayText="Journée"
          slotDuration="00:30:00"
          slotLabelFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
          eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
          scrollTime={settings?.day_start ?? '07:00'}
          businessHours={{ daysOfWeek: [1, 2, 3, 4, 5], startTime: settings?.day_start ?? '08:00', endTime: settings?.day_end ?? '19:00' }}
          noEventsContent="Aucun rendez-vous sur cette période"
          datesSet={(arg) => setRange({ from: arg.start, to: arg.end, title: arg.view.title, view: arg.view.type as ViewType })}
          select={onSelect}
          eventClick={onEventClick}
          eventDrop={onMove}
          eventResize={onMove}
          eventContent={renderEvent}
        />
      </div>
    </div>
  );
}
