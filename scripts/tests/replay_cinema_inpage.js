/**
 * replay_cinema_inpage.js — ТЕСТЫ КИНОПЛЁНКИ И КИНОЗАЛА ДЕДА (T-5).
 * Покрывает WS.Replay (begin/end, note-функции, exportRec + мерж extra, тиковая запись
 * позиций и статистики через WS.tick(58), localStorage с лимитом MAX_LOCAL=4,
 * bundled-записи) и WS.Cinema (список записей, скорости ×1..×2400, призрачный
 * мир без симуляции, рост таймлайна/пауза, финал плёнки, клавиша V).
 * Протокол как в 00_smoke_inpage.js: window.__T = {pass, fail, fails, bugs, done}.
 */
(function () {
  'use strict';

  var T = window.__T = { pass: 0, fail: 0, fails: [], bugs: [], done: false };
  function ok(name, cond, data) {
    if (cond) { T.pass++; console.log('  ok   ' + name); }
    else { T.fail++; T.fails.push(name); console.log('  FAIL ' + name + (data ? ' ' + JSON.stringify(data) : '')); }
  }
  function bug(d) { T.bugs.push(String(d)); console.log('  🐞 ' + d); }

  var watchdog = null;
  function fin() { if (watchdog) clearTimeout(watchdog); T.done = true; }

  // ---------- утилиты (строгий ES5) ----------
  function q(s) { return document.querySelector(s); }
  function qa(s) { return document.querySelectorAll(s); }
  function hid(el) { return !!(el && el.classList && el.classList.contains('hidden')); }
  function rep(ch, n) { var s = ''; while (s.length < n) s += ch; return s.slice(0, n); }
  function byCode(ev, code) { var n = 0; for (var i = 0; i < ev.length; i++) if (ev[i][1] === code) n++; return n; }
  function findNote(ev, code, ch) {
    for (var i = ev.length - 1; i >= 0; i--) {
      if (ev[i][1] === code && String(ev[i][2]).charAt(0) === ch) return ev[i];
    }
    return null;
  }
  function cst() { return WS.Cinema._state(); }
  function rowByText(name) {
    var rows = qa('.cn-rec');
    for (var i = 0; i < rows.length; i++) if (rows[i].textContent.indexOf(name) >= 0) return rows[i];
    return null;
  }
  /** Цепочка шагов: синхронные шаги ловит seq, отложенные — delay. */
  function seq(steps) {
    var i = 0;
    function next() {
      if (T.done) return;
      if (i >= steps.length) { fin(); return; }
      var f = steps[i++];
      try { f(next); } catch (e) { bug('исключение в шаге ' + i + ': ' + (e && e.message)); next(); }
    }
    next();
  }
  function delay(ms, fn) {
    return function (next) {
      setTimeout(function () {
        try { fn(); } catch (e) { bug('исключение в отложенном шаге: ' + (e && e.message)); }
        next();
      }, ms);
    };
  }

  // ---------- записи для кинозала (фиксированные сиды) ----------
  var recV = {
    v: 1,
    meta: { name: 'Победный забег', seed: 4242, prof: 'telegraph', strategy: 'rush',
            result: 'victory', day: 42, realSec: 540, banished: 7, calls: 2 },
    ev: [
      [0, 0, 110, 110],
      [0, 4, 'Глава 1. Мороз и радио'],
      [5, 1, 'Тарелка где-то за лесом'],
      [10, 2, 'Срубил ёлку', 'good'],
      [15, 3, 95, 12],
      [40, 0, 114, 112],
      [80, 0, 118, 116],
      [120, 0, 122, 121],
      [200, 0, 126, 124],
      [300, 5, 'victory', 42]
    ]
  };
  var recS = {
    v: 1,
    meta: { name: 'Короткая сцена', seed: 4242, prof: 'telegraph', result: 'death', day: 7 },
    ev: [ [0, 0, 111, 111], [0, 1, 'Идём к тарелке'], [2, 5, 'death', 7] ]
  };
  var recX = {
    v: 1,
    meta: { name: 'Инъекция <b>жирно</b> текст', seed: 5, result: '', day: 0 },
    ev: [ [0, 1, 'запись с хитрым именем'] ]
  };
  var idV = null, idS = null, idX = null;
  var t0 = 0, time0 = '', t2 = 0, time2 = '';
  var gm0 = 0;
  var bCalled = false, bArr = -1, bThrew = false;
  var lCalled = false, lRes = 'не вызван', lThrew = false;

  watchdog = setTimeout(function () {
    if (!T.done) { bug('watchdog: тест не дошёл до конца за 90 с — обрываю'); fin(); }
  }, 90000);

  seq([

    // ====== 1. ядро, партия, begin/note*/границы обрезки ======
    function (next) {
      window.confirm = function () { return true; };

      ok('модули киноплёнки и кинозала на месте', !!(WS.Replay && WS.Cinema));
      ok('API Replay полный (begin..loadBundled)',
         !!(WS.Replay.begin && WS.Replay.end && WS.Replay.isActive && WS.Replay.noteThink &&
            WS.Replay.noteAct && WS.Replay.noteChapter && WS.Replay.noteResult &&
            WS.Replay.exportRec && WS.Replay.saveLocal && WS.Replay.loadLocal &&
            WS.Replay.removeLocal && WS.Replay.listLocal && WS.Replay.listBundled && WS.Replay.loadBundled));
      ok('API Cinema: show/hide/isOpen/_state',
         !!(WS.Cinema.show && WS.Cinema.hide && WS.Cinema.isOpen && WS.Cinema._state));

      var started = WS.Main.newGame('telegraph', ['frostproof', 'patient'], 4242);
      ok('newGame стартует (проф telegraph, сид 4242)', started === true);
      ok('партия жива: симуляция идёт (G.running)', !!(WS.G && WS.G.running));

      // --- снапшот exportRec: выгрузка заморожена на момент вызова ---
      WS.Replay.begin({ name: 'Алиасинг', seed: 777 });
      ok('begin(meta): запись активна (isActive true)', WS.Replay.isActive() === true);
      WS.Replay.noteThink('первая мысль');
      var rAlias = WS.Replay.exportRec();
      WS.Replay.noteThink('вторая мысль');
      // ФИКС: ev копируется — выгрузка не догоняет живую запись
      ok('exportRec(): снапшот — выгрузка не растёт после новых note*',
         rAlias.ev.length === 1, { n: rAlias.ev.length });
      WS.Replay.end();
      ok('end(): запись остановлена (isActive false)', WS.Replay.isActive() === false);

      // --- снапшот meta: extra не мутирует живую запись ---
      WS.Replay.begin({ name: 'Мерж', seed: 778 });
      WS.Replay.noteAct('что-то сделал', 'good');
      var rA = WS.Replay.exportRec({ banished: 5, calls: 2 });
      ok('exportRec(extra): extra смержен в meta', rA.meta.banished === 5 && rA.meta.calls === 2);
      ok('exportRec: v=1 и ev на месте', rA.v === 1 && Array.isArray(rA.ev));
      var rB = WS.Replay.exportRec();
      // ФИКС: meta копируется — extra не протекает в повторные экспорты
      ok('exportRec: extra не протекает в повторный экспорт (meta — копия)',
         rB.meta.banished === undefined && rB.meta.calls === undefined);
      WS.Replay.end();

      // --- основная запись: заметки всех кодов + границы обрезки ---
      WS.Replay.begin({ name: 'Хроника партии', seed: 4242, prof: 'telegraph', strategy: 'rush' });
      ok('begin({name,seed,strategy}): isActive true', WS.Replay.isActive() === true);
      WS.Replay.noteThink('Идём к тарелке');
      WS.Replay.noteAct('Срубил ёлку', 'good');
      WS.Replay.noteChapter('Глава первая. Мороз');
      WS.Replay.noteResult('victory', 33);
      WS.Replay.noteThink(rep('а', 220));
      WS.Replay.noteThink(rep('б', 300));
      WS.Replay.noteAct(rep('в', 221), 'warn');
      WS.Replay.noteChapter(rep('г', 160));
      WS.Replay.noteChapter(rep('д', 250));
      var rec0 = WS.Replay.exportRec();
      ok('exportRec(): {v:1, meta.name, meta.seed, meta.strategy, ev[]}',
         rec0.v === 1 && rec0.meta.name === 'Хроника партии' && rec0.meta.seed === 4242 &&
         rec0.meta.strategy === 'rush' && Array.isArray(rec0.ev));
      var ev0 = rec0.ev;
      ok('события с кодами 1/2/4/5 записаны',
         byCode(ev0, 1) === 3 && byCode(ev0, 2) === 2 && byCode(ev0, 4) === 3 && byCode(ev0, 5) === 1);
      var nT = findNote(ev0, 1, 'И');
      ok('noteThink: [мин, 1, текст]', !!nT && nT[2] === 'Идём к тарелке' && nT.length === 3);
      var nA = findNote(ev0, 2, 'С');
      ok('noteAct: [мин, 2, текст, класс]', !!nA && nA[2] === 'Срубил ёлку' && nA[3] === 'good' && nA.length === 4);
      var nC = findNote(ev0, 4, 'Г');
      ok('noteChapter: [мин, 4, текст]', !!nC && nC[2] === 'Глава первая. Мороз');
      var nR = findNote(ev0, 5, 'v');
      ok('noteResult: [мин, 5, результат, день]', !!nR && nR[2] === 'victory' && nR[3] === 33);
      var b220 = findNote(ev0, 1, 'а'), b300 = findNote(ev0, 1, 'б');
      var a221 = findNote(ev0, 2, 'в'), c160 = findNote(ev0, 4, 'г'), c250 = findNote(ev0, 4, 'д');
      ok('мысль 220 символов не обрезана', !!b220 && b220[2].length === 220, { len: b220 ? b220[2].length : -1 });
      ok('мысль 300 символов обрезана до 220', !!b300 && b300[2].length === 220);
      ok('действие 221 символ обрезано до 220', !!a221 && a221[2].length === 220);
      ok('глава 160 символов не обрезана', !!c160 && c160[2].length === 160);
      ok('глава 250 символов обрезана до 160', !!c250 && c250[2].length === 160);
      next();
    },

    // ====== 2. пауза на тиковую запись (позиции раз в 3 игровые минуты, стат раз в час) ======
    delay(6000, function () { /* плёнка пишет сама через WS.tick(58) */ }),

    // ====== 3. тиковая запись, формат событий, хранилище, лимит ======
    function (next) {
      var rec = WS.Replay.exportRec({ result: 'victory', day: 33, realSec: 9 });
      var ev = rec.ev;
      ok('exportRec(extra): result/day/realSec смержены в meta',
         rec.meta.result === 'victory' && rec.meta.day === 33 && rec.meta.realSec === 9);
      var nPos = byCode(ev, 0), nStat = byCode(ev, 3);
      ok('тиковая запись: позиции (код 0) пишутся при живой партии', nPos >= 2, { n: nPos });
      ok('тиковая запись: статистика (код 3) пишется раз в игровой час', nStat >= 1, { n: nStat });

      var minsInt = true, codesOk = true, posOk = true, statOk = true, cadOk = true;
      var lastPosMin = -100000, statEv = null;
      for (var i = 0; i < ev.length; i++) {
        var e = ev[i];
        if (typeof e[0] !== 'number' || Math.round(e[0]) !== e[0]) minsInt = false;
        if (typeof e[1] !== 'number' || e[1] < 0 || e[1] > 5 || Math.round(e[1]) !== e[1]) codesOk = false;
        if (e[1] === 0) {
          if (e.length !== 4 || typeof e[2] !== 'number' || typeof e[3] !== 'number' ||
              e[2] < 0 || e[2] > 220 || e[3] < 0 || e[3] > 220) posOk = false;
          if (lastPosMin > -99999 && e[0] - lastPosMin < 2) cadOk = false;
          lastPosMin = e[0];
        }
        if (e[1] === 3) {
          if (e.length !== 4 || typeof e[2] !== 'number' || typeof e[3] !== 'number') statOk = false;
          statEv = e;
        }
      }
      ok('формат: минуты всех событий — целые числа', minsInt);
      ok('формат: коды событий целые и в диапазоне 0..5', codesOk);
      ok('формат: позиция — [мин, 0, x, y] с координатами в мире 220×220', posOk);
      ok('формат: статистика — [мин, 3, hp, энергия]', statOk);
      ok('позиции сэмплируются не чаще раза в 3 игровые минуты (POS_EVERY)', cadOk);
      ok('статистика: HP игрока в событии', !!statEv && statEv[2] >= 0 && statEv[2] <= 100, { hp: statEv ? statEv[2] : -1 });

      WS.Replay.end();
      ok('end(): запись завершена', WS.Replay.isActive() === false);
      var lenBefore = rec.ev.length;
      WS.Replay.noteThink('после конца');
      WS.Replay.noteAct('после конца', 'bad');
      WS.Replay.noteChapter('после конца');
      WS.Replay.noteResult('stop', 99);
      ok('после end() новые note* не пишутся', rec.ev.length === lenBefore, { was: lenBefore, now: rec.ev.length });

      var id1 = WS.Replay.saveLocal(rec, 'Хроника партии');
      ok('saveLocal вернул id', typeof id1 === 'string' && id1.length > 1);
      var rawRec = null, rawIdx = null;
      try {
        rawRec = localStorage.getItem('wsReplay1_' + id1);
        rawIdx = JSON.parse(localStorage.getItem('wsReplaysIdx1'));
      } catch (e) { /* пусто */ }
      ok('хранилище: запись лежит под ключом wsReplay1_<id>', !!rawRec);
      ok('хранилище: индекс wsReplaysIdx1 обновлён',
         !!(rawIdx && rawIdx.length === 1 && rawIdx[0].id === id1));
      var ent = rawIdx && rawIdx[0];
      ok('listLocal: запись {id, name, result, day}',
         !!ent && ent.id === id1 && ent.name === 'Хроника партии' && ent.result === 'victory' && ent.day === 33);
      // ФИКС: strategy пишется в индекс — тег «СПИДРАН» виден в кинозале
      ok('listLocal: strategy сохраняется в индексе (для тега СПИДРАН)',
         !!ent && ent.strategy === 'rush', { strategy: ent ? ent.strategy : null });
      var rec2 = WS.Replay.loadLocal(id1);
      ok('loadLocal: та же запись (v, meta.name, meta.seed)',
         !!rec2 && rec2.v === 1 && rec2.meta.name === 'Хроника партии' && rec2.meta.seed === 4242);
      ok('loadLocal: ev совпадает с сохранённым',
         !!rec2 && JSON.stringify(rec2.ev) === JSON.stringify(rec.ev));
      WS.Replay.removeLocal(id1);
      ok('removeLocal: индекс пуст', WS.Replay.listLocal().length === 0);
      ok('removeLocal: данные записи удалены', WS.Replay.loadLocal(id1) === null);

      // --- лимит MAX_LOCAL = 4: 6 сохранений подряд ---
      for (var k = 1; k <= 6; k++) {
        WS.Replay.saveLocal({ v: 1, meta: { name: 'Лимит ' + k, seed: 900 + k, result: 'death', day: k },
          ev: [[0, 1, 'запись ' + k]] }, 'Лимит ' + k);
      }
      var lst = WS.Replay.listLocal();
      ok('лимит MAX_LOCAL=4: после 6 сохранений в индексе ровно 4', lst.length === 4, { n: lst.length });
      var names = [];
      for (var j = 0; j < lst.length; j++) names.push(lst[j].name);
      ok('выталкивание старых: остались «Лимит 6..3», новые сверху',
         names[0] === 'Лимит 6' && names.indexOf('Лимит 1') < 0 && names.indexOf('Лимит 2') < 0, { names: names });
      var uniq = {}, nUniq = 0;
      for (var u = 0; u < lst.length; u++) if (!uniq[lst[u].id]) { uniq[lst[u].id] = 1; nUniq++; }
      // ФИКС: id уникальны даже при сохранении подряд за одну миллисекунду
      ok('id уникальны при сохранении подряд (одна мс не коллизирует)',
         nUniq === lst.length, { uniq: nUniq, of: lst.length });
      var noOverwrite = true, badName = '';
      for (var dd = 0; dd < lst.length; dd++) {
        var rr = WS.Replay.loadLocal(lst[dd].id);
        if (!rr || !rr.meta || rr.meta.name !== lst[dd].name) { noOverwrite = false; badName = lst[dd].name; break; }
      }
      ok('записи не затёрли друг друга: loadLocal(id) возвращает свою запись',
         noOverwrite, { bad: badName });
      var guard = 30;
      while (WS.Replay.listLocal().length > 0 && guard-- > 0) {
        var l2 = WS.Replay.listLocal();
        WS.Replay.removeLocal(l2[l2.length - 1].id);
      }
      ok('очистка: локальные записи удалены перед кинозалом', WS.Replay.listLocal().length === 0);

      // --- bundled-записи: запуск (колбэги прийдут асинхронно) ---
      try { WS.Replay.listBundled(function (a) { bCalled = true; bArr = a; }); } catch (e) { bThrew = true; }
      try { WS.Replay.loadBundled('нет_такого_файла.json', function (j) { lCalled = true; lRes = j; }); } catch (e) { lThrew = true; }
      next();
    },

    // ====== 4. bundled-колбэки + сохранение записей для кинозала ======
    delay(800, function () {
      ok('listBundled: колбэк вызван, исключения нет', bCalled && !bThrew);
      ok('listBundled: вернул массив', Array.isArray(bArr));
      // recordings/ поставляется с игрой (рой агентов): плёнок ≥ 3
      ok('listBundled: bundled-плёнки из recordings/ читаются (≥3)',
         Array.isArray(bArr) && bArr.length >= 3, { n: Array.isArray(bArr) ? bArr.length : -1 });
      if (Array.isArray(bArr) && bArr.length) {
        var okMeta = bArr[0].file && bArr[0].name;
        for (var bi = 0; bi < bArr.length; bi++) {
          if (!bArr[bi].file || !bArr[bi].name || !bArr[bi].result) { okMeta = false; break; }
        }
        ok('listBundled: у плёнок есть file/name/result (index.json валиден)', okMeta);
      }
      ok('loadBundled: несуществующий файл → колбэк с null, без исключения', lCalled && !lThrew && lRes === null);
      idV = WS.Replay.saveLocal(recV, 'Победный забег');
      ok('saveLocal: «Победный забег» сохранена', typeof idV === 'string' && idV.length > 1);
    }),

    delay(8, function () {
      idS = WS.Replay.saveLocal(recS, 'Короткая сцена');
      ok('saveLocal: «Короткая сцена» сохранена', typeof idS === 'string' && idS.length > 1);
    }),

    delay(8, function () {
      idX = WS.Replay.saveLocal(recX, 'Инъекция <b>жирно</b> текст');
      ok('три записи сохранены с разными id', !!idX && idV !== idS && idV !== idX && idS !== idX);
      ok('listLocal: три записи в индексе', WS.Replay.listLocal().length === 3);
    }),

    // ====== 5. КИНОЗАЛ: открытие, список, кнопки ======
    function (next) {
      gm0 = WS.G && WS.G.time ? WS.G.time.totalMin : 0;
      WS.Cinema.show();
      var root = q('#ws-cinema');
      ok('show(): панель #ws-cinema в DOM', !!root);
      ok('show(): панель видима (нет .hidden)', !hid(root));
      ok('show(): список .cn-list виден', !hid(q('.cn-list')));
      ok('show(): плеер .cn-player скрыт до выбора записи', hid(q('.cn-player')));
      ok('show(): isOpen() true', WS.Cinema.isOpen() === true);
      // ФИКС: кинозал регистрируется в реестре Ui ДО открытия — модальность честная
      ok('модальность: Ui.modal() true при открытом кинозале', WS.Ui.modal() === true);
      var op = WS.Ui.opened();
      ok('стек Ui: «cinema» открыт через реестр (push в стек)', op.indexOf('cinema') >= 0, { stack: op });
      ok('класс .ws-modal повешен на панель кинозала', !!root && root.classList.contains('ws-modal'));
      // РЕГРЕССИЯ z-index: кинозал открывается ИЗ главного меню (.menu-wrap,
      // z-index 200) и обязан стоять НАД ним, иначе все клики съедает меню
      var zCin = root ? parseInt(getComputedStyle(root).zIndex, 10) : 0;
      var menuEl = document.querySelector('.menu-wrap');
      var zMenu = menuEl ? parseInt(getComputedStyle(menuEl).zIndex, 10) : 0;
      ok('z-index: кинозал (z=' + zCin + ') выше главного меню (z=' + zMenu + ')',
         zCin > 200 && zCin > zMenu, { zCin: zCin, zMenu: zMenu });
      ok('кнопки управления плеером: −/+/⏸/⟲ в топбаре',
         !!(q('.cn-topbar [data-act="slower"]') && q('.cn-topbar [data-act="faster"]') &&
            q('.cn-topbar [data-act="pause"]') && q('.cn-topbar [data-act="restart"]')));
      ok('индикатор скорости показывает дефолт ×60', q('.cn-speed') && q('.cn-speed').textContent === '×60');
      // ФИКС: ряд кнопок всех 10 скоростей ×1..×2400 в панели управления
      var speedBtns = qa('.cn-btn[data-speed]');
      ok('кнопки всех 10 скоростей ×1..×2400 в DOM', speedBtns.length === 10, { n: speedBtns.length });
      var lbls = [];
      for (var li = 0; li < speedBtns.length; li++) lbls.push(speedBtns[li].textContent);
      ok('подписи кнопок скоростей: ×1 … ×2400 (весь ряд)',
         lbls.length === 10 && lbls[0] === '×1' && lbls[9] === '×2400', { lbls: lbls });
      next();
    },

    // ====== 6. список записей (имена, 🏆, день, тег, XSS) + закрытие ======
    delay(700, function () {
      var rows = qa('.cn-rec');
      ok('список записей отрендерен (строки .cn-rec)', rows.length >= 3, { n: rows.length });
      var rowV = rowByText('Победный забег');
      var rowS = rowByText('Короткая сцена');
      var rowX = rowByText('Инъекция');
      ok('запись «Победный забег» видна в списке', !!rowV);
      ok('запись «Короткая сцена» видна в списке', !!rowS);
      ok('победная запись помечена 🏆', !!rowV && rowV.textContent.indexOf('🏆') >= 0);
      ok('день победы отображается («день 42»)', !!rowV && rowV.textContent.indexOf('день 42') >= 0);
      // ФИКС: saveLocal пишет strategy в индекс — тег «СПИДРАН» на месте
      ok('тег СПИДРАН у локальной записи (strategy в индексе)',
         !!rowV && !!rowV.querySelector('.cn-tag'));
      ok('смертельная запись помечена 💀', !!rowS && rowS.textContent.indexOf('💀') >= 0);
      // ФИКС: имя записи экранируется — HTML/JS-инъекция закрыта
      var xEl = rowX && rowX.querySelector('.cn-rec-name');
      ok('имя записи экранировано: <b> не создаёт тег (XSS закрыт)',
         !!xEl && !xEl.querySelector('b') && xEl.innerHTML.indexOf('&lt;b&gt;') >= 0);
      WS.Replay.removeLocal(idX);

      // ФИКС модальности: партия под кинозалом стоит на паузе
      ok('под кинозалом симуляция живой партии стоит (Ui.modal глушит Loop)',
         !!(WS.G && WS.G.time) && WS.G.time.totalMin === gm0,
         { was: Math.round(gm0), now: Math.round(WS.G && WS.G.time ? WS.G.time.totalMin : -1) });

      // ФИКС: renderList не затирает .cn-head — заголовок и кнопка ✕ живы
      ok('заголовок .cn-head жив после renderList (не затёрт)',
         !!q('.cn-list .cn-head') && q('.cn-list .cn-head').textContent.indexOf('КИНОЗАЛ') >= 0);
      ok('кнопка закрытия списка ✕ на месте после рендера', !!q('.cn-list .cn-close'));
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
      ok('Escape закрывает кинозал (через реестр Ui)',
         WS.Cinema.isOpen() === false && hid(q('#ws-cinema')));
      ok('после закрытия модальность снята (Ui.modal false)', WS.Ui.modal() === false);
      ok('после закрытия симуляция не в призрачном мире (G нет или партия жива)', !WS.G || WS.G.running === true);
    }),

    // ====== 7. открытие записи: призрачный мир ======
    function (next) {
      WS.Cinema.show();
      ok('повторный show(): список снова виден', !hid(q('.cn-list')));
      next();
    },

    delay(500, function () {
      var rowV = rowByText('Победный забег');
      ok('строка «Победный забег» на месте', !!rowV);
      rowV.click();
      ok('клик по записи: плеер открыт (.cn-player виден)', !hid(q('.cn-player')));
      ok('клик по записи: список скрыт', hid(q('.cn-list')));
    }),

    delay(500, function () {
      var s = cst();
      ok('призрачный мир построен: WS.G существует', !!WS.G);
      ok('симуляция выключена: G.running === false (только рендер)', !!WS.G && WS.G.running === false);
      var pl = WS.G && WS.G.player;
      ok('дед-призрак на карте: G.player есть', !!pl);
      var inEnts = false;
      if (pl && WS.World && WS.World.ents) {
        for (var i = 0; i < WS.World.ents.length; i++) {
          if (WS.World.ents[i] === pl || WS.World.ents[i].id === 'player') { inEnts = true; break; }
        }
      }
      ok('дед-призрак в списке сущностей мира (World.ents)', inEnts);
      ok('маркер призрака включён (p.marker)', !!pl && pl.marker === true);
      ok('призрак стоит в позиции плёнки (sync с ghost)',
         !!pl && Math.abs(pl.x - s.ghost.x) < 0.6 && Math.abs(pl.y - s.ghost.y) < 0.6,
         { px: pl ? Math.round(pl.x * 10) / 10 : -1, gx: Math.round(s.ghost.x * 10) / 10 });
      ok('время мира ведомо плёнкой (G.time.totalMin ≈ tlMin)',
         !!(WS.G && WS.G.time) && Math.abs(WS.G.time.totalMin - s.tlMin) <= 2,
         { gt: WS.G && WS.G.time ? Math.round(WS.G.time.totalMin) : -1, tl: Math.round(s.tlMin) });
      ok('камера на призраке', !!pl && Math.abs(WS.Cam.cx - pl.x) < 1 && Math.abs(WS.Cam.cy - pl.y) < 1);
      ok('шапка: имя записи «Победный забег»', q('.cn-name') && q('.cn-name').textContent.indexOf('Победный забег') >= 0);
      ok('шапка: скорость ×60 по умолчанию', q('.cn-speed') && q('.cn-speed').textContent === '×60');
      ok('плёнка воспроизводится (playing true)', s.playing === true);
      ok('пузырь мысли всплыл (событие кода 1)',
         !hid(q('.cn-bubble')) && q('.cn-bubble').textContent.indexOf('Тарелка') >= 0);
      var feedTx = q('.cn-feed') ? q('.cn-feed').textContent : '';
      ok('лента действий: глава из записи (код 4)', feedTx.indexOf('Мороз и радио') >= 0);
      ok('лента действий: действие из записи (код 2)', feedTx.indexOf('Срубил ёлку') >= 0);
      ok('ХП из записи на панели (код 3)', q('.cn-hp') && q('.cn-hp').textContent.indexOf('95') >= 0);
      ok('грибная энергия из записи на панели', q('.cn-en') && q('.cn-en').textContent.indexOf('12') >= 0);
      t0 = s.tlMin;
      time0 = q('.cn-time').textContent;
    }),

    // ====== 8. воспроизведение: рост таймлайна и пауза ======
    delay(600, function () {
      var s = cst();
      ok('таймлайн растёт (tlMin увеличился)', s.tlMin > t0 + 10, { was: Math.round(t0), now: Math.round(s.tlMin) });
      ok('время плёнки в DOM растёт (.cn-time)', q('.cn-time') && q('.cn-time').textContent !== time0,
         { was: time0, now: q('.cn-time') ? q('.cn-time').textContent : '' });
      q('.cn-topbar [data-act="pause"]').click();
      ok('пауза: playing false', cst().playing === false);
      t2 = cst().tlMin;
      time2 = q('.cn-time') ? q('.cn-time').textContent : '';
    }),

    delay(500, function () {
      var s = cst();
      ok('пауза: tlMin замер', s.tlMin === t2, { was: Math.round(t2), now: Math.round(s.tlMin) });
      ok('пауза: .cn-time не меняется', q('.cn-time') && q('.cn-time').textContent === time2);
      q('.cn-topbar [data-act="faster"]').click();
      ok('кнопка +: скорость ×150 (индекс 6)', cst().speedIx === 6);
    }),

    delay(150, function () {
      ok('DOM: индикатор скорости показывает ×150', q('.cn-speed') && q('.cn-speed').textContent === '×150');
      q('.cn-topbar [data-act="slower"]').click();
      ok('кнопка −: скорость обратно ×60', cst().speedIx === 5);
    }),

    delay(150, function () {
      ok('DOM: индикатор скорости снова ×60', q('.cn-speed') && q('.cn-speed').textContent === '×60');
      // ФИКС: прямой выбор скорости из ряда кнопок ×1..×2400
      q('.cn-speeds .cn-btn[data-speed="2"]').click();
      ok('кнопка ряда: клик ×4 ставит индекс 2 напрямую', cst().speedIx === 2);
    }),

    delay(150, function () {
      ok('DOM: индикатор скорости ×4 после клика кнопки ряда',
         q('.cn-speed') && q('.cn-speed').textContent === '×4');
      var actBtn = q('.cn-speeds .cn-btn[data-speed="2"]');
      ok('подсветка активной кнопки ряда (×4 active)',
         !!actBtn && actBtn.classList.contains('active'));
      for (var i = 0; i < 5; i++) q('.cn-topbar [data-act="slower"]').click();
      ok('минимальная скорость ×1 (низ диапазона 10 скоростей)', cst().speedIx === 0);
    }),

    delay(150, function () {
      ok('DOM: индикатор скорости ×1', q('.cn-speed') && q('.cn-speed').textContent === '×1');
      for (var i = 0; i < 9; i++) q('.cn-topbar [data-act="faster"]').click();
      ok('максимальная скорость ×2400 (верх диапазона)', cst().speedIx === 9);
    }),

    delay(150, function () {
      ok('DOM: индикатор скорости ×2400', q('.cn-speed') && q('.cn-speed').textContent === '×2400');
      // ФИКС: прямой выбор верхней и средней скорости кнопками ряда
      q('.cn-speeds .cn-btn[data-speed="9"]').click();
      ok('кнопка ряда ×2400: прямой выбор верхней скорости', cst().speedIx === 9);
      q('.cn-speeds .cn-btn[data-speed="5"]').click();
      ok('кнопка ряда ×60: прямой выбор средней скорости', cst().speedIx === 5);
      q('.cn-speeds .cn-btn[data-speed="9"]').click();
      q('.cn-topbar [data-act="pause"]').click();
      ok('снятие с паузы на ×2400 (playing true)', cst().playing === true);
    }),

    // ====== 9. конец плёнки + рестарт (баг оверлея) ======
    delay(900, function () {
      var s = cst();
      ok('плёнка доиграна до конца (ended true)', s.ended === true);
      ok('на конце плёнки playing false', s.playing === false);
      ok('экран финала показан (.cn-end без hidden)', !hid(q('.cn-end')));
      ok('финал: «ТАРЕЛКА ПРИЛЕТЕЛА» для victory', q('.cn-end-title') && q('.cn-end-title').textContent.indexOf('ТАРЕЛКА') >= 0);
      ok('финал: день и статистика из записи («день 42»)', q('.cn-end-sub') && q('.cn-end-sub').textContent.indexOf('день 42') >= 0);
      ok('таймлайн остановился на конце плёнки (Д1 05:00 = 300 мин)', q('.cn-time') && q('.cn-time').textContent === 'Д1 05:00');
      for (var i = 0; i < 9; i++) q('.cn-topbar [data-act="slower"]').click();
      ok('скорость сброшена в ×1 перед рестартом', cst().speedIx === 0);
      q('.cn-end [data-act="restart"]').click();
      var s2 = cst();
      ok('рестарт «⟲ ещё раз»: плёнка с начала (tlMin 0, playing true, ended false)',
         s2.tlMin === 0 && s2.playing === true && s2.ended === false);
      // ФИКС: рестарт прячет экран финала — реплей не идёт под оверлеем
      ok('экран финала скрыт после рестарта (.cn-end hidden)', hid(q('.cn-end')));
    }),

    delay(400, function () {
      ok('оверлей финала скрыт, плёнка реально идёт с начала',
         hid(q('.cn-end')) && cst().tlMin < 30, { tl: Math.round(cst().tlMin) });
      // ФИКС: «к списку записей» возвращает к списку, не закрывая кинозал
      q('.cn-end .cn-close').click();
      ok('«к списку записей»: кинозал остаётся открытым (панель видима)',
         WS.Cinema.isOpen() === true && !hid(q('#ws-cinema')));
      ok('«к списку записей»: список виден, плеер и финал скрыты',
         !hid(q('.cn-list')) && hid(q('.cn-player')) && hid(q('.cn-end')));
      ok('«к списку записей»: кинозал остаётся модальным', WS.Ui.modal() === true);
    }),

    // ====== 10. короткая запись: финал без исключений ======
    function (next) {
      WS.Cinema.show();
      ok('список записей всё ещё виден (show не переоткрывает открытый кинозал)', !hid(q('.cn-list')));
      next();
    },

    delay(500, function () {
      var rowS = rowByText('Короткая сцена');
      ok('строка «Короткая сцена» на месте', !!rowS);
      rowS.click();
      ok('клик по короткой записи: плеер открыт', !hid(q('.cn-player')));
    }),

    delay(400, function () {
      ok('призрачный мир короткой записи: G.running false', !!WS.G && WS.G.running === false);
      ok('скорость сохранилась между сеансами (×1)', q('.cn-speed') && q('.cn-speed').textContent === '×1');
      for (var i = 0; i < 9; i++) q('.cn-topbar [data-act="faster"]').click();
      ok('разгон короткой плёнки до ×2400', cst().speedIx === 9);
    }),

    delay(700, function () {
      ok('короткая плёнка (noteResult сразу) закончилась без исключений (ended)', cst().ended === true);
      ok('финал короткой: «ДЕД УСНУЛ НАВСЕГДА» для death', q('.cn-end-title') && q('.cn-end-title').textContent.indexOf('УСНУЛ') >= 0);
      ok('таймлайн короткой: Д1 00:02 (2 игровые минуты)', q('.cn-time') && q('.cn-time').textContent === 'Д1 00:02');
      q('.cn-player .cn-close').click();
      ok('кнопка «✕ выйти» закрывает кинозал', WS.Cinema.isOpen() === false && hid(q('#ws-cinema')));
    }),

    // ====== 11. клавиша V, closeAll, закрытие мышью ======
    function (next) {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyV' }));
      ok('клавиша V открывает кинозал (вне модалок)', WS.Cinema.isOpen() === true);
      ok('модальность открытого через V кинозала: Ui.modal() true', WS.Ui.modal() === true);
      next();
    },

    delay(300, function () {
      ok('после V: список записей виден', !hid(q('.cn-list')));
      // ФИКС: кинозал в стеке Ui — аварийный closeAll обязан его закрыть
      WS.Ui.closeAll();
      ok('Ui.closeAll() закрывает кинозал (аварийный сброс стека)',
         WS.Cinema.isOpen() === false && hid(q('#ws-cinema')));
      ok('после closeAll: «cinema» вынут из стека, Ui.modal() false',
         WS.Ui.opened().indexOf('cinema') < 0 && WS.Ui.modal() === false);
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyV' }));
      ok('V снова открывает кинозал после closeAll', WS.Cinema.isOpen() === true);
    }),

    delay(300, function () {
      ok('список записей виден, кнопка ✕ в шапке на месте',
         !hid(q('.cn-list')) && !!q('.cn-list .cn-close'));
      // ФИКС: .cn-head больше не затирается рендером — список закрывается мышью
      q('.cn-list .cn-close').click();
      ok('клик по ✕ закрывает кинозал мышью',
         WS.Cinema.isOpen() === false && hid(q('#ws-cinema')));
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyV' }));
      ok('кинозал открыт снова (перед финальной проверкой API)', WS.Cinema.isOpen() === true);
    }),

    delay(200, function () {
      WS.Cinema.hide();
      ok('hide() закрывает кинозал (API)', WS.Cinema.isOpen() === false && hid(q('#ws-cinema')));
    })
  ]);
})();
