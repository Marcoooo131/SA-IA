import { db } from "@/server/db";
import { Card, CardHeader, PageHeader, ButtonLink, Table, Td, Th } from "@/components/ui";
import { Form, Submit } from "@/components/ui/Form";
import { importAction } from "@/app/actions/products";
import { IMPORT_COLUMNS } from "@/server/services/import";

export default async function Import() {
  const categories = await db.category.findMany({ orderBy: { position: "asc" } });
  return (
    <>
      <PageHeader title="Importer un catalogue" subtitle="Des centaines de références en une fois, depuis un fichier CSV (séparateur virgule ou point-virgule) ou Excel (.xlsx)." action={<ButtonLink href="/api/import-template" variant="secondary">Télécharger le modèle CSV</ButtonLink>} />
      <Card className="mb-6"><CardHeader title="Fichier" subtitle="Chaque ligne est contrôlée : les lignes valides sont créées, les erreurs sont listées ligne par ligne." />
        <Form action={importAction} className="space-y-4 p-5">
          <input type="file" name="file" accept=".csv,.xlsx,.txt" required className="block w-full text-sm file:mr-3 file:rounded-full file:border-0 file:bg-ink file:px-4 file:py-2 file:text-white" />
          <Submit variant="accent">Importer</Submit>
        </Form>
      </Card>
      <Card><CardHeader title="Colonnes attendues" />
        <div className="p-5 text-sm text-ink-2">
          <p className="mb-3 font-mono text-xs">{IMPORT_COLUMNS.join(", ")}</p>
          <ul className="list-disc space-y-1 pl-5"><li>Prix en euros (« 24,90 »). Stock en unités.</li><li><code>etat</code> : neuf, comme neuf, très bon, bon, correct.</li><li><code>commission_type</code> : PERCENT (valeur en %) ou FIXED (valeur en €). Vide = produit fermé au réseau.</li><li><code>image_url</code> : URL publique d&apos;une image (facultatif).</li></ul>
        </div>
        <Table><thead><tr><Th>Identifiant de catégorie</Th><Th>Libellé</Th></tr></thead><tbody>{categories.map((c) => <tr key={c.id}><Td className="font-mono text-xs">{c.slug}</Td><Td>{c.name}</Td></tr>)}</tbody></Table>
      </Card>
    </>
  );
}
