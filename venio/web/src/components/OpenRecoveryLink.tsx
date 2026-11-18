"use client";
import { useEffect, useState } from "react";
import { Alert, LogoMark, Spinner } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";

export function OpenRecoveryLink({ code }: { code: string }) {
  const [error, setError] = useState("");
  useEffect(() => {
    api<{ slug: string; ref: string }>(`/public/links/${encodeURIComponent(code)}`)
      .then((r) => window.location.replace(`/r/${encodeURIComponent(r.slug)}?mc=${encodeURIComponent(r.ref)}`))
      .catch((e) => setError(errorMessage(e)));
  }, [code]);
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-4 px-5 text-center">
      <LogoMark className="h-10 w-10" />
      {error ? <Alert>{error}</Alert> : <Spinner label="Ouverture de la page de réservation…" />}
    </main>
  );
}
