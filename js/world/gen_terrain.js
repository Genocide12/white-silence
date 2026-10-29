/**
 * ГЕНЕРАЦИЯ МИРА, ЧАСТЬ 1: РЕЛЬЕФ, РЕКА, ДОРОГИ, ЛЕС.
 * Снежная равнина 220x220 с травяными пятнами и сугробами, река с ледяными
 * кромками и прорубями, пруды, поля за рекой, дороги (тракт, переулки,
 * лесная дорога), просеки и лес (гуще на севере).
 * Спрайты деревьев и природы регистрируются ПРИ ЗАГРУЗКЕ через WS.Spr.def
 * (только регистрация — отрисовка ленивая, при первом запросе).
 * Связь: gen.js вызывает GenTerrain.terrain/roads/forest; gen_town.js читает
 * GenTerrain.info() (геометрия реки, улиц, резервации) и GenTerrain.fenceRect.
 */
(function () {
  'use strict';

  // ==================================================================
  //  ПРИМИТИВЫ ПИКСЕЛЬ-АРТА — логическая сетка, 1 ед. = 2 пикселя
  //  (стиль: крупные «пиксели», приглушённые холодные тона Русского Севера)
  // ==================================================================

  /** Прямоугольник в логических координатах. */
  function R2(c, x, y, w, h, col) {
    c.fillStyle = col;
    c.fillRect(x * 2, y * 2, w * 2, h * 2);
  }

  /** Эллипс в логических координатах. */
  function E2(c, x, y, rx, ry, col) {
    c.fillStyle = col;
    c.beginPath();
    c.ellipse(x * 2, y * 2, rx * 2, ry * 2, 0, 0, Math.PI * 2);
    c.fill();
  }

  /** Одиночный «жирный» пиксель 2x2. */
  function D2(c, x, y, col) {
    c.fillStyle = col;
    c.fillRect(x * 2, y * 2, 2, 2);
  }

  // Оттенки сверх палитры WS.Spr.pal — для пород дерева и сухой травы.
  var COL = {
    birchBark: '#d8d4c8',   // берёзовая кора
    birchLit: '#efece2',    // освещённая грань коры
    birchDash: '#332f28',   // чёрные штрихи коры
    deadWood: '#5a5344',    // сухостой
    deadDark: '#423d31',
    straw: '#a89a7c',        // сухая трава, солома
    strawDark: '#8a7d62',
    reedHead: '#6e5f45',     // метёлки камыша
    charDark: '#26221e',     // обугленное
    charMid: '#38332c'
  };

  /** Ветка берёзы: диагональная лесенка с боковым отростком и снегом. */
  function branchBirch(c, x, y, dx, dy, len, f) {
    var pal = WS.Spr.pal;
    var cx = x, cy = y;
    var half = (len / 2) | 0;
    for (var i = 0; i < len; i++) {
      D2(c, cx, cy, COL.birchBark);
      if (i > 1 && (i + f) % 4 === 0) D2(c, cx, cy - 1, pal.snow2);
      cx += dx; cy += dy;
      if (i === half) {
        // боковой отросток
        var bx = cx, by = cy;
        for (var j = 0; j < half; j++) {
          D2(c, bx, by, COL.birchBark);
          by += dy;
          if (j % 2 === 0 && dx === 0) bx += 1;
        }
        D2(c, bx, by, pal.snow1);
      }
    }
    D2(c, cx, cy - 1, pal.snow1);   // снег на кончике
  }

  /** Ветка сухостоя: голая, изломанная, редкий снег. */
  function deadBranch(c, x, y, dx, dy, len) {
    var pal = WS.Spr.pal;
    var cx = x, cy = y;
    for (var i = 0; i < len; i++) {
      D2(c, cx, cy, COL.deadWood);
      if (i % 3 === 2) D2(c, cx, cy - 1, COL.deadDark);
      if (i % 5 === 4) D2(c, cx, cy - 1, pal.snow2);
      cx += (i % 3 === 1 ? 0 : dx);
      cy += dy;
    }
  }

  // ==================================================================
  //  СПРАЙТЫ ПРИРОДЫ (регистрация при загрузке, рисование — лениво)
  // ==================================================================

  // -------- ЕЛЬ ВЗРОСЛАЯ, 64x96: семь нахлёстанных ярусов со снегом --------
  WS.Spr.def('tree_pine', {
    w: 64, h: 96, frames: 3,
    draw: function (c, cw, ch, f) {
      var pal = WS.Spr.pal;
      // ствол с тёмной гранью
      R2(c, 13, 34, 6, 13, pal.trunk);
      R2(c, 15, 34, 2, 13, '#3a2c20');
      R2(c, 11, 45, 10, 2, '#33261b');       // корневое расширение
      // крона: ярусы сверху вниз, каждый шире предыдущего
      for (var i = 0; i < 7; i++) {
        var yTop = 1 + i * 5;
        var hwB = 4 + i * 1.9;               // полуширина низа яруса
        var hwT = Math.max(1, hwB - 3.6);     // полуширина верха яруса
        var tier = (i % 2 === 0) ? pal.tree : pal.tree2;
        for (var r = 0; r < 6; r++) {
          var hw = hwT + (hwB - hwT) * (r / 6);
          var wl = Math.max(1, Math.round(hw));
          var col = (r === 5) ? '#2e3a30' : tier;   // тёмная подложка низа
          R2(c, 16 - wl, yTop + r, wl * 2, 1, col);
          // условный свет с северо-запада
          if (r >= 1 && r <= 4 && wl > 2) {
            R2(c, 16 - wl, yTop + r, 2, 1, pal.tree2);
          }
        }
        // снежная кромка на верху яруса
        var ws = Math.max(1, Math.round(hwT));
        R2(c, 16 - ws, yTop, ws * 2, 1, (i % 2) ? pal.snow2 : pal.snow1);
      }
      // макушка
      R2(c, 15, 0, 2, 2, pal.tree2);
      R2(c, 15, 0, 2, 1, pal.snow1);
      // наплывы снега — раскладка меняется от кадра-варианта
      var dabs = [
        [4, 6, 4], [11, 12, 5], [7, 17, 4], [18, 11, 4], [21, 22, 5],
        [8, 23, 4], [14, 28, 5], [5, 32, 4], [19, 32, 5], [11, 37, 6]
      ];
      for (var k = 0; k < dabs.length; k++) {
        if ((k + f) % 3 !== 0) continue;
        var d = dabs[k];
        R2(c, d[0], d[1], Math.max(1, d[2] - 2), 1, pal.snow1);
      }
    }
  });

  // -------- ЕЛЬ МОЛОДАЯ, 48x72: пять ярусов, уже и ниже --------
  WS.Spr.def('tree_pine_small', {
    w: 48, h: 72, frames: 2,
    draw: function (c, cw, ch, f) {
      var pal = WS.Spr.pal;
      R2(c, 10, 26, 4, 9, pal.trunk);
      R2(c, 11, 26, 2, 9, '#3a2c20');
      R2(c, 9, 33, 6, 2, '#33261b');
      for (var i = 0; i < 5; i++) {
        var yTop = 1 + i * 5;
        var hwB = 3.4 + i * 1.7;
        var hwT = Math.max(1, hwB - 2.6);
        var tier = (i % 2 === 0) ? pal.tree2 : pal.tree;
        for (var r = 0; r < 5; r++) {
          var hw = hwT + (hwB - hwT) * (r / 5);
          var wl = Math.max(1, Math.round(hw));
          R2(c, 12 - wl, yTop + r, wl * 2, 1, (r === 4) ? '#2e3a30' : tier);
        }
        var ws = Math.max(1, Math.round(hwT));
        R2(c, 12 - ws, yTop, ws * 2, 1, pal.snow2);
      }
      R2(c, 11, 0, 2, 2, pal.tree2);
      D2(c, 11, 0, pal.snow1);
      var dabs = [[5, 8], [15, 14], [8, 18], [16, 23], [6, 13], [13, 27]];
      for (var k = 0; k < dabs.length; k++) {
        if ((k + f) % 2 !== 0) continue;
        R2(c, dabs[k][0], dabs[k][1], 3, 1, pal.snow1);
      }
    }
  });

  // -------- БЕРЁЗА, 56x88: белый ствол, чёрные штрихи, голые ветви --------
  WS.Spr.def('tree_birch', {
    w: 56, h: 88, frames: 3,
    draw: function (c, cw, ch, f) {
      var pal = WS.Spr.pal;
      // ствол с освещённой гранью
      R2(c, 12, 18, 4, 25, COL.birchBark);
      R2(c, 12, 18, 1, 25, COL.birchLit);
      R2(c, 11, 41, 6, 2, COL.birchBark);      // утолщение у корня
      R2(c, 10, 42, 8, 2, pal.snow2);          // сугроб у основания
      R2(c, 12, 43, 5, 1, pal.snow1);
      // чёрные штрихи берёзовой коры — набор зависит от варианта
      var dashes = [
        [13, 21], [12, 26], [14, 30], [12, 35], [13, 39],
        [15, 24], [11, 32], [15, 36]
      ];
      for (var i = 0; i < dashes.length; i++) {
        if ((i + f) % 3 === 0) continue;
        R2(c, dashes[i][0], dashes[i][1], 1, 2, COL.birchDash);
      }
      // ветви в разные стороны
      branchBirch(c, 12, 20, -1, -1, 8, f);
      branchBirch(c, 16, 24, 1, -1, 9, f);
      branchBirch(c, 12, 29, -1, -1, 10, f);
      branchBirch(c, 16, 33, 1, -1, 7, f);
      branchBirch(c, 13, 37, -1, -1, 6, f);
      branchBirch(c, 16, 40, 1, -1, 5, f);
    }
  });

  // -------- СУХОСТОЙ, 48x80: кривой голый ствол, изломанные ветви --------
  WS.Spr.def('tree_dead', {
    w: 48, h: 80, frames: 2,
    draw: function (c, cw, ch, f) {
      var pal = WS.Spr.pal;
      // кривой ствол лесенкой
      var tx = 11;
      for (var yy = 38; yy >= 14; yy--) {
        if ((yy + f) % 7 === 0) tx += 1;
        R2(c, tx, yy, 3, 1, COL.deadWood);
        R2(c, tx + 2, yy, 1, 1, COL.deadDark);
      }
      // ветви
      deadBranch(c, tx + 1, 30, -1, -1, 8);
      deadBranch(c, tx + 2, 22, 1, -1, 7);
      deadBranch(c, tx + 1, 16, -1, -1, 6);
      deadBranch(c, tx + 2, 12, 1, -1, 5);
      // снег у корня и на изломах
      R2(c, 8, 37, 9, 3, pal.snow2);
      R2(c, 9, 36, 5, 1, pal.snow1);
      D2(c, tx - 1, 28, pal.snow2);
      D2(c, tx + 3, 20, pal.snow2);
    }
  });

  // -------- КУСТ, 32x32: низкий шаровидный, снег, гроздья рябины --------
  WS.Spr.def('bush', {
    w: 32, h: 32, frames: 2,
    draw: function (c, cw, ch, f) {
      var pal = WS.Spr.pal;
      E2(c, 8, 10, 6.5, 4.5, pal.tree2);
      E2(c, 6, 8, 4.5, 3, pal.tree);
      E2(c, 11, 9, 3.5, 2.5, pal.tree2);
      // снежная шапка
      E2(c, 7.5, 6.5, 5, 2, pal.snow2);
      R2(c, 4, 6, 6, 1, pal.snow1);
      R2(c, 9, 5, 3, 1, pal.snow1);
      // гроздья рябины зимние
      if (f === 0) {
        D2(c, 5, 11, '#8d3040'); D2(c, 11, 12, '#8d3040'); D2(c, 8, 13, '#8d3040');
      } else {
        D2(c, 6, 12, '#8d3040'); D2(c, 10, 10, '#8d3040');
      }
    }
  });

  // -------- ПЕНЬ, 32x24: срез с годовыми кольцами --------
  WS.Spr.def('stump', {
    w: 32, h: 24,
    draw: function (c) {
      var pal = WS.Spr.pal;
      R2(c, 4, 4, 8, 7, pal.trunk);          // боковина пня
      E2(c, 8, 4.5, 4.4, 2, pal.wood3);     // верхний срез
      E2(c, 8, 4.5, 2.6, 1.1, pal.wood);     // кольцо
      E2(c, 8, 4.5, 0.9, 0.4, pal.wood2);    // сердцевина
      R2(c, 2, 9, 12, 2, pal.snow2);         // снег у основания
      R2(c, 3, 8, 4, 1, pal.snow1);
      D2(c, 12, 7, pal.snow2);
    }
  });

  // -------- ВАЛУН, 40x28: серый камень со снежной шапкой --------
  WS.Spr.def('rock', {
    w: 40, h: 28, frames: 2,
    draw: function (c, cw, ch, f) {
      var pal = WS.Spr.pal;
      E2(c, 10, 9, 8.4, 4.6, pal.stone);
      E2(c, 7, 7, 5, 3.2, '#8b8f97');        // освещённая грань
      // снег на верхней грани
      E2(c, 8, 5.8, 5.6, 1.9, pal.snow2);
      R2(c, 4, 5, 5, 1, pal.snow1);
      R2(c, 11, 4, 4, 1, pal.snow1);
      // трещина
      R2(c, 13, 7, 1, 3, pal.stone2);
      D2(c, 12, 10, pal.stone2);
      if (f === 1) { D2(c, 6, 9, pal.stone2); D2(c, 7, 10, pal.stone2); }
    }
  });

  // -------- КАМЫШ, 32x36: сухие стебли из снега --------
  WS.Spr.def('reed', {
    w: 32, h: 36, frames: 2,
    draw: function (c, cw, ch, f) {
      var pal = WS.Spr.pal;
      var xs = [3, 5, 7, 9, 11, 13];
      for (var i = 0; i < xs.length; i++) {
        var hgt = 9 + ((i * 5 + f * 3) % 5);       // разные высоты
        var bend = (i % 2 === 0) ? 0 : 1;
        for (var k = 0; k < hgt; k++) {
          var xx = xs[i] + (k > hgt - 4 ? bend : 0); // верхушка гнётся
          R2(c, xx, 17 - k, 1, 1, (k % 3 === 0) ? COL.strawDark : COL.straw);
        }
        // метёлка-султан
        R2(c, xs[i] + bend - 1, 17 - hgt - 2, 2, 2, COL.reedHead);
      }
      // снег у корней — стебли растут из него
      R2(c, 1, 15, 14, 3, pal.snow1);
      R2(c, 2, 14, 6, 1, pal.snow2);
    }
  });

  // -------- ПРОРУБЬ, 36x20: тёмная вода во льду --------
  WS.Spr.def('ice_hole', {
    w: 36, h: 20,
    draw: function (c) {
      var pal = WS.Spr.pal;
      E2(c, 9, 5, 8.6, 4.4, pal.ice2);      // светлый лёд вокруг
      E2(c, 9, 5, 7, 3.4, pal.water);        // тёмная вода
      E2(c, 9, 5.4, 4.6, 2, pal.water2);    // глубина
      D2(c, 6, 4, '#3d5474');               // блеск
      D2(c, 12, 6, '#3d5474');
      // трещины от кромки
      R2(c, 0, 5, 2, 1, '#c3d8ea');
      R2(c, 16, 4, 2, 1, '#c3d8ea');
      R2(c, 9, 0, 1, 2, '#c3d8ea');
      R2(c, 8, 8, 1, 2, '#c3d8ea');
    }
  });

  // -------- БУРЕЛОМ, 56x24: лежащее бревно --------
  WS.Spr.def('log_fallen', {
    w: 56, h: 24, frames: 2,
    draw: function (c, cw, ch, f) {
      var pal = WS.Spr.pal;
      R2(c, 3, 6, 22, 4, pal.trunk);          // лежащий ствол
      R2(c, 3, 6, 22, 1, '#5a4634');          // освещённая грань
      E2(c, 25, 8, 1.6, 2, pal.wood3);        // торец
      E2(c, 25, 8, 0.7, 0.9, pal.wood2);
      // обломанный сучок
      R2(c, 12, 3, 1, 3, pal.trunk);
      D2(c, 12, 3, pal.wood2);
      // снежная колея поверх бревна
      R2(c, 4, 5, 20, 1, pal.snow2);
      R2(c, 8, 4, 8, 1, pal.snow1);
      // подсыпка тени у земли
      R2(c, 4, 10, 20, 1, pal.snowShadow);
      if (f === 1) R2(c, 16, 5, 4, 1, pal.snow1);
    }
  });

  // -------- ПУГАЛО, 36x52: на дальнем поле --------
  WS.Spr.def('scarecrow', {
    w: 36, h: 52,
    draw: function (c) {
      var pal = WS.Spr.pal;
      R2(c, 8, 8, 2, 17, pal.wood2);          // шест
      R2(c, 3, 10, 12, 1, pal.wood2);         // перекладина-руки
      R2(c, 6, 10, 5, 8, pal.coat);           // туловище — старый армяк
      R2(c, 6, 10, 5, 2, pal.coat2);
      E2(c, 8.5, 8, 2.2, 2, pal.canvasCloth); // голова — мешок
      D2(c, 4, 9, pal.fur);                   // рукавицы-торчки
      D2(c, 13, 9, pal.fur);
      E2(c, 8.5, 6.3, 2.4, 1.2, pal.snow2);  // снег на шапке-мешке
      // солома из рукавов и подола
      D2(c, 5, 17, COL.straw);
      D2(c, 11, 18, COL.straw);
      D2(c, 7, 19, COL.strawDark);
      R2(c, 6, 24, 6, 2, pal.snow2);          // сугроб у шеста
    }
  });

  // -------- ТЕЛЕГРАФНЫЙ СТОЛБ, 18x110: высокий, с траверсами --------
  WS.Spr.def('telegraph_pole', {
    w: 18, h: 110,
    draw: function (c) {
      var pal = WS.Spr.pal;
      R2(c, 3, 4, 2, 50, '#4a4238');          // столб во всю высоту
      R2(c, 3, 4, 1, 50, '#5a5142');          // освещённая грань
      R2(c, 0, 8, 9, 1, '#3e3830');           // нижняя траверса
      R2(c, 1, 5, 7, 1, '#3e3830');           // верхняя траверса
      D2(c, 0, 7, '#2c3038');                 // изоляторы
      D2(c, 8, 7, '#2c3038');
      D2(c, 1, 4, '#2c3038');
      D2(c, 7, 4, '#2c3038');
      R2(c, 1, 4, 7, 1, pal.snow2);           // снег на верхней траверсе
      R2(c, 3, 2, 2, 2, pal.snow2);           // снежная шапка вершины
      R2(c, 3, 52, 2, 2, pal.snow1);          // подсыпка у подножия
    }
  });

  // ==================================================================
  //  СОСТОЯНИЕ ГЕНЕРАЦИИ — общий справочник для всех модулей
  // ==================================================================
  var Info = {
    seed: 0,
    // границы посёлка (для столбов, плотности леса и т.п.)
    town: { x0: 26, x1: 194, y0: 95, y1: 158 },
    // центральная улица вдоль реки
    street: { y: 145, x0: 10, x1: 210, sideN: 144, sideS: 148 },
    lanes: [],        // x-координаты переулков (левый столбец)
    river: null,      // {top:[], bot:[]} — строки начала/конца воды по x
    ponds: [],
    clearings: [],    // просеки {x0, y0, x1, y1}
    reserved: [],     // занятые прямоугольники {x, y, w, h}
    spawn: null       // кандидат точки старта (окончательно ставит gen.js)
  };

  /** Тайл — «природный» (на нём можно строить, сквозь него нет дорог). */
  function isNatT(t) {
    var T = WS.World.T;
    return t === T.SNOW || t === T.GRASS || t === T.GRASS2 ||
           t === T.SNOW_DEEP || t === T.DIRT;
  }

  /** Природный ли тайл с учётом грязи (для adjacency-проверок леса). */
  function isNatAdj(t) {
    var T = WS.World.T;
    return isNatT(t) || t === T.MUD;
  }

  /** Весь ли прямоугольник — природные тайлы. */
  function rectNatural(x, y, w, h) {
    var W = WS.World;
    for (var yy = y; yy < y + h; yy++)
      for (var xx = x; xx < x + w; xx++) {
        if (!W.inB(xx, yy)) return false;
        if (!isNatT(W.tileAt(xx, yy))) return false;
      }
    return true;
  }

  /** Попадает ли тайл в просеку. */
  function inClearing(x, y) {
    for (var i = 0; i < Info.clearings.length; i++) {
      var c = Info.clearings[i];
      if (x >= c.x0 && x <= c.x1 && y >= c.y0 && y <= c.y1) return true;
    }
    return false;
  }

  /** Есть ли в радиусе r непроходимый/рукотворный тайл (вода, дороги, стены). */
  function nearNonNatural(x, y, r) {
    var W = WS.World;
    for (var dy = -r; dy <= r; dy++)
      for (var dx = -r; dx <= r; dx++) {
        if (!isNatAdj(W.tileAt(x + dx, y + dy))) return true;
      }
    return false;
  }

  /** Есть ли объекты в квадрате радиуса r (чтобы не сажать дерево на пень). */
  function hasObjNear(W, x, y, r) {
    for (var dy = -r; dy <= r; dy++)
      for (var dx = -r; dx <= r; dx++) {
        if (W.objsAt(x + dx, y + dy).length) return true;
      }
    return false;
  }

  /** Русское имя дерева по имени спрайта (для подсказок при осмотре). */
  function treeName(spr) {
    if (spr === 'tree_pine') return 'Ель';
    if (spr === 'tree_pine_small') return 'Молодая ель';
    if (spr === 'tree_birch') return 'Берёза';
    if (spr === 'tree_dead') return 'Сухостой';
    return 'Дерево';
  }

  // ==================================================================
  //  РЕЛЬЕФ: равнина, река, пруды
  // ==================================================================

  /**
   * Базовая поверхность: снег с травяными пятнами и сугробами.
   * Пятна и кластеры — по фрактальному шуму (fbm2), без состояния.
   */
  function terrain(R) {
    var W = WS.World;
    var s = R.seed >>> 0;
    Info.seed = s;
    Info.reserved = [];
    Info.ponds = [];
    Info.lanes = [];
    Info.clearings = [];
    W.iceHoles = [];

    for (var y = 0; y < W.h; y++) {
      for (var x = 0; x < W.w; x++) {
        var t = WS.World.T.SNOW;
        // крупные пятна травы, кое-где проглядывающей из-под снега
        var nG = WS.RNG.fbm2(x * 0.045, y * 0.045, s + 11, 4);
        var nF = WS.RNG.fbm2(x * 0.11 + 7.3, y * 0.11 + 3.1, s + 29, 2);
        if (nG > 0.60 && nF > 0.46) t = (nG > 0.71) ? WS.World.T.GRASS2 : WS.World.T.GRASS;
        // сугробы — кластерами, на севере гуще
        var nD = WS.RNG.fbm2(x * 0.06 + 40, y * 0.06 + 9, s + 53, 3);
        var drift = nD + (y < 70 ? 0.08 : (y < 95 ? 0.03 : 0));
        if (t === WS.World.T.SNOW && drift > 0.645) t = WS.World.T.SNOW_DEEP;
        else if (t === WS.World.T.SNOW && nF < 0.10) t = WS.World.T.DIRT; // промёрзшая проплешина
        W.setTile(x, y, t);
      }
    }

    genRiver(R);   // река с льдом и прорубями
    genPonds(R);   // пруды в лесной зоне
  }

  /**
   * Река: широкая 4-7 тайлов, горизонтальная, с изгибами (value-noise).
   * Кромки — лёд (ранняя зима), середина — вода. Берега — SHORE/галька/ил.
   */
  function genRiver(R) {
    var W = WS.World, T = W.T;
    var s = Info.seed + 777;
    var top = [], bot = [];

    for (var x = 0; x < W.w; x++) {
      // центральная линия русла: 173 ± 9 (изгибы низкочастотным шумом)
      var meander = (WS.RNG.fbm2(x * 0.016, 3.7, s, 3) - 0.5) * 18;
      var c0 = 173 + meander;
      // полуширина русла: 2.1..3.8 (итого 4-7 тайлов)
      var h0 = 2.1 + WS.RNG.fbm2(x * 0.05, 9.1, s + 5, 2) * 1.7;
      var tp = Math.floor(c0 - h0);
      var bt = Math.ceil(c0 + h0);
      tp = WS.M.clamp(tp, 152, 180);
      bt = WS.M.clamp(bt, tp + 4, 194);
      top[x] = tp; bot[x] = bt;

      // северный берег: галька кое-где
      W.setTile(x, tp - 1, WS.RNG.hash2(x, 1, s + 3) < 0.3 ? T.GRAVEL : T.SHORE);
      // южный берег: промёрзшая глина кое-где
      W.setTile(x, bt + 1, WS.RNG.hash2(x, 2, s + 3) < 0.2 ? T.MUD : T.SHORE);
      W.setTile(x, tp, T.SHORE);
      W.setTile(x, bt, T.SHORE);

      // русло: кромки льда, стрежень — вода
      for (var y = tp + 1; y < bt; y++) {
        var mid = Math.abs(y - c0) / (h0 + 0.001);
        var frozen = (y <= tp + 1 || y >= bt - 1) ||
                     (mid > 0.62 && WS.RNG.hash2(x, y, s + 9) < 0.5);
        W.setTile(x, y, frozen ? T.ICE : T.WATER);
      }
    }
    Info.river = { top: top, bot: bot };

    genIceHoles(R);   // проруби для будущей рыбалки
  }

  /** Полыньи-проруби: 6-9 штук вдоль русла, координаты — в World.iceHoles. */
  function genIceHoles(R) {
    var W = WS.World, T = W.T;
    var river = Info.river;
    var n = R.int(6, 9);
    var used = [];
    for (var i = 0; i < n; i++) {
      for (var tries = 0; tries < 24; tries++) {
        var hx = R.int(12, 206);
        // не сгущать: минимальный разброс между прорубями
        var ok = true;
        for (var k = 0; k < used.length; k++) {
          if (Math.abs(used[k] - hx) < 10) { ok = false; break; }
        }
        if (!ok) continue;
        // прорубь ищем на ледяной кромке — северной или южной
        var north = R.chance(0.6);
        var hy = north ? river.top[hx] + 1 : river.bot[hx] - 1;
        if (W.tileAt(hx, hy) !== T.ICE) continue;
        used.push(hx);
        W.iceHoles.push({ x: hx, y: hy });
        W.addObject({
          x: hx + 0.5, y: hy + 0.5,
          sprName: 'ice_hole', solid: false, shadow: false,
          name: 'Прорубь'
        });
        break;
      }
    }
  }

  /** Пруды: 3 замёрзших оврага-пруда в лесной зоне (север карты). */
  function genPonds(R) {
    var W = WS.World, T = W.T;
    var n = 3;
    var placed = [];
    for (var i = 0; i < n; i++) {
      for (var tries = 0; tries < 30; tries++) {
        var px = R.int(20, 196);
        var py = R.int(16, 82);
        var r = R.int(2, 4);
        // не лепить друг к другу и не задевать реку/город
        var ok = true;
        for (var k = 0; k < placed.length; k++) {
          var d = Math.abs(placed[k].x - px) + Math.abs(placed[k].y - py);
          if (d < 34) { ok = false; break; }
        }
        if (!ok) continue;
        // вся площадь пруда должна быть на природных тайлах
        if (!rectNatural(px - r - 2, py - r - 2, r * 2 + 5, r * 2 + 5)) continue;

        var r0 = r + 0.5, r1 = Math.max(1.6, r * 0.8);
        for (var dy = -r - 2; dy <= r + 2; dy++) {
          for (var dx = -r - 2; dx <= r + 2; dx++) {
            var e = (dx * dx) / (r0 * r0) + (dy * dy) / (r1 * r1);
            var xx = px + dx, yy = py + dy;
            if (!W.inB(xx, yy)) continue;
            if (e <= 1) {
              // середина глубокого пруда может не замёрзнуть
              W.setTile(xx, yy, (e < 0.4 && r >= 3) ? T.WATER : T.ICE);
            } else if (e <= 1.6 && isNatT(W.tileAt(xx, yy))) {
              W.setTile(xx, yy, T.SHORE);   // топкий берег
            }
          }
        }
        placed.push({ x: px, y: py });
        Info.ponds.push({ x: px, y: py, r: r });
        Info.reserved.push({ x: px - r - 2, y: py - r - 2, w: r * 2 + 5, h: r * 2 + 5 });
        break;
      }
    }
  }

  // ==================================================================
  //  ДОРОГИ
  // ==================================================================

  /**
   * Дорожная сеть: тракт через карту (он же центральная улица посёлка),
   * тротуары, поперечные переулки, лесная дорога на север, поля за рекой.
   */
  function roads(R) {
    var W = WS.World, T = W.T;
    var s = Info.seed;
    var st = Info.street;

    // тракт: 3 ряда ROAD через всю карту
    W.carve(2, st.y, 216, 3, T.ROAD);
    // тротуары в черте посёлка
    W.carve(12, st.sideN, 196, 1, T.SIDEWALK);
    W.carve(12, st.sideS, 196, 1, T.SIDEWALK);
    // полоса улицы резервируется от застройки (y 143..149)
    Info.reserved.push({ x: 0, y: 143, w: 220, h: 7 });

    // поперечные переулки: 2 тайла ROAD_SIDE + тротуары по бокам
    var bases = [50, 92, 134, 176];
    for (var i = 0; i < bases.length; i++) {
      var lx = bases[i] + R.int(-2, 2);
      Info.lanes.push(lx);
      W.carve(lx, 100, 2, 46, T.ROAD_SIDE);        // y 100..145, до улицы
      W.carve(lx - 1, 102, 1, 42, T.SIDEWALK);
      W.carve(lx + 2, 102, 1, 42, T.SIDEWALK);
      Info.reserved.push({ x: lx - 2, y: 98, w: 6, h: 48 });
    }

    // лесная дорога на север, к делянкам — слегка извивается
    genForestRoad(R);

    // поля за рекой
    genFields(R);

    // просеки — учитываются при посадке леса
    Info.clearings = [
      { x0: 26, y0: 36, x1: 196, y1: 39 },   // широкая горизонтальная
      { x0: 66, y0: 8, x1: 69, y1: 34 },     // вертикальная к северу
      { x0: 158, y0: 8, x1: 161, y1: 34 },   // вторая вертикальная
      { x0: 96, y0: 44, x1: 99, y1: 60 }     // короткая юго-восточная
    ];

    // заборы вдоль тракта на окраинах (за пределами посёлка)
    fenceOutskirts(R);

    // телеграфные столбы вне посёлка (внутри черты ставит gen_town)
    for (var px = 6; px < 214; px += 9) {
      if (px > Info.town.x0 - 6 && px < Info.town.x1 + 6) continue;
      W.addObject({
        x: px + 0.5, y: 149.5,
        sprName: 'telegraph_pole', solid: true,
        name: 'Телеграфный столб'
      });
    }
  }

  /** Лесная дорога на север: ROAD_SIDE ширина 2, извивается шумом. */
  function genForestRoad(R) {
    var W = WS.World;
    var s = Info.seed;
    var fx = 112;
    for (var y = 99; y >= 12; y--) {
      var off = Math.round((WS.RNG.fbm2(y * 0.045, 5.5, s + 31, 2) - 0.5) * 16);
      W.carve(fx + off, y, 2, 1, WS.World.T.ROAD_SIDE);
    }
    Info.reserved.push({ x: fx - 13, y: 8, w: 28, h: 96 });
    // колодец у развилки (объект solid; спрайт живёт в gen_town.js)
    W.addObject({ x: 109.5, y: 96.5, sprName: 'well', solid: true, name: 'Колодец' });
    // бочка и дрова у колодца
    W.addObject({ x: 111.5, y: 97.5, sprName: 'barrel', solid: true, name: 'Бочка' });
    W.addObject({ x: 107.5, y: 97.5, sprName: 'woodpile', solid: true, name: 'Поленница' });
  }

  /** Поля за рекой: 2-3 делянки FARMLAND со стогами, пугалом и оградой. */
  function genFields(R) {
    var W = WS.World, T = W.T;
    var n = R.int(2, 3);
    var placed = [];
    for (var i = 0; i < n; i++) {
      for (var tries = 0; tries < 20; tries++) {
        var fw = R.int(10, 15), fh = R.int(7, 9);
        var fx = R.int(24, 190 - fw);
        var fy = R.int(198, 208 - fh);
        // не пересекаться с прежними полями (с запасом на ограду)
        var ok = true;
        for (var k = 0; k < placed.length; k++) {
          var p = placed[k];
          if (fx < p.x + p.w + 4 && fx + fw + 4 > p.x && fy < p.y + p.h + 4 && fy + fh + 4 > p.y) {
            ok = false; break;
          }
        }
        if (!ok) continue;
        if (!rectNatural(fx, fy, fw, fh)) continue;

        W.carve(fx, fy, fw, fh, T.FARMLAND);

        // стога сена по полю
        var hs = R.int(2, 4);
        for (var h = 0; h < hs; h++) {
          var xx = fx + R.int(1, fw - 2), yy = fy + R.int(1, fh - 2);
          W.addObject({ x: xx + 0.5, y: yy + 0.5, sprName: 'haystack', solid: true, name: 'Стог сена' });
        }
        // пугало в углу
        if (R.chance(0.7)) {
          W.addObject({ x: fx + 0.5, y: fy + 0.5, sprName: 'scarecrow', solid: true, name: 'Пугало' });
        }
        // валун-огромадина у ограды
        if (R.chance(0.5)) {
          W.addObject({ x: fx + fw + 1.5, y: fy + fh - 1.5, sprName: 'rock', sprFrame: 1, solid: true, name: 'Валун' });
        }

        // ограда вокруг с воротами с юга и севера
        var gates = [
          { x: fx + ((fw / 2) | 0) - 1, y: fy - 2, w: 3, h: 1 },
          { x: fx + ((fw / 2) | 0) - 1, y: fy + fh + 1, w: 3, h: 1 }
        ];
        fenceRect(fx - 2, fy - 2, fw + 4, fh + 4, R, gates);
        Info.reserved.push({ x: fx - 2, y: fy - 2, w: fw + 4, h: fh + 4 });
        placed.push({ x: fx, y: fy, w: fw, h: fh });
        break;
      }
    }
  }

  /** Заборы вдоль тракта за окраинами посёлка, с разрывами. */
  function fenceOutskirts(R) {
    var W = WS.World, T = W.T;
    var runs = [
      { x0: 4, x1: 22 },      // западная окраина
      { x0: 198, x1: 216 }    // восточная окраина
    ];
    for (var i = 0; i < runs.length; i++) {
      for (var xx = runs[i].x0; xx <= runs[i].x1; xx++) {
        // разрывы-выезды каждые 5-8 тайлов
        if (xx % R.int(5, 8) === 0) continue;
        if (isNatT(W.tileAt(xx, 143))) W.setTile(xx, 143, T.FENCE);
        // сугроб с наветренной стороны забора
        if (isNatT(W.tileAt(xx, 142)) && WS.RNG.hash2(xx, 142, Info.seed + 61) < 0.3) {
          W.setTile(xx, 142, T.SNOW_DEEP);
        }
      }
    }
  }

  /**
   * Ограда по периметру прямоугольника: только по природным тайлам,
   * с прямоугольниками-воротами gates = [{x, y, w, h}].
   * Экспортируется наружу (gen_town.js ставит дворовые заборы).
   */
  function fenceRect(x, y, w, h, R, gates) {
    var W = WS.World, T = W.T;
    gates = gates || [];

    function inGate(xx, yy) {
      for (var g = 0; g < gates.length; g++) {
        if (xx >= gates[g].x && xx < gates[g].x + gates[g].w &&
            yy >= gates[g].y && yy < gates[g].y + gates[g].h) return true;
      }
      return false;
    }

    function put(xx, yy) {
      if (!W.inB(xx, yy)) return;
      if (inGate(xx, yy)) return;
      if (!isNatT(W.tileAt(xx, yy))) return;
      W.setTile(xx, yy, T.FENCE);
      // сугроб с внутренней стороны ограды
      var inX = (xx < x + w / 2) ? xx + 1 : xx - 1;
      var inY = (yy < y + h / 2) ? yy + 1 : yy - 1;
      var side = (yy === y || yy === y + h - 1) ? inY : inX;
      if (W.inB(side, yy) && isNatT(W.tileAt(side, yy)) &&
          WS.RNG.hash2(side, yy, Info.seed + 66) < 0.28) {
        W.setTile(side, yy, T.SNOW_DEEP);
      }
    }

    for (var xx = x; xx < x + w; xx++) { put(xx, y); put(xx, y + h - 1); }
    for (var yy = y + 1; yy < y + h - 1; yy++) { put(x, yy); put(x + w - 1, yy); }
  }

  // ==================================================================
  //  ЛЕС (сажается ПОСЛЕ посёлка — обходит всё рукотворное по тайлам)
  // ==================================================================

  /**
   * Лес: ель, молодая ель, берёза, сухостой. Плотность — кластерами (fbm2),
   * на севере гуще. Просеки, берёзовые гривы, бурелом, подлесок, камыш.
   * Все решения на координатах — через hash2 (стабильность), глобальные — через R.
   */
  function forest(R) {
    var W = WS.World, T = W.T;
    var s = Info.seed;
    var river = Info.river;

    for (var y = 2; y < W.h - 2; y++) {
      for (var x = 2; x < W.w - 2; x++) {
        var t = W.tileAt(x, y);
        if (t !== T.SNOW && t !== T.GRASS && t !== T.GRASS2 && t !== T.SNOW_DEEP) continue;
        // отступ от рукотворного, воды и дорог
        if (nearNonNatural(x, y, 2)) continue;
        // просеки остаются чистыми
        if (inClearing(x, y)) continue;
        // не сажать поверх других объектов (колодцы, стога, валуны...)
        if (hasObjNear(W, x, y, 1)) continue;

        // плотность: север карты гуще, за рекой реже
        var dens = WS.RNG.fbm2(x * 0.05, y * 0.05, s + 101, 4);
        if (y < 62) dens += 0.16;
        else if (y < 96) dens += 0.05;
        if (y > river.bot[x] + 4) dens -= 0.06;

        if (dens > 0.52) {
          var chance = (dens - 0.52) * 2.2;
          if (WS.RNG.hash2(x, y, s + 7) < chance) {
            // берёзовые гривы — отдельным шумом
            var bir = WS.RNG.fbm2(x * 0.08, y * 0.08, s + 202, 2);
            var roll = WS.RNG.hash2(x, y, s + 13);
            var spr;
            if (bir > 0.62) {
              // грива: берёза вперемешку с сухостоем
              if (roll < 0.7) spr = 'tree_birch';
              else if (roll < 0.82) spr = 'tree_dead';
              else spr = 'tree_pine_small';
            } else {
              // ельник: ели вперемешку
              if (roll < 0.58) spr = 'tree_pine';
              else if (roll < 0.74) spr = 'tree_pine_small';
              else if (roll < 0.88) spr = 'tree_birch';
              else spr = 'tree_dead';
            }
            var frm = (WS.RNG.hash2(x, y, s + 17) * 3) | 0;
            if (spr === 'tree_pine_small' || spr === 'tree_dead') frm = frm % 2;
            W.addObject({
              x: x + 0.5, y: y + 0.5,
              sprName: spr, sprFrame: frm, solid: true,
              name: treeName(spr)
            });
            continue;   // на этом тайле подлесок уже не нужен
          }
        }

        // подлесок и мелочь на свободных местах
        var roll2 = WS.RNG.hash2(x, y, s + 19);
        if (roll2 < 0.013) {
          W.addObject({
            x: x + 0.5, y: y + 0.5, sprName: 'bush',
            sprFrame: roll2 < 0.006 ? 0 : 1, solid: false, name: 'Куст'
          });
        } else if (roll2 < 0.019) {
          W.addObject({
            x: x + 0.5, y: y + 0.5, sprName: 'rock',
            sprFrame: ((WS.RNG.hash2(x, y, s + 23) * 2) | 0) % 2,
            solid: true, name: 'Камень'
          });
        } else if (roll2 < 0.026) {
          W.addObject({
            x: x + 0.5, y: y + 0.5, sprName: 'stump', solid: true, name: 'Пень'
          });
        } else if (roll2 < 0.029) {
          // бурелом — реже, группами возле уже упавших
          W.addObject({
            x: x + 0.5, y: y + 0.5, sprName: 'log_fallen',
            sprFrame: (WS.RNG.hash2(x, y, s + 27) < 0.5) ? 0 : 1,
            solid: true, name: 'Бурелом'
          });
        }
      }
    }

    genReeds(R);   // камыш по берегам
  }

  /** Камыш: сухие заросли на природных тайлах у воды/льда. */
  function genReeds(R) {
    var W = WS.World, T = W.T;
    var s = Info.seed;
    for (var y = 3; y < W.h - 3; y++) {
      for (var x = 3; x < W.w - 3; x++) {
        var t = W.tileAt(x, y);
        if (!isNatT(t)) continue;
        // ищем воду/лёд/берег в округе
        var wet = false;
        for (var dy = -2; dy <= 2 && !wet; dy++) {
          for (var dx = -2; dx <= 2; dx++) {
            var tt = W.tileAt(x + dx, y + dy);
            if (tt === T.WATER || tt === T.ICE || tt === T.SHORE) { wet = true; break; }
          }
        }
        if (!wet) continue;
        if (WS.RNG.hash2(x, y, s + 41) < 0.3 && !W.objsAt(x, y).length) {
          W.addObject({
            x: x + 0.5, y: y + 0.5, sprName: 'reed',
            sprFrame: (WS.RNG.hash2(x, y, s + 43) < 0.5) ? 0 : 1,
            solid: false, name: 'Камыш'
          });
        }
      }
    }
  }

  // ==================================================================
  //  ЭКСПОРТ
  // ==================================================================
  WS.def('GenTerrain', {
    terrain: terrain,
    roads: roads,
    forest: forest,
    info: function () { return Info; },
    /** Занять прямоугольник (используется gen_town.js). */
    reserve: function (x, y, w, h) { Info.reserved.push({ x: x, y: y, w: w, h: h }); },
    fenceRect: fenceRect,
    rectNatural: rectNatural
  });
})();
