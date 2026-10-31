/**
 * world_inpage.js — Т-7: МИР И ДЕТЕРМИНИЗМ.
 * Покрывает: генерацию мира (WS.Gen.generate через Main.newGame), детерминизм
 * от сида (два прогона 5000 + контрольный 5001), ГПСЧ (WS.RNG: mk/f/int/
 * chance/pick/shuffle/weighted, strHash, hash2/hash3, valueNoise2, fbm2),
 * World API (tileAt/setTile/carve/blockTile/isTileBlocked/terrainMoveCost/
 * addObject/removeObject/objAt/objsAt/addEnt/removeEnt/entsNear/query/
 * isInside/buildingAt/addLight), время (WS.Time: day/hour/minute/hourF/fmt/
 * light/daysLeft/isPolarNight/DAYS_TO_SHIP, полночь, сон x8), погоду
 * (WS.Weather: current/tempOutside/windLevel/lightDim, детерминизм от сида),
 * скорость (WS.Loop.setSpeed + клампы), serialize/deserialize мира.
 * Протокол — как в 00_smoke_inpage.js: window.__T, done=true в конце.
 */
(function () {
  'use strict';
  var T = window.__T = { pass: 0, fail: 0, fails: [], bugs: [], done: false };
  function ok(name, cond, data) {
    if (cond) { T.pass++; console.log('  ok   ' + name); }
    else { T.fail++; T.fails.push(name); console.log('  FAIL ' + name + (data ? ' ' + JSON.stringify(data) : '')); }
  }
  function bug(d) { T.bugs.push(String(d)); console.log('  🐞 ' + d); }
  function fin() { T.done = true; }

  try {
    window.confirm = function () { return true; };

    // ================================================================
    // 0) наличие API
    // ================================================================
    ok('ядро на месте: Gen/World/RNG/Time/Weather/Loop',
       !!(WS.Gen && WS.World && WS.RNG && WS.Time && WS.Weather && WS.Loop));

    // ================================================================
    // 1) ГПСЧ: WS.RNG (детерминизм, границы, формы)
    // ================================================================
    var r1 = WS.RNG.mk(7), r2 = WS.RNG.mk(7), s1 = [], s2 = [], i;
    for (i = 0; i < 10; i++) { s1.push(r1.f()); s2.push(r2.f()); }
    ok('RNG.mk(7): две последовательности f()×10 идентичны',
       JSON.stringify(s1) === JSON.stringify(s2));
    var inRange = true;
    for (i = 0; i < 100; i++) { var v = r1.f(); if (!(v >= 0 && v < 1)) { inRange = false; break; } }
    ok('RNG.f() всегда в [0,1)', inRange);

    var r3 = WS.RNG.mk(7), intOk = true;
    for (i = 0; i < 60; i++) { var n = r3.int(1, 6); if (!(n >= 1 && n <= 6) || n !== Math.floor(n)) { intOk = false; break; } }
    ok('RNG.int(1,6)×60 — целые в границах включительно', intOk);

    var rc = WS.RNG.mk(9), ch0 = true, ch1 = true;
    for (i = 0; i < 10; i++) { if (rc.chance(0) !== false) ch0 = false; if (rc.chance(1) !== true) ch1 = false; }
    ok('RNG.chance(0) всегда false', ch0);
    ok('RNG.chance(1) всегда true', ch1);

    var rp = WS.RNG.mk(11), pickOk = true;
    var pool = ['хворост', 'берёста', 'кремень'];
    for (i = 0; i < 10; i++) { if (pool.indexOf(rp.pick(pool)) < 0) { pickOk = false; break; } }
    ok('RNG.pick возвращает элемент массива', pickOk);

    var shA = WS.RNG.mk(13), shB = WS.RNG.mk(13);
    var base = [1, 2, 3, 4, 5, 6, 7, 8];
    var a1 = base.slice(), a2 = base.slice();
    shA.shuffle(a1); shB.shuffle(a2);
    ok('RNG.shuffle: тот же сид — та же перестановка', JSON.stringify(a1) === JSON.stringify(a2));
    ok('RNG.shuffle: те же элементы без потерь',
       a1.slice().sort().join(',') === base.slice().sort().join(','));
    // shuffle тасует НА МЕСТЕ и возвращает тот же массив — так задокументировано
    // в js/core/rng.js («Перетасовать массив (на месте)»). Особенность API, не баг.
    ok('RNG.shuffle мутирует исходный массив (документировано «на месте»)',
       a1 === shA.shuffle(a1) && JSON.stringify(a1) !== JSON.stringify(base));

    var rw = WS.RNG.mk(21), zeroOk = true, fromList = true;
    var wpairs = [{ w: 1, tag: 'x' }, { w: 0, tag: 'y' }, { w: 2, tag: 'z' }];
    for (i = 0; i < 20; i++) {
      var wsel = rw.weighted(wpairs);
      if (wsel.tag === 'y') zeroOk = false;
      var found = false;
      for (var wi = 0; wi < wpairs.length; wi++) if (wpairs[wi] === wsel) found = true;
      if (!found) fromList = false;
    }
    ok('RNG.weighted: элемент с нулевым весом не выпадает', zeroOk);
    ok('RNG.weighted: результат из переданного списка', fromList);

    var rz = WS.RNG.mk(0);   // seed 0 заменяется служебным — не должен падать
    ok('RNG.mk(0) живёт (нулевой сид → служебный)', (function () { var f = rz.f(); return f >= 0 && f < 1; })());

    // ---- хэши и шум ----
    ok('strHash стабилен: strHash("а") === strHash("а")',
       WS.RNG.strHash('а') === WS.RNG.strHash('а'));
    ok('strHash различает "а" и "б"', WS.RNG.strHash('а') !== WS.RNG.strHash('б'));
    var hv = WS.RNG.strHash('белое безмолвие');
    ok('strHash — целое uint32', typeof hv === 'number' && hv >= 0 && hv <= 4294967295 && Math.floor(hv) === hv);

    ok('hash2 стабилен для одинаковых входов',
       WS.RNG.hash2(3, 4, 5) === WS.RNG.hash2(3, 4, 5));
    ok('hash2 различает входы (3,4)≠(4,3)',
       WS.RNG.hash2(3, 4, 5) !== WS.RNG.hash2(4, 3, 5));
    var h2ok = true;
    for (i = 0; i < 20; i++) { var h2v = WS.RNG.hash2(i, i * 3, 17); if (!(h2v >= 0 && h2v < 1)) { h2ok = false; break; } }
    ok('hash2 в [0,1)', h2ok);

    ok('hash3 стабилен для одинаковых входов',
       WS.RNG.hash3(1, 2, 3, 9) === WS.RNG.hash3(1, 2, 3, 9));
    ok('hash3 различает входы (1,2,3)≠(3,2,1)',
       WS.RNG.hash3(1, 2, 3, 9) !== WS.RNG.hash3(3, 2, 1, 9));
    var h3ok = true;
    for (i = 0; i < 20; i++) { var h3v = WS.RNG.hash3(i, i + 5, i * 2, 3); if (!(h3v >= 0 && h3v < 1)) { h3ok = false; break; } }
    ok('hash3 в [0,1)', h3ok);

    ok('valueNoise2 стабилен',
       WS.RNG.valueNoise2(1.5, 2.5, 42) === WS.RNG.valueNoise2(1.5, 2.5, 42));
    var vnOk = true;
    for (i = 0; i < 20; i++) { var vn = WS.RNG.valueNoise2(i * 0.37, i * 1.13, 5); if (!(vn >= 0 && vn < 1)) { vnOk = false; break; } }
    ok('valueNoise2 в [0,1) (сглаженный value-noise)', vnOk);
    ok('valueNoise2 зависит от сида',
       WS.RNG.valueNoise2(1.5, 2.5, 42) !== WS.RNG.valueNoise2(1.5, 2.5, 43));

    ok('fbm2 стабилен', WS.RNG.fbm2(3.3, 4.4, 42, 4) === WS.RNG.fbm2(3.3, 4.4, 42, 4));
    var fbOk = true;
    for (i = 0; i < 20; i++) { var fb = WS.RNG.fbm2(i * 0.71, i * 0.29, 7, 4); if (!(fb >= 0 && fb <= 1)) { fbOk = false; break; } }
    ok('fbm2 в [0,1] (нормированная сумма октав)', fbOk);
    ok('fbm2 зависит от координат',
       WS.RNG.fbm2(3.3, 4.4, 42, 4) !== WS.RNG.fbm2(9.9, 1.1, 42, 4));

    // ================================================================
    // 2) генерация мира: новый матч на фиксированном сиде 5000
    // ================================================================
    var started = WS.Main.newGame('telegraph', ['frostproof', 'patient'], 5000);
    ok('newGame(5000) стартует', started === true);
    // ФИКС-проверка (анти-раздувание): setTile теперь пишет в tileDiff
    // ТОЛЬКО в живом мире (game:start/game:load) — генерация мира гоняет
    // setTile десятки тысяч раз и не должна попадать в дифф сейва
    ok('генерация не раздувает дифф: tileDiff после newGame пуст',
       (function () {
         var d = WS.World.serialize().tileDiff, n = 0;
         for (var k in d) if (d.hasOwnProperty(k)) n++;
         return n === 0;
       })(),
       { diff: WS.World.serialize().tileDiff });
    ok('мир 220×220, tiles/blocked по 48400',
       WS.World.w === 220 && WS.World.h === 220 &&
       WS.World.tiles.length === 48400 && WS.World.blocked.length === 48400);
    ok('enum тайлов T на месте (VOID=0, WATER/GRASS/SNOW — числа)',
       WS.World.T.VOID === 0 && typeof WS.World.T.WATER === 'number' &&
       typeof WS.World.T.GRASS === 'number' && typeof WS.World.T.SNOW === 'number');
    ok('spawnPoint в границах мира',
       WS.World.spawnPoint.x > 0 && WS.World.spawnPoint.y > 0 &&
       WS.World.spawnPoint.x < WS.World.w && WS.World.spawnPoint.y < WS.World.h);
    ok('мир населён: объектов > 100 (факт: ~4 тыс.)', WS.World.objects.length > 100);
    ok('здания сгенерированы (buildings ≥ 5, факт: ~36)', WS.World.buildings.length >= 5);
    var hasPlayer = false;
    for (i = 0; i < WS.World.ents.length; i++) if (WS.World.ents[i].kind === 'player') hasPlayer = true;
    ok('сущности заселены, игрок среди них (факт: ~60 ents)', hasPlayer);

    /** Снимок мира: метрики + выборочные тайлы + погода. */
    function snapshot() {
      var center = [];
      for (var y = 108; y <= 112; y++)
        for (var x = 108; x <= 112; x++) center.push(WS.World.tileAt(x, y));
      var R = WS.RNG.mk(777), pts = [], rand = [];
      for (var k = 0; k < 10; k++) {
        var px = Math.floor(R.range(0, 220)), py = Math.floor(R.range(0, 220));
        pts.push(px + ',' + py);
        rand.push(WS.World.tileAt(px, py));
      }
      var w = WS.G.weather;
      return {
        spawn: JSON.stringify(WS.World.spawnPoint),
        buildings: WS.World.buildings.length,
        objects: WS.World.objects.length,
        ents: WS.World.ents.length,
        lights: WS.World.lights.length,
        center: center.join(','),
        rand: rand.join(','),
        pts: pts.join(';'),
        weather: JSON.stringify({
          cur: w.cur, next: w.next, t: w.t, dur: w.dur, trans: w.trans,
          windDir: w.windDir, snowCover: w.snowCover, temp: w.temp,
          driftPh: w.driftPh, windPh: w.windPh, seed: w.seed
        }),
        tempOutside: WS.Weather.tempOutside()
      };
    }
    var A = snapshot();

    // ---- тот же сид ещё раз: полный детерминизм ----
    WS.Main.newGame('telegraph', ['frostproof', 'patient'], 5000);
    var B = snapshot();
    ok('детерминизм: spawnPoint совпадает', A.spawn === B.spawn, { a: A.spawn, b: B.spawn });
    ok('детерминизм: зданий поровну', A.buildings === B.buildings, { a: A.buildings, b: B.buildings });
    ok('детерминизм: объектов поровну', A.objects === B.objects, { a: A.objects, b: B.objects });
    ok('детерминизм: сущностей поровну', A.ents === B.ents, { a: A.ents, b: B.ents });
    ok('детерминизм: источников света поровну', A.lights === B.lights, { a: A.lights, b: B.lights });
    ok('детерминизм: центр 5×5 тайлов совпадает', A.center === B.center);
    ok('детерминизм: 10 случайных тайлов (RNG.mk(777)) совпадают',
       A.rand === B.rand && A.pts === B.pts);
    ok('погода детерминирована от сида: состояние G.weather совпадает',
       A.weather === B.weather);
    ok('погода детерминирована: tempOutside в день 1 совпадает',
       A.tempOutside === B.tempOutside, { a: A.tempOutside, b: B.tempOutside });

    // ---- другой сид: мир другой ----
    WS.Main.newGame('telegraph', ['frostproof', 'patient'], 5001);
    var C = snapshot();
    // примечание: spawnPoint у сидов 5000 и 5001 совпадает — посёлок
    // строится по фиксированному плану у вокзала; это дизайн, а не баг
    ok('другой сид (5001): другой мир (объекты/тайлы)',
       A.objects !== C.objects || A.center !== C.center || A.rand !== C.rand || A.spawn !== C.spawn,
       { objA: A.objects, objC: C.objects });

    // ================================================================
    // 3) World API: тайлы, блокировка, объекты, сущности, запросы
    // ================================================================
    var orig77 = WS.World.tileAt(7, 7);
    WS.World.setTile(7, 7, WS.World.T.ROAD);
    ok('setTile меняет tileAt', WS.World.tileAt(7, 7) === WS.World.T.ROAD);
    WS.World.setTile(7, 7, orig77);
    ok('setTile восстанавливает исходный тайл', WS.World.tileAt(7, 7) === orig77);

    WS.World.setTile(-1, -1, WS.World.T.ROAD);        // вне границ — тихо
    WS.World.carve(500, 500, 4, 4, WS.World.T.ROAD);   // вне границ — тихо
    ok('setTile/carve вне границ не падают', true);
    ok('tileAt вне границ = T.VOID',
       WS.World.tileAt(-1, -1) === WS.World.T.VOID && WS.World.tileAt(220, 220) === WS.World.T.VOID);
    ok('isTileBlocked вне границ = true',
       WS.World.isTileBlocked(-5, -5) === true && WS.World.isTileBlocked(300, 0) === true);

    // скан: ищем воду (блокирована по типу) и проходимый снег/траву
    var waterX = -1, waterY = -1, passX = -1, passY = -1;
    for (i = 0; i < WS.World.tiles.length; i++) {
      var t = WS.World.tiles[i];
      if (waterX < 0 && t === WS.World.T.WATER) { waterX = i % 220; waterY = Math.floor(i / 220); }
      if (passX < 0 && (t === WS.World.T.SNOW || t === WS.World.T.GRASS) && !WS.World.blocked[i]) {
        passX = i % 220; passY = Math.floor(i / 220);
      }
      if (waterX >= 0 && passX >= 0) break;
    }
    ok('скан нашёл воду и проходимый тайл (мир с рекой)', waterX >= 0 && passX >= 0);
    ok('isTileBlocked: вода непроходима', WS.World.isTileBlocked(waterX, waterY) === true);
    ok('terrainMoveCost: вода = Infinity', WS.World.terrainMoveCost(waterX, waterY) === Infinity);
    ok('isTileBlocked: снег/трава проходимы', WS.World.isTileBlocked(passX, passY) === false);
    ok('terrainMoveCost: обычный тайл конечен (≥1)',
       WS.World.terrainMoveCost(passX, passY) >= 1 && WS.World.terrainMoveCost(passX, passY) < Infinity);

    WS.World.blockTile(passX, passY, 1);
    var blockedNow = WS.World.isTileBlocked(passX, passY);
    WS.World.blockTile(passX, passY, 0);
    var unblockedNow = WS.World.isTileBlocked(passX, passY);
    ok('blockTile(1)/blockTile(0) переключают непроходимость', blockedNow === true && unblockedNow === false);

    // ---- объекты: addObject / objsAt / objAt / removeObject ----
    var freeTx = -1, freeTy = -1;
    for (var fx = 10; fx < 60 && freeTx < 0; fx++) {
      for (var fy = 10; fy < 60; fy++) {
        if (WS.World.objsAt(fx, fy).length === 0 && !WS.World.isTileBlocked(fx, fy)) {
          freeTx = fx; freeTy = fy; break;
        }
      }
    }
    ok('найден свободный тайл для тестового объекта', freeTx >= 0);
    var marker = WS.World.addObject({
      x: freeTx + 0.5, y: freeTy + 0.5, sprName: 't7_marker',
      solid: false, name: 'Т7 метка'
    });
    ok('addObject назначает id объекту', !!marker.id && typeof marker.id === 'string');
    ok('objsAt возвращает массив с addObject-объектом',
       WS.World.objsAt(freeTx, freeTy).indexOf(marker) >= 0);
    ok('objAt находит addObject-объект на тайле', WS.World.objAt(freeTx, freeTy) === marker);

    var objsBefore = WS.World.objects.length;
    WS.World.removeObject(marker);
    ok('removeObject убирает объект из мира и хэша',
       WS.World.objects.length === objsBefore - 1 &&
       WS.World.objsAt(freeTx, freeTy).indexOf(marker) < 0);

    // ---- свет ----
    var L0 = WS.World.lights.length;
    var lamp = WS.World.addLight({ x: freeTx + 0.5, y: freeTy + 0.5, r: 3, a: 0.8 });
    ok('addLight добавляет источник', WS.World.lights.length === L0 + 1 && WS.World.lights.indexOf(lamp) >= 0);
    WS.World.removeLight(lamp);
    ok('removeLight снимает источник', WS.World.lights.length === L0 && WS.World.lights.indexOf(lamp) < 0);

    // ---- сущности и запросы: addEnt / entsNear / query / removeEnt ----
    var ex = WS.World.spawnPoint.x + 2, ey = WS.World.spawnPoint.y + 2;
    var ghost = WS.World.addObject({ x: ex, y: ey, sprName: 't7_ghost', solid: false, name: 'Т7 призрак' });
    var critter = WS.World.addEnt({ x: ex, y: ey, hp: 33, kind: 't7_ent', sprName: 't7_ent' });
    ok('addEnt регистрирует сущность', WS.World.ents.indexOf(critter) >= 0);
    ok('entsNear находит сущность по радиусу',
       WS.World.entsNear(ex, ey, 2).indexOf(critter) >= 0);
    ok('entsNear не видит объекты без hp',
       WS.World.entsNear(ex, ey, 2).indexOf(ghost) < 0);
    ok('objsAt не видит сущности с hp',
       WS.World.objsAt(Math.floor(ex), Math.floor(ey)).indexOf(critter) < 0);
    ok('query возвращает объект прямоугольника',
       WS.World.query(ex - 1, ey - 1, ex + 1, ey + 1).indexOf(ghost) >= 0);
    ok('query не возвращает объект вне прямоугольника',
       WS.World.query(200, 200, 201, 201).indexOf(ghost) < 0);
    ok('query возвращает сущность прямоугольника',
       (function () {
         var c2 = WS.World.addEnt({ x: ex, y: ey, hp: 5, kind: 't7_ent2', sprName: 't7' });
         var q = WS.World.query(ex - 1, ey - 1, ex + 1, ey + 1);
         var has = q.indexOf(c2) >= 0;
         WS.World.removeEnt(c2);
         return has;
       })());
    WS.World.removeEnt(critter);
    ok('removeEnt: entsNear больше не находит',
       WS.World.ents.indexOf(critter) < 0 && WS.World.entsNear(ex, ey, 2).indexOf(critter) < 0);
    WS.World.removeObject(ghost);
    ok('removeObject: objsAt больше не видит объект',
       WS.World.objsAt(Math.floor(ex), Math.floor(ey)).indexOf(ghost) < 0);

    // ---- здания: isInside / buildingAt ----
    var b0 = WS.World.buildings[0];
    var bx = b0.x + b0.w / 2, by = b0.y + b0.h / 2;
    ok('isInside внутри здания возвращает его', WS.World.isInside(bx, by) === b0);
    ok('buildingAt по тайлю возвращает то же здание',
       WS.World.buildingAt(Math.floor(bx), Math.floor(by)) === b0);
    var outTx = -1;
    for (var ox = 0; ox < 220 && outTx < 0; ox++) {
      if (!WS.World.buildingAt(ox, 0)) outTx = ox;
    }
    ok('isOutside/buildingAt: вне зданий null',
       outTx >= 0 && WS.World.buildingAt(outTx, 0) === null && WS.World.isInside(outTx + 0.5, 0.5) === null);

    // ---- реальный контейнер из генерации ----
    var cont = null;
    for (i = 0; i < WS.World.objects.length; i++) {
      if (WS.World.objects[i].container) { cont = WS.World.objects[i]; break; }
    }
    ok('objAt/objsAt находят сгенерированный контейнер (лут)',
       !!cont && WS.World.objsAt(Math.floor(cont.x), Math.floor(cont.y)).indexOf(cont) >= 0 &&
       WS.World.objAt(Math.floor(cont.x), Math.floor(cont.y)) !== null);

    // ================================================================
    // 4) время: WS.Time (подменяем состояние, в конце возвращаем)
    // ================================================================
    var timeSaved = WS.G.time;
    ok('DAYS_TO_SHIP === 60', WS.Time.DAYS_TO_SHIP === 60);

    WS.G.time = { day: 1, min: 480, totalMin: 480, hourFired: -1, dayFired: -1 };
    ok('день 1, 08:00: day()=1, hour()=8, minute()=0',
       WS.Time.day() === 1 && WS.Time.hour() === 8 && WS.Time.minute() === 0);
    WS.G.time.min = 510;
    ok('hourF(): min=510 → 8.5', WS.Time.hourF() === 8.5);
    WS.G.time.min = 515;
    ok('minute(): min=515 → 35', WS.Time.minute() === 35);

    WS.G.time.day = 50;
    ok('daysLeft: день 50 → 10', WS.Time.daysLeft() === 10);
    WS.G.time.day = 1;
    ok('daysLeft: день 1 → 59', WS.Time.daysLeft() === 59);

    // граница полярной ночи: time.js — isPolarNight = day >= 44 (14 декабря)
    WS.G.time.day = 44;
    var pn44 = WS.Time.isPolarNight();
    WS.G.time.day = 43;
    var pn43 = WS.Time.isPolarNight();
    ok('полярная ночь: день 44 = true, день 43 = false (граница по коду)',
       pn44 === true && pn43 === false);
    WS.G.time.day = 10;
    ok('полярная ночь: день 10 = false', WS.Time.isPolarNight() === false);

    WS.G.time.day = 1; WS.G.time.min = 720;   // полдень
    var lightDay = WS.Time.light();
    WS.G.time.min = 1260;                     // 21:00
    var lightNight = WS.Time.light();
    ok('light(): полдень > 0.3', lightDay > 0.3, { v: lightDay });
    ok('light(): 21:00 < 0.3', lightNight < 0.3, { v: lightNight });
    ok('light() в [0,1]', lightDay >= 0 && lightDay <= 1 && lightNight >= 0 && lightNight <= 1);

    WS.G.time.min = 480;
    var f = WS.Time.fmt();
    ok('fmt(): строка «1 Ноября, 08:00»',
       typeof f === 'string' && f.indexOf('08:00') >= 0 && f.indexOf('Ноября') >= 0, { s: f });

    // консистентность totalMin: (day−1)*1440 + час*60 + минута
    WS.G.time = { day: 3, min: 100, totalMin: 2980, hourFired: -1, dayFired: -1 };
    ok('totalMin консистентен: (day−1)*1440 + min',
       WS.G.time.totalMin === (WS.Time.day() - 1) * 1440 + WS.Time.hour() * 60 + WS.Time.minute());

    // Time.update: скорость учитывается (×2 → +60 мин за 30 сек)
    WS.Loop.setSpeed(2);
    WS.G.time = { day: 1, min: 500, totalMin: 500, hourFired: -1, dayFired: -1 };
    WS.Time.update(30);
    ok('Time.update: скорость ×2 → +60 игровых минут',
       WS.G.time.min === 560 && WS.G.time.totalMin === 560 && WS.Time.hour() === 9,
       { min: WS.G.time.min, total: WS.G.time.totalMin });

    // переход через полночь
    WS.G.time = { day: 2, min: 1435, totalMin: 2875, hourFired: 23, dayFired: -1 };
    WS.Time.update(10);   // ×2 → +20 мин → за полночь
    ok('полночь: day инкремент, min заворачивается, totalMin сквозной',
       WS.Time.day() === 3 && WS.G.time.min === 15 &&
       WS.G.time.totalMin === (3 - 1) * 1440 + 15,
       { day: WS.Time.day(), min: WS.G.time.min, total: WS.G.time.totalMin });

    // сон: множитель ×8
    var slept = WS.G.player.sleeping;
    WS.G.player.sleeping = true;
    WS.Loop.setSpeed(1);
    WS.G.time = { day: 1, min: 100, totalMin: 100, hourFired: 1, dayFired: -1 };
    WS.Time.update(10);   // ×8 → +80 мин
    var sleepOk = WS.G.time.min === 180 && WS.G.time.totalMin === 180;
    WS.G.player.sleeping = slept;
    ok('сон: timeScale ×8 (10 сек → 80 игровых минут)', sleepOk);

    WS.G.time = timeSaved;          // вернуть живому миру его время
    WS.Loop.setSpeed(1);
    ok('время восстановлено после манипуляций', WS.G.time === timeSaved);

    // ================================================================
    // 5) погода: WS.Weather (обёртка weather2.js поверх weather.js)
    // ================================================================
    var cur = WS.Weather.current();
    ok('current(): форма {id, name, temp, wind, snow, light}',
       !!cur && typeof cur.id === 'string' && typeof cur.name === 'string' &&
       typeof cur.temp === 'number' && typeof cur.wind === 'number' &&
       typeof cur.snow === 'number' && typeof cur.light === 'number');
    var WTYPE_IDS = ['clear', 'overcast', 'snow', 'snowstorm', 'blizzard', 'fog', 'hard_frost'];
    ok('current().id — из списка типов погоды', WTYPE_IDS.indexOf(cur.id) >= 0, { id: cur.id });
    var to = WS.Weather.tempOutside();
    ok('tempOutside(): число в [−60, +5] °C', typeof to === 'number' && to >= -60 && to <= 5, { t: to });
    var wl = WS.Weather.windLevel();
    ok('windLevel() в [0,1]', wl >= 0 && wl <= 1, { v: wl });
    var ld = WS.Weather.lightDim();
    ok('lightDim() в [0,1]', ld >= 0 && ld <= 1, { v: ld });
    var wd = WS.G.weather.windDir;
    ok('направление ветра 0..7 (N..NW)', wd >= 0 && wd <= 7 && Math.floor(wd) === wd);
    ok('новая партия: cur=snow, next=clear, t=0, trans=1',
       WS.G.weather.cur === 'snow' && WS.G.weather.next === 'clear' &&
       WS.G.weather.t === 0 && WS.G.weather.trans === 1);

    // ================================================================
    // 6) скорость: WS.Loop.setSpeed (клампы 0..120 — по коду loop.js)
    // ================================================================
    WS.Loop.setSpeed(4);
    ok('setSpeed(4): скорость применилась', WS.Loop.speed === 4);
    WS.Loop.setSpeed(0);
    ok('setSpeed(0): пауза, speed = 0', WS.Loop.speed === 0);
    WS.Loop.setSpeed(-5);
    ok('setSpeed(−5) клампится к 0 (отрицательной скорости нет)', WS.Loop.speed === 0);
    WS.Loop.setSpeed(9999);
    ok('setSpeed(9999) клампится к 120 (потолок демо-автопилота)', WS.Loop.speed === 120);
    WS.Loop.setSpeed(1);
    ok('скорость восстановлена (1)', WS.Loop.speed === 1);

    // ================================================================
    // 7) serialize / deserialize мира
    // ================================================================
    var ser = WS.World.serialize();
    ok('serialize(): объект с полями диффа (tileDiff/objState/contState/doorState/built)',
       !!ser && typeof ser === 'object' && ser.tileDiff !== undefined &&
       ser.objState !== undefined && ser.contState !== undefined &&
       ser.doorState !== undefined && ser.built !== undefined);
    var serStr = null;
    try { serStr = JSON.stringify(ser); } catch (e) { serStr = null; }
    ok('serialize() JSON-сериализуем', typeof serStr === 'string' && serStr.length > 0);

    var objsAlive = WS.World.objects.length;
    WS.World.deserialize(ser);
    ok('deserialize(): мир не потерял объекты',
       WS.World.objects.length === objsAlive, { a: objsAlive, b: WS.World.objects.length });

    var t77 = WS.World.tileAt(7, 7);
    WS.World.deserialize({ tileDiff: { '7,7': WS.World.T.ROAD }, objState: {}, contState: {}, doorState: {}, built: [] });
    ok('deserialize применяет tileDiff через setTile',
       WS.World.tileAt(7, 7) === WS.World.T.ROAD);
    WS.World.setTile(7, 7, t77);

    // ФИКС-проверка: setTile пишет правку в World.tileDiff — serialize()
    // её видит (раньше правки тайлов вне build.js терялись в сейве:
    // world.js:55 setTile не регистрировал изменение, а serialize()
    // world.js:306 читал только tileDiff; реальный пострадавший —
    // выгоревший пол из systems/fire.js:750, откатывавшийся при загрузке)
    var orig99 = WS.World.tileAt(9, 9);
    WS.World.setTile(9, 9, WS.World.T.ROAD);
    var ser2 = WS.World.serialize();
    var diffLost = ser2.tileDiff['9,9'] === undefined;
    if (diffLost) {
      // регресс-детектор: setTile снова не пишет в World.tileDiff
      bug('РЕГРЕССИЯ: setTile(9,9,ROAD) не попал в serialize().tileDiff — правки тайлов вне build.js снова теряются в сейве (world.js setTile)');
    }
    ok('изменение setTile попадает в serialize().tileDiff (фикс: дифф сейва)',
       ser2.tileDiff['9,9'] === WS.World.T.ROAD);
    WS.World.setTile(9, 9, orig99);

    // ================================================================
    // 8) живое время: короткое ожидание (кадры идут)
    // ================================================================
    var t0live = WS.G.time.totalMin;
    WS.Loop.setSpeed(4);
    setTimeout(function () {
      try {
        var t1live = WS.G.time.totalMin;
        ok('время идёт в живой игре (totalMin растёт при ×4)', t1live > t0live, { t0: t0live, t1: t1live });
        WS.Loop.setSpeed(1);
        fin();
      } catch (e) {
        bug('исключение в асинхронной части: ' + (e && e.message));
        fin();
      }
    }, 900);
  } catch (e) {
    bug('фатально: ' + (e && e.message));
    fin();
  }
})();
