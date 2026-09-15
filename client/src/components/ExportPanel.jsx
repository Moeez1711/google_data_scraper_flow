import { useEffect, useState } from 'react';
import { api, download, fmt, leadParams, qs } from '../lib/api.js';
import { PageHead } from './ui.jsx';

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
const regionName = (code) => { try { return regionNames.of(code); } catch { return code; } };

const COLUMNS = ['Tier', 'Score', 'Business', 'Category', 'Phone', 'WhatsApp', 'WhatsApp source', 'Emails', 'Website', 'Website status',
  'Design', 'Mobile', 'HTTPS', 'Rating', 'Reviews', 'Business status', 'Address', 'Google Maps', 'Instagram', 'Facebook',
  'Lead status', 'Notes', 'Follow-up', 'Last contacted', 'Why this score', 'Place ID'];

export default function ExportPanel({ scanId, filters, selected, notify }) {
  const [scope, setScope] = useState(selected.size ? 'selected' : 'filtered');
  const [format, setFormat] = useState('xlsx');
  const [count, setCount] = useState(null);
  const [busy, setBusy] = useState(false);
  const [category, setCategory] = useState('');
  const [categories, setCategories] = useState([]);
  const [sheets, setSheets] = useState(null);
  const [sheet, setSheet] = useState(() => { try { return localStorage.getItem('leadscout.sheet') || ''; } catch { return ''; } });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(null);

  useEffect(() => { api.get('/export/sheets').then(setSheets).catch(() => {}); }, []);
  useEffect(() => { try { localStorage.setItem('leadscout.sheet', sheet); } catch { /* storage blocked */ } }, [sheet]);

  async function toSheets() {
    setSending(true); setSent(null);
    try {
      const r = await api.post('/export/sheets', { sheet, ...payload });
      setSent(r); notify(`Sent ${fmt.num(r.rows)} leads to Google Sheets`, 'success');
    } catch (e) { notify(e.message, 'error'); }
    finally { setSending(false); }
  }

  const sid = filters.scope === 'scan' ? scanId : '';
  const [country, setCountry] = useState('');
  const [countries, setCountries] = useState([]);
  useEffect(() => {
    api.get(`/leads/search-categories${qs({ scanId: sid })}`).then((d) => setCategories(d.rows || [])).catch(() => {});
    api.get(`/leads/countries${qs({ scanId: sid })}`).then((d) => setCountries(d || [])).catch(() => {});
  }, [sid]);

  const base = {
    selected: { ids: [...selected] },
    filtered: { filters: leadParams(filters, scanId) },
    qualified: { filters: { scanId: sid, tier: 'hot,potential' } },
    uncontacted: { filters: { scanId: sid, tier: 'hot,potential', leadStatus: 'not_contacted' } },
    all: { filters: { scanId: sid } },
  }[scope];
  // Country and category pickers narrow every filter-based export (e.g. only Oman honey shops, UAE kept separate).
  const payload = base.filters
    ? { filters: { ...base.filters, ...(country && { country }), ...(category && { searchCategory: category }) } }
    : base;

  useEffect(() => {
    if (scope === 'selected') { setCount(selected.size); return; }
    api.get(`/leads${qs({ ...payload.filters, limit: 1 })}`).then((d) => setCount(d.total)).catch(() => setCount(null));
  }, [scope, JSON.stringify(payload)]); // eslint-disable-line react-hooks/exhaustive-deps

  async function run() {
    setBusy(true);
    try { await download(format, payload); notify(`Exported ${count} leads`, 'success'); }
    catch (e) { notify(e.message, 'error'); }
    finally { setBusy(false); }
  }

  const options = [
    ['selected', `Selected leads (${selected.size})`, 'Rows you ticked in Lead Results'],
    ['filtered', 'Current Lead Results filters', 'Exactly what the table shows, all pages'],
    ['uncontacted', 'Hot + Potential, not contacted', 'Today’s call list'],
    ['qualified', 'All Hot + Potential', 'Every qualified lead'],
    ['all', 'Everything', 'All businesses in scope (permanently closed excluded)'],
  ];

  return (
    <div className="page">
      <PageHead eyebrow="05 · Export" title="Take leads with you" />
      <div className="config-grid">
        <section className="card">
          <div className="card-head"><h3>What to export</h3><span className="muted small">scope: {filters.scope === 'scan' && scanId ? `scan #${scanId}` : 'all scans'}</span></div>
          <div className="radio-list">
            {options.map(([k, label, hint]) => (
              <label key={k} className={`radio ${scope === k ? 'on' : ''} ${k === 'selected' && !selected.size ? 'disabled' : ''}`}>
                <input type="radio" name="scope" checked={scope === k} disabled={k === 'selected' && !selected.size} onChange={() => setScope(k)} />
                <span><b>{label}</b><small>{hint}</small></span>
              </label>
            ))}
          </div>
          <div className="field-row">
            <label className="field grow">
              <span>Country <em>{scope === 'selected' ? 'not used for selected leads' : 'keep countries separate'}</em></span>
              <select value={country} disabled={scope === 'selected'} onChange={(e) => setCountry(e.target.value)}>
                <option value="">All countries</option>
                {countries.map((c) => <option key={c.k} value={c.k}>{regionName(c.k)} ({fmt.num(c.n)})</option>)}
              </select>
            </label>
            <label className="field grow">
              <span>Category <em>{scope === 'selected' ? 'not used for selected leads' : 'one searched category'}</em></span>
              <select value={category} disabled={scope === 'selected'} onChange={(e) => setCategory(e.target.value)}>
                <option value="">All categories</option>
                {categories.map((c) => <option key={c.k} value={c.k}>{c.k} ({fmt.num(c.n)})</option>)}
              </select>
            </label>
          </div>
          <div className="field-row">
            <div className="seg">
              <button className={format === 'xlsx' ? 'on' : ''} onClick={() => setFormat('xlsx')}>Excel (.xlsx)</button>
              <button className={format === 'csv' ? 'on' : ''} onClick={() => setFormat('csv')}>CSV</button>
            </div>
            <button className="btn primary" disabled={busy || !count} onClick={run}>
              {busy ? 'Preparing…' : `Export ${count == null ? '' : fmt.num(count)} leads`}
            </button>
          </div>
          <p className="hint">Up to 5,000 rows per export, sorted by score. CSV is UTF-8 with BOM so Arabic names open correctly in Excel.</p>

          <div className="card-head mt-5"><h3>Google Sheets</h3><span className="muted small">each send adds a new tab</span></div>
          {sheets && !sheets.configured && (
            <p className="hint warn">{sheets.error || 'Not set up yet: put your service account key file path in GOOGLE_SERVICE_ACCOUNT_FILE in .env, then restart the server.'}</p>
          )}
          {sheets?.configured && (
            <>
              <label className="field">
                <span>Google Sheet link <em>share the Sheet with <b className="select-all">{sheets.email}</b> as Editor</em></span>
                <input value={sheet} onChange={(e) => setSheet(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" />
              </label>
              <button className="btn" disabled={sending || !count || !sheet.trim()} onClick={toSheets}>
                {sending ? 'Sending…' : `Send ${count == null ? '' : fmt.num(count)} leads to Google Sheets`}
              </button>
              {sent && (
                <p className="hint">Added tab “{sent.tab}” with {fmt.num(sent.rows)} rows · <a href={sent.url} target="_blank" rel="noreferrer">Open the Sheet</a></p>
              )}
            </>
          )}
        </section>
        <section className="card">
          <div className="card-head"><h3>Columns</h3></div>
          <div className="chips">{COLUMNS.map((c) => <span key={c} className="chip">{c}</span>)}</div>
        </section>
      </div>
    </div>
  );
}
