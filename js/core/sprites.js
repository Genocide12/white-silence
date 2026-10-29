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
      diamond(c, pal.grassF, 0, 0, 0);
      c.fillStyle = pal.grassF2;
      if (v >= 2) { c.fillRect(28, 12, 4, 2); c.fillRect(38, 18, 4, 2); }
      if (v >= 3) c.fillRect(22, 20, 5, 2);
      // тонкий снег поверх
      c.fillStyle = 'rgba(226,232,240,0.55)';
      c.fillRect(26, 8, 12, 3); c.fillRect(36, 16, 8, 2);
    }});
    def('T' + T.GRASS2, { w: 64, h: 32, variants: 5, draw: function (c, w, h, f, d, v) {
      diamond(c, pal.grassF2, 0, 0, 0);
      c.fillStyle = 'rgba(226,232,240,0.4)'; c.fillRect(24, 10, 16, 4);
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

    // стены — высокие (64x64): верхняя кромка + лицевая сторона
    function wall(c, top, face, faceDark, trim) {
      c.clearRect(0, 0, 64, 64);
      // верхняя плоскость (ромб, приподнятый на 32)
      for (var y = 0; y < 16; y++) {
        var wd = (y + 1) * 4;
        c.fillStyle = top;
        c.fillRect(32 - wd / 2, 15 - y, wd, 1);
        c.fillStyle = trim || faceDark;
        c.fillRect(32 - wd / 2, 15 - y, wd, 1);
      }
      // левая грань
      c.fillStyle = face;
      for (var i = 0; i < 16; i++) {
        c.fillRect(16 - i, 16 + i, 2, 32);
      }
      c.beginPath(); c.moveTo(16, 16); c.lineTo(0, 32); c.lineTo(0, 48); c.lineTo(16, 48); c.closePath(); c.fill();
      // правая грань
      c.fillStyle = faceDark;
      c.beginPath(); c.moveTo(48, 16); c.lineTo(64, 32); c.lineTo(64, 48); c.lineTo(48, 48); c.closePath(); c.fill();
      // центральная колонна
      c.fillStyle = face; c.fillRect(16, 16, 32, 32);
      c.fillStyle = faceDark; c.fillRect(40, 16, 8, 32);
    }
    def('T' + T.WALL_WOOD, { w: 64, h: 64, draw: function (c) {
      wall(c, '#7d6046', pal.wood, pal.wood2);
      c.fillStyle = pal.wood2;
      for (var i = 0; i < 6; i++) c.fillRect(20 + i * 4, 18, 1, 28);
    }});
    def('T' + T.WALL_BRICK, { w: 64, h: 64, draw: function (c) {
      wall(c, '#8d584a', pal.brick, pal.brick2);
      c.fillStyle = '#6b4034';
      for (var r = 0; r < 6; r++) for (var k = 0; k < 6; k++) {
        c.fillRect(18 + k * 6 + (r % 2 ? 3 : 0), 18 + r * 5, 5, 1);
      }
    }});
    def('T' + T.WALL_STONE, { w: 64, h: 64, draw: function (c) {
      wall(c, '#83878f', pal.stone, pal.stone2);
      c.fillStyle = pal.stone2;
      c.fillRect(20, 22, 10, 8); c.fillRect(34, 34, 12, 8); c.fillRect(22, 40, 8, 6);
    }});
    def('T' + T.WALL_LOG, { w: 64, h: 64, draw: function (c) {
      wall(c, '#6a5238', '#5c4730', '#4c3a27');
      c.fillStyle = '#4c3a27';
      for (var r = 0; r < 7; r++) c.fillRect(18, 18 + r * 4, 28, 1);
    }});

    // окно и дверь — вставки в стену
    def('T' + T.WINDOW, { w: 64, h: 64, draw: function (c) {
      wall(c, '#7d6046', pal.wood, pal.wood2);
      c.fillStyle = '#1d2b3d'; c.fillRect(24, 24, 16, 16);
      c.fillStyle = '#2c425e'; c.fillRect(25, 25, 14, 7);
      c.fillStyle = pal.wood2; c.fillRect(23, 23, 18, 1); c.fillRect(23, 40, 18, 1);
      c.fillRect(31, 24, 1, 16);
      // тёплый свет внутри (виден вечером)
      c.fillStyle = 'rgba(226,146,74,0.25)'; c.fillRect(25, 25, 14, 14);
    }});
    def('T' + T.DOOR, { w: 64, h: 64, draw: function (c) {
      wall(c, '#7d6046', pal.wood, pal.wood2);
      c.fillStyle = '#3e2f1f'; c.fillRect(24, 20, 16, 28);
      c.fillStyle = '#54402b'; c.fillRect(25, 21, 14, 26);
      c.fillStyle = '#3e2f1f'; c.fillRect(31, 21, 1, 26);
      c.fillStyle = pal.brass; c.fillRect(36, 34, 2, 2);
    }});
    def('T' + T.DOORWAY, { w: 64, h: 64, draw: function (c) {
      c.clearRect(0, 0, 64, 64);
      // тёмный проём
      c.fillStyle = '#0e0c0a';
      c.beginPath(); c.moveTo(22, 22); c.lineTo(42, 22); c.lineTo(42, 48); c.lineTo(22, 48); c.closePath(); c.fill();
    }});
    def('T' + T.STAIRS, { w: 64, h: 32, draw: function (c) {
      diamond(c, '#6e7178', 0, 0, 0);
      c.fillStyle = '#5c5f66'; c.fillRect(22, 10, 20, 4); c.fillRect(26, 14, 12, 4);
    }});
    def('T' + T.PORCH, { w: 64, h: 32, draw: function (c) {
      diamond(c, pal.plank, 0, 0, 0);
      c.fillStyle = pal.wood2; c.fillRect(18, 10, 28, 2); c.fillRect(18, 20, 28, 2);
    }});
    def('T' + T.RAIL, { w: 64, h: 32, draw: function (c) {
      c.clearRect(0, 0, 64, 32);
      c.fillStyle = '#4a4238';
      c.fillRect(30, 8, 4, 16); c.fillRect(14, 16, 4, 8); c.fillRect(46, 16, 4, 8);
      c.fillStyle = 'rgba(200,205,214,0.8)';
      c.fillRect(18, 14, 28, 2);
    }});
    def('T' + T.FENCE, { w: 64, h: 48, draw: function (c) {
      c.clearRect(0, 0, 64, 48);
      c.fillStyle = '#5c4730';
      c.fillRect(28, 14, 6, 26); c.fillRect(10, 20, 6, 20); c.fillRect(46, 20, 6, 20);
      c.fillStyle = '#6a5238';
      c.fillRect(10, 18, 42, 4); c.fillRect(10, 28, 42, 4);
      c.fillStyle = 'rgba(226,232,240,0.6)'; c.fillRect(10, 16, 42, 3);
    }});
    def('T' + T.CRYPT, { w: 64, h: 64, draw: function (c) {
      wall(c, '#6f737b', '#5c6068', '#4c5058');
      c.fillStyle = '#2c3038'; c.fillRect(26, 30, 12, 18);
      c.fillStyle = '#42464e'; c.fillRect(27, 31, 10, 16);
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
