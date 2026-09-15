import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try { process.loadEnvFile(path.join(ROOT, '.env')); } catch { /* env may come from the shell */ }

const num = (v, d) => (Number.isFinite(Number(v)) && v !== '' ? Number(v) : d);

export const config = {
  port: num(process.env.PORT, 4000),
  placesKey: process.env.GOOGLE_PLACES_API_KEY || '',
  placesRps: num(process.env.PLACES_RPS, 5),
  placesCostPer1000: num(process.env.PLACES_COST_PER_1000, 35),
  cacheTtlMs: num(process.env.PLACES_CACHE_TTL_HOURS, 72) * 3600_000,
  websiteConcurrency: num(process.env.WEBSITE_CONCURRENCY, 4),
  dbPath: process.env.DB_PATH || path.join(ROOT, 'data', 'leads.db'),
  // JSON key of a Google Cloud service account, used for "Send to Google Sheets". Relative paths are from the project root.
  googleServiceAccountFile: process.env.GOOGLE_SERVICE_ACCOUNT_FILE ? path.resolve(ROOT, process.env.GOOGLE_SERVICE_ACCOUNT_FILE) : '',
};
