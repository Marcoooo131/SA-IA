import type { Metadata, Viewport } from "next";
// Polices auto-hébergées (fichiers servis par notre site, aucun appel à un serveur tiers).
import "@fontsource-variable/inter";
import "@fontsource-variable/fraunces/opsz.css";
import "@fontsource/jetbrains-mono/400.css";
import "./globals.css";
import { DEMO } from "@/lib/routes";

export const metadata: Metadata = {
  title: { default: "Venio — Chaque appel, chaque visite, une opportunité de rendez-vous", template: "%s · Venio" },
  description: "Vos clients décrivent leur besoin et réservent en ligne, même quand vous ne pouvez pas décrocher. Vous arrivez préparé.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#14213d" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-dvh">
        {DEMO && (
          <div role="note" className="border-b border-signal/40 bg-signal-soft px-4 py-2 text-center text-sm font-medium text-ink">
            Démonstration : données fictives conservées dans ce navigateur, aucun email ni SMS envoyé,
            seul cet appareil peut réserver.
          </div>
        )}
        {children}
      </body>
    </html>
  );
}
