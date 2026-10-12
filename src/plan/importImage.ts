/**
 * Import d'un plan (PNG, JPG, photo, capture d'écran ou PDF) comme FOND DE RÉFÉRENCE.
 * Aucune reconstruction automatique de géométrie n'est effectuée : le conseiller
 * trace les pièces par-dessus le document après avoir défini une échelle.
 */

export interface ImportedImage {
  dataUrl: string;
  width: number;
  height: number;
  name: string;
}

const MAX_SIDE = 2400;
const ACCEPTED = ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'];

export function isAcceptedPlanFile(file: File): boolean {
  const n = file.name.toLowerCase();
  return ACCEPTED.includes(file.type) || /\.(png|jpe?g|pdf)$/.test(n);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("L'image n'a pas pu être lue (fichier corrompu ou format non supporté)."));
    img.src = src;
  });
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('Lecture du fichier impossible.'));
    r.readAsDataURL(file);
  });
}

function downscale(source: CanvasImageSource, w: number, h: number, mime: 'image/png' | 'image/jpeg'): ImportedImage & { name: '' } {
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas indisponible dans ce navigateur.');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, cw, ch);
  ctx.drawImage(source, 0, 0, cw, ch);
  return { dataUrl: canvas.toDataURL(mime, 0.86), width: cw, height: ch, name: '' };
}

async function renderPdfFirstPage(file: File): Promise<ImportedImage> {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const data = new Uint8Array(await file.arrayBuffer());
  let pdf;
  try {
    pdf = await pdfjs.getDocument({ data }).promise;
  } catch (e) {
    throw new Error(`PDF illisible : ${(e as Error).message}`);
  }
  const page = await pdf.getPage(1);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(3, MAX_SIDE / Math.max(base.width, base.height));
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas indisponible dans ce navigateur.');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  const out = downscale(canvas, canvas.width, canvas.height, 'image/png');
  return { ...out, name: `${file.name} (page 1/${pdf.numPages})` };
}

export async function importPlanFile(file: File): Promise<ImportedImage> {
  if (!isAcceptedPlanFile(file)) throw new Error('Format non pris en charge : PNG, JPG/JPEG ou PDF uniquement.');
  if (file.size > 25 * 1024 * 1024) throw new Error('Fichier trop volumineux (25 Mo maximum).');
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) return renderPdfFirstPage(file);
  const src = await readAsDataUrl(file);
  const img = await loadImage(src);
  if (!img.naturalWidth || !img.naturalHeight) throw new Error("L'image est vide.");
  const isPng = file.type === 'image/png' || file.name.toLowerCase().endsWith('.png');
  const out = downscale(img, img.naturalWidth, img.naturalHeight, isPng ? 'image/png' : 'image/jpeg');
  return { ...out, name: file.name };
}
