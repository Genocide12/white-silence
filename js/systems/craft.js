/**
 * craft.js — КРАФТ (модуль C1): поиск станций у игрока (костёр, печь,
 * верстак, наковальня, горн), список доступных рецептов с диагностикой
 * «почему нельзя», изготовление с прогрессом (паттерн looting.js),
 * шансом провала при низком навыке и износом инструментов.
 * Тик 42 (системы). Связи: data/recipes.js (WS.Data.recipes),
 * systems/inventory.js (WS.Inv: списание/выдача/износ), WS.Fire.near
 * (горит ли огонь), WS.Loot.dropItem (перегруз — на землю).
 */
(function () {
  'use strict';

  // ====================================================================
  //  НАСТРОЙКИ
  // ====================================================================

  var TICK_PRI = 42;            // приоритет тика (системы)

  /** Радиус поиска станций вокруг игрока, тайлы. */
  var STATION_R = 2.0;

  /** Спрайт объекта -> станция (campfire_out сознательно нет: погас). */
  var STATION_SPR = {
    campfire: 'fire',
    pech: 'stove',
    stove_iron: 'stove',
    workbench: 'workbench',
    anvil: 'anvil',
    forge: 'forge'
  };

  /** Русские имена станций (для тостов и UI). */
  var STATION_NAME = {
    fire: 'костёр',
    stove: 'печь',
    workbench: 'верстак',
    anvil: 'наковальня',
    forge: 'горн'
  };

  /** Русские имена навыков. */
  var SKILL_NAME = {
    axe: 'работа топором', melee: 'драка', firearm: 'стрельба',
    sneak: 'крадучесть', run: 'бег', cook: 'готовка',
    carpentry: 'столярное дело', tailor: 'портняжное дело',
    medic: 'медицина', forage: 'сбор', track: 'следопыт',
    survive: 'выживание'
  };

  /** Опыт: за изделие, за неудачу, цена уровня навыка. */
  var XP_CRAFT = 10;
  var XP_FAIL = 3;
  var XP_PER_LV = 30;

  /**
   * Провал без нужного навыка: 25% базово, +15% за каждый недостающий
   * уровень, потолок 75%. При провале сгорает один ингредиент (по ТЗ).
   */
  var FAIL_BASE = 25;
  var FAIL_PER_LV = 15;
  var FAIL_MAX = 75;

  /** Износ инструмента за одно изделие (через 'tool:used' -> WS.Inv). */
  var TOOL_WEAR = 2;

  // ====================================================================
  //  ХЕЛПЕРЫ
  // ====================================================================

  function G() { return WS.G; }

  function P() {
    var g = WS.G;
    return (g && g.player) ? g.player : null;
  }

  function defOf(id) {
    return (WS.Data && WS.Data.items && WS.Data.items[id]) || null;
  }

  function recipes() {
    return (WS.Data && WS.Data.recipes) || [];
  }

  function recipe(id) {
    return (WS.Data && WS.Data.recipesById && WS.Data.recipesById[id]) || null;
  }

  function clamp(v, a, b) {
    if (v < a) return a;
    if (v > b) return b;
    return v;
  }

  function nameOf(id) {
    if (WS.Inv && WS.Inv.nameOf) return WS.Inv.nameOf(id);
    return id;
  }

  function toast(text, kind) {
    if (WS.Ui && WS.Ui.toast) {
      try { WS.Ui.toast(text, kind || 'info'); return; } catch (e) { /* ниже */ }
    }
    try { WS.Ev.emit('ui:toast', { text: text, kind: kind || 'info' }); } catch (e2) { /* пусто */ }
  }

  /** Уровень навыка игрока (0, если навыка нет). */
  function skillLv(id) {
    var p = P();
    if (!p || !p.skills || !p.skills[id]) return 0;
    return p.skills[id].lv || 0;
  }

  /** Уровень навыка + опыт в тексте (для UI карточки). */
  function skillInfo(id) {
    var p = P();
    if (!p || !p.skills || !p.skills[id]) return { lv: 0, xp: 0 };
    return { lv: p.skills[id].lv || 0, xp: p.skills[id].xp || 0 };
  }

  // ====================================================================
  //  ИНСТРУМЕНТЫ
  //  Инструмент — не расходник: он должен лежать в инвентаре ИЛИ быть
  //  в руках (hand1/hand2). Износ навешивает WS.Inv через 'tool:used'.
  // ====================================================================

  /** Есть ли инструмент (в сумке или в руках). */
  function hasTool(id) {
    var p = P();
    if (!p) return false;
    if (WS.Inv && WS.Inv.count) {
      if (WS.Inv.count(id) > 0) return true;
    }
    if (p.equip) {
      if (p.equip.hand1 && p.equip.hand1.id === id) return true;
      if (p.equip.hand2 && p.equip.hand2.id === id) return true;
    }
    return false;
  }

  /** Все ли инструменты рецепта на месте. */
  function toolsOk(r) {
    if (!r.tools || !r.tools.length) return true;
    for (var i = 0; i < r.tools.length; i++) {
      if (!hasTool(r.tools[i])) return false;
    }
    return true;
  }

  /** Отсутствующие инструменты (для карточки UI). */
  function toolsMissing(r) {
    var out = [];
    if (!r.tools) return out;
    for (var i = 0; i < r.tools.length; i++) {
      if (!hasTool(r.tools[i])) out.push(r.tools[i]);
    }
    return out;
  }

  /** Износ инструментов после начала работы. */
  function wearTools(r) {
    if (!r.tools || !r.tools.length) return;
    for (var i = 0; i < r.tools.length; i++) {
      try {
        WS.Ev.emit('tool:used', { id: r.tools[i], n: TOOL_WEAR });
      } catch (e) { /* пусто */ }
    }
  }

  // ====================================================================
  //  ИСТОРИЯ ИЗГОТОВЛЕНИЯ
  //  p._crafted = {recipeId: раз}. UI показывает «новое» изделие,
  //  статистика — что руках уже лежало. Поле простое — сейву не мешает.
  // ====================================================================

  /** Счётчик изготовлений рецепта (0 — ещё не делали). */
  function timesCrafted(id) {
    var p = P();
    if (!p || !p._crafted) return 0;
    return p._crafted[id] || 0;
  }

  /** Отметить успешное изготовление. */
  function markCrafted(id) {
    var p = P();
    if (!p) return;
    if (!p._crafted) p._crafted = {};
    p._crafted[id] = (p._crafted[id] || 0) + 1;
  }

  /** Рецепты, которые игрок уже изготавливал (id-шники). */
  function known() {
    var p = P();
    if (!p || !p._crafted) return [];
    var out = [];
    for (var k in p._crafted) {
      if (p._crafted.hasOwnProperty(k) && p._crafted[k] > 0) out.push(k);
    }
    return out;
  }

  // ====================================================================
  //  СТАНЦИИ
  //  Сканируем объекты в радиусе STATION_R тайлов. Костёр и печь должны
  //  ГОРЕТЬ (fire.js ставит fireData/огонь); верстак, наковальня и горн
  //  всегда готовы. Горящая печь заодно считается огнём (стряпня у печи).
  // ====================================================================

  /** Горит ли объект-очаг (костёр/печь) прямо сейчас. */
  function isLit(o) {
    if (!o) return false;
    // реестр огней B1 — самое точное
    if (WS.Fire && WS.Fire.near) {
      var arr = WS.Fire.fires ? WS.Fire.fires() : [];
      for (var i = 0; i < arr.length; i++) {
        if (!arr[i].out && arr[i].objId === o.id) return true;
      }
    }
    // фолбэк по полям объекта (fire.js пишет fireData)
    if (o.fireData && typeof o.fireData.fuel === 'number' && o.fireData.fuel > 0) return true;
    if (o.fire) return true;                    // топится (печь)
    return false;
  }

  /**
   * Все станции в радиусе игрока. Возвращает
   * { fire, stove, workbench, anvil, forge } — объект или null в каждом
   * поле, плюс список objects: [{station, o, dist}] для UI подсказки.
   */
  function stationsNear() {
    var p = P();
    var out = { fire: null, stove: null, workbench: null, anvil: null, forge: null, objects: [] };
    if (!p) return out;
    var w = WS.World;
    if (!w) return out;

    var list = [];
    var i, o;
    if (w.query) {
      try {
        list = w.query(p.x - STATION_R, p.y - STATION_R, p.x + STATION_R, p.y + STATION_R);
      } catch (e) { list = []; }
    } else if (w.objsAt) {
      // фолбэк: перебор соседних тайлов
      var tx = Math.floor(p.x), ty = Math.floor(p.y);
      for (var dx = -2; dx <= 2; dx++) {
        for (var dy = -2; dy <= 2; dy++) {
          var tile = w.objsAt(tx + dx, ty + dy);
          for (i = 0; i < tile.length; i++) list.push(tile[i]);
        }
      }
    }

    for (i = 0; i < list.length; i++) {
      o = list[i];
      if (!o || o.hp) continue;                        // сущности — мимо
      var stName = STATION_SPR[String(o.sprName || '')];
      if (!stName) continue;
      var d = WS.M.dist(p.x, p.y, o.x, o.y);
      if (d > STATION_R + 0.5) continue;               // чуть с запасом на центр тайла

      var good = true;
      if (stName === 'fire' || stName === 'stove') {
        good = isLit(o);                               // очаг должен гореть
      }
      if (!good) continue;

      out.objects.push({ station: stName, o: o, dist: Math.round(d * 10) / 10 });
      if (!out[stName]) out[stName] = o;
    }

    // горящая печь — тоже огонь (варить можно и у печи)
    if (out.stove && !out.fire) {
      out.fire = out.stove;
    }
    // страховка через реестр огней (костёр мог остаться без объекта)
    if (!out.fire && WS.Fire && WS.Fire.near) {
      try {
        if (WS.Fire.near(p.x, p.y, STATION_R + 0.5)) out.fire = { x: 0, y: 0, _fromFire: true };
      } catch (e2) { /* пусто */ }
    }
    return out;
  }

  /**
   * ПУБЛИЧНО: главная станция рядом (для тостов/кнопки). null | 'fire' |
   * 'stove' | 'workbench' | 'anvil' | 'forge'.
   */
  function stationNear() {
    var st = stationsNear();
    var order = ['fire', 'stove', 'workbench', 'anvil', 'forge'];
    for (var i = 0; i < order.length; i++) {
      if (st[order[i]]) return order[i];
    }
    return null;
  }

  /** Достаточна ли станция для рецепта (с учётом карты станций st). */
  function stationOk(need, st) {
    if (!need) return true;                    // без станции
    return !!st[need];
  }

  // ====================================================================
  //  ШАНС ПРОВАЛА И ОПЫТ
  // ====================================================================

  /** Шанс провала рецепта (%, 0 — верная работа). */
  function failChanceFor(r) {
    if (!r.skill || !r.skill.id) return 0;
    var have = skillLv(r.skill.id);
    var need = r.skill.lv || 1;
    if (have >= need) return 0;
    return Math.min(FAIL_MAX, FAIL_BASE + (need - have) * FAIL_PER_LV);
  }

  /** Опыт навыку (уровень по образцу addCookXp из fire.js). */
  function addXp(id, n) {
    var p = P();
    if (!p || !p.skills || !p.skills[id]) return;
    var sk = p.skills[id];
    sk.xp = (sk.xp || 0) + n;
    while (sk.xp >= (sk.lv + 1) * XP_PER_LV && sk.lv < 10) {
      sk.xp -= (sk.lv + 1) * XP_PER_LV;
      sk.lv++;
      toast('Навык «' + (SKILL_NAME[id] || id) + '»: уровень ' + sk.lv, 'good');
      if (WS.Snd && WS.Snd.play) {
        try { WS.Snd.play('levelup', 0.5); } catch (e) { /* пусто */ }
      }
      try { WS.Ev.emit('player:levelup', { skill: id, level: sk.lv }); } catch (e2) { /* пусто */ }
    }
  }

  // ====================================================================
  //  СПИСОК ДОСТУПНЫХ (для экрана крафта)
  //  Каждый рецепт -> карточка с флагами «почему нельзя»:
  //  ингредиенты, станция, инструменты. Навык ниже требуемого — НЕ запрет,
  //  а риск (шанс провала показан отдельно).
  // ====================================================================

  /** Одна карточка рецепта. */
  function card(r, st) {
    st = st || stationsNear();
    var inv = WS.Inv || null;
    var check = inv && inv.hasAll ? inv.hasAll(r.req) : { ok: false, missing: [] };
    var tOk = toolsOk(r);
    var sOk = stationOk(r.station, st);
    var fail = failChanceFor(r);
    var can = check.ok && tOk && sOk;

    // развёрнутые требования для UI
    var req = [];
    for (var i = 0; i < r.req.length; i++) {
      var q = r.req[i];
      req.push({
        id: q.id, n: q.n || 1,
        have: inv && inv.count ? inv.count(q.id) : 0,
        name: nameOf(q.id)
      });
    }
    var out = [];
    for (i = 0; i < r.out.length; i++) {
      var t = r.out[i];
      out.push({ id: t.id, n: t.n || 1, name: nameOf(t.id) });
    }

    return {
      id: r.id,
      name: r.name || r.id,
      name_key: r.name_key,
      desc: r.desc || '',
      cat: r.cat,
      station: r.station,
      stationName: r.station ? (STATION_NAME[r.station] || r.station) : null,
      stationHere: r.station ? sOk : true,
      time: r.time,
      req: req,
      tools: r.tools,
      toolsHere: tOk,
      toolsMissing: toolsMissing(r),
      out: out,
      skill: r.skill,
      skillName: r.skill ? (SKILL_NAME[r.skill.id] || r.skill.id) : null,
      skillHere: r.skill ? (skillLv(r.skill.id) >= (r.skill.lv || 1)) : true,
      failChance: fail,
      can: can,
      missing: check.missing || [],

      // история: новизна и счётчик (для бейджа «впервые!»)
      times: timesCrafted(r.id),
      isNew: timesCrafted(r.id) === 0
    };
  }

  /**
   * ПУБЛИЧНО: список рецептов с флагами. cat — фильтр ('survival',
   * 'cook', 'carpentry', 'tailor', 'ammo', 'misc', null = все).
   * filter — подстрока в имени рецепта или изделия (регистр не важен).
   * Станции сканируются один раз на вызов.
   */
  function available(cat, filter) {
    var st = stationsNear();
    var out = [];
    var list = recipes();
    var f = (typeof filter === 'string' && filter) ? filter.toLowerCase() : null;
    for (var i = 0; i < list.length; i++) {
      if (cat && list[i].cat !== cat) continue;
      if (f && !matchFilter(list[i], f)) continue;
      out.push(card(list[i], st));
    }
    return out;
  }

  /** Похож ли рецепт на поисковый запрос (имя, изделие, ингредиенты). */
  function matchFilter(r, f) {
    if ((r.name || '').toLowerCase().indexOf(f) >= 0) return true;
    for (var i = 0; i < r.out.length; i++) {
      if (nameOf(r.out[i].id).toLowerCase().indexOf(f) >= 0) return true;
    }
    for (i = 0; i < r.req.length; i++) {
      if (nameOf(r.req[i].id).toLowerCase().indexOf(f) >= 0) return true;
    }
    return false;
  }

  /** ПУБЛИЧНО: одна карточка по id рецепта (или null). */
  function availableOne(id) {
    var r = recipe(id);
    if (!r) return null;
    return card(r, stationsNear());
  }

  /**
   * ПУБЛИЧНО: чем получается предмет? Все рецепты, где itemId
   * встречается в выходах (для подсказки «из чего сшить/сделать»).
   */
  function recipesFor(itemId) {
    var out = [];
    var list = recipes();
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      for (var k = 0; k < r.out.length; k++) {
        if (r.out[k].id === itemId) { out.push(r); break; }
      }
    }
    return out;
  }

  /**
   * ПУБЛИЧНО: человеческие причины «почему нельзя» — массив строк
   * (для тоста или подсветки в UI).
   */
  function whyNot(c) {
    var out = [];
    if (!c) return out;
    if (c.missing && c.missing.length) {
      for (var i = 0; i < c.missing.length; i++) {
        var m = c.missing[i];
        out.push('не хватает: ' + nameOf(m.id) + ' (' + m.have + '/' + m.need + ')');
      }
    }
    if (!c.stationHere && c.station) {
      out.push('нужна станция: ' + (STATION_NAME[c.station] || c.station));
    }
    if (!c.toolsHere) {
      var miss = [];
      for (i = 0; i < (c.toolsMissing || []).length; i++) miss.push(nameOf(c.toolsMissing[i]));
      out.push('нет инструмента: ' + miss.join(', '));
    }
    if (c.failChance > 0) {
      out.push('риск провала: ' + c.failChance + '% (навык «' + c.skillName + '» ниже нужного)');
    }
    return out;
  }

  /**
   * ПУБЛИЧНО: сводка станций рядом — [{station, name, dist, lit}] —
   * для панели UI «верстак в 1 тайле» и обучающих подсказок.
   */
  function stationReport() {
    var st = stationsNear();
    var out = [];
    for (var i = 0; i < st.objects.length; i++) {
      var s = st.objects[i];
      out.push({
        station: s.station,
        name: STATION_NAME[s.station] || s.station,
        dist: s.dist,
        x: s.o.x, y: s.o.y
      });
    }
    return out;
  }

  /** ПУБЛИЧНО: категории рецептов с количеством (для вкладок UI). */
  function categories() {
    var cnt = {
      survival: 0, cook: 0, carpentry: 0, tailor: 0, ammo: 0, misc: 0
    };
    var list = recipes();
    for (var i = 0; i < list.length; i++) {
      if (cnt[list[i].cat] !== undefined) cnt[list[i].cat]++;
    }
    return cnt;
  }

  // ====================================================================
  //  ИЗГОТОВЛЕНИЕ
  //  Ингредиенты списываются СРАЗУ (уносит работу с собой), инструменты
  //  изнашиваются в начале. Прогресс тикает реальными секундами —
  //  паттерн «обыска» looting.js. Провал: сгорает один ингредиент,
  //  остальные возвращаются; опыт за ошибку тоже капает.
  // ====================================================================

  var current = null;     // { r, t, dur }
  var lastResult = null;  // { ok, id, name, at } — итог последней работы

  /** ПУБЛИЧНО: начать крафт. Возвращает {ok, reason?}. */
  function craft(recipeId) {
    var g = G();
    var p = P();
    if (!g || !g.running) return { ok: false, reason: 'нет партии' };
    if (!p) return { ok: false, reason: 'нет игрока' };
    if (p.sleeping) return { ok: false, reason: 'во сне не работают' };
    if (current) return { ok: false, reason: 'руки заняты' };

    var r = recipe(recipeId);
    if (!r) return { ok: false, reason: 'нет такого рецепта' };

    // --- проверки (ингредиенты/станция/инструменты) ---
    var st = stationsNear();
    var inv = WS.Inv;
    if (inv && inv.hasAll && !inv.hasAll(r.req).ok) {
      toast('Не хватает ингредиентов', 'warn');
      return { ok: false, reason: 'ингредиенты' };
    }
    if (!stationOk(r.station, st)) {
      toast(r.station ? ('Нужна станция: ' + (STATION_NAME[r.station] || r.station)) : '',
            'warn');
      return { ok: false, reason: 'станция' };
    }
    if (!toolsOk(r)) {
      toast('Не хватает инструмента: ' + toolsMissing(r).map(nameOf).join(', '), 'warn');
      return { ok: false, reason: 'инструменты' };
    }

    // --- списание (атомарно) ---
    if (inv && inv.takeAll) {
      var paid = inv.takeAll(r.req);
      if (!paid.ok) {
        toast('Ингредиенты куда-то делись', 'warn');
        return { ok: false, reason: 'ингредиенты' };
      }
    } else if (WS.Action && WS.Action.consume) {
      // фолбэк на базовый инвентарь из actions.js
      for (var i = 0; i < r.req.length; i++) {
        WS.Action.consume(r.req[i].id, r.req[i].n || 1);
      }
    } else {
      return { ok: false, reason: 'нет инвентаря' };
    }

    // --- износ инструментов ---
    wearTools(r);

    // --- запускаем ---
    current = { r: r, t: 0, dur: r.time };
    var fail = failChanceFor(r);
    toast('Работа: ' + r.name + (fail ? (' (риск ' + fail + '%)') : ''), 'info');
    if (WS.Snd && WS.Snd.play) {
      try { WS.Snd.play('craft', p.x, p.y, 0.4); } catch (e) { /* пусто */ }
    }
    if (WS.Fx && WS.Fx.text) {
      try { WS.Fx.text('Делаем: ' + r.name, p.x, p.y - 1.2, { col: '#c8b46a' }); }
      catch (e2) { /* пусто */ }
    }
    try { WS.Ev.emit('craft:started', { id: r.id, recipe: r }); } catch (e3) { /* пусто */ }
    return { ok: true, dur: r.time };
  }

  /** Тик работы: прогресс, искры, завершение. */
  function craftTick(dt) {
    var g = G();
    if (!current) return;
    if (!g || !g.running || g.dead) { current = null; return; }
    var p = P();
    if (!p) { current = null; return; }
    if (p.sleeping) {
      current = null;
      toast('Работа брошена: вы уснули', 'warn');
      return;
    }

    current.t += dt;

    // искорки да стук — чтобы чувствовалась работа
    if (WS.Fx && WS.Fx.spawn && Math.random() < dt * 3) {
      try {
        WS.Fx.spawn('spark', p.x + (Math.random() - 0.5) * 0.4,
                    p.y + (Math.random() - 0.5) * 0.3,
                    { z: 14, vy: -0.3, grav: -4, life: 0.5, size: 2 });
      } catch (e) { /* пусто */ }
    }
    if (WS.Snd && WS.Snd.play && current.t % 2 < dt) {
      try { WS.Snd.play('build', p.x, p.y, 0.15); } catch (e2) { /* пусто */ }
    }

    if (current.t < current.dur) return;
    finishCraft();
  }

  /** Завершение работы: успех или порча. */
  function finishCraft() {
    var g = G();
    var p = P();
    var work = current;
    current = null;
    if (!work || !p) return;
    var r = work.r;

    // --- бросок на провал ---
    var fail = failChanceFor(r);
    if (fail > 0 && Math.random() * 100 < fail) {
      craftFail(r);
      return;
    }

    // --- успех: выдать изделия ---
    for (var i = 0; i < r.out.length; i++) {
      giveOut(r.out[i].id, r.out[i].n || 1, p);
    }

    // статистика
    if (g && g.stats) g.stats.itemsCrafted = (g.stats.itemsCrafted || 0) + 1;
    markCrafted(r.id);

    // опыт
    if (r.skill && r.skill.id) addXp(r.skill.id, XP_CRAFT);
    else addXp('survive', 2);            // простая работа тоже учит выживать

    // подача
    var first = r.out[0];
    var what = first ? (nameOf(first.id) + (first.n > 1 ? ' ×' + first.n : '')) : r.name;
    if (WS.Fx && WS.Fx.text) {
      try { WS.Fx.text('+ ' + what, p.x, p.y - 1.2, { col: '#7ea36a', life: 1.6 }); }
      catch (e) { /* пусто */ }
    }
    if (WS.Snd && WS.Snd.play) {
      try { WS.Snd.play('craft', p.x, p.y, 0.6); } catch (e2) { /* пусто */ }
    }
    toast('Готово: ' + r.name, 'good');
    lastResult = { ok: true, id: r.id, name: r.name, at: Date.now() };
    try { WS.Ev.emit('item:crafted', { id: r.id, out: r.out, recipe: r, fail: false }); }
    catch (e3) { /* пусто */ }
  }

  /** Провал: один ингредиент сгорает, остальные возвращаются. */
  function craftFail(r) {
    var p = P();
    var give = WS.Inv && WS.Inv.give ? WS.Inv.give
             : (WS.Action && WS.Action.give ? WS.Action.give : null);
    if (!give) return;

    // жертва — случайный ингредиент (одна единица сгорает)
    var victim = -1;
    if (r.req.length) {
      victim = Math.floor(Math.random() * r.req.length);
    }
    for (var i = 0; i < r.req.length; i++) {
      var back = (r.req[i].n || 1);
      if (i === victim) back = Math.max(0, back - 1);
      if (back > 0) give(r.req[i].id, back);
    }

    // опыт за ошибки
    if (r.skill && r.skill.id) addXp(r.skill.id, XP_FAIL);

    if (p) {
      if (WS.Fx && WS.Fx.text) {
        try { WS.Fx.text('Не вышло...', p.x, p.y - 1.2, { col: '#c86a5a', life: 1.8 }); }
        catch (e) { /* пусто */ }
      }
      if (WS.Fx && WS.Fx.burst) {
        try { WS.Fx.burst('smoke', p.x, p.y, 4); } catch (e2) { /* пусто */ }
      }
    }
    if (WS.Snd && WS.Snd.play) {
      try { WS.Snd.play('error', 0.6); } catch (e3) { /* пусто */ }
    }
    toast('Испорчено: ' + r.name + ' (ингредиент пропал)', 'bad');
    lastResult = { ok: false, id: r.id, name: r.name, at: Date.now() };
    try { WS.Ev.emit('item:crafted', { id: r.id, out: null, recipe: r, fail: true }); }
    catch (e4) { /* пусто */ }
  }

  /** Выдать изделие; при перегрузе — остаток на землю. */
  function giveOut(id, n, p) {
    var given = 0;
    if (WS.Inv && WS.Inv.give) given = WS.Inv.give(id, n);
    else if (WS.Action && WS.Action.give) given = WS.Action.give(id, n);
    var rest = n - (given || 0);
    if (rest > 0 && p) {
      // руки полны — кладём под ноги
      if (WS.Loot && WS.Loot.dropItem) {
        WS.Loot.dropItem(id, rest, p.x, p.y);
        toast('Не унеслось: ' + nameOf(id) + ' ×' + rest + ' — на землю', 'warn');
      }
    }
    return given;
  }

  /** ПУБЛИЧНО: идёт ли работа сейчас. */
  function isCrafting() {
    return !!current;
  }

  /** ПУБЛИЧНО: прогресс работы 0..1 (или 0). */
  function progress() {
    if (!current) return 0;
    return clamp(current.t / current.dur, 0, 1);
  }

  /** ПУБЛИЧНО: что сейчас в работе: {id, name, t, dur} | null. */
  function info() {
    if (!current) return null;
    return {
      id: current.r.id,
      name: current.r.name,
      t: Math.round(current.t * 10) / 10,
      dur: current.dur
    };
  }

  /** ПУБЛИЧНО: бросить работу (ингредиенты не вернуть — уже в деле). */
  function cancel() {
    if (!current) return false;
    current = null;
    toast('Работа брошена', 'warn');
    return true;
  }

  // ====================================================================
  //  САМОТЕСТ (консоль разработчика: WS.Craft.selftest())
  // ====================================================================

  function selftest() {
    var out = [];
    var pass = 0, fail = 0;
    function ok(name, cond) {
      if (cond) { pass++; out.push('  ok   ' + name); }
      else { fail++; out.push('  FAIL ' + name); }
      return !!cond;
    }

    ok('модуль зарегистрирован', !!WS.Craft);
    var n = recipes().length;
    ok('рецепты загружены (' + n + ')', n >= 140);
    ok('recipesById работает', !!(recipe('torch') && recipe('ukha') && recipe('arrow')));

    // целостность данных
    var broken = 0;
    var list = recipes();
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      for (var k = 0; k < r.req.length; k++) if (!defOf(r.req[k].id)) broken++;
      for (k = 0; k < r.out.length; k++) if (!defOf(r.out[k].id)) broken++;
      for (k = 0; k < r.tools.length; k++) if (!defOf(r.tools[k])) broken++;
    }
    ok('все id рецептов существуют', broken === 0);

    ok('available() — массив карточек', available().length >= 140);
    ok('available с поиском', available(null, 'уха').length >= 1);
    ok('categories() считает рецепты', categories().cook > 0 && categories().survival > 0);
    ok('recipesFor(torch) находит факел', recipesFor('torch').length >= 1);
    ok('stationNear() — null или строка', stationNear() === null ||
       typeof stationNear() === 'string');
    ok('failChanceFor без скилла 0%', failChanceFor(recipe('torch')) === 0);
    ok('failChanceFor с недобором > 0', failChanceFor(recipe('rifle_round_batch')) > 0);
    ok('timesCrafted — число', typeof timesCrafted('torch') === 'number');
    ok('known() — массив', typeof known().length === 'number');
    ok('info()/progress() безопасны', info() === null || typeof progress() === 'number');

    out.unshift('craft.selftest: ' + pass + ' ок, ' + fail + ' провалено');
    return out;
  }

  // ====================================================================
  //  ПУБЛИЧНЫЙ API
  // ====================================================================

  var Craft = {
    // --- данные ---
    recipes: recipes,
    recipe: recipe,
    categories: categories,

    // --- список для UI ---
    available: available,
    availableOne: availableOne,
    card: card,                     // карточка по объекту рецепта
    recipesFor: recipesFor,
    whyNot: whyNot,

    // --- станции ---
    stationsNear: stationsNear,
    stationNear: stationNear,
    stationReport: stationReport,
    STATION_NAME: STATION_NAME,
    STATION_R: STATION_R,

    // --- работа ---
    craft: craft,
    isCrafting: isCrafting,
    progress: progress,
    info: info,
    cancel: cancel,
    failChanceFor: failChanceFor,

    // --- прочее ---
    hasTool: hasTool,
    timesCrafted: timesCrafted,
    known: known,
    lastResult: function () { return lastResult; },
    selftest: selftest
  };

  WS.def('Craft', Craft);

  // ====================================================================
  //  BOOT
  // ====================================================================

  WS.boot(function initCraft() {
    // тик работы (после needs 40 и inv 41)
    WS.tick(TICK_PRI, craftTick, 'sys:craft');

    // новая партия — сброс незавершённой работы
    WS.Ev.on('game:start', function () { current = null; });
    WS.Ev.on('game:load', function () { current = null; });

    WS.log('craft: крафт зарегистрирован (' + recipes().length + ' рецептов, тик ' + TICK_PRI + ')');
  }, 'craft:init');

})();
