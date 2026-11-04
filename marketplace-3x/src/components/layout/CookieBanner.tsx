"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

/** Bandeau de consentement : refuser est aussi simple qu'accepter ; aucun traceur non essentiel avant le choix. */
export function CookieBanner() {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState(false);
  const [affiliate, setAffiliate] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  useEffect(() => {
    const has = document.cookie.split("; ").some((c) => c.startsWith("m3x_consent="));
    setOpen(!has);
    const reopen = () => setOpen(true);
    window.addEventListener("m3x:cookies", reopen);
    return () => window.removeEventListener("m3x:cookies", reopen);
  }, []);
  async function save(a: boolean, f: boolean) {
    await fetch("/api/consent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ analytics: a, affiliate: f }) });
    setOpen(false);
  }
  if (!open) return null;
  return (
    <div role="dialog" aria-label="Gestion des cookies" className="animate-fade-up fixed inset-x-3 bottom-3 z-50 mx-auto max-w-3xl rounded-2xl border border-line bg-white p-5 shadow-2xl">
      <p className="font-semibold">Vos choix en matière de cookies</p>
      <p className="mt-1 text-sm text-ink-2">
        Nous utilisons des cookies indispensables (session, panier, sécurité). Avec votre accord, nous mémorisons aussi le lien
        commercial d&apos;un indépendant qui vous a recommandé un produit, afin de lui attribuer la vente, et mesurons l&apos;audience.{" "}
        <Link href="/legal/cookies" className="underline">En savoir plus</Link>
      </p>
      {custom && (
        <div className="mt-3 space-y-2 rounded-xl bg-canvas p-3 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked disabled /> Indispensables (toujours actifs)</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={affiliate} onChange={(e) => setAffiliate(e.target.checked)} /> Attribution des ventes aux indépendants (30 jours max.)</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={analytics} onChange={(e) => setAnalytics(e.target.checked)} /> Mesure d&apos;audience</label>
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <button onClick={() => save(false, false)} className="h-10 rounded-full border border-line px-4 text-sm font-medium">Tout refuser</button>
        {custom
          ? <button onClick={() => save(analytics, affiliate)} className="h-10 rounded-full border border-line px-4 text-sm font-medium">Enregistrer mes choix</button>
          : <button onClick={() => setCustom(true)} className="h-10 rounded-full border border-line px-4 text-sm font-medium">Personnaliser</button>}
        <button onClick={() => save(true, true)} className="h-10 rounded-full bg-ink px-4 text-sm font-medium text-white">Tout accepter</button>
      </div>
    </div>
  );
}

export function ReopenCookies() {
  return <button className="underline" onClick={() => window.dispatchEvent(new Event("m3x:cookies"))}>Modifier mes choix de cookies</button>;
}
