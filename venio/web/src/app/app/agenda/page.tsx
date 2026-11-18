"use client";
import { useEffect, useState } from "react";
import { useMe } from "@/components/AppShell";
import { BookingRow, type Row } from "@/components/BookingRow";
import { Alert, Button, Card, Spinner } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { addDays, fmtDayLabel, todayIso } from "@/lib/format";

function monday(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  return addDays(iso, -((d.getDay() + 6) % 7));
}

export default function AgendaPage() {
  const me = useMe();
  const [from, setFrom] = useState(monday(todayIso()));
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState("");
  const to = addDays(from, 6);

  useEffect(() => {
    setRows(null);
    api<Row[]>(`/bookings?from=${from}&to=${to}`).then(setRows).catch((e) => setError(errorMessage(e)));
  }, [from, to]);

  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  const dayOf = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: me.tenant.timezone }).format(new Date(iso));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Agenda</h1>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setFrom(addDays(from, -7))}>←</Button>
          <Button variant="secondary" onClick={() => setFrom(monday(todayIso()))}>Cette semaine</Button>
          <Button variant="secondary" onClick={() => setFrom(addDays(from, 7))}>→</Button>
        </div>
      </div>
      {error && <Alert>{error}</Alert>}
      {!rows ? <Spinner /> : (
        <div className="space-y-3">
          {days.map((day) => {
            const items = rows.filter((r) => dayOf(r.starts_at) === day);
            const l = fmtDayLabel(day);
            return (
              <Card key={day} className="py-3">
                <h2 className="text-sm font-semibold capitalize">{l.weekday} {l.day} {l.month}{day === todayIso() && " · aujourd'hui"}</h2>
                {items.length === 0 ? <p className="py-1 text-sm text-ink-muted">—</p> :
                  <ul className="divide-y divide-line">{items.map((b) => <BookingRow key={b.id} b={b} tz={me.tenant.timezone} timeOnly />)}</ul>}
              </Card>
            );
          })}
        </div>
      )}
      <p className="text-xs text-ink-muted">Pour bloquer une période (chantier, congés), rendez-vous dans Paramètres → Absences.</p>
    </div>
  );
}
