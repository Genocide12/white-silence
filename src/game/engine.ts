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
import {
  BUILDINGS, BEASTS, CRAFTS, PROFESSIONS, ENDINGS, NOTES, RADIO, GAZETTE, DREAMS,
  SCAVENGE_GROWTH, HUNT_GROWTH, TROPHY_CHANCE, ALL_ITEMS,
  rollLoot, itemName, itemRefund, craftDiscount, churchItems,
  type CraftDef, type ProfessionDef, type EndingDef,
} from './legacy';

export const SAVE_KEY = 'tishina-topka-save-v1';
export const SAVE_VERSION = 2;

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
  // ---- v2: системы из репозитория ----
  profession: string;              // текущая профессия (6 из оригинала)
  searches: number[];              // обысков по зданиям (26) — сбрасывается престижем
  itemsFound: Record<string, number>; // склад: предмет → сколько (навсегда)
  crafted: string[];               // освоенные рецепты (навсегда)
  runHunts: number[];              // облавы за экспедицию (6) — растят цену
  hunts: number[];                 // облавы всего (6) — бонусы и эпилоги
  notesFound: string[];            // записки (121) — навсегда
  radioHeard: string[];            // радиопередачи (64) — навсегда
  gazetteSeen: string[];           // выпуски газеты (5) — навсегда
  endings: string[];               // полученные эпилоги (7) — навсегда
  lastDream: string | null;        // сон после последнего престижа
}

export interface TickResult {
  newAchievements: string[];
  auroraStarted: boolean;
  newEndings: EndingDef[];         // полученные эпилоги
  radioHeard: typeof RADIO[number] | null; // новая передача
  gazetteSeen: typeof GAZETTE[number] | null; // новый выпуск газеты
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
    // v2
    profession: 'telegraph',
    searches: new Array(BUILDINGS.length).fill(0),
    itemsFound: {},
    crafted: [],
    runHunts: new Array(BEASTS.length).fill(0),
    hunts: new Array(BEASTS.length).fill(0),
    notesFound: [],
    radioHeard: [],
    gazetteSeen: [],
    endings: [],
    lastDream: null,
  };
}

const has = (list: string[], id: string) => list.indexOf(id) >= 0;

// ---------------- профессия и склад ----------------

const CRAFTS_INDEX = new Map<string, CraftDef>(CRAFTS.map((c) => [c.id, c]));
const COOK_IDS = CRAFTS.filter((c) => c.cat === 'cook').map((c) => c.id);
const CHURCH_ITEMS = churchItems();
const CAT_TOTALS: Record<string, number> = {};
for (const c of CRAFTS) CAT_TOTALS[c.cat] = (CAT_TOTALS[c.cat] || 0) + 1;
const BANDIT_I = BEASTS.findIndex((b) => b.key === 'bandit');
const WOLF_I = BEASTS.findIndex((b) => b.key === 'wolf');

export function profession(s: GameState): ProfessionDef | null {
  return PROFESSIONS.find((p) => p.id === s.profession) || null;
}

/** Кэш коллекции: uniqueItems/trophyCount гоняются каждый тик и клик. */
const collCache = new WeakMap<object, { uniq: number; trophies: number }>();
function collInfo(s: GameState): { uniq: number; trophies: number } {
  const n = Object.keys(s.itemsFound).length;
  const c = collCache.get(s);
  if (c && c.uniq === n) return c;
  let tr = 0;
  for (const id of Object.keys(s.itemsFound)) {
    const t = ALL_ITEMS[id];
    if (t && (t.tags || []).indexOf('trophy') >= 0) tr++;
  }
  const info = { uniq: n, trophies: tr };
  collCache.set(s, info);
  return info;
}

/** Уникальных предметов на складе. */
export function uniqueItems(s: GameState): number {
  return collInfo(s).uniq;
}

function trophyCount(s: GameState): number {
  return collInfo(s).trophies;
}

/** Облав за всё время по всем зверям. */
export function totalHunts(s: GameState): number {
  return s.hunts.reduce((a, b) => a + b, 0);
}

export interface CraftEffects {
  click: number;      // + к силе клика
  offline: number;    // + к оффлайн-доходу
  genDisc: number;    // − к цене генераторов
  hunt: number;       // + к добыче охоты
  coal: number;       // + к добыче угля
  offlineCapMin: number; // + минут к оффлайн-капу
  global: number;     // + к общему множителю
}

/** Эффекты крафта: каждый рецепт — маленький вечный бонус своей категории. */
export function craftEffects(s: GameState): CraftEffects {
  const e: CraftEffects = { click: 0, offline: 0, genDisc: 0, hunt: 0, coal: 0, offlineCapMin: 0, global: 0 };
  const perCat: Record<string, number> = {};
  for (const id of s.crafted) {
    const c = CRAFTS_INDEX.get(id);
    if (!c) continue;
    perCat[c.cat] = (perCat[c.cat] || 0) + 1;
    switch (c.effect) {
      case 'click': e.click += 0.02; break;
      case 'offline': e.offline += 0.015; break;
      case 'genDisc': e.genDisc += 0.003; break;
      case 'hunt': e.hunt += 0.02; break;
      case 'coal': e.coal += 0.015; break;
      case 'offlineCap': e.offlineCapMin += 20; break;
      default: e.global += 0.005;
    }
  }
  // полностью освоенная категория удваивает свой эффект (тоталы предвычислены)
  for (const cat of Object.keys(CAT_TOTALS)) {
    if ((perCat[cat] || 0) >= CAT_TOTALS[cat]) {
      switch (cat) {
        case 'cook': e.click *= 2; break;
        case 'survival': e.offline *= 2; break;
        case 'carpentry': e.genDisc *= 2; break;
        case 'tailor': e.coal *= 2; break;
        case 'ammo': case 'weapon': e.hunt *= 2; break;
        case 'med': e.offlineCapMin *= 2; break;
        default: e.global *= 2; break;
      }
    }
  }
  return e;
}

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
  // v2: склад (уникальные предметы и трофеи), крафт и охотничьи трофеи
  const ef = craftEffects(s);
  m *= 1 + uniqueItems(s) * 0.005 + trophyCount(s) * 0.02 + ef.global + totalHunts(s) * 0.003;
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
  // v2: кулинарное мастерство и профессия
  const prof = profession(s);
  mult *= 1 + craftEffects(s).click;
  if (prof && prof.effect.clickMult) mult *= prof.effect.clickMult;
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
  // v2: портновское дело утепляет шахты
  return base * (has(s.starUpgrades, 'rich_vein') ? 2 : 1) * (1 + craftEffects(s).coal);
}

export function depeshiPerSec(s: GameState): number {
  let base = 0;
  for (let i = 0; i < TELEGRAPHS.length; i++) base += s.telegraphs[i] * TELEGRAPHS[i].baseProd;
  // v2: телеграфист слышит эфир лучше
  const prof = profession(s);
  if (prof && prof.effect.depeshiMult) base *= prof.effect.depeshiMult;
  return base;
}

export function genCostReduction(s: GameState): number {
  // v2: плотницкое дело + профессия «Плотник»
  const prof = profession(s);
  let k = has(s.inventions, 'logistics') ? 0.95 : 1;
  k *= Math.max(0.6, 1 - craftEffects(s).genDisc);
  if (prof && prof.effect.genDisc) k *= prof.effect.genDisc;
  return k;
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
  // v2: что переживает экспедицию — склад, рецепты, записки, радио, газета, эпилоги, облавы (итог)
  const keepItems = s.itemsFound;
  const keepCrafted = s.crafted;
  const keepNotes = s.notesFound;
  const keepRadio = s.radioHeard;
  const keepGazette = s.gazetteSeen;
  const keepEndings = s.endings;
  const keepHunts = s.hunts;
  const keepProfession = s.profession;
  const dream = DREAMS.length ? DREAMS[Math.floor(Math.random() * DREAMS.length)] : null;
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
  // v2: вечные ценности зимовщика
  fresh.itemsFound = keepItems;
  fresh.crafted = keepCrafted;
  fresh.notesFound = keepNotes;
  fresh.radioHeard = keepRadio;
  fresh.gazetteSeen = keepGazette;
  fresh.endings = keepEndings;
  fresh.hunts = keepHunts;
  fresh.profession = keepProfession;
  fresh.lastDream = dream ? dream.txt : null;
  if (has(s.starUpgrades, 'capital')) fresh.wood = 100_000;
  else if (has(s.starUpgrades, 'legacy')) fresh.wood = 1_000;
  fresh.runWood = fresh.wood;
  fresh.totalWood += fresh.wood;
  // копируем в текущий объект (React держит ссылку)
  Object.assign(s, fresh);
  return gain;
}

// ---------------- v2: посёлок, хозяйство, охота ----------------

export function scavengeCost(s: GameState, i: number): number {
  const b = BUILDINGS[i];
  if (!b) return Infinity;
  const prof = profession(s);
  return b.baseCost * Math.pow(SCAVENGE_GROWTH, s.searches[i]) * ((prof && prof.effect.scavengeDisc) || 1);
}

export function buildingUnlocked(s: GameState, i: number): boolean {
  const b = BUILDINGS[i];
  return !!b && s.totalWood >= b.unlock;
}

export interface ScavengeResult {
  building: string;
  found: Array<{ id: string; n: number; isNew: boolean; name: string }>;
  refund: number;
  note: { id: string; title: string } | null;
}

/** Обыск здания: лут из настоящих таблиц оригинальной игры. */
export function doScavenge(s: GameState, i: number, rand: () => number = Math.random): ScavengeResult | null {
  if (!buildingUnlocked(s, i)) return null;
  const cost = scavengeCost(s, i);
  if (!Number.isFinite(cost) || s.wood < cost) return null;
  s.wood -= cost;
  s.searches[i] += 1;
  const b = BUILDINGS[i];
  const tableId = b.tables[Math.floor(rand() * b.tables.length)];
  const rolls = rollLoot(tableId, rand);
  const found: ScavengeResult['found'] = [];
  let refund = 0;
  for (const r of rolls) {
    const isNew = !s.itemsFound[r.id];
    s.itemsFound[r.id] = (s.itemsFound[r.id] || 0) + r.n;
    if (!isNew) refund += itemRefund(r.id) * r.n;
    found.push({ ...r, isNew, name: itemName(r.id) });
  }
  // записка: 12% за обыск, пока есть ненайденные (шанс проверяем ДО фильтра)
  let note: ScavengeResult['note'] = null;
  if (s.notesFound.length < NOTES.length && rand() < 0.12) {
    const foundSet = new Set(s.notesFound);
    const unfound = NOTES.filter((n) => !foundSet.has(n.id));
    if (unfound.length > 0) {
      const pick = unfound[Math.floor(rand() * unfound.length)];
      s.notesFound.push(pick.id);
      note = { id: pick.id, title: pick.title };
    }
  }
  if (refund > 0) {
    s.wood += refund; s.runWood += refund; s.totalWood += refund;
  }
  return { building: b.name, found, refund, note };
}

export function craftUnlocked(s: GameState, id: string): boolean {
  const c = CRAFTS_INDEX.get(id);
  return !!c && s.totalWood >= c.unlock;
}

export function craftCost(s: GameState, id: string): number {
  const c = CRAFTS_INDEX.get(id);
  if (!c) return Infinity;
  const disc = craftDiscount((iid) => s.itemsFound[iid] || 0, c);
  const prof = profession(s);
  const profDisc = prof && prof.effect.cookDisc && c.cat === 'cook' ? prof.effect.cookDisc : 1;
  const cost = c.cost * (1 - disc) * profDisc;
  return Number.isFinite(cost) && cost > 0 ? cost : Infinity;
}

/** Освоить рецепт: предмет попадает на склад навсегда. */
export function doCraft(s: GameState, id: string): boolean {
  const c = CRAFTS_INDEX.get(id);
  if (!c || has(s.crafted, id) || !craftUnlocked(s, id)) return false;
  const cost = craftCost(s, id);
  if (!Number.isFinite(cost) || s.wood < cost) return false;
  s.wood -= cost;
  s.crafted.push(id);
  for (const o of c.out) s.itemsFound[o.id] = (s.itemsFound[o.id] || 0) + o.n;
  return true;
}

export function huntCost(s: GameState, i: number): number {
  const b = BEASTS[i];
  if (!b) return Infinity;
  const prof = profession(s);
  return b.baseCost * Math.pow(HUNT_GROWTH, s.runHunts[i]) * ((prof && prof.effect.huntDisc) || 1);
}

export function huntUnlocked(s: GameState, i: number): boolean {
  const b = BEASTS[i];
  return !!b && s.totalWood >= b.unlock;
}

export interface HuntResult {
  beast: string;
  loot: Array<{ id: string; n: number; isNew: boolean; name: string }>;
  trophy: boolean;
  refund: number;
}

/** Облава: трофеи из настоящих таблиц добычи. */
export function doHunt(s: GameState, i: number, rand: () => number = Math.random): HuntResult | null {
  if (!huntUnlocked(s, i)) return null;
  const cost = huntCost(s, i);
  if (!Number.isFinite(cost) || s.wood < cost) return null;
  s.wood -= cost;
  s.runHunts[i] += 1;
  s.hunts[i] += 1;
  const beast = BEASTS[i];
  let tableId = beast.table;
  let trophy = false;
  if (beast.bonusTable && rand() < TROPHY_CHANCE) {
    tableId = beast.bonusTable;
    trophy = true;
  }
  let rolls = rollLoot(tableId, rand);
  // удачная облава: доп. бросок от охотничьего снаряжения
  const power = craftEffects(s).hunt;
  if (rolls.length > 0 && rand() < Math.min(0.8, power)) {
    rolls = rolls.concat(rollLoot(tableId, rand));
  }
  const loot: HuntResult['loot'] = [];
  let refund = 0;
  for (const r of rolls) {
    const isNew = !s.itemsFound[r.id];
    s.itemsFound[r.id] = (s.itemsFound[r.id] || 0) + r.n;
    if (!isNew) refund += itemRefund(r.id) * r.n;
    loot.push({ ...r, isNew, name: itemName(r.id) });
  }
  if (refund > 0) {
    s.wood += refund; s.runWood += refund; s.totalWood += refund;
  }
  return { beast: beast.name, loot, trophy, refund };
}

/** Смена профессии (после отправки экспедиции). Стартовый набор — на склад. */
export function chooseProfession(s: GameState, id: string): boolean {
  const p = PROFESSIONS.find((x) => x.id === id);
  if (!p) return false;
  s.profession = id;
  for (const it of p.items) s.itemsFound[it.id] = (s.itemsFound[it.id] || 0) + it.n;
  return true;
}

// ---------------- v2: эпилоги, радио, газета ----------------

function endingReached(s: GameState, id: string): boolean {
  switch (id) {
    case 'ship': return has(s.starUpgrades, 'ship');
    case 'wintering': return s.playTime >= 360_000;
    // ранние выходы по счётчикам — проверка каждый тик должна быть дешёвой
    case 'schemnik':
      if (Object.keys(s.itemsFound).length < CHURCH_ITEMS.length) return false;
      return CHURCH_ITEMS.every((iid) => s.itemsFound[iid] > 0);
    case 'ataman': return BANDIT_I >= 0 && s.hunts[BANDIT_I] >= 50;
    case 'family': {
      if (s.crafted.length < COOK_IDS.length) return false;
      const cs = new Set(s.crafted);
      return COOK_IDS.every((cid) => cs.has(cid));
    }
    case 'wolf_king': return WOLF_I >= 0 && s.hunts[WOLF_I] >= 100;
    case 'aurora': return s.aurorasSeen >= 100;
    default: return false;
  }
}

export function checkEndings(s: GameState): EndingDef[] {
  const fresh: EndingDef[] = [];
  for (const e of ENDINGS) {
    if (has(s.endings, e.id)) continue;
    if (endingReached(s, e.id)) {
      s.endings.push(e.id);
      fresh.push(e);
    }
  }
  return fresh;
}

/** Порог депеш для приёма i-й передачи (геометрический). */
export function radioThreshold(i: number): number {
  return 4 * Math.pow(1.09, i);
}

const GAZETTE_MILESTONES = [1e3, 1e6, 1e9, 1e12, 1e15];

export function gazetteMilestone(i: number): number {
  return GAZETTE_MILESTONES[i] ?? Infinity;
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
  const empty: TickResult = { newAchievements: [], auroraStarted: false, newEndings: [], radioHeard: null, gazetteSeen: null };
  if (dt <= 0) return empty;
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

  // v2: радио — передачи принимаются по мере накопления депеш
  let radioNews: TickResult['radioHeard'] = null;
  if (s.radioHeard.length < RADIO.length && s.totalDepeshi >= radioThreshold(s.radioHeard.length)) {
    const b = RADIO[s.radioHeard.length];
    if (b) {
      s.radioHeard.push(b.id);
      radioNews = b;
    }
  }

  // v2: газета — выпуски по вехам добытых дров
  let gazetteNews: TickResult['gazetteSeen'] = null;
  if (s.gazetteSeen.length < GAZETTE.length && s.totalWood >= gazetteMilestone(s.gazetteSeen.length)) {
    const issue = GAZETTE[s.gazetteSeen.length];
    if (issue) {
      s.gazetteSeen.push(issue.id);
      gazetteNews = issue;
    }
  }

  const newAchievements = checkAchievements(s);
  const newEndings = checkEndings(s);
  return { newAchievements, auroraStarted, newEndings, radioHeard: radioNews, gazetteSeen: gazetteNews };
}

// ---------------- offline ----------------

export function offlineCapHours(s: GameState): number {
  const prof = profession(s);
  let cap = has(s.starUpgrades, 'permafrost') ? Infinity : 12;
  if (cap !== Infinity) cap += craftEffects(s).offlineCapMin / 60 + ((prof && prof.effect.offlineCapH) || 0);
  return cap;
}

export function offlineEfficiency(s: GameState): number {
  const prof = profession(s);
  let eff = has(s.starUpgrades, 'permafrost') ? 2 : (has(s.inventions, 'thermos') ? 1 : 0.5);
  eff *= 1 + craftEffects(s).offline; // v2: снаряжение выживания
  if (prof && prof.effect.offlineEff) eff *= prof.effect.offlineEff;
  return eff;
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
    // v2: массивы новой версии (сейвы v1 получают нули)
    merged.searches = fixLen(Array.isArray(merged.searches) ? merged.searches : undefined, BUILDINGS.length);
    merged.runHunts = fixLen(Array.isArray(merged.runHunts) ? merged.runHunts : undefined, BEASTS.length);
    merged.hunts = fixLen(Array.isArray(merged.hunts) ? merged.hunts : undefined, BEASTS.length);
    merged.crafted = strList(merged.crafted).filter((id) => CRAFTS.some((c) => c.id === id));
    const noteIds = new Set(NOTES.map((n) => n.id));
    merged.notesFound = strList(merged.notesFound).filter((id) => noteIds.has(id));
    const radioIds = new Set(RADIO.map((r) => r.id));
    merged.radioHeard = strList(merged.radioHeard).filter((id) => radioIds.has(id));
    const gazIds = new Set(GAZETTE.map((g) => g.id));
    merged.gazetteSeen = strList(merged.gazetteSeen).filter((id) => gazIds.has(id));
    const endIds = new Set(ENDINGS.map((e) => e.id));
    merged.endings = strList(merged.endings).filter((id) => endIds.has(id));
    // склад: только известные предметы с положительным счётчиком
    const itemsObj: Record<string, number> = {};
    if (data.itemsFound && typeof data.itemsFound === 'object') {
      for (const [k, v] of Object.entries(data.itemsFound as Record<string, unknown>)) {
        const n = Number(v);
        if (ALL_ITEMS[k] && Number.isFinite(n) && n > 0) itemsObj[k] = Math.floor(n);
      }
    }
    merged.itemsFound = itemsObj;
    merged.profession = PROFESSIONS.some((p) => p.id === merged.profession) ? merged.profession : 'telegraph';
    merged.lastDream = typeof merged.lastDream === 'string' ? merged.lastDream : null;
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
