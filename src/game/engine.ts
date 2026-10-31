// ============================================================
// Чистый движок «Белая Тишина: Топка».
// Никакого React и DOM: этот же код работает в браузере,
// в тестах и в симуляторе ботов (рой на 60х).
// ============================================================
import {
  GENERATORS, UPGRADES, MINES, TELEGRAPHS, INVENTIONS, STAR_UPGRADES, ACHIEVEMENTS, MILESTONES,
  GROWTH, MINE_GROWTH, TELEGRAPH_GROWTH,
  COAL_UNLOCK, TELEGRAPH_UNLOCK, PRESTIGE_UNLOCK,
  FURNACE_BASE_COST, FURNACE_GROWTH, FURNACE_STEP,
} from './content';

export const SAVE_KEY = 'tishina-topka-save-v1';
export const SAVE_VERSION = 1;

export interface GameState {
  rev: number; // счётчик изменений для React-снапшотов
  wood: number;
  totalWood: number;   // за всё время (не сбрасывается престижем)
  runWood: number;     // за текущую экспедицию (сбрасывается)
  clicks: number;
  playTime: number;    // всего секунд игры
  gens: number[];
  upgrades: string[];  // id купленных улучшений
  coal: number;
  totalCoal: number;
  mines: number[];
  furnace: number;     // уровень топки
  depeshi: number;
  totalDepeshi: number;
  telegraphs: number[];
  inventions: string[];
  stars: number;       // потратить можно эти
  totalStars: number;  // заработано за всё время (множитель от них)
  starUpgrades: string[];
  prestiges: number;
  achievements: string[];
  autoBuy: boolean[];  // автобuy генераторов (нужно изобретение «Автоартель»)
  autoFurnace: boolean;
  auroraNext: number;  // игровое время начала следующего сияния
  auroraUntil: number; // игровое время конца текущего
  aurorasSeen: number;
  lastSeen: number;    // epoch ms для оффлайна
  offlineEarned: number; // последний оффлайн-доход (для модалки)
  bestWps: number;
  milestones: string[];// показанные вехи
}

export interface TickResult {
  newAchievements: string[];
  auroraStarted: boolean;
}

export function createInitialState(): GameState {
  return {
    rev: 0,
    wood: 0, totalWood: 0, runWood: 0, clicks: 0, playTime: 0,
    gens: new Array(GENERATORS.length).fill(0),
    upgrades: [],
    coal: 0, totalCoal: 0,
    mines: new Array(MINES.length).fill(0),
    furnace: 0,
    depeshi: 0, totalDepeshi: 0,
    telegraphs: new Array(TELEGRAPHS.length).fill(0),
    inventions: [],
    stars: 0, totalStars: 0, starUpgrades: [],
    prestiges: 0,
    achievements: [],
    autoBuy: new Array(GENERATORS.length).fill(false),
    autoFurnace: false,
    auroraNext: 120 + Math.random() * 120,
    auroraUntil: 0,
    aurorasSeen: 0,
    lastSeen: Date.now(),
    offlineEarned: 0,
    bestWps: 0,
    milestones: [],
  };
}

const has = (list: string[], id: string) => list.indexOf(id) >= 0;

// ---------------- selectors ----------------

export function genMult(s: GameState, i: number): number {
  let m = 1;
  for (const u of UPGRADES) {
    if (u.kind === 'genMult' && u.target === i && has(s.upgrades, u.id)) m *= u.value;
  }
  if (has(s.inventions, 'blueprints')) m *= 2;
  return m;
}

export function starBonusPerStar(s: GameState): number {
  return has(s.inventions, 'hyperborean') ? 0.06 : 0.04;
}

/** Множитель северного сияния (апгрейд «Сполохи» усиливает) */
export function auroraMultiplier(s: GameState): number {
  return has(s.starUpgrades, 'aurora_amp') ? 10 : 5;
}

export function furnaceStep(s: GameState): number {
  return has(s.starUpgrades, 'double_furnace') ? 1.3 : FURNACE_STEP;
}

export function globalMult(s: GameState): number {
  let m = 1;
  for (const u of UPGRADES) {
    if (u.kind === 'globalMult' && has(s.upgrades, u.id)) m *= u.value;
  }
  if (has(s.inventions, 'chronometer')) m *= 1.15;
  m *= Math.pow(furnaceStep(s), s.furnace);
  m *= 1 + starBonusPerStar(s) * s.totalStars;
  m *= 1 + 0.01 * s.achievements.length;
  if (has(s.starUpgrades, 'ship')) m *= 10;
  if (isAuroraActive(s)) {
    m *= auroraMultiplier(s);
  }
  return m;
}

export function isAuroraActive(s: GameState): boolean {
  return s.auroraUntil > 0 && s.playTime < s.auroraUntil;
}

export function woodPerSec(s: GameState): number {
  let base = 0;
  for (let i = 0; i < GENERATORS.length; i++) {
    base += s.gens[i] * GENERATORS[i].baseProd * genMult(s, i);
  }
  return base * globalMult(s);
}

export function clickPower(s: GameState): number {
  let mult = 1;
  let share = 0;
  for (const u of UPGRADES) {
    if (!has(s.upgrades, u.id)) continue;
    if (u.kind === 'clickMult') mult *= u.value;
    if (u.kind === 'clickShare') share += u.value;
  }
  return mult + share * woodPerSec(s);
}

export function autoClickRate(s: GameState): number {
  if (has(s.inventions, 'autosharp2')) return 10;
  if (has(s.inventions, 'autosharp')) return 3;
  return 0;
}

export function coalPerSec(s: GameState): number {
  let base = 0;
  for (let i = 0; i < MINES.length; i++) base += s.mines[i] * MINES[i].baseProd;
  return base * (has(s.starUpgrades, 'rich_vein') ? 2 : 1);
}

export function depeshiPerSec(s: GameState): number {
  let base = 0;
  for (let i = 0; i < TELEGRAPHS.length; i++) base += s.telegraphs[i] * TELEGRAPHS[i].baseProd;
  return base;
}

export function genCostReduction(s: GameState): number {
  return has(s.inventions, 'logistics') ? 0.95 : 1;
}

export function upgradeCostReduction(s: GameState): number {
  return has(s.starUpgrades, 'rulebook') ? 0.8 : 1;
}

/** Цена n штук генератора i (с уже купленными count штуками) */
export function generatorCost(s: GameState, i: number, n = 1): number {
  const g = GENERATORS[i];
  const c = s.gens[i];
  const sum = g.baseCost * Math.pow(GROWTH, c) * (Math.pow(GROWTH, n) - 1) / (GROWTH - 1);
  return sum * genCostReduction(s);
}

export function maxBuyCount(s: GameState, i: number): number {
  const g = GENERATORS[i];
  return maxAffordable(s.wood, g.baseCost * Math.pow(GROWTH, s.gens[i]) * genCostReduction(s), GROWTH);
}

function maxAffordable(currency: number, nextPrice: number, growth: number): number {
  if (currency < nextPrice) return 0;
  return Math.max(0, Math.floor(Math.log(currency * (growth - 1) / nextPrice + 1) / Math.log(growth)));
}

export function maxBuyMine(s: GameState, i: number): number {
  const m = MINES[i];
  return maxAffordable(s.wood, m.baseCost * Math.pow(MINE_GROWTH, s.mines[i]), MINE_GROWTH);
}

export function maxBuyTelegraph(s: GameState, i: number): number {
  const t = TELEGRAPHS[i];
  return maxAffordable(s.wood, t.baseCost * Math.pow(TELEGRAPH_GROWTH, s.telegraphs[i]), TELEGRAPH_GROWTH);
}

export function maxBuyFurnace(s: GameState): number {
  return maxAffordable(s.coal, FURNACE_BASE_COST * Math.pow(FURNACE_GROWTH, s.furnace), FURNACE_GROWTH);
}

export function mineCost(s: GameState, i: number, n = 1): number {
  const m = MINES[i];
  const c = s.mines[i];
  return m.baseCost * Math.pow(MINE_GROWTH, c) * (Math.pow(MINE_GROWTH, n) - 1) / (MINE_GROWTH - 1);
}

export function telegraphCost(s: GameState, i: number, n = 1): number {
  const t = TELEGRAPHS[i];
  const c = s.telegraphs[i];
  return t.baseCost * Math.pow(TELEGRAPH_GROWTH, c) * (Math.pow(TELEGRAPH_GROWTH, n) - 1) / (TELEGRAPH_GROWTH - 1);
}

export function furnaceCost(s: GameState, levels = 1): number {
  return FURNACE_BASE_COST * Math.pow(FURNACE_GROWTH, s.furnace) * (Math.pow(FURNACE_GROWTH, levels) - 1) / (FURNACE_GROWTH - 1);
}

export function prestigeGain(s: GameState): number {
  if (s.runWood < PRESTIGE_UNLOCK) return 0;
  // степень 0.38: длинные забеги награждаются, но снежный ком ограничен
  return Math.floor(Math.pow(s.runWood / PRESTIGE_UNLOCK, 0.38));
}

export function totalGenerators(s: GameState): number {
  return s.gens.reduce((a, b) => a + b, 0);
}

export function dayOfPolarNight(s: GameState): number {
  return Math.floor(s.playTime / 600) + 1;
}

export function coalUnlocked(s: GameState): boolean { return s.totalWood >= COAL_UNLOCK; }
export function telegraphUnlocked(s: GameState): boolean { return s.totalWood >= TELEGRAPH_UNLOCK; }
export function prestigeUnlocked(s: GameState): boolean { return s.totalStars > 0 || s.runWood >= PRESTIGE_UNLOCK / 10; }
export function starsUnlocked(s: GameState): boolean { return s.prestiges > 0; }

/** Виден ли генератор i в списке (раскрытие) */
export function genVisible(s: GameState, i: number): boolean {
  if (i === 0) return true;
  if (s.gens[i] > 0) return true;
  if (s.gens[i - 1] > 0) return true;
  return s.totalWood >= GENERATORS[i].baseCost * 0.4;
}

export function upgradeAvailable(s: GameState, id: string): boolean {
  const u = UPGRADES.find((x) => x.id === id);
  if (!u || has(s.upgrades, id)) return false;
  if (u.req.gens && s.gens[u.req.gens[0]] < u.req.gens[1]) return false;
  if (u.req.totalWood && s.totalWood < u.req.totalWood) return false;
  if (u.req.clicks && s.clicks < u.req.clicks) return false;
  return true;
}

// ---------------- actions ----------------

export function doClick(s: GameState, times = 1): number {
  const gain = clickPower(s) * times;
  s.wood += gain; s.runWood += gain; s.totalWood += gain;
  s.clicks += times;
  return gain;
}

export function buyGenerator(s: GameState, i: number, n = 1): boolean {
  if (n <= 0) return false;
  const cost = generatorCost(s, i, n);
  if (s.wood < cost) return false;
  s.wood -= cost;
  s.gens[i] += n;
  return true;
}

export function buyUpgrade(s: GameState, id: string): boolean {
  const u = UPGRADES.find((x) => x.id === id);
  if (!u || !upgradeAvailable(s, id)) return false;
  const cost = u.cost * upgradeCostReduction(s);
  if (s.wood < cost) return false;
  s.wood -= cost;
  s.upgrades.push(id);
  return true;
}

export function buyMine(s: GameState, i: number, n = 1): boolean {
  const cost = mineCost(s, i, n);
  if (s.wood < cost) return false;
  s.wood -= cost;
  s.mines[i] += n;
  return true;
}

export function buyTelegraph(s: GameState, i: number, n = 1): boolean {
  const cost = telegraphCost(s, i, n);
  if (s.wood < cost) return false;
  s.wood -= cost;
  s.telegraphs[i] += n;
  return true;
}

export function buyFurnace(s: GameState, levels = 1): boolean {
  const cost = furnaceCost(s, levels);
  if (s.coal < cost) return false;
  s.coal -= cost;
  s.furnace += levels;
  return true;
}

export function buyInvention(s: GameState, id: string): boolean {
  const inv = INVENTIONS.find((x) => x.id === id);
  if (!inv || has(s.inventions, id)) return false;
  if (s.depeshi < inv.cost) return false;
  s.depeshi -= inv.cost;
  s.inventions.push(id);
  return true;
}

export function buyStarUpgrade(s: GameState, id: string): boolean {
  const su = STAR_UPGRADES.find((x) => x.id === id);
  if (!su || has(s.starUpgrades, id)) return false;
  if (s.stars < su.cost) return false;
  s.stars -= su.cost;
  s.starUpgrades.push(id);
  return true;
}

export function doPrestige(s: GameState): number {
  const gain = prestigeGain(s);
  if (gain <= 0) return 0;
  const keepAchievements = s.achievements;
  const keepMilestones = s.milestones;
  const fresh = createInitialState();
  // что переживает экспедицию
  fresh.totalWood = s.totalWood;
  fresh.playTime = s.playTime;
  fresh.achievements = keepAchievements;
  fresh.milestones = keepMilestones;
  fresh.inventions = s.inventions;       // изобретения — навсегда
  fresh.stars = s.stars + gain;
  fresh.totalStars = s.totalStars + gain;
  fresh.starUpgrades = s.starUpgrades;
  fresh.prestiges = s.prestiges + 1;
  fresh.bestWps = s.bestWps;
  fresh.lastSeen = Date.now();
  fresh.clicks = s.clicks;
  fresh.totalCoal = s.totalCoal;
  fresh.totalDepeshi = s.totalDepeshi;
  fresh.aurorasSeen = s.aurorasSeen;
  if (has(s.starUpgrades, 'capital')) fresh.wood = 100_000;
  else if (has(s.starUpgrades, 'legacy')) fresh.wood = 1_000;
  fresh.runWood = fresh.wood;
  fresh.totalWood += fresh.wood;
  // копируем в текущий объект (React держит ссылку)
  Object.assign(s, fresh);
  return gain;
}

// ---------------- achievements ----------------

function checkAchievement(s: GameState, a: { id: string }): boolean {
  const gensTotal = totalGenerators(s);
  switch (a.id) {
    case 'a_click1': return s.clicks >= 1;
    case 'a_click100': return s.clicks >= 100;
    case 'a_click1k': return s.clicks >= 1_000;
    case 'a_click10k': return s.clicks >= 10_000;
    case 'a_gen1': return gensTotal >= 1;
    case 'a_gen10': return gensTotal >= 10;
    case 'a_gen100': return gensTotal >= 100;
    case 'a_gen1000': return gensTotal >= 1_000;
    case 'a_w1k': return s.totalWood >= 1e3;
    case 'a_w1m': return s.totalWood >= 1e6;
    case 'a_w1b': return s.totalWood >= 1e9;
    case 'a_w1t': return s.totalWood >= 1e12;
    case 'a_w1e15': return s.totalWood >= 1e15;
    case 'a_w1e30': return s.totalWood >= 1e30;
    case 'a_w1e60': return s.totalWood >= 1e60;
    case 'a_w1e100': return s.totalWood >= 1e100;
    case 'a_coal1k': return s.totalCoal >= 1e3;
    case 'a_coal1m': return s.totalCoal >= 1e6;
    case 'a_dep100': return s.totalDepeshi >= 100;
    case 'a_dep10k': return s.totalDepeshi >= 10_000;
    case 'a_fur10': return s.furnace >= 10;
    case 'a_fur20': return s.furnace >= 20;
    case 'a_fur30': return s.furnace >= 30;
    case 'a_pr1': return s.prestiges >= 1;
    case 'a_pr5': return s.prestiges >= 5;
    case 'a_pr25': return s.prestiges >= 25;
    case 'a_pr100': return s.prestiges >= 100;
    case 'a_st10': return s.totalStars >= 10;
    case 'a_st100': return s.totalStars >= 100;
    case 'a_st1k': return s.totalStars >= 1_000;
    case 'a_st10k': return s.totalStars >= 10_000;
    case 'a_time1h': return s.playTime >= 3_600;
    case 'a_time10h': return s.playTime >= 36_000;
    case 'a_time100h': return s.playTime >= 360_000;
    case 'a_off1h': return s.offlineEarned > 0 && s.offlineEarned >= woodPerSec(s) * 3_600 * 0.5;
    case 'a_aurora10': return s.aurorasSeen >= 10;
    default: return false;
  }
}

export function checkAchievements(s: GameState): string[] {
  const unlocked: string[] = [];
  for (const a of ACHIEVEMENTS) {
    if (has(s.achievements, a.id)) continue;
    if (checkAchievement(s, a)) {
      s.achievements.push(a.id);
      unlocked.push(a.id);
    }
  }
  return unlocked;
}

/** Вехи сюжета по звёздам; возвращает новые */
export function checkMilestones(s: GameState): typeof MILESTONES {
  const fresh = MILESTONES.filter((m) => s.totalStars >= m.stars && !has(s.milestones, m.id));
  for (const m of fresh) s.milestones.push(m.id);
  return fresh;
}

// ---------------- tick ----------------

export function tick(s: GameState, dt: number, rand: () => number = Math.random): TickResult {
  if (dt <= 0) return { newAchievements: [], auroraStarted: false };
  s.playTime += dt;

  // Автоклик (изобретения)
  const acr = autoClickRate(s);
  if (acr > 0) {
    const gain = clickPower(s) * acr * dt;
    s.wood += gain; s.runWood += gain; s.totalWood += gain;
    s.clicks += acr * dt;
  }

  // Производство
  const wps = woodPerSec(s);
  const wg = wps * dt;
  s.wood += wg; s.runWood += wg; s.totalWood += wg;
  if (wps > s.bestWps) s.bestWps = wps;

  const cg = coalPerSec(s) * dt;
  s.coal += cg; s.totalCoal += cg;

  const dg = depeshiPerSec(s) * dt;
  s.depeshi += dg; s.totalDepeshi += dg;

  // Полярное сияние
  let auroraStarted = false;
  if (s.auroraUntil > 0 && s.playTime >= s.auroraUntil) s.auroraUntil = 0;
  if (s.auroraNext > 0 && s.playTime >= s.auroraNext) {
    const duration = 30;
    s.auroraUntil = s.playTime + duration;
    const gap = has(s.starUpgrades, 'aurora_amp') ? [90, 180] : [180, 360];
    s.auroraNext = s.playTime + duration + gap[0] + rand() * (gap[1] - gap[0]);
    s.aurorasSeen += 1;
    auroraStarted = true;
  }

  // Автопокупка генераторов («Автоартель»)
  if (has(s.inventions, 'autoartel')) {
    for (let i = 0; i < GENERATORS.length; i++) {
      if (s.autoBuy[i] && s.wood >= generatorCost(s, i, 1)) {
        buyGenerator(s, i, 1);
      }
    }
  }

  // Автопокупка топки («Приказчик топки»)
  if (has(s.starUpgrades, 'furnace_clerk') && s.autoFurnace && s.coal >= furnaceCost(s, 1)) {
    buyFurnace(s, 1);
  }

  const newAchievements = checkAchievements(s);
  return { newAchievements, auroraStarted };
}

// ---------------- offline ----------------

export function offlineCapHours(s: GameState): number {
  return has(s.starUpgrades, 'permafrost') ? Infinity : 12;
}

export function offlineEfficiency(s: GameState): number {
  if (has(s.starUpgrades, 'permafrost')) return 2;
  if (has(s.inventions, 'thermos')) return 1;
  return 0.5;
}

export interface OfflineReport { seconds: number; wood: number; coal: number; depeshi: number; }

export function applyOffline(s: GameState, nowMs: number = Date.now()): OfflineReport | null {
  const elapsed = Math.max(0, (nowMs - s.lastSeen) / 1000);
  s.lastSeen = nowMs;
  if (elapsed < 60) return null;
  const capped = Math.min(elapsed, offlineCapHours(s) * 3600);
  const eff = offlineEfficiency(s);
  const wood = woodPerSec(s) * capped * eff;
  const coal = coalPerSec(s) * capped * eff;
  const depeshi = depeshiPerSec(s) * capped * eff;
  s.wood += wood; s.runWood += wood; s.totalWood += wood;
  s.coal += coal; s.totalCoal += coal;
  s.depeshi += depeshi; s.totalDepeshi += depeshi;
  s.offlineEarned = wood;
  checkAchievements(s);
  return { seconds: capped, wood, coal, depeshi };
}

// ---------------- save / load ----------------

interface SaveShape extends Partial<GameState> { v?: number; }

export function serialize(s: GameState): string {
  const data: SaveShape = { ...s, v: SAVE_VERSION };
  delete data.rev;
  return JSON.stringify(data);
}

export function deserialize(json: string): GameState | null {
  try {
    const data = JSON.parse(json) as SaveShape;
    if (typeof data !== 'object' || data === null) return null;
    const s = createInitialState();
    const merged: GameState = { ...s, ...data } as GameState;
    // числовые поля: нечисловые/NaN значения откатываем к дефолтным
    const numFields: Array<keyof GameState> = [
      'wood', 'totalWood', 'runWood', 'clicks', 'playTime', 'coal', 'totalCoal', 'furnace',
      'depeshi', 'totalDepeshi', 'stars', 'totalStars', 'prestiges', 'auroraNext', 'auroraUntil',
      'aurorasSeen', 'lastSeen', 'offlineEarned', 'bestWps',
    ];
    for (const f of numFields) {
      const raw = (merged as unknown as Record<string, unknown>)[f as string];
      const v = typeof raw === 'number' || typeof raw === 'string' ? Number(raw) : NaN;
      (merged as unknown as Record<string, unknown>)[f] = Number.isFinite(v) ? v : s[f];
    }
    // списки: гарантируем массивы нужной длины
    merged.gens = fixLen(Array.isArray(merged.gens) ? merged.gens : undefined, GENERATORS.length);
    merged.mines = fixLen(Array.isArray(merged.mines) ? merged.mines : undefined, MINES.length);
    merged.telegraphs = fixLen(Array.isArray(merged.telegraphs) ? merged.telegraphs : undefined, TELEGRAPHS.length);
    merged.autoBuy = (Array.isArray(merged.autoBuy) ? merged.autoBuy : []).map(Boolean) as boolean[];
    while (merged.autoBuy.length < GENERATORS.length) merged.autoBuy.push(false);
    const strList = (x: unknown): string[] => (Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string') : []);
    merged.upgrades = strList(merged.upgrades).filter((id) => UPGRADES.some((u) => u.id === id));
    merged.inventions = strList(merged.inventions).filter((id) => INVENTIONS.some((u) => u.id === id));
    merged.starUpgrades = strList(merged.starUpgrades).filter((id) => STAR_UPGRADES.some((u) => u.id === id));
    merged.achievements = strList(merged.achievements).filter((id) => ACHIEVEMENTS.some((a) => a.id === id));
    merged.milestones = strList(merged.milestones);
    merged.rev = 0;
    return merged;
  } catch {
    return null;
  }
}

function fixLen<T>(arr: T[] | undefined, len: number, fill: T = 0 as unknown as T): T[] {
  const out = new Array(len);
  for (let i = 0; i < len; i++) out[i] = arr && i < arr.length ? arr[i] : fill;
  return out;
}

export function exportSave(s: GameState): string {
  const b64 = typeof btoa !== 'undefined'
    ? btoa(unescape(encodeURIComponent(serialize(s))))
    : Buffer.from(serialize(s), 'utf-8').toString('base64');
  return b64;
}

export function importSave(b64: string): GameState | null {
  try {
    const json = typeof atob !== 'undefined'
      ? decodeURIComponent(escape(atob(b64.trim())))
      : Buffer.from(b64.trim(), 'base64').toString('utf-8');
    return deserialize(json);
  } catch {
    return null;
  }
}
