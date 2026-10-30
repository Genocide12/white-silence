/**
 * ГЕНЕРАЦИЯ МИРА, ЧАСТЬ 2: ПОСЁЛОК «ПРИСТАНЬ-ТИХАЯ».
 * План: центральная улица вдоль реки (река на юге, лес на севере), 4 ряда
 * застройки с зазорами, Соборная площадь с церковью и погостом, вокзал с
 * рельсовым тупиком (рядом — точка старта игрока), промзона у воды
 * (пилорама, склады, мостки-пристань), бани и рыбачьи избушки на берегу.
 * Каждое здание — функция build<Type>(x, y, w, h, R): внешние стены, окна,
 * двери, перегородки; метаданные World.buildings (rooms/door/windows) — для
 * интерьерного модуля. Хозяйство во дворах: заборы, колодцы, поленницы,
 * сани, бочки, капустные ямы, стога, телеги, ящики, сушила для рыбы.
 * Спрайты дворового хозяйства регистрируются ПРИ ЗАГРУЗКЕ (WS.Spr.def).
 * Связь: вызывается из gen.js; геометрию реки/улиц берёт из GenTerrain.info().
 */
(function () {
  'use strict';

  // ==================================================================
  //  ПРИМИТИВЫ ПИКСЕЛЬ-АРТА (1 ед. = 2 пикселя), как в gen_terrain.js
  // ==================================================================
  function R2(c, x, y, w, h, col) {
    c.fillStyle = col;
    c.fillRect(x * 2, y * 2, w * 2, h * 2);
  }
  function E2(c, x, y, rx, ry, col) {
    c.fillStyle = col;
    c.beginPath();
    c.ellipse(x * 2, y * 2, rx * 2, ry * 2, 0, 0, Math.PI * 2);
    c.fill();
  }
  function D2(c, x, y, col) {
    c.fillStyle = col;
    c.fillRect(x * 2, y * 2, 2, 2);
  }

  // Оттенки сверх палитры WS.Spr.pal.
  var COL = {
    straw: '#a89a7c', strawDark: '#8a7d62', strawLit: '#b5a884',
    fishBelly: '#7d8a94', fishBack: '#5f6c78',
    charDark: '#26221e', charMid: '#38332c',
    clothRed: '#7a3a34'
  };

  /** Колесо телеги: обод, спицы, втулка. */
  function wheelCart(c, x, y) {
    var pal = WS.Spr.pal;
    E2(c, x, y, 4.4, 4.4, pal.wood2);
    E2(c, x, y, 3.1, 3.1, '#31281d');
    D2(c, x - 3, y, pal.plank); D2(c, x + 3, y, pal.plank);
    D2(c, x, y - 3, pal.plank); D2(c, x, y + 3, pal.plank);
    D2(c, x - 2, y - 2, pal.plank); D2(c, x + 2, y + 2, pal.plank);
    D2(c, x - 2, y + 2, pal.plank); D2(c, x + 2, y - 2, pal.plank);
    D2(c, x, y, pal.steel);
  }

  /** Подвешенная рыба для сушила. */
  function hangFish(c, x, y) {
    R2(c, x, y, 2, 1, COL.fishBelly);
    D2(c, x, y - 1, COL.fishBack);
    D2(c, x + 2, y, COL.fishBack);
  }

  // ==================================================================
  //  СПРАЙТЫ ДВОРОВОГО ХОЗЯЙСТВА (регистрация при загрузке)
  // ==================================================================

  // -------- КОЛОДЕЦ, 40x44: сруб, ворот с ведром, двускатная крышка --------
  WS.Spr.def('well', {
    w: 40, h: 44,
    draw: function (c) {
      var pal = WS.Spr.pal;
      // сруб-оголовок
      R2(c, 5, 10, 10, 8, pal.wood);
      R2(c, 4, 11, 1, 6, pal.wood2);
      R2(c, 15, 11, 1, 6, pal.wood2);
      R2(c, 6, 9, 8, 1, pal.plank);            // верхний венец
      E2(c, 10, 9.5, 4.4, 1.8, pal.wood2);    // тёмный зев
      E2(c, 10, 9.2, 3.4, 1.2, '#0e0c0a');   // вода в темноте
      // стойки и вал
      R2(c, 5, 2, 2, 8, pal.wood3);
      R2(c, 13, 2, 2, 8, pal.wood3);
      R2(c, 7, 3, 6, 2, pal.wood);            // вал
      D2(c, 8, 5, pal.brass);                 // рукоять
      // верёвка и ведро
      R2(c, 10, 5, 1, 4, '#3a3f4a');
      R2(c, 8, 9, 4, 3, pal.wood2);           // ведро
      R2(c, 8, 9, 4, 1, pal.steel);           // обод ведра
      // двускатная крышка
      R2(c, 6, 2, 8, 1, pal.roof);
      R2(c, 7, 1, 6, 1, pal.roof2);
      R2(c, 8, 0, 4, 1, pal.roof);
      R2(c, 7, 0, 6, 1, pal.snow2);           // снег на крышке
      R2(c, 5, 17, 10, 2, pal.snow2);         // сугроб вокруг
      R2(c, 6, 16, 5, 1, pal.snow1);
    }
  });

  // -------- ПОЛЕННИЦА, 44x28: три ряда брёвен со снежной шапкой --------
  WS.Spr.def('woodpile', {
    w: 44, h: 28, frames: 2,
    draw: function (c, cw, ch, f) {
      var pal = WS.Spr.pal;
      // нижний ряд — 6 чурок
      var rows = [
        { y: 10, xs: [4, 7, 10, 13, 16, 19] },
        { y: 7, xs: [5, 8, 11, 14, 17] },
        { y: 4, xs: [8, 11, 14] }
      ];
      for (var r = 0; r < rows.length; r++) {
        for (var i = 0; i < rows[r].xs.length; i++) {
          var xx = rows[r].xs[i] + (f === 1 && i === 2 ? 1 : 0);
          E2(c, xx, rows[r].y + 1, 1.4, 1.4, pal.wood3);
          D2(c, xx, rows[r].y + 1, pal.wood2);
          D2(c, xx - 0.5, rows[r].y + 0.5, pal.wood);
        }
      }
      // снежная шапка поверх верхнего ряда
      R2(c, 4, 2, 14, 1, pal.snow2);
      R2(c, 6, 1, 9, 1, pal.snow1);
      R2(c, 3, 12, 17, 1, pal.snowShadow);
    }
  });

  // -------- СТОГ СЕНА, 44x40: округлый, с соломой и снегом --------
  WS.Spr.def('haystack', {
    w: 44, h: 40, frames: 2,
    draw: function (c, cw, ch, f) {
      var pal = WS.Spr.pal;
      E2(c, 11, 13, 9, 6.5, COL.straw);
      E2(c, 11, 10, 7, 5.5, COL.strawLit);
      E2(c, 11, 7, 4.5, 3.5, COL.straw);
      D2(c, 11, 3, '#c2b590');              // верхушка
      // вертикальная фактура — штрихи
      for (var i = 0; i < 8; i++) {
        R2(c, 4 + i * 2, 8 + (i % 3), 1, 5, COL.strawDark);
      }
      // снег сверху
      E2(c, 11, 6, 4.8, 2.2, pal.snow2);
      R2(c, 8, 4, 6, 1, pal.snow1);
      if (f === 1) { R2(c, 14, 8, 3, 1, pal.snow2); D2(c, 5, 9, pal.snow2); }
      R2(c, 3, 18, 17, 2, pal.snowShadow);  // подсыпка тени
    }
  });

  // -------- МОГИЛЬНЫЙ КРЕСТ, 22x48: восьмиконечный, со снегом --------
  WS.Spr.def('cross_grave', {
    w: 22, h: 48, frames: 2,
    draw: function (c, cw, ch, f) {
      var pal = WS.Spr.pal;
      var wood = f === 0 ? pal.wood2 : '#5c4730';
      R2(c, 5, 3, 1, 20, wood);             // вертикаль
      R2(c, 2, 7, 7, 1, wood);              // большая перекладина
      // малая верхняя перекладина
      R2(c, 3, 5, 5, 1, wood);
      // косая нижняя — лесенкой
      for (var i = 0; i < 3; i++) D2(c, 4 + i, 10 - i, wood);
      // снег
      D2(c, 5, 3, pal.snow1);
      R2(c, 2, 7, 2, 1, pal.snow2);
      D2(c, 8, 7, pal.snow1);
      D2(c, 3, 4, pal.snow2);
      R2(c, 2, 22, 7, 2, pal.snow2);        // сугроб у подножия
      R2(c, 3, 21, 4, 1, pal.snow1);
    }
  });

  // -------- КРЕСТ ХРАМОВЫЙ, 28x60 --------
  WS.Spr.def('cross_church', {
    w: 28, h: 60,
    draw: function (c) {
      var pal = WS.Spr.pal;
      var wood = '#5c4730';
      R2(c, 6, 2, 2, 27, wood);            // вертикаль
      R2(c, 3, 6, 8, 1, wood);             // большая перекладина
      R2(c, 4, 10, 6, 1, wood);            // малая
      for (var i = 0; i < 4; i++) D2(c, 5 + i, 13 - i, wood);  // косая
      D2(c, 6, 2, pal.brass);              // навершие
      D2(c, 7, 2, pal.ember2);
      // снег
      R2(c, 6, 2, 2, 1, pal.snow1);
      R2(c, 3, 6, 3, 1, pal.snow2);
      R2(c, 3, 28, 8, 2, pal.snow2);
    }
  });

  // -------- БОЧКА, 26x32 --------
  WS.Spr.def('barrel', {
    w: 26, h: 32, frames: 2,
    draw: function (c, cw, ch, f) {
      var pal = WS.Spr.pal;
      R2(c, 3, 3, 7, 12, pal.wood3);
      R2(c, 3, 3, 1, 12, pal.wood);        // освещённая грань
      R2(c, 3, 5, 7, 1, '#5a5f68');        // обруч верхний
      R2(c, 3, 12, 7, 1, '#5a5f68');       // обруч нижний
      E2(c, 6.5, 3, 3.5, 1.4, pal.wood2);  // крышка
      if (f === 1) E2(c, 6.5, 3, 2.4, 0.9, pal.water);  // вода в открыту
      R2(c, 2, 14, 9, 2, pal.snow2);       // снег у днища
      R2(c, 3, 13, 4, 1, pal.snow1);
    }
  });

  // -------- СТАРЫЕ САНИ, 40x24: полозья, настил, вязанка дров --------
  WS.Spr.def('sled', {
    w: 40, h: 24, frames: 2,
    draw: function (c, cw, ch, f) {
      var pal = WS.Spr.pal;
      // полозья (изометрия: два со смещением)
      R2(c, 2, 9, 13, 1, '#4a4238');
      R2(c, 8, 10, 11, 1, '#3e3830');
      // загиб полоза спереди
      D2(c, 15, 8, '#4a4238');
      D2(c, 16, 7, '#4a4238');
      D2(c, 17, 6, '#4a4238');
      D2(c, 18, 5, '#4a4238');
      // настил
      R2(c, 4, 6, 11, 2, pal.plank);
      R2(c, 4, 6, 11, 1, pal.wood3);
      R2(c, 5, 8, 11, 1, pal.wood2);
      // вязанка дров
      R2(c, 5, 4, 9, 2, pal.wood);
      D2(c, 6, 4, pal.wood2); D2(c, 9, 4, pal.wood2); D2(c, 12, 4, pal.wood2);
      // рогожа сверху (вариант)
      if (f === 1) R2(c, 6, 3, 6, 1, pal.canvasCloth);
      // снег
      R2(c, 5, 3, 7, 1, pal.snow2);
      R2(c, 1, 10, 5, 1, pal.snow1);
    }
  });

  // -------- ЯЩИК ХОЗЯЙСТВЕННЫЙ, 26x26 --------
  WS.Spr.def('crate', {
    w: 26, h: 26, frames: 2,
    draw: function (c, cw, ch, f) {
      var pal = WS.Spr.pal;
      R2(c, 2, 3, 9, 9, pal.wood3);
      R2(c, 2, 3, 9, 1, pal.plank);
      R2(c, 2, 3, 1, 9, pal.wood);
      R2(c, 10, 3, 1, 9, pal.wood2);
      // диагональная планка
      for (var i = 0; i < 8; i++) D2(c, 3 + i, 4 + i, pal.wood2);
      if (f === 1) { D2(c, 4, 4, pal.canvasCloth); D2(c, 5, 4, pal.canvasCloth); }
      R2(c, 2, 11, 9, 2, pal.snow2);       // снег у днища
      R2(c, 3, 10, 4, 1, pal.snow1);
    }
  });

  // -------- ЛОДКА, 48x26: перевёрнутая, вмёрзшая в лёд --------
  WS.Spr.def('boat', {
    w: 48, h: 26,
    draw: function (c) {
      var pal = WS.Spr.pal;
      E2(c, 12, 8, 10, 4.5, '#4c3a28');    // корпус
      E2(c, 12, 7, 9, 3.2, '#5c4730');
      R2(c, 3, 7, 18, 1, pal.wood2);       // борт-кромка
      R2(c, 5, 5, 14, 1, pal.wood3);       // киль
      // снег на киле
      R2(c, 7, 4, 10, 1, pal.snow2);
      R2(c, 9, 3, 6, 1, pal.snow1);
      // сцеп льда у основания
      E2(c, 12, 11.5, 11, 1.8, pal.ice);
    }
  });

  // -------- ТЕЛЕГА, 58x42: кузов, оглобли, два колеса --------
  WS.Spr.def('cart', {
    w: 58, h: 42,
    draw: function (c) {
      var pal = WS.Spr.pal;
      wheelCart(c, 8, 15);
      wheelCart(c, 21, 15);
      // кузов
      R2(c, 3, 7, 23, 4, pal.plank);
      R2(c, 3, 7, 23, 1, pal.wood3);
      R2(c, 3, 8, 1, 3, pal.wood);
      R2(c, 25, 8, 1, 3, pal.wood2);
      // дрова в кузове
      R2(c, 5, 5, 8, 2, pal.wood);
      R2(c, 14, 5, 7, 2, pal.wood2);
      D2(c, 7, 5, pal.wood3); D2(c, 16, 5, pal.wood3);
      // оглобли
      for (var i = 0; i < 5; i++) D2(c, 24 + i, 12 + i, pal.wood2);
      // снег
      R2(c, 5, 4, 18, 1, pal.snow2);
      R2(c, 2, 19, 7, 1, pal.snow1);
      R2(c, 18, 19, 7, 1, pal.snow1);
    }
  });

  // -------- ФЛАГШТОК ВЫШКИ, 14x64 --------
  WS.Spr.def('flagpole', {
    w: 14, h: 64,
    draw: function (c) {
      var pal = WS.Spr.pal;
      R2(c, 3, 2, 1, 29, '#4a4238');
      R2(c, 3, 2, 1, 1, pal.brass);        // навершие
      // вымпел
      R2(c, 4, 3, 3, 2, COL.clothRed);
      R2(c, 4, 4, 2, 1, '#5a5f68');
      D2(c, 7, 4, COL.clothRed);
      R2(c, 3, 30, 1, 2, pal.snow2);       // подсыпка
    }
  });

  // -------- СУШИЛО ДЛЯ РЫБЫ, 40x44 --------
  WS.Spr.def('fish_rack', {
    w: 40, h: 44,
    draw: function (c) {
      var pal = WS.Spr.pal;
      // стойки
      R2(c, 3, 4, 1, 16, pal.wood2);
      R2(c, 16, 4, 1, 16, pal.wood2);
      // перекладины
      R2(c, 2, 6, 16, 1, pal.wood);
      R2(c, 2, 12, 16, 1, pal.wood);
      R2(c, 2, 18, 16, 1, pal.wood);
      // рыба подвешена
      hangFish(c, 5, 8); hangFish(c, 9, 7); hangFish(c, 13, 9);
      hangFish(c, 7, 14); hangFish(c, 11, 15);
      hangFish(c, 6, 20); hangFish(c, 14, 19);
      // снег на перекладинах
      R2(c, 2, 5, 16, 1, pal.snow2);
      R2(c, 2, 11, 16, 1, pal.snow1);
      R2(c, 2, 17, 16, 1, pal.snow2);
      R2(c, 2, 20, 17, 2, pal.snowShadow);
    }
  });

  // -------- МУСОР ПОГАРЕЛИЩА, 34x24 --------
  WS.Spr.def('debris', {
    w: 34, h: 24, frames: 2,
    draw: function (c, cw, ch, f) {
      var pal = WS.Spr.pal;
      // обугленные балки крест-накрест
      R2(c, 2, 7, 12, 2, COL.charDark);
      R2(c, 5, 9, 10, 2, '#38332c');
      R2(c, 8, 5, 8, 1, COL.charMid);
      if (f === 1) R2(c, 4, 11, 9, 1, COL.charMid);
      // головни и щепа
      for (var i = 0; i < 12; i++) {
        D2(c, 2 + ((i * 1.3) | 0), 6 + ((i * 7) % 4), COL.charDark);
      }
      D2(c, 4, 5, COL.charMid);
      D2(c, 12, 4, COL.charMid);
      // снег поверх завала
      R2(c, 3, 6, 5, 1, pal.snow2);
      R2(c, 10, 8, 4, 1, pal.snow2);
      D2(c, 8, 6, pal.snow1);
    }
  });

  // -------- КАПУСТНАЯ ЯМА, 32x22: снежный бугор с люком --------
  WS.Spr.def('cabbage_pit', {
    w: 32, h: 22,
    draw: function (c) {
      var pal = WS.Spr.pal;
      E2(c, 8, 6.5, 7, 3.5, pal.snow2);    // бугор
      E2(c, 8, 5.5, 5.5, 2.5, pal.snow1);
      // деревянный люк
      R2(c, 5, 4, 6, 3, pal.wood);
      R2(c, 5, 4, 6, 1, pal.plank);
      D2(c, 7, 5, pal.steel);              // ручка-скоба
      // солома из щелей
      D2(c, 4, 7, COL.straw);
      D2(c, 12, 7, COL.straw);
      D2(c, 6, 8, COL.strawDark);
    }
  });

  // -------- ШТАБЕЛЬ БРЁВЕН, 48x36: торцы пиленой лесины --------
  WS.Spr.def('log_pile', {
    w: 48, h: 36,
    draw: function (c) {
      var pal = WS.Spr.pal;
      // три ряда торцов
      var rows = [
        { y: 14, xs: [3, 7, 11, 15, 19] },
        { y: 10, xs: [5, 9, 13, 17] },
        { y: 6, xs: [7, 11, 15] }
      ];
      for (var r = 0; r < rows.length; r++) {
        for (var i = 0; i < rows[r].xs.length; i++) {
          var xx = rows[r].xs[i];
          E2(c, xx, rows[r].y, 1.8, 1.8, pal.wood3);
          E2(c, xx, rows[r].y, 1.1, 1.1, pal.wood2);
          D2(c, xx, rows[r].y, '#57422e');
        }
      }
      // снег на штабеле
      E2(c, 11, 4, 6, 1.6, pal.snow2);
      R2(c, 6, 3, 9, 1, pal.snow1);
      R2(c, 2, 16, 20, 1, pal.snowShadow);
    }
  });

  // -------- ДРОВЯНАЯ КРАНИЛА (подпорка) у поленниц, 20x30 --------
  WS.Spr.def('sawhorse', {
    w: 20, h: 30,
    draw: function (c) {
      var pal = WS.Spr.pal;
      // козлы-подставки
      R2(c, 2, 6, 1, 8, pal.wood2);
      R2(c, 7, 6, 1, 8, pal.wood2);
      R2(c, 3, 5, 4, 1, pal.plank);
      // лежень
      R2(c, 1, 4, 8, 1, pal.wood3);
      // пара чурок сверху
      E2(c, 3, 3, 1.3, 1.3, pal.wood3);
      E2(c, 6, 3, 1.3, 1.3, pal.wood3);
      D2(c, 3, 3, pal.wood2); D2(c, 6, 3, pal.wood2);
      // снег
      R2(c, 1, 13, 8, 1, pal.snow1);
      R2(c, 2, 12, 4, 1, pal.snow2);
    }
  });

  // ==================================================================
  //  ОБЩИЕ ПОМОЩНИКИ ЗАСТРОЙКИ
  // ==================================================================

  function info() { return WS.GenTerrain.info(); }
  function reserve(x, y, w, h) { info().reserved.push({ x: x, y: y, w: w, h: h }); }

  /** Природный ли тайл (на нём можно ставить дворовые предметы). */
  function isNatT(t) {
    var T = WS.World.T;
    return t === T.SNOW || t === T.GRASS || t === T.GRASS2 ||
           t === T.SNOW_DEEP || t === T.DIRT;
  }

  /** Тайл — стена (для расстановки окон). */
  function isWallT(t) {
    var T = WS.World.T;
    return t === T.WALL_WOOD || t === T.WALL_BRICK ||
           t === T.WALL_LOG || t === T.WALL_STONE;
  }

  var bCount = 0;   // счётчик зданий (для id)

  /** Занести здание в World.buildings. */
  function meta(type, name, x, y, w, h, mat) {
    var b = {
      id: type + '_' + (++bCount),
      type: type, x: x, y: y, w: w, h: h,
      name: name, material: mat,
      rooms: [], door: [], windows: []
    };
    WS.World.buildings.push(b);
    return b;
  }

  /** Коробка: пол внутри + стены по периметру. */
  function shell(x, y, w, h, wallT, floorT) {
    var W = WS.World;
    W.carve(x, y, w, h, floorT);
    for (var xx = x; xx < x + w; xx++) {
      W.setTile(xx, y, wallT);
      W.setTile(xx, y + h - 1, wallT);
    }
    for (var yy = y; yy < y + h; yy++) {
      W.setTile(x, yy, wallT);
      W.setTile(x + w - 1, yy, wallT);
    }
  }

  /** Дверь (тайл проходим, объект-дверь добавит интерьерный модуль). */
  function doorAt(b, x, y) {
    WS.World.setTile(x, y, WS.World.T.DOOR);
    b.door.push({ x: x, y: y });
  }

  /** Окно — только вместо стены. */
  function winAt(b, x, y) {
    if (isWallT(WS.World.tileAt(x, y))) {
      WS.World.setTile(x, y, WS.World.T.WINDOW);
      b.windows.push({ x: x, y: y });
    }
  }

  /** Открытый проём (без двери). */
  function gapAt(x, y) {
    WS.World.setTile(x, y, WS.World.T.DOORWAY);
  }

  /** Ряд окон по горизонтали. */
  function winRow(b, x0, x1, y, step) {
    for (var xx = x0; xx <= x1; xx += step) winAt(b, xx, y);
  }

  /** Ряд окон по вертикали. */
  function winCol(b, x, y0, y1, step) {
    for (var yy = y0; yy <= y1; yy += step) winAt(b, x, yy);
  }

  /** Вертикальная перегородка с проёмом на gapY. */
  function partV(wallT, x, y0, y1, gapY) {
    var W = WS.World;
    for (var yy = y0; yy <= y1; yy++) {
      if (yy === gapY) gapAt(x, yy);
      else W.setTile(x, yy, wallT);
    }
  }

  /** Горизонтальная перегородка с проёмом на gapX. */
  function partH(wallT, y, x0, x1, gapX) {
    var W = WS.World;
    for (var xx = x0; xx <= x1; xx++) {
      if (xx === gapX) gapAt(xx, y);
      else W.setTile(xx, y, wallT);
    }
  }

  /** Комната в метаданных (интерьеры расставят мебель по role). */
  function room(b, x, y, w, h, role) {
    b.rooms.push({ x: x, y: y, w: w, h: h, role: role });
  }

  /** Крыльцо перед дверью + тропинка (2-3 тайла). */
  function frontPath(b, dy) {
    var W = WS.World, T = W.T;
    if (!b.door.length) return;
    var d = b.door[0];
    var py = d.y + dy;
    if (W.inB(d.x, py) && isNatT(W.tileAt(d.x, py))) W.setTile(d.x, py, T.PORCH);
    for (var i = 2; i <= 3; i++) {
      var yy = d.y + dy * i;
      if (W.inB(d.x, yy) && isNatT(W.tileAt(d.x, yy))) W.setTile(d.x, yy, T.DIRT);
    }
  }

  /**
   * Можно ли поставить здание: границы, природные тайлы, отступ от воды
   * (waterMargin, у пилорамы 0), отсутствие соседей и резерваций.
   */
  function canPlace(x, y, w, h, opts) {
    var W = WS.World, T = W.T;
    opts = opts || {};
    var waterMargin = opts.waterMargin === undefined ? 1 : opts.waterMargin;
    if (x < 4 || y < 4 || x + w > 215 || y + h > 214) return false;

    // сам прямоугольник — только природа
    for (var yy = y; yy < y + h; yy++) {
      for (var xx = x; xx < x + w; xx++) {
        if (!isNatT(W.tileAt(xx, yy))) return false;
      }
    }
    // окружение (отступ 1): не стены/полы/мостки; вода — по waterMargin
    for (var ay = y - 1; ay <= y + h; ay++) {
      for (var ax = x - 1; ax <= x + w; ax++) {
        if (ax >= x && ax < x + w && ay >= y && ay < y + h) continue;
        var t = W.tileAt(ax, ay);
        if (t === T.WATER || t === T.VOID) {
          if (waterMargin > 0) return false;
        }
        if (isWallT(t) || t === T.WINDOW || t === T.DOOR || t === T.FLOOR_WOOD ||
            t === T.FLOOR_TILE || t === T.FLOOR_CONCRETE || t === T.FLOOR_DIRT ||
            t === T.BRIDGE || t === T.RAIL || t === T.FENCE || t === T.CRYPT ||
            t === T.STAIRS || t === T.FARMLAND) return false;
      }
    }
    // резервации (улицы, переулки, площадь, погост, прочие здания)
    var res = info().reserved;
    for (var i = 0; i < res.length; i++) {
      var r = res[i];
      if (x < r.x + r.w && x + w > r.x && y < r.y + r.h && y + h > r.y) return false;
    }
    return true;
  }

  // ==================================================================
  //  ЗДАНИЯ: 21 тип. Каждый строит внешние стены, окна, двери, перегородки
  //  и честно описывает комнаты для интерьерного модуля.
  // ==================================================================

  /** ИЗБА-ПЯТИСТЕНОК: сени + жилая, у больших — кухня и спальня. */
  function buildIzba(x, y, w, h, R) {
    var W = WS.World, T = W.T;
    var b = meta('izba', 'Изба', x, y, w, h, 'log');
    shell(x, y, w, h, T.WALL_LOG, T.FLOOR_WOOD);

    // сени (холодные) с запада
    var px = x + Math.max(2, Math.floor(w * 0.4));
    partV(T.WALL_LOG, px, y + 1, y + h - 2, y + Math.floor(h / 2));

    // дверь с юга — в сени
    var dx = x + 1 + R.int(0, Math.max(0, px - x - 2));
    doorAt(b, dx, y + h - 1);
    frontPath(b, 1);

    // окна: южная стена жилой части, северная, торцы
    winRow(b, px + 1, x + w - 2, y + h - 1, 2);
    winRow(b, x + 2, x + w - 3, y, 3);
    winCol(b, x + w - 1, y + 2, y + h - 3, 3);
    if (R.chance(0.6)) winCol(b, x, y + 2, y + h - 3, 3);

    // комнаты
    if (w >= 8) {
      // пятистенок: кухня (юг) и спальня (север)
      var py = y + Math.floor(h * 0.45);
      partH(T.WALL_LOG, py, px + 1, x + w - 2, px + 2);
      room(b, x + 1, y + 1, px - x - 1, h - 2, 'hall');
      room(b, px + 1, y + 1, x + w - px - 2, py - y - 1, 'bedroom');
      room(b, px + 1, py + 1, x + w - px - 2, y + h - py - 2, 'kitchen');
      b.stove = { x: px + 1, y: y + h - 2 };   // место печи (интерьеры)
    } else {
      room(b, x + 1, y + 1, px - x - 1, h - 2, 'hall');
      room(b, px + 1, y + 1, x + w - px - 2, h - 2, R.chance(0.5) ? 'kitchen' : 'living');
      b.stove = { x: px + 1, y: y + 1 };
    }
    return b;
  }

  /** БОГАТАЯ ИЗБА: 11x8, кирпичный фундамент, парадные комнаты. */
  function buildIzbaRich(x, y, w, h, R) {
    var W = WS.World, T = W.T;
    var brick = R.chance(0.4);
    var wallT = brick ? T.WALL_BRICK : T.WALL_WOOD;
    var b = meta('izba_rich', 'Дом лесопромышленника', x, y, w, h, brick ? 'brick' : 'wood');
    shell(x, y, w, h, wallT, T.FLOOR_TILE);

    // гравийная отмостка-фундамент по периметру
    for (var yy = y - 1; yy <= y + h; yy++) {
      for (var xx = x - 1; xx <= x + w; xx++) {
        if (W.inB(xx, yy) && isNatT(W.tileAt(xx, yy))) W.setTile(xx, yy, T.GRAVEL);
      }
    }

    // парадный юг: сени-прихожая, север: спальня и гостиная
    var py = y + Math.floor(h * 0.42);
    partH(wallT, py, x + 1, x + w - 2, x + Math.floor(w / 2));
    var px2 = x + Math.floor(w * 0.55);
    partV(wallT, px2, y + 1, py - 1, y + 2);

    // двери: парадная с юга и чёрная с севера
    var dx = x + 2 + R.int(0, Math.max(0, w - 6));
    doorAt(b, dx, y + h - 1);
    doorAt(b, x + w - 2, y);
    frontPath(b, 1);

    // окна частые, с выставочных фасадов
    winRow(b, x + 1, x + w - 2, y + h - 1, 2);
    winRow(b, x + 2, x + w - 3, y, 2);
    winCol(b, x, y + 2, y + h - 3, 2);
    winCol(b, x + w - 1, y + 2, y + h - 3, 2);

    room(b, x + 1, py + 1, w - 2, y + h - py - 2, 'hall');
    room(b, x + 1, y + 1, px2 - x - 1, py - y - 1, 'bedroom');
    room(b, px2 + 1, y + 1, x + w - px2 - 2, py - y - 1, 'living');
    if (w >= 11) {
      // кабинет при гостиной
      room(b, px2 + 1, y + 1, x + w - px2 - 2, Math.floor((py - y - 1) / 2), 'office');
    }
    b.stove = { x: x + w - 2, y: y + h - 2 };
    b.rich = true;
    return b;
  }

  /** АМБАР: высокий, без окон, широкие ворота. */
  function buildBarn(x, y, w, h, R) {
    var W = WS.World, T = W.T;
    var b = meta('barn', 'Амбар', x, y, w, h, 'wood');
    shell(x, y, w, h, T.WALL_WOOD, T.FLOOR_DIRT);

    // широкие ворота: два проёма в центре южной стены
    var cx = x + ((w / 2) | 0);
    gapAt(cx, y + h - 1);
    gapAt(cx + 1, y + h - 1);
    b.door.push({ x: cx, y: y + h - 1 }, { x: cx + 1, y: y + h - 1 });
    frontPath(b, 1);

    // редкое окошко-продух
    if (R.chance(0.4)) winAt(b, x + 1, y + 1);

    room(b, x + 1, y + 1, w - 2, h - 2, 'storage');
    b.loft = true;      // намёк интерьерам: чердак-подклет
    return b;
  }

  /** БАНЯ: маленькая, у реки; предбанник и парная. */
  function buildBanya(x, y, w, h, R) {
    var W = WS.World, T = W.T;
    var b = meta('banya', 'Баня', x, y, w, h, 'log');
    shell(x, y, w, h, T.WALL_LOG, T.FLOOR_WOOD);

    // дверь с севера (к улице), речка — с юга
    doorAt(b, x + 1 + R.int(0, Math.max(0, w - 3)), y);
    frontPath(b, -1);

    // предбанник (запад) и парная (восток)
    var px = x + Math.max(1, Math.floor(w * 0.4));
    partV(T.WALL_LOG, px, y + 1, y + h - 2, y + Math.floor(h / 2));
    winAt(b, x + w - 1, y + 1);   // крошечное оконце в парную

    room(b, x + 1, y + 1, px - x - 1, h - 2, 'hall');
    room(b, px + 1, y + 1, x + w - px - 2, h - 2, 'bath');
    b.stove = { x: px + 1, y: y + h - 2 };   // каменка
    return b;
  }

  /** ЦЕРКОВЬ: кирпичная, колоннада, алтарь, храмовый крест. */
  function buildChurch(x, y, w, h, R) {
    var W = WS.World, T = W.T;
    var b = meta('church', 'Церковь', x, y, w, h, 'brick');
    shell(x, y, w, h, T.WALL_BRICK, T.FLOOR_TILE);

    // колоннада вдоль южного фасада
    for (var xx = x; xx < x + w; xx++) {
      if (W.inB(xx, y + h) && isNatT(W.tileAt(xx, y + h))) W.setTile(xx, y + h, T.PORCH);
    }
    for (var cx = x + 1; cx <= x + w - 2; cx += 2) {
      W.setTile(cx, y + h, T.WALL_BRICK);   // колонны
    }

    // дверь в центральной оси
    var dx = x + ((w / 2) | 0);
    doorAt(b, dx, y + h - 1);
    frontPath(b, 1);

    // алтарная преграда с царскими вратами (два проёма)
    var ay = y + 3;
    partH(T.WALL_BRICK, ay, x + 1, dx - 2, -1);
    partH(T.WALL_BRICK, ay, dx + 2, x + w - 2, -1);
    gapAt(dx - 1, ay);
    gapAt(dx, ay);
    gapAt(dx + 1, ay);

    // арочные окна по всем стенам
    winRow(b, x + 1, x + w - 2, y + h - 1, 2);
    winRow(b, x + 2, x + w - 3, y, 2);
    winCol(b, x, y + 2, y + h - 3, 2);
    winCol(b, x + w - 1, y + 2, y + h - 3, 2);

    room(b, x + 1, y + 1, w - 2, ay - y - 1, 'altar');
    room(b, x + 1, ay + 1, w - 2, y + h - ay - 2, 'hall');
    b.bell = true;

    // храмовый крест над северным коньком
    W.addObject({
      x: x + w / 2, y: y + 0.3,
      sprName: 'cross_church', solid: false, shadow: false,
      name: 'Крест храмовый'
    });
    return b;
  }

  /** ЛАВКА ТОРГОВЦА: торговый зал, кладовая, конторка. */
  function buildStore(x, y, w, h, R) {
    var W = WS.World, T = W.T;
    var brick = R.chance(0.5);
    var wallT = brick ? T.WALL_BRICK : T.WALL_WOOD;
    var b = meta('store', 'Лавка', x, y, w, h, brick ? 'brick' : 'wood');
    shell(x, y, w, h, wallT, T.FLOOR_TILE);

    // прилавок: перегородка, отделяющая кладовую (север)
    var px = x + Math.floor(w * 0.6);
    partV(wallT, px, y + 1, y + h - 2, y + Math.floor(h / 2));

    doorAt(b, x + 2 + R.int(0, Math.max(0, w - 6)), y + h - 1);
    frontPath(b, 1);

    winRow(b, x + 1, x + w - 2, y + h - 1, 2);
    winCol(b, x + w - 1, y + 2, y + h - 3, 2);
    if (R.chance(0.7)) winAt(b, x + 1, y + 1);

    room(b, x + 1, y + 1, px - x - 1, h - 2, 'shop');
    room(b, px + 1, y + 1, x + w - px - 2, Math.floor((h - 2) / 2), 'office');
    room(b, px + 1, y + 2 + Math.floor((h - 2) / 2), x + w - px - 2, h - 3 - Math.floor((h - 2) / 2), 'storage');
    b.counter = { x: px - 1, y: y + h - 2 };
    return b;
  }

  /** СКЛАД: каменный, бетонный пол, двое ворот. */
  function buildWarehouse(x, y, w, h, R) {
    var W = WS.World, T = W.T;
    var b = meta('warehouse', 'Склад', x, y, w, h, 'stone');
    shell(x, y, w, h, T.WALL_STONE, T.FLOOR_CONCRETE);

    // ворота с юга и востока
    var cx = x + 2 + R.int(0, Math.max(0, w - 6));
    doorAt(b, cx, y + h - 1);
    doorAt(b, x + w - 1, y + 2 + R.int(0, Math.max(0, h - 6)));
    frontPath(b, 1);

    // редкие окна под потолком
    winRow(b, x + 2, x + w - 3, y, 4);
    winCol(b, x, y + 2, y + h - 3, 4);

    // внутренняя перегородка на две секции
    var px = x + Math.floor(w / 2);
    partV(T.WALL_STONE, px, y + 1, y + h - 2, y + Math.floor(h / 2));

    room(b, x + 1, y + 1, px - x - 1, h - 2, 'storage');
    room(b, px + 1, y + 1, x + w - px - 2, h - 2, 'storage');
    return b;
  }

  /** ВОКЗАЛ/ТЕЛЕГРАФ: зал ожидания + аппаратная. Рядом — точка старта! */
  function buildTelegraph(x, y, w, h, R) {
    var W = WS.World, T = W.T;
    var b = meta('telegraph', 'Вокзал (телеграф)', x, y, w, h, 'brick');
    shell(x, y, w, h, T.WALL_BRICK, T.FLOOR_TILE);

    // две двери на южный перрон
    doorAt(b, x + 3, y + h - 1);
    doorAt(b, x + w - 4, y + h - 1);
    frontPath(b, 1);

    // окна-витражи по южному фасаду
    winRow(b, x + 1, x + w - 2, y + h - 1, 2);
    winRow(b, x + 3, x + w - 4, y, 2);
    winCol(b, x, y + 2, y + h - 3, 2);
    winCol(b, x + w - 1, y + 2, y + h - 3, 2);

    // аппаратная в северной трети
    var py = y + Math.floor(h * 0.38);
    partH(T.WALL_BRICK, py, x + 1, x + w - 2, x + 2);

    room(b, x + 1, py + 1, w - 2, y + h - py - 2, 'hall');
    room(b, x + 1, y + 1, w - 2, py - y - 1, 'office');
    b.telegraph = true;
    return b;
  }

  /** ПИЛОРАМА: навес-цех у воды, открытый южный проезд. */
  function buildSawmill(x, y, w, h, R) {
    var W = WS.World, T = W.T;
    var b = meta('sawmill', 'Пилорама', x, y, w, h, 'wood');
    shell(x, y, w, h, T.WALL_WOOD, T.FLOOR_CONCRETE);

    // южная стена — колонны с открытыми проёмами (пилёный лес грузят к воде)
    for (var xx = x; xx < x + w; xx++) {
      W.setTile(xx, y + h - 1, (xx - x) % 3 === 0 ? T.WALL_WOOD : T.DOORWAY);
    }
    // конторка-столбление в восточном углу
    var px = x + w - 3;
    partV(T.WALL_WOOD, px, y + 1, y + h - 2, y + h - 3);
    doorAt(b, x + 1, y);   // вход с севера, со стороны улицы
    frontPath(b, -1);
    winAt(b, x + w - 1, y + 1);

    // опилки-подсыпка к воде
    for (var yy = y + h; yy <= y + h + 2; yy++) {
      for (var xx2 = x; xx2 < x + w; xx2++) {
        if (W.inB(xx2, yy) && isNatT(W.tileAt(xx2, yy))) W.setTile(xx2, yy, T.DIRT);
      }
    }

    room(b, x + 1, y + 1, px - x - 1, h - 2, 'workshop');
    room(b, px + 1, y + 1, w - (px - x) - 2, h - 2, 'office');
    b.saw = true;
    return b;
  }

  /** ЖИТНИЦА: дощатая, зерновые закрома. */
  function buildGranary(x, y, w, h, R) {
    var W = WS.World, T = W.T;
    var b = meta('granary', 'Житница', x, y, w, h, 'wood');
    shell(x, y, w, h, T.WALL_WOOD, T.FLOOR_WOOD);

    doorAt(b, x + 1 + R.int(0, Math.max(0, w - 3)), y + h - 1);
    frontPath(b, 1);
    if (R.chance(0.5)) winAt(b, x + 1, y + 1);

    // закрома: глухие короткие перегородки
    if (w >= 6) {
      partV(T.WALL_WOOD, x + 2, y + h - 4, y + h - 2, -1);
      partV(T.WALL_WOOD, x + w - 3, y + h - 4, y + h - 2, -1);
    }
    room(b, x + 1, y + 1, w - 2, h - 2, 'storage');
    b.grain = true;
    return b;
  }

  /** КОНЮШНЯ: стойла, сеновал над ними. */
  function buildStable(x, y, w, h, R) {
    var W = WS.World, T = W.T;
    var b = meta('stable', 'Конюшня', x, y, w, h, 'wood');
    shell(x, y, w, h, T.WALL_WOOD, T.FLOOR_DIRT);

    // широкий вход с юга
    var cx = x + ((w / 2) | 0);
    gapAt(cx, y + h - 1);
    b.door.push({ x: cx, y: y + h - 1 });
    frontPath(b, 1);

    // стойла: две короткие перегородки от северной стены
    partV(T.WALL_WOOD, x + 2, y + 1, y + Math.floor(h / 2), -1);
    partV(T.WALL_WOOD, x + w - 3, y + 1, y + Math.floor(h / 2), -1);

    winAt(b, x + w - 2, y + h - 2);

    room(b, x + 1, y + 1, 1, h - 2, 'storage');
    room(b, x + 3, y + 1, w - 6, h - 2, 'hall');
    room(b, x + w - 2, y + 1, 1, h - 2, 'storage');
    b.hay = true;
    return b;
  }

  /** КУЗНИЦА: каменная, горн у стены. */
  function buildSmithy(x, y, w, h, R) {
    var W = WS.World, T = W.T;
    var b = meta('smithy', 'Кузница', x, y, w, h, 'stone');
    shell(x, y, w, h, T.WALL_STONE, T.FLOOR_CONCRETE);

    doorAt(b, x + 2, y + h - 1);
    frontPath(b, 1);
    winAt(b, x + w - 2, y + h - 2);
    winAt(b, x + 1, y + 1);

    room(b, x + 1, y + 1, w - 2, h - 2, 'workshop');
    b.forge = { x: x + w - 2, y: y + 1 };   // горн — интерьеры поставят
    b.anvil = { x: x + 2, y: y + h - 3 };
    return b;
  }

  /** ФЛИГЕЛЬ ВРАЧА: приёмная и жилая половина. */
  function buildDoctor(x, y, w, h, R) {
    var W = WS.World, T = W.T;
    var b = meta('doctor', 'Флигель врача', x, y, w, h, 'wood');
    shell(x, y, w, h, T.WALL_WOOD, T.FLOOR_TILE);

    var py = y + Math.floor(h * 0.5);
    partH(T.WALL_WOOD, py, x + 1, x + w - 2, x + 2);

    doorAt(b, x + 2 + R.int(0, Math.max(0, w - 6)), y + h - 1);
    frontPath(b, 1);

    winRow(b, x + 1, x + w - 2, y + h - 1, 2);
    winRow(b, x + 2, x + w - 3, y, 3);
    winCol(b, x + w - 1, y + 2, y + h - 3, 3);

    room(b, x + 1, py + 1, w - 2, y + h - py - 2, 'hall');
    room(b, x + 1, y + 1, Math.floor((w - 2) / 2), py - y - 1, 'office');
    room(b, x + 1 + Math.floor((w - 2) / 2), y + 1, w - 3 - Math.floor((w - 2) / 2), py - y - 1, 'living');
    return b;
  }

  /** ШКОЛА: класс и учительская. */
  function buildSchool(x, y, w, h, R) {
    var W = WS.World, T = W.T;
    var b = meta('school', 'Школа', x, y, w, h, 'brick');
    shell(x, y, w, h, T.WALL_BRICK, T.FLOOR_TILE);

    var py = y + Math.floor(h * 0.42);
    partH(T.WALL_BRICK, py, x + 1, x + w - 2, x + 3);

    doorAt(b, x + ((w / 2) | 0), y + h - 1);
    frontPath(b, 1);

    winRow(b, x + 1, x + w - 2, y + h - 1, 2);
    winRow(b, x + 2, x + w - 3, y, 2);
    winCol(b, x, y + 2, y + h - 3, 2);
    winCol(b, x + w - 1, y + 2, y + h - 3, 2);

    room(b, x + 1, py + 1, w - 2, y + h - py - 2, 'hall');
    room(b, x + 1, y + 1, w - 4, py - y - 1, 'school');
    room(b, x + w - 3, y + 1, 2, py - y - 1, 'office');
    return b;
  }

  /** ТРАКТИР: зал, кухня, подклет. */
  function buildTavern(x, y, w, h, R) {
    var W = WS.World, T = W.T;
    var b = meta('tavern', 'Трактир', x, y, w, h, 'wood');
    shell(x, y, w, h, T.WALL_WOOD, T.FLOOR_WOOD);

    var py = y + Math.floor(h * 0.45);
    partH(T.WALL_WOOD, py, x + 1, x + w - 2, x + Math.floor(w / 2));

    // парадная дверь и чёрная
    doorAt(b, x + 2 + R.int(0, Math.max(0, w - 6)), y + h - 1);
    doorAt(b, x + w - 2, y);
    frontPath(b, 1);

    winRow(b, x + 1, x + w - 2, y + h - 1, 2);
    winCol(b, x, y + 2, y + h - 3, 3);

    room(b, x + 1, py + 1, w - 2, y + h - py - 2, 'hall');
    room(b, x + 1, y + 1, Math.floor((w - 2) / 2), py - y - 1, 'kitchen');
    room(b, x + 1 + Math.floor((w - 2) / 2), y + 1, w - 3 - Math.floor((w - 2) / 2), py - y - 1, 'storage');
    b.cellar = true;      // намёк: подвал со припасами
    return b;
  }

  /** ОКОЛОТОК: контора и камера. */
  function buildJail(x, y, w, h, R) {
    var W = WS.World, T = W.T;
    var b = meta('jail', 'Околоток', x, y, w, h, 'stone');
    shell(x, y, w, h, T.WALL_STONE, T.FLOOR_CONCRETE);

    var py = y + Math.floor(h * 0.5);
    partH(T.WALL_STONE, py, x + 1, x + w - 2, x + 2);

    doorAt(b, x + 2, y + h - 1);
    frontPath(b, 1);
    winAt(b, x + w - 2, y + h - 2);

    room(b, x + 1, py + 1, w - 2, y + h - py - 2, 'office');
    room(b, x + 1, y + 1, w - 2, py - y - 1, 'cell');
    return b;
  }

  /** ДОЗОРНАЯ ВЫШКА: 3x3, флагшток. */
  function buildGuardtower(x, y, w, h, R) {
    var W = WS.World, T = W.T;
    var b = meta('guardtower', 'Дозорная вышка', x, y, w, h, 'stone');
    shell(x, y, w, h, T.WALL_STONE, T.FLOOR_WOOD);

    doorAt(b, x + 1, y + h - 1);
    winAt(b, x + 1, y);              // бойница на север
    winAt(b, x, y + 1);              // запад
    winAt(b, x + w - 1, y + 1);      // восток

    room(b, x + 1, y + 1, 1, 1, 'hall');
    // флаг на мачте по центру
    W.addObject({
      x: x + 1.5, y: y + 1.5,
      sprName: 'flagpole', solid: false, shadow: false,
      name: 'Флагшток'
    });
    return b;
  }

  /** РЫБАЧЬЯ ИЗБУШКА: 4x4 у воды, снасти. */
  function buildFishingHut(x, y, w, h, R) {
    var W = WS.World, T = W.T;
    var b = meta('fishing_hut', 'Рыбацкая избушка', x, y, w, h, 'log');
    shell(x, y, w, h, T.WALL_LOG, T.FLOOR_WOOD);

    doorAt(b, x + 1 + R.int(0, Math.max(0, w - 3)), y);   // дверь к улице
    frontPath(b, -1);
    winAt(b, x + w - 1, y + h - 2);   // окошко к воде

    room(b, x + 1, y + 1, w - 2, h - 2, 'storage');
    b.nets = true;
    return b;
  }

  /** ДАЧА: веранда, светлые комнаты. */
  function buildDacha(x, y, w, h, R) {
    var W = WS.World, T = W.T;
    var b = meta('dacha', 'Дача', x, y, w, h, 'wood');
    shell(x, y, w, h, T.WALL_WOOD, T.FLOOR_WOOD);

    // веранда вдоль южного фасада
    for (var xx = x + 1; xx < x + w - 1; xx++) {
      if (W.inB(xx, y + h) && isNatT(W.tileAt(xx, y + h))) W.setTile(xx, y + h, T.PORCH);
    }

    var py = y + Math.floor(h * 0.45);
    partH(T.WALL_WOOD, py, x + 1, x + w - 2, x + Math.floor(w / 2));

    doorAt(b, x + ((w / 2) | 0), y + h - 1);
    frontPath(b, 1);

    winRow(b, x + 1, x + w - 2, y + h - 1, 2);
    winRow(b, x + 3, x + w - 4, y, 2);
    winCol(b, x, y + 2, y + h - 3, 2);
    winCol(b, x + w - 1, y + 2, y + h - 3, 2);

    room(b, x + 1, py + 1, w - 2, y + h - py - 2, 'hall');
    room(b, x + 1, y + 1, Math.floor((w - 2) / 2), py - y - 1, 'bedroom');
    room(b, x + 1 + Math.floor((w - 2) / 2), y + 1, w - 3 - Math.floor((w - 2) / 2), py - y - 1, 'living');
    return b;
  }

  /** ПОГРЕБ: полуземляной, без окон. */
  function buildCellar(x, y, w, h, R) {
    var W = WS.World, T = W.T;
    var b = meta('cellar', 'Погреб', x, y, w, h, 'wood');
    shell(x, y, w, h, T.WALL_WOOD, T.FLOOR_DIRT);

    doorAt(b, x + 1, y + h - 1);
    frontPath(b, 1);

    // земляной бугроватый вал вокруг
    for (var yy = y - 1; yy <= y + h; yy++) {
      for (var xx = x - 1; xx <= x + w; xx++) {
        if (!W.inB(xx, yy)) continue;
        if (!isNatT(W.tileAt(xx, yy))) continue;
        W.setTile(xx, yy, WS.RNG.hash2(xx, yy, info().seed + 71) < 0.4 ? T.MUD : T.DIRT);
      }
    }
    room(b, x + 1, y + 1, w - 2, h - 2, 'cell');
    b.cold = true;
    return b;
  }

  /** ПОГОРЕЛИЩЕ: обугленный остов без крыши, внутри мусор. */
  function buildRuined(x, y, w, h, R) {
    var W = WS.World, T = W.T;
    var b = meta('ruined', 'Погорелый дом', x, y, w, h, 'wood');
    W.carve(x, y, w, h, T.FLOOR_DIRT);

    // остатки стен с прогарами (около трети периметра отсутствует)
    function ruinedWall(xx, yy) {
      if (R.f() < 0.62) W.setTile(xx, yy, T.WALL_WOOD);
      else if (R.f() < 0.75) W.setTile(xx, yy, T.MUD);   // обугленная труха
    }
    for (var xx = x; xx < x + w; xx++) {
      ruinedWall(xx, y);
      ruinedWall(xx, y + h - 1);
    }
    for (var yy = y; yy < y + h; yy++) {
      ruinedWall(x, yy);
      ruinedWall(x + w - 1, yy);
    }
    // редкое уцелевшее окно
    if (R.chance(0.3)) winAt(b, x + 2, y + h - 1);
    // вход-пролом
    var dx = x + 1 + R.int(0, Math.max(0, w - 3));
    gapAt(dx, y + h - 1);
    b.door.push({ x: dx, y: y + h - 1 });

    // зола и снег внутри
    for (var iy = y + 1; iy < y + h - 1; iy++) {
      for (var ix = x + 1; ix < x + w - 1; ix++) {
        var r = WS.RNG.hash2(ix, iy, info().seed + 73);
        if (r < 0.2) W.setTile(ix, iy, T.MUD);
        else if (r > 0.85) W.setTile(ix, iy, T.SNOW);
      }
    }
    // мусор-головни
    var n = R.int(3, 5);
    for (var d = 0; d < n; d++) {
      var ox = x + 1 + R.int(0, w - 3), oy = y + 1 + R.int(0, h - 3);
      W.addObject({
        x: ox + 0.5, y: oy + 0.5, sprName: 'debris',
        sprFrame: R.int(0, 1), solid: false, name: 'Обломки'
      });
    }
    room(b, x + 1, y + 1, w - 2, h - 2, 'storage');
    b.burnt = true;
    return b;
  }

  // ==================================================================
  //  РЕЕСТР ТИПОВ: размеры, вес в лотерее, опции размещения
  // ==================================================================
  var TYPES = {
    izba:       { fn: buildIzba, w0: 7, w1: 9, h0: 5, h1: 7, wt: 10 },
    izba_rich:  { fn: buildIzbaRich, w0: 10, w1: 12, h0: 7, h1: 8, wt: 2 },
    dacha:      { fn: buildDacha, w0: 7, w1: 9, h0: 5, h1: 7, wt: 3 },
    barn:       { fn: buildBarn, w0: 7, w1: 9, h0: 5, h1: 7, wt: 7 },
    granary:    { fn: buildGranary, w0: 5, w1: 7, h0: 5, h1: 6, wt: 4 },
    stable:     { fn: buildStable, w0: 7, w1: 9, h0: 5, h1: 7, wt: 2 },
    smithy:     { fn: buildSmithy, w0: 6, w1: 7, h0: 5, h1: 6, wt: 2 },
    doctor:     { fn: buildDoctor, w0: 7, w1: 9, h0: 5, h1: 7, wt: 2 },
    school:     { fn: buildSchool, w0: 8, w1: 10, h0: 6, h1: 8, wt: 1 },
    jail:       { fn: buildJail, w0: 6, w1: 6, h0: 5, h1: 5, wt: 1 },
    tavern:     { fn: buildTavern, w0: 9, w1: 11, h0: 6, h1: 8, wt: 2 },
    cellar:     { fn: buildCellar, w0: 4, w1: 4, h0: 4, h1: 4, wt: 4 },
    ruined:     { fn: buildRuined, w0: 6, w1: 9, h0: 5, h1: 7, wt: 4 },
    warehouse:  { fn: buildWarehouse, w0: 11, w1: 13, h0: 7, h1: 8, wt: 2, opts: { waterMargin: 0 } },
    sawmill:    { fn: buildSawmill, w0: 9, w1: 11, h0: 7, h1: 8, wt: 2, opts: { waterMargin: 0 } },
    banya:      { fn: buildBanya, w0: 5, w1: 5, h0: 4, h1: 4, wt: 3 },
    fishing_hut:{ fn: buildFishingHut, w0: 4, w1: 4, h0: 4, h1: 4, wt: 2 },
    guardtower: { fn: buildGuardtower, w0: 3, w1: 3, h0: 3, h1: 3, wt: 1 }
  };

  /**
   * Ряд застройки: слева направо, зазоры 3-5 тайлов, мимо резерваций
   * (улиц, переулков, площади) — с «протаскиванием» по одному тайлу.
   */
  function placeBand(yBot, x0, x1, manifest, R, maxN) {
    var placed = 0;
    var x = x0;
    var guard = 0;
    while (x < x1 - 4 && placed < maxN && guard < 600) {
      guard++;
      var pick = R.weighted(manifest);
      var ty = TYPES[pick.key];
      var w = R.int(ty.w0, ty.w1);
      var h = R.int(ty.h0, ty.h1);
      if (x + w > x1) { w = ty.w0; h = ty.h0; }
      if (x + w > x1) break;
      var y = yBot - h + 1;
      if (y < 6) break;
      if (canPlace(x, y, w, h, ty.opts || {})) {
        ty.fn(x, y, w, h, R);
        reserve(x - 1, y - 1, w + 2, h + 2);
        placed++;
        x += w + R.int(3, 5);
      } else {
        x += 1;   // протаскиваем мимо препятствия
      }
    }
    return placed;
  }

  /** Точечная установка с протаскиванием по берегу (для промзоны). */
  function placeExplicit(key, x0, y, R, maxSlide) {
    var ty = TYPES[key];
    for (var d = 0; d <= (maxSlide || 14); d += 2) {
      if (canPlace(x0 + d, y, ty.w1, ty.h1, ty.opts || {})) {
        ty.fn(x0 + d, y, ty.w1, ty.h1, R);
        reserve(x0 + d - 1, y - 1, ty.w1 + 2, ty.h1 + 2);
        return true;
      }
      if (canPlace(x0 + d, y, ty.w0, ty.h0, ty.opts || {})) {
        ty.fn(x0 + d, y, ty.w0, ty.h0, R);
        reserve(x0 + d - 1, y - 1, ty.w0 + 2, ty.h0 + 2);
        return true;
      }
    }
    return false;
  }

  // ==================================================================
  //  ОСОБЫЕ ЗОНЫ: площадь, погост, вокзал, мостки, рельсы, столбы
  // ==================================================================

  /** Соборная площадь: гравий, колодец, сани, бочки. */
  function plaza(R) {
    var W = WS.World, T = W.T;
    W.carve(98, 128, 37, 15, T.GRAVEL);
    // наметённые сугробы по краям площади
    for (var i = 0; i < 14; i++) {
      var xx = 98 + R.int(0, 36), yy = 128 + R.int(0, 14);
      if (R.chance(0.5)) W.setTile(xx, yy, T.SNOW_DEEP);
    }
    W.addObject({ x: 114.5, y: 134.5, sprName: 'well', solid: true, name: 'Колодец' });
    W.addObject({ x: 103.5, y: 131.5, sprName: 'sled', sprFrame: 0, solid: true, name: 'Сани' });
    W.addObject({ x: 126.5, y: 138.5, sprName: 'barrel', sprFrame: 1, solid: true, name: 'Бочка' });
    W.addObject({ x: 124.5, y: 130.5, sprName: 'crate', sprFrame: 0, solid: true, name: 'Ящик' });
    reserve(97, 127, 39, 17);
  }

  /** Погост у церкви: ограда, кресты, два склепа, тропинка. */
  function cemetery(R) {
    var W = WS.World, T = W.T;
    var x0 = 144, y0 = 99, x1 = 173, y1 = 113;

    // ограда с воротами на юге
    var gates = [{ x: x0 + 8, y: y1, w: 3, h: 1 }];
    WS.GenTerrain.fenceRect(x0, y0, x1 - x0 + 1, y1 - y0 + 1, R, gates);

    // кресты — небрежной сеткой
    var n = R.int(12, 17);
    for (var i = 0; i < n; i++) {
      var xx = x0 + 2 + R.int(0, x1 - x0 - 4);
      var yy = y0 + 2 + R.int(0, y1 - y0 - 4);
      if (!isNatT(W.tileAt(xx, yy))) continue;
      if (W.objsAt(xx, yy).length) continue;
      W.addObject({
        x: xx + 0.5, y: yy + 0.5,
        sprName: 'cross_grave', sprFrame: R.int(0, 1),
        solid: true, name: 'Могильный крест'
      });
    }
    // два каменных склепа
    W.carve(148, 102, 2, 2, T.CRYPT);
    W.carve(166, 106, 2, 2, T.CRYPT);

    // тропа от ворот к улице
    for (var yy2 = y1; yy2 <= 142; yy2++) {
      for (var gx = 156; gx <= 158; gx++) {
        if (isNatT(W.tileAt(gx, yy2))) W.setTile(gx, yy2, T.DIRT);
      }
    }
    reserve(x0 - 1, y0 - 1, x1 - x0 + 3, y1 - y0 + 3);
  }

  /** Вокзальная станция: перрон и точка старта. */
  function telegraphStation(R) {
    var W = WS.World, T = W.T;
    var b = buildTelegraph(30, 135, 10, 8, R);
    // перрон вдоль южного фасада
    for (var xx = 29; xx <= 41; xx++) {
      if (isNatT(W.tileAt(xx, 143))) W.setTile(xx, 143, T.PORCH);
    }
    // тачанка снега? — нет: вот фонарный столб и скамейный ящик
    W.addObject({ x: 42.5, y: 143.5, sprName: 'crate', sprFrame: 1, solid: true, name: 'Багажный ящик' });
    reserve(28, 134, 14, 11);
    // точка появления игрока — у главного входа
    if (b.door.length) {
      info().spawn = { x: b.door[0].x + 0.5, y: 144.5 };
    }
  }

  /** Мостки-пристань: настил BRIDGE на сваях, лодка рядом. */
  function pier(px, R) {
    var W = WS.World, T = W.T;
    var river = info().river;
    var y0 = river.top[px] - 2;         // начинаемся на берегу
    var len = R.int(4, 6);             // и уходим в воду
    for (var xx = px; xx <= px + 1; xx++) {
      for (var yy = y0; yy <= y0 + len; yy++) {
        W.setTile(xx, yy, T.BRIDGE);
      }
    }
    // лодка, вмёрзшая у мостков
    if (R.chance(0.7)) {
      W.addObject({
        x: px + 2.9, y: y0 + len - 0.5,
        sprName: 'boat', solid: false, name: 'Лодка'
      });
    }
  }

  /** Рельсовый тупик к вокзалу (заброшенная ветка). */
  function rails(R) {
    var W = WS.World, T = W.T;
    W.carve(12, 149, 38, 5, T.GRAVEL);   // полотно
    W.carve(14, 151, 32, 1, T.RAIL);
    W.carve(14, 152, 32, 1, T.RAIL);
    // стрелочный ящик и бочка у полотна
    W.addObject({ x: 47.5, y: 154.5, sprName: 'crate', sprFrame: 0, solid: true, name: 'Ящик' });
    W.addObject({ x: 13.5, y: 154.5, sprName: 'barrel', sprFrame: 0, solid: true, name: 'Бочка' });
    reserve(11, 148, 40, 7);
  }

  /** Телеграфные столбы в черте посёлка (южная сторона улицы). */
  function polesInTown(R) {
    var W = WS.World;
    for (var x = 28; x <= 190; x += 9) {
      W.addObject({
        x: x + 0.5, y: 149.5,
        sprName: 'telegraph_pole', solid: true,
        name: 'Телеграфный столб'
      });
    }
  }

  // ==================================================================
  //  ДВОРЫ: заборы и хозяйственные предметы по типам зданий
  // ==================================================================

  /** Найти свободный природный тайл у здания с заданной стороны. */
  function findSpotDir(b, R, dir) {
    var W = WS.World;
    for (var t = 0; t < 14; t++) {
      var xx = b.x + R.int(-2, b.w + 1);
      var yy;
      if (dir === 's') yy = b.y + b.h + R.int(0, 2);
      else if (dir === 'n') yy = b.y - R.int(0, 2);
      else if (dir === 'e') { xx = b.x + b.w + R.int(0, 2); yy = b.y + R.int(0, b.h - 1); }
      else { xx = b.x - R.int(0, 2); yy = b.y + R.int(0, b.h - 1); }
      if (!W.inB(xx, yy)) continue;
      if (!isNatT(W.tileAt(xx, yy))) continue;
      if (W.isTileBlocked(xx, yy)) continue;
      if (W.objsAt(xx, yy).length) continue;
      return { x: xx, y: yy };
    }
    return null;
  }

  /** Поставить предмет у здания. */
  function prop(b, R, sprName, name, dir, opts) {
    var s = findSpotDir(b, R, dir);
    if (!s) return null;
    opts = opts || {};
    var o = {
      x: s.x + 0.5, y: s.y + 0.5,
      sprName: sprName,
      solid: opts.solid === undefined ? true : opts.solid,
      name: name
    };
    if (opts.frame !== undefined) o.sprFrame = opts.frame;
    if (opts.shadow === false) o.shadow = false;
    return WS.World.addObject(o);
  }

  /** Забор вокруг участка с воротами напротив двери. */
  function fenceYard(b, R) {
    var d = b.door[0] || { x: b.x + 1, y: b.y + b.h - 1 };
    var x0 = b.x - 3, y0 = b.y - 3, w = b.w + 6, h = b.h + 6;
    var gates = [{ x: d.x - 1, y: y0 + h - 1, w: 3, h: 1 }];
    WS.GenTerrain.fenceRect(x0, y0, w, h, R, gates);
  }

  /** Сугробы у южных стен (наметает за зиму). */
  function drifts(b, R) {
    var W = WS.World, T = W.T;
    for (var xx = b.x; xx < b.x + b.w; xx++) {
      var yy = b.y + b.h;
      if (W.inB(xx, yy) && isNatT(W.tileAt(xx, yy)) && R.chance(0.3)) {
        W.setTile(xx, yy, T.SNOW_DEEP);
      }
    }
  }

  /** Дворы: по каждому зданию — хозяйство по типу. */
  function yards(R) {
    var W = WS.World;
    var bs = W.buildings;
    for (var i = 0; i < bs.length; i++) {
      var b = bs[i];
      drifts(b, R);
      switch (b.type) {
        case 'izba':
          if (R.chance(0.45)) fenceYard(b, R);
          if (R.chance(0.28)) prop(b, R, 'well', 'Колодец', 'e');
          if (R.chance(0.55)) prop(b, R, 'woodpile', 'Поленница', 'w', { frame: R.int(0, 1) });
          if (R.chance(0.35)) prop(b, R, 'cabbage_pit', 'Капустная яма', 'n');
          if (R.chance(0.15)) prop(b, R, 'sled', 'Сани', 's', { frame: R.int(0, 1) });
          if (R.chance(0.2)) prop(b, R, 'sawhorse', 'Дровяная козлина', 'w');
          break;
        case 'izba_rich':
          if (R.chance(0.8)) fenceYard(b, R);
          if (R.chance(0.5)) prop(b, R, 'well', 'Колодец', 'e');
          prop(b, R, 'woodpile', 'Поленница', 'w', { frame: R.int(0, 1) });
          if (R.chance(0.5)) prop(b, R, 'sled', 'Сани', 's', { frame: R.int(0, 1) });
          if (R.chance(0.4)) prop(b, R, 'barrel', 'Бочка', 's', { frame: R.int(0, 1) });
          break;
        case 'dacha':
          if (R.chance(0.4)) fenceYard(b, R);
          if (R.chance(0.5)) prop(b, R, 'woodpile', 'Поленница', 'w', { frame: R.int(0, 1) });
          if (R.chance(0.3)) prop(b, R, 'sled', 'Сани', 's', { frame: R.int(0, 1) });
          break;
        case 'barn':
          if (R.chance(0.8)) prop(b, R, 'haystack', 'Стог сена', 's', { frame: R.int(0, 1) });
          if (R.chance(0.6)) prop(b, R, 'haystack', 'Стог сена', 'e', { frame: R.int(0, 1) });
          if (R.chance(0.4)) prop(b, R, 'cart', 'Телега', 'w');
          if (R.chance(0.5)) prop(b, R, 'woodpile', 'Поленница', 's', { frame: R.int(0, 1) });
          break;
        case 'stable':
          prop(b, R, 'haystack', 'Стог сена', 's', { frame: R.int(0, 1) });
          if (R.chance(0.7)) prop(b, R, 'cart', 'Телега', 's');
          if (R.chance(0.6)) prop(b, R, 'haystack', 'Стог сена', 'e', { frame: R.int(0, 1) });
          break;
        case 'granary':
          if (R.chance(0.6)) prop(b, R, 'haystack', 'Стог сена', 'w', { frame: R.int(0, 1) });
          if (R.chance(0.5)) prop(b, R, 'crate', 'Ящик', 's', { frame: R.int(0, 1) });
          break;
        case 'smithy':
          if (R.chance(0.5)) prop(b, R, 'barrel', 'Бочка', 'e', { frame: R.int(0, 1) });
          if (R.chance(0.6)) prop(b, R, 'woodpile', 'Поленница', 'w', { frame: 0 });
          break;
        case 'store':
          prop(b, R, 'crate', 'Ящик', 's', { frame: 0 });
          prop(b, R, 'crate', 'Ящик', 's', { frame: 1 });
          if (R.chance(0.7)) prop(b, R, 'barrel', 'Бочка', 'e', { frame: R.int(0, 1) });
          break;
        case 'tavern':
          prop(b, R, 'barrel', 'Бочка', 's', { frame: 0 });
          prop(b, R, 'barrel', 'Бочка', 's', { frame: 1 });
          if (R.chance(0.4)) prop(b, R, 'sled', 'Сани', 'e', { frame: R.int(0, 1) });
          break;
        case 'warehouse':
          prop(b, R, 'crate', 'Ящик', 'n', { frame: R.int(0, 1) });
          prop(b, R, 'crate', 'Ящик', 'n', { frame: R.int(0, 1) });
          if (R.chance(0.7)) prop(b, R, 'barrel', 'Бочка', 'n', { frame: R.int(0, 1) });
          break;
        case 'sawmill':
          prop(b, R, 'log_pile', 'Штабель брёвен', 'w');
          prop(b, R, 'log_pile', 'Штабель брёвен', 'n');
          if (R.chance(0.7)) prop(b, R, 'log_pile', 'Штабель брёвен', 'e');
          if (R.chance(0.5)) prop(b, R, 'sawhorse', 'Дровяная козлина', 'n');
          break;
        case 'fishing_hut':
          prop(b, R, 'fish_rack', 'Сушило для рыбы', 'e');
          if (R.chance(0.5)) prop(b, R, 'fish_rack', 'Сушило для рыбы', 'w');
          break;
        case 'banya':
          if (R.chance(0.7)) prop(b, R, 'woodpile', 'Поленница', 'w', { frame: R.int(0, 1) });
          break;
        case 'ruined':
          // мусор уже насыпан внутри, добавим снаружи
          prop(b, R, 'debris', 'Обломки', 's', { solid: false, frame: R.int(0, 1) });
          if (R.chance(0.5)) prop(b, R, 'debris', 'Обломки', 'e', { solid: false, frame: R.int(0, 1) });
          break;
        case 'cellar':
          if (R.chance(0.5)) prop(b, R, 'sled', 'Сани', 's', { frame: R.int(0, 1) });
          break;
        case 'doctor':
          if (R.chance(0.5)) prop(b, R, 'sled', 'Сани', 's', { frame: R.int(0, 1) });
          if (R.chance(0.5)) prop(b, R, 'woodpile', 'Поленница', 'w', { frame: 0 });
          break;
        default:
          break;
      }
    }
  }

  // ==================================================================
  //  ПЛАН ПОСЁЛКА: манифесты рядов и сборка
  // ==================================================================

  // Лицевой ряд вдоль улицы — парадные дома.
  var M_ROW1 = [
    { key: 'izba', w: 10 }, { key: 'izba_rich', w: 3 }, { key: 'dacha', w: 3 },
    { key: 'doctor', w: 2 }, { key: 'school', w: 1 }, { key: 'jail', w: 1 }
  ];
  // Второй ряд — жильё и хозяйство.
  var M_ROW2 = [
    { key: 'izba', w: 8 }, { key: 'barn', w: 6 }, { key: 'smithy', w: 2 },
    { key: 'granary', w: 3 }, { key: 'stable', w: 2 }, { key: 'cellar', w: 2 },
    { key: 'izba_rich', w: 1 }
  ];
  // Третий ряд — дворы, житницы, погорелицы.
  var M_ROW3 = [
    { key: 'izba', w: 7 }, { key: 'barn', w: 4 }, { key: 'ruined', w: 3 },
    { key: 'granary', w: 2 }, { key: 'cellar', w: 3 }, { key: 'dacha', w: 1 }
  ];
  // Четвёртый ряд (край, к лесу) — амбары и мелочь.
  var M_ROW4 = [
    { key: 'barn', w: 5 }, { key: 'izba', w: 3 }, { key: 'ruined', w: 2 },
    { key: 'granary', w: 2 }, { key: 'cellar', w: 2 }
  ];

  /**
   * Сборка посёлка. Порядок: каркас (площадь, церковь, погост, вокзал,
   * лавка, трактир) → четыре ряда застройки → берег (промзона, бани,
   * избушки, мостки) → вышки → рельсы → столбы → дворы.
   */
  function town(R) {
    var W = WS.World;
    bCount = 0;

    // 1) каркас посёлка
    plaza(R);
    buildChurch(102, 114, 13, 10, R);
    reserve(101, 113, 15, 13);
    cemetery(R);
    telegraphStation(R);
    buildStore(82, 136, 9, 7, R);
    reserve(81, 135, 11, 9);
    buildTavern(138, 136, 10, 7, R);
    reserve(137, 135, 12, 9);

    // 2) рядовая застройка (низ ряда = южная стена)
    placeBand(142, 26, 194, M_ROW1, R, 6);
    placeBand(129, 26, 194, M_ROW2, R, 6);
    placeBand(116, 26, 194, M_ROW3, R, 5);
    placeBand(103, 26, 194, M_ROW4, R, 4);

    // 3) берег: пилорама, склад, бани, рыбачьи избушки
    placeExplicit('sawmill', 56, 150, R, 10);
    placeExplicit('banya', 76, 150, R, 8);
    placeExplicit('warehouse', 84, 150, R, 10);
    placeExplicit('fishing_hut', 98, 150, R, 6);
    placeExplicit('banya', 108, 150, R, 8);
    placeExplicit('banya', 126, 150, R, 8);
    placeExplicit('warehouse', 144, 150, R, 8);
    placeExplicit('fishing_hut', 162, 150, R, 8);

    // 4) дозорные вышки на краях посёлка
    buildGuardtower(24, 97, 3, 3, R);
    reserve(23, 96, 5, 5);
    buildGuardtower(190, 97, 3, 3, R);
    reserve(189, 96, 5, 5);

    // 5) рельсовый тупик и телеграфные столбы
    rails(R);
    polesInTown(R);

    // 6) мостки-пристань у воды
    pier(70, R);
    pier(152, R);

    // 7) дворы: заборы, колодцы, поленницы, сани, бочки...
    yards(R);

    // 8) точка появления игрока — у вокзала
    if (info().spawn) {
      W.spawnPoint = { x: info().spawn.x, y: info().spawn.y };
    }
    WS.log('Посёлок «Пристань-Тихая»: зданий ' + W.buildings.length +
           ', объектов ' + W.objects.length);
  }

  WS.def('GenTown', { town: town });
})();
