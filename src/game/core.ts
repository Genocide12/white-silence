// ============================================================
// БЕЛАЯ ТИШИНА — изометрическое выживание на полярной станции
// core.ts — математика, RNG, утилиты
// ============================================================

export const TILE_W = 64;
export const TILE_H = 32;

export function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function smoothstep(t: number): number {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
}

export function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.sqrt(dist2(ax, ay, bx, by));
}

/** Кратчайший угол от a к b (радианы) */
export function angDiff(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI;
  return d;
}

export function angleLerp(a: number, b: number, t: number): number {
  return a + angDiff(a, b) * t;
}

/** Детерминированный RNG (mulberry32) — мир генерируется одинаково */
export class RNG {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0;
  }
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number): number {
    return a + this.next() * (b - a);
  }
  int(a: number, b: number): number {
    return Math.floor(this.range(a, b + 1));
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  pick<T>(arr: T[]): T {
    return arr[Math.floor(this.next() * arr.length) % arr.length];
  }
}

/** Значение из шумовой решётки (value noise) */
export class Noise2D {
  private rng: RNG;
  private perm: Uint8Array;
  constructor(seed: number, size = 256) {
    this.rng = new RNG(seed);
    this.perm = new Uint8Array(size);
    for (let i = 0; i < size; i++) this.perm[i] = i;
    for (let i = size - 1; i > 0; i--) {
      const j = Math.floor(this.rng.next() * (i + 1));
      const t = this.perm[i]; this.perm[i] = this.perm[j]; this.perm[j] = t;
    }
  }
  private grad(ix: number, iy: number): number {
    const a = this.perm[(ix & 255)];
    const b = this.perm[(ix & 255) ^ (iy & 255)];
    return ((a * 31 + b * 17) % 255) / 255 - 0.5;
  }
  at(x: number, y: number): number {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const u = smoothstep(fx), v = smoothstep(fy);
    const a = this.grad(ix, iy), b = this.grad(ix + 1, iy);
    const c = this.grad(ix, iy + 1), d = this.grad(ix + 1, iy + 1);
    return lerp(lerp(a, b, u), lerp(c, d, u), v) * 2;
  }
  fbm(x: number, y: number, octaves = 4): number {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += this.at(x * freq, y * freq) * amp;
      norm += amp;
      amp *= 0.5; freq *= 2;
    }
    return sum / norm;
  }
}

/** Мировые (тайловые, float) координаты -> изометрический экран */
export function worldToIso(x: number, y: number): { sx: number; sy: number } {
  return {
    sx: (x - y) * (TILE_W / 2),
    sy: (x + y) * (TILE_H / 2),
  };
}

export function isoToWorld(sx: number, sy: number): { x: number; y: number } {
  return {
    x: (sx / (TILE_W / 2) + sy / (TILE_H / 2)) / 2,
    y: (sy / (TILE_H / 2) - sx / (TILE_W / 2)) / 2,
  };
}

export function fmtTimeOfDay(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = Math.floor(minutes % 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

export function fmtDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.floor(minutes % 60);
  return h > 0 ? `${h} ч ${m} мин` : `${m} мин`;
}

export function capfirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
