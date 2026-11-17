"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import { Logo, Spinner, cx } from "@/components/ui";
import { ApiError, api } from "@/lib/api";

export type Me = {
  user: { id: string; email: string; full_name: string };
  role: "owner" | "admin" | "member";
  tenant: { id: string; slug: string; name: string; vertical: string; timezone: string };
  subscription: { status: string; trial_ends_at: string | null; plan_name: string } | null;
  public_url: string;
};

const MeContext = createContext<Me | null>(null);
export const useMe = () => useContext(MeContext)!;

const NAV = [
  { href: "/app", label: "Accueil" },
  { href: "/app/dossiers", label: "Demandes" },
  { href: "/app/agenda", label: "Agenda" },
  { href: "/app/parcours", label: "Parcours" },
  { href: "/app/parametres", label: "Paramètres" },
  { href: "/app/envois", label: "Envois" },
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

  if (!me) return <div className="flex min-h-dvh items-center justify-center text-ink-soft"><Spinner /></div>;
  const trialDays = me.subscription?.status === "trialing" && me.subscription.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(me.subscription.trial_ends_at).getTime() - Date.now()) / 86400000)) : null;

  return (
    <MeContext.Provider value={me}>
      <div className="min-h-dvh md:grid md:grid-cols-[220px_1fr]">
        <aside className="border-b border-line bg-white md:min-h-dvh md:border-b-0 md:border-r">
          <div className="flex items-center justify-between px-4 py-4"><Logo /></div>
          <p className="truncate px-4 pb-3 text-sm font-medium">{me.tenant.name}</p>
          <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:pb-0">
            {NAV.map((n) => {
              const active = n.href === "/app" ? path === "/app" : path.startsWith(n.href);
              return <Link key={n.href} href={n.href} className={cx("whitespace-nowrap rounded-lg px-3 py-2 text-sm", active ? "bg-ink text-white" : "hover:bg-ink/5")}>{n.label}</Link>;
            })}
          </nav>
          <div className="hidden space-y-2 px-4 py-6 text-xs text-ink-soft md:block">
            <a href={`/r/${me.tenant.slug}`} target="_blank" className="block underline">Voir ma page publique ↗</a>
            {trialDays !== null && <p>Essai gratuit : {trialDays} jour(s) restant(s)</p>}
            <button className="underline" onClick={async () => { await api("/auth/logout", { method: "POST" }); router.replace("/connexion"); }}>Se déconnecter</button>
          </div>
        </aside>
        <main className="min-w-0 px-4 py-6 md:px-8">{children}</main>
      </div>
    </MeContext.Provider>
  );
}
