import { Check, CopyPlus, Lock, RotateCw, Trash2, Unlock } from 'lucide-react';
import { useApp, useActiveDossier } from '@/state/store';
import { useEditor } from '@/state/editor';
import type { Level, OpeningType, RoomType, Wall } from '@/domain/types';
import { BILLING_LABELS, CATEGORY_LABELS, OPENING_TYPE_LABELS, ROOM_TYPE_LABELS } from '@/domain/labels';
import { addRoom, findLevel, freeSpot, removeOpening, removeRoom, removeWall } from '@/plan/actions';
import { clampOffset, hostSegment, isOpeningExteriorByGeometry, roomArea, segmentLength, wallLength } from '@/plan/geometry';
import { formatEuro, formatMonthly, formatNumber } from '@/lib/format';
import { Badge, Button, Field, NumberInput, PanelSection, Select, TextInput, Toggle } from '../kit';
import { CategoryDot } from './LeftPanels';

function Grid2({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-2">{children}</div>;
}

export function PropertiesPanel() {
  const dossier = useActiveDossier();
  const selection = useApp((s) => s.selection);
  const select = useApp((s) => s.select);
  const mutate = useApp((s) => s.mutate);
  const products = useApp((s) => s.catalog.products);
  const levelId = useApp((s) => s.activeLevelId);
  const setLevel = useApp((s) => s.setActiveLevel);
  const requestFit = useEditor((s) => s.requestFit);
  const setTool = useEditor((s) => s.setTool);
  if (!dossier) return null;
  const level = dossier.plan.levels.find((l) => l.id === levelId);

  if (!selection || !level) {
    return (
      <PanelSection title="Propriétés">
        <p className="text-xs text-slate-500">Sélectionnez une pièce, un mur, une ouverture ou un équipement pour modifier ses propriétés.</p>
      </PanelSection>
    );
  }

  const edit = (fn: (l: Level) => void, history = true) => mutate((d) => fn(findLevel(d, level.id)), { history });

  if (selection.kind === 'room') {
    const room = level.rooms.find((r) => r.id === selection.id);
    if (!room) return null;
    const upd = (patch: Partial<typeof room>) =>
      edit((l) => {
        const r = l.rooms.find((x) => x.id === room.id);
        if (r) Object.assign(r, patch);
      });
    return (
      <PanelSection title="Pièce">
        <div className="flex flex-col gap-2.5">
          <Field label="Nom">
            <TextInput value={room.name} onChange={(e) => upd({ name: e.target.value })} name="room-name" />
          </Field>
          <Field label="Type de pièce">
            <Select value={room.type} onChange={(e) => upd({ type: e.target.value as RoomType })} name="room-type">
              {Object.entries(ROOM_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <Grid2>
            <Field label="Largeur">
              <NumberInput value={room.w} onChange={(v) => v && upd({ w: v })} min={0.5} max={100} step={0.05} suffix="m" name="room-w" />
            </Field>
            <Field label="Profondeur">
              <NumberInput value={room.h} onChange={(v) => v && upd({ h: v })} min={0.5} max={100} step={0.05} suffix="m" name="room-h" />
            </Field>
            <Field label="Position X">
              <NumberInput value={room.x} onChange={(v) => v !== null && upd({ x: v })} step={0.05} suffix="m" name="room-x" />
            </Field>
            <Field label="Position Y">
              <NumberInput value={room.y} onChange={(v) => v !== null && upd({ y: v })} step={0.05} suffix="m" name="room-y" />
            </Field>
          </Grid2>
          <p className="text-xs text-slate-500">Surface : {formatNumber(roomArea(room), 2)} m²</p>
          <Toggle checked={room.openPlan} onChange={(v) => upd({ openPlan: v })} label="Pièce ouverte sur la pièce voisine" />
          <div className="flex gap-2">
            <Button
              size="sm"
              icon={<CopyPlus size={13} />}
              onClick={() => {
                let id = '';
                edit((l) => {
                  const spot = freeSpot(l, room.w, room.h);
                  id = addRoom(l, { ...spot, w: room.w, h: room.h }, room.type).id;
                });
                select({ kind: 'room', id });
              }}
            >
              Dupliquer
            </Button>
            <Button
              size="sm"
              variant="danger"
              icon={<Trash2 size={13} />}
              onClick={() => {
                edit((l) => removeRoom(l, room.id));
                select(null);
              }}
            >
              Supprimer
            </Button>
          </div>
        </div>
      </PanelSection>
    );
  }

  if (selection.kind === 'opening') {
    const o = level.openings.find((x) => x.id === selection.id);
    if (!o) return null;
    const seg = hostSegment(level, o.host);
    const hostLen = seg ? segmentLength(seg) : 0;
    const upd = (patch: Partial<typeof o>) =>
      edit((l) => {
        const x = l.openings.find((y) => y.id === o.id);
        if (!x) return;
        Object.assign(x, patch);
        x.offset = clampOffset(x.offset, x.width, hostLen);
      });
    const hostRoom = o.host.kind === 'room' ? level.rooms.find((r) => r.id === (o.host as { roomId: string }).roomId) : null;
    const geomExterior = isOpeningExteriorByGeometry(level, o);
    return (
      <PanelSection title="Ouverture">
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="font-mono text-sm font-semibold text-slate-800">{o.code}</span>
            {o.exterior ? <Badge tone="teal">Donne sur l'extérieur</Badge> : <Badge>Intérieure</Badge>}
          </div>
          <p className="text-xs text-slate-500">
            Identifiant unique utilisé pour éviter les doublons. Support : {hostRoom ? `${hostRoom.name}, côté ${({ N: 'nord', S: 'sud', E: 'est', W: 'ouest' } as const)[(o.host as { side: 'N' }).side]}` : 'mur libre'}.
          </p>
          <Field label="Type">
            <Select
              value={o.type}
              onChange={(e) => {
                const type = e.target.value as OpeningType;
                upd({ type, exterior: type === 'porte_interieure' ? false : o.exterior, sectional: type === 'porte_garage' ? o.sectional : false });
              }}
              name="opening-type"
            >
              {Object.entries(OPENING_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <Grid2>
            <Field label="Largeur">
              <NumberInput value={o.width} onChange={(v) => v && upd({ width: Math.min(v, hostLen) })} min={0.3} max={Math.max(0.3, hostLen)} step={0.05} suffix="m" name="opening-width" />
            </Field>
            <Field label="Position sur le mur">
              <NumberInput value={o.offset} onChange={(v) => v !== null && upd({ offset: v })} min={0} max={hostLen} step={0.05} suffix="m" name="opening-offset" />
            </Field>
          </Grid2>
          <Toggle checked={o.exterior} onChange={(v) => upd({ exterior: v })} label="Donne sur l'extérieur" disabled={o.type === 'porte_interieure'} />
          {o.exterior !== geomExterior && o.type !== 'porte_interieure' && (
            <p className="rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
              La géométrie suggère : {geomExterior ? 'extérieure' : 'intérieure (pièce contiguë)'}. Vérifiez cet indicateur.
            </p>
          )}
          {o.type === 'porte_garage' && (
            <Toggle checked={o.sectional} onChange={(v) => upd({ sectional: v })} label="Porte sectionnelle (pas de détecteur automatique)" />
          )}
          <Button
            size="sm"
            variant="danger"
            icon={<Trash2 size={13} />}
            onClick={() => {
              mutate((d) => removeOpening(d, findLevel(d, level.id), o.id));
              select(null);
            }}
          >
            Supprimer l'ouverture
          </Button>
        </div>
      </PanelSection>
    );
  }

  if (selection.kind === 'wall') {
    const w = level.walls.find((x) => x.id === selection.id);
    if (!w) return null;
    const upd = (fn: (x: Wall) => void) =>
      edit((l) => {
        const x = l.walls.find((y) => y.id === w.id);
        if (x) fn(x);
      });
    return (
      <PanelSection title="Mur / cloison">
        <div className="flex flex-col gap-2.5">
          <p className="text-xs text-slate-500">Longueur : {formatNumber(wallLength(w))} m. Glissez les extrémités pour ajuster.</p>
          <Grid2>
            <Field label="Début X">
              <NumberInput value={w.a.x} onChange={(v) => v !== null && upd((x) => (x.a = { ...x.a, x: v }))} step={0.05} suffix="m" />
            </Field>
            <Field label="Début Y">
              <NumberInput value={w.a.y} onChange={(v) => v !== null && upd((x) => (x.a = { ...x.a, y: v }))} step={0.05} suffix="m" />
            </Field>
            <Field label="Fin X">
              <NumberInput value={w.b.x} onChange={(v) => v !== null && upd((x) => (x.b = { ...x.b, x: v }))} step={0.05} suffix="m" />
            </Field>
            <Field label="Fin Y">
              <NumberInput value={w.b.y} onChange={(v) => v !== null && upd((x) => (x.b = { ...x.b, y: v }))} step={0.05} suffix="m" />
            </Field>
          </Grid2>
          <Field label="Épaisseur">
            <NumberInput value={w.thickness} onChange={(v) => v && upd((x) => (x.thickness = v))} min={0.05} max={0.6} step={0.01} suffix="m" />
          </Field>
          <Button
            size="sm"
            variant="danger"
            icon={<Trash2 size={13} />}
            onClick={() => {
              edit((l) => removeWall(l, w.id));
              select(null);
            }}
          >
            Supprimer le mur
          </Button>
        </div>
      </PanelSection>
    );
  }

  if (selection.kind === 'background') {
    const bg = level.background;
    if (!bg) return null;
    const upd = (patch: Partial<typeof bg>, history = true) =>
      edit((l) => {
        if (l.background) Object.assign(l.background, patch);
      }, history);
    return (
      <PanelSection title="Plan importé (fond de référence)">
        <div className="flex flex-col gap-2.5">
          <p className="truncate text-xs text-slate-600" title={bg.name}>
            {bg.name}
          </p>
          {bg.calibrated ? (
            <Badge tone="green">Échelle définie</Badge>
          ) : (
            <div className="rounded bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">
              Échelle non définie : utilisez l'outil « Échelle » sur une dimension connue avant de tracer.
              <Button size="sm" className="mt-1.5 w-full" onClick={() => setTool('calibrate')}>
                Définir l'échelle
              </Button>
            </div>
          )}
          <Field label={`Transparence (${Math.round(bg.opacity * 100)} %)`}>
            <input type="range" min={0.1} max={1} step={0.05} value={bg.opacity} onChange={(e) => upd({ opacity: Number(e.target.value) }, false)} aria-label="Transparence" />
          </Field>
          <Field label={`Rotation (${bg.rotation}°)`}>
            <div className="flex items-center gap-2">
              <input type="range" min={-180} max={180} step={0.5} value={bg.rotation} onChange={(e) => upd({ rotation: Number(e.target.value) }, false)} className="flex-1" aria-label="Rotation" />
              <Button size="sm" icon={<RotateCw size={12} />} onClick={() => upd({ rotation: ((bg.rotation + 90 + 180) % 360) - 180 })}>
                90°
              </Button>
            </div>
          </Field>
          <Grid2>
            <Field label="Largeur représentée">
              <NumberInput value={bg.width} onChange={(v) => v && upd({ width: v })} min={1} max={500} step={0.1} suffix="m" />
            </Field>
            <Field label="Position X / Y">
              <div className="flex gap-1">
                <NumberInput value={bg.x} onChange={(v) => v !== null && upd({ x: v })} step={0.1} />
                <NumberInput value={bg.y} onChange={(v) => v !== null && upd({ y: v })} step={0.1} />
              </div>
            </Field>
          </Grid2>
          <div className="flex flex-wrap gap-2">
            <Toggle checked={bg.visible} onChange={(v) => upd({ visible: v })} label="Visible" />
            <Button size="sm" icon={bg.locked ? <Unlock size={13} /> : <Lock size={13} />} onClick={() => upd({ locked: !bg.locked })}>
              {bg.locked ? 'Déverrouiller' : 'Verrouiller'}
            </Button>
          </div>
          <Button
            size="sm"
            variant="danger"
            icon={<Trash2 size={13} />}
            onClick={() => {
              edit((l) => (l.background = null));
              select(null);
              requestFit();
            }}
          >
            Retirer le fond
          </Button>
          <p className="text-[11px] text-slate-500">La 3D et le devis utilisent uniquement les pièces et ouvertures tracées, jamais l'image.</p>
        </div>
      </PanelSection>
    );
  }

  // Équipement
  const dev = dossier.devices.find((d) => d.id === selection.id);
  if (!dev) return null;
  const product = products.find((p) => p.id === dev.productId);
  const updDev = (patch: Partial<typeof dev>, history = true) =>
    mutate((d) => {
      const x = d.devices.find((y) => y.id === dev.id);
      if (x) Object.assign(x, patch);
    }, { history });
  const devLevel = dossier.plan.levels.find((l) => l.id === dev.levelId);
  const room = devLevel?.rooms.find((r) => r.id === dev.roomId);
  const alternatives = products.filter((p) => p.billing !== 'lot' && (p.active || p.id === dev.productId));
  return (
    <PanelSection title="Équipement">
      <div className="flex flex-col gap-2.5">
        <div className="flex items-start gap-2">
          {product && <CategoryDot category={product.category} suggested={dev.origin === 'suggere' && !dev.validated} />}
          <div className="flex-1">
            <div className="text-sm font-semibold text-slate-800">{product?.name ?? 'Produit introuvable'}</div>
            <div className="text-xs text-slate-500">
              {product?.reference} · {devLevel?.name}
              {room ? ` · ${room.name}` : ''}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          {dev.origin === 'manuel' ? <Badge tone="blue">Placé manuellement</Badge> : dev.validated ? <Badge tone="green">Suggestion validée</Badge> : <Badge tone="amber">Suggestion automatique</Badge>}
        </div>
        {dev.note && <p className="rounded bg-slate-50 px-2 py-1 text-[11px] text-slate-600">{dev.note}</p>}
        {dev.origin === 'suggere' && (
          <Button size="sm" variant={dev.validated ? 'secondary' : 'success'} icon={<Check size={13} />} onClick={() => updDev({ validated: !dev.validated })}>
            {dev.validated ? 'Annuler la validation' : 'Valider la suggestion'}
          </Button>
        )}
        <Field label="Référence / produit">
          <Select value={dev.productId} onChange={(e) => updDev({ productId: e.target.value })} name="device-product">
            {alternatives.map((p) => (
              <option key={p.id} value={p.id}>
                {p.reference} – {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Grid2>
          <Field label="Quantité">
            <NumberInput value={dev.quantity} onChange={(v) => v && updDev({ quantity: Math.max(1, Math.round(v)) })} min={1} max={50} step={1} name="device-qty" />
          </Field>
          <Field label="Orientation">
            <NumberInput value={dev.rotation} onChange={(v) => v !== null && updDev({ rotation: ((v % 360) + 360) % 360 })} step={15} suffix="°" name="device-rotation" />
          </Field>
          <Field label="Position X">
            <NumberInput value={dev.x} onChange={(v) => v !== null && updDev({ x: v })} step={0.05} suffix="m" />
          </Field>
          <Field label="Position Y">
            <NumberInput value={dev.y} onChange={(v) => v !== null && updDev({ y: v })} step={0.05} suffix="m" />
          </Field>
        </Grid2>
        <div className="flex gap-1">
          <Button size="sm" icon={<RotateCw size={13} />} onClick={() => updDev({ rotation: (dev.rotation + 45) % 360 })}>
            +45°
          </Button>
          {devLevel && devLevel.id !== level.id && (
            <Button size="sm" onClick={() => setLevel(devLevel.id)}>
              Voir le niveau
            </Button>
          )}
        </div>
        {product && (
          <div className="rounded-md border border-slate-200 bg-slate-50 p-2 text-[11px] text-slate-600">
            <div className="mb-1 font-semibold text-slate-700">Caractéristiques</div>
            <div>Catégorie : {CATEGORY_LABELS[product.category]}</div>
            <div>Facturation : {BILLING_LABELS[product.billing]}</div>
            <div>
              Prix : {formatEuro(product.priceInitial)} · {formatMonthly(product.monthly)}
            </div>
            {product.specs &&
              Object.entries(product.specs).map(([k, v]) => (
                <div key={k}>
                  {k} : {v} <span className="text-slate-400">(référence, indicatif)</span>
                </div>
              ))}
            {product.compatibility && <div className="mt-1">{product.compatibility}</div>}
          </div>
        )}
        <Button
          size="sm"
          variant="danger"
          icon={<Trash2 size={13} />}
          onClick={() => {
            mutate((d) => void (d.devices = d.devices.filter((x) => x.id !== dev.id)));
            select(null);
          }}
        >
          Supprimer l'équipement
        </Button>
      </div>
    </PanelSection>
  );
}
