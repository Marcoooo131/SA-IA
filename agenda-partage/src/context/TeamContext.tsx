import type { RealtimeChannel } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { fetchCategories, fetchNotifications, fetchProfiles, fetchSettings, markNotificationsRead } from '../data/api';
import { effectiveTimeZone } from '../lib/datetime';
import { supabase } from '../lib/supabase';
import type { AppNotification, AppSettings, Category, Profile } from '../lib/types';
import { useAuth } from './AuthContext';

type Scope = 'appointments' | 'categories' | 'profiles' | 'settings';
export type LiveStatus = 'connecting' | 'live' | 'offline';

interface TeamState {
  profiles: Profile[];
  profileMap: Map<string, Profile>;
  activeProfiles: Profile[];
  categories: Category[];
  categoryMap: Map<string, Category>;
  settings: AppSettings | null;
  /** Fuseau d'affichage de l'utilisateur connecté */
  zone: string;
  /** Incrémenté à chaque modification de rendez-vous par n'importe quel membre */
  appointmentsVersion: number;
  live: LiveStatus;
  /** Recharge immédiatement les rendez-vous affichés (après une action locale) */
  bumpAppointments: () => void;
  notifications: AppNotification[];
  unreadCount: number;
  markAllRead: () => Promise<void>;
  reloadTeam: () => Promise<void>;
}

const TeamContext = createContext<TeamState | null>(null);

export function TeamProvider({ children }: { children: ReactNode }) {
  const { profile, refreshProfile } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [appointmentsVersion, setAppointmentsVersion] = useState(0);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [live, setLive] = useState<LiveStatus>('connecting');
  const userId = profile?.id;
  const refreshProfileRef = useRef(refreshProfile);
  refreshProfileRef.current = refreshProfile;

  const loadScope = useCallback(async (scope: Scope) => {
    try {
      if (scope === 'profiles') {
        setProfiles(await fetchProfiles());
        await refreshProfileRef.current();
      } else if (scope === 'categories') setCategories(await fetchCategories());
      else if (scope === 'settings') setSettings(await fetchSettings());
      else setAppointmentsVersion((v) => v + 1);
    } catch (e) {
      console.error(`Chargement « ${scope} » impossible`, e);
    }
  }, []);

  const loadNotifications = useCallback(async () => {
    try {
      setNotifications(await fetchNotifications());
    } catch (e) {
      console.error('Notifications indisponibles', e);
    }
  }, []);

  const reloadTeam = useCallback(async () => {
    await Promise.all([loadScope('profiles'), loadScope('categories'), loadScope('settings'), loadNotifications()]);
  }, [loadScope, loadNotifications]);

  // Chargement initial + abonnement temps réel
  useEffect(() => {
    if (!userId) return;
    void Promise.all([
      fetchProfiles().then(setProfiles),
      fetchCategories().then(setCategories),
      fetchSettings().then(setSettings),
      loadNotifications(),
    ]).catch((e) => console.error(e));

    let channel: RealtimeChannel | null = supabase
      .channel(`agenda-live-${userId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sync_state' }, (payload) => {
        const scope = (payload.new as { scope?: Scope }).scope;
        if (scope) void loadScope(scope);
      })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        () => void loadNotifications(),
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setLive((prev) => {
            // Reconnexion après une coupure : on rattrape ce qui a pu changer entre-temps
            if (prev === 'offline') {
              void loadScope('appointments');
              void loadNotifications();
            }
            return 'live';
          });
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setLive('offline');
        }
      });

    // Filet de sécurité : au retour sur l'onglet ou au retour du réseau, on resynchronise
    const resync = () => {
      if (document.visibilityState === 'visible') {
        void loadScope('appointments');
        void loadNotifications();
      }
    };
    const onOffline = () => setLive('offline');
    document.addEventListener('visibilitychange', resync);
    window.addEventListener('online', resync);
    window.addEventListener('offline', onOffline);

    return () => {
      document.removeEventListener('visibilitychange', resync);
      window.removeEventListener('online', resync);
      window.removeEventListener('offline', onOffline);
      if (channel) void supabase.removeChannel(channel);
      channel = null;
    };
  }, [userId, loadScope, loadNotifications]);

  const markAllRead = useCallback(async () => {
    const ids = notifications.filter((n) => !n.read_at).map((n) => n.id);
    if (!ids.length) return;
    const now = new Date().toISOString();
    setNotifications((list) => list.map((n) => (n.read_at ? n : { ...n, read_at: now })));
    await markNotificationsRead(ids);
  }, [notifications]);

  const bumpAppointments = useCallback(() => setAppointmentsVersion((v) => v + 1), []);

  const value = useMemo<TeamState>(() => {
    const profileMap = new Map(profiles.map((p) => [p.id, p]));
    return {
      profiles,
      profileMap,
      activeProfiles: profiles.filter((p) => p.is_active),
      categories,
      categoryMap: new Map(categories.map((c) => [c.id, c])),
      settings,
      zone: effectiveTimeZone(profile?.timezone, settings?.timezone),
      appointmentsVersion,
      live,
      bumpAppointments,
      notifications,
      unreadCount: notifications.filter((n) => !n.read_at).length,
      markAllRead,
      reloadTeam,
    };
  }, [profiles, categories, settings, profile?.timezone, appointmentsVersion, live, bumpAppointments, notifications, markAllRead, reloadTeam]);

  return <TeamContext.Provider value={value}>{children}</TeamContext.Provider>;
}

export function useTeam(): TeamState {
  const ctx = useContext(TeamContext);
  if (!ctx) throw new Error('useTeam hors de TeamProvider');
  return ctx;
}
