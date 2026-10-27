import {
  Bell,
  CalendarDays,
  CalendarPlus,
  LayoutDashboard,
  Loader2,
  LogOut,
  Plus,
  Search,
  Shield,
  UserCircle,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '../context/AuthContext';
import { useEditor } from '../context/EditorContext';
import { useTeam } from '../context/TeamContext';
import { searchAppointments } from '../data/api';
import { formatRange, relativeTime } from '../lib/datetime';
import { isAdmin } from '../lib/permissions';
import { navigate, type Page } from '../lib/router';
import type { AppointmentRow } from '../lib/types';
import { Avatar, StatusBadge, displayName } from './ui';

const NAV: { page: Page; label: string; icon: typeof LayoutDashboard; admin?: boolean }[] = [
  { page: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
  { page: 'agenda', label: 'Agenda', icon: CalendarDays },
  { page: 'admin', label: 'Administration', icon: Shield, admin: true },
  { page: 'profile', label: 'Mon profil', icon: UserCircle },
];

export function Layout({ page, children }: { page: Page; children: ReactNode }) {
  const { profile, signOut } = useAuth();
  const { settings, live } = useTeam();
  const { openNew } = useEditor();
  const [mobileSearch, setMobileSearch] = useState(false);
  const nav = NAV.filter((n) => !n.admin || isAdmin(profile));
  const title = NAV.find((n) => n.page === page)?.label ?? '';

  return (
    <div className="flex h-dvh overflow-hidden">
      {/* Barre latérale (ordinateur / tablette) */}
      <aside className="hidden w-64 shrink-0 flex-col bg-ink text-white md:flex">
        <div className="flex items-center gap-3 px-5 py-5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand shadow-lg shadow-brand/30">
            <CalendarDays className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-extrabold tracking-tight">{settings?.organization_name ?? 'Agenda'}</p>
            <p className="text-xs text-neutral-400">Agenda partagé</p>
          </div>
        </div>
        <div className="px-4">
          <button className="btn-primary w-full py-3" onClick={() => openNew()} data-testid="new-appointment">
            <Plus className="h-4 w-4" /> Nouveau rendez-vous
          </button>
        </div>
        <nav className="mt-6 flex-1 space-y-1 px-3" aria-label="Navigation principale">
          {nav.map((n) => {
            const active = n.page === page;
            return (
              <a
                key={n.page}
                href={n.page === 'dashboard' ? '#/' : `#/${n.page === 'profile' ? 'profil' : n.page}`}
                className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  active ? 'bg-ink-soft text-white' : 'text-neutral-400 hover:bg-ink-soft/60 hover:text-white'
                }`}
                aria-current={active ? 'page' : undefined}
              >
                <span className={`h-5 w-1 rounded-full ${active ? 'bg-brand' : 'bg-transparent'}`} />
                <n.icon className={`h-5 w-5 ${active ? 'text-brand' : ''}`} />
                {n.label}
              </a>
            );
          })}
        </nav>
        <div className="border-t border-white/10 p-4">
          <div className="flex items-center gap-3">
            <Avatar profile={profile} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{displayName(profile)}</p>
              <p className="text-xs text-neutral-400">{profile?.role === 'admin' ? 'Administrateur' : 'Collaborateur'}</p>
            </div>
            <button onClick={() => void signOut()} className="rounded-lg p-2 text-neutral-400 transition hover:bg-ink-soft hover:text-white" title="Déconnexion" aria-label="Déconnexion">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Barre supérieure */}
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-neutral-200 bg-white px-3 md:h-16 md:px-6">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-white md:hidden">
            <CalendarDays className="h-4 w-4" />
          </span>
          <h1 className="min-w-0 truncate text-lg font-bold md:hidden">{title}</h1>
          <div className="hidden max-w-md flex-1 md:block">
            <GlobalSearch />
          </div>
          <div className="ml-auto flex items-center gap-1">
            <LiveIndicator status={live} />
            <button className="btn-icon md:hidden" onClick={() => setMobileSearch(true)} aria-label="Rechercher">
              <Search className="h-5 w-5" />
            </button>
            <NotificationBell />
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto p-3 pb-24 md:p-6 md:pb-6">{children}</main>
      </div>

      {/* Navigation mobile */}
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-neutral-200 bg-white/95 backdrop-blur md:hidden" aria-label="Navigation">
        <div className="relative grid grid-cols-5 items-end">
          {[nav[0]!, nav[1]!].map((n) => (
            <MobileTab key={n.page} n={n} active={n.page === page} />
          ))}
          <div className="flex justify-center">
            <button
              onClick={() => openNew()}
              className="-mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-brand text-white shadow-lg shadow-brand/40 ring-4 ring-white transition active:scale-95"
              aria-label="Nouveau rendez-vous"
            >
              <CalendarPlus className="h-6 w-6" />
            </button>
          </div>
          {nav.slice(2).map((n) => (
            <MobileTab key={n.page} n={n} active={n.page === page} />
          ))}
          {nav.length < 4 && <span />}
        </div>
      </nav>

      {mobileSearch && (
        <div className="animate-fade fixed inset-0 z-50 flex flex-col bg-white md:hidden">
          <div className="flex items-center gap-2 border-b border-neutral-200 p-3">
            <div className="flex-1">
              <GlobalSearch autoFocus onPick={() => setMobileSearch(false)} />
            </div>
            <button className="btn-icon" onClick={() => setMobileSearch(false)} aria-label="Fermer">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MobileTab({ n, active }: { n: (typeof NAV)[number]; active: boolean }) {
  return (
    <button onClick={() => navigate({ page: n.page, appointmentId: null })} className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${active ? 'text-brand' : 'text-neutral-500'}`}>
      <n.icon className="h-5 w-5" />
      <span className="max-w-full truncate px-1">{n.page === 'dashboard' ? 'Accueil' : n.page === 'admin' ? 'Admin' : n.page === 'profile' ? 'Profil' : n.label}</span>
    </button>
  );
}

function LiveIndicator({ status }: { status: 'connecting' | 'live' | 'offline' }) {
  const label = status === 'live' ? 'Synchronisé en temps réel' : status === 'offline' ? 'Hors ligne — reconnexion…' : 'Connexion…';
  return (
    <span className="mr-1 inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium text-neutral-500" title={label} aria-label={label}>
      {status === 'offline' ? <WifiOff className="h-4 w-4 text-brand" /> : <Wifi className={`h-4 w-4 ${status === 'live' ? 'text-green-600' : 'text-neutral-400'}`} />}
      <span className={`hidden h-2 w-2 rounded-full lg:inline-block ${status === 'live' ? 'animate-pulse-dot bg-green-500' : status === 'offline' ? 'bg-brand' : 'bg-neutral-300'}`} />
      <span className="hidden lg:inline">{status === 'live' ? 'En direct' : status === 'offline' ? 'Hors ligne' : '…'}</span>
    </span>
  );
}

/** Recherche dans tout l'agenda (toutes dates) — filtrée par la base selon les droits */
function GlobalSearch({ autoFocus, onPick }: { autoFocus?: boolean; onPick?: () => void }) {
  const { zone } = useTeam();
  const { openDetail } = useEditor();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<AppointmentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await searchAppointments(term, 20);
        if (!cancelled) setResults(r);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 280);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const pick = (id: string) => {
    openDetail(id);
    setOpen(false);
    setQ('');
    onPick?.();
  };

  return (
    <div ref={box} className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-neutral-400" />
      <input
        className="field bg-neutral-50 py-2 pl-9"
        placeholder="Rechercher un client, un titre, un lieu…"
        value={q}
        autoFocus={autoFocus}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        aria-label="Rechercher dans l'agenda"
        type="search"
      />
      {open && q.trim().length >= 2 && (
        <div className="animate-fade absolute inset-x-0 top-full z-50 mt-2 max-h-[70vh] overflow-y-auto rounded-xl border border-neutral-200 bg-white shadow-xl">
          {loading && results.length === 0 ? (
            <p className="flex items-center gap-2 p-4 text-sm text-neutral-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Recherche…
            </p>
          ) : results.length === 0 ? (
            <p className="p-4 text-sm text-neutral-500">Aucun rendez-vous trouvé.</p>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {results.map((r) => (
                <li key={r.id}>
                  <button className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-neutral-50" onClick={() => pick(r.id)}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{r.title}</span>
                      <span className="block truncate text-xs text-neutral-500">{formatRange(r.starts_at, r.ends_at, r.all_day, zone)}</span>
                      {r.client_name && <span className="block truncate text-xs text-neutral-500">{r.client_name}</span>}
                    </span>
                    <StatusBadge status={r.status} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function NotificationBell() {
  const { notifications, unreadCount, markAllRead, profileMap } = useTeam();
  const { openDetail } = useEditor();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  return (
    <div ref={box} className="relative">
      <button
        className="btn-icon relative"
        onClick={() => {
          setOpen((o) => !o);
          if (!open && unreadCount) void markAllRead();
        }}
        aria-label={`Notifications${unreadCount ? ` (${unreadCount} non lues)` : ''}`}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">{unreadCount > 9 ? '9+' : unreadCount}</span>
        )}
      </button>
      {open && (
        <div className="animate-fade fixed inset-x-3 top-14 z-50 max-h-[70vh] overflow-y-auto rounded-xl border border-neutral-200 bg-white shadow-xl md:absolute md:inset-x-auto md:top-full md:right-0 md:mt-2 md:w-96">
          <p className="border-b border-neutral-100 px-4 py-3 text-sm font-bold">Notifications</p>
          {notifications.length === 0 ? (
            <p className="p-4 text-sm text-neutral-500">Rien de nouveau. Vous serez prévenu ici quand un collègue vous confie ou modifie un rendez-vous.</p>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {notifications.map((n) => (
                <li key={n.id}>
                  <button
                    className={`flex w-full gap-3 px-4 py-3 text-left hover:bg-neutral-50 ${n.read_at ? '' : 'bg-brand-soft/50'}`}
                    onClick={() => {
                      if (n.appointment_id) openDetail(n.appointment_id);
                      setOpen(false);
                    }}
                  >
                    <Avatar profile={n.actor_id ? profileMap.get(n.actor_id) : null} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{n.title}</span>
                      <span className="block truncate text-xs text-neutral-600">{n.body}</span>
                      <span className="block text-xs text-neutral-400">{relativeTime(n.created_at)}</span>
                    </span>
                    {!n.read_at && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
