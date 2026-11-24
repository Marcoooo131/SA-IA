"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Alert, Logo, Spinner } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";

export default function VerifyEmail() {
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [error, setError] = useState("");
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("jeton");
    if (!token) { setState("error"); setError("Ce lien est incomplet. Ouvrez le lien reçu par email."); return; }
    api("/auth/email/verify", { method: "POST", body: { token } })
      .then(() => setState("ok"))
      .catch((e) => { setState("error"); setError(errorMessage(e)); });
  }, []);

  return (
    <main className="mx-auto max-w-sm px-5 py-16">
      <Link href="/"><Logo className="text-lg" /></Link>
      <h1 className="mt-10 font-display text-4xl font-semibold">Adresse email</h1>
      <div className="mt-6 space-y-4">
        {state === "loading" && <p className="flex items-center gap-2 text-ink-muted"><Spinner /> Vérification en cours…</p>}
        {state === "ok" && <Alert kind="success" title="Adresse confirmée">Merci, votre adresse email est vérifiée.</Alert>}
        {state === "error" && <Alert>{error} Depuis votre espace, vous pouvez renvoyer un nouveau lien.</Alert>}
        {state !== "loading" && <Link href="/app" className="inline-flex font-medium text-signal-strong underline underline-offset-2">Aller à mon espace</Link>}
      </div>
    </main>
  );
}
