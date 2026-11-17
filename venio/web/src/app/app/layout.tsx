import { AppShell } from "@/components/AppShell";

export const metadata = { title: "Espace entreprise" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
