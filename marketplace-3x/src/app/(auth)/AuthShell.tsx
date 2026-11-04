import type { ReactNode } from "react";
import { LogoMark } from "@/components/ui/Logo";

export function AuthShell({ title, subtitle, children, wide }: { title: string; subtitle?: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <div className="px-4 py-12 md:py-16">
      <div className={`mx-auto ${wide ? "max-w-3xl" : "max-w-md"}`}>
        <div className="mb-6 text-center">
          <div className="mb-4 flex justify-center"><LogoMark size={44} /></div>
          <h1 className="text-2xl font-semibold">{title}</h1>
          {subtitle && <p className="mt-2 text-ink-2">{subtitle}</p>}
        </div>
        <div className="rounded-3xl border border-line bg-white p-6 shadow-sm md:p-8">{children}</div>
      </div>
    </div>
  );
}
