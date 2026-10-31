/**
 * 00_smoke_inpage.js — ДЫМОВОЙ ТЕСТ: ядро игры, новая партия, ход времени,
 * сейв/загрузка, детерминизм зерна. Образец протокола для всех тестов
 * (см. scripts/run_tests.mjs): window.__T {pass, fail, fails, bugs, done}.
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

    // ---- 1) ядро загружено ----
    ok('ядро WS на месте', !!(WS && WS.Main && WS.World && WS.Time && WS.Save && WS.Craft && WS.Needs && WS.Inv));
    ok('новые модули (Expeditions/Replay/VoiceBox/Swarm/Cinema)',
       !!(WS.Expeditions && WS.Replay && WS.VoiceBox && WS.Swarm && WS.Cinema));
    ok('мат-банк загружен (30 категорий)',
       !!(WS.Data && WS.Data.matPhrases && Object.keys(WS.Data.matPhrases).length >= 30));

    // ---- 2) новая партия ----
    var r1 = WS.Main.newGame('telegraph', ['frostproof', 'patient'], 4242);
    ok('newGame стартует', r1 === true);
    ok('партия жива', !!(WS.G && WS.G.running));
    var p = WS.G.player;
    ok('игрок в границах мира', !!(p && p.x > 0 && p.y > 0 && p.x < WS.World.w && p.y < WS.World.h));
    // Лодошка Деда — стартовое оружие дед-режима (в руках или в сумке)
    var palmEq = !!(p.equip && p.equip.hand1 && p.equip.hand1.id === 'palm_ded');
    var palmInv = false;
    if (p.inv) { for (var i = 0; i < p.inv.length; i++) { if (p.inv[i] && p.inv[i].id === 'palm_ded') { palmInv = true; break; } } }
    ok('Лодошка Деда при старте (рука или сумка)', palmEq || palmInv);

    // ---- 3) снимок мира для детерминизма ----
    var snap1 = {
      spawn: JSON.stringify(WS.World.spawnPoint),
      buildings: WS.World.buildings ? WS.World.buildings.length : -1,
      objects: WS.World.objects.length
    };
    ok('мир населён (объектов > 100)', snap1.objects > 100, { n: snap1.objects });

    // ---- 4) время идёт + манифест озвучки (асинхронные проверки) ----
    var t0 = WS.G.time.totalMin;
    setTimeout(function () {
      try {
        var t1 = WS.G.time.totalMin;
        ok('время идёт (totalMin растёт)', t1 > t0, { t0: t0, t1: t1 });
        ok('день в пределах 1..60', WS.Time.day() >= 1 && WS.Time.day() <= 60);
        // 71 = 73 фразы ЭТАПА 9 − 3 дубля (cz_timeup/cz_joint/cz_respawn:
        // их тексты уже в мат-банке, byText конфликтовал) + cz_victory
        ok('манифест озвучки загружен (>= 71 фразы)',
           WS.VoiceBox.ready() && WS.VoiceBox.count() >= 71, { n: WS.VoiceBox.count() });

        // ---- 5) сейв ----
        WS.Save.save('smoke');
        ok('сейв создан', WS.Save.exists('smoke'));

        // ---- 6) детерминизм: тот же сид — тот же мир ----
        WS.Main.newGame('telegraph', ['frostproof', 'patient'], 4242);
        var snap2 = {
          spawn: JSON.stringify(WS.World.spawnPoint),
          buildings: WS.World.buildings ? WS.World.buildings.length : -1,
          objects: WS.World.objects.length
        };
        ok('детерминизм: то же число объектов', snap1.objects === snap2.objects, { a: snap1.objects, b: snap2.objects });
        ok('детерминизм: та же точка старта', snap1.spawn === snap2.spawn);
        ok('детерминизм: то же число зданий', snap1.buildings === snap2.buildings);

        // ---- 7) другой сид — другой мир ----
        WS.Main.newGame('telegraph', ['frostproof', 'patient'], 4243);
        var snap3 = { spawn: JSON.stringify(WS.World.spawnPoint), objects: WS.World.objects.length };
        ok('другой сид — другой мир', snap1.spawn !== snap3.spawn || snap1.objects !== snap3.objects);

        WS.Save.remove('smoke');
        ok('сейв удалён', !WS.Save.exists('smoke'));
        fin();
      } catch (e) {
        bug('исключение в асинхронной части: ' + (e && e.message));
        fin();
      }
    }, 3500);
  } catch (e) {
    bug('фатально: ' + (e && e.message));
    fin();
  }
})();
