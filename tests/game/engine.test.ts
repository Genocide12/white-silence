import { describe, expect, test } from 'bun:test';
import {
  auroraMultiplier,
  createInitialState, doClick, buyGenerator, buyUpgrade, buyMine, buyTelegraph, buyFurnace,
  buyInvention, buyStarUpgrade, doPrestige, tick, applyOffline, checkAchievements, doPrestige as prestige,
  generatorCost, maxBuyCount, maxBuyMine, maxBuyTelegraph, maxBuyFurnace, furnaceCost,
  clickPower, woodPerSec, coalPerSec, depeshiPerSec, globalMult, genMult, prestigeGain,
  serialize, deserialize, exportSave, importSave, upgradeAvailable, genVisible, totalGenerators,
  autoClickRate, isAuroraActive, starBonusPerStar, furnaceStep,
} from '../../src/game/engine';
import { GENERATORS, UPGRADES, MINES, TELEGRAPHS, INVENTIONS, STAR_UPGRADES, ACHIEVEMENTS, PRESTIGE_UNLOCK, GROWTH } from '../../src/game/content';

const S = () => createInitialState();
const seq = () => 0.5; // детерминированный «рандом»

describe('контент-таблицы', () => {
  test('уникальные id', () => {
    const all = [
      ...GENERATORS.map((g) => g.id),
      ...UPGRADES.map((u) => u.id),
      ...MINES.map((m) => m.id),
      ...TELEGRAPHS.map((t) => t.id),
      ...INVENTIONS.map((i) => i.id),
      ...STAR_UPGRADES.map((s) => s.id),
      ...ACHIEVEMENTS.map((a) => a.id),
    ];
    expect(new Set(all).size).toBe(all.length);
  });
  test('цены генераторов растут эрой', () => {
    for (let i = 1; i < GENERATORS.length; i++) {
      expect(GENERATORS[i].baseCost).toBeGreaterThan(GENERATORS[i - 1].baseCost);
      expect(GENERATORS[i].baseProd).toBeGreaterThan(GENERATORS[i - 1].baseProd);
    }
  });
  test('genMult-улучшения указывают на существующие генераторы', () => {
    for (const u of UPGRADES) {
      if (u.kind === 'genMult') {
        expect(u.target).toBeDefined();
        expect(u.target as number).toBeLessThan(GENERATORS.length);
        expect(u.target as number).toBeGreaterThanOrEqual(0);
      }
    }
  });
  test('достижения-пороги достижимы и осмысленны', () => {
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(30);
  });
});

describe('клик и производство', () => {
  test('клик даёт 1 дров и считает удары', () => {
    const s = S();
    const g = doClick(s);
    expect(g).toBe(1);
    expect(s.wood).toBe(1);
    expect(s.clicks).toBe(1);
    expect(s.totalWood).toBe(1);
    expect(s.runWood).toBe(1);
  });
  test('woodPerSec = 0 без генераторов', () => {
    expect(woodPerSec(S())).toBe(0);
  });
  test('один топор даёт 0.1/с', () => {
    const s = S();
    s.gens[0] = 1;
    expect(woodPerSec(s)).toBeCloseTo(0.1, 10);
  });
  test('улучшения клика мультиплицируются', () => {
    const s = S();
    s.upgrades = ['sharp_axe', 'sturdy_helve'];
    expect(clickPower(s)).toBe(4);
  });
  test('руковицы дают долю от добычи', () => {
    const s = S();
    s.gens[2] = 10; // 80/с
    s.upgrades = ['warm_mittens']; // +1%
    expect(clickPower(s)).toBeCloseTo(1 + 0.8, 8);
  });
  test('сила клика растёт от звёзд через производство', () => {
    const s = S();
    s.gens[2] = 10;
    s.upgrades = ['warm_mittens'];
    s.totalStars = 100; // +400%
    expect(clickPower(s)).toBeCloseTo(1 + 0.8 * 5, 8);
  });
});

describe('цены и покупки', () => {
  test('цена генератора растёт как 1.15^n', () => {
    const s = S();
    expect(generatorCost(s, 0, 1)).toBeCloseTo(15, 8);
    s.gens[0] = 1;
    expect(generatorCost(s, 0, 1)).toBeCloseTo(15 * GROWTH, 6);
    s.gens[0] = 9;
    expect(generatorCost(s, 0, 1)).toBeCloseTo(15 * Math.pow(GROWTH, 9), 4);
  });
  test('цена пачки = сумме геометрической прогрессии', () => {
    const s = S();
    const n = 10;
    let sum = 0;
    for (let i = 0; i < n; i++) sum += 15 * Math.pow(GROWTH, i);
    expect(generatorCost(s, 0, n)).toBeCloseTo(sum, 4);
  });
  test('покупка списывает дрова и добавляет генераторы', () => {
    const s = S();
    s.wood = 100;
    expect(buyGenerator(s, 0, 1)).toBe(true);
    expect(s.wood).toBe(85);
    expect(s.gens[0]).toBe(1);
  });
  test('нельзя купить без денег', () => {
    const s = S();
    s.wood = 14;
    expect(buyGenerator(s, 0, 1)).toBe(false);
    expect(s.gens[0]).toBe(0);
    expect(s.wood).toBe(14);
  });
  test('maxBuyCount не превышает доступное', () => {
    const s = S();
    s.wood = 100;
    const n = maxBuyCount(s, 0);
    expect(n).toBeGreaterThanOrEqual(4); // 15+17.25+19.84+22.83 = 74.9, пятая уже не влезает
    expect(generatorCost(s, 0, n)).toBeLessThanOrEqual(100);
    expect(generatorCost(s, 0, n + 1)).toBeGreaterThan(100);
  });
  test('улучшение покупается один раз и требует разблокировки', () => {
    const s = S();
    s.wood = 1e6;
    expect(upgradeAvailable(s, 'sharp_axe')).toBe(false); // нужно 10 кликов
    s.clicks = 10;
    expect(upgradeAvailable(s, 'sharp_axe')).toBe(true);
    expect(buyUpgrade(s, 'sharp_axe')).toBe(true);
    expect(buyUpgrade(s, 'sharp_axe')).toBe(false); // второй раз нельзя
  });
  test('шахта и телеграф покупаются за дрова', () => {
    const s = S();
    s.profession = 'carpenter'; // нейтральная к эфиру профессия — базовые курсы
    s.wood = 1e7;
    expect(buyMine(s, 0, 1)).toBe(true);
    expect(coalPerSec(s)).toBeCloseTo(0.1, 8);
    expect(buyTelegraph(s, 0, 1)).toBe(true);
    expect(depeshiPerSec(s)).toBeCloseTo(0.05, 8);
    s.profession = 'telegraph'; // родная профессия: депеши +50%
    expect(depeshiPerSec(s)).toBeCloseTo(0.075, 8);
    expect(maxBuyMine(s, 0)).toBeGreaterThan(0);
    expect(maxBuyTelegraph(s, 0)).toBeGreaterThan(0);
  });
  test('топка стоит уголь и множит добычу', () => {
    const s = S();
    s.gens[2] = 10;
    s.coal = furnaceCost(s, 2); // хватает на два уровня
    expect(maxBuyFurnace(s)).toBe(2);
    const before = woodPerSec(s);
    expect(buyFurnace(s, 1)).toBe(true);
    expect(woodPerSec(s)).toBeCloseTo(before * 1.25, 6);
    expect(furnaceCost(s, 1)).toBeCloseTo(15 * 2.0, 6);
  });
  test('изобретения за депеши', () => {
    const s = S();
    s.depeshi = 10;
    expect(buyInvention(s, 'autosharp')).toBe(true);
    expect(autoClickRate(s)).toBe(3);
    s.depeshi = 60;
    expect(buyInvention(s, 'autosharp2')).toBe(true);
    expect(autoClickRate(s)).toBe(10);
  });
});

describe('множители', () => {
  test('звёзды усиливают через 1 + 4% за звезду', () => {
    const s = S();
    s.gens[2] = 1;
    s.totalStars = 20;
    expect(globalMult(s)).toBeCloseTo(1.8, 8);
  });
  test('гиперборейская математика: 6% вместо 4%', () => {
    const s = S();
    s.totalStars = 20;
    s.inventions = ['hyperborean'];
    expect(globalMult(s)).toBeCloseTo(2.2, 8);
    expect(starBonusPerStar(s)).toBe(0.06);
  });
  test('двойная топка: шаг 1.3', () => {
    const s = S();
    s.starUpgrades = ['double_furnace'];
    expect(furnaceStep(s)).toBe(1.3);
  });
  test('достижения дают по 1%', () => {
    const s = S();
    s.achievements = ['a_click1', 'a_gen1', 'a_w1k'];
    expect(globalMult(s)).toBeCloseTo(1.03, 8);
  });
  test('сияние ×5, со «Сполохами» ×10', () => {
    const s = S();
    s.auroraUntil = s.playTime + 10;
    expect(globalMult(s)).toBeCloseTo(5, 8);
    expect(isAuroraActive(s)).toBe(true);
    s.starUpgrades = ['aurora_amp'];
    expect(globalMult(s)).toBeCloseTo(10, 8);
    expect(auroraMultiplier(s)).toBe(10);
  });
  test('пароход ×10', () => {
    const s = S();
    s.starUpgrades = ['ship'];
    expect(globalMult(s)).toBeCloseTo(10, 8);
  });
});

describe('тик', () => {
  test('производство капает за dt', () => {
    const s = S();
    s.gens[0] = 10; // 1/с
    tick(s, 10, seq);
    expect(s.wood).toBeCloseTo(10, 6);
    expect(s.playTime).toBe(10);
    expect(s.totalWood).toBeCloseTo(10, 6);
  });
  test('автоклик добывает и считает удары', () => {
    const s = S();
    s.inventions = ['autosharp']; // 3/с
    tick(s, 10, seq);
    expect(s.wood).toBeCloseTo(30, 6);
    expect(s.clicks).toBeCloseTo(30, 6);
  });
  test('уголь и депеши капают', () => {
    const s = S();
    s.profession = 'carpenter'; // без бонуса эфира — чистый базовый темп
    s.mines[0] = 1;
    s.telegraphs[0] = 1;
    tick(s, 10, seq);
    expect(s.coal).toBeCloseTo(1, 6);
    expect(s.depeshi).toBeCloseTo(0.5, 6);
    s.profession = 'telegraph'; // депеши +50% — капает быстрее
    s.depeshi = 0;
    tick(s, 10, seq);
    expect(s.depeshi).toBeCloseTo(0.75, 6);
  });
  test('сияние включается по расписанию', () => {
    const s = S();
    s.auroraNext = 5;
    tick(s, 6, seq);
    expect(isAuroraActive(s)).toBe(true);
    expect(s.aurorasSeen).toBe(1);
    // гаснет через 30 секунд
    tick(s, 30, seq);
    expect(isAuroraActive(s)).toBe(false);
  });
  test('автоартель покупает генераторы сама', () => {
    const s = S();
    s.inventions = ['autoartel'];
    s.autoBuy[0] = true;
    s.wood = 100;
    tick(s, 1, seq);
    expect(s.gens[0]).toBe(1);
    expect(s.wood).toBeLessThan(100);
  });
  test('приказчик топки подкидывает уголь', () => {
    const s = S();
    s.starUpgrades = ['furnace_clerk'];
    s.autoFurnace = true;
    s.coal = 100;
    tick(s, 1, seq);
    expect(s.furnace).toBe(1);
  });
  test('достижения открываются в тике', () => {
    const s = S();
    doClick(s); // есть удар — есть «Первая щепка»
    s.gens[0] = 1;
    const res = tick(s, 1, seq);
    expect(res.newAchievements).toContain('a_click1');
    expect(res.newAchievements).toContain('a_gen1');
    expect(s.achievements).toContain('a_gen1');
  });
});

describe('престиж', () => {
  test('формула звёзд: (runWood / 1e9)^0.38', () => {
    const s = S();
    expect(prestigeGain(s)).toBe(0);
    s.runWood = PRESTIGE_UNLOCK;
    expect(prestigeGain(s)).toBe(1);
    s.runWood = 4e9;
    expect(prestigeGain(s)).toBe(1); // короткий забег не сулит россыпи
    s.runWood = 1e10;
    expect(prestigeGain(s)).toBe(2);
    s.runWood = 1e12;
    expect(prestigeGain(s)).toBe(13);
    s.runWood = 1e18;
    expect(prestigeGain(s)).toBe(2630);
  });
  test('сброс оставляет мета-прогресс', () => {
    const s = S();
    s.runWood = 1e10;
    s.wood = 1e6;
    s.gens[3] = 5;
    s.upgrades = ['sharp_axe'];
    s.furnace = 7;
    s.mines[0] = 2;
    s.inventions = ['autosharp'];
    s.achievements = ['a_click1'];
    s.starUpgrades = ['legacy'];
    const gain = doPrestige(s);
    expect(gain).toBe(2);
    expect(s.stars).toBe(2);
    expect(s.totalStars).toBe(2);
    expect(s.prestiges).toBe(1);
    expect(s.gens[3]).toBe(0);
    expect(s.upgrades).toEqual([]);
    expect(s.furnace).toBe(0);
    expect(s.mines[0]).toBe(0);
    expect(s.achievements).toEqual(['a_click1']); // достижения остаются
    expect(s.inventions).toEqual(['autosharp']); // изобретения остаются
    expect(s.starUpgrades).toEqual(['legacy']);
    expect(s.wood).toBe(1000); // наследие истопника
  });
  test('престиж без звёзд не проходит', () => {
    const s = S();
    s.runWood = 1e8;
    expect(prestige(s)).toBe(0);
    expect(s.prestiges).toBe(0);
  });
  test('звёзды считают от заработанного, а не остатка', () => {
    const s = S();
    s.totalStars = 50;
    s.stars = 0; // всё потрачено
    s.gens[2] = 1;
    expect(globalMult(s)).toBeCloseTo(3, 8); // 1 + 0.04*50
  });
});

describe('звёздный магазин', () => {
  test('покупки за звёзды', () => {
    const s = S();
    s.stars = 3;
    expect(buyStarUpgrade(s, 'legacy')).toBe(true);
    expect(s.stars).toBe(0);
    expect(buyStarUpgrade(s, 'capital')).toBe(false);
  });
  test('жила богаче удваивает уголь', () => {
    const s = S();
    s.mines[0] = 1;
    expect(coalPerSec(s)).toBeCloseTo(0.1, 8);
    s.starUpgrades = ['rich_vein'];
    expect(coalPerSec(s)).toBeCloseTo(0.2, 8);
  });
});

describe('оффлайн', () => {
  test('половина дохода по умолчанию', () => {
    const s = S();
    s.gens[2] = 10; // 80/с
    s.lastSeen = Date.now() - 3600_000; // час
    const rep = applyOffline(s, Date.now());
    expect(rep).not.toBeNull();
    expect(rep!.seconds).toBeCloseTo(3600, -1);
    expect(rep!.wood).toBeCloseTo(80 * 3600 * 0.5, -3);
  });
  test('термос даёт 100%', () => {
    const s = S();
    s.gens[2] = 10;
    s.inventions = ['thermos'];
    s.lastSeen = Date.now() - 3600_000;
    const rep = applyOffline(s, Date.now());
    expect(rep!.wood).toBeCloseTo(80 * 3600, -3);
  });
  test('лимит 12 часов без вечной мерзлоты', () => {
    const s = S();
    s.gens[2] = 10;
    s.lastSeen = Date.now() - 48 * 3600_000;
    const rep = applyOffline(s, Date.now());
    expect(rep!.seconds).toBeCloseTo(12 * 3600, -1);
  });
  test('меньше минуты — без отчёта', () => {
    const s = S();
    s.lastSeen = Date.now() - 30_000;
    expect(applyOffline(s, Date.now())).toBeNull();
  });
});

describe('сейвы', () => {
  test('кругосветка serialize → deserialize', () => {
    const s = S();
    s.wood = 12345.6;
    s.gens[2] = 7;
    s.upgrades = ['sharp_axe', 'kerosene'];
    s.furnace = 4;
    s.coal = 99;
    s.stars = 12;
    s.totalStars = 12;
    s.achievements = ['a_click1', 'a_w1k'];
    s.autoBuy[0] = true;
    const restored = deserialize(serialize(s));
    expect(restored).not.toBeNull();
    expect(restored!.wood).toBeCloseTo(12345.6, 6);
    expect(restored!.gens[2]).toBe(7);
    expect(restored!.upgrades).toEqual(['sharp_axe', 'kerosene']);
    expect(restored!.furnace).toBe(4);
    expect(restored!.achievements.length).toBe(2);
    expect(restored!.autoBuy[0]).toBe(true);
  });
  test('экспорт/импорт base64', () => {
    const s = S();
    s.wood = 777;
    s.gens[1] = 3;
    const restored = importSave(exportSave(s));
    expect(restored).not.toBeNull();
    expect(restored!.wood).toBe(777);
    expect(restored!.gens[1]).toBe(3);
  });
  test('битый сейв не роняет игру', () => {
    expect(deserialize('{{{не json')).toBeNull();
    expect(importSave('не-base64!!!')).toBeNull();
    const restored = deserialize('{"v":1,"wood":"мусор","gens":null}');
    expect(restored).not.toBeNull(); // мердж с дефолтами
    expect(Number.isFinite(restored!.wood)).toBe(true);
  });
  test('неизвестные id вычищаются при загрузке', () => {
    const s = S();
    s.upgrades = ['sharp_axe', 'фейковый'];
    s.achievements = ['a_click1', 'нет такого'];
    const restored = deserialize(serialize(s));
    expect(restored!.upgrades).toEqual(['sharp_axe']);
    expect(restored!.achievements).toEqual(['a_click1']);
  });
});

describe('раскрытие (unfolding)', () => {
  test('первый генератор виден сразу, следующий — после покупки', () => {
    const s = S();
    expect(genVisible(s, 0)).toBe(true);
    expect(genVisible(s, 1)).toBe(false);
    s.gens[0] = 1;
    expect(genVisible(s, 1)).toBe(true);
  });
  test('генератор виден при 40% цены', () => {
    const s = S();
    s.totalWood = GENERATORS[1].baseCost * 0.4;
    expect(genVisible(s, 1)).toBe(true);
  });
  test('общее число генераторов', () => {
    const s = S();
    s.gens = [1, 2, 3, 0, 0, 0, 0, 0, 0, 0];
    expect(totalGenerators(s)).toBe(6);
  });
});
