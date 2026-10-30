/**
 * music.js — ГЕНЕРАТИВНАЯ МУЗЫКА «Белого Безмолвия» (модуль L2.2).
 * Восемь процедурных тем на Web Audio без единого аудиофайла: осцилляторы,
 * гейны, фильтры; щипок — Karplus-Strong (шумовой импульс в линии задержки),
 * колокол — негармонические партиалы, барабан — шум через фильтр.
 *
 * Секвенсор: setInterval (90 мс) с планированием по ac.currentTime
 * с упреждением 0.5 с. Смена тем — кроссфейд 2 с (гейн темы). Темы
 * подстраиваются под ночь/день на лету (плотность, регистр).
 *
 * Темы: 'menu' (вальс 3/4, колокольный), 'act1' (пентатоника, щипки),
 * 'act2' (дрон + редкое пиано), 'polar' (полярная ночь, капли-ноты),
 * 'battle' (пульс-остинато + барабан), 'death' (реквием, минорная терция),
 * 'victory' (гимн мажор с колоколами), 'svyatki' (колядочный мотив).
 *
 * Триггеры: 'game:start' | 'game:load' | 'night:fall' | 'day:dawn' |
 * 'time:day' | 'player:damage' (от зверя -> бой на 20 с) | 'player:die' |
 * 'game:victory'. Громкость отдельная: WS.Music.setVolume(0..1).
 * Связи: core/audio.js + core/audio2.js (общий ctx), core/time.js,
 * content/story.js (акт), core/events.js.
 */
(function () {
  'use strict';

  // ====================================================================
  //  СОСТОЯНИЕ
  // ====================================================================

  var ac = null;              // AudioContext (общий с WS.Snd / WS.Snd2)
  var ownCtx = false;         // контекст создали мы сами (крайний случай)
  var bus = null;             // мастер-гейн музыки (отдельная громкость)

  var volume = 0.55;          // громкость музыки 0..1
  var muted = false;

  var timer = null;           // setInterval секвенсора
  var current = null;         // активная тема: {name, theme, gain, nodes, vars, next}
  var battleUntil = 0;       // ac.currentTime, до которого идёт бой
  var battleReturn = null;    // куда вернуться после боя
  var gestureSeen = false;    // был ли первый жест пользователя (autoplay-запрет)
  var duckTimer = null;       // таймер возврата из «прижатия» музыки (радио)

  var TAU = Math.PI * 2;
  var KS_RATE = 22050;        // частота синтеза щипка (Karplus-Strong)
  var PUMP_MS = 90;           // период секвенсора
  var LOOKAHEAD = 0.5;        // упреждение планирования, с

  // ====================================================================
  //  КОНТЕКСТ: берём у WS.Snd / WS.Snd2, при нужде поднимаем свой
  // ====================================================================

  function ensureCtx() {
    if (ac) return true;
    try { if (WS.Snd && WS.Snd.ctx) ac = WS.Snd.ctx() || null; } catch (e1) { ac = null; }
    if (!ac) {
      try { if (WS.Snd2 && WS.Snd2.ctx) ac = WS.Snd2.ctx() || null; } catch (e2) { ac = null; }
    }
    if (!ac) {
      // молча трогаем Snd — его play() создаёт общий контекст
      try {
        if (WS.Snd && WS.Snd.play) {
          WS.Snd.play('click', { vol: 0, gap: 0 });
          ac = WS.Snd.ctx() || null;
        }
      } catch (e3) { ac = null; }
    }
    if (!ac) {
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        ac = new AC();
        ownCtx = true;
      } catch (e4) { return false; }
    }
    try {
      bus = ac.createGain();
      bus.gain.value = muted ? 0 : volume;
      bus.connect(ac.destination);
    } catch (e5) {
      WS.err('Music: мастер-гейн не создан', e5 && e5.message);
      return false;
    }
    return true;
  }

  // ====================================================================
  //  МУЗЫКАЛЬНЫЕ УТИЛИТЫ
  // ====================================================================

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  /** midi -> частота. */
  function m2f(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  /** Детерминированный ГПСЧ [0..1). */
  function rngf(seed) {
    var s = seed >>> 0;
    if (!s) s = 0x27d4eb2d;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >>> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }

  /** Ночь ли сейчас (по игровым часам). */
  function isNightNow() {
    if (!WS.Time || !WS.Time.hour) return false;
    var h = WS.Time.hour();
    return h >= 21 || h < 6;
  }

  /** Есть ли живая партия. */
  function inGame() { return !!(WS.G && WS.G.running); }

  // ====================================================================
  //  ИНСТРУМЕНТЫ
  //  Каждый инструмент строит ноду(ы) в момент t (ac.currentTime-шкала)
  //  и сам планирует stop — утечек нет даже при кроссфейде: гейн темы
  //  уходит в ноль раньше, чем ноты доиграют.
  // ====================================================================

  /** Подключить последний узел ноты к «сухому» выходу и в «пространство». */
  function route(inst, node, dry, wet) {
    var gd = ac.createGain();
    gd.gain.value = dry;
    node.connect(gd);
    gd.connect(inst.gain);
    if (inst.wetIn) {
      var gw = ac.createGain();
      gw.gain.value = wet;
      node.connect(gw);
      gw.connect(inst.wetIn);
    }
  }

  // ------------------------------------------------------------------
  //  ЩИПОК — Karplus-Strong: шумовой импульс в короткой линии задержки
  //  с усреднением соседних сэмплов (потеря верхов = затухание).
  //  Буфер кэшируется по частоте: один и тот же миди-звук один буфер.
  // ------------------------------------------------------------------

  var ksCache = {};

  function ksBuffer(freq, warm, damp) {
    var key = Math.round(freq) + (warm ? 'w' : 'b') + Math.round(damp * 100000);
    if (ksCache[key]) return ksCache[key];
    var N = Math.max(2, Math.round(KS_RATE / freq));
    var dur = clamp(0.5 + 260 / freq, 0.8, 3.2);          // низкие звенят дольше
    var n = Math.floor(KS_RATE * dur);
    var buf = ac.createBuffer(1, n, KS_RATE);
    var d = buf.getChannelData(0);
    var R = rngf(Math.round(freq * 131) + 7);
    var line = new Float32Array(N);
    var i, p = 0;
    if (warm) {
      // «тёплый» старт: слегка фильтрованный шум — глуше атака
      for (i = 0; i < N; i++) { var w = R() * 2 - 1; p = p * 0.55 + w * 0.45; line[i] = p * 1.4; }
    } else {
      for (i = 0; i < N; i++) line[i] = R() * 2 - 1;
    }
    var idx = 0;
    for (i = 0; i < n; i++) {
      var cur = line[idx];
      var nxt = line[(idx + 1) % N];
      d[i] = cur;
      line[idx] = damp * 0.5 * (cur + nxt);
      idx = (idx + 1) % N;
    }
    ksCache[key] = buf;
    return buf;
  }

  /**
   * Щипок (гитара/гусли). opts: {damp 0.99..0.999, warm bool, wet 0..1,
   * sus сек (добнование до затухания), dur общая}.
   */
  function pluck(inst, t, midi, vel, opts) {
    opts = opts || {};
    var f = m2f(midi);
    var damp = opts.damp !== undefined ? opts.damp : 0.9965;
    var buf = ksBuffer(f, opts.warm !== false, damp);
    var src = ac.createBufferSource();
    src.buffer = buf;
    var g = ac.createGain();
    g.gain.setValueAtTime(Math.max(0.0001, vel), t);
    g.gain.setTargetAtTime(0.0001, t + 0.03 + (opts.sus || 0), opts.tau || 0.9);
    src.connect(g);
    route(inst, g, 1, opts.wet !== undefined ? opts.wet : 0.22);
    src.start(t);
    src.stop(t + (opts.dur || 2.6));
  }

  // ------------------------------------------------------------------
  //  КОЛОКОЛ — партиалы русского профиля: hum/prime/терция/квинта...
  // ------------------------------------------------------------------

  // [отношение, амплитуда, тау затухания]
  var BELL_BIG = [
    [0.5, 0.4, 3.2], [1.0, 1.0, 2.4], [1.19, 0.45, 1.6],
    [1.5, 0.3, 1.3], [2.0, 0.35, 1.1], [2.74, 0.15, 0.6], [3.01, 0.1, 0.5]
  ];
  var BELL_SMALL = [
    [1.0, 1.0, 0.5], [2.42, 0.4, 0.3], [3.96, 0.2, 0.18], [5.4, 0.08, 0.1]
  ];

  /** Удар колокола. opts: {small bool, wet, punch 0..1}. */
  function bell(inst, t, midi, vel, opts) {
    opts = opts || {};
    var f0 = m2f(midi);
    var parts = opts.small ? BELL_SMALL : BELL_BIG;
    var k, p, o, g, amp, tau;
    for (k = 0; k < parts.length; k++) {
      p = parts[k];
      o = ac.createOscillator();
      o.type = 'sine';
      // микро-расстройка — живые биения
      o.frequency.value = f0 * p[0] * (1 + (Math.random() - 0.5) * 0.003);
      amp = vel * p[1];
      tau = p[2] * (opts.tauMul || 1);
      g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(amp, t + 0.008 + k * 0.001);
      g.gain.setTargetAtTime(0.0001, t + 0.015, tau * 0.28);
      o.connect(g);
      route(inst, g, 1, opts.wet !== undefined ? opts.wet : 0.38);
      o.start(t);
      o.stop(t + tau * 4 + 0.15);
    }
    // удар языком: короткий шумовой щелчок
    if (opts.punch !== 0) {
      var nb = noiseBuf();
      var ns = ac.createBufferSource();
      ns.buffer = nb;
      var nf = ac.createBiquadFilter();
      nf.type = 'lowpass';
      nf.frequency.value = opts.small ? 3200 : 900;
      var ng = ac.createGain();
      var pv = vel * (opts.small ? 0.25 : 0.4) * (opts.punch || 1);
      ng.gain.setValueAtTime(pv, t);
      ng.gain.setTargetAtTime(0.0001, t + 0.005, 0.02);
      ns.connect(nf); nf.connect(ng);
      route(inst, ng, 1, 0.2);
      ns.start(t);
      ns.stop(t + 0.15);
    }
  }

  // ------------------------------------------------------------------
  //  ФОРТЕПИАНО — аддитивные гармоники, верх гаснет быстрее
  // ------------------------------------------------------------------

  function piano(inst, t, midi, vel, opts) {
    opts = opts || {};
    var f = m2f(midi);
    var dur = opts.dur || 2.6;
    var k, n, o, g, amp, tau;
    for (k = 1; k <= 5; k++) {
      n = k;
      o = ac.createOscillator();
      o.type = 'sine';
      // лёгкая негармоничность струны (жёсткость)
      o.frequency.value = f * n * (1 + 0.0004 * n * n);
      amp = vel / Math.pow(n, 1.35);
      tau = dur * (1.1 - 0.2 * n);
      g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(amp, t + 0.006);
      g.gain.setTargetAtTime(0.0001, t + 0.01, tau * 0.3);
      o.connect(g);
      route(inst, g, 1, opts.wet !== undefined ? opts.wet : 0.3);
      o.start(t);
      o.stop(t + tau * 4 + 0.1);
    }
    // молоточек
    var nb = noiseBuf();
    var ns = ac.createBufferSource();
    ns.buffer = nb;
    var nf = ac.createBiquadFilter();
    nf.type = 'bandpass';
    nf.frequency.value = 1200;
    nf.Q.value = 0.6;
    var ng = ac.createGain();
    ng.gain.setValueAtTime(vel * 0.22, t);
    ng.gain.setTargetAtTime(0.0001, t + 0.003, 0.015);
    ns.connect(nf); nf.connect(ng);
    route(inst, ng, 1, 0.2);
    ns.start(t);
    ns.stop(t + 0.1);
  }

  // ------------------------------------------------------------------
  //  СТРУНЫ (смычок) — пила через фильтр с вибрато
  // ------------------------------------------------------------------

  function strings(inst, t, midi, vel, opts) {
    opts = opts || {};
    var dur = opts.dur || 0.4;
    var f = m2f(midi);
    var o = ac.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    // вибрато
    var vib = ac.createOscillator();
    vib.frequency.value = 5.2;
    var vg = ac.createGain();
    vg.gain.value = f * 0.004;
    vib.connect(vg);
    vg.connect(o.frequency);
    var lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 520 + vel * 1100;
    lp.Q.value = 1.0;
    var g = ac.createGain();
    var atk = Math.min(0.12, dur * 0.25);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel, t + atk);
    g.gain.setTargetAtTime(0.0001, t + atk, dur * 0.3);
    o.connect(lp); lp.connect(g);
    route(inst, g, 1, opts.wet !== undefined ? opts.wet : 0.18);
    o.start(t);
    vib.start(t);
    o.stop(t + dur + 0.25);
    vib.stop(t + dur + 0.25);
  }

  // ------------------------------------------------------------------
  //  БАРАБАНЫ — шум через фильтры (общий буфер шума один на всех)
  // ------------------------------------------------------------------

  var sharedNoise = null;

  function noiseBuf() {
    if (sharedNoise) return sharedNoise;
    var n = Math.floor(ac.sampleRate * 1.5);
    var buf = ac.createBuffer(1, n, ac.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    sharedNoise = buf;
    return buf;
  }

  /** Большой барабан: тон 130 -> 42 Гц + щелчок. */
  function drumKick(inst, t, vel) {
    var o = ac.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.1);
    var g = ac.createGain();
    g.gain.setValueAtTime(vel, t);
    g.gain.setTargetAtTime(0.0001, t + 0.005, 0.09);
    o.connect(g);
    route(inst, g, 1, 0.08);
    o.start(t);
    o.stop(t + 0.4);
  }

  /** Малоголосый «бочка-война»: шумовой низ + 70 Гц. */
  function drumLow(inst, t, vel) {
    var ns = ac.createBufferSource();
    ns.buffer = noiseBuf();
    var lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 220;
    var g = ac.createGain();
    g.gain.setValueAtTime(vel, t);
    g.gain.setTargetAtTime(0.0001, t + 0.005, 0.12);
    ns.connect(lp); lp.connect(g);
    route(inst, g, 1, 0.1);
    ns.start(t, Math.random());
    ns.stop(t + 0.5);
    var o = ac.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(88, t);
    o.frequency.exponentialRampToValueAtTime(55, t + 0.15);
    var og = ac.createGain();
    og.gain.setValueAtTime(vel * 0.8, t);
    og.gain.setTargetAtTime(0.0001, t + 0.01, 0.1);
    o.connect(og);
    route(inst, og, 1, 0.08);
    o.start(t);
    o.stop(t + 0.5);
  }

  /** Малый барабан: шум через полосу + короткий тон. */
  function drumSnare(inst, t, vel) {
    var ns = ac.createBufferSource();
    ns.buffer = noiseBuf();
    var bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1500;
    bp.Q.value = 0.8;
    var g = ac.createGain();
    g.gain.setValueAtTime(vel, t);
    g.gain.setTargetAtTime(0.0001, t + 0.004, 0.07);
    ns.connect(bp); bp.connect(g);
    route(inst, g, 1, 0.15);
    ns.start(t, Math.random());
    ns.stop(t + 0.3);
    var o = ac.createOscillator();
    o.type = 'triangle';
    o.frequency.value = 185;
    var og = ac.createGain();
    og.gain.setValueAtTime(vel * 0.5, t);
    og.gain.setTargetAtTime(0.0001, t + 0.003, 0.05);
    o.connect(og);
    route(inst, og, 1, 0.1);
    o.start(t);
    o.stop(t + 0.25);
  }

  /** Тика (хэт/бубенцы): срезанный верхний шум. */
  function drumTick(inst, t, vel) {
    var ns = ac.createBufferSource();
    ns.buffer = noiseBuf();
    var hp = ac.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 6800;
    var g = ac.createGain();
    g.gain.setValueAtTime(vel, t);
    g.gain.setTargetAtTime(0.0001, t + 0.002, 0.02);
    ns.connect(hp); hp.connect(g);
    route(inst, g, 1, 0.12);
    ns.start(t, Math.random());
    ns.stop(t + 0.12);
  }

  /** Бубенцы (для святок): россыпь из трёх тиков. */
  function jingle(inst, t, vel) {
    var n = 3, i, dt;
    for (i = 0; i < n; i++) {
      dt = i * (0.012 + Math.random() * 0.01);
      drumTick(inst, t + dt, vel * (1 - i * 0.25));
    }
  }

  /** Гармонь (для святок): аккорд пил с тремоло и мягким фильтром. */
  function garmo(inst, t, midis, vel, dur) {
    var dur2 = dur || 0.4;
    var lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1300;
    lp.Q.value = 0.7;
    var g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.03);
    g.gain.setTargetAtTime(0.0001, t + dur2 * 0.7, dur2 * 0.2);
    lp.connect(g);
    route(inst, g, 1, 0.2);
    // тремоло меха
    var trem = ac.createOscillator();
    trem.frequency.value = 11;
    var tg = ac.createGain();
    tg.gain.value = vel * 0.35;
    trem.connect(tg);
    tg.connect(g.gain);
    var i, o;
    for (i = 0; i < midis.length; i++) {
      o = ac.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = m2f(midis[i]) * (1 + (i - 1) * 0.0012);
      o.connect(lp);
      o.start(t);
      o.stop(t + dur2 + 0.2);
    }
    trem.start(t);
    trem.stop(t + dur2 + 0.2);
  }

  /** Дальний нарастающий гул (для полярной ночи и смерти). */
  function swell(inst, t, midi, vel, dur) {
    var o = ac.createOscillator();
    o.type = 'sine';
    o.frequency.value = m2f(midi);
    var o5 = ac.createOscillator();
    o5.type = 'sine';
    o5.frequency.value = m2f(midi + 7);
    var g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel, t + dur * 0.45);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    var g5 = ac.createGain();
    g5.gain.value = 0.4;
    o5.connect(g5); g5.connect(g);
    route(inst, g, 1, 0.45);
    o.start(t); o5.start(t);
    o.stop(t + dur + 0.1); o5.stop(t + dur + 0.1);
  }

  /**
   * Виолончель: тёплый смычок — треугольник с синовым подмесом,
   * медленная атака, вибрато и лёгкое дыхание. Для тягучего фона акта 2.
   */
  function cello(inst, t, midi, vel, dur) {
    var f = m2f(midi);
    var o1 = ac.createOscillator();
    o1.type = 'triangle';
    o1.frequency.value = f;
    var o2 = ac.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = f * 2;                // призвук струны
    var g2 = ac.createGain();
    g2.gain.value = 0.25;
    // вибрато левой руки
    var vib = ac.createOscillator();
    vib.frequency.value = 4.6;
    var vg = ac.createGain();
    vg.gain.value = f * 0.005;
    vib.connect(vg);
    vg.connect(o1.frequency);
    var lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    var g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel, t + Math.min(0.5, dur * 0.4));
    g.gain.setValueAtTime(vel, t + dur * 0.6);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o1.connect(lp);
    o2.connect(g2); g2.connect(lp);
    lp.connect(g);
    route(inst, g, 1, 0.3);
    o1.start(t); o2.start(t); vib.start(t);
    o1.stop(t + dur + 0.1); o2.stop(t + dur + 0.1); vib.stop(t + dur + 0.1);
  }

  /**
   * Флажолет (духовой призвук): тонкая высокая нота с дыханием —
   * призрачный «свист» полярной ночи.
   */
  function flageolet(inst, t, midi, vel, dur) {
    var f = m2f(midi);
    var o = ac.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    var o2 = ac.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = f * 2.76;              // негармонический обертон
    var g2 = ac.createGain();
    g2.gain.value = 0.12;
    // дыхание в ноту
    var ns = ac.createBufferSource();
    ns.buffer = noiseBuf();
    var bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = f;
    bp.Q.value = 2.5;
    var ng = ac.createGain();
    ng.gain.value = vel * 0.35;
    var g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel, t + dur * 0.3);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    o2.connect(g2); g2.connect(g);
    ns.connect(bp); bp.connect(ng); ng.connect(g);
    route(inst, g, 1, 0.5);
    o.start(t); o2.start(t);
    ns.start(t, Math.random());
    o.stop(t + dur + 0.1); o2.stop(t + dur + 0.1); ns.stop(t + dur + 0.1);
  }

  // ====================================================================
  //  ПРОСТРАНСТВО И ДРОНЫ (устойчивые ноды темы)
  // ====================================================================

  /**
   * «Пространство» темы: задержка с обратной связью через ФНЧ — дешёвый
   * суррогат реверберации для звонких тем (меню, полярная ночь, смерть).
   * Вход темы: inst.wetIn.
   */
  function makeSpace(inst, o) {
    o = o || {};
    var dl = ac.createDelay(1.2);
    dl.delayTime.value = o.delay || 0.34;
    var fb = ac.createGain();
    fb.gain.value = o.fb !== undefined ? o.fb : 0.42;
    var lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = o.lp || 2400;
    var wet = ac.createGain();
    wet.gain.value = o.mix !== undefined ? o.mix : 0.3;
    dl.connect(lp);
    lp.connect(fb);
    fb.connect(dl);
    dl.connect(wet);
    wet.connect(inst.gain);
    inst.wetIn = dl;
    inst.nodes.push(dl, fb, lp, wet);
  }

  /**
   * Дрон-подкладка: расстроенные пилы через медленно дышащий ФНЧ + саб.
   * o = {midis:[..], cut, level, lfoRate, lfoDepth, wet}
   * Возвращает гейн дрона (можно плавно менять уровнем).
   */
  function startDrone(inst, o) {
    o = o || {};
    var lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = o.cut || 220;
    lp.Q.value = 0.9;
    var g = ac.createGain();
    g.gain.setValueAtTime(0.0001, ac.currentTime);
    g.gain.linearRampToValueAtTime(o.level || 0.05, ac.currentTime + 2.5);
    lp.connect(g);
    route(inst, g, 1, o.wet !== undefined ? o.wet : 0.15);
    // медленное дыхание фильтра
    var lfo = ac.createOscillator();
    lfo.frequency.value = o.lfoRate || 0.06;
    var lg = ac.createGain();
    lg.gain.value = o.lfoDepth || 70;
    lfo.connect(lg);
    lg.connect(lp.frequency);
    lfo.start();
    inst.nodes.push(lfo);
    var midis = o.midis || [38], i, o1;
    for (i = 0; i < midis.length; i++) {
      o1 = ac.createOscillator();
      o1.type = 'sawtooth';
      o1.frequency.value = m2f(midis[i]);
      o1.detune.value = -4;                  // расстройка пары
      o1.connect(lp);
      o1.start();
      inst.nodes.push(o1);
      o1 = ac.createOscillator();
      o1.type = 'sawtooth';
      o1.frequency.value = m2f(midis[i]);
      o1.detune.value = 4;
      o1.connect(lp);
      o1.start();
      inst.nodes.push(o1);
    }
    if (o.sub !== false) {
      var sub = ac.createOscillator();
      sub.type = 'sine';
      sub.frequency.value = m2f(midis[0] - 12);
      var sg = ac.createGain();
      sg.gain.value = 0.7;
      sub.connect(sg);
      sg.connect(g);                          // саб — мимо фильтра
      sub.start();
      inst.nodes.push(sub);
    }
    return g;
  }

  // ====================================================================
  //  ДВИЖОК ТЕМ: кроссфейд и планировщик
  // ====================================================================

  /**
   * Тема — объект:
   *   create(inst)  — устойчивые ноды и начальное состояние inst.vars
   *   step(inst,t) — расписать очередной кусок с времени t, вернуть
   *                  его длительность (сек) до следующего вызова
   */

  /** Поднять экземпляр темы: гейн с фейдом от нуля, create, старт состояния. */
  function makeInst(name, fade) {
    var theme = THEMES[name];
    var inst = {
      name: name,
      theme: theme,
      gain: ac.createGain(),
      nodes: [],               // устойчивые ноды (останавливаются с темой)
      vars: { night: isNightNow(), bar: 0 },
      next: 0,
      dead: false
    };
    inst.gain.gain.setValueAtTime(0.0001, ac.currentTime);
    inst.gain.gain.linearRampToValueAtTime(1, ac.currentTime + Math.max(0.05, fade));
    inst.gain.connect(bus);
    try {
      theme.create(inst);
    } catch (e) {
      WS.err('Music: create("' + name + '")', e && e.message);
    }
    inst.next = ac.currentTime + 0.12;
    return inst;
  }

  /** Загасить и разобрать экземпляр темы (фейд fade сек). */
  function stopTheme(inst, fade) {
    if (!inst || inst.dead) return;
    inst.dead = true;
    var when = ac.currentTime + Math.max(0.05, fade);
    try {
      inst.gain.gain.cancelScheduledValues(ac.currentTime);
      inst.gain.gain.setValueAtTime(Math.max(0.0001, inst.gain.gain.value), ac.currentTime);
      inst.gain.gain.linearRampToValueAtTime(0.0001, when);
    } catch (e) { /* пусто */ }
    var i;
    for (i = 0; i < inst.nodes.length; i++) {
      try {
        if (inst.nodes[i].stop) inst.nodes[i].stop(when + 0.03);
      } catch (e2) { /* пусто */ }
    }
    setTimeout(function () {
      try { inst.gain.disconnect(); } catch (e3) { /* пусто */ }
    }, (fade + 0.4) * 1000);
  }

  /**
   * Сменить тему с кроссфейдом (по умолчанию 2 с). Та же тема — no-op.
   * Возвращает true, если смена произошла.
   */
  function switchTheme(name, fade) {
    if (!ensureCtx()) return false;
    if (!THEMES[name]) {
      WS.err('Music: неизвестная тема «' + name + '»');
      return false;
    }
    if (current && !current.dead && current.name === name) return false;
    var f = fade === undefined ? 2.0 : fade;
    var old = current;
    current = makeInst(name, f);
    if (old) stopTheme(old, f);
    return true;
  }

  /**
   * Секвенсор: тикает каждые PUMP_MS, спрашивает у темы следующий кусок,
   * пока не заполнит упреждение LOOKAHEAD. Здесь же тайм-аут боевой темы.
   */
  function pump() {
    if (!ac || !current || current.dead) return;
    if (ac.state !== 'running') return;      // контекст спит (нет жеста)
    var now = ac.currentTime;
    if (battleUntil && now >= battleUntil) endBattle();
    if (!current || current.dead) return;
    // система подвисала — не навёрстываем пропуски разом
    if (current.next < now - 1) current.next = now + 0.05;
    var ahead = now + LOOKAHEAD;
    var guard = 0;
    while (current && !current.dead && current.next < ahead && guard++ < 32) {
      var d = 0.25;
      try {
        d = current.theme.step(current, current.next) || 0.25;
      } catch (e) {
        WS.err('Music: step("' + current.name + '")', e && e.message);
        d = 1.0;                              // не зацикливаемся на ошибке
      }
      current.next += (d > 0.02 ? d : 0.25);
    }
  }

  // ====================================================================
  //  ТЕМЫ
  // ====================================================================

  var THEMES = {};

  function defT(name, obj) { THEMES[name] = obj; }

  /**
   * ------------------------------------------------------------------
   * КАК ДОБАВИТЬ ТЕМУ (для будущих модулей):
   *
   *   defT('имя', {
   *     create: function (inst) {
   *       // устойчивые ноды: дроны, «пространство» (makeSpace)
   *       // inst.vars — любое состояние темы
   *     },
   *     step: function (inst, t) {
   *       // расписать очередной кусок с времени t (ac-шкала)
   *       // инструменты: pluck / bell / piano / strings / cello /
   *       // flageolet / swell / drumKick / drumSnare / drumTick /
   *       // drumLow / jingle / garmo — все принимают (inst, t, ...)
   *       return длительность_до_следующего_вызова;
   *     }
   *   });
   *
   * Договор: шаг может быть тактом (вальс, колядка) или одиночным
   * событием (дрон-темы возвращают паузу 2-5 с). Смена темы — только
   * через switchTheme (кроссфейд), инстанс сам себя чистит: ноты
   * планируют stop, устойчивые ноды лежат в inst.nodes.
   * ------------------------------------------------------------------
   */

  /** Случайный выбор из массива. */
  function pick(R, arr) { return arr[Math.floor(R() * arr.length) % arr.length]; }

  // ------------------------------------------------------------------
  //  1. МЕНЮ: медленный минорный вальс 3/4, темп 60, колокольный тембр.
  //     Две восьмитактные части: A (Am) и B (через Dm/F — светлее).
  // ------------------------------------------------------------------

  defT('menu', {
    // часть A: ноты мелодии по тактам: [миди, длительность в долях]
    MEL_A: [
      [[76, 2], [72, 1]],          // E5 C5
      [[71, 2], [69, 1]],          // B4 A4
      [[72, 1], [71, 1], [72, 1]], // B4 C5 B4
      [[69, 3]],                   // A4
      [[72, 2], [74, 1]],          // C5 D5
      [[76, 2], [74, 1]],          // E5 D5
      [[72, 1], [71, 1], [69, 1]], // C5 B4 A4
      [[71, 2], [67, 1]]           // B4 G4
    ],
    // часть B: мелодия ниже, гармония уходит в Dm/F
    MEL_B: [
      [[69, 2], [71, 1]],          // A4 B4
      [[72, 2], [71, 1]],          // C5 B4
      [[74, 2], [72, 1]],          // D5 C5
      [[71, 3]],                   // B4
      [[72, 1], [74, 1], [76, 1]], // C5 D5 E5
      [[77, 2], [76, 1]],          // F5 E5
      [[74, 1], [72, 1], [71, 1]], // D5 C5 B4
      [[69, 3]]                    // A4 — круг замкнулся
    ],
    // аккомпанемент по тактам: бас (доля 1) + диада (доли 2-3)
    HARM_A: [
      { bass: 45, dyad: [60, 64] },   // Am
      { bass: 45, dyad: [60, 64] },   // Am
      { bass: 40, dyad: [64, 68] },   // E
      { bass: 45, dyad: [60, 64] },   // Am
      { bass: 41, dyad: [65, 69] },   // F
      { bass: 38, dyad: [62, 65] },   // Dm
      { bass: 40, dyad: [64, 68] },   // E
      { bass: 40, dyad: [64, 68] }    // E -> возвращает к Am
    ],
    HARM_B: [
      { bass: 45, dyad: [60, 64] },   // Am
      { bass: 38, dyad: [62, 65] },   // Dm
      { bass: 38, dyad: [62, 65] },   // Dm
      { bass: 40, dyad: [64, 68] },   // E
      { bass: 41, dyad: [65, 69] },   // F
      { bass: 41, dyad: [65, 69] },   // F
      { bass: 38, dyad: [62, 65] },   // Dm
      { bass: 45, dyad: [60, 64] }    // Am
    ],
    create: function (inst) {
      makeSpace(inst, { delay: 0.31, fb: 0.45, lp: 2000, mix: 0.34 });
    },
    step: function (inst, t) {
      var T = THEMES.menu;
      var bar16 = inst.vars.bar % 16;
      var loop = Math.floor(inst.vars.bar / 16);
      inst.vars.bar++;
      var bar = bar16 % 8;
      var partB = bar16 >= 8;
      var beat = 1.0;                       // 60 bpm: доля = 1 с, такт = 3 с
      var i, nt;
      // мелодия: чётные круги — колокол, нечётные — фортепиано (бледнее)
      var mel = partB ? T.MEL_B[bar] : T.MEL_A[bar];
      var tt = t;
      for (i = 0; i < mel.length; i++) {
        nt = mel[i][0];
        if (loop % 2 === 0) bell(inst, tt, nt, partB ? 0.13 : 0.15, { tauMul: 0.8, punch: 0.7 });
        else piano(inst, tt, nt, 0.13, { dur: 2.2 });
        tt += mel[i][1] * beat;
      }
      // аккомпанемент вальса: «бум — та-та»
      var h = partB ? T.HARM_B[bar] : T.HARM_A[bar];
      pluck(inst, t, h.bass, 0.17, { warm: true, damp: 0.994, wet: 0.12 });
      pluck(inst, t + beat, h.dyad[0], 0.065, { warm: true });
      pluck(inst, t + beat, h.dyad[1], 0.055, { warm: true });
      pluck(inst, t + beat * 2, h.dyad[0], 0.05, { warm: true });
      pluck(inst, t + beat * 2, h.dyad[1], 0.045, { warm: true });
      // редкий отзвук сверху (лёгкая вариация)
      if ((inst.vars.bar + bar) % 3 === 0) {
        bell(inst, t + beat * 1.5, mel[0][0] + 12, 0.045, { small: true, punch: 0 });
      }
      // в части B на последних тактах — виолончель держит бас
      if (partB && bar >= 6) {
        cello(inst, t, h.bass + 12, 0.045, beat * 3.1);
      }
      return beat * 3;
    }
  });

  // ------------------------------------------------------------------
  //  2. АКТ 1 (дни 1-14, осень/обустройство): светлая пентатоника D,
  //     щипки Karplus-Strong. Ночью — реже, глуше, ниже.
  // ------------------------------------------------------------------

  defT('act1', {
    // аккорды такта: [ноты арпеджио (4), бас]
    HARM: [
      { notes: [62, 66, 69, 74], bass: 50 },   // D
      { notes: [59, 62, 67, 71], bass: 47 },   // G
      { notes: [62, 66, 69, 74], bass: 50 },   // D
      { notes: [57, 62, 64, 69], bass: 45 },   // A
      { notes: [59, 62, 66, 71], bass: 47 },    // Bm
      { notes: [59, 62, 67, 71], bass: 47 },    // G
      { notes: [57, 62, 64, 69], bass: 45 },    // A
      { notes: [62, 66, 69, 74], bass: 50 }    // D
    ],
    PATTERNS: [
      [0, 1, 2, 3, 2, 1, 0, 1],
      [0, 2, 1, 3, 0, 2, 1, 2],
      [3, 2, 1, 0, 1, 2, 3, 2],
      [0, 1, 3, 2, 3, 1, 0, 2]
    ],
    TOP: [74, 76, 78, 81, 83],              // пентатоника сверху
    create: function (inst) {
      makeSpace(inst, { delay: 0.26, fb: 0.3, lp: 2600, mix: 0.22 });
    },
    step: function (inst, t) {
      var T = THEMES.act1;
      var bar = inst.vars.bar % 8;
      inst.vars.bar++;
      var night = isNightNow();
      var hr = WS.Time ? WS.Time.hour() : 12;
      var evening = !night && hr >= 17;               // сумерки: грустнее
      var R = rngf(inst.vars.bar * 71 + 13);
      var bpm = night ? 76 : (evening ? 80 : 84);
      var beat = 60 / bpm;                  // доля, такт 4/4
      var pat = pick(R, T.PATTERNS);
      var i, eighth = beat / 2;
      var count = night ? 4 : (evening ? 4 : 8);
      var hrm = T.HARM[bar];
      // бас: корень на 1 и 3 доли
      pluck(inst, t, hrm.bass, night ? 0.1 : 0.14, { warm: true, damp: 0.9945 });
      pluck(inst, t + beat * 2, hrm.bass + 7, night ? 0.06 : 0.09, { warm: true });
      // арпеджио: днём — восьмыми, вечером — четвертями, ночью — редко
      for (i = 0; i < count; i++) {
        var idx = (night || evening) ? [0, 2, 1, 3][i] : pat[i];
        pluck(inst, t + i * (night || evening ? beat : eighth),
              hrm.notes[idx],
              night ? 0.055 : (evening ? 0.08 : 0.1),
              { warm: night || evening, damp: night ? 0.9975 : 0.9965, wet: 0.18 });
      }
      if (!night) {
        // сверху — редкая певучая нота-колокол (вечером — ниже и печальнее)
        if (R() < (evening ? 0.4 : 0.32)) {
          var top = evening ? pick(R, [69, 71, 74]) : pick(R, T.TOP);
          bell(inst, t + beat * (1 + Math.floor(R() * 2)), top, 0.06, { tauMul: 1.1, punch: 0 });
        }
      } else if (R() < 0.12) {
        // ночью — далёкий колокол в деревне
        bell(inst, t + beat, 62, 0.04, { tauMul: 1.6, punch: 0.3 });
      }
      return beat * 4;
    }
  });

  // ------------------------------------------------------------------
  //  3. АКТ 2 (дни 15-43, сжатие): тревожный дрон D + редкие
  //     низкие фортепианные ноты, ночью — мрачнее и реже.
  // ------------------------------------------------------------------

  defT('act2', {
    DAY_NOTES: [33, 36, 38, 41, 44],        // A1 C2 D2 E2 G#2
    NIGHT_NOTES: [33, 36, 38, 41],
    create: function (inst) {
      makeSpace(inst, { delay: 0.4, fb: 0.4, lp: 1600, mix: 0.25 });
      inst.vars.drone = startDrone(inst, {
        midis: [38, 45],                    // D2 + A2 (квинта — пустота)
        cut: 170, level: 0.055,
        lfoRate: 0.05, lfoDepth: 85, wet: 0.12
      });
    },
    step: function (inst, t) {
      var T = THEMES.act2;
      var night = isNightNow();
      var R = rngf(Math.floor(t * 17) + 3);
      var notes = night ? T.NIGHT_NOTES : T.DAY_NOTES;
      var wait = (night ? 3.4 : 2.4) + R() * 1.6;
      // основная нота — фортепиано, глухо
      piano(inst, t, pick(R, notes), 0.13 + R() * 0.06, { dur: 3.0 });
      // иногда — щемящая малая секунда следом
      if (R() < (night ? 0.3 : 0.18)) {
        var n2 = pick(R, notes) + 1;
        piano(inst, t + 0.35 + R() * 0.4, n2, 0.07, { dur: 2.2 });
      }
      // изредка — тянущая виолончель поверх дрона (человеческая тоска)
      if (R() < (night ? 0.22 : 0.16)) {
        cello(inst, t + 0.8 + R() * 0.6, pick(R, [38, 41, 45]), 0.05 + R() * 0.025,
              wait * (0.8 + R() * 0.4));
      }
      // редкий отдалённый колокол (надежда уходит)
      if (R() < 0.08) bell(inst, t + 1.2, 50, 0.035, { tauMul: 2.2, punch: 0.2 });
      return wait;
    }
  });

  // ------------------------------------------------------------------
  //  4. ПОЛЯРНАЯ НОЧЬ (акт 3, дни 44-60): почти эмбиент — редкие
  //     звонкие капли-ноты в холодных интервалах + глухой прибой внизу.
  // ------------------------------------------------------------------

  defT('polar', {
    DROPS: [74, 76, 79, 81, 86, 88],        // D5 E5 G5 A5 D6 E6
    INTERVALS: [1, 6, 8],                   // м.2, тритон, м.6 — холод
    create: function (inst) {
      makeSpace(inst, { delay: 0.46, fb: 0.5, lp: 1800, mix: 0.45 });
      inst.vars.drone = startDrone(inst, {
        midis: [26],                         // D1: глухое дно мира
        cut: 120, level: 0.04,
        lfoRate: 0.04, lfoDepth: 45, wet: 0.1
      });
    },
    step: function (inst, t) {
      var T = THEMES.polar;
      var night = isNightNow();
      var R = rngf(Math.floor(t * 23) + 7);
      // капля-нота: маленький колокол, долгий хвост
      var n1 = pick(R, T.DROPS);
      bell(inst, t, n1, 0.1 + R() * 0.06, { small: true, tauMul: 2.0, punch: 0.4 });
      // холодный интервал следом — второй «ледяной» звон
      if (R() < 0.6) {
        var n2 = n1 + pick(R, T.INTERVALS);
        bell(inst, t + 0.35 + R() * 0.55, n2, 0.05 + R() * 0.03, { small: true, tauMul: 2.4, punch: 0 });
      }
      // призрачный флажолет — «ветер пьёт из бутылки»
      if (R() < (night ? 0.16 : 0.22)) {
        flageolet(inst, t + 1.1 + R() * 0.9, pick(R, [81, 86, 88, 93]),
                  0.035 + R() * 0.02, 2.5 + R() * 2.0);
      }
      // изредка — низкий прилив (дыхание тьмы)
      if (R() < 0.15) swell(inst, t + 0.5, 38, 0.05, 7 + R() * 4);
      var wait = (night ? 4.2 : 2.6) + R() * 2.6;
      return wait;
    }
  });

  // ------------------------------------------------------------------
  //  5. БОЙ (волки рядом): пульс-остинато D-moll 138 bpm + барабаны,
  //     вторая четвёрка тактов — плотнее (восьмые сверху, сбивка).
  // ------------------------------------------------------------------

  defT('battle', {
    // остинато по тактам, восьмые (миди): первый круг
    OST_A: [
      [50, 50, 50, 53, 50, 50, 55, 53],
      [50, 50, 50, 53, 50, 50, 46, 48],
      [50, 50, 50, 55, 57, 55, 53, 50],
      [50, 48, 47, 46, 45, 44, 43, 41]      // хроматический провал
    ],
    // второй круг: остинато уходит в G — погоня по кругу
    OST_B: [
      [55, 55, 55, 58, 55, 55, 60, 58],
      [55, 55, 55, 58, 55, 55, 51, 53],
      [55, 55, 55, 60, 62, 60, 58, 55],
      [53, 52, 51, 50, 49, 48, 47, 45]
    ],
    create: function (inst) {
      makeSpace(inst, { delay: 0.12, fb: 0.22, lp: 3000, mix: 0.16 });
      inst.vars.drone = startDrone(inst, {
        midis: [38],                         // D2 — топот судьбы
        cut: 300, level: 0.07,
        lfoRate: 0.11, lfoDepth: 130, wet: 0.08
      });
    },
    step: function (inst, t) {
      var T = THEMES.battle;
      var cycle16 = inst.vars.bar % 16;       // круг A (такты 0-7), круг B (8-15)
      var bar = cycle16 % 4;
      inst.vars.bar++;
      var hot = (cycle16 % 8) >= 4;          // жарко во второй половине круга
      var useB = cycle16 >= 8;
      var bpm = 138;
      var beat = 60 / bpm;                   // доля, такт 4/4 = 1.74 с
      var eighth = beat / 2;
      var i;
      // остинато смычком
      var ost = useB ? T.OST_B[bar] : T.OST_A[bar];
      for (i = 0; i < 8; i++) {
        strings(inst, t + i * eighth, ost[i], hot ? 0.14 : 0.1, { dur: eighth * 0.95 });
      }
      // второй слой на октаву выше — когда жарко
      if (hot) {
        for (i = 0; i < 8; i += 2) {
          strings(inst, t + i * eighth, ost[i] + 12, 0.055, { dur: eighth * 1.6 });
        }
      }
      // барабаны
      drumKick(inst, t, 0.32);
      drumKick(inst, t + beat * 1.5, 0.26);
      drumKick(inst, t + beat * 2.5, 0.22);
      drumSnare(inst, t + beat, 0.2);
      drumSnare(inst, t + beat * 3, 0.22);
      for (i = 0; i < 8; i++) drumTick(inst, t + i * eighth, 0.05);
      if (hot) drumSnare(inst, t + beat * 2.5, 0.09);
      // сбивка в конце четвёртого такта
      if (bar === 3) {
        for (i = 0; i < 4; i++) drumSnare(inst, t + beat * 3 + i * (beat / 4), 0.12 + i * 0.02);
        drumLow(inst, t + beat * 3.75, 0.3);
        // и рёв рога войны — последний предупреждение волкам
        if (useB) bell(inst, t + beat * 3.75, 38, 0.08, { tauMul: 0.6, punch: 1 });
      }
      return beat * 4;
    }
  });

  // ------------------------------------------------------------------
  //  6. СМЕРТЬ: реквием — медленная фраза, минорная терция вниз,
  //     четыре такта фразы + четыре такта тишины с прибоем.
  // ------------------------------------------------------------------

  defT('death', {
    // фраза: такты 0-3, [миди, доля старта, длина в долях]
    PHRASE: [
      [[64, 0, 1.5], [60, 2, 2]],               // E4 ... C4 (м.3 вниз)
      [[62, 0, 2], [60, 2, 1], [59, 3, 1]],     // D4 C4 B3
      [[60, 0, 2], [57, 2, 2]],                 // C4 A3
      [[45, 0, 4]]                               // A2 — точка
    ],
    create: function (inst) {
      makeSpace(inst, { delay: 0.52, fb: 0.46, lp: 1500, mix: 0.42 });
    },
    step: function (inst, t) {
      var T = THEMES.death;
      var bar = inst.vars.bar % 8;
      var loop = Math.floor(inst.vars.bar / 8);
      inst.vars.bar++;
      var bpm = 52;
      var beat = 60 / bpm;                  // такт 4/4 = 4.6 с
      if (bar < 4) {
        var notes = T.PHRASE[bar];
        var i;
        for (i = 0; i < notes.length; i++) {
          var n = notes[i];
          piano(inst, t + n[1] * beat, n[0], 0.15, { dur: n[2] * beat * 1.4 });
          // со второго круга — отзвук колокола в унисон (заупокойно)
          if (loop >= 1 && n[1] === 0) {
            bell(inst, t + n[1] * beat, n[0], 0.04, { tauMul: 2.4, punch: 0.2 });
          }
        }
      } else if (bar === 7) {
        // в тишине между кругами — низкий прибой
        swell(inst, t, 33, 0.04, beat * 4);
      }
      return beat * 4;
    }
  });

  // ------------------------------------------------------------------
  //  7. ПОБЕДА: гимн — мажорная тема C с колоколами и литаврой.
  // ------------------------------------------------------------------

  defT('victory', {
    // часть A: мелодия — [миди, доля старта, длина]
    MEL_A: [
      [[67, 0, 0.5], [72, 0.5, 0.5], [76, 1, 1], [79, 2, 2]],
      [[81, 0, 1], [79, 1, 1], [76, 2, 1], [72, 3, 1]],
      [[77, 0, 0.5], [76, 0.5, 0.5], [74, 1, 1], [76, 2, 2]],
      [[72, 0, 3], [67, 3, 1]],
      [[67, 0, 0.5], [72, 0.5, 0.5], [76, 1, 1], [79, 2, 1], [81, 3, 1]],
      [[84, 0, 2], [79, 2, 1], [76, 3, 1]],
      [[77, 0, 1], [76, 1, 1], [74, 2, 1], [76, 3, 1]],
      [[72, 0, 3], [67, 3, 1]]
    ],
    // арпеджио аккорда по тактам (щипки, четвертями)
    CHORDS_A: [
      [60, 64, 67, 72],   // C
      [57, 60, 65, 69],   // F
      [60, 64, 67, 72],   // C
      [55, 59, 62, 67],   // G
      [60, 64, 67, 72],   // C
      [57, 60, 65, 69],   // F
      [55, 59, 62, 67],   // G
      [60, 64, 67, 72]    // C
    ],
    // часть B: подхват ниже, «все поют» — финальная волна
    MEL_B: [
      [[60, 0, 1], [64, 1, 1], [67, 2, 2]],
      [[65, 0, 1], [64, 1, 1], [62, 2, 2]],
      [[64, 0, 0.5], [62, 0.5, 0.5], [60, 1, 2]],
      [[55, 0, 2], [59, 2, 2]],
      [[60, 0, 1], [64, 1, 1], [69, 2, 2]],
      [[67, 0, 1], [65, 1, 1], [64, 2, 1], [62, 3, 1]],
      [[64, 0, 2], [62, 2, 2]],
      [[60, 0, 3], [55, 3, 1]]
    ],
    CHORDS_B: [
      [48, 55, 60, 64],   // C (ниже)
      [53, 57, 60, 65],   // F
      [48, 55, 60, 64],   // C
      [43, 50, 55, 59],   // G
      [48, 55, 60, 64],   // C
      [53, 57, 60, 65],   // F
      [55, 59, 62, 67],   // G
      [48, 55, 60, 64]    // C
    ],
    create: function (inst) {
      makeSpace(inst, { delay: 0.29, fb: 0.42, lp: 2400, mix: 0.32 });
    },
    step: function (inst, t) {
      var T = THEMES.victory;
      var bar16 = inst.vars.bar % 16;
      var loop = Math.floor(inst.vars.bar / 16);
      inst.vars.bar++;
      var bar = bar16 % 8;
      var partB = bar16 >= 8;
      var bpm = 88;
      var beat = 60 / bpm;                  // такт 4/4 = 2.73 с
      var i, n;
      // мелодия колоколами; часть B — хор ниже, октавное удвоение со 2-го круга
      var mel = partB ? T.MEL_B[bar] : T.MEL_A[bar];
      var melVel = partB ? 0.12 : 0.16;
      for (i = 0; i < mel.length; i++) {
        n = mel[i];
        bell(inst, t + n[1] * beat, n[0], melVel, { punch: 0.6 });
        if (loop >= 1) bell(inst, t + n[1] * beat, n[0] + 12, 0.05, { small: true, punch: 0 });
      }
      // арпеджио щипком
      var ch = partB ? T.CHORDS_B[bar] : T.CHORDS_A[bar];
      for (i = 0; i < 4; i++) {
        pluck(inst, t + i * beat, ch[i], i === 0 ? 0.13 : 0.09, { warm: false });
      }
      // литавра в начале такта, бубенцы на третьей доле
      drumLow(inst, t, 0.3);
      jingle(inst, t + beat * 2, 0.14);
      if (bar === 0) drumKick(inst, t + beat * 2, 0.2);
      // финальный аккорд круга: четыре щипка разом + большой колокол
      if (bar === 7) {
        for (i = 0; i < 4; i++) pluck(inst, t + beat * 3, ch[i] + 12, 0.08, { warm: false });
        bell(inst, t + beat * 3, 48, 0.1, { tauMul: 1.8, punch: 0.8 });
      }
      return beat * 4;
    }
  });

  // ------------------------------------------------------------------
  //  8. СВЯТКИ (дни 35-42): колядочный мотив — простой и весёлый,
  //     2/4, щипок + бубенцы + гармонь.
  // ------------------------------------------------------------------

  defT('svyatki', {
    // мелодия восьмыми, 4 на такт: часть A
    MEL_A: [
      [69, 69, 71, 73],   // A A B C#
      [73, 71, 69, 69],   // C# B A A
      [69, 69, 71, 73],
      [74, 73, 71, 71],   // D C# B B
      [76, 74, 73, 71],   // E D C# B
      [73, 71, 69, 69],
      [71, 71, 73, 74],
      [73, 71, 69, 69]
    ],
    // часть B: «и больше той же, но иначе» — колядка кружится
    MEL_B: [
      [69, 71, 73, 74],   // A B C# D
      [76, 74, 73, 71],
      [74, 73, 71, 69],
      [71, 69, 71, 73],
      [69, 71, 73, 76],   // подъём наверх
      [76, 74, 73, 71],
      [73, 71, 69, 71],
      [69, 69, 69, 69]    // тоника — тройной шаг
    ],
    create: function (inst) {
      makeSpace(inst, { delay: 0.18, fb: 0.24, lp: 3000, mix: 0.18 });
    },
    step: function (inst, t) {
      var T = THEMES.svyatki;
      var bar16 = inst.vars.bar % 16;
      inst.vars.bar++;
      var bar = bar16 % 8;
      var partB = bar16 >= 8;
      var bpm = 112;
      var beat = 60 / bpm;                  // такт 2/4 = 1.07 с
      var eighth = beat / 2;
      var i;
      var mel = partB ? T.MEL_B[bar] : T.MEL_A[bar];
      // мелодия щипком, звонко; в части B — октавой выше и тише (за окном)
      var shift = partB ? 12 : 0;
      var melVel = partB ? 0.1 : 0.13;
      for (i = 0; i < 4; i++) {
        pluck(inst, t + i * eighth, mel[i] + shift, melVel, { warm: false, damp: 0.995 });
      }
      // «бум-ца»: бас и квинта по долям
      pluck(inst, t, 45, 0.15, { warm: true, damp: 0.994 });        // A2
      pluck(inst, t + beat, 52, 0.1, { warm: true });              // E3
      // бубенцы на вторые восьмые
      jingle(inst, t + eighth, 0.09);
      jingle(inst, t + beat + eighth, 0.08);
      // гармошка врывается в начало четвёрок
      if (bar === 0) {
        garmo(inst, t, [57, 61, 64], 0.11, beat * 1.6);            // A C# E
      }
      if (bar === 4) {
        garmo(inst, t, [54, 57, 61], 0.09, beat * 1.6);            // F# A C#
      }
      // вариация: через круг — отзвук мелодии октавой выше
      if (Math.floor(inst.vars.bar / 16) % 2 === 1 && bar % 2 === 1) {
        pluck(inst, t + eighth * 2, mel[2] + 12, 0.06, { warm: false });
      }
      return beat * 2;
    }
  });

  // ====================================================================
  //  КОНТЕКСТ: какая тема положена сейчас
  // ====================================================================

  /** Финальные темы — смерть/победа — не перебиваются до новой партии. */
  function locked() {
    return !!(current && !current.dead &&
              (current.name === 'death' || current.name === 'victory'));
  }

  /** Идёт ли сейчас боевая тема. */
  function inBattle() {
    return !!(current && !current.dead && current.name === 'battle');
  }

  /**
   * Какая тема положена по состоянию игры:
   * меню / акт 1 / акт 2 / полярная ночь / святки (дни 35-42, не ночью).
   * night: true|false|undefined (неизвестно — смотрим на часы).
   */
  function contextual(night) {
    if (!inGame()) return 'menu';
    var day = WS.Time ? WS.Time.day() : 1;
    var act = 1;
    if (WS.Story && WS.Story.act) {
      try { act = WS.Story.act(); } catch (e) { act = 1; }
    } else {
      act = day <= 14 ? 1 : (day <= 43 ? 2 : 3);
    }
    if (night === undefined) night = isNightNow();
    if (day >= 35 && day <= 42 && !night) return 'svyatki';
    if (act >= 3) return 'polar';
    if (act === 2) return 'act2';
    return 'act1';
  }

  /**
   * Бой: урон от зверя (или внешний вызов) включает тему боя на sec
   * секунд, затем плавный возврат к контекстной теме.
   */
  function triggerBattle(sec) {
    if (!ensureCtx()) return;
    if (locked()) return;                          // смерть/победа важнее
    if (inBattle()) {
      battleUntil = ac.currentTime + (sec || 20);
      return;
    }
    battleReturn = current && !current.dead ? current.name : (battleReturn || contextual());
    battleUntil = ac.currentTime + (sec || 20);
    switchTheme('battle', 0.8);
  }

  /** Возврат из боя к контексту. */
  function endBattle() {
    battleUntil = 0;
    var back = battleReturn || contextual();
    battleReturn = null;
    switchTheme(back, 2.2);
  }

  /** Пересчитать тему по контексту (если она не «заперта» и не бой). */
  function recontext(fade) {
    if (locked() || inBattle()) return false;
    return switchTheme(contextual(), fade === undefined ? 3 : fade);
  }

  /**
   * «Прижать» музыку на время важного звука (радиопередача, диалог):
   * шина уходит в level-долю громкости и возвращается через hold сек.
   */
  function duck(level, hold) {
    if (!ensureCtx() || !bus) return;
    var lvl = volume * clamp(level === undefined ? 0.25 : level, 0, 1);
    bus.gain.cancelScheduledValues(ac.currentTime);
    bus.gain.setTargetAtTime(muted ? 0 : lvl, ac.currentTime, 0.3);
    if (duckTimer) { clearTimeout(duckTimer); duckTimer = null; }
    if (hold > 0) {
      duckTimer = setTimeout(function () {
        duckTimer = null;
        if (bus && ac) {
          bus.gain.setTargetAtTime(muted ? 0 : volume, ac.currentTime, 1.2);
        }
      }, hold * 1000);
    }
  }

  /** Снимок состояния музыки (для отладки/настроек). */
  function nowPlaying() {
    return {
      theme: current && !current.dead ? current.name : null,
      bar: current ? current.vars.bar : 0,
      next: current ? current.next : 0,
      battleLeft: battleUntil ? Math.max(0, battleUntil - (ac ? ac.currentTime : 0)) : 0,
      volume: volume,
      muted: muted,
      ctxRunning: !!(ac && ac.state === 'running')
    };
  }

  // ====================================================================
  //  ПУБЛИЧНЫЙ API МОДУЛЯ
  // ====================================================================

  WS.def('Music', {
    /** Сменить тему вручную: play('menu') и т.д. Возвращает успех. */
    play: function (name, fade) { return switchTheme(name, fade); },
    /** Полная остановка музыки (фейд). */
    stop: function (fade) {
      battleUntil = 0;
      battleReturn = null;
      if (current) {
        stopTheme(current, fade === undefined ? 1.5 : fade);
        current = null;
      }
    },
    /** Аварийная тишина: без фейдов, без таймеров (крайний случай). */
    panic: function () {
      battleUntil = 0;
      battleReturn = null;
      if (duckTimer) { clearTimeout(duckTimer); duckTimer = null; }
      var old = current;
      current = null;
      if (old) {
        old.dead = true;
        var i;
        for (i = 0; i < old.nodes.length; i++) {
          try { if (old.nodes[i].stop) old.nodes[i].stop(); } catch (e) { /* пусто */ }
        }
        try { old.gain.disconnect(); } catch (e2) { /* пусто */ }
      }
    },
    /** Имя активной темы (или null). */
    theme: function () { return current && !current.dead ? current.name : null; },
    /** Список имён тем. */
    themes: function () {
      var out = [], k;
      for (k in THEMES) {
        if (Object.prototype.hasOwnProperty.call(THEMES, k)) out.push(k);
      }
      out.sort();
      return out;
    },
    /** Какая тема положена сейчас по состоянию игры. */
    contextual: contextual,
    /** Принудительно включить боевую тему на N секунд. */
    battle: triggerBattle,
    /** Прижать музыку (радио/диалог): доля громкости и время удержания. */
    duck: duck,
    /** Снимок состояния (тема, такт, боещё осталось, громкость). */
    nowPlaying: nowPlaying,
    setVolume: function (v) {
      volume = clamp(v, 0, 1);
      if (bus && ac) {
        bus.gain.setTargetAtTime(muted ? 0 : volume, ac.currentTime, 0.05);
      }
    },
    getVolume: function () { return volume; },
    setMuted: function (m) {
      muted = !!m;
      if (bus && ac) {
        bus.gain.setTargetAtTime(muted ? 0 : volume, ac.currentTime, 0.05);
      }
    },
    isMuted: function () { return muted; },
    toggle: function () {
      muted = !muted;
      if (bus && ac) {
        bus.gain.setTargetAtTime(muted ? 0 : volume, ac.currentTime, 0.05);
      }
      return muted;
    },
    ctx: function () { return ac; }
  });

  // ====================================================================
  //  ИНИЦИАЛИЗАЦИЯ: разблокировка, триггеры, запуск секвенсора
  // ====================================================================

  WS.boot(function initMusic() {
    var on = WS.Ev.on;

    /** Первый жест пользователя: будим контекст, в меню — вальс. */
    function unlock() {
      gestureSeen = true;
      if (ensureCtx() && ac.state === 'suspended') {
        try { ac.resume(); } catch (e) { /* пусто */ }
      }
      if (!current && !inGame()) switchTheme('menu', 1.5);
    }
    document.addEventListener('pointerdown', function onGestureP() {
      if (gestureSeen) return;                    // второй слушатель не нужен
      unlock();
    }, { once: true });
    document.addEventListener('keydown', function onGestureK() {
      if (gestureSeen) return;
      unlock();
    }, { once: true });

    // новая партия / загрузка: тема по акту и времени суток
    on('game:start', function () {
      battleUntil = 0;
      battleReturn = null;
      switchTheme(contextual(false), 3);
    });
    on('game:load', function () {
      battleUntil = 0;
      battleReturn = null;
      switchTheme(contextual(), 3);
    });

    // сутки: ночная тема глуше (темы сами читают ночь по часам),
    // но смена контекста (акт, святки) — только здесь и на рассвете
    on('night:fall', function () { recontext(3.5); });
    on('day:dawn', function () { recontext(3.5); });
    on('time:day', function () { recontext(4); });

    // бой: урон от зверя — 20 секунд боевой темы, затем возврат
    on('player:damage', function (d) {
      var k = d && d.src && d.src.kind;
      if (k === 'wolf' || k === 'bear' || k === 'bandit') triggerBattle(20);
    });

    // смерть и победа — финальные темы
    on('player:die', function () {
      battleUntil = 0;
      battleReturn = null;
      switchTheme('death', 1.2);
    });
    on('game:victory', function () {
      battleUntil = 0;
      battleReturn = null;
      switchTheme('victory', 1.2);
    });

    // радиопередача (18:00, дальнее радио): речь важнее музыки
    on('radio:msg', function () { duck(0.25, 10); });

    // секвенсор: тикаем всю жизнь страницы, работа только при темах
    try {
      timer = setInterval(pump, PUMP_MS);
    } catch (e) {
      WS.err('Music: секвенсор не запущен', e && e.message);
    }
  }, 'music:init');
})();

