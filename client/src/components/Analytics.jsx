import { useEffect, useState } from 'react';
import { api, fmt, qs, LEAD_STATUSES } from '../lib/api.js';
import { Bars, Kpi, PageHead } from './ui.jsx';

const WEB_LABELS = {
  none: 'No website', social_only: 'Social only', broken: 'Broken', site_outdated: 'Outdated site', site_dated: 'Dated site',
  site_modern: 'Modern site', pending: 'Pending check', analyzing: 'Analysing', unknown: 'Blocked / unchecked',
};
const WEB_TONES = { none: 'bad', social_only: 'bad', broken: 'bad', site_outdated: 'warn', site_dated: 'warn', site_modern: 'good' };
// Maps a web-presence bucket to the Lead Results filter that shows it.
const WEB_FILTER = { none: 'none', social_only: 'social_only', broken: 'broken', site_outdated: 'outdated', site_dated: 'outdated',
  site_modern: 'modern', site_unknown: 'pending', pending: 'pending', analyzing: 'pending', unknown: 'pending' };
const TIER_LABELS = { hot: '🔥 Hot', potential: '🟡 Potential', low: '⚪ Low' };

export default function Analytics({ scanId, leadsVersion, onOpen }) {
  const [scope, setScope] = useState('all');
  const [data, setData] = useState(null);

  useEffect(() => {
    const ctl = new AbortController();
    api.get(`/analytics${qs({ scanId: scope === 'scan' ? scanId : '' })}`, { signal: ctl.signal }).then(setData).catch(() => {});
    return () => ctl.abort();
  }, [scope, scanId, leadsVersion]);

  if (!data) return <div className="loading">Loading…</div>;
  const t = data.totals;
  const a = data.api;
  const maxDay = Math.max(1, ...a.daily.map((d) => d.billed + d.cached + d.errors));

  return (
    <div className="page">
      <PageHead eyebrow="04 · Analytics · click any bar to open those leads" title="Pipeline & API usage">
        <div className="seg">
          <button className={scope === 'scan' ? 'on' : ''} disabled={!scanId} onClick={() => setScope('scan')}>This scan</button>
          <button className={scope === 'all' ? 'on' : ''} onClick={() => setScope('all')}>All leads</button>
        </div>
      </PageHead>

      <div className="kpis">
        <Kpi label="Businesses" value={fmt.num(t.total)} />
        <Kpi label="🔥 Hot" value={fmt.num(t.hot)} tone="hot" />
        <Kpi label="🟡 Potential" value={fmt.num(t.potential)} />
        <Kpi label="No / weak website" value={fmt.num(t.noSite)} sub={`${t.total ? Math.round((t.noSite / t.total) * 100) : 0}% of businesses`} />
        <Kpi label="WhatsApp-ready" value={fmt.num(t.whatsapp)} sub={`${fmt.num(t.email)} with email`} />
        <Kpi label="Average score" value={Math.round(t.avgScore || 0)} />
      </div>

      <div className="grid-3">
        <section className="card"><div className="card-head"><h3>Lead tiers</h3></div><Bars rows={data.tiers} labels={TIER_LABELS} tones={{ hot: 'hot', potential: 'warn' }} onSelect={(k) => onOpen({ tier: [k] }, scope)} /></section>
        <section className="card"><div className="card-head"><h3>Web presence</h3></div><Bars rows={data.web} labels={WEB_LABELS} tones={WEB_TONES} onSelect={(k) => onOpen(WEB_FILTER[k] ? { web: [WEB_FILTER[k]] } : {}, scope)} /></section>
        <section className="card"><div className="card-head"><h3>Sales pipeline</h3></div><Bars rows={data.leadStatus} labels={Object.fromEntries(LEAD_STATUSES)} tones={{ converted: 'good', interested: 'accent' }} onSelect={(k) => onOpen({ leadStatus: k }, scope)} /></section>
        <section className="card">
          <div className="card-head"><h3>Top categories</h3><span className="text-xs text-muted">latest searches first</span></div>
          <Bars rows={data.categories.filter((c) => c.k)} onSelect={(k) => onOpen({ searchCategory: k }, scope)} />
        </section>
        <section className="card"><div className="card-head"><h3>Google rating</h3><span className="text-xs text-muted">% of businesses</span></div><Bars rows={data.ratings} percent /></section>
        <section className="card">
          <div className="card-head"><h3>Website queue</h3></div>
          <p className="big num">{data.siteQueue.active}</p>
          <p className="muted small">analyses running now{data.siteQueue.draining ? ' · queue active' : ' · idle'}</p>
        </section>
      </div>

      <section className="card">
        <div className="card-head"><h3>Google Places API usage</h3><span className="muted small">all scans · counted by this app</span></div>
        <div className="kpis inner">
          <Kpi label="Billed requests today" value={fmt.num(a.today.billed)} sub={`${fmt.num(a.today.cached)} cached · ${fmt.num(a.today.errors)} errors`} />
          <Kpi label="Billed this month" value={fmt.num(a.month.billed)} sub={`${fmt.num(a.month.cached)} served free from cache`} />
          <Kpi label="Est. cost this month" value={`$${data.usage.estMonthCostUsd.toFixed(2)}`} sub={`${fmt.num(data.usage.freeLeftThisMonth)} free searches left · estimate; Cloud Console billing is the source of truth`} />
          <Kpi label="Errors this month" value={fmt.num(a.month.errors)} tone={a.month.errors ? 'hot' : ''} />
        </div>
        <div className="daily">
          {a.daily.map((d) => (
            <div key={d.d} className="day" title={`${d.d}: ${d.billed} billed, ${d.cached} cached, ${d.errors} errors`}>
              <div className="day-stack" style={{ height: `${((d.billed + d.cached + d.errors) / maxDay) * 100}%` }}>
                <i className="e" style={{ flex: d.errors }} /><i className="c" style={{ flex: d.cached }} /><i className="b" style={{ flex: d.billed }} />
              </div>
              <small>{d.d.slice(5)}</small>
            </div>
          ))}
          {!a.daily.length && <p className="muted small">No API calls in the last 14 days.</p>}
        </div>
        {a.recentErrors.length > 0 && (
          <div className="table-wrap">
            <table className="table compact">
              <thead><tr><th>When</th><th>Scan</th><th>Endpoint</th><th>HTTP</th><th>Error</th></tr></thead>
              <tbody>
                {a.recentErrors.map((e, i) => (
                  <tr key={i}><td>{fmt.ago(e.ts)}</td><td className="num">{e.scan_id ?? '—'}</td><td>{e.endpoint}</td><td className="num">{e.http_code ?? '—'}</td><td className="bad">{e.error}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
