import { Fragment, useMemo, useState } from 'react';
import { ArrowRight, ChevronDown, ChevronRight, Copy, CopyPlus, Crosshair, Info, MapPin, Plus, Trash2, Undo2 } from 'lucide-react';
import { useApp, useActiveDossier } from '@/state/store';
import { useEditor } from '@/state/editor';
import { useAudit } from '@/state/derived';
import type { Level, Opening, OpeningType, RoomType } from '@/domain/types';
import { OPENING_TYPE_LABELS, ROOM_TYPE_LABELS } from '@/domain/labels';
import { addRoom, findLevel, freeSpot, removeOpening, removeRoom } from '@/plan/actions';
import { roomArea } from '@/plan/geometry';
import {
  JOINERY_COLUMNS,
  OPENING_AUDIT_LABELS,
  addCounts,
  copyLevelConfiguration,
  countOpenings,
  duplicateRoomWithOpenings,
  emptyCounts,
  newUnplacedOpening,
  openingAuditStatus,
  openingDetectors,
  roomDetectorCalc,
  roomOpenings,
  setRoomCount,
  unlinkDevices,
  unplaceOpening,
  type JoineryCounts,
} from '@/plan/joinery';
import { formatNumber } from '@/lib/format';
import { Badge, Button, Card, IconButton, IntInput, Modal, NumberInput, Select, TextInput, Toggle, cx } from '../kit';

function PositionBadge({ o }: { o: Opening }) {
  if (o.host.kind === 'unplaced') return <Badge tone="amber">À positionner</Badge>;
  return o.positionConfirmed ? <Badge tone="green">Position confirmée</Badge> : <Badge tone="slate">Position estimée</Badge>;
}

function OpeningRow({ level, o }: { level: Level; o: Opening }) {
  const mutate = useApp((s) => s.mutate);
  const rules = useApp((s) => s.rules);
  const setTab = useApp((s) => s.setTab);
  const setLevel = useApp((s) => s.setActiveLevel);
  const select = useApp((s) => s.select);
  const toast = useApp((s) => s.toast);
  const upd = (patch: Partial<Opening>) =>
    mutate((d) => {
      const x = findLevel(d, level.id).openings.find((y) => y.id === o.id);
      if (x) Object.assign(x, patch);
    });
  const goPlace = () => {
    setLevel(level.id);
    select({ kind: 'opening', id: o.id });
    useEditor.getState().set({ tool: 'place_opening', placingOpeningId: o.id });
    setTab('plan');
    toast('info', `Cliquez sur le mur où se trouve ${o.code} dans le plan 2D.`);
  };
  const status = openingAuditStatus(o, rules);
  const interiorOnly = o.type === 'porte_interieure' || o.type === 'passage';
  return (
    <tr className="border-t border-slate-100 align-middle text-xs" data-testid={`opening-row-${o.code}`}>
      <td className="py-1.5 pr-2 pl-10 font-mono text-[11px] text-slate-700">{o.code}</td>
      <td className="px-1 py-1.5">
        <Select
          value={o.type}
          onChange={(e) => {
            const type = e.target.value as OpeningType;
            const exterior = type === 'porte_interieure' || type === 'passage' ? false : type === 'fenetre' || type === 'baie' || type === 'porte_garage' ? true : o.exterior;
            upd({ type, exterior, sectional: type === 'porte_garage' ? o.sectional : false });
          }}
          className="h-7 py-0 text-xs"
          aria-label={`Type de ${o.code}`}
        >
          {Object.entries(OPENING_TYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
      </td>
      <td className="px-1 py-1.5">
        <Toggle checked={o.exterior} disabled={interiorOnly} onChange={(v) => upd({ exterior: v })} label={o.exterior ? 'Extérieure' : 'Intérieure'} />
        {o.type === 'porte_garage' && (
          <label className="mt-1 flex items-center gap-1 text-[11px] text-slate-600">
            <input type="checkbox" checked={o.sectional} onChange={(e) => upd({ sectional: e.target.checked })} /> sectionnelle
          </label>
        )}
      </td>
      <td className="px-1 py-1.5">
        <div className="flex gap-1">
          <NumberInput value={o.width} onChange={(v) => v && upd({ width: v })} min={0.3} max={8} step={0.05} suffix="l" className="w-20" aria-label={`Largeur de ${o.code}`} />
          <NumberInput value={o.height ?? null} onChange={(v) => upd({ height: v ?? undefined })} allowNull min={0.2} max={5} step={0.05} suffix="h" placeholder="—" className="w-20" aria-label={`Hauteur de ${o.code}`} />
        </div>
      </td>
      <td className="px-1 py-1.5">
        <div className="flex flex-wrap items-center gap-1">
          <PositionBadge o={o} />
          {o.host.kind === 'unplaced' ? (
            <Button size="sm" icon={<MapPin size={12} />} onClick={goPlace}>
              Positionner
            </Button>
          ) : (
            <>
              <IconButton
                label="Voir sur le plan"
                className="h-6 w-6"
                onClick={() => {
                  setLevel(level.id);
                  select({ kind: 'opening', id: o.id });
                  setTab('plan');
                }}
              >
                <Crosshair size={13} />
              </IconButton>
              <IconButton label="Remettre « à positionner »" className="h-6 w-6" onClick={() => mutate((d) => unplaceOpening(findLevel(d, level.id), findLevel(d, level.id).openings.find((y) => y.id === o.id)!))}>
                <Undo2 size={13} />
              </IconButton>
            </>
          )}
        </div>
      </td>
      <td className="px-1 py-1.5 text-[11px]">
        <span className={cx(status === 'proteger' ? 'text-emerald-700' : status === 'a_positionner' ? 'text-amber-700' : 'text-slate-500')}>{OPENING_AUDIT_LABELS[status]}</span>
      </td>
      <td className="px-1 py-1.5 text-center tabular-nums font-semibold">{openingDetectors(o, rules)}</td>
      <td className="px-1 py-1.5">
        <TextInput value={o.comment ?? ''} onChange={(e) => upd({ comment: e.target.value })} placeholder="Commentaire" className="h-7 py-0 text-xs" aria-label={`Commentaire de ${o.code}`} />
      </td>
      <td className="px-1 py-1.5 text-right">
        <IconButton label={`Supprimer ${o.code}`} className="h-6 w-6" onClick={() => mutate((d) => removeOpening(d, findLevel(d, level.id), o.id))}>
          <Trash2 size={13} />
        </IconButton>
      </td>
    </tr>
  );
}

function CountsCells({ c, className }: { c: JoineryCounts; className?: string }) {
  return (
    <>
      {JOINERY_COLUMNS.map((col) => (
        <td key={col.kind} className={cx('px-2 py-2 text-center tabular-nums', className)}>
          {c[col.kind]}
        </td>
      ))}
    </>
  );
}

function LevelTable({ level }: { level: Level }) {
  const mutate = useApp((s) => s.mutate);
  const rules = useApp((s) => s.rules);
  const toast = useApp((s) => s.toast);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [newType, setNewType] = useState<RoomType>('chambre');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const toggle = (id: string) => setOpen((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });
  const total = level.rooms.reduce((acc, r) => addCounts(acc, countOpenings(roomOpenings(level, r.id))), emptyCounts());
  const totalDetectors = level.rooms.reduce((s, r) => s + roomDetectorCalc(r.name, roomOpenings(level, r.id), rules).detectors, 0);

  return (
    <Card
      title={`${level.name} – ${level.rooms.length} pièce(s)`}
      bodyClassName="p-0"
      actions={
        <div className="flex items-center gap-2">
          <Select value={newType} onChange={(e) => setNewType(e.target.value as RoomType)} className="h-8 w-40 py-0 text-xs" aria-label={`Type de la pièce à ajouter (${level.name})`}>
            {Object.entries(ROOM_TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
          <Button
            size="sm"
            icon={<Plus size={13} />}
            onClick={() =>
              mutate((d) => {
                const l = findLevel(d, level.id);
                const spot = freeSpot(l, 3.2, 3.2);
                addRoom(l, { ...spot, w: 3.2, h: 3.2 }, newType);
              })
            }
            data-testid={`add-room-${level.index}`}
          >
            Ajouter une pièce
          </Button>
        </div>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm" data-testid={`joinery-table-${level.index}`}>
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="w-8" />
              <th className="px-2 py-2 font-medium">Pièce</th>
              <th className="px-2 py-2 font-medium">Type</th>
              <th className="px-2 py-2 text-right font-medium">Surface</th>
              {JOINERY_COLUMNS.map((c) => (
                <th key={c.kind} className="px-2 py-2 text-center font-medium" title={c.label}>
                  {c.short}
                </th>
              ))}
              <th className="px-2 py-2 text-center font-medium" title="Total des portes (extérieures + intérieures)">
                Portes
              </th>
              <th className="px-2 py-2 text-center font-medium" title="Détecteurs de choc et d'ouverture indicatifs (toutes menuiseries extérieures)">
                Détecteurs
              </th>
              <th className="px-2 py-2 font-medium">Commentaire</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {level.rooms.map((room) => {
              const ops = roomOpenings(level, room.id);
              const c = countOpenings(ops);
              const calc = roomDetectorCalc(room.name, ops, rules);
              const isOpen = open.has(room.id);
              return (
                <Fragment key={room.id}>
                  <tr className="border-t border-slate-100" data-testid={`joinery-room-${room.name}`}>
                    <td className="pl-2">
                      <IconButton label={isOpen ? 'Masquer le détail' : 'Détail des menuiseries'} className="h-6 w-6" onClick={() => toggle(room.id)}>
                        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </IconButton>
                    </td>
                    <td className="px-2 py-1.5">
                      <TextInput
                        value={room.name}
                        onChange={(e) => mutate((d) => void (findLevel(d, level.id).rooms.find((r) => r.id === room.id)!.name = e.target.value))}
                        className="h-8 w-40 py-0"
                        aria-label={`Nom de la pièce ${room.name}`}
                      />
                      {c.aPositionner > 0 && <div className="mt-0.5 text-[10px] text-amber-700">{c.aPositionner} à positionner</div>}
                    </td>
                    <td className="px-2 py-1.5">
                      <Select
                        value={room.type}
                        onChange={(e) => mutate((d) => void (findLevel(d, level.id).rooms.find((r) => r.id === room.id)!.type = e.target.value as RoomType))}
                        className="h-8 w-36 py-0 text-xs"
                        aria-label={`Type de la pièce ${room.name}`}
                      >
                        {Object.entries(ROOM_TYPE_LABELS).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className="px-2 py-1.5 text-right text-xs tabular-nums text-slate-600">{formatNumber(roomArea(room), 1)} m²</td>
                    {JOINERY_COLUMNS.map((col) => (
                      <td key={col.kind} className="px-1 py-1.5 text-center">
                        <IntInput
                          value={c[col.kind]}
                          max={30}
                          aria-label={`${col.label} – ${room.name}`}
                          onChange={(v) => {
                            let removed = 0;
                            mutate((d) => {
                              removed = setRoomCount(d, level.id, room.id, col.kind, v);
                            });
                            if (removed) toast('info', `${removed} ouverture(s) déjà positionnée(s) supprimée(s) du plan (Ctrl+Z dans le plan pour annuler).`);
                          }}
                        />
                      </td>
                    ))}
                    <td className="px-2 py-1.5 text-center tabular-nums text-slate-600">{c.portes}</td>
                    <td className="px-2 py-1.5 text-center">
                      <span className="inline-flex items-center gap-1 font-semibold tabular-nums" title={calc.explanation} data-testid={`detectors-${room.name}`}>
                        {calc.detectors}
                        <Info size={12} className="text-slate-400" />
                      </span>
                    </td>
                    <td className="px-2 py-1.5">
                      <TextInput
                        value={room.comment ?? ''}
                        onChange={(e) => mutate((d) => void (findLevel(d, level.id).rooms.find((r) => r.id === room.id)!.comment = e.target.value))}
                        placeholder="—"
                        className="h-8 w-40 py-0 text-xs"
                        aria-label={`Commentaire de la pièce ${room.name}`}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex justify-end gap-0.5">
                        <IconButton label={`Dupliquer ${room.name}`} className="h-7 w-7" onClick={() => mutate((d) => void duplicateRoomWithOpenings(d, level.id, room.id))}>
                          <CopyPlus size={14} />
                        </IconButton>
                        <IconButton label={`Supprimer ${room.name}`} className="h-7 w-7" onClick={() => setConfirmDelete(room.id)}>
                          <Trash2 size={14} />
                        </IconButton>
                      </div>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-slate-50/60">
                      <td colSpan={14} className="p-0">
                        <div className="px-3 py-2 text-xs text-slate-600" data-testid={`calc-${room.name}`}>
                          <strong>Calcul indicatif :</strong> {calc.explanation}
                          {calc.excluded.length > 0 && <span className="ml-1 text-slate-500">({calc.excluded.join(' ; ')})</span>}
                        </div>
                        <table className="w-full">
                          <thead className="text-left text-[11px] text-slate-500">
                            <tr>
                              <th className="pl-10 font-medium">Identifiant</th>
                              <th className="px-1 font-medium">Type</th>
                              <th className="px-1 font-medium">Intérieur / extérieur</th>
                              <th className="px-1 font-medium">Dimensions (m)</th>
                              <th className="px-1 font-medium">Position</th>
                              <th className="px-1 font-medium">Statut d'audit</th>
                              <th className="px-1 text-center font-medium">Détect.</th>
                              <th className="px-1 font-medium">Commentaire</th>
                              <th />
                            </tr>
                          </thead>
                          <tbody>
                            {ops.map((o) => (
                              <OpeningRow key={o.id} level={level} o={o} />
                            ))}
                          </tbody>
                        </table>
                        <div className="flex items-center gap-2 px-10 py-2">
                          <span className="text-[11px] text-slate-500">Ajouter :</span>
                          {JOINERY_COLUMNS.map((col) => (
                            <Button
                              key={col.kind}
                              size="sm"
                              icon={<Plus size={12} />}
                              onClick={() => mutate((d) => void findLevel(d, level.id).openings.push(newUnplacedOpening(d.plan, findLevel(d, level.id), room.id, col.kind)))}
                            >
                              {col.short.replace('.', '')}
                            </Button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot className="border-t-2 border-slate-200 bg-slate-50 text-sm font-semibold">
            <tr>
              <td />
              <td className="px-2 py-2" colSpan={3}>
                Total {level.name}
              </td>
              <CountsCells c={total} />
              <td className="px-2 py-2 text-center tabular-nums">{total.portes}</td>
              <td className="px-2 py-2 text-center tabular-nums">{totalDetectors}</td>
              <td colSpan={2} className="px-2 py-2 text-xs font-normal text-slate-500">
                {total.total} ouverture(s){total.aPositionner ? ` dont ${total.aPositionner} à positionner` : ''}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      {confirmDelete && (
        <Modal
          title="Supprimer la pièce ?"
          onClose={() => setConfirmDelete(null)}
          footer={
            <>
              <Button onClick={() => setConfirmDelete(null)}>Annuler</Button>
              <Button
                variant="danger"
                onClick={() => {
                  mutate((d) => {
                    const l = findLevel(d, level.id);
                    const ids = new Set(roomOpenings(l, confirmDelete).map((o) => o.id));
                    removeRoom(l, confirmDelete);
                    unlinkDevices(d, ids);
                  });
                  setConfirmDelete(null);
                }}
              >
                Supprimer la pièce et ses ouvertures
              </Button>
            </>
          }
        >
          <p className="text-sm text-slate-600">Les ouvertures rattachées à cette pièce sont supprimées avec elle (annulable avec Ctrl+Z dans le plan 2D).</p>
        </Modal>
      )}
    </Card>
  );
}

export function JoineryTab() {
  const dossier = useActiveDossier();
  const audit = useAudit(dossier);
  const mutate = useApp((s) => s.mutate);
  const setTab = useApp((s) => s.setTab);
  const toast = useApp((s) => s.toast);
  const rules = useApp((s) => s.rules);
  const [copy, setCopy] = useState<{ from: string; to: string } | null>(null);
  const levels = useMemo(() => [...(dossier?.plan.levels ?? [])].sort((a, b) => a.index - b.index), [dossier]);
  if (!dossier || !audit) return null;
  const all = levels.reduce((acc, l) => l.rooms.reduce((a, r) => addCounts(a, countOpenings(roomOpenings(l, r.id))), acc), emptyCounts());
  const detectors = audit.rooms.reduce((s, r) => s + r.calc.detectors, 0);

  return (
    <div className="scroll-thin h-full overflow-auto">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-4 p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Vérification des pièces et des menuiseries</h2>
            <p className="max-w-3xl text-sm text-slate-600">
              Renseignez pièce par pièce les portes, fenêtres, baies vitrées et autres ouvertures. Les quantités saisies créent des ouvertures « à positionner » ; vous les placerez sur le
              plan ensuite. Chaque ouverture n'existe qu'une fois : ce tableau, le plan 2D, la 3D et l'audit utilisent les mêmes données.
            </p>
          </div>
          <div className="flex gap-2">
            {levels.length > 1 && (
              <Button icon={<Copy size={14} />} onClick={() => setCopy({ from: levels[0].id, to: levels[1].id })}>
                Copier un étage vers un autre
              </Button>
            )}
            <Button icon={<ArrowRight size={14} />} onClick={() => setTab('plan')}>
              Vérifier le plan 2D
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-6 gap-2 text-center" data-testid="joinery-totals">
          {[
            ['Portes extérieures', all.porte_ext],
            ['Portes intérieures', all.porte_int],
            ['Fenêtres', all.fenetre],
            ['Baies vitrées', all.baie],
            ['Autres ouvertures ext.', all.autre_ext],
            ['Total ouvertures', all.total],
          ].map(([label, n]) => (
            <div key={label} className="rounded-lg border border-slate-200 bg-white px-2 py-2">
              <div className="text-[11px] text-slate-500 uppercase">{label}</div>
              <div className="text-xl font-semibold tabular-nums" data-testid={`total-${String(label)}`}>
                {n}
              </div>
            </div>
          ))}
        </div>
        {all.aPositionner > 0 && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900" role="status">
            <span data-testid="joinery-pending">{all.aPositionner}</span> ouverture(s) restent à positionner sur le plan avant de valider le plan. Elles sont déjà prises en compte dans l'audit, avec un emplacement indicatif.
          </div>
        )}

        {levels.map((l) => (
          <LevelTable key={l.id} level={l} />
        ))}

        <Card title={`Détecteurs de choc et d'ouverture indicatifs : ${detectors}`}>
          <p className="mb-2 text-xs text-slate-500">
            Règles configurées : {rules.shock.perOpening} détecteur par menuiserie extérieure, {rules.shock.perBay} par baie vitrée
            {rules.shock.skipSectional ? ', aucun automatiquement sur les portes de garage sectionnelles' : ''} ; les ouvertures intérieures ne sont pas protégées. Quantités
            indicatives, à vérifier : elles ne constituent pas une commande.
          </p>
          <ul className="space-y-0.5 text-sm" data-testid="detector-explanations">
            {audit.rooms
              .filter((r) => r.calc.detectors > 0 || r.calc.excluded.length)
              .map((r) => (
                <li key={r.roomId}>
                  <span className="text-slate-400">{r.levelName} · </span>
                  {r.calc.explanation}
                  {r.calc.excluded.length > 0 && <span className="text-xs text-slate-500"> ({r.calc.excluded.join(' ; ')})</span>}
                </li>
              ))}
          </ul>
        </Card>
      </div>

      {copy && (
        <Modal
          title="Copier la configuration d'un étage"
          onClose={() => setCopy(null)}
          footer={
            <>
              <Button onClick={() => setCopy(null)}>Annuler</Button>
              <Button
                variant="danger"
                disabled={copy.from === copy.to}
                onClick={() => {
                  try {
                    mutate((d) => copyLevelConfiguration(d, copy.from, copy.to));
                    toast('success', 'Pièces et menuiseries copiées.');
                  } catch (e) {
                    toast('error', (e as Error).message);
                  }
                  setCopy(null);
                }}
              >
                Copier (remplace le niveau cible)
              </Button>
            </>
          }
        >
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-slate-600">
              Depuis
              <Select value={copy.from} onChange={(e) => setCopy({ ...copy, from: e.target.value })} className="mt-1">
                {levels.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </Select>
            </label>
            <label className="text-xs text-slate-600">
              Vers
              <Select value={copy.to} onChange={(e) => setCopy({ ...copy, to: e.target.value })} className="mt-1">
                {levels.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </Select>
            </label>
          </div>
          <p className="mt-3 text-sm text-slate-600">Les pièces et ouvertures du niveau cible seront remplacées (annulable avec Ctrl+Z dans le plan 2D).</p>
        </Modal>
      )}
    </div>
  );
}
