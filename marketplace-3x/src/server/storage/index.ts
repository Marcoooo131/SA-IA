import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomToken } from "../auth/password";
import { AppError } from "../errors";

/**
 * Stockage des fichiers (photos produits, pièces jointes de messagerie).
 * Pilote "local" : public/uploads — pour le développement uniquement (le disque Vercel est éphémère).
 * Production : implémenter `StorageDriver` pour S3 / Cloudflare R2 / Vercel Blob (voir docs/ARCHITECTURE.md).
 */
export interface StorageDriver {
  put(key: string, data: Buffer, contentType: string): Promise<string>; // retourne l'URL publique
}

const ALLOWED: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif",
};
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const localDriver: StorageDriver = {
  async put(key, data) {
    const dir = path.join(process.cwd(), "public", "uploads");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, key), data);
    return `/uploads/${key}`;
  },
};

/**
 * Pilote Supabase Storage (production, ex. Vercel) : bucket public créé automatiquement au premier envoi.
 * Variables : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (clé secrète, côté serveur uniquement), STORAGE_BUCKET.
 */
let bucketReady = false;
const supabaseDriver: StorageDriver = {
  async put(key, data, contentType) {
    const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const bucket = process.env.STORAGE_BUCKET ?? "marketplace-images";
    if (!url || !secret) throw new AppError("Stockage Supabase non configuré (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)");
    const headers = { Authorization: `Bearer ${secret}`, apikey: secret };
    if (!bucketReady) {
      const r = await fetch(`${url}/storage/v1/bucket`, {
        method: "POST", headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ id: bucket, name: bucket, public: true, file_size_limit: MAX_IMAGE_BYTES }),
      });
      if (!r.ok && r.status !== 409 && !(await r.text()).toLowerCase().includes("exist")) throw new AppError("Création du bucket de stockage impossible");
      bucketReady = true;
    }
    const res = await fetch(`${url}/storage/v1/object/${bucket}/${key}`, {
      method: "POST", headers: { ...headers, "content-type": contentType, "cache-control": "31536000" }, body: new Uint8Array(data),
    });
    if (!res.ok) throw new AppError("Envoi de l'image impossible, réessayez");
    return `${url}/storage/v1/object/public/${bucket}/${key}`;
  },
};

function driver(): StorageDriver {
  const name = process.env.STORAGE_DRIVER ?? "local";
  if (name === "local") return localDriver;
  if (name === "supabase") return supabaseDriver;
  throw new AppError(`Pilote de stockage « ${name} » non configuré`);
}

/** Contrôle du type réel par signature binaire (le type MIME déclaré n'est pas fiable). */
function sniff(buf: Buffer): string | null {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP") return "image/webp";
  if (buf.subarray(0, 3).toString() === "GIF") return "image/gif";
  if (buf.subarray(4, 12).toString().startsWith("ftypavi")) return "image/avif";
  return null;
}

export async function storeImage(file: File, prefix: string): Promise<string> {
  if (file.size === 0) throw new AppError("Fichier vide");
  if (file.size > MAX_IMAGE_BYTES) throw new AppError("Image trop lourde (8 Mo maximum)");
  const buf = Buffer.from(await file.arrayBuffer());
  const type = sniff(buf);
  if (!type || !ALLOWED[type]) throw new AppError("Format d'image non pris en charge (JPEG, PNG, WebP, GIF, AVIF)");
  const key = `${prefix}-${randomToken(12)}.${ALLOWED[type]}`;
  return driver().put(key, buf, type);
}

export async function storeImages(files: File[], prefix: string, max = 10) {
  const real = files.filter((f) => f && typeof f === "object" && f.size > 0);
  if (real.length > max) throw new AppError(`${max} photos maximum`);
  const urls: string[] = [];
  for (const f of real) urls.push(await storeImage(f, prefix));
  return urls;
}
