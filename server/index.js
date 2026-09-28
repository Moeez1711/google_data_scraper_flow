import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { config, ROOT } from './config.js';
import api from './routes/api.js';
import { requireAuth } from './auth.js';
import { shutdown } from './scanner/engine.js';
import { kickSites } from './enrich/siteQueue.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
// CORS middleware supporting credentials and flexible origins (for Hostinger frontend calling Render API)
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowed = process.env.CORS_ORIGIN;
  if (origin) {
    if (!allowed || allowed === '*') {
      res.setHeader('Access-Control-Allow-Origin', origin);
    } else {
      const list = allowed.split(',').map((s) => s.trim());
      if (list.includes(origin) || list.includes('*')) {
        res.setHeader('Access-Control-Allow-Origin', origin);
      }
    }
  } else if (!allowed || allowed === '*') {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }

  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, x-session-token');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

app.use(express.json({ limit: '2mb' }));
app.use('/api', requireAuth, api);

const dist = path.join(ROOT, 'client', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
} else {
  // Graceful fallback for root route when running backend API independently on Render
  app.get('/', (req, res) => {
    res.json({
      service: 'Lead Scout API',
      status: 'online',
      version: '1.0.0',
      health: '/api/health',
      docs: 'API server is running. Connect the frontend using VITE_API_BASE_URL.',
    });
  });
}

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message || 'Server error' });
});

// Listen on HOST or 0.0.0.0 for cloud deployment compatibility (e.g. Render, Railway, Docker)
const host = process.env.HOST || '0.0.0.0';
const server = app.listen(config.port, host, () => {
  console.log(`Lead Scout API on http://${host}:${config.port}`);
  if (!config.placesKey) console.warn('⚠  GOOGLE_PLACES_API_KEY missing — add it to .env');
  kickSites(); // finish website analyses left pending by a previous run
});

let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await shutdown(); // running scans are marked "interrupted" and can be resumed
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}
process.on('SIGINT', close);
process.on('SIGTERM', close);
