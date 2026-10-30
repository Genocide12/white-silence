// ============================================================
// state.ts — состояние игрока, время, погода, выживание
// ============================================================
import { ITEMS, RECIPES, INV_MAX_SLOTS, itemWeight, itemName, BUILDS } from './items';
import { World, generateWorld, T_ICE, canPlaceBuild } from './world';
import { RNG, clamp } from './core';
import { Animal, spawnFauna, makeAnimal, animalDrops } from './entities';

export interface InvSlot { id: string; n: number }

export interface Skill { lvl: number; xp: number; xpNext: number }

export const SKILL_NAMES: Record<string, string> = {
  woodcut: 'Рубка',
  mining: 'Горное дело',
  craft: 'Крафт',
  cook: 'Кулинария',
  hunt: 'Охота',
  fish: 'Рыбалка',
  survival: 'Выживание',
};

export const SKILL_DESC: Record<string, string> = {
  woodcut: 'Быстрее и больше дров с дерева',
  mining: 'Больше камня и руды',
  craft: 'Открывает сложные рецепты',
  cook: 'Еда питательнее, меньше болезней',
  hunt: 'Больше мяса со зверя',
  fish: 'Лучше клёв в полынье',
  survival: 'Медленнее голод и холод',
};

export interface Toast { text: string; kind: 'info' | 'good' | 'bad' | 'craft'; t: number; id: number }

export interface Player {
  x: number; y: number;
  ang: number;
  hp: number;
  hunger: number; // 100 = сыт
  thirst: number; // 100 = напился
  energy: number; // 100 = бодр
  warmth: number; // 0..100 тепловое состояние
  sick: number; // 0..100 тяжесть болезни
  bleeding: boolean;
  bleedingT: number;
  weight: number;
  dirx: number; diry: number;
  moving: boolean;
  sprint: boolean;
  attackT: number; // таймер атаки
  attackAnim: number;
  hitFlash: number;
  walkPhase: number;
  sleepT: number; // если спит — время
  craftT: number; // текущий крафт
  craftRecipe: string | null;
  chopTarget: number | null;
  dead: boolean;
  deathReason: string;
}

export interface WeatherState {
  kind: 'clear' | 'overcast' | 'snowfall' | 'blizzard';
  intensity: number; // 0..1
  windAng: number;
  windSpeed: number;
  changeAt: number;
}

export interface Firepit {
  id: number;
  x: number; y: number;
  fuel: number; // минут горения
  lit: boolean;
}

export interface BuiltObject {
  id: number;
  kind: string; // из BUILDS
  x: number; y: number;
  hp: number;
  fuel?: number;
  lit?: boolean;
  data?: { items?: InvSlot[] };
  ang?: number;
}

export interface Stats {
  day: number;
  min: number; // игровые минуты с начала
  killed: number;
  chopped: number;
  crafted: number;
  caught: number;
  eaten: number;
  distance: number;
}

let nextFireId = 1;
let nextBuildId = 1;
let toastId = 1;

export class GameState {
  world: World;
  player: Player;
  inv: InvSlot[] = [];
  equip: Record<string, string | null> = { head: null, torso: null, legs: null, feet: null, hands: null };
  skills: Record<string, Skill> = {};
  quickUse: string | null = null;
  fires: Firepit[] = [];
  builds: BuiltObject[] = [];
  weather: WeatherState = { kind: 'clear', intensity: 0, windAng: 0, windSpeed: 1, changeAt: 120 };
  stats: Stats = { day: 1, min: 8 * 60, killed: 0, chopped: 0, crafted: 0, caught: 0, eaten: 0, distance: 0 };
  toasts: Toast[] = [];
  animals: Animal[] = [];
  notesFound: string[] = [];
  radioBuilt = false;
  radioParts = 0;
  rescued = false;
  rescueT = 0; // минут до вертолёта после сигнала
  paused = false;
  gameOver = false;
  seed: number;
  rng: RNG;
  version = 1;

  constructor(seed: number) {
    this.seed = seed;
    this.rng = new RNG(seed ^ 0x9e3779b9);
    this.world = generateWorld(seed);
    // старт в жилом модуле станции
    const start = this.world.nearestOpen(48.5, 62.5);
    this.player = {
      x: start.x, y: start.y,
      ang: Math.PI / 4,
      hp: 100, hunger: 78, thirst: 72, energy: 85, warmth: 80,
      sick: 0, bleeding: false, bleedingT: 0,
      weight: 0, dirx: 0, diry: 0, moving: false, sprint: false,
      attackT: 0, attackAnim: 0, hitFlash: 0, walkPhase: 0,
      sleepT: 0, craftT: 0, craftRecipe: null, chopTarget: null,
      dead: false, deathReason: '',
    };
    for (const k of Object.keys(SKILL_NAMES)) {
      this.skills[k] = { lvl: 0, xp: 0, xpNext: 30 };
    }
    this.animals = spawnFauna(this.world);
    // стартовое имущество
    this.addItem('oldParka', 1, true);
    this.addItem('hat', 1, true);
    this.addItem('pants', 1, true);
    this.addItem('boots', 1, true);
    this.addItem('crackers', 3);
    this.addItem('chocoBar', 1);
    this.addItem('cloth', 2);
    this.equipItem('oldParka', 'torso');
    this.equipItem('hat', 'head');
    this.equipItem('pants', 'legs');
    this.equipItem('boots', 'feet');
  }

  // ---------------- инвентарь ----------------
  invCount(id: string): number {
    let n = 0;
    for (const s of this.inv) if (s.id === id) n += s.n;
    return n;
  }

  hasItems(need: { id: string; n: number }[]): boolean {
    for (const nd of need) {
      if (nd.n > 0 && this.invCount(nd.id) < nd.n) return false;
    }
    return true;
  }

  totalWeight(): number {
    let w = 0;
    for (const s of this.inv) w += itemWeight(s.id) * s.n;
    return Math.round(w * 10) / 10;
  }

  maxWeight(): number {
    return 24 + this.skills.survival.lvl * 2;
  }

  addItem(id: string, n = 1, silent = false): boolean {
    if (!ITEMS[id]) return false;
    const def = ITEMS[id];
    const w = this.totalWeight() + def.weight * n;
    if (w > this.maxWeight() + 6) {
      this.toast('Слишком тяжело! Предмет брошен', 'bad');
      this.world.addGroundItem(this.player.x, this.player.y, id, n);
      return false;
    }
    const stack = def.stack || 1;
    // доливаем в существующие стеки
    for (const s of this.inv) {
      if (s.id === id && s.n < stack) {
        const add = Math.min(n, stack - s.n);
        s.n += add; n -= add;
        if (n <= 0) { this.recalcWeight(); return true; }
      }
    }
    while (n > 0 && this.inv.length < INV_MAX_SLOTS) {
      const add = Math.min(n, stack);
      this.inv.push({ id, n: add });
      n -= add;
    }
    if (n > 0) {
      this.toast('Инвентарь полон, часть выпала', 'bad');
      this.world.addGroundItem(this.player.x, this.player.y, id, n);
    }
    this.recalcWeight();
    if (!silent && def.cat !== 'mat') {
      // важное подбираем молча, тосты только для еды/меда
    }
    return true;
  }

  removeItem(id: string, n = 1): boolean {
    if (this.invCount(id) < n) return false;
    for (let i = this.inv.length - 1; i >= 0 && n > 0; i--) {
      if (this.inv[i].id === id) {
        const take = Math.min(n, this.inv[i].n);
        this.inv[i].n -= take; n -= take;
        if (this.inv[i].n <= 0) this.inv.splice(i, 1);
      }
    }
    this.recalcWeight();
    return true;
  }

  recalcWeight() {
    this.player.weight = this.totalWeight();
  }

  equipItem(id: string, slot?: string): boolean {
    const def = ITEMS[id];
    if (!def || !def.slot) return false;
    const sl = slot || def.slot;
    if (def.slot !== sl) return false;
    // снять старое
    if (this.equip[sl]) {
      this.inv.push({ id: this.equip[sl]!, n: 1 });
    }
    this.removeItem(id, 1);
    this.equip[sl] = id;
    this.recalcWeight();
    return true;
  }

  unequipSlot(slot: string) {
    if (!this.equip[slot]) return;
    if (this.inv.length < INV_MAX_SLOTS) {
      this.inv.push({ id: this.equip[slot]!, n: 1 });
      this.equip[slot] = null;
      this.recalcWeight();
    } else {
      this.toast('Инвентарь полон', 'bad');
    }
  }

  /** суммарная теплота одежды */
  totalWarmth(): number {
    let w = 0;
    for (const k of Object.keys(this.equip)) {
      const id = this.equip[k];
      if (id && ITEMS[id]?.warmth) w += ITEMS[id].warmth!;
    }
    return w;
  }

  /** лучшее оружие (для урона в ближнем бою) */
  bestWeapon(): { id: string; dmg: number; reach: number; speed: number } {
    let best = { id: 'fists', dmg: 4, reach: 0.9, speed: 0.45 };
    // экипировка торса может быть оружием (парка)
    const torsoId = this.equip.torso;
    if (torsoId && ITEMS[torsoId]?.dmg && ITEMS[torsoId]!.dmg! > best.dmg) {
      best = { id: torsoId, dmg: ITEMS[torsoId]!.dmg!, reach: ITEMS[torsoId]!.reach || 0.9, speed: ITEMS[torsoId]!.atkSpeed || 0.6 };
    }
    for (const s of this.inv) {
      const d = ITEMS[s.id];
      if (!d) continue;
      if ((d.dmg || 0) > best.dmg && d.cat !== 'misc') {
        best = { id: s.id, dmg: d.dmg!, reach: d.reach || 0.9, speed: d.atkSpeed || 0.6 };
      }
    }
    return best;
  }

  hasTool(prop: 'chop' | 'mine'): { id: string; power: number } | null {
    let best: { id: string; power: number } | null = null;
    const torsoId = this.equip.torso;
    if (torsoId) {
      const d = ITEMS[torsoId];
      if (d && d[prop]) best = { id: torsoId, power: d[prop]! };
    }
    for (const s of this.inv) {
      const d = ITEMS[s.id];
      if (d && d[prop] && (!best || d[prop]! > best.power)) best = { id: s.id, power: d[prop]! };
    }
    return best;
  }

  // ---------------- скиллы ----------------
  addXp(skill: string, xp: number) {
    const s = this.skills[skill];
    if (!s) return;
    s.xp += xp;
    while (s.xp >= s.xpNext) {
      s.xp -= s.xpNext;
      s.lvl++;
      s.xpNext = Math.round(30 * Math.pow(1.6, s.lvl));
      this.toast(`${SKILL_NAMES[skill]} повышен до ур. ${s.lvl}!`, 'good');
    }
  }

  // ---------------- тосты ----------------
  toast(text: string, kind: Toast['kind'] = 'info') {
    this.toasts.push({ text, kind, t: 4.5, id: toastId++ });
    if (this.toasts.length > 6) this.toasts.shift();
  }

  // ---------------- крафт ----------------
  canCraft(rid: string): { ok: boolean; why: string } {
    const r = RECIPES.find(q => q.id === rid);
    if (!r) return { ok: false, why: 'нет рецепта' };
    if (r.needSkill) {
      const s = this.skills[r.needSkill.id];
      if (s.lvl < r.needSkill.lvl) return { ok: false, why: `${SKILL_NAMES[r.needSkill.id]} ур. ${r.needSkill.lvl}` };
    }
    if (r.need && !this.hasItems(r.need)) return { ok: false, why: 'не хватает материалов' };
    if (r.atFire) {
      const near = this.fireNear(this.player.x, this.player.y, 2.2);
      if (!near) return { ok: false, why: 'нужен огонь рядом' };
    }
    return { ok: true, why: '' };
  }

  startCraft(rid: string): boolean {
    const chk = this.canCraft(rid);
    if (!chk.ok) { this.toast(chk.why, 'bad'); return false; }
    if (this.player.craftRecipe) { this.toast('Уже занят работой', 'bad'); return false; }
    this.player.craftRecipe = rid;
    this.player.craftT = 0;
    return true;
  }

  finishCraft() {
    const rid = this.player.craftRecipe;
    if (!rid) return;
    const r = RECIPES.find(q => q.id === rid);
    this.player.craftRecipe = null;
    this.player.craftT = 0;
    if (!r) return;
    if (!this.hasItems(r.need || [])) return;
    for (const nd of r.need || []) this.removeItem(nd.id, nd.n);
    this.addBuildOrItem(r);
    this.stats.crafted++;
    const skill = r.cat === 'food' ? 'cook' : 'craft';
    this.addXp(skill, r.xp || 8);
    this.toast(`Изготовлено: ${r.name}`, 'craft');
  }

  addBuildOrItem(r: { id: string; out: { id: string; n: number } }) {
    const out = r.out;
    if (['campfire', 'igloo', 'dryrack', 'wall', 'door', 'bedroll', 'crate', 'antennaBuild'].includes(out.id)) {
      // постройки сразу в мир рядом с игроком
      const dirs = [[0.9, 0], [0, 0.9], [-0.9, 0], [0, -0.9], [0.65, 0.65], [-0.65, -0.65], [0.65, -0.65], [-0.65, 0.65]];
      const from = { x: this.player.x, y: this.player.y };
      let placed = false;
      for (const [dx, dy] of dirs) {
        const nx = Math.floor(from.x + dx) + 0.5, ny = Math.floor(from.y + dy) + 0.5;
        if (canPlaceBuild(this.world, nx, ny)) {
          this.placeBuild(out.id, nx, ny);
          placed = true;
          break;
        }
      }
      if (!placed) { this.toast('Нет места для постройки', 'bad'); return; }
    } else {
      this.addItem(out.id, out.n, true);
    }
  }

  placeBuild(kind: string, x: number, y: number): BuiltObject {
    const def = BUILDS[kind];
    const b: BuiltObject = {
      id: nextBuildId++, kind, x, y, hp: def ? def.hp : 50,
      fuel: kind === 'campfire' ? 30 : undefined,
      lit: kind === 'campfire' ? false : undefined,
      data: kind === 'crate' ? { items: [] } : undefined,
      ang: 0,
    };
    this.builds.push(b);
    if (def && def.blocks) this.world.setBlocked(x, y, true);
    if (kind === 'campfire') {
      this.fires.push({ id: nextFireId++, x, y, fuel: 30, lit: false });
      this.toast('Кострище готово. Разожги его (F)', 'good');
    }
    if (kind === 'antennaBuild') {
      this.radioBuilt = true;
      this.toast('Радиомачта установлена! Подай сигнал (у радиорубки)', 'good');
    }
    return b;
  }

  fireNear(x: number, y: number, r: number): Firepit | null {
    let best: Firepit | null = null;
    let bd = r * r;
    for (const f of this.fires) {
      const dx = f.x - x, dy = f.y - y;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = f; }
    }
    return best;
  }

  buildNear(x: number, y: number, r: number, kinds?: string[]): BuiltObject | null {
    let best: BuiltObject | null = null;
    let bd = r * r;
    for (const b of this.builds) {
      if (kinds && !kinds.includes(b.kind)) continue;
      const dx = b.x - x, dy = b.y - y;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  // ---------------- еда/напитки ----------------
  useItem(slotIndex: number): void {
    const slot = this.inv[slotIndex];
    if (!slot) return;
    const def = ITEMS[slot.id];
    if (!def) return;
    const p = this.player;

    if (def.slot) {
      // надеть
      if (this.equipItem(slot.id)) {
        this.toast(`Надето: ${def.name}`, 'good');
      }
      return;
    }

    if (def.cat === 'food' || def.cat === 'drink') {
      if (def.id === 'snowBall') {
        this.toast('Снег есть нельзя — простуда! Растопи на костре', 'bad');
        return;
      }
      if (def.food) p.hunger = clamp(p.hunger + def.food * (1 + this.skills.cook.lvl * 0.04), 0, 100);
      if (def.drink) p.thirst = clamp(p.thirst + def.drink, 0, 100);
      if (def.energy) p.energy = clamp(p.energy + def.energy, 0, 100);
      if (def.heal) p.hp = clamp(p.hp + def.heal, 0, 100);
      this.stats.eaten++;
      this.removeItem(slot.id, 1);
      if (def.energy && def.energy > 20) this.addXp('survival', 2);
      const warm = def.cat === 'food' && def.id.startsWith('cooked') ? 4 : 0;
      if (warm) p.warmth = clamp(p.warmth + warm, 0, 100);
      // сырое мясо может вызвать болезнь
      if (def.sick && this.rng.chance(def.sick * (1 - this.skills.cook.lvl * 0.08))) {
        p.sick = clamp(p.sick + 30, 0, 100);
        this.toast('Похоже, что-то не свежее…', 'bad');
      } else {
        this.toast(`${def.name} — употреблено`, 'info');
      }
      return;
    }

    if (def.cat === 'med') {
      if (def.heal) {
        if (p.bleeding && (def.id === 'bandage' || def.id === 'medkit')) {
          p.bleeding = false; p.bleedingT = 0;
          this.toast('Кровотечение остановлено', 'good');
        }
        p.hp = clamp(p.hp + def.heal, 0, 100);
        this.removeItem(slot.id, 1);
        this.toast('Лечение применено', 'good');
      }
      return;
    }

    if (def.id === 'torch') {
      this.toast('Факел в инвентаре освещает путь, когда держишь в руке (RMB)', 'info');
      return;
    }

    this.toast(`${def.name}: просто лежит в рюкзаке`, 'info');
  }

  // ---------------- окружение ----------------
  /** температура воздуха, °C */
  airTemp(): number {
    const hour = (this.stats.min / 60) % 24;
    // полярная ночь: базово очень холодно
    let base = -28;
    const dayWave = Math.sin(((hour - 14) / 24) * Math.PI * 2);
    base += dayWave * 4; // днём чуть теплее
    if (this.weather.kind === 'snowfall') base -= 3;
    if (this.weather.kind === 'blizzard') base -= 12;
    base -= clamp(this.weather.intensity, 0, 1) * (this.weather.kind === 'blizzard' ? 6 : 2);
    return Math.round(base);
  }

  /** тепло у костра/печки, с учётом расстояния */
  heatAt(x: number, y: number): number {
    let heat = 0;
    for (const f of this.fires) {
      if (!f.lit || f.fuel <= 0) continue;
      const d = Math.hypot(f.x - x, f.y - y);
      if (d < 6) heat = Math.max(heat, (1 - d / 6) * 34);
    }
    // печки в зданиях
    for (const b of this.world.buildings) {
      for (const f of b.furniture) {
        if (f.kind === 'stove' && f.used) {
          const d = Math.hypot(f.x - x, f.y - y);
          if (d < 7 && this.world.buildingAt(x, y) === b) heat = Math.max(heat, (1 - d / 7) * 30);
        }
      }
    }
    // кострища-постройки тоже
    for (const bd of this.builds) {
      if (bd.kind === 'campfire' && bd.lit) {
        const d = Math.hypot(bd.x - x, bd.y - y);
        if (d < 6) heat = Math.max(heat, (1 - d / 6) * 34);
      }
    }
    // факел в руках
    if (this.inv.some(s => s.id === 'torch')) heat += 4;
    return heat;
  }

  windFactor(): number {
    if (this.world.isIndoors(this.player.x, this.player.y)) return 0.15;
    const w = this.weather.kind === 'blizzard' ? 1 : this.weather.kind === 'snowfall' ? 0.6 : 0.25;
    return w * (0.4 + this.weather.intensity * 0.6);
  }

  // ---------------- главный тик выживания (раз в игровую минуту) ----------------
  survivalTick(dtMin: number) {
    const p = this.player;
    if (p.dead || this.gameOver) return;
    const over = 1 + this.skills.survival.lvl * 0.03;

    // голод и жажда
    let hungerRate = 0.055 * dtMin;
    let thirstRate = 0.08 * dtMin;
    if (p.sprint && p.moving) { hungerRate *= 1.7; thirstRate *= 1.8; }
    p.hunger = clamp(p.hunger - hungerRate * over, 0, 100);
    p.thirst = clamp(p.thirst - thirstRate * over, 0, 100);
    p.energy = clamp(p.energy - 0.04 * dtMin * (p.sprint && p.moving ? 2.5 : 1), 0, 100);

    // температура тела
    const air = this.airTemp();
    const cloth = this.totalWarmth();
    const heat = this.heatAt(p.x, p.y);
    const wind = this.windFactor();
    const net = air + cloth * 8.5 + heat - wind * 14;
    // комфорт около net > -5
    const target = clamp((net + 22) * 2.6, 0, 100);
    p.warmth += (target - p.warmth) * clamp(dtMin * 0.035, 0, 0.5);

    // урон от холода
    if (p.warmth < 18) {
      const dmg = (18 - p.warmth) * 0.02 * dtMin;
      p.hp = clamp(p.hp - dmg, 0, 100);
      if (p.hp <= 0) this.kill('Ты замёрз. Белая тишина забрала ещё одного.');
    }
    // урон от голода/жажды
    if (p.hunger <= 0) {
      p.hp = clamp(p.hp - 0.05 * dtMin, 0, 100);
      if (p.hp <= 0) this.kill('Голод оказался сильнее воли.');
    }
    if (p.thirst <= 0) {
      p.hp = clamp(p.hp - 0.08 * dtMin, 0, 100);
      if (p.hp <= 0) this.kill('Обезвоживание. Снег вокруг был солёным от крови.');
    }
    // кровотечение
    if (p.bleeding) {
      p.bleedingT -= dtMin;
      p.hp = clamp(p.hp - 0.13 * dtMin, 0, 100);
      if (p.bleedingT <= 0) p.bleeding = false;
      if (p.hp <= 0) this.kill('Кровотечение не остановилось вовремя.');
    }
    // болезнь
    if (p.sick > 0) {
      const heal = p.hunger > 40 && p.thirst > 40 ? 0.08 : 0.02;
      p.sick = clamp(p.sick - heal * dtMin * (1 + this.skills.survival.lvl * 0.1), 0, 100);
      p.energy = clamp(p.energy - 0.02 * dtMin, 0, 100);
      if (p.sick > 45) p.hp = clamp(p.hp - 0.03 * dtMin, 0, 100);
      if (p.hp <= 0) this.kill('Хворь победила. В тайге болеют один раз.');
    }
    // регенерация
    if (p.hunger > 55 && p.thirst > 45 && p.warmth > 40 && p.energy > 25 && p.hp < 100 && p.sick < 20) {
      p.hp = clamp(p.hp + 0.045 * dtMin, 0, 100);
    }
    // жажда/голод влияют на энергию
    if (p.hunger < 18 || p.thirst < 18) p.energy = clamp(p.energy - 0.05 * dtMin, 0, 100);

    // топливо костров
    for (const f of this.fires) {
      if (f.lit && f.fuel > 0) {
        f.fuel -= dtMin;
        if (f.fuel <= 0) { f.lit = false; f.fuel = 0; }
      }
    }
    for (const b of this.builds) {
      if (b.kind === 'campfire' && b.lit && (b.fuel ?? 0) > 0) {
        b.fuel = Math.max(0, (b.fuel || 0) - dtMin);
        if (b.fuel <= 0) b.lit = false;
      }
    }

    // ягоды восстанавливаются
    for (const pr of this.world.props) {
      if (pr.kind === 'berryBush' && pr.regrowAt !== undefined && pr.regrowAt > 0) {
        if (this.stats.min >= pr.regrowAt) pr.regrowAt = 0;
      }
    }

    // следы заносятся
    const fps = this.world.footprints;
    for (let i = fps.length - 1; i >= 0; i--) {
      fps[i].life -= 0.0012 * dtMin;
      if (fps[i].life <= 0) fps.splice(i, 1);
    }

    // тосты старятся (в реальном времени)
    for (let i = this.toasts.length - 1; i >= 0; i--) {
      this.toasts[i].t -= dtMin / 3;
      if (this.toasts[i].t <= 0) this.toasts.splice(i, 1);
    }

    // вертолёт спасения
    if (this.rescued) {
      this.rescueT -= dtMin;
      if (this.rescueT <= 0) {
        this.gameOver = true;
      }
    }
  }

  kill(reason: string) {
    this.player.dead = true;
    this.player.deathReason = reason;
    this.gameOver = true;
  }

  // ---------------- погода ----------------
  weatherTick(dtMin: number) {
    if (this.stats.min >= this.weather.changeAt) {
      const r = this.rng.next();
      let kind: WeatherState['kind'] = 'clear';
      if (r < 0.34) kind = 'overcast';
      else if (r < 0.62) kind = 'snowfall';
      else if (r < 0.78) kind = 'blizzard';
      this.weather.kind = kind;
      this.weather.intensity = kind === 'clear' ? 0 : this.rng.range(0.4, 1);
      this.weather.windAng = this.rng.range(0, Math.PI * 2);
      this.weather.windSpeed = kind === 'blizzard' ? this.rng.range(1.8, 3) : this.rng.range(0.6, 1.6);
      this.weather.changeAt = this.stats.min + this.rng.range(90, 300);
      if (kind === 'blizzard') this.toast('Приближается метель! Ищи укрытие', 'bad');
    }
  }
}
