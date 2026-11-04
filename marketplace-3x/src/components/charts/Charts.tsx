"use client";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Point = { label: string; value: number };
const fmt = (money: boolean) => (v: number) => money ? new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v / 100) : String(v);

export function TrendChart({ data, money = true, height = 220 }: { data: Point[]; money?: boolean; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs><linearGradient id="fillTrend" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--accent, var(--brand))" stopOpacity={0.25} /><stop offset="100%" stopColor="var(--accent, var(--brand))" stopOpacity={0} /></linearGradient></defs>
        <CartesianGrid vertical={false} stroke="var(--line)" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} stroke="var(--ink-3)" minTickGap={16} />
        <YAxis tickLine={false} axisLine={false} fontSize={11} stroke="var(--ink-3)" tickFormatter={fmt(money)} width={56} />
        <Tooltip formatter={(v) => [fmt(money)(Number(v)), money ? "Montant" : "Nombre"]} contentStyle={{ borderRadius: 12, border: "1px solid var(--line)", fontSize: 12 }} />
        <Area type="monotone" dataKey="value" stroke="var(--accent, var(--brand))" strokeWidth={2} fill="url(#fillTrend)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function BarsChart({ data, money = true, height = 220 }: { data: Point[]; money?: boolean; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--line)" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} stroke="var(--ink-3)" interval={0} />
        <YAxis tickLine={false} axisLine={false} fontSize={11} stroke="var(--ink-3)" tickFormatter={fmt(money)} width={56} />
        <Tooltip formatter={(v) => [fmt(money)(Number(v)), money ? "Montant" : "Nombre"]} contentStyle={{ borderRadius: 12, border: "1px solid var(--line)", fontSize: 12 }} cursor={{ fill: "rgba(0,0,0,.03)" }} />
        <Bar dataKey="value" fill="var(--accent, var(--brand))" radius={[6, 6, 0, 0]} maxBarSize={36} />
      </BarChart>
    </ResponsiveContainer>
  );
}
