// ============================================================
// «Рой на 60х» v2 — headless-прогон инкременталки ботами.
// Каждый бот проживает игровые дни за секунды реального времени
// (ускорение в тысячи раз) — баланс систем репозитория виден целиком.
//
// Боты теперь используют ВСЕ системы: генераторы, улучшения, уголь,
// телеграф, престиж + обыск посёлка, крафт, охота.
//
// Запуск: bun scripts/sim-incremental.ts [дни]
// ============================================================
import {
  createInitialState, doClick, buyGenerator, buyUpgrade, buyMine, buyTelegraph, buyFurnace,
  buyInvention, doPrestige, tick, woodPerSec, coalPerSec, generatorCost, mineCost, telegraphCost,
  furnaceCost, prestigeGain, genVisible, totalGenerators, coalUnlocked, telegraphUnlocked,
  upgradeAvailable, doScavenge, doCraft, doHunt, scavengeCost, craftCost, huntCost,
  buildingUnlocked, craftUnlocked, huntUnlocked, uniqueItems, totalHunts, globalMult,
  checkEndings, type GameState,
} from '../src/game/engine';
import { GENERATORS, UPGRADES, MINES, TELEGRAPHS, INVENTIONS } from '../src/game/content';
import { BUILDINGS, BEASTS, CRAFTS } from '../src/game/legacy';

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
  decideEvery: number;
  buyRule: 'cheapest' | 'rule60' | 'maxExpensive';
  // v2: стили игры новыми системами
  scavenges: number;   // сколько обысков делает за заход
  crafts: number;      // сколько рецептов осваивает за заход
  hunts: number;       // сколько облав за заход
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
  items: number;       // уникальных предметов
  crafted: number;     // рецептов
  huntsTotal: number;  // облав
  notes: number;       // записок
  endings: number;     // эпилогов
  mult: number;        // общий множитель
  maxPurchaseGap: number;
  endGap: number;
  clicky: boolean;
}

const BOTS: Bot[] = [
  {
    name: 'Новичок', clicksPerSec: 2, decideEvery: 30, buyRule: 'cheapest',
    scavenges: 1, crafts: 1, hunts: 0,
    prestigeWhen: () => false,
    note: 'тыкает всё подряд, про престиж не знает',
  },
  {
    name: 'Оптимальный', clicksPerSec: 3, decideEvery: 10, buyRule: 'rule60',
    scavenges: 2, crafts: 2, hunts: 1,
    prestigeWhen: (s) => prestigeGain(s) >= Math.max(3, s.totalStars),
    note: 'правило «цена ≤ 60 сек дохода» + весь контент',
  },
  {
    name: 'Мародёр', clicksPerSec: 3, decideEvery: 10, buyRule: 'rule60',
    scavenges: 4, crafts: 1, hunts: 0,
    prestigeWhen: (s) => prestigeGain(s) >= Math.max(3, s.totalStars),
    note: 'живёт обыском: склад решает всё',
  },
  {
    name: 'Крафтер', clicksPerSec: 3, decideEvery: 10, buyRule: 'rule60',
    scavenges: 1, crafts: 3, hunts: 0,
    prestigeWhen: (s) => prestigeGain(s) >= Math.max(3, s.totalStars),
    note: 'осваивает ремёсла пачками',
  },
  {
    name: 'Охотник', clicksPerSec: 3, decideEvery: 10, buyRule: 'rule60',
    scavenges: 1, crafts: 1, hunts: 2,
    prestigeWhen: (s) => prestigeGain(s) >= Math.max(3, s.totalStars),
    note: 'ходит на облавы при любой возможности',
  },
  {
    name: 'Айдел-барыга', clicksPerSec: 0, decideEvery: 60, buyRule: 'rule60',
    scavenges: 2, crafts: 2, hunts: 1,
    prestigeWhen: (s) => prestigeGain(s) >= Math.max(2, s.totalStars),
    note: 'заходит раз в минуту — чистый idle',
  },
  {
    name: 'Рашер', clicksPerSec: 3, decideEvery: 10, buyRule: 'rule60',
    scavenges: 1, crafts: 1, hunts: 0,
    prestigeWhen: (s) => prestigeGain(s) >= 1,
    note: 'престижит при первой же звезде',
  },
  {
    name: 'Максимальный', clicksPerSec: 5, decideEvery: 15, buyRule: 'maxExpensive',
    scavenges: 3, crafts: 3, hunts: 1,
    prestigeWhen: (s) => prestigeGain(s) >= Math.max(5, s.totalStars),
    note: 'покупает MAX всего подряд',
  },
];

function decide(s: GameState, bot: Bot, purchaseTimes: number[], rand: () => number): void {
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
      let bestI = -1, bestCost = -1;
      for (let i = 0; i < GENERATORS.length; i++) {
        if (!genVisible(s, i)) continue;
        const c = generatorCost(s, i, 1);
        if (s.wood >= c && c > bestCost) { bestCost = c; bestI = i; }
      }
      if (bestI >= 0) {
        let n = 0;
        while (s.wood >= generatorCost(s, bestI, n + 1) && n < 200) n++;
        if (n > 0 && buyGenerator(s, bestI, n)) { purchaseTimes.push(s.playTime); bought = n >= 200; }
      }
    }
  }

  // 3) обыск посёлка: до bot.scavenges за заход, чередуем дешёвое и новое
  if (bot.scavenges > 0) {
    let done = 0;
    for (let k = 0; k < bot.scavenges * 2 && done < bot.scavenges; k++) {
      let pickI = -1;
      if (rand() < 0.5) {
        // новое: самое дорогое доступное по карману (люди идут в новые места)
        let bestCost = -1;
        for (let i = 0; i < BUILDINGS.length; i++) {
          if (!buildingUnlocked(s, i)) continue;
          const c = scavengeCost(s, i);
          if (c > bestCost && s.wood >= c * 1.2) { bestCost = c; pickI = i; }
        }
      } else {
        // дешёвое: привычный маршрут
        let bestCost = Infinity;
        for (let i = 0; i < BUILDINGS.length; i++) {
          if (!buildingUnlocked(s, i)) continue;
          const c = scavengeCost(s, i);
          if (c < bestCost && s.wood >= c * 1.2) { bestCost = c; pickI = i; }
        }
      }
      if (pickI < 0) break;
      if (doScavenge(s, pickI, rand)) { purchaseTimes.push(s.playTime); done++; }
    }
  }

  // 4) крафт: первые доступные неоткрытые рецепты (сеты + ранний выход —
  //    рецепты отсортированы по цене, 30 не по карману подряд = дальше дороже)
  if (bot.crafts > 0) {
    let done = 0;
    const craftedSet = new Set(s.crafted);
    let tooPoor = 0;
    for (const c of CRAFTS) {
      if (done >= bot.crafts) break;
      if (tooPoor >= 30) break;
      if (craftedSet.has(c.id)) continue;
      if (!craftUnlocked(s, c.id)) continue;
      const cost = craftCost(s, c.id);
      if (s.wood < cost * 1.5) { tooPoor++; continue; }
      if (doCraft(s, c.id)) { purchaseTimes.push(s.playTime); done++; craftedSet.add(c.id); }
    }
  }

  // 5) охота: доступные звери по карману
  if (bot.hunts > 0) {
    let done = 0;
    for (let k = 0; k < BEASTS.length && done < bot.hunts; k++) {
      const i = BEASTS.length - 1 - k; // с простых зверей
      if (!huntUnlocked(s, i)) continue;
      const c = huntCost(s, i);
      if (s.wood >= c * 1.5) {
        if (doHunt(s, i, rand)) { purchaseTimes.push(s.playTime); done++; }
      }
    }
  }

  // 6) шахта (уголь)
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
    while (s.coal >= furnaceCost(s, 1)) {
      if (!buyFurnace(s, 1)) break;
      purchaseTimes.push(s.playTime);
    }
  }

  // 7) телеграф
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

  // 8) престиж
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
    // v2: репозиторные системы
    'первый обыск': null,
    '10-й рецепт': null,
    '50-й рецепт': null,
    'первая облава': null,
    '100 предметов': null,
    '300 предметов': null,
    'первый эпилог': null,
  };
  const totalSec = days * 86400;
  let nextDecide = 0;
  const t0 = Date.now();

  for (let t = 0; t < totalSec; t += 1) {
    if (bot.clicksPerSec > 0) doClick(s, bot.clicksPerSec);
    else if (t < 10) doClick(s, 2);
    if (t >= nextDecide) {
      nextDecide = t + bot.decideEvery;
      decide(s, bot, purchaseTimes, rand);
    }
    tick(s, 1, rand);

    // события проверяем раз в 10 тиков — экономим время роя
    if (t % 10 !== 0) continue;
    if (events['первый генератор'] === null && totalGenerators(s) >= 1) events['первый генератор'] = t;
    if (events['уголь открыт'] === null && s.totalWood >= 25_000) events['уголь открыт'] = t;
    if (events['телеграф открыт'] === null && s.totalWood >= 5_000_000) events['телеграф открыт'] = t;
    if (events['миллиард за забег'] === null && s.runWood >= 1e9) events['миллиард за забег'] = t;
    if (events['первый престиж'] === null && s.prestiges >= 1) events['первый престиж'] = t;
    if (events['топка ур.10'] === null && s.furnace >= 10) events['топка ур.10'] = t;
    if (events['триллион всего'] === null && s.totalWood >= 1e12) events['триллион всего'] = t;
    if (events['квадриллион всего'] === null && s.totalWood >= 1e15) events['квадриллион всего'] = t;
    if (events['первый обыск'] === null && s.searches.reduce((a, b) => a + b, 0) >= 1) events['первый обыск'] = t;
    if (events['10-й рецепт'] === null && s.crafted.length >= 10) events['10-й рецепт'] = t;
    if (events['50-й рецепт'] === null && s.crafted.length >= 50) events['50-й рецепт'] = t;
    if (events['первая облава'] === null && totalHunts(s) >= 1) events['первая облава'] = t;
    if (events['100 предметов'] === null && uniqueItems(s) >= 100) events['100 предметов'] = t;
    if (events['300 предметов'] === null && uniqueItems(s) >= 300) events['300 предметов'] = t;
    if (events['первый эпилог'] === null && s.endings.length >= 1) events['первый эпилог'] = t;
  }

  const wallMs = Date.now() - t0;

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
    items: uniqueItems(s),
    crafted: s.crafted.length,
    huntsTotal: totalHunts(s),
    notes: s.notesFound.length,
    endings: s.endings.length,
    mult: globalMult(s),
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
  if (!Number.isFinite(n)) return '∞';
  if (n >= 1e15) return n.toExponential(2);
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return Math.floor(n).toString();
}

const days = Number(process.argv[2] ?? 7);
console.log(`\n❄️  «БЕЛАЯ ТИШИНА: ТОПКА» v2 (весь контент репозитория) — рой ботов, ${days} игровых дней каждый\n`);

const results: SimResult[] = [];
for (const bot of BOTS) {
  const r = runBot(bot, days);
  results.push(r);
  console.log(`— ${bot.name} (${bot.note}): ${days * 86400} игровых секунд за ${(r.wallMs / 1000).toFixed(1)}с реальных (${Math.round(days * 86400 / (r.wallMs / 1000)).toLocaleString('ru-RU')}x)`);
}

console.log('\n=== ТАБЛИЦА ТЕМПА (время до события) ===');
const labels = Object.keys(results[0].events);
const header = 'событие'.padEnd(22) + results.map((r) => r.name.padEnd(13)).join('');
console.log(header);
for (const label of labels) {
  const row = label.padEnd(22) + results.map((r) => fmt(r.events[label]).padEnd(13)).join('');
  console.log(row);
}

console.log('\n=== ИТОГИ ЗА ' + days + ' ДНЕЙ ===');
const stats: Array<[string, (r: SimResult) => string]> = [
  ['дров в конце', (r) => fnum(r.wood)],
  ['добыча/с', (r) => fnum(r.wps)],
  ['всего дров', (r) => fnum(r.totalWood)],
  ['общий множитель', (r) => '×' + fnum(r.mult)],
  ['звёзд заработано', (r) => r.totalStars.toString()],
  ['экспедиций', (r) => r.prestiges.toString()],
  ['уровень топки', (r) => r.furnace.toString()],
  ['техники', (r) => r.gensTotal.toString()],
  ['предметов склада', (r) => r.items.toString()],
  ['рецептов освоено', (r) => r.crafted.toString()],
  ['облав проведено', (r) => r.huntsTotal.toString()],
  ['записок найдено', (r) => r.notes.toString()],
  ['эпилогов', (r) => r.endings.toString()],
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
  const firstScav = r.events['первый обыск'];
  const limit = r.clicky ? 1200 : 5400;
  if (firstGen !== null && firstGen > 120) { console.log(`⚠️  ${r.name}: первый генератор только на ${fmt(firstGen)} — медленный старт`); issues++; }
  if (r.maxPurchaseGap > limit) { console.log(`⚠️  ${r.name}: мёртвая зона ${fmt(r.maxPurchaseGap)} без покупок — скучно`); issues++; }
  if (r.endGap > limit) { console.log(`⚠️  ${r.name}: в конце ${fmt(r.endGap)} нечего покупать — потолок`); issues++; }
  if (r.prestiges === 0 && r.totalWood >= 1e10) { console.log(`⚠️  ${r.name}: накопил ${fnum(r.totalWood)} дров и ни разу не prestiged`); issues++; }
  if (firstScav === null && r.name !== 'Айдел-барыга') { console.log(`⚠️  ${r.name}: ни одного обыска за ${days} дней — порог завышен?`); issues++; }
  if (r.items < 20 && days >= 7) { console.log(`⚠️  ${r.name}: склад почти пуст (${r.items}) — обыск не стоит своих дров?`); issues++; }
  if (r.crafted < 5 && days >= 7 && r.name !== 'Новичок') { console.log(`⚠️  ${r.name}: рецептов освоено ${r.crafted} — кривая крафта рановата/поздняя?`); issues++; }
  if (r.endings > 0 && days <= 3) { console.log(`ℹ️  ${r.name}: эпилог за ${days} дней — быстрая концовка`); }
}
if (issues === 0) console.log('✅ мёртвых зон и завалов не найдено');

// глубокий прогон: 30 дней оптимальным ботом — проверка эндгейма
console.log('\n=== ГЛУБОКИЙ ПРОГОН: Оптимальный × 30 дней ===');
const deep = runBot(BOTS[1], 30);
console.log(`дров/с: ${fnum(deep.wps)}, всего: ${fnum(deep.totalWood)}, множитель: ×${fnum(deep.mult)}, звёзд: ${deep.totalStars}, экспедиций: ${deep.prestiges}`);
console.log(`склад: ${deep.items}/517 предметов, рецептов: ${deep.crafted}/284, облав: ${deep.huntsTotal}, записок: ${deep.notes}/121, эпилогов: ${deep.endings}/7`);
if (deep.totalWood < 1e15) console.log('⚠️  за 30 дней не достигнут квадриллион — эндгейм зажат');
else console.log('✅ квадриллион достигнут — гигантизм чисел на месте');
if (deep.items < 150) console.log('⚠️  склад маловат для 30 дней — обыск дорог');
else console.log('✅ коллекция растёт стабильно');
if (deep.crafted < 100) console.log('⚠️  рецептов освоено мало — крафт вялый');
else console.log('✅ кривая крафта работает');

// марафон: 100 дней мародёром — проверка коллекции и эпилогов
console.log('\n=== МАРАФОН: Мародёр × 100 дней ===');
const marathon = runBot(BOTS[2], 100);
console.log(`склад: ${marathon.items}/517, рецептов: ${marathon.crafted}/284, записок: ${marathon.notes}/121, эпилогов: ${marathon.endings}/7, звёзд: ${marathon.totalStars}`);
if (marathon.endings >= 1) console.log('✅ эпилоги достигаются долгой игрой');
else console.log('ℹ️  эпилогов пока нет — они для марафонцев (100 часов, 100 волков и т.д.)');
if (marathon.notes < 60) console.log('⚠️  записок маловато за 100 дней — шанс 12% скуп?');
else console.log('✅ летопись наполняется');
