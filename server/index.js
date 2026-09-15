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
app.use(express.json({ limit: '2mb' }));
app.use('/api', requireAuth, api);

const dist = path.join(ROOT, 'client', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message || 'Server error' });
});

// Bound to localhost: this is a personal tool and the server holds the Places API key.
const server = app.listen(config.port, '127.0.0.1', () => {
  console.log(`Lead Scout API on http://127.0.0.1:${config.port}`);
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
