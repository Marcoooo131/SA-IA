"use client";
import { CalendarDays, CreditCard, ExternalLink, Inbox, LayoutDashboard, LogOut, PhoneMissed, RotateCcw, Send, Settings, Workflow } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import { Alert, Logo, Spinner, ToastProvider, cx } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { DEMO, publicPagePath, withBase } from "@/lib/routes";

export type Me = {
  user: { id: string; email: string; full_name: string };
  role: "owner" | "admin" | "member";
  tenant: { id: string; slug: string; name: string; vertical: string; timezone: string };
  subscription: { status: string; trial_ends_at: string | null; plan_name: string } | null;
  access?: { state: string; public_blocked: boolean; days_left: number | null; grace_ends_at: string | null };
  public_url: string;
};

const MeContext = createContext<Me | null>(null);
export const useMe = () => useContext(MeContext)!;

// Seules les rubriques réellement disponibles apparaissent (pas d'entrée vers un écran inexistant).
const NAV = [
  { href: "/app", label: "Tableau de bord", Icon: LayoutDashboard },
  { href: "/app/dossiers", label: "Demandes", Icon: Inbox },
  { href: "/app/appels", label: "Appels manqués", Icon: PhoneMissed },
  { href: "/app/agenda", label: "Agenda", Icon: CalendarDays },
  { href: "/app/parcours", label: "Parcours", Icon: Workflow },
  { href: "/app/envois", label: "Envois", Icon: Send },
  { href: "/app/parametres", label: "Paramètres", Icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const router = useRouter();
  const path = usePathname();

  useEffect(() => {
    api<Me>("/auth/me").then(setMe).catch((e) => {
      if (e instanceof ApiError && e.status === 401) router.replace("/connexion");
    });
  }, [router]);

  if (!me) return <div className="flex min-h-dvh items-center justify-center text-ink-muted"><Spinner label="Chargement de votre espace…" /></div>;
  const trialDays = me.subscription?.status === "trialing" && me.subscription.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(me.subscription.trial_ends_at).getTime() - Date.now()) / 86400000)) : null;
  const linkClass = "flex items-center gap-2 rounded-control px-2.5 py-1.5 text-sm text-ink-muted hover:bg-sunken hover:text-ink";

  return (
    <MeContext.Provider value={me}>
      <ToastProvider>
        <div className="min-h-dvh md:grid md:grid-cols-[232px_1fr]">
          <aside className="border-b border-line bg-surface md:sticky md:top-0 md:flex md:h-dvh md:flex-col md:border-b-0 md:border-r">
            <div className="px-4 pt-4 pb-3"><Link href="/app" aria-label="Venio, tableau de bord"><Logo /></Link></div>
            <div className="mx-3 mb-3 rounded-control border border-line px-2.5 py-2">
              <p className="truncate text-sm font-medium text-ink">{me.tenant.name}</p>
              <p className="truncate text-xs text-ink-subtle">{me.subscription?.plan_name ?? "Espace entreprise"}{trialDays !== null && ` · essai : ${trialDays} j`}</p>
            </div>
            <nav aria-label="Navigation principale" className="flex gap-1 overflow-x-auto px-3 pb-2 md:flex-col md:pb-0">
              {NAV.map(({ href, label, Icon }) => {
                const active = href === "/app" ? path === "/app" || path === "/app/" : path.startsWith(href);
                return (
                  <Link key={href} href={href} aria-current={active ? "page" : undefined}
                    className={cx("flex items-center gap-2.5 whitespace-nowrap rounded-control px-2.5 py-2 text-sm font-medium transition-colors",
                      active ? "bg-ink text-white" : "text-ink-muted hover:bg-sunken hover:text-ink")}>
                    <Icon aria-hidden className="h-4 w-4 shrink-0" strokeWidth={1.75} />{label}
                  </Link>
                );
              })}
            </nav>
            <div className="mt-auto hidden space-y-0.5 border-t border-line p-3 md:block">
              <Link href="/app/abonnement" className={cx(linkClass, path.startsWith("/app/abonnement") && "bg-sunken text-ink")}>
                <CreditCard aria-hidden className="h-4 w-4" strokeWidth={1.75} />Abonnement
              </Link>
              <a href={withBase(publicPagePath(me.tenant.slug))} target="_blank" rel="noreferrer" className={linkClass}>
                <ExternalLink aria-hidden className="h-4 w-4" strokeWidth={1.75} />Ma page de réservation
              </a>
              {DEMO && (
                <button type="button" className={cx(linkClass, "w-full")} onClick={async () => {
                  if (confirm("Effacer toutes les données de démonstration de ce navigateur ?")) { const { resetDemo } = await import("@/lib/demo/server"); resetDemo(); router.replace("/"); }
                }}><RotateCcw aria-hidden className="h-4 w-4" strokeWidth={1.75} />Réinitialiser la démo</button>
              )}
              <button type="button" className={cx(linkClass, "w-full")} onClick={async () => { await api("/auth/logout", { method: "POST" }); router.replace("/connexion"); }}>
                <LogOut aria-hidden className="h-4 w-4" strokeWidth={1.75} />Se déconnecter
              </button>
              <p className="truncate px-2.5 pt-2 text-xs text-ink-subtle">{me.user.email}</p>
            </div>
          </aside>
          <main className="min-w-0 px-4 py-6 md:px-10 md:py-8">
            <div className="mx-auto max-w-6xl">
              <AccessBanner me={me} />
              {children}
            </div>
          </main>
        </div>
      </ToastProvider>
    </MeContext.Provider>
  );
}

/** Bandeau d'état de l'abonnement : discret pendant l'essai, explicite quand les réservations sont menacées. */
function AccessBanner({ me }: { me: Me }) {
  const a = me.access;
  const path = usePathname();
  if (!a || path.startsWith("/app/abonnement")) return null;
  const link = <Link href="/app/abonnement" className="font-semibold underline underline-offset-2">Voir l&apos;abonnement</Link>;
  let kind: "info" | "warning" | "error" | null = null;
  let text: React.ReactNode = null;
  if (a.state === "trial" && a.days_left !== null && a.days_left <= 5) {
    kind = "info"; text = <>Votre essai gratuit se termine dans {a.days_left} jour(s). Choisissez une offre pour que votre page continue d&apos;accepter des réservations. {link}</>;
  } else if (a.state === "trial_expired") {
    kind = "error"; text = <>Votre essai est terminé : votre page n&apos;accepte plus de nouvelles réservations. Vos données sont conservées. {link}</>;
  } else if (a.state === "past_due") {
    kind = "warning"; text = <>Le dernier paiement a échoué. Mettez à jour votre carte pour éviter la suspension des réservations. {link}</>;
  } else if (a.state === "restricted" || a.state === "canceled") {
    kind = "error"; text = <>Les nouvelles réservations sont suspendues ({a.state === "canceled" ? "abonnement résilié" : "impayé"}). Les rendez-vous confirmés sont maintenus. {link}</>;
  }
  if (!kind) return null;
  return <div className="mb-6"><Alert kind={kind}>{text}</Alert></div>;
}
