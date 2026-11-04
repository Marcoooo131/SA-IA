// Liens de recherche gratuits (sections C.2, C.4, C.5) : l'outil ne « scrape » aucun site ;
// il prépare les recherches et l'utilisateur reporte ce qu'il a réellement trouvé (avec sa source).
import type { Prospect } from './types';
import { libelleMetier, METIERS_CIBLES } from './referentiel';

const enc = encodeURIComponent;

export interface Lien { libelle: string; url: string; usage: string }

export function liensRecherche(p: Prospect): Lien[] {
  const metier = METIERS_CIBLES.includes(p.metier) ? libelleMetier(p.metier) : '';
  const ville = p.commune ?? '';
  const dir = p.dirigeant?.nom ? `${p.dirigeant.prenom ?? ''} ${p.dirigeant.nom}`.trim() : '';
  const l: Lien[] = [
    { libelle: 'Google', url: `https://www.google.com/search?q=${enc(`"${p.nom}" ${ville} ${metier}`.trim())}`, usage: 'Site web, téléphone, avis clients' },
    { libelle: 'PagesJaunes', url: `https://www.pagesjaunes.fr/annuaire/chercherlespros?quoiqui=${enc(p.nom)}&ou=${enc(ville || p.codePostal || '')}`, usage: 'Coordonnées professionnelles publiées' },
  ];
  if (p.siren) l.push({ libelle: 'Annuaire des entreprises', url: `https://annuaire-entreprises.data.gouv.fr/entreprise/${p.siren}`, usage: 'Dirigeants, établissements, labels RGE' });
  l.push({
    libelle: 'LinkedIn (personnes)',
    url: `https://www.linkedin.com/search/results/people/?keywords=${enc(dir ? `${dir} ${p.nom}` : p.nom)}`,
    usage: 'Profil du dirigeant (à vérifier avant tout message)',
  });
  if (dir) l.push({ libelle: 'Google → LinkedIn', url: `https://www.google.com/search?q=${enc(`site:linkedin.com/in "${dir}" ${metier || p.nom}`)}`, usage: 'Trouver le profil sans compte premium' });
  l.push({ libelle: 'Offres d\'emploi', url: `https://www.google.com/search?q=${enc(`"${p.nom}" recrute OR emploi ${ville}`)}`, usage: 'Signal de développement (recrutement)' });
  return l;
}
