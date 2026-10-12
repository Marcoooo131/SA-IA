import { ArrowRight } from 'lucide-react';
import { useApp, useActiveDossier } from '@/state/store';
import { useAudit } from '@/state/derived';
import { DossierForm } from '../DossierForm';
import { Button, Card } from '../kit';
import { formatArea, formatDate } from '@/lib/format';
import { OPENING_TYPE_LABELS } from '@/domain/labels';

export function LogementTab() {
  const dossier = useActiveDossier();
  const audit = useAudit(dossier);
  const updateInfo = useApp((s) => s.updateInfo);
  const setTab = useApp((s) => s.setTab);
  if (!dossier || !audit) return null;
  return (
    <div className="scroll-thin h-full overflow-auto">
      <div className="mx-auto grid max-w-7xl grid-cols-3 gap-5 p-6">
        <Card title="Informations du dossier" className="col-span-2" actions={<span className="text-xs text-slate-500">Créé le {formatDate(dossier.info.createdAt)}</span>}>
          <DossierForm info={dossier.info} onChange={updateInfo} />
          <div className="mt-4 flex justify-end">
            <Button variant="primary" icon={<ArrowRight size={15} />} onClick={() => setTab('plan')}>
              Étape suivante : plan du logement
            </Button>
          </div>
        </Card>
        <div className="flex flex-col gap-5">
          <Card title="Descriptif du logement (issu du plan)">
            <dl className="grid grid-cols-2 gap-y-1.5 text-sm">
              <dt className="text-slate-500">Surface du plan</dt>
              <dd className="text-right font-medium">{formatArea(audit.inventory.totalArea)}</dd>
              <dt className="text-slate-500">Niveaux</dt>
              <dd className="text-right font-medium">{dossier.plan.levels.length}</dd>
              <dt className="text-slate-500">Pièces</dt>
              <dd className="text-right font-medium">{dossier.plan.levels.reduce((s, l) => s + l.rooms.length, 0)}</dd>
              <dt className="text-slate-500">Ouvertures extérieures</dt>
              <dd className="text-right font-medium">{audit.inventory.exteriorOpenings.length}</dd>
              <dt className="text-slate-500">Points d'entrée (portes)</dt>
              <dd className="text-right font-medium">{audit.inventory.entryPoints}</dd>
            </dl>
            <div className="mt-3 border-t border-slate-100 pt-3">
              {audit.inventory.levels.map((l) => (
                <div key={l.levelId} className="flex justify-between text-xs text-slate-600">
                  <span>{l.name}</span>
                  <span>
                    {l.rooms} pièce(s) · {formatArea(l.area)} · {l.exteriorOpenings} ouv. ext.
                  </span>
                </div>
              ))}
            </div>
          </Card>
          <Card title="Accès et menuiseries extérieures">
            {audit.inventory.exteriorOpenings.length === 0 ? (
              <p className="text-sm text-slate-500">Aucune ouverture extérieure saisie.</p>
            ) : (
              <ul className="max-h-64 space-y-1 overflow-auto text-xs">
                {audit.inventory.exteriorOpenings.map(({ opening, level }) => (
                  <li key={opening.id} className="flex justify-between">
                    <span className="font-mono">{opening.code}</span>
                    <span className="text-slate-600">
                      {OPENING_TYPE_LABELS[opening.type]}
                      {opening.sectional ? ' (sectionnelle)' : ''} · {level.name}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <p className="text-[11px] text-slate-500">
            Les données sont enregistrées dans ce navigateur uniquement. N'utilisez que des données fictives pour la démonstration.
          </p>
        </div>
      </div>
    </div>
  );
}
