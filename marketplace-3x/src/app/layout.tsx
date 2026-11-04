import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import "./globals.css";
import { brand } from "@/config/brand";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { CookieBanner } from "@/components/layout/CookieBanner";
import { Flash } from "@/components/ui/Flash";
import { DemoBanner } from "@/components/layout/DemoBanner";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
  title: { default: `${brand.name} — ${brand.tagline}`, template: `%s · ${brand.name}` },
  description: brand.description,
  openGraph: { siteName: brand.name, locale: "fr_FR", type: "website" },
  icons: { icon: "/icon.svg" },
};
export const viewport: Viewport = { themeColor: "#ffffff", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-screen">
        <a href="#contenu" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2">Aller au contenu</a>
        <DemoBanner />
        <Header />
        <main id="contenu" className="min-h-[60vh]">{children}</main>
        <Footer />
        <CookieBanner />
        <Suspense><Flash /></Suspense>
      </body>
    </html>
  );
}
