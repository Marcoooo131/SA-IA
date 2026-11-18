"use client";
import { use } from "react";
import { ManageBooking } from "@/components/ManageBooking";

export default function Page({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = use(params);
  return <ManageBooking slug={slug} token={token} />;
}
