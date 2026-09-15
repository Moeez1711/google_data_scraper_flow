import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { ANGLES, DEFAULT_SETTINGS, renderMessage, TEMPLATE_VARS } from '../lib/outreach.js';
import { PageHead } from './ui.jsx';

const SAMPLE = { name: 'Nabu Cafe', category: 'Coffee shop', rating: 4.8, review_count: 326, website: 'https://instagram.com/nabucafe', site_status: 'social_only' };

export default function OutreachSettings({ settings, onSave, notify }) {
  const [draft, setDraft] = useState(settings);
  const [angle, setAngle] = useState('no_website');
  const [sample, setSample] = useState(SAMPLE);
  const [saving, setSaving] = useState(false);

  useEffect(() => setDraft(settings), [settings]);
  useEffect(() => {
    api.get('/leads?tier=hot&limit=1').then((d) => d.rows[0] && setSample(d.rows[0])).catch(() => {});
  }, []);

  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);
  const setField = (k) => (e) => setDraft((d) => ({ ...d, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const setTemplate = (value) => setDraft((d) => ({ ...d, templates: { ...d.templates, [angle]: value } }));

  async function save() {
    setSaving(true);
    try { await onSave(draft); notify('Outreach settings saved', 'success'); }
    catch (e) { notify(e.message, 'error'); }
    finally { setSaving(false); }
  }

  return (
    <div className="page">
      <PageHead eyebrow="06 · Outreach" title="Message templates">
        <button className="btn ghost" disabled={!dirty} onClick={() => setDraft(settings)}>Discard</button>
        <button className="btn primary" disabled={!dirty || saving} onClick={save}>{saving ? 'Saving…' : 'Save changes'}</button>
      </PageHead>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,4fr)]">
        <section className="card flex flex-col gap-3.5">
          <div className="field-row">
            <label className="field"><span>Your name</span><input value={draft.myName} onChange={setField('myName')} placeholder="e.g. Ahmed" /></label>
            <label className="field"><span>Company <em>optional</em></span><input value={draft.myCompany} onChange={setField('myCompany')} placeholder="e.g. Muscat Web Studio" /></label>
          </div>
          <label className="flex items-center gap-2 text-sm text-ink-2">
            <input type="checkbox" checked={draft.autoMarkContacted} onChange={setField('autoMarkContacted')} />
            Mark a lead as “Contacted” when I open WhatsApp, email or call from Lead Scout
          </label>

          <div className="seg wrap">
            {ANGLES.map(([k, l]) => <button key={k} className={angle === k ? 'on' : ''} onClick={() => setAngle(k)}>{l}</button>)}
          </div>
          <textarea rows={11} className="font-mono text-[13px] leading-relaxed" value={draft.templates[angle]} onChange={(e) => setTemplate(e.target.value)} />
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
            <span>Insert:</span>
            {TEMPLATE_VARS.map((v) => (
              <button key={v} type="button" className="h-[22px] cursor-pointer rounded-full bg-line-2 px-2 font-mono text-[11.5px] text-ink-2 hover:bg-accent-soft"
                onClick={() => setTemplate(`${draft.templates[angle]}${v}`)}>{v}</button>
            ))}
            <button type="button" className="btn xs ghost ml-auto" onClick={() => setTemplate(DEFAULT_SETTINGS.templates[angle])}>Reset to default</button>
          </div>
          <p className="hint">
            Lead Scout picks the angle for each lead from its real web presence. <code>{'{compliment}'}</code> only mentions the rating when it is 4.3★+ with 20+ reviews,
            and <code>{'{signoff}'}</code> uses your name and company.
          </p>
        </section>

        <section className="card">
          <div className="card-head"><h3>Preview</h3><span className="muted small">using {sample.name}</span></div>
          <div className="whitespace-pre-wrap rounded-2xl rounded-tl-sm bg-wa-soft px-4 py-3 text-[13.5px] leading-relaxed text-ink">
            {renderMessage(draft.templates[angle], sample, draft)}
          </div>
          <p className="hint mt-3">Nothing is ever sent automatically — WhatsApp opens with this text and you press send.</p>
        </section>
      </div>
    </div>
  );
}
