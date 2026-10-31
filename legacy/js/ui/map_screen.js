/**
 * map_screen.js — ЭКРАН КАРТЫ «Белого Безмолвия» (клавиша M).
 * Полноэкранная карта мира 220x220 тайлов, отрисованная в канвас 660x660
 * (масштаб x3, со сглаживанием): река, лёд, лес, дороги, застройка.
 * Туман войны: исследуются области вокруг игрока (WS.G.story.explored,
 * тик 20, радиус 12 тайлов каждые 2 сек, чанками). Маркеры: дома, вокзал
 * (звезда), кладбище, пристань, обысканные схроны, трупы, волчьи
 * территории (при навыке «Следопыт» >= 4), позиция игрока (стрелка по dir).
 * Связи: World (tiles/buildings/objects), Wolf.packs, Skills.lvid,
 * Health/Time для подписей, Ui — модальность (.ws-screen.open).
 */
(function () {
  'use strict';

  // ====================================================================
  //  КОНСТАНТЫ
  // ====================================================================

  var TICK_UI = 80;            // приоритет UI (CONTRACT.md)
  var TICK_WORLD = 20;         // туман войны — приоритет мира

  var WORLD_W = 220;           // размер мира в тайлах (договор world.js)
  var WORLD_H = 220;
  var VIEW = 660;              // видимый канвас, 220 * 3 (по ТЗ)

  var REVEAL_R = 12;           // радиус обзора игрока в тайлах (по ТЗ)
  var REVEAL_EVERY = 2.0;      // сек между «оглядами» (по ТЗ)
  var CHUNK_TILES = 110;       // тайлов за один тик (чанками, по ТЗ)
  var MIN_JOB_DIST = 4;       // мин. смещение для нового «огляда»

  var ZOOM_MIN = 2.6;          // чуть меньше всей карты (свободный край)
  var ZOOM_MAX = 26;           // подробный зум
  var ZOOM_DEF = 3;            // вся карта целиком (660 / 220)

  // ---- палитра тайлов: имена соответствуют WS.World.T ---------------
  var TILE_COLORS = {
    VOID:           '#04060b',
    GRASS:          '#2c3a2c',
    GRASS2:         '#33422f',
    DIRT:           '#3a342c',
    ROAD:           '#46423d',
    ROAD_SIDE:      '#3d3a37',
    SIDEWALK:       '#453f38',
    WATER:          '#16293b',
    ICE:            '#6f93ac',
    SHORE:          '#4e4a3e',
    SNOW:           '#9fabb9',
    SNOW_DEEP:      '#8c9aa9',
    FLOOR_WOOD:     '#57432f',
    FLOOR_TILE:     '#5e5e5c',
    FLOOR_CONCRETE: '#4e5053',
    FLOOR_DIRT:     '#3a342c',
    WALL_WOOD:      '#6b5436',
    WALL_BRICK:     '#6f4636',
    WALL_LOG:       '#5e462b',
    WINDOW:         '#7f98a8',
    DOOR:           '#7c6034',
    DOORWAY:        '#63492a',
    STAIRS:         '#5a5a58',
    PORCH:          '#645f56',
    RAIL:           '#4c4842',
    BRIDGE:         '#655130',
    MUD:            '#2f3229',
    GRAVEL:         '#484440',
    FARMLAND:       '#42392b',
    FENCE:          '#5c4e39',
    WALL_STONE:     '#585650',
    CRYPT:          '#43434c'
  };
  var TILE_DEFAULT = '#0d1119';

  // ---- цвета объектов-«пятен» ландшафта (слой поверх тайлов) --------
  var FOREST_SPRITES = {
    tree_pine:      '#1d2f22',
    tree_pine_small:'#243a29',
    tree_birch:     '#33452e',
    tree_dead:      '#3b3a32',
    bush:           '#26301f',
    rock:           '#3f4348',
    stump:          '#4a3d2a',
    log_fallen:     '#443626',
    reed:           '#565636'
  };

  // ---- цвета зданий по типу (мета из gen_town.js) --------------------
  var BUILD_COLORS = {
    telegraph:   '#e8c470',
    church:      '#c8b060',
    store:       '#b57f3e',
    tavern:      '#a86a3a',
    doctor:      '#7ea3c4',
    school:      '#9aa7b8',
    jail:        '#8a8f98',
    izba:        '#8a6f4d',
    izba_rich:   '#9a7f55',
    dacha:       '#8a7a62',
    barn:        '#7a6a52',
    granary:     '#7d6d55',
    stable:      '#7d6c58',
    cellar:      '#6f6350',
    smithy:      '#6e6058',
    sawmill:     '#75665a',
    warehouse:   '#71645a',
    banya:       '#7f8f7a',
    fishing_hut: '#6f7f8a',
    guardtower:  '#8f8a7a',
    ruined:      '#5f5a52'
  };
  var BUILD_DEFAULT = '#8a7a5f';

  // ---- русские имена типов зданий (для подписи при наведении) --------
  var BUILD_NAMES = {
    telegraph: 'Вокзал (телеграф)',
    church: 'Церковь',
    store: 'Лавка',
    tavern: 'Трактир',
    doctor: 'Фельдшерский пункт',
    school: 'Школа',
    jail: 'Участок',
    izba: 'Изба',
    izba_rich: 'Дом зажиточный',
    dacha: 'Дача',
    barn: 'Амбар',
    granary: 'Житница',
    stable: 'Конюшня',
    cellar: 'Погреб',
    smithy: 'Кузня',
    sawmill: 'Пилорама',
    warehouse: 'Склад',
    banya: 'Баня',
    fishing_hut: 'Рыбацкая избушка',
    guardtower: 'Дозорная вышка',
    ruined: 'Погорелица'
  };

  // русские имена зверей (для подписи трупов)
  var CORPSE_NAMES = {
    wolf: 'волк',
    bear: 'медведь',
    deer: 'олень',
    hare: 'заяц',
    bandit: 'бандит',
    crow: 'ворона',
    hermit: 'отшельник'
  };

  // ====================================================================
  //  СОСТОЯНИЕ МОДУЛЯ
  // ====================================================================

  var root = null;             // .ws-screen корень
  var canvas = null;           // видимый канвас 660x660
  var ctx = null;              // его 2d-контекст

  var terrainCv = null;         // офф-скрин 220x220: тайлы
  var forestCv = null;          // офф-скрин 220x220: лес/камни
  var fogCv = null;             // офф-скрин 220x220: туман войны

  var isOpen = false;          // экран открыт
  var layersDirty = true;      // пересобрать terrain+forest
  var fogDirtyFull = true;     // пересобрать туман с нуля
  var markersDirty = true;     // пересобрать список маркеров
  var lastWorldVer = -1;       // версия мира для отслеживания изменений

  // вид: зум (px на тайл) и центр вьюпорта в тайлах
  var view = { zoom: ZOOM_DEF, cx: 110, cy: 110 };
  var followPlayer = true;     // держать игрока в центре

  // мышь
  var drag = null;             // {sx, sy, cx0, cy0} при перетаскивании
  var hoverTile = null;        // {x, y} тайл под курсором

  // кэш маркеров
  var markers = null;          // {houses, station, cemetery, piers, caches, corpses, wolves}

  // туман: очередь «оглядов» на раскрытие
  var revealQueue = [];        // [{tiles: [[x,y],...], i: 0}]
  var revealAcc = 0;           // накопитель секунд
  var lastLook = null;         // последняя точка «огляда»

  // счётчики времени
  var renderT = 0;            // троттлинг отрисовки
  var markersT = 0;            // период пересбора маркеров
  var statusT = 0;            // период обновления статус-строки

  // сохранённое состояние ввода (вежливо блокируем игрока на время окна)
  var inputWasEnabled = null;

  // ====================================================================
  //  МАЛЫЕ УТИЛИТЫ
  // ====================================================================

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  /** Доступ к сюжетному хранилищу с гарантированными полями. */
  function story() {
    var g = WS.G;
    if (!g) return null;
    if (!g.story || typeof g.story !== 'object') g.story = {};
    var s = g.story;
    if (!s.explored || typeof s.explored !== 'object') s.explored = {};
    if (!s.caches || typeof s.caches !== 'object') s.caches = {};
    if (!s.corpses || !s.corpses.push) s.corpses = [];
    return s;
  }

  /** Есть ли партия и жив ли игрок. */
  function playable() {
    return WS.G && WS.G.running && !WS.G.dead && WS.G.player;
  }

  /** Открыт ли ЧУЖОЙ экран (модальность по договору .ws-screen.open). */
  function anyOtherOpen() {
    if (!root || !document.querySelectorAll) return false;
    var list = document.querySelectorAll('.ws-screen.open');
    for (var i = 0; i < list.length; i++) {
      if (list[i] !== root) return true;
    }
    return false;
  }

  /** Строки в DOM безопасно: экранируем HTML. */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /** #ffffff -> [255,255,255]. */
  function hexRgb(h) {
    return [
      parseInt(h.substring(1, 3), 16),
      parseInt(h.substring(3, 5), 16),
      parseInt(h.substring(5, 7), 16)
    ];
  }

  /** Проценты исследования карты (для статус-строки и статистики). */
  function exploredPct() {
    var s = story();
    if (!s) return 0;
    var n = 0;
    for (var k in s.explored) {
      if (s.explored.hasOwnProperty(k)) n++;
    }
    return Math.round((n / (WORLD_W * WORLD_H)) * 1000) / 10;
  }

  /** Тайл исследован? */
  function isExplored(x, y) {
    var s = story();
    if (!s) return false;
    return !!s.explored[(x | 0) + ',' + (y | 0)];
  }

  /**
   * Минимальный каркас WS.Ui, если настоящий модуль UI ещё не загружен
   * (его пишет другой агент). modal() видит любые .ws-screen.open —
   * так Input сам отключает управление игроком, пока окна открыты.
   */
  function ensureUiBase() {
    if (WS.Ui) return;
    WS.Ui = {
      modal: function () {
        return !!(document.querySelectorAll &&
                  document.querySelector('.ws-screen.open'));
      },
      toast: function (text, kind) {
        try {
          var holder = document.getElementById('ws-toast-root');
          if (!holder) {
            holder = document.createElement('div');
            holder.id = 'ws-toast-root';
            (document.getElementById('ui-root') || document.body).appendChild(holder);
          }
          while (holder.children.length >= 4) holder.removeChild(holder.firstChild);
          var t = document.createElement('div');
          t.className = 'ws-toast ' + (kind || 'info');
          t.textContent = String(text || '');
          holder.appendChild(t);
          window.setTimeout(function () {
            if (t.parentNode) t.parentNode.removeChild(t);
          }, 3400);
        } catch (e) { WS.warn('toast:', e && e.message); }
      }
    };
  }

  /** Тост любым доступным способом. */
  function toast(text, kind) {
    if (WS.Ui && WS.Ui.toast) {
      try { WS.Ui.toast(text, kind); return; } catch (e) { /* ниже */ }
    }
    WS.log('[map]', text);
  }

  /** Звук — если аудио уже зарегистрировано. */
  function snd(name, vol) {
    if (WS.Snd && WS.Snd.play) {
      try { WS.Snd.play(name, { vol: vol == null ? 0.5 : vol }); } catch (e) { /* тишина */ }
    }
  }

  // ====================================================================
  //  СЛОИ КАРТЫ: ЗЕМЛЯ, ЛЕС, ТУМАН
  // ====================================================================

  /** Таблица «код тайла -> [r,g,b]» строится один раз при буте. */
  var colorByCode = null;

  function buildColorTable() {
    colorByCode = [];
    var T = WS.World ? WS.World.T : {};
    for (var name in TILE_COLORS) {
      if (!TILE_COLORS.hasOwnProperty(name)) continue;
      var code = T[name];
      if (typeof code !== 'number') continue;
      colorByCode[code] = hexRgb(TILE_COLORS[name]);
    }
  }

  /**
   * Слой земли: 220x220, по одному пикселю на тайл.
   * Используем ImageData — это быстрее пятидесяти тысяч fillRect.
   */
  function buildTerrain() {
    if (!terrainCv) terrainCv = document.createElement('canvas');
    terrainCv.width = WORLD_W;
    terrainCv.height = WORLD_H;
    var tc = terrainCv.getContext('2d');
    var img = tc.createImageData(WORLD_W, WORLD_H);
    var data = img.data;
    var tiles = WS.World ? WS.World.tiles : null;
    var def = hexRgb(TILE_DEFAULT);
    for (var y = 0; y < WORLD_H; y++) {
      for (var x = 0; x < WORLD_W; x++) {
        var i = (y * WORLD_W + x) * 4;
        var c = null;
        if (tiles) c = colorByCode[tiles[y * WORLD_W + x]];
        if (!c) c = def;
        data[i] = c[0];
        data[i + 1] = c[1];
        data[i + 2] = c[2];
        data[i + 3] = 255;
      }
    }
    tc.putImageData(img, 0, 0);
    layersDirty = false;
  }

  /**
   * Слой леса и мелких объектов: деревья, кусты, камни — точками поверх
   * земли. Даёт карте читаемую структуру: где чаща, где просека.
   */
  function buildForest() {
    if (!forestCv) forestCv = document.createElement('canvas');
    forestCv.width = WORLD_W;
    forestCv.height = WORLD_H;
    var fc = forestCv.getContext('2d');
    fc.clearRect(0, 0, WORLD_W, WORLD_H);
    var objs = WS.World ? WS.World.objects : [];
    for (var i = 0; i < objs.length; i++) {
      var o = objs[i];
      if (!o || !o.sprName) continue;
      var col = FOREST_SPRITES[o.sprName];
      if (!col) continue;
      var x = Math.floor(o.x);
      var y = Math.floor(o.y);
      if (x < 0 || y < 0 || x >= WORLD_W || y >= WORLD_H) continue;
      fc.fillStyle = col;
      fc.fillRect(x, y, 1, 1);
    }
  }

  /** Слой тумана: непрозрачный там, где не исследовано. */
  function buildFogFull() {
    if (!fogCv) fogCv = document.createElement('canvas');
    fogCv.width = WORLD_W;
    fogCv.height = WORLD_H;
    var fc = fogCv.getContext('2d');
    fc.fillStyle = '#05070d';
    fc.fillRect(0, 0, WORLD_W, WORLD_H);
    // протереть исследованные пиксели
    var s = story();
    if (s) {
      fc.clearRect(0, 0, 0, 0);
      for (var k in s.explored) {
        if (!s.explored.hasOwnProperty(k)) continue;
        var p = k.split(',');
        var x = +p[0], y = +p[1];
        if (x >= 0 && y >= 0 && x < WORLD_W && y < WORLD_H) fc.clearRect(x, y, 1, 1);
      }
    }
    fogDirtyFull = false;
  }

  /** Стереть из тумана только что исследованные тайлы (чанк). */
  function fogErase(tiles, from, to) {
    if (!fogCv) return;
    var fc = fogCv.getContext('2d');
    for (var i = from; i < to; i++) {
      fc.clearRect(tiles[i][0], tiles[i][1], 1, 1);
    }
  }

  // ====================================================================
  //  ТУМАН ВОЙНЫ: РАСКРЫТИЕ (тик 20)
  //  Каждые 2 секунды вокруг игрока ставится «огляд» радиусом 12 тайлов.
  //  Огляды складываются в очередь и раскрываются ЧАНКАМИ по CHUNK_TILES
  //  тайлов за кадр — карта не фризит даже на слабых машинах.
  // ====================================================================

  /** Сгенерировать список тайлов круга (только внутри мира). */
  function circleTiles(cx, cy, r) {
    var out = [];
    var r2 = r * r + r;      // чуть овальное снисхождение к углам
    for (var dy = -r; dy <= r; dy++) {
      for (var dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r2) continue;
        var x = cx + dx, y = cy + dy;
        if (x < 0 || y < 0 || x >= WORLD_W || y >= WORLD_H) continue;
        out.push([x, y]);
      }
    }
    return out;
  }

  /** Добавить «огляд» вокруг точки (в очередь). */
  function queueLook(x, y, force) {
    var lx = Math.floor(x), ly = Math.floor(y);
    if (!force && lastLook) {
      var md = Math.abs(lx - lastLook.x) + Math.abs(ly - lastLook.y);
      if (md < MIN_JOB_DIST) return;
    }
    lastLook = { x: lx, y: ly };
    revealQueue.push({ tiles: circleTiles(lx, ly, REVEAL_R), i: 0 });
    // не копим хвост: если игрок носится кругами, старые огляды уже не важны
    if (revealQueue.length > 6) revealQueue.shift();
  }

  /** Тик 20: копим время, генерируем огляды, раскрываем чанками. */
  function fogTick(dt) {
    if (!playable()) { revealQueue = []; revealAcc = 0; return; }
    var p = WS.G.player;

    // таймер оглядов
    revealAcc += dt;
    if (revealAcc >= REVEAL_EVERY) {
      revealAcc = 0;
      queueLook(p.x, p.y, false);
    }

    // раскрытие чанком
    if (!revealQueue.length) return;
    var job = revealQueue[0];
    var s = story();
    if (!s) return;
    var from = job.i;
    var to = Math.min(job.tiles.length, from + CHUNK_TILES);
    var found = 0;
    for (var i = from; i < to; i++) {
      var t = job.tiles[i];
      var key = t[0] + ',' + t[1];
      if (!s.explored[key]) {
        s.explored[key] = 1;
        found++;
      }
    }
    if (found > 0 && fogCv) fogErase(job.tiles, from, to);
    job.i = to;
    if (job.i >= job.tiles.length) revealQueue.shift();
  }

  /** Принудительный «огляд» (старт игры, загрузка сейва). */
  function revealAround(x, y) {
    queueLook(x, y, true);
  }

  // ====================================================================
  //  МАРКЕРЫ
  // ====================================================================

  /** Здание «достаточно исследовано», чтобы попасть на карту. */
  function buildingVisible(b) {
    // проверяем центр и углы: достаточно любого исследованного пикселя
    if (isExplored(b.x + (b.w >> 1), b.y + (b.h >> 1))) return true;
    if (isExplored(b.x, b.y)) return true;
    if (isExplored(b.x + b.w - 1, b.y + b.h - 1)) return true;
    if (b.door && b.door.length && isExplored(b.door[0].x, b.door[0].y)) return true;
    return false;
  }

  /** Пересобрать кэш маркеров (вызывается не чаще раза в 2 сек). */
  function scanMarkers() {
    var W = WS.World;
    var m = {
      houses: [],      // обычные дома и хозпостройки
      station: null,   // вокзал (звезда)
      cemetery: null,  // bbox погоста
      piers: [],       // лодки/мостки
      caches: [],      // обысканные схроны
      corpses: []      // павшие звери и люди
    };
    if (!W) { markers = m; markersDirty = false; return; }

    // --- здания ---
    var bs = W.buildings || [];
    for (var i = 0; i < bs.length; i++) {
      var b = bs[i];
      if (!b || !buildingVisible(b)) continue;
      if (b.type === 'telegraph') {
        m.station = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
      } else {
        m.houses.push({
          x: b.x, y: b.y, w: b.w, h: b.h,
          type: b.type || 'izba',
          col: BUILD_COLORS[b.type] || BUILD_DEFAULT
        });
      }
    }

    // --- объекты: лодки (пристань), трупы ---
    var objs = W.objects || [];
    var crosses = [];
    for (var j = 0; j < objs.length; j++) {
      var o = objs[j];
      if (!o) continue;
      if (o.sprName === 'boat') {
        if (isExplored(o.x, o.y)) m.piers.push({ x: o.x, y: o.y });
      } else if (o.sprName === 'cross_grave') {
        crosses.push(o);
      } else if (o.corpse) {
        if (isExplored(o.x, o.y)) {
          m.corpses.push({
            x: o.x, y: o.y,
            kind: (o.sprName && o.sprName.indexOf('corpse_') === 0)
              ? o.sprName.substring(7) : 'generic'
          });
        }
      }
    }

    // --- погост: рамка по могильным крестам ---
    if (crosses.length >= 3) {
      var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, seen = 0;
      for (var c = 0; c < crosses.length; c++) {
        var cr = crosses[c];
        if (!isExplored(cr.x, cr.y)) continue;
        seen++;
        if (cr.x < x0) x0 = cr.x;
        if (cr.y < y0) y0 = cr.y;
        if (cr.x > x1) x1 = cr.x;
        if (cr.y > y1) y1 = cr.y;
      }
      if (seen >= 3) m.cemetery = { x: x0 - 1, y: y0 - 1, w: (x1 - x0) + 3, h: (y1 - y0) + 3 };
    }

    // --- обысканные схроны (память журнала: story.caches) ---
    var s = story();
    if (s) {
      for (var key in s.caches) {
        if (!s.caches.hasOwnProperty(key)) continue;
        var pp = key.split(',');
        m.caches.push({ x: +pp[0] + 0.5, y: +pp[1] + 0.5, day: s.caches[key] });
      }
    }

    markers = m;
    markersDirty = false;
  }

  /** Волчьи территории — только при «Следопыте» >= 4 (чутьё зверя). */
  function wolfTerritories() {
    var lv = (WS.Skills && WS.Skills.lvid) ? WS.Skills.lvid('track') : 0;
    if (lv < 4) return null;
    if (!WS.Wolf || !WS.Wolf.packs) return null;
    var packs;
    try { packs = WS.Wolf.packs(); } catch (e) { return null; }
    if (!packs || !packs.length) return null;
    return packs;
  }

  // ====================================================================
  //  РИСОВАНИЕ
  // ====================================================================

  /** Зажать вьюпорт в границы карты. */
  function clampView() {
    var viewW = VIEW / view.zoom;
    var vxMin, vxMax;
    if (viewW <= WORLD_W) {
      vxMin = 0;
      vxMax = WORLD_W - viewW;
    } else {
      // сильно отдалены: центрируем, мир плавает в рамке
      vxMin = vxMax = (WORLD_W - viewW) / 2;
    }
    var vx = clamp(view.cx - viewW / 2, vxMin, vxMax);
    var vy = clamp(view.cy - viewW / 2, vxMin, vxMax);
    view.cx = vx + viewW / 2;
    view.cy = vy + viewW / 2;
  }

  /** Главная отрисовка кадра карты. */
  function render() {
    if (!ctx || !isOpen) return;
    try {
      ensureLayers();

      var z = view.zoom;
      var viewW = VIEW / z;
      var vx = view.cx - viewW / 2;
      var vy = view.cy - viewW / 2;

      // фон за пределами мира
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#04060b';
      ctx.fillRect(0, 0, VIEW, VIEW);

      // мир в мировых координатах: масштаб z, сдвиг -v*z
      ctx.save();
      ctx.setTransform(z, 0, 0, z, -vx * z, -vy * z);
      ctx.imageSmoothingEnabled = true;

      // земля и лес
      ctx.drawImage(terrainCv, 0, 0);
      ctx.drawImage(forestCv, 0, 0);

      // сетка каждые 10 тайлов — на глубоком зуме помогает ориентироваться
      if (z >= 7) drawGrid(z);

      // туман поверх земли
      ctx.drawImage(fogCv, 0, 0);

      // маркеры и игрок
      drawMarkers(z);
      drawPlayer(z);

      ctx.restore();

      // компас и рамка — уже в экранных координатах
      drawCompass();
      drawFrame();
    } catch (e) {
      WS.err('map render:', e && e.message);
    }
  }

  /** Пересобрать слои, если мир менялся или слои ещё не готовы. */
  function ensureLayers() {
    var ver = WS.World ? (WS.World.ver || 0) : 0;
    if (layersDirty || ver !== lastWorldVer) {
      buildTerrain();
      buildForest();
      lastWorldVer = ver;
      markersDirty = true;
    }
    if (fogDirtyFull) buildFogFull();
    if (markersDirty || !markers) scanMarkers();
  }

  /** Сетка 10x10 тайлов (рисуется в мировых координатах). */
  function drawGrid(z) {
    ctx.strokeStyle = 'rgba(140,160,190,0.10)';
    ctx.lineWidth = 1 / z;
    ctx.beginPath();
    for (var x = 10; x < WORLD_W; x += 10) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, WORLD_H);
    }
    for (var y = 10; y < WORLD_H; y += 10) {
      ctx.moveTo(0, y);
      ctx.lineTo(WORLD_W, y);
    }
    ctx.stroke();
  }

  /** Пятиконечная звезда (вокзал). */
  function starPath(cx, cy, rOut, rIn) {
    ctx.beginPath();
    for (var i = 0; i < 10; i++) {
      var ang = -Math.PI / 2 + i * Math.PI / 5;
      var r = (i % 2 === 0) ? rOut : rIn;
      var x = cx + Math.cos(ang) * r;
      var y = cy + Math.sin(ang) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  /** Крест-пиктограмма (кладбище, трупы). */
  function crossPath(cx, cy, r) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx, cy + r);
    ctx.moveTo(cx - r * 0.7, cy - r * 0.25);
    ctx.lineTo(cx + r * 0.7, cy - r * 0.25);
  }

  /** Пяточный след волка: четыре пальца + пясть. */
  function paw(cx, cy, ang, size) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ang);
    ctx.fillStyle = 'rgba(200,80,60,0.55)';
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 0.5, size * 0.38, 0, 0, Math.PI * 2);
    ctx.fill();
    for (var i = -1; i <= 2; i++) {
      ctx.beginPath();
      ctx.arc(i * size * 0.22, -size * 0.5, size * 0.11, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /** Все маркеры поверх карты (в мировых координатах). */
  function drawMarkers(z) {
    var m = markers;
    if (!m) return;
    var i;

    // --- дома: пиксельные прямоугольники ---
    for (i = 0; i < m.houses.length; i++) {
      var h = m.houses[i];
      ctx.fillStyle = h.col;
      ctx.fillRect(h.x, h.y, h.w, h.h);
      // тонкая тень-контур с юга: объём на бумаге
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(h.x, h.y + h.h, h.w, 0.5);
    }

    // --- вокзал: звезда в кружке ---
    if (m.station) {
      var st = m.station;
      ctx.fillStyle = 'rgba(232,196,112,0.25)';
      ctx.beginPath();
      ctx.arc(st.x, st.y, 4.2, 0, Math.PI * 2);
      ctx.fill();
      starPath(st.x, st.y, 3.4, 1.4);
      ctx.fillStyle = '#e8c470';
      ctx.fill();
      ctx.strokeStyle = '#5c4a24';
      ctx.lineWidth = 0.3;
      ctx.stroke();
    }

    // --- кладбище: пунктирная рамка + большой крест ---
    if (m.cemetery) {
      var c = m.cemetery;
      ctx.strokeStyle = 'rgba(185,194,204,0.7)';
      ctx.lineWidth = 0.5;
      ctx.setLineDash([1.4, 1.0]);
      ctx.strokeRect(c.x, c.y, c.w, c.h);
      ctx.setLineDash([]);
      crossPath(c.x + c.w / 2, c.y + c.h / 2, 3.2);
      ctx.strokeStyle = '#b9c2cc';
      ctx.lineWidth = 0.9;
      ctx.stroke();
    }

    // --- пристань: лодочка-символ ---
    for (i = 0; i < m.piers.length; i++) {
      var pr = m.piers[i];
      ctx.strokeStyle = '#7ea3c4';
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      // корпус
      ctx.moveTo(pr.x - 2.2, pr.y - 0.8);
      ctx.quadraticCurveTo(pr.x, pr.y + 1.6, pr.x + 2.2, pr.y - 0.8);
      ctx.stroke();
      // мачта
      ctx.beginPath();
      ctx.moveTo(pr.x, pr.y - 0.8);
      ctx.lineTo(pr.x, pr.y - 2.4);
      ctx.stroke();
    }

    // --- обысканные схроны: ромб с галочкой ---
    for (i = 0; i < m.caches.length; i++) {
      var ca = m.caches[i];
      ctx.save();
      ctx.translate(ca.x, ca.y);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = 'rgba(126,163,106,0.9)';
      ctx.fillRect(-1.1, -1.1, 2.2, 2.2);
      ctx.strokeStyle = '#1d2a1a';
      ctx.lineWidth = 0.3;
      ctx.strokeRect(-1.1, -1.1, 2.2, 2.2);
      ctx.restore();
    }

    // --- трупы: маленький тёмный крест ---
    for (i = 0; i < m.corpses.length; i++) {
      var co = m.corpses[i];
      crossPath(co.x, co.y, 1.5);
      ctx.strokeStyle = 'rgba(178,88,76,0.8)';
      ctx.lineWidth = 0.45;
      ctx.stroke();
    }

    // --- волчьи территории: чутьё следопыта ---
    var packs = wolfTerritories();
    if (packs) {
      for (var w = 0; w < packs.length; w++) {
        var ter = packs[w].territory;
        if (!ter || !packs[w].members || !packs[w].members.length) continue;
        var alive = 0;
        for (var q = 0; q < packs[w].members.length; q++) {
          if (!packs[w].members[q].dead) alive++;
        }
        if (!alive) continue;

        // пунктирный круг территории
        ctx.strokeStyle = 'rgba(176,72,63,0.5)';
        ctx.lineWidth = 0.4;
        ctx.setLineDash([2.2, 1.6]);
        ctx.beginPath();
        ctx.arc(ter.x, ter.y, ter.r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        // логово: три следа лап у центра
        for (var pz = 0; pz < 3; pz++) {
          var a = (pz / 3) * Math.PI * 2 + (w * 2.1);
          paw(ter.x + Math.cos(a) * 2.6, ter.y + Math.sin(a) * 2.6, a + Math.PI / 2, 1.7);
        }

        // следы по окружности: где бродит стая
        for (var s2 = 0; s2 < 6; s2++) {
          var a2 = (s2 / 6) * Math.PI * 2 + 0.4;
          var rr = ter.r * 0.72;
          paw(ter.x + Math.cos(a2) * rr, ter.y + Math.sin(a2) * rr, a2 + Math.PI / 2, 1.4);
        }
      }
    }
  }

  /** Стрелка игрока: позиция + направление взгляда (dir 0=С..7=СЗ). */
  function drawPlayer(z) {
    var p = WS.G && WS.G.player;
    if (!p) return;
    var x = p.x, y = p.y;
    var ang = (p.dir || 0) * Math.PI / 4;   // 0 = север (вверх карты)

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);

    // тень-подложка, чтобы стрелка читалась на снегу
    ctx.fillStyle = 'rgba(5,8,13,0.55)';
    ctx.beginPath();
    ctx.arc(0, 0, 2.6, 0, Math.PI * 2);
    ctx.fill();

    // сама стрелка (до поворота смотрит вверх)
    ctx.beginPath();
    ctx.moveTo(0, -2.4);
    ctx.lineTo(1.8, 1.8);
    ctx.lineTo(0, 0.9);
    ctx.lineTo(-1.8, 1.8);
    ctx.closePath();
    ctx.fillStyle = '#d8a45c';
    ctx.fill();
    ctx.strokeStyle = '#241a0c';
    ctx.lineWidth = 0.25;
    ctx.stroke();

    ctx.restore();
  }

  /** Компас в правом верхнем углу (экранные координаты). */
  function drawCompass() {
    var cx = VIEW - 52;
    var cy = 52;
    var r = 30;

    // тарелка
    ctx.save();
    ctx.fillStyle = 'rgba(10,14,21,0.82)';
    ctx.beginPath();
    ctx.arc(cx, cy, r + 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#2c3a4e';
    ctx.lineWidth = 1;
    ctx.stroke();

    // круговая шкала
    ctx.strokeStyle = 'rgba(140,160,190,0.25)';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    // румбы: С В Ю З (карта ориентирована на север)
    ctx.fillStyle = '#8b95a5';
    ctx.font = '10px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('В', cx + r - 8, cy);
    ctx.fillText('Ю', cx, cy + r - 8);
    ctx.fillText('З', cx - r + 8, cy);

    // стрелка на север — акцентом
    ctx.beginPath();
    ctx.moveTo(cx, cy - r + 4);
    ctx.lineTo(cx + 3.5, cy + 2);
    ctx.lineTo(cx, cy - 1);
    ctx.lineTo(cx - 3.5, cy + 2);
    ctx.closePath();
    ctx.fillStyle = '#d8a45c';
    ctx.fill();
    ctx.fillStyle = '#e8c470';
    ctx.font = 'bold 11px Georgia, serif';
    ctx.fillText('С', cx, cy - r + 20);

    ctx.restore();
  }

  /** Рамка-виньетка по краю канваса. */
  function drawFrame() {
    ctx.save();
    ctx.strokeStyle = 'rgba(44,58,78,0.8)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, VIEW - 2, VIEW - 2);
    // угловые засечки, как на генеральных картах
    ctx.strokeStyle = 'rgba(216,164,92,0.35)';
    ctx.lineWidth = 1;
    var L = 14;
    ctx.beginPath();
    ctx.moveTo(4, 4 + L); ctx.lineTo(4, 4); ctx.lineTo(4 + L, 4);
    ctx.moveTo(VIEW - 4 - L, 4); ctx.moveTo(VIEW - 4, 4); ctx.lineTo(VIEW - 4, 4 + L);
    ctx.moveTo(VIEW - 4, VIEW - 4 - L); ctx.lineTo(VIEW - 4, VIEW - 4); ctx.lineTo(VIEW - 4 - L, VIEW - 4);
    ctx.moveTo(4 + L, VIEW - 4); ctx.lineTo(4, VIEW - 4); ctx.lineTo(4, VIEW - 4 - L);
    ctx.stroke();
    ctx.restore();
  }

  // ====================================================================
  //  ВЗАИМОДЕЙСТВИЕ: ЗУМ КОЛЕСОМ, ПЕРЕТАСКИВАНИЕ ЛКМ
  // ====================================================================

  /** Экранная позиция -> тайл карты (учитывает CSS-масштаб канваса). */
  function canvasTile(ev) {
    if (!canvas) return null;
    var r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    var sx = (ev.clientX - r.left) * (VIEW / r.width);
    var sy = (ev.clientY - r.top) * (VIEW / r.height);
    var z = view.zoom;
    var viewW = VIEW / z;
    var vx = view.cx - viewW / 2;
    var vy = view.cy - viewW / 2;
    return { x: vx + sx / z, y: vy + sy / z, sx: sx, sy: sy };
  }

  function bindCanvas() {
    if (!canvas) return;

    // колесо: зум к курсору
    canvas.addEventListener('wheel', function (ev) {
      ev.preventDefault();
      var before = canvasTile(ev);
      var dirZoom = ev.deltaY < 0 ? 1.25 : 0.8;
      view.zoom = clamp(view.zoom * dirZoom, ZOOM_MIN, ZOOM_MAX);
      if (before) {
        // держим тайл под курсором на месте
        var z = view.zoom;
        var viewW = VIEW / z;
        view.cx = before.x - (before.sx / VIEW - 0.5) * viewW;
        view.cy = before.y - (before.sy / VIEW - 0.5) * viewW;
      }
      followPlayer = false;
      clampView();
      render();
      updateStatus();
    }, { passive: false });

    // ЛКМ: перетаскивание
    canvas.addEventListener('mousedown', function (ev) {
      if (ev.button !== 0) return;
      drag = { sx: ev.clientX, sy: ev.clientY, cx0: view.cx, cy0: view.cy, moved: false };
      canvas.classList.add('dragging');
      ev.preventDefault();
    }, false);

    window.addEventListener('mousemove', function (ev) {
      if (!isOpen) return;
      if (drag) {
        var r = canvas.getBoundingClientRect();
        var k = VIEW / Math.max(1, r.width) / view.zoom;
        var dx = (ev.clientX - drag.sx) * k;
        var dy = (ev.clientY - drag.sy) * k;
        if (Math.abs(ev.clientX - drag.sx) + Math.abs(ev.clientY - drag.sy) > 3) {
          drag.moved = true;
          followPlayer = false;
        }
        view.cx = drag.cx0 - dx;
        view.cy = drag.cy0 - dy;
        clampView();
        render();
      } else {
        // просто наведение: координаты курсора
        var t = canvasTile(ev);
        if (t) {
          hoverTile = t;
          updateStatus();
        }
      }
    }, false);

    window.addEventListener('mouseup', function (ev) {
      if (ev.button === 0 && drag) {
        drag = null;
        if (canvas) canvas.classList.remove('dragging');
      }
    }, false);

    // двойной клик — центрироваться на игроке
    canvas.addEventListener('dblclick', function () {
      var p = WS.G && WS.G.player;
      if (p) {
        view.cx = p.x;
        view.cy = p.y;
        followPlayer = true;
        clampView();
        render();
        updateStatus();
      }
    }, false);

    // не даём контекстному меню выскочить на карте
    canvas.addEventListener('contextmenu', function (ev) { ev.preventDefault(); }, false);
  }

  // ====================================================================
  //  DOM: ПОСТРОЕНИЕ ОКНА
  // ====================================================================

  /** Элементы легенды (маркер — подпись — примечание). */
  var LEGEND = [
    { cls: 'sw-player',   txt: 'Вы — направление взгляда' },
    { cls: 'sw-house',    txt: 'Дома и постройки посёлка' },
    { cls: 'sw-station',  txt: 'Вокзал (телеграф)' },
    { cls: 'sw-cemetery', txt: 'Кладбище' },
    { cls: 'sw-pier',     txt: 'Пристань, мостки' },
    { cls: 'sw-cache',    txt: 'Схрон — обыскан' },
    { cls: 'sw-corpse',   txt: 'Павший зверь, труп' },
    { cls: 'sw-wolf',     txt: 'Волчья территория', hint: 'видно при «Следопыт» ≥ 4' },
    { cls: 'sw-fog',      txt: 'Мгла — неизведанное' }
  ];

  function legendHtml() {
    var out = '';
    for (var i = 0; i < LEGEND.length; i++) {
      var L = LEGEND[i];
      out += '<div class="map-lg-item"><span class="map-lg-sw ' + L.cls + '"></span>' +
             '<span>' + esc(L.txt) + '</span></div>';
      if (L.hint) {
        out += '<div class="map-lg-hint">' + esc(L.hint) + '</div>';
      }
    }
    return out;
  }

  function buildDom() {
    if (root) return;
    var uiRoot = document.getElementById('ui-root');
    if (!uiRoot) { WS.warn('map: нет #ui-root'); return; }

    root = document.createElement('div');
    root.className = 'ws-panel ws-screen ws-map-screen full hidden';
    root.innerHTML =
      '<div class="ws-frame ws-map-frame">' +
        '<div class="scr-head">' +
          '<span class="scr-title">Карта</span>' +
          '<span class="scr-sub">Посёлок Пристань-Тихая и окрестности — 4x4 вёрсты</span>' +
          '<span class="scr-key">M</span>' +
          '<button class="scr-close" title="Закрыть (M / Esc)">&#10005;</button>' +
        '</div>' +
        '<div class="scr-body map-main">' +
          '<div class="map-stage">' +
            '<canvas id="ws-map-canvas" width="' + VIEW + '" height="' + VIEW + '"></canvas>' +
          '</div>' +
          '<div class="map-side">' +
            '<div class="map-box map-legend"><h4>Условные знаки</h4>' + legendHtml() + '</div>' +
            '<div class="map-box map-stats">' +
              '<h4>Состояние</h4>' +
              '<div class="kv"><b>Исследовано</b><span id="ws-map-explored">0%</span></div>' +
              '<div class="kv"><b>Позиция</b><span id="ws-map-pos">—</span></div>' +
              '<div class="kv"><b>Масштаб</b><span id="ws-map-zoom">100%</span></div>' +
              '<div class="kv"><b>До парохода</b><span id="ws-map-ship">—</span></div>' +
            '</div>' +
            '<div class="map-box map-controls">' +
              '<h4>Управление</h4>' +
              '<div class="btn-row">' +
                '<button class="ws-btn btn-s" id="ws-map-center">К игроку</button>' +
              '</div>' +
              '<div style="font-size:11px;color:var(--ink-dim);margin-top:8px;line-height:1.5">' +
                'Колесо — масштаб · ЛКМ — тянуть карту ·<br>двойной клик — вернуться к себе' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="map-status" id="ws-map-status">' +
          '<span class="mstat" id="ws-map-st-hover">Курсор: —</span>' +
          '<span class="mstat" id="ws-map-st-player">Игрок: —</span>' +
          '<span class="mstat" id="ws-map-st-time">—</span>' +
        '</div>' +
      '</div>';

    uiRoot.appendChild(root);

    canvas = root.querySelector('#ws-map-canvas');
    ctx = canvas ? canvas.getContext('2d') : null;

    // закрытие по крестику
    var closeBtn = root.querySelector('.scr-close');
    if (closeBtn) closeBtn.addEventListener('click', function () { close(); }, false);

    // кнопка «к игроку»
    var cbtn = root.querySelector('#ws-map-center');
    if (cbtn) cbtn.addEventListener('click', function () {
      var p = WS.G && WS.G.player;
      if (p) {
        view.cx = p.x;
        view.cy = p.y;
        followPlayer = true;
        clampView();
        render();
        updateStatus();
      }
    }, false);

    bindCanvas();
  }

  /** Обновить боковую панель и строку состояния. */
  function updateStatus() {
    if (!root || !isOpen) return;
    var p = WS.G && WS.G.player;
    var s = story();

    var ex = root.querySelector('#ws-map-explored');
    if (ex) ex.textContent = exploredPct() + '%';
    var pos = root.querySelector('#ws-map-pos');
    if (pos && p) pos.textContent = Math.floor(p.x) + ', ' + Math.floor(p.y);
    var zm = root.querySelector('#ws-map-zoom');
    if (zm) zm.textContent = Math.round(view.zoom / ZOOM_DEF * 100) + '%';
    var ship = root.querySelector('#ws-map-ship');
    if (ship && WS.Time && WS.Time.daysLeft) {
      var d = WS.Time.daysLeft();
      ship.textContent = d > 0 ? (d + ' дн.') : 'просрочен';
    }

    var hov = root.querySelector('#ws-map-st-hover');
    if (hov) {
      hov.textContent = 'Курсор: ' + (hoverTile
        ? (Math.floor(clamp(hoverTile.x, 0, WORLD_W - 1)) + ', ' +
           Math.floor(clamp(hoverTile.y, 0, WORLD_H - 1)))
        : '—');
    }
    var pl = root.querySelector('#ws-map-st-player');
    if (pl && p) pl.textContent = 'Игрок: ' + Math.floor(p.x) + ', ' + Math.floor(p.y);
    var tm = root.querySelector('#ws-map-st-time');
    if (tm && WS.Time && WS.Time.fmt) tm.textContent = WS.Time.fmt();
  }

  // ====================================================================
  //  ОТКРЫТИЕ / ЗАКРЫТИЕ
  // ====================================================================

  function open() {
    if (isOpen) return;
    if (!playable()) return;
    if (anyOtherOpen()) {
      // модальность: чужое окно уже открыто
      snd('error', 0.35);
      return;
    }
    buildDom();
    if (!root || !ctx) return;

    isOpen = true;
    root.classList.remove('hidden');
    root.classList.add('open');

    // вежливо гасим управление игроком, пока он разглядывает карту
    if (WS.Input && WS.Input.isEnabled && WS.Input.setEnabled) {
      inputWasEnabled = WS.Input.isEnabled();
      if (inputWasEnabled) WS.Input.setEnabled(false);
    }

    // первый раз (или после смены мира) — собрать слои и центрироваться
    ensureLayers();
    var p = WS.G.player;
    view.zoom = ZOOM_DEF;
    view.cx = p.x;
    view.cy = p.y;
    followPlayer = true;
    clampView();
    markersDirty = true;
    render();
    updateStatus();
    snd('select', 0.4);
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    if (root) {
      root.classList.add('hidden');
      root.classList.remove('open');
    }
    // вернуть управление, если мы его гасили
    if (inputWasEnabled === true && WS.Input && WS.Input.setEnabled) {
      WS.Input.setEnabled(true);
    }
    inputWasEnabled = null;
    drag = null;
    snd('click', 0.3);
  }

  function toggle() {
    if (isOpen) close();
    else open();
  }

  /** Горячая клавиша работает всегда (raw key:down), даже в «модали».
   *  ВАЖНО: нажатие «съедается» (consumeCode) — иначе опросный путь
   *  uiTick увидит ту же клавишу в этом кадре и откроет карту тут же
   *  повторно (жалоба игрока: «повторное нажатие должно закрывать»). */
  function onKey(d) {
    if (!isOpen) return;
    if (d && d.code === 'KeyM') {
      if (WS.Input && WS.Input.consumeCode) WS.Input.consumeCode('KeyM');
      close();
    } else if (d && d.code === 'Escape') {
      close();
    }
  }

  // ====================================================================
  //  ТИК 80: горячая клавиша + живая карта
  // ====================================================================

  function uiTick(dt) {
    try {
      // --- закрытая карта: следим за горячей клавишей ---
      if (!isOpen) {
        if (!playable()) return;
        // модальность: ничего не открываем поверх чужих окон
        if (anyOtherOpen()) return;
        if (WS.Ui && WS.Ui.modal && WS.Ui.modal()) return;
        if (WS.Input && WS.Input.hit && WS.Input.hit('map')) open();
        return;
      }

      // --- открытая карта: следим за игроком и миром ---
      var p = WS.G && WS.G.player;
      if (!p || !WS.G.running) { close(); return; }

      // центрирование, если карту не таскали
      if (followPlayer) {
        view.cx = p.x;
        view.cy = p.y;
        clampView();
      }

      // перерисовка: ~30 к/с достаточно и для панорамы, и для драга
      renderT += dt;
      if (renderT >= 0.033) {
        renderT = 0;
        render();
      }

      // пересбор маркеров — раз в 2 секунды (трупы, стаи, тайлы)
      markersT += dt;
      if (markersT >= 2.0) {
        markersT = 0;
        markersDirty = true;
        updateStatus();
      }

      // статус-строка (время, координаты) — раз в 0.5 сек
      statusT += dt;
      if (statusT >= 0.5) {
        statusT = 0;
        updateStatus();
      }
    } catch (e) {
      WS.err('map uiTick:', e && e.message);
    }
  }

  // ====================================================================
  //  СОБЫТИЯ МИРА
  // ====================================================================

  function onGameStart() {
    // новая партия или загрузка: туман и слои строим заново
    lastWorldVer = -1;
    layersDirty = true;
    fogDirtyFull = true;
    markersDirty = true;
    revealQueue = [];
    lastLook = null;
    var p = WS.G && WS.G.player;
    if (p) revealAround(p.x, p.y);
    close();
  }

  /** Обыск контейнера: запоминаем егерские схроны для карты. */
  function onLootSearched(d) {
    var o = d && d.o;
    if (!o || o.container !== 'ranger_cache') return;
    var s = story();
    if (!s) return;
    var key = Math.floor(o.x) + ',' + Math.floor(o.y);
    s.caches[key] = (WS.Time && WS.Time.day) ? WS.Time.day() : 1;
    markersDirty = true;
  }

  /** Смерть/победа: карту прячем, чтобы не заслонять финальные экраны. */
  function onGameOver() { close(); }

  // ====================================================================
  //  ПУБЛИЧНЫЙ API + BOOT
  // ====================================================================

  var MapScreen = {
    open: open,
    close: close,
    toggle: toggle,
    isOpen: function () { return isOpen; },

    /** Принудительно раскрыть круг вокруг точки (радиус REVEAL_R). */
    reveal: revealAround,

    /** Доля исследованного, % (для статистики журнала). */
    exploredPct: exploredPct,

    /** Число раскрытых тайлов. */
    exploredCount: function () {
      var s = story();
      if (!s) return 0;
      var n = 0;
      for (var k in s.explored) if (s.explored.hasOwnProperty(k)) n++;
      return n;
    },

    /** Пересобрать карту (после генерации мира из консоли). */
    rebuild: function () {
      layersDirty = true;
      fogDirtyFull = true;
      markersDirty = true;
      lastWorldVer = -1;
    },

    /** Туман: тестовое полное раскрытие (разработчику). */
    revealAll: function () {
      var s = story();
      if (!s) return;
      for (var y = 0; y < WORLD_H; y++) {
        for (var x = 0; x < WORLD_W; x++) s.explored[x + ',' + y] = 1;
      }
      fogDirtyFull = true;
    }
  };

  WS.def('MapScreen', MapScreen);

  WS.boot(function bootMapScreen() {
    ensureUiBase();
    buildColorTable();
    buildDom();

    // туман войны — приоритет мира (20): копится даже при закрытой карте
    WS.tick(TICK_WORLD, fogTick, 'ui:map:fog');

    // UI-тик: горячая клавиша и живая отрисовка
    WS.tick(TICK_UI, uiTick, 'ui:map');

    // горячая клавиша закрытия — сырым событием (Input перекрыт модалью)
    WS.Ev.on('key:down', onKey);

    // партия: сброс слоёв, стартовый огляд
    WS.Ev.on('game:start', onGameStart);
    WS.Ev.on('game:load', onGameStart);

    // память карты: обысканные схроны
    WS.Ev.on('loot:searched', onLootSearched);

    // финалы: окно не должно мешать экранам смерти/победы
    WS.Ev.on('player:die', onGameOver);
    WS.Ev.on('game:victory', onGameOver);

    WS.log('ui: экран карты готов (M, туман тик ' + TICK_WORLD + ')');
  }, 'ui:map:init');

})();
