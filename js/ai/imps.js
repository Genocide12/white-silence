/**
 * imps.js — МОРОЗНЫЕ МУЛЬТЯШКИ: озорные враги-духи (счётчик «изгнано»).
 *
 * ЧТО ЭТО: маленькие мультяшные создания из изморози — круглые, с огромными
 * глазами и дурашливой ухмылкой. Ночью (и в полярную ночь) таскаются к герою:
 * хихикают, портят рассудок, норовят стащить еду. Боятся света и шума:
 * факел/фонарь/выстрел/удар — и мультяшка с писком изгнана (счётчик +1).
 *
 * ЗАЧЕМ В ИГРЕ: (1) враги рядом с посёлком — волки сидят в лесу и посёлок
 * не посещают, а мультяшки дают ночь с событиями; (2) счётчик изгнаний —
 * игровая цель и строчка статистики «изгнано мультяшек: N»; (3) факел
 * получает боевое применение ДО финального костра.
 *
 * ЧЕСТНОСТЬ: изгнание работает теми же системами, что и у волков
 * (noise/fire/melee), трупа и лута нет — мультяшка рассыпается изморозью.
 */
(function () {
  'use strict';

  // ====================================================================
  //  НАСТРОЙКИ
  // ====================================================================

  var MAX_ALIVE = 3;           // одновременно на карту к герою
  var SPAWN_EVERY = 40;        // сек реального времени между волнами (в среднем)
  var SPAWN_JITTER = 20;
  var NIGHT_ONLY = true;       // днём спят (полярная ночь = всегда ночь)
  var STEAL_R = 1.5;           // дистанция кражи
  var FLEE_AFTER_STEAL = 9;    // сек бегства после кражи
  var SCARE_LIGHT_R = 4.2;     // радиус света, которого мультяшки боятся
  var SANITY_HIT = 3;          // рассудок за кражу

  var imps = [];               // живые мультяшки
  var expelled = 0;            // СЧЁТЧИК: изгнано мультяшек
  var spawnT = 25;             // до первой волны
  var saidAbout = false;

  // палитра мультяшки: ледяная синева + румянец
  var C_BODY = '#cfe6f5', C_BODY2 = '#9fc6de', C_EDGE = '#6f9cb8';
  var C_EYE = '#1d2b3a', C_GLINT = '#ffffff', C_MOUTH = '#3a4e60';
  var C_BLUSH = '#e8a8b8', C_GLOW = 'rgba(190, 225, 250,';

  // ====================================================================
  //  СПРАЙТ: мультяшка (рисуем сами — WS.Spr.def)
  // ====================================================================

  function px(c, x, y, w, h, col) {
    c.fillStyle = col;
    c.fillRect(x, y, w, h);
  }

  /** Мультяшка анфас: круглый комок изморози, огромные глаза, ухмылка.
   *  frame 0/1 — покачивание; dir не важен (существо вертлявое). */
  function impDraw(c, w, h, frame, dir) {
    var dy = frame === 1 ? 1 : 0;
    // мягкая тень-основание
    px(c, 10, 26, 16, 2, 'rgba(60, 90, 120, 0.45)');
    // тело-комок (пиксельный круг)
    px(c, 8, 8 + dy, 20, 14, C_BODY);
    px(c, 6, 11 + dy, 24, 9, C_BODY);
    px(c, 10, 5 + dy, 16, 4, C_BODY);
    px(c, 13, 4 + dy, 10, 2, C_BODY2);
    px(c, 6, 19 + dy, 24, 3, C_BODY2);       // нижняя тень
    px(c, 8, 6 + dy, 2, 2, C_EDGE);          // края
    px(c, 26, 6 + dy, 2, 2, C_EDGE);
    // «ушки»-сосульки
    px(c, 9, 3 + dy, 3, 4, C_BODY2);
    px(c, 24, 3 + dy, 3, 4, C_BODY2);
    // глаза — огромные, мультяшные
    px(c, 10, 10 + dy, 6, 6, '#f4f9fd');
    px(c, 20, 10 + dy, 6, 6, '#f4f9fd');
    px(c, 11, 11 + dy, 4, 4, C_EYE);
    px(c, 21, 11 + dy, 4, 4, C_EYE);
    px(c, 12, 11 + dy, 1, 1, C_GLINT);
    px(c, 22, 11 + dy, 1, 1, C_GLINT);
    // румянец
    px(c, 7, 16 + dy, 3, 2, C_BLUSH);
    px(c, 26, 16 + dy, 3, 2, C_BLUSH);
    // ухмылка до ушей
    px(c, 12, 17 + dy, 12, 2, C_MOUTH);
    px(c, 11, 15 + dy, 2, 2, C_MOUTH);
    px(c, 23, 15 + dy, 2, 2, C_MOUTH);
    px(c, 14, 19 + dy, 8, 1, C_MOUTH);
    // ручки-ледышки (frame 1 — «тянется к чужому добру»)
    if (frame === 1) {
      px(c, 3, 13 + dy, 4, 3, C_BODY2);
      px(c, 29, 13 + dy, 4, 3, C_BODY2);
    } else {
      px(c, 4, 17 + dy, 3, 3, C_BODY2);
      px(c, 29, 17 + dy, 3, 3, C_BODY2);
    }
    // ножки
    px(c, 12, 22 + dy, 4, 4, C_BODY2);
    px(c, 20, 22 + dy, 4, 4, C_BODY2);
  }

  /** Свечение изморози вокруг мультяшки (поверх спрайта). */
  function makeImpRender(e) {
    return function (ctx, sx, sy, zoom) {
      try {
        var t = performance.now() / 700;
        var a = 0.16 + 0.1 * Math.sin(t + e.x * 5 + e.y * 3);
        var r = 26 * zoom;
        if (ctx.createRadialGradient) {
          var g = ctx.createRadialGradient(sx, sy - 8 * zoom, 0, sx, sy - 8 * zoom, r);
          g.addColorStop(0, C_GLOW + a.toFixed(2) + ')');
          g.addColorStop(1, C_GLOW + '0)');
          ctx.fillStyle = g;
          ctx.fillRect(sx - r, sy - 8 * zoom - r, r * 2, r * 2);
        }
      } catch (err) { /* не ронять кадр */ }
    };
  }

  // ====================================================================
  //  СПАВН
  // ====================================================================

  function isNightNow() {
    try {
      var h = WS.Time.hourF();
      return h >= 20 || h < 6.5;
    } catch (e) { return false; }
  }

  function polarNight() {
    try { return !!(WS.G && WS.G.player && WS.G.player.polarNight); } catch (e) { return false; }
  }

  /** Спавн одной мультяшки поодаль от героя, вне его прямой видимости. */
  function spawnImp() {
    var p = WS.G && WS.G.player;
    var w = WS.World;
    if (!p || !w) return null;
    var R = WS.RNG.mk((Date.now() ^ (imps.length * 7919)) >>> 0);
    for (var tries = 0; tries < 24; tries++) {
      var ang = R.range(0, Math.PI * 2);
      var d = R.range(10, 16);
      var x = Math.round(p.x + Math.cos(ang) * d) + 0.5;
      var y = Math.round(p.y + Math.sin(ang) * d * 0.8) + 0.5;
      if (x < 2 || y < 2 || x >= w.w - 2 || y >= w.h - 2) continue;
      if (w.isTileBlocked(Math.floor(x), Math.floor(y))) continue;
      var e = w.addEnt({
        kind: 'imp',
        x: x, y: y,
        dir: 4,
        hp: 12, maxHp: 12,
        speed: 2.1,
        dmg: 0,                     // мультяшка не бьёт: она ворует и дразнится
        atkSpd: 0,
        sprName: 'imp',
        sprFrame: 0,
        animFrames: 2,
        shadowR: 0.4,
        scale: 0.8,
        state: 'sneak', stateT: 0,
        atkCd: 0,
        sight: 14,
        brain: { hears: true, noInside: false },
        imp: { giggleT: R.range(2, 6), stolen: false, fleeT: 0 }
      });
      e.render = makeImpRender(e);
      imps.push(e);
      return e;
    }
    return null;
  }

  // ====================================================================
  //  ПОВЕДЕНИЕ
  // ====================================================================

  /** Есть ли пугающий свет в точке (костёр/печь/факел в руках героя). */
  function scaryLightAt(x, y, r) {
    // огонь мира
    if (WS.Fire && WS.Fire.near && WS.Fire.near(x, y, r)) return true;
    // факел/фонарь в руке героя
    var p = WS.G && WS.G.player;
    if (p && p.equip && p.equip.hand1) {
      var it = p.equip.hand1;
      var def = WS.Data && WS.Data.items ? WS.Data.items[it.id] : null;
      if (def && (def.light || it.id === 'torch')) {
        return WS.M.dist(x, y, p.x, p.y) < r;
      }
    }
    return false;
  }

  /** Изгнание: мультяшка рассыпалась изморозью. reason — для журнала. */
  function expel(e, reason) {
    if (!e || e.dead || e.hp <= 0) return;
    e.hp = 0;
    e.dead = true;
    expelled++;
    // счётчик переживает сейв/загрузку (в G.stats)
    try {
      if (WS.G && WS.G.stats) WS.G.stats.impsExpelled = expelled;
    } catch (eSt) { /* пусто */ }
    var idx = imps.indexOf(e);
    if (idx >= 0) imps.splice(idx, 1);
    try { WS.World.removeEnt(e); } catch (err) { /* пусто */ }
    if (WS.Fx && WS.Fx.text) {
      try { WS.Fx.text('изгнан!', e.x, e.y, { col: '#cfe6f5', life: 1.3 }); } catch (err2) { /* пусто */ }
    }
    try { WS.Snd && WS.Snd.play('giggle', { x: e.x, y: e.y, vol: 0.5 }); } catch (err3) { /* пусто */ }
    try {
      WS.Ev.emit('imp:expelled', { x: e.x, y: e.y, total: expelled, reason: reason || '' });
      WS.Story && WS.Story.chron && WS.Story.chron('Изгнал мультяшку' +
        (reason ? ' (' + reason + ')' : '') + '. Всего: ' + expelled + '.', 'anom');
    } catch (err4) { /* пусто */ }
  }

  /** Воришка: стащить съестное из инвентаря героя. */
  function trySteal(e, p) {
    var candidates = [];
    for (var i = 0; i < p.inv.length; i++) {
      var it = p.inv[i];
      if (!it) continue;
      var def = WS.Data && WS.Data.items ? WS.Data.items[it.id] : null;
      if (def && (def.cal || 0) > 0 && it.id !== 'vodka') candidates.push(i);
    }
    if (!candidates.length) return false;
    var idx = candidates[(imps.length + expelled) % candidates.length];
    var taken = p.inv[idx];
    try {
      if (WS.Inv && WS.Inv.drop) {
        // выбросим предмет из инвентаря — мультяшка «унесла»
        WS.Inv.drop(idx, 1);
        if (WS.Fx && WS.Fx.text) {
          try { WS.Fx.text('хе-хе! ' + (WS.Inv.nameOf ? WS.Inv.nameOf(taken.id) : 'еда') + ' тю-тю', p.x, p.y - 1, { col: '#e8a8b8', life: 1.6 }); } catch (er) { /* пусто */ }
        }
      }
    } catch (err) { return false; }
    if (p.needs && typeof p.needs.sanity === 'number') {
      p.needs.sanity = Math.max(0, p.needs.sanity - SANITY_HIT);
    }
    return true;
  }

  function updateImp(e, dt) {
    var p = WS.G && WS.G.player;
    if (!p || p.hp <= 0) return;
    var st = e.imp;
    if (!st) return;
    e.stateT += dt;
    e.atkCd = Math.max(0, (e.atkCd || 0) - dt);

    // свет рядом — паника/изгнание
    if (scaryLightAt(e.x, e.y, SCARE_LIGHT_R)) {
      if (!st.litT) st.litT = 0;
      st.litT += dt;
      if (st.litT > 0.35) { expel(e, 'свет'); return; }
    } else st.litT = 0;

    // герой ударил/выстрелил рядом — обработают события ниже (noise/melee)

    var d = WS.M.dist(p.x, p.y, e.x, e.y);

    // режим бегства после кражи
    if (st.fleeT > 0) {
      st.fleeT -= dt;
      stepAway(e, p, dt);
      if (st.fleeT <= 0) { expel(e, 'убежал с добычей'); }
      return;
    }

    // подошёл — стащить и бежать
    if (d < STEAL_R && !st.stolen) {
      st.stolen = true;
      if (trySteal(e, p)) {
        st.fleeT = FLEE_AFTER_STEAL;
        try { WS.Snd && WS.Snd.play('giggle', { x: e.x, y: e.y, vol: 0.7 }); } catch (er) { /* пусто */ }
      } else {
        // красть нечего — поизмываться и уйти
        st.fleeT = 4;
      }
      return;
    }

    // хихиканье
    st.giggleT -= dt;
    if (st.giggleT <= 0) {
      st.giggleT = 4 + Math.random() * 6;
      try { WS.Snd && WS.Snd.play('giggle', { x: e.x, y: e.y, vol: 0.35 }); } catch (er) { /* пусто */ }
    }

    // красться к герою (мультяшки не заходят в дома — милуются в окно)
    var inside = false;
    try { inside = !!(WS.World && WS.World.isInside && WS.World.isInside(p.x, p.y)); } catch (er) { /* пусто */ }
    if (!inside && d > STEAL_R - 0.3) {
      stepToward(e, p, dt);
    }
    // рассвет/оттепель — изморозь тает
    if (!isNightNow() && !polarNight() && e.stateT > 30) {
      expel(e, 'растаял на рассвете');
    }
  }

  function stepToward(e, p, dt) {
    var dx = p.x - e.x, dy = p.y - e.y;
    var d = Math.sqrt(dx * dx + dy * dy) || 1;
    var spd = e.speed * dt;
    var nx = e.x + (dx / d) * spd;
    var ny = e.y + (dy / d) * spd;
    if (!blocked(nx, ny)) {
      e.x = nx; e.y = ny;
      e.dir = (Math.abs(dx) > Math.abs(dy)) ? (dx > 0 ? 2 : 6) : (dy > 0 ? 4 : 0);
      e.sprFrame = (e.sprFrame + dt * 6) % 2 | 0;
      try { WS.World.syncCell && WS.World.syncCell(e); } catch (er) { /* пусто */ }
    } else {
      // обойти: пробуем по осям
      if (!blocked(e.x + Math.sign(dx) * spd, e.y)) { e.x += Math.sign(dx) * spd; }
      else if (!blocked(e.x, e.y + Math.sign(dy) * spd)) { e.y += Math.sign(dy) * spd; }
    }
  }

  function stepAway(e, p, dt) {
    var dx = e.x - p.x, dy = e.y - p.y;
    var d = Math.sqrt(dx * dx + dy * dy) || 1;
    var spd = e.speed * 1.6 * dt;      // уносится быстрее
    var nx = e.x + (dx / d) * spd;
    var ny = e.y + (dy / d) * spd;
    if (!blocked(nx, ny)) {
      e.x = nx; e.y = ny;
      try { WS.World.syncCell && WS.World.syncCell(e); } catch (er) { /* пусто */ }
    }
    e.sprFrame = (e.sprFrame + dt * 9) % 2 |0;
  }

  function blocked(x, y) {
    try {
      var w = WS.World;
      return w.isTileBlocked(Math.floor(x), Math.floor(y));
    } catch (e) { return true; }
  }

  // ====================================================================
  //  ТИК
  // ====================================================================

  function impsTick(dt) {
    var g = WS.G;
    if (!g || !g.running || !g.player || g.player.hp <= 0) return;

    // чистка мёртвых
    for (var i = imps.length - 1; i >= 0; i--) {
      if (!imps[i] || imps[i].dead || imps[i].hp <= 0) imps.splice(i, 1);
    }

    // спавн волн: только ночь/полярная ночь, не в бою с чем-то ещё
    var nightish = isNightNow() || polarNight();
    if (NIGHT_ONLY && !nightish) return;
    spawnT -= dt;
    if (spawnT <= 0) {
      spawnT = SPAWN_EVERY + Math.random() * SPAWN_JITTER;
      if (imps.length < MAX_ALIVE) {
        var e = spawnImp();
        if (e && !saidAbout) {
          saidAbout = true;
          try {
            WS.Ui && WS.Ui.toast && WS.Ui.toast(
              'Изморозь шевелится… морозные мультяшки идут красть еду. Свет их изгоняет!', 'warn');
          } catch (er) { /* пусто */ }
        }
      }
    }
  }

  // ====================================================================
  //  РЕАКЦИИ НА ИГРОКА: удары/выстрелы/шум изгоняют мультяшек
  // ====================================================================

  function wireCombat() {
    // melee-удар по мультяшке
    WS.Ev.on('ent:attack', function (d) {
      if (!d || !d.dst || d.dst.kind !== 'imp') return;
      if (d.dst.hp <= 0) return;
      // один тычок — изгнана (существо из снега и смеха)
      expel(d.dst, 'врукопашную');
    });
    // выстрел рядом — шум изгоняет
    WS.Ev.on('noise', function (d) {
      if (!d) return;
      var loud = (d.r || 0) >= 10;
      if (!loud) return;
      for (var i = imps.length - 1; i >= 0; i--) {
        var e = imps[i];
        if (e && WS.M.dist(e.x, e.y, d.x, d.y) < 7) expel(e, 'шум');
      }
    });
    // урон от огня (факелом тыкнули) — тоже ent:attack выше
  }

  // ====================================================================
  //  СТАТИСТИКА И API
  // ====================================================================

  WS.boot(function initImps() {
    // спрайт мультяшки
    try { WS.Spr.def('imp', { w: 32, h: 30, draw: impDraw }); } catch (e) { /* пусто */ }

    // тик — после мира, до игрока
    WS.tick(30, impsTick, 'ai:imps');

    // поведение каждой мультяшки — через общий контролёр AI, если есть;
    // иначе сами в тике
    WS.tick(31, function (dt) {
      var g = WS.G;
      if (!g || !g.running) return;
      for (var i = 0; i < imps.length; i++) {
        try { updateImp(imps[i], dt); } catch (e) { /* не ронять кадр */ }
      }
    }, 'ai:imps:upd');

    wireCombat();

    // сброс на новую партию; на ЗАГРУЗКЕ — восстановить счётчик из сейва
    WS.Ev.on('game:start', function () {
      imps = [];
      expelled = 0;
      spawnT = 30;
      saidAbout = false;
    });
    WS.Ev.on('game:load', function () {
      imps = [];
      try {
        expelled = (WS.G && WS.G.stats && WS.G.stats.impsExpelled) || 0;
      } catch (eL) { expelled = 0; }
      spawnT = 30;
      saidAbout = false;
    });

    WS.log('imps: морозные мультяшки зарегистрированы');
  }, 'imps:init');

  WS.def('Imps', {
    count: function () { return imps.length; },
    expelled: function () { return expelled; },
    /** Тестам: заспавнить мультяшку рядом с точкой. */
    _spawn: function (x, y) {
      var e = spawnImp();
      if (e && x !== undefined) { e.x = x; e.y = y; }
      return e;
    },
    /** Тестам: список сущностей. */
    _list: function () { return imps.slice(); },
    /** Тестам: изгнать силой (считается в счётчик). */
    _expel: function (e, r) { expel(e, r || 'тест'); }
  });
})();
