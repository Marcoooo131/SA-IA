import { ButtonLink, Container } from "@/components/ui";
export default function NotFound() {
  return <Container className="py-24 text-center"><p className="text-6xl font-semibold">404</p><p className="mt-3 text-ink-2">Cette page n&apos;existe pas ou n&apos;est plus disponible.</p><ButtonLink href="/" className="mt-6">Retour à l&apos;accueil</ButtonLink></Container>;
}
