import { useEffect, useSyncExternalStore } from 'react';

/** Routeur minimal par fragment d'URL (#/chemin) : compatible GitHub Pages et hors connexion */
function getPath(): string {
  const h = window.location.hash.replace(/^#/, '');
  return h.startsWith('/') ? h : '/';
}

function subscribe(cb: () => void) {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
}

export function usePath(): string {
  return useSyncExternalStore(subscribe, getPath, () => '/');
}

export function navigate(path: string, opts: { replace?: boolean } = {}) {
  if (opts.replace) {
    const url = `${window.location.pathname}${window.location.search}#${path}`;
    window.history.replaceState(null, '', url);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else window.location.hash = path;
}

export function back(fallback = '/') {
  if (window.history.length > 1) window.history.back();
  else navigate(fallback);
}

/** Correspondance « /exercises/:id » → { id } */
export function match(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split('/').filter(Boolean);
  const a = path.split('?')[0].split('/').filter(Boolean);
  if (p.length !== a.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(a[i]);
    else if (p[i] !== a[i]) return null;
  }
  return params;
}

export function useScrollTop(path: string) {
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [path]);
}

export function queryParam(path: string, key: string): string | null {
  const q = path.split('?')[1];
  return q ? new URLSearchParams(q).get(key) : null;
}
