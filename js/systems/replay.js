/**
 * ЗАПИСИ ПРОХОЖДЕНИЙ — «киноплёнка» для Кинозала Деда.
 *
 * Пока бот (рой агентов) играет партию, этот модуль пишет компактную
 * хронологию: позиции деда (сэмплы по игровым минутам), мысли, действия,
 * статистику, главы и финал. Экспорт — JSON; записи хранятся локально
 * (localStorage) и поставляются с игрой (recordings/*.json).
 *
 * Формат события: [минута, код, ...]
 *   0 — позиция: x, y (округлены до 0.1)
 *   1 — мысль деда: текст
 *   2 — действие: текст, класс (good/bad/warn/info)
 *   3 — статистика: HP, грибная энергия
 *   4 — глава: текст
 *   5 — финал: 'victory'|'death'|'stop', день
 *
 * Связи: ui/demo.js (рой пишет журнал через note), ui/cinema.js (читает),
 * scripts/swarm_run.mjs (выгружает записи в файлы).
 */
(function () {
  'use strict';

  var IDX_KEY = 'wsReplaysIdx1';        // список локальных записей
  var DATA_KEY = 'wsReplay1_';          // префикс самих записей
  var MAX_LOCAL = 4;                    // локальных записей (лимит localStorage)
  var POS_EVERY = 3;                    // игровой интервал сэмплов позиции (мин)
  var POS_CAP = 14000;                  // потолок сэмплов (длинные марафоны реже)
  var IDX_URL = 'recordings/index.json';// bundled-записи из репозитория

  var R = {
    active: false,
    meta: null,           // {name, seed, prof, strategy, at}
    ev: [],               // события
    posN: 0,              // сколько сэмплов позиции уже записали
    lastPosMin: -1,
    lastStatMin: -1
  };

  // ====================================================================
  //  ЗАПИСЬ
  // ====================================================================

  function absMin() {
    try {
      var g = WS.G;
      if (!g || !g.time) return 0;
      return (g.time.day - 1) * 1440 + g.time.min;
    } catch (e) { return 0; }
  }

  function begin(meta) {
    R.active = true;
    R.meta = meta || {};
    R.ev = [];
    R.posN = 0;
    R.lastPosMin = -1;
    R.lastStatMin = -1;
  }

  function end() { R.active = false; }

  function push(arr) {
    if (!R.active) return;
    if (R.ev.length > 26000) return;      // страховка от распухания
    arr[0] = Math.round(arr[0]);
    R.ev.push(arr);
  }

  function notePos() {
    var p = WS.G && WS.G.player;
    if (!p) return;
    push([absMin(), 0, Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10]);
    R.posN++;
  }

  /** Тик записи (симуляция): сэмплы позиции и статистики. */
  function tickRecord() {
    if (!R.active || !WS.G || !WS.G.running) return;
    var m = absMin();
    // позиция: каждые POS_EVERY минут (потом реже, если упёрлись в потолок)
    var every = R.posN < POS_CAP ? POS_EVERY : POS_EVERY * 4;
    if (m - R.lastPosMin >= every) {
      R.lastPosMin = m;
      notePos();
    }
    // статистика: раз в игровой час
    if (m - R.lastStatMin >= 60) {
      R.lastStatMin = m;
      var hp = 0, en = 0;
      try { hp = Math.round(WS.G.player.hp); } catch (e) { /* пусто */ }
      try { en = WS.Crazy && WS.Crazy.energy ? Math.round(WS.Crazy.energy()) : 0; } catch (e2) { /* пусто */ }
      push([m, 3, hp, en]);
    }
  }

  // ---- публичные заметки (для бота/демо) ----
  function noteThink(text) { push([absMin(), 1, String(text || '').slice(0, 220)]); }
  function noteAct(txt, cls) { push([absMin(), 2, String(txt || '').slice(0, 220), cls || 'info']); }
  function noteChapter(txt) { push([absMin(), 4, String(txt || '').slice(0, 160)]); }
  function noteResult(res, day) { push([absMin(), 5, res, day || 0]); }

  // ====================================================================
  //  ЭКСПОРТ / ИМПОРТ
  // ====================================================================

  /** Выгрузка записи: СНАПШОТ (фиксация на момент вызова).
   *  ev копируется — экспорт, сделанный до конца записи, больше не растёт
   *  вместе с живой R.ev; meta копируется — extra мержится в копию и не
   *  протекает в последующие экспорты. */
  function exportRec(extra) {
    var src = R.meta || {};
    var meta = {};
    var k;
    for (k in src) if (src.hasOwnProperty(k)) meta[k] = src[k];
    if (extra) {
      for (k in extra) if (extra.hasOwnProperty(k)) meta[k] = extra[k];
    }
    return {
      v: 1,
      meta: meta,
      ev: R.ev.slice()
    };
  }

  // ====================================================================
  //  ЛОКАЛЬНОЕ ХРАНИЛИЩЕ
  // ====================================================================

  function idx() {
    try {
      var raw = localStorage.getItem(IDX_KEY);
      if (raw) return JSON.parse(raw) || [];
    } catch (e) { /* пусто */ }
    return [];
  }

  function saveIdx(a) {
    try { localStorage.setItem(IDX_KEY, JSON.stringify(a)); } catch (e) { /* пусто */ }
  }

  // счётчик уникальности: защиты от коллизий внутри одной миллисекунды
  var idSeq = 0;

  /** Уникальный id записи: время + счётчик + случайный суффикс, с
   *  проверкой по индексу (записи, сохранённые подряд за одну
   *  миллисекунду, больше не получают одинаковый id и не затирают
   *  друг друга). */
  function newRecId() {
    var taken = true, id = '', guard = 99;
    while (taken && guard-- > 0) {
      id = 'r' + Date.now().toString(36) + '-' + (idSeq++) +
        ((Math.random() * 46656) | 0).toString(36);
      taken = false;
      var a = idx();
      for (var i = 0; i < a.length; i++) {
        if (a[i].id === id) { taken = true; break; }
      }
    }
    return id;
  }

  /** Строка индекса для записи. strategy обязателен — по нему кинозал
   *  вешает тег «СПИДРАН» (cinema.js recRow читает meta.strategy). */
  function idxEntry(id, rec, name) {
    var meta = (rec && rec.meta) || {};
    return {
      id: id, at: Date.now(), name: name || meta.name || 'Запись',
      result: meta.result || '', day: meta.day || 0, seed: meta.seed || 0,
      strategy: meta.strategy || '', realSec: meta.realSec || 0
    };
  }

  /** Сохранить текущую/готовую запись локально. Возвращает id. */
  function saveLocal(rec, name) {
    var id = newRecId();
    try {
      localStorage.setItem(DATA_KEY + id, JSON.stringify(rec));
      var a = idx();
      a.unshift(idxEntry(id, rec, name));
      while (a.length > MAX_LOCAL) {
        try { localStorage.removeItem(DATA_KEY + a[a.length - 1].id); } catch (e2) { /* пусто */ }
        a.pop();
      }
      saveIdx(a);
      return id;
    } catch (e) {
      // переполнение — выбрасываем старые и пробуем ещё раз
      try {
        var a2 = idx();
        while (a2.length) {
          localStorage.removeItem(DATA_KEY + a2[a2.length - 1].id);
          a2.pop();
          try {
            localStorage.setItem(DATA_KEY + id, JSON.stringify(rec));
            a2.unshift(idxEntry(id, rec, name));
            saveIdx(a2);
            return id;
          } catch (e3) { /* ещё раз */ }
        }
      } catch (e4) { /* пусто */ }
      return null;
    }
  }

  function loadLocal(id) {
    try {
      var raw = localStorage.getItem(DATA_KEY + id);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* пусто */ }
    return null;
  }

  function removeLocal(id) {
    try { localStorage.removeItem(DATA_KEY + id); } catch (e) { /* пусто */ }
    var a = idx();
    for (var i = a.length - 1; i >= 0; i--) if (a[i].id === id) a.splice(i, 1);
    saveIdx(a);
  }

  // ====================================================================
  //  BUNDLED-ЗАПИСИ (поставляются с игрой, recordings/)
  // ====================================================================

  var bundledCache = null;

  function listBundled(cb) {
    if (bundledCache) { cb(bundledCache); return; }
    try {
      fetch(IDX_URL, { cache: 'no-cache' }).then(function (r) {
        if (!r.ok) throw new Error('нет index');
        return r.json();
      }).then(function (j) {
        bundledCache = (j && j.records) ? j.records : [];
        cb(bundledCache);
      }).catch(function () { bundledCache = []; cb([]); });
    } catch (e) { cb([]); }
  }

  function loadBundled(file, cb) {
    try {
      fetch('recordings/' + file, { cache: 'force-cache' }).then(function (r) {
        if (!r.ok) throw new Error('нет файла');
        return r.json();
      }).then(function (j) { cb(j); }).catch(function () { cb(null); });
    } catch (e) { cb(null); }
  }

  // ====================================================================
  //  BOOT / API
  // ====================================================================

  WS.boot(function initReplay() {
    // пишем сэмплы до игрока (60) — успеваем за движением
    WS.tick(58, tickRecord, 'replay:rec');
    WS.log('[Replay] киноплёнка заряжена');
  }, 'replay:init');

  WS.def('Replay', {
    begin: begin,
    end: end,
    isActive: function () { return R.active; },
    noteThink: noteThink,
    noteAct: noteAct,
    noteChapter: noteChapter,
    noteResult: noteResult,
    exportRec: exportRec,
    saveLocal: saveLocal,
    loadLocal: loadLocal,
    removeLocal: removeLocal,
    listLocal: idx,
    listBundled: listBundled,
    loadBundled: loadBundled
  });
})();
