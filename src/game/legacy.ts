// ============================================================
// legacy.ts — мост к ПОЛНОМУ контенту оригинальной игры
// «Белое Безмолвие» (95 000 строк, 1917 год, Русский Север).
//
// Все данные извлечены из репозитория скриптом
// scripts/extract-legacy.mjs: 524 предмета, 284 рецепта,
// 75 лут-таблиц, 21 здание, 15 зверей, 6 профессий, 121 записка,
// 7 концовок, пословицы, сны, радио, газета, календарь на 60 дней.
//
// Здесь данные превращаются в инкрементальные системы:
// посёлок (обыск), хозяйство (крафт), охота, летопись, эпилоги.
// ============================================================
import itemsRaw from './data/items.json';
import recipesRaw from './data/recipes.json';
import lootRaw from './data/loot.json';
import i18nRuRaw from './data/i18n-ru.json';
import lootProfRaw from './data/loot-professions.json';
import buildingsRaw from './data/buildings.json';
import bestiaryRaw from './data/bestiary.json';
import professionsRaw from './data/professions.json';
import endingsRaw from './data/endings.json';
import calendarRaw from './data/calendar.json';
import proverbsRaw from './data/proverbs.json';
import winterRulesRaw from './data/winter-rules.json';
import radioRaw from './data/radio.json';
import gazetteRaw from './data/gazette.json';
import notesRaw from './data/notes.json';
import dreamsRaw from './data/dreams.json';

// ---------------- базовые типы (как в оригинале) ----------------

export interface ItemDef {
  id: string;
  cat: string;
  w?: number;
  stack?: number;
  cal?: number;
  warm?: number;
  wind?: number;
  def?: number;
  dmg?: number;
  light?: number;
  pages?: number;
  skill?: string;
  tags?: string[];
  [k: string]: unknown;
}

export interface LootTable {
  rolls: [number, number];
  items: Array<{ id: string; w: number; min: number; max: number }>;
}

export interface RecipeDef {
  id: string;
  name: string;
  cat: string;
  station: string | null;
  time: number;
  req: Array<{ id: string; n: number }>;
  tools: string[];
  out: Array<{ id: string; n: number }>;
  skill: { id: string; lv: number } | null;
  desc?: string;
}

const ITEMS = itemsRaw as unknown as Record<string, ItemDef>;
const LOOT = lootRaw as unknown as Record<string, LootTable>;
const RECIPES = recipesRaw as unknown as RecipeDef[];
const I18N_RU = i18nRuRaw as unknown as Record<string, string>;
const LP = lootProfRaw as unknown as { RU?: Record<string, string> };

export const ALL_ITEMS = ITEMS;
export const ALL_RECIPES = RECIPES;
export const ALL_LOOT = LOOT;
export const TOTAL_ITEMS = Object.keys(ITEMS).length;

/** Человекочитаемое имя предмета (словарь оригинальной игры). */
export function itemName(id: string | null | undefined): string {
  if (!id) return '—';
  return I18N_RU[`item.${id}.name`] || (LP && LP.RU && LP.RU[`item.${id}.name`]) || id;
}

/** Категория предмета по-русски. */
export const CAT_RU: Record<string, string> = {
  food: 'Еда', drink: 'Питьё', med: 'Медицина', tool: 'Инструмент', weapon: 'Оружие',
  ranged: 'Огнестрел', ammo: 'Патроны', cloth: 'Одежда', material: 'Материал',
  book: 'Книга', light: 'Свет', fuel: 'Топливо', container: 'Тара', misc: 'Разное',
};

// ---------------- редкость (из лут-таблиц оригинала) ----------------

const rarityScore: Record<string, number> = {};
for (const t of Object.values(LOOT)) {
  for (const e of t.items) {
    rarityScore[e.id] = (rarityScore[e.id] || 0) + e.w;
  }
}

/** Тиер редкости 1..5: чем реже предмет в посёлке, тем выше тиер. */
export function itemTier(id: string): number {
  const s = rarityScore[id];
  if (s === undefined) return 5; // трофеи и крафт — не валяются на полу
  if (s >= 60) return 1;
  if (s >= 25) return 2;
  if (s >= 8) return 3;
  if (s >= 2) return 4;
  return 5;
}

export const TIER_RU: Record<number, string> = {
  1: 'обычный', 2: 'полезный', 3: 'найдёшь — рад', 4: 'редкость', 5: 'раритет',
};

/** Цена, за которую скупщик берёт дубликат. */
export function itemRefund(id: string): number {
  return [0, 2, 8, 40, 250, 2000][itemTier(id)] || 2;
}

// ---------------- посёлок: здания и тайники ----------------

export interface BuildingDef {
  key: string;
  name: string;
  desc: string;
  tables: string[];
  baseCost: number;   // дров за первый обыск
  unlock: number;     // всего дров, чтобы открыть
}

const B = (key: string, name: string, desc: string, tables: string[], baseCost: number, unlock: number): BuildingDef =>
  ({ key, name, desc, tables, baseCost, unlock });

export const BUILDINGS: BuildingDef[] = [
  B('izba', 'Изба', 'Печка, стол, сундук — жилище обстоятельное, хозяева ушли спешно.', ['house_generic', 'kitchen_pech', 'kitchen_table', 'kitchen_shelf', 'kitchen_cupboard', 'bedroom_chest', 'bedroom_bed', 'living_shelf', 'living_sofa'], 30, 0),
  B('cellar', 'Погреб', 'Морковь, квашеная капуста и мёрзлая картошка. Жизнь!', ['cellar_veg', 'cellar_meat', 'granary_sack'], 80, 60),
  B('barn', 'Амбар', 'Сено, ящик с инструментами и мешки. Пахнет мышами и зерном.', ['barn_hay', 'barn_tools', 'wood_pile'], 250, 300),
  B('ruined', 'Погорелый дом', 'Всё, что не сгорело, свалено в углу. Иногда огонь милосерден к скупщику.', ['ruined_debris', 'house_generic', 'attic_clutter'], 700, 1200),
  B('banya', 'Баня', 'Веники, шайки, полок. И тайник под половицей — баня знает всё.', ['bathhouse', 'sauna_shelf', 'well_sacrifice'], 2200, 5000),
  B('warehouse', 'Склад', 'Ящики, бочки, мешки. Торговая точка мёртвой артели.', ['warehouse_crate', 'warehouse_barrel', 'warehouse_sack', 'wood_pile_storage'], 7000, 20000),
  B('dacha', 'Дача', 'Летние покои, зимние печали. Сундук с барахлом.', ['dacha_chest', 'living_crate', 'attic_clutter'], 22000, 60000),
  B('izba_rich', 'Дом лесопромышленника', 'Красное дерево, хрусталь и французский коньяк. Был.', ['bedroom_wardrobe', 'bedroom_chest', 'living_crate', 'chimney_fireplace', 'attic_clutter'], 70000, 200000),
  B('fishing_hut', 'Рыбацкая избушка', 'Сети, верши, вмёрзшая лодка со снаряжением.', ['fishing_rack', 'boat_supply', 'riverbank_crate'], 220000, 600000),
  B('stable', 'Конюшня', 'Сёдла, упряжь, овёс. Лошади увели себя сами.', ['stable_rack', 'barn_hay'], 700000, 2000000),
  B('granary', 'Житница', 'Зерно, мука и сторож, который больше не сторожит.', ['granary_sack', 'granary_keeper', 'cellar_veg'], 2200000, 6000000),
  B('smithy', 'Кузница', 'Наковальня, уголь, запертый ящик. Хороший молот не пропадёт.', ['smithy_anvil', 'smithy_shelf', 'smithy_locked', 'forge_table'], 7000000, 20000000),
  B('tavern', 'Трактир', 'Бар, погреб и кухня. Самовар ещё тёплый — кажется.', ['tavern_bar', 'tavern_table', 'tavern_kitchen', 'tavern_cellar'], 22000000, 60000000),
  B('sawmill', 'Пилорама', 'Верстак и стружка по колено. Дерево перерабатывает само себя.', ['sawmill_workbench', 'barn_tools', 'wood_pile'], 70000000, 200000000),
  B('doctor', 'Флигель врача', 'Кабинет, койка, карболка. Смерть здесь работала аккуратно.', ['doctor_cabinet', 'doctor_bed'], 220000000, 600000000),
  B('school', 'Школа', 'Парты, полка с учебниками и стол учителя.', ['school_desk', 'school_shelf', 'teacher_desk'], 700000000, 2000000000),
  B('jail', 'Околоток', 'Шкаф с казённым добром. Закон ушёл — имущество осталось.', ['jail_locker', 'personal_body'], 2200000000, 6000000000),
  B('guardtower', 'Дозорная вышка', 'Ружьё на стене, тайник под штукатуркой.', ['guardtower_locker', 'ranger_cache'], 7000000000, 20000000000),
  B('telegraph', 'Вокзал (телеграф)', 'Родной дом. Стол телеграфиста, казённый шкаф, личные вещи.', ['telegraph_desk', 'guardtower_locker', 'personal_body'], 22000000000, 60000000000),
  B('church', 'Церковь', 'Алтарь, свечи, библиотека. Пожертвования прихожан ждут.', ['church_altar', 'church_candle', 'church_library', 'cemetery_gift'], 70000000000, 200000000000),
  B('store', 'Лавка', 'Прилавок, полки с мануфактурой, склад купца Ерохина.', ['store_counter', 'store_shelf_food', 'store_shelf_tools', 'store_shelf_cloth', 'store_storage'], 220000000000, 600000000000),
  // ——— тайники (открываются поздно, лут самый сочный) ———
  B('hunting_lodge', 'Охотничий домик', 'Тайник промысловика в лесу. Ловушки, припасы, уважение к зверю.', ['hunting_lodge', 'ranger_cache'], 700000000000, 2e12),
  B('hermit', 'Землянка отшельника', 'Аким живёт просто, но травы у него — на всю губернию.', ['hermit_herbs', 'house_generic'], 2.2e12, 6e12),
  B('timo_cache', 'Тайник Тимофеича', '«Пятый год хожу на медведя…» — а барометр у него был знатный.', ['timo_cache', 'hunting_lodge'], 7e12, 2e13),
  B('apiary', 'Пасека', 'Пустые ульи под снегом. Мёд засахарился ещё в августе.', ['apiary_null', 'house_generic'], 2.2e13, 6e13),
  B('deserter_den', 'Логово дезертиров', 'Осторожно: ходят слухи. Но винтовки там настоящие.', ['deserter_den', 'bandit_body'], 7e13, 2e14),
];

export const SCAVENGE_GROWTH = 1.35;

// ---------------- охота ----------------

export interface BeastDef {
  key: string;
  name: string;
  danger: number;
  desc: string;
  table: string;
  bonusTable?: string; // шанс на трофейную таблицу
  baseCost: number;
  unlock: number;
}

const H = (key: string, name: string, danger: number, desc: string, table: string, baseCost: number, unlock: number, bonusTable?: string): BeastDef =>
  ({ key, name, danger, desc, table, baseCost, unlock, bonusTable });

export const BEASTS: BeastDef[] = [
  H('hare', 'Заяц-беляк', 0, 'Труслив и вкусен. Классика промысла.', 'hare_body', 500, 2000),
  H('crow', 'Ворон', 0, 'Падальщик и наблюдатель. Знает посёлок лучше тебя.', 'crow_body', 1500, 8000),
  H('deer', 'Северный олень', 1, 'Мясо, шкура и жир — три кита выживания.', 'deer_body', 6000, 30000),
  H('bandit', 'Дезертир', 6, 'Облава на логово мародёров. Опасно, но винтовки стоят того.', 'bandit_body', 25000, 150000, 'bandit_leader_body'),
  H('wolf', 'Волк', 5, 'Хозяин зимы. Стая — один зверь о многих пастях.', 'wolf_body', 90000, 500000, 'alpha_wolf_body'),
  H('bear', 'Медведь-шатун', 10, 'Разъярён и не спит. Бочки не хватит, чтобы описать.', 'bear_body', 400000, 3000000, 'legendary_bear_body'),
];

export const HUNT_GROWTH = 1.15;
/** Шанс, что в добыче окажется трофейная таблица. */
export const TROPHY_CHANCE = 0.12;

// ---------------- крафт ----------------

const STATION_MULT: Record<string, number> = {
  'null': 1, fire: 1.4, workbench: 2.2, stove: 1.7, anvil: 3.5, forge: 4.5,
};

export interface CraftDef extends RecipeDef {
  cost: number;      // дров
  unlock: number;    // всего дров для открытия
  effect: 'click' | 'offline' | 'genDisc' | 'hunt' | 'coal' | 'offlineCap' | 'global';
}

const CAT_EFFECT: Record<string, CraftDef['effect']> = {
  cook: 'click', survival: 'offline', carpentry: 'genDisc', tailor: 'coal',
  ammo: 'hunt', weapon: 'hunt', med: 'offlineCap', misc: 'global',
};

export const CAT_RU_CRAFT: Record<string, string> = {
  cook: 'Готовка', survival: 'Выживание', carpentry: 'Плотницкое', tailor: 'Портновское',
  ammo: 'Патроны', weapon: 'Оружие', med: 'Медицина', misc: 'Разное',
};

function niceNum(x: number): number {
  if (x < 100) return Math.max(10, Math.round(x / 10) * 10);
  if (x < 1000) return Math.round(x / 50) * 50;
  if (x < 1e6) return Math.round(x / 100) * 100;
  const p = Math.floor(Math.log10(x));
  const b = Math.pow(10, p - 1);
  return Math.round(x / b) * b;
}

// Кривая цен: 284 рецепта раскладываются по сложности и получают цены
// от FIRST до LAST — геометрическая прогрессия. Это гарантирует классическое
// для жанра «всегда есть что купить дальше» на протяжении всей игры.
const CRAFT_FIRST = 80;
const CRAFT_LAST = 5e11;

function complexity(r: RecipeDef): number {
  const sm = STATION_MULT[String(r.station)] || 1.5;
  const outN = r.out.reduce((a, o) => a + o.n, 0) || 1;
  return sm * (1 + r.time / 5) * (1 + (r.skill ? r.skill.lv * 0.3 : 0)) / Math.sqrt(outN);
}

const CRAFT_RATIO = Math.pow(CRAFT_LAST / CRAFT_FIRST, 1 / (RECIPES.length - 1));

export const CRAFTS: CraftDef[] = RECIPES
  .map((r) => ({ r, c: complexity(r) }))
  .sort((a, b) => a.c - b.c)
  .map(({ r }, i) => {
    const cost = niceNum(CRAFT_FIRST * Math.pow(CRAFT_RATIO, i));
    // имя: литерал рецепта → имя выходного предмета → id
    const name = r.name || (r.out[0] ? itemName(r.out[0].id) : r.id);
    return { ...r, name, cost, unlock: niceNum(cost * 20), effect: CAT_EFFECT[r.cat] || 'global' };
  });

/** Скидка крафта, если требуемые предметы уже найдены на складе. */
export function craftDiscount(have: (id: string) => number, r: RecipeDef): number {
  // в данных репозитория встречается n:0 (необязательный ингредиент) — не делить на ноль
  const req = r.req.filter((q) => q.n > 0);
  if (!req.length) return 0;
  let got = 0;
  for (const q of req) got += Math.min(1, have(q.id) / q.n);
  return 0.35 * (got / req.length); // до 35%
}

// ---------------- профессии ----------------

export interface ProfessionDef {
  id: string;
  name: string;
  desc: string;
  items: Array<{ id: string; n: number }>;
  bonus: string;      // человекочитаемо
  effect: {
    depeshiMult?: number; huntDisc?: number; genDisc?: number;
    cookDisc?: number; clickMult?: number; offlineCapH?: number; offlineEff?: number;
    scavengeDisc?: number;
  };
}

const PROF_EFFECTS: Record<string, ProfessionDef['effect']> = {
  telegraph: { depeshiMult: 1.5 },
  hunter: { huntDisc: 0.8 },
  carpenter: { genDisc: 0.9 },
  cook: { cookDisc: 0.7, clickMult: 1.1 },
  medic: { offlineCapH: 6, offlineEff: 1.25 },
  convict: { scavengeDisc: 0.75 },
};

const PROF_BONUS_RU: Record<string, string> = {
  telegraph: 'Депеши +50% — ключ родной профессии',
  hunter: 'Охота дешевле на 20%',
  carpenter: 'Генераторы дешевле на 10%',
  cook: 'Кулинарный крафт −30%, сила клика +10%',
  medic: 'Оффлайн +6 часов, оффлайн-доход +25%',
  convict: 'Обыск дешевле на 25% — знает, где искать',
};

export const PROFESSIONS: ProfessionDef[] = Object.values(professionsRaw as unknown as Record<string, { id: string; name: string; desc: string; items: Array<{ id: string; n: number }> }>)
  .map((p) => ({ ...p, bonus: PROF_BONUS_RU[p.id] || '', effect: PROF_EFFECTS[p.id] || {} }))
  .filter((p) => p.items);

// ---------------- эпилоги (7 финалов оригинала) ----------------

export interface EndingDef {
  id: string;
  title: string;
  kind: string;
  epigraph: string;
  text: string;
  condition: string; // человекочитаемо
}

const ENDING_CONDITIONS: Record<string, string> = {
  ship: 'Купить пароход «Святой Николай» (10 000 звёзд) — он придёт',
  wintering: 'Просидеть у печи 100 часов игрового времени',
  schemnik: 'Собрать всё, что копилось в церкви и на кладбище',
  ataman: 'Разогнать 50 бандитских логов',
  family: 'Освоить все 141 кулинарный рецепт',
  wolf_king: 'Принять 100 волчьих стай',
  aurora: 'Поймать 100 северных сияний',
};

export const ENDINGS: EndingDef[] = Object.entries((endingsRaw as unknown as { ENDINGS: Record<string, { title: string; kind: string; epigraph?: string; text: string }> }).ENDINGS)
  .map(([id, e]) => ({
    id, title: e.title, kind: e.kind, epigraph: e.epigraph || '', text: e.text,
    condition: ENDING_CONDITIONS[id] || '',
  }));

// ---------------- летопись: тексты зимы ----------------

const prov = proverbsRaw as unknown as Record<string, string[]>;
export const PROVERBS: string[] = Object.values(prov).flat();
export const WINTER_RULES: Array<{ n: number; title: string; law: string; story: string; why: string }> =
  (winterRulesRaw as unknown as { all: Array<{ n: number; title: string; law: string; story: string; why: string }> }).all;
export const RADIO: Array<{ id: string; day_min: number; day_max: number; kind: string; text: string }> =
  (radioRaw as unknown as { broadcasts: Array<{ id: string; day_min: number; day_max: number; kind: string; text: string }> }).broadcasts;
export const GAZETTE: Array<{ id: string; date: string; title: string; cols: Array<{ h: string; t: string }> }> =
  (gazetteRaw as unknown as { ISSUES: Array<{ id: string; date: string; title: string; cols: Array<{ h: string; t: string }> }> }).ISSUES;
export const NOTES: Array<{ id: string; title: string; place: string; act: number; text: string }> =
  (notesRaw as unknown as { all: Array<{ id: string; title: string; place: string; act: number; text: string }> }).all;
export const DREAMS: Array<{ t: string; txt: string }> = (dreamsRaw as unknown as { all: Array<{ t: string; txt: string }> }).all;
export const CALENDAR: Record<string, { name: string; note: string }> = (calendarRaw as unknown as { DAYS: Record<string, { name: string; note: string }> }).DAYS;
export const BESTIARY: Array<{ id: string; name: string; danger: number; text: string }> = (bestiaryRaw as unknown as { all: Array<{ id: string; name: string; danger: number; text: string }> }).all;

/** Игровой «день» из календаря 1917 года (60 дней зимовки). */
export function calendarDay(playTime: number): { n: number; name: string; note: string } {
  const n = Math.min(60, Math.floor(playTime / 600) + 1);
  const d = CALENDAR[String(n)];
  return { n, name: d ? d.name : '', note: d ? d.note : '' };
}

// ---------------- броски лута (как в оригинале) ----------------

export interface LootRoll { id: string; n: number }

export function rollLoot(tableId: string, rand: () => number): LootRoll[] {
  const t = LOOT[tableId];
  if (!t) return [];
  const rolls = t.rolls[0] + Math.floor(rand() * (t.rolls[1] - t.rolls[0] + 1));
  const out: LootRoll[] = [];
  // в оригинале запись с id:null — вес «пусто»: бросок может не дать предмета
  const totalW = t.items.reduce((a, e) => a + e.w, 0);
  for (let i = 0; i < rolls; i++) {
    if (totalW <= 0) continue;
    let pick = rand() * totalW;
    for (const e of t.items) {
      pick -= e.w;
      if (pick <= 0) {
        if (!e.id) break; // пустой бросок — как в оригинале
        const n = e.min + Math.floor(rand() * (e.max - e.min + 1));
        if (n > 0) {
          const ex = out.find((o) => o.id === e.id);
          if (ex) ex.n += n; else out.push({ id: e.id, n });
        }
        break;
      }
    }
  }
  return out;
}

/** Все предметы, достижимые обыском (для условий эпилогов и статистики). */
export function churchItems(): string[] {
  const ids = new Set<string>();
  for (const tid of ['church_altar', 'church_candle', 'church_library', 'cemetery_gift']) {
    const t = LOOT[tid];
    if (t) for (const e of t.items) ids.add(e.id);
  }
  return [...ids];
}
