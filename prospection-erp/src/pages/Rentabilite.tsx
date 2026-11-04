import { useState } from 'react';
import { actions, useDonnees } from '../lib/store';
import { indicateurs } from '../lib/analytics';
import { cacMaximal, dureeVieMois, eur, margeMensuelleParClient, mois, pct, simulerScenarios, type Hypotheses } from '../lib/finance';
import { Field, Kpi, Section } from '../components/ui';

export default function Rentabilite() {
  const d = useDonnees();
  const ind = indicateurs(d);
  const p = d.parametres;
  const cacObserve = Number.isFinite(ind.cac) && ind.clientsAcquis > 0 ? Math.round(ind.cac) : undefined;
  const [cac, setCac] = useState<number>(cacObserve ?? 60);
  const [horizon, setHorizon] = useState(24);
  const [taux, setTaux] = useState<number>(ind.contactes >= 20 && ind.tauxConversion > 0 ? Math.round(ind.tauxConversion * 10) / 10 : 3);
  const h: Hypotheses = {
    prixMensuelHT: p.prixMensuelHT, margeBrutePct: p.margeBrutePct, churnMensuelPct: p.churnMensuelPct, dureeRetentionMois: p.dureeRetentionMois,
    coutsFixesMensuels: p.coutsFixesMensuels, cac, horizonMois: horizon, tauxConversionPct: taux,
  };
  const sc = simulerScenarios(h);
  const vie = dureeVieMois(h);
  const marge = margeMensuelleParClient(h);
  const num = (v: string) => (v === '' ? 0 : Math.max(0, Number(v)));

  return (
    <>
      <Section title="Hypothèses">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Field label="Prix (€ HT / mois)"><input className="w-full" type="number" min={0} step={0.5} value={p.prixMensuelHT} onChange={(e) => actions.majParametres({ prixMensuelHT: num(e.target.value) })} /></Field>
          <Field label="Marge brute réelle (%)"><input className="w-full" type="number" min={0} max={100} value={p.margeBrutePct} onChange={(e) => actions.majParametres({ margeBrutePct: Math.min(100, num(e.target.value)) })} /></Field>
          <Field label="Attrition mensuelle (%)"><input className="w-full" type="number" min={0} max={100} step={0.5} value={p.churnMensuelPct} onChange={(e) => actions.majParametres({ churnMensuelPct: Math.min(100, num(e.target.value)) })} /></Field>
          <Field label="Durée de rétention imposée (mois, 0 = auto)"><input className="w-full" type="number" min={0} value={p.dureeRetentionMois} onChange={(e) => actions.majParametres({ dureeRetentionMois: num(e.target.value) })} /></Field>
          <Field label={`Coût d'acquisition par client (€)${cacObserve !== undefined ? ` — observé : ${cacObserve} €` : ''}`}><input className="w-full" type="number" min={0} value={cac} onChange={(e) => setCac(num(e.target.value))} /></Field>
          <Field label="Coûts fixes de prospection (€ / mois)"><input className="w-full" type="number" min={0} value={p.coutsFixesMensuels} onChange={(e) => actions.majParametres({ coutsFixesMensuels: num(e.target.value) })} /></Field>
          <Field label={`Conversion contact → client (%)${ind.contactes ? ` — observée : ${pct(ind.tauxConversion)}` : ''}`}><input className="w-full" type="number" min={0} max={100} step={0.1} value={taux} onChange={(e) => setTaux(Math.min(100, num(e.target.value)))} /></Field>
          <Field label="Horizon d'analyse (mois)"><input className="w-full" type="number" min={1} max={120} value={horizon} onChange={(e) => setHorizon(Math.max(1, Math.min(120, num(e.target.value))))} /></Field>
        </div>
        <p className="text-xs muted mb-0">La marge brute retire du prix les coûts de service (hébergement, support, frais de paiement…). Le résultat retire en plus les coûts d'acquisition et les coûts fixes de prospection ; il ne tient pas compte des autres charges de l'entreprise (salaires, développement…).</p>
      </Section>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Kpi label="Marge brute / client / mois" value={eur(marge, 2)} hint={`sur ${eur(p.prixMensuelHT, 2)} HT facturés`} />
        <Kpi label="Durée de vie client" value={mois(vie)} hint={p.dureeRetentionMois ? 'imposée' : `déduite de ${pct(p.churnMensuelPct)} d'attrition`} />
        <Kpi label="Valeur vie client (marge)" value={eur(vie * marge)} hint={`CA : ${eur(vie * p.prixMensuelHT)}`} />
        <Kpi label="Récupération du CAC" value={mois(marge > 0 ? cac / marge : Infinity)} hint={`LTV / CAC : ${cac > 0 && Number.isFinite(vie) ? (vie * marge / cac).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) : '—'}`} />
        <Kpi label="CAC maximal conseillé" value={eur(cacMaximal(12, h))} hint={`récupéré en 12 mois (6 mois : ${eur(cacMaximal(6, h))})`} />
      </div>

      <Section title={`Scénarios sur ${horizon} mois (cohorte acquise au mois 0)`}>
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr><th className="num">Clients</th><th className="num">MRR</th><th className="num">ARR</th><th className="num">Contacts nécessaires</th><th className="num">Coût d'acquisition</th>
                <th className="num">Chiffre d'affaires</th><th className="num">Marge brute</th><th className="num">Coûts fixes</th><th className="num">Résultat</th><th className="num">Équilibre</th><th className="num">Clients restants</th></tr>
            </thead>
            <tbody>
              {sc.map((s) => (
                <tr key={s.clients}>
                  <td className="num font-bold">{s.clients}</td><td className="num">{eur(s.mrr)}</td><td className="num">{eur(s.arr)}</td>
                  <td className="num">{s.contactsNecessaires?.toLocaleString('fr-FR') ?? '—'}</td>
                  <td className="num">{eur(s.coutAcquisition)}</td><td className="num">{eur(s.chiffreAffaires)}</td><td className="num">{eur(s.margeBrute)}</td><td className="num">{eur(s.coutsFixes)}</td>
                  <td className={`num font-bold ${s.resultat < 0 ? 'text-[var(--color-danger)]' : 'text-[var(--color-ok)]'}`}>{eur(s.resultat)}</td>
                  <td className="num">{s.moisEquilibre ? `mois ${s.moisEquilibre}` : 'non atteint'}</td>
                  <td className="num">{s.clientsRestants.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} <span className="muted text-xs">({eur(s.mrrFin)}/mois)</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs muted mb-0">MRR et ARR à l'acquisition. Le chiffre d'affaires et la marge tiennent compte de l'attrition sur l'horizon. Équilibre : premier mois où la marge cumulée couvre l'acquisition et les coûts fixes.</p>
      </Section>

      <Section title="Réalisé (données de suivi)">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi label="Clients acquis / actifs" value={`${ind.clientsAcquis} / ${ind.clientsActifs}`} />
          <Kpi label="MRR · ARR" value={eur(ind.mrr)} hint={`ARR ${eur(ind.arr)}`} />
          <Kpi label="CA généré · marge brute" value={eur(ind.caGenere)} hint={`marge ${eur(ind.margeGeneree)}`} />
          <Kpi label="Coût des campagnes" value={eur(ind.coutCampagnes)} hint={`résultat ${eur(ind.margeGeneree - ind.coutCampagnes)}`} />
          <Kpi label="CAC observé" value={ind.clientsAcquis ? eur(ind.cac) : '—'} hint={ind.clientsAcquis ? `récupéré en ${mois(ind.delaiRecuperation)}` : 'aucun client encore'} />
          <Kpi label="Attrition observée" value={ind.churnObserve !== undefined ? pct(ind.churnObserve) : '—'} hint={ind.churnObserve !== undefined ? `${ind.resiliations} résiliation(s)` : 'moins de 12 mois-clients : recul insuffisant'} />
          <Kpi label="Taux de réponse" value={pct(ind.tauxReponse)} />
          <Kpi label="Conversion globale" value={pct(ind.tauxConversion)} />
        </div>
        <div className="overflow-x-auto mt-3">
          <table>
            <thead><tr><th>Canal</th><th className="num">Contactés</th><th className="num">Clients</th><th className="num">Conversion</th></tr></thead>
            <tbody>{ind.parCanal.map((l) => <tr key={l.cle}><td>{l.cle}</td><td className="num">{l.contactes}</td><td className="num">{l.clients}</td><td className="num">{pct(l.tauxConversion)}</td></tr>)}</tbody>
          </table>
        </div>
      </Section>
    </>
  );
}
