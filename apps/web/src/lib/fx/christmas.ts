import type { Scene } from './dither';
import { flicker, hash, haze, oval, poly, random, TAU, wrap } from './paint';

/**
 * Christmas scenes for the dithered canvas (see dither.ts), drawn like the Halloween ones: in
 * "units" of 1/180 of the canvas height, with every animation a pure function of time.
 */

/** The inks the scenes draw with. */
const C = {
  night: '#07101c',
  midnight: '#112640',
  navy: '#1b3658',
  dusk: '#2b4d75',
  frost: '#6f8fb5',
  ice: '#a9c2de',
  snow: '#eef5ff',
  pineDark: '#0c2a22',
  pine: '#1f5a3d',
  holly: '#3f9a52',
  bark: '#7b4a2c',
  wine: '#7a1526',
  berry: '#d6283e',
  cherry: '#ff5a66',
  gold: '#ffc94d',
  glow: '#ffe9a8'
};
/**
 * The palette frames are dithered to. Night blues step finely for the sky and snow; the rest are
 * the tree, the lights and Santa. `night` is the Christmas --bg, so dithered edges melt into the page.
 */
// prettier-ignore
export const CHRISTMAS_PALETTE = [
  C.night, C.midnight, C.navy, C.dusk, C.frost, C.ice, C.snow, C.pineDark,
  C.pine, C.holly, C.bark, C.wine, C.berry, C.cherry, C.gold, C.glow
];

/** "r, g, b" for an ink, for translucent fills. */
const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
};
const rgba = (hex: string, alpha: number) => `rgba(${rgb(hex)}, ${alpha})`;

/** Fairy-light colours, in the order they repeat along a string. */
const BULBS = [C.cherry, C.gold, C.holly, C.ice];
const BULB_GLOWS = BULBS.map((c) => rgba(c, 0.32));
const BULB_DIM = BULBS.map((c) => rgba(c, 0.3));

function bulb(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, i: number, lit: boolean) {
  const k = i % BULBS.length;
  if (lit) {
    ctx.fillStyle = BULB_GLOWS[k];
    oval(ctx, x, y, r * 2.4, r * 2.4);
  }
  ctx.fillStyle = lit ? BULBS[k] : BULB_DIM[k];
  oval(ctx, x, y, r, r * 1.3);
}

/** A five-pointed star of outer radius r. */
function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const d = i % 2 ? r * 0.45 : r;
    if (i) ctx.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
    else ctx.moveTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
  }
  ctx.closePath();
  ctx.fill();
}

/** A four-pointed glint, for sparkles. */
function glint(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  poly(ctx, [x, y - r, x + r * 0.22, y - r * 0.22, x + r, y, x + r * 0.22, y + r * 0.22, x, y + r, x - r * 0.22, y + r * 0.22, x - r, y, x - r * 0.22, y - r * 0.22]);
  ctx.fill();
}

// --- Santa and his team ----------------------------------------------------------------------

interface TeamLook {
  sleigh: string;
  trim: string;
  suit: string;
  face: string;
  beard: string;
  sack: string;
  deer: string;
  antlers: string;
}

/** Everything one colour: what you see against the moon. */
const SILHOUETTE: TeamLook = {
  sleigh: C.night,
  trim: C.night,
  suit: C.night,
  face: C.night,
  beard: C.night,
  sack: C.night,
  deer: C.night,
  antlers: C.night
};
const IN_COLOUR: TeamLook = {
  sleigh: C.wine,
  trim: C.gold,
  suit: C.berry,
  face: C.glow,
  beard: C.snow,
  sack: C.bark,
  deer: C.bark,
  antlers: C.glow
};

/** A flying reindeer facing right, body centred on (x, y); `run` is the gallop's phase. */
function reindeer(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, run: number, look: TeamLook, nose: boolean) {
  const g = Math.sin(run);
  ctx.strokeStyle = look.deer;
  ctx.fillStyle = look.deer;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // Legs (hip, knee, hoof): front ones tucked up, back ones kicked out behind.
  ctx.lineWidth = Math.max(1, 0.08 * s);
  ctx.beginPath();
  const leg = (hx: number, hy: number, thigh: number, shin: number) => {
    const kx = hx + Math.sin(thigh) * 0.22 * s;
    const ky = hy + Math.cos(thigh) * 0.22 * s;
    ctx.moveTo(hx, hy);
    ctx.lineTo(kx, ky);
    ctx.lineTo(kx + Math.sin(shin) * 0.2 * s, ky + Math.cos(shin) * 0.2 * s);
  };
  leg(x + 0.26 * s, y + 0.06 * s, 1.1 + 0.3 * g, -0.5 + 0.3 * g);
  leg(x + 0.18 * s, y + 0.08 * s, 0.8 + 0.3 * g, -0.7 + 0.3 * g);
  leg(x - 0.26 * s, y + 0.06 * s, -0.9 - 0.3 * g, -1.7 - 0.2 * g);
  leg(x - 0.18 * s, y + 0.08 * s, -0.6 - 0.3 * g, -1.4 - 0.2 * g);
  ctx.stroke();
  // Body, neck, head and tail.
  oval(ctx, x, y, 0.36 * s, 0.15 * s);
  ctx.beginPath();
  poly(ctx, [x + 0.2 * s, y - 0.08 * s, x + 0.36 * s, y - 0.38 * s, x + 0.47 * s, y - 0.33 * s, x + 0.36 * s, y + 0.04 * s]);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x + 0.5 * s, y - 0.38 * s, 0.13 * s, 0.075 * s, 0.35, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  poly(ctx, [x + 0.4 * s, y - 0.42 * s, x + 0.33 * s, y - 0.5 * s, x + 0.45 * s, y - 0.45 * s]);
  poly(ctx, [x - 0.34 * s, y - 0.06 * s, x - 0.46 * s, y - 0.14 * s, x - 0.36 * s, y + 0.02 * s]);
  ctx.fill();
  // Antlers: two beams sweeping back, each with two tines.
  ctx.strokeStyle = look.antlers;
  ctx.lineWidth = Math.max(1, 0.045 * s);
  ctx.beginPath();
  for (const dx of [0, -0.06 * s]) {
    const bx = x + 0.44 * s + dx;
    const by = y - 0.45 * s;
    ctx.moveTo(bx, by);
    ctx.quadraticCurveTo(bx - 0.02 * s, by - 0.22 * s, bx - 0.16 * s, by - 0.3 * s);
    ctx.moveTo(bx - 0.01 * s, by - 0.12 * s);
    ctx.lineTo(bx + 0.07 * s, by - 0.22 * s);
    ctx.moveTo(bx - 0.06 * s, by - 0.22 * s);
    ctx.lineTo(bx - 0.01 * s, by - 0.33 * s);
  }
  ctx.stroke();
  // The one at the front has a very shiny nose.
  if (nose) {
    const nx = x + 0.62 * s;
    const ny = y - 0.34 * s;
    ctx.fillStyle = rgba(C.cherry, 0.4);
    oval(ctx, nx, ny, 0.16 * s, 0.16 * s);
    ctx.fillStyle = C.cherry;
    oval(ctx, nx, ny, Math.max(1, 0.055 * s), Math.max(1, 0.055 * s));
  }
}

/** Santa's sleigh facing right, centred on (x, y) at seat height. */
function sleigh(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, look: TeamLook) {
  ctx.lineCap = 'round';
  // Runner and struts.
  ctx.strokeStyle = look.trim;
  ctx.lineWidth = Math.max(1, 0.06 * s);
  ctx.beginPath();
  ctx.moveTo(x - 0.6 * s, y + 0.32 * s);
  ctx.lineTo(x + 0.45 * s, y + 0.32 * s);
  ctx.quadraticCurveTo(x + 0.72 * s, y + 0.32 * s, x + 0.66 * s, y + 0.12 * s);
  ctx.quadraticCurveTo(x + 0.62 * s, y + 0.02 * s, x + 0.54 * s, y + 0.08 * s);
  ctx.moveTo(x - 0.35 * s, y + 0.18 * s);
  ctx.lineTo(x - 0.35 * s, y + 0.32 * s);
  ctx.moveTo(x + 0.25 * s, y + 0.18 * s);
  ctx.lineTo(x + 0.25 * s, y + 0.32 * s);
  ctx.stroke();
  // The sack of presents, then Santa in front of it.
  ctx.fillStyle = look.sack;
  oval(ctx, x - 0.34 * s, y - 0.3 * s, 0.22 * s, 0.26 * s);
  ctx.beginPath();
  poly(ctx, [x - 0.4 * s, y - 0.54 * s, x - 0.28 * s, y - 0.54 * s, x - 0.22 * s, y - 0.66 * s, x - 0.46 * s, y - 0.66 * s]);
  ctx.fill();
  ctx.fillStyle = look.suit;
  oval(ctx, x, y - 0.22 * s, 0.2 * s, 0.24 * s);
  ctx.strokeStyle = look.suit;
  ctx.lineWidth = Math.max(1, 0.08 * s);
  ctx.beginPath();
  ctx.moveTo(x + 0.06 * s, y - 0.3 * s);
  ctx.lineTo(x + 0.3 * s, y - 0.24 * s);
  ctx.stroke();
  ctx.fillStyle = look.face;
  oval(ctx, x + 0.06 * s, y - 0.5 * s, 0.1 * s, 0.1 * s);
  ctx.fillStyle = look.beard;
  oval(ctx, x + 0.1 * s, y - 0.42 * s, 0.1 * s, 0.09 * s);
  ctx.fillStyle = look.suit;
  ctx.beginPath();
  poly(ctx, [x - 0.04 * s, y - 0.56 * s, x + 0.16 * s, y - 0.56 * s, x - 0.14 * s, y - 0.76 * s]);
  ctx.fill();
  ctx.fillStyle = look.beard;
  ctx.fillRect(x - 0.05 * s, y - 0.6 * s, 0.22 * s, Math.max(1, 0.05 * s));
  oval(ctx, x - 0.15 * s, y - 0.77 * s, Math.max(1, 0.045 * s), Math.max(1, 0.045 * s));
  // The sleigh's body, curling up at both ends, with a gold stripe.
  ctx.fillStyle = look.sleigh;
  ctx.beginPath();
  ctx.moveTo(x - 0.58 * s, y - 0.42 * s);
  ctx.quadraticCurveTo(x - 0.5 * s, y - 0.52 * s, x - 0.44 * s, y - 0.4 * s);
  ctx.lineTo(x - 0.4 * s, y - 0.06 * s);
  ctx.lineTo(x + 0.3 * s, y - 0.06 * s);
  ctx.quadraticCurveTo(x + 0.42 * s, y - 0.06 * s, x + 0.48 * s, y - 0.28 * s);
  ctx.quadraticCurveTo(x + 0.6 * s, y - 0.32 * s, x + 0.56 * s, y - 0.18 * s);
  ctx.quadraticCurveTo(x + 0.5 * s, y + 0.2 * s, x + 0.3 * s, y + 0.2 * s);
  ctx.lineTo(x - 0.45 * s, y + 0.2 * s);
  ctx.quadraticCurveTo(x - 0.62 * s, y + 0.2 * s, x - 0.6 * s, y);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = look.trim;
  ctx.lineWidth = Math.max(1, 0.04 * s);
  ctx.beginPath();
  ctx.moveTo(x - 0.52 * s, y + 0.08 * s);
  ctx.lineTo(x + 0.42 * s, y + 0.08 * s);
  ctx.stroke();
}

/** How far ahead of the sleigh the team reaches, in sleigh sizes: draw at x - TEAM_MIDDLE·s to centre it. */
const TEAM_MIDDLE = 1.9;

/** Santa's sleigh at (x, y) with four reindeer ahead of it, the shiny-nosed one in front. */
function team(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, t: number, look: TeamLook) {
  const deer = [0, 1, 2, 3].map((i) => ({
    x: x + s * (1.05 + i * 0.82),
    y: y - 0.12 * s + Math.sin(t * 7 + i * 1.3) * 0.04 * s
  }));
  // Reins from Santa's hands to the lead reindeer, over the others' backs.
  ctx.strokeStyle = look.trim;
  ctx.lineWidth = Math.max(1, 0.025 * s);
  ctx.beginPath();
  ctx.moveTo(x + 0.3 * s, y - 0.24 * s);
  for (const d of deer) ctx.lineTo(d.x + 0.2 * s, d.y - 0.1 * s);
  ctx.stroke();
  deer.forEach((d, i) => reindeer(ctx, d.x, d.y, 0.9 * s, t * 7 + i * 1.3, look, i === deer.length - 1));
  sleigh(ctx, x, y, s, look);
}

// --- Scenery ---------------------------------------------------------------------------------

/** A decorated tree standing on `ground`, H tall to the tip of its star. */
function christmasTree(ctx: CanvasRenderingContext2D, x: number, ground: number, H: number, t: number) {
  ctx.fillStyle = C.bark;
  ctx.fillRect(x - 0.05 * H, ground - 0.13 * H, 0.1 * H, 0.14 * H);
  // Tiers from the bottom up: base and tip heights (fractions of H), half-width at the base.
  const tiers = [
    [0.1, 0.5, 0.3],
    [0.3, 0.68, 0.24],
    [0.5, 0.84, 0.17],
    [0.68, 0.96, 0.1]
  ];
  for (const [base, tip, half] of tiers) {
    const yb = ground - base * H;
    const yt = ground - tip * H;
    const hw = half * H;
    // A scalloped hem of branch tips, lit by the moon on the right.
    ctx.beginPath();
    ctx.moveTo(x, yt);
    ctx.lineTo(x + hw, yb);
    for (let i = 0; i < 4; i++) {
      const a = x + hw - (i * hw) / 2;
      ctx.quadraticCurveTo(a - hw / 4, yb - 0.05 * H, a - hw / 2, yb);
    }
    ctx.closePath();
    ctx.fillStyle = C.pineDark;
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = C.pine;
    ctx.beginPath();
    poly(ctx, [x + 0.05 * hw, yt, x + 1.3 * hw, yb + 0.1 * H, x + 0.35 * hw, yb + 0.1 * H]);
    ctx.fill();
    ctx.restore();
    // Snow resting on the branch tips.
    ctx.fillStyle = C.ice;
    for (let i = 0; i <= 4; i++) {
      const sx = x - hw + (i * 2 * hw) / 4;
      oval(ctx, sx, yb - 0.008 * H, 0.03 * H, 0.012 * H);
    }
    ctx.fillStyle = C.snow;
    oval(ctx, x + hw * 0.55, yb - 0.01 * H, 0.025 * H, 0.009 * H);
  }
  // Baubles.
  const BAUBLES: [number, number, string][] = [
    [-0.14, 0.18, C.gold],
    [0.12, 0.26, C.berry],
    [-0.05, 0.4, C.berry],
    [0.13, 0.45, C.gold],
    [-0.1, 0.58, C.gold],
    [0.06, 0.66, C.berry],
    [-0.03, 0.8, C.gold]
  ];
  for (const [bx, by, colour] of BAUBLES) {
    ctx.fillStyle = colour;
    oval(ctx, x + bx * H, ground - by * H, 0.022 * H, 0.022 * H);
    ctx.fillStyle = rgba(C.snow, 0.7);
    oval(ctx, x + bx * H - 0.007 * H, ground - by * H - 0.007 * H, 0.006 * H, 0.006 * H);
  }
  // A string of lights spiralling up; the ones round the back are hidden.
  const widthAt = (f: number) =>
    Math.max(0, ...tiers.map(([base, tip, half]) => (f >= base && f <= tip ? (half * (tip - f)) / (tip - base) : 0)));
  const N = 54;
  const r = Math.max(1, 0.011 * H);
  for (let k = 0; k < N; k++) {
    const p = (k + 0.5) / N;
    const a = p * TAU * 4.5;
    if (Math.cos(a) < -0.15) continue;
    const f = 0.12 + 0.8 * p;
    const bx = x + Math.sin(a) * widthAt(f) * H * 0.85;
    const by = ground - f * H + Math.cos(a) * 0.02 * H;
    const lit = Math.sin(t * (1.1 + hash(k) * 1.6) + k * 2.1) > -0.35;
    bulb(ctx, bx, by, r, k, lit);
  }
  // The star on top, glowing.
  const sy = ground - 0.97 * H;
  ctx.fillStyle = rgba(C.gold, 0.2 + 0.08 * Math.sin(t * 1.7));
  oval(ctx, x, sy, 0.13 * H, 0.13 * H);
  ctx.fillStyle = C.gold;
  star(ctx, x, sy, 0.065 * H);
  ctx.fillStyle = C.glow;
  star(ctx, x, sy, 0.028 * H);
  // Presents underneath.
  const GIFTS: [number, number, number, string, string][] = [
    // x, width, height (fractions of H), wrap, ribbon
    [-0.2, 0.12, 0.09, C.berry, C.gold],
    [0.15, 0.1, 0.12, C.holly, C.berry],
    [0.27, 0.08, 0.06, C.gold, C.berry]
  ];
  for (const [gx, gw, gh, wrapping, ribbon] of GIFTS) {
    const left = x + gx * H - (gw * H) / 2;
    ctx.fillStyle = wrapping;
    ctx.fillRect(left, ground - gh * H, gw * H, gh * H);
    ctx.fillStyle = ribbon;
    ctx.fillRect(left + (gw * H) / 2 - 0.008 * H, ground - gh * H, 0.016 * H, gh * H);
    ctx.fillRect(left, ground - (gh * H) / 2 - 0.008 * H, gw * H, 0.016 * H);
    oval(ctx, left + (gw * H) / 2 - 0.02 * H, ground - gh * H - 0.012 * H, 0.02 * H, 0.012 * H);
    oval(ctx, left + (gw * H) / 2 + 0.02 * H, ground - gh * H - 0.012 * H, 0.02 * H, 0.012 * H);
  }
}

/** A snowman standing on `ground`, waving a stick arm; s is one unit of his size. */
function snowman(ctx: CanvasRenderingContext2D, x: number, ground: number, s: number, t: number) {
  const ball = (cy: number, r: number) => {
    ctx.fillStyle = C.ice;
    oval(ctx, x, cy, r, r);
    ctx.fillStyle = C.snow;
    oval(ctx, x - 0.12 * r, cy - 0.1 * r, r * 0.86, r * 0.86);
  };
  // Arms first, so they come out from behind his middle.
  const mid = ground - 2.25 * s;
  const wave = -0.75 + 0.3 * Math.sin(t * 2.4);
  ctx.strokeStyle = C.bark;
  ctx.lineWidth = Math.max(1, 0.12 * s);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - 0.5 * s, mid);
  ctx.lineTo(x - 1.5 * s, mid + 0.35 * s);
  ctx.moveTo(x - 1.15 * s, mid + 0.24 * s);
  ctx.lineTo(x - 1.35 * s, mid - 0.05 * s);
  const ex = x + 0.5 * s + Math.cos(wave) * 1.1 * s;
  const ey = mid + Math.sin(wave) * 1.1 * s;
  ctx.moveTo(x + 0.5 * s, mid);
  ctx.lineTo(ex, ey);
  ctx.moveTo(x + 0.5 * s + Math.cos(wave) * 0.75 * s, mid + Math.sin(wave) * 0.75 * s);
  ctx.lineTo(ex + 0.1 * s, ey + 0.3 * s);
  ctx.stroke();
  ball(ground - 0.95 * s, 1 * s);
  ball(mid, 0.72 * s);
  const head = ground - 3.3 * s;
  ball(head, 0.5 * s);
  // Coal eyes and buttons, a carrot nose.
  const dot = Math.max(1, 0.1 * s);
  ctx.fillStyle = C.night;
  ctx.fillRect(x - 0.2 * s, head - 0.12 * s, dot, dot);
  ctx.fillRect(x + 0.1 * s, head - 0.12 * s, dot, dot);
  for (const by of [-0.3, 0, 0.3]) ctx.fillRect(x - dot / 2, mid + by * s, dot, dot);
  ctx.fillStyle = C.gold;
  ctx.beginPath();
  poly(ctx, [x, head - 0.02 * s, x + 0.55 * s, head + 0.06 * s, x, head + 0.1 * s]);
  ctx.fill();
  // A red scarf, its tail flapping in the breeze.
  const flap = Math.sin(t * 3.1) * 0.12 * s;
  ctx.fillStyle = C.berry;
  ctx.fillRect(x - 0.52 * s, head + 0.38 * s, 1.04 * s, 0.2 * s);
  ctx.beginPath();
  poly(ctx, [x + 0.15 * s, head + 0.5 * s, x + 0.38 * s, head + 0.5 * s, x + 0.5 * s + flap, head + 1.05 * s, x + 0.26 * s + flap, head + 1.08 * s]);
  ctx.fill();
  // A top hat.
  ctx.fillStyle = C.night;
  ctx.fillRect(x - 0.6 * s, head - 0.48 * s, 1.2 * s, 0.14 * s);
  ctx.fillRect(x - 0.38 * s, head - 1.1 * s, 0.76 * s, 0.64 * s);
  ctx.fillStyle = C.berry;
  ctx.fillRect(x - 0.38 * s, head - 0.62 * s, 0.76 * s, Math.max(1, 0.12 * s));
}

/** A snowed-in cottage on `base`, its windows lit and a curl of smoke from the chimney. */
function cottage(ctx: CanvasRenderingContext2D, x: number, base: number, u: number, t: number, seed: number, wide: boolean) {
  const w = (wide ? 15 : 10) * u;
  const wall = 7 * u;
  const roof = 6 * u;
  const cx = x + w * 0.22;
  const top = base - wall - roof * 0.95;
  for (let k = 0; k < 4; k++) {
    const p = wrap(t * 0.18 + k / 4 + seed * 0.1, 1);
    haze(ctx, cx + u + p * 7 * u + Math.sin(t + k + p * 3) * u, top - p * 16 * u, (1.2 + 2.4 * p) * u, (1 + 2 * p) * u, rgb(C.ice), 0.4 * (1 - p));
  }
  ctx.fillStyle = C.midnight;
  ctx.fillRect(cx, top, 2.2 * u, roof * 0.8);
  ctx.fillRect(x - w / 2, base - wall, w, wall);
  ctx.fillStyle = C.ice;
  ctx.beginPath();
  poly(ctx, [x - w / 2 - 1.2 * u, base - wall + 0.4 * u, x, base - wall - roof, x + w / 2 + 1.2 * u, base - wall + 0.4 * u]);
  ctx.fill();
  ctx.fillStyle = C.snow;
  ctx.beginPath();
  poly(ctx, [x + 1.5 * u, base - wall - roof + 1.5 * u, x, base - wall - roof, x - w / 2 - 1.2 * u, base - wall + 0.4 * u, x - w / 2 + 1.5 * u, base - wall + 0.4 * u]);
  ctx.fill();
  ctx.fillRect(cx - 0.3 * u, top - 0.6 * u, 2.8 * u, 0.9 * u);
  // Warm windows (and a door with a wreath on the wide one).
  const lit = flicker(t, seed * 3.3);
  const pane = (px: number, py: number, pw: number, ph: number) => {
    ctx.fillStyle = rgba(C.gold, 0.22);
    ctx.fillRect(px - 1.2 * u, py - 1.2 * u, pw + 2.4 * u, ph + 2.4 * u);
    ctx.fillStyle = lit > 0.7 ? C.glow : C.gold;
    ctx.fillRect(px, py, pw, ph);
    ctx.fillStyle = C.midnight;
    ctx.fillRect(px + pw / 2 - 0.25 * u, py, 0.5 * u, ph);
    ctx.fillRect(px, py + ph / 2 - 0.25 * u, pw, 0.5 * u);
  };
  pane(x - w / 2 + 1.6 * u, base - wall + 1.8 * u, 2.6 * u, 2.6 * u);
  if (wide) {
    pane(x + w / 2 - 4.2 * u, base - wall + 1.8 * u, 2.6 * u, 2.6 * u);
    ctx.fillStyle = C.wine;
    ctx.fillRect(x - 1.4 * u, base - 4.6 * u, 2.8 * u, 4.6 * u);
    ctx.strokeStyle = C.holly;
    ctx.lineWidth = Math.max(1, 0.6 * u);
    ctx.beginPath();
    ctx.arc(x, base - 3.2 * u, 0.9 * u, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = C.cherry;
    ctx.fillRect(x - 0.3 * u, base - 2.5 * u, Math.max(1, 0.6 * u), Math.max(1, 0.6 * u));
  }
}

/** A small snowy pine, `s` tall, standing on `base`. */
function pine(ctx: CanvasRenderingContext2D, x: number, base: number, s: number) {
  ctx.fillStyle = C.pineDark;
  ctx.beginPath();
  poly(ctx, [x - 0.32 * s, base - 0.1 * s, x, base - 0.62 * s, x + 0.32 * s, base - 0.1 * s]);
  poly(ctx, [x - 0.24 * s, base - 0.45 * s, x, base - s, x + 0.24 * s, base - 0.45 * s]);
  ctx.fill();
  ctx.fillRect(x - 0.04 * s, base - 0.12 * s, 0.08 * s, 0.13 * s);
  ctx.fillStyle = C.ice;
  ctx.beginPath();
  poly(ctx, [x - 0.06 * s, base - 0.88 * s, x, base - s, x + 0.08 * s, base - 0.86 * s]);
  poly(ctx, [x + 0.04 * s, base - 0.52 * s, x + 0.08 * s, base - 0.58 * s, x + 0.24 * s, base - 0.45 * s, x + 0.16 * s, base - 0.45 * s]);
  poly(ctx, [x + 0.06 * s, base - 0.2 * s, x + 0.12 * s, base - 0.27 * s, x + 0.32 * s, base - 0.1 * s, x + 0.22 * s, base - 0.1 * s]);
  ctx.fill();
}

/** A string of fairy lights swagged along the top edge, chasing and twinkling. */
function garland(ctx: CanvasRenderingContext2D, w: number, u: number, t: number) {
  const swags = Math.max(2, Math.round(w / (42 * u)));
  const span = w / swags;
  const sag = 7 * u;
  const PER = 6;
  const step = Math.floor(t * 1.4);
  ctx.strokeStyle = C.pineDark;
  ctx.lineWidth = Math.max(1, 0.6 * u);
  ctx.beginPath();
  for (let i = 0; i < swags; i++) {
    ctx.moveTo(i * span, -u);
    ctx.quadraticCurveTo((i + 0.5) * span, 2 * sag, (i + 1) * span, -u);
  }
  ctx.stroke();
  const r = Math.max(1, 1.1 * u);
  for (let i = 0; i < swags; i++) {
    for (let j = 0; j < PER; j++) {
      const q = (j + 0.5) / PER;
      const x = (i + q) * span;
      const y = -u + 2 * (1 - q) * q * (2 * sag + u);
      const n = i * PER + j;
      // One bulb in four goes dark in turn, and now and then one blinks on its own.
      const lit = (n + step) % 4 !== 0 && Math.sin(t * 2.3 + n * 4.7) > -0.9;
      ctx.fillStyle = C.navy;
      ctx.fillRect(x - 0.6 * u, y, 1.2 * u, 1.2 * u);
      bulb(ctx, x, y + 2.4 * u, r, n, lit);
    }
  }
}

function aurora(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, u: number) {
  const BANDS = [
    { y: 0.16, amp: 0.05, thick: 0.12, freq: 1.3, speed: 0.11, ink: C.holly, alpha: 0.16 },
    { y: 0.24, amp: 0.04, thick: 0.09, freq: 2.1, speed: -0.08, ink: C.frost, alpha: 0.1 }
  ];
  for (const b of BANDS) {
    const top = (x: number) => {
      const f = (x / w) * TAU;
      return (b.y + b.amp * Math.sin(f * b.freq + t * b.speed) + b.amp * 0.4 * Math.sin(f * b.freq * 2.3 - t * b.speed * 1.7)) * h;
    };
    const g = ctx.createLinearGradient(0, (b.y - b.amp) * h, 0, (b.y + b.amp + b.thick) * h);
    g.addColorStop(0, rgba(b.ink, 0));
    g.addColorStop(0.3, rgba(b.ink, b.alpha));
    g.addColorStop(1, rgba(b.ink, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, top(0));
    for (let x = 4 * u; x <= w + 4 * u; x += 4 * u) ctx.lineTo(x, top(x));
    for (let x = w + 4 * u; x >= 0; x -= 4 * u) ctx.lineTo(x, top(x) + b.thick * h * (0.7 + 0.3 * Math.sin((x / w) * TAU * 3 + t * 0.2)));
    ctx.closePath();
    ctx.fill();
  }
}

// --- Scenes ----------------------------------------------------------------------------------

export interface SnowOptions {
  /** Moon centre as fractions of the width and height; radius as a fraction of the height. */
  moon: { x: number; y: number; r: number };
  /** Sky colour stops, top to bottom. */
  sky: [number, string][];
  /** Snowflakes falling over the whole scene. */
  flakes: number;
  /** Size multiplier for everything on short canvases. */
  scale?: number;
  /** Santa's sleigh crosses the moon every `every` seconds, flying from `from` to `to` (fractions of the height). */
  sleigh: { every: number; from: number; to: number };
  /** Fairy lights along the top edge. */
  lights: boolean;
  /** Northern lights in the upper sky. */
  aurora: boolean;
  /** Snowy hills, a village, a decorated tree and a snowman along the bottom. */
  village: boolean;
}

/** The TV backdrop: a big moon rising over a snowy village, low in the space the screens leave free. */
export const TV_SNOW: SnowOptions = {
  moon: { x: 0.42, y: 0.86, r: 0.15 },
  sky: [[0, C.night], [0.35, C.midnight], [0.75, C.navy], [1, C.dusk]],
  flakes: 170,
  sleigh: { every: 27, from: 0.9, to: 0.58 },
  lights: true,
  aurora: true,
  village: true
};

/** The phones' header: a snowy night sky that fades into the page. */
export const PHONE_SNOW: SnowOptions = {
  moon: { x: 0.72, y: 0.17, r: 0.09 },
  sky: [[0, C.navy], [0.45, C.midnight], [1, C.night]],
  flakes: 70,
  scale: 1.5,
  sleigh: { every: 23, from: 0.52, to: 0.06 },
  lights: true,
  aurora: false,
  village: false
};

/** A reduced-motion still frame (dither.ts) is drawn at this time: when the sleigh is over the moon. */
const STILL_AT = 6;
const CROSS = 0.55;
const SLEIGH_FROM = -0.14;
const SLEIGH_TO = 1.14;

const COTTAGES = [
  // x (fraction of the width), wide?
  [0.6, 1],
  [0.665, 0],
  [0.735, 0],
  [0.83, 1]
];
const PINES = [
  // x, size (units)
  [0.2, 14],
  [0.235, 10],
  [0.27, 12],
  [0.575, 11],
  [0.7, 9],
  [0.785, 13],
  [0.875, 10],
  [0.965, 15]
];

export function snowyNight(o: SnowOptions): Scene {
  const r = random(25);
  const stars = Array.from({ length: 60 }, () => ({ x: r(), y: r() * 0.65, size: 0.35 + r() * 0.65, rate: 0.6 + r() * 2, phase: r() * TAU }));
  const flakes = Array.from({ length: o.flakes }, () => ({ x: r(), y: r(), depth: r(), sway: 0.4 + r() * 0.8, phase: r() * TAU }));
  const far = flakes.filter((f) => f.depth < 0.55);
  const near = flakes.filter((f) => f.depth >= 0.55);
  const cross = o.sleigh.every * CROSS;
  // Start the first crossing so the still frame catches the sleigh in front of the moon.
  const lead = ((o.moon.x - SLEIGH_FROM) / (SLEIGH_TO - SLEIGH_FROM)) * cross - STILL_AT;

  return {
    draw(ctx, t, w, h) {
      const u = (h / 180) * (o.scale ?? 1);

      const sky = ctx.createLinearGradient(0, 0, 0, h);
      for (const [at, colour] of o.sky) sky.addColorStop(at, colour);
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);

      if (o.aurora) aurora(ctx, w, h, t, u);

      for (const s of stars) {
        const twinkle = 0.5 + 0.5 * Math.sin(t * s.rate + s.phase);
        const size = Math.max(1, Math.round(s.size * u));
        ctx.fillStyle = `rgba(238, 245, 255, ${0.2 + 0.65 * twinkle})`;
        ctx.fillRect(Math.floor(s.x * w), Math.floor(s.y * h), size, size);
      }

      // The moon: a cold halo that breathes, a snow-white disc shaded toward its edge, and craters.
      const mx = o.moon.x * w;
      const my = o.moon.y * h;
      const R = o.moon.r * h;
      const breathe = 0.9 + 0.1 * Math.sin(t * 0.6);
      const halo = ctx.createRadialGradient(mx, my, R * 0.9, mx, my, R * 2.6);
      halo.addColorStop(0, rgba(C.ice, 0.32 * breathe));
      halo.addColorStop(0.3, rgba(C.frost, 0.14 * breathe));
      halo.addColorStop(1, rgba(C.dusk, 0));
      ctx.fillStyle = halo;
      ctx.fillRect(mx - R * 2.6, my - R * 2.6, R * 5.2, R * 5.2);
      ctx.fillStyle = C.snow;
      oval(ctx, mx, my, R, R);
      const shade = ctx.createRadialGradient(mx - R * 0.3, my - R * 0.35, R * 0.1, mx, my, R);
      shade.addColorStop(0, rgba(C.snow, 0));
      shade.addColorStop(0.75, rgba(C.ice, 0.12));
      shade.addColorStop(1, rgba(C.frost, 0.45));
      ctx.fillStyle = shade;
      oval(ctx, mx, my, R, R);
      for (const [cx, cy, cr] of [[-0.3, -0.25, 0.2], [0.25, 0.1, 0.16], [-0.05, 0.38, 0.12], [0.35, -0.35, 0.09]]) {
        haze(ctx, mx + cx * R, my + cy * R, cr * R, cr * R, rgb(C.frost), 0.35);
      }

      // Santa's sleigh crosses in front of the moon, a dark shape with one bright red light.
      const n = Math.floor((t + lead) / o.sleigh.every);
      const dt = t + lead - n * o.sleigh.every;
      if (dt < cross && (n === 0 || hash(n + 3) > 0.15)) {
        const p = dt / cross;
        const x = (SLEIGH_FROM + (SLEIGH_TO - SLEIGH_FROM) * p) * w;
        const y = (o.sleigh.from + (o.sleigh.to - o.sleigh.from) * p) * h + Math.sin(t * 1.4) * 1.5 * u;
        const s = 6 * u;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.atan2((o.sleigh.to - o.sleigh.from) * h, (SLEIGH_TO - SLEIGH_FROM) * w) * 0.6);
        team(ctx, -TEAM_MIDDLE * s, 0, s, t, SILHOUETTE);
        ctx.restore();
      }

      if (o.village) {
        // The far hill dips in front of the moon and rises to either side of it.
        const hill = (x: number) => {
          const f = x / w;
          return h * (0.9 - 0.05 * Math.exp(-(((f - 0.16) / 0.14) ** 2)) - 0.045 * Math.exp(-(((f - 0.74) / 0.17) ** 2)) + 0.005 * Math.sin(f * TAU * 4.3));
        };
        const ground = (x: number) => h * (0.945 + 0.018 * Math.sin((x / w) * TAU * 1.1 + 2.4));
        const slope = (line: (x: number) => number, top: string, bottom: string, rim: string) => {
          const g = ctx.createLinearGradient(0, line(w / 2) - 0.05 * h, 0, h);
          g.addColorStop(0, top);
          g.addColorStop(1, bottom);
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(0, h);
          for (let x = 0; x <= w + 2 * u; x += 2 * u) ctx.lineTo(x, line(x));
          ctx.lineTo(w, h);
          ctx.fill();
          // Moonlight catches the crest of the snow.
          ctx.strokeStyle = rim;
          ctx.lineWidth = Math.max(1, 0.8 * u);
          ctx.beginPath();
          for (let x = 0; x <= w + 2 * u; x += 2 * u) (x ? ctx.lineTo(x, line(x) + 0.4 * u) : ctx.moveTo(x, line(x) + 0.4 * u));
          ctx.stroke();
        };

        slope(hill, C.dusk, C.navy, C.frost);
        for (const [px, size] of PINES) pine(ctx, px * w, hill(px * w) + u, size * u);
        COTTAGES.forEach(([cx, wide], i) => cottage(ctx, cx * w, hill(cx * w) + 1.5 * u, 0.85 * u, t, i + 1, !!wide));
        slope(ground, C.frost, C.dusk, C.ice);

        const tx = 0.075 * w;
        christmasTree(ctx, tx, ground(tx) + u, 0.44 * h, t);
        const sx = 0.915 * w;
        snowman(ctx, sx, ground(sx) + u, 4.6 * u, t);
      }

      // Snow: far flakes small and slow, near ones bigger and quicker, all drifting on the breeze.
      const fall = (list: typeof flakes, ink: string, size: number, speed: number) => {
        ctx.fillStyle = ink;
        const span = h + 6 * u;
        for (const f of list) {
          const y = wrap(f.y * span + t * (speed + 8 * f.depth) * u, span) - 3 * u;
          const x = wrap(f.x * w + Math.sin(t * f.sway + f.phase) * (2 + 4 * f.depth) * u + t * 2.5 * u, w);
          ctx.fillRect(x, y, size, size);
        }
      };
      fall(far, rgba(C.ice, 0.75), Math.max(1, Math.round(0.6 * u)), 5);
      fall(near, C.snow, Math.max(1, Math.round(1.1 * u)), 9);

      if (o.lights) garland(ctx, w, u, t);
    }
  };
}

const BAUBLES = [
  // x, ribbon length (fraction of the height), seconds per swing, phase, size (units), colours.
  // They hang in the margins and in the gap between the TV's two columns, clear of text and QR codes.
  { x: 0.028, len: 0.27, period: 5.3, phase: 0, size: 4.5, ball: C.berry, band: C.gold, ribbon: C.gold },
  { x: 0.605, len: 0.2, period: 6.1, phase: 2, size: 5.5, ball: C.gold, band: C.berry, ribbon: C.berry },
  { x: 0.974, len: 0.4, period: 4.7, phase: 4, size: 4.5, ball: C.holly, band: C.snow, ribbon: C.berry }
];
const SWOOP_EVERY = 37;
const SWOOP_FOR = 4.5;

/** Drawn over the TV screens: baubles swinging on ribbons, and now and then Santa flying past. */
export function festiveFront(): Scene {
  return {
    draw(ctx, t, w, h) {
      const u = h / 180;
      for (const b of BAUBLES) {
        const a = 0.07 * Math.sin((t * TAU) / b.period + b.phase);
        const L = b.len * h;
        const px = Math.round(b.x * w) + 0.5;
        const x = px + Math.sin(a) * L;
        const y = Math.cos(a) * L;
        const R = b.size * u;
        ctx.strokeStyle = b.ribbon;
        ctx.lineWidth = Math.max(1, 0.5 * u);
        ctx.beginPath();
        ctx.moveTo(px, 0);
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(-a);
        ctx.fillStyle = C.gold;
        ctx.fillRect(-0.28 * R, 0, 0.56 * R, 0.32 * R);
        ctx.fillStyle = b.ball;
        oval(ctx, 0, 1.25 * R, R, R);
        ctx.fillStyle = b.band;
        ctx.beginPath();
        ctx.ellipse(0, 1.25 * R, R, 0.2 * R, 0, 0, TAU);
        ctx.fill();
        const shine = ctx.createRadialGradient(-0.35 * R, 0.85 * R, 0, 0, 1.25 * R, R);
        shine.addColorStop(0, rgba(C.snow, 0.75));
        shine.addColorStop(0.35, rgba(C.snow, 0));
        shine.addColorStop(0.8, rgba(C.night, 0));
        shine.addColorStop(1, rgba(C.night, 0.45));
        ctx.fillStyle = shine;
        oval(ctx, 0, 1.25 * R, R, R);
        // Now and then light glints off it.
        const g = wrap(t + b.phase * 3, 7);
        if (g < 0.8) {
          ctx.fillStyle = C.snow;
          glint(ctx, -0.38 * R, 0.85 * R, Math.sin((g / 0.8) * Math.PI) * 0.7 * R);
        }
        ctx.restore();
      }

      // Santa swoops past: in from one side, close to the camera, and away out the other.
      const n = Math.floor((t - 15) / SWOOP_EVERY);
      const dt = t - 15 - n * SWOOP_EVERY;
      if (t < 15 || dt > SWOOP_FOR) return;
      const dir = hash(n + 31) < 0.5 ? 1 : -1;
      const x0 = dir > 0 ? -0.25 * w : 1.25 * w;
      const x2 = w - x0;
      const y0 = (0.4 + 0.2 * hash(n + 32)) * h;
      const y1 = (0.02 + 0.08 * hash(n + 33)) * h;
      const y2 = (0.2 + 0.25 * hash(n + 34)) * h;
      const at = (p: number) => {
        const q = 1 - p;
        return [q * q * x0 + 2 * q * p * (w / 2) + p * p * x2, q * q * y0 + 2 * q * p * y1 + p * p * y2];
      };
      const p = dt / SWOOP_FOR;
      const [x, y] = at(p);
      const s = (7 + 9 * Math.sin(p * Math.PI)) * u;
      // A trail of gold sparkles behind the sleigh.
      for (let k = 1; k <= 10; k++) {
        const q = p - k * 0.022;
        if (q <= 0) break;
        const [sx, sy] = at(q);
        const fade = 1 - k / 11;
        ctx.fillStyle = k % 2 ? C.gold : C.glow;
        glint(ctx, sx - dir * TEAM_MIDDLE * s, sy + 0.35 * s + Math.sin(k * 2.7 + t * 9) * 0.25 * s, (0.12 + 0.18 * fade) * s * (0.6 + 0.4 * Math.sin(t * 13 + k)));
      }
      const q = 1 - p;
      const climb = 2 * q * (y1 - y0) + 2 * p * (y2 - y1);
      const run = Math.abs(2 * q * (w / 2 - x0) + 2 * p * (x2 - w / 2));
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(dir, 1);
      ctx.rotate(Math.atan2(climb, run) * 0.35);
      team(ctx, -TEAM_MIDDLE * s, 0, s, t, IN_COLOUR);
      ctx.restore();
    }
  };
}
