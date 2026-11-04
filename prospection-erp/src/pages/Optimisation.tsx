import { useMemo, useState } from 'react';
import { useDonnees } from '../lib/store';
import { analyseMensuelle, parcours, ECHANTILLON_MIN, type Ligne, type Recommandation } from '../lib/analytics';
import { eur, mois, pct } from '../lib/finance';
import { Kpi, Section } from '../components/ui';

const ICONE: Record<Recommandation['type'], string> = { renforcer: '▲', reduire: '▼', tester: '◆', donnees: '●' };
const COULEUR: Record<Recommandation['type'], string> = { renforcer: 'var(--color-ok)', reduire: 'var(--color-danger)', tester: 'var(--color-accent)', donnees: 'var(--color-warn)' };

function moisDisponibles(dates: string[]): string[] {
  const s = new Set(dates.map((d) => d.slice(0, 7)));
  s.add(new Date().toISOString().slice(0, 7));
  return [...s].sort().reverse();
}

function Tableau({ titre, lignes }: { titre: string; lignes: Ligne[] }) {
  return (
    <div className="overflow-x-auto">
      <table>
        <thead><tr><th>{titre}</th><th className="num">Contactés</th><th className="num">Réponses</th><th className="num">RDV</th><th className="num">Clients</th><th className="num">Réponse</th><th className="num">Conversion</th></tr></thead>
        <tbody>
          {lignes.map((l) => (
            <tr key={l.cle} className={l.contactes < ECHANTILLON_MIN ? 'muted' : ''}>
              <td>{l.cle}</td><td className="num">{l.contactes}</td><td className="num">{l.reponses}</td><td className="num">{l.rdv}</td><td className="num">{l.clients}</td>
              <td className="num">{pct(l.tauxReponse)}</td><td className="num">{pct(l.tauxConversion)}</td>
            </tr>
          ))}
          {!lignes.length && <tr><td colSpan={7} className="muted">Aucune donnée.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

export default function Optimisation() {
  const d = useDonnees();
  const liste = moisDisponibles(d.interactions.map((i) => i.date));
  const [m, setM] = useState(() => {
    // Par défaut : le mois le plus récent où de nouveaux prospects ont été contactés
    const sortants = parcours(d).flatMap((x) => (x.premierContact ? [x.premierContact.date] : [])).sort();
    return sortants.length ? sortants[sortants.length - 1].slice(0, 7) : liste[0];
  });
  const a = useMemo(() => analyseMensuelle(d, m), [d, m]);
  const tauxRep = a.cohorte ? (100 * a.reponses) / a.cohorte : 0;
  const tauxConv = a.cohorte ? (100 * a.clients) / a.cohorte : 0;
  const evol = (v: number, ref?: number) => (ref === undefined ? '' : ` (${v - ref >= 0 ? '+' : ''}${(v - ref).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} pt vs mois précédent)`);
  const nomMois = (x: string) => new Date(x + '-01T00:00:00Z').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });

  function rapport() {
    return [
      `Analyse de la prospection — ${nomMois(m)}`,
      `${a.cohorte} prospects contactés, ${a.reponses} réponses (${pct(tauxRep)}), ${a.clients} clients (${pct(tauxConv)}).`,
      a.meilleurCanal ? `Canal apportant le plus de clients : ${a.meilleurCanal.cle}.` : '',
      a.meilleurSecteur ? `Secteur le plus performant : ${a.meilleurSecteur.cle}.` : '',
      a.meilleurProfil ? `Profil le plus réactif : ${a.meilleurProfil.cle}.` : '',
      a.meilleurMessage ? `Message le plus efficace : ${a.meilleurMessage.cle}.` : '',
      '', 'Recommandations :',
      ...a.recommandations.map((r) => `- ${r.titre} : ${r.detail}`),
    ].filter((x, i, t) => x !== '' || t[i - 1] !== '').join('\n');
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold m-0">Analyse mensuelle</h1>
        <div className="flex gap-2">
          <select value={m} onChange={(e) => setM(e.target.value)}>{liste.map((x) => <option key={x} value={x}>{nomMois(x)}</option>)}</select>
          <button className="btn" onClick={() => navigator.clipboard?.writeText(rapport())}>Copier le rapport</button>
        </div>
      </div>
      <p className="text-sm muted m-0">Cohorte = prospects dont le premier contact a eu lieu dans le mois ; leurs résultats sont suivis jusqu'à aujourd'hui. Aucune conclusion n'est tirée d'un segment de moins de {ECHANTILLON_MIN} contacts (lignes grisées).</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Prospects contactés" value={a.cohorte} hint={a.precedent ? `${a.precedent.cohorte} le mois précédent` : undefined} />
        <Kpi label="Taux de réponse" value={pct(tauxRep)} hint={evol(tauxRep, a.precedent?.tauxReponse).trim() || undefined} />
        <Kpi label="Clients signés" value={a.clients} />
        <Kpi label="Conversion" value={pct(tauxConv)} hint={evol(tauxConv, a.precedent?.tauxConversion).trim() || undefined} />
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Canal qui apporte le plus de clients" value={a.meilleurCanal?.cle ?? '—'} hint={a.meilleurCanal ? `${a.meilleurCanal.clients} client(s), ${pct(a.meilleurCanal.tauxConversion)}` : 'échantillon insuffisant'} />
        <Kpi label="Secteur le plus performant" value={a.meilleurSecteur?.cle ?? '—'} hint={a.meilleurSecteur ? `${pct(a.meilleurSecteur.tauxConversion)} conv. · ${pct(a.meilleurSecteur.tauxReponse)} rép.` : 'échantillon insuffisant'} />
        <Kpi label="Profil le plus réactif" value={<span className="text-base">{a.meilleurProfil?.cle ?? '—'}</span>} hint={a.meilleurProfil ? `${pct(a.meilleurProfil.tauxReponse)} de réponse` : 'échantillon insuffisant'} />
        <Kpi label="Message le plus efficace" value={a.meilleurMessage?.cle ?? '—'} hint={a.meilleurMessage ? `${pct(a.meilleurMessage.tauxReponse)} de réponse` : 'échantillon insuffisant'} />
      </div>

      <Section title="Recommandations">
        <ul className="list-none p-0 m-0 space-y-3">
          {a.recommandations.map((r, i) => (
            <li key={i} className="flex gap-3">
              <span style={{ color: COULEUR[r.type] }} className="font-bold">{ICONE[r.type]}</span>
              <div><div className="font-semibold">{r.titre}</div><div className="text-sm muted">{r.detail}</div></div>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Campagnes actives ce mois-ci">
        <div className="overflow-x-auto">
          <table>
            <thead><tr><th>Campagne</th><th className="num">Coût</th><th className="num">Contactés</th><th className="num">Clients</th><th className="num">CAC</th><th className="num">Récupération</th></tr></thead>
            <tbody>
              {a.campagnes.map((c) => {
                const faible = a.campagnesMoinsRentables.includes(c);
                return (
                  <tr key={c.campagne.id} className={faible ? 'text-[var(--color-danger)]' : ''}>
                    <td>{c.campagne.nom}{faible && <span className="text-xs font-semibold"> · peu rentable</span>}</td><td className="num">{eur(c.campagne.cout)}</td><td className="num">{c.contactes}</td><td className="num">{c.clients}</td>
                    <td className="num">{c.clients ? eur(c.cac) : '—'}</td><td className="num">{c.clients ? mois(c.delaiRecuperation) : '—'}</td>
                  </tr>
                );
              })}
              {!a.campagnes.length && <tr><td colSpan={6} className="muted">Aucune campagne sur ce mois.</td></tr>}
            </tbody>
          </table>
        </div>
      </Section>

      <div className="grid lg:grid-cols-2 gap-4">
        <Section title="Par canal"><Tableau titre="Canal" lignes={a.parCanal} /></Section>
        <Section title="Par secteur"><Tableau titre="Métier" lignes={a.parMetier} /></Section>
        <Section title="Par taille"><Tableau titre="Taille" lignes={a.parTaille} /></Section>
        <Section title="Par ancienneté"><Tableau titre="Ancienneté au contact" lignes={a.parAnciennete} /></Section>
        <Section title="Par rôle du contact"><Tableau titre="Rôle" lignes={a.parRole} /></Section>
        <Section title="Par message"><Tableau titre="Modèle" lignes={a.parVariante} /></Section>
      </div>
    </>
  );
}
