import { useState } from 'react';
import { TIER_LABEL, fmt } from '../lib/api.js';

export const StatusChip = ({ status }) => <span className={`chip st-${status}`}>{status}</span>;

export const TierPill = ({ tier, score }) => (
  <span className={`tier tier-${tier}`}>{TIER_LABEL[tier]}{score != null && <b className="num">{score}</b>}</span>
);

export function Meter({ label, value, max, hint, tone }) {
  const pct = Math.min(100, Math.round(((value || 0) / Math.max(max || 0, 1)) * 100));
  return (
    <div className="meter">
      <div className="meter-top"><span>{label}</span><span className="num">{fmt.num(value)} / {fmt.num(max)}</span></div>
      <div className="meter-track"><div className={`meter-fill ${tone || ''}`} style={{ width: `${pct}%` }} /></div>
      {hint && <small>{hint}</small>}
    </div>
  );
}

export const Kpi = ({ label, value, sub, tone }) => (
  <div className={`kpi ${tone || ''}`}>
    <span>{label}</span>
    <strong className="num">{value}</strong>
    {sub && <small>{sub}</small>}
  </div>
);

export const Empty = ({ title, children }) => (
  <div className="empty"><h3>{title}</h3>{children}</div>
);

export const PageHead = ({ eyebrow, title, children }) => (
  <header className="page-head">
    <div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1></div>
    {children && <div className="page-actions">{children}</div>}
  </header>
);

/** Horizontal bar list for small categorical breakdowns. Rows become buttons when onSelect is given. */
export function Bars({ rows = [], labels = {}, tones = {}, onSelect, percent }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  const sum = rows.reduce((s, r) => s + r.n, 0) || 1;
  if (!rows.length) return <p className="muted small">No data yet.</p>;
  return (
    <ul className="bars">
      {rows.map((r) => {
        const label = labels[r.k] || r.k || '—';
        const cells = (
          <>
            <span className="bars-label">{label}</span>
            <span className="bars-track"><span className={`bars-fill ${tones[r.k] || ''}`} style={{ width: `${(r.n / max) * 100}%` }} /></span>
            <span className="num bars-n">{percent ? `${Math.round((r.n / sum) * 100)}%` : fmt.num(r.n)}</span>
          </>
        );
        return (
          <li key={String(r.k)} className={onSelect ? undefined : 'bars-row'}>
            {onSelect ? (
              <button
                type="button"
                className="bars-row -mx-1.5 w-[calc(100%+0.75rem)] cursor-pointer rounded-md px-1.5 py-0.5 text-left hover:bg-panel-2 hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
                title={`Show ${fmt.num(r.n)} ${label} leads`}
                onClick={() => onSelect(r.k)}
              >
                {cells}
              </button>
            ) : cells}
          </li>
        );
      })}
    </ul>
  );
}

/** Password field with a show/hide toggle. */
export function PasswordInput({ value, onChange, autoComplete, placeholder, required }) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative block">
      <input type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete}
        placeholder={placeholder} required={required} className="!pr-16" />
      <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide password' : 'Show password'}
        className="absolute top-1/2 right-1.5 h-7 -translate-y-1/2 cursor-pointer rounded-md px-2 text-xs text-muted hover:bg-panel-2 hover:text-ink">
        {show ? 'Hide' : 'Show'}
      </button>
    </span>
  );
}

/**
 * Tab bar for one filter dimension. tabs: [{ value, label, icon, n }] where value '' means "all".
 * variant 'underline' for the primary row, 'pill' for secondary rows.
 */
export function FilterTabs({ tabs, value, onChange, variant = 'underline', ariaLabel }) {
  const pill = variant === 'pill';
  return (
    <nav aria-label={ariaLabel} className={pill ? 'flex flex-wrap items-center gap-1.5' : 'flex flex-wrap items-end gap-1 border-b border-line'}>
      {tabs.map((t) => {
        const on = value === t.value;
        const look = pill
          ? `h-8 rounded-full border px-3 ${on ? 'border-ink bg-ink text-white' : 'border-line bg-panel text-ink-2 hover:border-[#cfcabe] hover:text-ink'}`
          : `-mb-px rounded-t-lg border px-3.5 py-2 ${on ? 'border-line border-b-panel bg-panel font-semibold text-ink' : 'border-transparent text-ink-2 hover:bg-panel/60 hover:text-ink'}`;
        return (
          <button key={t.value || 'all'} type="button" aria-pressed={on} onClick={() => onChange(t.value)}
            className={`flex cursor-pointer items-center gap-1.5 text-[13px] ${look}`}>
            {t.icon && <span className="text-base leading-none">{t.icon}</span>}
            {t.label}
            <span className={`rounded-full px-1.5 text-[11px] leading-[18px] tabular-nums ${on ? (pill ? 'bg-white/20 text-white' : 'bg-ink text-white') : 'bg-line-2 text-muted'}`}>
              {fmt.num(t.n)}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
