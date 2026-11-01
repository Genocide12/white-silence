/**
 * wolf_ai_inpage.js — Т-12: ВОЛЧЬЕ ЧУТЬЁ У ТОЧКИ ИНТЕРЕСА.
 * РЕГРЕССИЯ «враги тупые»: стая ночью шла на точку (запах мяса/шум),
 * находила там деда — и не переключалась на добычу. Волки топтались
 * у цели со state='hunt', не кусали и уходили. Фикс в wolf.js: у точки
 * интереса волк в радиусе 6.5 тайлов чует игрока (не в здании) — стая
 * берёт его как добычу (aggroT+target=игрок) и кусает.
 * Проверяем: ночной hunt с точкой → цель дед → укус (ХП падает);
 * игрок в доме → укуса нет (волки кружат, в дом не лезут).
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

  function waitFor(condFn, cb, tries) {
    var n = tries || 100;
    (function poll() {
      if (condFn()) { cb(); return; }
      if (--n <= 0) { cb(); return; }
      setTimeout(poll, 100);
    })();
  }

  try {
    window.confirm = function () { return true; };

    ok('ядро на месте: AI/World/Time/Inv/Main',
       !!(WS.AI && WS.World && WS.Time && WS.Inv && WS.Main));

    // 1) старт партии охотником на фиксированном сиде
    var started = WS.Main.newGame('hunter', ['frostproof'], 4321);
    ok('newGame стартует (охотник, сид 4321)', started === true);

    // 2) ночь: стая обязана перейти в режим охоты
    WS.G.time.min = 23 * 60;
    var night = !WS.Time.light();
    ok('время выставлено на ночь (light=0)', night === true);

    waitFor(function () {
      return WS.World.ents.some(function (e) { return e.kind === 'wolf' && e.pack; });
    }, function () {
      try {
        var p = WS.G.player;
        // стая и её вожак
        var wolfEnt = null;
        for (var i = 0; i < WS.World.ents.length; i++) {
          var e = WS.World.ents[i];
          if (e.kind === 'wolf' && e.pack) { wolfEnt = e; break; }
        }
        ok('в мире есть стая волков (pack)', !!wolfEnt);
        if (!wolfEnt) { fin(); return; }
        var pack = wolfEnt.pack;

        // 3) дед с мясом: стая ставится рядом, цель — ТОЧКА у деда
        WS.Inv.give('meat_raw', 5);
        ok('мясо в инвентаре (запах)', WS.Inv.count('meat_raw') >= 5);
        var members = pack.members.filter(function (m) { return !m.dead; });
        for (var m = 0; m < members.length; m++) {
          members[m].x = p.x + 4;
          members[m].y = p.y + 2;
        }
        pack.mode = 'hunt';
        pack.target = { x: p.x, y: p.y };      // точка интереса, НЕ игрок
        pack.interestT = 30;
        ok('стая в hunt с точкой интереса у деда', pack.mode === 'hunt' && !!pack.target && !pack.target.kind);

        var hp0 = p.hp;
        // 4) ждём тики ИИ: волк должен учуять деда, переключиться и УКУСИТЬ.
        //    Укус может опаздывать (дисциплина стаи: у цели ≤2 волка,
        //    кулдаун атаки) — поэтому окно 12 сек и поллинг раз в 1.5 с.
        var biteTicks = 0;
        var biten = false;
        (function pollBite() {
          setTimeout(function () {
            try {
              var tgtIsPlayer = pack.target && pack.target.kind === 'player';
              if (biteTicks === 0) {
                // первая проверка: цель уже переключилась?
                ok('стая переключилась на деда (target=игрок, не точка)', tgtIsPlayer === true,
                   { target: pack.target ? (pack.target.kind || 'point') : null });
                ok('волки в состоянии атаки/охоты на деда',
                   members.some(function (m) { return !m.dead && (m.state === 'attack' || m.state === 'hunt'); }),
                   { states: members.map(function (m) { return m.state; }) });
              }
              biteTicks++;
              if (p.hp < hp0 - 3 || biteTicks >= 8) {
                var hp1 = p.hp;
                // дед получил укус: скачок вниз сильно больше фонового дрейфа
                // ХП-часов безумного режима (~0.0012 HP/тик). Укус волка ≥12.
                ok('деду прилетает укус (резкая потеря ХП, не фон часов)',
                   (hp0 - hp1) > 3, { hp0: hp0, hp1: hp1, waited: biteTicks * 1.5 + 's' });

                // 5) дед в доме: укусы прекращаются (в дом волк не лезет).
                //    Сравниваем СКОРОСТЬ дрейфа ХП: без укусов остаются только
                //    ХП-часы безумного режима (~0.07 HP/сек реального времени
                //    при ×1) — не абсолютные значения.
                var bld = WS.World.buildings && WS.World.buildings[0];
                if (bld) {
                  p.x = bld.x + bld.w / 2;
                  p.y = bld.y + bld.h / 2;
                  var hpIn = p.hp;
                  var tIn = WS.G.time.totalMin;
                  setTimeout(function () {
                    try {
                      var hpIn2 = p.hp;
                      var mins = WS.G.time.totalMin - tIn;
                      var inside = !!WS.World.isInside(p.x, p.y);
                      // дрейф за 2.5 сек: без укусов ≈ минуты × 0.00116 (часы) —
                      // при любом реалистичном тайминге это < 3 HP; укус дал бы ≥ 12
                      ok('дед внутри здания (isInside)', inside === true);
                      ok('в доме стая не кусает (потеря ХП только от часов, без укусов)',
                         inside && (hpIn - hpIn2) < 3, { lost: hpIn - hpIn2, mins: mins });
                      fin();
                    } catch (e) { bug('внутри дома: ' + (e && e.message)); fin(); }
                  }, 2500);
                } else {
                  bug('нет зданий в мире — проверку «в доме не кусают» пропустили');
                  fin();
                }
              } else {
                // укуса ещё не было — продолжаем ждать (волк на подходе)
                pollBite();
              }
              } catch (e) { bug('фаза атаки: ' + (e && e.message)); fin(); }
          }, 1500);
        })();
      } catch (e) { bug('подготовка стаи: ' + (e && e.message)); fin(); }
    }, 80);
  } catch (e) {
    bug('фатально: ' + (e && e.message));
    fin();
  }
})();
