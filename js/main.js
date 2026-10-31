/**
 * Точка входа. Порядок запуска:
 *  1. выполняются WS.boot() всех модулей (после загрузки всех скриптов)
 *  2. меню (если есть UI) или автостарт тестовой партии
 *  3. WS.Loop.start()
 *
 * Сценарии старта партии (вызывает UI):
 *   WS.Main.newGame(prof, traits)  — генерирует мир, ставит игрока, стартует
 *   WS.Main.loadGame()             — из сейва
 *   WS.Main.die(cause)             — смерть (экран перма-смерти)
 */
(function () {
  'use strict';

  var Main = {
    started: false,

    newGame: function (prof, traits, seed) {
      // сброс глобальных стоп-флагов: экран финала (death_screen) ставит
      // WS.dead=true при смерти, и без сброса следующая партия (например,
      // агент роя после смерти предыдущего) заморожена — Loop не тикает
      WS.dead = false;
      WS.paused = false;
      // новая партия = чистый интерфейс: закрыть экраны реестра (финал,
      // окно концовки-подтверждения и прочие), иначе забытый модальный
      // экран держит симуляцию на паузе (Ui.modal() = true)
      if (WS.Ui && WS.Ui.closeAll) {
        try { WS.Ui.closeAll(); } catch (eC) { WS.err('newGame: closeAll упал:', eC && eC.message); }
      }
      World_reset();
      var G = WS.State.newGame(seed, prof, traits);
      WS.G = G;
      // генерация мира (модуль генерации)
      if (WS.Gen && WS.Gen.generate) {
        WS.Gen.generate(G.seed);
      }
      // игрок на точке появления
      var sp = World_spawn();
      G.player.x = sp.x; G.player.y = sp.y;
      World_addPlayer(G.player);
      if (WS.Weather && WS.Weather.newGame) WS.Weather.newGame();
      if (WS.Story && WS.Story.newGame) WS.Story.newGame();
      G.running = true;
      WS.Cam.follow = G.player;
      WS.Cam.cx = sp.x; WS.Cam.cy = sp.y;
      WS.Ev.emit('game:start', { prof: prof });
      WS.Snd.play('bell');
      return true;
    },

    loadGame: function () {
      var data = WS.Save.load('main');
      if (!data) return false;
      World_reset();
      WS.G = data.core;
      if (WS.Gen && WS.Gen.generate) WS.Gen.generate(WS.G.seed);
      World_restore(data.world);
      var sp = World_spawnFromLoad();
      if (WS.Weather && WS.Weather.deserialize) WS.Weather.deserialize(WS.G.weather);
      WS.G.running = true;
      WS.Cam.follow = WS.G.player;
      WS.Ev.emit('game:load', {});
      return true;
    },

    die: function (cause) {
      if (!WS.G || WS.G.dead) return;
      WS.G.running = false;
      WS.Ev.emit('player:die', { cause: cause });
      if (WS.Ui && WS.Ui.deathScreen) WS.Ui.deathScreen(cause);
    },

    /** Победа: пароход пришёл. */
    victory: function () {
      if (!WS.G) return;
      WS.G.running = false;
      WS.Ev.emit('game:victory', {});
      if (WS.Ui && WS.Ui.victoryScreen) WS.Ui.victoryScreen();
    }
  };

  function World_reset() {
    if (WS.World) WS.World.reset();
    if (WS.Fx) WS.Fx.clear();
    if (WS.Snd) WS.Snd.stopAmbience();
  }

  function World_spawn() {
    // если генератор задал spawnPoint — использовать
    return (WS.World && WS.World.spawnPoint) ? WS.World.spawnPoint : { x: 110, y: 110 };
  }

  function World_addPlayer(p) {
    if (WS.World) WS.World.addEnt(p);
  }

  function World_restore(diff) {
    if (WS.World && WS.World.deserialize) WS.World.deserialize(diff);
    // восстановить игрока в ents
    if (WS.G && WS.G.player && WS.World) {
      var found = false;
      for (var i = 0; i < WS.World.ents.length; i++) if (WS.World.ents[i].id === 'player') found = true;
      if (!found) WS.World.addEnt(WS.G.player);
    }
  }

  function World_spawnFromLoad() {
    return { x: WS.G.player.x, y: WS.G.player.y };
  }

  function bootMain() {
    var order = WS._bootFns.map(function (b) { return b.name; });
    WS.log('booting modules:', order.length);
    var t0 = performance.now();
    for (var i = 0; i < WS._bootFns.length; i++) {
      try {
        WS._bootFns[i].fn();
      } catch (e) {
        WS.err('boot "' + WS._bootFns[i].name + '" failed:', e && e.message, e && e.stack);
      }
    }
    WS.booted = true;
    WS.log('boot complete in', Math.round(performance.now() - t0), 'ms');

    // старт: показать меню (UI сам решает, что дальше)
    if (WS.Ui && WS.Ui.showMenu) {
      WS.Ui.showMenu();
    } else {
      // без UI — сразу тестовая партия (dev-режим)
      Main.newGame('telegraph', []);
    }

    WS.Loop.start();
  }

  // все скрипты подключены до конца body; после события load запускаем бут
  if (document.readyState === 'complete') {
    bootMain();
  } else {
    window.addEventListener('load', bootMain, { once: true });
  }

  WS.def('Main', Main);
})();
