import { create } from 'zustand';

/**
 * Chronomètre de repos. L'état repose sur une heure de fin absolue (et non un décompte) :
 * il reste juste si l'écran se verrouille ou si l'application est rechargée.
 */
interface RestState {
  endsAt: number | null;
  pausedRemainingMs: number | null;
  durationSec: number;
  label: string;
  start(sec: number, label: string): void;
  pause(): void;
  resume(): void;
  add(sec: number): void;
  skip(): void;
}

const KEY = 'bodytrack:rest';

function load(): Partial<RestState> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const s = JSON.parse(raw);
    if (s.endsAt && s.endsAt < Date.now() - 60_000) return {};
    return s;
  } catch {
    return {};
  }
}

function save(s: Pick<RestState, 'endsAt' | 'pausedRemainingMs' | 'durationSec' | 'label'>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignoré */
  }
}

export const useRest = create<RestState>((set, get) => {
  const persist = () => {
    const { endsAt, pausedRemainingMs, durationSec, label } = get();
    save({ endsAt, pausedRemainingMs, durationSec, label });
  };
  return {
    endsAt: null,
    pausedRemainingMs: null,
    durationSec: 0,
    label: '',
    ...load(),
    start(sec, label) {
      unlockAudio();
      set({ endsAt: Date.now() + sec * 1000, pausedRemainingMs: null, durationSec: sec, label });
      persist();
    },
    pause() {
      const { endsAt } = get();
      if (!endsAt) return;
      set({ pausedRemainingMs: Math.max(0, endsAt - Date.now()), endsAt: null });
      persist();
    },
    resume() {
      const { pausedRemainingMs } = get();
      if (pausedRemainingMs === null) return;
      set({ endsAt: Date.now() + pausedRemainingMs, pausedRemainingMs: null });
      persist();
    },
    add(sec) {
      const { endsAt, pausedRemainingMs, durationSec } = get();
      if (endsAt) set({ endsAt: Math.max(Date.now(), endsAt + sec * 1000), durationSec: Math.max(1, durationSec + sec) });
      else if (pausedRemainingMs !== null) set({ pausedRemainingMs: Math.max(0, pausedRemainingMs + sec * 1000), durationSec: Math.max(1, durationSec + sec) });
      persist();
    },
    skip() {
      set({ endsAt: null, pausedRemainingMs: null });
      persist();
    },
  };
});

let ctx: AudioContext | null = null;
/** Les navigateurs mobiles n'autorisent le son qu'après un geste de l'utilisateur */
export function unlockAudio() {
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    ctx = null;
  }
}

export function beep() {
  try {
    unlockAudio();
    if (!ctx) return;
    const t0 = ctx.currentTime;
    [0, 0.22, 0.44].forEach((dt, i) => {
      const o = ctx!.createOscillator();
      const g = ctx!.createGain();
      o.type = 'sine';
      o.frequency.value = i === 2 ? 1320 : 880;
      g.gain.setValueAtTime(0.0001, t0 + dt);
      g.gain.exponentialRampToValueAtTime(0.35, t0 + dt + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.18);
      o.connect(g).connect(ctx!.destination);
      o.start(t0 + dt);
      o.stop(t0 + dt + 0.2);
    });
  } catch {
    /* son indisponible */
  }
}

export async function notifyRestEnd(label: string) {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    if (document.visibilityState === 'visible') return;
    const reg = await navigator.serviceWorker?.getRegistration();
    const body = label ? `Prochaine série : ${label}` : 'Prochaine série !';
    if (reg) await reg.showNotification('Repos terminé', { body, tag: 'rest', icon: './icon-192.png' });
    else new Notification('Repos terminé', { body });
  } catch {
    /* notifications indisponibles */
  }
}
