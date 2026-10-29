/**
 * inventory.js — ИНВЕНТАРЬ (модуль C1): вес и переноска, стеки, экипировка
 * (включая двуручное), износ cond и починку, свежесть еды (data.age по дням),
 * snapshot() для экрана UI. Тик 41 (системы — сразу после needs 40).
 * Связи: WS.Action (базовый инвентарь — НЕ трогаем, дублируем аккуратно),
 * WS.Loot.dropItem (выброс на пол), WS.Needs/WS.Fire/WS.Looting (они зовут
 * WS.Inv.give/consume/countItem/findItem через свои мосты — подписи совпадают),
 * data/recipes.js + systems/craft.js (крафт поверх этого модуля).
 */
(function () {
  'use strict';

  // ====================================================================
  //  НАСТРОЙКИ И КОНСТАНТЫ
  // ====================================================================

  var TICK_PRI = 41;            // приоритет тика (системы)
  var OVERLOAD_RECHECK_S = 3;   // периодическая перепроверка перевеса, сек

  /** Базовый лимит веса, кг (профессии и навык survive увеличивают). */
  var WEIGHT_BASE = 30;

  /** Кг за уровень навыка survive (0..10 -> +0..+15 кг). */
  var SURVIVE_KG_PER_LV = 1.5;

  /** Жёсткий потолок: кратен maxWeight (дальше руки не возьмут). */
  var HARD_CAP_MUL = 2;

  /** Штрафы скорости: needs.js перемножает p._extMoveMul в p.moveMul. */
  var OVERWEIGHT_SLOW = 0.7;    // до 2x — «-30%»
  var OVERWEIGHT_CRAWL = 0.15;  // от 2x — еле плетёшься

  /**
   * Прибавка к переносимому весу от профессий (data/professions.js пока
   * нет — таблица локальная; если появится WS.Data.professions[id].carry,
   * победит она). Неизвестная профессия — базовые 30 кг.
   */
  var PROF_CARRY = {
    hunter: 5,        // охотник — привычен к тяжёлым тушам
    carpenter: 7,     // плотник — таскает доски
    blacksmith: 8,    // кузнец
    peasant: 10,      // крестьянин — мешки всю жизнь
    fisherman: 4,     // рыбак
    tailor: 2,        // портной — лёгкие иголки
    telegraph: 0,     // телеграфист (база)
    doctor: 0,        // врач
    convict: 6,       // ссыльный — каторга закалила
    soldier: 6,       // солдат — скатка и винтовка
    sailor: 5,        // матрос — концы и ящики
    hermit: 3         // отшельник
  };

  /** Все слоты экипировки (порядок отображения в UI). */
  var SLOTS = ['head', 'torso', 'legs', 'feet', 'hands', 'back', 'hand1', 'hand2'];

  /** Одёжные слоты (туда — только предметы с def.slots). */
  var CLOTH_SLOTS = ['head', 'torso', 'legs', 'feet', 'hands', 'back'];

  /** Категории предметов, допустимые в руках (hand1/hand2). */
  var HAND_CATS = ['tool', 'weapon', 'ranged', 'light'];

  /** Износ за одно использование инструмента по умолчанию. */
  var WEAR_DEFAULT = 1;

  /** Износ оружия ближнего боя за удар (по событию ent:attack). */
  var WEAR_PER_HIT = 0.6;

  /** Починка: точильный камень (лезвия) и швейный набор (одежда). */
  var REPAIR_EDGE_PLUS = 30;    // +cond за точку
  var REPAIR_SEW_PLUS = 35;    // +cond за штопку
  var REPAIR_SEW_PER_LV = 5;   // бонус портного

  /** Порог cond, ниже которого предмет ломается. */
  var COND_BREAK = 0;

  // ====================================================================
  //  ХЕЛПЕРЫ
  // ====================================================================

  function G() { return WS.G; }

  function P() {
    var g = WS.G;
    return (g && g.player) ? g.player : null;
  }

  function clamp(v, a, b) {
    if (v < a) return a;
    if (v > b) return b;
    return v;
  }

  /** Определение предмета (или null для неизвестного id). */
  function defOf(id) {
    return (WS.Data && WS.Data.items && WS.Data.items[id]) || null;
  }

  /** Максимальный стек предмета. */
  function stackMax(def) {
    return (def && typeof def.stack === 'number' && def.stack > 0) ? def.stack : 1;
  }

  /** Сколько штук в записи слота (устойчиво к пропущенному count). */
  function countOf(it) {
    return (it && typeof it.count === 'number' && it.count > 0) ? it.count : (it ? 1 : 0);
  }

  /** Портится ли предмет со временем. */
  function perishable(def) {
    return !!(def && def.per && def.per > 0);
  }

  /** Возраст стопки в днях (0 — свежее; data.age пишем при выдаче/утре). */
  function ageOf(it) {
    if (it && it.data && typeof it.data.age === 'number' && it.data.age > 0) {
      return Math.floor(it.data.age);
    }
    return 0;
  }

  /** Испорчена ли стопка еды (возраст превысил срок годности). */
  function spoiled(it) {
    if (!it) return false;
    var def = defOf(it.id);
    if (!perishable(def)) return false;
    return ageOf(it) > def.per;
  }

  /** Предмет «должен» иметь состояние cond? (инструменты/оружие/одежда) */
  function condEligible(def) {
    if (!def) return false;
    if (stackMax(def) > 1) return false;               // стакуемое не изнашивается
    if (def.dmg > 0 || def.ranged) return true;         // оружие
    if (def.light && def.fuelH) return true;            // факел/фонарь
    if (HAND_CATS.indexOf(def.cat) >= 0) return true;   // инструмент
    if (def.cat === 'cloth' && def.slots) return true;  // одежда
    if (def.uses) return true;                          // расходный набор
    return false;
  }

  /** Допустим ли предмет в руку (неодёжный слот)? */
  function handable(def) {
    if (!def) return false;
    if (def.dmg > 0) return true;                      // любое оружие
    if (def.ranged) return true;
    if (HAND_CATS.indexOf(def.cat) >= 0) return true;   // инструмент/свет
    return false;
  }

  /** Русские имена предметов: I18N (когда появится) -> литерал -> id. */
  var RU_NAME = {
    // еда и стряпня
    bread: 'Хлеб', toast: 'Гренки', rusk: 'Сухарь', kasha: 'Каша',
    soup_meat: 'Мясная похлёбка', soup_veg: 'Похлёбка', soup_mushroom: 'Грибной суп',
    ukha: 'Уха', compote: 'Компот', dough: 'Тесто', pelmeni: 'Пельмени',
    kulebyaka: 'Кулебяка', meat_raw: 'Сырое мясо', meat_cooked: 'Жареное мясо',
    meat_dried: 'Вяленое мясо', potato_fried: 'Жареная картошка',
    potato_boiled: 'Варёная картошка', fresh_fish: 'Свежая рыба',
    cooked_fish: 'Печёная рыба', salt_fish: 'Солёная рыба', dried_fish: 'Сушёная рыба',
    lard_piece: 'Шмат сала', forest_tea: 'Лесной чай', sauerkraut: 'Квашеная капуста',
    pickles: 'Соленья', honey_jar: 'Мёд', semolina: 'Манка', oat_flakes: 'Овсянка',
    flour_bag: 'Мука', sugar_loaf: 'Сахарная голова', salt_bag: 'Соль',
    tea_brick: 'Чай', milk_bottle: 'Молоко', kvass_flask: 'Квас',
    galley_biscuits: 'Галеты', butter_wheel: 'Масло', canned_fish: 'Консервы',
    potato: 'Картошка', onion: 'Лук', cabbage: 'Капуста', turnip: 'Репа',
    carrot: 'Морковь', apple_dried: 'Сухофрукты', cranberries_jar: 'Брусника в банке',
    water_flask: 'Фляга воды', flask_empty: 'Пустая фляга', vodka: 'Водка',
    // материалы и поделки
    log: 'Бревно', plank: 'Доска', nails: 'Гвозди', rope: 'Верёвка',
    rope_coil: 'Моток верёвок', scrap_metal: 'Металлолом', cloth_rag: 'Тряпьё',
    sinew: 'Сухожилия', wolf_pelt: 'Волчья шкура', bear_pelt: 'Медвежья шкура',
    deer_pelt: 'Оленья шкура', hare_pelt: 'Заячьи шкурки', fat: 'Жир',
    charcoal: 'Древесный уголь', charcoal_bag: 'Мешок угля', linen_sheet: 'Лён',
    tar_bucket: 'Бочка дёгтя', hay_bale: 'Сноп сена', burlap_sack: 'Мешок',
    wax_block: 'Кусок воска', bone_old: 'Кости', feather_bunch: 'Перья',
    hinge_iron: 'Петли', window_glass: 'Стекло', wood_glue: 'Столярный клей',
    horseshoe: 'Подковы', door_wood: 'Дверь', barricade_plank: 'Баррикадная доска',
    bed_frame: 'Кровать', chest_wood: 'Сундук', crate_wood: 'Ящик',
    stool_wood: 'Табурет', bench_wood: 'Лавка', table_wood: 'Стол',
    shelf_wood: 'Полка', snow_fence: 'Снегозадержатель', stretcher: 'Носилки',
    coffin_wood: 'Гроб', blanket: 'Одеяло', portyanki: 'Портянки',
    // инструменты и оружие
    axe: 'Топор', hatchet: 'Топорик', axe_small: 'Колунок', hammer: 'Молоток',
    saw: 'Пила', knife: 'Нож', hunting_knife: 'Охотничий нож', shovel: 'Лопата',
    crowbar: 'Лом', ice_pick: 'Ледоруб', fishing_rod: 'Удочка', hook_line: 'Крючки',
    fishing_line: 'Леска', trap_snare: 'Силок', fire_hook: 'Костровой крюк',
    sewing_kit: 'Швейный набор', whetstone: 'Брусок', file_metal: 'Напильник',
    pliers: 'Плоскогубцы', screwdriver: 'Отвёртка', sickle: 'Серп', scythe: 'Коса',
    pitchfork: 'Вилы', spear: 'Копьё', bow_hunting: 'Лук', arrow: 'Стрелы',
    torch: 'Факел', lantern: 'Фонарь', pot: 'Котелок', cast_iron: 'Чугунок',
    skis: 'Лыжи', sledge: 'Нарты', matches: 'Спички', flint: 'Огниво',
    mug_wood: 'Кружка', bowl_wood: 'Миска', spoon_wood: 'Ложка', ladle: 'Черпак',
    // одежда
    ushanka: 'Ушанка', coat_fur: 'Тулуп', coat_cloth: 'Шинель', valenki: 'Валенки',
    mittens: 'Рукавицы', wool_mittens: 'Варежки', wool_scarf: 'Шарф',
    wool_socks: 'Носки', rabbit_fur_cap: 'Заячья шапка', wool_coat: 'Шерстяное пальто',
    leather_boots: 'Сапоги', bearskin_rug: 'Медвежья полость', bedroll: 'Спальник',
    // медицина
    bandage: 'Бинт', bandage_clean: 'Чистый бинт', splint_plank: 'Лубок',
    aspirin: 'Аспирин', morphine: 'Морфий', plaster_cast: 'Гипс',
    // боеприпасы
    rifle_round: 'Патрон', shell: 'Картечь', gunpowder: 'Порох',
    bullet_cast: 'Пули', wadding: 'Пыжи'
  };

  /** Человекочитаемое имя предмета (I18N -> литерал -> id). */
  function nameOf(id) {
    if (WS.I18N && WS.I18N.t) {
      try {
        var s = WS.I18N.t('item.' + id + '.name');
        if (s && s !== 'item.' + id + '.name') return s;
      } catch (e) { /* литерал ниже */ }
    }
    return RU_NAME[id] || id;
  }

  /** Тихое всплывающее сообщение (если UI ещё нет — молчим). */
  function toast(text, kind) {
    if (WS.Ui && WS.Ui.toast) {
      try { WS.Ui.toast(text, kind || 'info'); return; } catch (e) { /* ниже */ }
    }
    try { WS.Ev.emit('ui:toast', { text: text, kind: kind || 'info' }); } catch (e2) { /* пусто */ }
  }

  // ====================================================================
  //  СОБЫТИЯ ИЗМЕНЕНИЙ (контракт: 'inv:changed' после каждой операции)
  // ====================================================================

  /** Пересчитать штраф скорости за перевес (крючок needs.js). */
  function applyOverload() {
    var p = P();
    if (!p) return;
    var w = weight();
    var max = maxWeight();
    if (max <= 0) max = 1;
    var ratio = w / max;
    if (ratio >= HARD_CAP_MUL - 1e-9) {
      p._extMoveMul = OVERWEIGHT_CRAWL;      // еле идёшь
    } else if (ratio > 1 + 1e-9) {
      p._extMoveMul = OVERWEIGHT_SLOW;       // -30%
    } else if (p._extMoveMul === OVERWEIGHT_SLOW || p._extMoveMul === OVERWEIGHT_CRAWL) {
      delete p._extMoveMul;                  // чужие значения не трогаем
    }
  }

  /** Инвентарь изменился: событие + пересчёт перевеса. */
  function changed() {
    applyOverload();
    try { WS.Ev.emit('inv:changed', {}); } catch (e) {
      WS.err('emit inv:changed', e && e.message);
    }
  }

  /** Экипировка изменилась: два события (equip + inv). */
  function equipChanged(slot) {
    applyOverload();
    try { WS.Ev.emit('equip:changed', { slot: slot || null }); } catch (e) { /* пусто */ }
    try { WS.Ev.emit('inv:changed', {}); } catch (e2) { /* пусто */ }
  }

  // ====================================================================
  //  ВЕС
  // ====================================================================

  /** Суммарный вес стопки (кг). */
  function slotW(it) {
    if (!it) return 0;
    var def = defOf(it.id);
    if (!def) return 0;
    var w = (typeof def.w === 'number' && def.w >= 0) ? def.w : 0;
    return w * countOf(it);
  }

  /** Полный переносимый вес: инвентарь + надетое. */
  function weight() {
    var p = P();
    if (!p) return 0;
    var sum = 0;
    var i;
    if (p.inv) {
      for (i = 0; i < p.inv.length; i++) sum += slotW(p.inv[i]);
    }
    if (p.equip) {
      for (var s in p.equip) {
        if (!p.equip.hasOwnProperty(s)) continue;
        var e = p.equip[s];
        if (e && e.id) {
          var def = defOf(e.id);
          if (def) sum += (typeof def.w === 'number' ? def.w : 0);
        }
      }
    }
    // сани/волокуша на спине добавляют ёмкость — считаем честно: их вес уже
    // в сумме, бонус в maxWeight()
    return Math.round(sum * 1000) / 1000;
  }

  /** Прибавка профессии к переносимому весу (кг). */
  function profCarry() {
    var p = P();
    if (!p) return 0;
    var prof = p.prof || 'telegraph';
    // канонический справочник профессий (если появится) важнее таблицы
    if (WS.Data && WS.Data.professions && WS.Data.professions[prof]) {
      var c = WS.Data.professions[prof].carry;
      if (typeof c === 'number') return c;
    }
    return (typeof PROF_CARRY[prof] === 'number') ? PROF_CARRY[prof] : 0;
  }

  /**
   * Лимит переносимого веса, кг:
   *   30 (база) + профессия + 1.5 × навык survive + сани на спине (carry).
   */
  function maxWeight() {
    var p = P();
    if (!p) return WEIGHT_BASE;
    var m = WEIGHT_BASE + profCarry();
    if (p.skills && p.skills.survive) {
      m += (p.skills.survive.lv || 0) * SURVIVE_KG_PER_LV;
    }
    // волокуша на спине заметно расширяет поклажу (тащим, а не несём)
    var back = p.equip && p.equip.back;
    if (back && back.id) {
      var bd = defOf(back.id);
      if (bd && bd.carry) m += bd.carry;
    }
    return Math.round(m * 10) / 10;
  }

  /** Жёсткий потолок веса (руками больше не взять). */
  function hardCap() {
    return maxWeight() * HARD_CAP_MUL;
  }

  /**
   * Степень перегруза: 0 — нормально, 1 — тяжело (штраф скорости),
   * 2 — предел (еле плетёшься, новое не поднять).
   */
  function overload() {
    var max = maxWeight();
    if (max <= 0) return 0;
    var ratio = weight() / max;
    if (ratio >= HARD_CAP_MUL - 1e-9) return 2;
    if (ratio > 1 + 1e-9) return 1;
    return 0;
  }

  // ====================================================================
  //  БАЗОВЫЕ ОПЕРАЦИИ: GIVE / TAKE / COUNT / HAS / FIND
  //  Подписи совместимы с мостами needs.js, fire.js и looting.js:
  //  give(id, n) -> число, consume(id, n) -> число, countItem(id) -> число,
  //  findItem(id, from) -> живая ссылка на запись.
  // ====================================================================

  /** Инициализация полей новой записи (cond/возраст) по определению. */
  function applyExtras(slot, def, opts) {
    if (!slot) return;
    opts = opts || {};
    if (condEligible(def)) {
      slot.cond = (typeof opts.cond === 'number')
        ? clamp(Math.floor(opts.cond), 0, 100)
        : 100;
    }
    if (perishable(def)) {
      slot.data = { age: (typeof opts.age === 'number') ? Math.max(0, Math.floor(opts.age)) : 0 };
    }
  }

  /**
   * ПУБЛИЧНО: положить n предметов id (учёт стеков и веса).
   * Жёсткий потолок — 2 × maxWeight: столько «в руки возьмёшь».
   * Возвращает, сколько реально поместилось. Портящаяся еда стекуется
   * только с одинаковым возрастом (свежее не смешиваем с лежалым).
   * opts: {cond, age} — исходное состояние (для лута/крафта).
   */
  function give(id, n, opts) {
    var p = P();
    if (!p || !id) return 0;
    if (!p.inv) p.inv = [];
    var def = defOf(id);
    if (!def) return 0;                       // неизвестный предмет не берём
    n = Math.max(1, Math.floor(n || 1));
    opts = opts || {};
    var stack = stackMax(def);
    var unitW = (typeof def.w === 'number' && def.w >= 0) ? def.w : 0;
    var cap = hardCap();
    var cur = weight();
    var fresh = (typeof opts.age === 'number') ? Math.max(0, Math.floor(opts.age)) : 0;
    var added = 0;
    var left = n;
    var i, it, c, room, add;

    // влезает ли k штук по весу
    function fits(k) { return cur + k * unitW <= cap + 1e-9; }

    if (stack > 1) {
      // --- досыпаем в существующие стеки ---
      for (i = 0; i < p.inv.length && left > 0; i++) {
        it = p.inv[i];
        if (!it || it.id !== id) continue;
        c = countOf(it);
        if (c >= stack) continue;
        if (perishable(def) && ageOf(it) !== fresh) continue;   // разный возраст
        room = stack - c;
        add = Math.min(room, left);
        while (add > 0 && !fits(add)) add--;
        if (add <= 0) continue;
        it.count = c + add;
        cur += add * unitW;
        left -= add;
        added += add;
      }
      // --- новые записи ---
      while (left > 0) {
        add = Math.min(stack, left);
        while (add > 0 && !fits(add)) add--;
        if (add <= 0) break;
        var s = { id: id, count: add };
        applyExtras(s, def, opts);
        p.inv.push(s);
        cur += add * unitW;
        left -= add;
        added += add;
      }
    } else {
      // --- однопредметные (оружие/инструменты/одежда): по одному ---
      while (left > 0) {
        if (!fits(1)) break;
        var s2 = { id: id, count: 1 };
        applyExtras(s2, def, opts);
        p.inv.push(s2);
        cur += unitW;
        left--;
        added++;
      }
    }

    if (added > 0) changed();
    return added;
  }

  /**
   * ПУБЛИЧНО: списать n предметов id из инвентаря (экипировка не трогается).
   * Возвращает, сколько реально списано. Пустые записи удаляются.
   */
  function take(id, n) {
    var p = P();
    if (!p || !id) return 0;
    if (!p.inv) p.inv = [];
    n = Math.max(1, Math.floor(n || 1));
    var left = n;
    for (var i = p.inv.length - 1; i >= 0 && left > 0; i--) {
      var it = p.inv[i];
      if (!it || it.id !== id) continue;
      var c = countOf(it);
      if (c <= left) {
        left -= c;
        p.inv.splice(i, 1);
      } else {
        it.count = c - left;
        left = 0;
      }
    }
    var used = n - left;
    if (used > 0) changed();
    return used;
  }

  /** Синоним take для совместимости с мостами (needs.js/fire.js). */
  function consume(id, n) { return take(id, n); }

  /** ПУБЛИЧНО: сколько предметов id лежит в инвентаре. */
  function count(id) {
    var p = P();
    if (!p || !id || !p.inv) return 0;
    var n = 0;
    for (var i = 0; i < p.inv.length; i++) {
      var it = p.inv[i];
      if (it && it.id === id) n += countOf(it);
    }
    return n;
  }

  /** Синоним count (совместимость с мостами). */
  function countItem(id) { return count(id); }

  /** ПУБЛИЧНО: есть ли n предметов id. */
  function has(id, n) {
    return count(id) >= Math.max(1, n || 1);
  }

  /**
   * ПУБЛИЧНО: найти запись предмета. from: 'inv' (по умолчанию) | 'equip'
   * | 'any'. Возвращает живую ссылку (можно менять count) или null.
   * Семантика повторяет WS.Action.findItem — модули-мосты не заметят подмены.
   */
  function findItem(id, from) {
    var p = P();
    if (!p || !id) return null;
    if (!p.inv) p.inv = [];
    from = from || 'inv';
    var i;
    if (from === 'inv' || from === 'any') {
      for (i = 0; i < p.inv.length; i++) {
        if (p.inv[i] && p.inv[i].id === id) return p.inv[i];
      }
    }
    if (from === 'equip' || from === 'any') {
      var eq = p.equip || {};
      for (var slot in eq) {
        if (!eq.hasOwnProperty(slot)) continue;
        if (eq[slot] && eq[slot].id === id) return eq[slot];
      }
    }
    return null;
  }

  /**
   * ПУБЛИЧНО: проверить набор ингредиентов [{id, n}].
   * Возвращает {ok, missing: [{id, need, have}]}.
   */
  function hasAll(reqs) {
    var missing = [];
    if (reqs && reqs.length) {
      for (var i = 0; i < reqs.length; i++) {
        var r = reqs[i];
        if (!r || !r.id) continue;
        var need = Math.max(1, r.n || 1);
        var have = count(r.id);
        if (have < need) missing.push({ id: r.id, need: need, have: have });
      }
    }
    return { ok: missing.length === 0, missing: missing };
  }

  /** ПУБЛИЧНО: провести все пары [{id, n}] (если хватает). Атомарно. */
  function takeAll(reqs) {
    var check = hasAll(reqs);
    if (!check.ok) return { ok: false, missing: check.missing };
    if (reqs && reqs.length) {
      for (var i = 0; i < reqs.length; i++) {
        take(reqs[i].id, reqs[i].n || 1);
      }
    }
    return { ok: true };
  }

  // ====================================================================
  //  ЭКИПИРОВКА
  //  p.equip = {head, torso, legs, feet, hands, back, hand1, hand2}.
  //  Одежда — по def.slots; в руки — оружие/инструменты/свет. Двуручное
  //  (twoHand) занимает hand1 и hand2 сразу: старое из обеих рук — в сумку.
  // ====================================================================

  function ensureEquip(p) {
    if (!p.equip) {
      p.equip = { head: null, torso: null, legs: null, feet: null,
                  hands: null, back: null, hand1: null, hand2: null };
    }
    return p.equip;
  }

  /** Вещь из экипировки — обратно в сумку (без проверки веса: неслась же). */
  function toInv(p, x) {
    if (!x) return;
    if (!p.inv) p.inv = [];
    p.inv.push(x);
  }

  /** Достать из записи одну штуку, вычеркнув её из инвентаря. */
  function takeOneFrom(p, invIndex) {
    var it = p.inv[invIndex];
    if (!it || !it.id) return null;
    if (countOf(it) <= 1) return p.inv.splice(invIndex, 1)[0];   // вся запись
    it.count--;
    var one = { id: it.id, count: 1 };
    if (typeof it.cond === 'number') one.cond = it.cond;
    if (it.data) one.data = it.data;
    return one;
  }

  /**
   * ПУБЛИЧНО: надеть предмет из инвентаря. invIndex — индекс записи.
   * slot: один из SLOTS. Возвращает {ok, reason?, slot?}.
   * Двуручное в 'hand2' автоматически надевается в 'hand1'.
   */
  function equip(slot, invIndex) {
    var p = P();
    if (!p) return { ok: false, reason: 'нет партии' };
    var eq = ensureEquip(p);
    if (SLOTS.indexOf(slot) < 0) return { ok: false, reason: 'нет такого слота' };
    if (!p.inv) p.inv = [];
    var it = p.inv[invIndex];
    if (!it || !it.id) return { ok: false, reason: 'пустой слот' };
    var def = defOf(it.id);
    if (!def) return { ok: false, reason: 'неизвестный предмет' };

    // куда реально надеваем
    var dst = slot;
    if (def.twoHand && slot === 'hand2') dst = 'hand1';

    // проверка допустимости
    if (dst === 'hand1' || dst === 'hand2') {
      if (!handable(def)) return { ok: false, reason: 'в руку это не возьмёшь' };
    } else {
      if (!def.slots || def.slots.indexOf(dst) < 0) {
        return { ok: false, reason: 'не сюда' };
      }
    }
    // двуручное нельзя надеть вторым номером в занятую первую руку со щитом?
    // — можно: старое из рук вернётся в сумку (см. ниже)

    var moving = takeOneFrom(p, invIndex);
    if (!moving) return { ok: false, reason: 'слот пуст' };
    if (def.twoHand && dst === 'hand1') {
      // двуручное занимает обе руки
      if (eq.hand2) { toInv(p, eq.hand2); eq.hand2 = null; }
    }

    var old = eq[dst];
    eq[dst] = moving;
    if (old) toInv(p, old);

    if (def.twoHand && dst === 'hand1') {
      // событие и по второй руке — UI обновит обе
      try { WS.Ev.emit('equip:changed', { slot: 'hand2' }); } catch (e) { /* пусто */ }
    }
    equipChanged(dst);
    return { ok: true, slot: dst };
  }

  /**
   * ПУБЛИЧНО: снять предмет из слота экипировки (вернётся в сумку).
   * Двуручное из hand1 освобождает и hand2.
   */
  function unequip(slot) {
    var p = P();
    if (!p) return { ok: false, reason: 'нет партии' };
    var eq = ensureEquip(p);
    if (SLOTS.indexOf(slot) < 0) return { ok: false, reason: 'нет такого слота' };
    var it = eq[slot];
    if (!it || !it.id) return { ok: false, reason: 'слот пуст' };

    eq[slot] = null;
    toInv(p, it);
    var def = defOf(it.id);
    if (def && def.twoHand && slot === 'hand1') {
      eq.hand2 = null;      // двуручное держалось двумя руками
    }
    equipChanged(slot);
    return { ok: true };
  }

  /** ПУБЛИЧНО: что надето в слот (запись {id, cond} или null). */
  function equipped(slot) {
    var p = P();
    if (!p || !p.equip) return null;
    return p.equip[slot] || null;
  }

  /** ПУБЛИЧНО: определение надетого в слот (или null). */
  function equipDef(slot) {
    var it = equipped(slot);
    return it ? defOf(it.id) : null;
  }

  /** Сводная теплоизоляция одежды (для температуры/UI). */
  function warmTotal() {
    var p = P();
    if (!p || !p.equip) return 0;
    var sum = 0;
    for (var i = 0; i < CLOTH_SLOTS.length; i++) {
      var it = p.equip[CLOTH_SLOTS[i]];
      if (!it) continue;
      var def = defOf(it.id);
      if (!def) continue;
      var w = (def.warm || 0);
      // дырявая одежда греет хуже
      if (typeof it.cond === 'number') w *= clamp(it.cond / 100, 0.3, 1);
      sum += w;
    }
    return Math.round(sum);
  }

  /** Сводная защита от урона (для боевой системы/UI). */
  function defTotal() {
    var p = P();
    if (!p || !p.equip) return 0;
    var sum = 0;
    for (var i = 0; i < CLOTH_SLOTS.length; i++) {
      var it = p.equip[CLOTH_SLOTS[i]];
      if (!it) continue;
      var def = defOf(it.id);
      if (def) sum += (def.def || 0);
    }
    return sum;
  }

  /** Сводная ветрозащита. */
  function windTotal() {
    var p = P();
    if (!p || !p.equip) return 0;
    var sum = 0;
    for (var i = 0; i < CLOTH_SLOTS.length; i++) {
      var it = p.equip[CLOTH_SLOTS[i]];
      if (!it) continue;
      var def = defOf(it.id);
      if (def) sum += (def.wind || 0);
    }
    return Math.round(sum / CLOTH_SLOTS.length);
  }

  // ====================================================================
  //  МАНИПУЛЯЦИИ СОТКАМИ (для UI)
  // ====================================================================

  /**
   * ПУБЛИЧНО: поменять местами два слота инвентаря (a, b — индексы).
   * С consolidation: одинаковые стакуемые записи объединяются.
   */
  function swap(a, b) {
    var p = P();
    if (!p || !p.inv) return false;
    var n = p.inv.length;
    if (a < 0 || b < 0 || a >= n || b >= n || a === b) return false;
    var t = p.inv[a];
    p.inv[a] = p.inv[b];
    p.inv[b] = t;
    changed();
    return true;
  }

  /**
   * ПУБЛИЧНО: разделить стопку. Переносит count штук (по умолчанию
   * половину, округляя вверх) в новую запись сразу после исходной.
   * Возвращает индекс новой записи или -1.
   */
  function split(index, countWant) {
    var p = P();
    if (!p || !p.inv) return -1;
    var it = p.inv[index];
    if (!it || !it.id) return -1;
    var c = countOf(it);
    if (c <= 1) return -1;                     // нечего делить
    var def = defOf(it.id);
    var take = (typeof countWant === 'number' && countWant > 0)
      ? Math.min(Math.floor(countWant), c - 1)
      : Math.ceil(c / 2);
    if (take <= 0) return -1;

    var rest = { id: it.id, count: take };
    if (typeof it.cond === 'number') rest.cond = it.cond;
    if (it.data) rest.data = it.data;          // возраст/прочие метки
    it.count = c - take;
    p.inv.splice(index + 1, 0, rest);
    changed();
    return index + 1;
  }

  /**
   * ПУБЛИЧНО: выбросить count штук из слота инвентаря на пол
   * (мешочек через WS.Loot.dropItem). Возвращает число выброшенного.
   */
  function drop(index, countWant) {
    var p = P();
    if (!p || !p.inv) return 0;
    var it = p.inv[index];
    if (!it || !it.id) return 0;
    var c = countOf(it);
    var n = (typeof countWant === 'number' && countWant > 0)
      ? Math.min(Math.floor(countWant), c)
      : c;
    if (n <= 0) return 0;

    var x = p.x, y = p.y;
    // перед игроком; упёрлись в стену — под ноги
    var DX = [0, 1, 1, 1, 0, -1, -1, -1], DY = [-1, -1, 0, 1, 1, 1, 0, -1];
    var d = (p.dir || 0) & 7;
    var tx = p.x + DX[d] * 0.7, ty = p.y + DY[d] * 0.7;
    var w = WS.World;
    if (w && w.isTileBlocked && w.isTileBlocked(Math.floor(tx), Math.floor(ty))) {
      tx = p.x; ty = p.y;
    }
    x = tx; y = ty;

    var dropped = false;
    if (WS.Loot && WS.Loot.dropItem) {
      var o = WS.Loot.dropItem(it.id, n, x, y);
      dropped = !!o;
      // NB: cond при выбросе теряется — мешочек дропа хранит только {id, count};
      // подобрав, предмет станет «как новый» (ограничение формата дропа B-агента)
    } else {
      WS.warn('Inv.drop: нет WS.Loot — предмет пропадёт');
      dropped = true;
    }

    if (!dropped) return 0;
    if (n >= c) {
      p.inv.splice(index, 1);
    } else {
      it.count = c - n;
    }
    if (WS.Snd && WS.Snd.play) {
      try { WS.Snd.play('drop', x, y, 0.8); } catch (e) { /* пусто */ }
    }
    changed();
    return n;
  }

  /**
   * ПУБЛИЧНО: сортировка инвентаря. mode: 'cat' (по категориям),
   * 'w' (по весу, тяжёлое сверху), 'name' (по имени). Без mode — 'cat'.
   */
  function sort(mode) {
    var p = P();
    if (!p || !p.inv || p.inv.length < 2) return false;
    mode = mode || 'cat';

    // порядок категорий (остальное — в конец)
    var CAT_ORDER = ['tool', 'weapon', 'ranged', 'ammo', 'light', 'fuel',
                     'med', 'food', 'drink', 'cloth', 'material', 'book',
                     'container', 'misc'];
    var CAT_RANK = {};
    for (var i = 0; i < CAT_ORDER.length; i++) CAT_RANK[CAT_ORDER[i]] = i;

    var arr = p.inv;
    var idx = [];
    for (i = 0; i < arr.length; i++) idx.push(i);
    idx.sort(function (ia, ib) {
      var a = arr[ia], b = arr[ib];
      var da = defOf(a && a.id), db = defOf(b && b.id);
      var r;
      if (mode === 'w') {
        r = slotW(b) - slotW(a);
      } else if (mode === 'name') {
        r = nameOf(a.id) < nameOf(b.id) ? -1 : (nameOf(a.id) > nameOf(b.id) ? 1 : 0);
      } else {
        var ra = da ? (CAT_RANK[da.cat] !== undefined ? CAT_RANK[da.cat] : 99) : 99;
        var rb = db ? (CAT_RANK[db.cat] !== undefined ? CAT_RANK[db.cat] : 99) : 99;
        r = ra - rb;
        if (r === 0) r = nameOf(a.id) < nameOf(b.id) ? -1 : 1;
      }
      if (r === 0) r = ia - ib;                // стабильность
      return r;
    });
    var out = [];
    for (i = 0; i < idx.length; i++) out.push(arr[idx[i]]);
    p.inv = out;
    changed();
    return true;
  }

  /**
   * ПУБЛИЧНО: раздожить стопки — слить одинаковые (равный возраст еды),
   * выкинуть пустые записи. Возвращает чистую длину.
   */
  function compact() {
    var p = P();
    if (!p || !p.inv) return 0;
    var out = [];
    var i, j, it;
    // чистка
    for (i = 0; i < p.inv.length; i++) {
      it = p.inv[i];
      if (it && it.id && countOf(it) > 0) out.push(it);
    }
    // слияние
    var merged = [];
    for (i = 0; i < out.length; i++) {
      it = out[i];
      var def = defOf(it.id);
      var done = false;
      if (def && stackMax(def) > 1) {
        for (j = 0; j < merged.length; j++) {
          var m = merged[j];
          if (m.id !== it.id) continue;
          if (countOf(m) >= stackMax(def)) continue;
          if (perishable(def) && ageOf(m) !== ageOf(it)) continue;  // не смешиваем
          if ((m.cond !== undefined) !== (it.cond !== undefined)) continue;
          var room = stackMax(def) - countOf(m);
          var add = Math.min(room, countOf(it));
          m.count = countOf(m) + add;
          it.count = countOf(it) - add;
          if (countOf(it) <= 0) { done = true; break; }
        }
      }
      if (!done && countOf(it) > 0) merged.push(it);
    }
    p.inv = merged;
    changed();
    return merged.length;
  }

  // ====================================================================
  //  ИЗНОС (cond 0..100) И ПОЧИНКА
  //
  //  Износ вешается событием 'tool:used' {id, n} — его эмитят системы
  //  (craft.js после каждого изделия, actions.js мог бы после удара —
  //  пока слушаем 'ent:attack' от игрока сами). Поломка: cond<=0 ->
  //  предмет уничтожается, 'item:broken'.
  // ====================================================================

  /** Списать износ с записи (в equip или inv). Возвращает true если сломалось. */
  function wear(it, n) {
    if (!it || !it.id) return false;
    var def = defOf(it.id);
    if (!condEligible(def)) return false;
    if (typeof it.cond !== 'number') it.cond = 100;   // латаём старые сейвы
    it.cond = Math.round((it.cond - n) * 10) / 10;
    if (it.cond <= COND_BREAK) {
      breakItem(it);
      return true;
    }
    return false;
  }

  /** Предмет окончательно сломался. */
  function breakItem(it) {
    var p = P();
    if (!p) return;
    var name = nameOf(it.id);
    // из инвентаря
    if (p.inv) {
      var i = p.inv.indexOf(it);
      if (i >= 0) {
        p.inv.splice(i, 1);
        reportBroken(name);
        return;
      }
    }
    // из экипировки
    var eq = p.equip;
    if (eq) {
      for (var s in eq) {
        if (!eq.hasOwnProperty(s)) continue;
        if (eq[s] === it) {
          eq[s] = null;
          reportBroken(name);
          return;
        }
      }
    }
  }

  function reportBroken(name) {
    toast('Развалилось: ' + name, 'bad');
    if (WS.Fx && WS.Fx.text) {
      var p = P();
      if (p) {
        try { WS.Fx.text('✗ ' + name, p.x, p.y - 1.1, { col: '#c86a5a', life: 1.8 }); }
        catch (e) { /* пусто */ }
      }
    }
    if (WS.Snd && WS.Snd.play) {
      try { WS.Snd.play('window_break', 0.3); } catch (e2) { /* пусто */ }
    }
    changed();
    try { WS.Ev.emit('item:broken', { name: name }); } catch (e3) { /* пусто */ }
  }

  /**
   * Обработчик 'tool:used' {id, n}: ищем предмет id (сначала в руках и
   * надетым — изнашивается то, чем работают), списываем cond.
   */
  function onToolUsed(d) {
    var p = P();
    if (!p) return;
    var id = d && d.id;
    if (!id) return;
    var n = (typeof d.n === 'number' && d.n > 0) ? d.n : WEAR_DEFAULT;

    var order = [];
    if (p.equip) {
      order.push(p.equip.hand1, p.equip.hand2, p.equip.hands, p.equip.back,
                 p.equip.head, p.equip.torso, p.equip.legs, p.equip.feet);
    }
    var i;
    for (i = 0; i < order.length; i++) {
      if (order[i] && order[i].id === id) {
        wear(order[i], n);
        return;
      }
    }
    if (p.inv) {
      for (i = 0; i < p.inv.length; i++) {
        if (p.inv[i] && p.inv[i].id === id) {
          wear(p.inv[i], n);
          return;
        }
      }
    }
  }

  /** Износ оружия игрока при ударе (событие 'ent:attack', src — игрок). */
  function onEntAttack(d) {
    var p = P();
    if (!p || !d || d.src !== p) return;
    var slot = p.equip && p.equip.hand1;
    if (!slot || !slot.id) return;                 // кулаки не изнашиваются
    var def = defOf(slot.id);
    if (!def || def.ranged) return;                // огнестрел — при выстреле (не наш тик)
    if (def.dmg > 0 || HAND_CATS.indexOf(def.cat) >= 0) {
      wear(slot, WEAR_PER_HIT);
    }
  }

  /**
   * ПУБЛИЧНО: что нужно для починки? target: имя слота экипировки
   * ('hand1', 'torso'...) или индекс в инвентаре (число).
   * Возвращает {ok, reason?, kind: 'edge'|'sew', tool, material?}.
   */
  function repairInfo(target) {
    var p = P();
    if (!p) return { ok: false, reason: 'нет партии' };
    var it = null;
    if (typeof target === 'string') {
      it = equipped(target);
      if (!it) return { ok: false, reason: 'слот пуст' };
    } else {
      it = p.inv && p.inv[target];
      if (!it || !it.id) return { ok: false, reason: 'слот пуст' };
    }
    var def = defOf(it.id);
    if (!def) return { ok: false, reason: 'неизвестный предмет' };
    if (!condEligible(def)) return { ok: false, reason: 'это не изнашивается' };
    if (typeof it.cond === 'number' && it.cond >= 100) {
      return { ok: false, reason: 'целое' };
    }

    // одежда штопается иглой и ниткой
    if (def.slots && def.cat === 'cloth') {
      if (!has('sewing_kit')) {
        return { ok: false, reason: 'нужен швейный набор', kind: 'sew' };
      }
      if (!has('linen_sheet') && count('cloth_rag') < 2) {
        return { ok: false, reason: 'нужен лён или 2 тряпки', kind: 'sew' };
      }
      return { ok: true, kind: 'sew', tool: 'sewing_kit',
               material: has('linen_sheet') ? 'linen_sheet' : 'cloth_rag' };
    }

    // лезвия точатся бруском
    var edge = (def.dmg > 0) &&
      (!def.tags || def.tags.indexOf('chopping') >= 0 ||
       def.tags.indexOf('cutting') >= 0 || def.tags.indexOf('skinning') >= 0 ||
       def.cat === 'weapon' || def.cat === 'tool');
    if (edge) {
      if (!has('whetstone')) {
        return { ok: false, reason: 'нужен брусок', kind: 'edge' };
      }
      return { ok: true, kind: 'edge', tool: 'whetstone' };
    }

    // молотки/напильники в поле не чинятся
    return { ok: false, reason: 'в поле не починить (нужна кузница)' };
  }

  /**
   * ПУБЛИЧНО: починить предмет. target: слот экипировки | индекс инвентаря.
   * Одежда — швейным набором (+лён/тряпки), лезвия — бруском.
   * Возвращает {ok, cond, restored} | {ok:false, reason}.
   */
  function repair(target) {
    var p = P();
    if (!p) return { ok: false, reason: 'нет партии' };
    var info = repairInfo(target);
    if (!info.ok) return info;

    var it = (typeof target === 'string') ? equipped(target) : p.inv[target];
    if (!it) return { ok: false, reason: 'слот пуст' };
    var def = defOf(it.id);
    if (typeof it.cond !== 'number') it.cond = 100;   // латаём старое
    var before = it.cond;

    if (info.kind === 'sew') {
      var lv = (p.skills && p.skills.tailor) ? (p.skills.tailor.lv || 0) : 0;
      take(info.material, info.material === 'cloth_rag' ? 2 : 1);
      it.cond = clamp(Math.round(it.cond + REPAIR_SEW_PLUS + lv * REPAIR_SEW_PER_LV), 0, 100);
      onToolUsed({ id: 'sewing_kit', n: 2 });        // игла тупится
    } else {
      it.cond = clamp(Math.round(it.cond + REPAIR_EDGE_PLUS), 0, 100);
      onToolUsed({ id: 'whetstone', n: 1 });         // брусок стирается
    }

    var restored = it.cond - before;
    changed();
    try { WS.Ev.emit('item:repaired', { id: it.id, cond: it.cond }); } catch (e) { /* пусто */ }
    if (WS.Fx && WS.Fx.text && p) {
      try { WS.Fx.text('Починено: +' + restored + '%', p.x, p.y - 1.1, { col: '#7ea36a', life: 1.4 }); }
      catch (e2) { /* пусто */ }
    }
    if (WS.Snd && WS.Snd.play) {
      try { WS.Snd.play('craft', 0.35); } catch (e3) { /* пусто */ }
    }
    return { ok: true, cond: it.cond, restored: restored };
  }

  // ====================================================================
  //  СВЕЖЕСТЬ ЕДЫ
  //  Портящаяся еда (def.per > 0) хранит возраст в slot.data.age (дни).
  //  Каждый рассвет ('time:day') возраст +1. age > per — испортилось:
  //  needs.js при еде даёт отравление, snapshot помечает слот.
  // ====================================================================

  /** ПУБЛИЧНО: возраст стопки (дни). */
  function age(index) {
    var p = P();
    if (!p || !p.inv) return 0;
    return ageOf(p.inv[index]);
  }

  /** ПУБЛИЧНО: испорчена ли еда в слоте инвентаря. */
  function isSpoiled(index) {
    var p = P();
    if (!p || !p.inv) return false;
    return spoiled(p.inv[index]);
  }

  /**
   * ПУБЛИЧНО: сколько осталось дней до порчи (0 — уже испорчено,
   * -1 — не портится).
   */
  function daysLeft(index) {
    var p = P();
    if (!p || !p.inv) return -1;
    var it = p.inv[index];
    var def = it ? defOf(it.id) : null;
    if (!perishable(def)) return -1;
    return def.per - ageOf(it);
  }

  /** Рассвет: состарить всю скоропортящуюся еду в сумке. */
  function onDay() {
    var p = P();
    if (!p || !p.inv || !p.inv.length) return;
    var spoiledNow = [];
    var touched = false;
    for (var i = 0; i < p.inv.length; i++) {
      var it = p.inv[i];
      if (!it || !it.id) continue;
      var def = defOf(it.id);
      if (!perishable(def)) continue;
      var was = ageOf(it);
      var now = was + 1;
      if (!it.data) it.data = {};
      it.data.age = now;
      touched = true;
      if (was <= def.per && now > def.per) {
        spoiledNow.push(nameOf(it.id));
      }
    }
    if (touched) {
      changed();
      for (var k = 0; k < spoiledNow.length && k < 3; k++) {
        toast('Испортилось: ' + spoiledNow[k], 'warn');
      }
      if (spoiledNow.length > 3) {
        toast('Испортилось ещё ' + (spoiledNow.length - 3) + ' наименований', 'warn');
      }
    }
  }

  // ====================================================================
  //  SNAPSHOT ДЛЯ ЭКРАНА UI
  //  WS.Inv.snapshot() -> {
  //    slots: [{i, id, count, w, cat, name, stackMax, cond, per, age,
  //             spoiled, equipTo}],         — эквивалентно index
  //    equip:  {head: {id, name, cond} | null, ...},
  //    weight, maxWeight, overload
  //  }
  // ====================================================================

  /** Краткое описание одного слота инвентаря. */
  function slotInfo(it, i) {
    if (!it || !it.id) return null;
    var def = defOf(it.id);
    var c = countOf(it);
    var info = {
      i: i,
      id: it.id,
      count: c,
      w: def ? Math.round(((typeof def.w === 'number' ? def.w : 0) * c) * 100) / 100 : 0,
      cat: def ? def.cat : 'misc',
      name: nameOf(it.id),
      stackMax: def ? stackMax(def) : 1,
      cond: (typeof it.cond === 'number') ? Math.round(it.cond) : null,
      per: (def && def.per) || 0,
      age: ageOf(it),
      spoiled: spoiled(it)
    };
    // куда можно надеть (подсказка UI)
    if (def && def.slots && def.slots.length) info.equipTo = def.slots.slice(0);
    else if (def && handable(def)) info.equipTo = ['hand1', 'hand2'];
    return info;
  }

  /** Краткое описание слота экипировки. */
  function equipInfo(it) {
    if (!it || !it.id) return null;
    var def = defOf(it.id);
    return {
      id: it.id,
      name: nameOf(it.id),
      cond: (typeof it.cond === 'number') ? Math.round(it.cond) : null,
      warm: def ? (def.warm || 0) : 0,
      def: def ? (def.def || 0) : 0,
      twoHand: !!(def && def.twoHand)
    };
  }

  /** ПУБЛИЧНО: снимок инвентаря для UI (строю экран из этого). */
  function snapshot() {
    var p = P();
    if (!p) return { slots: [], equip: {}, weight: 0, maxWeight: WEIGHT_BASE, overload: 0 };
    if (!p.inv) p.inv = [];
    ensureEquip(p);

    var slots = [];
    for (var i = 0; i < p.inv.length; i++) {
      var info = slotInfo(p.inv[i], i);
      if (info) slots.push(info);
    }
    var eq = {};
    for (var s in p.equip) {
      if (!p.equip.hasOwnProperty(s)) continue;
      eq[s] = equipInfo(p.equip[s]);
    }
    return {
      slots: slots,
      equip: eq,
      weight: weight(),
      maxWeight: maxWeight(),
      overload: overload()
    };
  }

  // ====================================================================
  //  НОРМАЛИЗАЦИЯ (старые сейвы / старт партии)
  //  Проставляет cond/возраст, чистит пустые записи, выравнивает equip.
  // ====================================================================

  function normalize() {
    var p = P();
    if (!p) return;
    if (!p.inv) p.inv = [];
    ensureEquip(p);

    var i;
    for (i = p.inv.length - 1; i >= 0; i--) {
      var it = p.inv[i];
      if (!it || !it.id || countOf(it) <= 0) {
        p.inv.splice(i, 1);
        continue;
      }
      var def = defOf(it.id);
      if (!def) continue;                       // неизвестное не трогаем
      if (condEligible(def) && typeof it.cond !== 'number') it.cond = 100;
      if (perishable(def) && !(it.data && typeof it.data.age === 'number')) {
        it.data = { age: 0 };
      }
    }
    // экипировка: только живые ссылки
    for (var s in p.equip) {
      if (!p.equip.hasOwnProperty(s)) continue;
      var e = p.equip[s];
      if (e && (!e.id || countOf(e) <= 0)) p.equip[s] = null;
    }
    applyOverload();
  }

  // ====================================================================
  //  ТИК (приоритет 41): страховка перевеса + чистота данных.
  //  Основная работа — по событиям (inv:changed / time:day).
  // ====================================================================

  var recheckT = 0;

  function invTick(dt) {
    var g = WS.G;
    if (!g || !g.running || g.dead) return;
    recheckT -= dt;
    if (recheckT > 0) return;
    recheckT = OVERLOAD_RECHECK_S;
    try {
      applyOverload();
    } catch (e) {
      WS.err('invTick:', e && e.message);
    }
  }

  // ====================================================================
  //  САМОТЕСТ (консоль разработчика: WS.Inv.selftest())
  // ====================================================================

  function selftest() {
    var out = [];
    var pass = 0, fail = 0;
    function ok(name, cond) {
      if (cond) { pass++; out.push('  ok   ' + name); }
      else { fail++; out.push('  FAIL ' + name); }
      return !!cond;
    }

    ok('модуль зарегистрирован', !!WS.Inv);
    ok('базовый вес 30', WEIGHT_BASE === 30);
    ok('give/take/count есть', typeof give === 'function' && typeof take === 'function');

    var p = P();
    if (p) {
      // круговорот предмета
      var before = count('nails');
      give('nails', 5);
      ok('give(nails) кладётся', count('nails') === before + 5);
      ok('has(nails, 5)', has('nails', 5));
      take('nails', 5);
      ok('take(nails) списывает', count('nails') === before);
      // вес
      ok('weight() число', typeof weight() === 'number');
      ok('maxWeight() >= 30', maxWeight() >= 30);
      ok('snapshot() с полями', !!(snapshot() && snapshot().slots && typeof snapshot().maxWeight === 'number'));
      // свежесть/износ отражаются в snapshot
      ok('overload() 0..2', overload() >= 0 && overload() <= 2);
    }
    out.unshift('inv.selftest: ' + pass + ' ок, ' + fail + ' провалено');
    return out;
  }

  // ====================================================================
  //  ПУБЛИЧНЫЙ API
  // ====================================================================

  var Inv = {
    // --- базовое (мосты needs/fire/looting зовут именно это) ---
    give: give,
    consume: consume,          // = take
    take: take,
    count: count,
    countItem: countItem,      // = count
    has: has,
    hasAll: hasAll,
    takeAll: takeAll,
    findItem: findItem,

    // --- вес ---
    weight: weight,
    maxWeight: maxWeight,
    overload: overload,

    // --- слоты ---
    swap: swap,
    split: split,
    drop: drop,
    sort: sort,
    compact: compact,

    // --- экипировка ---
    equip: equip,
    unequip: unequip,
    equipped: equipped,
    equipDef: equipDef,
    warmTotal: warmTotal,
    windTotal: windTotal,
    defTotal: defTotal,

    // --- износ и починка ---
    repair: repair,
    repairInfo: repairInfo,
    wear: wear,                 // ручной износ записи

    // --- свежесть ---
    age: age,
    daysLeft: daysLeft,
    isSpoiled: isSpoiled,

    // --- UI ---
    snapshot: snapshot,
    nameOf: nameOf,
    normalize: normalize,

    // --- константы для UI ---
    SLOTS: SLOTS,
    CLOTH_SLOTS: CLOTH_SLOTS,

    selftest: selftest
  };

  WS.def('Inv', Inv);

  // ====================================================================
  //  BOOT
  // ====================================================================

  WS.boot(function initInv() {
    // свежесть: каждый игровой день
    WS.Ev.on('time:day', onDay);

    // износ инструментов (эмитят системы; craft.js — после каждого изделия)
    WS.Ev.on('tool:used', onToolUsed);

    // износ оружия при ударах игрока
    WS.Ev.on('ent:attack', onEntAttack);

    // старт/загрузка: причесать старые данные
    WS.Ev.on('game:start', normalize);
    WS.Ev.on('game:load', normalize);

    // страховочный тик (перевес после чужих правок инвентаря)
    WS.tick(TICK_PRI, invTick, 'sys:inv');

    WS.log('inv: инвентарь зарегистрирован (тик ' + TICK_PRI + ')');
  }, 'inv:init');

})();
