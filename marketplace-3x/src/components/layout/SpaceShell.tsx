"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type NavItem = { href: string; label: string; badge?: number };

/** Coque des espaces : navigation latérale aux couleurs de l'espace, identité commune. */
export function SpaceShell({ accent, title, nav, children, notice }: { accent: "individual" | "pro" | "supplier" | "admin"; title: string; nav: NavItem[]; children: ReactNode; notice?: ReactNode }) {
  const path = usePathname();
  const active = (h: string) => path === h || (h.split("/").length > 2 && path.startsWith(h + "/"));
  return (
    <div className={cn(`accent-${accent}`, "mx-auto grid max-w-7xl gap-6 px-4 py-6 md:px-6 lg:grid-cols-[230px_1fr] lg:py-10")}>
      <aside className="lg:sticky lg:top-24 lg:h-fit">
        <div className="mb-3 flex items-center gap-2 px-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--accent)]" />
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-3">{title}</span>
        </div>
        <nav className="scrollbar-none -mx-4 flex gap-1 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:px-0">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className={cn("flex items-center justify-between whitespace-nowrap rounded-xl px-3 py-2 text-sm transition",
              active(n.href) ? "bg-white font-medium text-ink shadow-sm ring-1 ring-line" : "text-ink-2 hover:bg-white/70")}>
              <span className="flex items-center gap-2">{active(n.href) && <span className="hidden h-4 w-1 rounded-full bg-[var(--accent)] lg:block" />}{n.label}</span>
              {!!n.badge && <span className="ml-2 rounded-full bg-[var(--accent)] px-1.5 text-[11px] font-semibold text-white">{n.badge}</span>}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="min-w-0 animate-fade-up">{notice}{children}</div>
    </div>
  );
}
