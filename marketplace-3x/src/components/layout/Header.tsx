import Link from "next/link";
import { Bell, Heart, MessageCircle, Search, ShoppingBag, Menu } from "lucide-react";
import { getActor } from "@/server/auth/session";
import { Logo } from "@/components/ui/Logo";
import { Avatar, ButtonLink } from "@/components/ui";
import { unreadCount } from "@/server/services/notifications";
import { unreadConversations } from "@/server/services/messaging";
import { cartCount } from "@/server/services/orders";
import { spaces } from "@/config/brand";
import { logoutAction } from "@/app/(auth)/actions";

function IconLink({ href, label, count, children }: { href: string; label: string; count?: number; children: React.ReactNode }) {
  return (
    <Link href={href} aria-label={label} className="relative flex h-10 w-10 items-center justify-center rounded-full text-ink-2 transition hover:bg-black/5 hover:text-ink">
      {children}
      {!!count && <span className="absolute right-1 top-1 min-w-4 rounded-full bg-brand px-1 text-center text-[10px] font-bold leading-4 text-white">{count > 9 ? "9+" : count}</span>}
    </Link>
  );
}

export async function Header() {
  const actor = await getActor();
  const [notifs, msgs, cart] = actor ? await Promise.all([unreadCount(actor.id), unreadConversations(actor.id), cartCount(actor.id)]) : [0, 0, 0];
  const mySpaces = actor ? (["INDIVIDUAL", "PROFESSIONAL", "SUPPLIER", "ADMIN"] as const).filter((r) => actor.roles.includes(r)) : [];
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 md:px-6">
        <Logo />
        <form action="/recherche" className="relative ml-2 hidden flex-1 md:block" role="search">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
          <input name="q" placeholder="Rechercher un article, une marque…" aria-label="Rechercher"
            className="h-10 w-full max-w-xl rounded-full border border-line bg-canvas pl-10 pr-4 text-sm outline-none transition focus:border-brand focus:bg-white" />
        </form>
        <nav className="ml-auto flex items-center gap-1">
          <Link href="/comment-ca-marche" className="hidden rounded-full px-3 py-2 text-sm text-ink-2 hover:bg-black/5 lg:block">Comment ça marche</Link>
          <Link href="/independants" className="hidden rounded-full px-3 py-2 text-sm text-ink-2 hover:bg-black/5 lg:block">Indépendants</Link>
          {actor ? (
            <>
              <IconLink href="/espace/favoris" label="Favoris"><Heart className="h-5 w-5" /></IconLink>
              <IconLink href="/messages" label="Messages" count={msgs}><MessageCircle className="h-5 w-5" /></IconLink>
              <IconLink href="/notifications" label="Notifications" count={notifs}><Bell className="h-5 w-5" /></IconLink>
              <IconLink href="/panier" label="Panier" count={cart}><ShoppingBag className="h-5 w-5" /></IconLink>
              <details className="relative">
                <summary className="flex cursor-pointer list-none items-center gap-2 rounded-full p-1 hover:bg-black/5" aria-label="Menu du compte">
                  <Avatar name={actor.displayName} size={32} />
                </summary>
                <div className="animate-fade-up absolute right-0 mt-2 w-64 overflow-hidden rounded-2xl border border-line bg-white p-2 shadow-xl">
                  <div className="px-3 py-2"><p className="font-medium">{actor.displayName}</p><p className="truncate text-xs text-ink-3">{actor.email}</p></div>
                  <div className="my-1 border-t border-line" />
                  {mySpaces.map((r) => (
                    <Link key={r} href={spaces[r].path} className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm hover:bg-canvas">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: spaces[r].accent }} />Espace {spaces[r].label.toLowerCase()}
                    </Link>
                  ))}
                  <Link href="/compte" className="block rounded-xl px-3 py-2 text-sm hover:bg-canvas">Mon compte</Link>
                  <div className="my-1 border-t border-line" />
                  <form action={logoutAction}><button className="w-full rounded-xl px-3 py-2 text-left text-sm text-ink-2 hover:bg-canvas">Se déconnecter</button></form>
                </div>
              </details>
              <ButtonLink href="/espace/annonces/nouvelle" size="sm" className="ml-1 hidden sm:inline-flex">Vendre</ButtonLink>
            </>
          ) : (
            <>
              <Link href="/connexion" className="rounded-full px-3 py-2 text-sm font-medium text-ink hover:bg-black/5">Connexion</Link>
              <ButtonLink href="/inscription" size="sm">S&apos;inscrire</ButtonLink>
            </>
          )}
          <details className="relative lg:hidden">
            <summary className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-full hover:bg-black/5" aria-label="Menu"><Menu className="h-5 w-5" /></summary>
            <div className="absolute right-0 mt-2 w-56 rounded-2xl border border-line bg-white p-2 shadow-xl">
              {[["/recherche", "Rechercher"], ["/comment-ca-marche", "Comment ça marche"], ["/independants", "Annuaire des indépendants"], ["/espace/annonces/nouvelle", "Vendre un article"]].map(([h, l]) => (
                <Link key={h} href={h} className="block rounded-xl px-3 py-2 text-sm hover:bg-canvas">{l}</Link>
              ))}
            </div>
          </details>
        </nav>
      </div>
    </header>
  );
}
