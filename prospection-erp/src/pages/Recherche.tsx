import { useMemo, useState } from 'react';
import { actions, useDonnees } from '../lib/store';
import { rechercher, versProspect, construireUrl, type CriteresRecherche, type ResultatApi } from '../lib/entreprises';
import { FILTRES_CREATION, METIERS, TAILLES, TRANCHES, ageJours, libelleMetier, metierDepuisNaf, type FiltreCreation } from '../lib/referentiel';
import { importerCsv } from '../lib/csv';
import { scorer } from '../lib/scoring';
import { Chips, Field, Groupe, Section, ScoreBadge } from '../components/ui';
import type { Metier, Taille } from '../lib/types';

export default function Recherche() {
  const d = useDonnees();
  const [c, setC] = useState<CriteresRecherche>({ metiers: METIERS.map((m) => m.id), tailles: TAILLES.map((t) => t.id), departement: '' });
  const [maxPages, setMaxPages] = useState(4);
  const [etat, setEtat] = useState<{ chargement?: string; erreur?: string; info?: string }>({});
  const [res, setRes] = useState<ResultatApi[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [csvMsg, setCsvMsg] = useState('');
  const connus = useMemo(() => new Set(d.prospects.map((p) => p.siren).filter(Boolean)), [d.prospects]);
  const now = new Date();
  const nowIso = now.toISOString();

  async function lancer() {
    setEtat({ chargement: 'Recherche…' });
    setRes([]);
    setSel(new Set());
    try {
      const r = await rechercher(c, maxPages, now, fetch, (p, n) => setEtat({ chargement: `Page ${p} / ${n}…` }));
      const tri = r.resultats.slice().sort((a, b) => (b.date_creation ?? '').localeCompare(a.date_creation ?? ''));
      setRes(tri);
      setSel(new Set(tri.filter((x) => !connus.has(x.siren)).map((x) => x.siren)));
      setEtat({
        info: `${r.total.toLocaleString('fr-FR')} entreprise(s) correspondent dans le répertoire ; ${r.pagesLues} page(s) sur ${r.pagesTotal} parcourue(s)`
          + (c.creation ? ` ; ${tri.length} créée(s) dans la période demandée. L'API ne filtre pas par date : affinez par département ou code postal pour couvrir tout le périmètre.` : '.'),
      });
    } catch (e) {
      setEtat({ erreur: `${e instanceof Error ? e.message : String(e)} Vérifiez votre connexion (l'API publique doit être joignable depuis ce navigateur).` });
    }
  }

  function ajouter() {
    const ps = res.filter((r) => sel.has(r.siren)).map((r) => versProspect(r, nowIso));
    const { ajoutes, doublons } = actions.ajouterProspects(ps);
    setEtat({ info: `${ajoutes} prospect(s) ajouté(s)${doublons ? `, ${doublons} doublon(s) ignoré(s)` : ''}. Complétez leurs fiches (coordonnées, logiciel actuel, activité) pour fiabiliser le score.` });
    setSel(new Set());
  }

  async function importer(f: File) {
    const r = importerCsv(await f.text(), nowIso);
    const { ajoutes, doublons } = actions.ajouterProspects(r.prospects);
    setCsvMsg(`${ajoutes} prospect(s) importé(s), ${doublons} doublon(s), ${r.ignorees} ligne(s) sans nom ignorée(s). Colonnes reconnues : ${r.colonnesReconnues.join(', ') || 'aucune'}.`);
  }

  return (
    <>
      <Section title="Recherche d'entreprises (données publiques, gratuites)">
        <div className="space-y-3">
          <Groupe label="Métiers ciblés (codes NAF)">
            <Chips<Metier> options={METIERS.map((m) => [m.id, m.pluriel])} value={c.metiers} onChange={(metiers) => setC({ ...c, metiers })} />
          </Groupe>
          <Groupe label="Taille (tranche d'effectif INSEE)">
            <Chips<Taille> options={TAILLES.map((t) => [t.id, t.libelle])} value={c.tailles} onChange={(tailles) => setC({ ...c, tailles })} />
          </Groupe>
          <Groupe label="Entreprises nouvellement créées">
            <Chips<FiltreCreation> options={FILTRES_CREATION.map((f) => [f.id, f.libelle])} value={c.creation ? [c.creation] : []}
              onChange={(v) => setC({ ...c, creation: v.filter((x) => x !== c.creation)[0] })} />
          </Groupe>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Field label="Département"><input className="w-full" placeholder="ex. 35" value={c.departement} onChange={(e) => setC({ ...c, departement: e.target.value })} /></Field>
            <Field label="Code postal"><input className="w-full" placeholder="ex. 35000" value={c.codePostal ?? ''} onChange={(e) => setC({ ...c, codePostal: e.target.value })} /></Field>
            <Field label="Mot-clé (facultatif)"><input className="w-full" placeholder="ex. rénovation" value={c.motCle ?? ''} onChange={(e) => setC({ ...c, motCle: e.target.value })} /></Field>
            <Field label="Pages parcourues (25 / page)"><input className="w-full" type="number" min={1} max={20} value={maxPages} onChange={(e) => setMaxPages(Math.max(1, Math.min(20, Number(e.target.value) || 1)))} /></Field>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn btn-primary" disabled={!!etat.chargement || !c.metiers.length} onClick={lancer}>{etat.chargement ?? 'Rechercher'}</button>
            <a className="text-xs muted break-all" href={construireUrl(c)} target="_blank" rel="noreferrer">Requête envoyée à l'API</a>
          </div>
          {etat.erreur && <p className="text-sm text-[var(--color-danger)] m-0">{etat.erreur}</p>}
          {etat.info && <p className="text-sm m-0">{etat.info}</p>}
        </div>
      </Section>

      {res.length > 0 && (
        <Section title={`Résultats (${res.length})`} actions={<button className="btn btn-primary" disabled={!sel.size} onClick={ajouter}>Ajouter {sel.size} prospect(s)</button>}>
          <div className="overflow-x-auto">
            <table>
              <thead><tr><th></th><th>Entreprise</th><th>Métier</th><th>Commune</th><th>Création</th><th>Effectif</th><th>Dirigeant</th><th className="num">Score initial</th></tr></thead>
              <tbody>
                {res.map((r) => {
                  const p = { ...versProspect(r, nowIso), id: r.siren };
                  const s = scorer(p, now);
                  const age = ageJours(r.date_creation ?? undefined, now);
                  const deja = connus.has(r.siren);
                  return (
                    <tr key={r.siren} className={deja ? 'opacity-50' : ''}>
                      <td><input type="checkbox" disabled={deja} checked={sel.has(r.siren)} onChange={(e) => { const n = new Set(sel); if (e.target.checked) n.add(r.siren); else n.delete(r.siren); setSel(n); }} /></td>
                      <td>{p.nom}{deja && <div className="text-xs muted">déjà dans vos prospects</div>}</td>
                      <td>{libelleMetier(metierDepuisNaf(r.activite_principale))}<div className="text-xs muted">{r.activite_principale}</div></td>
                      <td>{p.commune} {p.codePostal}</td>
                      <td className="whitespace-nowrap">{r.date_creation ? new Date(r.date_creation).toLocaleDateString('fr-FR') : '—'}{age !== undefined && age < 365 && <div className="text-xs text-[var(--color-ok)] font-semibold">{age} jours</div>}</td>
                      <td className="text-xs">{p.trancheEffectif ? TRANCHES[p.trancheEffectif] ?? p.trancheEffectif : <span className="muted">non renseigné</span>}</td>
                      <td>{p.dirigeant ? `${p.dirigeant.prenom ?? ''} ${p.dirigeant.nom ?? ''}` : <span className="muted">—</span>}<div className="text-xs muted">{p.dirigeant?.qualite}</div></td>
                      <td className="num"><ScoreBadge total={s.total} priorite={s.priorite} confiance={s.confiance} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      <Section title="Importer un fichier (CSV)">
        <p className="text-sm mt-0">Export Sirene, extraction d'annuaire, liste de salon… Colonnes reconnues automatiquement : <i>siren, dénomination / nom, code NAF, date de création, code postal, commune, tranche d'effectif, effectif, téléphone, e-mail, site web, prénom / nom du dirigeant, qualité, LinkedIn</i>. Séparateur « ; » ou « , ».</p>
        <input type="file" accept=".csv,text/csv" onChange={(e) => e.target.files?.[0] && importer(e.target.files[0])} />
        {csvMsg && <p className="text-sm mb-0">{csvMsg}</p>}
      </Section>

      <Section title="Autres sources gratuites">
        <ul className="text-sm space-y-1 my-0">
          <li><a href="https://www.bodacc.fr/" target="_blank" rel="noreferrer">BODACC</a> : annonces d'immatriculation (créations des derniers jours) — à croiser avec la recherche ci-dessus.</li>
          <li><a href="https://annuaire-entreprises.data.gouv.fr/" target="_blank" rel="noreferrer">Annuaire des entreprises</a> : fiche officielle, dirigeants, labels RGE / Qualibat.</li>
          <li><a href="https://www.pagesjaunes.fr/" target="_blank" rel="noreferrer">PagesJaunes</a> et Google Maps : téléphone et site des artisans (liens préparés sur chaque fiche prospect).</li>
          <li>LinkedIn : recherche du gérant depuis la fiche prospect (liens préparés) ; ne contactez que des profils vérifiés.</li>
        </ul>
      </Section>
    </>
  );
}
