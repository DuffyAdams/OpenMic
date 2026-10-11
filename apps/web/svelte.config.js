import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    // Single-page app: every route is rendered in the browser and served via the 200.html shell.
    adapter: adapter({ fallback: '200.html', strict: false }),
    alias: { $styles: 'src/styles' }
  }
};

export default config;
