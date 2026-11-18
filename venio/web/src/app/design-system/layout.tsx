import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Design system",
  description: "Catalogue interne des composants Venio.",
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
