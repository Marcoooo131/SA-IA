import { useMemo, useState } from 'react';
import { actions, useDonnees } from '../lib/store';
import { scorer } from '../lib/scoring';
import { liensRecherche } from '../lib/liens';
import { genererMessage, angleRecommande, ANGLES, FORMATS, type Angle, type FormatMessage } from '../lib/messages';
import { messagesDuJour } from '../lib/analytics';
import {
  CANAUX, LOGICIELS, METIERS, SIGNAUX_ACTIVITE, SIGNAUX_INTERET, STATUTS, TRANCHES, ageJours, libelleTaille, tailleProspect,
} from '../lib/referentiel';
import { Chips, Field, Groupe, Section, ScoreBadge, aujourdhui } from '../components/ui';
import type { Canal, Dirigeant, LogicielActuel, Metier, Prospect, SignalActivite, SignalInteret, Source, Statut, TypeInteraction } from '../lib/types';

const SOURCES: Record<Source, string> = {
  api_entreprises: 'Répertoire public', import_csv: 'Import CSV', google: 'Google', annuaire: 'Annuaire', linkedin: 'LinkedIn', site_web: 'Site web', saisie: 'Saisie / échange',
};
const TYPES: Record<TypeInteraction, string> = {
  message_envoye: 'Message envoyé', appel: 'Appel', reponse_positive: 'Réponse positive', reponse_negative: 'Réponse négative',
  rdv: 'Rendez-vous / démo', essai: 'Essai démarré', signature: 'Abonnement signé', resiliation: 'Résiliation',
};
const canalDuFormat: Record<FormatMessage, Canal> = { linkedin_invitation: 'linkedin', linkedin_message: 'linkedin', email: 'email', appel: 'telephone' };

export default function FicheProspect({ id }: { id: string }) {
  const d = useDonnees();
  const p = d.prospects.find((x) => x.id === id);
  const now = new Date();
  const its = useMemo(() => d.interactions.filter((i) => i.prospectId === id).sort((a, b) => b.date.localeCompare(a.date)), [d.interactions, id]);
  if (!p) return <Section title="Prospect introuvable"><a href="#/prospects">Retour à la liste</a></Section>;
  const s = scorer(p, now);
  const maj = (patch: Partial<Prospect>) => actions.majProspect(p.id, patch);
  const majDir = (patch: Partial<Dirigeant>) => maj({ dirigeant: { ...p.dirigeant, ...patch } });
  const src = (champ: string, v: Source) => maj({ sources: { ...p.sources, [champ]: v } });
  const age = ageJours(p.dateCreation, now);

  const champSource = (champ: string) => (
    <select className="text-xs !py-0.5" value={p.sources[champ] ?? ''} onChange={(e) => src(champ, e.target.value as Source)} title="Source de la donnée">
      <option value="">source ?</option>{Object.entries(SOURCES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
    </select>
  );

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <a href="#/prospects" className="text-sm">← Prospects</a>
          <h1 className="text-xl font-bold my-1">{p.nom}</h1>
          <div className="text-sm muted">
            {[p.siren && `SIREN ${p.siren}`, p.naf && `NAF ${p.naf}${p.nafLibelle ? ` – ${p.nafLibelle}` : ''}`, [p.codePostal, p.commune].filter(Boolean).join(' ')].filter(Boolean).join(' · ')}
          </div>
          {age !== undefined && age < 365 && <div className="text-sm font-semibold text-[var(--color-ok)]">Créée il y a {age} jours : opportunité de lancement d'activité</div>}
        </div>
        <div className="flex flex-col items-end gap-2">
          <ScoreBadge total={s.total} priorite={s.priorite} confiance={s.confiance} />
          <select value={p.statut} onChange={(e) => maj({ statut: e.target.value as Statut })}>
            {Object.entries(STATUTS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="space-y-4">
          <Section title="Entreprise et contacts">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nom"><input className="w-full" value={p.nom} onChange={(e) => maj({ nom: e.target.value })} /></Field>
              <Field label="Métier">
                <select className="w-full" value={p.metier} onChange={(e) => maj({ metier: e.target.value as Metier })}>
                  {METIERS.map((m) => <option key={m.id} value={m.id}>{m.pluriel}</option>)}
                  <option value="autre_btp">Autre BTP</option><option value="hors_btp">Hors BTP</option><option value="inconnu">Inconnu</option>
                </select>
              </Field>
              <Field label="Date de création"><input className="w-full" type="date" value={p.dateCreation ?? ''} onChange={(e) => maj({ dateCreation: e.target.value || undefined })} /></Field>
              <Field label={`Effectif réel${p.trancheEffectif ? ` (INSEE : ${TRANCHES[p.trancheEffectif] ?? p.trancheEffectif})` : ''}`}>
                <input className="w-full" type="number" min={0} placeholder="inconnu" value={p.effectifSaisi ?? ''} onChange={(e) => maj({ effectifSaisi: e.target.value === '' ? undefined : Number(e.target.value) })} />
              </Field>
              <Field label="Commune"><input className="w-full" value={p.commune ?? ''} onChange={(e) => maj({ commune: e.target.value || undefined })} /></Field>
              <Field label="Code postal"><input className="w-full" value={p.codePostal ?? ''} onChange={(e) => maj({ codePostal: e.target.value || undefined, departement: e.target.value.slice(0, 2) || undefined })} /></Field>
            </div>
            <p className="text-xs muted">Taille retenue : {libelleTaille(tailleProspect(p))}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Téléphone professionnel"><div className="flex gap-1"><input className="flex-1" value={p.telephone ?? ''} onChange={(e) => maj({ telephone: e.target.value || undefined })} />{champSource('telephone')}</div></Field>
              <Field label="E-mail professionnel"><div className="flex gap-1"><input className="flex-1" type="email" value={p.email ?? ''} onChange={(e) => maj({ email: e.target.value || undefined })} />{champSource('email')}</div></Field>
              <Field label="Site web"><div className="flex gap-1"><input className="flex-1" value={p.siteWeb ?? ''} onChange={(e) => maj({ siteWeb: e.target.value || undefined })} />{champSource('siteWeb')}</div></Field>
              <label className="flex items-center gap-2 text-sm mt-5"><input type="checkbox" checked={!!p.emailNominatif} onChange={(e) => maj({ emailNominatif: e.target.checked })} /> E-mail nominatif (pas contact@…)</label>
            </div>
          </Section>

          <Section title="Décideur">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Prénom"><input className="w-full" value={p.dirigeant?.prenom ?? ''} onChange={(e) => majDir({ prenom: e.target.value || undefined })} /></Field>
              <Field label="Nom"><input className="w-full" value={p.dirigeant?.nom ?? ''} onChange={(e) => majDir({ nom: e.target.value || undefined })} /></Field>
              <Field label="Qualité / fonction"><input className="w-full" placeholder="Gérant, Président…" value={p.dirigeant?.qualite ?? ''} onChange={(e) => majDir({ qualite: e.target.value || undefined })} /></Field>
              <Field label="Profil LinkedIn"><div className="flex gap-1"><input className="flex-1" value={p.dirigeant?.linkedinUrl ?? ''} onChange={(e) => majDir({ linkedinUrl: e.target.value || undefined })} />{champSource('linkedin')}</div></Field>
            </div>
            <label className="flex items-center gap-2 text-sm mt-3"><input type="checkbox" checked={!!p.dirigeant?.verifie} onChange={(e) => majDir({ verifie: e.target.checked })} /> Identité et rôle vérifiés (profil consulté, échange…)</label>
          </Section>

          <Section title="Qualification">
            <Field label="Outil de gestion actuel">
              <select value={p.logicielActuel} onChange={(e) => maj({ logicielActuel: e.target.value as LogicielActuel })}>
                {Object.entries(LOGICIELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </Field>
            <label className="flex items-center gap-2 text-sm my-3"><input type="checkbox" checked={p.activiteVerifiee} onChange={(e) => maj({ activiteVerifiee: e.target.checked })} /> Activité vérifiée (site, avis, offres d'emploi consultés)</label>
            <Groupe label="Signaux d'activité et de développement observés">
              <Chips<SignalActivite> options={Object.entries(SIGNAUX_ACTIVITE) as [SignalActivite, string][]} value={p.signauxActivite} onChange={(v) => maj({ signauxActivite: v })} />
            </Groupe>
            <div className="h-3" />
            <Groupe label="Signaux d'intérêt constatés">
              <Chips<SignalInteret> options={Object.entries(SIGNAUX_INTERET) as [SignalInteret, string][]} value={p.signauxInteret} onChange={(v) => maj({ signauxInteret: v })} />
            </Groupe>
            <div className="h-3" />
            <Field label="Notes"><textarea rows={3} value={p.notes ?? ''} onChange={(e) => maj({ notes: e.target.value || undefined })} /></Field>
          </Section>
        </div>

        <div className="space-y-4">
          <Section title={`Score ${s.total}/100 — confiance ${s.confiance}`}>
            <p className="text-xs muted mt-0">{Math.round(s.couverture * 100)} % des points ont pu être évalués avec des données connues. Une donnée inconnue ne rapporte aucun point.</p>
            <div className="space-y-3">
              {s.criteres.map((c) => (
                <div key={c.id}>
                  <div className="flex justify-between text-sm font-semibold"><span>{c.libelle}</span><span className="tabular-nums">{c.points} / {c.max}</span></div>
                  <ul className="text-xs my-1 pl-4 space-y-0.5">
                    {c.elements.map((e, i) => (
                      <li key={i} className={e.inconnu ? 'text-[var(--color-warn)]' : ''}>{e.texte}{e.points > 0 ? ` (+${e.points})` : ''}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Rechercher les informations manquantes">
            <ul className="text-sm space-y-1 my-0 pl-4">
              {liensRecherche(p).map((l) => <li key={l.url}><a href={l.url} target="_blank" rel="noreferrer">{l.libelle}</a> <span className="muted text-xs">— {l.usage}</span></li>)}
            </ul>
            <p className="text-xs muted mb-0">Reportez dans la fiche uniquement ce que vous avez réellement trouvé, avec sa source.</p>
          </Section>

          <GenerateurMessage p={p} dejaContacte={its.some((i) => i.type === 'message_envoye' || i.type === 'appel')} />
        </div>
      </div>

      <Historique p={p} />
      <div className="text-right">
        <button className="btn btn-danger" onClick={() => { if (confirm(`Supprimer ${p.nom} et son historique ?`)) { actions.supprimerProspect(p.id); location.hash = '#/prospects'; } }}>Supprimer ce prospect</button>
      </div>
    </>
  );
}

function GenerateurMessage({ p, dejaContacte }: { p: Prospect; dejaContacte: boolean }) {
  const d = useDonnees();
  const now = new Date();
  const [format, setFormat] = useState<FormatMessage>(p.dirigeant?.linkedinUrl ? 'linkedin_message' : p.email ? 'email' : 'appel');
  const [angle, setAngle] = useState<Angle>(angleRecommande(p, now, dejaContacte));
  const [variante, setVariante] = useState<'A' | 'B'>(() => {
    // Alterne automatiquement : la variante la moins utilisée jusqu'ici
    const n = (v: string) => d.interactions.filter((i) => i.varianteMessage?.endsWith(`-${v}`)).length;
    return n('A') <= n('B') ? 'A' : 'B';
  });
  const m = genererMessage(p, format, angle, variante, d.parametres, now);
  const [texte, setTexte] = useState<string | null>(null);
  const [campagneId, setCampagneId] = useState('');
  const [ok, setOk] = useState('');
  const courant = texte ?? (m.objet ? `Objet : ${m.objet}\n\n${m.texte}` : m.texte);
  const jour = messagesDuJour(d, now);
  const quotaAtteint = jour >= d.parametres.quotaMessagesJour;
  const reco = angleRecommande(p, now, dejaContacte);
  const changer = (f: () => void) => { f(); setTexte(null); setOk(''); };

  function enregistrer() {
    actions.ajouterInteraction({
      prospectId: p.id, date: aujourdhui(), canal: canalDuFormat[format],
      type: format === 'appel' ? 'appel' : 'message_envoye', campagneId: campagneId || undefined, varianteMessage: m.variante,
      note: texte !== null ? 'Message retouché avant envoi' : undefined,
    });
    setOk(`Envoi enregistré (${m.variante}).`);
  }

  return (
    <Section title="Message personnalisé">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Format">
          <select className="w-full" value={format} onChange={(e) => changer(() => setFormat(e.target.value as FormatMessage))}>
            {Object.entries(FORMATS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Field>
        <Field label="Angle">
          <select className="w-full" value={angle} onChange={(e) => changer(() => setAngle(e.target.value as Angle))}>
            {Object.entries(ANGLES).map(([k, l]) => <option key={k} value={k}>{l}{k === reco ? ' (recommandé)' : ''}</option>)}
          </select>
        </Field>
      </div>
      <div className="flex items-center gap-2 my-2 text-sm">
        Variante :
        {(['A', 'B'] as const).map((v) => <button key={v} type="button" className="chip" aria-pressed={variante === v} onClick={() => changer(() => setVariante(v))}>{v}</button>)}
        <span className="muted text-xs">modèle {m.variante} — alternez A et B pour mesurer le plus efficace</span>
      </div>
      {m.avertissements.map((a) => <p key={a} className={`text-xs my-1 ${m.bloquant ? 'text-[var(--color-danger)] font-semibold' : 'text-[var(--color-warn)]'}`}>⚠ {a}</p>)}
      <textarea rows={format === 'linkedin_invitation' ? 4 : 11} value={courant} onChange={(e) => setTexte(e.target.value)} />
      <div className="text-xs muted flex justify-between">
        <span>Personnalisé avec : {m.personnalisation.join(', ') || 'rien'}</span>
        <span className={format === 'linkedin_invitation' && courant.length > 200 ? 'text-[var(--color-danger)]' : ''}>{courant.length} caractères</span>
      </div>
      <div className="flex flex-wrap items-center gap-2 mt-3">
        <button className="btn" onClick={() => navigator.clipboard?.writeText(courant)}>Copier</button>
        {p.email && format === 'email' && (
          <a className="btn no-underline" href={`mailto:${p.email}?subject=${encodeURIComponent(m.objet ?? '')}&body=${encodeURIComponent(courant.replace(/^Objet : .*\n\n/, ''))}`}>Ouvrir dans la messagerie</a>
        )}
        <select value={campagneId} onChange={(e) => setCampagneId(e.target.value)}>
          <option value="">Sans campagne</option>
          {d.campagnes.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
        </select>
        <button className="btn btn-primary" disabled={m.bloquant || p.statut === 'ne_pas_contacter'} onClick={enregistrer}>J'ai envoyé ce message</button>
      </div>
      <p className={`text-xs mb-0 ${quotaAtteint ? 'text-[var(--color-danger)] font-semibold' : 'muted'}`}>
        {jour} / {d.parametres.quotaMessagesJour} messages personnalisés aujourd'hui{quotaAtteint ? ' : plafond atteint, reprenez demain pour garder des messages soignés.' : '.'}
      </p>
      {ok && <p className="text-sm text-[var(--color-ok)] mb-0">{ok}</p>}
    </Section>
  );
}

function Historique({ p }: { p: Prospect }) {
  const d = useDonnees();
  const its = d.interactions.filter((i) => i.prospectId === p.id).sort((a, b) => b.date.localeCompare(a.date));
  const [f, setF] = useState({ date: aujourdhui(), canal: 'telephone' as Canal, type: 'reponse_positive' as TypeInteraction, campagneId: '', note: '' });
  return (
    <Section title="Historique des prises de contact">
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end mb-3">
        <Field label="Date"><input className="w-full" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Événement"><select className="w-full" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as TypeInteraction })}>{Object.entries(TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Canal"><select className="w-full" value={f.canal} onChange={(e) => setF({ ...f, canal: e.target.value as Canal })}>{Object.entries(CANAUX).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Campagne"><select className="w-full" value={f.campagneId} onChange={(e) => setF({ ...f, campagneId: e.target.value })}><option value="">—</option>{d.campagnes.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}</select></Field>
        <Field label="Note"><input className="w-full" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
        <button className="btn btn-primary" onClick={() => { actions.ajouterInteraction({ prospectId: p.id, date: f.date, canal: f.canal, type: f.type, campagneId: f.campagneId || undefined, note: f.note || undefined }); setF({ ...f, note: '' }); }}>Ajouter</button>
      </div>
      <div className="overflow-x-auto">
        <table>
          <thead><tr><th>Date</th><th>Événement</th><th>Canal</th><th>Campagne</th><th>Message</th><th>Note</th><th></th></tr></thead>
          <tbody>
            {its.map((i) => (
              <tr key={i.id}>
                <td className="whitespace-nowrap">{new Date(i.date).toLocaleDateString('fr-FR')}</td><td>{TYPES[i.type]}</td><td>{CANAUX[i.canal]}</td>
                <td className="text-sm">{d.campagnes.find((c) => c.id === i.campagneId)?.nom ?? '—'}</td><td className="text-xs">{i.varianteMessage ?? '—'}</td><td className="text-sm">{i.note}</td>
                <td><button className="btn btn-danger !py-0.5 !px-2" title="Supprimer" onClick={() => actions.supprimerInteraction(i.id)}>×</button></td>
              </tr>
            ))}
            {!its.length && <tr><td colSpan={7} className="muted">Aucune prise de contact.</td></tr>}
          </tbody>
        </table>
      </div>
    </Section>
  );
}
