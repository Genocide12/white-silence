/**
 * voice.js — ОЗВУЧКА ГОЛОСОМ (Web Speech API, speechSynthesis).
 *
 * Принципы:
 *  - говорим ТОЛЬКО важное: угроза жизни, смена дня/ночи, находки, финал;
 *  - не болтаем без умолчанию? наоборот: включено по умолчанию, но выключается
 *    одной галкой в настройках («Озвучка событий»);
 *  - фразы — НЕ повторяемся: у каждого события банк из 3-5 вариантов,
 *    выбор детерминированный (счётчик), чтобы демо было повторяемым;
 *  - приоритеты: critical (гипотермия, зверь рядом) перебивает болтовню,
 *    flavor (приветствие дня) ждёт своей очереди; очередь короткая (3),
 *    старое выбрасывается — молчание лучше отставания от картины.
 *
 * Связи: options.js (галка voice), demo.js (озвучка журнала), hud.js (чип).
 */
(function () {
  'use strict';

  var enabled = true;          // включён ли TTS вообще
  var rate = 1.02;             // темп речи
  var queue = [];              // [{text, prio}]
  var speaking = false;
  var voiceRu = null;
  var triedVoices = 0;
  var counter = 0;             // детерминированный выбор вариантов
  var lastByKind = {};         // kind -> ms (антиспам: не чаще раза в N сек)

  // минимальные паузы между репликами одного типа, сек
  var COOLDOWN = {
    day: 300, night: 300, cold: 90, threat: 45, hunger: 240, thirst: 240,
    loot: 20, craft: 30, misc: 60, victory: 0, death: 0, demo: 15
  };

  // ====================================================================
  //  БАНКИ ФРАЗ (умные и весёлые, тон северного юмора 1917 года)
  // ====================================================================

  var BANK = {
    // утро нового дня
    day: [
      'День {n}. Контора открыта, мороз тоже.',
      'День {n}. Солнце не встанет, а счётчик — встанет.',
      'День {n}. Север неспешен, но верен расписанию.',
      'День {n}. Живём. Уже достижение.',
      'День {n}. До парохода всё ближе — и всё холоднее.'
    ],
    // ночь настала
    night: [
      'Ночь. Волки работают сменой, я — выживанием.',
      'Ночь на дворе. Печь — лучший собеседник.',
      'Темнеет. По расписанию — на {temp} градусов.',
      'Ночь. Спички считаю, как чиновник — казённые деньги.'
    ],
    // холод / гипотермия
    cold: [
      'Холод берёт своё. Нужно тепло, немедленно.',
      'Температура тела падает. Тепло. Сейчас же.',
      'Так и до обморожения недалеко. Печь или костёр!',
      'Мороз стучит по организму — пора греться.',
      'Если не согреться — север закончит начатое.'
    ],
    // угроза рядом
    threat: [
      'Рядом зверь! Диалога не будет — прятаться!',
      'Хищник рядом. Вкусы у нас разные: я — вкуснее.',
      'Осторожно: зверь неподалёку. В дом, быстро!',
      'Зверь учуял. Север присылает за мной.'
    ],
    // голод
    hunger: [
      'Голод пришёл. Кладовая пуста — значит, на обыск.',
      'Живот подводит. Еда или беда.',
      'Голод — плохой советчик. Идём искать провизию.'
    ],
    // жажда
    thirst: [
      'Жажда. Воды нет — топить снег.',
      'Пересохло. Зима кругом, а пить нечего, вот ирония.',
      'Вода кончилась. Снег — сырьё, печь — завод.'
    ],
    // удачная находка
    loot: [
      'Находка! Опись прилагается.',
      'Вот это добыча. Не барыш, а жалованье.',
      'Пригодится. Всё пригодится.'
    ],
    // крафт
    craft: [
      'Готово. Гильдия не признала, а мороз признал.',
      'Изготовлено. Руки ремесло помнят.',
      'Смастерил. Свет тоже валюта.'
    ],
    // враг изгнан
    expel: [
      'Мультяшка изгнана! Счётчик растёт.',
      'Очередной озорник ретировался. Изгнано: {n}.',
      'Изгнал мультяшку. Север уважает настойчивых.',
      'Мультяшка унесла ноги. {n} за мной.'
    ],
    // финал
    victory: [
      'Пароход пришёл! По расписанию, как честный поезд. Победа.',
      'Шестьдесят дней — и расписание победило. Пароход!'
    ],
    death: [
      'Герой погиб. Север не договаривает.',
      'Всё. До парохода не дожил. Журнал скажет за меня.'
    ]
  };

  // ====================================================================
  //  ДВИЖОК
  // ====================================================================

  function synth() {
    return (typeof window !== 'undefined' && window.speechSynthesis) || null;
  }

  function pickVoice() {
    var s = synth();
    if (!s) return null;
    var list = s.getVoices() || [];
    if (!list.length) return null;
    // русский голос: точный мэтч, затем любой ru
    var exact = null, any = null;
    for (var i = 0; i < list.length; i++) {
      var v = list[i];
      var lang = (v.lang || '').toLowerCase().replace('_', '-');
      if (lang === 'ru-ru') { exact = v; break; }
      if (lang.indexOf('ru') === 0 && !any) any = v;
    }
    return exact || any || null;
  }

  function refreshVoice() {
    voiceRu = pickVoice();
    var s = synth();
    if (s && s.onvoiceschanged !== undefined) {
      s.onvoiceschanged = function () { voiceRu = pickVoice(); };
    }
  }

  /** Детерминированный выбор варианта (демо повторяемо). */
  function pick(arr) {
    counter++;
    return arr[counter % arr.length];
  }

  /** Подставить {n}, {temp} и т.п. */
  function fmt(text, vars) {
    if (!vars) return text;
    return String(text).replace(/\{(\w+)\}/g, function (m, k) {
      return (vars && vars[k] !== undefined) ? vars[k] : m;
    });
  }

  /**
   * Сказать фразу. kind — тип события (банк + антиспам), prio:
   *   2 = critical (перебивает очередь), 1 = обычное, 0 = фон.
   */
  function say(text, kind, prio, vars) {
    if (!enabled || !synth()) return;
    kind = kind || 'misc';
    // антиспам
    var now = Date.now();
    var cd = (COOLDOWN[kind] !== undefined ? COOLDOWN[kind] : 60) * 1000;
    if (cd > 0 && lastByKind[kind] && now - lastByKind[kind] < cd) return;
    lastByKind[kind] = now;

    var line = fmt(text, vars);
    if (prio === 2) queue = [{ text: line, prio: 2 }];
    else {
      if (queue.length >= 3) queue.shift();
      queue.push({ text: line, prio: prio || 1 });
    }
    pump();
  }

  /** Сказать случайную фразу из банка события. */
  function sayFrom(bank, kind, prio, vars) {
    var arr = BANK[bank];
    if (!arr || !arr.length) return;
    say(pick(arr), kind, prio, vars);
  }

  function pump() {
    var s = synth();
    if (speaking || !queue.length || !s) return;
    var item = queue.shift();
    try {
      var u = new SpeechSynthesisUtterance(item.text);
      u.lang = 'ru-RU';
      if (voiceRu) u.voice = voiceRu;
      u.rate = rate * (item.prio === 2 ? 1.12 : 1);
      u.pitch = 1;
      u.volume = 0.95;
      u.onend = u.onerror = function () {
        speaking = false;
        // следующая реплика — через короткую паузу, не тараторим
        setTimeout(pump, 350);
      };
      speaking = true;
      s.speak(u);
    } catch (e) {
      speaking = false;
    }
  }

  // ====================================================================
  //  СОБЫТИЯ ИГРЫ → РЕЧЬ
  // ====================================================================

  function wireEvents() {
    // новый день — утренняя сводка
    WS.Ev.on('time:day', function () {
      if (!playable()) return;
      sayFrom('day', 'day', 1, { n: WS.Time ? WS.Time.day() : '?' });
    });
    // ночь
    WS.Ev.on('time:night', function () {
      if (!playable()) return;
      sayFrom('night', 'night', 1, { temp: Math.round(outTemp()) });
    });
    // гипотермия (стадии temperature.js)
    WS.Ev.on('player:tempstage', function (d) {
      if (!playable() || !d) return;
      if (d.stage >= 2) sayFrom('cold', 'cold', 2);
    });
    // зверь рядом (шум/спот wolf.js)
    WS.Ev.on('ai:threat', function (d) {
      if (!playable() || !d) return;
      sayFrom('threat', 'threat', 2);
    });
    // голод/жажда
    WS.Ev.on('need:critical', function (d) {
      if (!playable() || !d) return;
      if (d.kind === 'hunger') sayFrom('hunger', 'hunger', 1);
      else if (d.kind === 'thirst') sayFrom('thirst', 'thirst', 1);
    });
    // редкая находка
    WS.Ev.on('loot:rare', function () {
      if (!playable()) return;
      sayFrom('loot', 'loot', 1);
    });
    // крафт
    WS.Ev.on('craft:done', function () {
      if (!playable()) return;
      sayFrom('craft', 'craft', 0);
    });
    // изгнание мультяшки
    WS.Ev.on('imp:expelled', function (d) {
      if (!playable()) return;
      sayFrom('expel', 'misc', 1, { n: (d && d.total) || 1 });
    });
    // финалы
    WS.Ev.on('game:victory', function () { sayFrom('victory', 'victory', 2); });
    WS.Ev.on('player:die', function () { sayFrom('death', 'death', 2); });
  }

  function playable() {
    try {
      return !!(WS.G && WS.G.running && WS.G.player);
    } catch (e) { return false; }
  }

  function outTemp() {
    try { return WS.Weather.tempOutside(); } catch (e) { return -15; }
  }

  // ====================================================================
  //  НАСТРОЙКИ
  // ====================================================================

  function setEnabled(v) {
    enabled = !!v;
    if (!enabled) {
      queue = [];
      var s = synth();
      if (s) { try { s.cancel(); } catch (e) { /* пусто */ } }
      speaking = false;
    }
  }

  // ====================================================================
  //  BOOT
  // ====================================================================

  WS.boot(function initVoice() {
    enabled = (WS.Options && WS.Options.get) ? (WS.Options.get('voice') !== false) : true;
    refreshVoice();
    // голоса в Chrome подгружаются асинхронно — повторим
    setTimeout(refreshVoice, 900);
    setTimeout(refreshVoice, 2500);
    wireEvents();
    WS.log('voice: озвучка готова (' + (synth() ? 'speechSynthesis' : 'недоступен') + ')');
  }, 'voice:init');

  WS.def('Voice', {
    say: say,
    sayFrom: sayFrom,
    setEnabled: setEnabled,
    isEnabled: function () { return enabled; },
    /** Проверка живости (для тестов): синтез есть и голос найден/ищется. */
    status: function () {
      return {
        supported: !!synth(),
        voice: voiceRu ? voiceRu.name : null,
        queued: queue.length,
        banks: (function () { var n = 0; for (var k in BANK) n += BANK[k].length; return n; })()
      };
    }
  });
})();
