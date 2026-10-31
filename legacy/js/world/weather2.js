/**
 * weather2.js — РАСШИРЕННАЯ ПОГОДА «Белого Безмолвия»: редкие явления
 * поверх базовой цепочки Маркова из weather.js. МОДУЛЬ НЕ ТРОГАЕТ
 * weather.js: он расширяет его API обёртками (tempOutside/windLevel/
 * visibility/lightDim/current + НОВЫЙ Weather.forceTemp, который зовут
 * events.js «Оттепель»/«Лютый мороз» и christmas.js), а всё своё рисует
 * отдельным тиком 76 — ПОВЕРХ кадра Gfx (70) и сияния events.js (75).
 * Явления: иней, изморозь, ледяной дождь (корка+скользко), метель с
 * грозой (молнии), вьюга-«стена» (whiteout, интеграция с events lost),
 * звёздная ночь + луна + лунный свет, парость над рекой, ветер-порыв
 * (волки глохнут), зимняя радуга-гало (22°, ложные солнца, столб).
 * Климатический нарратив: 60 дней — ноябрь мягкий → декабрь жёсткий →
 * крещенские морозы → спокойный конец (кривая forceTemp/базового офсета).
 * Состояние: WS.G.weather2 (чистые данные — сериализуется в сейв).
 * Связи: Weather (обёртки), Gfx.c (тик 76), Time, World (тайлы реки,
 * terrainMoveCost для гололёда), ai.js (глухие волки через brain.hearMul),
 * ambient.js (читает gust()/whiteout()), Fx (пар над водой), Snd, Ui.toast.
 */
(function () {
  'use strict';

  // ====================================================================
  //  КОНСТАНТЫ И НАСТРОЙКИ
  //  Весь баланс явлений собран здесь — правится в одном месте.
  // ====================================================================

  var TICK_SIM = 16;          // симуляция явлений (сразу после погоды 15)
  var TICK_DRAW = 76;         // рендер поверх мира (после Gfx 70, сияния 75)
  var CHECK_SEC = 2.0;        // как часто крутим рулетку явлений
  var GAME_MIN_PER_SEC = 1;   // игровых минут за реальную секунду (x1)

  // --- ИНЕЙ: красивый налёт поздней осенью, мир «чуть светлее» ---
  var INEI_DAY_MAX = 21;      // только ранние дни (поздняя осень)
  var INEI_HOUR_LO = 5;       // выпадает под утро
  var INEI_HOUR_HI = 9;
  var INEI_TEMP_LO = -7;      // при небольшом морозе
  var INEI_TEMP_HI = -1;
  var INEI_CHANCE = 0.014;    // за проверку (окно ~4 ч = 7200 проверок → редкость разумная)
  var INEI_DUR_MIN = 150;     // держится до середины дня
  var INEI_DUR_RND = 120;

  // --- ИЗМОРОЗЬ: деревья в белом меху, sanity +3 при виде ---
  var IZM_DAY_MAX = 26;
  var IZM_HOUR_LO = 6;
  var IZM_HOUR_HI = 10;
  var IZM_TEMP_LO = -14;
  var IZM_TEMP_HI = -3;
  var IZM_CHANCE = 0.009;     // редкое
  var IZM_DUR_MIN = 160;
  var IZM_DUR_RND = 130;
  var IZM_SANITY = 3;

  // --- ЛЕДЯНОЙ ДОЖДЬ: всё в корке, скользко, падения при беге ---
  var ICE_SCHED_DAY = 15;     // в этот день бросаем кость судьбы
  var ICE_PROB = 0.32;        // шанс, что за партию явление вообще случится
  var ICE_DAY_LO = 16;        // окно дней по ТЗ
  var ICE_DAY_HI = 24;
  var ICE_HOUR_LO = 10;      // оттепель днём
  var ICE_HOUR_HI = 14;
  var ICE_DUR_MIN = 70;      // сам дождь недолог
  var ICE_DUR_RND = 40;
  var ICE_CRUST_MIN = 100;   // корка держится после дождя (игровых минут)
  var ICE_MOVE_COST = 1.45;  // цена шага по льду (скорость ~0.7)
  var ICE_FALL_P = 0.022;    // шанс падения за секунду бега
  var ICE_FALL_DMG = 3;
  var ICE_FALL_CD = 6;       // сек между падениями

  // --- МЕТЕЛЬ С ГРОЗОЙ: снежная гроза, молнии («высший пилотаж зимы») ---
  var GROZA_P = 0.00013;     // за проверку в ночную метель (редчайшее)
  var GROZA_BOLTS = 3;       // молний в серии
  var GROZA_BOLT_CD = 2.5;  // сек между разрядами
  var GROZA_THUNDER_MIN = 0.4;  // минимальная пауза до грома, сек
  var GROZA_THUNDER_MAX = 2.6;
  var GROZA_SANITY = -2;     // гроза в метели — жутко

  // --- ВЬЮГА-«СТЕНА» (whiteout): видимость ~2 тайла ---
  var WO_BLIZZARD_MIN = 75;  // сек метели подряд, прежде чем возможна стена
  var WO_P = 0.0011;         // за проверку
  var WO_DUR_MIN = 45;      // секунды (реальные)
  var WO_DUR_RND = 45;
  var WO_VIS = 0.22;        // множитель видимости в стене
  var WO_TIRADE = [
    'Белая стена. Не видно вытянутой руки.',
    'Снег идёт стеной. Кажется, вы уже шли здесь.',
    'Мир исчез в белом. Только ветер.'
  ];

  // --- ЗВЁЗДНАЯ НОЧЬ / ЛУНА / ЛУННЫЙ СВЕТ ---
  var STAR_COUNT = 130;       // звёзд на небе
  var MILKY_COUNT = 70;       // точек Млечного Пути
  var STAR_LIGHT_MAX = 0.09;  // ночь (Time.light ниже этого)
  var MOON_LIGHT = 0.05;     // добавка освещённости от луны (по ТЗ)
  var MOON_HALO_P = 0.004;   // лунный венец — реже солнечного

  // --- ПАРОСТЬ НАД РЕКОЙ (морозная дымка над водой) ---
  var PAR_TEMP = -12;        // пар виден в настоящий мороз
  var PAR_EVERY = 0.65;      // сек между клубами пара
  var PAR_SCAN = 1.2;        // сек между сканами тайлов воды
  var PAR_STEAM_LIFE = 2.6;

  // --- ВЕТЕР-ПОРЫВ: резкие шквалы ---
  var GUST_IDLE_MIN = 14;   // сек между порывами (нижняя граница)
  var GUST_IDLE_RND = 36;   // разброс
  var GUST_DUR_MIN = 2.6;   // длительность порыва
  var GUST_DUR_RND = 4.4;
  var GUST_POWER = 0.24;    // добавка к windLevel
  var GUST_WIND_REQ = 0.42; // базовый ветер, при котором порывы случаются
  var GUST_WOLF_R = 34;     // радиус «оглушения» волков
  var GUST_WOLF_HEAR = 0.15;// во сколько раз хуже слышат волки в порыв

  // --- ЗИМНЯЯ РАДУГА (гало 22°, ложные солнца, солнечный столб) ---
  var HALO_PROB = 0.22;     // шанс за день (бросок на рассвете)
  var HALO_TEMP = -12;      // только в крепкий мороз
  var HALO_DUR_MIN = 24;
  var HALO_DUR_RND = 20;
  var HALO_SANITY = 5;
  var HALO_HOUR_LO = 9;     // гало — дневное явление
  var HALO_HOUR_HI = 15;

  // --- КЛИМАТИЧЕСКИЙ НАРРАТИВ: кривая офсета температуры по дням ---
  //  [день, офсет °C]: ноябрь мягкий → декабрь злее → крещенская стужа
  //  (пик ~дня 39 — event «лютый мороз» events.js ложится поверх) →
  //  спокойный конец перед пароходом.
  var CLIMATE_KEYS = [
    [1, 2.0], [8, 1.2], [16, -0.5], [24, -2.0], [31, -3.6],
    [39, -5.5], [44, -3.2], [50, -1.2], [56, 0.8], [60, 2.2]
  ];
  //  текстовые вехи нарратива: [день, ключ i18n, запасная строка]
  var CLIMATE_MILES = [
    [2, 'w2.clim.soft', 'Ноябрь мягок: снег лежит, а мороз ещё дремлет.'],
    [18, 'w2.clim.dec', 'Декабрь вступает в силу — мороз берёт за бока.'],
    [31, 'w2.clim.deep', 'Морозы крепчают. К Крещению будет люто.'],
    [39, 'w2.clim.epiphany', 'Крещенская стужа. Так холодно, что воздух звенит.'],
    [46, 'w2.clim.relax', 'Стужа чуть отпускает свои тиски.'],
    [56, 'w2.clim.end', 'Мороз отступает. Скоро по реке придёт пароход.']
  ];
  var FORCE_ATTACK_MIN = 120;   // плавный вход forceTemp (игровых минут)
  var FORCE_RELEASE_MIN = 120;  // плавный выход

  // --- ЗАЩИТА ---
  var DECO_PAR_MAX = 10;     // максимум объектов пара у полыней

  // ====================================================================
  //  СОСТОЯНИЕ МОДУЛЯ (не сериализуется — оживляет G.weather2)
  // ====================================================================

  var M = null;                // WS.M (математика/изометрия)
  var Rt = null;               // рантайм-ГПСЧ явлений (не влияет на генерацию)
  var patched = false;         // обёртки Weather установлены?

  // оригиналы обёрнутых методов (ставятся в installPatches)
  var o_tempOutside = null;
  var o_current = null;
  var o_windLevel = null;
  var o_visibility = null;
  var o_lightDim = null;
  var o_moveCost = null;

  // активные явления: id -> {t (сек), dur (сек или игровых минут), ...}
  var phen = {};
  var checkT = 0;              // таймер рулетки явлений

  // иней / изморозь — легковесные флаги-объекты в phen
  // ледяной дождь: расписание и корка
  var iceCrustMin = 0;         // остаток корки, игровых минут
  var iceFallCd = 0;           // кулдаун падений, сек

  // гроза
  var bolts = [];             // активные молнии {t, pts[], a}
  var flash = 0;               // сила вспышки 0..1
  var thunderQ = [];           // отложенные громы {t, vol}
  var grozaLeft = 0;           // сколько молний ещё в серии
  var grozaCd = 0;             // до следующего разряда

  // стена-вьюга
  var blizzardT = 0;           // сколько сек текущая метель длится

  // порывы ветра
  var gust = { phase: 'idle', t: 0, dur: 0, env: 0 };
  var deafWolves = [];         // [{e, had: было ли brain.hearMul задано}]

  // звёзды
  var stars = [];
  var milky = [];
  var starSeed = 0;

  // парость
  var parT = 0;
  var waterScanT = 0;
  var waterPts = [];           // тайлы воды в кадре [{x, y}]
  var parObjs = [];            // объекты par_otten у полыней

  // гало
  var haloDayRolled = -1;      // день последнего броска

  // кэш деревьев для изморози (обновляется редко)
  var treeCache = [];
  var treeCacheT = 0;

  // отладка
  var dbgLast = '—';

  // ====================================================================
  //  УТИЛИТЫ
  // ====================================================================

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smooth(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }

  /** Живая ссылка на состояние погоды weather.js. */
  function W() { return WS.G ? WS.G.weather : null; }

  /** Состояние weather2 (сериализуемое) — создаётся лениво. */
  function G2() {
    var g = WS.G;
    if (!g) return null;
    if (!g.weather2 || typeof g.weather2 !== 'object') {
      g.weather2 = {
        flags: {},          // одноразовые вещи: тосты, +sanity за явление
        force: null,        // активный forceTemp {off, from, until}
        iceSched: null,     // расписание ледяного дождя {day, hour}
        climDay: 0          // последний день климатического тоста
      };
    }
    return g.weather2;
  }

  /** Партия жива и мир готов. */
  function running() {
    return !!(WS.G && WS.G.running && WS.G.player && WS.G.weather);
  }

  /** Игрок вне помещения (на улице видно небо). */
  function outside() {
    try {
      if (!running()) return false;
      var p = WS.G.player;
      if (p.sleeping) return false;
      if (WS.World && WS.World.isInside) return !WS.World.isInside(p.x, p.y);
    } catch (e) { /* мир не готов */ }
    return true;
  }

  /** Тип текущей погоды (id) с защитой. */
  function wType() {
    var w = W();
    return w ? w.cur : 'clear';
  }

  /** Тост через UI (без UI — тихо). */
  function toast(text, kind) {
    try {
      if (WS.Ui && WS.Ui.toast) WS.Ui.toast(text, kind || 'info');
    } catch (e) { /* тост не критичен */ }
  }

  /** Локализация с запасным литералом. */
  function t9(key, fb) {
    try {
      if (WS.I18N && WS.I18N.t) {
        var s = WS.I18N.t(key);
        if (s && s !== key) return s;
      }
    } catch (e) { /* словаря нет */ }
    return fb;
  }

  /** Звук в точке мира (с затуханием по дистанции — сам Snd гасит). */
  function sndAt(name, vol, x, y) {
    try {
      if (WS.Snd && WS.Snd.play) WS.Snd.play(name, { vol: vol, x: x, y: y });
    } catch (e) { /* звук не критичен */ }
  }

  /** Один раз за партию (флаг в сериализуемом G.weather2.flags). */
  function once(key) {
    var g2 = G2();
    if (!g2) return false;
    if (g2.flags[key]) return false;
    g2.flags[key] = 1;
    return true;
  }
  function onceDay(key) {
    var g2 = G2();
    if (!g2) return false;
    var k = key + '@' + (WS.Time ? WS.Time.day() : 0);
    if (g2.flags[k]) return false;
    g2.flags[k] = 1;
    return true;
  }

  /** Подправить рассудок игрока (по ТЗ: изморозь +3, гало +5...). */
  function addSanity(dv) {
    try {
      var p = WS.G && WS.G.player;
      if (!p || !p.needs) return;
      p.needs.sanity = clamp(p.needs.sanity + dv, 0, 100);
    } catch (e) { /* нужды не критичны */ }
  }

  /** Дробный час (0..24). */
  function hourF() {
    return WS.Time && WS.Time.hourF ? WS.Time.hourF() : 12;
  }

  /** Игровая минута партии (totalMin). */
  function gameMin() {
    return WS.Time && WS.Time.totalMin ? WS.Time.totalMin() : 0;
  }

  /** Ночь? (те же рамки, что night:fall в Time) */
  function isNight() {
    var h = Math.floor(hourF());
    return h >= 21 || h < 5;
  }

  /** Сумма игровых минут с прошлого тика (за вычетом скачков сейва). */
  var lastMin = -1;
  function gameMinDelta() {
    var m = gameMin();
    if (lastMin < 0 || m < lastMin) { lastMin = m; return 0; }
    var d = m - lastMin;
    lastMin = m;
    return d;
  }

  // ====================================================================
  //  КЛИМАТИЧЕСКИЙ НАРРАТИВ: базовая кривая 60 дней
  //  Плавная интерполяция по ключевым точкам (smoothstep между ними).
  //  Ложится ПОВЕРХ сезонного похолодания weather.js (его -10° к дню 50),
  //  поэтому амплитуды сдержанные: задача кривой — характер, не екстрим.
  // ====================================================================

  function climateOffset(day) {
    if (typeof day !== 'number' || day < 1) day = 1;
    var K = CLIMATE_KEYS;
    if (day <= K[0][0]) return K[0][1];
    for (var i = 0; i < K.length - 1; i++) {
      var a = K[i], b = K[i + 1];
      if (day >= a[0] && day <= b[0]) {
        var t = (day - a[0]) / (b[0] - a[0]);
        return lerp(a[1], b[1], smooth(t));
      }
    }
    return K[K.length - 1][1];
  }

  /** Огибающая активного forceTemp: плавный вход/выход. */
  function forceEnvelope() {
    var g2 = G2();
    var f = g2 && g2.force;
    if (!f) return 0;
    var now = gameMin();
    if (now >= f.until) { g2.force = null; return 0; }
    var left = f.until - now;
    var since = now - f.from;
    // вход ATTACK минут, выход RELEASE минут — меньше из двух краёв
    var env = Math.min(smooth(since / FORCE_ATTACK_MIN), smooth(left / FORCE_RELEASE_MIN));
    return clamp(env, 0, 1);
  }

  /** Полный температурный офсет weather2: климат + forceTemp. */
  function tempOffset() {
    var g2 = G2();
    var off = climateOffset(WS.Time && WS.Time.day ? WS.Time.day() : 1);
    if (g2 && g2.force) off += g2.force.off * forceEnvelope();
    return off;
  }

  /**
   * НОВЫЙ МЕТОД Weather.forceTemp(deltaC, days) — контракт, на который
   * уже завязаны events.js (оттепель +8/1 день, лютый мороз -12/2 дня)
   * и christmas.js. Плавно вводит/выводит сдвиг температуры на N дней.
   * Повторный вызов заменяет текущий форс.
   */
  function apiForceTemp(deltaC, days) {
    var g2 = G2();
    if (!g2) return false;
    var d = Math.max(0, Math.round(days || 1));
    g2.force = {
      off: clamp(deltaC, -30, 20),
      from: gameMin(),
      until: gameMin() + d * 1440
    };
    // врывающийся мороз подтягивает погоду к суровым типам: честный ход
    try {
      if (deltaC <= -10 && WS.Weather && W() && W().cur !== 'hard_frost' &&
          Rt && Rt.chance(0.6)) {
        WS.Weather.force('hard_frost');
      }
    } catch (e) { /* погода переживёт */ }
    WS.log('weather2: forceTemp ' + deltaC + '°C на ' + d + ' дн.');
    return true;
  }

  /** Текстовые вехи нарратива — по одному разу, по дню. */
  function climateMilestones() {
    var g2 = G2();
    if (!g2) return;
    var day = WS.Time ? WS.Time.day() : 1;
    for (var i = 0; i < CLIMATE_MILES.length; i++) {
      var m = CLIMATE_MILES[i];
      if (day >= m[0] && g2.climDay < m[0]) {
        g2.climDay = m[0];
        toast(t9(m[1], m[2]), 'info');
        return;   // одна веха за раз (не спамим)
      }
    }
  }

  // ====================================================================
  //  ПАТЧИ WEATHER.JS (расширение API, не перезапись поведения)
  //  Каждая обёртка хранит оригинал и ДОБАВЛЯЕТ эффекты явлений.
  //  По умолчанию (явлений нет) методы ведут себя 1-в-1 как раньше.
  // ====================================================================

  function installPatches() {
    if (patched) return;
    var We = WS.Weather;
    if (!We || !We.tempOutside || !We.windLevel) {
      WS.warn('weather2: Weather не найден — патчи не ставятся');
      return;
    }
    patched = true;

    // 1) forceTemp — нового метода в weather.js нет, а его зовут события
    if (!We.forceTemp) We.forceTemp = apiForceTemp;

    // 2) температура: + климатическая кривая + forceTemp
    o_tempOutside = We.tempOutside;
    We.tempOutside = function () {
      return o_tempOutside.call(We) + tempOffset();
    };

    // 3) сводка current(): согласуем поле temp с новой температурой
    o_current = We.current;
    We.current = function () {
      var c = o_current.call(We);
      if (c && typeof c.temp === 'number') {
        c.temp = Math.round(We.tempOutside());
        if (isActive('groza')) c.name = t9('w2.groza.name', 'Метель с грозой');
        else if (isActive('whiteout')) c.name = t9('w2.wo.name', 'Белая стена');
        else if (isActive('ice_rain')) c.name = t9('w2.ice.name', 'Ледяной дождь');
      }
      return c;
    };

    // 4) ветер: + порывы (гейн амбиента audio.js и горизонтальный снег
    //    в частицах weather.js подхватываются автоматически)
    o_windLevel = We.windLevel;
    We.windLevel = function () {
      return clamp(o_windLevel.call(We) + gustBoost(), 0, 1);
    };

    // 5) видимость: стена-вьюга режет, ледяной дождь мутит,
    //    вспышка молнии на миг «освещает»
    o_visibility = We.visibility;
    We.visibility = function () {
      var v = o_visibility.call(We);
      if (isActive('whiteout')) v *= WO_VIS;
      if (isActive('ice_rain')) v *= 0.8;
      if (flash > 0.3) v = clamp(v + flash * 0.4, 0, 1.15);
      return clamp(v, 0.05, 1);
    };

    // 6) затемнение: иней делает мир чуть светлее (по ТЗ), парость над
    //    рекой слегка рассеивает свет
    o_lightDim = We.lightDim;
    We.lightDim = function () {
      var d = o_lightDim.call(We);
      if (isActive('inei')) d -= 0.045;
      if (isActive('parost')) d += 0.02;
      return clamp(d, 0, 0.9);
    };

    // 7) гололёд: после ледяного дождя ровные места скользкие (скорость 0.7)
    if (WS.World && WS.World.terrainMoveCost) {
      o_moveCost = WS.World.terrainMoveCost;
      WS.World.terrainMoveCost = function (x, y) {
        var c = o_moveCost.call(WS.World, x, y);
        if (iceCrustMin <= 0) return c;
        if (c === Infinity) return Infinity;
        return Math.max(c, ICE_MOVE_COST);
      };
    }

    WS.log('weather2: API Weather расширен (forceTemp/temp/wind/vis/light)');
  }

  // ====================================================================
  //  ЯВЛЕНИЯ: общая машина состояний
  //  start(id) / end(id) / isActive(id); тик каждого — в явлениях ниже.
  // ====================================================================

  function isActive(id) { return !!phen[id]; }

  function startPhen(id, o) {
    if (phen[id]) return false;
    phen[id] = o || {};
    phen[id].t = 0;
    return true;
  }

  function endPhen(id) {
    if (!phen[id]) return;
    delete phen[id];
    onPhenEnd(id);
  }

  /** Мягкий конец, если условие явления перестало выполняться. */
  function fadeIfBroken(id, ok) {
    if (!isActive(id)) return;
    if (ok) return;
    var p = phen[id];
    p._fade = (p._fade || 0) + 1;      // пара проверок подряд — и хватит
    if (p._fade > 2) endPhen(id);
  }

  function onPhenEnd(id) {
    if (id === 'ice_rain') {
      iceCrustMin = ICE_CRUST_MIN;
      toast(t9('w2.ice.end', 'Дождь кончился. Всё в ледяной корке — скользко.'), 'warn');
      sndAt('splash', 0.3, WS.G ? WS.G.player.x : 0, WS.G ? WS.G.player.y : 0);
    }
    if (id === 'whiteout') {
      if (WS.Events && WS.Events.isLost && WS.Events.isLost() > 40) {
        toast(t9('w2.wo.end_lost', 'Стена прошла, но где вы — теперь понятно не сразу.'), 'warn');
      }
    }
    if (id === 'halo') {
      // гало растворяется само, без слов
    }
  }

  // ====================================================================
  //  РУЛЕТКА ЯВЛЕНИЙ (каждые CHECK_SEC секунд реального времени)
  // ====================================================================

  function rollPhenomena(dt) {
    checkT -= dt;
    if (checkT > 0) return;
    checkT = CHECK_SEC;

    if (!running()) return;
    var w = W();
    if (!w) return;
    var temp = WS.Weather.tempOutside();
    var hour = Math.floor(hourF());
    var day = WS.Time ? WS.Time.day() : 1;
    var snow = WS.Weather.snowfall();
    var light = WS.Time && WS.Time.light ? WS.Time.light() : 1;
    var type = wType();

    // --- ИНЕЙ: поздняя осень, тихое утро, небольшой мороз ---
    if (!isActive('inei') && !isActive('izmoroz') && snow < 0.1 &&
        day <= INEI_DAY_MAX && hour >= INEI_HOUR_LO && hour <= INEI_HOUR_HI &&
        temp >= INEI_TEMP_LO && temp <= INEI_TEMP_HI &&
        (type === 'clear' || type === 'overcast' || type === 'fog')) {
      if (Rt && Rt.chance(INEI_CHANCE) && onceDay('inei')) {
        startPhen('inei', { dur: (INEI_DUR_MIN + Math.random() * INEI_DUR_RND) * 60 / GAME_MIN_PER_SEC });
        toast(t9('w2.inei.start', 'Выпал иней. Мир стал чуть светлее.'), 'good');
      }
    }

    // --- ИЗМОРОЗЬ: редкая, после влажной погоды, в настоящий мороз ---
    if (!isActive('izmoroz') && !isActive('inei') &&
        day <= IZM_DAY_MAX && hour >= IZM_HOUR_LO && hour <= IZM_HOUR_HI &&
        temp >= IZM_TEMP_LO && temp <= IZM_TEMP_HI && snow < 0.25 &&
        (type === 'clear' || type === 'overcast' || type === 'hard_frost')) {
      // повышенный шанс, если недавно стоял туман или шёл снег (влага)
      var humid = (w.prev === 'fog' || type === 'fog') ? 3 : 1;
      if (Rt && Rt.chance(IZM_CHANCE * humid) && onceDay('izmoroz')) {
        startPhen('izmoroz', { dur: (IZM_DUR_MIN + Math.random() * IZM_DUR_RND) * 60 / GAME_MIN_PER_SEC });
        toast(t9('w2.izm.start', 'Изморозь: деревья оделись в белый мех.'), 'good');
      }
    }

    // --- ЛЕДЯНОЙ ДОЖДЬ: по расписанию, брошенному на день 15 ---
    var g2 = G2();
    if (!isActive('ice_rain') && g2 && g2.iceSched &&
        day === g2.iceSched.day && hour >= g2.iceSched.hour &&
        temp > ICE_TEMP_FLOOR() && temp < 2 &&
        (type === 'overcast' || type === 'snow' || type === 'snowstorm')) {
      startPhen('ice_rain', { dur: (ICE_DUR_MIN + Math.random() * ICE_DUR_RND) * 60 / GAME_MIN_PER_SEC });
      g2.iceSched = null;      // своё отработало
      toast(t9('w2.ice.start', 'Ледяной дождь! Всё обрастает коркой льда.'), 'bad');
      sndAt('window_break', 0.25, WS.G.player.x, WS.G.player.y);
    }

    // --- МЕТЕЛЬ С ГРОЗОЙ: ночь + шторм + ветер — редчайшее ---
    if (grozaLeft <= 0 && isNight() && windForGroza() &&
        (type === 'blizzard' || type === 'snowstorm')) {
      if (Rt && Rt.chance(GROZA_P)) {
        grozaLeft = 1 + Math.floor(Math.random() * GROZA_BOLTS);
        grozaCd = 0.5;
        if (once('groza_seen')) {
          toast(t9('w2.groza.first', 'Метель с грозой! Молнии рвут белую мглу.'), 'bad');
          addSanity(GROZA_SANITY);
        }
      }
    }

    // --- ВЬЮГА-«СТЕНА»: затяжная метель на открытом месте ---
    if (!isActive('whiteout') && type === 'blizzard' && blizzardT > WO_BLIZZARD_MIN && outside()) {
      if (Rt && Rt.chance(WO_P)) {
        startPhen('whiteout', { dur: WO_DUR_MIN + Math.random() * WO_DUR_RND });
        var line = WO_TIRADE[Math.floor(Math.random() * WO_TIRADE.length)];
        toast(t9('w2.wo.start', line), 'bad');
        try { if (WS.Cam && WS.Cam.kick) WS.Cam.kick(2); } catch (e) { /* камера */ }
        // потерю направления копит events.js (lost в метель вне зданий) —
        // наша стена лишь усиливает ощущение: немного рассудка долой
        addSanity(-1);
      }
    }

    // --- ГАЛО (зимняя радуга): бросок на рассвете, старт при свете ---
    if (!isActive('halo') && haloDayRolled !== day && light > 0.25 &&
        hour >= HALO_HOUR_LO && hour <= HALO_HOUR_HI &&
        (type === 'clear' || type === 'hard_frost') && temp < HALO_TEMP) {
      haloDayRolled = day;
      if (Rt && Rt.chance(HALO_PROB)) {
        startPhen('halo', { dur: (HALO_DUR_MIN + Math.random() * HALO_DUR_RND) * 60 / GAME_MIN_PER_SEC });
        toast(t9('w2.halo.start', 'Вокруг солнца — радужный венец. К трескучему морозу.'), 'good');
        if (once('halo_sanity')) addSanity(HALO_SANITY);
      }
    }

    // --- ЛУННЫЙ ВЕНЕЦ (ночное гало — к морозу, без рассудка) ---
    if (!isActive('moonhalo') && isNight() && !isActive('halo') &&
        (type === 'clear' || type === 'hard_frost') && temp < HALO_TEMP - 4) {
      if (Rt && Rt.chance(MOON_HALO_P)) {
        startPhen('moonhalo', { dur: (HALO_DUR_MIN + Math.random() * HALO_DUR_RND) * 60 / GAME_MIN_PER_SEC });
        if (once('moonhalo_seen')) {
          toast(t9('w2.moonhalo.start', 'Вокруг луны — бледный венец. Быть крепкому морозу.'), 'info');
        }
      }
    }
  }

  /** Порог температуры ледяного дождя: чуть ниже нуля. */
  function ICE_TEMP_FLOOR() { return -4; }

  /** Достаточно ли ветра для грозы-метели. */
  function windForGroza() {
    try { return WS.Weather.windLevel() > 0.68; } catch (e) { return false; }
  }

  // ====================================================================
  //  ИНЕЙ / ИЗМОРОЗЬ: течение
  // ====================================================================

  function ineiTick(dt) {
    var p = phen.inei;
    if (!p) return;
    p.t += dt;
    if (p.t > p.dur) { endPhen('inei'); return; }
    // иней живёт, пока мороз мягкий и небо не заволокло
    fadeIfBroken('inei',
      WS.Weather.tempOutside() >= INEI_TEMP_LO - 2 &&
      WS.Weather.snowfall() < 0.2);
  }

  function izmorozTick(dt) {
    var p = phen.izmoroz;
    if (!p) return;
    p.t += dt;
    if (p.t > p.dur) { endPhen('izmoroz'); return; }
    // игрок должен ВИДЕТЬ явление (быть на улице), чтобы получить +3
    if (p.t > 4 && !p.seen && outside()) {
      p.seen = true;
      addSanity(IZM_SANITY);
      toast(t9('w2.izm.seen', 'Красиво — аж дышится легче.'), 'good');
    }
    fadeIfBroken('izmoroz', WS.Weather.tempOutside() <= IZM_TEMP_HI + 3 &&
                             WS.Weather.snowfall() < 0.35);
  }

  // ====================================================================
  //  ЛЕДЯНОЙ ДОЖДЬ: течение, падения при беге, корка
  // ====================================================================

  function iceRainTick(dt) {
    var p = phen.ice_rain;
    if (!p) return;
    p.t += dt;
    if (p.t > p.dur) { endPhen('ice_rain'); return; }
    fadeIfBroken('ice_rain', WS.Weather.tempOutside() < 3);

    var pl = WS.G.player;
    if (!pl) return;

    // звук: редкое звонкое шуршание по насту
    if (Math.random() < dt * 0.5) {
      sndAt('step_wood', 0.12, pl.x + (Math.random() - 0.5) * 6, pl.y + (Math.random() - 0.5) * 6);
    }
    if (Math.random() < dt * 0.1) {
      sndAt('splash', 0.1, pl.x, pl.y);
    }

    // падение при беге (настоящий гололёд)
    iceFallCd -= dt;
    if (iceFallCd <= 0 && pl.sprinting && pl.moving && outside()) {
      if (Math.random() < ICE_FALL_P) {
        iceFallCd = ICE_FALL_CD;
        try {
          WS.Ev.emit('player:damage', {
            amount: ICE_FALL_DMG, type: 'blunt',
            src: { kind: 'ice' }
          });
        } catch (e) { WS.err('weather2 ice fall:', e && e.message); }
        sndAt('fall', 0.6, pl.x, pl.y);
        try { if (WS.Cam && WS.Cam.kick) WS.Cam.kick(5); } catch (e2) { /* камера */ }
        try {
          if (WS.Fx && WS.Fx.burst) WS.Fx.burst('snow', pl.x, pl.y, 10);
        } catch (e3) { /* частицы */ }
        toast(t9('w2.ice.fall', 'Ноги разъехались на льду!'), 'bad');
      }
    }
  }

  /** Корка тает с игрою минутами (оттепель съедает быстрее). */
  function iceCrustTick(gm) {
    if (iceCrustMin <= 0) return;
    var melt = 1;
    try {
      if (WS.Weather.tempOutside() > -1) melt = 3;   // оттепель — корка быстро тает
    } catch (e) { /* пусто */ }
    iceCrustMin -= gm * melt;
    if (iceCrustMin < 0) iceCrustMin = 0;
  }

  // ====================================================================
  //  МЕТЕЛЬ С ГРОЗОЙ: молнии и гром
  //  Разряд: вспышка на весь экран (несколько пульсов) + рваная дуга в
  //  небе. Гром приходит с задержкой по «дистанции»; гром — это ШУМ:
  //  событие 'noise' будит зверей (волки идут проверять место разряда).
  // ====================================================================

  function grozaTick(dt) {
    if (grozaLeft <= 0 && bolts.length === 0 && thunderQ.length === 0) return;
    grozaCd -= dt;
    if (grozaLeft > 0 && grozaCd <= 0) {
      grozaLeft--;
      grozaCd = GROZA_BOLT_CD * (0.7 + Math.random() * 0.6);
      spawnBolt();
    }

    // молнии живут ~0.4 сек, вспышка гаснет экспоненциально
    var i;
    for (i = bolts.length - 1; i >= 0; i--) {
      bolts[i].t += dt;
      if (bolts[i].t > 0.45) bolts.splice(i, 1);
    }
    flash = Math.max(0, flash - dt * 2.2);

    // гром: очередь отложенных звуков
    for (i = thunderQ.length - 1; i >= 0; i--) {
      thunderQ[i].t -= dt;
      if (thunderQ[i].t <= 0) {
        var th = thunderQ.splice(i, 1)[0];
        var pl = WS.G ? WS.G.player : null;
        if (pl) {
          // близкий разряд — резкий удар + раскат; далёкий — только раскат
          if (th.close) sndAt('gunshot', 0.35, pl.x, pl.y);
          sndAt('death', th.vol, pl.x + th.dx, pl.y + th.dy);
          sndAt('bear_roar', th.vol * 0.5, pl.x + th.dx, pl.y + th.dy);
          // гром слышен зверям: редкое событие, будит округу
          try {
            WS.Ev.emit('noise', { x: pl.x + th.dx, y: pl.y + th.dy, r: 26 });
          } catch (e) { /* шум не критичен */ }
          try { if (WS.Cam && WS.Cam.kick) WS.Cam.kick(th.close ? 3 : 1); } catch (e2) { /* камера */ }
        }
      }
    }
  }

  /** Один разряд: генерируем ломаную дугу и планируем гром. */
  function spawnBolt() {
    var cv = WS.Gfx && WS.Gfx.c ? WS.Gfx.c().canvas : null;
    if (!cv) return;
    var W2 = cv.width, H2 = cv.height;
    var x0 = W2 * (0.15 + Math.random() * 0.7);
    var pts = [];
    var x = x0, y = -10;
    var drop = H2 * (0.3 + Math.random() * 0.35);
    var n = 7 + Math.floor(Math.random() * 4);
    for (var i = 0; i <= n; i++) {
      pts.push([x, y]);
      y += drop / n;
      x += (Math.random() - 0.5) * W2 * 0.06;
    }
    bolts.push({ t: 0, pts: pts, a: 0.75 + Math.random() * 0.25 });
    flash = Math.min(1, flash + 0.8);
    var close = Math.random() < 0.35;
    thunderQ.push({
      t: GROZA_THUNDER_MIN + Math.random() * (GROZA_THUNDER_MAX - GROZA_THUNDER_MIN),
      vol: close ? 0.55 : 0.3,
      close: close,
      dx: (Math.random() - 0.5) * 60,
      dy: (Math.random() - 0.5) * 60
    });
    dbgLast = 'гроза: разряд';
  }

  // ====================================================================
  //  ВЬЮГА-«СТЕНА»: течение
  // ====================================================================

  function whiteoutTick(dt) {
    var p = phen.whiteout;
    if (!p) return;
    p.t += dt;
    if (p.t > p.dur) { endPhen('whiteout'); return; }
    // стена жива только в метель
    fadeIfBroken('whiteout', wType() === 'blizzard');
    // толчки ветра, пока стена стоит
    if (Math.random() < dt * 0.25) {
      try { if (WS.Cam && WS.Cam.kick) WS.Cam.kick(1.5); } catch (e) { /* камера */ }
    }
  }

  // ====================================================================
  //  ВЕТЕР-ПОРЫВ: резкие шквалы
  //  Огибающая env 0..1 добавляется в обёрнутый windLevel: амбиент
  //  ветра в audio.js усиливается сам, снег ложится горизонтально сам
  //  (частицы weather.js читают windLevel). В порыв волки глохнут —
  //  шанс пройти мимо хищника в шквал.
  // ====================================================================

  function gustTick(dt) {
    var wind = 0.2;
    try { wind = WS.Weather ? WS.Weather.windLevel() : 0.2; } catch (e) { /* пусто */ }
    var windy = wind > GUST_WIND_REQ;

    if (gust.phase === 'idle') {
      if (windy && Rt && Rt.chance(dt / (GUST_IDLE_MIN + Math.random() * GUST_IDLE_RND))) {
        gust.phase = 'rise';
        gust.t = 0;
        gust.dur = GUST_DUR_MIN + Math.random() * GUST_DUR_RND;
        gust.env = 0;
        dbgLast = 'порыв ветра';
      }
    } else {
      gust.t += dt;
      var half = gust.dur * 0.5;
      if (gust.t < half) gust.env = smooth(gust.t / Math.max(0.5, half));
      else gust.env = 1 - smooth((gust.t - half) / Math.max(0.5, gust.dur - half));
      gust.env = clamp(gust.env, 0, 1);
      if (gust.t >= gust.dur || !windy) {
        gust.phase = 'idle';
        gust.env = 0;
      }
    }

    // глухие волки: в пик порыва слух режем, после — восстанавливаем
    if (gust.env > 0.5) deafenWolves(); else restoreWolves();
  }

  /** Добавка порыва к windLevel (для обёртки). */
  function gustBoost() {
    return gust.env * GUST_POWER;
  }

  /** Волки рядом перестают слышать (в порыв не слышат — по ТЗ). */
  function deafenWolves() {
    try {
      var p = WS.G.player;
      if (!p || !WS.World || !WS.World.entsNear) return;
      var near = WS.World.entsNear(p.x, p.y, GUST_WOLF_R);
      for (var i = 0; i < near.length; i++) {
        var e = near[i];
        if (!e || e.dead || !e.brain || e.kind !== 'wolf') continue;
        if (e.brain.hearMul === undefined) {
          e.brain.hearMul = GUST_WOLF_HEAR;
          deafWolves.push(e);
        }
      }
    } catch (e) { /* не критично */ }
  }

  /** Вернуть слух волкам (после порыва, при загрузке, при новой партии). */
  function restoreWolves() {
    for (var i = 0; i < deafWolves.length; i++) {
      var e = deafWolves[i];
      if (e && e.brain && e.brain.hearMul === GUST_WOLF_HEAR) {
        delete e.brain.hearMul;
      }
    }
    deafWolves.length = 0;
  }

  // ====================================================================
  //  ПАРОСТЬ НАД РЕКОЙ: морозная дымка над водой
  //  В крепкий мороз над полыньями и открытой водой клубится пар:
  //  частицы Fx 'steam' + редкие объекты par_otten у прорубей
  //  (спрайт лежит в sprites_nature.js без потребителя — вот он).
  // ====================================================================

  function parostTick(dt) {
    var want = false;
    try {
      want = WS.Weather.tempOutside() <= PAR_TEMP &&
             wType() !== 'blizzard' && wType() !== 'snowstorm';
    } catch (e) { /* пусто */ }
    if (want && !isActive('parost')) {
      startPhen('parost', {});
      if (once('parost_seen')) {
        toast(t9('w2.parost.start', 'Над рекой стоит морозная дымка.'), 'info');
      }
    } else if (!want && isActive('parost')) {
      endPhen('parost');
      removeParObjs();
      return;
    }
    if (!isActive('parost')) return;

    // раз в PAR_SCAN секунд пересканировать воду в кадре
    waterScanT -= dt;
    if (waterScanT <= 0) {
      waterScanT = PAR_SCAN;
      scanWaterInView();
    }

    // клубы пара над случайной точкой воды
    parT -= dt;
    if (parT <= 0 && waterPts.length) {
      parT = PAR_EVERY * (0.7 + Math.random() * 0.6);
      var pt = waterPts[Math.floor(Math.random() * waterPts.length)];
      var wv = windVec();
      try {
        if (WS.Fx && WS.Fx.spawn) {
          WS.Fx.spawn('steam', pt.x + Math.random() * 0.8, pt.y + Math.random() * 0.8, {
            z: 2 + Math.random() * 3,
            vx: wv.x * 0.35, vy: wv.y * 0.35,
            grav: -1.6,             // отрицательная тяжесть — пар поднимается
            life: PAR_STEAM_LIFE * (0.7 + Math.random() * 0.6),
            size: 2.5 + Math.random() * 2
          });
        }
      } catch (e) { /* частицы не критичны */ }
    }

    // паровые «клубы» у полыней: объекты par_otten (мир, не экран)
    manageParObjs();
  }

  /** Экранный вектор ветра (нормированный). */
  function windVec() {
    try {
      if (WS.Weather && WS.Weather.windVecScreen) return WS.Weather.windVecScreen();
    } catch (e) { /* пусто */ }
    return { x: 1, y: 0 };
  }

  /** Найти тайлы воды/прорубей в видимой области. */
  function scanWaterInView() {
    waterPts.length = 0;
    try {
      if (!WS.Cam || !WS.World || !WS.World.tiles) return;
      var vb = WS.Cam.viewBounds(3);
      var T = WS.World.T;
      var step = 1;   // редкая сетка — пар и так редкий
      for (var y = Math.floor(vb.y0); y <= vb.y1; y += step) {
        for (var x = Math.floor(vb.x0); x <= vb.x1; x += step) {
          if (x < 0 || y < 0 || x >= WS.World.w || y >= WS.World.h) continue;
          var t = WS.World.tileAt(x, y);
          if (t === T.WATER) waterPts.push({ x: x, y: y });
          else if (t === T.ICE && WS.RNG.hash2(x, y, 909) < 0.06) {
            waterPts.push({ x: x, y: y });    // редкие «дышащие» трещины льда
          }
        }
      }
    } catch (e) { /* мир не готов */ }
  }

  /** Полыньи (World.iceHoles) рядом с игроком получают пар-объект. */
  function manageParObjs() {
    try {
      var p = WS.G.player;
      var holes = WS.World.iceHoles || [];
      var i;
      // снять дальние/умершие
      for (i = parObjs.length - 1; i >= 0; i--) {
        var po = parObjs[i];
        var d = WS.M.dist(po.o.x, po.o.y, p.x, p.y);
        if (d > 36) { removeParObj(po); }
      }
      if (parObjs.length >= DECO_PAR_MAX) return;
      for (i = 0; i < holes.length; i++) {
        var h = holes[i];
        var dd = WS.M.dist(h.x, h.y, p.x, p.y);
        if (dd > 34) continue;
        var busy = false;
        for (var k = 0; k < parObjs.length; k++) {
          if (parObjs[k].hx === h.x && parObjs[k].hy === h.y) { busy = true; break; }
        }
        if (busy) continue;
        var o = WS.World.addObject({
          x: h.x + 0.5, y: h.y + 0.5,
          sprName: 'par_otten', solid: false, shadow: false,
          amb: true
        });
        parObjs.push({ o: o, hx: h.x, hy: h.y, ph: Math.random() });
        if (parObjs.length >= DECO_PAR_MAX) break;
      }
    } catch (e) { /* декор не критичен */ }
  }

  function removeParObj(po) {
    try {
      if (WS.World && WS.World.removeObject) WS.World.removeObject(po.o);
    } catch (e) { /* пусто */ }
    var i = parObjs.indexOf(po);
    if (i >= 0) parObjs.splice(i, 1);
  }

  function removeParObjs() {
    while (parObjs.length) removeParObj(parObjs[0]);
  }

  // ====================================================================
  //  ЗВЁЗДНАЯ НОЧЬ / ЛУНА / ЛУННЫЙ СВЕТ (условные, без состояния:
  //  если ночь, ясно и игрок на улице — небо оживает точками).
  //  Позиция луны: неторопливая дуга через верх экрана за ночь.
  // ====================================================================

  function starNightActive() {
    try {
      if (!running() || !outside()) return false;
      var w = W();
      if (!w) return false;
      if (w.cur !== 'clear' && w.cur !== 'hard_frost') return false;
      return (WS.Time && WS.Time.light ? WS.Time.light() : 1) < STAR_LIGHT_MAX;
    } catch (e) { return false; }
  }

  /** Позиция луны на экране (доли 0..1). Ночь 21..5. */
  function moonPos() {
    var h = hourF();
    var nightF;      // 0 в начале ночи, 1 к утру
    if (h >= 21) nightF = (h - 21) / 8;
    else nightF = (h + 3) / 8;
    nightF = clamp(nightF, 0, 1);
    // луна ходит с востока на запад, низко над горизонтом севера
    return { x: 0.82 - 0.64 * nightF, y: 0.13 + 0.07 * Math.sin(Math.PI * nightF) };
  }

  /** Позиция солнца на экране (доли 0..1): день 6..18. */
  function sunPos() {
    var h = hourF();
    var dayF = clamp((h - 6) / 12, 0, 1);
    return { x: 0.14 + 0.72 * dayF, y: 0.2 - 0.08 * Math.sin(Math.PI * dayF) };
  }

  /** Пересобрать звёздное небо из seed партии (детерминизм). */
  function buildStars(seed) {
    stars.length = 0;
    milky.length = 0;
    var R = WS.RNG.mk((seed ^ 0x57A2) >>> 0);
    var i;
    for (i = 0; i < STAR_COUNT; i++) {
      stars.push({
        x: R.f(), y: R.f() * 0.62,          // верхние 62% экрана — «небо»
        sz: R.chance(0.14) ? 2 : 1,
        ph: R.range(0, Math.PI * 2),
        sp: R.range(0.5, 2.4),              // скорость мерцания
        hue: R.chance(0.18) ? R.range(190, 230) : 0   // редкие голубые
      });
    }
    // Млечный Путь: диагональная россыпь слабых точек
    for (i = 0; i < MILKY_COUNT; i++) {
      var u = R.f();
      var v = u * 0.5 + 0.08 + (R.f() - 0.5) * 0.09;
      milky.push({ x: clamp(u, 0, 1), y: clamp(v, 0, 0.62), a: R.range(0.04, 0.16) });
    }
    starSeed = seed;
  }

  // ====================================================================
  //  ГАЛО: течение (лёгкое — вся красота в рендере)
  // ====================================================================

  function haloTick(dt) {
    var p = phen.halo;
    if (!p) return;
    p.t += dt;
    if (p.t > p.dur) { endPhen('halo'); return; }
    fadeIfBroken('halo',
      (WS.Time && WS.Time.light ? WS.Time.light() : 1) > 0.2 &&
      (wType() === 'clear' || wType() === 'hard_frost'));
  }

  function moonHaloTick(dt) {
    var p = phen.moonhalo;
    if (!p) return;
    p.t += dt;
    if (p.t > p.dur) { endPhen('moonhalo'); return; }
    fadeIfBroken('moonhalo', isNight() && starNightActive());
  }

  // ====================================================================
  //  ГЛАВНЫЙ ТИК СИМУЛЯЦИИ (приоритет 16 — сразу после погоды)
  // ====================================================================

  function simTick(dt) {
    try {
      if (!running()) return;

      // игровые минуты (для корки/форсов/климата)
      var gm = gameMinDelta();

      // рулетка явлений
      rollPhenomena(dt);

      // длительность текущей метели (для «стены»)
      if (wType() === 'blizzard') blizzardT += dt; else blizzardT = 0;

      // течение явлений
      ineiTick(dt);
      izmorozTick(dt);
      iceRainTick(dt);
      grozaTick(dt);
      whiteoutTick(dt);
      parostTick(dt);
      haloTick(dt);
      moonHaloTick(dt);

      // порывы ветра + глухие волки
      gustTick(dt);

      // ледяная корка тает
      iceCrustTick(gm);

      // климатические вехи — проверяем по часам (эвент ниже), но и тут
      // на случай долгого сна (time:hour догонит)
    } catch (e) {
      WS.err('weather2 tick:', e && e.message);
    }
  }

  /** Часовой слушатель: вехи нарратива, расписание ледяного дождя. */
  function onHour(ev) {
    try {
      if (!running()) return;
      var hour = ev && ev.hour !== undefined ? ev.hour : Math.floor(hourF());
      climateMilestones();

      // бросок судьбы на ледяной дождь (день 15, раз за партию)
      var g2 = G2();
      var day = WS.Time ? WS.Time.day() : 1;
      if (g2 && !g2.iceSched && !g2.flags.ice_rolled && day >= ICE_SCHED_DAY) {
        g2.flags.ice_rolled = 1;
        if (WS.RNG.hash2((WS.G.seed >>> 0), 51, 777) < ICE_PROB) {
          var dRoll = WS.RNG.hash2((WS.G.seed >>> 0), 52, 777);
          var hRoll = WS.RNG.hash2((WS.G.seed >>> 0), 53, 777);
          g2.iceSched = {
            day: ICE_DAY_LO + Math.floor(dRoll * (ICE_DAY_HI - ICE_DAY_LO + 1)),
            hour: ICE_HOUR_LO + Math.floor(hRoll * (ICE_HOUR_HI - ICE_HOUR_LO + 1))
          };
          WS.log('weather2: ледяной дождь назначен на день ' +
                 g2.iceSched.day + ', ' + g2.iceSched.hour + ':00');
        }
      }
      // пропущенное расписание (не случилось погоды) — на следующий час
      if (g2 && g2.iceSched && day > g2.iceSched.day) {
        g2.iceSched.day = day;
        g2.iceSched.hour = Math.min(hour + 1, 20);
      }
    } catch (e) {
      WS.err('weather2 onHour:', e && e.message);
    }
  }

  // ====================================================================
  //  РЕНДЕР (приоритет 76 — ПОСЛЕ кадра Gfx и сияния events.js)
  //  Порядок слоёв (снизу вверх): иней -> изморозь -> звёзды/луна ->
  //  гало -> ледяной дождь -> молния -> белая стена -> штрихи порыва.
  // ====================================================================

  function drawTick() {
    try {
      var ctx = WS.Gfx && WS.Gfx.c ? WS.Gfx.c() : null;
      if (!ctx || !ctx.canvas) return;
      if (!running()) return;
      if (!M) M = WS.M;
      var cv = ctx.canvas;
      var W2 = cv.width, H2 = cv.height;
      var tSec = performance.now() / 1000;

      if (isActive('inei')) drawInei(ctx, W2, H2, tSec);
      if (isActive('izmoroz')) drawIzmoroz(ctx, W2, H2, tSec);
      if (starNightActive()) drawStars(ctx, W2, H2, tSec);
      if (isActive('halo')) drawHalo(ctx, W2, H2, false, tSec);
      if (isActive('moonhalo') && starNightActive()) drawHalo(ctx, W2, H2, true, tSec);
      if (isActive('ice_rain') || iceCrustMin > 0) drawIce(ctx, W2, H2, tSec);
      drawLightning(ctx, W2, H2);
      if (isActive('whiteout')) drawWhiteout(ctx, W2, H2, tSec);
      if (gust.env > 0.05) drawGust(ctx, W2, H2, tSec);
      if (WS.debug) drawDebug(ctx, W2, H2);
    } catch (e) {
      WS.err('weather2 draw:', e && e.message);
    }
  }

  // --------------------------------------------------------------------
  //  ИНЕЙ: тонкая белёсая вуаль, мир «чуть светлее», редкие иглы блеска
  // --------------------------------------------------------------------

  function drawInei(ctx, W2, H2, tSec) {
    // очень лёгкое высветление (по ТЗ — визуально чуть светлее)
    ctx.fillStyle = 'rgba(232,240,250,0.045)';
    ctx.fillRect(0, 0, W2, H2);
    // морозные иглы: редкие короткие штрихи в нижней половине (наст)
    ctx.save();
    ctx.fillStyle = 'rgba(246,250,255,0.5)';
    for (var i = 0; i < 22; i++) {
      var u = (i * 0.618) % 1;
      var v = 0.5 + ((i * 0.383) % 1) * 0.48;
      var a = Math.sin(tSec * 1.8 + i * 2.1);
      if (a < 0.4) continue;
      ctx.globalAlpha = (a - 0.4) * 0.35;
      ctx.fillRect(u * W2, v * H2, 3, 1);
    }
    ctx.restore();
  }

  // --------------------------------------------------------------------
  //  ИЗМОРОЗЬ: деревья в белом меху — мягкие белые ореолы на кронах
  // --------------------------------------------------------------------

  function drawIzmoroz(ctx, W2, H2, tSec) {
    // кэш деревьев в кадре обновляем раз в 0.6 с
    treeCacheT -= 1 / 60;
    if (treeCacheT <= 0 || !treeCache.length) {
      treeCacheT = 0.6;
      refreshTreeCache();
    }
    if (!treeCache.length) return;
    var cam = WS.Cam;
    var c = cam.canvasCenter();
    var zoom = cam.zoom;
    var breath = 0.8 + 0.2 * Math.sin(tSec * 0.7);
    ctx.save();
    for (var i = 0; i < treeCache.length; i++) {
      var t = treeCache[i];
      var s = M.toScreen(t.x - cam.cx - cam._shakeX, t.y - cam.cy - cam._shakeY);
      var sx = c.x + s.x * zoom;
      var sy = c.y + s.y * zoom;
      // «мех»: два эллипса — крона и подножие, тающие границы
      ctx.globalAlpha = 0.16 * breath;
      ctx.fillStyle = '#eef4fb';
      ctx.beginPath();
      ctx.ellipse(sx, sy - t.h * 0.62 * zoom, t.r * 1.25 * zoom, t.h * 0.5 * zoom, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.09 * breath;
      ctx.beginPath();
      ctx.ellipse(sx, sy - t.h * 0.3 * zoom, t.r * 0.85 * zoom, t.h * 0.32 * zoom, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /** Кэш деревьев в кадре (ель/сосна/берёза/сухостой). */
  function refreshTreeCache() {
    treeCache.length = 0;
    try {
      if (!WS.Cam || !WS.World) return;
      var vb = WS.Cam.viewBounds(2);
      var list = WS.World.query(vb.x0, vb.y0, vb.x1, vb.y1);
      var kinds = {
        tree_pine: { r: 22, h: 52 }, tree_pine_small: { r: 14, h: 30 },
        tree_birch: { r: 12, h: 42 }, tree_dead: { r: 10, h: 36 }
      };
      for (var i = 0; i < list.length && treeCache.length < 90; i++) {
        var o = list[i];
        if (!o || o.hp !== undefined) continue;       // сущности мимо
        var k = kinds[o.sprName];
        if (!k) continue;
        treeCache.push({ x: o.x, y: o.y, r: k.r, h: k.h });
      }
    } catch (e) { /* кэш не критичен */ }
  }

  // --------------------------------------------------------------------
  //  ЗВЁЗДЫ + ЛУНА + ЛУННЫЙ СВЕТ
  //  Звёзды рисуются ПОВЕРХ тьмы (applyLight уже затемнил кадр):
  //  получается глубокое северное небо. Луна — диск с кратерами и
  //  мягким гало; лунный свет — едва заметная холодная подсветка кадра.
  // --------------------------------------------------------------------

  function drawStars(ctx, W2, H2, tSec) {
    if (starSeed !== (WS.G.seed >>> 0)) buildStars(WS.G.seed >>> 0);

    // особо тёмное небо: мягкая чёрная шапка сверху (глубина неба)
    var g = ctx.createLinearGradient(0, 0, 0, H2 * 0.45);
    g.addColorStop(0, 'rgba(2,4,10,0.34)');
    g.addColorStop(1, 'rgba(2,4,10,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W2, H2 * 0.45);

    // Млечный Путь — россыпь едва видимых точек по диагонали
    ctx.fillStyle = '#cfdcec';
    for (var m = 0; m < milky.length; m++) {
      ctx.globalAlpha = milky[m].a;
      ctx.fillRect(milky[m].x * W2, milky[m].y * H2, 1, 1);
    }

    // звёзды: мерцание кубическим спадом, в полярную ночь — крупнее
    var polar = WS.Time && WS.Time.isPolarNight ? WS.Time.isPolarNight() : false;
    var boost = polar ? 1.35 : 1;
    var i, st, a;
    for (i = 0; i < stars.length; i++) {
      st = stars[i];
      a = Math.sin(tSec * st.sp + st.ph);
      if (a <= 0.15) continue;
      a = (a - 0.15) / 0.85;
      ctx.globalAlpha = clamp(a * 0.9 * boost, 0, 1);
      ctx.fillStyle = st.hue ? 'hsl(' + st.hue + ',50%,82%)' : '#e8eef8';
      var sz = st.sz * (polar ? 1.3 : 1);
      ctx.fillRect(st.x * W2, st.y * H2, sz, sz);
    }
    ctx.globalAlpha = 1;

    drawMoon(ctx, W2, H2);

    // первая звёздная ночь дня — тихая радость (+1 рассудка, без тоста-крика)
    if (onceDay('starnight_feel')) addSanity(1);
  }

  function drawMoon(ctx, W2, H2) {
    var mp = moonPos();
    var mx = mp.x * W2, my = mp.y * H2;
    var r = Math.min(W2, H2) * 0.034;

    // мягкое свечение вокруг диска
    var glow = ctx.createRadialGradient(mx, my, r * 0.6, mx, my, r * 5);
    glow.addColorStop(0, 'rgba(214,226,244,0.20)');
    glow.addColorStop(1, 'rgba(214,226,244,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(mx - r * 5, my - r * 5, r * 10, r * 10);

    // диск
    var disc = ctx.createRadialGradient(mx - r * 0.3, my - r * 0.3, r * 0.1, mx, my, r);
    disc.addColorStop(0, '#f2f5fa');
    disc.addColorStop(0.85, '#d4dde9');
    disc.addColorStop(1, '#bcc8d8');
    ctx.fillStyle = disc;
    ctx.beginPath();
    ctx.arc(mx, my, r, 0, Math.PI * 2);
    ctx.fill();

    // кратеры
    ctx.fillStyle = 'rgba(150,164,184,0.5)';
    ctx.beginPath();
    ctx.arc(mx - r * 0.35, my + r * 0.2, r * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(mx + r * 0.3, my - r * 0.25, r * 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(mx + r * 0.1, my + r * 0.45, r * 0.11, 0, Math.PI * 2);
    ctx.fill();

    // ЛУННЫЙ СВЕТ (по ТЗ): ночью при ясно чуть выше освещённость.
    // applyLight ядра трогать нельзя — даём зрительный эквивалент:
    // очень слабая холодная заливка + публичный геттер moonLight().
    ctx.fillStyle = 'rgba(186,208,238,' + MOON_LIGHT.toFixed(3) + ')';
    ctx.fillRect(0, 0, W2, H2);
  }

  // --------------------------------------------------------------------
  //  ГАЛО (зимняя радуга): венец 22°, ложные солнца, солнечный столб
  // --------------------------------------------------------------------

  function drawHalo(ctx, W2, H2, moon, tSec) {
    var pos = moon ? moonPos() : sunPos();
    var cx = pos.x * W2, cy = pos.y * H2;
    var R = Math.min(W2, H2) * (moon ? 0.14 : 0.19);
    var fade = 1;
    var p = moon ? phen.moonhalo : phen.halo;
    if (p) {
      fade = Math.min(1, p.t / 60);                        // проявление ~1 мин
      fade *= Math.min(1, Math.max(0, (p.dur - p.t) / 60)); // растворение
    }
    if (fade <= 0.02) return;
    var k = (moon ? 0.5 : 1) * fade;

    ctx.save();

    // сам венец: радужное кольцо (тёплый край внутри, холодный снаружи)
    var i, a0, a1, hue;
    var seg = 40;
    for (i = 0; i < seg; i++) {
      a0 = (i / seg) * Math.PI * 2;
      a1 = ((i + 1.05) / seg) * Math.PI * 2;
      hue = 40 - (i / seg) * 260;      // красный -> фиолетовый по дуге
      ctx.strokeStyle = 'hsla(' + ((hue + 360) % 360) + ',65%,72%,' + (0.16 * k).toFixed(3) + ')';
      ctx.lineWidth = Math.max(2, R * 0.045);
      ctx.beginPath();
      ctx.arc(cx, cy, R, a0, a1);
      ctx.stroke();
    }

    if (!moon) {
      // ложные солнца (паргелии): два ярких пятна на уровне солнца
      drawParhelion(ctx, cx - R * 0.92, cy + R * 0.1, R * 0.09, k);
      drawParhelion(ctx, cx + R * 0.92, cy + R * 0.1, R * 0.09, k);

      // солнечный столб: вертикальная игла света от солнца вниз
      var pill = ctx.createLinearGradient(cx, cy, cx, cy + R * 2.6);
      pill.addColorStop(0, 'rgba(250,246,224,' + (0.3 * k).toFixed(3) + ')');
      pill.addColorStop(1, 'rgba(250,246,224,0)');
      ctx.fillStyle = pill;
      ctx.fillRect(cx - R * 0.05, cy, R * 0.1, R * 2.6);
      // и вверх — короткая
      var pill2 = ctx.createLinearGradient(cx, cy, cx, cy - R * 1.2);
      pill2.addColorStop(0, 'rgba(250,246,224,' + (0.18 * k).toFixed(3) + ')');
      pill2.addColorStop(1, 'rgba(250,246,224,0)');
      ctx.fillStyle = pill2;
      ctx.fillRect(cx - R * 0.035, cy - R * 1.2, R * 0.07, R * 1.2);

      // само солнце: яркий блик с морозными иглами
      drawParhelion(ctx, cx, cy, R * 0.13, k * 1.3);
      ctx.strokeStyle = 'rgba(250,248,236,' + (0.4 * k).toFixed(3) + ')';
      ctx.lineWidth = 1;
      for (i = 0; i < 6; i++) {
        var ang = i * Math.PI / 3 + 0.26;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(ang) * R * 0.16, cy + Math.sin(ang) * R * 0.16);
        ctx.lineTo(cx + Math.cos(ang) * R * 0.3, cy + Math.sin(ang) * R * 0.3);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  /** Ложное солнце: маленькое радужное пятнышко с ядром. */
  function drawParhelion(ctx, x, y, r, k) {
    var g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.4);
    g.addColorStop(0, 'rgba(252,250,240,' + (0.75 * k).toFixed(3) + ')');
    g.addColorStop(0.4, 'rgba(240,225,190,' + (0.30 * k).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(220,230,250,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r * 2.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // --------------------------------------------------------------------
  //  ЛЕДЯНОЙ ДОЖДЬ: быстрые иглы-капли и глянцевый блеск наста
  // --------------------------------------------------------------------

  function drawIce(ctx, W2, H2, tSec) {
    var raining = isActive('ice_rain');
    var crust = iceCrustMin > 0;

    // глянец: диагональные полосы отражённого света по «земле»
    if (crust) {
      var k = raining ? 0.10 : 0.045;
      var g = ctx.createLinearGradient(0, H2 * 0.4, W2 * 0.3, H2);
      g.addColorStop(0, 'rgba(198,222,244,0)');
      g.addColorStop(0.5, 'rgba(198,222,244,' + k.toFixed(3) + ')');
      g.addColorStop(1, 'rgba(198,222,244,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, H2 * 0.4, W2, H2 * 0.6);
    }

    if (!raining) return;

    // сами капли-иглы: летят быстро и косо, блестят
    ctx.save();
    var n = 90;
    var i, u, x, y, len;
    for (i = 0; i < n; i++) {
      u = (i * 0.6180339887 + tSec * (0.5 + (i % 5) * 0.09)) % 1;
      x = ((u * 1.3) % 1) * W2;
      y = ((u * 2.7 + i * 0.017) % 1) * H2;
      len = 7 + (i % 4) * 3;
      ctx.globalAlpha = 0.14 + 0.14 * ((i % 3) / 2);
      ctx.fillStyle = (i % 7 === 0) ? '#dbeeff' : '#c4dcee';
      ctx.fillRect(x, y, 1.4, len);
    }
    ctx.restore();
  }

  // --------------------------------------------------------------------
  //  МОЛНИЯ: рваная дуга + вспышка всего кадра
  // --------------------------------------------------------------------

  function drawLightning(ctx, W2, H2) {
    if (flash > 0.01) {
      // многослойная вспышка: мгновенно ярко, потом тлеет
      var a = flash;
      ctx.fillStyle = 'rgba(226,236,250,' + (a * 0.55).toFixed(3) + ')';
      ctx.fillRect(0, 0, W2, H2);
      if (flash > 0.75) {
        ctx.fillStyle = 'rgba(246,250,255,' + ((flash - 0.75) * 0.9).toFixed(3) + ')';
        ctx.fillRect(0, 0, W2, H2);
      }
    }
    if (!bolts.length) return;
    var i, b, j;
    ctx.save();
    for (i = 0; i < bolts.length; i++) {
      b = bolts[i];
      var life = 1 - b.t / 0.45;
      var a2 = b.a * clamp(life, 0, 1);
      // свечение дуги
      ctx.strokeStyle = 'rgba(190,214,246,' + (a2 * 0.4).toFixed(3) + ')';
      ctx.lineWidth = 9;
      poly(ctx, b.pts);
      // ядро
      ctx.strokeStyle = 'rgba(250,252,255,' + a2.toFixed(3) + ')';
      ctx.lineWidth = 2.5;
      poly(ctx, b.pts);
      // пара боковых отростков
      if (b.pts.length > 5) {
        var m = b.pts[Math.floor(b.pts.length / 2)];
        ctx.strokeStyle = 'rgba(240,246,255,' + (a2 * 0.8).toFixed(3) + ')';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(m[0], m[1]);
        ctx.lineTo(m[0] - 30 + Math.random() * 12, m[1] + 26);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function poly(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (var j = 1; j < pts.length; j++) ctx.lineTo(pts[j][0], pts[j][1]);
    ctx.stroke();
  }

  // --------------------------------------------------------------------
  //  ВЬЮГА-«СТЕНА»: молочный смыв, центр чуть прозрачнее краёв
  // --------------------------------------------------------------------

  function drawWhiteout(ctx, W2, H2, tSec) {
    var p = phen.whiteout;
    var k = p ? clamp(p.t / 4, 0, 1) * clamp((p.dur - p.t) / 4, 0, 1) : 0;
    if (k <= 0.02) return;
    var m = Math.min(W2, H2);
    var g = ctx.createRadialGradient(W2 / 2, H2 / 2, m * 0.04, W2 / 2, H2 / 2, m * 0.8);
    var a = 0.78 * k;
    g.addColorStop(0, 'rgba(224,232,242,' + (a * 0.55).toFixed(3) + ')');
    g.addColorStop(0.5, 'rgba(224,232,242,' + (a * 0.85).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(228,236,246,' + a.toFixed(3) + ')');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W2, H2);
    // живое дыхание стены: бегущие белые языки
    ctx.save();
    ctx.fillStyle = 'rgba(238,244,252,0.5)';
    for (var i = 0; i < 5; i++) {
      var u = (i / 5 + tSec * 0.13) % 1;
      var y = (0.1 + ((i * 0.37) % 1) * 0.8) * H2;
      ctx.globalAlpha = 0.1 * k;
      ctx.fillRect(u * W2 - 60, y, 120 + i * 30, 26 + i * 8);
    }
    ctx.restore();
  }

  // --------------------------------------------------------------------
  //  ПОРЫВ ВЕТРА: снежная пыль по диагонали + горизонтальные штрихи
  //  (основной снег наклоняет weather.js — сюда добавляем только пыль
  //  от земли и быстрые «хлысты» снега у нижней кромки)
  // --------------------------------------------------------------------

  function drawGust(ctx, W2, H2, tSec) {
    var k = gust.env;
    var wv = windVec();
    ctx.save();
    var i, u, x, y;
    // хлысты: длинные полупрозрачные штрихи, летящие по ветру
    for (i = 0; i < 14; i++) {
      u = (i * 0.618 + tSec * (1.2 + (i % 4) * 0.35)) % 1;
      x = u * W2;
      y = H2 * (0.35 + ((i * 0.377) % 1) * 0.6);
      ctx.globalAlpha = 0.05 + 0.07 * k;
      ctx.fillStyle = '#e8eef6';
      ctx.fillRect(x, y, 60 + k * 90, 2 + (i % 3));
    }
    // пыль от земли: в нижней трети мелкая рябь по направлению ветра
    var dirX = wv.x >= 0 ? 1 : -1;
    for (i = 0; i < 20; i++) {
      u = (i * 0.383 + tSec * (0.8 + (i % 5) * 0.2)) % 1;
      x = u * W2;
      y = H2 * (0.72 + ((i * 0.618) % 1) * 0.26);
      ctx.globalAlpha = 0.06 + 0.08 * k;
      ctx.fillStyle = '#dfe7f0';
      ctx.fillRect(dirX > 0 ? x : W2 - x, y, (8 + k * 14), 1.5);
    }
    ctx.restore();
  }

  // --------------------------------------------------------------------
  //  ОТЛАДКА (WS.debug)
  // --------------------------------------------------------------------

  function drawDebug(ctx, W2, H2) {
    var names = [];
    for (var k in phen) if (phen.hasOwnProperty(k)) names.push(k);
    var lines = [
      'weather2: [' + (names.length ? names.join(',') : '-') + '] ' + dbgLast,
      'климат ' + climateOffset(WS.Time ? WS.Time.day() : 1).toFixed(1) +
        '°C, force ' + (G2() && G2().force ? G2().force.off + '°/' + Math.round((G2().force.until - gameMin()) / 60) + 'ч' : '—'),
      'корка ' + Math.round(iceCrustMin) + ' мин, порыв ' + (gust.env * 100).toFixed(0) + '%'
    ];
    ctx.save();
    ctx.font = '12px monospace';
    ctx.textAlign = 'left';
    var y = H2 - 60;
    for (var i = 0; i < lines.length; i++) {
      ctx.fillStyle = 'rgba(6,10,18,0.72)';
      ctx.fillRect(8, y - 11, ctx.measureText(lines[i]).width + 10, 15);
      ctx.fillStyle = '#cfe3f5';
      ctx.fillText(lines[i], 13, y);
      y += 16;
    }
    ctx.restore();
  }

  // ====================================================================
  //  ЖИЗНЕННЫЙ ЦИКЛ ПАРТИИ
  // ====================================================================

  function revive() {
    // оживление после старта/загрузки: свой ГПСЧ, чистые таймеры
    var seed = 1;
    if (WS.G) seed = (WS.G.seed >>> 0) || 1;
    Rt = WS.RNG.mk((seed ^ 0x2EA7) >>> 0);
    phen = {};
    checkT = 0;
    blizzardT = 0;
    bolts.length = 0;
    thunderQ.length = 0;
    flash = 0;
    grozaLeft = 0;
    grozaCd = 0;
    iceFallCd = 0;
    iceCrustMin = 0;
    gust.phase = 'idle';
    gust.env = 0;
    restoreWolves();
    removeParObjs();
    waterPts.length = 0;
    treeCache.length = 0;
    lastMin = -1;
    buildStars(seed);
    G2();       // создать состояние, если его нет
    installPatches();
  }

  function onGameStart() { revive(); }
  function onGameLoad() { revive(); }

  function onWeatherChanged(ev) {
    // явления переживают смену типа, но мягко гаснут (fadeIfBroken в тиках)
    if (ev && ev.to === 'blizzard') blizzardT = 0;   // новая метель — новый счёт
  }

  // ====================================================================
  //  ПУБЛИЧНЫЙ API МОДУЛЯ
  // ====================================================================

  var Weather2 = {

    /** Активные явления (массив id). */
    active: function () {
      var out = [];
      for (var k in phen) if (phen.hasOwnProperty(k)) out.push(k);
      return out;
    },

    /** Явление активно? Weather2.isActive('whiteout'). */
    isActive: isActive,

    /** Сила текущего порыва ветра 0..1. */
    gust: function () { return gust.env; },

    /** Белая стена идёт? */
    whiteout: function () { return isActive('whiteout'); },

    /** Ледяная корка на земле (игровых минут осталось). */
    iceCrust: function () { return Math.max(0, iceCrustMin); },

    /** Добавка освещённости от луны (0..0.05) — по ТЗ «light() + 0.05». */
    moonLight: function () {
      return starNightActive() ? MOON_LIGHT : 0;
    },

    /** Климатический офсет дня, °C. */
    climateOffset: function () {
      return climateOffset(WS.Time ? WS.Time.day() : 1);
    },

    /** Полный температурный офсет weather2 (климат + forceTemp). */
    tempOffset: tempOffset,

    /** Состояние forceTemp или null. */
    forceInfo: function () {
      var g2 = G2();
      return (g2 && g2.force) ? {
        off: g2.force.off,
        hoursLeft: Math.max(0, (g2.force.until - gameMin()) / 60),
        envelope: forceEnvelope()
      } : null;
    },

    /** Отладка/тесты: принудительно запустить явление. */
    trigger: function (id) {
      switch (id) {
        case 'inei': return startPhen('inei', { dur: 300 });
        case 'izmoroz': return startPhen('izmoroz', { dur: 300 });
        case 'ice_rain': return startPhen('ice_rain', { dur: 120 });
        case 'whiteout': return startPhen('whiteout', { dur: 40 });
        case 'halo': return startPhen('halo', { dur: 300 });
        case 'moonhalo': return startPhen('moonhalo', { dur: 300 });
        case 'parost': return startPhen('parost', {});
        case 'gust':
          gust.phase = 'rise';
          gust.t = 0;
          gust.dur = 6;
          return true;
        case 'groza':
          grozaLeft = 3;
          grozaCd = 0.2;
          return true;
        default: return false;
      }
    },

    /** Снять все явления (для тестов). */
    clear: function () {
      var ks = Weather2.active();
      for (var i = 0; i < ks.length; i++) endPhen(ks[i]);
      grozaLeft = 0;
      bolts.length = 0;
      thunderQ.length = 0;
      flash = 0;
      iceCrustMin = 0;
      restoreWolves();
    },

    // ---------------------------------------------------------------
    //  САМОТЕСТ (консоль: WS.Weather2.selftest())
    // ---------------------------------------------------------------

    selftest: function () {
      var out = [];
      var ok = function (name, cond) {
        out.push((cond ? '  ok  ' : ' FAIL ') + name);
        return !!cond;
      };
      ok('патчи Weather установлены', patched && WS.Weather.forceTemp &&
         WS.Weather.tempOutside && WS.Weather.windLevel);
      ok('forceTemp есть и возвращает', (function () {
        var r = WS.Weather.forceTemp(5, 1);
        return r === true || r === false;
      })());
      ok('климат-кривая монотонна по тренду крещенья', (function () {
        var a = climateOffset(2), b = climateOffset(39), c = climateOffset(60);
        return b < a && c > b;
      })());
      ok('офсет температуры конечен', isFinite(tempOffset()));
      if (WS.G && WS.G.running) {
        // явления стартуют и снимаются
        var before = Weather2.active().length;
        Weather2.trigger('whiteout');
        ok('whiteout стартует', isActive('whiteout'));
        Weather2.clear();
        ok('clear снимает явления', Weather2.active().length <= before);
        // видимость в обёртке остаётся в границах
        var v = WS.Weather.visibility();
        ok('visibility в (0,1] после clear', v > 0 && v <= 1.0001);
        // порыв не ломает ветер
        Weather2.trigger('gust');
        var w = WS.Weather.windLevel();
        ok('windLevel в [0,1] при порыве', w >= 0 && w <= 1);
        Weather2.clear();
        // рисование не падает
        var drawn = true;
        Weather2.trigger('halo');
        try {
          var ctx = WS.Gfx && WS.Gfx.c ? WS.Gfx.c() : null;
          if (ctx) drawTick();
        } catch (e) { drawn = false; }
        ok('draw не падает', drawn);
        Weather2.clear();
      } else {
        out.push('  --   нет партии: интерактивные проверки пропущены');
      }
      return out;
    }
  };

  // ====================================================================
  //  ЛОКАЛИЗАЦИЯ (по контракту все новые строки — в словарь)
  // ====================================================================

  WS.boot(function initWeather2I18N() {
    try {
      WS.Data = WS.Data || {};
      WS.Data.locales = WS.Data.locales || {};
      WS.Data.locales.ru = WS.Data.locales.ru || {};
      WS.Data.locales.en = WS.Data.locales.en || {};
      var ru = WS.Data.locales.ru, en = WS.Data.locales.en;

      ru['w2.inei.start'] = 'Выпал иней. Мир стал чуть светлее.';
      en['w2.inei.start'] = 'Hoarfrost fell. The world grew a shade lighter.';
      ru['w2.izm.start'] = 'Изморозь: деревья оделись в белый мех.';
      en['w2.izm.start'] = 'Rime: the trees donned white fur.';
      ru['w2.izm.seen'] = 'Красиво — аж дышится легче.';
      en['w2.izm.seen'] = 'Beautiful — it eases the breath.';
      ru['w2.ice.start'] = 'Ледяной дождь! Всё обрастает коркой льда.';
      en['w2.ice.start'] = 'Freezing rain! Everything grows a crust of ice.';
      ru['w2.ice.end'] = 'Дождь кончился. Всё в ледяной корке — скользко.';
      en['w2.ice.end'] = 'The rain is over. All is crusted in ice — slippery.';
      ru['w2.ice.fall'] = 'Ноги разъехались на льду!';
      en['w2.ice.fall'] = 'Your feet slid out on the ice!';
      ru['w2.groza.name'] = 'Метель с грозой';
      en['w2.groza.name'] = 'Thundersnow';
      ru['w2.groza.first'] = 'Метель с грозой! Молнии рвут белую мглу.';
      en['w2.groza.first'] = 'A thundersnow! Lightning tears the white murk.';
      ru['w2.wo.name'] = 'Белая стена';
      en['w2.wo.name'] = 'White wall';
      ru['w2.wo.start'] = 'Белая стена. Не видно вытянутой руки.';
      en['w2.wo.start'] = 'A white wall. Cannot see an outstretched hand.';
      ru['w2.wo.end_lost'] = 'Стена прошла, но где вы — теперь понятно не сразу.';
      en['w2.wo.end_lost'] = 'The wall has passed, but where you are — not so clear now.';
      ru['w2.ice.name'] = 'Ледяной дождь';
      en['w2.ice.name'] = 'Freezing rain';
      ru['w2.halo.start'] = 'Вокруг солнца — радужный венец. К трескучему морозу.';
      en['w2.halo.start'] = 'A rainbow ring around the sun. A hard frost is coming.';
      ru['w2.moonhalo.start'] = 'Вокруг луны — бледный венец. Быть крепкому морозу.';
      en['w2.moonhalo.start'] = 'A pale ring around the moon. A hard frost is coming.';
      ru['w2.parost.start'] = 'Над рекой стоит морозная дымка.';
      en['w2.parost.start'] = 'Frost mist hangs above the river.';

      ru['w2.clim.soft'] = 'Ноябрь мягок: снег лежит, а мороз ещё дремлет.';
      en['w2.clim.soft'] = 'November is mild: the snow lies, the frost still dozes.';
      ru['w2.clim.dec'] = 'Декабрь вступает в силу — мороз берёт за бока.';
      en['w2.clim.dec'] = 'December sets in — the frost grips your sides.';
      ru['w2.clim.deep'] = 'Морозы крепчают. К Крещению будет люто.';
      en['w2.clim.deep'] = 'The frosts grow harder. Epiphany will be fierce.';
      ru['w2.clim.epiphany'] = 'Крещенская стужа. Так холодно, что воздух звенит.';
      en['w2.clim.epiphany'] = 'Epiphany cold. So cold the air rings.';
      ru['w2.clim.relax'] = 'Стужа чуть отпускает свои тиски.';
      en['w2.clim.relax'] = 'The cold loosens its grip, a little.';
      ru['w2.clim.end'] = 'Мороз отступает. Скоро по реке придёт пароход.';
      en['w2.clim.end'] = 'The frost retreats. Soon the steamboat will come up the river.';
    } catch (e) {
      WS.warn('weather2 i18n:', e && e.message);
    }
  }, 'weather2:i18n');

  // ====================================================================
  //  BOOT: тики 16/76, слушатели, патчи (после boot weather.js)
  // ====================================================================

  WS.boot(function initWeather2() {
    M = WS.M;
    installPatches();

    // симуляция — сразу после погоды (15), чтобы офсеты ложились
    // на свежую температуру этого же кадра
    WS.tick(TICK_SIM, simTick, 'weather2:sim');

    // рендер — ПОВЕРХ кадра Gfx (70) и сияния events.js (75):
    // у weather.js своих хуков отрисовки чужих слоёв нет, поэтому
    // рисуем сами, отдельным тиком (по ТЗ)
    WS.tick(TICK_DRAW, drawTick, 'weather2:draw');

    WS.Ev.on('time:hour', onHour);
    WS.Ev.on('game:start', onGameStart);
    WS.Ev.on('game:load', onGameLoad);
    WS.Ev.on('weather:changed', onWeatherChanged);

    WS.log('weather2: явления (тик ' + TICK_SIM + '/' + TICK_DRAW +
           '), климат 60 дней, forceTemp подключён');
  }, 'weather2:init');

  WS.def('Weather2', Weather2);
})();
