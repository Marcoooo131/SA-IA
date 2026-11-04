import Image from "next/image";
import type { Category, Product, ProductImage, ProductVariant, Inventory, CommissionRule } from "@prisma/client";
import { Card, Checkbox, Field, Input, Select, Textarea } from "@/components/ui";
import { Form, Submit } from "@/components/ui/Form";
import { createProductAction, updateProductAction } from "@/app/actions/products";
import { carriers, conditionLabel } from "@/lib/labels";
import { centsToInput, formatBps, formatEUR } from "@/lib/money";
import type { CommerceSettings } from "@/server/commission/settings-schema";

type Full = Product & { images: ProductImage[]; variants: (ProductVariant & { inventory: Inventory | null })[]; inventory: Inventory[]; commissionRules: CommissionRule[] };

export function ProductForm({ categories, product, supplier, settings, proMode }: { categories: Category[]; product?: Full; supplier?: boolean; settings: CommerceSettings; proMode?: boolean }) {
  const stock = product?.inventory.find((i) => !i.variantId)?.quantity ?? 1;
  const rule = product?.commissionRules.find((r) => r.active);
  const variantsText = product?.variants.map((v) => [v.name, v.inventory?.quantity ?? 0, v.priceCents ? centsToInput(v.priceCents) : ""].join(";")).join("\n") ?? "";
  return (
    <Form action={product ? updateProductAction : createProductAction} className="space-y-6">
      {product && <input type="hidden" name="productId" value={product.id} />}
      <Card className="space-y-4 p-5">
        <h2 className="font-semibold">Photos</h2>
        {product && product.images.length > 0 && (
          <div className="flex flex-wrap gap-3">
            {product.images.map((im) => (
              <label key={im.id} className="relative block h-24 w-24 overflow-hidden rounded-xl border border-line">
                <Image src={im.url} alt="" fill sizes="96px" className="object-cover" />
                <input type="checkbox" name="keepImages" value={im.url} defaultChecked className="absolute left-1.5 top-1.5 h-4 w-4" aria-label="Conserver cette photo" />
              </label>
            ))}
          </div>
        )}
        <Field label={product ? "Ajouter des photos" : "Photos (jusqu'à 10)"} hint="JPEG, PNG, WebP — 8 Mo max. par photo. La première photo sert de couverture.">
          <input type="file" name="photos" accept="image/jpeg,image/png,image/webp,image/avif,image/gif" multiple className="block w-full text-sm file:mr-3 file:rounded-full file:border-0 file:bg-ink file:px-4 file:py-2 file:text-sm file:text-white" />
        </Field>
      </Card>
      <Card className="space-y-4 p-5">
        <h2 className="font-semibold">Description</h2>
        <Field label="Titre"><Input name="title" required maxLength={120} defaultValue={product?.title} placeholder="Ex. Veste en jean Levi's taille M" /></Field>
        <Field label="Description"><Textarea name="description" required maxLength={5000} defaultValue={product?.description} placeholder="État, dimensions, défauts éventuels, accessoires fournis…" /></Field>
        {!proMode && (
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Catégorie">
              <Select name="categoryId" required defaultValue={product?.categoryId ?? ""}>
                <option value="" disabled>Choisir…</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}{c.restricted ? " (contrôlé)" : ""}</option>)}
              </Select>
            </Field>
            <Field label="État">
              <Select name="condition" defaultValue={product?.condition ?? (supplier ? "NEW" : "VERY_GOOD")}>
                {Object.entries(conditionLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
            <Field label="Marque"><Input name="brand" defaultValue={product?.brand ?? ""} /></Field>
          </div>
        )}
        {proMode && <Field label="Marque"><Input name="brand" defaultValue={product?.brand ?? ""} /></Field>}
      </Card>
      {!proMode && (
        <>
          <Card className="space-y-4 p-5">
            <h2 className="font-semibold">Prix</h2>
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Prix de vente (€)"><Input name="price" required inputMode="decimal" defaultValue={centsToInput(product?.priceCents)} /></Field>
              {!supplier && <Field label="Prix plancher (€)" hint="Prix minimum que votre indépendant peut accepter sur une offre."><Input name="minPrice" inputMode="decimal" defaultValue={centsToInput(product?.minPriceCents)} /></Field>}
              {supplier && <Field label="Prix conseillé (€)"><Input name="recommendedPrice" inputMode="decimal" defaultValue={centsToInput(product?.recommendedPriceCents)} /></Field>}
              {supplier && <Field label="Prix de gros (€)" hint="Visible des indépendants uniquement."><Input name="wholesalePrice" inputMode="decimal" defaultValue={centsToInput(product?.wholesalePriceCents)} /></Field>}
            </div>
            {!supplier && <p className="text-xs text-ink-3">Frais de service plateforme : {formatBps(settings.p2pFeeBps)} + {formatEUR(settings.p2pFeeFixedCents)} par vente, prélevés sur votre revenu. En cas de vente confiée, seule la commission convenue avec l&apos;indépendant s&apos;applique.</p>}
          </Card>
          {supplier && (
            <Card className="space-y-4 p-5">
              <h2 className="font-semibold">Stock, variantes et réseau commercial</h2>
              <div className="grid gap-4 md:grid-cols-3">
                <Field label="Stock disponible" hint="Ignoré si des variantes sont définies."><Input name="stock" type="number" min={0} defaultValue={stock} /></Field>
                <Field label="Référence (SKU)"><Input name="sku" defaultValue={product?.sku ?? ""} /></Field>
              </div>
              <Field label="Variantes (une par ligne : nom;stock;prix facultatif)" hint="Ex. Taille M / Noir;12;24,90">
                <Textarea name="variants" defaultValue={variantsText} className="min-h-20 font-mono text-xs" />
              </Field>
              <Checkbox name="affiliateEnabled" defaultChecked={product?.affiliateEnabled ?? true} label="Ouvrir ce produit au réseau d'indépendants (liens commerciaux)" />
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Type de commission"><Select name="commissionType" defaultValue={rule?.type ?? "PERCENT"}><option value="PERCENT">Pourcentage du prix</option><option value="FIXED">Montant fixe par unité</option></Select></Field>
                <Field label="Commission proposée (% ou €)" hint={`Doit représenter entre ${formatBps(settings.supplierCommissionMinBps)} et ${formatBps(settings.supplierCommissionMaxBps)} du prix. Frais plateforme prélevés dessus : ${formatBps(settings.commissionPlatformFeeBps)} (min. ${formatEUR(settings.commissionPlatformFeeMinCents)}).`}>
                  <Input name="commissionValue" inputMode="decimal" defaultValue={rule ? (rule.type === "PERCENT" ? String(rule.value / 100) : centsToInput(rule.value)) : "10"} />
                </Field>
              </div>
            </Card>
          )}
          <Card className="space-y-4 p-5">
            <h2 className="font-semibold">Livraison</h2>
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Frais de port (€)"><Input name="shipping" inputMode="decimal" defaultValue={centsToInput(product?.shippingCents ?? 590)} /></Field>
              <Field label="Délai d'expédition (jours)"><Input name="shippingDays" type="number" min={0} defaultValue={product?.shippingDays ?? 3} /></Field>
              <Field label="Ville d'expédition"><Input name="city" defaultValue={product?.city ?? ""} /></Field>
            </div>
            <div className="flex flex-wrap gap-4">
              {carriers.filter((c) => c.id !== "autre").map((c) => <Checkbox key={c.id} name="shippingMethods" value={c.id} defaultChecked={product ? product.shippingMethods.includes(c.id) : c.id !== "chronopost"} label={c.label} />)}
              <Checkbox name="handPickup" defaultChecked={product?.handPickup} label="Remise en main propre" />
            </div>
          </Card>
          {!supplier && (
            <Card className="p-5">
              <Checkbox name="openToProfessionals" defaultChecked={product?.openToProfessionals} label={<><strong>J&apos;accepte les propositions d&apos;indépendants</strong> — des commerciaux vérifiés pourront me proposer de vendre cet article pour moi, contre une commission que j&apos;accepte ou non.</>} />
            </Card>
          )}
        </>
      )}
      <div className="flex flex-wrap gap-2">
        <Submit size="lg">{product ? "Enregistrer" : "Publier"}</Submit>
        {!product && <Submit size="lg" variant="secondary" name="intent" value="draft">Enregistrer en brouillon</Submit>}
      </div>
    </Form>
  );
}
