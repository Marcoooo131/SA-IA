import { useEffect, useState, type ReactNode } from 'react';
import { Apple, BookOpen, CircleUser, Dumbbell, Home, LineChart, Pause, Play, Plus, SkipForward, Timer, Trophy, X, Zap } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { cx, Button } from './ui';
import { useToasts } from './toast';
import { useConfirm } from './confirm';
import { useStore } from '../lib/store/store';
import { useRest, beep, notifyRestEnd } from '../lib/restTimer';
import { formatClock, formatDuration } from '../lib/dates';
import { useCtx } from '../lib/useCtx';
import { navigate } from '../lib/router';
import { useSyncStatus } from '../lib/sync/sync';

const NAV = [
  { to: '/', label: 'Accueil', icon: Home, match: (p: string) => p === '/' || p.startsWith('/coach') },
  { to: '/training', label: 'Entraînement', short: 'Séances', icon: Dumbbell, match: (p: string) => p.startsWith('/training') },
  { to: '/exercises', label: 'Exercices', icon: BookOpen, match: (p: string) => p.startsWith('/exercises') },
  { to: '/nutrition', label: 'Nutrition', icon: Apple, match: (p: string) => p.startsWith('/nutrition') },
  { to: '/progress', label: 'Progression', short: 'Progrès', icon: LineChart, match: (p: string) => p.startsWith('/progress') },
  { to: '/profile', label: 'Profil', icon: CircleUser, match: (p: string) => p.startsWith('/profile') },
];

export function AppShell({ path, children }: { path: string; children: ReactNode }) {
  const workspace = useStore((s) => s.workspace);
  const saveError = useStore((s) => s.saveError);
  const ctx = useCtx();
  const active = ctx.activeSession;
  const inSession = active && path.startsWith(`/training/session/${active.id}`);
  const clean = path.split('?')[0];

  return (
    <div className="min-h-dvh lg:flex">
      {/* Barre latérale (ordinateur) */}
      <aside className="hidden lg:flex flex-col w-60 shrink-0 border-r border-line h-dvh sticky top-0 p-4 gap-1">
        <Logo className="mb-6 mt-2 px-2" />
        {NAV.map((n) => (
          <a
            key={n.to}
            href={`#${n.to}`}
            className={cx('flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition', n.match(clean) ? 'bg-accent/10 text-accent' : 'text-muted hover:text-ink hover:bg-surface-2')}
          >
            <n.icon size={19} strokeWidth={n.match(clean) ? 2.4 : 1.8} />
            {n.label}
          </a>
        ))}
        <div className="mt-auto">
          <SyncPill />
        </div>
      </aside>

      <div className="flex-1 min-w-0">
        {workspace === 'demo' && (
          <div className="bg-warn/10 text-warn text-xs px-4 py-2 flex items-center justify-between gap-3 safe-top">
            <span>
              <strong>Mode démonstration</strong> : données fictives. Elles ne sont jamais mélangées à tes données réelles.
            </span>
            <a href="#/profile" className="underline shrink-0">
              Quitter
            </a>
          </div>
        )}
        {saveError && <div className="bg-danger/15 text-danger text-xs px-4 py-2">{saveError}</div>}
        <header className="lg:hidden flex items-center justify-between px-4 pt-3 safe-top">
          <Logo />
          <SyncPill compact />
        </header>
        <main className={cx('mx-auto max-w-5xl px-4 pt-4 lg:pt-8', active && !inSession ? 'pb-44' : 'pb-28', 'lg:pb-16')}>
          <div className="anim-fade-up" key={clean}>
            {children}
          </div>
        </main>
      </div>

      {/* Bandeau séance en cours */}
      {active && !inSession && (
        <button
          type="button"
          onClick={() => navigate(`/training/session/${active.id}`)}
          className="fixed z-30 left-3 right-3 lg:left-auto lg:right-6 lg:w-80 bottom-[calc(76px+env(safe-area-inset-bottom))] lg:bottom-6 card !border-accent/40 bg-surface-2 px-4 py-3 flex items-center gap-3 text-left shadow-2xl anim-pop"
        >
          <span className="size-9 rounded-xl bg-accent text-accent-ink grid place-items-center">
            <Zap size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold truncate">Séance en cours : {active.name}</span>
            <ElapsedText startedAt={active.startedAt} />
          </span>
          <span className="text-accent text-sm font-semibold">Reprendre</span>
        </button>
      )}

      <RestTimerBar raised={!!active && !inSession} />

      {/* Barre de navigation inférieure (mobile) */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-bg/90 backdrop-blur-xl border-t border-line safe-bottom" aria-label="Navigation principale">
        <div className="grid grid-cols-6 h-[64px]">
          {NAV.map((n) => {
            const on = n.match(clean);
            return (
              <a key={n.to} href={`#${n.to}`} aria-current={on ? 'page' : undefined} className={cx('flex flex-col items-center justify-center gap-1 text-[10px] font-medium transition', on ? 'text-accent' : 'text-faint')}>
                <span className={cx('grid place-items-center h-7 w-11 rounded-full transition', on && 'bg-accent/12')}>
                  <n.icon size={20} strokeWidth={on ? 2.4 : 1.8} />
                </span>
                <span className="truncate max-w-full px-0.5">{n.short ?? n.label}</span>
              </a>
            );
          })}
        </div>
      </nav>

      <Toasts />
      <ConfirmHost />
      <UpdatePrompt />
    </div>
  );
}

function Logo({ className }: { className?: string }) {
  return (
    <a href="#/" className={cx('flex items-center gap-2.5', className)}>
      <span className="size-8 rounded-xl bg-surface-2 border border-line grid place-items-center">
        <svg width="20" height="20" viewBox="0 0 64 64" fill="none" aria-hidden>
          <path d="M10 40 L22 28 L32 36 L46 18 L54 24" stroke="var(--color-accent)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="display text-xl font-bold tracking-[0.18em]">BODYTRACK</span>
    </a>
  );
}

function SyncPill({ compact }: { compact?: boolean }) {
  const s = useSyncStatus();
  const tone = s.state === 'error' ? 'bg-danger' : s.state === 'offline' ? 'bg-warn' : s.state === 'synced' ? 'bg-accent' : s.state === 'syncing' ? 'bg-info animate-pulse' : 'bg-faint';
  return (
    <a href="#/profile" className={cx('flex items-center gap-2 text-xs text-muted rounded-full', compact ? 'px-2.5 py-1 bg-surface border border-line' : 'px-3 py-2 hover:bg-surface-2')} title={s.detail}>
      <span className={cx('size-2 rounded-full', tone)} />
      {s.label}
    </a>
  );
}

function ElapsedText({ startedAt }: { startedAt: string }) {
  const [, setT] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setT((x) => x + 1), 30_000);
    return () => clearInterval(id);
  }, []);
  return <span className="block text-xs text-muted">Commencée il y a {formatDuration(Date.now() - new Date(startedAt).getTime())}</span>;
}

/** Chronomètre de repos flottant, visible sur tous les écrans */
function RestTimerBar({ raised }: { raised: boolean }) {
  const rest = useRest();
  const prefs = useStore((s) => s.data.profile?.preferences);
  const [now, setNow] = useState(Date.now());
  const running = rest.endsAt !== null;
  const paused = rest.pausedRemainingMs !== null;
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [running]);
  const remainingMs = running ? rest.endsAt! - now : paused ? rest.pausedRemainingMs! : 0;
  useEffect(() => {
    if (running && remainingMs <= 0) {
      if (prefs?.restSound) beep();
      if (prefs?.restVibration) navigator.vibrate?.([200, 100, 200]);
      if (prefs?.restNotification) void notifyRestEnd(rest.label);
      rest.skip();
    }
  }, [running, remainingMs, prefs, rest]);
  if (!running && !paused) return null;
  const pct = rest.durationSec ? Math.max(0, Math.min(1, remainingMs / (rest.durationSec * 1000))) : 0;
  return (
    <div className={cx('fixed z-40 left-3 right-3 lg:left-auto lg:right-6 lg:w-96 anim-pop', raised ? 'bottom-[calc(144px+env(safe-area-inset-bottom))] lg:bottom-24' : 'bottom-[calc(76px+env(safe-area-inset-bottom))] lg:bottom-6')}>
      <div className="card bg-surface-2 !border-accent/30 shadow-2xl overflow-hidden" role="timer" aria-live="polite">
        <div className="h-1 bg-surface-3">
          <div className="h-full bg-accent transition-[width] duration-200" style={{ width: `${pct * 100}%` }} />
        </div>
        <div className="flex items-center gap-3 px-3 py-2.5">
          <Timer size={18} className="text-accent shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="display text-3xl font-bold tnum leading-none">{formatClock(remainingMs / 1000)}</div>
            <div className="text-[11px] text-muted truncate">{paused ? 'En pause' : 'Repos'}{rest.label ? ` · ${rest.label}` : ''}</div>
          </div>
          <button type="button" onClick={() => rest.add(-15)} className="h-9 px-2 rounded-lg text-xs text-muted hover:bg-surface-3 tnum" aria-label="Retirer 15 secondes">
            −15
          </button>
          <button type="button" onClick={() => rest.add(15)} className="h-9 px-2 rounded-lg text-xs text-muted hover:bg-surface-3 tnum" aria-label="Ajouter 15 secondes">
            <Plus size={12} className="inline -mt-0.5" />15
          </button>
          {paused ? (
            <button type="button" onClick={rest.resume} className="size-9 rounded-xl bg-accent text-accent-ink grid place-items-center" aria-label="Reprendre">
              <Play size={16} />
            </button>
          ) : (
            <button type="button" onClick={rest.pause} className="size-9 rounded-xl bg-surface-3 grid place-items-center" aria-label="Pause">
              <Pause size={16} />
            </button>
          )}
          <button type="button" onClick={rest.skip} className="size-9 rounded-xl bg-surface-3 grid place-items-center" aria-label="Ignorer le repos">
            <SkipForward size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

function Toasts() {
  const { toasts, dismiss } = useToasts();
  return (
    <div className="fixed z-[60] top-3 inset-x-3 sm:left-auto sm:right-4 sm:w-96 flex flex-col gap-2 safe-top pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cx(
            'pointer-events-auto card px-4 py-3 flex gap-3 items-start shadow-2xl anim-pop',
            t.tone === 'record' && '!border-accent/60 bg-gradient-to-br from-accent/15 to-surface',
            t.tone === 'error' && '!border-danger/50',
          )}
          role="status"
        >
          {t.tone === 'record' && <Trophy size={20} className="text-accent shrink-0 mt-0.5" />}
          <div className="min-w-0 flex-1">
            <div className={cx('text-sm font-semibold', t.tone === 'record' && 'text-accent', t.tone === 'error' && 'text-danger')}>{t.title}</div>
            {t.text && <div className="text-xs text-muted mt-0.5">{t.text}</div>}
          </div>
          <button type="button" onClick={() => dismiss(t.id)} className="text-faint hover:text-ink" aria-label="Fermer">
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}

function ConfirmHost() {
  const { req, set } = useConfirm();
  if (!req) return null;
  const close = (ok: boolean) => {
    req.resolve(ok);
    set(null);
  };
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center p-4" role="alertdialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/70" onClick={() => close(false)} />
      <div className="relative card p-5 w-full max-w-sm anim-pop">
        <h3 className="font-semibold text-lg">{req.title}</h3>
        {req.text && <p className="text-sm text-muted mt-2">{req.text}</p>}
        <div className="flex gap-2 justify-end mt-5">
          <Button variant="ghost" onClick={() => close(false)}>
            Annuler
          </Button>
          <Button variant={req.danger ? 'danger' : 'primary'} onClick={() => close(true)} autoFocus>
            {req.confirmLabel ?? 'Confirmer'}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Nouvelle version de l'application disponible (service worker) */
function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW();
  useEffect(() => {
    if (offlineReady) {
      useToasts.getState().push({ title: 'Prêt hors connexion', text: 'BODYTRACK fonctionne maintenant sans réseau.', tone: 'info' });
      setOfflineReady(false);
    }
  }, [offlineReady, setOfflineReady]);
  if (!needRefresh) return null;
  return (
    <div className="fixed z-[65] bottom-[calc(80px+env(safe-area-inset-bottom))] lg:bottom-6 left-3 right-3 sm:left-auto sm:right-4 sm:w-96 card p-4 flex items-center gap-3 shadow-2xl">
      <div className="text-sm flex-1">Une nouvelle version de BODYTRACK est disponible.</div>
      <Button size="sm" variant="ghost" onClick={() => setNeedRefresh(false)}>
        Plus tard
      </Button>
      <Button size="sm" variant="primary" onClick={() => void updateServiceWorker(true)}>
        Mettre à jour
      </Button>
    </div>
  );
}
