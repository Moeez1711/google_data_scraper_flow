import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// envDir points at the project root so the single .env is shared.
// Only VITE_* variables are exposed to the browser; the Places key stays server-side.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '..', '');
  const port = env.PORT || 4001;
  return {
    plugins: [react(), tailwindcss()],
    envDir: '..',
    server: {
      port: 5174,
      proxy: { '/api': { target: `http://127.0.0.1:${port}`, changeOrigin: true } },
    },
  };
});
