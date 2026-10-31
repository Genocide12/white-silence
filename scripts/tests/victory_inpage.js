/**
 * victory_inpage.js — ТЕСТЫ РАННЕЙ ПОБЕДЫ (Грибной Зов) И ФИНАЛА (T-2).
 * Цепочка: 3 факела → [E] Магический Огонь → 3× [E] Грибной Зов (пыль+энергия)
 * → plate_called → +121 игровая минута → story_victory → экран победы →
 * экспедиция за звёздами. Плюс: концовки (determineEnding/ENDINGS), смерть
 * в crazy-режиме (прикорнутье vs настоящий финал), final_started на 55-й день.
 * Протокол: window.__T = {pass, fail, fails, bugs, done} (см. run_tests.mjs).
 */
(function () {
  'use strict';
  var T = window.__T = { pass: 0, fail: 0, fails: [], bugs: [], done: false };
  function ok(name, cond, data) {
    if (cond) { T.pass++; console.log('  ok   ' + name); }
    else { T.fail++; T.fails.push(name); console.log('  FAIL ' + name + (data ? ' ' + JSON.stringify(data) : '')); }
  }
  function bug(d) { T.bugs.push(String(d)); console.log('  🐞 ' + d); }
  var finDone = false;
  function fin() { if (!finDone) { finDone = true; T.done = true; } }

  // ====================================================================
  //  ИНСТРУМЕНТЫ
  // ====================================================================

  var SEED = 4242;
  var toasts = [];        // перехват тостов (наблюдение, поведение не меняем)
  var toastHooked = false;

  function hookToast() {
    if (toastHooked || !WS.Ui || !WS.Ui.toast) return;
    var orig = WS.Ui.toast;
    WS.Ui.toast = function (text, kind) {
      toasts.push({ text: String(text), kind: kind || 'info' });
      try { return orig.call(WS.Ui, text, kind); } catch (e) { /* пусто */ }
    };
    toastHooked = true;
  }
  function clearToasts() { toasts.length = 0; }
  function toastSeen(part) {
    for (var i = 0; i < toasts.length; i++) {
      if (toasts[i].text.indexOf(part) >= 0) return toasts[i];
    }
    return null;
  }

  function flags() { return (WS.G && WS.G.story && WS.G.story.flags) || {}; }
  function el(id) { return document.getElementById(id); }
  function finaleEl() { return el('ws-finale'); }
  function confirmEl() { return el('ws-confirm'); }
  function hintTxt() { var h = el('ws-hint'); return h ? String(h.textContent || '') : ''; }

  /** Заголовок финального экрана строится из span'ов, пробел — &nbsp; (\u00A0). */
  function normTitle(s) { return String(s || '').replace(/\u00A0/g, ' '); }

  /** Новая партия между суб-тестами: закрыть экраны, снять флаги смерти.
   *  После фикса регистрации финал сидит в стеке Ui — closeAll() сам его
   *  закрывает; точечный close('finale') оставлен как страховка. */
  function newRun() {
    try {
      if (WS.Ui && WS.Ui.closeAll) WS.Ui.closeAll();
      if (WS.Ui && WS.Ui.close) WS.Ui.close('finale');
    } catch (e) { /* пусто */ }
    WS.dead = false;
    clearToasts();
    return WS.Main.newGame('telegraph', ['frostproof', 'patient'], SEED);
  }

  /** Выставить день/час без событий (чистые данные для determineEnding). */
  function setDay(d) {
    WS.G.time.day = d;
    WS.G.time.min = 8 * 60;
    WS.G.time.hourFired = 8;
  }

  /** Синтетическая клавиша [E]: keydown → 150 мс → keyup → 180 мс → cb.
   *  Input слушает window (input.js:122), pressed живёт до конца кадра. */
  function pressE(cb) {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', key: 'e', bubbles: true, cancelable: true }));
    setTimeout(function () {
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE', key: 'e', bubbles: true, cancelable: true }));
      setTimeout(cb, 180);
    }, 150);
  }

  /** Поллинг до истины (или таймаута). */
  function waitFor(pred, timeoutMs, cb) {
    var t0 = Date.now();
    (function poll() {
      var v = false;
      try { v = pred(); } catch (e) { v = false; }
      if (v) return cb(v);
      if (Date.now() - t0 > timeoutMs) return cb(false);
      setTimeout(poll, 120);
    })();
  }

  /** Встать у мостков так, чтобы сюжетный тик показал подсказку [E].
   *  Перебираем смещения (вокруг пристани нет чужого интерактива). */
  function standAtPier(cb) {
    var p = WS.Story.pier();
    if (!p) return cb(false);
    var offs = [[0.8, 0], [0, 0.8], [-0.8, 0], [0, -0.8], [0.5, 0.5], [-0.5, -0.5], [1.2, 0], [0, 0]];
    var i = 0;
    (function tryOff() {
      if (i >= offs.length) return cb(false);
      var pl = WS.G.player;
      pl.x = p.x + offs[i][0];
      pl.y = p.y + offs[i][1];
      WS.Cam.cx = p.x; WS.Cam.cy = p.y;
      setTimeout(function () {
        var h = hintTxt();
        if (h.indexOf('Магический Огонь') >= 0 || h.indexOf('Грибной Зов') >= 0) return cb(true);
        i++;
        tryOff();
      }, 280);
    })();
  }

  // счётчики сюжетных событий
  var evc = { signalLit: 0, call: 0, plate: 0, victory: 0, goToPier: 0 };

  // ====================================================================
  //  ПОСЛЕДОВАТЕЛЬНЫЙ РАНЕР ШАГОВ (каждый шаг асинхронный)
  // ====================================================================

  var steps = [];
  function step(fn) { steps.push(fn); }
  function seq() {
    if (!steps.length) { fin(); return; }
    var fn = steps.shift();
    var timer = setTimeout(function () {
      bug('шаг завис (таймаут 30 с) — пропускаю');
      seq();
    }, 30000);
    try {
      fn(function () {
        clearTimeout(timer);
        seq();
      });
    } catch (e) {
      clearTimeout(timer);
      bug('исключение в шаге: ' + (e && e.message));
      seq();
    }
  }

  // ====================================================================
  //  ШАГИ ТЕСТА
  // ====================================================================

  // ---- A: форма finalQuest() и мостки ----
  step(function (next) {
    window.confirm = function () { return true; };
    hookToast();
    ok('A1 модули на месте (Story/Endings/Expeditions/Crazy/Ui/Main/Inv)',
       !!(WS.Story && WS.Endings && WS.Expeditions && WS.Crazy && WS.Ui && WS.Main && WS.Inv));
    var r = newRun();
    ok('A2 newGame запускается (забег 1, сид 4242)', r === true);
    setTimeout(function () {
      var q = WS.Story.finalQuest();
      var need = ['started', 'lit', 'torches', 'need', 'calls', 'callNeed', 'callCost', 'dust', 'plateCalled'];
      var allFields = true;
      for (var i = 0; i < need.length; i++) { if (!(need[i] in q)) { allFields = false; break; } }
      ok('A3 finalQuest(): все 9 полей присутствуют', allFields, q);
      ok('A4 finalQuest(): need = 3 (факела на Магический Огонь)', q.need === 3, q.need);
      ok('A5 finalQuest(): callNeed = 3 (без перка «Звёздный Зов»)', q.callNeed === 3, q.callNeed);
      ok('A6 finalQuest(): callCost = 30 (грибной энергии)', q.callCost === 30, q.callCost);
      ok('A7 finalQuest(): dust/torches = Inv.count()', q.dust === WS.Inv.count('stardust') && q.torches === WS.Inv.count('torch'));
      ok('A8 старт чистый: started/lit/calls/plateCalled = false',
         q.started === false && q.lit === false && q.calls === 0 && q.plateCalled === false, q);
      var p = WS.Story.pier();
      ok('A9 pier() отдаёт координаты мостков в границах мира',
         !!p && typeof p.x === 'number' && p.x > 0 && p.y > 0 && p.x < WS.World.w && p.y < WS.World.h, p);
      ok('A10 в 1-й день final_started не стоит, день = 1', !flags().final_started && WS.Time.day() === 1);
      // счётчики событий вешаем после первого newGame (мир готов)
      try {
        WS.Ev.on('story:signal_lit', function () { evc.signalLit++; });
        WS.Ev.on('story:call', function () { evc.call++; });
        WS.Ev.on('story:plate_called', function () { evc.plate++; });
        WS.Ev.on('game:victory', function () { evc.victory++; });
        WS.Ev.on('story:go_to_pier', function () { evc.goToPier++; });
      } catch (e) { bug('не удалось повесить счётчики событий: ' + e.message); }
      next();
    }, 900);
  });

  // ---- B: розжиг без факелов — отказ ----
  step(function (next) {
    var t0 = WS.Inv.count('torch');
    if (t0 > 0) WS.Inv.consume('torch', t0);   // страховка: у профа может быть факел
    standAtPier(function (pos) {
      ok('B1 у мостков появляется подсказка [E] (розжиг)', pos === true, { hint: hintTxt() });
      pressE(function () {
        var q = WS.Story.finalQuest();
        ok('B2 без факелов огонь не зажжён (signal_lit нет, lit=false)',
           !flags().signal_lit && q.lit === false);
        ok('B3 без факелов — тост-предупреждение про 3 факела',
           !!toastSeen('нужно 3 факела'), toasts.slice(-2));
        next();
      });
    });
  });

  // ---- C: розжиг Магического Огня через [E] ----
  step(function (next) {
    clearToasts();
    var gave = WS.Inv.give('torch', 5);
    ok('C1 факела выданы (5 шт.)', gave === 5 && WS.Inv.count('torch') === 5, { gave: gave });
    pressE(function () {
      var q = WS.Story.finalQuest();
      ok('C2 [E] с факелами: флаг signal_lit = 1', flags().signal_lit === 1);
      ok('C3 finalQuest().lit = true', q.lit === true);
      ok('C4 факела списаны: 5 → 2 (сгорело 3)', q.torches === 2, q.torches);
      ok('C5 тост «Магический Огонь взвился»', !!toastSeen('взвился'));
      var b = WS.Story._state().beacon;
      var o = null;
      try { var pp = WS.Story.pier(); o = WS.World.objAt(Math.floor(pp.x), Math.floor(pp.y)); } catch (e) { o = null; }
      ok('C6 объект-костёр (beacon) стоит в мире на мостках',
         !!(b && b.beacon) || !!(o && o.beacon), { st: !!b, obj: !!(o && o.beacon) });
      ok('C7 событие story:signal_lit выстрелило (1 раз)', evc.signalLit === 1, evc);
      ok('C8 подсказка сменилась на «Грибной Зов»', hintTxt().indexOf('Грибной Зов') >= 0, hintTxt());
      next();
    });
  });

  // ---- D1: зов без пыли — отказ ----
  step(function (next) {
    clearToasts();
    var d0 = WS.Inv.count('stardust');
    if (d0 > 0) WS.Inv.consume('stardust', d0);
    WS.Crazy.state().energy = 200;
    pressE(function () {
      var q = WS.Story.finalQuest();
      ok('D1 зов без пыли: calls_done не растёт', q.calls === 0 && !flags().calls_done);
      ok('D2 зов без пыли: тост-предупреждение про Звёздную Пыль', !!toastSeen('Звёздная Пыль'));
      ok('D3 зов без пыли: энергия не тратится', Math.abs(WS.Crazy.state().energy - 200) < 0.01);
      next();
    });
  });

  // ---- D2: зов без энергии — отказ ----
  step(function (next) {
    clearToasts();
    WS.Inv.give('stardust', 5);
    WS.Crazy.state().energy = 10;      // меньше callCost=30
    pressE(function () {
      var q = WS.Story.finalQuest();
      ok('D4 зов без энергии: calls_done не растёт', q.calls === 0);
      ok('D5 зов без энергии: тост-предупреждение про энергию', !!toastSeen('энергии мало'));
      ok('D6 зов без энергии: пыль не тратится (5 шт. на месте)', WS.Inv.count('stardust') === 5);
      next();
    });
  });

  // ---- E: три Грибных Зова ----
  step(function (next) {
    clearToasts();
    WS.Crazy.state().energy = 200;
    pressE(function () {
      var q1 = WS.Story.finalQuest();
      ok('E1 зов 1: calls_done = 1', q1.calls === 1, q1);
      ok('E2 зов 1: энергия −30 (200 → 170)', Math.abs(WS.Crazy.state().energy - 170) < 0.01, WS.Crazy.state().energy);
      ok('E3 зов 1: пыль −1 (5 → 4)', WS.Inv.count('stardust') === 4);
      pressE(function () {
        var q2 = WS.Story.finalQuest();
        ok('E4 зов 2: calls_done = 2', q2.calls === 2, q2);
        ok('E5 зов 2: энергия 170 → 140', Math.abs(WS.Crazy.state().energy - 140) < 0.01);
        ok('E6 зов 2: пыль 4 → 3', WS.Inv.count('stardust') === 3);
        ok('E7 тост «ЗОВ 2/3»', !!toastSeen('ЗОВ 2/3'));
        pressE(function () {
          var q3 = WS.Story.finalQuest();
          ok('E8 зов 3: calls_done = 3 (предел callNeed)', q3.calls === 3, q3);
          ok('E9 после 3-го зова: plate_called = 1', flags().plate_called === 1 && q3.plateCalled === true);
          var st = WS.Story._state();
          var expect = WS.G.time.totalMin + 120;
          ok('E10 прилёт тарелки запланирован на totalMin + 120',
             !!st.plateAt && Math.abs(st.plateAt - expect) <= 3, { plateAt: st.plateAt, expect: expect });
          ok('E11 тост «ТАРЕЛКА УСЛЫШАЛА ДЕДА»', !!toastSeen('ТАРЕЛКА УСЛЫШАЛА'));
          ok('E12 событие story:call выстрелило 3 раза', evc.call === 3, evc);
          ok('E13 событие story:plate_called выстрелило', evc.plate === 1, evc);
          ok('E14 story_victory до перемотки не стоит', !flags().story_victory);
          ok('E15 пыль суммарно: 5 → 2 (по 1 за зов)', WS.Inv.count('stardust') === 2);
          ok('E16 энергия суммарно: 200 → 110 (по 30 за зов)', Math.abs(WS.Crazy.state().energy - 110) < 0.01);
          next();
        });
      });
    });
  });

  // ---- F: перемотка времени → РАННЯЯ ПОБЕДА ----
  step(function (next) {
    ok('F1 день всё ещё ранний (< 55, победа досрочная)', WS.Time.day() < 55, WS.Time.day());
    var v0 = evc.victory;
    WS.G.time.totalMin += 121;   // прилёт стоит на plateAt = totalMin + 120
    waitFor(function () { return !!flags().story_victory; }, 4000, function (v) {
      ok('F2 после +121 игровой минуты: story_victory = 1', v === true);
      ok('F3 событие game:victory выстрелило', evc.victory === v0 + 1, evc);
      ok('F4 G.running = false (симуляция остановлена)', WS.G.running === false);
      ok('F5 при победе G.dead не ставится', !WS.G.dead);
      var scr = finaleEl();
      ok('F6 финальный экран в DOM (#ws-finale)', !!scr);
      ok('F7 экран открыт (без .hidden)', !!(scr && !scr.classList.contains('hidden')));
      ok('F8 режим победы: класс .victory, без .death',
         !!(scr && scr.classList.contains('victory') && !scr.classList.contains('death')));
      var title = scr ? normTitle((scr.querySelector('.fin-title') || {}).textContent) : '';
      ok('F9 заголовок «ПАРОХОД ПРИШЁЛ»', title === 'ПАРОХОД ПРИШЁЛ', title);
      ok('F10 кнопка «Отправить экспедицию» на экране (.fin-exped)',
         !!(scr && scr.querySelector('.fin-exped')));
      // ФИКС регистрации: классы гаммы переключаются через classList,
      // .hidden снимает сам Ui.open('finale') — экран в стеке и модален
      ok('F11 финальный экран модален: Ui.modal() = true при открытом экране победы',
         WS.Ui.modal() === true);
      var inStack = false;
      try { inStack = WS.Ui.opened().indexOf('finale') >= 0; } catch (e) { inStack = false; }
      ok('F11b «finale» в стеке экранов Ui (open() отработал, а не вышел по isOpen)',
         inStack === true);
      // ФИКС имён флагов: story.js ставит signal_lit, endings.js читает его
      var e1 = WS.Endings.determine();
      ok('F12 determineEnding при signal_lit+plate_called+день 1 → ship_early (ранняя победа)',
         e1 === WS.Endings.ENDINGS.ship_early, e1 && e1.title);
      var cf = confirmEl();
      var cfOpen = !!(cf && !cf.classList.contains('hidden'));
      var cfTxt = cf ? String((cf.querySelector('.c-text') || {}).textContent || '') : '';
      ok('F13 окно концовки открыто с текстом ship_early («ТАРЕЛКА ПРИЛЕТЕЛА РАНЬШЕ СРОКА»)',
         cfOpen && cfTxt.indexOf('ТАРЕЛКА ПРИЛЕТЕЛА РАНЬШЕ СРОКА') === 0,
         { cfOpen: cfOpen, head: cfTxt.slice(0, 44) });
      next();
    });
  });

  // ---- G: экспедиция с финального экрана + звёзды за ранний день ----
  step(function (next) {
    var s0 = WS.Expeditions.stars();
    var runs0 = WS.Expeditions.runs().length;
    var bEx = finaleEl().querySelector('.fin-exped');
    bEx.click();
    setTimeout(function () {
      var s1 = WS.Expeditions.stars();
      var runs = WS.Expeditions.runs();
      var last = runs[runs.length - 1];
      ok('G1 клик по «Отправить экспедицию» начисляет звёзды', s1 > s0, { s0: s0, s1: s1 });
      ok('G2 кнопка задизейблена и показывает «+N звёзд!»',
         bEx.disabled === true && bEx.textContent.indexOf('звёзд') >= 0, bEx.textContent);
      ok('G3 забег записан: result=victory, day=1, ritual=3',
         runs.length === runs0 + 1 && last.result === 'victory' && last.day === 1 && last.ritual === 3, last);
      var early1 = WS.Expeditions.starsFor({ result: 'victory', day: 1, banished: 0, treeLv: 0 });
      var late60 = WS.Expeditions.starsFor({ result: 'victory', day: 60, banished: 0, treeLv: 0 });
      ok('G4 спидран-бонус: звёзд за победу в день 1 больше, чем в день 60',
         early1 > late60 && late60 >= 1, { early1: early1, late60: late60 });
      next();
    }, 250);
  });

  // ---- H: матрица флагов determineEnding + ENDINGS.ship_early ----
  step(function (next) {
    var E = WS.Endings.ENDINGS;
    ok('H1 ENDINGS.ship_early существует', !!E.ship_early);
    ok('H2 титул ship_early содержит «РАНЬШЕ СРОКА»',
       !!E.ship_early && /РАНЬШЕ СРОКА/.test(E.ship_early.title || ''), E.ship_early && E.ship_early.title);
    ok('H3 ship_early: kind = victory', !!E.ship_early && E.ship_early.kind === 'victory');
    ok('H4 ship_early: текст и эпиграф непустые',
       !!E.ship_early && (E.ship_early.text || '').length > 100 && (E.ship_early.epigraph || '').length > 5);
    // флаги живой партии: story.js сам ставит signal_lit (lightBeacon)
    // и plate_called (schedulePlateArrival) — ручная простановка не нужна
    ok('H5 signal_lit + plate_called + день<55 → ship_early (флаги из живой партии)',
       WS.Endings.determine() === E.ship_early);
    setDay(56);
    ok('H6 день 56 с signal_lit → обычный ship (не ранний)',
       WS.Endings.determine() === E.ship);
    delete flags().signal_lit;
    delete flags().plate_called;
    setDay(60);
    ok('H7 без огня на 60-й день → wintering («ПРОСПАЛ ТАРЕЛКУ»)',
       WS.Endings.determine() === E.wintering);
    setDay(30);
    ok('H7b день 30 без флагов → безопасный дефолт wintering (не null)',
       WS.Endings.determine() === E.wintering);
    ok('H8 determine(\'aurora\') → концовка aurora', WS.Endings.determine('aurora') === E.aurora);
    next();
  });

  // ---- I: день 60 — розжиг = немедленная победа по расписанию ----
  step(function (next) {
    newRun();
    setTimeout(function () {
      ok('I1 забег 2 запущен (день 60)', WS.G.running === true);
      setDay(60);
      WS.Inv.give('torch', 5);
      standAtPier(function (pos) {
        ok('I2 дед встал у мостков на 60-й день', pos === true);
        pressE(function () {
          ok('I3 на 60-й день розжиг даёт немедленную story_victory',
             flags().story_victory === 1);
          ok('I4 signal_lit тоже поставлен', flags().signal_lit === 1);
          var scr = finaleEl();
          ok('I5 финальный экран открыт в режиме победы',
             !!(scr && !scr.classList.contains('hidden') && scr.classList.contains('victory')));
          ok('I6 final_started для этого не нужен (не стоит)', !flags().final_started);
          var e = WS.Endings.determine();
          ok('I7 день 60: determineEnding → ship («ТАРЕЛКА ПРИЛЕТЕЛА», не wintering)',
             e === WS.Endings.ENDINGS.ship, e && e.title);
          var cf = confirmEl();
          var cfOpen = !!(cf && !cf.classList.contains('hidden'));
          var cfTxt = cf ? String((cf.querySelector('.c-text') || {}).textContent || '') : '';
          ok('I8 окно концовки на победе 60-го дня: текст ship, не «ПРОСПАЛ ТАРЕЛКУ»',
             cfOpen && cfTxt.indexOf('ТАРЕЛКА ПРИЛЕТЕЛА') === 0 && cfTxt.indexOf('ПРОСПАЛ') < 0,
             { cfOpen: cfOpen, head: cfTxt.slice(0, 40) });
          ok('I9 G.deathEpitaph = ship на победе 60-го дня', WS.G.deathEpitaph === WS.Endings.ENDINGS.ship);
          next();
        });
      });
    }, 700);
  });

  // ---- K: день 56 — огонь + 3 зова → победа, обычный ship ----
  step(function (next) {
    newRun();
    setTimeout(function () {
      ok('K1 забег 3 запущен (день 56)', WS.G.running === true);
      setDay(56);
      WS.Inv.give('torch', 5);
      standAtPier(function (pos) {
        ok('K2 дед встал у мостков на 56-й день', pos === true);
        pressE(function () {
          ok('K3 розжиг на 56-й день: signal_lit = 1, победы ещё нет',
             flags().signal_lit === 1 && !flags().story_victory);
          WS.Inv.give('stardust', 5);
          WS.Crazy.state().energy = 300;
          pressE(function () {
            pressE(function () {
              pressE(function () {
                ok('K4 три зова на 56-й день: calls_done = 3', WS.Story.finalQuest().calls === 3);
                ok('K5 plate_called = 1 (тарелка вызвана)', flags().plate_called === 1);
                WS.G.time.totalMin += 121;
                waitFor(function () { return !!flags().story_victory; }, 4000, function (v) {
                  ok('K6 победа по расписанию на 56-й день (огонь + зов)', v === true && WS.Time.day() === 56);
                  var e = WS.Endings.determine();
                  ok('K7 день 56 с signal_lit (из партии) → ship (обычный «ТАРЕЛКА ПРИЛЕТЕЛА»)',
                     e === WS.Endings.ENDINGS.ship, e && e.title);
                  var cf = confirmEl();
                  var cfOpen = !!(cf && !cf.classList.contains('hidden'));
                  var cfTxt = cf ? String((cf.querySelector('.c-text') || {}).textContent || '') : '';
                  ok('K8 окно концовки: текст ship «ТАРЕЛКА ПРИЛЕТЕЛА», не «ПРОСПАЛ ТАРЕЛКУ»',
                     cfOpen && cfTxt.indexOf('ТАРЕЛКА ПРИЛЕТЕЛА') === 0 && cfTxt.indexOf('ПРОСПАЛ') < 0,
                     cfTxt.slice(0, 40));
                  next();
                });
              });
            });
          });
        });
      });
    }, 700);
  });

  // ---- L: финальный квест стартует естественно (день 54 → 55) ----
  step(function (next) {
    newRun();
    setTimeout(function () {
      ok('L1 забег 4 запущен', WS.G.running === true);
      // вечер 54-го дня, одна минута до полуночи — дальше время само
      WS.G.time.day = 54;
      WS.G.time.min = 1439;
      WS.G.time.hourFired = 23;
      waitFor(function () { return !!flags().final_started; }, 6000, function (v) {
        ok('L2 естественная смена дня 54→55: final_started = 1', v === true);
        ok('L3 finalQuest().started = true', WS.Story.finalQuest().started === true);
        ok('L4 тост «гул за рекой» (зов тарелки)', !!toastSeen('гул за рекой'));
        ok('L5 событие story:go_to_pier с координатами мостков', evc.goToPier === 1, evc);
        ok('L6 день стал 55 (FINAL_DAY)', WS.Time.day() === 55, WS.Time.day());
        ok('L7 pier() жив после старта финала', !!WS.Story.pier());
        next();
      });
    }, 700);
  });

  // ---- M: смерть в crazy-режиме: прикорнутье vs настоящий финал ----
  step(function (next) {
    newRun();
    setTimeout(function () {
      ok('M1 забег 5 запущен', WS.G.running === true);
      var cz = WS.Crazy.state();
      var r0 = cz.respawns;
      var r = WS.Main.die('тест');
      ok('M2 die(\'тест\') в crazy-режиме → true (дед прикорнул)', r === true, r);
      ok('M3 respawns вырос (+1)', cz.respawns === r0 + 1, { before: r0, after: cz.respawns });
      var scr = finaleEl();
      ok('M4 экран смерти НЕ открыт (прикорнутье — не финал)', !scr || scr.classList.contains('hidden'));
      ok('M5 G.dead не ставился, партия жива', !WS.G.dead && WS.G.running === true);
      ok('M6 ХП восстановлен до респаун-доли (~50 из 100)',
         WS.G.player.hp >= 45 && WS.G.player.hp <= 55, WS.G.player.hp);
      ok('M7 тост «прикорнул и проснулся»', !!toastSeen('прикорнул и проснулся'));
      // настоящий финал: 60 дней прошло (флаг _crazyFinal)
      WS.G._crazyFinal = true;
      WS.Main.die('тест-финал: шестьдесят дней прошло');
      setTimeout(function () {
        var scr2 = finaleEl();
        ok('M8 настоящий финал (_crazyFinal): экран смерти открыт (.death)',
           !!(scr2 && !scr2.classList.contains('hidden') && scr2.classList.contains('death')));
        ok('M9 G.dead = true и WS.dead = true (симуляция стоит)',
           WS.G.dead === true && WS.dead === true);
        var t = scr2 ? normTitle((scr2.querySelector('.fin-title') || {}).textContent) : '';
        ok('M10 заголовок «ВОТ ТАК ВЫ ПОГИБЛИ»', t === 'ВОТ ТАК ВЫ ПОГИБЛИ', t);
        var c = scr2 ? (scr2.querySelector('.fin-cause') || {}).textContent : '';
        ok('M11 причина смерти на экране («Тест-финал…»)', c.indexOf('Тест-финал') === 0, c);
        ok('M12 экран НЕ в режиме победы', !(scr2 && scr2.classList.contains('victory')));
        next();
      }, 300);
    }, 700);
  });

  // ---- запуск ----
  try {
    seq();
  } catch (e) {
    bug('фатально: ' + (e && e.message));
    fin();
  }
})();
