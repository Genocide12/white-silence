/**
 * fishing.js — РЫБАЛКА «Белого Безмолвия»: проруби из генератора рельефа
 * (World.iceHoles + объекты 'ice_hole'; если нет — сами ищем лёд у воды),
 * активная ловля удочкой (заброс -> поклёвка 5-30 сек -> окно подсечки),
 * верши (проверка раз в 3 игровых часа, 40%), подлёдная сеть (6 часов,
 * квестовый предмет), мороз затягивает лунки льдом (ice_pick, 30 сек
 * работы, шум волкам). XP — навык forage (событие 'fish:caught' слушает
 * skills.js, как у силков build.js). Связи: world/gen_terrain.js (лёд,
 * проруби), systems/skills.js, ai/ai.js ('noise'/'blood'), inventory.
 */
(function () {
  'use strict';

  // ====================================================================
  //  КОНСТАНТЫ
  // ====================================================================

  var TICK_PRI = 42;             // системы
  var HOLE_R = 1.4;              // у проруби — ближе этого (как build.js)
  var INTERACT_R = 1.5;          // досягаемость объектов (как actions.js)

  // ---- ловля удочкой --------------------------------------------------
  var BITE_MIN = 5;              // сек: минимум ожидания поклёвки
  var BITE_VAR = 25;             // + 0..25 сек
  var HOOK_WINDOW = 2.0;         // сек на подсечку (базовое окно, по ТЗ)
  var HOOK_WINDOW_LV = 0.12;     // + сек за уровень forage
  var HOOK_WINDOW_MAX = 3.2;     // потолок окна
  var CATCH_BAIT = 0.85;         // шанс с наживкой
  var CATCH_BARE = 0.55;         // мормышка без наживки (по ТЗ — ниже)
  var JUNK_CHANCE = 0.04;        // «со дна» вместо рыбы
  var CAST_FATIGUE = 1;          // бодрость за заброс (холод, скука)

  // ---- верша ----------------------------------------------------------
  var TRAP_CHECK_H = 3;          // часов между проверками верши
  var TRAP_CHANCE = 0.40;        // базовый шанс улова (по ТЗ 40%)
  var TRAP_BREAK = 0.08;         // верша рвётся при сборе

  // ---- сеть ------------------------------------------------------------
  var NET_HOURS = 6;             // часов до полного улова
  var NET_RATE = 0.8;            // рыб в час при раннем подъёме

  // ---- мороз ------------------------------------------------------------
  var BREAK_DUR = 30;           // сек долбить лёд (по ТЗ)
  var BREAK_NOISE_R = 8;        // шум ударов (волки слышат)

  // рыба в таблице улова
  var FISH_TABLE = [
    { id: 'fresh_fish', w: 66 },
    { id: 'pike_raw', w: 17 },
    { id: 'burbot_raw', w: 17 }
  ];

  // ====================================================================
  //  СОСТОЯНИЕ МОДУЛЯ
  // ====================================================================

  var holes = [];        // {o, x, y, frozen, trap, net}
  var sess = null;       // активная ловля: {rec, phase, t, dur, window, bait, mk}
  var action = null;     // долбёжка льда: {rec, t, dur, mk, sndT, noiseT}
  var scanned = false;   // проруби зарегистрированы
  var lastToastAt = {};
  var lastInteractMs = 0;

  // ====================================================================
  //  МЕЛКИЕ ПОМОЩНИКИ
  // ====================================================================

  function G() { return WS.G; }
  function P() { return (WS.G && WS.G.player) || null; }

  function running() {
    var g = WS.G;
    return !!(g && g.running && !g.dead && g.player && g.player.hp > 0);
  }

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

  function forageLv() {
    try {
      if (WS.Skills && WS.Skills.lvid) return WS.Skills.lvid('forage');
    } catch (e) { /* пусто */ }
    var p = P();
    return (p && p.skills && p.skills.forage) ? (p.skills.forage.lv || 0) : 0;
  }

  function addXp(id, n, reason) {
    try {
      if (WS.Skills && WS.Skills.addXp) WS.Skills.addXp(id, n, reason);
    } catch (e) { /* пусто */ }
  }

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

  function giveItem(id, n) {
    try {
      if (WS.Inv && WS.Inv.give) return WS.Inv.give(id, n);
    } catch (e) { /* пусто */ }
    return 0;
  }

  function dropItem(id, n, x, y) {
    try {
      if (WS.Loot && WS.Loot.dropItem) WS.Loot.dropItem(id, n, x, y);
    } catch (e) { /* пусто */ }
  }

  /** Выдать рыбу (с падением на лёд при полном инвентаре). */
  function giveFish(id, x, y) {
    var given = giveItem(id, 1);
    if (given <= 0) {
      dropItem(id, 1, x, y);
      toastOnce('invfull', t9('fish.inv_full', 'Руки полны — улов на льду'), 'warn');
    }
    var g = G();
    if (g && g.stats) g.stats.fishCaught = (g.stats.fishCaught || 0) + 1;
    return given;
  }

  /** Усталость: ловля на морозе выматывает. */
  function fatigueCost(n) {
    var p = P();
    if (!p || !p.needs) return;
    p.needs.fatigue = clamp(p.needs.fatigue - n, 0, 100);
  }

  function toScreenPos(wx, wy) {
    var cam = WS.Cam;
    if (!cam) return { x: 0, y: 0 };
    var s = WS.M.toScreen(wx - cam.cx - (cam._shakeX || 0), wy - cam.cy - (cam._shakeY || 0));
    var c = cam.canvasCenter();
    return { x: c.x + s.x * cam.zoom, y: c.y + s.y * cam.zoom };
  }

  function drawBar(ctx, x, y, zoom, label, pct, col) {
    try {
      var w = 36 * zoom, h = 5 * zoom;
      pct = clamp(pct, 0, 1);
      ctx.fillStyle = 'rgba(8,12,22,0.78)';
      ctx.fillRect(x - w / 2 - zoom, y - zoom, w + 2 * zoom, h + 2 * zoom);
      ctx.fillStyle = col || '#7fb0c8';
      ctx.fillRect(x - w / 2, y, w * pct, h);
      if (label) {
        ctx.font = 'bold ' + Math.max(8, Math.round(9 * zoom)) + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#e8e2d0';
        ctx.fillText(label, x, y - 3 * zoom);
        ctx.textAlign = 'left';
      }
    } catch (e) { /* косметика */ }
  }

  function makeMarker(x, y, renderFn) {
    var o = WS.World.addObject({
      x: x, y: y, sprName: null, solid: false, shadow: false,
      name: '', fish: 'marker'
    });
    o.render = renderFn;
    return o;
  }

  function dropMarker(mk) {
    try {
      if (mk && !mk.removed) WS.World.removeObject(mk);
    } catch (e) { /* пусто */ }
  }

  // ====================================================================
  //  СПРАЙТЫ
  // ====================================================================

  function defFishSprites() {
    var S = WS.Spr;

    // ---- схваченная морозом прорубь, 36x20 ----
    S.def('ice_covered', { w: 36, h: 20, draw: function (c) {
      var pal = S.pal;
      // матовый лёд
      S.ell(c, 9, 5, 8.8, 4.6, pal.ice);
      S.ell(c, 9, 5, 6.4, 3, pal.ice2);
      // трещины лучами от места бывшей воды
      S.px(c, 0, 4, 2, 1, '#c3d8ea');
      S.px(c, 16, 4, 2, 1, '#c3d8ea');
      S.px(c, 9, 0, 1, 2, '#c3d8ea');
      S.px(c, 9, 8, 1, 2, '#c3d8ea');
      S.px(c, 5, 7, 2, 1, '#9fc0d8');
      S.px(c, 12, 2, 2, 1, '#9fc0d8');
      // снежная пыль поверх
      S.ell(c, 7, 4, 3.4, 1.6, 'rgba(226,232,240,0.75)');
      S.ell(c, 11, 6, 2.2, 1, 'rgba(214,222,232,0.6)');
      // вмёрзшие пузыри
      S.px(c, 8, 5, 1, 1, '#dce8f2');
      S.px(c, 10, 4, 1, 1, '#dce8f2');
    }});

    // ---- верша в проруби (прутья конусом), 30x18 ----
    S.def('fish_trap', { w: 30, h: 18, draw: function (c) {
      var pal = S.pal;
      // тёмная вода в лунке
      S.ell(c, 15, 10, 9, 4, pal.water);
      S.ell(c, 15, 10, 7, 3, pal.water2);
      // каркас из прутьев: дуги
      S.px(c, 8, 6, 1, 7, pal.trunk);
      S.px(c, 12, 5, 1, 8, pal.trunk);
      S.px(c, 16, 5, 1, 8, pal.trunk);
      S.px(c, 20, 6, 1, 7, pal.trunk);
      // обручи
      S.px(c, 9, 7, 11, 1, '#5a4634');
      S.px(c, 9, 11, 11, 1, '#5a4634');
      // горловина-воронка
      S.px(c, 13, 3, 4, 1, '#4a3a2a');
      S.px(c, 14, 1, 2, 2, '#4a3a2a');
      // снежная кромка
      S.ell(c, 15, 14, 10, 2, 'rgba(226,232,240,0.55)');
    }});

    // ---- верша с уловом: хвост рыбы торчит, 30x18 ----
    S.def('fish_trap_full', { w: 30, h: 18, draw: function (c, W, H, f) {
      var pal = S.pal;
      // вода
      S.ell(c, 15, 10, 9, 4, pal.water);
      S.ell(c, 15, 10, 7, 3, pal.water2);
      // каркас
      S.px(c, 8, 6, 1, 7, pal.trunk);
      S.px(c, 12, 5, 1, 8, pal.trunk);
      S.px(c, 16, 5, 1, 8, pal.trunk);
      S.px(c, 20, 6, 1, 7, pal.trunk);
      S.px(c, 9, 7, 11, 1, '#5a4634');
      S.px(c, 9, 11, 11, 1, '#5a4634');
      // рыба упёрлась в горловину
      S.ell(c, 15, 6, 3.4, 1.8, '#7d97a8');
      S.ell(c, 18, 5, 2.2, 1.2, '#8fa8b8');
      S.px(c, 20, 5, 3, 1, '#6d8798');   // хвост
      S.px(c, 21, 4, 1, 3, '#6d8798');
      // блик
      S.px(c, 14, 5, 1, 1, '#dce8f2');
      // снежная кромка
      S.ell(c, 15, 14, 10, 2, 'rgba(226,232,240,0.55)');
    }});

    // ---- подлёдная сеть (поплавки и сетка), 32x20 ----
    S.def('fish_net', { w: 32, h: 20, draw: function (c) {
      var pal = S.pal;
      // лунка
      S.ell(c, 16, 10, 10, 4.6, pal.water);
      S.ell(c, 16, 10, 8, 3.2, pal.water2);
      // сеть: перекрестья
      c.strokeStyle = 'rgba(211,219,230,0.75)';
      c.lineWidth = 1;
      c.beginPath();
      for (var gx = 9; gx <= 23; gx += 3.5) {
        c.moveTo(gx, 6);
        c.lineTo(gx, 14);
      }
      for (var gy = 6; gy <= 14; gy += 2.6) {
        c.moveTo(9, gy);
        c.lineTo(23, gy);
      }
      c.stroke();
      // пробковые поплавки
      S.ell(c, 10, 6, 2, 1.4, '#b9903f');
      S.ell(c, 16, 5.4, 2, 1.4, '#b9903f');
      S.ell(c, 22, 6, 2, 1.4, '#b9903f');
      // грузила
      S.px(c, 11, 13, 2, 2, '#5f636b');
      S.px(c, 19, 13, 2, 2, '#5f636b');
      // снежная кромка
      S.ell(c, 16, 15, 11, 2, 'rgba(226,232,240,0.5)');
    }});

    // ---- сеть полна: рыбы в полотне, 32x20 ----
    S.def('fish_net_full', { w: 32, h: 20, draw: function (c) {
      var pal = S.pal;
      S.ell(c, 16, 10, 10, 4.6, pal.water);
      S.ell(c, 16, 10, 8, 3.2, pal.water2);
      // рыбы сквозь ячеи
      S.ell(c, 12, 9, 3.4, 1.6, '#7d97a8');
      S.ell(c, 17, 11, 3.8, 1.8, '#8fa8b8');
      S.ell(c, 21, 8, 2.6, 1.3, '#7d97a8');
      S.px(c, 9, 9, 3, 1, '#6d8798');     // хвосты
      S.px(c, 21, 11, 3, 1, '#6d8798');
      S.px(c, 24, 8, 2, 1, '#6d8798');
      // сеть поверх
      c.strokeStyle = 'rgba(211,219,230,0.7)';
      c.lineWidth = 1;
      c.beginPath();
      for (var gx = 9; gx <= 23; gx += 3.5) {
        c.moveTo(gx, 6);
        c.lineTo(gx, 14);
      }
      c.stroke();
      // поплавки
      S.ell(c, 10, 6, 2, 1.4, '#b9903f');
      S.ell(c, 16, 5.4, 2, 1.4, '#b9903f');
      S.ell(c, 22, 6, 2, 1.4, '#b9903f');
      // блик воды
      S.px(c, 13, 8, 1, 1, '#dce8f2');
      S.px(c, 18, 10, 1, 1, '#dce8f2');
      S.ell(c, 16, 15, 11, 2, 'rgba(226,232,240,0.5)');
    }});
  }

  // ====================================================================
  //  ПРЕДМЕТЫ И РЕЦЕПТЫ
  // ====================================================================

  function defFishItems() {
    WS.Data = WS.Data || {};
    WS.Data.items = WS.Data.items || {};
    var items = WS.Data.items;

    function addIfMissing(o) {
      if (!o || !o.id || items[o.id]) return;
      items[o.id] = o;
    }

    // щука-сырец: калорийнее простой рыбы (по ТЗ)
    addIfMissing({
      id: 'pike_raw', cat: 'food', w: 0.9, stack: 3,
      cal: 950, thir: -6, per: 3, cook: 'cooked_fish', sick: 30,
      tags: ['perishable', 'edible', 'cookable']
    });

    // налим: зимняя жирная рыба северных рек
    addIfMissing({
      id: 'burbot_raw', cat: 'food', w: 1.1, stack: 3,
      cal: 1150, thir: -4, per: 3, cook: 'cooked_fish', sick: 25,
      tags: ['perishable', 'edible', 'cookable', 'wolf_bait']
    });

    // верша: плетёная ловушка
    addIfMissing({
      id: 'fish_trap', cat: 'tool', w: 1.6, stack: 2,
      tags: ['fishing', 'trapping']
    });

    // рыбацкая сеть (квестовая вещь старика Ерофеича — без крафта)
    addIfMissing({
      id: 'fish_net', cat: 'tool', w: 2.2, stack: 1,
      tags: ['fishing', 'quest']
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

    // верша из еловых лапок и верёвки (лапки собирает собирательство)
    addRecipe({
      id: 'fish_trap', name: 'Верша', cat: 'survival',
      station: null, time: 6,
      req: [{ id: 'pine_branch', n: 5 }, { id: 'rope', n: 1 }],
      tools: ['knife'],
      out: [{ id: 'fish_trap', n: 1 }],
      skill: { id: 'survive', lv: 0 }
    });
  }

  // ====================================================================
  //  РЕЕСТР ПРОРУБЕЙ
  // ====================================================================

  /** Собрать проруби из объектов мира (генератор рельефа ставит 'ice_hole'). */
  function scanHoles() {
    holes = [];
    var w = WS.World;
    var objs = w.objects;
    for (var i = 0; i < objs.length; i++) {
      var o = objs[i];
      if (!o || o.removed) continue;
      if (o.sprName === 'ice_hole' && !o._holeRec) {
        registerHole(o, false);
      } else if (o.sprName === 'ice_covered' && !o._holeRec) {
        registerHole(o, true);
      }
    }
    // ни одной проруби? — сами ищем лёд у глубокой воды (кэш-режим)
    if (!holes.length) ensureHoles();
    scanned = holes.length > 0;
    if (holes.length) {
      WS.log('fishing: прорубей зарегистрировано: ' + holes.length);
    }
    return holes.length;
  }

  function registerHole(o, frozen) {
    if (o._holeRec) return o._holeRec;
    var rec = {
      o: o,
      x: o.x, y: o.y,
      frozen: !!frozen,
      trap: null,   // {obj, placedMin, ageH, filled, notified}
      net: null     // {obj, placedMin}
    };
    o._holeRec = rec;
    holes.push(rec);
    return rec;
  }

  /**
   * Прорубей в мире нет (необычный сид/мод): раскидываем свои по льду
   * у воды. Координаты — в World.iceHoles (договор генератора).
   */
  function ensureHoles() {
    var w = WS.World;
    var T = w.T;
    if (!w.tiles || !T) return 0;
    if (!w.iceHoles) w.iceHoles = [];
    var made = 0;
    for (var y = 6; y < w.h - 6 && made < 10; y += 3) {
      for (var x = 6; x < w.w - 6 && made < 10; x += 3) {
        if (w.tileAt(x, y) !== T.ICE) continue;
        // подо льдом должна быть вода (не пруд-лужа)
        var deep = false;
        for (var dy = -2; dy <= 2 && !deep; dy++) {
          for (var dx = -2; dx <= 2; dx++) {
            if (w.tileAt(x + dx, y + dy) === T.WATER) { deep = true; break; }
          }
        }
        if (!deep) continue;
        // не сгущать
        var near = false;
        for (var k = 0; k < holes.length; k++) {
          if (Math.abs(holes[k].x - (x + 0.5)) < 8 &&
              Math.abs(holes[k].y - (y + 0.5)) < 6) { near = true; break; }
        }
        if (near) continue;
        // тайл чист
        var obs = w.objsAt(x, y);
        if (obs && obs.length) continue;
        var o = w.addObject({
          x: x + 0.5, y: y + 0.5,
          sprName: 'ice_hole', solid: false, shadow: false,
          name: 'Прорубь'
        });
        w.iceHoles.push({ x: x, y: y });
        registerHole(o, false);
        made++;
      }
    }
    return made;
  }

  /** Ближайшая к игроку прорубь в радиусе r. */
  function holeNearPlayer(r) {
    var p = P();
    if (!p) return null;
    var best = null, bd = r;
    for (var i = 0; i < holes.length; i++) {
      var rec = holes[i];
      if (!rec.o || rec.o.removed) continue;
      var d = WS.M.dist(p.x, p.y, rec.x, rec.y);
      if (d < bd) { bd = d; best = rec; }
    }
    return best;
  }

  // ====================================================================
  //  МОРОЗ: ЛУНКИ ЗАТЯГИВАЕТ
  // ====================================================================

  function outsideTemp() {
    try {
      if (WS.Weather && WS.Weather.tempOutside) return WS.Weather.tempOutside();
    } catch (e) { /* пусто */ }
    return -15;
  }

  /** Почасовая проверка: мороз и верши. */
  function onHour() {
    if (!running()) return;
    var p = P();
    var temp = outsideTemp();
    var freezeP;
    if (temp <= -25) freezeP = 0.45;
    else if (temp <= -15) freezeP = 0.30;
    else if (temp <= -8) freezeP = 0.15;
    else freezeP = 0.05;

    for (var i = 0; i < holes.length; i++) {
      var rec = holes[i];
      if (!rec.o || rec.o.removed) continue;

      // --- верша: раз в TRAP_CHECK_H часов ---
      if (rec.trap && !rec.trap.filled) {
        rec.trap.ageH = (rec.trap.ageH || 0) + 1;
        if (rec.trap.ageH >= TRAP_CHECK_H) {
          rec.trap.ageH = 0;
          var chance = TRAP_CHANCE + forageLv() * 0.02;
          if (Math.random() < chance) {
            rec.trap.filled = true;
            rec.trap.notified = false;
            if (rec.trap.obj && !rec.trap.obj.removed) {
              rec.trap.obj.sprName = 'fish_trap_full';
              rec.trap.obj.name = 'Верша (полна)';
            }
          }
        }
      }

      // --- мороз тянет лёд ---
      // верша/сеть держат лунку открытой; активная ловля — тоже
      if (rec.frozen || rec.trap || rec.net) continue;
      if (sess && sess.rec === rec) continue;
      if (Math.random() >= freezeP) continue;

      rec.frozen = true;
      rec.o.sprName = 'ice_covered';
      rec.o.name = 'Замёрзшая прорубь';
      if (p && WS.M.dist(p.x, p.y, rec.x, rec.y) < 12) {
        toast(t9('fish.froze', 'Мороз затянул прорубь льдом'), 'info');
      }
    }
  }

  // ====================================================================
  //  ЛОВЛЯ УДОЧКОЙ: СЕАНС
  // ====================================================================

  /** Наживка: любое мясо (тухлое тоже годится — рыба северная не брезгует). */
  function findBaitId() {
    if (hasItem('meat_raw') > 0) return 'meat_raw';
    if (hasItem('meat_spoiled') > 0) return 'meat_spoiled';
    return null;
  }

  /** Заброс у открытой проруби. */
  function startCast(rec) {
    if (hasItem('fishing_rod') <= 0) {
      toast(t9('fish.no_rod', 'Нужна удочка (крафт: доска, верёвка, леска, крючок)'), 'warn');
      if (hasItem('fish_trap') > 0) {
        toastOnce('traphint', t9('fish.trap_hint', 'Y у проруби — поставить вершу'), 'info');
      }
      return false;
    }
    // прошлую сессию свернуть
    if (sess) cancelSession(null);

    var bait = findBaitId();
    if (bait) consumeItem(bait, 1);

    sess = {
      rec: rec,
      phase: 'wait',
      t: 0,
      dur: BITE_MIN + Math.random() * BITE_VAR,
      bait: bait,
      window: clamp(HOOK_WINDOW + forageLv() * HOOK_WINDOW_LV, HOOK_WINDOW, HOOK_WINDOW_MAX),
      t2: 0,
      mk: makeBobberMarker(rec)
    };
    sndAt('splash', rec.x, rec.y, 0.35);
    fxText(bait ? t9('fish.cast_bait', 'Заброс с наживкой…')
                : t9('fish.cast_bare', 'Мормышка без наживки…'),
           rec.x, rec.y - 0.8, { col: '#7fb0c8', size: 13 });
    return true;
  }

  /** Маркер-поплавок: леска от игрока, поплавок, полоска ожидания. */
  function makeBobberMarker(rec) {
    var o = WS.World.addObject({
      x: rec.x, y: rec.y, sprName: null, solid: false, shadow: false,
      name: '', fish: 'bobber'
    });
    o.render = function (ctx, sx, sy, zoom) {
      try {
        var p = P();
        // леска
        if (p) {
          var pp = toScreenPos(p.x, p.y);
          ctx.strokeStyle = 'rgba(220,228,240,0.45)';
          ctx.lineWidth = Math.max(0.6, 0.8 * zoom);
          ctx.beginPath();
          ctx.moveTo(pp.x, pp.y - 16 * zoom);
          ctx.lineTo(sx, sy - 3 * zoom);
          ctx.stroke();
        }
        // поклёвка: круги на воде
        if (sess && sess.phase === 'bite') {
          var rr = (1 - sess.t2 / sess.window);
          ctx.strokeStyle = 'rgba(127,176,200,0.8)';
          ctx.lineWidth = Math.max(0.8, zoom);
          ctx.beginPath();
          ctx.ellipse(sx, sy, 7 * zoom * rr + 2, 3 * zoom * rr + 1, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        // поплавок: качается
        var bob = Math.sin(Date.now() / 280) * (sess && sess.phase === 'bite' ? 2.2 : 1.2) * zoom;
        var by = sy - 3 * zoom + bob;
        ctx.fillStyle = '#d84a3a';
        ctx.beginPath();
        ctx.ellipse(sx, by - 2 * zoom, 2.2 * zoom, 2.2 * zoom, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#e8e2d0';
        ctx.beginPath();
        ctx.ellipse(sx, by, 2.2 * zoom, 1.6 * zoom, 0, 0, Math.PI * 2);
        ctx.fill();
        // полоска: ожидание или окно подсечки
        if (sess && sess.phase === 'wait') {
          drawBar(ctx, sx, sy - 26 * zoom, zoom,
                  t9('fish.waiting', 'Ждём поклёвку…'), sess.t / sess.dur, '#7fb0c8');
        } else if (sess && sess.phase === 'bite') {
          drawBar(ctx, sx, sy - 26 * zoom, zoom,
                  t9('fish.hook_now', 'КЛЮЁТ! E — подсечь'), 1 - sess.t2 / sess.window, '#d84a3a');
        }
      } catch (e) { /* поплавок — косметика */ }
    };
    return o;
  }

  /** Свернуть ловлю (молча или с сообщением). */
  function cancelSession(msg) {
    if (sess) dropMarker(sess.mk);
    sess = null;
    if (msg) toast(msg, 'info');
  }

  /** Подсечь (E в окно поклёвки). */
  function hookFish() {
    var rec = sess.rec;
    var bait = sess.bait;
    dropMarker(sess.mk);
    sess = null;
    var p = P();
    var chance = (bait ? CATCH_BAIT : CATCH_BARE) + forageLv() * 0.01;
    if (Math.random() >= Math.min(0.92, chance)) {
      fxText(t9('fish.missed', 'Сошла…'), rec.x, rec.y - 0.8, { col: '#8b95a5', size: 13 });
      sndAt('splash', rec.x, rec.y, 0.3);
      fatigueCost(CAST_FATIGUE);
      return true;
    }
    // со дна иногда достаёшь не рыбу
    if (Math.random() < JUNK_CHANCE) {
      giveFish('cloth_rag', rec.x, rec.y);
      fxText(t9('fish.junk', 'Тряпьё со дна…'), rec.x, rec.y - 0.8, { col: '#8b95a5', size: 13 });
      fatigueCost(CAST_FATIGUE);
      return true;
    }
    var id = pickFish();
    giveFish(id, rec.x, rec.y);
    sndAt('splash', rec.x, rec.y, 0.8);
    fxText('+ ' + itemName(id), rec.x, rec.y - 0.9, { col: '#7ea3b8', size: 14 });
    // XP: событие слушает skills.js ('fish:caught' → forage)
    try { WS.Ev.emit('fish:caught', { o: rec.o, id: id, how: 'rod' }); } catch (e) { /* пусто */ }
    if (id !== 'fresh_fish') addXp('forage', 3, 'крупная рыба');
    fatigueCost(CAST_FATIGUE);
    return true;
  }

  /** Таблица улова. */
  function pickFish() {
    var sum = 0, i;
    for (i = 0; i < FISH_TABLE.length; i++) sum += FISH_TABLE[i].w;
    var r = Math.random() * sum;
    for (i = 0; i < FISH_TABLE.length; i++) {
      r -= FISH_TABLE[i].w;
      if (r <= 0) return FISH_TABLE[i].id;
    }
    return 'fresh_fish';
  }

  /** Тик ловли. */
  function sessionTick(dt) {
    if (!sess) return;
    var p = P();
    if (!p) { cancelSession(null); return; }
    if (WS.M.dist(p.x, p.y, sess.rec.x, sess.rec.y) > HOLE_R + 0.3) {
      cancelSession(t9('fish.away', 'Вы отошли от проруби'));
      return;
    }
    if (sess.rec.frozen) {
      cancelSession(t9('fish.froze2', 'Лёд схватил лунку'));
      return;
    }
    if (sess.phase === 'wait') {
      sess.t += dt;
      if (sess.t >= sess.dur) {
        sess.phase = 'bite';
        sess.t2 = 0;
        // тихий всплеск — сигнал игроку (по ТЗ)
        sndAt('splash', sess.rec.x, sess.rec.y, 0.45);
        fxText(t9('fish.bite', 'КЛЮЁТ!'), sess.rec.x, sess.rec.y - 1.1, { col: '#e26a5a', size: 15 });
      }
      return;
    }
    if (sess.phase === 'bite') {
      sess.t2 += dt;
      if (sess.t2 >= sess.window) {
        fxText(t9('fish.missed', 'Сошла…'), sess.rec.x, sess.rec.y - 0.8, { col: '#8b95a5', size: 13 });
        dropMarker(sess.mk);
        sess = null;
        fatigueCost(CAST_FATIGUE);
      }
    }
  }

  // ====================================================================
  //  ДОЛБЛЁЖКА ЛЬДА
  // ====================================================================

  function startIceBreak(rec) {
    if (hasItem('ice_pick') <= 0) {
      toast(t9('fish.need_pick', 'Лёд схватил прорубь — нужен ледоруб (ice_pick)'), 'warn');
      sndAt('error', rec.x, rec.y, 0.5);
      return false;
    }
    if (action) {
      toastOnce('busy', t9('fish.busy', 'Руки заняты'), 'warn');
      return false;
    }
    action = {
      rec: rec, t: 0, dur: BREAK_DUR,
      sndT: 0, noiseT: 0,
      mk: makeMarker(rec.x, rec.y, function (ctx, sx, sy, zoom) {
        drawBar(ctx, sx, sy - 30 * zoom, zoom,
                t9('fish.breaking', 'Долбим лёд…'),
                action && action.rec === rec ? action.t / action.dur : 0,
                '#9fc0d8');
      })
    };
    sndAt('chop', rec.x, rec.y, 0.8);
    return true;
  }

  function actionTick(dt) {
    if (!action) return;
    var a = action;
    var p = P();
    if (!p || !a.rec.o || a.rec.o.removed) {
      dropMarker(a.mk);
      action = null;
      return;
    }
    if (WS.M.dist(p.x, p.y, a.rec.x, a.rec.y) > HOLE_R + 1.0) {
      dropMarker(a.mk);
      action = null;
      toastOnce('breakcancel', t9('fish.break_cancel', 'Работа брошена'), 'warn');
      return;
    }
    a.t += dt;
    // стук ледороба: слышно зверям
    a.sndT -= dt;
    if (a.sndT <= 0) {
      a.sndT = 0.9;
      sndAt('chop', a.rec.x, a.rec.y, 0.6);
      fxBurst('snow', a.rec.x, a.rec.y, 3, { life: 0.4 });
    }
    a.noiseT -= dt;
    if (a.noiseT <= 0) {
      a.noiseT = 2.5;
      try { WS.Ev.emit('noise', { x: a.rec.x, y: a.rec.y, r: BREAK_NOISE_R }); } catch (e) { /* пусто */ }
    }
    if (a.t >= a.dur) {
      dropMarker(a.mk);
      action = null;
      a.rec.frozen = false;
      a.rec.o.sprName = 'ice_hole';
      a.rec.o.name = 'Прорубь';
      sndAt('splash', a.rec.x, a.rec.y, 0.7);
      fxBurst('snow', a.rec.x, a.rec.y, 6, { life: 0.5 });
      toast(t9('fish.broken', 'Прорубь пробита'), 'good');
      try { WS.Ev.emit('noise', { x: a.rec.x, y: a.rec.y, r: 10 }); } catch (e2) { /* пусто */ }
    }
  }

  // ====================================================================
  //  ВЕРШИ (Y — поставить)
  // ====================================================================

  function placeTrap() {
    if (!running() || !uiFree()) return false;
    var p = P();
    if (p.sleeping) return false;
    ensureScanned();
    var rec = holeNearPlayer(HOLE_R);
    if (!rec) {
      toastOnce('nohole', t9('fish.no_hole', 'Встаньте у проруби'), 'warn');
      return false;
    }
    if (rec.frozen) {
      toastOnce('frozenhole', t9('fish.frozen_hole', 'Сначала разбейте лёд'), 'warn');
      return false;
    }
    if (rec.trap) {
      toastOnce('hastrap', t9('fish.has_trap', 'Здесь уже стоит верша'), 'info');
      return false;
    }
    if (rec.net) {
      toastOnce('hasnet', t9('fish.has_net', 'Здесь стоит сеть'), 'info');
      return false;
    }
    if (hasItem('fish_trap') <= 0) {
      toast(t9('fish.no_trap', 'Нужна верша (крафт: еловые лапки + верёвка)'), 'warn');
      return false;
    }
    if (consumeItem('fish_trap', 1) <= 0) return false;

    var obj = WS.World.addObject({
      x: rec.x, y: rec.y + 0.15,
      sprName: 'fish_trap', solid: false, shadow: false,
      name: 'Верша', fishTrap: true, _trapRec: rec, z: 0.1
    });
    rec.trap = {
      obj: obj,
      placedMin: WS.Time.totalMin(),
      ageH: 0,
      filled: false,
      notified: false
    };
    sndAt('build', rec.x, rec.y, 0.6);
    fxText(t9('fish.trap_set', 'Верша поставлена'), rec.x, rec.y - 0.7, { col: '#7fb0c8', size: 13 });
    toast(t9('fish.trap_hint2', 'Проверка — раз в 3 часа. E у верши — собрать/снять.'), 'info');
    return true;
  }

  /** E у верши: собрать улов или снять снасть. */
  function trapInteract(o) {
    var rec = o._trapRec;
    if (!rec || !rec.trap || rec.trap.obj !== o) return false;
    var t = rec.trap;
    if (t.filled) {
      // собрать улов
      var n = 1 + Math.floor(Math.random() * 3);
      var got = 0;
      for (var i = 0; i < n; i++) {
        var id = pickFish();
        giveFish(id, o.x, o.y);
        got++;
      }
      sndAt('splash', o.x, o.y, 0.7);
      try { WS.Ev.emit('fish:caught', { o: o, id: 'fresh_fish', how: 'trap', n: got }); } catch (e) { /* пусто */ }
      fxText('+ ' + got + ' ' + t9('fish.fish_word', 'рыбы'), o.x, o.y - 0.9, { col: '#7ea3b8', size: 14 });
      // верша цела?
      if (Math.random() < TRAP_BREAK) {
        try { WS.World.removeObject(o); } catch (e2) { /* пусто */ }
        rec.trap = null;
        toast(t9('fish.trap_broken', 'Вершина порвана — кости прутьев разошлись'), 'warn');
      } else {
        o.sprName = 'fish_trap';
        o.name = 'Верша';
        t.filled = false;
        t.ageH = 0;
        t.notified = false;
        toast(t9('fish.trap_collected', 'Верша опорожнена и снова в воде'), 'info');
      }
      return true;
    }
    // снять вершу
    if (giveItem('fish_trap', 1) <= 0) {
      toastOnce('invfull2', t9('fish.inv_full2', 'Некуда положить вершу'), 'warn');
      return true;
    }
    try { WS.World.removeObject(o); } catch (e3) { /* пусто */ }
    rec.trap = null;
    sndAt('pickup', o.x, o.y, 0.7);
    fxText('+ ' + itemName('fish_trap'), o.x, o.y - 0.7, { col: '#c8b46a', size: 13 });
    return true;
  }

  /** Тик верши: известить игрока о заполненной. */
  function trapTick() {
    var p = P();
    if (!p) return;
    for (var i = 0; i < holes.length; i++) {
      var t = holes[i].trap;
      if (!t || !t.filled || t.notified) continue;
      if (WS.M.dist(p.x, p.y, holes[i].x, holes[i].y) < 10) {
        t.notified = true;
        toast(t9('fish.trap_full', 'Верша полна! (E — собрать)'), 'good');
        sndAt('splash', holes[i].x, holes[i].y, 0.5);
      }
    }
  }

  // ====================================================================
  //  СЕТИ (U — поставить)
  // ====================================================================

  function placeNet() {
    if (!running() || !uiFree()) return false;
    var p = P();
    if (p.sleeping) return false;
    ensureScanned();
    var rec = holeNearPlayer(HOLE_R);
    if (!rec) {
      toastOnce('nohole2', t9('fish.no_hole', 'Встаньте у проруби'), 'warn');
      return false;
    }
    if (rec.frozen) {
      toastOnce('frozenhole2', t9('fish.frozen_hole', 'Сначала разбейте лёд'), 'warn');
      return false;
    }
    if (rec.net || rec.trap) {
      toastOnce('occupied', t9('fish.occupied', 'Эта лунка занята снастью'), 'info');
      return false;
    }
    if (hasItem('fish_net') <= 0) {
      toastOnce('nonet', t9('fish.no_net', 'Нет сети — сеть старика Ерофеича где-то в его избушке'), 'info');
      return false;
    }
    if (consumeItem('fish_net', 1) <= 0) return false;

    var obj = WS.World.addObject({
      x: rec.x, y: rec.y - 0.1,
      sprName: 'fish_net', solid: false, shadow: false,
      name: 'Сеть', fishNet: true, _netRec: rec, z: 0.1
    });
    rec.net = { obj: obj, placedMin: WS.Time.totalMin(), ready: false, notified: false };
    sndAt('build', rec.x, rec.y, 0.5);
    fxText(t9('fish.net_set', 'Сеть поставлена'), rec.x, rec.y - 0.7, { col: '#7fb0c8', size: 13 });
    return true;
  }

  function netReady(rec) {
    if (!rec.net) return false;
    return (WS.Time.totalMin() - rec.net.placedMin) >= NET_HOURS * 60;
  }

  /** E у сети: подъём (ранний — частичный улов). */
  function netInteract(o) {
    var rec = o._netRec;
    if (!rec || !rec.net || rec.net.obj !== o) return false;
    var elapsedH = (WS.Time.totalMin() - rec.net.placedMin) / 60;
    if (netReady(rec)) {
      // полный подъём
      var n = 3 + Math.floor(Math.random() * 4);
      var pikes = 0;
      for (var i = 0; i < n; i++) {
        var id = (Math.random() < 0.25) ? 'pike_raw' : 'fresh_fish';
        if (id === 'pike_raw') pikes++;
        giveFish(id, o.x, o.y);
      }
      giveItem('fish_net', 1);
      sndAt('splash', o.x, o.y, 0.8);
      fxText('+ ' + n + ' ' + t9('fish.fish_word2', 'рыб'), o.x, o.y - 0.9, { col: '#7ea3b8', size: 14 });
      toast(t9('fish.net_full', 'Сеть полна — хороший улов!'), 'good');
      try {
        WS.Ev.emit('fish:caught', { o: o, id: 'fresh_fish', how: 'net', n: n });
      } catch (e) { /* пусто */ }
      if (pikes > 0) addXp('forage', 3, 'сеть: крупная рыба');
      try { WS.World.removeObject(o); } catch (e2) { /* пусто */ }
      rec.net = null;
      return true;
    }
    // ранний подъём
    var fish = Math.floor(elapsedH * NET_RATE);
    if (fish <= 0) {
      toast(t9('fish.net_early', 'Сеть ещё пуста — рано поднимать'), 'info');
      return true;
    }
    for (var k = 0; k < fish; k++) giveFish('fresh_fish', o.x, o.y);
    giveItem('fish_net', 1);
    sndAt('splash', o.x, o.y, 0.6);
    toast(t9('fish.net_partial', 'Ранний подъём: рыбы немного'), 'info');
    try { WS.Ev.emit('fish:caught', { o: o, id: 'fresh_fish', how: 'net', n: fish }); } catch (e3) { /* пусто */ }
    try { WS.World.removeObject(o); } catch (e4) { /* пусто */ }
    rec.net = null;
    return true;
  }

  /** Тик сети: готовность и уведомление. */
  function netTick() {
    var p = P();
    if (!p) return;
    for (var i = 0; i < holes.length; i++) {
      var n = holes[i].net;
      if (!n) continue;
      if (!n.ready && netReady(holes[i])) {
        n.ready = true;
        if (n.obj && !n.obj.removed) {
          n.obj.sprName = 'fish_net_full';
          n.obj.name = 'Сеть (полна)';
        }
      }
      if (n.ready && !n.notified && WS.M.dist(p.x, p.y, holes[i].x, holes[i].y) < 10) {
        n.notified = true;
        toast(t9('fish.net_ready', 'Сеть полна! (E — подъём)'), 'good');
        sndAt('splash', holes[i].x, holes[i].y, 0.5);
      }
    }
  }

  // ====================================================================
  //  ВЗАИМОДЕЙСТВИЕ (E / ПКМ)
  // ====================================================================

  function isFishTarget(o) {
    if (!o) return false;
    if (o.fishTrap || o.fishNet) return true;
    return o.sprName === 'ice_hole' || o.sprName === 'ice_covered';
  }

  function findFishTarget() {
    var w = WS.World;
    var p = P();
    if (!w || !p) return null;
    var m = WS.Input.mouse();
    var i, k, list, o, d;

    if (m && m.tx >= 0 && m.ty >= 0 && w.inB(m.tx, m.ty)) {
      list = w.objsAt(m.tx, m.ty);
      for (i = 0; list && i < list.length; i++) {
        o = list[i];
        if (isFishTarget(o) && WS.M.dist(p.x, p.y, o.x, o.y) <= INTERACT_R) return o;
      }
    }
    var ptx = Math.floor(p.x), pty = Math.floor(p.y);
    var best = null, bd = INTERACT_R;
    for (var cy = pty - 2; cy <= pty + 2; cy++) {
      for (var cx = ptx - 2; cx <= ptx + 2; cx++) {
        list = w.objsAt(cx, cy);
        if (!list) continue;
        for (k = 0; k < list.length; k++) {
          o = list[k];
          if (!isFishTarget(o)) continue;
          d = WS.M.dist(p.x, p.y, o.x, o.y);
          if (d <= bd) { bd = d; best = o; }
        }
      }
    }
    return best;
  }

  function ensureScanned() {
    if (!scanned) scanHoles();
  }

  /** Диспетчер: E у проруби/верши/сети. */
  function onInteract() {
    if (!running() || !uiFree()) return false;
    var p = P();
    if (p.sleeping) return false;
    ensureScanned();
    var o = findFishTarget();
    if (!o) return false;
    try {
      if (o.fishTrap) return trapInteract(o);
      if (o.fishNet) return netInteract(o);
      // сама прорубь
      var rec = o._holeRec || registerHole(o, o.sprName === 'ice_covered');
      if (!rec) return false;
      if (rec.frozen) return startIceBreak(rec);
      // E в окно поклёвки — подсечь; в ожидании — свернуть
      if (sess && sess.rec === rec) {
        if (sess.phase === 'bite') return hookFish();
        cancelSession(t9('fish.reel', 'Сматываем удочку'));
        return true;
      }
      startCast(rec);
      return true;
    } catch (err) {
      WS.err('fishing.onInteract:', err && err.message);
    }
    return false;
  }

  // ====================================================================
  //  ВВОД: E / ПКМ / Y (верша) / U (сеть)
  // ====================================================================

  function onKey(d) {
    if (!d || !d.code) return;
    if (d.code === 'KeyE') {
      if (Date.now() - lastInteractMs < 150) return;
      lastInteractMs = Date.now();
      onInteract();
    } else if (d.code === 'KeyY') {
      placeTrap();
    } else if (d.code === 'KeyU') {
      placeNet();
    }
  }

  function onMouse(d) {
    if (!d || d.button !== 2) return;
    if (Date.now() - lastInteractMs < 150) return;
    lastInteractMs = Date.now();
    onInteract();
  }

  // ====================================================================
  //  СБРОС / ТИКИ
  // ====================================================================

  function resetFish() {
    // снять наши маркеры и снасти (мир уже мог пересоздаться)
    var w = WS.World;
    var i, mine = [];
    if (w && w.objects) {
      for (i = 0; i < w.objects.length; i++) {
        var o = w.objects[i];
        if (o && o.fish) mine.push(o);
      }
      for (i = 0; i < mine.length; i++) {
        try { w.removeObject(mine[i]); } catch (e) { /* пусто */ }
      }
    }
    holes = [];
    sess = null;
    action = null;
    scanned = false;
    lastToastAt = {};
  }

  function fishTick(dt) {
    if (!running()) return;
    try {
      sessionTick(dt);
      actionTick(dt);
      trapTick();
      netTick();
    } catch (e) {
      WS.err('fishTick:', e && e.message);
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
    ok('модуль зарегистрирован', !!WS.Fishing);
    ok('спрайт ice_covered', !!(WS.Spr.specs && WS.Spr.specs().ice_covered));
    ok('спрайт fish_trap', !!(WS.Spr.specs && WS.Spr.specs().fish_trap));
    ok('спрайт fish_trap_full', !!(WS.Spr.specs && WS.Spr.specs().fish_trap_full));
    ok('спрайт fish_net', !!(WS.Spr.specs && WS.Spr.specs().fish_net));
    ok('спрайт fish_net_full', !!(WS.Spr.specs && WS.Spr.specs().fish_net_full));
    ok('предмет pike_raw', !!(WS.Data && WS.Data.items && WS.Data.items.pike_raw));
    ok('предмет burbot_raw', !!(WS.Data && WS.Data.items && WS.Data.items.burbot_raw));
    ok('предмет fish_trap', !!(WS.Data && WS.Data.items && WS.Data.items.fish_trap));
    ok('предмет fish_net', !!(WS.Data && WS.Data.items && WS.Data.items.fish_net));
    ok('рецепт fish_trap', !!(WS.Data && WS.Data.recipesById && WS.Data.recipesById.fish_trap));
    ok('щука калорийнее сырка', (WS.Data.items.pike_raw.cal || 0) > 700);
    ok('налим калорийнее щуки', (WS.Data.items.burbot_raw.cal || 0) > (WS.Data.items.pike_raw.cal || 0));
    ok('окно подсечки >= 2 сек', clamp(HOOK_WINDOW + 10 * HOOK_WINDOW_LV, HOOK_WINDOW, HOOK_WINDOW_MAX) >= 2);
    ok('проверка верши 3 часа', TRAP_CHECK_H === 3);
    ok('шанс верши 40%', Math.abs(TRAP_CHANCE - 0.4) < 1e-9);
    ok('долбить лёд 30 сек', BREAK_DUR === 30);
    var seen = {};
    var all = ['fresh_fish', 'pike_raw', 'burbot_raw'];
    for (var i = 0; i < 300; i++) {
      var f = pickFish();
      seen[f] = 1;
    }
    ok('таблица улова полная', seen.fresh_fish && seen.pike_raw && seen.burbot_raw);
    out.unshift('fishing.selftest: ' + pass + ' ок, ' + fail + ' провалено');
    return out;
  }

  // ====================================================================
  //  ПУБЛИЧНЫЙ API
  // ====================================================================

  WS.def('Fishing', {
    holes: function () { return holes; },
    scanHoles: scanHoles,
    ensureHoles: ensureHoles,
    startCast: startCast,
    hookFish: hookFish,
    cancelSession: cancelSession,
    placeTrap: placeTrap,
    placeNet: placeNet,
    breakIce: startIceBreak,
    netReady: netReady,
    reset: resetFish,
    session: function () { return sess; },
    selftest: selftest
  });

  // ====================================================================
  //  BOOT
  // ====================================================================

  WS.boot(function initFishing() {
    defFishSprites();
    defFishItems();

    // имена рыбьих предметов (тест-сьют S2: показывался сырой id)
    (function fishNames() {
      try {
        WS.Data = WS.Data || {};
        WS.Data.locales = WS.Data.locales || {};
        var ru = WS.Data.locales.ru = WS.Data.locales.ru || {};
        var en = WS.Data.locales.en = WS.Data.locales.en || {};
        var RU = { pike_raw: 'Щука-сырец', burbot_raw: 'Налим-сырец', fish_trap: 'Верша', fish_net: 'Рыбацкая сеть' };
        var EN = { pike_raw: 'Raw Pike', burbot_raw: 'Raw Burbot', fish_trap: 'Fish Trap', fish_net: 'Fishing Net' };
        for (var k in RU) {
          if (!ru['item.' + k + '.name']) ru['item.' + k + '.name'] = RU[k];
          if (!en['item.' + k + '.name']) en['item.' + k + '.name'] = EN[k];
        }
      } catch (e) { /* пусто */ }
    })();

    // страховка порядка загрузки относительно data/recipes.js
    WS.afterFirstFrame(function () {
      try { defFishItems(); } catch (e) { WS.err('fishing.items:', e && e.message); }
    });

    // ловля/снасти — тик систем (42)
    WS.tick(TICK_PRI, fishTick, 'fish:core');

    // мороз и верши — по игровому часу
    WS.Ev.on('time:hour', onHour);

    // проруби: после полной генерации; страховка на старт/загрузку
    WS.Ev.on('gen:interiors', function () { scanHoles(); });
    WS.Ev.on('game:start', function () { if (!scanned) scanHoles(); });
    WS.Ev.on('game:load', function () { if (!scanned) scanHoles(); });
    WS.Ev.on('gen:town', resetFish);

    // ввод: E/ПКМ — ловля, Y — верша, U — сеть
    WS.Ev.on('key:down', onKey);
    WS.Ev.on('mouse:down', onMouse);

    WS.log('fishing: рыбалка готова (проруби, верши, сеть, мороз)');
  }, 'fish:init');
})();
