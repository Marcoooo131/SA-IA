import { useState } from 'react';
import { actions, uid, useDonnees } from '../lib/store';
import { indicateurs } from '../lib/analytics';
import { CANAUX } from '../lib/referentiel';
import { eur, mois, pct } from '../lib/finance';
import { Field, Section, aujourdhui } from '../components/ui';
import type { Campagne, Canal } from '../lib/types';

const vide = (): Campagne => ({ id: '', nom: '', canal: 'linkedin', cout: 0, dateDebut: aujourdhui() });

export default function Campagnes() {
  const d = useDonnees();
  const ind = indicateurs(d);
  const [f, setF] = useState<Campagne>(vide());
  const margeMois = (d.parametres.prixMensuelHT * d.parametres.margeBrutePct) / 100;

  return (
    <>
      <Section title={f.id ? 'Modifier la campagne' : 'Nouvelle campagne'}>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
          <Field label="Nom" className="col-span-2"><input className="w-full" value={f.nom} onChange={(e) => setF({ ...f, nom: e.target.value })} placeholder="ex. LinkedIn – plombiers 35" /></Field>
          <Field label="Canal"><select className="w-full" value={f.canal} onChange={(e) => setF({ ...f, canal: e.target.value as Canal })}>{Object.entries(CANAUX).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <Field label="Coût total HT (€)"><input className="w-full" type="number" min={0} value={f.cout} onChange={(e) => setF({ ...f, cout: Number(e.target.value) || 0 })} /></Field>
          <Field label="Début"><input className="w-full" type="date" value={f.dateDebut} onChange={(e) => setF({ ...f, dateDebut: e.target.value })} /></Field>
          <Field label="Fin (facultatif)"><input className="w-full" type="date" value={f.dateFin ?? ''} onChange={(e) => setF({ ...f, dateFin: e.target.value || undefined })} /></Field>
          <Field label="Description" className="col-span-2 md:col-span-4"><input className="w-full" value={f.description ?? ''} onChange={(e) => setF({ ...f, description: e.target.value || undefined })} placeholder="Ciblage, outil, temps passé valorisé…" /></Field>
          <div className="flex gap-2 col-span-2">
            <button className="btn btn-primary" disabled={!f.nom.trim()} onClick={() => { actions.enregistrerCampagne({ ...f, id: f.id || uid() }); setF(vide()); }}>{f.id ? 'Enregistrer' : 'Créer'}</button>
            {f.id && <button className="btn" onClick={() => setF(vide())}>Annuler</button>}
          </div>
        </div>
        <p className="text-xs muted mb-0">Indiquez le coût complet (abonnements, impression, publicité, temps passé valorisé) : il sert au calcul du coût d'acquisition client. Les prises de contact sont rattachées à une campagne au moment de l'envoi.</p>
      </Section>

      <Section title="Performance des campagnes">
        <div className="overflow-x-auto">
          <table>
            <thead><tr><th>Campagne</th><th>Canal</th><th className="num">Coût</th><th className="num">Contactés</th><th className="num">Réponses</th><th className="num">Clients</th><th className="num">Conversion</th><th className="num">CAC</th><th className="num">Récupération</th><th className="num">CA généré</th><th></th></tr></thead>
            <tbody>
              {ind.campagnes.map((l) => {
                const mauvais = l.campagne.cout > 0 && (l.delaiRecuperation > 12);
                return (
                  <tr key={l.campagne.id}>
                    <td>{l.campagne.nom}<div className="text-xs muted">{new Date(l.campagne.dateDebut).toLocaleDateString('fr-FR')}{l.campagne.dateFin ? ` → ${new Date(l.campagne.dateFin).toLocaleDateString('fr-FR')}` : ''}{l.campagne.description ? ` · ${l.campagne.description}` : ''}</div></td>
                    <td>{CANAUX[l.campagne.canal]}</td>
                    <td className="num">{eur(l.campagne.cout)}</td><td className="num">{l.contactes}</td><td className="num">{l.reponses}</td><td className="num">{l.clients}</td>
                    <td className="num">{pct(l.tauxConversion)}</td>
                    <td className="num">{l.clients ? eur(l.cac) : '—'}</td>
                    <td className={`num ${mauvais ? 'text-[var(--color-danger)] font-semibold' : ''}`}>{l.clients ? mois(l.delaiRecuperation) : l.campagne.cout ? 'aucun client' : '—'}</td>
                    <td className="num">{eur(l.caGenere)}</td>
                    <td className="whitespace-nowrap">
                      <button className="btn !py-0.5 !px-2" onClick={() => setF(l.campagne)}>Modifier</button>{' '}
                      <button className="btn btn-danger !py-0.5 !px-2" onClick={() => confirm(`Supprimer « ${l.campagne.nom} » ?`) && actions.supprimerCampagne(l.campagne.id)}>×</button>
                    </td>
                  </tr>
                );
              })}
              {!ind.campagnes.length && <tr><td colSpan={11} className="muted">Aucune campagne. Créez-en une par canal ou par ciblage pour suivre leur rentabilité.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="text-xs muted mb-0">Récupération = CAC ÷ marge brute mensuelle par client ({eur(margeMois, 2)}). En rouge : plus de 12 mois pour récupérer le coût d'acquisition.</p>
      </Section>
    </>
  );
}
