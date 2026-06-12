"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// Indigo-led palette so multi-category charts stay on-brand with the
// slate + indigo design system. Cycled through when a chart has more
// categories than entries.
const PALETTE = [
  "#4f46e5", // indigo-600
  "#6366f1", // indigo-500
  "#818cf8", // indigo-400
  "#0ea5e9", // sky-500
  "#14b8a6", // teal-500
  "#a78bfa", // violet-400
  "#f59e0b", // amber-500
  "#f43f5e", // rose-500
];

const AXIS_TICK = { fontSize: 12, fill: "#64748b" }; // slate-500
const GRID_STROKE = "#e2e8f0"; // slate-200

// Shared tooltip chrome — a small slate card matching the page surfaces.
const TOOLTIP_STYLE = {
  borderRadius: 8,
  border: "1px solid #e2e8f0",
  fontSize: 12,
  boxShadow: "0 1px 2px rgba(15,23,42,0.08)",
} as const;

export type CategoryDatum = { name: string; value: number };
export type ColoredDatum = { name: string; value: number; color: string };
export type TrendDatum = {
  year: string;
  hires: number;
  terminations: number;
  turnover: number | null;
  retention: number | null;
};

function EmptyState() {
  return (
    <div className="flex h-full items-center justify-center text-sm text-slate-400 dark:text-slate-500">
      No data for this slice.
    </div>
  );
}

// Recharts passes tooltip values as a number, string, or array of them.
type RechartsValue = number | string | ReadonlyArray<number | string>;

function toNumber(value: RechartsValue | undefined): number {
  return Array.isArray(value) ? Number(value[0]) : Number(value);
}

// Tooltip value formatter that appends each slice's share of `total`.
function withPercent(total: number | undefined) {
  return (value: RechartsValue | undefined) => {
    const num = toNumber(value);
    const label = num.toLocaleString();
    if (!total) return label;
    return `${label} · ${((num / total) * 100).toFixed(1)}%`;
  };
}

export function CategoryBar({
  data,
  color = PALETTE[0],
  horizontal = false,
  total,
}: {
  data: CategoryDatum[];
  color?: string;
  horizontal?: boolean;
  // When provided, tooltips show each bar's share of this total.
  total?: number;
}) {
  if (data.length === 0) return <EmptyState />;
  const formatter = withPercent(total);

  if (horizontal) {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
        >
          <CartesianGrid horizontal={false} stroke={GRID_STROKE} />
          <XAxis type="number" tick={AXIS_TICK} allowDecimals={false} />
          <YAxis
            type="category"
            dataKey="name"
            tick={AXIS_TICK}
            width={120}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            cursor={{ fill: "rgba(99,102,241,0.08)" }}
            contentStyle={TOOLTIP_STYLE}
            formatter={formatter}
          />
          <Bar dataKey="value" name="Employees" fill={color} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: -16 }}>
        <CartesianGrid vertical={false} stroke={GRID_STROKE} />
        <XAxis
          dataKey="name"
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={{ stroke: GRID_STROKE }}
          interval={0}
        />
        <YAxis tick={AXIS_TICK} allowDecimals={false} tickLine={false} axisLine={false} />
        <Tooltip
          cursor={{ fill: "rgba(99,102,241,0.08)" }}
          contentStyle={TOOLTIP_STYLE}
          formatter={formatter}
        />
        <Bar dataKey="value" name="Employees" fill={color} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function Donut({
  data,
  palette = PALETTE,
  total,
}: {
  // When a datum carries its own `color` it wins; otherwise the palette is cycled.
  data: Array<CategoryDatum | ColoredDatum>;
  palette?: string[];
  // Defaults to the sum of the slices when not supplied.
  total?: number;
}) {
  if (data.length === 0 || data.every((d) => d.value === 0)) return <EmptyState />;
  const sum = total ?? data.reduce((acc, d) => acc + d.value, 0);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius="55%"
          outerRadius="80%"
          paddingAngle={2}
          stroke="none"
          label={({ percent }) =>
            percent && percent >= 0.04 ? `${(percent * 100).toFixed(0)}%` : ""
          }
          labelLine={false}
        >
          {data.map((entry, index) => (
            <Cell
              key={entry.name}
              fill={
                "color" in entry && entry.color
                  ? entry.color
                  : palette[index % palette.length]
              }
            />
          ))}
        </Pie>
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={withPercent(sum)} />
        <Legend
          verticalAlign="bottom"
          iconType="circle"
          wrapperStyle={{ fontSize: 12, color: "#64748b" }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function WorkforceTrend({ data }: { data: TrendDatum[] }) {
  if (data.length === 0) return <EmptyState />;

  // Hires/terminations are counts (left axis); turnover/retention are
  // percentages (right axis), so the two scales don't distort each other.
  const trendFormatter = (
    value: RechartsValue | undefined,
    name: RechartsValue | undefined,
  ): [string, string] => {
    const label = String(name ?? "");
    if (value === null || value === undefined) return ["—", label];
    const num = toNumber(value);
    return label.includes("%")
      ? [`${num}%`, label]
      : [num.toLocaleString(), label];
  };

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: -16 }}>
        <CartesianGrid vertical={false} stroke={GRID_STROKE} />
        <XAxis
          dataKey="year"
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={{ stroke: GRID_STROKE }}
        />
        <YAxis
          yAxisId="count"
          tick={AXIS_TICK}
          allowDecimals={false}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          yAxisId="pct"
          orientation="right"
          domain={[0, "auto"]}
          tick={AXIS_TICK}
          tickFormatter={(value: number) => `${value}%`}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          cursor={{ fill: "rgba(99,102,241,0.08)" }}
          contentStyle={TOOLTIP_STYLE}
          formatter={trendFormatter}
        />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12, color: "#64748b" }} />
        <Bar yAxisId="count" dataKey="hires" name="Hires" fill="#4f46e5" radius={[4, 4, 0, 0]} />
        <Bar
          yAxisId="count"
          dataKey="terminations"
          name="Terminations"
          fill="#f43f5e"
          radius={[4, 4, 0, 0]}
        />
        <Line
          yAxisId="pct"
          type="monotone"
          dataKey="turnover"
          name="Turnover %"
          stroke="#d97706"
          strokeWidth={2}
          dot={{ r: 2 }}
          connectNulls
        />
        <Line
          yAxisId="pct"
          type="monotone"
          dataKey="retention"
          name="Retention %"
          stroke="#16a34a"
          strokeWidth={2}
          dot={{ r: 2 }}
          connectNulls
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
