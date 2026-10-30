/**
 * ИНТЕГРАЦИЯ НАСТРОЕК с системами и мелкие финальные склейки:
 * тумблеры погодных частиц/крови/следов, FPS-оверлей, применение сложности.
 */
(function () {
  'use strict';

  // ================================================================ FPS-оверлей
  var fpsEl = null;

  function ensureFpsEl() {
    if (fpsEl) return;
    var root = document.getElementById('ui-root');
    if (!root) return;
    fpsEl = document.createElement('div');
    fpsEl.id = 'ws-fps';
    fpsEl.style.cssText =
      'position:fixed;top:6px;right:8px;z-index:600;font:11px monospace;' +
      'color:#7ea3c4;background:rgba(10,14,21,0.6);padding:2px 7px;border-radius:3px;' +
      'display:none;pointer-events:none;';
    root.appendChild(fpsEl);
  }

  // ================================================================ ЗАПРЕТЫ ПО НАСТРОЙКАМ
  /** Обёртка вызова, отключаемая настройкой. */
  function ifOpt(optName, fn) {
    return function () {
      if (WS.Options && WS.Options.get && !WS.Options.get(optName)) return null;
      return fn.apply(null, arguments);
    };
  }

  // ================================================================ ПРИМЕНЕНИЕ СЛОЖНОСТИ К СИСТЕМАМ
  /** Хук: системы умножают свои коэффициенты через WS.Difficulty.mult(name). */
  function patchDifficulty() {
    if (!WS.Difficulty) return;
    // needs.js: если есть хук множителя — применяем
    if (WS.Needs && WS.Needs.setRateMul) WS.Needs.setRateMul(WS.Difficulty.mult('needsRate'));
    // temperature.js
    if (WS.Temp && WS.Temp.setColdMul) WS.Temp.setColdMul(WS.Difficulty.mult('coldRate'));
    // weather: сдвиг базы
    var p = WS.Difficulty.current();
    if (WS.Weather && WS.Weather.setBaseShift && p.tempShift) {
      WS.Weather.setBaseShift(p.tempShift);
    }
  }

  // ================================================================ ТАЙМЕР
  var fpsTimer = 0;

  WS.boot(function initIntegration() {
    ensureFpsEl();

    // тик: FPS-оверлей + периодическое применение сложности
    WS.tick(81, function integrationTick(dt) {
      if (!WS.Options) return;
      // fps
      var show = !!WS.Options.get('showFps');
      if (show) {
        fpsTimer += dt;
        if (fpsTimer > 0.5) {
          fpsTimer = 0;
          fpsEl.style.display = 'block';
          fpsEl.textContent = WS.Loop.fps() + ' fps · ' +
            (WS._tickFns ? WS._tickFns.length : 0) + ' tick · ' +
            (WS.Spr ? WS.Spr.cacheSize() : 0) + ' spr';
        }
      } else if (fpsEl.style.display !== 'none') {
        fpsEl.style.display = 'none';
      }
      // автосейв-тумблер
      if (!WS.Options.get('autosave')) {
        // отключаем: помечаем флагом, Save читает
        WS.Save && (WS.Save.autosaveDisabled = true);
      } else if (WS.Save) {
        WS.Save.autosaveDisabled = false;
      }
    }, 'integration:tick');

    // сложность при старте
    WS.Ev.on('game:start', function () {
      setTimeout(patchDifficulty, 100);
    });

    // тумблер крови: оборачиваем Fx.burst для 'blood'
    if (WS.Fx && WS.Fx.burst) {
      var origBurst = WS.Fx.burst;
      WS.Fx.burst = function (type, x, y, n, o) {
        if (type === 'blood' && WS.Options && !WS.Options.get('blood')) {
          return;
        }
        return origBurst(type, x, y, n, o);
      };
    }

    // тумблер следов: слушаем добавление footprint
    if (WS.World && WS.World.addObject) {
      var origAdd = WS.World.addObject;
      WS.World.addObject = function (o) {
        if (o && o.sprName === 'footprint' && WS.Options && !WS.Options.get('footprints')) {
          return o;   // пропускаем след
        }
        return origAdd(o);
      };
    }

    // тумблер погодных частиц: weather2/ambient слушают
    if (WS.Weather && !WS.Weather.particlesEnabled) {
      WS.Weather.particlesEnabled = function () {
        return WS.Options ? !!WS.Options.get('weatherFx') : true;
      };
    }
    if (WS.Ambient && !WS.Ambient.particlesEnabled) {
      WS.Ambient.particlesEnabled = function () {
        return WS.Options ? !!WS.Options.get('weatherFx') : true;
      };
    }

    // тумблер hints для событий/туториала: им просто проверять Options.get('hints')
  }, 'integration:init');

  WS.def('Integrate', {
    ifOpt: ifOpt,
    patchDifficulty: patchDifficulty
  });
})();
