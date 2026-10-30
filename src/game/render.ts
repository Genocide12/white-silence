// ============================================================
// render.ts — изометрический рендер, свет, эффекты
// ============================================================
import { World, Prop, Building, MAP_W, MAP_H, T_SNOW, T_ICE, T_ROCK, T_FLOOR, T_RUBBLE } from './world';
import { GameState, Player, BuiltObject, Firepit } from './state';
import { Animal } from './entities';
import { TILE_W, TILE_H, worldToIso, clamp, lerp, Noise2D } from './core';
import { RECIPES } from './items';

const RECIPES_BY_ID: Record<string, { minutes: number }> = {};
for (const r of RECIPES) RECIPES_BY_ID[r.id] = r as any;

export interface Camera {
  x: number; y: number; // мировые координаты центра
  zoom: number;
  shake: number;
}

export interface SnowParticle {
  x: number; y: number; // экранные
  z: number; // высота
  spd: number;
  drift: number;
  size: number;
}

export interface FloatText {
  x: number; y: number; t: number; life: number;
  text: string; kind: 'dmg' | 'crit' | 'heal' | 'xp';
}

export interface BloodSplat {
  x: number; y: number;
  life: number;
  seed: number;
}

export interface Ember {
  x: number; y: number;
  vy: number; vx: number;
  life: number;
  size: number;
}

/** кеш цвета тайлов — детерминированный */
let tileShade: Float32Array | null = null;
let tileShadeSeed = -1;

function buildTileShade(world: World) {
  if (tileShade && tileShadeSeed === world.seed) return;
  tileShade = new Float32Array(MAP_W * MAP_H);
  const n = new Noise2D(world.seed + 31337);
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      tileShade![y * MAP_W + x] = n.fbm(x * 0.11, y * 0.11, 3);
    }
  }
  tileShadeSeed = world.seed;
}

function hash01(n: number): number {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
}

export class Renderer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  W = 0; H = 0;
  dpr = 1;
  lightCanvas: HTMLCanvasElement;
  lightCtx: CanvasRenderingContext2D;
  snow: SnowParticle[] = [];
  floats: FloatText[] = [];
  bloods: BloodSplat[] = [];
  embers: Ember[] = [];
  auroraPhase = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.lightCanvas = document.createElement('canvas');
    this.lightCtx = this.lightCanvas.getContext('2d')!;
  }

  resize(w: number, h: number, dpr: number) {
    this.W = w; this.H = h; this.dpr = dpr;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.lightCanvas.width = Math.floor(w * dpr / 2);
    this.lightCanvas.height = Math.floor(h * dpr / 2);
  }

  addFloat(x: number, y: number, text: string, kind: FloatText['kind'] = 'dmg') {
    this.floats.push({ x, y, t: 0, life: 1.4, text, kind });
    if (this.floats.length > 30) this.floats.shift();
  }

  addBlood(x: number, y: number) {
    this.bloods.push({ x, y, life: 1, seed: (x * 13 + y * 7) | 0 });
    if (this.bloods.length > 40) this.bloods.shift();
  }

  spawnEmbers(sx: number, sy: number, n: number) {
    for (let i = 0; i < n; i++) {
      this.embers.push({
        x: sx + (Math.random() - 0.5) * 8,
        y: sy + (Math.random() - 0.5) * 6,
        vy: -20 - Math.random() * 30,
        vx: (Math.random() - 0.5) * 8,
        life: 0.8 + Math.random() * 1.2,
        size: 1 + Math.random() * 2,
      });
    }
    if (this.embers.length > 200) this.embers.splice(0, 60);
  }

  ensureSnow(n: number) {
    while (this.snow.length < n) {
      this.snow.push({
        x: Math.random() * this.W, y: Math.random() * this.H, z: Math.random(),
        spd: 40 + Math.random() * 60, drift: Math.random() * Math.PI * 2,
        size: 0.8 + Math.random() * 1.8,
      });
    }
    if (this.snow.length > n) this.snow.length = n;
  }

  updateEffects(dt: number, weather: { kind: string; intensity: number; windAng: number; windSpeed: number }) {
    // частицы снега — экранные, обновляются здесь (sim-слой)
    const windX = Math.cos(weather.windAng) * weather.windSpeed * 120;
    const windY = Math.sin(weather.windAng) * weather.windSpeed * 60;
    for (const s of this.snow) {
      s.y += (s.spd + windY * 0.4) * dt;
      s.x += (Math.sin(s.drift + s.y * 0.01) * 12 + windX) * dt;
      if (s.y > this.H + 10) { s.y = -10; s.x = Math.random() * this.W; }
      if (s.x > this.W + 20) s.x = -20;
      if (s.x < -20) s.x = this.W + 20;
    }
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.t += dt;
      if (f.t > f.life) this.floats.splice(i, 1);
    }
    for (let i = this.embers.length - 1; i >= 0; i--) {
      const e = this.embers[i];
      e.x += e.vx * dt; e.y += e.vy * dt;
      e.vy -= 10 * dt;
      e.life -= dt;
      if (e.life <= 0) this.embers.splice(i, 1);
    }
    for (let i = this.bloods.length - 1; i >= 0; i--) {
      this.bloods[i].life -= dt * 0.01;
      if (this.bloods[i].life <= 0) this.bloods.splice(i, 1);
    }
  }

  /** главный кадр */
  drawFrame(g: GameState, cam: Camera, t: number, dt: number, showFps: number | null, hoverProp: Prop | null) {
    const ctx = this.ctx;
    const world = g.world;
    buildTileShade(world);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // фон неба
    const hour = (g.stats.min / 60) % 24;
    const sky = this.skyColors(hour, g.weather.kind);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, this.W, this.H);

    // тряска камеры
    let shx = 0, shy = 0;
    if (cam.shake > 0) {
      shx = (Math.sin(t * 61) + Math.sin(t * 47)) * cam.shake * 3;
      shy = (Math.cos(t * 53) + Math.sin(t * 43)) * cam.shake * 2;
      cam.shake = Math.max(0, cam.shake - dt * 2.2);
    }

    ctx.save();
    ctx.translate(this.W / 2 + shx, this.H / 2 + shy);
    ctx.scale(cam.zoom, cam.zoom);

    // ---- сборка спрайтов с сортировкой по глубине ----
    interface Sprite { d: number; draw: () => void }
    const sprites: Sprite[] = [];

    // видимые тайлы: 4 угла экрана -> мировые
    const halfW = this.W / 2 / cam.zoom, halfH = this.H / 2 / cam.zoom;
    const corners = [
      { x: -halfW, y: -halfH }, { x: halfW, y: -halfH },
      { x: halfW, y: halfH }, { x: -halfW, y: halfH },
    ].map(c => {
      const wx = cam.x + (c.x / (TILE_W / 2) + c.y / (TILE_H / 2)) / 2;
      const wy = cam.y + (c.y / (TILE_H / 2) - c.x / (TILE_W / 2)) / 2;
      return { x: wx, y: wy };
    });
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const c of corners) {
      minX = Math.min(minX, c.x); maxX = Math.max(maxX, c.x);
      minY = Math.min(minY, c.y); maxY = Math.max(maxY, c.y);
    }
    minX = Math.max(0, Math.floor(minX - 3)); minY = Math.max(0, Math.floor(minY - 3));
    maxX = Math.min(MAP_W - 1, Math.ceil(maxX + 3)); maxY = Math.min(MAP_H - 1, Math.ceil(maxY + 3));

    const P = (wx: number, wy: number) => worldToIso(wx - cam.x, wy - cam.y);

    // ---- земля ----
    this.drawGround(ctx, world, g, cam, minX, minY, maxX, maxY, t);

    // ---- объекты мира ----
    const auroraVisible = (hour >= 20 || hour <= 5) && (g.weather.kind === 'clear' || g.weather.kind === 'overcast');
    if (auroraVisible) this.drawAurora(ctx, cam, t);

    // пропы
    for (const p of world.props) {
      if (p.x < minX || p.x > maxX || p.y < minY || p.y > maxY) continue;
      const pp = P(p.x, p.y);
      if (!p.felled) {
        sprites.push({ d: p.x + p.y, draw: () => this.drawProp(ctx, p, pp.sx, pp.sy, t, hoverProp === p) });
      } else {
        sprites.push({ d: p.x + p.y, draw: () => this.drawFelledTree(ctx, p, pp.sx, pp.sy) });
      }
    }

    // здания: стены + мебель
    for (const b of world.buildings) {
      if (b.x > maxX || b.x + b.w < minX || b.y > maxY || b.y + b.h < minY) continue;
      this.drawBuilding(ctx, b, cam, sprites, P, t, g);
    }

    // постройки игрока
    for (const bd of g.builds) {
      if (bd.x < minX || bd.x > maxX || bd.y < minY || bd.y > maxY) continue;
      const pp = P(bd.x, bd.y);
      sprites.push({ d: bd.x + bd.y, draw: () => this.drawBuild(ctx, bd, pp.sx, pp.sy, t) });
    }

    // предметы на земле
    for (const gi of world.groundItems) {
      if (gi.x < minX || gi.x > maxX || gi.y < minY || gi.y > maxY) continue;
      const pp = P(gi.x, gi.y);
      sprites.push({ d: gi.x + gi.y, draw: () => this.drawGroundItem(ctx, gi.item, gi.n, pp.sx, pp.sy, t) });
    }

    // кровь
    for (const bl of this.bloods) {
      const pp = P(bl.x, bl.y);
      if (pp.sx < -100 || pp.sx > this.W / cam.zoom + 100) continue;
      sprites.push({ d: bl.x + bl.y - 0.01, draw: () => {
        ctx.globalAlpha = clamp(bl.life, 0, 1) * 0.55;
        ctx.fillStyle = '#7a1f1f';
        ctx.beginPath();
        ctx.ellipse(pp.sx, pp.sy, 7, 3.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }});
    }

    // следы (до сущностей)
    for (const fp of world.footprints) {
      const pp = P(fp.x, fp.y);
      if (pp.sx < -60 || pp.sx > this.W / cam.zoom + 60 || pp.sy < -60 || pp.sy > this.H / cam.zoom + 60) continue;
      sprites.push({ d: fp.x + fp.y - 0.02, draw: () => {
        ctx.globalAlpha = clamp(fp.life, 0, 1) * 0.35;
        ctx.fillStyle = '#4a5866';
        ctx.save();
        ctx.translate(pp.sx, pp.sy);
        ctx.rotate(fp.ang);
        ctx.beginPath();
        ctx.ellipse(0, 0, 3.5, 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        ctx.globalAlpha = 1;
      }});
    }

    // ---- игрок ----
    if (!g.player.dead) {
      const pl = g.player;
      const pp = P(pl.x, pl.y);
      sprites.push({ d: pl.x + pl.y + 0.01, draw: () => this.drawPlayer(ctx, g, pp.sx, pp.sy, t) });
    }

    // ---- животные (передаются снаружи) ----
    for (const a of g.animals) {
      if (a.state === 'dead') continue;
      if (a.x < minX - 2 || a.x > maxX + 2 || a.y < minY - 2 || a.y > maxY + 2) continue;
      const pp = P(a.x, a.y);
      sprites.push({ d: a.x + a.y, draw: () => this.drawAnimal(ctx, a, pp.sx, pp.sy, t) });
    }

    sprites.sort((a, b) => a.d - b.d);
    for (const s of sprites) s.draw();

    // ---- свет и тьма ----
    this.drawLighting(g, cam, hour, t);

    ctx.restore();

    // ---- снег/метель поверх ----
    this.drawWeatherOverlay(g, t);

    // ---- плавающий текст ----
    this.drawFloats(ctx, cam, dt);

    // ---- холодная виньетка ----
    if (g.player.warmth < 30 && !g.player.dead) {
      const k = 1 - g.player.warmth / 30;
      const grad = ctx.createRadialGradient(this.W / 2, this.H / 2, this.H * 0.35, this.W / 2, this.H / 2, this.H * 0.75);
      grad.addColorStop(0, 'rgba(80,140,200,0)');
      grad.addColorStop(1, `rgba(60,120,190,${0.45 * k})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, this.W, this.H);
    }

    if (showFps !== null) {
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.font = '11px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`FPS ${showFps.toFixed(0)}`, 8, 14);
    }
  }

  // ============================================================
  // НЕБО
  // ============================================================
  private skyColors(hour: number, weather: string): string {
    // полярная ночь: короткие сумерки днём
    let r: number, g: number, b: number;
    if (hour >= 10 && hour <= 14) {
      r = 42; g = 54; b = 74; // короткий полярный день
    } else if (hour > 8 && hour < 10) {
      r = 40; g = 48; b = 66;
    } else if (hour > 14 && hour < 16) {
      r = 46; g = 50; b = 68;
    } else {
      r = 14; g = 18; b = 30; // ночь
    }
    if (weather === 'snowfall') { r = Math.min(255, r + 18); g = Math.min(255, g + 18); b = Math.min(255, b + 18); }
    if (weather === 'blizzard') { r = Math.min(255, r + 34); g = Math.min(255, g + 34); b = Math.min(255, b + 34); }
    return `rgb(${r},${g},${b})`;
  }

  // ============================================================
  // ЗЕМЛЯ
  // ============================================================
  private drawGround(ctx: CanvasRenderingContext2D, world: World, g: GameState, cam: Camera, minX: number, minY: number, maxX: number, maxY: number, t: number) {
    const hw = TILE_W / 2, hh = TILE_H / 2;
    const shade = tileShade!;
    for (let ty = minY; ty <= maxY; ty++) {
      for (let tx = minX; tx <= maxX; tx++) {
        const i = ty * MAP_W + tx;
        const tl = world.tiles[i];
        const s = shade[i];
        const p = worldToIso(tx - cam.x + 0.5, ty - cam.y + 0.5);
        const sx = p.sx, sy = p.sy;
        let color: string;
        if (tl === T_SNOW) {
          const v = 226 + s * 14;
          color = `rgb(${v | 0},${(v + 2) | 0},${(v + 6) | 0})`;
        } else if (tl === T_ICE) {
          const v = 168 + s * 16;
          color = `rgb(${(v - 60) | 0},${(v - 38) | 0},${(v + 8) | 0})`;
        } else if (tl === T_ROCK) {
          const v = 118 + s * 22;
          color = `rgb(${v | 0},${(v - 2) | 0},${(v - 8) | 0})`;
        } else if (tl === T_FLOOR) {
          const v = 128 + s * 12;
          color = `rgb(${(v + 12) | 0},${(v - 8) | 0},${(v - 24) | 0})`;
        } else {
          const v = 130 + s * 14;
          color = `rgb(${v | 0},${(v - 3) | 0},${(v - 6) | 0})`;
        }
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(sx, sy - hh);
        ctx.lineTo(sx + hw, sy);
        ctx.lineTo(sx, sy + hh);
        ctx.lineTo(sx - hw, sy);
        ctx.closePath();
        ctx.fill();
        // швы дерева/камня
        if (tl === T_FLOOR || tl === T_ROCK) {
          ctx.strokeStyle = tl === T_FLOOR ? 'rgba(60,38,22,0.35)' : 'rgba(50,48,46,0.4)';
          ctx.lineWidth = 0.7;
          ctx.stroke();
        } else if (tl === T_SNOW && hash01(tx * 733 + ty * 911) < 0.05) {
          // редкие проплешины
          ctx.fillStyle = 'rgba(190,200,214,0.5)';
          ctx.beginPath();
          ctx.ellipse(sx + (hash01(tx + ty) - 0.5) * 20, sy + (hash01(tx * 3 + ty) - 0.5) * 10, 5 + hash01(tx * 5) * 6, 2.5 + hash01(ty * 5) * 3, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  // ============================================================
  // СЕВЕРНОЕ СИЯНИЕ
  // ============================================================
  private drawAurora(ctx: CanvasRenderingContext2D, cam: Camera, t: number) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const baseY = -this.H * 0.12 / cam.zoom;
    for (let band = 0; band < 3; band++) {
      const alpha = 0.045 + band * 0.02;
      const grad = ctx.createLinearGradient(0, baseY - 40, 0, baseY + 260);
      const hue = 140 + band * 22;
      grad.addColorStop(0, `hsla(${hue},80%,60%,0)`);
      grad.addColorStop(0.4, `hsla(${hue},85%,55%,${alpha})`);
      grad.addColorStop(1, `hsla(${hue + 30},80%,50%,0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      const step = 40;
      ctx.moveTo(-this.W / cam.zoom, baseY + 300);
      for (let x = -this.W / cam.zoom; x <= this.W / cam.zoom + step; x += step) {
        const y = baseY + Math.sin(x * 0.006 + t * 0.35 + band * 2.1) * 34 + Math.sin(x * 0.017 - t * 0.2 + band) * 14;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(this.W / cam.zoom + step, baseY + 300);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  // ============================================================
  // ПРОПЫ
  // ============================================================
  private drawProp(ctx: CanvasRenderingContext2D, p: Prop, sx: number, sy: number, t: number, hovered: boolean) {
    const seed = p.seed || 1;
    const sc = p.scale || 1;
    // тень
    ctx.fillStyle = 'rgba(30,40,55,0.25)';
    switch (p.kind) {
      case 'tree': {
        const sway = Math.sin(t * 0.9 + seed) * (1.5 + p.seed % 3 * 0.4);
        const h = 92 * sc;
        // тень
        ctx.beginPath(); ctx.ellipse(sx, sy + 2, 16 * sc, 7 * sc, 0, 0, Math.PI * 2); ctx.fill();
        // ствол
        ctx.fillStyle = '#4a3020';
        ctx.fillRect(sx - 2.5 * sc, sy - h * 0.3, 5 * sc, h * 0.3);
        // ярусы ели
        const tiers = 4;
        for (let i = tiers; i >= 1; i--) {
          const frac = i / (tiers + 1);
          const w = (30 - i * 5) * sc;
          const y = sy - h * (1 - frac) - h * 0.18;
          const g1 = 46 + i * 7;
          ctx.fillStyle = `rgb(${g1 - 18},${g1},${g1 - 12})`;
          ctx.beginPath();
          ctx.moveTo(sx - w + sway * frac * 0.5, y);
          ctx.lineTo(sx + sway * frac * 0.7, y - 26 * sc);
          ctx.lineTo(sx + w + sway * frac * 0.5, y);
          ctx.closePath();
          ctx.fill();
          // снег на ярусе
          ctx.fillStyle = 'rgba(235,240,248,0.85)';
          ctx.beginPath();
          ctx.moveTo(sx - w * 0.8 + sway * frac * 0.5, y - 3);
          ctx.lineTo(sx + sway * frac * 0.7, y - 12 * sc);
          ctx.lineTo(sx + w * 0.8 + sway * frac * 0.5, y - 3);
          ctx.lineTo(sx + sway * frac * 0.6, y + 1);
          ctx.closePath();
          ctx.fill();
        }
        if (hovered) {
          ctx.strokeStyle = 'rgba(255,255,255,0.6)';
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.ellipse(sx, sy, 18 * sc, 9 * sc, 0, 0, Math.PI * 2); ctx.stroke();
        }
        break;
      }
      case 'stump': {
        ctx.beginPath(); ctx.ellipse(sx, sy, 7, 4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#5d4028';
        ctx.beginPath(); ctx.ellipse(sx, sy - 4, 7, 4.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#7a5433';
        ctx.beginPath(); ctx.ellipse(sx, sy - 5, 5, 3, 0, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'rock': {
        ctx.beginPath(); ctx.ellipse(sx, sy, 15 * sc, 7.5 * sc, 0, 0, Math.PI * 2); ctx.fill();
        const pts = 7;
        ctx.fillStyle = '#6f6f74';
        ctx.beginPath();
        for (let i = 0; i < pts; i++) {
          const a = (i / pts) * Math.PI * 2;
          const rr = (9 + hash01(seed + i * 17) * 5) * sc;
          ctx.lineTo(sx + Math.cos(a) * rr, sy - 7 * sc + Math.sin(a) * rr * 0.55);
        }
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(56,56,60,0.5)';
        ctx.fill();
        // снежная шапка
        ctx.fillStyle = 'rgba(238,242,250,0.9)';
        ctx.beginPath();
        ctx.ellipse(sx - 1, sy - 11 * sc, 8 * sc, 4 * sc, -0.3, 0, Math.PI * 2);
        ctx.fill();
        if (hovered) {
          ctx.strokeStyle = 'rgba(255,255,255,0.6)';
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.ellipse(sx, sy, 16 * sc, 8 * sc, 0, 0, Math.PI * 2); ctx.stroke();
        }
        break;
      }
      case 'berryBush': {
        const grown = (p.regrowAt ?? 0) <= 0;
        ctx.beginPath(); ctx.ellipse(sx, sy, 11, 6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#2e4434';
        ctx.beginPath(); ctx.ellipse(sx, sy - 6, 11, 8, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#3a5642';
        ctx.beginPath(); ctx.ellipse(sx - 3, sy - 9, 7, 5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(sx + 4, sy - 8, 6, 4, 0, 0, Math.PI * 2); ctx.fill();
        if (grown) {
          ctx.fillStyle = '#d98c2b';
          for (let i = 0; i < 5; i++) {
            const bx = sx - 6 + hash01(seed + i) * 12;
            const by = sy - 6 - hash01(seed + i * 3) * 7;
            ctx.beginPath(); ctx.arc(bx, by, 1.6, 0, Math.PI * 2); ctx.fill();
          }
        }
        if (hovered && grown) {
          ctx.strokeStyle = 'rgba(255,220,120,0.7)';
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.ellipse(sx, sy, 13, 7, 0, 0, Math.PI * 2); ctx.stroke();
        }
        break;
      }
      case 'polynya': {
        const w = 26 * (sc || 1);
        // тёмная вода
        ctx.fillStyle = '#123340';
        ctx.beginPath(); ctx.ellipse(sx, sy, w * 0.55, w * 0.3, 0, 0, Math.PI * 2); ctx.fill();
        // блик воды
        ctx.strokeStyle = `rgba(140,200,230,${0.25 + 0.15 * Math.sin(t * 1.4 + seed)})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(sx, sy, w * 0.35, w * 0.17, 0.4, 0, Math.PI * 2);
        ctx.stroke();
        // кромка льда
        ctx.strokeStyle = 'rgba(210,230,245,0.8)';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(sx, sy, w * 0.58, w * 0.32, 0, 0, Math.PI * 2); ctx.stroke();
        if (hovered) {
          ctx.strokeStyle = 'rgba(140,220,255,0.8)';
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.ellipse(sx, sy, w * 0.65, w * 0.38, 0, 0, Math.PI * 2); ctx.stroke();
        }
        break;
      }
      case 'wreck': {
        ctx.beginPath(); ctx.ellipse(sx, sy, 14, 7, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#5c4a35';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(sx - 12, sy - 2);
        ctx.lineTo(sx - 4, sy - 10);
        ctx.lineTo(sx + 8, sy - 6);
        ctx.stroke();
        ctx.strokeStyle = '#6d5a42';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(sx + 2, sy - 8);
        ctx.lineTo(sx + 10, sy - 2);
        ctx.moveTo(sx - 6, sy - 6);
        ctx.lineTo(sx + 2, sy);
        ctx.stroke();
        break;
      }
      case 'barrel': {
        ctx.beginPath(); ctx.ellipse(sx, sy, 9 * sc, 4.5 * sc, 0, 0, Math.PI * 2); ctx.fill();
        const w = 8 * sc, h = 22 * sc;
        ctx.fillStyle = '#7a4f2a';
        ctx.beginPath();
        ctx.moveTo(sx - w, sy);
        ctx.quadraticCurveTo(sx - w - 2, sy - h * 0.55, sx - w, sy - h);
        ctx.lineTo(sx + w, sy - h);
        ctx.quadraticCurveTo(sx + w + 2, sy - h * 0.55, sx + w, sy);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#3c2814';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(sx - w - 1, sy - h * 0.35);
        ctx.lineTo(sx + w + 1, sy - h * 0.35);
        ctx.moveTo(sx - w - 1, sy - h * 0.7);
        ctx.lineTo(sx + w + 1, sy - h * 0.7);
        ctx.stroke();
        ctx.fillStyle = 'rgba(238,242,250,0.85)';
        ctx.beginPath(); ctx.ellipse(sx, sy - h, w * 0.8, w * 0.35, 0, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'sled': {
        ctx.beginPath(); ctx.ellipse(sx, sy, 16, 7, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#8a6a42';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(sx - 14, sy - 1);
        ctx.quadraticCurveTo(sx, sy + 3, sx + 14, sy - 1);
        ctx.moveTo(sx - 12, sy - 6);
        ctx.quadraticCurveTo(sx, sy - 2, sx + 12, sy - 6);
        ctx.moveTo(sx - 14, sy - 1);
        ctx.lineTo(sx - 12, sy - 6);
        ctx.moveTo(sx + 14, sy - 1);
        ctx.lineTo(sx + 12, sy - 6);
        ctx.stroke();
        break;
      }
      case 'antennaWreck': {
        ctx.beginPath(); ctx.ellipse(sx, sy, 14, 7, 0, 0, Math.PI * 2); ctx.fill();
        // сломанная мачта
        ctx.strokeStyle = '#8b95a3';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(sx - 2, sy);
        ctx.lineTo(sx - 6, sy - 20);
        ctx.lineTo(sx + 10, sy - 30);
        ctx.stroke();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#a8b2bf';
        for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(sx - 4 - i * 2, sy - 6 - i * 6);
      ctx.lineTo(sx + 4 + i * 2, sy - 9 - i * 6);
      ctx.stroke();
    }
        // мигающий огонёк
        const blink = 0.5 + 0.5 * Math.sin(t * 2.5);
        ctx.fillStyle = `rgba(255,90,70,${0.4 + blink * 0.6})`;
        ctx.beginPath(); ctx.arc(sx + 10, sy - 31, 2, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'sign': {
        ctx.beginPath(); ctx.ellipse(sx, sy, 8, 4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#6d5a42';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx, sy - 18);
        ctx.stroke();
        ctx.fillStyle = '#5f7d8c';
        ctx.fillRect(sx - 10, sy - 28, 20, 11);
        ctx.strokeStyle = '#c8d8e2';
        ctx.lineWidth = 1;
        ctx.strokeRect(sx - 10, sy - 28, 20, 11);
        ctx.fillStyle = '#dceaf2';
        ctx.font = '7px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('ВОСТОК-7', sx, sy - 20.5);
        break;
      }
    }
  }

  private drawFelledTree(ctx: CanvasRenderingContext2D, p: Prop, sx: number, sy: number) {
    const sc = p.scale || 1;
    const ang = p.felledAngle || 0.7;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.fillStyle = 'rgba(30,40,55,0.22)';
    ctx.beginPath(); ctx.ellipse(0, 0, 26 * sc, 10 * sc, ang, 0, Math.PI * 2); ctx.fill();
    ctx.rotate(ang);
    ctx.fillStyle = '#5a3d26';
    ctx.fillRect(-24 * sc, -5 * sc, 48 * sc, 10 * sc);
    ctx.fillStyle = '#6b4a30';
    ctx.fillRect(-24 * sc, -5 * sc, 48 * sc, 4 * sc);
    // сучья
    ctx.strokeStyle = '#5a3d26';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-10 * sc, -4); ctx.lineTo(-14 * sc, -14 * sc); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(8 * sc, -4); ctx.lineTo(12 * sc, -12 * sc); ctx.stroke();
    // снег
    ctx.fillStyle = 'rgba(235,240,248,0.8)';
    ctx.fillRect(-24 * sc, -6.5 * sc, 48 * sc, 2.2 * sc);
    ctx.restore();
    // пень
    ctx.fillStyle = '#5d4028';
    ctx.beginPath(); ctx.ellipse(sx - 20, sy - 2, 5, 3.4, 0, 0, Math.PI * 2); ctx.fill();
  }

  // ============================================================
  // ЗДАНИЯ
  // ============================================================
  private drawBuilding(ctx: CanvasRenderingContext2D, b: Building, cam: Camera, sprites: { d: number; draw: () => void }[], P: (x: number, y: number) => { sx: number; sy: number }, t: number, g: GameState) {
    const H = 46; // высота стен
    // стены по периметру
    const isDoor = (x: number, y: number) => b.doors.some(d => Math.floor(d.x) === Math.floor(x) && Math.floor(d.y) === Math.floor(y));
    // две "низкие" стены (юг и восток) рисуем как низкие бортики, север и запад — полные
    for (let x = b.x; x < b.x + b.w; x++) {
      for (const [wy, side] of [[b.y, 'N'], [b.y + b.h - 1, 'S']] as [number, string][]) {
        const pp = P(x + 0.5, wy + 0.5);
        const hh = side === 'N' ? H : 14;
        const door = isDoor(x + 0.5, wy + 0.5);
        const doorSide = side === 'S';
        sprites.push({ d: x + wy + 0.5 + (side === 'N' ? 0.26 : 0.34), draw: () => this.drawWallPiece(ctx, pp.sx, pp.sy, hh, 'h', t, door && doorSide) });
      }
    }
    for (let y = b.y; y < b.y + b.h; y++) {
      for (const [wx, side] of [[b.x, 'W'], [b.x + b.w - 1, 'E']] as [number, string][]) {
        const pp = P(wx + 0.5, y + 0.5);
        const hh = side === 'W' ? H : 14;
        const door = isDoor(wx + 0.5, y + 0.5);
        const doorSide = side === 'W';
        sprites.push({ d: wx + y + 0.5 + (side === 'W' ? 0.26 : 0.34), draw: () => this.drawWallPiece(ctx, pp.sx, pp.sy, hh, 'h', t, door && doorSide) });
      }
    }
    // мебель
    for (const f of b.furniture) {
      const pp = P(f.x, f.y);
      sprites.push({ d: f.x + f.y + 0.3, draw: () => this.drawFurniture(ctx, f, pp.sx, pp.sy, t, g) });
    }
  }

  private drawWallPiece(ctx: CanvasRenderingContext2D, sx: number, sy: number, h: number, orient: string, t: number, door: boolean) {
    const hw = TILE_W / 2, hh = TILE_H / 2;
    // верхняя грань (снег)
    ctx.fillStyle = '#e8edf4';
    ctx.beginPath();
    ctx.moveTo(sx, sy - hh - h);
    ctx.lineTo(sx + hw, sy - h);
    ctx.lineTo(sx, sy + hh - h);
    ctx.lineTo(sx - hw, sy - h);
    ctx.closePath();
    ctx.fill();
    // левая грань
    ctx.fillStyle = door ? '#3a2a18' : '#8a6a4a';
    ctx.beginPath();
    ctx.moveTo(sx - hw, sy - h);
    ctx.lineTo(sx, sy + hh - h);
    ctx.lineTo(sx, sy + hh);
    ctx.lineTo(sx - hw, sy);
    ctx.closePath();
    ctx.fill();
    // правая грань
    ctx.fillStyle = door ? '#2c2012' : '#6d5138';
    ctx.beginPath();
    ctx.moveTo(sx + hw, sy - h);
    ctx.lineTo(sx, sy + hh - h);
    ctx.lineTo(sx, sy + hh);
    ctx.lineTo(sx + hw, sy);
    ctx.closePath();
    ctx.fill();
    // рёбра
    ctx.strokeStyle = 'rgba(40,28,16,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sx - hw, sy - h); ctx.lineTo(sx, sy + hh - h); ctx.lineTo(sx + hw, sy - h);
    ctx.stroke();
    // снеговые сосульки на верхней кромке
    ctx.fillStyle = 'rgba(240,245,252,0.9)';
    ctx.beginPath();
    ctx.moveTo(sx - hw, sy - h - 2);
    for (let i = 0; i <= 4; i++) {
      const fx = sx - hw + (hw * 2 * i) / 4;
      const fy = sy - h - 2 + Math.abs(i - 2) * hh / 2 * 0.9;
      ctx.lineTo(fx, fy + (i % 2 === 0 ? -2 : 2));
    }
    ctx.lineTo(sx + hw, sy - h - 2);
    ctx.closePath();
    ctx.fill();
  }

  private drawFurniture(ctx: CanvasRenderingContext2D, f: any, sx: number, sy: number, t: number, g: GameState) {
    ctx.fillStyle = 'rgba(25,35,50,0.3)';
    switch (f.kind) {
      case 'bed': {
        ctx.beginPath(); ctx.ellipse(sx, sy + 2, 17, 9, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#5c4630';
        ctx.fillRect(sx - 16, sy - 14, 32, 16);
        ctx.fillStyle = '#b03a30';
        ctx.fillRect(sx - 15, sy - 13, 30, 12);
        ctx.fillStyle = '#e8e4da';
        ctx.fillRect(sx - 14, sy - 12, 9, 10);
        ctx.fillStyle = '#8a2f26';
        ctx.fillRect(sx - 4, sy - 13, 19, 12);
        break;
      }
      case 'stove': {
        ctx.beginPath(); ctx.ellipse(sx, sy + 2, 12, 6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#3a3f45';
        ctx.fillRect(sx - 10, sy - 22, 20, 22);
        ctx.fillStyle = '#2b3036';
        ctx.fillRect(sx - 10, sy - 22, 20, 5);
        // труба
        ctx.fillStyle = '#4a5058';
        ctx.fillRect(sx + 2, sy - 40, 6, 20);
        ctx.fillStyle = '#5a626c';
        ctx.fillRect(sx, sy - 42, 10, 4);
        if (f.used) {
          // огонь в печке
          const fl = 0.7 + 0.3 * Math.sin(t * 9 + sx);
          ctx.fillStyle = `rgba(255,${140 + fl * 60},40,0.9)`;
          ctx.fillRect(sx - 6, sy - 10, 12, 8);
          ctx.fillStyle = `rgba(255,230,120,${0.8 * fl})`;
          ctx.fillRect(sx - 3, sy - 8, 6, 5);
          // дым
          ctx.fillStyle = 'rgba(200,200,210,0.25)';
          for (let i = 0; i < 3; i++) {
            const sm = (t * 0.5 + i * 0.7) % 3;
            ctx.beginPath();
            ctx.arc(sx + 5 + Math.sin(t * 2 + i * 2) * 4, sy - 44 - sm * 26, 5 + sm * 7, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        break;
      }
      case 'crate': {
        ctx.beginPath(); ctx.ellipse(sx, sy + 2, 13, 6.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#7a5c38';
        ctx.fillRect(sx - 12, sy - 20, 24, 20);
        ctx.strokeStyle = '#5d4428';
        ctx.lineWidth = 2;
        ctx.strokeRect(sx - 12, sy - 20, 24, 20);
        ctx.beginPath();
        ctx.moveTo(sx - 12, sy - 20); ctx.lineTo(sx + 12, sy);
        ctx.moveTo(sx + 12, sy - 20); ctx.lineTo(sx - 12, sy);
        ctx.stroke();
        ctx.fillStyle = '#8a6a42';
        ctx.fillRect(sx - 12, sy - 22, 24, 3);
        if (!f.opened) {
          // искристый лут
          ctx.fillStyle = `rgba(255,215,120,${0.5 + 0.4 * Math.sin(t * 4)})`;
          ctx.beginPath(); ctx.arc(sx, sy - 26, 2.4, 0, Math.PI * 2); ctx.fill();
        }
        break;
      }
      case 'locker': case 'shelf': {
        ctx.beginPath(); ctx.ellipse(sx, sy + 2, 12, 6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#4c5560';
        ctx.fillRect(sx - 10, sy - 30, 20, 30);
        ctx.fillStyle = '#5a646f';
        ctx.fillRect(sx - 10, sy - 30, 20, 3);
        ctx.strokeStyle = '#37404a';
        ctx.lineWidth = 1;
        for (let i = 1; i < 3; i++) {
          ctx.beginPath(); ctx.moveTo(sx - 10, sy - 30 + i * 10); ctx.lineTo(sx + 10, sy - 30 + i * 10); ctx.stroke();
        }
        if (f.kind === 'locker') {
          ctx.fillStyle = '#2f363e';
          ctx.fillRect(sx - 8, sy - 27, 7, 8);
          ctx.fillRect(sx + 1, sy - 27, 7, 8);
        }
        if (!f.opened) {
          ctx.fillStyle = `rgba(160,220,255,${0.35 + 0.3 * Math.sin(t * 4 + 2)})`;
          ctx.beginPath(); ctx.arc(sx, sy - 34, 2.2, 0, Math.PI * 2); ctx.fill();
        }
        break;
      }
      case 'radio': {
        ctx.beginPath(); ctx.ellipse(sx, sy + 2, 13, 6.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#3e4a55';
        ctx.fillRect(sx - 11, sy - 26, 22, 26);
        ctx.fillStyle = '#1d242b';
        ctx.fillRect(sx - 8, sy - 23, 10, 7);
        const on = 0.5 + 0.5 * Math.sin(t * 3);
        ctx.fillStyle = `rgba(120,220,140,${0.3 + on * 0.5})`;
        ctx.beginPath(); ctx.arc(sx + 5, sy - 20, 1.8, 0, Math.PI * 2); ctx.fill();
        // шкала
        ctx.strokeStyle = '#8fa3b5';
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(sx - 8, sy - 12); ctx.lineTo(sx + 8, sy - 12); ctx.stroke();
        for (let i = 0; i < 5; i++) {
          ctx.beginPath();
          ctx.moveTo(sx - 8 + i * 4, sy - 14);
          ctx.lineTo(sx - 8 + i * 4, sy - 10);
          ctx.stroke();
        }
        break;
      }
      case 'table': {
        ctx.beginPath(); ctx.ellipse(sx, sy + 2, 14, 7, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#6d5138';
        ctx.fillRect(sx - 13, sy - 14, 26, 3);
        ctx.fillRect(sx - 12, sy - 11, 3, 11);
        ctx.fillRect(sx + 9, sy - 11, 3, 11);
        // бумаги
        ctx.fillStyle = '#d8d2c4';
        ctx.save();
        ctx.translate(sx + 2, sy - 14);
        ctx.rotate(-0.2);
        ctx.fillRect(-4, -2, 8, 5);
        ctx.restore();
        break;
      }
      case 'barrelF': {
        ctx.beginPath(); ctx.ellipse(sx, sy + 2, 9, 4.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#7a4f2a';
        ctx.fillRect(sx - 8, sy - 20, 16, 20);
        ctx.strokeStyle = '#3c2814';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(sx - 9, sy - 7);
        ctx.lineTo(sx + 9, sy - 7);
        ctx.moveTo(sx - 9, sy - 14);
        ctx.lineTo(sx + 9, sy - 14);
        ctx.stroke();
        break;
      }
    }
  }

  // ============================================================
  // ПОСТРОЙКИ ИГРОКА
  // ============================================================
  private drawBuild(ctx: CanvasRenderingContext2D, b: BuiltObject, sx: number, sy: number, t: number) {
    ctx.fillStyle = 'rgba(25,35,50,0.3)';
    switch (b.kind) {
      case 'campfire': {
        ctx.beginPath(); ctx.ellipse(sx, sy, 16, 8, 0, 0, Math.PI * 2); ctx.fill();
        // камни
        ctx.fillStyle = '#6b6b70';
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          ctx.beginPath();
          ctx.ellipse(sx + Math.cos(a) * 15, sy + Math.sin(a) * 7.5, 3.4, 2.4, a, 0, Math.PI * 2);
          ctx.fill();
        }
        // зола
        ctx.fillStyle = '#2a2622';
        ctx.beginPath(); ctx.ellipse(sx, sy, 11, 5.5, 0, 0, Math.PI * 2); ctx.fill();
        if (b.lit && (b.fuel ?? 0) > 0) {
          // поленья
          ctx.strokeStyle = '#5d4428';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(sx - 8, sy - 2); ctx.lineTo(sx + 8, sy - 5);
          ctx.moveTo(sx - 7, sy - 5); ctx.lineTo(sx + 7, sy - 1);
          ctx.stroke();
          // пламя
          const fl = 0.75 + 0.25 * Math.sin(t * 11) * Math.sin(t * 7.3 + 1);
          const fl2 = 0.75 + 0.25 * Math.sin(t * 13 + 2) * Math.sin(t * 8.7);
          ctx.fillStyle = `rgba(255,${(120 + fl * 70) | 0},30,0.95)`;
          ctx.beginPath();
          ctx.moveTo(sx - 7, sy - 4);
          ctx.quadraticCurveTo(sx - 8, sy - 16 * fl, sx, sy - 24 * fl2);
          ctx.quadraticCurveTo(sx + 8, sy - 16 * fl, sx + 7, sy - 4);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = `rgba(255,235,140,0.95)`;
          ctx.beginPath();
          ctx.moveTo(sx - 3.5, sy - 4);
          ctx.quadraticCurveTo(sx - 4, sy - 10 * fl2, sx, sy - 15 * fl);
          ctx.quadraticCurveTo(sx + 4, sy - 10 * fl2, sx + 3.5, sy - 4);
          ctx.closePath();
          ctx.fill();
          // дым
          for (let i = 0; i < 4; i++) {
            const sm = (t * 0.35 + i * 0.65) % 3;
            ctx.fillStyle = `rgba(190,195,205,${0.22 * (1 - sm / 3)})`;
            ctx.beginPath();
            ctx.arc(sx + Math.sin(t * 1.6 + i * 1.7) * 6, sy - 26 - sm * 30, 6 + sm * 9, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        break;
      }
      case 'igloo': {
        ctx.beginPath(); ctx.ellipse(sx, sy, 26, 13, 0, 0, Math.PI * 2); ctx.fill();
        // купол
        ctx.fillStyle = '#dde6f0';
        ctx.beginPath();
        ctx.ellipse(sx, sy - 14, 24, 20, 0, Math.PI, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#b9c6d6';
        ctx.lineWidth = 1.2;
        for (let i = 1; i <= 3; i++) {
          ctx.beginPath();
          ctx.ellipse(sx, sy - 14, 24 - i * 2, 20 - i * 3, 0, Math.PI, Math.PI * 2 - i * 0.14);
          ctx.stroke();
        }
        // вход
        ctx.fillStyle = '#2c3844';
        ctx.beginPath();
        ctx.ellipse(sx + 20, sy - 7, 8, 9, 0.3, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'dryrack': {
        ctx.beginPath(); ctx.ellipse(sx, sy, 15, 7, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#7a5c38';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(sx - 12, sy - 16); ctx.lineTo(sx - 8, sy);
        ctx.moveTo(sx + 12, sy - 16); ctx.lineTo(sx + 8, sy);
        ctx.moveTo(sx - 12, sy - 16); ctx.lineTo(sx + 12, sy - 16);
        ctx.stroke();
        ctx.strokeStyle = '#5d4428';
        ctx.lineWidth = 1;
        for (let i = -2; i <= 2; i++) {
          ctx.beginPath();
          ctx.moveTo(sx + i * 5, sy - 15);
          ctx.lineTo(sx + i * 5, sy - 6);
          ctx.stroke();
        }
        break;
      }
      case 'wall': {
        ctx.beginPath(); ctx.ellipse(sx, sy, 18, 9, 0, 0, Math.PI * 2); ctx.fill();
        this.drawWallPiece(ctx, sx, sy, 38, 'h', t, false);
        break;
      }
      case 'door': {
        ctx.beginPath(); ctx.ellipse(sx, sy, 15, 7, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#8a6a4a';
        ctx.beginPath();
        ctx.moveTo(sx - TILE_W / 2, sy);
        ctx.lineTo(sx, sy + TILE_H / 2 - 30);
        ctx.lineTo(sx + TILE_W / 2, sy);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#5d4428';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        break;
      }
      case 'bedroll': {
        ctx.beginPath(); ctx.ellipse(sx, sy, 13, 6.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#7c3f2e';
        ctx.beginPath();
        ctx.ellipse(sx, sy - 3, 13, 7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#964f38';
        ctx.beginPath();
        ctx.ellipse(sx - 6, sy - 4, 5, 3.4, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'crate': {
        this.drawFurniture(ctx, { kind: 'crate', opened: false }, sx, sy, t, null as any);
        break;
      }
      case 'antennaBuild': {
        ctx.beginPath(); ctx.ellipse(sx, sy, 12, 6, 0, 0, Math.PI * 2); ctx.fill();
        // мачта
        ctx.strokeStyle = '#9aa5b1';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx, sy - 64);
        ctx.stroke();
        ctx.lineWidth = 1.4;
        for (let i = 0; i < 4; i++) {
          ctx.beginPath();
          ctx.moveTo(sx - 8 + i, sy - 12 - i * 12);
          ctx.lineTo(sx + 8 - i, sy - 20 - i * 12);
          ctx.stroke();
        }
        // перекладины
        ctx.strokeStyle = '#c3ccd6';
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(sx - 12, sy - 58); ctx.lineTo(sx + 12, sy - 58); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(sx - 9, sy - 50); ctx.lineTo(sx + 9, sy - 50); ctx.stroke();
        const blink = 0.5 + 0.5 * Math.sin(t * 3);
        ctx.fillStyle = `rgba(120,255,150,${0.35 + blink * 0.65})`;
        ctx.beginPath(); ctx.arc(sx, sy - 66, 2.6, 0, Math.PI * 2); ctx.fill();
        break;
      }
    }
  }

  private drawGroundItem(ctx: CanvasRenderingContext2D, item: string, n: number, sx: number, sy: number, t: number) {
    ctx.fillStyle = 'rgba(25,35,50,0.25)';
    ctx.beginPath(); ctx.ellipse(sx, sy, 6, 3, 0, 0, Math.PI * 2); ctx.fill();
    // простые иконки по категориям
    const cat = item[0];
    const bob = Math.sin(t * 2.4 + sx * 0.3) * 1.5;
    switch (cat) {
      case 'w': case 'l': // wood/log
        ctx.fillStyle = '#7a5c38';
        ctx.fillRect(sx - 6, sy - 5, 12, 4);
        ctx.fillStyle = '#9a7a4f';
        ctx.beginPath(); ctx.arc(sx + 6, sy - 3, 2, 0, Math.PI * 2); ctx.fill();
        break;
      case 's': // stone/scrap/snow
        ctx.fillStyle = '#8f8f96';
        ctx.beginPath();
        ctx.moveTo(sx - 5, sy - 3); ctx.lineTo(sx, sy - 8); ctx.lineTo(sx + 5, sy - 3); ctx.lineTo(sx, sy - 1);
        ctx.closePath(); ctx.fill();
        break;
      case 'r': // raw meat
        ctx.fillStyle = '#b03d38';
        ctx.beginPath(); ctx.ellipse(sx, sy - 4 + bob * 0.3, 5.5, 3.5, 0.4, 0, Math.PI * 2); ctx.fill();
        break;
      case 'c': // canned/cooked/cloth...
        if (item === 'cookedMeat' || item === 'cookedFish') {
          ctx.fillStyle = '#9a5a28';
          ctx.beginPath(); ctx.ellipse(sx, sy - 4, 5.5, 3.5, -0.3, 0, Math.PI * 2); ctx.fill();
        } else {
          ctx.fillStyle = '#c9c2b2';
          ctx.fillRect(sx - 4, sy - 7, 8, 6);
          ctx.strokeStyle = '#8f8878';
          ctx.lineWidth = 1;
          ctx.strokeRect(sx - 4, sy - 7, 8, 6);
        }
        break;
      default:
        ctx.fillStyle = '#d5b56a';
        ctx.beginPath(); ctx.arc(sx, sy - 4 + bob * 0.3, 4, 0, Math.PI * 2); ctx.fill();
    }
    if (n > 1) {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`×${n}`, sx + 5, sy - 2);
    }
    // подсветка
    ctx.strokeStyle = `rgba(255,220,120,${0.25 + 0.2 * Math.sin(t * 3)})`;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(sx, sy, 9, 4.5, 0, 0, Math.PI * 2); ctx.stroke();
  }

  // ============================================================
  // ИГРОК
  // ============================================================
  private drawPlayer(ctx: CanvasRenderingContext2D, g: GameState, sx: number, sy: number, t: number) {
    const p = g.player;
    const isMoving = p.moving;
    const phase = p.walkPhase;
    const legSwing = isMoving ? Math.sin(phase) * 5 : 0;
    const armSwing = isMoving ? Math.sin(phase + Math.PI) * 4 : Math.sin(t * 1.5) * 1.2;
    const bob = isMoving ? Math.abs(Math.sin(phase)) * 1.8 : Math.sin(t * 1.2) * 0.6;

    // тень
    ctx.fillStyle = 'rgba(20,28,40,0.35)';
    ctx.beginPath();
    ctx.ellipse(sx, sy, 10, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // след от направления: тело рисуем "сверху" с наклоном
    const facing = p.ang;
    const cosF = Math.cos(facing), sinF = Math.sin(facing);

    // ноги (2, шагают)
    const legY = sy - 6;
    ctx.strokeStyle = '#3d4a5c';
    ctx.lineWidth = 4.5;
    ctx.lineCap = 'round';
    // нога 1
    ctx.beginPath();
    ctx.moveTo(sx - 2, legY);
    ctx.lineTo(sx - 2 + cosF * legSwing, legY + sinF * legSwing * 0.5 + 2);
    ctx.stroke();
    // нога 2 (противофаза)
    ctx.beginPath();
    ctx.moveTo(sx + 2, legY);
    ctx.lineTo(sx + 2 - cosF * legSwing, legY - sinF * legSwing * 0.5 + 2);
    ctx.stroke();

    // тело — парка
    const torsoY = sy - 16 - bob;
    const parkaColor = g.equip.torso === 'furParka' ? '#7d5a3a' : g.equip.torso === 'wolfCloak' ? '#5f6670' : g.equip.torso ? '#5d6f7d' : '#4c5864';
    ctx.fillStyle = parkaColor;
    ctx.beginPath();
    ctx.ellipse(sx, torsoY + 4, 8, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    // капюшон/воротник
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath();
    ctx.ellipse(sx, torsoY - 2, 6.5, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // руки
    ctx.strokeStyle = parkaColor;
    ctx.lineWidth = 4;
    // атака: замах рукой
    const atk = p.attackAnim > 0 ? Math.sin(p.attackAnim * Math.PI) : 0;
    const armL = sx - 7 + cosF * (armSwing - atk * 8);
    const armR = sx + 7 + cosF * (armSwing + atk * 10);
    ctx.beginPath();
    ctx.moveTo(sx - 5, torsoY + 2);
    ctx.lineTo(armL, torsoY + 7 + sinF * armSwing * 0.4);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(sx + 5, torsoY + 2);
    ctx.lineTo(armR, torsoY + 7 + sinF * armSwing * 0.4);
    ctx.stroke();

    // голова
    const headY = torsoY - 8;
    ctx.fillStyle = '#e8b98f';
    ctx.beginPath();
    ctx.arc(sx, headY, 5.4, 0, Math.PI * 2);
    ctx.fill();
    // шапка
    if (g.equip.head) {
      ctx.fillStyle = g.equip.head === 'furHat' ? '#6d5335' : '#566a4a';
      ctx.beginPath();
      ctx.arc(sx, headY - 1, 5.6, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(sx - 5.6, headY - 1.4, 11.2, 2.4);
      // ушки ушанки
      ctx.fillRect(sx - 7.2, headY - 1, 2.2, 4.5);
      ctx.fillRect(sx + 5, headY - 1, 2.2, 4.5);
    } else {
      ctx.fillStyle = '#5b4633';
      ctx.beginPath();
      ctx.arc(sx, headY - 1.5, 5.2, Math.PI, Math.PI * 2);
      ctx.fill();
    }

    // оружие в руке при атаке
    if (atk > 0.1) {
      const wpn = g.bestWeapon();
      ctx.strokeStyle = wpn.id === 'spear' ? '#8a6a42' : wpn.id.includes('Axe') ? '#6d747d' : '#c9c2b2';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(armR, torsoY + 5);
      const ax = armR + Math.cos(facing) * (10 + atk * 10);
      const ay = torsoY + 5 + Math.sin(facing) * 5 - atk * 12;
      ctx.lineTo(ax, ay);
      ctx.stroke();
      // след замаха
      ctx.strokeStyle = `rgba(255,255,255,${atk * 0.35})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(armR, torsoY + 5, 12, facing - 1.2 + atk, facing + 0.6 + atk);
      ctx.stroke();
    }
    // факел
    if (g.inv.some(s => s.id === 'torch') && !g.player.dead) {
      const tx = sx + 9, ty = torsoY + 2;
      ctx.strokeStyle = '#7a5c38';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(tx - 2, ty + 4); ctx.lineTo(tx, ty - 4); ctx.stroke();
      const fl = 0.7 + 0.3 * Math.sin(t * 10);
      ctx.fillStyle = `rgba(255,${(130 + fl * 60) | 0},40,0.95)`;
      ctx.beginPath();
      ctx.ellipse(tx, ty - 7, 3, 5 * fl, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // пар дыхания на морозе
    if (!isMoving || Math.sin(t * 0.7) > 0.6) {
      const br = (t % 3) / 3;
      if (br < 0.4) {
        ctx.fillStyle = `rgba(220,230,240,${0.35 * (1 - br / 0.4)})`;
        ctx.beginPath();
        ctx.arc(sx + cosF * 4 + br * 10, headY + 1 + sinF * 3 - br * 6, 2 + br * 6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // флеш урона
    if (p.hitFlash > 0) {
      ctx.fillStyle = `rgba(255,40,40,${p.hitFlash * 0.35})`;
      ctx.beginPath();
      ctx.ellipse(sx, sy - 12, 14, 18, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // индикатор сна
    if (p.sleepT > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Zzz…', sx, headY - 12 - Math.sin(t * 2) * 2);
    }
    // прогресс крафта
    if (p.craftRecipe) {
      const r = RECIPES_BY_ID[p.craftRecipe];
      if (r) {
        const k = clamp(p.craftT / r.minutes, 0, 1);
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(sx - 16, sy + 8, 32, 5);
        ctx.fillStyle = '#d9a441';
        ctx.fillRect(sx - 15, sy + 9, 30 * k, 3);
      }
    }
  }

  // ============================================================
  // ЖИВОТНЫЕ
  // ============================================================
  private drawAnimal(ctx: CanvasRenderingContext2D, a: Animal, sx: number, sy: number, t: number) {
    const dead = a.state === 'dead';
    if (dead) return;
    const walk = Math.sin(a.walkPhase);
    const walk2 = Math.sin(a.walkPhase + Math.PI);
    const bodyBob = Math.abs(Math.sin(a.walkPhase)) * 1.2;

    // тень
    ctx.fillStyle = 'rgba(20,28,40,0.3)';
    ctx.beginPath();
    const shadowR = a.kind === 'bear' ? 14 : a.kind === 'wolf' ? 9 : a.kind === 'deer' ? 10 : 4;
    ctx.ellipse(sx, sy, shadowR, shadowR * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();

    const ang = a.ang;
    const cosA = Math.cos(ang), sinA = Math.sin(ang);

    if (a.hitFlash > 0) {
      ctx.save();
      ctx.filter = 'none';
    }

    const flash = a.hitFlash > 0;

    switch (a.kind) {
      case 'wolf': {
        // ноги
        ctx.strokeStyle = '#4c525c';
        ctx.lineWidth = 3;
        for (const [ox, ph, front] of [[-4, walk, 1], [4, walk2, 1], [-4, walk2, -1], [4, walk, -1]] as [number, number, number][]) {
          const lx = sx + ox + (front > 0 ? cosA : 0) * ph * 3;
          const ly = sy - (front > 0 ? 4 : 2) + sinA * ph * 1.5;
          ctx.beginPath();
          ctx.moveTo(lx, ly);
          ctx.lineTo(lx + cosA * ph * 4, ly + 4 - Math.abs(ph));
          ctx.stroke();
        }
        // тело
        const by = sy - 9 - bodyBob;
        ctx.fillStyle = flash ? '#ff9a8a' : (a.state === 'chase' || a.state === 'attack') ? '#5e6470' : '#767d8a';
        ctx.beginPath();
        ctx.ellipse(sx, by, 11, 5.5, ang * 0.5, 0, Math.PI * 2);
        ctx.fill();
        // хвост
        ctx.strokeStyle = flash ? '#ff9a8a' : '#6d7480';
        ctx.lineWidth = 3.4;
        ctx.beginPath();
        ctx.moveTo(sx - cosA * 10, by - sinA * 5);
        ctx.quadraticCurveTo(sx - cosA * 16, by - 6 - sinA * 8, sx - cosA * 18 + Math.sin(t * 3) * 2, by - 8 - sinA * 10);
        ctx.stroke();
        // голова
        const hx = sx + cosA * 11, hy = by + sinA * 5 - 3;
        ctx.fillStyle = flash ? '#ff9a8a' : '#828a96';
        ctx.beginPath();
        ctx.ellipse(hx, hy, 5.4, 4.4, ang, 0, Math.PI * 2);
        ctx.fill();
        // морда
        ctx.fillStyle = '#5d6572';
        ctx.beginPath();
        ctx.ellipse(hx + cosA * 5, hy + sinA * 2 + 1, 3, 2.2, ang, 0, Math.PI * 2);
        ctx.fill();
        // уши
        ctx.fillStyle = '#4c525c';
        ctx.beginPath();
        ctx.moveTo(hx - 2, hy - 3); ctx.lineTo(hx - 1, hy - 8); ctx.lineTo(hx + 1.5, hy - 3.5);
        ctx.closePath(); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(hx + 2, hy - 3); ctx.lineTo(hx + 3, hy - 8); ctx.lineTo(hx + 4.5, hy - 3.5);
        ctx.closePath(); ctx.fill();
        // глаза при погоне
        if (a.state === 'chase' || a.state === 'attack') {
          ctx.fillStyle = '#ffd23e';
          ctx.beginPath(); ctx.arc(hx + cosA * 2 - 1.5, hy - 1, 1, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(hx + cosA * 2 + 1.5, hy - 1, 1, 0, Math.PI * 2); ctx.fill();
        }
        // вой
        if (a.howling > 0) {
          ctx.fillStyle = 'rgba(255,255,255,0.75)';
          ctx.font = '10px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('~♪', hx, hy - 12 - Math.sin(t * 4) * 2);
        }
        break;
      }
      case 'bear': {
        // ноги
        ctx.strokeStyle = '#4a3d30';
        ctx.lineWidth = 5.5;
        for (const [ox, ph, front] of [[-7, walk, 1], [7, walk2, 1], [-7, walk2, -1], [7, walk, -1]] as [number, number, number][]) {
          const lx = sx + ox + cosA * ph * 2;
          const ly = sy - (front > 0 ? 6 : 3);
          ctx.beginPath();
          ctx.moveTo(lx, ly);
          ctx.lineTo(lx + cosA * ph * 3.5, ly + 6 - Math.abs(ph) * 1.5);
          ctx.stroke();
        }
        // тело
        const by = sy - 15 - bodyBob;
        ctx.fillStyle = flash ? '#ffb3a0' : '#6b5a44';
        ctx.beginPath();
        ctx.ellipse(sx, by, 17, 10, ang * 0.4, 0, Math.PI * 2);
        ctx.fill();
        // горб
        ctx.fillStyle = flash ? '#ffb3a0' : '#75634b';
        ctx.beginPath();
        ctx.ellipse(sx - cosA * 3, by - 4, 10, 6, ang * 0.4, 0, Math.PI * 2);
        ctx.fill();
        // голова
        const hx = sx + cosA * 15, hy = by + sinA * 7 - 4;
        ctx.fillStyle = flash ? '#ffb3a0' : '#7d6a50';
        ctx.beginPath();
        ctx.ellipse(hx, hy, 7.5, 6, ang, 0, Math.PI * 2);
        ctx.fill();
        // уши
        ctx.fillStyle = '#59483a';
        ctx.beginPath(); ctx.arc(hx - 2, hy - 5, 2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(hx + 3, hy - 5, 2, 0, Math.PI * 2); ctx.fill();
        // морда
        ctx.fillStyle = '#8d7a5e';
        ctx.beginPath();
        ctx.ellipse(hx + cosA * 6, hy + sinA * 2 + 1.5, 3.6, 2.6, ang, 0, Math.PI * 2);
        ctx.fill();
        // глаза при погоне
        if (a.state === 'chase' || a.state === 'attack') {
          ctx.fillStyle = '#ff5e3e';
          ctx.beginPath(); ctx.arc(hx - 2, hy - 1, 1.3, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(hx + 2, hy - 1, 1.3, 0, Math.PI * 2); ctx.fill();
        }
        break;
      }
      case 'hare': {
        const hop = a.state === 'flee' ? Math.abs(Math.sin(a.walkPhase * 0.8)) * 5 : 0;
        ctx.fillStyle = flash ? '#ffb3a0' : '#dfe5ec';
        ctx.beginPath();
        ctx.ellipse(sx, sy - 4 - hop, 4.6, 3.4, ang, 0, Math.PI * 2);
        ctx.fill();
        const hx = sx + cosA * 4, hy = sy - 5 - hop;
        ctx.beginPath();
        ctx.arc(hx, hy, 2.6, 0, Math.PI * 2);
        ctx.fill();
        // уши
        ctx.strokeStyle = flash ? '#ffb3a0' : '#cfd6de';
        ctx.lineWidth = 1.8;
        ctx.beginPath(); ctx.moveTo(hx - 1, hy - 2); ctx.lineTo(hx - 2 - cosA * 1.5, hy - 8); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(hx + 1, hy - 2); ctx.lineTo(hx + 1 - cosA * 1.5, hy - 8.5); ctx.stroke();
        // хвостик
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(sx - cosA * 4.5, sy - 3 - hop, 1.5, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'deer': {
        // ноги длинные
        ctx.strokeStyle = '#6d5a40';
        ctx.lineWidth = 2.8;
        for (const [ox, ph, front] of [[-6, walk, 1], [6, walk2, 1], [-6, walk2, -1], [6, walk, -1]] as [number, number, number][]) {
          const lx = sx + ox + cosA * ph * 2;
          const ly = sy - (front > 0 ? 12 : 9);
          ctx.beginPath();
          ctx.moveTo(lx, ly);
          ctx.lineTo(lx + cosA * ph * 4, ly + 9 - Math.abs(ph) * 2);
          ctx.stroke();
        }
        // тело
        const by = sy - 16 - bodyBob;
        ctx.fillStyle = flash ? '#ffb3a0' : '#9a7d5a';
        ctx.beginPath();
        ctx.ellipse(sx, by, 12, 6.5, ang * 0.45, 0, Math.PI * 2);
        ctx.fill();
        // белая попа
        ctx.fillStyle = '#d8d0c2';
        ctx.beginPath();
        ctx.ellipse(sx - cosA * 9, by - sinA * 4, 5, 4, ang, 0, Math.PI * 2);
        ctx.fill();
        // шея и голова
        const hx = sx + cosA * 13, hy = by - 6 + sinA * 5;
        ctx.strokeStyle = flash ? '#ffb3a0' : '#9a7d5a';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(sx + cosA * 8, by - 2);
        ctx.lineTo(hx, hy - 3);
        ctx.stroke();
        ctx.fillStyle = flash ? '#ffb3a0' : '#a58763';
        ctx.beginPath();
        ctx.ellipse(hx, hy - 4, 4, 3.2, ang, 0, Math.PI * 2);
        ctx.fill();
        // рога
        ctx.strokeStyle = '#c9b98f';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(hx - 2, hy - 6); ctx.lineTo(hx - 4, hy - 13);
        ctx.moveTo(hx - 4, hy - 10); ctx.lineTo(hx - 7, hy - 12);
        ctx.moveTo(hx + 1, hy - 6); ctx.lineTo(hx + 2, hy - 13);
        ctx.moveTo(hx + 2, hy - 10); ctx.lineTo(hx + 5, hy - 12);
        ctx.stroke();
        break;
      }
    }

    if (a.hitFlash > 0) ctx.restore();

    // хп-бар раненого зверя
    if (a.hp < a.maxHp && a.hp > 0) {
      const w = a.kind === 'bear' ? 26 : 18;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(sx - w / 2, sy - 36, w, 4);
      ctx.fillStyle = a.hp / a.maxHp > 0.4 ? '#7fce6a' : '#e05545';
      ctx.fillRect(sx - w / 2 + 0.5, sy - 35.5, (w - 1) * clamp(a.hp / a.maxHp, 0, 1), 3);
    }
  }

  // ============================================================
  // СВЕТ
  // ============================================================
  private drawLighting(g: GameState, cam: Camera, hour: number, t: number) {
    // темнее всего ночью
    let darkness: number;
    if (hour >= 21 || hour <= 5) darkness = 0.82;
    else if (hour >= 19) darkness = 0.82 * ((hour - 19) / 2);
    else if (hour <= 7) darkness = 0.82 * ((7 - hour) / 2);
    else darkness = 0;
    if (g.weather.kind === 'blizzard') darkness = Math.min(0.85, darkness + 0.25);
    else if (g.weather.kind === 'snowfall') darkness = Math.min(0.85, darkness + 0.1);
    if (darkness <= 0.02) return;

    const lc = this.lightCtx;
    const lw = this.lightCanvas.width, lh = this.lightCanvas.height;
    lc.setTransform(1, 0, 0, 1, 0, 0);
    lc.clearRect(0, 0, lw, lh);
    lc.fillStyle = `rgba(8,12,24,${darkness})`;
    lc.fillRect(0, 0, lw, lh);

    // дырки света: composite destination-out
    lc.globalCompositeOperation = 'destination-out';
    const P = (wx: number, wy: number) => worldToIso(wx - cam.x, wy - cam.y);
    const zoomK = cam.zoom * 0.5; // light canvas half res
    const addLight = (sx: number, sy: number, r: number, k: number) => {
      const x = (sx * cam.zoom + this.W / 2) * 0.5 + 0;
      const y = (sy * cam.zoom + this.H / 2) * 0.5 + 0;
      if (x < -r || x > lw + r || y < -r || y > lh + r) return;
      const flick = 0.85 + 0.15 * Math.sin(t * 9 + sx);
      const rr = r * zoomK * flick;
      const grad = lc.createRadialGradient(x, y, 0, x, y, rr);
      grad.addColorStop(0, `rgba(0,0,0,${k})`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      lc.fillStyle = grad;
      lc.beginPath();
      lc.arc(x, y, rr, 0, Math.PI * 2);
      lc.fill();
    };

    // костры
    for (const f of g.fires) {
      if (f.lit && f.fuel > 0) {
        const pp = P(f.x, f.y);
        addLight(pp.sx, pp.sy - 8, 170, 0.95);
      }
    }
    for (const b of g.builds) {
      if (b.kind === 'campfire' && b.lit && (b.fuel ?? 0) > 0) {
        const pp = P(b.x, b.y);
        addLight(pp.sx, pp.sy - 8, 170, 0.95);
      }
    }
    // факел игрока
    if (g.inv.some(s => s.id === 'torch')) {
      const pp = P(g.player.x, g.player.y);
      addLight(pp.sx, pp.sy - 14, 120, 0.85);
    }
    // печки в зданиях
    for (const b of g.world.buildings) {
      for (const f of b.furniture) {
        if (f.kind === 'stove' && f.used) {
          const pp = P(f.x, f.y);
          addLight(pp.sx, pp.sy - 20, 110, 0.8);
        }
      }
    }
    // окна — слабое свечение
    for (const b of g.world.buildings) {
      if (!b.lightsOn) continue;
      const pp = P(b.x + b.w / 2, b.y + b.h / 2);
      addLight(pp.sx, pp.sy - 20, 130, 0.55);
    }
    // игрок сам чуть светится, чтобы не был невидим
    {
      const pp = P(g.player.x, g.player.y);
      addLight(pp.sx, pp.sy - 12, 90, 0.45);
    }

    lc.globalCompositeOperation = 'source-over';

    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.drawImage(this.lightCanvas, 0, 0, this.W, this.H);
    ctx.restore();
  }

  // ============================================================
  // ПОГОДА (экранный слой)
  // ============================================================
  private drawWeatherOverlay(g: GameState, t: number) {
    const ctx = this.ctx;
    const w = g.weather;
    if (w.kind === 'snowfall' || w.kind === 'blizzard') {
      const n = w.kind === 'blizzard' ? 260 : 130;
      this.ensureSnow(n);
      ctx.fillStyle = 'rgba(235,240,248,0.85)';
      for (const s of this.snow) {
        const size = w.kind === 'blizzard' ? s.size * 1.6 : s.size;
        ctx.globalAlpha = 0.5 + s.z * 0.5;
        ctx.beginPath();
        ctx.arc(s.x, s.y, size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (w.kind === 'blizzard') {
        // полосы ветра
        ctx.strokeStyle = 'rgba(255,255,255,0.14)';
        ctx.lineWidth = 1.5;
        const wa = g.weather.windAng;
        for (let i = 0; i < 24; i++) {
          const ph = (t * 0.6 + i * 0.618) % 1;
          const x = (hash01(i * 7) * 1.4 - 0.2) * this.W + Math.cos(wa) * ph * 300;
          const y = hash01(i * 13) * this.H + Math.sin(wa) * ph * 300 - ph * 100;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + Math.cos(wa) * 34, y + Math.sin(wa) * 34);
          ctx.stroke();
        }
      }
    } else {
      this.ensureSnow(0);
    }
    // уголки-виньетка в метель
    if (w.kind === 'blizzard') {
      ctx.fillStyle = 'rgba(200,212,228,0.16)';
      ctx.fillRect(0, 0, this.W, this.H);
    }
  }

  private drawFloats(ctx: CanvasRenderingContext2D, cam: Camera, dt: number) {
    ctx.textAlign = 'center';
    for (const f of this.floats) {
      const pp = worldToIso(f.x - cam.x, f.y - cam.y);
      const k = f.t / f.life;
      const x = pp.sx * cam.zoom + this.W / 2;
      const y = pp.sy * cam.zoom + this.H / 2 - 24 - k * 30;
      ctx.globalAlpha = clamp(1 - k * k, 0, 1);
      ctx.font = f.kind === 'crit' ? 'bold 16px sans-serif' : 'bold 13px sans-serif';
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.lineWidth = 3;
      ctx.strokeText(f.text, x, y);
      ctx.fillStyle = f.kind === 'heal' ? '#7fce6a' : f.kind === 'crit' ? '#ffd23e' : f.kind === 'xp' ? '#8fd0ff' : '#ff6a5e';
      ctx.fillText(f.text, x, y);
    }
    ctx.globalAlpha = 1;
  }
}
