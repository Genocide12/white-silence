/**
 * build.js — СТРОИТЕЛЬСТВО «Белого Безмолвия»: режим по клавише B
 * (призрак на тайле мыши, колесо — выбор рецепта, ЛКМ — стройка с
 * прогрессом 5-20 сек), 12 построек от баррикад до проруби, HP и износ
 * (волки грызут баррикады у игрока), ремонт (G) и разбор с возвратом
 * 50% материалов (X), силки на зайцев с почасовой проверкой, рыбалка
 * у проруби. Материалы — через WS.Inv (агент C1) с падением на
 * WS.Action. Сохранение — World.built (договор world.js). Спрайты
 * объявлены здесь: barricade_plank, snow_wall, fence_seg, snare,
 * wood_pile_storage, floor_patch, window_plank, ice_hole_mark + другие.
 */
(function () {
  'use strict';

  // ====================================================================
  //  КОНСТАНТЫ
  // ====================================================================

  var MODE_PRI = 59;               // ввод режима стройки (до player:60/actions:61)
  var WHEEL_PRI = 4;               // перехват колеса ДО камеры (5): в режиме
                                   // стройки колесо листает рецепты, не зум
  var WORLD_PRI = 21;              // мир: волки грызут, рыбалка (после снега/огня:20)

  var BUILD_RANGE = 4;             // дальность стройки от игрока, тайлы
  var GHOST_ALPHA = 0.55;          // прозрачность призрака
  var SND_EVERY = 0.9;             // звук стройки раз в 0.9 сек
  var CANCEL_DIST = 3;             // уйти дальше — стройка брошена

  var REPAIR_KEY = 'KeyG';         // починка своей постройки
  var DISMANTLE_KEY = 'KeyX';      // разбор

  var REPAIR_HP = 35;              // hp за одну доску
  var DISMANTLE_REFUND = 0.5;      // возврат материалов при разборе (по ТЗ)

  var WOLF_GNAW_DPS = 8;           // волк грызёт 8 hp/сек (80 hp ≈ 10 сек, по ТЗ)
  var BEAR_GNAW_DPS = 16;          // медведь — вдвое быстрее
  var GNAW_NEAR_R = 1.5;           // радиус «упёрся в постройку»

  var SNARE_CHANCE = 0.30;         // базовый шанс силка за час
  var SNARE_BREAK_CHANCE = 0.35;   // шанс поломки силка при добыче

  var FISH_CATCH_MIN = 28;         // сек между поклёвками
  var FISH_CATCH_VAR = 30;         // +0..30 сек
  var FISH_CHANCE = 0.55;          // базовый шанс улова
  var HOLE_FREEZE_H = 3;           // часов до замерзания проруби

  // ====================================================================
  //  СПИСОК ПОСТРОЕК (WS.BUILDABLES — публичные данные)
  //  Поля:
  //   id        — идентификатор;
  //   name      — русское название для UI/призрака;
  //   sprName   — спрайт (объявлен ниже в defSprites);
  //   req       — [{id, n}] материалы;
  //   tools     — [itemId] инструменты (проверяются, не расходуются);
  //   hp        — прочность (0 = без объекта: тайловые постройки без hp);
  //   solid     — блокирует движение (волки грызут именно solid);
  //   bulletPass— пули ЛЕТЯТ СКВОЗЬ (баррикады — низкие, по ТЗ
  //               «бандиты стреляют»; window_plank — наоборот, укрытие);
  //   windbreak — задерживает ветер (snow_wall, snow_fence);
  //   time      — базовое время стройки, сек (5-20 по ТЗ; столярка ускоряет);
  //   tile      — если задан, постройка = ЗАМЕНА ТАЙЛА (floor/bridge);
  //   where     — функция-условие места (окно/дверь/лёд/вода);
  //   special   — 'campfire' | 'snare' | 'fishing' | 'container';
  //   desc      — короткое описание в меню стройки.
  // ====================================================================

  function tileIs(T, tx, ty, v) {
    return WS.World.tileAt(tx, ty) === v;
  }

  var BUILDABLES = [
    {
      id: 'barricade_plank', name: 'Баррикада из досок',
      sprName: 'barricade_plank',
      req: [{ id: 'plank', n: 3 }, { id: 'nails', n: 4 }],
      tools: ['hammer'],
      hp: 80, solid: true, bulletPass: true, time: 8,
      desc: 'Перекрывает путь. Волки прогрызают её, бандиты стреляют поверх.'
    },
    {
      id: 'door_barricade', name: 'Забаррикадировать дверь',
      sprName: 'door_barricade',
      req: [{ id: 'plank', n: 2 }, { id: 'nails', n: 4 }],
      tools: ['hammer'],
      hp: 120, solid: true, bulletPass: true, time: 6,
      where: function (tx, ty) {
        // объект-дверь или тайл-дверь на месте
        var w = WS.World;
        if (tileIs(w.T, tx, ty, w.T.DOOR)) return true;
        var list = w.objsAt(tx, ty);
        for (var i = 0; i < (list ? list.length : 0); i++) {
          if (list[i] && list[i].door) return true;
        }
        return false;
      },
      desc: 'Дверь изнутри — крест-накрест досками. Надолго задержит стаю.'
    },
    {
      id: 'window_plank', name: 'Забить окно',
      sprName: 'window_plank',
      req: [{ id: 'plank', n: 2 }, { id: 'nails', n: 3 }],
      tools: ['hammer'],
      hp: 60, solid: true, bulletPass: false, windbreak: true, time: 5,
      where: function (tx, ty) { return tileIs(WS.World.T, tx, ty, WS.World.T.WINDOW); },
      desc: 'Доски в оконном проёме: режет ветер и служит укрытием от пуль.'
    },
    {
      id: 'fence_seg', name: 'Сегмент забора',
      sprName: 'fence_seg',
      req: [{ id: 'plank', n: 2 }, { id: 'nails', n: 2 }],
      tools: ['hammer'],
      hp: 50, solid: true, bulletPass: true, time: 6,
      desc: 'Штакетник. Задерживает зверя, но не пулю.'
    },
    {
      id: 'snow_wall', name: 'Снежная стена',
      sprName: 'snow_wall',
      req: [],
      tools: ['shovel'],
      hp: 30, solid: true, bulletPass: true, windbreak: true, time: 10,
      desc: 'Лопатой снег в стену. Блокирует ветер и взгляд, тает от тепла.'
    },
    {
      id: 'snow_fence', name: 'Снегозадержательный щит',
      sprName: 'snow_fence',
      req: [{ id: 'plank', n: 2 }],
      tools: ['hammer'],
      hp: 40, solid: true, bulletPass: true, windbreak: true, snowTrap: true, time: 7,
      desc: 'За щитом наметает сугроб — и ветру конец за ним.'
    },
    {
      id: 'floor_wood', name: 'Деревянный настил',
      sprName: 'floor_patch',
      req: [{ id: 'plank', n: 2 }],
      tools: ['hammer'],
      hp: 0, solid: false, time: 6, tile: 'floorWood',
      where: function (tx, ty) {
        var w = WS.World;
        var t = w.tileAt(tx, ty);
        var inside = w.isInside ? w.isInside(tx + 0.5, ty + 0.5) : false;
        return inside && (t === w.T.FLOOR_DIRT || t === w.T.DIRT || t === w.T.MUD);
      },
      desc: 'Ремонт пола в доме: сухие доски вместо земляного пола.'
    },
    {
      id: 'bridge_plank', name: 'Трап через реку',
      sprName: 'floor_patch',
      req: [{ id: 'plank', n: 3 }, { id: 'nails', n: 2 }],
      tools: ['hammer'],
      hp: 0, solid: false, time: 8, tile: 'bridge',
      where: function (tx, ty) { return tileIs(WS.World.T, tx, ty, WS.World.T.WATER); },
      desc: 'Положить доски на воду — переход через полынью.'
    },
    {
      id: 'campfire_place', name: 'Кострище',
      sprName: 'floor_patch',
      req: [{ id: 'log', n: 2 }],
      tools: ['matches'],
      hp: 0, solid: false, time: 3, special: 'campfire',
      desc: 'Разжечь костёр (спички + дрова). Греться и готовить.'
    },
    {
      id: 'wood_pile', name: 'Склад дров',
      sprName: 'wood_pile_storage',
      req: [{ id: 'log', n: 4 }],
      tools: [],
      hp: 25, solid: false, bulletPass: true, time: 4, special: 'container',
      desc: 'Поленница: складируем брёвна, обыскиваем, когда нужны.'
    },
    {
      id: 'snare', name: 'Силок на зайцев',
      sprName: 'snare',
      req: [{ id: 'snare_wire', n: 1 }],
      tools: [],
      hp: 5, solid: false, bulletPass: true, time: 3, special: 'snare',
      where: function (tx, ty) {
        // зайцы в дома не ходят — силок внутри бессмыслен
        var w = WS.World;
        return !(w.isInside && w.isInside(tx + 0.5, ty + 0.5));
      },
      desc: 'Проверяйте раз в час. Иногда рвётся вместе с добычей.'
    },
    {
      id: 'fishing_hole', name: 'Прорубь',
      sprName: 'ice_hole_mark',
      req: [],
      tools: ['ice_pick'],
      hp: 0, solid: false, bulletPass: true, time: 12, special: 'fishing',
      where: function (tx, ty) { return tileIs(WS.World.T, tx, ty, WS.World.T.ICE); },
      desc: 'Долбить лёд — тяжело. С удочкой у проруби клюёт само.'
    }
  ];

  /** Быстрый доступ: id -> определение. */
  var BY_ID = {};
  (function () {
    for (var i = 0; i < BUILDABLES.length; i++) BY_ID[BUILDABLES[i].id] = BUILDABLES[i];
  })();

  // ====================================================================
  //  СОСТОЯНИЕ МОДУЛЯ
  // ====================================================================

  var mode = false;        // режим строительства включён
  var curIdx = 0;          // выбранный рецепт (индекс в BUILDABLES)
  var ghost = null;        // сущность-призрак (render с прозрачностью)
  var constr = null;       // идущая стройка {bid, x, y, t, dur, b}
  var sndT = 0;            // таймер звуков стройки
  var hintT = 0;           // таймер подсказки призрака
  var liveBuilt = [];      // наши живые объекты [{o, b, entry}] — удобный обход

  // ====================================================================
  //  МАЛЫЕ УТИЛИТЫ
  // ====================================================================

  function G() { return WS.G || null; }
  function P() { var g = WS.G; return (g && g.player) || null; }
  function W() { return WS.World || null; }

  function mouse() {
    var m = WS.Input && WS.Input.mouse;
    if (!m) return { x: 0, y: 0, wx: 0, wy: 0, tx: -1, ty: -1, leftP: false, rightP: false, wheel: 0 };
    if (typeof m === 'function') {
      try { return m(); } catch (e) { return { x: 0, y: 0, wx: 0, wy: 0, tx: -1, ty: -1 }; }
    }
    return m;
  }

  function snd(name, x, y, vol) {
    if (!WS.Snd || !WS.Snd.play) return;
    try { WS.Snd.play(name, { x: x, y: y, vol: vol }); } catch (e) { /* тишина */ }
  }

  function fxText(str, x, y, o) {
    if (!WS.Fx || !WS.Fx.text) return;
    try { WS.Fx.text(str, x, y, o); } catch (e) { /* пусто */ }
  }

  function fx(kind, x, y, n, o) {
    if (!WS.Fx || !WS.Fx.burst) return;
    try { WS.Fx.burst(kind, x, y, n, o); } catch (e) { /* пусто */ }
  }

  function toast(msg, kind) {
    if (WS.Ui && WS.Ui.toast) {
      try { WS.Ui.toast(msg, kind || 'info'); return; } catch (e) { /* текстом ниже */ }
    }
    var p = P();
    if (p) fxText(msg, p.x, p.y - 0.8, { col: '#cfd6df', life: 2.2 });
  }

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  function itemName(id) {
    if (WS.I18N && WS.I18N.t) {
      var key = 'item.' + id + '.name';
      try {
        var s = WS.I18N.t(key);
        if (s && s !== key) return s;
      } catch (e) { /* заглушка ниже */ }
    }
    return String(id).replace(/_/g, ' ');
  }

  // ====================================================================
  //  ИНВЕНТАРЬ: АБСТРАКЦИЯ НАД C1 (WS.Inv) И actions.js
  // ====================================================================

  function invCount(id) {
    if (!id) return 0;
    var inv = WS.Inv;
    if (inv) {
      if (typeof inv.count === 'function') {
        try { return Math.max(0, inv.count(id) | 0); } catch (e) { /* дальше */ }
      }
      if (typeof inv.countItem === 'function') {
        try { return Math.max(0, inv.countItem(id) | 0); } catch (e2) { /* дальше */ }
      }
    }
    if (WS.Action && typeof WS.Action.countItem === 'function') {
      try { return Math.max(0, WS.Action.countItem(id) | 0); } catch (e3) { return 0; }
    }
    return 0;
  }

  function invConsume(id, n) {
    if (!id) return 0;
    n = Math.max(1, n | 0);
    var inv = WS.Inv;
    if (inv && typeof inv.consume === 'function') {
      try {
        var used = inv.consume(id, n);
        if (used > 0) return used;
      } catch (e) { /* дальше */ }
    }
    if (WS.Action && typeof WS.Action.consume === 'function') {
      try { return WS.Action.consume(id, n) | 0; } catch (e2) { return 0; }
    }
    return 0;
  }

  function invGive(id, n) {
    if (!id) return 0;
    n = Math.max(1, n | 0);
    var inv = WS.Inv;
    if (inv && typeof inv.give === 'function') {
      try {
        var g = inv.give(id, n);
        if (g > 0) return g;
      } catch (e) { /* дальше */ }
    }
    if (WS.Action && typeof WS.Action.give === 'function') {
      try { return WS.Action.give(id, n) | 0; } catch (e2) { return 0; }
    }
    return 0;
  }

  // ====================================================================
  //  СПРАЙТЫ ПОСТРОЕК
  //  Палитра — WS.Spr.pal (договор sprites.js). Всё рисуем кодом,
  //  стилистику держим в духе looting.js (трупы) и world.js (заборы).
  // ====================================================================

  function defSprites() {
    var S = WS.Spr;
    var pal = S.pal;

    // Баррикада: крест-накрест доски с гвоздями, snowy шапка сверху
    S.def('barricade_plank', { w: 56, h: 44, draw: function (c) {
      S.px(c, 6, 26, 44, 6, pal.plank);            // нижняя доска
      S.px(c, 10, 30, 36, 5, pal.wood);
      S.px(c, 8, 8, 7, 28, pal.plank);             // левая диагональ (имитация)
      S.px(c, 41, 8, 7, 28, pal.wood2);             // правая
      S.px(c, 12, 14, 32, 6, pal.plank);            // средняя перекладина
      S.px(c, 12, 14, 32, 1, pal.wood3);
      c.fillStyle = pal.stone;                       // шляпки гвоздей
      c.fillRect(14, 16, 2, 2); c.fillRect(40, 16, 2, 2);
      c.fillRect(15, 28, 2, 2); c.fillRect(38, 28, 2, 2);
      S.px(c, 6, 4, 44, 5, pal.snow1);              // снег наверху
      S.px(c, 12, 7, 30, 2, pal.snow2);
    }});

    // Забаррикадированная дверь: полотно + доски поверх
    S.def('door_barricade', { w: 48, h: 56, draw: function (c) {
      S.px(c, 10, 12, 28, 40, '#3e2f1f');           // тёмное полотно двери
      S.px(c, 12, 14, 24, 36, '#54402b');
      S.px(c, 11, 20, 26, 6, pal.plank);            // доска 1
      S.px(c, 11, 32, 26, 6, pal.plank);            // доска 2
      c.save();                                      // диагональ
      c.translate(24, 34);
      c.rotate(-0.6);
      S.px(c, -14, -3, 28, 5, pal.wood3);
      c.restore();
      c.fillStyle = pal.stone;
      c.fillRect(13, 22, 2, 2); c.fillRect(33, 22, 2, 2);
      c.fillRect(13, 34, 2, 2); c.fillRect(33, 34, 2, 2);
      S.px(c, 10, 8, 28, 4, pal.snow1);             // снег на притолоке
    }});

    // Заколоченное окно: рама + две доски «наискось»
    S.def('window_plank', { w: 48, h: 46, draw: function (c) {
      S.px(c, 8, 10, 32, 26, pal.wood2);            // рама
      S.px(c, 11, 13, 26, 20, '#1d2b3d');           // тёмное стекло
      S.px(c, 10, 16, 28, 7, pal.plank);           // доска горизонт 1
      S.px(c, 10, 27, 28, 7, pal.plank);           // доска горизонт 2
      c.save();                                      // диагональ поверх
      c.translate(24, 24);
      c.rotate(0.5);
      S.px(c, -16, -2, 32, 5, pal.wood3);
      c.restore();
      c.fillStyle = pal.stone;
      c.fillRect(12, 18, 2, 2); c.fillRect(34, 18, 2, 2);
      c.fillRect(12, 29, 2, 2); c.fillRect(34, 29, 2, 2);
      S.px(c, 8, 7, 32, 4, pal.snow1);
    }});

    // Сегмент забора: два столба + две перекладины
    S.def('fence_seg', { w: 60, h: 40, draw: function (c) {
      S.px(c, 8, 10, 6, 26, '#5c4730');             // левый столб
      S.px(c, 46, 10, 6, 26, '#5c4730');           // правый столб
      S.px(c, 6, 14, 48, 5, '#6a5238');             // перекладина верх
      S.px(c, 6, 24, 48, 5, '#6a5238');             // перекладина низ
      S.px(c, 14, 8, 4, 22, pal.wood);              // штакетины
      S.px(c, 28, 8, 4, 22, pal.wood);
      S.px(c, 42, 8, 4, 22, pal.wood2);
      S.px(c, 6, 6, 48, 3, pal.snow1);              // снег сверху
    }});

    // Снежная стена: округлый сугроб-бруствер
    S.def('snow_wall', { w: 60, h: 36, draw: function (c) {
      S.ell(c, 30, 20, 27, 12, pal.snow1);
      S.ell(c, 30, 16, 24, 9, pal.snow2);
      S.ell(c, 22, 22, 10, 5, pal.snow3);
      S.ell(c, 42, 20, 8, 4, pal.snowShadow);
      S.px(c, 14, 24, 32, 4, pal.snow3);            // основание-тень
    }});

    // Снегозадержательный щит: наклонные планки на столбах
    S.def('snow_fence', { w: 48, h: 44, draw: function (c) {
      S.px(c, 6, 16, 5, 26, '#5c4730');
      S.px(c, 37, 16, 5, 26, '#5c4730');
      c.save();
      c.translate(24, 26);
      c.rotate(-0.35);
      S.px(c, -20, -8, 40, 6, pal.wood);            // наклонная решётка
      S.px(c, -20, 2, 40, 6, pal.wood2);
      c.restore();
      S.ell(c, 24, 38, 16, 5, pal.snow1);           // наметённый сугроб
      S.ell(c, 20, 40, 10, 3, pal.snow2);
    }});

    // Патч пола/трапа: доски по ромбу тайла
    S.def('floor_patch', { w: 64, h: 30, draw: function (c) {
      S.px(c, 8, 8, 48, 16, pal.wood3);
      S.px(c, 10, 10, 44, 12, pal.plank);
      S.px(c, 10, 10, 44, 1, pal.wood3);
      S.px(c, 10, 16, 44, 1, pal.wood2);
      S.px(c, 26, 10, 1, 12, pal.wood2);
      S.px(c, 42, 10, 1, 12, pal.wood2);
    }});

    // Поленница: стопка брёвен
    S.def('wood_pile_storage', { w: 40, h: 26, draw: function (c) {
      // нижний ряд
      S.ell(c, 10, 20, 6, 4, pal.trunk);
      S.ell(c, 20, 21, 6, 4, pal.trunk);
      S.ell(c, 30, 20, 6, 4, pal.trunk);
      // верхний ряд
      S.ell(c, 15, 14, 6, 4, '#5a4632');
      S.ell(c, 25, 14, 6, 4, '#5a4632');
      // верхушка + снег
      S.ell(c, 20, 8, 5, 3, pal.trunk);
      S.px(c, 12, 3, 16, 2, pal.snow1);
      S.px(c, 4, 23, 32, 2, pal.snow2);
    }});

    // Силок: петля на снегу с двумя колышками
    S.def('snare', { w: 24, h: 18, draw: function (c) {
      S.px(c, 4, 8, 2, 8, '#5c4730');               // колышки
      S.px(c, 18, 8, 2, 8, '#5c4730');
      c.strokeStyle = '#8f9aa6';                     // проволочная петля
      c.lineWidth = 1;
      c.beginPath();
      c.ellipse(12, 8, 7, 4, 0, 0, Math.PI * 2);
      c.stroke();
      S.ell(c, 12, 14, 9, 3, 'rgba(226,232,240,0.6)'); // припорошено
    }});

    // Прорубь: тёмная дыра во льду с обломками кромки
    S.def('ice_hole_mark', { w: 40, h: 26, draw: function (c) {
      S.ell(c, 20, 14, 16, 8, pal.ice2);            // потемнение льда
      S.ell(c, 20, 13, 11, 5, '#22344c');           // вода
      S.ell(c, 18, 12, 6, 2, '#2c425e');            // блик
      c.fillStyle = '#c3d8ea';                        // осколки кромки
      c.fillRect(8, 12, 3, 2); c.fillRect(30, 15, 3, 2);
      c.fillRect(20, 5, 2, 3);
    }});
  }

  // ====================================================================
  //  РЕЖИМ СТРОИТЕЛЬСТВА
  // ====================================================================

  /** Текущий выбранный рецепт. */
  function current() { return BUILDABLES[curIdx] || null; }

  /** Включён ли режим. */
  function active() { return mode; }

  /** Включить/выключить режим (клавиша B). Возвращает новое состояние. */
  function toggle() {
    var g = G();
    if (!g || !g.running || g.dead) return false;
    mode = !mode;
    if (mode) {
      ghostEnsure();
      var b = current();
      toast('Строительство: ' + (b ? b.name : '—') +
        ' · колесо — выбор · ЛКМ — строить · ПКМ — выход', 'info');
      snd('select', 0, 0, 0.5);
    } else {
      ghostHide();
      toast('Строительство выключено', 'info');
    }
    return mode;
  }

  /**
   * Сменить рецепт (колесо мыши / [ ]). dir: +1/-1. Пропускает по кругу,
   * показывает название и материалы.
   */
  function cycle(dir) {
    if (!BUILDABLES.length) return null;
    curIdx = (curIdx + (dir > 0 ? 1 : -1) + BUILDABLES.length) % BUILDABLES.length;
    var b = current();
    if (mode) {
      toast(b.name + ' — ' + materialsText(b), 'info');
      snd('click', 0, 0, 0.4);
    }
    return b;
  }

  /** Выбрать рецепт по id (для UI-меню стройки). */
  function select(id) {
    var idx = -1;
    for (var i = 0; i < BUILDABLES.length; i++) {
      if (BUILDABLES[i].id === id) { idx = i; break; }
    }
    if (idx < 0) return false;
    curIdx = idx;
    if (!mode) toggle();
    return true;
  }

  /** Человеческий список материалов рецепта. */
  function materialsText(b) {
    if (!b || !b.req || !b.req.length) return 'без материалов';
    var parts = [];
    for (var i = 0; i < b.req.length; i++) {
      parts.push(itemName(b.req[i].id) + ' ×' + b.req[i].n);
    }
    var s = parts.join(', ');
    if (b.tools && b.tools.length) s += ' + ' + itemName(b.tools[0]);
    return s;
  }

  /** Хватает ли материалов и инструмента. Возвращает {ok, missing}. */
  function affordable(b) {
    var missing = [];
    if (b.req) {
      for (var i = 0; i < b.req.length; i++) {
        var r = b.req[i];
        if (invCount(r.id) < r.n) missing.push(itemName(r.id) + ' ×' + (r.n - invCount(r.id)));
      }
    }
    if (b.tools) {
      for (var k = 0; k < b.tools.length; k++) {
        if (invCount(b.tools[k]) < 1) missing.push(itemName(b.tools[k]));
      }
    }
    return { ok: missing.length === 0, missing: missing };
  }

  // ====================================================================
  //  ПРИЗРАК (ghost)
  //  Сущность без hp: не мешает бою (entOnRay/sectorScan пропускают),
  //  не подбирается, не сохраняется. render() рисует спрайт постройки
  //  полупрозрачно и подсвечивает тайл: зелёный — можно, красный — нельзя.
  // ====================================================================

  function ghostEnsure() {
    var w = W();
    if (!w || !w.addEnt) return;
    if (ghost && w.ents && w.ents.indexOf(ghost) >= 0) return;   // жив
    ghost = w.addEnt({
      kind: 'ghost',
      id: 'build_ghost',
      x: 0, y: 0, dir: 0,
      sprName: null,
      shadow: false,
      hidden: true,
      render: ghostRender
    });
  }

  function ghostHide() {
    if (!ghost) return;
    ghost.hidden = true;
  }

  /** Отрисовка призрака (вызывается Gfx.drawSorted). */
  function ghostRender(ctx, sx, sy, zoom) {
    var b = current();
    if (!b || !mode || constr) return;
    var p = P();
    if (!p) return;

    var m = mouse();
    var ok = canPlaceAt(b, m.tx, m.ty).ok && affordable(b).ok;
    var col = ok ? 'rgba(120,200,130,' : 'rgba(220,90,80,';

    // 1) ромб тайла под постройкой
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = col + '0.35)';
    var tw = 32 * zoom, th = 16 * zoom;             // половины ромба тайла
    ctx.beginPath();
    ctx.moveTo(sx, sy - th);
    ctx.lineTo(sx + tw, sy);
    ctx.lineTo(sx, sy + th);
    ctx.lineTo(sx - tw, sy);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // 2) спрайт постройки полупрозрачно
    var img = WS.Spr ? WS.Spr.get(b.sprName, 0, 0) : null;
    var iH = 32;
    if (img) {
      ctx.save();
      ctx.globalAlpha = GHOST_ALPHA;
      var iw = img.width * zoom, ihh = img.height * zoom;
      iH = img.height;
      ctx.drawImage(img, sx - iw / 2, sy - ihh, iw, ihh);
      ctx.restore();
    }

    // 3) подпись: название + материалы (раз в 0.5 сек обновляем раскладку)
    ctx.save();
    ctx.font = 'bold ' + Math.round(11 * Math.max(0.8, zoom)) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = ok ? '#a8d8a0' : '#e0a8a0';
    var line1 = b.name;
    var line2 = materialsText(b);
    var aff = affordable(b);
    if (!aff.ok && aff.missing.length) {
      line2 = 'не хватает: ' + aff.missing.join(', ');
    }
    ctx.strokeStyle = 'rgba(8,12,22,0.75)';
    ctx.lineWidth = 3;
    ctx.strokeText(line1, sx, sy - iH - 8);
    ctx.fillText(line1, sx, sy - iH - 8);
    ctx.strokeText(line2, sx, sy - iH + 6);
    ctx.fillText(line2, sx, sy - iH + 6);
    ctx.restore();
  }

  // ====================================================================
  //  ПРОВЕРКА МЕСТА
  //  canPlaceAt(b, tx, ty) -> {ok, reason}
  //  Базовые правила: в границах карты, в радиусе стройки, тайл свободен
  //  (не стена/вода/закрытая дверь), нет другой нашей постройки и нет
  //  solid-объекта; специфичные правила — в b.where (окно/дверь/лёд).
  // ====================================================================

  function canPlaceAt(b, tx, ty) {
    var w = W();
    var p = P();
    if (!w || !p || !b) return { ok: false, reason: 'мир недоступен' };
    if (tx < 1 || ty < 1 || tx >= w.w - 1 || ty >= w.h - 1) {
      return { ok: false, reason: 'край мира' };
    }
    if (WS.M.dist(p.x, p.y, tx + 0.5, ty + 0.5) > BUILD_RANGE) {
      return { ok: false, reason: 'слишком далеко' };
    }
    if (constr) return { ok: false, reason: 'уже строим' };

    // специфичное место (окно/дверь/лёд/вода/дом)
    if (b.where && !b.where(tx, ty)) {
      return { ok: false, reason: 'не подходит место' };
    }

    // тайловые постройки (пол/трап) — не объекты, правила проще
    if (b.tile) {
      return { ok: true, reason: '' };
    }

    var t = w.tileAt(tx, ty);
    if (w.isTileBlocked(tx, ty) && t !== w.T.WINDOW) {
      // окно забить можно, хоть тайл и «стеновой»
      return { ok: false, reason: 'место занято' };
    }

    // не ставить поверх своей постройки
    var list = w.objsAt(tx, ty);
    for (var i = 0; i < (list ? list.length : 0); i++) {
      var o = list[i];
      if (!o) continue;
      if (o._b) return { ok: false, reason: 'здесь уже стоит' };
      if (o.solid && !o.door) return { ok: false, reason: 'место занято' };
      if (o.door && b.id !== 'door_barricade') return { ok: false, reason: 'дверь' };
      if (o.hole) return { ok: false, reason: 'прорубь' };
    }
    return { ok: true, reason: '' };
  }

  // ====================================================================
  //  СТРОИТЕЛЬСТВО
  //  Начало: ЛКМ в режиме стройки. Прогресс 5-20 сек (столярка ускоряет
  //  до ×1.7), звук 'build', частицы стружки. Уход дальше CANCEL_DIST,
  //  сон или модал — стройка брошена (материалы НЕ расходуются до конца).
  // ====================================================================

  /** Начать стройку на тайле. Возвращает true, если началась. */
  function startAt(tx, ty) {
    var b = current();
    var p = P();
    if (!b || !p) return false;
    var cp = canPlaceAt(b, tx, ty);
    if (!cp.ok) {
      toast('Нельзя строить: ' + cp.reason, 'warn');
      snd('error', p.x, p.y, 0.5);
      return false;
    }
    var aff = affordable(b);
    if (!aff.ok) {
      toast('Не хватает: ' + aff.missing.join(', '), 'warn');
      snd('error', p.x, p.y, 0.5);
      return false;
    }
    if (constr) return false;                       // уже заняты стройкой

    // длительность: базовое время / столярка
    var dur = b.time || 8;
    if (WS.Skills && typeof WS.Skills.bonusFor === 'function') {
      var m = WS.Skills.bonusFor('carpentry', 'speed');
      if (typeof m === 'number' && m > 0) dur = dur / m;
    }
    constr = { bid: b.id, x: tx, y: ty, t: 0, dur: dur, b: b };
    sndT = 0;
    snd('build', tx + 0.5, ty + 0.5, 0.7);
    return true;
  }

  /** Тик стройки (в MODE_PRI). Возвращает true, если стройка идёт. */
  function constrTick(dt) {
    var p = P();
    if (!constr || !p) { constr = null; return false; }

    // отмена: уснул, ушёл, модал, смерть
    if (p.sleeping || p.hp <= 0 ||
        WS.M.dist(p.x, p.y, constr.x + 0.5, constr.y + 0.5) > CANCEL_DIST) {
      constr = null;
      toast('Стройка брошена', 'warn');
      return false;
    }
    if (WS.Ui && WS.Ui.modal && WS.Ui.modal()) return true;   // пауза, но не отмена

    constr.t += dt;

    // звуки и стружка
    sndT += dt;
    if (sndT >= SND_EVERY) {
      sndT = 0;
      snd('build', constr.x + 0.5, constr.y + 0.5, 0.55);
      fx('smoke', constr.x + 0.5, constr.y + 0.3, 2, { life: 0.6 });
    }

    // прогресс-текст раз в 0.4 сек
    hintT += dt;
    if (hintT >= 0.4) {
      hintT = 0;
      var pct = Math.min(100, Math.round(constr.t / constr.dur * 100));
      fxText('Строим: ' + constr.b.name + ' ' + pct + '%',
        constr.x + 0.5, constr.y - 0.2, { col: '#c9c2b4', life: 0.45, size: 11 });
    }

    if (constr.t >= constr.dur) {
      finishConstr();
    }
    return true;
  }

  /** Завершение стройки: расход, объект, события, XP. */
  function finishConstr() {
    var c = constr;
    constr = null;
    if (!c) return;
    var b = c.b;
    var p = P();
    if (!p) return;

    // повторная проверка материалов (за время стройки могли потратить)
    var aff = affordable(b);
    if (!aff.ok) {
      toast('Материалы исчезли: ' + aff.missing.join(', '), 'bad');
      return;
    }

    // расход материалов
    if (b.req) {
      for (var i = 0; i < b.req.length; i++) {
        invConsume(b.req[i].id, b.req[i].n);
      }
    }

    var cx = c.x + 0.5, cy = c.y + 0.5;

    // --- специальные постройки ---
    if (b.special === 'campfire') {
      if (WS.Fire && WS.Fire.lightCampfire) {
        var r = WS.Fire.lightCampfire(cx, cy);
        if (r && r.ok) {
          snd('match', cx, cy, 0.8);
          try { WS.Ev.emit('build:built', { id: b.id, x: cx, y: cy, xp: 5 }); } catch (e) { /* пусто */ }
        } else {
          toast('Костёр не разведён: ' + (r && r.reason ? r.reason : 'не вышло'), 'warn');
        }
      } else {
        toast('Огонь недоступен', 'warn');
      }
      return;
    }

    // --- тайловые постройки (пол, трап) ---
    if (b.tile) {
      var w = W();
      var t = (b.tile === 'floorWood') ? w.T.FLOOR_WOOD : w.T.BRIDGE;
      w.setTile(c.x, c.y, t);
      // дифф для сейва (world.js читает World.tileDiff)
      w.tileDiff = w.tileDiff || {};
      w.tileDiff[c.x + ',' + c.y] = t;
      // запись в World.built — восстановление после загрузки
      pushBuilt({ bid: b.id, x: c.x, y: c.y });
      snd('build', cx, cy, 0.8);
      try { WS.Ev.emit('build:built', { id: b.id, x: cx, y: cy, tile: t, xp: 8 }); } catch (e2) { /* пусто */ }
      return;
    }

    // --- обычный объект ---
    var hp = b.hp || 40;
    if (WS.Skills && typeof WS.Skills.bonusFor === 'function') {
      var hm = WS.Skills.bonusFor('carpentry', 'hp');
      if (typeof hm === 'number' && hm > 0) hp = Math.round(hp * hm);
    }

    var w2 = W();
    var o = w2.addObject({
      x: cx, y: cy,
      sprName: b.sprName,
      solid: !!b.solid,
      shadow: false,
      name: b.name,
      bulletPass: !!b.bulletPass,
      windbreak: !!b.windbreak,
      snowTrap: !!b.snowTrap,
      hp: hp, maxHp: hp,
      container: (b.special === 'container') ? 'wood_pile_storage' : undefined,
      buildable: true
    });
    var entry = pushBuilt({ bid: b.id, x: c.x, y: c.y, hp: hp });
    o._b = entry;                                    // ссылка для ремонта/разбора
    rememberLive(o, b, entry);

    snd('build', cx, cy, 0.9);
    fx('snow', cx, cy, 5, { life: 0.5 });            // снежная пыль осела

    try { WS.Ev.emit('build:built', { id: b.id, x: cx, y: cy, o: o, xp: 10 }); }
    catch (e3) { /* пусто */ }
  }

  /** Запись в World.built (сериализация world.js). Возвращает запись. */
  function pushBuilt(entry) {
    var w = W();
    if (!w) return entry;
    if (!w.built) w.built = [];
    w.built.push(entry);
    var g = G();
    if (g && g.stats) {
      g.stats.structuresBuilt = (g.stats.structuresBuilt || 0) + 1;
    }
    return entry;
  }

  /** Держать список живых объектов (для грызни/ремонта/разбора). */
  function rememberLive(o, b, entry) {
    // подчистка мёртвых ссылок
    for (var i = liveBuilt.length - 1; i >= 0; i--) {
      if (!liveBuilt[i].o || liveBuilt[i].o.removed) liveBuilt.splice(i, 1);
    }
    liveBuilt.push({ o: o, b: b, entry: entry });
  }

  // ====================================================================
  //  ВОССТАНОВЛЕНИЕ ПОСЛЕ ЗАГРУЗКИ ('game:load')
  //  World.built — [{bid, x, y, hp}] — материализуем объекты; тайловые
  //  — накатываем setTile. Двойной запуск исключён меткой _done.
  // ====================================================================

  function materialize() {
    var w = W();
    if (!w || !w.built || !w.built.length) return 0;
    var n = 0;
    for (var i = 0; i < w.built.length; i++) {
      var e = w.built[i];
      if (!e || e._done) continue;
      var b = BY_ID[e.bid];
      if (!b) continue;
      e._done = true;

      if (b.tile) {
        var t = (b.tile === 'floorWood') ? w.T.FLOOR_WOOD : w.T.BRIDGE;
        w.setTile(e.x, e.y, t);
        w.tileDiff = w.tileDiff || {};
        w.tileDiff[e.x + ',' + e.y] = t;
        n++;
        continue;
      }

      var hp = e.hp || b.hp || 40;
      var o = w.addObject({
        x: e.x + 0.5, y: e.y + 0.5,
        sprName: b.sprName,
        solid: !!b.solid,
        shadow: false,
        name: b.name,
        bulletPass: !!b.bulletPass,
        windbreak: !!b.windbreak,
        snowTrap: !!b.snowTrap,
        hp: hp, maxHp: Math.max(hp, b.hp || 40),
        container: (b.special === 'container') ? 'wood_pile_storage' : undefined,
        buildable: true
      });
      o._b = e;
      rememberLive(o, b, e);
      n++;
    }
    if (n > 0) WS.log('build: восстановлено построек — ' + n);
    return n;
  }

  // ====================================================================
  //  РЕМОНТ (G) И РАЗБОР (X)
  //  Ремонт: молоток + 1 доска → +35 hp (не выше max). Разбор: 50%
  //  материалов (по ТЗ). Обе операции — по своей постройке под курсором
  //  или в радиусе 2 тайлов.
  // ====================================================================

  /** Найти свою постройку: под курсором или ближайшую в радиусе 2. */
  function targetBuilt(maxDist) {
    var w = W();
    var p = P();
    if (!w || !p) return null;
    var m = mouse();

    // 1) под курсором
    var list = w.objsAt(m.tx, m.ty);
    for (var i = 0; i < (list ? list.length : 0); i++) {
      if (list[i] && list[i]._b) return list[i];
    }

    // 2) ближайшая в радиусе
    var best = null, bd = maxDist;
    for (var k = 0; k < liveBuilt.length; k++) {
      var o = liveBuilt[k].o;
      if (!o || o.removed || !o._b) continue;
      var d = WS.M.dist(p.x, p.y, o.x, o.y);
      if (d <= bd) { bd = d; best = o; }
    }
    return best;
  }

  /** Починить постройку (клавиша G). */
  function repair() {
    var p = P();
    if (!p) return false;
    var o = targetBuilt(2);
    if (!o) {
      toast('Рядом нет ваших построек', 'info');
      return false;
    }
    if (typeof o.hp !== 'number' || !o.maxHp || o.hp >= o.maxHp) {
      toast('Эта постройка цела', 'info');
      return false;
    }
    if (invCount('hammer') < 1) {
      toast('Нужен молоток', 'warn');
      snd('error', p.x, p.y, 0.5);
      return false;
    }
    if (invCount('plank') < 1) {
      toast('Нужна доска', 'warn');
      snd('error', p.x, p.y, 0.5);
      return false;
    }

    invConsume('plank', 1);
    var was = o.hp;
    o.hp = Math.min(o.maxHp, o.hp + REPAIR_HP);
    // синхронизировать запись сейва
    if (o._b) o._b.hp = o.hp;

    snd('build', o.x, o.y, 0.7);
    fx('smoke', o.x, o.y, 3, { life: 0.6 });
    fxText('Починено: +' + Math.round(o.hp - was) + ' hp', o.x, o.y - 0.8, {
      col: '#a8d8a0', life: 1.4
    });
    try { WS.Ev.emit('build:repaired', { o: o, hp: o.hp }); } catch (e) { /* пусто */ }
    return true;
  }

  /** Разобрать постройку (клавиша X): вернуть 50% материалов. */
  function dismantle() {
    var p = P();
    var w = W();
    if (!p || !w) return false;
    var o = targetBuilt(2);
    if (!o) {
      toast('Рядом нет ваших построек', 'info');
      return false;
    }
    var b = BY_ID[o._b.bid];
    if (!b) return false;
    if (invCount('hammer') < 1 && b.req && b.req.length) {
      toast('Без молотка не разобрать', 'warn');
      return false;
    }

    // возврат 50% материалов (по ТЗ)
    var back = [];
    if (b.req) {
      for (var i = 0; i < b.req.length; i++) {
        var r = b.req[i];
        var n = Math.floor(r.n * DISMANTLE_REFUND);
        if (n > 0 && invGive(r.id, n) > 0) {
          back.push(itemName(r.id) + ' ×' + n);
        }
      }
    }

    removeBuilt(o, false);
    snd('chop', o.x, o.y, 0.8);
    fx('snow', o.x, o.y, 4, { life: 0.5 });
    fxText('Разобрано' + (back.length ? ': ' + back.join(', ') : ''), o.x, o.y - 0.8, {
      col: '#c9c2b4', life: 1.8
    });

    // плотницкая практика
    try { WS.Ev.emit('build:built', { id: b.id, dismantle: true, x: o.x, y: o.y, xp: 2 }); }
    catch (e) { /* пусто */ }
    return true;
  }

  /** Удалить постройку из мира и списков. violent — сломали звери. */
  function removeBuilt(o, violent) {
    var w = W();
    if (!o || !w) return;
    o.removed = true;                                 // сериализация objState
    if (o._b) {
      var arr = w.built || [];
      var idx = arr.indexOf(o._b);
      if (idx >= 0) arr.splice(idx, 1);
    }
    try { w.removeObject(o); } catch (e) { WS.err('removeObject:', e && e.message); }
    for (var i = liveBuilt.length - 1; i >= 0; i--) {
      if (liveBuilt[i].o === o) liveBuilt.splice(i, 1);
    }
    if (violent) {
      snd('window_break', o.x, o.y, 0.9);
      fx('snow', o.x, o.y, 6, { life: 0.7 });
    }
  }

  // ====================================================================
  //  ВОЛКИ ЛОМАЮТ ПОСТРОЙКИ (мировой тик)
  //  Волк в состоянии hunt/attack, не достающий до игрока, грызёт
  //  ближайшую нашу solid-постройку: hp -= dt*8 (медведь ×2). Слом —
  //  removeObject + звук (по ТЗ). ai.js об этом не знает — наш тик.
  // ====================================================================

  function gnawTick(dt) {
    var g = G();
    var w = W();
    if (!g || !g.running || g.dead || !w || !w.ents) return;
    var p = g.player;
    if (!p || !liveBuilt.length) return;

    for (var i = 0; i < w.ents.length; i++) {
      var e = w.ents[i];
      if (!e || e.dead || !e.hp || e.hp <= 0) continue;
      if (e.kind !== 'wolf' && e.kind !== 'bear') continue;
      if (e.state !== 'hunt' && e.state !== 'attack' && e.state !== 'stalk') continue;

      var dToP = WS.M.dist(e.x, e.y, p.x, p.y);
      if (dToP < 1.6 || dToP > 14) continue;         // достаёт игрока / ушёл

      // ближайшая наша solid-постройка рядом с зверем
      var target = null, bd = GNAW_NEAR_R;
      for (var k = 0; k < liveBuilt.length; k++) {
        var lb = liveBuilt[k];
        if (!lb.o || lb.o.removed) continue;
        if (!lb.o.solid) continue;                    // не solid — не преграда
        var d = WS.M.dist(e.x, e.y, lb.o.x, lb.o.y);
        if (d < bd) { bd = d; target = lb.o; }
      }
      if (!target) continue;

      // грызёт!
      var dps = (e.kind === 'bear') ? BEAR_GNAW_DPS : WOLF_GNAW_DPS;
      target.hp -= dt * dps;
      if (target._b) target._b.hp = target.hp;       // синхронизируем сейв
      e.moving = false;                              // «занят» кусанием

      // частицы щепок и звук — не каждый кадр
      if (Math.random() < dt * 3) {
        fx('spark', target.x, target.y - 0.3, 2, { life: 0.4 });
        snd('chop', target.x, target.y, 0.5);
      }

      if (target.hp <= 0) {
        var name = (target.name || 'Постройка');
        removeBuilt(target, true);
        toast(name + ': сломана зверем!', 'bad');
        try { WS.Ev.emit('build:destroyed', { by: e, kind: e.kind }); } catch (err) { /* пусто */ }
      }
    }
  }

  // ====================================================================
  //  СИЛКИ И ПРОРУБИ
  //  Силок: раз в час ('time:hour') проверка — шанс 30% + forage*4%.
  //  Добыча: труп зайца рядом (WS.Loot.makeCorpse, лут 'hare_body').
  //  Прорубь: рыбалка стоя с удочкой; через 3 часа лёд схватывается.
  // ====================================================================

  /** Почасовая проверка силков. */
  function snareHour() {
    var w = W();
    if (!w) return;
    var chance = SNARE_CHANCE;
    if (WS.Skills && typeof WS.Skills.lvid === 'function') {
      chance += WS.Skills.lvid('forage') * 0.04;
    }

    for (var i = liveBuilt.length - 1; i >= 0; i--) {
      var lb = liveBuilt[i];
      if (!lb.o || lb.o.removed || lb.b.special !== 'snare') continue;
      if (Math.random() >= chance) continue;

      // есть! труп зайца прямо у силка
      var o = lb.o;
      var made = null;
      if (WS.Loot && WS.Loot.makeCorpse) {
        made = WS.Loot.makeCorpse(o.x + (Math.random() - 0.5), o.y + (Math.random() - 0.5), 'hare');
      } else if (WS.Action && WS.Action.makeDrop) {
        made = WS.Action.makeDrop('meat_raw', 1, undefined, o.x, o.y, 0);
      }
      snd('trap_snap', o.x, o.y, 0.9);
      fx('snow', o.x, o.y, 4, { life: 0.5 });
      toast('Силок сработал!', 'good');
      try { WS.Ev.emit('trap:caught', { o: o, corpse: made }); } catch (e) { /* пусто */ }

      // изредка силок рвётся вместе с добычей
      if (Math.random() < SNARE_BREAK_CHANCE) {
        removeBuilt(o, true);
        toast('Силок порван', 'warn');
      }
    }
  }

  /** Почасовое старение прорубей. */
  function holeHour() {
    for (var i = liveBuilt.length - 1; i >= 0; i--) {
      var lb = liveBuilt[i];
      if (!lb.o || lb.o.removed || lb.b.special !== 'fishing') continue;
      lb.o._ageH = (lb.o._ageH || 0) + 1;
      if (lb.o._ageH >= HOLE_FREEZE_H) {
        var o = lb.o;
        removeBuilt(o, false);
        snd('splash', o.x, o.y, 0.6);
        toast('Прорубь затянуло льдом', 'info');
      }
    }
  }

  /** Рыбалка: стоя у проруби с удочкой (мировой тик). */
  function fishTick(dt) {
    var g = G();
    if (!g || !g.running || g.dead) return;
    var p = g.player;
    if (!p || p.sleeping || p.hp <= 0) return;
    if (invCount('fishing_rod') < 1) return;

    for (var i = 0; i < liveBuilt.length; i++) {
      var lb = liveBuilt[i];
      if (!lb.o || lb.o.removed || lb.b.special !== 'fishing') continue;
      var o = lb.o;
      var d = WS.M.dist(p.x, p.y, o.x, o.y);
      if (d > 1.4) { o._fishT = 0; continue; }

      o._fishT = (o._fishT || 0) + dt;
      o._fishDur = o._fishDur || (FISH_CATCH_MIN + Math.random() * FISH_CATCH_VAR);

      // лунка побулькивает — игрок понимает, что ждёт
      if (Math.random() < dt * 0.3) {
        fx('snow', o.x, o.y, 1, { life: 0.3 });
      }

      if (o._fishT >= o._fishDur) {
        o._fishT = 0;
        o._fishDur = FISH_CATCH_MIN + Math.random() * FISH_CATCH_VAR;
        var chance = FISH_CHANCE;
        if (WS.Skills && typeof WS.Skills.lvid === 'function') {
          chance += WS.Skills.lvid('forage') * 0.04;
        }
        if (Math.random() < chance) {
          var given = invGive('fresh_fish', 1);
          if (given > 0) {
            if (g.stats) g.stats.fishCaught = (g.stats.fishCaught || 0) + 1;
            snd('splash', o.x, o.y, 0.8);
            fxText('+ ' + itemName('fresh_fish'), o.x, o.y - 0.6, {
              col: '#7ea3b8', life: 1.6
            });
            try { WS.Ev.emit('fish:caught', { o: o }); } catch (e) { /* пусто */ }
          }
        } else {
          fxText('Поклёвка сорвалась...', o.x, o.y - 0.6, { col: '#8b95a5', life: 1.4 });
        }
      }
    }
  }

  // ====================================================================
  //  ВЕТРОЗАЩИТА (контракт для temperature.js / weather.js)
  //  snow_wall и snow_fence имеют windbreak: true. Модули климата могут
  //  спрашивать: WS.Build.windBlocked(x, y) — есть ли щит в 2 тайлах.
  // ====================================================================

  /** Есть ли ветрозащита рядом с точкой (радиус 2 тайла). */
  function windBlocked(x, y) {
    var w = W();
    if (!w || !w.objsAt) return false;
    var tx = Math.floor(x), ty = Math.floor(y);
    for (var cy = ty - 2; cy <= ty + 2; cy++) {
      for (var cx = tx - 2; cx <= tx + 2; cx++) {
        var list = w.objsAt(cx, cy);
        for (var i = 0; i < (list ? list.length : 0); i++) {
          if (list[i] && list[i].windbreak) return true;
        }
      }
    }
    return false;
  }

  /** Снегозадержание: сколько щитов рядом (для роста сугробов). */
  function snowBreakAt(x, y) {
    var w = W();
    if (!w || !w.objsAt) return 0;
    var n = 0;
    var tx = Math.floor(x), ty = Math.floor(y);
    for (var cy = ty - 2; cy <= ty + 2; cy++) {
      for (var cx = tx - 2; cx <= tx + 2; cx++) {
        var list = w.objsAt(cx, cy);
        for (var i = 0; i < (list ? list.length : 0); i++) {
          if (list[i] && list[i].snowTrap) n++;
        }
      }
    }
    return n;
  }

  // ====================================================================
  //  ТИК РЕЖИМА (приоритет 59 — до player:60/actions:61)
  //  Здесь съедаем мышиные клики режима стройки (mouse.leftP = false),
  //  чтобы actions.js не бил кулаком по свежей баррикаде.
  // ====================================================================

  /** Тик перехвата колеса (до камеры): в режиме — выбор рецепта. */
  function wheelTick() {
    if (!mode || constr) return;
    var m = mouse();
    if (m.wheel !== 0) {
      cycle(m.wheel > 0 ? 1 : -1);
      m.wheel = 0;                                    // камера не зумит
    }
  }

  function modeTick(dt) {
    var g = G();
    if (!g || !g.running || g.dead) return;
    var p = g.player;
    if (!p || p.sleeping || p.hp <= 0) { if (mode) toggle(); return; }
    if (WS.Ui && WS.Ui.modal && WS.Ui.modal()) return;   // меню — не строим

    // --- идущая стройка ---
    if (constr) {
      constrTick(dt);
      if (!mode) { ghostHide(); return; }             // режим выключен — призрак гасим
    }

    // --- ввод режима ---
    if (WS.Input.hit('build')) { toggle(); return; }
    if (!mode) return;

    var m = mouse();

    // (колесо обрабатывает wheelTick с приоритетом 4 — до зума камеры)
    // скобки — альтернатива колесу
    if (WS.Input.hitCode('BracketLeft')) cycle(-1);
    if (WS.Input.hitCode('BracketRight')) cycle(1);

    // призрак следует за мышью (sprName НЕ ставим: Gfx рисовал бы
    // спрайт непрозрачно — вся отрисовка в render() с альфой)
    ghostEnsure();
    if (ghost) {
      ghost.hidden = !!constr;                        // во время стройки скрыт
      ghost.x = m.tx + 0.5;
      ghost.y = m.ty + 0.5;
      ghost.sprName = null;
    }

    // ЛКМ: начать стройку (и съесть клик)
    if (m.leftP) {
      m.leftP = false;
      if (!constr) startAt(m.tx, m.ty);
      return;
    }

    // ПКМ: выход из режима (и съесть клик)
    if (m.rightP) {
      m.rightP = false;
      toggle();
      return;
    }

    // G: ремонт
    if (WS.Input.hitCode(REPAIR_KEY)) repair();

    // X: разбор
    if (WS.Input.hitCode(DISMANTLE_KEY)) dismantle();
  }

  // ====================================================================
  //  САМОТЕСТ (ручная проверка; вызывается из консоли)
  // ====================================================================

  function selftest() {
    var out = [];
    var pass = 0, fail = 0;
    function ok(name, cond) {
      if (cond) { pass++; out.push('  ok   ' + name); }
      else { fail++; out.push('  FAIL ' + name); }
      return !!cond;
    }
    ok('модуль зарегистрирован', !!WS.Build);
    ok('12 построек в списке', BUILDABLES.length === 12);
    ok('WS.BUILDABLES публичный', WS.BUILDABLES === BUILDABLES);

    // спрайты объявлены
    var S = WS.Spr;
    var names = ['barricade_plank', 'door_barricade', 'window_plank', 'fence_seg',
      'snow_wall', 'snow_fence', 'floor_patch', 'wood_pile_storage', 'snare', 'ice_hole_mark'];
    for (var i = 0; i < names.length; i++) {
      ok('спрайт ' + names[i], !!(S && S.get && S.get(names[i], 0, 0)));
    }

    // canPlaceAt вне мира не падает
    var cp = canPlaceAt(BUILDABLES[0], -5, -5);
    ok('canPlaceAt вне мира', cp && cp.ok === false);

    // материалы текстом
    ok('materialsText читаем', typeof materialsText(BUILDABLES[0]) === 'string');

    // ветрозащита без мира/партии — false
    ok('windBlocked безопасен', typeof windBlocked(0, 0) === 'boolean');

    // тики и слушатели на месте
    ok('toggle возвращает булево', typeof toggle() === 'boolean');
    if (mode) toggle();                                // вернуть выключенным
    out.unshift('build.selftest: ' + pass + ' ок, ' + fail + ' провалено');
    return out;
  }

  // ====================================================================
  //  ПУБЛИЧНЫЙ API МОДУЛЯ
  // ====================================================================

  var Build = {
    // --- данные (по ТЗ) ---
    BUILDABLES: BUILDABLES,
    byId: function (id) { return BY_ID[id] || null; },

    // --- режим ---
    active: active,
    toggle: toggle,
    cycle: cycle,
    select: select,
    current: current,
    materialsText: materialsText,
    affordable: function (b) { return affordable(b || current()); },
    canPlaceAt: function (tx, ty) { return canPlaceAt(current(), tx, ty); },

    // --- операции ---
    startAt: startAt,
    repair: repair,
    dismantle: dismantle,

    // --- климат-контракт ---
    windBlocked: windBlocked,
    snowBreakAt: snowBreakAt,

    // --- состояние (для UI) ---
    building: function () { return constr ? { id: constr.bid, t: constr.t, dur: constr.dur } : null; },
    count: function () { return liveBuilt.length; },

    selftest: selftest
  };

  WS.def('Build', Build);
  WS.BUILDABLES = BUILDABLES;                         // короткий алиас по ТЗ

  // ====================================================================
  //  BOOT
  // ====================================================================

  WS.boot(function initBuild() {
    // спрайты построек
    defSprites();

    // таблица лута поленницы (если лут-агент не объявил свою)
    WS.Data = WS.Data || {};
    WS.Data.loot = WS.Data.loot || {};
    if (!WS.Data.loot['wood_pile_storage']) {
      // 4 полена — ровно то, что заложено при постройке
      WS.Data.loot['wood_pile_storage'] = {
        rolls: [4, 4],
        items: [{ id: 'log', w: 10, min: 1, max: 1 }]
      };
    }

    // два тика: перехват колеса (4), ввод режима (59) и мир (21)
    WS.tick(WHEEL_PRI, wheelTick, 'build:wheel');
    WS.tick(MODE_PRI, modeTick, 'build:mode');
    WS.tick(WORLD_PRI, function (dt) {
      gnawTick(dt);
      fishTick(dt);
    }, 'build:world');

    // почасовые проверки силков и прорубей
    WS.Ev.on('time:hour', function () {
      snareHour();
      holeHour();
    });

    // восстановление построек после загрузки
    WS.Ev.on('game:load', materialize);

    // новая партия — чистим локальное состояние
    WS.Ev.on('game:start', function () {
      mode = false;
      constr = null;
      liveBuilt = [];
      ghost = null;                                    // мир сброшен — пересоздадим
    });

    WS.log('build: система строительства готова (' + BUILDABLES.length + ' построек)');
  }, 'build:init');

})();
