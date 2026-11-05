#!/usr/bin/env node
// Claude Code usage tracker. Runs as a hook, reads the hook payload on stdin and
// POSTs usage events to the dashboard. It must never break or slow a session, so
// every failure is swallowed and nothing is ever written to stdout.
import { createHash } from 'node:crypto';
import { closeSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir, hostname, networkInterfaces, platform, userInfo } from 'node:os';
import { basename, join } from 'node:path';
import { execFileSync } from 'node:child_process';

const PLUGIN_VERSION = '0.1.0';
// Where events are sent. Override with CLAUDE_TRACKER_URL or "url" in config.json.
const DEFAULT_URL = '';
const DIR = join(homedir(), '.claude', 'usage-tracker');
const STATE_DIR = join(DIR, 'state');
const BATCH = 200;

const readJson = (path, fallback) => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return fallback;
  }
};
const writeJson = (path, value) => {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, JSON.stringify(value));
};
const sha = (s, len = 16) => createHash('sha256').update(s).digest('hex').slice(0, len);

function loadConfig() {
  const file = readJson(join(DIR, 'config.json'), {});
  return {
    url: (process.env.CLAUDE_TRACKER_URL || file.url || DEFAULT_URL).replace(/\/+$/, ''),
    token: process.env.CLAUDE_TRACKER_TOKEN || file.token || '',
    name: process.env.CLAUDE_TRACKER_NAME || file.name || '',
    disabled: process.env.CLAUDE_TRACKER_DISABLE === '1' || file.disabled === true,
  };
}

// A stable, anonymous per-device identity. The raw MAC address never leaves the machine:
// it is hashed together with hostname and OS user, and the result is cached so it stays
// the same even when VPN/virtual adapters come and go.
function identity(cfg) {
  const path = join(DIR, 'identity.json');
  let id = readJson(path, null);
  if (!id?.id) {
    const macs = Object.values(networkInterfaces())
      .flat()
      .filter((i) => i && !i.internal && i.mac && i.mac !== '00:00:00:00:00:00')
      .map((i) => i.mac)
      .sort();
    const os = userInfo().username;
    const seed = [macs[0] || 'no-mac', hostname(), os, 'claude-usage-tracker'].join('|');
    let gitName = '';
    try {
      gitName = execFileSync('git', ['config', '--global', 'user.name'], { encoding: 'utf8', timeout: 2000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {}
    id = { id: sha(seed), name: gitName || os };
    writeJson(path, id);
  }
  return {
    id: id.id,
    name: cfg.name || id.name,
    host: hostname(),
    os: platform(),
    plugin_version: PLUGIN_VERSION,
  };
}

// Reads only the new part of the transcript since the last successful send.
function readNewUsage(transcriptPath, offset) {
  let size;
  try {
    size = statSync(transcriptPath).size;
  } catch {
    return { events: [], offset };
  }
  if (size < offset) offset = 0; // transcript was rewritten
  if (size === offset) return { events: [], offset };

  const buf = Buffer.alloc(size - offset);
  const fd = openSync(transcriptPath, 'r');
  try {
    readSync(fd, buf, 0, buf.length, offset);
  } finally {
    closeSync(fd);
  }
  const lastNewline = buf.lastIndexOf(0x0a);
  if (lastNewline < 0) return { events: [], offset };
  const text = buf.subarray(0, lastNewline).toString('utf8');

  // The same message id is logged once per content block; keep one entry per id.
  const byId = new Map();
  for (const line of text.split('\n')) {
    if (!line.includes('"usage"')) continue;
    let e;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    const m = e.message;
    if (e.type !== 'assistant' || !m?.usage || !m.id || !m.model || m.model.startsWith('<')) continue;
    const prev = byId.get(m.id);
    const tools = new Set(prev?.tools ?? []);
    for (const c of Array.isArray(m.content) ? m.content : []) if (c?.type === 'tool_use' && c.name) tools.add(c.name);
    const u = m.usage;
    byId.set(m.id, {
      type: 'usage',
      id: `u:${m.id}`,
      ts: prev?.ts ?? e.timestamp,
      model: m.model,
      input_tokens: u.input_tokens ?? 0,
      output_tokens: u.output_tokens ?? 0,
      cache_write_tokens: u.cache_creation_input_tokens ?? 0,
      cache_read_tokens: u.cache_read_input_tokens ?? 0,
      web_searches: u.server_tool_use?.web_search_requests ?? 0,
      sidechain: !!e.isSidechain,
      tools: [...tools],
    });
  }
  return { events: [...byId.values()], offset: offset + lastNewline + 1 };
}

async function post(cfg, user, events) {
  for (let i = 0; i < events.length; i += BATCH) {
    const res = await fetch(`${cfg.url}/api/ingest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(cfg.token && { authorization: `Bearer ${cfg.token}` }) },
      body: JSON.stringify({ user, events: events.slice(i, i + BATCH) }),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return false;
  }
  return true;
}

function pruneState() {
  try {
    const cutoff = Date.now() - 14 * 864e5;
    for (const f of readdirSync(STATE_DIR)) {
      const p = join(STATE_DIR, f);
      if (statSync(p).mtimeMs < cutoff) unlinkSync(p);
    }
  } catch {}
}

async function main() {
  const cfg = loadConfig();
  if (cfg.disabled || !cfg.url) return;

  let input = {};
  try {
    input = JSON.parse(readFileSync(0, 'utf8') || '{}');
  } catch {}
  const hook = input.hook_event_name || process.argv[2];
  const sessionId = input.session_id || 'unknown';
  const project = input.cwd ? basename(input.cwd) : '';
  const now = new Date().toISOString();
  const user = identity(cfg);
  const mk = (type, extra = {}) => ({
    type,
    id: sha(`${user.id}|${sessionId}|${type}|${now}|${Math.random()}`, 24),
    ts: now,
    session_id: sessionId,
    project,
    ...extra,
  });

  const events = [];
  let commit = null;

  if (hook === 'SessionStart') {
    events.push(mk('session_start', { source: input.source, model: input.model }));
    pruneState();
  } else if (hook === 'UserPromptSubmit') {
    // Only the length is sent; prompt text never leaves the machine.
    events.push(mk('prompt', { chars: typeof input.prompt === 'string' ? input.prompt.length : 0 }));
  } else if (hook === 'SessionEnd') {
    events.push(mk('session_end', { reason: input.reason }));
  }

  if ((hook === 'Stop' || hook === 'SessionEnd') && input.transcript_path) {
    const statePath = join(STATE_DIR, `${sha(sessionId, 24)}.json`);
    const state = readJson(statePath, { offset: 0 });
    const { events: usage, offset } = readNewUsage(input.transcript_path, state.offset || 0);
    for (const u of usage) events.push({ ...u, session_id: sessionId, project });
    commit = () => writeJson(statePath, { offset });
  }

  if (!events.length) return;
  if (await post(cfg, user, events)) commit?.();
}

main().catch(() => {});
