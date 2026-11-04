import Link from "next/link";
import { requireRole } from "@/server/auth/session";
import { listUsers } from "@/server/services/admin";
import { Badge, Button, Input, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { ActionButton } from "@/components/ui/Form";
import { userStatusAction, verifyAction } from "@/app/actions/admin";
import { roleLabel, verificationLabel } from "@/lib/labels";
import { formatDate } from "@/lib/format";
import type { Role } from "@prisma/client";

export default async function Users({ searchParams }: { searchParams: Promise<{ q?: string; role?: string; status?: string; verification?: string; page?: string }> }) {
  const actor = await requireRole("ADMIN");
  const sp = await searchParams;
  const { users, total } = await listUsers(actor, { q: sp.q, role: (sp.role || undefined) as Role | undefined, status: sp.status || undefined, verification: sp.verification || undefined, page: Number(sp.page || 1) });
  return (
    <>
      <PageHeader title="Utilisateurs" subtitle={`${total} compte(s)`} />
      <form className="mb-4 grid gap-2 md:grid-cols-5">
        <Input name="q" placeholder="Nom ou e-mail" defaultValue={sp.q} />
        <Select name="role" defaultValue={sp.role ?? ""}><option value="">Tous profils</option>{(["INDIVIDUAL", "PROFESSIONAL", "SUPPLIER", "ADMIN"] as const).map((r) => <option key={r} value={r}>{roleLabel[r]}</option>)}</Select>
        <Select name="status" defaultValue={sp.status ?? ""}><option value="">Tous statuts</option><option value="ACTIVE">Actif</option><option value="SUSPENDED">Suspendu</option><option value="DELETED">Supprimé</option></Select>
        <Select name="verification" defaultValue={sp.verification ?? ""}><option value="">Toute vérification</option><option value="PENDING">À vérifier</option><option value="VERIFIED">Vérifié</option><option value="UNVERIFIED">Non vérifié</option><option value="REJECTED">Refusé</option></Select>
        <Button variant="dark">Filtrer</Button>
      </form>
      <div className="rounded-[var(--radius)] border border-line bg-white"><Table>
        <thead><tr><Th>Utilisateur</Th><Th>Profil</Th><Th>Vérification</Th><Th>Statut</Th><Th>Inscrit le</Th><Th /></tr></thead>
        <tbody>{users.map((u) => {
          const v = u.professionalProfile?.verificationStatus ?? u.supplierProfile?.verificationStatus;
          const kind = u.professionalProfile ? "PROFESSIONAL" : "SUPPLIER";
          return (
            <tr key={u.id}>
              <Td><Link href={`/admin/utilisateurs/${u.id}`} className="font-medium hover:underline">{u.supplierProfile?.companyName ?? u.displayName}</Link><p className="text-xs text-ink-3">{u.email}{u.isDemo && " · démo"}</p></Td>
              <Td>{roleLabel[u.primaryRole]}</Td>
              <Td>{v ? <Badge tone={v === "VERIFIED" ? "success" : v === "PENDING" ? "warning" : "neutral"}>{verificationLabel[v]}</Badge> : "—"}{(u.professionalProfile?.siret ?? u.supplierProfile?.siret) && <p className="text-xs text-ink-3">SIRET {u.professionalProfile?.siret ?? u.supplierProfile?.siret}</p>}</Td>
              <Td><Badge tone={u.status === "ACTIVE" ? "success" : "danger"}>{{ ACTIVE: "Actif", SUSPENDED: "Suspendu", DELETED: "Supprimé" }[u.status]}</Badge></Td>
              <Td className="text-ink-3">{formatDate(u.createdAt)}</Td>
              <Td><div className="flex flex-wrap justify-end gap-1.5">
                {v && v !== "VERIFIED" && <ActionButton action={verifyAction} fields={{ userId: u.id, kind, status: "VERIFIED" }} variant="accent">Vérifier</ActionButton>}
                {v === "PENDING" && <ActionButton action={verifyAction} fields={{ userId: u.id, kind, status: "REJECTED", note: "Justificatifs insuffisants" }}>Refuser</ActionButton>}
                {u.status === "ACTIVE" ? <ActionButton action={userStatusAction} fields={{ userId: u.id, status: "SUSPENDED" }} variant="danger" confirm="Suspendre ce compte ? Ses sessions et annonces seront désactivées.">Suspendre</ActionButton>
                  : u.status === "SUSPENDED" && <ActionButton action={userStatusAction} fields={{ userId: u.id, status: "ACTIVE" }}>Réactiver</ActionButton>}
              </div></Td>
            </tr>);
        })}</tbody>
      </Table></div>
    </>
  );
}
