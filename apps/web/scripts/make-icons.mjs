// Render the OpenMic logo (src/lib/brand.ts) into the favicon, web app icons and Fire TV launcher assets.
// Run from apps/web: npm run icons (requires Chromium: npx playwright install chromium).
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import {
  MIC_ARCS,
  MIC_ARCS_WIDTH,
  MIC_BODY,
  MIC_HEAD,
  MIC_TRANSFORM,
  WORDMARK_ASPECT,
  WORDMARK_MIC,
  WORDMARK_OPEN,
  WORDMARK_VIEWBOX
} from '../src/lib/brand.ts';

const web = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const res = resolve(web, '../fire-tv/app/src/main/res');
// Classic theme tokens (styles/tokens.css).
const ACCENT = '#a970ff';
const INK = '#000';
const TEXT = '#fff';

/** The mark's layers in a 0 0 64 64 box; `shape` is the backdrop (a disc, or a full square for iOS). */
function mark(shape = '<circle cx="32" cy="32" r="32"/>') {
  const fill = (paint) => shape.replace('/>', ` fill="${paint}"/>`);
  return `<defs><linearGradient id="shine" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity="0.38"/>
      <stop offset="0.5" stop-color="#fff" stop-opacity="0"/>
      <stop offset="1" stop-color="#000" stop-opacity="0.22"/>
    </linearGradient></defs>
    ${fill(ACCENT)}${fill('url(#shine)')}
    <g fill="${INK}" transform="${MIC_TRANSFORM}"><path d="${MIC_HEAD}" fill-rule="evenodd"/><path d="${MIC_BODY}"/></g>
    <path d="${MIC_ARCS}" fill="none" stroke="${INK}" stroke-width="${MIC_ARCS_WIDTH}" stroke-linecap="round"/>`;
}

const svg = (viewBox, body, size = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}"${size}>${body}</svg>`;

const wordmark = (height) =>
  svg(
    WORDMARK_VIEWBOX,
    `<path d="${WORDMARK_OPEN}" fill="${TEXT}"/><path d="${WORDMARK_MIC}" fill="${ACCENT}"/>`,
    ` width="${height * WORDMARK_ASPECT}" height="${height}"`
  );

const fullPage = (body) => `<style>body{margin:0}svg{display:block;width:100vw;height:100vh}</style>${body}`;
const disc = fullPage(svg('-2 -2 68 68', mark()));
const square = fullPage(svg('0 0 64 64', mark('<rect width="64" height="64"/>')));
const figtree = await readFile(resolve(web, 'node_modules/@fontsource-variable/figtree/files/figtree-latin-wght-normal.woff2'));

// Fire TV launcher banner (320x180): the lockup and tagline on the lobby's purple wash.
const banner = `<style>
  @font-face { font-family: Figtree; src: url(data:font/woff2;base64,${figtree.toString('base64')}); font-weight: 100 900; }
  body { margin: 0; }
  .banner { width: 320px; height: 180px; display: flex; align-items: center; justify-content: center; gap: 16px;
    background: radial-gradient(circle at 26% 50%, rgba(169, 112, 255, 0.35), transparent 42%),
      linear-gradient(160deg, #3d1f6e, #24124a 55%, #121212); }
  .tag { margin: 9px 0 0 2px; font: 600 13px/1 Figtree; letter-spacing: 0.02em; color: #b3b3b3; }
</style>
<div class="banner">${svg('0 0 64 64', mark(), ' width="64" height="64"')}
  <div>${wordmark(36)}<p class="tag">Scan · Queue · Sing</p></div></div>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  async function render(html, width, height, path, transparent = false) {
    await page.setViewportSize({ width, height });
    await page.setContent(html);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path, omitBackground: transparent });
  }

  await writeFile(resolve(web, 'static/favicon.svg'), svg('0 0 64 64', mark()).replace(/\n\s*/g, '') + '\n');
  await render(disc, 512, 512, resolve(web, 'static/icon-512.png'), true);
  await render(square, 180, 180, resolve(web, 'static/apple-touch-icon.png'));
  const densities = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
  for (const [name, px] of Object.entries(densities)) {
    await render(disc, px, px, resolve(res, `mipmap-${name}/ic_launcher.png`), true);
  }
  await render(banner, 320, 180, resolve(res, 'drawable-xhdpi/banner.png'));
  console.log('icons written');
} finally {
  await browser.close();
}
