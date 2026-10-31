// ============================================================
// «Рой на 60х»: headless-прогон инкременталки ботами-стратегиями.
// Каждый бот проживает 7 игровых дней за секунды реального
// времени (это >60x ускорение) — баланс виден целиком.
//
// Запуск: bun scripts/sim-incremental.ts [дни]
// ============================================================
import {
  createInitialState, doClick, buyGenerator, buyUpgrade, buyMine, buyTelegraph, buyFurnace,
  buyInvention, doPrestige, tick, woodPerSec, coalPerSec, generatorCost, mineCost, telegraphCost,
  furnaceCost, prestigeGain, genVisible, totalGenerators, coalUnlocked, telegraphUnlocked,
  upgradeAvailable, type GameState,
} from '../src/game/engine';
import { GENERATORS, UPGRADES, MINES, TELEGRAPHS, INVENTIONS } from '../src/game/content';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Bot {
  name: string;
  clicksPerSec: number;
  decideEvery: number; // как часто бот «заходит в игру» (сек)
  buyRule: 'cheapest' | 'rule60' | 'maxExpensive';
  prestigeWhen: (s: GameState) => boolean;
  note: string;
}

interface SimResult {
  name: string;
  wallMs: number;
  events: Record<string, number | null>;
  wood: number;
  totalWood: number;
  wps: number;
  stars: number;
  totalStars: number;
  prestiges: number;
  furnace: number;
  gensTotal: number;
  coal: number;
  depeshi: number;
  maxPurchaseGap: number;
  endGap: number;
  clicky: boolean;
}

const BOTS: Bot[] = [
  {
    name: 'Новичок', clicksPerSec: 2, decideEvery: 5, buyRule: 'cheapest',
    prestigeWhen: () => false,
    note: 'тыкает всё подряд, про престиж не знает',
  },
  {
    name: 'Оптимальный', clicksPerSec: 3, decideEvery: 1, buyRule: 'rule60',
    prestigeWhen: (s) => prestigeGain(s) >= Math.max(3, s.totalStars),
    note: 'классическое правило «цена ≤ 60 сек дохода»',
  },
  {
    name: 'Кликер', clicksPerSec: 8, decideEvery: 1, buyRule: 'rule60',
    prestigeWhen: (s) => prestigeGain(s) >= Math.max(10, s.totalStars),
    note: 'молотит кнопку, долго не сбрасывается',
  },
  {
    name: 'Айдел-барыга', clicksPerSec: 0, decideEvery: 60, buyRule: 'rule60',
    prestigeWhen: (s) => prestigeGain(s) >= Math.max(2, s.totalStars),
    note: 'заходит раз в минуту — чистый idle',
  },
  {
    name: 'Рашер', clicksPerSec: 3, decideEvery: 1, buyRule: 'rule60',
    prestigeWhen: (s) => prestigeGain(s) >= 1,
    note: 'престижит при первой же звезде',
  },
  {
    name: 'Максимальный', clicksPerSec: 5, decideEvery: 2, buyRule: 'maxExpensive',
    prestigeWhen: (s) => prestigeGain(s) >= Math.max(5, s.totalStars),
    note: 'покупает MAX самого дорогого',
  },
];

function decide(s: GameState, bot: Bot, purchaseTimes: number[]): void {
  const wps = woodPerSec(s);
  let bought = true;
  let guard = 0;

  // 1) улучшения — всегда, пока по карману
  for (const u of UPGRADES) {
    if (upgradeAvailable(s, u.id)) {
      const cost = u.cost * (s.starUpgrades.includes('rulebook') ? 0.8 : 1);
      if (s.wood >= cost) {
        if (buyUpgrade(s, u.id)) purchaseTimes.push(s.playTime);
      }
    }
  }

  // 2) генераторы
  guard = 0;
  while (bought && guard++ < 50) {
    bought = false;
    if (bot.buyRule === 'cheapest') {
      let bestI = -1, bestCost = Infinity;
      for (let i = 0; i < GENERATORS.length; i++) {
        if (!genVisible(s, i)) continue;
        const c = generatorCost(s, i, 1);
        if (c < bestCost) { bestCost = c; bestI = i; }
      }
      if (bestI >= 0 && s.wood >= bestCost) {
        if (buyGenerator(s, bestI, 1)) { purchaseTimes.push(s.playTime); bought = true; }
      }
    } else if (bot.buyRule === 'rule60') {
      for (let i = 0; i < GENERATORS.length; i++) {
        if (!genVisible(s, i)) continue;
        const c = generatorCost(s, i, 1);
        const budget = wps > 0 ? Math.max(s.wood * 0.5, 60 * wps) : s.wood;
        if (s.wood >= c && c <= budget) {
          if (buyGenerator(s, i, 1)) { purchaseTimes.push(s.playTime); bought = true; }
        }
      }
    } else {
      // maxExpensive: самый дорогой доступный генератор — MAX
      let bestI = -1, bestCost = -1;
      for (let i = 0; i < GENERATORS.length; i++) {
        if (!genVisible(s, i)) continue;
        const c = generatorCost(s, i, 1);
        if (s.wood >= c && c > bestCost) { bestCost = c; bestI = i; }
      }
      if (bestI >= 0) {
        // сколько влезает
        let n = 0;
        while (s.wood >= generatorCost(s, bestI, n + 1) && n < 200) n++;
        if (n > 0 && buyGenerator(s, bestI, n)) { purchaseTimes.push(s.playTime); bought = n >= 200; }
      }
    }
  }

  // 3) шахта (уголь)
  if (coalUnlocked(s)) {
    guard = 0; bought = true;
    while (bought && guard++ < 30) {
      bought = false;
      for (let i = 0; i < MINES.length; i++) {
        const c = mineCost(s, i, 1);
        const budget = wps > 0 ? Math.max(s.wood * 0.3, 90 * wps) : s.wood;
        if (s.wood >= c && c <= budget) {
          if (buyMine(s, i, 1)) { purchaseTimes.push(s.playTime); bought = true; }
        }
      }
    }
    // топка — жжём весь уголь
    while (s.coal >= furnaceCost(s, 1)) {
      if (!buyFurnace(s, 1)) break;
      purchaseTimes.push(s.playTime);
    }
  }

  // 4) телеграф
  if (telegraphUnlocked(s)) {
    guard = 0; bought = true;
    while (bought && guard++ < 30) {
      bought = false;
      for (let i = 0; i < TELEGRAPHS.length; i++) {
        const c = telegraphCost(s, i, 1);
        const budget = wps > 0 ? Math.max(s.wood * 0.3, 120 * wps) : s.wood;
        if (s.wood >= c && c <= budget) {
          if (buyTelegraph(s, i, 1)) { purchaseTimes.push(s.playTime); bought = true; }
        }
      }
    }
    for (const inv of INVENTIONS) {
      if (!s.inventions.includes(inv.id) && s.depeshi >= inv.cost) {
        if (buyInvention(s, inv.id)) purchaseTimes.push(s.playTime);
      }
    }
  }

  // 5) престиж
  if (bot.prestigeWhen(s)) {
    doPrestige(s);
    purchaseTimes.push(s.playTime);
  }
}

function runBot(bot: Bot, days: number): SimResult {
  const s = createInitialState();
  s.auroraNext = 200; // детерминированность
  const rand = mulberry32(20261031);
  const purchaseTimes: number[] = [];
  const events: Record<string, number | null> = {
    'первый генератор': null,
    'уголь открыт': null,
    'телеграф открыт': null,
    'миллиард за забег': null,
    'первый престиж': null,
    'топка ур.10': null,
    'триллион всего': null,
    'квадриллион всего': null,
  };
  const totalSec = days * 86400;
  let nextDecide = 0;
  const t0 = Date.now();

  for (let t = 0; t < totalSec; t += 1) {
    // бутстрап: даже чистый айделер сначала несколько раз стукнет топором
    if (bot.clicksPerSec > 0) doClick(s, bot.clicksPerSec);
    else if (t < 10) doClick(s, 2);
    if (t >= nextDecide) {
      nextDecide = t + bot.decideEvery;
      decide(s, bot, purchaseTimes);
    }
    tick(s, 1, rand);

    if (events['первый генератор'] === null && totalGenerators(s) >= 1) events['первый генератор'] = t;
    if (events['уголь открыт'] === null && s.totalWood >= 25_000) events['уголь открыт'] = t;
    if (events['телеграф открыт'] === null && s.totalWood >= 5_000_000) events['телеграф открыт'] = t;
    if (events['миллиард за забег'] === null && s.runWood >= 1e9) events['миллиард за забег'] = t;
    if (events['первый престиж'] === null && s.prestiges >= 1) events['первый престиж'] = t;
    if (events['топка ур.10'] === null && s.furnace >= 10) events['топка ур.10'] = t;
    if (events['триллион всего'] === null && s.totalWood >= 1e12) events['триллион всего'] = t;
    if (events['квадриллион всего'] === null && s.totalWood >= 1e15) events['квадриллион всего'] = t;
  }

  const wallMs = Date.now() - t0;

  // мёртвые зоны: самый длинный промежуток без покупок
  let maxGap = 0;
  for (let i = 1; i < purchaseTimes.length; i++) {
    const gap = purchaseTimes[i] - purchaseTimes[i - 1];
    if (gap > maxGap) maxGap = gap;
  }
  const endGap = purchaseTimes.length > 0 ? totalSec - purchaseTimes[purchaseTimes.length - 1] : totalSec;

  return {
    name: bot.name,
    wallMs,
    events,
    wood: s.wood,
    totalWood: s.totalWood,
    wps: woodPerSec(s),
    stars: s.stars,
    totalStars: s.totalStars,
    prestiges: s.prestiges,
    furnace: s.furnace,
    gensTotal: totalGenerators(s),
    coal: s.coal,
    depeshi: s.depeshi,
    maxPurchaseGap: maxGap,
    endGap,
    clicky: bot.clicksPerSec > 0,
  };
}

function fmt(t: number | null): string {
  if (t === null) return '—';
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  if (h > 0) return `${h}ч${String(m).padStart(2, '0')}м`;
  if (m > 0) return `${m}м`;
  return `${t}с`;
}

function fnum(n: number): string {
  if (n >= 1e15) return n.toExponential(2);
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return Math.floor(n).toString();
}

const days = Number(process.argv[2] ?? 7);
console.log(`\n❄️  «БЕЛАЯ ТИШИНА: ТОПКА» — рой ботов, ${days} игровых дней каждый (ускорение ≈ ${(days * 86400 / 60).toFixed(0)}x+)\n`);

const results: SimResult[] = [];
for (const bot of BOTS) {
  const r = runBot(bot, days);
  results.push(r);
  console.log(`— ${bot.name} (${bot.note}): прожито ${days * 86400} игровых секунд за ${(r.wallMs / 1000).toFixed(1)}с реальных (${Math.round(days * 86400 / (r.wallMs / 1000)).toLocaleString('ru-RU')}x)`);
}

console.log('\n=== ТАБЛИЦА ТЕМПА (время до события) ===');
const labels = Object.keys(results[0].events);
const header = 'событие'.padEnd(24) + results.map((r) => r.name.padEnd(13)).join('');
console.log(header);
for (const label of labels) {
  const row = label.padEnd(24) + results.map((r) => fmt(r.events[label]).padEnd(13)).join('');
  console.log(row);
}

console.log('\n=== ИТОГИ ЗА ' + days + ' ДНЕЙ ===');
const stats: Array<[string, (r: SimResult) => string]> = [
  ['дров в конце', (r) => fnum(r.wood)],
  ['добыча/с', (r) => fnum(r.wps)],
  ['всего дров', (r) => fnum(r.totalWood)],
  ['звёзд заработано', (r) => r.totalStars.toString()],
  ['экспедиций', (r) => r.prestiges.toString()],
  ['уровень топки', (r) => r.furnace.toString()],
  ['техники', (r) => r.gensTotal.toString()],
  ['макс. пауза между покупками', (r) => fmt(r.maxPurchaseGap)],
  ['пауза в конце', (r) => fmt(r.endGap)],
];
for (const [label, get] of stats) {
  console.log(label.padEnd(26) + results.map((r) => get(r).padEnd(13)).join(''));
}

console.log('\n=== ДИАГНОЗ ===');
let issues = 0;
for (const r of results) {
  const firstGen = r.events['первый генератор'];
  const coal = r.events['уголь открыт'];
  const tg = r.events['телеграф открыт'];
  const pr = r.events['первый престиж'];
  const limit = r.clicky ? 1200 : 5400; // активный: 20 мин, айдел: 90 мин
  if (firstGen !== null && firstGen > 120) { console.log(`⚠️  ${r.name}: первый генератор только на ${fmt(firstGen)} — медленный старт`); issues++; }
  if (r.maxPurchaseGap > limit) { console.log(`⚠️  ${r.name}: мёртвая зона ${fmt(r.maxPurchaseGap)} без покупок — скучно`); issues++; }
  if (r.endGap > limit) { console.log(`⚠️  ${r.name}: в конце ${fmt(r.endGap)} нечего покупать — потолок`); issues++; }
  if (r.prestiges === 0 && r.totalWood >= 1e10) { console.log(`⚠️  ${r.name}: накопил ${fnum(r.totalWood)} дров и ни разу не prestiged`); issues++; }
  if (coal === null) { console.log(`ℹ️  ${r.name}: уголь так и не открыт за ${days} дней`); }
  if (tg === null) { console.log(`ℹ️  ${r.name}: телеграф не открыт — проверить темп раскрытия`); }
  if (pr === null && r.name !== 'Новичок') { console.log(`ℹ️  ${r.name}: ни одного престижа — проверить порог`); }
}
if (issues === 0) console.log('✅ мёртвых зон и завалов не найдено');

// глубокий прогон: 30 дней оптимальным ботом — проверка эндгейма
console.log('\n=== ГЛУБОКИЙ ПРОГОН: Оптимальный × 30 дней ===');
const deep = runBot(BOTS[1], 30);
console.log(`дров/с: ${fnum(deep.wps)}, всего дров: ${fnum(deep.totalWood)}, звёзд: ${deep.totalStars}, экспедиций: ${deep.prestiges}, топка: ${deep.furnace}, техники: ${deep.gensTotal}`);
if (deep.totalWood < 1e15) console.log('⚠️  за 30 дней не достигнут квадриллион — эндгейм зажат');
else console.log('✅ квадриллион достигнут — гигантизм чисел на месте');
if (deep.totalStars < 50) console.log('⚠️  мало звёзд за 30 дней — престиж-петля вялая');
