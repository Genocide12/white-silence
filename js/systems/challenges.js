/**
 * ИСПЫТАНИЯ: необязательные вызовы выживания. «Ставки недели» — 14 испытаний,
 * выполняются в любой партии, дают очки и помечаются в журнале.
 */
(function () {
  'use strict';

  function toast(text, kind) {
    if (WS.Ui && WS.Ui.toast) WS.Ui.toast(text, kind || 'info');
  }

  function flags() { return (WS.G && WS.G.story && WS.G.story.flags) || {}; }
  function stat(id) { return (WS.G && WS.G.stats && WS.G.stats[id]) || 0; }
  function day() { return WS.Time ? WS.Time.day() : 1; }

  // ================================================================ РЕЕСТР ИСПЫТАНИЙ
  var CHALLENGES = [
    {
      id: 'fast_first_meal',
      name: 'Горячий ужин',
      desc: 'Сварите первое блюдо в первый же день.',
      points: 5,
      check: function () {
        return day() === 1 && stat('mealsCooked') > 0;
      }
    },
    {
      id: 'first_fire',
      name: 'Огонь родился',
      desc: 'Разожгите костёр до заката первого дня.',
      points: 5,
      hint: 'Костёр: B → выберите место. Трут, дрова, спички.',
      check: function () {
        return day() === 1 && !!flags().fire_lit_day1;
      }
    },
    {
      id: 'nightless_week',
      name: 'Домосед',
      desc: 'Семь ночей подряд — под крышей.',
      points: 10,
      check: function () {
        return (flags().warm_nights || 0) >= 7;
      }
    },
    {
      id: 'wolfslayer_1',
      name: 'Первая кровь',
      desc: 'Одолейте волка любым оружием.',
      points: 5,
      check: function () { return stat('wolvesKilled') >= 1; }
    },
    {
      id: 'wolfslayer_knife',
      name: 'Тихо, как в лесу',
      desc: 'Убейте волка ножом или копьём.',
      points: 20,
      hint: 'Загнанный в угол зверь опасен. Крадучись — в упор.',
      check: function () { return !!flags().wolf_knife_kill; }
    },
    {
      id: 'bear_survivor',
      name: 'Ахиллес Севера',
      desc: 'Уцелейте после нападения медведя-шатуна.',
      points: 25,
      check: function () { return !!flags().bear_attack_survived; }
    },
    {
      id: 'bear_hunter',
      name: 'Шатун смирился',
      desc: 'Одолейте медведя-шатуна.',
      points: 40,
      check: function () { return stat('bearsKilled') >= 1; }
    },
    {
      id: 'fisherman_10',
      name: 'Рыбак',
      desc: 'Поймайте 10 рыб.',
      points: 10,
      check: function () { return stat('fishCaught') >= 10; }
    },
    {
      id: 'trapper_5',
      name: 'Хозяин троп',
      desc: 'Пять зверей из капканов или силков.',
      points: 15,
      check: function () { return (flags().trap_kills || 0) >= 5; }
    },
    {
      id: 'full_belly',
      name: 'Сытая зима',
      desc: 'День при сытости выше 80 от рассвета до заката.',
      points: 10,
      check: function () {
        return !!flags().full_belly_day;
      }
    },
    {
      id: 'warm_hands',
      name: 'Тёплые руки',
      desc: 'Носите полный комплект тёплой одежды во все слоты.',
      points: 15,
      check: function () {
        var eq = WS.G && WS.G.player ? WS.G.player.equip : {};
        return !!(eq.head && eq.torso && eq.legs && eq.feet && eq.hands);
      }
    },
    {
      id: 'scholar',
      name: 'Чтец',
      desc: 'Прочитайте 20 записок.',
      points: 10,
      check: function () { return stat('notesRead') >= 20; }
    },
    {
      id: 'craftsman_50',
      name: 'Мастер на все руки',
      desc: 'Создайте 50 предметов.',
      points: 15,
      check: function () { return stat('itemsCrafted') >= 50; }
    },
    {
      id: 'week_survivor',
      name: 'Седьмой день',
      desc: 'Доживите до восьмого дня.',
      points: 10,
      check: function () { return day() >= 8; }
    },
    {
      id: 'polar_survivor',
      name: 'Тьма не съела',
      desc: 'Доживите до 45-го дня (полярная ночь).',
      points: 30,
      check: function () { return day() >= 45; }
    },
    {
      id: 'ship_day',
      name: 'Дождался',
      desc: 'Доживите до прихода парохода.',
      points: 50,
      check: function () { return day() >= 60; }
    },
    {
      id: 'all_houses',
      name: 'Землемер',
      desc: 'Обыщите 30 разных мест.',
      points: 15,
      check: function () { return stat('containersLooted') >= 30; }
    },
    {
      id: 'child_saved',
      name: 'Отогрел дитя',
      desc: 'Спасите Ванятку.',
      points: 35,
      check: function () { return !!flags().child_saved; }
    },
    {
      id: 'dog_friend',
      name: 'Друг человека',
      desc: 'Приручите пса.',
      points: 15,
      check: function () { return !!flags().dog; }
    },
    {
      id: 'hermit_trust',
      name: 'Слово старца',
      desc: 'Заслужите доверие Акима.',
      points: 20,
      check: function () {
        var rep = WS.G && WS.G.story && WS.G.story.rep ? WS.G.story.rep : {};
        return (rep.hermit || 0) >= 5;
      }
    }
  ];

  // ================================================================ СОСТОЯНИЕ
  function completed() {
    if (!WS.G) return {};
    if (!WS.G.story.flags.challenges) WS.G.story.flags.challenges = {};
    return WS.G.story.flags.challenges;
  }

  function totalPoints() {
    var done = completed();
    var sum = 0;
    for (var i = 0; i < CHALLENGES.length; i++) {
      if (done[CHALLENGES[i].id]) sum += CHALLENGES[i].points;
    }
    return sum;
  }

  var checkTimer = 0;

  function tick(dt) {
    if (!WS.G || !WS.G.running) return;
    checkTimer += dt;
    if (checkTimer < 3) return;
    checkTimer = 0;
    var done = completed();
    for (var i = 0; i < CHALLENGES.length; i++) {
      var ch = CHALLENGES[i];
      if (done[ch.id]) continue;
      var ok = false;
      try { ok = ch.check(); } catch (e) { ok = false; }
      if (ok) {
        done[ch.id] = day();
        toast('Испытание принято: «' + ch.name + '» (+' + ch.points + ')', 'good');
        WS.Snd.play('levelup');
        if (WS.G.story.chronicle) {
          WS.G.story.chronicle.push({ day: day(), text: 'Испытание: ' + ch.name });
        }
      }
    }
  }

  // хелпер-флаги из событий
  WS.boot(function initChallenges() {
    WS.tick(47, function chTick(dt) { tick(dt); }, 'challenges:tick');

    // первый костёр в день 1
    WS.Ev.on('fire:lit', function (d) {
      if (day() === 1 && WS.G && WS.G.story) flags().fire_lit_day1 = true;
    });
    // убийство ножом: событие от боя
    WS.Ev.on('ent:kill', function (d) {
      if (!d || !d.ent || d.ent.kind !== 'wolf') return;
      var by = d.by;
      if (by && by.weapon && /knife|spear|scalpel/.test(by.weapon)) {
        flags().wolf_knife_kill = true;
      }
    });
    // пережитая атака медведя
    WS.Ev.on('player:damage', function (d) {
      if (d && d.src && d.src.kind === 'bear' && WS.G && WS.G.player && WS.G.player.hp > 0) {
        // выжил после удара (не умер) — фиксируем при восстановлении hp
        flags().bear_hit = true;
      }
    });
    WS.Ev.on('time:hour', function () {
      if (flags().bear_hit && WS.G && WS.G.player && WS.G.player.hp > 25) {
        flags().bear_attack_survived = true;
        flags().bear_hit = false;
      }
    });
    // сытый день
    WS.Ev.on('time:day', function () {
      if (WS.G && WS.G.player && WS.G.player.needs.hunger >= 80) {
        flags().full_belly_day = true;
      }
    });
    // тёплые ночи подряд
    WS.Ev.on('night:fall', function () {
      if (WS.G && WS.G.player && WS.World.isInside(WS.G.player.x, WS.G.player.y)) {
        flags().warm_nights = (flags().warm_nights || 0) + 1;
      } else {
        flags().warm_nights = 0;
      }
    });
  }, 'challenges:init');

  WS.def('Challenges', {
    all: function () { return CHALLENGES; },
    completed: completed,
    totalPoints: totalPoints,
    maxPoints: function () {
      var s = 0;
      for (var i = 0; i < CHALLENGES.length; i++) s += CHALLENGES[i].points;
      return s;
    },
    list: function () {
      var done = completed();
      var out = [];
      for (var i = 0; i < CHALLENGES.length; i++) {
        out.push({
          id: CHALLENGES[i].id,
          name: CHALLENGES[i].name,
          desc: CHALLENGES[i].desc,
          points: CHALLENGES[i].points,
          done: !!done[CHALLENGES[i].id],
          doneDay: done[CHALLENGES[i].id] || null
        });
      }
      return out;
    }
  });
})();
