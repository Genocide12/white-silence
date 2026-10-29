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
      return true;
    }
  };

  WS.def('Gen', Gen);
})();
