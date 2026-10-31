/**
 * health.js — ЗДОРОВЬЕ «Белого Безмолвия»: урон (handled-паттерн),
 * кровотечение и лужи крови, переломы (гипс/шина + постельный режим),
 * инфекция и сепсис, боль и анальгетики, опьянение, болезни (реестр
 * DISEASES), медикаменты 1917 года, HUD-API status() и смерть через
 * WS.Main.die(причина). frostbite НЕ трогаем — им владеет temperature.js
 * (B1). Связи: Needs (B1) -> 'player:sick_chance'; combat (B3) читает
 * accPenalty()/status(); лужи крови -> World.addObject('blood_pool') и
 * событие 'blood' (запах для волков). Тик 40 (системы).
 */
(function () {
  'use strict';

  // ====================================================================
  //  КОНСТАНТЫ БАЛАНСА
  //  Все «магические числа» здоровья — здесь.
  // ====================================================================

  var TICK_PRI = 40;             // приоритет тика (CONTRACT.md: системы)

  // ---- регенерация и кровь --------------------------------------------
  var HP_REGEN_H = 0.5;          // hp/игровой час при сытости и без ран
  var HP_REGEN_HUNGER = 50;      // ниже этой сытости регенерации нет
  var BLEED_HP_H = 0.8;          // hp/час за ЕДИНИЦУ кровотечения (по ТЗ)
  var BLEED_GROW_H = 0.30;       // кровотечение само усиливается, /час
  var BLEED_CLOT_H = 0.35;       // лёгкое (ниже 1.0) само останавливается
  var BLEED_MAX = 10;            // потолок шкалы кровотечения
  var POOL_DIST = 2.6;           // тайлов пути между лужами крови
  var POOL_LIMIT = 36;           // максимум наших луж в мире
  var POOL_DECAY = 300;          // сек жизни лужи (по ТЗ decay 300)
  var BLOOD_STAGE1 = 18;          // суммарной кровопотери до 2-й стадии лужи
  var BLOOD_STAGE2 = 45;          // ... до 3-й стадии

  // ---- раны и инфекция --------------------------------------------------
  var WOUND_INFECT_AFTER_H = 3;   // часов до начала заражения грязной раны
  var INFECT_DIRTY_H = 1.6;       // рост инфекции/час от грязной раны
  var INFECT_CLEAN_H = 0.6;       // ... от чистой открытой
  var INFECT_SEPSIS = 100;       // 100 = сепсис = смерть
  var INFECT_FEVER_AT = 30;       // порог жара
  var INFECT_BAD_AT = 70;         // порог бреда
  var INFECT_HP_H_MILD = 0.25;    // hp/час при жаре
  var INFECT_HP_H_BAD = 0.6;      // hp/час в бреду
  var INFECT_SAN_H = 0.5;         // sanity/час при жаре

  // ---- перелом ----------------------------------------------------------
  var FRAC_SPEED = 0.45;          // множитель скорости с переломом (по ТЗ)
  var FRAC_SPEED_SPLINT = 0.55;   // ... в шине
  var FRAC_SPEED_CAST = 0.60;     // ... в гипсе (ходить можно бережно)
  var FRAC_PAIN = 40;             // постоянная боль (пол) без лечения (по ТЗ)
  var FRAC_PAIN_SPLINT = 25;      // ... в шине
  var FRAC_PAIN_CAST = 15;        // ... в гипсе
  var FRAC_CAST_BED_MIN = 480;    // минут постельного режима в гипсе (8 ч)
  var FRAC_SPLINT_BED_MIN = 960;  // в шине — вдвое дольше (16 ч)
  var FRAC_BED_IDLE_RATE = 0.25;  // покой в помещении без сна считается за четверть
  var FRAC_BED_WALK_RATE = 0.05;  // на ногах — почти не считается
  var FRAC_NO_SPRINT_BREATH = 0.13;  // зажим дыхания: с переломом бежать нельзя

  // ---- боль --------------------------------------------------------------
  var PAIN_DECAY_H = 1.2;         // естественное затухание боли, /час
  var PAIN_DECAY_SLEEP_H = 2.2;   // ... во сне быстрее
  var PAIN_RISE_TO_FLOOR_H = 8;   // скорость подъёма боли до «пола» состояния
  var PAIN_SPEED_AT = 60;        // выше этой боли скорость -10% (по ТЗ)
  var PAIN_SPEED_PEN = 0.10;      // ... размер штрафа

  // ---- опьянение ----------------------------------------------------------
  var DRUNK_DECAY_H = 2.5;        // протрезвление, /час
  var DRUNK_DECAY_SLEEP_H = 4.5;  // во сне быстрее
  var DRUNK_STUMBLE_AT = 50;      // выше — шаткая походка (по ТЗ)
  var DRUNK_POISON_AT = 80;       // выше — отравление (по ТЗ)
  var DRUNK_POISON_HP_H = 0.8;    // hp/час отравления
  var DRUNK_SANITY_BOOST_H = 0.35; // рассудок «греется» (но недолго)
  var DRUNK_SANITY_BAD_H = 0.8;   // ... а при отравлении страдает
  var VODKA_PAIN = 20;            // водка: боль -20 (по ТЗ)

  // ---- лечение медикаментами (по ТЗ; дефолты, если нет в Data) -----------
  var MED_DEFAULTS = {
    bandage:        { heal: 12,  stopBleed: true },
    bandage_clean:  { heal: 20,  stopBleed: true, disinfect: 30 },
    aspirin:        { painkill: 25 },
    morphine:       { painkill: 90 },
    laudanum:       { painkill: 60, sanity: 10, drunk: 4 },
    vodka:          { painkill: VODKA_PAIN, drunk: 20, sanity: 5 },
    iodine_tincture:{ disinfect: 55, pain: 2 },     // йод жжёт
    carbolic_acid:  { disinfect: 40 },
    quinine:        { cureSick: 'fever', pain: 10 },
    plaster_cast:   { frac: 'cast' },
    splint:         { frac: 'splint' },
    birch_chaga:    { heal: 3, resist: 4 },         // чага: +4 ч стойкости
    honey_jar:      { sickBoost: 'cold' },
    tea_brick:      { tea: true, sanity: 8 }
  };

  // «Ёрш-Драйв» (зелье скорости из экспедиций): множитель ходьбы/бега на
  // время действия (def.zoom — секунды буста; p._zoomT тает в тике update)
  var ZOOM_MOVE_MUL = 1.5;

  /** Урон по типам (по ТЗ): bleed — прибавка кровотечения, pain — доля
   *  урона в боль (0.34 ≈ amount/3 по умолчанию), infect — шанс заразить
   *  рану, infectAmt — сколько инфекции добавить, frac — базовый шанс
   *  перелома (растёт от силы удара), dirty — рана грязная (гниёт). */
  var DMG_TYPES = {
    bite:   { bleed: 2.5, pain: 0.40, infect: 0.45, infectAmt: 8,  frac: 0.10, dirty: true,  cause: 'растерзан зверем' },
    claw:   { bleed: 2.0, pain: 0.45, infect: 0.30, infectAmt: 6,  frac: 0.12, dirty: true,  cause: 'убит медведем-шатуном' },
    cut:    { bleed: 2.0, pain: 0.35, infect: 0.15, infectAmt: 5,  frac: 0.04, dirty: false, cause: 'истёк кровью' },
    blade:  { bleed: 2.5, pain: 0.40, infect: 0.20, infectAmt: 5,  frac: 0.08, dirty: false, cause: 'зарезан бандитом-дезертиром' },
    bullet: { bleed: 4.0, pain: 0.55, infect: 0.25, infectAmt: 8,  frac: 0.10, dirty: true,  cause: 'застрелен' },
    gun:    { bleed: 4.0, pain: 0.55, infect: 0.25, infectAmt: 8,  frac: 0.10, dirty: true,  cause: 'застрелен' },
    blunt:  { bleed: 0.3, pain: 0.50, infect: 0.05, infectAmt: 4,  frac: 0.22, dirty: false, cause: 'забит насмерть' },
    fall:   { bleed: 0.5, pain: 0.50, infect: 0.05, infectAmt: 4,  frac: 0.25, dirty: false, cause: 'разбился при падении' },
    frost:  { bleed: 0.0, pain: 0.20, infect: 0.00, infectAmt: 0,  frac: 0.00, dirty: false, cause: 'замёрз насмерть' },
    hit:    { bleed: 0.8, pain: 0.34, infect: 0.05, infectAmt: 3,  frac: 0.08, dirty: false, cause: 'убит' }
  };

  /** Причина смерти по kind напавшего (точнее, чем по типу урона). */
  var DEATH_BY_KIND = {
    wolf: 'растерзан волчьей стаей',
    bear: 'убит медведем-шатуном',
    bandit: 'убит бандитом-дезертиром',
    hermit: 'убит отшельником'
  };

  /** Смерти от «пассивных» систем — свои формулировки. */
  var DEATH_BLEED = 'Истёк кровью';
  var DEATH_SEPSIS = 'Сепсис — заражение крови';
  var DEATH_POISON = 'Отравление алкоголем';
  var DEATH_SICK = 'Умер от болезни';

  /** Мировые векторы 8 направлений (для пьяных «шагов»). */
  var DIRVEC = [
    [0, -1], [1, -1], [1, 0], [1, 1],
    [0, 1], [-1, 1], [-1, 0], [-1, -1]
  ];

  // ====================================================================
  //  РЕЕСТР БОЛЕЗНЕЙ (WS.Health.DISEASES)
  //  Поля:
  //   name      — русское название
  //   dur       — длительность, игровых часов (до выздоровления)
  //   hpH       — урон hp в час (0 = само не убивает)
  //   fatigueH  — дополнительный расход бодрости в час (Needs лишь база)
  //   sanityH   — расход рассудка в час
  //   hungerH / thirstH — доп. расход еды/воды в час (отравление сушит)
  //   painFloor — пол боли от болезни
  //   vomit     — периодическая рвота
  //   sleepBoost— множитель течения во сне (сон лечит быстрее)
  //   develop   — {id: шанс/час} осложнений
  //   cure      — itemId мгновенного излечения
  //   symptoms  — [{at: час, text, kind}] тосты по ходу болезни
  // ====================================================================

  var DISEASES = {
    cold: {
      name: 'Простуда', dur: 36, hpH: 0.15, fatigueH: 1.2, sanityH: 0.2,
      hungerH: 0, thirstH: 0.5, painFloor: 4, vomit: false, sleepBoost: 2,
      develop: { flu: 0.008 }, cure: null,
      symptoms: [
        { at: 0,  text: 'Вас знобит. Простуда.', kind: 'bad' },
        { at: 10, text: 'Кашель и насморк.', kind: 'info' },
        { at: 24, text: 'Становится легче.', kind: 'good' }
      ]
    },
    flu: {
      name: 'Грипп', dur: 60, hpH: 0.4, fatigueH: 3, sanityH: 0.7,
      hungerH: 0, thirstH: 1, painFloor: 10, vomit: false, sleepBoost: 2,
      develop: { fever: 0.010 }, cure: null,
      symptoms: [
        { at: 0,  text: 'Ломит кости, жар. Это грипп.', kind: 'bad' },
        { at: 20, text: 'Сил нет даже встать.', kind: 'bad' },
        { at: 44, text: 'Жар спадает.', kind: 'info' }
      ]
    },
    food_poison: {
      name: 'Пищевое отравление', dur: 12, hpH: 0.5, fatigueH: 1.5, sanityH: 0.4,
      hungerH: 2.5, thirstH: 1.5, painFloor: 8, vomit: true, sleepBoost: 1.5,
      develop: {}, cure: null,
      symptoms: [
        { at: 0, text: 'Живот скрутило. Отравление.', kind: 'bad' },
        { at: 6, text: 'Тошнота отступает.', kind: 'info' }
      ]
    },
    fever: {
      name: 'Лихорадка', dur: 48, hpH: 0.7, fatigueH: 2, sanityH: 1.5,
      hungerH: 0, thirstH: 1.5, painFloor: 15, vomit: false, sleepBoost: 1.5,
      develop: {}, cure: 'quinine',
      symptoms: [
        { at: 0,  text: 'Пылает жар. Лихорадка.', kind: 'bad' },
        { at: 12, text: 'Бред и видения.', kind: 'bad' },
        { at: 36, text: 'Жар на исходе.', kind: 'info' }
      ]
    }
  };

  // ====================================================================
  //  СОСТОЯНИЕ МОДУЛЯ (сбрасывается на game:start / game:load)
  // ====================================================================

  var lastTotalMin = -1;        // прошлый totalMin для дельты
  var bloodFxT = 0;             // сек до очередной капли крови (реальное время)
  var poolAcc = 0;              // накопитель дистанции для луж
  var lastPos = null;           // где был игрок в прошлый тик
  var stumbleCd = 0;            // сек до следующего пьяного шага
  var vomitT = 0;              // игровых часов до следующей рвоты
  var toastCd = {};             // ключ -> игровой totalMin, до какого молчим
  var pools = [];               // наши лужи крови (для лимита)

  // ====================================================================
  //  УТИЛИТЫ
  // ====================================================================

  function G() { return WS.G; }
  function P() { return WS.G ? WS.G.player : null; }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  function snd(name, vol) {
    try {
      if (WS.Snd && WS.Snd.play) WS.Snd.play(name, { vol: vol !== undefined ? vol : 0.7 });
    } catch (e) { /* звук не критичен */ }
  }

  /** Экранная подсказка: тост UI, иначе плавающий текст у игрока. */
  function msg(text, kind) {
    try {
      if (WS.Ui && WS.Ui.toast) { WS.Ui.toast(text, kind || 'info'); return; }
      var p = P();
      if (WS.Fx && WS.Fx.text && p) {
        WS.Fx.text(text, p.x, p.y, {
          col: kind === 'bad' ? '#e07a7a' : (kind === 'warn' ? '#e0b97a' : '#e8e2d0')
        });
      }
    } catch (e) { /* подсказка не критична */ }
  }

  /** Тост с защитой от спама: не чаще, чем раз в cooldown игровых минут. */
  function msgOnce(key, text, kind, cooldownMin) {
    var g = G();
    if (!g) return;
    var now = WS.Time.totalMin();
    if (toastCd[key] && now < toastCd[key]) return;
    toastCd[key] = now + (cooldownMin || 30);
    msg(text, kind);
  }

  /** Определение предмета (Data может быть ещё пуст — не падаем). */
  function itemDef(id) {
    try {
      if (WS.Data && WS.Data.items) return WS.Data.items[id] || null;
    } catch (e) { /* пусто */ }
    return null;
  }

  /** Сколько предметов id в инвентаре (через Action, иначе напрямую). */
  function invCount(id) {
    var p = P();
    if (!p) return 0;
    if (WS.Action && WS.Action.countItem) return WS.Action.countItem(id);
    if (!p.inv) return 0;
    var n = 0;
    for (var i = 0; i < p.inv.length; i++) {
      if (p.inv[i] && p.inv[i].id === id) n += p.inv[i].count || 1;
    }
    return n;
  }

  /** Потратить 1 предмет (через Action, иначе напрямую). true — потрачен. */
  function invTake(id) {
    var p = P();
    if (!p || invCount(id) < 1) return false;
    if (WS.Action && WS.Action.consume) return WS.Action.consume(id, 1) > 0;
    if (!p.inv) return false;
    for (var i = 0; i < p.inv.length; i++) {
      if (p.inv[i] && p.inv[i].id === id) {
        if ((p.inv[i].count || 1) > 1) p.inv[i].count -= 1;
        else p.inv.splice(i, 1);
        try { WS.Ev.emit('inv:changed', {}); } catch (e) { /* пусто */ }
        return true;
      }
    }
    return false;
  }

  /** Уровень навыка медицины (0..10) — влияет на перевязки и заражение. */
  function medicLv() {
    var p = P();
    if (p && p.skills && p.skills.medic) return p.skills.medic.lv || 0;
    return 0;
  }

  /** Ночь? (для редких ночных эффектов болезни). */
  function isSleeping() {
    var p = P();
    return !!(p && p.sleeping);
  }

  // ====================================================================
  //  НОРМАЛИЗАЦИЯ (старые сейвы / новая партия)
  //  Все поля здоровья игрока обязаны существовать и быть числами.
  // ====================================================================

  function normalize() {
    var p = P();
    if (!p) return;
    if (typeof p.hp !== 'number') p.hp = 100;
    if (typeof p.maxHp !== 'number' || p.maxHp <= 0) p.maxHp = 100;
    p.hp = clamp(p.hp, 0, p.maxHp);
    if (typeof p.bleed !== 'number') p.bleed = 0;
    p.bleed = clamp(p.bleed, 0, BLEED_MAX);
    if (typeof p.fracture !== 'boolean') p.fracture = !!p.fracture;
    if (typeof p.infection !== 'number') p.infection = 0;
    p.infection = clamp(p.infection, 0, INFECT_SEPSIS);
    if (typeof p.pain !== 'number') p.pain = 0;
    p.pain = clamp(p.pain, 0, 100);
    if (typeof p.drunk !== 'number') p.drunk = 0;
    p.drunk = clamp(p.drunk, 0, 100);
    // болезнь: валидный id или null
    if (p.sick && (!DISEASES[p.sick.id] || typeof p.sick.t !== 'number')) {
      p.sick = null;
    }
    if (p.sick) {
      // старый формат needs ('food_poisoning' без fired) — конвертируем
      if (p.sick.id === 'food_poisoning' && DISEASES.food_poison) p.sick.id = 'food_poison';
      if (!DISEASES[p.sick.id]) p.sick = null;
    }
    if (p.sick) {
      if (!p.sick.fired || typeof p.sick.fired !== 'object') p.sick.fired = {};
      if (typeof p.sick.compT !== 'number') p.sick.compT = 0;
      if (!p.sick.tea) p.sick.tea = false;
    }
    // рана: форма {t, dirty, treated, sev}
    if (p.wound && typeof p.wound.t !== 'number') p.wound = null;
    // лечение перелома: форма {mode, left, total}
    if (p.fracTreat && !(p.fracTreat.mode === 'cast' || p.fracTreat.mode === 'splint')) {
      p.fracTreat = null;
    }
    if (p.fracTreat && typeof p.fracTreat.left !== 'number') p.fracTreat.left = 0;
    // база скорости для штрафа (не трогаем, пока штрафов нет)
    if (typeof p._hSpdBase !== 'number' || p._hSpdBase <= 0) {
      p._hSpdBase = (typeof p.speed === 'number' && p.speed > 0) ? p.speed : 2.2;
    }
  }

  // ====================================================================
  //  ПРИМЕНЕНИЕ УРОНА ('player:damage')
  //  Паттерн един: if (d.handled) return; d.handled = true.
  //  Кто первый взял событие (B1 Needs может тоже), тот и применил.
  //  Fallback-обработчики player.js/ai.js видят WS.Health и _dmgHooked
  //  и не дублируют вычитание hp.
  // ====================================================================

  function onDamage(d) {
    if (!d || d.handled) return;               // уже применено другим
    var g = G();
    if (!g || !g.player || !g.running || g.dead) return;
    var p = g.player;
    if (p.hp <= 0) return;                     // мёртвых не бьём
    var amount = Math.max(0, Number(d.amount) || 0);
    if (amount <= 0) return;
    d.handled = true;                           // мы владеем применением
    if (!g._dmgHooked) g._dmgHooked = true;    // глушим fallback-ы

    var type = d.type || 'hit';
    var td = DMG_TYPES[type] || DMG_TYPES.hit;

    // --- hp ---
    p.hp = Math.max(0, p.hp - amount);

    // --- боль: Pain += amount/3 по ТЗ, у типа своя доля ---
    addPain(p, amount * (td.pain !== undefined ? td.pain : 0.34));

    // --- кровотечение ---
    if (td.bleed) {
      p.bleed = clamp(p.bleed + td.bleed * (0.75 + Math.random() * 0.5), 0, BLEED_MAX);
    }

    // --- перелом: шанс растёт от силы удара ---
    if (td.frac && !p.fracture) {
      var ch = td.frac + Math.max(0, amount - 12) * 0.012;
      if (Math.random() < ch) setFracture(p);
    }

    // --- инфекция раны (укус «шанс infection +8» по ТЗ) ---
    if (td.infect && p.infection < INFECT_SEPSIS && Math.random() < td.infect) {
      p.infection = clamp(p.infection + td.infectAmt, 0, INFECT_SEPSIS);
    }

    // --- свежая рана (грязная гниёт быстрее) ---
    p.wound = {
      t: 0,
      dirty: !!td.dirty,
      treated: false,
      sev: Math.min(10, amount / 4)
    };

    // --- эффекты: брызги, тряска, звук ---
    try {
      if (WS.Fx && WS.Fx.burst) {
        WS.Fx.burst('blood', p.x, p.y, clamp(Math.round(2 + amount / 5), 3, 10));
      }
      if (WS.Cam && WS.Cam.kick) WS.Cam.kick(clamp(amount / 10, 1, 8));
    } catch (e) { /* визуал не критичен */ }
    snd(td.bleed > 1 ? 'hit_flesh' : 'hit', 0.8);

    // --- запах крови для волков (ai.js слушает 'blood') ---
    try { WS.Ev.emit('blood', { x: p.x, y: p.y, r: 4 + amount / 2 }); } catch (e2) { /* пусто */ }

    // --- смерть ---
    if (p.hp <= 0) {
      die(deathCause(type, d.src, td));
    }
  }

  /** Сборка причины смерти по типу урона и напавшему. */
  function deathCause(type, src, td) {
    if (src && src.kind && DEATH_BY_KIND[src.kind]) return DEATH_BY_KIND[src.kind];
    if (td && td.cause) return td.cause;
    if (type === 'frost') return DMG_TYPES.frost.cause;
    return 'Убит';
  }

  /** Смерть — только через Main.die (по контракту). */
  function die(cause) {
    var g = G();
    if (!g || g.dead) return;
    try {
      if (WS.Main && WS.Main.die) { WS.Main.die(cause || 'Погиб'); return; }
    } catch (e) {
      WS.err('health die:', e && e.message);
    }
    // страховка (Main обязан быть, но не роняем партию молча)
    g.dead = true;
    g.running = false;
    WS.Ev.emit('player:die', { cause: cause || 'Погиб' });
  }

  // ====================================================================
  //  БОЛЬ
  // ====================================================================

  /** Добавить боль (с потолком 100). */
  function addPain(p, amount) {
    if (amount <= 0) return;
    var was = p.pain;
    p.pain = clamp(p.pain + amount, 0, 100);
    checkPainThresholds(p, was);
  }

  /**
   * «Пол» боли от текущих состояний: перелом, инфекция, болезнь.
   * Ниже пола боль не опускается, пока состояние не уйдёт.
   */
  function painFloor(p) {
    var fl = 0;
    if (p.fracture) {
      if (p.fracTreat && p.fracTreat.mode === 'cast') fl = Math.max(fl, FRAC_PAIN_CAST);
      else if (p.fracTreat && p.fracTreat.mode === 'splint') fl = Math.max(fl, FRAC_PAIN_SPLINT);
      else fl = Math.max(fl, FRAC_PAIN);
    }
    if (p.infection >= INFECT_FEVER_AT) fl = Math.max(fl, p.infection * 0.3);
    if (p.sick && DISEASES[p.sick.id]) fl = Math.max(fl, DISEASES[p.sick.id].painFloor || 0);
    return clamp(fl, 0, 90);
  }

  /** Пороги боли -> события для combat (B3) и подсказки. */
  function checkPainThresholds(p, was) {
    var th = [25, 50, 75];
    for (var i = 0; i < th.length; i++) {
      if (was < th[i] && p.pain >= th[i]) {
        try { WS.Ev.emit('health:pain', { pain: p.pain, level: th[i], accPen: accPenalty() }); }
        catch (e) { /* пусто */ }
        if (th[i] === 50) msgOnce('pain50', 'Боль мешает двигаться', 'warn', 60);
        if (th[i] === 75) msgOnce('pain75', 'Боль невыносима', 'bad', 60);
      }
    }
  }

  /** Штраф точности 0..0.6 для combat (B3): боль + опьянение + болезнь. */
  function accPenalty() {
    var p = P();
    if (!p) return 0;
    var pen = (p.pain || 0) / 100 * 0.30 +
              (p.drunk || 0) / 100 * 0.30;
    if (p.sick) pen += 0.05;
    if (p.fracture) pen += 0.05;
    return clamp(pen, 0, 0.6);
  }

  // ====================================================================
  //  ПЕРЕЛОМ
  // ====================================================================

  /** Сломать ногу (однократно): боль, тост, хруст. */
  function setFracture(p) {
    if (p.fracture) return;
    p.fracture = true;
    p.fracTreat = null;
    addPain(p, 25);
    msg('Нога сломана! Нужен гипс или хотя бы шина', 'bad');
    snd('trap_snap', 0.6);
    try { if (WS.Cam && WS.Cam.kick) WS.Cam.kick(6); } catch (e) { /* пусто */ }
  }

  /**
   * Начать лечение перелома: mode 'cast' (гипс, 8 ч постели) или
   * 'splint' (шина, 16 ч). Возвращает true при успехе.
   */
  function treatFracture(mode) {
    var p = P();
    if (!p || !p.fracture) return false;
    if (p.fracTreat) {
      msg('Нога уже зафиксирована', 'info');
      return false;
    }
    var mins = mode === 'cast' ? FRAC_CAST_BED_MIN : FRAC_SPLINT_BED_MIN;
    p.fracTreat = { mode: mode, left: mins, total: mins };
    msg(mode === 'cast'
      ? 'Нога в гипсе. Постельный режим — ' + (mins / 60) + ' ч'
      : 'Нога в шине. Ходить можно, срастётся дольше — ' + (mins / 60) + ' ч',
      'info');
    snd('craft', 0.6);
    return true;
  }

  /**
   * Прогресс лечения: сон — полная скорость, покой в помещении —
   * четверть, на ногах — почти ничего. По завершении кость срастается.
   */
  function progressFracture(p, gh) {
    var t = p.fracTreat;
    if (!t) return;
    var rate = 1;                                  // часов за час
    if (isSleeping()) rate = 1;
    else {
      var inside = false;
      try { inside = !!(WS.World && WS.World.isInside && WS.World.isInside(p.x, p.y)); }
      catch (e) { inside = false; }
      if (inside && !p.moving) rate = FRAC_BED_IDLE_RATE;
      else rate = FRAC_BED_WALK_RATE;
    }
    t.left -= gh * 60 * rate;
    if (t.left <= 0) {
      p.fracture = false;
      p.fracTreat = null;
      p.pain = Math.max(painFloor(p), p.pain - 20);
      msg('Кость срослась. Можно ходить', 'good');
      try { WS.Ev.emit('player:heal', { kind: 'fracture' }); } catch (e) { /* пусто */ }
    }
  }

  /** Быстрая шина из подручного: 1 доска + 1 тряпка (или верёвка). */
  function splintFromPlanks() {
    var p = P();
    if (!p) return false;
    if (!p.fracture) { msg('Ломать нечего', 'info'); return false; }
    if (p.fracTreat) { msg('Нога уже зафиксирована', 'info'); return false; }
    if (invCount('plank') < 1) { msg('Нужна доска', 'warn'); return false; }
    var tie = invCount('cloth_rag') > 0 ? 'cloth_rag' :
              (invCount('rope') > 0 ? 'rope' : null);
    if (!tie) { msg('Нужна тряпка или верёвка', 'warn'); return false; }
    invTake('plank');
    invTake(tie);
    return treatFracture('splint');
  }

  // ====================================================================
  //  КРОВОТЕЧЕНИЕ И СЛЕДЫ КРОВИ
  // ====================================================================

  /** Тик кровотечения: рост, урон hp, капли и лужи за игроком. */
  function tickBleed(p, gh, rs) {
    if (p.bleed <= 0) {
      // зажившая рана отваливается сама через время
      if (p.wound && p.wound.treated && p.wound.t > 2) p.wound = null;
      return;
    }
    // рост: чем сильнее, тем быстрее; лёгкое — тромбуется
    if (p.bleed >= 1.0) {
      p.bleed = clamp(p.bleed + BLEED_GROW_H * gh, 0, BLEED_MAX);
    } else {
      p.bleed = clamp(p.bleed - BLEED_CLOT_H * gh, 0, BLEED_MAX);
      if (p.bleed === 0) {
        msgOnce('bleedStop', 'Кровь остановилась', 'good', 20);
        return;
      }
    }

    // урон hp: bleed * 0.8 в час (по ТЗ)
    var hpLoss = p.bleed * BLEED_HP_H * gh;
    p.hp = Math.max(0, p.hp - hpLoss);
    p._bloodLost = (p._bloodLost || 0) + hpLoss;

    // капли крови (реальное время): Fx.burst
    bloodFxT -= rs;
    if (bloodFxT <= 0) {
      bloodFxT = clamp(3.5 - p.bleed * 0.3, 1.2, 3.5);
      try {
        if (WS.Fx && WS.Fx.burst) WS.Fx.burst('blood', p.x, p.y, Math.min(6, 1 + (p.bleed | 0)));
      } catch (e) { /* пусто */ }
    }

    // лужи по пройденному пути
    if (p.bleed >= 1.5) {
      if (lastPos) {
        var dx = p.x - lastPos.x, dy = p.y - lastPos.y;
        poolAcc += Math.sqrt(dx * dx + dy * dy);
      }
      if (poolAcc >= POOL_DIST) {
        poolAcc = 0;
        placeBloodPool(p);
      }
    }
    if (lastPos) { lastPos.x = p.x; lastPos.y = p.y; }
    else lastPos = { x: p.x, y: p.y };

    // смерть от потери крови
    if (p.hp <= 0) die(DEATH_BLEED);
  }

  /** Поставить лужу крови (стадия по кровопотере), с распадом 300 с. */
  function placeBloodPool(p) {
    var w = WS.World;
    if (!w || !w.addObject) return;
    var lost = p._bloodLost || 0;
    var stage = lost > BLOOD_STAGE2 ? 2 : (lost > BLOOD_STAGE1 ? 1 : 0);
    var o = w.addObject({
      x: p.x + (Math.random() - 0.5) * 0.4,
      y: p.y + (Math.random() - 0.5) * 0.4,
      sprName: 'blood_pool',
      sprFrame: stage,
      solid: false,
      shadow: false,
      name: 'Кровь',
      blood: true,
      decay: POOL_DECAY
    });
    // общий механизм протухающих декалей (как следы в player.js)
    if (!w.timers) w.timers = [];
    w.timers.push({ o: o, t: POOL_DECAY });
    pools.push(o);
    while (pools.length > POOL_LIMIT) {
      var old = pools.shift();
      try { if (w.removeObject) w.removeObject(old); } catch (e) { /* уже снят */ }
    }
    // запах для волков
    try { WS.Ev.emit('blood', { x: o.x, y: o.y, r: 7 }); } catch (e2) { /* пусто */ }
  }

  // ====================================================================
  //  РАНЫ И ИНФЕКЦИЯ
  // ====================================================================

  /** Тик раны: старение, заражение не перевязанных (по ТЗ > 3 часов). */
  function tickWound(p, gh) {
    if (!p.wound) return;
    p.wound.t += gh;
    if (p.wound.treated) return;               // перевязана — чистая
    if (p.wound.t <= WOUND_INFECT_AFTER_H) return;
    if (p.infection >= INFECT_SEPSIS) return;
    var rate = (p.wound.dirty ? INFECT_DIRTY_H : INFECT_CLEAN_H) +
               p.wound.sev * 0.08 +
               (p.bleed > 0 ? 0.3 : 0);
    rate *= (1 - Math.min(0.5, medicLv() * 0.05));  // медицина замедляет
    p.infection = clamp(p.infection + rate * gh, 0, INFECT_SEPSIS);
  }

  /** Тик инфекции: жар, бред, сепсис. */
  function tickInfection(p, gh) {
    if (p.infection <= 0) return;
    var n = p.needs;

    if (p.infection >= INFECT_SEPSIS) {
      // сепсис — смертельный финал заражения (по ТЗ)
      msgOnce('sepsis', 'Кровь отравлена. Это конец', 'bad', 15);
      die(DEATH_SEPSIS);
      return;
    }
    if (p.infection >= INFECT_BAD_AT) {
      p.hp = Math.max(0, p.hp - INFECT_HP_H_BAD * gh);
      if (n) n.sanity = clamp((n.sanity || 0) - 1.0 * gh, 0, 100);
      msgOnce('infBad', 'Рана гниёт. Горячка и бред', 'bad', 45);
    } else if (p.infection >= INFECT_FEVER_AT) {
      p.hp = Math.max(0, p.hp - INFECT_HP_H_MILD * gh);
      if (n) n.sanity = clamp((n.sanity || 0) - INFECT_SAN_H * gh, 0, 100);
      msgOnce('infFever', 'Рана воспалилась — жар. Нужен антисептик', 'bad', 45);
    }
    if (p.hp <= 0) die(DEATH_SEPSIS);
  }

  // ====================================================================
  //  ОПЬЯНЕНИЕ
  // ====================================================================

  /** Тик опьянения: спад, шатание, отравление при > 80 (по ТЗ). */
  function tickDrunk(p, gh, rs) {
    if (p.drunk <= 0) { p.drunk = 0; return; }
    var n = p.needs;

    // спад
    p.drunk = clamp(p.drunk - (isSleeping() ? DRUNK_DECAY_SLEEP_H : DRUNK_DECAY_H) * gh, 0, 100);

    // рассудок: лёгкое тепло — или отрава
    if (n) {
      if (p.drunk > DRUNK_POISON_AT) {
        n.sanity = clamp(n.sanity - DRUNK_SANITY_BAD_H * gh, 0, 100);
      } else if (p.drunk > 20) {
        n.sanity = clamp(n.sanity + DRUNK_SANITY_BOOST_H * gh, 0, 100);
      }
    }

    // шаткая походка: случайные шаги в сторону
    if (p.drunk > DRUNK_STUMBLE_AT && !isSleeping()) {
      stumbleCd -= rs;
      if (stumbleCd <= 0) {
        stumbleCd = 5 + Math.random() * 9;
        stumble(p);
      }
    }

    // отравление: урон hp и рвота
    if (p.drunk > DRUNK_POISON_AT) {
      p.hp = Math.max(0, p.hp - DRUNK_POISON_HP_H * gh);
      vomitT -= gh;
      if (vomitT <= 0) {
        vomitT = 1.5 + Math.random();
        snd('splash', 0.7);
        if (n) {
          n.hunger = clamp((n.hunger || 0) - 20, 0, 100);   // рвота опустошает
          n.thirst = clamp((n.thirst || 0) - 10, 0, 100);
        }
        addPain(p, 5);
        msgOnce('vomit', 'Вас рвёт', 'bad', 30);
        try {
          if (WS.Fx && WS.Fx.burst) WS.Fx.burst('steam', p.x, p.y, 3, { col: '#9fae7e' });
        } catch (e) { /* пусто */ }
      }
      if (p.hp <= 0) die(DEATH_POISON);
    }
  }

  /** Пьяный шаг: короткий сдвиг в случайную свободную сторону. */
  function stumble(p) {
    var w = WS.World;
    for (var attempt = 0; attempt < 8; attempt++) {
      var dir = Math.floor(Math.random() * 8);
      var dist = 0.18 + Math.random() * 0.16;
      var nx = p.x + DIRVEC[dir][0] * dist;
      var ny = p.y + DIRVEC[dir][1] * dist;
      if (w && w.isTileBlocked && w.isTileBlocked(Math.floor(nx), Math.floor(ny))) continue;
      p.x = nx; p.y = ny;
      break;
    }
    try { if (WS.Cam && WS.Cam.kick) WS.Cam.kick(1.2); } catch (e) { /* пусто */ }
    if (Math.random() < 0.12) snd('fall', 0.5);
  }

  // ====================================================================
  //  БОЛЕЗНИ
  // ====================================================================

  /** Заразить игрока (если уже болен — не перезаписываем). */
  function infectDisease(id, causeText) {
    var p = P();
    var D = DISEASES[id];
    if (!p || !D) return false;
    if (p.sick) return false;
    p.sick = { id: id, t: 0, fired: {}, compT: 0, tea: false };
    msg('Вы заболели: ' + D.name.toLowerCase(), 'bad');
    try { WS.Ev.emit('health:sick', { id: id, name: D.name }); } catch (e) { /* пусто */ }
    return true;
  }

  /**
   * Событие от Needs (B1): шанс заболеть от событий
   * (мокрый+холод, испорченная еда). {chance, disease?, kind?, cause?}
   * kind: 'food' -> отравление; 'wet_cold' -> простуда (в стужу — грипп).
   */
  function onSickChance(d) {
    if (!d) return;
    var p = P();
    var g = G();
    if (!p || !g || !g.running || g.dead) return;
    if (p.sick) return;                          // уже болен
    if (d.handled) return;                        // вдруг применит кто-то ещё
    d.handled = true;

    var chance = clamp(Number(d.chance) || 0, 0, 1);
    var resist = 1;
    // чага даёт временную стойкость
    if (p._chagaT > 0) resist *= 0.6;
    // навык медицины чуть защищает
    resist *= (1 - Math.min(0.25, medicLv() * 0.025));
    if (Math.random() >= chance * resist) return;

    var id = d.disease;
    if (!id || !DISEASES[id]) {
      if (d.kind === 'food') id = 'food_poison';
      else if (d.kind === 'wet' || d.kind === 'wet_cold' || d.kind === 'cold') {
        // на лютом холоде простуда легко переходит в грипп
        var tOut = (WS.Weather && WS.Weather.tempOutside) ? WS.Weather.tempOutside() : -10;
        id = (tOut < -20 && Math.random() < 0.4) ? 'flu' : 'cold';
      } else id = 'cold';
    }
    infectDisease(id, d.cause);
  }

  /** Тик болезни: течение, симптомы, осложнения, выздоровление. */
  function tickSick(p, gh) {
    var sk = p.sick;
    if (!sk) return;
    // страховка формата: needs/сейв могли оставить {id,t} без fired
    // (раньше это роняло тик и ВЫКЛЮЧАЛО всю систему здоровья)
    if (sk.id === 'food_poisoning') sk.id = 'food_poison';
    if (!sk.fired || typeof sk.fired !== 'object') sk.fired = {};
    if (typeof sk.compT !== 'number') sk.compT = 0;
    if (typeof sk.t !== 'number' || sk.t < 0) sk.t = 0;
    var D = DISEASES[sk.id];
    if (!D) { p.sick = null; return; }
    var n = p.needs;

    // течение: сон ускоряет (организм борется), чай с мёдом — тоже
    var rate = 1;
    if (isSleeping()) rate *= (D.sleepBoost || 1);
    if (sk.tea && sk.id === 'cold') rate *= 1.6;
    sk.t += gh * rate;

    // симптомы-тосты по часам болезни
    for (var i = 0; i < D.symptoms.length; i++) {
      var sym = D.symptoms[i];
      if (sk.t >= sym.at && !sk.fired[sym.at]) {
        sk.fired[sym.at] = true;
        msg(sym.text, sym.kind || 'info');
      }
    }

    // урон и расход нужд (сверх базового от Needs)
    p.hp = Math.max(0, p.hp - (D.hpH || 0) * gh);
    if (n) {
      if (D.fatigueH) n.fatigue = clamp((n.fatigue || 0) - D.fatigueH * gh, 0, 100);
      if (D.sanityH) n.sanity = clamp((n.sanity || 0) - D.sanityH * gh, 0, 100);
      if (D.hungerH) n.hunger = clamp((n.hunger || 0) - D.hungerH * gh, 0, 100);
      if (D.thirstH) n.thirst = clamp((n.thirst || 0) - D.thirstH * gh, 0, 100);
    }

    // рвота при отравлении
    if (D.vomit) {
      vomitT -= gh;
      if (vomitT <= 0) {
        vomitT = 2 + Math.random() * 2;
        snd('splash', 0.6);
        if (n) {
          n.hunger = clamp((n.hunger || 0) - 8, 0, 100);
          n.thirst = clamp((n.thirst || 0) - 6, 0, 100);
        }
        msgOnce('sickVomit', 'Тошнит', 'bad', 60);
      }
    }

    // осложнения: раз в час проверяем шанс
    sk.compT += gh;
    if (sk.compT >= 1) {
      sk.compT -= 1;
      for (var dev in D.develop) {
        if (D.develop.hasOwnProperty(dev) && Math.random() < D.develop[dev]) {
          var worse = D.develop[dev];
          p.sick = null;
          infectDisease(dev);
          msg(D.name + ' дала осложнение', 'bad');
          break;
        }
      }
    }

    // выздоровление
    if (p.sick && sk.t >= D.dur) {
      p.sick = null;
      msg('Ты выздоровел', 'good');
      try { WS.Ev.emit('health:healed', { id: sk.id }); } catch (e) { /* пусто */ }
    }

    // смерть от тяжёлой болезни (грипп/лихорадка могут убить ослабленного)
    if (p.hp <= 0) die(DEATH_SICK + ' (' + D.name.toLowerCase() + ')');
  }

  // ====================================================================
  //  МЕДИКАМЕНТЫ
  //  Единая точка WS.Health.useMed(id, opts) — её зовёт инвентарь/UI.
  //  Данные читаются из WS.Data.items (поля heal/stopBleed/disinfect/
  //  painkill/drunk/sanity/cures), дефолты — из таблицы MED_DEFAULTS.
  // ====================================================================

  /** Эффекты предмета: мерж дефолтов ТЗ и дата-файла. */
  function medEffects(id) {
    var eff = {};
    var d = MED_DEFAULTS[id] || {};
    for (var k in d) if (d.hasOwnProperty(k)) eff[k] = d[k];
    var def = itemDef(id);
    if (def) {
      // данные предмета дополняют, но ключевые числа ТЗ — приоритетны
      if (def.heal !== undefined && eff.heal === undefined) eff.heal = def.heal;
      if (def.stopBleed !== undefined) eff.stopBleed = def.stopBleed;
      if (def.disinfect !== undefined && eff.disinfect === undefined) eff.disinfect = def.disinfect;
      if (def.cures !== undefined) {
        if (def.cures === 'fracture' && !eff.frac) eff.frac = 'cast';
        else if (def.cures !== 'fracture' && !eff.cureSick) eff.cureSick = def.cures;
      }
      if (def.painkill !== undefined && eff.painkill === undefined) eff.painkill = def.painkill;
      if (def.drunk !== undefined && eff.drunk === undefined) eff.drunk = def.drunk;
      if (def.sanity !== undefined && eff.sanity === undefined) eff.sanity = def.sanity;
      // зелье скорости (экспедиции): def.zoom — секунды буста
      if (def.zoom !== undefined && eff.zoom === undefined) eff.zoom = def.zoom;
    }
    return eff;
  }

  /**
   * Применить медикамент/лечебный предмет. Сначала проверки, потом
   * расход предмета, потом эффекты. Возвращает true при успехе.
   * opts.onWound: true — водкой промыть рану (не пить).
   */
  function useMed(id, opts) {
    opts = opts || {};
    var p = P();
    if (!p) return false;
    if (invCount(id) < 1) { msg('Нет предмета', 'warn'); return false; }
    var eff = medEffects(id);

    // --- ветка: промывание раны водкой (полевая хирургия 1917) ---
    if (opts.onWound && id === 'vodka') {
      if (p.infection <= 0 && !(p.wound && !p.wound.treated)) {
        msg('Рану промывать не нужно', 'info');
        return false;
      }
      invTake('vodka');
      disinfect(15);
      addPain(p, 8);                       // спирт жжёт
      msg('Рана промыта. Жжёт!', 'info');
      snd('drink', 0.6);
      return true;
    }

    // --- перевязка ---
    if (eff.stopBleed) {
      return bandage(id);
    }

    // --- гипс/шина ---
    if (eff.frac) {
      if (!p.fracture) { msg('Ломать нечего', 'info'); return false; }
      if (!invTake(id)) return false;
      return treatFracture(eff.frac);
    }

    // --- хинин: мгновенное излечение лихорадки ---
    if (eff.cureSick) {
      if (!p.sick || p.sick.id !== eff.cureSick) {
        msg('Это лекарство сейчас не нужно', 'info');
        return false;
      }
      if (!invTake(id)) return false;
      var D = DISEASES[eff.cureSick];
      p.sick = null;
      msg('Жар спадает. ' + D.name + ' отступила', 'good');
      try { WS.Ev.emit('player:heal', { kind: 'medicine' }); } catch (e) { /* пусто */ }
      snd('drink', 0.7);
      return true;
    }

    // --- чай с мёдом: поддержать больного простудой ---
    if (eff.tea) {
      if (!invTake(id)) return false;
      var n = p.needs;
      if (n) n.thirst = clamp((n.thirst || 0) + 35, 0, 100);
      if (eff.sanity && n) n.sanity = clamp(n.sanity + eff.sanity, 0, 100);
      if (p.sick && p.sick.id === 'cold' && invCount('honey_jar') > 0) {
        invTake('honey_jar');
        p.sick.tea = true;
        msg('Чай с мёдом. Хворь отступит быстрее', 'good');
      } else {
        msg('Горячий чай', 'good');
      }
      snd('drink', 0.7);
      return true;
    }

    // --- мёд отдельно: подсластить болезнь ---
    if (eff.sickBoost && p.sick && p.sick.id === eff.sickBoost) {
      if (!invTake(id)) return false;
      p.sick.tea = true;
      msg('Мёд перехочется — выздоровеешь быстрее', 'good');
      snd('eat', 0.7);
      return true;
    }

    // --- чага: общий тонус + стойкость к хвори ---
    if (eff.resist) {
      if (!invTake(id)) return false;
      p._chagaT = (p._chagaT || 0) + eff.resist;   // часов защиты
      if (eff.heal) healHp(p, eff.heal);
      msg('Чага укрепляет силы', 'good');
      snd('eat', 0.6);
      return true;
    }

    // --- зелье скорости («Ёрш-Драйв» из экспедиций) ---
    if (eff.zoom) {
      if (!invTake(id)) return false;
      p._zoomT = (p._zoomT || 0) + eff.zoom;      // секунд полёта
      try { WS.Ev.emit('player:heal', { kind: 'potion_zoom', sec: eff.zoom }); } catch (e) { /* пусто */ }
      msg('Ёрш-Драйв! Ноги сами несут', 'good');
      snd('drink', 0.7);
      return true;
    }

    // --- анальгетики (аспирин/лауданум/морфин/водка) ---
    if (eff.painkill !== undefined) {
      if ((p.pain || 0) < 10) {
        msg('Боли нет — таблетки впрок не идут', 'info');
        return false;
      }
      if (!invTake(id)) return false;
      p.pain = clamp(p.pain - eff.painkill, 0, 100);
      if (eff.drunk) p.drunk = clamp(p.drunk + eff.drunk, 0, 100);
      if (eff.sanity && p.needs) {
        p.needs.sanity = clamp(p.needs.sanity + eff.sanity, 0, 100);
      }
      try { WS.Ev.emit('health:pain', { pain: p.pain, level: 0, accPen: accPenalty(), med: id }); }
      catch (e) { /* пусто */ }
      msg(id === 'morphine' ? 'Морфий. Боль уходит волной' :
          id === 'laudanum' ? 'Лауданум. Тепло разливается по телу' :
          id === 'vodka' ? 'Водка. Теплеет' : 'Аспирин. Боль тупеет', 'good');
      snd(id === 'vodka' ? 'drink' : 'drink', 0.7);
      return true;
    }

    // --- антисептики (йод/карболка) ---
    if (eff.disinfect !== undefined) {
      if (p.infection <= 0 && !(p.wound && !p.wound.treated)) {
        msg('Раны чисты', 'info');
        return false;
      }
      if (!invTake(id)) return false;
      disinfect(eff.disinfect);
      if (eff.pain) addPain(p, eff.pain);
      msg(id === 'iodine_tincture' ? 'Йод обжигает рану' : 'Карболовая кислота — рана чиста', 'info');
      snd('drink', 0.5);
      return true;
    }

    // --- простое лечение (еда-лекарства вроде чаги без resist) ---
    if (eff.heal !== undefined) {
      if (!invTake(id)) return false;
      healHp(p, eff.heal);
      msg('Полегчало', 'good');
      snd('eat', 0.6);
      return true;
    }

    msg('Это не лекарство', 'warn');
    return false;
  }

  /**
   * Перевязка (по ТЗ): bandage -> bleed = 0 и heal +12;
   * bandage_clean -> ещё и infection -30. Возвращает true при успехе.
   */
  function bandage(itemId) {
    var p = P();
    if (!p) return false;
    itemId = itemId || 'bandage';
    var eff = medEffects(itemId);
    if (!eff.stopBleed) { msg('Это не перевязочный материал', 'warn'); return false; }
    if (invCount(itemId) < 1) { msg('Нет перевязки', 'warn'); return false; }

    var need = (p.bleed > 0) || (p.wound && !p.wound.treated);
    if (!need) { msg('Перевязывать нечего', 'info'); return false; }

    if (!invTake(itemId)) return false;

    // остановка крови
    if (p.bleed > 0) {
      p.bleed = 0;
      msg('Кровь остановлена', 'good');
    }
    // рана закрыта: больше не гниёт
    if (p.wound) {
      p.wound.treated = true;
      p.wound.dirty = false;
    }
    // чистая повязка тянет инфекцию вниз
    if (eff.disinfect) {
      p.infection = clamp(p.infection - eff.disinfect, 0, INFECT_SEPSIS);
    }
    // лечение (медицина улучшает перевязку на 10%/уровень)
    if (eff.heal) healHp(p, eff.heal * (1 + Math.min(0.5, medicLv() * 0.1)));
    snd('craft', 0.5);
    try { WS.Ev.emit('player:heal', { kind: 'bandage', item: itemId }); } catch (e) { /* пусто */ }
    return true;
  }

  /** Антисептик: «сброс до 20» (по ТЗ), ниже — лечение до нуля. */
  function disinfect(power) {
    var p = P();
    if (!p) return;
    if (p.infection > 20) {
      p.infection = Math.max(20, p.infection - power);
    } else {
      p.infection = Math.max(0, p.infection - power);
    }
    // свежая рана заодно обеззаражена
    if (p.wound) p.wound.dirty = false;
  }

  /** Лечение hp с событием. */
  function healHp(p, amount) {
    if (amount <= 0) return;
    var was = p.hp;
    p.hp = clamp(p.hp + amount, 0, p.maxHp);
    if (p.hp > was) {
      try { WS.Ev.emit('player:heal', { amount: p.hp - was }); } catch (e) { /* пусто */ }
    }
  }

  // ====================================================================
  //  СКОРОСТЬ И ВЫНОСЛИВОСТЬ
  //  player.js читает p.speed/breath; мы аккуратно штрафуем и так же
  //  аккуратно снимаем штраф, не мешая чужим модулям (лыжи и т.п.):
  //  пока штрафа нет — p.speed не трогаем и запоминаем «свободную» базу.
  // ====================================================================

  /** Итоговый множитель скорости от состояний (0.4..1). */
  function moveMul(p) {
    var mul = 1;
    if (p.fracture) {
      if (p.fracTreat && p.fracTreat.mode === 'cast') mul *= FRAC_SPEED_CAST;
      else if (p.fracTreat && p.fracTreat.mode === 'splint') mul *= FRAC_SPEED_SPLINT;
      else mul *= FRAC_SPEED;
    }
    if ((p.pain || 0) > PAIN_SPEED_AT) mul *= (1 - PAIN_SPEED_PEN);
    return clamp(mul, 0.3, 1);
  }

  /** Применить штрафы скорости (каждый тик). */
  function applySpeed(p) {
    var mul = moveMul(p);
    // «Ёрш-Драйв»: бафф скорости поверх штрафов (перелом и боль гасят его,
    // но не полностью). База не затирается — по завершении вернём её.
    var zoom = (p._zoomT || 0) > 0 ? ZOOM_MOVE_MUL : 1;
    mul = mul * zoom;
    if (mul >= 1) {
      // штрафа нет: если мы раньше меняли — вернуть базу
      if (p._hSpdApplied) {
        p.speed = p._hSpdBase;
        p._hSpdApplied = false;
      }
      if (mul > 1) {
        // чистый бафф: поднять скорость, базу помним и НЕ затираем
        if (typeof p._hSpdBase !== 'number' || p._hSpdBase <= 0) {
          p._hSpdBase = (typeof p.speed === 'number' && p.speed > 0) ? p.speed : 2.2;
        }
        p.speed = p._hSpdBase * mul;
        p._hSpdApplied = true;                 // бафф спадёт — вернём базу
        return;
      }
      // запоминаем «свободную» скорость (её могли сменить лыжи и т.п.)
      if (typeof p.speed === 'number' && p.speed > 0.5) p._hSpdBase = p.speed;
      return;
    }
    if (typeof p._hSpdBase !== 'number' || p._hSpdBase <= 0) {
      p._hSpdBase = (typeof p.speed === 'number' && p.speed > 0) ? p.speed : 2.2;
    }
    p.speed = p._hSpdBase * mul;
    p._hSpdApplied = true;
  }

  /** Перелом: бежать нельзя — зажимаем дыхание чуть ниже порога бега. */
  function applySprintLock(p) {
    if (p.fracture && typeof p.breath === 'number') {
      if (p.breath > FRAC_NO_SPRINT_BREATH) p.breath = FRAC_NO_SPRINT_BREATH;
    }
  }

  // ====================================================================
  //  РЕГЕНЕРАЦИЯ
  // ====================================================================

  /** +0.5 hp/час при hunger > 50 и отсутствии ран (по ТЗ). */
  function tickRegen(p, gh) {
    if (p.hp >= p.maxHp) return;
    if (p.fracture) return;
    if (p.bleed > 0) return;
    if (p.infection >= 10) return;
    if (p.sick && p.sick.id !== 'cold') return;
    var n = p.needs;
    if (!n || (n.hunger || 0) <= HP_REGEN_HUNGER) return;
    healHp(p, HP_REGEN_H * gh);
  }

  // ====================================================================
  //  ГЛАВНЫЙ ТИК (40)
  //  Порядок: кровь -> раны/инфекция -> перелом -> боль -> опьянение ->
  //  болезнь -> регенерация -> скорость/дыхание -> смерть -> подсказки.
  // ====================================================================

  function update(dt) {
    var g = G();
    if (!g || !g.running || g.dead) return;
    var p = g.player;
    if (!p) return;
    if (p.hp <= 0 && g.dead) return;

    // таймер игрового времени: дельта totalMin (сон x8 учитывается сам)
    var tm = WS.Time.totalMin();
    if (lastTotalMin < 0) lastTotalMin = tm;
    var dmin = tm - lastTotalMin;
    lastTotalMin = tm;
    if (dmin < 0) dmin = 0;
    var gh = dmin / 60;          // игровых часов
    var rs = dt;                 // реальных секунд симуляции

    // 1) кровотечение и следы
    tickBleed(p, gh, rs);

    // 2) раны и инфекция
    tickWound(p, gh);
    tickInfection(p, gh);

    // 3) перелом: лечение и боль
    if (p.fracture && p.fracTreat) progressFracture(p, gh);

    // 4) боль: затухание/пол
    tickPain(p, gh);

    // 5) опьянение
    tickDrunk(p, gh, rs);

    // 6) чага: таймер стойкости
    if (p._chagaT > 0) p._chagaT = Math.max(0, p._chagaT - gh);

    // 6.5) «Ёрш-Драйв»: зелье скорости тает реальными секундами
    if (p._zoomT > 0) p._zoomT = Math.max(0, p._zoomT - rs);

    // 7) болезнь
    tickSick(p, gh);

    // 8) регенерация
    tickRegen(p, gh);

    // 9) скорость и запрет бега
    applySpeed(p);
    applySprintLock(p);

    // 10) статистика «на волосок от смерти»
    if (g.stats && p.hp > 0 && p.hp < 30) {
      var cc = Math.round(100 - p.hp);
      if (cc > (g.stats.closestCall || 0)) g.stats.closestCall = cc;
    }

    // 11) критические подсказки (антиспам внутри msgOnce)
    warnCritical(p);
  }

  /** Тик боли: естественное затухание, но не ниже «пола» состояний. */
  function tickPain(p, gh) {
    var fl = painFloor(p);
    if (p.pain < fl) {
      p.pain = Math.min(fl, p.pain + PAIN_RISE_TO_FLOOR_H * gh);
    } else if (p.pain > fl) {
      var decay = isSleeping() ? PAIN_DECAY_SLEEP_H : PAIN_DECAY_H;
      p.pain = Math.max(fl, p.pain - decay * gh);
    }
  }

  /** Подсказки при критических состояниях (по ТЗ: экранные подсказки). */
  function warnCritical(p) {
    if (p.hp < 30) msgOnce('hpLow', 'Смерть близко. Перевяжись и согрейся', 'bad', 20);
    if (p.bleed >= 5) msgOnce('bleedBad', 'Кровь не остановить — нужна перевязка!', 'bad', 10);
    if (p.bleed > 0 && p.bleed < 5) msgOnce('bleed', 'Рана кровоточит', 'warn', 40);
    if (p.fracture && !p.fracTreat) msgOnce('frac', 'Нога сломана — нужен гипс или шина', 'bad', 60);
    if (p.infection >= INFECT_BAD_AT) msgOnce('infCrit', 'Заражение! Без антисептика — смерть', 'bad', 30);
    if (p.drunk >= DRUNK_POISON_AT) msgOnce('drunkBad', 'Отравление алкоголем', 'bad', 30);
  }

  // ====================================================================
  //  ЧАСОВЫЕ ДЕЛА (подписка на 'time:hour')
  //  Редкие события, которым достаточно часового разрешения.
  // ====================================================================

  function onHour(ev) {
    var g = G();
    if (!g || !g.running || g.dead) return;
    var p = g.player;
    if (!p) return;

    // лихорадка от инфекции: шанс перейти в болезнь fever
    if (p.infection >= 50 && !p.sick && Math.random() < 0.10) {
      infectDisease('fever');
    }

    // напоминание об открытой ране: 4 часа без перевязки — гниёт
    if (p.wound && !p.wound.treated && p.wound.t > 2.5) {
      msgOnce('woundOpen', p.wound.dirty
        ? 'Грязная рана гниёт. Промой и перевяжи'
        : 'Рана открыта. Перевяжи, пока не воспалилась', 'warn', 90);
    }

    // глубокой ночью болезнь тревожит сон (для атмосферы)
    if (p.sick) {
      var h = ev && ev.hour !== undefined ? ev.hour : 12;
      if (h === 20) msgOnce('sickEvening', 'Болезнь тянет ко сну. Ложись пораньше', 'warn', 300);
    }
  }

  // ====================================================================
  //  СЛУЖЕБНЫЕ ОБРАБОТЧИКИ ПАРТИИ
  // ====================================================================

  function onGameStart() {
    lastTotalMin = -1;
    bloodFxT = 0;
    poolAcc = 0;
    lastPos = null;
    stumbleCd = 0;
    vomitT = 0;
    toastCd = {};
    pools.length = 0;
    normalize();
    var g = G();
    if (g) g._dmgHooked = true;    // глушим fallback-обработчики урона
  }

  function onGameLoad() {
    onGameStart();
  }

  // ====================================================================
  //  ПУБЛИЧНЫЙ API МОДУЛЯ
  //  status() — для HUD; useMed/bandage — для инвентаря;
  //  accPenalty/moveMul — для combat (B3) и движения; DISEASES — реестр.
  // ====================================================================

  var Health = {

    DISEASES: DISEASES,

    /** HUD-сводка (по ТЗ): {hp, bleed, fracture, infection, pain, sick, drunk}. */
    status: function () {
      var p = P();
      if (!p) return null;
      var sk = p.sick;
      return {
        hp: Math.round(p.hp),
        maxHp: p.maxHp,
        bleed: Math.round(p.bleed * 10) / 10,
        fracture: !!p.fracture,
        fracTreat: p.fracTreat ? {
          mode: p.fracTreat.mode,
          left: Math.round(p.fracTreat.left),
          total: p.fracTreat.total
        } : null,
        infection: Math.round(p.infection),
        pain: Math.round(p.pain),
        sick: sk ? (DISEASES[sk.id] ? DISEASES[sk.id].name : sk.id) : null,
        sickId: sk ? sk.id : null,
        sickT: sk ? Math.round(sk.t) : 0,
        sickDur: sk && DISEASES[sk.id] ? DISEASES[sk.id].dur : 0,
        drunk: Math.round(p.drunk),
        wound: p.wound ? {
          hours: Math.round(p.wound.t * 10) / 10,
          dirty: !!p.wound.dirty,
          treated: !!p.wound.treated
        } : null,
        accPen: accPenalty(),
        speedMul: moveMul(p)
      };
    },

    /** Перевязка: bandage / bandage_clean (по ТЗ). */
    bandage: bandage,

    /** Применить любой медикамент (инвентарь зовёт это). */
    useMed: useMed,

    /** Быстрая шина из доски и тряпки (без крафта, «на коленке»). */
    splintFromPlanks: splintFromPlanks,

    /** Штраф точности 0..0.6 для combat (B3). */
    accPenalty: accPenalty,

    /** Множитель скорости 0.3..1 (для UI и проверки). */
    moveMul: function () { var p = P(); return p ? moveMul(p) : 1; },

    /**
     * Текстовый отчёт о здоровье одной строкой (консоль/дневник/UI):
     * «hp 74, кровотечение 2.1, инфекция 12, боль 30, трезв».
     */
    report: function () {
      var st = Health.status();
      if (!st) return 'нет партии';
      var s = 'hp ' + st.hp + '/' + st.maxHp;
      if (st.bleed > 0) s += ', кровотечение ' + st.bleed.toFixed(1);
      if (st.infection > 0) s += ', инфекция ' + st.infection;
      if (st.fracture) {
        s += ', перелом';
        if (st.fracTreat) {
          s += ' (' + (st.fracTreat.mode === 'cast' ? 'гипс' : 'шина') +
               ', осталось ' + Math.ceil(st.fracTreat.left / 60) + ' ч покоя)';
        }
      }
      if (st.wound && !st.wound.treated) s += ', рана открыта' + (st.wound.dirty ? ' (грязная)' : '');
      if (st.pain >= 15) s += ', боль ' + st.pain;
      if (st.sick) s += ', ' + st.sick.toLowerCase();
      if (st.drunk >= 15) s += ', пьян ' + st.drunk + '%';
      return s;
    },

    /** Заразить болезнью (для тестов и сюжетных событий). */
    infectDisease: infectDisease,

    /** Причинить урон напрямую (обёртка над событием, для тестов). */
    damage: function (amount, type, src) {
      try { WS.Ev.emit('player:damage', { amount: amount, type: type, src: src }); }
      catch (e) { WS.err('health damage emit', e); }
    },

    /** Сломать ногу (тесты/сюжет). */
    breakLeg: function () { var p = P(); if (p) setFracture(p); },

    /** Тик модуля (для консольной отладки и тестов). */
    update: update,

    // ------------------------------------------------------------------
    //  САМОТЕСТ (консоль: WS.Health.selftest())
    // ------------------------------------------------------------------

    selftest: function () {
      var out = [];
      var ok = function (name, cond) {
        out.push((cond ? '  ok  ' : ' FAIL ') + name);
        return !!cond;
      };
      ok('реестр болезней: 4', (function () {
        var n = 0;
        for (var k in DISEASES) if (DISEASES.hasOwnProperty(k)) n++;
        return n === 4;
      })());
      ok('болезни валидны', (function () {
        for (var k in DISEASES) {
          if (!DISEASES.hasOwnProperty(k)) continue;
          var D = DISEASES[k];
          if (!D.name || !(D.dur > 0) || !D.symptoms || !D.symptoms.length) return false;
        }
        return true;
      })());
      ok('типы урона описаны', !!(DMG_TYPES.bite && DMG_TYPES.bullet && DMG_TYPES.blunt));

      if (WS.G && WS.G.player) {
        var p = WS.G.player;
        var keep = {
          hp: p.hp, bleed: p.bleed, pain: p.pain, fracture: p.fracture,
          sick: p.sick, infection: p.infection, drunk: p.drunk,
          wound: p.wound, fracTreat: p.fracTreat, speed: p.speed,
          breath: p.breath, _hSpdBase: p._hSpdBase, _hSpdApplied: p._hSpdApplied
        };
        normalize();
        ok('normalize: поля на месте', typeof p.bleed === 'number' && typeof p.pain === 'number');

        // handled-паттерн: второй вызов не применяет урон дважды
        p.hp = 100; p.bleed = 0; p.pain = 0;
        var d1 = { amount: 10, type: 'bite' };
        onDamage(d1);
        var hp1 = p.hp;
        ok('урон применяется', hp1 === 90);
        onDamage(d1);
        ok('handled-паттерн: дубль не проходит', p.hp === hp1);
        ok('укус грязнит рану', !!(p.wound && p.wound.dirty));
        ok('укус усиливает кровотечение', p.bleed > 0);

        // слепая: bullets дают +4 кровотечения (по ТЗ)
        p.hp = 100; p.bleed = 0; p.wound = null; p.pain = 0; p.infection = 0;
        onDamage({ amount: 20, type: 'bullet' });
        ok('пуля: bleed ~4', p.bleed >= 3.2 && p.bleed <= 5.2);
        ok('пуля: боль ~11', p.pain >= 9 && p.pain <= 15);

        // причины смерти: карта по типу и по напавшему (без вызова Main.die)
        ok('причина: волк', deathCause('bite', { kind: 'wolf' }) === DEATH_BY_KIND.wolf);
        ok('причина: медведь', deathCause('claw', { kind: 'bear' }) === DEATH_BY_KIND.bear);
        ok('причина: без источника', deathCause('bullet', null, DMG_TYPES.bullet) === DMG_TYPES.bullet.cause);
        ok('причина: мороз', deathCause('frost', null, DMG_TYPES.frost) === 'замёрз насмерть');

        // смерть не дублируется: при g.dead die() тихо выходит
        var g = WS.G;
        var wasDead = g.dead, runBefore = g.running;
        g.dead = true;
        die('тест');
        ok('die() при g.dead — без побочных эффектов', g.running === runBefore);
        g.dead = wasDead;

        // восстановление состояния партии
        p.hp = keep.hp; p.bleed = keep.bleed; p.pain = keep.pain;
        p.fracture = keep.fracture; p.sick = keep.sick;
        p.infection = keep.infection; p.drunk = keep.drunk;
        p.wound = keep.wound; p.fracTreat = keep.fracTreat;
        p.speed = keep.speed; p.breath = keep.breath;
        p._hSpdBase = keep._hSpdBase; p._hSpdApplied = keep._hSpdApplied;

        // статус для HUD
        var st = Health.status();
        ok('status() для HUD', !!st && typeof st.hp === 'number' &&
            typeof st.bleed === 'number' && typeof st.fracture === 'boolean' &&
            typeof st.infection === 'number' && typeof st.pain === 'number' &&
            (st.sick === null || typeof st.sick === 'string') &&
            typeof st.drunk === 'number');

        // антисептик: «сброс до 20» (по ТЗ)
        p.infection = 60;
        disinfect(55);
        ok('йод: с 60 сброс до 20', p.infection === 20);
        p.infection = 100;
        disinfect(55);
        ok('йод: со 100 сильно вниз, но не ниже 20', p.infection === 45);
        p.infection = 10;
        disinfect(55);
        ok('йод: лёгкое заражение уходит в ноль', p.infection === 0);

        // перевязка: без раны отказ, с раной — лечит
        p.bleed = 0; p.wound = null; p.hp = 50;
        ok('перевязка без раны — отказ', bandage('bandage') === false);
        p.bleed = 3;
        var hasBand = invCount('bandage') > 0;
        var expectHeal = 12 * (1 + Math.min(0.5, medicLv() * 0.1));
        var bres = bandage('bandage');
        if (hasBand) {
          ok('перевязка прошла', bres === true);
          ok('перевязка: bleed = 0', p.bleed === 0);
          ok('перевязка: hp +' + expectHeal.toFixed(0), Math.abs(p.hp - (50 + expectHeal)) < 0.01);
        } else {
          out.push('  --   нет bandage: проверка перевязки пропущена');
        }
        p.bleed = keep.bleed; p.wound = keep.wound; p.hp = keep.hp;

        // болезнь: заражение и течение не роняют
        p.sick = null;
        infectDisease('cold');
        ok('infectDisease: простуда началась', !!(p.sick && p.sick.id === 'cold'));
        ok('повторное заражение игнорируется', infectDisease('flu') === false);
        p.sick.t = 40;   // проскочить длительность
        tickSick(p, 0.01);
        ok('выздоровление по истечении', !p.sick);

        // скорость: перелом замедляет, снятие — возвращает
        p.fracture = true; p.fracTreat = null; p.pain = 0; p._hSpdBase = 2.2;
        applySpeed(p);
        ok('перелом: скорость 0.45', Math.abs(p.speed - 2.2 * 0.45) < 0.001);
        p.fracTreat = { mode: 'cast', left: 60, total: 480 };
        applySpeed(p);
        ok('гипс: скорость 0.6', Math.abs(p.speed - 2.2 * 0.6) < 0.001);
        p.fracture = false; p.fracTreat = null;
        applySpeed(p);
        ok('выздоровел: скорость вернулась', Math.abs(p.speed - 2.2) < 0.001);

        // бег с переломом запрещён: дыхание зажимается ниже порога
        p.fracture = true; p.breath = 1.0;
        applySprintLock(p);
        ok('перелом: дыхание зажато (бега нет)', p.breath <= 0.14);
        p.fracture = false; p.breath = 1.0;
        applySprintLock(p);
        ok('здоров: дыхание свободно', p.breath > 0.9);

        // accPenalty в диапазоне
        var ap = Health.accPenalty();
        ok('accPenalty в [0,0.6]', ap >= 0 && ap <= 0.6);

        // текстовый отчёт (для консоли/дневника)
        ok('report() — строка', typeof Health.report() === 'string' && Health.report().length > 5);
      } else {
        out.push('  --   нет WS.G (в меню): партийные проверки пропущены');
      }
      return out;
    }
  };

  // ====================================================================
  //  BOOT
  //  Подписки: урон (handled), шанс болезни от Needs (B1), часы, партия.
  //  Тик 40 — «системы», до игрока (60) и рендера.
  // ====================================================================

  WS.boot(function initHealth() {
    WS.tick(TICK_PRI, update, 'health');

    // урон игроку: единственный владелец применения (handled-паттерн)
    WS.Ev.on('player:damage', onDamage);

    // шанс болезни от Needs (B1): мокрый+холод, испорченная еда
    WS.Ev.on('player:sick_chance', onSickChance);

    // часовые события
    WS.Ev.on('time:hour', onHour);

    // партия: сброс модульного состояния и нормализация игрока
    WS.Ev.on('game:start', onGameStart);
    WS.Ev.on('game:load', onGameLoad);

    // страховка: если партия уже идёт к моменту boot (не должно быть)
    if (WS.G && WS.G.running) onGameStart();

    WS.log('health: тик ' + TICK_PRI + ', урон/кровь/перелом/инфекция/болезни');
  }, 'health:init');

  // ====================================================================
  //  КОНТРАКТ МОДУЛЯ (для параллельных агентов)
  //  ------------------------------------------------------------------
  //  B1 temperature.js (обморожение — ЕГО поле p.frostbite, мы не трогаем):
  //    читает WS.Weather.tempOutside()/windLevel(); про урон мороза шлёт
  //    'player:damage' {type: 'frost'} — мы применяем без кровотечения.
  //  B1 Needs (нужды): шлёт 'player:sick_chance' {chance, kind, disease}
  //    для заболеваний от холода/сырости/испорченной еды — ролл здесь;
  //    базовый расход нужд — его, наши болезни лишь добавляют сверху
  //    (fatigueH/sanityH/hungerH/thirstH в DISEASES).
  //  B3 combat.js: читает WS.Health.accPenalty() (0..0.6) и слушает
  //    'health:pain' {pain, level, accPen} на порогах 25/50/75.
  //  UI: полоски из WS.Health.status(); применение лекарств —
  //    WS.Health.useMed(id) / bandage(id) / splintFromPlanks().
  //  Инвентарь: расход предметов идёт через WS.Action.consume (если
  //    подключён), иначе напрямую из p.inv.
  //  События, которые мы эмитим: 'player:heal' {amount|kind},
  //    'health:sick' {id}, 'health:healed' {id}, 'health:pain',
  //    'blood' {x, y, r} (запах крови для ИИ волков).
  //  Поля игрока, которыми владеем: hp/maxHp, bleed, fracture, fracTreat,
  //    infection, pain, drunk, sick, wound, _chagaT, _bloodLost,
  //    _hSpdBase/_hSpdApplied. Скорость: штрафуем p.speed и возвращаем
  //    обратно; дыхание: при переломе зажимаем ниже порога бега.
  // ====================================================================

  WS.def('Health', Health);
})();
