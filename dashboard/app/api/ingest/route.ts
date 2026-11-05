import { safeEqual } from '@/lib/auth';
import { query } from '@/lib/db';

const MAX_BODY = 1_000_000;
const MAX_EVENTS = 500;
const TYPES = new Set(['usage', 'prompt', 'session_start', 'session_end']);

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : null);
const count = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 1e12) : 0;
};

function bad(message: string, status = 400) {
  return Response.json({ ok: false, error: message }, { status });
}

export async function POST(req: Request) {
  const secret = process.env.INGEST_TOKEN;
  if (secret) {
    const given = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!safeEqual(given, secret)) return bad('unauthorized', 401);
  }

  const raw = await req.text();
  if (raw.length > MAX_BODY) return bad('payload too large', 413);

  let body: { user?: Record<string, unknown>; events?: Record<string, unknown>[] };
  try {
    body = JSON.parse(raw);
  } catch {
    return bad('invalid json');
  }

  const userId = str(body.user?.id, 64);
  if (!userId || !Array.isArray(body.events) || body.events.length > MAX_EVENTS) return bad('invalid payload');

  await query(
    `INSERT INTO users (id, name, host, os, plugin_version) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, host = EXCLUDED.host, os = EXCLUDED.os,
       plugin_version = EXCLUDED.plugin_version, last_seen = now()`,
    [userId, str(body.user?.name, 120) || 'unknown', str(body.user?.host, 120), str(body.user?.os, 32), str(body.user?.plugin_version, 32)],
  );

  const params: unknown[] = [];
  const rows: string[] = [];
  const maxTs = Date.now() + 864e5;
  for (const e of body.events) {
    const id = str(e.id, 80);
    const type = str(e.type, 32);
    const ts = new Date(String(e.ts));
    if (!id || !type || !TYPES.has(type) || Number.isNaN(ts.getTime()) || ts.getTime() > maxTs) continue;

    const meta =
      type === 'prompt'
        ? { chars: count(e.chars) }
        : type === 'session_start'
          ? { source: str(e.source, 32), model: str(e.model, 80) }
          : type === 'session_end'
            ? { reason: str(e.reason, 64) }
            : null;
    const tools = Array.isArray(e.tools) ? e.tools.map((t) => str(t, 80)).filter((t): t is string => !!t).slice(0, 50) : [];

    const base = params.length;
    params.push(
      id,
      userId,
      type,
      ts.toISOString(),
      str(e.session_id, 80),
      str(e.project, 120),
      str(e.model, 80),
      count(e.input_tokens),
      count(e.output_tokens),
      count(e.cache_write_tokens),
      count(e.cache_read_tokens),
      count(e.web_searches),
      e.sidechain === true,
      tools,
      meta ? JSON.stringify(meta) : null,
    );
    rows.push(`(${Array.from({ length: 15 }, (_, i) => `$${base + i + 1}`).join(',')})`);
  }

  if (rows.length) {
    await query(
      `INSERT INTO events (id, user_id, type, ts, session_id, project, model, input_tokens, output_tokens,
         cache_write_tokens, cache_read_tokens, web_searches, sidechain, tools, meta)
       VALUES ${rows.join(',')}
       ON CONFLICT (id) DO NOTHING`,
      params,
    );
  }

  return Response.json({ ok: true, accepted: rows.length });
}
