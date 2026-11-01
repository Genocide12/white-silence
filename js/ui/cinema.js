/**
 * cinema.js — КИНОЗАЛ ДЕДА: просмотр записей прохождений (рой агентов
 * и твои собственные демо) в живом мире игры, на ЛЮБОЙ скорости.
 *
 * Как это работает: запись (WS.Replay) — это хронология: позиции деда,
 * мысли, действия, ХП, главы, финал. Кинозал восстанавливает мир по
 * зерну записи (генератор детерминирован), выключает симуляцию
 * (WS.G.running = false — рендер продолжается) и гонит по миру
 * «деда-призрака»: он ходит по записанным позициям, время суток и
 * освещение крутятся по плёнке, мысли всплывают пузырём, действия
 * бегут лентой. Скорости ×1…×2400, пауза, перемотка ползунком.
 *
 * Открытие: меню («🎬 Кинозал») или клавиша V. Источники записей:
 * recordings/*.json (поставляются с игрой) + localStorage (твои прогоны).
 */
(function () {
  'use strict';

  var SPEEDS = [1, 2, 4, 10, 30, 60, 150, 400, 1000, 2400];
  var DEF_SPEED_IX = 0;                  // ×1 = живой темп (ЭТАП 13: baseRate
                                        // уже растягивает плёнку роя; ×60 по
                                        // умолчанию пролетало фильм за секунды)

  var C = {
    open: false,
    playing: false,
    rec: null,                          // загруженная запись {meta, ev}
    posList: [],                        // только позиции, для интерполяции
    evI: 0, posI: 0,
    tlMin: 0, totalMin: 1,
    speedIx: DEF_SPEED_IX,
    ghost: null,                        // {x,y,dir,walkT}
    lastStat: { hp: 100, en: 0 },
    bubbleT: 0, bubbleTxt: '',
    feed: [],                           // последние действия
    ended: false,
    prevG: null,                        // что было до кинозала (меню/партия)
    restored: true
  };

  var dom = { root: null };

  // ====================================================================
  //  УТИЛИТЫ БЕЗОПАСНОГО РЕНДЕРА (имена/тексты записей — пользовательские
  //  данные: всё, что идёт в innerHTML, экранируем и типизируем)
  // ====================================================================

  /** Экранирование HTML: & < > " ' — защита от инъекций через имя записи. */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /** Число из данных записи (мусорные строки -> 0, чтобы не лезли в HTML). */
  function num(v, def) {
    var n = Number(v);
    return isFinite(n) ? n : (def || 0);
  }

  /** День для подписи: число или «?», любой мусор не попадает в разметку. */
  function dayTxt(v) {
    return (v && isFinite(Number(v))) ? String(v) : '?';
  }

  // ====================================================================
  //  МИР-ПРИЗРАК: восстановить мир по зерну без запуска симуляции
  // ====================================================================

  function buildGhostWorld(seed, prof) {
    try { WS.World.reset(); } catch (e) { /* пусто */ }
    try { if (WS.Fx && WS.Fx.clear) WS.Fx.clear(); } catch (e2) { /* пусто */ }
    var G = WS.State.newGame(seed, prof || 'telegraph', []);
    WS.G = G;
    try { WS.Gen.generate(G.seed); } catch (e3) { WS.err('cinema: генерация мира', e3 && e3.message); }
    var p = G.player;
    var sp = (WS.World && WS.World.spawnPoint) ? WS.World.spawnPoint : { x: 110, y: 110 };
    p.x = sp.x; p.y = sp.y;
    p.marker = true;
    try { WS.World.addEnt(p); } catch (e4) { /* пусто */ }
    try { if (WS.Weather && WS.Weather.newGame) WS.Weather.newGame(G.seed); } catch (e5) { /* пусто */ }
    G.running = false;                  // НИКАКОЙ симуляции — только рендер
    try { WS.Cam.follow = p; } catch (e6) { /* пусто */ }
    try { WS.Cam.cx = p.x; WS.Cam.cy = p.y; } catch (e7) { /* пусто */ }
    // ФОНАРЬ ДЕДА-ПРИЗРАКА: тёплый ореол, следует за призраком по плёнке.
    // Мир-призрак пуст (ни костров, ни окон) — без него ночная часть
    // плёнки была бы чёрной даже с «ночной съёмкой» gfx.js.
    try {
      C.light = WS.World.addLight({ x: p.x, y: p.y, r: 76, a: 0.98, flicker: true, fire: true });
    } catch (eL) { C.light = null; }
    return p;
  }

  // ====================================================================
  //  ПЛЁНКА: события записи
  // ====================================================================

  function prep(rec) {
    C.rec = rec;
    C.posList = [];
    var ev = (rec && rec.ev) || [];
    for (var i = 0; i < ev.length; i++) {
      if (ev[i][1] === 0) C.posList.push(ev[i]);
    }
    C.totalMin = ev.length ? (ev[ev.length - 1][0] || 1) : 1;
    if (C.totalMin < 1) C.totalMin = 1;
    // старт — с ПЕРВОГО события плёнки: запись начинается в 08:00
    // (totalMin=480), до него в данных пусто, дед стоял бы 8 «часов»
    C.tMin0 = ev.length ? Math.max(0, ev[0][0]) : 0;
    if (C.tMin0 >= C.totalMin) C.tMin0 = 0;
    C.evI = 0; C.posI = 0;
    C.tlMin = C.tMin0;
    C.ended = false;
    C.feed = [];
    C.lastStat = { hp: 100, en: 0 };
    C.ghost = { x: 0, y: 0, dir: 4, walkT: 0 };
    if (C.posList.length) {
      C.ghost.x = C.posList[0][2];
      C.ghost.y = C.posList[0][3];
    }
    C.baseRate = calcBaseRate();
  }

  /** Калибровка темпа плёнки (ЭТАП 13): «×1» = живой темп ходьбы.
   *  Рой/демо играли через Loop.speed — часы летели в N раз быстрее
   *  физики, поэтому в записи дед проходит лишь ~0.07 тайла за игровую
   *  минуту (в живой игре ×1 — 2.2). Без калибровки просмотр на ×1
   *  показывал «дед практически не движется». Считаем медианный темп
   *  ходьбы по сэмплам и растягиваем время так, чтобы шаг выглядел
   *  живым; день тогда пролетает за ~40-60 сек, вся плёнка — кино
   *  на 15-60 минут. Для плёнок, записанных в живом темпе (медиана
   *  ≈ 2.2), калибровка автоматически даёт 1. */
  function calcBaseRate() {
    var LIVE_TPM = 2.2;                  // тайлов за игровую минуту в живой ×1
    var pl = C.posList, rates = [];
    for (var i = 1; i < pl.length; i++) {
      var dmin = pl[i][0] - pl[i - 1][0];
      if (dmin <= 0) continue;
      var dist = Math.abs(pl[i][2] - pl[i - 1][2]) + Math.abs(pl[i][3] - pl[i - 1][3]);
      if (dist > 0.15) rates.push(dist / dmin);
    }
    if (rates.length < 8) return 1;      // данных мало — честный темп
    rates.sort(function (a, b) { return a - b; });
    var med = rates[rates.length >> 1];
    if (!(med > 0.01)) return 1;
    var k = LIVE_TPM / med;
    if (k < 1) k = 1;                    // быстрее живого не ускоряем
    if (k > 60) k = 60;
    return k;
  }

  function applyUpTo(min) {
    var ev = C.rec.ev;
    while (C.evI < ev.length && ev[C.evI][0] <= min) {
      var e = ev[C.evI];
      switch (e[1]) {
        case 1: // мысль
          C.bubbleTxt = e[2]; C.bubbleT = 4.5;
          break;
        case 2: // действие
          C.feed.push({ txt: e[2], cls: e[3] });
          if (C.feed.length > 30) C.feed.shift();
          break;
        case 3: // статистика
          C.lastStat = { hp: e[2], en: e[3] };
          break;
        case 4: // глава
          C.feed.push({ txt: '— ' + e[2] + ' —', cls: 'chapter' });
          if (C.feed.length > 30) C.feed.shift();
          break;
        case 5: // финал
          onTapeEnd(e[2], e[3]);
          break;
      }
      C.evI++;
    }
  }

  function onTapeEnd(res, day) {
    if (C.ended) return;
    C.ended = true;
    C.playing = false;
    var m = C.rec.meta || {};
    var el = dom.root.querySelector('.cn-end');
    if (el) {
      var title = res === 'victory' ? '🏆 ТАРЕЛКА ПРИЛЕТЕЛА!' :
        res === 'death' ? '💀 ДЕД УСНУЛ НАВСЕГДА' : '⏹ ЗАПИСЬ ОБОРВАЛАСЬ';
      var sub = res === 'victory' ?
        ('Победа на день ' + (day || m.day || '?') + ' · изгнано мультяшек: ' + (m.banished || 0) + ' · Грибных Зовов: ' + (m.calls || 0)) :
        ('Дожил до дня ' + (day || m.day || '?') + ' · изгнано мультяшек: ' + (m.banished || 0));
      el.querySelector('.cn-end-title').textContent = title;
      el.querySelector('.cn-end-sub').textContent = sub;
      el.classList.remove('hidden');
    }
  }

  // ====================================================================
  //  КАДР КИНОЗАЛА (рендер-тик): двигаем призрака, время и камеру
  // ====================================================================

  function cinemaFrame(rdt) {
    if (!C.open || !C.rec) return;
    if (C.playing && !C.ended) {
      // ×N — относительно ЖИВОГО темпа (см. calcBaseRate): baseRate
      // переводит игровые минуты плёнки в «как выглядела игра у оператора»
      C.tlMin += rdt * SPEEDS[C.speedIx] * (C.baseRate || 1);
      if (C.tlMin > C.totalMin) C.tlMin = C.totalMin;
      applyUpTo(C.tlMin);
    }
    if (C.bubbleT > 0) C.bubbleT -= rdt;

    // позиция призрака: интерполяция между сэмплами
    var pl = C.posList;
    if (pl.length) {
      while (C.posI < pl.length - 1 && pl[C.posI + 1][0] <= C.tlMin) C.posI++;
      var a = pl[C.posI], b = (C.posI < pl.length - 1) ? pl[C.posI + 1] : null;
      var gx = a[2], gy = a[3];
      if (b) {
        var f = (b[0] > a[0]) ? (C.tlMin - a[0]) / (b[0] - a[0]) : 1;
        if (f < 0) f = 0; if (f > 1) f = 1;
        gx = a[2] + (b[2] - a[2]) * f;
        gy = a[3] + (b[3] - a[3]) * f;
      }
      // анимация шага — по ФАКТИЧЕСКОЙ скорости на экране (тайлов/сек):
      // дед шагает, только когда действительно идёт, и в темпе движения
      var pvx = C.ghost.x, pvy = C.ghost.y;
      var moved = Math.abs(gx - pvx) + Math.abs(gy - pvy);
      if (rdt > 0 && moved / rdt > 0.08) {
        C.ghost.walkT += rdt * Math.min(3, (moved / rdt) / 2.2);
      }
      // направление по движению
      var dx = gx - C.ghost.x, dy = gy - C.ghost.y;
      if (Math.abs(dx) + Math.abs(dy) > 0.02) {
        var ang = Math.atan2(dy, dx);
        C.ghost.dir = dirFromAng(ang);
      }
      C.ghost.x = gx; C.ghost.y = gy;
    }

    // применяем к миру-призраку
    var g = WS.G;
    if (g && g.player) {
      var p = g.player;
      p.x = C.ghost.x; p.y = C.ghost.y;
      p.dir = C.ghost.dir;
      p.sprFrame = Math.floor(C.ghost.walkT * 8) % 4;
      p.hp = C.lastStat.hp;
      try { WS.Cam.cx = p.x; WS.Cam.cy = p.y; } catch (e) { /* пусто */ }
      // фонарь деда-призрака ходит вместе с ним (см. buildGhostWorld)
      if (C.light) { C.light.x = p.x; C.light.y = p.y; }
    }
    // время суток: пишем прямо в состояние — освещение оживает
    if (g && g.time) {
      var mm = Math.max(0, C.tlMin);
      g.time.day = Math.floor(mm / 1440) + 1;
      g.time.min = mm % 1440;
      g.time.totalMin = mm;
    }
    // снег живёт (погода обновляется маленькими шажками, без событий)
    try {
      if (C.playing && WS.Weather && WS.Weather.update) {
        WS.Weather._cinemaMute = true;
        WS.Weather.update(Math.min(0.05, rdt));
        WS.Weather._cinemaMute = false;
      }
    } catch (eW) { /* снег замерзает — не страшно */ }

    updateHud();
  }

  function dirFromAng(a) {
    // 0=N..7=NW (как в контракте сущностей)
    var deg = ((a * 180 / Math.PI) + 90 + 360) % 360;
    return Math.round(deg / 45) % 8;
  }

  // ====================================================================
  //  HUD КИНОЗАЛА
  // ====================================================================

  function fmtT(min) {
    var d = Math.floor(min / 1440) + 1;
    var m = Math.floor(min % 1440);
    var h = Math.floor(m / 60), mm = m % 60;
    return 'Д' + d + ' ' + (h < 10 ? '0' : '') + h + ':' + (mm < 10 ? '0' : '') + mm;
  }

  function updateHud() {
    if (!dom.root) return;
    var m = C.rec.meta || {};
    var el;
    el = dom.root.querySelector('.cn-time');
    if (el) el.textContent = fmtT(C.tlMin);
    el = dom.root.querySelector('.cn-hp');
    if (el) el.textContent = Math.round(C.lastStat.hp) + ' ХП';
    el = dom.root.querySelector('.cn-en');
    if (el) el.textContent = Math.round(C.lastStat.en) + ' 🍄';
    el = dom.root.querySelector('.cn-speed');
    if (el) el.textContent = '×' + SPEEDS[C.speedIx];
    el = dom.root.querySelector('.cn-name');
    if (el) el.textContent = '🎬 «' + (m.name || 'Дед') + '»';
    // пузырь мысли
    var bub = dom.root.querySelector('.cn-bubble');
    if (bub) {
      if (C.bubbleT > 0 && C.bubbleTxt) {
        bub.textContent = '💭 «' + C.bubbleTxt + '»';
        bub.classList.remove('hidden');
      } else {
        bub.classList.add('hidden');
      }
    }
    // лента действий (тексты плёнки — пользовательские данные: экранируем)
    var feed = dom.root.querySelector('.cn-feed');
    if (feed) {
      var html = '';
      for (var i = C.feed.length - 1, n = 0; i >= 0 && n < 7; i--, n++) {
        var f = C.feed[i];
        html += '<div class="cn-feed-row ' + esc(f.cls || '') + '">' + esc(f.txt) + '</div>';
      }
      feed.innerHTML = html;
    }
    // подсветка активной кнопки в ряду скоростей ×1..×2400
    var spBtns = dom.root.querySelectorAll('.cn-speed-btn');
    for (var sb = 0; sb < spBtns.length; sb++) {
      if (parseInt(spBtns[sb].getAttribute('data-speed'), 10) === C.speedIx) spBtns[sb].classList.add('active');
      else spBtns[sb].classList.remove('active');
    }
    // ползунок
    var scrub = dom.root.querySelector('.cn-scrub');
    if (scrub && C.totalMin > 0) {
      scrub.value = Math.round((C.tlMin / C.totalMin) * 1000);
    }
  }

  // ====================================================================
  //  СПИСОК ЗАПИСЕЙ
  // ====================================================================

  function recRow(meta, src, id, file) {
    var icon = meta.result === 'victory' ? '🏆' : (meta.result === 'death' ? '💀' : '⏹');
    var dur = Math.round(num(meta.realSec, 0) / 60);
    // имя и файл — пользовательские данные: экранируем от HTML/JS-инъекций
    return '<div class="cn-rec" data-src="' + esc(src) + '" data-id="' + esc(id) + '" data-file="' + esc(file || '') + '">' +
      '<div class="cn-rec-name">' + icon + ' ' + esc(meta.name || 'Дед') +
      (meta.strategy === 'rush' ? ' <span class="cn-tag">СПИДРАН</span>' : '') + '</div>' +
      '<div class="cn-rec-sub">' + (meta.result === 'victory' ? 'победа' : (meta.result === 'death' ? 'уснул' : 'обрыв')) +
      ' · день ' + dayTxt(meta.day) + ' · ' + (dur ? dur + ' мин реального времени' : '—') +
      ' · изгнано: ' + num(meta.banished, 0) + '</div>' +
      '</div>';
  }

  function renderList() {
    // рендерим ТОЛЬКО контейнер строк .cn-rows: шапка .cn-head с кнопкой
    // закрытия ✕ и подпись .cn-list-sub остаются живыми после любого рендера
    var box = dom.root.querySelector('.cn-rows');
    if (!box) return;
    var html = '';
    // bundled (из репозитория)
    WS.Replay.listBundled(function (bundled) {
      if (bundled && bundled.length) {
        html += '<div class="cn-list-title">📦 Записи из репозитория (рой агентов)</div>';
        for (var i = 0; i < bundled.length; i++) {
          html += recRow(bundled[i], 'bundled', 'b' + i, bundled[i].file);
        }
      }
      // локальные
      var loc = WS.Replay.listLocal();
      if (loc.length) {
        html += '<div class="cn-list-title">💾 Твои прогоны (этот браузер)</div>';
        for (var k = 0; k < loc.length; k++) {
          html += recRow(loc[k], 'local', loc[k].id);
        }
      }
      if (!html) {
        html = '<div class="cn-empty">Записей пока нет. Запусти «Демо-прохождение» или «Рой агентов» — их записи появятся здесь. Или скачай записи с репозиторием.</div>';
      }
      box.innerHTML = html;
      var rows = box.querySelectorAll('.cn-rec');
      for (var r = 0; r < rows.length; r++) {
        (function (el) {
          el.addEventListener('click', function () {
            playRec(el.getAttribute('data-src'), el.getAttribute('data-id'), el.getAttribute('data-file'));
          });
        })(rows[r]);
      }
    });
  }

  function playRec(src, id, file) {
    var start = function (rec) {
      if (!rec || !rec.ev) {
        try { WS.Ui.toast('Запись не читается', 'bad'); } catch (e) { /* пусто */ }
        return;
      }
      prep(rec);
      var m = rec.meta || {};
      buildGhostWorld(m.seed || 1917, m.prof);
      // ГЛАВНОЕ: спрятать меню. Кинозал — полупрозрачный оверлей (rgba
      // .82) над миром-призраком; непрозрачный тёмный фон меню (#070a10,
      // z-200) полностью съедал картинку — игрок видел чёрный экран
      // вместо игры бота. Меню вернёт restoreAfter() при закрытии.
      try { if (WS.Ui && WS.Ui.hideMenu) WS.Ui.hideMenu(); } catch (eM) { /* пусто */ }
      dom.root.classList.add('playing');     // снять тёмную вуаль (см. css)
      dom.root.querySelector('.cn-list').classList.add('hidden');
      dom.root.querySelector('.cn-player').classList.remove('hidden');
      dom.root.querySelector('.cn-end').classList.add('hidden');
      C.playing = true;
      try { WS.Snd.play('click'); } catch (e2) { /* пусто */ }
    };
    if (src === 'local') {
      start(WS.Replay.loadLocal(id));
    } else {
      WS.Replay.loadBundled(file, start);
    }
  }

  // ====================================================================
  //  ЭКРАН
  // ====================================================================

  function build() {
    if (dom.root) return;
    var r = document.createElement('div');
    r.id = 'ws-cinema';
    r.className = 'ws-panel ws-screen ws-cinema hidden';
    // ряд кнопок всех скоростей ×1..×2400: клик — прямая установка
    var speedsHtml = '';
    for (var s = 0; s < SPEEDS.length; s++) {
      speedsHtml += '<button class="ws-btn cn-btn cn-speed-btn" data-speed="' + s +
        '" title="Скорость ×' + SPEEDS[s] + '">×' + SPEEDS[s] + '</button>';
    }
    r.innerHTML =
      '<div class="cn-list">' +
      '  <div class="cn-head">🎬 КИНОЗАЛ ДЕДА <button class="ws-btn cn-close">✕</button></div>' +
      '  <div class="cn-list-sub">Записи прохождений роя агентов и твоих демо. Смотри на любой скорости — как дед шёл к тарелке.</div>' +
      '  <div class="cn-rows"></div>' +
      '</div>' +
      '<div class="cn-player hidden">' +
      '  <div class="cn-topbar">' +
      '    <span class="cn-name">🎬</span>' +
      '    <span class="cn-time">Д1 00:00</span>' +
      '    <span class="cn-hp">100 ХП</span>' +
      '    <span class="cn-en">0 🍄</span>' +
      '    <span class="cn-spacer"></span>' +
      '    <button class="ws-btn cn-btn" data-act="slower">−</button>' +
      '    <span class="cn-speed">×' + SPEEDS[DEF_SPEED_IX] + '</span>' +
      '    <button class="ws-btn cn-btn" data-act="faster">+</button>' +
      '    <button class="ws-btn cn-btn" data-act="pause">⏸</button>' +
      '    <button class="ws-btn cn-btn" data-act="restart">⟲</button>' +
      '    <button class="ws-btn cn-btn cn-close">✕ выйти</button>' +
      '  </div>' +
      '  <input type="range" class="cn-scrub" min="0" max="1000" value="0">' +
      '  <div class="cn-speeds">' + speedsHtml + '</div>' +
      '  <div class="cn-bubble hidden"></div>' +
      '  <div class="cn-feed"></div>' +
      '  <div class="cn-end hidden">' +
      '    <div class="cn-end-title"></div>' +
      '    <div class="cn-end-sub"></div>' +
      '    <button class="ws-btn cn-btn" data-act="restart">⟲ ещё раз</button>' +
      '    <button class="ws-btn cn-btn cn-close">к списку записей</button>' +
      '  </div>' +
      '</div>';
    (document.getElementById('ui-root') || document.body).appendChild(r);
    dom.root = r;

    // ✕ в шапке списка и «✕ выйти» в топбаре — закрывают весь кинозал;
    // «к списку записей» на экране финала — возврат к списку (не выход)
    var closers = r.querySelectorAll('.cn-list .cn-close, .cn-topbar .cn-close');
    for (var c = 0; c < closers.length; c++) closers[c].addEventListener('click', hide);
    var backBtn = r.querySelector('.cn-end .cn-close');
    if (backBtn) backBtn.addEventListener('click', backToList);
    var btns = r.querySelectorAll('.cn-btn');
    for (var b = 0; b < btns.length; b++) {
      (function (el) {
        el.addEventListener('click', function () {
          var act = el.getAttribute('data-act');
          if (act === 'slower') setSpeedIx(C.speedIx - 1);
          else if (act === 'faster') setSpeedIx(C.speedIx + 1);
          else if (act === 'pause') { C.playing = !C.playing; }
          else if (act === 'restart') restartTape();
          else {
            // кнопка конкретной скорости из ряда ×1..×2400
            var sp = el.getAttribute('data-speed');
            if (sp !== null && sp !== '') setSpeedIx(parseInt(sp, 10));
          }
        });
      })(btns[b]);
    }
    var scrub = r.querySelector('.cn-scrub');
    scrub.addEventListener('input', function () {
      if (!C.rec) return;
      var t = (parseFloat(scrub.value) / 1000) * C.totalMin;
      seekTo(t);
    });
    // клавиши кинозала
    window.addEventListener('keydown', function (e) {
      if (!C.open) return;
      if (e.code === 'Space') { e.preventDefault(); C.playing = !C.playing; }
      else if (e.code === 'ArrowRight') setSpeedIx(C.speedIx + 1);
      else if (e.code === 'ArrowLeft') setSpeedIx(C.speedIx - 1);
      else if (e.code === 'Escape') hide();
    }, false);

    // регистрируем в реестре Ui как модальный экран (как справка F1):
    // Ui.open/close управляют классами (.ws-modal) и стеком экранов,
    // состоянием владеем сами — open-колбэка нет, close — внутренний
    try {
      if (WS.Ui && WS.Ui.register) {
        WS.Ui.register('cinema', {
          root: dom.root,
          open: null,
          close: closeFromUi,
          isOpen: function () { return C.open; }
        });
      }
    } catch (eR) {
      WS.err('cinema: регистрация экрана не удалась:', eR && eR.message);
    }
  }

  function setSpeedIx(ix) {
    if (ix < 0) ix = 0;
    if (ix >= SPEEDS.length) ix = SPEEDS.length - 1;
    C.speedIx = ix;
  }

  /** Перемотка: пересчитать состояние плёнки на момент t. */
  function seekTo(t) {
    if (!C.rec) return;
    var wasEnded = C.ended;
    C.tlMin = Math.max(0, Math.min(C.totalMin, t));
    C.evI = 0; C.posI = 0;
    C.feed = [];
    C.bubbleTxt = ''; C.bubbleT = 0;
    C.ended = false;
    var endEl = dom.root.querySelector('.cn-end');
    if (endEl) endEl.classList.add('hidden');
    applyUpTo(C.tlMin);
    while (C.posI < C.posList.length - 1 && C.posList[C.posI + 1][0] <= C.tlMin) C.posI++;
    if (C.posList.length && C.posList[C.posI]) {
      C.ghost.x = C.posList[C.posI][2];
      C.ghost.y = C.posList[C.posI][3];
    }
    C.playing = true;
    if (wasEnded) C.playing = false;
  }

  var prevMenuState = null;

  function show() {
    if (C.open) return;                      // уже открыт — не переоткрываем
    build();
    // что было в игре до кинозала — запомним и погасим
    C.prevG = WS.G || null;
    prevMenuState = null;
    try {
      if (WS.Demo && WS.Demo.active && WS.Demo.active()) {
        WS.Demo.stop('кинозал');
      }
    } catch (e) { /* пусто */ }
    C.restored = false;
    // Экран зарегистрирован в Ui ещё в build(). Открываемся ЧЕРЕЗ реестр:
    // Ui.open снимет .hidden, повесит .ws-modal и положит «cinema» в стек
    // — симуляция и ввод живой партии гаснут (Ui.modal() === true).
    // ВАЖНО: на момент вызова C.open ещё false и root ещё скрыт, иначе
    // Ui.open выйдет по isOpen() ДО push в стек и без .ws-modal.
    var viaUi = false;
    if (WS.Ui && WS.Ui.open) {
      try { viaUi = WS.Ui.open('cinema'); } catch (e3) { viaUi = false; }
    }
    if (!viaUi) {
      // страховка без реестра: показываем руками, модальность — классом
      dom.root.classList.remove('hidden');
      dom.root.classList.add('ws-modal');
    }
    C.open = true;
    dom.root.querySelector('.cn-player').classList.add('hidden');
    dom.root.querySelector('.cn-list').classList.remove('hidden');
    renderList();
    try { WS.Snd.play('click'); } catch (e2) { /* пусто */ }
  }

  function hide() {
    if (!C.open) return;
    // просим реестр: Ui.close снимет .ws-modal и вынет из стека, а нашу
    // внутреннюю closeFromUi дёрнет сам как close-колбэк экрана
    if (WS.Ui && WS.Ui.close) {
      try { WS.Ui.close('cinema'); return; } catch (e) { /* ниже — вручную */ }
    }
    closeFromUi();
  }

  /** Внутренняя закрывалка для реестра Ui: гасит состояние кинозала и
   *  возвращает то, что было на экране до него. Классы .ws-modal/.hidden
   *  и стек снимает сам Ui.close (closeAll тоже проходит через неё). */
  function closeFromUi() {
    if (!C.open) return;
    C.open = false;
    C.playing = false;
    C.rec = null;
    if (dom.root) {
      dom.root.classList.add('hidden');
      dom.root.classList.remove('playing');   // снять режим плейера с корня
    }
    // вернуть меню/пустой мир
    restoreAfter();
  }

  /** «⟲ ещё раз» / ⟲ в топбаре: рестарт плёнки с начала.
   *  Экран финала (.cn-end) прячем — реплей не должен идти под оверлеем. */
  function restartTape() {
    if (!C.rec) return;
    var endEl = dom.root.querySelector('.cn-end');
    if (endEl) endEl.classList.add('hidden');
    prep(C.rec);
    C.playing = true;
  }

  /** «к списку записей» с экрана финала: показать список обратно,
   *  НЕ закрывая кинозал. */
  function backToList() {
    if (!C.open) return;
    C.playing = false;
    C.rec = null;
    dom.root.classList.remove('playing');   // вернуть тёмную вуаль списку
    var player = dom.root.querySelector('.cn-player');
    if (player) player.classList.add('hidden');
    var end = dom.root.querySelector('.cn-end');
    if (end) end.classList.add('hidden');
    var list = dom.root.querySelector('.cn-list');
    if (list) list.classList.remove('hidden');
    renderList();
    try { WS.Snd.play('click'); } catch (e) { /* пусто */ }
  }

  /** Восстановить то, что было на экране до кинозала. */
  function restoreAfter() {
    if (C.restored) return;
    C.restored = true;
    var wasGame = !!(C.prevG && C.prevG.running !== undefined && WS.Save && WS.Save.exists && WS.Save.exists('main'));
    // если шла живая партия — грузим сейв; иначе показываем меню
    if (wasGame) {
      try { WS.Main.loadGame(); } catch (e) {
        try { WS.Ui.showMenu(); } catch (e2) { /* пусто */ }
      }
    } else {
      try {
        WS.World.reset();
        WS.G = null;
      } catch (e3) { /* пусто */ }
      try { WS.Ui.showMenu(); } catch (e4) { /* пусто */ }
    }
  }

  WS.boot(function initCinema() {
    // рендер-тик [70..80): работает и на паузе, и в меню
    WS.tick(76, cinemaFrame, 'cinema:frame');
    // клавиша V — открыть кинозал (только вне модалок)
    window.addEventListener('keydown', function (e) {
      if (e.code !== 'KeyV' || C.open) return;
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      try {
        if (WS.Ui && WS.Ui.modal && WS.Ui.modal()) return;
      } catch (er) { /* пусто */ }
      show();
    }, false);
    WS.log('[Cinema] кинозал заряжен: плёнка, попкорн, дед-призрак');
  }, 'cinema:init');

  WS.def('Cinema', {
    show: show,
    hide: hide,
    isOpen: function () { return C.open; },
    _state: function () { return C; }
  });
})();
