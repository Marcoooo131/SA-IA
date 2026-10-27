import { AlertCircle, ArrowRight, CalendarCheck, CalendarClock, CalendarDays, CalendarPlus, Clock, History, Lock, MapPin, Repeat } from 'lucide-react';
import { DateTime } from 'luxon';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Avatar, EmptyState, Spinner, StatusBadge, displayName } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useEditor } from '../context/EditorContext';
import { useTeam } from '../context/TeamContext';
import { fetchRecentHistory } from '../data/api';
import { useAgenda } from '../data/useAgenda';
import { formatRange, relativeTime, toZone, ucfirst } from '../lib/datetime';
import { navigate } from '../lib/router';
import { supabase } from '../lib/supabase';
import type { Appointment, HistoryEntry } from '../lib/types';

function StatCard({ label, value, icon, accent, onClick }: { label: string; value: number | string; icon: ReactNode; accent?: boolean; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`group flex items-center gap-3 rounded-2xl border p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
        accent ? 'border-ink bg-ink text-white' : 'border-neutral-200 bg-white'
      }`}
    >
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${accent ? 'bg-brand text-white' : 'bg-brand-soft text-brand'}`}>{icon}</span>
      <span className="min-w-0">
        <span className="block text-2xl leading-tight font-extrabold tabular-nums">{value}</span>
        <span className={`block truncate text-sm ${accent ? 'text-neutral-300' : 'text-neutral-500'}`}>{label}</span>
      </span>
    </button>
  );
}

function Section({ title, icon, action, children }: { title: string; icon: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="card flex min-h-0 flex-col">
      <header className="flex items-center gap-2 border-b border-neutral-100 px-4 py-3">
        <span className="text-brand">{icon}</span>
        <h2 className="flex-1 font-bold">{title}</h2>
        {action}
      </header>
      <div className="flex-1">{children}</div>
    </section>
  );
}

export function DashboardPage() {
  const { profile } = useAuth();
  const { activeProfiles, profileMap, categoryMap, settings, zone, appointmentsVersion } = useTeam();
  const { openNew, openDetail } = useEditor();
  const [scope, setScope] = useState<string>(''); // '' = toute l'équipe
  const [recent, setRecent] = useState<HistoryEntry[]>([]);

  const now = DateTime.now().setZone(zone);
  const dayKey = now.toISODate();
  // Fenêtre chargée : 60 jours en arrière (reportés) → 90 jours en avant (à venir)
  const { from, to } = useMemo(() => {
    const today = DateTime.fromISO(dayKey!, { zone });
    return { from: today.minus({ days: 60 }).toJSDate(), to: today.plus({ days: 90 }).toJSDate() };
  }, [dayKey, zone]);
  const { appointments, loading, error } = useAgenda(from, to);

  const loadRecent = useCallback(() => {
    fetchRecentHistory(20)
      .then(setRecent)
      .catch(() => undefined);
  }, []);
  useEffect(loadRecent, [loadRecent, appointmentsVersion]);
  useEffect(() => {
    const channel = supabase
      .channel('dashboard-history')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'appointment_history' }, loadRecent)
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadRecent]);

  const stats = useMemo(() => {
    const mine = appointments.filter((a) => !scope || a.responsible_id === scope);
    const active = mine.filter((a) => a.status !== 'annule');
    const startDay = now.startOf('day');
    const endDay = startDay.plus({ days: 1 });
    const startWeek = now.startOf('week');
    const endWeek = startWeek.plus({ weeks: 1 });
    const inRange = (a: Appointment, s: DateTime, e: DateTime) => Date.parse(a.starts_at) < e.toMillis() && Date.parse(a.ends_at) > s.toMillis();
    const nowMs = now.toMillis();
    return {
      today: active.filter((a) => inRange(a, startDay, endDay)),
      week: active.filter((a) => inRange(a, startWeek, endWeek)),
      upcoming: active
        .filter((a) => Date.parse(a.ends_at) > nowMs && !['termine', 'reporte'].includes(a.status))
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
        .slice(0, 8),
      toConfirm: mine.filter((a) => !a.masked && a.status === 'a_confirmer' && Date.parse(a.ends_at) > nowMs).sort((a, b) => a.starts_at.localeCompare(b.starts_at)),
      postponed: mine.filter((a) => !a.masked && a.status === 'reporte').sort((a, b) => b.starts_at.localeCompare(a.starts_at)),
    };
  }, [appointments, scope, dayKey, zone]);

  const recentFiltered = useMemo(
    () => recent.filter((h) => !scope || h.actor_id === scope || h.responsible_id === scope).slice(0, 12),
    [recent, scope],
  );

  const hello = now.hour < 18 ? 'Bonjour' : 'Bonsoir';
  const firstName = (profile?.full_name || '').split(' ')[0];

  const goAgenda = () => navigate({ page: 'agenda' });

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-medium text-brand">{ucfirst(now.setLocale('fr').toFormat('cccc d LLLL yyyy'))}</p>
          <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">
            {hello}
            {firstName ? ` ${firstName}` : ''} 👋
          </h1>
          <p className="text-sm text-neutral-500">{settings?.organization_name ?? 'Agenda d’équipe'} — vue d'ensemble</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <select className="field sm:w-60" value={scope} onChange={(e) => setScope(e.target.value)} aria-label="Afficher pour">
            <option value="">Toute l'équipe</option>
            {profile && <option value={profile.id}>Mes rendez-vous</option>}
            {activeProfiles
              .filter((p) => p.id !== profile?.id)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {displayName(p)}
                </option>
              ))}
          </select>
          <button className="btn-primary" onClick={() => openNew()}>
            <CalendarPlus className="h-4 w-4" /> Nouveau rendez-vous
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-brand/30 bg-brand-soft px-4 py-3 text-sm text-brand-dark" role="alert">
          <AlertCircle className="h-4 w-4" /> {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard accent label="Aujourd'hui" value={loading && !appointments.length ? '…' : stats.today.length} icon={<CalendarCheck className="h-5 w-5" />} onClick={goAgenda} />
        <StatCard label="Cette semaine" value={loading && !appointments.length ? '…' : stats.week.length} icon={<CalendarDays className="h-5 w-5" />} onClick={goAgenda} />
        <StatCard label="À confirmer" value={stats.toConfirm.length} icon={<Clock className="h-5 w-5" />} />
        <StatCard label="Reportés" value={stats.postponed.length} icon={<Repeat className="h-5 w-5" />} />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Section
            title="Prochains rendez-vous"
            icon={<CalendarClock className="h-5 w-5" />}
            action={
              <button className="inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline" onClick={goAgenda}>
                Agenda <ArrowRight className="h-4 w-4" />
              </button>
            }
          >
            {loading && !appointments.length ? (
              <div className="flex justify-center py-10">
                <Spinner />
              </div>
            ) : stats.upcoming.length === 0 ? (
              <EmptyState icon={<CalendarCheck className="h-6 w-6" />} title="Aucun rendez-vous à venir">
                <button className="mt-2 font-semibold text-brand hover:underline" onClick={() => openNew()}>
                  Planifier un rendez-vous
                </button>
              </EmptyState>
            ) : (
              <ul className="divide-y divide-neutral-100">
                {stats.upcoming.map((a) => (
                  renderRow(a, () => !a.masked && openDetail(a.id))
                ))}
              </ul>
            )}
          </Section>
        </div>

        <Section title="Dernières modifications" icon={<History className="h-5 w-5" />}>
          {recentFiltered.length === 0 ? (
            <EmptyState icon={<History className="h-6 w-6" />} title="Aucune activité récente" />
          ) : (
            <ul className="divide-y divide-neutral-100">
              {recentFiltered.map((h) => {
                const actor = h.actor_id ? profileMap.get(h.actor_id) : null;
                return (
                  <li key={h.id}>
                    <button
                      className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-neutral-50 disabled:cursor-default"
                      onClick={() => openDetail(h.appointment_id)}
                      disabled={h.action === 'deleted'}
                    >
                      <Avatar profile={actor} size="sm" />
                      <span className="min-w-0 flex-1 text-sm">
                        <span className="font-semibold">{displayName(actor, 'Système')}</span> {actionLabel(h)}{' '}
                        <span className="font-medium text-ink">« {h.appointment_title} »</span>
                        <span className="block text-xs text-neutral-500">{relativeTime(h.created_at)}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="À confirmer" icon={<Clock className="h-5 w-5" />}>
          {stats.toConfirm.length === 0 ? (
            <EmptyState icon={<CalendarCheck className="h-6 w-6" />} title="Tout est confirmé" />
          ) : (
            <ul className="divide-y divide-neutral-100">
              {stats.toConfirm.slice(0, 8).map((a) => (
                renderRow(a, () => openDetail(a.id))
              ))}
            </ul>
          )}
        </Section>
        <Section title="Reportés" icon={<Repeat className="h-5 w-5" />}>
          {stats.postponed.length === 0 ? (
            <EmptyState icon={<Repeat className="h-6 w-6" />} title="Aucun rendez-vous reporté" />
          ) : (
            <ul className="divide-y divide-neutral-100">
              {stats.postponed.slice(0, 8).map((a) => (
                renderRow(a, () => openDetail(a.id))
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );

  function renderRow(a: Appointment, onOpen: () => void) {
    const responsible = a.responsible_id ? profileMap.get(a.responsible_id) : null;
    const category = a.category_id ? categoryMap.get(a.category_id) : null;
    const start = toZone(a.starts_at, zone).setLocale('fr');
    return (
      <li key={a.id}>
        <button onClick={onOpen} className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-neutral-50" disabled={a.masked}>
          <span className="flex w-12 shrink-0 flex-col items-center rounded-lg bg-neutral-100 py-1" style={{ boxShadow: `inset 3px 0 0 ${category?.color ?? '#E30613'}` }}>
            <span className="text-[10px] font-semibold text-neutral-500 uppercase">{start.toFormat('LLL')}</span>
            <span className="text-lg leading-none font-extrabold">{start.toFormat('d')}</span>
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5 truncate font-semibold">
              {a.is_private && <Lock className="h-3.5 w-3.5 shrink-0" />}
              <span className="truncate">{a.title}</span>
            </span>
            <span className="block truncate text-xs text-neutral-500">{formatRange(a.starts_at, a.ends_at, a.all_day, zone)}</span>
            {(a.client_name || a.location) && (
              <span className="flex items-center gap-1 truncate text-xs text-neutral-500">
                {a.client_name}
                {a.location && (
                  <>
                    <MapPin className="ml-1 h-3 w-3 shrink-0" />
                    <span className="truncate">{a.location}</span>
                  </>
                )}
              </span>
            )}
          </span>
          <span className="flex shrink-0 flex-col items-end gap-1">
            {!a.masked && <StatusBadge status={a.status} />}
            {responsible && <Avatar profile={responsible} size="sm" />}
          </span>
        </button>
      </li>
    );
  }
}

function actionLabel(h: HistoryEntry): string {
  switch (h.action) {
    case 'created':
      return 'a créé';
    case 'updated':
      return 'a modifié';
    case 'deleted':
      return 'a supprimé';
    case 'comment':
      return 'a commenté';
    case 'attachment':
      return 'a joint un fichier à';
  }
}
