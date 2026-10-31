/**
 * ЭКСПЕДИЦИИ — мета-слой «Белого Безмолвия» (престиж между зимами).
 *
 * ЗИМОЙ дед выживает. МЕЖДУ ЗИМАМИ дед с мультяшками ходит за звёздами:
 * экспедиция в небо превращает прожитую зиму в ЗВЁЗДЫ ⭐. Звёзды покупают
 * ПЕРМАНЕНТНЫЕ ПЕРКИ (цена растёт экспоненциально ×2 за уровень, эффекты —
 * мультипликаторы) и РАЗВОРАЧИВАЮТ СИСТЕМЫ: Схрон Деда, Грибные Зелья,
 * пиратское радио «Дед-FM». Всё скромно, без ухода в бесконечные цифры:
 * 7 перков, 3 анлока, множители ограничены.
 *
 * Хранение: localStorage 'wsMetaExped1' — переживает смерть, новые партии
 * и демо. Сейв игры не трогаем: мета живёт отдельно (инкременталка вторым
 * дном, партия — первым).
 *
 * Связи: crazy.js (ХП/энергия/урон/скорость/подарки), story.js (Грибной
 * Зов), craft (двойные факелы), ui/expedition_screen.js (Изба Экспедиций),
 * death_screen.js (кнопка «Отправить экспедицию»).
 */
(function () {
  'use strict';

  var KEY = 'wsMetaExped1';

  // ====================================================================
  //  ПЕРКИ (звёзды → перманентные бонусы; цена = base × 2^уровень)
  // ====================================================================

  var PERKS = [
    { id: 'skull', icon: '💀', name: 'Крепкий Череп', max: 5, base: 3,
      desc: 'ХП-часы тикают медленнее: −8% за уровень. Дедская башка — сейф.' },
    { id: 'appetite', icon: '🍄', name: 'Грибной Аппетит', max: 5, base: 3,
      desc: 'Грибная энергия ×1.15 за уровень. Жри — не хочу!' },
    { id: 'palm', icon: '🖐️', name: 'Ладошка-Гром', max: 3, base: 4,
      desc: 'Урон изгнания +30% и шанс звёздной пыли +10% за уровень.' },
    { id: 'boots', icon: '👟', name: 'Сапоги-Скороходы', max: 3, base: 4,
      desc: 'Скорость деда +6% за уровень. Летит, как ошпаренный ёж.' },
    { id: 'magpie', icon: '🐦', name: 'Сорока-Воровка', max: 3, base: 4,
      desc: 'Шанс подарка из мультяшек +6% за уровень. Всё блестящее — моё.' },
    { id: 'torchy', icon: '🔥', name: 'Факельный Мастер', max: 2, base: 5,
      desc: '35% за уровень: крафт факела выходит сразу двойным. Два финта ушами.' },
    { id: 'starcall', icon: '🛸', name: 'Звёздный Зов', max: 2, base: 6,
      desc: 'Грибной Зов дешевле: −10 энергии за уровень; на 2-м пыли нужно 2 вместо 3.' }
  ];

  // ====================================================================
  //  РАЗВОРАЧИВАНИЕ СИСТЕМ (анлоки за число отправленных экспедиций)
  // ====================================================================

  var UNLOCKS = [
    { id: 'stash', need: 1, icon: '🎒', name: 'Схрон Деда',
      desc: 'Каждая новая зима стартует с мешком: грибы, косяк, конфеты, спички. Заныкал — нашёл.' },
    { id: 'potions', need: 2, icon: '⚗️', name: 'Грибные Зелья',
      desc: 'Рецепты зелий из звёздной пыли: «Живая Вода» лечит, «Ёрш-Драйв» ускоряет. Варим... и нюхаем.' },
    { id: 'dedfm', need: 3, icon: '📻', name: 'Дед-FM',
      desc: 'Пиратский матерный радиоканал деда на волне 60 бабок. Слабонервным не слушать.' }
  ];

  // стартовый мешок «Схрона Деда» (id предметов существуют в data/)
  var STASH_ITEMS = [
    { id: 'mushroom_fun', n: 3 }, { id: 'candy_ded', n: 2 },
    { id: 'joint_ded', n: 1 }, { id: 'matches', n: 1 }, { id: 'tincture_fly', n: 1 }
  ];

  // ====================================================================
  //  СОСТОЯНИЕ МЕТЫ
  // ====================================================================

  var M = null;      // { stars, spentTotal, perks:{}, runs:[...], wins, bestDay }

  function blank() {
    return { stars: 0, spentTotal: 0, perks: {}, runs: [], wins: 0, bestDay: 0 };
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var d = JSON.parse(raw);
        M = blank();
        M.stars = Math.max(0, d.stars || 0);
        M.spentTotal = Math.max(0, d.spentTotal || 0);
        M.perks = d.perks || {};
        M.runs = (d.runs && d.runs.slice) ? d.runs.slice(-12) : [];
        M.wins = d.wins || 0;
        M.bestDay = d.bestDay || 0;
        return;
      }
    } catch (e) { /* битая мета — начинаем с нуля */ }
    M = blank();
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(M)); } catch (e) { /* нет доступа */ }
  }

  function meta() { if (!M) load(); return M; }

  // ====================================================================
  //  ПЕРКИ: чтение эффектов (хуки для других систем)
  // ====================================================================

  function lv(id) { var m = meta(); return (m.perks && m.perks[id]) || 0; }
  function findPerk(id) {
    for (var i = 0; i < PERKS.length; i++) if (PERKS[i].id === id) return PERKS[i];
    return null;
  }
  function cost(id) {
    var p = findPerk(id);
    if (!p) return null;
    var cur = lv(id);
    if (cur >= p.max) return null;
    return p.base * Math.pow(2, cur);
  }

  // ---- эффекты (все ограничены, «не сильно далеко») ----
  function drainMul() { return Math.max(0.55, 1 - 0.08 * lv('skull')); }
  function energyMul() { return Math.min(2, 1 + 0.15 * lv('appetite')); }
  function dmgMul() { return Math.min(2.5, 1 + 0.30 * lv('palm')); }
  function speedMul() { return Math.min(1.25, 1 + 0.06 * lv('boots')); }
  function giftBonus() { return Math.min(0.2, 0.06 * lv('magpie')); }
  function dustChance() { return Math.min(0.85, 0.4 + 0.10 * lv('palm')); }
  function torchDouble() { return Math.min(0.7, 0.35 * lv('torchy')); }
  function ritualEnergyCost() { return Math.max(10, 30 - 10 * lv('starcall')); }
  function ritualDustNeed() { return lv('starcall') >= 2 ? 2 : 3; }

  function buy(id) {
    var m = meta();
    var c = cost(id);
    if (c === null) return { ok: false, why: 'Уровень уже максимальный' };
    if (m.stars < c) return { ok: false, why: 'Не хватает звёзд: нужно ' + c + '⭐' };
    m.stars -= c;
    m.spentTotal += c;
    m.perks[id] = lv(id) + 1;
    save();
    try { WS.Snd.play('levelup', { vol: 0.5 }); } catch (e) { /* пусто */ }
    return { ok: true, left: m.stars, now: m.perks[id] };
  }

  // ====================================================================
  //  АНЛОКИ СИСТЕМ
  // ====================================================================

  function runsCount() { var m = meta(); return m.runs.length; }

  function unlocked(id) {
    for (var i = 0; i < UNLOCKS.length; i++) {
      if (UNLOCKS[i].id === id) return runsCount() >= UNLOCKS[i].need;
    }
    return false;
  }

  /** Стартовый мешок «Схрона Деда» — вызывается при создании новой партии. */
  function applyStash() {
    if (!unlocked('stash')) return 0;
    var given = 0;
    try {
      for (var i = 0; i < STASH_ITEMS.length; i++) {
        try {
          if (WS.Inv && WS.Inv.give) { WS.Inv.give(STASH_ITEMS[i].id, STASH_ITEMS[i].n); given++; }
        } catch (e) { /* предмет не дался — не страшно */ }
      }
    } catch (e) { /* пусто */ }
    if (given && WS.Ui && WS.Ui.toast) {
      WS.Ui.toast('🎒 Схрон Деда: мешок со скарбом заныкан в карманах (экспедиции работают!)', 'good');
    }
    return given;
  }

  // ====================================================================
  //  ПРЕДМЕТЫ ЗЕЛИЙ (анлок «Грибные Зелья») — регистрируются при загрузке
  // ====================================================================

  function declareItems() {
    var D = WS.Data = WS.Data || {};
    D.items = D.items || {};
    D.items.potion_heal = {
      cat: 'med', w: 0.3, stack: 5, tags: ['med'],
      heal: 40,
      ru: 'Живая Вода', rud: 'Зелье из звёздной пыли и грибов. Лечит 40 ХП, бодрит дух, будит совесть.'
    };
    D.items.potion_zoom = {
      cat: 'med', w: 0.3, stack: 5, tags: ['med'],
      zoom: 60,
      ru: 'Ёрш-Драйв', rud: 'Зелье скорости: минуту дед летает, как молодой. Потом — как пожилой, но быстро.'
    };
    // рецепты (схема как в data/recipes.js) — ВАЖНО писать и в recipes,
    // и в recipesById: индекс строят data-модули ДО нас, без индекса
    // рецепт виден в меню, но не исполняется («нет такого рецепта» —
    // тест-сьют S3 ловил ровно это на recipes_extra)
    D.recipes = D.recipes || [];
    D.recipesById = D.recipesById || {};
    var has = function (id) {
      for (var i = 0; i < D.recipes.length; i++) if (D.recipes[i].id === id) return true;
      return false;
    };
    if (!has('potion_heal')) {
      var rHeal = {
        id: 'potion_heal', cat: 'cook', station: null, time: 8,
        req: [{ id: 'stardust', n: 1 }, { id: 'mushroom_fun', n: 2 }],
        tools: [], out: [{ id: 'potion_heal', n: 1 }],
        ru: 'Живая Вода'
      };
      D.recipes.push(rHeal);
      D.recipesById.potion_heal = rHeal;
    }
    if (!has('potion_zoom')) {
      var rZoom = {
        id: 'potion_zoom', cat: 'cook', station: null, time: 8,
        req: [{ id: 'stardust', n: 1 }, { id: 'candy_ded', n: 2 }],
        tools: [], out: [{ id: 'potion_zoom', n: 1 }],
        ru: 'Ёрш-Драйв'
      };
      D.recipes.push(rZoom);
      D.recipesById.potion_zoom = rZoom;
    }
    // имена в словари RU/EN (тест-сьют S2/S4: без ключей — сырые id в тултипах)
    WS.Data.locales = WS.Data.locales || {};
    WS.Data.locales.ru = WS.Data.locales.ru || {};
    WS.Data.locales.en = WS.Data.locales.en || {};
    if (!WS.Data.locales.ru['item.potion_heal.name']) {
      WS.Data.locales.ru['item.potion_heal.name'] = 'Живая Вода';
      WS.Data.locales.ru['item.potion_heal.desc'] = 'Зелье из звёздной пыли и грибов. Лечит 40 ХП, бодрит дух, будит совесть.';
      WS.Data.locales.ru['item.potion_zoom.name'] = 'Ёрш-Драйв';
      WS.Data.locales.ru['item.potion_zoom.desc'] = 'Зелье скорости: минуту дед летает, как молодой. Потом — как пожилой, но быстро.';
      WS.Data.locales.ru['recipe.potion_heal'] = 'Живая Вода';
      WS.Data.locales.ru['recipe.potion_zoom'] = 'Ёрш-Драйв';
    }
    if (!WS.Data.locales.en['item.potion_heal.name']) {
      WS.Data.locales.en['item.potion_heal.name'] = 'Living Water';
      WS.Data.locales.en['item.potion_heal.desc'] = 'A potion of stardust and mushrooms. Heals 40 HP, cheers the spirit, wakes the conscience.';
      WS.Data.locales.en['item.potion_zoom.name'] = 'Hedgehog-Drive';
      WS.Data.locales.en['item.potion_zoom.desc'] = 'Speed potion: for a minute the old man flies like a young one. Then — like an elderly one, but fast.';
      WS.Data.locales.en['recipe.potion_heal'] = 'Living Water';
      WS.Data.locales.en['recipe.potion_zoom'] = 'Hedgehog-Drive';
    }
  }

  // ====================================================================
  //  ОТПРАВИТЬ ЭКСПЕДИЦИЮ (после финала партии)
  //  d: { result:'victory'|'wintering'|'death', day, banished, treeLv,
  //       stardust, seed, name, ritual:0..3 }
  // ====================================================================

  function starsFor(d) {
    d = d || {};
    var day = Math.max(1, d.day || 1);
    var banished = Math.max(0, d.banished || 0);
    var treeLv = Math.max(0, d.treeLv || 0);
    var win = d.result === 'victory';
    var base = day * 0.25 + banished * 0.6 + treeLv * 2.5 + (win ? 18 : 6);
    // СПИДРАН-БОНУС: чем раньше победа (раньше 55-го дня), тем жирнее звёзды
    if (win) base += Math.max(0, 55 - day) * 1.2;
    // экспоненциальный множитель за серию побед — но упирается в ×2.5
    var m = meta();
    var mult = Math.min(2.5, 1 + 0.15 * (m.wins || 0));
    return Math.max(1, Math.round(base * mult));
  }

  function sendExpedition(d) {
    var m = meta();
    d = d || {};
    var stars = starsFor(d);
    var win = d.result === 'victory';
    var rec = {
      at: Date.now(),
      result: d.result || 'stop',
      day: d.day || 0,
      banished: d.banished || 0,
      treeLv: d.treeLv || 0,
      stars: stars,
      seed: d.seed || 0,
      name: d.name || 'Дед',
      ritual: d.ritual || 0
    };
    m.runs.push(rec);
    if (m.runs.length > 24) m.runs.shift();
    m.stars += stars;
    if (win) {
      m.wins = (m.wins || 0) + 1;
      var day = d.day || 60;
      if (!m.bestDay || day < m.bestDay) m.bestDay = day;
    }
    save();
    return { stars: stars, total: m.stars };
  }

  // ====================================================================
  //  ПУБЛИЧНОЕ API
  // ====================================================================

  WS.boot(function initExpeditions() {
    load();
    declareItems();
    // «Схрон Деда» — вручаем в начале каждой новой партии (не при загрузке сейва)
    WS.Ev.on('game:start', function () { try { applyStash(); } catch (e) { /* пусто */ } });
    WS.log('[Expeditions] мета-слой готов: звёзды ' + M.stars + ', экспедиций ' + M.runs.length);
  }, 'expeditions:init');

  WS.def('Expeditions', {
    PERKS: PERKS,
    UNLOCKS: UNLOCKS,
    meta: meta,
    stars: function () { return meta().stars; },
    runsCount: runsCount,
    wins: function () { return meta().wins; },
    bestDay: function () { return meta().bestDay; },
    runs: function () { return meta().runs.slice(); },
    lv: lv,
    cost: cost,
    buy: buy,
    unlocked: unlocked,
    sendExpedition: sendExpedition,
    starsFor: starsFor,
    // эффекты-хуки
    drainMul: drainMul,
    energyMul: energyMul,
    dmgMul: dmgMul,
    speedMul: speedMul,
    giftBonus: giftBonus,
    dustChance: dustChance,
    torchDouble: torchDouble,
    ritualEnergyCost: ritualEnergyCost,
    ritualDustNeed: ritualDustNeed,
    applyStash: applyStash
  });
})();
