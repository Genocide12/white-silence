/**
 * skills.js — НАВЫКИ И ОПЫТ «Белого Безмолвия»: XP-кривая lv*100
 * (максимум 10), начисление опыта за убийства/крафт/обыск/выживание,
 * эффекты уровней для других систем (WS.Skills.bonus / bonusFor),
 * чтение книг (мгновенно +50 XP, повторно не читается), фоновая
 * прокачка бега и скрытности. Связи: combat.js ('combat:kill' с оружием),
 * craft-агент ('item:crafted'), looting.js ('loot:searched'),
 * fire.js ('fire:cooked' — свой cook-XP остаётся у него), time.js
 * ('time:day'/'time:hour'), player.js (sprinting/sneaking/breath).
 */
(function () {
  'use strict';

  // ====================================================================
  //  КОНСТАНТЫ
  // ====================================================================

  var TICK_PRI = 42;               // приоритет тика (системы; сразу за combat:41)
  var MAX_LV = 10;                 // потолок любого навыка (по ТЗ)

  // ---- XP-кривая: lv N требует N*100 XP (0→1: 100, 1→2: 200 ...) ----
  function xpNeed(lv) { return (lv + 1) * 100; }

  // ---- опыт за убийства (по kind цели) -----------------------------------
  var KILL_XP = {
    wolf: 25, bear: 60, bandit: 35, hermit: 20,
    deer: 15, hare: 8, crow: 5, fish: 2
  };
  var KILL_XP_DEFAULT = 10;
  var ANIMAL_KINDS = { deer: 1, hare: 1, crow: 1, fish: 1 };

  // ---- опыт за крафт (по cat рецепта) -------------------------------------
  var CRAFT_XP = {
    carpentry: 10, cook: 8, tailor: 8,
    survival: 6, ammo: 5, misc: 3
  };
  var CRAFT_XP_DEFAULT = 3;
  var CRAFT_SKILL_BONUS = 2;        // доп. XP, если рецепт качает наш навык

  // ---- прочие события -------------------------------------------------------
  var XP_LOOT_BASE = 2;             // 'loot:searched' → forage +2 (по ТЗ)
  var XP_LOOT_PER_ITEM = 1;         // +1 за каждую найденную вещь
  var XP_LOOT_ITEM_CAP = 3;         // потолок бонуса за раз
  var XP_DAY_SURVIVED = 15;         // 'time:day' → survive +15 (по ТЗ)
  var XP_COOKED = 8;                // 'fire:cooked' → cook +8 (по ТЗ)
  var XP_TRAP_CATCH = 4;            // добыча в силок → forage +4
  var XP_FISH_CATCH = 5;            // улов из проруби → forage +5
  var BOOK_XP = 50;                 // прочтение книги: 25 базовых ×2 (двойной XP по ТЗ)
  var XP_REPAIR = 4;                // починка вещей → tailor (или carpentry)
  var XP_BUILD = 10;                // постройка → carpentry (выдаёт build.js)

  // ---- фоновая прокачка -----------------------------------------------------
  var RUN_XP_PER_MIN = 1;           // минута бега → run +1 (по ТЗ)
  var SNEAK_XP_PER_MIN = 2;         // минута кражисьи при волках → sneak +2 (по ТЗ)
  var SNEAK_WOLF_R = 8;             // «рядом» = волк в 8 тайлах
  var RUN_MIN_SEC = 60;             // минута — 60 секунд реального времени

  // ---- чутьё следопыта (track >= 4): метки на сущностях --------------------
  var TRACK_MARK_MIN_LV = 4;
  var TRACK_MARK_EVERY = 3;         // раз в 3 секунды
  var TRACK_RANGE_BASE = 6;         // базовый радиус чутья, тайлов
  var TRACK_RANGE_LV = 1.5;         // +1.5 тайла за уровень

  // ---- журнал опыта (для экрана навыков/отладки) ---------------------------
  var XP_HISTORY_MAX = 24;          // храним последние 24 начисления
  var xpHistory = [];               // {skill, n, reason, t, day}

  // ---- вехи уровней: подсказки игрока о новых возможностях ------------------
  var MILESTONES = {
    2: 'Рука набита: дело пошло быстрее',
    4: 'Заметный прогресс в ремесле',
    7: 'Мастерство видно со стороны',
    10: 'Вершина мастерства — выше некуда'
  };

  // ====================================================================
  //  РЕЕСТР НАВЫКОВ
  //  id — ключи core/state.js (skills.{...}); имя и описание — для UI/тостов.
  //  «Плотницкое дело» хранится в поле carpentry (договор state.js),
  //  хотя в ТЗ фигурирует «carpenter» — это одна и та же ветка.
  // ====================================================================

  var SKILL_DEFS = {
    axe: {
      name: 'Топор', cat: 'боевые',
      desc: 'Урон и скорость рубки деревьев',
      fx: '+6% урона топором и +8% скорости рубки за уровень'
    },
    melee: {
      name: 'Рукопашный бой', cat: 'боевые',
      desc: 'Урон и точность без оружия',
      fx: '+5% урона, -2% промаха за уровень'
    },
    firearm: {
      name: 'Огнестрел', cat: 'боевые',
      desc: 'Разброс и скорость перезарядки',
      fx: '-5% разброса, -4% времени перезарядки за уровень'
    },
    sneak: {
      name: 'Красться', cat: 'скрытные',
      desc: 'Радиус обнаружения зверями',
      fx: '-5% радиуса обнаружения за уровень'
    },
    run: {
      name: 'Бег', cat: 'скрытные',
      desc: 'Выносливость на длинной дистанции',
      fx: '-5% расхода дыхания, +1% скорости бега за уровень'
    },
    cook: {
      name: 'Готовка', cat: 'бытовые',
      desc: 'Качество еды',
      fx: '+5% калорийности готовых блюд за уровень'
    },
    carpentry: {
      name: 'Плотницкое дело', cat: 'бытовые',
      desc: 'Прочность и скорость построек',
      fx: '+6% прочности, +7% скорости строительства за уровень'
    },
    tailor: {
      name: 'Шитьё', cat: 'бытовые',
      desc: 'Качество шитья и починки',
      fx: '+6% качества шитья за уровень'
    },
    medic: {
      name: 'Медицина', cat: 'бытовые',
      desc: 'Эффективность лечения',
      fx: '+7% эффективности медикаментов за уровень'
    },
    forage: {
      name: 'Поиск пищи', cat: 'скрытные',
      desc: 'Находки при обыске',
      fx: '+5% к шансу находок за уровень'
    },
    track: {
      name: 'Следопыт', cat: 'скрытные',
      desc: 'Видимость следов и сущностей',
      fx: '+1.5 тайла чутья (метки на зверях) за уровень'
    },
    survive: {
      name: 'Выживание', cat: 'бытовые',
      desc: 'Регенерация и расход еды',
      fx: '+8% регенерации, -4% голода за уровень'
    }
  };

  /** Список всех id (порядок state.js). */
  var SKILL_IDS = [
    'axe', 'melee', 'firearm', 'sneak', 'run', 'cook', 'carpentry',
    'tailor', 'medic', 'forage', 'track', 'survive'
  ];

  // ====================================================================
  //  МАЛЫЕ УТИЛИТЫ
  // ====================================================================

  function G() { return WS.G || null; }
  function P() { var g = WS.G; return (g && g.player) || null; }

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  function itemsTable() { return (WS.Data && WS.Data.items) || {}; }
  function itemDef(id) { return id ? (itemsTable()[id] || null) : null; }

  function snd(name, x, y, vol) {
    if (!WS.Snd || !WS.Snd.play) return;
    try { WS.Snd.play(name, { x: x, y: y, vol: vol }); } catch (e) { /* тишина */ }
  }

  function fxText(str, x, y, o) {
    if (!WS.Fx || !WS.Fx.text) return;
    try { WS.Fx.text(str, x, y, o); } catch (e) { /* пусто */ }
  }

  function fxSpawn(type, x, y, o) {
    if (!WS.Fx || !WS.Fx.spawn) return;
    try { WS.Fx.spawn(type, x, y, o); } catch (e) { /* пусто */ }
  }

  /** Тост UI (если есть) или плавающий текст. */
  function toast(msg, kind) {
    if (WS.Ui && WS.Ui.toast) {
      try { WS.Ui.toast(msg, kind || 'info'); return; } catch (e) { /* текстом ниже */ }
    }
    var p = P();
    if (p) fxText(msg, p.x, p.y - 0.8, { col: '#cfd6df', life: 2.2 });
  }

  // ====================================================================
  //  ЯДРО: УРОВЕНЬ, ОПЫТ, УРОВЕНЬ-АП
  // ====================================================================

  /** Нормализовать структуру навыков (старые сейвы/битые данные). */
  function normalize() {
    var p = P();
    if (!p) return;
    if (!p.skills || typeof p.skills !== 'object') p.skills = {};
    for (var i = 0; i < SKILL_IDS.length; i++) {
      var id = SKILL_IDS[i];
      var s = p.skills[id];
      if (!s || typeof s !== 'object') s = p.skills[id] = { lv: 0, xp: 0 };
      s.lv = clamp(Math.floor(Number(s.lv) || 0), 0, MAX_LV);
      s.xp = Math.max(0, Number(s.xp) || 0);
    }
    if (!p.readBooks || typeof p.readBooks !== 'object') p.readBooks = {};
  }

  /** Текущий уровень навыка (0 без партии). */
  function lvid(id) {
    var p = P();
    if (!p || !p.skills || !p.skills[id]) return 0;
    return clamp(p.skills[id].lv || 0, 0, MAX_LV);
  }

  /**
   * Добавить XP в навык. Целое положительное; дробное округляется.
   *   addXp(id, n, reason?) — reason попадает в журнал опыта.
   * При накоплении нужного порога — уровень-ап (может быть несколько за раз):
   *   WS.Snd.play('levelup'), Fx.text('Навык вырос: Топор 3'),
   *   WS.G.stats.skillsRaised++, emit 'player:levelup' {skill, level}.
   * Возвращает новый уровень (или -1, если навык неизвестен).
   */
  function addXp(id, n, reason) {
    var p = P();
    if (!p || !p.skills || !p.skills[id]) return -1;
    n = Math.floor(Number(n) || 0);
    if (n <= 0) return p.skills[id].lv;

    var s = p.skills[id];
    if (s.lv >= MAX_LV) return MAX_LV;             // потолок (по ТЗ)
    s.xp += n;

    // журнал (для UI: «откуда растут навыки»)
    xpHistory.push({
      skill: id, n: n, reason: reason || '',
      t: (WS.Time && WS.Time.fmt) ? WS.Time.fmt() : '',
      day: (WS.Time && WS.Time.day) ? WS.Time.day() : 0
    });
    if (xpHistory.length > XP_HISTORY_MAX) xpHistory.shift();

    // цикл уровня-апа: несколько уровней за один мульти-бонус
    while (s.lv < MAX_LV && s.xp >= xpNeed(s.lv)) {
      s.xp -= xpNeed(s.lv);
      s.lv++;
      onLevelUp(id, s.lv);
      if (s.lv >= MAX_LV) s.xp = 0;                 // потолок сжигает излишки
    }
    return s.lv;
  }

  /** Празднование уровня: звук, текст, статистика, событие. */
  function onLevelUp(id, lv) {
    var def = SKILL_DEFS[id] || { name: id };
    var p = P();
    var x = p ? p.x : 0, y = p ? p.y : 0;

    snd('levelup', x, y, 0.8);                      // по ТЗ
    fxText('Навык вырос: ' + def.name + ' ' + lv, x, y - 1.0, {
      col: '#f4d9a0', life: 2.2, size: 14
    });
    toast('Навык вырос: ' + def.name + ' ' + lv, 'good');

    // вехи: короткая подсказка, что навык реально изменил игру
    if (MILESTONES[lv]) {
      fxText(MILESTONES[lv], x, y - 1.5, { col: '#9db0c8', life: 2.6 });
    }

    // статистика партии (WS.G.stats — по ТЗ)
    var g = G();
    if (g && g.stats) {
      g.stats.skillsRaised = (g.stats.skillsRaised || 0) + 1;
    }

    try { WS.Ev.emit('player:levelup', { skill: id, level: lv }); }
    catch (e) { WS.err('skills levelup emit', e && e.message); }
  }

  /** Сколько XP нужно до следующего уровня (0 — максимум). */
  function xpToNext(id) {
    var p = P();
    if (!p || !p.skills || !p.skills[id]) return 0;
    var s = p.skills[id];
    if (s.lv >= MAX_LV) return 0;
    return xpNeed(s.lv) - s.xp;
  }

  /** Прогресс до следующего уровня 0..1 (1 — максимум). */
  function progress(id) {
    var p = P();
    if (!p || !p.skills || !p.skills[id]) return 0;
    var s = p.skills[id];
    if (s.lv >= MAX_LV) return 1;
    return clamp(s.xp / xpNeed(s.lv), 0, 1);
  }

  // ====================================================================
  //  ЭФФЕКТЫ УРОВНЕЙ
  //  bonus(id) — главный множитель навыка (как в ТЗ);
  //  bonusFor(id, aspect) — конкретный аспект ('spread', 'reload', ...).
  //  Все системы читают навыки ТОЛЬКО через эти функции.
  // ====================================================================

  /**
   * Таблица эффектов: aspect -> функция(lv) -> множитель/значение.
   * Первая функция массива — «главный» эффект (его возвращает bonus).
   */
  var EFFECTS = {
    axe: [
      ['dmg', function (lv) { return 1 + lv * 0.06; }],      // урон топором
      ['chop', function (lv) { return 1 + lv * 0.08; }]     // скорость рубки
    ],
    melee: [
      ['dmg', function (lv) { return 1 + lv * 0.05; }],      // урон
      ['acc', function (lv) { return 1 + lv * 0.02; }]       // точность (промах -2%/ур)
    ],
    firearm: [
      ['spread', function (lv) { return Math.max(0.5, 1 - lv * 0.05); }],  // разброс
      ['reload', function (lv) { return Math.max(0.6, 1 - lv * 0.04); }],  // перезарядка
      ['dmg', function (lv) { return 1 + lv * 0.03; }]       // небольшой бонус урона
    ],
    sneak: [
      ['detect', function (lv) { return Math.max(0.5, 1 - lv * 0.05); }],  // радиус обнаружения
      ['move', function (lv) { return 1 + lv * 0.02; }]      // скорость кражисьи
    ],
    run: [
      ['drain', function (lv) { return Math.max(0.5, 1 - lv * 0.05); }],   // расход дыхания
      ['sprint', function (lv) { return 1 + lv * 0.01; }]    // скорость бега
    ],
    cook: [
      ['cal', function (lv) { return 1 + lv * 0.05; }]       // калорийность (по ТЗ)
    ],
    carpentry: [
      ['hp', function (lv) { return 1 + lv * 0.06; }],        // прочность построек
      ['speed', function (lv) { return 1 + lv * 0.07; }]      // скорость стройки
    ],
    tailor: [
      ['quality', function (lv) { return 1 + lv * 0.06; }]    // качество шитья
    ],
    medic: [
      ['eff', function (lv) { return 1 + lv * 0.07; }]        // эффективность лечения
    ],
    forage: [
      ['loot', function (lv) { return 1 + lv * 0.05; }]       // находки +5%/ур (по ТЗ)
    ],
    track: [
      ['range', function (lv) { return lv * TRACK_RANGE_LV; }], // радиус чутья, тайлов
      ['marks', function (lv) { return lv >= TRACK_MARK_MIN_LV ? 1 : 0; }]
    ],
    survive: [
      ['regen', function (lv) { return 1 + lv * 0.08; }],     // регенерация
      ['hunger', function (lv) { return Math.max(0.6, 1 - lv * 0.04); }] // расход голода
    ]
  };

  /** Главный эффект навыка — множитель (или значение track-радиуса). */
  function bonus(id) {
    var eff = EFFECTS[id];
    if (!eff || !eff.length) return 1;
    return eff[0][1](lvid(id));
  }

  /** Конкретный аспект эффекта; при отсутствии — главный. */
  function bonusFor(id, aspect) {
    var eff = EFFECTS[id];
    if (!eff || !eff.length) return 1;
    var lv = lvid(id);
    if (!aspect) return eff[0][1](lv);
    for (var i = 0; i < eff.length; i++) {
      if (eff[i][0] === aspect) return eff[i][1](lv);
    }
    return eff[0][1](lv);
  }

  // ---------------------------------------------------------------- фрэндли-имена
  //  Удобные обёртки для других модулей (документированный контракт):
  //  needs.js может умножать расход голода на hungerMul(), health.js —
  //  скорость регенерации на regenMul(), temperature.js — учитывать
  //  calMul() при подсчёте калорий съеденного, ai.js — detectMul().

  function calMul() { return bonusFor('cook', 'cal'); }
  function hungerMul() { return bonusFor('survive', 'hunger'); }
  function regenMul() { return bonusFor('survive', 'regen'); }
  function detectMul() { return bonusFor('sneak', 'detect'); }
  function healMul() { return bonusFor('medic', 'eff'); }
  function lootMul() { return bonusFor('forage', 'loot'); }
  function trackRange() { return TRACK_RANGE_BASE + bonusFor('track', 'range'); }
  function chopMul() { return bonusFor('axe', 'chop'); }

  // ====================================================================
  //  КНИГИ
  //  УПРОЩЕНИЕ по ТЗ: WS.Skills.readBook(itemId) — мгновенно +50 XP
  //  (двойной от базовых 25), перечитывание не даёт ничего (p.readBooks).
  //  player.reading {itemId, progress} остаётся для чужих модулей —
  //  мы его не трогаем, но при завершении чистим.
  // ====================================================================

  /**
   * Прочитать книгу. Возвращает true, если опыт начислен.
   * false — не книга / уже читана / нет навыка у книги.
   */
  function readBook(itemId) {
    var p = P();
    if (!p) return false;
    var def = itemDef(itemId);
    if (!def || def.cat !== 'book' || !def.skill) return false;
    if (!SKILL_DEFS[def.skill]) return false;

    p.readBooks = p.readBooks || {};
    if (p.readBooks[itemId]) {
      toast('Эта книга уже прочитана', 'info');
      return false;
    }

    p.readBooks[itemId] = true;
    var lv = addXp(def.skill, BOOK_XP);
    if (lv < 0) return false;

    var g = G();
    if (g && g.stats) g.stats.notesRead = g.stats.notesRead;  // заметки — не книги

    // визуальное «перелистывание»: пара строк текста над игроком
    var name = (WS.I18N && WS.I18N.t) ? WS.I18N.t('item.' + itemId + '.name') : itemId;
    if (!name || name === ('item.' + itemId + '.name')) name = def.skill;
    fxText('Прочитано: ' + name, p.x, p.y - 1.2, { col: '#c9c2b4', life: 2.4 });
    fxText('+' + BOOK_XP + ' опыта (' + SKILL_DEFS[def.skill].name + ')',
      p.x, p.y - 0.8, { col: '#9db0c8', life: 2.0 });
    snd('select', p.x, p.y, 0.6);

    // если кто-то вёл «долгое чтение» этой же книгой — завершаем
    if (p.reading && p.reading.itemId === itemId) p.reading = null;

    try { WS.Ev.emit('book:read', { itemId: itemId, skill: def.skill, xp: BOOK_XP }); }
    catch (e) { WS.err('book:read emit', e && e.message); }
    return true;
  }

  /** Читал ли игрок эту книгу (для UI — серые корешки). */
  function isBookRead(itemId) {
    var p = P();
    return !!(p && p.readBooks && p.readBooks[itemId]);
  }

  // ====================================================================
  //  XP: СОБЫТИЯ
  // ====================================================================

  /**
   * Убийство. combat.js эмитит 'combat:kill' {ent, by, weapon, mode}
   * НЕПОСРЕДСТВЕННО перед 'ent:kill' — кэшируем и восстанавливаем
   * оружие в onEntKill. Убийства мимо Combat (свои трупы ИИ) дают
   * навык по предмету в правой руке игрока.
   */
  var pendingKill = null;

  function isPlayer(x) { return !!(x && (x.kind === 'player' || x.id === 'player')); }

  function onCombatKill(d) {
    if (!d || !isPlayer(d.by)) return;
    pendingKill = d;                 // подберёт onEntKill (или сгниёт к концу кадра)
  }

  /** Навык по оружию убийства: chopping→axe, ranged→firearm, иначе melee. */
  function skillForWeapon(weaponId, mode) {
    var def = itemDef(weaponId);
    if (def && def.ranged) return 'firearm';
    if (mode === 'ranged') return 'firearm';
    if (def && def.tags && def.tags.indexOf('chopping') >= 0) return 'axe';
    if (mode === 'fists') return 'melee';
    if (def && def.dmg) return (def.tags && def.tags.indexOf('chopping') >= 0) ? 'axe' : 'melee';
    return 'melee';
  }

  function onEntKill(d) {
    var p = P();
    if (!p || !d || !d.ent || !isPlayer(d.by)) return;

    var kind = d.ent.kind || '';
    var xp = KILL_XP[kind];
    if (xp === undefined) xp = KILL_XP_DEFAULT;

    // прирост счётчика убийств игрока (p.kills — по ТЗ state.js)
    p.kills = p.kills || {};
    p.kills[kind || 'unknown'] = (p.kills[kind || 'unknown'] || 0) + 1;

    // оружие: из кэша combat:kill или по правой руке
    var weapon = null, mode = null;
    if (pendingKill && pendingKill.ent === d.ent) {
      weapon = pendingKill.weapon;
      mode = pendingKill.mode;
    } else if (p.equip && p.equip.hand1) {
      weapon = p.equip.hand1.id;
      mode = 'melee';
    }
    pendingKill = null;

    var skill = skillForWeapon(weapon, mode);
    addXp(skill, xp, 'убийство: ' + (kind || 'цель'));

    // следопыт: добыча зверя издалека — умение выследить (по ТЗ «track»)
    if (ANIMAL_KINDS[kind] && (skill === 'firearm' || mode === 'ranged')) {
      addXp('track', Math.max(2, Math.round(xp * 0.4)), 'добыча выслежена');
    }

    // выживание за опасную добычу (медведь/бандит) — небольшой бонус
    if (kind === 'bear' || kind === 'bandit') {
      addXp('survive', Math.round(xp * 0.25), 'опасная добыча');
    }
  }

  /** Крафт: 'item:crafted' {id, recipe?, cat} — XP по категории рецепта. */
  function onCrafted(d) {
    if (!d) return;
    var cat = d.cat || (d.recipe && d.recipe.cat) || null;
    var xp = CRAFT_XP[cat];
    if (xp === undefined) xp = CRAFT_XP_DEFAULT;

    // какой навык качает категория
    var map = {
      carpentry: 'carpentry', cook: 'cook', tailor: 'tailor',
      survival: 'survive', ammo: 'firearm', misc: 'survive'
    };
    var skill = map[cat] || 'survive';
    addXp(skill, xp, 'крафт' + (cat ? ': ' + cat : ''));

    // рецепт с полем skill {id, lv} — «профильный» крафт качает чуть больше
    if (d.recipe && d.recipe.skill && d.recipe.skill.id === skill) {
      addXp(skill, CRAFT_SKILL_BONUS);
    }
  }

  /** Обыск контейнера: 'loot:searched' {o, count} → forage +2 (+находки). */
  function onLooted(d) {
    if (!d) return;
    var n = XP_LOOT_BASE;
    var found = Number(d.count) || 0;
    if (found > 0) n += Math.min(XP_LOOT_ITEM_CAP, found * XP_LOOT_PER_ITEM);
    addXp('forage', n, 'обыск');
  }

  /** Новый день пережит: survive +15 (по ТЗ). */
  function onDay() {
    addXp('survive', XP_DAY_SURVIVED, 'день пережит');
  }

  /**
   * Блюдо приготовлено: 'fire:cooked' → cook +8 (по ТЗ).
   * ВАЖНО: fire.js сам добавляет cook +10 своим путём (addCookXp) —
   * оба начисления складываются в общий прогресс навыка; уровни
   * поднимаются корректно (одна и та же кривая lv*100).
   */
  function onCooked() {
    addXp('cook', XP_COOKED, 'блюдо');
  }

  /** Починка вещи (событие от инвентаря C1 / шитья): tailor. */
  function onRepaired(d) {
    if (!d) return;
    addXp('tailor', XP_REPAIR, 'починка');
  }

  /** Добыча в силок/улов (события от build.js). */
  function onTrapped() { addXp('forage', XP_TRAP_CATCH, 'силок'); }
  function onFished() { addXp('forage', XP_FISH_CATCH, 'улов'); }

  // ====================================================================
  //  ФОНОВАЯ ПРОКАЧКА (тик)
  //  1) бег: минута спринта → run +1 (по ТЗ);
  //  2) кражисья при волках рядом: минута → sneak +2 (по ТЗ);
  //  3) чутьё следопыта: метки на сущностях в радиусе (track >= 4);
  //  4) сброс кэша убийства в конце кадра.
  // ====================================================================

  var runAcc = 0;      // накопитель секунд бега
  var sneakAcc = 0;    // накопитель секунд кражисьи
  var trackT = 0;      // таймер меток следопыта

  function skillsTick(dt) {
    var g = G();
    if (!g || !g.running || g.dead) return;
    var p = g.player;
    if (!p || p.sleeping || p.hp <= 0) { pendingKill = null; return; }

    try {
      // --- бег ---
      if (p.sprinting && p.moving) {
        runAcc += dt;
        if (runAcc >= RUN_MIN_SEC) {
          runAcc -= RUN_MIN_SEC;
          addXp('run', RUN_XP_PER_MIN, 'минута бега');
        }
      } else {
        runAcc = Math.max(0, runAcc - dt * 0.5);   // пауза слегка остужает
      }

      // --- кражисья при волках (или медведе) рядом ---
      if (p.sneaking && p.moving && predatorNear(p)) {
        sneakAcc += dt;
        if (sneakAcc >= RUN_MIN_SEC) {
          sneakAcc -= RUN_MIN_SEC;
          addXp('sneak', SNEAK_XP_PER_MIN, 'кражисья у хищника');
        }
      } else if (!p.sneaking) {
        sneakAcc = Math.max(0, sneakAcc - dt * 0.5);
      }

      // --- чутьё следопыта ---
      var tlv = lvid('track');
      if (tlv >= TRACK_MARK_MIN_LV && p.sneaking) {
        trackT += dt;
        if (trackT >= TRACK_MARK_EVERY) {
          trackT = 0;
          markEntities(p, trackRange());
        }
      } else {
        trackT = 0;
      }

      // кэш оружия убийства живёт ровно до конца кадра
      pendingKill = null;
    } catch (err) {
      WS.err('skillsTick:', err && err.message);
    }
  }

  /** Есть ли хищник в SNEAK_WOLF_R тайлах (волк/медведь/бандит). */
  function predatorNear(p) {
    var w = WS.World;
    if (!w || !w.entsNear) return false;
    var list = w.entsNear(p.x, p.y, SNEAK_WOLF_R);
    for (var i = 0; i < list.length; i++) {
      var k = list[i] && list[i].kind;
      if (k === 'wolf' || k === 'bear' || k === 'bandit') return true;
    }
    return false;
  }

  /** Метки следопыта: искорка над сущностями в радиусе чутья. */
  function markEntities(p, r) {
    var w = WS.World;
    if (!w || !w.entsNear) return;
    var list = w.entsNear(p.x, p.y, r);
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (!e || e === p || !e.kind || e.kind === 'drop') continue;
      if (e.dead || e.hp === undefined) continue;
      fxSpawn('spark', e.x, e.y - 0.6, { z: 26, life: 1.2, size: 2, grav: 0 });
    }
  }

  // ====================================================================
  //  СПИСОК ДЛЯ UI (экран навыков агента UI)
  // ====================================================================

  /**
   * Сводка навыков: [{id, name, cat, lv, xp, need, toNext, frac, maxed, desc, fx}].
   */
  function list() {
    var out = [];
    var p = P();
    for (var i = 0; i < SKILL_IDS.length; i++) {
      var id = SKILL_IDS[i];
      var def = SKILL_DEFS[id];
      var s = (p && p.skills && p.skills[id]) || { lv: 0, xp: 0 };
      out.push({
        id: id,
        name: def ? def.name : id,
        cat: def ? def.cat : 'прочие',
        lv: s.lv || 0,
        xp: s.xp || 0,
        need: (s.lv || 0) >= MAX_LV ? 0 : xpNeed(s.lv || 0),
        toNext: xpToNext(id),
        frac: progress(id),
        maxed: (s.lv || 0) >= MAX_LV,
        desc: def ? def.desc : '',
        fx: def ? def.fx : ''
      });
    }
    return out;
  }

  /** Сводная строка для тостов смерти/победы: «Топор 3 · Бег 5 ...». */
  function summary() {
    var parts = [];
    var p = P();
    if (!p || !p.skills) return '';
    for (var i = 0; i < SKILL_IDS.length; i++) {
      var id = SKILL_IDS[i];
      var lv = p.skills[id] ? p.skills[id].lv : 0;
      if (lv > 0) parts.push((SKILL_DEFS[id] ? SKILL_DEFS[id].name : id) + ' ' + lv);
    }
    return parts.join(' · ');
  }

  /** Суммарный уровень (для итогового счёта). */
  function totalLv() {
    var p = P();
    if (!p || !p.skills) return 0;
    var n = 0;
    for (var i = 0; i < SKILL_IDS.length; i++) {
      if (p.skills[SKILL_IDS[i]]) n += p.skills[SKILL_IDS[i]].lv || 0;
    }
    return n;
  }

  /** Текущий XP навыка (сырое значение — для UI-полосок). */
  function xp(id) {
    var p = P();
    return (p && p.skills && p.skills[id]) ? (p.skills[id].xp || 0) : 0;
  }

  /** Журнал последних начислений опыта (копия для UI). */
  function history() {
    return xpHistory.slice();
  }

  /** Отладочный дамп в консоль: таблица навыков и эффектов. */
  function debugDump() {
    if (!window.console || !console.table) {
      var line = summary() || 'навыков нет';
      WS.log('skills:', line);
      return line;
    }
    var rows = list();
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      r.bonus = Math.round(bonus(r.id) * 100) / 100;
    }
    console.table(rows);
    return rows.length;
  }

  // ====================================================================
  //  САМОТЕСТ (ручная проверка; вызывается из консоли)
  // ====================================================================

  function selftest() {
    var out = [];
    var pass = 0, fail = 0;
    function ok(name, cond) {
      if (cond) { pass++; out.push('  ok   ' + name); }
      else { fail++; out.push('  FAIL ' + name); }
      return !!cond;
    }
    var p = P();
    ok('модуль зарегистрирован', !!WS.Skills);
    ok('12 навыков в реестре', SKILL_IDS.length === 12);
    ok('кривая: lv0 → 100 XP', xpNeed(0) === 100);
    ok('кривая: lv9 → 1000 XP', xpNeed(9) === 1000);
    ok('lvid без партии безопасен', lvid('axe') === (p ? p.skills.axe.lv : 0));
    ok('bonus(axe) >= 1', bonus('axe') >= 1);
    ok('bonusFor(firearm,spread) <= 1', bonusFor('firearm', 'spread') <= 1);
    ok('bonusFor с кривым аспектом → главный', bonusFor('cook', 'нетакого') === bonus('cook'));
    ok('readBook неизвестной книги → false', readBook('net_takoy_knigi') === false);
    ok('list() — 12 записей', list().length === 12);
    ok('trackRange — число', typeof trackRange() === 'number');

    // аккуратная проверка addXp на реальном навыке с откатом
    if (p && p.skills && p.skills.survive) {
      var s = p.skills.survive;
      var wasLv = s.lv, wasXp = s.xp;
      addXp('survive', 30);
      var gained = (s.lv - wasLv) * xpNeed(Math.max(0, s.lv - 1)) + (s.xp - wasXp);
      ok('addXp ничего не теряет', gained === 30 || s.lv > wasLv);
      // откат — тест не должен портить партию
      s.lv = wasLv; s.xp = wasXp;
    }
    out.unshift('skills.selftest: ' + pass + ' ок, ' + fail + ' провалено');
    return out;
  }

  // ====================================================================
  //  ПУБЛИЧНЫЙ API МОДУЛЯ
  // ====================================================================

  var Skills = {
    // --- ядро ---
    MAX_LV: MAX_LV,
    SKILL_IDS: SKILL_IDS,
    SKILL_DEFS: SKILL_DEFS,
    xpNeed: xpNeed,
    lvid: lvid,
    addXp: addXp,
    xpToNext: xpToNext,
    progress: progress,
    normalize: normalize,

    // --- эффекты ---
    bonus: bonus,
    bonusFor: bonusFor,

    // --- дружественные множители (контракт для B-агентов) ---
    calMul: calMul,
    hungerMul: hungerMul,
    regenMul: regenMul,
    detectMul: detectMul,
    healMul: healMul,
    lootMul: lootMul,
    trackRange: trackRange,
    chopMul: chopMul,

    // --- книги ---
    readBook: readBook,
    isBookRead: isBookRead,

    // --- UI ---
    list: list,
    summary: summary,
    totalLv: totalLv,
    xp: xp,
    history: history,
    debugDump: debugDump,

    selftest: selftest
  };

  WS.def('Skills', Skills);

  // ====================================================================
  //  BOOT
  // ====================================================================

  WS.boot(function initSkills() {
    // фоновая прокачка и чутьё следопыта
    WS.tick(TICK_PRI, skillsTick, 'skills:sys');

    // --- источники опыта ---
    WS.Ev.on('combat:kill', onCombatKill);      // от combat.js (с оружием)
    WS.Ev.on('ent:kill', onEntKill);            // финальная точка любой смерти
    WS.Ev.on('item:crafted', onCrafted);         // от craft-агента
    WS.Ev.on('loot:searched', onLooted);         // от looting.js
    WS.Ev.on('time:day', onDay);                 // от core/time.js
    WS.Ev.on('fire:cooked', onCooked);           // от fire.js
    WS.Ev.on('item:repaired', onRepaired);       // от инвентаря C1 (если будет)
    WS.Ev.on('build:built', onCraftedBuild);     // от build.js
    WS.Ev.on('build:repaired', onRepaired);      // от build.js
    WS.Ev.on('trap:caught', onTrapped);          // от build.js (силок)
    WS.Ev.on('fish:caught', onFished);           // от build.js (прорубь)

    // --- нормализация на старте/загрузке ---
    WS.Ev.on('game:start', normalize);
    WS.Ev.on('game:load', normalize);

    WS.log('skills: система навыков готова (тиг ' + TICK_PRI + ')');
  }, 'skills:init');

  /** Постройка завершена: carpentry +10 (событие от build.js). */
  function onCraftedBuild(d) {
    var n = (d && d.xp) || XP_BUILD;
    addXp('carpentry', n);
  }

})();
