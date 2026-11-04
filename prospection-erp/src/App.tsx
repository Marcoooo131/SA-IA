import { useEffect, useState } from 'react';
import { useDonnees } from './lib/store';
import TableauDeBord from './pages/TableauDeBord';
import Recherche from './pages/Recherche';
import Prospects from './pages/Prospects';
import FicheProspect from './pages/FicheProspect';
import Campagnes from './pages/Campagnes';
import Rentabilite from './pages/Rentabilite';
import Optimisation from './pages/Optimisation';
import Parametres from './pages/Parametres';

const ONGLETS = [
  ['tableau', 'Tableau de bord'],
  ['recherche', 'Recherche'],
  ['prospects', 'Prospects'],
  ['campagnes', 'Campagnes'],
  ['rentabilite', 'Rentabilité'],
  ['optimisation', 'Optimisation'],
  ['parametres', 'Paramètres'],
] as const;

function useRoute(): string[] {
  const lire = () => (location.hash.replace(/^#\/?/, '').split('?')[0] || 'tableau').split('/');
  const [r, setR] = useState(lire);
  useEffect(() => {
    const f = () => { setR(lire()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  return r;
}

export default function App() {
  const [page, id] = useRoute();
  const d = useDonnees();
  const actif = page === 'prospect' ? 'prospects' : page;
  return (
    <div className="min-h-screen">
      <header className="bg-[var(--color-surface)] border-b border-[var(--color-line)] sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-2 flex flex-wrap items-center gap-x-5 gap-y-1">
          <a href="#/tableau" className="font-extrabold text-[var(--color-ink)] no-underline whitespace-nowrap">
            Prospection ERP <span className="text-[var(--color-accent)]">BTP</span>
            <span className="muted font-normal text-xs ml-2">{d.parametres.prixMensuelHT} € HT / mois</span>
          </a>
          <nav className="flex gap-1 overflow-x-auto -mx-1 px-1">
            {ONGLETS.map(([k, l]) => (
              <a key={k} href={`#/${k}`}
                className={`px-2.5 py-2 text-sm rounded-md whitespace-nowrap no-underline ${actif === k ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)] font-semibold' : 'text-[var(--color-muted)]'}`}>{l}</a>
            ))}
          </nav>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-5 space-y-4">
        {page === 'recherche' ? <Recherche />
          : page === 'prospects' ? <Prospects />
            : page === 'prospect' && id ? <FicheProspect id={id} />
              : page === 'campagnes' ? <Campagnes />
                : page === 'rentabilite' ? <Rentabilite />
                  : page === 'optimisation' ? <Optimisation />
                    : page === 'parametres' ? <Parametres />
                      : <TableauDeBord />}
      </main>
      <footer className="max-w-6xl mx-auto px-4 pb-8 text-xs muted">
        Données stockées uniquement dans ce navigateur. Recherche publique via l'API Recherche d'entreprises (data.gouv.fr).
        Aucun envoi automatique : chaque message est relu, personnalisé et envoyé par vous.
      </footer>
    </div>
  );
}
