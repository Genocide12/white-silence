/**
 * ГЕНЕРАЦИЯ МИРА — ТОЧКА ВХОДА.
 * WS.Gen.generate(seed) — единственная функция, вызывается из Main.newGame.
 * Порядок (по CONTRACT.md): рельеф → река/дороги → посёлок → лес →
 * точка появления игрока → событие 'gen:town' (интерьеры, звери, лут
 * подписываются на него и добавляют своё).
 * ДЕТЕРМИНИЗМ: все случайности только через единый R = WS.RNG.mk(seed),
 * никаких Math.random. Точечные решения — через WS.RNG.hash2 (стабильны
 * по координатам), глобальные — через методы R.
 */
(function () {
  'use strict';

  /**
   * Спиральный поиск свободного проходимого тайла вокруг точки:
   * не вода, не стена, не забор, без твёрдого объекта.
   */
  function findFree(x, y) {
    var W = WS.World, T = W.T;
    var cx = Math.floor(x), cy = Math.floor(y);
    for (var r = 0; r < 14; r++) {
      for (var dy = -r; dy <= r; dy++) {
        for (var dx = -r; dx <= r; dx++) {
          // только периметр кольца
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          var xx = cx + dx, yy = cy + dy;
          if (!W.inB(xx, yy)) continue;
          if (W.isTileBlocked(xx, yy)) continue;
          var t = W.tileAt(xx, yy);
          if (t === T.WATER || t === T.VOID) continue;
          // не вставать на твёрдый объект (колодец, поленница, пень)
          var obs = W.objsAt(xx, yy);
          var solid = false;
          for (var i = 0; i < obs.length; i++) {
            if (obs[i].solid) { solid = true; break; }
          }
          if (solid) continue;
          return { x: xx + 0.5, y: yy + 0.5 };
        }
      }
    }
    // страховка — центр карты (там равнина)
    return { x: 110.5, y: 100.5 };
  }

  /** Краткая сводка по миру — в лог, для отладки генерации. */
  function report() {
    var W = WS.World;
    var trees = 0, holes = 0;
    for (var i = 0; i < W.objects.length; i++) {
      var s = W.objects[i].sprName || '';
      if (s.indexOf('tree_') === 0) trees++;
    }
    if (W.iceHoles) holes = W.iceHoles.length;
    WS.log('[Gen] мир: зданий=' + W.buildings.length +
      ', объектов=' + W.objects.length +
      ', деревьев=' + trees +
      ', прорубей=' + holes +
      ', старт=(' + W.spawnPoint.x + ',' + W.spawnPoint.y + ')');
  }

  /**
   * РАСЧИСТКА ПРОХОДОВ (финальный проход генерации).
   *
   * БАГ, который здесь лечится: мебель интерьеров ставится «к стене» —
   * в том числе ВПЛОТНУЮ К ДВЕРИ изнутри, а поленницы декора — на
   * крыльцо СНАРУЖИ. Дверь при этом формально есть, но тайл за ней
   * занят солидным объектом — и дом заперт наглухо. На сиде 1917 так
   * были заперты ВСЕ жилые дома: 10/10 кроватей, 14/14 печей и 130/132
   * контейнеров были недостижимы («персонаж и предметы разбросаны» —
   * игрок видит лут через окно и не может войти).
   *
   * Правило после расчистки: тайл двери и оба его соседа (внутренний
   * и внешний) свободны от твёрдых объектов. Мешающую мебель и
   * поленницы переносим на ближайшее свободное место; если не нашли —
   * убираем (лучше потерять табурет, чем дом).
   */
  function clearDoorways() {
    var W = WS.World;
    if (!W || !W.buildings) return 0;
    var cleared = 0;

    function isSolidNonDoor(o) {
      return o && o.solid && !o.door;
    }

    /** Ближайший свободный тайл для переноса объекта (радиус ≤ 5). */
    function freeSpotNear(x, y, b) {
      var cx = Math.floor(x), cy = Math.floor(y);
      for (var r = 1; r <= 5; r++) {
        for (var dy = -r; dy <= r; dy++) {
          for (var dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
            var xx = cx + dx, yy = cy + dy;
            if (!W.inB(xx, yy)) continue;
            if (W.isTileBlocked(xx, yy)) continue;
            var t = W.tileAt(xx, yy);
            if (t === W.T.WATER || t === W.T.VOID) continue;
            // не ставить обратно в дверной коридор любого здания
            if (inDoorCorridor(xx, yy)) continue;
            var obs = W.objsAt(xx, yy);
            var solid = false;
            for (var i = 0; i < obs.length; i++) {
              if (isSolidNonDoor(obs[i])) { solid = true; break; }
            }
            if (solid) continue;
            return { x: xx + 0.5, y: yy + 0.5 };
          }
        }
      }
      return null;
    }

    /** Тайл в дверном коридоре (дверь ± 1) какого-либо здания? */
    var corridorCache = null;
    function inDoorCorridor(x, y) {
      if (!corridorCache) {
        corridorCache = {};
        for (var i = 0; i < W.buildings.length; i++) {
          var doors = W.buildings[i].door || [];
          for (var d = 0; d < doors.length; d++) {
            corridorCache[(doors[d].x - 1) + ',' + doors[d].y] = 1;
            corridorCache[(doors[d].x + 1) + ',' + doors[d].y] = 1;
            corridorCache[doors[d].x + ',' + (doors[d].y - 1)] = 1;
            corridorCache[doors[d].x + ',' + (doors[d].y + 1)] = 1;
            corridorCache[doors[d].x + ',' + doors[d].y] = 1;
          }
        }
      }
      return !!corridorCache[x + ',' + y];
    }

    for (var bi = 0; bi < W.buildings.length; bi++) {
      var b = W.buildings[bi];
      var doors = b.door || [];
      for (var di = 0; di < doors.length; di++) {
        var dr = doors[di];
        // соседи по 4 направлениям; внутренний — внутри прямоугольника
        var neigh = [
          { x: dr.x, y: dr.y - 1 }, { x: dr.x, y: dr.y + 1 },
          { x: dr.x - 1, y: dr.y }, { x: dr.x + 1, y: dr.y }
        ];
        var tiles = [{ x: dr.x, y: dr.y }];
        for (var ni = 0; ni < neigh.length; ni++) {
          var n = neigh[ni];
          var inside = n.x >= b.x && n.x < b.x + b.w && n.y >= b.y && n.y < b.y + b.h;
          if (inside && W.tiles) {
            var tt = W.tileAt(n.x, n.y);
            // внутренний сосед годится, только если это пол/проём, а не стена
            if (tt === W.T.WALL_WOOD || tt === W.T.WALL_BRICK || tt === W.T.WALL_LOG ||
                tt === W.T.WALL_STONE || tt === W.T.WINDOW || tt === W.T.FENCE) continue;
          }
          tiles.push(n);
        }
        for (var ti = 0; ti < tiles.length; ti++) {
          var tx = tiles[ti].x, ty = tiles[ti].y;
          var objs = W.objsAt(tx, ty);
          if (!objs) continue;
          for (var oi = objs.length - 1; oi >= 0; oi--) {
            var o = objs[oi];
            if (!isSolidNonDoor(o)) continue;
            // перенести на свободное место; не вышло — убрать
            var spot = freeSpotNear(o.x, o.y, b);
            if (spot) {
              try { W.removeObject(o); } catch (e1) { /* пусто */ }
              o.x = spot.x; o.y = spot.y;
              W.addObject(o);
            } else {
              try { W.removeObject(o); } catch (e2) { /* пусто */ }
            }
            cleared++;
          }
        }
      }
    }
    return cleared;
  }

  /**
   * СВЯЗНОСТЬ ИНТЕРЬЕРОВ (второй финальный проход).
   *
   * БАГ генератора: перегородки partV/partH ставят проёмы «на глазок» —
   * проём одной перегородки может упереться в стену другой, и комната
   * запирается НАГЛУХО (на сиде 1917 так были заперты все спальни:
   * кровати, печи и сундуки за стеной без входа).
   *
   * Лечение: для каждого здания BFS по полам от входа; каждый «карман»
   * (недостижимый пол) соединяем с достижимой частью, прорубая проём
   * (DOORWAY) в разделяющей стене. Остатки, которые прорубить нельзя
   * (загорожены мебелью) — переносим: контейнеры/печи/кровати должны
   * быть достижимы, иначе лут и жизнь в доме невозможны.
   */
  function connectInteriors() {
    var W = WS.World;
    if (!W || !W.buildings) return 0;
    var T = W.T;
    var carved = 0, moved = 0;

    function isFloorT(t) {
      return t === T.FLOOR_WOOD || t === T.FLOOR_DIRT || t === T.FLOOR_TILE ||
             t === T.FLOOR_CONCRETE || t === T.DOORWAY || t === T.DOOR ||
             t === T.FLOOR_STONE || t === T.FLOOR_PLANK;
    }
    function isWallT(t) {
      return t === T.WALL_WOOD || t === T.WALL_BRICK ||
             t === T.WALL_LOG || t === T.WALL_STONE;
    }
    function passableInterior(x, y, b) {
      if (x < b.x || x >= b.x + b.w || y < b.y || y >= b.y + b.h) return false;
      if (!isFloorT(W.tileAt(x, y))) return false;
      var obs = W.objsAt(x, y);
      if (obs) {
        for (var i = 0; i < obs.length; i++) {
          if (obs[i] && obs[i].solid && !obs[i].door) return false;
        }
      }
      return true;
    }

    function bfsInterior(b, starts) {
      var reach = {};
      var q = [];
      for (var s = 0; s < starts.length; s++) {
        var st = starts[s];
        if (!passableInterior(st.x, st.y, b)) continue;
        var k0 = st.x + ',' + st.y;
        if (reach[k0]) continue;
        reach[k0] = 1;
        q.push(st);
      }
      while (q.length) {
        var c = q.shift();
        var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        for (var d = 0; d < 4; d++) {
          var nx = c.x + dirs[d][0], ny = c.y + dirs[d][1];
          var k = nx + ',' + ny;
          if (reach[k]) continue;
          if (!passableInterior(nx, ny, b)) continue;
          reach[k] = 1;
          q.push({ x: nx, y: ny });
        }
      }
      return reach;
    }

    for (var bi = 0; bi < W.buildings.length; bi++) {
      var b = W.buildings[bi];
      // старты — внутренние соседи всех дверей
      var starts = [];
      var doors = b.door || [];
      for (var di = 0; di < doors.length; di++) {
        var dr = doors[di];
        var cand = [
          { x: dr.x, y: dr.y - 1 }, { x: dr.x, y: dr.y + 1 },
          { x: dr.x - 1, y: dr.y }, { x: dr.x + 1, y: dr.y }
        ];
        for (var ci = 0; ci < cand.length; ci++) {
          var c2 = cand[ci];
          if (c2.x > b.x && c2.x < b.x + b.w - 1 && c2.y > b.y && c2.y < b.y + b.h - 1) {
            starts.push(c2);
          }
        }
      }
      if (!starts.length) continue;

      // итеративно прорубаем проёмы в запертых карманах
      for (var guard = 0; guard < 24; guard++) {
        var reach = bfsInterior(b, starts);
        // все внутренние полы
        var pocket = null, anyFloor = 0, reachN = 0;
        for (var yy = b.y + 1; yy < b.y + b.h - 1; yy++) {
          for (var xx = b.x + 1; xx < b.x + b.w - 1; xx++) {
            var t = W.tileAt(xx, yy);
            if (!isFloorT(t)) continue;
            anyFloor++;
            if (reach[xx + ',' + yy]) { reachN++; continue; }
            if (!pocket) pocket = { x: xx, y: yy };
          }
        }
        if (!pocket || reachN === 0) break;      // всё достижимо или входа нет
        // ищем стену между карманом и достижимым полом
        var carvedNow = false;
        for (var wy = b.y; wy < b.y + b.h && !carvedNow; wy++) {
          for (var wx = b.x; wx < b.x + b.w && !carvedNow; wx++) {
            if (!isWallT(W.tileAt(wx, wy))) continue;
            // горизонтальная пара
            var l = { x: wx - 1, y: wy }, r = { x: wx + 1, y: wy };
            var u = { x: wx, y: wy - 1 }, d2 = { x: wx, y: wy + 1 };
            var pairs = [[l, r], [u, d2]];
            for (var pi = 0; pi < 2 && !carvedNow; pi++) {
              var a = pairs[pi][0], c3 = pairs[pi][1];
              var aIn = a.x > b.x && a.x < b.x + b.w - 1 && a.y > b.y && a.y < b.y + b.h - 1;
              var cIn = c3.x > b.x && c3.x < b.x + b.w - 1 && c3.y > b.y && c3.y < b.y + b.h - 1;
              if (!aIn || !cIn) continue;
              var aFloor = isFloorT(W.tileAt(a.x, a.y));
              var cFloor = isFloorT(W.tileAt(c3.x, c3.y));
              if (!aFloor || !cFloor) continue;
              var aReach = !!reach[a.x + ',' + a.y];
              var cReach = !!reach[c3.x + ',' + c3.y];
              if (aReach === cReach) continue;   // обе стороны одинаковы
              W.setTile(wx, wy, T.DOORWAY);
              carved++; carvedNow = true;
            }
          }
        }
        if (!carvedNow) break;                    // нечего прорубать
      }

      // остатки: важные объекты в недостижимых карманах — переносим.
      // ВАЖНО: раскладываем ПО ОДНОМУ на свободный тайл (первая версия
      // сваливала всё в кучу на один тайл — и комната снова запиралась).
      // Приоритет: кровати и печи (жизнь), потом контейнеры (лут);
      // прочая мебель остаётся в кармане — это декор.
      var reach2 = bfsInterior(b, starts);
      // карта проходов: тайлы DOOR/DOORWAY и их соседи — мебель туда не
      // ставим никогда (сундук у проёма запирает комнату не хуже стены)
      var passage = {};
      var fx2, fy2;
      for (fy2 = b.y; fy2 < b.y + b.h; fy2++) {
        for (fx2 = b.x; fx2 < b.x + b.w; fx2++) {
          var ttP = W.tileAt(fx2, fy2);
          if (ttP !== T.DOORWAY && ttP !== T.DOOR) continue;
          for (var py = fy2 - 1; py <= fy2 + 1; py++) {
            for (var px = fx2 - 1; px <= fx2 + 1; px++) {
              passage[px + ',' + py] = 1;
            }
          }
        }
      }
      var drs2 = b.door || [];
      for (var dk2 = 0; dk2 < drs2.length; dk2++) {
        for (var py2 = drs2[dk2].y - 1; py2 <= drs2[dk2].y + 1; py2++) {
          for (var px2 = drs2[dk2].x - 1; px2 <= drs2[dk2].x + 1; px2++) {
            passage[px2 + ',' + py2] = 1;
          }
        }
      }
      var freeSpots = [];
      for (var fy = b.y + 1; fy < b.y + b.h - 1; fy++) {
        for (var fx = b.x + 1; fx < b.x + b.w - 1; fx++) {
          if (!reach2[fx + ',' + fy]) continue;
          if (!passableInterior(fx, fy, b)) continue;
          if (passage[fx + ',' + fy]) continue;
          freeSpots.push({ x: fx + 0.5, y: fy + 0.5 });
        }
      }
      if (freeSpots.length) {
        var cand = [];
        for (var oi = 0; oi < W.objects.length; oi++) {
          var o = W.objects[oi];
          if (!o) continue;
          var ox = Math.floor(o.x), oy = Math.floor(o.y);
          if (ox < b.x || ox >= b.x + b.w || oy < b.y || oy >= b.y + b.h) continue;
          if (reach2[ox + ',' + oy]) continue;
          var isBed = String(o.sprName || '').indexOf('bed') === 0;
          if (!o.container && !o.heat && !isBed) continue;
          cand.push({ o: o, prio: (isBed || o.heat) ? 0 : 1 });
        }
        cand.sort(function (a, c4) { return a.prio - c4.prio; });
        var si = 0;
        for (var ck = 0; ck < cand.length; ck++) {
          if (si >= freeSpots.length) {
            try { W.removeObject(cand[ck].o); } catch (e2) { /* пусто */ }
            continue;
          }
          try { W.removeObject(cand[ck].o); } catch (e1) { continue; }
          cand[ck].o.x = freeSpots[si].x;
          cand[ck].o.y = freeSpots[si].y;
          W.addObject(cand[ck].o);
          si++;
          moved++;
        }
      }
    }
    return { carved: carved, moved: moved };
  }

  var Gen = {
    /** Сгенерировать мир по семени. Возвращает true при успехе. */
    generate: function (seed) {
      //.seed может быть строкой (из UI) — сводим к uint32
      var s = seed;
      if (typeof s === 'string') s = WS.RNG.strHash(s);
      s = (s >>> 0) || 1;
      var R = WS.RNG.mk(s);

      try {
        // 0) чистый лист
        WS.World.reset();

        // 1) рельеф: снег/трава/сугробы, река со льдом, пруды
        WS.GenTerrain.terrain(R);

        // 2) дороги: тракт, переулки, лесная дорога, поля за рекой
        WS.GenTerrain.roads(R);

        // 3) посёлок «Пристань-Тихая»: план, здания, дворы
        WS.GenTown.town(R);

        // 4) лес поверх — обходит всё рукотворное по тайлам
        WS.GenTerrain.forest(R);

        // 5) точка появления игрока — у вокзала (свободный тайл рядом)
        var sp = WS.World.spawnPoint || { x: 110, y: 100 };
        WS.World.spawnPoint = findFree(sp.x, sp.y);
      } catch (e) {
        // даже при сбое — мир должен существовать, игра не должна падать
        WS.err('Gen.generate failed:', e && e.message, e);
        if (!WS.World.tiles) WS.World.reset();
        return false;
      }

      report();

      // 6) событие генерации: интерьеры/лут/звери добавят своё
      WS.Ev.emit('gen:town', { R: R, seed: s });

      // 7) ФИНАЛ: расчистить дверные проходы и связать интерьеры —
      //    мебель, поленницы и перегородки не должны запирать дома.
      try {
        var cleared = clearDoorways();
        if (cleared) WS.log('[Gen] расчистка дверей: перенесено/убрано объектов — ' + cleared);
        var conn = connectInteriors();
        if (conn.carved || conn.moved) {
          WS.log('[Gen] связность интерьеров: прорублено проёмов — ' + conn.carved +
            ', перенесено предметов из запертых комнат — ' + conn.moved);
        }
      } catch (e3) {
        WS.err('Gen.clearDoorways failed:', e3 && e3.message);
      }
      return true;
    }
  };

  WS.def('Gen', Gen);
})();
