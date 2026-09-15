/**
 * Scan engine: adaptive quadtree over the target area.
 * Each tile runs one text query restricted to its rectangle. Google returns at most 60 results per
 * query, so a saturated tile is split into 4 children and scanned again — this keeps discovering
 * businesses across the whole area instead of stopping at the first 60.
 * All progress lives in SQLite, so pause/resume and crash recovery just continue pending tiles.
 */
import { db, json, tx } from '../db.js';
import { emit } from '../events.js';
import { getSource } from '../providers/index.js';
import * as repo from '../repo.js';
import { categories, countries, countryName } from '../catalog.js';
import { matchesPlace, matchTerms } from './match.js';
import { rectTouchesCountry } from '../geo.js';
import { kickSites } from '../enrich/siteQueue.js';
import { sleep } from '../util.js';
import { assertSearchAllowed, getLimits } from '../limits.js';

const TILE_WORKERS = 2;
const MIN_TILE_KM = 0.35;
const MAX_DEPTH = 9;
const MAX_TILE_ATTEMPTS = 3;

const running = new Map(); // scanId -> { intent: 'run'|'pause'|'stop'|'shutdown', controller, promise }
const logs = new Map(); // scanId -> recent log lines (memory only)

const httpError = (status, message) => Object.assign(new Error(message), { status });

function log(scanId, level, message) {
  const line = { ts: Date.now(), level, message };
  const arr = logs.get(scanId) || [];
  arr.push(line);
  if (arr.length > 200) arr.shift();
  logs.set(scanId, arr);
  emit('scan:log', { scanId, ...line });
}

function setStatus(id, status, { error = null, note } = {}) {
  const row = db.prepare('SELECT stats FROM scans WHERE id=?').get(id);
  const stats = { ...json(row?.stats, {}), ...(note !== undefined ? { note } : {}) };
  db.prepare('UPDATE scans SET status=?, error=?, stats=?, updated_at=? WHERE id=?').run(status, error, JSON.stringify(stats), Date.now(), id);
  emit('scan:status', { scanId: id, status, error, note: stats.note });
}

export function getScan(id) {
  const row = db.prepare('SELECT * FROM scans WHERE id=?').get(Number(id));
  if (!row) return null;
  return {
    id: row.id, status: row.status, createdAt: row.created_at, updatedAt: row.updated_at, error: row.error,
    config: json(row.config), area: json(row.area), stats: { ...json(row.stats, {}), ...repo.scanStats(row.id) },
    active: running.has(row.id), logs: logs.get(row.id) || [],
  };
}

export const listScans = () => db.prepare('SELECT id FROM scans ORDER BY id DESC LIMIT 200').all()
  .map(({ id }) => { const s = getScan(id); delete s.logs; return s; });

function normalizeInput(body = {}) {
  const country = String(body.country || '').toUpperCase();
  if (!countries.some((c) => c.code === country)) throw httpError(400, 'Choose a valid country');
  // One or more places (a list, or one per line); blank scans the whole country. Overlaps are fine — duplicates merge.
  const areas = [...new Set((Array.isArray(body.areas) ? body.areas : String(body.area || '').split(/\n|;/))
    .map((a) => String(a).trim()).filter(Boolean))].slice(0, 20);
  if (!areas.length) areas.push(countryName(country));
  const area = areas.join(' · ');
  const cat = categories.find((c) => c.id === body.categoryId);
  const custom = String(body.customCategory || '').trim();
  if (!cat && !custom) throw httpError(400, 'Choose or type a business category');
  const keywords = String(body.keywords || '').trim().slice(0, 100);
  const clamp = (val, lo, hi, d) => Math.min(hi, Math.max(lo, Number(val) || d));
  const lim = getLimits();
  const categoryQuery = cat ? cat.query : custom;
  return {
    source: 'google_places',
    country, countryName: countryName(country), area, areas,
    categoryId: cat?.id || null, categoryLabel: cat?.label || custom, categoryValue: cat?.value || 'medium',
    keywords, textQuery: [categoryQuery, keywords].filter(Boolean).join(' '),
    // Always strict: keep only places whose name/category actually contains the searched category (see match.js).
    strict: true, matchQuery: categoryQuery,
    targetCount: clamp(body.targetCount, 1, 5000, lim.defaultTargetCount),
    targetMode: body.targetMode === 'qualified' ? 'qualified' : 'discovered',
    maxApiCalls: clamp(body.maxApiCalls, 1, 10000, lim.defaultScanBudget),
    radiusKm: clamp(body.radiusKm, 0.5, 50, 3),
  };
}

function validBounds(b) {
  if (!b) return null;
  const vals = [b.south, b.west, b.north, b.east].map(Number);
  if (vals.some((x) => !Number.isFinite(x)) || vals[0] >= vals[2] || vals[1] >= vals[3]) throw httpError(400, 'Invalid bounds');
  const [south, west, north, east] = vals;
  return { south, west, north, east };
}

/** Resolves every area; several areas come back as one union box with their individual `parts`. */
async function resolveAreas(cfg) {
  const source = getSource(cfg.source);
  const parts = [];
  for (const a of cfg.areas) {
    parts.push({ query: a, ...(await source.resolveArea({ area: a, countryName: cfg.countryName, regionCode: cfg.country, radiusKm: cfg.radiusKm })) });
  }
  if (parts.length === 1) return parts[0];
  const bounds = {
    south: Math.min(...parts.map((p) => p.bounds.south)), west: Math.min(...parts.map((p) => p.bounds.west)),
    north: Math.max(...parts.map((p) => p.bounds.north)), east: Math.max(...parts.map((p) => p.bounds.east)),
  };
  return { name: cfg.area, bounds, center: { lat: (bounds.south + bounds.north) / 2, lng: (bounds.west + bounds.east) / 2 }, parts };
}

export async function previewArea(body) {
  const cfg = normalizeInput({ ...body, customCategory: body.customCategory || 'preview' });
  return resolveAreas(cfg);
}

export async function createScan(body) {
  if (running.size) throw httpError(409, 'Another scan is already running. Pause or stop it first.');
  const cfg = normalizeInput(body);
  assertSearchAllowed();
  const custom = validBounds(body.bounds);
  // A hand-drawn rectangle only applies to a single area; several areas are each searched as resolved.
  const area = custom && cfg.areas.length === 1
    ? { name: cfg.area, bounds: custom, center: { lat: (custom.south + custom.north) / 2, lng: (custom.west + custom.east) / 2 }, custom: true }
    : await resolveAreas(cfg);
  const now = Date.now();
  const id = tx(() => {
    const { lastInsertRowid } = db.prepare('INSERT INTO scans (created_at, updated_at, status, config, area) VALUES (?,?,?,?,?)')
      .run(now, now, 'queued', JSON.stringify(cfg), JSON.stringify(area));
    // One starting tile per area, so the space between far-apart areas is never searched.
    for (const { bounds: b } of area.parts || [area]) {
      db.prepare('INSERT INTO tiles (scan_id, south, west, north, east, depth) VALUES (?,?,?,?,?,0)').run(lastInsertRowid, b.south, b.west, b.north, b.east);
    }
    return Number(lastInsertRowid);
  });
  log(id, 'info', `Scan created: "${cfg.textQuery}" in ${area.name}, ${cfg.countryName}`);
  startRun(id);
  return getScan(id);
}

export function resumeScan(id, body = {}) {
  id = Number(id);
  const scan = getScan(id);
  if (!scan) throw httpError(404, 'Scan not found');
  if (running.has(id)) throw httpError(409, 'Scan is already running');
  if (running.size) throw httpError(409, 'Another scan is already running');
  assertSearchAllowed();
  const cfg = scan.config;
  if (body.targetCount) cfg.targetCount = Math.min(5000, Math.max(1, Number(body.targetCount)));
  if (body.maxApiCalls) cfg.maxApiCalls = Math.min(10000, Math.max(1, Number(body.maxApiCalls)));
  db.prepare('UPDATE scans SET config=? WHERE id=?').run(JSON.stringify(cfg), id);
  db.prepare(`UPDATE tiles SET status='pending', attempts=0 WHERE scan_id=? AND status='failed'`).run(id);
  log(id, 'info', `Resuming (target ${cfg.targetCount} ${cfg.targetMode}, budget ${cfg.maxApiCalls} requests)`);
  startRun(id);
  return getScan(id);
}

export function pauseScan(id) {
  const r = running.get(Number(id));
  if (!r) throw httpError(409, 'Scan is not running');
  r.intent = 'pause';
  log(Number(id), 'info', 'Pausing after in-flight requests finish…');
  return getScan(id);
}

export function stopScan(id) {
  id = Number(id);
  const r = running.get(id);
  if (r) { r.intent = 'stop'; r.controller.abort(); log(id, 'info', 'Stopping…'); }
  else if (getScan(id)) setStatus(id, 'stopped');
  else throw httpError(404, 'Scan not found');
  return getScan(id);
}

export function deleteScan(id) {
  id = Number(id);
  if (running.has(id)) throw httpError(409, 'Stop the scan before deleting it');
  db.prepare('DELETE FROM scans WHERE id=?').run(id);
  logs.delete(id);
}

export async function shutdown() {
  for (const r of running.values()) { r.intent = 'shutdown'; r.controller.abort(); }
  await Promise.race([Promise.allSettled([...running.values()].map((r) => r.promise)), sleep(3000)]);
}

function startRun(id) {
  const ctl = { intent: 'run', controller: new AbortController() };
  running.set(id, ctl);
  db.prepare(`UPDATE tiles SET status='pending' WHERE scan_id=? AND status='active'`).run(id);
  setStatus(id, 'running', { note: null });
  ctl.promise = runScan(id, ctl)
    .catch((e) => { log(id, 'error', e.message); setStatus(id, 'failed', { error: e.message }); })
    .finally(() => { running.delete(id); emitProgress(id, true); kickSites(); });
}

const claimStmt = db.prepare(`SELECT * FROM tiles WHERE scan_id=? AND status='pending' ORDER BY depth, id LIMIT 1`);
const markActive = db.prepare(`UPDATE tiles SET status='active' WHERE id=?`);
const insertTile = db.prepare('INSERT INTO tiles (scan_id, south, west, north, east, depth) VALUES (?,?,?,?,?,?)');
const claimTile = (scanId) => tx(() => { const t = claimStmt.get(scanId); if (t) markActive.run(t.id); return t; });

function splitTile(scanId, t, country) {
  const heightKm = (t.north - t.south) * 110.574;
  if (t.depth >= MAX_DEPTH || heightKm / 2 < MIN_TILE_KM) return false;
  const midLat = (t.south + t.north) / 2;
  const midLng = (t.west + t.east) / 2;
  for (const [s, w, n, e] of [[t.south, t.west, midLat, midLng], [t.south, midLng, midLat, t.east], [midLat, t.west, t.north, midLng], [midLat, midLng, t.north, t.east]]) {
    // Sub-tiles wholly inside a neighbouring country (e.g. Dubai in an Oman scan) are never queued.
    if (rectTouchesCountry({ south: s, west: w, north: n, east: e }, country)) insertTile.run(scanId, s, w, n, e, t.depth + 1);
  }
  return true;
}

const lastEmit = new Map();
function emitProgress(id, force = false) {
  const now = Date.now();
  if (!force && now - (lastEmit.get(id) || 0) < 400) return;
  lastEmit.set(id, now);
  emit('scan:progress', { scanId: id, status: getScan(id)?.status, stats: repo.scanStats(id), active: running.has(id) });
}

async function runScan(id, ctl) {
  const { config: cfg } = getScan(id);
  const source = getSource(cfg.source);
  const terms = cfg.strict ? matchTerms(cfg.matchQuery) : null;
  const { signal } = ctl.controller;
  let finishReason = null;
  let fatal = null;
  let limitHit = null;
  let dupTotal = 0;
  const halted = () => ctl.intent !== 'run' || finishReason || fatal || limitHit;

  const checkLimits = () => {
    const s = repo.scanStats(id);
    const count = cfg.targetMode === 'qualified' ? s.qualified : s.discovered;
    if (count >= cfg.targetCount) finishReason = `Target reached: ${count} ${cfg.targetMode === 'qualified' ? 'qualified leads' : 'businesses'}`;
    else if (s.billedCalls >= cfg.maxApiCalls) {
      finishReason = `API request budget of ${cfg.maxApiCalls} reached with ${count} of ${cfg.targetCount} ${cfg.targetMode === 'qualified' ? 'qualified leads' : 'businesses'}. Raise the API budget and resume to keep scanning.`;
    }
    return s;
  };

  async function worker() {
    while (!halted()) {
      checkLimits();
      if (halted()) break;
      const tile = claimTile(id);
      if (!tile) {
        if (repo.scanStats(id).tilesActive === 0) { finishReason ||= 'Whole area scanned'; break; }
        await sleep(250, signal);
        continue;
      }
      // Tiles outside the country's border (queued before border checks, or a custom-drawn area) cost nothing: skip them.
      if (!rectTouchesCountry(tile, cfg.country)) {
        db.prepare(`UPDATE tiles SET status='done', pages=0, results=0, error=NULL WHERE id=?`).run(tile.id);
        log(id, 'info', `Tile ${tile.id} (depth ${tile.depth}): outside ${cfg.countryName} — skipped, no request`);
        continue;
      }
      try {
        const res = await source.searchArea({ textQuery: cfg.textQuery, bounds: tile, regionCode: cfg.country }, { scanId: id, signal });
        let fresh = 0;
        let dup = 0;
        let outside = 0;
        let offTopic = 0;
        let split = false;
        tx(() => {
          for (const p of res.places) {
            // The scan rectangle spills into neighbouring countries (Oman's box covers the UAE); keep only the chosen country.
            if (p.countryCode && p.countryCode !== cfg.country) { outside++; continue; }
            if (terms && !matchesPlace(p, terms)) { offTopic++; continue; }
            const r = repo.upsertPlace(p, { scanId: id, countryCode: cfg.country, categoryValue: cfg.categoryValue });
            if (r.linked) fresh++; else dup++;
          }
          // A tile whose results were all abroad isn't worth subdividing — it would spend budget on another country.
          if (res.saturated && outside < res.places.length) split = splitTile(id, tile, cfg.country);
          db.prepare(`UPDATE tiles SET status='done', pages=?, results=?, error=NULL WHERE id=?`).run(res.pages, res.places.length, tile.id);
        });
        dupTotal += dup;
        log(id, 'info', `Tile ${tile.id} (depth ${tile.depth}): ${res.places.length} results, ${fresh} new, ${dup} duplicates${outside ? `, ${outside} outside ${cfg.countryName} skipped` : ''}${offTopic ? `, ${offTopic} off-topic skipped (strict)` : ''}${split ? ' → subdivided' : ''}`);
        if (fresh) kickSites();
      } catch (e) {
        if (e.code === 'LIMIT') {
          db.prepare(`UPDATE tiles SET status='pending' WHERE id=?`).run(tile.id);
          limitHit = e;
          break;
        }
        if (e.code === 'ABORTED' || signal.aborted) {
          db.prepare(`UPDATE tiles SET status='pending' WHERE id=?`).run(tile.id);
          break;
        }
        const attempts = tile.attempts + 1;
        const failed = e.fatal || attempts >= MAX_TILE_ATTEMPTS;
        db.prepare('UPDATE tiles SET status=?, attempts=?, error=? WHERE id=?').run(failed ? 'failed' : 'pending', attempts, e.message, tile.id);
        log(id, 'error', `Tile ${tile.id}: ${e.message}${failed ? '' : ' (will retry)'}`);
        if (e.fatal) fatal = e;
        else await sleep(2000, signal);
      }
      emitProgress(id);
    }
  }

  await Promise.all(Array.from({ length: TILE_WORKERS }, worker));

  const prev = json(db.prepare('SELECT stats FROM scans WHERE id=?').get(id).stats, {});
  db.prepare('UPDATE scans SET stats=? WHERE id=?').run(JSON.stringify({ ...prev, duplicatesSkipped: (prev.duplicatesSkipped || 0) + dupTotal }), id);

  if (fatal) { setStatus(id, 'failed', { error: fatal.message }); return; }
  if (limitHit) { log(id, 'error', limitHit.message); setStatus(id, 'paused', { note: limitHit.message }); return; }
  const endStatus = { pause: 'paused', stop: 'stopped', shutdown: 'interrupted' }[ctl.intent];
  if (endStatus) { setStatus(id, endStatus); log(id, 'info', `Scan ${endStatus}`); return; }
  setStatus(id, 'completed', { note: finishReason });
  log(id, 'info', `Completed — ${finishReason}`);
}
