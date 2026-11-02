/** Small drawing and timing helpers shared by the theme scenes (halloween.ts, christmas.ts). */

export const TAU = Math.PI * 2;

/** Seeded PRNG (mulberry32), so every screen lays its scene out the same way. */
export function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A stable pseudo-random number in [0, 1) per cycle number: "does it happen this time?" */
export function hash(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export const smooth = (x: number) => {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
};

export const wrap = (v: number, span: number) => ((v % span) + span) % span;

/** Candle-like flicker between about 0.5 and 1. */
export const flicker = (t: number, seed: number) =>
  0.75 + 0.13 * Math.sin(t * 9.1 + seed) + 0.08 * Math.sin(t * 23.7 + seed * 2) + 0.04 * Math.sin(t * 3.3);

export function oval(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
  ctx.fill();
}

/** A soft ellipse: `alpha` in the middle, fading to nothing at its edge. `rgb` is "r, g, b". */
export function haze(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  rgb: string,
  alpha: number
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, `rgba(${rgb}, ${alpha})`);
  g.addColorStop(0.5, `rgba(${rgb}, ${alpha * 0.7})`);
  g.addColorStop(1, `rgba(${rgb}, 0)`);
  ctx.fillStyle = g;
  ctx.fillRect(-rx, -rx, 2 * rx, 2 * rx);
  ctx.restore();
}

/** Adds a closed polygon to the current path: [x0, y0, x1, y1, …]. */
export function poly(ctx: CanvasRenderingContext2D, pts: number[]) {
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
}
