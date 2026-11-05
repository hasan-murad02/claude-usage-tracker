# Claude Usage Tracker

A Claude Code plugin that reports usage (tokens, models, sessions, tools) to a dashboard you host on Vercel, with a per-user breakdown.

```
Claude Code ──hooks──▶ hooks/track.mjs ──POST /api/ingest──▶ Vercel (Next.js) ──▶ Neon Postgres
                                                                   └── dashboard (password protected)
```

## Install on a machine (one command)

Plugins install per machine, so run this once on each one. Ask the dashboard owner for the ingest token.

```powershell
# Windows
irm https://raw.githubusercontent.com/hasan-murad02/claude-usage-tracker/main/install.ps1 -OutFile install.ps1; .\install.ps1 -Token <TOKEN>
```

```bash
# macOS / Linux
curl -fsSLO https://raw.githubusercontent.com/hasan-murad02/claude-usage-tracker/main/install.sh && bash install.sh <TOKEN>
```

Both need the `claude` CLI on the PATH, and the shell script needs Node. They install at user scope and write the token to `~/.claude/usage-tracker/config.json`.

## Install manually (every session)

```
/plugin marketplace add hasan-murad02/claude-usage-tracker
/plugin install usage-tracker@claude-usage-tracker
```

Pick **user** scope so it applies to all projects. Then run `/reload-plugins` in sessions that are already open.

Optional settings go in `~/.claude/usage-tracker/config.json`, or in the environment:

| Setting | Env var | Purpose |
| --- | --- | --- |
| `url` | `CLAUDE_TRACKER_URL` | Dashboard base URL (defaults to the one baked into `hooks/track.mjs`) |
| `token` | `CLAUDE_TRACKER_TOKEN` | Must match `INGEST_TOKEN` on the server, if you set one |
| `name` | `CLAUDE_TRACKER_NAME` | Display name (defaults to `git config user.name`, then the OS username) |
| `disabled` | `CLAUDE_TRACKER_DISABLE=1` | Turn tracking off on this machine |

## What is sent

| Event | Fields |
| --- | --- |
| `session_start` / `session_end` | session id, project folder name, start source or end reason |
| `prompt` | session id, project folder name, **character count only** |
| `usage` (one per assistant message) | model, input / output / cache-write / cache-read tokens, tool names used, whether it was a subagent |

Prompt text, responses, file contents and file paths are **never** sent. Only the last folder name of the working directory is.

**Identity.** Each machine gets a stable anonymous ID: `sha256(first MAC address | hostname | OS username)`, truncated and cached in `~/.claude/usage-tracker/identity.json`. The MAC address itself never leaves the machine. The display name is `git config user.name`, falling back to the OS username. The hostname and OS are sent as labels.

Hooks run asynchronously, swallow every error, and print nothing, so a down dashboard never affects a session. Usage is read from the session transcript from a saved byte offset, and only advances after a successful send, so failures are retried on the next event. The server de-duplicates by message id.

## Deploy the dashboard

1. Import this repo in Vercel with **Root Directory** set to `dashboard`.
2. Add a Postgres database from the Marketplace (Neon). It sets `DATABASE_URL`. Tables are created on first use.
3. Set `DASHBOARD_PASSWORD` (required) and `INGEST_TOKEN` (recommended).
4. Put the deployment URL in `DEFAULT_URL` in `hooks/track.mjs`, or have each user set `CLAUDE_TRACKER_URL`.

Because this repo is public, any token committed to it is public too. Set `INGEST_TOKEN` and share it with your users out of band through `CLAUDE_TRACKER_TOKEN`. Without it, anyone who knows the URL can post events.

## Dashboard

KPIs (est. cost, tokens, cache hit rate, prompts, sessions, active users), tokens and cost per day, a user leaderboard with drill-down pages, model mix, top tools, projects, and a weekday × hour activity heatmap. Ranges: 7 / 30 / 90 days and all time. Times are UTC.

Costs are **estimates**. Edit `dashboard/lib/pricing.ts` to match current Anthropic pricing for the models you use.

## Local development

```
cd dashboard
cp .env.example .env.local   # fill in DATABASE_URL and DASHBOARD_PASSWORD
npm install && npm run dev
```

## License

MIT
