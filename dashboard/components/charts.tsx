'use client';

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { DayPoint } from '@/lib/queries';

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
const usd = (n: number) => `$${n.toFixed(n < 10 ? 2 : 0)}`;
const shortDay = (d: string) => d.slice(5);

const axis = { stroke: 'var(--muted)', fontSize: 12, tickLine: false, axisLine: false } as const;
const tooltip = {
  contentStyle: { background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13 },
  labelStyle: { color: 'var(--text)', fontWeight: 600 },
  cursor: { fill: 'var(--line)', opacity: 0.4 },
} as const;

export function DailyCharts({ data }: { data: DayPoint[] }) {
  if (!data.length) return <p className="empty">No usage in this range yet.</p>;
  return (
    <div className="grid two">
      <section className="panel">
        <h2>Tokens per day</h2>
        <p className="sub">Input, output and cache-write tokens. Cache reads are excluded because they dwarf everything else.</p>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data} margin={{ left: -8, right: 4, top: 8 }}>
            <CartesianGrid vertical={false} stroke="var(--line)" />
            <XAxis dataKey="day" tickFormatter={shortDay} {...axis} minTickGap={24} />
            <YAxis tickFormatter={(v) => compact.format(v)} {...axis} />
            <Tooltip {...tooltip} formatter={(v) => compact.format(Number(v))} />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="output" name="Output" stackId="t" fill="var(--c1)" />
            <Bar dataKey="input" name="Input" stackId="t" fill="var(--c2)" />
            <Bar dataKey="cacheWrite" name="Cache write" stackId="t" fill="var(--c3)" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </section>
      <section className="panel">
        <h2>Estimated cost per day</h2>
        <p className="sub">From the price table in lib/pricing.ts, including cache reads.</p>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={data} margin={{ left: -8, right: 4, top: 8 }}>
            <CartesianGrid vertical={false} stroke="var(--line)" />
            <XAxis dataKey="day" tickFormatter={shortDay} {...axis} minTickGap={24} />
            <YAxis tickFormatter={usd} {...axis} />
            <Tooltip {...tooltip} formatter={(v) => usd(Number(v))} />
            <Area dataKey="cost" name="Cost" type="monotone" stroke="var(--c1)" strokeWidth={2} fill="var(--c1)" fillOpacity={0.14} />
          </AreaChart>
        </ResponsiveContainer>
      </section>
    </div>
  );
}
