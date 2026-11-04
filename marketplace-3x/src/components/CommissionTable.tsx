import Link from "next/link";
import type { CommissionKind, CommissionStatus } from "@prisma/client";
import { Badge, EmptyState, Table, Td, Th } from "@/components/ui";
import { commissionKindLabel, commissionStatusLabel } from "@/lib/labels";
import { formatEUR } from "@/lib/money";
import { formatDate } from "@/lib/format";

export const commissionTone: Record<CommissionStatus, "neutral" | "success" | "warning" | "danger" | "info"> = {
  PENDING: "neutral", VALIDATING: "info", VALIDATED: "warning", AVAILABLE: "success", PAID: "success", CANCELLED: "neutral", DISPUTED: "danger",
};

type Row = { id: string; kind: CommissionKind; status: CommissionStatus; amountCents: number; createdAt: Date; availableAt: Date | null; orderItem: { title: string; order: { id: string; number: string } } };

export function CommissionTable({ rows }: { rows: Row[] }) {
  if (!rows.length) return <EmptyState title="Aucun mouvement pour le moment" />;
  return (
    <Table>
      <thead><tr><Th>Date</Th><Th>Commande</Th><Th>Type</Th><Th>Statut</Th><Th>Disponible le</Th><Th className="text-right">Montant</Th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <Td className="whitespace-nowrap text-ink-3">{formatDate(r.createdAt)}</Td>
            <Td><Link href={`/commandes/${r.orderItem.order.id}`} className="hover:underline">{r.orderItem.order.number}</Link><p className="max-w-56 truncate text-xs text-ink-3">{r.orderItem.title}</p></Td>
            <Td>{commissionKindLabel[r.kind]}</Td>
            <Td><Badge tone={commissionTone[r.status]}>{commissionStatusLabel[r.status]}</Badge></Td>
            <Td className="text-ink-3">{r.availableAt ? formatDate(r.availableAt) : "—"}</Td>
            <Td className="text-right font-semibold">{formatEUR(r.amountCents)}</Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
