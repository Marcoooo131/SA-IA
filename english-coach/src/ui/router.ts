import { useSyncExternalStore } from 'react';

/** Navigation par fragment (#/…) : fonctionne hors ligne et dans un sous-dossier, sans configuration serveur. */

function current() {
  return window.location.hash.replace(/^#/, '') || '/';
}

function subscribe(listener: () => void) {
  window.addEventListener('hashchange', listener);
  return () => window.removeEventListener('hashchange', listener);
}

export function useRoute(): string {
  return useSyncExternalStore(subscribe, current, () => '/');
}

export function navigate(path: string, opts: { replace?: boolean } = {}) {
  if (current() === path) return;
  if (opts.replace) {
    const url = new URL(window.location.href);
    url.hash = path;
    window.history.replaceState(null, '', url);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    window.location.hash = path;
  }
}

export function matchRoute(route: string, pattern: string): Record<string, string> | null {
  const a = route.split('/').filter(Boolean);
  const b = pattern.split('/').filter(Boolean);
  if (a.length !== b.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < b.length; i++) {
    if (b[i].startsWith(':')) params[b[i].slice(1)] = decodeURIComponent(a[i]);
    else if (a[i] !== b[i]) return null;
  }
  return params;
}
