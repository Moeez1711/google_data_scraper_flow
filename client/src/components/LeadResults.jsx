import { useEffect, useState } from 'react';
import { api, download, fmt, LEAD_STATUSES, leadParams, PAGE_SIZE, qs, webBadge, DEFAULT_FILTERS } from '../lib/api.js';
import { Empty, FilterTabs, PageHead, TierPill } from './ui.jsx';
import { isDue, messageFor, shortDate, waLink } from '../lib/outreach.js';

const TIERS = [['hot', '🔥 Hot'], ['potential', '🟡 Potential'], ['low', '⚪ Low']];
const WEB = [['none', 'No website'], ['social_only', 'Social only'], ['broken', 'Broken'], ['outdated', 'Outdated'],
  ['not_mobile', 'Not mobile'], ['no_https', 'No HTTPS'], ['modern', 'Modern'], ['pending', 'Unchecked']];

const topReasons = (r, n = 2) => r.reasons.filter((x) => x.points > 0).sort((a, b) => b.points - a.points).slice(0, n).map((x) => x.label);
const shortAddr = (a) => (a || '').split(',').slice(0, 2).join(',');
const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
const countryName = (code) => { try { return regionNames.of(code); } catch { return code; } };
const flag = (code) => code.toUpperCase().replace(/./g, (ch) => String.fromCodePoint(127397 + ch.charCodeAt(0)));
const CATEGORY_ICONS = [[/dent/i, '🦷'], [/vet|pet/i, '🐾'], [/caf|coffee/i, '☕'], [/bak/i, '🥐'], [/restaurant|food|pizza|burger/i, '🍽️'],
  [/salon|beauty|nail/i, '💅'], [/spa|massage/i, '💆'], [/gym|fitness/i, '🏋️'], [/law|legal/i, '⚖️'], [/real estate|property/i, '🏠'],
  [/car|garage|auto/i, '🚗'], [/hotel|resort/i, '🏨'], [/clinic|medical|doctor|hospital|pharm/i, '🩺'], [/flor|flower/i, '🌸'],
  [/cloth|boutique|fashion/i, '👗'], [/school|training|academy/i, '🎓'], [/travel|tour/i, '✈️'], [/furniture|interior/i, '🛋️'],
  [/account|audit/i, '📊'], [/construct|contract/i, '🏗️'], [/barber/i, '💈'], [/laundry|dry clean/i, '🧺'], [/grocer|supermarket/i, '🛒']];
const categoryIcon = (label = '') => CATEGORY_ICONS.find(([re]) => re.test(label))?.[1] || '🏷️';
// Keeps a selected tab visible even when current filters leave it with no leads.
const withSelected = (tabs, value, make) => (value && !tabs.some((t) => t.value === value) ? [...tabs, make(value)] : tabs);

export default function LeadResults({ scanId, filters, setFilters, selected, setSelected, leadsVersion, onOpenLead, notify, settings, onOrder, followUps }) {
  const [data, setData] = useState({ total: 0, rows: [] });
  const [top, setTop] = useState([]);
  const [cats, setCats] = useState([]);
  const [countries, setCountries] = useState([]);
  const [searchCats, setSearchCats] = useState({ total: 0, rows: [] });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(filters.q);

  useEffect(() => {
    const t = setTimeout(() => setFilters((f) => (f.q === search ? f : { ...f, q: search, page: 0 })), 300);
    return () => clearTimeout(t);
  }, [search, setFilters]);

  const params = leadParams(filters, scanId);
  const key = `${JSON.stringify(params)}|${filters.page}`;
  const countryKey = JSON.stringify({ ...params, country: '' });

  useEffect(() => {
    const ctl = new AbortController();
    api.get(`/leads/countries${qs({ ...params, country: '' })}`, { signal: ctl.signal }).then(setCountries).catch(() => {});
    return () => ctl.abort();
  }, [countryKey, leadsVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  const searchCatKey = JSON.stringify({ ...params, searchCategory: '' });
  useEffect(() => {
    const ctl = new AbortController();
    api.get(`/leads/search-categories${qs({ ...params, searchCategory: '' })}`, { signal: ctl.signal }).then(setSearchCats).catch(() => {});
    return () => ctl.abort();
  }, [searchCatKey, leadsVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const ctl = new AbortController();
    setLoading(true);
    api.get(`/leads${qs({ ...params, limit: PAGE_SIZE, offset: filters.page * PAGE_SIZE })}`, { signal: ctl.signal })
      .then((d) => { setData(d); setLoading(false); onOrder(d.rows.map((r) => r.place_id)); })
      .catch((e) => { if (e.name !== 'AbortError') { notify(e.message, 'error'); setLoading(false); } });
    return () => ctl.abort();
  }, [key, leadsVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const sid = filters.scope === 'scan' ? scanId : '';
    const scoped = { scanId: sid, country: filters.country, searchCategory: filters.searchCategory };
    api.get(`/leads${qs({ ...scoped, tier: 'hot', leadStatus: 'not_contacted', limit: 4 })}`).then((d) => setTop(d.rows)).catch(() => {});
    api.get(`/leads/categories${qs(scoped)}`).then(setCats).catch(() => {});
  }, [filters.scope, filters.country, filters.searchCategory, scanId, leadsVersion]);

  const patch = (p) => setFilters((f) => ({ ...f, ...p, page: 0 }));
  const toggle = (k, val) => patch({ [k]: filters[k].includes(val) ? filters[k].filter((x) => x !== val) : [...filters[k], val] });
  const sortBy = (k) => patch({ sort: k, dir: filters.sort === k && filters.dir === 'desc' ? 'asc' : 'desc' });
  const allOnPage = data.rows.length > 0 && data.rows.every((r) => selected.has(r.place_id));
  const toggleRow = (id) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const togglePage = () => setSelected((s) => {
    const n = new Set(s);
    for (const r of data.rows) { if (allOnPage) n.delete(r.place_id); else n.add(r.place_id); }
    return n;
  });

  const applyStatus = (ids, lead_status) => setData((d) => ({ ...d, rows: d.rows.map((r) => (ids.has(r.place_id) ? { ...r, lead_status } : r)) }));
  // Opening WhatsApp/phone from here counts as contact (configurable under Outreach).
  const contacted = (r) => {
    if (!settings.autoMarkContacted || r.lead_status !== 'not_contacted') return;
    api.patch(`/leads/${r.place_id}`, { contacted: true })
      .then(() => { applyStatus(new Set([r.place_id]), 'contacted'); setTop((t) => t.filter((x) => x.place_id !== r.place_id)); })
      .catch(() => {});
  };
  async function setStatus(id, lead_status) {
    try { await api.patch(`/leads/${id}`, { lead_status }); applyStatus(new Set([id]), lead_status); }
    catch (e) { notify(e.message, 'error'); }
  }
  async function bulkStatus(lead_status) {
    try {
      await Promise.all([...selected].map((id) => api.patch(`/leads/${id}`, { lead_status })));
      applyStatus(selected, lead_status);
      notify(`${selected.size} leads marked ${lead_status.replace('_', ' ')}`, 'success');
    } catch (e) { notify(e.message, 'error'); }
  }
  async function exportSelected(format) {
    try { await download(format, { ids: [...selected] }); } catch (e) { notify(e.message, 'error'); }
  }

  const SortTh = ({ k, children, className = '' }) => (
    <th className={`sortable ${className} ${filters.sort === k ? 'sorted' : ''}`} onClick={() => sortBy(k)}>
      {children}{filters.sort === k && <i>{filters.dir === 'desc' ? '↓' : '↑'}</i>}
    </th>
  );
  const stop = (e) => e.stopPropagation();
  const from = data.total ? filters.page * PAGE_SIZE + 1 : 0;
  const to = Math.min(data.total, (filters.page + 1) * PAGE_SIZE);

  return (
    <div className="page">
      <PageHead eyebrow="03 · Lead results" title="Who should I contact first?">
        <div className="seg">
          <button className={filters.scope === 'scan' ? 'on' : ''} disabled={!scanId} onClick={() => patch({ scope: 'scan' })}>This scan</button>
          <button className={filters.scope === 'all' ? 'on' : ''} onClick={() => patch({ scope: 'all' })}>All scans</button>
        </div>
      </PageHead>

      {(countries.length > 0 || filters.country) && (
        <FilterTabs ariaLabel="Filter leads by country" value={filters.country} onChange={(v) => patch({ country: v })}
          tabs={withSelected([
            { value: '', label: 'All countries', icon: '🌍', n: countries.reduce((sum, c) => sum + c.n, 0) },
            ...countries.map((c) => ({ value: c.k, label: countryName(c.k), icon: flag(c.k), n: c.n })),
          ], filters.country, (v) => ({ value: v, label: countryName(v), icon: flag(v), n: 0 }))} />
      )}

      {(searchCats.rows.length > 0 || filters.searchCategory) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-[11px] font-semibold tracking-[.06em] text-muted uppercase">Searched for</span>
          <FilterTabs variant="pill" ariaLabel="Filter leads by searched category" value={filters.searchCategory} onChange={(v) => patch({ searchCategory: v })}
            tabs={withSelected([
              { value: '', label: 'All', icon: '🗂️', n: searchCats.total },
              ...searchCats.rows.map((c) => ({ value: c.k, label: c.k, icon: categoryIcon(c.k), n: c.n })),
            ], filters.searchCategory, (v) => ({ value: v, label: v, icon: categoryIcon(v), n: 0 }))} />
        </div>
      )}

      {followUps.due > 0 && filters.followUp !== 'due' && (
        <div className="flex flex-wrap items-center gap-3 rounded-[10px] border border-hot/30 bg-hot-soft px-4 py-2.5 text-hot-ink">
          <b>⏰ {followUps.due} follow-up{followUps.due === 1 ? '' : 's'} due today</b>
          {followUps.upcoming > 0 && <span className="text-xs">{followUps.upcoming} more scheduled later</span>}
          <button className="btn xs ml-auto" onClick={() => { setSearch(''); setFilters({ ...DEFAULT_FILTERS, scope: 'all', followUp: 'due', sort: 'followup', dir: 'asc' }); }}>Show them</button>
        </div>
      )}

      {top.length > 0 && (
        <section className="first-up">
          {top.map((r, i) => (
            <article key={r.place_id} className="first-card" onClick={() => onOpenLead(r.place_id)}>
              <div className="first-rank">#{i + 1}</div>
              <div className="first-body">
                <strong>{r.name}</strong>
                <small className="muted">{r.category} · {r.rating ?? '—'}★ · {fmt.num(r.review_count)} reviews</small>
                <ul>{topReasons(r, 3).map((t) => <li key={t}>{t}</li>)}</ul>
              </div>
              <div className="first-side" onClick={stop}>
                <span className="score-big num">{r.score}</span>
                {r.whatsapp && <a className="btn xs wa" href={waLink(r.whatsapp, messageFor(r, settings))} onClick={() => contacted(r)} target="_blank" rel="noreferrer">WhatsApp</a>}
                {r.phone_e164 && <a className="btn xs" href={`tel:${r.phone_e164}`} onClick={() => contacted(r)}>Call</a>}
              </div>
            </article>
          ))}
        </section>
      )}

      <section className="card filters">
        <input className="search" placeholder="Search name, phone, address, website, notes…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="chip-group">
          {TIERS.map(([k, l]) => <button key={k} className={`chip-btn ${filters.tier.includes(k) ? 'on' : ''}`} onClick={() => toggle('tier', k)}>{l}</button>)}
        </div>
        <div className="chip-group">
          {WEB.map(([k, l]) => <button key={k} className={`chip-btn ${filters.web.includes(k) ? 'on' : ''}`} onClick={() => toggle('web', k)}>{l}</button>)}
        </div>
        <div className="filter-selects">
          <select value={filters.minRating} onChange={(e) => patch({ minRating: e.target.value })}>
            <option value="">Any rating</option><option value="3.5">3.5★+</option><option value="4">4.0★+</option><option value="4.5">4.5★+</option>
          </select>
          <select value={filters.minReviews} onChange={(e) => patch({ minReviews: e.target.value })}>
            <option value="">Any reviews</option><option value="10">10+ reviews</option><option value="50">50+</option><option value="100">100+</option><option value="500">500+</option>
          </select>
          <select value={filters.category} onChange={(e) => patch({ category: e.target.value })}>
            <option value="">All Google types</option>
            {cats.map((c) => <option key={c.k} value={c.k}>{c.k} ({c.n})</option>)}
          </select>
          <select value={filters.leadStatus} onChange={(e) => patch({ leadStatus: e.target.value })}>
            <option value="">Any status</option>
            {LEAD_STATUSES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <select value={filters.contact} onChange={(e) => patch({ contact: e.target.value })}>
            <option value="">Any contact</option><option value="whatsapp">Has WhatsApp</option><option value="phone">Has phone</option><option value="email">Has email</option>
          </select>
          <select value={filters.followUp} onChange={(e) => patch(e.target.value ? { followUp: e.target.value, sort: 'followup', dir: 'asc' } : { followUp: '', sort: 'score', dir: 'desc' })}>
            <option value="">Any follow-up</option><option value="due">Follow-up due</option><option value="scheduled">Follow-up scheduled</option>
          </select>
          <button className="btn ghost xs" onClick={() => { setSearch(''); setFilters({ ...DEFAULT_FILTERS, scope: filters.scope }); }}>Reset</button>
        </div>
      </section>

      {selected.size > 0 && (
        <div className="bulkbar">
          <b>{selected.size} selected</b>
          <button className="btn xs" onClick={() => bulkStatus('contacted')}>Mark contacted</button>
          <button className="btn xs" onClick={() => bulkStatus('interested')}>Mark interested</button>
          <button className="btn xs" onClick={() => exportSelected('csv')}>Export CSV</button>
          <button className="btn xs" onClick={() => exportSelected('xlsx')}>Export Excel</button>
          <button className="btn xs ghost" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}

      <section className="card flush">
        <div className="table-wrap">
          <table className={`table leads ${loading ? 'is-loading' : ''}`}>
            <thead>
              <tr>
                <th className="check"><input type="checkbox" checked={allOnPage} onChange={togglePage} aria-label="Select page" /></th>
                <th className="r">#</th>
                <SortTh k="score">Priority</SortTh>
                <SortTh k="name">Business</SortTh>
                <th>Web presence</th>
                <SortTh k="rating" className="r">Rating</SortTh>
                <SortTh k="reviews" className="r">Reviews</SortTh>
                <th>Contact</th>
                <th>Why</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r, i) => {
                const [webLabel, webTone] = webBadge(r);
                return (
                  <tr key={r.place_id} className={`row t-${r.tier} ${selected.has(r.place_id) ? 'selected' : ''}`} onClick={() => onOpenLead(r.place_id)}>
                    <td className="check" onClick={stop}><input type="checkbox" checked={selected.has(r.place_id)} onChange={() => toggleRow(r.place_id)} /></td>
                    <td className="r num muted">{filters.page * PAGE_SIZE + i + 1}</td>
                    <td className="prio">
                      <div className="score"><span className={`score-num ${r.tier}`}>{r.score}</span><span className="score-bar"><i className={r.tier} style={{ width: `${r.score}%` }} /></span></div>
                    </td>
                    <td className="biz"><strong>{r.name}</strong><small>{r.category} · {shortAddr(r.address)}</small></td>
                    <td><span className={`badge ${webTone}`}>{webLabel}</span></td>
                    <td className="r num">{r.rating ? `${r.rating}★` : '—'}</td>
                    <td className="r num">{fmt.num(r.review_count)}</td>
                    <td onClick={stop}>
                      <div className="contact-icons">
                        {r.whatsapp && <a className={`ci wa ${r.whatsapp_source === 'website' ? 'verified' : ''}`} href={waLink(r.whatsapp, messageFor(r, settings))} onClick={() => contacted(r)} target="_blank" rel="noreferrer" title={r.whatsapp_source === 'website' ? 'WhatsApp link on website' : 'Mobile number — WhatsApp unverified'}>WA</a>}
                        {r.phone_e164 && <a className="ci" href={`tel:${r.phone_e164}`} onClick={() => contacted(r)} title={r.phone_intl}>Tel</a>}
                        {r.emails.length > 0 && <a className="ci" href={`mailto:${r.emails[0]}`} title={r.emails[0]}>@</a>}
                        {r.maps_url && <a className="ci" href={r.maps_url} target="_blank" rel="noreferrer" title="Open in Google Maps">Map</a>}
                      </div>
                    </td>
                    <td className="why"><span>{topReasons(r).join(' · ')}</span></td>
                    <td onClick={stop}>
                      <select className={`status s-${r.lead_status}`} value={r.lead_status} onChange={(e) => setStatus(r.place_id, e.target.value)}>
                        {LEAD_STATUSES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                      </select>
                      {r.follow_up_at && r.lead_status !== 'converted' && r.lead_status !== 'not_interested' && (
                        <div className={`mt-1 text-[11px] ${isDue(r.follow_up_at) ? 'font-semibold text-hot' : 'text-muted'}`}>⏰ Follow up {shortDate(r.follow_up_at)}</div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!loading && !data.rows.length && (
            <Empty title="No leads match">
              <p>{filters.scope === 'scan' && !scanId ? 'Select or start a scan, or switch to “All scans”.' : 'Loosen the filters or let the scan run longer.'}</p>
            </Empty>
          )}
        </div>
        <footer className="pager">
          <span className="muted">{fmt.num(from)}–{fmt.num(to)} of {fmt.num(data.total)} leads · sorted by {filters.sort}</span>
          <div>
            <button className="btn xs" disabled={filters.page === 0} onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}>← Prev</button>
            <button className="btn xs" disabled={to >= data.total} onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}>Next →</button>
          </div>
        </footer>
      </section>
      <p className="hint">Legend: <span className="ci wa verified">WA</span> WhatsApp link published on the business website · <span className="ci wa">WA</span> mobile number, WhatsApp not verified. <TierPill tier="hot" /> ≥ 65 · <TierPill tier="potential" /> ≥ 40</p>
    </div>
  );
}
