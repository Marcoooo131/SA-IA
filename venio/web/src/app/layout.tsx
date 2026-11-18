import type { Metadata, Viewport } from "next";
import "./globals.css";
import { DEMO } from "@/lib/routes";

export const metadata: Metadata = {
  title: { default: "Venio — Des rendez-vous qualifiés, 24 h/24", template: "%s · Venio" },
  description: "Vos clients décrivent leur besoin et réservent en ligne. Vous arrivez préparé.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#14213d" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-dvh">
        {DEMO && (
          <div role="note" className="bg-accent px-4 py-2 text-center text-sm font-medium text-ink">
            Version de démonstration : les données restent dans ce navigateur, aucun email n&apos;est envoyé
            et seul cet appareil peut réserver.
          </div>
        )}
        {children}
      </body>
    </html>
  );
}
