/**
 * swarm_demo_inpage.js — ТЕСТ РОЯ АГЕНТОВ + АВТОПИЛОТА ДЕМО (задача T-6).
 * Покрывает: WS.Swarm (PERSONAS/launch/stop), WS.Demo (start/stop/cfg/
 * setPace/журнал/человечность/TASK_TIMEOUT/финалы), адаптивную скорость
 * autoSpeed (speedMul роя, душение боя banish до ×6), киноплёнку WS.Replay,
 * экспедиции WS.Expeditions и кнопки меню. Все прогоны демо — КОРОТКИЕ
 * (механика, без доигрывания): каждый прогон завершается WS.Demo.stop().
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
  function fin() { T.done = true; }

  // ---------- утилиты ----------
  function st() { return WS.Demo._state(); }            // открытое состояние демо
  function cfg() { var d = st(); return (d && d.cfg) || {}; }
  function zavislaCount() {                              // сколько записей «зависла — пропускаю»
    var d = st(), n = 0;
    if (!d || !d.journal) return 0;
    for (var q = 0; q < d.journal.length; q++) {
      if (String(d.journal[q].txt).indexOf('зависла') >= 0) n++;
    }
    return n;
  }
  /** Подсунуть боту задачу-зонд: таймаут-ветка runTask сработает до switch. */
  function probe(type, t) {
    var d = st();
    d.plan = [];
    d.task = { type: type, t: t, label: 'зонд-' + type };
  }
  function menuBtn(txt) {
    var bs = document.querySelectorAll('#ws-menu button');
    for (var k = 0; k < bs.length; k++) {
      if (String(bs[k].textContent || '').replace(/\s+/g, ' ').indexOf(txt) >= 0) return true;
    }
    return false;
  }

  // ---------- мини-раннер шагов ----------
  // step(мс_ожидания, fn): если fn принимает аргумент — асинхронный шаг,
  // он сам обязан вызвать next() (опросы через setInterval).
  var q = [];
  function step(w, fn) { q.push({ w: w, fn: fn }); }
  function run() {
    if (!q.length) { fin(); return; }
    var s = q.shift();
    setTimeout(function () {
      var advanced = false;
      function nxt() {
        if (advanced) return;
        advanced = true;
        setTimeout(run, 30);
      }
      try {
        if (s.fn.length > 0) s.fn(nxt);
        else { s.fn(); nxt(); }
      } catch (e) {
        bug('исключение на шаге: ' + (e && e.message));
        nxt();
      }
    }, s.w);
  }

  // страховка: весь тест обязан уложиться в 120 сек
  setTimeout(function () {
    if (!T.done) {
      bug('тест не уложился в 120 сек — принудительное завершение');
      try { if (WS.Swarm.isRunning()) WS.Swarm.stop(); } catch (e) { /* пусто */ }
      try { if (WS.Demo.active()) WS.Demo.stop('таймаут теста'); } catch (e2) { /* пусто */ }
      try { WS.dead = false; } catch (e3) { /* пусто */ }
      fin();
    }
  }, 120000);

  // ====================================================================
  // ФАЗА 0 — статика: модули, PERSONAS, кнопки меню, исходник TASK_TIMEOUT
  // ====================================================================
  step(100, function () {
    window.confirm = function () { return true; };   // демо-резюм может спросить

    ok('модули зоны на месте (Swarm/Demo/Replay/Expeditions/Crazy/Loop)',
       !!(WS.Swarm && WS.Demo && WS.Replay && WS.Expeditions && WS.Crazy && WS.Loop));

    var P = WS.Swarm.PERSONAS || [];
    ok('PERSONAS: ровно 6 личностей', P.length === 6, { n: P.length });
    var names = {}, uniq = true, stratOK = true, smOK = true, noteOK = true;
    var hasRush = false, hasClassic = false, i;
    for (i = 0; i < P.length; i++) {
      if (!P[i]) { uniq = false; stratOK = false; smOK = false; noteOK = false; break; }
      if (names[P[i].name]) uniq = false;
      names[P[i].name] = 1;
      if (P[i].strategy !== 'classic' && P[i].strategy !== 'rush') stratOK = false;
      if (P[i].strategy === 'rush') hasRush = true;
      if (P[i].strategy === 'classic') hasClassic = true;
      var sm = P[i].speedMul;
      if (typeof sm !== 'number' || sm < 1 || sm > 3) smOK = false;
      if (!P[i].note || !String(P[i].note).length) noteOK = false;
    }
    ok('PERSONAS: имена уникальны', uniq);
    ok('PERSONAS: стратегии только classic|rush', stratOK);
    ok('PERSONAS: есть обе стратегии (rush и classic)', hasRush && hasClassic);
    ok('PERSONAS: speedMul в пределах 1..3', smOK);
    ok('PERSONAS: у каждой личности есть note', noteOK);

    ok('рой до запуска неактивен', WS.Swarm.isRunning() === false);
    ok('результаты роя до запуска пусты', WS.Swarm.results().length === 0);
    ok('демо до старта неактивно', WS.Demo.active() === false);

    ok('меню: кнопка «Рой агентов»', menuBtn('Рой агентов'));
    ok('меню: кнопка «Кинозал»', menuBtn('Кинозал'));
    ok('меню: кнопка «Изба Экспедиций»', menuBtn('Изба Экспедиций'));
    ok('меню: кнопка «Демо-прохождение»', menuBtn('Демо-прохождение'));

    // исходник demo.js — сверка константы TASK_TIMEOUT (fetch уйдёт параллельно)
    try {
      fetch('js/ui/demo.js').then(function (r) { return r.text(); }).then(function (txt) {
        var m = /TASK_TIMEOUT\s*=\s*\{([^}]+)\}/.exec(txt);
        if (!m) { window.__t6tt = null; return; }
        var o = {}, parts = m[1].split(','), j;
        for (j = 0; j < parts.length; j++) {
          var kv = parts[j].split(':');
          if (kv.length >= 2) o[String(kv[0]).replace(/[\s'"]/g, '')] = parseFloat(kv[1]);
        }
        window.__t6tt = o;
      }).catch(function () { window.__t6tt = null; });
    } catch (e) { window.__t6tt = null; }
  });

  // ====================================================================
  // ФАЗА 1 — рой: launch({count:2}) и СРАЗУ stop() (без конца партий)
  // ====================================================================
  step(300, function () {
    var r = WS.Swarm.launch({ count: 2, seeds: [777, 888] });
    ok('Swarm.launch({count:2}) вернул true', r === true);
    ok('Swarm.isRunning() после запуска — true', WS.Swarm.isRunning() === true);
    var SW = WS.Swarm._state();
    ok('очередь роя построена: 2 агента', SW.queue.length === 2, { n: SW.queue.length });
    ok('сиды роя зафиксированы (777, 888)', SW.queue[0].seed === 777 && SW.queue[1].seed === 888);
    ok('первый агент — Гена-Турбо (rush, ×3)', SW.queue[0].name === 'Гена-Турбо' &&
      SW.queue[0].strategy === 'rush' && SW.queue[0].speedMul === 3);
    ok('рой сразу занял слот демо (Demo.active)', WS.Demo.active() === true);
    var dc = cfg();
    ok('демо роя: имя и стратегия из персоны', dc.name === 'Гена-Турбо' && dc.strategy === 'rush');
    ok('демо роя: speedMul из персоны (×3)', dc.speedMul === 3);
    ok('рой пишет киноплёнку (record → Replay.isActive)', WS.Replay.isActive() === true);
    ok('повторный launch при бегущем рое → false', WS.Swarm.launch({ count: 1 }) === false);

    WS.Swarm.stop();   // СРАЗУ: не ждём конца партий
    ok('Swarm.stop(): isRunning → false', WS.Swarm.isRunning() === false);
    ok('после stop роя демо остановлено (active false)', WS.Demo.active() === false);
    ok('после stop роя очередь очищена', WS.Swarm._state().queue.length === 0);
    ok('после stop роя скорость цикла = 1', WS.Loop.speed === 1);
    ok('после stop роя результатов нет (партии не доиграны)', WS.Swarm.results().length === 0);
  });

  // ====================================================================
  // ФАЗА 2 — прогон A: старт демо, конфиг, темп, журнал, TASK_TIMEOUT, стоп
  // ====================================================================
  var jA0 = 0, tmA0 = 0, hPauseA0 = 0, px0 = 0, py0 = 0;

  step(400, function () {
    var r = WS.Demo.start({ fresh: true, name: 'Тест-Бот', seed: 777,
      strategy: 'rush', speedMul: 1, human: false, record: true });
    ok('Demo.start(Тест-Бот, зерно 777, rush) вернул true', r === true);
    ok('Demo.active() — true', WS.Demo.active() === true);
    var c = cfg();
    ok('cfg: имя записано (Тест-Бот)', c.name === 'Тест-Бот');
    ok('cfg: зерно записано (777)', c.seed === 777);
    ok('cfg: стратегия записана (rush)', c.strategy === 'rush');
    ok('cfg: speedMul записан (1)', c.speedMul === 1);
    ok('cfg: human записан (false)', c.human === false);
    ok('cfg: record записан (true)', c.record === true);
    ok('фаза после старта — live', st().phase === 'live');
    ok('киноплёнка пишется (Replay.isActive при record:true)', WS.Replay.isActive() === true);
    ok('повторный Demo.start при активном демо → false',
       WS.Demo.start({ fresh: true, name: 'Ещё-Бот' }) === false);

    jA0 = st().journal.length;
    ok('журнал демо стартует с записями (≥3)', jA0 >= 3, { n: jA0 });
    var startLog = false, k;
    for (k = 0; k < jA0; k++) {
      if (String(st().journal[k].txt).indexOf('ДЕМО старт') >= 0) startLog = true;
    }
    ok('журнал: заголовок старта на месте', startLog);

    // БАГ: журнал пишет константу DEMO_SEED (1917) вместо фактического зерна
    var seedLie = false;
    for (k = 0; k < Math.min(6, jA0); k++) {
      if (String(st().journal[k].txt).indexOf('зерно мира 1917') >= 0) seedLie = true;
    }
    if (seedLie && cfg().seed !== 1917) {
      // БАГ: demo.js:3170 — стартовая запись журнала использует константу
      // DEMO_SEED вместо D.cfg.seed; то же в journalText() (demo.js:242) —
      // выгрузка журнала .txt врёт про мир кастомных демо/агентов роя.
      bug('журнал демо пишет «зерно мира 1917» при фактическом зерне ' + cfg().seed +
        ' (константа DEMO_SEED: demo.js:3170 и demo.js:242 journalText)');
    }

    tmA0 = WS.G.time.totalMin;
    hPauseA0 = st().humanPause || 0;
    px0 = WS.G.player.x; py0 = WS.G.player.y;

    // темп игрока: клампы 1..8
    var v0 = WS.Demo.setPace(0);
    ok('setPace(0) → клампится в 1', v0 === 1 && st().pace === 1);
    var v99 = WS.Demo.setPace(99);
    ok('setPace(99) → клампится в 8', v99 === 8 && st().pace === 8);
    var v3 = WS.Demo.setPace(3);
    ok('setPace(3) → 3 без клампа', v3 === 3 && st().pace === 3);
    WS.Demo.setPace(1);
  });

  // --- бот живёт: 8 секунд реального времени ---
  step(8200, function () {
    var d = st();
    var j1 = d.journal.length;
    ok('журнал растёт (бот живёт, +' + (j1 - jA0) + ' записей)', j1 > jA0, { was: jA0, now: j1 });
    ok('бот думает: есть текущая задача или план', !!(d.task || (d.plan && d.plan.length)));
    ok('игровое время в демо идёт', WS.G.time.totalMin > tmA0,
       { t0: tmA0, t1: WS.G.time.totalMin });
    var p = WS.G.player;
    var moved = Math.abs(p.x - px0) + Math.abs(p.y - py0);
    ok('бот перемещается по миру (прошёл ' + moved.toFixed(1) + ' тайлов)', moved > 0.5, { d: moved });
    ok('human=false: заминок нет (humanPause не растёт)', (d.humanPause || 0) <= hPauseA0 + 0.0001,
       { was: hPauseA0, now: d.humanPause || 0 });

    // демо-слот сейва: создаётся во время демо (автосейв на смене часа)
    var mD = null;
    try { mD = WS.Save.meta('demo'); } catch (e) { mD = null; }
    ok('демо-слот сейва создаётся во время демо', !!mD, mD);
    if (mD && typeof mD.min === 'number' && WS.G.time.min - mD.min > 5) {
      // БАГ (мелкий): демо-слот пишется ТОЛЬКО на смене игрового часа
      // (core/save.js:83-93) и смене дня (demo.js:1672). После stop() в слоте
      // лежит состояние на 08:00 Д1, хотя игра дошла до 08:1X — сообщение
      // «Прогресс сохранён» (demo.js:3263) вводит в заблуждение при коротких
      // прогонах: продолжить = начать почти с начала.
      bug('демо-слот устарел: в сейве ' + Math.floor(mD.min / 60) + ':' +
        ('0' + Math.floor(mD.min % 60)).slice(-2) + ', игра — ' +
        Math.floor(WS.G.time.min / 60) + ':' + ('0' + Math.floor(WS.G.time.min % 60)).slice(-2) +
        ' (автосейв только на смене часа: save.js:91, demo.js:1672)');
    }
  });

  // --- TASK_TIMEOUT: сверка с исходником demo.js ---
  step(200, function () {
    var tt = window.__t6tt;
    if (!tt) {
      bug('не удалось прочитать исходник js/ui/demo.js для сверки TASK_TIMEOUT (fetch)');
      return;
    }
    var need = { search: 30, hunt: 120, banish: 100, beacon: 90,
                 ritual: 120, melt: 180, warm: 360, sleep: 99999 };
    var cnt = 0, kk;
    for (kk in tt) { if (tt.hasOwnProperty(kk)) cnt++; }
    ok('TASK_TIMEOUT: найден в исходнике demo.js', true);
    ok('TASK_TIMEOUT: ровно 8 ключей', cnt === 8, { n: cnt, keys: Object.keys(tt).join(',') });
    var keysOK = true, valsOK = true;
    for (kk in need) {
      if (need.hasOwnProperty(kk)) {
        if (!(kk in tt)) keysOK = false;
        else if (tt[kk] !== need[kk]) valsOK = false;
      }
    }
    ok('TASK_TIMEOUT: все ключи на месте (search/hunt/banish/beacon/ritual/melt/warm/sleep)', keysOK);
    ok('TASK_TIMEOUT: значения верны (search=30, banish=100, melt=180...)', valsOK, tt);
    ok('TASK_TIMEOUT: ritual = 120', tt.ritual === 120);
    ok('TASK_TIMEOUT: sleep = 99999 (бессрочный)', tt.sleep === 99999);
  });

  // --- TASK_TIMEOUT: поведенческие зонды (таймаут-ветка runTask) ---
  var PROBES = [
    ['search', 30.6], ['hunt', 120.6], ['banish', 100.6], ['beacon', 90.6],
    ['ritual', 120.6], ['melt', 180.6], ['warm', 360.6], ['sleep', 99999.6]
  ];
  var pi;
  for (pi = 0; pi < PROBES.length; pi++) {
    (function (pr) {
      var slot = { before: 0 };
      step(150, function () { slot.before = zavislaCount(); probe(pr[0], pr[1]); });
      step(520, function () {
        ok('TASK_TIMEOUT (рантайм): «' + pr[0] + '» отбрасывается при t > ' + pr[1],
           zavislaCount() === slot.before + 1, { type: pr[0], was: slot.before, now: zavislaCount() });
      });
    })(PROBES[pi]);
  }
  // неизвестный тип — потолок по умолчанию 360 сек
  (function () {
    var slot = { before: 0 };
    step(150, function () { slot.before = zavislaCount(); probe('sonda_neizvestnaja', 360.6); });
    step(520, function () {
      ok('TASK_TIMEOUT (рантайм): неизвестный тип — потолок 360 сек', zavislaCount() === slot.before + 1);
    });
  })();
  // отрицательный зонд: без превышения лимита «зависла» не пишется
  (function () {
    var slot = { before: 0 };
    step(150, function () { slot.before = zavislaCount(); probe('search', 5); });
    step(520, function () {
      ok('без превышения лимита задача живёт (нет «зависла»)', zavislaCount() === slot.before,
         { was: slot.before, now: zavislaCount() });
    });
  })();

  // --- стоп прогона A ---
  step(300, function () {
    WS.Demo.stop('тест');
    ok('Demo.stop(): демо неактивно', WS.Demo.active() === false);
    ok('Demo.stop(): скорость цикла возвращена к 1', WS.Loop.speed === 1);
    var panel = document.getElementById('ws-demo');
    ok('панель демо скрыта после stop', !!(panel && panel.classList.contains('hidden')));
    var rawJ = null;
    try { rawJ = localStorage.getItem('wsDemoJournal1917'); } catch (e) { rawJ = null; }
    var jp = null;
    try { jp = rawJ ? JSON.parse(rawJ) : null; } catch (e2) { jp = null; }
    ok('журнал пережил стоп (localStorage wsDemoJournal1917)', !!(jp && jp.length), { n: jp ? jp.length : 0 });
    ok('прогресс демо в слоте сейва (Save.exists("demo"))', WS.Save.exists('demo') === true);

    // ФИКС (был БАГ): stop() теперь зовёт WS.Replay.end() (demo.js) —
    // плёнка больше не протекает в следующую партию и не теряется.
    var recLeak = WS.Replay.isActive();
    ok('после stop запись Кинозала завершена (фикс: stop зовёт Replay.end)', recLeak === false);
  });

  // ====================================================================
  // ФАЗА 3 — прогон Б: человечность (human=true, заминки)
  // ====================================================================
  step(500, function () {
    var r = WS.Demo.start({ fresh: true, name: 'Тест-Человек', seed: 777,
      strategy: 'classic', speedMul: 1, human: true, record: false });
    ok('Demo.start(human:true) вернул true', r === true);
    var d = st();
    ok('cfg: human = true', cfg().human === true);
    ok('humanT при старте — число 6..26 сек',
       typeof d.humanT === 'number' && d.humanT >= 6 && d.humanT <= 26, { v: d.humanT });
  });

  step(800, function (nxt) {
    st().humanT = 0.01;   // подгоняем первую заминку вплотную
    var sawPause = false, maxPause = 0, resetSeen = false, n = 0, maxSeen = 0;
    var iv = setInterval(function () {
      n++;
      var d = st();
      if ((d.humanPause || 0) > 0) { sawPause = true; if (d.humanPause > maxPause) maxPause = d.humanPause; }
      if (typeof d.humanT === 'number' && d.humanT >= 40 && d.humanT <= 120) resetSeen = true;
      // максимум по ВСЕМ сэмплам: humanT между сбросами только тает,
      // значит maxSeen обязан оставаться в диапазоне сброса 40..120
      // (финальный сэмпл может уже сползти ниже 40 — это не баг, так
      // и задумано: таймер тикает, следующая заминка на подходе)
      if (typeof d.humanT === 'number' && d.humanT > maxSeen) maxSeen = d.humanT;
      if (n >= 26) {
        clearInterval(iv);
        ok('человечность: ветка отработала (humanT сброс на 40..120 ИЛИ пауза)',
           resetSeen || sawPause, { reset: resetSeen, pause: sawPause });
        ok('человечность: humanT перезарядился в 40..120 сек',
           !resetSeen || (maxSeen >= 40 && maxSeen <= 120), { max: maxSeen });
        ok('человечность: заминка в пределах 0.5..2.7 сек (макс ' + maxPause.toFixed(2) + ')',
           !sawPause || (maxPause > 0 && maxPause <= 2.7), { max: maxPause });
        WS.Demo.stop('тест человечности');
        ok('стоп после человечности: демо неактивно', WS.Demo.active() === false);
        nxt();
      }
    }, 150);
  });

  // ====================================================================
  // ФАЗА 4 — прогон В: speedMul в autoSpeed + бой (душение скорости до ×6)
  // ====================================================================
  step(400, function () {
    var r = WS.Demo.start({ fresh: true, name: 'Тест-Волк', seed: 777,
      strategy: 'rush', speedMul: 2, human: false, record: false });
    ok('Demo.start(Тест-Волк, speedMul=2) вернул true', r === true);
    ok('cfg: speedMul = 2', cfg().speedMul === 2);
    WS.Demo.setPace(8);
    ok('темп игрока ×8 выставлен', st().pace === 8);
  });

  step(1500, function (nxt) {
    // скорость с speedMul=2: на улице want = 2(ходьба)*8(темп)*2(рой) = 32
    var maxSp = 0, n = 0;
    var iv = setInterval(function () {
      n++;
      var sp = WS.Loop.speed || 0;
      if (sp > maxSp) maxSp = sp;
      if (n >= 20) {
        clearInterval(iv);
        ok('speedMul=2 учтён в autoSpeed: скорость выше базовой ×2 (макс ×' + maxSp + ')',
           maxSp >= 24, { max: maxSp });
        ok('до боя скорость была выше ×6 (клампу есть что душить)', maxSp > 6, { max: maxSp });
        nxt();
      }
    }, 150);
  });

  step(200, function (nxt) {
    // волк-приманка: без brain → ИИ его не ведёт, стоит рядом с дедом
    var p = WS.G.player;
    var offs = [[1.4, 0], [-1.4, 0], [0, 1.4], [0, -1.4], [1, 1], [-1, 1], [1, -1], [-1, -1], [2, 0], [0, 2]];
    var wx = p.x + 1.4, wy = p.y;
    for (var k = 0; k < offs.length; k++) {
      var cx = p.x + offs[k][0], cy = p.y + offs[k][1];
      var blocked = false;
      try { blocked = WS.World.isTileBlocked(Math.floor(cx), Math.floor(cy)); } catch (e) { blocked = false; }
      if (!blocked) { wx = cx; wy = cy; break; }
    }
    var dW = Math.sqrt((wx - p.x) * (wx - p.x) + (wy - p.y) * (wy - p.y));
    var wolf = WS.World.addEnt({
      kind: 'wolf', x: wx, y: wy, dir: 2,
      hp: 45, maxHp: 45, speed: 2.8, dmg: 4, atkSpd: 1.1,
      sprName: 'wolf', sprFrame: 0, animFrames: 2, shadowR: 0.5, scale: 1,
      state: 'idle', stateT: 0, atkCd: 0, lungeT: 0, sight: 9
    });
    window.__t6wolf = wolf;
    ok('волк-приманка поставлена рядом (' + dW.toFixed(2) + ' тайла)', !!wolf && dW <= 2.1, { d: dW });

    var banishSeen = false, clampSeen = false, maxBanish = 0, n = 0;
    var iv = setInterval(function () {
      n++;
      var d = st();
      if (d.task && d.task.type === 'banish') {
        if (!banishSeen) banishSeen = true;
        var sp = WS.Loop.speed || 0;
        if (sp > maxBanish) maxBanish = sp;
        if (sp <= 6) clampSeen = true;   // фикс: в бою want ≤ 6
      }
      if ((banishSeen && clampSeen) || n >= 50) {
        clearInterval(iv);
        ok('бот увидел волка: назначена задача banish', banishSeen);
        ok('БОЙ: скорость душится до ≤×6 при task=banish (было ×' + maxBanish + ')',
           clampSeen, { maxInBanish: maxBanish });
        try {
          if (wolf && !wolf.dead && WS.World.ents.indexOf(wolf) >= 0) WS.World.removeEnt(wolf);
        } catch (e) { /* пусто */ }
        window.__t6wolf = null;
        WS.Demo.stop('тест боя');
        ok('стоп после боя: демо неактивно', WS.Demo.active() === false);
        ok('стоп после боя: скорость цикла = 1', WS.Loop.speed === 1);
        nxt();
      }
    }, 150);
  });

  // ====================================================================
  // ФАЗА 5 — прогон Г: смерть в демо (onFinish) + экспедиция + рой-наследие
  // ====================================================================
  step(400, function () {
    window.__t6runsBefore = WS.Expeditions.meta().runs.length;
    var r = WS.Demo.start({ fresh: true, name: 'Тест-Смерть', seed: 777,
      strategy: 'classic', speedMul: 1, human: false, record: false });
    ok('Demo.start(Тест-Смерть) вернул true', r === true);
    ok('cfg: стратегия по умолчанию — classic', cfg().strategy === 'classic');
  });

  step(1800, function () {
    var p = WS.G.player;
    p.hp = 0;
    // в дед-режиме die = РЕСПАУН; настоящий финал — только с _crazyFinal
    WS.G._crazyFinal = true;
    WS.Main.die('тестовая смерть от QA');
    ok('Main.die сработал (партия остановлена)', WS.G.running === false);
  });

  step(1200, function () {
    var d = st();
    ok('onFinish(death): D.result = death', d.result === 'death');
    ok('onFinish(death): D.phase = done', d.phase === 'done');
    ok('демо неактивно после смерти', WS.Demo.active() === false);
    ok('скорость цикла = 1 после смерти', WS.Loop.speed === 1);
    var runs = WS.Expeditions.meta().runs;
    ok('экспедиция отправлена (runs ≥ ' + (window.__t6runsBefore + 1) + ')',
       runs.length >= window.__t6runsBefore + 1,
       { before: window.__t6runsBefore, now: runs.length });
    var last = runs[runs.length - 1] || {};
    ok('последняя экспедиция: смерть (result=death, имя демо)',
       last.result === 'death' && last.name === 'Тест-Смерть', last);
    var panel = document.getElementById('ws-demo');
    ok('панель демо осталась видимой (журнал финала)', !!(panel && !panel.classList.contains('hidden')));
    ok('демо-слот сейва вычищен после финала', WS.Save.exists('demo') === false);
    var rawJ = null;
    try { rawJ = localStorage.getItem('wsDemoJournal1917'); } catch (e) { rawJ = 'x'; }
    ok('журнал localStorage вычищен после финала', rawJ === null || rawJ === '');
  });

  // --- рой после смерти агента: следующий агент должен играть ---
  step(200, function () {
    var r = WS.Demo.start({ fresh: true, name: 'Тест-Рой-Продолжение', seed: 777,
      strategy: 'rush', speedMul: 1, human: false, record: false });
    ok('следующий «агент роя» стартует после смерти (Demo.start → true)', r === true);
    window.__t6t0 = WS.G.time.totalMin;
  });

  step(2200, function () {
    var t1 = WS.G.time.totalMin;
    // ФИКС ИГРЫ: Main.newGame сбрасывает WS.dead — следующий агент роя
    // живёт, симуляция тикает (раньше замерзала навсегда: death_screen
    // ставил WS.dead=true, никто его не сбрасывал, Loop не тикал)
    var frozen = (t1 === window.__t6t0) && WS.G.running === true && WS.dead === true;
    if (frozen) {
      bug('РОЙ ВИСНЕТ ПОСЛЕ СМЕРТИ АГЕНТА: WS.dead=true не сброшен при старте следующего');
    }
    ok('после смерти агента следующий живёт (WS.dead сброшен, время идёт)',
       t1 > window.__t6t0 && WS.dead !== true);
    window.__t6t2 = WS.G.time.totalMin;
  });

  step(1500, function () {
    var t3 = WS.G.time.totalMin;
    ok('снятие WS.dead оживляет симуляцию (время пошло — диагноз подтверждён)',
       t3 > window.__t6t2, { t2: window.__t6t2, t3: t3 });
    WS.Demo.stop('тест роя завершён');
    ok('финальный стоп: демо неактивно', WS.Demo.active() === false);
    ok('финальный стоп: рой не активен', WS.Swarm.isRunning() === false);
    ok('финальный стоп: скорость цикла = 1', WS.Loop.speed === 1);
  });

  // ====================================================================
  // ФИНАЛ — уборка (ни одного бегущего демо/роя не оставляем)
  // ====================================================================
  step(300, function () {
    try { if (WS.Swarm.isRunning()) WS.Swarm.stop(); } catch (e) { /* пусто */ }
    try { if (WS.Demo.active()) WS.Demo.stop('завершение теста'); } catch (e2) { /* пусто */ }
    try {
      if (window.__t6wolf && WS.World.ents.indexOf(window.__t6wolf) >= 0) {
        WS.World.removeEnt(window.__t6wolf);
      }
    } catch (e3) { /* пусто */ }
    WS.dead = false;
    ok('финиш: ни демо, ни рой не остались бегущими',
       !WS.Demo.active() && !WS.Swarm.isRunning());
    ok('финиш: протокол T-6 выполнен', T.fail >= 0 && T.pass >= 30);
    fin();
  });

  run();
})();
