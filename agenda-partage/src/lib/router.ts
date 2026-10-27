import { useEffect, useState } from 'react';

export type Page = 'dashboard' | 'agenda' | 'admin' | 'profile';

export interface Route {
  page: Page;
  /** Rendez-vous ouvert dans la fiche détaillée */
  appointmentId: string | null;
}

const PAGES: Page[] = ['dashboard', 'agenda', 'admin', 'profile'];
const PATHS: Record<Page, string> = { dashboard: '', agenda: 'agenda', admin: 'admin', profile: 'profil' };

export function parseHash(hash: string): Route {
  // Les fragments d'authentification (#access_token=…) ne sont pas des routes
  if (!hash.startsWith('#/')) return { page: 'dashboard', appointmentId: null };
  const [path, query = ''] = hash.slice(2).split('?');
  const page = PAGES.find((p) => PATHS[p] === path) ?? 'dashboard';
  const id = new URLSearchParams(query).get('rdv');
  return { page, appointmentId: id && /^[0-9a-f-]{36}$/i.test(id) ? id : null };
}

export function buildHash(route: Route): string {
  const q = route.appointmentId ? `?rdv=${route.appointmentId}` : '';
  return `#/${PATHS[route.page]}${q}`;
}

export function navigate(route: Partial<Route>): void {
  const current = parseHash(window.location.hash);
  const next = { ...current, ...route };
  window.location.hash = buildHash(next);
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function appointmentLink(id: string): string {
  return window.location.origin + window.location.pathname + buildHash({ page: 'agenda', appointmentId: id });
}
