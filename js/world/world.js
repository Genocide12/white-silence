/**
 * ЯДРО МИРА: сетка тайлов, объекты, сущности, свет, здания, пространственный хэш.
 * Генерация мира (js/world/gen*.js) использует ТОЛЬКО этот API. Договор:
 *
 *   WS.World.generate(seed, profile)   — вызывается из main; наполняет мир.
 *   WS.World.carve(x, y, w, h, tile)  — залить прямоугольник тайлом.
 *   WS.World.setTile(x, y, tile)      — один тайл (+инвалидация кэша).
 *   WS.World.blockTile(x, y, flag)    — флаг непроходимости (1).
 *   WS.World.addObject(o)             — {x, y, sprName|spr, w?, h?, solid?, name?, container?, light?}
 *   WS.World.addEnt(e) / removeEnt(e) — сущности (люди, звери, дроп).
 *   WS.World.addLight(l) / removeLight(l) — {x, y, r, a, flicker, fire}.
 *   WS.World.query(x0, y0, x1, y1)    — объекты+сущности в прямоугольнике (для рендера).
 *   WS.World.entsNear(x, y, r)        — сущности около точки.
 *   WS.World.objAt(tx, ty)            — верхний интерактивный объект тайла.
 *   WS.World.isInside(x, y)           — внутри здания? {b, room}
 *   WS.World.buildings                — список зданий {id, x, y, w, h, type, rooms:[], door:[{x,y}], name}
 *   WS.World.terrainMoveCost(tx, ty)  — 1 обычный, 2 снег, 3 глубокий снег, Infinity стена.
 */
(function () {
  'use strict';

  var W = 220, H = 220;          // размер мира в тайлах
  var T = {
    VOID: 0, GRASS: 1, GRASS2: 2, DIRT: 3, ROAD: 4, ROAD_SIDE: 5, SIDEWALK: 6,
    WATER: 7, ICE: 8, SHORE: 9, SNOW: 10, SNOW_DEEP: 11, FLOOR_WOOD: 12, FLOOR_TILE: 13,
    FLOOR_CONCRETE: 14, FLOOR_DIRT: 15, WALL_WOOD: 16, WALL_BRICK: 17, WALL_LOG: 18,
    WINDOW: 19, DOOR: 20, DOORWAY: 21, STAIRS: 22, PORCH: 23, RAIL: 24, BRIDGE: 25, MUD: 26,
    GRAVEL: 27, FARMLAND: 28, FENCE: 29, WALL_STONE: 30, CRYPT: 31
  };

  var World = {
    w: W, h: H,
    tiles: null,          // Uint8Array w*h
    blocked: null,        // Uint8Array w*h (0/1)
    objects: [],          // все объекты
    ents: [],             // динамические сущности
    lights: [],
    buildings: [],
    spatial: {},          // пространственный хэш "cx,cy" -> массив (объекты+сущности)
    SPATIAL_CELL: 8,
    ver: 1,               // версия для инвалидации кэша чанков
    spawnPoint: { x: 110, y: 110 },
    _nextId: 1,
    T: T
  };

  function idx(x, y) { return y * W + x; }
  function inB(x, y) { return x >= 0 && y >= 0 && x < W && y < H; }

  World.tileAt = function (x, y) {
    if (!inB(x, y)) return T.VOID;
    return World.tiles[idx(x, y)];
  };

  World.setTile = function (x, y, t) {
    if (!inB(x, y)) return;
    World.tiles[idx(x, y)] = t;
    World.ver++;
    if (World.onTileChanged) World.onTileChanged(x, y, t);
  };

  World.carve = function (x, y, w, h, t) {
    for (var yy = y; yy < y + h; yy++)
      for (var xx = x; xx < x + w; xx++)
        World.setTile(xx, yy, t);
  };

  World.blockTile = function (x, y, flag) {
    if (!inB(x, y)) return;
    World.blocked[idx(x, y)] = flag ? 1 : 0;
    World.ver++;
  };

  World.isTileBlocked = function (x, y) {
    if (!inB(x, y)) return true;
    if (World.blocked[idx(x, y)]) return true;
    var t = World.tiles[idx(x, y)];
    return t === T.WATER || t === T.VOID || t === T.WALL_WOOD || t === T.WALL_BRICK ||
           t === T.WALL_STONE || t === T.WALL_LOG || t === T.WINDOW || t === T.FENCE || t === T.CRYPT;
  };

  World.terrainMoveCost = function (x, y) {
    if (!inB(x, y)) return Infinity;
    if (World.blocked[idx(x, y)]) return Infinity;
    var t = World.tiles[idx(x, y)];
    if (t === T.WATER || t === T.VOID) return Infinity;
    if (t === T.WALL_WOOD || t === T.WALL_BRICK || t === T.WALL_STONE || t === T.WALL_LOG ||
        t === T.WINDOW || t === T.FENCE || t === T.CRYPT) return Infinity;
    if (t === T.SNOW_DEEP) return 2.6;
    if (t === T.SNOW) return 1.5;
    if (t === T.MUD) return 1.8;
    return 1;
  };

  // ------------------------------------------------------------ пространственный хэш
  function cellKey(cx, cy) { return cx + ',' + cy; }

  function addToSpatial(o) {
    var cx = Math.floor(o.x / World.SPATIAL_CELL), cy = Math.floor(o.y / World.SPATIAL_CELL);
    var k = cellKey(cx, cy);
    if (!World.spatial[k]) World.spatial[k] = [];
    World.spatial[k].push(o);
  }

  function removeFromSpatial(o) {
    var cx = Math.floor(o.x / World.SPATIAL_CELL), cy = Math.floor(o.y / World.SPATIAL_CELL);
    var k = cellKey(cx, cy);
    var arr = World.spatial[k];
    if (!arr) return;
    var i = arr.indexOf(o);
    if (i >= 0) arr.splice(i, 1);
  }

  World._rehash = function () {
    World.spatial = {};
    for (var i = 0; i < World.objects.length; i++) addToSpatial(World.objects[i]);
    for (var j = 0; j < World.ents.length; j++) addToSpatial(World.ents[j]);
    World.ver++;
  };

  // ------------------------------------------------------------ объекты и сущности
  World.addObject = function (o) {
    o.id = o.id || ('o' + (World._nextId++));
    o.x = o.x || 0; o.y = o.y || 0;
    o.z = o.z || 0;
    if (o.solid === undefined) o.solid = true;
    World.objects.push(o);
    addToSpatial(o);
    if (o.light) {
      var L = { x: o.x, y: o.y - 0.3, r: o.light, a: 0.9, flicker: !!o.fireLight, fire: !!o.fireLight };
      o._light = L;
      World.lights.push(L);
    }
    WS.Ev.emit('obj:add', { o: o });
    return o;
  };

  World.removeObject = function (o) {
    var i = World.objects.indexOf(o);
    if (i >= 0) World.objects.splice(i, 1);
    removeFromSpatial(o);
    if (o._light) {
      var j = World.lights.indexOf(o._light);
      if (j >= 0) World.lights.splice(j, 1);
    }
    WS.Ev.emit('obj:remove', { o: o });
  };

  World.addEnt = function (e) {
    e.id = e.id || ('e' + (World._nextId++));
    e.x = e.x || 0; e.y = e.y || 0;
    World.ents.push(e);
    addToSpatial(e);
    WS.Ev.emit('ent:add', { ent: e });
    return e;
  };

  World.removeEnt = function (e) {
    var i = World.ents.indexOf(e);
    if (i >= 0) World.ents.splice(i, 1);
    removeFromSpatial(e);
    if (e._light) {
      var j = World.lights.indexOf(e._light);
      if (j >= 0) World.lights.splice(j, 1);
    }
    WS.Ev.emit('ent:remove', { ent: e });
  };

  World.addLight = function (L) {
    World.lights.push(L);
    return L;
  };

  World.removeLight = function (L) {
    var i = World.lights.indexOf(L);
    if (i >= 0) World.lights.splice(i, 1);
  };

  /** Прямоугольный запрос для рендера: объекты + сущности. */
  World.query = function (x0, y0, x1, y1) {
    var out = [];
    var c0 = Math.floor(x0 / World.SPATIAL_CELL), c1 = Math.floor(x1 / World.SPATIAL_CELL);
    var r0 = Math.floor(y0 / World.SPATIAL_CELL), r1 = Math.floor(y1 / World.SPATIAL_CELL);
    for (var cy = r0; cy <= r1; cy++) {
      for (var cx = c0; cx <= c1; cx++) {
        var arr = World.spatial[cellKey(cx, cy)];
        if (!arr) continue;
        for (var i = 0; i < arr.length; i++) {
          var o = arr[i];
          if (o.x >= x0 && o.x <= x1 && o.y >= y0 && o.y <= y1) out.push(o);
        }
      }
    }
    return out;
  };

  /** Сущности около точки (радиус в тайлах). */
  World.entsNear = function (x, y, r) {
    var out = [];
    var c0 = Math.floor((x - r) / World.SPATIAL_CELL), c1 = Math.floor((x + r) / World.SPATIAL_CELL);
    var r0 = Math.floor((y - r) / World.SPATIAL_CELL), r1 = Math.floor((y + r) / World.SPATIAL_CELL);
    var r2 = r * r;
    for (var cy = r0; cy <= r1; cy++) {
      for (var cx = c0; cx <= c1; cx++) {
        var arr = World.spatial[cellKey(cx, cy)];
        if (!arr) continue;
        for (var i = 0; i < arr.length; i++) {
          var o = arr[i];
          if (!o.hp) continue;     // сущности имеют hp
          var dx = o.x - x, dy = o.y - y;
          if (dx * dx + dy * dy <= r2) { o.d = Math.sqrt(dx * dx + dy * dy); out.push(o); }
        }
      }
    }
    return out;
  };

  /** Источники света в прямоугольнике (для рендера). */
  World.lightsIn = function (vb) {
    return World.lights;    // немного; фильтровать не обязательно
  };

  World.lightsNear = function (x, y, r) {
    var out = [];
    for (var i = 0; i < World.lights.length; i++) {
      var L = World.lights[i];
      var d = WS.M.dist(L.x, L.y, x, y);
      if (d <= r) { L.d = d; out.push(L); }
    }
    return out;
  };

  /** Объекты (не сущности) на тайле. */
  World.objsAt = function (tx, ty) {
    var out = [];
    var arr = World.spatial[cellKey(Math.floor(tx / World.SPATIAL_CELL), Math.floor(ty / World.SPATIAL_CELL))];
    if (!arr) return out;
    for (var i = 0; i < arr.length; i++) {
      var o = arr[i];
      if (!o.hp && Math.floor(o.x) === tx && Math.floor(o.y) === ty) out.push(o);
    }
    return out;
  };

  /** Верхний интерактивный объект тайла (контейнер/дверь/печь). */
  World.objAt = function (tx, ty) {
    var list = World.objsAt(tx, ty);
    var best = null;
    for (var i = 0; i < list.length; i++) {
      if (!best || (list[i].container) || (list[i].door)) best = list[i];
    }
    return best;
  };

  /** Внутри здания? Возвращает здание или null. */
  World.isInside = function (x, y) {
    for (var i = 0; i < World.buildings.length; i++) {
      var b = World.buildings[i];
      if (x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) return b;
    }
    return null;
  };

  World.buildingAt = function (tx, ty) {
    for (var i = 0; i < World.buildings.length; i++) {
      var b = World.buildings[i];
      if (tx >= b.x && tx < b.x + b.w && ty >= b.y && ty < b.y + b.h) return b;
    }
    return null;
  };

  // ------------------------------------------------------------ сериализация
  /** Диффы: изменённые тайлы, удалённые объекты, состояние контейнеров, двери. */
  World.serialize = function () {
    var tileDiff = World.tileDiff || {};
    var deadObj = {};
    for (var i = 0; i < World.objects.length; i++) {
      var o = World.objects[i];
      if (o.container && o.looted) deadObj[o.id] = 'looted:' + (o.lootSeed || 0);
      if (o.removed) deadObj[o.id] = 'removed';
    }
    var contState = {};
    for (var k = 0; k < World.objects.length; k++) {
      var ob = World.objects[k];
      if (ob.container && ob.inv && ob.inv._dirty) {
        contState[ob.id] = ob.inv;
      }
    }
    return {
      tileDiff: tileDiff,
      objState: deadObj,
      contState: contState,
      doorState: World.doorState || {},
      built: World.built || []
    };
  };

  World.deserialize = function (diff) {
    if (!diff) return;
    for (var k in diff.tileDiff || {}) {
      var p = k.split(',');
      World.setTile(+p[0], +p[1], diff.tileDiff[k]);
    }
    World.doorState = diff.doorState || {};
    World.built = diff.built || [];
    // применит generators/interiors после генерации
    World._pendingDiff = diff;
  };

  /** Очистка перед новой генерацией. */
  World.reset = function () {
    World.tiles = new Uint8Array(W * H);
    World.blocked = new Uint8Array(W * H);
    World.objects = [];
    World.ents = [];
    World.lights = [];
    World.buildings = [];
    World.spatial = {};
    World.ver = 1;
    World.tileDiff = {};
    World.doorState = {};
    World.built = [];
    World._nextId = 1;
    if (WS.Gfx && WS.Gfx.dirty) WS.Gfx.dirty();
  };

  World.idx = idx;
  World.inB = inB;
  World.newId = function (prefix) { return (prefix || 'id') + (World._nextId++); };

  WS.def('World', World);
})();
