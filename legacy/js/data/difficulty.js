/**
 * ПРОФИЛИ СЛОЖНОСТИ + ПОСМЕРТНЫЙ АНАЛИЗ.
 * Difficulty: 4 профиля, множители всех систем.
 * Postmortem: разбор партии после смерти — «что погубило».
 */
(function () {
  'use strict';

  // ================================================================ СЛОЖНОСТЬ
  var PROFILES = {
    story: {
      id: 'story', name: 'Рассказчик',
      desc: 'Мягкий мороз, сытный лут, зверь осторожен. Для истории.',
      needsRate: 0.75,        // нужды падают медленнее
      coldRate: 0.7,          // теплопотеря меньше
      lootBonus: 1.35,        // больше добычи
      wolfAggr: 0.7,          // волки робче
      wolfCount: 0.75,        // меньше волков
      banditAcc: 0.7,         // бандиты мажут
      sickChance: 0.7,
      healRate: 1.3,
      startBonus: ['matches', 'bread', 'water_flask']
    },
    survivor: {
      id: 'survivor', name: 'Выживший',
      desc: 'Честная зима 1917 года. Как задумано.',
      needsRate: 1.0,
      coldRate: 1.0,
      lootBonus: 1.0,
      wolfAggr: 1.0,
      wolfCount: 1.0,
      banditAcc: 1.0,
      sickChance: 1.0,
      healRate: 1.0,
      startBonus: []
    },
    hard: {
      id: 'hard', name: 'Север не прощает',
      desc: 'Голодный лут, лютый мороз, стаи наглеют. Шаг ценой жизни.',
      needsRate: 1.3,
      coldRate: 1.25,
      lootBonus: 0.75,
      wolfAggr: 1.3,
      wolfCount: 1.25,
      banditAcc: 1.15,
      sickChance: 1.3,
      healRate: 0.85,
      startBonus: []
    },
    polar: {
      id: 'polar', name: 'Полярная ночь',
      desc: 'Ноябрь сразу как январь. Для тех, кто ищет не игру, а судьбу.',
      needsRate: 1.5,
      coldRate: 1.5,
      lootBonus: 0.6,
      wolfAggr: 1.5,
      wolfCount: 1.5,
      banditAcc: 1.25,
      sickChance: 1.5,
      healRate: 0.7,
      startBonus: [],
      tempShift: -6           // база холоднее
    }
  };

  var current = 'survivor';

  function setProfile(id) {
    if (!PROFILES[id]) return false;
    current = id;
    if (WS.G) {
      WS.G.difficulty = id;
    }
    return true;
  }

  function cur() { return PROFILES[current] || PROFILES.survivor; }
  function mult(name) {
    var p = cur();
    return p[name] !== undefined ? p[name] : 1;
  }

  // ================================================================ ПОСМЕРТНЫЙ АНАЛИЗ
  /** Разбор: что стало причиной и советы на следующую жизнь. */
  function postmortem(cause) {
    var g = WS.G;
    if (!g) return null;
    var s = g.stats || {};
    var p = g.player || {};
    var report = {
      cause: cause || 'Неизвестно',
      diagnosis: '',
      lessons: [],
      metrics: {}
    };

    // --- диагноз по причине
    var c = String(cause || '').toLowerCase();
    if (/волк|wolf/.test(c)) {
      report.diagnosis = 'Зверь победил вас там, где победила невнимательность: шум, открытая местность, отсутствие огня.';
      if (s.nightsOutside > 2) report.lessons.push('Спали под открытым небом ' + s.nightsOutside + ' раз. Ночлег — не роскошь.');
      report.lessons.push('Костёр и факел — оружие против стаи. Держите их наготове на закате.');
      report.lessons.push('Крадучись вы невидимы для волка. Бегущий человек — приглашение.');
    } else if (/медвед|bear/.test(c)) {
      report.diagnosis = 'Шатун не прощает ни любопытства, ни жадности к шкуре.';
      report.lessons.push('Следы крупнее волчьих — повод обойти, а не идти на шум.');
      report.lessons.push('Медведь в стойке — последние секунды на выстрел между глаз или бегство к реке.');
    } else if (/бандит|расстре|пул/.test(c)) {
      report.diagnosis = 'Человек убивает человека хладнокровнее зверя.';
      if (s.containersLooted > 30) report.lessons.push('Шумный обыск выдаёт вас. Иногда дом лучше обойти.');
      report.lessons.push('Дезертиры не лезут в дома. Стены — ваш последний козырь.');
    } else if (/голода/.test(c)) {
      report.diagnosis = 'Сытость кончилась раньше дней.';
      report.lessons.push('Погреба (cellar) — главные кладовые посёлка. Начинайте с них.');
      report.lessons.push('Капканы и силки кормят лучше ружья: патрон дороже зайца.');
      report.lessons.push('Жир горит дольше хлеба. Ищите сало и масло.');
    } else if (/жажд|воды/.test(c)) {
      report.diagnosis = 'В стране льда умирают от жажды. Не вы первый.';
      report.lessons.push('Снег и сосульки — вода, но сырыми они несут хворь. Кипятите у огня.');
    } else if (/мороз|замёрз|гипотерм|переохлажд/.test(c)) {
      report.diagnosis = 'Холод — ваш главный противник, и он победил по очкам.';
      if (p.frostbite > 40) report.lessons.push('Обморожение > 40 — это чёрные пальцы. Рукавицы и тепло лечат лучше отваги.');
      report.lessons.push('Слои одежды + ветрозащита. Один тулуп не спасает от ветра на реке.');
      report.lessons.push('Печь топится перед сном, а не утром. Угли под вьюшкой держат ночь.');
    } else if (/кров|кровотеч|истек/.test(c)) {
      report.diagnosis = 'Кровь ушла в снег. Снег её запомнил.';
      if (!s || !s.bandagesUsed) report.lessons.push('Бинты должны быть ДО боя, а не после.');
      report.lessons.push('Водка дезинфицирует и греет духом. Йод — надёжнее.');
    } else if (/безум|рассуд/.test(c)) {
      report.diagnosis = 'Тишина добралась туда, куда не дошли ни зверь, ни мороз.';
      report.lessons.push('Чай, гармонь, молитва, сон у печи. Рассудок — тоже ресурс.');
      report.lessons.push('Североерном сияние лечит лучше тоски.');
    } else if (/болезн|лихора|тиф|сепс/.test(c)) {
      report.diagnosis = 'Хворь пришла за вами по расписанию, а вы его не читали.';
      report.lessons.push('Сырую воду и поганки не едят. Даже очень голодные.');
      report.lessons.push('Хинин у фельдшера. Чай с мёдом. Постель.');
    } else {
      report.diagnosis = 'Север забирает без объяснений. Это его право.';
      report.lessons.push('Каждый день — дистанция. Считайте их, а не шансы.');
    }

    // --- метрики
    report.metrics = {
      'Дней продержался': g.time ? g.time.day : 0,
      'Волков убито': s.wolvesKilled || 0,
      'Домов обыскано': s.containersLooted || 0,
      'Предметов создано': s.itemsCrafted || 0,
      'Записок прочитано': s.notesRead || 0,
      'Ночей в тепле': s.nightsSlept || 0,
      'Шагов пройдено': s.stepsWalked || 0
    };

    // общий урок по статистике
    if ((s.containersLooted || 0) < 5 && (g.time ? g.time.day : 0) > 3) {
      report.lessons.push('За ' + (g.time ? g.time.day : '?') + ' дней обыскано всего ' + (s.containersLooted || 0) + ' мест. Посёлок полон — используйте его.');
    }
    if ((s.itemsCrafted || 0) === 0) {
      report.lessons.push('Ни одного предмета не создано. Крафт — половина выживания.');
    }

    return report;
  }

  /** Форматированный текст для экрана смерти. */
  function postmortemText(cause) {
    var r = postmortem(cause);
    if (!r) return '';
    var out = r.diagnosis + '\n\n';
    if (r.lessons.length) {
      out += 'Уроки этой зимы:\n';
      for (var i = 0; i < r.lessons.length && i < 5; i++) {
        out += '— ' + r.lessons[i] + '\n';
      }
    }
    return out;
  }

  // ================================================================ ИНТЕГРАЦИЯ
  WS.boot(function () {
    // применить профиль при старте
    WS.Ev.on('game:start', function () {
      if (WS.G && WS.G.difficulty) setProfile(WS.G.difficulty);
      // стартовый бонус («Рассказчик»)
      var p = cur();
      if (p.startBonus && p.startBonus.length && WS.Inv && WS.Inv.give) {
        for (var i = 0; i < p.startBonus.length; i++) WS.Inv.give(p.startBonus[i], 1);
      }
    });
    // посмертный отчёт — в экран смерти
    WS.Ev.on('player:die', function (d) {
      if (!WS.G) return;
      WS.G.postmortem = postmortemText(d && d.cause);
      WS.G.postmortemReport = postmortem(d && d.cause);
    });
  }, 'difficulty:init');

  WS.def('Difficulty', {
    PROFILES: PROFILES,
    set: setProfile,
    current: cur,
    mult: mult,
    id: function () { return current; },
    postmortem: postmortem,
    postmortemText: postmortemText
  });
})();
