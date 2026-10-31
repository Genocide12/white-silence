/**
 * voice_inpage.js — T-3 «СТУДИЙНАЯ ОЗВУЧКА»: VoiceBox вместо робота Web Speech.
 * Проверяет: манифест (71 фраза, 6 каналов, схема id/f/t/ch, тексты без
 * дубликатов), существование всех mp3-файлов (и вычистку мёртвых дублей
 * cz_joint/cz_timeup/cz_respawn), полный мат-банк (30 категорий → hasText),
 * реплики изгнания (BANISH_LINES), мультяшек (CARTOON_TAUNTS), Грибного
 * Зова (story.js LINES), фиксированные реплики crazy.js + реплику победы
 * (cz_victory), префетч интро (narrator_intro/cz_start звучат с холодного
 * старта), честный счётчик decoded (без двойного счёта), гейты
 * voiceDed/voiceRadio/voiceVol (все НЕ-радио каналы под «Голосом деда»),
 * мастер setVoiceOn, мат-режим matMode, радио-диктор radioSay, экран
 * настроек и полный выпил Web Speech API. Протокол: window.__T (см. run_tests.mjs).
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

  // ======================= ФИКС-РЕПЛИКИ ИЗ КОДА ИГРЫ =======================

  // js/systems/crazy.js: BANISH_LINES — реплики изгнания (канал ded)
  var BANISH_LINES = [
    'Изыди, мультяшка, бляха-муха!',
    'Получай лопатой, сволочь рисованная!',
    'Ах ты ж ёб твою медь!',
    'Лодошкой его! Лодошкой, едрён-батон!',
    'Бац! И нету тебя, пиздюк глазастый!',
    'В подарки превращайся, хрень картонная!',
    'Вот тебе, грибной посланник, насяльника!',
    'Ногой его! Ногой, курва малахольная!',
    'Изыди, нечисть мультипликационная!'
  ];
  // js/systems/crazy.js: CARTOON_TAUNTS — прощания мультяшек (канал cartoon)
  var CARTOON_TAUNTS = [
    'Ой-ой-ой, діду, за що?! Я ж добра мультичка!',
    'Не бий, діду! Я тобі цукерок принесу!',
    'Ай! Лапка! Моя намальована лапка!',
    'Ми ж просто співали пісеньки про гриби!',
    'Караул! Рятувайте, хто може! Дід озброївся вантузом!',
    'Я малювався чесно! Олівцем! Мене мама-мультфільм чекає!',
    'Ой, лусну! Лусну від дідової лодошки!'
  ];
  // js/content/story.js: doRitualCall -> LINES — 3 реплики Грибного Зова
  var RITUAL_LINES = [
    'Тарелка-а-а! Это дед! Забирай скорее, нахер!',
    'Слышишь меня, жестянка летающая?! Дед ждёт!',
    'Эгей! Пыль свою подарил — давай, подлетай, курва!'
  ];
  // js/systems/crazy.js: фиксированные реплики событий (Voice.say)
  var CRAZY_FIXED = [
    'Так. Где мой вантуз? Пошли спасать мир.',
    'Всё, дед. Время вышло. Спать.',
    'Время поджимает, дед. Пятьдесят дней прошло.',
    'Ох, чую, лапти свои скоро увижу. Косяк где?',
    'Вот это дурь! Полный порядок.',
    'Чё это было? А, привиделось. Продолжаем!'
  ];
  // js/systems/crazy.js: onVictory — реплика победы (озвучена как cz_victory)
  var VICTORY_LINE = 'Летающая тарелка! Я знал! Дед, ты красавчик!';

  // ожидаемое распределение каналов (assets/voice/manifest.json)
  var CH_DISTRIB = { ded: 52, cartoon: 7, radio: 6, news: 3, narrator: 1, alien: 2 };
  var CH_LIST = ['ded', 'radio', 'news', 'cartoon', 'alien', 'narrator'];

  // ============================ СОСТОЯНИЕ ТЕСТА ============================

  var M = null;                 // мой снимок манифеста (fetch)
  var myIds = [], myByTextAll = {}, dupTexts = [], dupPairs = [];
  var wolfMatIds = [];          // id озвучки трёх мат-фраз wolf_near
  var cartoonId = '';           // id первой фразы мультяшки
  var radioId = 'radio_r01';    // представитель радио-канала
  var radioText = '';           // его точный текст

  // Web Speech API: счётчик вызовов speak — робот должен быть выпилен
  var ssCount = 0, ssHooked = false, ssOrig = null;

  function st() { return WS.VoiceBox.stat(); }
  function snap() { var s = st(); return { p: s.played, d: s.decoded, m: s.missed }; }
  /** Сколько фраз манифеста реально имеют расшифрованный буфер. */
  function bufCount() {
    var n = 0;
    for (var i = 0; i < myIds.length; i++) if (WS.VoiceBox._buf(myIds[i])) n++;
    return n;
  }
  function pause(ms, fn) { setTimeout(fn, ms); }

  /** Ждать появления буфера (fetch уже запущен кем-то другим). */
  function waitForBuf(id, timeoutMs, cb) {
    var t0 = Date.now();
    (function poll() {
      try {
        if (WS.VoiceBox._buf(id)) { cb(true); return; }
        if (Date.now() - t0 > (timeoutMs || 8000)) { cb(false); return; }
        setTimeout(poll, 120);
      } catch (e) { cb(false); }
    })();
  }

  /** Прогреть фразу: первый playKey стартует fetch+decode, ждём буфер. */
  function warm(id, timeoutMs, cb) {
    try { WS.VoiceBox.playKey(id); } catch (eP) { /* пусто */ }
    waitForBuf(id, timeoutMs, cb);
  }

  function warmAll(ids, timeoutMs, cb) {
    if (typeof timeoutMs === 'function') { cb = timeoutMs; timeoutMs = 8000; }
    var left = ids.length, fails = 0;
    if (!ids.length) { cb(0); return; }
    for (var i = 0; i < ids.length; i++) {
      warm(ids[i], timeoutMs, function (w) { if (!w) fails++; if (--left === 0) cb(fails); });
    }
  }

  function inArr(a, v) { for (var i = 0; i < a.length; i++) if (a[i] === v) return true; return false; }

  /** Найти id фразы по тексту (среди ВСЕХ id — тексты могут дублироваться).
   *  pref — требуемый префикс id ('' — любой), ch — требуемый канал. */
  function findId(text, pref, ch) {
    var list = myByTextAll[text] || [];
    for (var i = 0; i < list.length; i++) {
      if ((!pref || list[i].id.indexOf(pref) === 0) && (!ch || list[i].ch === ch)) return list[i].id;
    }
    return '';
  }

  // ============================== ШАГИ ТЕСТА ===============================

  var steps = [];
  function step(fn) { steps.push(fn); }
  function run(i) {
    if (i >= steps.length) { finalChecks(); fin(); return; }
    pause(15, function () {
      try { steps[i](function () { run(i + 1); }); }
      catch (e) { bug('исключение на шаге ' + i + ': ' + (e && e.message)); run(i + 1); }
    });
  }

  // ---- 0) синхронная подготовка ----
  try {
    window.confirm = function () { return true; };

    // ядро на месте
    ok('ядро озвучки на месте (VoiceBox/Thoughts/Options/matPhrases)',
       !!(WS && WS.VoiceBox && WS.Thoughts && WS.Options && WS.Data && WS.Data.matPhrases));
    ok('API VoiceBox полный (playKey/speakText/has/hasText/ready/count/stat/_buf/stopAll)',
       !!(WS.VoiceBox.playKey && WS.VoiceBox.speakText && WS.VoiceBox.has && WS.VoiceBox.hasText &&
          WS.VoiceBox.ready && WS.VoiceBox.count && WS.VoiceBox.stat && WS.VoiceBox._buf &&
          WS.VoiceBox.stopAll));
    ok('мат-банк: 30 категорий',
       Object.keys(WS.Data.matPhrases).length === 30,
       { n: Object.keys(WS.Data.matPhrases).length });

    // voiceInfo по умолчанию (ДО любых переключений)
    var vi0 = WS.Thoughts.voiceInfo();
    ok('voiceInfo() по умолчанию: master/ded/radio=true, vol=1',
       vi0.master === true && vi0.ded === true && vi0.radio === true && vi0.vol === 1, vi0);
    ok('isVoiceOn() по умолчанию true', WS.Thoughts.isVoiceOn() === true);
    ok('настройки голоса по умолчанию: voiceDed/voiceRadio=true, voiceVol=1, matMode=true',
       WS.Options.get('voiceDed') === true && WS.Options.get('voiceRadio') === true &&
       WS.Options.get('voiceVol') === 1 && WS.Options.get('matMode') === true);

    // перехват Web Speech API (робот выпилен — счётчик должен остаться нулём)
    if (typeof window.speechSynthesis !== 'undefined' && window.speechSynthesis &&
        typeof window.speechSynthesis.speak === 'function') {
      ssOrig = window.speechSynthesis.speak;
      window.speechSynthesis.speak = function () { ssCount++; };
      ssHooked = true;
    }
    ok('Web Speech API перехвачен счётчиком (или отсутствует в браузере)',
       !ssHooked || window.speechSynthesis.speak !== ssOrig);
  } catch (e0) {
    bug('фатально в подготовке: ' + (e0 && e0.message));
  }

  // ---- 1) манифест загружен, каналы, схема ----
  step(function (next) {
    var t0 = Date.now();
    (function pollReady() {
      if (WS.VoiceBox.ready() && WS.VoiceBox.count() > 0) { after(); return; }
      if (Date.now() - t0 > 6000) { after(); return; }
      setTimeout(pollReady, 150);
    })();
    function after() {
      fetch('assets/voice/manifest.json').then(function (r) {
        if (!r.ok) throw new Error('нет манифеста');
        return r.json();
      }).then(function (j) {
        M = j;
        next();
      }).catch(function (e) {
        bug('не удалось получить свой снимок манифеста: ' + (e && e.message));
        next();
      });
    }
  });

  step(function (next) {
    ok('манифест озвучки загружен (ready, count>=71)',
       WS.VoiceBox.ready() && WS.VoiceBox.count() >= 71, { n: WS.VoiceBox.count() });
    var ph = (M && M.phrases) || {};
    myIds = Object.keys(ph);
    ok('счётчик VoiceBox совпадает с файлом манифеста (71 фраза)',
       WS.VoiceBox.count() === 71 && myIds.length === 71, { box: WS.VoiceBox.count(), файл: myIds.length });

    // каналы: каждый id -> канал из списка 6, все 6 представлены
    var chCount = {}, badCh = [], badSchema = [], i, id, p;
    for (i = 0; i < myIds.length; i++) {
      id = myIds[i]; p = ph[id];
      if (!inArr(CH_LIST, p.ch)) badCh.push(id + ':' + p.ch);
      chCount[p.ch] = (chCount[p.ch] || 0) + 1;
      if (p.f !== id + '.mp3' || typeof p.t !== 'string' || !p.t.trim() || !p.ch) badSchema.push(id);
      (myByTextAll[p.t] = myByTextAll[p.t] || []).push({ id: id, ch: p.ch });
    }
    // дубликаты текстов (один текст -> несколько id)
    for (i = 0; i < myIds.length; i++) {
      var tt = ph[myIds[i]].t;
      if (myByTextAll[tt].length > 1 && dupTexts.indexOf(tt) < 0) dupTexts.push(tt);
    }
    ok('каждому id соответствует канал из списка 6 (ded/radio/news/cartoon/alien/narrator)',
       badCh.length === 0, { нарушений: badCh.length });
    var all6 = true;
    for (i = 0; i < CH_LIST.length; i++) if (!chCount[CH_LIST[i]]) all6 = false;
    ok('все 6 каналов озвучки представлены', all6, chCount);
    ok('распределение каналов: ded=52, cartoon=7, radio=6, news=3, narrator=1, alien=2',
       chCount.ded === CH_DISTRIB.ded && chCount.cartoon === CH_DISTRIB.cartoon &&
       chCount.radio === CH_DISTRIB.radio && chCount.news === CH_DISTRIB.news &&
       chCount.narrator === CH_DISTRIB.narrator && chCount.alien === CH_DISTRIB.alien, chCount);
    ok('схема фраз: f === "<id>.mp3", текст непустой, канал задан (71/71)',
       badSchema.length === 0, { нарушений: badSchema.length });

    // дубликаты текстов ЗАПРЕЩЕНЫ (фикс FV-4): byText резолвит только один id,
    // второй mp3 с тем же текстом — мёртвый груз, никогда не звучит через speakText
    dupPairs = [];
    for (i = 0; i < dupTexts.length; i++) {
      var t = dupTexts[i], pair = [];
      for (var j = 0; j < myIds.length; j++) if (ph[myIds[j]].t === t) pair.push(myIds[j]);
      dupPairs.push(t + ' -> (' + pair.join(' | ') + ')');
    }
    ok('тексты манифеста уникальны (дубликатов 0, byText однозначен)',
       dupTexts.length === 0, { дубликатов: dupTexts.length, подробности: dupPairs.slice(0, 3) });
    next();
  });

  // ---- 2) существование всех файлов фраз ----
  step(function (next) {
    var ph = (M && M.phrases) || {};
    var jobs = [], ids = [];
    for (var i = 0; i < myIds.length; i++) {
      (function (id) {
        jobs.push(fetch('assets/voice/' + ph[id].f).then(function (r) {
          if (!r.ok) return { id: id, bad: 'HTTP ' + r.status };
          return r.arrayBuffer().then(function (ab) {
            return { id: id, bad: ab.byteLength < 1000 ? 'пустой файл (' + ab.byteLength + ' Б)' : null };
          });
        }).catch(function (e) { return { id: id, bad: 'сетевая ошибка' }; }));
        ids.push(id);
      })(myIds[i]);
    }
    Promise.all(jobs).then(function (res) {
      var bad = [];
      for (var k = 0; k < res.length; k++) if (res[k] && res[k].bad) bad.push(res[k].id + ': ' + res[k].bad);
      ok('все 71 файла фраз существуют (fetch 200): assets/voice/<id>.mp3',
         bad.length === 0, { повреждено: bad.slice(0, 5) });
      ok('все файлы фраз непустые (>= 1 КБ)', bad.length === 0, { n: res.length });
      // фикс FV-4: мёртвые дубли удалены и с диска — сервер должен отдать 404
      var dead = ['cz_joint', 'cz_timeup', 'cz_respawn'];
      var deadJobs = [];
      for (var d = 0; d < dead.length; d++) {
        (function (pid) {
          deadJobs.push(fetch('assets/voice/' + pid + '.mp3').then(function (r) {
            return r.ok ? pid : null;
          }).catch(function () { return null; }));
        })(dead[d]);
      }
      Promise.all(deadJobs).then(function (alive) {
        var stillFiles = [], inManifest = [];
        for (var q = 0; q < alive.length; q++) if (alive[q]) stillFiles.push(alive[q]);
        for (var w = 0; w < dead.length; w++) {
          if (M && M.phrases && M.phrases[dead[w]]) inManifest.push(dead[w]);
        }
        ok('мёртвые дубли cz_joint/cz_timeup/cz_respawn вычищены (нет в манифесте, mp3 → 404)',
           stillFiles.length === 0 && inManifest.length === 0,
           { остались_файлы: stillFiles, остались_в_манифесте: inManifest });
        next();
      });
    });
  });

  // ---- 3) ключевой инвариант: текст -> озвучка ----
  step(function (next) {
    var ph = (M && M.phrases) || {};
    var noHas = [], noText = [], i, id;
    for (i = 0; i < myIds.length; i++) {
      id = myIds[i];
      if (!WS.VoiceBox.has(id)) noHas.push(id);
      if (!WS.VoiceBox.hasText(ph[id].t)) noText.push(id);
    }
    ok('has(id) верен для всех 71 фраз манифеста', noHas.length === 0, { промахи: noHas.slice(0, 5) });
    ok('hasText(текст) верен для всех 71 фраз (индекс byText построен)',
       noText.length === 0, { промахи: noText.slice(0, 5) });

    // мат-банк: все 30 категорий, каждая фраза озвучена в канале ded
    var M2 = WS.Data.matPhrases, cats = 0, phrases = 0, misses = [], chMiss = [];
    for (var key in M2) {
      if (!M2.hasOwnProperty(key)) continue;
      cats++;
      for (var q = 0; q < M2[key].length; q++) {
        phrases++;
        var txt = M2[key][q];
        if (!WS.VoiceBox.hasText(txt)) { misses.push(key + '[' + q + ']'); continue; }
        if (!findId(txt, 'mat_', 'ded')) chMiss.push(key + '[' + q + ']');
      }
    }
    ok('МАТ-БАНК: 30 категорий, 36 фраз — ВСЕ озвучены (hasText=true, дед не молчит)',
       cats === 30 && phrases === 36 && misses.length === 0, { категорий: cats, фраз: phrases, промахи: misses });
    ok('мат-фразы лежат в манифесте с id "mat_*" и каналом ded',
       chMiss.length === 0, { нарушений: chMiss.slice(0, 5) });
    wolfMatIds = [];
    for (var w = 0; w < M2.wolf_near.length; w++) {
      var wid = findId(M2.wolf_near[w], 'mat_', 'ded');
      if (wid) wolfMatIds.push(wid);
    }
    next();
  });

  // ---- 4) фиксированные реплики crazy.js / story.js ----
  step(function (next) {
    var i, bad;
    bad = [];
    for (i = 0; i < BANISH_LINES.length; i++) if (!WS.VoiceBox.hasText(BANISH_LINES[i])) bad.push(i);
    ok('BANISH_LINES (crazy.js, 9 реплик изгнания): все в банке озвучки',
       bad.length === 0, { промахи: bad });
    bad = [];
    for (i = 0; i < BANISH_LINES.length; i++) if (!findId(BANISH_LINES[i], '', 'ded')) bad.push(i);
    ok('реплики изгнания озвучены каналом ded', bad.length === 0, { нарушений: bad });

    bad = [];
    for (i = 0; i < CARTOON_TAUNTS.length; i++) if (!WS.VoiceBox.hasText(CARTOON_TAUNTS[i])) bad.push(i);
    ok('CARTOON_TAUNTS (crazy.js, 7 прощаний мультяшек): все в банке озвучки',
       bad.length === 0, { промахи: bad });
    bad = [];
    for (i = 0; i < CARTOON_TAUNTS.length; i++) if (!findId(CARTOON_TAUNTS[i], '', 'cartoon')) bad.push(i);
    ok('реплики мультяшек озвучены каналом cartoon', bad.length === 0, { нарушений: bad });
    cartoonId = findId(CARTOON_TAUNTS[0], '', 'cartoon');

    bad = [];
    for (i = 0; i < RITUAL_LINES.length; i++) if (!WS.VoiceBox.hasText(RITUAL_LINES[i])) bad.push(i);
    ok('LINES Грибного Зова (story.js doRitualCall, 3 реплики): все в банке озвучки',
       bad.length === 0, { промахи: bad });

    bad = [];
    for (i = 0; i < CRAZY_FIXED.length; i++) if (!WS.VoiceBox.hasText(CRAZY_FIXED[i])) bad.push(i);
    ok('фиксированные реплики crazy.js (вантуз/время/лапти/дурь/привиделось): 6/6 в банке',
       bad.length === 0, { промахи: bad });

    // реплика победы (crazy.js onVictory) — озвучена с фикса FV (cz_victory)
    ok('реплика победы «Летающая тарелка! Я знал! Дед, ты красавчик!» есть в банке (hasText)',
       WS.VoiceBox.hasText(VICTORY_LINE));
    var vic = (M && M.phrases && M.phrases.cz_victory) || null;
    ok('реплика победы в манифесте как cz_victory: текст буква-в-букву, канал ded, файл cz_victory.mp3',
       !!(vic && vic.t === VICTORY_LINE && vic.ch === 'ded' && vic.f === 'cz_victory.mp3'), vic);
    next();
  });

  // ---- 5) холодный старт: префетч ловит интро ----
  step(function (next) {
    // ДО старта партии эти фразы никто, кроме prefetchCommon(), не запрашивал:
    // буфер на месте = интро поднято именно префетчем (фикс FV-1)
    waitForBuf('narrator_intro', 8000, function (w1) {
      waitForBuf('cz_start', 8000, function (w2) {
        ok('префетч ловит narrator_intro: буфер прогрет ДО старта партии', w1);
        ok('префетч ловит cz_start: буфер прогрет ДО старта партии', w2);
        var preWarm = !!(w1 && w2);
        var s0 = snap();
        var r = WS.Main.newGame('telegraph', ['frostproof', 'patient'], 4242);
        ok('newGame стартует (сид 4242, телеграфист, морзе/терпение)', r === true);
        ok('партия жива', !!(WS.G && WS.G.running));
        var s1 = snap();
        var dMissed = s1.m - s0.m;
        ok('первый старт: интро без промахов (missed не растёт)',
           dMissed === 0, { промахов: dMissed, префетч_до_старта: preWarm });
        ok('рассказчик ЗВУЧИТ с первого старта (played +1, а не со второго раза)',
           s1.p === s0.p + 1, { было: s0.p, стало: s1.p });
        ok('буферы интро на месте и после старта',
           !!(WS.VoiceBox._buf('narrator_intro') && WS.VoiceBox._buf('cz_start')));
        next();
      });
    });
  });

  // ---- 6) playKey: прогрев буфера, воспроизведение, статистика ----
  step(function (next) {
    warm('banish_1', 8000, function (w) {
      ok('прогрев banish_1: буфер декодирован (_buf верен)', w);
      var buf = WS.VoiceBox._buf('banish_1');
      ok('буфер banish_1 — настоящий AudioBuffer с данными',
         !!(buf && buf.duration > 0 && buf.numberOfChannels >= 1), { dur: buf && buf.duration });
      var s0 = snap();
      var r = WS.VoiceBox.playKey('banish_1');
      var s1 = snap();
      ok('playKey("banish_1") после прогрева → true', r === true);
      ok('stat().played вырос (фраза звучит)', s1.p === s0.p + 1, { было: s0.p, стало: s1.p });
      ok('stat().decoded >= 1 (mp3 реально декодирован)', st().decoded >= 1, st());
      var s2 = snap();
      var r2 = WS.VoiceBox.speakText('Изыди, мультяшка, бляха-муха!');
      var s3 = snap();
      ok('speakText по точному тексту реплики → true', r2 === true);
      ok('speakText по точному тексту проигрывает фразу (played +1)',
         s3.p === s2.p + 1, { было: s2.p, стало: s3.p });
      ok('speakText тримит пробелы по краям → true',
         WS.VoiceBox.speakText('   Изыди, мультяшка, бляха-муха!  ') === true);
      ok('playKey несуществующего id → false', WS.VoiceBox.playKey('t3_net_takoy') === false);
      ok('speakText несуществующего текста → false',
         WS.VoiceBox.speakText('Нет такой фразы в банке озвучки.') === false);
      ok('has/hasText не зависят от буферов и гейтов',
         WS.VoiceBox.has('banish_1') && !WS.VoiceBox.has('t3_net_takoy'));
      next();
    });
  });

  // ---- 7) радио-представитель: первый вызов = прогрев, decoded ----
  step(function (next) {
    ok('radio_r01 в манифесте (канал radio)',
       WS.VoiceBox.has(radioId) && !!(M && M.phrases[radioId] && M.phrases[radioId].ch === 'radio'));
    radioText = (M.phrases[radioId] || {}).t || '';
    var b0 = bufCount();
    var s0 = snap();
    var r0 = WS.VoiceBox.playKey(radioId);
    var s1 = snap();
    ok('первый playKey("radio_r01") без буфера → false (прогрев fetch+decode)', r0 === false);
    ok('промах учтён: stat().missed вырос, загрузка стартовала', s1.m === s0.m + 1, { было: s0.m, стало: s1.m });
    waitForBuf(radioId, 8000, function (w) {
      ok('после прогрева буфер radio_r01 на месте', w);
      var dDec = st().decoded - s0.d;
      var dBuf = bufCount() - b0;
      ok('decodeAudioData реально декодирует mp3 в headless (появился буфер)',
         dBuf >= 1, { новых_буферов: dBuf });
      ok('фраза засчитана РОВНО один раз (decoded == приросту буферов, без двойного счёта)',
         dDec === dBuf, { прирост_decoded: dDec, прирост_буферов: dBuf });
      ok('сводка счётчика: decoded равен числу буферов (legacy-колбэк и промис не двойчат)',
         st().decoded === bufCount(), { decoded: st().decoded, буферов: bufCount() });
      var s2 = snap();
      var r2 = WS.VoiceBox.playKey(radioId);
      ok('повторный playKey("radio_r01") после прогрева → true', r2 === true);
      next();
    });
  });

  // ---- 8) гейты настроек ----
  step(function (next) {
    // прогреваем мультяшку и тарелку (не из префетча) — гейты проверяем на готовых буферах
    warmAll([cartoonId, 'alien_heard'], 8000, function () {
      WS.Options.set('voiceDed', false);
      ok('voiceDed=false → playKey("banish_1") не звучит (false)',
         WS.VoiceBox.playKey('banish_1') === false);
      ok('voiceDed=false → speakText реплики деда не звучит (false)',
         WS.VoiceBox.speakText(BANISH_LINES[0]) === false);
      ok('voiceDed=false → канал cartoon молчит (мультяшки гейтятся «Голосом деда», фикс FV-3)',
         WS.VoiceBox.playKey(cartoonId) === false, { cartoon: cartoonId });
      ok('voiceDed=false → канал narrator молчит (рассказчик гейтится «Голосом деда»)',
         WS.VoiceBox.playKey('narrator_intro') === false);
      ok('voiceDed=false → канал alien молчит (тарелка гейтится «Голосом деда»)',
         WS.VoiceBox.playKey('alien_heard') === false);
      WS.Options.set('voiceRadio', false);
      ok('voiceRadio=false → playKey("radio_r01") не звучит (false)',
         WS.VoiceBox.playKey(radioId) === false);
      WS.Options.set('voiceVol', 0);
      ok('voiceVol=0 → playKey("banish_1") не звучит (false)',
         WS.VoiceBox.playKey('banish_1') === false);
      ok('voiceVol=0 глушит ВСЕ каналы (cartoon тоже false)',
         WS.VoiceBox.playKey(cartoonId) === false);
      WS.Options.set('voiceVol', 1);
      WS.Options.set('voiceDed', true);
      ok('вернули voiceDed=true (voiceVol=1) → playKey("banish_1") снова звучит',
         WS.VoiceBox.playKey('banish_1') === true);
      ok('voiceDed=true → рассказчик снова звучит (гейт реально отпустил)',
         WS.VoiceBox.playKey('narrator_intro') === true);
      WS.Options.set('voiceRadio', true);
      ok('вернули voiceRadio=true → playKey("radio_r01") снова звучит',
         WS.VoiceBox.playKey(radioId) === true);
      var vi = WS.Thoughts.voiceInfo();
      ok('voiceInfo() отражает включённые тумблеры (ded/radio=true, vol=1)',
         vi.ded === true && vi.radio === true && vi.vol === 1, vi);
      next();
    });
  });

  // ---- 9) мастер-выключатель setVoiceOn ----
  step(function (next) {
    var off = WS.Thoughts.setVoiceOn(false);
    ok('setVoiceOn(false) вернул false и погасил мастер',
       off === false && WS.Thoughts.isVoiceOn() === false);
    var vi = WS.Thoughts.voiceInfo();
    ok('мастер синхронизировал тумблеры (voiceInfo: master/ded/radio=false)',
       vi.master === false && vi.ded === false && vi.radio === false, vi);
    ok('настройки синхронизированы (voiceDed/voiceRadio=false)',
       WS.Options.get('voiceDed') === false && WS.Options.get('voiceRadio') === false);
    var s0 = snap();
    var txt = WS.Thoughts.think('wolf_near', { prio: 3, cd: 0.001 });
    ok('при выключенном мастере мысль всё равно возникает (текст возвращён)',
       typeof txt === 'string' && txt.length > 0, { мысль: txt });
    var bub = document.getElementById('ws-thought');
    ok('пузырь мысли #ws-thought остаётся виден (молчание касается только речи)',
       !!(bub && !bub.classList.contains('hidden')));
    ok('в пузыре — та же мысль в кавычках',
       !!(bub && bub.textContent.indexOf(txt) >= 0));
    pause(900, function () {
      var s1 = snap();
      ok('мастер выключен: stat().played НЕ растёт (голос молчит)',
         s1.p === s0.p, { было: s0.p, стало: s1.p });
      var on = WS.Thoughts.setVoiceOn(true);
      ok('setVoiceOn(true) вернул мастера и тумблеры',
         on === true && WS.Thoughts.isVoiceOn() === true &&
         WS.Options.get('voiceDed') === true && WS.Options.get('voiceRadio') === true);
      next();
    });
  });

  // ---- 10) мат-режим ----
  step(function (next) {
    warmAll(wolfMatIds, 8000, function () {
      WS.Options.set('matMode', true);
      var s0 = snap();
      var t1 = WS.Thoughts.think('wolf_near', { prio: 3, cd: 0.001 });
      var s1 = snap();
      ok('matMode=true: think("wolf_near") вернул фразу ИЗ МАТ-БАНКА',
         inArr(WS.Data.matPhrases.wolf_near, t1), { фраза: t1 });
      ok('матерная фраза есть в банке озвучки (hasText=true)', WS.VoiceBox.hasText(t1));
      ok('матерная фраза ЗВУЧИТ (played +1 после прогрева)',
         s1.p === s0.p + 1, { было: s0.p, стало: s1.p });
      WS.Options.set('matMode', false);
      pause(30, function () {
        var t2 = WS.Thoughts.think('wolf_near', { prio: 3, cd: 0.001 });
        ok('matMode=false: think("wolf_near") вернул фразу из ОБЫЧНОГО банка',
           inArr(WS.Thoughts._db.wolf_near, t2), { фраза: t2 });
        ok('обычная фраза без мата (в мат-банке её нет)',
           !inArr(WS.Data.matPhrases.wolf_near, t2));
        ok('у обычной фразы нет файла озвучки (speakText → false, только пузырь)',
           WS.VoiceBox.speakText(t2) === false);
        WS.Options.set('matMode', true);
        ok('matMode вернули: true', WS.Options.get('matMode') === true);
        next();
      });
    });
  });

  // ---- 11) радио-диктор: radioSay ----
  step(function (next) {
    ok('текст радио-передачи взят из манифеста (radio_r01)', radioText.length > 20);
    var s0 = snap();
    WS.Thoughts.radioSay(radioText, 'Радио · тест T-3', 100, 100);
    var s1 = snap();
    var rb = document.getElementById('ws-radio-bubble');
    ok('radioSay показывает пузырь радио #ws-radio-bubble',
       !!(rb && !rb.classList.contains('hidden')));
    ok('в пузыре радио — текст передачи и источник',
       !!(rb && rb.textContent.indexOf(radioText.slice(0, 30)) >= 0 &&
          rb.textContent.indexOf('Радио · тест T-3') >= 0));
    ok('радио-диктор ЗВУЧИТ (voiceRadio=true, played +1)',
       s1.p === s0.p + 1, { было: s0.p, стало: s1.p });
    WS.Options.set('voiceRadio', false);
    var s2 = snap();
    WS.Thoughts.radioSay(radioText, 'Радио · тест T-3', 100, 100);
    var s3 = snap();
    ok('voiceRadio=false: диктор молчит (played не растёт)',
       s3.p === s2.p, { было: s2.p, стало: s3.p });
    rb = document.getElementById('ws-radio-bubble');
    ok('при выключенном дикторе текст передачи всё равно виден',
       !!(rb && !rb.classList.contains('hidden') && rb.textContent.indexOf(radioText.slice(0, 30)) >= 0));
    WS.Options.set('voiceRadio', true);
    next();
  });

  // ---- 12) экран настроек ----
  step(function (next) {
    WS.Options.show();
    ok('экран настроек открылся (isOpen)', WS.Options.isOpen() === true);
    var rows = document.querySelectorAll('.ws-options-row');
    ok('экран настроек построен (строк >= 15)', rows.length >= 15, { строк: rows.length });
    var labels = [];
    for (var i = 0; i < rows.length; i++) {
      var lab = rows[i].querySelector('.ws-options-label');
      if (lab) labels.push(lab.textContent);
    }
    function hasLabel(sub) {
      for (var k = 0; k < labels.length; k++) if (labels[k].indexOf(sub) >= 0) return true;
      return false;
    }
    ok('настройки: строка «Голос деда (студийная озвучка)»', hasLabel('Голос деда (студийная озвучка)'));
    ok('настройки: строка «Голоса радио и новостей»', hasLabel('Голоса радио и новостей'));
    ok('настройки: строка «Громкость голоса»', hasLabel('Громкость голоса'));
    ok('настройки: строка «Угарный матерной режим»', hasLabel('Угарный матерной режим'));
    WS.Options.hide();
    ok('экран настроек скрыт (hide)', WS.Options.isOpen() === false);
    var panel = document.getElementById('ws-options');
    ok('панель настроек в DOM с классом hidden',
       !!(panel && panel.classList.contains('hidden')));
    next();
  });

  // ---- 13) Web Speech API выпилен полностью ----
  step(function (next) {
    var s0 = snap();
    var r = WS.Main.newGame('telegraph', ['frostproof', 'patient'], 4242);
    ok('повторный newGame (тот же сид) стартует', r === true);
    var s1 = snap();
    ok('повторный newGame: рассказчик снова звучит (played +1)',
       s1.p === s0.p + 1, { было: s0.p, стало: s1.p });
    // мысли/речь/радио — все пути речи, затем ждём отложенную реплику старта (5.2с)
    WS.Thoughts.think('hunger', { prio: 3, cd: 0.001 });
    WS.Thoughts.think('freezing', { prio: 3, cd: 0.001 });
    WS.Thoughts.say(BANISH_LINES[2], 't3_probe', { prio: 3, cd: 0.001 });
    WS.Thoughts.radioSay(radioText, 'Радио · тест T-3', 100, 100);
    WS.Thoughts.speak(CRAZY_FIXED[4]);
    pause(5600, function () {
      ok('Web Speech API НЕ используется: speechSynthesis.speak вызван 0 раз',
         ssCount === 0, { вызовов: ssCount });
      ok('после всех речей партия жива', !!(WS.G && WS.G.running));
      next();
    });
  });

  // ---- 14) финальная сводка и уборка ----
  function finalChecks() {
    var s = st();
    ok('сводка: фраз прозвучало >= 8 (played)', s.played >= 8, s);
    ok('сводка: буферов декодировано >= 16 (decoded)', s.decoded >= 16, s);
    ok('сводка: промахи зафиксированы (missed >= 3: прогревы вне префетча — радио/мультяшка/тарелка)',
       s.missed >= 3, s);
    try { WS.VoiceBox.stopAll(); ok('stopAll() не падает', true); }
    catch (eS) { ok('stopAll() не падает', false, { ошибка: eS && eS.message }); }

    // уборка: вернуть настройки и мастера, снять перехват speak
    try {
      WS.Thoughts.setVoiceOn(true);
      WS.Options.set('voiceDed', true);
      WS.Options.set('voiceRadio', true);
      WS.Options.set('voiceVol', 1);
      WS.Options.set('matMode', true);
      WS.Options.hide();
    } catch (eC) { /* пусто */ }
    if (ssHooked && ssOrig) { try { window.speechSynthesis.speak = ssOrig; } catch (eR) { /* пусто */ } }
    ok('настройки голоса возвращены к Default (ded/radio=true, vol=1, matMode=true)',
       WS.Options.get('voiceDed') === true && WS.Options.get('voiceRadio') === true &&
       WS.Options.get('voiceVol') === 1 && WS.Options.get('matMode') === true);
    ok('перехват speechSynthesis снят', !ssHooked || window.speechSynthesis.speak === ssOrig);
  }

  run(0);

  // страховка: если цепочка шагов оборвалась (асинхронный крах) — не висеть 180с
  setTimeout(function () {
    if (!T.done) {
      bug('тест не завершился за 170с — цепочка шагов оборвана (см. предыдущие FAIL)');
      fin();
    }
  }, 170000);
})();
