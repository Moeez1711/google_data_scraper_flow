import { Router } from 'express';
import { config } from '../config.js';
import { bus } from '../events.js';
import { categories, countries, WHATSAPP_FIRST } from '../catalog.js';
import { TIERS } from '../scoring.js';
import * as repo from '../repo.js';
import * as engine from '../scanner/engine.js';
import { kickSites, siteQueueState } from '../enrich/siteQueue.js';
import { toCsv, toValues, toXlsx } from '../export.js';
import { exportToSheet, sheetsStatus } from '../sheets.js';
import { saveLimits, usage } from '../limits.js';
import { authRouter } from '../auth.js';

const api = Router();
api.use('/auth', authRouter);

api.get('/health', (req, res) => res.json({ ok: true, uptime: Math.floor(process.uptime()), timestamp: Date.now() }));

api.get('/meta', (req, res) => res.json({
  countries, categories, tiers: TIERS, whatsappFirst: [...WHATSAPP_FIRST],
  placesKeyConfigured: Boolean(config.placesKey), costPer1000: config.placesCostPer1000,
}));

api.get('/settings', (req, res) => res.json(repo.getSettings()));
api.put('/settings', (req, res) => res.json(repo.saveSettings(req.body)));
api.get('/followups', (req, res) => res.json(repo.followUpSummary()));
api.get('/limits', (req, res) => res.json(usage()));
api.put('/limits', (req, res) => { saveLimits(req.body); res.json(usage()); });

// Server-Sent Events: one stream for all live updates.
api.get('/events', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  const send = (evt) => res.write(`data: ${JSON.stringify(evt)}\n\n`);
  bus.on('event', send);
  const ping = setInterval(() => res.write(': ping\n\n'), 20_000);
  req.on('close', () => { bus.off('event', send); clearInterval(ping); });
});

api.post('/area/resolve', async (req, res) => res.json(await engine.previewArea(req.body)));

api.get('/scans', (req, res) => res.json(engine.listScans()));
api.post('/scans', async (req, res) => res.status(201).json(await engine.createScan(req.body)));
api.get('/scans/:id', (req, res) => {
  const scan = engine.getScan(req.params.id);
  if (!scan) return res.status(404).json({ error: 'Scan not found' });
  res.json(scan);
});
api.post('/scans/:id/pause', (req, res) => res.json(engine.pauseScan(req.params.id)));
api.post('/scans/:id/resume', (req, res) => res.json(engine.resumeScan(req.params.id, req.body)));
api.post('/scans/:id/stop', (req, res) => res.json(engine.stopScan(req.params.id)));
api.delete('/scans/:id', (req, res) => { engine.deleteScan(req.params.id); res.status(204).end(); });

api.get('/leads', (req, res) => res.json(repo.queryLeads(req.query)));
api.get('/leads/map', (req, res) => res.json(repo.mapPoints(req.query)));
api.get('/leads/categories', (req, res) => res.json(repo.categoriesInUse(req.query)));
api.get('/leads/countries', (req, res) => res.json(repo.countriesInUse(req.query)));
api.get('/leads/search-categories', (req, res) => res.json(repo.searchCategoriesInUse(req.query)));
api.get('/leads/:placeId', (req, res) => {
  const lead = repo.getLead(req.params.placeId);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  res.json(lead);
});
api.patch('/leads/:placeId', (req, res) => res.json(repo.updateLead(req.params.placeId, req.body)));
api.post('/leads/:placeId/reanalyze', (req, res) => { const lead = repo.requeueSite(req.params.placeId); kickSites(); res.json(lead); });

api.get('/analytics', (req, res) => res.json({ ...repo.analytics(req.query.scanId), siteQueue: siteQueueState(), usage: usage() }));

const exportFilters = ({ ids, filters = {} } = {}) => (ids?.length ? { ids: ids.join(','), includeClosed: 1 } : filters);

api.get('/export/sheets', (req, res) => res.json(sheetsStatus()));

// Same selection as /export, written to a new tab of the user's shared Google Sheet.
api.post('/export/sheets', async (req, res) => {
  const f = exportFilters(req.body);
  const { rows } = repo.queryLeads({ ...f, limit: 5000 });
  const stamp = new Date().toLocaleString('sv-SE').slice(0, 16).replace(':', '.');
  try {
    const label = [f.country, f.searchCategory].filter(Boolean).join(' ') || 'Leads';
    res.json(await exportToSheet(req.body?.sheet, `${label} ${stamp}`, toValues(rows)));
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// Export either explicit ids or everything matching the current filters.
api.post('/export', async (req, res) => {
  const { format = 'csv' } = req.body || {};
  const f = exportFilters(req.body);
  const { rows } = repo.queryLeads({ ...f, limit: 5000 });
  const slug = [f.country, f.searchCategory].filter(Boolean).join(' ').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const stamp = `${slug ? `${slug}-` : ''}${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}`;
  if (format === 'xlsx') {
    res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="leads-${stamp}.xlsx"` });
    return res.send(Buffer.from(await toXlsx(rows)));
  }
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="leads-${stamp}.csv"` });
  res.send(toCsv(rows));
});

export default api;
