import { useEffect, useState } from 'react';
import { api, fmt } from '../lib/api.js';
import { Meter, PageHead } from './ui.jsx';

const LIMIT_FIELDS = [
  { k: 'monthlySearchLimit', label: 'Monthly search limit', unit: 'searches / month', hint: 'Hard stop for all scans combined. 1,000 = Google’s free allowance. 0 = no limit.' },
  { k: 'dailySearchLimit', label: 'Daily search limit', unit: 'searches / day', hint: 'Spreads usage across the month — 33/day ≈ 1,000/month. 0 = no daily limit.' },
  { k: 'defaultScanBudget', label: 'Default budget per scan', unit: 'searches', hint: 'Pre-filled in Search Configuration; you can still change it per scan.' },
  { k: 'defaultTargetCount', label: 'Default leads per scan', unit: 'leads', hint: 'Pre-filled “Leads to collect”.' },
  { k: 'cacheHours', label: 'Reuse identical searches for', unit: 'hours', hint: 'Repeating the same search inside this window is free. 0 turns reuse off.' },
];
const PRICING_FIELDS = [
  { k: 'freeSearchesPerMonth', label: 'Free searches per month', unit: 'searches', hint: 'Google’s free Text Search Enterprise allowance — confirm on your billing page.' },
  { k: 'costPer1000', label: 'Price after the free allowance', unit: 'USD / 1,000', hint: 'Used only for estimates in the app.', step: '0.01' },
];
const PRESETS = [
  ['Stay free', { monthlySearchLimit: 1000, dailySearchLimit: 33 }],
  ['Moderate', { monthlySearchLimit: 1500, dailySearchLimit: 50 }],
  ['Heavy', { monthlySearchLimit: 3000, dailySearchLimit: 100 }],
  ['No limits', { monthlySearchLimit: 0, dailySearchLimit: 0 }],
];

function Field({ f, value, onChange }) {
  return (
    <label className="grid gap-1.5 border-b border-line-2 pb-4 last:border-0 last:pb-0 sm:grid-cols-[1fr_250px] sm:items-center sm:gap-4">
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-semibold text-ink">{f.label}</span>
        <small className="text-muted">{f.hint}</small>
      </span>
      <span className="flex items-center gap-2">
        <input type="number" min="0" step={f.step || '1'} value={value} onChange={onChange} className="text-right tabular-nums" />
        <span className="w-28 shrink-0 text-xs text-muted">{f.unit}</span>
      </span>
    </label>
  );
}

export default function SettingsPage({ notify }) {
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = () => api.get('/limits').then((u) => { setData(u); setDraft(u.limits); });
  useEffect(() => { load().catch((e) => notify(e.message, 'error')); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data || !draft) return <div className="loading">Loading…</div>;

  const dirty = JSON.stringify(draft) !== JSON.stringify(data.limits);
  const set = (k) => (e) => setDraft({ ...draft, [k]: e.target.value === '' ? '' : Number(e.target.value) });
  const costAt = (limit) => (Number(limit) > 0 ? (Math.max(0, Number(limit) - Number(draft.freeSearchesPerMonth || 0)) * Number(draft.costPer1000 || 0)) / 1000 : null);
  const { searches: s, limits: l, remaining } = data;
  const worst = costAt(draft.monthlySearchLimit);

  async function save() {
    setSaving(true);
    try {
      const u = await api.put('/limits', draft);
      setData(u); setDraft(u.limits);
      notify('Limits saved — they apply to scans immediately', 'success');
    } catch (e) { notify(e.message, 'error'); }
    finally { setSaving(false); }
  }

  return (
    <div className="page">
      <PageHead eyebrow="07 · Settings" title="Usage limits & cost control">
        <button className="btn ghost" onClick={() => load()}>Refresh usage</button>
        <button className="btn ghost" disabled={!dirty} onClick={() => setDraft(data.limits)}>Discard</button>
        <button className="btn primary" disabled={!dirty || saving} onClick={save}>{saving ? 'Saving…' : 'Save limits'}</button>
      </PageHead>

      <section className="card grid gap-6 md:grid-cols-3">
        <Meter label="Business searches this month" value={s.month} max={l.monthlySearchLimit || Math.max(s.month, l.freeSearchesPerMonth)}
          tone={l.monthlySearchLimit && s.month >= l.monthlySearchLimit * 0.85 ? 'warn' : 'accent'}
          hint={l.monthlySearchLimit ? `${fmt.num(remaining.month)} left before the monthly limit` : 'No monthly limit — bar shows the free allowance'} />
        <Meter label="Business searches today" value={s.today} max={l.dailySearchLimit || Math.max(s.today, 1)}
          tone={l.dailySearchLimit && s.today >= l.dailySearchLimit * 0.85 ? 'warn' : 'accent'}
          hint={l.dailySearchLimit ? `${fmt.num(remaining.today)} left today` : 'No daily limit set'} />
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-semibold text-ink-2">Estimated Google cost this month</span>
          <strong className={`text-2xl font-[650] tabular-nums ${data.estMonthCostUsd > 0 ? 'text-hot' : 'text-good'}`}>${data.estMonthCostUsd.toFixed(2)}</strong>
          <small className="text-muted">{fmt.num(data.freeLeftThisMonth)} free searches left · {fmt.num(s.areaLookupsMonth)} area lookups (separate 5,000 free)</small>
        </div>
      </section>

      <section className="card flex flex-wrap items-center gap-2">
        <span className="mr-1 text-sm font-semibold text-ink-2">Presets</span>
        {PRESETS.map(([label, values]) => {
          const on = draft.monthlySearchLimit === values.monthlySearchLimit && draft.dailySearchLimit === values.dailySearchLimit;
          const c = costAt(values.monthlySearchLimit);
          return (
            <button key={label} type="button" className={`chip-btn ${on ? 'on' : ''}`} onClick={() => setDraft({ ...draft, ...values })}>
              {label} · {values.monthlySearchLimit ? `${fmt.num(values.monthlySearchLimit)}/mo, ${values.dailySearchLimit}/day · ≤ $${c.toFixed(2)}` : 'unlimited'}
            </button>
          );
        })}
        <span className={`ml-auto text-xs ${worst == null ? 'font-semibold text-hot' : 'text-muted'}`}>
          {worst == null ? 'No monthly cap — cost is unbounded' : `Worst case at your monthly limit: $${worst.toFixed(2)}/month`}
        </span>
      </section>

      <div className="grid items-start gap-4 xl:grid-cols-2">
        <section className="card flex flex-col gap-4">
          <div className="card-head !mb-0"><h3>Limits</h3>{dirty && <span className="text-xs font-semibold text-pot">Unsaved changes</span>}</div>
          {LIMIT_FIELDS.map((f) => <Field key={f.k} f={f} value={draft[f.k]} onChange={set(f.k)} />)}
        </section>
        <section className="card flex flex-col gap-4">
          <div className="card-head !mb-0"><h3>Pricing for estimates</h3></div>
          {PRICING_FIELDS.map((f) => <Field key={f.k} f={f} value={draft[f.k]} onChange={set(f.k)} />)}
          <div className="rounded-lg bg-panel-2 p-3.5 text-xs leading-relaxed text-ink-2">
            <b className="text-ink">How limits work.</b> Before every billed Google search the server checks these limits. When one is reached the
            running scan pauses with a message — resume it after raising the limit, or the next day/month. Starting a scan is blocked while you are at a limit.
            Reused (cached) searches, website checks and exports never count. Area lookups and map loads have separate, larger free allowances and are not capped here.
            For a guarantee enforced by Google itself, also set a quota in Cloud Console → Places API (New) → Quotas.
          </div>
        </section>
      </div>
    </div>
  );
}
