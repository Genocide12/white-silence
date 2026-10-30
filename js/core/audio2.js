/**
 * audio2.js — ВТОРАЯ ОЧЕРЕДЬ ПРОЦЕДУРНОГО ЗВУКА (модуль L2.1).
 * Дополнительные эффекты к audio.js: интерьеры (двери, самовар, бумага),
 * звери и птицы, человеческие голоса, кузница, церковные колокола,
 * ледоход и морозный треск леса. Никаких аудиофайлов — весь звук синтез.
 *
 * Модуль НЕ трогает audio.js: берёт AudioContext через WS.Snd.ctx()
 * (если Snd ещё не создал контекст — молча трогает его нулевым кликом,
 * крайний случай — поднимает свой). Держит СВОЙ буферный кэш и пул голосов.
 * Расширение извне: WS.Snd2.def('name', dur, fn) — тот же makeBuffer-паттерн,
 * что и в audio.js: fn(t, u, i) возвращает сэмпл.
 *
 * Связи: core/audio.js (общий ctx), core/events.js ('sound2:play'),
 * core/math.js (дистанция/изометрия), state.js (WS.G.player).
 */
(function () {
  'use strict';

  // ====================================================================
  //  СОСТОЯНИЕ МОДУЛЯ
  // ====================================================================

  var ac = null;             // AudioContext (общий с WS.Snd, либо свой)
  var ownCtx = false;        // контекст создали мы сами (fallback)
  var master = null;         // мастер-гейн Snd2 (не зависит от Snd)
  var voices = [];           // пул активных источников [{src, gain, name}]
  var buffers = {};          // буферный кэш: имя -> AudioBuffer
  var customs = {};          // внешние определения: имя -> фабрика {dur, fn}
  var lastPlayed = {};       // антиспам: имя -> время последнего запуска

  var volume = 0.7;          // громкость очереди Snd2 (0..1)
  var muted = false;

  var RATE = 22050;          // частота синтеза буферов (как в audio.js)
  var MAX_VOICES = 36;       // потолок одновременных голосов очереди
  var DEF_RADIUS = 26;      // радиус слышимости позиционных звуков, тайлы

  var TAU = Math.PI * 2;

  // ====================================================================
  //  КОНТЕКСТ: берём у WS.Snd, при нужде поднимаем свой
  // ====================================================================

  function ensureCtx() {
    if (ac) return true;
    // 1) Snd мог уже создать контекст (амбиент, звуки)
    try { if (WS.Snd && WS.Snd.ctx) ac = WS.Snd.ctx() || null; } catch (e1) { ac = null; }
    // 2) молча трогаем Snd — его play() создаёт общий контекст
    if (!ac) {
      try {
        if (WS.Snd && WS.Snd.play) {
          WS.Snd.play('click', { vol: 0, gap: 0 });
          ac = WS.Snd.ctx() || null;
        }
      } catch (e2) { ac = null; }
    }
    // 3) совсем никак (audio.js не грузился / нет Web Audio) — свой контекст
    if (!ac) {
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        ac = new AC();
        ownCtx = true;
      } catch (e3) { return false; }
    }
    try {
      master = ac.createGain();
      master.gain.value = muted ? 0 : volume;
      master.connect(ac.destination);
    } catch (e4) {
      WS.err('Snd2: мастер-гейн не создан', e4 && e4.message);
      return false;
    }
    return true;
  }

  /** Внешним модулям (music.js): наш контекст, если он у нас есть. */
  function ctx() { return ac; }

  // ====================================================================
  //  СИНТЕЗ-ТУЛКИТ (общий знаменатель всех фабрик ниже)
  // ====================================================================

  /**
   * Детерминированный ГПСЧ: один и тот же seed -> один и тот же звук.
   * Возвращает функцию () -> [0..1). Шум берём всегда отсюда, чтобы
   * повторные вызовы getBuf (сброс кэша) не меняли характер звука.
   */
  function rngf(seed) {
    var s = seed >>> 0;
    if (!s) s = 0x9e3779b9;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >>> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }

  /** Белый шум [-1..1) из переданного ГПСЧ. */
  function nz(R) { return R() * 2 - 1; }

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  /** Экспоненциальное затухание: exp(-t/tau). */
  function dec(t, tau) { return Math.exp(-t / tau); }

  /** Простое окно атака/спад: a — атака, r — релиз, dur — общая длина. */
  function envAR(t, dur, a, r) {
    if (t < a) return t / a;
    var rel = dur - r;
    if (t > rel) return Math.max(0, (dur - t) / r);
    return 1;
  }

  /** Гауссов «бугор» в момент tc шириной w (для щелчков/ударов). */
  function bump(t, tc, w) {
    var x = (t - tc) / w;
    return Math.exp(-x * x);
  }

  /**
   * Однополюсный ФНЧ с фиксированной частотой среза. Возвращает функцию
   * с внутренним состоянием (один вызов = один сэмпл).
   */
  function onePole(cut) {
    var a = 1 - Math.exp(-TAU * cut / RATE);
    var y = 0;
    return function (x) { y += a * (x - y); return y; };
  }

  /** Однополюсный ФВЧ (обесшумливание низа). */
  function hpOne(cut) {
    var a = 1 - Math.exp(-TAU * cut / RATE);
    var y = 0;
    return function (x) { y += a * (x - y); return x - y; };
  }

  /** ФНЧ с переменной на лету частотой среза (эхо, свипы). */
  function lpDyn() {
    var a = 0.1, y = 0;
    return function (x, cut) {
      a = 1 - Math.exp(-TAU * (cut || 1000) / RATE);
      y += a * (x - y);
      return y;
    };
  }

  /**
   * Фазовый аккумулятор: возвращает текущую фазу 0..1.
   * step = f/RATE (можно с джиттером — «скрипучий голос»).
   * Синус берём снаружи: Math.sin(TAU * ph).
   */
  function phAcc() {
    var ph = 0;
    return function (step) {
      ph += step;
      ph -= Math.floor(ph);
      return ph;
    };
  }

  /** Тот же makeBuffer-паттерн, что в audio.js: буфер из функции сэмпла. */
  function makeBuffer(duration, fn) {
    var n = Math.ceil(duration * RATE);
    if (n < 2) n = 2;
    var buf = ac.createBuffer(1, n, RATE);
    var data = buf.getChannelData(0);
    for (var i = 0; i < n; i++) {
      var t = i / RATE, u = t / duration;
      data[i] = fn(t, u, i);
    }
    return buf;
  }

  // ====================================================================
  //  РЕЕСТР ЗВУКОВ: фабрики {dur, fn(t,u,i)}
  //  Каждая фабрика собирает своё состояние в замыкании (фильтры, фазы,
  //  предвычисленные рывки/щелчки) и возвращает чистую сэмпл-функцию.
  // ====================================================================

  var SYNTH = {};

  function D(name, factory) { SYNTH[name] = factory; }

  // --------------------------------------------------------------------
  //  ДВЕРИ, ЛЁД, ИНСТРУМЕНТЫ
  // --------------------------------------------------------------------

  /**
   * Дверь скрип (длинный): трение-«прихват» по петлям — серия рывков,
   * частота пилы внутри рывка растёт, амплитуда дрожит.
   */
  D('door_creak', function () {
    var R = rngf(1013);
    var ph = phAcc();
    var segs = [];
    var tt = 0.02;
    while (tt < 2.0) {
      var len = 0.05 + R() * 0.12;
      segs.push({
        t: tt, len: len,
        f0: 130 + R() * 90,             // старт частоты рывка
        f1: 160 + R() * 280,             // конец (прихват тянет выше)
        a: 0.25 + R() * 0.75             // сила рывка
      });
      tt += len + R() * 0.06;
    }
    var lp = onePole(2400);              // смягчить пилу
    var bodyPh = phAcc();
    return {
      dur: 2.2,
      fn: function (t, u, i) {
        var v = 0;
        for (var k = 0; k < segs.length; k++) {
          var s = segs[k];
          var x = (t - s.t) / s.len;
          if (x >= 0 && x < 1) {
            var f = s.f0 + (s.f1 - s.f0) * x * x;
            // амплитуда рывка: нарастание + дрожь прихвата
            var e = Math.sin(Math.PI * x) * s.a * (0.7 + 0.3 * Math.sin(TAU * 9 * x + 1.7));
            v += (ph((f + e * 26) / RATE) * 2 - 1) * e;
          }
        }
        v = lp(v * 0.5);
        // низкое полотно двери
        var body = Math.sin(TAU * bodyPh(66 / RATE)) * 0.05 * envAR(t, 2.2, 0.25, 0.5);
        return clamp(v * 0.6 + body + nz(R) * 0.012, -0.95, 0.95);
      }
    };
  });

  /** Петли: короткий тонкий скрип (две «нитки» с вибрато прихвата). */
  D('hinge_squeak', function () {
    var R = rngf(77);
    var ph = phAcc();
    function sq(x, len, f0, w) {
      if (x < 0 || x >= len) return 0;
      var p = x / len;
      var f = f0 * (1 + 0.9 * p) * (1 + 0.04 * Math.sin(TAU * 24 * x + w));
      var e = Math.pow(Math.sin(Math.PI * p), 1.3) * (0.55 + 0.45 * Math.sin(TAU * 15 * x + w * 2));
      return (ph(f / RATE) * 2 - 1) * e;
    }
    var lp = onePole(3200);
    return {
      dur: 0.9,
      fn: function (t, u, i) {
        var v = sq(t - 0.04, 0.34, 760, 0) + sq(t - 0.48, 0.32, 880, 2.1) * 0.9;
        v = lp(v);
        var clack = (t > 0.78 && t < 0.86) ? nz(R) * 0.25 * Math.exp(-(t - 0.78) * 90) : 0;
        return clamp(v * 0.5 + clack, -0.9, 0.9);
      }
    };
  });

  /**
   * Лёд треск длинный: глубокий стартовый удар + стон льда (биения двух
   * близких низких тонов) + серия щелчков-разломов.
   */
  D('ice_crack_long', function () {
    var R = rngf(4242);
    var clicks = [];
    var tt = 0.35;
    while (tt < 2.5) {
      clicks.push({
        t: tt,
        a: 0.3 + R() * 0.7,
        w: 0.004 + R() * 0.006,          // время жизни щелчка
        f: 500 + R() * 1600
      });
      tt += 0.05 + R() * 0.22;
    }
    var lpBoom = onePole(320);
    var lpClick = onePole(1100);
    return {
      dur: 2.8,
      fn: function (t, u, i) {
        // удар тела льда (низ уходящего тона)
        var boom = Math.sin(TAU * (46 - 14 * u) * t) * Math.exp(-t * 3) * 0.55;
        var grit = lpBoom(nz(R)) * Math.exp(-t * 2.2) * 0.3;
        // стон: 57 и 59.5 Гц бьются между собой
        var moan = (Math.sin(TAU * 57 * t) + Math.sin(TAU * 59.5 * t)) * 0.06 *
                   envAR(t, 2.8, 0.4, 0.9);
        var cl = 0;
        for (var k = 0; k < clicks.length; k++) {
          var c = clicks[k];
          var x = t - c.t;
          if (x >= 0 && x < 0.03) cl += Math.sin(TAU * c.f * x) * Math.exp(-x / c.w) * c.a;
        }
        cl = lpClick(cl);
        return clamp(boom + grit + moan + cl * 0.5, -0.95, 0.95);
      }
    };
  });

  /** Лопата снег: врез, шорох зачерпывания, сброс. */
  D('shovel_snow', function () {
    var R = rngf(55);
    var lp = onePole(750);
    var hp = hpOne(160);
    return {
      dur: 0.6,
      fn: function (t, u, i) {
        var move = envAR(t, 0.6, 0.07, 0.2);
        var n = hp(lp(nz(R))) * move * 0.42;
        var scrape = Math.sin(TAU * (430 - 190 * u) * t) * 0.05 * move;
        var cut = (t < 0.1) ? Math.sin(TAU * 74 * t) * Math.exp(-t * 55) * 0.3 : 0;
        var drop = (t > 0.44) ? nz(R) * Math.exp(-(t - 0.44) * 30) * 0.22 : 0;
        return clamp(n + scrape + cut + drop, -0.9, 0.9);
      }
    };
  });

  /** Метла: три сквозящих взмаха по снегу (шорох с «свистом» прутьев). */
  D('broom_sweep', function () {
    var R = rngf(1777);
    var lpA = onePole(520);
    var lpB = onePole(1700);
    function swish(x, len) {
      if (x < 0 || x >= len) return 0;
      var p = x / len;
      var env = Math.pow(Math.sin(Math.PI * p), 1.2);
      // цвет шороха меняется по взмаху: начало глухое, конец шуршит
      var w = nz(R);
      return (lpA(w) * (1 - p * 0.6) + lpB(w) * p * 0.8) * env;
    }
    return {
      dur: 0.85,
      fn: function (t, u, i) {
        var v = swish(t - 0.03, 0.22) + swish(t - 0.31, 0.24) * 0.9 + swish(t - 0.6, 0.2) * 0.7;
        return clamp(v * 0.55, -0.9, 0.9);
      }
    };
  });

  /** Пила по дереву: рваный ритм — 4 тяги, зуб цепляется (АМ 11 Гц). */
  D('saw_wood', function () {
    var R = rngf(31337);
    var strokes = [0.08, 0.48, 0.88, 1.28];
    var lp = onePole(1900);
    var hp = hpOne(350);
    return {
      dur: 1.7,
      fn: function (t, u, i) {
        var v = 0;
        for (var k = 0; k < strokes.length; k++) {
          var x = t - strokes[k];
          if (x >= 0 && x < 0.34) {
            var p = x / 0.34;
            var env = Math.sin(Math.PI * Math.pow(p, 0.7));         // тяга
            var tooth = 0.55 + 0.45 * Math.sin(TAU * (11 - 3 * p) * x); // зубья
            v += hp(lp(nz(R))) * env * tooth;
          }
        }
        // резонанс полотна
        var ring = Math.sin(TAU * 900 * t) * 0.03 * (0.5 + 0.5 * Math.sin(TAU * 2 * t));
        return clamp(v * 0.38 + ring, -0.9, 0.9);
      }
    };
  });

  /** Рубка серия: три удара топора, последний раскалывает полено. */
  D('chop_series', function () {
    var R = rngf(909);
    var chops = [0.1, 0.85, 1.6];
    var lp = onePole(900);
    return {
      dur: 2.6,
      fn: function (t, u, i) {
        var v = 0;
        for (var k = 0; k < chops.length; k++) {
          var x = t - chops[k];
          if (x >= 0 && x < 0.22) {
            var last = (k === 2);
            // глухой удар с падением тона (как chop в audio.js, глубже)
            v += Math.sin(TAU * (150 - 65 * x / 0.22) * x) * 0.55 * Math.exp(-x * 16);
            v += lp(nz(R)) * 0.5 * Math.exp(-x * 40);
            if (last && x > 0.02) {
              // раскол: резкий треск вверх по частоте
              v += Math.sin(TAU * (900 - 300 * x) * x) * 0.2 * Math.exp(-x * 30);
            }
          }
        }
        return clamp(v, -0.95, 0.95);
      }
    };
  });

  /** Полено падение: глухой стук о снег + лёгкий отскок. */
  D('log_fall', function () {
    var R = rngf(66);
    var lp = onePole(260);
    return {
      dur: 0.7,
      fn: function (t, u, i) {
        var thud = Math.sin(TAU * 64 * t) * Math.exp(-t * 9) * 0.6;
        var dust = lp(nz(R)) * Math.exp(-t * 12) * 0.35;
        var wood = Math.sin(TAU * 175 * t) * Math.exp(-t * 18) * 0.12;
        var bounce = (t > 0.33) ? Math.sin(TAU * 58 * (t - 0.33)) * Math.exp(-(t - 0.33) * 14) * 0.3 : 0;
        return clamp(thud + dust + wood + bounce, -0.9, 0.9);
      }
    };
  });

  /**
   * Ружьё эхо в лесу: сухой выстрел + хвост из отражений, каждое тише
   * и глуше (лес съедает верха), + далёкий перекат.
   */
  D('gunshot_forest_echo', function () {
    var R = rngf(1917);
    var echoes = [
      { t: 0.22, a: 0.34, cut: 1500 },
      { t: 0.42, a: 0.22, cut: 900 },
      { t: 0.68, a: 0.13, cut: 550 },
      { t: 1.0, a: 0.08, cut: 350 },
      { t: 1.42, a: 0.05, cut: 250 }
    ];
    var lp = lpDyn();
    return {
      dur: 3.0,
      fn: function (t, u, i) {
        var v = 0;
        // сам выстрел: треск + тело
        if (t < 0.5) {
          v += nz(R) * 0.9 * Math.exp(-t * 30);
          v += Math.sin(TAU * (95 - 55 * u) * t) * 0.55 * Math.exp(-t * 7);
        }
        // отражения: шум тем глуше, чем дальше
        for (var k = 0; k < echoes.length; k++) {
          var e = echoes[k];
          var x = t - e.t;
          if (x >= 0 && x < 0.4) {
            v += lp(nz(R), e.cut) * e.a * Math.exp(-x * 14);
          }
        }
        // далёкий перекат
        var roll = lp(nz(R), 120) * 0.18 * envAR(t, 3.0, 0.15, 1.6);
        return clamp(v * 0.85 + roll, -0.98, 0.98);
      }
    };
  });

  /** Рикошет: свист пули с перелётом + «тук» попадания. */
  D('ricochet', function () {
    var R = rngf(8080);
    var lp = onePole(4000);
    return {
      dur: 1.05,
      fn: function (t, u, i) {
        var v = 0;
        if (t < 0.6) {
          // свист: тон валится экспоненциально, с воем
          var f = 1900 * Math.exp(-t * 3.1) + 240;
          var wob = 1 + 0.06 * Math.sin(TAU * 26 * t);
          v += Math.sin(TAU * f * wob * t) * 0.34 * envAR(t, 0.6, 0.04, 0.12);
          v += lp(nz(R)) * 0.05;
        }
        if (t >= 0.62 && t < 0.85) {
          var x = t - 0.62;
          v += Math.sin(TAU * (300 - 120 * x / 0.2) * x) * Math.exp(-x * 40) * 0.4;
          v += nz(R) * Math.exp(-x * 55) * 0.3;
        }
        // второй, слабый отскок
        if (t >= 0.86) {
          var y = t - 0.86;
          v += Math.sin(TAU * 210 * y) * Math.exp(-y * 50) * 0.1;
        }
        return clamp(v, -0.9, 0.9);
      }
    };
  });

  /** Молот по наковальне: чистый металлический звон с биениями. */
  D('anvil_hammer', function () {
    var R = rngf(5150);
    // негармонические партиалы стали [частота, амплитуда, тау]
    var parts = [
      [520.0, 1.0, 1.2],
      [523.6, 0.5, 1.0],               // биение с первым
      [1042.7, 0.6, 0.9],
      [1566.0, 0.35, 0.7],
      [2086.0, 0.28, 0.5],
      [2610.0, 0.18, 0.35],
      [3390.0, 0.1, 0.25]
    ];
    return {
      dur: 1.5,
      fn: function (t, u, i) {
        var v = 0;
        for (var k = 0; k < parts.length; k++) {
          var p = parts[k];
          v += Math.sin(TAU * p[0] * t) * p[1] * Math.exp(-t / p[2]);
        }
        // удар молота (деревянная рукоять + щелчок)
        var hit = nz(R) * Math.exp(-t * 200) * 0.5 + Math.sin(TAU * 480 * t) * Math.exp(-t * 120) * 0.2;
        return clamp(v * 0.32 + hit * 0.5, -0.95, 0.95);
      }
    };
  });

  /** Напильник шершавый: три тяги с зернистым скрежетом. */
  D('file_rasp', function () {
    var R = rngf(4711);
    var strokes = [0.05, 0.38, 0.68];
    var hp = hpOne(900);
    var lp = onePole(6000);
    return {
      dur: 0.95,
      fn: function (t, u, i) {
        var v = 0;
        for (var k = 0; k < strokes.length; k++) {
          var x = t - strokes[k];
          if (x >= 0 && x < 0.22) {
            var p = x / 0.22;
            var env = Math.sin(Math.PI * Math.pow(p, 0.6));
            // рихтовка зерна: АМ с торможением к концу тяги
            var rasp = 0.6 + 0.4 * Math.sin(TAU * (22 - 6 * p) * x);
            v += lp(hp(nz(R))) * env * rasp;
          }
        }
        var sparkle = Math.sin(TAU * 2300 * t) * 0.02 * (0.5 + 0.5 * Math.sin(TAU * 3 * t));
        return clamp(v * 0.34 + sparkle, -0.9, 0.9);
      }
    };
  });

  /** Пила метал: визгливые тяги со скольжением тона + звенящий хвост. */
  D('saw_metal', function () {
    var R = rngf(1313);
    var strokes = [0.06, 0.46, 0.86, 1.2];
    var hp = hpOne(2000);
    var lp = onePole(7000);
    return {
      dur: 1.65,
      fn: function (t, u, i) {
        var v = 0;
        for (var k = 0; k < strokes.length; k++) {
          var x = t - strokes[k];
          if (x >= 0 && x < 0.3) {
            var p = x / 0.3;
            var env = Math.sin(Math.PI * Math.pow(p, 0.65));
            var teeth = 0.55 + 0.45 * Math.sin(TAU * 14 * x);
            v += lp(hp(nz(R))) * env * teeth * 0.8;
            // визг полотна, когда давим сильнее (середина тяги)
            var press = Math.sin(Math.PI * p);
            v += Math.sin(TAU * (1750 + 90 * Math.sin(TAU * 7 * x)) * x) * 0.1 * press;
          }
        }
        // биение двух близких верхних тонов — «звон в ушах»
        var ring = (Math.sin(TAU * 3100 * t) + Math.sin(TAU * 3131 * t)) * 0.02 * dec(t, 0.5);
        return clamp(v * 0.3 + ring, -0.9, 0.9);
      }
    };
  });

  /**
   * Морозный треск деревьев: резкие выстрелы-трещины (мороз щиплет
   * при -35 и ниже) с лесным хвостом и дробным «тррр» после.
   */
  D('frost_tree_crack', function () {
    var R = rngf(3535);
    var cracks = [
      { t: 0.1, a: 1.0 },
      { t: 0.72, a: 0.7 },
      { t: 1.3, a: 0.5 }
    ];
    var lpTail = lpDyn();
    // дробь после главной трещины
    var ticks = [];
    var tt = 1.38;
    while (tt < 1.95) {
      ticks.push({ t: tt, a: 0.1 + R() * 0.18 });
      tt += 0.02 + R() * 0.045;
    }
    return {
      dur: 2.1,
      fn: function (t, u, i) {
        var v = 0;
        for (var k = 0; k < cracks.length; k++) {
          var c = cracks[k];
          var x = t - c.t;
          if (x >= 0 && x < 0.5) {
            // сам выстрел: щелчок + низкий хлопок дерева
            if (x < 0.03) v += nz(R) * Math.exp(-x * 300) * c.a;
            v += Math.sin(TAU * (185 - 60 * x) * x) * Math.exp(-x * 45) * 0.4 * c.a;
            // лесной хвост
            v += lpTail(nz(R), 600 * (1 - x) + 200) * Math.exp(-x * 12) * 0.3 * c.a;
          }
        }
        for (var j = 0; j < ticks.length; j++) {
          var xk = t - ticks[j].t;
          if (xk >= 0 && xk < 0.012) v += nz(R) * Math.exp(-xk * 500) * ticks[j].a;
        }
        // холодный звонок волокна
        var ring = Math.sin(TAU * 1180 * t) * 0.02 * envAR(t, 2.1, 0.12, 0.9);
        return clamp(v * 0.85 + ring, -0.98, 0.98);
      }
    };
  });

  // --------------------------------------------------------------------
  //  ЗВЕРИ: ВОЛКИ, ЛОСЬ, ОЛЕНЬ, ЛИСА
  // --------------------------------------------------------------------

  /**
   * Рык стаи: несколько голосов на своих низких частотах, каждый с
   * шероховатой АМ и своим накатом. Слышно «стая недовольна».
   */
  D('wolves_pack_growl', function () {
    var R = rngf(60013);
    var lp = onePole(420);
    // голоса: базовая частота, темп рыка, характер наката
    var voicesDef = [
      { f: 58, rate: 21, sw: 1.6, a: 0.9 },
      { f: 69, rate: 27, sw: 2.2, a: 0.8 },
      { f: 76, rate: 18, sw: 2.9, a: 0.7 }
    ];
    return {
      dur: 2.4,
      fn: function (t, u, i) {
        var v = 0;
        for (var k = 0; k < voicesDef.length; k++) {
          var g = voicesDef[k];
          // накат голоса: свой горб активности
          var env = Math.pow(Math.max(0, Math.sin(Math.PI * Math.min(1, t / 2.4) * g.sw)), 1.2) * g.a;
          var rough = 0.6 + 0.4 * Math.sin(TAU * g.rate * t + k * 2.1);
          var wobble = 1 + 0.06 * Math.sin(TAU * 1.7 * t + k);
          v += Math.sin(TAU * g.f * wobble * t) * rough * env;
        }
        // дыхание стаи
        var breath = lp(nz(R)) * 0.12 * envAR(t, 2.4, 0.5, 0.7);
        return clamp(v * 0.34 + breath, -0.9, 0.9);
      }
    };
  });

  /** Волчий скулёж: тонкий голос вверх-вниз, с вибрато, жалобный. */
  D('wolf_whine', function () {
    var R = rngf(4224);
    return {
      dur: 1.15,
      fn: function (t, u, i) {
        // контур: 380 -> 720 -> 470 Гц
        var f = t < 0.5 ? 380 + (720 - 380) * (t / 0.5) : 720 - (720 - 470) * ((t - 0.5) / 0.65);
        var vib = 1 + 0.02 * Math.sin(TAU * 6.5 * t);
        var s = Math.sin(TAU * f * vib * t) + Math.sin(TAU * f * 2.02 * t) * 0.22;
        var env = Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.05)), 1.1);
        var breath = nz(R) * 0.02;
        return clamp(s * 0.32 * env + breath, -0.85, 0.85);
      }
    };
  });

  /** Драка волков: рык + визги-взвизги + глухие удары тел. */
  D('wolf_fight', function () {
    var R = rngf(90125);
    var ph = phAcc();
    var yelps = [
      { t: 0.15, f0: 980, a: 0.8 },
      { t: 0.62, f0: 1050, a: 0.7 },
      { t: 1.25, f0: 890, a: 0.9 },
      { t: 1.55, f0: 1120, a: 0.6 }
    ];
    var lp = onePole(500);
    return {
      dur: 1.95,
      fn: function (t, u, i) {
        var v = 0;
        // рык-подкладка (два голоса, шероховатые)
        var envG = envAR(t, 1.95, 0.2, 0.4);
        v += Math.sin(TAU * 88 * t) * (0.6 + 0.4 * Math.sin(TAU * 24 * t)) * 0.5 * envG;
        v += Math.sin(TAU * 72 * (t + 0.03) * t) * (0.6 + 0.4 * Math.sin(TAU * 19 * t)) * 0.35 * envG;
        // взвизги: короткие descending-чирпы
        for (var k = 0; k < yelps.length; k++) {
          var y = yelps[k];
          var x = t - y.t;
          if (x >= 0 && x < 0.14) {
            var p = x / 0.14;
            var f = y.f0 * (1 - 0.55 * p);
            v += Math.sin(TAU * f * x) * Math.pow(Math.sin(Math.PI * p), 0.8) * y.a * 0.6;
          }
        }
        // возня: удары тел и лапы в снег
        var scuffle = lp(nz(R)) * 0.22 * (0.4 + 0.6 * Math.sin(TAU * 3.5 * t + 1));
        return clamp(v * 0.4 + scuffle, -0.95, 0.95);
      }
    };
  });

  /** Лось рёв: низкий трубный гул с формантой, спад в конце + выдох. */
  D('moose_roar', function () {
    var R = rngf(7001);
    var ph = phAcc();
    var lp = onePole(380);
    return {
      dur: 1.8,
      fn: function (t, u, i) {
        // тон трубы валится от 80 к 54 Гц, с медленным воблём
        var f = (80 - 26 * u) * (1 + 0.035 * Math.sin(TAU * 1.9 * t));
        var saw = ph(f / RATE) * 2 - 1;
        var body = lp(saw) * 0.55;
        // формант «трубы» — звонкая вторая мода
        var form = Math.sin(TAU * 243 * t) * 0.1 * envAR(t, 1.8, 0.3, 0.6);
        var env = Math.min(1, u * 7) * Math.pow(1 - u, 0.7);
        // финальный выдох-фырканье
        var snort = (t > 1.38) ? lp(nz(R)) * Math.exp(-(t - 1.38) * 18) * 0.4 : 0;
        return clamp((body + form) * env + snort, -0.95, 0.95);
      }
    };
  });

  /** Олень фырканье: два носовых выдоха с турбулентной АМ. */
  D('deer_snort', function () {
    var R = rngf(8123);
    var lp = onePole(1000);
    var hp = hpOne(220);
    function snort(x, len, a) {
      if (x < 0 || x >= len) return 0;
      var p = x / len;
      var env = Math.pow(Math.sin(Math.PI * Math.pow(p, 0.75)), 1.3);
      var turb = 0.55 + 0.45 * Math.sin(TAU * 36 * x + 0.5);
      return hp(lp(nz(R))) * env * turb * a;
    }
    return {
      dur: 0.6,
      fn: function (t, u, i) {
        var v = snort(t - 0.04, 0.18, 1) + snort(t - 0.32, 0.16, 0.75);
        return clamp(v * 0.5, -0.9, 0.9);
      }
    };
  });

  /** Лисий лай: резкое «вау-вау», высокий короткий. */
  D('fox_bark', function () {
    var R = rngf(9321);
    function bark(x, a) {
      if (x < 0 || x >= 0.09) return 0;
      var p = x / 0.09;
      var f = 880 - 380 * p;                       // резко вниз
      var env = Math.pow(Math.sin(Math.PI * p), 0.6);
      var s = Math.sin(TAU * f * x) + Math.sin(TAU * f * 2.7 * x) * 0.3;  // хриплый верх
      return (s * env + nz(R) * 0.15 * env) * a;
    }
    return {
      dur: 0.5,
      fn: function (t, u, i) {
        var v = bark(t - 0.05, 1) + bark(t - 0.27, 0.8);
        return clamp(v * 0.5, -0.9, 0.9);
      }
    };
  });

  // --------------------------------------------------------------------
  //  ДВОР: КУРИЦА, ПЕТУХ, КОТ, ПЁС
  // --------------------------------------------------------------------

  /** Курица кудахтанье: короткие «ко-ко» + быстрое «снесла!» в конце. */
  D('chicken_cluck', function () {
    var R = rngf(11223);
    var clucks = [];
    var tt = 0.06;
    while (tt < 0.85) {
      clucks.push({ t: tt, f: 430 + R() * 120, a: 0.6 + R() * 0.4 });
      tt += 0.12 + R() * 0.09;
    }
    // финальная скороговорка
    var fast = [];
    tt = 0.92;
    while (tt < 1.3) {
      fast.push({ t: tt, f: 560 + R() * 120, a: 0.5 + R() * 0.3 });
      tt += 0.055 + R() * 0.02;
    }
    return {
      dur: 1.4,
      fn: function (t, u, i) {
        var v = 0, k;
        for (k = 0; k < clucks.length; k++) {
          var c = clucks[k];
          var x = t - c.t;
          if (x >= 0 && x < 0.07) {
            var p = x / 0.07;
            var f = c.f * (1 - 0.35 * p);          // клок вниз
            v += (Math.sin(TAU * f * x) + Math.sin(TAU * f * 2.1 * x) * 0.3) *
                 Math.pow(Math.sin(Math.PI * p), 0.7) * c.a;
          }
        }
        for (k = 0; k < fast.length; k++) {
          var q = fast[k];
          var xq = t - q.t;
          if (xq >= 0 && xq < 0.05) {
            var pq = xq / 0.05;
            var fq = q.f * (1 - 0.3 * pq);
            v += (Math.sin(TAU * fq * xq)) * Math.pow(Math.sin(Math.PI * pq), 0.6) * q.a * 0.8;
          }
        }
        return clamp(v * 0.42 + nz(R) * 0.01, -0.9, 0.9);
      }
    };
  });

  /** Петух: «ку-ка-ре-кууу» — четыре слога, последний длинный с вибрато. */
  D('rooster', function () {
    var R = rngf(13579);
    var lp = onePole(2800);
    // слог: [старт, длина, базовая частота, длинный (висьтя с вибрато)]
    var syll = [
      [0.05, 0.2, 640, 0],
      [0.33, 0.2, 860, 0],
      [0.61, 0.2, 760, 0],
      [0.9, 0.72, 620, 1]
    ];
    return {
      dur: 1.85,
      fn: function (t, u, i) {
        var v = 0;
        for (var k = 0; k < syll.length; k++) {
          var s = syll[k];
          var x = t - s[0];
          if (x >= 0 && x < s[1]) {
            var p = x / s[1];
            // контур внутри слога: подъём и сброс
            var updown = s[3] ? (1 + 0.22 * Math.sin(Math.PI * Math.min(1, p * 1.6))) :
                                (1 + 0.18 * Math.sin(Math.PI * p));
            var f = s[2] * updown * (s[3] ? (1 + 0.03 * Math.sin(TAU * 9 * x)) : 1);
            var env = Math.pow(Math.sin(Math.PI * p), 0.45) * (s[3] ? 1 : 0.9);
            // хриплый тембр: вторая гармоника и лёгкая обрезка сверху
            var tone = Math.sin(TAU * f * x) * env +
                       Math.sin(TAU * f * 2 * x) * 0.3 * env;
            v += lp(tone);
          }
        }
        return clamp(v * 0.36, -0.9, 0.9);
      }
    };
  });

  /** Кот мяв: «мя-у» — глиссандо вверх и вниз, приоткрывающаяся «пасть». */
  D('cat_meow', function () {
    var R = rngf(2468);
    return {
      dur: 0.95,
      fn: function (t, u, i) {
        // контур: 430 -> 690 -> 380
        var f = t < 0.33 ? 430 + (690 - 430) * (t / 0.33) : 690 - (690 - 380) * ((t - 0.33) / 0.62);
        var vib = 1 + 0.015 * Math.sin(TAU * 7 * t);
        var s = Math.sin(TAU * f * vib * t) +
                Math.sin(TAU * f * 2.05 * t) * 0.3 +
                Math.sin(TAU * f * 3.1 * t) * 0.12;
        // «пасть»: медленная АМ открывания
        var mouth = 0.4 + 0.6 * Math.sin(Math.PI * Math.min(1, u * 1.05));
        var env = Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.02)), 0.9);
        var purr = nz(R) * 0.015;
        return clamp(s * 0.3 * mouth * env + purr, -0.85, 0.85);
      }
    };
  });

  /** Пёс скулёж: тонкий голос с вибрато, жалоба. */
  D('dog_whine', function () {
    var R = rngf(3046);
    return {
      dur: 1.1,
      fn: function (t, u, i) {
        var f = 400 + 210 * Math.sin(Math.PI * u * 0.9) - 60 * u;   // вверх и вниз
        var vib = 1 + 0.025 * Math.sin(TAU * 5.2 * t);
        var s = Math.sin(TAU * f * vib * t) + Math.sin(TAU * f * 2 * t) * 0.15;
        var env = Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.05)), 1.2);
        return clamp(s * 0.3 * env + nz(R) * 0.012, -0.85, 0.85);
      }
    };
  });

  /** Пёс лай: «гав» — резкий лающий удар с падением тона. */
  D('dog_bark', function () {
    var R = rngf(5566);
    function bark(x, a) {
      if (x < 0 || x >= 0.12) return 0;
      var p = x / 0.12;
      var f = 255 - 85 * p;
      var env = Math.pow(Math.sin(Math.PI * p), 0.5);
      var s = Math.sin(TAU * f * x) + Math.sin(TAU * f * 2.2 * x) * 0.35;
      return (s * env + nz(R) * 0.2 * env) * a;
    }
    return {
      dur: 0.4,
      fn: function (t, u, i) {
        var v = bark(t - 0.04, 1) + bark(t - 0.22, 0.75);
        var body = Math.sin(TAU * 110 * t) * Math.exp(-t * 20) * 0.15;
        return clamp(v * 0.45 + body, -0.9, 0.9);
      }
    };
  });

  /** Пёс рычание: низкий шероховатый с двумя накатами. */
  D('dog_growl', function () {
    var R = rngf(6655);
    var lp = onePole(520);
    var ph = phAcc();
    return {
      dur: 1.3,
      fn: function (t, u, i) {
        var f = 84 + 10 * Math.sin(TAU * 2.4 * t);
        var rough = 0.55 + 0.45 * Math.sin(TAU * 27 * t);
        var saw = ph(f / RATE) * 2 - 1;
        var v = lp(saw * rough) * 0.5;
        // два наката громкости
        var env = 0.4 + 0.6 * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.1)), 0.8);
        var breath = lp(nz(R)) * 0.1;
        return clamp((v + breath) * env, -0.9, 0.9);
      }
    };
  });

  /** Пёс радость: быстрые радостные «тяф!» + смешливое дыхание. */
  D('dog_joy', function () {
    var R = rngf(7788);
    var yips = [0.04, 0.16, 0.29, 0.52];
    var lp = onePole(2600);
    return {
      dur: 1.25,
      fn: function (t, u, i) {
        var v = 0;
        for (var k = 0; k < yips.length; k++) {
          var x = t - yips[k];
          if (x >= 0 && x < 0.09) {
            var p = x / 0.09;
            var f = 500 + 320 * p;                 // вверх — радостно
            v += (Math.sin(TAU * f * x) + Math.sin(TAU * f * 2 * x) * 0.25) *
                 Math.pow(Math.sin(Math.PI * p), 0.6);
          }
        }
        // весёлый «гав» в середине
        if (t >= 0.38 && t < 0.5) {
          var xb = t - 0.38;
          v += (Math.sin(TAU * (260 - 90 * xb / 0.12) * xb) + nz(R) * 0.2) *
               Math.pow(Math.sin(Math.PI * xb / 0.12), 0.5) * 0.7;
        }
        // частое дыхание языком
        var pant = 0;
        if (t > 0.62) {
          var xp = (t - 0.62) % 0.16;
          pant = lp(nz(R)) * Math.exp(-xp * 30) * 0.22;
        }
        return clamp(v * 0.45 + pant, -0.9, 0.9);
      }
    };
  });

  // --------------------------------------------------------------------
  //  ЧЕЛОВЕК: КАШЕЛЬ, ЧИХАНИЕ, СТОН, БОРМОТАНИЕ, РЕБЁНОК, ХРАП
  // --------------------------------------------------------------------

  /** Кашель сухой: два жёстких толчка без мокроты. */
  D('cough', function () {
    var R = rngf(2024);
    var lp = onePole(1300);
    var hp = hpOne(380);
    function cough(x, len, a) {
      if (x < 0 || x >= len) return 0;
      var p = x / len;
      var env = Math.pow(Math.sin(Math.PI * Math.pow(p, 0.5)), 1.6);   // жёсткий толчок
      var turb = 0.6 + 0.4 * Math.sin(TAU * 30 * x);                    // хрип в горле
      var voiced = Math.sin(TAU * 140 * x) * 0.35 * env;                // связки
      return (hp(lp(nz(R))) * turb * env + voiced) * a;
    }
    return {
      dur: 0.75,
      fn: function (t, u, i) {
        var v = cough(t - 0.06, 0.17, 1) + cough(t - 0.42, 0.15, 0.85);
        return clamp(v * 0.55, -0.9, 0.9);
      }
    };
  });

  /** Чихание: вдох — взрыв «апчхи» — шлейф. */
  D('sneeze', function () {
    var R = rngf(191719);
    var lp = onePole(1500);
    var hp = hpOne(250);
    return {
      dur: 0.9,
      fn: function (t, u, i) {
        var v = 0;
        if (t >= 0.04 && t < 0.34) {
          // быстрый вдох носом: сужающийся шип
          var xi = t - 0.04;
          var pi = xi / 0.3;
          v += hp(nz(R)) * Math.pow(pi, 1.3) * 0.18 * (1 + 0.3 * Math.sin(TAU * 16 * xi));
        }
        if (t >= 0.38 && t < 0.62) {
          // взрыв
          var x = t - 0.38;
          var p = x / 0.24;
          v += nz(R) * Math.pow(1 - p, 1.6) * 0.85;
          v += Math.sin(TAU * (950 - 620 * p) * x) * 0.35 * (1 - p);
          v += hp(nz(R)) * (1 - p) * 0.3;
        }
        if (t >= 0.62) {
          // хвост-выдох
          var xh = t - 0.62;
          v += lp(nz(R)) * Math.exp(-xh * 12) * 0.12;
        }
        return clamp(v, -0.95, 0.95);
      }
    };
  });

  /** Стон боли: сдавленный низкий голос с вибрато и выдохом. */
  D('moan_pain', function () {
    var R = rngf(5252);
    var lp = onePole(900);
    return {
      dur: 1.05,
      fn: function (t, u, i) {
        var f = 190 - 45 * u;                            // тон сползает
        var vib = 1 + 0.02 * Math.sin(TAU * 4.5 * t);
        var s = Math.sin(TAU * f * vib * t) + Math.sin(TAU * f * 2 * t) * 0.2;
        var env = Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.04)), 1.3);
        var breath = lp(nz(R)) * 0.04 * env;
        return clamp(s * 0.3 * env + breath, -0.85, 0.85);
      }
    };
  });

  /**
   * Бормотание старика: короткие скрипучие слоги, неразборчиво,
   * с паузами «думает» и вздохом в конце.
   */
  D('old_man_mutter', function () {
    var R = rngf(113355);
    var ph = phAcc();
    var lp = onePole(750);
    var sylls = [];
    var tt = 0.05;
    while (tt < 1.7) {
      sylls.push({
        t: tt,
        len: 0.08 + R() * 0.13,
        f: 105 + R() * 45,                // скрипучая база
        a: 0.5 + R() * 0.5
      });
      tt += 0.1 + R() * 0.14;
    }
    return {
      dur: 2.1,
      fn: function (t, u, i) {
        var v = 0;
        for (var k = 0; k < sylls.length; k++) {
          var s = sylls[k];
          var x = t - s.t;
          if (x >= 0 && x < s.len) {
            var p = x / s.len;
            // «рот»: формантная АМ
            var mouth = 0.5 + 0.5 * Math.cos(TAU * (1.5 + (k % 3)) * p + k);
            // джиттер связок — скрипучесть
            var step = s.f / RATE * (1 + nz(R) * 0.035);
            var voiced = Math.sin(TAU * ph(step)) * 0.4 + Math.sin(TAU * ph(step * 2.01)) * 0.1;
            v += lp(voiced) * mouth * Math.sin(Math.PI * p) * s.a;
          }
        }
        // вздох в конце
        var sigh = (t > 1.78) ? lp(nz(R)) * Math.exp(-(t - 1.78) * 9) * 0.14 : 0;
        return clamp(v * 0.5 + sigh, -0.85, 0.85);
      }
    };
  });

  /** Крик ребёнка: взлёт голоса, дрожь, всхлип-вдох в конце. */
  D('child_cry', function () {
    var R = rngf(66006);
    var lp = onePole(2400);
    return {
      dur: 1.6,
      fn: function (t, u, i) {
        var v = 0;
        if (t < 0.8) {
          // плач: тон вверх с воблем
          var f = 620 + 220 * (t / 0.8) * (1 + 0.04 * Math.sin(TAU * 8 * t));
          var s = Math.sin(TAU * f * t) + Math.sin(TAU * f * 2 * t) * 0.5 + Math.sin(TAU * f * 3 * t) * 0.2;
          v = s * 0.28 * envAR(t, 0.8, 0.1, 0.15);
        } else if (t < 1.25) {
          // сброс: всхлипывающее падение тона
          var x = t - 0.8;
          var f2 = 840 - 280 * (x / 0.45) + 25 * Math.sin(TAU * 11 * x);
          var s2 = Math.sin(TAU * f2 * x) + Math.sin(TAU * f2 * 2 * x) * 0.4;
          var sob = 0.75 + 0.25 * Math.sin(TAU * 9 * x);
          v = s2 * 0.24 * sob * envAR(x, 0.45, 0.05, 0.12);
        } else if (t > 1.32) {
          // вдох-икота
          var xi = t - 1.32;
          v = lp(nz(R)) * Math.exp(-xi * 10) * 0.16 * (1 + 0.4 * Math.sin(TAU * 14 * xi));
        }
        return clamp(v, -0.9, 0.9);
      }
    };
  });

  /** Храп: вдох со свистом — взрыв-фырканье, два цикла. */
  D('snore', function () {
    var R = rngf(777999);
    var lp = lpDyn();
    function flap(x, rate) { return 0.6 + 0.4 * Math.sin(TAU * rate * x); }
    return {
      dur: 2.5,
      fn: function (t, u, i) {
        var v = 0;
        // цикл 1: вдох 0.05..0.7, храп 0.95..1.3
        if (t >= 0.05 && t < 0.7) {
          var xi = t - 0.05;
          var pi = xi / 0.65;
          v += lp(nz(R), 260 + 500 * pi) * Math.pow(pi, 1.5) * 0.28 * flap(xi, 9);
        }
        if (t >= 0.95 && t < 1.32) {
          var x1 = t - 0.95;
          var p1 = x1 / 0.37;
          v += lp(nz(R), 800) * Math.pow(Math.sin(Math.PI * p1), 0.8) * 0.5 * flap(x1, 22);
          v += Math.sin(TAU * 92 * x1) * Math.exp(-x1 * 9) * 0.3 * flap(x1, 22);
        }
        // цикл 2 (громче)
        if (t >= 1.35 && t < 1.95) {
          var xi2 = t - 1.35;
          var pi2 = xi2 / 0.6;
          v += lp(nz(R), 260 + 550 * pi2) * Math.pow(pi2, 1.5) * 0.3 * flap(xi2, 8);
        }
        if (t >= 2.0 && t < 2.42) {
          var x2 = t - 2.0;
          var p2 = x2 / 0.42;
          v += lp(nz(R), 750) * Math.pow(Math.sin(Math.PI * p2), 0.8) * 0.58 * flap(x2, 24);
          v += Math.sin(TAU * 88 * x2) * Math.exp(-x2 * 8) * 0.34 * flap(x2, 24);
        }
        return clamp(v, -0.9, 0.9);
      }
    };
  });

  // --------------------------------------------------------------------
  //  САМОВАР, ЧАЙ, ЛОЖКА
  // --------------------------------------------------------------------

  /** Самовар гудение: низкий гул + шипение + бульки (кипит всё сильнее). */
  D('samovar_hum', function () {
    var R = rngf(36987);
    var lp = onePole(4800);
    var bubbles = [];
    var tt = 0.35;
    while (tt < 2.4) {
      bubbles.push({ t: tt, f: 420 + R() * 240, a: 0.1 + R() * 0.16 });
      tt += 0.05 + R() * 0.2 * (1 - tt / 2.6);      // ближе к концу — чаще
    }
    return {
      dur: 2.7,
      fn: function (t, u, i) {
        // гул трубы (три тона с медленной АМ)
        var hum = Math.sin(TAU * 96 * t) * 0.16 + Math.sin(TAU * 192 * t) * 0.08 +
                  Math.sin(TAU * 288 * t) * 0.04;
        hum *= 0.7 + 0.3 * Math.sin(TAU * 0.7 * t);
        // шипение пара — нарастает
        var hiss = lp(nz(R)) * 0.05 * Math.pow(u, 0.7);
        // бульки
        var bub = 0;
        for (var k = 0; k < bubbles.length; k++) {
          var b = bubbles[k];
          var x = t - b.t;
          if (x >= 0 && x < 0.03) {
            bub += Math.sin(TAU * (b.f - 150 * x / 0.03) * x) * b.a * Math.exp(-x * 160);
          }
        }
        var env = envAR(t, 2.7, 0.3, 0.25);
        return clamp((hum + hiss + bub) * env, -0.85, 0.85);
      }
    };
  });

  /** Чай налит: струя в кружку с бульканием и двумя каплями в конце. */
  D('tea_pour', function () {
    var R = rngf(21517);
    var lpA = onePole(1500);
    var lpB = onePole(2400);
    var hp = hpOne(420);
    function stream(x, len) {
      if (x < 0 || x >= len) return 0;
      var p = x / len;
      var env = Math.sin(Math.PI * Math.pow(p, 0.6));
      var w = nz(R);
      // струя тоньше к концу — выше «звон» шума
      var n = hp(lpA(w) * (1 - p * 0.4) + lpB(w) * p * 0.7);
      var trickle = 0.7 + 0.3 * Math.sin(TAU * 13 * x) * Math.sin(TAU * 5.3 * x);
      return n * env * trickle;
    }
    function drop(x, f) {
      if (x < 0 || x >= 0.06) return 0;
      return Math.sin(TAU * (f - 200 * x / 0.06) * x) * Math.exp(-x * 70) * 0.4;
    }
    return {
      dur: 1.3,
      fn: function (t, u, i) {
        var v = stream(t - 0.05, 0.85);
        var d1 = drop(t - 0.98, 880);
        var d2 = drop(t - 1.12, 740) * 0.7;
        return clamp(v * 0.5 + d1 + d2, -0.9, 0.9);
      }
    };
  });

  /** Ложка о кружку: фарфоровые «дзынь» при помешивании. */
  D('spoon_cup', function () {
    var R = rngf(4141);
    // партиалы фарфора [частота, амплитуда, тау]
    var parts = [
      [2093, 1.0, 0.16],
      [3140, 0.55, 0.11],
      [4180, 0.3, 0.07]
    ];
    function clink(x, a) {
      if (x < 0) return 0;
      var v = 0;
      for (var k = 0; k < parts.length; k++) {
        v += Math.sin(TAU * parts[k][0] * x) * parts[k][1] * Math.exp(-x / parts[k][2]);
      }
      // тело кружки
      v += Math.sin(TAU * 640 * x) * Math.exp(-x * 40) * 0.3;
      return v * a;
    }
    return {
      dur: 0.65,
      fn: function (t, u, i) {
        var v = clink(t - 0.05, 0.8) + clink(t - 0.21, 0.6) +
                clink(t - 0.36, 0.5) + clink(t - 0.4, 0.3) + clink(t - 0.45, 0.2);
        return clamp(v * 0.4, -0.9, 0.9);
      }
    };
  });

  // --------------------------------------------------------------------
  //  БУМАГА, ПЕЧАТЬ, КАРАНДАШ
  // --------------------------------------------------------------------

  /** Печать на бумаге: мягкий шлепок штампа + шорох бумаги под ним. */
  D('paper_stamp', function () {
    var R = rngf(6161);
    var lp = onePole(320);
    var hp = hpOne(1800);
    return {
      dur: 0.5,
      fn: function (t, u, i) {
        var v = 0;
        // сам штамп: глухой шлепок
        if (t >= 0.06 && t < 0.2) {
          var x = t - 0.06;
          v += lp(nz(R)) * Math.exp(-x * 55) * 0.7;
          v += Math.sin(TAU * 260 * x) * Math.exp(-x * 90) * 0.25;
        }
        // бумага отзывается после
        if (t > 0.16) {
          var xb = t - 0.16;
          v += hp(nz(R)) * Math.exp(-xb * 26) * 0.14;
        }
        return clamp(v, -0.9, 0.9);
      }
    };
  });

  /** Шелест бумаги: серия лёгких верхних шорохов-изломов. */
  D('paper_rustle', function () {
    var R = rngf(8712);
    var ticks = [];
    var tt = 0.02;
    while (tt < 0.85) {
      ticks.push({ t: tt, a: 0.25 + R() * 0.75, f: 2600 + R() * 3200, w: 0.006 + R() * 0.012 });
      tt += 0.025 + R() * 0.06;
    }
    var hp = hpOne(1600);
    return {
      dur: 0.95,
      fn: function (t, u, i) {
        var v = 0;
        for (var k = 0; k < ticks.length; k++) {
          var c = ticks[k];
          var x = t - c.t;
          if (x >= 0 && x < 0.04) {
            v += (hp(nz(R)) + Math.sin(TAU * c.f * x) * 0.25) * c.a * Math.exp(-x / c.w);
          }
        }
        return clamp(v * 0.45, -0.9, 0.9);
      }
    };
  });

  /** Карандаш пишет: штрихи с графитовым скрежетом и точкой в конце. */
  D('pencil_write', function () {
    var R = rngf(50505);
    var strokes = [];
    var tt = 0.04;
    while (tt < 0.95) {
      var len = 0.07 + R() * 0.09;
      strokes.push({ t: tt, len: len, a: 0.5 + R() * 0.5 });
      tt += len + 0.03 + R() * 0.05;
    }
    var hp = hpOne(1900);
    var lp = onePole(5500);
    return {
      dur: 1.2,
      fn: function (t, u, i) {
        var v = 0;
        for (var k = 0; k < strokes.length; k++) {
          var s = strokes[k];
          var x = t - s.t;
          if (x >= 0 && x < s.len) {
            var p = x / s.len;
            var env = Math.sin(Math.PI * p);
            var grit = 0.65 + 0.35 * Math.sin(TAU * 40 * x);   // зерно графита
            v += lp(hp(nz(R))) * env * grit * s.a;
          }
        }
        // точка в конце
        if (t > 1.02 && t < 1.08) v += hp(nz(R)) * 0.5 * Math.exp(-(t - 1.02) * 60);
        return clamp(v * 0.32, -0.9, 0.9);
      }
    };
  });

  // --------------------------------------------------------------------
  //  СНЕГ: ШАГ ЗВЕРЯ, ПРОВАЛ В СУГРОБ
  // --------------------------------------------------------------------

  /** Снег хруст под ногами зверя: тихий мягкий двойной хруст. */
  D('beast_step_snow', function () {
    var R = rngf(9191);
    var lp = onePole(1300);
    function crunch(x, a) {
      if (x < 0 || x >= 0.07) return 0;
      var p = x / 0.07;
      var env = Math.pow(Math.sin(Math.PI * p), 0.8);
      var grain = 0.6 + 0.4 * Math.sin(TAU * 62 * x);          // крупинки снега
      return lp(nz(R)) * env * grain * a;
    }
    return {
      dur: 0.17,
      fn: function (t, u, i) {
        var v = crunch(t, 0.6) + crunch(t - 0.05, 0.4);
        return clamp(v * 0.5, -0.6, 0.6);      // специально тихий
      }
    };
  });

  /** Провал в сугроб: глухое «уф» снега, тело тонуло и выдох. */
  D('snow_sink', function () {
    var R = rngf(23232);
    var lp = onePole(240);
    var lp2 = onePole(900);
    return {
      dur: 0.7,
      fn: function (t, u, i) {
        // тело снега проседает
        var body = Math.sin(TAU * 62 * t) * Math.exp(-t * 8) * 0.5;
        var puff = lp(nz(R)) * Math.exp(-t * 7) * 0.4;            // снежная пыль
        // «ф-уф» — выдох человека
        var breath = 0;
        if (t > 0.18) {
          var x = t - 0.18;
          breath = lp2(nz(R)) * Math.exp(-x * 6) * 0.25 * (1 + 0.3 * Math.sin(TAU * 9 * x));
        }
        // вторая осадка сугроба
        var settle = (t > 0.42) ? Math.sin(TAU * 54 * (t - 0.42)) * Math.exp(-(t - 0.42) * 10) * 0.18 : 0;
        return clamp(body + puff + breath + settle, -0.9, 0.9);
      }
    };
  });

  // --------------------------------------------------------------------
  //  ВЕТЕР В ТРУБЕ, СТАВНЯ
  // --------------------------------------------------------------------

  /**
   * Ветер в трубе: особый свист — органные тоны трубы, каждый гудет
   * в своё время и чуть плавает по высоте. Жуткий, «дом поёт».
   */
  D('wind_chimney', function () {
    var R = rngf(127001);
    var lp = lpDyn();
    var tones = [
      { f: 273, rate: 0.21, a: 0.5, ph0: 0 },
      { f: 329, rate: 0.17, a: 0.4, ph0: 2.1 },
      { f: 402, rate: 0.13, a: 0.3, ph0: 4.2 }
    ];
    return {
      dur: 3.4,
      fn: function (t, u, i) {
        var v = 0;
        for (var k = 0; k < tones.length; k++) {
          var g = tones[k];
          // каждый тон то появляется, то уходит
          var env = Math.pow(0.5 + 0.5 * Math.sin(TAU * g.rate * t + g.ph0), 2);
          // высота плавает (порыв меняет резонанс трубы)
          var f = g.f * (1 + 0.012 * Math.sin(TAU * 0.09 * t + k * 1.7));
          v += Math.sin(TAU * f * t) * env * g.a;
          v += Math.sin(TAU * f * 3.01 * t) * env * g.a * 0.12;   // призвук
        }
        // ветер вокруг трубы
        var wind = lp(nz(R), 320 + 220 * Math.sin(TAU * 0.23 * t)) * 0.16;
        var envAll = envAR(t, 3.4, 0.5, 0.8);
        return clamp((v * 0.3 + wind) * envAll, -0.85, 0.85);
      }
    };
  });

  /** Ставня хлопает: удар доски + два дозвякивания на ветру. */
  D('shutter_flap', function () {
    var R = rngf(76767);
    var lp = onePole(700);
    var flaps = [
      { t: 0.06, a: 1 },
      { t: 0.38, a: 0.55 },
      { t: 0.74, a: 0.3 }
    ];
    return {
      dur: 1.35,
      fn: function (t, u, i) {
        var v = 0;
        for (var k = 0; k < flaps.length; k++) {
          var f = flaps[k];
          var x = t - f.t;
          if (x >= 0 && x < 0.3) {
            // доска: резкий удар с резонансом 175 Гц
            v += nz(R) * Math.exp(-x * 120) * 0.55 * f.a;
            v += Math.sin(TAU * 175 * x) * Math.exp(-x * 30) * 0.5 * f.a;
            v += Math.sin(TAU * 340 * x) * Math.exp(-x * 45) * 0.15 * f.a;
          }
        }
        // ветер за спиной
        var wind = lp(nz(R)) * 0.12 * envAR(t, 1.35, 0.3, 0.6);
        return clamp(v * 0.8 + wind, -0.95, 0.95);
      }
    };
  });

  // --------------------------------------------------------------------
  //  ЦЕРКОВНЫЕ КОЛОКОЛА
  // --------------------------------------------------------------------

  /**
   * Большой колокол: низ с долгим гулом, минорная терция в партиалах
   * (профиль русского колокола), удар языком и биения.
   */
  D('bell_big', function () {
    var R = rngf(107);
    // партиалы русского колокола [отношение к основному, амп, тау]
    var parts = [
      [0.5, 0.45, 3.4],       // гул (hum)
      [1.0, 1.0, 2.6],        // основной (prime)
      [1.2, 0.5, 1.9],        // терция минорная — «характер»
      [1.207, 0.22, 1.7],    // биение с терцией
      [1.5, 0.3, 1.5],        // квинта
      [2.0, 0.38, 1.2],       // октава-номинал
      [2.5, 0.14, 0.8],
      [3.0, 0.1, 0.6]
    ];
    var base = 82.4;            // ми большой октавы
    var lp = onePole(600);
    return {
      dur: 4.5,
      fn: function (t, u, i) {
        var v = 0;
        for (var k = 0; k < parts.length; k++) {
          var p = parts[k];
          v += Math.sin(TAU * base * p[0] * t) * p[1] * Math.exp(-t / p[2]);
        }
        // удар языком
        var strike = (t < 0.08) ? lp(nz(R)) * Math.exp(-t * 70) * 0.5 +
                                 Math.sin(TAU * 58 * t) * Math.exp(-t * 40) * 0.4 : 0;
        // общий накат (звук «раскачивается»)
        var env = Math.min(1, t / 0.02);
        return clamp(v * 0.3 * env + strike, -0.95, 0.95);
      }
    };
  });

  /** Средний колокол: ярче и короче большого. */
  D('bell_medium', function () {
    var R = rngf(208);
    var parts = [
      [0.5, 0.3, 2.0],
      [1.0, 1.0, 1.8],
      [1.19, 0.45, 1.3],
      [1.5, 0.35, 1.1],
      [2.0, 0.4, 0.9],
      [2.67, 0.2, 0.6],
      [3.01, 0.12, 0.45]
    ];
    var base = 130.8;            // до малой октавы
    var lp = onePole(900);
    return {
      dur: 3.3,
      fn: function (t, u, i) {
        var v = 0;
        for (var k = 0; k < parts.length; k++) {
          var p = parts[k];
          v += Math.sin(TAU * base * p[0] * t) * p[1] * Math.exp(-t / p[2]);
        }
        var strike = (t < 0.07) ? lp(nz(R)) * Math.exp(-t * 90) * 0.45 : 0;
        return clamp(v * 0.32 + strike, -0.95, 0.95);
      }
    };
  });

  /** Малый трезвон: перекличка маленьких колоколов вверх-вниз. */
  D('bell_chime', function () {
    var R = rngf(309);
    // малый колокол: короткий звонкий
    function small(x, f, a) {
      if (x < 0) return 0;
      var parts = [
        [1.0, 1.0, 0.5],
        [2.42, 0.4, 0.3],
        [3.96, 0.2, 0.18],
        [5.4, 0.08, 0.1]
      ];
      var v = 0;
      for (var k = 0; k < parts.length; k++) {
        v += Math.sin(TAU * f * parts[k][0] * x) * parts[k][1] * Math.exp(-x / parts[k][2]);
      }
      return v * a;
    }
    // трезвон: перекличка по три — вверх и вниз
    var hits = [
      { t: 0.02, f: 1318, a: 0.9 },      // ми
      { t: 0.15, f: 1568, a: 0.8 },      // соль
      { t: 0.28, f: 2093, a: 0.7 },      // до (верх)
      { t: 0.55, f: 1318, a: 0.7 },
      { t: 0.65, f: 1046, a: 0.8 },      // до
      { t: 0.78, f: 1568, a: 0.65 },
      { t: 1.1, f: 2093, a: 0.8 },
      { t: 1.22, f: 1568, a: 0.7 },
      { t: 1.34, f: 1318, a: 0.75 },
      { t: 1.62, f: 1046, a: 0.6 },
      { t: 1.74, f: 1318, a: 0.5 },
      { t: 1.86, f: 1568, a: 0.4 }
    ];
    var lp = onePole(7000);
    return {
      dur: 2.7,
      fn: function (t, u, i) {
        var v = 0;
        for (var k = 0; k < hits.length; k++) {
          var h = hits[k];
          v += small(t - h.t, h.f, h.a);
        }
        var strike = (t < 0.04) ? nz(R) * Math.exp(-t * 200) * 0.3 : 0;
        return clamp(lp(v * 0.3 + strike), -0.9, 0.9);
      }
    };
  });

  // --------------------------------------------------------------------
  //  ЛЕДОХОД
  // --------------------------------------------------------------------

  /**
   * Ледоход: грохот плывущих льдин — общий рокот + события-столкновения
   * (стоны, треск, плеск), нарастает к кульминации и стихает.
   */
  D('ice_breakup', function () {
    var R = rngf(66613);
    var lpRumble = onePole(95);
    var events = [];
    var tt = 0.25;
    while (tt < 4.6) {
      // плотность событий к середине выше
      var mid = 1 - Math.abs(tt - 2.6) / 2.6;
      events.push({
        t: tt,
        groanF: 50 + R() * 22,             // стон льдины
        groanDur: 0.35 + R() * 0.5,
        crack: R() < 0.75,                 // есть ли треск
        splash: R() < 0.6,                 // плеск
        a: 0.35 + R() * 0.4 + mid * 0.3
      });
      tt += 0.18 + R() * (0.9 - mid * 0.55);
    }
    var lpCrack = onePole(1600);
    var lpSplash = onePole(1000);
    return {
      dur: 5.4,
      fn: function (t, u, i) {
        // общий рокот реки
        var rumble = lpRumble(nz(R)) * (0.25 + 0.55 * Math.sin(Math.PI * Math.min(1, u * 1.05)));
        var v = rumble * 0.55;
        for (var k = 0; k < events.length; k++) {
          var e = events[k];
          var x = t - e.t;
          if (x < 0) continue;
          // стон: два расстроенных тона валатся вниз
          if (x < e.groanDur) {
            var p = x / e.groanDur;
            var f1 = e.groanF * (1 - 0.18 * p);
            var f2 = e.groanF * 1.13 * (1 - 0.15 * p);
            v += (Math.sin(TAU * f1 * x) + Math.sin(TAU * f2 * x) * 0.7) *
                 Math.pow(Math.sin(Math.PI * p), 1.2) * 0.3 * e.a;
          }
          // треск при столкновении
          if (e.crack && x < 0.09) {
            v += lpCrack(nz(R)) * Math.exp(-x * 70) * 0.5 * e.a;
          }
          // плеск воды между льдинами
          if (e.splash && x > 0.06 && x < 0.35) {
            var xs = x - 0.06;
            v += lpSplash(nz(R)) * Math.exp(-xs * 16) * 0.22 * e.a *
                 (0.6 + 0.4 * Math.sin(TAU * 8 * xs));
          }
        }
        // финальный большой сдвиг
        var last = (t > 4.7) ? Math.sin(TAU * (44 - 8 * (t - 4.7)) * (t - 4.7)) *
                               Math.exp(-(t - 4.7) * 2.2) * 0.4 : 0;
        return clamp(v + last, -0.95, 0.95);
      }
    };
  });

  // ====================================================================
  //  КЭШ И ЗАПУСК
  // ====================================================================

  /** Собрать буфер по имени (лениво, с кэшем). null — имени нет. */
  function getBuf(name) {
    if (buffers[name]) return buffers[name];
    var f = SYNTH[name] || customs[name];
    if (!f) return null;
    var entry = null;
    try {
      // встроенные — фабрики, внешние def() — тоже фабрики
      entry = f();
    } catch (e0) {
      WS.err('Snd2: синтез "' + name + '" упал', e0 && e0.message);
      entry = null;
    }
    if (!entry || !entry.dur || !entry.fn) {
      WS.err('Snd2: плохое определение звука "' + name + '"');
      return null;
    }
    var b = null;
    try { b = makeBuffer(entry.dur, entry.fn); }
    catch (e1) { WS.err('Snd2: буфер "' + name + '" не собран', e1 && e1.message); return null; }
    buffers[name] = b;
    return b;
  }

  /**
   * Панорама по мировой позиции: изометрический дельта-вектор -> [-1..1].
   * 0 если нет игрока/математики или браузер без StereoPannerNode.
   */
  function panFor(o) {
    if (o.pan !== undefined) return clamp(o.pan, -1, 1);
    if (o.x === undefined || !WS.G || !WS.G.player || !WS.M) return 0;
    if (!ac.createStereoPanner) return 0;
    var s = WS.M.toScreen(o.x - WS.G.player.x, o.y - WS.G.player.y);
    return clamp(s.x / 420, -1, 1);
  }

  /** Громкость с учётом дистанции до игрока (позиционные звуки). */
  function volFor(o) {
    var vol = o.vol !== undefined ? o.vol : 0.8;
    if (o.x !== undefined && WS.G && WS.G.player && WS.M) {
      var d = WS.M.dist(o.x, o.y, WS.G.player.x, WS.G.player.y);
      var r = o.radius || DEF_RADIUS;
      if (d > r) return -1;                     // за пределами слышимости
      vol *= Math.max(0, 1 - d / r);
    }
    return clamp(vol, 0, 1.2);
  }

  /** Проиграть эффект очереди Snd2. o = {x, y, vol, gap, rate, pan, radius}. */
  function play(name, o) {
    o = o || {};
    if (muted || !ensureCtx()) return;
    if (ac.state === 'suspended') { try { ac.resume(); } catch (e0) { /* пусто */ } }
    var vol = volFor(o);
    if (vol <= 0) return;                      // слишком далеко / выключено
    var now = ac.currentTime;
    var gap = o.gap !== undefined ? o.gap : 0.05;
    var last = lastPlayed[name] || -1;
    if (now - last < gap) return;              // антиспам
    lastPlayed[name] = now;

    var buf = getBuf(name);
    if (!buf) {
      if (!SYNTH[name] && !customs[name]) WS.warn('Snd2: нет звука "' + name + '"');
      return;
    }

    try {
      var src = ac.createBufferSource();
      src.buffer = buf;
      // случайный питч ±6% — оживляет повторы (как в audio.js)
      src.playbackRate.value = o.rate !== undefined ? o.rate : (0.97 + Math.random() * 0.06);
      var g = ac.createGain();
      g.gain.value = volume * vol;
      var tail = g;                            // последний узел цепочки
      var pan = panFor(o);
      if (pan && ac.createStereoPanner) {
        var p = ac.createStereoPanner();
        p.pan.value = pan;
        g.connect(p);
        tail = p;
      }
      src.connect(g);
      tail.connect(master);
      src.start(now);
      var voice = { src: src, gain: g, name: name };
      voices.push(voice);
      src.onended = function () {
        var i = voices.indexOf(voice);
        if (i >= 0) voices.splice(i, 1);
        try { g.disconnect(); } catch (e1) { /* пусто */ }
      };
      // потолок пула: глушим самый старый голос мягким спадом
      if (voices.length > MAX_VOICES) {
        var oldV = voices.shift();
        try {
          oldV.gain.gain.setTargetAtTime(0, now, 0.03);
          oldV.src.stop(now + 0.12);
        } catch (e2) { /* пусто */ }
      }
    } catch (e3) {
      WS.err('Snd2: play("' + name + '")', e3 && e3.message);
    }
  }

  /** Тихо остановить все голоси очереди (фейд fade сек). */
  function stopAll(fade) {
    var f = fade === undefined ? 0.25 : fade;
    var now = ac ? ac.currentTime : 0;
    var list = voices.slice();
    voices.length = 0;
    for (var i = 0; i < list.length; i++) {
      try {
        list[i].gain.gain.setTargetAtTime(0, now, Math.max(0.01, f / 3));
        list[i].src.stop(now + f + 0.05);
      } catch (e) { /* пусто */ }
    }
  }

  /** Остановить голоси с данным именем (например, длинный скрип двери). */
  function stop(name, fade) {
    var f = fade === undefined ? 0.15 : fade;
    var now = ac ? ac.currentTime : 0;
    for (var i = voices.length - 1; i >= 0; i--) {
      if (voices[i].name !== name) continue;
      var v = voices.splice(i, 1)[0];
      try {
        v.gain.gain.setTargetAtTime(0, now, Math.max(0.01, f / 3));
        v.src.stop(now + f + 0.05);
      } catch (e) { /* пусто */ }
    }
  }

  /** Предгенерация буферов (тёплый кэш, чтобы не лагало в первый раз). */
  function preload(names) {
    if (!ensureCtx()) return;
    for (var i = 0; i < names.length; i++) getBuf(names[i]);
  }

  // ====================================================================
  //  ВНЕШНЕЕ РАСШИРЕНИЕ: WS.Snd2.def('name', dur, fn)
  //  (или def('name', factory) — фабрика как у встроенных)
  // ====================================================================

  function defSound(name, dur, fn) {
    if (typeof dur === 'function') {
      // форма def(name, factory): factory() -> {dur, fn}
      customs[name] = dur;
    } else {
      if (typeof dur !== 'number' || typeof fn !== 'function') {
        WS.err('Snd2.def: нужны (name, dur, fn) или (name, factory)');
        return false;
      }
      customs[name] = (function (d, f) {
        return function () { return { dur: d, fn: f }; };
      })(dur, fn);
    }
    delete buffers[name];                      // пересобрать при следующем play
    return true;
  }

  function undefSound(name) {
    delete customs[name];
    delete buffers[name];
    return true;
  }

  // ====================================================================
  //  ПУБЛИЧНЫЙ API МОДУЛЯ
  // ====================================================================

  WS.def('Snd2', {
    play: play,
    stop: stop,
    stopAll: stopAll,
    preload: preload,
    def: defSound,
    undef: undefSound,
    getBuf: getBuf,
    has: function (name) { return !!(SYNTH[name] || customs[name]); },
    names: function () {
      var out = [];
      var k;
      for (k in SYNTH) if (Object.prototype.hasOwnProperty.call(SYNTH, k)) out.push(k);
      for (k in customs) if (Object.prototype.hasOwnProperty.call(customs, k)) out.push(k);
      out.sort();
      return out;
    },
    voices: function () { return voices.length; },
    ctx: ctx,
    setVolume: function (v) {
      volume = clamp(v, 0, 1);
      if (master) master.gain.value = muted ? 0 : volume;
    },
    getVolume: function () { return volume; },
    setMuted: function (m) {
      muted = !!m;
      if (master) master.gain.value = muted ? 0 : volume;
    },
    isMuted: function () { return muted; }
  });

  // ====================================================================
  //  ИНИЦИАЛИЗАЦИЯ
  // ====================================================================

  WS.boot(function initSnd2() {
    // разблокировка аудио по первому клику (политика браузеров);
    // audio.js вешает свой слушатель — этот для случая собственного ctx
    document.addEventListener('pointerdown', function unlockSnd2() {
      if (ensureCtx() && ac.state === 'suspended') {
        try { ac.resume(); } catch (e) { /* пусто */ }
      }
    }, { once: true });

    // мост событий: любой модуль может попросить звук очереди Snd2
    WS.Ev.on('sound2:play', function (d) {
      if (d && d.name) play(d.name, d);
    });

    // тёплый кэш частых мелочей (короткие — не заметно на старте)
    preload(['beast_step_snow', 'spoon_cup', 'paper_rustle']);
  }, 'snd2:init');
})();
