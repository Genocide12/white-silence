/**
 * РЕПУТАЦИЯ: единый трекер отношений с людьми и «слухами» мира.
 * Аким, Семён, Матрёна, Фёдор, Ванятка, пёс — и посёлок как целое.
 * Плюс «слухи»: узнают ли бандиты, что в посёлке кто-то жив.
 */
(function () {
  'use strict';

  function toast(text, kind) {
    if (WS.Ui && WS.Ui.toast) WS.Ui.toast(text, kind || 'info');
  }

  // ================================================================ УРОВНИ ДОВЕРИЯ
  var LEVELS = [
    { min: -100, max: -40, name: 'Враг' },
    { min: -39, max: -15, name: 'Недоверие' },
    { min: -14, max: -1, name: 'Настороженность' },
    { min: 0, max: 9, name: 'Незнакомец' },
    { min: 10, max: 24, name: 'Знакомый' },
    { min: 25, max: 44, name: 'Свои' },
    { min: 45, max: 74, name: 'Доверие' },
    { min: 75, max: 100, name: 'Родной человек' }
  ];

  function levelName(v) {
    for (var i = 0; i < LEVELS.length; i++) {
      if (v >= LEVELS[i].min && v <= LEVELS[i].max) return LEVELS[i].name;
    }
    return v > 100 ? 'Родной человек' : 'Враг';
  }

  function rep() {
    if (!WS.G) return {};
    if (!WS.G.story) WS.G.story = {};
    if (!WS.G.story.rep) WS.G.story.rep = {};
    return WS.G.story.rep;
  }

  /** Изменить репутацию NPC. */
  function change(who, delta, why) {
    var r = rep();
    var was = r[who] || 0;
    var now = Math.max(-100, Math.min(100, was + delta));
    r[who] = now;
    if (Math.floor(was / 10) !== Math.floor(now / 10)) {
      // сменился уровень
      var names = { hermit: 'Аким', semen: 'Семён', matrena: 'Матрёна', fedor: 'Фёдор' };
      if (names[who]) {
        toast(names[who] + ': «' + levelName(now) + '»', delta > 0 ? 'good' : 'warn');
      }
    }
    if (why && WS.G.story && WS.G.story.chronicle) {
      WS.G.story.chronicle.push({
        day: WS.Time.day(),
        text: (who === 'hermit' ? 'Аким' : who) + ': ' + (delta > 0 ? '+' : '') + delta + ' (' + why + ')'
      });
    }
    WS.Ev.emit('rep:changed', { who: who, from: was, to: now, why: why });
    return now;
  }

  function get(who) { return rep()[who] || 0; }

  // ================================================================ СЛУХИ (bandits know)
  /** Шум в посёлке повышает «слухи»: бандиты чаще проверяют. */
  function heat() {
    if (!WS.G) return 0;
    if (!WS.G.story.heat) WS.G.story.heat = 0;
    return WS.G.story.heat;
  }

  function addHeat(v, why) {
    if (!WS.G) return;
    if (!WS.G.story) WS.G.story = {};
    if (!WS.G.story.heat) WS.G.story.heat = 0;
    var was = WS.G.story.heat;
    WS.G.story.heat = Math.max(0, Math.min(100, was + v));
    if (was < 50 && WS.G.story.heat >= 50) {
      toast('Похоже, о вас заговорили. По дорогам ходят лишние глаза.', 'warn');
    }
    if (why && WS.G.story.chronicle) {
      WS.G.story.chronicle.push({ day: WS.Time.day(), text: 'Слухи: +' + v + ' (' + why + ')' });
    }
    return WS.G.story.heat;
  }

  // затухание слухов со временем
  WS.boot(function initReputation() {
    WS.Ev.on('time:day', function () {
      if (!WS.G || !WS.G.story) return;
      if (WS.G.story.heat) {
        WS.G.story.heat = Math.max(0, WS.G.story.heat - 6);   // забывается
      }
    });
    // выстрелы поднимают слухи
    WS.Ev.on('noise', function (d) {
      if (!d || !d.r || d.r < 40) return;
      addHeat(2, 'громкий шум');
    });
    // убийство бандита: на короткое время пугает их (шанс встречи ниже),
    // но слухи растут
    WS.Ev.on('ent:kill', function (d) {
      if (d && d.ent && d.ent.kind === 'bandit') {
        addHeat(8, 'пропал человек');
      }
    });
  }, 'rep:init');

  WS.def('Rep', {
    change: change,
    get: get,
    levelName: levelName,
    heat: heat,
    addHeat: addHeat,
    LEVELS: LEVELS
  });
})();
