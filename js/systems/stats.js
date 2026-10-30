/**
 * stats.js — РАСШИРЕННАЯ СТАТИСТИКА «Белого Безмолвия» (J2).
 * Тихий сборный модуль: слушает события и опрашивает мир раз в секунду,
 * расширяя WS.G.stats (базовые поля — core/state.js; боевые — combat.js).
 * Свои поля: время, холод, еда, бой, путь, люди, сон, хозяйство.
 * API: WS.Stats.snapshot() — снимок словарём для журнала/финала,
 * WS.Stats.formatted() — массив {label, value} готовыми строками,
 * WS.Stats.bump/set/get — ручная коррекция для соседних модулей.
 * Связи: state, Time, World, Weather/Temp, Inv, health (кровь), skills.
 */
(function () {
  'use strict';

  // ====================================================================
  //  КОНСТАНТЫ
  // ====================================================================

  var TICK_PRI = 43;           // системы: после боёв/нужд (40-41), до ачивок (44)
  var SNAP_EVERY = 1;          // опрос мира раз в секунду симуляции
  var BLOOD_L_PER_HP = 0.05;   // литров крови на 1 hp (100 hp ≈ 5 л)
  var BANDIT_R = 12;           // радиус «встречи» с бандитом, тайлов
  var BANDIT_FAR = 14;         // дальше этого — встреча закончилась
  var HOLE_R = 3;              // радиус обнаружения проруби, тайлов
  var NIGHT_SLEEP_MIN = 120;   // игровых минут сна за ночь, чтобы считать ночь
  var TELEPORT = 6;            // больше этого за тик — телепорт, не путь

  // Пороги для «часов» (в единицах нужды 0..100)
  var HUNGRY_AT = 15;          // ниже — «голодные» часы
  var THIRSTY_AT = 15;         // ниже — часы жажды
  var FROST_AT = -30;          // °C, ниже — «часы мороза»

  // ====================================================================
  //  СОСТОЯНИЕ МОДУЛЯ (вне сейва; сами счётчики — в WS.G.stats)
  // ====================================================================

  var snapT = 0;               // накопитель до следующего опроса

  var lastX = null;            // прошлая позиция игрока (для пути)
  var lastY = null;

  var seenBandits = {};        // id бандита -> {met, sneaked, aggro, counted}
  var seenHoles = {};          // id проруби -> 1
  var seenBuildings = {};      // ключ здания -> 1
  var bIndex = null;           // ключ здания -> 1 (все здания, для сравнения)

  var dayStart = null;         // значения счётчиков на начало дня (для истории)

  var nightSleep = {           // накопитель сна текущей ночи (игровые минуты)
    min: 0, bed: 0, roll: 0, floor: 0, open: 0
  };

  var prevFrostbite = 0;       // прошлое обморожение (переходы стадий)
  var prevRep = null;          // прошлая репутация Акима (рост = обмен)
  var lastAteAt = -99;         // минута последней еды (антидубль cook:ate)
  var lastAteId = '';

  // ====================================================================
  //  МАЛЫЕ УТИЛИТЫ
  // ====================================================================

  function G() { return WS.G || null; }
  function P() { var g = WS.G; return (g && g.player) || null; }

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  function playing() {
    var g = G();
    return !!(g && g.running && !g.dead && g.player);
  }

  /** Счётчики — всегда в G.stats (переживают сейв). */
  function st() {
    var g = G();
    if (!g) return null;
    if (!g.stats || typeof g.stats !== 'object') g.stats = {};
    return g.stats;
  }

  function bump(k, n) {
    var s = st();
    if (!s) return 0;
    s[k] = (Number(s[k]) || 0) + (n || 1);
    return s[k];
  }

  function set(k, v) {
    var s = st();
    if (s) s[k] = v;
  }

  function get(k) {
    var s = st();
    return s ? (Number(s[k]) || 0) : 0;
  }

  function day() {
    return (WS.Time && WS.Time.day) ? WS.Time.day() : ((G() && G().time) ? G().time.day : 1);
  }

  function totalMin() {
    return (WS.Time && WS.Time.totalMin) ? WS.Time.totalMin() : 0;
  }

  /** Игровые минуты за dt секунд симуляции (как needs.js). */
  function gameMin(dt) {
    var sp = (WS.Loop && WS.Loop.speed) ? WS.Loop.speed : 1;
    if (sp < 1) sp = 1;
    var ts = (WS.Time && WS.Time.timeScale) ? WS.Time.timeScale() : 1;
    return dt * sp * ts;
  }

  /** Реальные секунды за dt шагов симуляции (учитываем ускорение). */
  function wallSec(dt) {
    var sp = (WS.Loop && WS.Loop.speed) ? WS.Loop.speed : 1;
    if (sp < 1) sp = 1;
    return dt / sp;
  }

  /** Температура за бортом, °C. */
  function tempOut() {
    try {
      if (WS.Temp && typeof WS.Temp.outside === 'function') return WS.Temp.outside();
    } catch (e) { /* фолбэк ниже */ }
    try {
      if (WS.Weather && typeof WS.Weather.tempOutside === 'function') {
        return WS.Weather.tempOutside();
      }
    } catch (e2) { /* фолбэк ниже */ }
    return -12;
  }

  function itemDef(id) {
    try {
      return (WS.Data && WS.Data.items && WS.Data.items[id]) || null;
    } catch (e) { return null; }
  }

  function isPlayerEnt(e) {
    var p = P();
    return !!(e && p && (e === p || e.id === 'player' || e.kind === 'player'));
  }

  /** Русская плюрализация: plural(5, 'день', 'дня', 'дней'). */
  function plural(n, one, few, many) {
    n = Math.abs(Math.round(n)) % 100;
    if (n > 10 && n < 20) return many;
    var d = n % 10;
    if (d === 1) return one;
    if (d >= 2 && d <= 4) return few;
    return many;
  }

  /** «1 ч 20 мин» / «45 мин». */
  function fmtDur(min) {
    min = Math.max(0, Math.round(min));
    var h = Math.floor(min / 60);
    var m = min % 60;
    if (!h) return m + ' мин';
    if (!m) return h + ' ч';
    return h + ' ч ' + m + ' мин';
  }

  /** «3,5 л» — одна десятая точность. */
  function fmtL(l) {
    return (Math.round(l * 10) / 10).toFixed(1).replace('.', ',') + ' л';
  }

  /** Ключ здания. */
  function bkey(b) {
    if (!b) return '?';
    return b.id ? String(b.id) : (b.x + ',' + b.y);
  }

  // ====================================================================
  //  СОБЫТИЙНЫЕ СЛУШАТЕЛИ
  // ====================================================================

  /** Еда из кармана/инвентаря (needs.eat). */
  function onAte(d) {
    if (!playing() || !d || !d.id) return;
    bump('eatenUnits');
    var def = itemDef(d.id);
    if (def && def.cal) bump('caloriesEaten', def.cal);
    lastAteAt = totalMin();
    lastAteId = d.id;
  }

  /** Блюдо из котелка (cooking). Дубль с player:ate гасим по времени. */
  function onCookAte(d) {
    if (!playing() || !d || !d.id) return;
    if (d.id === lastAteId && Math.abs(totalMin() - lastAteAt) < 2) return;
    bump('eatenUnits');
    bump('mealsEaten');
    var def = itemDef(d.id);
    if (def && def.cal) {
      // качество немного меняет калорийность (по схеме cooking.js)
      var q = (typeof d.q === 'number') ? d.q : 1;
      bump('caloriesEaten', Math.round(def.cal * (0.85 + 0.15 * q)));
    }
    lastAteAt = totalMin();
    lastAteId = d.id;
  }

  /** Питьё: вода, чай, спирт. */
  function onDrank(d) {
    if (!playing() || !d || !d.id) return;
    bump('drankUnits');
    var def = itemDef(d.id);
    var watery = (d.id === 'snow') || (d.id === 'water_flask') ||
                 (def && def.thir && def.thir > 0);
    if (watery) bump('waterUnits');
    if (def && def.drunk && def.drunk >= 15) bump('boozeUnits');
  }

  /** Болезнь: отравление = «съел испорченное». */
  function onSick(d) {
    if (!playing() || !d) return;
    if (d.id === 'food_poisoning' || d.id === 'food_poison') {
      bump('spoiledEaten');
    }
  }

  /** Промах в ближнем бою (наш — считаем). */
  function onMiss(d) {
    if (!playing() || !d) return;
    if (isPlayerEnt(d.src)) bump('misses');
  }

  /** Урон игроку: типы, источники, суммарный урон. */
  function onDamage(d) {
    if (!playing() || !d) return;
    if (d.applied === false) return;
    var amt = Number(d.amount) || 0;
    if (amt > 0) bump('damageTaken', amt);
    var src = d.src || null;
    var kind = src ? src.kind : null;
    if (d.type === 'bite' && kind === 'wolf') bump('wolfBites');
    if (d.type === 'claw' && kind === 'bear') bump('bearHits');
    if (d.type === 'bite' && kind === 'bear') bump('bearHits');
    if (kind === 'bandit') bump('banditHits');
  }

  /** Перевязка. */
  function onHeal(d) {
    if (!playing() || !d) return;
    if (d.kind === 'bandage' || d.item === 'bandage' || d.item === 'bandage_clean') {
      bump('bandagesUsed');
    }
  }

  /** Обыск контейнера: трупы отдельно (остальное — looting.js). */
  function onLooted(d) {
    if (!playing() || !d) return;
    var o = d.o;
    if (!o) return;
    if (typeof o.container === 'string' && o.container.indexOf('corpse_') === 0) {
      bump('corpsesLooted');
    }
  }

  /** Подбор предметов (с земли, из лута, с кустов). */
  function onPicked(d) {
    if (!playing() || !d || !d.id) return;
    var n = (typeof d.count === 'number') ? Math.max(1, d.count) : 1;
    bump('itemsPicked', n);
  }

  /** Рыбалка: рыба — редкий гость в статистике, ловим каждую. */
  function onFish(d) {
    if (!playing()) return;
    var n = (d && typeof d.n === 'number') ? d.n : 1;
    bump('fishCaught', n);
    if (d && d.how === 'net') bump('netFishCaught', n);
    if (d && d.how === 'trap') bump('trapFishCaught', n);
  }

  /** Убийство сущности игроком: все виды — в карту killsByKind. */
  function onEntKill(d) {
    if (!playing() || !d) return;
    if (!isPlayerEnt(d.by)) return;
    var e = d.ent;
    var kind = (e && e.kind) || 'unknown';
    var s = st();
    if (!s) return;
    if (!s.killsByKind || typeof s.killsByKind !== 'object') s.killsByKind = {};
    s.killsByKind[kind] = (Number(s.killsByKind[kind]) || 0) + 1;
  }

  /** Радиопередача услышана. */
  function onRadio() {
    if (playing()) bump('radioHeard');
  }

  /** Разжёгся огонь. */
  function onFireLit(d) {
    if (!playing() || !d) return;
    if (d.kind === 'camp') bump('firesBuilt');
    else if (d.kind === 'stove') bump('stovesLit');
  }

  /** Вещь сломалась / починена. */
  function onBroken() { if (playing()) bump('itemsBroken'); }
  function onRepaired() { if (playing()) bump('itemsRepaired'); }

  /** Разделка туши. */
  function onButchered() {
    if (playing()) bump('butcheredCount');
  }

  /** Погода: метели посчитаем — это северная валюта. */
  function onWeather(d) {
    if (!playing() || !d) return;
    if (d.to === 'blizzard' || d.to === 'snowstorm') bump('blizzardsSeen');
    if (d.to === 'hard_frost') bump('hardFrostsSeen');
  }

  /** Прорубь. */
  function onFallWater() {
    if (playing()) bump('fallsIntoWater');
  }

  /** Ампутация. */
  function onAmputate() {
    if (playing()) bump('amputations');
  }

  /** Музыка. */
  function onPlayed() {
    if (playing()) bump('musicPlays');
  }

  /** Рассвет: закрыть ночь сна. */
  function onDawn() {
    var ns = nightSleep;
    if (ns.min >= NIGHT_SLEEP_MIN) {
      // где спали больше — там и ночь
      var open = ns.open >= ns.min * 0.5;
      var bed = ns.bed >= ns.min * 0.5;
      if (open) bump('openNights');
      else if (bed) bump('bedNights');
      else bump('floorNights');
    }
    nightSleep = { min: 0, bed: 0, roll: 0, floor: 0, open: 0 };
  }

  // --------------------------------------------------------------------
  //  ИСТОРИЯ ПО ДНЯМ: короткая строка на день для графика/хроники
  // --------------------------------------------------------------------

  /** Сохранить стартовые значения счётчиков дня. */
  function markDayStart() {
    var s = st();
    if (!s) return;
    dayStart = {
      wolves: Number(s.wolvesKilled) || 0,
      bears: Number(s.bearsKilled) || 0,
      bandits: Number(s.banditsKilled) || 0,
      animals: Number(s.animalsHunted) || 0,
      fish: Number(s.fishCaught) || 0,
      loot: Number(s.containersLooted) || 0,
      craft: Number(s.itemsCrafted) || 0,
      picked: Number(s.itemsPicked) || 0,
      tiles: Number(s.tilesWalked) || 0,
      ate: Number(s.eatenUnits) || 0
    };
  }

  /** Закрыть прошедший день: разница счётчиков уходит в историю. */
  function closeDay(prevDay) {
    var s = st();
    if (!s || !dayStart) return;
    var rec = {
      day: prevDay,
      wolves: (Number(s.wolvesKilled) || 0) - dayStart.wolves,
      bears: (Number(s.bearsKilled) || 0) - dayStart.bears,
      bandits: (Number(s.banditsKilled) || 0) - dayStart.bandits,
      animals: (Number(s.animalsHunted) || 0) - dayStart.animals,
      fish: (Number(s.fishCaught) || 0) - dayStart.fish,
      loot: (Number(s.containersLooted) || 0) - dayStart.loot,
      craft: (Number(s.itemsCrafted) || 0) - dayStart.craft,
      picked: (Number(s.itemsPicked) || 0) - dayStart.picked,
      tiles: Math.round((Number(s.tilesWalked) || 0) - dayStart.tiles),
      ate: (Number(s.eatenUnits) || 0) - dayStart.ate
    };
    for (var k in rec) {
      if (rec.hasOwnProperty(k) && typeof rec[k] === 'number' && rec[k] < 0) {
        rec[k] = 0;   // сейв/пересборка мира не должны портить график
      }
    }
    if (!s.history || !s.history.push) s.history = [];
    s.history.push(rec);
    while (s.history.length > 64) s.history.shift();
  }

  /** Новый день (событие time:day): закрыть вчерашний, разметить новый. */
  function onNewDay(d) {
    if (!playing()) return;
    var prev = (d && d.day) ? d.day - 1 : day() - 1;
    if (dayStart) closeDay(prev);
    markDayStart();
  }

  /** Старт/загрузка партии: чистим опросное состояние. */
  function onGameStart() {
    initModuleState();
  }

  function onGameLoad() {
    initModuleState();
    // после загрузки — не теряем накопленное в G.stats, только опрос
  }

  function initModuleState() {
    snapT = 0;
    lastX = null;
    lastY = null;
    seenBandits = {};
    seenHoles = {};
    seenBuildings = {};
    bIndex = null;
    nightSleep = { min: 0, bed: 0, roll: 0, floor: 0, open: 0 };
    prevFrostbite = (P() && P().frostbite) || 0;
    prevRep = null;
    lastAteAt = -99;
    lastAteId = '';
    st();                      // гарантирует g.stats
    markDayStart();            // отсчёт дня — с загрузки/старта
  }

  // ====================================================================
  //  ОПРОС МИРА — раз в секунду симуляции
  // ====================================================================

  /** Путь: приращение позиции (по прямой, с защитой от телепортов). */
  function walkPoll(p) {
    if (lastX !== null && lastY !== null) {
      var dx = p.x - lastX, dy = p.y - lastY;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d > 0.01 && d < TELEPORT) bump('tilesWalked', d);
    }
    lastX = p.x;
    lastY = p.y;
  }

  /** Здания: были внутри? */
  function buildingPoll(p) {
    var world = WS.World;
    if (!world || !world.isInside) return;
    var b = world.isInside(p.x, p.y);
    if (b && !seenBuildings[bkey(b)]) seenBuildings[bkey(b)] = 1;
  }

  /** Проруби: подошли близко — посещена. */
  function holePoll(p) {
    var world = WS.World;
    if (!world || !world.query) return;
    var near = null;
    try {
      near = world.query(p.x - HOLE_R, p.y - HOLE_R, p.x + HOLE_R, p.y + HOLE_R);
    } catch (e) { return; }
    if (!near || !near.length) return;
    for (var i = 0; i < near.length; i++) {
      var o = near[i];
      if (!o || !o.id) continue;
      if (o.sprName === 'ice_hole' || o.sprName === 'ice_covered') {
        seenHoles[o.id] = 1;
      }
    }
  }

  /** Спокойны ли бандиты (для «избеганий»). */
  function banditCalm(e) {
    return e.state === 'camp' || e.state === 'patrol';
  }

  /**
   * Встречи с бандитами: «встреча» — подошли ближе 12 тайлов;
   * «избегание» — прошли мимо крадучись, не разозлив; считаем
   * один раз на бандита (повторные подходы — уже наглость).
   */
  function banditPoll(p) {
    var world = WS.World;
    if (!world || !world.entsNear) return;
    var list = null;
    try {
      list = world.entsNear(p.x, p.y, BANDIT_R + 2);
    } catch (e) { return; }
    if (!list) return;

    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (!e || e.kind !== 'bandit' || e.dead) continue;
      var d = WS.M.dist(p.x, p.y, e.x, e.y);
      if (d > BANDIT_R) continue;

      var rec = seenBandits[e.id];
      if (!rec) {
        rec = seenBandits[e.id] = { met: false, sneaked: false, aggro: false, counted: false };
      }
      if (!rec.met) {
        rec.met = true;
        bump('banditMeets');
      }
      if (!banditCalm(e)) {
        rec.aggro = true;
        continue;
      }
      if (p.sneaking) rec.sneaked = true;
    }

    // встреча закончилась: бандит далеко или мёртв
    for (var id in seenBandits) {
      if (!seenBandits.hasOwnProperty(id)) continue;
      var r = seenBandits[id];
      if (!r.met || r.counted) continue;
      var b = null;
      var ents = world.ents || [];
      for (var k = 0; k < ents.length; k++) {
        if (ents[k] && ents[k].id === id) { b = ents[k]; break; }
      }
      var gone = !b || b.dead;
      var far = b && WS.M.dist(p.x, p.y, b.x, b.y) > BANDIT_FAR;
      if (gone || far) {
        if (r.sneaked && !r.aggro) {
          bump('sneakAvoids');
        }
        r.counted = true;    // одна встреча — один зачёт (в обе стороны)
      }
    }
  }

  /** Репутация Акима: каждый плюс — обмен/услуга. */
  function repPoll() {
    var g = G();
    var rep = (g && g.story && g.story.rep && typeof g.story.rep.hermit === 'number')
      ? g.story.rep.hermit : null;
    if (rep === null) return;
    if (prevRep === null) { prevRep = rep; return; }
    if (rep > prevRep) {
      bump('akimTrades', Math.round(rep - prevRep));
    }
    prevRep = rep;
  }

  /** Холод, голод, жажда: копим игровые часы. */
  function hoursPoll(p, gmin) {
    if (tempOut() <= FROST_AT) bump('hoursFrost30', gmin / 60);
    if (p.needs && p.needs.hunger <= HUNGRY_AT) bump('hungryHours', gmin / 60);
    if (p.needs && p.needs.thirst <= THIRSTY_AT) bump('thirstyHours', gmin / 60);
  }

  /** Обморожения: переходы границы «пальцы» (30). */
  function frostbitePoll(p) {
    var fb = p.frostbite || 0;
    if (prevFrostbite < 30 && fb >= 30) bump('frostbitesGot');
    prevFrostbite = fb;
  }

  /** Сон текущей ночи: минуты и качество. */
  function sleepPoll(p, gmin) {
    if (!p.sleeping) return;
    var inside = false;
    var world = WS.World;
    if (world && world.isInside) {
      inside = !!world.isInside(p.x, p.y);
    }
    nightSleep.min += gmin;
    if (!inside) {
      nightSleep.open += gmin;
    } else if (p._sleepKind === 'bed') {
      nightSleep.bed += gmin;
    } else if (p._sleepKind === 'roll') {
      nightSleep.roll += gmin;
    } else {
      nightSleep.floor += gmin;
    }
    bump('sleepMin', gmin);
  }

  /** Кровопотеря: health.js копит hp в _bloodLost — переводим в литры. */
  function bloodPoll(p) {
    var l = (p._bloodLost || 0) * BLOOD_L_PER_HP;
    if (l > get('bloodLostL')) set('bloodLostL', l);
  }

  /** Секундный опрос мира. */
  function poll() {
    var g = G();
    var p = P();
    if (!g || !p) return;
    var dt = SNAP_EVERY;
    var gmin = gameMin(dt);

    walkPoll(p);
    buildingPoll(p);
    holePoll(p);
    banditPoll(p);
    repPoll();
    hoursPoll(p, gmin);
    frostbitePoll(p);
    sleepPoll(p, gmin);
    bloodPoll(p);
  }

  // ====================================================================
  //  ТИК МОДУЛЯ
  // ====================================================================

  function statsTick(dt) {
    var g = G();
    if (!g || !g.running || g.dead) return;

    // реальное время игры (wall-clock с учётом ускорения)
    bump('playRealSec', wallSec(dt));

    snapT += dt;
    if (snapT >= SNAP_EVERY) {
      snapT = 0;
      try {
        poll();
      } catch (e) {
        WS.err('stats: poll упал:', e && e.message);
      }
    }
  }

  // ====================================================================
  //  СНАПШОТ И ФОРМАТИРОВАННЫЕ СТРОКИ
  // ====================================================================

  /**
   * Полный снимок статистики партии — словарь. Всё в «сырых» единицах
   * (числа), кроме явно помеченных полей (accuracyPct — проценты).
   */
  function snapshot() {
    var g = G();
    if (!g) return null;
    var s = st();
    var p = P() || {};
    var c = (s && s._combat) || {};

    var shots = Number(c.shots) || 0;
    var hits = Number(c.hits) || 0;
    var acc = (shots > 0) ? Math.round(100 * hits / shots) : -1;

    var seen = 0;
    for (var k in seenBuildings) {
      if (seenBuildings.hasOwnProperty(k)) seen++;
    }
    var holes = 0;
    for (var h in seenHoles) {
      if (seenHoles.hasOwnProperty(h)) holes++;
    }

    return {
      // --- время ---
      day: day(),
      daysLeft: (WS.Time && WS.Time.daysLeft) ? Math.max(0, WS.Time.daysLeft()) : 60,
      gameMinSurvived: Math.max(0, totalMin() - 8 * 60),
      playRealMin: Math.round(get('playRealSec') / 60),

      // --- холод ---
      coldest: (typeof s.coldest === 'number') ? s.coldest : null,
      hoursFrost30: Math.round(get('hoursFrost30') * 10) / 10,
      frostbitesGot: get('frostbitesGot'),
      blizzardsSeen: get('blizzardsSeen'),
      hardFrostsSeen: get('hardFrostsSeen'),

      // --- еда и питьё ---
      eatenUnits: get('eatenUnits'),
      caloriesEaten: Math.round(get('caloriesEaten')),
      mealsEaten: get('mealsEaten'),
      mealsCooked: (s && s.mealsCooked) || 0,
      drankUnits: get('drankUnits'),
      waterUnits: get('waterUnits'),
      boozeUnits: get('boozeUnits'),
      hungryHours: Math.round(get('hungryHours') * 10) / 10,
      thirstyHours: Math.round(get('thirstyHours') * 10) / 10,
      spoiledEaten: get('spoiledEaten'),

      // --- бой ---
      shots: shots,
      hits: hits,
      accuracyPct: acc,
      crits: Number(c.crits) || 0,
      melees: Number(c.melees) || 0,
      misses: get('misses'),
      killsByPlayer: Number(c.kills) || 0,
      killsByKind: (s && s.killsByKind) ? s.killsByKind : {},
      wolfBites: get('wolfBites'),
      bearHits: get('bearHits'),
      banditHits: get('banditHits'),
      damageTaken: Math.round(get('damageTaken')),
      bloodLostL: Math.round(get('bloodLostL') * 10) / 10,
      bandagesUsed: get('bandagesUsed'),

      // --- путь ---
      stepsWalked: (s && s.stepsWalked) || 0,
      tilesWalked: Math.round(get('tilesWalked')),
      buildingsVisited: seen,
      iceHolesVisited: holes,
      corpsesLooted: get('corpsesLooted'),

      // --- люди ---
      banditMeets: get('banditMeets'),
      sneakAvoids: get('sneakAvoids'),
      akimTrades: get('akimTrades'),
      akimRep: (g.story && g.story.rep && typeof g.story.rep.hermit === 'number')
        ? g.story.rep.hermit : 0,
      radioHeard: get('radioHeard'),

      // --- сон ---
      sleepHours: Math.round(get('sleepMin') / 60 * 10) / 10,
      bedNights: get('bedNights'),
      floorNights: get('floorNights'),
      openNights: get('openNights'),

      // --- хозяйство ---
      wolvesKilled: (s && s.wolvesKilled) || 0,
      bearsKilled: (s && s.bearsKilled) || 0,
      banditsKilled: (s && s.banditsKilled) || 0,
      animalsHunted: (s && s.animalsHunted) || 0,
      fishCaught: get('fishCaught'),
      netFishCaught: get('netFishCaught'),
      trapFishCaught: get('trapFishCaught'),
      butcheredCount: get('butcheredCount'),
      itemsPicked: get('itemsPicked'),
      containersLooted: (s && s.containersLooted) || 0,
      itemsCrafted: (s && s.itemsCrafted) || 0,
      itemsBroken: get('itemsBroken'),
      itemsRepaired: get('itemsRepaired'),
      firesBuilt: get('firesBuilt'),
      stovesLit: get('stovesLit'),
      notesRead: (s && s.notesRead) || 0,
      fallsIntoWater: get('fallsIntoWater'),
      amputations: get('amputations'),
      musicPlays: get('musicPlays'),

      // --- история по дням (график для журнала) ---
      history: (s && s.history) ? s.history.slice() : []
    };
  }

  /**
   * Готовые строки для журнала: массив {label, value} по разделам.
   * Разделы помечены строкой-заголовком {label, value: null, section: true}.
   */
  function formatted() {
    var x = snapshot();
    var out = [];
    if (!x) return out;

    function sec(label) { out.push({ label: label, value: null, section: true }); }
    function row(label, value) { out.push({ label: label, value: value }); }
    function num(n) { return String(n).replace('.', ','); }

    // ---- ВРЕМЯ ----
    sec('Время');
    row('Прожито дней', x.day + ' ' + plural(x.day, 'день', 'дня', 'дней'));
    row('Игровое время выживания', fmtDur(x.gameMinSurvived));
    row('Реальных минут за партию', x.playRealMin + ' ' +
        plural(x.playRealMin, 'минута', 'минуты', 'минут'));
    if (x.day <= 60) {
      row('Дней до парохода', x.daysLeft + ' ' + plural(x.daysLeft, 'день', 'дня', 'дней'));
    }

    // ---- ХОЛОД ----
    sec('Холод');
    if (x.coldest !== null && x.coldest < -20) {
      row('Минимальная вынесенная температура', num(x.coldest) + ' °C');
    }
    if (x.hoursFrost30 > 0) {
      row('Часов при морозе ниже −30°', num(x.hoursFrost30) +
          ' ' + plural(Math.round(x.hoursFrost30), 'час', 'часа', 'часов'));
    }
    if (x.frostbitesGot > 0) {
      row('Обморожений получено', x.frostbitesGot + ' ' +
          plural(x.frostbitesGot, 'раз', 'раза', 'раз'));
    }
    if (x.blizzardsSeen > 0) {
      row('Метелей пережито', x.blizzardsSeen + ' ' +
          plural(x.blizzardsSeen, 'метель', 'метели', 'метелей'));
    }

    // ---- ЕДА ----
    sec('Еда и питьё');
    row('Съедено единиц', x.eatenUnits);
    if (x.caloriesEaten > 0) {
      row('Калорий всего', x.caloriesEaten + ' ккал');
    }
    if (x.mealsCooked > 0) row('Блюд приготовлено', x.mealsCooked);
    if (x.mealsEaten > 0) row('Горячих блюд съедено', x.mealsEaten);
    if (x.drankUnits > 0) row('Выпито глотков', x.drankUnits);
    if (x.waterUnits > 0) row('Из них воды', x.waterUnits);
    if (x.boozeUnits > 0) {
      row('Спиртного выпито', x.boozeUnits + ' ' +
          plural(x.boozeUnits, 'глоток', 'глотка', 'глотков'));
    }
    if (x.hungryHours > 0) {
      row('«Голодных» часов', num(x.hungryHours));
    }
    if (x.thirstyHours > 0) {
      row('Часов жажды', num(x.thirstyHours));
    }
    if (x.spoiledEaten > 0) {
      row('Испорченного съедено', x.spoiledEaten + ' ' +
          plural(x.spoiledEaten, 'раз', 'раза', 'раз'));
    }

    // ---- БОЙ ----
    sec('Бой');
    if (x.shots > 0) {
      row('Выстрелов сделано', x.shots);
      row('Попаданий', x.hits);
      row('Точность', (x.accuracyPct >= 0 ? x.accuracyPct : 0) + '%');
    }
    if (x.crits > 0) row('Критических', x.crits);
    if (x.melees > 0) {
      row('Ударов в ближнем бою', x.melees);
      row('Промахов', x.misses);
    }
    if (x.wolfBites > 0) {
      row('Волчьих укусов получено', x.wolfBites);
    }
    if (x.bearHits > 0) {
      row('Лап медведя на себе', x.bearHits);
    }
    if (x.banditHits > 0) {
      row('От бандитов принято', x.banditHits);
    }
    if (x.damageTaken > 0) row('Урона всего', x.damageTaken);
    if (x.bloodLostL > 0) row('Крови потеряно', fmtL(x.bloodLostL));
    if (x.bandagesUsed > 0) {
      row('Перевязок наложено', x.bandagesUsed);
    }

    // добыча по видам (из killsByKind)
    var kk = x.killsByKind;
    var kkNames = {
      wolf: 'Волков', bear: 'Медведей', bandit: 'Бандитов',
      deer: 'Оленей', hare: 'Зайцев', crow: 'Ворон',
      fish: 'Рыб', hermit: 'Отшельников', dog: 'Псов'
    };
    var kkShow = 0;
    for (var k2 in kkNames) {
      if (kkNames.hasOwnProperty(k2) && kk[k2]) kkShow++;
    }
    if (kkShow) {
      for (var k3 in kkNames) {
        if (kkNames.hasOwnProperty(k3) && kk[k3]) {
          row(kkNames[k3] + ' убито', kk[k3]);
        }
      }
    }

    // ---- ПУТЬ ----
    sec('Путь');
    if (x.tilesWalked > 0) {
      row('Пройдено тайлов', x.tilesWalked);
      row('Шагов', x.stepsWalked);
    }
    if (x.buildingsVisited > 0) row('Зданий посещено', x.buildingsVisited);
    if (x.iceHolesVisited > 0) row('Прорубей посещено', x.iceHolesVisited);
    if (x.corpsesLooted > 0) {
      row('Тел обыскано', x.corpsesLooted);
    }

    // ---- ЛЮДИ ----
    sec('Люди');
    if (x.banditMeets > 0) {
      row('Встреч с бандитами', x.banditMeets);
      row('Удачных избеганий (крадучись)', x.sneakAvoids);
    }
    if (x.akimTrades > 0) {
      row('Обменов с Акимом', x.akimTrades);
      row('Доверие Акима', x.akimRep);
    }
    if (x.radioHeard > 0) {
      row('Радиопередач услышано', x.radioHeard);
    }

    // ---- СОН ----
    sec('Сон');
    if (x.sleepHours > 0) {
      row('Часов сна', num(x.sleepHours));
      row('Ночей в кровати', x.bedNights);
      row('Ночей на полу', x.floorNights);
      row('Ночей под открытым небом', x.openNights);
    }

    // ---- ХОЗЯЙСТВО ----
    sec('Хозяйство');
    row('Волков убито', x.wolvesKilled);
    if (x.bearsKilled > 0) row('Медведей убито', x.bearsKilled);
    if (x.banditsKilled > 0) row('Бандитов убито', x.banditsKilled);
    if (x.animalsHunted > 0) row('Дичи добыто', x.animalsHunted);
    if (x.fishCaught > 0) {
      row('Рыбы поймано', x.fishCaught);
      if (x.netFishCaught > 0) row('Из них сетью', x.netFishCaught);
      if (x.trapFishCaught > 0) row('Из них мордой', x.trapFishCaught);
    }
    if (x.butcheredCount > 0) row('Туш разделано', x.butcheredCount);
    if (x.itemsPicked > 0) row('Предметов поднято', x.itemsPicked);
    if (x.containersLooted > 0) row('Укрытий обыскано', x.containersLooted);
    if (x.itemsCrafted > 0) row('Вещей изготовлено', x.itemsCrafted);
    if (x.itemsBroken > 0) row('Вещей сломалось', x.itemsBroken);
    if (x.itemsRepaired > 0) row('Вещей починено', x.itemsRepaired);
    if (x.firesBuilt > 0) {
      row('Костров разожжено', x.firesBuilt);
    }
    if (x.stovesLit > 0) {
      row('Печей растоплено', x.stovesLit);
    }
    if (x.notesRead > 0) row('Записок прочитано', x.notesRead);
    if (x.fallsIntoWater > 0) row('Падений в прорубь', x.fallsIntoWater);
    if (x.amputations > 0) row('Ампутаций пережито', x.amputations);
    if (x.musicPlays > 0) row('Мелодий сыграно', x.musicPlays);

    // ---- ЛУЧШИЙ ДЕНЬ ----
    if (x.history && x.history.length) {
      var best = null;
      for (var hi = 0; hi < x.history.length; hi++) {
        var h = x.history[hi];
        var score = (h.wolves || 0) + (h.bears || 0) * 3 + (h.bandits || 0) * 2 +
                     (h.animals || 0) + (h.fish || 0);
        if (!best || score > best.score) {
          best = { day: h.day, score: score };
        }
      }
      if (best && best.score > 0) {
        sec('Лучшая охота');
        row('День', best.day);
        row('Добычи за день', best.score);
      }
    }

    return out;
  }

  // ====================================================================
  //  ПУБЛИЧНЫЙ API
  // ====================================================================

  var Stats = {
    /** Снимок всех счётчиков (словарь). */
    snapshot: snapshot,

    /** Готовые строки {label, value} для журнала. */
    formatted: formatted,

    /** Ручные операции над счётчиками (для соседних модулей). */
    bump: bump,
    set: set,
    get: get,

    /** Сброс расширенных полей (новая партия; базовые обнуляет state). */
    reset: function () {
      var s = st();
      if (!s) return;
      var base = ['daysSurvived', 'stepsWalked', 'containersLooted',
                  'itemsCrafted', 'wolvesKilled', 'bearsKilled',
                  'banditsKilled', 'animalsHunted', 'fishCaught',
                  'notesRead', 'mealsCooked', 'nightsSlept', 'coldest',
                  'closestCall', 'history', 'killsByKind'];
      var fresh = {};
      for (var i = 0; i < base.length; i++) {
        if (typeof s[base[i]] !== 'undefined') fresh[base[i]] = s[base[i]];
      }
      // _combat принадлежит combat.js — не трогаем и его
      if (s._combat) fresh._combat = s._combat;
      for (var k in s) {
        if (!s.hasOwnProperty(k)) continue;
        if (fresh.hasOwnProperty(k)) continue;
        delete s[k];
      }
    },

    /** История по дням (для графика): [{day, wolves, loot, craft…}]. */
    daily: function () {
      var s = st();
      return (s && s.history) ? s.history.slice() : [];
    },

    /** Внутреннее состояние (тесты). */
    _state: function () {
      return {
        seenBuildings: seenBuildings,
        seenHoles: seenHoles,
        seenBandits: seenBandits,
        nightSleep: nightSleep
      };
    },

    // ------------------------------------------------------------------
    //  САМОТЕСТ (консоль: WS.Stats.selftest())
    // ------------------------------------------------------------------
    selftest: function () {
      var out = [];
      var ok = function (name, cond) {
        out.push((cond ? '  ok  ' : ' FAIL ') + name);
        return !!cond;
      };

      var saved0 = WS.G;
      WS.G = null;
      ok('без партии snapshot() = null', snapshot() === null);
      WS.G = saved0;

      // синтетическая партия
      var saved = WS.G;
      WS.G = {
        running: true, dead: false, seed: 7,
        time: { day: 5, min: 10 * 60, totalMin: 5 * 1440 - 4 * 60 },
        player: {
          id: 'player', kind: 'player', x: 10, y: 10, hp: 80,
          frostbite: 0, bleeding: 0,
          needs: { hunger: 50, thirst: 50, fatigue: 50, sanity: 50, warmth: 50 },
          skills: {}, kills: {}, readBooks: {}
        },
        story: { flags: {}, ach: {}, notes: [], radio: [], quests: {}, rep: { hermit: 3 } },
        stats: { wolvesKilled: 2, containersLooted: 9, itemsCrafted: 4, notesRead: 3 }
      };

      var snap1 = snapshot();
      ok('snapshot с партией — объект', !!snap1 && typeof snap1 === 'object');
      ok('день считан', snap1.day === 5);
      ok('репутация Акима видна', snap1.akimRep === 3);
      ok('волки из G.stats видны', snap1.wolvesKilled === 2);

      // bump/set/get
      Stats.bump('eatenUnits', 7);
      ok('bump суммирует', Stats.get('eatenUnits') === 7);
      Stats.set('eatenUnits', 1);
      ok('set перезаписывает', Stats.get('eatenUnits') === 1);
      ok('get несуществующего = 0', Stats.get('nope') === 0);

      // formatted: секции и строки
      var rows = formatted();
      ok('formatted непуст', rows.length > 10);
      var hasSec = false, hasRow = false;
      for (var i = 0; i < rows.length; i++) {
        if (rows[i].section && rows[i].label === 'Время') hasSec = true;
        if (rows[i].label === 'Прожито дней') hasRow = true;
      }
      ok('есть секция «Время»', hasSec);
      ok('есть строка дней', hasRow);

      // плюрализация
      ok('plural 1/2/5', plural(1, 'день', 'дня', 'дней') === 'день' &&
                          plural(2, 'день', 'дня', 'дней') === 'дня' &&
                          plural(5, 'день', 'дня', 'дней') === 'дней' &&
                          plural(11, 'день', 'дня', 'дней') === 'дней');
      ok('fmtDur 80 мин', fmtDur(80) === '1 ч 20 мин');
      ok('fmtL 0.05 → 0,1 л (округление вверх)', fmtL(0.05) === '0,1 л');

      // сброс расширенных, база и _combat целы
      WS.G.stats._combat = { shots: 3, hits: 2 };
      Stats.reset();
      ok('reset хранит базу', Stats.get('wolvesKilled') === 2);
      ok('reset хранит _combat', !!WS.G.stats._combat);
      ok('reset чистит наши поля', Stats.get('eatenUnits') === 0);

      // история по дням: пишется и переживает reset
      WS.G.stats.history = [{ day: 2, wolves: 1, loot: 3, craft: 0 }];
      Stats.reset();
      ok('reset хранит историю', Stats.daily().length === 1);
      ok('день истории читается', Stats.daily()[0].day === 2);

      // карта убийств по видам
      WS.G.stats.killsByKind = { wolf: 4, hare: 7 };
      var snap2 = snapshot();
      ok('killsByKind в снимке', snap2.killsByKind.wolf === 4);
      var rows2 = formatted();
      var hasWolvesRow = false;
      for (var r = 0; r < rows2.length; r++) {
        if (rows2[r].label === 'Волков убито') hasWolvesRow = true;
      }
      ok('строка «Волков убито» есть', hasWolvesRow);

      WS.G = saved;
      return out;
    }
  };

  // ====================================================================
  //  BOOT
  // ====================================================================

  WS.def('Stats', Stats);

  WS.boot(function initStats() {
    st();                          // гарантирует g.stats при первой партии

    // --- события: факты для счётчиков ---
    WS.Ev.on('game:start', onGameStart);
    WS.Ev.on('game:load', onGameLoad);
    WS.Ev.on('time:day', onNewDay);
    WS.Ev.on('day:dawn', onDawn);
    WS.Ev.on('ent:kill', onEntKill);
    WS.Ev.on('radio:msg', onRadio);
    WS.Ev.on('fire:lit', onFireLit);
    WS.Ev.on('item:broken', onBroken);
    WS.Ev.on('item:repaired', onRepaired);
    WS.Ev.on('player:ate', onAte);
    WS.Ev.on('cook:ate', onCookAte);
    WS.Ev.on('player:drank', onDrank);
    WS.Ev.on('player:sick', onSick);
    WS.Ev.on('combat:miss', onMiss);
    WS.Ev.on('player:damage', onDamage);
    WS.Ev.on('player:heal', onHeal);
    WS.Ev.on('loot:searched', onLooted);
    WS.Ev.on('item:picked', onPicked);
    WS.Ev.on('fish:caught', onFish);
    WS.Ev.on('hunt:butchered', onButchered);
    WS.Ev.on('weather:changed', onWeather);
    WS.Ev.on('player:fall_water', onFallWater);
    WS.Ev.on('player:amputate', onAmputate);
    WS.Ev.on('player:played', onPlayed);

    // --- тик опроса мира ---
    WS.tick(TICK_PRI, statsTick, 'sys:stats');

    WS.log('stats: расширенная статистика готова (тик ' + TICK_PRI +
           ', опрос раз в ' + SNAP_EVERY + ' с)');
  }, 'systems:stats');

})();
