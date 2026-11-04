import Link from "next/link";
import { brand } from "@/config/brand";

/** Logo provisoire : trois cercles entrelacés (particuliers · indépendants · fournisseurs). */
export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="14" cy="15" r="9" fill="var(--space-individual)" opacity=".92" />
      <circle cx="26" cy="15" r="9" fill="var(--space-pro)" opacity=".85" style={{ mixBlendMode: "multiply" }} />
      <circle cx="20" cy="25.5" r="9" fill="var(--space-supplier)" opacity=".85" style={{ mixBlendMode: "multiply" }} />
    </svg>
  );
}

export function Logo({ href = "/" }: { href?: string }) {
  const [main, suffix] = brand.name.split(" ");
  return (
    <Link href={href} className="flex items-center gap-2 font-semibold tracking-tight text-ink" aria-label={`${brand.name} — accueil`}>
      <LogoMark />
      <span className="text-[17px] leading-none">
        {main}<span className="ml-1 rounded-md bg-ink px-1.5 py-0.5 text-[13px] font-bold text-white">{suffix ?? ""}</span>
      </span>
    </Link>
  );
}
