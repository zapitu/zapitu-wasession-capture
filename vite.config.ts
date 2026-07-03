import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.config';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const title = env.EXTENSION_TITLE || 'WASession Capture';

  return {
    plugins: [react(), crx({ manifest })],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    define: {
      __EXTENSION_TITLE__: JSON.stringify(title),
    },
    server: { port: 5199, strictPort: true, hmr: { port: 5199 } },
  };
});
