"use client";
import { use } from "react";
import { CaseDetail } from "@/components/CaseDetail";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return <CaseDetail id={use(params).id} />;
}
