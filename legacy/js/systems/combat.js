/**
 * combat.js — БОЕВАЯ СИСТЕМА «Белого Безмолвия»: огнестрел с разбросом и
 * трассировкой луча, ближний бой с промахами/критами/скрытыми атаками,
 * единая точка урона по сущностям damageEnt (устанавливается и в
 * WS.AI.damageEnt — actions.js предпочитает её), оборона игрока бронёй
 * одежды (модификатор d.amount ДО применения health.js, слушатель первый
 * по FIFO: combat.js грузится раньше health.js). Баланс: волк 45 hp
 * (топор — 2 удара, кулак — 15), медведь 260 (винтовка — 4 выстрела),
 * бандит 80. Связи: actions.js (делегирует выстрел), ai.js (агро/смерть),
 * skills.js (XP через события 'combat:kill'/'combat:hit'), fx/snd/cam.
 */
(function () {
  'use strict';

  // ====================================================================
  //  КОНСТАНТЫ БАЛАНСА
  //  Все «магические числа» боя — здесь. Значения согласованы с ТЗ:
  //  шаг трассы 0.25, шум выстрела 60 тайлов, лёгкий kick(3) камеры.
  // ====================================================================

  var TICK_PRI = 41;              // приоритет тика (системы, CONTRACT.md)

  // ---- огнестрел ---------------------------------------------------------
  var FIRE_RANGE = 18;            // дальность выстрела, тайлы
  var FIRE_STEP = 0.25;           // шаг трассировки луча (по ТЗ)
  var FIRE_FALLOFF = 0.5;         // на макс. дистанции урон падает до 50%
  var FIRE_CD = 1.15;             // базовый кулдаун между выстрелами, сек
  var TRACE_ENT_R = 0.35;         // радиус захвата цели трассой (чуть шире actions)
  var GUN_NOISE = 60;             // радиус шума выстрела по умолчанию (по ТЗ)
  var GUN_KICK = 3;               // лёгкая тряска камеры при выстреле игрока (по ТЗ)
  var RELOAD_BASE = 3;            // базовая перезарядка, сек (actions.js)

  // ---- разброс (градусы; итог клампится в SPREAD_MIN..SPREAD_MAX) --------
  var SPREAD_MIN = 0.8;           // даже снайпер дрожит
  var SPREAD_MAX = 45;            // совсем плохой стрелок
  var SPREAD_ACC_K = 0.15;         // база: (100 - accuracy) * K
  var SPREAD_PAIN = 12;           // боль добавляет до +12°
  var SPREAD_BREATH = 18;         // сбитое дыхание (после бега) до +18°
  var SPREAD_FATIGUE = 8;         // усталость до +8°
  var SPREAD_FROST = 10;          // обмороженные руки дрожат: до +10°
  var SPREAD_DARK = 4;            // темнота +4°
  var SPREAD_MOVE = 5;            // стрельба на ходу +5°
  var SPREAD_DRUNK = 8;           // пьяный стрелок
  var SNEAK_AIM_MUL = 0.65;       // крадучись — упор снайпера (снайпинг-скилл)
  var CRIT_GUN_BASE = 0.05;       // базовый шанс крита выстрела
  var CRIT_GUN_LV = 0.008;        // +0.8% за уровень firearm
  var CRIT_GUN_MUL = 1.6;         // крит выстрела: ×1.6 (не двойной — пуля и так зла)
  var COND_DMG_PEN = 0.35;        // ниже этой кондиции оружие бьёт слабее
  var COND_DMG_MUL = 0.72;        // множитель урона изношенного ствола

  // ---- ближний бой --------------------------------------------------------
  var MELEE_VAR_LO = 0.75;        // урон = base × (0.75..1.25) — по ТЗ
  var MELEE_VAR_HI = 1.25;
  var MISS_BASE = 0.04;           // базовый шанс промаха
  var MISS_PAIN = 0.0016;         // +шанс за единицу боли (боль 60 → +9.6%)
  var MISS_FATIGUE = 0.0012;      // +шанс за единицу усталости
  var MISS_FROST = 0.0010;        // обмороженные руки (по ТЗ): 100 → +10%
  var MISS_MAX = 0.35;            // потолок шанса промаха
  var MELEE_ACC_LV = 0.02;        // melee-скилл: -2% промаха за уровень
  var CRIT_MELEE_BASE = 0.05;     // базовый шанс крита (если у оружия нет поля crit)
  var CRIT_MELEE_LV = 0.008;      // +0.8% за уровень melee
  var CRIT_MUL = 2.0;             // крит ближнего боя — двойной урон (по ТЗ)
  var SNEAK_ATK_MUL = 2.5;        // скрытая атака: ×2.5 урона (по ТЗ)
  var KNOCK_TILES = 0.0625;       // тайлов отброса на единицу knock
  var WEAR_PER_HIT = 0.7;         // износ оружия за удар: cond -0.7 (по ТЗ)
  var AXE_DMG_LV = 1.2;           // axe-скилл: +1.2 урона за уровень топору
  var MELEE_DMG_LV = 1.0;         // melee-скилл: +1.0 урона за уровень

  // ---- оборона игрока ------------------------------------------------------
  var DEF_SOFT = 30;              // коэф.: 1 - def/(def+SOFT) — убывающая отдача
  var DEF_CAP = 0.55;             // ниже 55% урона броня не режет
  var DEF_SLOT_LIST = ['head', 'torso', 'legs', 'feet', 'hands', 'back'];

  // ---- скрытая атака --------------------------------------------------------
  // Цель «не в бою», если у неё нет свежей агрессии/погони. Формат alertTo —
  // из ai.js {x, y, t}; сравнение с WS.AI.now() (при недоступности — всегда бой).
  var SNEAK_LOOK_BACK = 1.2;      // секунды после получения урона цель ещё «в бою»

  // ---- физические типы урона (для брони; frost/starve броня НЕ режет) ------
  var PHYS_TYPES = {
    bite: 1, claw: 1, cut: 1, blade: 1, bullet: 1, gun: 1, blunt: 1, hit: 1, fall: 1
  };

  // ====================================================================
  //  ТАБЛИЦА БАЛАНСА (сверка с ai/*.js — актуальные значения)
  //  ------------------------------------------------------------------
  //   цель        hp       топор (22)      кулак (3)    винтовка (70)
  //   волк        45       2 удара         15 ударов     1 выстрел
  //   волк-вожак  60       3 удара         20 ударов     1 выстрел
  //   заяц        8        1 удар          3 удара       1 выстрел
  //   олень       30       2 удара         10 ударов     1 выстрел
  //   бандит      80       4 удара         27 ударов     2 выстрела
  //   медведь     260      12 ударов       87 ударов     4 выстрела (по ТЗ)
  //  Множители: вариация ×0.75..1.25, дистанция до -50%, крит ×2,
  //  скрытая атака ×2.5, изношенный ствол ×0.72, скиллы +1.0..1.2/уровень.
  // ====================================================================

  // ---- прицеливание (зажатый ПКМ с огнестелом, стоя) ----------------------
  var AIM_MAX = 0.35;               // максимум -35% разброса
  var AIM_RATE = 0.25;             // накопление упора за секунду
  var AIM_MOVE_BREAK = true;        // движение сбивает прицел

  // ---- сектор удара ближнего боя (совместим с actions.js) -----------------
  var SECTOR_HALF_ANG = Math.PI / 3;  // 60° от направления взгляда
  var SECTOR_EXTRA = 0.5;             // запас дальности сектора

  // Мировые векторы 8 направлений (договор с player.js).
  var DIRVEC = [
    [0, 1], [-1, 1], [-1, 0], [-1, -1],
    [0, -1], [1, -1], [1, 0], [1, 1]
  ];

  /** Последний выстрел: {x0, y0, x1, y1, hit, dmg} — отладка/UI-прицел. */
  var lastShot = null;

  // ====================================================================
  //  МАЛЫЕ УТИЛИТЫ
  // ====================================================================

  function G() { return WS.G || null; }
  function P() { var g = WS.G; return (g && g.player) || null; }
  function W() { return WS.World || null; }
  function I() { return WS.Input || null; }

  /**
   * Мышь — совместимый доступ (CONTRACT.md объявляет функцией, реализация
   * core/input.js публикует живой объект; терпим оба варианта).
   */
  function mouse() {
    var m = I() && WS.Input.mouse;
    if (!m) return { x: 0, y: 0, wx: 0, wy: 0, tx: -1, ty: -1, leftP: false, rightP: false };
    if (typeof m === 'function') {
      try { return m(); } catch (e) { return { x: 0, y: 0, wx: 0, wy: 0, tx: -1, ty: -1 }; }
    }
    return m;
  }

  /** Позиционный звук (всегда через WS.Snd — контракт). */
  function snd(name, x, y, vol) {
    if (!WS.Snd || !WS.Snd.play) return;
    try { WS.Snd.play(name, { x: x, y: y, vol: vol }); } catch (e) { /* тишина */ }
  }

  /** Безопасный вызов эффекта (частицы не должны ронять бой). */
  function fx(kind, x, y, n, o) {
    if (!WS.Fx || !WS.Fx.burst) return;
    try { WS.Fx.burst(kind, x, y, n, o); } catch (e) { /* пусто */ }
  }

  function fxText(str, x, y, o) {
    if (!WS.Fx || !WS.Fx.text) return;
    try { WS.Fx.text(str, x, y, o); } catch (e) { /* пусто */ }
  }

  function camKick(power) {
    if (!WS.Cam || !WS.Cam.kick) return;
    try { WS.Cam.kick(power); } catch (e) { /* пусто */ }
  }

  /** Данные предметов (js/data/items_*.js копируют в WS.Data.items). */
  function itemsTable() { return (WS.Data && WS.Data.items) || {}; }
  function itemDef(id) { return id ? (itemsTable()[id] || null) : null; }

  // ====================================================================
  //  ИНВЕНТАРЬ: АБСТРАКЦИЯ НАД C1 (WS.Inv) И actions.js
  //  Параллельный агент пишет WS.Inv — на момент загрузки его может не
  //  быть. Пробуем его методы, падаем на базовые из WS.Action.
  //  Порядок: WS.Inv (если есть) -> WS.Action -> отказ.
  // ====================================================================

  /** Сколько предметов id в инвентаре игрока (0 при любом сбое). */
  function invCount(id) {
    if (!id) return 0;
    var inv = WS.Inv;
    if (inv) {
      if (typeof inv.count === 'function') {
        try { return Math.max(0, inv.count(id) | 0); } catch (e) { /* дальше */ }
      }
      if (typeof inv.countItem === 'function') {
        try { return Math.max(0, inv.countItem(id) | 0); } catch (e2) { /* дальше */ }
      }
    }
    if (WS.Action && typeof WS.Action.countItem === 'function') {
      try { return Math.max(0, WS.Action.countItem(id) | 0); } catch (e3) { return 0; }
    }
    return 0;
  }

  /** Потратить n предметов id. Возвращает фактически потраченное. */
  function invConsume(id, n) {
    if (!id) return 0;
    n = Math.max(1, n | 0);
    var inv = WS.Inv;
    if (inv && typeof inv.consume === 'function') {
      try {
        var used = inv.consume(id, n);
        if (used > 0) return used;
      } catch (e) { /* дальше */ }
    }
    if (WS.Action && typeof WS.Action.consume === 'function') {
      try { return WS.Action.consume(id, n) | 0; } catch (e2) { return 0; }
    }
    return 0;
  }

  /** Положить n предметов. Возвращает добавленное (0 — не влезло). */
  function invGive(id, n) {
    if (!id) return 0;
    n = Math.max(1, n | 0);
    var inv = WS.Inv;
    if (inv && typeof inv.give === 'function') {
      try {
        var g = inv.give(id, n);
        if (g > 0) return g;
      } catch (e) { /* дальше */ }
    }
    if (WS.Action && typeof WS.Action.give === 'function') {
      try { return WS.Action.give(id, n) | 0; } catch (e2) { return 0; }
    }
    return 0;
  }

  /**
   * Треугольно-нормальное число -1..1 (сумма двух равномерных) — «колокол»
   * без хвостов, предсказуемый разброс: большинство пуль у центра.
   */
  function noise1() {
    return (Math.random() + Math.random()) - 1;
  }

  function dirAng(d) {
    var v = DIRVEC[d & 7];
    return Math.atan2(v[1], v[0]);
  }

  /** Износ предмета-слота: cond -= 0.7 за удар (по ТЗ), только если поле есть. */
  function wearSlot(slot, amount) {
    if (!slot || typeof slot.cond !== 'number') return false;
    slot.cond = Math.max(0, slot.cond - (amount || WEAR_PER_HIT));
    return true;
  }

  /** Множитель урона от состояния оружия (потрёпанный ствол бьёт хуже). */
  function condMul(slot) {
    if (!slot || typeof slot.cond !== 'number') return 1;
    if (slot.cond < COND_DMG_PEN) return COND_DMG_MUL;
    return 1;
  }

  // ====================================================================
  //  ОРУЖИЕ: КЛАССИФИКАЦИЯ
  //  Совместима с actions.js weaponInfo, но добавляет поля крита/точности.
  //  attacker может быть игроком (equip.hand1) или сущностью с полем
  //  _rangedDef (будущие бандиты смогут стрелять через Combat.fire).
  // ====================================================================

  /**
   * Сводка об оружии атакующего.
   *   { mode: 'ranged'|'melee'|'fists', slot, def,
   *     dmg, range, atkSpd, knock, crit, ammo }
   */
  function weaponInfo(attacker) {
    attacker = attacker || P();
    if (!attacker) return null;
    var slot = null;
    var def = null;

    // сущность с собственным определением оружия (ИИ-стрелки)
    if (attacker._rangedDef) {
      def = attacker._rangedDef;
    } else if (attacker.equip) {
      slot = attacker.equip.hand1 || null;
      def = slot ? itemDef(slot.id) : null;
    }

    if (def && def.ranged) {
      return {
        mode: 'ranged', slot: slot, def: def, ammo: def.ammo || null,
        dmg: def.dmg || 20, range: FIRE_RANGE, atkSpd: 1, knock: 2,
        crit: CRIT_GUN_BASE
      };
    }
    if (def && def.dmg > 0) {
      return {
        mode: 'melee', slot: slot, def: def, ammo: null,
        dmg: def.dmg, range: def.range || 1.0,
        atkSpd: def.atkSpd || 1.1, knock: def.knock || 3,
        crit: (typeof def.crit === 'number' ? def.crit : CRIT_MELEE_BASE) / 100
      };
    }
    // кулаки — параметры из actions.js (договор: FIST_DMG 3, волк = 15 ударов)
    return {
      mode: 'fists', slot: null, def: null, ammo: null,
      dmg: 3, range: 0.9, atkSpd: 1.6, knock: 8, crit: 0.02
    };
  }

  /** Топор ли это (тег chopping — рубит деревья и головы одинаково). */
  function isAxe(def) {
    return !!(def && def.tags && def.tags.indexOf('chopping') >= 0);
  }

  // ====================================================================
  //  МОДИФИКАТОРЫ СОСТОЯНИЯ СТРЕЛКА
  //  Разброс растёт от боли, сбитого дыхания, усталости, обмороженных
  //  рук, темноты, движения и опьянения; падает от упора (крадучись)
  //  и навыка firearm (множитель из skills.js).
  // ====================================================================

  /**
   * Итоговый угловой разброс в ГРАДУСАХ для стрелка с оружием wi.
   * Возвращает {deg, parts} — parts для отладки/UI («почему мажу»).
   * Учитывает накопленный упор прицеливания (p._aimT 0..1).
   */
  function spreadOf(attacker, wi) {
    var parts = [];
    var acc = (wi.def && typeof wi.def.accuracy === 'number') ? wi.def.accuracy : 50;
    var deg = (100 - acc) * SPREAD_ACC_K;
    parts.push({ k: 'оружие', v: Math.round(deg * 10) / 10 });

    var pain = (typeof attacker.pain === 'number') ? attacker.pain : 0;
    if (pain > 5) { var a = pain / 100 * SPREAD_PAIN; deg += a; parts.push({ k: 'боль', v: Math.round(a * 10) / 10 }); }

    // дыхание сбито бегом (player.breath 1 = ровное, 0 = загнанный)
    if (typeof attacker.breath === 'number') {
      var br = (1 - Math.max(0, Math.min(1, attacker.breath))) * SPREAD_BREATH;
      if (br > 0.5) { deg += br; parts.push({ k: 'дыхание', v: Math.round(br * 10) / 10 }); }
    }

    // усталость (needs.fatigue: 100 = бодр)
    if (attacker.needs && typeof attacker.needs.fatigue === 'number') {
      var fa = (100 - attacker.needs.fatigue) / 100 * SPREAD_FATIGUE;
      if (fa > 0.5) { deg += fa; parts.push({ k: 'усталость', v: Math.round(fa * 10) / 10 }); }
    }

    // обмороженные руки дрожат (temperature.js владеет полем)
    if (typeof attacker.frostbite === 'number' && attacker.frostbite > 0) {
      var fb = attacker.frostbite / 100 * SPREAD_FROST;
      deg += fb; parts.push({ k: 'обморожение', v: Math.round(fb * 10) / 10 });
    }

    // темнота
    if (WS.Time && typeof WS.Time.light === 'function') {
      var dark = 1 - WS.Time.light();
      if (dark > 0.3) { var dk = dark * SPREAD_DARK; deg += dk; parts.push({ k: 'темнота', v: Math.round(dk * 10) / 10 }); }
    }

    // стрельба на ходу
    if (attacker.moving) { deg += SPREAD_MOVE; parts.push({ k: 'на ходу', v: SPREAD_MOVE }); }

    // пьяный стрелок
    if (typeof attacker.drunk === 'number' && attacker.drunk > 15) {
      var dr = attacker.drunk / 100 * SPREAD_DRUNK;
      deg += dr; parts.push({ k: 'хмель', v: Math.round(dr * 10) / 10 });
    }

    // упор снайпера: крадучись ствол не гуляет (снайпинг-скилл по ТЗ)
    if (attacker.sneaking) deg *= SNEAK_AIM_MUL;

    // прицеливание: накопленный упор (p._aimT) плавно срезает разброс
    if (typeof attacker._aimT === 'number' && attacker._aimT > 0) {
      var am = 1 - Math.min(AIM_MAX, attacker._aimT * AIM_MAX);
      deg *= am;
      parts.push({ k: 'упор', v: '-' + Math.round((1 - am) * 100) + '%' });
    }

    // навык огнестрела: множитель разброса из skills.js (0.5 на 10 ур)
    if (WS.Skills && typeof WS.Skills.bonusFor === 'function') {
      var m = WS.Skills.bonusFor('firearm', 'spread');
      if (typeof m === 'number' && m > 0) deg *= m;
    }

    if (deg < SPREAD_MIN) deg = SPREAD_MIN;
    if (deg > SPREAD_MAX) deg = SPREAD_MAX;
    return { deg: deg, parts: parts };
  }

  // ====================================================================
  //  ОГНЕСТРЕЛ
  //  fire(shooter, tx, ty) — основной вход; actions.js делегирует сюда
  //  ВСЮ баллистику (патроны списывает вызывающий по ТЗ, но путь
  //  делегирования в actions.js этого не делает — поэтому патроны
  //  проверяем и списываем сами; дублирования нет: fallback actions.js
  //  при живом Combat.fire не выполняется).
  //  Эффекты по ТЗ: вспышка у ствола (Fx 'spark'), звук 'gunshot',
  //  шум 60 тайлов, лёгкий Cam.kick(3) при выстреле игрока.
  // ====================================================================

  /**
   * Выстрел. Возвращает true, если выстрел произошёл (даже «в молоко»).
   * false — нечем/нечем стрелять (нет патронов, кулдаун, не огнестрел).
   */
  function fire(shooter, tx, ty) {
    shooter = shooter || P();
    if (!shooter) return false;
    var g = G();
    if (!g || !g.running || g.dead) return false;
    if (shooter.hp !== undefined && shooter.hp <= 0) return false;

    var wi = weaponInfo(shooter);
    if (!wi || wi.mode !== 'ranged') return false;   // не огнестрел — мимо

    var isPlayer = !!(shooter.kind === 'player' || shooter.id === 'player');

    // кулдауны (двойная проверка: actions.js тоже гейтит, но вдруг зовут напрямую)
    if ((shooter._fireCd || 0) > 0) return false;
    if ((shooter._reloadT || 0) > 0) {
      if (isPlayer) fxText('Перезарядка...', shooter.x, shooter.y - 0.7, { col: '#d8c8a0', life: 0.8 });
      return false;
    }

    // --- патроны: проверка и списание ---
    var ammoId = wi.ammo;
    if (isPlayer) {
      if (!ammoId || invCount(ammoId) < 1) {
        snd('error', shooter.x, shooter.y, 0.5);
        fxText('Нет патронов', shooter.x, shooter.y - 0.6, { col: '#d8a0a0' });
        return false;
      }
      invConsume(ammoId, 1);
    } else if (ammoId && typeof shooter.ammo === 'number') {
      // сущность-стрелок со счётчиком боеприпасов (бандиты будущего)
      if (shooter.ammo <= 0) return false;
      shooter.ammo--;
    }

    // повернуться к цели
    var ux = tx - shooter.x, uy = ty - shooter.y;
    if (ux || uy) shooter.dir = WS.M.dir8(ux, uy);

    // кулдаун выстрела
    shooter._fireCd = FIRE_CD;

    // --- угол с разбросом ---
    var baseAng = Math.atan2(ty - shooter.y, tx - shooter.x);
    var sp = spreadOf(shooter, wi);
    var ang = baseAng + noise1() * sp.deg * Math.PI / 180;

    // --- трассировка ---
    var res = fireTrace(shooter, ang, wi);

    // --- статистика боя ---
    if (isPlayer) {
      bumpStat('shots');
      if (res.hit) bumpStat('hits');
      if (res.crit) bumpStat('crits');
    }

    // --- эффекты выстрела ---
    var mx = shooter.x + Math.cos(baseAng) * 0.55;
    var my = shooter.y + Math.sin(baseAng) * 0.55;
    fx('spark', mx, my, 5, { life: 0.25 });          // вспышка у ствола (по ТЗ)
    fx('smoke', mx, my, 4, { life: 0.5 });
    snd('gunshot', shooter.x, shooter.y, 1.0);

    // шум: радиус из определения оружия (шкала 0..110), по умолчанию 60
    var noiseR = GUN_NOISE;
    if (wi.def && typeof wi.def.noise === 'number' && wi.def.noise > 0) {
      noiseR = Math.max(12, Math.round(wi.def.noise * 0.6));
    }
    try { WS.Ev.emit('noise', { x: shooter.x, y: shooter.y, r: noiseR }); } catch (e) { /* пусто */ }

    // лёгкая тряска камеры при выстреле игрока (по ТЗ)
    if (isPlayer) camKick(GUN_KICK);

    // запах пороха... нет. Но волки чуют кровь от попадания — damageEnt
    lastShot = {
      x0: shooter.x, y0: shooter.y,
      x1: res.x, y1: res.y, hit: res.hit || null,
      dmg: res.dmg || 0, spreadDeg: Math.round(sp.deg * 10) / 10
    };
    return true;
  }

  /**
   * Трассировка луча шагами FIRE_STEP до дальности оружия.
   *   1) тайл-стена (isTileBlocked) обрывает трассу — сноп снега;
   *   2) SOLID-объект блокирует пулю, если у него нет bulletPass
   *      (мои баррикады/заборы из build.js пули пропускают, а окна
   *      в досках и высокие стены — нет);
   *   3) первая сущность (не shooter, не мёртвая, не дроп) получает
   *      урон с падением по дистанции.
   * Спящие сущности — законная цель (охота на спящих волков — путь
   * снайпера), скрытая атака даёт ×2.5.
   * Возвращает {hit, x, y, dmg}.
   */
  function fireTrace(shooter, ang, wi) {
    var w = W();
    if (!w) return { hit: null, x: shooter.x, y: shooter.y, dmg: 0 };

    var range = (wi.def && typeof wi.def.range === 'number' && wi.def.range > 0)
      ? Math.min(wi.def.range, FIRE_RANGE) : FIRE_RANGE;
    var ux = Math.cos(ang), uy = Math.sin(ang);
    var base = wi.dmg;
    var cm = condMul(wi.slot);
    var isPlayer = !!(shooter.kind === 'player' || shooter.id === 'player');

    var hit = null, hitD = 0, dmg = 0, isCrit = false;
    var x, y, tx, ty, t, i;
    var stepIdx = 0;

    for (t = FIRE_STEP; t <= range; t += FIRE_STEP) {
      x = shooter.x + ux * t;
      y = shooter.y + uy * t;
      tx = Math.floor(x); ty = Math.floor(y);

      // дымки-трассеры вдоль линии (каждый 4-й шаг — «пуле́т» читается глазом)
      if ((stepIdx++ & 3) === 0) {
        if (WS.Fx && WS.Fx.spawn) {
          try { WS.Fx.spawn('smoke', x, y, { z: 14, life: 0.3, size: 2, grav: -1 }); }
          catch (eTr) { /* частицы не критичны */ }
        }
      }

      // 1) стена/скала/вода останавливает пулю
      if (w.isTileBlocked(tx, ty)) {
        fx('snow', x - ux * FIRE_STEP * 0.5, y - uy * FIRE_STEP * 0.5, 4, { life: 0.4 });
        return { hit: null, x: x, y: y, dmg: 0 };
      }

      // 2) solid-объекты: высокие блокируют пулю
      if (w.objsAt) {
        var objs = w.objsAt(tx, ty);
        if (objs && objs.length) {
          for (i = 0; i < objs.length; i++) {
            var ob = objs[i];
            if (!ob || !ob.solid || ob.bulletPass) continue;
            // сама дверь/мебель с пулепроходимостью пропускает
            fx('spark', x, y, 3, { life: 0.3 });
            return { hit: null, x: x, y: y, dmg: 0 };
          }
        }
      }

      // 3) первая сущность на пути
      var e = entOnRay(x, y, TRACE_ENT_R, shooter);
      if (e) {
        hit = e; hitD = t;
        break;
      }
    }

    var endX = shooter.x + ux * range, endY = shooter.y + uy * range;

    if (hit) {
      // падение урона по дистанции: до 50% на максимальной дальности
      dmg = Math.max(1, base * (1 - FIRE_FALLOFF * (hitD / range)) * cm);

      // крит выстрела: 5% + 0.8%/уровень firearm
      var crit = false;
      var ch = CRIT_GUN_BASE;
      if (WS.Skills && typeof WS.Skills.lvid === 'function') {
        ch += WS.Skills.lvid('firearm') * CRIT_GUN_LV;
      }
      if (Math.random() < ch) { dmg *= CRIT_GUN_MUL; crit = true; isCrit = true; }

      // скрытый выстрел: крадучись по не заметившей цели — ×2.5
      var sneak = false;
      if (isPlayer && shooter.sneaking && targetUnaware(hit)) {
        dmg *= SNEAK_ATK_MUL; sneak = true;
      }

      dmg = Math.round(dmg);
      damageEnt(hit, dmg, shooter, {
        ang: ang, knock: 0.3, weapon: (wi.slot && wi.slot.id) || (wi.def && wi.def.id) || null,
        mode: 'ranged', crit: crit, sneak: sneak
      });

      endX = hit.x; endY = hit.y;
      fx('spark', endX, endY, 3, { life: 0.3 });   // попадание
      if (crit) fxText('КРИТ!', endX, endY - 0.9, { col: '#f4b968', life: 1.1, size: 14 });
      if (sneak) fxText('Скрытый выстрел!', endX, endY - 1.2, { col: '#9db0c8', life: 1.3 });
    } else {
      fx('smoke', endX, endY, 3, { life: 0.6 });   // пуля ушла «в молоко»
    }

    return { hit: hit || null, x: endX, y: endY, dmg: dmg, crit: isCrit };
  }

  /** Сущность с hp в круге r вокруг точки, кроме shooter/трупов/дропа. */
  function entOnRay(x, y, r, shooter) {
    var w = W();
    if (!w || !w.ents) return null;
    var r2 = r * r;
    for (var i = 0; i < w.ents.length; i++) {
      var e = w.ents[i];
      if (!e || e === shooter) continue;
      if (e.kind === 'drop') continue;             // предметы не простреливаются
      if (!e.hp || e.hp <= 0 || e.dead) continue;  // трупы не бьём
      var dx = e.x - x, dy = e.y - y;
      if (dx * dx + dy * dy <= r2) return e;
    }
    return null;
  }

  /** Цель «не в бою»: нет свежего alertTo/threat (формат ai.js). */
  function targetUnaware(t) {
    if (!t) return true;
    if (t.sleeping) return true;                    // спящая — идеальная жертва
    var now = (WS.AI && typeof WS.AI.now === 'function') ? WS.AI.now() : 0;
    if (t.alertTo && typeof t.alertTo.t === 'number' && now - t.alertTo.t < SNEAK_LOOK_BACK) return false;
    if (t.threatT !== undefined && now - t.threatT < SNEAK_LOOK_BACK) return false;
    if (t.state === 'attack' || t.state === 'flee' || t.state === 'chase') return false;
    return true;
  }

  // ====================================================================
  //  БЛИЖНИЙ БОЙ
  //  melee(attacker, target, weapon) — расчёт удара «по ТЗ»:
  //    урон = base × (0.75..1.25) + скиллбонус (axe/melee);
  //    промах по pain/fatigue/frostbite; крит — двойной урон + 'КРИТ!';
  //    скрытая атака крадучись по не знающей цели — ×2.5;
  //    износ оружия cond -0.7.
  //  actions.js бьёт собственной редкой реализацией, но урон сущностям
  //  всё равно проходит через наш damageEnt (установлен в WS.AI.damageEnt).
  //  Этот метод — полный бой для новых вызовов (ИИ-союзники, анимации UI).
  // ====================================================================

  /**
   * Удар ближнего боя. Возвращает:
   *   { hit: false }                       — промах;
   *   { hit: true, dmg, crit, sneak, miss: false }
   */
  function melee(attacker, target, weapon) {
    attacker = attacker || P();
    if (!attacker || !target) return { hit: false, miss: false };
    var wi = weapon || weaponInfo(attacker);
    if (!wi) return { hit: false, miss: false };
    if (target.hp === undefined || target.hp <= 0 || target.dead) return { hit: false, miss: false };
    // дальность оружия + запас на «радиус тела» цели (копьё бьёт издалека)
    if (WS.M.dist(attacker.x, attacker.y, target.x, target.y) > (wi.range || 1) + 0.9) {
      return { hit: false, miss: false };          // не дотянуться
    }

    var isPlayer = !!(attacker.kind === 'player' || attacker.id === 'player');

    // --- промах: боль, усталость, обмороженные руки (по ТЗ) ---
    var miss = missChance(attacker, wi);
    if (Math.random() < miss) {
      var ang0 = Math.atan2(target.y - attacker.y, target.x - attacker.x);
      attacker.dir = WS.M.dir8(Math.cos(ang0), Math.sin(ang0));
      attacker._swingT = 0.15;                     // замах всё равно виден
      fxText('Промах', target.x, target.y - 0.8, { col: '#8b95a5', life: 0.9 });
      wearSlot(wi.slot, WEAR_PER_HIT);             // воздух тоже портит оружие
      try { WS.Ev.emit('combat:miss', { src: attacker, dst: target }); } catch (e) { /* пусто */ }
      return { hit: false, miss: true };
    }

    // --- урон: base × (0.75..1.25) + скиллбонус ---
    var dmg = wi.dmg * (MELEE_VAR_LO + Math.random() * (MELEE_VAR_HI - MELEE_VAR_LO));
    dmg *= condMul(wi.slot);

    if (WS.Skills) {
      var lvAxe = WS.Skills.lvid ? WS.Skills.lvid('axe') : 0;
      var lvMee = WS.Skills.lvid ? WS.Skills.lvid('melee') : 0;
      // топоры бьют сильнее с навыком «Топор», прочее — с «Рукопашным»
      if (isAxe(wi.def)) dmg += lvAxe * AXE_DMG_LV;
      else dmg += lvMee * MELEE_DMG_LV;
    }

    // --- крит: двойной урон + текст 'КРИТ!' (по ТЗ) ---
    var critCh = (typeof wi.crit === 'number' && wi.crit > 0) ? wi.crit : CRIT_MELEE_BASE;
    if (WS.Skills && WS.Skills.lvid) critCh += WS.Skills.lvid('melee') * CRIT_MELEE_LV;
    var crit = Math.random() < critCh;
    if (crit) dmg *= CRIT_MUL;

    // --- скрытая атака: крадучись по не в бою — ×2.5 (по ТЗ) ---
    var sneak = false;
    if (isPlayer && attacker.sneaking && targetUnaware(target)) {
      dmg *= SNEAK_ATK_MUL;
      sneak = true;
    }

    dmg = Math.max(1, Math.round(dmg));

    // замах и поворот (анимация в player.js читает _swingT)
    var ang = Math.atan2(target.y - attacker.y, target.x - attacker.x);
    attacker.dir = WS.M.dir8(target.x - attacker.x, target.y - attacker.y);
    attacker._swingT = 0.15;

    // --- износ: cond -0.7 (по ТЗ) ---
    wearSlot(wi.slot, WEAR_PER_HIT);

    // --- применение через единую точку ---
    bumpStat('melees');
    damageEnt(target, dmg, attacker, {
      ang: ang, knock: (wi.knock || 3) * KNOCK_TILES,
      weapon: (wi.slot && wi.slot.id) || (wi.def && wi.def.id) || null,
      mode: (wi.mode === 'fists') ? 'fists' : 'melee',
      crit: crit, sneak: sneak
    });

    snd('hit_flesh', attacker.x, attacker.y, 0.9);
    camKick(1.5);
    if (crit) fxText('КРИТ!', target.x, target.y - 1.0, { col: '#f4b968', life: 1.2, size: 15 });
    if (sneak) fxText('Скрытая атака!', target.x, target.y - 1.3, { col: '#9db0c8', life: 1.4 });

    // ближний бой слышен недалеко (договор с actions.js)
    try { WS.Ev.emit('noise', { x: attacker.x, y: attacker.y, r: 4 }); } catch (e2) { /* пусто */ }

    return { hit: true, miss: false, dmg: dmg, crit: crit, sneak: sneak };
  }

  /**
   * Шанс промаха. База 4%, боль/усталость/обморожение добавляют,
   * навык melee снимает. Потолок MISS_MAX — иначе кулаками по медведю
   * станет невозможно вообще.
   */
  function missChance(attacker, wi) {
    var ch = MISS_BASE;
    var pain = (typeof attacker.pain === 'number') ? attacker.pain : 0;
    var frost = (typeof attacker.frostbite === 'number') ? attacker.frostbite : 0;
    var fat = (attacker.needs && typeof attacker.needs.fatigue === 'number')
      ? (100 - attacker.needs.fatigue) : 0;

    ch += pain * MISS_PAIN;
    ch += fat * MISS_FATIGUE;
    ch += frost * MISS_FROST;                      // обмороженные руки (по ТЗ)

    if (WS.Skills && WS.Skills.lvid) {
      ch -= WS.Skills.lvid('melee') * MELEE_ACC_LV;
    }
    if (ch < 0.01) ch = 0.01;
    if (ch > MISS_MAX) ch = MISS_MAX;
    return ch;
  }

  // ====================================================================
  //  ЕДИНАЯ ТОЧКА УРОНА ПО СУЩНОСТЯМ
  //  damageEnt(e, dmg, by, opts):
  //    e.hp -= dmg; Fx.burst('blood'); emit('ent:damage', {applied:true});
  //    отброс (knock); агро (если есть brain — e.alertTo = by);
  //    hp <= 0 -> e.dead = true, emit('ent:kill'), removeEnt.
  //  Установка: if (!WS.AI.damageEnt) WS.AI.damageEnt = damageEnt —
  //  тогда и actions.js, и любые новые модули идут через нас, а ai.js
  //  продолжает пользоваться своей damageEntity (двойного урона нет:
  //  наш emit несёт applied:true, его onExternalDamage игнорирует).
  // ====================================================================

  /**
   * Применить урон сущности.
   * opts: { ang, knock, weapon, mode, crit, sneak } — всё опционально.
   * Возвращает фактически нанесённый урон (0 — бить было некого).
   */
  function damageEnt(e, dmg, by, opts) {
    if (!e || e.dead || e.hp === undefined) return 0;
    dmg = Math.max(0, Number(dmg) || 0);
    if (!dmg) return 0;
    opts = opts || {};

    e.hp -= dmg;
    if (opts.crit) bumpStat('crits');
    if (opts.sneak) bumpStat('sneakHits');

    // кровь: частицы + запах для волков (ai.js слушает 'blood')
    fx('blood', e.x, e.y, Math.max(3, Math.min(8, 2 + Math.floor(dmg / 8))));
    try { WS.Ev.emit('ent:damage', { ent: e, dmg: dmg, by: by, applied: true }); }
    catch (err) { WS.err('combat emit ent:damage', err && err.message); }
    try { WS.Ev.emit('blood', { x: e.x, y: e.y, r: 6 }); } catch (err2) { /* пусто */ }
    try { WS.Ev.emit('ent:attack', { src: by, dst: e, dmg: dmg }); } catch (err3) { /* пусто */ }

    // отброс (knock) — по направлению удара
    if (opts.knock > 0) knockback(e, (typeof opts.ang === 'number') ? opts.ang : 0, opts.knock);

    // агро: сущность с мозгом бросается на обидчика
    if (e.brain && by && by.hp !== undefined) {
      var now = (WS.AI && typeof WS.AI.now === 'function') ? WS.AI.now() : 0;
      e.alertTo = { x: by.x, y: by.y, t: now };
      e.threat = by;
      e.threatT = now;
    }

    if (e.hp <= 0) {
      // событие для XP ДО ent:kill (skills.js слушает combat:kill с оружием)
      try {
        WS.Ev.emit('combat:kill', {
          ent: e, by: by, weapon: opts.weapon || null,
          mode: opts.mode || null, crit: !!opts.crit, sneak: !!opts.sneak
        });
      } catch (err4) { /* пусто */ }
      bumpStat('kills');
      killEnt(e, by);
    } else if (typeof e.onDamaged === 'function') {
      try { e.onDamaged(dmg, by); } catch (err5) { WS.err('onDamaged:', err5 && err5.message); }
    }
    return dmg;
  }

  /**
   * Отбросить сущность от атакующего (договор с actions.js knockback).
   * Стена по пути гасит импульс до половины, вторая стена — до нуля.
   */
  function knockback(e, ang, dist) {
    if (!e || !(dist > 0)) return;
    var w = W();
    if (!w) return;
    var dx = Math.cos(ang) * dist;
    var dy = Math.sin(ang) * dist;
    var nx = e.x + dx, ny = e.y + dy;
    if (w.isTileBlocked(Math.floor(nx), Math.floor(ny))) {
      nx = e.x + dx * 0.5;
      ny = e.y + dy * 0.5;
      if (w.isTileBlocked(Math.floor(nx), Math.floor(ny))) return;
    }
    e.x = nx;
    e.y = ny;
  }

  /**
   * Смерть сущности. Предпочитаем WS.AI.kill (статистика, труп от
   * Loot.makeCorpse, removeEnt, событие 'ent:kill'); ВАЖНО: AI.kill сам
   * ставит e.dead и выходит, если флаг уже стоит — поэтому флаги ставим
   * только в собственном fallback-пути (без ИИ), по образцу actions.js
   * killEnt: труп-объект + лужа крови + таймеры распада.
   */
  function killEnt(e, by) {
    if (!e || e.dead) return;
    var w = W();

    if (WS.AI && typeof WS.AI.kill === 'function') {
      try { WS.AI.kill(e, by); return; } catch (err) { WS.err('AI.kill:', err && err.message); }
    }

    // страховка без ИИ
    e.dead = true;
    e.state = 'dead';
    e.moving = false;
    var g = G();
    var byPlayer = !!(by && (by.kind === 'player' || by.id === 'player'));
    var KILL_STAT = {
      wolf: 'wolvesKilled', bear: 'bearsKilled', bandit: 'banditsKilled',
      deer: 'animalsHunted', hare: 'animalsHunted', crow: 'animalsHunted'
    };
    if (g && g.stats && byPlayer && e.kind && KILL_STAT[e.kind]) {
      g.stats[KILL_STAT[e.kind]] = (g.stats[KILL_STAT[e.kind]] || 0) + 1;
    }
    try { WS.Ev.emit('ent:kill', { ent: e, by: by }); } catch (err2) { /* пусто */ }

    if (w && w.addObject) {
      var corpse = w.addObject({
        x: e.x, y: e.y,
        sprName: 'corpse_generic',
        sprFrame: Math.random() < 0.5 ? 0 : 1,
        solid: false, shadow: false,
        name: 'Труп', corpse: true,
        container: 'corpse_' + (e.kind || 'generic'),
        decay: 600
      });
      if (!w.timers) w.timers = [];
      w.timers.push({ o: corpse, t: 600 });
    }
    fx('blood', e.x, e.y, 8);
    snd('death', e.x, e.y, 0.5);
    if (w && w.removeEnt) {
      try { w.removeEnt(e); } catch (err3) { WS.err('removeEnt:', err3 && err3.message); }
    }
  }

  // ====================================================================
  //  ОБОРОНА ИГРОКА
  //  Броня одежды — сумма def по экипированным слотам — снижает урон.
  //  Коэффициент: 1 - def/(def+30), потолок 55% поглощения.
  //  Применение: слушатель 'player:damage', зарегистрированный ПЕРВЫМ
  //  (combat.js грузится раньше health.js — FIFO шины событий), только
  //  модифицирует d.amount физических типов, не применяя урон сам.
  //  Параллельно экспортируется playerDefense() — health.js и UI могут
  //  учитывать коэффициент явно, если знают о нас.
  // ====================================================================

  /**
   * Итоговая защита игрока.
   *   { def: сумма брони, coef: множитель урона 0.45..1, cut: % поглощения }
   */
  function playerDefense() {
    var p = P();
    if (!p || !p.equip) return { def: 0, coef: 1, cut: 0 };
    var def = 0;
    for (var i = 0; i < DEF_SLOT_LIST.length; i++) {
      var slot = p.equip[DEF_SLOT_LIST[i]];
      if (!slot) continue;
      var d = itemDef(slot.id);
      if (!d || typeof d.def !== 'number') continue;
      // потрёпанная одежда защищает хуже
      var wear = (typeof slot.cond === 'number') ? Math.max(0.5, slot.cond) : 1;
      def += d.def * wear;
    }
    var coef = 1 - def / (def + DEF_SOFT);
    if (coef < DEF_CAP) coef = DEF_CAP;
    return { def: Math.round(def * 10) / 10, coef: coef, cut: Math.round((1 - coef) * 100) };
  }

  /** Модификатор урона игроку: режем физические типы ДО применения. */
  function onPlayerDamageMod(d) {
    if (!d || d.handled) return;
    var t = d.type || 'hit';
    if (!PHYS_TYPES[t]) return;                    // frost/starve броня не лечит
    var amount = Number(d.amount) || 0;
    if (amount <= 0) return;
    var pd = playerDefense();
    if (pd.coef >= 1) return;
    var scaled = amount * pd.coef;
    // минимальный проходящий урон 1 — броня не делает бессмертным
    d.amount = Math.max(1, Math.round(scaled * 10) / 10);
    try { WS.Ev.emit('combat:absorbed', { raw: amount, taken: d.amount, def: pd.def }); }
    catch (e) { /* пусто */ }
  }

  /**
   * Урон игроку — удобная точка входа для своих систем (бандиты стреляют
   * через AI.damagePlayer; лавина/обвал — через нас). Броню НЕ считаем
   * здесь: её срежет наш слушатель onPlayerDamageMod при эмите (иначе
   * коэффициент применился бы дважды).
   */
  function hurtPlayer(amount, type, src) {
    var a = Math.max(0, Number(amount) || 0);
    try { WS.Ev.emit('player:damage', { amount: a, type: type || 'hit', src: src }); }
    catch (e) { WS.err('combat hurtPlayer', e && e.message); }
  }

  // ====================================================================
  //  СЕКТОРНЫЙ УДАР (массовый замах)
  //  meleeAll(attacker) — «взмах» по всем целям в секторе 60°, как это
  //  делает actions.js, но через полноценный melee(): промахи, криты,
  //  скиллбонус и износ на каждую цель. Топором по стае.
  // ====================================================================

  /**
   * Сущности в секторе удара: дистанция <= range+0.5 от атакующего И
   * направление на цель в пределах 60° от направления взгляда.
   * Прямой проход по World.ents — пространственный хэш мира не
   * отслеживает перемещения (договор с actions.js).
   */
  function sectorScan(attacker, radius) {
    var out = [];
    var w = W();
    if (!w || !w.ents) return out;
    var face = dirAng(attacker.dir || 0);
    var r2 = radius * radius;
    for (var i = 0; i < w.ents.length; i++) {
      var e = w.ents[i];
      if (!e || e === attacker) continue;
      if (e.kind === 'drop') continue;
      if (!e.hp || e.hp <= 0 || e.dead) continue;      // трупы не бьём
      var dx = e.x - attacker.x, dy = e.y - attacker.y;
      if (dx * dx + dy * dy > r2) continue;
      var ang = Math.atan2(dy, dx);
      if (Math.abs(WS.M.angDiff(face, ang)) > SECTOR_HALF_ANG) continue;
      out.push(e);
    }
    return out;
  }

  /**
   * Взмах по сектору. Возвращает {tried, hit, dmg} — количество целей,
   * попаданий и суммарный урон. Одним вызовом: замах, поворот к курсору.
   */
  function meleeAll(attacker) {
    attacker = attacker || P();
    if (!attacker) return { tried: 0, hit: 0, dmg: 0 };
    var wi = weaponInfo(attacker);

    // повернуться к курсору (сектор считается от взгляда)
    var m = mouse();
    var ux = m.wx - attacker.x, uy = m.wy - attacker.y;
    if (ux || uy) attacker.dir = WS.M.dir8(ux, uy);
    if ((attacker._atkCd || 0) > 0) return { tried: 0, hit: 0, dmg: 0 };
    attacker._atkCd = 1 / (wi.atkSpd || 1.1);
    attacker._swingT = 0.15;

    var targets = sectorScan(attacker, (wi.range || 1) + SECTOR_EXTRA);
    var hit = 0, dmg = 0;
    for (var i = 0; i < targets.length; i++) {
      var r = melee(attacker, targets[i], wi);
      if (r.hit) { hit++; dmg += r.dmg || 0; }
    }
    return { tried: targets.length, hit: hit, dmg: dmg };
  }

  // ====================================================================
  //  БОЕВАЯ СТАТИСТИКА И ПАТРОНЫ (для UI и отладки)
  // ====================================================================

  /** Счётчики боя за партию (WS.G.stats._combat — наше поле). */
  var combatStats = { shots: 0, hits: 0, kills: 0, crits: 0, melees: 0, sneakHits: 0 };

  function bumpStat(k) {
    combatStats[k] = (combatStats[k] || 0) + 1;
    var g = G();
    if (g && g.stats) {
      if (!g.stats._combat) g.stats._combat = {};
      g.stats._combat[k] = (g.stats._combat[k] || 0) + 1;
    }
  }

  /** Сводка по патронам текущего оружия: {id, name, count, mag}. */
  function ammoInfo() {
    var p = P();
    if (!p) return null;
    var wi = weaponInfo(p);
    if (wi.mode !== 'ranged' || !wi.ammo) return null;
    return {
      id: wi.ammo,
      count: invCount(wi.ammo),
      mag: (wi.def && wi.def.mag) || 1,
      reloading: (p._reloadT || 0) > 0
    };
  }

  // ====================================================================
  //  ТИК МОДУЛЯ (приоритет 41 — системы)
  //  1) перезарядка: навык firearm укорачивает начатую перезарядку
  //     (actions.js ставит _reloadT = 3; мы плавно сжимаем его один раз);
  //  2) прицеливание: зажатый ПКМ с огнестрелом стоя копит упор _aimT;
  //  3) гашение кулдаунов у не-игроков (сущности без своего тика).
  // ====================================================================

  function combatTick(dt) {
    var g = G();
    if (!g || !g.running || g.dead) return;
    var p = g.player;
    if (!p) return;

    try {
      // перезарядка навыком: один раз сжимаем таймер, поставленный actions.js
      if (p._reloadT > 0 && !p._reloadScaled) {
        p._reloadScaled = true;
        var mul = 1;
        if (WS.Skills && typeof WS.Skills.bonusFor === 'function') {
          var m = WS.Skills.bonusFor('firearm', 'reload');
          if (typeof m === 'number' && m > 0) mul = m;
        }
        p._reloadT = RELOAD_BASE * mul;
      }
      if (p._reloadT <= 0) p._reloadScaled = false;

      // прицеливание: зажатый ПКМ + огнестрел в руке + стоим на месте
      var m2 = mouse();
      var wi = weaponInfo(p);
      if (wi.mode === 'ranged' && m2.right && !p.moving && !p.sleeping) {
        p._aimT = Math.min(1, (p._aimT || 0) + dt * AIM_RATE);
      } else {
        p._aimT = 0;                                // сдвиг/отпуск — упор сбит
      }
    } catch (err) {
      WS.err('combatTick:', err && err.message);
    }
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
    ok('модуль зарегистрирован', !!WS.Combat);
    ok('damageEnt — функция', typeof damageEnt === 'function');
    ok('WS.AI.damageEnt установлен', !!(WS.AI && typeof WS.AI.damageEnt === 'function'));
    ok('playerDefense — объект', typeof playerDefense().coef === 'number');
    var wi = P() ? weaponInfo(P()) : null;
    ok('weaponInfo работает', !!wi && (wi.mode === 'melee' || wi.mode === 'ranged' || wi.mode === 'fists'));
    var sp = P() ? spreadOf(P(), weaponInfo(P())) : { deg: 0 };
    ok('разброс в границах', sp.deg >= SPREAD_MIN && sp.deg <= SPREAD_MAX);
    // трасса в стену не падает (координаты вне мира — безопасно)
    var r = fireTrace({ x: -50, y: -50, kind: 'ghost' }, 0, weaponInfo(null) || { dmg: 10 });
    ok('трасса вне мира безопасна', r && typeof r.x === 'number');
    ok('knockback(null) безопасен', knockback(null, 0, 1) === undefined);
    ok('melee без цели безопасен', melee(null, null, null).hit === false);
    out.unshift('combat.selftest: ' + pass + ' ок, ' + fail + ' провалено');
    return out;
  }

  // ====================================================================
  //  ПУБЛИЧНЫЙ API МОДУЛЯ
  //  Методы безопасны при отсутствии партии (нули/false/null).
  // ====================================================================

  var Combat = {
    // --- огнестрел ---
    fire: fire,                       // actions.js делегирует сюда
    spread: function (who) { return spreadOf(who || P(), weaponInfo(who || P())); },
    lastShot: function () { return lastShot; },

    // --- ближний бой ---
    melee: function (attacker, target, weapon) {
      return melee(attacker || P(), target, weapon);
    },
    missChance: function (who) { return missChance(who || P(), weaponInfo(who || P())); },

    // --- урон ---
    damageEnt: damageEnt,             // единая точка (также в WS.AI.damageEnt)
    knockback: knockback,
    killEnt: killEnt,

    // --- оборона игрока ---
    playerDefense: playerDefense,     // {def, coef, cut} — для health.js/UI
    hurtPlayer: hurtPlayer,           // урон игроку с учётом брони

    // --- утилиты ---
    weaponInfo: weaponInfo,
    isAxe: isAxe,

    // --- массовый замах и статистика ---
    meleeAll: meleeAll,
    sectorScan: sectorScan,
    ammoInfo: ammoInfo,
    stats: function () { return combatStats; },

    selftest: selftest
  };

  WS.def('Combat', Combat);

  // ====================================================================
  //  BOOT
  //  Порядок важен: слушатель player:damage регистрируется ДО health.js
  //  (build.js/combat.js грузятся раньше по алфавиту) — модификатор
  //  выполняется первым и режет d.amount до применения урона.
  // ====================================================================

  WS.boot(function initCombat() {
    // тик систем
    WS.tick(TICK_PRI, combatTick, 'combat:sys');

    // модификатор брони — первым в очереди 'player:damage'
    WS.Ev.on('player:damage', onPlayerDamageMod);

    // единая точка урона для actions.js: если у ИИ нет damageEnt —
    // ставим нашу (ai.js пользуется СВОЕЙ damageEntity, конфликта нет)
    if (WS.AI && typeof WS.AI.damageEnt !== 'function') {
      WS.AI.damageEnt = damageEnt;
      WS.log('combat: WS.AI.damageEnt установлен (единая точка урона)');
    }

    WS.log('combat: боевая система готова (тиг ' + TICK_PRI + ')');
  }, 'combat:init');

})();
