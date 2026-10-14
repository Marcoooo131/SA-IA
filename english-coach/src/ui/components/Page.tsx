import type { ReactNode } from 'react';
import { WifiOff } from 'lucide-react';
import { useOnline } from '../pwa';

export function OfflineBanner({ children }: { children?: ReactNode }) {
  const online = useOnline();
  if (online) return null;
  return (
    <div className="banner" role="status">
      <WifiOff size={18} aria-hidden="true" />
      <span>
        {children ??
          'Hors connexion : leçons et révisions restent disponibles. Le professeur IA et la synchronisation reprendront au retour du réseau.'}
      </span>
    </div>
  );
}

/** Page d'une rubrique (avec barre de navigation en bas). */
export function Page({ title, subtitle, action, children }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <main className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">{title}</h1>
          {subtitle && <p className="subtitle">{subtitle}</p>}
        </div>
        {action}
      </header>
      <OfflineBanner />
      {children}
    </main>
  );
}

export function ProgressBar({ value, label }: { value: number; label: string }) {
  const pct = Math.round(Math.min(Math.max(value, 0), 1) * 100);
  return (
    <div className="progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}
