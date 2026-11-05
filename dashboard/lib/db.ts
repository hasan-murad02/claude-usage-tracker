import { neon } from '@neondatabase/serverless';

const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;

let client: ReturnType<typeof neon> | undefined;
let ready: Promise<void> | undefined;

function sql() {
  if (!url) throw new Error('DATABASE_URL is not set');
  return (client ??= neon(url));
}

// Creates the tables on first use, so deploying needs no separate migration step.
function ensureSchema() {
  return (ready ??= (async () => {
    const db = sql();
    await db.query(`CREATE TABLE IF NOT EXISTS users (
      id text PRIMARY KEY,
      name text NOT NULL,
      host text,
      os text,
      plugin_version text,
      first_seen timestamptz NOT NULL DEFAULT now(),
      last_seen timestamptz NOT NULL DEFAULT now()
    )`);
    await db.query(`CREATE TABLE IF NOT EXISTS events (
      id text PRIMARY KEY,
      user_id text NOT NULL REFERENCES users(id),
      type text NOT NULL,
      ts timestamptz NOT NULL,
      session_id text,
      project text,
      model text,
      input_tokens bigint NOT NULL DEFAULT 0,
      output_tokens bigint NOT NULL DEFAULT 0,
      cache_write_tokens bigint NOT NULL DEFAULT 0,
      cache_read_tokens bigint NOT NULL DEFAULT 0,
      web_searches int NOT NULL DEFAULT 0,
      sidechain boolean NOT NULL DEFAULT false,
      tools text[] NOT NULL DEFAULT '{}',
      meta jsonb
    )`);
    await db.query('CREATE INDEX IF NOT EXISTS events_ts_idx ON events (ts)');
    await db.query('CREATE INDEX IF NOT EXISTS events_user_ts_idx ON events (user_id, ts)');
  })().catch((err) => {
    ready = undefined;
    throw err;
  }));
}

export async function query<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  await ensureSchema();
  return (await sql().query(text, params)) as T[];
}
