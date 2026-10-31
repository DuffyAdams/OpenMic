/**
 * Dithering for small animated canvas scenes. A scene paints each frame with the ordinary 2D
 * canvas API; a WebGL pass then snaps every pixel to a fixed palette through a blue-noise
 * threshold map, and the result is shown scaled up with hard pixel edges. Gradients, glows and
 * translucency all turn into fine stipple from that one pass, so scenes can stay simple, and the
 * per-pixel work runs on the GPU, so it stays cheap on a Fire TV. Without WebGL nothing is drawn
 * and the theme's plain colours show instead.
 */

export interface Scene {
  /** Paint one frame. `t` is seconds since the canvas mounted; w×h is its size in dithered pixels. */
  draw(ctx: CanvasRenderingContext2D, t: number, w: number, h: number): void;
}

export interface DitherParams {
  scene: Scene;
  /** Up to 16 colours. */
  palette: readonly string[];
  /** A fixed number of dithered pixels across (the TV looks the same at any resolution)… */
  columns?: number;
  /** …or the size of one dithered pixel in CSS pixels. */
  pixel?: number;
  fps?: number;
  /** Threshold amplitude in 0–255 colour units: higher means more stipple between palette colours. */
  spread?: number;
  /** Keep transparency (alpha is dithered too) for layers drawn over other content. */
  transparent?: boolean;
}

const MAX_COLOURS = 16;
const NOISE = 64;
/** What a still frame shows when the viewer prefers reduced motion. */
const STILL_AT = 6;

const VERTEX = `
attribute vec2 corner;
varying vec2 uv;
void main() {
  uv = vec2(corner.x, -corner.y) * 0.5 + 0.5;
  gl_Position = vec4(corner, 0.0, 1.0);
}`;

const FRAGMENT = `
precision mediump float;
uniform sampler2D scene;
uniform sampler2D noise;
uniform vec3 palette[${MAX_COLOURS}];
uniform int count;
uniform float spread;
uniform bool keepAlpha;
varying vec2 uv;
void main() {
  vec4 c = texture2D(scene, uv);
  float t = (texture2D(noise, mod(gl_FragCoord.xy, ${NOISE}.0) / ${NOISE}.0).r * 255.0 + 0.5) / 256.0;
  if (keepAlpha && c.a <= t) discard;
  vec3 v = c.rgb + (t - 0.5) * spread;
  vec3 best = palette[0];
  float bestD = 100.0;
  for (int i = 0; i < ${MAX_COLOURS}; i++) {
    if (i >= count) break;
    vec3 d = v - palette[i];
    // The eye is most sensitive to green and least to blue.
    float e = dot(d * d, vec3(2.0, 4.0, 3.0));
    if (e < bestD) {
      bestD = e;
      best = palette[i];
    }
  }
  gl_FragColor = vec4(best, 1.0);
}`;

let noise: Uint8Array | null = null;

/**
 * A tileable blue-noise threshold map (Ulichney's void-and-cluster): thresholds are spread as
 * evenly as possible at every level, so the stipple reads as fine grain rather than a grid.
 * Built once per page load (tens of milliseconds).
 */
function blueNoise(): Uint8Array {
  if (noise) return noise;
  const N = NOISE;
  const n = N * N;
  const sigma = 1.9;
  // A Gaussian over toroidal distance, laid out 2N wide so lookups never need to wrap.
  const M = 2 * N;
  const kernel = new Float32Array(M * M);
  for (let y = 0; y < M; y++) {
    for (let x = 0; x < M; x++) {
      const dx = Math.abs(((x + N / 2) % N) - N / 2);
      const dy = Math.abs(((y + N / 2) % N) - N / 2);
      kernel[y * M + x] = Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
    }
  }
  const on = new Uint8Array(n);
  const energy = new Float32Array(n);
  const toggle = (p: number, sign: 1 | -1) => {
    on[p] = sign > 0 ? 1 : 0;
    const px = p % N;
    const py = (p / N) | 0;
    for (let y = 0; y < N; y++) {
      const k = (y - py + N) * M - px + N;
      const row = y * N;
      for (let x = 0; x < N; x++) energy[row + x] += sign * kernel[k + x];
    }
  };
  /** The tightest cluster among set points, or the largest void among unset ones. */
  const find = (set: 0 | 1) => {
    let best = -1;
    let bestE = set ? -Infinity : Infinity;
    for (let p = 0; p < n; p++) {
      if (on[p] === set && (set ? energy[p] > bestE : energy[p] < bestE)) {
        bestE = energy[p];
        best = p;
      }
    }
    return best;
  };

  // A random starting pattern, relaxed until moving the tightest point into the largest void
  // changes nothing.
  let seed = 7;
  const random = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x80000000;
  const initial = Math.floor(n / 10);
  for (let k = 0; k < initial; ) {
    const p = Math.floor(random() * n);
    if (!on[p]) {
      toggle(p, 1);
      k++;
    }
  }
  for (let i = 0; i < n; i++) {
    const cluster = find(1);
    toggle(cluster, -1);
    const gap = find(0);
    toggle(gap, 1);
    if (gap === cluster) break;
  }
  // Rank every point: remove clusters from the starting pattern, then fill voids to the end.
  const rank = new Uint16Array(n);
  const pattern = on.slice();
  const patternEnergy = energy.slice();
  for (let r = initial - 1; r >= 0; r--) {
    const p = find(1);
    toggle(p, -1);
    rank[p] = r;
  }
  on.set(pattern);
  energy.set(patternEnergy);
  for (let r = initial; r < n; r++) {
    const p = find(0);
    toggle(p, 1);
    rank[p] = r;
  }
  noise = new Uint8Array(n);
  for (let p = 0; p < n; p++) noise[p] = (rank[p] * 256) / n;
  return noise;
}

const palettes = new Map<string, Float32Array>();

function paletteUniform(colours: readonly string[]): Float32Array {
  const key = colours.join();
  let rgb = palettes.get(key);
  if (!rgb) {
    rgb = new Float32Array(MAX_COLOURS * 3);
    colours.slice(0, MAX_COLOURS).forEach((c, i) => {
      const n = parseInt(c.slice(1), 16);
      rgb!.set([((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255], i * 3);
    });
    palettes.set(key, rgb);
  }
  return rgb;
}

interface Gpu {
  scene: WebGLTexture;
  uniforms: Record<'palette' | 'count' | 'spread' | 'keepAlpha', WebGLUniformLocation | null>;
}

function setup(gl: WebGLRenderingContext): Gpu {
  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return shader;
  };
  const program = gl.createProgram()!;
  gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) ?? 'dither shader failed to link');
  }
  gl.useProgram(program);

  // One triangle that covers the whole canvas.
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const corner = gl.getAttribLocation(program, 'corner');
  gl.enableVertexAttribArray(corner);
  gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0);

  const texture = (unit: number) => {
    const tex = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  };
  texture(1);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, NOISE, NOISE, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, blueNoise());
  gl.uniform1i(gl.getUniformLocation(program, 'noise'), 1);
  const scene = texture(0);
  gl.uniform1i(gl.getUniformLocation(program, 'scene'), 0);

  const at = (name: string) => gl.getUniformLocation(program, name);
  return {
    scene,
    uniforms: { palette: at('palette'), count: at('count'), spread: at('spread'), keepAlpha: at('keepAlpha') }
  };
}

/** Svelte action: runs a dithered scene on a canvas until it unmounts. */
export function dither(canvas: HTMLCanvasElement, params: DitherParams) {
  let p = params;
  const transparent = !!p.transparent;
  const source = document.createElement('canvas');
  const ctx = source.getContext('2d', { alpha: transparent });
  const gl = canvas.getContext('webgl', { alpha: transparent, antialias: false, depth: false, stencil: false });
  if (!ctx || !gl) return {};
  let gpu: Gpu | null = null;
  const init = () => {
    try {
      gpu = setup(gl);
    } catch (e) {
      console.warn('Theme effects are off:', e);
    }
  };
  init();

  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const start = performance.now();
  let w = 0;
  let h = 0;
  let raf = 0;
  let last = -Infinity;

  function resize() {
    const { width, height } = canvas.getBoundingClientRect();
    if (!width || !height) return;
    const cols = Math.max(1, p.columns ?? Math.round(width / (p.pixel ?? 2)));
    const rows = Math.max(1, Math.round((cols * height) / width));
    if (cols !== w || rows !== h) {
      canvas.width = source.width = w = cols;
      canvas.height = source.height = h = rows;
    }
  }

  function frame(t: number) {
    if (!w || !h || !gpu || !ctx || !gl) return;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    p.scene.draw(ctx, t, w, h);
    ctx.restore();
    const { uniforms } = gpu;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, gpu.scene);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.uniform3fv(uniforms.palette, paletteUniform(p.palette));
    gl.uniform1i(uniforms.count, Math.min(MAX_COLOURS, p.palette.length));
    gl.uniform1f(uniforms.spread, (p.spread ?? 40) / 255);
    gl.uniform1i(uniforms.keepAlpha, transparent ? 1 : 0);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function loop(now: number) {
    raf = requestAnimationFrame(loop);
    if (now - last < 1000 / (p.fps ?? 15) - 4) return;
    last = now;
    frame((now - start) / 1000);
  }

  // The GPU can drop the context (say, while the Fire TV app is in the background); rebuild it.
  const lost = (e: Event) => {
    e.preventDefault();
    gpu = null;
  };
  const restored = () => {
    init();
    if (still) frame(STILL_AT);
  };
  canvas.addEventListener('webglcontextlost', lost);
  canvas.addEventListener('webglcontextrestored', restored);

  const observer = new ResizeObserver(() => {
    resize();
    if (still) frame(STILL_AT);
  });
  observer.observe(canvas);
  resize();
  if (still) frame(STILL_AT);
  else raf = requestAnimationFrame(loop);

  return {
    update(next: DitherParams) {
      p = next;
      resize();
    },
    destroy() {
      cancelAnimationFrame(raf);
      observer.disconnect();
      canvas.removeEventListener('webglcontextlost', lost);
      canvas.removeEventListener('webglcontextrestored', restored);
    }
  };
}
