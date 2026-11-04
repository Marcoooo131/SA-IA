import Link from "next/link";
import { ArrowRight, BadgeCheck, Briefcase, Building2, Handshake, Link2, Search, ShieldCheck, User, Wallet } from "lucide-react";
import { db } from "@/server/db";
import { publicProductInclude, publicVisibilityWhere, recommendationsFor } from "@/server/services/catalog";
import { getActor } from "@/server/auth/session";
import { getCommerceSettings } from "@/server/settings";
import { ProductGrid } from "@/components/product/ProductCard";
import { CategoryIcon } from "@/components/product/CategoryIcon";
import { ButtonLink, Container } from "@/components/ui";
import { brand } from "@/config/brand";
import { formatBps, formatEUR } from "@/lib/money";

export const dynamic = "force-dynamic";

function Section({ title, href, children, subtitle }: { title: string; href?: string; children: React.ReactNode; subtitle?: string }) {
  return (
    <section className="mt-14">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div><h2 className="text-xl font-semibold md:text-2xl">{title}</h2>{subtitle && <p className="mt-1 text-sm text-ink-3">{subtitle}</p>}</div>
        {href && <Link href={href} className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-ink-2 hover:text-ink">Tout voir <ArrowRight className="h-4 w-4" /></Link>}
      </div>
      {children}
    </section>
  );
}

export default async function Home() {
  const vis = await publicVisibilityWhere();
  const actor = await getActor();
  const settings = await getCommerceSettings();
  const take = 8;
  const [categories, latest, popular, isNew, used, supplier, delegated, recos, stats] = await Promise.all([
    db.category.findMany({ where: { parentId: null, restricted: false }, orderBy: { position: "asc" } }),
    db.product.findMany({ where: vis, include: publicProductInclude, orderBy: { publishedAt: "desc" }, take }),
    db.product.findMany({ where: vis, include: publicProductInclude, orderBy: { viewCount: "desc" }, take }),
    db.product.findMany({ where: { AND: [vis, { condition: "NEW", sellerKind: "INDIVIDUAL" }] }, include: publicProductInclude, orderBy: { publishedAt: "desc" }, take: 4 }),
    db.product.findMany({ where: { AND: [vis, { condition: { not: "NEW" } }] }, include: publicProductInclude, orderBy: { publishedAt: "desc" }, take }),
    db.product.findMany({ where: { AND: [vis, { sellerKind: "SUPPLIER" }] }, include: publicProductInclude, orderBy: { publishedAt: "desc" }, take }),
    db.product.findMany({ where: { AND: [vis, { contract: { status: "ACTIVE" } }] }, include: publicProductInclude, orderBy: { publishedAt: "desc" }, take: 4 }),
    actor ? recommendationsFor(actor.id, 4) : Promise.resolve([]),
    Promise.all([db.product.count({ where: { status: "ACTIVE" } }), db.professionalProfile.count({ where: { verificationStatus: "VERIFIED" } }), db.supplierProfile.count({ where: { verificationStatus: "VERIFIED" } })]),
  ]);

  return (
    <>
      {/* Héros */}
      <section className="relative overflow-hidden border-b border-line bg-white">
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-[var(--space-individual)] opacity-[.12] blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 right-40 h-96 w-96 rounded-full bg-[var(--space-pro)] opacity-[.10] blur-3xl" />
        <div className="pointer-events-none absolute -left-24 top-10 h-80 w-80 rounded-full bg-[var(--space-supplier)] opacity-[.10] blur-3xl" />
        <Container className="relative py-14 md:py-20">
          <div className="max-w-3xl">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-line bg-white px-3 py-1 text-xs font-medium text-ink-2">
              <span className="h-1.5 w-1.5 rounded-full bg-success" /> Particuliers · Indépendants · Fournisseurs
            </p>
            <h1 className="text-4xl font-semibold leading-[1.05] md:text-6xl">
              Achetez, vendez,<br />et <span className="bg-gradient-to-r from-[var(--space-individual)] via-[var(--space-pro)] to-[var(--space-supplier)] bg-clip-text text-transparent">vendez ensemble.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-ink-2">
              {brand.name} réunit sur une seule plateforme ceux qui ont des produits à vendre et ceux qui savent les vendre.
              Confiez vos ventes à un indépendant, devenez commercial, ou ouvrez votre catalogue à un réseau de vendeurs.
            </p>
            <form action="/recherche" className="mt-8 flex max-w-2xl items-center gap-2 rounded-full border border-line bg-white p-1.5 shadow-lg shadow-black/5" role="search">
              <Search className="ml-3 h-5 w-5 text-ink-3" />
              <input name="q" placeholder="iPhone, vélo, canapé, aspirateur pro…" aria-label="Rechercher" className="h-11 flex-1 bg-transparent text-base outline-none" />
              <button className="h-11 rounded-full bg-ink px-6 text-sm font-medium text-white hover:bg-black">Rechercher</button>
            </form>
            <div className="mt-6 flex flex-wrap gap-2 text-sm text-ink-3">
              <span>{stats[0]} annonces en ligne</span><span>·</span><span>{stats[1]} indépendants vérifiés</span><span>·</span><span>{stats[2]} fournisseurs</span>
            </div>
          </div>
        </Container>
      </section>

      <Container>
        {/* Catégories */}
        <section className="mt-10">
          <div className="scrollbar-none -mx-4 flex gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-6 md:px-0 lg:grid-cols-11">
            {categories.map((c) => (
              <Link key={c.id} href={`/recherche?category=${c.slug}`} className="group flex min-w-24 flex-col items-center gap-2 rounded-2xl border border-line bg-white px-2 py-4 text-center transition hover:-translate-y-0.5 hover:shadow-md">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-canvas text-ink-2 transition group-hover:bg-brand-soft group-hover:text-brand"><CategoryIcon name={c.icon} className="h-5 w-5" /></span>
                <span className="text-xs font-medium leading-tight">{c.name.split(" & ")[0]}</span>
              </Link>
            ))}
          </div>
        </section>

        {recos.length > 0 && <Section title="Sélectionné pour vous" subtitle="D'après vos favoris"><ProductGrid products={recos} /></Section>}
        <Section title="Dernières annonces" href="/recherche?sort=recent"><ProductGrid products={latest} /></Section>

        {/* Trois profils */}
        <section className="mt-16 grid gap-4 md:grid-cols-3">
          {[
            { icon: User, color: "var(--space-individual)", title: "Particuliers", text: "Vendez vos articles vous-même, ou confiez-les à un indépendant qui s'occupe des photos, de l'annonce et de la négociation. Vous gardez la main sur les prix.", cta: "Confier mes ventes", href: "/espace/delegation" },
            { icon: Briefcase, color: "var(--space-pro)", title: "Indépendants", text: "Commercialisez les produits des particuliers et des fournisseurs. Chaque vente vous rapporte une commission, suivie en temps réel.", cta: "Devenir indépendant", href: "/inscription?role=PROFESSIONAL" },
            { icon: Building2, color: "var(--space-supplier)", title: "Fournisseurs", text: "Publiez votre catalogue et définissez une commission par produit : un réseau de commerciaux indépendants le diffuse pour vous.", cta: "Ouvrir mon catalogue", href: "/inscription?role=SUPPLIER" },
          ].map((b) => (
            <div key={b.title} className="relative overflow-hidden rounded-3xl border border-line bg-white p-6">
              <div className="absolute inset-x-0 top-0 h-1" style={{ background: b.color }} />
              <b.icon className="h-7 w-7" style={{ color: b.color }} />
              <h3 className="mt-4 text-lg font-semibold">{b.title}</h3>
              <p className="mt-2 text-sm text-ink-2">{b.text}</p>
              <Link href={b.href} className="mt-5 inline-flex items-center gap-1 text-sm font-semibold" style={{ color: b.color }}>{b.cta}<ArrowRight className="h-4 w-4" /></Link>
            </div>
          ))}
        </section>

        <Section title="Les plus consultés" href="/recherche?sort=popular"><ProductGrid products={popular} /></Section>
        {supplier.length > 0 && <Section title="Offres des fournisseurs" subtitle="Produits neufs, garantis, expédiés par des entreprises vérifiées" href="/recherche?seller=supplier"><ProductGrid products={supplier} /></Section>}
        {delegated.length > 0 && <Section title="Vendus par nos indépendants" subtitle="Annonces préparées et suivies par un professionnel" href="/recherche?seller=professional"><ProductGrid products={delegated} /></Section>}
        <Section title="Seconde main" href="/recherche?state=used"><ProductGrid products={used} /></Section>
        {isNew.length > 0 && <Section title="Neuf, entre particuliers" href="/recherche?state=new"><ProductGrid products={isNew} /></Section>}

        {/* Comment ça marche */}
        <section className="mt-20 rounded-[28px] bg-ink px-6 py-12 text-white md:px-12">
          <h2 className="text-2xl font-semibold md:text-3xl">Une vente, plusieurs gagnants — en toute transparence</h2>
          <p className="mt-2 max-w-2xl text-white/70">Le paiement est sécurisé par un prestataire agréé. Personne n'est payé avant que l'acheteur ait reçu son article.</p>
          <div className="mt-8 grid gap-6 md:grid-cols-4">
            {[
              { icon: Search, t: "1. L'acheteur commande", d: "Il paie en ligne ; les fonds sont conservés par le prestataire de paiement." },
              { icon: Handshake, t: "2. Le vendeur expédie", d: "Le particulier, l'indépendant ou le fournisseur prépare et envoie le colis." },
              { icon: ShieldCheck, t: "3. Réception validée", d: "L'acheteur confirme la réception ; le délai de rétractation court." },
              { icon: Wallet, t: "4. Chacun est payé", d: "Vendeur, indépendant et plateforme reçoivent leur part, calculée automatiquement." },
            ].map((s) => (
              <div key={s.t}><s.icon className="h-6 w-6 text-[var(--space-individual)]" /><p className="mt-3 font-semibold">{s.t}</p><p className="mt-1 text-sm text-white/65">{s.d}</p></div>
            ))}
          </div>
          <div className="mt-10 grid gap-4 rounded-2xl bg-white/5 p-5 text-sm md:grid-cols-3">
            <div><p className="text-white/60">Vente entre particuliers</p><p className="mt-1 font-medium">Frais de service : {formatBps(settings.p2pFeeBps)} + {formatEUR(settings.p2pFeeFixedCents)}</p></div>
            <div><p className="text-white/60">Vente confiée à un indépendant</p><p className="mt-1 font-medium">Commission négociée ({formatBps(settings.delegationCommissionMinBps)} à {formatBps(settings.delegationCommissionMaxBps)})</p></div>
            <div><p className="text-white/60">Frais plateforme sur commission</p><p className="mt-1 font-medium">{formatBps(settings.commissionPlatformFeeBps)} (min. {formatEUR(settings.commissionPlatformFeeMinCents)})</p></div>
          </div>
          <ButtonLink href="/comment-ca-marche" variant="secondary" className="mt-8">Tout comprendre</ButtonLink>
        </section>

        {/* Espaces dédiés */}
        <section className="mt-16 grid gap-4 md:grid-cols-2">
          <div className="rounded-3xl border border-line bg-gradient-to-br from-[var(--brand-soft)] to-white p-8">
            <Handshake className="h-8 w-8 text-brand" />
            <h3 className="mt-4 text-2xl font-semibold">Pas le temps de vendre ?</h3>
            <p className="mt-2 text-ink-2">Publiez vos articles, choisissez un indépendant vérifié dans l&apos;annuaire, ou laissez-les vous faire une proposition. Vous validez les prix, il s&apos;occupe du reste.</p>
            <div className="mt-6 flex flex-wrap gap-2"><ButtonLink href="/espace/delegation">Confier mes ventes</ButtonLink><ButtonLink href="/independants" variant="secondary">Voir l&apos;annuaire</ButtonLink></div>
          </div>
          <div className="rounded-3xl border border-line bg-gradient-to-br from-[color-mix(in_srgb,var(--space-pro)_10%,white)] to-white p-8">
            <Link2 className="h-8 w-8 text-pro" />
            <h3 className="mt-4 text-2xl font-semibold">Générez des revenus en recommandant</h3>
            <p className="mt-2 text-ink-2">Sélectionnez des produits fournisseurs, partagez votre lien personnel par SMS, e-mail ou réseaux sociaux : chaque vente qui en découle vous est attribuée.</p>
            <div className="mt-6 flex flex-wrap gap-2"><ButtonLink href="/inscription?role=PROFESSIONAL" variant="accent" className="accent-pro">Devenir indépendant</ButtonLink><ButtonLink href="/inscription?role=SUPPLIER" variant="secondary"><BadgeCheck className="h-4 w-4" />Je suis fournisseur</ButtonLink></div>
          </div>
        </section>
      </Container>
    </>
  );
}
