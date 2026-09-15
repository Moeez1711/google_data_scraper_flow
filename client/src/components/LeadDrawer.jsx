import { useEffect, useRef, useState } from 'react';
import { api, fmt, LEAD_STATUSES, webBadge } from '../lib/api.js';
import { ANGLES, fromDateInput, inDays, isDue, pickAngle, renderMessage, shortDate, toDateInput, waLink } from '../lib/outreach.js';
import { TierPill } from './ui.jsx';

const Yes = ({ v, yes = 'Yes', no = 'No' }) => (v == null ? <span className="muted">Not available</span> : <span className={v ? 'ok' : 'bad'}>{v ? yes : no}</span>);

export default function LeadDrawer({ placeId, onClose, onChanged, leadsVersion, notify, settings, onPrev, onNext, position }) {
  const [lead, setLead] = useState(null);
  const [notes, setNotes] = useState('');
  const [saved, setSaved] = useState('');
  const dirty = useRef(false);
  const [angle, setAngle] = useState(null);
  const [message, setMessage] = useState('');
  const msgDirty = useRef(false);

  useEffect(() => { dirty.current = false; msgDirty.current = false; setAngle(null); setLead(null); }, [placeId]);
  useEffect(() => {
    let off = false;
    api.get(`/leads/${placeId}`).then((l) => {
      if (off) return;
      setLead(l);
      if (!dirty.current) setNotes(l.notes);
    }).catch((e) => notify(e.message, 'error'));
    return () => { off = true; };
  }, [placeId, leadsVersion, notify]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '')) return;
      if ((e.key === 'j' || e.key === 'ArrowDown') && onNext) { e.preventDefault(); onNext(); }
      if ((e.key === 'k' || e.key === 'ArrowUp') && onPrev) { e.preventDefault(); onPrev(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, onNext, onPrev]);

  useEffect(() => {
    if (!dirty.current) return undefined;
    setSaved('Saving…');
    const t = setTimeout(async () => {
      try { await api.patch(`/leads/${placeId}`, { notes }); dirty.current = false; setSaved('Saved'); }
      catch (e) { setSaved(''); notify(e.message, 'error'); }
    }, 700);
    return () => clearTimeout(t);
  }, [notes, placeId, notify]);

  async function setStatus(lead_status) {
    try { setLead(await api.patch(`/leads/${placeId}`, { lead_status })); onChanged(); }
    catch (e) { notify(e.message, 'error'); }
  }
  async function reanalyze() {
    try { setLead(await api.post(`/leads/${placeId}/reanalyze`)); notify('Website queued for re-analysis', 'info'); }
    catch (e) { notify(e.message, 'error'); }
  }
  async function markContacted() {
    if (!settings.autoMarkContacted) return;
    try { setLead(await api.patch(`/leads/${placeId}`, { contacted: true })); onChanged(); } catch { /* never block outreach */ }
  }
  async function setFollowUp(ts) {
    try { setLead(await api.patch(`/leads/${placeId}`, { follow_up_at: ts })); onChanged(); }
    catch (e) { notify(e.message, 'error'); }
  }
  async function copyMessage() {
    try { await navigator.clipboard.writeText(message); notify('Message copied', 'success'); }
    catch { notify('Clipboard blocked — select the text and copy it manually', 'error'); }
  }

  const activeAngle = angle || (lead ? pickAngle(lead) : 'general');
  useEffect(() => {
    if (lead && !msgDirty.current) setMessage(renderMessage(settings.templates[activeAngle], lead, settings));
  }, [lead, activeAngle, settings]);
  const chooseAngle = (k) => { msgDirty.current = false; setAngle(k); if (lead) setMessage(renderMessage(settings.templates[k], lead, settings)); };

  const site = lead?.site;
  const [webLabel, webTone] = lead ? webBadge(lead) : [];

  return (
    <>
      <div className="backdrop" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label="Lead details">
        {!lead ? <div className="loading">Loading…</div> : (
          <>
            <header className="drawer-head">
              <div>
                <div className="eyebrow">Lead details{position ? ` · ${position}` : ''}</div>
                <h2>{lead.name}</h2>
                <p className="muted small">{lead.category} · {lead.address}</p>
                <div className="drawer-tags"><TierPill tier={lead.tier} score={lead.score} /><span className={`badge ${webTone}`}>{webLabel}</span></div>
              </div>
              <div className="flex shrink-0 items-start gap-1">
                <button className="icon-btn disabled:opacity-35" onClick={onPrev} disabled={!onPrev} aria-label="Previous lead" title="Previous lead (K)">↑</button>
                <button className="icon-btn disabled:opacity-35" onClick={onNext} disabled={!onNext} aria-label="Next lead" title="Next lead (J)">↓</button>
                <button className="icon-btn" onClick={onClose} aria-label="Close" title="Close (Esc)">✕</button>
              </div>
            </header>

            <div className="quick">
              {lead.whatsapp && <a className="btn wa" href={waLink(lead.whatsapp, message)} onClick={markContacted} target="_blank" rel="noreferrer">WhatsApp with message</a>}
              {lead.phone_e164 && <a className="btn" href={`tel:${lead.phone_e164}`} onClick={markContacted}>Call</a>}
              {lead.emails[0] && <a className="btn" href={`mailto:${lead.emails[0]}?subject=${encodeURIComponent(`Website for ${lead.name}`)}&body=${encodeURIComponent(message)}`} onClick={markContacted}>Email</a>}
              {lead.maps_url && <a className="btn" href={lead.maps_url} target="_blank" rel="noreferrer">Google Maps</a>}
              {lead.website && <a className="btn ghost" href={lead.website} target="_blank" rel="noreferrer">Website</a>}
            </div>

            <section className="d-sec">
              <div className="sec-head"><h4>Outreach message</h4><button className="btn xs ghost" onClick={copyMessage}>Copy</button></div>
              <div className="seg wrap">
                {ANGLES.map(([k, l]) => <button key={k} className={activeAngle === k ? 'on' : ''} onClick={() => chooseAngle(k)}>{l}</button>)}
              </div>
              <textarea rows={8} className="text-[13px] leading-relaxed" value={message} onChange={(e) => { msgDirty.current = true; setMessage(e.target.value); }} />
              <small className="muted">
                {lead.whatsapp ? 'WhatsApp opens with this text — nothing is sent until you press send.' : 'No WhatsApp number — copy the message or use email.'}
                {!settings.myName && ' Add your name on the Outreach page so messages are signed.'}
              </small>
            </section>

            <section className="d-sec">
              <h4>Pipeline</h4>
              <div className="seg wrap">
                {LEAD_STATUSES.map(([k, l]) => <button key={k} className={lead.lead_status === k ? 'on' : ''} onClick={() => setStatus(k)}>{l}</button>)}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-xs font-semibold text-ink-2">Follow up</span>
                <input type="date" className="!h-[26px] !w-auto text-xs" value={toDateInput(lead.follow_up_at)} onChange={(e) => setFollowUp(fromDateInput(e.target.value))} />
                {[['Tomorrow', 1], ['+3 days', 3], ['+1 week', 7]].map(([l, n]) => (
                  <button key={l} className="btn xs" onClick={() => setFollowUp(inDays(n))}>{l}</button>
                ))}
                {lead.follow_up_at && <button className="btn xs ghost" onClick={() => setFollowUp(null)}>Clear</button>}
              </div>
              {(lead.follow_up_at || lead.last_contacted_at) && (
                <div className="flex flex-wrap gap-x-3 text-xs">
                  {lead.follow_up_at && <span className={isDue(lead.follow_up_at) ? 'font-semibold text-hot' : 'text-muted'}>⏰ {isDue(lead.follow_up_at) ? 'Due' : 'Scheduled'} {shortDate(lead.follow_up_at)}</span>}
                  {lead.last_contacted_at && <span className="text-muted">Last contacted {fmt.ago(lead.last_contacted_at)}</span>}
                </div>
              )}
              <textarea rows={4} placeholder="Notes — who you spoke to, follow-up date, pitch angle…" value={notes}
                onChange={(e) => { dirty.current = true; setNotes(e.target.value); }} />
              <small className="muted">{saved}</small>
            </section>

            <section className="d-sec">
              <h4>Why score {lead.score}</h4>
              <ul className="reasons">
                {lead.reasons.map((r) => (
                  <li key={r.label} className={r.points > 0 ? 'plus' : r.points < 0 ? 'minus' : 'zero'}>
                    <span className="num">{r.points > 0 ? `+${r.points}` : r.points}</span>{r.label}
                  </li>
                ))}
              </ul>
            </section>

            <section className="d-sec">
              <h4>Contact</h4>
              <dl className="kv">
                <dt>Phone</dt><dd>{lead.phone_intl || <span className="muted">Not on Google</span>} {lead.phone_type && <small className="muted">({lead.phone_type.toLowerCase().replace(/_/g, ' ')})</small>}</dd>
                <dt>WhatsApp</dt><dd>{lead.whatsapp
                  ? <>{lead.whatsapp} <small className={lead.whatsapp_source === 'website' ? 'ok' : 'muted'}>{lead.whatsapp_source === 'website' ? '✓ published on website' : 'mobile number — not verified'}</small></>
                  : <span className="muted">Not found</span>}</dd>
                <dt>Email</dt><dd>{lead.emails.length ? lead.emails.join(', ') : <span className="muted">{lead.site_status === 'ok' ? 'None published on site' : 'Not available (no analysable website)'}</span>}</dd>
                <dt>Social</dt><dd>{Object.keys(lead.socials).length
                  ? Object.entries(lead.socials).map(([k, u]) => <a key={k} className="tag-link" href={u} target="_blank" rel="noreferrer">{k}</a>)
                  : <span className="muted">None found</span>}</dd>
              </dl>
            </section>

            <section className="d-sec">
              <div className="sec-head"><h4>Website analysis</h4>{lead.website && <button className="btn xs ghost" onClick={reanalyze}>Re-analyse</button>}</div>
              {!lead.website && <p className="muted">No website on the Google listing.</p>}
              {lead.website && !site && <p className="muted">Analysis pending…</p>}
              {site && (
                <>
                  {site.reason && <p className="note">{site.reason}</p>}
                  <dl className="kv">
                    <dt>URL</dt><dd className="break">{site.finalUrl || lead.website}</dd>
                    <dt>Reachable</dt><dd>{site.status === 'ok' ? <span className="ok">Yes (HTTP {site.httpCode})</span> : site.status === 'unknown' ? <span className="muted">Could not verify</span> : site.status === 'social_only' ? <span className="bad">Not an own website</span> : <span className="bad">No</span>}</dd>
                    {site.status === 'ok' && (
                      <>
                        <dt>HTTPS</dt><dd><Yes v={site.https} /> {site.httpsNote && <small className="muted">{site.httpsNote}</small>}</dd>
                        <dt>Speed</dt><dd>{site.speed} <small className="muted">{site.responseMs} ms HTML fetch · {site.htmlKb} KB (not Lighthouse)</small></dd>
                        <dt>Mobile</dt><dd>{site.mobile.verdict === 'likely' ? <span className="ok">Likely responsive</span> : <span className="bad">Likely not responsive</span>} <small className="muted">viewport meta {site.mobile.viewportMeta ? 'present' : 'missing'}</small></dd>
                        <dt>Design</dt><dd><span className={site.design.verdict === 'modern' ? 'ok' : 'bad'}>{site.design.verdict}</span>{site.design.generator && <small className="muted"> · {site.design.generator}</small>}</dd>
                        <dt>Clear CTA</dt><dd><Yes v={site.cta.clear} /> <small className="muted">{[site.cta.phoneLink && 'tel link', site.cta.whatsappLink && 'WhatsApp', site.cta.contactForm && 'form', site.cta.contactPage && 'contact page'].filter(Boolean).join(', ') || 'none detected'}</small></dd>
                        <dt>Booking / ordering</dt><dd><Yes v={site.booking.detected} yes="Detected" no="Not detected" /> {site.booking.evidence && <small className="muted">“{site.booking.evidence}”</small>}</dd>
                      </>
                    )}
                  </dl>
                  {site.design?.signals?.length > 0 && (
                    <ul className="signals">{site.design.signals.map((s) => <li key={s.label}>{s.label}</li>)}</ul>
                  )}
                  <details className="not-measured">
                    <summary>What this check does not measure</summary>
                    <ul>{(site.notMeasured || []).map((t) => <li key={t}>{t}</li>)}</ul>
                  </details>
                  <small className="muted">Checked {fmt.ago(site.checkedAt)}</small>
                </>
              )}
            </section>

            <section className="d-sec">
              <h4>Google listing</h4>
              <dl className="kv">
                <dt>Rating</dt><dd>{lead.rating ? `${lead.rating}★ from ${fmt.num(lead.review_count)} reviews` : <span className="muted">No rating</span>}</dd>
                <dt>Status</dt><dd>{(lead.business_status || 'unknown').toLowerCase().replace(/_/g, ' ')}{lead.open_now != null && <small className="muted"> · {lead.open_now ? 'open now' : 'closed now'}</small>}</dd>
                <dt>Hours</dt><dd>{lead.hours?.length ? <ul className="hours">{lead.hours.map((h) => <li key={h}>{h}</li>)}</ul> : <span className="muted">Not available</span>}</dd>
                <dt>Place ID</dt><dd className="mono break">{lead.place_id}</dd>
                <dt>Seen</dt><dd>first {fmt.ago(lead.first_seen)} · last {fmt.ago(lead.last_seen)}</dd>
              </dl>
            </section>
          </>
        )}
      </aside>
    </>
  );
}
