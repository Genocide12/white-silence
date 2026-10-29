/**
 * cooking.js — СТРЯПНЯ С КАЧЕСТВОМ (модуль H1): расширенная готовка поверх
 * рецептов data/recipes_cook.js. Качество блюда 0..100 складывается из навыка
 * cook, свежести ингредиентов, станции (печь +15) и «окна готовности»
 * (70..100% прогресса); передержка сверх 130% сжигает стряпню в burnt_food.
 * Качество хранится в слоте предмета (data.q), применяется при еде через
 * обёртку WS.Needs.eat и событие 'item:eaten' (cal × (0.7 + q/100 × 0.6),
 * при q<30 — риск отравления 20%, при q>85 — sanity +5 «Восхитительно!»).
 * Тик 43 (системы, после craft 42 — руки заняты крафтом).
 * Связи: WS.Craft (станции/инструменты), WS.Fire (очаг горит), WS.Inv
 * (списание/выдача), WS.Needs (еда), WS.Skills (опыт cook), WS.Temp
 * (горячая еда греет), WS.Fx/WS.Snd/WS.Ui (подача).
 */
(function () {
  'use strict';

  // ====================================================================
  //  НАСТРОЙКИ
  // ====================================================================

  var TICK_PRI = 43;             // приоритет тика (после craft: 42)

  /** Единица времени рецепта -> игровые минуты (recipe.time 10 = 30 мин). */
  var TIME_SCALE = 3;
  var DUR_MIN = 20;              // короткая стряпня всё равно небыстрая
  var DUR_MAX = 90;              // длинная (холодец, копчение) — полтора часа

  /** Окно готовности: забрал в [0.7..1.0] — качественно. */
  var WINDOW_LO = 0.7;
  var WINDOW_HI = 1.0;
  var BURN_AT = 1.3;             // прогресс свыше — стряпня сгорела

  /** Слагаемые базового качества. */
  var Q_BASE = 42;               // ровные руки, ничем не примечательные
  var Q_PER_LV = 5;              // за уровень навыка cook (макс +50)
  var Q_STOVE = 15;              // печь лучше костра
  var Q_FRESH_MAX = 15;          // идеально свежие ингредиенты
  var Q_STALE = 25;              // штраф за лежалые (пропорционально)
  var Q_JITTER = 4;              // руки дрожат: ±4

  /** Модификаторы времени. */
  var Q_UNDERRUN = 25;           // снял раньше 70% — полусырое
  var Q_WINDOW_MIN = 5;          // взял в начале окна
  var Q_WINDOW_MAX = 20;         // взял точно вовремя
  var Q_BURN_PER_PCT = 1.2;      // минус за каждый % передержки (100..130%)

  /** Эффекты качества при еде. */
  var CAL_FLOOR = 0.7;           // cal × (0.7 + q/100 × 0.6)
  var CAL_SPAN = 0.6;
  var SICK_Q = 30;               // ниже — 20% отравления
  var SICK_CHANCE = 20;
  var SANITY_Q = 85;            // выше — sanity +5 «Восхитительно!»
  var SANITY_TOP = 5;

  /** Пространство у станции. */
  var STATION_R = 2.0;           // дальше — стряпня стоит (пауза)
  var COLLECT_R = 2.0;           // забрать блюдо можно в этом радиусе

  /** Кэш качества слотов (для фолбэка, если хук eat не встал). */
  var QCACHE_EVERY = 0.7;       // реальных секунд между сканами

  /** Эффекты над станцией. */
  var FX_SPARK_EVERY = 1.1;
  var FX_SMOKE_EVERY = 2.3;

  // ====================================================================
  //  СОСТОЯНИЕ МОДУЛЯ (вне WS.G — в сейв не попадает;
  //  сам прогресс живёт в G.player.cook2 — простые поля)
  // ====================================================================

  var sysTime = 0;              // наработанное время, реальных сек
  var qCache = {};              // id -> качество последнего замеченного слота
  var qCacheT = 0;              // таймер пересборки кэша
  var eatHooked = false;        // обёртка WS.Needs.eat установлена
  var fxT = 0;                  // общий таймер эффектов над станцией

  // русский словарь системных строк (i18n перехватит, если подтянется)
  var RU = {
    'cook.started': 'Стряпня начата: {name}',
    'cook.needs_station': 'Нужна станция: {name}',
    'cook.needs_fire': 'Нужен горящий очаг поблизости',
    'cook.no_ingredients': 'Не хватает ингредиентов',
    'cook.no_tools': 'Не хватает утвари: {name}',
    'cook.hands_busy': 'Руки заняты',
    'cook.busy': 'Уже стряпается другое блюдо',
    'cook.away': 'Стряпня ждёт: вернитесь к очагу',
    'cook.almost': 'Почти готово — не прозевайте!',
    'cook.ready': 'Блюдо готово: [E] — забрать',
    'cook.done': 'Готово: {name} — качество {q}',
    'cook.burnt': 'Стряпня сгорела дотла...',
    'cook.collected_far': 'Подойдите к очагу за блюдом',
    'cook.cancelled': 'Стряпня брошена',
    'cook.delicious': 'Восхитительно!',
    'cook.ate.q': '{name}: «{label}» (качество {q})',
    'cook.q.great': 'Дымится, аппетитно',
    'cook.q.ok': 'Сойдёт',
    'cook.q.bad': 'Подгорело'
  };

  function T(key, fallback) {
    if (WS.I18N && WS.I18N.t) {
      try {
        var s = WS.I18N.t(key);
        if (s && s !== key) return s;
      } catch (e) { /* литерал ниже */ }
    }
    return fallback || key;
  }

  function subst(str, params) {
    if (!params) return str;
    return String(str).replace(/\{([a-zA-Z0-9_]+)\}/g, function (all, k) {
      return (params[k] != null) ? String(params[k]) : all;
    });
  }

  // ====================================================================
  //  МАЛЫЕ УТИЛИТЫ (паттерны fire.js / needs.js)
  // ====================================================================

  function G() { return WS.G || null; }
  function P() { var g = WS.G; return (g && g.player) || null; }
  function W() { return WS.World || null; }

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function rnd(lo, hi) { return lo + Math.random() * (hi - lo); }

  /** Игровые минуты за кадр. */
  function gMin(dt) {
    var sp = (WS.Loop && WS.Loop.speed) ? WS.Loop.speed : 1;
    if (sp < 1) sp = 1;
    var ts = (WS.Time && WS.Time.timeScale) ? WS.Time.timeScale() : 1;
    return dt * sp * ts;
  }

  /** Реальные секунды за кадр. */
  function rSec(dt) {
    var sp = (WS.Loop && WS.Loop.speed) ? WS.Loop.speed : 1;
    if (sp < 1) sp = 1;
    return dt * sp;
  }

  function toast(text, kind) {
    try {
      if (WS.Ui && WS.Ui.toast) { WS.Ui.toast(text, kind || 'info'); return; }
    } catch (e) { /* ниже — текстом */ }
    var p = P();
    if (WS.Fx && WS.Fx.text && p) {
      try { WS.Fx.text(text, p.x, p.y - 1.2, { col: '#e8b46a', size: 13, life: 2.4 }); }
      catch (e2) { /* пусто */ }
    }
  }

  function snd(name, x, y, vol) {
    if (!WS.Snd || !WS.Snd.play) return;
    try { WS.Snd.play(name, { x: x || 0, y: y || 0, vol: vol !== undefined ? vol : 0.7 }); }
    catch (e) { /* тишина */ }
  }

  // --- мост к инвентарю ---
  function inv() {
    if (WS.Inv && WS.Inv.give && WS.Inv.consume) return WS.Inv;
    if (WS.Action && WS.Action.give && WS.Action.consume) return WS.Action;
    return null;
  }
  function invCount(id) { var I = inv(); return I ? (I.countItem(id) || I.count(id) || 0) : 0; }
  function invConsume(id, n) { var I = inv(); return I ? (I.consume(id, n || 1) || 0) : 0; }
  function invGive(id, n) { var I = inv(); return I ? (I.give(id, n || 1) || 0) : 0; }

  function defOf(id) {
    return (WS.Data && WS.Data.items && WS.Data.items[id]) || null;
  }

  function recipeOf(id) {
    if (WS.Data && WS.Data.recipesById) return WS.Data.recipesById[id] || null;
    return null;
  }

  /** Человекочитаемое имя предмета: I18N -> литерал -> id. */
  function itemName(id) {
    if (WS.I18N && WS.I18N.t) {
      try {
        var s = WS.I18N.t('item.' + id + '.name');
        if (s && s !== 'item.' + id + '.name') return s;
      } catch (e) { /* литерал ниже */ }
    }
    if (WS.Inv && WS.Inv.nameOf) {
      try { return WS.Inv.nameOf(id); } catch (e2) { /* пусто */ }
    }
    return id;
  }

  /** Имя рецепта. */
  function recipeName(r) {
    if (!r) return '?';
    if (WS.I18N && WS.I18N.t) {
      try {
        var s = WS.I18N.t('recipe.' + r.id + '.name');
        if (s && s !== 'recipe.' + r.id + '.name') return s;
      } catch (e) { /* имя из данных */ }
    }
    return r.name || r.id;
  }

  // ====================================================================
  //  СТАНЦИИ
  //  Печь и костёр должны ГОРЕТЬ (паттерн craft.js). Холодные заготовки
  //  (station null) стряпаются где угодно — соль и руки.
  // ====================================================================

  var STATION_NAME = { fire: 'костёр', stove: 'печь' };

  /** Карта станций рядом (делегируем craft.js, есть свой фолбэк). */
  function stationsNear() {
    if (WS.Craft && WS.Craft.stationsNear) {
      try { return WS.Craft.stationsNear(); } catch (e) { /* ниже */ }
    }
    var out = { fire: null, stove: null, workbench: null, anvil: null, forge: null, objects: [] };
    var p = P();
    var w = W();
    if (!p || !w || !w.query) return out;
    var list;
    try { list = w.query(p.x - 2, p.y - 2, p.x + 2, p.y + 2); } catch (e2) { list = []; }
    for (var i = 0; i < list.length; i++) {
      var o = list[i];
      if (!o || o.hp) continue;
      var spr = String(o.sprName || '');
      var st = (spr === 'campfire') ? 'fire'
             : (spr === 'pech' || spr === 'stove_iron') ? 'stove' : null;
      if (!st) continue;
      if (WS.M.dist(p.x, p.y, o.x, o.y) > 2.5) continue;
      // очаг должен гореть (реестр fire.js)
      var lit = false;
      if (WS.Fire && WS.Fire.fires) {
        var arr = WS.Fire.fires();
        for (var k = 0; k < arr.length; k++) {
          if (!arr[k].out && arr[k].objId === o.id) { lit = true; break; }
        }
      }
      if (!lit) lit = !!(o.fireData && o.fireData.fuel > 0) || !!o.fire;
      if (!lit) continue;
      if (!out[st]) out[st] = o;
    }
    // горящая печь — тоже огонь
    if (out.stove && !out.fire) out.fire = out.stove;
    return out;
  }

  /**
   * Станция под конкретный рецепт.
   * Возвращает {kind: 'fire'|'stove'|'none', x, y} или null.
   * Для 'fire' печь считается очагом (варить у печи можно).
   */
  function stationFor(r) {
    var st = stationsNear();
    if (r.station === 'stove') {
      if (!st.stove) return null;
      return { kind: 'stove', x: st.stove.x, y: st.stove.y };
    }
    if (r.station === 'fire') {
      var o = st.fire || null;
      if (!o && WS.Fire && WS.Fire.near) {
        var p = P();
        var e = null;
        try { e = p ? WS.Fire.near(p.x, p.y, 2.5) : null; } catch (e2) { e = null; }
        if (e) return { kind: 'fire', x: e.x, y: e.y };
        return null;
      }
      if (!o) return null;
      var kind = (o === st.stove) ? 'stove' : 'fire';
      return { kind: kind, x: o.x, y: o.y };
    }
    // холодная заготовка: станция не нужна, но запомним место игрока
    var pl = P();
    return { kind: 'none', x: pl ? pl.x : 0, y: pl ? pl.y : 0 };
  }

  /** Горит ли ещё очаг в точке (для тика стряпни). */
  function stationLit(kind, x, y) {
    if (kind === 'none') return true;
    if (WS.Fire && WS.Fire.near) {
      try { return !!WS.Fire.near(x, y, 2.2); } catch (e) { return false; }
    }
    return true;   // без fire.js не мучаем игрока
  }

  /** Есть ли инструмент (в сумке или в руках). */
  function hasTool(id) {
    if (WS.Craft && WS.Craft.hasTool) {
      try { return WS.Craft.hasTool(id); } catch (e) { /* ниже */ }
    }
    if (invCount(id) > 0) return true;
    var p = P();
    if (p && p.equip) {
      if (p.equip.hand1 && p.equip.hand1.id === id) return true;
      if (p.equip.hand2 && p.equip.hand2.id === id) return true;
    }
    return false;
  }

  // ====================================================================
  //  КАЧЕСТВО БЛЮДА
  //  q = база (руки + навык + станция + свежесть) + время (окно).
  // ====================================================================

  /** Свежесть ингредиентов рецепта: 0 (лежалое) .. 1 (свежее). */
  function freshOf(r) {
    if (!r || !r.req || !r.req.length) return 1;
    var p = P();
    var sum = 0;
    var weight = 0;
    for (var i = 0; i < r.req.length; i++) {
      var req = r.req[i];
      var def = defOf(req.id);
      if (!def) continue;
      var w = req.n || 1;
      var f = 1;
      if (def.per && def.per > 0) {
        var age = 0;
        if (p && p.inv && WS.Inv && WS.Inv.findItem) {
          try {
            var slot = WS.Inv.findItem(req.id, 'inv');
            if (slot && slot.data && typeof slot.data.age === 'number') {
              age = slot.data.age;
            }
          } catch (e) { age = 0; }
        }
        f = clamp(1 - age / def.per, 0, 1);
      }
      sum += f * w;
      weight += w;
    }
    return weight ? (sum / weight) : 1;
  }

  /** Бонус свежести: -Q_STALE..+Q_FRESH_MAX. */
  function freshBonus(r) {
    var f = freshOf(r);
    return -Q_STALE + f * (Q_STALE + Q_FRESH_MAX);
  }

  /** Уровень навыка cook игрока. */
  function cookLv() {
    var p = P();
    if (!p || !p.skills || !p.skills.cook) return 0;
    return clamp(p.skills.cook.lv || 0, 0, 10);
  }

  /**
   * Базовое качество на момент начала стряпни (снимок — в p.cook2.q0):
   * свежесть фиксируется при раскладке, дальше решают руки и время.
   */
  function qBase(r, kind) {
    var q = Q_BASE
      + cookLv() * Q_PER_LV
      + (kind === 'stove' ? Q_STOVE : 0)
      + freshBonus(r)
      + rnd(-Q_JITTER, Q_JITTER);
    return Math.round(clamp(q, 5, 95));
  }

  /** Модификатор времени: прогресс p = t/dur. */
  function qTime(p) {
    if (p < WINDOW_LO) return -Q_UNDERRUN;                    // полусырое
    if (p <= WINDOW_HI) {
      // в окне: чем ближе к «готово», тем выше (5..20)
      var k = (p - WINDOW_LO) / (WINDOW_HI - WINDOW_LO);
      return Q_WINDOW_MIN + k * (Q_WINDOW_MAX - Q_WINDOW_MIN);
    }
    // передержка: -1.2 за каждый процент свыше 100%
    return -Math.round((p - WINDOW_HI) * 100 * Q_BURN_PER_PCT);
  }

  /** Итоговое качество (снимок базы + время). */
  function qFinal(q0, p) {
    return Math.round(clamp(q0 + qTime(p), 0, 100));
  }

  /** Ожидаемое качество рецепта «прямо сейчас» (для UI). */
  function qEstimate(recipeId) {
    var r = recipeOf(recipeId);
    if (!r) return 0;
    var kind = (r.station === 'stove') ? 'stove' : 'fire';
    if (!r.station) kind = 'none';
    return qBase(r, kind);
  }

  // ====================================================================
  //  ПОДПИСИ КАЧЕСТВА (при осмотре)
  // ====================================================================

  /** Короткая подпись: «Дымится, аппетитно» / «Сойдёт» / «Подгорело». */
  function qLabel(q) {
    if (q >= SANITY_Q) return T('cook.q.great', RU['cook.q.great']);
    if (q >= SICK_Q) return T('cook.q.ok', RU['cook.q.ok']);
    return T('cook.q.bad', RU['cook.q.bad']);
  }

  /** Качество слота предмета (или null, если не стряпали с качеством). */
  function slotQuality(id) {
    var p = P();
    if (!p || !WS.Inv || !WS.Inv.findItem) return null;
    try {
      var slot = WS.Inv.findItem(id, 'inv');
      if (slot && slot.data && typeof slot.data.q === 'number') {
        return Math.round(slot.data.q);
      }
    } catch (e) { /* пусто */ }
    return null;
  }

  /** Полная строка осмотра: «Щи — качество 91: „Дымится, аппетитно"». */
  function inspect(id) {
    var q = slotQuality(id);
    if (q === null) return null;
    return itemName(id) + ' — качество ' + q + ': «' + qLabel(q) + '»';
  }

  // ====================================================================
  //  ВЫДАЧА БЛЮДА С КАЧЕСТВОМ
  //  Качество живёт в slot.data.q; одинаковое (±2) стекуется вместе,
  //  разное — отдельными стопками. Возраст фиксируем нулевым: с огня —
  //  свежее (портиться начнёт с текущего дня по правилам inventory.js).
  // ====================================================================

  function giveQuality(id, n, q) {
    var p = P();
    if (!p) return 0;
    var def = defOf(id);
    if (!def) return 0;
    n = Math.max(1, Math.floor(n || 1));
    if (!p.inv) p.inv = [];
    var stack = def.stack || 1;
    var left = n;
    var added = 0;
    var i, it;

    if (stack > 1) {
      // --- досыпаем в стопку с тем же качеством и нулевым возрастом ---
      for (i = 0; i < p.inv.length && left > 0; i++) {
        it = p.inv[i];
        if (!it || it.id !== id) continue;
        var c = (typeof it.count === 'number') ? it.count : 1;
        if (c >= stack) continue;
        var iq = (it.data && typeof it.data.q === 'number') ? it.data.q : null;
        var iage = (it.data && typeof it.data.age === 'number') ? it.data.age : 0;
        if (iq === null || iage !== 0 || Math.abs(iq - q) > 2) continue;
        var add = Math.min(stack - c, left);
        it.count = c + add;
        left -= add;
        added += add;
      }
    }

    // --- новые записи ---
    while (left > 0) {
      var take = (stack > 1) ? Math.min(stack, left) : 1;
      var slot = { id: id, count: take, data: { q: Math.round(q), age: 0 } };
      if (def.per && def.per > 0) slot.data.age = 0;
      p.inv.push(slot);
      left -= take;
      added += take;
    }

    // уведомить UI (вес/список)
    try { WS.Ev.emit('inv:changed', {}); } catch (e2) { /* пусто */ }
    return added;
  }

  // ====================================================================
  //  СТРЯПНЯ: Cook.prepare(recipeId)
  //  Раскладывает ингредиенты на станцию, стартует таймер. Прогресс в
  //  G.player.cook2 = { rid, t, dur, kind, x, y, q0 } — простые поля,
  //  сейву не мешают; объект рецепта разрешаем по rid каждый тик.
  // ====================================================================

  /** Игровая длительность рецепта. */
  function durationOf(r) {
    return clamp(Math.round((r.time || 10) * TIME_SCALE), DUR_MIN, DUR_MAX);
  }

  /** Чужая работа руками? (крафт / простая готовка fire.js) */
  function handsBusy() {
    if (WS.Craft && WS.Craft.isCrafting) {
      try { if (WS.Craft.isCrafting()) return 'крафт'; } catch (e) { /* пусто */ }
    }
    if (WS.Fire && WS.Fire.isCooking) {
      try { if (WS.Fire.isCooking()) return 'костёр'; } catch (e2) { /* пусто */ }
    }
    return null;
  }

  /** ПУБЛИЧНО: начать стряпню. Возвращает {ok, reason?}. */
  function prepare(recipeId) {
    var g = G();
    var p = g && g.player;
    if (!p) return { ok: false, reason: 'нет партии' };
    if (!g.running || g.dead) return { ok: false, reason: 'не время' };
    if (p.sleeping) return { ok: false, reason: 'во сне не стряпают' };
    if (p.cook2) return { ok: false, reason: T('cook.busy', RU['cook.busy']) };

    var busy = handsBusy();
    if (busy) {
      toast(T('cook.hands_busy', RU['cook.hands_busy']) + ' (' + busy + ')', 'warn');
      return { ok: false, reason: 'руки заняты' };
    }

    var r = recipeOf(recipeId);
    if (!r) return { ok: false, reason: 'нет такого рецепта' };
    if (r.cat !== 'cook') return { ok: false, reason: 'это не стряпня' };

    // --- станция ---
    var st = stationFor(r);
    if (!st) {
      var needName = r.station ? (STATION_NAME[r.station] || r.station) : '';
      toast(subst(T('cook.needs_station', RU['cook.needs_station']), { name: needName }), 'warn');
      return { ok: false, reason: 'станция' };
    }
    // горячие рецепты требуют огонь (stationFor уже проверил горение);
    // холодным (station null) станция не нужна

    // --- ингредиенты ---
    var I = inv();
    if (I && I.hasAll) {
      var chk = I.hasAll(r.req);
      if (!chk || !chk.ok) {
        toast(T('cook.no_ingredients', RU['cook.no_ingredients']), 'warn');
        return { ok: false, reason: 'ингредиенты' };
      }
    } else {
      for (var i = 0; i < r.req.length; i++) {
        if (invCount(r.req[i].id) < (r.req[i].n || 1)) {
          toast(T('cook.no_ingredients', RU['cook.no_ingredients']), 'warn');
          return { ok: false, reason: 'ингредиенты' };
        }
      }
    }

    // --- утварь (pot_cast, cast_iron, нож...) ---
    for (var t = 0; t < r.tools.length; t++) {
      if (!hasTool(r.tools[t])) {
        toast(subst(T('cook.no_tools', RU['cook.no_tools']),
          { name: itemName(r.tools[t]) }), 'warn');
        return { ok: false, reason: 'утварь' };
      }
    }

    // --- навык: не запрет, а риск (как в craft.js) ---
    // (провал не портит блюдо целиком — просто низкое качество)

    // --- списание (атомарно) ---
    if (I && I.takeAll) {
      var paid = I.takeAll(r.req);
      if (!paid || !paid.ok) {
        toast(T('cook.no_ingredients', RU['cook.no_ingredients']), 'warn');
        return { ok: false, reason: 'ингредиенты' };
      }
    } else {
      for (var k = 0; k < r.req.length; k++) {
        invConsume(r.req[k].id, r.req[k].n || 1);
      }
    }

    // --- износ утвари (те же 2 деления, что в craft.js) ---
    for (t = 0; t < r.tools.length; t++) {
      try { WS.Ev.emit('tool:used', { id: r.tools[t], n: 2 }); } catch (e3) { /* пусто */ }
    }

    // --- снимок качества и запуск ---
    var dur = durationOf(r);
    p.cook2 = {
      rid: r.id,
      t: 0,
      dur: dur,
      kind: st.kind,
      x: st.x,
      y: st.y,
      q0: qBase(r, st.kind),
      readyTold: false,
      awayTold: false,
      windowTold: false
    };

    toast(subst(T('cook.started', RU['cook.started']), { name: recipeName(r) }), 'info');
    snd('craft', p.x, p.y, 0.4);
    // «раскладка»: щепоть искр над станцией
    fxLay(st.x, st.y);
    try { WS.Ev.emit('cook:started', { id: r.id, recipe: r }); } catch (e4) { /* пусто */ }
    return { ok: true, dur: dur, q0: p.cook2.q0 };
  }

  /** Искры «раскладки» продуктов на станцию. */
  function fxLay(x, y) {
    if (!WS.Fx || !WS.Fx.burst) return;
    try { WS.Fx.burst('spark', x, y - 0.2, 5); } catch (e) { /* пусто */ }
  }

  // ====================================================================
  //  ТИК СТЯПНИ
  //  Прогресс идёт, только пока игрок у очага и очаг горит. Жар над
  //  станцией (искры/дым), подсказки окна, авто-сгорание за 130%.
  // ====================================================================

  function cookTick(dt) {
    var g = G();
    if (!g || !g.running || g.dead) return;
    var p = g.player;
    if (!p || !p.cook2) return;

    var c2 = p.cook2;
    var r = recipeOf(c2.rid);
    if (!r) { p.cook2 = null; return; }              // рецепт исчез (не должен)

    // спящий не стряпает — блюдо стоит
    if (p.sleeping) return;

    // горячая стряпня: игрок должен стоять у очага; холодная заготовка
    // (засолка, квашение) зреет сама — ходить можно (квас не убежит)
    var dist = WS.M.dist(p.x, p.y, c2.x, c2.y);
    if (c2.kind !== 'none' && dist > STATION_R) {
      if (!c2.awayTold) {
        c2.awayTold = true;
        toast(T('cook.away', RU['cook.away']), 'warn');
      }
      return;                                        // пауза, время не идёт
    }
    c2.awayTold = false;

    // очаг должен гореть (для холодных заготовок — всегда «горит»)
    if (!stationLit(c2.kind, c2.x, c2.y)) {
      if (!c2.awayTold) {
        c2.awayTold = true;
        toast(T('cook.needs_fire', RU['cook.needs_fire']), 'warn');
      }
      return;
    }

    // время стряпни
    c2.t += gMin(dt);
    var prog = c2.t / c2.dur;

    // жар над станцией: искры да дымок
    fxT -= rSec(dt);
    if (fxT <= 0) {
      fxT = FX_SPARK_EVERY * rnd(0.7, 1.3);
      fxStation(c2.x, c2.y, c2.kind);
    }

    // подсказка: окно готовности открывается
    if (prog >= WINDOW_LO && !c2.windowTold) {
      c2.windowTold = true;
      toast(T('cook.almost', RU['cook.almost']), 'info');
    }

    // готово! ждём, пока заберут ([E] или Cook.collect())
    if (prog >= WINDOW_HI && !c2.readyTold) {
      c2.readyTold = true;
      toast(subst(T('cook.ready', RU['cook.ready']), { name: recipeName(r) }), 'good');
      snd('bell', c2.x, c2.y, 0.5);
      try { WS.Ev.emit('cook:ready', { id: r.id }); } catch (e) { /* пусто */ }
    }

    // передержали — сгорело (только у горячего очага)
    if (prog > BURN_AT && c2.kind !== 'none') {
      burnDish(p, c2, r);
      return;
    }

    // [E] у станции: забрать готовое (и недожаренное тоже можно)
    if (prog >= WINDOW_LO && WS.Input && WS.Input.hitCode) {
      var hit = false;
      try { hit = WS.Input.hitCode('KeyE'); } catch (e2) { hit = false; }
      if (hit && dist <= COLLECT_R) {
        collect();
      }
    }
  }

  /** Искры/дым над станцией, пока стряпня на огне. */
  function fxStation(x, y, kind) {
    if (!WS.Fx || !WS.Fx.spawn) return;
    try {
      WS.Fx.spawn('spark', x + rnd(-0.2, 0.2), y - 0.3 - rnd(0, 0.3),
        { z: 16, vy: -0.4, grav: -3, life: 0.5, size: 2 });
      if (Math.random() < 0.5) {
        WS.Fx.spawn('smoke', x + rnd(-0.15, 0.15), y - 0.5,
          { z: 22, vy: -0.25, grav: -1.5, life: 1.6, size: 3 });
      }
    } catch (e) { /* пусто */ }
  }

  /** Сгорело: блюдо превращается в уголёк (burnt_food, годен в топку). */
  function burnDish(p, c2, r) {
    p.cook2 = null;
    invGive('burnt_food', 1);
    if (WS.Fx && WS.Fx.burst) {
      try { WS.Fx.burst('smoke', c2.x, c2.y, 10); } catch (e) { /* пусто */ }
    }
    snd('fall', c2.x, c2.y, 0.6);
    toast(T('cook.burnt', RU['cook.burnt']), 'bad');
    try { WS.Ev.emit('cook:burnt', { id: r.id }); } catch (e2) { /* пусто */ }
  }

  // ====================================================================
  //  ЗАБРАТЬ БЛЮДО: Cook.collect()
  //  Качество = снимок базы + модификатор времени (см. qFinal).
  // ====================================================================

  function collect() {
    var g = G();
    var p = g && g.player;
    if (!p || !p.cook2) return { ok: false, reason: 'ничего не стряпается' };

    var c2 = p.cook2;
    var r = recipeOf(c2.rid);
    if (!r) { p.cook2 = null; return { ok: false, reason: 'рецепт потерян' }; }

    var dist = WS.M.dist(p.x, p.y, c2.x, c2.y);
    if (dist > COLLECT_R) {
      toast(T('cook.collected_far', RU['cook.collected_far']), 'warn');
      return { ok: false, reason: 'далеко' };
    }

    var prog = clamp(c2.t / c2.dur, 0, BURN_AT);
    var q = qFinal(c2.q0, prog);
    p.cook2 = null;

    // --- выдача: первое изделие — с качеством, остальное (тара) — как есть ---
    var firstFood = null;
    for (var i = 0; i < r.out.length; i++) {
      var o = r.out[i];
      var n = o.n || 1;
      if (i === 0) {
        var def = defOf(o.id);
        var isFood = def && (def.cat === 'food' || def.cat === 'drink');
        if (isFood) {
          firstFood = o.id;
          giveQuality(o.id, n, q);
        } else {
          invGive(o.id, n);
        }
      } else {
        invGive(o.id, n);
      }
    }

    // --- статистика и история (craft.js увидит «уже делали») ---
    if (g.stats) g.stats.mealsCooked = (g.stats.mealsCooked || 0) + 1;
    if (!p._crafted) p._crafted = {};
    p._crafted[r.id] = (p._crafted[r.id] || 0) + 1;

    // --- опыт стряпни: щедрее за высокое качество ---
    var xp = 10 + Math.round(q / 8);
    if (WS.Skills && WS.Skills.addXp) {
      try { WS.Skills.addXp('cook', xp, 'стряпня: ' + recipeName(r)); }
      catch (e) { /* без опыта обойдёмся */ }
    }

    // --- горячее греет изнутри (temperature.js, как fire.js) ---
    if (WS.Temp && WS.Temp.warmMeal && firstFood) {
      try { WS.Temp.warmMeal(60 + q * 0.4); } catch (e2) { /* пусто */ }
    }

    // --- подача ---
    var what = recipeName(r) + ' — качество ' + q;
    if (WS.Fx && WS.Fx.text) {
      try {
        WS.Fx.text('+ ' + what, c2.x, c2.y - 1.0, { col: '#e8c86a', life: 2.2, size: 13 });
      } catch (e3) { /* пусто */ }
    }
    snd('craft', p.x, p.y, 0.6);
    toast(subst(T('cook.done', RU['cook.done']), { name: recipeName(r), q: q }) +
      ' (' + qLabel(q) + ')', 'good');

    try { WS.Ev.emit('cook:done', { id: r.id, out: firstFood || r.out[0].id, q: q }); }
    catch (e4) { /* пусто */ }
    return { ok: true, q: q, out: firstFood };
  }

  /** ПУБЛИЧНО: бросить стряпню (ингредиенты уже в деле — пропали). */
  function cancel() {
    var p = P();
    if (!p || !p.cook2) return false;
    p.cook2 = null;
    toast(T('cook.cancelled', RU['cook.cancelled']), 'warn');
    return true;
  }

  // ====================================================================
  //  ИНТЕГРАЦИЯ С WS.Needs.eat
  //  Обёртка снимает качество слота ДО Consumption (needs.js ест событие
  //  'player:ate' уже после списания) и эмитит 'item:eaten' {id, q}.
  //  Слушатель 'item:eaten' применяет модификаторы ровно один раз
  //  (флаг d.applied) — событие можно звать и напрямую из других систем.
  // ====================================================================

  /** Применить модификаторы качества к съеденному блюду. */
  function applyQuality(id, q) {
    var p = P();
    if (!p || typeof q !== 'number') return;
    var def = defOf(id);
    if (!def) return;
    q = clamp(q, 0, 100);

    // калорийность: cal × (0.7 + q/100 × 0.6) — дельту добавляем к сытости
    if (def.cal && def.cal > 0) {
      var calEff = def.cal * (CAL_FLOOR + (q / 100) * CAL_SPAN);
      var delta = (calEff - def.cal) / 40;
      if (delta) {
        p.needs.hunger = clamp(p.needs.hunger + delta, 0, 100);
      }
    }

    // превосходное блюдо поднимает дух
    if (q > SANITY_Q) {
      p.needs.sanity = clamp(p.needs.sanity + SANITY_TOP, 0, 100);
      toast(T('cook.delicious', RU['cook.delicious']), 'good');
    }

    // скверная стряпня — 20% отравления
    if (q < SICK_Q && Math.random() * 100 < SICK_CHANCE) {
      if (WS.Needs && WS.Needs.makeSick) {
        try { WS.Needs.makeSick('food_poisoning'); } catch (e) { /* пусто */ }
      }
    }

    // строка качества при еде (подпись из ТЗ)
    var line = subst(RU['cook.ate.q'], {
      name: itemName(id), label: qLabel(q), q: q
    });
    if (q > SANITY_Q || q < SICK_Q) {
      if (WS.Fx && WS.Fx.text) {
        try { WS.Fx.text(line, p.x, p.y - 1.35, { col: '#b9a46a', size: 12, life: 1.8 }); }
        catch (e2) { /* пусто */ }
      }
    }
    try { WS.Ev.emit('cook:ate', { id: id, q: q }); } catch (e3) { /* пусто */ }
  }

  /** Слушатель 'item:eaten' {id, q, applied?} — единая точка модификаторов. */
  function onItemEaten(d) {
    if (!d || typeof d.q !== 'number' || d.applied) return;
    d.applied = true;
    applyQuality(d.id, d.q);
  }

  /** Фолбэк: needs.js съел блюдо мимо нашей обёртки — берём кэш качества. */
  function onPlayerAte(d) {
    if (eatHooked) return;                        // обёртка уже отработала
    if (!d || !d.id) return;
    var q = qCache[d.id];
    if (typeof q === 'number') {
      applyQuality(d.id, q);
    }
  }

  /** Установить обёртку WS.Needs.eat (однократно). */
  function hookEat() {
    if (eatHooked) return;
    var N = WS.Needs;
    if (!N || typeof N.eat !== 'function' || N.eat.__cookQ) return;
    var orig = N.eat;
    var wrapped = function (spec) {
      // качество слота читаем ДО того, как needs.js спишет предмет
      var id = (typeof spec === 'string') ? spec
             : (spec && spec.id) ? spec.id : null;
      var q = (id !== null) ? slotQuality(id) : null;
      var res = orig.apply(N, arguments);
      if (res && res.ok && q !== null) {
        try { WS.Ev.emit('item:eaten', { id: id, q: q }); } catch (e) { /* пусто */ }
      }
      return res;
    };
    wrapped.__cookQ = true;                       // защита от повторной обёртки
    N.eat = wrapped;
    eatHooked = true;
    WS.log('cooking: WS.Needs.eat обёрнут — качество блюд работает');
  }

  /** Пересобрать кэш качества слотов (для фолбэка onPlayerAte и UI). */
  function refreshQCache() {
    var p = P();
    qCache = {};
    if (!p || !p.inv) return;
    for (var i = 0; i < p.inv.length; i++) {
      var it = p.inv[i];
      if (!it || !it.id) continue;
      if (it.data && typeof it.data.q === 'number') {
        qCache[it.id] = Math.round(it.data.q);
      }
    }
  }

  // ====================================================================
  //  ОБЩИЙ ТИК МОДУЛЯ
  // ====================================================================

  function cookingTick(dt) {
    sysTime += dt;
    cookTick(dt);

    // кэш качества — нечасто, инвентарь маленький
    qCacheT -= dt;
    if (qCacheT <= 0) {
      qCacheT = QCACHE_EVERY;
      refreshQCache();
    }
  }

  // ====================================================================
  //  СТАРТ / ЗАГРУЗКА ПАРТИИ
  //  Незавершённая стряпня не переносится (ингредиенты были списаны) —
  //  как fire.js поступает с cookProgress.
  // ====================================================================

  function onGameReset() {
    var p = P();
    if (p) p.cook2 = null;
    qCache = {};
    qCacheT = 0;
    fxT = 0;
  }

  // ====================================================================
  //  САМОТЕСТ (консоль разработчика: WS.Cook.selftest())
  // ====================================================================

  function selftest() {
    var out = [];
    var pass = 0, fail = 0;
    function ok(name, cond) {
      if (cond) { pass++; out.push('  ok   ' + name); }
      else { fail++; out.push('  FAIL ' + name); }
      return !!cond;
    }

    ok('модуль зарегистрирован', !!WS.Cook);
    ok('хук eat установлен', eatHooked || !!(WS.Needs && WS.Needs.eat && WS.Needs.eat.__cookQ));
    ok('qLabel: верх', qLabel(90) === 'Дымится, аппетитно');
    ok('qLabel: середина', qLabel(50) === 'Сойдёт');
    ok('qLabel: низ', qLabel(10) === 'Подгорело');
    ok('качество в границах', (function () {
      for (var i = 0; i < 200; i++) {
        var q = qFinal(50, i / 100);
        if (q < 0 || q > 100) return false;
      }
      return true;
    })());
    ok('окно: сгорание: порог 130%', BURN_AT === 1.3);
    ok('формула калорий: q=50 -> x1.0', Math.abs((CAL_FLOOR + 0.5 * CAL_SPAN) - 1) < 1e-9);
    ok('формула калорий: q=100 -> x1.3', Math.abs((CAL_FLOOR + 1 * CAL_SPAN) - 1.3) < 1e-9);
    ok('формула калорий: q=0 -> x0.7', CAL_FLOOR === 0.7);
    ok('рецепты стряпни есть', (function () {
      var rs = (WS.Data && WS.Data.recipes) || [];
      var n = 0;
      for (var i = 0; i < rs.length; i++) {
        if (rs[i].id === 'shchi_fresh' || rs[i].id === 'ukha_double') n++;
      }
      return n >= 2;
    })());
    ok('burnt_food объявлен', !!(WS.Data && WS.Data.items && WS.Data.items.burnt_food));
    ok('pot_cast объявлен', !!(WS.Data && WS.Data.items && WS.Data.items.pot_cast));
    ok('inspect без качества -> null', inspect('bread') === null || typeof inspect('bread') === 'string');
    ok('qEstimate — число', typeof qEstimate('shchi_fresh') === 'number');
    ok('статус безопасен', status() === null || typeof status() === 'object');

    out.unshift('cook.selftest: ' + pass + ' ок, ' + fail + ' провалено');
    return out;
  }

  // ====================================================================
  //  СТАТУС ДЛЯ HUD/UI
  // ====================================================================

  /** Что сейчас на плите: {phase, id, name, t, dur, p, q0, kind} | null. */
  function status() {
    var p = P();
    if (!p || !p.cook2) return null;
    var c2 = p.cook2;
    var r = recipeOf(c2.rid);
    var prog = clamp(c2.t / c2.dur, 0, BURN_AT);
    var phase = (prog > BURN_AT) ? 'burnt'
              : (prog >= WINDOW_HI) ? 'ready'
              : (prog >= WINDOW_LO) ? 'window'
              : 'cooking';
    return {
      phase: phase,
      id: c2.rid,
      name: r ? recipeName(r) : c2.rid,
      t: Math.round(c2.t),
      dur: c2.dur,
      p: Math.round(prog * 100) / 100,
      q0: c2.q0,
      kind: c2.kind,
      x: c2.x,
      y: c2.y
    };
  }

  // ====================================================================
  //  ПУБЛИЧНЫЙ API
  // ====================================================================

  var Cook = {
    // --- стряпня ---
    prepare: prepare,
    collect: collect,
    cancel: cancel,
    status: status,
    isCooking: function () {
      var p = P();
      return !!(p && p.cook2);
    },

    // --- качество ---
    qEstimate: qEstimate,
    qLabel: qLabel,
    inspect: inspect,
    qualityOf: slotQuality,
    applyQuality: applyQuality,     // публично для других систем/тестов

    // --- данные для UI ---
    WINDOW: { lo: WINDOW_LO, hi: WINDOW_HI, burn: BURN_AT },
    giveQuality: giveQuality,

    // --- отладка ---
    selftest: selftest
  };

  WS.def('Cook', Cook);

  // ====================================================================
  //  ЛОКАЛИЗАЦИЯ (влить без перезаписи чужих ключей, паттерн items_cloth)
  // ====================================================================

  function applyRu() {
    try {
      WS.Data = WS.Data || {};
      WS.Data.locales = WS.Data.locales || {};
      var ru = WS.Data.locales.ru = WS.Data.locales.ru || {};
      for (var k in RU) {
        if (RU.hasOwnProperty(k) && !ru[k]) ru[k] = RU[k];
      }
    } catch (e) {
      WS.err('cooking: локализация не влита', e && e.message);
    }
  }

  // ====================================================================
  //  BOOT
  //  systems грузятся до needs.js по алфавиту (cooking < craft < ... <
  //  needs), но boot-колбэки выполняются после загрузки ВСЕХ файлов —
  //  к этому моменту WS.Needs уже определён, обёртка встанет сразу.
  // ====================================================================

  WS.boot(function initCooking() {
    // тик стряпни — приоритет 43 (после craft 42, до ai 50)
    WS.tick(TICK_PRI, cookingTick, 'sys:cooking');

    // интеграция с едой: обёртка + событие + фолбэк по 'player:ate'
    hookEat();
    WS.Ev.on('item:eaten', onItemEaten);
    WS.Ev.on('player:ate', onPlayerAte);

    // новая партия / загрузка: незавершённая стряпня сгорает
    WS.Ev.on('game:start', onGameReset);
    WS.Ev.on('game:load', onGameReset);

    // локализация (с страховками от подмены словаря i18n/ru.js)
    applyRu();
    WS.Ev.on('game:start', applyRu);
    WS.Ev.on('game:load', applyRu);
    if (WS.afterFirstFrame) WS.afterFirstFrame(applyRu);

    WS.log('cooking: стряпня с качеством зарегистрирована (тик ' + TICK_PRI + ')');
  }, 'cooking:init');

})();
