/**
 * fire.js — ОГОНЬ (модуль B1): костры и печи, топливо и стадии горения,
 * приготовление еды, растапливание снега, пожароопасность в домах.
 * Тик 20 (мир, CONTRACT.md — до систем, чтобы WS.Temp видел актуальный огонь).
 * Связи: WS.Temp (радиант огня/натопленная комната), WS.Needs (еда/питьё),
 * WS.Action/WS.Inv (инвентарь), World.addObject (light + fireLight),
 * спрайты: campfire (3 стадии) + campfire_out — регистрируются в boot.
 */
(function () {
  'use strict';

  // ====================================================================
  //  НАСТРОЙКИ
  // ====================================================================

  var TICK_PRI = 20;              // приоритет тика (мир/огонь)

  // --- топливо: сколько «единиц» даёт предмет ---
  var FUEL_VALUE = {
    log: 60,                      // бревно
    firewood_bundle: 40,           // вязанка хвороста
    plank: 30,                     // доска
    charcoal_bag: 50,             // мешок угля
    fat: 25,                       // жир (горит чадя)
    pine_branch: 10,              // еловая лапка: слабое, но топливо
    birch_bark: 8,                // береста: вспыхивает жарко
    dry_grass: 6                  // сухая трава: на растопку
  };

  // --- костёр ---
  var CAMP_MAX = 60;               // полный бак костра
  var CAMP_BURN_PER_MIN = 0.5;    // расход за игровую минуту (60 = 2 часа)
  var CAMP_UNATTENDED_MUL = 1.6;   // брошенный на снегу тухнет быстрее
  var CAMP_UNATTEND_R = 8;         // «без присмотра» — дальше этого
  var CAMP_LIGHT = 55;             // радиус света полного костра

  // --- печь ---
  var STOVE_MAX = 240;             // полный бак печи (4 бревна на ночь)
  var STOVE_LIGHT = 40;            // свет печи (r, fire:true — греет комнату)

  // --- пожароопасность: костёр в доме поджигает пол ---
  var HAZARD_GAME_MIN = 30;        // игровых минут дыма до возгорания
  var HAZARD_WARMUP_MIN = 15;      // половина — «дым ест глаза»
  var HAZARD_ATTEND_R = 4;         // «присмотр» — ближе этого не разгорается

  // --- готовка и растапливание (игровые минуты) ---
  var COOK_DUR = 30;               // приготовление блюда
  var MELT_DUR = 15;               // растопить снег
  var FIRE_COOK_R = 2.5;           // у огня ближе этого можно стряпать

  // --- искры и дым (реальные секунды) ---
  var SPARK_EVERY = 0.9;
  var SMOKE_EVERY = 2.6;
  var FX_DIST = 40;                // дальше этого костры не анимируем

  // --- навык готовки ---
  var COOK_XP = 10;                // опыта за блюдо
  var COOK_XP_PER_LV = 100;

  // ====================================================================
  //  СОСТОЯНИЕ МОДУЛЯ
  //  G.fires — сейв-безопасный реестр огней (только простые поля):
  //    { id, kind: 'camp'|'stove', objId, x, y, fuel, max, out, hazard }
  //  Ссылки на объекты мира держим отдельно (objIdx) — в сейв не идут.
  // ====================================================================

  var sysTime = 0;
  var objIdx = {};                 // objId -> объект мира
  var nextFireId = 1;
  var sparkT = {};                 // fireId -> таймер искр (реальные сек)

  // ====================================================================
  //  МАЛЫЕ УТИЛИТЫ
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
  function invCount(id) { var I = inv(); return I ? (I.countItem(id) || 0) : 0; }
  function invConsume(id, n) { var I = inv(); return I ? (I.consume(id, n || 1) || 0) : 0; }
  function invGive(id, n) { var I = inv(); return I ? (I.give(id, n || 1) || 0) : 0; }

  function defOf(id) {
    return (WS.Data && WS.Data.items && WS.Data.items[id]) || null;
  }

  // ====================================================================
  //  ПРЕДМЕТЫ МОДУЛЯ (объявляем, только если их ещё нет)
  // ====================================================================

  function declareItems() {
    WS.Data = WS.Data || {};
    WS.Data.items = WS.Data.items || {};
    var add = function (o) {
      if (!WS.Data.items[o.id]) WS.Data.items[o.id] = o;
    };
    add({ id: 'pot', cat: 'tool', w: 1.2, stack: 1, tags: ['cooking', 'melting'] });
    // flask_empty и bedroll объявляет needs.js; продублируем на всякий
    add({ id: 'flask_empty', cat: 'container', w: 0.35, stack: 3, tags: ['container'] });
  }

  // ====================================================================
  //  СПРАЙТЫ КОСТРА (3 стадии горения + погасший)
  //  Стадия выбирается по топливу: >66% — большое пламя (кадр 2),
  //  >33% — среднее (1), ниже — слабое (0). Погасший — campfire_out.
  // ====================================================================

  function defSprites() {
    var S = WS.Spr;
    if (!S || !S.def) return;
    var px = S.px;
    var ell = S.ell;

    // --- язык пламени: три слоя жара ---
    function flame(c, x, y, w, h, seed) {
      // внешний тёмно-оранжевый
      ell(c, x, y - h * 0.45, w * 0.5, h * 0.55, '#c2571f');
      // средний оранжевый
      ell(c, x + (seed ? 1 : -1), y - h * 0.55, w * 0.36, h * 0.45, '#e2924a');
      // жёлтое ядро
      ell(c, x, y - h * 0.6, w * 0.22, h * 0.32, '#f4b968');
      // язычки-кончики
      px(c, x - 1, y - h - 2, 2, 3, '#f4b968');
      px(c, x + 2, y - h, 2, 2, '#e2924a');
    }

    S.def('campfire', { w: 44, h: 40, draw: function (c, w2, h2, f) {
      // выжженная проплешина
      ell(c, 22, 30, 15, 6.5, 'rgba(24,20,16,0.65)');
      ell(c, 22, 30, 11, 4.5, 'rgba(48,38,28,0.85)');
      // кольцо камней
      px(c, 7, 27, 4, 3, '#6f737b');
      px(c, 33, 27, 4, 3, '#5f636b');
      px(c, 12, 32, 4, 3, '#767a82');
      px(c, 28, 32, 4, 3, '#63686f');
      px(c, 20, 34, 5, 3, '#6a6d74');
      // брёвна крест-накрест
      px(c, 13, 25, 13, 3, '#57422e');
      px(c, 17, 22, 13, 3, '#4a3a2a');
      px(c, 19, 24, 8, 2, '#6b5138');
      // угли под пламенем
      px(c, 18, 23, 8, 2, '#9c461a');
      px(c, 20, 22, 4, 1, '#e2924a');
      // пламя: f = 0 слабое, 1 среднее, 2 большое
      if (f >= 2) {
        flame(c, 22, 22, 14, 15, 1);
        flame(c, 17, 22, 8, 9, 0);
        flame(c, 27, 22, 8, 10, 1);
      } else if (f === 1) {
        flame(c, 22, 22, 11, 11, 0);
        flame(c, 26, 22, 6, 7, 1);
      } else {
        flame(c, 22, 22, 8, 7, 1);
      }
    }});

    S.def('campfire_out', { w: 40, h: 28, draw: function (c) {
      // остывшая проплешина
      ell(c, 20, 20, 14, 6, 'rgba(30,26,22,0.7)');
      ell(c, 20, 20, 10, 4, 'rgba(44,40,36,0.9)');
      // камни
      px(c, 6, 17, 4, 3, '#5f636b');
      px(c, 30, 17, 4, 3, '#555a62');
      px(c, 11, 22, 4, 3, '#63686f');
      px(c, 26, 22, 4, 3, '#5a5e66');
      // обуглившиеся брёвна
      px(c, 12, 16, 13, 3, '#2c2620');
      px(c, 16, 14, 12, 3, '#241f1a');
      // зола и последние угольки
      px(c, 17, 15, 7, 2, '#4a3c30');
      px(c, 19, 14, 3, 1, '#8a4a22');
      px(c, 22, 15, 2, 1, '#b3501e');
      // дымок
      px(c, 20, 8, 2, 4, 'rgba(120,126,136,0.35)');
      px(c, 22, 5, 2, 3, 'rgba(120,126,136,0.25)');
    }});
  }

  // ====================================================================
  //  ИНДЕКС ОБЪЕКТОВ МИРА (по событиям obj:add/obj:remove)
  // ====================================================================

  function indexAdd(d) {
    if (d && d.o && d.o.id) objIdx[d.o.id] = d.o;
  }
  function indexRemove(d) {
    if (d && d.o && d.o.id) delete objIdx[d.o.id];
  }

  /** Полная перестройка индекса (после генерации/загрузки мира). */
  function rebuildIndex() {
    objIdx = {};
    var w = W();
    if (!w || !w.objects) return;
    for (var i = 0; i < w.objects.length; i++) {
      var o = w.objects[i];
      if (o && o.id) objIdx[o.id] = o;
    }
  }

  function objById(id) {
    return objIdx[id] || null;
  }

  // ====================================================================
  //  РЕЕСТР ОГНЕЙ
  // ====================================================================

  function fires() {
    var g = G();
    if (!g) return null;
    if (!g.fires) g.fires = [];
    return g.fires;
  }

  function isFireObj(o) {
    if (!o) return false;
    var n = String(o.sprName || '');
    return n === 'campfire' || n === 'campfire_out' || (o.fireData && o.fire) ||
           (o.heat && o.fire);
  }

  /** Найти запись реестра по объекту. */
  function entryOf(o) {
    var arr = fires();
    if (!arr || !o) return null;
    for (var i = 0; i < arr.length; i++) {
      if (arr[i].objId === o.id) return arr[i];
    }
    return null;
  }

  /** Топливо в долях. */
  function fuelFrac(e) {
    if (!e || !e.max) return 0;
    return clamp(e.fuel / e.max, 0, 1);
  }

  /** Обновить стадию спрайта и радиус света костра. */
  function applyStage(e) {
    var o = objById(e.objId);
    if (!o) return;
    var frac = fuelFrac(e);
    var stage = frac > 0.66 ? 2 : (frac > 0.33 ? 1 : 0);
    if (o.sprFrame !== stage) o.sprFrame = stage;
    if (o._light) {
      var r = [18, 34, CAMP_LIGHT][stage];
      if (o._light.r !== r) o._light.r = r;
    }
  }

  // ====================================================================
  //  ПОИСК ОГНЯ
  // ====================================================================

  /** Ближайший огонь к точке (для готовки/сушки/температуры). */
  function near(x, y, r) {
    var arr = fires();
    if (!arr) return null;
    var best = null, bd = r || 3;
    for (var i = 0; i < arr.length; i++) {
      var e = arr[i];
      if (e.out) continue;
      var d = WS.M.dist(x, y, e.x, e.y);
      if (d < bd) { bd = d; best = e; }
    }
    if (!best) return null;
    best.d = bd;
    return best;
  }

  /**
   * Радиант огня в точке: 0..20 (для WS.Temp). Костёр — по близости
   * и силе пламени; печь — только вплотную (комнату греет её свет).
   */
  function heatAt(x, y) {
    var arr = fires();
    if (!arr) return 0;
    var best = 0;
    for (var i = 0; i < arr.length; i++) {
      var e = arr[i];
      if (e.out) continue;
      var d = WS.M.dist(x, y, e.x, e.y);
      if (e.kind === 'camp' && d <= 2.5) {
        best = Math.max(best, (1 - d / 2.5) * (8 + 12 * fuelFrac(e)));
      } else if (e.kind === 'stove' && d <= 2.2) {
        best = Math.max(best, (1 - d / 2.2) * (6 + 6 * fuelFrac(e)));
      }
    }
    return best;
  }

  /** Горит ли что-то в радиусе r (свет с fire:true). */
  function lightFireNear(x, y, r) {
    var w = W();
    if (!w || !w.lightsNear) return false;
    var list;
    try { list = w.lightsNear(x, y, r || 2.5); } catch (e) { return false; }
    for (var i = 0; i < list.length; i++) {
      if (list[i].fire) return true;
    }
    return false;
  }

  /** Это печь/печурка? (объекты интерьера с heat:true). */
  function isStove(o) {
    if (!o) return false;
    if (o.heat) return true;
    var n = String(o.sprName || '');
    return n === 'pech' || n === 'stove_iron';
  }

  // ====================================================================
  //  РАЗЖИГАНИЕ КОСТРА
  //  Нужны: трут (cloth_rag/newspaper_stack/candle_stump/wadding),
  //  дрова (log/firewood_bundle/plank/charcoal_bag/fat), спички или
  //  огниво (flint не расходуется). На месте погасшего — перезапал.
  // ====================================================================

  var TINDER = ['cloth_rag', 'newspaper_stack', 'candle_stump', 'wadding',
               'birch_bark', 'dry_grass'];

  /** Есть ли предмет одной из категорий; возвращает найденный id. */
  function pickAny(ids) {
    for (var i = 0; i < ids.length; i++) {
      if (invCount(ids[i]) > 0) return ids[i];
    }
    return null;
  }

  /** Позиция свободна для костра? */
  function canPlaceAt(x, y) {
    var w = W();
    if (!w || !w.tileAt) return false;
    var tx = Math.floor(x), ty = Math.floor(y);
    if (w.isTileBlocked && w.isTileBlocked(tx, ty)) return false;
    var t = w.tileAt(tx, ty);
    if (w.T) {
      if (t === w.T.WATER || t === w.T.VOID) return false;   // в воду нельзя
    }
    var objs = w.objsAt ? w.objsAt(tx, ty) : [];
    for (var i = 0; i < objs.length; i++) {
      if (objs[i].solid) return false;                        // занято
    }
    return true;
  }

  /**
   * ПУБЛИЧНО: разжечь костёр в точке (x, y). Возвращает {ok, reason}.
   * Тратит 1 трут + 1 дрова + 1 спичку (огниво не тратится).
   */
  function lightCampfire(x, y) {
    var g = G();
    if (!g || !g.running) return { ok: false, reason: 'нет партии' };
    var w = W();
    if (!w || !w.addObject) return { ok: false, reason: 'нет мира' };
    x = Math.floor(x) + 0.5;
    y = Math.floor(y) + 0.5;

    // перезапал погасшего на этом месте
    var tx = Math.floor(x), ty = Math.floor(y);
    var objs = w.objsAt ? w.objsAt(tx, ty) : [];
    for (var i = 0; i < objs.length; i++) {
      if (objs[i] && String(objs[i].sprName || '') === 'campfire_out') {
        removeEntryObject(entryOf(objs[i]));
        try { w.removeObject(objs[i]); } catch (e0) { /* пусто */ }
      }
    }

    if (!canPlaceAt(x, y)) {
      return { ok: false, reason: 'здесь не развести огонь' };
    }

    // трут
    var tinder = pickAny(TINDER);
    if (!tinder) {
      toast('Нужен трут: тряпьё, бумага или огарок свечи', 'warn');
      return { ok: false, reason: 'нет трута' };
    }
    // дрова
    var wood = pickAny(fuelIds());
    if (!wood) {
      toast('Нужны дрова: бревно, хворост или доска', 'warn');
      return { ok: false, reason: 'нет дров' };
    }
    // огниво/спички
    var useMatches = invCount('matches') > 0;
    var useFlint = !useMatches && invCount('flint') > 0;
    if (!useMatches && !useFlint) {
      toast('Нечем высечь огонь: нужны спички или огниво', 'warn');
      return { ok: false, reason: 'нет спичек/огнива' };
    }

    // расходуем
    if (invConsume(tinder, 1) <= 0) return { ok: false, reason: 'трут не найден' };
    if (invConsume(wood, 1) <= 0) return { ok: false, reason: 'дрова не найдены' };
    if (useMatches && invConsume('matches', 1) <= 0 && !useFlint) {
      return { ok: false, reason: 'спички кончились' };
    }

    // создаём объект (light + fireLight addObject превратит в мерцающий свет)
    var fuel = Math.min(CAMP_MAX, FUEL_VALUE[wood] || 30);
    var o = w.addObject({
      x: x, y: y,
      sprName: 'campfire',
      sprFrame: fuel / CAMP_MAX > 0.66 ? 2 : 1,
      solid: true,
      name: 'Костёр',
      light: CAMP_LIGHT,
      fireLight: true,
      fireData: { fuel: fuel, max: CAMP_MAX }
    });

    // запись в реестре (только простые поля — сейв-безопасно)
    var arr = fires();
    var e = {
      id: 'f' + (nextFireId++),
      kind: 'camp',
      objId: o.id,
      x: x, y: y,
      fuel: fuel,
      max: CAMP_MAX,
      out: false,
      hazard: 0
    };
    arr.push(e);

    // подача
    snd('match', x, y, 0.8);
    sparkBurst(x, y, 10);
    try { WS.Ev.emit('noise', { x: x, y: y, r: 6 }); } catch (e1) { /* пусто */ }
    try { WS.Ev.emit('fire:lit', { o: o, kind: 'camp', x: x, y: y }); } catch (e2) { /* пусто */ }
    toast('Костёр разведён', 'good');
    return { ok: true, obj: o, entry: e };
  }

  function fuelIds() {
    var out = [];
    for (var k in FUEL_VALUE) {
      if (FUEL_VALUE.hasOwnProperty(k)) out.push(k);
    }
    return out;
  }

  /** Снять объект огня с мира и вычеркнуть запись. */
  function removeEntryObject(e) {
    if (!e) return;
    var arr = fires();
    if (arr) {
      var i = arr.indexOf(e);
      if (i >= 0) arr.splice(i, 1);
    }
    delete sparkT[e.id];
  }

  // ====================================================================
  //  ПЕЧЬ
  //  Объекты интерьера (pech/stove_iron, heat:true). Топливо до 240,
  //  свет r 40 с fire:true — temperature.js видит «натопленную комнату».
  // ====================================================================

  /**
   * ПУБЛИЧНО: затопить печь (объект o). Тратит 1 дров + спичку/огниво.
   * Печь — только внутри здания (там ей и место).
   */
  function lightStove(o) {
    var g = G();
    if (!g || !g.running) return { ok: false, reason: 'нет партии' };
    var w = W();
    if (!w) return { ok: false, reason: 'нет мира' };
    if (!isStove(o)) return { ok: false, reason: 'это не печь' };
    if (o.fire && o.fireData && o.fireData.fuel > 0) {
      return { ok: false, reason: 'печь уже топится' };
    }
    if (w.isInside && !w.isInside(o.x, o.y)) {
      toast('Печь топят в доме', 'warn');
      return { ok: false, reason: 'не в доме' };
    }
    if (entryOf(o)) {
      return { ok: false, reason: 'уже горит' };
    }

    // дрова
    var wood = pickAny(fuelIds());
    if (!wood) {
      toast('Нужны дрова для печи', 'warn');
      return { ok: false, reason: 'нет дров' };
    }
    var useMatches = invCount('matches') > 0;
    var useFlint = !useMatches && invCount('flint') > 0;
    if (!useMatches && !useFlint) {
      toast('Нечем поджечь: нужны спички или огниво', 'warn');
      return { ok: false, reason: 'нет спичек/огнива' };
    }

    if (invConsume(wood, 1) <= 0) return { ok: false, reason: 'дрова не найдены' };
    if (useMatches && invConsume('matches', 1) <= 0 && !useFlint) {
      return { ok: false, reason: 'спички кончились' };
    }

    var fuel = Math.min(STOVE_MAX, FUEL_VALUE[wood] || 30);
    o.fire = true;                                  // тепло с огнём
    o.fireData = { fuel: fuel, max: STOVE_MAX };
    if (w.addLight) {
      o._light = w.addLight({ x: o.x, y: o.y - 0.3, r: STOVE_LIGHT, a: 0.9, flicker: true, fire: true });
    }

    var arr = fires();
    var e = {
      id: 'f' + (nextFireId++),
      kind: 'stove',
      objId: o.id,
      x: o.x, y: o.y,
      fuel: fuel,
      max: STOVE_MAX,
      out: false,
      hazard: 0
    };
    arr.push(e);

    snd('match', o.x, o.y, 0.7);
    sparkBurst(o.x, o.y, 6);
    try { WS.Ev.emit('noise', { x: o.x, y: o.y, r: 6 }); } catch (e1) { /* пусто */ }
    try { WS.Ev.emit('fire:lit', { o: o, kind: 'stove', x: o.x, y: o.y }); } catch (e2) { /* пусто */ }
    toast('Печь затоплена', 'good');
    return { ok: true, obj: o, entry: e };
  }

  /**
   * ПУБЛИЧНО: подбросить дров. o — костёр или печь (или их запись).
   * Предмет топлива расходуется по 1 шт.
   */
  function addFuel(o, itemId) {
    var g = G();
    if (!g || !g.running) return { ok: false, reason: 'нет партии' };
    var e = (o && o.kind) ? o : entryOf(o);          // передали запись или объект
    if (!e) return { ok: false, reason: 'огонь не найден' };
    if (e.out) return { ok: false, reason: 'огонь погас' };
    var val = FUEL_VALUE[itemId];
    if (!val) {
      // подобрать любой доступный вид топлива
      itemId = pickAny(fuelIds());
      val = itemId ? FUEL_VALUE[itemId] : 0;
    }
    if (!val) {
      toast('Нечем подбросить: бревно, хворост, доска, уголь или жир', 'warn');
      return { ok: false, reason: 'нет топлива' };
    }
    if (invConsume(itemId, 1) <= 0) return { ok: false, reason: 'нет топлива' };

    e.fuel = Math.min(e.max, e.fuel + val);
    // оживляем объект (если это был потухший — не бывает: out не пускает)
    var obj = objById(e.objId);
    if (obj && obj.fireData) obj.fireData.fuel = e.fuel;
    applyStage(e);

    snd('chop', e.x, e.y, 0.4);
    sparkBurst(e.x, e.y, 4);
    toast('Дрова в огне', 'info');
    try { WS.Ev.emit('fire:fuel', { o: obj, item: itemId, fuel: e.fuel }); } catch (er) { /* пусто */ }
    return { ok: true, fuel: e.fuel, max: e.max };
  }

  /**
   * ПУБЛИЧНО: затушить огонь (плюнуть снегом/закрыть поддувало).
   */
  function extinguish(o) {
    var e = (o && o.kind) ? o : entryOf(o);
    if (!e || e.out) return false;
    e.fuel = 0;
    burnOut(e);
    toast('Огонь погашен', 'info');
    try { WS.Ev.emit('fire:out', { o: objById(e.objId), x: e.x, y: e.y }); } catch (er) { /* пусто */ }
    return true;
  }

  // ====================================================================
  //  ГОРЕНИЕ (тик 20)
  // ====================================================================

  /** Искры над огнём. */
  function sparkBurst(x, y, n) {
    if (!WS.Fx || !WS.Fx.spawn) return;
    n = n || 6;
    for (var i = 0; i < n; i++) {
      try {
        WS.Fx.spawn('spark', x + rnd(-0.25, 0.25), y + rnd(-0.2, 0.2), {
          z: 10 + Math.random() * 10,
          vx: rnd(-0.4, 0.4), vy: rnd(-0.4, 0.4),
          grav: -9,                       // искры взлетают
          life: rnd(0.4, 0.8),
          size: 2
        });
      } catch (e) { /* пусто */ }
    }
  }

  /** Дымок над огнём. */
  function smokePuff(x, y) {
    if (!WS.Fx || !WS.Fx.spawn) return;
    try {
      WS.Fx.spawn('smoke', x + rnd(-0.15, 0.15), y - 0.1, {
        z: 22,
        vx: rnd(-0.1, 0.1), vy: -0.05,
        grav: -3,
        life: rnd(2.0, 3.2),
        size: rnd(3, 5)
      });
    } catch (e) { /* пусто */ }
  }

  /** Потухший костёр: заменить объект на campfire_out. */
  function burnOut(e) {
    var w = W();
    var o = objById(e.objId);
    e.fuel = 0;
    if (e.kind === 'camp') {
      e.out = true;
      if (o && w && w.removeObject) {
        try { w.removeObject(o); } catch (er) { /* пусто */ }
        var o2 = w.addObject({
          x: e.x, y: e.y,
          sprName: 'campfire_out',
          solid: true,
          name: 'Погасший костёр'
        });
        e.objId = o2.id;
      }
      toast('Костёр погас', 'warn');
    } else {
      // печь остаётся печью: снимаем огонь и свет
      e.out = true;
      if (o) {
        o.fire = false;
        o.fireData = null;
        if (o._light && w && w.removeLight) {
          try { w.removeLight(o._light); } catch (er2) { /* пусто */ }
        }
        o._light = null;
      }
      removeEntryObject(e);
      toast('Печь остыла', 'warn');
    }
    try { WS.Ev.emit('fire:out', { o: o, x: e.x, y: e.y }); } catch (er3) { /* пусто */ }
  }

  /** Кадр одного огня. */
  function fireTick(e, dt, pd, pdist) {
    var w = W();
    var inside = !!(w && w.isInside && w.isInside(e.x, e.y));
    var attended = pdist !== null && pdist <= (e.kind === 'camp' ? HAZARD_ATTEND_R : 999);

    // --- расход топлива ---
    var rate = CAMP_BURN_PER_MIN;
    if (e.kind === 'camp' && !inside && (pdist === null || pdist > CAMP_UNATTEND_R)) {
      rate *= CAMP_UNATTENDED_MUL;       // брошенный костёр на снегу сдыхает
    }
    e.fuel -= rate * gMin(dt);
    if (e.fuel <= 0) {
      burnOut(e);
      return;
    }
    applyStage(e);

    // --- пожароопасность: костёр в доме ---
    if (e.kind === 'camp' && inside) {
      if (attended) {
        e.hazard = Math.max(0, (e.hazard || 0) - gMin(dt) * 2);   // следим — гаснет риск
      } else {
        e.hazard = (e.hazard || 0) + gMin(dt);
        if (e.hazard > HAZARD_WARMUP_MIN && e.hazard <= HAZARD_GAME_MIN) {
          smokePuff(e.x, e.y);
          if (e.hazard - gMin(dt) <= HAZARD_WARMUP_MIN) {
            toast('Дым ест глаза: костёр на полу — быть беде!', 'warn');
          }
        }
        if (e.hazard > HAZARD_GAME_MIN) {
          houseFire(e);
          return;
        }
      }
    }

    // --- искры и дым (только недалеко от игрока — экономим частицы) ---
    if (pdist !== null && pdist < FX_DIST && e.fuel > 0) {
      var st = sparkT[e.id] || 0;
      st -= rSec(dt);
      if (st <= 0) {
        st = SPARK_EVERY * rnd(0.6, 1.4) * (0.4 + fuelFrac(e) * 0.6);
        sparkBurst(e.x, e.y, 1 + ((fuelFrac(e) * 3) | 0));
        // треск дров — тихий позиционный щелчок
        if (Math.random() < 0.25) snd('match', e.x, e.y, 0.15);
      }
      sparkT[e.id] = st;

      e._smokeT = (e._smokeT || 0) - rSec(dt);
      if (e._smokeT <= 0) {
        e._smokeT = SMOKE_EVERY * rnd(0.7, 1.5);
        smokePuff(e.x, e.y);
      }
    }
  }

  /**
   * Пожар! Тайл под костром выгорает (FLOOR_DIRT), дым столбом,
   * костёр съеден огнём. Не переусложняем (по ТЗ).
   */
  function houseFire(e) {
    var w = W();
    var tx = Math.floor(e.x), ty = Math.floor(e.y);
    if (w && w.setTile && w.T) {
      try { w.setTile(tx, ty, w.T.FLOOR_DIRT); } catch (er) { /* пусто */ }
    }
    // густой дым и пепел
    if (WS.Fx && WS.Fx.burst) {
      try {
        WS.Fx.burst('smoke', e.x, e.y, 14);
        WS.Fx.burst('spark', e.x, e.y, 10);
      } catch (er2) { /* пусто */ }
    }
    snd('fall', e.x, e.y, 0.8);
    try { WS.Ev.emit('noise', { x: e.x, y: e.y, r: 20 }); } catch (er3) { /* пусто */ }
    try { WS.Ev.emit('fire:hazard', { x: e.x, y: e.y, tx: tx, ty: ty }); } catch (er4) { /* пусто */ }

    // костёр сгорел вместе с полом
    var o = objById(e.objId);
    if (o && w && w.removeObject) {
      try { w.removeObject(o); } catch (er5) { /* пусто */ }
    }
    removeEntryObject(e);
    toast('КОСТЁР ПОДЖЁГ ПОЛ! Дом горит!', 'bad');
  }

  // ====================================================================
  //  ПРИГОТОВЛЕНИЕ У ОГНЯ
  //  cook(itemId): 30 игровых минут у огня (2 тайла) превращает
  //  мясо->жареное, рыбу->печёную, крупу->кашу, хлеб->гренки.
  //  Прогресс: p.cookProgress = {id, out, t, dur}.
  // ====================================================================

  /** Список того, что можно приготовить из инвентаря. */
  function cookable() {
    var p = P();
    if (!p || !p.inv) return [];
    var out = [];
    for (var i = 0; i < p.inv.length; i++) {
      var it = p.inv[i];
      if (!it || !it.id) continue;
      var def = defOf(it.id);
      if (!def || !def.cook) continue;
      var cnt = (typeof it.count === 'number') ? it.count : 1;
      if (cnt <= 0) continue;
      out.push({ id: it.id, out: def.cook, count: cnt });
    }
    return out;
  }

  /** Начать приготовление. */
  function cook(itemId) {
    var g = G();
    var p = g && g.player;
    if (!p) return { ok: false, reason: 'нет партии' };
    if (p.sleeping) return { ok: false, reason: 'во сне не стряпают' };
    if (p.cookProgress) return { ok: false, reason: 'уже готовится' };
    var def = defOf(itemId);
    if (!def || !def.cook) return { ok: false, reason: 'это не готовится' };
    if (invCount(itemId) <= 0) return { ok: false, reason: 'нет продукта' };
    if (!fireForCooking()) {
      toast('Нужен огонь поблизости', 'warn');
      return { ok: false, reason: 'нет огня' };
    }
    p.cookProgress = { id: itemId, out: def.cook, t: 0, dur: COOK_DUR };
    toast('Готовим: ' + itemName(itemId), 'info');
    snd('craft', 0.4);
    return { ok: true };
  }

  /** Огонь достаточно близко для стряпни? */
  function fireForCooking() {
    var p = P();
    if (!p) return false;
    if (near(p.x, p.y, FIRE_COOK_R)) return true;
    return lightFireNear(p.x, p.y, FIRE_COOK_R);
  }

  /** Человекочитаемое имя предмета. */
  function itemName(id) {
    var def = defOf(id);
    if (def && WS.I18N && WS.I18N.t) {
      try {
        var s = WS.I18N.t('item.' + id + '.name');
        if (s && s !== 'item.' + id + '.name') return s;
      } catch (e) { /* литерал ниже */ }
    }
    var map = {
      meat_raw: 'Сырое мясо', meat_cooked: 'Жареное мясо',
      fresh_fish: 'Свежая рыба', cooked_fish: 'Печёная рыба',
      semolina: 'Манка', oat_flakes: 'Овсянка', kasha: 'Каша',
      bread: 'Хлеб', toast: 'Гренки', pelmeni: 'Пельмени'
    };
    return map[id] || def.id;
  }

  /** Тик готовки (внутри fireTick главного). */
  function cookTick(dt) {
    var g = G();
    var p = g && g.player;
    if (!p || !p.cookProgress) return;
    var cp = p.cookProgress;
    if (p.sleeping) {
      p.cookProgress = null;
      toast('Еда пригорела, пока вы спали...', 'warn');
      return;
    }
    if (!fireForCooking()) {
      p.cookProgress = null;
      toast('Вы отошли от огня — стряпня пропала', 'warn');
      return;
    }
    cp.t += gMin(dt);
    if (cp.t < cp.dur) return;

    // готово!
    p.cookProgress = null;
    if (invConsume(cp.id, 1) <= 0) {
      toast('Продукт исчез из котелка?!', 'warn');
      return;
    }
    invGive(cp.out, 1);
    if (g.stats) g.stats.mealsCooked = (g.stats.mealsCooked || 0) + 1;

    // горячая еда греет изнутри (temperature.js)
    if (WS.Temp && WS.Temp.warmMeal) {
      try { WS.Temp.warmMeal(90); } catch (e) { /* пусто */ }
    }
    // опыт готовки
    addCookXp(COOK_XP);

    snd('craft', 0.6);
    toast('Готово: ' + itemName(cp.out), 'good');
    try { WS.Ev.emit('fire:cooked', { id: cp.id, out: cp.out }); } catch (e2) { /* пусто */ }
  }

  /** Опыт готовки с уровнем. */
  function addCookXp(n) {
    var p = P();
    if (!p || !p.skills || !p.skills.cook) return;
    var sk = p.skills.cook;
    sk.xp = (sk.xp || 0) + n;
    while (sk.xp >= (sk.lv + 1) * COOK_XP_PER_LV && sk.lv < 10) {
      sk.xp -= (sk.lv + 1) * COOK_XP_PER_LV;
      sk.lv++;
      toast('Навык готовки: уровень ' + sk.lv, 'good');
      try { WS.Ev.emit('player:levelup', { skill: 'cook', level: sk.lv }); } catch (e) { /* пусто */ }
    }
  }

  // ====================================================================
  //  РАСТАПЛИВАНИЕ СНЕГА
  //  meltSnow(): нужна ёмкость — котелок (многоразовый) или пустая
  //  фляга — и огонь рядом. 15 игровых минут -> water_flask.
  // ====================================================================

  function meltSnow() {
    var g = G();
    var p = g && g.player;
    if (!p) return { ok: false, reason: 'нет партии' };
    if (p.sleeping) return { ok: false, reason: 'во сне не растопишь' };
    if (p._melt) return { ok: false, reason: 'уже тает' };
    if (!fireForCooking()) {
      toast('Нужен огонь поблизости', 'warn');
      return { ok: false, reason: 'нет огня' };
    }
    var via = null;
    if (invCount('pot') > 0) via = 'pot';
    else if (invCount('flask_empty') > 0) via = 'flask';
    if (!via) {
      toast('Нужна ёмкость: котелок или пустая фляга', 'warn');
      return { ok: false, reason: 'нет ёмкости' };
    }
    p._melt = { t: 0, dur: MELT_DUR, via: via };
    toast('Растапливаем снег...', 'info');
    return { ok: true };
  }

  /** Тик таяния. */
  function meltTick(dt) {
    var g = G();
    var p = g && g.player;
    if (!p || !p._melt) return;
    var m = p._melt;
    if (p.sleeping) {
      p._melt = null;
      return;
    }
    if (!fireForCooking()) {
      p._melt = null;
      toast('Снег застыл — нет огня рядом', 'warn');
      return;
    }
    m.t += gMin(dt);
    if (m.t < m.dur) return;
    p._melt = null;

    if (m.via === 'flask') {
      if (invConsume('flask_empty', 1) <= 0) {
        toast('Фляга куда-то делась', 'warn');
        return;
      }
    }
    invGive('water_flask', 1);
    // талая вода у огня — чистая
    snd('drink', 0.4);
    toast('Снег растоплен: полная фляга воды', 'good');
    try { WS.Ev.emit('fire:melted', { out: 'water_flask' }); } catch (e) { /* пусто */ }
  }

  // ====================================================================
  //  ВОССТАНОВЛЕНИЕ ОГНЕЙ ПОСЛЕ ЗАГРУЗКИ СЕЙВА
  //  Мир регенерируется из seed — объекты получают те же id. Наши
  //  записи G.fires пережили сейв (простые поля), объекты находим по id
  //  или по координатам.
  // ====================================================================

  function restoreFires() {
    var g = G();
    var w = W();
    if (!g || !w) return;
    rebuildIndex();
    var arr = fires();
    for (var i = arr.length - 1; i >= 0; i--) {
      var e = arr[i];
      var o = objById(e.objId);
      if (e.kind === 'camp') {
        if (o && String(o.sprName || '') === 'campfire') {
          o.fireData = { fuel: e.fuel, max: e.max };
          applyStage(e);
          continue;
        }
        // объекта нет — создаём заново (горящий или погасший)
        var o2 = w.addObject({
          x: e.x, y: e.y,
          sprName: e.out ? 'campfire_out' : 'campfire',
          sprFrame: 0,
          solid: true,
          name: e.out ? 'Погасший костёр' : 'Костёр',
          light: e.out ? 0 : CAMP_LIGHT,
          fireLight: !e.out
        });
        if (!e.out) {
          e.fuel = Math.max(5, e.fuel);
          o2.fireData = { fuel: e.fuel, max: e.max };
        }
        e.objId = o2.id;
        applyStage(e);
      } else if (e.kind === 'stove') {
        // ищем печь по координатам (id мог смениться)
        var st = findStoveAt(e.x, e.y) || (isStove(o) ? o : null);
        if (!st) {
          arr.splice(i, 1);        // печь не пережила генерацию
          continue;
        }
        e.objId = st.id;
        e.x = st.x; e.y = st.y;
        if (e.fuel > 0) {
          st.fire = true;
          st.fireData = { fuel: e.fuel, max: e.max };
          if (w.addLight) {
            st._light = w.addLight({ x: st.x, y: st.y - 0.3, r: STOVE_LIGHT, a: 0.9, flicker: true, fire: true });
          }
        } else {
          removeEntryObject(e);
        }
      }
    }
  }

  /** Печь в окрестности точки (регенерация могла сдвинуть на тайл). */
  function findStoveAt(x, y) {
    var w = W();
    if (!w || !w.query) return null;
    var list;
    try { list = w.query(x - 1.5, y - 1.5, x + 1.5, y + 1.5); }
    catch (e) { return null; }
    var best = null, bd = 2;
    for (var i = 0; i < list.length; i++) {
      var o = list[i];
      if (!o || o.hp) continue;
      if (!isStove(o)) continue;
      var d = WS.M.dist(x, y, o.x, o.y);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  // ====================================================================
  //  ГЛАВНЫЙ ТИК (приоритет 20 — мир)
  // ====================================================================

  function fireTickMain(dt) {
    var g = G();
    if (!g || !g.running || g.dead) return;
    sysTime += dt;
    var arr = fires();
    if (!arr) return;
    var p = P();

    try {
      var pd = p ? { x: p.x, y: p.y } : null;
      for (var i = arr.length - 1; i >= 0; i--) {
        var e = arr[i];
        if (!e) { arr.splice(i, 1); continue; }
        if (e.out) continue;                    // погасший костёр не горит
        var d = pd ? WS.M.dist(pd.x, pd.y, e.x, e.y) : null;
        fireTick(e, dt, pd, d);
      }
      // стряпня и таяние (только когда игрок жив)
      if (p && !g.dead) {
        cookTick(dt);
        meltTick(dt);
      }
    } catch (err) {
      WS.err('fireTick:', err && err.message);
    }
  }

  // ====================================================================
  //  СБРОС / СТАРТ ПАРТИИ
  // ====================================================================

  function onGameStart() {
    var g = G();
    if (!g) return;
    g.fires = [];
    sparkT = {};
    nextFireId = 1;
    sysTime = 0;
    rebuildIndex();
    var p = g.player;
    if (p) {
      p.cookProgress = null;
      p._melt = null;
    }
  }

  function onGameLoad() {
    sysTime = 0;
    sparkT = {};
    restoreFires();
  }

  // ====================================================================
  //  САМОТЕСТ
  // ====================================================================

  function selftest() {
    var out = [];
    var pass = 0, fail = 0;
    function ok(name, cond) {
      if (cond) { pass++; out.push('  ok   ' + name); }
      else { fail++; out.push('  FAIL ' + name); }
      return !!cond;
    }
    ok('модуль зарегистрирован', !!WS.Fire);
    ok('котёл объявлен', !!(WS.Data && WS.Data.items && WS.Data.items.pot));
    ok('топливо: log=60', FUEL_VALUE.log === 60);
    ok('спрайт campfire есть', !!(WS.Spr && WS.Spr.get && WS.Spr.get('campfire', 2, 0)));
    ok('спрайт campfire_out есть', !!(WS.Spr && WS.Spr.get && WS.Spr.get('campfire_out', 0, 0)));
    var p = P();
    if (p) {
      var r1 = lightCampfire(-1, -1);          // вне карты — откажет
      ok('костёр вне мира не разводится', r1.ok === false);
      ok('cookable() — массив', typeof cookable().length === 'number');
      ok('fireForCooking — булево', typeof fireForCooking() === 'boolean');
      ok('heatAt — число', typeof heatAt(p.x, p.y) === 'number');
    }
    out.unshift('fire.selftest: ' + pass + ' ок, ' + fail + ' провалено');
    return out;
  }

  // ====================================================================
  //  ПУБЛИЧНЫЙ API
  // ====================================================================

  var Fire = {
    // --- разведение ---
    lightCampfire: lightCampfire,
    lightStove: lightStove,
    addFuel: addFuel,
    extinguish: extinguish,

    // --- поиск ---
    near: near,
    heatAt: heatAt,
    isStove: isStove,
    count: function () {
      var arr = fires(), n = 0;
      if (!arr) return 0;
      for (var i = 0; i < arr.length; i++) if (!arr[i].out) n++;
      return n;
    },
    fires: function () { return fires() || []; },

    // --- готовка ---
    cook: cook,
    cookable: cookable,
    meltSnow: meltSnow,
    isCooking: function () {
      var p = P();
      return !!(p && (p.cookProgress || p._melt));
    },
    cookingInfo: function () {
      var p = P();
      if (!p) return null;
      if (p.cookProgress) {
        return { what: p.cookProgress.id, out: p.cookProgress.out,
                 t: p.cookProgress.t, dur: p.cookProgress.dur, kind: 'cook' };
      }
      if (p._melt) {
        return { what: 'snow', out: 'water_flask',
                 t: p._melt.t, dur: p._melt.dur, kind: 'melt' };
      }
      return null;
    },

    /** Топливо игрока (для UI): [{id, val, count}]. */
    fuelAvailable: function () {
      var out = [];
      var ids = fuelIds();
      for (var i = 0; i < ids.length; i++) {
        var c = invCount(ids[i]);
        if (c > 0) out.push({ id: ids[i], val: FUEL_VALUE[ids[i]], count: c });
      }
      return out;
    },

    /** Данные записи огня (для UI костра). */
    info: function (e) {
      if (!e) return null;
      return {
        kind: e.kind, x: e.x, y: e.y,
        fuel: Math.round(e.fuel), max: e.max,
        frac: Math.round(fuelFrac(e) * 100) / 100,
        out: !!e.out,
        hazard: Math.round(e.hazard || 0)
      };
    },

    /** Внутреннее время модуля. */
    time: function () { return sysTime; },

    selftest: selftest
  };

  WS.def('Fire', Fire);

  // ====================================================================
  //  BOOT
  // ====================================================================

  WS.boot(function initFire() {
    // спрайты и предметы
    defSprites();
    declareItems();

    // тик огня — приоритет 20 (миро; до систем, чтобы Temp видел жар)
    WS.tick(TICK_PRI, fireTickMain, 'sys:fire');

    // индекс объектов мира
    WS.Ev.on('obj:add', indexAdd);
    WS.Ev.on('obj:remove', indexRemove);

    // старт/загрузка партии
    WS.Ev.on('game:start', onGameStart);
    WS.Ev.on('game:load', onGameLoad);

    WS.log('fire: огонь зарегистрирован (тик ' + TICK_PRI + ')');
  }, 'fire:init');

})();
