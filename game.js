/* ============================================================================
   БЕЛОЕ БЕЗМОЛВИЕ: БЕЗУМНЫЙ ДЕД
   Bullet-heaven в каноне проекта (Пристань-Тихая, зима 1917):
   - управление: движение; ЛОДОШКА БЬЁТ ПО НАПРАВЛЕНИЮ ХОДА (наводка движением)
   - грибы = опыт, но ГАСНУТ — жадность = риск; золотой гриб = засада
   - волк приседает → рывок; ворона замирает → пике в отмеченную точку
   - боссы 3:00 / 6:30 / 9:00, потом ОСАДА; 10:00 — РАССВЕТ = победа
   - Приход 🍄 → [G] Грибной Залп; свёртки со старших; переброс [R]
   Ноль зависимостей. Canvas 2D. Мультяшки — грибные глюки деда.
   ============================================================================ */

'use strict';

(function () {

// ════════════════════════════════════════════════════════════ УТИЛИТЫ ════

var TAU = Math.PI * 2;

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function lerp(a, b, t) { return a + (b - a) * t; }
function dist2(ax, ay, bx, by) {
  var dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
}
function dist(ax, ay, bx, by) { return Math.sqrt(dist2(ax, ay, bx, by)); }
function angTo(ax, ay, bx, by) { return Math.atan2(by - ay, bx - ax); }
function rnd(a, b) { return a + Math.random() * (b - a); }
function rint(a, b) { return Math.floor(rnd(a, b + 1)); }
function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }

/** Детерминированный хеш пары координат — для генерации земли/пропсов. */
function hash2(x, y) {
  var h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >> 13)) | 0;
  h = (h * 1274126177) | 0;
  return ((h ^ (h >> 16)) >>> 0) / 4294967295;
}

function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec));
  var m = Math.floor(sec / 60);
  var s = sec % 60;
  return m + ':' + (s < 10 ? '0' : '') + s;
}

function $$(id) { return document.getElementById(id); }

// ════════════════════════════════════════════════════════════ КАНВАС ═════

var canvas = $$('game');
var ctx = canvas.getContext('2d');
var VW = 1280, VH = 720;          // логическое разрешение (масштабируем)
var SCALE = 1;

function resize() {
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var w = window.innerWidth, h = window.innerHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  SCALE = Math.max(canvas.width / VW, canvas.height / VH) * 0.92;
  // CSS-размеры
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
}
window.addEventListener('resize', resize);
resize();

// ═════════════════════════════════════════════════════════════ ЗВУК ══════
// Процедурный WebAudio: никаких файлов, всё синтезом.

var AU = {
  ctx: null,
  master: null,
  muted: false,

  init: function () {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    } catch (e) { /* без звука тоже можно */ }
  },

  tone: function (freq, dur, type, vol, slide) {
    if (!this.ctx || this.muted) return;
    try {
      var t = this.ctx.currentTime;
      var o = this.ctx.createOscillator();
      var g = this.ctx.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, slide), t + dur);
      g.gain.setValueAtTime(vol || 0.15, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + dur + 0.02);
    } catch (e) { /* пусто */ }
  },

  noise: function (dur, vol, low) {
    if (!this.ctx || this.muted) return;
    try {
      var t = this.ctx.currentTime;
      var n = Math.floor(this.ctx.sampleRate * dur);
      var buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
      var d = buf.getChannelData(0);
      for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      var src = this.ctx.createBufferSource();
      src.buffer = buf;
      var g = this.ctx.createGain();
      g.gain.value = vol || 0.2;
      var f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = low || 1800;
      src.connect(f); f.connect(g); g.connect(this.master);
      src.start(t);
    } catch (e) { /* пусто */ }
  },

  slap: function () { this.noise(0.08, 0.22, 2400); this.tone(180, 0.06, 'square', 0.1, 90); },
  pop: function () { this.tone(660, 0.07, 'sine', 0.12, 990); },
  gem: function () { this.tone(880, 0.05, 'sine', 0.08, 1320); },
  hurt: function () { this.tone(140, 0.18, 'sawtooth', 0.2, 60); },
  kill: function () { this.tone(320, 0.1, 'square', 0.1, 160); this.noise(0.06, 0.1, 3000); },
  levelup: function () {
    this.tone(523, 0.12, 'square', 0.12); 
    var self = this;
    setTimeout(function () { self.tone(659, 0.12, 'square', 0.12); }, 90);
    setTimeout(function () { self.tone(784, 0.2, 'square', 0.14); }, 180);
  },
  zap: function () {
    this.tone(80, 0.7, 'sawtooth', 0.3, 900);
    this.noise(0.5, 0.25, 4000);
  },
  roar: function () { this.tone(70, 0.8, 'sawtooth', 0.3, 40); this.noise(0.7, 0.2, 500); },
  gift: function () {
    this.tone(392, 0.1, 'sine', 0.14);
    var self = this;
    setTimeout(function () { self.tone(523, 0.1, 'sine', 0.14); }, 80);
    setTimeout(function () { self.tone(659, 0.1, 'sine', 0.14); }, 160);
    setTimeout(function () { self.tone(784, 0.24, 'sine', 0.18); }, 240);
  },
  death: function () { this.tone(220, 0.5, 'sawtooth', 0.2, 55); },
  win: function () {
    var notes = [392, 523, 659, 784, 1046];
    var self = this;
    notes.forEach(function (n, i) {
      setTimeout(function () { self.tone(n, 0.3, 'square', 0.13); }, i * 130);
    });
  },
  evo: function () {
    var self = this;
    [261, 329, 392, 523, 659, 784].forEach(function (n, i) {
      setTimeout(function () { self.tone(n, 0.25, 'triangle', 0.15); }, i * 70);
    });
  },
  // --- атмосфера 1917 ---
  howl: function () {   // волчий вой: две скользящие ноты в туман
    this.tone(340, 1.4, 'sine', 0.12, 250);
    var self = this;
    setTimeout(function () { self.tone(300, 1.1, 'sine', 0.1, 210); }, 500);
  },
  bell: function () {    // колокол: тяжёлый удар с долгим хвостом
    this.tone(140, 2.2, 'sine', 0.25, 130);
    this.tone(281, 1.4, 'sine', 0.1, 270);
  },
  grunt: function () {   // дед крякает
    this.tone(110, 0.09, 'sawtooth', 0.12, 80);
  },

  // ─── БЛИП-РЕЧЬ: слоговые голоса (дед, боссы) — всё синтезом ───

  _cds: {},
  canSay: function (key, cd) {
    var now = performance.now() / 1000;
    if (this._cds[key] && now - this._cds[key] < cd) return false;
    this._cds[key] = now;
    return true;
  },

  /** Ноты-слоги: [{f, d, s(слайд), v(объём)}] — планируются точно по таймлайну. */
  voice: function (notes, opts) {
    if (!this.ctx || this.muted) return;
    opts = opts || {};
    try {
      var t = this.ctx.currentTime + 0.02;
      var self = this;
      for (var i = 0; i < notes.length; i++) {
        var n = notes[i];
        var dur = n.d || 0.09;
        var o = self.ctx.createOscillator();
        var g = self.ctx.createGain();
        var f = self.ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = opts.cut || 900;
        o.type = opts.type || 'sawtooth';
        o.frequency.setValueAtTime(n.f, t);
        if (n.s) o.frequency.exponentialRampToValueAtTime(Math.max(30, n.s), t + dur);
        // вибрато — дрожание живого голоса
        if (opts.vib) {
          var lfo = self.ctx.createOscillator();
          var lg = self.ctx.createGain();
          lfo.frequency.value = opts.vibHz || 6.5;
          lg.gain.value = opts.vib;
          lfo.connect(lg); lg.connect(o.frequency);
          lfo.start(t); lfo.stop(t + dur + 0.03);
        }
        var v = (n.v != null ? n.v : (opts.vol || 0.12));
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(v, t + 0.018);
        g.gain.setValueAtTime(v * 0.9, t + dur * 0.75);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        o.connect(f); f.connect(g); g.connect(self.master);
        o.start(t); o.stop(t + dur + 0.04);
        t += dur + (opts.gap != null ? opts.gap : 0.035);
      }
    } catch (e) { /* молча */ }
  },

  /** Голос деда: скрипучий, фраза разбирается на слоги-блипы. */
  dedTalk: function (phrase, mood, force) {
    if (!force && !this.canSay('ded', mood === 'pain' ? 2.5 : 4)) return false;
    if (force) this.canSay('ded', 0.6);   // даже важное — не чаше раза в 0.6с
    if (!this.ctx || this.muted) return true;   // звука нет — текст всё равно покажем
    var base = mood === 'pain' ? 145 : (mood === 'exc' ? 118 : 98);
    var words = phrase.split(' ');
    var notes = [];
    var f = base;
    for (var wi = 0; wi < words.length && notes.length < 12; wi++) {
      var syl = Math.max(1, Math.min(3, Math.ceil(words[wi].length / 3)));
      for (var si = 0; si < syl && notes.length < 12; si++) {
        notes.push({
          f: f, d: mood === 'sad' ? 0.16 : 0.085,
          s: f * (si === syl - 1 ? (mood === 'pain' ? 0.78 : 0.9) : 1.05)
        });
        f *= 1.02;
      }
      f = base * (1 + 0.05 * ((wi + 1) / words.length));
    }
    if (notes.length) {
      var last = notes[notes.length - 1];
      last.s = base * (mood === 'exc' ? 1.15 : 0.72);   // интонация конца фразы
      last.d += mood === 'sad' ? 0.25 : 0.06;
    }
    this.voice(notes, {
      type: 'sawtooth',
      cut: mood === 'pain' ? 700 : 520,
      vib: 5, vol: mood === 'sad' ? 0.13 : 0.11,
      gap: mood === 'sad' ? 0.09 : 0.035
    });
    return true;
  },

  /** Голоса старших леса: у каждого свой характер. kind: 'spawn'|'attack'|'die'. */
  bossVoice: function (id, kind) {
    if (!this.ctx || this.muted) return;
    if (!this.canSay('bv_' + id + '_' + kind, kind === 'spawn' ? 6 : (kind === 'die' ? 4 : 2.2))) return;
    var N = {
      alpha: {    // ВОЖАК: вой в туман
        spawn: [{ f: 320, d: 0.4, s: 400 }, { f: 400, d: 0.9, s: 200 }],
        attack: [{ f: 380, d: 0.25, s: 260 }],
        base: 320, opt: { type: 'sine', cut: 1500, vib: 5, vol: 0.14 }
      },
      shisha: {   // МЕДВЕДЬ-ШАТУН: утробное «ЭР-Р-Р»
        spawn: [{ f: 58, d: 0.9, s: 44, v: 0.22 }, { f: 46, d: 0.6, s: 38, v: 0.18 }],
        attack: [{ f: 64, d: 0.4, s: 40, v: 0.2 }],
        base: 58, opt: { type: 'sawtooth', cut: 300, vol: 0.2 }
      },
      glavar: {   // АТАМАН: хриплый смешок «ХЕ-ХЕ-ХЕ»
        spawn: [{ f: 200, d: 0.13, s: 160 }, { f: 185, d: 0.13, s: 150 }, { f: 170, d: 0.2, s: 130 }],
        attack: [{ f: 190, d: 0.12, s: 155 }, { f: 175, d: 0.16, s: 135 }],
        base: 190, opt: { type: 'sawtooth', cut: 700, vol: 0.13 }
      },
      hozyain: {  // ХОЗЯИН ТРАКТА: паровозный гудок «ТУ-У-У»
        spawn: [{ f: 150, d: 0.45, s: 146 }, { f: 150, d: 0.6, s: 142 }],
        attack: [{ f: 150, d: 0.3, s: 140 }],
        base: 150, opt: { type: 'square', cut: 800, vol: 0.15 }
      },
      metelica: { // ВЕДЬМА МЕТЕЛИ: хохот «ХА-ХА-ХА-ХА»
        spawn: [{ f: 640, d: 0.14, s: 700 }, { f: 700, d: 0.14, s: 640 }, { f: 620, d: 0.14, s: 690 }, { f: 690, d: 0.22, s: 520 }],
        attack: [{ f: 660, d: 0.12, s: 720 }, { f: 720, d: 0.18, s: 560 }],
        base: 640, opt: { type: 'sine', cut: 2500, vol: 0.12 }
      },
      leshiy: {   // ЛЕШИЙ: басовитое «ХО-ХО-ХО» со скрипом
        spawn: [{ f: 105, d: 0.22, s: 88 }, { f: 98, d: 0.22, s: 82 }, { f: 92, d: 0.3, s: 70 }],
        attack: [{ f: 100, d: 0.18, s: 78 }],
        base: 100, opt: { type: 'sawtooth', cut: 400, vib: 6, vol: 0.17 }
      }
    }[id];
    if (!N) return;
    if (kind === 'die') {
      // агония: глиссандо вниз от базы голоса
      this.voice([{ f: N.base * 1.2, d: 0.55, s: N.base * 0.35, v: (N.opt.vol || 0.13) * 1.2 }], N.opt);
      this.noise(0.5, 0.12, 600);
      return;
    }
    this.voice(N[kind] || N.attack, N.opt);
    if (id === 'shisha') this.noise(0.45, 0.12, 320);   // рык медведя — с утробным гулом
  },

  // ─── прикольные звуки ───
  meow: function () {   // кот Барсик: «МЯУ» — глиссандо вверх и вниз
    if (!this.canSay('meow', 3)) return;
    this.voice([{ f: 460, d: 0.16, s: 760 }, { f: 760, d: 0.22, s: 380 }], { type: 'sine', vol: 0.09, cut: 2400, gap: 0 });
  },
  whistle: function () {   // самовар: свистит паром
    if (!this.canSay('whistle', 7)) return;
    this.voice([{ f: 1750, d: 0.5, s: 2100 }, { f: 2100, d: 0.45, s: 1800 }], { type: 'sine', vol: 0.05, cut: 5000, vib: 9, vibHz: 11 });
  },
  whoosh: function () {   // тапок-самолёт: «вжух»
    this.voice([{ f: 820, d: 0.14, s: 240, v: 0.06 }], { type: 'sine', cut: 2000, gap: 0 });
    this.noise(0.1, 0.05, 1400);
  },
  windNode: null,
  startWind: function () {   // фоновый ветер: петля шума через фильтр
    if (!this.ctx || this.windNode || this.muted) return;
    try {
      var t = this.ctx.currentTime;
      var n = this.ctx.sampleRate * 3;
      var buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
      var d = buf.getChannelData(0);
      for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      var src = this.ctx.createBufferSource();
      src.buffer = buf; src.loop = true;
      var f = this.ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 420;
      var g = this.ctx.createGain(); g.gain.value = 0.045;
      // медленное дыхание ветра
      g.gain.setValueAtTime(0.03, t);
      g.gain.linearRampToValueAtTime(0.07, t + 2.5);
      g.gain.linearRampToValueAtTime(0.03, t + 5);
      src.connect(f); f.connect(g); g.connect(this.master);
      src.start(t);
      this.windNode = { src: src, gain: g };
    } catch (e) { /* тихо */ }
  },
  stopWind: function () {
    if (!this.windNode) return;
    try { this.windNode.src.stop(); } catch (e) { /* уже */ }
    this.windNode = null;
  }
};

// ═════════════════════════════════════════════════════════════ ВВОД ══════

var keys = {};
var touchVec = null;   // {x, y} — джойстик
var touchId = null;
var touchStart = null;

window.addEventListener('keydown', function (e) {
  keys[e.code] = true;
  AU.init();
  if (e.code === 'KeyG' || e.code === 'Space') {
    tryZap();
    if (G.state === 'play') e.preventDefault();
  }
  if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
  if (e.code === 'KeyM') {
    AU.muted = !AU.muted;
    announce(AU.muted ? '🔇 ТИХО' : '🔊 ЗВУК', 900);
  }
  if (e.code === 'Space' && G.state !== 'play') e.preventDefault();
});
window.addEventListener('keyup', function (e) { keys[e.code] = false; });

var joyEl = $$('joy');
var knobEl = $$('joy-knob');

window.addEventListener('pointerdown', function (e) {
  AU.init();
  if (G.state !== 'play') return;
  if (e.target.closest && e.target.closest('.btn, .card')) return;
  if (touchId !== null) return;
  touchId = e.pointerId;
  touchStart = { x: e.clientX, y: e.clientY };
  joyEl.classList.remove('hidden');
  joyEl.style.left = (e.clientX - 60) + 'px';
  joyEl.style.top = (e.clientY - 60) + 'px';
});
window.addEventListener('pointermove', function (e) {
  if (e.pointerId !== touchId || !touchStart) return;
  var dx = e.clientX - touchStart.x;
  var dy = e.clientY - touchStart.y;
  var d = Math.hypot(dx, dy);
  var R = 44;
  if (d > 0.1) {
    var k = Math.min(1, d / R);
    touchVec = { x: dx / d * k, y: dy / d * k };
    knobEl.style.transform =
      'translate(' + (dx / (d || 1) * Math.min(d, R)) + 'px,' +
      (dy / (d || 1) * Math.min(d, R)) + 'px)';
  }
});
function endTouch(e) {
  if (e.pointerId !== touchId) return;
  touchId = null; touchStart = null; touchVec = null;
  knobEl.style.transform = '';
  joyEl.classList.add('hidden');
}
window.addEventListener('pointerup', endTouch);
window.addEventListener('pointercancel', endTouch);

/** Вектор движения игрока: клавиши + тач. */
function moveInput() {
  var x = 0, y = 0;
  if (keys.KeyW || keys.ArrowUp) y -= 1;
  if (keys.KeyS || keys.ArrowDown) y += 1;
  if (keys.KeyA || keys.ArrowLeft) x -= 1;
  if (keys.KeyD || keys.ArrowRight) x += 1;
  if (touchVec) { x += touchVec.x; y += touchVec.y; }
  var d = Math.hypot(x, y);
  if (d > 1) { x /= d; y /= d; }
  return { x: x, y: y };
}

// ═════════════════════════════════════════ КАМЕРА / СОК (GAME FEEL) ══════

var CAM = {
  x: 0, y: 0,
  shake: 0, shakeX: 0, shakeY: 0,

  update: function (dt) {
    if (G.player) {
      this.x = lerp(this.x, G.player.x, 1 - Math.pow(0.001, dt));
      this.y = lerp(this.y, G.player.y, 1 - Math.pow(0.001, dt));
    }
    this.shake = Math.max(0, this.shake - dt * 2.6);
    var s = this.shake * this.shake * 18;
    this.shakeX = rnd(-s, s);
    this.shakeY = rnd(-s, s);
  },
  kick: function (power) { this.shake = Math.min(1.4, this.shake + power); }
};

var hitstop = 0;   // заморозка мира на N секунд (сек при убийстве)

// ════════════════════════════════════════════════════ ЧАСТИЦЫ И ТЕКСТ ════

var particles = [];
var floaters = [];   // всплывающие тексты

var CONF_COLS = ['#ff5b6e', '#ffd76e', '#7bffb0', '#6ecbff', '#ff7ad9', '#b16bff'];

function spawnConfetti(x, y, n, power) {
  for (var i = 0; i < n; i++) {
    var a = rnd(0, TAU);
    var sp = rnd(40, 220) * (power || 1);
    particles.push({
      x: x, y: y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - rnd(20, 90),
      life: rnd(0.4, 0.9), t: 0,
      col: pick(CONF_COLS),
      size: rnd(3, 6),
      grav: 420,
      kind: 'confetti'
    });
  }
}

function spawnSpark(x, y, n, col) {
  for (var i = 0; i < n; i++) {
    var a = rnd(0, TAU);
    var sp = rnd(60, 320);
    particles.push({
      x: x, y: y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: rnd(0.15, 0.4), t: 0,
      col: col || '#fff',
      size: rnd(1.5, 3.5),
      grav: 0,
      kind: 'spark'
    });
  }
}

function spawnSnowPuff(x, y, n) {
  for (var i = 0; i < n; i++) {
    particles.push({
      x: x + rnd(-8, 8), y: y + rnd(-6, 6),
      vx: rnd(-40, 40), vy: rnd(-70, -10),
      life: rnd(0.3, 0.7), t: 0,
      col: '#dfe8f2',
      size: rnd(2, 5),
      grav: 160,
      kind: 'snow'
    });
  }
}

function floatText(x, y, txt, col, size, life) {
  floaters.push({
    x: x + rnd(-8, 8), y: y, txt: txt,
    col: col || '#fff', size: size || 15,
    t: 0, life: life || 0.85, vy: -66
  });
}

/** Дед подал голос: блип-речь + фраза над головой. */

function updateParticles(dt) {
  for (var i = particles.length - 1; i >= 0; i--) {
    var p = particles[i];
    p.t += dt;
    if (p.t >= p.life) { particles.splice(i, 1); continue; }
    // статичные виды (arc/ring/shock) без скорости — не трогаем координаты
    p.vy += (p.grav || 0) * dt;
    p.x += (p.vx || 0) * dt;
    p.y += (p.vy || 0) * dt;
  }
  for (var j = floaters.length - 1; j >= 0; j--) {
    var f = floaters[j];
    f.t += dt;
    if (f.t >= f.life) { floaters.splice(j, 1); continue; }
    f.y += f.vy * dt;
    f.vy *= (1 - 2.4 * dt);
  }
}

function drawParticles() {
  for (var i = 0; i < particles.length; i++) {
    var p = particles[i];
    var a = 1 - p.t / p.life;
    if (p.kind === 'confetti') {
      ctx.globalAlpha = a;
      ctx.fillStyle = p.col;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.t * 9);
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    } else if (p.kind === 'arc') {
      // ЛОДОШКА: след удара — клин удара + яркий росчерк кромки
      var aw = a;
      ctx.globalAlpha = 0.34 * aw;
      var agrd = ctx.createRadialGradient(p.x, p.y, p.r * 0.3, p.x, p.y, p.r);
      agrd.addColorStop(0, 'rgba(255,255,255,0)');
      agrd.addColorStop(0.7, p.col);
      agrd.addColorStop(1, 'rgba(255,255,255,' + (0.5 * aw) + ')');
      ctx.fillStyle = agrd;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.arc(p.x, p.y, p.r * (0.55 + 0.45 * (1 - aw)), p.ang - p.arc, p.ang + p.arc);
      ctx.closePath();
      ctx.fill();
      // яркая кромка росчерка
      ctx.globalAlpha = aw;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3.4 * aw + 0.6;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (0.55 + 0.45 * (1 - aw)), p.ang - p.arc * 0.92, p.ang + p.arc * 0.92);
      ctx.stroke();
    } else if (p.kind === 'ring' || p.kind === 'shock') {
      // РАСХОДЯЩЕЕСЯ КОЛЬЦО: балалайка/вантуз/бомба (ring), шокволны (shock)
      var rr = lerp(p.r0, p.r1, 1 - a * a);
      var thick = p.kind === 'shock' ? 10 * a + 2 : 5 * a + 1.2;
      ctx.globalAlpha = (p.kind === 'shock' ? 0.85 : 0.95) * a;
      ctx.strokeStyle = p.col;
      ctx.lineWidth = thick;
      ctx.beginPath();
      ctx.arc(p.x, p.y, rr, 0, TAU);
      ctx.stroke();
      if (p.kind === 'shock') {
        // вторая волна — читается как удар оземь
        ctx.globalAlpha = 0.4 * a;
        ctx.lineWidth = thick * 0.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, rr * 0.82, 0, TAU);
        ctx.stroke();
      }
    } else if (p.kind === 'steam') {
      // ПАР САМОВАРА: тает и поднимается
      ctx.globalAlpha = 0.5 * a;
      ctx.fillStyle = p.col;
      ctx.beginPath();
      ctx.arc(p.x, p.y - p.t * 26, (p.size || 5) * (1.4 - 0.4 * a), 0, TAU);
      ctx.fill();
    } else {
      ctx.globalAlpha = a;
      ctx.fillStyle = p.col;
      ctx.beginPath();
      ctx.arc(p.x, p.y, (p.size || 3) * a + 0.5, 0, TAU);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  // тексты
  ctx.textAlign = 'center';
  for (var j = 0; j < floaters.length; j++) {
    var f = floaters[j];
    var fa = 1 - f.t / f.life;
    ctx.globalAlpha = fa;
    ctx.font = 'bold ' + f.size + 'px "Trebuchet MS", sans-serif';
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.lineWidth = 3;
    ctx.strokeText(f.txt, f.x, f.y);
    ctx.fillStyle = f.col;
    ctx.fillText(f.txt, f.x, f.y);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
}

// ═════════════════════════════════════════ МИР: ЗЕМЛЯ, СНЕГ, ПРОПСЫ ══════

// Падающий снег — фоновая атмосфера, живёт в экранных координатах.
var snowFlakes = [];
(function initSnow() {
  for (var i = 0; i < 90; i++) {
    snowFlakes.push({
      x: rnd(0, VW), y: rnd(0, VH),
      sp: rnd(18, 55), drift: rnd(-14, 14),
      size: rnd(1, 2.6), a: rnd(0.25, 0.7)
    });
  }
})();

function updateSnow(dt) {
  for (var i = 0; i < snowFlakes.length; i++) {
    var s = snowFlakes[i];
    s.y += s.sp * dt;
    s.x += s.drift * dt;
    if (s.y > VH + 4) { s.y = -4; s.x = rnd(0, VW); }
    if (s.x < -4) s.x = VW + 4;
    if (s.x > VW + 4) s.x = -4;
  }
}

/** Ёлки/домики/фонари: детерминированные по сетке 220px, декоративные. */
function drawGround() {
  // база — тёмный снег
  var grd = ctx.createLinearGradient(0, 0, 0, VH);
  grd.addColorStop(0, '#101525');
  grd.addColorStop(1, '#0c1020');
  ctx.fillStyle = grd;
  ctx.fillRect(-VW, -VH, VW * 3, VH * 3);

  var cell = 220;
  var x0 = Math.floor((CAM.x - VW / SCALE) / cell) - 1;
  var x1 = Math.ceil((CAM.x + VW / SCALE) / cell) + 1;
  var y0 = Math.floor((CAM.y - VH / SCALE) / cell) - 1;
  var y1 = Math.ceil((CAM.y + VH / SCALE) / cell) + 1;

  // пятна снега
  ctx.fillStyle = 'rgba(223, 232, 242, 0.05)';
  for (var gy = y0; gy <= y1; gy++) {
    for (var gx = x0; gx <= x1; gx++) {
      var h = hash2(gx, gy);
      if (h < 0.45) {
        var px = gx * cell + hash2(gx + 7, gy) * cell;
        var py = gy * cell + hash2(gx, gy + 7) * cell;
        var r = 40 + h * 70;
        ctx.beginPath();
        ctx.ellipse(px, py, r, r * 0.55, 0, 0, TAU);
        ctx.fill();
      }
    }
  }

  // пропсы
  for (var y = y0; y <= y1; y++) {
    for (var x = x0; x <= x1; x++) {
      var hp = hash2(x * 3 + 11, y * 5 + 3);
      var px = x * cell + hash2(x, y * 2) * cell;
      var py = y * cell + hash2(x * 2, y) * cell;
      if (hp < 0.16) drawSpruce(px, py, 0.7 + hash2(x, y) * 0.6);
      else if (hp < 0.19) drawHouse(px, py, hash2(x + 1, y));
      else if (hp < 0.215) drawLamp(px, py);
      else if (hp < 0.225) drawSnowman(px, py);
      else if (hp < 0.26) drawBush(px, py);
    }
  }
}

function drawSpruce(x, y, s) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  // тень
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(0, 6, 26, 9, 0, 0, TAU);
  ctx.fill();
  // ствол
  ctx.fillStyle = '#4a3527';
  ctx.fillRect(-3, -12, 6, 20);
  // ярусы
  var tiers = [
    { y: -14, w: 30, h: 24 },
    { y: -30, w: 24, h: 22 },
    { y: -45, w: 17, h: 20 }
  ];
  for (var i = 0; i < tiers.length; i++) {
    var t = tiers[i];
    ctx.fillStyle = i === 0 ? '#1d4030' : (i === 1 ? '#235039' : '#2a6042');
    ctx.beginPath();
    ctx.moveTo(0, t.y - t.h);
    ctx.lineTo(t.w, t.y);
    ctx.lineTo(-t.w, t.y);
    ctx.closePath();
    ctx.fill();
    // снежные шапки
    ctx.fillStyle = 'rgba(223, 232, 242, 0.85)';
    ctx.beginPath();
    ctx.moveTo(0, t.y - t.h);
    ctx.lineTo(t.w * 0.45, t.y - t.h * 0.45);
    ctx.lineTo(-t.w * 0.45, t.y - t.h * 0.45);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawHouse(x, y, v) {
  ctx.save();
  ctx.translate(x, y);
  var w = 70 + v * 30, h = 44 + v * 16;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(0, h * 0.55, w * 0.65, 12, 0, 0, TAU);
  ctx.fill();
  // стены
  ctx.fillStyle = '#5b4230';
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.fillStyle = '#4a3526';
  ctx.fillRect(-w / 2, -h / 2 + h * 0.62, w, h * 0.38);
  // крыша со снегом
  ctx.fillStyle = '#7a2f2f';
  ctx.beginPath();
  ctx.moveTo(-w / 2 - 8, -h / 2);
  ctx.lineTo(0, -h / 2 - 26);
  ctx.lineTo(w / 2 + 8, -h / 2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#dfe8f2';
  ctx.beginPath();
  ctx.moveTo(-w / 2 - 8, -h / 2);
  ctx.lineTo(0, -h / 2 - 26);
  ctx.lineTo(w / 2 + 8, -h / 2);
  ctx.lineTo(w / 2 + 2, -h / 2 + 7);
  ctx.lineTo(0, -h / 2 - 16);
  ctx.lineTo(-w / 2 - 2, -h / 2 + 7);
  ctx.closePath();
  ctx.fill();
  // тёплое окно — глюк деда: в мёртвом посёлке свет горит
  ctx.fillStyle = '#ffd76e';
  ctx.fillRect(-8, -h * 0.28, 16, 13);
  ctx.fillStyle = 'rgba(255, 215, 110, 0.25)';
  ctx.beginPath();
  ctx.arc(0, -h * 0.2, 26, 0, TAU);
  ctx.fill();
  // дверь
  ctx.fillStyle = '#33261b';
  ctx.fillRect(w * 0.18, -h * 0.1, 13, h * 0.48);
  ctx.restore();
}

function drawLamp(x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(0, 3, 12, 5, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#3a4258';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -58);
  ctx.stroke();
  ctx.fillStyle = '#ffd76e';
  ctx.beginPath();
  ctx.arc(0, -62, 6, 0, TAU);
  ctx.fill();
  var g = ctx.createRadialGradient(0, -62, 2, 0, -62, 42);
  g.addColorStop(0, 'rgba(255, 215, 110, 0.3)');
  g.addColorStop(1, 'rgba(255, 215, 110, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, -62, 42, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawSnowman(x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(0, 2, 16, 6, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#e8eef6';
  ctx.beginPath(); ctx.arc(0, -8, 13, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(0, -26, 9, 0, TAU); ctx.fill();
  // морковка и глаза — мультяшный снеговик смотрит на деда
  ctx.fillStyle = '#ff8c42';
  ctx.beginPath();
  ctx.moveTo(0, -27); ctx.lineTo(10, -25); ctx.lineTo(0, -23);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#1a1a2e';
  ctx.beginPath(); ctx.arc(-3, -28, 1.4, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(3, -28, 1.4, 0, TAU); ctx.fill();
  ctx.restore();
}

function drawBush(x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#24483a';
  ctx.beginPath(); ctx.ellipse(0, 0, 16, 11, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(223, 232, 242, 0.8)';
  ctx.beginPath(); ctx.ellipse(0, -5, 13, 6, 0, 0, TAU); ctx.fill();
  ctx.restore();
}

function drawSnowfall() {
  for (var i = 0; i < snowFlakes.length; i++) {
    var s = snowFlakes[i];
    ctx.globalAlpha = s.a;
    ctx.fillStyle = '#dfe8f2';
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.size, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** Полярное сияние: медленные зелёно-фиолетовые занавеси над лесом. */
function drawAurora() {
  if (G.dawn) return;   // перед рассветом сияние гаснет
  var t = performance.now() / 1000;
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (var band = 0; band < 3; band++) {
    var baseY = canvas.height * (0.10 + band * 0.07);
    var col = band === 0 ? '58, 214, 140' : (band === 1 ? '110, 150, 255' : '170, 100, 255');
    var g = ctx.createLinearGradient(0, baseY - 60, 0, baseY + 130);
    var a = 0.16 + Math.sin(t * 0.35 + band * 1.7) * 0.07;
    g.addColorStop(0, 'rgba(' + col + ', 0)');
    g.addColorStop(0.4, 'rgba(' + col + ', ' + a + ')');
    g.addColorStop(1, 'rgba(' + col + ', 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, baseY + 130);
    // волнистая нижняя кромка занавеса
    for (var x = 0; x <= canvas.width; x += 64) {
      var y = baseY + Math.sin(x * 0.004 + t * (0.3 + band * 0.12)) * 26
            + Math.sin(x * 0.011 + t * 0.7) * 12;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(canvas.width, baseY + 130);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

// ══════════════════════════════════════════════════════ СОСТОЯНИЕ ═══════

var G = {
  state: 'menu',       // menu | help | play | levelup | pause | death | win | achs
  mode: 'classic',     // classic (10 мин до рассвета) | endless (бесконечная ночь)
  t: 0,                // время забега, сек
  player: null,
  enemies: [],
  bullets: [],         // снаряды (деда и врагов)
  pickups: [],
  kills: 0,
  level: 1,
  xp: 0,
  xpNext: 8,
  trip: 0,             // 0..100 — ПРИХОД
  zapT: 0,             // >0 — идёт грибной залп (радуга)
  zapFlash: 0,
  zapCount: 0,         // залпов за ночь (ачивка «Три залпа»)
  bossIdx: 0,
  bossAlive: null,
  runSeq: 0,           // номер забега: волны старого забега не переносятся в новый
  nextBossT: 0,        // время следующего босса (бесконечка: каждые 150с)
  lastHitT: 0,         // когда деда последний раз били (ачивка «Неприкасаемый»)
  lowHpSaid: false,    // реплика про рваный тулуп — раз за забег
  radioOn: false, radioT: 0, radioIdx: 0,
  dawn: false,         // идёт рассвет
  dawnT: 0,
  siege: false,        // финальная осада перед рассветом
  won: false,
  waveT: 0,            // таймер миниволн
  spawnAcc: 0,
  stats: { dmg: 0, mushrooms: 0, gifts: 0, maxCombo: 0 },
  levelQueue: 0        // сколько левел-апов ждут выбора карточек
};

var BOSS_TIMES = [180, 390, 540];    // 3:00, 6:30, 9:00 (классика)
var ENDLESS_BOSS_EVERY = 150;        // бесконечка: старший каждые 2.5 мин
var SIEGE_TIME = 545;                // после третьего старшего — осада до рассвета
var RUN_TIME = 600;                  // 10:00 — РАССВЕТ = победа (классика)

function newPlayer() {
  return {
    x: 0, y: 0, r: 15,
    hp: 100, maxHp: 100,
    speed: 235,
    face: 1,
    walkT: 0,
    iframe: 0,
    hitFx: 0,
    moveA: 0,           // направление прицела = направление последнего хода
    aimT: 0,            // сколько секунд дед ещё «держит» направление
    // оружие: id -> {lv, cd}   (lv 0 = не куплено)
    weapons: { palm: { lv: 1, cd: 0 } },
    // пассивки: id -> lv
    passives: {},
    evolved: {},        // id -> true после эволюции
    catOrb: 0          // угол орбиты кота
  };
}

// ---- множители от пассивок ----
function pasLv(id) { return G.player && G.player.passives[id] ? G.player.passives[id] : 0; }
function dmgMul() { return 1 + 0.25 * pasLv('dmg'); }
function speedMul() { return 1 + 0.13 * pasLv('speed'); }
function cdMul() { return Math.max(0.4, 1 - 0.12 * pasLv('cd')); }
function magnetR() { return 70 * (1 + 0.45 * pasLv('magnet')); }
function armorMul() { return Math.max(0.5, 1 - 0.1 * pasLv('body')); }
function tripGainMul() { return 1 + 0.6 * pasLv('shroom'); }
function regenRate() { return 0.5 * pasLv('hp'); }

// ══════════════════════════════════════════════════ ОРУЖИЕ ДЕДА ═════════
// Всё бьёт САМО (принцип Vampire Survivors): дед только ходит.

var WEAPONS = {
  palm: {
    name: 'Лодошка', ico: '🖐️', max: 5, kind: 'weapon',
    desc: 'Бьёт туда, куда дед идёт. Наводись движением!',
    lvDesc: ['+урон', '+размах', '+дальность', '+урон', 'МАКС: основа эволюции'],
    pair: 'speed'
  },
  slipper: {
    name: 'Дубина-Бумеранг', ico: '🏏', max: 5, kind: 'weapon',
    desc: 'Кряжистая дубина летит вперёд и возвращается в руку, снося всех на пути.',
    lvDesc: ['+урон', '+вторая дубина', '+дальность', '+урон', 'МАКС: основа эволюции'],
    pair: 'magnet'
  },
  joint: {
    name: 'Лучина-Веер', ico: '🔥', max: 5, kind: 'weapon',
    desc: 'Горящие лучины веером в глюков. Вспышка — и снег в искрах.',
    lvDesc: ['+лучины', '+вспышка', '+дальность', '+лучины', 'МАКС: основа эволюции'],
    pair: 'shroom'
  },
  cat: {
    name: 'Кот Барсик', ico: '🐱', max: 5, kind: 'weapon',
    desc: 'Верный кот кружит вокруг деда и царапает наглых.',
    lvDesc: ['+царапки', '+радиус', '+второй кот', '+урон', 'МАКС: основа эволюции'],
    pair: 'body'
  },
  aura: {
    name: 'Грибная Аура', ico: '🍄', max: 5, kind: 'weapon',
    desc: 'Споры вокруг деда: кто подойдёт — тот заперхал.',
    lvDesc: ['+радиус', '+урон', '+радиус', '+урон', 'МАКС: основа эволюции'],
    pair: 'hp'
  },
  plunger: {
    name: 'Вантуз', ico: '🪠', max: 5, kind: 'weapon',
    desc: 'ХЛОП! Присасывает ближних мультяшек и бьёт разом.',
    lvDesc: ['+радиус', '+урон', '+присос', '+радиус', 'МАКС: основа эволюции'],
    pair: 'cd'
  },
  // v3.0 АРСЕНАЛ
  tapok: {
    name: 'Тапок-Самолёт', ico: '🥿', max: 5, kind: 'weapon',
    desc: 'Домашний тапок сам находит наглеца и гоняет его по сугробам.',
    lvDesc: ['+урон', '+второй тапок', '+скорость', '+урон', 'МАКС: основа эволюции'],
    pair: 'dmg'
  },
  balalaika: {
    name: 'Балалайка', ico: '🪕', max: 5, kind: 'weapon',
    desc: 'Три струны — три удара звуком. Волны трясут снег кругом.',
    lvDesc: ['+волна', '+радиус', '+чаще', '+урон', 'МАКС: основа эволюции'],
    pair: 'cd'
  },
  axe: {
    name: 'Топор Деда', ico: '🪓', max: 5, kind: 'weapon',
    desc: 'Тяжёлый топор кружит вокруг деда, как маятник в сенях.',
    lvDesc: ['+урон', '+радиус', '+второй топор', '+урон', 'МАКС: основа эволюции'],
    pair: 'body'
  },
  samovar: {
    name: 'Самовар', ico: '🫖', max: 5, kind: 'weapon',
    desc: 'Шипит паром куда смотрит дед. Кипяток — аргумент деда.',
    lvDesc: ['+пар', '+длина', '+урон', '+шире', 'МАКС: основа эволюции'],
    pair: 'hp'
  },
  klushka: {
    name: 'Клюшка', ico: '🏒', max: 5, kind: 'weapon',
    desc: 'Вертушка деда: клюшка метёт по кругу, расчищая лед.',
    lvDesc: ['+урон', '+быстрее', '+дальше', '+урон', 'МАКС: основа эволюции'],
    pair: 'speed'
  },
  skipidar: {
    name: 'Скипидар', ico: '🧪', max: 5, kind: 'weapon',
    desc: 'Склянка летит в толпу и загорается лужей. Пахнет деревней.',
    lvDesc: ['+лужа', '+урон', '+больше', '+дольше', 'МАКС: основа эволюции'],
    pair: 'shroom'
  }
};

var PASSIVES = {
  speed: { name: 'Скорость Ежа', ico: '🦔', max: 5, kind: 'passive',
    desc: 'Валенки не стояли: дед ходит быстрее.' },
  hp:    { name: 'Крепкий Организм', ico: '🫀', max: 5, kind: 'passive',
    desc: '+30 макс. ХП и медленный регенератор.' },
  dmg:   { name: 'Лодошка-Мастер', ico: '💪', max: 5, kind: 'passive',
    desc: 'Всё оружие деда бьёт больнее.' },
  cd:    { name: 'Вторая Лодошка', ico: '✋', max: 5, kind: 'passive',
    desc: 'Оружие срабатывает чаще.' },
  magnet:{ name: 'Магнит-Брюхо', ico: '🧲', max: 5, kind: 'passive',
    desc: 'Грибы сами прыгают деду в рот.' },
  body:  { name: 'Плотное Тело', ico: '🧱', max: 5, kind: 'passive',
    desc: 'Дед получает меньше урона и отталкивает наглых.' },
  shroom:{ name: 'Грибная Сила', ico: '✨', max: 5, kind: 'passive',
    desc: 'Приход растёт быстрее, залп сильнее.' }
};

// ЭВОЛЮЦИИ: макс. оружие + макс. пассивка-пара → сверхоружие.
var EVOS = {
  palm: {
    name: 'РАСПЛЕВЁШКА', ico: '🙌', kind: 'evo', req: 'speed',
    desc: 'Две лодошки в две стороны. Отступающих нет.'
  },
  slipper: {
    name: 'ДУБИНА-ГРОМ', ico: '🌩️', kind: 'evo', req: 'magnet',
    desc: 'Дубины сами находят жертв и бьют как гром.'
  },
  joint: {
    name: 'ПОЖАР ЛУЧИН', ico: '☄️', kind: 'evo', req: 'shroom',
    desc: 'Восемь лучин за залп. Ночь в огне.'
  },
  cat: {
    name: 'БАРСИК-ЛЕГЕНДА', ico: '😼', kind: 'evo', req: 'body',
    desc: 'Три кота, когти как серпы. Мурчит от ярости.'
  },
  aura: {
    name: 'СПОРОВОЕ ПОЛЕ', ico: '🌀', kind: 'evo', req: 'hp',
    desc: 'Аура вдвое шире и понемногу лечит деда.'
  },
  plunger: {
    name: 'ЧЁРНАЯ ДЫРА', ico: '🕳️', kind: 'evo', req: 'cd',
    desc: 'Вантуз хлопает чаще и втягивает всех в одну точку.'
  },
  tapok: {
    name: 'ТАПОК-ГОСПОДЬ', ico: '🕊️', kind: 'evo', req: 'dmg',
    desc: 'Рой тапков карает всякого, кто бежит на деда.'
  },
  balalaika: {
    name: 'КОВАРНАЯ БАЛАЛАЙКА', ico: '🎶', kind: 'evo', req: 'cd',
    desc: 'Волны чаще, шире и отбрасывают лес обратно.'
  },
  axe: {
    name: 'СЕКИРА-ВРАЩЕЛЬ', ico: '⚔️', kind: 'evo', req: 'body',
    desc: 'Два топора по широкой орбите. Веер из стали.'
  },
  samovar: {
    name: 'ГЕЙЗЕР-САМОВАР', ico: '♨️', kind: 'evo', req: 'hp',
    desc: 'Пар бьёт во все четыре стороны и обжигает насмерть.'
  },
  klushka: {
    name: 'КЛЮШКА-ВЕРТУН', ico: '💫', kind: 'evo', req: 'speed',
    desc: 'Две клюшки молотят без остановки. Лёд треснул.'
  },
  skipidar: {
    name: 'КИПЯЩИЙ СКИПИДАР', ico: '🔥', kind: 'evo', req: 'shroom',
    desc: 'Лужи огромные, горят вдвое дольше. Деревня пахнет победой.'
  }
};

function nearestEnemy(x, y, maxD) {
  var best = null, bd = (maxD || 900) * (maxD || 900);
  var list = G.enemies;
  for (var i = 0; i < list.length; i++) {
    var e = list[i];
    if (e.dead) continue;
    var d = dist2(x, y, e.x, e.y);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

// ---- выстрелы/атаки оружия ----

function fireWeapons(dt) {
  var p = G.player;
  var mult = p.evolved.palm ? 0.45 : 1;   // РАСПЛЕВЁШКА: вдвое чаще
  var baseCd = 0.85 * cdMul() * mult;

  // ЛОДОШКА / РАСПЛЕВЁШКА — бьёт ПО НАПРАВЛЕНИЮ ХОДА (наводка движением!)
  var palm = p.weapons.palm;
  palm.cd -= dt;
  if (palm.cd <= 0) {
    var tgt = nearestEnemy(p.x, p.y, 130);
    // куда бить: куда дед идёт (или недавно шёл); стоя на месте — по ближайшему
    var ang = null;
    if (p.aimT > 0) ang = p.moveA;
    else if (tgt) ang = angTo(p.x, p.y, tgt.x, tgt.y);
    if (ang !== null) {
      palm.cd = baseCd;
      palmSlap(ang);
      if (p.evolved.palm) {
        palmSlap(ang + Math.PI);  // вторая рука
      }
      AU.slap();
    }
  }

  // ТАПОК-БУМЕРАНГ
  if (p.weapons.slipper) {
    var sl = p.weapons.slipper;
    sl.cd -= dt;
    if (sl.cd <= 0) {
      var st = nearestEnemy(p.x, p.y, 500);
      if (st) {
        sl.cd = 2.4 * cdMul();
        AU.whoosh();   // тапок полетел — «вжух»
        var a = angTo(p.x, p.y, st.x, st.y);
        var n = (sl.lv >= 2 || p.evolved.slipper) ? 2 : 1;
        var dmg = (16 + 8 * sl.lv) * dmgMul() * (p.evolved.slipper ? 1.6 : 1);
        for (var i = 0; i < n; i++) {
          G.bullets.push({
            kind: 'slipper', x: p.x, y: p.y,
            vx: Math.cos(a + (i ? 0.35 : -0.35)) * 420,
            vy: Math.sin(a + (i ? 0.35 : -0.35)) * 420,
            r: 10, dmg: dmg, pierce: 999, t: 0, life: 1.6,
            out: true, hitSet: {}
          });
        }
      }
    }
  }

  // КОСЯК-ВЕЕР / ШТОРМ
  if (p.weapons.joint) {
    var jt = p.weapons.joint;
    jt.cd -= dt;
    if (jt.cd <= 0) {
      var jtgt = nearestEnemy(p.x, p.y, 460);
      if (jtgt) {
        jt.cd = 3.1 * cdMul();
        var ja = angTo(p.x, p.y, jtgt.x, jtgt.y);
        var jn = p.evolved.joint ? 8 : (jt.lv >= 4 ? 5 : (jt.lv >= 1 ? 3 : 2));
        var jdmg = (18 + 7 * jt.lv) * dmgMul() * (p.evolved.joint ? 1.5 : 1);
        var jrad = (52 + 9 * jt.lv) * (p.evolved.joint ? 1.5 : 1);
        for (var k = 0; k < jn; k++) {
          var spread = (k - (jn - 1) / 2) * 0.22;
          G.bullets.push({
            kind: 'joint', x: p.x, y: p.y - 10,
            vx: Math.cos(ja + spread) * 380,
            vy: Math.sin(ja + spread) * 380,
            r: 7, dmg: jdmg, boom: jrad, pierce: 0, t: 0, life: 1.3
          });
        }
      }
    }
  }

  // КОТ БАРСИК — орбита, контактный урон
  if (p.weapons.cat) {
    var cw = p.weapons.cat;
    p.catOrb += dt * (2.2 + 0.25 * cw.lv);
    var cr = 74 + 12 * cw.lv;
    var cdmg = (8 + 5 * cw.lv) * dmgMul();
    var cats = cw.lv >= 3 ? 2 : 1;
    for (var ci = 0; ci < cats; ci++) {
      var ca = p.catOrb + ci * Math.PI;
      var cx = p.x + Math.cos(ca) * cr;
      var cy = p.y + Math.sin(ca) * cr;
      for (var ei = 0; ei < G.enemies.length; ei++) {
        var en = G.enemies[ei];
        if (en.dead) continue;
        en.catCd = en.catCd || 0;
        if (en.catCd > 0) continue;
        if (dist2(cx, cy, en.x, en.y) < (24 + en.r) * (24 + en.r)) {
          en.catCd = 0.45;
          hurtEnemy(en, cdmg, cx, cy, 130);
          AU.meow();   // Барсик работает — и говорит об этом
        }
      }
    }
  }

  // ГРИБНАЯ АУРА — споровое кольцо
  if (p.weapons.aura) {
    var aw = p.weapons.aura;
    aw.cd = (aw.cd || 0) - dt;
    if (aw.cd <= 0) {
      aw.cd = 0.5;
      var ar = 92 + 16 * aw.lv;
      var adm = (5 + 4 * aw.lv) * dmgMul();
      for (var ai = 0; ai < G.enemies.length; ai++) {
        var ae = G.enemies[ai];
        if (ae.dead) continue;
        if (dist2(p.x, p.y, ae.x, ae.y) < (ar + ae.r) * (ar + ae.r)) {
          hurtEnemy(ae, adm, p.x, p.y, 40);
        }
      }
    }
  }

  // ВАНТУЗ — ХЛОП присасывания
  if (p.weapons.plunger) {
    var pw = p.weapons.plunger;
    pw.cd -= dt;
    if (pw.cd <= 0) {
      var pt = nearestEnemy(p.x, p.y, 240);
      if (pt) {
        pw.cd = 3.6 * cdMul() * (p.evolved.plunger ? 0.5 : 1);
        var pr = 130 + 18 * pw.lv + (p.evolved.plunger ? 60 : 0);
        var pdm = (10 + 8 * pw.lv) * dmgMul();
        var pull = 160 + 45 * pw.lv + (p.evolved.plunger ? 220 : 0);
        // ХЛОП-волна
        particles.push({ kind: 'ring', x: p.x, y: p.y, t: 0, life: 0.35, r0: 20, r1: pr, col: '#6ecbff' });
        AU.pop();
        for (var pi = 0; pi < G.enemies.length; pi++) {
          var pe = G.enemies[pi];
          if (pe.dead) continue;
          if (dist2(p.x, p.y, pe.x, pe.y) < (pr + pe.r) * (pr + pe.r)) {
            hurtEnemy(pe, pdm, p.x, p.y, 0);
            var pa = angTo(p.x, p.y, pe.x, pe.y);
            var pk = pe.boss ? 0.25 : 1;
            pe.vx -= Math.cos(pa) * pull * pk;
            pe.vy -= Math.sin(pa) * pull * pk;
          }
        }
      }
    }
  }

  // v3.0 ──────────────────────────────────────────────────────────────────

  // ТАПОК-САМОЛЁТ: самонаводящийся снаряд, кружит и ищет жертву
  if (p.weapons.tapok) {
    var tp = p.weapons.tapok;
    tp.cd -= dt;
    if (tp.cd <= 0) {
      var tt = nearestEnemy(p.x, p.y, 700);
      if (tt) {
        tp.cd = 1.9 * cdMul();
        var tn = p.evolved.tapok ? 4 : (tp.lv >= 2 ? 2 : 1);
        var tdm = (14 + 7 * tp.lv) * dmgMul() * (p.evolved.tapok ? 1.4 : 1);
        for (var ti = 0; ti < tn; ti++) {
          var ta = angTo(p.x, p.y, tt.x, tt.y) + rnd(-0.5, 0.5);
          G.bullets.push({
            kind: 'tapok', x: p.x, y: p.y - 8,
            vx: Math.cos(ta) * 340, vy: Math.sin(ta) * 340,
            r: 9, dmg: tdm, pierce: 999, t: 0, life: 2.6,
            homing: true, hitSet: {}
          });
        }
        AU.slap();
      }
    }
  }

  // БАЛАЛАЙКА: расходящиеся кольца звука от деда
  if (p.weapons.balalaika) {
    var bl = p.weapons.balalaika;
    bl.cd = (bl.cd || 0) - dt;
    if (bl.cd <= 0) {
      bl.cd = 2.6 * cdMul() * (p.evolved.balalaika ? 0.62 : 1) * (bl.lv >= 3 ? 0.8 : 1);
      var bn = p.evolved.balalaika ? 2 : 1;
      for (var bi = 0; bi < bn; bi++) {
        (function (delay) {
          setTimeout(function () {
            if (G.state !== 'play') return;
            var p2 = G.player;
            var br = 110 + 26 * bl.lv;
            var brd = (12 + 6 * bl.lv) * dmgMul() * (p2.evolved.balalaika ? 1.5 : 1);
            particles.push({ kind: 'ring', x: p2.x, y: p2.y, t: 0, life: 0.45, r0: 26, r1: br, col: '#ffd76e' });
            AU.pop();
            for (var qi = 0; qi < G.enemies.length; qi++) {
              var qe = G.enemies[qi];
              if (qe.dead) continue;
              var qd = dist(p2.x, p2.y, qe.x, qe.y);
              if (qd < br + qe.r && qd > br * 0.35) {
                hurtEnemy(qe, brd, p2.x, p2.y, p2.evolved.balalaika ? 260 : 120);
              }
            }
          }, delay);
        })(bi * 240);
      }
    }
  }

  // ТОПОР: тяжёлая орбита (как кот, но медленнее и больнее)
  if (p.weapons.axe) {
    var ax = p.weapons.axe;
    p.axeOrb = (p.axeOrb || 0) + dt * (1.6 + 0.22 * ax.lv);
    var axr = 100 + 16 * ax.lv + (p.evolved.axe ? 34 : 0);
    var axdmg = (16 + 9 * ax.lv) * dmgMul() * (p.evolved.axe ? 1.5 : 1);
    var axes = (ax.lv >= 3 ? 2 : 1) + (p.evolved.axe ? 1 : 0);
    for (var xi = 0; xi < axes; xi++) {
      var xa = p.axeOrb + xi * (TAU / axes);
      var xx = p.x + Math.cos(xa) * axr;
      var xy = p.y + Math.sin(xa) * axr;
      for (var ye = 0; ye < G.enemies.length; ye++) {
        var yen = G.enemies[ye];
        if (yen.dead) continue;
        yen.axeCd = yen.axeCd || 0;
        if (yen.axeCd > 0) continue;
        if (dist2(xx, xy, yen.x, yen.y) < (28 + yen.r) * (28 + yen.r)) {
          yen.axeCd = 0.5;
          hurtEnemy(yen, axdmg, xx, xy, 220);
        }
      }
    }
  }

  // САМОВАР: конус пара в сторону хода деда
  if (p.weapons.samovar) {
    var sm = p.weapons.samovar;
    sm.cd = (sm.cd || 0) - dt;
    if (sm.cd <= 0) {
      sm.cd = 0.22;
      if (Math.random() < 0.04) AU.whistle();   // самовар изредка свистит паром
      var smA = p.aimT > 0 ? p.moveA : (p.face > 0 ? 0 : Math.PI);
      var smLen = 120 + 26 * sm.lv + (p.evolved.samovar ? 60 : 0);
      var smW = 34 + 7 * sm.lv;
      var smdmg = (4 + 2.6 * sm.lv) * dmgMul() * (p.evolved.samovar ? 1.3 : 1);
      // парок
      if (Math.random() < 0.7) {
        particles.push({
          kind: 'steam', x: p.x + Math.cos(smA) * rnd(20, smLen), y: p.y + Math.sin(smA) * rnd(20, smLen),
          vx: Math.cos(smA) * 60 + rnd(-20, 20), vy: Math.sin(smA) * 60 - 26,
          life: rnd(0.3, 0.6), t: 0, col: 'rgba(223,232,242,0.8)', size: rnd(3, 7), grav: -30
        });
      }
      var smDirs = p.evolved.samovar ? [smA, smA + Math.PI / 2, smA - Math.PI / 2, smA + Math.PI] : [smA];
      for (var di = 0; di < smDirs.length; di++) {
        var dA = smDirs[di];
        for (var dj = 0; dj < G.enemies.length; dj++) {
          var de = G.enemies[dj];
          if (de.dead) continue;
          var ddx = de.x - p.x, ddy = de.y - p.y;
          var dproj = ddx * Math.cos(dA) + ddy * Math.sin(dA);
          var dperp = Math.abs(-ddx * Math.sin(dA) + ddy * Math.cos(dA));
          if (dproj > 0 && dproj < smLen + de.r && dperp < smW + de.r * 0.5) {
            hurtEnemy(de, smdmg, p.x, p.y, 20);
          }
        }
      }
    }
  }

  // КЛЮШКА: вращающийся удар-луч вокруг деда
  if (p.weapons.klushka) {
    var kl = p.weapons.klushka;
    p.klushA = (p.klushA || 0) + dt * (2.6 + 0.35 * kl.lv) * (p.evolved.klushka ? 1.5 : 1);
    var klR = 96 + 14 * kl.lv + (p.evolved.klushka ? 30 : 0);
    var kldmg = (10 + 6 * kl.lv) * dmgMul() * (p.evolved.klushka ? 1.5 : 1);
    var klN = p.evolved.klushka ? 2 : 1;
    for (var ki = 0; ki < klN; ki++) {
      var kA = p.klushA + ki * Math.PI;
      for (var kj = 0; kj < G.enemies.length; kj++) {
        var ke = G.enemies[kj];
        if (ke.dead) continue;
        ke.klushCd = ke.klushCd || 0;
        if (ke.klushCd > 0) continue;
        // точка на окружности + «лопасть» хорды
        var kdx = ke.x - p.x, kdy = ke.y - p.y;
        var kd2 = Math.sqrt(kdx * kdx + kdy * kdy);
        if (kd2 < klR + ke.r && kd2 > klR * 0.45) {
          var kang = Math.atan2(kdy, kdx);
          if (Math.abs(normAng(kang - kA)) < 0.5) {
            ke.klushCd = 0.4;
            hurtEnemy(ke, kldmg, p.x, p.y, 200);
          }
        }
      }
    }
  }

  // СКИПИДАР: склянка → горящая лужа (зона урона)
  if (p.weapons.skipidar) {
    var sk = p.weapons.skipidar;
    sk.cd -= dt;
    if (sk.cd <= 0) {
      var skt = nearestEnemy(p.x, p.y, 520);
      if (skt) {
        sk.cd = 4.2 * cdMul();
        G.bullets.push({
          kind: 'flask', x: p.x, y: p.y,
          vx: Math.cos(angTo(p.x, p.y, skt.x, skt.y)) * 330,
          vy: Math.sin(angTo(p.x, p.y, skt.x, skt.y)) * 330,
          r: 8, dmg: 0, t: 0, life: 0.85,
          puddleR: (54 + 11 * sk.lv) * (p.evolved.skipidar ? 1.6 : 1),
          puddleDmg: (7 + 4 * sk.lv) * dmgMul() * (p.evolved.skipidar ? 1.4 : 1),
          puddleLife: (2.6 + 0.5 * sk.lv) * (p.evolved.skipidar ? 2 : 1)
        });
      }
    }
  }
}

/** Удар лодошкой: дуга перед дедом. */
function palmSlap(ang) {
  var p = G.player;
  var w = p.weapons.palm;
  var reach = 92 + 10 * w.lv + (p.evolved.palm ? 20 : 0);
  var arc = (1.5 + 0.16 * w.lv) * (p.evolved.palm ? 1.3 : 1);   // полуширина дуги, рад
  var dmg = (13 + 6 * w.lv) * dmgMul() * (p.evolved.palm ? 1.7 : 1) * (G.zapT > 0 ? 2 : 1);

  // визуал дуги
  particles.push({
    kind: 'arc', x: p.x, y: p.y, ang: ang, r: reach, arc: arc,
    t: 0, life: 0.16, col: '#ffd76e'
  });

  for (var i = 0; i < G.enemies.length; i++) {
    var e = G.enemies[i];
    if (e.dead) continue;
    var d = dist(p.x, p.y, e.x, e.y);
    if (d > reach + e.r) continue;
    var a2 = angTo(p.x, p.y, e.x, e.y);
    var da = Math.abs(normAng(a2 - ang));
    if (da < arc) {
      hurtEnemy(e, dmg, p.x, p.y, 210 + 40 * pasLv('body'));
    }
  }
}

function normAng(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

// ═════════════════════════════════════════════ УРОН И СМЕРТИ ════════════

function hurtEnemy(e, dmg, fromX, fromY, knock) {
  if (e.dead) return;
  dmg = Math.round(dmg);
  e.hp -= dmg;
  e.flash = 0.09;
  G.stats.dmg += dmg;
  if (knock && !e.boss) {
    var a = angTo(fromX, fromY, e.x, e.y);
    var k = knock * (1 - 0.4 * (e.mass || 1));
    e.vx += Math.cos(a) * k;
    e.vy += Math.sin(a) * k;
  }
  floatText(e.x, e.y - e.r - 6, '' + dmg, dmg >= 40 ? '#ffd76e' : '#fff', dmg >= 40 ? 17 : 14);
  if (e.hp <= 0) killEnemy(e);
}

function killEnemy(e) {
  if (e.dead) return;
  e.dead = true;
  G.kills++;

  // ПУФ! Изгнание в конфетти — мультяшка исчезает
  spawnConfetti(e.x, e.y, e.boss ? 60 : (e.elite ? 26 : 12), e.boss ? 1.8 : 1);
  floatText(e.x, e.y - e.r - 18, 'ПУФ!', '#ff7ad9', 18);
  spawnSpark(e.x, e.y, 6, '#fff');

  hitstop = Math.max(hitstop, e.boss ? 0.14 : (e.elite ? 0.06 : 0.028));
  CAM.kick(e.boss ? 0.9 : (e.elite ? 0.3 : 0.08));
  AU.kill();

  // трофеи: грибы-опыт (ГАСНУТ — жадность = риск), сердца, свёртки
  var shrooms = e.boss ? 26 : (e.elite ? 8 : (rint(1, 2) + (Math.random() < 0.3 ? 1 : 0)));
  for (var i = 0; i < shrooms; i++) {
    var a = rnd(0, TAU);
    var rr = rnd(4, 26);
    G.pickups.push({
      kind: 'shroom', x: e.x + Math.cos(a) * rr, y: e.y + Math.sin(a) * rr,
      vx: rnd(-60, 60), vy: rnd(-60, 60), t: rnd(0, 9), r: 7,
      life: rnd(9, 12)      // гриб гаснет: успей подобрать
    });
  }
  if (e.elite) {
    // БОЛЬШОЙ ГРИБ со старшего: сытный, гаснет медленно
    G.pickups.push({ kind: 'bigshroom', x: e.x, y: e.y, vx: 0, vy: 0, t: 0, r: 11, life: 20 });
  }
  // ХИЛКА: редкая — беречь её надо (с боссов и то не всегда)
  if (Math.random() < 0.012 || (e.boss && Math.random() < 0.5)) {
    G.pickups.push({ kind: 'heart', x: e.x, y: e.y, vx: 0, vy: 0, t: 0, r: 9 });
  }
  if (e.elite || e.boss) {
    G.pickups.push({ kind: 'gift', x: e.x, y: e.y - 6, vx: 0, vy: 0, t: 0, r: 12 });
  }
  if (e.boss) {
    AU.roar();
    AU.bossVoice(e.boss, 'die');
    announce('БОСС ИЗГНАН!\n🍄 +ополчение грибов', 2200, true);
    G.bossAlive = null;   // флаг снят — обычный спавн возобновляется
    dedEvent('bosskill');
    unlockAch('boss1');
    if (G.bossIdx >= 3) unlockAch('boss3');
  }

  // СНЕГОВИК: рассыпался — из комьев слепились два мелких Снегавчика
  if (ENEMY_TYPES[e.type] && ENEMY_TYPES[e.type].splitter && !e.noSplit) {
    for (var si = 0; si < 2; si++) {
      var m = spawnEnemy('mini', e.x + rnd(-14, 14), e.y + rnd(-10, 10));
      m.noSplit = true;   // мелкие уже не делятся
    }
    floatText(e.x, e.y - 24, 'опять двадцать пять!', '#dfe8f2', 13);
  }

  // первая кровь — дед комментирует
  if (G.kills === 1) dedEvent('firstkill');
  if (G.kills === 100) unlockAch('kills100');
  if (G.kills === 500) unlockAch('kills500');
}

function hurtPlayer(dmg, srcX, srcY) {
  var p = G.player;
  if (p.iframe > 0 || G.state !== 'play') return;
  dmg = Math.max(1, Math.round(dmg * armorMul()));
  p.hp -= dmg;
  p.iframe = 0.55;
  p.hitFx = 0.3;
  G.lastHitT = G.t;
  G.lowHpSaid = false;
  CAM.kick(0.45);
  hitstop = Math.max(hitstop, 0.05);
  AU.hurt();
  if (Math.random() < 0.35) dedEvent('hurt');
  floatText(p.x, p.y - 26, '-' + dmg, '#ff5b6e', 18);
  spawnSpark(p.x, p.y, 10, '#ff5b6e');
  // отброс деда
  if (srcX !== undefined) {
    var a = angTo(srcX, srcY, p.x, p.y);
    p.x += Math.cos(a) * 14;
    p.y += Math.sin(a) * 14;
  }
  // тулуп трещит — дед говорит раз в забег
  if (p.hp < 35 && p.hp > 0 && !G.lowHpSaid) {
    G.lowHpSaid = true;
    dedEvent('lowhp');
  }
  if (p.hp <= 0) {
    p.hp = 0;
    endRun(false);
  }
}

// ══════════════════════════════════════════════════ СНАРЯДЫ ═════════════

function updateBullets(dt) {
  var p = G.player;
  for (var i = G.bullets.length - 1; i >= 0; i--) {
    var b = G.bullets[i];
    b.t += dt;
    if (b.t >= b.life) {
      // СКЛЯНКА ДОЛЕТЕЛА: разбилась — загорелась лужа
      if (b.kind === 'flask') {
        G.bullets.push({
          kind: 'puddle', x: b.x, y: b.y, vx: 0, vy: 0,
          r: 0, dmg: b.puddleDmg, t: 0, life: b.puddleLife,
          puddleR: b.puddleR, tick: 0
        });
        spawnConfetti(b.x, b.y, 8);
        AU.pop();
      }
      G.bullets.splice(i, 1);
      continue;
    }

    if (b.kind === 'slipper') {
      // бумеранг: 60% времени наружу, потом к деду
      if (b.out && b.t > b.life * 0.42) b.out = false;
      if (!b.out) {
        var a = angTo(b.x, b.y, p.x, p.y);
        var sp = 520;
        b.vx = lerp(b.vx, Math.cos(a) * sp, 6 * dt);
        b.vy = lerp(b.vy, Math.sin(a) * sp, 6 * dt);
        if (dist2(b.x, b.y, p.x, p.y) < 400 && b.t > b.life * 0.5) {
          G.bullets.splice(i, 1); continue;
        }
      }
    }

    // ТАПОК-САМОЛЁТ: подкручивает к ближайшей непобитой жертве
    if (b.kind === 'tapok') {
      var ht = null, hd = 640 * 640;
      for (var hi = 0; hi < G.enemies.length; hi++) {
        var he = G.enemies[hi];
        if (he.dead || b.hitSet[he.id]) continue;
        var hdd = dist2(b.x, b.y, he.x, he.y);
        if (hdd < hd) { hd = hdd; ht = he; }
      }
      if (ht) {
        var ha = angTo(b.x, b.y, ht.x, ht.y);
        var cur = Math.atan2(b.vy, b.vx);
        var na = cur + clamp(normAng(ha - cur), -6 * dt, 6 * dt);
        var spd = Math.hypot(b.vx, b.vy);
        b.vx = Math.cos(na) * spd;
        b.vy = Math.sin(na) * spd;
      }
    }

    // ЛУЖА СКИПИДАРА: тикает уроном по зоне
    if (b.kind === 'puddle') {
      b.tick -= dt;
      if (b.tick <= 0) {
        b.tick = 0.4;
        for (var qi = 0; qi < G.enemies.length; qi++) {
          var qe = G.enemies[qi];
          if (qe.dead) continue;
          if (dist2(b.x, b.y, qe.x, qe.y) < (b.puddleR + qe.r) * (b.puddleR + qe.r)) {
            hurtEnemy(qe, b.dmg, b.x, b.y, 0);
            if (Math.random() < 0.4) spawnSpark(qe.x, qe.y, 2, '#ff8c42');
          }
        }
      }
      continue;   // лужа не движется и не сталкивается как снаряд
    }

    b.x += b.vx * dt;
    b.y += b.vy * dt;

    if (b.hostile) {
      // СОВИНАЯ БОМБА: упала на метку — взрыв по площади
      if (b.kind === 'owlbomb') {
        if (b.t >= (b.fuse || 0.55)) {
          spawnSnowPuff(b.x, b.y, 14);
          particles.push({ kind: 'ring', x: b.x, y: b.y, t: 0, life: 0.3, r0: 8, r1: 66, col: '#9dffe0' });
          CAM.kick(0.25);
          AU.pop();
          if (dist2(b.x, b.y, p.x, p.y) < (58 + p.r) * (58 + p.r)) {
            hurtPlayer(b.dmg, b.x, b.y);
          }
          G.bullets.splice(i, 1);
        }
        continue;
      }
      // вражеский снаряд — снежки бандитов
      if (dist2(b.x, b.y, p.x, p.y) < (b.r + p.r) * (b.r + p.r)) {
        hurtPlayer(b.dmg, b.x, b.y);
        spawnSnowPuff(b.x, b.y, 5);
        G.bullets.splice(i, 1);
      }
      continue;
    }

    // снаряд деда — проверка попаданий
    for (var j = 0; j < G.enemies.length; j++) {
      var e = G.enemies[j];
      if (e.dead) continue;
      if ((b.kind === 'slipper' || b.kind === 'tapok') && b.hitSet[e.id]) continue;
      if (dist2(b.x, b.y, e.x, e.y) < (b.r + e.r) * (b.r + e.r)) {
        if (b.kind === 'joint') {
          // взрыв косяка
          spawnConfetti(b.x, b.y, 10);
          spawnSpark(b.x, b.y, 8, '#b16bff');
          AU.pop();
          for (var k = 0; k < G.enemies.length; k++) {
            var e2 = G.enemies[k];
            if (e2.dead) continue;
            if (dist2(b.x, b.y, e2.x, e2.y) < (b.boom + e2.r) * (b.boom + e2.r)) {
              hurtEnemy(e2, b.dmg, b.x, b.y, 160);
            }
          }
          G.bullets.splice(i, 1);
          break;
        }
        // тапок/дубина: пробивают, жертву не бьют дважды
        if (b.kind === 'slipper' || b.kind === 'tapok') {
          b.hitSet[e.id] = true;
          hurtEnemy(e, b.dmg, b.x - b.vx, b.y - b.vy, 240);
          continue;
        }
      }
    }
  }
}

// ═════════════════════════════════════════════ МУЛЬТЯШКИ ════════════════
// Все звери — глюки деда: ЯРКИЕ мультяшки на тёмном снегу.
// Читаемость силуэтов — закон (Нuclear Throne): размер = сила.

var ENEMY_TYPES = {
  wolf:   { name: 'Волк',   hp: 22,  dmg: 8,  speed: 92,  r: 14, col: '#ff8ab0', mass: 1 },
  hare:   { name: 'Заяц',   hp: 9,   dmg: 6,  speed: 190, r: 10, col: '#ffb36e', mass: 0.7, zig: true },
  bandit: { name: 'Бандит', hp: 36,  dmg: 10, speed: 78,  r: 15, col: '#7bffb0', mass: 1.2, ranged: true },
  crow:   { name: 'Ворона', hp: 11,  dmg: 12, speed: 240, r: 11, col: '#b39bff', mass: 0.6, diver: true },
  bear:   { name: 'Медведь', hp: 140, dmg: 20, speed: 52, r: 26, col: '#6ecbff', mass: 2.4, kbRes: true },
  // v3.0 БИОМАССА: лес разнообразнее
  moose:  { name: 'Лось',     hp: 95,  dmg: 16, speed: 66,  r: 22, col: '#c98f5a', mass: 2,   charger: true },
  marten: { name: 'Куница',   hp: 15,  dmg: 9,  speed: 205, r: 11, col: '#ffe66e', mass: 0.6, weaver: true },
  snowman:{ name: 'Снеговик', hp: 130, dmg: 14, speed: 38,  r: 20, col: '#e8f2ff', mass: 2.2, splitter: true },
  mini:   { name: 'Снегавчик', hp: 15, dmg: 6,  speed: 125, r: 9,  col: '#dfe8f2', mass: 0.5 },
  mouse:  { name: 'Полёвка',  hp: 5,   dmg: 3,  speed: 145, r: 7,  col: '#d7c4ff', mass: 0.3 },
  owl:    { name: 'Сова',     hp: 32,  dmg: 15, speed: 120, r: 14, col: '#9dffe0', mass: 0.9, bomber: true }
};

var nextEntId = 1;

function minuteMul() {
  var mins = G.t / 60;
  // прогрессивный рост: после 5-й минуты лес звереет быстрее
  return 1 + mins * 0.14 + (mins > 5 ? (mins - 5) * 0.11 : 0);
}

function spawnEnemy(type, x, y, elite, silent) {
  var d = ENEMY_TYPES[type];
  var m = minuteMul();
  var e = {
    id: nextEntId++,
    type: type, x: x, y: y,
    vx: 0, vy: 0,
    hp: Math.round(d.hp * m * (elite ? 4.5 : 1)),
    dmg: d.dmg * (0.8 + 0.3 * m) * (elite ? 1.6 : 1),
    speed: d.speed * rnd(0.92, 1.08),
    r: d.r * (elite ? 1.5 : 1),
    col: d.col, mass: d.mass, elite: !!elite,
    flash: 0, catCd: 0, atkCd: 0,
    t: rnd(0, 10), dead: false,
    zigT: rnd(0, TAU), shootCd: rnd(1, 2.5), diveCd: 0,
    diveVX: 0, diveVY: 0
  };
  e.maxHp = e.hp;
  G.enemies.push(e);
  if (elite && !silent) {
    floatText(x, y - 30, '👑 ' + d.name + '-ЭЛИТА', '#ffd76e', 16);
  }
  return e;
}

/** Спавн за краем экрана в кольце вокруг деда. */
function spawnAtRing(type, elite) {
  var p = G.player;
  var a = rnd(0, TAU);
  var R = Math.max(VW, VH) / SCALE * 0.62 + 60;
  return spawnEnemy(type, p.x + Math.cos(a) * R, p.y + Math.sin(a) * R, elite);
}

function updateEnemies(dt) {
  var p = G.player;
  var zapSlow = G.zapT > 0 ? 0.55 : 1;

  for (var i = G.enemies.length - 1; i >= 0; i--) {
    var e = G.enemies[i];
    if (e.dead) { G.enemies.splice(i, 1); continue; }
    e.t += dt;
    if (e.flash > 0) e.flash -= dt;
    if (e.catCd > 0) e.catCd -= dt;
    if (e.atkCd > 0) e.atkCd -= dt;

    var d = ENEMY_TYPES[e.type];
    var dx = p.x - e.x, dy = p.y - e.y;
    var dd = Math.hypot(dx, dy) || 1;
    var ux = dx / dd, uy = dy / dd;
    var slow = zapSlow;

    if (e.boss) {
      updateBoss(e, dt, ux, uy, dd);
    } else if (d.diver) {
      // ВОРОНА: кружит → ЗАМИРАЕТ (метка на снегу) → пике в точку.
      // Уворачивайся от метки — читай телеграф.
      if (!e.wst) { e.wst = 0; e.wstT = 0; }   // 0 кружит, 1 замерла, 2 пике
      e.wstT -= dt;
      if (e.wst === 0) {
        // орбита вокруг деда на дистанции
        var oa = e.t * 1.6;
        var ox = p.x + Math.cos(oa) * 200;
        var oy = p.y + Math.sin(oa) * 200;
        var da = angTo(e.x, e.y, ox, oy);
        e.x += Math.cos(da) * e.speed * 0.55 * slow * dt;
        e.y += Math.sin(da) * e.speed * 0.55 * slow * dt;
        if (e.wstT <= 0 && dd < 330) {
          e.wst = 1; e.wstT = 0.7;
          // метка: чуть с упреждением по ходу деда
          e.tx = p.x + (p.lastVX || 0) * 0.45;
          e.ty = p.y + (p.lastVY || 0) * 0.45;
          AU.pop();
        }
      } else if (e.wst === 1) {
        // замерла в воздухе, нацеливается
        if (e.wstT <= 0) {
          e.wst = 2; e.wstT = 0.5;
          e.dashA = angTo(e.x, e.y, e.tx, e.ty);
          AU.pop();
        }
      } else {
        // ПИКЕ в отмеченную точку и дальше по прямой
        e.x += Math.cos(e.dashA) * e.speed * 2.4 * slow * dt;
        e.y += Math.sin(e.dashA) * e.speed * 2.4 * slow * dt;
        if (e.wstT <= 0) { e.wst = 0; e.wstT = rnd(1.6, 2.4); }
      }
    } else if (d.ranged) {
      // бандит: держит дистанцию и плюётся снежками
      var want = 235;
      var mv = 0;
      if (dd > want + 30) mv = 1;
      else if (dd < want - 40) mv = -1;
      e.x += ux * mv * e.speed * slow * dt;
      e.y += uy * mv * e.speed * slow * dt;
      // лёгкий стрейф
      e.zigT += dt * 2;
      e.x += -uy * Math.sin(e.zigT) * 40 * dt;
      e.y += ux * Math.sin(e.zigT) * 40 * dt;
      e.shootCd -= dt * slow;
      if (e.shootCd <= 0 && dd < 420) {
        e.shootCd = rnd(1.8, 2.6);
        var ba = angTo(e.x, e.y, p.x, p.y);
        G.bullets.push({
          kind: 'snowball', hostile: true,
          x: e.x, y: e.y,
          vx: Math.cos(ba) * 270, vy: Math.sin(ba) * 270,
          r: 6, dmg: e.dmg, t: 0, life: 2.2
        });
        AU.pop();
      }
    } else if (d.charger) {
      // ЛОСЬ: разгоняется издалека, КОПЫТИТ снег (телеграф) → ТАРАН по прямой.
      // Рывок длиннее волчьего и бьёт по пути — отходи вбок заранее.
      if (!e.wst) { e.wst = 0; e.wstT = rnd(0.5, 1.2); }
      e.wstT -= dt;
      if (e.wst === 0) {
        // тяжёлая рысь
        e.x += ux * e.speed * slow * dt;
        e.y += uy * e.speed * slow * dt;
        if (e.wstT <= 0 && dd < 520 && dd > 90) {
          e.wst = 1; e.wstT = 0.85;
          e.dashA = angTo(e.x, e.y, p.x, p.y);
          AU.grunt();
        }
      } else if (e.wst === 1) {
        // бьёт копытом, рогами показывает линию тарана
        e.x += rnd(-2, 2); e.y += rnd(-2, 2);
        if (e.wstT <= 0) { e.wst = 2; e.wstT = 0.75; AU.grunt(); }
      } else {
        e.x += Math.cos(e.dashA) * e.speed * 4.6 * slow * dt;
        e.y += Math.sin(e.dashA) * e.speed * 4.6 * slow * dt;
        if (e.wstT <= 0) { e.wst = 0; e.wstT = rnd(2.2, 3.2); }
      }
    } else if (d.weaver) {
      // КУНИЦА: быстрый зигзаг-ткач — прижать её AoE, пальцем не поймать
      var wzig = Math.sin(e.t * 7.5) * 95;
      e.x += (ux * e.speed - uy * wzig) * slow * dt;
      e.y += (uy * e.speed + ux * wzig) * slow * dt;
    } else if (d.bomber) {
      // СОВА: кружит выше дедовых ударов → ЗАМИРАЕТ → роняет снежную бомбу
      // в отмеченный круг. Сама не спускается — бей залпом/лучинами.
      if (!e.wst) { e.wst = 0; e.wstT = 0; }
      e.wstT -= dt;
      if (e.wst === 0) {
        var boa = e.t * 1.1;
        var box = p.x + Math.cos(boa) * 260;
        var boy = p.y + Math.sin(boa) * 260;
        var bda = angTo(e.x, e.y, box, boy);
        e.x += Math.cos(bda) * e.speed * 0.6 * slow * dt;
        e.y += Math.sin(bda) * e.speed * 0.6 * slow * dt;
        if (e.wstT <= 0 && dd < 420) {
          e.wst = 1; e.wstT = 0.8;
          e.tx = p.x + (p.lastVX || 0) * 0.6;
          e.ty = p.y + (p.lastVY || 0) * 0.6;
          AU.pop();
        }
      } else if (e.wst === 1) {
        // зависла, круг-прицел на снегу растёт
        if (e.wstT <= 0) {
          e.wst = 0; e.wstT = rnd(2.6, 3.6);
          G.bullets.push({
            kind: 'owlbomb', hostile: true,
            x: e.tx, y: e.ty - 240,      // падает сверху на метку
            vx: 0, vy: 430,
            r: 10, dmg: e.dmg, t: 0, life: 1.1
          });
          AU.pop();
        }
      }
    } else if (e.type === 'wolf') {
      // ВОЛК: погоня → ПРИСЕЛ (телеграф!) → РЫВОК. Отходи вбок.
      if (!e.wst) { e.wst = 0; e.wstT = 0; }   // 0 погоня, 1 присел, 2 рывок
      e.wstT -= dt;
      if (e.wst === 0) {
        e.x += ux * e.speed * slow * dt;
        e.y += uy * e.speed * slow * dt;
        if (e.wstT <= 0 && dd < 250 && dd > 60) {
          e.wst = 1; e.wstT = 0.55;
          AU.grunt();
        }
      } else if (e.wst === 1) {
        // присел, дрожит — направление рывка уже видно (морда на деда)
        if (e.wstT <= 0) {
          e.wst = 2; e.wstT = 0.34;
          e.dashA = angTo(e.x, e.y, p.x, p.y);
          AU.grunt();
        }
      } else {
        e.x += Math.cos(e.dashA) * e.speed * 3.1 * slow * dt;
        e.y += Math.sin(e.dashA) * e.speed * 3.1 * slow * dt;
        if (e.wstT <= 0) { e.wst = 0; e.wstT = rnd(1.8, 2.8); }
      }
    } else {
      // заяц/медведь: заяц виляет, медведь прёт напролом
      var zig = d.zig ? Math.sin(e.t * 6) * 55 : 0;
      e.x += (ux * e.speed - uy * zig) * slow * dt;
      e.y += (uy * e.speed + ux * zig) * slow * dt;
    }

    // инерция отброса
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    e.vx *= Math.pow(0.0009, dt);
    e.vy *= Math.pow(0.0009, dt);

    // мягкое расталкивание мультяшек (читаемость куч)
    if (!e.boss && (i & 1) === (G.frame & 1)) {
      for (var j = i - 1; j >= Math.max(0, i - 5); j--) {
        var o = G.enemies[j];
        if (!o || o.dead) continue;
        var ox = e.x - o.x, oy = e.y - o.y;
        var od = ox * ox + oy * oy;
        var mr = (e.r + o.r) * 0.85;
        if (od > 0.01 && od < mr * mr) {
          var od2 = Math.sqrt(od);
          var push = (mr - od2) * 1.6;
          e.x += (ox / od2) * push;
          e.y += (oy / od2) * push;
        }
      }
    }

    // контактный урон деду
    if (dd < e.r + p.r && e.atkCd <= 0) {
      e.atkCd = 0.8;
      hurtPlayer(e.dmg, e.x, e.y);
    }
  }
}

// ════════════════════════════════════════════════════ БОССЫ ═════════════

var BOSSES = [
  {
    id: 'alpha', name: 'ВОЖАК СТАИ', col: '#ff5b6e', r: 34, hp: 1500, dmg: 22, speed: 95,
    base: 'wolf',
    taunt: 'Вожак стаи. Зубы как у мамы.'
  },
  {
    id: 'shisha', name: 'МЕДВЕДЬ-ШАТУН', col: '#6ecbff', r: 46, hp: 3200, dmg: 28, speed: 60,
    base: 'bear',
    taunt: 'Съел слишком много мухоморов.'
  },
  {
    id: 'glavar', name: 'АТАМАН ДЕЗЕРТИРОВ', col: '#7bffb0', r: 30, hp: 5200, dmg: 20, speed: 85,
    base: 'bandit',
    taunt: 'Держит весь снежный бизнес.'
  },
  // v3.0: новые старшие леса (порядковая очередь в бесконечной ночи)
  {
    id: 'hozyain', name: 'ХОЗЯИН ТРАКТА', col: '#c98f5a', r: 42, hp: 5800, dmg: 30, speed: 78,
    base: 'moose',
    taunt: 'Лось, который не уступает дорогу поездам.'
  },
  {
    id: 'metelica', name: 'МЕТЕЛИЦА', col: '#b39bff', r: 32, hp: 6400, dmg: 18, speed: 150,
    base: 'crow',
    taunt: 'Ведьма метели. Танцует — и ты танцуешь.'
  },
  {
    id: 'leshiy', name: 'ЛЕШИЙ-КОМЕНДАНТ', col: '#9dffe0', r: 44, hp: 7600, dmg: 26, speed: 58,
    base: 'snowman',
    taunt: 'Лес под его началом. Дед — самовольная постройка.'
  }
];

function spawnBoss(idx) {
  var loop = Math.floor(idx / BOSSES.length);          // виток очереди (бесконечка)
  var b = BOSSES[idx % BOSSES.length];
  // сила старшего растёт и от витка очереди, и от прожитой ночи
  var scale = (1 + loop * 1.1) * (0.9 + G.t / 300);
  var p = G.player;
  var a = rnd(0, TAU);
  var R = Math.max(VW, VH) / SCALE * 0.55;
  var e = spawnEnemy(b.base, p.x + Math.cos(a) * R, p.y + Math.sin(a) * R, false, true);
  e.boss = b.id;
  e.bossIdx = idx;
  e.name = b.name;
  e.hp = e.maxHp = Math.round(b.hp * scale);
  e.dmg = b.dmg;
  e.r = b.r;
  e.col = b.col;
  e.speed = b.speed;
  e.mass = 6;
  e.state = 'chase';
  e.stateT = 2;
  e.chargeA = 0;
  G.bossAlive = e;
  AU.roar();
  AU.bossVoice(b.id, 'spawn');
  CAM.kick(0.8);
  announce('⚠ ' + b.name + ' ⚠\n' + b.taunt + (loop ? ' (виток ' + (loop + 1) + ')' : ''), 2600, true);
  setTimeout(function () { if (G.state === 'play') dedEvent('boss'); }, 1200);
  return e;
}

function updateBoss(e, dt, ux, uy, dd) {
  var p = G.player;
  e.stateT -= dt;

  if (e.boss === 'alpha') {
    // АЛЬФА: погоня → телеграф → рывок; зовёт стаю
    if (e.state === 'chase') {
      e.x += ux * e.speed * dt;
      e.y += uy * e.speed * dt;
      if (e.stateT <= 0 && dd < 480) {
        e.state = 'tele';
        e.stateT = 0.75;
        e.chargeA = angTo(e.x, e.y, p.x, p.y);
      }
    } else if (e.state === 'tele') {
      // трясётся на месте — читаемый телеграф
      e.x += rnd(-2, 2); e.y += rnd(-2, 2);
      if (e.stateT <= 0) {
        e.state = 'dash';
        e.stateT = 0.6;
        AU.bossVoice('alpha', 'attack');
      }
    } else if (e.state === 'dash') {
      e.x += Math.cos(e.chargeA) * e.speed * 4.2 * dt;
      e.y += Math.sin(e.chargeA) * e.speed * 4.2 * dt;
      if (e.stateT <= 0) {
        e.state = 'chase';
        e.stateT = rnd(2.4, 3.4);
        // после рывка зовёт подкрепление
        for (var i = 0; i < 3; i++) spawnAtRing('wolf');
      }
    }
  } else if (e.boss === 'shisha') {
    // ШИША: медленно прёт, бьёт шокволной
    if (e.state === 'chase') {
      e.x += ux * e.speed * dt;
      e.y += uy * e.speed * dt;
      if (e.stateT <= 0 && dd < 380) {
        e.state = 'tele';
        e.stateT = 0.8;
      }
    } else if (e.state === 'tele') {
      e.x += rnd(-3, 3); e.y += rnd(-3, 3);
      if (e.stateT <= 0) {
        e.state = 'chase';
        e.stateT = 3.2;
        // удар оземь: расходящееся кольцо
        particles.push({ kind: 'shock', x: e.x, y: e.y, t: 0, life: 0.55, r0: 30, r1: 330, col: '#6ecbff' });
        CAM.kick(0.6);
        AU.bossVoice('shisha', 'attack');
        e.shockT = 0;    // кольцо проверит дед при расширении
        e.shockX = e.x; e.shockY = e.y;
      }
    }
    // кольцо растёт и бьёт по ходу
    if (e.shockT !== undefined && e.shockT !== null && e.shockT < 0.5) {
      e.shockT += dt;
      var rr = lerp(30, 330, e.shockT / 0.5);
      var pd = Math.abs(dist(p.x, p.y, e.shockX, e.shockY) - rr);
      if (pd < 26 && p.iframe <= 0) hurtPlayer(18, e.shockX, e.shockY);
    }
  } else if (e.boss === 'glavar') {
    // ГЛАВАРЬ: держит дистанцию, веер снежков, зовёт бандитов
    var want = 300;
    var mv = dd > want + 30 ? 1 : (dd < want - 40 ? -1 : 0);
    e.x += ux * mv * e.speed * dt;
    e.y += uy * mv * e.speed * dt;
    e.zigT = (e.zigT || 0) + dt;
    e.x += -uy * Math.sin(e.zigT * 1.4) * 70 * dt;
    e.y += ux * Math.sin(e.zigT * 1.4) * 70 * dt;
    e.shootCd -= dt;
    if (e.shootCd <= 0) {
      e.shootCd = 2.4;
      var base = angTo(e.x, e.y, p.x, p.y);
      for (var k = -2; k <= 2; k++) {
        var ba = base + k * 0.24;
        G.bullets.push({
          kind: 'snowball', hostile: true,
          x: e.x, y: e.y,
          vx: Math.cos(ba) * 300, vy: Math.sin(ba) * 300,
          r: 7, dmg: 14, t: 0, life: 2.4
        });
      }
      AU.pop();
    }
    if (e.stateT <= 0) {
      e.stateT = 7;
      for (var g = 0; g < 2; g++) spawnAtRing('bandit');
      floatText(e.x, e.y - e.r - 20, '«Ребята, Fargo!»', '#7bffb0', 15);
    }
  } else if (e.boss === 'hozyain') {
    // ХОЗЯИН ТРАКТА: погоня → рога в сторону деда (телеграф) → ДЛИННЫЙ таран.
    // В конце тарана — веер снежков из-под копыт.
    if (e.state === 'chase') {
      e.x += ux * e.speed * dt;
      e.y += uy * e.speed * dt;
      if (e.stateT <= 0 && dd < 640) {
        e.state = 'tele';
        e.stateT = 0.9;
        e.chargeA = angTo(e.x, e.y, p.x, p.y);
      }
    } else if (e.state === 'tele') {
      e.x += rnd(-3, 3); e.y += rnd(-3, 3);
      if (e.stateT <= 0) { e.state = 'dash'; e.stateT = 0.85; AU.bossVoice('hozyain', 'attack'); }
    } else if (e.state === 'dash') {
      e.x += Math.cos(e.chargeA) * e.speed * 5 * dt;
      e.y += Math.sin(e.chargeA) * e.speed * 5 * dt;
      // таран бьёт по пути
      if (dd < e.r + p.r + 6 && p.iframe <= 0) hurtPlayer(e.dmg, e.x, e.y);
      if (e.stateT <= 0) {
        e.state = 'chase';
        e.stateT = rnd(2.6, 3.6);
        // веер из-под копыт
        for (var hc = -1; hc <= 1; hc++) {
          var hba = angTo(e.x, e.y, p.x, p.y) + hc * 0.35;
          G.bullets.push({
            kind: 'snowball', hostile: true,
            x: e.x, y: e.y,
            vx: Math.cos(hba) * 280, vy: Math.sin(hba) * 280,
            r: 7, dmg: 12, t: 0, life: 2.2
          });
        }
        AU.pop();
      }
    }
  } else if (e.boss === 'metelica') {
    // МЕТЕЛИЦА: вальсирует вокруг деда, метёт снежными вихрями (кольца),
    // из метели сыплются полёвки
    var ma = (e.mAng = (e.mAng || 0) + dt * 0.55);
    var want = 260;
    var tx = p.x + Math.cos(ma) * want;
    var ty = p.y + Math.sin(ma) * want;
    var mda = angTo(e.x, e.y, tx, ty);
    e.x += Math.cos(mda) * e.speed * dt;
    e.y += Math.sin(mda) * e.speed * dt;
    e.stateT2 = (e.stateT2 || 0) - dt;
    if (e.stateT2 <= 0) {
      e.stateT2 = 2.8;
      // снежный вихрь
      particles.push({ kind: 'shock', x: e.x, y: e.y, t: 0, life: 0.5, r0: 24, r1: 260, col: '#b39bff' });
      AU.howl();
      AU.bossVoice('metelica', 'attack');
      e.vortexT = 0; e.vortexX = e.x; e.vortexY = e.y;
      // из метели — полёвки
      for (var mv = 0; mv < 4; mv++) spawnAtRing('mouse');
    }
    if (e.vortexT !== undefined && e.vortexT < 0.45) {
      e.vortexT += dt;
      var vr = lerp(24, 260, e.vortexT / 0.45);
      if (Math.abs(dist(p.x, p.y, e.vortexX, e.vortexY) - vr) < 24 && p.iframe <= 0) {
        hurtPlayer(16, e.vortexX, e.vortexY);
      }
    }
  } else if (e.boss === 'leshiy') {
    // ЛЕШИЙ-КОМЕНДАНТ: неспешно идёт, топает оземь (кольцо), созывает сов и снеговиков.
    // Если дед далеко — свистит и подтягивается сам.
    if (e.state === 'chase') {
      e.x += ux * e.speed * dt;
      e.y += uy * e.speed * dt;
      if (e.stateT <= 0 && dd < 460) {
        e.state = 'tele';
        e.stateT = 0.7;
      }
    } else if (e.state === 'tele') {
      e.x += rnd(-3, 3); e.y += rnd(-3, 3);
      if (e.stateT <= 0) {
        e.state = 'chase';
        e.stateT = 3.4;
        particles.push({ kind: 'shock', x: e.x, y: e.y, t: 0, life: 0.55, r0: 30, r1: 360, col: '#9dffe0' });
        CAM.kick(0.6);
        AU.bossVoice('leshiy', 'attack');
        e.shockT = 0;
        e.shockX = e.x; e.shockY = e.y;
      }
    }
    if (e.shockT !== undefined && e.shockT !== null && e.shockT < 0.5) {
      e.shockT += dt;
      var lr = lerp(30, 360, e.shockT / 0.5);
      if (Math.abs(dist(p.x, p.y, e.shockX, e.shockY) - lr) < 26 && p.iframe <= 0) {
        hurtPlayer(18, e.shockX, e.shockY);
      }
    }
    // призыв: то сов, то снеговиков
    e.callT = (e.callT || 5) - dt;
    if (e.callT <= 0) {
      e.callT = 6.5;
      var kind = Math.random() < 0.5 ? 'owl' : 'snowman';
      for (var lc = 0; lc < 2; lc++) spawnAtRing(kind);
      floatText(e.x, e.y - e.r - 20,
        kind === 'owl' ? '«Совы — на пост!»' : '«Сугробы — стройся!»', '#9dffe0', 15);
    }
  }
}

// ══════════════════════════════════════ ДИРЕКТОР СПАВНА (ТЕМП) ══════════
// Правило хороших survivors-like: ДЕЙСТВИЕ КАЖДЫЕ 3 СЕКУНДЫ.
// Плотность растёт по минутам, состав сменяется, свирепые мини-волны.

var WAVE_EVENTS = [
  { name: 'ВОЛЧЬЯ СТАЯ', type: 'wolf', n: 12, ring: true },
  { name: 'ЗАЯЧЬЯ ПАНИКА', type: 'hare', n: 16, ring: true },
  { name: 'ДЕЗЕРТИРЫ ИДУТ', type: 'bandit', n: 8, side: true },
  { name: 'ВОРОНЬЁ', type: 'crow', n: 10, ring: true },
  { name: 'ШАТУН ЗАШЁЛ В ПОСЁЛОК', type: 'bear', n: 4, side: true },
  { name: 'ПОЛЁВКИ ИЗ-ПОД СНЕГА', type: 'mouse', n: 22, ring: true },
  { name: 'ЛОСИ ПОШЛИ ТРАКТОМ', type: 'moose', n: 6, side: true },
  { name: 'СОВИНЫЙ ОБЛЁТ', type: 'owl', n: 6, ring: true },
  { name: 'ЛЕПИТЬСЯ, СНЕГОВИКИ!', type: 'snowman', n: 6, ring: true },
  { name: 'КУНИЦЫ В САДАХ', type: 'marten', n: 12, ring: true },
  { name: 'ВЕСЬ ЛЕС РАЗОМ', type: 'mix', n: 24, ring: true }
];

function composition(t) {
  // что спавнить по обычному ритму (классика 10 минут; бесконечка — дальше жёстче)
  var pool = ['wolf', 'wolf'];
  if (t > 40) pool.push('hare', 'hare');
  if (t > 120) pool.push('bandit');
  if (t > 200) pool.push('crow', 'marten');
  if (t > 300) pool.push('bear', 'moose');
  if (t > 450) pool.push('snowman', 'hare', 'bandit', 'crow');
  if (t > 600) pool.push('owl', 'moose', 'marten', 'snowman');   // бесконечка
  if (t > 900) pool.push('moose', 'owl', 'snowman', 'bandit');   // совсем жёстко
  return pool;
}

function updateDirector(dt) {
  var p = G.player;

  // страховка: старшего пометили мёртвым где-то ещё — снимаем флаг сам,
  // иначе обычный спавн и следующие боссы стоят навсегда
  if (G.bossAlive && G.bossAlive.dead) G.bossAlive = null;

  // БОССЫ — старшие леса
  if (G.mode === 'classic') {
    if (G.bossIdx < BOSS_TIMES.length && G.t >= BOSS_TIMES[G.bossIdx] && !G.bossAlive) {
      spawnBoss(G.bossIdx);
      G.bossIdx++;
    }
  } else {
    // БЕСКОНЕЧНАЯ НОЧЬ: очередь боссов без конца, каждые 2.5 минуты
    if (!G.nextBossT) G.nextBossT = ENDLESS_BOSS_EVERY;
    if (G.t >= G.nextBossT && !G.bossAlive) {
      spawnBoss(G.bossIdx);
      G.bossIdx++;
      G.nextBossT = G.t + ENDLESS_BOSS_EVERY;
    }
    // вехи бесконечки
    if (G.t >= 300 && !G.said5) { G.said5 = true; dedEvent('endless5'); }
    if (G.t >= 600) unlockAch('endless10');
  }

  // ОСАДА: после третьего старшего лес идёт ва-банк — до самого рассвета
  if (G.mode === 'classic' && !G.siege && G.t >= SIEGE_TIME) {
    G.siege = true;
    AU.bell();
    announce('Ⰰ ОСАДА!\nлес идёт ва-банк', 2800);
    CAM.kick(0.4);
  }

  // РАССВЕТ: последние 60 секунд небо светлеет — дожить!
  if (G.mode === 'classic') {
    if (!G.dawn && G.t >= RUN_TIME - 60) {
      G.dawn = true;
      dedEvent('dawn');
      announce('НЕБО СВЕТЛЕЕТ НА ВОСТОКЕ\nдержись!', 3200);
    }
    if (G.t >= RUN_TIME) {
      endRun(true);
      return;
    }
  }

  // РАДИО станции: сюжет каплями
  updateRadio(dt);

  // «НЕПРИКАСАЕМЫЙ»: 5 минут без единого удара по деду
  if (G.t - G.lastHitT >= 300) unlockAch('untouch');

  // ЗОЛОТОЙ ГРИБ: лакомая приманка. Схватишь — лес проснётся
  G.goldT -= dt;
  if (G.goldT <= 0) {
    G.goldT = rnd(45, 65);
    var ga = rnd(0, TAU);
    var gR = rnd(150, 250);
    G.pickups.push({
      kind: 'gold', x: p.x + Math.cos(ga) * gR, y: p.y + Math.sin(ga) * gR,
      vx: 0, vy: 0, t: 0, r: 9, life: 12
    });
  }

  // вой издалека — ночь живая
  G.howlT -= dt;
  if (G.howlT <= 0) {
    G.howlT = rnd(22, 40);
    AU.howl();
  }

  // дед бормочет
  if (Math.random() < dt * 0.07) dedSay();

  // мини-волна каждые 40–60 сек
  G.waveT -= dt;
  if (G.waveT <= 0) {
    G.waveT = rnd(40, 60);
    var wv = WAVE_EVENTS[Math.min(WAVE_EVENTS.length - 1, Math.floor(G.t / 95))];
    announce('🥁 ' + wv.name, 1600);
    var seq = G.runSeq;   // волны убитого забега не переносятся в новый
    for (var i = 0; i < wv.n; i++) {
      (function (ii) {
        setTimeout(function fire() {
          // забег закончился/вышли в меню — волна отменяется
          if (seq !== G.runSeq || G.state === 'menu' || G.state === 'death' || G.state === 'win') return;
          // прокачка/пауза — не терять волну, подождать возвращения в игру
          if (G.state !== 'play') { setTimeout(fire, 160); return; }
          var type = wv.type === 'mix' ? pick(composition(G.t)) : wv.type;
          if (wv.ring) spawnAtRing(type);
          else {
            var a = rnd(0, TAU);
            var R = Math.max(VW, VH) / SCALE * 0.65 + 80;
            spawnEnemy(type, G.player.x + Math.cos(a) * R, G.player.y + Math.sin(a) * R);
          }
        }, ii * 90);
      })(i);
    }
  }

  // обычный ритм спавна
  if (G.bossAlive) return;   // во время босса обычный спавн тише
  G.spawnAcc += dt;
  var rate = 0.7 - Math.min(0.52, G.t / 60 * 0.055);  // от 0.70с до ~0.18с между пачками
  if (G.siege) rate *= 0.45;                           // осада: вдвое плотнее
  if (G.spawnAcc >= rate) {
    G.spawnAcc = 0;
    var cap = G.siege ? 190 : 140;
    if (G.mode === 'endless') cap = Math.min(240, 140 + Math.floor(G.t / 40));
    if (G.enemies.length < cap) {
      var pool = composition(G.t);
      var batch = Math.min(16, 1 + Math.floor(G.t / 50));
      if (G.siege) batch += 4;
      for (var b = 0; b < batch; b++) {
        var elite = Math.random() < 0.02 + G.t / 9000;  // к 10-й минуте ~9% элиты
        spawnAtRing(pick(pool), elite);
      }
    }
  }
}

// ═══════════════════════════════════════════════ РАССВЕТ (ФИНАЛ) ══════════
// Тарелки нет: победа — дожить до 10:00. Восток наливается золотом.

// ════════════════════════════════════════════════ ТРОФЕИ ════════════════

function updatePickups(dt) {
  var p = G.player;
  var mr = magnetR();
  for (var i = G.pickups.length - 1; i >= 0; i--) {
    var it = G.pickups[i];
    it.t += dt;

    // ГРИБЫ ГАСНУТ: последние 3 секунды тают на глазах
    if (it.kind === 'shroom' || it.kind === 'bigshroom' || it.kind === 'gold') {
      it.life -= dt;
      if (it.life <= 0) {
        spawnSnowPuff(it.x, it.y, 2);
        G.pickups.splice(i, 1);
        continue;
      }
    }

    var d = dist(p.x, p.y, it.x, it.y);

    if ((it.kind === 'shroom' || it.kind === 'bigshroom' || it.kind === 'gold') && d < mr) {
      // магнит: гриб летит в рот
      var a = angTo(it.x, it.y, p.x, p.y);
      var pullSp = 340 + (mr - d) * 4;
      it.x += Math.cos(a) * pullSp * dt;
      it.y += Math.sin(a) * pullSp * dt;
    } else {
      it.x += (it.vx || 0) * dt;
      it.y += (it.vy || 0) * dt;
      if (it.vx) { it.vx *= Math.pow(0.01, dt); it.vy *= Math.pow(0.01, dt); }
    }

    if (d < 20) {
      G.pickups.splice(i, 1);
      if (it.kind === 'shroom') {
        var val = 1 + Math.floor(G.t / 300);
        gainXp(val);
        G.trip = clamp(G.trip + 2.2 * tripGainMul(), 0, 100);
        G.stats.mushrooms++;
        AU.gem();
        spawnSpark(it.x, it.y, 2, '#ffd76e');
        if (G.stats.mushrooms === 200) unlockAch('shrooms200');
      } else if (it.kind === 'bigshroom') {
        gainXp(8);
        G.trip = clamp(G.trip + 22 * tripGainMul(), 0, 100);
        G.stats.mushrooms += 4;
        floatText(p.x, p.y - 30, 'СЫТНЫЙ!', '#ffd76e', 17);
        AU.gift();
        spawnSpark(it.x, it.y, 8, '#ffd76e');
      } else if (it.kind === 'gold') {
        // ЗОЛОТОЙ ГРИБ: лакомый… и обманка. Лес просыпается.
        gainXp(6);
        G.trip = clamp(G.trip + 15 * tripGainMul(), 0, 100);
        G.stats.mushrooms += 2;
        floatText(p.x, p.y - 30, 'А ЗРЯ…', '#ff5b6e', 18);
        AU.howl();
        announce('✨ ЛЕС ПРОСНУЛСЯ', 1600);
        for (var ai = 0; ai < 6; ai++) {
          spawnAtRing(pick(['wolf', 'crow', 'hare']));
        }
        CAM.kick(0.4);
        unlockAch('gold');
        dedEvent('gold');
      } else if (it.kind === 'heart') {
      p.hp = Math.min(p.maxHp, p.hp + 25);
      floatText(p.x, p.y - 30, '+25 🫀', '#7bffb0', 17);
      AU.pop();
      if (Math.random() < 0.6) dedEvent('heart');
    } else if (it.kind === 'gift') {
        openGift();
      }
    }
  }
  // кап трофеев
  if (G.pickups.length > 380) G.pickups.splice(0, G.pickups.length - 380);
}

// ---- ПОДАРОК: слот-машина наград (спектакль — как сундуки VS) ----

function openGift() {
  G.stats.gifts++;
  AU.gift();
  CAM.kick(0.3);
  var p = G.player;
  var roll = Math.random();
  var txt;
  if (roll < 0.38) {
    // апгрейд случайного оружия
    var owned = [];
    for (var id in p.weapons) {
      if (p.weapons[id].lv < WEAPONS[id].max) owned.push(id);
    }
    if (owned.length) {
      var wid = pick(owned);
      p.weapons[wid].lv++;
      txt = WEAPONS[wid].ico + ' ' + WEAPONS[wid].name + ' → ур. ' + p.weapons[wid].lv;
    } else {
      p.hp = p.maxHp;
      txt = '🫀 ПОЛНОЕ ЗДОРОВЬЕ';
    }
  } else if (roll < 0.58) {
    p.hp = Math.min(p.maxHp, p.hp + 60);
    txt = '🫀 +60 ХП';
  } else if (roll < 0.82) {
    G.trip = 100;
    txt = '🍄 ПРИХОД НА ПОЛНОМ — ЖМИ [G]!';
  } else {
    gainXp(Math.max(4, G.level));
    txt = '⭐ +ОПЫТ';
  }
  var ov = $$('gift-overlay');
  $$('gift-text').textContent = txt;
  ov.classList.remove('hidden');
  spawnConfetti(p.x, p.y - 30, 30, 1.2);
  setTimeout(function () { ov.classList.add('hidden'); }, 1500);
}

// ══════════════════════════════════════ ОПЫТ И ЛЕВЕЛ-АП ═════════════════

function gainXp(n) {
  G.xp += n;
  while (G.xp >= G.xpNext) {
    G.xp -= G.xpNext;
    G.level++;
    G.levelQueue++;
    G.xpNext = Math.round(7 + G.level * 3.5 + Math.pow(G.level, 1.42));
    G.player.hp = Math.min(G.player.maxHp, G.player.hp + 8);
  }
  if (G.levelQueue > 0 && G.state === 'play') openLevelUp();
}

/** Пул карточек: новое оружие / апгрейд / пассивка / эволюция. */
function buildCardPool() {
  var p = G.player;
  var pool = [];
  for (var wid in WEAPONS) {
    var w = p.weapons[wid];
    if (!w) {
      if (Object.keys(p.weapons).length < 6)   // v3.0: до 6 оружий за забег
        pool.push({ kind: 'new-weapon', id: wid, w: 10 });
    } else if (w.lv < WEAPONS[wid].max) {
      pool.push({ kind: 'up-weapon', id: wid, w: 10 });
    }
  }
  for (var pid in PASSIVES) {
    var lv = pasLv(pid);
    if (lv < PASSIVES[pid].max) pool.push({ kind: 'passive', id: pid, w: 8 });
  }
  // ЭВОЛЮЦИИ: макс оружие + макс пара → секретная карточка
  for (var eid in EVOS) {
    var ew = p.weapons[eid];
    if (ew && ew.lv >= WEAPONS[eid].max && !p.evolved[eid] &&
        pasLv(EVOS[eid].req) >= PASSIVES[EVOS[eid].req].max) {
      pool.push({ kind: 'evo', id: eid, w: 100 });   // эволюция почти всегда выпадает
    }
  }
  return pool;
}

function pickCards(n) {
  var pool = buildCardPool();
  var out = [];
  for (var i = 0; i < n && pool.length; i++) {
    var total = 0, k;
    for (k = 0; k < pool.length; k++) total += pool[k].w;
    var r = Math.random() * total;
    var chosen = pool[0];
    for (k = 0; k < pool.length; k++) {
      r -= pool[k].w;
      if (r <= 0) { chosen = pool[k]; break; }
    }
    out.push(chosen);
    pool.splice(pool.indexOf(chosen), 1);
  }
  if (!out.length) out.push({ kind: 'snack', id: 'snack' });
  return out;
}

function cardView(card) {
  var p = G.player;
  if (card.kind === 'new-weapon') {
    var w = WEAPONS[card.id];
    return { ico: w.ico, name: w.name, lvl: 'НОВОЕ!', desc: w.desc, cls: 'weapon' };
  }
  if (card.kind === 'up-weapon') {
    var w2 = WEAPONS[card.id];
    var lv = p.weapons[card.id].lv;
    return {
      ico: w2.ico, name: w2.name, lvl: 'ур. ' + lv + ' → ' + (lv + 1),
      desc: w2.lvDesc[Math.min(lv - 1, w2.lvDesc.length - 1)], cls: 'weapon'
    };
  }
  if (card.kind === 'passive') {
    var ps = PASSIVES[card.id];
    var plv = pasLv(card.id);
    return { ico: ps.ico, name: ps.name, lvl: 'ур. ' + plv + ' → ' + (plv + 1), desc: ps.desc, cls: '' };
  }
  if (card.kind === 'evo') {
    var ev = EVOS[card.id];
    return { ico: ev.ico, name: ev.name, lvl: '✦ ЭВОЛЮЦИЯ ✦', desc: ev.desc, cls: 'evo' };
  }
  return { ico: '🍲', name: 'Грибной Пир', lvl: 'припасы', desc: '+40 ХП и +40 к приходу.', cls: '' };
}

function applyCard(card) {
  var p = G.player;
  if (card.kind === 'new-weapon') {
    p.weapons[card.id] = { lv: 1, cd: 0 };
    if (Object.keys(p.weapons).length >= 6) unlockAch('maxed');
  }
  else if (card.kind === 'up-weapon') p.weapons[card.id].lv++;
  else if (card.kind === 'passive') {
    p.passives[card.id] = pasLv(card.id) + 1;
    // Крепкий Организм: +30 МАКС. ХП сразу (и подлечить на столько же)
    if (card.id === 'hp') {
      p.maxHp += 30;
      p.hp = Math.min(p.maxHp, p.hp + 30);
      floatText(p.x, p.y - 34, '+30 макс. ХП', '#7bffb0', 16);
      spawnSpark(p.x, p.y, 10, '#7bffb0');
    }
  }
  else if (card.kind === 'evo') {
    p.evolved[card.id] = true;
    AU.evo();
    unlockAch('evo1');
    announce('✦ ' + EVOS[card.id].name + ' ✦', 2400, true);
    spawnConfetti(p.x, p.y, 50, 1.5);
    CAM.kick(0.6);
  } else {
    p.hp = Math.min(p.maxHp, p.hp + 40);
    G.trip = clamp(G.trip + 40, 0, 100);
  }
  G.levelQueue--;
}

var luOpen = false;
var luRerolled = false;   // один переброс на экран выбора

function renderCards(cards) {
  var wrap = $$('lu-cards');
  wrap.innerHTML = '';
  cards.forEach(function (card, i) {
    var v = cardView(card);
    var el = document.createElement('div');
    el.className = 'card ' + v.cls;
    el.innerHTML =
      '<div class="c-ico">' + v.ico + '</div>' +
      '<div class="c-name">' + v.name + '</div>' +
      '<div class="c-lvl">' + v.lvl + '</div>' +
      '<div class="c-desc">' + v.desc + '</div>';
    el.addEventListener('click', function () {
      applyCard(card);
      AU.pop();
      closeLevelUp();
    });
    wrap.appendChild(el);
  });
  luKeys = cards.slice();
  var rb = $$('btn-reroll');
  rb.disabled = luRerolled;
  rb.textContent = luRerolled ? '⟳ переброс использован' : '⟳ ПЕРЕБРОСИТЬ [R] — один раз';
}

function openLevelUp() {
  if (luOpen || G.state !== 'play') return;
  luOpen = true;
  luRerolled = false;
  G.state = 'levelup';
  AU.levelup();
  $$('lu-lvl').textContent = G.level;
  renderCards(pickCards(3));
  if (Math.random() < 0.5) dedEvent('levelup');
  $$('levelup').classList.remove('hidden');
}

function rerollCards() {
  if (!luOpen || luRerolled) return;
  luRerolled = true;
  AU.pop();
  renderCards(pickCards(3));
}

var luKeys = [];

function closeLevelUp() {
  luOpen = false;
  $$('levelup').classList.add('hidden');
  G.state = 'play';
  if (G.levelQueue > 0) setTimeout(openLevelUp, 120);
}

// выбор карточек клавишами 1-2-3, [R] — переброс
window.addEventListener('keydown', function (e) {
  if (G.state !== 'levelup') return;
  if (e.code === 'KeyR') { rerollCards(); return; }
  var idx = { Digit1: 0, Digit2: 1, Digit3: 2 }[e.code];
  if (idx !== undefined && luKeys[idx]) {
    applyCard(luKeys[idx]);
    AU.pop();
    closeLevelUp();
  }
});

// ═══════════════════════════════════════ РЕПЛИКИ ДЕДА ════════════════════
// Дед живой: комментирует ночь. Мультяшки молчат — они ненастоящие.

var DED_LINES = [
  '«Иди сюда, ирод…»',
  '«Грибы-то какие ладные!»',
  '«В моё время лес скромнее был»',
  '«Тапки надел бы, да тапки у медведя»',
  '«Ать-два, ать-два…»',
  '«Чай остынет, пока вы сдохнете»',
  '«Один я, один и останусь»',
  '«Зима, однако»',
  // v3.0: дед разошёлся
  '«Я вам не бабушка с оладьями!»',
  '«У меня в сенях валенки злее вас»',
  '«Мухоморчиков съел — и храбрый какой»',
  '«Лес у нас глупый пошёл. Раньше умнее был»',
  '«Это кто тут лапы распустил?!»',
  '«Ешьте снежок, снежок полезный»',
  '«В 1917-м и не такое видали»',
  '«Самоварчик бы сейчас… с мухоморчиком»',
  '«Не пой, окаянный, и так тошно»',
  '«Зять обещал заехать. Где-то застрял, видать»',
  '«У меня псари в таких случаях били»',
  '«Ты лось, а я — с топором. Кто из нас лес?»',
  '«Курочка по зёрнышку, а дед — по грибочку»',
  '«Полегче, полегче, тулуп казённый!»',
  '«Морозы у нас душевные. А вы — нет»',
  '«Вот вырасту — устрою вам»',
  '«Я на этом свете главный. Меня забыли спросить»',
  '«Ноги-руки целы? Значит, живём»',
  '«Не шуми, лес, дед думает»',
  '«Так вас, растительность недорезанная»',
  '«Раньше вон к нам медведи в гости ходили. С уважением»',
  '«Кому леща? Лещей всем!»',
  '«Утром расскажу — никто не поверит»',
  '«Голова тяжёлая… видно, умный стал»',
  '«Стоять!.. а, ну беги, беги»',
  '«В моё время и снег был белый»',
  '«Тьфу ты, напасть белогривая»',
  '«Ещё один порыв ветра — и я обижусь»',
  '«Держись, дед. Дед, держись»',
  '«Видал, как я их?.. Видал?»',
  '«Ах ты ж снеговик недоделанный»'
];

// Событийные реплики: дед реагирует на происходящее
var DED_EVENTS = {
  firstkill: ['«Первый — не считается! Второй — считается…»', '«Вот так-то. Кому ещё?»'],
  bosskill: ['«Старший был. Теперь — никто!»', '«Рога-копыта — на варежки!»', '«Тяжёлый, зараза. Но мой»'],
  lowhp: ['«Тулуп порван… но дед цел!»', '«Рано меня хоронить, лес!»'],
  gold: ['«Знал, что обманка. А всё равно взял»', '«Жадность — она грибная»'],
  dawn: ['«Скоро самовар… держись, дед»'],
  endless5: ['«Рассвет не пришёл. Значит, работаем»'],
  // v3.2: озвученные события (блип-речь + фраза)
  start: ['«Ну, с Богом, Манька…»', '«Идём. Ночь-то длинная…»'],
  hurt: ['«Ай-яй!»', '«Ох, зараза!»', '«Батюшки!»', '«Ты чего?!»'],
  heart: ['«Жив-жив!»', '«Ещё сто лет!»', '«То-то же!»'],
  zap: ['«Хлопай ушами!»', '«БА-БАХ, милые!»'],
  boss: ['«Ох, тыж-ж…»', '«Здравствуй, милай…»', '«Серьёзный, зараза…»'],
  levelup: ['«Во, брат!»', '«Силен ещё!»', '«Ух ты ж!»'],
  win: ['«РАССВЕТ! Дожили!»', '«Живой, Манька!»'],
  death: ['«Манька… прости…»', '«Грибы… всё… грибы…»']
};

// интонация голоса по событию
var DED_MOODS = {
  hurt: 'pain', lowhp: 'pain', death: 'sad',
  win: 'exc', bosskill: 'exc', zap: 'exc', levelup: 'exc', heart: 'exc',
  start: 'norm', boss: 'norm', gold: 'norm', dawn: 'norm', firstkill: 'norm', endless5: 'norm'
};

var dedSayT = 0;
function dedSay(force) {
  if (!force && dedSayT > G.t) return;
  dedSayT = G.t + 14;
  var p = G.player;
  if (!p) return;
  var line = pick(DED_LINES);
  // бормотание — тихонько, себе под нос: голос без текста над головой
  AU.dedTalk(line, 'norm');
  floatText(p.x, p.y - 44, line, '#aab7cc', 14, 2.2);
}

/** Событийная реплика (важное событие): голос + фраза, без задержки бормотания. */
function dedEvent(type) {
  var lines = DED_EVENTS[type];
  if (!lines) return;
  var p = G.player;
  if (!p) return;
  var line = pick(lines);
  var mood = DED_MOODS[type] || 'norm';
  // антиспам голоса: если движок занят — реплику не показываем (кроме смерти/победы)
  if (!AU.dedTalk(line, mood, type === 'death' || type === 'win' || type === 'boss')) return;
  floatText(p.x, p.y - 44, line, mood === 'pain' ? '#ff9d76' : '#ffd76e', 16, 2.2);
  dedSayT = Math.max(dedSayT, G.t + 8);
}

// ════════════════════════ РАДИО СТАНЦИИ (СЮЖЕТ) ══════════════════════════
// Пристань-Тихая вещает в пустоту. Дед слушает — иначе сойти с ума.

var RADIO_LINES = [
  { t: 22,  txt: '📻 «Пристань-Тихая» вызывает… есть кто живой? У нас керосин кончился' },
  { t: 95,  txt: '📻 …сводка с фронта: фронт ушёл на восток. Все. Никто не заметил' },
  { t: 155, txt: '📻 …гражданам велено сидеть по домам. Граждане, вы слышите? Сидеть' },
  { t: 245, txt: '📻 …на разъезде Заря замечен движущийся лес. Подтвердить нечем: очевидцев нет' },
  { t: 330, txt: '📻 …не ешьте жёлтый снег. И красный тоже не ешьте' },
  { t: 420, txt: '📻 …поезд №7 не придёт. Вообще. Не ждите' },
  { t: 480, txt: '📻 …метель усиливается. Кто в поле — тому крышка, кто в избе — двойная' },
  { t: 555, txt: '📻 …если слышите вой — не отвечайте. Вой — не собака, вой — лес' }
];

var RADIO_ENDLESS = [
  '📻 …щёт… щёт… несёт помехами',
  '📻 …тишина. Просто тишина',
  '📻 …дед, ты ещё там? Мы в тебя верили… кажется',
  '📻 …время на часах кончилось. Часы тоже',
  '📻 …повторяю: рассвета в эфире нет. Дежурство продолжается',
  '📻 …кто взял лампу? Лампу взял лес'
];

function updateRadio(dt) {
  if (!G.radioOn) return;
  G.radioT -= dt;
  if (G.radioT > 0) return;
  if (G.mode === 'classic' && G.radioIdx < RADIO_LINES.length) {
    var line = RADIO_LINES[G.radioIdx];
    if (G.t >= line.t) {
      G.radioIdx++;
      G.radioT = 14;
      radioSay(line.txt);
      return;
    }
    // до следующей строки далеко — ждать разницу
    G.radioT = Math.max(2, line.t - G.t);
    return;
  }
  // бесконечка / после всех строк: редкие помехи
  G.radioT = rnd(40, 70);
  radioSay(pick(RADIO_ENDLESS));
}

var radioEl = null, radioHide = null;
function radioSay(txt) {
  if (!radioEl) radioEl = $$('radio');
  if (!radioEl) return;
  radioEl.textContent = txt;
  radioEl.classList.add('show');
  AU.pop();
  if (radioHide) clearTimeout(radioHide);
  radioHide = setTimeout(function () { radioEl.classList.remove('show'); }, 6500);
}

// ════════════════════════════ ДОСТИЖЕНИЯ ════════════════════════════════
// Смешные ачивки с тостом — лес должен знать деда поимённо.

var ACHS = [
  { id: 'boss1',     ico: '🦴', name: 'Зубы как у мамы',  desc: 'Изгнать первого старшего леса' },
  { id: 'boss3',     ico: '👑', name: 'Ночной смотр',      desc: 'Всех трёх старших — за одну ночь' },
  { id: 'kills100',  ico: '💯', name: 'Сотня — не лимит',  desc: 'Изгнать 100 глюков за ночь' },
  { id: 'kills500',  ico: '🔥', name: 'И не запыхался',    desc: 'Изгнать 500 глюков за ночь' },
  { id: 'gold',      ico: '✨', name: 'А зря…',            desc: 'Схватить золотой гриб-обманку' },
  { id: 'shrooms200',ico: '🍄', name: 'Грибной король',    desc: 'Сожрать 200 грибов за ночь' },
  { id: 'evo1',      ico: '✦',  name: 'Дед-кулибин',       desc: 'Собрать первую эволюцию оружия' },
  { id: 'untouch',   ico: '🕊️', name: 'Неприкасаемый',     desc: '5 минут ни разу не получить по тулупу' },
  { id: 'zap3',      ico: '💥', name: 'Три залпа',         desc: 'Три грибных залпа за одну ночь' },
  { id: 'winner',    ico: '🌅', name: 'До рассвета',       desc: 'Дожить до утра в обычной ночи' },
  { id: 'endless10', ico: '🌙', name: 'Донышка',           desc: 'Продержаться 10 минут в бесконечной ночи' },
  { id: 'maxed',     ico: '🛠️', name: 'Полный набор',      desc: 'Носить 6 оружий одновременно' }
];

function getAchs() {
  try { return JSON.parse(localStorage.getItem('dedAch') || '{}'); }
  catch (e) { return {}; }
}

var achToastQ = [];
function unlockAch(id) {
  var def = null;
  for (var i = 0; i < ACHS.length; i++) if (ACHS[i].id === id) def = ACHS[i];
  if (!def) return;
  var got = getAchs();
  if (got[id]) return;              // уже есть
  got[id] = Math.floor(Date.now() / 1000);
  try { localStorage.setItem('dedAch', JSON.stringify(got)); } catch (e) { /* приватный режим */ }
  achToastQ.push(def);
  pumpAchToasts();
}

var achPumping = false;
function pumpAchToasts() {
  if (achPumping || !achToastQ.length) return;
  achPumping = true;
  var def = achToastQ.shift();
  var el = $$('ach-toast');
  if (!el) { achPumping = false; return; }
  el.innerHTML =
    '<span class="at-ico">' + def.ico + '</span>' +
    '<div><div class="at-name">' + def.name + '</div>' +
    '<div class="at-desc">' + def.desc + '</div></div>';
  el.classList.add('show');
  AU.gift();
  setTimeout(function () {
    el.classList.remove('show');
    setTimeout(function () { achPumping = false; pumpAchToasts(); }, 350);
  }, 2600);
}

function renderAchs() {
  var wrap = $$('ach-list');
  if (!wrap) return;
  var got = getAchs();
  var html = '';
  var n = 0;
  for (var i = 0; i < ACHS.length; i++) {
    var a = ACHS[i];
    var has = !!got[a.id];
    if (has) n++;
    html += '<div class="ach' + (has ? ' got' : '') + '">' +
      '<span class="ach-ico">' + (has ? a.ico : '🔒') + '</span>' +
      '<div><div class="ach-name">' + a.name + '</div>' +
      '<div class="ach-desc">' + a.desc + '</div></div></div>';
  }
  wrap.innerHTML = '<div class="ach-total">Открыто: ' + n + ' из ' + ACHS.length + '</div>' + html;
}

// ════════════════════════════════════ ПРИХОД И ГРИБНОЙ ЗАЛП ═════════════

function updateTrip(dt) {
  if (G.zapT > 0) {
    G.zapT -= dt;
    G.zapFlash = Math.max(0, G.zapFlash - dt);
    // радужный мир
    canvas.style.filter = 'saturate(1.7) contrast(1.06) hue-rotate(' +
      Math.floor(G.zapT * 120) % 360 + 'deg)';
    // конфетти-дождь
    if (Math.random() < dt * 24) {
      spawnConfetti(G.player.x + rnd(-VW / 3, VW / 3), G.player.y + rnd(-VH / 3, VH / 3), 3);
    }
    if (G.zapT <= 0) canvas.style.filter = '';
  } else {
    G.trip = clamp(G.trip - 0.5 * dt, 0, 100);
  }
}

function tryZap() {
  if (G.state !== 'play' || G.trip < 100 || G.zapT > 0) return;
  G.trip = 0;
  G.zapT = 5;
  G.zapFlash = 0.4;
  G.zapCount++;
  if (G.zapCount >= 3) unlockAch('zap3');
  var p = G.player;
  AU.zap();
  CAM.kick(1.2);
  hitstop = Math.max(hitstop, 0.1);
  announce('🍄 ГРИБНОЙ ЗАЛП! 🍄', 1500, true);
  floatText(p.x, p.y - 40, 'БА-БАХ!', '#ffd76e', 26);
  dedEvent('zap');
  particles.push({ kind: 'shock', x: p.x, y: p.y, t: 0, life: 0.6, r0: 20, r1: 340, col: '#b16bff' });
  spawnConfetti(p.x, p.y, 70, 1.6);
  var dmg = (55 + 14 * pasLv('shroom')) * dmgMul();
  for (var i = 0; i < G.enemies.length; i++) {
    var e = G.enemies[i];
    if (e.dead) continue;
    if (dist2(p.x, p.y, e.x, e.y) < 320 * 320) {
      hurtEnemy(e, dmg, p.x, p.y, e.boss ? 200 : 520);
    }
  }
}

// ════════════════════════════════════════════════ ОБЪЯВЛЕНИЯ ════════════

var annT = null;
function announce(txt, ms, rainbow) {
  var el = $$('announce');
  el.textContent = txt;
  el.className = rainbow ? 'show rainbow' : 'show';
  // перезапуск анимации
  void el.offsetWidth;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
  if (annT) clearTimeout(annT);
  annT = setTimeout(function () { el.classList.remove('show'); }, ms || 1800);
}

// ══════════════════════════════════════════════════ РЕНДЕР ══════════════

function render() {
  ctx.save();
  // масштаб и камера
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.scale(SCALE, SCALE);
  ctx.translate(-CAM.x + CAM.shakeX, -CAM.y + CAM.shakeY);

  drawGround();
  if (G.player) {
    drawPickups();
    drawCrowMarks();
    drawEntities();
    drawWeaponFx();
    drawBullets();
    drawParticles();
  }

  ctx.restore();

  // экранные слои: снег, сияние, рассвет, вспышки, вигнетка
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  drawAurora();
  drawSnowfall();

  // РАССВЕТ: последняя минута — восток наливается золотом
  if (G.dawn && G.state === 'play') {
    var dawnK = clamp((G.t - (RUN_TIME - 60)) / 60, 0, 1);
    var dg = ctx.createLinearGradient(canvas.width, 0, canvas.width * 0.4, 0);
    dg.addColorStop(0, 'rgba(255, 170, 90, ' + (dawnK * 0.5) + ')');
    dg.addColorStop(0.5, 'rgba(255, 120, 110, ' + (dawnK * 0.22) + ')');
    dg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = dg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // вспышка урона деду
  if (G.player && G.player.hitFx > 0) {
    ctx.fillStyle = 'rgba(255, 60, 80, ' + (G.player.hitFx * 0.5) + ')';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  // вспышка залпа
  if (G.zapFlash > 0) {
    ctx.fillStyle = 'rgba(255, 220, 140, ' + (G.zapFlash * 0.9) + ')';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  // вигнетка
  var vg = ctx.createRadialGradient(
    canvas.width / 2, canvas.height / 2, canvas.height * 0.42,
    canvas.width / 2, canvas.height / 2, canvas.height * 0.85);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(2,4,10,0.55)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // низкое ХП — пульс тревоги
  if (G.state === 'play' && G.player && G.player.hp < 30) {
    var pulse = (Math.sin(performance.now() / 180) + 1) / 2;
    var lg = ctx.createRadialGradient(
      canvas.width / 2, canvas.height / 2, canvas.height * 0.3,
      canvas.width / 2, canvas.height / 2, canvas.height * 0.75);
    lg.addColorStop(0, 'rgba(0,0,0,0)');
    lg.addColorStop(1, 'rgba(255, 40, 60, ' + (0.12 + pulse * 0.14) + ')');
    ctx.fillStyle = lg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // босс-бар
  if (G.bossAlive && !G.bossAlive.dead) drawBossBar();
  ctx.restore();
}

function drawPickups() {
  for (var i = 0; i < G.pickups.length; i++) {
    var it = G.pickups[i];
    var bob = Math.sin(it.t * 5) * 2.5;
    if (it.kind === 'shroom' || it.kind === 'bigshroom' || it.kind === 'gold') {
      var pull = dist2(it.x, it.y, G.player.x, G.player.y) < magnetR() * magnetR();
      var fade = it.life < 3 ? clamp(it.life / 3, 0.15, 1) : 1;   // гриб гаснет
      var sc = it.kind === 'bigshroom' ? 1.55 : (it.kind === 'gold' ? 1.2 : 1);
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.translate(it.x, it.y + bob);
      ctx.scale(sc, sc);
      if (pull) ctx.rotate(Math.sin(it.t * 20) * 0.4);
      // ножка
      ctx.fillStyle = '#e8dfc8';
      ctx.fillRect(-2.5, -2, 5, 7);
      // шляпка: красная / золотая
      ctx.fillStyle = it.kind === 'gold' ? '#ffce4d' : '#e04848';
      ctx.beginPath();
      ctx.ellipse(0, -4, 8, 6, 0, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(-3.5, -6, 1.6, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(3, -7, 1.3, 0, TAU); ctx.fill();
      // золотой — манящее сияние
      if (it.kind === 'gold') {
        ctx.globalAlpha = fade * (0.3 + Math.sin(it.t * 6) * 0.15);
        ctx.fillStyle = '#ffce4d';
        ctx.beginPath(); ctx.arc(0, -4, 15, 0, TAU); ctx.fill();
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    } else if (it.kind === 'heart') {
      ctx.font = '18px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('❤️', it.x, it.y + bob + 6);
    } else if (it.kind === 'gift') {
      var pulse = 1 + Math.sin(it.t * 6) * 0.12;
      ctx.save();
      ctx.translate(it.x, it.y + bob);
      ctx.scale(pulse, pulse);
      ctx.font = '24px sans-serif';
      ctx.textAlign = 'center';
      // сияние
      ctx.fillStyle = 'rgba(255, 215, 110, 0.25)';
      ctx.beginPath(); ctx.arc(0, 0, 20 + Math.sin(it.t * 4) * 4, 0, TAU); ctx.fill();
      ctx.fillText('🎁', 0, 8);
      ctx.restore();
    }
  }
  ctx.textAlign = 'left';
}

/** Метки на снегу: сюда будет удар — уходи с точки. */
function drawCrowMarks() {
  for (var i = 0; i < G.enemies.length; i++) {
    var e = G.enemies[i];
    var isCrow = e.type === 'crow' && (e.wst === 1 || e.wst === 2);
    var isOwl = e.type === 'owl' && e.wst === 1;
    if (!isCrow && !isOwl) continue;
    var pulse = 0.5 + Math.sin(G.t * 14) * 0.3;
    ctx.strokeStyle = 'rgba(255, 91, 110, ' + pulse + ')';
    if (isOwl) ctx.strokeStyle = 'rgba(157, 255, 224, ' + pulse + ')';
    ctx.lineWidth = 2.4;
    var rad = isOwl ? 58 : 16;   // сова роняет бомбу пошире
    // круг-прицел
    ctx.beginPath();
    ctx.arc(e.tx, e.ty, rad, 0, TAU);
    ctx.stroke();
    // крест
    ctx.beginPath();
    ctx.moveTo(e.tx - rad - 6, e.ty); ctx.lineTo(e.tx - rad - 2, e.ty);
    ctx.moveTo(e.tx + rad + 2, e.ty); ctx.lineTo(e.tx + rad + 6, e.ty);
    ctx.moveTo(e.tx, e.ty - rad - 6); ctx.lineTo(e.tx, e.ty - rad - 2);
    ctx.moveTo(e.tx, e.ty + rad + 2); ctx.lineTo(e.tx, e.ty + rad + 6);
    ctx.stroke();
  }
}

function drawEntities() {
  var list = G.enemies.slice();
  list.push(G.player);
  list.sort(function (a, b) { return a.y - b.y; });
  for (var i = 0; i < list.length; i++) {
    var e = list[i];
    if (e === G.player) drawPlayer(e);
    else drawEnemy(e);
  }
}

// ════════════════════════════ ВИЗУАЛ ОРУЖИЙ ДЕДА ═════════════════════════
// Оружия должно быть ВИДНО: орбиты, спрайты, кольца. Рисуем каждый кадр.

function drawWeaponFx() {
  var p = G.player;
  if (!p) return;

  // ГРИБНАЯ АУРА: пульсирующее споровое поле
  if (p.weapons.aura) {
    var aw = p.weapons.aura;
    var ar = 92 + 16 * aw.lv + (p.evolved.aura ? 55 : 0);
    var puls = 0.5 + Math.sin(G.t * 4) * 0.12;
    var ag = ctx.createRadialGradient(p.x, p.y, ar * 0.3, p.x, p.y, ar);
    ag.addColorStop(0, 'rgba(177,107,255,0)');
    ag.addColorStop(0.75, 'rgba(177,107,255,' + (0.10 + 0.06 * puls) + ')');
    ag.addColorStop(1, 'rgba(255,122,217,' + (0.22 + 0.1 * puls) + ')');
    ctx.fillStyle = ag;
    ctx.beginPath(); ctx.arc(p.x, p.y, ar, 0, TAU); ctx.fill();
    // споры-точки по кромке
    ctx.fillStyle = 'rgba(255,122,217,0.65)';
    for (var si = 0; si < 10; si++) {
      var sa = G.t * 0.7 + si * TAU / 10;
      ctx.beginPath();
      ctx.arc(p.x + Math.cos(sa) * (ar - 6), p.y + Math.sin(sa) * (ar - 6), 2, 0, TAU);
      ctx.fill();
    }
  }

  // КОТ БАРСИК(И): орбитальные коты
  if (p.weapons.cat) {
    var cw = p.weapons.cat;
    var cr = 74 + 12 * cw.lv + (p.evolved.cat ? 14 : 0);
    var cats = (cw.lv >= 3 ? 2 : 1) + (p.evolved.cat ? 1 : 0);
    for (var ci = 0; ci < cats; ci++) {
      var ca = p.catOrb + ci * (TAU / cats);
      var cx = p.x + Math.cos(ca) * cr;
      var cy = p.y + Math.sin(ca) * cr;
      drawCat(cx, cy, ca, p.evolved.cat);
    }
  }

  // ТОПОР(Ы): тяжёлая орбита
  if (p.weapons.axe) {
    var axw = p.weapons.axe;
    var axr = 100 + 16 * axw.lv + (p.evolved.axe ? 34 : 0);
    var axes = (axw.lv >= 3 ? 2 : 1) + (p.evolved.axe ? 1 : 0);
    for (var xi = 0; xi < axes; xi++) {
      var xa = p.axeOrb + xi * (TAU / axes);
      drawAxe(p.x + Math.cos(xa) * axr, p.y + Math.sin(xa) * axr, xa + p.axeOrb * 2);
    }
  }

  // КЛЮШКА(И): вращающийся луч
  if (p.weapons.klushka) {
    var klw = p.weapons.klushka;
    var klR = 96 + 14 * klw.lv + (p.evolved.klushka ? 30 : 0);
    var klN = p.evolved.klushka ? 2 : 1;
    for (var ki = 0; ki < klN; ki++) {
      var kA = p.klushA + ki * Math.PI;
      // след лопасти
      ctx.globalAlpha = 0.25;
      ctx.strokeStyle = '#9dd6ff';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.arc(p.x, p.y, klR * 0.8, kA - 0.75, kA - 0.1);
      ctx.stroke();
      ctx.globalAlpha = 1;
      // сама клюшка: рукоять от деда + крюк на конце
      var kx1 = p.x + Math.cos(kA) * klR * 0.45, ky1 = p.y + Math.sin(kA) * klR * 0.45;
      var kx2 = p.x + Math.cos(kA) * klR, ky2 = p.y + Math.sin(kA) * klR;
      ctx.strokeStyle = '#c98f5a';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(kx1, ky1); ctx.lineTo(kx2, ky2); ctx.stroke();
      // крюк клюшки
      ctx.strokeStyle = '#e8dfc8';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(kx2 - Math.cos(kA) * 8, ky2 - Math.sin(kA) * 8, 9, kA + 0.5, kA + 2.4);
      ctx.stroke();
      // искорка на кончике
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(kx2, ky2, 2.4, 0, TAU); ctx.fill();
    }
  }

  // САМОВАР: за спиной деда, носик смотрит по прицелу, идёт пар
  if (p.weapons.samovar) {
    var smA = p.aimT > 0 ? p.moveA : (p.face > 0 ? 0 : Math.PI);
    ctx.save();
    ctx.translate(p.x - p.face * 16, p.y - 14);
    // корпус
    ctx.fillStyle = '#d9a441';
    ctx.beginPath(); ctx.ellipse(0, 0, 9, 11, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#f4c960';
    ctx.beginPath(); ctx.ellipse(0, -2, 7, 8, 0, 0, TAU); ctx.fill();
    // ножки и ручки
    ctx.strokeStyle = '#8a6a2a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-4, 10); ctx.lineTo(-6, 14);
    ctx.moveTo(4, 10); ctx.lineTo(6, 14);
    ctx.stroke();
    // крышечка
    ctx.fillStyle = '#8a6a2a';
    ctx.beginPath(); ctx.ellipse(0, -11, 4, 2.4, 0, 0, TAU); ctx.fill();
    // носик по направлению пара
    ctx.strokeStyle = '#d9a441';
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.moveTo(Math.cos(smA) * 4, Math.sin(smA) * 4 - 2);
    ctx.lineTo(Math.cos(smA) * 14, Math.sin(smA) * 14 - 4);
    ctx.stroke();
    ctx.restore();
  }
}

/** Кот Барсик: рыжий, с хвостом-маятником; легенда — с сиянием. */
function drawCat(x, y, ang, legend) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang + Math.PI / 2);   // мордой по ходу орбиты
  if (legend) {
    ctx.shadowColor = '#ffd76e';
    ctx.shadowBlur = 12;
  }
  // хвост-маятник
  ctx.strokeStyle = '#e8944a';
  ctx.lineWidth = 3.4;
  ctx.beginPath();
  ctx.moveTo(-8, 6);
  ctx.quadraticCurveTo(-16, Math.sin(G.t * 8) * 6 + 4, -20, Math.sin(G.t * 8) * 9);
  ctx.stroke();
  // тело
  ctx.fillStyle = '#e8944a';
  ctx.beginPath(); ctx.ellipse(0, 0, 10, 8, 0, 0, TAU); ctx.fill();
  // голова
  ctx.beginPath(); ctx.arc(0, -7, 6, 0, TAU); ctx.fill();
  // уши
  ctx.beginPath();
  ctx.moveTo(-5, -10); ctx.lineTo(-7, -16); ctx.lineTo(-1, -11);
  ctx.moveTo(5, -10); ctx.lineTo(7, -16); ctx.lineTo(1, -11);
  ctx.fill();
  ctx.shadowBlur = 0;
  // морда: глазки и усики
  ctx.fillStyle = '#1a1a2e';
  ctx.beginPath(); ctx.arc(-2, -8, 1.2, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(2, -8, 1.2, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.65)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-4, -5); ctx.lineTo(-9, -4);
  ctx.moveTo(4, -5); ctx.lineTo(9, -4);
  ctx.stroke();
  // когти блеснули
  if (Math.random() < 0.06) {
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(4, 2); ctx.lineTo(11, -2);
    ctx.stroke();
  }
  ctx.restore();
}

/** Топор: вращается, лезвие блестит. */
function drawAxe(x, y, rot) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  // рукоять
  ctx.strokeStyle = '#8a6a2a';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, 12); ctx.lineTo(0, -12); ctx.stroke();
  // лезвие
  ctx.fillStyle = '#cfd8e8';
  ctx.beginPath();
  ctx.moveTo(0, -12);
  ctx.lineTo(11, -16);
  ctx.lineTo(12, -6);
  ctx.lineTo(0, -4);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(2, -13); ctx.lineTo(10, -14.4); ctx.stroke();
  // обух
  ctx.fillStyle = '#6a7a8a';
  ctx.fillRect(-4, -13, 4, 8);
  ctx.restore();
}

function drawEnemy(e) {
  ctx.save();
  ctx.translate(e.x, e.y);
  var s = e.r / 14;   // нормировка: волк = 1
  ctx.scale(s, s);

  // тень
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(0, 12, 13, 4.5, 0, 0, TAU);
  ctx.fill();

  var body = e.flash > 0 ? '#ffffff' : e.col;
  var step = Math.sin(e.t * 10) * 2;   // топот мультяшек

  // ВОЛК ПРИСЕЛ перед рывком — сплющен и дрожит, читай телеграф
  if (e.type === 'wolf' && e.wst === 1) {
    ctx.scale(1.12, 0.74);
    ctx.translate(rnd(-1.2, 1.2), 0);
  }
  // ВОРОНА ЗАМЕРЛА — зависла, крылья расправлены
  if (e.type === 'crow' && e.wst === 1) step = 0;

  if (e.type === 'wolf' || (e.boss === 'alpha')) {
    // уши
    ctx.fillStyle = body;
    tri(-8, -14, -12, -22, -2, -16);
    tri(8, -14, 12, -22, 2, -16);
    // тело
    ctx.beginPath(); ctx.ellipse(0, 0, 14, 11, 0, 0, TAU); ctx.fill();
    // морда
    ctx.beginPath(); ctx.ellipse(10 * (1), 2, 7, 5, 0, 0, TAU); ctx.fill();
    // язык
    ctx.fillStyle = '#ff5b6e';
    ctx.beginPath(); ctx.ellipse(13, 5, 3.4, 4.6 + step * 0.3, 0.4, 0, TAU); ctx.fill();
    // лапы
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.ellipse(-6, 10 + step, 3.4, 2.6, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(6, 10 - step, 3.4, 2.6, 0, 0, TAU); ctx.fill();
    face(e, 4, -3);
  } else if (e.type === 'hare') {
    // длинные уши
    ctx.fillStyle = body;
    ctx.save();
    ctx.rotate(-0.2 + step * 0.05);
    ctx.beginPath(); ctx.ellipse(-4, -18, 2.6, 9, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(4, -18, 2.6, 9, 0.2, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.beginPath(); ctx.ellipse(0, 0, 9, 8, 0, 0, TAU); ctx.fill();
    // хвостик
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(-9, -2, 3.4, 0, TAU); ctx.fill();
    face(e, 2, -3);
  } else if (e.type === 'bandit') {
    // тело
    ctx.beginPath(); ctx.ellipse(0, 2, 11, 10, 0, 0, TAU); ctx.fill();
    // шапка-ушанка
    ctx.fillStyle = '#3a3a4e';
    ctx.beginPath(); ctx.ellipse(0, -8, 10, 6, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#2a2a3a';
    ctx.fillRect(-11, -7, 22, 3);
    // шарф
    ctx.fillStyle = '#ff5b6e';
    ctx.fillRect(-8, 0, 16, 4);
    face(e, 0, -8);
  } else if (e.type === 'crow') {
    var flap = Math.sin(e.t * 16) * 6;
    // крылья
    ctx.fillStyle = body;
    tri(-4, -2, -20, -6 - flap, -4, 5);
    tri(4, -2, 20, -6 - flap, 4, 5);
    ctx.beginPath(); ctx.ellipse(0, 0, 8, 7, 0, 0, TAU); ctx.fill();
    // клюв
    ctx.fillStyle = '#ffd76e';
    tri(6, -2, 14, 0, 6, 3);
    face(e, 2, -3);
  } else if (e.type === 'bear') {
    // уши
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.arc(-11, -13, 5, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(11, -13, 5, 0, TAU); ctx.fill();
    ctx.fillStyle = '#0a0d16';
    ctx.beginPath(); ctx.arc(-11, -13, 2.2, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(11, -13, 2.2, 0, TAU); ctx.fill();
    // тело
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.ellipse(0, 0, 15, 13, 0, 0, TAU); ctx.fill();
    // пасть
    ctx.fillStyle = '#0a0d16';
    ctx.beginPath(); ctx.ellipse(6, 4, 5, 3.4, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillRect(3, 1.4, 2.4, 2.8);
    ctx.fillRect(7.4, 1.4, 2.4, 2.8);
    face(e, 4, -4);
  } else if (e.type === 'moose') {
    // ЛОСЬ: рога-лопаты + тяжёлая морда. Присел (wst 1) — сейчас таран!
    if (e.wst === 1) { ctx.scale(1.15, 0.8); ctx.translate(rnd(-1.5, 1.5), 0); }
    ctx.fillStyle = body;
    // рога
    ctx.strokeStyle = '#e8dfc8';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(-5, -12); ctx.lineTo(-12, -22); ctx.moveTo(-12, -22); ctx.lineTo(-18, -20);
    ctx.moveTo(-12, -22); ctx.lineTo(-14, -27);
    ctx.moveTo(5, -12); ctx.lineTo(12, -22); ctx.moveTo(12, -22); ctx.lineTo(18, -20);
    ctx.moveTo(12, -22); ctx.lineTo(14, -27);
    ctx.stroke();
    // тело
    ctx.beginPath(); ctx.ellipse(0, 0, 16, 11, 0, 0, TAU); ctx.fill();
    // горбатая холка
    ctx.beginPath(); ctx.ellipse(-4, -6, 9, 7, -0.3, 0, TAU); ctx.fill();
    // морда
    ctx.beginPath(); ctx.ellipse(13, 1, 8, 5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#3a2a1a';
    ctx.beginPath(); ctx.ellipse(18, 2, 3.4, 2.2, 0, 0, TAU); ctx.fill();
    // копыта
    ctx.fillStyle = '#3a2a1a';
    ctx.beginPath(); ctx.ellipse(-7, 10 + step, 3.6, 2.8, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(7, 10 - step, 3.6, 2.8, 0, 0, TAU); ctx.fill();
    face(e, 6, -4);
  } else if (e.type === 'marten') {
    // КУНИЦА: длинный гибкий корпус, мельтешит
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.ellipse(0, 0, 13, 6, 0, 0, TAU); ctx.fill();
    // хвост-волна
    ctx.strokeStyle = body;
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.moveTo(-11, 0);
    ctx.quadraticCurveTo(-18, Math.sin(e.t * 12) * 6, -22, Math.sin(e.t * 12) * 8);
    ctx.stroke();
    // мордочка
    ctx.beginPath(); ctx.ellipse(11, -1, 5, 4, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#1a1a2e';
    ctx.beginPath(); ctx.arc(12, -3, 1.6, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(15, -1.6, 1.6, 0, TAU); ctx.fill();
    // лапки-семечки
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.ellipse(-5, 6 + step, 2.2, 1.8, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(5, 6 - step, 2.2, 1.8, 0, 0, TAU); ctx.fill();
  } else if (e.type === 'snowman' || e.type === 'mini') {
    // СНЕГОВИК/СНЕГАВЧИК: два-три кома, морковка, ведро
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.arc(0, 4, 11, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(0, -7, 8, 0, TAU); ctx.fill();
    // морковка
    ctx.fillStyle = '#ff8c42';
    tri(8, -8, 15, -6, 8, -4);
    // глаза-уголья
    ctx.fillStyle = '#1a1a2e';
    ctx.beginPath(); ctx.arc(3, -10, 1.3, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(6.4, -10, 1.3, 0, TAU); ctx.fill();
    // ведро
    ctx.fillStyle = '#5a6a8a';
    ctx.fillRect(-6, -17, 12, 4);
    // злая улыбка
    ctx.strokeStyle = '#1a1a2e';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(2, -5); ctx.lineTo(7, -4.4); ctx.stroke();
  } else if (e.type === 'mouse') {
    // ПОЛЁВКА: крохотный пузик и уши-локаторы
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.ellipse(0, 0, 7, 5, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(-3, -5, 3, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(3, -5, 3, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(5.4, -1, 1.1, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(7.6, -0.4, 1.1, 0, TAU); ctx.fill();
    // хвостик
    ctx.strokeStyle = body;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-6, 2);
    ctx.quadraticCurveTo(-12, 4 + Math.sin(e.t * 14) * 3, -14, 2);
    ctx.stroke();
  } else if (e.type === 'owl') {
    // СОВА: круглая голова с «очками», крылья размеренно машут
    var oflap = Math.sin(e.t * 9) * 5;
    if (e.wst === 1) oflap = 0;   // зависла — замерла
    ctx.fillStyle = body;
    tri(-4, -2, -18, -8 - oflap, -4, 5);
    tri(4, -2, 18, -8 - oflap, 4, 5);
    ctx.beginPath(); ctx.ellipse(0, 0, 10, 11, 0, 0, TAU); ctx.fill();
    // «очки» совы
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(-4, -4, 4.4, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(4, -4, 4.4, 0, TAU); ctx.fill();
    ctx.fillStyle = '#1a1a2e';
    var olx = Math.cos(angTo(e.x, e.y, G.player.x, G.player.y)) * 1.6;
    ctx.beginPath(); ctx.arc(-4 + olx, -4, 2, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(4 + olx, -4, 2, 0, TAU); ctx.fill();
    // клюв
    ctx.fillStyle = '#ffd76e';
    tri(0, -1.6, 2.4, 1.4, -2.4, 1.4);
    // ушные пучки
    ctx.fillStyle = body;
    tri(-7, -12, -9, -18, -3, -13);
    tri(7, -12, 9, -18, 3, -13);
  }

  // корона элиты
  if (e.elite) {
    ctx.fillStyle = '#ffd76e';
    ctx.beginPath();
    ctx.moveTo(-8, -22); ctx.lineTo(-8, -30); ctx.lineTo(-4, -25);
    ctx.lineTo(0, -32); ctx.lineTo(4, -25); ctx.lineTo(8, -30); ctx.lineTo(8, -22);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();

  // ХП-бар над элитой/боссом
  if ((e.elite || e.boss) && e.hp < e.maxHp) {
    var w = e.boss ? 90 : 40;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(e.x - w / 2, e.y - e.r - 22, w, 6);
    ctx.fillStyle = e.boss ? '#ff5b6e' : '#ffd76e';
    ctx.fillRect(e.x - w / 2 + 1, e.y - e.r - 21, (w - 2) * clamp(e.hp / e.maxHp, 0, 1), 4);
  }
}

function tri(x1, y1, x2, y2, x3, y3) {
  ctx.beginPath();
  ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3);
  ctx.closePath(); ctx.fill();
}

/** Глаза мультяшки: белки + зрачки в сторону деда (глюки СМОТРЯТ). */
function face(e, ox, oy) {
  var p = G.player;
  var a = angTo(e.x, e.y, p.x, p.y);
  var lx = Math.cos(a) * 1.5, ly = Math.sin(a) * 1.5;
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(ox - 4, oy, 3.6, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(ox + 4, oy, 3.6, 0, TAU); ctx.fill();
  ctx.fillStyle = '#1a1a2e';
  ctx.beginPath(); ctx.arc(ox - 4 + lx, oy + ly, 1.7, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(ox + 4 + lx, oy + ly, 1.7, 0, TAU); ctx.fill();
  // сердитые брови
  ctx.strokeStyle = '#1a1a2e';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(ox - 7.6, oy - 5); ctx.lineTo(ox - 1.4, oy - 3.2);
  ctx.moveTo(ox + 7.6, oy - 5); ctx.lineTo(ox + 1.4, oy - 3.2);
  ctx.stroke();
}

function drawPlayer(p) {
  ctx.save();
  ctx.translate(p.x, p.y);

  // тень
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(0, 16, 14, 5, 0, 0, TAU);
  ctx.fill();

  var bob = Math.sin(p.walkT * 11) * 2;
  var blink = p.iframe > 0 && Math.floor(p.iframe * 14) % 2 === 0;
  if (blink) ctx.globalAlpha = 0.4;

  // свечение в трипе
  if (G.zapT > 0) {
    ctx.shadowColor = '#b16bff';
    ctx.shadowBlur = 24;
  }

  // ПОДСВЕТКА ДЕДА: когда врагов много — светящееся кольцо под ногами,
  // чтобы не терять персонажа в куче (замечание VLM-ревью читаемости)
  var nearN = 0;
  for (var ni = 0; ni < G.enemies.length; ni++) {
    if (!G.enemies[ni].dead && dist2(G.enemies[ni].x, G.enemies[ni].y, p.x, p.y) < 160 * 160) nearN++;
  }
  if (nearN >= 6) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 215, 110, ' + (0.35 + Math.sin(G.t * 6) * 0.15) + ')';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(0, 15, 20, 8, 0, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  var f = p.face;   // 1 = вправо
  ctx.scale(f, 1);

  // валенки
  ctx.fillStyle = '#5b4230';
  ctx.fillRect(-9, 10 + bob * 0.4, 8, 7);
  ctx.fillRect(2, 10 - bob * 0.4, 8, 7);

  // тулуп
  ctx.fillStyle = '#7a5c3e';
  ctx.beginPath();
  ctx.moveTo(-11, -8); ctx.lineTo(11, -8);
  ctx.lineTo(13, 12); ctx.lineTo(-13, 12);
  ctx.closePath(); ctx.fill();
  // мех воротника
  ctx.fillStyle = '#e8dfc8';
  ctx.fillRect(-11, -10, 22, 5);
  // пояс
  ctx.fillStyle = '#4a3526';
  ctx.fillRect(-12, 1, 24, 4);

  // борода
  ctx.fillStyle = '#e8eef6';
  ctx.beginPath();
  ctx.moveTo(-7, -8); ctx.lineTo(8, -8);
  ctx.lineTo(5, 6); ctx.lineTo(-2, 6);
  ctx.closePath(); ctx.fill();

  // нос
  ctx.fillStyle = '#ffb0a0';
  ctx.beginPath(); ctx.arc(5, -6, 2.6, 0, TAU); ctx.fill();

  // глаза
  ctx.fillStyle = '#1a1a2e';
  ctx.beginPath(); ctx.arc(2.4, -11, 1.3, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(7.4, -11, 1.3, 0, TAU); ctx.fill();

  // треух с красным верхом
  ctx.fillStyle = '#b03040';
  ctx.beginPath();
  ctx.ellipse(1, -16, 11, 7, 0, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = '#8a2433';
  ctx.fillRect(-10, -17, 22, 4);
  // помпон
  ctx.fillStyle = '#e8dfc8';
  ctx.beginPath(); ctx.arc(-8, -14, 3, 0, TAU); ctx.fill();

  ctx.restore();

  // кот Барсик на орбите
  if (p.weapons.cat) {
    var cw = p.weapons.cat;
    var cr = 74 + 12 * cw.lv;
    var cats = cw.lv >= 3 ? 2 : 1;
    for (var i = 0; i < cats; i++) {
      var ca = p.catOrb + i * Math.PI;
      drawCat(p.x + Math.cos(ca) * cr, p.y + Math.sin(ca) * cr, ca);
    }
  }
  // грибная аура
  if (p.weapons.aura) {
    var ar = 92 + 16 * p.weapons.aura.lv;
    ctx.strokeStyle = 'rgba(177, 107, 255, ' + (0.25 + Math.sin(G.t * 4) * 0.1) + ')';
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.arc(p.x, p.y, ar, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function drawCat(x, y, a) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a + Math.PI / 2);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(0, 8, 9, 3.4, 0, 0, TAU); ctx.fill();
  // хвост
  ctx.strokeStyle = '#ff9a5b';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, 8);
  ctx.quadraticCurveTo(10, 10, 12, 0);
  ctx.stroke();
  // тело
  ctx.fillStyle = '#ff9a5b';
  ctx.beginPath(); ctx.ellipse(0, 0, 9, 11, 0, 0, TAU); ctx.fill();
  // уши
  tri(-6, -8, -7, -15, -1, -9);
  tri(6, -8, 7, -15, 1, -9);
  // морда
  ctx.fillStyle = '#1a1a2e';
  ctx.beginPath(); ctx.arc(-2.6, -5, 1.2, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(2.6, -5, 1.2, 0, TAU); ctx.fill();
  ctx.restore();
}

function drawBullets() {
  for (var i = 0; i < G.bullets.length; i++) {
    var b = G.bullets[i];
    ctx.save();
    ctx.translate(b.x, b.y);
    if (b.kind === 'slipper') {
      ctx.rotate(b.t * 18);
      ctx.fillStyle = '#7a5c8e';
      ctx.beginPath(); ctx.ellipse(0, 0, 10, 6, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#e8dfc8';
      ctx.beginPath(); ctx.ellipse(-4, 0, 5, 3.4, 0, 0, TAU); ctx.fill();
    } else if (b.kind === 'joint') {
      ctx.rotate(Math.atan2(b.vy, b.vx));
      ctx.fillStyle = '#e8dfc8';
      ctx.fillRect(-8, -2.4, 12, 4.8);
      ctx.fillStyle = '#ff8c42';
      ctx.fillRect(4, -2.4, 4, 4.8);
      // дымок
      ctx.fillStyle = 'rgba(200,200,220,0.5)';
      ctx.beginPath(); ctx.arc(-10 - Math.sin(b.t * 30) * 2, -3, 2.6, 0, TAU); ctx.fill();
    } else if (b.kind === 'snowball') {
      ctx.fillStyle = '#dfe8f2';
      ctx.beginPath(); ctx.arc(0, 0, b.r, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(160,180,210,0.8)';
      ctx.lineWidth = 1.6;
      ctx.stroke();
    } else if (b.kind === 'tapok') {
      // тапок-самолёт: кренит в поворотах
      ctx.rotate(Math.atan2(b.vy, b.vx) + Math.PI / 2 + Math.sin(b.t * 20) * 0.3);
      ctx.fillStyle = '#7a5c8e';
      ctx.beginPath(); ctx.ellipse(0, 0, 6, 10, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#e8dfc8';
      ctx.beginPath(); ctx.ellipse(0, 5, 4, 3.4, 0, 0, TAU); ctx.fill();
      // след
      ctx.fillStyle = 'rgba(200,200,220,0.4)';
      ctx.beginPath(); ctx.arc(-Math.sin(b.t * 30) * 3, -12, 2.4, 0, TAU); ctx.fill();
    } else if (b.kind === 'flask') {
      ctx.rotate(b.t * 12);
      ctx.fillStyle = 'rgba(255, 140, 66, 0.25)';
      ctx.beginPath(); ctx.arc(0, 0, 12, 0, TAU); ctx.fill();
      ctx.fillStyle = '#9db88a';
      ctx.fillRect(-4, -5, 8, 10);
      ctx.fillStyle = '#ff8c42';
      ctx.fillRect(-2.4, -7, 4.8, 4);
    } else if (b.kind === 'puddle') {
      // горящая лужа скипидара: тает к концу жизни
      var k = 1 - b.t / b.life;
      ctx.globalAlpha = 0.55 * k + 0.15;
      var pg = ctx.createRadialGradient(0, 0, b.puddleR * 0.2, 0, 0, b.puddleR);
      pg.addColorStop(0, '#ffd76e');
      pg.addColorStop(0.6, '#ff8c42');
      pg.addColorStop(1, 'rgba(200, 60, 30, 0)');
      ctx.fillStyle = pg;
      ctx.beginPath();
      ctx.arc(0, 0, b.puddleR, 0, TAU);
      ctx.fill();
      if (Math.random() < 0.5) {
        ctx.fillStyle = '#ffd76e';
        ctx.beginPath(); ctx.arc(rnd(-b.puddleR * 0.6, b.puddleR * 0.6), rnd(-b.puddleR * 0.4, b.puddleR * 0.4), rnd(1.5, 3.4), 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
    } else if (b.kind === 'owlbomb') {
      // снежная бомба совы: падает сверху, тень на снегу растёт
      ctx.fillStyle = 'rgba(157, 255, 224, 0.35)';
      ctx.beginPath(); ctx.arc(0, b.vy * 0.5, 8 + b.t * 8, 0, TAU); ctx.fill();
      ctx.fillStyle = '#dfe8f2';
      ctx.beginPath(); ctx.arc(0, 0, b.r, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#9dffe0';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawUfo() { /* убрано в v2.1: финал — рассвет, не тарелка */ }

function drawBossBar() {
  var b = G.bossAlive;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  var w = Math.min(520, canvas.width * 0.6);
  var x = (canvas.width - w) / 2;
  var y = canvas.height * 0.08;
  ctx.fillStyle = 'rgba(10, 13, 22, 0.8)';
  ctx.fillRect(x - 4, y - 4, w + 8, 30);
  ctx.fillStyle = '#2a3450';
  ctx.fillRect(x, y, w, 12);
  ctx.fillStyle = '#ff5b6e';
  ctx.fillRect(x, y, w * clamp(b.hp / b.maxHp, 0, 1), 12);
  ctx.font = 'bold 15px "Trebuchet MS", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.fillText('👑 ' + b.name, canvas.width / 2, y + 27);
  ctx.textAlign = 'left';
  ctx.restore();
}

// ═════════════════════════════════════════════════════ HUD ══════════════

var hudT = 0;

function updateHUD(dt) {
  hudT -= dt;
  if (hudT > 0) return;
  hudT = 0.1;

  var p = G.player;
  if (!p) return;

  $$('xp-bar').style.width = (G.xp / G.xpNext * 100) + '%';
  $$('lvl-txt').textContent = 'УР. ' + G.level;
  // классика: скатка до рассвета 10:00 → 0:00; бесконечка: ночь тикает вверх
  if (G.mode === 'endless') {
    $$('timer').textContent = '🌙 ' + fmtTime(G.t);
  } else {
    $$('timer').textContent = '🌅 ' + fmtTime(Math.max(0, RUN_TIME - G.t));
  }
  $$('timer').className = (G.bossAlive && !G.bossAlive.dead) ? 'boss' : (G.siege ? 'boss' : '');

  $$('hp-bar').style.width = (p.hp / p.maxHp * 100) + '%';
  $$('hp-txt').textContent = Math.ceil(p.hp) + ' / ' + p.maxHp;

  $$('trip-bar').style.width = G.trip + '%';
  $$('trip-txt').textContent = G.trip >= 100
    ? '🍄 ЗАЛП ГОТОВ — [G]!'
    : '🍄 ' + Math.floor(G.trip) + '%';
  $$('trip-wrap').className = G.trip >= 100 ? 'full' : '';
  $$('trip-wrap').id = 'trip-wrap';

  $$('kills').textContent = 'изгнано: ' + G.kills;

  // слоты оружия
  var slots = $$('weapon-slots');
  var html = '';
  for (var wid in p.weapons) {
    var w = p.weapons[wid];
    var def = WEAPONS[wid];
    var evo = p.evolved[wid];
    var pips = '';
    for (var i = 0; i < def.max; i++) {
      pips += '<div class="pip' + (evo || i < w.lv ? ' on' : '') + '"></div>';
    }
    html += '<div class="wslot' + (evo ? ' evolved' : '') + '" title="' +
      (evo ? EVOS[wid].name : def.name) + '">' +
      '<span>' + (evo ? EVOS[wid].ico : def.ico) + '</span>' +
      '<div class="pips">' + pips + '</div></div>';
  }
  if (slots.innerHTML !== html) slots.innerHTML = html;
}

// ═══════════════════════════════════════════════ ЗАБЕГ: ЖИЗНЬ ════════════

function startRun(mode) {
  G.mode = mode === 'endless' ? 'endless' : 'classic';
  G.state = 'play';
  G.t = 0;
  G.runSeq++;
  G.player = newPlayer();
  G.enemies = [];
  G.bullets = [];
  G.pickups = [];
  particles = [];
  floaters = [];
  G.kills = 0;
  G.level = 1;
  G.xp = 0;
  G.xpNext = 8;
  G.trip = 0;
  G.zapT = 0;
  G.zapFlash = 0;
  G.zapCount = 0;
  G.bossIdx = 0;
  G.bossAlive = null;
  G.nextBossT = 0;
  G.lastHitT = 0;
  G.lowHpSaid = false;
  G.said5 = false;
  G.radioOn = true; G.radioT = 0; G.radioIdx = 0;
  G.siege = false;
  G.dawn = false;
  G.won = false;
  G.waveT = 25;          // первая мини-волна через 25 сек
  G.spawnAcc = 0;
  G.goldT = rnd(30, 45); // первый золотой гриб
  G.howlT = rnd(8, 16);  // первый вой издалека
  G.levelQueue = 0;
  G.stats = { dmg: 0, mushrooms: 0, gifts: 0, maxCombo: 0 };
  G.frame = 0;
  CAM.x = 0; CAM.y = 0; CAM.shake = 0;
  canvas.style.filter = '';

  ['menu', 'help', 'death', 'win', 'pause', 'achs'].forEach(function (id) {
    $$(id).classList.add('hidden');
  });
  $$('hud').classList.remove('hidden');

  // ночь начинается: ветер + колокол дальнего храма
  AU.init();
  AU.startWind();
  AU.bell();
  if (G.mode === 'classic') {
    announce('НОЧЬ НАЧАЛАСЬ\nдожить до рассвета — 10:00', 2600);
  } else {
    announce('БЕСКОНЕЧНАЯ НОЧЬ\nрассвета не будет. сколько вытерпишь?', 3000);
  }
  dedEvent('start');
}

function endRun(winFlag) {
  if (G.state === 'death' || G.state === 'win') return;
  G.state = winFlag ? 'win' : 'death';
  G.won = winFlag;
  G.bossAlive = null;
  G.radioOn = false;
  canvas.style.filter = '';

  if (winFlag) {
    AU.win();
    AU.stopWind();
    dedEvent('win');
    spawnConfetti(G.player.x, G.player.y, 120, 2);
    unlockAch('winner');
  } else {
    AU.death();
    AU.stopWind();
    dedEvent('death');
    CAM.kick(1);
  }

  // рекорды (по режимам отдельно)
  try {
    var best = JSON.parse(localStorage.getItem('dedBest') || '{}');
    var t = Math.floor(G.t);
    if (G.mode === 'endless') {
      if (!best.endlessTime || t > best.endlessTime) best.endlessTime = t;
      if (!best.endlessKills || G.kills > best.endlessKills) best.endlessKills = G.kills;
    } else {
      if (!best.bestTime || t > best.bestTime) best.bestTime = t;
      if (!best.bestKills || G.kills > best.bestKills) best.bestKills = G.kills;
    }
    best.runs = (best.runs || 0) + 1;
    if (winFlag) best.wins = (best.wins || 0) + 1;
    localStorage.setItem('dedBest', JSON.stringify(best));
  } catch (e) { /* приватный режим — просто играем */ }

  var line =
    (G.mode === 'endless' ? 'Продержался: ' : 'Продержался: ') + '<b>' + fmtTime(G.t) + '</b>' +
    (G.mode === 'endless' ? '' : ' из 10:00') + '<br>' +
    'Изгнано глюков: <b>' + G.kills + '</b><br>' +
    'Уровень деда: <b>' + G.level + '</b><br>' +
    'Старших повержено: <b>' + (G.bossIdx) + '</b><br>' +
    'Грибов сожрано: <b>' + G.stats.mushrooms + '</b><br>' +
    'Свёртков вскрыто: <b>' + G.stats.gifts + '</b><br>' +
    'Урона нанесено: <b>' + G.stats.dmg + '</b>';

  // сюжетные финалы: чем кончилась ночь
  var head = '';
  if (winFlag) {
    head = 'Небо на востоке налилось золотом.<br>Мультяшки истаяли. Дед идёт ставить самовар.';
  } else if (G.mode === 'endless') {
    head = 'Ночь не кончилась — кончился дед.<br>Радио что-то бормотало, но его уже не слышно.';
  } else if (G.t < 120) {
    head = 'Безмолвие приняло деда быстро.<br>Даже самовар не успел остыть.';
  } else if (G.t < 420) {
    head = 'Безмолвие приняло деда.<br>Лес ещё долго топтался по сугробам, но деда уже не было.';
  } else {
    head = 'До рассвета оставалось совсем чуть-чуть.<br>Вот обидно-то, дед. Вот обидно.';
  }

  if (winFlag) {
    $$('win-stats').innerHTML = line;
    $$('win-line').innerHTML = head;
  } else {
    $$('death-stats').innerHTML = line;
    $$('death-line').innerHTML = head;
  }

  setTimeout(function () {
    $$('hud').classList.add('hidden');
    $$(winFlag ? 'win' : 'death').classList.remove('hidden');
  }, winFlag ? 400 : 900);
}

function togglePause() {
  if (G.state === 'play') {
    G.state = 'pause';
    $$('pause-stats').innerHTML =
      'Время: <b>' + fmtTime(G.t) + '</b><br>Изгнано: <b>' + G.kills +
      '</b><br>Уровень: <b>' + G.level + '</b>';
    $$('pause').classList.remove('hidden');
  } else if (G.state === 'pause') {
    G.state = 'play';
    $$('pause').classList.add('hidden');
  }
}

function toMenu() {
  G.state = 'menu';
  G.player = null;
  G.enemies = [];
  G.bullets = [];
  G.pickups = [];
  particles = [];
  floaters = [];
  G.bossAlive = null;
  G.radioOn = false;
  G.siege = false;
  G.dawn = false;
  AU.stopWind();
  canvas.style.filter = '';
  ['hud', 'pause', 'death', 'win', 'levelup', 'help', 'achs'].forEach(function (id) {
    $$(id).classList.add('hidden');
  });
  $$('menu').classList.remove('hidden');
  showBest();
}

function showBest() {
  var el = $$('best-stats');
  try {
    var best = JSON.parse(localStorage.getItem('dedBest') || '{}');
    if (!best.runs) {
      el.innerHTML = 'Первый забег? Не тормози, дед.';
      return;
    }
    el.innerHTML =
      'НОЧЬ: лучшее время <b style="color:#ffd76e">' + fmtTime(best.bestTime || 0) +
      '</b> · изгнаний <b style="color:#ffd76e">' + (best.bestKills || 0) + '</b>' +
      ' · побед: ' + (best.wins || 0) +
      '<br>БЕСКОНЕЧНАЯ: рекорд <b style="color:#b39bff">' + fmtTime(best.endlessTime || 0) +
      '</b> · изгнаний <b style="color:#b39bff">' + (best.endlessKills || 0) + '</b>';
  } catch (e) {
    el.innerHTML = '';
  }
}

// ═════════════════════════════════════════════════ ГЛАВНЫЙ ЦИКЛ ══════════

var lastTs = 0;

function tick(ts) {
  requestAnimationFrame(tick);
  var dt = Math.min(0.05, (ts - lastTs) / 1000 || 0.016);
  lastTs = ts;

  if (G.state === 'play') {
    G.frame = (G.frame || 0) + 1;

    // HITSTOP: мир замирает на миг при убийствах (вес удара)
    if (hitstop > 0) {
      hitstop -= dt;
    } else {
      G.t += dt;

      var p = G.player;
      // движение деда
      var mv = moveInput();
      if (mv.x || mv.y) {
        p.x += mv.x * p.speed * speedMul() * dt;
        p.y += mv.y * p.speed * speedMul() * dt;
        p.walkT += dt;
        if (mv.x) p.face = mv.x > 0 ? 1 : -1;
        // ПРИЦЕЛ ЛОДОШКИ = направление хода; вороны читают скорость для упреждения
        p.moveA = Math.atan2(mv.y, mv.x);
        p.aimT = 0.35;
        p.lastVX = mv.x * p.speed * speedMul();
        p.lastVY = mv.y * p.speed * speedMul();
      } else {
        p.lastVX = 0; p.lastVY = 0;
      }
      if (p.aimT > 0) p.aimT -= dt;
      if (p.iframe > 0) p.iframe -= dt;
      if (p.hitFx > 0) p.hitFx -= dt;

      // регенерация пассивкой
      if (regenRate() > 0) {
        p.hp = Math.min(p.maxHp, p.hp + regenRate() * dt);
      }

      fireWeapons(dt);
      updateEnemies(dt);
      updateBullets(dt);
      updatePickups(dt);
      updateDirector(dt);
      updateTrip(dt);
    }

    updateParticles(dt);
    CAM.update(dt);
    updateHUD(dt);
  } else if (G.state === 'menu' || G.state === 'help') {
    // меню: лёгкий живой фон
    G.t += dt * 0.3;
    updateSnow(dt);
    CAM.x = Math.sin(G.t * 0.1) * 120;
    CAM.y = Math.cos(G.t * 0.07) * 90;
  }

  if (G.player || G.state === 'menu' || G.state === 'help') {
    render();
    updateSnow(dt);
  }

  // ESC в экранах конца/паузы — быстрый выход в меню
  // (обработан в keydown-слушателе выше)
}

// ═══════════════════════════════════════════════════ КНОПКИ ═════════════

function bind(id, fn) {
  var el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('click', function (e) {
    AU.init();
    AU.pop();
    fn(e);
  });
}

bind('btn-play', function () { startRun('classic'); });
bind('btn-endless', function () { startRun('endless'); });
bind('btn-help', function () {
  $$('menu').classList.add('hidden');
  $$('help').classList.remove('hidden');
  G.state = 'help';
});
bind('btn-help-back', toMenu);
bind('btn-achs', function () {
  renderAchs();
  $$('menu').classList.add('hidden');
  $$('achs').classList.remove('hidden');
  G.state = 'achs';
});
bind('btn-achs-back', toMenu);
bind('btn-reroll', rerollCards);
bind('btn-resume', togglePause);
bind('btn-quit', toMenu);
bind('btn-retry', function () { startRun(G.mode); });
bind('btn-death-menu', toMenu);
bind('btn-win-retry', function () { startRun(G.mode); });
bind('btn-win-menu', toMenu);

// ═══════════════════════════════════════════════════ СТАРТ ══════════════

showBest();
requestAnimationFrame(tick);

// отладочный хук (использует scripts/playtest.mjs)
window.DED = {
  G: G, CAM: CAM, AU: AU,
  startRun: startRun, spawnBoss: spawnBoss, killEnemy: killEnemy,
  hurtPlayer: hurtPlayer, tryZap: tryZap, gainXp: gainXp,
  announce: announce, rerollCards: rerollCards, spawnAtRing: spawnAtRing,
  spawnEnemy: spawnEnemy, unlockAch: unlockAch, getAchs: getAchs,
  dedEvent: dedEvent, dedSay: dedSay,
  WEAPONS: WEAPONS, PASSIVES: PASSIVES, EVOS: EVOS, ENEMY_TYPES: ENEMY_TYPES,
  BOSSES: BOSSES,
  RUN_TIME: RUN_TIME, BOSS_TIMES: BOSS_TIMES, SIEGE_TIME: SIEGE_TIME
};

})();
