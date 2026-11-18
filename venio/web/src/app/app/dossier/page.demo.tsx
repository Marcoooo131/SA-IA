"use client";
// Démonstration statique : /app/dossier/?id=…
import { useEffect, useState } from "react";
import { CaseDetail } from "@/components/CaseDetail";

export default function Page() {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => setId(new URLSearchParams(window.location.search).get("id")), []);
  return id ? <CaseDetail id={id} /> : null;
}
