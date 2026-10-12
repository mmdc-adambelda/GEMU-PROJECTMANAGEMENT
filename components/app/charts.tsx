"use client";

import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const axis = { fontSize: 11, fill: "var(--muted-foreground)" } as const;
const tip = {
  contentStyle: { background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, color: "var(--popover-foreground)" },
  cursor: { fill: "var(--muted)", opacity: 0.5 },
} as const;

/** Horizontal bars; each bar may carry its own color (e.g. a workflow status color) or share one series color. */
export function HBarChart({
  data, unit = "tasks", color = "var(--series-1)",
}: { data: Array<{ name: string; value: number; color?: string }>; unit?: string; color?: string }) {
  if (data.length === 0) return <p className="py-8 text-center text-sm text-muted-foreground">No data yet.</p>;
  return (
    <div role="img" aria-label={data.map((d) => `${d.name}: ${d.value} ${unit}`).join(", ")}>
      <ResponsiveContainer width="100%" height={Math.max(120, data.length * 30 + 20)}>
        <BarChart data={data} layout="vertical" margin={{ left: 0, right: 16, top: 4, bottom: 4 }} barCategoryGap={6}>
          <CartesianGrid horizontal={false} stroke="var(--chart-grid)" />
          <XAxis type="number" allowDecimals={false} tick={axis} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="name" width={96} tick={axis} axisLine={false} tickLine={false} />
          <Tooltip {...tip} formatter={(v) => [`${v} ${unit}`, ""]} separator="" />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={18}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.color ?? color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function FlowChart({ data }: { data: Array<{ day: string; created: number; completed: number }> }) {
  const rows = data.map((d) => ({ ...d, label: d.day.slice(5) }));
  return (
    <div role="img" aria-label="Tasks created versus completed per day">
      <ResponsiveContainer width="100%" height={230}>
        <LineChart data={rows} margin={{ left: -16, right: 8, top: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} minTickGap={24} />
          <YAxis allowDecimals={false} tick={axis} axisLine={false} tickLine={false} />
          <Tooltip {...tip} />
          <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
          <Line type="monotone" dataKey="created" name="Created" stroke="var(--series-1)" strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }} />
          <Line type="monotone" dataKey="completed" name="Completed" stroke="var(--series-2)" strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BurndownChart({ data }: { data: Array<{ day: string; remaining: number; scope: number }> }) {
  const rows = data.map((d) => ({ ...d, label: d.day.slice(5) }));
  return (
    <div role="img" aria-label="Burndown: remaining tasks versus total scope per day">
      <ResponsiveContainer width="100%" height={230}>
        <LineChart data={rows} margin={{ left: -16, right: 8, top: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} minTickGap={24} />
          <YAxis allowDecimals={false} tick={axis} axisLine={false} tickLine={false} />
          <Tooltip {...tip} />
          <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
          <Line type="stepAfter" dataKey="remaining" name="Remaining" stroke="var(--series-1)" strokeWidth={2} dot={false} />
          <Line type="stepAfter" dataKey="scope" name="Total scope" stroke="var(--series-2)" strokeWidth={2} strokeDasharray="5 4" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
