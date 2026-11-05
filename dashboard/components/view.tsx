import Link from 'next/link';
import { loadDashboard, RANGES, type Range } from '@/lib/queries';
import { DailyCharts } from './charts';

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat('en');
const usd = (n: number) => `$${n.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function ago(iso: string | null) {
  if (!iso) return '—';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 90) return 'just now';
  if (s < 5400) return `${Math.round(s / 60)}m ago`;
  if (s < 129600) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

function Heatmap({ cells }: { cells: { dow: number; hr: number; n: number }[] }) {
  const grid = new Map(cells.map((c) => [`${c.dow}-${c.hr}`, c.n]));
  const max = Math.max(1, ...cells.map((c) => c.n));
  return (
    <div className="heat" role="img" aria-label="Prompts by weekday and hour, UTC">
      {DOW.map((d, dow) => (
        <div className="heat-row" key={d}>
          <span className="heat-label">{d}</span>
          {Array.from({ length: 24 }, (_, hr) => {
            const n = grid.get(`${dow}-${hr}`) ?? 0;
            return <i key={hr} title={`${d} ${hr}:00 UTC · ${n} prompts`} style={{ opacity: n ? 0.18 + 0.82 * (n / max) : 0.06 }} />;
          })}
        </div>
      ))}
      <div className="heat-row">
        <span className="heat-label" />
        {Array.from({ length: 24 }, (_, hr) => (
          <b key={hr}>{hr % 6 === 0 ? hr : ''}</b>
        ))}
      </div>
    </div>
  );
}

function Bars({ rows }: { rows: { label: string; value: number; note?: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="bars">
      {rows.map((r) => (
        <li key={r.label}>
          <span className="bar-label">{r.label}</span>
          <span className="bar-track">
            <span style={{ width: `${(r.value / max) * 100}%` }} />
          </span>
          <span className="bar-value">{r.note}</span>
        </li>
      ))}
    </ul>
  );
}

export async function View({ range, userId }: { range: Range; userId?: string }) {
  const d = await loadDashboard(range, userId);
  const t = d.totals;
  const maxUserCost = Math.max(0.0001, ...d.users.map((u) => u.cost));
  const q = range === '7d' ? '' : `?range=${range}`;

  return (
    <>
      <nav className="ranges" aria-label="Time range">
        {(Object.keys(RANGES) as Range[]).map((r) => (
          <Link key={r} href={`${userId ? `/users/${userId}` : '/'}?range=${r}`} aria-current={r === range ? 'page' : undefined}>
            {r === 'all' ? 'All time' : `Last ${r.replace('d', ' days')}`}
          </Link>
        ))}
      </nav>

      <div className="kpis">
        <div className="kpi"><span>Est. cost</span><strong>{usd(t.cost)}</strong></div>
        <div className="kpi"><span>Tokens (in + out + cache write)</span><strong>{compact.format(t.tokens)}</strong></div>
        <div className="kpi"><span>Output tokens</span><strong>{compact.format(t.output)}</strong></div>
        <div className="kpi"><span>Cache hit rate</span><strong>{t.cacheHit === null ? '—' : `${Math.round(t.cacheHit * 100)}%`}</strong></div>
        <div className="kpi"><span>Prompts</span><strong>{whole.format(t.prompts)}</strong></div>
        <div className="kpi"><span>Sessions</span><strong>{whole.format(t.sessions)}</strong></div>
        {!userId && <div className="kpi"><span>Active users</span><strong>{t.users}</strong></div>}
      </div>

      <DailyCharts data={d.series} />

      {!userId && (
        <section className="panel">
          <h2>Users</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>User</th><th>Est. cost</th><th className="num">Tokens</th><th className="num">Prompts</th>
                  <th className="num">Sessions</th><th>Top model</th><th>Last active</th>
                </tr>
              </thead>
              <tbody>
                {d.users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <Link href={`/users/${u.id}${q}`}>{u.name}</Link>
                      <small>{u.host} · {u.os}</small>
                    </td>
                    <td>
                      <span className="cell-bar"><span style={{ width: `${(u.cost / maxUserCost) * 100}%` }} /></span>
                      {usd(u.cost)}
                    </td>
                    <td className="num">{compact.format(u.tokens)}</td>
                    <td className="num">{whole.format(u.prompts)}</td>
                    <td className="num">{whole.format(u.sessions)}</td>
                    <td className="mono">{u.topModel ?? '—'}</td>
                    <td>{ago(u.lastActive)}</td>
                  </tr>
                ))}
                {!d.users.length && <tr><td colSpan={7} className="empty">No users yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="grid two">
        <section className="panel">
          <h2>Models</h2>
          <Bars rows={d.models.map((m) => ({ label: m.model, value: m.cost, note: `${usd(m.cost)} · ${compact.format(m.msgs)} msgs` }))} />
          {!d.models.length && <p className="empty">No data.</p>}
        </section>
        <section className="panel">
          <h2>Top tools</h2>
          <Bars rows={d.tools.map((x) => ({ label: x.tool, value: x.n, note: whole.format(x.n) }))} />
          {!d.tools.length && <p className="empty">No data.</p>}
        </section>
        <section className="panel">
          <h2>Projects</h2>
          <Bars rows={d.projects.map((p) => ({ label: p.project, value: p.tokens, note: `${compact.format(p.tokens)} · ${p.sessions} sessions` }))} />
          {!d.projects.length && <p className="empty">No data.</p>}
        </section>
        <section className="panel">
          <h2>When prompts happen</h2>
          <p className="sub">Weekday by hour, UTC.</p>
          <Heatmap cells={d.heat} />
        </section>
      </div>
    </>
  );
}
