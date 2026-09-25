/**
 * Google Sheets export via a service account. The user shares one Sheet with the service account's email;
 * each export adds a new tab to it. Auth is a signed JWT exchanged for an access token — no extra packages.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import { config } from './config.js';

const b64url = (v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');
const fail = (message, status = 400) => Object.assign(new Error(message), { status });

let account;
let token;

function serviceAccount() {
  if (account) return account;
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    try {
      account = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
      return account;
    } catch {
      try {
        account = JSON.parse(Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_JSON, 'base64').toString('utf8'));
        return account;
      } catch {}
    }
  }
  const file = config.googleServiceAccountFile;
  if (!file || !fs.existsSync(file)) return null;
  account = JSON.parse(fs.readFileSync(file, 'utf8'));
  return account;
}

export function sheetsStatus() {
  try {
    const sa = serviceAccount();
    return { configured: Boolean(sa?.client_email && sa?.private_key), email: sa?.client_email || null };
  } catch (e) {
    return { configured: false, email: null, error: `Could not read the service account key file: ${e.message}` };
  }
}

async function accessToken() {
  if (token && token.expires - 60_000 > Date.now()) return token.value;
  const sa = serviceAccount();
  if (!sa) throw fail('Google Sheets is not set up: GOOGLE_SERVICE_ACCOUNT_FILE is missing in .env');
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64url({ alg: 'RS256', typ: 'JWT' })}.${b64url({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  })}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(unsigned), sa.private_key).toString('base64url');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw fail(`Google sign-in failed: ${data.error_description || data.error || res.status}`, 502);
  token = { value: data.access_token, expires: Date.now() + data.expires_in * 1000 };
  return token.value;
}

/** Accepts a full Sheet link or a bare spreadsheet id. */
export function sheetIdFrom(input) {
  const s = String(input || '').trim();
  return s.match(/\/spreadsheets\/d\/([\w-]{20,})/)?.[1] || (/^[\w-]{20,}$/.test(s) ? s : null);
}

async function call(method, path, body) {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${path}`, {
    method,
    headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' },
    body: body && JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (res.ok) return data;
  const msg = data.error?.message || `HTTP ${res.status}`;
  if (res.status === 403 || res.status === 404) {
    throw fail(`Can't open that Google Sheet. Share it with ${serviceAccount().client_email} as Editor, then try again. (${msg})`);
  }
  throw fail(`Google Sheets error: ${msg}`, 502);
}

/** Adds a tab named `title` to the Sheet and writes `values` (header first). */
export async function exportToSheet(sheetInput, title, values) {
  const id = sheetIdFrom(sheetInput);
  if (!id) throw fail('Paste the link of a Google Sheet (https://docs.google.com/spreadsheets/d/…)');
  const tab = title.replace(/[[\]*?:/\\']/g, '').slice(0, 90);
  const added = await call('POST', `${id}:batchUpdate`, {
    requests: [{ addSheet: { properties: { title: tab, gridProperties: { rowCount: values.length + 10, columnCount: values[0].length, frozenRowCount: 1 } } } }],
  });
  const sheetId = added.replies[0].addSheet.properties.sheetId;
  await call('PUT', `${id}/values/${encodeURIComponent(`'${tab}'!A1`)}?valueInputOption=RAW`, { values });
  await call('POST', `${id}:batchUpdate`, {
    requests: [{ repeatCell: { range: { sheetId, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: 'userEnteredFormat.textFormat.bold' } }],
  });
  return { url: `https://docs.google.com/spreadsheets/d/${id}/edit#gid=${sheetId}`, tab, rows: values.length - 1 };
}
