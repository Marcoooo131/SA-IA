"use client";
import { useActionState, useEffect, useState } from "react";
import { Heart } from "lucide-react";
import { addToCartAction, favoriteAction, rememberAttribution } from "@/app/actions/shop";
import { Alert, buttonClass, Select } from "@/components/ui";
import { Submit } from "@/components/ui/Form";
import { formatEUR } from "@/lib/money";

type Variant = { id: string; name: string; priceCents: number | null; stock: number };

export function BuyBox({ productId, priceCents, variants, stock, attributionId, isFavorite, disabled, disabledReason }: {
  productId: string; priceCents: number; variants: Variant[]; stock: number; attributionId?: string | null; isFavorite: boolean; disabled?: boolean; disabledReason?: string;
}) {
  const [variantId, setVariantId] = useState(variants.find((v) => v.stock > 0)?.id ?? "");
  const [state, action] = useActionState(addToCartAction, null);
  const [favState, favAction] = useActionState(favoriteAction, null);
  useEffect(() => { if (attributionId) void rememberAttribution(attributionId); }, [attributionId]);
  const v = variants.find((x) => x.id === variantId);
  const available = variants.length ? (v?.stock ?? 0) : stock;
  const fav = favState?.ok ? favState.ok.startsWith("Ajouté") : isFavorite;
  return (
    <div className="space-y-3">
      <p className="text-3xl font-semibold">{formatEUR(v?.priceCents ?? priceCents)}</p>
      <form action={action} className="space-y-3">
        <input type="hidden" name="productId" value={productId} />
        {attributionId && <input type="hidden" name="attributionId" value={attributionId} />}
        {variants.length > 0 && (
          <Select name="variantId" value={variantId} onChange={(e) => setVariantId(e.target.value)} aria-label="Variante">
            {variants.map((x) => <option key={x.id} value={x.id} disabled={x.stock <= 0}>{x.name}{x.stock <= 0 ? " — épuisé" : ""}</option>)}
          </Select>
        )}
        {stock > 1 && !variants.length && (
          <Select name="quantity" defaultValue="1" aria-label="Quantité">
            {Array.from({ length: Math.min(10, stock) }, (_, i) => <option key={i} value={i + 1}>Quantité : {i + 1}</option>)}
          </Select>
        )}
        <p className="text-sm text-ink-3">{available > 0 ? (available > 1 ? `${available} en stock` : "Disponible") : "Indisponible"}</p>
        {disabled ? <Alert tone="info">{disabledReason}</Alert> : (
          <div className="grid gap-2">
            <Submit size="lg" name="buyNow" value="1" className="w-full">Acheter</Submit>
            <Submit size="lg" variant="secondary" className="w-full">Ajouter au panier</Submit>
          </div>
        )}
        {state?.error && <Alert tone="danger">{state.error}</Alert>}
        {state?.ok && <Alert tone="success">{state.ok} — <a href="/panier" className="underline">voir le panier</a></Alert>}
      </form>
      <form action={favAction}>
        <input type="hidden" name="productId" value={productId} />
        <button className={buttonClass("ghost", "md", "w-full")}><Heart className={`h-4 w-4 ${fav ? "fill-brand text-brand" : ""}`} />{fav ? "Dans vos favoris" : "Ajouter aux favoris"}</button>
      </form>
    </div>
  );
}
