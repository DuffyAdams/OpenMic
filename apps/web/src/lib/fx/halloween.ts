import type { Scene } from './dither';
import { flicker, hash, haze, oval, poly, random, smooth, TAU, wrap } from './paint';

/**
 * Halloween scenes for the dithered canvas (see dither.ts). Everything is drawn in "units" of
 * 1/180 of the canvas height, so shapes keep their proportions at any resolution, and every
 * animation is a pure function of time, so a still frame (reduced motion) is just one call.
 */

/** The inks the scenes draw with. */
const C = {
  void: '#0b0710',
  midnight: '#1d0b2e',
  grape: '#3b1458',
  violet: '#6b2a7d',
  mist: '#9a86b8',
  ember: '#e2540b',
  candle: '#ffa22e',
  bone: '#f6ecd6'
};
/**
 * The palette frames are dithered to: the inks plus in-between tones, so gradients (sky, moon glow,
 * fog) step finely. `void` is the Halloween --bg, so dithered edges melt into the page.
 */
// prettier-ignore
export const HALLOWEEN_PALETTE = [
  C.void, '#150a21', C.midnight, '#2b0f43', C.grape, '#54206c', C.violet, '#83659f', C.mist, '#cdbfd8',
  '#a4507c', C.ember, '#ff7d1c', C.candle, '#ffd593', C.bone
];

// --- Creatures -------------------------------------------------------------------------------

interface BatLook {
  wing: string;
  body: string;
  bones?: string;
  eyes?: string;
}

/** A bat with wingspan 2s centred on (x, y); `flap` runs from -1 (wings down) to 1 (up). */
function bat(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, flap: number, look: BatLook) {
  const lift = flap * 0.6 * s;
  // Wrist, wingtip and the scalloped trailing edge, per side.
  const wing = (side: number) => [
    x, y - 0.12 * s,
    x + side * 0.42 * s, y - 0.22 * s - lift * 0.5,
    x + side * s, y - lift,
    x + side * 0.8 * s, y + 0.06 * s - lift * 0.7,
    x + side * 0.6 * s, y - 0.02 * s - lift * 0.5,
    x + side * 0.42 * s, y + 0.16 * s - lift * 0.3,
    x + side * 0.22 * s, y + 0.06 * s - lift * 0.1,
    x, y + 0.2 * s
  ];
  ctx.fillStyle = look.wing;
  ctx.beginPath();
  poly(ctx, wing(-1));
  poly(ctx, wing(1));
  ctx.fill();
  if (look.bones) {
    // Outline and finger bones, so the silhouette reads against a dark sky.
    ctx.strokeStyle = look.bones;
    ctx.lineWidth = Math.max(1, 0.035 * s);
    ctx.stroke();
    ctx.beginPath();
    for (const side of [-1, 1]) {
      const p = wing(side);
      for (const i of [6, 8, 10]) {
        ctx.moveTo(p[2], p[3]);
        ctx.lineTo(p[i], p[i + 1]);
      }
    }
    ctx.stroke();
  }
  ctx.fillStyle = look.body;
  oval(ctx, x, y + 0.02 * s, 0.12 * s, 0.22 * s);
  ctx.beginPath();
  for (const side of [-1, 1]) {
    poly(ctx, [x + side * 0.02 * s, y - 0.14 * s, x + side * 0.1 * s, y - 0.34 * s, x + side * 0.13 * s, y - 0.1 * s]);
  }
  ctx.fill();
  if (look.eyes) {
    const e = Math.max(1, 0.05 * s);
    ctx.fillStyle = look.eyes;
    ctx.fillRect(x - 0.07 * s - e / 2, y - 0.1 * s, e, e);
    ctx.fillRect(x + 0.07 * s - e / 2, y - 0.1 * s, e, e);
  }
}

/** A spider hanging head-down from a thread ending at (x, y); `wiggle` (-1..1) moves its legs. */
function spider(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, wiggle: number) {
  const cy = y + 1.5 * s;
  ctx.strokeStyle = C.violet;
  ctx.lineWidth = Math.max(1, 0.12 * s);
  ctx.beginPath();
  // Front legs reach down (it hangs head-first), back legs up; each leg bends at the knee.
  [0.95, 0.35, -0.25, -0.85].forEach((a, i) => {
    const w = wiggle * 0.3 * (i % 2 ? 1 : -1);
    for (const side of [-1, 1]) {
      const kx = x + side * Math.cos(a - 0.55 + w) * 0.85 * s;
      const ky = cy + Math.sin(a - 0.55 + w) * 0.85 * s;
      ctx.moveTo(x + side * 0.2 * s, cy);
      ctx.lineTo(kx, ky);
      ctx.lineTo(kx + side * Math.cos(a + 0.65 + w) * 0.8 * s, ky + Math.sin(a + 0.65 + w) * 0.8 * s);
    }
  });
  ctx.stroke();
  ctx.fillStyle = C.grape;
  oval(ctx, x, cy, 0.38 * s, 0.36 * s);
  oval(ctx, x, y + 0.7 * s, 0.55 * s, 0.7 * s);
  ctx.fillStyle = C.violet;
  oval(ctx, x - 0.2 * s, y + 0.48 * s, 0.14 * s, 0.22 * s);
  // An hourglass marking and two glowing eyes.
  ctx.fillStyle = C.ember;
  ctx.beginPath();
  poly(ctx, [x - 0.18 * s, y + 0.62 * s, x + 0.18 * s, y + 0.62 * s, x, y + 0.86 * s]);
  poly(ctx, [x - 0.18 * s, y + 1.1 * s, x + 0.18 * s, y + 1.1 * s, x, y + 0.86 * s]);
  ctx.fill();
  const e = Math.max(1, 0.12 * s);
  ctx.fillStyle = C.candle;
  ctx.fillRect(x - 0.2 * s, cy + 0.1 * s, e, e);
  ctx.fillRect(x + 0.08 * s, cy + 0.1 * s, e, e);
}

/** A corner cobweb: (x, y) is the corner and (dx, dy) points into the screen. */
function web(ctx: CanvasRenderingContext2D, x: number, y: number, dx: number, dy: number, r: number, t: number) {
  const SPOKES = 7;
  const RINGS = 5;
  const knots = Array.from({ length: SPOKES }, (_, i) => {
    const a = (i / (SPOKES - 1)) * (Math.PI / 2);
    const len = r * (0.8 + 0.2 * hash(i + 3));
    return Array.from({ length: RINGS }, (_, k) => {
      const rr = len * ((k + 1) / RINGS) ** 0.9;
      return [x + dx * Math.cos(a) * rr, y + dy * Math.sin(a) * rr];
    });
  });
  const u = r / 40;
  const sway = Math.sin(t * 0.9) * 0.7 * u;
  ctx.strokeStyle = 'rgba(154, 134, 184, 0.6)';
  ctx.lineWidth = Math.max(1, 0.5 * u);
  ctx.beginPath();
  for (const spoke of knots) {
    ctx.moveTo(x, y);
    ctx.lineTo(spoke[RINGS - 1][0], spoke[RINGS - 1][1]);
  }
  for (let k = 0; k < RINGS; k++) {
    for (let i = 0; i < SPOKES - 1; i++) {
      const [ax, ay] = knots[i][k];
      const [bx, by] = knots[i + 1][k];
      // Silk sags toward the hub in the corner.
      const mx = (ax + bx) / 2;
      const my = (ay + by) / 2;
      ctx.moveTo(ax, ay);
      ctx.quadraticCurveTo(mx + (x - mx) * 0.2 + sway, my + (y - my) * 0.2 + sway, bx, by);
    }
  }
  ctx.stroke();
}

function pumpkin(ctx: CanvasRenderingContext2D, x: number, ground: number, s: number, glow: number) {
  const cy = ground - 0.55 * s;
  const halo = ctx.createRadialGradient(x, cy, s * 0.5, x, cy, s * 2.2);
  halo.addColorStop(0, `rgba(255, 162, 46, ${0.3 * glow})`);
  halo.addColorStop(1, 'rgba(255, 162, 46, 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(x - s * 2.2, cy - s * 2.2, s * 4.4, s * 4.4);
  ctx.fillStyle = C.ember;
  oval(ctx, x - 0.38 * s, cy, 0.5 * s, 0.55 * s);
  oval(ctx, x + 0.38 * s, cy, 0.5 * s, 0.55 * s);
  oval(ctx, x, cy, 0.55 * s, 0.6 * s);
  ctx.fillStyle = C.grape;
  ctx.fillRect(x - 0.08 * s, cy - 0.82 * s, 0.18 * s, 0.28 * s);
  // The carved face glows from the candle inside.
  ctx.fillStyle = glow > 0.88 ? C.bone : C.candle;
  ctx.beginPath();
  poly(ctx, [x - 0.36 * s, cy - 0.02 * s, x - 0.1 * s, cy - 0.02 * s, x - 0.23 * s, cy - 0.3 * s]);
  poly(ctx, [x + 0.1 * s, cy - 0.02 * s, x + 0.36 * s, cy - 0.02 * s, x + 0.23 * s, cy - 0.3 * s]);
  poly(ctx, [
    x - 0.42 * s, cy + 0.12 * s, x - 0.25 * s, cy + 0.2 * s, x - 0.14 * s, cy + 0.12 * s,
    x, cy + 0.22 * s, x + 0.14 * s, cy + 0.12 * s, x + 0.25 * s, cy + 0.2 * s,
    x + 0.42 * s, cy + 0.12 * s, x + 0.2 * s, cy + 0.4 * s, x - 0.2 * s, cy + 0.4 * s
  ]);
  ctx.fill();
}

function ghost(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, t: number, alpha: number, dir: number) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = C.bone;
  ctx.beginPath();
  ctx.arc(x, y, 0.55 * s, Math.PI, 0);
  const hem = y + 0.9 * s;
  const step = (1.1 * s) / 4;
  ctx.lineTo(x + 0.55 * s, hem);
  for (let i = 0; i < 4; i++) {
    const from = x + 0.55 * s - i * step;
    ctx.quadraticCurveTo(from - step / 2, hem + 0.28 * s * Math.sin(t * 5 + i * Math.PI), from - step, hem);
  }
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = Math.min(1, alpha * 1.7);
  ctx.fillStyle = C.void;
  oval(ctx, x - 0.18 * s + dir * 0.08 * s, y - 0.05 * s, 0.09 * s, 0.14 * s);
  oval(ctx, x + 0.16 * s + dir * 0.08 * s, y - 0.05 * s, 0.09 * s, 0.14 * s);
  oval(ctx, x + dir * 0.05 * s, y + 0.32 * s, 0.1 * s, 0.14 * s);
  ctx.globalAlpha = 1;
}

function house(ctx: CanvasRenderingContext2D, x: number, base: number, u: number, t: number) {
  // Drawn in its own units: 37 tall, 26 wide.
  ctx.fillStyle = C.void;
  ctx.beginPath();
  poly(ctx, [
    x - 11 * u, base, x - 11 * u, base - 13 * u, x - 13 * u, base - 13 * u, x - 9 * u, base - 18 * u,
    x - 9 * u, base - 22 * u, x - 6 * u, base - 22 * u, x - 6 * u, base - 21 * u, x - 1 * u, base - 24 * u,
    x + 4 * u, base - 20 * u, x + 4 * u, base - 27 * u, x + 3 * u, base - 27 * u, x + 7.5 * u, base - 37 * u,
    x + 11 * u, base - 27 * u, x + 10 * u, base - 27 * u, x + 10 * u, base - 13 * u, x + 12 * u, base - 13 * u,
    x + 11 * u, base
  ]);
  ctx.fill();
  const lit = flicker(t, 4.2);
  ctx.fillStyle = lit > 0.72 ? C.candle : C.ember;
  ctx.fillRect(x - 7 * u, base - 9 * u, 3 * u, 4 * u);
  ctx.fillRect(x + 6 * u, base - 23 * u, 2 * u, 3 * u);
  // Someone keeps switching the other window on and off.
  if (Math.sin(t * 0.45) > -0.3) ctx.fillRect(x + 1 * u, base - 9 * u, 3 * u, 4 * u);
}

/** A crooked dead tree, as line segments in tree-heights: [x1, y1, x2, y2, width, bend]. */
function growTree(seed: number) {
  const r = random(seed);
  const segs: number[][] = [];
  const branch = (x: number, y: number, a: number, len: number, wd: number, depth: number) => {
    const x2 = x + Math.cos(a) * len;
    const y2 = y + Math.sin(a) * len;
    segs.push([x, y, x2, y2, wd, (r() - 0.5) * 0.5]);
    if (!depth) return;
    const n = depth > 4 ? 2 : r() < 0.4 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const fan = (i / (n - 1) - 0.5) * 1.4 + (r() - 0.5) * 0.6;
      branch(x2, y2, a + fan + 0.1, len * (0.6 + r() * 0.2), wd * 0.6, depth - 1);
    }
  };
  branch(0, 0, -Math.PI / 2 + 0.1, 0.32, 0.075, 6);
  return segs;
}

function bolt(ctx: CanvasRenderingContext2D, x: number, bottom: number, seed: number, u: number) {
  const r = random(seed);
  const pts: [number, number][] = [[x, 0]];
  while (pts[pts.length - 1][1] < bottom) {
    const [px, py] = pts[pts.length - 1];
    pts.push([px + (r() - 0.5) * 16 * u, Math.min(bottom, py + (8 + r() * 14) * u)]);
  }
  ctx.strokeStyle = C.bone;
  ctx.lineWidth = Math.max(1, 0.8 * u);
  ctx.beginPath();
  pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
  let [fx, fy] = pts[Math.floor(pts.length / 3)];
  const side = r() < 0.5 ? -1 : 1;
  ctx.moveTo(fx, fy);
  for (let k = 0; k < 3; k++) {
    fx += side * (4 + r() * 10) * u;
    fy += (6 + r() * 10) * u;
    ctx.lineTo(fx, fy);
  }
  ctx.stroke();
}

// --- Scenes ----------------------------------------------------------------------------------

export interface NightOptions {
  /** Moon centre as fractions of the width and height; radius as a fraction of the height. */
  moon: { x: number; y: number; r: number };
  /** Sky colour stops, top to bottom. */
  sky: [number, string][];
  bats: number;
  /** Top and bottom of the band bats fly in, as fractions of the height. */
  batBand: [number, number];
  /** Size multiplier for bats and clouds on short canvases. */
  scale?: number;
  cobwebs?: boolean;
  /** Hill, haunted house, dead tree, graves, jack-o'-lanterns, a ghost and fog along the bottom. */
  graveyard: boolean;
  lightning: boolean;
}

/** The TV backdrop: a harvest moon rising behind a haunted hill, low in the space the screens leave free. */
export const TV_NIGHT: NightOptions = {
  moon: { x: 0.4, y: 0.87, r: 0.16 },
  sky: [[0, C.void], [0.3, C.midnight], [0.7, C.grape], [1, C.violet]],
  // Low, where the sky is light enough to show their silhouettes and they cross the moon.
  bats: 9,
  batBand: [0.5, 0.84],
  cobwebs: true,
  graveyard: true,
  lightning: true
};

/** The phones' header: moonlit sky that fades into the page. */
export const PHONE_NIGHT: NightOptions = {
  moon: { x: 0.68, y: 0.12, r: 0.09 },
  sky: [[0, C.grape], [0.45, C.midnight], [1, C.void]],
  bats: 5,
  batBand: [0.08, 0.55],
  scale: 1.5,
  graveyard: false,
  lightning: false
};

const CLOUD = [
  [0, 0, 0.12, 0.035],
  [0.1, -0.02, 0.09, 0.04],
  [0.2, 0.005, 0.11, 0.03],
  [-0.09, 0.01, 0.08, 0.025],
  [0.3, 0.01, 0.07, 0.02]
];
const CRATERS = [
  [-0.3, -0.25, 0.2],
  [0.25, 0.1, 0.16],
  [-0.05, 0.38, 0.12],
  [0.35, -0.35, 0.09],
  [-0.45, 0.12, 0.08]
];
const GRAVES = [
  // x, width, height (units), cross?, tilt
  [0.13, 7, 10, 0, -0.06],
  [0.19, 5, 9, 1, 0.08],
  [0.245, 6, 8, 0, 0.04],
  [0.63, 6, 9, 0, -0.1],
  [0.675, 5, 10, 1, 0],
  [0.86, 7, 11, 0, 0.05],
  [0.93, 5, 7, 0, -0.05]
];
const PUMPKINS = [
  // x, size (units)
  [0.535, 11],
  [0.578, 7],
  [0.62, 8.5],
  [0.965, 7]
];

export function hauntedNight(o: NightOptions): Scene {
  const r = random(31);
  const stars = Array.from({ length: 60 }, () => ({ x: r(), y: r() * 0.7, size: 0.35 + r() * 0.65, rate: 0.6 + r() * 2, phase: r() * TAU }));
  const clouds = [
    { x: 0.1, y: 0.16, speed: 1.6, size: 1 },
    { x: 0.62, y: 0.32, speed: 1.1, size: 0.8 }
  ];
  const bats = Array.from({ length: o.bats }, () => ({
    x: r(),
    y: o.batBand[0] + r() * (o.batBand[1] - o.batBand[0]),
    amp: 0.02 + r() * 0.04,
    wobble: 0.6 + r(),
    speed: (r() < 0.5 ? -1 : 1) * (9 + r() * 14),
    size: 3.4 + r() * 3,
    flap: 1.8 + r() * 1.3,
    phase: r() * TAU
  }));
  const fog = [0.87, 0.965].map((y, layer) => ({
    y,
    speed: layer ? -4.5 : 3,
    alpha: layer ? 0.16 : 0.13,
    puffs: Array.from({ length: 8 }, () => ({ x: r(), dy: (r() - 0.5) * 0.03, rx: 0.16 + r() * 0.14, ry: 0.022 + r() * 0.02 }))
  }));
  const tree = growTree(7);

  return {
    draw(ctx, t, w, h) {
      const u = (h / 180) * (o.scale ?? 1);

      const sky = ctx.createLinearGradient(0, 0, 0, h);
      for (const [at, colour] of o.sky) sky.addColorStop(at, colour);
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);

      for (const s of stars) {
        const twinkle = 0.5 + 0.5 * Math.sin(t * s.rate + s.phase);
        const size = Math.max(1, Math.round(s.size * u));
        ctx.fillStyle = `rgba(246, 236, 214, ${0.2 + 0.65 * twinkle})`;
        ctx.fillRect(Math.floor(s.x * w), Math.floor(s.y * h), size, size);
      }

      // The moon: an orange halo that breathes, a bone disc shaded toward its edge, and craters.
      const mx = o.moon.x * w;
      const my = o.moon.y * h;
      const R = o.moon.r * h;
      const breathe = 0.9 + 0.1 * Math.sin(t * 0.7);
      const halo = ctx.createRadialGradient(mx, my, R * 0.9, mx, my, R * 2.6);
      halo.addColorStop(0, `rgba(255, 162, 46, ${0.34 * breathe})`);
      halo.addColorStop(0.3, `rgba(226, 84, 11, ${0.13 * breathe})`);
      halo.addColorStop(1, 'rgba(107, 42, 125, 0)');
      ctx.fillStyle = halo;
      ctx.fillRect(mx - R * 2.6, my - R * 2.6, R * 5.2, R * 5.2);
      ctx.fillStyle = C.bone;
      oval(ctx, mx, my, R, R);
      const shade = ctx.createRadialGradient(mx - R * 0.3, my - R * 0.35, R * 0.1, mx, my, R);
      shade.addColorStop(0, 'rgba(246, 236, 214, 0)');
      shade.addColorStop(0.75, 'rgba(255, 162, 46, 0.08)');
      shade.addColorStop(1, 'rgba(255, 162, 46, 0.4)');
      ctx.fillStyle = shade;
      oval(ctx, mx, my, R, R);
      for (const [cx, cy, cr] of CRATERS) haze(ctx, mx + cx * R, my + cy * R, cr * R, cr * R, '226, 84, 11', 0.32);

      // Clouds drift by, lit from above by the moon.
      for (const c of clouds) {
        const k = h * c.size * (o.scale ?? 1);
        const span = w + k;
        const x = wrap(c.x * span + t * c.speed * u, span) - 0.4 * k;
        const y = c.y * h;
        const lit = ctx.createLinearGradient(0, y - 0.06 * k, 0, y + 0.04 * k);
        lit.addColorStop(0, 'rgba(131, 101, 159, 0.85)');
        lit.addColorStop(0.35, 'rgba(84, 32, 108, 0.9)');
        lit.addColorStop(1, 'rgba(29, 11, 46, 0.9)');
        ctx.fillStyle = lit;
        ctx.beginPath();
        for (const [px, py, rx, ry] of CLOUD) {
          ctx.moveTo(x + px * k + rx * k, y + py * k);
          ctx.ellipse(x + px * k, y + py * k, rx * k, ry * k, 0, 0, TAU);
        }
        ctx.fill();
      }

      // Now and then lightning: a bolt and two flashes that light up the whole sky.
      if (o.lightning) {
        const n = Math.floor(t / 11);
        const dt = t - n * 11 - (3 + hash(n) * 6);
        if (n > 0 && hash(n + 0.5) > 0.3 && dt >= 0 && dt < 1) {
          const flash = dt < 0.1 ? 1 : dt < 0.18 ? 0.15 : dt < 0.28 ? 0.7 : 0.35 * (1 - (dt - 0.28) / 0.72);
          if (dt < 0.3 && flash > 0.5) bolt(ctx, (0.1 + 0.8 * hash(n + 2)) * w, 0.86 * h, n, u);
          ctx.fillStyle = `rgba(154, 134, 184, ${0.42 * flash})`;
          ctx.fillRect(0, 0, w, h);
        }
      }

      for (const b of bats) {
        const span = w + 24 * u;
        const x = wrap(b.x * span + t * b.speed * u, span) - 12 * u;
        const y = b.y * h + Math.sin(t * b.wobble + b.phase) * b.amp * h;
        bat(ctx, x, y, b.size * u, Math.sin(t * b.flap * TAU + b.phase), { wing: C.void, body: C.void });
      }

      if (!o.graveyard) return;

      // The far hill dips in front of the moon and rises to either side of it.
      const hill = (x: number) => {
        const f = x / w;
        return h * (0.905 - 0.045 * Math.exp(-(((f - 0.12) / 0.13) ** 2)) - 0.04 * Math.exp(-(((f - 0.78) / 0.16) ** 2)) + 0.006 * Math.sin(f * TAU * 4.3));
      };
      const ground = (x: number) => h * (0.94 + 0.02 * Math.sin((x / w) * TAU * 1.1 + 2.2));
      const silhouette = (line: (x: number) => number, fill: string) => {
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let x = 0; x <= w + 2 * u; x += 2 * u) ctx.lineTo(x, line(x));
        ctx.lineTo(w, h);
        ctx.fill();
      };

      silhouette(hill, C.midnight);
      const hx = mx + 0.55 * R;
      house(ctx, hx, hill(hx) + u, 0.8 * u, t);
      const drawFog = (layer: (typeof fog)[number]) => {
        const span = w + 0.6 * h;
        for (const p of layer.puffs) {
          const x = wrap(p.x * span + t * layer.speed * u, span) - 0.3 * h;
          haze(ctx, x, (layer.y + p.dy) * h, p.rx * h, p.ry * h * 1.6, '154, 134, 184', layer.alpha * 1.8);
        }
      };
      drawFog(fog[0]);
      silhouette(ground, C.void);

      const tx = 0.04 * w;
      const ty = ground(tx);
      const th = 0.55 * h;
      ctx.strokeStyle = C.void;
      ctx.lineCap = 'round';
      for (const [x1, y1, x2, y2, wd, bend] of tree) {
        ctx.lineWidth = Math.max(1, wd * th);
        ctx.beginPath();
        ctx.moveTo(tx + x1 * th, ty + y1 * th);
        const kx = (x1 + x2) / 2 - (y2 - y1) * bend;
        const ky = (y1 + y2) / 2 + (x2 - x1) * bend;
        ctx.quadraticCurveTo(tx + kx * th, ty + ky * th, tx + x2 * th, ty + y2 * th);
        ctx.stroke();
      }

      ctx.fillStyle = C.grape;
      for (const [gx, gw, gh, cross, tilt] of GRAVES) {
        const x = gx * w;
        ctx.save();
        ctx.translate(x, ground(x) + 2 * u);
        ctx.rotate(tilt);
        if (cross) {
          ctx.fillRect(-u, -gh * u, 2 * u, gh * u);
          ctx.fillRect((-gw / 2) * u, -0.72 * gh * u, gw * u, 2 * u);
        } else {
          ctx.beginPath();
          ctx.moveTo((-gw / 2) * u, 0);
          ctx.lineTo((-gw / 2) * u, (-gh + gw / 2) * u);
          ctx.arc(0, (-gh + gw / 2) * u, (gw / 2) * u, Math.PI, 0);
          ctx.lineTo((gw / 2) * u, 0);
          ctx.fill();
        }
        ctx.restore();
      }

      PUMPKINS.forEach(([px, size], i) => pumpkin(ctx, px * w, ground(px * w) + u, size * u, flicker(t, i * 1.7)));

      // A ghost drifts across in front of the moon every so often.
      const g = Math.floor(t / 23);
      const gt = t - g * 23 - 7;
      if (gt >= 0 && gt < 13 && hash(g + 9) > 0.2) {
        const p = gt / 13;
        const dir = hash(g + 4) < 0.5 ? 1 : -1;
        const from = -0.06 * w;
        const to = 0.72 * w;
        const x = dir > 0 ? from + (to - from) * p : to - (to - from) * p;
        const fade = smooth(p * 6) * smooth((1 - p) * 6);
        ghost(ctx, x, 0.79 * h + Math.sin(t * 1.9) * 2.5 * u, 10 * u, t, 0.6 * fade, dir);
      }

      drawFog(fog[1]);

      if (o.cobwebs) {
        web(ctx, 0, 0, 1, 1, 0.22 * h, t);
        web(ctx, w, 0, -1, 1, 0.22 * h, t + 2);
      }
    }
  };
}

const SPIDERS = [
  // x, resting and lowest drop (fractions of the height), cycle seconds, phase, size (units).
  // They hang in the margins and in the gap between the TV's two columns, clear of text and QR codes.
  { x: 0.028, rest: 0.16, drop: 0.34, period: 17, phase: 9, size: 5 },
  { x: 0.605, rest: 0.06, drop: 0.38, period: 23, phase: 2, size: 6.5 },
  { x: 0.974, rest: 0.24, drop: 0.48, period: 19, phase: 13, size: 5 }
];
const SWOOP_EVERY = 31;
const SWOOP_FOR = 2.4;

/** Drawn over the TV screens: dangling spiders and a bat that swoops at you. */
export function creepyCrawlies(): Scene {
  return {
    draw(ctx, t, w, h) {
      const u = h / 180;
      for (const sp of SPIDERS) {
        const p = wrap(t + sp.phase, sp.period) / sp.period;
        const lowered = p < 0.5 ? 0 : p < 0.62 ? smooth((p - 0.5) / 0.12) : p < 0.8 ? 1 : 1 - smooth((p - 0.8) / 0.2);
        const moving = (p > 0.5 && p < 0.62) || p > 0.8;
        const x = Math.round(sp.x * w);
        const y = (sp.rest + (sp.drop - sp.rest) * lowered) * h + Math.sin(t * 1.5 + sp.phase) * 1.2 * u;
        ctx.strokeStyle = 'rgba(154, 134, 184, 0.75)';
        ctx.lineWidth = Math.max(1, 0.5 * u);
        ctx.beginPath();
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, y);
        ctx.stroke();
        spider(ctx, x + 0.5, y, sp.size * u, Math.sin(t * (moving ? 16 : 3) + sp.phase) * (moving ? 1 : 0.35));
      }

      // The swooping bat: out of one side, close to the camera, and away out the other.
      const n = Math.floor((t - 12) / SWOOP_EVERY);
      const dt = t - 12 - n * SWOOP_EVERY;
      if (t < 12 || dt > SWOOP_FOR) return;
      const p = dt / SWOOP_FOR;
      const dir = hash(n + 21) < 0.5 ? 1 : -1;
      const x0 = dir > 0 ? -0.15 * w : 1.15 * w;
      const x2 = w - x0;
      const y0 = (0.5 + 0.25 * hash(n + 22)) * h;
      const y1 = (0.02 + 0.12 * hash(n + 23)) * h;
      const y2 = (0.25 + 0.3 * hash(n + 24)) * h;
      const q = 1 - p;
      const x = q * q * x0 + 2 * q * p * (w / 2) + p * p * x2;
      const y = q * q * y0 + 2 * q * p * y1 + p * p * y2;
      const climb = 2 * q * (y1 - y0) + 2 * p * (y2 - y1);
      const run = Math.abs(2 * q * (w / 2 - x0) + 2 * p * (x2 - w / 2));
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.atan2(climb, run) * dir * 0.35);
      bat(ctx, 0, 0, (10 + 22 * Math.sin(p * Math.PI)) * u, Math.sin(dt * TAU * 3.2), {
        wing: C.grape,
        bones: C.violet,
        body: C.void,
        eyes: C.candle
      });
      ctx.restore();
    }
  };
}
