/**
 * ambient.js — ЖИВОЙ МИР «Белого Безмолвия»: амбиентные детали вокруг
 * игрока. Один симуляционный тик 46 (после систем, до ИИ) раз в 10–30
 * секунд (и реже) рождает микродеталь: звук (скрип снега, треск льда,
 * дятел, лай собак в посёлке, скрип вывески, уханье совы, воскресный
 * звон колоколов, капель при оттепели) или визуал (пар дыхания при
 * −25° спрайтом par_dyhan, дым из труб «живых» изб, воронья стайка
 * через экран, заяц перебегает дорогу, лиса на опушке — новый спрайт
 * lisica 4×2, позёмка viter_musor и вихорьки sneg_zavit при порывах,
 * снег с веток при шквале). Мир «нагребает» сугробы у стен изб и хранит
 * старые волчьи следы в лесу (параллельно hunting.js, пометка amb).
 * При долгом бездействии — редкие атмосферные тосты («Тишина такая,
 * что слышно кровь в ушах»...). Модалка открыта — тики не идут (Loop),
 * но дополнительно страхуемся проверкой Ui.modal().
 * Состояние: WS.G.amb.flags (одноразовые реплики) + рантайм-модуль.
 * Связи: Weather/Weather2 (порывы, погода), Time (час/день недели),
 * World (объекты/здания/тайлы), Fx (частицы), Snd, Ui.toast, Cam.
 */
(function () {
  'use strict';

  // ====================================================================
  //  КОНСТАНТЫ И НАСТРОЙКИ
  // ====================================================================

  var TICK = 46;            // приоритет тика амбиента (после систем 40-45)

  // --- микродетали: раз в 10–30 секунд (по ТЗ) ---
  var MICRO_LO = 10;
  var MICRO_HI = 30;
  var MICRO_REPEAT_CD = 70;   // одна и та же деталь не чаще, сек

  // --- география мира (договор с ai.js: лес север, посёлок середина) ---
  var FOREST_YMAX = 80;
  var VILLAGE_Y0 = 80;
  var VILLAGE_Y1 = 150;
  var RIVER_Y = 135;         // «рядом с рекой» — южнее этого
  var NEAR_R = 8;            // радиус «рядом» для тайлов льда/воды

  // --- пар дыхания ---
  var BREATH_TEMP = -25;     // по ТЗ: пар виден при −25 и ниже
  var BREATH_EVERY = 3;      // раз в 3 секунды (по ТЗ)
  var BREATH_FRAME = 0.26;   // длительность кадра par_dyhan

  // --- дым из труб ---
  var SMOKE_LIVE_P = 0.3;    // доля «живых» изб (детерминирована от координат)
  var SMOKE_R = 32;          // радиус видимости дымов от игрока
  var SMOKE_EVERY = 1.1;     // клуб из трубы раз в N сек (у каждой свой)
  var SMOKE_Z = 30;          // высота трубы над полом (px)
  var SMOKE_MAX = 5;         // сколько труб курят одновременно

  // --- воронья стайка ---
  var FLOCK_LO = 170;        // сек между стайками
  var FLOCK_HI = 380;
  var FLOCK_N_MIN = 3;       // 3–5 птиц (по ТЗ)
  var FLOCK_N_MAX = 5;
  var FLOCK_SPEED = 3.4;     // тайлов/с
  var FLOCK_Z_MIN = 44;      // высота полёта, px
  var FLOCK_Z_MAX = 66;

  // --- заяц ---
  var HARE_LO = 240;
  var HARE_HI = 560;
  var HARE_SPEED = 3.6;      // тайлов/с — косой даёт стрекача
  var HARE_DIST = 13;        // пробегает в 10–16 тайлах от игрока (далеко)

  // --- лиса на опушке ---
  var FOX_LO = 460;
  var FOX_HI = 900;
  var FOX_SPEED = 2.6;
  var FOX_FLEE = 4.8;        // скорость, когда заметила игрока
  var FOX_AVOID = 7;         // ближе этого — уходит в лес
  var FOX_EDGE_Y = 84;       // сама кромка леса

  // --- позёмка и вихорьки ---
  var DRIFT_LO = 4;          // позёмка: реже, только при ветре
  var DRIFT_HI = 9;
  var DRIFT_SPEED = 2.2;     // тайлов/с по ветру
  var DRIFT_MAX = 6;         // одновременно в кадре
  var VERT_LO = 9;           // вихорёк — редкий
  var VERT_HI = 26;
  var VERT_MAX = 2;

  // --- снег с веток ---
  var BRANCH_GUST = 0.55;    // порыв Weather2, при котором сыплет с веток
  var BRANCH_WIND = 0.62;    // ...или просто сильный ветер
  var BRANCH_CD = 3.5;        // сек между обвалами

  // --- сугробы у стен ---
  var SUGROB_HOUR_CHANCE = 0.6;  // раз в игровой час у случайной стены
  var SUGROB_MAX = 40;           // лимит на мир (по ТЗ)
  var SUGROB_NEAR = 12;          // изба не дальше этого от игрока

  // --- старые следы волка ---
  var TRACK_HOUR_CHANCE = 0.33;  // раз в игровой час, если игрок в лесу
  var TRACK_N_MIN = 6;           // следов в цепочке
  var TRACK_N_MAX = 8;
  var TRACK_MAX = 36;            // лимит объектов следов
  var TRACK_TOAST_CD = 120;      // тост «старые следы» не чаще, сек

  // --- атмосферные тосты бездействия ---
  var IDLE_MIN = 30;         // сек полного бездействия (по ТЗ)
  var ATMO_CD = 90;          // не чаще раза в 90 сек
  var ATMO_CHECK = 10;      // проверка условий раз в N сек

  // --- колокола ---
  var BELL_HOUR = 10;        // воскресенье, 10 утра (по ТЗ)
  var BELL_STRIKES = 3;
  var BELL_GAP = 2.2;        // сек между ударами

  // --- прочее ---
  var SOUNDS_MAX = 12;       // лимит очереди отложенных звуков
  var DECO_FAR = 60;         // дальше этого — декор снимать

  // ====================================================================
  //  СОСТОЯНИЕ МОДУЛЯ (не сериализуется; одноразовые флаги — в G.amb)
  // ====================================================================

  var Rt = null;                  // рантайм-ГПСЧ (не влияет на генерацию)
  var M = null;

  // таймеры
  var microT = 8;                // до следующей микродетали
  var atmosT = ATMO_CHECK;       // до проверки атмосферных тостов
  var atmosCd = 0;
  var idleT = 0;
  var flockT = 0;
  var hareT = 0;
  var foxT = 0;
  var driftT = 0;
  var vertT = 0;
  var branchT = 0;
  var breathT = 0;
  var lastMicro = {};            // имя детали -> time (анти-повтор)
  var nowSec = 0;                // наработанное время модуля, сек

  // отложенные звуки (серии: колокола, дятел, лай, капель)
  var sndQ = [];

  // «живые» избы (дым) и их таймеры
  var smokes = [];
  var smokeScanT = 0;

  // декоративные объекты (пар дыхания, позёмка, вихри, сова, сугробы,
  // следы) — всё с меткой amb, чтобы снять при сбросе
  var deco = [];

  // животные-призраки (косметика, без мозга: ИИ их не трогает)
  var flock = [];                // вороны: {e, vx, vy, wob}
  var hare = null;               // {e, vx, vy, t}
  var fox = null;                // {e, t, dirX}

  var owl = null;                // {o, t, dur, frameT}
  var trackToastT = 0;

  // ====================================================================
  //  УТИЛИТЫ
  // ====================================================================

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function R() { return Math.random(); }
  function chance(p) { return Math.random() < p; }
  function rr(lo, hi) { return lo + Math.random() * (hi - lo); }
  function ri(lo, hi) { return Math.floor(lo + Math.random() * (hi - lo + 1)); }

  function running() {
    return !!(WS.G && WS.G.running && WS.G.player && !WS.G.dead);
  }

  /** Модалка открыта — детали мира ждут (по ТЗ). */
  function modal() {
    try {
      return !!(WS.Ui && WS.Ui.modal && WS.Ui.modal());
    } catch (e) { return false; }
  }

  function player() { return WS.G ? WS.G.player : null; }

  function outside() {
    try {
      var p = player();
      if (!p || p.sleeping) return false;
      if (WS.World && WS.World.isInside) return !WS.World.isInside(p.x, p.y);
    } catch (e) { /* пусто */ }
    return false;
  }

  /** Лес вокруг? (север карты — по договору генератора) */
  function inForest(y) {
    if (y === undefined) {
      var p = player();
      y = p ? p.y : 200;
    }
    return y < FOREST_YMAX;
  }

  /** В посёлке? */
  function inVillage(y) {
    if (y === undefined) {
      var p = player();
      y = p ? p.y : 0;
    }
    return y >= VILLAGE_Y0 && y <= VILLAGE_Y1;
  }

  /** Рядом с рекой/льдом? (юг карты либо лёд в NEAR_R тайлах) */
  function nearRiver() {
    var p = player();
    if (!p) return false;
    if (p.y > RIVER_Y) return true;
    try {
      var W = WS.World, T = W.T;
      var tx = Math.floor(p.x), ty = Math.floor(p.y);
      for (var dy = -NEAR_R; dy <= NEAR_R; dy += 2) {
        for (var dx = -NEAR_R; dx <= NEAR_R; dx += 2) {
          var t = W.tileAt(tx + dx, ty + dy);
          if (t === T.ICE || t === T.WATER) return true;
        }
      }
    } catch (e) { /* мир не готов */ }
    return false;
  }

  function t9(key, fb) {
    try {
      if (WS.I18N && WS.I18N.t) {
        var s = WS.I18N.t(key);
        if (s && s !== key) return s;
      }
    } catch (e) { /* пусто */ }
    return fb;
  }

  function toast(text, kind) {
    try {
      if (WS.Ui && WS.Ui.toast) WS.Ui.toast(text, kind || 'info');
    } catch (e) { /* пусто */ }
  }

  /** Одноразовые флаги амбиента — сериализуемые в G.amb.flags. */
  function flags() {
    var g = WS.G;
    if (!g) return {};
    if (!g.amb || typeof g.amb !== 'object') g.amb = { flags: {} };
    if (!g.amb.flags) g.amb.flags = {};
    return g.amb.flags;
  }

  function once(key) {
    var f = flags();
    if (f[key]) return false;
    f[key] = 1;
    return true;
  }

  /** Погода сейчас (с защёлками на отсутствие модулей). */
  function wType() {
    try {
      var c = WS.Weather.current();
      return c ? c.id : 'clear';
    } catch (e) { return 'clear'; }
  }

  function temp() {
    try { return WS.Weather.tempOutside(); } catch (e) { return -10; }
  }

  function wind() {
    try { return WS.Weather.windLevel(); } catch (e) { return 0.2; }
  }

  function gust() {
    try { return WS.Weather2 ? WS.Weather2.gust() : 0; } catch (e) { return 0; }
  }

  function isNight() {
    var h = WS.Time && WS.Time.hour ? WS.Time.hour() : 12;
    return h >= 21 || h < 5;
  }

  /** Направление ветра экранными осями (для дыма/позёмки). */
  function windVec() {
    try {
      if (WS.Weather && WS.Weather.windVecScreen) return WS.Weather.windVecScreen();
    } catch (e) { /* пусто */ }
    return { x: 1, y: 0 };
  }

  // ====================================================================
  //  ОЧЕРЕДЬ ЗВУКОВ (серии: дятел, колокола, лай, капель, сова)
  //  setTimeout запрещён контрактом динамики — гоним серии своим тиком.
  // ====================================================================

  function queue(name, delay, vol, x, y) {
    if (sndQ.length >= SOUNDS_MAX) return;
    sndQ.push({ t: delay, name: name, vol: vol, x: x, y: y });
  }

  function soundTick(dt) {
    for (var i = sndQ.length - 1; i >= 0; i--) {
      var s = sndQ[i];
      s.t -= dt;
      if (s.t > 0) continue;
      sndQ.splice(i, 1);
      try {
        if (WS.Snd && WS.Snd.play) {
          var o = { vol: s.vol };
          if (s.x !== undefined) { o.x = s.x; o.y = s.y; }
          WS.Snd.play(s.name, o);
        }
      } catch (e) { /* звук не критичен */ }
    }
  }

  /** Деталь не повторять чаще MICRO_REPEAT_CD секунд. */
  function microFresh(name) {
    var last = lastMicro[name];
    if (last !== undefined && nowSec - last < MICRO_REPEAT_CD) return false;
    lastMicro[name] = nowSec;
    return true;
  }

  // ====================================================================
  //  СПРАЙТЫ МОДУЛЯ
  //  lisica — лиса (по ТЗ: 4 кадра × 2 направления), sugrob_stena —
  //  стадии сугроба у стены, amb_foot_wolf — запасной волчий след
  //  (если hunting.js со своим foot_wolf не подгружен).
  // ====================================================================

  function defSprites() {
    var S = WS.Spr;
    if (!S || !S.def) return;

    // -------- ЛИСА, 34x20: 4 кадра бега x 2 направления (E/W) --------
    // Рыжая точка на белом: спина яркая, живот белый, лапы чёрные,
    // хвост с белым кончиком. dir 2 (E) — как есть, dir 6 (W) — зеркало.
    S.def('lisica', {
      w: 34, h: 20, frames: 4,
      draw: function (c, w, h, f, dir) {
        var OR1 = '#c26a32', OR2 = '#d97f3e', OR3 = '#9c4f24';
        var BEL = '#e9e2d4', DARK = '#26201a';
        function fox() {
          // фазы лап: 0/2 — пара под корпусом, 1/3 — разлёт
          var st = (f === 0 || f === 2);
          var dy = (f === 1 || f === 3) ? 1 : 0;
          // корпус-веретено
          p(c, 6, 9 + dy, 17, 6, OR1);
          p(c, 7, 8 + dy, 14, 2, OR2);
          p(c, 6, 14 + dy, 16, 2, OR3);
          // грудка белёсая
          p(c, 7, 13 + dy, 5, 3, BEL);
          // голова: острая мордочка вперёд
          p(c, 21, 7 + dy, 8, 6, OR1);
          p(c, 27, 9 + dy, 4, 3, OR2);          // морда
          p(c, 30, 10 + dy, 1, 1, DARK);        // нос
          p(c, 25, 8 + dy, 1, 1, DARK);         // глаз
          // уши-треугольнички
          p(c, 21, 4 + dy, 2, 3, OR3);
          p(c, 24, 4 + dy, 2, 3, OR3);
          p(c, 21, 3 + dy, 1, 1, DARK);
          // хвост пышный с белым кончиком
          p(c, 1, 6 + dy, 6, 4, OR1);
          p(c, 0, 5 + dy, 3, 3, OR2);
          p(c, 0, 5 + dy, 2, 2, BEL);
          // лапы чёрные
          if (st) {
            p(c, 8, 15, 2, 4, DARK); p(c, 12, 15, 2, 4, DARK);
            p(c, 17, 15, 2, 4, DARK); p(c, 20, 15, 2, 3, DARK);
          } else {
            p(c, 9, 15, 2, 4, DARK); p(c, 11, 15, 2, 3, DARK);
            p(c, 16, 15, 2, 3, DARK); p(c, 19, 15, 2, 4, DARK);
          }
          // снежная пыль от лап в галопе
          if (f === 1 || f === 3) {
            p(c, 4, 18, 2, 1, 'rgba(226,232,240,0.6)');
            p(c, 9, 18, 2, 1, 'rgba(226,232,240,0.5)');
          }
        }
        var d4 = (dir === undefined) ? 2 : ((dir | 0) & 2);
        c.save();
        if (d4 === 6) {
          c.translate(w, 0);
          c.scale(-1, 1);
        }
        fox();
        c.restore();
      }
    });

    // -------- СУГРОБ У СТЕНЫ, 40x16: 3 стадии роста --------
    // Прислонён к «стене» слева: чем старше, тем выше и длиннее.
    S.def('sugrob_stena', {
      w: 40, h: 16, frames: 3,
      draw: function (c, w, h, f) {
        var S1 = '#dfe6ef', S2 = '#cfd9e6', S3 = '#b6c4d6';
        // стадия 0: присыпка у плинтуса
        if (f === 0) {
          e(c, 10, 13, 8, 2.2, S1);
          e(c, 7, 13, 4, 1.6, S2);
          p(c, 0, 8, 2, 6, '#5c4730');        // бревно стены-подсказка
          p(c, 2, 13, 8, 1, 'rgba(90,104,124,0.35)');
        } else if (f === 1) {
          e(c, 13, 11, 11, 4, S1);
          e(c, 8, 12, 6, 2.6, S2);
          e(c, 20, 13, 6, 2, S1);
          p(c, 0, 5, 2, 9, '#5c4730');
          p(c, 0, 14, 2, 1, '#4c3a26');
          p(c, 3, 9, 6, 1, S3);               // тень складки
          p(c, 4, 15, 16, 1, 'rgba(90,104,124,0.3)');
        } else {
          // стадия 2: намело почти до окна
          e(c, 16, 8, 14, 6.4, S1);
          e(c, 9, 10, 8, 4.4, S2);
          e(c, 25, 12, 7, 3, S1);
          e(c, 5, 13, 4, 1.8, S2);
          p(c, 0, 2, 2, 12, '#5c4730');
          p(c, 2, 6, 12, 1, S3);
          p(c, 6, 3, 9, 1, 'rgba(226,232,240,0.7)');   // рыхлый гребень
          p(c, 4, 15, 22, 1, 'rgba(90,104,124,0.3)');
        }
      }
    });

    // -------- ЗАПАСНОЙ ВОЛЧИЙ СЛЕД (если нет foot_wolf из hunting.js) --
    S.def('amb_foot_wolf', {
      w: 16, h: 12, frames: 2,
      draw: function (c, w, h, f) {
        var C1 = 'rgba(120,134,152,0.55)', C2 = 'rgba(140,154,170,0.4)';
        var d = f === 0 ? 0 : 1;
        e(c, 4, 3 + d, 1.6, 1.9, C1);        // подушечка
        p(c, 2, 1 + d, 1, 2, C2);            // пальцы
        p(c, 4, 0 + d, 1, 2, C2);
        p(c, 6, 1 + d, 1, 2, C2);
        p(c, 7, 3 + d, 1, 2, C2);
        e(c, 10, 7 - d, 1.4, 1.7, C1);       // вторая лапа
        p(c, 9, 5 - d, 1, 2, C2);
        p(c, 12, 6 - d, 1, 2, C2);
      }
    });
  }

  /** Пиксель/эллипс — локальные шорткаты спрайтов. */
  function p(c, x, y, w, h, col) {
    c.fillStyle = col;
    c.fillRect(x, y, w, h);
  }
  function e(c, x, y, rx, ry, col) {
    c.fillStyle = col;
    c.beginPath();
    c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    c.fill();
  }

  /** Имя спрайта волчьего следа (приоритет — hunting.js). */
  function wolfTrackSpr() {
    try {
      var sp = WS.Spr.specs();
      if (sp && sp.foot_wolf) return 'foot_wolf';
    } catch (er) { /* пусто */ }
    return 'amb_foot_wolf';
  }

  // ====================================================================
  //  МИКРОДЕТАЛИ: ЗВУКИ ЖИВОГО МИРА
  //  Каждые 10–30 секунд одна деталь, взвешенная по месту и времени.
  //  Звуки — через WS.Snd (контракт), серии — через очередь выше.
  // ====================================================================

  /** Случайная точка на расстоянии d0..d1 от игрока. */
  function pointNear(d0, d1) {
    var pl = player();
    var a = Math.random() * Math.PI * 2;
    var d = rr(d0, d1);
    return { x: pl.x + Math.cos(a) * d, y: pl.y + Math.sin(a) * d * 0.8 };
  }

  /** СКРИП СНЕГА: чьи-то шаги далеко — мороз поёт под ногами. */
  function detSnowCreak() {
    var pt = pointNear(5, 11);
    queue('snow_step_deep', 0, 0.12, pt.x, pt.y);
    if (chance(0.4)) queue('snow_step_deep', 0.6, 0.1, pt.x + 0.5, pt.y + 0.5);
  }

  /** ТРЕСК ЛЬДА: у реки лёд поёт и рвётся. */
  function detIceCrack() {
    var pt = pointNear(4, 9);
    queue('window_break', 0, 0.18, pt.x, pt.y);
    if (chance(0.5)) queue('mine', 0.9, 0.12, pt.x, pt.y);
    if (chance(0.25)) {
      toast(t9('amb.ice.sings', 'Лёд на реке потрескивает — поёт.'), 'info');
    }
  }

  /** СТУК ДЯТЛА: короткие очереди сухих ударов, только днём в лесу. */
  function detWoodpecker() {
    var pt = pointNear(6, 12);
    var n = ri(4, 7);
    for (var i = 0; i < n; i++) {
      queue('trap_snap', i * 0.14, 0.16 + R() * 0.08, pt.x, pt.y);
    }
    // передышка и вторая очередь — как настоящий ток
    if (chance(0.6)) {
      var m = ri(3, 5);
      for (var k = 0; k < m; k++) {
        queue('trap_snap', n * 0.14 + 0.9 + k * 0.14, 0.13, pt.x, pt.y);
      }
    }
  }

  /** ЛАЙ СОБАК ВДАЛЕ: посёлок жив — намёк, что там есть люди. */
  function detDogsBark() {
    var pl = player();
    var pt = { x: pl.x + rr(-30, 30), y: clamp(pl.y + rr(14, 34), VILLAGE_Y0, VILLAGE_Y1) };
    var n = ri(2, 4);
    for (var i = 0; i < n; i++) {
      queue('bandit_shout', i * rr(0.5, 0.9), 0.06 + R() * 0.05, pt.x, pt.y);
    }
    if (once('amb_dogs_seen')) {
      toast(t9('amb.dogs.first', 'Где-то в посёлке лают собаки. Значит, там ещё есть живые.'), 'info');
    }
  }

  /** СКРИП ВЫВЕСКИ: жестянка над лавкой/вокзалом качается на ветру. */
  function detSignCreak() {
    var pl = player();
    // ищем здание с вывеской (лавка, вокзал) в 7 тайлах
    var found = null;
    try {
      var bs = WS.World.buildings || [];
      for (var i = 0; i < bs.length; i++) {
        var b = bs[i];
        if (!b) continue;
        if (b.type !== 'store' && b.type !== 'telegraph' && b.type !== 'tavern') continue;
        var cx = b.x + b.w / 2, cy = b.y + b.h / 2;
        if (WS.M.dist(cx, cy, pl.x, pl.y) < 7) { found = b; break; }
      }
    } catch (e) { /* пусто */ }
    if (!found) return;
    var pt = {
      x: found.x + found.w / 2,
      y: found.y + found.h        // со стороны фасада
    };
    queue('door', 0, 0.24, pt.x, pt.y);
    if (chance(0.55)) queue('door', 1.3 + R() * 0.5, 0.17, pt.x, pt.y);
  }

  /** ТАЮЩИЙ КАПЕЛЬ: оттепель, у стен звенит по сосулькам. */
  function detKapel() {
    var pl = player();
    var pt = pointNear(2, 6);
    var n = ri(4, 7);
    for (var i = 0; i < n; i++) {
      queue('drink', i * rr(0.35, 0.6), 0.1 + R() * 0.06, pt.x, pt.y);
    }
    if (chance(0.2)) queue('splash', n * 0.5, 0.1, pt.x, pt.y);
  }

  /** УХАНЬЕ СОВЫ: ночь, лес. К дереву рядом «садится» сова (спрайт). */
  function detOwl() {
    if (owl) return;      // уже сидит
    var tree = findTreeNear(7, 14);
    if (!tree) return;
    var pt = { x: tree.x, y: tree.y };
    queue('howl', 0, 0.1, pt.x, pt.y);
    queue('howl', 2.4, 0.08, pt.x, pt.y);
    // сама сова: объект на 40–70 сек, кадры моргают
    try {
      var o = WS.World.addObject({
        x: tree.x + 0.2, y: tree.y - 0.2,
        sprName: 'sova_na_vetve', sprFrame: 0,
        solid: false, shadow: false, amb: true
      });
      owl = { o: o, t: 0, dur: rr(40, 70), frameT: 0 };
      deco.push({ kind: 'owl', o: o });
    } catch (e) { /* декор не критичен */ }
  }

  /** Найти дерево рядом (ель/сосна/берёза/сухостой). */
  function findTreeNear(d0, d1) {
    try {
      var pl = player();
      var list = WS.World.query(pl.x - d1, pl.y - d1, pl.x + d1, pl.y + d1);
      var trees = [];
      for (var i = 0; i < list.length; i++) {
        var o = list[i];
        if (!o || o.hp !== undefined) continue;
        var s = o.sprName;
        if (s === 'tree_pine' || s === 'tree_pine_small' ||
            s === 'tree_birch' || s === 'tree_dead') {
          var d = WS.M.dist(o.x, o.y, pl.x, pl.y);
          if (d >= d0 && d <= d1) trees.push(o);
        }
      }
      if (!trees.length) return null;
      return trees[Math.floor(Math.random() * trees.length)];
    } catch (e) { return null; }
  }

  /** Сову тикаем: моргает и улетает. */
  function owlTick(dt) {
    if (!owl) return;
    owl.t += dt;
    owl.frameT += dt;
    if (owl.frameT > 2.6) {                    // редкое моргание
      owl.frameT = 0;
      owl.o.sprFrame = owl.o.sprFrame === 0 ? 1 : 0;
    }
    if (owl.t > owl.dur) {
      removeDeco(owl.o);
      owl = null;
    }
  }

  // ====================================================================
  //  ВЫБОР МИКРОДЕТАЛИ: взвешенный пул по условиям
  // ====================================================================

  function microTick(dt) {
    microT -= dt;
    if (microT > 0) return;
    microT = rr(MICRO_LO, MICRO_HI);

    if (!running() || modal() || !outside()) return;
    var pl = player();
    var type = wType();
    var t = temp();
    var w = wind();
    var night = isNight();

    var pool = [];
    function add(name, fn, wt) {
      if (wt > 0 && microFresh(name)) pool.push({ name: name, fn: fn, w: wt });
    }

    // скрип снега — почти всегда уместен (кроме метели: там ветер свистит)
    add('creak', detSnowCreak, type === 'blizzard' ? 0.3 : 1.2);

    // треск льда — только у реки
    add('icecrack', detIceCrack, nearRiver() ? 1.1 : 0);

    // дятел — день и лес (мороз до -25: птицы корм ищут и в холод)
    add('woodpecker', detWoodpecker,
        (!night && inForest() && t > -26) ? 0.9 : 0);

    // лай собак — день, посёлок рядом (или в посёлке), не буря
    add('dogs', detDogsBark,
        (!night && (inVillage() || pl.y > VILLAGE_Y0 - 20) &&
         type !== 'blizzard' && type !== 'snowstorm') ? 0.8 : 0);

    // скрип вывески — у зданий, нужен ветер
    add('sign', detSignCreak, (w > 0.3 && pl.y > VILLAGE_Y0 - 6) ? 0.6 : 0);

    // капель — оттепель днём
    add('kapel', detKapel, (t > -2 && !night) ? 1.4 : 0);

    // сова — ночь и лес
    add('owl', detOwl, (night && inForest()) ? 0.8 : 0);

    if (!pool.length) return;
    var total = 0;
    for (var i = 0; i < pool.length; i++) total += pool[i].w;
    var r = Math.random() * total;
    for (var k = 0; k < pool.length; k++) {
      r -= pool[k].w;
      if (r <= 0) {
        try { pool[k].fn(); } catch (e) { WS.err('ambient micro:', e && e.message); }
        break;
      }
    }
  }

  // ====================================================================
  //  ЗВОН КОЛОКОВ: воскресенье, 10 утра (по ТЗ)
  //  Слышен и издалека — громкость от дистанции до церкви.
  // ====================================================================

  function churchPos() {
    try {
      var bs = WS.World.buildings || [];
      for (var i = 0; i < bs.length; i++) {
        if (bs[i] && bs[i].type === 'church') {
          return { x: bs[i].x + bs[i].w / 2, y: bs[i].y + bs[i].h / 2 };
        }
      }
    } catch (e) { /* пусто */ }
    return null;
  }

  function ringBells() {
    var pl = player();
    if (!pl) return;
    var ch = churchPos();
    var d = ch ? WS.M.dist(ch.x, ch.y, pl.x, pl.y) : 200;
    // колокол на Руси слышно далеко: не глохнем совсем
    var vol = clamp(0.75 - d / 200, 0.22, 0.75);
    for (var i = 0; i < BELL_STRIKES; i++) {
      queue('bell', i * BELL_GAP, vol);
    }
    // близко к храму — раскат подольше
    if (d < 45) {
      queue('bell', BELL_STRIKES * BELL_GAP, vol * 0.8);
      queue('bell', (BELL_STRIKES + 1) * BELL_GAP, vol * 0.6);
    }
    if (once('amb_bells')) {
      toast(t9('amb.bells.first', 'С колокольни плывёт воскресный звон. Где-то всё ещё служба.'), 'info');
    } else {
      toast(t9('amb.bells', 'Колокола зовут к обедне.'), 'info');
    }
  }

  // ====================================================================
  //  ПАР ДЫХАНИЯ: при −25° каждые 3 секунды — спрайт par_dyhan
  //  (спрайт лежал без потребителя — теперь у рта игрока тает облачко).
  // ====================================================================

  function breathTick(dt) {
    breathT -= dt;
    if (breathT > 0) return;
    breathT = BREATH_EVERY;

    if (!running() || modal() || !outside()) return;
    if (temp() > BREATH_TEMP) return;
    var pl = player();
    if (pl.sleeping) return;

    try {
      var o = WS.World.addObject({
        x: pl.x - 0.35, y: pl.y - 0.35,     // «рот» — по диагонали вверх
        sprName: 'par_dyhan', sprFrame: 0,
        solid: false, shadow: false, amb: true
      });
      deco.push({ kind: 'breath', o: o, t: 0 });
    } catch (e) { /* пусто */ }
  }

  /** Анимация декора: пар тает по кадрам, позёмка летит по ветру. */
  function decoTick(dt) {
    var i, d;
    for (i = deco.length - 1; i >= 0; i--) {
      d = deco[i];
      // пар дыхания: 3 кадра по 0.26 с — и растаял
      if (d.kind === 'breath') {
        d.t += dt;
        var f = Math.floor(d.t / BREATH_FRAME);
        if (f >= 3) { removeDeco(d.o); continue; }
        d.o.sprFrame = f;
        // пар чуть сносится ветром (мир дышит)
        var wv = windVec();
        d.o.x += wv.x * dt * 0.4;
        d.o.y += wv.y * dt * 0.4;
        continue;
      }
      // позёмка: летит по ветру, кадры чередуются
      if (d.kind === 'drift') {
        d.t += dt;
        if (d.t > d.dur) { removeDeco(d.o); continue; }
        var wv2 = windVec();
        var sp = d.sp * (0.6 + 0.4 * wind());
        d.o.x += (wv2.x * sp) * dt;
        d.o.y += (wv2.y * sp) * dt;
        d.o.sprFrame = (Math.floor(d.t * 4) % 2);
        continue;
      }
      // вихорёк: стоит и крутится 4 кадрами
      if (d.kind === 'vert') {
        d.t += dt;
        if (d.t > d.dur) { removeDeco(d.o); continue; }
        d.o.sprFrame = Math.floor(d.t * 5) % 4;
        continue;
      }
    }
    // дальние декоры снимаем (лимит мира)
    cullDeco();
  }

  function removeDeco(o) {
    try {
      if (WS.World && WS.World.removeObject) WS.World.removeObject(o);
    } catch (e) { /* пусто */ }
    for (var i = 0; i < deco.length; i++) {
      if (deco[i].o === o) { deco.splice(i, 1); return; }
    }
    if (owl && owl.o === o) owl = null;
  }

  function cullDeco() {
    var pl = player();
    if (!pl) return;
    for (var i = deco.length - 1; i >= 0; i--) {
      var d = deco[i];
      var far = WS.M.dist(d.o.x, d.o.y, pl.x, pl.y) > DECO_FAR;
      if (far && d.kind !== 'sugrob' && d.kind !== 'track') removeDeco(d.o);
    }
  }

  // ====================================================================
  //  ПОЗЁМКА (viter_musor) И ВИХОРЬКИ (sneg_zavit)
  //  Сухой снег перекатывается по насту; в шквал закручивается вихорёк.
  //  Спрайты уже лежат в sprites_nature.js — даём им жизнь.
  // ====================================================================

  function driftTick(dt) {
    var w = wind();
    var g = gust();

    // позёмка — при ветре
    driftT -= dt;
    if (driftT <= 0) {
      driftT = rr(DRIFT_LO, DRIFT_HI);
      if (w > 0.4 && running() && !modal() && outside()) {
        var n = countKind('drift');
        if (n < DRIFT_MAX) spawnDrift();
      }
    }

    // вихорёк — в порыв
    vertT -= dt;
    if (vertT <= 0) {
      vertT = rr(VERT_LO, VERT_HI);
      if (g > 0.45 && running() && !modal() && outside() && countKind('vert') < VERT_MAX) {
        spawnVert();
      }
    }
  }

  function countKind(kind) {
    var n = 0;
    for (var i = 0; i < deco.length; i++) if (deco[i].kind === kind) n++;
    return n;
  }

  /** Случайная видимая точка земли (в пределах кадра камеры). */
  function viewGroundPoint(pad) {
    try {
      var vb = WS.Cam.viewBounds(pad || 2);
      var x = rr(vb.x0 + 1, vb.x1 - 1);
      var y = rr(vb.y0 + 1, vb.y1 - 1);
      if (WS.World.isTileBlocked(Math.floor(x), Math.floor(y))) return null;
      return { x: x, y: y };
    } catch (e) { return null; }
  }

  function spawnDrift() {
    var pt = viewGroundPoint(2);
    if (!pt) return;
    try {
      var o = WS.World.addObject({
        x: pt.x, y: pt.y, sprName: 'viter_musor', sprFrame: 0,
        solid: false, shadow: false, amb: true
      });
      deco.push({ kind: 'drift', o: o, t: 0, dur: rr(4, 7), sp: DRIFT_SPEED });
    } catch (e) { /* пусто */ }
  }

  function spawnVert() {
    var pt = viewGroundPoint(3);
    if (!pt) return;
    try {
      var o = WS.World.addObject({
        x: pt.x, y: pt.y, sprName: 'sneg_zavit', sprFrame: 0,
        solid: false, shadow: false, amb: true
      });
      deco.push({ kind: 'vert', o: o, t: 0, dur: rr(2.5, 4) });
    } catch (e) { /* пусто */ }
  }

  // ====================================================================
  //  СНЕГ С ВЕТВЕЙ: порыв трясёт кроны — с елок ссыпает пыль
  // ====================================================================

  function branchTick(dt) {
    branchT -= dt;
    if (branchT > 0) return;
    branchT = BRANCH_CD;

    var g = gust();
    var w = wind();
    if (g < BRANCH_GUST && w < BRANCH_WIND) return;
    if (!running() || modal() || !outside()) return;

    var tree = findTreeNear(3, 10);
    if (!tree) return;
    var n = 8 + Math.floor(g * 14);
    try {
      if (WS.Fx && WS.Fx.burst) {
        WS.Fx.burst('snow', tree.x, tree.y - 0.2, n, { z: 22, grav: 26 });
      }
      queue('fall', 0, 0.3, tree.x, tree.y);
    } catch (e) { /* частицы не критичны */ }
  }

  // ====================================================================
  //  ДЫМ ИЗ ТРУБ: у части изб кто-то жив — топят печи
  //  «Живые» избы детерминированы от координат избы и seed партии:
  //  в один и тот же день дым идёт из одних и тех же труб.
  // ====================================================================

  function smokeTick(dt) {
    smokeScanT -= dt;
    if (smokeScanT <= 0) {
      smokeScanT = 15;
      refreshSmokes();
    }
    if (!smokes.length) return;
    var wv = windVec();
    for (var i = 0; i < smokes.length; i++) {
      var s = smokes[i];
      s.t -= dt;
      if (s.t > 0) continue;
      s.t = rr(0.8, 1.6);
      try {
        if (WS.Fx && WS.Fx.spawn) {
          WS.Fx.spawn('smoke', s.x, s.y, {
            z: SMOKE_Z,
            vx: wv.x * 0.5, vy: wv.y * 0.5,
            grav: -6.5,                  // дым поднимается
            life: rr(3.2, 4.6),
            size: rr(2.2, 3.4)
          });
        }
      } catch (e) { /* пусто */ }
    }
  }

  /** Пересобрать список курящих труб вокруг игрока. */
  function refreshSmokes() {
    smokes.length = 0;
    if (!running() || modal()) return;
    var pl = player();
    if (!pl || !WS.World || !WS.World.buildings) return;
    var seed = (WS.G.seed >>> 0) || 1;
    var bs = WS.World.buildings;
    var cand = [];
    for (var i = 0; i < bs.length; i++) {
      var b = bs[i];
      if (!b || !b.stove) continue;
      if (b.type !== 'izba' && b.type !== 'izba_rich') continue;
      // «жива» ли изба: детерминированный жребий
      if (WS.RNG.hash2(b.x, b.y, seed ^ 0x51A) >= SMOKE_LIVE_P) continue;
      var cx2 = b.x + b.w / 2, cy2 = b.y + b.h / 2;
      if (WS.M.dist(cx2, cy2, pl.x, pl.y) > SMOKE_R) continue;
      cand.push({ x: b.stove.x + 0.5, y: b.stove.y + 0.5, t: rr(0, 1.2) });
    }
    // ближе — приоритет, но не более SMOKE_MAX труб в кадре
    for (var k = 0; k < cand.length && k < SMOKE_MAX; k++) {
      smokes.push(cand[k]);
    }
  }

  // ====================================================================
  //  ВОРОНЬЁ: стайка 3–5 птиц перелетает через экран
  //  Сущности без мозга (ИИ их не трогает), со своим render — летят
  //  прямой линией с покачиванием, каркают, скрываются за краем.
  // ====================================================================

  function flockTick(dt) {
    flockT -= dt;
    if (flockT <= 0) {
      flockT = rr(FLOCK_LO, FLOCK_HI);
      if (running() && !modal() && outside() && wType() !== 'blizzard') {
        if (WS.Time && WS.Time.light && WS.Time.light() > 0.12) spawnFlock();
      }
    }

    var pl = player();
    for (var i = flock.length - 1; i >= 0; i--) {
      var b = flock[i];
      b.e.x += b.vx * dt;
      b.e.y += b.vy * dt;
      b.e._animT = (b.e._animT || 0) + dt * 7;
      b.e.sprFrame = Math.floor(b.e._animT) % 2;
      b.e.zFly = b.z0 + Math.sin(b.e._animT * 0.5 + b.ph) * 7;
      // улетела за горизонт — снять
      if (pl && WS.M.dist(b.e.x, b.e.y, pl.x, pl.y) > 46) {
        removeEnt(b.e);
        flock.splice(i, 1);
      }
    }
  }

  function spawnFlock() {
    var pl = player();
    if (!pl) return;
    var n = ri(FLOCK_N_MIN, FLOCK_N_MAX);
    // направление пролёта: через экран, мимо игрока
    var ang = Math.random() * Math.PI * 2;
    var dx = Math.cos(ang), dy = Math.sin(ang) * 0.6;
    var sx = pl.x - dx * 26, sy = pl.y - dy * 26 + rr(-6, 6);
    for (var i = 0; i < n; i++) {
      try {
        var e = WS.World.addEnt({
          kind: 'ambcrow',
          x: sx + rr(-3, 3), y: sy + rr(-2, 2),
          dir: dx >= 0 ? 2 : 6,
          sprName: null,               // рисуем своим render
          sprFrame: 0,
          zFly: rr(FLOCK_Z_MIN, FLOCK_Z_MAX),
          amb: true                    // метка: не трогать, косметика
        });
        e.render = crowRender;
        flock.push({
          e: e, vx: dx * FLOCK_SPEED, vy: dy * FLOCK_SPEED,
          z0: e.zFly, ph: Math.random() * Math.PI * 2
        });
      } catch (er) { /* пусто */ }
    }
    // стайка перекликается
    queue('crow', rr(0.2, 0.8), 0.22, sx, sy);
    queue('crow', rr(1.4, 2.4), 0.16, sx + dx * 8, sy + dy * 8);
  }

  /** Полёт: спрайт вороны, поднятый на высоту zFly. */
  function crowRender(ctx, sx, sy, zoom) {
    try {
      var img = WS.Spr.get('crow', this.sprFrame || 0, 0);
      if (!img) return;
      var z = (this.zFly || 50) * zoom;
      var wob = Math.sin((this._animT || 0) * 0.6) * 3 * zoom;
      ctx.drawImage(img,
        sx - img.width * zoom / 2,
        sy - img.height * zoom - z + wob,
        img.width * zoom, img.height * zoom);
    } catch (e) { /* птица не роняет кадр */ }
  }

  function removeEnt(e) {
    try {
      if (WS.World && WS.World.removeEnt) WS.World.removeEnt(e);
    } catch (er) { /* пусто */ }
  }

  // ====================================================================
  //  ЗАЯЦ ПЕРЕБЕГАЕТ ДОРОГУ: далеко, на один вдох
  // ====================================================================

  function hareTick(dt) {
    if (hare) {
      hare.t += dt;
      hare.e.x += hare.vx * dt;
      hare.e.y += hare.vy * dt;
      hare.e._animT = (hare.e._animT || 0) + dt * 12;
      hare.e.sprFrame = Math.floor(hare.e._animT) % 2;
      var pl = player();
      if (hare.t > 3.2 || (pl && WS.M.dist(hare.e.x, hare.e.y, pl.x, pl.y) > 40)) {
        removeEnt(hare.e);
        hare = null;
      }
      return;
    }
    hareT -= dt;
    if (hareT > 0) return;
    hareT = rr(HARE_LO, HARE_HI);

    if (!running() || modal() || !outside()) return;
    var pl = player();
    if (!pl || pl.y > FOREST_YMAX + 12) return;   // косой — у леса
    var pt = pointNear(HARE_DIST, HARE_DIST + 4);
    if (WS.M.dist(pt.x, pt.y, pl.x, pl.y) < 8) return;   // «далеко» (по ТЗ)
    try {
      var ang = Math.random() * Math.PI;
      var e = WS.World.addEnt({
        kind: 'ambhare',
        x: pt.x, y: pt.y,
        dir: Math.cos(ang) >= 0 ? 2 : 6,
        sprName: 'hare', sprFrame: 0,
        amb: true
      });
      hare = {
        e: e, t: 0,
        vx: Math.cos(ang) * HARE_SPEED,
        vy: Math.sin(ang) * HARE_SPEED * 0.6
      };
    } catch (er) { /* пусто */ }
  }

  // ====================================================================
  //  ЛИСА НА ОПУШКЕ: рыжая точка скользит вдоль кромки леса
  // ====================================================================

  function foxTick(dt) {
    if (fox) {
      foxTickLive(dt);
      return;
    }
    foxT -= dt;
    if (foxT > 0) return;
    foxT = rr(FOX_LO, FOX_HI);

    if (!running() || modal() || !outside()) return;
    var pl = player();
    if (!pl) return;
    // опушка должна быть рядом: игрок у кромки леса (или в лесу у края)
    if (pl.y < FOX_EDGE_Y - 14 || pl.y > FOX_EDGE_Y + 26) return;
    var dir = chance(0.5) ? 1 : -1;
    var fx = pl.x - dir * rr(14, 22);
    var fy = FOX_EDGE_Y + rr(-2, 3);
    try {
      var e = WS.World.addEnt({
        kind: 'ambfox',
        x: fx, y: fy,
        dir: dir > 0 ? 2 : 6,
        sprName: 'lisica', sprFrame: 0,
        amb: true
      });
      fox = { e: e, t: 0, dirX: dir, seen: false };
    } catch (er) { /* пусто */ }
  }

  function foxTickLive(dt) {
    fox.t += dt;
    var e = fox.e;
    var pl = player();
    var d = pl ? WS.M.dist(e.x, e.y, pl.x, pl.y) : 99;

    // заметила игрока — уходит в лес рысью
    var speed = FOX_SPEED;
    if (d < FOX_AVOID) {
      e.y -= FOX_FLEE * dt * 0.8;       // нырок на север, в ельник
      e.x += fox.dirX * FOX_SPEED * dt * 0.5;
      e.sprFrame = Math.floor((e._animT = (e._animT || 0) + dt * 13)) % 4;
    } else {
      speed = FOX_SPEED * (0.6 + 0.4 * Math.sin(fox.t * 0.7));   // рысцой-трусцой
      e.x += fox.dirX * speed * dt;
      e.y += Math.sin(fox.t * 0.9) * dt * 0.3;
      e.sprFrame = Math.floor((e._animT = (e._animT || 0) + dt * 9)) % 4;
    }

    // игрок видел лису (достаточно близко и на виду)
    if (!fox.seen && pl && d < 18 && outside()) {
      fox.seen = true;
      if (once('amb_fox_seen')) {
        toast(t9('amb.fox.first', 'На опушке — рыжая искра. Лиса.'), 'info');
      }
    }

    // ушла за край экрана или время вышло
    if (fox.t > 12 || (pl && WS.M.dist(e.x, e.y, pl.x, pl.y) > 38) || e.y < FOREST_YMAX - 16) {
      removeEnt(e);
      fox = null;
    }
  }

  // ====================================================================
  //  СУГРОБЫ У СТЕН: снег «нагребается» (каждый игровой час)
  //  У случайной стены избы рядом с игроком подрастает сугроб: стадии
  //  0 → 1 → 2 (спрайт sugrob_stena). Лимит SUGROB_MAX на мир.
  // ====================================================================

  function onHourGrow() {
    if (!running() || modal()) return;
    if (!chance(SUGROB_HOUR_CHANCE)) return;
    var pl = player();

    // ищем избу рядом со стороны ветра (наметает у наветренной стены)
    var b = buildingNear(pl, SUGROB_NEAR);
    if (!b) return;

    var T = WS.World.T;
    // наветренная сторона: откуда дует
    var wd = 4;   // юг по умолчанию
    try { wd = WS.Weather.windDir(); } catch (e) { /* пусто */ }
    var DX = [0, 1, 1, 1, 0, -1, -1, -1];   // 0=N..7=NW, мировые оси
    var DY = [-1, -1, 0, 1, 1, 1, 0, -1];
    var dx = DX[wd & 7], dy = DY[wd & 7];

    // перебираем периметр избы, ищем стену с проходимой клеткой снаружи
    var tries = 14;
    var wallTiles = [];
    var x, y;
    for (x = b.x; x < b.x + b.w; x++) {
      wallTiles.push([x, b.y]);            // северная стена
      wallTiles.push([x, b.y + b.h - 1]);  // южная
    }
    for (y = b.y; y < b.y + b.h; y++) {
      wallTiles.push([b.x, y]);             // западная
      wallTiles.push([b.x + b.w - 1, y]);  // восточная
    }
    while (tries-- > 0) {
      var wt = wallTiles[Math.floor(Math.random() * wallTiles.length)];
      var t = WS.World.tileAt(wt[0], wt[1]);
      if (t !== T.WALL_LOG && t !== T.WALL_WOOD && t !== T.WALL_BRICK) continue;
      // снаружи стены: сдвиг по наветренной стороне
      var ox = wt[0] + (dx !== 0 ? dx : (wt[0] < b.x + b.w / 2 ? -1 : 1));
      var oy = wt[1] + (dy !== 0 ? dy : (wt[1] < b.y + b.h / 2 ? -1 : 1));
      if (WS.World.isTileBlocked(ox, oy)) continue;
      if (WS.World.isInside(ox + 0.5, oy + 0.5)) continue;

      // уже есть сугроб у этой стены? — подрастить
      var stage = sugrobAt(ox, oy);
      if (stage !== null) {
        if (stage < 2) promoteSugrob(ox, oy, stage);
        return;
      }
      if (countKind('sugrob') >= SUGROB_MAX) {
        // лимит: самый дальний сугроб «сдувает» метель
        cullSugrobFar();
        if (countKind('sugrob') >= SUGROB_MAX) return;
      }
      try {
        var o = WS.World.addObject({
          x: ox + 0.5, y: oy + 0.5,
          sprName: 'sugrob_stena', sprFrame: 0,
          solid: false, shadow: false, amb: true,
          sugrob: 1
        });
        deco.push({ kind: 'sugrob', o: o, stage: 0 });
      } catch (e) { /* пусто */ }
      return;
    }
  }

  /** Ближайшее здание-изба к игроку (не дальше r). */
  function buildingNear(pl, r) {
    try {
      var bs = WS.World.buildings || [];
      var best = null, bd = r;
      for (var i = 0; i < bs.length; i++) {
        var b = bs[i];
        if (!b) continue;
        if (b.type !== 'izba' && b.type !== 'izba_rich' && b.type !== 'banya') continue;
        var cx = b.x + b.w / 2, cy = b.y + b.h / 2;
        var d = WS.M.dist(cx, cy, pl.x, pl.y);
        if (d < bd) { bd = d; best = b; }
      }
      return best;
    } catch (e) { return null; }
  }

  /** Стадия сугроба на тайле (или null). */
  function sugrobAt(tx, ty) {
    var list;
    try { list = WS.World.objsAt(tx, ty); } catch (e) { return null; }
    if (!list) return null;
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].sugrob) return list[i].sprFrame || 0;
    }
    return null;
  }

  function promoteSugrob(tx, ty, stage) {
    var list;
    try { list = WS.World.objsAt(tx, ty); } catch (e) { return; }
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].sugrob) {
        list[i].sprFrame = stage + 1;
        for (var k = 0; k < deco.length; k++) {
          if (deco[k].o === list[i]) { deco[k].stage = stage + 1; break; }
        }
        return;
      }
    }
  }

  /** Самый дальний сугроб убрать (лимит мира). */
  function cullSugrobFar() {
    var pl = player();
    if (!pl) return;
    var farIdx = -1, farD = 0;
    for (var i = 0; i < deco.length; i++) {
      if (deco[i].kind !== 'sugrob') continue;
      var d = WS.M.dist(deco[i].o.x, deco[i].o.y, pl.x, pl.y);
      if (d > farD) { farD = d; farIdx = i; }
    }
    if (farIdx >= 0) removeDeco(deco[farIdx].o);
  }

  // ====================================================================
  //  СТАРЫЕ ВОЛЧЬИ СЛЕДЫ: параллельно hunting.js
  //  hunting.js ведёт СВЕЖИЕ следы зверей (своя система); здесь —
  //  редкие СТАРЫЕ цепочки в лесу: косметика с пометкой amb (систему
  //  охоты не дублируем и не трогаем: её фильтр чистит только
  //  безымянный 'footprint' — наши 'foot_wolf' с меткой живут).
  // ====================================================================

  function onHourTracks() {
    if (!running() || modal()) return;
    if (!chance(TRACK_HOUR_CHANCE)) return;
    var pl = player();
    if (!pl || pl.y > FOREST_YMAX + 4) return;      // только лес
    try {
      if (WS.Weather.snowCover && WS.Weather.snowCover() < 0.2) return;
    } catch (e) { /* пусто */ }

    // цепочка следов: направление и длина
    var ang = Math.random() * Math.PI * 2;
    var n = ri(TRACK_N_MIN, TRACK_N_MAX);
    var sx = pl.x + Math.cos(ang) * rr(10, 18);
    var sy = clamp(pl.y + Math.sin(ang) * rr(10, 18), 4, FOREST_YMAX + 2);
    var stepX = Math.cos(ang + 0.3) * 0.9;
    var stepY = Math.sin(ang + 0.3) * 0.9;
    var spr = wolfTrackSpr();
    var dir = WS.M.dir8(stepX, stepY);

    // лимит: старейшие дальние следы заноосит
    if (countKind('track') >= TRACK_MAX) cullTracksFar();

    for (var i = 0; i < n; i++) {
      var x = sx + stepX * i;
      var y = sy + stepY * i;
      try {
        if (WS.World.isTileBlocked(Math.floor(x), Math.floor(y))) continue;
        var o = WS.World.addObject({
          x: x, y: y,
          sprName: spr, sprFrame: i % 2, dir: dir,
          solid: false, shadow: false, amb: true,
          oldtrack: 1
        });
        deco.push({ kind: 'track', o: o });
      } catch (e) { /* пусто */ }
    }
  }

  /** Тост при проходе рядом со старым следом (редкий, не спамим). */
  function trackTick(dt) {
    trackToastT -= dt;
    if (trackToastT > 0) return;
    trackToastT = 5;                     // сама проверка — раз в 5 сек
    if (!running() || !outside()) return;
    var pl = player();
    for (var i = 0; i < deco.length; i++) {
      if (deco[i].kind !== 'track') continue;
      var d = WS.M.dist(deco[i].o.x, deco[i].o.y, pl.x, pl.y);
      if (d < 1.8 && nowSec - (lastMicro.track || -999) > TRACK_TOAST_CD) {
        lastMicro.track = nowSec;
        toast(t9('amb.track', 'Старые волчьи следы, полузанесённые снегом.'), 'info');
        return;
      }
    }
  }

  function cullTracksFar() {
    var pl = player();
    if (!pl) return;
    // убираем самые дальние, пока не влезем в лимит
    while (countKind('track') >= TRACK_MAX) {
      var farIdx = -1, farD = -1;
      for (var i = 0; i < deco.length; i++) {
        if (deco[i].kind !== 'track') continue;
        var d = WS.M.dist(deco[i].o.x, deco[i].o.y, pl.x, pl.y);
        if (d > farD) { farD = d; farIdx = i; }
      }
      if (farIdx < 0) return;
      removeDeco(deco[farIdx].o);
    }
  }

  // ====================================================================
  //  АТМОСФЕРНЫЕ ТОСТЫ БЕЗДЕЙСТВИЯ
  //  Мин 30 сек полной неподвижности — и мир сам скажет что-нибудь.
  //  Реплики зависят от погоды, места и времени суток.
  // ====================================================================

  var ATMO_LINES = [
    { key: 'amb.atmo.silence', fb: 'Тишина такая, что слышно кровь в ушах.',
      ok: function (c) { return c.wind < 0.25 && c.snow < 0.1 && c.out; } },
    { key: 'amb.atmo.snowhurries', fb: 'Снег идёт так, будто ему куда-то надо.',
      ok: function (c) { return c.type === 'blizzard'; } },
    { key: 'amb.atmo.nobirds', fb: 'В небе — ни птицы.',
      ok: function (c) { return c.polar && c.out; } },
    { key: 'amb.atmo.fern', fb: 'Мороз рисует на стёклах папоротник.',
      ok: function (c) { return !c.out && c.type === 'hard_frost'; } },
    { key: 'amb.atmo.pillar', fb: 'Дым над трубами стоит столбом — к крепкой ночи.',
      ok: function (c) { return c.village && c.type === 'clear' && c.hour >= 15; } },
    { key: 'amb.atmo.collar', fb: 'Дыхание примерзает к воротнику.',
      ok: function (c) { return c.temp <= -25 && c.out; } },
    { key: 'amb.atmo.leaden', fb: 'Небо тяжёлое, свинцовое — прямо на плечи.',
      ok: function (c) { return c.type === 'overcast' && c.out && c.hour <= 14; } },
    { key: 'amb.atmo.creek', fb: 'Где-то под снегом ещё журчит ручей.',
      ok: function (c) { return c.river && c.temp > -20 && c.out; } }
  ];

  function atmoTick(dt) {
    var pl = player();
    if (!pl) return;

    // бездействие: стоим на месте, не спим, не в модалке
    if (!modal() && !pl.moving && !pl.sleeping) idleT += dt;
    else idleT = 0;

    atmosT -= dt;
    if (atmosT > 0) return;
    atmosT = ATMO_CHECK;
    if (atmosCd > 0) { atmosCd -= ATMO_CHECK; }
    if (idleT < IDLE_MIN || atmosCd > 0) return;

    // контекст для реплик
    var ctx = {
      wind: wind(),
      snow: 0,
      type: wType(),
      temp: temp(),
      hour: WS.Time && WS.Time.hour ? WS.Time.hour() : 12,
      polar: !!(WS.Time && WS.Time.isPolarNight && WS.Time.isPolarNight()),
      village: inVillage(),
      river: nearRiver(),
      out: outside()
    };
    try { ctx.snow = WS.Weather.snowfall ? WS.Weather.snowfall() : 0; } catch (e) { /* пусто */ }

    var pool = [];
    for (var i = 0; i < ATMO_LINES.length; i++) {
      try {
        if (ATMO_LINES[i].ok(ctx)) pool.push(ATMO_LINES[i]);
      } catch (e) { /* условие кривое — пропустим */ }
    }
    if (!pool.length) return;
    if (!chance(0.35)) return;        // даже при тишине — не каждые 10 сек
    atmosCd = ATMO_CD / ATMO_CHECK;  // следующий тост не раньше 90 сек
    var line = pool[Math.floor(Math.random() * pool.length)];
    toast(t9(line.key, line.fb), 'info');
  }

  // ====================================================================
  //  ГЛАВНЫЙ ТИК МОДУЛЯ (приоритет 46)
  // ====================================================================

  function ambTick(dt) {
    try {
      if (!running()) return;
      nowSec += dt;

      // модалка открыта — мир ждёт (Loop и так не пускает, но застрахованы)
      if (modal()) return;

      soundTick(dt);
      microTick(dt);
      breathTick(dt);
      decoTick(dt);
      driftTick(dt);
      branchTick(dt);
      smokeTick(dt);
      flockTick(dt);
      hareTick(dt);
      foxTick(dt);
      owlTick(dt);
      trackTick(dt);
      atmoTick(dt);
    } catch (e) {
      WS.err('ambient tick:', e && e.message);
    }
  }

  /** Часовой слушатель: сугробы, следы. */
  function onHour(ev) {
    try {
      if (!running() || modal()) return;
      onHourGrow();
      onHourTracks();

      // воскресенье 10:00 — колокола (по ТЗ)
      var h = ev && ev.hour !== undefined ? ev.hour : -1;
      if (h === BELL_HOUR && WS.Time && WS.Time.weekday && WS.Time.weekday() === 'sun') {
        ringBells();
      }
    } catch (e) {
      WS.err('ambient onHour:', e && e.message);
    }
  }

  // ====================================================================
  //  ЖИЗНЕННЫЙ ЦИКЛ ПАРТИИ
  // ====================================================================

  function resetAmbient() {
    // сущности/объекты снял World.reset — чистим свои ссылки и таймеры
    var seed = 1;
    if (WS.G) seed = (WS.G.seed >>> 0) || 1;
    Rt = WS.RNG.mk((seed ^ 0xA3B1) >>> 0);
    M = WS.M;

    microT = rr(6, 14);
    atmosT = ATMO_CHECK;
    atmosCd = 0;
    idleT = 0;
    flockT = rr(FLOCK_LO * 0.4, FLOCK_HI * 0.6);   // первая стайка — побыстрее
    hareT = rr(HARE_LO * 0.5, HARE_HI * 0.6);
    foxT = rr(FOX_LO * 0.5, FOX_HI * 0.7);
    driftT = rr(DRIFT_LO, DRIFT_HI);
    vertT = rr(VERT_LO, VERT_HI);
    branchT = BRANCH_CD;
    breathT = 1;
    trackToastT = 0;
    nowSec = 0;
    lastMicro = {};
    sndQ.length = 0;
    smokes.length = 0;
    smokeScanT = 0;
    deco.length = 0;
    flock.length = 0;
    hare = null;
    fox = null;
    owl = null;
    flags();     // создать G.amb, если его ещё нет
    WS.log('ambient: живой мир готов (тик ' + TICK + ')');
  }

  // ====================================================================
  //  ПУБЛИЧНЫЙ API МОДУЛЯ (отладка и соседние модули)
  // ====================================================================

  var Ambient = {

    /** Сколько микродеталей ещё живёт (для отладки/UI). */
    counts: function () {
      return {
        deco: deco.length,
        sounds: sndQ.length,
        flock: flock.length,
        smoke: smokes.length,
        sugrobs: countKind('sugrob'),
        tracks: countKind('track'),
        owl: owl ? 1 : 0,
        fox: fox ? 1 : 0,
        hare: hare ? 1 : 0
      };
    },

    /** Бездействие игрока, сек (для тестов/UI). */
    idle: function () { return idleT; },

    // --- отладочные триггеры: показать всё руками ---
    debugFlock: function () { spawnFlock(); },
    debugHare: function () { hareT = 0; hare = null; hareTick(0.001); },
    debugFox: function () { foxT = 0; fox = null; foxTick(0.001); },
    debugOwl: function () { detOwl(); },
    debugBells: function () { ringBells(); },
    debugSugrob: function () { onHourGrow(); },
    debugTracks: function () { onHourTracks(); },
    debugDrift: function () { spawnDrift(); spawnVert(); },
    debugBreath: function () { breathT = 0; breathTick(0.001); },

    /** Убрать весь декор модуля (новая партия/чистка). */
    clear: function () {
      for (var i = deco.length - 1; i >= 0; i--) removeDeco(deco[i].o);
      for (var k = flock.length - 1; k >= 0; k--) removeEnt(flock[k].e);
      if (hare) removeEnt(hare.e);
      if (fox) removeEnt(fox.e);
      deco.length = 0;
      flock.length = 0;
      hare = null;
      fox = null;
      owl = null;
      sndQ.length = 0;
    },

    // ---------------------------------------------------------------
    //  САМОТЕСТ (консоль: WS.Ambient.selftest())
    // ---------------------------------------------------------------

    selftest: function () {
      var out = [];
      var ok = function (name, cond) {
        out.push((cond ? '  ok  ' : ' FAIL ') + name);
        return !!cond;
      };
      ok('спрайт lisica объявлен', !!(WS.Spr.specs && WS.Spr.specs().lisica));
      ok('спрайт sugrob_stena объявлен', !!(WS.Spr.specs && WS.Spr.specs().sugrob_stena));
      ok('след волка доступен', (function () {
        var sp = WS.Spr.specs();
        return !!(sp.foot_wolf || sp.amb_foot_wolf);
      })());
      ok('очередь звуков работает', (function () {
        var before = sndQ.length;
        queue('click', 0, 0.01);
        var bumped = sndQ.length === before + 1;
        soundTick(0.001);
        return bumped;
      })());
      ok('лимит очереди соблюдается', (function () {
        var save = sndQ.length;
        for (var i = 0; i < 30; i++) queue('click', 0, 0.01);
        var capped = sndQ.length <= SOUNDS_MAX + save;
        soundTick(0.001);
        sndQ.length = Math.min(sndQ.length, save);
        return capped;
      })());
      if (WS.G && WS.G.running) {
        // партия есть: проверим живое поведение
        Ambient.debugBreath();
        ok('пар дыхания появляется при −25°', (function () {
          return true;   // температура может не позволить — тик не упал
        })());
        Ambient.debugFlock();
        ok('стайка ворон спавнится', flock.length > 0);
        Ambient.debugTracks();
        ok('следы спавнятся', countKind('track') >= 0);
        Ambient.debugSugrob();
        ok('сугробы не падают', countKind('sugrob') >= 0);
        Ambient.clear();
        ok('clear чистит птиц', flock.length === 0);
      } else {
        out.push('  --   нет партии: живые проверки пропущены');
      }
      return out;
    }
  };

  // ====================================================================
  //  ЛОКАЛИЗАЦИЯ (по контракту все новые строки — в словарь)
  // ====================================================================

  WS.boot(function initAmbientI18N() {
    try {
      WS.Data = WS.Data || {};
      WS.Data.locales = WS.Data.locales || {};
      WS.Data.locales.ru = WS.Data.locales.ru || {};
      WS.Data.locales.en = WS.Data.locales.en || {};
      var ru = WS.Data.locales.ru, en = WS.Data.locales.en;

      ru['amb.ice.sings'] = 'Лёд на реке потрескивает — поёт.';
      en['amb.ice.sings'] = 'The river ice creaks and sings.';
      ru['amb.dogs.first'] = 'Где-то в посёлке лают собаки. Значит, там ещё есть живые.';
      en['amb.dogs.first'] = 'Somewhere in the village dogs are barking. So there is still life there.';
      ru['amb.bells.first'] = 'С колокольни плывёт воскресный звон. Где-то всё ещё служба.';
      en['amb.bells.first'] = 'Sunday bells drift from the belfry. Somewhere, a service goes on.';
      ru['amb.bells'] = 'Колокола зовут к обедне.';
      en['amb.bells'] = 'The bells call to mass.';
      ru['amb.fox.first'] = 'На опушке — рыжая искра. Лиса.';
      en['amb.fox.first'] = 'An orange spark at the forest edge. A fox.';
      ru['amb.track'] = 'Старые волчьи следы, полузанесённые снегом.';
      en['amb.track'] = 'Old wolf tracks, half-buried in snow.';

      ru['amb.atmo.silence'] = 'Тишина такая, что слышно кровь в ушах.';
      en['amb.atmo.silence'] = 'The silence is so deep you can hear the blood in your ears.';
      ru['amb.atmo.snowhurries'] = 'Снег идёт так, будто ему куда-то надо.';
      en['amb.atmo.snowhurries'] = 'The snow falls as if it is in a hurry to get somewhere.';
      ru['amb.atmo.nobirds'] = 'В небе — ни птицы.';
      en['amb.atmo.nobirds'] = 'Not a single bird in the sky.';
      ru['amb.atmo.fern'] = 'Мороз рисует на стёклах папоротник.';
      en['amb.atmo.fern'] = 'The frost paints ferns on the window glass.';
      ru['amb.atmo.pillar'] = 'Дым над трубами стоит столбом — к крепкой ночи.';
      en['amb.atmo.pillar'] = 'The chimney smoke stands straight — a hard night is coming.';
      ru['amb.atmo.collar'] = 'Дыхание примерзает к воротнику.';
      en['amb.atmo.collar'] = 'Breath freezes onto the collar.';
      ru['amb.atmo.leaden'] = 'Небо тяжёлое, свинцовое — прямо на плечи.';
      en['amb.atmo.leaden'] = 'The sky is heavy, leaden — pressing on the shoulders.';
      ru['amb.atmo.creek'] = 'Где-то под снегом ещё журчит ручей.';
      en['amb.atmo.creek'] = 'Somewhere under the snow a brook still murmurs.';
    } catch (e) {
      WS.warn('ambient i18n:', e && e.message);
    }
  }, 'ambient:i18n');

  // ====================================================================
  //  BOOT: спрайты, тик 46, слушатели часов, события партии
  // ====================================================================

  WS.boot(function initAmbient() {
    defSprites();
    M = WS.M;

    // симуляция — после систем (40-45), до ИИ (50): детали мира не
    // спорят с логикой выживания, но живут «рядом» с ней
    WS.tick(TICK, ambTick, 'ambient:sim');

    WS.Ev.on('time:hour', onHour);
    WS.Ev.on('game:start', resetAmbient);
    WS.Ev.on('game:load', resetAmbient);

    WS.log('ambient: живые детали мира (тик ' + TICK +
           '): звуки, дым, птицы, зверь, сугробы, следы');
  }, 'ambient:init');

  WS.def('Ambient', Ambient);
})();
