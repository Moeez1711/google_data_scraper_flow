import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const dir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(dir, '..');

// envDir defaults to project root so the single .env is shared,
// but also checks client-local .env files (e.g. client/.env.production) if present.
export default defineConfig(({ mode }) => {
  const rootEnv = loadEnv(mode, rootDir, '');
  const localEnv = loadEnv(mode, dir, '');
  const env = { ...rootEnv, ...localEnv, ...process.env };
  const port = env.PORT || 4001;

  const hasLocalEnv = fs.existsSync(path.join(dir, `.env.${mode}`)) || fs.existsSync(path.join(dir, '.env'));

  return {
    plugins: [react(), tailwindcss()],
    envDir: hasLocalEnv ? dir : rootDir,
    server: {
      port: 5174,
      proxy: { '/api': { target: `http://127.0.0.1:${port}`, changeOrigin: true } },
    },
  };
});
