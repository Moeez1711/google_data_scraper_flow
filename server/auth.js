/**
 * Optional single-user login for the dashboard.
 * Credentials (email + salted scrypt hash) live in the settings table under key 'auth' and are never returned by any
 * endpoint. Sessions are random tokens stored hashed; the browser holds them in an HttpOnly, SameSite=Strict cookie.
 * With no credentials configured the dashboard stays open.
 */
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { Router } from 'express';
import { db, json } from './db.js';

const scrypt = promisify(crypto.scrypt);
const COOKIE = 'ls_session';
const DAY = 86400_000;
const LOCK_AFTER = 5;
const LOCK_MS = 15 * 60_000;

db.exec(`CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, last_seen INTEGER NOT NULL, user_agent TEXT
)`);
db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());

const httpErr = (status, message) => Object.assign(new Error(message), { status });
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

const readAuth = () => json(db.prepare(`SELECT value FROM settings WHERE key='auth'`).get()?.value, null);
const writeAuth = (v) => db.prepare(`INSERT INTO settings (key, value) VALUES ('auth', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(JSON.stringify(v));

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password.normalize('NFKC'), salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString('base64')}$${key.toString('base64')}`;
}

async function verifyPassword(password, stored) {
  const [alg, N, r, p, salt, hash] = String(stored || '').split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const key = await scrypt(String(password || '').normalize('NFKC'), Buffer.from(salt, 'base64'), expected.length, { N: Number(N), r: Number(r), p: Number(p) });
  return crypto.timingSafeEqual(key, expected);
}

function cleanEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  if (e.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw httpErr(400, 'Enter a valid email address');
  return e;
}

function checkNewPassword(pw) {
  if (typeof pw !== 'string' || pw.length < 8) throw httpErr(400, 'Password must be at least 8 characters');
  if (pw.length > 200) throw httpErr(400, 'Password must be 200 characters or fewer');
  return pw;
}

// Brute-force protection. Single-user app on localhost, so one shared counter is enough.
let failures = { count: 0, first: 0, lockedUntil: 0 };
function assertNotLocked() {
  const wait = failures.lockedUntil - Date.now();
  if (wait > 0) throw httpErr(429, `Too many failed attempts. Try again in ${Math.ceil(wait / 60_000)} min.`);
}
function recordFailure() {
  const now = Date.now();
  if (now - failures.first > LOCK_MS) failures = { count: 0, first: now, lockedUntil: 0 };
  failures.count++;
  if (failures.count >= LOCK_AFTER) failures.lockedUntil = now + LOCK_MS;
}
const resetFailures = () => { failures = { count: 0, first: 0, lockedUntil: 0 }; };

async function requireCurrentPassword(password) {
  assertNotLocked();
  const auth = readAuth();
  if (!auth) throw httpErr(409, 'Login is not set up');
  if (!(await verifyPassword(password, auth.passwordHash))) { recordFailure(); throw httpErr(403, 'Current password is incorrect'); }
  resetFailures();
  return auth;
}

function tokenFrom(req) {
  for (const part of (req.headers.cookie || '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === COOKIE) return v.join('=') || null;
  }
  return null;
}

function sessionFor(req) {
  const token = tokenFrom(req);
  if (!token) return null;
  const row = db.prepare('SELECT * FROM sessions WHERE token_hash=?').get(sha256(token));
  if (!row || row.expires_at < Date.now()) return null;
  if (Date.now() - row.last_seen > 5 * 60_000) db.prepare('UPDATE sessions SET last_seen=? WHERE token_hash=?').run(Date.now(), row.token_hash);
  return row;
}

function startSession(req, res, remember) {
  const token = crypto.randomBytes(32).toString('base64url');
  const ttl = (remember ? 30 : 1) * DAY;
  const now = Date.now();
  db.prepare('INSERT INTO sessions (token_hash, created_at, expires_at, last_seen, user_agent) VALUES (?,?,?,?,?)')
    .run(sha256(token), now, now + ttl, now, String(req.headers['user-agent'] || '').slice(0, 200));
  res.append('Set-Cookie', `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${ttl / 1000}`);
}

const clearCookie = (res) => res.append('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
const endOtherSessions = (req) => db.prepare('DELETE FROM sessions WHERE token_hash != ?').run(sha256(tokenFrom(req) || '')).changes;

const OPEN_ROUTES = new Set(['GET /auth/status', 'POST /auth/login', 'POST /auth/setup']);

/** Mounted on /api. Lets everything through while no login is configured. */
export function requireAuth(req, res, next) {
  if (OPEN_ROUTES.has(`${req.method} ${req.path}`) || !readAuth()) return next();
  if (!sessionFor(req)) return res.status(401).json({ error: 'Sign in required', code: 'AUTH_REQUIRED' });
  next();
}

export const authRouter = Router();

authRouter.get('/status', (req, res) => {
  const auth = readAuth();
  if (!auth) return res.json({ configured: false, authenticated: true });
  const session = sessionFor(req);
  if (!session) return res.json({ configured: true, authenticated: false });
  res.json({
    configured: true, authenticated: true, email: auth.email, updatedAt: auth.updatedAt, sessionExpiresAt: session.expires_at,
    sessions: db.prepare('SELECT COUNT(*) n FROM sessions WHERE expires_at > ?').get(Date.now()).n,
  });
});

authRouter.post('/setup', async (req, res) => {
  if (readAuth()) throw httpErr(409, 'Login is already set up — update it from the Privacy page');
  const email = cleanEmail(req.body?.email);
  const passwordHash = await hashPassword(checkNewPassword(req.body?.password));
  writeAuth({ email, passwordHash, updatedAt: Date.now() });
  db.exec('DELETE FROM sessions');
  startSession(req, res, true);
  res.json({ ok: true });
});

authRouter.post('/login', async (req, res) => {
  assertNotLocked();
  const auth = readAuth();
  if (!auth) throw httpErr(409, 'Login is not set up');
  // Always verify the password so a wrong email and a wrong password take the same time.
  const passwordOk = await verifyPassword(req.body?.password, auth.passwordHash);
  const emailOk = String(req.body?.email || '').trim().toLowerCase() === auth.email;
  if (!passwordOk || !emailOk) { recordFailure(); throw httpErr(401, 'Email or password is incorrect'); }
  resetFailures();
  startSession(req, res, req.body?.remember !== false);
  res.json({ ok: true });
});

authRouter.post('/logout', (req, res) => {
  const token = tokenFrom(req);
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(sha256(token));
  clearCookie(res);
  res.json({ ok: true });
});

authRouter.post('/logout-others', (req, res) => res.json({ ok: true, signedOut: Number(endOtherSessions(req)) }));

authRouter.put('/credentials', async (req, res) => {
  const auth = await requireCurrentPassword(req.body?.currentPassword);
  const email = cleanEmail(req.body?.email ?? auth.email);
  const newPassword = req.body?.newPassword ? checkNewPassword(req.body.newPassword) : null;
  writeAuth({ email, passwordHash: newPassword ? await hashPassword(newPassword) : auth.passwordHash, updatedAt: Date.now() });
  if (newPassword) endOtherSessions(req);
  res.json({ ok: true });
});

authRouter.post('/disable', async (req, res) => {
  await requireCurrentPassword(req.body?.currentPassword);
  db.prepare(`DELETE FROM settings WHERE key='auth'`).run();
  db.exec('DELETE FROM sessions');
  clearCookie(res);
  res.json({ ok: true });
});
