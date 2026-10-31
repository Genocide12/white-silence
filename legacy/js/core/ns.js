/**
 * Белое Безмолвие (White Silence) — ядро: глобальное пространство имён.
 *
 * Правила для всех модулей проекта:
 *  1. Никаких import/export. Каждый файл — обычный <script>, расширяющий window.WS.
 *  2. На этапе загрузки файла ЗАПРЕЩЕНЫ вызовы других модулей (кроме WS.def/WS.boot/WS.tick/WS.log).
 *     Вся инициализация — внутри WS.boot(fn): колбэки выполняются после загрузки всех файлов.
 *  3. WS.tick(fn, pri) — регистрация кадровой функции: fn(dt) вызывается каждый кадр
 *     в порядке возрастания pri (0..99: 0 input, 10 time, 20 world, 30 entities, 40 systems,
 *  50 ai, 60 player, 70 render, 80 ui, 90 debug).
 *  4. Все строки интерфейса — через WS.I18N.t(key). Код, данные — латиница, тексты — UTF-8.
 */
(function () {
  'use strict';

  var root = window;

  var WS = {
    VERSION: '1.0.0',
    BUILD: '1917',
    MODULES: {},            // реестр модулей: WS.def('world.gen', {...}) -> WS.world.gen
    _bootFns: [],           // функции инициализации
    _tickFns: [],           // кадровые функции [pri, fn, name]
    _postFns: [],           // после первого кадра
    booted: false,
    dead: false,
    paused: false,
    debug: false
  };

  /** Зарегистрировать модуль по пути. WS.def('world.gen', obj) -> WS.world.gen */
  WS.def = function (path, obj) {
    var parts = path.split('.');
    var cur = WS;
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (!p) continue;
      if (typeof cur[p] === 'undefined') cur[p] = {};
      if (i === parts.length - 1) cur[p] = obj;
      cur = cur[p];
    }
    WS.MODULES[path] = obj;
    return obj;
  };

  /** Зарегистрировать функцию инициализации (выполнятся после загрузки всех скриптов). */
  WS.boot = function (fn, name) {
    WS._bootFns.push({ fn: fn, name: name || (fn.name || 'anon') });
  };

  /** Зарегистрировать кадровую функцию. pri: 0..99. */
  WS.tick = function (pri, fn, name) {
    WS._tickFns.push({ pri: pri, fn: fn, name: name || (fn.name || 'anon') });
    WS._tickFns.sort(function (a, b) { return a.pri - b.pri; });
  };

  /** Функция, вызывающаяся один раз после первого кадра. */
  WS.afterFirstFrame = function (fn) { WS._postFns.push(fn); };

  WS.log = function () {
    if (window.console) console.log.apply(console, ['[WS]'].concat([].slice.call(arguments)));
  };
  WS.warn = function () {
    if (window.console) console.warn.apply(console, ['[WS]'].concat([].slice.call(arguments)));
  };
  WS.err = function () {
    if (window.console) console.error.apply(console, ['[WS]'].concat([].slice.call(arguments)));
  };

  /** Клонирование простых структур данных (без функций). */
  WS.clone = function (o) { return JSON.parse(JSON.stringify(o)); };

  /** Безопасное чтение вложенного свойства: WS.get(WS, 'G.player.hp'). */
  WS.get = function (obj, path) {
    var parts = path.split('.');
    var cur = obj;
    for (var i = 0; i < parts.length; i++) {
      if (cur == null) return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  };

  root.WS = WS;
})();
