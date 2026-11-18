import { PageHero } from "@/components/site/SiteChrome";
import { Alert } from "@/components/ui";

export default function PricingPage() {
  return (
    <>
      <PageHero eyebrow="Tarifs" title="Un prix simple, par entreprise." />
      <div className="mx-auto max-w-3xl px-5 pb-24">
        <Alert kind="info">Les tarifs à jour sont sur la version en ligne : <a href="https://venio-rdv.netlify.app/tarifs">venio-rdv.netlify.app/tarifs</a>.</Alert>
      </div>
    </>
  );
}
