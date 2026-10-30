/**
 * Игровой цикл: фиксированный шаг симуляции 60 Гц + рендер каждый кадр.
 * WS.Loop.start() / WS.Loop.stop(); dt симуляции = 1/60.
 * Множитель скорости: WS.Loop.speed (1 = пауза, 2..5 = ускорение времени x1..x4).
 */
(function () {
  'use strict';

  var STEP = 1 / 60;         // шаг симуляции
  var MAX_STEPS = 5;        // защита от спирани смерти
  // Тики с приоритетом [70, 80) — РЕНДЕР (gfx:render=70, events:aurora=75):
  // выполняются РАЗ В КАДР, а не на каждом шаге симуляции. Иначе при просадке
  // FPS догоняющие шаги (до 5) рисовали кадр по 5 раз — нагрузка росла ещё
  // сильнее (spiral of death). UI-тики (80+) остаются пошаговыми.
  var RENDER_LO = 70, RENDER_HI = 80;
  var acc = 0;
  var last = 0;
  var raf = 0;
  var running = false;
  var frameCount = 0;
  var fps = 60, fpsAcc = 0, fpsN = 0, fpsT = 0;

  var Loop = {
    speed: 1,               // 1..5, 0 = пауза (управляется через setSpeed)
    stepsRun: 0,
    setSpeed: function (mult) {
      Loop.speed = Math.max(0, Math.min(5, mult));
    },
    start: function () {
      if (running) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    },
    stop: function () {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    },
    fps: function () { return Math.round(fps); }
  };

  function frame(now) {
    if (!running) return;
    var real = (now - last) / 1000;
    last = now;
    if (real > 0.25) real = 0.25;             // таб был свёрнут
    if (real < 0) real = 0;

    // fps-метр
    fpsAcc += real; fpsN++;
    if (fpsAcc >= 0.5) { fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; }

    var active = !WS.paused && !WS.dead && WS.G && WS.G.running && WS.Ui && !WS.Ui.modal();

    if (active) {
      acc += real;
      var steps = 0;
      var mult = Loop.speed || 1;
      while (acc >= STEP && steps < MAX_STEPS * mult) {
        simulate(STEP);
        acc -= STEP;
        steps++;
      }
      if (steps >= MAX_STEPS * mult) acc = 0;  // не догоняем пропуски
      Loop.stepsRun += steps;
    } else {
      acc = 0;
    }

    // рендер всегда (и на паузе — для UI/мозаики)
    render(real);

    frameCount++;
    if (frameCount === 3) {
      for (var i = 0; i < WS._postFns.length; i++) {
        try { WS._postFns[i](); } catch (e) { WS.err('postFrame:', e); }
      }
    }
    raf = requestAnimationFrame(frame);
  }

  function simulate(dt) {
    var tickers = WS._tickFns;
    for (var i = 0; i < tickers.length; i++) {
      var t = tickers[i];
      // рендер-тики [70, 80) выполняются в render() — раз в кадр
      if (t.pri >= RENDER_LO && t.pri < RENDER_HI) continue;
      try {
        t.fn(dt);
      } catch (e) {
        WS.err('tick "' + t.name + '" failed:', e && e.message);
        // выкидываем падающий тик, чтобы не заспамить консоль
        tickers.splice(i, 1); i--;
      }
    }
  }

  function render(rdt) {
    var canvas = WS.Gfx && WS.Gfx.canvas();
    if (!canvas) return;
    // рендер-тики: один раз за кадр (в т.ч. на паузе и в меню)
    var tickers = WS._tickFns;
    for (var i = 0; i < tickers.length; i++) {
      var t = tickers[i];
      if (t.pri < RENDER_LO || t.pri >= RENDER_HI) continue;
      try {
        t.fn(rdt);
      } catch (e) {
        WS.err('render tick "' + t.name + '" failed:', e && e.message);
        tickers.splice(i, 1); i--;
      }
    }
  }

  WS.def('Loop', Loop);
})();
