import { useMemo, useRef, useState } from 'react';
import { Camera, Columns2, Lock, Trash2 } from 'lucide-react';
import type { PhotoPose, ProgressPhoto } from '../../lib/types';
import { Button, Card, EmptyState, Field, Notice, PageHeader, Segmented, Sheet, SubNav } from '../../components/ui';
import { PhotoImage, compressImage } from '../../components/PhotoImage';
import { PROGRESS_NAV } from './nav';
import { useCtx, useToday } from '../../lib/useCtx';
import { formatDate } from '../../lib/dates';
import { nowISO, uid } from '../../lib/format';
import { store, useStore } from '../../lib/store/store';
import { idbDelete, idbSet } from '../../lib/db/idb';
import { deleteRemotePhoto } from '../../lib/sync/sync';
import { confirmDialog } from '../../components/confirm';
import { toast } from '../../components/toast';

export const POSES: { value: PhotoPose; label: string }[] = [
  { value: 'front', label: 'Face' },
  { value: 'side', label: 'Profil' },
  { value: 'back', label: 'Dos' },
];

export default function Photos() {
  const ctx = useCtx();
  const t = useToday();
  const ws = useStore((s) => s.workspace);
  const input = useRef<HTMLInputElement>(null);
  const [date, setDate] = useState(t);
  const [pose, setPose] = useState<PhotoPose>('front');
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<ProgressPhoto | null>(null);
  const [compare, setCompare] = useState(false);
  const photos = useMemo(() => [...ctx.data.photos].sort((a, b) => b.date.localeCompare(a.date)), [ctx]);
  const dates = [...new Set(photos.map((p) => p.date))];
  const [cmpPose, setCmpPose] = useState<PhotoPose>('front');
  const poseDates = [...new Set(photos.filter((p) => p.pose === cmpPose).map((p) => p.date))].sort();
  const [a, setA] = useState<string>('');
  const [b, setB] = useState<string>('');
  const dateA = a || poseDates[0] || '';
  const dateB = b || poseDates[poseDates.length - 1] || '';

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const blob = await compressImage(file);
      const photo: ProgressPhoto = { id: uid(), date, pose, storagePath: null, note: '', updatedAt: nowISO() };
      await idbSet(`${ws}:${photo.id}`, blob, 'blobs');
      store().upsert('photos', photo);
      toast('Photo ajoutée', `${POSES.find((p) => p.value === pose)?.label} · ${formatDate(date)}`);
    } catch (e) {
      toast('Photo non enregistrée', (e as Error).message, 'error');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div>
      <PageHeader title="Photos" subtitle="Avant / après, visibles uniquement par toi" />
      <SubNav items={PROGRESS_NAV} active="/progress/photos" />
      <Card className="mb-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">
            <input type="date" className="field" value={date} max={t} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <div>
            <span className="label">Vue</span>
            <Segmented className="w-full" value={pose} onChange={setPose} options={POSES} size="sm" />
          </div>
        </div>
        <input ref={input} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
        <div className="flex gap-2">
          <Button variant="primary" className="flex-1" icon={<Camera size={16} />} onClick={() => input.current?.click()} disabled={busy}>
            {busy ? 'Enregistrement…' : 'Ajouter une photo'}
          </Button>
          <Button icon={<Columns2 size={16} />} onClick={() => setCompare(true)} disabled={photos.length < 2}>
            Comparer
          </Button>
        </div>
        <p className="text-[11px] text-faint flex gap-1.5 items-start">
          <Lock size={12} className="shrink-0 mt-px" /> Photos compressées et conservées sur cet appareil. Avec un compte, elles sont aussi sauvegardées dans un espace de stockage privé accessible uniquement par toi.
        </p>
      </Card>

      {!photos.length ? (
        <EmptyState icon={<Camera size={22} />} title="Aucune photo" text="Prends tes photos dans les mêmes conditions (lumière, heure, tenue, distance) pour des comparaisons fiables." />
      ) : (
        <div className="space-y-5">
          {dates.map((d) => (
            <section key={d}>
              <h3 className="text-sm font-medium text-muted mb-2">{formatDate(d, { day: 'numeric', month: 'long', year: 'numeric' })}</h3>
              <div className="grid grid-cols-3 gap-2">
                {photos
                  .filter((p) => p.date === d)
                  .map((p) => (
                    <button key={p.id} type="button" onClick={() => setView(p)} className="relative rounded-xl overflow-hidden">
                      <PhotoImage photo={p} className="aspect-[3/4]" />
                      <span className="absolute bottom-1 left-1 text-[10px] bg-black/60 rounded px-1.5 py-0.5">{POSES.find((x) => x.value === p.pose)?.label}</span>
                    </button>
                  ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <Sheet open={!!view} onClose={() => setView(null)} title={view ? `${POSES.find((x) => x.value === view.pose)?.label} · ${formatDate(view.date)}` : ''}>
        {view && (
          <div className="space-y-3">
            <PhotoImage photo={view} className="rounded-2xl max-h-[60dvh] aspect-[3/4] mx-auto" />
            <Button
              variant="danger"
              className="w-full"
              icon={<Trash2 size={14} />}
              onClick={async () => {
                if (await confirmDialog({ title: 'Supprimer cette photo ?', text: 'Elle sera supprimée de cet appareil et de ton espace privé.', confirmLabel: 'Supprimer', danger: true })) {
                  await idbDelete(`${ws}:${view.id}`, 'blobs');
                  if (view.storagePath) await deleteRemotePhoto(view.storagePath).catch(() => {});
                  store().remove('photos', view.id);
                  setView(null);
                }
              }}
            >
              Supprimer
            </Button>
          </div>
        )}
      </Sheet>

      <Sheet open={compare} onClose={() => setCompare(false)} title="Comparer deux dates" wide>
        <div className="space-y-3">
          <Segmented className="w-full" value={cmpPose} onChange={(v) => { setCmpPose(v); setA(''); setB(''); }} options={POSES} size="sm" />
          {poseDates.length < 2 ? (
            <Notice>Il faut au moins deux dates avec une photo « {POSES.find((x) => x.value === cmpPose)?.label} ».</Notice>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                {[
                  [dateA, setA],
                  [dateB, setB],
                ].map(([val, set], i) => (
                  <select key={i} className="field" value={val as string} onChange={(e) => (set as (v: string) => void)(e.target.value)}>
                    {poseDates.map((d) => (
                      <option key={d} value={d}>
                        {formatDate(d, { day: 'numeric', month: 'short', year: 'numeric' })}
                      </option>
                    ))}
                  </select>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[dateA, dateB].map((d, i) => {
                  const p = photos.find((x) => x.pose === cmpPose && x.date === d);
                  return p ? <PhotoImage key={`${i}${p.id}`} photo={p} className="rounded-xl aspect-[3/4]" /> : <div key={i} />;
                })}
              </div>
            </>
          )}
        </div>
      </Sheet>
    </div>
  );
}
