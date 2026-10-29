/**
 * hunting.js — ОХОТА И РАЗДЕЛКА «Белого Безмолвия»: следы зверей на снегу
 * (свежесть 30 игровых минут, видимость и читка по навыку track), разделка
 * туш ножом (мясо старше суток портится), приманка на хищников, берестяной
 * манок на оленя, кровавый след раненого зверя (волки сбегаются на 'blood'),
 * падальщики растаскивают брошенные туши. Связи: ai/animals.js (существа;
 * их декоративные отпечатки заменяются нашими), systems/looting.js
 * (трупы-контейнеры: Loot.search/takeAll/makeCorpse), systems/skills.js
 * (XP track/forage), world/world.js (объекты, события, entsNear).
 */
(function () {
  'use strict';

  // ====================================================================
  //  КОНСТАНТЫ
  // ====================================================================

  var TICK_AI = 51;             // после ИИ (50): следы по факту движения
  var TICK_WORLD = 22;          // мир (после снега/огня): приманки, падальщики
  var INTERACT_R = 1.5;         // радиус досягаемости (как actions.js)

  // ---- следы -------------------------------------------------------
  var TRACK_STEP = 2.0;          // тайла пути между отпечатками (по ТЗ)
  var TRACK_FRESH_MIN = 30;      // игровых минут жизни следа (по ТЗ)
  var TRACK_FRESH_SOON = 15;    // до этого возраста «свежий» (виден с ур. 1)
  var TRACK_CAP = 140;           // максимум живых отпечатков
  var LV_SEE_FRESH = 1;         // ур.1: видны свежие следы
  var LV_SEE_ALL = 3;            // ур.3: видны все следы
  var LV_SEE_DIR = 5;            // ур.5: стрелка направления
  var LV_TOAST = 7;              // ур.7: подсказка «След ведёт на север»
  var LV_KIND = 2;               // ур.2: узнают, чей след

  // ---- разделка ------------------------------------------------------
  var SPOIL_DAYS = 1;            // сутки после смерти — мясо портится
  var BUTCHER_DUR = [0, 1.6, 3.2, 4.2, 6.0]; // сек по «размеру» туши 1..4
  var XP_BUTCHER_FORAGE = 2;     // + размер туши
  var XP_BUTCHER_TRACK = 1;      // + размер/2

  // ---- кровь ---------------------------------------------------------
  var BLEED_TRIGGER_HP = 0.55;   // ниже 55% hp зверь оставляет кровь
  var BLEED_MIN = 18;            // игровых минут кровит раненый зверь
  var BLEED_STEP = 1.5;          // тайла пути между каплями
  var BLEED_CAP = 40;            // максимум меток крови
  var BLOOD_SMELL_R = 10;        // радиус события 'blood'

  // ---- приманка ------------------------------------------------------
  var BAIT_LIFE_MIN = 120;       // игровых минут лежит (потом замело)
  var BAIT_PULSE_SEC = 8;        // раз в сколько секунд «пахнет»
  var BAIT_EAT_R = 1.0;          // хищник в радиусе — съел приманку
  var BAITS = { meat_raw: 1, meat_spoiled: 1 }; // что годится в приманку

  // ---- манок ---------------------------------------------------------
  var CALL_RANGE = 20;           // тайлов: олени слышат манок
  var CALL_DUR = 10;              // сек идут на зов
  var CALL_KEEP_DIST = 9.5;      // подходят не ближе (дневное чутьё 8)
  var CALL_CD = 45;               // сек перезарядка манка
  var CALL_FAIL = 0.25;          // шанс, что олени не отозвались

  // ---- падальщики ----------------------------------------------------
  var SCAV_DELAY_MIN = 25;       // минут до того, как звери найдут тушу
  var SCAV_CHANCE = 0.30;        // шанс за игровую минуту при хищнике рядом
  var SCAV_R = 6;                // радиус поиска хищника

  // ---- чьи следы снимаем ----------------------------------------------
  var TRACK_KINDS = { deer: 1, hare: 1, wolf: 1, bear: 1, bandit: 1 };
  var TRACK_SPR = {
    deer: 'foot_deer', hare: 'foot_hare', wolf: 'foot_wolf',
    bear: 'foot_bear', bandit: 'footprint'   // сапоги человека
  };
  var KIND_GEN = {
    deer: 'оленя', hare: 'зайца', wolf: 'волка',
    bear: 'медведя', bandit: 'человека', crow: 'вороны', fish: 'рыбы'
  };
  var KIND_NOM = {
    deer: 'олень', hare: 'заяц', wolf: 'волк',
    bear: 'медведь', bandit: 'человек', crow: 'ворона', fish: 'рыба'
  };
  var KIND_SIZE = {
    hare: 1, crow: 1, fish: 1, deer: 2, wolf: 3, bear: 4, bandit: 1
  };
  var DIR_NAME = ['север', 'северо-восток', 'восток', 'юго-восток',
                  'юг', 'юго-запад', 'запад', 'северо-запад'];
  var DIRV = [[0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0], [1, 1]];

  // ====================================================================
  //  СОСТОЯНИЕ МОДУЛЯ
  // ====================================================================

  var trks = [];        // следы: {o, x, y, kind, dir, tmin}
  var splats = [];      // кровь: {o, tmin}
  var baits = [];       // приманки: {o, item, tmin, pulse}
  var corpses = [];     // трупы: {o, kind, deathMin}
  var action = null;    // текущая длительная работа: {type, o, t, dur, mk}
  var call = null;      // активный зов манка: {t, deer, cd}
  var lastToastAt = {}; // защита от спама тостов
  var lastInteractMs = 0; // анти-дубль E + ПКМ

  // ====================================================================
  //  МЕЛКИЕ ПОМОЩНИКИ
  // ====================================================================

  function G() { return WS.G; }
  function P() { return (WS.G && WS.G.player) || null; }

  function running() {
    var g = WS.G;
    return !!(g && g.running && !g.dead && g.player && g.player.hp > 0);
  }

  /** Ввод свободен: нет модального экрана, ввод не отключён. */
  function uiFree() {
    try {
      if (WS.Ui && WS.Ui.modal && WS.Ui.modal()) return false;
      if (WS.Input && WS.Input.isEnabled && !WS.Input.isEnabled()) return false;
    } catch (e) { return false; }
    return true;
  }

  function t9(key, fallback) {
    try {
      if (WS.I18N && WS.I18N.t) return WS.I18N.t(key, fallback);
    } catch (e) { /* пусто */ }
    return fallback;
  }

  function toast(text, kind) {
    try {
      if (WS.Ui && WS.Ui.toast) { WS.Ui.toast(text, kind || 'info'); return; }
    } catch (e) { /* пусто */ }
    try { WS.Ev.emit('ui:toast', { text: text, kind: kind || 'info' }); } catch (e2) { /* пусто */ }
  }

  /** Тост не чаще, чем раз в gateMs — защита от спама. */
  function toastOnce(key, text, kind, gateMs) {
    var now = Date.now();
    if (lastToastAt[key] && now - lastToastAt[key] < (gateMs || 4000)) return;
    lastToastAt[key] = now;
    toast(text, kind);
  }

  function sndAt(name, x, y, vol) {
    try {
      if (WS.Snd && WS.Snd.play) WS.Snd.play(name, { x: x, y: y, vol: vol });
    } catch (e) { /* пусто */ }
  }

  function fxText(str, x, y, o) {
    try { if (WS.Fx && WS.Fx.text) WS.Fx.text(str, x, y, o); } catch (e) { /* пусто */ }
  }

  function fxBurst(type, x, y, n, o) {
    try { if (WS.Fx && WS.Fx.burst) WS.Fx.burst(type, x, y, n || 4, o); } catch (e) { /* пусто */ }
  }

  function itemName(id) { return t9('item.' + id + '.name', id); }

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  function trackLv() {
    try {
      if (WS.Skills && WS.Skills.lvid) return WS.Skills.lvid('track');
    } catch (e) { /* пусто */ }
    var p = P();
    return (p && p.skills && p.skills.track) ? (p.skills.track.lv || 0) : 0;
  }

  function addXp(id, n, reason) {
    try {
      if (WS.Skills && WS.Skills.addXp) WS.Skills.addXp(id, n, reason);
    } catch (e) { /* пусто */ }
  }

  /** Есть ли предмет в инвентаре или в руках. */
  function hasItem(id) {
    var p = P();
    if (!p) return 0;
    var n = 0;
    try { if (WS.Inv && WS.Inv.count) n = WS.Inv.count(id); } catch (e) { /* пусто */ }
    if (n > 0) return n;
    var eq = p.equip;
    if (eq && eq.hand1 && eq.hand1.id === id) n++;
    if (eq && eq.hand2 && eq.hand2.id === id) n++;
    return n;
  }

  function consumeItem(id, n) {
    try {
      if (WS.Inv && WS.Inv.consume) return WS.Inv.consume(id, n || 1);
    } catch (e) { /* пусто */ }
    return 0;
  }

  function giveItem(id, n, opts) {
    try {
      if (WS.Inv && WS.Inv.give) return WS.Inv.give(id, n, opts);
    } catch (e) { /* пусто */ }
    return 0;
  }

  /** Нож (тег cutting/skinning) в инвентаре или руке. */
  function hasKnife() {
    var p = P();
    if (!p) return null;
    var ids = [];
    try {
      if (p.inv) {
        for (var i = 0; i < p.inv.length; i++) {
          var it = p.inv[i];
          if (it && it.id && ids.indexOf(it.id) < 0) ids.push(it.id);
        }
      }
    } catch (e) { /* пусто */ }
    var eq = p.equip;
    if (eq) {
      if (eq.hand1) ids.push(eq.hand1.id);
      if (eq.hand2) ids.push(eq.hand2.id);
    }
    for (var k = 0; k < ids.length; k++) {
      var def = (WS.Data && WS.Data.items) ? WS.Data.items[ids[k]] : null;
      if (def && def.tags) {
        if (def.tags.indexOf('cutting') >= 0 || def.tags.indexOf('skinning') >= 0) return ids[k];
      }
    }
    return null;
  }

  /** Мировая позиция -> экранная (как в gfx.drawSorted). */
  function toScreenPos(wx, wy) {
    var cam = WS.Cam;
    if (!cam) return { x: 0, y: 0 };
    var s = WS.M.toScreen(wx - cam.cx - (cam._shakeX || 0), wy - cam.cy - (cam._shakeY || 0));
    var c = cam.canvasCenter();
    return { x: c.x + s.x * cam.zoom, y: c.y + s.y * cam.zoom };
  }

  /** Экранный угол направления dir (для стрелок/поворота следов). */
  var footAng = null;
  function angForDir(dir) {
    if (!footAng) {
      footAng = [];
      for (var d = 0; d < 8; d++) {
        var s = WS.M.toScreen(DIRV[d][0], DIRV[d][1]);
        footAng.push(Math.atan2(s.y, s.x) + Math.PI / 2);
      }
    }
    return footAng[(dir || 0) & 7];
  }

  /** Полоска прогресса над точкой (рисуется в мировых координатах). */
  function drawBar(ctx, x, y, zoom, label, pct, col) {
    try {
      var w = 36 * zoom, h = 5 * zoom;
      pct = clamp(pct, 0, 1);
      ctx.fillStyle = 'rgba(8,12,22,0.78)';
      ctx.fillRect(x - w / 2 - zoom, y - zoom, w + 2 * zoom, h + 2 * zoom);
      ctx.fillStyle = col || '#d8a45c';
      ctx.fillRect(x - w / 2, y, w * pct, h);
      if (label) {
        ctx.font = 'bold ' + Math.max(8, Math.round(9 * zoom)) + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#e8e2d0';
        ctx.fillText(label, x, y - 3 * zoom);
        ctx.textAlign = 'left';
      }
    } catch (e) { /* рисование — косметика */ }
  }

  /** Невидимый объект-маркер с полоской прогресса (label/pct — функции). */
  function makeMarker(x, y, labelFn, pctFn, colFn) {
    var o = WS.World.addObject({
      x: x, y: y, sprName: null, solid: false, shadow: false,
      name: '', hunt: 'marker'
    });
    o.render = function (ctx, sx, sy, zoom) {
      drawBar(ctx, sx, sy - 30 * zoom, zoom, labelFn(), pctFn(), colFn ? colFn() : '#d8a45c');
    };
    return o;
  }

  function dropMarker(mk) {
    try {
      if (mk && !mk.removed) WS.World.removeObject(mk);
    } catch (e) { /* пусто */ }
  }

  // ====================================================================
  //  СПРАЙТЫ (следы зверей, приманка, кровь, кости)
  // ====================================================================

  function defHuntSprites() {
    var S = WS.Spr;

    // ---- след оленя: две раздвоенные копыта рядом, 18x10 ----
    S.def('foot_deer', { w: 18, h: 10, draw: function (c, W, H, frame, dir) {
      var ang = angForDir(dir);
      c.save();
      c.translate(W / 2, H / 2);
      c.rotate(ang);
      // «носком вверх»: два копыта одно за другим (шаг)
      S.ell(c, 0, -2.5, 2.6, 1.5, '#7d8ea3');
      S.ell(c, 0, 2.5, 2.6, 1.5, '#8b9bad');
      // раздвоенность кончика
      S.px(c, -1, -4.5, 1, 2, '#6d7e93');
      S.px(c, 1, -4.5, 1, 2, '#6d7e93');
      c.restore();
    }});

    // ---- след зайца: крупные задние + мелкие передние, 14x12 ----
    S.def('foot_hare', { w: 14, h: 12, draw: function (c, W, H, frame, dir) {
      var ang = angForDir(dir);
      c.save();
      c.translate(W / 2, H / 2);
      c.rotate(ang);
      // задние лапы — вытянутые «запятые»
      S.ell(c, -2.5, -1, 2.4, 1.7, '#8b9bad');
      S.ell(c, 2.5, -1, 2.4, 1.7, '#7d8ea3');
      // передние — маленькие точки впереди
      S.ell(c, -1.4, 3.4, 1.1, 0.9, '#98a8ba');
      S.ell(c, 1.4, 3.4, 1.1, 0.9, '#98a8ba');
      c.restore();
    }});

    // ---- след волка: ладошка + 4 пальца с когтями, 16x14 ----
    S.def('foot_wolf', { w: 16, h: 14, draw: function (c, W, H, frame, dir) {
      var ang = angForDir(dir);
      c.save();
      c.translate(W / 2, H / 2);
      c.rotate(ang);
      // подушечка
      S.ell(c, 0, 2, 3.4, 2.6, '#7d8ea3');
      S.ell(c, 0, 2.6, 2.2, 1.6, '#8b9bad');
      // пальцы
      S.ell(c, -2.8, -2.2, 1.2, 1.5, '#8b9bad');
      S.ell(c, -0.9, -3.1, 1.2, 1.5, '#8b9bad');
      S.ell(c, 0.9, -3.1, 1.2, 1.5, '#8b9bad');
      S.ell(c, 2.8, -2.2, 1.2, 1.5, '#8b9bad');
      // когти
      S.px(c, -3.4, -4.6, 1, 2, '#6d7e93');
      S.px(c, -1.2, -5.4, 1, 2, '#6d7e93');
      S.px(c, 1.0, -5.4, 1, 2, '#6d7e93');
      S.px(c, 3.2, -4.6, 1, 2, '#6d7e93');
      c.restore();
    }});

    // ---- след медведя: широкая пясть + 5 пальцев, 20x16 ----
    S.def('foot_bear', { w: 20, h: 16, draw: function (c, W, H, frame, dir) {
      var ang = angForDir(dir);
      c.save();
      c.translate(W / 2, H / 2);
      c.rotate(ang);
      // пясть
      S.ell(c, 0, 3, 4.4, 3.2, '#71829a');
      S.ell(c, 0, 3.8, 2.8, 1.9, '#7d8ea3');
      // пять пальцев
      S.ell(c, -4.6, -2.0, 1.4, 1.7, '#8b9bad');
      S.ell(c, -2.4, -3.4, 1.4, 1.7, '#8b9bad');
      S.ell(c, 0, -4.0, 1.4, 1.7, '#8b9bad');
      S.ell(c, 2.4, -3.4, 1.4, 1.7, '#8b9bad');
      S.ell(c, 4.6, -2.0, 1.4, 1.7, '#8b9bad');
      // когти
      S.px(c, -5.2, -4.4, 1, 2, '#5f7188');
      S.px(c, -2.8, -5.8, 1, 2, '#5f7188');
      S.px(c, -0.5, -6.2, 1, 2, '#5f7188');
      S.px(c, 1.8, -5.8, 1, 2, '#5f7188');
      S.px(c, 4.2, -4.4, 1, 2, '#5f7188');
      c.restore();
    }});

    // ---- приманка: кусок мяса на снегу, 20x12 ----
    S.def('bait_meat', { w: 20, h: 12, draw: function (c) {
      // подтёк крови
      S.ell(c, 10, 9, 8, 2.4, 'rgba(122,32,32,0.45)');
      // сам кусок
      S.ell(c, 10, 6, 6, 3.2, '#8f3a34');
      S.ell(c, 8, 5, 3.4, 1.8, '#a84a40');
      // жила и жир
      S.px(c, 6, 4, 6, 1, '#c26a5c');
      S.px(c, 13, 7, 3, 1, '#d8cfc0');
      // снежная кромка
      S.ell(c, 10, 10, 8.4, 2, 'rgba(226,232,240,0.5)');
    }});

    // ---- капля/мазок крови, 14x10 ----
    S.def('blood_splat', { w: 14, h: 10, draw: function (c) {
      S.ell(c, 7, 5, 3.2, 2.2, 'rgba(122,32,32,0.55)');
      S.ell(c, 4, 4, 1.4, 1.1, 'rgba(143,42,38,0.5)');
      S.ell(c, 10.4, 6.4, 1.2, 0.9, 'rgba(143,42,38,0.45)');
      S.px(c, 8, 2, 1, 1, 'rgba(122,32,32,0.4)');
    }});

    // ---- обглоданные кости (осталось после разделки/падальщиков), 44x20 ----
    S.def('carcass_remains', { w: 44, h: 20, draw: function (c) {
      // рёбра
      S.px(c, 12, 6, 18, 1, '#cfd4da');
      S.px(c, 14, 9, 14, 1, '#c3c9d1');
      S.px(c, 16, 12, 10, 1, '#b8bfc8');
      // позвонки
      S.ell(c, 10, 5, 2, 1.6, '#dde2e8');
      S.ell(c, 15, 5, 2, 1.6, '#dde2e8');
      S.ell(c, 20, 5, 2, 1.6, '#dde2e8');
      S.ell(c, 25, 5, 2, 1.6, '#dde2e8');
      // череп
      S.ell(c, 33, 7, 3.4, 2.6, '#dde2e8');
      S.px(c, 34, 8, 3, 1, '#98a0ab');   // глазница
      S.px(c, 36, 9, 2, 1, '#98a0ab');
      // лопатка
      S.ell(c, 6, 10, 3.2, 2.2, '#c8ced6');
      // старая кровь под костями
      S.ell(c, 22, 16, 15, 3, 'rgba(96,28,28,0.30)');
      S.ell(c, 30, 15, 6, 2, 'rgba(122,32,32,0.25)');
    }});
  }

  // ====================================================================
  //  ПРЕДМЕТЫ И РЕЦЕПТЫ (паттерн recipes.js: addIfMissing)
  // ====================================================================

  function defHuntItems() {
    WS.Data = WS.Data || {};
    WS.Data.items = WS.Data.items || {};
    var items = WS.Data.items;

    function addIfMissing(o) {
      if (!o || !o.id || items[o.id]) return;
      items[o.id] = o;
    }

    // тухлое мясо: старые туши (sick на сыром, на волка — всё ещё приманка)
    addIfMissing({
      id: 'meat_spoiled', cat: 'food', w: 0.45, stack: 6,
      cal: 220, thir: -14, per: 0, sick: 55, sanity: -2,
      tags: ['edible', 'wolf_bait']
    });

    // берестяной манок (крафт — ниже)
    addIfMissing({
      id: 'deer_call', cat: 'tool', w: 0.25, stack: 1,
      tags: ['hunting']
    });

    // рецепты
    WS.Data.recipes = WS.Data.recipes || [];
    WS.Data.recipesById = WS.Data.recipesById || {};
    var known = {};
    var i;
    for (i = 0; i < WS.Data.recipes.length; i++) known[WS.Data.recipes[i].id] = 1;

    function addRecipe(r) {
      if (!r || !r.id || known[r.id]) return;
      known[r.id] = 1;
      WS.Data.recipes.push(r);
      WS.Data.recipesById[r.id] = r;
    }

    // манок из бересты (бересту собирает модуль собирательства)
    addRecipe({
      id: 'deer_call', name: 'Манок на оленя', cat: 'survival',
      station: null, time: 4,
      req: [{ id: 'birch_bark', n: 2 }],
      tools: ['knife'],
      out: [{ id: 'deer_call', n: 1 }],
      skill: { id: 'track', lv: 0 }
    });
  }

  // ====================================================================
  //  СЛЕДЫ: ДВИГАТЕЛЬ
  // ====================================================================

  /** Отпечаток: объект с кастомной отрисовкой (альфа свежести + стрелка). */
  function placeTrack(e, x, y, dx, dy) {
    var kind = e.kind;
    var spr = TRACK_SPR[kind];
    if (!spr) return;
    var dir = WS.M.dir8(dx, dy);
    var rec = {
      x: x, y: y, kind: kind, dir: dir,
      tmin: WS.Time.totalMin()
    };
    var o = WS.World.addObject({
      x: x, y: y, sprName: null, solid: false, shadow: false,
      name: 'След', hunt: 'track',
      kind: kind, dir: dir, tmin: rec.tmin, fspr: spr, _rec: rec
    });
    o.render = trackRender;
    rec.o = o;
    trks.push(rec);
    if (trks.length > TRACK_CAP) {
      var old = trks.shift();
      removeTrack(old);
    }
    // чутьё следопыта: ур.7 — подсказка игроку о свежем следе рядом
    try {
      var p = P();
      if (p && trackLv() >= LV_TOAST &&
          WS.M.dist(p.x, p.y, x, y) < 10 && kind !== 'bandit') {
        toastOnce('trackhint' + kind,
          t9('hunt.track_leads', 'След ведёт на ' + DIR_NAME[dir] + '…'), 'info', 9000);
      }
    } catch (err) { /* пусто */ }
  }

  function trackRender(ctx, sx, sy, zoom) {
    try {
      var o = this;
      var img = WS.Spr.get(o.fspr, 0, o.dir);
      if (!img) return;
      var ageMin = WS.Time.totalMin() - o.tmin;
      var fr = clamp(1 - ageMin / TRACK_FRESH_MIN, 0, 1); // 1 — свежий
      ctx.globalAlpha = 0.35 + 0.55 * fr;
      ctx.drawImage(img,
        sx - img.width * zoom / 2,
        sy - img.height * zoom / 2,
        img.width * zoom, img.height * zoom);
      ctx.globalAlpha = 1;
      // ур.5: стрелка направления движения
      if (trackLv() >= LV_SEE_DIR) {
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(angForDir(o.dir));
        ctx.strokeStyle = 'rgba(120,180,220,0.85)';
        ctx.lineWidth = Math.max(1, 1.4 * zoom);
        ctx.beginPath();
        ctx.moveTo(0, 6 * zoom);
        ctx.lineTo(0, -6 * zoom);
        ctx.moveTo(-2.6 * zoom, -3.2 * zoom);
        ctx.lineTo(0, -6 * zoom);
        ctx.lineTo(2.6 * zoom, -3.2 * zoom);
        ctx.stroke();
        ctx.restore();
      }
    } catch (e) { /* след — косметика */ }
  }

  function removeTrack(rec) {
    if (!rec) return;
    var i = trks.indexOf(rec);
    if (i >= 0) trks.splice(i, 1);
    try {
      if (rec.o && !rec.o.removed) WS.World.removeObject(rec.o);
    } catch (e) { /* пусто */ }
  }

  /** Виден ли след игроку с данным навыком. */
  function canSeeTrack(lv, ageMin) {
    if (lv >= LV_SEE_ALL) return true;
    if (lv >= LV_SEE_FRESH) return ageMin <= TRACK_FRESH_SOON;
    return false;
  }

  /** Тик следов: замер пути существ + старение + видимость. */
  function tracksTick(dt) {
    if (!running()) return;
    var w = WS.World;
    var list = w.ents;
    var lv = trackLv();
    var i, e;

    // --- отпечатки: каждые TRACK_STEP тайлов пути ---
    for (i = 0; i < list.length; i++) {
      e = list[i];
      if (!e || e.dead || !TRACK_KINDS[e.kind]) continue;
      if (e.x === undefined || e.y === undefined) continue;
      if (e._hx === undefined) {
        e._hx = e.x; e._hy = e.y; e._path = 0;
        continue;
      }
      var dx = e.x - e._hx, dy = e.y - e._hy;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d < 0.03) continue;
      e._path = (e._path || 0) + d;
      if (e._path >= TRACK_STEP) {
        e._path = 0;
        placeTrack(e, e._hx + dx * 0.5, e._hy + dy * 0.5, dx, dy);
      }
      e._hx = e.x; e._hy = e.y;
    }

    // --- старение и видимость ---
    var now = WS.Time.totalMin();
    for (i = trks.length - 1; i >= 0; i--) {
      var rec = trks[i];
      if (!rec.o || rec.o.removed) { trks.splice(i, 1); continue; }
      var age = now - rec.tmin;
      if (age >= TRACK_FRESH_MIN) { removeTrack(rec); continue; }
      rec.o.hidden = !canSeeTrack(lv, age);
    }

    // --- кровавый след раненых зверей ---
    bloodTick(dt);

    // --- активный зов манка ---
    callTick(dt);

    // --- длительная работа (разделка) ---
    actionTick(dt);
  }

  /** Информация о следе на тайле (для E-осмотра и чужих модулей). */
  function trackInfo(x, y) {
    var best = null, bd = 0.9;
    var now = WS.Time.totalMin();
    for (var i = 0; i < trks.length; i++) {
      var rec = trks[i];
      if (!rec.o || rec.o.removed) continue;
      var d = WS.M.dist(rec.x, rec.y, x, y);
      if (d < bd) { bd = d; best = rec; }
    }
    if (!best) return null;
    var age = now - best.tmin;
    var fresh = age <= 10 ? 'Свежий' : (age <= TRACK_FRESH_SOON ? 'Недавний' : 'Старый');
    return {
      kind: best.kind,
      dir: best.dir,
      dirName: DIR_NAME[best.dir],
      ageMin: age,
      fresh: fresh,
      o: best.o
    };
  }

  /** Осмотр следа по E (навык решает, что видно). */
  function examineTrack(o) {
    var lv = trackLv();
    if (lv < LV_SEE_FRESH) {
      toastOnce('notrack', t9('hunt.no_skill', 'Ваши глаза скользят по снегу — нужно чутьё следопыта (навык track)'), 'info');
      return true;
    }
    var rec = o._rec;
    if (!rec) return true;
    var info = trackInfo(rec.x, rec.y);
    var who = (lv >= LV_KIND && KIND_GEN[rec.kind]) ? KIND_GEN[rec.kind] : 'зверя';
    var txt = info.fresh + ' след ' + who;
    if (lv >= LV_SEE_DIR) txt += ', идёт на ' + info.dirName;
    toast(txt, 'info');
    fxText(txt, rec.x, rec.y - 0.8, { col: '#a9c2d8', life: 2.2, size: 13 });
    sndAt('click', rec.x, rec.y, 0.4);
    if (!o._xpGiven) {
      o._xpGiven = 1;
      addXp('track', 1, 'след прочитан');
    }
    return true;
  }

  // ====================================================================
  //  ПОИСК ЦЕЛИ ВЗАИМОДЕЙСТВИЯ (свой — только объекты охоты)
  // ====================================================================

  function isHuntTarget(o) {
    if (!o) return false;
    return o.hunt === 'track' || o.hunt === 'remains' || !!o.bait || !!o.corpse;
  }

  /** Мой объект под курсором (в пределах досягаемости) или рядом с игроком. */
  function findMyTarget() {
    var w = WS.World;
    var p = P();
    if (!w || !p) return null;
    var m = WS.Input.mouse();
    var i, k, list, o, d;

    // 1) под курсором
    if (m && m.tx >= 0 && m.ty >= 0 && w.inB(m.tx, m.ty)) {
      list = w.objsAt(m.tx, m.ty);
      for (i = 0; list && i < list.length; i++) {
        o = list[i];
        if (isHuntTarget(o) && WS.M.dist(p.x, p.y, o.x, o.y) <= INTERACT_R) return o;
      }
    }
    // 2) ближайший вокруг игрока
    var ptx = Math.floor(p.x), pty = Math.floor(p.y);
    var best = null, bd = INTERACT_R;
    for (var cy = pty - 2; cy <= pty + 2; cy++) {
      for (var cx = ptx - 2; cx <= ptx + 2; cx++) {
        list = w.objsAt(cx, cy);
        if (!list) continue;
        for (k = 0; k < list.length; k++) {
          o = list[k];
          if (!isHuntTarget(o)) continue;
          d = WS.M.dist(p.x, p.y, o.x, o.y);
          if (d <= bd) { bd = d; best = o; }
        }
      }
    }
    return best;
  }

  /** Диспетчер E/ПКМ по объектам охоты. Возвращает true, если обработано. */
  function onInteract() {
    if (!running() || !uiFree()) return false;
    var p = P();
    if (p.sleeping) return false;
    var o = findMyTarget();
    if (!o) return false;
    try {
      if (o.hunt === 'track') return examineTrack(o);
      if (o.bait) return pickupBait(o);
      if (o.corpse) return corpseInteract(o);
      if (o.hunt === 'remains') {
        toastOnce('remains', t9('hunt.remains', 'Обглоданные кости. Всё ценное уже снято.'), 'info');
        sndAt('click', o.x, o.y, 0.3);
        return true;
      }
    } catch (err) {
      WS.err('hunting.onInteract:', err && err.message);
    }
    return false;
  }

  // ====================================================================
  //  ТРУПЫ: РЕГИСТРАЦИЯ, ОБЫСК, РАЗДЕЛКА
  // ====================================================================

  function kindFromCorpse(o) {
    if (!o) return null;
    if (o._ckind) return o._ckind;
    var sn = String(o.sprName || '');
    var m = sn.indexOf('corpse_') === 0 ? sn.slice(7) : null;
    o._ckind = (KIND_SIZE[m] !== undefined) ? m : null;
    return o._ckind;
  }

  function corpseRec(o) {
    for (var i = 0; i < corpses.length; i++) {
      if (corpses[i].o === o) return corpses[i];
    }
    return null;
  }

  /** Зарегистрировать труп (вызывается из 'obj:add'). */
  function registerCorpse(o) {
    if (corpseRec(o)) return;
    corpses.push({
      o: o,
      kind: kindFromCorpse(o),
      deathMin: WS.Time.totalMin(),
      searched: false
    });
  }

  /** E по трупу: сперва обыск (Loot.search), потом разделка. */
  function corpseInteract(o) {
    // идёт чей-то обыск — не мешаем
    try {
      if (WS.Loot && WS.Loot.isSearching && WS.Loot.isSearching()) return false;
    } catch (e) { /* пусто */ }

    if (o.container && !o.looted) {
      // первый E: пусть actions.js/Loot.search откроют тушу как контейнер,
      // нашу работу подхватит событие 'loot:searched'
      return false;
    }
    startButcher(o);
    return true;
  }

  /** Обыск туши завершён (событие 'loot:searched'). */
  function onCorpseSearched(d) {
    var o = d && d.o;
    if (!o || !o.corpse) return;
    var rec = corpseRec(o);
    if (!rec) registerCorpse(o);
    rec = corpseRec(o);
    if (rec) rec.searched = true;
    // старая туша: мясо в контейнере превращаем в тухлое
    var spoiled = applySpoil(o);
    if (spoiled > 0) {
      toast(t9('hunt.meat_spoiled', 'Мясо протухло — есть опасно, шкура цела'), 'warn');
      try { WS.Ev.emit('inv:changed', {}); } catch (e) { /* пусто */ }
    }
    // подсказка про разделку, если есть нож и что забирать
    if (hasKnife() && o.inv && o.inv.length) {
      toastOnce('butcherhint' + o.id,
        t9('hunt.butcher_hint', 'E у туши — разделать ножом (забрать всё)'), 'info', 6000);
    }
  }

  /** Порча: мясо в контейнере старой туши становится meat_spoiled. */
  function applySpoil(o) {
    if (!o || !o.corpse) return 0;
    var rec = corpseRec(o);
    if (!rec) return 0;
    var ageDays = (WS.Time.totalMin() - rec.deathMin) / 1440;
    if (ageDays <= SPOIL_DAYS) return 0;
    if (!o.inv || !o.inv.length) return 0;
    var n = 0;
    for (var i = 0; i < o.inv.length; i++) {
      var it = o.inv[i];
      if (it && it.id === 'meat_raw') {
        it.id = 'meat_spoiled';
        n += (it.count || 1);
      }
    }
    return n;
  }

  /** Разделка: длительное действие с полоской. */
  function startButcher(o) {
    if (action) {
      toastOnce('busy', t9('hunt.busy', 'Руки заняты'), 'warn');
      return;
    }
    var knife = hasKnife();
    if (!knife) {
      toast(t9('hunt.need_knife', 'Без ножа тушу не разделать'), 'warn');
      sndAt('error', o.x, o.y, 0.5);
      return;
    }
    var kind = kindFromCorpse(o);
    var size = (kind && KIND_SIZE[kind]) || 1;
    var dur = BUTCHER_DUR[Math.max(1, Math.min(4, size))] || 3;
    var mk = makeMarker(o.x, o.y, function () {
      return t9('hunt.butchering', 'Разделка…');
    }, function () {
      return action && action.o === o ? action.t / action.dur : 0;
    }, function () { return '#b0533a'; });
    action = { type: 'butcher', o: o, kind: kind, size: size, t: 0, dur: dur, mk: mk };
    sndAt('hit_flesh', o.x, o.y, 0.7);
    fxText(t9('hunt.butchering', 'Разделка…'), o.x, o.y - 1, { col: '#c99a86', size: 13 });
  }

  /** Финиш разделки: забрать всё, XP, заменить костьми. */
  function finishButcher() {
    var a = action;
    action = null;
    dropMarker(a.mk);
    var o = a.o;
    if (!o || o.removed) return;

    // лениво наполнить контейнер туши (если ещё не обыскана)
    try {
      if (o.container && WS.Loot && WS.Loot.fill) WS.Loot.fill(o);
    } catch (e) { /* пусто */ }
    if (!o.inv) o.inv = [];
    if (!o.inv.length && !o.container) {
      // тушки без таблицы лута: ворона, рыба
      if (a.kind === 'crow') o.inv.push({ id: 'feather_bunch', count: 1 });
      else if (a.kind === 'fish') o.inv.push({ id: 'fresh_fish', count: 1 });
    }
    applySpoil(o);

    // забрать всё (что не влезло — на снег)
    var taken = 0, dropped = 0;
    for (var i = o.inv.length - 1; i >= 0; i--) {
      var it = o.inv[i];
      if (!it) continue;
      var given = giveItem(it.id, it.count || 1);
      taken += given;
      if (given < (it.count || 1)) {
        try {
          if (WS.Loot && WS.Loot.dropItem) {
            WS.Loot.dropItem(it.id, (it.count || 1) - given, o.x, o.y);
            dropped++;
          }
        } catch (e2) { /* пусто */ }
      }
      o.inv.splice(i, 1);
    }
    // кости — всегда небольшой довесок
    var bones = Math.floor(Math.random() * (1 + a.size));
    if (bones > 0) {
      if (giveItem('bone_old', bones) > 0) taken += bones;
    }

    // XP: собирательство + следопытство (по ТЗ «track/forage»)
    addXp('forage', XP_BUTCHER_FORAGE + a.size, 'разделка туши');
    addXp('track', XP_BUTCHER_TRACK + Math.floor(a.size / 2), 'разделка туши');

    // заменить труп остатками
    try { WS.World.removeObject(o); } catch (e3) { /* пусто */ }
    var rem = WS.World.addObject({
      x: o.x, y: o.y, sprName: 'carcass_remains',
      solid: false, shadow: false, name: 'Кости',
      hunt: 'remains', z: -0.2
    });
    sndAt('hit_flesh', o.x, o.y, 0.6);
    sndAt('pickup', o.x, o.y, 0.7);
    fxBurst('blood', o.x, o.y, 4, { life: 0.4 });
    fxText('+' + taken + ' ' + t9('hunt.goods', 'предм.'), o.x, o.y - 0.9, { col: '#c8b46a', life: 1.8 });
    if (dropped > 0) {
      toast(t9('hunt.inv_full', 'Руки полны — часть осталась на снегу'), 'warn');
    }
    try {
      WS.Ev.emit('hunt:butchered', { o: rem, kind: a.kind, size: a.size, taken: taken });
    } catch (e4) { /* пусто */ }
  }

  /** Тик длительного действия. */
  function actionTick(dt) {
    if (!action) return;
    var a = action;
    var p = P();
    if (!p || !a.o || a.o.removed) {
      dropMarker(a.mk);
      action = null;
      return;
    }
    if (WS.M.dist(p.x, p.y, a.o.x, a.o.y) > 2.4) {
      dropMarker(a.mk);
      action = null;
      toastOnce('butchercancel', t9('hunt.moved', 'Работа брошена'), 'warn');
      return;
    }
    a.t += dt;
    if (Math.random() < dt * 1.2) sndAt('hit_flesh', a.o.x, a.o.y, 0.4);
    if (Math.random() < dt * 2) fxBurst('blood', a.o.x, a.o.y, 2, { life: 0.3 });
    if (a.t >= a.dur) {
      if (a.type === 'butcher') finishButcher();
      else { dropMarker(a.mk); action = null; }
    }
  }

  /** Падальщики: раз в игровую минуту проверяем туши у хищников. */
  var scavLastMin = -1;
  function scavTick() {
    var now = Math.floor(WS.Time.totalMin());
    if (now === scavLastMin) return;
    scavLastMin = now;
    var w = WS.World;
    for (var i = corpses.length - 1; i >= 0; i--) {
      var rec = corpses[i];
      if (!rec.o || rec.o.removed) { corpses.splice(i, 1); continue; }
      var age = now - rec.deathMin;
      if (age < SCAV_DELAY_MIN) continue;
      if (rec.eaten) continue;
      var list = w.entsNear(rec.o.x, rec.o.y, SCAV_R);
      var preds = 0;
      for (var k = 0; k < list.length; k++) {
        var kk = list[k] && list[k].kind;
        if (kk === 'wolf' || kk === 'bear') preds++;
      }
      if (!preds) continue;
      if (Math.random() < SCAV_CHANCE) {
        eatCorpse(rec);
      }
    }
  }

  function eatCorpse(rec) {
    rec.eaten = true;
    var o = rec.o;
    var p = P();
    try { WS.World.removeObject(o); } catch (e) { /* пусто */ }
    WS.World.addObject({
      x: o.x, y: o.y, sprName: 'carcass_remains',
      solid: false, shadow: false, name: 'Кости',
      hunt: 'remains', z: -0.2
    });
    sndAt('eat', o.x, o.y, 0.8);
    try { WS.Ev.emit('blood', { x: o.x, y: o.y, r: 8 }); } catch (e2) { /* пусто */ }
    if (p && WS.M.dist(p.x, p.y, o.x, o.y) < 14) {
      toast(t9('hunt.scavenged', 'Хищники растащили добычу'), 'warn');
    }
  }

  // ====================================================================
  //  КРОВЬ: РАНЕНЫЙ ЗВЕРЬ МЕТКИТ ПУТЬ
  // ====================================================================

  function onEntDamage(d) {
    if (!d || !d.ent) return;
    var e = d.ent;
    if (!TRACK_KINDS[e.kind] || e.dead) return;
    if (e.hp === undefined || e.maxHp === undefined) return;
    if (e.hp <= 0) return;
    if (e.hp < e.maxHp * BLEED_TRIGGER_HP) {
      // зверь ранен и кровит: хищники почуют след
      e._bleedUntil = WS.Time.totalMin() + BLEED_MIN;
      e._bx = e.x; e._by = e.y; e._bpath = 0;
    }
  }

  function bloodTick(dt) {
    var w = WS.World;
    var now = WS.Time.totalMin();
    var list = w.ents;
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (!e || e.dead) continue;
      if (e._bleedUntil === undefined || e._bleedUntil < now) continue;
      if (e.x === undefined || e._bx === undefined) { e._bx = e.x; e._by = e.y; continue; }
      var dx = e.x - e._bx, dy = e.y - e._by;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d < 0.03) continue;
      e._bpath = (e._bpath || 0) + d;
      if (e._bpath >= BLEED_STEP) {
        e._bpath = 0;
        dropBlood(e._bx + dx * 0.5, e._by + dy * 0.5);
      }
      e._bx = e.x; e._by = e.y;
    }
    // старение меток
    for (var k = splats.length - 1; k >= 0; k--) {
      if (!splats[k].o || splats[k].o.removed) { splats.splice(k, 1); continue; }
      if (now - splats[k].tmin > BLEED_MIN) {
        try { WS.World.removeObject(splats[k].o); } catch (e2) { /* пусто */ }
        splats.splice(k, 1);
      }
    }
  }

  function dropBlood(x, y) {
    if (splats.length >= BLEED_CAP) {
      var old = splats.shift();
      try { if (old.o && !old.o.removed) WS.World.removeObject(old.o); } catch (e) { /* пусто */ }
    }
    var o = WS.World.addObject({
      x: x, y: y, sprName: 'blood_splat',
      solid: false, shadow: false, name: 'Кровь',
      hunt: 'blood', z: -0.5
    });
    splats.push({ o: o, tmin: WS.Time.totalMin() });
    // волки сбегаются на кровь (обоняние ИИ)
    try { WS.Ev.emit('blood', { x: x, y: y, r: BLOOD_SMELL_R }); } catch (e2) { /* пусто */ }
  }

  // ====================================================================
  //  ПРИМАНКА
  // ====================================================================

  /** Найти приманку в инвентаре (мясо; тухлое — тоже годится). */
  function findBaitId() {
    var order = ['meat_raw', 'meat_spoiled'];
    for (var i = 0; i < order.length; i++) {
      if (hasItem(order[i]) > 0) return order[i];
    }
    return null;
  }

  /**
   * Положить приманку перед собой. itemId можно задать явно,
   * иначе берётся первое мясо из инвентаря. Возвращает true при успехе.
   */
  function placeBait(itemId) {
    if (!running() || !uiFree()) return false;
    var p = P();
    if (p.sleeping) return false;
    var id = itemId;
    if (!id || !BAITS[id]) id = findBaitId();
    if (!id || hasItem(id) <= 0) {
      toast(t9('hunt.no_bait', 'Нет приманки — нужно мясо'), 'warn');
      return false;
    }
    if (consumeItem(id, 1) <= 0) {
      toast(t9('hunt.no_bait', 'Нет приманки — нужно мясо'), 'warn');
      return false;
    }
    // тайл перед игроком (или собственный, если перед — занят)
    var tx = Math.floor(p.x), ty = Math.floor(p.y);
    var fx2 = DIRV[(p.dir || 4) & 7][0], fy = DIRV[(p.dir || 4) & 7][1];
    var w = WS.World;
    var ftx = tx + fx2, fty = ty + fy;
    if (w.inB(ftx, fty) && !w.isTileBlocked(ftx, fty)) {
      // не класть в стену дерева: твёрдые объекты не мешают лежать мясу,
      // но и на дровах ему не место — проверим только тайл
      tx = ftx; ty = fty;
    }
    var o = WS.World.addObject({
      x: tx + 0.5, y: ty + 0.5, sprName: 'bait_meat',
      solid: false, shadow: false, name: 'Приманка',
      bait: { item: id, tmin: WS.Time.totalMin() },
      z: -0.2
    });
    baits.push({ o: o, item: id, tmin: WS.Time.totalMin(), pulse: 0 });
    sndAt('drop', o.x, o.y, 0.7);
    fxText(t9('hunt.bait_placed', 'Приманка положена'), o.x, o.y - 0.7, { col: '#c99a86', size: 13 });
    // первый «выдох» запаха — сразу
    try {
      WS.Ev.emit('blood', { x: o.x, y: o.y, r: 12 });
      WS.Ev.emit('noise', { x: o.x, y: o.y, r: 4 });
    } catch (e) { /* пусто */ }
    return true;
  }

  /** Поднять свою приманку обратно. */
  function pickupBait(o) {
    var id = o.bait && o.bait.item;
    if (giveItem(id || 'meat_raw', 1) <= 0) {
      toastOnce('invfull', t9('hunt.inv_full2', 'Некуда положить'), 'warn');
      return true;
    }
    for (var i = baits.length - 1; i >= 0; i--) {
      if (baits[i].o === o) baits.splice(i, 1);
    }
    try { WS.World.removeObject(o); } catch (e) { /* пусто */ }
    sndAt('pickup', o.x, o.y, 0.7);
    fxText('+ ' + itemName(id || 'meat_raw'), o.x, o.y - 0.7, { col: '#c8b46a', size: 13 });
    return true;
  }

  /** Мир: пульс запаха, поедание хищниками, заметание снегом. */
  function baitTick(dt) {
    var w = WS.World;
    var now = WS.Time.totalMin();
    for (var i = baits.length - 1; i >= 0; i--) {
      var b = baits[i];
      if (!b.o || b.o.removed) { baits.splice(i, 1); continue; }
      // замело снегом
      if (now - b.tmin > BAIT_LIFE_MIN) {
        try { WS.World.removeObject(b.o); } catch (e) { /* пусто */ }
        baits.splice(i, 1);
        continue;
      }
      // хищник добрался — съел
      var list = w.entsNear(b.o.x, b.o.y, BAIT_EAT_R);
      for (var k = 0; k < list.length; k++) {
        var kk = list[k] && list[k].kind;
        if (kk === 'wolf' || kk === 'bear') {
          try { WS.World.removeObject(b.o); } catch (e2) { /* пусто */ }
          baits.splice(i, 1);
          sndAt('eat', b.o.x, b.o.y, 0.9);
          var p = P();
          if (p && WS.M.dist(p.x, p.y, b.o.x, b.o.y) < 14) {
            toast(t9('hunt.bait_eaten', 'Приманку съели'), 'info');
          }
          try { WS.Ev.emit('blood', { x: b.o.x, y: b.o.y, r: 8 }); } catch (e3) { /* пусто */ }
          break;
        }
      }
      if (i >= baits.length || baits[i] !== b) continue;
      // пульс запаха: хищники чуют издалека
      b.pulse = (b.pulse || 0) + dt;
      if (b.pulse >= BAIT_PULSE_SEC) {
        b.pulse = 0;
        try {
          WS.Ev.emit('blood', { x: b.o.x, y: b.o.y, r: 14 });
          WS.Ev.emit('noise', { x: b.o.x, y: b.o.y, r: 6 });
        } catch (e4) { /* пусто */ }
      }
    }
  }

  // ====================================================================
  //  МАНОК НА ОЛЕНЯ
  // ====================================================================

  /**
   * Подать голос берестяным манком: олени в CALL_RANGE тайлах идут на зов
   * CALL_DUR секунд (не подходя ближе CALL_KEEP_DIST). Возвращает true.
   */
  function useDeerCall() {
    if (!running() || !uiFree()) return false;
    var p = P();
    if (p.sleeping) return false;
    if (hasItem('deer_call') <= 0) {
      toastOnce('nocall', t9('hunt.no_call', 'Нет манка (крафт: береста + нож)'), 'info');
      return false;
    }
    var nowS = Date.now();
    if (call && call.cd > nowS) {
      toastOnce('callcd', t9('hunt.call_cd', 'Манок ещё не остыл'), 'info', 3000);
      return false;
    }
    sndAt('craft', p.x, p.y, 0.5);
    if (Math.random() < CALL_FAIL) {
      fxText(t9('hunt.call_fail', 'Олени не отзываются…'), p.x, p.y - 1.1, { col: '#8b95a5', size: 13 });
      call = { t: 0, deer: [], cd: nowS + CALL_CD * 500 };
      return true;
    }
    // собрать оленей в радиусе зова
    var deer = [];
    var list = WS.World.entsNear(p.x, p.y, CALL_RANGE);
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].kind === 'deer' && !list[i].dead) deer.push(list[i]);
    }
    call = { t: CALL_DUR, deer: deer, cd: nowS + CALL_CD * 1000 };
    fxText(t9('hunt.call_ok', 'Манк оленя!'), p.x, p.y - 1.1, { col: '#c8b46a', size: 13 });
    addXp('track', 1, 'зов оленя');
    if (!deer.length) {
      toastOnce('callnone', t9('hunt.call_none', 'Тишина. Оленей поблизости нет'), 'info');
    }
    return true;
  }

  /** Тик зова: олени бредут к игроку (не в панике). */
  function callTick(dt) {
    if (!call) return;
    call.t -= dt;
    if (call.t <= 0) { call = null; return; }
    var p = P();
    if (!p) { call = null; return; }
    for (var i = 0; i < call.deer.length; i++) {
      var e = call.deer[i];
      if (!e || e.dead) continue;
      var herd = e.herd;
      if (herd && herd.state === 'flee') continue;   // спугнуты — зов не действует
      // точка привязи: кольцо вокруг игрока, чуть дальше дневного чутья
      var a = Math.atan2(e.y - p.y, e.x - p.x) + (Math.random() - 0.5) * 0.6;
      var rr = CALL_KEEP_DIST + Math.random() * 1.5;
      e.wanderPt = {
        x: clamp(p.x + Math.cos(a) * rr, 4, 215),
        y: clamp(p.y + Math.sin(a) * rr * 0.85, 4, 215)
      };
      e.wanderWait = 0;
    }
  }

  // ====================================================================
  //  ВВОД: E / ПКМ / T (приманка) / V (манок)
  // ====================================================================

  function onKey(d) {
    if (!d || !d.code) return;
    if (d.code === 'KeyE') {
      if (Date.now() - lastInteractMs < 150) return;
      lastInteractMs = Date.now();
      onInteract();
    } else if (d.code === 'KeyT') {
      placeBait(null);
    } else if (d.code === 'KeyV') {
      useDeerCall();
    }
  }

  function onMouse(d) {
    if (!d || d.button !== 2) return;
    if (Date.now() - lastInteractMs < 150) return;
    lastInteractMs = Date.now();
    onInteract();
  }

  // ====================================================================
  //  СОБЫТИЯ МИРА
  // ====================================================================

  function onObjAdd(d) {
    var o = d && d.o;
    if (!o) return;
    // декоративные следы из ai/animals.js заменяет наша система:
    // безымянный 'footprint' без метки hunt — удаляем (он продублировал бы след)
    if (o.sprName === 'footprint' && !o.hunt) {
      try { WS.World.removeObject(o); } catch (e) { /* пусто */ }
      return;
    }
    if (o.corpse) registerCorpse(o);
  }

  function onObjRemove(d) {
    var o = d && d.o;
    if (!o) return;
    for (var i = corpses.length - 1; i >= 0; i--) {
      if (corpses[i].o === o) corpses.splice(i, 1);
    }
  }

  // ====================================================================
  //  СБРОС / НОВАЯ ПАРТИЯ
  // ====================================================================

  function resetHunt() {
    var w = WS.World;
    var i;
    // снять наши объекты (следы/кровь/приманки/кости/маркеры)
    var mine = [];
    for (i = 0; i < w.objects.length; i++) {
      var o = w.objects[i];
      if (o && o.hunt) mine.push(o);
    }
    for (i = 0; i < mine.length; i++) {
      try { w.removeObject(mine[i]); } catch (e) { /* пусто */ }
    }
    trks = [];
    splats = [];
    baits = [];
    corpses = [];
    action = null;
    call = null;
    scavLastMin = -1;
    lastToastAt = {};
  }

  // ====================================================================
  //  ТИКИ
  // ====================================================================

  function huntWorldTick(dt) {
    if (!running()) return;
    try {
      baitTick(dt);
      scavTick();
    } catch (e) {
      WS.err('huntWorldTick:', e && e.message);
    }
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
    }
    ok('модуль зарегистрирован', !!WS.Hunting);
    ok('спрайт foot_wolf определён', !!(WS.Spr.specs && WS.Spr.specs().foot_wolf));
    ok('спрайт foot_bear определён', !!(WS.Spr.specs && WS.Spr.specs().foot_bear));
    ok('спрайт bait_meat определён', !!(WS.Spr.specs && WS.Spr.specs().bait_meat));
    ok('предмет meat_spoiled объявлен', !!(WS.Data && WS.Data.items && WS.Data.items.meat_spoiled));
    ok('предмет deer_call объявлен', !!(WS.Data && WS.Data.items && WS.Data.items.deer_call));
    ok('рецепт deer_call есть', !!(WS.Data && WS.Data.recipesById && WS.Data.recipesById.deer_call));
    ok('DIR_NAME — 8 сторон', DIR_NAME.length === 8);
    ok('BUTCHER_DUR — 5 размеров', BUTCHER_DUR.length === 5);
    var lv = trackLv();
    ok('canSeeTrack: ур.0 ничего', canSeeTrack(0, 5) === false);
    ok('canSeeTrack: ур.1 свежий', canSeeTrack(1, 5) === true);
    ok('canSeeTrack: ур.1 старый скрыт', canSeeTrack(1, 25) === false);
    ok('canSeeTrack: ур.3 всё', canSeeTrack(3, 29) === true);
    ok('текущий track-уровень число', typeof lv === 'number');
    ok('kindFromCorpse(wolf)', kindFromCorpse({ sprName: 'corpse_wolf' }) === 'wolf');
    out.unshift('hunting.selftest: ' + pass + ' ок, ' + fail + ' провалено');
    return out;
  }

  // ====================================================================
  //  ПУБЛИЧНЫЙ API
  // ====================================================================

  WS.def('Hunting', {
    // следы
    tracks: function () { return trks; },
    trackInfo: trackInfo,
    canSeeTrack: canSeeTrack,
    // разделка
    butcher: startButcher,
    hasKnife: hasKnife,
    // приманка и манок
    placeBait: placeBait,
    useDeerCall: useDeerCall,
    baits: function () { return baits; },
    corpses: function () { return corpses; },
    // служебное
    reset: resetHunt,
    selftest: selftest
  });

  // ====================================================================
  //  BOOT
  // ====================================================================

  WS.boot(function initHunting() {
    defHuntSprites();
    defHuntItems();

    // страховка: если наш файл загрузился раньше data/recipes.js, тот мог
    // перезаписать WS.Data.recipes своим массивом — вернём рецепт после бута
    WS.afterFirstFrame(function () {
      try { defHuntItems(); } catch (e) { WS.err('hunting.items:', e && e.message); }
    });

    // следы/кровь/зов/действия — после ИИ (51)
    WS.tick(TICK_AI, tracksTick, 'hunt:core');
    // приманки и падальщики — в мире (22)
    WS.tick(TICK_WORLD, huntWorldTick, 'hunt:world');

    // объекты мира: трупы регистрируем, чужие следы снимаем
    WS.Ev.on('obj:add', onObjAdd);
    WS.Ev.on('obj:remove', onObjRemove);

    // раны зверей -> кровавый след
    WS.Ev.on('ent:damage', onEntDamage);

    // обыск туши завершён -> порча + подсказка о разделке
    WS.Ev.on('loot:searched', onCorpseSearched);

    // ввод: E/ПКМ — осмотр, T — приманка, V — манок
    WS.Ev.on('key:down', onKey);
    WS.Ev.on('mouse:down', onMouse);

    // новый мир — чистые списки
    WS.Ev.on('gen:town', resetHunt);

    WS.log('hunting: охота готова (следы, разделка, приманка, манок)');
  }, 'hunt:init');
})();
