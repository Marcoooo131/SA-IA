import { useState } from 'react';
import { actions, normaliser, useDonnees } from '../lib/store';
import { donneesDemo } from '../lib/demo';
import { Field, Section, telecharger } from '../components/ui';

export default function Parametres() {
  const d = useDonnees();
  const p = d.parametres;
  const [msg, setMsg] = useState('');
  return (
    <>
      <Section title="Messages">
        <div className="grid sm:grid-cols-3 gap-3">
          <Field label="Signature (prénom, fonction)"><input className="w-full" value={p.signature} onChange={(e) => actions.majParametres({ signature: e.target.value })} placeholder="ex. Alex – conseiller" /></Field>
          <Field label="Nom du produit dans les messages"><input className="w-full" value={p.nomProduit} onChange={(e) => actions.majParametres({ nomProduit: e.target.value })} /></Field>
          <Field label="Plafond de messages par jour"><input className="w-full" type="number" min={1} value={p.quotaMessagesJour} onChange={(e) => actions.majParametres({ quotaMessagesJour: Math.max(1, Number(e.target.value) || 1) })} /></Field>
        </div>
        <p className="text-xs muted mb-0">Le prix, la marge, l'attrition et les coûts fixes se règlent dans l'onglet Rentabilité.</p>
      </Section>

      <Section title="Sauvegarde">
        <p className="text-sm mt-0">Les données restent dans ce navigateur. Exportez-les régulièrement (et avant de changer d'ordinateur).</p>
        <div className="flex flex-wrap gap-2 items-center">
          <button className="btn" onClick={() => telecharger(`prospection-erp-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(d, null, 2), 'application/json')}>Exporter (JSON)</button>
          <label className="btn">Restaurer une sauvegarde
            <input type="file" accept=".json,application/json" className="hidden" onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                const data = normaliser(JSON.parse(await f.text()));
                if (confirm(`Remplacer les données actuelles par ${data.prospects.length} prospects ?`)) { actions.remplacer(data); setMsg('Sauvegarde restaurée.'); }
              } catch { setMsg('Fichier illisible.'); }
            }} />
          </label>
          <button className="btn" onClick={() => confirm('Remplacer les données actuelles par le jeu de démonstration fictif ?') && actions.remplacer(donneesDemo())}>Charger la démonstration</button>
          <button className="btn btn-danger" onClick={() => confirm('Effacer toutes les données (prospects, historique, campagnes) ?') && actions.toutEffacer()}>Tout effacer</button>
        </div>
        {msg && <p className="text-sm mb-0">{msg}</p>}
      </Section>

      <Section title="Bonnes pratiques intégrées">
        <ul className="text-sm space-y-1 my-0 pl-4">
          <li>Aucun envoi automatique ni en masse : chaque message est généré pour un seul prospect, relu, puis envoyé par vous.</li>
          <li>Prospection B2B : contactez des adresses professionnelles, présentez-vous clairement et respectez immédiatement toute demande d'arrêt (statut « Ne pas contacter »).</li>
          <li>Données personnelles (RGPD) : ne conservez que les informations utiles, avec leur source ; supprimez les prospects sans suite après un délai raisonnable.</li>
          <li>LinkedIn : pas d'outil d'automatisation (interdit par ses conditions d'utilisation) ; les liens de recherche servent à une consultation manuelle.</li>
        </ul>
      </Section>
    </>
  );
}
