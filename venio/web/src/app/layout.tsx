import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Venio — Des rendez-vous qualifiés, 24 h/24", template: "%s · Venio" },
  description: "Vos clients décrivent leur besoin et réservent en ligne. Vous arrivez préparé.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#14213d" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
