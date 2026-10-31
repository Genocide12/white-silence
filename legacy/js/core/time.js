/**
 * Игровое время. Старт: 1 ноября 1917 года, 08:00.
 * До прихода весеннего парохода — 60 дней (30 декабря 1917): победа.
 * Масштаб: 1 игровая минута = 1 секунда реального времени (на скорости x1).
 * Т.е. игровые сутки = 24 реальных минуты.
 */
(function () {
  'use strict';

  var MIN_PER_SEC = 1;      // игровых минут за реальную секунду при скорости x1
  var DAYS_TO_SHIP = 60;    // дней до парохода

  // [день, час] -> описание фазы освещённости (полярная ночь нарастает)
  // Широта ~66°: к декабрю солнце не встаёт вовсе.
  function sunFactor(day, hour) {
    // day: 1..60 (1 ноября .. 30 декабря)
    var t = (day - 1) / (DAYS_TO_SHIP - 1);          // 0..1
    // максимум высоты солнца падает от 8° до -3° (полярная ночь с ~14 декабря)
    var maxElev = lerpN(8, -3, clampN(t * 1.35, 0, 1));
    // суточный ход: пик в 12:00
    var dayAngle = Math.sin(((hour - 6) / 12) * Math.PI);
    var elev = maxElev * Math.max(0, dayAngle);
    return clampN(elev / 12, 0, 1);                   // 0 = ночь, 1 = яркое солнце
  }

  function clampN(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function lerpN(a, b, t) { return a + (b - a) * t; }

  var Time = {
    // состояние: WS.G.time = {day, min, totalMin}
    newGame: function () {
      return { day: 1, min: 8 * 60, totalMin: 8 * 60, hourFired: -1, dayFired: -1 };
    },

    /** Тик: dt в секундах реального времени. */
    update: function (dt) {
      var g = WS.G;
      if (!g || !g.time) return;
      var t = g.time;
      var gameMin = dt * MIN_PER_SEC * (WS.Loop.speed || 1) * WS.Time.timeScale();
      t.totalMin += gameMin;
      t.min += gameMin;
      while (t.min >= 1440) {
        t.min -= 1440;
        t.day += 1;
        WS.Ev.emit('time:day', { day: t.day });
        if (t.day > DAYS_TO_SHIP) WS.Ev.emit('time:overdue', { day: t.day });
      }
      var hour = Math.floor(t.min / 60);
      if (hour !== t.hourFired) {
        t.hourFired = hour;
        WS.Ev.emit('time:hour', { hour: hour, day: t.day });
        if (hour === 21) WS.Ev.emit('night:fall', { day: t.day });
        if (hour === 6) WS.Ev.emit('day:dawn', { day: t.day });
      }
    },

    /** Множитель течения времени (во сне x8, при чтении x4). */
    timeScale: function () {
      return (WS.G && WS.G.player && WS.G.player.sleeping) ? 8 : 1;
    },

    day: function () { return WS.G && WS.G.time ? WS.G.time.day : 1; },
    hour: function () { return WS.G && WS.G.time ? Math.floor(WS.G.time.min / 60) : 8; },
    minute: function () { return WS.G && WS.G.time ? Math.floor(WS.G.time.min % 60) : 0; },
    /** Дробный час, например 8.5 = 08:30. */
    hourF: function () { return WS.G && WS.G.time ? WS.G.time.min / 60 : 8; },
    totalMin: function () { return WS.G && WS.G.time ? WS.G.time.totalMin : 0; },

    /** Освещённость 0..1. */
    light: function () {
      var t = WS.G && WS.G.time;
      if (!t) return 1;
      return sunFactor(t.day, t.min / 60);
    },

    /** День недели (1 ноября 1917 — четверг). */
    weekday: function () {
      var names = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
      // 1 ноября 1917 (нов. стиль) — четверг
      return names[(3 + (Time.day() - 1)) % 7];
    },

    /** Дней до парохода. */
    daysLeft: function () { return DAYS_TO_SHIP - Time.day(); },

    /** Строка «14 ноября, 08:35». */
    fmt: function () {
      var t = WS.G && WS.G.time;
      if (!t) return '';
      var d = Time.day();
      var months = ['Января', 'Февраля', 'Марта', 'Апреля', 'Мая', 'Июня',
                    'Июля', 'Августа', 'Сентября', 'Октября', 'Ноября', 'Декабря'];
      var md = 1 + ((d - 1) % 30);
      var mo = months[10 + Math.floor((d - 1) / 30)] || 'Декабря';
      var h = Math.floor(t.min / 60), m = Math.floor(t.min % 60);
      return md + ' ' + mo + ', ' + (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
    },

    /** Полярная ночь? (после 14 декабря, day 44) */
    isPolarNight: function () { return Time.day() >= 44; },

    DAYS_TO_SHIP: DAYS_TO_SHIP
  };

  WS.boot(function initTime() {
    // ГЛАВНЫЙ ТИК ЧАСОВ. Приоритет 1 — самый первый в шаге симуляции:
    // все системы ниже по приоритету читают уже обновлённые день/час.
    //
    // FIX (этап «Демо»): раньше WS.Time.update НИКТО не вызывал — часы
    // стояли на 08:00 первого дня вечно. Меню, нужды и мороз работали
    // (каждый считал своё «игровое время» от dt), но день не сменялся,
    // сюжетные события (time:day / time:hour) не наступали, и пароход
    // не мог прийти: партия была бесконечным первым днём.
    WS.tick(1, function timeCoreTick(dt) {
      Time.update(dt);
    }, 'time:core');
    WS.log('time: часы подключены (тик 1, 1 игра-мин = 1 реал-сек при ×1)');
  }, 'time:init');

  WS.def('Time', Time);
})();
