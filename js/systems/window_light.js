/**
 * СВЕТ В ОКНАХ: вечером изредка загораются окна одного-двух домов.
 * Обман? Память мира? Атмосфера и навигация для игрока.
 */
(function () {
  'use strict';

  var lit = [];       // [{tileKey, light}]
  var litTimer = 0;
  var lastLit = -1;   // день последнего зажжения

  function toast(text, kind) {
    if (WS.Ui && WS.Ui.toast) WS.Ui.toast(text, kind || 'info');
  }

  function findByKey(k) {
    for (var i = 0; i < lit.length; i++) if (lit[i].tileKey === k) return lit[i];
    return null;
  }

  /** Найти случайное окно вдали от игрока. */
  function pickWindow() {
    var p = WS.G && WS.G.player;
    if (!p || !WS.World) return null;
    var W = WS.World;
    // ищем WINDOW-тайлы поблизости (не вплотную)
    var found = null;
    var tries = 0;
    while (!found && tries < 400) {
      tries++;
      var tx = Math.floor(p.x + (Math.random() - 0.5) * 50);
      var ty = Math.floor(p.y + (Math.random() - 0.5) * 50);
      if (tx < 2 || ty < 2 || tx >= W.w - 2 || ty >= W.h - 2) continue;
      if (W.tileAt(tx, ty) !== W.T.WINDOW) continue;
      var d = WS.M.dist(tx, ty, p.x, p.y);
      if (d < 8 || d > 40) continue;
      if (findByKey(tx + ',' + ty)) continue;
      found = { x: tx, y: ty };
    }
    return found;
  }

  /** Зажечь окно. */
  function lightWindow(w) {
    var L = WS.World.addLight({
      x: w.x + 0.5, y: w.y + 0.5,
      r: 30, a: 0.5, flicker: true
    });
    L.warm = true;
    lit.push({ tileKey: w.x + ',' + w.y, light: L, t: 600 + Math.random() * 900 });
    return L;
  }

  /** Погасить все. */
  function extinguishAll() {
    for (var i = 0; i < lit.length; i++) {
      if (lit[i].light) WS.World.removeLight(lit[i].light);
    }
    lit = [];
  }

  WS.boot(function initWindowLight() {
    WS.tick(38, function windowLightTick(dt) {
      if (!WS.G || !WS.G.running || !WS.G.player || !WS.World) return;
      var hour = WS.Time.hourF();

      // догорание/затухание
      for (var i = lit.length - 1; i >= 0; i--) {
        lit[i].t -= dt;
        if (lit[i].t <= 0) {
          if (lit[i].light) WS.World.removeLight(lit[i].light);
          lit.splice(i, 1);
        }
      }

      // зажигаем только в сумерках и ночью, раз в день, редко
      var day = WS.Time.day();
      var dusk = (hour >= 15.5 && hour <= 18.5);
      if (!dusk || day === lastLit) return;
      if (Math.random() > 0.008) return;   // раз в ~2 минуты проверки в сумерках

      var w = pickWindow();
      if (!w) return;
      lightWindow(w);
      lastLit = day;

      // игрок видит?
      var d = WS.M.dist(w.x, w.y, WS.G.player.x, WS.G.player.y);
      if (d < 35) {
        toast('В одном из окон, кажется, мелькнул свет.', 'info');
        if (WS.G.player) {
          WS.G.player.needs.sanity = Math.min(100, WS.G.player.needs.sanity + 2);
        }
        if (WS.G.story && WS.G.story.chronicle) {
          WS.G.story.chronicle.push({ day: day, text: 'Свет в окне' });
        }
      }
    }, 'winlight:tick');

    // смерть/конец — погасить
    WS.Ev.on('player:die', extinguishAll);
    WS.Ev.on('game:victory', extinguishAll);
  }, 'winlight:init');

  WS.def('WindowLight', {
    litCount: function () { return lit.length; },
    extinguishAll: extinguishAll
  });
})();
