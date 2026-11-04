import { db } from "@/server/db";
import { Card, CardHeader, Checkbox, Input, PageHeader, Select } from "@/components/ui";
import { Form, Submit } from "@/components/ui/Form";
import { categoryAction } from "@/app/actions/admin";

export default async function Categories() {
  const cats = await db.category.findMany({ orderBy: [{ parentId: "asc" }, { position: "asc" }], include: { _count: { select: { products: true } } } });
  const Row = ({ c }: { c?: (typeof cats)[number] }) => (
    <Form action={categoryAction} showOk={false} className="grid items-center gap-2 border-b border-line p-3 md:grid-cols-[1.5fr_1fr_1fr_1fr_70px_auto_auto]">
      {c && <input type="hidden" name="id" value={c.id} />}
      <Input name="name" defaultValue={c?.name} placeholder="Nom" required className="h-9" />
      <Input name="slug" defaultValue={c?.slug} placeholder="identifiant" required className="h-9 font-mono text-xs" />
      <Input name="icon" defaultValue={c?.icon} placeholder="Icône" className="h-9" />
      <Select name="parentId" defaultValue={c?.parentId ?? ""} className="h-9"><option value="">— racine —</option>{cats.filter((x) => x.id !== c?.id && !x.parentId).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select>
      <Input name="position" type="number" defaultValue={c?.position ?? 0} className="h-9" />
      <Checkbox name="restricted" defaultChecked={c?.restricted} label="Contrôlée" />
      <div className="flex items-center gap-2">{c && <span className="text-xs text-ink-3">{c._count.products} prod.</span>}<Submit size="sm" variant={c ? "secondary" : "accent"}>{c ? "OK" : "Ajouter"}</Submit></div>
    </Form>
  );
  return (
    <>
      <PageHeader title="Catégories" subtitle="« Contrôlée » : toute annonce passe en modération avant publication (produits réglementés)." />
      <Card><CardHeader title="Nouvelle catégorie" /><Row /></Card>
      <Card className="mt-6"><CardHeader title={`${cats.length} catégories`} />{cats.map((c) => <Row key={c.id} c={c} />)}</Card>
    </>
  );
}
