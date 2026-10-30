// ============================================================
// world.ts — генерация и хранение мира
// ============================================================
import { RNG, Noise2D, clamp } from './core';

export const MAP_W = 112;
export const MAP_H = 112;

export const T_SNOW = 0;
export const T_ICE = 1;   // лёд озера
export const T_ROCK = 2;  // скальник
export const T_FLOOR = 3; // пол станции (дерево)
export const T_RUBBLE = 4;

export interface Prop {
  id: number;
  kind: 'tree' | 'rock' | 'berryBush' | 'polynya' | 'stump' | 'wreck' | 'antennaWreck' | 'sign' | 'sled' | 'barrel' | 'fishHole';
  x: number; y: number;
  hp: number;
  maxHp: number;
  seed: number;
  /** для ягод: время созревания (игровые минуты) */
  regrowAt?: number;
  /** упавшее дерево лежит до разделки */
  felled?: boolean;
  felledAngle?: number;
  /** размер 0.8..1.3 */
  scale?: number;
}

export interface Furniture {
  kind: 'bed' | 'stove' | 'crate' | 'radio' | 'table' | 'shelf' | 'locker' | 'barrelF';
  x: number; y: number;
  /** лут ящика/шкафа */
  loot?: { id: string; n: number; ch: number }[];
  opened?: boolean;
  /** привязанная записка */
  noteId?: string;
  used?: boolean;
}

export interface Building {
  name: string;
  x: number; y: number; w: number; h: number;
  /** позиции дверей (по периметру) */
  doors: { x: number; y: number }[];
  furniture: Furniture[];
  lightsOn: boolean;
}

export interface GroundItem {
  id: number;
  x: number; y: number;
  item: string;
  n: number;
  /** исчезает по таймеру (мин) */
  ttl?: number;
}

export interface Footprint {
  x: number; y: number;
  ang: number;
  life: number; // 0..1 остаток
  id: number;
}

let nextPropId = 1;
let nextGroundId = 1;
let nextFootId = 1;

export class World {
  w = MAP_W;
  h = MAP_H;
  tiles = new Uint8Array(MAP_W * MAP_H);
  blocked = new Uint8Array(MAP_W * MAP_H);
  props: Prop[] = [];
  buildings: Building[] = [];
  groundItems: GroundItem[] = [];
  footprints: Footprint[] = [];
  /** озёра: центры полыней */
  lakes: { x: number; y: number; r: number }[] = [];
  seed = 1337;

  idx(x: number, y: number): number {
    return y * this.w + x;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  tileAt(x: number, y: number): number {
    const ix = Math.floor(x), iy = Math.floor(y);
    if (!this.inBounds(ix, iy)) return T_ROCK;
    return this.tiles[this.idx(ix, iy)];
  }

  isBlocked(x: number, y: number): boolean {
    const ix = Math.floor(x), iy = Math.floor(y);
    if (!this.inBounds(ix, iy)) return true;
    return this.blocked[this.idx(ix, iy)] > 0;
  }

  setBlocked(x: number, y: number, v: boolean) {
    const ix = Math.floor(x), iy = Math.floor(y);
    if (!this.inBounds(ix, iy)) return;
    if (v) this.blocked[this.idx(ix, iy)] = 1;
    else this.blocked[this.idx(ix, iy)] = 0;
  }

  /** ближайшая свободная клетка (для спавна — правило skill'а: не спавнить в стене) */
  nearestOpen(x: number, y: number): { x: number; y: number } {
    if (!this.isBlocked(x, y)) return { x, y };
    for (let r = 1; r <= 8; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          const nx = x + dx, ny = y + dy;
          if (this.inBounds(nx, ny) && !this.isBlocked(nx, ny)) {
            return { x: nx + 0.5, y: ny + 0.5 };
          }
        }
      }
    }
    return { x: x + 0.5, y: y + 0.5 };
  }

  propById(id: number): Prop | undefined {
    return this.props.find(p => p.id === id);
  }

  removeProp(id: number) {
    const i = this.props.findIndex(p => p.id === id);
    if (i >= 0) {
      const p = this.props[i];
      this.props.splice(i, 1);
      if (p.kind === 'tree' || p.kind === 'rock' || p.kind === 'barrel' || p.kind === 'wreck') {
        this.setBlocked(p.x, p.y, false);
      }
    }
  }

  addGroundItem(x: number, y: number, item: string, n = 1) {
    const open = this.nearestOpen(x, y);
    this.groundItems.push({ id: nextGroundId++, x: open.x, y: open.y, item, n });
  }

  removeGroundItem(id: number) {
    const i = this.groundItems.findIndex(g => g.id === id);
    if (i >= 0) this.groundItems.splice(i, 1);
  }

  addFootprint(x: number, y: number, ang: number) {
    if (this.footprints.length > 900) this.footprints.splice(0, 100);
    this.footprints.push({ id: nextFootId++, x, y, ang, life: 1 });
  }

  /** проп в клетке (для взаимодействия) */
  propAt(x: number, y: number, radius = 1.1): Prop | null {
    let best: Prop | null = null;
    let bestD = radius * radius;
    for (const p of this.props) {
      const dx = p.x - x, dy = p.y - y;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        // срубленное дерево взаимодействует с большого радиуса
        bestD = d; best = p;
      }
    }
    return best;
  }

  buildingAt(x: number, y: number): Building | null {
    for (const b of this.buildings) {
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
    }
    return null;
  }

  furnitureNear(x: number, y: number, radius = 1.3): { f: Furniture; b: Building } | null {
    let best: { f: Furniture; b: Building } | null = null;
    let bestD = radius * radius;
    for (const b of this.buildings) {
      for (const f of b.furniture) {
        const dx = f.x - x, dy = f.y - y;
        const d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = { f, b }; }
      }
    }
    return best;
  }

  isIndoors(x: number, y: number): boolean {
    const ix = Math.floor(x), iy = Math.floor(y);
    for (const b of this.buildings) {
      if (ix > b.x && ix < b.x + b.w - 1 && iy > b.y && iy < b.y + b.h - 1) return true;
    }
    return false;
  }
}

// ============================================================
// Лут-таблицы
// ============================================================
const LOOT_CRATE_FOOD: { id: string; n: number; ch: number }[] = [
  { id: 'cannedStew', n: 2, ch: 0.55 }, { id: 'crackers', n: 4, ch: 0.45 },
  { id: 'chocoBar', n: 2, ch: 0.35 }, { id: 'coffeeBeans', n: 1, ch: 0.25 },
];
const LOOT_CRATE_TOOL: { id: string; n: number; ch: number }[] = [
  { id: 'scrap', n: 3, ch: 0.6 }, { id: 'wire', n: 2, ch: 0.35 },
  { id: 'ironAxe', n: 1, ch: 0.12 }, { id: 'knife', n: 1, ch: 0.2 },
  { id: 'rope', n: 2, ch: 0.3 }, { id: 'pot', n: 1, ch: 0.15 },
  { id: 'lantern', n: 1, ch: 0.12 }, { id: 'flare', n: 2, ch: 0.2 },
  { id: 'battery', n: 1, ch: 0.15 },
];
const LOOT_CRATE_MED: { id: string; n: number; ch: number }[] = [
  { id: 'bandage', n: 3, ch: 0.6 }, { id: 'medkit', n: 1, ch: 0.3 },
  { id: 'herbs', n: 4, ch: 0.4 }, { id: 'cloth', n: 3, ch: 0.5 },
];
const LOOT_CRATE_CLOTH: { id: string; n: number; ch: number }[] = [
  { id: 'oldParka', n: 1, ch: 0.3 }, { id: 'hat', n: 1, ch: 0.35 },
  { id: 'pants', n: 1, ch: 0.3 }, { id: 'boots', n: 1, ch: 0.3 },
  { id: 'gloves', n: 1, ch: 0.35 }, { id: 'cloth', n: 4, ch: 0.5 },
];

function rollLoot(rng: RNG, table: { id: string; n: number; ch: number }[]): { id: string; n: number }[] {
  const out: { id: string; n: number }[] = [];
  for (const e of table) {
    if (rng.chance(e.ch)) out.push({ id: e.id, n: rng.int(1, e.n) });
  }
  return out;
}

// ============================================================
// Генерация мира
// ============================================================
export function generateWorld(seed: number): World {
  const world = new World();
  world.seed = seed;
  const rng = new RNG(seed);
  const noise = new Noise2D(seed + 7);
  const noise2 = new Noise2D(seed + 991);

  // ---- рельеф и тайлы ----
  for (let y = 0; y < world.h; y++) {
    for (let x = 0; x < world.w; x++) {
      const i = world.idx(x, y);
      const edge = Math.min(x, y, world.w - 1 - x, world.h - 1 - y);
      if (edge < 3) { world.tiles[i] = T_ROCK; world.blocked[i] = 1; continue; }

      const n = noise.fbm(x * 0.045, y * 0.045, 4);
      const n2 = noise2.fbm(x * 0.08, y * 0.08, 3);
      // скалы на севере и краях
      const north = y < 26 ? (26 - y) / 26 : 0;
      if (n > 0.34 || n2 > 0.52 && north > 0.3 || (north > 0.75 && n2 > 0.35)) {
        world.tiles[i] = T_ROCK;
      } else if (n < -0.42) {
        world.tiles[i] = T_ICE; // озёра
      } else {
        world.tiles[i] = T_SNOW;
      }
    }
  }

  // ---- крупное центральное озеро с полыньями ----
  world.lakes.push({ x: 74, y: 40, r: 9 });
  world.lakes.push({ x: 30, y: 70, r: 7 });
  for (const lake of world.lakes) {
    for (let y = Math.floor(lake.y - lake.r - 2); y <= lake.y + lake.r + 2; y++) {
      for (let x = Math.floor(lake.x - lake.r - 2); x <= lake.x + lake.r + 2; x++) {
        if (!world.inBounds(x, y)) continue;
        const d = Math.hypot(x - lake.x, y - lake.y);
        const wob = noise2.at(x * 0.3, y * 0.3) * 1.8;
        if (d < lake.r + wob) {
          const i = world.idx(x, y);
          world.tiles[i] = T_ICE;
          world.blocked[i] = 0;
        }
      }
    }
    // полыньи — рыба
    for (let k = 0; k < 3; k++) {
      const a = rng.range(0, Math.PI * 2);
      const rr = rng.range(1, lake.r - 2);
      const px = Math.round(lake.x + Math.cos(a) * rr);
      const py = Math.round(lake.y + Math.sin(a) * rr);
      world.props.push({
        id: nextPropId++, kind: 'polynya', x: px + 0.5, y: py + 0.5,
        hp: 1, maxHp: 1, seed: rng.int(0, 9999), scale: rng.range(0.9, 1.15),
      });
    }
  }

  // ---- станция «Восток-7» (юго-центр) ----
  const stX = 44, stY = 58;
  const buildings: { name: string; dx: number; dy: number; w: number; h: number; door: 'S' | 'W' | 'E' | 'N' }[] = [
    { name: 'Жилой модуль', dx: 0, dy: 0, w: 12, h: 8, door: 'S' },
    { name: 'Радиорубка', dx: 15, dy: 1, w: 7, h: 7, door: 'W' },
    { name: 'Склад', dx: 0, dy: -12, w: 10, h: 7, door: 'S' },
    { name: 'Лаборатория', dx: 16, dy: -10, w: 8, h: 6, door: 'W' },
  ];
  for (const bdef of buildings) {
    const b: Building = {
      name: bdef.name,
      x: stX + bdef.dx, y: stY + bdef.dy, w: bdef.w, h: bdef.h,
      doors: [], furniture: [], lightsOn: false,
    };
    // стены и пол
    for (let y = b.y; y < b.y + b.h; y++) {
      for (let x = b.x; x < b.x + b.w; x++) {
        const i = world.idx(x, y);
        world.tiles[i] = T_FLOOR;
        world.blocked[i] = 1; // стены станут дверью
        world.props = world.props.filter(p => !(p.x >= b.x - 1 && p.x <= b.x + b.w && p.y >= b.y - 1 && p.y <= b.y + b.h));
      }
    }
    // внутренность свободна
    for (let y = b.y + 1; y < b.y + b.h - 1; y++) {
      for (let x = b.x + 1; x < b.x + b.w - 1; x++) {
        world.setBlocked(x, y, false);
      }
    }
    // дверь
    let doorX = b.x + Math.floor(b.w / 2), doorY = b.y + b.h - 1;
    if (bdef.door === 'W') { doorX = b.x; doorY = b.y + Math.floor(b.h / 2); }
    if (bdef.door === 'E') { doorX = b.x + b.w - 1; doorY = b.y + Math.floor(b.h / 2); }
    if (bdef.door === 'N') { doorY = b.y; doorX = b.x + Math.floor(b.w / 2); }
    world.setBlocked(doorX, doorY, false);
    b.doors.push({ x: doorX, y: doorY });

    // ---- мебель и лут ----
    const bx = b.x, by = b.y;
    if (bdef.name === 'Жилой модуль') {
      b.furniture.push({ kind: 'bed', x: bx + 2.5, y: by + 1.8, noteId: 'n1' });
      b.furniture.push({ kind: 'stove', x: bx + 4.5, y: by + 1.8 });
      b.furniture.push({ kind: 'shelf', x: bx + 8.5, y: by + 1.8, loot: LOOT_CRATE_CLOTH, opened: false, noteId: 'n2' });
      b.furniture.push({ kind: 'table', x: bx + 6, y: by + 4 });
      b.furniture.push({ kind: 'crate', x: bx + 9.5, y: by + 4.5, loot: LOOT_CRATE_FOOD, opened: false, noteId: 'n4' });
      b.furniture.push({ kind: 'bed', x: bx + 2.5, y: by + 5 });
    } else if (bdef.name === 'Радиорубка') {
      b.furniture.push({ kind: 'radio', x: bx + 3, y: by + 1.8, noteId: 'n10' });
      b.furniture.push({ kind: 'table', x: bx + 2, y: by + 4 });
      b.furniture.push({ kind: 'locker', x: bx + 5, y: by + 1.8, loot: LOOT_CRATE_TOOL, opened: false, noteId: 'n3' });
      b.furniture.push({ kind: 'shelf', x: bx + 4.5, y: by + 4.5, loot: LOOT_CRATE_MED, opened: false, noteId: 'n7' });
    } else if (bdef.name === 'Склад') {
      b.furniture.push({ kind: 'crate', x: bx + 2.5, y: by + 2, loot: LOOT_CRATE_TOOL, opened: false });
      b.furniture.push({ kind: 'crate', x: bx + 5.5, y: by + 2, loot: LOOT_CRATE_FOOD, opened: false });
      b.furniture.push({ kind: 'crate', x: bx + 8, y: by + 4.5, loot: LOOT_CRATE_CLOTH, opened: false, noteId: 'n5' });
      b.furniture.push({ kind: 'barrelF', x: bx + 7.5, y: by + 2 } as Furniture);
      b.furniture.push({ kind: 'shelf', x: bx + 2.5, y: by + 4.5, loot: LOOT_CRATE_TOOL, opened: false, noteId: 'n6' });
    } else {
      // лаборатория
      b.furniture.push({ kind: 'table', x: bx + 3, y: by + 3 });
      b.furniture.push({ kind: 'shelf', x: bx + 1.8, y: by + 2.5, loot: LOOT_CRATE_MED, opened: false, noteId: 'n9' });
      b.furniture.push({ kind: 'locker', x: bx + 5.5, y: by + 1.8, loot: LOOT_CRATE_TOOL, opened: false, noteId: 'n8' });
      b.furniture.push({ kind: 'bed', x: bx + 5.5, y: by + 4 });
    }
    // мебель блокирует (кроме стола)
    for (const f of b.furniture) {
      if (f.kind === 'table' || f.kind === 'bed') continue;
      world.setBlocked(f.x, f.y, true);
    }
    world.buildings.push(b);
  }

  // ---- сломанная антенна у радиорубки (финальный квест) ----
  world.props.push({ id: nextPropId++, kind: 'antennaWreck', x: 61.5, y: 56.5, hp: 1, maxHp: 1, seed: 5 });

  // ---- сани и бочки вокруг станции ----
  world.props.push({ id: nextPropId++, kind: 'sled', x: 40.5, y: 51.5, hp: 1, maxHp: 1, seed: 11 });
  world.props.push({ id: nextPropId++, kind: 'barrel', x: 58.5, y: 63.5, hp: 20, maxHp: 20, seed: 12, scale: 1 });
  world.props.push({ id: nextPropId++, kind: 'barrel', x: 59.5, y: 64.2, hp: 20, maxHp: 20, seed: 13, scale: 0.9 });
  world.props.push({ id: nextPropId++, kind: 'sign', x: 42.5, y: 55.5, hp: 1, maxHp: 1, seed: 14 });
  world.setBlocked(58, 63, true); world.setBlocked(59, 64, true);

  // ---- деревья (леса) ----
  const forestNoise = new Noise2D(seed + 555);
  for (let y = 4; y < world.h - 4; y++) {
    for (let x = 4; x < world.w - 4; x++) {
      const i = world.idx(x, y);
      if (world.tiles[i] !== T_SNOW || world.blocked[i]) continue;
      const f = forestNoise.fbm(x * 0.06, y * 0.06, 4);
      const westForest = x < 34 ? 0.25 : 0; // запад — лес гуще
      const density = f + westForest;
      // не сажаем близко к станции
      const nearStation = x > 38 && x < 68 && y > 42 && y < 74;
      if (!nearStation && density > 0.18 && rng.chance(0.16 + density * 0.35)) {
        const px = x + rng.range(0.25, 0.75), py = y + rng.range(0.25, 0.75);
        if (world.isBlocked(px, py)) continue;
        world.props.push({
          id: nextPropId++, kind: 'tree', x: px, y: py,
          hp: 100, maxHp: 100, seed: rng.int(0, 9999), scale: rng.range(0.85, 1.35),
        });
        world.setBlocked(px, py, true);
      }
    }
  }

  // ---- камни ----
  for (let y = 4; y < world.h - 4; y++) {
    for (let x = 4; x < world.w - 4; x++) {
      const i = world.idx(x, y);
      if (world.tiles[i] !== T_SNOW && world.tiles[i] !== T_ROCK) continue;
      if (world.blocked[i]) continue;
      if (rng.chance(0.012)) {
        const px = x + rng.range(0.3, 0.7), py = y + rng.range(0.3, 0.7);
        if (world.isBlocked(px, py)) continue;
        world.props.push({
          id: nextPropId++, kind: 'rock', x: px, y: py,
          hp: 140, maxHp: 140, seed: rng.int(0, 9999), scale: rng.range(0.8, 1.5),
        });
        world.setBlocked(px, py, true);
      }
    }
  }

  // ---- кусты морошки ----
  for (let y = 6; y < world.h - 6; y++) {
    for (let x = 6; x < world.w - 6; x++) {
      const i = world.idx(x, y);
      if (world.tiles[i] !== T_SNOW || world.blocked[i]) continue;
      if (rng.chance(0.006)) {
        const px = x + 0.5, py = y + 0.5;
        if (world.isBlocked(px, py)) continue;
        world.props.push({
          id: nextPropId++, kind: 'berryBush', x: px, y: py,
          hp: 1, maxHp: 1, seed: rng.int(0, 9999), regrowAt: 0, scale: rng.range(0.9, 1.2),
        });
      }
    }
  }

  // ---- обломки и бочки в глуши ----
  for (let k = 0; k < 26; k++) {
    const x = rng.int(8, world.w - 8), y = rng.int(8, world.h - 8);
    if (world.isBlocked(x + 0.5, y + 0.5)) continue;
    const i = world.idx(x, y);
    if (world.tiles[i] === T_ICE) continue;
    if (rng.chance(0.5)) {
      world.props.push({ id: nextPropId++, kind: 'wreck', x: x + 0.5, y: y + 0.5, hp: 30, maxHp: 30, seed: rng.int(0, 9999) });
      world.setBlocked(x, y, true);
    } else {
      world.props.push({ id: nextPropId++, kind: 'barrel', x: x + 0.5, y: y + 0.5, hp: 20, maxHp: 20, seed: rng.int(0, 9999), scale: rng.range(0.8, 1.1) });
      world.setBlocked(x, y, true);
    }
  }

  // ---- стартовые предметы на земле у жилого модуля (обучение) ----
  world.addGroundItem(stX + 5.5, stY + 8.8, 'crackers', 2);
  world.addGroundItem(stX + 6.2, stY + 8.8, 'wood', 2);

  return world;
}

/** случайная точка в дикой местности для спавна животных */
export function wildSpot(world: World, rng: RNG, minDistFrom: { x: number; y: number }, minD: number): { x: number; y: number } {
  for (let tries = 0; tries < 200; tries++) {
    const x = rng.int(8, world.w - 8) + 0.5;
    const y = rng.int(8, world.h - 8) + 0.5;
    if (world.tileAt(x, y) === T_ICE) continue;
    if (world.isBlocked(x, y)) continue;
    if (Math.hypot(x - minDistFrom.x, y - minDistFrom.y) < minD) continue;
    return { x, y };
  }
  return { x: 20.5, y: 20.5 };
}

/** подходит ли клетка для установки постройки */
export function canPlaceBuild(world: World, x: number, y: number): boolean {
  if (!world.inBounds(Math.floor(x), Math.floor(y))) return false;
  if (world.isBlocked(x, y)) return false;
  if (world.buildingAt(x, y)) return false;
  const t = world.tileAt(x, y);
  if (t === T_ICE) return false;
  // не на обломках/полыньях
  if (world.propAt(x, y, 0.8)) return false;
  return true;
}
