import { useMemo, useState } from 'react';
import { useDonnees } from '../lib/store';
import { scorer } from '../lib/scoring';
import { FILTRES_CREATION, METIERS, STATUTS, TAILLES, ageJours, creeDepuisMoinsDe, libelleMetier, libelleTaille, tailleProspect, type FiltreCreation } from '../lib/referentiel';
import { versCsv } from '../lib/csv';
import { Field, Section, ScoreBadge, telecharger } from '../components/ui';
import type { Statut } from '../lib/types';

export default function Prospects() {
  const d = useDonnees();
  const now = new Date();
  const q0 = new URLSearchParams(location.hash.split('?')[1] ?? '');
  const [texte, setTexte] = useState('');
  const [metier, setMetier] = useState('');
  const [taille, setTaille] = useState('');
  const [creation, setCreation] = useState<FiltreCreation | ''>('');
  const [statut, setStatut] = useState<Statut | ''>((q0.get('statut') as Statut) ?? '');
  const [priorite, setPriorite] = useState('');
  const [confiance, setConfiance] = useState('');

  const lignes = useMemo(() => d.prospects.map((p) => ({ p, s: scorer(p, now) })).sort((a, b) => b.s.total - a.s.total), [d.prospects]); // now stable per render
  const filtres = lignes.filter(({ p, s }) =>
    (!texte || `${p.nom} ${p.commune ?? ''} ${p.dirigeant?.nom ?? ''} ${p.siren ?? ''}`.toLowerCase().includes(texte.toLowerCase()))
    && (!metier || p.metier === metier)
    && (!taille || tailleProspect(p) === taille)
    && (!creation || creeDepuisMoinsDe(p.dateCreation, creation, now))
    && (!statut || p.statut === statut)
    && (!priorite || s.priorite === priorite)
    && (!confiance || s.confiance === confiance));

  function exporter() {
    telecharger(`prospects-${now.toISOString().slice(0, 10)}.csv`, versCsv(
      ['Nom', 'SIREN', 'Métier', 'NAF', 'Taille', 'Date de création', 'Commune', 'Code postal', 'Dirigeant', 'Qualité', 'Téléphone', 'E-mail', 'Site', 'LinkedIn', 'Statut', 'Score', 'Priorité', 'Confiance'],
      filtres.map(({ p, s }) => [p.nom, p.siren, libelleMetier(p.metier), p.naf, libelleTaille(tailleProspect(p)), p.dateCreation, p.commune, p.codePostal,
        [p.dirigeant?.prenom, p.dirigeant?.nom].filter(Boolean).join(' '), p.dirigeant?.qualite, p.telephone, p.email, p.siteWeb, p.dirigeant?.linkedinUrl,
        STATUTS[p.statut], s.total, s.priorite, s.confiance]),
    ));
  }

  return (
    <Section title={`Prospects (${filtres.length} / ${d.prospects.length})`} actions={<button className="btn" onClick={exporter}>Exporter en CSV</button>}>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2 mb-3">
        <Field label="Recherche"><input className="w-full" value={texte} onChange={(e) => setTexte(e.target.value)} placeholder="Nom, ville, SIREN" /></Field>
        <Field label="Métier">
          <select className="w-full" value={metier} onChange={(e) => setMetier(e.target.value)}>
            <option value="">Tous</option>{METIERS.map((m) => <option key={m.id} value={m.id}>{m.pluriel}</option>)}
            <option value="autre_btp">Autre BTP</option><option value="hors_btp">Hors BTP</option><option value="inconnu">Inconnu</option>
          </select>
        </Field>
        <Field label="Taille">
          <select className="w-full" value={taille} onChange={(e) => setTaille(e.target.value)}>
            <option value="">Toutes</option>{TAILLES.map((t) => <option key={t.id} value={t.id}>{t.libelle}</option>)}
            <option value="plus_de_20">Plus de 20</option><option value="inconnue">Inconnue</option>
          </select>
        </Field>
        <Field label="Création">
          <select className="w-full" value={creation} onChange={(e) => setCreation(e.target.value as FiltreCreation | '')}>
            <option value="">Toutes</option>{FILTRES_CREATION.map((f) => <option key={f.id} value={f.id}>{f.libelle}</option>)}
          </select>
        </Field>
        <Field label="Statut">
          <select className="w-full" value={statut} onChange={(e) => setStatut(e.target.value as Statut | '')}>
            <option value="">Tous</option>{Object.entries(STATUTS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Field>
        <Field label="Priorité">
          <select className="w-full" value={priorite} onChange={(e) => setPriorite(e.target.value)}>
            <option value="">Toutes</option><option value="A">A (≥ 70)</option><option value="B">B (50-69)</option><option value="C">C (30-49)</option><option value="D">D (&lt; 30)</option>
          </select>
        </Field>
        <Field label="Confiance">
          <select className="w-full" value={confiance} onChange={(e) => setConfiance(e.target.value)}>
            <option value="">Toutes</option><option value="élevée">Élevée</option><option value="moyenne">Moyenne</option><option value="faible">Faible (à enrichir)</option>
          </select>
        </Field>
      </div>
      <div className="overflow-x-auto">
        <table>
          <thead><tr><th>Entreprise</th><th>Métier · taille</th><th>Création</th><th>Dirigeant</th><th>Statut</th><th className="num">Score</th></tr></thead>
          <tbody>
            {filtres.map(({ p, s }) => {
              const age = ageJours(p.dateCreation, now);
              return (
                <tr key={p.id}>
                  <td><a href={`#/prospect/${p.id}`} className="font-semibold">{p.nom}</a><div className="text-xs muted">{[p.commune, p.codePostal].filter(Boolean).join(' ')}</div></td>
                  <td className="text-sm">{libelleMetier(p.metier)}<div className="text-xs muted">{libelleTaille(tailleProspect(p))}</div></td>
                  <td className="text-sm whitespace-nowrap">{p.dateCreation ? new Date(p.dateCreation).toLocaleDateString('fr-FR') : <span className="muted">inconnue</span>}
                    {age !== undefined && age < 365 && <div className="text-xs text-[var(--color-ok)] font-semibold">{age < 31 ? '< 30 jours' : age < 91 ? '< 3 mois' : age < 182 ? '< 6 mois' : '< 12 mois'}</div>}</td>
                  <td className="text-sm">{p.dirigeant?.nom ? `${p.dirigeant.prenom ?? ''} ${p.dirigeant.nom}` : <span className="muted">—</span>}</td>
                  <td className="text-sm">{STATUTS[p.statut]}</td>
                  <td className="num"><ScoreBadge total={s.total} priorite={s.priorite} confiance={s.confiance} /></td>
                </tr>
              );
            })}
            {!filtres.length && <tr><td colSpan={6} className="muted">Aucun prospect ne correspond. <a href="#/recherche">Lancer une recherche</a>.</td></tr>}
          </tbody>
        </table>
      </div>
    </Section>
  );
}
