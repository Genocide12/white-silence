/**
 * РЕЖИМ НАБЛЮДАТЕЛЯ: при долгом бездействии камера медленно следит
 * за жизнью мира — волки, олени, погода. Как «attract mode» в автоматах.
 */
(function () {
  'use strict';

  var idleTime = 0;
  var watching = false;
  var watchTarget = null;
  var returnTo = null;

  var IDLE_LIMIT = 45;         // секунд бездействия до включения
  var WATCH_DUR = [14, 22];    // длительность слежения за одной целью

  function anyInput() {
    if (!WS.Input) return true;
    var m = WS.Input.mouse();
    var moved = (m.x !== lastMX) || (m.y !== lastMY);
    lastMX = m.x; lastMY = m.y;
    return moved || WS.Input.down('up') || WS.Input.down('down') ||
           WS.Input.down('left') || WS.Input.down('right') ||
           m.left || m.right || m.wheel !== 0;
  }
  var lastMX = -1, lastMY = -1;

  /** Выбрать интересную цель: хищник, стадо, труп, или просто точка мира. */
  function pickTarget() {
    if (!WS.G || !WS.G.player) return null;
    var p = WS.G.player;
    var ents = WS.World ? WS.World.entsNear(p.x, p.y, 40) : [];
    // приоритет: медведь > волки > бандит > олень > заяц > ворона
    var priority = ['bear', 'wolf', 'bandit', 'deer', 'dog', 'hare', 'crow'];
    for (var pr = 0; pr < priority.length; pr++) {
      var pool = [];
      for (var i = 0; i < ents.length; i++) {
        if (ents[i].kind === priority[pr] && ents[i].hp > 0) pool.push(ents[i]);
      }
      if (pool.length) return pool[Math.floor(Math.random() * pool.length)];
    }
    // нет зверя — красивая точка: огонь
    var lights = WS.World ? WS.World.lightsNear(p.x, p.y, 40) : [];
    if (lights.length) return lights[Math.floor(Math.random() * lights.length)];
    return null;
  }

  function startWatching() {
    watchTarget = pickTarget();
    if (!watchTarget) return;
    watching = true;
    returnTo = { follow: WS.Cam.follow };
    WS.Cam.follow = watchTarget;
    WS.Cam.target = watchTarget;
    var dur = WATCH_DUR[0] + Math.random() * (WATCH_DUR[1] - WATCH_DUR[0]);
    watchTimer = dur;
    if (WS.Ui && WS.Ui.toast) {
      WS.Ui.toast('Вы замечаете движение и смотрите туда...', 'info');
    }
  }

  function stopWatching() {
    if (!watching) return;
    watching = false;
    watchTarget = null;
    WS.Cam.target = null;
    if (returnTo && returnTo.follow) {
      WS.Cam.follow = returnTo.follow;
    } else if (WS.G && WS.G.player) {
      WS.Cam.follow = WS.G.player;
    }
    returnTo = null;
  }

  var watchTimer = 0;

  WS.boot(function initIdleWatch() {
    WS.tick(85, function idleTick(dt) {
      if (!WS.G || !WS.G.running || !WS.G.player) {
        stopWatching();
        return;
      }
      // модал — не считаем бездействием
      if (WS.Ui && WS.Ui.modal && WS.Ui.modal()) {
        idleTime = 0;
        stopWatching();
        return;
      }
      if (WS.G.player.sleeping) {
        idleTime = 0;    // сон — не attract
        return;
      }

      if (anyInput()) {
        idleTime = 0;
        if (watching) stopWatching();
        return;
      }
      idleTime += dt;

      if (!watching && idleTime > IDLE_LIMIT) {
        startWatching();
        idleTime = 0;
      } else if (watching) {
        watchTimer -= dt;
        // цель умерла/ушла — сменить или выйти
        if (!watchTarget || (watchTarget.hp !== undefined && watchTarget.hp <= 0)) {
          stopWatching();
        } else if (watchTimer <= 0) {
          stopWatching();
        }
      }
    }, 'idlewatch:tick');
  }, 'idlewatch:init');

  WS.def('IdleWatch', {
    isWatching: function () { return watching; },
    target: function () { return watchTarget; },
    stop: stopWatching
  });
})();
