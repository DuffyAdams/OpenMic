import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

const apiTarget = process.env.API_URL ?? 'http://127.0.0.1:8000';

export default defineConfig({
  plugins: [sveltekit()],
  build: {
    // Fire OS WebView and older phones: stay on widely supported syntax.
    target: ['es2020', 'chrome87', 'safari14']
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: apiTarget, changeOrigin: false, ws: true }
    }
  },
  preview: {
    port: 4173,
    proxy: {
      '/api': { target: apiTarget, changeOrigin: false, ws: true }
    }
  }
});
