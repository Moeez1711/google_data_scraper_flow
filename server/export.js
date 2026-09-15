import ExcelJS from 'exceljs';

const reasonsText = (r) => r.reasons.filter((x) => x.points !== 0).map((x) => `${x.label} (${x.points > 0 ? '+' : ''}${x.points})`).join('; ');
const yesNo = (b) => (b == null ? '' : b ? 'yes' : 'no');

const COLUMNS = [
  ['Tier', (r) => ({ hot: 'Hot', potential: 'Potential', low: 'Low' }[r.tier]), 10],
  ['Score', (r) => r.score, 8],
  ['Business', (r) => r.name, 32],
  ['Category', (r) => r.category, 18],
  ['Phone', (r) => r.phone_intl || r.phone_national, 18],
  ['WhatsApp', (r) => r.whatsapp, 16],
  ['WhatsApp source', (r) => (r.whatsapp_source === 'website' ? 'Published on website' : r.whatsapp_source ? 'Mobile number (unverified)' : ''), 22],
  ['Emails', (r) => r.emails.join('; '), 28],
  ['Website', (r) => r.website, 30],
  ['Website status', (r) => r.site_status, 14],
  ['Design (heuristic)', (r) => r.site?.design?.verdict || '', 14],
  ['Mobile (heuristic)', (r) => r.site?.mobile?.verdict || '', 14],
  ['HTTPS', (r) => yesNo(r.site?.https), 8],
  ['Rating', (r) => r.rating, 8],
  ['Reviews', (r) => r.review_count, 9],
  ['Business status', (r) => r.business_status, 18],
  ['Address', (r) => r.address, 40],
  ['Google Maps', (r) => r.maps_url, 30],
  ['Instagram', (r) => r.socials.instagram || '', 26],
  ['Facebook', (r) => r.socials.facebook || '', 26],
  ['Lead status', (r) => r.lead_status, 14],
  ['Notes', (r) => r.notes, 30],
  ['Follow-up', (r) => (r.follow_up_at ? new Date(r.follow_up_at).toLocaleDateString('en-CA') : ''), 12],
  ['Last contacted', (r) => (r.last_contacted_at ? new Date(r.last_contacted_at).toLocaleDateString('en-CA') : ''), 14],
  ['Why this score', reasonsText, 60],
  ['Place ID', (r) => r.place_id, 30],
];

// Neutralise spreadsheet formula injection without breaking "+968..." phone numbers.
const safe = (s) => (/^[=@]|^[+-](?!\d)/.test(s) ? `'${s}` : s);

/** Header row + one value array per lead, for Google Sheets (written RAW, so formulas are never evaluated). */
export const toValues = (rows) => [COLUMNS.map(([h]) => h), ...rows.map((r) => COLUMNS.map(([, fn]) => fn(r) ?? ''))];

export function toCsv(rows) {
  const cell = (val) => {
    if (val == null) return '';
    const s = safe(String(val));
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [COLUMNS.map(([h]) => h).join(','), ...rows.map((r) => COLUMNS.map(([, fn]) => cell(fn(r))).join(','))];
  return `﻿${lines.join('\r\n')}`;
}

const TIER_FILL = { Hot: 'FFFDE2DD', Potential: 'FFFFF4D6', Low: 'FFF1F3F5' };

export async function toXlsx(rows) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Lead Scout';
  const ws = wb.addWorksheet('Leads', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = COLUMNS.map(([header, , width]) => ({ header, width }));
  for (const r of rows) {
    const row = ws.addRow(COLUMNS.map(([, fn]) => { const val = fn(r); return typeof val === 'string' ? safe(val) : val ?? ''; }));
    const tier = row.getCell(1).value;
    row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TIER_FILL[tier] || 'FFFFFFFF' } };
  }
  ws.getRow(1).font = { bold: true };
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUMNS.length } };
  return wb.xlsx.writeBuffer();
}
