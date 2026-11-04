import { Armchair, Bike, Blocks, Briefcase, Car, Lamp, Laptop, Package, Shirt, ShieldAlert, Smartphone, Sparkles, type LucideIcon } from "lucide-react";

const icons: Record<string, LucideIcon> = { Armchair, Bike, Blocks, Briefcase, Car, Lamp, Laptop, Package, Shirt, ShieldAlert, Smartphone, Sparkles };
export function CategoryIcon({ name, className }: { name: string; className?: string }) {
  const I = icons[name] ?? Package;
  return <I className={className} />;
}
