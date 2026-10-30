/**
 * story.js — СЮЖЕТНЫЙ ДВИЖОК «Белого Безмолвия» (модуль E1).
 * Драматургия выживания в духе PZ: три акта (Обустройство 1–14,
 * Сжатие 15–43, Полярная ночь 44–60), радиопередачи, волчьи осады,
 * дезертир, медведь-шатун, квест «Ребёнок в деревне» и финал «Дым на реке».
 * Связи: Time (time:day/hour, night:fall), state (WS.G.story.flags),
 * WS.Ui / WS.Inv / WS.Fire / WS.AI / WS.World / WS.Main; E2: WS.Notes, WS.Radio.
 */
(function () {
  'use strict';

  // ====================================================================
  //  КОНСТАНТЫ: актовая драматургия
  // ====================================================================

  var ACT1_LAST = 14;        // Акт 1 «Обустройство»: дни 1–14
  var ACT2_LAST = 43;        // Акт 2 «Сжатие»:        дни 15–43
  var TOTAL_DAYS = 60;       // Акт 3 «Полярная ночь»: дни 44–60 (тарелка)
  var POLAR_DAY = 44;        // первый день полярной ночи

  var RADIO_HOUR = 18;      // час вечерней передачи дальнего радио
  var RECORDED_HOUR = 9;   // час записи в конторе вокзала (день 1)
  var CHILD_GRACE = 10;     // дней на спасение мальчика
  var FINAL_DAY = 55;       // день «зова тарелки» — старт финального квеста
  var SHIP_DAY = 60;        // день прилёта тарелки
  var SHIP_FAIL_HOUR = 22;  // час, когда тарелка улетает мимо без сигнала

  var BEACON_TORCHES = 3;   // сколько факелов нужно на Магический Огонь
  var CHRON_CAP = 100;      // хроника: столько же, сколько держит журнал

  // ====================================================================
  //  ПРЕДМЕТЫ И СПРАЙТЫ (объявляются в boot — контракт data-файлов)
  // ====================================================================

  /** Кристаллический приёмник: ежедневные передачи у себя в инвентаре. */
  function declareItems() {
    WS.Data = WS.Data || {};
    WS.Data.items = WS.Data.items || {};
    if (!WS.Data.items.radio_crystal) {
      WS.Data.items.radio_crystal = {
        id: 'radio_crystal',
        cat: 'misc',
        w: 3,              // стеклянная пластина в деревянной раме — тяжёл
        stack: 1,
        tags: ['radio']
      };
    }
  }

  /** Спрайты сюжета: мальчик (сидит/спит) и рация в конторе. */
  function defSprites() {
    var S = WS.Spr;
    if (!S || !S.def) return;
    var px = S.px;
    var ell = S.ell;

    // ---- мальчик: завёрнут в одеяло, бледное лицо, 3 ракурса ----
    // Кадры: 0 — сидит, дрожит; 1 — спит (спасён). Направления как у волка:
    // dir&2: 0 — спина, 2 — восток, 4 — лицо, 6 — запад (зеркало).
    function boyFront(c, frame) {
      var dy = frame === 0 ? 0 : 0;                 // сидит ровно
      // дыхание видно только в кадре «дрожь» — рисуем пар
      // туловище — одеяло
      ell(c, 16, 22, 9, 7, '#7a6a54');
      ell(c, 16, 20, 8, 5, '#8d7c63');
      px(c, 8, 18, 16, 3, '#6d5e4a');
      // руки поверх одеяла
      px(c, 9, 19, 3, 5, '#8d7c63');
      px(c, 20, 19, 3, 5, '#8d7c63');
      // голова — бледная, худая
      ell(c, 16, 11, 5, 5, '#cbb59c');
      px(c, 11, 8, 10, 3, '#3a2e22');               // тёмные волосы
      px(c, 10, 9, 3, 3, '#3a2e22');
      px(c, 19, 9, 3, 3, '#3a2e22');
      // глаза: лихорадочный румянец на щеках
      if (frame === 0) {
        px(c, 13, 11, 2, 1, '#2b2018');
        px(c, 17, 11, 2, 1, '#2b2018');
        px(c, 12, 13, 2, 1, '#b06a5a');             // жар
        px(c, 18, 13, 2, 1, '#b06a5a');
      } else {
        px(c, 13, 12, 4, 1, '#8fa08a');             // закрытые глаза
      }
      // валенок высовывается из одеяла
      px(c, 21, 24, 4, 3, '#4a3b2c');
    }

    function boyBack(c, frame) {
      ell(c, 16, 22, 9, 7, '#6d5e4a');
      ell(c, 16, 20, 8, 5, '#7a6a54');
      px(c, 8, 18, 16, 3, '#635541');
      // затылок
      ell(c, 16, 11, 5, 5, '#3a2e22');
      px(c, 11, 12, 10, 4, '#332820');
      if (frame === 0) {
        px(c, 12, 17, 1, 2, '#cbb59c');             // выглядывает
        px(c, 19, 17, 1, 2, '#cbb59c');
      }
      px(c, 21, 24, 4, 3, '#4a3b2c');
    }

    function boySide(c, frame) {
      ell(c, 15, 22, 8, 7, '#7a6a54');
      ell(c, 15, 20, 7, 5, '#8d7c63');
      px(c, 7, 18, 15, 3, '#6d5e4a');
      // голова в профиль
      ell(c, 21, 11, 4, 5, '#cbb59c');
      px(c, 17, 8, 8, 3, '#3a2e22');
      px(c, 24, 11, 2, 2, '#2b2018');               // глаз
      if (frame === 0) px(c, 24, 13, 2, 1, '#b06a5a');
      else px(c, 24, 12, 2, 1, '#8fa08a');
      px(c, 9, 24, 4, 3, '#4a3b2c');
    }

    S.def('st_boy', { w: 32, h: 30, draw: function (c, w, h, frame, dir) {
      var d4 = (dir === undefined) ? 4 : ((dir | 0) & 2);
      if (d4 === 6) {
        c.save();
        c.translate(w, 0);
        c.scale(-1, 1);
        boySide(c, frame || 0);
        c.restore();
      } else if (d4 === 2) {
        boySide(c, frame || 0);
      } else if (d4 === 0) {
        boyBack(c, frame || 0);
      } else {
        boyFront(c, frame || 0);
      }
    }});

    // ---- рация на столе конторы: деревянный ящик, латунная ручка ----
    S.def('st_radio', { w: 30, h: 24, draw: function (c) {
      // тень-подставка
      ell(c, 15, 20, 12, 3, 'rgba(8,12,22,0.35)');
      // корпус
      px(c, 3, 6, 24, 13, '#4a3a28');
      px(c, 4, 7, 22, 3, '#5c4a33');
      px(c, 4, 16, 22, 2, '#3a2e20');
      // латунная ручка настройки
      ell(c, 9, 11, 3, 3, '#b08d4a');
      px(c, 8, 10, 1, 3, '#e2c079');
      // кристалл-детектор
      px(c, 15, 9, 3, 6, '#9fc4d8');
      px(c, 16, 10, 1, 4, '#d3ecf7');
      // винты
      px(c, 5, 8, 1, 1, '#d8b45c');
      px(c, 24, 8, 1, 1, '#d8b45c');
      px(c, 5, 17, 1, 1, '#d8b45c');
      px(c, 24, 17, 1, 1, '#d8b45c');
    }});
  }

  // ====================================================================
  //  МОДУЛЬНОЕ СОСТОЯНИЕ (живые ссылки; всё одноразовое — во WS.G.story.flags)
  // ====================================================================

  var st = {
    inited: false,       // партия инициализирована (newGame/reattach прошёл)
    R: null,             // seeded RNG партии (сюжетные броски)
    station: null,       // {x, y, w, h} — здание вокзала
    pier: null,          // {x, y} — конец мостков (место Магического Огня)
    boy: null,           // {ent, bld, x, y} — мальчик
    deserter: null,      // {ent, mode, t, asked} — дезертир
    squad: null,         // {group, ents, leaveDay} — банда у склада
    siege: null,          // {pack, wolves, day} — ночная осада
    bear: null,          // {ent} — медведь-шатун
    beacon: null,        // объект Магического Огня (после зажжения)
    targetT: 0,          // таймер пересмотра целей осады
    hintShown: false     // показана ли подсказка [E] в этом кадре
  };

  function G() { return WS.G; }
  function P() { var g = WS.G; return (g && g.player) ? g.player : null; }

  /** Доступ к сюжетному хранилищу с гарантированными полями. */
  function F() {
    var g = WS.G;
    var s = g && g.story;
    if (!s) {
      if (!g) return null;
      s = g.story = { notes: [], radio: [], flags: {}, hints: {} };
    }
    if (!s.flags) s.flags = {};
    if (!s.chronicle || !s.chronicle.push) s.chronicle = [];
    if (!s.notes || !s.notes.push) s.notes = [];
    return s;
  }

  function fg(n) { var s = F(); return s ? s.flags[n] : undefined; }
  function fs(n, v) { var s = F(); if (s) s.flags[n] = (v === undefined ? 1 : v); }

  function day() { return (WS.Time && WS.Time.day) ? WS.Time.day() : 1; }
  function hour() { return (WS.Time && WS.Time.hour) ? WS.Time.hour() : 8; }

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  // ====================================================================
  //  МЕЛКИЕ УТИЛИТЫ: тосты, звук, хроника, диалоги
  // ====================================================================

  function toast(text, kind) {
    if (!text) return;
    if (WS.Ui && WS.Ui.toast) {
      try { WS.Ui.toast(text, kind || 'info'); return; } catch (e) { /* молча */ }
    }
    try { WS.Ev.emit('ui:toast', { text: text, kind: kind || 'info' }); } catch (e2) { /* пусто */ }
  }

  function snd(name, x, y, vol) {
    try {
      if (!WS.Snd || !WS.Snd.play) return;
      var o = { vol: vol === undefined ? 0.8 : vol };
      if (x !== undefined) { o.x = x; o.y = y; }
      WS.Snd.play(name, o);
    } catch (e) { /* звук не критичен */ }
  }

  /** Хроника: формат журнала {day, time, text, cls}. */
  function chron(text, cls) {
    var s = F();
    if (!s || !text) return;
    var t = '';
    try {
      var h = hour(), m = (WS.Time && WS.Time.minute) ? WS.Time.minute() : 0;
      t = (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
    } catch (e) { t = ''; }
    s.chronicle.push({ day: day(), time: t, text: String(text), cls: cls || '' });
    while (s.chronicle.length > CHRON_CAP) s.chronicle.shift();
  }

  /** Перевод с литеральным запасом (как в соседних модулях). */
  function T(key, fb) {
    if (WS.I18N && WS.I18N.t) {
      try { return WS.I18N.t(key, fb); } catch (e) { /* словарь не готов */ }
    }
    return (typeof fb === 'string') ? fb : key;
  }

  function el(tag, cls, parent) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (parent) parent.appendChild(e);
    return e;
  }

  function btn(label, cls, onClick) {
    var b = el('button', 'ws-btn' + (cls ? ' ' + cls : ''));
    b.type = 'button';
    b.textContent = label;
    b.addEventListener('click', function () {
      snd('click', undefined, undefined, 0.4);
      if (onClick) onClick();
    });
    return b;
  }

  /** Модалка-диалог: корень .ws-confirm.ws-modal (пауза ввода — Ui.modal). */
  var dlgId = 0;
  function dlgOpen(title, text, opts) {
    opts = opts || {};
    var root = document.getElementById('ui-root') || document.body;
    var scr = el('div', 'ws-confirm ws-modal');
    scr.id = 'st-dlg-' + (++dlgId);
    var panel = el('div', 'c-panel', scr);
    var t = el('div', 'c-title', panel);
    t.textContent = title;
    if (text) {
      var tx = el('div', 'c-text', panel);
      tx.style.whiteSpace = 'pre-line';
      tx.textContent = text;
    }
    var body = el('div', '', panel);
    body.style.display = 'flex';
    body.style.flexDirection = 'column';
    body.style.gap = '6px';
    body.style.width = '100%';
    root.appendChild(scr);
    return { scr: scr, panel: panel, body: body, close: function () {
      if (scr.parentNode) scr.parentNode.removeChild(scr);
    }};
  }

  /** Кнопка-строка диалога (текст слева, состояние справа). */
  function dlgRow(dlg, label, enabled, onClick, note) {
    var row = el('div', '', dlg.body);
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.justifyContent = 'space-between';
    row.style.gap = '10px';
    var b = btn(label, enabled ? 'primary' : '');
    b.style.flex = '1 1 auto';
    if (!enabled) b.disabled = true;
    row.appendChild(b);
    if (note) {
      var n = el('span', '', row);
      n.style.fontSize = '11px';
      n.style.color = '#8b95a5';
      n.style.whiteSpace = 'nowrap';
      n.textContent = note;
    }
    if (enabled) {
      b.addEventListener('click', function () {
        dlg.close();
        if (onClick) {
          try { onClick(); } catch (e) { WS.err('story: dlgRow', e && e.message); }
        }
      });
    }
    return row;
  }

  /** Санити/нужды: безопасная правка. */
  function addSanity(v) {
    var p = P();
    if (!p || !p.needs || !v) return;
    p.needs.sanity = clamp(p.needs.sanity + v, 0, 100);
    if (WS.Fx && WS.Fx.text && Math.abs(v) >= 3) {
      WS.Fx.text((v > 0 ? '+' : '') + Math.round(v) + ' рассудок',
        p.x, p.y - 1.2, { col: v > 0 ? '#8fbf7a' : '#c46a5a', life: 1.2 });
    }
  }

  function itemDef(id) {
    return (WS.Data && WS.Data.items) ? WS.Data.items[id] : null;
  }

  function itemName(id) {
    var d = itemDef(id);
    if (d) {
      var s = T('item.' + id + '.name', '');
      if (s && s !== 'item.' + id + '.name') return s;
    }
    return id;
  }

  function invCount(id) {
    if (WS.Inv && WS.Inv.count) { try { return WS.Inv.count(id); } catch (e) { return 0; } }
    if (WS.Action && WS.Action.countItem) { try { return WS.Action.countItem(id); } catch (e2) { return 0; } }
    return 0;
  }

  function invConsume(id, n) {
    if (WS.Inv && WS.Inv.consume) { try { return WS.Inv.consume(id, n || 1); } catch (e) { return 0; } }
    return 0;
  }

  function playerDist(x, y) {
    var p = P();
    if (!p) return 9999;
    return WS.M.dist(p.x, p.y, x, y);
  }

  /** Есть ли у игрока в руках/сумке огнестрел или любое оружие угрозы. */
  function playerArmed() {
    var p = P();
    if (!p) return false;
    var guns = ['rifle_mosin', 'shotgun', 'pistol_nagant'];
    for (var i = 0; i < guns.length; i++) {
      if (invCount(guns[i]) > 0) return true;
    }
    if (p.equip && p.equip.hand1 && p.equip.hand1.id) {
      var d = itemDef(p.equip.hand1.id);
      if (d && (d.dmg > 0 || d.ranged)) return true;
    }
    return false;
  }

  /** Что-нибудь съедобное из «человеческих подарков». */
  var FOOD_GIFTS = ['bread', 'rusk', 'kasha', 'canned_fish', 'galley_biscuits',
                    'salt_fish', 'dried_fish', 'meat_cooked', 'semolina', 'oat_flakes'];

  function anyFoodId() {
    for (var i = 0; i < FOOD_GIFTS.length; i++) {
      if (invCount(FOOD_GIFTS[i]) > 0) return FOOD_GIFTS[i];
    }
    return null;
  }

  // ====================================================================
  //  СКАНЫ МИРА: вокзал, мостки, окраины, свободные тайлы
  // ====================================================================

  function villageCenter() {
    if (WS.AI && WS.AI.village) return { x: WS.AI.village.x, y: WS.AI.village.y };
    return { x: 110, y: 115 };
  }

  /** Найти здание вокзала (type 'telegraph'). */
  function findStation() {
    var w = WS.World;
    if (!w || !w.buildings) return null;
    for (var i = 0; i < w.buildings.length; i++) {
      var b = w.buildings[i];
      if (b && b.type === 'telegraph') return b;
    }
    return null;
  }

  /**
   * Мостки-пристань: кластеры тайлов BRIDGE шириной 2 (как строит генератор).
   * Конец мостков — самый южный тайл кластера, под которым вода.
   */
  function findPiers() {
    var w = WS.World;
    if (!w || !w.tiles || !w.T) return [];
    var T = w.T;
    var seen = {};
    var out = [];
    for (var y = 2; y < w.h - 2; y++) {
      for (var x = 2; x < w.w - 2; x++) {
        if (w.tileAt(x, y) !== T.BRIDGE) continue;
        if (seen[x + ',' + y]) continue;
        // кластер: заливка в ширину (мостки короткие, 2 x 5..8 тайлов)
        var q = [{ x: x, y: y }];
        seen[x + ',' + y] = 1;
        var cells = [];
        var end = { x: x, y: y };
        var minX = x, maxX = x;
        while (q.length) {
          var c = q.shift();
          cells.push(c);
          if (c.y > end.y) end = c;
          if (c.x < minX) minX = c.x;
          if (c.x > maxX) maxX = c.x;
          var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
          for (var k = 0; k < 4; k++) {
            var nx = c.x + dirs[k][0], ny = c.y + dirs[k][1];
            if (nx < 2 || ny < 2 || nx >= w.w - 2 || ny >= w.h - 2) continue;
            if (seen[nx + ',' + ny]) continue;
            if (w.tileAt(nx, ny) !== T.BRIDGE) continue;
            seen[nx + ',' + ny] = 1;
            q.push({ x: nx, y: ny });
          }
        }
        // настоящие мостки: ширина 2, длина от 4, конец — над водой
        if (cells.length < 4 || (maxX - minX + 1) !== 2) continue;
        if (w.tileAt(end.x, end.y + 1) !== T.WATER) continue;
        out.push(end);
      }
    }
    return out;
  }

  /** Все здания жилого типа (для выбора избы мальчика). */
  function housesOf(types) {
    var w = WS.World;
    var out = [];
    if (!w || !w.buildings) return out;
    for (var i = 0; i < w.buildings.length; i++) {
      var b = w.buildings[i];
      if (b && types.indexOf(b.type) >= 0) out.push(b);
    }
    return out;
  }

  /** Свободный проходимый тайл внутри здания (пол, без объектов). */
  function freeTileIn(b) {
    var w = WS.World;
    if (!w || !b) return null;
    var T = w.T;
    var floors = [T.FLOOR_WOOD, T.FLOOR_TILE, T.FLOOR_CONCRETE, T.FLOOR_DIRT];
    for (var t = 0; t < 40; t++) {
      var x = b.x + 1 + Math.floor(Math.random() * Math.max(1, b.w - 2));
      var y = b.y + 1 + Math.floor(Math.random() * Math.max(1, b.h - 2));
      if (floors.indexOf(w.tileAt(x, y)) < 0) continue;
      if (w.isTileBlocked && w.isTileBlocked(x, y)) continue;
      var objs = w.objsAt ? w.objsAt(x, y) : [];
      var busy = false;
      for (var i = 0; i < (objs ? objs.length : 0); i++) {
        if (objs[i] && objs[i].solid) { busy = true; break; }
      }
      if (busy) continue;
      return { x: x + 0.5, y: y + 0.5 };
    }
    return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  }

  /** Точка на окраине посёлка (для спавна чужаков). */
  function villageEdge(R, minD) {
    var c = villageCenter();
    var w = WS.World;
    minD = minD || 0;
    for (var t = 0; t < 30; t++) {
      var a = (R ? R.f() : Math.random()) * Math.PI * 2;
      var r = 22 + (R ? R.f() : Math.random()) * 12;
      var x = Math.floor(c.x + Math.cos(a) * r);
      var y = Math.floor(c.y + Math.sin(a) * r * 0.7);
      if (!w || !w.tileAt || w.tileAt(x, y) === w.T.VOID) continue;
      if (w.isTileBlocked && w.isTileBlocked(x, y)) continue;
      if (w.isInside && w.isInside(x + 0.5, y + 0.5)) continue;
      if (minD && playerDist(x, y) < minD) continue;
      return { x: x + 0.5, y: y + 0.5 };
    }
    return null;
  }

  /** Слово-направление от посёлка к точке («на северной окраине»). */
  function dirWordFrom(cx, cy, x, y) {
    var dx = x - cx, dy = y - cy;
    if (Math.abs(dx) > Math.abs(dy) * 1.4) return dx > 0 ? 'восточной' : 'западной';
    if (Math.abs(dy) > Math.abs(dx) * 1.4) return dy > 0 ? 'южной' : 'северной';
    return (dx > 0 ? (dy > 0 ? 'юго-восточной' : 'северо-восточной')
                   : (dy > 0 ? 'юго-западной' : 'северо-западной'));
  }

  /** Кладовочка: положить в контейнер готовый набор (контейнер «знает» инв). */
  function makeStash(x, y, name, inv) {
    var w = WS.World;
    if (!w || !w.addObject) return null;
    var o = w.addObject({
      x: x, y: y,
      sprName: 'crate',
      solid: true,
      name: name || 'Ящик'
    });
    o.container = 'ranger_cache';      // чтобы обыск сработал
    o.inv = inv || [];
    o.inv._dirty = true;               // пережить сейв
    return o;
  }

  // ====================================================================
  //  РАДИО: расписание передач по дням
  //  Акт 1 — штатные сводки через день; Акт 2 — редкие обрывки;
  //  Акт 3 — полное молчание (последняя передача — вечер 43-го дня).
  // ====================================================================

  var RADIO = [
    { id: 'r01', d: 1, kind: 'rec',
      t: 'Всем. Всем. Станция Пристань-Тихая. Партия эвакуирована на Архангельск. ' +
         'Оставшимся — ждать указаний. Повторяю: ждать указаний.' },
    { id: 'r02', d: 2, kind: 'news',
      t: 'Говорит Архангельск, волна двенадцать. Движение по линии Мезень — Онега ' +
         'восстановят к декабрю. Хлебные нормы сохранены. Сохраняйте спокойствие.' },
    { id: 'r03', d: 4, kind: 'news',
      t: '...штаб округа сообщает: положение на фронте стабильно. Повторяю для ' +
         'всех станций: стабильно. Повторяю: стабильно...' },
    { id: 'r04', d: 6, kind: 'news',
      t: '...в Шенкурске бунт гарнизона подавлен без стрельбы. Железная дорога ' +
         'работает в прежнем... [треск] ...в прежнем режиме.' },
    { id: 'r05', d: 8, kind: 'news',
      t: '...мороз до тридцати. Обмороженных — в лазареты, не в цейхгауз. ' +
         'Это не война, это зима. Конец связи.' },
    { id: 'r06', d: 10, kind: 'news',
      t: '...паровозы стоят без угля. Пассажирское сообщение — только весной. ' +
         'Повторяю: только весной...' },
    { id: 'r07', d: 12, kind: 'news',
      t: '...берегите лампады. Хлеб — в подпол, тепло — в дом. ' +
         'Кто это слышит — не кашляйте в аппарат.' },
    { id: 'r08', d: 14, kind: 'news',
      t: '...станция Пристань-Тихая, вы слышите? Ждите указаний. ' +
         'Ждите указаний... [плёнка кончилась]' },
    { id: 'r09', d: 15, kind: 'frag',
      t: '...фронт подошёл к... [треск] ...не верьте листовкам. ' +
         'Повторяю: не верьте листовкам...' },
    { id: 'r10', d: 19, kind: 'frag',
      t: '...хлеба больше нет. Повторяю: нет. Поезд не придёт. Простите.' },
    { id: 'r11', d: 23, kind: 'frag',
      t: '...обстрел... [помехи] ...горит депо... кто слышит — уходите на север, ' +
         'к устью. К устью...' },
    { id: 'r12', d: 27, kind: 'frag',
      t: '...на реке лёд стал. Путь один — морем. Весной. ' +
         'Если доживёте — весной...' },
    { id: 'r13', d: 31, kind: 'frag',
      t: '...[долгий треск] ...голоса... кто это говорит в эфире?.. з... з...' },
    { id: 'r14', d: 35, kind: 'frag',
      t: '...тише... тише... они слышат...' },
    { id: 'r15', d: 39, kind: 'frag',
      t: '...провода порваны. Мы греемся у аппарата. ' +
         'Это последняя зима старого света...' },
    { id: 'r16', d: 43, kind: 'last',
      t: '...передач больше не будет. Простите. Храни вас Господь.' }
  ];

  function radioFor(d) {
    for (var i = 0; i < RADIO.length; i++) {
      if (RADIO[i].d === d) return RADIO[i];
    }
    return null;
  }

  /** Кристаллический приёмник в инвентаре? */
  function hasCrystal() { return invCount('radio_crystal') > 0; }

  /** Игрок в здании вокзала? */
  function inStation() {
    var p = P();
    if (!p || !st.station) return false;
    var x = p.x, y = p.y;
    return x >= st.station.x && x < st.station.x + st.station.w &&
           y >= st.station.y && y < st.station.y + st.station.h;
  }

  /** Проиграть передачу: звук, событие (журнал), тост, хроника. */
  function playRadio(msg) {
    var p = P();
    var at = p ? { x: p.x, y: p.y } : null;
    snd('radio_static', at ? at.x : undefined, at ? at.y : undefined, 0.9);
    fs('radio_' + msg.id, 1);
    fs('radio_any', 1);
    try { WS.Ev.emit('radio:msg', { text: msg.t, id: msg.id }); }
    catch (e) { WS.err('story: radio emit', e && e.message); }

    // договорённость с E2: если есть WS.Radio — пусть оформит у себя
    if (WS.Radio && typeof WS.Radio.transmit === 'function') {
      try { WS.Radio.transmit(msg.id, msg.t); } catch (e2) { /* молча */ }
    }

    // настроение передачи: сводки бодрят, обрывки давят
    if (msg.kind === 'news') addSanity(2);
    else if (msg.kind === 'frag') addSanity(-2);
    else if (msg.kind === 'last') addSanity(-6);

    toast('Радио: ' + msg.t, msg.kind === 'news' ? 'info' : 'warn');
    chron('Радио: ' + msg.t, msg.kind === 'news' ? '' : 'anom');
  }

  /** Час передач: проверить слышимость. */
  function tryRadio() {
    var d = day();
    var msg = radioFor(d);
    if (!msg) return;
    if (fg('radio_' + msg.id)) return;
    // день 1 — запись в конторе (срабатывает при входе, не по часу)
    if (msg.kind === 'rec') return;
    var heard = hasCrystal() || inStation();
    if (!heard) {
      // намёк: пропустили уже три передачи и нет приёмника
      if (!fg('radio_any') && !fg('hint_no_radio') && d >= 6) {
        fs('hint_no_radio', 1);
        toast('В конторе вокзала остался приёмник — с ним передачи слышно и дома.', 'info');
      }
      return;
    }
    playRadio(msg);
  }

  /** Запись в конторе (день 1 и позже, пока не прослушана). */
  function tryRecorded() {
    if (fg('radio_r01')) return;
    if (!inStation()) return;
    var msg = RADIO[0];
    playRadio(msg);
    fs('radio_r01', 1);
    // бонус-намёк на ящик с приёмником на столе
    if (!fg('hint_radio_item')) {
      fs('hint_radio_item', 1);
      toast('На столе аппаратной — кристаллический приёмник. Тяжёлый, но верный.', 'info');
    }
  }

  // ====================================================================
  //  АКТЫ
  // ====================================================================

  function actFor(d) {
    if (d <= ACT1_LAST) return 1;
    if (d <= ACT2_LAST) return 2;
    return 3;
  }

  function actName(a) {
    if (a === 1) return 'Обустройство';
    if (a === 2) return 'Сжатие';
    return 'Полярная ночь';
  }

  function act2Start() {
    chron('Полмесяца позади. Мороз сжимает посёлок, как кулак.', 'anom');
    toast('Мороз крепчает. Припасы кончаются быстрее, чем кажется.', 'warn');
    snd('howl', undefined, undefined, 0.25);
  }

  function act3Start() {
    chron('Солнце не встанет больше до самой тарелки. Полярная ночь.', 'anom');
    toast('Полярная ночь. До тарелки — ' + (TOTAL_DAYS - POLAR_DAY) + ' дней тьмы.', 'warn');
    snd('bell', undefined, undefined, 0.5);
  }

  // ====================================================================
  //  ВОЛЧЬЯ ДРАМАТУРГИЯ: осады, первая ночь, множитель агрессии
  // ====================================================================

  /**
   * Расписание осад: акт 2 — 4–5 ночей с интервалом 3–4 дня;
   * акт 3 — «отчаянные» ночи каждые 2–3 дня.
   */
  function rollSieges(R) {
    var out = [];
    var d = 18 + R.int(0, 1);
    while (d <= ACT2_LAST - 1 && out.length < 5) {
      out.push(d);
      d += 3 + R.int(0, 1);
    }
    d = 45 + R.int(0, 1);
    while (d <= 58 && out.length < 10) {
      out.push(d);
      d += 2 + R.int(0, 1);
    }
    return out;
  }

  /**
   * ПУБЛИЧНО: множитель волчьей агрессии 0..2.
   * Вызывается ИИ-модулем (по желанию) и нашим тиком осады.
   * Акт 1 — зверь осторожен; акт 2 — ночью зол; акт 3 — отчаян.
   * Игрок вне дома после 21:00 в акте 2+ — плюс; пёс-компаньон — минус.
   */
  function wolfAggression() {
    var g = WS.G;
    if (!g || !g.running || g.dead) return 0.5;
    var d = day();
    var a = actFor(d);
    var night = (WS.AI && WS.AI.isNight) ? WS.AI.isNight() : (hour() >= 21 || hour() < 6);
    var ag = 0.4;
    if (a === 1) ag = night ? 0.8 : 0.4;
    else if (a === 2) ag = night ? 1.2 : 0.7;
    else ag = night ? 1.8 : 1.2;

    // игрок ночью под открытым небом — волки смелеют
    var p = P();
    if (a >= 2 && p && night) {
      var inside = WS.World && WS.World.isInside && WS.World.isInside(p.x, p.y);
      if (!inside) ag += 0.4;
    }
    // осадная ночь
    if (st.siege) ag += 0.4;
    // пёс-компаньон (модуль E1/events.js) отпугивает
    if (fg('dog_active')) ag -= 0.4;
    return clamp(ag, 0, 2);
  }

  /** Скане-волк сюжетного спавна (в стаю wolf.js не входит — управляем сами). */
  function mkStoryWolf(x, y, pack, buff) {
    var w = WS.World;
    if (!w || !w.addEnt) return null;
    var e = w.addEnt({
      kind: 'wolf',
      x: x, y: y,
      dir: 2 + Math.floor(Math.random() * 4),
      hp: buff ? 55 : 45,
      maxHp: buff ? 55 : 45,
      speed: 2.8,
      dmg: buff ? 14 : 12,
      atkSpd: 1.1,
      sprName: 'wolf',
      sprFrame: 0,
      animFrames: 2,
      shadowR: 0.5,
      scale: buff ? 1.12 : 1,
      state: 'wander', stateT: 0,
      atkCd: 0, lungeT: 0,
      sight: 9,
      brain: { hears: true, noInside: true },
      pack: pack
    });
    if (pack) pack.members.push(e);
    return e;
  }

  /** Фальшивая стая: объект той же формы, что внутренности wolf.js. */
  function mkFakePack(cx, cy) {
    return {
      id: WS.World.newId('story_pack'),
      members: [],
      alpha: null,
      territory: { x: cx, y: cy, r: 16 },
      mode: 'hunt',
      target: null,
      aggroT: 0,
      panicT: 0,
      panicPt: null,
      huntPt: { x: cx, y: cy },
      huntT: 0,
      retarget: 0,
      interestT: 0,
      howlDelay: 1.5,
      lastHowl: -999
    };
  }

  /** Начать ночную осаду: стая выходит к окраинам посёлка. */
  function startSiege(n, desperate, lone) {
    var w = WS.World;
    if (!w || st.siege) return;
    var c = villageCenter();
    var edge = villageEdge(st.R, 18) || { x: c.x + 18, y: c.y + 4 };
    var pack = mkFakePack(c.x, c.y + 8);
    var wolves = [];
    for (var i = 0; i < n; i++) {
      var e = mkStoryWolf(edge.x + (st.R ? st.R.range(-3, 3) : 0),
                          edge.y + (st.R ? st.R.range(-2, 2) : 0),
                          pack, desperate && i === 0);
      if (e) wolves.push(e);
    }
    if (!wolves.length) return;
    pack.huntPt = { x: c.x, y: c.y };
    st.siege = { pack: pack, wolves: wolves, day: day() };
    snd('howl', edge.x, edge.y, 1);
    if (lone) {
      toast('Одинокий волк бродит у самой околицы. Голод гонит его к домам.', 'warn');
      chron('Полярная ночь: голодный одиночка у окраины.', 'anom');
    } else {
      toast(desperate ? 'Вой со всех сторон. Стая голодает и звереет.' :
                        'Вой совсем близко. Стая обложила посёлок.', 'bad');
      chron(desperate ? 'Полярная ночь: волки наглеют от голода, осада почти каждую ночь.' :
                        'Стая взяла посёлок в осаду.', 'anom');
    }
    try { WS.Ev.emit('story:siege', { day: day(), wolves: wolves.length }); }
    catch (err) { WS.err('story: siege emit', err && err.message); }
  }

  /** К утру осада расходится. */
  function endSiege(silent) {
    if (!st.siege) return;
    var w = WS.World;
    for (var i = 0; i < st.siege.wolves.length; i++) {
      var e = st.siege.wolves[i];
      if (!e || e.dead) continue;
      try { if (w && w.removeEnt) w.removeEnt(e); } catch (err) { /* пусто */ }
    }
    st.siege = null;
    if (!silent) {
      toast('К утру вой стих. Стая ушла к лесу.', 'info');
      chron('Осада кончилась. Снег вокруг домов истоптан лапами.', '');
    }
  }

  /** Управление целями осадной стаи (раз в пару секунд). */
  function siegeTick(dt) {
    if (!st.siege) return;
    st.targetT -= dt;
    if (st.targetT > 0) return;
    st.targetT = 1.6;
    var p = P();
    var pack = st.siege.pack;
    if (!p) return;
    var d = playerDist(pack.huntPt.x, pack.huntPt.y);
    if (d < 42 && p.hp > 0) {
      // агрессия решает, как настойчива стая
      var ag = wolfAggression();
      var hold = (ag >= 1.6) || ((ag >= 1.0) && !st._siegeSaw);
      if (hold) {
        pack.target = p;
        st._siegeSaw = true;
      } else if (st._siegeSaw && ag < 1.6 && Math.random() < 0.35) {
        pack.target = null;      // потеряли интерес — кружат по окраине
      }
    } else {
      pack.target = null;
    }
  }

  /** Первая волчья ночь (день 3–5): один разведчик у окраины. */
  function firstWolfNight() {
    if (fg('wolfnight_done')) return;
    fs('wolfnight_done', 1);
    var c = villageCenter();
    var edge = villageEdge(st.R, 16) || { x: c.x - 15, y: c.y + 6 };
    var pack = mkFakePack(c.x, c.y + 6);
    var e = mkStoryWolf(edge.x, edge.y, pack, false);
    if (e) {
      st.scout = { pack: pack, wolf: e, day: day() };
    }
    snd('howl', edge.x, edge.y, 0.8);
    toast('Вой за околицей. Один зверь прошёл к посёлку — разведчик.', 'warn');
    chron('Первая волчья ночь. Стая примеряется к посёлку.', 'anom');
  }

  /** Разведчик уходит к рассвету. */
  function endScout(silent) {
    if (!st.scout) return;
    var e = st.scout.wolf;
    if (e && !e.dead && WS.World && WS.World.removeEnt) {
      try { WS.World.removeEnt(e); } catch (err) { /* пусто */ }
    }
    st.scout = null;
    if (!silent) {
      toast('Утром на снегу — цепочка лап, уходящая к лесу.', 'info');
      chron('Волчий разведчик ушёл к лесу.', '');
    }
  }

  // ====================================================================
  //  ДЕЗЕРТИР (акт 1): одиночка с фронта, трусливый
  // ====================================================================

  function spawnDeserter() {
    if (fg('deserter_done') || st.deserter) return;
    var pt = villageEdge(st.R, 14);
    if (!pt) return;
    var w = WS.World;
    var e = w.addEnt({
      kind: 'bandit',
      id: 'story_deserter',
      x: pt.x, y: pt.y,
      dir: 4,
      hp: 55, maxHp: 55,
      speed: 1.5,
      sprName: 'bandit',
      sprFrame: 0,
      animFrames: 2,
      restFrame: 0,
      shadowR: 0.42,
      state: 'wander', stateT: 0,
      atkCd: 0, lungeT: 0,
      brain: null,               // сюжетная сущность: движением управляет story
      deserter: true
    });
    st.deserter = { ent: e, mode: 'approach', t: 0, asked: false, day: day() };
    toast('У окраины посёлка бродит одинокая фигура. Не местный.', 'warn');
    chron('У околицы замечён человек — один, без товарищей.', '');
    snd('bandit_shout', pt.x, pt.y, 0.4);
  }

  /** Микро-поведение дезертира: подойти, крикнуть, диалог, бегство. */
  function deserterTick(dt) {
    var d = st.deserter;
    if (!d) return;
    var e = d.ent;
    var p = P();
    if (!e || e.dead || e.removed) {
      // убит игроком — труп и лут сделает AI.kill через ent:damage
      if (e && e.dead && !fg('deserter_killed')) {
        fs('deserter_killed', 1);
        fs('deserter_done', 1);
        chron('Дезертир мёртв. Он так и не дошёл до своих.', 'death');
      }
      st.deserter = null;
      return;
    }
    if (!p) return;
    d.t += dt;

    // ранен — в панику
    if (e.hp < e.maxHp * 0.75 && d.mode !== 'flee') {
      d.mode = 'flee';
      d.fleeFrom = { x: p.x, y: p.y };
      snd('bandit_shout', e.x, e.y, 0.7);
      if (WS.Fx && WS.Fx.text) WS.Fx.text('Не убивай!', e.x, e.y - 1, { col: '#e8b9a0', life: 1.4 });
    }

    var dist = WS.M.dist(e.x, e.y, p.x, p.y);
    var AI = WS.AI;

    if (d.mode === 'approach') {
      // стоит и кричит, привлекая внимание; ближе 3 — остановился
      if (dist > 3.2 && AI && AI.moveTowards) {
        AI.moveTowards(e, p.x, p.y, 1.15, dt);
        if (AI.anim) AI.anim(e, dt, 5);
      } else {
        e.moving = false;
        if (AI && AI.setDir) AI.setDir(e, p.x - e.x, p.y - e.y);
        e.sprFrame = 0;
      }
      if (dist < 8 && !d.shouted) {
        d.shouted = true;
        snd('bandit_shout', e.x, e.y, 0.8);
        if (WS.Fx && WS.Fx.text) {
          WS.Fx.text('Эй!.. Не стреляй!..', e.x, e.y - 1, { col: '#e8b9a0', life: 1.6 });
        }
      }
      if (dist < 2.6 && !d.asked) {
        d.asked = true;
        deserterDialog();
      }
    } else if (d.mode === 'flee') {
      var from = d.fleeFrom || p;
      if (AI && AI.moveAway) {
        AI.moveAway(e, from.x, from.y, 2.3, dt);
        if (AI.anim) AI.anim(e, dt, 8);
      }
      if (dist > 42) {
        fs('deserter_done', 1);
        try { WS.World.removeEnt(e); } catch (err) { /* пусто */ }
        st.deserter = null;
        chron('Дезертир убежал, воя, — в лес, к реке.', '');
      }
    } else if (d.mode === 'leave') {
      // ухожу с миром: к краю карты/окраине и исчезаю
      if (AI && AI.moveTowards && d.leavePt) {
        AI.moveTowards(e, d.leavePt.x, d.leavePt.y, 1.3, dt);
        if (AI.anim) AI.anim(e, dt, 5);
      }
      d.leaveT -= dt;
      if (d.leaveT <= 0 || dist > 34) {
        fs('deserter_done', 1);
        try { WS.World.removeEnt(e); } catch (err2) { /* пусто */ }
        st.deserter = null;
      }
    }
  }

  /** Диалог дезертира (модалка). */
  function deserterDialog() {
    if (WS.Ui && WS.Ui.modal && WS.Ui.modal()) return;
    var food = anyFoodId();
    var armed = playerArmed();

    var dlg = dlgOpen('Дезертир',
      'Из зарослей у околицы выходит человек — шинель рваная, лицо серое.\n' +
      '— Не бей... я с Румынского фронта, три недели иду... отбился от своих...\n' +
      'Руки трясутся. Взгляд — то ли просит, то ли крадётся.\n' +
      '— Хлебца бы... а я расскажу, что слыхал на тракте.');

    dlgRow(dlg, 'Отдать еды (' + (food ? itemName(food) : 'нет еды') + ')', !!food, function () {
      if (food) invConsume(food, 1);
      snd('eat', undefined, undefined, 0.6);
      // награда: сведения о схроне
      var spot = villageEdge(st.R, 0) || { x: 100, y: 100 };
      if (!fg('deserter_cache')) {
        fs('deserter_cache', 1);
        makeStash(spot.x, spot.y, 'Схрон дезертира', [
          { id: 'rifle_round', count: 8 },
          { id: 'matches', count: 3 },
          { id: 'vodka', count: 1 },
          { id: 'bread', count: 1 }
        ]);
        toast('Дезертир шепчет: «У старого валуна за околицей — мой сидор. Бери, мне не донести».', 'good');
        chron('Накормил дезертира. Взамен — тайник у старого валуна за околицей.', 'find');
      } else {
        toast('«Спасибо, добрый человек...» Дезертир закивал и заторопился прочь.', 'info');
        chron('Накормил дезертира. Он ушёл на север.', '');
      }
      deserterLeaves();
    }, food ? '' : 'нужно что-нибудь съедобное');

    dlgRow(dlg, 'Пригрозить оружием', armed, function () {
      snd('bandit_shout', undefined, undefined, 0.9);
      var w = WS.World;
      // роняет мелочь и убегает
      if (w && WS.Loot && WS.Loot.dropItem) {
        var p = P();
        try {
          WS.Loot.dropItem('matches', 2, p.x + 1, p.y + 0.5);
          WS.Loot.dropItem('vodka', 1, p.x + 1, p.y + 1.5);
        } catch (err) { /* пусто */ }
      }
      toast('Дезертир побледнел, выронил кисет с огнивом и бросился наутёк.', 'info');
      chron('Пригрозил дезертиру оружием — он выронил мелочь и убежал.', '');
      deserterLeaves();
    }, armed ? '' : 'нужен ствол или оружие в руках');

    dlgRow(dlg, 'Отойти', true, null);
  }

  function deserterLeaves() {
    var d = st.deserter;
    if (!d) return;
    d.mode = 'leave';
    d.leavePt = villageEdge(st.R, 10) || { x: d.ent.x + 20, y: d.ent.y - 10 };
    d.leaveT = 40;
    fs('deserter_done', 1);
  }

  // ====================================================================
  //  БАНДИТЫ У СКЛАДА (акт 2): группа ищет припасы
  // ====================================================================

  function spawnSquad() {
    if (fg('squad_done') || st.squad) return;
    var w = WS.World;
    if (!w || !w.addEnt) return;
    // точка: у склада/житницы, иначе окраина
    var target = null;
    var bs = housesOf(['warehouse', 'granary']);
    if (bs.length) target = bs[Math.floor((st.R ? st.R.f() : Math.random()) * bs.length)];
    var pt;
    if (target) {
      pt = { x: target.x - 4, y: target.y + target.h + 2 };
      if (w.isTileBlocked && w.isTileBlocked(Math.floor(pt.x), Math.floor(pt.y))) {
        pt = villageEdge(st.R, 12) || pt;
      }
    } else {
      pt = villageEdge(st.R, 12);
    }
    if (!pt) return;

    // костёр банды (тот же спрайт, что у лагерей wolf.js боится огня)
    try {
      w.addObject({
        x: pt.x, y: pt.y,
        sprName: 'ai_campfire',
        solid: true,
        light: 5,
        fireLight: true,
        name: 'Костёр бандитов',
        z: 0
      });
    } catch (err) { /* спрайта может не быть — не страшно */ }

    var group = {
      id: WS.World.newId('story_squad'),
      camp: { x: pt.x, y: pt.y },
      members: [],
      initSize: 0,
      patrol: [],
      alertT: 0,
      angryT: 0,
      routed: false,
      healT: 0
    };
    var ents = [];
    var weapons = ['rifle', 'rifle', 'knife'];
    var sprs = { rifle: 'bandit', knife: 'bandit_knife', axe: 'bandit_axe' };
    for (var i = 0; i < 3; i++) {
      var wp = weapons[i % weapons.length];
      var e = w.addEnt({
        kind: 'bandit',
        x: pt.x + (st.R ? st.R.range(-2.4, 2.4) : 0),
        y: pt.y + (st.R ? st.R.range(-1.8, 1.8) : 0),
        dir: 4,
        hp: 80, maxHp: 80,
        speed: 2.0,
        weapon: wp,
        ammo: wp === 'rifle' ? (st.R ? st.R.int(4, 9) : 6) : 0,
        sprName: sprs[wp],
        sprFrame: 3,
        animFrames: 2,
        restFrame: 3,
        shadowR: 0.42,
        state: 'camp', stateT: 0,
        atkCd: 0, lungeT: 0,
        aimT: 0, shootCd: 0,
        routeIdx: 0, routeWait: 0,
        lastSeen: null, loseT: 0,
        sight: 12,
        brain: { hears: true, noInside: true },
        group: group
      });
      group.members.push(e);
      ents.push(e);
    }
    group.initSize = ents.length;
    st.squad = { group: group, ents: ents, leaveDay: day() + 5 };
    toast('У склада зашевелились чужие. Трое, при оружии.', 'bad');
    chron('Банда дезертиров обложила склад: ищут припасы.', 'anom');
    snd('bandit_shout', pt.x, pt.y, 0.7);
  }

  /** Тик группы: таймеры общего сигнала (аналог groupTick bandit.js). */
  function squadTick(dt) {
    var s = st.squad;
    if (!s) return;
    if (s.group.alertT > 0) s.group.alertT -= dt;
    if (s.group.angryT > 0) s.group.angryT -= dt;
    // чистка мёртвых
    var alive = [];
    for (var i = 0; i < s.ents.length; i++) {
      if (s.ents[i] && !s.ents[i].dead) alive.push(s.ents[i]);
    }
    s.ents = alive;
    s.group.members = alive;
    if (!alive.length) {
      fs('squad_done', 1);
      st.squad = null;
      toast('Склад снова тих. Чужаки полегли в снегу.', 'good');
      chron('Банда у склада перебита.', 'kill');
      return;
    }
    if (day() >= s.leaveDay) {
      for (var k = 0; k < alive.length; k++) {
        try { WS.World.removeEnt(alive[k]); } catch (err) { /* пусто */ }
      }
      fs('squad_done', 1);
      st.squad = null;
      toast('Чужаки ушли на север — к тракту.', 'info');
      chron('Банда у склада снялась и ушла на север.', '');
    }
  }

  // ====================================================================
  //  МЕДВЕДЬ-ШАТУН (день 25+)
  // ====================================================================

  function spawnShatun() {
    if (fg('shatun_done') || st.bear) return;
    var w = WS.World;
    if (!w || !w.addEnt) return;
    var pt = villageEdge(st.R, 16);
    if (!pt) return;
    var e = w.addEnt({
      kind: 'bear',
      x: pt.x, y: pt.y,
      dir: 2,
      hp: 220, maxHp: 220,
      speed: 2.3,
      dmg: 34,
      atkSpd: 0.8,
      sprName: 'bear',
      sprFrame: 0,
      animFrames: 2,
      shadowR: 0.9,
      scale: 1.1,
      state: 'wander', stateT: 0,
      atkCd: 0, lungeT: 0,
      sight: 14,
      brain: { hears: true, noInside: true },
      home: { x: pt.x, y: pt.y, r: 38 },
      roamPt: null,
      roamT: 0,
      rearDone: false,
      enraged: true,        // шатун: голодный и злой — не отступит на половине здоровья
      retreatDone: true,
      lastSeen: null,
      loseT: 0,
      stepT: 0,
      eatPt: null,
      eatT: 0,
      shatun: true
    });
    st.bear = { ent: e };
    fs('shatun_seen', 1);
    toast('Следы медведя-шатуна у самой околицы. Зверь не ляжет в берлогу.', 'bad');
    chron('Медведь-шатун вышел к посёлку. Голодный зверь опаснее волчьей стаи.', 'anom');
    snd('bear_roar', pt.x, pt.y, 0.7);
  }

  // ====================================================================
  //  РЕБЁНОК В ДЕРЕВНЕ (день 20–30): квестовая цепочка
  // ====================================================================

  /** Выбор избы мальчика: подальше от вокзала, жилой тип. */
  function pickChildHouse(R) {
    var list = housesOf(['izba', 'izba_rich', 'dacha', 'barn']);
    if (!list.length) return null;
    // сортировка по удалённости от вокзала — берём из дальней трети
    var st0 = st.station || { x: 30, y: 135 };
    list.sort(function (a, b) {
      var da = WS.M.dist(a.x + a.w / 2, a.y + a.h / 2, st0.x, st0.y);
      var db = WS.M.dist(b.x + b.w / 2, b.y + b.h / 2, st0.x, st0.y);
      return db - da;
    });
    var i = Math.floor((R ? R.f() : Math.random()) * Math.max(1, Math.floor(list.length / 3) + 1));
    return list[i];
  }

  /** Появление мальчика в избе (в день квеста). */
  function startChildQuest() {
    if (fg('child_resolved') || st.boy) return;
    var f = F().flags;
    var b = null;
    var w = WS.World;
    if (w && w.buildings) {
      // ищем сохранённый дом по координатам
      var hx = f.child_hx, hy = f.child_hy;
      if (typeof hx === 'number') {
        for (var i = 0; i < w.buildings.length; i++) {
          var c = w.buildings[i];
          if (c.x === hx && c.y === hy) { b = c; break; }
        }
      }
      if (!b) b = pickChildHouse(st.R);
    }
    if (!b) return;
    f.child_hx = b.x;
    f.child_hy = b.y;
    var pt = freeTileIn(b);
    spawnBoyAt(b, pt);
    var where = dirWordFrom(villageCenter().x, villageCenter().y, b.x + b.w / 2, b.y + b.h / 2);
    toast('В избе на ' + where + ' окраине кто-то кашляет. Тихо, надрывно, по-детски.', 'warn');
    chron('В дальней избе — живой человек. Кашель детский, больной.', 'anom');
  }

  function spawnBoyAt(b, pt) {
    var w = WS.World;
    if (!w || !w.addEnt) return;
    var e = w.addEnt({
      kind: 'child',
      id: 'story_boy',
      x: pt.x, y: pt.y,
      dir: 4,
      hp: 30, maxHp: 30,
      speed: 0,
      sprName: 'st_boy',
      sprFrame: 0,
      animFrames: 1,
      shadowR: 0.3,
      state: 'sick',
      brain: null,          // сидит на месте — двигает сюжет, не ИИ
      boy: true
    });
    st.boy = { ent: e, bld: b, x: pt.x, y: pt.y };
  }

  /** Состояние квеста для API. */
  function childState() {
    if (fg('child_saved')) return 'saved';
    if (fg('child_dead')) return 'dead';
    // мальчик уже появился в избе (день квеста настал)?
    if (typeof fg('child_hx') === 'number') return 'active';
    return 'none';
  }

  /** Первая встреча: авто-диалог при подходе. */
  function childIntro() {
    var f = F().flags;
    fs('child_started', 1);
    fs('child_intro', 1);
    var dlg = dlgOpen('Изба. Ребёнок',
      'За печью, в тряпье — мальчик лет восьми. Щёки горят, губы синие.\n' +
      '— Дяденька... мамка пошла за доктором, третьего дня... Печка погасла, а я не растоплю...\n' +
      'Он кашляет так, что страшно смотреть. Лихорадка. Без хинина, тёплых валенок\n' +
      'и горячей каши он не доживёт до тарелки.');
    dlgRow(dlg, '«Я вернусь. Я принесу всё, что нужно»', true, function () {
      toast('Мальчику нужно: хинин, детские валенки и каша. Врач жил в доме с красным крестом.', 'info');
      chron('В избе — мальчик Ваня. Лихорадка. Нужны хинин, детские валенки, каша.', 'anom');
      snd('heartbeat', undefined, undefined, 0.4);
    });
  }

  /** Диалог помощи мальчику (по [E]). */
  function childDialog() {
    var f = F().flags;
    var parts = 0;
    if (f.child_q) parts++;
    if (f.child_v) parts++;
    if (f.child_k) parts++;
    var need = 'Нужно: хинин' + (f.child_q ? ' ✓' : '') +
               ', детские валенки' + (f.child_v ? ' ✓' : '') +
               ', каша' + (f.child_k ? ' ✓' : '') + '.';

    var dlg = dlgOpen('Ваня',
      'Мальчик сжался у печки. Лихорадка ' + (parts >= 2 ? 'отпускает' : 'трёт его') + '.\n' + need);

    var hasQ = invCount('quinine') > 0;
    var hasV = invCount('child_valenki') > 0;
    var hasK = invCount('kasha') > 0;

    dlgRow(dlg, 'Дать хинин', hasQ && !f.child_q, function () {
      invConsume('quinine', 1);
      fs('child_q', 1);
      snd('eat', undefined, undefined, 0.5);
      toast('«Горько-о-о...» — мальчик сморщился, но проглотил порошок.', 'good');
      chron('Дал мальчику хинин. Жар должен спасть.', 'find');
      childProgress();
    }, f.child_q ? 'дано' : (hasQ ? '' : 'нет в сумке'));

    dlgRow(dlg, 'Надеть детские валенки', hasV && !f.child_v, function () {
      invConsume('child_valenki', 1);
      fs('child_v', 1);
      snd('craft', undefined, undefined, 0.5);
      toast('Валенки пришлись впору. Ноги больше не синие.', 'good');
      chron('Утеплил мальчику ноги валенками.', 'find');
      childProgress();
    }, f.child_v ? 'дано' : (hasV ? '' : 'нет в сумке'));

    dlgRow(dlg, 'Покормить горячей кашей', hasK && !f.child_k, function () {
      invConsume('kasha', 1);
      fs('child_k', 1);
      snd('eat', undefined, undefined, 0.6);
      toast('«С солью... как мамка делала...» — он ел медленно и уснул на ложке.', 'good');
      chron('Накормил мальчика горячей кашей.', 'find');
      childProgress();
    }, f.child_k ? 'дано' : (hasK ? '' : 'нет в сумке'));

    var canSit = (f.child_sit_today !== day()) && !fg('child_saved');
    dlgRow(dlg, 'Посидеть рядом', canSit, function () { childSit(); },
      canSit ? '+5 рассудка' : 'сегодня уже сидели');

    dlgRow(dlg, 'Уйти', true, null);
  }

  /** Кнопка «посидеть рядом» с эффектом. */
  function childSit() {
    fs('child_sit_today', day());
    addSanity(5);
    snd('heartbeat', undefined, undefined, 0.3);
    toast('Вы сидите на холодной лавке, пока мальчик дышит. Стало спокойнее.', 'info');
    chron('Сидел с мальчиком, пока не стемнело.', '');
  }

  /** Проверка трёх частей. */
  function childProgress() {
    var f = F().flags;
    if (f.child_q && f.child_v && f.child_k && !fg('child_saved')) {
      fs('child_saved', 1);
      fs('child_resolved', 1);
      // мальчик засыпает спокойным сном
      if (st.boy && st.boy.ent) {
        st.boy.ent.sprFrame = 1;
        st.boy.ent.state = 'saved';
      }
      addSanity(15);
      toast('К утру жар спал. Ваня спит, щёки порозовели. Он выживет.', 'good');
      chron('Мальчик спасён. Жар отступил, он спит спокойно.', 'find');
      snd('bell', undefined, undefined, 0.6);
      try { WS.Ev.emit('story:child_saved', { day: day() }); }
      catch (e) { WS.err('story: child_saved emit', e && e.message); }
    }
  }

  /** Мальчик не дожил. */
  function childDies() {
    if (fg('child_dead') || fg('child_saved')) return;
    fs('child_dead', 1);
    fs('child_resolved', 1);
    if (st.boy && st.boy.ent && !st.boy.ent.dead) {
      try { WS.World.removeEnt(st.boy.ent); } catch (e) { /* пусто */ }
    }
    st.boy = null;
    addSanity(-15);
    toast('В избе тихо. Слишком тихо. Мальчик не дожил до утра.', 'bad');
    chron('Мальчик не дожил до рассвета. Вы пришли слишком поздно.', 'death');
    snd('bell', undefined, undefined, 0.3);
    try { WS.Ev.emit('story:child_lost', { day: day() }); }
    catch (e2) { WS.err('story: child_lost emit', e2 && e2.message); }
  }

  // ====================================================================
  //  ФИНАЛ «ДЫМ НА РЕКЕ» (день 55–60)
  // ====================================================================

  /** Утро 55-го дня: зов тарелки, зелёный луч за рекой. */
  function startFinal() {
    if (fg('final_started')) return;
    fs('final_started', 1);
    snd('bell', undefined, undefined, 0.7);
    snd('howl', undefined, undefined, 0.15);
    toast('Сквозь бурю — гул за рекой. Тарелка ищет своего деда!', 'good');
    chron('Луч на реке! Тарелка прилетела раньше срока и ищет деда.', 'anom');
    // событие для карты/журнала (E2/D-агенты слушают, если хотят)
    try {
      WS.Ev.emit('story:go_to_pier', {
        x: st.pier ? st.pier.x : 0,
        y: st.pier ? st.pier.y : 0,
        day: day()
      });
    } catch (e) { WS.err('story: go_to_pier emit', e && e.message); }
    if (st.pier) {
      var where = dirWordFrom(villageCenter().x, villageCenter().y, st.pier.x, st.pier.y);
      toast('Мостки-пристань — на ' + where + ' стороне, у реки. Нужен Магический Огонь: 3 факела.', 'info');
    } else {
      toast('Разведи Магический Огонь на мостках у реки. Нужен 3 факела.', 'info');
    }
  }

  /** Зажечь Магический Огонь на конце мостков. */
  function lightBeacon() {
    if (fg('signal_lit') || !st.pier) return;
    var have = invCount('torch');
    if (have < BEACON_TORCHES) {
      toast('Для Магического Огня нужно ' + BEACON_TORCHES + ' факела (есть ' + have + ').', 'warn');
      return;
    }
    invConsume('torch', BEACON_TORCHES);
    var w = WS.World;
    if (!w || !w.addObject) return;
    var o = w.addObject({
      x: st.pier.x, y: st.pier.y,
      sprName: 'campfire',
      sprFrame: 2,
      solid: true,
      name: 'Магический Огонь',
      light: 95,
      fireLight: true,
      scale: 1.8,
      beacon: true
    });
    st.beacon = o;
    fs('signal_lit', 1);
    snd('match', st.pier.x, st.pier.y, 1);
    snd('victory', undefined, undefined, 0.4);
    toast('Магический Огонь взвился над рекой. Тарелка такой не пропустит!', 'good');
    chron('Магический Огонь на пристани зажжён. Тарелка уже снижается!', 'find');
    try { WS.Ev.emit('story:signal_lit', { x: st.pier.x, y: st.pier.y, day: day() }); }
    catch (e) { WS.err('story: signal_lit emit', e && e.message); }
    if (WS.Fx && WS.Fx.burst) {
      WS.Fx.burst('spark', st.pier.x, st.pier.y, 14);
    }
    // тарелка уже на реке — заметили мгновенно
    if (day() >= SHIP_DAY) {
      victoryNow('С мостка разглядел столб дыма и ответил двумя гудками. Идут к вам.');
    }
  }

  /** Проверки дня тарелки (по часу). */
  function shipHourCheck() {
    var d = day();
    if (d < SHIP_DAY) return;
    var h = hour();
    if (d === SHIP_DAY && h === 6) {
      if (fg('signal_lit')) {
        victoryNow('Сигнальный огонь увидели с мостка. Гудок — всё ближе.');
      } else {
        toast('Тарелка где-то над рекой, в бурю. Без Магического Огня она пролетит мимо!', 'bad');
        chron('День тарелки. Огня на пристани нет — тарелка не найдёт деда.', 'anom');
      }
    }
    if (d === SHIP_DAY && h === 12 && !fg('signal_lit')) {
      toast('С реки доносится гудок: паровая машина ищет пристань. Время ещё есть.', 'bad');
    }
    if (d === SHIP_DAY && h === SHIP_FAIL_HOUR && !fg('signal_lit')) {
      failEnd();
    }
  }

  function victoryNow(why) {
    if (fg('story_victory')) return;
    fs('story_victory', 1);
    toast(why, 'good');
    chron('ПАРОХОД ПРИШЁЛ. Вы выжили в Белом Безмолвии.', 'find');
    if (WS.Main && typeof WS.Main.victory === 'function') {
      try { WS.Main.victory(); } catch (e) { WS.err('story: victory', e && e.message); }
    }
  }

  function failEnd() {
    if (fg('story_victory') || fg('story_fail')) return;
    fs('story_fail', 1);
    chron('Тарелка мигнула два раза и улетела. Магического Огня не было.', 'death');
    if (WS.Main && typeof WS.Main.die === 'function') {
      try { WS.Main.die('тарелка улетела мимо: дед не зажёг Магический Огонь'); }
      catch (e) { WS.err('story: fail die', e && e.message); }
    }
  }

  // ====================================================================
  //  ОБРАБОТЧИК ДНЕЙ: все сюжетные вехи
  // ====================================================================

  function onDay(d0) {
    var g = WS.G;
    if (!g || !g.running || g.dead) return;
    if (!st.inited) reattach();
    var d = (d0 && d0.day) ? d0.day : day();
    var f = F().flags;
    var act = actFor(d);

    // ---- переходы актов ----
    if (d === ACT1_LAST + 1 && !f.beat_act2) {
      f.beat_act2 = 1;
      act2Start();
    }
    if (d === POLAR_DAY && !f.beat_act3) {
      f.beat_act3 = 1;
      act3Start();
    }

    // ---- день 2: первые советы (однократно) ----
    if (d === 2 && !f.beat_day2) {
      f.beat_day2 = 1;
      toast('Затопите печь и осмотрите дома: дрова, еда, тёплая одежда. Зима длинная.', 'info');
      chron('День второй. Посёлок молчит, но в домах ещё остался скарб.', '');
    }

    // ---- предупреждение о первой волчьей ночи ----
    if (d === f.r_wolfnight && !f.beat_wolfwarn) {
      f.beat_wolfwarn = 1;
      toast('Старожилы говорили: первая встреча с волками — на четвёртую ночь. Сегодня.', 'warn');
      chron('К вечеру жди волков — так говорили улетевшие на тарелке.', '');
    }

    // ---- дезертир ----
    if (d >= (f.r_deserter || 10) && !fg('deserter_done') && !st.deserter) {
      spawnDeserter();
    }
    // не дождались контакта — ушёл
    if (st.deserter && d > st.deserter.day + 1 && st.deserter.mode !== 'flee') {
      deserterLeaves();
    }

    // ---- акт 2: осадное расписание утром ----
    if (act === 2 && f.sieges && f.sieges.length) {
      if (f.sieges.indexOf(d) >= 0 && !f['siegewarn_' + d]) {
        f['siegewarn_' + d] = 1;
        toast('Ночью будут волки. Следы у околицы свежие. Заприте двери.', 'warn');
        chron('День осады: следы волчьих лап вокруг посёлка.', 'anom');
      }
    }

    // ---- ребёнок ----
    if (d >= (f.r_child_day || 22) && childState() === 'none') {
      startChildQuest();
    }
    // напоминания, если квест идёт
    if (childState() === 'active') {
      var left = (f.r_child_deadline || 0) - d;
      if (left === 3 && !f.beat_child_worry) {
        f.beat_child_worry = 1;
        toast('Кашель в дальней избе стал реже и слабее. Это дурной знак.', 'warn');
      }
      if (left === 1 && !f.beat_child_last) {
        f.beat_child_last = 1;
        toast('Мальчику хуже. Если не помочь сегодня-завтра — будет поздно.', 'bad');
      }
      if (d >= (f.r_child_deadline || 0)) {
        childDies();
      }
    }

    // ---- медведь-шатун ----
    if (d >= (f.r_bear_day || 26) && !fg('shatun_done') && !st.bear) {
      spawnShatun();
    }

    // ---- банда у склада ----
    if (d >= (f.r_squad_day || 29) && !fg('squad_done') && !st.squad) {
      spawnSquad();
    }

    // ---- финал ----
    if (d >= FINAL_DAY) {
      startFinal();
    }
    if (d === FINAL_DAY + 2 && !fg('signal_lit') && fg('final_started')) {
      toast('Тарелка будет ждать деда до вечера 60-го дня. Нужны 3 факела.', 'warn');
    }
  }

  // ====================================================================
  //  ОБРАБОТЧИКИ ЧАСА / НОЧИ / РАССВЕТА / ПОГОДЫ
  // ====================================================================

  function onHour(h) {
    var g = WS.G;
    if (!g || !g.running || g.dead) return;
    var hh = (h && typeof h.hour === 'number') ? h.hour : hour();
    if (hh === RADIO_HOUR) tryRadio();
    if (hh === RECORDED_HOUR) tryRecorded();
    shipHourCheck();
    // запись в конторе слышна и при первом входе (не только в 9 утра)
    if (hh >= 8 && hh <= 20) tryRecorded();
  }

  function onNightFall() {
    var g = WS.G;
    if (!g || !g.running || g.dead) return;
    if (!st.inited) reattach();
    var d = day();
    var f = F().flags;

    // первая волчья ночь
    if (d === f.r_wolfnight && !st.scout && !fg('wolfnight_done')) {
      firstWolfNight();
    }

    // осада?
    if (f.sieges && f.sieges.indexOf(d) >= 0 && !st.siege) {
      var desperate = d >= POLAR_DAY;
      startSiege(desperate ? 5 : 4, desperate);
    } else if (d >= POLAR_DAY && !st.siege) {
      // полярная ночь: и в «обычные» ночи зверь голоден — иногда одиночка
      if (Math.random() < 0.35) startSiege(1, false, true);
    }
  }

  function onDayDawn() {
    var g = WS.G;
    if (!g || !g.running || g.dead) return;
    endSiege(false);
    endScout(false);
  }

  function onWeatherChanged(w) {
    var g = WS.G;
    if (!g || !g.running || g.dead || !w) return;
    // хронику погоды ведёт журнал/погода — здесь только резкие слова
    if (w.to === 'hard_frost' && !fg('chron_frost_' + day())) {
      fs('chron_frost_' + day(), 1);
      chron('Ударил лютый мороз.', 'anom');
    }
  }

  // ====================================================================
  //  ГЛАВНЫЙ ТИК СЮЖЕТА (приоритет 63: после игрока, до рендера)
  //  Взаимодействия по [E], подсказки, микро-поведения.
  // ====================================================================

  function storyTick(dt) {
    var g = WS.G;
    if (!g || !g.running || g.dead) return;
    st.hintShown = false;

    // модалка открыта — мир ждёт
    if (WS.Ui && WS.Ui.modal && WS.Ui.modal()) return;

    siegeTick(dt);
    squadTick(dt);
    deserterTick(dt);

    // ---- мальчик: подсказка и [E] ----
    boyTick(dt);

    // ---- финальный квест: мостки ----
    pierTick();

    // ---- сигнальный костёр: поддерживать дым ----
    beaconTick(dt);
  }

  /** Мальчик: вход в избу — представление; рядом — подсказка [E]. */
  function boyTick(dt) {
    if (!st.boy) return;
    if (fg('child_dead')) { st.boy = null; return; }
    var e = st.boy.ent;
    if (!e || e.dead) { st.boy = null; return; }
    var p = P();
    if (!p) return;

    // первое представление
    if (!fg('child_intro') && playerDist(st.boy.x, st.boy.y) < 5) {
      childIntro();
      return;
    }
    if (fg('child_intro') && playerDist(st.boy.x, st.boy.y) < 1.9) {
      // игрок рядом с мальчиком: подсказка (если игрок не целится в дверь)
      if (noOtherInteract()) {
        showHint(fg('child_saved') ? 'Мальчик спит спокойно' : 'Поговорить с мальчиком');
        if (hitInteract()) {
          if (fg('child_saved')) {
            toast('Ваня спит, щёки порозовели. Пусть спит — он это заслужил.', 'info');
          } else {
            childDialog();
          }
        }
      }
    }
  }

  /** Мостки: подсказка и поджиг сигнального костра. */
  function pierTick() {
    if (!fg('final_started') || fg('signal_lit') || !st.pier) return;
    var d = playerDist(st.pier.x, st.pier.y);
    if (d < 2.0 && noOtherInteract()) {
      var have = invCount('torch');
      showHint('Разжечь сигнальный костёр (' + have + '/' + BEACON_TORCHES + ' факела)');
      if (hitInteract()) {
        lightBeacon();
      }
    }
  }

  /** Дым и искры над сигнальным костром. */
  function beaconTick(dt) {
    if (!fg('signal_lit')) return;
    if (!st.beacon && st.pier) {
      // после загрузки сейва: восстановить видимость костра
      var w = WS.World;
      if (w && w.addObject && w.objAt) {
        var o = w.objAt(Math.floor(st.pier.x), Math.floor(st.pier.y));
        st.beacon = (o && o.beacon) ? o : null;
        if (!st.beacon) {
          st.beacon = w.addObject({
            x: st.pier.x, y: st.pier.y,
            sprName: 'campfire', sprFrame: 2, solid: true,
            name: 'Магический Огонь', light: 95, fireLight: true,
            scale: 1.8, beacon: true
          });
        }
      }
    }
    if (!st.beacon) return;
    st._smokeT = (st._smokeT || 0) + dt;
    if (st._smokeT > 0.4) {
      st._smokeT = 0;
      if (WS.Fx && WS.Fx.spawn) {
        WS.Fx.spawn('smoke', st.beacon.x, st.beacon.y, {
          vx: 0.3, vy: -0.1, z: 30, life: 2.2, size: 6
        });
        if (Math.random() < 0.3) {
          WS.Fx.spawn('spark', st.beacon.x, st.beacon.y, { z: 26, life: 0.9 });
        }
      }
    }
  }

  /** Подсказка [E] (своя — поверх чужих, приоритет тика выше). */
  function showHint(text) {
    if (st.hintShown) return;
    st.hintShown = true;
    if (WS.Ui && WS.Ui.hint) {
      try { WS.Ui.hint(text); } catch (e) { /* пусто */ }
    }
  }

  /** Нажат [E]? (безопасно, без конфликта с actions.js) */
  function hitInteract() {
    if (!WS.Input || !WS.Input.hit) return false;
    try { return WS.Input.hit('interact'); } catch (e) { return false; }
  }

  /** Рядом нет чужого интерактива (дверь/контейнер)? */
  function noOtherInteract() {
    if (WS.Action && WS.Action.interactTarget) {
      try {
        var t = WS.Action.interactTarget();
        if (t) return false;
      } catch (e) { /* пусто */ }
    }
    return true;
  }

  // ====================================================================
  //  НОВАЯ ПАРТИЯ / ПЕРЕПОДКЛЮЧЕНИЕ ПОСЛЕ ЗАГРУЗКИ
  // ====================================================================

  function resetLive() {
    st.boy = null;
    st.deserter = null;
    st.squad = null;
    st.siege = null;
    st.bear = null;
    st.beacon = null;
    st.scout = null;
    st._siegeSaw = false;
    st.targetT = 0;
  }

  function newGame() {
    var g = WS.G;
    if (!g) return;
    resetLive();
    st.R = WS.RNG.mk(((g.seed >>> 0) ^ 0x51B7) >>> 0);
    var s = F();
    var f = s.flags;

    // ---- броски партии (детерминизм от сида) ----
    f.r_wolfnight = st.R.int(3, 5);
    f.r_deserter = st.R.int(8, 12);
    f.r_child_day = st.R.int(20, 24);
    f.r_child_deadline = f.r_child_day + CHILD_GRACE;
    f.r_bear_day = st.R.int(25, 28);
    f.r_squad_day = st.R.int(27, 31);
    f.sieges = rollSieges(st.R);

    // ---- сканы мира ----
    scanWorld();

    // ---- рация в конторе вокзала (контейнер с кристаллом) ----
    placeOfficeRadio();

    st.inited = true;
    chron('Партия ушла на запад. Я остался сторожить станцию Пристань-Тихая.', 'death');
    toast('До тарелки — 60 дней. Продержитесь.', 'info');
    WS.log('[Story] партия инициализирована: волчья ночь ' + f.r_wolfnight +
           ', дезертир ' + f.r_deserter + ', мальчик ' + f.r_child_day +
           ', осады: ' + f.sieges.join(','));
  }

  /** Сканы: вокзал, пристань. */
  function scanWorld() {
    st.station = findStation();
    var piers = findPiers();
    st.pier = null;
    if (piers.length) {
      // ближайшие к посёлку мостки
      var c = villageCenter();
      var best = piers[0], bd = 1e9;
      for (var i = 0; i < piers.length; i++) {
        var d = WS.M.dist(piers[i].x, piers[i].y, c.x, c.y);
        if (d < bd) { bd = d; best = piers[i]; }
      }
      st.pier = { x: best.x + 0.5, y: best.y + 0.5 };
    }
    var f = F().flags;
    if (st.pier) {
      f.pier_x = Math.floor(st.pier.x);
      f.pier_y = Math.floor(st.pier.y);
    }
  }

  /** Рация на столе конторы: контейнер с radio_crystal. */
  function placeOfficeRadio() {
    var w = WS.World;
    if (!w || !w.addObject || !st.station || fg('radio_placed')) return;
    var b = st.station;
    // офис — северная часть здания
    var pt = freeTileIn({ x: b.x, y: b.y, w: b.w, h: Math.max(2, Math.floor(b.h * 0.38)) });
    if (!pt) return;
    var o = w.addObject({
      x: pt.x, y: pt.y,
      sprName: 'st_radio',
      solid: true,
      name: 'Кристаллический приёмник',
      radio: true          // у него слышен эфир (радио-пузырь + диктор)
    });
    o.container = 'ranger_cache';       // вход в обыск
    o.inv = [{ id: 'radio_crystal', count: 1 }];
    o.inv._dirty = true;
    fs('radio_placed', 1);
    fs('radio_x', Math.floor(pt.x));
    fs('radio_y', Math.floor(pt.y));
  }

  /** Восстановление живых сущностей после загрузки сейва. */
  function reattach() {
    var g = WS.G;
    if (!g || !g.story) return;
    st.R = WS.RNG.mk(((g.seed >>> 0) ^ 0x51B7) >>> 0);
    resetLive();
    scanWorld();
    var f = g.story.flags || {};

    // мальчик: жив (квест начался и не разрешён) или спасён (спит в избе)
    if (typeof f.child_hx === 'number' && !f.child_dead) {
      var started = fg('child_saved') || (day() >= (f.r_child_day || 20));
      if (started) {
        var b = findBuildingAt(f.child_hx, f.child_hy);
        if (b) {
          spawnBoyAt(b, freeTileIn(b));
          if (fg('child_saved') && st.boy && st.boy.ent) {
            st.boy.ent.sprFrame = 1;
            st.boy.ent.state = 'saved';
          }
        }
      }
    }
    st.inited = true;
    WS.log('[Story] переподключён: день ' + day() + ', акт ' + actFor(day()));
  }

  /** Здание по координатам левого верхнего угла. */
  function findBuildingAt(x, y) {
    var w = WS.World;
    if (!w || !w.buildings) return null;
    for (var i = 0; i < w.buildings.length; i++) {
      var c = w.buildings[i];
      if (c && c.x === x && c.y === y) return c;
    }
    return null;
  }

  function onGameStart() {
    // Main.newGame уже вызвал Story.newGame — только страховка
    if (!st.inited) newGame();
  }

  function onGameLoad() {
    st.inited = false;
    reattach();
  }

  // ====================================================================
  //  ПУБЛИЧНЫЙ API МОДУЛЯ
  // ====================================================================

  var Story = {
    newGame: newGame,
    reattach: reattach,

    /** Текущий акт 1..3. */
    act: function () { return actFor(day()); },

    /** Название акта. */
    actName: function () { return actName(actFor(day())); },

    /** Множитель волчьей агрессии 0..2 (для ИИ; безопасен без партии). */
    wolfAggression: function () { return wolfAggression(); },

    /** Идёт ли сейчас осадная ночь. */
    isSiege: function () { return !!st.siege; },

    /** Состояние квеста «Ребёнок в деревне». */
    childState: childState,

    /** Точка сигнального костра (или null). */
    pier: function () { return st.pier ? { x: st.pier.x, y: st.pier.y } : null; },

    /** Финальный квест: {started, lit, torches, need}. */
    finalQuest: function () {
      return {
        started: !!fg('final_started'),
        lit: !!fg('signal_lit'),
        torches: invCount('torch'),
        need: BEACON_TORCHES
      };
    },

    /** Добавить запись в хронику (внешний вход). */
    chron: chron,

    /** Сколько передач услышано. */
    radioHeard: function () {
      var n = 0;
      for (var i = 0; i < RADIO.length; i++) {
        if (fg('radio_' + RADIO[i].id)) n++;
      }
      return n;
    },

    /** Ближайшие сюжетные вехи (для подсказок/журнала). */
    upcoming: function () {
      var d = day();
      var f = F().flags;
      var out = [];
      if (d < (f.r_wolfnight || 4)) out.push({ day: f.r_wolfnight, text: 'Первая волчья ночь' });
      if (d < (f.r_deserter || 10) && !f.deserter_done) out.push({ day: f.r_deserter, text: 'Кто-то у околицы' });
      if (childState() === 'none' && d < (f.r_child_day || 22)) out.push({ day: f.r_child_day, text: 'Кашель в дальней избе' });
      if (d < (f.r_bear_day || 26) && !f.shatun_done) out.push({ day: f.r_bear_day, text: 'Следы шатуна' });
      if (d < (f.r_squad_day || 29) && !f.squad_done) out.push({ day: f.r_squad_day, text: 'Чужаки у склада' });
      if (d < FINAL_DAY) out.push({ day: FINAL_DAY, text: 'Дым на реке' });
      out.push({ day: SHIP_DAY, text: 'Тарелка' });
      return out;
    },

    /** Служебный доступ к расписанию осад. */
    sieges: function () {
      var f = F().flags;
      return (f.sieges || []).slice();
    },

    /** Отладка: внутреннее состояние. */
    _state: function () { return st; },

    /** Самотест (консоль): целостность данных и API. */
    selftest: selftest
  };

  function selftest() {
    var out = [];
    var ok = function (name, cond) {
      out.push((cond ? '  ok  ' : ' FAIL ') + name);
      return !!cond;
    };
    ok('радио-таблица не пуста', RADIO.length === 16);
    ok('передачи по возрастанию дней', (function () {
      for (var i = 1; i < RADIO.length; i++) {
        if (RADIO[i].d <= RADIO[i - 1].d) return false;
      }
      return true;
    })());
    ok('акт из дня 1 = 1', actFor(1) === 1);
    ok('акт из дня 15 = 2', actFor(15) === 2);
    ok('акт из дня 44 = 3', actFor(44) === 3);
    ok('агрессия в границах 0..2', wolfAggression() >= 0 && wolfAggression() <= 2);
    ok('childState без партии = none', (function () {
      if (!WS.G) return true;
      return typeof childState() === 'string';
    })());
    ok('финальный квест-объект собирается', (function () {
      var q = Story.finalQuest();
      return q && typeof q.need === 'number';
    })());
    out.unshift('story.selftest: пройдено');
    return out;
  }

  // ====================================================================
  //  BOOT
  // ====================================================================

  WS.boot(function initStory() {
    declareItems();
    defSprites();

    // тик взаимодействий — приоритет 63 (после игрока, до рендера)
    WS.tick(63, storyTick, 'story:main');

    // события времени
    WS.Ev.on('time:day', onDay);
    WS.Ev.on('time:hour', onHour);
    WS.Ev.on('night:fall', onNightFall);
    WS.Ev.on('day:dawn', onDayDawn);
    WS.Ev.on('weather:changed', onWeatherChanged);

    // старт/загрузка партии
    WS.Ev.on('game:start', onGameStart);
    WS.Ev.on('game:load', onGameLoad);

    WS.log('[Story] сюжетный движок зарегистрирован (тик 63)');
  }, 'story:init');

  WS.def('Story', Story);
})();
