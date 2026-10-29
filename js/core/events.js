/**
 * Шина событий. WS.Ev.on(name, fn) / WS.Ev.emit(name, data) / WS.Ev.off(name, fn).
 * Основные события (договор):
 *   'game:start'      — новая игра создана (после генерации мира)
 *   'game:load'        — игра загружена из сохранения
 *   'game:save'        — игра сохранена
 *   'time:hour'        — наступил новый час {hour, day}
 *   'time:day'         — наступил новый день {day}
 *   'player:damage'    — игрок получил урон {amount, type, src}
 *   'player:heal'
 *   'player:die'       — смерть игрока {cause}
 *   'player:levelup'   — {skill, level}
 *   'ent:add' / 'ent:remove'  — сущность добавлена/удалена {ent}
 *   'ent:kill'         — сущность убита {ent, by}
 *   'ent:attack'       — атака {src, dst, dmg}
 *   'item:picked'      — предмет поднят {id, count}
 *   'inv:changed'      — инвентарь изменился
 *   'equip:changed'     — экипировка изменилась {slot}
 *   'ui:toast'         — всплывающее сообщение {text, kind}
 *   'sound:play'       — запрос звука {name, x, y}
 *   'story:note'       — найдена записка {noteId}
 *   'radio:msg'        — сообщение радио {text}
 *   'weather:changed'  — сменилась погода {from, to}
 *   'night:fall'       — началась ночь {day}
 *   'day:dawn'         — рассвет {day}
 */
(function () {
  'use strict';

  var handlers = {};   // name -> [{fn, once}]

  function on(name, fn) {
    if (!handlers[name]) handlers[name] = [];
    handlers[name].push({ fn: fn, once: false });
    return fn;
  }

  function once(name, fn) {
    if (!handlers[name]) handlers[name] = [];
    handlers[name].push({ fn: fn, once: true });
    return fn;
  }

  function off(name, fn) {
    var list = handlers[name];
    if (!list) return;
    for (var i = list.length - 1; i >= 0; i--) {
      if (list[i].fn === fn) list.splice(i, 1);
    }
  }

  function emit(name, data) {
    var list = handlers[name];
    if (!list || !list.length) return;
    // копия: обработчик может отписаться во время эмита
    var snapshot = list.slice();
    for (var i = 0; i < snapshot.length; i++) {
      var h = snapshot[i];
      if (h.once) {
        var idx = list.indexOf(h);
        if (idx >= 0) list.splice(idx, 1);
      }
      try {
        h.fn(data, name);
      } catch (e) {
        WS.err('event handler failed:', name, e && e.message, e);
      }
    }
  }

  WS.def('Ev', { on: on, once: once, off: off, emit: emit });
})();
