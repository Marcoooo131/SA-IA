import Link from "next/link";
import { Badge } from "@/components/ui";
import { caseFilePath } from "@/lib/routes";
import { BOOKING_STATUS, fmtDateTime, fmtTime } from "@/lib/format";

export type Row = { id: string; starts_at: string; status: string; case_file_id: string | null; service_name: string; first_name: string | null; last_name: string | null; phone: string | null; summary?: string | null; resource_name: string };

export function BookingRow({ b, tz, timeOnly }: { b: Row; tz: string; timeOnly?: boolean }) {
  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-medium first-letter:uppercase">{timeOnly ? fmtTime(b.starts_at, tz) : fmtDateTime(b.starts_at, tz)} · {b.first_name} {b.last_name}</p>
        <p className="truncate text-xs text-ink-muted">{b.service_name} · {b.resource_name}{b.phone && ` · ${b.phone}`}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {b.status !== "confirmed" && <Badge>{BOOKING_STATUS[b.status]}</Badge>}
        {b.case_file_id && <Link className="text-xs underline" href={caseFilePath(b.case_file_id)}>Dossier</Link>}
      </div>
    </li>
  );
}
