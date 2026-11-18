import { PageHero } from "@/components/site/SiteChrome";
import { Alert } from "@/components/ui";

// Version statique (GitHub Pages) : la démonstration interactive a besoin de l'API en ligne.
export default function DemoPage() {
  return (
    <>
      <PageHero eyebrow="Démonstration" title="De l'appel manqué au rendez-vous, en deux minutes." />
      <div className="mx-auto max-w-3xl px-5 pb-24">
        <Alert kind="info">La démonstration interactive est disponible sur la version en ligne : <a href="https://venio-rdv.netlify.app/demo">venio-rdv.netlify.app/demo</a>.</Alert>
      </div>
    </>
  );
}
