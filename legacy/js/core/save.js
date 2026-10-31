/**
 * Сохранение: localStorage, один слот на персонажа (пермадет как в PZ:
 * при смерти сейв удаляется). Мир не сохраняется целиком — только seed и диффы.
 *
 * Формат: WS.SAVE_KEY_PREFIX + 'main' -> JSON {
 *   core: WS.G (без функций),
 *   world: WS.World.serialize() — диффы мира
 * }
 */
(function () {
  'use strict';

  var KEY = 'ws_save_';
  var AUTOSAVE_MIN = 15;      // автосейв каждые N игровых минут
  var lastSaveMin = -1;

  function can() {
    try {
      var k = KEY + 't';
      localStorage.setItem(k, '1');
      localStorage.removeItem(k);
      return true;
    } catch (e) { return false; }
  }

  function save(slot) {
    if (!WS.G || !WS.G.running) return false;
    if (!can()) return false;
    try {
      var data = {
        core: WS.G,
        world: WS.World ? WS.World.serialize() : null,
        savedAt: Date.now(),
        gameDay: WS.G.time.day,
        gameMin: WS.G.time.min
      };
      localStorage.setItem(KEY + (slot || 'main'), JSON.stringify(data));
      lastSaveMin = WS.G.time.totalMin;
      WS.Ev.emit('game:save', { slot: slot || 'main' });
      return true;
    } catch (e) {
      WS.err('save failed', e);
      return false;
    }
  }

  function load(slot) {
    if (!can()) return null;
    try {
      var raw = localStorage.getItem(KEY + (slot || 'main'));
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || !data.core) return null;
      return data;
    } catch (e) {
      WS.err('load failed', e);
      return null;
    }
  }

  function exists(slot) {
    if (!can()) return false;
    return !!localStorage.getItem(KEY + (slot || 'main'));
  }

  function remove(slot) {
    if (!can()) return;
    localStorage.removeItem(KEY + (slot || 'main'));
  }

  function meta(slot) {
    var d = load(slot);
    if (!d) return null;
    return {
      day: d.gameDay, min: d.gameMin, savedAt: d.savedAt,
      prof: d.core && d.core.player ? d.core.player.prof : '?'
    };
  }

  /** Автосейв по игровому времени. */
  WS.boot(function initSave() {
    var lastDemoSave = 0;
    WS.Ev.on('time:hour', function () {
      if (!WS.G || !WS.G.running) return;
      // ДЕМО-ПРОХОЖДЕНИЕ: автосейв пишет в ДЕМО-слот и не чаще раза в 5 с
      // (на скорости ×120 игровой час наступает дважды в секунду — сейв
      // большого мира так часто не поставить). Сейв игрока не затираем!
      if (WS.Demo && WS.Demo.active && WS.Demo.active()) {
        if (Date.now() - lastDemoSave > 5000) {
          lastDemoSave = Date.now();
          save('demo');
        }
        return;
      }
      save('main');
    });
    WS.Ev.on('player:die', function () {
      // пермадет: сейв уничтожается (в демо — только демо-слот,
      // живой сейв игрока неприкосновенен)
      if (WS.Demo && WS.Demo.active && WS.Demo.active()) remove('demo');
      else remove('main');
    });
  }, 'save:init');

  WS.def('Save', {
    save: save,
    load: load,
    exists: exists,
    remove: remove,
    meta: meta,
    can: can,
    AUTOSAVE_MIN: AUTOSAVE_MIN
  });
})();
