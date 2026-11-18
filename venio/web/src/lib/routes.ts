// Adresses internes. La version de démonstration (GitHub Pages, sans serveur) n'a que des pages statiques :
// les identifiants passent alors en paramètres d'URL au lieu de segments de chemin.
export const DEMO = process.env.NEXT_PUBLIC_VENIO_DEMO === "1";
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const publicPagePath = (slug: string) => (DEMO ? `/r/?slug=${encodeURIComponent(slug)}` : `/r/${slug}`);
export const caseFilePath = (id: string) => (DEMO ? `/app/dossier/?id=${id}` : `/app/dossiers/${id}`);
/** Pour les liens <a> bruts (les <Link> ajoutent le préfixe eux-mêmes). */
export const withBase = (path: string) => `${BASE_PATH}${path}`;

export function fileUrl(id: string): string {
  if (!DEMO) return `/api/files/${id}`;
  try {
    const db = JSON.parse(localStorage.getItem("venio-demo-v1") ?? "{}") as { tenants?: { files: { id: string; data_url: string }[] }[] };
    for (const t of db.tenants ?? []) { const f = t.files.find((x) => x.id === id); if (f) return f.data_url; }
  } catch { /* stockage illisible */ }
  return "";
}
