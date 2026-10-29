/**
 * weather.js — ПОГОДА «Белого Безмолвия»: цепочка Маркова на 7 типов
 * (ноябрь мягче, декабрь злее), температура/ветер/свет/снегопад/туман,
 * параллакс-частицы снега в 3 слоя, полосы метели, северное сияние.
 * Владеет состоянием WS.G.weather (сериализуется автоматически — это
 * чистые данные). Связи: Gfx.frame -> Weather.draw(ctx, cam) каждый кадр;
 * audio.js читает windLevel(); temperature.js (B1) читает tempOutside()/
 * windLevel(); событие 'weather:changed' {from, to}; тик 15 (после Time).
 */
(function () {
  'use strict';

  // ====================================================================
  //  КОНСТАНТЫ И НАСТРОЙКИ
  //  Весь баланс погоды собран в этих таблицах — правится в одном месте.
  // ====================================================================

  var TICK_PRI = 15;            // приоритет тика (CONTRACT.md: погода = 15)
  var TRANS_MIN = 30;           // минут плавного перехода между типами
  var DUR_MIN_LO = 120;        // минимальная длительность типа (2 часа)
  var DUR_MIN_HI = 360;        // максимальная (6 часов)
  var TEMP_BASE = -11;          // база температуры, °C (1 ноября, полдень)
  var DRIFT_AMP = 3;            // амплитуда плавного дрейфа ±3°C
  var DRIFT_PERIOD = 47.3;      // период дрейфа, игровых минут (~5 часов)
  var WIND_OSC1 = 0.10;         // амплитуда медленной осцилляции ветра
  var WIND_OSC2 = 0.05;         // ... и быстрой ряби поверх
  var GUST_EXTRA = 0.18;        // добавка порывов в штормовых типах
  var SNOW_COVER_RATE = 0.045;   // прирост покрова за час при снегопаде 1.0
  var SNOW_MELT_RATE = 0.03;     // таяние за час при температуре выше -1°C
  var P_LIMIT = 400;             // жёсткий лимит частиц снега (по ТЗ)
  var BAND_COUNT = 7;            // горизонтальных полос метели
  var FOG_BLOBS = 6;             // крупных пятен тумана
  var SPARKLES = 26;             // бликов «снег искрится» на морозе
  var AURORA_CURTAINS = 3;       // занавесей северного сияния

  /**
   * Паспорт типа погоды. Поля:
   *   name   — русское название (тосты/UI; есть и в I18N ниже)
   *   tMod   — модификатор температуры днём, °C
   *   tNight — модификатор ночью (часы 21..5), °C
   *   wind   — базовый уровень ветра 0..1
   *   light  — затемнение 0..1 (потребляет Gfx.applyLight)
   *   snow   — интенсивность снегопада 0..1 (частицы)
   *   vis    — видимость 0..1 (для ИИ)
   *   fog    — плотность тумана 0..1 (для рендера)
   *   durMul — множитель длительности (метели держатся дольше)
   *   harsh  — «злая» погода: тост при наступлении + волки воют
   */
  var TYPES = {
    clear: {
      name: 'Ясно', tMod: -2, tNight: -10, wind: 0.20, light: 0.03,
      snow: 0.03, vis: 1.00, fog: 0.00, durMul: 1.0, harsh: false
    },
    overcast: {
      name: 'Пасмурно', tMod: 3, tNight: 1, wind: 0.30, light: 0.10,
      snow: 0.08, vis: 0.95, fog: 0.05, durMul: 1.0, harsh: false
    },
    snow: {
      name: 'Снег', tMod: 0, tNight: -1, wind: 0.40, light: 0.18,
      snow: 0.60, vis: 0.85, fog: 0.15, durMul: 1.0, harsh: false
    },
    blizzard: {
      name: 'Метель', tMod: -8, tNight: -9, wind: 1.00, light: 0.35,
      snow: 1.00, vis: 0.40, fog: 0.45, durMul: 1.35, harsh: true
    },
    fog: {
      name: 'Туман', tMod: 2, tNight: 0, wind: 0.15, light: 0.42,
      snow: 0.00, vis: 0.50, fog: 1.00, durMul: 0.8, harsh: false
    },
    hard_frost: {
      name: 'Лютый мороз', tMod: -14, tNight: -16, wind: 0.10, light: 0.05,
      snow: 0.02, vis: 0.95, fog: 0.10, durMul: 1.2, harsh: true
    },
    snowstorm: {
      name: 'Снежная буря', tMod: -6, tNight: -7, wind: 0.70, light: 0.28,
      snow: 0.85, vis: 0.60, fog: 0.35, durMul: 1.15, harsh: true
    }
  };

  /** Порядок типов — для матриц, прогнозов и отладки. */
  var TYPE_IDS = ['clear', 'overcast', 'snow', 'snowstorm', 'blizzard', 'fog', 'hard_frost'];

  /**
   * Матрица переходов для ранней зимы (ноябрь, фактор сезона 0).
   * Веса относительные, нормализуются на месте. Ноябрь мягче: ясных
   * дней больше, метели редки, туманы у реки обычны.
   */
  var MARKOV_NOV = {
    clear:      { clear: 30, overcast: 34, snow: 14, snowstorm: 6, blizzard: 2, fog: 10, hard_frost: 4 },
    overcast:   { clear: 22, overcast: 26, snow: 26, snowstorm: 10, blizzard: 3, fog: 9, hard_frost: 4 },
    snow:       { clear: 8, overcast: 22, snow: 30, snowstorm: 22, blizzard: 9, fog: 4, hard_frost: 5 },
    snowstorm:  { clear: 6, overcast: 20, snow: 28, snowstorm: 18, blizzard: 18, fog: 4, hard_frost: 6 },
    blizzard:   { clear: 4, overcast: 18, snow: 32, snowstorm: 22, blizzard: 12, fog: 4, hard_frost: 8 },
    fog:        { clear: 30, overcast: 28, snow: 12, snowstorm: 5, blizzard: 1, fog: 18, hard_frost: 6 },
    hard_frost: { clear: 34, overcast: 18, snow: 8, snowstorm: 5, blizzard: 2, fog: 12, hard_frost: 21 }
  };

  /**
   * Та же матрица к концу декабря (фактор сезона 1): зима злее —
   * метели ходят цепочками, морозы держатся, прояснения коротки.
   */
  var MARKOV_DEC = {
    clear:      { clear: 14, overcast: 28, snow: 22, snowstorm: 14, blizzard: 8, fog: 6, hard_frost: 8 },
    overcast:   { clear: 8, overcast: 20, snow: 30, snowstorm: 20, blizzard: 12, fog: 4, hard_frost: 6 },
    snow:       { clear: 3, overcast: 12, snow: 32, snowstorm: 26, blizzard: 20, fog: 2, hard_frost: 5 },
    snowstorm:  { clear: 2, overcast: 10, snow: 26, snowstorm: 24, blizzard: 28, fog: 2, hard_frost: 8 },
    blizzard:   { clear: 2, overcast: 10, snow: 28, snowstorm: 26, blizzard: 22, fog: 2, hard_frost: 10 },
    fog:        { clear: 16, overcast: 26, snow: 18, snowstorm: 12, blizzard: 8, fog: 12, hard_frost: 8 },
    hard_frost: { clear: 18, overcast: 16, snow: 12, snowstorm: 10, blizzard: 6, fog: 8, hard_frost: 30 }
  };

  /**
   * Слои снега для параллакса: 0 — дальний (мелкий, медленный,
   * полупрозрачный), 2 — ближний (крупный, быстрый).
   *   fall — скорость падения, px/с при эталонной высоте окна 720
   *   wmul — доля ветра, которую слой «ловит» (эффект глубины)
   *   size — базовый размер зерна, px
   *   share— доля частиц слоя от общего числа
   *   alpha— прозрачность слоя при рисовании
   */
  var LAYERS = [
    { fall: 46, wmul: 0.40, size: 1.6, share: 0.40, alpha: 0.35 },
    { fall: 95, wmul: 0.80, size: 2.6, share: 0.35, alpha: 0.55 },
    { fall: 170, wmul: 1.40, size: 4.0, share: 0.25, alpha: 0.85 }
  ];

  /** Мировые векторы 8 направлений (0=N .. 7=NW), как в player.js. */
  var DIRVEC = [
    [0, -1], [1, -1], [1, 0], [1, 1],
    [0, 1], [-1, 1], [-1, 0], [-1, -1]
  ];

  /** Русские имена направлений — для ветра («северный», «юго-западный»). */
  var DIR_NAMES = [
    'северный', 'северо-восточный', 'восточный', 'юго-восточный',
    'южный', 'юго-западный', 'западный', 'северо-западный'
  ];

  /**
   * Роза ветров: вклад направления в температуру, °C.
   * Северный — с Ледовитого океана, несёт стужу; южный — относительное
   * тепло с материка. Диагонали — половинные значения.
   */
  var DIR_TEMP = [-3, -2, 0, 1, 2, 1, 0, -2];

  /** Шкала силы ветра по-русски (для тостов и описаний). */
  function windWord(wind) {
    if (wind < 0.15) return 'тихо';
    if (wind < 0.35) return 'слабый ветер';
    if (wind < 0.55) return 'ветер';
    if (wind < 0.75) return 'сильный ветер';
    if (wind < 0.9) return 'буря';
    return 'ураганный ветер';
  }

  // ====================================================================
  //  СОСТОЯНИЕ МОДУЛЯ (не сериализуется — оживляет G.weather)
  // ====================================================================

  var R = null;                // детерминированный RNG партии
  var M = null;                // WS.M (заполняется в boot)
  var lastTotalMin = -1;       // прошлый totalMin — дельта игрового времени
  var drawLast = 0;            // performance.now() прошлого кадра отрисовки
  var parts = [];              // частицы снега (экранные координаты)
  var bands = [];              // полосы метели {x, y, w, h, sp, a}
  var blobs = [];              // пятна тумана {x, y, r, ph, sp}
  var sparkles = [];           // блики на снегу {x, y, ph}
  var curtains = [];           // занавеси сияния {x, w, ph, sp, hue}
  var fogTex = null;           // кэш мягкой текстуры тумана (canvas)
  var howlT = 30;              // сек до ближайшего воя вьюги
  var windDirF = 0;            // плавный поворот направления ветра (рендер)

  // ====================================================================
  //  УТИЛИТЫ
  // ====================================================================

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  /** Плавный подъём 0..1 (для переходов погоды и фактора сезона). */
  function smooth(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }

  /** Живая ссылка на состояние погоды (WS.G.weather или null). */
  function W() { return WS.G ? WS.G.weather : null; }

  /** Партия запущена и погода создана? */
  function hasGame() { return !!(WS.G && WS.G.weather && WS.G.running); }

  /** Определение типа (с защитой от неизвестного id). */
  function typeDef(id) { return TYPES[id] || TYPES.clear; }

  /** Фактор сезона: 0 (1 ноября) .. 1 (день 50+, разгар зимы). */
  function seasonFactor() {
    var day = 1;
    if (WS.Time && WS.Time.day) day = WS.Time.day();
    return smooth(clamp((day - 1) / 49, 0, 1));
  }

  /**
   * Строка матрицы переходов на сегодня: интерполяция ноябрьской и
   * декабрьской таблиц по фактору сезона. Нормированные вероятности.
   */
  function markovRow(cur) {
    var f = seasonFactor();
    var a = MARKOV_NOV[cur] || MARKOV_NOV.clear;
    var b = MARKOV_DEC[cur] || MARKOV_DEC.clear;
    var row = {}, sum = 0, i;
    for (i = 0; i < TYPE_IDS.length; i++) {
      var id = TYPE_IDS[i];
      var w = lerp(a[id] !== undefined ? a[id] : 0, b[id] !== undefined ? b[id] : 0, f);
      if (w < 0) w = 0;
      row[id] = w;
      sum += w;
    }
    if (sum <= 0) { row[cur] = 1; return row; }
    for (i = 0; i < TYPE_IDS.length; i++) row[TYPE_IDS[i]] /= sum;
    return row;
  }

  /** Выбор следующего типа по Маркову (взвешенный RNG). */
  function pickNext(cur) {
    if (!R) return 'snow';
    var row = markovRow(cur);
    var items = [];
    for (var k in row) if (row.hasOwnProperty(k)) items.push({ id: k, w: row[k] });
    var pick = R.weighted(items);
    return pick ? pick.id : 'snow';
  }

  /**
   * Суточный ход температуры: 0 в районе 14:00, -6 глубокой ночью
   * (по ТЗ ночь холоднее на -6). Возвращает смещение, °C.
   */
  function diurnal(hourF) {
    return -3 + 3 * Math.cos(((hourF - 14) / 24) * Math.PI * 2);
  }

  /** Сезонное похолодание: к концу декабря добавка до -10°C. */
  function seasonTemp() {
    return -10 * seasonFactor();
  }

  /** Дробная часть суток 0..1 (для сглаживания суточного сдвига). */
  function dayHourFrac() {
    if (!WS.Time || !WS.Time.hourF) return 0;
    return clamp(WS.Time.hourF() / 24, 0, 1);
  }

  /**
   * Суточный «затравочный» сдвиг ±2°C — детерминирован от seed и номера
   * дня, чтобы погода не повторялась день в день. Соседние дни
   * интерполируются: в полночь скачка нет.
   */
  function dailyOffset(day, seed) {
    var d = (typeof day === 'number' && day > 0) ? day : 1;
    var s = (seed >>> 0) || 1;
    var o0 = WS.RNG.hash2(d, 777, s) - 0.5;
    var o1 = WS.RNG.hash2(d + 1, 777, s) - 0.5;
    return lerp(o0, o1, dayHourFrac()) * 4;
  }

  /**
   * Смешанные параметры текущей погоды: во время 30-минутного перехода
   * поля плавно едут от prev к cur. Вызывается часто — дешевле кэша.
   */
  function blend() {
    var w = W();
    var cur = typeDef(w ? w.cur : 'clear');
    var out = {
      tMod: cur.tMod, tNight: cur.tNight, wind: cur.wind,
      light: cur.light, snow: cur.snow, vis: cur.vis, fog: cur.fog
    };
    if (w && w.prev && w.trans < 1) {
      var prev = typeDef(w.prev);
      var k = smooth(w.trans);
      out.tMod = lerp(prev.tMod, cur.tMod, k);
      out.tNight = lerp(prev.tNight, cur.tNight, k);
      out.wind = lerp(prev.wind, cur.wind, k);
      out.light = lerp(prev.light, cur.light, k);
      out.snow = lerp(prev.snow, cur.snow, k);
      out.vis = lerp(prev.vis, cur.vis, k);
      out.fog = lerp(prev.fog, cur.fog, k);
    }
    return out;
  }

  /** Ночь? (часы 21..5 — те же рамки, что night:fall/day:dawn в Time). */
  function isNight() {
    if (!WS.Time || !WS.Time.hour) return false;
    var h = WS.Time.hour();
    return h >= 21 || h < 5;
  }

  // ====================================================================
  //  ЯДРО ПЕРЕКЛЮЧЕНИЯ ПОГОДЫ
  // ====================================================================

  /** Смена cur -> next: сброс таймеров, событие, тост для злой погоды. */
  function switchNext() {
    var w = W();
    if (!w) return;
    var from = w.cur;
    var to = w.next;
    if (!TYPES[to]) to = 'overcast';
    w.prev = from;
    w.cur = to;
    w.next = pickNext(to);
    w.t = 0;
    w.trans = 0;
    var def = typeDef(to);
    var dur = DUR_MIN_LO + (R ? R.int(0, DUR_MIN_HI - DUR_MIN_LO) : 120);
    w.dur = Math.round(dur * (def.durMul || 1));
    // поворот ветра при смене погоды (не каждый раз)
    if (R && R.chance(0.6)) w.windDir = (w.windDir + R.int(-1, 1) + 8) & 7;
    // журнал последних смен (дневник выжившего)
    if (!w.log) w.log = [];
    w.log.unshift({
      day: WS.Time && WS.Time.day ? WS.Time.day() : 1,
      hour: WS.Time && WS.Time.hour ? WS.Time.hour() : 0,
      id: to
    });
    if (w.log.length > 8) w.log.length = 8;
    // событие контракта
    try { WS.Ev.emit('weather:changed', { from: from, to: to }); } catch (e) { WS.err('weather emit', e); }
    // тосты: злая погода приходит, ясная — после злой (облегчение)
    if (def.harsh) {
      toast('Погода портится: ' + def.name.toLowerCase(), 'warn');
    } else if (typeDef(from).harsh) {
      toast('Небо проясняется', 'good');
    }
  }

  /** Тост через UI, если он есть (модуль UI живёт отдельно). */
  function toast(text, kind) {
    try {
      if (WS.Ui && WS.Ui.toast) WS.Ui.toast(text, kind || 'info');
    } catch (e) { /* UI нет — молчим */ }
  }

  /**
   * Целевая температура снаружи (°C), полная формула:
   *   база + суточный ход + сезон + тип погоды (день/ночь)
   *   + роза ветров + суточный сдвиг + синусоидальный дрейф ±3°C.
   */
  function targetTemp() {
    var w = W();
    if (!w) return TEMP_BASE;
    var hourF = WS.Time && WS.Time.hourF ? WS.Time.hourF() : 12;
    var day = WS.Time && WS.Time.day ? WS.Time.day() : 1;
    var b = blend();
    var mod = isNight() ? b.tNight : b.tMod;
    var rose = DIR_TEMP[w.windDir & 7] || 0;
    var drift = DRIFT_AMP * Math.sin((w.t + (w.driftPh || 0)) / DRIFT_PERIOD);
    return TEMP_BASE + diurnal(hourF) + seasonTemp() + mod +
           rose + dailyOffset(day, w.seed || 1) + drift;
  }

  // ====================================================================
  //  ЗВУКИ ОКРУЖЕНИЯ
  //  Ветер уже ведёт audio.js по windLevel(). Здесь — редкие акценты:
  //  скрип снега ночью, далёкий волк в метель, вой самой вьюги.
  // ====================================================================

  function snd(name, vol, x, y) {
    try {
      if (!WS.Snd || !WS.Snd.play) return;
      var o = { vol: vol !== undefined ? vol : 0.8 };
      if (x !== undefined) { o.x = x; o.y = y; }
      WS.Snd.play(name, o);
    } catch (e) { /* звук не критичен */ }
  }

  /** Вой вьюги: тягучий тон 'howl' на тихой громкости (по ТЗ vol 0.2). */
  function updateHowl(rs, wind, typeId) {
    if (wind < 0.62) return;
    if (typeId !== 'blizzard' && typeId !== 'snowstorm') return;
    howlT -= rs;
    if (howlT <= 0) {
      howlT = 40 + Math.random() * 50;
      snd('howl', 0.2);
    }
  }

  /**
   * Часовой слушатель: ночной скрип снега и далёкие волки.
   * Частота сама по себе редкая — раз в игровой час.
   */
  function onHour(ev) {
    if (!hasGame()) return;
    var w = W();
    var p = WS.G.player;
    if (!w || !p) return;
    var h = ev && ev.hour !== undefined ? ev.hour : 0;
    var cur = w.cur;
    // скрип снега в морозную ночь — редко, тихо, где-то рядом
    if ((h >= 22 || h <= 4) && (cur === 'clear' || cur === 'hard_frost' || cur === 'overcast')) {
      if (Math.random() < 0.30) {
        snd('snow_step_deep', 0.16,
            p.x + (Math.random() - 0.5) * 4,
            p.y + (Math.random() - 0.5) * 4);
      }
    }
    // далёкий волк во время метели — вой еле слышен (по ТЗ)
    if (cur === 'blizzard' && Math.random() < 0.15) {
      snd('howl', 0.25,
          p.x + (Math.random() - 0.5) * 40,
          p.y + (Math.random() - 0.5) * 40);
    }
  }

  // ====================================================================
  //  ГЛАВНЫЙ АПДЕЙТ (тик 15)
  //  dt — шаг симуляции, сек. Игровые минуты берём дельтой totalMin:
  //  сон (ускорение x8) и скорости Loop учитываются автоматически.
  // ====================================================================

  function update(dt) {
    if (!hasGame()) return;
    var g = WS.G;
    var w = W();
    if (!w) return;
    var tm = WS.Time.totalMin();
    if (lastTotalMin < 0) lastTotalMin = tm;
    var gm = tm - lastTotalMin;      // игровых минут с прошлого тика
    lastTotalMin = tm;
    if (gm < 0) gm = 0;

    // --- течение текущего типа + плавный переход ---
    w.t += gm;
    if (w.trans < 1) {
      w.trans = clamp(w.trans + gm / TRANS_MIN, 0, 1);
      if (w.trans >= 1) w.prev = null;    // переход завершён
    }
    if (w.t >= w.dur) switchNext();

    // --- плавное выравнивание температуры (°C за игровую минуту) ---
    // 0.08°C/мин = ~5°C/час: достаточно отзывчиво, без рывков
    var target = targetTemp();
    var step = 0.08 * gm;
    if (Math.abs(target - w.temp) <= step) w.temp = target;
    else w.temp += Math.sign(target - w.temp) * step;
    // w.temp живёт в G.weather — сериализуется автоматически

    // --- накопление снежного покрова (для снегоступов/рендера) ---
    var b = blend();
    if (b.snow > 0.08) {
      w.snowCover = clamp(w.snowCover + b.snow * SNOW_COVER_RATE * (gm / 60), 0, 1);
    } else if (w.temp > -1) {
      w.snowCover = clamp(w.snowCover - SNOW_MELT_RATE * (gm / 60), 0, 1);
    }

    // --- редкий самопроизвольный поворот ветра (раз в ~2 часа) ---
    if (R && gm > 0 && R.chance(0.008 * Math.max(1, gm))) {
      w.windDir = (w.windDir + R.pick([-1, 1]) + 8) & 7;
    }

    // --- звуки (реальное время симуляции) ---
    updateHowl(dt, b.wind + windGust(), w.cur);

    // --- статистика: самый лютый холод за партию ---
    if (g.stats) {
      var t2 = Math.round(w.temp);
      if (typeof g.stats.coldest !== 'number' || t2 < g.stats.coldest) {
        g.stats.coldest = t2;
      }
    }
  }

  // ====================================================================
  //  ПУБЛИЧНЫЙ API МОДУЛЯ
  //  Все геттеры безопасны до начала партии (дефолты по «ясно»).
  // ====================================================================

  var Weather = {

    /** Новая партия: создать состояние в WS.G (вызывает Main.newGame). */
    newGame: function () {
      var g = WS.G;
      if (!g) return;
      var seed = ((g.seed >>> 0) ^ 0x77EA7) >>> 0;
      R = WS.RNG.mk(seed);
      g.weather = {
        cur: 'clear',          // текущий тип
        next: 'snow',          // что придёт после него
        prev: null,            // предыдущий (для перехода)
        t: 0,                  // минут в текущем типе
        dur: 240,              // длительность текущего типа, мин
        trans: 1,              // прогресс перехода 0..1 (1 = завершён)
        windDir: R.int(0, 7),  // направление ветра 0=N..7=NW
        snowCover: 0.5,        // снежный покров 0..1
        temp: -14,             // текущая температура (сглаженная), °C
        driftPh: R.range(0, Math.PI * 2),  // фаза температурного дрейфа
        windPh: R.range(0, Math.PI * 2),  // фаза осцилляции ветра
        seed: seed             // seed для восстановления RNG
      };
      lastTotalMin = -1;
      drawLast = 0;
      parts.length = 0;
      bands.length = 0;
      windDirF = g.weather.windDir;
    },

    /** Загрузка сейва: G.weather уже восстановлен — оживляем модуль. */
    deserialize: function (data) {
      var w = (data && typeof data === 'object' && data.cur) ? data :
              (WS.G && WS.G.weather);
      if (!w || typeof w !== 'object' || !w.cur) {
        Weather.newGame();               // сейв без погоды — с нуля
        return;
      }
      // нормализация полей (старые/битые сейвы не должны ронять модуль)
      if (!TYPES[w.cur]) w.cur = 'clear';
      if (!TYPES[w.next]) w.next = 'snow';
      if (w.prev && !TYPES[w.prev]) w.prev = null;
      if (typeof w.t !== 'number' || w.t < 0) w.t = 0;
      if (typeof w.dur !== 'number' || w.dur < 30) w.dur = 240;
      if (typeof w.trans !== 'number') w.trans = 1;
      w.trans = clamp(w.trans, 0, 1);
      if (typeof w.windDir !== 'number') w.windDir = 0;
      w.windDir = w.windDir & 7;
      if (typeof w.snowCover !== 'number') w.snowCover = 0.5;
      w.snowCover = clamp(w.snowCover, 0, 1);
      if (typeof w.temp !== 'number') w.temp = -14;
      if (typeof w.driftPh !== 'number') w.driftPh = 0;
      if (typeof w.windPh !== 'number') w.windPh = 0;
      if (typeof w.seed !== 'number') w.seed = 1;
      if (!w.log || !w.log.length) w.log = [];
      for (var li = 0; li < w.log.length; li++) {
        if (!w.log[li] || !TYPES[w.log[li].id]) { w.log.splice(li, 1); li--; }
      }
      // RNG перемешиваем с текущим игровым временем — сейв-скам
      // не даёт ту же последовательность погод
      R = WS.RNG.mk((w.seed ^ Math.floor(WS.Time.totalMin() || 0)) >>> 0);
      lastTotalMin = -1;
      drawLast = 0;
      parts.length = 0;
      windDirF = w.windDir;
    },

    /** Тик (регистрируется в boot с приоритетом 15). */
    update: update,

    /** Сводка для UI/ИИ: {id, name, temp, wind, snow, light}. */
    current: function () {
      var w = W();
      return {
        id: w ? w.cur : 'clear',
        name: w ? typeDef(w.cur).name : 'Ясно',
        temp: w ? Math.round(w.temp) : TEMP_BASE,
        wind: Weather.windLevel(),
        snow: Weather.snowfall(),
        light: 1 - Weather.lightDim()
      };
    },

    /** Температура снаружи, °C (сглаженная). Главный потребитель — B1. */
    tempOutside: function () {
      var w = W();
      return w ? w.temp : TEMP_BASE;
    },

    /** Тренд температуры (°C до цели) — растёт/падает, для UI-прогноза. */
    tempTrend: function () {
      return Math.round((targetTemp() - Weather.tempOutside()) * 10) / 10;
    },

    /**
     * Уровень ветра 0..1: база типа + две осцилляции + порывы в метель.
     * Потребители: audio.js (амбиент), temperature.js (охлаждение
     * ветром), частицы снега здесь же.
     */
    windLevel: function () {
      var w = W();
      if (!w) return 0.2;
      var b = blend();
      var t = w.t + (w.windPh || 0);
      var osc = WIND_OSC1 * Math.sin(t / 13) + WIND_OSC2 * Math.sin(t / 3.7);
      return clamp(b.wind + osc + windGust(), 0, 1);
    },

    /** Затемнение 0..1 (туман/буря темнят). Потребитель — Gfx.applyLight. */
    lightDim: function () {
      return clamp(blend().light, 0, 0.9);
    },

    /** Интенсивность снегопада 0..1 — для частиц и ИИ. */
    snowfall: function () {
      return clamp(blend().snow, 0, 1);
    },

    /** Видимость 0..1 для ИИ (метель 0.4, туман 0.5, ясно 1.0). */
    visibility: function () {
      return clamp(blend().vis, 0.1, 1);
    },

    /** Снежный покров 0..1 (аккумулируется за партию). */
    snowCover: function () {
      var w = W();
      return w ? clamp(w.snowCover, 0, 1) : 0.5;
    },

    /** Направление ветра 0=N..7=NW (мировые оси). */
    windDir: function () {
      var w = W();
      return w ? (w.windDir & 7) : 0;
    },

    /** Русское название направления ветра («северный»). */
    windDirName: function () {
      return DIR_NAMES[Weather.windDir()];
    },

    /** Русское описание силы ветра («слабый ветер»). */
    windWord: function () {
      return windWord(Weather.windLevel());
    },

    /**
     * Экранный вектор ветра {x, y} (нормированный) — для чужих систем
     * частиц/дыма. Изометрия: мировой вектор проецируется toScreen.
     */
    windVecScreen: function () {
      if (!M) M = WS.M;
      if (!M) return { x: 1, y: 0 };
      var w = W();
      var v = DIRVEC[w ? (w.windDir & 7) : 0];
      var s = M.toScreen(v[0], v[1]);
      var len = Math.sqrt(s.x * s.x + s.y * s.y) || 1;
      return { x: s.x / len, y: s.y / len };
    },

    /**
     * Прогноз для UI («барометр»): что придёт и через сколько часов.
     * Честный — читает уже выбранное next. Точность «по-1917» оставлена
     * UI-модулю (он может показать это с шансом ошибки).
     */
    forecast: function () {
      var w = W();
      if (!w) return { next: 'snow', name: 'Снег', hoursLeft: 4 };
      return {
        next: w.next,
        name: typeDef(w.next).name,
        hoursLeft: Math.max(0, (w.dur - w.t) / 60)
      };
    },

    /** Русское название типа погоды (через I18N, если подключён). */
    typeName: function (id) {
      try {
        if (WS.I18N && WS.I18N.t) {
        var s = WS.I18N.t('weather.' + (TYPES[id] ? id : 'clear'));
          if (s && s !== ('weather.' + id)) return s;
        }
      } catch (e) { /* словаря нет — литерал */ }
      return typeDef(id).name;
    },

    /**
     * Эффективная температура с учётом ветрового охлаждения, °C —
     * «как ощущается». Заточена под сильный мороз: при ветре 1.0
     * и -20°C чувствуется как примерно -32°C.
     * Потребители: UI (подсказка «соберись»), temperature.js (B1 может
     * использовать вместо ручного пересчёта).
     */
    windChill: function () {
      var t = Weather.tempOutside();
      var v = Weather.windLevel();
      // ветер при слабом морозе почти не рвёт тепло, при сильном — очень
      var k = 1 + v * v * (Math.max(0, -t) / 14);
      return Math.round(t * Math.min(k, 1.65));
    },

    /**
     * Готовая русская сводка одной строкой — для тостов/дневника/UI:
     * «Метель, −28°C, ветер северный, видимость плохая».
     */
    describe: function () {
      var w = W();
      if (!w) return 'Погода неизвестна';
      var c = Weather.current();
      var s = c.name + ', ощущается как ' + Weather.windChill() + '°C, ' +
              DIR_NAMES[w.windDir & 7] + ' ветер';
      if (c.vis < 0.6) s += ', видимость плохая';
      else if (c.vis < 0.9) s += ', видимость средняя';
      if (Weather.snowfall() > 0.5) s += ', снег валит';
      return s;
    },

    /**
     * Журнал погоды (последние 8 смен) — для дневника/UI.
     * Хранится в G.weather.log — сериализуется автоматически.
     */
    log: function () {
      var w = W();
      return (w && w.log) ? w.log.slice(0) : [];
    },

    /** Список всех типов (для UI/отладки). */
    types: function () { return TYPE_IDS.slice(0); },

    /** Проверка типа: Weather.isType('blizzard'). */
    isType: function (id) {
      var w = W();
      return !!w && w.cur === id;
    },

    /** Отладка/тесты: принудительно переключить погоду немедленно. */
    force: function (id) {
      if (!TYPES[id] || !W()) return null;
      var w = W();
      w.next = id;
      switchNext();
      w.trans = 1;        // отладка — без плавного перехода
      w.prev = null;
      return w.cur;
    },

    /** Сериализация (паритет контракту; реально G.weather в G). */
    serialize: function () {
      return W();
    },

    // ------------------------------------------------------------------
    //  ОТРИСОВКА (Gfx.frame вызывает КАЖДЫЙ кадр, и на паузе тоже —
    //  поэтому движение частиц считается от performance.now(), а не от
    //  тика симуляции)
    // ------------------------------------------------------------------

    draw: function (ctx, cam) {
      try {
        if (!ctx || !ctx.canvas) return;
        var w = W();
        if (!w) return;                        // меню/нет партии
        if (!M) M = WS.M;
        if (!M) return;

        var cv = ctx.canvas;
        var now = performance.now();
        var rdt = (now - drawLast) / 1000;
        drawLast = now;
        if (!(rdt > 0) || rdt > 0.1) rdt = 0.016;
        var scale = clamp(cv.height / 720, 0.75, 2.2);
        var W2 = cv.width, H2 = cv.height;

        // ветер в экранных координатах (изометрия: toScreen)
        windDirF += (((w.windDir & 7) - windDirF + 12) % 8 - 4) * Math.min(1, rdt * 0.3);
        var v = DIRVEC[Math.round(windDirF) & 7];
        var s = M.toScreen(v[0], v[1]);
        var sLen = Math.sqrt(s.x * s.x + s.y * s.y) || 1;
        var wSx = s.x / sLen, wSy = s.y / sLen;

        var snow = Weather.snowfall();
        var wind = Weather.windLevel();
        var b = blend();
        var light = WS.Time && WS.Time.light ? WS.Time.light() : 1;

        // 1) снег: три слоя параллакса (в метель — штрихи)
        if (snow > 0.02) {
          stepParticles(rdt, snow, wind, wSx, wSy, W2, H2, scale);
          drawParticles(ctx, wind, snow, scale);
          // тихий снегопад (ветра нет) — молочная пелена в воздухе
          if (wind < 0.35 && snow > 0.45) {
            var mist = (snow - 0.45) * (0.35 - wind) * 0.35;
            ctx.fillStyle = 'rgba(210,220,232,' + clamp(mist, 0, 0.1).toFixed(3) + ')';
            ctx.fillRect(0, 0, W2, H2);
          }
        }

        // 2) туман: мягкие пятна + «молоко» к низу экрана
        if (b.fog > 0.04) drawFog(ctx, rdt, b.fog, wind, wSx, wSy, W2, H2);

        // 3) горизонтальные полосы метели (шквалы)
        if (wind > 0.5 && snow > 0.25) {
          drawBands(ctx, rdt, wind, snow, wSx, W2, H2, scale);
        }

        // 4) морозные искры на снегу (ясно/лютый мороз при свете)
        if (light > 0.22 && (w.cur === 'clear' || w.cur === 'hard_frost')) {
          drawSparkles(ctx, now / 1000, light, w.cur === 'hard_frost' ? 1 : 0.6, W2, H2);
        }

        // 5) северное сияние на ясной полярной ночи
        if (light < 0.16 && (w.cur === 'clear' || w.cur === 'hard_frost')) {
          drawAurora(ctx, now / 1000, W2, H2);
        }

        // 6) белый «смыв» краёв экрана в метель (снежная пелена)
        if (w.cur === 'blizzard' || (w.cur === 'snowstorm' && wind > 0.62)) {
          drawWhiteout(ctx, wind, snow, W2, H2);
        }

        // 7) холодный оттенок в лютый мороз
        if (w.cur === 'hard_frost' && w.trans > 0.3) {
          var k = smooth((w.trans - 0.3) / 0.7) * 0.06;
          ctx.fillStyle = 'rgba(168,198,255,' + k.toFixed(3) + ')';
          ctx.fillRect(0, 0, W2, H2);
        }

        // 8) отладочный оверлей (включается WS.debug = true)
        if (WS.debug) drawDebug(ctx, W2, H2);
      } catch (e) {
        WS.err('weather draw:', e && e.message);
      }
    },

    // ------------------------------------------------------------------
    //  САМОТЕСТ (консоль: WS.Weather.selftest())
    // ------------------------------------------------------------------

    selftest: function () {
      var out = [];
      var ok = function (name, cond) {
        out.push((cond ? '  ok  ' : ' FAIL ') + name);
        return !!cond;
      };
      // таблицы типов и матрицы
      ok('7 типов погоды', TYPE_IDS.length === 7);
      var allOk = true, i, j, id, sum;
      for (i = 0; i < TYPE_IDS.length; i++) {
        id = TYPE_IDS[i];
        if (!TYPES[id] || !TYPES[id].name) allOk = false;
        if (!MARKOV_NOV[id] || !MARKOV_DEC[id]) allOk = false;
      }
      ok('паспорта и строки матриц на месте', allOk);
      // нормировка строк на любой день сезона
      var normOk = true;
      for (i = 0; i < TYPE_IDS.length; i++) {
        var row = markovRow(TYPE_IDS[i]);
        sum = 0;
        for (j in row) if (row.hasOwnProperty(j)) sum += row[j];
        if (Math.abs(sum - 1) > 0.001) normOk = false;
        for (j in row) if (row.hasOwnProperty(j) && row[j] < 0) normOk = false;
      }
      ok('строки Маркова нормированы и неотрицательны', normOk);
      // партийные проверки — только когда партия есть
      if (WS.G) {
        Weather.newGame();
        var w = WS.G.weather;
        ok('newGame: WS.G.weather создан', !!w);
        ok('newGame: форма по ТЗ', w && w.cur === 'clear' && w.next === 'snow' &&
            w.dur === 240 && typeof w.windDir === 'number' &&
            w.snowCover === 0.5 && w.temp === -14);
        ok('newGame: RNG привязан к seed', w && typeof w.seed === 'number' && !!R);
        // серия переключений не ломает состояние
        var seen = {};
        for (i = 0; i < 14; i++) {
          Weather.force(WS.G.weather.next);
          seen[WS.G.weather.cur] = true;
          if (!WS.G.weather.cur || WS.G.weather.t !== 0) break;
        }
        ok('switchNext: смена типов идёт', !!WS.G.weather.cur && WS.G.weather.t === 0);
        ok('switchNext: переход сброшен', WS.G.weather.trans === 1);
        // диапазоны API
        var t = Weather.tempOutside(), wd = Weather.windLevel();
        ok('tempOutside в [-55,0]', t >= -55 && t <= 0);
        ok('windLevel в [0,1]', wd >= 0 && wd <= 1);
        ok('lightDim в [0,0.9]', Weather.lightDim() >= 0 && Weather.lightDim() <= 0.9);
        ok('snowfall в [0,1]', Weather.snowfall() >= 0 && Weather.snowfall() <= 1);
        ok('visibility в (0,1]', Weather.visibility() > 0 && Weather.visibility() <= 1);
        ok('current() сводка', (function () {
          var c = Weather.current();
          return !!c && typeof c.temp === 'number' && typeof c.wind === 'number';
        })());
        ok('forecast() работает', (function () {
          var f = Weather.forecast();
          return !!f && !!f.next && f.hoursLeft >= 0;
        })());
        ok('windVecScreen() нормирован', (function () {
          var v = Weather.windVecScreen();
          var l = Math.sqrt(v.x * v.x + v.y * v.y);
          return Math.abs(l - 1) < 0.01;
        })());
        ok('windChill() холоднее или равен температуре', Weather.windChill() <= Weather.tempOutside() + 0.5);
        ok('describe() — строка', typeof Weather.describe() === 'string' && Weather.describe().length > 5);
        ok('журнал смен ведётся', Weather.log().length > 0 && Weather.log()[0].id === WS.G.weather.cur);
        // метель: ветер и снегопад на максимумах, видимость 0.4
        Weather.force('blizzard');
        update(0.1);
        ok('метель: ветер ~1.0', Weather.windLevel() > 0.75);
        ok('метель: снегопад ~1.0', Weather.snowfall() > 0.9);
        ok('метель: видимость 0.4', Math.abs(Weather.visibility() - 0.4) < 0.02);
        ok('метель: свет затемнён', Weather.lightDim() > 0.3);
        // туман: видимость 0.5, снега нет
        Weather.force('fog');
        update(0.1);
        ok('туман: снегопада нет', Weather.snowfall() < 0.05);
        ok('туман: затемнение сильно', Weather.lightDim() > 0.35);
        // отрисовка не падает на живом контексте
        var drawn = true;
        try {
          if (WS.Gfx && WS.Gfx.c) Weather.draw(WS.Gfx.c(), WS.Cam);
        } catch (e2) { drawn = false; }
        ok('draw() не падает', drawn);
        // вернуть пристойную погоду для дальнейшей игры
        Weather.newGame();
      } else {
        out.push('  --   нет WS.G (в меню): партийные проверки пропущены');
      }
      return out;
    }
  };

  // ====================================================================
  //  ЧАСТИЦЫ СНЕГА (3 слоя параллакса)
  //  Хранение: массив до P_LIMIT объектов {x, y, L, ph, wob} в экран-
  //  ных координатах. Движение — stepParticles() по rdt; рисование —
  //  drawParticles(). Лимит 400 — по ТЗ.
  // ====================================================================

  /** Целевое число частиц по интенсивности снегопада. */
  function targetCount(snow) {
    return Math.floor(snow * P_LIMIT);
  }

  /** Создать частицу в случайном месте экрана (слой по весам). */
  function spawnPart(W2, H2) {
    var r = Math.random();
    var L = r < LAYERS[0].share ? 0 :
            (r < LAYERS[0].share + LAYERS[1].share ? 1 : 2);
    parts.push({
      x: Math.random() * W2,
      y: Math.random() * H2,
      L: L,
      ph: Math.random() * Math.PI * 2,   // фаза покачивания
      wob: 0.7 + Math.random() * 0.6    // индивидуальный размах
    });
  }

  /**
   * Движение частиц: падение по слою + снос ветром (параллакс: дальний
   * слой ловит 40% ветра, ближний — 140%). Края экрана заворачиваем.
   */
  function stepParticles(rdt, snow, wind, wSx, wSy, W2, H2, scale) {
    var want = targetCount(snow);
    while (parts.length < want && parts.length < P_LIMIT) spawnPart(W2, H2);
    if (parts.length > want) parts.splice(want, parts.length - want);
    if (!parts.length) return;

    var windPx = wind * 520 * scale;    // px/с полного ветра для ближнего слоя
    var t2 = performance.now() / 1000;
    var i, p, lay, vy, vx, vyw;
    for (i = 0; i < parts.length; i++) {
      p = parts[i];
      lay = LAYERS[p.L];
      vy = lay.fall * scale * (0.85 + 0.3 * Math.sin(p.ph + t2 * 0.7));
      vx = windPx * lay.wmul * wSx + Math.sin(t2 * 1.7 + p.ph) * 14 * p.wob;
      // небольшой снос по экранному Y от ветра (изометрия наклоняет)
      vyw = windPx * lay.wmul * wSy * 0.4;
      p.x += vx * rdt;
      p.y += (vy + vyw) * rdt;
      // заворот по краям
      if (p.y > H2 + 12) { p.y = -8; p.x = Math.random() * W2; }
      else if (p.y < -30) p.y = H2 + 8;
      if (p.x > W2 + 30) p.x = -20;
      else if (p.x < -30) p.x = W2 + 20;
    }
  }

  /**
   * Рисование снега. При сильном ветре (>0.6) зёрна вытягиваются в
   * горизонтальные штрихи — эффект motion blur метели.
   */
  function drawParticles(ctx, wind, snow, scale) {
    if (!parts.length) return;
    var stretch = wind > 0.6 ? 1 + (wind - 0.6) * 9 : 1;
    var i, p, lay, sz, sx, sy;
    for (var L = 0; L < 3; L++) {
      lay = LAYERS[L];
      ctx.fillStyle = 'rgba(226,234,244,' +
        (lay.alpha * clamp(0.5 + snow * 0.6, 0, 1)).toFixed(3) + ')';
      for (i = 0; i < parts.length; i++) {
        p = parts[i];
        if (p.L !== L) continue;
        sz = lay.size * scale * p.wob;
        sx = sz * stretch;
        sy = sz * (stretch > 1 ? 0.65 : 1);
        ctx.fillRect(p.x - sx * 0.5, p.y - sy * 0.5, sx, sy);
      }
    }
  }

  // ====================================================================
  //  ТУМАН
  //  Крупные мягкие пятна (кэш-текстура радиального градиента) медленно
  //  дрейфуют по ветру; сверху вниз добавляется «молоко» градиентом.
  // ====================================================================

  /** Ленивая сборка текстуры пятна тумана (один раз за сессию). */
  function getFogTex() {
    if (fogTex) return fogTex;
    var c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    var g = c.getContext('2d');
    var grad = g.createRadialGradient(128, 128, 10, 128, 128, 126);
    grad.addColorStop(0, 'rgba(208,216,226,0.9)');
    grad.addColorStop(0.55, 'rgba(208,216,226,0.45)');
    grad.addColorStop(1, 'rgba(208,216,226,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    fogTex = c;
    return c;
  }

  /** Инициализация/движение пятен (нормированные координаты 0..1). */
  function stepBlobs(rdt, fog, wind, wSx, wSy) {
    if (blobs.length === 0) {
      for (var i = 0; i < FOG_BLOBS; i++) {
        blobs.push({
          x: Math.random(), y: 0.25 + Math.random() * 0.7,
          r: 0.35 + Math.random() * 0.4,
          ph: Math.random() * Math.PI * 2,
          sp: 0.2 + Math.random() * 0.5
        });
      }
    }
    var t = performance.now();
    for (var k = 0; k < blobs.length; k++) {
      var b = blobs[k];
      // дрейф по ветру + собственное ленивое блуждание
      b.x += (wSx * wind * 0.02 + Math.sin(t / 9000 + b.ph) * 0.004) * b.sp;
      b.y += (wSy * wind * 0.008 + Math.cos(t / 11000 + b.ph) * 0.002) * b.sp;
      if (b.x > 1.3) b.x = -0.3;
      if (b.x < -0.3) b.x = 1.3;
      if (b.y > 1.2) b.y = 0.1;
      if (b.y < 0.05) b.y = 1.15;
    }
  }

  function drawFog(ctx, rdt, fog, wind, wSx, wSy, W2, H2) {
    stepBlobs(rdt, fog, wind, wSx, wSy);
    var tex = getFogTex();
    var base = clamp(fog, 0, 1);
    ctx.save();
    for (var i = 0; i < blobs.length; i++) {
      var b = blobs[i];
      var r = b.r * Math.max(W2, H2);
      ctx.globalAlpha = base * 0.16 * b.sp;
      ctx.drawImage(tex, b.x * W2 - r, b.y * H2 - r * 0.6, r * 2, r * 1.2);
    }
    // общий градиент к низу — туман «стелется»
    var g = ctx.createLinearGradient(0, H2 * 0.45, 0, H2);
    g.addColorStop(0, 'rgba(206,214,224,0)');
    g.addColorStop(1, 'rgba(206,214,224,' + (base * 0.28).toFixed(3) + ')');
    ctx.globalAlpha = 1;
    ctx.fillStyle = g;
    ctx.fillRect(0, H2 * 0.45, W2, H2 * 0.55);
    ctx.restore();
  }

  // ====================================================================
  //  ПОЛОСЫ МЕТЕЛИ
  //  Быстрые горизонтальные полупрозрачные полосы — ощущение шквала.
  //  Заметность растёт от (wind-0.5) и плотности снега.
  // ====================================================================

  function drawBands(ctx, rdt, wind, snow, wSx, W2, H2, scale) {
    if (bands.length === 0) {
      for (var i = 0; i < BAND_COUNT; i++) {
        bands.push({
          x: Math.random() * W2,
          y: Math.random() * H2,
          w: (180 + Math.random() * 420) * scale,
          h: (4 + Math.random() * 14) * scale,
          sp: 0.5 + Math.random() * 1.2,
          a: 0.3 + Math.random() * 0.7
        });
      }
    }
    var k = clamp((wind - 0.5) / 0.5, 0, 1) * clamp(snow * 1.2, 0, 1);
    if (k <= 0.01) return;
    var dir = (wSx >= 0 ? 1 : -1);    // полосы летят по ветру
    ctx.save();
    for (var j = 0; j < bands.length; j++) {
      var b = bands[j];
      b.x += dir * (240 + wind * 700) * b.sp * rdt * scale;
      if (dir > 0 && b.x > W2 + b.w) { b.x = -b.w; b.y = Math.random() * H2; }
      if (dir < 0 && b.x < -b.w) { b.x = W2; b.y = Math.random() * H2; }
      ctx.fillStyle = 'rgba(214,224,238,' + (k * 0.10 * b.a).toFixed(3) + ')';
      ctx.fillRect(b.x, b.y + Math.sin(performance.now() / 700 + j) * 6, b.w, b.h);
    }
    ctx.restore();
  }

  // ====================================================================
  //  ИСКРЫ НА СНЕГУ
  //  Ясный морозный день: снег блестит точечными бликами (низ экрана,
  //  там «земля»). Мерцание — кубический спад синуса от времени.
  // ====================================================================

  function drawSparkles(ctx, tSec, light, mul, W2, H2) {
    if (sparkles.length === 0) {
      for (var i = 0; i < SPARKLES; i++) {
        sparkles.push({
          x: Math.random(), y: 0.45 + Math.random() * 0.5,
          ph: Math.random() * Math.PI * 2
        });
      }
    }
    var k = light * mul;
    if (k < 0.05) return;
    ctx.save();
    ctx.fillStyle = 'rgba(240,248,255,0.9)';
    for (var j = 0; j < sparkles.length; j++) {
      var s2 = sparkles[j];
      var a = Math.sin(tSec * 2.6 + s2.ph);
      if (a <= 0.25) continue;
      a = (a - 0.25) * 1.35;
      ctx.globalAlpha = clamp(a * k, 0, 0.8);
      var sz = 2 + a * 2;
      ctx.fillRect(s2.x * W2, s2.y * H2, sz, sz);
    }
    ctx.restore();
  }

  // ====================================================================
  //  СЕВЕРНОЕ СИЯНИЕ
  //  Ясная полярная ночь (с ~20-го дня, свет < 0.16): занавеси
  //  зелёно-бирюзовых сполохов медленно колышутся в верхней трети
  //  экрана. Цвет — холодный зелёный с редким лиловым краем.
  // ====================================================================

  function initCurtains() {
    if (curtains.length) return;
    for (var i = 0; i < AURORA_CURTAINS; i++) {
      curtains.push({
        x: (i + 0.5) / AURORA_CURTAINS + (Math.random() - 0.5) * 0.1,
        w: 0.22 + Math.random() * 0.2,       // ширина занавеси (0..1)
        ph: Math.random() * Math.PI * 2,
        sp: 0.5 + Math.random() * 0.7,       // своя скорость волн
        hue: 140 + Math.random() * 25        // зелёный..бирюза
      });
    }
  }

  function drawAurora(ctx, tSec, W2, H2) {
    // сила: нарастает к глубине зимы, дышит медленной волной
    var day = WS.Time && WS.Time.day ? WS.Time.day() : 1;
    var base = smooth(clamp((day - 18) / 20, 0, 1));       // с ~19 ноября
    if (base <= 0.05) return;
    initCurtains();
    var breath = 0.7 + 0.3 * Math.sin(tSec * 0.11);
    var k = base * breath;
    ctx.save();
    for (var i = 0; i < curtains.length; i++) {
      var c = curtains[i];
      var cx = (c.x + Math.sin(tSec * 0.05 + c.ph) * 0.03) * W2;
      var w = c.w * W2 * (0.9 + 0.1 * Math.sin(tSec * 0.2 + c.ph));
      var top = H2 * (0.04 + 0.03 * Math.sin(tSec * 0.09 + c.ph * 2));
      var hgt = H2 * (0.3 + 0.08 * Math.sin(tSec * 0.13 + c.ph));
      // вертикальный градиент занавеси: ярко внизу края, тает вверх
      var g = ctx.createLinearGradient(cx, top + hgt, cx, top);
      var a = k * (0.16 + 0.06 * i);
      g.addColorStop(0, 'hsla(' + c.hue + ',70%,60%,' + a.toFixed(3) + ')');
      g.addColorStop(0.5, 'hsla(' + (c.hue + 20) + ',65%,55%,' + (a * 0.45).toFixed(3) + ')');
      g.addColorStop(1, 'hsla(' + (c.hue + 45) + ',60%,55%,0)');
      ctx.fillStyle = g;
      // волнистый низ занавеси: серия столбиков разной высоты
      var cols = 14;
      for (var col = 0; col < cols; col++) {
        var u = col / (cols - 1);
        var px = cx - w / 2 + w * u;
        var wave = Math.sin(u * 6 + tSec * c.sp + c.ph) *
                  Math.sin(u * 2.3 - tSec * c.sp * 0.6);
        var ch = hgt * (0.55 + 0.45 * wave);
        ctx.globalAlpha = 0.75 + 0.25 * wave;
        ctx.fillRect(px, top + hgt - ch, Math.ceil(w / cols) + 1, ch);
      }
      // мягкое свечение над занавесью
      ctx.globalAlpha = 1;
      var g2 = ctx.createLinearGradient(cx, top + hgt, cx, top + hgt * 0.3);
      g2.addColorStop(0, 'hsla(' + c.hue + ',75%,62%,' + (a * 0.25).toFixed(3) + ')');
      g2.addColorStop(1, 'hsla(' + c.hue + ',75%,62%,0)');
      ctx.fillStyle = g2;
      ctx.fillRect(cx - w / 2, top + hgt * 0.3, w, hgt * 0.7);
    }
    ctx.restore();
  }

  /** Порывы ветра: добавка только в штормовых типах (квадрат синуса). */
  function windGust() {
    var w = W();
    if (!w) return 0;
    var cur = typeDef(w.cur);
    if (cur.wind < 0.6) return 0;
    var t = w.t + (w.windPh || 0);
    return GUST_EXTRA * Math.pow(Math.sin(t / 2.1), 2);
  }

  // ====================================================================
  //  БЕЛЫЙ «СМЫВ» МЕТЕЛИ
  //  Края экрана заливает снежной мутью: в полную метель видно только
  //  центр (видимость 40% — как в ТЗ). Радужный градиент от краёв.
  // ====================================================================

  function drawWhiteout(ctx, wind, snow, W2, H2) {
    var k = clamp((wind - 0.6) / 0.4, 0, 1) * clamp(snow, 0, 1);
    if (k <= 0.02) return;
    var a = 0.32 * k;
    var m = Math.min(W2, H2);
    var g = ctx.createRadialGradient(W2 / 2, H2 / 2, m * 0.28, W2 / 2, H2 / 2, m * 0.75);
    g.addColorStop(0, 'rgba(214,222,234,0)');
    g.addColorStop(0.6, 'rgba(214,222,234,' + (a * 0.45).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(218,226,238,' + a.toFixed(3) + ')');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W2, H2);
  }

  // ====================================================================
  //  ОТЛАДОЧНЫЙ ОВЕРЛЕЙ (WS.debug = true)
  //  Строка состояния погоды в левом верхнем углу — для настройки
  //  баланса и проверки интеграций (B1 читает tempOutside/windLevel).
  // ====================================================================

  function drawDebug(ctx, W2, H2) {
    var w = W();
    if (!w) return;
    var lines = [
      'weather: ' + w.cur + (w.trans < 1 ? ' -> ' + w.cur + ' (переход ' + Math.round(w.trans * 100) + '%)' : ''),
      'next: ' + w.next + ' через ' + ((w.dur - w.t) / 60).toFixed(1) + ' ч',
      'temp: ' + w.temp.toFixed(1) + '°C (цель ' + targetTemp().toFixed(1) + '), chill ' + Weather.windChill() + '°C',
      'wind: ' + Weather.windLevel().toFixed(2) + ' (' + DIR_NAMES[w.windDir & 7] + '), снег ' + Weather.snowfall().toFixed(2),
      'vis: ' + Weather.visibility().toFixed(2) + ', свет -' + Weather.lightDim().toFixed(2) + ', покров ' + Weather.snowCover().toFixed(2),
      'частиц: ' + parts.length + '/' + P_LIMIT + ', сезон ' + seasonFactor().toFixed(2)
    ];
    ctx.save();
    ctx.font = '12px monospace';
    ctx.textAlign = 'left';
    var y = 16;
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
  //  ЛОКАЛИЗАЦИЯ
  //  Строки погоды — в словарь (CONTRACT.md: все новые строки туда).
  //  Если I18N-модуля нет — используются литералы из TYPES выше.
  // ====================================================================

  WS.boot(function initWeatherI18N() {
    try {
      WS.Data = WS.Data || {};
      WS.Data.locales = WS.Data.locales || {};
      WS.Data.locales.ru = WS.Data.locales.ru || {};
      WS.Data.locales.en = WS.Data.locales.en || {};
      var ru = WS.Data.locales.ru, en = WS.Data.locales.en;
      ru['weather.clear'] = 'Ясно';            en['weather.clear'] = 'Clear';
      ru['weather.overcast'] = 'Пасмурно';      en['weather.overcast'] = 'Overcast';
      ru['weather.snow'] = 'Снег';              en['weather.snow'] = 'Snow';
      ru['weather.blizzard'] = 'Метель';        en['weather.blizzard'] = 'Blizzard';
      ru['weather.fog'] = 'Туман';              en['weather.fog'] = 'Fog';
      ru['weather.hard_frost'] = 'Лютый мороз'; en['weather.hard_frost'] = 'Hard frost';
      ru['weather.snowstorm'] = 'Снежная буря'; en['weather.snowstorm'] = 'Snowstorm';
      ru['weather.worsen'] = 'Погода портится'; en['weather.worsen'] = 'Weather worsens';
      ru['weather.clearing'] = 'Небо проясняется'; en['weather.clearing'] = 'Sky clears';
      ru['weather.wind'] = 'Ветер';             en['weather.wind'] = 'Wind';
    } catch (e) { WS.warn('weather i18n:', e && e.message); }
  }, 'weather:i18n');

  // ====================================================================
  //  BOOT
  //  Регистрируем тик 15 и часовые звуки. Новая партия/загрузка —
  //  Main сам зовёт newGame()/deserialize(); страховочные подписки на
  //  события контракта идемпотентны.
  // ====================================================================

  WS.boot(function initWeather() {
    M = WS.M;
    WS.tick(TICK_PRI, update, 'weather');
    WS.Ev.on('time:hour', onHour);
    WS.Ev.on('game:start', function () {
      if (WS.G && !WS.G.weather) Weather.newGame();
      else if (WS.G) Weather.deserialize(WS.G.weather);
    });
    WS.Ev.on('game:load', function () {
      if (WS.G) Weather.deserialize(WS.G.weather);
    });
    WS.log('weather: тик ' + TICK_PRI + ', 7 типов, Марков ноябрь/декабрь');
  }, 'weather:init');

  WS.def('Weather', Weather);
})();
