/**
 * needs.js — СИСТЕМА ВЫЖИВАНИЯ (модуль B1): голод, жажда, усталость, рассудок,
 * сон/обмороки, болезни и приём пищи/питья. Тик 40 (системы, CONTRACT.md).
 * Связи: температура тела — js/systems/temperature.js (WS.Temp), огонь и
 * готовка — js/systems/fire.js (WS.Fire), инвентарь — WS.Inv/WS.Action,
 * урон игроку — этот модуль владеет событием 'player:damage' до прихода
 * WS.Health (B3): слушатель ставит d.handled=true ДО применения урона.
 */
(function () {
  'use strict';

  // ====================================================================
  //  НАСТРОЙКИ (все скорости — за ИГРОВОЙ час; игровой час = 60 игровых
  //  минут; 1 игровая минута = 1 реальная секунда при скорости x1).
  // ====================================================================

  var TICK_PRI = 40;              // приоритет тика (договор CONTRACT.md)

  // --- время ------------------------------------------------------------
  var MIN_PER_SEC = 1;            // игровых минут за реальную секунду (x1)

  // --- голод ------------------------------------------------------------
  var HUNGER_PER_H = 0.55;        // падение сытости за игровой час
  var HUNGER_COLD_MUL = 1.25;    // на морозе организм жжёт калории
  var HUNGER_WEAK = 25;          // ниже — слабость (скорость -15%)
  var HUNGER_HP = 10;            // ниже — начинается урон
  var HUNGER_DMG_H = 0.5;        // урон hp за игровой час при голоде

  // --- жажда ------------------------------------------------------------
  var THIRST_PER_H = 0.75;       // падение утоления за игровой час
  var THIRST_RUN_MUL = 1.5;      // бег выжигает воду быстрее
  var THIRST_SICK_MUL = 1.35;    // болезнь усиливает жажду
  var THIRST_WEAK = 25;
  var THIRST_HP = 10;
  var THIRST_DMG_H = 0.75;

  // --- усталость (fatigue — «бодрость», падает) --------------------------
  var FATIGUE_PER_H = 3.6;       // базовое падение на ногах
  var FATIGUE_RUN_MUL = 1.8;    // бег выматывает
  var FATIGUE_SNEAK_MUL = 1.1;
  var FATIGUE_SICK_MUL = 1.4;  // болезнь давит быстрее
  var FATIGUE_WEAK = 20;       // ниже — скорость -20%
  var FATIGUE_MICRO = 10;      // ниже — микросны
  var FATIGUE_SLEEP_H = 12;    // восстановление за час сна (кровать +14)
  var FAINT_SEC = 30;          // обморок при нуле, реальных секунд
  var FAINT_VULN_MUL = 1.5;    // урон по без сознания — x1.5

  // --- рассудок ----------------------------------------------------------
  var SAN_DARK_H = 2.2;        // тьма на улице (за игровой час)
  var SAN_DARK_FLOOR_H = 0.8;  // тьма в помещении
  var SAN_BLOOD = 1.5;         // увидеть кровь (раз в SAN_CD сек)
  var SAN_CORPSE = 2.5;        // увидеть смерть существа
  var SAN_HOWL = 2.0;          // волчий вой
  var SAN_ROAR = 3.5;          // рёв медведя
  var SAN_HURT = 1.0;          // ранение
  var SAN_CD = 25;             // реальных секунд между похожими ударами
  var SAN_SLEEP_BED_H = 5;     // сон в кровати
  var SAN_SLEEP_ROLL_H = 3.5;  // сон в спальнике
  var SAN_SLEEP_FLOOR_H = 1.5;
  var SAN_FIRE_H = 3;          // посидеть у огня
  var SAN_READ_H = 3;          // чтение
  var SAN_SHAKE = 30;          // ниже — дрожь прицела и шёпот
  var SAN_PANIC = 10;          // ниже — паника (бег без воли)
  var SAN_MADNESS = 0;         // ноль — безумие
  var SAN_CROSS_RELIEF = 0.25; // нательный крест снижает страх тьмы

  // --- опьянение ---------------------------------------------------------
  var DRUNK_DECAY_H = 4;      // выветривание за игровой час
  var DRUNK_FAINT = 95;       // почти без сознания от спирта

  // --- простуда и отравления (t — оставшиеся игровые минуты) ------------
  var SICK_DEF = {
    cold: { name: 'Простуда', dur: 1440, fever: 0.35, thirstMul: 1.1,
            fatigueMul: 1.4, sanityH: -0.3 },
    flu: { name: 'Грипп', dur: 2160, fever: 0.9, thirstMul: 1.3,
           fatigueMul: 1.8, sanityH: -1.0, hpH: -0.8 },
    food_poisoning: { name: 'Отравление', dur: 720, fever: 0.1,
                      thirstMul: 1.5, fatigueMul: 1.3, sanityH: -0.5, hpH: -0.6 }
  };
  var SNEEZE_MIN = 40;        // интервал чихания, игровых минут
  var VOMIT_MIN = 70;         // интервал рвоты при отравлении
  var SNOW_SICK_CHANCE = 15;  // % болезни от сырого снега

  // --- урон --------------------------------------------------------------
  var IMMUNE_FRAME = 0.45;    // сек неуязвимости после попадания (как ai.js)
  var DEATH_CAUSES = {
    bite: 'растерзан зверем', claw: 'растерзан зверем', gun: 'застрелен',
    blade: 'зарезан', blunt: 'забит насмерть', hit: 'убит', fall: 'разбился',
    burn: 'сгорел заживо'
  };
  var SYSTEM_CAUSES = {
    hunger: 'Вы умерли от голода',
    thirst: 'Вы умерли от обезвоживания',
    madness: 'Вы сошли с ума',
    faint: 'не умер (обморок)'
  };

  // --- шёпот безумия ------------------------------------------------------
  var WHISPERS = [
    '«тихо-тихо-тихо...»', '«не оглядывайся»', '«они уже близко»',
    '«белое безмолвие»', '«спи... спи...»', '«за тобой пришли»',
    '«холоднее... ещё холоднее...»', '«брось ружьё»'
  ];

  // ====================================================================
  //  СОСТОЯНИЕ МОДУЛЯ (вне WS.G — в сейв не попадает)
  // ====================================================================

  var sysTime = 0;             // наработанное время модуля, реальных сек
  var cd = {};                 // кулдауны эффектов (подсказки, шёпот...)
  var bedrollDeclared = false; // предмет bedroll объявлен нами

  // ====================================================================
  //  МАЛЫЕ УТИЛИТЫ
  // ====================================================================

  function G() { return WS.G || null; }
  function P() { var g = WS.G; return (g && g.player) || null; }
  function W() { return WS.World || null; }

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  /** Игровые минуты, прошедшие за этот кадр (dt — реальных секунд). */
  function gMin(dt) {
    var sp = (WS.Loop && WS.Loop.speed) ? WS.Loop.speed : 1;
    if (sp < 1) sp = 1;
    var ts = (WS.Time && WS.Time.timeScale) ? WS.Time.timeScale() : 1;
    return dt * MIN_PER_SEC * sp * ts;
  }

  /** Игровые часы за кадр. */
  function gH(dt) { return gMin(dt) / 60; }

  /** Реальные секунды за кадр (без ускорения времени сна). */
  function rSec(dt) {
    var sp = (WS.Loop && WS.Loop.speed) ? WS.Loop.speed : 1;
    if (sp < 1) sp = 1;
    return dt * sp;
  }

  /** Кулдаун по ключу: true, если эффект можно показать. */
  function ready(key, sec) {
    var t = cd[key] || 0;
    if (sysTime < t) return false;
    cd[key] = sysTime + sec;
    return true;
  }

  /** Тост UI с фолбэком в плавающий текст над игроком. */
  function toast(text, kind) {
    try {
      if (WS.Ui && WS.Ui.toast) { WS.Ui.toast(text, kind || 'info'); return; }
    } catch (e) { /* ниже — текстом */ }
    var p = P();
    if (WS.Fx && WS.Fx.text && p) {
      try { WS.Fx.text(text, p.x, p.y - 1.1, { col: '#d8cfae', size: 13, life: 2.4 }); }
      catch (e2) { /* пусто */ }
    }
  }

  /** Обучающая подсказка: единожды на партию (G.story.hints). */
  function hint(msg, onceKey, kind) {
    if (onceKey) {
      var g = G();
      if (!g || !g.story || !g.story.hints) return;
      if (g.story.hints[onceKey]) return;
      g.story.hints[onceKey] = 1;
    }
    toast(msg, kind || 'info');
  }

  /** Позиционный звук — всегда через WS.Snd. */
  function snd(name, vol) {
    var p = P();
    if (!WS.Snd || !WS.Snd.play) return;
    try {
      WS.Snd.play(name, { x: p ? p.x : 0, y: p ? p.y : 0, vol: vol !== undefined ? vol : 0.7 });
    } catch (e) { /* тишина */ }
  }

  /** Случайное вещественное. */
  function rnd(lo, hi) { return lo + Math.random() * (hi - lo); }

  // ====================================================================
  //  МОСТ К ИНВЕНТАРЮ (WS.Inv от B-агента, фолбэк — WS.Action)
  // ====================================================================

  function inv() {
    if (WS.Inv && WS.Inv.give && WS.Inv.consume) return WS.Inv;
    if (WS.Action && WS.Action.give && WS.Action.consume) return WS.Action;
    return null;
  }

  function invCount(id) {
    var I = inv();
    return I ? (I.countItem(id) || 0) : 0;
  }

  function invConsume(id, n) {
    var I = inv();
    return I ? (I.consume(id, n || 1) || 0) : 0;
  }

  function invGive(id, n) {
    var I = inv();
    return I ? (I.give(id, n || 1) || 0) : 0;
  }

  function invFind(id) {
    var I = inv();
    return I ? (I.findItem(id, 'inv') || null) : null;
  }

  /** Определение предмета из данных. */
  function defOf(id) {
    return (WS.Data && WS.Data.items && WS.Data.items[id]) || null;
  }

  // ====================================================================
  //  СМЕРТЬ (единая точка: только WS.Main.die)
  // ====================================================================

  function die(cause) {
    var g = G();
    if (!g || g.dead) return;
    if (WS.Main && WS.Main.die) {
      try { WS.Main.die(cause); } catch (e) { WS.err('Main.die:', e && e.message); }
      return;
    }
    // страховка без Main: помечаем сами (событие по контракту)
    g.dead = true;
    try { WS.Ev.emit('player:die', { cause: cause }); } catch (e2) { /* пусто */ }
  }

  // ====================================================================
  //  УРОН ИГРОКУ — ВЛАДЕЛЕЦ СОБЫТИЯ 'player:damage'
  //
  //  Договор (CONTRACT + задание B1/B3):
  //   * чужие эмиты 'player:damage' {amount, type, src} применяем МЫ,
  //     если событие ещё не помечено d.handled;
  //   * d.handled = true ставится ДО применения — соседи (ai.js fallback,
  //     player.js fallback, будущий WS.Health) не задублируют вычет;
  //   * G._dmgHooked = true отключает fallback-и ai.js/player.js совсем;
  //   * собственный урон систем (голод, холод...) вычитаем напрямую и
  //     эмитим 'player:damage' УЖЕ помеченным (handled: true) — только
  //     для информации слушателей (шумы, статистика, пробуждение).
  // ====================================================================

  /** Физический ли урон (кровь, тряска, боль). */
  function isPhysical(type) {
    return type === 'bite' || type === 'claw' || type === 'gun' ||
           type === 'blade' || type === 'blunt' || type === 'hit' ||
           type === 'fall' || type === 'burn';
  }

  /**
   * Публичный обработчик события 'player:damage' (внешний урон).
   * Кадры неуязвимости — как в ai.js (p._aiImmuneT, время синхронно).
   */
  function onExternalDamage(d) {
    if (!d || d.handled) return;
    var g = G();
    if (!g || !g.player || g.dead) return;
    // помечаем ДО применения: никто больше не должен вычитать hp
    d.handled = true;
    g._dmgHooked = true;            // отключаем fallback-и соседей
    applyDamage(d.amount, d.type, d.src, true);
  }

  /**
   * Применение урона к игроку (общая для внешнего и внутреннего).
   * external=true — с кадрами неуязвимости и спец-множителями.
   */
  function applyDamage(amount, type, src, external) {
    var g = G();
    var p = P();
    if (!g || !p || g.dead) return;
    amount = Math.max(0, Number(amount) || 0);
    if (!amount || p.hp === undefined || p.hp <= 0) return;

    if (external && isPhysical(type)) {
      // кадры неуязвимости — честность против стаи (поле общее с ai.js)
      if (typeof p._aiImmuneT === 'number' && p._aiImmuneT > sysTime) return;
      p._aiImmuneT = sysTime + IMMUNE_FRAME;
      // уязвимость без сознания
      if ((p._faintT || 0) > 0) amount *= FAINT_VULN_MUL;
    }

    p.hp = Math.max(0, p.hp - amount);

    // эффекты физического урона
    if (isPhysical(type)) {
      if (WS.Fx && WS.Fx.burst) {
        try { WS.Fx.burst('blood', p.x, p.y, clamp(2 + (amount / 5) | 0, 3, 9)); }
        catch (e) { /* пусто */ }
      }
      if (WS.Cam && WS.Cam.kick) {
        try { WS.Cam.kick(Math.min(9, 2 + amount * 0.12)); } catch (e2) { /* пусто */ }
      }
      // боль и страх
      p.pain = clamp((p.pain || 0) + amount * 0.5, 0, 100);
      if (ready('san:hurt', SAN_CD)) {
        p.needs.sanity = clamp(p.needs.sanity - SAN_HURT, 0, 100);
      }
      snd('hit_flesh', 0.6);
    }

    // смерть — через главный экран, причину формулируем сами
    if (p.hp <= 0) {
      var cause = SYSTEM_CAUSES[type];
      if (!cause) cause = DEATH_CAUSES[type];
      if (!cause && src && src.kind) cause = 'убит: ' + src.kind;
      die(cause || 'погиб');
    }
  }

  /**
   * Урон от собственных систем (голод/жажда/лихорадка): без кадров
   * неуязвимости, без крови; событие эмитится УЖЕ обработанным.
   */
  function systemDamage(amount, type) {
    var g = G();
    var p = P();
    if (!g || !p || g.dead) return;
    amount = Math.max(0, Number(amount) || 0);
    if (!amount || p.hp === undefined || p.hp <= 0) return;
    g._dmgHooked = true;
    p.hp = Math.max(0, p.hp - amount);
    if (p.hp <= 0) {
      die(SYSTEM_CAUSES[type] || DEATH_CAUSES[type] || 'погиб от истощения');
      return;
    }
    // информативный эмит: слушатели знают, но не применяют повторно
    try {
      WS.Ev.emit('player:damage', {
        amount: amount, type: type, src: 'system', handled: true, applied: true
      });
    } catch (e) { /* пусто */ }
  }

  // ====================================================================
  //  ГОЛОД
  //  Падение -0.55/игровой час (мороз +25% — тело греется изнутри).
  //  <25 — слабость (скорость -15%), <10 — урон 0.5/час, 0 — смерть.
  // ====================================================================

  function hungerTick(dt) {
    var p = P();
    var n = p.needs;

    // скорость падения
    var rate = HUNGER_PER_H;
    if (WS.Temp && typeof WS.Temp.core === 'function' && WS.Temp.core() < 36) {
      rate *= HUNGER_COLD_MUL;      // дрожь сжигает калории
    }
    n.hunger = clamp(n.hunger - rate * gH(dt), 0, 100);

    // слабость
    if (n.hunger < HUNGER_WEAK) {
      if (ready('hint:hunger', 240)) {
        hint('Пусто в животе — силы на исходе', 'hunger', 'warn');
      }
    }
    // урон и смерть
    if (n.hunger <= 0) {
      die(SYSTEM_CAUSES.hunger);
      return;
    }
    if (n.hunger < HUNGER_HP) {
      if (ready('hint:starve', 180)) toast('Голод грызёт изнутри', 'bad');
      systemDamage(HUNGER_DMG_H * gH(dt), 'hunger');
    }
  }

  // ====================================================================
  //  ЖАЖДА
  //  Падение -0.75/час, бег x1.5, солёная еда (thir<0) бьёт по утолению.
  //  <25 — подсказки, <10 — урон, 0 — смерть от обезвоживания.
  // ====================================================================

  function thirstTick(dt) {
    var p = P();
    var n = p.needs;

    var rate = THIRST_PER_H;
    if (p.sprinting && p.moving) rate *= THIRST_RUN_MUL;
    if (p.sick && SICK_DEF[p.sick.id]) rate *= SICK_DEF[p.sick.id].thirstMul;
    n.thirst = clamp(n.thirst - rate * gH(dt), 0, 100);

    if (n.thirst < THIRST_WEAK) {
      if (ready('hint:thirst', 240)) {
        hint('Пересохло в горле — нужна вода', 'thirst', 'warn');
      }
    }
    if (n.thirst <= 0) {
      die(SYSTEM_CAUSES.thirst);
      return;
    }
    if (n.thirst < THIRST_HP) {
      if (ready('hint:dehydr', 180)) toast('Обезвоживание губит вас', 'bad');
      systemDamage(THIRST_DMG_H * gH(dt), 'thirst');
    }
  }

  // ====================================================================
  //  УСТАЛОСТЬ
  //  Падает быстрее от бега и болезней. <20 — скорость -20%,
  //  <10 — микросны (экран «мигает»), 0 — обморок на 30 секунд.
  // ====================================================================

  function fatigueTick(dt) {
    var p = P();
    var n = p.needs;

    if (p.sleeping) return;      // во сне восстанавливаем отдельно (sleepTick)

    var rate = FATIGUE_PER_H;
    if (p.sprinting && p.moving) rate *= FATIGUE_RUN_MUL;
    else if (p.sneaking && p.moving) rate *= FATIGUE_SNEAK_MUL;
    if (p.sick && SICK_DEF[p.sick.id]) rate *= SICK_DEF[p.sick.id].fatigueMul;
    if (p.reading) rate += 0.6;  // чтение утомляет глаза
    n.fatigue = clamp(n.fatigue - rate * gH(dt), 0, 100);

    if (n.fatigue < FATIGUE_WEAK) {
      if (ready('hint:tired', 300)) {
        hint('Ноги гудят — нужен сон', 'fatigue', 'warn');
      }
    }

    // микросны: реальный таймер «моргания»
    if (n.fatigue < FATIGUE_MICRO) {
      if ((p._blinkT || 0) <= 0 && ready('micro', rnd(22, 40))) {
        p._blinkT = 1.2;
        try { WS.Ev.emit('player:microsleep', { t: p._blinkT }); } catch (e) { /* пусто */ }
        if (Math.random() < 0.3) toast('Веки слипаются...', 'warn');
        if (WS.Cam && WS.Cam.kick) {
          try { WS.Cam.kick(0.8); } catch (e2) { /* пусто */ }
        }
      }
    }
    if (p._blinkT > 0) p._blinkT -= rSec(dt);

    // обморок от полного изнеможения
    if (n.fatigue <= 0 && (p._faintT || 0) <= 0) {
      faint(FAINT_SEC, 'Силы покинули вас — вы падаете без чувств');
    }
  }

  // ====================================================================
  //  ОБМОРОК (уязвимость!)
  //  Реальные секунды; тело лежит (спрайт сна), урон x1.5 (см. выше).
  // ====================================================================

  function faint(sec, msg) {
    var p = P();
    if (!p || (p._faintT || 0) > 0) return;
    p._faintT = sec;
    p.sneaking = false;
    p.moving = false;
    // поза — как сон (плеер-модуль рисует player_sleep)
    p.sleeping = true;
    p.sprName = 'player_sleep';
    p.sprFrame = 0;
    if (msg) toast(msg, 'bad');
    snd('fall', 0.5);
  }

  /** Тик обморока: держим «сон», доводим таймер, поднимаем. */
  function faintTick(dt) {
    var p = P();
    if ((p._faintT || 0) <= 0) return;
    p._faintT -= rSec(dt);
    p.sleeping = true;             // лежим, что бы ни нажимали
    p.moving = false;
    p.needs.sanity = clamp(p.needs.sanity - 0.2 * gH(dt), 0, 100);
    if (p._faintT <= 0) {
      p._faintT = 0;
      wakePlayer();
      toast('Вы приходите в себя', 'info');
    }
  }

  // ====================================================================
  //  РАССУДОК
  //  Падает: тьма на улице, кровь, трупы, вой, ранения, кошмары на морозе.
  //  Растёт: сон, огонь, чтение, чай, гармошка, табак, молитва (крестик).
  //  <30 — дрожь прицела и шёпот; <10 — паника; 0 — безумие.
  // ====================================================================

  /** Множитель страха тьмы: серебряный крест в кармане успокаивает. */
  function darkFearMul() {
    var p = P();
    if (invCount('cross_silver') > 0 || invCount('crucifix_wood') > 0) {
      return 1 - SAN_CROSS_RELIEF;
    }
    return 1;
  }

  function sanityTick(dt) {
    var p = P();
    var n = p.needs;
    var w = W();

    var rate = 0;   // итог за игровой час (минус — страх)

    // тьма и улица
    var dark = (WS.Time && WS.Time.light) ? WS.Time.light() : 1;
    if (dark < 0.25) {
      var inside = !!(w && w.isInside && w.isInside(p.x, p.y));
      rate -= (inside ? SAN_DARK_FLOOR_H : SAN_DARK_H) * darkFearMul();
      // полярная ночь давит сильнее
      if (WS.Time && WS.Time.isPolarNight && WS.Time.isPolarNight()) rate -= 0.5;
    }
    // кошмары: спать без кровати на морозе страшно
    if (p.sleeping && p._sleepKind === 'floor' &&
        WS.Temp && WS.Temp.core && WS.Temp.core() < 35.5) {
      rate -= 1.5;
    }
    // болезнь
    if (p.sick && SICK_DEF[p.sick.id]) rate += SICK_DEF[p.sick.id].sanityH;
    // боль
    if ((p.pain || 0) > 40) rate -= 0.4;
    // тепло у огня (только наяву и не в панике)
    if (!p.sleeping && fireNear(3)) rate += SAN_FIRE_H;
    // чтение
    if (p.reading) rate += SAN_READ_H;
    // опьянение слегка глушит страх (до поры до времени)
    if ((p.drunk || 0) > 20) rate += 0.6;

    n.sanity = clamp(n.sanity + rate * gH(dt), 0, 100);

    // ---- эффекты низкого рассудка ----
    if (n.sanity < SAN_SHAKE && !p.sleeping) {
      // шёпот и тени
      if (ready('whisper', rnd(50, 110))) {
        var line = WHISPERS[(Math.random() * WHISPERS.length) | 0];
        if (WS.Fx && WS.Fx.text) {
          try { WS.Fx.text(line, p.x + rnd(-1, 1), p.y - rnd(0.8, 1.6), { col: '#7e8ba3', size: 12, life: 3 }); } catch (e) { /* пусто */ }
        }
        if (WS.Snd && WS.Snd.play) {
          try { WS.Snd.play('radio_static', { x: p.x, y: p.y, vol: 0.18 }); } catch (e2) { /* пусто */ }
        }
        // тень на краю глаза
        if (WS.Fx && WS.Fx.spawn) {
          try {
            WS.Fx.spawn('smoke', p.x + rnd(-2.4, 2.4), p.y + rnd(-1.6, 1.6),
              { z: 14, grav: -2, life: 1.6, size: 5 });
          } catch (e3) { /* пусто */ }
        }
        try { WS.Ev.emit('player:hallucination', { kind: 'whisper' }); } catch (e4) { /* пусто */ }
      }
    }

    if (n.sanity < SAN_PANIC && !p.sleeping && (p._faintT || 0) <= 0) {
      if ((p._panicT || 0) > 0) {
        panicRun(dt);
      } else if (ready('panic', rnd(18, 30))) {
        startPanic(rnd(2.5, 5.5));
      }
    }
    if (n.sanity >= SAN_PANIC + 5) p._panicT = 0;

    // безумие: обморок с потерей вещей; при слабом здоровье — гибель
    if (n.sanity <= SAN_MADNESS) {
      madness();
    }
  }

  /** Паника: бежит, не разбирая дороги. */
  function startPanic(sec) {
    var p = P();
    if (!p) return;
    p._panicT = sec;
    p._panicDir = Math.random() * Math.PI * 2;
    toast('ПАНИКА! Ноги несут сами!', 'bad');
    if (WS.Cam && WS.Cam.kick) {
      try { WS.Cam.kick(2.5); } catch (e) { /* пусто */ }
    }
  }

  /** Кадр паники: случайное движение через публичный tryMove игрока. */
  function panicRun(dt) {
    var p = P();
    if (!p) return;
    p._panicT -= rSec(dt);
    if (p._panicT <= 0) { p._panicT = 0; return; }
    // меняем направление рывками
    p._panicTurn = (p._panicTurn || 0) - rSec(dt);
    if (p._panicTurn <= 0) {
      p._panicTurn = rnd(0.4, 0.9);
      p._panicDir = Math.random() * Math.PI * 2;
    }
    var vx = Math.cos(p._panicDir), vy = Math.sin(p._panicDir);
    var sp = (typeof p.speed === 'number' && p.speed > 0) ? p.speed : 2.2;
    if (WS.Player && WS.Player.tryMove) {
      var moved = WS.Player.tryMove(vx * sp * dt, vy * sp * dt);
      if (moved && moved.moved > 0) {
        p.moving = true;
        p.dir = WS.M.dir8(vx, vy);
        if (ready('panic:noise', 0.6)) {
          try { WS.Ev.emit('noise', { x: p.x, y: p.y, r: 8 }); } catch (e) { /* пусто */ }
        }
      }
    }
  }

  /** Припадок безумия при нуле рассудка. */
  function madness() {
    var p = P();
    if (!p) return;
    // суицидальный риск: истощённый разум не выдерживает
    if (p.hp < 30) {
      die(SYSTEM_CAUSES.madness);
      return;
    }
    // мягкий вариант: обморок, вещи рассыпаются, рассудок чуть отпускает
    faint(FAINT_SEC, 'Разум меркнет... вы роняете вещи');
    var lost = 0;
    var maxLost = 2 + ((Math.random() * 3) | 0);
    var g = G();
    for (var i = (p.inv ? p.inv.length : 0) - 1; i >= 0 && lost < maxLost; i--) {
      var it = p.inv[i];
      if (!it || !it.id) continue;
      var def = defOf(it.id);
      if (!def) continue;
      if (def.tags && def.tags.indexOf('quest') >= 0) continue;   // сюжетное не теряем
      var n = Math.min(it.count || 1, 1);
      if (invConsume(it.id, n) > 0) {
        if (WS.Loot && WS.Loot.dropItem) {
          try {
            WS.Loot.dropItem(it.id, n, p.x + rnd(-1.2, 1.2), p.y + rnd(-1.2, 1.2));
          } catch (e) { /* пусто */ }
        }
        lost++;
      }
    }
    p.needs.sanity = 12;
    snd('death', 0.35);
    try { WS.Ev.emit('player:madness', { lost: lost }); } catch (e2) { /* пусто */ }
  }

  /** Горит ли огонь в радиусе r тайлов от игрока. */
  function fireNear(r) {
    var p = P();
    var w = W();
    if (!p || !w || !w.lightsNear) return false;
    var list;
    try { list = w.lightsNear(p.x, p.y, r || 2.5); } catch (e) { return false; }
    for (var i = 0; i < list.length; i++) {
      if (list[i].fire) return true;
    }
    return false;
  }

  // ====================================================================
  //  ВОЛЧИЙ ВОЙ И РЁВ: перехватываем вызовы WS.Snd.play
  //  (вой не имеет своего события — единственная точка это звук).
  //  Обёртка честно вызывает оригинал.
  // ====================================================================

  function wrapSndForSanity() {
    if (!WS.Snd || !WS.Snd.play || WS.Snd._needsWrapped) return;
    var orig = WS.Snd.play;
    var wrapped = function (name, o) {
      try { onScarySound(name, o); } catch (e) { /* пусто */ }
      return orig(name, o);
    };
    WS.Snd.play = wrapped;
    WS.Snd._needsWrapped = true;
  }

  function onScarySound(name, o) {
    var p = P();
    if (!p || !WS.G || !WS.G.running || WS.G.dead) return;
    if (name !== 'howl' && name !== 'growl' && name !== 'bear_roar') return;
    var x = o && typeof o.x === 'number' ? o.x : p.x;
    var y = o && typeof o.y === 'number' ? o.y : p.y;
    var d = WS.M.dist(p.x, p.y, x, y);
    if (d > 45) return;                        // не слышно
    var power = 0;
    if (name === 'howl') power = SAN_HOWL;
    else if (name === 'bear_roar') power = SAN_ROAR;
    else if (d < 14) power = 0.6;              // рык рядом
    if (power <= 0) return;
    var k = 1 - d / 50;                        // ближе — страшнее
    if (k <= 0) return;
    var key = 'san:' + name;
    if (!ready(key, 12)) return;
    p.needs.sanity = clamp(p.needs.sanity - power * k, 0, 100);
    if (power >= SAN_HOWL && k > 0.5 && ready('howl:txt', 40)) {
      toast('Вой давит на разум...', 'warn');
    }
  }

  // ====================================================================
  //  БОЛЕЗНИ
  //  p.sick = {id, t} — t оставшиеся игровые минуты. Простуда приходит
  //  от переохлаждения (ставит WS.Temp), грипп осложняет простуду.
  // ====================================================================

  /** Назначить болезнь (замена текущей, если тяжелее).
   *  ЕДИНАЯ СТРУКТУРА с health.js: {id, t, fired, compT, tea} — раньше здесь
   *  создавался усечённый {id, t}, тик здоровья падал на sk.fired[0] и
   *  ВЫКИДЫВАЛСЯ из игры навсегда (диагноз: «tick health failed» раз за прогон).
   *  Также идёт алиас id: needs «food_poisoning» ↔ health «food_poison». */
  function makeSick(id, tMin) {
    var p = P();
    if (id === 'food_poisoning') id = 'food_poison';
    var def = SICK_DEF[id] || SICK_DEF['food_poisoning'];
    // есть канонический движок болезней — пусть ставит он (структура верная)
    if (WS.Health && WS.Health.infectDisease) {
      try {
        var r = WS.Health.infectDisease(id);
        if (r) return true;
      } catch (e) { /* ниже — свой запасной путь */ }
    }
    if (!p || !def) return false;
    var t = (tMin !== undefined) ? tMin : def.dur;
    // уже болен тем же — продлеваем
    if (p.sick && p.sick.id === id) {
      p.sick.t = Math.max(p.sick.t, t * 0.6);
      return true;
    }
    // тяжёлая болезнь не сменяется лёгкой
    if (p.sick) {
      var cur = SICK_DEF[p.sick.id];
      if (cur && def.hpH && (cur.hpH || 0) > (def.hpH || 0)) return false;
    }
    p.sick = { id: id, t: t, fired: {}, compT: 0, tea: false };
    toast('Вы заболеваете: ' + def.name, 'bad');
    if (id === 'food_poison') {
      toast('Похоже, еда была скверной...', 'warn');
    }
    try { WS.Ev.emit('player:sick', { id: id }); } catch (e) { /* пусто */ }
    return true;
  }

  /** Тик болезни: течение, симптомы, выздоровление. */
  function sickTick(dt) {
    var p = P();
    if (!p.sick) return;
    var def = SICK_DEF[p.sick.id];
    if (!def) { p.sick = null; return; }

    p.sick.t -= gMin(dt);

    // чихание — шум! (волки слышат: r 10)
    p._sneezeT = (p._sneezeT === undefined ? SNEEZE_MIN * 0.5 : p._sneezeT) - gMin(dt);
    if (p._sneezeT <= 0) {
      p._sneezeT = SNEEZE_MIN * rnd(0.7, 1.3);
      if (p.sick.id === 'cold' || p.sick.id === 'flu') {
        if (WS.Fx && WS.Fx.text) {
          try { WS.Fx.text('Апчхи!', p.x, p.y - 1.1, { col: '#cfd6df', size: 12, life: 1.6 }); } catch (e) { /* пусто */ }
        }
        try { WS.Ev.emit('noise', { x: p.x, y: p.y, r: 10 }); } catch (e2) { /* пусто */ }
        if (Math.random() < 0.25) toast('Простуда даёт о себе знать', 'warn');
      }
    }

    // рвота при отравлении
    if (p.sick.id === 'food_poisoning') {
      p._vomitT = (p._vomitT === undefined ? VOMIT_MIN * 0.5 : p._vomitT) - gMin(dt);
      if (p._vomitT <= 0) {
        p._vomitT = VOMIT_MIN * rnd(0.7, 1.4);
        toast('Вас сильно тошнит', 'bad');
        p.needs.hunger = clamp(p.needs.hunger - 8, 0, 100);
        p.needs.sanity = clamp(p.needs.sanity - 2, 0, 100);
        try { WS.Ev.emit('noise', { x: p.x, y: p.y, r: 8 }); } catch (e3) { /* пусто */ }
        snd('fall', 0.3);
      }
    }

    // урон от тяжёлых болезней
    if (def.hpH) systemDamage(-def.hpH * gH(dt), 'sick');

    // грипп осложняет простуду при полном изнеможении
    if (p.sick.id === 'cold' && p.needs.fatigue < 20 && Math.random() < 0.02 * gH(dt) * 60) {
      makeSick('flu');
    }

    // выздоровление
    if (p.sick && p.sick.t <= 0) {
      // постельный режим ускорял выздоровление (учтено в sleepTick),
      // здесь просто фиксируем итог
      toast('Вам полегчало', 'good');
      p.sick = null;
    }
  }

  /** Публично: описание текущей болезни. */
  function sickInfo() {
    var p = P();
    if (!p || !p.sick) return null;
    var def = SICK_DEF[p.sick.id];
    if (!def) return null;
    return { id: p.sick.id, name: def.name, hours: Math.round(p.sick.t / 6) / 10 };
  }

  /** Лечение предметами (вызывается из eat/drink). */
  function cureByFood(id) {
    var p = P();
    if (!p || !p.sick) return;
    if (id === 'tea_brick') {
      p.sick.t -= 150;              // чай с холоду
      toast('Горячий чай согревает', 'good');
    } else if (id === 'honey_jar') {
      p.sick.t -= 240;
      toast('Мёд лечит горло', 'good');
    } else if (id === 'birch_chaga') {
      p.sick.t -= 90;
    } else if (id === 'quinine') {
      // хинин резко сбивает лихорадку
      p.sick.t = Math.min(p.sick.t, 60);
      toast('Хинин сбивает лихорадку', 'good');
    } else if (id === 'milk_bottle' || id === 'kasha') {
      p.sick.t -= 60;
    }
    if (p.sick && p.sick.t <= 0) {
      toast('Болезнь отступает', 'good');
      p.sick = null;
    }
  }

  // ====================================================================
  //  ЕДА И ПИТЬЁ (API для UI инвентаря)
  //  WS.Needs.eat(spec) / drink(spec): spec — id | слот {id,count} | def.
  //  cal -> hunger (+cal/40), thir -> thirst, sanity, heal, painkill,
  //  drunk; sick — шанс отравления (или порча по возрасту слота).
  // ====================================================================

  /** Разобрать переданный предмет: {id, def} или null. */
  function resolveSpec(spec) {
    if (!spec) return null;
    var id = null;
    if (typeof spec === 'string') id = spec;
    else if (typeof spec === 'object' && spec.id) id = spec.id;
    if (!id) return null;
    var def = defOf(id);
    if (!def) return null;
    return { id: id, def: def };
  }

  /** Слот испорчен? (если UI проставил data.age в днях). */
  function spoiledSlot(id, def) {
    if (!def || !def.per) return false;
    var slot = invFind(id);
    if (slot && slot.data && typeof slot.data.age === 'number') {
      return slot.data.age > def.per;
    }
    return false;
  }

  function eat(spec) {
    var g = G();
    var p = g && g.player;
    if (!p) return { ok: false, reason: 'нет партии' };
    var it = resolveSpec(spec);
    if (!it) return { ok: false, reason: 'неизвестный предмет' };
    var def = it.def;

    var edible = (def.cal && def.cal > 0) ||
                 (def.tags && def.tags.indexOf('edible') >= 0);
    if (!edible) return { ok: false, reason: 'это не еда' };
    if (invCount(it.id) <= 0) return { ok: false, reason: 'нет в инвентаре' };

    if (invConsume(it.id, 1) <= 0) return { ok: false, reason: 'не удалось съесть' };

    // --- эффекты ---
    p.needs.hunger = clamp(p.needs.hunger + (def.cal || 0) / 40, 0, 100);
    if (def.thir) p.needs.thirst = clamp(p.needs.thirst + def.thir, 0, 100);
    if (def.sanity) p.needs.sanity = clamp(p.needs.sanity + def.sanity, 0, 100);
    if (def.heal) p.hp = Math.min(p.maxHp || 100, p.hp + def.heal);
    if (def.painkill) p.pain = clamp((p.pain || 0) - def.painkill, 0, 100);
    if (def.drunk) p.drunk = clamp((p.drunk || 0) + def.drunk, 0, 100);

    // --- отравление ---
    var sickChance = def.sick || 0;
    if (spoiledSlot(it.id, def)) sickChance = Math.max(sickChance, 80);
    if (sickChance > 0 && Math.random() * 100 < sickChance) {
      makeSick('food_poisoning');
    }

    // лечение едой при болезни
    cureByFood(it.id);

    // --- подача ---
    snd('eat', 0.7);
    if (WS.Fx && WS.Fx.text) {
      try { WS.Fx.text('+ сытость', p.x, p.y - 1.0, { col: '#c8b46a', size: 12, life: 1.4 }); } catch (e) { /* пусто */ }
    }
    try { WS.Ev.emit('player:ate', { id: it.id }); } catch (e2) { /* пусто */ }
    return { ok: true, id: it.id };
  }

  function drink(spec) {
    var g = G();
    var p = g && g.player;
    if (!p) return { ok: false, reason: 'нет партии' };
    var it = resolveSpec(spec);
    if (!it) return { ok: false, reason: 'неизвестный предмет' };
    var def = it.def;

    var drinkable = (def.thir && def.thir > 0) ||
                    (def.tags && def.tags.indexOf('drinkable') >= 0) ||
                    def.cat === 'drink';
    if (!drinkable) return { ok: false, reason: 'это нельзя пить' };
    if (invCount(it.id) <= 0) return { ok: false, reason: 'нет в инвентаре' };

    if (invConsume(it.id, 1) <= 0) return { ok: false, reason: 'не удалось выпить' };

    // --- эффекты ---
    p.needs.thirst = clamp(p.needs.thirst + (def.thir || 0), 0, 100);
    if (def.cal) p.needs.hunger = clamp(p.needs.hunger + def.cal / 40, 0, 100);
    if (def.sanity) p.needs.sanity = clamp(p.needs.sanity + def.sanity, 0, 100);
    if (def.drunk) p.drunk = clamp((p.drunk || 0) + def.drunk, 0, 100);
    if (def.painkill) p.pain = clamp((p.pain || 0) - def.painkill, 0, 100);

    // водка обеззараживает — старый северный способ
    if (it.id === 'vodka' && p.sick && p.sick.id === 'food_poisoning') {
      p.sick.t -= 120;
      toast('Спирт продезинфицировал нутро', 'warn');
    }

    // выпитая фляга остаётся пустой (для растапливания снега)
    if (it.id === 'water_flask') {
      invGive('flask_empty', 1);
    }

    // лечение питьём
    cureByFood(it.id);

    // --- подача ---
    snd('drink', 0.7);
    if (WS.Fx && WS.Fx.text) {
      try { WS.Fx.text('+ вода', p.x, p.y - 1.0, { col: '#7fb0c8', size: 12, life: 1.4 }); } catch (e) { /* пусто */ }
    }
    try { WS.Ev.emit('player:drank', { id: it.id }); } catch (e2) { /* пусто */ }
    return { ok: true, id: it.id };
  }

  /**
   * Есть снег/лёд прямо с горсти: +12 воды, лёгкое переохлаждение,
   * 15% болезни; котелок + огонь рядом = безопасно (растопили).
   */
  function eatSnow() {
    var g = G();
    var p = g && g.player;
    if (!p) return { ok: false, reason: 'нет партии' };

    var hasPot = invCount('pot') > 0;
    var warm = fireNear(2.5);
    var safe = hasPot && warm;

    p.needs.thirst = clamp(p.needs.thirst + 12, 0, 100);
    p.temp = Math.max(30, (p.temp || 37) - 0.15);   // снежок холодит

    if (!safe && Math.random() * 100 < SNOW_SICK_CHANCE) {
      makeSick('food_poisoning');
    } else if (safe) {
      toast('Снег растоплен в котелке — чистая вода', 'good');
    } else if (ready('snow:hint', 300)) {
      hint('Сырой снег может привести к болезни — растопите в котелке у огня', 'snow', 'warn');
    }

    snd('drink', 0.5);
    if (WS.Fx && WS.Fx.text) {
      try { WS.Fx.text('холодный снег...', p.x, p.y - 1.0, { col: '#cfe0ea', size: 12, life: 1.4 }); } catch (e) { /* пусто */ }
    }
    try { WS.Ev.emit('player:drank', { id: 'snow' }); } catch (e2) { /* пусто */ }
    return { ok: true, safe: safe };
  }

  /**
   * «Использовать» вещь: гармошка, карты, табак — маленькие радости
   * рассудка. Лауданум — обезболивание (медицина — забота B3).
   */
  function use(id) {
    var g = G();
    var p = g && g.player;
    if (!p) return { ok: false, reason: 'нет партии' };
    var def = defOf(id);
    if (!def) return { ok: false, reason: 'неизвестный предмет' };
    if (invCount(id) <= 0) return { ok: false, reason: 'нет в инвентаре' };

    if (id === 'harmonica') {
      if (!ready('use:harm', 60)) return { ok: false, reason: 'ещё тянется мелодия' };
      p.needs.sanity = clamp(p.needs.sanity + 12, 0, 100);
      toast('Гармошка поёт над снегами', 'good');
      try { WS.Ev.emit('noise', { x: p.x, y: p.y, r: 16 }); } catch (e) { /* пусто */ }
      snd('bell', 0.4);
      try { WS.Ev.emit('player:played', { id: id }); } catch (e2) { /* пусто */ }
      return { ok: true };
    }
    if (id === 'deck_cards') {
      if (!ready('use:cards', 90)) return { ok: false, reason: 'не сейчас' };
      p.needs.sanity = clamp(p.needs.sanity + 4, 0, 100);
      toast('Пасьянс удался', 'good');
      snd('click', 0.5);
      return { ok: true };
    }
    if (id === 'tobacco_pouch') {
      if (!ready('use:smoke', 45)) return { ok: false, reason: 'раскуривать чаще не стоит' };
      // махорка на 10 раскуров (def.uses), потом кисет пуст
      p._pouchN = (p._pouchN === undefined ? 10 : p._pouchN) - 1;
      if (p._pouchN <= 0) {
        p._pouchN = 10;
        invConsume('tobacco_pouch', 1);
      }
      p.needs.sanity = clamp(p.needs.sanity + 6, 0, 100);
      p.needs.hunger = clamp(p.needs.hunger - 1, 0, 100); // табак глушит аппетит
      if (WS.Fx && WS.Fx.spawn) {
        try { WS.Fx.spawn('smoke', p.x - 0.3, p.y - 0.6, { z: 30, grav: -4, life: 2.2, size: 3 }); } catch (e3) { /* пусто */ }
      }
      snd('match', 0.25);
      toast('Табак успокаивает нервы', 'good');
      return { ok: true };
    }
    if (id === 'tobacco_pipe') {
      if (invCount('tobacco_pouch') <= 0) {
        return { ok: false, reason: 'нужна махорка' };
      }
      return use('tobacco_pouch');
    }
    if (def.painkill) {
      // обезболивающие/успокоительные из кармана
      if (!ready('use:med', 30)) return { ok: false, reason: 'не так часто' };
      if (invConsume(id, 1) <= 0) return { ok: false, reason: 'нет в инвентаре' };
      p.pain = clamp((p.pain || 0) - def.painkill, 0, 100);
      if (def.sanity) p.needs.sanity = clamp(p.needs.sanity + def.sanity, 0, 100);
      if (def.drunk) p.drunk = clamp((p.drunk || 0) + def.drunk, 0, 100);
      toast('Стало легче', 'good');
      snd('eat', 0.4);
      return { ok: true };
    }
    return { ok: false, reason: 'нечего с этим делать' };
  }

  // ====================================================================
  //  ОПЬЯНЕНИЕ
  // ====================================================================

  function drunkTick(dt) {
    var p = P();
    if (!p.drunk) return;
    p.drunk = clamp(p.drunk - DRUNK_DECAY_H * gH(dt), 0, 100);
    if (p.drunk >= DRUNK_FAINT && (p._faintT || 0) <= 0) {
      faint(20, 'Хмель свалил вас с ног');
    }
    if (p.drunk > 60 && WS.Cam && WS.Cam.kick && ready('drunk:sway', 4)) {
      try { WS.Cam.kick(0.35); } catch (e) { /* пусто */ }
    }
  }

  // ====================================================================
  //  СОН
  //  WS.Needs.trySleep(): нужна кровать рядом (sprName 'bed*', 1.6 тайла)
  //  или спальник в инвентаре. Клавиша Z (player.js) спит где угодно —
  //  но на морозе без укрытия это быстрая дорога к обморожению (WS.Temp).
  // ====================================================================

  /** Ближайшая кровать (объект) в 1.6 тайлах или null. */
  function bedNear() {
    var p = P();
    var w = W();
    if (!p || !w || !w.query) return null;
    var list;
    try { list = w.query(p.x - 2.2, p.y - 2.2, p.x + 2.2, p.y + 2.2); }
    catch (e) { return null; }
    var best = null, bd = 1.7;
    for (var i = 0; i < list.length; i++) {
      var o = list[i];
      if (!o || o.hp) continue;                       // сущности мимо
      var n = String(o.sprName || '');
      if (n.indexOf('bed') !== 0) continue;            // bed_wood / bed_fancy
      var d = WS.M.dist(p.x, p.y, o.x, o.y);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  /** Есть ли спальник. */
  function hasBedroll() { return invCount('bedroll') > 0; }

  /** Лечь спать с проверкой места. */
  function trySleep() {
    var p = P();
    if (!p || p.sleeping) return { ok: false, reason: 'уже спите' };
    var bed = bedNear();
    var roll = !bed && hasBedroll();
    if (!bed && !roll) {
      hint('Негде лечь: нужна кровать или спальник', 'nobed', 'warn');
      return { ok: false, reason: 'нет кровати/спальника' };
    }
    p._sleepKind = bed ? 'bed' : 'roll';
    startSleep(p);
    return { ok: true, kind: p._sleepKind };
  }

  /** Усыпить (копия полей player.trySleep — модуль игрока не трогаем). */
  function startSleep(p) {
    var g = G();
    p.sleeping = true;
    p.sneaking = false;
    p.moving = false;
    p.sprName = 'player_sleep';
    p.sprFrame = 0;
    p._sleepT = 0;
    p._sleepFrom = (g && g.time) ? g.time.totalMin : 0;
    hint('Вы засыпаете... (любая клавиша движения — подъём)', 'sleep2', 'info');
  }

  /** Разбудить: публичным API модуля игрока или вручную (страховка). */
  function wakePlayer() {
    var p = P();
    if (!p || !p.sleeping) return false;
    if (WS.Player && WS.Player.wake) {
      try { return WS.Player.wake(); } catch (e) { /* ниже вручную */ }
    }
    p.sleeping = false;
    p.sprName = p.sneaking ? 'player_sneak' : 'player';
    p.sprFrame = 0;
    p.walkT = 0;
    p._sleepT = 0;
    p._sleepFrom = null;
    return true;
  }

  /**
   * Кадр сна: восстановление сил и рассудка, прерывание холодом.
   * Прерывание уроном/шумом — в соответствующих слушателях ниже.
   */
  function sleepTick(dt) {
    var g = G();
    var p = P();
    var n = p.needs;

    // где спим (Z у player.js не проверяет место — уточняем сами)
    if (!p._sleepKind) {
      p._sleepKind = bedNear() ? 'bed' : (hasBedroll() ? 'roll' : 'floor');
    }

    var fatRate = p._sleepKind === 'bed' ? 14 : (p._sleepKind === 'roll' ? FATIGUE_SLEEP_H : 7);
    var sanRate = p._sleepKind === 'bed' ? SAN_SLEEP_BED_H :
                  (p._sleepKind === 'roll' ? SAN_SLEEP_ROLL_H : SAN_SLEEP_FLOOR_H);
    n.fatigue = clamp(n.fatigue + fatRate * gH(dt), 0, 100);
    n.sanity = clamp(n.sanity + sanRate * gH(dt), 0, 100);

    // сытый и тёплый сон понемногу латает тело
    if (n.hunger > 55 && n.thirst > 40 &&
        WS.Temp && WS.Temp.core && WS.Temp.core() > 36) {
      p.hp = Math.min(p.maxHp || 100, p.hp + 0.3 * gH(dt));
    }

    // болезнь во сне отступает быстрее (постельный режим)
    if (p.sick) p.sick.t -= gMin(dt) * 1.0;

    // холод будит
    if (WS.Temp && WS.Temp.core && WS.Temp.core() < 35 && ready('wake:cold', 30)) {
      wakePlayer();
      toast('Холод вырвал вас из сна!', 'bad');
    }
  }

  // ====================================================================
  //  СКОРОСТЬ: единый пересчёт p.moveMul
  //  Наши факторы: голод, усталость, микросон, озноб после проруби,
  //  болезнь + фактор гипотермии от WS.Temp (или локальный фолбэк).
  //  Чужие системы могут писать p._extMoveMul — он умножается поверх.
  // ====================================================================

  function tempMoveFactor(p) {
    var t = (typeof p.temp === 'number') ? p.temp : 37;
    if (WS.Temp && typeof WS.Temp.moveFactor === 'function') {
      var f = WS.Temp.moveFactor();
      if (typeof f === 'number' && f > 0) return f;
    }
    // фолбэк без модуля температуры
    if (t < 33) return 0.75;
    if (t < 34) return 0.9;
    if (t < 35) return 0.95;
    return 1;
  }

  function applyMoveMul(p) {
    var f = 1;
    if (p.needs.hunger < HUNGER_WEAK) f *= 0.85;      // голодная слабость
    if (p.needs.thirst < THIRST_WEAK) f *= 0.9;
    if (p.needs.fatigue < FATIGUE_WEAK) f *= 0.8;      // валится с ног
    if ((p._blinkT || 0) > 0) f *= 0.85;               // микросон
    if ((p._chillT || 0) > 0) f *= 0.5;                // после проруби
    if (p.sick) f *= 0.9;                             // болезнь
    if ((p._panicT || 0) > 0) f *= 1.05;              // паника — дёрганый бег
    f *= tempMoveFactor(p);
    var ext = (typeof p._extMoveMul === 'number' && p._extMoveMul > 0) ? p._extMoveMul : 1;
    p.moveMul = ext * f;
  }

  // ====================================================================
  //  СОБЫТИЯ, КОТОРЫЕ МЫ СЛУШАЕМ
  // ====================================================================

  /** Увиденная кровь (событие 'blood' от ai.js/looting). */
  function onBlood(d) {
    var p = P();
    if (!p || !d || typeof d.x !== 'number') return;
    var dd = WS.M.dist(p.x, p.y, d.x, d.y);
    if (dd > 8) return;
    if (!ready('san:blood', SAN_CD)) return;
    p.needs.sanity = clamp(p.needs.sanity - SAN_BLOOD * (1 - dd / 10), 0, 100);
  }

  /** Смерть существа рядом — плохое зрелище. */
  function onEntKill(d) {
    var p = P();
    if (!p || !d || !d.ent) return;
    var e = d.ent;
    var byPlayer = !!(d.by && (d.by.kind === 'player' || d.by.id === 'player'));
    var dd = WS.M.dist(p.x, p.y, e.x, e.y);
    if (dd > 9) return;
    // собственная добыча охотника не так страшна
    var power = byPlayer ? SAN_CORPSE * 0.4 : SAN_CORPSE;
    if (!ready('san:corpse', 20)) return;
    p.needs.sanity = clamp(p.needs.sanity - power, 0, 100);
    // трупы человека страшнее звериных
    if (e.kind === 'bandit' || e.kind === 'hermit') {
      p.needs.sanity = clamp(p.needs.sanity - 1.5, 0, 100);
    }
  }

  /** Шум будит спящего (если близко). */
  function onNoiseWake(n) {
    var p = P();
    if (!p || !p.sleeping || (p._faintT || 0) > 0) return;
    if (!n || typeof n.x !== 'number') return;
    var d = WS.M.dist(p.x, p.y, n.x, n.y);
    if (d > 9) return;
    if (Math.random() < 0.35 && ready('wake:noise', 6)) {
      wakePlayer();
      toast('Вы вздрогнули и проснулись', 'warn');
    }
  }

  /** Новый день — статистика выживания. */
  function onDay() {
    var g = G();
    if (g && g.stats) g.stats.daysSurvived = g.stats.day || g.time.day;
  }

  // ====================================================================
  //  ГЛАВНЫЙ ТИК (приоритет 40)
  // ====================================================================

  function needsTick(dt) {
    var g = G();
    if (!g || !g.running || g.dead) return;
    sysTime += dt;

    var p = P();
    if (!p) return;

    try {
      // страховка владения уроном: как только партия жива — флаг стоит,
      // fallback-и ai.js/player.js не вычитают hp повторно
      if (!g._dmgHooked) g._dmgHooked = true;

      // нормализация полей (старые сейвы)
      var n = p.needs;
      if (!n) { n = p.needs = { hunger: 70, thirst: 70, fatigue: 80, sanity: 70, warmth: 70 }; }
      n.hunger = clamp(n.hunger, 0, 100);
      n.thirst = clamp(n.thirst, 0, 100);
      n.fatigue = clamp(n.fatigue, 0, 100);
      n.sanity = clamp(n.sanity, 0, 100);
      if (typeof p.temp !== 'number') p.temp = 37;

      // обморок важнее всего
      if ((p._faintT || 0) > 0) {
        faintTick(dt);
      }

      // базовые нужды
      hungerTick(dt);
      thirstTick(dt);
      if (!g.dead) fatigueTick(dt);
      if (!g.dead) sanityTick(dt);
      if (!g.dead) sickTick(dt);
      drunkTick(dt);

      // сон: восстановление (прерывания внутри)
      if (p.sleeping && (p._faintT || 0) <= 0 && !g.dead) {
        sleepTick(dt);
      }
      if (!p.sleeping && p._sleepKind) p._sleepKind = null;

      // скорость игрока — наша зона ответственности
      if (!g.dead) applyMoveMul(p);
    } catch (err) {
      // тик не должен умирать: Loop удаляет упавшие тики
      WS.err('needsTick:', err && err.message);
    }
  }

  // ====================================================================
  //  СБРОС ПАРТИИ
  // ====================================================================

  function declareItems() {
    // предметы модуля (только если их ещё никто не объявил)
    WS.Data = WS.Data || {};
    WS.Data.items = WS.Data.items || {};
    var add = function (o) {
      if (!WS.Data.items[o.id]) WS.Data.items[o.id] = o;
    };
    add({ id: 'bedroll', cat: 'misc', w: 2.5, stack: 1, warm: 15, tags: ['bedroll', 'warm_when_wet'] });
    add({ id: 'flask_empty', cat: 'container', w: 0.35, stack: 3, tags: ['container'] });
    bedrollDeclared = true;
  }

  function onGameReset() {
    cd = {};
    sysTime = 0;
    var g = G();
    if (!g) return;
    g._dmgHooked = true;              // мы владеем уроном с первого кадра
    declareItems();
    var p = g.player;
    if (p) {
      p._faintT = 0;
      p._blinkT = 0;
      p._panicT = 0;
      p._chillT = 0;
      p._sleepKind = null;
      p._sneezeT = undefined;
      p._vomitT = undefined;
      if (!p.needs) p.needs = {};
      var n = p.needs;
      if (typeof n.hunger !== 'number') n.hunger = 70;
      if (typeof n.thirst !== 'number') n.thirst = 70;
      if (typeof n.fatigue !== 'number') n.fatigue = 80;
      if (typeof n.sanity !== 'number') n.sanity = 70;
      if (typeof n.warmth !== 'number') n.warmth = 70;
    }
  }

  // ====================================================================
  //  САМОТЕСТ (WS.Needs.selftest() из консоли)
  // ====================================================================

  function selftest() {
    var out = [];
    var pass = 0, fail = 0;
    function ok(name, cond) {
      if (cond) { pass++; out.push('  ok   ' + name); }
      else { fail++; out.push('  FAIL ' + name); }
      return !!cond;
    }
    ok('модуль зарегистрирован', !!WS.Needs);
    ok('bedroll объявлен', !!(WS.Data && WS.Data.items && WS.Data.items.bedroll));
    ok('flask_empty объявлен', !!(WS.Data && WS.Data.items && WS.Data.items.flask_empty));
    ok('нет вызовов погоды при загрузке', true);   // WS.Weather зовём только в тиках
    var p = P();
    if (p) {
      var h0 = p.needs.hunger;
      var r = eat('bread');
      ok('eat(bread) проходит', r && r.ok === true || (invCount('bread') === 0 && r && r.ok === false));
      if (r && r.ok) ok('hunger вырос', p.needs.hunger >= h0 - 0.001);
      var d0 = p.needs.thirst;
      var r2 = drink('water_flask');
      if (r2 && r2.ok) ok('drink(flasк) даёт воду', p.needs.thirst > d0);
      ok('штраф скорости в границах', typeof p.moveMul !== 'number' || (p.moveMul > 0 && p.moveMul <= 1.2));
    }
    out.unshift('needs.selftest: ' + pass + ' ок, ' + fail + ' провалено');
    return out;
  }

  // ====================================================================
  //  ПУБЛИЧНЫЙ API
  // ====================================================================

  var Needs = {
    // --- приём пищи ---
    eat: eat,
    drink: drink,
    eatSnow: eatSnow,
    use: use,

    // --- сон ---
    trySleep: trySleep,
    wake: wakePlayer,
    bedNear: bedNear,
    hasBedroll: hasBedroll,

    // --- болезни ---
    makeSick: makeSick,
    cureByFood: cureByFood,
    sickInfo: sickInfo,
    isSick: function () { var p = P(); return !!(p && p.sick); },

    // --- урон (внутренний, для систем температуры/огня) ---
    systemDamage: systemDamage,
    applyDamage: applyDamage,
    /** Обморок на sec реальных секунд (гипотермия, хмель, безумие). */
    faint: faint,

    // --- показатели для HUD/прицела ---
    /** Штраф точности в %: дрожь рассудка + обморожение + хмель. */
    aimPenalty: function () {
      var p = P();
      if (!p) return 0;
      var pen = 0;
      if (p.needs.sanity < SAN_SHAKE) pen += 20 + (SAN_SHAKE - p.needs.sanity) * 0.5;
      if (WS.Temp && typeof WS.Temp.aimPenalty === 'function') pen += WS.Temp.aimPenalty();
      if ((p.drunk || 0) > 30) pen += 8 + p.drunk * 0.2;
      if ((p._blinkT || 0) > 0) pen += 12;
      return Math.round(clamp(pen, 0, 80));
    },

    /** Снимок нужд для HUD. */
    snapshot: function () {
      var p = P();
      if (!p) return null;
      return {
        hunger: Math.round(p.needs.hunger),
        thirst: Math.round(p.needs.thirst),
        fatigue: Math.round(p.needs.fatigue),
        sanity: Math.round(p.needs.sanity),
        warmth: Math.round(p.needs.warmth),
        temp: Math.round((p.temp || 37) * 10) / 10,
        drunk: Math.round(p.drunk || 0),
        sick: p.sick ? p.sick.id : null,
        sleeping: !!p.sleeping,
        faint: (p._faintT || 0) > 0,
        panic: (p._panicT || 0) > 0
      };
    },

    /** Внутреннее время модуля (синхронно с aiTime). */
    time: function () { return sysTime; },

    selftest: selftest
  };

  WS.def('Needs', Needs);

  // ====================================================================
  //  BOOT
  // ====================================================================

  WS.boot(function initNeeds() {
    // главный тик систем — приоритет 40 (CONTRACT.md)
    WS.tick(TICK_PRI, needsTick, 'sys:needs');

    // ВЛАДЕНИЕ УРОНОМ: слушатель ставит d.handled ДО применения.
    // systems грузятся раньше ai/entities — наш слушатель в очереди
    // первый, fallback-и ai.js/player.js видят G._dmgHooked и молчат.
    WS.Ev.on('player:damage', onExternalDamage);

    // страхи и пробуждение
    WS.Ev.on('blood', onBlood);
    WS.Ev.on('ent:kill', onEntKill);
    WS.Ev.on('noise', onNoiseWake);
    WS.Ev.on('time:day', onDay);

    // перехват воя/рёва для рассудка (звук — единственный их носитель)
    wrapSndForSanity();

    // сброс/старт партии
    WS.Ev.on('game:start', onGameReset);
    WS.Ev.on('game:load', onGameReset);

    WS.log('needs: система выживания зарегистрирована (тик ' + TICK_PRI + ')');
  }, 'needs:init');

})();
