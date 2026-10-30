/**
 * Процедурные спрайты: генерация пиксель-арта кодом, ленивый кэш.
 *
 * ДВА СПОСОБА ОПРЕДЕЛЕНИЯ (для всех модулей):
 *  1. WS.Spr.def(name, {w, h, frames?, dirs?, draw(c, w, h, frame, dir)}) — рисование кодом.
 *  2. WS.Spr.defmap(name, rows, legend, scale?) — ASCII-карта: строки из символов,
 *     каждый символ — цвет из legend. '.' = прозрачный.
 *     Несколько кадров: WS.Spr.defmap('hero_walk', [...], legend, 2, 4) — фреймы через
 *     WS.Spr.defmapFrame или имя вида 'name@2'. Проще: defmap с массивом массивов.
 *
 * Палитра проекта: холодная, приглушённая (см. WS.Spr.pal).
 */
(function () {
  'use strict';

  var cache = {};      // "name|frame|dir" -> canvas
  var specs = {};      // name -> spec

  var pal = {
    // природа
    snow1: '#e2e8f0', snow2: '#d3dbe6', snow3: '#bcc7d6', snowShadow: '#9fb0c4',
    ice: '#a9c6dd', ice2: '#8fb4d1', water: '#22344c', water2: '#2c425e',
    grassF: '#75826a', grassF2: '#5f6b55', dirt: '#4c453a', dirt2: '#5d5548',
    mud: '#3c352c', gravel: '#6a6d74', tree: '#3d4a3c', tree2: '#4d5c4a',
    trunk: '#4a3a2a',
    // постройки
    wood: '#6b5138', wood2: '#57422e', wood3: '#7d6046', plank: '#8a6d50',
    brick: '#7a4a3c', brick2: '#8d584a', stone: '#767a82', stone2: '#5f636b',
    roof: '#5f4a44', roof2: '#6d5750', paper: '#c9c2b4',
    // люди
    skin: '#c9a186', skin2: '#a97f66', fur: '#7d6a52', fur2: '#8f7c63',
    coat: '#4a5568', coat2: '#3c4656', pants: '#3b3f4a', boot: '#2c2620',
    // звери
    wolf: '#8b909b', wolf2: '#a7adb8', wolfDark: '#5a5f6a',
    bear: '#4e3b2c', bear2: '#634c39', deer: '#96714f', hare: '#c8ccd2',
    // акценты
    ember: '#e2924a', ember2: '#f4b968', blood: '#7a2020', steel: '#aab2bc',
    brass: '#b9903f', canvasCloth: '#a89a7c', night: '#101828'
  };

  /** Регистрация спрайта-функции. */
  function def(name, spec) {
    spec = spec || {};
    specs[name] = spec;
    return spec;
  }

  /** Регистрация ASCII-карты. rows: массив строк, legend: {char: color}. */
  function defmap(name, rows, legend, scale, variants) {
    scale = scale || 2;
    var h = rows.length;
    var w = 0;
    for (var i = 0; i < rows.length; i++) w = Math.max(w, rows[i].length);
    def(name, {
      w: w * scale, h: h * scale, map: rows, legend: legend, scale: scale,
      variants: variants || 1,
      draw: function (c, W, H, frame, dir, vx) {
        var rows2 = rows;
        if (variants && vx !== undefined && specOf(name).varMaps) {
          rows2 = specOf(name).varMaps[vx] || rows;
        }
        for (var y = 0; y < rows2.length; y++) {
          var line = rows2[y];
          for (var x = 0; x < line.length; x++) {
            var ch = line.charAt(x);
            if (ch === '.' || ch === ' ') continue;
            var col = legend[ch];
            if (!col) continue;
            c.fillStyle = col;
            c.fillRect(x * scale, y * scale, scale, scale);
          }
        }
      }
    });
  }

  /** Дополнительная карта-вариация для уже определённого имени (например, другие лица). */
  function defmapVar(name, index, rows) {
    var sp = specs[name];
    if (!sp) return;
    if (!sp.varMaps) sp.varMaps = [];
    sp.varMaps[index] = rows;
  }

  function specOf(name) { return specs[name]; }

  /** Получить готовый canvas спрайта. frame/dir/variant влияют на ключ. */
  function get(name, frame, dir, variant) {
    frame = frame || 0; dir = dir || 0; variant = variant || 0;
    var key = name + '|' + frame + '|' + dir + '|' + variant;
    var c = cache[key];
    if (c) return c;
    var sp = specs[name];
    if (!sp) return null;
    var cv = document.createElement('canvas');
    cv.width = sp.w; cv.height = sp.h;
    var c2 = cv.getContext('2d');
    c2.imageSmoothingEnabled = false;
    try {
      sp.draw(c2, sp.w, sp.h, frame, dir, variant);
    } catch (e) {
      WS.err('sprite "' + name + '" failed', e);
      // заглушка — красный крест
      c2.fillStyle = '#802020';
      c2.fillRect(0, 0, sp.w, sp.h);
    }
    cache[key] = cv;
    return cv;
  }

  /** Заливка с защищёнными параметрами (для draw-функций). */
  function px(c, x, y, w, h, col) {
    c.fillStyle = col;
    c.fillRect(x, y, w, h);
  }

  /** Эллипс. */
  function ell(c, x, y, rx, ry, col) {
    c.fillStyle = col;
    c.beginPath();
    c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    c.fill();
  }

  /** Тень под сущностью: сплюснутый эллипс, размер от e.shadowR. */
  function shadow(e) {
    var r = e.shadowR || 0.35;
    var px = Math.max(6, Math.round(r * 64));
    var key = 'shadow|' + px;
    var c = cache[key];
    if (c) return c;
    var cv = document.createElement('canvas');
    cv.width = px * 2; cv.height = Math.round(px * 0.8);
    var c2 = cv.getContext('2d');
    var g = c2.createRadialGradient(px, px * 0.4, 0, px, px * 0.4, px);
    g.addColorStop(0, 'rgba(8,12,22,0.34)');
    g.addColorStop(0.7, 'rgba(8,12,22,0.22)');
    g.addColorStop(1, 'rgba(8,12,22,0)');
    c2.fillStyle = g;
    c2.fillRect(0, 0, cv.width, cv.height);
    cache[key] = cv;
    return cv;
  }

  /** Террейн-тайл: возвращает canvas 64x32 (или с наледью/сугробами). */
  var T = null; // WS.World.T — заполняется после boot
  function tile(t, tx, ty) {
    var h = WS.RNG.hash2(tx, ty, 777);
    var variant = h < 0.5 ? 0 : (h < 0.8 ? 1 : 2);
    var name = 'T' + t;
    // снежная кромка поверх травы: вариант 2
    return get(name, variant, 0, ((tx * 31 + ty * 17) % 5));
  }

  function tileOverlay(t, tx, ty) {
    // пятна, трещины, следы — редкие детали поверх тайла
    return null;
  }

  // ---------------------------------------------------------------- базовые тайлы
  // Каждому типу terрейна — процедурная отрисовка с вариациями.
  function terrainSpecs() {
    T = WS.World && WS.World.T ? WS.World.T : null;
    if (!T) T = { VOID: 0, GRASS: 1, GRASS2: 2, DIRT: 3, ROAD: 4, ROAD_SIDE: 5, SIDEWALK: 6,
      WATER: 7, ICE: 8, SHORE: 9, SNOW: 10, SNOW_DEEP: 11, FLOOR_WOOD: 12, FLOOR_TILE: 13,
      FLOOR_CONCRETE: 14, FLOOR_DIRT: 15, WALL_WOOD: 16, WALL_BRICK: 17, WALL_LOG: 18,
      WINDOW: 19, DOOR: 20, DOORWAY: 21, STAIRS: 22, PORCH: 23, RAIL: 24, BRIDGE: 25, MUD: 26,
      GRAVEL: 27, FARMLAND: 28, FENCE: 29, WALL_STONE: 30, CRYPT: 31 };

    // ромб тайла 64x32
    function diamond(c, colTop, colL, colR, colBot) {
      c.clearRect(0, 0, 64, 32);
      // верхняя половина
      for (var y = 0; y < 16; y++) {
        var wdt = (y + 1) * 4;
        c.fillStyle = colTop;
        c.fillRect(32 - wdt / 2, y, wdt, 1);
      }
      for (var y2 = 16; y2 < 32; y2++) {
        var wd2 = (32 - y2) * 4;
        c.fillStyle = colTop;
        c.fillRect(32 - wd2 / 2, y2, wd2, 1);
      }
    }

    def('T' + T.SNOW, { w: 64, h: 32, variants: 5, draw: function (c, w, h, f, d, v) {
      diamond(c, v === 1 ? pal.snow2 : pal.snow1, 0, 0, 0);
      if (v === 2) { c.fillStyle = pal.snow3; c.fillRect(24, 10, 10, 4); c.fillRect(40, 20, 8, 3); }
      if (v === 3) { c.fillStyle = pal.snowShadow; c.fillRect(30, 14, 6, 2); c.fillRect(44, 8, 5, 2); }
      if (v === 4) { c.fillStyle = pal.snow2; c.fillRect(18, 18, 12, 4); }
    }});
    def('T' + T.SNOW_DEEP, { w: 64, h: 40, draw: function (c, w, h) {
      diamond(c, pal.snow2, 0, 0, 0);
      c.fillStyle = pal.snowShadow; c.fillRect(20, 12, 24, 6);
      c.fillStyle = pal.snow1; c.fillRect(22, 10, 20, 4);
    }});
    def('T' + T.GRASS, { w: 64, h: 32, variants: 5, draw: function (c, w, h, f, d, v) {
      diamond(c, '#979d90', 0, 0, 0);      // зимняя сухая трава, выбеленная инеем
      c.fillStyle = '#767c6c';
      if (v >= 2) { c.fillRect(28, 12, 4, 2); c.fillRect(38, 18, 4, 2); }
      if (v >= 3) c.fillRect(22, 20, 5, 2);
      // плотный иней поверх — ВСЕГДА (глубокая зима)
      c.fillStyle = 'rgba(226,232,240,0.7)';
      c.fillRect(26, 8, 12, 3); c.fillRect(36, 16, 8, 2); c.fillRect(20, 15, 7, 2);
      c.fillStyle = 'rgba(214,223,232,0.5)';
      c.fillRect(30, 20, 10, 3); c.fillRect(16, 10, 6, 2);
    }});
    def('T' + T.GRASS2, { w: 64, h: 32, variants: 5, draw: function (c, w, h, f, d, v) {
      diamond(c, '#8b9084', 0, 0, 0);
      c.fillStyle = 'rgba(226,232,240,0.62)'; c.fillRect(24, 10, 16, 4); c.fillRect(34, 18, 9, 3);
      c.fillStyle = 'rgba(214,223,232,0.45)'; c.fillRect(18, 14, 10, 3); c.fillRect(38, 8, 8, 3);
    }});
    def('T' + T.DIRT, { w: 64, h: 32, variants: 5, draw: function (c, w, h, f, d, v) {
      diamond(c, pal.dirt, 0, 0, 0);
      if (v === 2) { c.fillStyle = pal.dirt2; c.fillRect(26, 14, 8, 3); }
    }});
    def('T' + T.ROAD, { w: 64, h: 32, variants: 5, draw: function (c, w, h, f, d, v) {
      diamond(c, '#565b64', 0, 0, 0);
      // колеи и снег по краям
      c.fillStyle = '#606670'; c.fillRect(24, 12, 16, 6);
      c.fillStyle = 'rgba(214,223,232,0.7)'; c.fillRect(18, 6, 10, 4); c.fillRect(40, 20, 10, 4);
      if (v === 1) { c.fillStyle = 'rgba(226,232,240,0.5)'; c.fillRect(30, 10, 6, 3); }
    }});
    def('T' + T.ROAD_SIDE, { w: 64, h: 32, variants: 5, draw: function (c) {
      diamond(c, '#4d525b', 0, 0, 0);
      c.fillStyle = 'rgba(214,223,232,0.55)'; c.fillRect(20, 8, 24, 14);
    }});
    def('T' + T.SIDEWALK, { w: 64, h: 32, variants: 5, draw: function (c) {
      diamond(c, '#787d86', 0, 0, 0);
      c.fillStyle = '#63686f'; c.fillRect(20, 14, 24, 4);
      c.fillStyle = 'rgba(214,223,232,0.5)'; c.fillRect(26, 8, 12, 3);
    }});
    def('T' + T.GRAVEL, { w: 64, h: 32, variants: 5, draw: function (c, w, h, f, d, v) {
      diamond(c, pal.gravel, 0, 0, 0);
      c.fillStyle = '#5b5e66'; if (v > 1) { c.fillRect(24, 12, 4, 2); c.fillRect(38, 18, 4, 2); }
    }});
    def('T' + T.MUD, { w: 64, h: 32, variants: 5, draw: function (c) {
      diamond(c, pal.mud, 0, 0, 0);
      c.fillStyle = '#463f35'; c.fillRect(26, 14, 10, 3);
    }});
    def('T' + T.FARMLAND, { w: 64, h: 32, variants: 5, draw: function (c) {
      diamond(c, '#4f4a3a', 0, 0, 0);
      c.fillStyle = '#5c5643'; c.fillRect(20, 10, 24, 2); c.fillRect(20, 16, 24, 2); c.fillRect(20, 22, 24, 2);
      c.fillStyle = 'rgba(226,232,240,0.45)'; c.fillRect(22, 8, 20, 3);
    }});
    def('T' + T.WATER, { w: 64, h: 32, variants: 5, draw: function (c, w, h, f, d, v) {
      diamond(c, pal.water, 0, 0, 0);
      c.fillStyle = pal.water2; c.fillRect(26, 12, 12, 3); c.fillRect(34, 18, 8, 2);
      if (v >= 3) { c.fillStyle = '#3d5474'; c.fillRect(22, 16, 8, 2); }
    }});
    def('T' + T.ICE, { w: 64, h: 32, variants: 5, draw: function (c, w, h, f, d, v) {
      diamond(c, pal.ice, 0, 0, 0);
      c.fillStyle = pal.ice2; c.fillRect(24, 10, 14, 4);
      if (v === 2) { c.fillStyle = '#c3d8ea'; c.fillRect(36, 16, 8, 2); }
      // трещины
      if (v === 3) { c.fillStyle = '#7da0c0'; c.fillRect(28, 14, 2, 8); c.fillRect(30, 20, 6, 2); }
    }});
    def('T' + T.SHORE, { w: 64, h: 32, variants: 5, draw: function (c) {
      diamond(c, pal.dirt2, 0, 0, 0);
      c.fillStyle = '#5d6b7c'; c.fillRect(24, 12, 16, 5);
      c.fillStyle = 'rgba(226,232,240,0.5)'; c.fillRect(28, 8, 10, 3);
    }});
    def('T' + T.FLOOR_WOOD, { w: 64, h: 32, variants: 5, draw: function (c, w, h, f, d, v) {
      diamond(c, pal.wood3, 0, 0, 0);
      c.fillStyle = pal.wood;
      c.fillRect(18, 12, 8, 2); c.fillRect(30, 8, 8, 2); c.fillRect(38, 18, 8, 2);
      c.fillStyle = pal.wood2; c.fillRect(24, 16, 10, 2);
    }});
    def('T' + T.FLOOR_DIRT, { w: 64, h: 32, variants: 5, draw: function (c) {
      diamond(c, '#4e463a', 0, 0, 0);
      c.fillStyle = '#453d33'; c.fillRect(26, 14, 8, 3);
    }});
    def('T' + T.FLOOR_TILE, { w: 64, h: 32, variants: 5, draw: function (c) {
      diamond(c, '#9a9a90', 0, 0, 0);
      c.fillStyle = '#84847b'; c.fillRect(20, 10, 24, 2); c.fillRect(20, 20, 24, 2);
      c.fillStyle = 'rgba(226,232,240,0.35)'; c.fillRect(24, 6, 16, 3);
    }});
    def('T' + T.FLOOR_CONCRETE, { w: 64, h: 32, variants: 5, draw: function (c) {
      diamond(c, '#6e7178', 0, 0, 0);
      c.fillStyle = '#61646b'; c.fillRect(22, 12, 20, 4);
    }});
    def('T' + T.BRIDGE, { w: 64, h: 32, variants: 5, draw: function (c) {
      diamond(c, pal.plank, 0, 0, 0);
      c.fillStyle = pal.wood2; c.fillRect(20, 10, 24, 3); c.fillRect(20, 19, 24, 3);
    }});

    // стены — КУБЫ 64x64: полный ромб-верх (32px, стыкуется с соседями в
    // сплошную стену) + южные грани вниз до земли. Низ якорится в ромб тайла.
    // Геометрия: верхний ромб N(32,1) W(0,17) E(64,17) S(32,33);
    // базовый ромб (у земли) N(32,33) W(0,49) E(64,49) S(32,63).
    function wall(c, topCol, face, faceDark, detail) {
      // ЮЗ грань: от W(0,17) S(32,33) вниз до W(0,49) S(32,63)
      c.fillStyle = face;
      c.beginPath();
      c.moveTo(0, 17); c.lineTo(32, 33); c.lineTo(32, 63); c.lineTo(0, 47); c.closePath();
      c.fill();
      // ЮВ грань: от S(32,33) E(64,17) вниз до S(32,63) E(64,47)
      c.fillStyle = faceDark;
      c.beginPath();
      c.moveTo(32, 33); c.lineTo(64, 17); c.lineTo(64, 47); c.lineTo(32, 63); c.closePath();
      c.fill();
      // верхняя плоскость — полный ромб со снегом
      diamondAt(c, 1, topCol);
      // снег на верхней кромке
      c.fillStyle = 'rgba(226,232,240,0.85)';
      c.fillRect(10, 12, 44, 5); c.fillRect(18, 8, 28, 4); c.fillRect(6, 17, 18, 3); c.fillRect(40, 17, 18, 3);
      c.fillStyle = 'rgba(214,223,232,0.5)';
      c.fillRect(24, 6, 16, 2);
      if (detail) detail(c);
      // лёгкая тень под верхней кромкой на гранях
      c.fillStyle = 'rgba(8,12,22,0.22)';
      c.fillRect(1, 33, 30, 2); c.fillRect(33, 33, 30, 2);
    }

    /** Ромб-верх стены: вершина (32, y0), полширины 32, полвысоты 16. */
    function diamondAt(c, y0, col) {
      for (var y = 0; y < 16; y++) {
        var wdt = (y + 1) * 4;
        c.fillStyle = col;
        c.fillRect(32 - wdt / 2, y0 + y, wdt, 1);
        c.fillRect(32 - wdt / 2, y0 + 31 - y, wdt, 1);
      }
    }

    def('T' + T.WALL_WOOD, { w: 64, h: 64, draw: function (c) {
      wall(c, '#6e6a5e', pal.wood, pal.wood2, function (c) {
        // вертикальные доски на ЮЗ грани
        c.fillStyle = pal.wood2;
        for (var i = 0; i < 4; i++) c.fillRect(4 + i * 7, 20 + i * 3.5, 1, 26);
        // и на ЮВ
        for (var k = 0; k < 4; k++) c.fillRect(34 + k * 7, 18 + (3 - k) * 3.5, 1, 26);
      });
    }});
    def('T' + T.WALL_BRICK, { w: 64, h: 64, draw: function (c) {
      wall(c, '#6e6258', pal.brick, pal.brick2, function (c) {
        c.fillStyle = '#6b4034';
        for (var r = 0; r < 7; r++) {
          for (var k = 0; k < 5; k++) {
            c.fillRect(2 + k * 6 + (r % 2 ? 3 : 0), 21 + r * 6, 5, 1);
            c.fillRect(34 + k * 6 + (r % 2 ? 3 : 0), 19 + r * 6, 5, 1);
          }
        }
      });
    }});
    def('T' + T.WALL_STONE, { w: 64, h: 64, draw: function (c) {
      wall(c, '#71757d', pal.stone, pal.stone2, function (c) {
        c.fillStyle = pal.stone2;
        c.fillRect(6, 24, 10, 8); c.fillRect(19, 34, 12, 8); c.fillRect(8, 46, 9, 7);
        c.fillRect(38, 22, 11, 8); c.fillRect(50, 36, 10, 8); c.fillRect(40, 48, 9, 6);
        c.fillStyle = 'rgba(226,232,240,0.35)';
        c.fillRect(6, 23, 10, 2); c.fillRect(38, 21, 11, 2);
      });
    }});
    def('T' + T.WALL_LOG, { w: 64, h: 64, draw: function (c) {
      wall(c, '#5f4c36', '#5c4730', '#4c3a27', function (c) {
        // горизонтальные венцы
        c.fillStyle = '#43331f';
        for (var r = 0; r < 6; r++) {
          c.fillRect(1, 22 + r * 7, 29, 1);
          c.fillRect(34, 20 + r * 7, 29, 1);
        }
        // торцы брёвен
        c.fillStyle = '#7d6046';
        c.fillRect(1, 24, 2, 4); c.fillRect(1, 38, 2, 4);
        c.fillRect(61, 22, 2, 4); c.fillRect(61, 36, 2, 4);
      });
    }});

    // окно и дверь — вставки в стену (та же геометрия куба, проём на ЮВ грани)
    def('T' + T.WINDOW, { w: 64, h: 64, draw: function (c) {
      wall(c, '#6e6a5e', pal.wood, pal.wood2, function (c) {
        // окно на ЮВ грани
        c.fillStyle = '#3e2f1f'; c.fillRect(41, 27, 16, 17);
        c.fillStyle = '#1d2b3d'; c.fillRect(42, 28, 14, 15);
        c.fillStyle = '#2c425e'; c.fillRect(43, 29, 12, 6);
        // тёплый свет внутри
        c.fillStyle = 'rgba(226,146,74,0.45)'; c.fillRect(43, 29, 12, 13);
        // рама
        c.fillStyle = pal.wood2; c.fillRect(41, 26, 16, 1); c.fillRect(41, 44, 16, 1);
        c.fillRect(48, 27, 1, 17);
        // снежный подоконник
        c.fillStyle = 'rgba(226,232,240,0.9)'; c.fillRect(40, 45, 18, 2);
      });
    }});
    def('T' + T.DOOR, { w: 64, h: 64, draw: function (c) {
      wall(c, '#6e6a5e', pal.wood, pal.wood2, function (c) {
        // дверь на ЮВ грани
        c.fillStyle = '#241a10'; c.fillRect(41, 25, 16, 26);
        c.fillStyle = '#54402b'; c.fillRect(42, 26, 14, 24);
        c.fillStyle = '#3e2f1f'; c.fillRect(48, 26, 1, 24); c.fillRect(42, 36, 14, 1);
        c.fillStyle = pal.brass; c.fillRect(53, 36, 2, 2);
        // снег у порога
        c.fillStyle = 'rgba(226,232,240,0.8)'; c.fillRect(40, 50, 18, 2);
      });
    }});
    def('T' + T.DOORWAY, { w: 64, h: 64, draw: function (c) {
      wall(c, '#6e6a5e', pal.wood, pal.wood2, function (c) {
        // тёмный проём на ЮВ грани
        c.fillStyle = '#0a0806';
        c.beginPath();
        c.moveTo(41, 25); c.lineTo(57, 25); c.lineTo(57, 50); c.lineTo(41, 50); c.closePath();
        c.fill();
      });
    }});
    def('T' + T.STAIRS, { w: 64, h: 32, draw: function (c) {
      diamond(c, '#6e7178', 0, 0, 0);
      c.fillStyle = '#5c5f66'; c.fillRect(22, 10, 20, 4); c.fillRect(26, 14, 12, 4);
    }});
    def('T' + T.PORCH, { w: 64, h: 32, draw: function (c) {
      diamond(c, pal.plank, 0, 0, 0);
      c.fillStyle = pal.wood2; c.fillRect(18, 10, 28, 2); c.fillRect(18, 20, 28, 2);
    }});
    def('T' + T.RAIL, { w: 64, h: 40, draw: function (c) {
      c.clearRect(0, 0, 64, 40);
      // штакетник-ограждение: столбы до низа канваса (база — центр тайла)
      c.fillStyle = '#6a5a46';
      c.fillRect(29, 6, 5, 34); c.fillRect(13, 12, 5, 28); c.fillRect(45, 12, 5, 28);
      c.fillStyle = '#7d6a52';
      c.fillRect(29, 6, 2, 34); c.fillRect(13, 12, 2, 28); c.fillRect(45, 12, 2, 28);
      // перекладины
      c.fillStyle = '#7d6a52';
      c.fillRect(14, 14, 36, 3); c.fillRect(14, 24, 36, 3);
      // снег сверху
      c.fillStyle = 'rgba(226,232,240,0.9)';
      c.fillRect(12, 12, 38, 2); c.fillRect(28, 5, 7, 2); c.fillRect(44, 11, 7, 2);
    }});
    def('T' + T.FENCE, { w: 64, h: 48, draw: function (c) {
      c.clearRect(0, 0, 64, 48);
      // забор-штакетник: столбы до низа (база — центр тайла)
      c.fillStyle = '#6a5238';
      c.fillRect(28, 10, 6, 38); c.fillRect(10, 16, 6, 32); c.fillRect(46, 16, 6, 32);
      c.fillStyle = '#7d6046';
      c.fillRect(28, 10, 3, 38); c.fillRect(10, 16, 3, 32); c.fillRect(46, 16, 3, 32);
      // горизонтальные прожилины
      c.fillStyle = '#7d6046';
      c.fillRect(10, 20, 42, 4); c.fillRect(10, 30, 42, 4);
      c.fillStyle = '#57422e';
      c.fillRect(10, 23, 42, 1); c.fillRect(10, 33, 42, 1);
      // снег на кромке
      c.fillStyle = 'rgba(226,232,240,0.85)';
      c.fillRect(9, 15, 44, 3); c.fillRect(27, 8, 8, 3); c.fillRect(45, 14, 8, 3);
    }});
    def('T' + T.CRYPT, { w: 64, h: 64, draw: function (c) {
      wall(c, '#6f737b', '#5c6068', '#4c5058', function (c) {
        c.fillStyle = '#23272f'; c.fillRect(43, 30, 12, 20);
        c.fillStyle = '#3a3e46'; c.fillRect(44, 31, 10, 18);
        c.fillStyle = 'rgba(226,232,240,0.5)'; c.fillRect(42, 50, 14, 2);
      });
    }});
    def('T' + T.VOID, { w: 64, h: 32, draw: function (c) {
      diamond(c, '#0a0e14', 0, 0, 0);
    }});
  }

  WS.boot(function initSprites() {
    terrainSpecs();
  }, 'spr:init');

  WS.def('Spr', {
    def: def, defmap: defmap, defmapVar: defmapVar,
    get: get, px: px, ell: ell, shadow: shadow,
    tile: tile, tileOverlay: tileOverlay,
    pal: pal, specs: function () { return specs; },
    cacheSize: function () { return Object.keys(cache).length; }
  });
})();
