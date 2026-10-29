/**
 * ИНТЕРЬЕРЫ ЗДАНИЙ: мебель, двери, внутренние перегородки.
 * Подписывается на событие 'gen:town' (gen.js эмитит его ПОСЛЕ постройки
 * посёлка) и наполняет каждое здание из WS.World.buildings мебелью по типу
 * здания (b.type) и роли комнат (b.rooms[].role — см. gen_town.js):
 *   kitchen → печь (обязательно, heat:true) + стол + лавки + буфет;
 *   bedroom → кровати, сундуки, шкапы, люлька, красный угол;
 *   living  → буфет, самовар, тахта; storage → ящики, бочки, мешки, сено;
 *   office/shop/school/workshop/bath/altar/cell/hall — по смыслу.
 * Двери: на каждом b.door ставится объект {door:{open,locked}}; управление —
 * WS.Interiors.tryDoor(o). Печь — источник тепла (heat:true, fire:false),
 * растопка придёт позже (система печей). В конце эмитится 'gen:interiors'
 * {R} — на него подписаны звери и прочие наполнители.
 * Спрайты мебели регистрируются ПРИ ЗАГРУЗКЕ файла (WS.Spr.def), пиксель-арт
 * кодом в единицах 1 ед. = 2 пикселя (как gen_town.js).
 * Связь: gen_town.js (геометрия), data/loot_tables.js (контейнеры),
 * systems/looting.js (обыск контейнеров).
 */
(function () {
  'use strict';

  // ==================================================================
  //  ПРИМИТИВЫ ПИКСЕЛЬ-АРТА (1 ед. = 2 пикселя)
  // ==================================================================

  /** Прямоугольник в логических единицах. */
  function R2(c, x, y, w, h, col) {
    c.fillStyle = col;
    c.fillRect(x * 2, y * 2, w * 2, h * 2);
  }
  /** Эллипс в логических единицах. */
  function E2(c, x, y, rx, ry, col) {
    c.fillStyle = col;
    c.beginPath();
    c.ellipse(x * 2, y * 2, rx * 2, ry * 2, 0, 0, Math.PI * 2);
    c.fill();
  }
  /** Точка (2x2) в логических единицах. */
  function D2(c, x, y, col) {
    c.fillStyle = col;
    c.fillRect(x * 2, y * 2, 2, 2);
  }

  // Оттенки сверх палитры WS.Spr.pal — побелка, воск, керамика.
  var COL = {
    white1: '#d8d3c6', white2: '#e8e4d8', white3: '#b3ad9f',
    white4: '#a8a294', seam: '#c4bfb1',
    wax: '#e8e2d0', wax2: '#d8d3c6',
    brassD: '#8a6a2a', brassL: '#c9a44a', brassHi: '#e2c068',
    iron1: '#3a3f4a', iron2: '#5a5f68', iron3: '#767a82',
    cloth1: '#a89a7c', cloth2: '#b5a884', cloth3: '#8a7d62',
    red1: '#6f3a34', red2: '#7a463f', red3: '#5c2f2a', red4: '#8a534a',
    glass1: '#2c3644', glass2: '#3d5474',
    grain: '#c9b57a', grain2: '#b5a066'
  };

  // ==================================================================
  //  СПРАЙТЫ МЕБЕЛИ (регистрация при загрузке; рисование — ленивое).
  //  Стиль: вид сверху 3/4, тёмное дерево, латунь, приглушённые тона.
  // ==================================================================

  // -------- ПЕЧЬ РУССКАЯ, 48x56: побелка, устье с заслонкой, труба --------
  // Крупнейший предмет избы: тепло и стряпня. heat:true у объекта.
  WS.Spr.def('pech', {
    w: 48, h: 56,
    draw: function (c) {
      var p = WS.Spr.pal;
      // кирпичная труба к потолку
      R2(c, 14, 0, 5, 9, '#b7b1a3');
      R2(c, 14, 0, 5, 1, '#c9c3b5');
      R2(c, 14, 1, 1, 8, '#a29c8e');
      R2(c, 18, 1, 1, 8, '#8f897c');
      R2(c, 13, 0, 7, 1, p.snow2);          // снежок над трубой
      // побеленное тело печи
      R2(c, 2, 9, 19, 13, COL.white1);
      R2(c, 2, 9, 19, 1, COL.white2);       // верхняя кромка
      R2(c, 2, 10, 1, 12, '#e2ddd0');       // световая грань
      R2(c, 20, 10, 1, 12, COL.white3);     // теневая грань
      R2(c, 2, 21, 19, 1, COL.white4);      // основание
      // швы кладки
      R2(c, 4, 12, 15, 1, COL.seam);
      R2(c, 4, 15, 15, 1, COL.seam);
      R2(c, 4, 18, 15, 1, COL.seam);
      // шесток — полка перед устьем
      R2(c, 7, 17, 10, 2, '#c9c3b5');
      // устье (топка) — тёмный зев со сводом
      R2(c, 8, 11, 7, 6, '#241a10');
      R2(c, 9, 10, 5, 1, '#31241a');
      // остывшие угли в горне
      D2(c, 10, 13, '#4a3524'); D2(c, 12, 14, '#3c2b1d'); D2(c, 11, 15, '#422f20');
      // заслонка устья
      R2(c, 8, 11, 7, 1, COL.iron2);
      // чугунок и ухват на шестке
      E2(c, 6, 20, 1.4, 1.1, COL.iron1);
      D2(c, 6, 19, p.steel);
      // подпечье с дровами
      R2(c, 2, 22, 19, 5, p.wood2);
      R2(c, 3, 22, 17, 1, p.wood);
      E2(c, 5, 24, 1.4, 1.4, p.wood3); D2(c, 5, 24, p.wood2);
      E2(c, 8, 25, 1.4, 1.4, p.wood3); D2(c, 8, 25, p.wood2);
      E2(c, 11, 24, 1.4, 1.4, p.wood3); D2(c, 11, 24, p.wood2);
      E2(c, 14, 25, 1.4, 1.4, p.wood3); D2(c, 14, 25, p.wood2);
      // подступок
      R2(c, 1, 26, 21, 2, '#8f897c');
      R2(c, 2, 27, 19, 1, '#7c7669');
    }
  });

  // -------- СТОЛ ДОМАШНИЙ, 44x30: дощатая столешница, миска и ковш --------
  WS.Spr.def('table_wood', {
    w: 44, h: 30,
    draw: function (c) {
      var p = WS.Spr.pal;
      // столешница (вид 3/4)
      R2(c, 2, 4, 17, 5, p.plank);
      R2(c, 2, 4, 17, 1, '#96795b');
      R2(c, 2, 5, 1, 4, '#9a7d5f');
      R2(c, 18, 5, 1, 4, p.wood2);
      R2(c, 2, 9, 17, 1, p.wood);            // торец столешницы
      // доски-швы
      R2(c, 4, 6, 13, 1, p.wood);
      // ножки
      R2(c, 4, 10, 2, 4, p.wood2);
      R2(c, 15, 10, 2, 4, p.wood2);
      R2(c, 4, 13, 13, 1, '#3e3830');        // тень под столом
      // на столе: миска и ковш
      E2(c, 6, 6, 1.6, 1.1, '#8a8276'); D2(c, 6, 6, '#6f685d');
      E2(c, 13, 7, 1.2, 0.8, '#7d8a94');
      D2(c, 15, 6, '#8a8276');
    }
  });

  // -------- СТУЛ, 22x30 --------
  WS.Spr.def('chair', {
    w: 22, h: 30,
    draw: function (c) {
      var p = WS.Spr.pal;
      R2(c, 3, 2, 6, 1, p.wood3);            // верх спинки
      R2(c, 3, 3, 1, 6, p.wood2);            // стойки спинки
      R2(c, 8, 3, 1, 6, p.wood2);
      R2(c, 4, 5, 4, 1, p.wood);             // перекладина
      R2(c, 4, 6, 4, 2, '#7d6046');
      R2(c, 2, 9, 8, 2, p.plank);            // сиденье
      R2(c, 2, 11, 8, 1, p.wood);
      R2(c, 3, 12, 1, 3, p.wood2);           // ножки
      R2(c, 8, 12, 1, 3, p.wood2);
      R2(c, 2, 14, 8, 1, '#3e3830');         // тень
    }
  });

  // -------- ЛАВКА, 44x22 --------
  WS.Spr.def('bench', {
    w: 44, h: 22,
    draw: function (c) {
      var p = WS.Spr.pal;
      R2(c, 1, 4, 19, 3, p.plank);           // сиденье
      R2(c, 1, 4, 19, 1, '#96795b');
      R2(c, 1, 6, 19, 1, p.wood);
      R2(c, 1, 7, 19, 1, p.wood2);           // торец
      R2(c, 2, 8, 2, 2, p.wood2);            // ножки-копыла
      R2(c, 17, 8, 2, 2, p.wood2);
      R2(c, 1, 10, 19, 1, '#3e3830');        // тень
      D2(c, 10, 5, '#54402b'); D2(c, 13, 5, '#54402b');  // щели лавки
    }
  });

  // -------- КРОВАТЬ ПРОСТАЯ, 48x40: соломник, подушка, домотканое одеяло --------
  WS.Spr.def('bed_wood', {
    w: 48, h: 40,
    draw: function (c) {
      var p = WS.Spr.pal;
      // изголовье
      R2(c, 2, 1, 19, 2, p.wood3);
      R2(c, 2, 1, 19, 1, '#96795b');
      R2(c, 1, 0, 1, 4, p.wood2); R2(c, 20, 0, 1, 4, p.wood2);
      D2(c, 1, 0, p.brass); D2(c, 20, 0, p.brass);
      R2(c, 2, 3, 19, 1, p.wood);
      // матрац-соломник
      R2(c, 3, 4, 17, 9, COL.cloth1);
      R2(c, 3, 4, 17, 1, COL.cloth2);
      R2(c, 3, 12, 17, 1, COL.cloth3);
      // подушка
      R2(c, 4, 4, 6, 3, '#c9c2b4');
      R2(c, 4, 6, 6, 1, '#b3ad9f');
      // одеяло
      R2(c, 3, 8, 17, 4, COL.red1);
      R2(c, 3, 8, 17, 1, COL.red2);
      R2(c, 3, 11, 17, 1, COL.red3);
      R2(c, 7, 9, 9, 1, COL.red4);            // домотканый узор
      // передняя спинка
      R2(c, 2, 13, 19, 2, p.wood3);
      R2(c, 2, 14, 19, 1, p.wood2);
      R2(c, 2, 15, 19, 1, '#3e3830');
      D2(c, 13, 6, '#968b6e'); D2(c, 16, 6, '#968b6e'); // солома наружу
    }
  });

  // -------- КРОВАТЬ ХОЗЯЙСКАЯ, 48x44: резьба, бархат, балдахинные столбы --------
  WS.Spr.def('bed_fancy', {
    w: 48, h: 44,
    draw: function (c) {
      var p = WS.Spr.pal;
      // резное изголовье
      R2(c, 2, 0, 19, 3, '#54402b');
      R2(c, 2, 0, 19, 1, '#6b5138');
      R2(c, 4, 1, 15, 1, '#6b5138');
      R2(c, 0, 0, 2, 5, '#54402b'); R2(c, 20, 0, 2, 5, '#54402b');
      D2(c, 1, 0, p.brass); D2(c, 21, 0, p.brass);
      // следы балдахина
      R2(c, 1, 1, 1, 4, COL.red1); R2(c, 21, 1, 1, 4, COL.red1);
      // перина
      R2(c, 3, 4, 17, 10, COL.cloth2);
      R2(c, 3, 4, 17, 1, '#c2b590');
      R2(c, 3, 13, 17, 1, '#968b6e');
      // пуховые подушки
      R2(c, 4, 4, 5, 3, '#d3cec0'); R2(c, 9, 4, 4, 2, '#c9c2b4');
      // бархатное одеяло с каймой
      R2(c, 3, 8, 17, 5, COL.red3);
      R2(c, 3, 8, 17, 1, COL.red1);
      R2(c, 3, 12, 17, 1, '#472420');
      R2(c, 3, 10, 17, 1, COL.red4);
      D2(c, 11, 13, p.brass);                 // кисть
      // передняя спинка
      R2(c, 2, 14, 19, 2, '#54402b');
      R2(c, 2, 15, 19, 1, '#3e2f1f');
      R2(c, 2, 16, 19, 1, '#3e3830');
      D2(c, 2, 16, p.brass); D2(c, 20, 16, p.brass);  // «львиные лапы»
    }
  });

  // -------- БУФЕТ, 40x52: витрина с посудой, ящик, нижние дверцы --------
  WS.Spr.def('cupboard', {
    w: 40, h: 52,
    draw: function (c) {
      var p = WS.Spr.pal;
      // карниз
      R2(c, 1, 2, 17, 2, p.wood3);
      R2(c, 1, 2, 17, 1, '#96795b');
      // верхняя витрина
      R2(c, 2, 4, 15, 8, '#4c453a');
      R2(c, 3, 5, 13, 6, COL.glass1);
      // посуда за стеклом
      D2(c, 5, 7, '#8fb4d1'); D2(c, 7, 6, '#a9c6dd'); D2(c, 9, 7, '#8fb4d1');
      D2(c, 12, 6, '#a9c6dd'); D2(c, 14, 7, '#8fb4d1');
      // рамки витрины
      R2(c, 2, 4, 15, 1, p.plank);
      R2(c, 2, 11, 15, 1, p.plank);
      R2(c, 2, 4, 1, 8, p.wood); R2(c, 16, 4, 1, 8, p.wood2);
      // блик стекла
      R2(c, 4, 5, 2, 4, 'rgba(214,226,238,0.35)');
      // столешница-разделка
      R2(c, 1, 12, 17, 2, p.plank);
      // выдвижной ящик
      R2(c, 3, 14, 13, 3, p.wood);
      R2(c, 3, 14, 13, 1, p.wood3);
      D2(c, 9, 15, p.brass);
      // нижний корпус с дверцами
      R2(c, 2, 17, 15, 7, p.wood2);
      R2(c, 2, 17, 15, 1, p.wood);
      R2(c, 9, 18, 1, 6, '#3e2f1f');         // щель дверц
      R2(c, 3, 19, 5, 4, p.wood3);           // филёнки
      R2(c, 11, 19, 5, 4, p.wood3);
      D2(c, 8, 20, p.brass); D2(c, 10, 20, p.brass);
      // цоколь
      R2(c, 2, 24, 15, 1, '#3e2f1f');
      R2(c, 3, 25, 13, 1, '#3e3830');
    }
  });

  // -------- ПОЛКА ПОСУДНАЯ, 40x36 --------
  WS.Spr.def('shelf', {
    w: 40, h: 36,
    draw: function (c) {
      var p = WS.Spr.pal;
      // стойки
      R2(c, 2, 4, 1, 9, p.wood2);
      R2(c, 16, 4, 1, 9, p.wood2);
      // верхняя полка с мисками
      R2(c, 2, 6, 15, 1, p.plank);
      E2(c, 4, 5, 1.5, 1, '#8a8276'); D2(c, 4, 5, '#6f685d');
      E2(c, 8, 5, 1.5, 1, '#7d8a94'); D2(c, 8, 5, '#5f6c78');
      E2(c, 12, 5, 1.5, 1, '#8a8276'); D2(c, 12, 5, '#6f685d');
      E2(c, 15, 5, 1.3, 0.9, '#9a8a6a');
      // нижняя полка: крынки и банка
      R2(c, 2, 11, 15, 1, p.plank);
      R2(c, 4, 9, 2, 2, '#a9c6dd'); D2(c, 4, 9, '#8fb4d1');
      R2(c, 7, 9, 2, 2, '#c2b590'); D2(c, 7, 9, '#8a7d62');
      R2(c, 10, 9, 2, 2, '#a89a7c'); D2(c, 11, 9, '#8a7d62');
      E2(c, 14, 10, 1.1, 0.8, '#8a8276');
      // столешница внизу
      R2(c, 1, 12, 17, 2, p.wood);
      R2(c, 1, 14, 17, 1, p.wood2);
      R2(c, 2, 15, 15, 1, '#3e3830');
    }
  });

  // -------- СУНДУК, 34x26: окованный, с выпуклой крышкой --------
  WS.Spr.def('chest', {
    w: 34, h: 26,
    draw: function (c) {
      var p = WS.Spr.pal;
      // корпус
      R2(c, 1, 6, 14, 6, p.wood3);
      R2(c, 1, 6, 14, 1, '#96795b');
      R2(c, 15, 7, 1, 5, p.wood2);
      // оковка по краям
      R2(c, 1, 6, 2, 6, COL.iron2);
      R2(c, 13, 6, 2, 6, COL.iron2);
      // выпуклая крышка
      E2(c, 8, 5, 7.5, 2.6, p.wood);
      E2(c, 8, 4.6, 6.2, 1.8, '#96795b');
      R2(c, 1, 4, 2, 2, COL.iron2); R2(c, 13, 4, 2, 2, COL.iron2);
      // замок-личинка
      R2(c, 7, 5, 3, 2, p.brass);
      D2(c, 8, 6, COL.brassD);
      R2(c, 1, 12, 15, 1, '#3e3830');
    }
  });

  // -------- МЕШОК, 26x28: завязан, зерно просыпалось --------
  WS.Spr.def('sack', {
    w: 26, h: 28,
    draw: function (c) {
      var p = WS.Spr.pal;
      // тело мешка
      E2(c, 6.5, 9, 5, 4.5, COL.cloth1);
      E2(c, 6.5, 8, 4.2, 3.6, COL.cloth2);
      // складки
      D2(c, 4, 8, COL.cloth3); D2(c, 9, 10, COL.cloth3); D2(c, 7, 12, COL.cloth3);
      // горловина
      R2(c, 5, 2, 3, 3, '#9a8d70');
      R2(c, 5, 4, 3, 1, '#8a7d62');
      // обвязка верёвкой
      R2(c, 4, 4, 5, 1, '#6b5138');
      D2(c, 6, 3, '#8a7d62');
      // просыпанное зерно
      D2(c, 10, 12, COL.grain); D2(c, 11, 13, COL.grain); D2(c, 12, 12, COL.grain2);
      // клеймо
      R2(c, 6, 9, 2, 1, COL.red1);
      R2(c, 2, 13, 10, 1, '#3e3830');
    }
  });

  // -------- ШКАП (гардероб), 40x56 --------
  WS.Spr.def('wardrobe', {
    w: 40, h: 56,
    draw: function (c) {
      var p = WS.Spr.pal;
      // карниз с подзором
      R2(c, 1, 1, 17, 2, p.wood3);
      R2(c, 1, 1, 17, 1, '#96795b');
      D2(c, 4, 0, p.wood3); D2(c, 8, 0, p.wood3); D2(c, 13, 0, p.wood3);
      // корпус
      R2(c, 2, 3, 15, 19, p.wood2);
      R2(c, 2, 3, 1, 19, p.wood);             // светлая грань
      R2(c, 16, 3, 1, 19, '#4c3a27');
      // дверцы
      R2(c, 4, 5, 5, 15, p.wood3); R2(c, 10, 5, 5, 15, p.wood3);
      R2(c, 4, 5, 5, 1, p.plank); R2(c, 10, 5, 5, 1, p.plank);
      R2(c, 9, 4, 1, 17, '#3e2f1f');         // щель между дверц
      D2(c, 8, 12, p.brass); D2(c, 10, 12, p.brass);
      // нижний ящик
      R2(c, 3, 21, 13, 2, p.wood);
      D2(c, 9, 22, p.brass);
      // цоколь
      R2(c, 2, 23, 15, 1, '#3e2f1f');
      R2(c, 3, 24, 13, 1, '#3e3830');
    }
  });

  // -------- КОНТОРСКИЙ СТОЛ, 40x32: надстройка, чернильница, книга --------
  WS.Spr.def('desk', {
    w: 40, h: 32,
    draw: function (c) {
      var p = WS.Spr.pal;
      // надстройка с ящиками (задник)
      R2(c, 2, 1, 15, 4, p.wood2);
      R2(c, 3, 2, 6, 2, p.wood3); D2(c, 6, 3, p.brass);
      R2(c, 10, 2, 6, 2, p.wood3); D2(c, 13, 3, p.brass);
      // столешница
      R2(c, 1, 5, 18, 3, p.plank);
      R2(c, 1, 5, 18, 1, '#96795b');
      R2(c, 1, 7, 18, 1, p.wood);
      // боковины и подзор
      R2(c, 2, 8, 2, 5, p.wood2);
      R2(c, 16, 8, 2, 5, p.wood2);
      R2(c, 4, 9, 12, 1, p.wood2);
      // на столе: чернильница, книга, конверт
      E2(c, 4, 4.5, 0.9, 0.7, COL.iron1); D2(c, 4, 4, p.steel);
      R2(c, 7, 4, 5, 2, COL.red1); R2(c, 7, 4, 5, 1, COL.red2);
      D2(c, 13, 4, '#8fb4d1');
      R2(c, 1, 13, 18, 1, '#3e3830');
    }
  });

  // -------- КНИЖНЫЙ ШКАФ (этажерка), 40x52 --------
  WS.Spr.def('bookshelf', {
    w: 40, h: 52,
    draw: function (c) {
      var p = WS.Spr.pal;
      // корпус
      R2(c, 2, 2, 15, 21, '#4c3a27');
      R2(c, 2, 2, 15, 1, p.wood3);
      R2(c, 2, 2, 1, 21, p.wood2);
      // полки
      R2(c, 3, 7, 13, 1, p.plank);
      R2(c, 3, 12, 13, 1, p.plank);
      R2(c, 3, 17, 13, 1, p.plank);
      R2(c, 3, 22, 13, 1, p.plank);
      // корешки книг — приглушённые тона
      var spines = ['#6f3a34', '#4a5568', '#5f6b55', '#7a5a3a', '#8d584a', '#3f4a5a'];
      var i, j, row;
      for (row = 0; row < 4; row++) {
        var x = 3.5;
        for (i = 0; i < 6; i++) {
          var wUnits = 0.9 + ((row * 7 + i * 3) % 3) * 0.35;
          if (x + wUnits > 15.5) break;
          var hgt = 3.6 + ((i + row) % 2) * 0.4;
          R2(c, x, 3 + row * 5 + (4 - hgt), wUnits, hgt, spines[(i + row * 2) % spines.length]);
          // золочёный обрез
          R2(c, x + wUnits - 0.4, 3 + row * 5 + (4 - hgt), 0.4, hgt, '#c9a44a');
          x += wUnits + 0.3;
        }
        // одна книга завалилась
        if (row === 1) {
          R2(c, 13, 9.6, 3, 0.8, '#3f4a5a');
        }
      }
      R2(c, 3, 23, 13, 1, '#3e3830');
    }
  });

  // -------- ПРИЛАВОК, 52x36: филёнки, весы, кассовый ящик --------
  WS.Spr.def('counter', {
    w: 52, h: 36,
    draw: function (c) {
      var p = WS.Spr.pal;
      // столешница
      R2(c, 1, 5, 23, 3, p.plank);
      R2(c, 1, 5, 23, 1, '#96795b');
      R2(c, 1, 7, 23, 1, p.wood);
      // фасад с филёнками
      R2(c, 1, 8, 23, 5, p.wood2);
      R2(c, 1, 8, 23, 1, p.wood);
      R2(c, 3, 9, 8, 3, p.wood3);
      R2(c, 13, 9, 8, 3, p.wood3);
      R2(c, 1, 12, 23, 1, '#3e2f1f');
      // весы с гирьками
      D2(c, 5, 4, p.brass); D2(c, 6, 3, p.brass);
      R2(c, 4, 4, 4, 1, p.brass);
      E2(c, 12, 4, 1.4, 0.9, '#8a8276');
      D2(c, 18, 4, COL.red1); D2(c, 19, 4, COL.red1);
      // кассовый ящик сзади
      R2(c, 8, 2, 7, 2, p.wood3); D2(c, 11, 3, p.brass);
      R2(c, 1, 13, 23, 1, '#3e3830');
    }
  });

  // -------- КОРЫТО (кадка), 36x26: лёд в воде --------
  WS.Spr.def('tub', {
    w: 36, h: 26,
    draw: function (c) {
      var p = WS.Spr.pal;
      // корыто
      E2(c, 8, 8, 7, 4, p.wood3);
      E2(c, 8, 7.6, 6, 3.2, '#96795b');
      // вода со льдом
      E2(c, 8, 7.6, 4.6, 2.2, p.ice2);
      E2(c, 6.6, 7, 1.6, 0.8, '#c3d8ea');
      // обручи
      R2(c, 2, 6, 1, 3, COL.iron2); R2(c, 13, 6, 1, 3, COL.iron2);
      D2(c, 5, 9, p.wood2); D2(c, 11, 9, p.wood2);
      R2(c, 2, 11, 13, 1, '#3e3830');
      // щепа рядом
      D2(c, 15, 11, p.wood3); D2(c, 16, 12, p.wood2);
    }
  });

  // -------- НАКОВАЛЬНЯ, 30x24: на пне, рядом молот --------
  WS.Spr.def('anvil', {
    w: 30, h: 24,
    draw: function (c) {
      var p = WS.Spr.pal;
      // пень-основание
      R2(c, 4, 9, 7, 3, p.wood2);
      R2(c, 4, 9, 7, 1, p.wood3);
      E2(c, 7.5, 9, 3.4, 1.2, p.wood);
      D2(c, 7, 9, '#3e2f1f'); D2(c, 8, 9, '#3e2f1f');
      // тело наковальни
      R2(c, 3, 6, 9, 3, '#5f636b');
      R2(c, 3, 6, 9, 1, '#767a82');
      R2(c, 4, 4, 7, 2, '#5f636b');
      R2(c, 4, 4, 7, 1, '#8a8f98');
      // рог
      E2(c, 2.6, 5, 1.8, 1.2, '#767a82');
      // блеск металла
      R2(c, 5, 4, 3, 1, '#aab2bc');
      // молот рядом
      R2(c, 11, 8, 3, 1, p.wood3); D2(c, 11, 8, p.steel);
      R2(c, 3, 12, 11, 1, '#3e3830');
    }
  });

  // -------- ВЕРСТАК, 52x34: тиски, рубанок, гвозди --------
  WS.Spr.def('workbench', {
    w: 52, h: 34,
    draw: function (c) {
      var p = WS.Spr.pal;
      // массивная столешница
      R2(c, 1, 4, 23, 4, p.plank);
      R2(c, 1, 4, 23, 1, '#96795b');
      R2(c, 1, 7, 23, 1, p.wood);
      // подверстачье
      R2(c, 1, 8, 23, 2, p.wood2);
      // ножки с перекладиной
      R2(c, 2, 10, 2, 3, p.wood2); R2(c, 21, 10, 2, 3, p.wood2);
      R2(c, 4, 12, 17, 1, p.wood3);
      // тиски на краю
      R2(c, 21, 2, 2, 3, COL.iron2); D2(c, 22, 2, COL.iron3);
      // рубанок
      R2(c, 5, 2, 5, 2, p.wood3); R2(c, 6, 1, 3, 1, '#96795b'); D2(c, 9, 3, p.steel);
      // молоток и гвозди
      R2(c, 12, 3, 3, 1, p.wood3); D2(c, 12, 2, p.steel);
      D2(c, 16, 3, p.steel); D2(c, 17, 3, p.steel); D2(c, 18, 3, p.steel);
      R2(c, 1, 13, 23, 1, '#3e3830');
    }
  });

  // -------- ГОРН, 44x44: каменное чрево, мехи, труба --------
  WS.Spr.def('forge', {
    w: 44, h: 44,
    draw: function (c) {
      var p = WS.Spr.pal;
      // дымоход
      R2(c, 13, 0, 5, 7, '#5f636b');
      R2(c, 13, 0, 5, 1, '#767a82');
      R2(c, 12, 0, 7, 1, p.snow2);
      // каменное чрево
      R2(c, 2, 7, 18, 9, p.stone2);
      R2(c, 2, 7, 18, 1, p.stone);
      R2(c, 3, 9, 4, 3, p.stone); R2(c, 14, 9, 4, 3, p.stone); R2(c, 8, 12, 6, 3, p.stone);
      // топка
      R2(c, 7, 9, 8, 5, '#241a10');
      // остывшие угли
      D2(c, 9, 11, '#4a3524'); D2(c, 11, 12, '#3c2b1d'); D2(c, 12, 10, '#54402b');
      // колосник
      R2(c, 7, 14, 8, 1, COL.iron1);
      // мехи кожаные
      R2(c, 19, 9, 4, 3, p.fur);
      R2(c, 20, 10, 2, 1, p.fur2);
      R2(c, 18, 8, 2, 1, p.wood2);
      // щипцы и заготовка
      R2(c, 4, 17, 6, 1, COL.iron2); D2(c, 10, 17, p.steel);
      // основание
      R2(c, 2, 16, 18, 2, p.wood2);
      R2(c, 2, 18, 18, 1, '#3e3830');
    }
  });

  // -------- ПРЕСТОЛ (алтарь), 44x52: сень, завеса, свечи --------
  WS.Spr.def('altar', {
    w: 44, h: 52,
    draw: function (c) {
      var p = WS.Spr.pal;
      // сень (навес)
      R2(c, 1, 1, 19, 2, p.wood3);
      R2(c, 1, 1, 19, 1, '#96795b');
      D2(c, 2, 0, p.brass); D2(c, 18, 0, p.brass);
      // занавес за престолом
      R2(c, 3, 3, 15, 4, COL.red1);
      R2(c, 3, 3, 15, 1, COL.red2);
      R2(c, 10, 3, 1, 4, COL.red3);
      // вышитый крест на завесе
      D2(c, 6, 4, COL.grain); D2(c, 6, 5, COL.grain);
      D2(c, 5, 4, COL.grain); D2(c, 7, 4, COL.grain);
      // престол, покрытый полотном
      R2(c, 2, 8, 17, 6, '#c9c2b4');
      R2(c, 2, 8, 17, 1, '#d8d3c6');
      R2(c, 2, 13, 17, 1, '#a8a294');
      // антиминс и Евангелие
      R2(c, 6, 9, 5, 3, '#8d584a');
      R2(c, 7, 10, 3, 1, COL.grain);
      R2(c, 12, 9, 4, 3, COL.red1); D2(c, 14, 10, p.brass);
      // передняя доска
      R2(c, 3, 12, 15, 2, p.wood2);
      R2(c, 3, 14, 15, 1, '#3e2f1f');
      // свечи по углам
      R2(c, 3, 5, 1, 3, COL.wax); D2(c, 3, 4, p.ember2);
      R2(c, 17, 5, 1, 3, COL.wax); D2(c, 17, 4, p.ember2);
      // подножие
      R2(c, 2, 16, 17, 2, COL.cloth1);
      R2(c, 2, 18, 17, 1, '#3e3830');
      R2(c, 4, 20, 13, 1, '#3e3830');
    }
  });

  // -------- САМОВАР, 36x36: латунь, конфорка, кран --------
  WS.Spr.def('samovar', {
    w: 36, h: 36,
    draw: function (c) {
      var p = WS.Spr.pal;
      // конфорка-трубка
      R2(c, 8, 1, 2, 4, COL.brassD);
      R2(c, 8, 1, 2, 1, '#6b5118');
      // крышка
      E2(c, 9, 5, 3, 1.2, '#a8842f');
      // тулово
      E2(c, 9, 9, 4.4, 4.6, p.brass);
      E2(c, 9, 8.4, 3.4, 3.4, COL.brassL);
      // блик
      E2(c, 7.6, 7.6, 1.2, 1.8, COL.brassHi);
      // ручки-ветки
      R2(c, 4, 8, 1, 2, COL.brassD); R2(c, 13, 8, 1, 2, COL.brassD);
      // кран
      R2(c, 4, 11, 1, 2, COL.brassD); D2(c, 4, 13, '#6b5118');
      // поддон
      E2(c, 9, 14, 3.4, 1.6, '#a8842f');
      // лапки
      R2(c, 6, 15, 1, 1, COL.brassD); R2(c, 11, 15, 1, 1, COL.brassD);
      // тень
      E2(c, 9, 16.4, 4, 1.4, 'rgba(8,12,22,0.4)');
    }
  });

  // -------- КРАСНЫЙ УГОЛ (божница), 34x44: иконы, лампадка, рушник --------
  WS.Spr.def('icon_corner', {
    w: 34, h: 44,
    draw: function (c) {
      var p = WS.Spr.pal;
      // божница-полка
      R2(c, 1, 9, 14, 2, p.wood3);
      R2(c, 1, 9, 14, 1, '#96795b');
      // иконы в окладах
      R2(c, 3, 3, 4, 6, '#8a8f98');
      R2(c, 4, 4, 2, 4, COL.glass1);
      D2(c, 4, 4, COL.grain); D2(c, 5, 6, COL.grain);
      R2(c, 9, 2, 4, 7, '#8a8f98');
      R2(c, 10, 3, 2, 5, COL.glass1);
      D2(c, 11, 4, COL.grain); D2(c, 11, 6, COL.grain);
      // лампадка с огоньком
      R2(c, 13, 10, 1, 2, COL.brassD);
      E2(c, 13.5, 12, 0.8, 0.6, p.ember);
      D2(c, 13, 11, p.ember2);
      // рушник с вышивкой
      R2(c, 1, 11, 4, 3, '#c9c2b4');
      D2(c, 2, 12, COL.red1); D2(c, 3, 13, COL.red1);
      R2(c, 1, 17, 14, 1, '#3e3830');
    }
  });

  // -------- ТКАЦКИЙ СТАН, 52x48: основа, полотно в клетку, челнок --------
  WS.Spr.def('loom', {
    w: 52, h: 48,
    draw: function (c) {
      var p = WS.Spr.pal;
      // стойки
      R2(c, 2, 3, 2, 16, p.wood2);
      R2(c, 21, 3, 2, 16, p.wood2);
      // поперечина наверху
      R2(c, 2, 1, 21, 2, p.wood3);
      R2(c, 2, 1, 21, 1, '#96795b');
      // навой с нитями основы
      R2(c, 3, 3, 19, 2, p.wood);
      var i;
      for (i = 0; i < 8; i++) R2(c, 4 + i * 2, 5, 1, 8, COL.cloth2);
      // полотно
      R2(c, 4, 11, 17, 5, COL.cloth1);
      R2(c, 4, 11, 17, 1, COL.cloth2);
      for (i = 0; i < 5; i++) R2(c, 5 + i * 3, 13, 1, 2, COL.cloth3);
      R2(c, 4, 14, 17, 1, COL.cloth3);
      // челнок на полотне
      R2(c, 9, 12, 4, 1, '#54402b'); D2(c, 9, 12, p.wood3);
      // подножки-педали
      R2(c, 5, 18, 4, 1, p.wood2); R2(c, 15, 18, 4, 1, p.wood2);
      R2(c, 2, 20, 21, 1, '#3e3830');
    }
  });

  // -------- ЛЮЛЬКА ПОДВЕСНАЯ, 34x34: очеп, верёвки, одеяльце --------
  WS.Spr.def('cradle', {
    w: 34, h: 34,
    draw: function (c) {
      var p = WS.Spr.pal;
      // очеп-стойка
      R2(c, 14, 1, 1, 7, p.wood2);
      // коромысло
      R2(c, 4, 8, 11, 1, p.wood3);
      // верёвочки
      R2(c, 5, 9, 1, 2, '#6b5138'); R2(c, 13, 9, 1, 2, '#6b5138');
      // люлька-лодочка
      R2(c, 3, 11, 13, 3, COL.cloth1);
      R2(c, 3, 11, 13, 1, COL.cloth2);
      R2(c, 3, 13, 13, 1, COL.cloth3);
      R2(c, 4, 14, 11, 1, p.wood2);
      // одеяльце и подушечка
      R2(c, 4, 11, 5, 2, COL.red1);
      R2(c, 9, 11, 6, 2, COL.cloth3);
      // подставка
      R2(c, 2, 15, 15, 1, p.wood3);
      R2(c, 3, 16, 13, 1, '#3e3830');
    }
  });

  // -------- ЗЕРКАЛО В РАМЕ, 24x40 --------
  WS.Spr.def('mirror', {
    w: 24, h: 40,
    draw: function (c) {
      var p = WS.Spr.pal;
      // рама
      R2(c, 2, 1, 7, 14, p.wood3);
      R2(c, 2, 1, 7, 1, '#96795b');
      // стекло
      R2(c, 3, 2, 5, 12, '#2c425e');
      R2(c, 3, 2, 5, 6, '#3d5474');
      // блики
      R2(c, 4, 3, 1, 8, '#8fb4d1');
      D2(c, 6, 5, '#a9c6dd'); D2(c, 5, 9, '#a9c6dd');
      // подставка
      R2(c, 3, 15, 5, 1, p.wood2);
      R2(c, 4, 16, 3, 1, '#3e3830');
      R2(c, 2, 17, 8, 1, '#3e3830');
    }
  });

  // -------- БУРЖУЙКА (печурка), 30x36: труба, дверца с отсветом углей --------
  WS.Spr.def('stove_iron', {
    w: 30, h: 36,
    draw: function (c) {
      var p = WS.Spr.pal;
      // труба
      R2(c, 6, 0, 2, 6, COL.iron1);
      R2(c, 5, 0, 4, 1, COL.iron2);
      // корпус-бочонок
      R2(c, 3, 6, 9, 8, '#4c5058');
      R2(c, 3, 6, 9, 1, '#5f636b');
      R2(c, 3, 6, 1, 8, COL.iron2);
      R2(c, 11, 7, 1, 7, COL.iron1);
      // дверца
      R2(c, 5, 9, 5, 4, '#31353c');
      D2(c, 7, 11, p.ember);                 // отсвет углей
      D2(c, 6, 10, '#4a3524');
      // ножки
      R2(c, 4, 14, 1, 2, COL.iron1); R2(c, 10, 14, 1, 2, COL.iron1);
      // щепки рядом
      D2(c, 12, 15, p.wood3); D2(c, 13, 16, p.wood2);
      R2(c, 3, 16, 9, 1, '#3e3830');
    }
  });

  // -------- ВОРОХ СЕНА, 40x30: вилы воткнуты --------
  WS.Spr.def('hay_pile', {
    w: 40, h: 30,
    draw: function (c) {
      var p = WS.Spr.pal;
      E2(c, 9, 9, 8, 4, COL.cloth1);
      E2(c, 9, 8, 6, 3, COL.cloth2);
      E2(c, 11, 5.6, 3.4, 2.2, COL.cloth1);
      var i;
      for (i = 0; i < 7; i++) R2(c, 3 + i * 2, 7 + (i % 3), 1, 4, COL.cloth3);
      for (i = 0; i < 4; i++) R2(c, 6 + i * 2, 4 + (i % 2), 1, 2, '#c2b590');
      // вилы
      R2(c, 15, 1, 1, 5, p.wood3);
      D2(c, 15, 1, p.wood2);
      R2(c, 14, 6, 3, 1, p.steel);
      D2(c, 14, 5, p.steel); D2(c, 16, 5, p.steel);
      // просыпанное зерно
      D2(c, 4, 13, COL.grain); D2(c, 15, 13, COL.grain);
      R2(c, 2, 13, 16, 1, '#3e3830');
    }
  });

  // -------- ПОЛЕННИЦА ДОМАШНЯЯ, 40x28: стойки и два ряда чурок --------
  WS.Spr.def('wood_pile', {
    w: 40, h: 28,
    draw: function (c) {
      var p = WS.Spr.pal;
      // стойки-козлы
      R2(c, 1, 5, 1, 7, p.wood2);
      R2(c, 17, 5, 1, 7, p.wood2);
      // нижний ряд чурок
      E2(c, 4, 9, 1.5, 1.5, p.wood3); D2(c, 4, 9, p.wood2);
      E2(c, 7, 9, 1.5, 1.5, p.wood3); D2(c, 7, 9, p.wood2);
      E2(c, 10, 9, 1.5, 1.5, p.wood3); D2(c, 10, 9, p.wood2);
      E2(c, 13, 9, 1.5, 1.5, p.wood3); D2(c, 13, 9, p.wood2);
      // верхний ряд
      E2(c, 5, 6, 1.5, 1.5, p.wood); D2(c, 5, 6, p.wood3);
      E2(c, 8, 6, 1.5, 1.5, p.wood); D2(c, 8, 6, p.wood3);
      E2(c, 11, 6, 1.5, 1.5, p.wood); D2(c, 11, 6, p.wood3);
      // пара чурок сверху
      E2(c, 7, 3.4, 1.4, 1.4, p.wood3); D2(c, 7, 3.4, p.wood2);
      E2(c, 10, 3.4, 1.4, 1.4, p.wood3); D2(c, 10, 3.4, p.wood2);
      R2(c, 2, 11, 16, 1, '#3e3830');
    }
  });

  // -------- ГРОБ, 44x28: крышка с крестом, опилки --------
  WS.Spr.def('coffin', {
    w: 44, h: 28,
    draw: function (c) {
      var p = WS.Spr.pal;
      // крышка (шестигранник)
      R2(c, 4, 5, 14, 5, '#4c3a27');
      R2(c, 6, 4, 10, 1, '#4c3a27');
      R2(c, 14, 6, 4, 3, '#3e2f1f');
      R2(c, 4, 5, 14, 1, '#5c4730');
      // крест на крышке
      R2(c, 10, 6, 1, 3, p.brass);
      R2(c, 9, 7, 3, 1, p.brass);
      // оковка углов
      R2(c, 4, 5, 1, 5, COL.iron2); R2(c, 17, 5, 1, 5, COL.iron2);
      // подставка
      R2(c, 6, 10, 11, 1, '#3e2f1f');
      R2(c, 5, 11, 13, 1, '#3e3830');
      // опилки и щепки
      D2(c, 2, 12, p.wood3); D2(c, 19, 12, p.wood2);
    }
  });

  // -------- ПОДСВЕЧНИК-СТОЛИК, 26x34: три свечи с огоньками --------
  WS.Spr.def('candle_table', {
    w: 26, h: 34,
    draw: function (c) {
      var p = WS.Spr.pal;
      // столешница
      R2(c, 2, 8, 9, 3, p.plank);
      R2(c, 2, 8, 9, 1, '#96795b');
      R2(c, 3, 7, 7, 1, p.plank);
      // тренога
      R2(c, 3, 11, 1, 3, p.wood2);
      R2(c, 9, 11, 1, 3, p.wood2);
      // свечи
      R2(c, 4, 3, 1, 5, COL.wax);
      R2(c, 8, 4, 1, 4, COL.wax2);
      R2(c, 6, 5, 1, 3, COL.wax);
      // огоньки
      D2(c, 4, 2, p.ember2); D2(c, 8, 3, p.ember2); D2(c, 6, 4, p.ember2);
      D2(c, 4, 3, p.ember); D2(c, 8, 4, p.ember);
      // подтёки воска
      D2(c, 5, 8, '#c9c2b4'); D2(c, 9, 8, '#c9c2b4');
      R2(c, 2, 14, 9, 1, '#3e3830');
    }
  });

  // -------- ДВЕРЬ ЗАКРЫТАЯ, 32x52: косяк, полотно, ручка-скоба --------
  WS.Spr.def('door_obj', {
    w: 32, h: 52,
    draw: function (c) {
      var p = WS.Spr.pal;
      // косяк
      R2(c, 1, 2, 1, 22, '#4c3a27');
      R2(c, 13, 2, 1, 22, '#4c3a27');
      R2(c, 1, 1, 13, 1, '#5c4730');
      // полотно
      R2(c, 2, 3, 11, 20, '#54402b');
      R2(c, 2, 3, 11, 1, '#6b5138');
      R2(c, 12, 4, 1, 19, '#3e2f1f');
      // доски
      R2(c, 5, 3, 1, 20, '#3e2f1f');
      R2(c, 9, 3, 1, 20, '#3e2f1f');
      // филёнки
      R2(c, 3, 5, 9, 4, '#5c4730');
      R2(c, 3, 11, 9, 4, '#5c4730');
      R2(c, 3, 17, 9, 4, '#5c4730');
      R2(c, 3, 5, 9, 1, '#6b5138');
      R2(c, 3, 11, 9, 1, '#6b5138');
      // петли
      R2(c, 1, 6, 2, 1, COL.iron2); R2(c, 1, 16, 2, 1, COL.iron2);
      // ручка-скоба
      R2(c, 11, 12, 1, 3, COL.brassD);
      D2(c, 11, 13, p.brass);
      D2(c, 11, 15, '#6b5118');
      // снег у порога
      R2(c, 2, 24, 11, 1, p.snow2);
      R2(c, 3, 25, 8, 1, p.snow1);
    }
  });

  // -------- ДВЕРЬ ОТКРЫТАЯ, 48x52: полотно откинуто, тёмный проём --------
  WS.Spr.def('door_open', {
    w: 48, h: 52,
    draw: function (c) {
      var p = WS.Spr.pal;
      // косяк слева
      R2(c, 2, 2, 1, 22, '#4c3a27');
      R2(c, 2, 1, 3, 1, '#5c4730');
      // полотно, откинутое к стене (вид с торца)
      R2(c, 5, 2, 3, 22, '#54402b');
      R2(c, 5, 2, 3, 1, '#6b5138');
      R2(c, 7, 3, 1, 21, '#3e2f1f');
      R2(c, 6, 3, 1, 20, '#5c4730');
      // ручка
      D2(c, 5, 13, p.brass);
      // тёмный сквозняк в проёме
      R2(c, 10, 8, 8, 14, 'rgba(14,12,10,0.25)');
      // заметённый порог
      R2(c, 3, 24, 16, 1, p.snow2);
      R2(c, 4, 25, 12, 1, p.snow1);
    }
  });

  // ==================================================================
  //  УТИЛИТЫ РАЗМЕЩЕНИЯ МЕБЕЛИ
  //  Правила: только на полах (не стены/окна), не на дверях и не рядом
  //  (чтобы не запирать входы), не поверх чужих объектов, у стен — приоритет.
  //  Твёрдая мебель не должна запирать комнаты: проверка достижимости.
  // ==================================================================

  var T_FLOORS = null;   // заполняется лениво (WS.World.T может быть ещё пуст)

  function tileEnum() {
    if (!T_FLOORS && WS.World && WS.World.T) {
      var T = WS.World.T;
      T_FLOORS = {};
      T_FLOORS[T.FLOOR_WOOD] = 1;
      T_FLOORS[T.FLOOR_TILE] = 1;
      T_FLOORS[T.FLOOR_CONCRETE] = 1;
      T_FLOORS[T.FLOOR_DIRT] = 1;
    }
    return T_FLOORS;
  }

  /** Пол ли это? rubble=true — допускать золу/снег погорелища. */
  function isFloorT(t, rubble) {
    var T = WS.World.T;
    if (tileEnum() && tileEnum()[t]) return true;
    if (rubble && (t === T.MUD || t === T.SNOW)) return true;
    return false;
  }

  /** Тайл комнаты у стены (для шкафов, буфетов, кроватей изголовьем). */
  function nearWall(room, x, y) {
    var W = WS.World, T = W.T;
    function isWall(xx, yy) {
      var t = W.tileAt(xx, yy);
      return t === T.WALL_WOOD || t === T.WALL_BRICK ||
             t === T.WALL_STONE || t === T.WALL_LOG || t === T.WINDOW;
    }
    if (x === room.x && isWall(x - 1, y)) return true;
    if (x === room.x + room.w - 1 && isWall(x + 1, y)) return true;
    if (y === room.y && isWall(x, y - 1)) return true;
    if (y === room.y + room.h - 1 && isWall(x, y + 1)) return true;
    return false;
  }

  /** Есть ли рядом (4-стороны) проход — дверь или проём перегородки. */
  function passNear(x, y) {
    var W = WS.World, T = W.T;
    var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (var d = 0; d < 4; d++) {
      var t = W.tileAt(x + dirs[d][0], y + dirs[d][1]);
      if (t === T.DOORWAY || t === T.DOOR) return true;
    }
    return false;
  }

  /**
   * Останется ли комната проходимой, если поставить твёрдый предмет на (x,y)?
   * BFS от тайла у прохода; все свободные тайлы комнаты должны быть достижимы.
   */
  function connectedAfter(room, ctx, x, y) {
    var free = [];
    var xx, yy, key, i;
    for (yy = room.y; yy < room.y + room.h; yy++) {
      for (xx = room.x; xx < room.x + room.w; xx++) {
        key = xx + ',' + yy;
        if (xx === x && yy === y) continue;
        if (ctx.occ[key] === 1) continue;          // занято твёрдым
        free.push(key);
      }
    }
    if (!free.length) return false;
    // якорь — свободный тайл, соседний с проходом
    var anchor = null;
    for (i = 0; i < free.length && !anchor; i++) {
      var pr0 = free[i].split(',');
      if (passNear(+pr0[0], +pr0[1])) anchor = free[i];
    }
    if (!anchor) anchor = free[0];
    // BFS по свободным тайлам комнаты
    var seen = {};
    seen[anchor] = 1;
    var queue = [anchor];
    var reach = 1;
    var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    while (queue.length) {
      var cur = queue.shift();
      var pr = cur.split(',');
      var cx = +pr[0], cy = +pr[1];
      for (var d = 0; d < 4; d++) {
        var nx = cx + dirs[d][0], ny = cy + dirs[d][1];
        if (nx < room.x || nx >= room.x + room.w || ny < room.y || ny >= room.y + room.h) continue;
        var nk = nx + ',' + ny;
        if (seen[nk]) continue;
        if (ctx.occ[nk] === 1) continue;
        if (nx === x && ny === y) continue;
        seen[nk] = 1;
        reach++;
        queue.push(nk);
      }
    }
    return reach === free.length;
  }

  function res(ctx, x, y) { ctx.reserved[x + ',' + y] = 1; }

  /** Зарезервировать тайл и его соседей внутри коробки здания. */
  function reserveAround(ctx, x, y) {
    var b = ctx.b;
    res(ctx, x, y);
    var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (var d = 0; d < 4; d++) {
      var nx = x + dirs[d][0], ny = y + dirs[d][1];
      if (nx > b.x && nx < b.x + b.w - 1 && ny > b.y && ny < b.y + b.h - 1) {
        res(ctx, nx, ny);
      }
    }
  }

  /**
   * Контекст расстановки: occ (занятые тайлы: 1 твёрдое, 2 лёгкое),
   * reserved (двери, проходы и подходы к ним), spent (бюджет комнаты).
   */
  function mkCtx(b) {
    var ctx = { b: b, occ: {}, reserved: {}, spent: {} };
    var W = WS.World, T = W.T;
    var i, xx, yy;
    // двери: сам тайл и соседние внутренние тайлы
    for (i = 0; i < b.door.length; i++) {
      reserveAround(ctx, b.door[i].x, b.door[i].y);
    }
    // проёмы перегородок (в т.ч. созданные ensurePartitions)
    for (yy = b.y; yy < b.y + b.h; yy++) {
      for (xx = b.x; xx < b.x + b.w; xx++) {
        if (W.tileAt(xx, yy) === T.DOORWAY) reserveAround(ctx, xx, yy);
      }
    }
    return ctx;
  }

  /** Можно ли ставить предмет на тайл (внутри комнаты, пол, не занят). */
  function usable(b, room, ctx, x, y, opts) {
    if (!room) return false;
    if (x < room.x || x >= room.x + room.w) return false;
    if (y < room.y || y >= room.y + room.h) return false;
    var key = x + ',' + y;
    if (ctx.reserved[key]) return false;
    if (ctx.occ[key]) return false;
    var t = WS.World.tileAt(x, y);
    if (!isFloorT(t, opts && opts.rubble)) return false;
    var obs = WS.World.objsAt(x, y);
    for (var i = 0; i < obs.length; i++) {
      if (obs[i].solid) return false;
    }
    return true;
  }

  function solidOpts(opts) { return !opts || opts.solid !== false; }

  /** Бюджет комнаты: не загромождать всю площадь. */
  function budgetLeft(room, ctx) {
    var k = room.x + ',' + room.y;
    var cap = Math.max(2, Math.floor(room.w * room.h * 0.5));
    return cap - (ctx.spent[k] || 0);
  }

  /** Установить предмет в конкретный тайл (без проверок места сверх usable). */
  function placeAt(b, room, ctx, x, y, opts) {
    if (budgetLeft(room, ctx) <= 0 && !opts.force) return null;
    var o = {
      x: x + 0.5, y: y + 0.5,
      sprName: opts.spr,
      solid: opts.solid !== false,
      name: opts.name || 'Мебель'
    };
    if (opts.container) o.container = opts.container;
    if (opts.heat) { o.heat = true; o.fire = false; }   // тепло есть, огня нет
    if (opts.sprFrame !== undefined) o.sprFrame = opts.sprFrame;
    if (opts.shadow === false) o.shadow = false;
    WS.World.addObject(o);
    ctx.occ[x + ',' + y] = opts.solid === false ? 2 : 1;
    var k = room.x + ',' + room.y;
    ctx.spent[k] = (ctx.spent[k] || 0) + 1;
    return o;
  }

  /** Установить предмет в конкретный тайл с проверками (null при неудаче). */
  function putAt(b, room, ctx, x, y, opts) {
    if (!opts || !opts.spr) return null;
    if (!usable(b, room, ctx, x, y, opts)) return null;
    if (solidOpts(opts) && !opts.force && !connectedAfter(room, ctx, x, y)) return null;
    return placeAt(b, room, ctx, x, y, opts);
  }

  /** Найти место и поставить (n раз). wall=true — только у стены. */
  function put(b, room, ctx, R, opts) {
    if (!opts || !opts.spr) return null;
    if (opts.chance !== undefined && !R.chance(opts.chance)) return null;
    var n = opts.n || 1;
    var last = null;
    for (var i = 0; i < n; i++) {
      var p = pickSpot(b, room, ctx, R, opts);
      if (!p) break;
      last = placeAt(b, room, ctx, p.x, p.y, opts);
    }
    return last;
  }

  /** Перебор кандидатов: сначала у стен (если просили), затем любые. */
  function pickSpot(b, room, ctx, R, opts) {
    var cands = [];
    var x, y, i;
    for (y = room.y; y < room.y + room.h; y++) {
      for (x = room.x; x < room.x + room.w; x++) {
        if (!usable(b, room, ctx, x, y, opts)) continue;
        cands.push({ x: x, y: y, wall: nearWall(room, x, y) });
      }
    }
    var filtered = cands;
    if (opts.wall) {
      filtered = [];
      for (i = 0; i < cands.length; i++) if (cands[i].wall) filtered.push(cands[i]);
      if (!filtered.length) filtered = cands;   // маленькая комната — любое место
    }
    if (!filtered.length) return null;
    R.shuffle(filtered);
    for (i = 0; i < filtered.length; i++) {
      var p = filtered[i];
      if (solidOpts(opts) && !connectedAfter(room, ctx, p.x, p.y)) continue;
      return p;
    }
    return null;
  }

  /** Найти комнату здания, содержащую точку. */
  function roomAt(b, x, y) {
    for (var i = 0; i < b.rooms.length; i++) {
      var r = b.rooms[i];
      if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return r;
    }
    return null;
  }

  // ==================================================================
  //  ДВЕРИ: объект на каждом b.door. Основа-тайл становится проёмом,
  //  закрытое состояние несёт объект (solid), открытие — tryDoor().
  // ==================================================================

  function doorName(b) {
    if (b.type === 'barn' || b.type === 'stable') return 'Ворота';
    if (b.type === 'ruined') return 'Притворённая дверь';
    if (b.type === 'church') return 'Дверь храма';
    return 'Дверь';
  }

  function addDoors(b, R) {
    var W = WS.World, T = W.T;
    for (var i = 0; i < b.door.length; i++) {
      var d = b.door[i];
      // тёмный проём в стене — вид двери несёт объект
      if (W.tileAt(d.x, d.y) === T.DOOR) W.setTile(d.x, d.y, T.DOORWAY);
      W.addObject({
        x: d.x + 0.5, y: d.y + 0.5,
        sprName: 'door_obj',
        solid: true,
        name: doorName(b),
        door: {
          open: false,
          // в погорелище не запирают, в казённых домах — чаще
          locked: b.type === 'ruined' ? false :
                  (b.type === 'jail' || b.type === 'warehouse' ? R.chance(0.4) : R.chance(0.25))
        }
      });
    }
  }

  /**
   * Открыть/закрыть дверь. Запертая не поддаётся (нужен лом — система
   * действий). Возвращает true, если состояние изменилось.
   */
  function tryDoor(o, silent) {
    if (!o || !o.door) return false;
    var d = o.door;
    if (d.open) {
      d.open = false;
      o.sprName = 'door_obj';
      o.solid = true;
      if (!silent) doorSnd(o, 'door');
      return true;
    }
    if (d.locked) {
      if (!silent) {
        if (WS.Snd && WS.Snd.play) WS.Snd.play('door_locked', { x: o.x, y: o.y, vol: 0.8 });
        if (WS.Fx && WS.Fx.text) WS.Fx.text('Заперто', o.x, o.y - 0.6, { col: '#d8a05a' });
      }
      return false;
    }
    d.open = true;
    o.sprName = 'door_open';
    o.solid = false;
    if (!silent) doorSnd(o, 'door');
    return true;
  }

  function doorSnd(o, name) {
    if (WS.Snd && WS.Snd.play) WS.Snd.play(name, { x: o.x, y: o.y, vol: 0.8 });
    // скрип двери слышен издалека
    try { WS.Ev.emit('noise', { x: o.x, y: o.y, r: 10 }); } catch (e) { WS.err('noise', e); }
  }

  /** Псевдоним для системы действий: всегда «толкнуть» дверь. */
  function toggleDoor(o) { return tryDoor(o, false); }

  // ==================================================================
  //  ВНУТРЕННИЕ ПЕРЕГОРОДКИ
  //  gen_town уже ставит стены между большинством комнат; здесь мы
  //  достраиваем WALL_WOOD по границам смежных комнат БЕЗ стены, оставляя
  //  проём. Существующие стены/двери/окна не трогаем.
  // ==================================================================

  function rectsOverlap(A, B) {
    return A.x < B.x + B.w && B.x < A.x + A.w &&
           A.y < B.y + B.h && B.y < A.y + A.h;
  }

  /** Горизонтальная смежность: {wx, y0, y1} или null. */
  function adjH(A, B) {
    var L = A.x <= B.x ? A : B;
    var Rr = A.x <= B.x ? B : A;
    var d = Rr.x - (L.x + L.w);
    if (d !== 0 && d !== 1) return null;      // не соседи по горизонтали
    var y0 = Math.max(L.y, Rr.y);
    var y1 = Math.min(L.y + L.h, Rr.y + Rr.h) - 1;
    if (y1 - y0 < 1) return null;              // перекрытие меньше 2 тайлов
    var wx = d === 1 ? L.x + L.w : (L.w >= Rr.w ? L.x + L.w - 1 : Rr.x);
    return { wx: wx, y0: y0, y1: y1 };
  }

  /** Вертикальная смежность: {wy, x0, x1} или null. */
  function adjV(A, B) {
    var Tp = A.y <= B.y ? A : B;
    var Bt = A.y <= B.y ? B : A;
    var d = Bt.y - (Tp.y + Tp.h);
    if (d !== 0 && d !== 1) return null;
    var x0 = Math.max(Tp.x, Bt.x);
    var x1 = Math.min(Tp.x + Tp.w, Bt.x + Bt.w) - 1;
    if (x1 - x0 < 1) return null;
    var wy = d === 1 ? Tp.y + Tp.h : (Tp.h >= Bt.h ? Tp.y + Tp.h - 1 : Bt.y);
    return { wy: wy, x0: x0, x1: x1 };
  }

  /** Колонна стены между комнатами; leaveY — тайл под проём. */
  function wallColumn(b, wx, y0, y1, R) {
    var W = WS.World, T = W.T;
    if (wx <= b.x || wx >= b.x + b.w - 1) return;   // не внешняя стена
    var floors = [];
    var hasGap = false;
    var y;
    for (y = y0; y <= y1; y++) {
      var t = W.tileAt(wx, y);
      if (t === T.DOORWAY || t === T.DOOR) hasGap = true;
      if (isFloorT(t)) floors.push(y);
    }
    if (!floors.length) return;             // уже глухая стена
    var leave = hasGap ? -1 : floors[Math.floor(floors.length / 2)];
    for (var k = 0; k < floors.length; k++) {
      if (floors[k] === leave) {
        W.setTile(wx, floors[k], T.DOORWAY);
        continue;
      }
      var obs = W.objsAt(wx, floors[k]);
      var blocked = false;
      for (var q = 0; q < obs.length; q++) if (obs[q].solid) blocked = true;
      if (!blocked) W.setTile(wx, floors[k], T.WALL_WOOD);
    }
  }

  /** Ряд стены между комнатами; leaveX — тайл под проём. */
  function wallRow(b, wy, x0, x1, R) {
    var W = WS.World, T = W.T;
    if (wy <= b.y || wy >= b.y + b.h - 1) return;
    var floors = [];
    var hasGap = false;
    var x;
    for (x = x0; x <= x1; x++) {
      var t = W.tileAt(x, wy);
      if (t === T.DOORWAY || t === T.DOOR) hasGap = true;
      if (isFloorT(t)) floors.push(x);
    }
    if (!floors.length) return;
    var leave = hasGap ? -1 : floors[Math.floor(floors.length / 2)];
    for (var k = 0; k < floors.length; k++) {
      if (floors[k] === leave) {
        W.setTile(floors[k], wy, T.DOORWAY);
        continue;
      }
      var obs = W.objsAt(floors[k], wy);
      var blocked = false;
      for (var q = 0; q < obs.length; q++) if (obs[q].solid) blocked = true;
      if (!blocked) W.setTile(floors[k], wy, T.WALL_WOOD);
    }
  }

  /** Достроить перегородки между смежными комнатами без стены. */
  function ensurePartitions(b, R) {
    if (!b.rooms || b.rooms.length < 2) return;
    for (var i = 0; i < b.rooms.length; i++) {
      for (var j = i + 1; j < b.rooms.length; j++) {
        var A = b.rooms[i], B = b.rooms[j];
        if (rectsOverlap(A, B)) continue;    // вложенные зоны (кабинет в гостиной)
        var h = adjH(A, B);
        if (h) { wallColumn(b, h.wx, h.y0, h.y1, R); continue; }
        var v = adjV(A, B);
        if (v) wallRow(b, v.wy, v.x0, v.x1, R);
      }
    }
  }

  // ==================================================================
  //  НАПОЛНЕНИЕ ЗДАНИЙ ПО РОЛЯМ КОМНАТ
  // ==================================================================

  // ---------------- кухня: печь обязательна ----------------
  function fillKitchen(b, room, ctx, R) {
    // печь — на подсказанном генератором месте (угловом), иначе у стены
    var st = (b.stove && usable(b, room, ctx, b.stove.x, b.stove.y, null)) ? b.stove : null;
    if (st) {
      putAt(b, room, ctx, st.x, st.y, {
        spr: 'pech', name: 'Печь', container: 'kitchen_pech', heat: true
      });
    } else {
      put(b, room, ctx, R, {
        spr: 'pech', name: 'Печь', container: 'kitchen_pech', heat: true, wall: true
      });
    }
    put(b, room, ctx, R, { spr: 'table_wood', name: 'Стол', container: 'kitchen_table' });
    put(b, room, ctx, R, { spr: 'bench', name: 'Лавка', n: R.int(1, 2) });
    put(b, room, ctx, R, { spr: 'cupboard', name: 'Буфет', container: 'kitchen_cupboard', wall: true, chance: 0.75 });
    put(b, room, ctx, R, { spr: 'shelf', name: 'Полка', container: 'kitchen_shelf', wall: true, chance: 0.6 });
    put(b, room, ctx, R, { spr: 'samovar', name: 'Самовар', solid: false, chance: 0.4 });
  }

  // ---------------- спальня ----------------
  function fillBedroom(b, room, ctx, R) {
    var rich = b.type === 'izba_rich' || b.type === 'dacha';
    put(b, room, ctx, R, {
      spr: rich ? 'bed_fancy' : 'bed_wood',
      name: 'Кровать',
      container: 'bedroom_bed',
      wall: true,
      n: room.w >= 4 ? 2 : 1
    });
    put(b, room, ctx, R, {
      spr: 'chest', name: 'Сундук',
      container: b.type === 'dacha' ? 'dacha_chest' : 'bedroom_chest',
      wall: true, chance: 0.9
    });
    put(b, room, ctx, R, {
      spr: 'wardrobe', name: 'Шкап', container: 'bedroom_wardrobe',
      wall: true, chance: room.w >= 3 ? 0.8 : 0.35
    });
    put(b, room, ctx, R, { spr: 'cradle', name: 'Люлька', chance: 0.3 });
    iconCorner(b, room, ctx, R, 0.55);
    if (rich) put(b, room, ctx, R, { spr: 'mirror', name: 'Зеркало', wall: true, chance: 0.5 });
  }

  // ---------------- горница (гостиная) ----------------
  function fillLiving(b, room, ctx, R) {
    put(b, room, ctx, R, { spr: 'table_wood', name: 'Стол' });
    put(b, room, ctx, R, { spr: 'bench', name: 'Лавка', n: R.int(1, 2) });
    put(b, room, ctx, R, { spr: 'cupboard', name: 'Буфет', container: 'living_shelf', wall: true, chance: 0.7 });
    put(b, room, ctx, R, { spr: 'shelf', name: 'Полка', container: 'living_shelf', wall: true, chance: 0.5 });
    put(b, room, ctx, R, { spr: 'crate', name: 'Ящик', container: 'living_crate', wall: true, chance: 0.5 });
    if (b.rich || b.type === 'dacha') {
      put(b, room, ctx, R, { spr: 'bed_fancy', name: 'Тахта', container: 'living_sofa', wall: true, chance: 0.6 });
    }
    put(b, room, ctx, R, { spr: 'samovar', name: 'Самовар', solid: false, chance: 0.5 });
    iconCorner(b, room, ctx, R, 0.6);
    // ткацкий стан — в простых избах
    put(b, room, ctx, R, { spr: 'loom', name: 'Ткацкий стан', wall: true, chance: b.type === 'izba' ? 0.3 : 0.15 });
    if (b.rich) {
      put(b, room, ctx, R, { spr: 'mirror', name: 'Зеркало', wall: true, chance: 0.5 });
      put(b, room, ctx, R, { spr: 'bookshelf', name: 'Книжный шкап', container: 'living_shelf', wall: true, chance: 0.4 });
    }
  }

  // ---------------- красный угол ----------------
  function iconCorner(b, room, ctx, R, chance) {
    if (!R.chance(chance)) return null;
    // по традиции — восточный угол горницы
    var x = room.x + room.w - 1, y = room.y;
    if (usable(b, room, ctx, x, y, null)) {
      return placeAt(b, room, ctx, x, y, { spr: 'icon_corner', name: 'Красный угол', solid: false });
    }
    return put(b, room, ctx, R, { spr: 'icon_corner', name: 'Красный угол', solid: false, wall: true });
  }

  // ---------------- сени/зал — зависит от типа здания ----------------
  function fillHall(b, room, ctx, R) {
    switch (b.type) {
      case 'tavern':
        fillTavernHall(b, room, ctx, R);
        break;
      case 'church':
        fillChurchHall(b, room, ctx, R);
        break;
      case 'telegraph':
        fillStationHall(b, room, ctx, R);
        break;
      case 'school':
        put(b, room, ctx, R, { spr: 'bench', name: 'Скамья', n: 2 });
        put(b, room, ctx, R, { spr: 'shelf', name: 'Полка', container: 'school_shelf', wall: true, chance: 0.5 });
        break;
      case 'banya':
        put(b, room, ctx, R, { spr: 'bench', name: 'Лавка', chance: 0.7 });
        put(b, room, ctx, R, { spr: 'crate', name: 'Ящик', container: 'barn_tools', chance: 0.5 });
        break;
      case 'stable':
        put(b, room, ctx, R, { spr: 'hay_pile', name: 'Сено', container: 'barn_hay', n: R.int(1, 2) });
        put(b, room, ctx, R, { spr: 'tub', name: 'Кормушка', chance: 0.8 });
        break;
      case 'guardtower':
        guardtowerLocker(b, room, ctx);
        break;
      default:
        // сени избы: лавка, поленница, хозяйственный ящик
        put(b, room, ctx, R, { spr: 'bench', name: 'Лавка', chance: 0.6 });
        put(b, room, ctx, R, { spr: 'wood_pile', name: 'Поленница', chance: 0.6 });
        put(b, room, ctx, R, { spr: 'crate', name: 'Ящик', container: 'living_crate', chance: 0.4 });
        break;
    }
  }

  // ---------------- трактирный зал ----------------
  function fillTavernHall(b, room, ctx, R) {
    // стойка вдоль стены, отделяющей зал от кухни
    var y = room.y;
    var x0 = room.x, x1 = room.x + room.w - 1;
    var cnt = 0;
    for (var x = x0; x <= x1 && cnt < 3; x += 2) {
      var o = putAt(b, room, ctx, x, y, {
        spr: 'counter', name: 'Стойка',
        container: cnt === 0 ? 'tavern_bar' : null
      });
      if (o) cnt++;
    }
    if (!cnt) {
      put(b, room, ctx, R, { spr: 'counter', name: 'Стойка', container: 'tavern_bar', wall: true });
    }
    // столы со скамьями
    var n = Math.min(3, Math.floor(room.w / 3));
    for (var i = 0; i < n; i++) {
      var tx = room.x + 1 + i * 3;
      var ty = room.y + 2 + (i % 2);
      if (putAt(b, room, ctx, tx, ty, { spr: 'table_wood', name: 'Стол', container: 'tavern_table' })) {
        putAt(b, room, ctx, tx, ty + 1, { spr: 'bench', name: 'Лавка' });
        putAt(b, room, ctx, tx - 1, ty, { spr: 'chair', name: 'Стул' });
      }
    }
    put(b, room, ctx, R, { spr: 'candle_table', name: 'Подсвечник', container: 'tavern_table', chance: 0.7 });
    put(b, room, ctx, R, { spr: 'stove_iron', name: 'Печурка', heat: true, wall: true, chance: 0.4 });
  }

  // ---------------- храм: ряды скамей, подсвечники ----------------
  function fillChurchHall(b, room, ctx, R) {
    var midX = room.x + Math.floor(room.w / 2);
    for (var y = room.y + 1; y < room.y + room.h - 1; y += 2) {
      for (var x = room.x + 1; x < room.x + room.w - 1; x += 3) {
        if (x === midX || x === midX - 1) continue;   // центральный проход
        putAt(b, room, ctx, x, y, { spr: 'bench', name: 'Скамья' });
      }
    }
    put(b, room, ctx, R, { spr: 'candle_table', name: 'Подсвечник', container: 'church_candle', n: 2 });
  }

  // ---------------- зал ожидания вокзала ----------------
  function fillStationHall(b, room, ctx, R) {
    put(b, room, ctx, R, { spr: 'bench', name: 'Скамья', n: 2 });
    put(b, room, ctx, R, { spr: 'crate', name: 'Багаж', container: 'warehouse_crate', chance: 0.6 });
    put(b, room, ctx, R, { spr: 'stove_iron', name: 'Печурка', heat: true, wall: true, chance: 0.6 });
  }

  // ---------------- кладовые и хозяйственные помещения ----------------
  function fillStorage(b, room, ctx, R) {
    var area = room.w * room.h;
    var nBig = area >= 20 ? 2 : 1;
    switch (b.type) {
      case 'warehouse':
        put(b, room, ctx, R, { spr: 'crate', name: 'Ящик', container: 'warehouse_crate', wall: true, n: R.int(2, 2 + nBig) });
        put(b, room, ctx, R, { spr: 'barrel', name: 'Бочка', container: 'warehouse_barrel', wall: true, n: R.int(1, nBig), sprFrame: R.int(0, 1) });
        put(b, room, ctx, R, { spr: 'sack', name: 'Мешок', container: 'warehouse_sack', n: R.int(1, 1 + nBig) });
        put(b, room, ctx, R, { spr: 'wood_pile', name: 'Поленница', chance: 0.4 });
        break;
      case 'barn':
        put(b, room, ctx, R, { spr: 'hay_pile', name: 'Сено', container: 'barn_hay', n: R.int(1, 1 + nBig) });
        put(b, room, ctx, R, { spr: 'crate', name: 'Ящик', container: 'barn_tools', wall: true, n: R.int(1, 2) });
        put(b, room, ctx, R, { spr: 'wood_pile', name: 'Поленница', chance: 0.7 });
        put(b, room, ctx, R, { spr: 'barrel', name: 'Бочка', container: 'warehouse_barrel', chance: 0.4 });
        if (b.loft) put(b, room, ctx, R, { spr: 'sack', name: 'Мешок', container: 'granary_sack', chance: 0.5 });
        break;
      case 'granary':
        put(b, room, ctx, R, { spr: 'sack', name: 'Мешок', container: 'granary_sack', n: R.int(2, 3 + nBig) });
        put(b, room, ctx, R, { spr: 'crate', name: 'Закром', container: 'granary_sack', wall: true, chance: 0.7 });
        if (b.grain) put(b, room, ctx, R, { spr: 'hay_pile', name: 'Сено', container: 'barn_hay', chance: 0.4 });
        break;
      case 'stable':
        // узкие полосы-стойла: сбруя и мелочь
        put(b, room, ctx, R, { spr: 'shelf', name: 'Стойка со сбруей', container: 'stable_rack' });
        put(b, room, ctx, R, { spr: 'crate', name: 'Ящик', container: 'stable_rack', chance: 0.5 });
        break;
      case 'fishing_hut':
        put(b, room, ctx, R, { spr: 'crate', name: 'Ящик', container: 'fishing_rack' });
        put(b, room, ctx, R, { spr: 'barrel', name: 'Бочка', container: 'fishing_rack', chance: 0.7 });
        put(b, room, ctx, R, { spr: 'tub', name: 'Кадка', chance: 0.6 });
        if (b.nets) put(b, room, ctx, R, { spr: 'shelf', name: 'Полка', container: 'fishing_rack', wall: true, chance: 0.6 });
        break;
      case 'cellar':
        put(b, room, ctx, R, { spr: 'tub', name: 'Кадка', container: 'cellar_veg' });
        put(b, room, ctx, R, { spr: 'sack', name: 'Мешок', container: 'cellar_veg', n: R.int(1, 2) });
        put(b, room, ctx, R, { spr: 'shelf', name: 'Закром', container: 'cellar_veg', wall: true, chance: 0.7 });
        break;
      case 'ruined':
        // обугленный хлам (пол — зола и снег)
        put(b, room, ctx, R, { spr: 'crate', name: 'Обугленный ящик', container: 'ruined_debris', rubble: true, chance: 0.8 });
        put(b, room, ctx, R, { spr: 'barrel', name: 'Обугленная бочка', container: 'ruined_debris', rubble: true, chance: 0.5 });
        put(b, room, ctx, R, { spr: 'stove_iron', name: 'Погнутая печурка', heat: false, rubble: true, chance: 0.3 });
        break;
      case 'tavern':
        // подклет-кладовая трактира
        put(b, room, ctx, R, { spr: 'barrel', name: 'Бочка', container: 'tavern_cellar', wall: true, n: R.int(1, 2) });
        put(b, room, ctx, R, { spr: 'crate', name: 'Ящик', container: 'tavern_cellar' });
        put(b, room, ctx, R, { spr: 'sack', name: 'Мешок', container: 'tavern_cellar', chance: 0.6 });
        break;
      case 'store':
        put(b, room, ctx, R, { spr: 'crate', name: 'Ящик', container: 'store_storage', n: R.int(1, 2) });
        put(b, room, ctx, R, { spr: 'barrel', name: 'Бочка', container: 'store_storage', chance: 0.5 });
        put(b, room, ctx, R, { spr: 'sack', name: 'Мешок', container: 'store_storage', chance: 0.5 });
        break;
      default:
        put(b, room, ctx, R, { spr: 'crate', name: 'Ящик', container: 'warehouse_crate', n: R.int(1, 2) });
        put(b, room, ctx, R, { spr: 'barrel', name: 'Бочка', container: 'warehouse_barrel', chance: 0.5 });
        put(b, room, ctx, R, { spr: 'sack', name: 'Мешок', container: 'warehouse_sack', chance: 0.4 });
        break;
    }
  }

  // ---------------- конторы и кабинеты ----------------
  function fillOffice(b, room, ctx, R) {
    // ящик конторки — что за бумагами, зависит от заведения
    var deskCont = 'telegraph_desk';
    if (b.type === 'jail') deskCont = 'jail_locker';
    else if (b.type === 'doctor') deskCont = 'doctor_cabinet';
    else if (b.type === 'store') deskCont = 'store_counter';
    else if (b.type === 'school') deskCont = 'school_desk';
    else if (b.type === 'sawmill') deskCont = 'sawmill_workbench';
    else if (b.type === 'izba_rich') deskCont = 'bedroom_chest';
    put(b, room, ctx, R, { spr: 'desk', name: 'Конторка', container: deskCont, wall: true });
    put(b, room, ctx, R, { spr: 'chair', name: 'Стул' });
    var cupCont = 'store_storage';
    if (b.type === 'doctor') cupCont = 'doctor_cabinet';
    else if (b.type === 'jail') cupCont = 'jail_locker';
    else if (b.type === 'telegraph') cupCont = 'telegraph_desk';
    put(b, room, ctx, R, { spr: 'cupboard', name: 'Шкап', container: cupCont, wall: true, chance: 0.6 });
    put(b, room, ctx, R, { spr: 'bookshelf', name: 'Шкап с книгами', container: 'school_shelf', wall: true, chance: 0.45 });
    put(b, room, ctx, R, { spr: 'stove_iron', name: 'Буржуйка', heat: true, wall: true, chance: 0.35 });
    // у врача — кушетка для осмотра
    if (b.type === 'doctor') {
      put(b, room, ctx, R, { spr: 'bed_wood', name: 'Кушетка', container: 'doctor_bed', wall: true, chance: 0.8 });
    }
    if (b.type === 'izba_rich') {
      put(b, room, ctx, R, { spr: 'mirror', name: 'Зеркало', wall: true, chance: 0.4 });
    }
  }

  // ---------------- парная бани ----------------
  function fillBath(b, room, ctx, R) {
    var st = (b.stove && usable(b, room, ctx, b.stove.x, b.stove.y, null)) ? b.stove : null;
    if (st) {
      putAt(b, room, ctx, st.x, st.y, { spr: 'stove_iron', name: 'Каменка', heat: true });
    } else {
      put(b, room, ctx, R, { spr: 'stove_iron', name: 'Каменка', heat: true, wall: true });
    }
    put(b, room, ctx, R, { spr: 'tub', name: 'Чан', chance: 0.9 });
    put(b, room, ctx, R, { spr: 'bench', name: 'Лавка', chance: 0.7 });
    put(b, room, ctx, R, { spr: 'crate', name: 'Ящик', container: 'barn_tools', chance: 0.35 });
  }

  // ---------------- алтарь церкви ----------------
  function fillAltar(b, room, ctx, R) {
    put(b, room, ctx, R, { spr: 'altar', name: 'Престол', container: 'church_altar', wall: true });
    put(b, room, ctx, R, { spr: 'candle_table', name: 'Подсвечник', container: 'church_candle', n: 2 });
    put(b, room, ctx, R, { spr: 'coffin', name: 'Гроб', container: 'personal_body', chance: 0.25 });
  }

  // ---------------- торговый зал лавки ----------------
  function fillShop(b, room, ctx, R) {
    // прилавок на подсказанном месте + продолжение вдоль
    var c = b.counter;
    var placed = false;
    if (c && putAt(b, room, ctx, c.x, c.y, { spr: 'counter', name: 'Прилавок', container: 'store_counter' })) {
      placed = true;
      if (!putAt(b, room, ctx, c.x - 1, c.y, { spr: 'counter', name: 'Прилавок' })) {
        putAt(b, room, ctx, c.x + 1, c.y, { spr: 'counter', name: 'Прилавок' });
      }
    }
    if (!placed) {
      put(b, room, ctx, R, { spr: 'counter', name: 'Прилавок', container: 'store_counter', wall: true });
    }
    // полки: бакалея, скобяной товар, мануфактура
    var kinds = ['store_shelf_food', 'store_shelf_tools', 'store_shelf_cloth'];
    var n = R.int(3, 4);
    for (var i = 0; i < n; i++) {
      put(b, room, ctx, R, { spr: 'shelf', name: 'Полка', container: R.pick(kinds), wall: true });
    }
    put(b, room, ctx, R, { spr: 'crate', name: 'Ящик', container: 'store_storage', wall: true, chance: 0.5 });
    put(b, room, ctx, R, { spr: 'stove_iron', name: 'Печурка', heat: true, wall: true, chance: 0.4 });
  }

  // ---------------- класс школы ----------------
  function fillSchoolRoom(b, room, ctx, R) {
    for (var y = room.y; y < room.y + room.h; y += 2) {
      for (var x = room.x + 1; x < room.x + room.w - 1; x += 2) {
        putAt(b, room, ctx, x, y, { spr: 'desk', name: 'Парты', container: 'school_desk' });
      }
    }
    put(b, room, ctx, R, { spr: 'bookshelf', name: 'Шкап с книгами', container: 'school_shelf', wall: true, chance: 0.8 });
    put(b, room, ctx, R, { spr: 'stove_iron', name: 'Печурка', heat: true, wall: true, chance: 0.6 });
  }

  // ---------------- мастерские: кузница и пилорама ----------------
  function fillWorkshop(b, room, ctx, R) {
    if (b.type === 'smithy') {
      // горн и наковальня — на местах, подсказанных генератором
      var okForge = b.forge && putAt(b, room, ctx, b.forge.x, b.forge.y, { spr: 'forge', name: 'Горн', heat: true });
      if (!okForge) put(b, room, ctx, R, { spr: 'forge', name: 'Горн', heat: true, wall: true });
      var okAnvil = b.anvil && putAt(b, room, ctx, b.anvil.x, b.anvil.y, { spr: 'anvil', name: 'Наковальня', container: 'smithy_anvil' });
      if (!okAnvil) put(b, room, ctx, R, { spr: 'anvil', name: 'Наковальня', container: 'smithy_anvil' });
      put(b, room, ctx, R, { spr: 'workbench', name: 'Верстак', container: 'smithy_shelf', wall: true });
      put(b, room, ctx, R, { spr: 'barrel', name: 'Бочка с водой', chance: 0.7 });
      put(b, room, ctx, R, { spr: 'crate', name: 'Ящик', container: 'warehouse_crate', chance: 0.6 });
      put(b, room, ctx, R, { spr: 'wood_pile', name: 'Поленница', chance: 0.5 });
    } else if (b.type === 'sawmill') {
      put(b, room, ctx, R, { spr: 'workbench', name: 'Верстак', container: 'sawmill_workbench', wall: true, n: 2 });
      put(b, room, ctx, R, { spr: 'crate', name: 'Ящик', container: 'warehouse_crate', n: R.int(1, 3) });
      put(b, room, ctx, R, { spr: 'wood_pile', name: 'Поленница', n: 2 });
      put(b, room, ctx, R, { spr: 'log_pile', name: 'Штабель', n: R.int(1, 2), chance: 0.8 });
    } else {
      put(b, room, ctx, R, { spr: 'workbench', name: 'Верстак', container: 'smithy_shelf', wall: true });
      put(b, room, ctx, R, { spr: 'crate', name: 'Ящик', container: 'warehouse_crate' });
    }
  }

  // ---------------- камера околотка и прочие «клетки» ----------------
  function fillCell(b, room, ctx, R) {
    if (b.type === 'cellar') {
      fillCellarStash(b, room, ctx, R);
      return;
    }
    // камера околотка: нары и ящик с изъятым
    put(b, room, ctx, R, { spr: 'bench', name: 'Нары' });
    put(b, room, ctx, R, { spr: 'crate', name: 'Ящик', container: 'personal_body', chance: 0.6 });
  }

  // ---------------- погреб ----------------
  function fillCellarStash(b, room, ctx, R) {
    put(b, room, ctx, R, { spr: 'tub', name: 'Кадка', container: 'cellar_veg' });
    put(b, room, ctx, R, { spr: 'sack', name: 'Мешок', container: 'cellar_veg', n: R.int(1, 2) });
    put(b, room, ctx, R, { spr: 'shelf', name: 'Закром', container: 'cellar_veg', wall: true, chance: 0.7 });
    put(b, room, ctx, R, { spr: 'barrel', name: 'Бочка', container: 'cellar_veg', chance: 0.5 });
  }

  // ---------------- дозорная вышка: единственный тайл ----------------
  function guardtowerLocker(b, room, ctx) {
    var x = room.x, y = room.y;
    if (usable(b, room, ctx, x, y, null)) {
      // ларь занимает всю каморку — обыскивается с порога
      putAt(b, room, ctx, x, y, {
        spr: 'crate', name: 'Ларь дозорного',
        container: 'guardtower_locker', force: true
      });
    }
  }

  /** Диспетчер комнаты. */
  function fillRoom(b, room, ctx, R) {
    if (room.w * room.h <= 1) {
      if (b.type === 'guardtower') guardtowerLocker(b, room, ctx);
      return;
    }
    switch (room.role) {
      case 'kitchen': fillKitchen(b, room, ctx, R); break;
      case 'bedroom': fillBedroom(b, room, ctx, R); break;
      case 'living': fillLiving(b, room, ctx, R); break;
      case 'hall': fillHall(b, room, ctx, R); break;
      case 'storage': fillStorage(b, room, ctx, R); break;
      case 'office': fillOffice(b, room, ctx, R); break;
      case 'bath': fillBath(b, room, ctx, R); break;
      case 'altar': fillAltar(b, room, ctx, R); break;
      case 'shop': fillShop(b, room, ctx, R); break;
      case 'school': fillSchoolRoom(b, room, ctx, R); break;
      case 'workshop': fillWorkshop(b, room, ctx, R); break;
      case 'cell': fillCell(b, room, ctx, R); break;
      default: fillStorage(b, room, ctx, R); break;
    }
  }

  /**
   * Печь обязательна для любой избы: если по ролям не нашлось кухни или
   * бани, ставим печь в комнату с b.stove (малые избы, богатый дом).
   */
  function ensurePech(b, ctx, R) {
    if (!b.stove) return;
    var heated = false;
    var i;
    for (i = 0; i < b.rooms.length; i++) {
      var r = b.rooms[i];
      if (r.role === 'kitchen' || r.role === 'bath') heated = true;
    }
    if (heated) return;
    var room = roomAt(b, b.stove.x, b.stove.y);
    if (!room) room = b.rooms.length ? b.rooms[0] : null;
    if (!room) return;
    if (!putAt(b, room, ctx, b.stove.x, b.stove.y, {
      spr: 'pech', name: 'Печь', container: 'kitchen_pech', heat: true
    })) {
      put(b, room, ctx, R, { spr: 'pech', name: 'Печь', container: 'kitchen_pech', heat: true, wall: true });
    }
  }

  /** Наполнить одно здание. */
  function fillBuilding(b, R) {
    if (!b || !b.rooms || !b.rooms.length) return;
    addDoors(b, R);
    ensurePartitions(b, R);
    var ctx = mkCtx(b);
    var i;
    for (i = 0; i < b.rooms.length; i++) {
      try {
        fillRoom(b, b.rooms[i], ctx, R);
      } catch (e) {
        WS.err('interiors: комната ' + b.rooms[i].role + ' в ' + b.id, e);
      }
    }
    ensurePech(b, ctx, R);
  }

  // ==================================================================
  //  МИРСКИЕ ШТРИХИ: снасти в лодках, егерские тайники
  // ==================================================================

  /** Пристать снасти к вмёрзшим лодкам (объекты уже у генератора). */
  function boatsSupply() {
    var objs = WS.World.objects;
    for (var i = 0; i < objs.length; i++) {
      if (objs[i].sprName === 'boat' && !objs[i].container) {
        objs[i].container = 'boat_supply';
        objs[i].name = 'Лодка со снастями';
      }
    }
  }

  /**
   * Егерские тайники: снежный бугор с люком где-то у леса.
   * Ищем природный тайл без объектов и зданий подальше от посёлка.
   */
  function rangerCaches(R) {
    var W = WS.World, T = W.T;
    var n = 1 + (R.chance(0.5) ? 1 : 0);
    for (var i = 0; i < n; i++) {
      for (var t = 0; t < 50; t++) {
        var xx = R.int(20, 200);
        var yy = R.int(20, 92);              // север — к лесу
        var tt = W.tileAt(xx, yy);
        if (tt !== T.SNOW && tt !== T.GRASS && tt !== T.GRASS2 && tt !== T.DIRT) continue;
        if (W.objsAt(xx, yy).length) continue;
        if (W.buildingAt(xx, yy)) continue;
        W.addObject({
          x: xx + 0.5, y: yy + 0.5,
          sprName: 'cabbage_pit',
          solid: true,
          name: 'Тайник',
          container: 'ranger_cache'
        });
        break;
      }
    }
  }

  // ==================================================================
  //  ОБРАБОТЧИК 'gen:town' И ПУБЛИЧНЫЙ API
  // ==================================================================

  function onGenTown(d) {
    var R = (d && d.R) ? d.R : WS.RNG.mk((d && d.seed) || 1);
    var bs = WS.World.buildings;
    for (var i = 0; i < bs.length; i++) {
      try {
        fillBuilding(bs[i], R);
      } catch (e) {
        WS.err('interiors: здание ' + bs[i].id, e);
      }
    }
    try { boatsSupply(); } catch (e2) { WS.err('boats', e2); }
    try { rangerCaches(R); } catch (e3) { WS.err('ranger caches', e3); }
    WS.log('[Interiors] мебель расставлена: зданий ' + bs.length +
           ', объектов всего ' + WS.World.objects.length);
    // следующий этап наполнения мира
    WS.Ev.emit('gen:interiors', { R: R });
  }

  WS.boot(function initInteriors() {
    WS.Ev.on('gen:town', onGenTown);
  }, 'interiors:init');

  WS.def('Interiors', {
    fillBuilding: fillBuilding,
    tryDoor: tryDoor,
    toggleDoor: toggleDoor
  });
})();
