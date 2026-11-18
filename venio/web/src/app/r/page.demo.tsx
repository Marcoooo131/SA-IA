"use client";
// Démonstration statique : /r/?slug=…
import { useEffect, useState } from "react";
import { PublicPage } from "@/components/PublicPage";
import { Alert, Spinner } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import type { PublicPageData } from "@/lib/public";

export default function Page() {
  const [page, setPage] = useState<PublicPageData | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const slug = new URLSearchParams(window.location.search).get("slug") ?? "";
    api<PublicPageData>(`/public/${encodeURIComponent(slug)}`).then((p) => { setPage(p); document.title = `Prendre rendez-vous — ${p.name}`; })
      .catch((e) => setError(errorMessage(e)));
  }, []);
  if (error) return <main className="mx-auto max-w-lg px-5 py-16"><Alert>{error}</Alert></main>;
  return page ? <PublicPage page={page} /> : <div className="flex justify-center py-16"><Spinner /></div>;
}
