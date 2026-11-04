"use client";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

const messages: Record<string, string> = {
  bienvenue: "Bienvenue ! Votre compte est créé. Un e-mail de confirmation vous a été envoyé.",
  connecte: "Vous êtes connecté.",
  publie: "Annonce enregistrée.",
  panier: "Ajouté au panier.",
  paiement: "Paiement en cours de confirmation.",
  envoye: "Message envoyé.",
  email: "Adresse e-mail confirmée.",
  mdp: "Mot de passe modifié : reconnectez-vous.",
};

export function Flash() {
  const sp = useSearchParams();
  const key = sp.get("ok");
  const [open, setOpen] = useState(!!key);
  useEffect(() => { setOpen(!!key); const t = setTimeout(() => setOpen(false), 4500); return () => clearTimeout(t); }, [key]);
  if (!key || !open) return null;
  return (
    <div role="status" className="animate-fade-up fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full bg-ink px-5 py-3 text-sm text-white shadow-xl">
      {messages[key] ?? key}
    </div>
  );
}
