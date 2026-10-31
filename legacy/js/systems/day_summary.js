/**
 * СВОДКА ДНЯ: в полночь подводит итоги прошедших суток — как ежедневник.
 * Считает еду, шаги, бой, находки; сравнивает с прошедшими днями.
 */
(function () {
  'use strict';

  function toast(text, kind) {
    if (WS.Ui && WS.Ui.toast) WS.Ui.toast(text, kind || 'info');
  }

  // снимок статистики на начало дня
  var dayStart = null;
  var days = [];         // история сводок
  var pending = null;    // сводка дня для показа после пробуждения/полуночи

  function snap() {
    var g = WS.G;
    if (!g || !g.stats) return null;
    var s = g.stats;
    return {
      day: g.time ? g.time.day : 1,
      steps: s.stepsWalked || 0,
      looted: s.containersLooted || 0,
      crafted: s.itemsCrafted || 0,
      wolves: s.wolvesKilled || 0,
      bears: s.bearsKilled || 0,
      bandits: s.banditsKilled || 0,
      hunted: s.animalsHunted || 0,
      fish: s.fishCaught || 0,
      notes: s.notesRead || 0,
      meals: s.mealsCooked || 0,
      slept: s.nightsSlept || 0
    };
  }

  function diff(a, b) {
    return {
      day: b.day,
      steps: Math.max(0, b.steps - a.steps),
      looted: Math.max(0, b.looted - a.looted),
      crafted: Math.max(0, b.crafted - a.crafted),
      wolves: Math.max(0, b.wolves - a.wolves),
      bears: Math.max(0, b.bears - a.bears),
      bandits: Math.max(0, b.bandits - a.bandits),
      hunted: Math.max(0, b.hunted - a.hunted),
      fish: Math.max(0, b.fish - a.fish),
      notes: Math.max(0, b.notes - a.notes),
      meals: Math.max(0, b.meals - a.meals)
    };
  }

  /** Текстовая сводка. */
  function text(d) {
    var lines = [];
    // подзаголовок: чем запомнился день
    var tags = [];
    if (d.wolves > 0) tags.push(d.wolves === 1 ? 'волк' : 'волки ×' + d.wolves);
    if (d.bears > 0) tags.push('шатун');
    if (d.bandits > 0) tags.push('люди');
    if (d.crafted > 4) tags.push('мастерил');
    if (d.looted > 5) tags.push('обыскивал');
    if (d.meals > 2) tags.push('стряпал');
    if (d.notes > 1) tags.push('читал записки');
    var head = tags.length ? ('День прошёл за: ' + tags.join(', ') + '.') : 'День прошёл тихо.';
    lines.push(head);

    var details = [];
    if (d.steps > 300) details.push('пройдено ' + d.steps + ' шагов');
    if (d.looted > 0) details.push('обыскано мест: ' + d.looted);
    if (d.crafted > 0) details.push('изготовлено: ' + d.crafted);
    if (d.meals > 0) details.push('блюд: ' + d.meals);
    if (d.fish > 0) details.push('рыб: ' + d.fish);
    if (d.hunted > 0) details.push('добычи: ' + d.hunted);
    if (d.notes > 0) details.push('записок: ' + d.notes);
    if (details.length) lines.push(details.join(' · ') + '.');
    return lines.join(' ');
  }

  /** Лучший день по критерию. */
  function bestBy(field) {
    if (!days.length) return null;
    var b = days[0];
    for (var i = 1; i < days.length; i++) {
      if (days[i][field] > b[field]) b = days[i];
    }
    return b;
  }

  WS.boot(function initDaySummary() {
    // старт партии: снимок
    WS.Ev.on('game:start', function () {
      dayStart = snap();
      days = [];
    });
    // полночь: подводим итог
    WS.Ev.on('time:day', function (d) {
      if (!dayStart) { dayStart = snap(); return; }
      var now = snap();
      if (!now) return;
      var summary = diff(dayStart, now);
      summary.day = dayStart.day;
      days.push(summary);
      if (days.length > 60) days.shift();
      dayStart = now;

      // показ: если игрок не спит — тостом; если спит — копим до пробуждения
      var t = text(summary);
      if (WS.G && WS.G.player && WS.G.player.sleeping) {
        pending = t;
      } else {
        toast('Итог дня ' + summary.day + ': ' + t, 'info');
      }
    });
    // пробуждение: показать накопленное
    WS.tick(43, function summaryTick() {
      if (pending && WS.G && WS.G.player && !WS.G.player.sleeping) {
        var t = pending;
        pending = null;
        setTimeout(function () { toast('Проснувшись, вспоминаете: ' + t, 'info'); }, 800);
      }
    }, 'daysummary:tick');
  }, 'daysummary:init');

  WS.def('DaySummary', {
    days: function () { return days; },
    text: text,
    bestBy: bestBy,
    pending: function () { return pending; }
  });
})();
