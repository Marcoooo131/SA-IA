import { useEffect, useState, useSyncExternalStore } from 'react';

/** Installation sur l'écran d'accueil, mise à jour de l'application, réseau et clavier mobile. */

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let installEvent: BeforeInstallPromptEvent | null = null;
let waitingWorker: ServiceWorker | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export type Platform = 'ios' | 'android' | 'desktop';
export type Browser = 'safari' | 'chrome' | 'edge' | 'firefox' | 'samsung' | 'other';

export function detectPlatform(ua = navigator.userAgent): { platform: Platform; browser: Browser } {
  const iPadOS = /Macintosh/.test(ua) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1;
  const platform: Platform = /iPhone|iPad|iPod/.test(ua) || iPadOS ? 'ios' : /Android/.test(ua) ? 'android' : 'desktop';
  const browser: Browser = /SamsungBrowser/.test(ua)
    ? 'samsung'
    : /Edg\//.test(ua)
      ? 'edge'
      : /Firefox|FxiOS/.test(ua)
        ? 'firefox'
        : /CriOS|Chrome/.test(ua)
          ? 'chrome'
          : /Safari/.test(ua)
            ? 'safari'
            : 'other';
  return { platform, browser };
}

export function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.matchMedia?.('(display-mode: fullscreen)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function initPwa() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installEvent = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    installEvent = null;
    emit();
  });

  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
      try {
        const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
        const track = (worker: ServiceWorker | null) => {
          if (!worker) return;
          const check = () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              waitingWorker = worker;
              emit();
            }
          };
          worker.addEventListener('statechange', check);
          check();
        };
        track(reg.waiting);
        reg.addEventListener('updatefound', () => track(reg.installing));
        // Vérifie les mises à jour quand l'application revient au premier plan.
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') void reg.update().catch(() => {});
        });
      } catch {
        /* sans service worker, l'application fonctionne mais pas hors ligne */
      }
    });
    let reloading = false;
    navigator.serviceWorker?.addEventListener('controllerchange', () => {
      if (reloading || !waitingWorker) return;
      reloading = true;
      window.location.reload();
    });
  }
}

export function useInstallPrompt() {
  const event = useSyncExternalStore(subscribe, () => installEvent);
  return event
    ? async () => {
        await event.prompt();
        const choice = await event.userChoice;
        if (choice.outcome === 'accepted') installEvent = null;
        emit();
        return choice.outcome;
      }
    : null;
}

export function useUpdateAvailable() {
  const worker = useSyncExternalStore(subscribe, () => waitingWorker);
  return worker ? () => worker.postMessage('SKIP_WAITING') : null;
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

/**
 * Suit la partie visible de l'écran (visualViewport) : quand le clavier apparaît,
 * --app-height se réduit et les écrans d'exercice gardent leur bouton au-dessus du clavier.
 */
export function initViewport() {
  const root = document.documentElement;
  const vv = window.visualViewport;
  const update = () => {
    const height = vv ? vv.height : window.innerHeight;
    root.style.setProperty('--app-height', `${Math.round(height)}px`);
    root.style.setProperty('--vv-top', `${Math.round(vv?.offsetTop ?? 0)}px`);
    root.classList.toggle('kb-open', vv ? window.innerHeight - vv.height > 140 : false);
  };
  update();
  vv?.addEventListener('resize', update);
  vv?.addEventListener('scroll', update);
  window.addEventListener('resize', update);

  const editable = (el: EventTarget | null) =>
    el instanceof HTMLElement && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && (el as HTMLInputElement).type !== 'button'));
  const touch = window.matchMedia?.('(pointer: coarse)').matches;
  document.addEventListener('focusin', (e) => {
    if (!editable(e.target)) return;
    if (touch) root.classList.add('typing');
    // Laisse le clavier s'ouvrir puis garde le champ visible.
    setTimeout(() => (e.target as HTMLElement).scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }), 320);
  });
  // Un champ retiré de la page (changement d'écran) ne déclenche pas toujours « focusout » :
  // on vérifie donc aussi après chaque navigation, sinon la barre du bas resterait masquée.
  const refresh = () => {
    if (!editable(document.activeElement)) root.classList.remove('typing');
  };
  document.addEventListener('focusout', () => setTimeout(refresh, 0));
  window.addEventListener('hashchange', () => setTimeout(refresh, 0));
}
