import { useMemo } from 'react';
import { useDonnees, actions } from '../lib/store';
import { indicateurs, messagesDuJour } from '../lib/analytics';
import { scorer } from '../lib/scoring';
import { eur, mois, pct } from '../lib/finance';
import { STATUTS, creeDepuisMoinsDe, libelleMetier } from '../lib/referentiel';
import { donneesDemo } from '../lib/demo';
import { Kpi, Section, ScoreBadge, Barre } from '../components/ui';
import type { Statut } from '../lib/types';

export default function TableauDeBord() {
  const d = useDonnees();
  const now = new Date();
  const ind = useMemo(() => indicateurs(d, now), [d]);
  const aContacter = useMemo(() => d.prospects
    .filter((p) => p.statut === 'a_contacter' || p.statut === 'a_qualifier')
    .map((p) => ({ p, s: scorer(p, now) }))
    .sort((a, b) => b.s.total - a.s.total)
    .slice(0, 8), [d]);
  const recentes = d.prospects.filter((p) => creeDepuisMoinsDe(p.dateCreation, '3m', now) && (p.statut === 'a_contacter' || p.statut === 'a_qualifier')).length;
  const jour = messagesDuJour(d, now);
  const parStatut = Object.keys(STATUTS).map((s) => [s, d.prospects.filter((p) => p.statut === s).length] as const);

  if (!d.prospects.length) {
    return (
      <Section title="Bienvenue">
        <p className="mt-0">Cet outil organise la prospection d'un ERP bâtiment vendu <b>{d.parametres.prixMensuelHT} € HT / mois</b> : il privilégie les canaux peu coûteux et les TPE du bâtiment (artisans, 2 à 20 salariés).</p>
        <ol className="text-sm space-y-1">
          <li><b>Recherche</b> : trouvez des entreprises dans les données publiques (métier, taille, département, créations récentes) ou importez un fichier CSV.</li>
          <li><b>Prospects</b> : complétez les fiches (Google, annuaires, LinkedIn) — chaque score est justifié et ne compte jamais une donnée inconnue.</li>
          <li><b>Messages</b> : générez un message court et personnalisé, relisez-le, envoyez-le vous-même, puis enregistrez l'envoi.</li>
          <li><b>Campagnes, Rentabilité, Optimisation</b> : suivez les coûts, le CAC, le MRR et laissez l'analyse mensuelle proposer des améliorations.</li>
        </ol>
        <div className="flex flex-wrap gap-2">
          <a className="btn btn-primary no-underline" href="#/recherche">Commencer une recherche</a>
          <button className="btn" onClick={() => actions.remplacer(donneesDemo())}>Charger des données de démonstration (fictives)</button>
        </div>
      </Section>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Kpi label="Clients actifs" value={ind.clientsActifs} hint={`${ind.clientsAcquis} acquis · ${ind.resiliations} résiliation(s)`} />
        <Kpi label="MRR" value={eur(ind.mrr)} hint={`ARR ${eur(ind.arr)}`} />
        <Kpi label="CA généré (cumul)" value={eur(ind.caGenere)} hint={`Marge brute ${eur(ind.margeGeneree)}`} />
        <Kpi label="Coût des campagnes" value={eur(ind.coutCampagnes)} hint={`Résultat ${eur(ind.margeGeneree - ind.coutCampagnes)}`} />
        <Kpi label="CAC" value={eur(ind.cac)} hint={`Récupéré en ${mois(ind.delaiRecuperation)}`} />
        <Kpi label="Conversion" value={pct(ind.tauxConversion)} hint={`${pct(ind.tauxReponse)} de réponse · ${ind.contactes} contactés`} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Section title="À contacter en priorité" actions={<a href="#/prospects" className="text-sm">Tous les prospects →</a>}>
          {aContacter.length ? (
            <table>
              <tbody>
                {aContacter.map(({ p, s }) => (
                  <tr key={p.id}>
                    <td><a href={`#/prospect/${p.id}`}>{p.nom}</a><div className="text-xs muted">{libelleMetier(p.metier)}{p.commune ? ` · ${p.commune}` : ''}</div></td>
                    <td className="num"><ScoreBadge total={s.total} priorite={s.priorite} confiance={s.confiance} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="muted text-sm">Aucun prospect en attente de contact.</p>}
          <p className="text-sm mb-0 mt-3">
            <b>{recentes}</b> entreprise(s) créée(s) depuis moins de 3 mois en attente de contact — angle « lancement d'activité » recommandé.
          </p>
        </Section>

        <div className="space-y-4">
          <Section title="Messages du jour">
            <div className="flex items-center gap-3">
              <div className="text-2xl font-bold tabular-nums whitespace-nowrap">{jour} / {d.parametres.quotaMessagesJour}</div>
              <Barre value={jour} max={d.parametres.quotaMessagesJour} />
            </div>
            <p className="text-xs muted mb-0">Plafond volontaire de messages personnalisés par jour (réglable dans Paramètres) : pas d'envoi de masse.</p>
          </Section>
          <Section title="Pipeline">
            <div className="grid grid-cols-3 gap-2 text-sm">
              {parStatut.map(([s, n]) => (
                <a key={s} href={`#/prospects?statut=${s}`} className="no-underline text-[var(--color-ink)] border border-[var(--color-line)] rounded-lg px-2 py-1.5">
                  <div className="text-xs muted">{STATUTS[s as Statut]}</div><b>{n}</b>
                </a>
              ))}
            </div>
          </Section>
        </div>
      </div>

      <Section title="Performance par canal">
        <div className="overflow-x-auto">
          <table>
            <thead><tr><th>Canal</th><th className="num">Contactés</th><th className="num">Réponses</th><th className="num">RDV</th><th className="num">Clients</th><th className="num">Taux de réponse</th><th className="num">Conversion</th></tr></thead>
            <tbody>
              {ind.parCanal.map((l) => (
                <tr key={l.cle}><td>{l.cle}</td><td className="num">{l.contactes}</td><td className="num">{l.reponses}</td><td className="num">{l.rdv}</td><td className="num">{l.clients}</td><td className="num">{pct(l.tauxReponse)}</td><td className="num">{pct(l.tauxConversion)}</td></tr>
              ))}
              {!ind.parCanal.length && <tr><td colSpan={7} className="muted">Aucune prise de contact enregistrée.</td></tr>}
            </tbody>
          </table>
        </div>
      </Section>
    </>
  );
}
