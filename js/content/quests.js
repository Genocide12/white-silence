/**
 * quests.js — КВЕСТОВАЯ СИСТЕМА «Белого Безмолвия» (модуль F2).
 * WS.Quests.def({id, title, desc, steps, reward, onStart, onComplete}):
 * журнал в WS.G.story.quests = {id: 'active'|'done'|'failed'}, тосты
 * на этапы, хроника. Пять квестов:
 *   1) «Ребёнок в деревне» — обёртка сюжетного квеста E1 (события
 *      story:child_saved / story:child_lost, флаги child_*);
 *   2) «Ружьё Тимофеича» — записка в избе охотника, скрипучая
 *      половица (объект q_floor_loose, лут: винтовка + патроны +
 *      последний лист дневника);
 *   3) «Волчий вожак» — после 3+ убитых волков (день 20+) ночью
 *      воет вожак: сущность alpha_wolf (hp 90, dmg 18, обходит огонь);
 *   4) «Схрон егеря» — две записки (tim3+tim4) складываются в карту,
 *      метка ranger_mark, раскопать лопатой → таблица ranger_cache;
 *   5) «Свет в окне» — ночь 25+: в дальней избе спят дезертиры
 *      (крадучись или бой), ящик deserter_den.
 * API для журнала: WS.Quests.list() / counts() (файл journal_screen
 * не трогаем — только публичный вход).
 * Связи: content/story.js, content/notes.js, systems/dialog.js,
 * ai/hermit.js (репутация), systems/looting.js, ai/wolf.js.
 */
(function () {
  'use strict';

  // ====================================================================
  //  КОНСТАНТЫ
  // ====================================================================

  var TICK_PRI = 64;            // тик прогресса (после story:63)
  var PROGRESS_IV = 1.0;        // пересмотр этапов — раз в секунду
  var ALPHA_DAY = 20;           // вожак — не раньше этого дня
  var ALPHA_KILLS = 3;          // ...и столько убитых волков
  var DEN_DAY = 25;             // дезертиры — не раньше этого дня
  var TIMO_DAY = 8;             // подсказка про избу охотника — день 8+

  // ====================================================================
  //  УТИЛИТЫ
  // ====================================================================

  function G() { return WS.G; }
  function P() { var g = WS.G; return (g && g.player) ? g.player : null; }

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  function day() { return (WS.Time && WS.Time.day) ? WS.Time.day() : 1; }
  function hour() { return (WS.Time && WS.Time.hour) ? WS.Time.hour() : 8; }
  function night() {
    if (WS.Time && WS.Time.light) return WS.Time.light() < 0.22;
    return hour() >= 21 || hour() < 6;
  }

  /** Сюжетное хранилище с гарантированными полями (в т.ч. quests). */
  function F() {
    var g = WS.G;
    var s = g && g.story;
    if (!s) {
      if (!g) return null;
      s = g.story = { notes: [], radio: [], flags: {}, hints: {} };
    }
    if (!s.flags) s.flags = {};
    if (!s.quests) s.quests = {};
    return s;
  }

  function fg(n) { var s = F(); return s ? s.flags[n] : undefined; }
  function fs(n, v) { var s = F(); if (s) s.flags[n] = (v === undefined ? 1 : v); }

  function toast(text, kind) {
    if (!text) return;
    if (WS.Ui && WS.Ui.toast) {
      try { WS.Ui.toast(text, kind || 'info'); return; } catch (e) { /* ниже */ }
    }
    try { WS.Ev.emit('ui:toast', { text: text, kind: kind || 'info' }); } catch (e2) { /* пусто */ }
  }

  function snd(name, x, y, vol) {
    try {
      if (!WS.Snd || !WS.Snd.play) return;
      var o = { vol: vol === undefined ? 0.8 : vol };
      if (x !== undefined) { o.x = x; o.y = y; }
      WS.Snd.play(name, o);
    } catch (e) { /* пусто */ }
  }

  /** Хроника: публичный вход сюжета, иначе — своя лента. */
  function chron(text, cls) {
    if (WS.Story && WS.Story.chron) {
      try { WS.Story.chron(text, cls || ''); return; } catch (e) { /* ниже */ }
    }
    var s = F();
    if (s) {
      if (!s.chronicle) s.chronicle = [];
      s.chronicle.push({ day: day(), time: '', text: String(text), cls: cls || '' });
    }
  }

  function invCount(id) {
    if (WS.Inv && WS.Inv.count) { try { return WS.Inv.count(id); } catch (e) { return 0; } }
    return 0;
  }

  function invConsume(id, n) {
    if (WS.Inv && WS.Inv.consume) { try { return WS.Inv.consume(id, n || 1); } catch (e) { return 0; } }
    return 0;
  }

  function invGive(id, n) {
    if (WS.Inv && WS.Inv.give) { try { return WS.Inv.give(id, n || 1); } catch (e) { return 0; } }
    return 0;
  }

  function playerDist(x, y) {
    var p = P();
    if (!p) return 9999;
    return WS.M.dist(p.x, p.y, x, y);
  }

  function addSanity(v) {
    var p = P();
    if (!p || !p.needs || !v) return;
    p.needs.sanity = clamp(p.needs.sanity + v, 0, 100);
    if (WS.Fx && WS.Fx.text && Math.abs(v) >= 3) {
      WS.Fx.text((v > 0 ? '+' : '') + Math.round(v) + ' рассудок',
        p.x, p.y - 1.2, { col: v > 0 ? '#8fbf7a' : '#c46a5a', life: 1.2 });
    }
  }

  /** Прочитана ли записка (id) в этой партии. */
  function noteRead(id) {
    var s = F();
    if (!s || !s.notes) return false;
    for (var i = 0; i < s.notes.length; i++) {
      var x = s.notes[i];
      if (((typeof x === 'string') ? x : (x && x.id)) === id) return true;
    }
    return false;
  }

  // ====================================================================
  //  ДВИЖОК КВЕСТОВ
  // ====================================================================

  var registry = {};     // id -> определение
  var order = [];         // порядок регистрации (для стабильного list())

  /**
   * Зарегистрировать квест.
   * def: {id, title, desc, reward, hidden?, autoStart()?, onStart()?,
   *       onComplete()?, onFail()?,
   *       steps: [{id, text, done(player)?, silent?}]}
   */
  function defQuest(q) {
    if (!q || !q.id) return null;
    registry[q.id] = q;
    if (order.indexOf(q.id) < 0) order.push(q.id);
    return q;
  }

  /** Состояние квеста: 'active' | 'done' | 'failed' | undefined. */
  function state(id) {
    var s = F();
    return (s && s.quests) ? s.quests[id] : undefined;
  }

  function isActive(id) { return state(id) === 'active'; }
  function isDone(id) { return state(id) === 'done'; }

  /** Начать квест (повторно — тихо). */
  function startQuest(id, silent) {
    var q = registry[id];
    var s = F();
    if (!q || !s) return false;
    if (s.quests[id]) return false;
    s.quests[id] = 'active';
    fs('q_' + id + '_day', day());
    if (!silent) {
      toast('Задание: «' + q.title + '»', 'info');
      chron('Новое дело: «' + q.title + '». ' + (q.desc || ''), 'find');
      snd('select', undefined, undefined, 0.5);
    }
    if (typeof q.onStart === 'function') {
      try { q.onStart(); } catch (e) { WS.err('quests: onStart ' + id, e && e.message); }
    }
    progressCheck(id);
    return true;
  }

  /** Завершить квест. */
  function completeQuest(id, silent) {
    var q = registry[id];
    var s = F();
    if (!q || !s || s.quests[id] !== 'active') return false;
    s.quests[id] = 'done';
    fs('q_' + id + '_done_day', day());
    if (!silent) {
      toast('Выполнено: «' + q.title + '»', 'good');
      chron('Сделано: «' + q.title + '». ' + (q.reward || ''), 'find');
      snd('levelup', undefined, undefined, 0.45);
    }
    if (typeof q.onComplete === 'function') {
      try { q.onComplete(); } catch (e) { WS.err('quests: onComplete ' + id, e && e.message); }
    }
    return true;
  }

  /** Провалить квест. */
  function failQuest(id, why, silent) {
    var q = registry[id];
    var s = F();
    if (!q || !s || s.quests[id] !== 'active') return false;
    s.quests[id] = 'failed';
    fs('q_' + id + '_fail_day', day());
    if (!silent) {
      toast('Провалено: «' + q.title + '»' + (why ? ' — ' + why : ''), 'bad');
      chron('Не вышло: «' + q.title + '»' + (why ? ' — ' + why : '') + '.', 'death');
    }
    if (typeof q.onFail === 'function') {
      try { q.onFail(); } catch (e) { WS.err('quests: onFail ' + id, e && e.message); }
    }
    return true;
  }

  /** Выполнен ли шаг (безопасно). */
  function stepDone(q, st, player) {
    if (typeof st.done === 'function') {
      try { return !!st.done(player); } catch (e) {
        WS.err('quests: step ' + q.id + '.' + st.id, e && e.message);
        return false;
      }
    }
    return false;
  }

  /**
   * Пересмотреть этапы квеста: тосты на новые завершения.
   * Возвращает число выполненных шагов (или -1, если квест не активен).
   */
  function progressCheck(id) {
    var q = registry[id];
    if (!q || !isActive(id)) return -1;
    var player = P();
    var done = 0;
    for (var i = 0; i < q.steps.length; i++) {
      var st = q.steps[i];
      if (!st) continue;
      if (stepDone(q, st, player)) {
        done++;
        var key = 'qs_' + id + '_' + st.id;
        if (!fg(key)) {
          fs(key, 1);
          if (!st.silent) {
            toast('Этап: ' + st.text, 'info');
          }
        }
      }
    }
    return done;
  }

  /** Полный пересмотр всех активных квестов (тик/день/событие). */
  function progressAll() {
    var s = F();
    if (!s) return;
    for (var k in s.quests) {
      if (s.quests[k] === 'active') progressCheck(k);
    }
  }

  /**
   * Публичный вид квеста для журнала:
   * {id, title, desc, state, steps: [{text, done}], reward, day, doneDay}
   */
  function viewOf(id) {
    var q = registry[id];
    if (!q) return null;
    var player = P();
    var st = state(id) || 'hidden';
    var steps = [];
    var done = 0;
    for (var j = 0; j < (q.steps || []).length; j++) {
      var o = q.steps[j];
      // фактическое состояние шага: флаги переживают сейв,
      // так что и закрытые квесты показывают честную картину
      var ok = stepDone(q, o, player);
      if (ok) done++;
      steps.push({ id: o.id, text: o.text, done: ok });
    }
    return {
      id: id,
      title: q.title,
      desc: q.desc || '',
      state: st,
      steps: steps,
      doneSteps: done,
      totalSteps: (q.steps || []).length,
      reward: q.reward || '',
      day: fg('q_' + id + '_day') || 0,
      doneDay: fg('q_' + id + '_done_day') || fg('q_' + id + '_fail_day') || 0
    };
  }

  /** Список квестов для журнала (только начатые и завершённые). */
  function listQuests() {
    var s = F();
    var out = [];
    if (!s || !s.quests) return out;
    for (var i = 0; i < order.length; i++) {
      var id = order[i];
      if (s.quests[id]) out.push(viewOf(id));
    }
    return out;
  }

  /** Счётчики для журнала/победы. */
  function counts() {
    var s = F();
    var c = { active: 0, done: 0, failed: 0 };
    if (!s || !s.quests) return c;
    for (var k in s.quests) {
      if (s.quests[k] === 'active') c.active++;
      else if (s.quests[k] === 'done') c.done++;
      else if (s.quests[k] === 'failed') c.failed++;
    }
    return c;
  }

  // ====================================================================
  //  СПРАЙТЫ И ПРЕДМЕТЫ КВЕСТОВ
  // ====================================================================

  function p(c, x, y, w, h, col) {
    c.fillStyle = col;
    c.fillRect(x, y, w, h);
  }

  /** Скрипучая половица: доски пола, одна — приподнята, тёмный лаз. */
  function defLooseSprite() {
    WS.Spr.def('q_floor_loose', { w: 36, h: 20, draw: function (c) {
      // доски пола
      p(c, 2, 10, 32, 8, '#6a5138');
      p(c, 2, 10, 32, 2, '#7d6046');
      p(c, 2, 16, 32, 2, '#57422e');
      // швы
      p(c, 12, 10, 1, 8, '#4a3826');
      p(c, 23, 10, 1, 8, '#4a3826');
      // приподнятая доска (домкратом смотрит вверх и в бок)
      p(c, 8, 4, 18, 7, '#8a6d50');
      p(c, 8, 4, 18, 2, '#9c7f60');
      p(c, 8, 9, 18, 2, '#6a5138');
      // тёмная щель-лаз
      p(c, 9, 10, 16, 4, '#100c08');
      // снежок-блик у щели
      p(c, 10, 10, 3, 1, 'rgba(226,232,240,0.25)');
      // латунная щеколда
      p(c, 28, 7, 4, 3, '#b9903f');
      p(c, 29, 6, 1, 5, '#e2c079');
    }});
  }

  /** Метка егеря: кол с дощечкой-биркой и ветошью. */
  function defMarkSprite() {
    WS.Spr.def('q_ranger_mark', { w: 24, h: 46, draw: function (c) {
      // кол
      p(c, 9, 12, 4, 32, '#5c4730');
      p(c, 9, 12, 1, 32, '#6f583c');
      p(c, 9, 12, 4, 2, '#4a3826');
      // бирка-дощечка
      p(c, 3, 8, 16, 10, '#8a6d50');
      p(c, 4, 9, 14, 8, '#9c7f60');
      // зарубки-буквы
      p(c, 6, 11, 2, 1, '#3a2c1c');
      p(c, 9, 11, 1, 4, '#3a2c1c');
      p(c, 12, 12, 3, 1, '#3a2c1c');
      p(c, 6, 14, 4, 1, '#3a2c1c');
      p(c, 12, 14, 2, 2, '#3a2c1c');
      // красная ветошь — примета
      p(c, 14, 6, 7, 5, '#8f2a26');
      p(c, 14, 6, 7, 2, '#a63c34');
      p(c, 16, 10, 2, 4, '#8f2a26');
      // снег
      p(c, 3, 7, 16, 1, 'rgba(226,232,240,0.7)');
      WS.Spr.ell(c, 12, 44, 9, 3, 'rgba(226,232,240,0.5)');
    }});
  }

  /** Керосиновая лампа дезертиров: тёплый живой огонь. */
  function defLampSprite() {
    WS.Spr.def('q_lamp', { w: 22, h: 34, draw: function (c) {
      // ручка-дужка
      p(c, 9, 2, 2, 5, '#5a5f6a');
      p(c, 5, 6, 10, 2, '#5a5f6a');
      p(c, 14, 3, 2, 5, '#5a5f6a');
      // стеклянный колпак
      p(c, 6, 8, 10, 14, 'rgba(160,190,215,0.35)');
      p(c, 7, 8, 8, 3, 'rgba(200,225,240,0.4)');
      // пламя
      p(c, 9, 12, 4, 7, '#f4b968');
      p(c, 10, 13, 2, 5, '#fdf1c9');
      p(c, 9, 10, 4, 2, '#e2924a');
      // бак и основание
      p(c, 6, 22, 10, 7, '#767a82');
      p(c, 6, 22, 10, 2, '#8b909b');
      p(c, 5, 29, 12, 3, '#5f636b');
      // фитиль-регулятор
      p(c, 10, 20, 2, 2, '#b9903f');
    }});
  }

  /** Предметы квестов (охраняемся от соседей). */
  function declareItems() {
    WS.Data = WS.Data || {};
    WS.Data.items = WS.Data.items || {};
    WS.Data.loot = WS.Data.loot || {};

    // шкура вожака: тёплая, редкая
    if (!WS.Data.items.alpha_pelt) {
      WS.Data.items.alpha_pelt = {
        id: 'alpha_pelt',
        cat: 'material',
        w: 3.2,
        stack: 2,
        warm: 45,
        name: 'Шкура вожака',
        tags: ['tailor', 'quest']
      };
    }

    // ящик дезертиров: богатый лут
    if (!WS.Data.loot.deserter_den) {
      WS.Data.loot.deserter_den = {
        rolls: [4, 6],
        items: [
          { id: 'rifle_mosin', w: 7, min: 1, max: 1 },
          { id: 'pistol_nagant', w: 4, min: 1, max: 1 },
          { id: 'rifle_round', w: 16, min: 6, max: 14 },
          { id: 'shell', w: 8, min: 3, max: 7 },
          { id: 'vodka', w: 12, min: 1, max: 3 },
          { id: 'bread', w: 10, min: 1, max: 2 },
          { id: 'canned_fish', w: 10, min: 1, max: 3 },
          { id: 'coat_fur', w: 8, min: 1, max: 1 },
          { id: 'valenki', w: 7, min: 1, max: 1 },
          { id: 'watch_silver', w: 6, min: 1, max: 1 },
          { id: 'coin_purse', w: 10, min: 1, max: 2 },
          { id: 'tobacco_pouch', w: 8, min: 1, max: 2 },
          { id: 'matches', w: 10, min: 1, max: 3 },
          { id: 'morphine', w: 3, min: 1, max: 1 },
          { id: null, w: 6, min: 0, max: 0 }
        ]
      };
    }
  }

  // ====================================================================
  //  КВЕСТ 1. «РЕБЁНОК В ДЕРЕВНЕ» — обёртка сюжетного квеста E1
  // ====================================================================

  /** Состояние мальчика из сюжетного модуля (безопасно). */
  function childState() {
    if (WS.Story && WS.Story.childState) {
      try { return WS.Story.childState(); } catch (e) { return 'none'; }
    }
    if (fg('child_saved')) return 'saved';
    if (fg('child_dead')) return 'dead';
    if (typeof fg('child_hx') === 'number') return 'active';
    return 'none';
  }

  function defChildQuest() {
    defQuest({
      id: 'child_village',
      title: 'Ребёнок в деревне',
      desc: 'В дальней избе — живой человек. Мальчик Ваня, лихорадка. ' +
            'Ему нужны хинин, детские валенки и горячая каша. ' +
            'Хинин ищи в фельдшерском пункте или у старца Акима в лесу.',
      reward: 'Спасённый ребёнок; Аким запомнит добро',
      steps: [
        { id: 'find', text: 'Найти мальчика в дальней избе', done: function () { return !!fg('child_intro'); } },
        { id: 'quinine', text: 'Принести хинин', done: function () { return !!fg('child_q'); } },
        { id: 'valenki', text: 'Надеть детские валенки', done: function () { return !!fg('child_v'); } },
        { id: 'kasha', text: 'Покормить горячей кашей', done: function () { return !!fg('child_k'); } },
        { id: 'saved', text: 'Дождаться утра', done: function () { return !!fg('child_saved'); }, silent: true }
      ],
      onComplete: function () {
        // сюжет уже дал +15 рассудка; добавляем до двадцати и благодарность
        addSanity(5);
        if (WS.Dialog && WS.Dialog.repAdd) WS.Dialog.repAdd('hermit', 3, 'Мальчик спасён.');
        chron('Мальчик спасён. Аким, услышав об этом, стал доверять вам больше.', 'find');
      },
      onFail: function () {
        addSanity(-5);
        chron('Мальчик не дожил. Зима забрала ещё одного.', 'death');
      }
    });
  }

  /** Автостарт: мальчик появился (по любому из каналов E1). */
  function childAutoCheck() {
    var cs = childState();
    if (cs === 'none') return;
    if (state('child_village')) return;
    // спасённого до загрузки модуля (старые сейвы) — закрыть сразу
    if (cs === 'saved') {
      startQuest('child_village', true);
      for (var i = 0; i < 5; i++) progressCheck('child_village');
      completeQuest('child_village', true);
      return;
    }
    if (cs === 'dead') {
      startQuest('child_village', true);
      failQuest('child_village', 'мальчик не дожил', true);
      return;
    }
    startQuest('child_village');
  }

  // ====================================================================
  //  КВЕСТ 2. «РУЖЬЁ ТИМОФЕИЧА» — половица в избе охотника
  // ====================================================================

  /** Найти записку-объект в мире. */
  function findNoteObj(id) {
    var w = WS.World;
    if (!w || !w.objects) return null;
    for (var i = 0; i < w.objects.length; i++) {
      var o = w.objects[i];
      if (o && o.note === id) return o;
    }
    return null;
  }

  /**
   * Изба охотника: где лежит его дневник (tim1/tim2), а если уже
   * подобраны — повторяем выбор notes.js тем же сеяным ГПСЧ.
   */
  function hunterIzba() {
    var w = WS.World;
    if (!w || !w.buildings) return null;
    var i;
    // 1) записка ещё в мире — её дом и есть изба
    var note = findNoteObj('tim1') || findNoteObj('tim2');
    if (note) {
      var b = w.buildingAt(Math.floor(note.x), Math.floor(note.y));
      if (b) return b;
    }
    // 2) реплицируем выбор notes.js: RN.int(0, izbas.length-1) — первый
    //    расход того же ГПСЧ в их раскладке
    var izbas = [];
    for (i = 0; i < w.buildings.length; i++) {
      if (w.buildings[i] && w.buildings[i].type === 'izba') izbas.push(w.buildings[i]);
    }
    if (!izbas.length) return null;
    var seed = (G() && typeof G().seed === 'number') ? (G().seed >>> 0) : 741095;
    var RN = WS.RNG.mk(((seed ^ 0x5EED0BA) >>> 0));
    return izbas[RN.int(0, izbas.length - 1)];
  }

  /** Свободный тайл внутри здания (упрощённый freeTileIn из story.js). */
  function freeTileIn(b) {
    var w = WS.World;
    if (!w || !b) return null;
    var T = w.T;
    var floors = [T.FLOOR_WOOD, T.FLOOR_TILE, T.FLOOR_CONCRETE, T.FLOOR_DIRT];
    for (var t = 0; t < 40; t++) {
      var x = b.x + 1 + Math.floor(Math.random() * Math.max(1, b.w - 2));
      var y = b.y + 1 + Math.floor(Math.random() * Math.max(1, b.h - 2));
      if (floors.indexOf(w.tileAt(x, y)) < 0) continue;
      if (w.isTileBlocked(x, y)) continue;
      var objs = w.objsAt(x, y);
      var busy = false;
      for (var i = 0; i < (objs ? objs.length : 0); i++) {
        if (objs[i] && objs[i].solid) { busy = true; break; }
      }
      if (busy) continue;
      return { x: x + 0.5, y: y + 0.5 };
    }
    return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  }

  /**
   * Поставить скрипучую половицу в избу охотника (генерация мира;
   * не ставится, если уже поднята в прошлой жизни партии).
   */
  function placeLooseFloor() {
    var w = WS.World;
    if (!w || !w.addObject) return null;
    if (fg('q2_taken')) return null;      // уже обыскана
    // уже стоит? (повторная генерация без резета)
    for (var i = 0; i < w.objects.length; i++) {
      if (w.objects[i] && w.objects[i].qLoose) return w.objects[i];
    }
    var b = hunterIzba();
    if (!b) return null;
    var pt = freeTileIn(b);
    var o = w.addObject({
      x: pt.x, y: pt.y,
      sprName: 'q_floor_loose',
      solid: false,
      name: 'Скрипучая половица',
      qLoose: true,
      container: 'timo_cache',
      z: 1
    });
    // содержимое — заранее: ружьё, патроны, последний лист дневника
    o.inv = [
      { id: 'rifle_mosin', count: 1 },
      { id: 'rifle_round', count: 10 },
      { id: 'journal_page', count: 1, data: { noteId: 'tim6' } }
    ];
    o.inv._dirty = true;
    // запомнить, где изба (для этапа «отыскать»)
    fs('q2_hx', b.x);
    fs('q2_hy', b.y);
    return o;
  }

  /** Лут-таблица тайника (для честности обыска — вдруг inv потеряется). */
  function declareTimoTable() {
    var loot = WS.Data.loot;
    if (!loot.timo_cache) {
      loot.timo_cache = {
        rolls: [1, 1],
        items: [
          { id: 'rifle_mosin', w: 8, min: 1, max: 1 },
          { id: 'rifle_round', w: 6, min: 8, max: 10 },
          { id: 'journal_page', w: 4, min: 1, max: 1 }
        ]
      };
    }
  }

  function defTimoQuest() {
    defQuest({
      id: 'timo_gun',
      title: 'Ружьё Тимофеича',
      desc: 'Дневник охотника обещает: «ружьё и припас положил в тайник». ' +
            'Тайник — под половицей, в самой избе. Изба Тимофеича — за кладбищем, ' +
            'у леса.',
      reward: 'Винтовка Мосина, десяток патронов, последний лист дневника',
      steps: [
        { id: 'note', text: 'Прочитать дневник охотника', done: function () {
            return noteRead('tim1') || noteRead('tim2');
          }, silent: true },
        { id: 'house', text: 'Отыскать избу Тимофеича', done: function () {
            var hx = fg('q2_hx'), hy = fg('q2_hy');
            if (typeof hx !== 'number') return false;
            var b = houseAt(hx, hy);
            if (!b) return false;
            var cx = b.x + b.w / 2, cy = b.y + b.h / 2;
            return playerDist(cx, cy) < 7;
          } },
        { id: 'floor', text: 'Поднять скрипучую половицу', done: function () {
            return !!fg('q2_taken');
          } }
      ],
      onComplete: function () {
        chron('Половица поднята: ружьё Тимофеича, патроны и его последний лист.', 'find');
      }
    });
  }

  function houseAt(x, y) {
    var w = WS.World;
    if (!w || !w.buildings) return null;
    for (var i = 0; i < w.buildings.length; i++) {
      var b = w.buildings[i];
      if (b && b.x === x && b.y === y) return b;
    }
    return null;
  }

  /** Начало: прочитан любой лист дневника охотника. */
  function timoStartCheck() {
    if (state('timo_gun')) return;
    if (noteRead('tim1') || noteRead('tim2')) {
      startQuest('timo_gun');
    }
  }

  /** Подсказка дня 8: где живёт охотник. */
  function timoHintCheck() {
    if (state('timo_gun')) return;
    if (day() < TIMO_DAY) return;
    if (fg('q2_hint')) return;
    fs('q2_hint', 1);
    toast('Изба охотника Тимофеича — на отшибе, за кладбищем. Дед хвалился тайником.', 'info');
  }

  // ====================================================================
  //  КВЕСТ 3. «ВОЛЧИЙ ВОЖАК» — умная тварь после третьего волка
  // ====================================================================

  var alpha = null;   // сущность вожака

  function wolvesKilled() {
    var g = G();
    return (g && g.stats) ? (g.stats.wolvesKilled || 0) : 0;
  }

  /** Спавн вожака: опушка у посёлка, ночью выходит к дворам. */
  function spawnAlpha() {
    var w = WS.World;
    if (!w || !w.addEnt) return null;
    if (alpha && !alpha.dead) return alpha;
    // точка: лесной край над посёлком
    var x = 55 + Math.random() * 110;
    var y = 74 + Math.random() * 8;
    var e = w.addEnt({
      kind: 'alpha_wolf',
      id: 'q_alpha_wolf',
      x: x, y: y,
      dir: 4,
      hp: 90, maxHp: 90,
      speed: 3.0,
      dmg: 18,
      atkSpd: 1.0,
      sprName: 'wolf',
      sprFrame: 0,
      animFrames: 2,
      shadowR: 0.6,
      scale: 1.42,
      state: 'hunt', stateT: 0,
      atkCd: 0, lungeT: 0,
      sight: 14,
      brain: { hears: true, noInside: true },
      den: { x: x, y: y - 10 },
      qalpha: true
    });
    // ночные глаза — красные, крупнее волчьих
    e.render = function (ctx, sx, sy, zoom) {
      try {
        if (!WS.AI || !WS.AI.isNight()) return;
        var t = performance.now() / 700;
        var a = 0.55 + 0.3 * Math.sin(t);
        var s = Math.max(1.6, 2.6 * zoom);
        var cxp = sx, cyp = sy - 13 * zoom;
        if (ctx.createRadialGradient) {
          var g = ctx.createRadialGradient(cxp, cyp, 0, cxp, cyp, s * 3);
          g.addColorStop(0, 'rgba(255,94,80,' + (a * 0.45) + ')');
          g.addColorStop(1, 'rgba(255,94,80,0)');
          ctx.fillStyle = g;
          ctx.fillRect(cxp - s * 3, cyp - s * 3, s * 6, s * 6);
        }
        ctx.fillStyle = 'rgba(255,110,90,' + a + ')';
        ctx.fillRect(cxp - s * 1.4, cyp - s / 2, s, s);
        ctx.fillRect(cxp + s * 0.6, cyp - s / 2, s, s);
      } catch (err) { /* не ронять кадр */ }
    };
    alpha = e;
    fs('q_alpha_alive', 1);
    WS.log('[Quests] волчий вожак вышел к посёлку');
    return e;
  }

  /**
   * Поведение вожака: ночью — охота; огонь не пугает, а лишь мешает:
   * заходит с дальней от костра стороны («с подветренной»). Днём уходит
   * к логову и спит. Раненый — не бежит, а злееет.
   */
  function updateAlpha(e, dt, R) {
    var p = P();
    var w = WS.World;
    var night = (WS.AI && WS.AI.isNight) ? WS.AI.isNight() : night2();
    e.moving = false;

    var spd = e.speed * (night ? 1.0 : 0.55);
    // злость от ран: на последней трети здоровья — ускорение
    if (e.hp <= e.maxHp * 0.35) spd *= 1.25;

    if (e.atkCd > 0) e.atkCd -= dt;
    if (e.lungeT > 0) e.lungeT -= dt;

    if (!p || p.hp <= 0 || !night) {
      // день/бессознательный игрок: к логову, отлежаться
      var den = e.den || { x: e.x, y: e.y };
      if (WS.M.dist(e.x, e.y, den.x, den.y) > 2) {
        WS.AI.moveTowards(e, den.x, den.y, spd, dt);
      } else {
        WS.AI.wanderInArea(e, den.x, den.y, 4, dt, spd * 0.4);
      }
      WS.AI.anim(e, dt, 4);
      e.state = 'den';
      return;
    }

    var d = WS.M.dist(e.x, e.y, p.x, p.y);
    e.state = 'hunt';

    // встреча лицом к лицу — отметка для журнала
    if (d < 14 && !fg('q3_met')) fs('q3_met', 1);

    // вой: не чаще раза в 12 секунд — держит в тонусе
    e._howlT = (e._howlT || 0) + dt;
    if (e._howlT > 12) {
      e._howlT = 0;
      snd('howl', e.x, e.y, 1);
    }

    // огонь рядом с игроком: вожак не тупит, а заходит с другой стороны
    var fire = (WS.AI && WS.AI.fireNear) ? WS.AI.fireNear(p.x, p.y, 6) : null;
    if (fire && d < 8) {
      // подветренная точка: за игроком от костра
      var ux = p.x - fire.x, uy = p.y - fire.y;
      var ul = Math.sqrt(ux * ux + uy * uy) || 1;
      ux /= ul; uy /= ul;
      var wp = { x: p.x + ux * 2.0, y: p.y + uy * 2.0 };
      if (WS.M.dist(e.x, e.y, wp.x, wp.y) > 0.6) {
        WS.AI.moveTowards(e, wp.x, wp.y, spd, dt);
      } else if (d < 1.5 && e.atkCd <= 0) {
        alphaBite(e, p);
      }
      // рык из тени
      if (R.f() < dt * 0.05) snd('growl', e.x, e.y, 0.6);
      WS.AI.anim(e, dt, 7);
      return;
    }

    // игрока нет рядом с огнём — прямая травля
    if (d > 3.4 && e.lungeT <= 0 && e.atkCd <= 0) {
      e.lungeT = 0.45;
      if (R.chance(0.4)) snd('growl', e.x, e.y, 0.7);
    }
    if (e.lungeT > 0) spd *= 1.5;
    WS.AI.moveTowards(e, p.x, p.y, spd, dt);
    if (d < 1.25 && e.atkCd <= 0) alphaBite(e, p);
    WS.AI.anim(e, dt, 8);
  }

  function night2() { return night(); }

  /** Укус вожака: 18 урона, отскок, шум. */
  function alphaBite(e, p) {
    e.atkCd = 1 / (e.atkSpd || 1.0);
    e.lungeT = 0;
    if (WS.AI && WS.AI.damagePlayer) {
      WS.AI.damagePlayer(e.dmg, 'bite', e);
    }
    // отпрыгнул
    var dx = e.x - p.x, dy = e.y - p.y;
    var l = Math.sqrt(dx * dx + dy * dy) || 1;
    for (var k = 1; k >= 0.25; k -= 0.25) {
      var nx = e.x + (dx / l) * 0.9 * k;
      var ny = e.y + (dy / l) * 0.9 * k;
      if (WS.AI.passable(nx, ny, e)) { e.x = nx; e.y = ny; break; }
    }
  }

  /** Ночь: проверка условий появления вожака. */
  function alphaNightCheck() {
    var g = G();
    if (!g || !g.running || g.dead) return;
    if (fg('q3_done') || fg('q3_started')) return;
    if (day() < ALPHA_DAY) return;
    if (wolvesKilled() < ALPHA_KILLS) return;
    fs('q3_started', 1);
    startQuest('wolf_leader');
    snd('howl', undefined, undefined, 0.9);
    toast('Ночью — вой, не похожий на прочий: ниже, длиннее, злее. У стаи появился вожак.', 'warn');
    chron('Стая отрастила вожака: вой его ниже и злее волчьего.', 'anom');
    // зверь выходит тут же, с опушки
    spawnAlpha();
  }

  function defAlphaQuest() {
    defQuest({
      id: 'wolf_leader',
      title: 'Волчий вожак',
      desc: 'Стая больше не боится огня: за ней встал вожак — крупнее, ' +
            'упрямее и умнее волка. Убей его, и стая снова станет просто ' +
            'зверьём. Он выходит по ночам к окраинам и уходит к логову днём.',
      reward: 'Шкура вожака — теплей любой волчьей',
      steps: [
        { id: 'hear', text: 'Услышать вой вожака', silent: true,
          done: function () { return !!fg('q3_started'); } },
        { id: 'meet', text: 'Встретить вожака лицом к лицу',
          done: function () {
            return !!(alpha && !alpha.dead && playerDist(alpha.x, alpha.y) < 14) || !!fg('q3_met');
          } },
        { id: 'kill', text: 'Одолеть вожака', done: function () { return !!fg('q3_done'); } }
      ],
      onComplete: function () {
        chron('Стая обезглавлена: вожак лежит у околицы, звери разбегаются.', 'find');
        addSanity(10);
        toast('Вой над лесом стал реже. Стая обезглавлена.', 'good');
      }
    });
  }

  /** Смерть вожака: шкура, хроника, закрытие квеста. */
  function onAlphaKill(d) {
    var e = d && d.ent;
    if (!e || !e.qalpha) return;
    alpha = null;
    fs('q3_done', 1);
    fs('q_alpha_alive', 0);
    // шкура и трофеи — мешочками рядом с тушей
    if (WS.Loot && WS.Loot.dropItem) {
      WS.Loot.dropItem('alpha_pelt', 1, e.x + 0.3, e.y + 0.2);
      WS.Loot.dropItem('meat_raw', 3, e.x - 0.3, e.y + 0.2);
      WS.Loot.dropItem('fat', 2, e.x, e.y - 0.3);
    }
    snd('howl', e.x, e.y, 0.8);
    toast('Вожак мёртв. Из кустов доносится растерянный, мелкий вой.', 'good');
    completeQuest('wolf_leader');
  }

  // ====================================================================
  //  КВЕСТ 4. «СХРОН ЕГЕРЯ» — две записки складываются в карту
  // ====================================================================

  var mark = null;    // объект-метка

  /** Место схрона: северный лес, сеяно от сида партии. */
  function markSpot() {
    var w = WS.World;
    if (!w) return null;
    // уже вычислено и сохранено — вернуть
    var mx = fg('q4_mx'), my = fg('q4_my');
    if (typeof mx === 'number' && typeof my === 'number') {
      return { x: mx, y: my };
    }
    var seed = (G() && typeof G().seed === 'number') ? (G().seed >>> 0) : 741095;
    var R = WS.RNG.mk(((seed ^ 0x54C4E) >>> 0));
    var T = w.T;
    var spot = null;
    for (var t = 0; t < 400; t++) {
      var x = Math.floor(R.range(18, w.w - 18));
      var y = Math.floor(R.range(14, 70));       // лес и гать
      var tt = w.tileAt(x, y);
      if (tt !== T.SNOW && tt !== T.GRASS && tt !== T.GRASS2 && tt !== T.DIRT) continue;
      if (w.isTileBlocked(x, y)) continue;
      if (w.isInside && w.isInside(x, y)) continue;
      if (WS.M.dist(x, y, 110, 115) < 40) continue;    // не у посёлка
      spot = { x: x, y: y };
      break;
    }
    if (!spot) spot = { x: 60, y: 40 };
    fs('q4_mx', spot.x);
    fs('q4_my', spot.y);
    return spot;
  }

  /** Поставить метку (после обеих записок; повторная генерация учтена). */
  function placeRangerMark() {
    var w = WS.World;
    if (!w || !w.addObject) return null;
    if (fg('q4_dug')) return null;          // уже раскопан
    if (!noteRead('tim3') || !noteRead('tim4')) return null;   // карта не собрана
    for (var i = 0; i < w.objects.length; i++) {
      if (w.objects[i] && w.objects[i].qMark) return w.objects[i];
    }
    var s = markSpot();
    var o = w.addObject({
      x: s.x + 0.5, y: s.y + 0.5,
      sprName: 'q_ranger_mark',
      solid: true,
      name: 'Метка егеря',
      qMark: true
    });
    mark = o;
    if (!fg('q4_mark_seen')) {
      fs('q4_mark_seen', 1);
      toast('По запискам егеря складывается место: метка у старой гати, к северу.', 'info');
      chron('Записки егеря сложились в карту: метка — у старой гати.', 'find');
    }
    return o;
  }

  function defRangerQuest() {
    defQuest({
      id: 'ranger_cache',
      title: 'Схрон егеря',
      desc: 'Записки лесной стражи обещают тайник: «под камнем у гати, ' +
            'где река крутит». Собери обе части карты, найди метку ' +
            'и раскопай снег лопатой.',
      reward: 'Егерский схрон: ружьё, припасы, капканы',
      steps: [
        { id: 'map1', text: 'Найти записку егеря (лист третий)', done: function () {
            return noteRead('tim3');
          } },
        { id: 'map2', text: 'Найти записку егеря (лист четвёртый)', done: function () {
            return noteRead('tim4');
          } },
        { id: 'spot', text: 'Отыскать метку у старой гати', done: function () {
            var s = markSpot();
            return playerDist(s.x + 0.5, s.y + 0.5) < 6 || !!fg('q4_dug');
          } },
        { id: 'dig', text: 'Раскопать схрон (нужна лопата)', done: function () {
            return !!fg('q4_dug');
          } }
      ],
      onComplete: function () {
        chron('Схрон егеря вскрыт: ружьё, припасы, капканы — всё на месте.', 'find');
      }
    });
  }

  /** Начало: прочитана любая из двух «карт»-записок. */
  function rangerStartCheck() {
    if (state('ranger_cache')) return;
    if (noteRead('tim3') || noteRead('tim4')) {
      startQuest('ranger_cache');
      placeRangerMark();
    }
  }

  // ====================================================================
  //  КВЕСТ 5. «СВЕТ В ОКНЕ» — спящие дезертиры
  // ====================================================================

  var den = null;     // {b, lamp, crate, bandits: [ent], spotted}

  /** Изба для дезертиров: дальняя от центра, жилая. */
  function denHouse() {
    var w = WS.World;
    if (!w || !w.buildings) return null;
    var hx = fg('q5_hx'), hy = fg('q5_hy');
    if (typeof hx === 'number') return houseAt(hx, hy);
    var seed = (G() && typeof G().seed === 'number') ? (G().seed >>> 0) : 741095;
    var R = WS.RNG.mk(((seed ^ 0x11DE2) >>> 0));
    var best = null, bd = -1;
    for (var i = 0; i < w.buildings.length; i++) {
      var b = w.buildings[i];
      if (!b || (b.type !== 'izba' && b.type !== 'izba_rich' && b.type !== 'dacha')) continue;
      var d = WS.M.dist(b.x + b.w / 2, b.y + b.h / 2, 110, 115);
      if (d > bd) { bd = d; best = b; }
    }
    if (!best) {
      for (var k = 0; k < w.buildings.length; k++) {
        if (w.buildings[k] && w.buildings[k].type === 'izba') { best = w.buildings[k]; break; }
      }
    }
    if (best) {
      fs('q5_hx', best.x);
      fs('q5_hy', best.y);
    }
    return best;
  }

  /**
   * Разместить «логово»: лампа на столе, ящик, 2–3 спящих дезертира.
   * existing — члены ещё живы по флагам (после загрузки сейва).
   */
  function spawnDen() {
    var w = WS.World;
    if (!w || !w.addObject || !w.addEnt) return null;
    if (fg('q5_done')) return null;
    var b = denHouse();
    if (!b) return null;

    // уже стоит? (повторный вызов без резета мира)
    if (den && den.b === b) return den;

    var cx = b.x + b.w / 2, cy = b.y + b.h / 2;

    // лампа: тёплый свет в окнах (свой свет объект несёт сам)
    var pt = freeTileIn(b);
    var lamp = w.addObject({
      x: pt.x, y: pt.y - 0.2,
      sprName: 'q_lamp',
      solid: false,
      name: 'Керосиновая лампа',
      light: 46,
      flicker: true,
      z: 12
    });

    // ящик с припасами — у стены
    var cratePt = freeTileIn(b);
    var crate = w.addObject({
      x: cratePt.x, y: cratePt.y,
      sprName: 'ai_crate',
      solid: true,
      name: 'Ящик дезертиров',
      container: 'deserter_den',
      qCrate: true,
      z: 2
    });

    // дезертиры: своя группа с «лагерем» в доме (сидят у лампы)
    var group = {
      camp: { x: cx, y: cy },
      members: [],
      initSize: 3,
      patrol: [],
      alertT: 0, angryT: 0, routed: false, healT: 0,
      qDen: true
    };
    var weapons = ['rifle', 'rifle', 'knife'];
    var bandits = [];
    for (var i = 0; i < 3; i++) {
      if (fg('q5_dead_' + i)) continue;      // погиб в прошлой сессии
      var spot = freeTileIn(b);
      var spr = weapons[i] === 'rifle' ? 'bandit' : 'bandit_knife';
      var e = w.addEnt({
        kind: 'bandit',
        id: 'q_deserter_' + i,
        x: spot.x, y: spot.y,
        dir: 4,
        hp: 80, maxHp: 80,
        speed: 2.0,
        weapon: weapons[i],
        ammo: weapons[i] === 'rifle' ? 6 : 0,
        sprName: spr,
        sprFrame: 3,               // сидят/дремлют
        animFrames: 2,
        restFrame: 3,
        shadowR: 0.42,
        state: 'camp', stateT: 0,
        atkCd: 0, lungeT: 0,
        aimT: 0, shootCd: 0,
        routeIdx: 0, routeWait: 0,
        lastSeen: null, loseT: 0,
        sight: 12,
        brain: { hears: true, noInside: false },
        group: group,
        qDeserter: true,
        qIdx: i
      });
      group.members.push(e);
      bandits.push(e);
    }
    group.initSize = Math.max(1, bandits.length);

    den = { b: b, lamp: lamp, crate: crate, bandits: bandits, spotted: false };
    return den;
  }

  /** Ночь: условие появления «света в окне». */
  function denNightCheck() {
    var g = G();
    if (!g || !g.running || g.dead) return;
    if (fg('q5_spawned') || state('light_window')) return;
    if (day() < DEN_DAY) return;
    fs('q5_spawned', 1);
    var made = spawnDen();
    if (!made) { fs('q5_spawned', 0); return; }
    startQuest('light_window');
    toast('На юге, в дальней избе — жёлтый свет в окне. Днём его там не было.', 'warn');
    chron('В дальней избе ночью горит свет. Живые? Или чужие?', 'anom');
    snd('match', undefined, undefined, 0.3);
  }

  function defDenQuest() {
    defQuest({
      id: 'light_window',
      title: 'Свет в окне',
      desc: 'В дальней избе кто-то жжёт лампу и не выходит. Судя по всему — ' +
            'дезертиры с прошлогодней войны: спят в тепле, оружие рядом. ' +
            'Можно красться (Ctrl — крадучись) и обчистить ящик, ' +
            'а можно войти с ружьём. И то и другое — решение.',
      reward: 'Трофеи дезертиров: оружие, патроны, тёплые вещи',
      steps: [
        { id: 'find', text: 'Отыскать избу со светом', done: function () {
            var hx = fg('q5_hx'), hy = fg('q5_hy');
            if (typeof hx !== 'number') return false;
            var b = houseAt(hx, hy);
            if (!b) return false;
            return playerDist(b.x + b.w / 2, b.y + b.h / 2) < 9 || !!fg('q5_done');
          } },
        { id: 'deal', text: 'Разобраться с дезертирами (бой или кража)', done: function () {
            return !!fg('q5_done');
          } }
      ],
      onComplete: function () {
        if (den && den.spotted) {
          chron('Изба дезертиров пуста. Окно погасло.', 'find');
        } else {
          chron('Обчистил ящик дезертиров, не разбудив их. Тихая работа.', 'find');
          addSanity(6);
          if (P() && P().skills && WS.Skills) {
            // тихая работа прибавляет сноровки
            try { WS.Skills.addXp('sneak', 40); } catch (e) { /* пусто */ }
          }
        }
      }
    });
  }

  /** Живые ли ещё дезертиры логова. */
  function denAlive() {
    if (!den || !den.bandits) return 0;
    var n = 0;
    for (var i = 0; i < den.bandits.length; i++) {
      if (den.bandits[i] && !den.bandits[i].dead) n++;
    }
    return n;
  }

  /** Убийство дезертира: заметка, флаг, проверка завершения. */
  function onDeserterKill(e) {
    if (!e || !e.qDeserter) return;
    fs('q5_dead_' + (e.qIdx || 0), 1);
    // если убивали в этой сессии — «спалённые»
    if (den) den.spotted = true;
    if (state('light_window') === 'active' && denAlive() === 0) {
      fs('q5_done', 1);
      // свет в окне гаснет
      if (den) {
        if (den.lamp) {
          try { WS.World.removeObject(den.lamp); } catch (err) { /* пусто */ }
        }
        den.lamp = null;
      }
      toast('Последний дезертир затих. Окно погасло.', 'good');
      completeQuest('light_window');
    }
  }

  /** Обыск ящика: тихо или после боя — завершает квест. */
  function onCrateSearched(o) {
    if (!o || !o.qCrate) return;
    if (!state('light_window')) startQuest('light_window', true);
    if (state('light_window') !== 'active') return;
    fs('q5_done', 1);
    if (denAlive() > 0 && den && !den.spotted) {
      toast('Ящик обчищен тихо. Кто бы ни спал наверху — он не проснулся.', 'good');
    } else if (den) {
      den.spotted = true;
    }
    completeQuest('light_window');
  }

  // ====================================================================
  //  ТИК: прогресс, метка-лопата, близость логова
  // ====================================================================

  var acc = 0;

  function questsTick(dt) {
    var g = G();
    if (!g || !g.running || g.dead) return;
    if (WS.Ui && WS.Ui.modal && WS.Ui.modal()) return;

    acc += dt;
    if (acc < PROGRESS_IV) return;
    acc = 0;

    progressAll();
    markInteract();
  }

  /**
   * Метка егеря: [E] рядом с лопатой — раскопать. Без лопаты —
   * честный отказ. Раскопка подменяет метку схроном (контейнер
   * ranger_cache с ленивой генерацией) и сразу начинает обыск.
   */
  function markInteract() {
    var w = WS.World;
    if (!w || fg('q4_dug')) return;
    var m = mark;
    if (!m || m.dead) {
      // после загрузки — восстановить ссылку по объекту
      m = null;
      for (var i = 0; i < w.objects.length; i++) {
        if (w.objects[i] && w.objects[i].qMark) { m = w.objects[i]; break; }
      }
      if (!m) return;
      mark = m;
    }
    var p = P();
    if (!p || p.sleeping) return;
    if (playerDist(m.x, m.y) > 1.7) return;

    // подсказка
    if (WS.Ui && WS.Ui.hint) {
      try {
        WS.Ui.hint(invCount('shovel') > 0 ? 'Раскопать схрон' : 'Нужна лопата');
      } catch (e) { /* пусто */ }
    }
    if (!WS.Input || !WS.Input.hit || !WS.Input.hit('interact')) return;
    if (WS.Action && WS.Action.interactTarget) {
      try { if (WS.Action.interactTarget()) return; } catch (e2) { /* пусто */ }
    }

    if (invCount('shovel') <= 0) {
      toast('Снег слежался в лёд: без лопаты не раскопать.', 'warn');
      snd('error', undefined, undefined, 0.5);
      return;
    }

    // раскопка: метка -> вскрытый схрон
    fs('q4_dug', 1);
    try { w.removeObject(m); } catch (e3) { /* пусто */ }
    mark = null;
    snd('mine', m.x, m.y, 0.8);
    try { WS.Ev.emit('noise', { x: m.x, y: m.y, r: 14 }); } catch (e4) { /* пусто */ }
    var cache = w.addObject({
      x: m.x, y: m.y,
      sprName: 'cabbage_pit',
      solid: true,
      name: 'Раскрытый схрон егеря',
      container: 'ranger_cache'
    });
    toast('Снег поддался: под ним — брезент и запах оружейной смазки.', 'good');
    chron('Раскопал схрон егеря по метке у старой гати.', 'find');
    // сразу обыск — система лута наполнит по таблице и откроет окно
    if (WS.Loot && WS.Loot.search) {
      try { WS.Loot.search(cache); } catch (e5) { WS.err('quests: dig search', e5 && e5.message); }
    }
  }

  // ====================================================================
  //  СОБЫТИЯ: записки, обыски, смерти, дни, ночи
  // ====================================================================

  /** Чтение записки (E2 emit 'story:note'). */
  function onNote(d) {
    var id = d && d.noteId;
    if (!id) return;
    if (id === 'tim1' || id === 'tim2') timoStartCheck();
    if (id === 'tim3' || id === 'tim4') {
      rangerStartCheck();
      placeRangerMark();
    }
    progressAll();
  }

  /** Обыск контейнера: половица Тимофеича, ящик дезертиров. */
  function onLootSearched(d) {
    var o = d && d.o;
    if (!o) return;
    if (o.qLoose) {
      fs('q2_taken', 1);
      toast('Под половицей: ружьё, патроны и свёрнутый лист.', 'good');
      // квест мог не начаться, если записки не читали — честно закрываем
      if (!state('timo_gun')) startQuest('timo_gun', true);
      completeQuest('timo_gun');
    }
    if (o.qCrate) {
      onCrateSearched(o);
    }
  }

  /** Смерть сущности: вожак, дезертиры. */
  function onEntKill(d) {
    var e = d && d.ent;
    if (!e) return;
    if (e.qalpha) onAlphaKill(d);
    if (e.qDeserter) onDeserterKill(e);
  }

  /** Новый день: автостарты, подсказки. */
  function onDay(d0) {
    var g = G();
    if (!g || !g.running || g.dead) return;
    var d = (d0 && d0.day) ? d0.day : day();
    void d;
    childAutoCheck();
    timoStartCheck();
    rangerStartCheck();
    timoHintCheck();
    progressAll();
  }

  /** Ночь: вожак и дезертиры. */
  function onNightFall() {
    var g = G();
    if (!g || !g.running || g.dead) return;
    alphaNightCheck();
    denNightCheck();
  }

  /** Ребёнок спасён (E1): закрыть квест красиво. */
  function onChildSaved() {
    childAutoCheck();
    if (state('child_village') === 'active') {
      progressCheck('child_village');
      completeQuest('child_village');
    }
  }

  /** Ребёнок потерян (E1): провал квеста. */
  function onChildLost() {
    childAutoCheck();
    if (state('child_village') === 'active') {
      failQuest('child_village', 'мальчик не дожил');
    }
  }

  /** Генерация мира: расставить квестовые объекты (по флагам партии). */
  function onGenInteriors() {
    try {
      mark = null;
      den = null;
      placeLooseFloor();
      placeRangerMark();
    } catch (e) {
      WS.err('quests: gen:', e && e.message);
    }
  }

  /** Загрузка сейва: мир пересобран генератором — восстановить живое. */
  function onGameLoad() {
    try {
      // вожак ещё жив и не убит — вернуть зверя
      if (fg('q_alpha_alive') && !fg('q3_done')) {
        spawnAlpha();
      }
      // логово дезертиров ещё не разобрано
      if (fg('q5_spawned') && !fg('q5_done')) {
        spawnDen();
      }
      // тайник и метка — уже поставлены gen-обработчиком выше
      progressAll();
    } catch (e) {
      WS.err('quests: load:', e && e.message);
    }
  }

  // ====================================================================
  //  ПУБЛИЧНЫЙ API МОДУЛЯ
  // ====================================================================

  var Quests = {
    /** Зарегистрировать квест (см. схему у defQuest). */
    def: defQuest,

    /** Журнал квестов: активные и завершённые. */
    list: listQuests,

    /** Счётчики: {active, done, failed}. */
    counts: counts,

    /** Один квест публичным видом (или null). */
    byId: function (id) { return state(id) ? viewOf(id) : null; },

    // управление
    start: startQuest,
    complete: completeQuest,
    fail: failQuest,
    state: state,
    isActive: isActive,
    isDone: isDone,

    /** Принудительный пересмотр этапов (для соседей). */
    progress: progressAll,

    /** Служебное: вожак жив? (для диалога Акима). */
    alphaAlive: function () {
      return !!(alpha && !alpha.dead) || !!fg('q_alpha_alive');
    },
    /** Служебное: логово дезертиров размещено? */
    denActive: function () { return !!den; },

    selftest: selftest
  };

  /** Самотест (консоль): реестр и целостность. */
  function selftest() {
    var out = [];
    var ok = function (name, cond) {
      out.push((cond ? '  ok  ' : ' FAIL ') + name);
      return !!cond;
    };
    ok('пять квестов в реестре', order.length === 5);
    ok('ребёнок в реестре', !!registry.child_village);
    ok('ружьё в реестре', !!registry.timo_gun);
    ok('вожак в реестре', !!registry.wolf_leader);
    ok('схрон в реестре', !!registry.ranger_cache);
    ok('свет в окне в реестре', !!registry.light_window);
    ok('у квестов есть шаги', (function () {
      for (var i = 0; i < order.length; i++) {
        var q = registry[order[i]];
        if (!q.steps || !q.steps.length) return false;
      }
      return true;
    })());
    ok('list() без партии не падает', (function () {
      try { listQuests(); return true; } catch (e) { return false; }
    })());
    ok('счётчики без партии не падают', (function () {
      try { counts(); return true; } catch (e) { return false; }
    })());
    ok('шкура вожака объявлена', !!(WS.Data && WS.Data.items && WS.Data.items.alpha_pelt));
    ok('спрайты объявлены', !!(WS.Spr.specs && WS.Spr.specs().q_floor_loose &&
      WS.Spr.specs().q_ranger_mark && WS.Spr.specs().q_lamp));
    out.unshift('quests.selftest: пройдено');
    return out;
  }

  // ====================================================================
  //  BOOT
  // ====================================================================

  WS.boot(function initQuests() {
    defLooseSprite();
    defMarkSprite();
    defLampSprite();
    declareItems();
    declareTimoTable();

    // определения квестов
    defChildQuest();
    defTimoQuest();
    defAlphaQuest();
    defRangerQuest();
    defDenQuest();

    // поведение вожака — в реестре ИИ
    if (WS.AI && WS.AI.register) {
      WS.AI.register('alpha_wolf', updateAlpha);
    } else {
      WS.warn('quests: нет WS.AI — вожак не оживёт');
    }

    // тик прогресса и метки
    WS.tick(TICK_PRI, questsTick, 'quests:main');

    // события мира и времени
    WS.Ev.on('gen:interiors', onGenInteriors);
    WS.Ev.on('game:load', onGameLoad);
    WS.Ev.on('time:day', onDay);
    WS.Ev.on('night:fall', onNightFall);
    WS.Ev.on('story:note', onNote);
    WS.Ev.on('loot:searched', onLootSearched);
    WS.Ev.on('ent:kill', onEntKill);

    // сюжетные вехи ребёнка (E1)
    WS.Ev.on('story:child_saved', onChildSaved);
    WS.Ev.on('story:child_lost', onChildLost);

    WS.log('[Quests] квестовая система готова: ' + order.length + ' дел на зиму');
  }, 'quests:init');

  WS.def('Quests', Quests);
})();
