"use client";
import { Button, Container } from "@/components/ui";
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return <Container className="py-24 text-center"><p className="text-2xl font-semibold">Une erreur est survenue</p><p className="mt-2 text-ink-2">L&apos;incident a été enregistré. Réessayez dans un instant.</p><Button onClick={reset} className="mt-6">Réessayer</Button></Container>;
}
