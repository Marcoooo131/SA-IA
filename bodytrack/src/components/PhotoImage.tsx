import { useEffect, useState } from 'react';
import { ImageOff, Loader2 } from 'lucide-react';
import type { ProgressPhoto } from '../lib/types';
import { idbGet } from '../lib/db/idb';
import { useStore } from '../lib/store/store';
import { fetchRemotePhoto } from '../lib/sync/sync';
import { cx } from './ui';

/** Photo privée : lue depuis le stockage local (IndexedDB), sinon depuis le bucket privé Supabase */
export function PhotoImage({ photo, className }: { photo: ProgressPhoto; className?: string }) {
  const ws = useStore((s) => s.workspace);
  const [url, setUrl] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'missing'>('loading');
  useEffect(() => {
    let revoked = false;
    let u: string | null = null;
    (async () => {
      let blob = await idbGet<Blob>(`${ws}:${photo.id}`, 'blobs');
      if (!blob && photo.storagePath && ws === 'local') blob = (await fetchRemotePhoto(photo.storagePath, photo.id)) ?? undefined;
      if (revoked) return;
      if (blob) {
        u = URL.createObjectURL(blob);
        setUrl(u);
        setState('ok');
      } else setState('missing');
    })();
    return () => {
      revoked = true;
      if (u) URL.revokeObjectURL(u);
    };
  }, [photo.id, photo.storagePath, ws]);
  return (
    <div className={cx('bg-surface-2 overflow-hidden grid place-items-center', className)}>
      {state === 'ok' && url ? <img src={url} alt="" className="w-full h-full object-cover" /> : state === 'loading' ? <Loader2 size={18} className="animate-spin text-faint" /> : <ImageOff size={18} className="text-faint" />}
    </div>
  );
}

/** Redimensionne et compresse une photo (JPEG, 1280 px max) avant de l'enregistrer */
export async function compressImage(file: File, max = 1280, quality = 0.82): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  const img: CanvasImageSource & { width: number; height: number } =
    bitmap ??
    (await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = URL.createObjectURL(file);
    }));
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Compression impossible'))), 'image/jpeg', quality));
}
