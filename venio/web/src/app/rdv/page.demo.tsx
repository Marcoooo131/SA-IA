"use client";
// Démonstration statique : /rdv/?slug=…&token=…
import { useEffect, useState } from "react";
import { ManageBooking } from "@/components/ManageBooking";

export default function Page() {
  const [p, setP] = useState<{ slug: string; token: string } | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setP({ slug: q.get("slug") ?? "", token: q.get("token") ?? "" });
  }, []);
  return p ? <ManageBooking slug={p.slug} token={p.token} /> : null;
}
