"use client";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Spinner, cx } from "@/components/ui";
import { errorMessage } from "@/lib/api";
import { addDays, fmtDayLabel, todayIso } from "@/lib/format";

export type SlotsResponse = {
  from: string; to: string; has_more: boolean;
  days: { date: string; slots: { start: string; time: string }[] }[];
  service: { name: string; duration_min: number; meeting_type: string };
};

const WINDOW = 7;

export function SlotPicker({ load, onPick, busyStart, selected }: {
  load: (from: string, days: number) => Promise<SlotsResponse>;
  onPick: (start: string) => void;
  busyStart?: string | null;
  selected?: string | null;
}) {
  const [from, setFrom] = useState(todayIso());
  const [data, setData] = useState<SlotsResponse | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchWindow = useCallback(async (start: string) => {
    setLoading(true);
    setError("");
    try {
      const res = await load(start, WINDOW);
      setData(res);
      setDay(res.days[0]?.date ?? null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [load]);

  useEffect(() => { fetchWindow(from); }, [from, fetchWindow]);

  const current = data?.days.find((d) => d.date === day);
  const canPrev = from > todayIso();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" disabled={!canPrev || loading} onClick={() => setFrom(addDays(from, -WINDOW))} aria-label="Semaine précédente"><ChevronLeft aria-hidden className="h-4 w-4" /></Button>
        <span className="text-sm text-ink-muted">
          {data ? `${fmtDayLabel(data.from).day} ${fmtDayLabel(data.from).month} – ${fmtDayLabel(data.to).day} ${fmtDayLabel(data.to).month}` : " "}
        </span>
        <Button variant="ghost" disabled={!data?.has_more || loading} onClick={() => setFrom(addDays(from, WINDOW))} aria-label="Semaine suivante"><ChevronRight aria-hidden className="h-4 w-4" /></Button>
      </div>
      {error && <Alert>{error}</Alert>}
      {loading ? (
        <div className="flex justify-center py-10 text-ink-muted"><Spinner /></div>
      ) : data && data.days.length === 0 ? (
        <div className="rounded-card border border-dashed border-line p-6 text-center text-ink-muted">
          Aucun créneau disponible sur cette période.
          {data.has_more && <div className="mt-3"><Button variant="secondary" onClick={() => setFrom(addDays(from, WINDOW))}>Voir la semaine suivante</Button></div>}
        </div>
      ) : (
        <>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist">
            {data?.days.map((d) => {
              const l = fmtDayLabel(d.date);
              return (
                <button key={d.date} role="tab" aria-selected={day === d.date} onClick={() => setDay(d.date)}
                  className={cx("min-w-16 rounded-card border px-3 py-2 text-center transition",
                    day === d.date ? "border-[var(--brand)] bg-[var(--brand)] text-[var(--brand-fg)]" : "border-line bg-surface hover:border-ink/40")}>
                  <span className="block text-xs capitalize opacity-80">{l.weekday}</span>
                  <span className="block text-lg font-semibold leading-tight">{l.day}</span>
                  <span className="block text-xs opacity-80">{l.month}</span>
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {current?.slots.map((s) => (
              <button key={s.start} onClick={() => onPick(s.start)} disabled={!!busyStart}
                className={cx("rounded-control border py-3 text-[15px] font-medium transition disabled:opacity-60",
                  selected === s.start ? "border-[var(--brand)] bg-[var(--brand)] text-[var(--brand-fg)]" : "border-line bg-surface hover:border-[var(--brand)]")}>
                {busyStart === s.start ? <Spinner /> : s.time}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
