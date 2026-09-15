import { useEffect, useState } from 'react';
import { api, fmt } from '../lib/api.js';
import MapView from './MapView.jsx';
import { PageHead } from './ui.jsx';

const LS_KEY = 'leadscout.config';
const DEFAULTS = {
  country: 'OM', area: '', category: 'Cafés', keywords: '',
  targetCount: 100, targetMode: 'discovered', maxApiCalls: 150,
};

// Rough requests needed: ~10 businesses per billed request once dense areas are split (duplicates included);
// qualified targets need more because only some businesses score Hot or Potential.
const neededFor = (f) => Math.max(3, Math.ceil((Number(f.targetCount) || 0) / (f.targetMode === 'qualified' ? 4 : 10)));
// Auto-filled budget: 50% headroom over the estimate. A scan stops once it hits its target, so unused budget is not spent.
const budgetFor = (f) => Math.min(10000, Math.ceil(neededFor(f) * 1.5));

const areaKm = (b) => b && {
  w: Math.abs(b.east - b.west) * 111.32 * Math.cos((((b.north + b.south) / 2) * Math.PI) / 180),
  h: Math.abs(b.north - b.south) * 110.574,
};

export default function SearchConfig({ meta, scans, onStarted, notify }) {
  const [hasSaved] = useState(() => { try { return Boolean(localStorage.getItem(LS_KEY)); } catch { return false; } });
  const [form, setForm] = useState(() => {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch { /* storage blocked */ }
    const areas = Array.isArray(saved.areas) ? saved.areas : saved.area ? [saved.area] : [];
    return { ...DEFAULTS, ...saved, areas, category: saved.category ?? (saved.customCategory || DEFAULTS.category) };
  });
  const [draft, setDraft] = useState('');
  // Add one or more places; pasted text splits on new lines (commas stay, e.g. "Al Khuwair, Muscat").
  const addAreas = (text) => {
    const add = String(text).split(/\n|;/).map((a) => a.trim()).filter(Boolean);
    if (add.length) setForm((f) => ({ ...f, areas: [...new Set([...(f.areas || []), ...add])].slice(0, 20) }));
    setDraft('');
  };
  const removeArea = (a) => setForm((f) => ({ ...f, areas: f.areas.filter((x) => x !== a) }));
  const [area, setArea] = useState(null);
  const [bounds, setBounds] = useState(null);
  const [edited, setEdited] = useState(false);
  const [busy, setBusy] = useState('');
  const [usage, setUsage] = useState(null);

  useEffect(() => {
    api.get('/limits').then((u) => {
      setUsage(u);
      if (!hasSaved) setForm((f) => ({ ...f, targetCount: u.limits.defaultTargetCount, maxApiCalls: u.limits.defaultScanBudget }));
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { try { localStorage.setItem(LS_KEY, JSON.stringify(form)); } catch { /* storage blocked */ } }, [form]);
  useEffect(() => { setArea(null); setBounds(null); setEdited(false); }, [form.country, (form.areas || []).join('\n')]);

  // Changing the lead target or how it is counted refills the budget with headroom; the budget stays hand-editable after.
  const set = (k) => (e) => setForm((f) => {
    const next = { ...f, [k]: e.target.value };
    if (k === 'targetCount' || k === 'targetMode') next.maxApiCalls = budgetFor(next);
    return next;
  });
  // A typed value matching a built-in category uses its tuned query and value tier; anything else is searched as typed.
  const typed = (form.category || '').trim();
  const match = meta?.categories.find((c) => c.label.toLowerCase() === typed.toLowerCase());
  const groups = Object.entries(Object.groupBy(meta?.categories || [], (c) => c.group));
  const { radiusKm: _legacyRadius, area: _legacyArea, ...fields } = form; // old saved forms may still carry these
  // A typed-but-not-added place still counts, so nobody loses it by forgetting to press Enter.
  const areas = [...new Set([...(form.areas || []), draft.trim()].filter(Boolean))];
  const payload = { ...fields, areas, categoryId: match?.id || null, customCategory: match ? '' : typed };
  const running = scans.find((s) => s.active);
  const needed = neededFor(form);
  const km = areaKm(bounds);

  async function preview() {
    setBusy('preview');
    try {
      const a = await api.post('/area/resolve', payload);
      setArea(a); setBounds(a.bounds); setEdited(false);
    } catch (e) { notify(e.message, 'error'); }
    finally { setBusy(''); }
  }

  async function start(e) {
    e.preventDefault();
    setBusy('start');
    try {
      const scan = await api.post('/scans', { ...payload, bounds: (!area?.parts && bounds) || undefined });
      if (draft.trim()) addAreas(draft);
      notify(`Scan #${scan.id} started`, 'success');
      onStarted(scan);
    } catch (err) { notify(err.message, 'error'); }
    finally { setBusy(''); }
  }

  if (!meta) return <div className="loading">Loading…</div>;

  return (
    <div className="page">
      <PageHead eyebrow="01 · Search configuration" title="Where are we hunting today?" />

      <div className="config-grid">
        <form className="card form" onSubmit={start}>
          <div className="field-row">
            <label className="field">
              <span>Country</span>
              <select value={form.country} onChange={set('country')}>
                {meta.countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
              </select>
            </label>
            <div className="field grow">
              <span>Cities / areas / neighbourhoods <em>add as many as you like · leave empty to scan the whole country</em></span>
              {form.areas?.length > 0 && (
                <div className="mb-1.5 flex flex-wrap gap-1.5">
                  {form.areas.map((a) => (
                    <span key={a} className="chip inline-flex items-center gap-1">
                      {a}
                      <button type="button" className="cursor-pointer px-0.5 text-muted hover:text-hot" aria-label={`Remove ${a}`} onClick={() => removeArea(a)}>×</button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input
                  className="grow"
                  aria-label="Add a city or area"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addAreas(draft); } }}
                  onPaste={(e) => { const t = e.clipboardData.getData('text'); if (/\n/.test(t.trim())) { e.preventDefault(); addAreas(t); } }}
                  placeholder={form.areas?.length ? 'Add another, e.g. Sohar' : `All of ${meta.countries.find((c) => c.code === form.country)?.name || 'the country'} — or type a city and press Enter`}
                />
                <button type="button" className="btn ghost" disabled={!draft.trim()} onClick={() => addAreas(draft)}>Add</button>
              </div>
            </div>
          </div>

          <div className="field">
            <span>Business category <em>pick from {meta.categories.length} built-in categories or type your own</em></span>
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <input list="category-options" aria-label="Business category" value={form.category} onChange={set('category')} placeholder="e.g. Dentists, car wash, printing press" required />
              <select aria-label="Browse all categories" value={match?.label || ''} onChange={(e) => e.target.value && setForm((f) => ({ ...f, category: e.target.value }))}>
                <option value="">Browse all categories…</option>
                {groups.map(([group, list]) => (
                  <optgroup key={group} label={group}>
                    {list.map((c) => <option key={c.id} value={c.label}>{c.label}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
            <datalist id="category-options">
              {meta.categories.map((c) => <option key={c.id} value={c.label}>{`${c.group} · ${c.value}-value`}</option>)}
            </datalist>
            {typed && (
              <small className="text-muted">
                {match ? `Built-in category · ${match.group} · ${match.value}-value` : 'Custom category · searched exactly as typed, scored as mid-value'}
              </small>
            )}
          </div>

          <label className="field">
            <span>Keywords <em>optional</em></span>
            <input value={form.keywords} onChange={set('keywords')} placeholder="e.g. specialty coffee, family" />
          </label>

          <p className="hint">
            <b>Strict category match is always on</b> — only businesses whose name or Google category contains “{typed || 'the category'}” are kept.
            e.g. Honey shops keeps “Al Jahwari Honey” and “عسل الجبل”, and skips supermarkets and cafés Google adds as loose matches.
          </p>

          <div className="field-row">
            <label className="field">
              <span>Leads to collect</span>
              <input type="number" min="1" max="5000" value={form.targetCount} onChange={set('targetCount')} />
            </label>
            <label className="field grow">
              <span>Count toward target</span>
              <select value={form.targetMode} onChange={set('targetMode')}>
                <option value="discovered">All businesses discovered</option>
                <option value="qualified">Only Hot + Potential leads</option>
              </select>
            </label>
          </div>

          <label className="field">
            <span>API request budget</span>
            <input type="number" min="1" max="10000" value={form.maxApiCalls} onChange={set('maxApiCalls')} />
          </label>
          <p className="hint">
            This scan stops after {form.maxApiCalls} billed searches (up to 20 businesses each; repeated searches are free).
            {usage && (usage.remaining.month != null ? ` ${fmt.num(usage.remaining.month)} searches left under your monthly limit` : ' No monthly limit set')}
            {usage?.remaining.today != null && ` · ${fmt.num(usage.remaining.today)} left today`}
            {usage && ` · ${fmt.num(usage.freeLeftThisMonth)} free searches left this month.`}
          </p>
          {Number(form.maxApiCalls) < needed && (
            <p className="hint warn">
              A budget of {form.maxApiCalls} is probably too small for {form.targetCount} leads. Each request returns at most 20 businesses, and going past 60 means splitting the area and searching each part again. Plan on roughly {needed} requests.{' '}
              <button type="button" className="link" onClick={() => setForm((f) => ({ ...f, maxApiCalls: needed }))}>Use {needed}</button>
            </p>
          )}
          {usage && Math.min(...[usage.remaining.month, usage.remaining.today].filter((x) => x != null)) < Number(form.maxApiCalls) && (
            <p className="hint warn">Your limits in Settings will pause this scan before it uses its full budget.</p>
          )}

          <div className="form-actions">
            <button type="button" className="btn ghost" onClick={preview} disabled={Boolean(busy)}>
              {busy === 'preview' ? 'Locating…' : 'Preview area'}
            </button>
            <button className="btn primary" disabled={busy || Boolean(running)}>
              {busy === 'start' ? 'Starting…' : 'Start scan'}
            </button>
          </div>
          {running && <p className="hint warn">Scan #{running.id} is running — pause or stop it before starting another.</p>}
          {!meta.placesKeyConfigured && <p className="hint warn">GOOGLE_PLACES_API_KEY is missing on the server.</p>}
        </form>

        <section className="card map-card">
          <div className="card-head">
            <h3>Scan area</h3>
            {area && (
              <span className="muted small">
                {area.parts ? `${area.parts.length} areas: ${area.parts.map((p) => p.name).join(', ')}` : area.name}{area.expanded ? ' · around a point' : ''} · {km.w.toFixed(1)} × {km.h.toFixed(1)} km{edited ? ' · edited' : ''}
              </span>
            )}
          </div>
          <MapView bounds={bounds} editable={!area?.parts} onBoundsChange={(b) => { setBounds(b); setEdited(true); }} height={430} />
          <p className="hint">
            {area
              ? 'Drag or resize the rectangle to tighten the scan. Dense areas are subdivided automatically, so coverage continues past Google’s 60-results-per-search limit.'
              : 'Preview the area to confirm Google found the right place before spending API requests.'}
          </p>
        </section>
      </div>

      {scans.length > 0 && (
        <section className="card">
          <div className="card-head"><h3>Reuse a previous search</h3></div>
          <div className="chips">
            {scans.slice(0, 10).map((s) => (
              <button key={s.id} className="chip-btn" onClick={() => setForm((f) => ({
                ...f, country: s.config.country, areas: s.config.areas || [s.config.area], keywords: s.config.keywords, category: s.config.categoryLabel,
              }))}>
                {s.config.categoryLabel} · {s.config.area}, {s.config.country}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
