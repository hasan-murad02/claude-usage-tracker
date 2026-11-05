import { query } from './db';
import { cost } from './pricing';

export const RANGES = { '7d': 7, '30d': 30, '90d': 90, all: 0 } as const;
export type Range = keyof typeof RANGES;

export function parseRange(v: string | undefined): Range {
  return v && v in RANGES ? (v as Range) : '7d';
}

type UsageRow = {
  day: string;
  user_id: string;
  model: string;
  input: number;
  output: number;
  cache_write: number;
  cache_read: number;
  msgs: number;
};

export type DayPoint = { day: string; input: number; output: number; cacheWrite: number; cost: number; prompts: number };
export type ModelRow = { model: string; msgs: number; tokens: number; cost: number };
export type UserRow = {
  id: string;
  name: string;
  host: string | null;
  os: string | null;
  tokens: number;
  output: number;
  cost: number;
  prompts: number;
  sessions: number;
  lastActive: string | null;
  topModel: string | null;
};

export async function loadDashboard(range: Range, userId?: string) {
  const days = RANGES[range];
  const from = days ? new Date(Date.now() - days * 864e5).toISOString() : null;
  const scope = `($1::timestamptz IS NULL OR ts >= $1) AND ($2::text IS NULL OR user_id = $2)`;
  const args = [from, userId ?? null];

  const [usage, daily, perUser, heat, projects, tools, users] = await Promise.all([
    query<UsageRow>(
      `SELECT to_char(ts AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, user_id, model,
              sum(input_tokens)::float8 AS input, sum(output_tokens)::float8 AS output,
              sum(cache_write_tokens)::float8 AS cache_write, sum(cache_read_tokens)::float8 AS cache_read,
              count(*)::int AS msgs
         FROM events WHERE type = 'usage' AND ${scope} GROUP BY 1, 2, 3`,
      args,
    ),
    query<{ day: string; prompts: number }>(
      `SELECT to_char(ts AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, count(*)::int AS prompts
         FROM events WHERE type = 'prompt' AND ${scope} GROUP BY 1`,
      args,
    ),
    query<{ user_id: string; prompts: number; sessions: number; last_active: string }>(
      `SELECT user_id, count(*) FILTER (WHERE type = 'prompt')::int AS prompts,
              count(DISTINCT session_id)::int AS sessions, max(ts) AS last_active
         FROM events WHERE ${scope} GROUP BY 1`,
      args,
    ),
    query<{ dow: number; hr: number; n: number }>(
      `SELECT extract(dow FROM ts AT TIME ZONE 'UTC')::int AS dow, extract(hour FROM ts AT TIME ZONE 'UTC')::int AS hr, count(*)::int AS n
         FROM events WHERE type = 'prompt' AND ${scope} GROUP BY 1, 2`,
      args,
    ),
    query<{ project: string; sessions: number; tokens: number }>(
      `SELECT project, count(DISTINCT session_id)::int AS sessions,
              sum(input_tokens + output_tokens + cache_write_tokens)::float8 AS tokens
         FROM events WHERE type = 'usage' AND coalesce(project, '') <> '' AND ${scope}
        GROUP BY 1 ORDER BY tokens DESC LIMIT 8`,
      args,
    ),
    query<{ tool: string; n: number }>(
      `SELECT t AS tool, count(*)::int AS n FROM events, unnest(tools) AS t
        WHERE type = 'usage' AND ${scope} GROUP BY 1 ORDER BY n DESC LIMIT 10`,
      args,
    ),
    query<{ id: string; name: string; host: string | null; os: string | null }>(
      `SELECT id, name, host, os FROM users WHERE ($1::text IS NULL OR id = $1)`,
      [userId ?? null],
    ),
  ]);

  const tok = (r: UsageRow) => ({ input: r.input, output: r.output, cacheWrite: r.cache_write, cacheRead: r.cache_read });

  // Daily series, with empty days filled in so the charts have a continuous axis.
  const byDay = new Map<string, DayPoint>();
  const point = (day: string) => {
    let p = byDay.get(day);
    if (!p) byDay.set(day, (p = { day, input: 0, output: 0, cacheWrite: 0, cost: 0, prompts: 0 }));
    return p;
  };
  const byModel = new Map<string, ModelRow>();
  const byUser = new Map<string, { tokens: number; output: number; cost: number; models: Map<string, number> }>();
  let cacheRead = 0;
  let fresh = 0;

  for (const r of usage) {
    const c = cost(r.model, tok(r));
    const p = point(r.day);
    p.input += r.input;
    p.output += r.output;
    p.cacheWrite += r.cache_write;
    p.cost += c;
    cacheRead += r.cache_read;
    fresh += r.input + r.cache_write;

    const total = r.input + r.output + r.cache_write;
    const m = byModel.get(r.model) ?? { model: r.model, msgs: 0, tokens: 0, cost: 0 };
    m.msgs += r.msgs;
    m.tokens += total;
    m.cost += c;
    byModel.set(r.model, m);

    const u = byUser.get(r.user_id) ?? { tokens: 0, output: 0, cost: 0, models: new Map() };
    u.tokens += total;
    u.output += r.output;
    u.cost += c;
    u.models.set(r.model, (u.models.get(r.model) ?? 0) + c);
    byUser.set(r.user_id, u);
  }
  for (const d of daily) point(d.day).prompts = d.prompts;

  const keys = [...byDay.keys()].sort();
  const series: DayPoint[] = [];
  if (keys.length) {
    const end = new Date();
    for (let d = new Date(`${keys[0]}T00:00:00Z`); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      const day = d.toISOString().slice(0, 10);
      series.push(byDay.get(day) ?? { day, input: 0, output: 0, cacheWrite: 0, cost: 0, prompts: 0 });
    }
  }

  const stats = new Map(perUser.map((r) => [r.user_id, r]));
  const userRows: UserRow[] = users
    .map((u) => {
      const t = byUser.get(u.id);
      const s = stats.get(u.id);
      const top = t && [...t.models.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      return {
        ...u,
        tokens: t?.tokens ?? 0,
        output: t?.output ?? 0,
        cost: t?.cost ?? 0,
        prompts: s?.prompts ?? 0,
        sessions: s?.sessions ?? 0,
        lastActive: s?.last_active ?? null,
        topModel: top ?? null,
      };
    })
    .filter((u) => u.tokens > 0 || u.prompts > 0)
    .sort((a, b) => b.cost - a.cost);

  const models = [...byModel.values()].sort((a, b) => b.cost - a.cost);
  const totals = {
    cost: models.reduce((s, m) => s + m.cost, 0),
    tokens: models.reduce((s, m) => s + m.tokens, 0),
    output: userRows.reduce((s, u) => s + u.output, 0),
    prompts: userRows.reduce((s, u) => s + u.prompts, 0),
    sessions: perUser.reduce((s, r) => s + r.sessions, 0),
    users: userRows.length,
    cacheHit: cacheRead + fresh > 0 ? cacheRead / (cacheRead + fresh) : null,
  };

  return { series, models, users: userRows, heat, projects, tools, totals };
}
