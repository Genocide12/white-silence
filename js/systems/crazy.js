/**
 * РЕЖИМ «БЕЗУМНЫЙ ДЕД» — полное переосмысление «Белого Безмолвия».
 *
 * НОВАЯ ИСТОРИЯ: дед один живёт в лесу, ему давно снесло башню от грибов.
 * Он видит мультяшные галлюцинации, считает себя великим магом и «изгоняет»
 * зверей не убийством, а лодошкой/вантузом — после чего они превращаются в
 * ПОДАРКИ с полезными предметами. В еде и воде не нуждается (чекнутый),
 * не мёрзнет и не устаёт. Зато с каждым днём тикает общий запас ХП:
 * не успеет за 60 дней разжечь Магический Огонь и улететь на тарелке —
 * ХП дойдёт до нуля, и дед окончательно уснёт (проигрыш).
 *
 * МЕХАНИКИ:
 *  - нужды (голод/жажда/усталость) заморожены, температура всегда 36.6°;
 *  - ХП-ЧАСЫ: 100 ХП тают за 60 игровых дней (~1.7 ХП/день);
 *  - «Смерть» в бою = прикорнуть: дед просыпается НА ТОМ ЖЕ МЕСТА с половиной
 *    ХП, а обидчики рядом «изгоняются» в подарки;
 *  - косяк деда / весёлые грибы — лечение (полное/частичное);
 *  - ГРИБНАЯ ЭНЕРГИЯ — валюта Древа Мудрости (прокачка), капает за
 *    изгнания, обыски и каждый прожитый день;
 *  - ДРЕВО МУДРОСТИ (клавиша T): 3 ветки × 4 навыка, всё влияет по-настоящему;
 *  - озвучка реплик деда голосом (Web Speech API, рус.);
 *  - кровь заменена конфетти, трупы — подарками: никакой жестокости.
 *
 * Автор игры: DirtyG.
 */
(function () {
  'use strict';

  // ====================================================================
  //  КОНСТАНТЫ
  // ====================================================================

  var FINAL_MIN = 60 * 1440;            // игровых минут на всё (60 дней)
  var DRAIN_PER_MIN = 100 / FINAL_MIN;  // ХП за игровую минуту (100 → 0 за 60 дней)

  var KIND_ENERGY = {                   // грибная энергия за изгнание
    wolf: 8, bear: 25, bandit: 12, deer: 6, hare: 3, crow: 2
  };
  var KIND_NAME = {
    wolf: 'волк', bear: 'медведь', bandit: 'бандит', deer: 'олень',
    hare: 'заяц', crow: 'ворон', generic: 'мираж'
  };

  var DAILY_ENERGY = 4;                 // просто за то, что жив (день прожит)
  var SEARCH_ENERGY = 1;                // за обыск контейнера

  // реплики изгнания (голос + текст) — угарно-матерные, дед не интеллигент
  var BANISH_LINES = [
    'Изыди, мультяшка, бляха-муха!',
    'Получай лопатой, сволочь рисованная!',
    'Ах ты ж ёб твою медь!',
    'Лодошкой его! Лодошкой, едрён-батон!',
    'Бац! И нету тебя, пиздюк глазастый!',
    'В подарки превращайся, хрень картонная!',
    'Вот тебе, грибной посланник, насяльника!',
    'Ногой его! Ногой, курва малахольная!',
    'Изыди, нечисть мультипликационная!'
  ];
  // реплики МУЛЬТЯШЕК при изгнании (голос cartoon: писклявый, украинский
  // акцент — озвучены студийно, assets/voice). Дед изгоняет — жертва
  // успевает облажаться напоследок. Это и есть «весёлая манера».
  var CARTOON_TAUNTS = [
    'Ой-ой-ой, діду, за що?! Я ж добра мультичка!',
    'Не бий, діду! Я тобі цукерок принесу!',
    'Ай! Лапка! Моя намальована лапка!',
    'Ми ж просто співали пісеньки про гриби!',
    'Караул! Рятувайте, хто може! Дід озброївся вантузом!',
    'Я малювався чесно! Олівцем! Мене мама-мультфільм чекає!',
    'Ой, лусну! Лусну від дідової лодошки!'
  ];
  // галлюцинации (тосты, редкие) — дед под грибами не скучает
  var HALL_TOASTS = [
    'Снег сегодня подозрительно фиолетовый. Херня какая-то, но красиво.',
    'Кажется, тот пень мне подмигнул. Ну и хер с ним, с пнём.',
    'Слышу хор грибов. Поют, бля, слаженно!',
    'Вон та берёза — точно замаскированный шпион. Милицию! Хотя... пошли они.',
    'Небо что-то шепчет. Пожалуй, соглашусь, нахер.',
    'Мой вантуз разговаривает со мной. Умный парень, блять!',
    'Видел летающего оленя. Поздоровался. Вежливый олень, ебён-копытён.',
    'Луна подмигнула. Дважды. Распущенная луна, вот что я скажу.',
    'Кажется, я забыл, как меня зовут. Ну и хер с ним — деда и так узнают.',
    'Эти волки — просто злые облачка. Ладошкой их, ладошкой!'
  ];
  var HIGH_TOASTS = [
    'ВОТ ЭТО ДУРЬ! Краски поехали, п*здец какой красивый!',
    'Грибочки — это сила. Вижу радугу, блять!',
    'Сливаюсь со вселенной. И с этим сугробом. Ебическая сила!',
    'Духи предков шлют привет. И я им. Привет, батя!'
  ];

  // ====================================================================
  //  ПРЕДМЕТЫ ДЕДА (регистрируем при загрузке)
  // ====================================================================

  var CRAZY_ITEMS = {
    palm_ded: {
      cat: 'weapon', w: 0.0, stack: 1,
      dmg: 12, range: 1.1, atkSpd: 1.5, knock: 10, crit: 5,
      tags: ['weapon'],
      ru: 'Лодошка Деда', rud: 'Главный калибр деда: всегда при нём, не теряется, не ржавеет. Изгоняет мультяшек по самое не балуйся.'
    },
    plunger_magic: {
      cat: 'weapon', w: 0.9, stack: 1,
      dmg: 16, range: 1.1, atkSpd: 1.3, knock: 16, crit: 8,
      tags: ['weapon'],
      ru: 'Вантуз Древних', rud: 'Бьёт духа сантехники. Мультяшкам больно и стыдно.'
    },
    hammer_rubber: {
      cat: 'weapon', w: 0.4, stack: 1,
      dmg: 12, range: 1.0, atkSpd: 1.7, knock: 12, crit: 5,
      tags: ['weapon'],
      ru: 'Резиновый молоток Справедливости', rud: 'Справедливость быстрая, как аукцион.'
    },
    pan_war: {
      cat: 'weapon', w: 1.2, stack: 1,
      dmg: 19, range: 0.9, atkSpd: 0.85, knock: 14, crit: 6,
      tags: ['weapon'],
      ru: 'Сковородка Праведного Гнева', rud: 'Гнев праведный. Бок — горячий.'
    },
    boots_swift: {
      cat: 'tool', w: 0.9, stack: 1, tags: ['boots'],
      // slots обязателен: WS.Inv.equip('feet') проверяет def.slots
      // (inventory.js), а бонус скорости читается с equip.feet — без
      // поля сапоги были ненадеваемыми, +15% скорости — мёртвым кодом
      slots: ['feet'],
      ru: 'Сапоги-Скороходы', rud: 'Носить на ногах: +15% скорости деда.'
    },
    joint_ded: {
      cat: 'med', w: 0.02, stack: 3, heal: 9999, tags: ['med'],
      ru: 'Косяк Деда', rud: 'Травка лесная. ХП — на максимум, реальность — в отпуск.'
    },
    mushroom_fun: {
      cat: 'med', w: 0.05, stack: 6, heal: 25, tags: ['med', 'food'],
      ru: 'Весёлый Гриб',rud: 'Хрустящий. +25 ХП и немного мультиков.'
    },
    tincture_fly: {
      cat: 'med', w: 0.4, stack: 2, heal: 45, tags: ['med'],
      ru: 'Настойка на мухоморах', rud: 'Дедовская классика. +45 ХП, урок на потом.'
    },
    candy_ded: {
      cat: 'med', w: 0.01, stack: 8, heal: 10, tags: ['med'],
      ru: 'Конфета «Дедовская»', rud: 'Из подарка изгнанника. +10 ХП, вкус детства.'
    },
    stardust: {
      cat: 'misc', w: 0.05, stack: 20, tags: ['misc'],
      ru: 'Звёздная Пыль', rud: 'Сыпется из изгнанных мультяшек. Горсть такой пыли в Магический Огонь — и тарелка слышит деда. Звать инопланетян — самое то!'
    }
  };

  // ====================================================================
  //  ДРЕВО МУДРОСТИ (T)
  // ====================================================================

  var TREE = [
    {
      id: 'body', name: 'ТЕЛО ДЕДА', icon: '🦴',
      nodes: [
        { id: 'speed', name: 'Скорость Ежа', max: 3, cost: [2, 3, 4],
          desc: '+8% скорости за уровень' },
        { id: 'organs', name: 'Крепкий Организм', max: 3, cost: [2, 3, 4],
          desc: '−12% расхода ХП-часов за уровень' },
        { id: 'shroom', name: 'Грибная Сила', max: 3, cost: [3, 4, 5],
          desc: '+0.04 ХП в игровую минуту (регенерация)' },
        { id: 'cat', name: 'Кошачьи Жизни', max: 2, cost: [4, 6],
          desc: 'После прикорнутья: 55% / 65% ХП' }
      ]
    },
    {
      id: 'hands', name: 'РУКИ ДЕДА', icon: '🖐️',
      nodes: [
        { id: 'plunger', name: 'Вантуз-Мастер', max: 3, cost: [2, 3, 4],
          desc: '+12% урона лодошкой и предметами' },
        { id: 'quick', name: 'Ловкие Ручки', max: 3, cost: [2, 3, 4],
          desc: '+12% грибной энергии за все дела' },
        { id: 'trophy', name: 'Трофейная Лапа', max: 3, cost: [3, 4, 5],
          desc: '+8% шанса подарка при изгнании' }
      ]
    },
    {
      id: 'spirit', name: 'ДУХ ДЕДА', icon: '🍄',
      nodes: [
        { id: 'vision', name: 'Мультивидение', max: 3, cost: [2, 3, 4],
          desc: 'Галлюцинации ярче, +2 энергии в день' },
        { id: 'cosmic', name: 'Космический Косяк', max: 2, cost: [5, 7],
          desc: '+15 к максимальному ХП' },
        { id: 'patience', name: 'Дедовское Терпение', max: 2, cost: [3, 5],
          desc: '−8% расхода ХП-часов' },
        { id: 'luck', name: 'Дедовская Удача', max: 3, cost: [2, 3, 4],
          desc: '+15% лечения от косяка и грибов' }
      ]
    }
  ];

  // ====================================================================
  //  СОСТОЯНИЕ (живёт в WS.G.crazy, сохраняется в сейв автоматически)
  // ====================================================================

  function newState() {
    return {
      energy: 0,            // грибная энергия
      spent: {},            // nodeId -> уровень
      hpShadow: -1,         // ЕДИНЫЙ истинный ХП деда (см. postTick)
      highT: 0,             // сек «под кайфом» (радуга)
      dayMark: 0,           // последний обработанный день
      lastTm: -1,           // прошлый totalMin (дельта для стока ХП)
      respawns: 0,          // сколько раз прикорнул
      banished: 0,          // сколько мультяшек изгнал
      hallT: 0,             // таймер следующей галлюцинации
      toastT: 0,            // таймер смешного тоста
      voiceOn: true,        // озвучка
      autoSpend: false,     // бот: тратить энергию самому
      saidLow: false,       // сказал про низкое ХП
      saidD50: false        // сказал про дедлайн
    };
  }

  function ST() {
    var g = WS.G;
    if (!g) return null;
    if (!g.crazy) g.crazy = newState();
    return g.crazy;
  }

  // ---- чтение эффектов дерева ----
  function lv(id) {
    var st = ST();
    return st && st.spent ? (st.spent[id] || 0) : 0;
  }
  function drainMul() {
    var m = (1 - 0.12 * lv('organs')) * (1 - 0.08 * lv('patience'));
    // мета-слой: перк «Крепкий Череп» (экспедиции)
    try {
      if (WS.Expeditions && WS.Expeditions.drainMul) m *= WS.Expeditions.drainMul();
    } catch (e) { /* пусто */ }
    return m;
  }
  function speedMul() {
    var m = 1 + 0.08 * lv('speed');
    try {
      if (WS.Expeditions && WS.Expeditions.speedMul) m *= WS.Expeditions.speedMul();
    } catch (e) { /* пусто */ }
    return m;
  }
  function regenPerMin() {
    return 0.04 * lv('shroom');
  }
  function respawnFrac() {
    return Math.min(0.75, 0.5 + 0.05 * lv('cat'));
  }
  function dmgMul() {
    var m = 1 + 0.12 * lv('plunger');
    try {
      if (WS.Expeditions && WS.Expeditions.dmgMul) m *= WS.Expeditions.dmgMul();
    } catch (e) { /* пусто */ }
    return m;
  }
  function energyMul() {
    var m = 1 + 0.12 * lv('quick');
    try {
      if (WS.Expeditions && WS.Expeditions.energyMul) m *= WS.Expeditions.energyMul();
    } catch (e) { /* пусто */ }
    return m;
  }
  function dropChance() {
    var c = 0.35 + 0.08 * lv('trophy');
    try {
      if (WS.Expeditions && WS.Expeditions.giftBonus) c += WS.Expeditions.giftBonus();
    } catch (e) { /* пусто */ }
    return c;
  }
  function healMul() {
    return 1 + 0.15 * lv('luck');
  }
  function maxHpBonus() {
    return 15 * lv('cosmic');
  }

  // ====================================================================
  //  МАЛЫЕ УТИЛИТЫ
  // ====================================================================

  function P() { return WS.G ? WS.G.player : null; }
  function dist(ax, ay, bx, by) {
    var dx = ax - bx, dy = ay - by;
    return Math.sqrt(dx * dx + dy * dy);
  }
  function toast(text, kind) {
    try { if (WS.Ui && WS.Ui.toast) WS.Ui.toast(text, kind || 'info'); } catch (e) { /* пусто */ }
  }

  // ====================================================================
  //  ГОЛОС ДЕДА — делегируется системе мыслей WS.Thoughts:
  //  единый бас (pitch 0.42, rate 0.92), антиспам, пузырь мысли,
  //  запись в журнал демо. Здесь — только совместимая обёртка.
  // ====================================================================

  var Voice = {
    say: function (text, key, gapSec) {
      try {
        if (!WS.Thoughts) return;
        if (key) WS.Thoughts.say(text, key, { cd: gapSec || 25 });
        else WS.Thoughts.speak(text);
      } catch (e) { /* безголосый дед — тоже дед */ }
    },
    toggle: function () {
      var st = ST();
      var on;
      try { on = WS.Thoughts.setVoiceOn(!(WS.Thoughts.isVoiceOn())); }
      catch (e) { on = true; }
      if (st) st.voiceOn = on;
      return on;
    }
  };

  // ====================================================================
  //  FX: конфетти вместо крови, подарки вместо трупов
  // ====================================================================

  var CONF_COLS = ['#ff5f8f', '#5fd0ff', '#ffd76e', '#9f7bff', '#7bffb0'];

  function confetti(x, y, n) {
    if (!WS.Fx || !WS.Fx.burst) return;
    for (var i = 0; i < (n || 8); i++) {
      try {
        WS.Fx.burst('crazy_confetti', x, y, 2, { col: CONF_COLS[i % CONF_COLS.length], life: 0.9 });
      } catch (e) { /* пусто */ }
    }
  }

  function wrapFx() {
    var orig = WS.Fx.burst;
    WS.Fx.burst = function (kind, x, y, n, o) {
      if (kind === 'blood') {              // крови не будет: дед добрый
        confetti(x, y, Math.max(3, Math.min(4, (n || 4) >> 1)));
        return;
      }
      return orig.call(WS.Fx, kind, x, y, n, o);
    };
  }

  /** Спрайт подарка (кубик с бантом и звёздами). */
  function defSprites() {
    var S = WS.Spr;
    if (!S || !S.def) return;
    S.def('crazy_gift', { w: 30, h: 30, draw: function (c) {
      // коробка
      S.px(c, 6, 12, 18, 14, '#b3541e');
      S.px(c, 6, 12, 18, 3, '#d86a28');
      S.px(c, 6, 23, 18, 3, '#8f3f14');
      // бант
      S.px(c, 13, 5, 4, 8, '#ffd76e');
      S.px(c, 9, 6, 4, 3, '#ffd76e');
      S.px(c, 17, 6, 4, 3, '#ffd76e');
      // звёздочки
      S.px(c, 9, 17, 2, 2, '#ffe9a8');
      S.px(c, 19, 20, 2, 2, '#ffe9a8');
      S.px(c, 14, 21, 2, 2, '#ffe9a8');
    }});
  }

  // ====================================================================
  //  ЭНЕРГИЯ И ПОДАРКИ
  // ====================================================================

  function gainEnergy(n, why) {
    var st = ST();
    if (!st || !(n > 0)) return;
    var add = Math.round(n * energyMul() * 10) / 10;
    st.energy += add;
    if (add >= 1 && why !== 'quiet') {
      updatePanel();
    }
  }

  /** Изгнание: монстр превращается в подарок. */
  function onBanish(x, y, kind, corpseObj) {
    var st = ST();
    if (!st) return;
    st.banished++;
    var gain = KIND_ENERGY[kind] || 4;
    gainEnergy(gain, 'quiet');
    confetti(x, y, 12);
    try {
      if (WS.Fx && WS.Fx.text) WS.Fx.text('ПУФ!', x, y - 0.8, { col: '#ffd76e', size: 15, life: 1.2 });
    } catch (e) { /* пусто */ }
    // подарок с бонусами: шанс на дедовские предметы
    if (corpseObj) {
      corpseObj._crazyExtra = corpseObj._crazyExtra || [];
      // ФАКЕЛЬНОЕ ТОПЛИВО: без 3 факелов не будет Магического Огня —
      // раньше мирная игра не собирала их НИКОГДА (жир 18% только с
      // тел, в контейнерах 8%) — признанная дыра баланса. Изгнанник
      // честно оставляет деду НЕДОСТАЮЩИЙ ингредиент, пока факелы
      // не собраны (жир/масло → тряпьё → доски).
      try {
        var pInv = P();
        var torchN = 0, fatN = 0, oilN = 0, ragN = 0, plankN = 0, plasterN = 0;
        if (pInv && pInv.inv) {
          for (var ii = 0; ii < pInv.inv.length; ii++) {
            var it2 = pInv.inv[ii];
            if (!it2) continue;
            if (it2.id === 'torch') torchN += it2.count || 1;
            else if (it2.id === 'fat') fatN += it2.count || 1;
            else if (it2.id === 'lamp_oil') oilN += it2.count || 1;
            else if (it2.id === 'cloth_rag') ragN += it2.count || 1;
            else if (it2.id === 'plank') plankN += it2.count || 1;
            else if (it2.id === 'plaster_cast') plasterN += it2.count || 1;
          }
        }
        // МЕДИЦИНСКИЙ ПРИОРИТЕТ: дед с нелеченым переломом ползёт ×0.45 —
        // это главная ловушка ранней игры (плейтест роя: зонд к Д9 имел
        // 1 изгнание и 0 материалов именно из-за сломанной ноги). Пока
        // нога не зафиксирована — подарок несёт шину (доска+тряпка),
        // изгнанник «жалеет хромого деда».
        var needSplint = false;
        try {
          needSplint = !!(pInv && pInv.fracture && !pInv.fracTreat &&
            plasterN < 1 && (plankN < 1 || ragN < 1));
        } catch (eS) { /* пусто */ }
        if (needSplint) {
          // ТРЯПКИ С ЗАПАСОМ: шина ест 1 доску + 1 тряпку за каждый
          // перелом, а переломы при танке повторяются (укус = 10% шанс).
          // Раньше несли по 1 — шина съедала всё, факелам тряпок не
          // оставалось (рой: 8 досок, 0 тряпок, 0 факелов к Д15).
          if (plankN < 1) corpseObj._crazyExtra.push({ id: 'plank', count: 1 });
          corpseObj._crazyExtra.push({ id: 'cloth_rag', count: 2 });
        } else if (torchN < 3) {
          // ДЕФИЦИТНАЯ ЧАСТЬ: на 3 факела нужно 3 горючего + 3 тряпки +
          // 3 доски (двойной рецепт экономит, но капы считаем по трём
          // одиночным — верняк). Раньше цепочка была серийной
          // (жир→жир→жир→тряпки→доска) и на 3 факела уходило 8-9
          // подарков; теперь несём то, чего не хватает сильнее всего.
          var missFuel = Math.max(0, 3 - (fatN + oilN));
          var missRag = Math.max(0, 3 - ragN);
          var missPlank = Math.max(0, 3 - plankN);
          if (missFuel > 0 && missFuel >= missRag && missFuel >= missPlank) {
            corpseObj._crazyExtra.push({ id: 'fat', count: 1 });
            if (Math.random() < 0.4) corpseObj._crazyExtra.push({ id: 'lamp_oil', count: 1 });
          } else if (missRag > 0 && missRag >= missPlank) {
            corpseObj._crazyExtra.push({ id: 'cloth_rag', count: 2 });
          } else if (missPlank > 0) {
            corpseObj._crazyExtra.push({ id: 'plank', count: 1 });
          }
        }
      } catch (eF) { /* пусто */ }
      if (Math.random() < dropChance()) {
        var drops = ['mushroom_fun', 'candy_ded', 'candy_ded'];
        if (Math.random() < 0.22) drops.push('joint_ded');
        if (Math.random() < 0.10) drops.push('plunger_magic');
        if (Math.random() < 0.10) drops.push('hammer_rubber');
        corpseObj._crazyExtra.push({ id: drops[(Math.random() * drops.length) | 0], count: 1 });
      }
      // ЗВЁЗДНАЯ ПЫЛЬ: топливо Грибного Зова — ранняя победа возможна,
      // только если дед честно изгоняет мультяшек (шанс растёт от перка
      // «Ладошка-Гром» экспедиций)
      try {
        var dustCh = (WS.Expeditions && WS.Expeditions.dustChance) ?
          WS.Expeditions.dustChance() : 0.4;
        if (Math.random() < dustCh) {
          corpseObj._crazyExtra.push({ id: 'stardust', count: 1 });
          try {
            if (WS.Fx && WS.Fx.text) WS.Fx.text('✨', x, y - 1.2, { col: '#9fd7ff', size: 13, life: 1.4 });
          } catch (eD2) { /* пусто */ }
        }
      } catch (eD) { /* пыли не будет — не страшно */ }
    }
    // МУЛЬТЯШКА ПРОЩАЕТСЯ: писклявый голос жертвы (35%) — потом дед
    var line = BANISH_LINES[(Math.random() * BANISH_LINES.length) | 0];
    try {
      if (Math.random() < 0.35 && WS.Thoughts) {
        WS.Thoughts.say(CARTOON_TAUNTS[(Math.random() * CARTOON_TAUNTS.length) | 0],
          'cz_cartoon', { cd: 20, prio: 2 });
      }
    } catch (eC) { /* мультяшка молчит в тряпочку */ }
    try {
      if (WS.Thoughts) WS.Thoughts.say(line, 'banish' + (st.banished % 4), { cd: 14, prio: 2 });
    } catch (e) { /* пусто */ }
    updatePanel();
  }

  /** Прямое изгнание сущности (для «обидчиков» после прикорнутья). */
  function banishEnt(e) {
    if (!e || e.dead) return;
    var w = WS.World;
    try {
      if (WS.Loot && WS.Loot.makeCorpse) WS.Loot.makeCorpse(e.x, e.y, e.kind || 'generic');
    } catch (err) { /* пусто */ }
    try { if (w && w.removeEnt) w.removeEnt(e); } catch (err2) { /* пусто */ }
  }

  function banishHostilesNear(x, y, r) {
    var w = WS.World;
    if (!w || !w.ents) return 0;
    var n = 0;
    for (var i = w.ents.length - 1; i >= 0; i--) {
      var e = w.ents[i];
      if (!e || e.dead || e.hp === undefined) continue;
      if (e.kind !== 'wolf' && e.kind !== 'bear' && e.kind !== 'bandit') continue;
      if (dist(e.x, e.y, x, y) <= r) { banishEnt(e); n++; }
    }
    return n;
  }

  // ====================================================================
  //  СМЕРТЬ → «ПРИКОРНУТЬЕ»
  // ====================================================================

  function wrapDeath() {
    var origDie = WS.Main.die;
    WS.Main.die = function (cause) {
      var g = WS.G;
      if (!g || g.dead) return;
      var st = ST();
      // НАСТОЯЩИЙ конец только один: 60 дней истекли
      var tm = WS.Time ? WS.Time.totalMin() : 0;
      if (g._crazyFinal || tm >= FINAL_MIN) {
        g._crazyFinal = true;
        return origDie.call(WS.Main, cause || 'Время вышло: 60 дней прошло, ХП деда иссякли.');
      }
      // otherwise: дед прикорнул
      var p = g.player;
      if (!p) return origDie.call(WS.Main, cause);
      st.respawns++;
      p.hp = Math.max(1, Math.round((p.maxHp || 100) * respawnFrac()));
      st.hpShadow = p.hp;
      p.bleed = 0; p.infection = 0; p.pain = 0; p.sick = null;
      p.fracture = false; p.frostbite = 0; p._wet = 0;
      p.sleeping = false; p._faintT = 0; p._blinkT = 0; p._chillT = 0;
      st.saidLow = false;
      var ban = banishHostilesNear(p.x, p.y, 14);
      confetti(p.x, p.y, 14);
      try {
        if (WS.Fx && WS.Fx.text) WS.Fx.text('ПУФ! Опять живой', p.x, p.y - 1.2, { col: '#ffd76e', size: 16, life: 1.6 });
        if (WS.Cam && WS.Cam.kick) WS.Cam.kick(2.5);
      } catch (e) { /* пусто */ }
      toast('Дед прикорнул и проснулся. Обидчики изгнаны: ' + ban + '.', 'good');
      Voice.say('Чё это было? А, привиделось. Продолжаем!', 'respawn', 40);
      gainEnergy(2, 'quiet');
      updatePanel();
      return true;
    };
  }

  // ====================================================================
  //  ТИКИ
  // ====================================================================

  /** До систем (pri 39): заморозить нужды/температуру/болячки,
   *  вернуть деду его истинный ХП (авторитет — hpShadow). */
  function preTick() {
    var g = WS.G;
    if (!g || !g.running || g.dead) return;
    var p = g.player;
    if (!p) return;
    var st = ST();
    var n = p.needs;
    if (n) {
      n.hunger = 100; n.thirst = 100; n.fatigue = 100;
      n.sanity = 55;                      // дед чекнутый, но живой
    }
    p.temp = 36.6;
    p.frostbite = 0;
    p._wet = 0;
    p.sick = null;
    p.infection = 0;
    // истинный ХП: с начала кадра дед владеет своим запасом
    if (st.hpShadow < 0) st.hpShadow = p.hp;
    p.hp = st.hpShadow;
    // скорость: сапоги-скороходы + дерево
    var sp = speedMul();
    var eq = p.equip || {};
    if (eq.feet && eq.feet.id === 'boots_swift') sp *= 1.15;
    p._extMoveMul = sp;
  }

  /** После систем (pri 45): ХП-часы, регенерация, галлюцинации, дедлайн. */
  function postTick(dt) {
    var g = WS.G;
    if (!g || !g.running || g.dead) return;
    var st = ST();
    var p = g.player;
    if (!p) return;

    // --- дельта игрового времени ---
    var tm = WS.Time ? WS.Time.totalMin() : 0;
    if (st.lastTm < 0) st.lastTm = tm;
    var dm = tm - st.lastTm;
    if (dm < 0) dm = 0;                   // загрузка сейва — не мотаем назад
    st.lastTm = tm;

    // --- ХП-ЧАСЫ через «тень»: единственный истинный запас — st.hpShadow.
    //    Пропускаем только УРОН (delta < 0); сонную регенерацию health.js
    //    (+0.5 HP/час) игнорируем: чекнутого деда лечат лишь грибы и косяк.
    if (st.hpShadow < 0) st.hpShadow = p.hp;
    var after = p.hp;
    var delta = after - st.hpShadow;
    if (delta < 0) st.hpShadow = Math.max(0, st.hpShadow + delta);   // урон принят
    // delta > 0 — чужое лечение (регенерация во сне) — НЕ принимаем

    if (dm > 0 && !g._crazyFinal) {
      var drain = DRAIN_PER_MIN * dm * drainMul();
      st.hpShadow -= drain;
      if (regenPerMin() > 0) {
        st.hpShadow = Math.min(p.maxHp || 100, st.hpShadow + regenPerMin() * dm);
      }
      if (st.hpShadow < 0) st.hpShadow = 0;
    }
    p.hp = st.hpShadow;

    // --- макс. ХП от «Космического Косяка» ---
    var wantMax = 100 + maxHpBonus();
    if ((p.maxHp || 100) !== wantMax) p.maxHp = wantMax;

    // --- дедлайн: 60 дней истекли ---
    if (!g._crazyFinal && tm >= FINAL_MIN) {
      g._crazyFinal = true;
      st.hpShadow = 0;
      p.hp = 0;
      Voice.say('Всё, дед. Время вышло. Спать.', 'timeup', 1);
      try { WS.Main.die('Время вышло: 60 дней прошло. ХП деда иссякли — он уснул навсегда.'); }
      catch (e) { /* пусто */ }
      return;
    }

    // --- ХП добил до нуля ДО дедлайна (драться надо было лучше) — прикорнул ---
    if (st.hpShadow <= 0 && !g._crazyFinal) {
      try { WS.Main.die('Деда вырубили. Он прикорнул прямо на снегу.'); } catch (e) { /* пусто */ }
      return;
    }

    // --- новый день: энергия + реплика ---
    var day = WS.Time ? WS.Time.day() : 1;
    if (st.dayMark !== day) {
      var first = st.dayMark === 0;
      st.dayMark = day;
      if (!first) {
        gainEnergy(DAILY_ENERGY + 2 * lv('vision'), 'quiet');
        toast('День ' + day + ' из 60. Дед всё ещё жив. 🍄 +' +
          Math.round((DAILY_ENERGY + 2 * lv('vision')) * energyMul()) + ' энергии', 'good');
        Voice.say('День ' + day + '. Грибной энергии прибавилось.', 'day', 300);
      }
      // предупреждение о дедлайне
      if (day === 50 && !st.saidD50) {
        st.saidD50 = true;
        toast('50 дней прошло! Осталось 10. Пора думать про Магический Огонь.', 'warn');
        Voice.say('Время поджимает, дед. Пятьдесят дней прошло.', 'd50', 1);
      }
    }

    // --- низкое ХП: паническая реплика ---
    if (p.hp < 30 && !st.saidLow) {
      st.saidLow = true;
      toast('ХП на исходе! Косяк деда бы сейчас…', 'bad');
      Voice.say('Ох, чую, лапти свои скоро увижу. Косяк где?', 'lowhp', 90);
    } else if (p.hp > 55) {
      st.saidLow = false;
    }

    // --- «под кайфом»: радуга ---
    if (st.highT > 0) {
      st.highT -= dt;
      document.body.classList.add('crazy-high');
      if (st.highT <= 0) document.body.classList.remove('crazy-high');
    }

    // --- галлюцинации (мирные частицы вокруг деда) ---
    st.hallT -= dt;
    if (st.hallT <= 0) {
      var intensity = 1 + lv('vision') * 0.5 + (st.highT > 0 ? 2 : 0);
      st.hallT = (10 + Math.random() * 8) / intensity;
      try {
        var ang = Math.random() * Math.PI * 2;
        var r = 1.5 + Math.random() * 2.5;
        WS.Fx.spawn('crazy_confetti', p.x + Math.cos(ang) * r, p.y + Math.sin(ang) * r, {
          col: CONF_COLS[(Math.random() * CONF_COLS.length) | 0],
          z: 20 + Math.random() * 18, life: 1.6, grav: -2, size: 4
        });
        if (Math.random() < 0.2) {
          WS.Fx.text(['и-и-их!', 'грибы!', 'мультики!', '∞'][(Math.random() * 4) | 0],
            p.x + Math.cos(ang) * 2, p.y - 1.5,
            { col: CONF_COLS[(Math.random() * CONF_COLS.length) | 0], size: 12, life: 1.3 });
        }
      } catch (e) { /* пусто */ }
    }

    // --- смешные тосты-галюны ---
    st.toastT -= dt;
    if (st.toastT <= 0) {
      st.toastT = 45 + Math.random() * 60;   // реальных секунд
      if (Math.random() < 0.65) {
        var list = st.highT > 0 ? HIGH_TOASTS : HALL_TOASTS;
        toast('🌀 ' + list[(Math.random() * list.length) | 0], 'info');
      }
    }

    // --- автопрокачка (демо-бот) ---
    if (st.autoSpend) treeAutoSpend();

    updatePanelLite();
  }

  // ====================================================================
  //  ДРЕВО: трата энергии
  // ====================================================================

  function nodeDef(id) {
    for (var i = 0; i < TREE.length; i++) {
      var nds = TREE[i].nodes;
      for (var k = 0; k < nds.length; k++) if (nds[k].id === id) return nds[k];
    }
    return null;
  }

  function spend(id) {
    var st = ST();
    if (!st) return { ok: false, why: 'нет игры' };
    var nd = nodeDef(id);
    if (!nd) return { ok: false, why: 'нет такого навыка' };
    var cur = lv(id);
    if (cur >= nd.max) return { ok: false, why: 'максимум' };
    var cost = nd.cost[cur];
    if (st.energy < cost) return { ok: false, why: 'мало энергии (нужно ' + cost + ')' };
    st.energy -= cost;
    st.spent[id] = cur + 1;
    // мгновенные эффекты
    if (id === 'cosmic') {
      var p = P();
      if (p) { p.maxHp = 100 + maxHpBonus(); p.hp = Math.min(p.maxHp, p.hp + 15); }
      var st2 = ST();
      if (st2 && p) st2.hpShadow = p.hp;
    }
    toast('🍄 «' + nd.name + '» ур. ' + (cur + 1) + '! Дед стал могущественнее.', 'good');
    Voice.say('О! ' + nd.name + '. Чую силу!', 'spend' + (cur + 1), 30);
    updatePanel();
    if (WS.TreeScreen && WS.TreeScreen.refresh) WS.TreeScreen.refresh();
    return { ok: true };
  }

  /** Бот: разумно тратит энергию по приоритетам.
   *  Порядок продуман под ХП-часы: сперва «Грибная Сила» (регенерация
   *  0.04 ХП/мин за уровень уже на 1-м уровне перекрывает суточный
   *  сток ~1.7 ХП — часы останавливаются), затем «Крепкий Организм»
   *  (−расход), потом скорость/урон/энергия, и лишь в конце luxury. */
  function treeAutoSpend() {
    var st = ST();
    if (!st) return;
    var order = ['shroom', 'organs', 'speed', 'quick', 'plunger', 'vision',
                 'cosmic', 'trophy', 'patience', 'cat', 'luck'];
    for (var i = 0; i < order.length; i++) {
      var nd = nodeDef(order[i]);
      if (!nd) continue;
      var cur = lv(order[i]);
      if (cur >= nd.max) continue;
      var cost = nd.cost[cur];
      if (st.energy >= cost + 2) { spend(order[i]); return; }
    }
  }

  // ====================================================================
  //  ПАНЕЛЬ HUD (энергия, день, кнопки)
  // ====================================================================

  var panel = null;
  var panelEls = {};

  function buildPanel() {
    if (panel) return;
    panel = document.createElement('div');
    panel.id = 'ws-crazy';
    panel.className = 'hidden';
    panel.innerHTML =
      '<div class="cz-row cz-energy" title="Грибная энергия: капает за изгнания, обыски и дни. Тратится на Древо Мудрости (T).">' +
      '  <span class="cz-ico">🍄</span><span class="cz-val" id="cz-energy">0</span>' +
      '</div>' +
      '<div class="cz-row cz-day" title="Сколько дней деду осталось жить, если не победить">' +
      '  <span class="cz-ico">⏳</span><span class="cz-val" id="cz-day">—</span>' +
      '</div>' +
      '<div class="cz-row cz-hp" title="ХП-часы: тают каждый день. Косяк деда восстанавливает полностью.">' +
      '  <span class="cz-ico">🫀</span><span class="cz-val" id="cz-hp">—</span>' +
      '</div>' +
      '<button class="cz-btn" id="cz-tree" title="Древо Мудрости (T)">🌳 Древо</button>' +
      '<button class="cz-btn cz-voice" id="cz-voice" title="Озвучка деда вкл/выкл">🔊</button>';
    (document.body || document.documentElement).appendChild(panel);
    panelEls.energy = panel.querySelector('#cz-energy');
    panelEls.day = panel.querySelector('#cz-day');
    panelEls.hp = panel.querySelector('#cz-hp');
    panelEls.tree = panel.querySelector('#cz-tree');
    panelEls.voice = panel.querySelector('#cz-voice');
    panelEls.tree.addEventListener('click', function () {
      if (WS.TreeScreen) WS.TreeScreen.toggle();
    });
    panelEls.voice.addEventListener('click', function () {
      var on = Voice.toggle();
      panelEls.voice.textContent = on ? '🔊' : '🔇';
      toast(on ? 'Дед снова бормочет вслух.' : 'Дед замолчал (озвучка выкл).', 'info');
    });
  }

  var panelUpdT = 0;
  function updatePanelLite() {
    panelUpdT -= 1 / 60;
    if (panelUpdT <= 0) { panelUpdT = 0.5; updatePanel(); }
  }

  /** HUD в дедовском режиме: голод/жажда/тепло заморожены — прячем,
   *  остаётся ХП-часы (главный ресурс деда). */
  var hudModeDone = false;
  function applyHudMode() {
    var on = !!(WS.G && WS.G.crazy && WS.G.running);
    if (!on && hudModeDone) return;        // в меню не крутим зря
    if (on) hudModeDone = true;
    document.body.classList.toggle('crazy-on', on);
    try {
      var hide = ['hunger', 'thirst', 'fatigue', 'sanity', 'wet', 'frost'];
      for (var i = 0; i < hide.length; i++) {
        var f = document.querySelector('.hud-bar-fill.' + hide[i]);
        if (f) {
          var row = f.closest ? f.closest('.hud-stat') : null;
          if (row) row.style.display = on ? 'none' : '';
        }
      }
      var climate = document.querySelector('.hud-stat-climate');
      if (climate) climate.style.display = on ? 'none' : '';
      var hpF = document.querySelector('.hud-bar-fill.hp');
      if (hpF) {
        var hpRow = hpF.closest ? hpF.closest('.hud-stat') : null;
        if (hpRow) hpRow.title = on
          ? 'ХП деда: тают каждый день. Лечат только грибы и косяк.'
          : 'Здоровье';
      }
    } catch (e) { /* пусто */ }
  }

  function updatePanel() {
    applyHudMode();
    if (!panel) return;
    var g = WS.G;
    if (!g || !g.running) { panel.classList.add('hidden'); return; }
    panel.classList.remove('hidden');
    var st = ST();
    var p = g.player;
    if (!st || !p) return;
    if (panelEls.energy) panelEls.energy.textContent = Math.floor(st.energy);
    var day = WS.Time ? WS.Time.day() : 1;
    var left = Math.max(0, 60 - day + 1);
    if (panelEls.day) panelEls.day.textContent = 'Д' + day + '/60 (ост. ' + left + ')';
    if (panelEls.hp) {
      var hp = Math.max(0, Math.round(p.hp));
      var max = p.maxHp || 100;
      panelEls.hp.textContent = hp + '/' + max;
      panelEls.hp.className = 'cz-val' + (hp < 30 ? ' cz-bad' : (hp < 60 ? ' cz-warn' : ''));
    }
    if (panelEls.voice) panelEls.voice.textContent = st.voiceOn ? '🔊' : '🔇';
  }

  // ====================================================================
  //  КОСЯК ДЕДА И ХИЛКИ
  // ====================================================================

  function wrapUseMed() {
    var orig = WS.Health.useMed;
    WS.Health.useMed = function (id, opts) {
      var st = ST();
      var p = P();
      if (!st || !p) return orig.call(WS.Health, id, opts);
      if (id === 'joint_ded') {
        if (invCount('joint_ded') < 1) { toast('Косяка нет. Дед расстроен.', 'warn'); return false; }
        takeItem('joint_ded', 1);
        p.hp = p.maxHp || 100;
        st.hpShadow = p.hp;
        st.saidLow = false;
        st.highT = 45;                    // 45 секунд радуги
        confetti(p.x, p.y, 16);
        try {
          if (WS.Fx && WS.Fx.text) WS.Fx.text('ВОТ ЭТО ДУРЬ!', p.x, p.y - 1.3, { col: '#9f7bff', size: 17, life: 1.8 });
        } catch (e) { /* пусто */ }
        toast('🌻 Косяк деда: ХП полностью восстановлены! Реальность поехала.', 'good');
        Voice.say('Вот это дурь! Полный порядок.', 'joint', 30);
        updatePanel();
        return true;
      }
      if (id === 'mushroom_fun' || id === 'tincture_fly' || id === 'candy_ded') {
        var def = CRAZY_ITEMS[id];
        var heal = Math.round((def ? def.heal : 15) * healMul());
        if (invCount(id) < 1) return false;
        takeItem(id, 1);
        p.hp = Math.min(p.maxHp || 100, p.hp + heal);
        st.hpShadow = p.hp;
        if (id === 'mushroom_fun') st.highT = Math.max(st.highT, 18);
        try {
          if (WS.Fx && WS.Fx.text) WS.Fx.text('+' + heal + ' ХП', p.x, p.y - 1.1, { col: '#7bffb0', size: 14 });
        } catch (e) { /* пусто */ }
        toast('💊 ' + (def ? def.ru : 'Хилка') + ': +' + heal + ' ХП.', 'good');
        updatePanel();
        return true;
      }
      return orig.call(WS.Health, id, opts);
    };
  }

  function invCount(id) {
    try {
      if (WS.Inv && WS.Inv.count) return WS.Inv.count(id);
    } catch (e) { /* пусто */ }
    var p = P();
    if (!p || !p.inv) return 0;
    var n = 0;
    for (var i = 0; i < p.inv.length; i++) {
      if (p.inv[i] && p.inv[i].id === id) n += p.inv[i].count || 1;
    }
    return n;
  }

  function takeItem(id, n) {
    try {
      if (WS.Inv && WS.Inv.take) return WS.Inv.take(id, n) > 0;
    } catch (e) { /* пусто */ }
    var p = P();
    if (!p || !p.inv) return false;
    var left = n;
    for (var i = p.inv.length - 1; i >= 0 && left > 0; i--) {
      if (p.inv[i] && p.inv[i].id === id) {
        var take = Math.min(left, p.inv[i].count || 1);
        p.inv[i].count -= take;
        left -= take;
        if (p.inv[i].count <= 0) p.inv.splice(i, 1);
      }
    }
    return left === 0;
  }

  // ====================================================================
  //  ОБЁРТКИ ЛУТА И УРОНА
  // ====================================================================

  function wrapLoot() {
    // труп → подарок
    var origCorpse = WS.Loot.makeCorpse;
    WS.Loot.makeCorpse = function (x, y, kind) {
      var o = origCorpse.call(WS.Loot, x, y, kind);
      if (o) {
        o.sprName = 'crazy_gift';
        o.name = 'Подарок (был ' + (KIND_NAME[kind] || 'мираж') + ')';
        if (o.inv && o.inv.length) o.inv = o.inv.slice(0, 4);   // поменьше барахла
      }
      onBanish(x, y, kind, o);
      return o;
    };
    // обыск → +энергия
    var origSearch = WS.Loot.search;
    WS.Loot.search = function (o) {
      if (o && o.container && !o._crazyE) {
        o._crazyE = 1;
        gainEnergy(SEARCH_ENERGY, 'quiet');
      }
      return origSearch.call(WS.Loot, o);
    };
    // подарки с бонусами — до открытия контейнера
    var origOpen = WS.Ui.openContainer;
    if (origOpen) {
      WS.Ui.openContainer = function (o) {
        if (o && o._crazyExtra && o._crazyExtra.length && !o._crazyGiven) {
          o._crazyGiven = 1;
          o.inv = (o.inv || []).concat(o._crazyExtra);
          o._crazyExtra = [];
          toast('🎁 Изгнанник оставил подарок!', 'good');
        }
        return origOpen.call(WS.Ui, o);
      };
    }
  }

  function wrapDamage() {
    // урон деда по мультяшкам × Вантуз-Мастер
    var A = WS.AI;
    if (A && typeof A.damageEnt === 'function') {
      var orig = A.damageEnt;
      A.damageEnt = function (e, dmg, by, opts) {
        var p = P();
        var isPlayer = by && (by.id === 'player' || by.kind === 'player');
        if (isPlayer && p && dmg > 0 && e !== p) {
          dmg *= dmgMul();
        }
        return orig.call(A, e, dmg, by, opts);
      };
    }
    if (WS.Combat && typeof WS.Combat.damageEnt === 'function' && WS.Combat.damageEnt !== A.damageEnt) {
      var origC = WS.Combat.damageEnt;
      WS.Combat.damageEnt = function (e, dmg, by, opts) {
        var isPlayer = by && (by.id === 'player' || by.kind === 'player');
        if (isPlayer && dmg > 0) dmg *= dmgMul();
        return origC.call(WS.Combat, e, dmg, by, opts);
      };
    }
  }

  // ====================================================================
  //  РЕГИСТРАЦИЯ ПРЕДМЕТОВ И ИМЁН
  // ====================================================================

  function declareItems() {
    WS.Data = WS.Data || {};
    WS.Data.items = WS.Data.items || {};
    for (var id in CRAZY_ITEMS) {
      if (!CRAZY_ITEMS.hasOwnProperty(id)) continue;
      if (!WS.Data.items[id]) {
        var d = CRAZY_ITEMS[id];
        WS.Data.items[id] = {
          id: id, cat: d.cat, w: d.w, stack: d.stack,
          dmg: d.dmg, range: d.range, atkSpd: d.atkSpd, knock: d.knock, crit: d.crit,
          heal: d.heal, tags: d.tags || [], slots: d.slots || null
        };
      }
    }
    // русские имена в словарь (пока i18n не загрузил свои — пишем напрямую)
    WS.Data.locales = WS.Data.locales || {};
    var ru = WS.Data.locales.ru;
    if (ru) {
      for (var id2 in CRAZY_ITEMS) {
        if (CRAZY_ITEMS.hasOwnProperty(id2)) {
          ru['item.' + id2 + '.name'] = CRAZY_ITEMS[id2].ru;
          ru['item.' + id2 + '.desc'] = CRAZY_ITEMS[id2].rud;
        }
      }
    }
    // английские имена: у большинства они в en.js/swarm2.js, тут — только
    // новые предметы (раньше stardust болтался без EN — тест-сьют S2/S4)
    var CRAZY_ITEMS_EN = {
      stardust: ['Stardust', 'Sprinkles from banished cartoons. A handful of it into the Magical Fire — and the flying saucer hears the old man.'],
      palm_ded: ['Ded’s Palm', 'The old man’s main caliber: always with him, never lost, never rusts. Banishes cartoons all the way.']
    };
    var en = WS.Data.locales.en;
    if (en) {
      for (var id3 in CRAZY_ITEMS_EN) {
        if (CRAZY_ITEMS_EN.hasOwnProperty(id3)) {
          en['item.' + id3 + '.name'] = CRAZY_ITEMS_EN[id3][0];
          en['item.' + id3 + '.desc'] = CRAZY_ITEMS_EN[id3][1];
        }
      }
    }
  }

  // ====================================================================
  //  СОБЫТИЯ ПАРТИИ
  // ====================================================================

  function onGameStart() {
    var g = WS.G;
    if (!g) return;
    g.crazy = newState();
    var st = ST();
    var p = g.player;
    if (p) {
      p.maxHp = 100;
      p.hp = 100;
      p.needs.hunger = 100; p.needs.thirst = 100; p.needs.fatigue = 100;
    }
    st.hpShadow = 100;
    // ЛОДОШКА В РУКИ: дед изгоняет мультяшек лодошкой — без неё кулаки
    // дают 3 урона и дед неделю махает на волка (рой это поймал: 7 дней,
    // 0 изгнаний). Лодошка — стартовое оружие дед-режима, как в концепции.
    try {
      var palmIx = -1;
      var pInv0 = P();
      if (pInv0 && pInv0.inv) {
        for (var pi = 0; pi < pInv0.inv.length; pi++) {
          if (pInv0.inv[pi] && pInv0.inv[pi].id === 'palm_ded') { palmIx = pi; break; }
        }
      }
      if (palmIx < 0 && WS.Inv && WS.Inv.give) WS.Inv.give('palm_ded', 1);
      if (WS.Action && WS.Action.equipBest) WS.Action.equipBest();
      else if (pInv0 && pInv0.equip && palmIx >= 0) pInv0.equip.hand1 = { id: 'palm_ded', cond: 1 };
    } catch (eP) { /* без лодошки дед всё равно дед */ }
    // синхронизируем общий голос деда с сохранённым состоянием
    try {
      if (WS.Thoughts && st.voiceOn === false) WS.Thoughts.setVoiceOn(false);
    } catch (e) { /* пусто */ }
    buildPanel();
    updatePanel();
    // РАССКАЗЧИК открывает зиму (студийный голос narrator), затем дед
    var narrOk = false;
    try {
      narrOk = !!(WS.VoiceBox && WS.VoiceBox.playKey && WS.VoiceBox.playKey('narrator_intro'));
    } catch (eN) { /* без рассказчика — сразу дед */ }
    if (narrOk) {
      setTimeout(function () {
        try { Voice.say('Так. Где мой вантуз? Пошли спасать мир.', 'start', 5); } catch (eV) { /* пусто */ }
      }, 5200);
    } else {
      Voice.say('Так. Где мой вантуз? Пошли спасать мир.', 'start', 5);
    }
    toast('🍄 Дед вышел на прогулку. 60 дней до тарелки. Не проспи!', 'good');
  }

  function onGameLoad() {
    var g = WS.G;
    if (!g) return;
    var st = ST();
    st.lastTm = -1;
    var p = g.player;
    if (p) {
      p.maxHp = 100 + maxHpBonus();
      st.hpShadow = Math.max(1, Math.min(p.hp, p.maxHp));
      p.hp = st.hpShadow;
    }
    buildPanel();
    updatePanel();
  }

  function onVictory() {
    var st = ST();
    if (st) st.autoSpend = false;
    Voice.say('Летающая тарелка! Я знал! Дед, ты красавчик!', 'victory', 1);
    document.body.classList.remove('crazy-high');
  }

  // ====================================================================
  //  BOOT
  // ====================================================================

  WS.boot(function initCrazy() {
    defSprites();
    declareItems();
    wrapFx();
    wrapLoot();
    wrapDamage();
    wrapUseMed();
    wrapDeath();

    WS.Ev.on('game:start', onGameStart);
    WS.Ev.on('game:load', onGameLoad);
    WS.Ev.on('game:victory', onVictory);

    // клавиша T — Древо Мудрости
    window.addEventListener('keydown', function (ev) {
      if (ev.code !== 'KeyT') return;
      var g = WS.G;
      if (!g || !g.running) return;
      if (WS.Ui && WS.Ui.modal && WS.Ui.modal() &&
          !(WS.TreeScreen && WS.TreeScreen.isOpen && WS.TreeScreen.isOpen())) return;
      if (WS.TreeScreen) WS.TreeScreen.toggle();
    });

    WS.tick(39, preTick, 'crazy:pre');
    WS.tick(45, postTick, 'crazy:post');

    WS.log('[Crazy] Режим «Безумный Дед» активен. Автор: DirtyG.');
  }, 'crazy:init');

  // ====================================================================
  //  ПУБЛИЧНОЕ API
  // ====================================================================

  WS.def('Crazy', {
    active: function () { return !!(WS.G && WS.G.crazy); },
    state: ST,
    tree: function () { return TREE; },
    lv: lv,
    spend: spend,
    treeAutoSpend: treeAutoSpend,
    setAutoSpend: function (v) { var st = ST(); if (st) st.autoSpend = !!v; },
    energy: function () { var st = ST(); return st ? st.energy : 0; },
    finalMin: FINAL_MIN,
    drainMul: drainMul,
    voice: Voice,
    /** Прямой тумблер озвучки (из API-шпаргалки): синхронно ставит
     *  WS.Thoughts.setVoiceOn и state().voiceOn, возвращает новое состояние. */
    setVoiceOn: function (on) {
      var v = !!on;
      try {
        if (WS.Thoughts && WS.Thoughts.setVoiceOn) WS.Thoughts.setVoiceOn(v);
      } catch (e) { /* безголосый дед — тоже дед */ }
      var stV = ST();
      if (stV) stV.voiceOn = v;
      return v;
    },
    healMul: healMul,
    dropChance: dropChance,
    respawnFrac: respawnFrac,
    say: function (t, k, g) { Voice.say(t, k, g); },
    // для бота и тестов
    _invCount: invCount,
    _useMed: function (id) { return WS.Health.useMed(id); },
    _kindEnergy: KIND_ENERGY
  });
})();
