/**
 * temperature.js — СЕРДЦЕ ИГРЫ: модель температуры тела (модуль B1).
 * Холод — главный враг Русского Севера. Теплообмен каждый игровой час:
 * наружная температура + ветер + одежда (торso x2, мокрая вещь -60% warm)
 * + укрытие + костёр + печь + активность + мокрота; стадии гипотермии
 * (36/35/34/33/31), обморожение пальцев, простуда от переохлаждения,
 * падение в прорубь ('player:fall_water'), сушка у огня.
 * Связи: WS.Needs (обморок/болезни/урон), WS.Fire (сила огня/печи),
 * WS.Weather (погода; при её отсутствии — мягкий фолбэк -12..-22°C).
 */
(function () {
  'use strict';

  // ====================================================================
  //  НАСТРОЙКИ МОДЕЛИ
  //  Все скорости — за ИГРОВОЙ час (1 игровая минута = 1 реальная сек
  //  при скорости x1; во сне время x8 — и мороз, и сушка идут быстрее).
  // ====================================================================

  var TICK_PRI = 40;             // системы (CONTRACT.md), после needs

  // --- тело ---
  var CORE_NORM = 37.0;          // нормальная температура ядра
  var CORE_MIN = 25.0;           // нижняя граница модельных значений
  var CORE_MAX = 41.5;           // верхняя (злокачественная лихорадка)

  // --- теплообмен ---
  var K_BARE = 0.06;             // k без одежды: 0.06 °C за час на градус разницы
  var K_DRESSED = 0.02;          // k в полной зимней экипировке
  var WARM_FOR_MAX = 200;        // взвешенная «теплота» гардероба для минимума k
  var WET_K_MUL_MAX = 3.0;       // насквозь мокрый — теплопотеря x3 («мороз x3»)
  var INSIDE_BUFFER = 8;         // дом буферит +8°C (стены держат дневное тепло)
  var STOVE_HEAT = 15;           // топленая печь в комнате: +15°C
  var FIRE_RADIANT_MAX = 20;     // костёр в 2 тайлах: до +20°C
  var FIRE_RADIANT_R = 2.5;      // радиус «сидеть у огня»
  var RUN_HEAT = 3;              // бег греет +3°C
  var SLEEP_CHILL = 2;           // сон стынет -2°C
  var BLANKET_BED = 10;          // одеяло кровати (во сне)
  var BLANKET_ROLL = 7;          // спальник (во сне)
  var WET_CHILL = 0.06;          // каждый пункт мокроты давит на эффективную t

  // --- лихорадка (болезни; значения дублируют таблицу needs.js) ---
  var FEVERS = { cold: 0.35, flu: 0.9, food_poisoning: 0.1 };

  // --- восстановление тепла (метаболизм у огня) ---
  var WARM_GAIN_FIRE = 2.5;      // °C/час у сильного огня вплотную
  var WARM_GAIN_STOVE = 1.2;     // °C/час в натопленной комнате
  var WARM_MEAL_MIN = 120;        // игровых минут действия горячей еды
  var WARM_MEAL_HEAT = 0.8;      // +к целевой температуре тела

  // --- стадии гипотермии (пороги тела, °C) ---
  var ST_COLD = 36.0;            // 1: «Холодно»
  var ST_VERY_COLD = 35.0;       // 2: «ОЧЕНЬ холодно» (дрожь)
  var ST_HYPO = 34.0;            // 3: «Гипотермия»
  var ST_DEADLY = 33.0;          // 4: «Смертельный холод»
  var ST_DEATH = 31.0;           // 5: смерть

  // --- обморожение ---
  var FB_BASE_H = 1.1;           // базовый рост за игровой час при t<35
  var FB_NO_GLOVES = 2.0;        // без перчаток x2
  var FB_WET = 4.0;              // насквозь мокрый / в воде x4
  var FB_WIND_MUL = 0.5;         // ветер добавляет до +50%
  var FB_SLEEP_OUT = 1.5;        // спать на улице без укрытия
  var FB_FINGERS = 30;           // «обморожение пальцев» (точность -20%)
  var FB_SEVERE = 60;            // «сильное обморожение» (hp, пальцы чернеют)
  var FB_GANGRENE = 100;         // гангрена
  var FB_HEAL_FIRE_H = 5;        // лечение у огня: -5/час
  var FB_HEAL_ROOM_H = 2;        // лечение в натопленной комнате
  var FB_SEVERE_DMG_H = 0.4;     // урон hp при сильном обморожении
  var GANGRENE_DMG_H = 1.2;     // урон hp при гангрене
  var GANGRENE_LETHAL_H = 24;    // часов до смерти без ампутации

  // --- мокрота (0..100) ---
  var WET_STORM_H = 9;           // пурга на улице мочит за час
  var WET_SNOW_H = 2;            // обычный снег
  var WET_DRY_FIRE_MIN = 20;     // у огня: -20 за игровую МИНУТУ (по ТЗ)
  var WET_DRY_ROOM_H = 4;        // в тёплом доме
  var WET_DRY_IN_H = 2;          // в холодном доме
  var WET_DRY_OUT_H = 0.8;       // на морозе само подсушивает (медленно)

  // --- простуда от переохлаждения ---
  var COLD_EXPOSURE_H = 2;       // часов при t<35 до броска кубика
  var COLD_CHANCE = 30;          // % простуды
  var COLD_DURATION = 1440;      // игровых минут простуды

  // --- фолбэк погоды (модуль B2 ещё не написан) ---
  var FB_TEMP_DAY = -12;         // днём
  var FB_TEMP_NIGHT_ADD = -10;   // ночью темнее — холоднее
  var FB_WIND = 0.3;

  // --- одежда: веса слотов (torso x2 — грудь и спина решают) ---
  var SLOT_WEIGHTS = {
    head: 1.2, torso: 2.0, legs: 1.2, feet: 1.0, hands: 1.0, back: 0.6
  };

  // ====================================================================
  //  СОСТОЯНИЕ МОДУЛЯ
  // ====================================================================

  var sysTime = 0;               // реальных секунд с начала партии
  var cd = {};                   // кулдауны подсказок/эффектов
  var clothCache = null;         // кэш одежды (пересчёт раз в 0.5 с)
  var clothCacheT = -1;
  var lastStage = -1;           // прежняя стадия (детект переходов)

  // ====================================================================
  //  МАЛЫЕ УТИЛИТЫ
  // ====================================================================

  function G() { return WS.G || null; }
  function P() { var g = WS.G; return (g && g.player) || null; }
  function W() { return WS.World || null; }

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  /** Игровые минуты за кадр (dt — реальных секунд). */
  function gMin(dt) {
    var sp = (WS.Loop && WS.Loop.speed) ? WS.Loop.speed : 1;
    if (sp < 1) sp = 1;
    var ts = (WS.Time && WS.Time.timeScale) ? WS.Time.timeScale() : 1;
    return dt * sp * ts;
  }

  /** Игровые часы за кадр. */
  function gH(dt) { return gMin(dt) / 60; }

  /** Реальные секунды за кадр (без ускорения сна). */
  function rSec(dt) {
    var sp = (WS.Loop && WS.Loop.speed) ? WS.Loop.speed : 1;
    if (sp < 1) sp = 1;
    return dt * sp;
  }

  function ready(key, sec) {
    var t = cd[key] || 0;
    if (sysTime < t) return false;
    cd[key] = sysTime + sec;
    return true;
  }

  function toast(text, kind) {
    try {
      if (WS.Ui && WS.Ui.toast) { WS.Ui.toast(text, kind || 'info'); return; }
    } catch (e) { /* ниже — текстом */ }
    var p = P();
    if (WS.Fx && WS.Fx.text && p) {
      try { WS.Fx.text(text, p.x, p.y - 1.2, { col: '#bcd8ea', size: 13, life: 2.4 }); }
      catch (e2) { /* пусто */ }
    }
  }

  function hint(msg, onceKey, kind) {
    if (onceKey) {
      var g = G();
      if (!g || !g.story || !g.story.hints) return;
      if (g.story.hints[onceKey]) return;
      g.story.hints[onceKey] = 1;
    }
    toast(msg, kind || 'info');
  }

  function rnd(lo, hi) { return lo + Math.random() * (hi - lo); }

  /** Смерть — только через WS.Main.die (контракт). */
  function die(cause) {
    var g = G();
    if (!g || g.dead) return;
    if (WS.Main && WS.Main.die) {
      try { WS.Main.die(cause); } catch (e) { WS.err('Main.die:', e && e.message); }
    }
  }

  /** Системный урон: напрямую в hp, событие — уже помеченное (handled). */
  function systemDamage(amount, type) {
    var g = G();
    var p = P();
    if (!g || !p || g.dead) return;
    amount = Math.max(0, Number(amount) || 0);
    if (!amount || p.hp === undefined || p.hp <= 0) return;
    g._dmgHooked = true;
    p.hp = Math.max(0, p.hp - amount);
    if (p.hp <= 0) {
      die('Вы замёрзли насмерть');
      return;
    }
    try {
      WS.Ev.emit('player:damage', {
        amount: amount, type: type || 'cold', src: 'system', handled: true, applied: true
      });
    } catch (e) { /* пусто */ }
  }

  // ====================================================================
  //  ПОГОДА (мост с фолбэком — вызовы ТОЛЬКО из тиков/обработчиков!)
  // ====================================================================

  /** Температура воздуха снаружи, °C. */
  function tempOutside() {
    if (WS.Weather && typeof WS.Weather.tempOutside === 'function') {
      try {
        var t = WS.Weather.tempOutside();
        if (typeof t === 'number' && isFinite(t)) return t;
      } catch (e) { /* фолбэк ниже */ }
    }
    // фолбэк: -12 днём, к ночи и в полярную ночь до -22
    var night = 0.5;
    if (WS.Time && WS.Time.light) night = 1 - WS.Time.light();
    if (WS.Time && WS.Time.isPolarNight && WS.Time.isPolarNight()) night = Math.max(night, 0.85);
    return FB_TEMP_DAY + FB_TEMP_NIGHT_ADD * clamp(night, 0, 1);
  }

  /** Сила ветра 0..1. */
  function windLevel() {
    if (WS.Weather && typeof WS.Weather.windLevel === 'function') {
      try {
        var v = WS.Weather.windLevel();
        if (typeof v === 'number' && isFinite(v)) return clamp(v, 0, 1);
      } catch (e) { /* фолбэк ниже */ }
    }
    return FB_WIND;
  }

  /** Идентификатор погоды (или ''). */
  function weatherId() {
    if (WS.Weather && WS.Weather.current) {
      try {
        var c = WS.Weather.current();
        if (c && c.id) return c.id;
      } catch (e) { /* пусто */ }
    }
    return '';
  }

  // ====================================================================
  //  ОДЕЖДА
  //
  //  warm: взвешенная сумма по слотам (torso x2); мокрая вещь отдаёт лишь
  //  40% тепла (минус 60%). wind: сумма ветрозащиты (мокрая -30%).
  //  wet: влагозащита — как быстро пурга вас промочит.
  //  Мокрота вещей хранится в p._wetWear = {slot: 0..1}.
  // ====================================================================

  function defOf(id) {
    return (WS.Data && WS.Data.items && WS.Data.items[id]) || null;
  }

  function slotWet(p, slot) {
    if (!p._wetWear || typeof p._wetWear[slot] !== 'number') return 0;
    return clamp(p._wetWear[slot], 0, 1);
  }

  /** Собрать параметры одежды (с кэшем на полсекунды). */
  function clothing(p) {
    var t = sysTime;
    if (clothCache && t - clothCacheT < 0.5) return clothCache;
    var res = { warm: 0, wind: 0, wetProt: 0, hands: false, wetSlots: [] };
    var eq = p.equip || {};
    for (var slot in SLOT_WEIGHTS) {
      if (!SLOT_WEIGHTS.hasOwnProperty(slot)) continue;
      var it = eq[slot];
      if (!it || !it.id) continue;
      var def = defOf(it.id);
      if (!def) continue;
      var wet = slotWet(p, slot);
      var warmMul = 1 - 0.6 * wet;             // мокрая вещь: -60% тепла
      var windMul = 1 - 0.3 * wet;             // и обвисает от ветра
      res.warm += (def.warm || 0) * SLOT_WEIGHTS[slot] * warmMul;
      res.wind += (def.wind || 0) * windMul;
      res.wetProt += def.wet || 0;
      if (slot === 'hands' && (def.warm || 0) > 0) res.hands = true;
      if (wet > 0.05) res.wetSlots.push(slot);
    }
    // задубевшая на морозе мокрая одежда держит форму хуже — учтено выше
    clothCache = res;
    clothCacheT = t;
    return res;
  }

  /** Перчатки надеты? (для обморожения). */
  function hasGloves(p) {
    var c = clothing(p);
    return c.hands;
  }

  // ====================================================================
  //  ОКРУЖЕНИЕ: ЭФФЕКТИВНАЯ ТЕМПЕРАТУРА
  // ====================================================================

  /** Внутри здания? */
  function insideB(p) {
    var w = W();
    return !!(w && w.isInside && w.isInside(p.x, p.y));
  }

  /**
   * Радиант костра: 0..FIRE_RADIANT_MAX. Использует силу огня из
   * WS.Fire (учитывает топливо и стадию), фолбэк — просто свет огня.
   */
  function fireRadiant(p) {
    if (WS.Fire && typeof WS.Fire.heatAt === 'function') {
      try {
        var h = WS.Fire.heatAt(p.x, p.y);
        if (typeof h === 'number' && h > 0) return clamp(h, 0, FIRE_RADIANT_MAX);
      } catch (e) { /* фолбэк ниже */ }
    }
    var w = W();
    if (!w || !w.lightsNear) return 0;
    var list;
    try { list = w.lightsNear(p.x, p.y, FIRE_RADIANT_R); } catch (e2) { return 0; }
    var best = 0;
    for (var i = 0; i < list.length; i++) {
      if (!list[i].fire) continue;
      var k = 1 - (list[i].d || 0) / FIRE_RADIANT_R;
      if (k > best) best = k;
    }
    return best * (FIRE_RADIANT_MAX - 2);
  }

  /**
   * Топленая печь греет комнату: ищем свет огня в том же здании
   * (печь даёт свет с fire:true, r 40 — см. fire.js).
   */
  function heatedRoom(p) {
    var w = W();
    if (!w || !w.lightsNear) return false;
    var b = insideB(p);
    if (!b) return false;
    var list;
    try { list = w.lightsNear(p.x, p.y, 14); } catch (e) { return false; }
    for (var i = 0; i < list.length; i++) {
      var L = list[i];
      if (!L.fire) continue;
      var lb = w.isInside ? w.isInside(L.x, L.y) : null;
      if (lb === b) return true;      // огонь в том же доме
    }
    return false;
  }

  /**
   * Полная эффективная температура среды, °C (то, что «ощущается»).
   * Слагаемые: воздух, ветер (с ветрозащитой), дом (+5), печь (+15),
   * костёр (до +20), активность (+3 бег / -2 сон), мокрота, одеяло.
   */
  function effectiveTemp(p, cloth) {
    var w = W();
    var inside = insideB(p);
    var wind = inside ? 0 : windLevel();
    var windProt = clamp(cloth.wind / 260, 0, 0.85);

    var eff = tempOutside();
    // ветер выдувает тепло: до -18°C при шторме без ветрозащиты
    eff -= (4 + wind * 14) * (1 - windProt);
    if (inside) eff += INSIDE_BUFFER;
    if (heatedRoom(p)) eff += STOVE_HEAT;
    eff += fireRadiant(p);

    // активность
    if (p.sleeping) eff -= SLEEP_CHILL;
    else if (p.sprinting && p.moving) eff += RUN_HEAT;
    // крадучись — экономим силы, но и не греемся (0)

    // озноб от мокрой одежды
    eff -= (p._wet || 0) * WET_CHILL;

    // одеяло: сон в кровати/спальнике укрывает
    if (p.sleeping) {
      if (p._sleepKind === 'bed') eff += BLANKET_BED;
      else if (p._sleepKind === 'roll') eff += BLANKET_ROLL;
    }
    return eff;
  }

  // ====================================================================
  //  ТЕПЛООБМЕН ЯДРА
  //
  //  deltaPerHour = (effectiveTemp - target) * k + warmGain, где
  //  target = 37 + лихорадка, k = 0.06..0.02 от одежды (мокрый — до x3),
  //  warmGain — метаболическое тепло у огня (0..2.5°C/час).
  //  Примеры: раздетым при -12: (−12−37)*0.06 ≈ −2.9°C/час — смерть
  //  за полтора игровых часа; в шубах у костра тепло возвращается.
  // ====================================================================

  function feverOf(p) {
    if (p.sick && FEVERS[p.sick.id]) return FEVERS[p.sick.id];
    return 0;
  }

  // ====================================================================
  //  ВНУТРЕННЕЕ ТЕПЛО ОТ ГОРЯЧЕЙ ЕДЫ/ЧАЯ
  //  WS.Temp.warmMeal(минут): горячая каша или чай на пару игровых часов
  //  даёт +0.8°C к целевой температуре (греет изнутри, как маленькая
  //  печка). Приятная забота fire.js (готовка) и needs.js (питьё).
  // ====================================================================

  /** Сколько «жара» даёт тёплая еда прямо сейчас (0..0.8°C). */
  function warmMealFever(p) {
    var m = p._warmMeal || 0;            // оставшиеся игровые минуты
    if (m <= 0) return 0;
    return clamp(m / WARM_MEAL_MIN, 0, 1) * WARM_MEAL_HEAT;
  }

  /** Публично: горячая еда/питьё продлевает внутреннее тепло. */
  function warmMeal(gameMin) {
    var p = P();
    if (!p) return;
    p._warmMeal = clamp((p._warmMeal || 0) + gameMin, 0, WARM_MEAL_MIN * 2);
  }

  /** Тик: внутреннее тепло остывает. */
  function warmMealTick(dt, p) {
    if ((p._warmMeal || 0) <= 0) return;
    p._warmMeal = Math.max(0, p._warmMeal - gMin(dt));
  }

  /** Коэффициент теплопотери 0.02..0.06 (мокрота множит до x3). */
  function kFactor(p, cloth) {
    var k = K_BARE - (K_BARE - K_DRESSED) * clamp(cloth.warm / WARM_FOR_MAX, 0, 1);
    var wet = (p._wet || 0) / 100;
    k *= 1 + (WET_K_MUL_MAX - 1) * wet;      // мокрый: до x3 («мороз x3»)
    return k;
  }

  /** Приход метаболического тепла (огонь, натопленная комната), °C/час. */
  function warmGain(p) {
    var gain = 0;
    var fire = fireRadiant(p);
    if (fire > 1) gain += (fire / FIRE_RADIANT_MAX) * WARM_GAIN_FIRE;
    if (heatedRoom(p)) gain += WARM_GAIN_STOVE;
    // горячий чай/еда чуть греют изнутри — приятная мелочь
    if (p.needs.hunger > 70) gain += 0.15;
    // затухание у нормы: огонь греет, но не перегревает выше ~37.3
    // (выше нормы тело поднимает только лихорадка, а не костёр)
    var t = p.temp || CORE_NORM;
    if (t > CORE_NORM - 0.5) {
      gain *= clamp((CORE_NORM + 0.3 - t) / 0.8, 0, 1);
    }
    return Math.max(0, gain);
  }

  /** Тик температуры тела (теплообмен ядра). Возвращает новую p.temp. */
  function coreExchange(dt, p) {
    var cloth = clothing(p);
    var target = CORE_NORM + feverOf(p) + warmMealFever(p);
    var eff = effectiveTemp(p, cloth);
    var k = kFactor(p, cloth);

    var loss = (eff - target) * k;              // °C за игровой час
    var gain = warmGain(p);
    var delta = (loss + gain) * gH(dt);

    p.temp = clamp((p.temp || CORE_NORM) + delta, CORE_MIN, CORE_MAX);

    // статистика самого лютого мороза
    var g = G();
    if (g && g.stats) {
      var out = tempOutside();
      if (!g.stats.coldest || out < g.stats.coldest) {
        g.stats.coldest = Math.round(out * 10) / 10;
      }
    }
    return p.temp;
  }

  // ====================================================================
  //  СТАДИИ ГИПОТЕРМИИ (публичная hypoStage 0..5)
  //  0 — норма (>=36); 1 — «Холодно» (<36); 2 — «ОЧЕНЬ холодно» (<35,
  //  дрожь и -10% скорости); 3 — «Гипотермия» (<34, -25%, рассудок);
  //  4 — «Смертельный холод» (<33, hp, обмороки); 5 — смерть (<31).
  // ====================================================================

  function stageOf(t) {
    if (t >= ST_COLD) return 0;
    if (t >= ST_VERY_COLD) return 1;
    if (t >= ST_HYPO) return 2;
    if (t >= ST_DEADLY) return 3;
    if (t >= ST_DEATH) return 4;
    return 5;
  }

  var STAGE_NAMES = [
    'Тепло', 'Холодно', 'ОЧЕНЬ холодно', 'Гипотермия', 'Смертельный холод', 'Смерть'
  ];

  /** Множитель скорости от холода (для needs.moveMul). */
  function moveFactorOf(stage) {
    switch (stage) {
      case 0: return 1;
      case 1: return 1;
      case 2: return 0.9;     // дрожь — -10%
      case 3: return 0.75;    // гипотермия — -25%
      case 4: return 0.6;
      default: return 0.6;
    }
  }

  /** Применить эффекты стадии (вызывается после пересчёта temp). */
  function stageTick(dt, p) {
    var stage = stageOf(p.temp);
    var n = p.needs;

    // смерть от холода
    if (stage >= 5) {
      die('Вы замёрзли насмерть');
      return;
    }

    // переходы стадий — громкие сообщения
    if (stage !== lastStage) {
      if (stage > lastStage && lastStage >= 0) {
        if (stage === 1) hint('Холодно. Разведите огонь или зайдите в дом', 'cold1', 'warn');
        if (stage === 2) toast('ОЧЕНЬ холодно — вас бьёт дрожь', 'warn');
        if (stage === 3) toast('ГИПОТЕРМИЯ! Нужно тепло, немедленно!', 'bad');
        if (stage === 4) toast('Смертельный холод. Конец близко...', 'bad');
      }
      lastStage = stage;
      // событие для UI/ИИ (индикатор, стон замерзающего)
      try {
        WS.Ev.emit('temp:stage', { stage: stage, name: STAGE_NAMES[stage], core: p.temp });
      } catch (ev) { /* пусто */ }
    }

    // стадия 1: редкие подсказки
    if (stage === 1 && ready('cold:hint', 300)) {
      toast('Пальцы стынут...', 'info');
    }

    // стадия 2: дрожь — мелкая тряска камеры
    if (stage >= 2 && ready('shiver', 2.2)) {
      if (WS.Cam && WS.Cam.kick) {
        try { WS.Cam.kick(0.35 + (ST_VERY_COLD - p.temp) * 0.25); } catch (e) { /* пусто */ }
      }
      // стучат зубы (слышно в упор)
      if (stage >= 3 && Math.random() < 0.3) {
        if (WS.Snd && WS.Snd.play) {
          try { WS.Snd.play('fall', { x: p.x, y: p.y, vol: 0.14 }); } catch (e2) { /* пусто */ }
        }
      }
    }

    // стадия 3: гипотермия — рассудок тает, скорость уже порезана
    if (stage >= 3) {
      n.sanity = clamp(n.sanity - 1.2 * gH(dt), 0, 100);
      // почерк дрожит (см. aimPenalty)
    }

    // стон замерзающего: на 3-4 стадии тело сотрясает — звери слышат
    // (гипотермия делает вас шумной добычей: классическая связка с ai.js)
    if (stage >= 3 && ready('groan', 22)) {
      try { WS.Ev.emit('noise', { x: p.x, y: p.y, r: 6 }); } catch (eN) { /* пусто */ }
      if (WS.Snd && WS.Snd.play) {
        try { WS.Snd.play('fall', { x: p.x, y: p.y, vol: 0.25 }); } catch (eS) { /* пусто */ }
      }
    }

    // стадия 4: урон hp и риск обморока
    if (stage >= 4) {
      systemDamage(1.5 * gH(dt), 'cold');
      if ((p._faintT || 0) <= 0 && Math.random() < 0.004 * gMin(dt)) {
        if (WS.Needs && WS.Needs.faint) {
          try { WS.Needs.faint(rnd(8, 15), 'Сознание меркнет от холода'); }
          catch (e3) { /* пусто */ }
        }
      }
      // парадоксальное раздевание — жуткий реальный феномен глубокой
      // гипотермии: замерзающему кажется жарко (терморецепторы сдают)
      if (ready('paradox', 240) && Math.random() < 0.02) {
        toast('Странно... вам кажется, что жарко...', 'bad');
        n.sanity = clamp(n.sanity - 3, 0, 100);
      }
    }
  }

  // ====================================================================
  //  WARMTH — показометр для HUD (производная от температуры тела)
  // ====================================================================

  function warmthTick(p) {
    var t = p.temp || CORE_NORM;
    var w = clamp((t - ST_DEATH) / (CORE_NORM + 1 - ST_DEATH), 0, 1) * 100;
    p.needs.warmth = Math.round(w);
  }

  // ====================================================================
  //  ОБМОРОЖЕНИЕ (p.frostbite 0..100)
  //  Растёт при t<35 на воздухе; без перчаток x2; насквозь мокрым x4;
  //  ветер до +50%; спать на улице без укрытия x1.5.
  //  Стадии: 30 — пальцы (точность -20%), 60 — сильное (hp, чернеют),
  //  100 — гангрена: 24 игровых часа на ампутацию (медицина B3).
  // ====================================================================

  function frostbiteTick(dt, p) {
    var cloth = clothing(p);
    var inside = insideB(p);
    var wet = p._wet || 0;
    var t = p.temp || CORE_NORM;
    var fb = p.frostbite || 0;

    var wasBelow30 = fb >= FB_FINGERS;
    var wasBelow60 = fb >= FB_SEVERE;

    if (t < ST_VERY_COLD && (!inside || wet > 40)) {
      // рост обморожения
      var rate = FB_BASE_H;
      if (!hasGloves(p)) rate *= FB_NO_GLOVES;
      if (wet >= 70) rate *= FB_WET;                    // в воде / насквозь
      rate *= 1 + windLevel() * FB_WIND_MUL * (inside ? 0.3 : 1);
      if (p.sleeping && !inside && p._sleepKind !== 'bed' && p._sleepKind !== 'roll') {
        rate *= FB_SLEEP_OUT;
      }
      fb = clamp(fb + rate * gH(dt), 0, 100);
    } else {
      // лечение: тёплое место
      var fire = fireRadiant(p);
      if (fire >= 8 && t > 36) {
        fb = Math.max(0, fb - FB_HEAL_FIRE_H * gH(dt));
      } else if (heatedRoom(p) && t > 36.5) {
        fb = Math.max(0, fb - FB_HEAL_ROOM_H * gH(dt));
      }
    }

    p.frostbite = fb;

    // переходы стадий — сообщения игроку
    if (!wasBelow30 && fb >= FB_FINGERS) {
      toast('Обморожение пальцев — руки не слушаются', 'bad');
      hint('Точность оружия снижена. Согрейтесь у огня', 'fb1', 'warn');
    }
    if (!wasBelow60 && fb >= FB_SEVERE) {
      toast('СИЛЬНОЕ ОБМОРОЖЕНИЕ — пальцы чернеют!', 'bad');
      hint('Без тепла начнётся гангрена', 'fb2', 'bad');
    }

    // урон от тяжёлых стадий
    if (fb >= FB_SEVERE && fb < FB_GANGRENE) {
      systemDamage(FB_SEVERE_DMG_H * gH(dt), 'frostbite');
    }

    // гангрена
    if (fb >= FB_GANGRENE) {
      p._gangreneH = (p._gangreneH || 0) + gH(dt);
      systemDamage(GANGRENE_DMG_H * gH(dt), 'frostbite');
      if (ready('gangrene:warn', 600)) {
        toast('ГАНГРЕНА. Нужна ампутация — иначе конец', 'bad');
      }
      if (p._gangreneH >= GANGRENE_LETHAL_H) {
        die('Вы умерли от гангрены');
      }
    } else if (fb < 90) {
      p._gangreneH = 0;      // отступила (или ампутировали)
    }
  }

  /**
   * ПУБЛИЧНО: ампутация (медицина B3 или суровое самолечение).
   * Убирает гангрену ценой пальцев: обморожение падает до 35,
   * боль и потеря крови.
   */
  function amputate() {
    var p = P();
    if (!p || (p.frostbite || 0) < FB_SEVERE) return false;
    p.frostbite = 35;
    p._gangreneH = 0;
    p.pain = clamp((p.pain || 0) + 45, 0, 100);
    p.needs.sanity = clamp(p.needs.sanity - 8, 0, 100);
    p.hp = Math.max(1, p.hp - 18);
    toast('Пальцы отняты. Вы выжили... какой ценой', 'bad');
    try { WS.Ev.emit('player:amputate', {}); } catch (e) { /* пусто */ }
    return true;
  }

  // ====================================================================
  //  МОКРОТА (p._wet 0..100) и мокрая одежда (p._wetWear)
  //  Падение в прорубь = мгновенно 100. Пурга мочит. Сушимся у огня:
  //  -20 за игровую минуту (по ТЗ). Мокрая одежда теряет 60% тепла.
  // ====================================================================

  function wetTick(dt, p) {
    var cloth = clothing(p);
    var inside = insideB(p);
    var wet = p._wet || 0;
    var wid = weatherId();

    // источники
    if (!inside) {
      if (wid === 'blizzard' || wid === 'snowstorm') {
        wet += (cloth.wetProt < 120 ? WET_STORM_H : WET_STORM_H / 3) * gH(dt);
      } else if (wid === 'snow') {
        if (cloth.wetProt < 80) wet += WET_SNOW_H * gH(dt);
      }
    }

    // сушка
    var fire = fireRadiant(p);
    if (fire > 4) {
      wet -= WET_DRY_FIRE_MIN * gMin(dt);          // -20 за игровую минуту
    } else if (heatedRoom(p)) {
      wet -= WET_DRY_ROOM_H * gH(dt);
    } else if (inside) {
      wet -= WET_DRY_IN_H * gH(dt);
    } else {
      wet -= WET_DRY_OUT_H * gH(dt);
    }

    wet = clamp(wet, 0, 100);
    p._wet = wet;

    // одежда сохнет вдвое медленнее тела
    if (!p._wetWear) p._wetWear = {};
    var targetWet = wet / 100;
    for (var slot in SLOT_WEIGHTS) {
      if (!SLOT_WEIGHTS.hasOwnProperty(slot)) continue;
      var cur = (typeof p._wetWear[slot] === 'number') ? p._wetWear[slot] : 0;
      var rate = (fire > 4 ? 0.25 : 0.02) * rSec(dt);   // у огня — быстро
      if (cur > targetWet) cur = Math.max(targetWet, cur - rate);
      else cur = Math.min(targetWet, cur + rate * 0.5); // промокнуть — не мигом
      p._wetWear[slot] = clamp(cur, 0, 1);
    }

    // подсказка про мокрую одежду
    if (wet > 55 && ready('wet:hint', 420)) {
      toast('Вы насквозь промокли — сушийтесь у огня!', 'warn');
    }

    // озноб после проруби (таймер скорости -50%)
    if ((p._chillT || 0) > 0) p._chillT = Math.max(0, p._chillT - rSec(dt));
  }

  // ====================================================================
  //  ПАДЕНИЕ В ПРОРУБЬ (событие 'player:fall_water')
  //  Мгновенно: мокрота 100 (и вся одежда), тело -2°C, скорость -50%
  //  на 5 секунд, пока мокрый — мороз x3 (см. kFactor).
  // ====================================================================

  function onFallWater(d) {
    var p = P();
    if (!p) return;
    p._wet = 100;
    if (!p._wetWear) p._wetWear = {};
    for (var slot in SLOT_WEIGHTS) {
      if (SLOT_WEIGHTS.hasOwnProperty(slot)) p._wetWear[slot] = 1;
    }
    p.temp = Math.max(CORE_MIN, (p.temp || CORE_NORM) - 2);
    p._chillT = 5;                     // реальных секунд продрогшей походки
    p.needs.sanity = clamp(p.needs.sanity - 4, 0, 100);

    // эффекты
    var x = (d && typeof d.x === 'number') ? d.x : p.x;
    var y = (d && typeof d.y === 'number') ? d.y : p.y;
    if (WS.Fx && WS.Fx.burst) {
      try {
        WS.Fx.burst('splash', x, y, 10);
        WS.Fx.burst('steam', x, y, 6);
      } catch (e) { /* пусто */ }
    }
    if (WS.Snd && WS.Snd.play) {
      try { WS.Snd.play('splash', { x: x, y: y, vol: 0.9 }); } catch (e2) { /* пусто */ }
    }
    if (WS.Cam && WS.Cam.kick) {
      try { WS.Cam.kick(6); } catch (e3) { /* пусто */ }
    }
    toast('Вы провалились под лёд! Ледяная вода!', 'bad');
    hint('Мокрым на морозе — верная смерть. К огню!', 'icehole', 'bad');
  }

  /** Смена погоды: предупреждаем о ревком похолодании/пурге. */
  function onWeatherChanged(d) {
    var p = P();
    if (!p) return;
    var to = d && d.to ? d.to : weatherId();
    if (!to) return;
    var inside = insideB(p);
    if (to === 'hard_frost' && ready('wx:frost', 1800)) {
      toast(inside ? 'Снаружи трещит лютый мороз' : 'ЛЮТЫЙ МОРОЗ. Ищите укрытие!', 'bad');
    } else if ((to === 'blizzard' || to === 'snowstorm') && ready('wx:storm', 1800)) {
      toast(inside ? 'Пурга завывает в трубах' : 'ПУРГА! Ветер сбивает с ног', 'bad');
      if (!inside) hint('На пурге мокрая одежда смерзается — держитесь дома', 'wxstorm', 'warn');
    } else if (to === 'clear' && ready('wx:clear', 1800)) {
      toast('Небо проясняется', 'info');
    }
  }

  // ====================================================================
  //  ПРОСТУДА ОТ ПЕРЕОХЛАЖДЕНИЯ
  //  Если t<35 дольше 2 игровых часов — 30% простуды (чихание слышат
  //  волки — см. needs.js). Грипп осложняет простуду (needs.js).
  // ====================================================================

  function sicknessTick(dt, p) {
    var g = G();
    var t = p.temp || CORE_NORM;

    if (t < ST_VERY_COLD) {
      p._coldExp = (p._coldExp || 0) + gH(dt);
      if (p._coldExp >= COLD_EXPOSURE_H) {
        p._coldExp = 0;
        if (Math.random() * 100 < COLD_CHANCE) {
          makeCold(p);
        }
      }
    } else if (t > 36.5) {
      p._coldExp = Math.max(0, (p._coldExp || 0) - gH(dt) * 2);
    }

    // лихорадка сушит (потеешь) — мелочь, но честно
    if (feverOf(p) > 0.5 && ready('fever:thirst', 900)) {
      toast('Лихорадка сушит вас', 'warn');
    }
  }

  /** Назначить простуду (через WS.Needs если он есть). */
  function makeCold(p) {
    if (WS.Needs && WS.Needs.makeSick) {
      try { WS.Needs.makeSick('cold', COLD_DURATION); return; } catch (e) { /* ниже сами */ }
    }
    if (!p.sick) {
      p.sick = { id: 'cold', t: COLD_DURATION };
      toast('Вы простудились', 'bad');
    }
  }

  // ====================================================================
  //  ГЛАВНЫЙ ТИК (приоритет 40, после needs)
  // ====================================================================

  function tempTick(dt) {
    var g = G();
    if (!g || !g.running || g.dead) return;
    sysTime += dt;
    var p = P();
    if (!p) return;

    try {
      if (typeof p.temp !== 'number') p.temp = CORE_NORM;
      if (typeof p.frostbite !== 'number') p.frostbite = 0;
      if (typeof p._wet !== 'number') p._wet = 0;

      // 1) мокрота (влияет на всё ниже)
      wetTick(dt, p);

      // 2) теплообмен ядра
      coreExchange(dt, p);

      // 3) стадии гипотермии и их эффекты
      stageTick(dt, p);
      if (g.dead) return;

      // 4) обморожение
      frostbiteTick(dt, p);
      if (g.dead) return;

      // 5) простуда от переохлаждения
      sicknessTick(dt, p);

      // 6) внутреннее тепло от горячей еды/чая
      warmMealTick(dt, p);

      // 7) показометр тепла для HUD
      warmthTick(p);
    } catch (err) {
      WS.err('tempTick:', err && err.message);
    }
  }

  // ====================================================================
  //  СБРОС ПАРТИИ
  // ====================================================================

  function onGameStart() {
    cd = {};
    sysTime = 0;
    clothCache = null;
    clothCacheT = -1;
    lastStage = -1;
    var g = G();
    var p = g && g.player;
    if (!p) return;
    p.temp = CORE_NORM;
    p.frostbite = 0;
    p._wet = 0;
    p._wetWear = {};
    p._chillT = 0;
    p._coldExp = 0;
    p._gangreneH = 0;
    p._warmMeal = 0;
    p.needs.warmth = 100;
  }

  function onGameLoad() {
    // сейв уже несёт _wet/_wetWear/sick — только подчистить кэши
    cd = {};
    sysTime = 0;
    clothCache = null;
    clothCacheT = -1;
    lastStage = -1;
    var g = G();
    var p = g && g.player;
    if (!p) return;
    if (typeof p.temp !== 'number') p.temp = CORE_NORM;
    if (typeof p.frostbite !== 'number') p.frostbite = 0;
    if (typeof p._wet !== 'number') p._wet = 0;
    if (!p._wetWear) p._wetWear = {};
    if (typeof p._gangreneH !== 'number') p._gangreneH = 0;
    if (typeof p._warmMeal !== 'number') p._warmMeal = 0;
  }

  // ====================================================================
  //  КАЛИБРОВКА МОДЕЛИ (для балансировки из консоли)
  //
  //  WS.Temp.simulate(hours, warm, wet, out) — сколько будет тело через
  //  N игровых часов при заданной одежде/мокроте/морозе, без партии.
  //  Ориентиры (без огня, ветер 0.3, лежа на месте):
  //    раздетый  (warm 0)   при -12: 37 -> 30.7 за 2 ч (смерть к исходу 2-го)
  //    тёплый    (warm 200) при -12: 37 -> 34.9 за 2 ч (нужен огонь/дом)
  //    раздетый  при -35 (пурга): 37 -> 30 за ~1.5 ч
  //    мокрый    (wet 100) замерзает втрое быстрее сухого
  //    у костра  (радиант 20 + затухание у 37.3) — верно согревает и держит
  //    сон в доме без печи: к утру тяжёлая гипотермия; с печью — тепло
  // ====================================================================

  /** Упрощённая симуляция для баланса (не трогает партию). */
  function simulate(hours, warm, wet, out, fireHeat) {
    var t = CORE_NORM;
    var k = K_BARE - (K_BARE - K_DRESSED) * clamp((warm || 0) / WARM_FOR_MAX, 0, 1);
    k *= 1 + (WET_K_MUL_MAX - 1) * clamp((wet || 0) / 100, 0, 1);
    var eff = (typeof out === 'number' ? out : -12) - (4 + 0.3 * 14) * 0.4;
    if (typeof fireHeat === 'number') eff += fireHeat;
    var gain = typeof fireHeat === 'number' ?
      (fireHeat / FIRE_RADIANT_MAX) * WARM_GAIN_FIRE : 0;
    var steps = Math.max(1, Math.round((hours || 1) * 10));
    for (var i = 0; i < steps; i++) {
      t = clamp(t + ((eff - CORE_NORM) * k + gain) * (hours / steps), CORE_MIN, CORE_MAX);
    }
    return Math.round(t * 100) / 100;
  }

  // ====================================================================
  //  САМОТЕСТ
  // ====================================================================

  function selftest() {
    var out = [];
    var pass = 0, fail = 0;
    function ok(name, cond) {
      if (cond) { pass++; out.push('  ok   ' + name); }
      else { fail++; out.push('  FAIL ' + name); }
      return !!cond;
    }
    ok('модуль зарегистрирован', !!WS.Temp);
    ok('фолбэк погоды в границах', tempOutside() <= -5 && tempOutside() >= -45);
    ok('ветер 0..1', windLevel() >= 0 && windLevel() <= 1);
    var p = P();
    if (p) {
      ok('стадия 0..5', stageOf(p.temp) >= 0 && stageOf(p.temp) <= 5);
      ok('feelsLike — число', typeof effectiveTemp(p, clothing(p)) === 'number');
      ok('k-фактор 0.015..0.2', (function () {
        var k = kFactor(p, clothing(p));
        return k >= 0.015 && k <= 0.2;
      })());
      ok('moveFactor 0.5..1', moveFactorOf(stageOf(p.temp)) >= 0.5 &&
         moveFactorOf(stageOf(p.temp)) <= 1);
    }
    // пороги стадий строго по ТЗ
    ok('пороги 36/35/34/33/31', ST_COLD === 36 && ST_VERY_COLD === 35 &&
       ST_HYPO === 34 && ST_DEADLY === 33 && ST_DEATH === 31);
    // модельные ориентиры (без партии)
    var bare2h = simulate(2, 0, 0, -12);
    ok('раздетый при -12 за 2ч: <=33.5 (' + bare2h + ')', bare2h <= 33.5);
    var warm2h = simulate(2, 200, 0, -12);
    ok('одетый при -12 за 2ч: >34.5 (' + warm2h + ')', warm2h > 34.5);
    var wet2h = simulate(2, 200, 100, -12);
    ok('мокрый одетый замерзает быстрее сухого', wet2h < warm2h - 0.5);
    var fire2h = simulate(2, 200, 0, -35, FIRE_RADIANT_MAX);
    ok('у костра при -35 не смерзнет насмерть (' + fire2h + ')', fire2h > ST_DEATH);
    out.unshift('temp.selftest: ' + pass + ' ок, ' + fail + ' провалено');
    return out;
  }

  // ====================================================================
  //  ПУБЛИЧНЫЙ API
  // ====================================================================

  var Temp = {
    /** «Ощущаемая» температура среды, °C (для HUD). */
    feelsLike: function () {
      var p = P();
      if (!p) return tempOutside();
      return Math.round(effectiveTemp(p, clothing(p)) * 10) / 10;
    },

    /** Температура воздуха снаружи (сырая, без одежды/ветрозащиты). */
    outside: function () { return Math.round(tempOutside() * 10) / 10; },

    /** Температура ядра тела. */
    core: function () {
      var p = P();
      return p ? (Math.round((p.temp || CORE_NORM) * 10) / 10) : CORE_NORM;
    },

    /** Стадия гипотермии 0..5. */
    hypoStage: function () {
      var p = P();
      return p ? stageOf(p.temp || CORE_NORM) : 0;
    },

    /** Человекочитаемое имя стадии. */
    stageName: function () {
      return STAGE_NAMES[stageOf(P() ? P().temp || CORE_NORM : CORE_NORM)] || '';
    },

    /** Мокрота 0..100. */
    wetness: function () {
      var p = P();
      return p ? Math.round(p._wet || 0) : 0;
    },

    /** Обморожение 0..100. */
    frostbite: function () {
      var p = P();
      return p ? Math.round(p.frostbite || 0) : 0;
    },

    /** Мокрота конкретной вещи (0..1) — для UI инвентаря. */
    slotWet: function (slot) {
      var p = P();
      return p ? slotWet(p, slot) : 0;
    },

    /** Внутренняя сушка (вызывается тиком; оставлено публичным по ТЗ). */
    dry: wetTick,

    /** Множитель скорости от холода (для needs.moveMul). */
    moveFactor: function () {
      var p = P();
      if (!p) return 1;
      return moveFactorOf(stageOf(p.temp || CORE_NORM));
    },

    /** Штраф точности от обморожения/гипотермии, % (для боевых систем). */
    aimPenalty: function () {
      var p = P();
      if (!p) return 0;
      var pen = 0;
      var fb = p.frostbite || 0;
      if (fb >= FB_FINGERS) pen += 20;
      if (fb >= FB_SEVERE) pen += 15;
      var st = stageOf(p.temp || CORE_NORM);
      if (st >= 3) pen += 15;
      if (st >= 4) pen += 15;
      return Math.round(clamp(pen, 0, 70));
    },

    /** Ампутация при гангрене (медицина B3 зовёт сама). */
    amputate: amputate,

    /** Горячая еда/чай: минуты внутреннего тепла (зовут fire.js/needs.js). */
    warmMeal: warmMeal,

    /** Оставшиеся минуты внутреннего тепла (для HUD). */
    warmMealLeft: function () {
      var p = P();
      return p ? Math.round(p._warmMeal || 0) : 0;
    },

    /** Полная отладка модели (консоль/экран статуса). */
    debug: function () {
      var p = P();
      if (!p) return null;
      var cloth = clothing(p);
      return {
        out: Math.round(tempOutside() * 10) / 10,
        wind: Math.round(windLevel() * 100) / 100,
        weather: weatherId(),
        feels: Math.round(effectiveTemp(p, cloth) * 10) / 10,
        core: Math.round((p.temp || CORE_NORM) * 100) / 100,
        stage: stageOf(p.temp || CORE_NORM),
        stageName: STAGE_NAMES[stageOf(p.temp || CORE_NORM)],
        k: Math.round(kFactor(p, cloth) * 1000) / 1000,
        warm: Math.round(cloth.warm),
        windProt: Math.round(cloth.wind),
        wetProt: Math.round(cloth.wetProt),
        wet: Math.round(p._wet || 0),
        fire: Math.round(fireRadiant(p) * 10) / 10,
        inside: insideB(p),
        heatedRoom: heatedRoom(p),
        frostbite: Math.round(p.frostbite || 0),
        gangreneH: Math.round((p._gangreneH || 0) * 10) / 10,
        fever: feverOf(p),
        chillT: Math.round((p._chillT || 0) * 10) / 10
      };
    },

    /** Внутреннее время модуля. */
    time: function () { return sysTime; },

    /** Симуляция для баланса (не трогает партию). */
    simulate: simulate,

    selftest: selftest
  };

  WS.def('Temp', Temp);

  // ====================================================================
  //  BOOT
  // ====================================================================

  WS.boot(function initTemp() {
    // тик систем — приоритет 40 (после needs: fire уже прогорел на 20)
    WS.tick(TICK_PRI, tempTick, 'sys:temp');

    // падение в прорубь (рыбалка/лёд — эмитят другие модули)
    WS.Ev.on('player:fall_water', onFallWater);

    // смена погоды — предупреждения игроку
    WS.Ev.on('weather:changed', onWeatherChanged);

    // сброс/загрузка партии
    WS.Ev.on('game:start', onGameStart);
    WS.Ev.on('game:load', onGameLoad);

    WS.log('temp: модель температуры зарегистрирована (тик ' + TICK_PRI + ')');
  }, 'temp:init');

})();
