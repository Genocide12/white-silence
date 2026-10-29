/**
 * hud.js — HUD (модуль D1): нижняя панель состояния (нужды, температура,
 * мокрота), верхняя строка (дата/погода/мороз), слоты экипировки с тултипами,
 * подсказки клавиш, прогресс-бары действий (обыск/крафт/стройка/чтение),
 * критические оверлеи (кровотечение/гипотермия/боль/обморожение/обморок),
 * очередь обучающих подсказок и «CASUS» — атмосферные подписи.
 * Связи: читает WS.Time/Weather/Temp/Needs/Health/Loot/Craft/Build/Inv,
 * ничего не регистрирует в WS.Ui (это D4); весь DOM — в <div id="hud">
 * внутри #ui-root (id "hud" согласован с D4). Верх-право оставлен ядру UI
 * (часы/скорость — #ws-hud) и карте (D3); тосты D4 — справа снизу,
 * поэтому панель экипировки поднята над ними.
 */
(function () {
  'use strict';

  // ====================================================================
  //  НАСТРОЙКИ И КОНСТАНТЫ
  // ====================================================================

  var TICK_PRI = 80;              // приоритет тика UI (CONTRACT.md)
  var HINT_SEC = 8;                // сколько секунд висит обучающая подсказка
  var CASUS_MIN_GAP = 150;         // минимум секунд между CASUS-подписями
  var CASUS_DUR = 7;               // сколько секунд висит CASUS-подпись

  // Порядок слотов экипировки (как в state.js).
  var SLOT_ORDER = ['head', 'torso', 'legs', 'feet', 'hands', 'back', 'hand1', 'hand2'];

  // Русские имена слотов (тултип пустой ячейки).
  var SLOT_NAME = {
    head: 'Голова', torso: 'Торс', legs: 'Ноги', feet: 'Обувь',
    hands: 'Руки', back: 'Спина', hand1: 'Правая рука', hand2: 'Левая рука'
  };

  // Русские дни недели (Time.weekday() возвращает 'mon'..'sun').
  var WEEKDAY = {
    mon: 'Понедельник', tue: 'Вторник', wed: 'Среда', thu: 'Четверг',
    fri: 'Пятница', sat: 'Суббота', sun: 'Воскресенье'
  };

  // Стадии гипотермии: цвет цифр/подписи (классы hud.css).
  var STAGE_CLS = ['st0', 'st0', 'st1', 'st2', 'st3', 'st4'];

  // Подписи клавиш (нижняя строка): [клавиша, действие]
  var KEY_HINTS = [
    ['E', 'действие'], ['I', 'инвентарь'], ['C', 'крафт'], ['B', 'стройка'],
    ['H', 'здоровье'], ['M', 'карта'], ['J', 'журнал'], ['F', 'свет'],
    ['Z', 'сон'], ['Q', 'бросить'], ['R', 'перезарядка'], ['Space', 'пауза']
  ];

  // ====================================================================
  //  УТИЛИТЫ DOM (весь HUD строится через createElement, без innerHTML
  //  для текста — только чистые узлы)
  // ====================================================================

  /** Создать элемент: el('div', 'cls', parent). */
  function el(tag, cls, parent) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (parent) parent.appendChild(e);
    return e;
  }

  /** Запись текста с кэшем: DOM трогаем только при изменении. */
  function setText(e, txt) {
    if (!e || e._txt === txt) return;
    e._txt = txt;
    e.textContent = txt;
  }

  /** Запись ширины полосы (в %) с кэшем. */
  function setW(e, pct) {
    if (!e) return;
    var v = Math.round(pct);
    if (e._w === v) return;
    e._w = v;
    e.style.width = v + '%';
  }

  /** Запись opacity с кэшем (0..1). */
  function setO(e, o) {
    if (!e) return;
    var v = Math.round(o * 100) / 100;
    if (e._o === v) return;
    e._o = v;
    e.style.opacity = v;
  }

  /** Смена класса-стадии с кэшем (для цвета температуры). */
  function setCls(e, cls) {
    if (!e || e._cls === cls) return;
    e._cls = cls;
    e.className = cls;
  }

  function showEl(e) { if (e && e.classList.contains('hidden')) e.classList.remove('hidden'); }
  function hideEl(e) { if (e && !e.classList.contains('hidden')) e.classList.add('hidden'); }

  /** Формат температуры: «−26°» (минус — типографский). */
  function fmtTemp(t) {
    var v = Math.round(t);
    return (v < 0 ? '−' : '') + Math.abs(v) + '°';
  }

  /** Русское окончание для дней: 1 день, 2 дня, 5 дней. */
  function dayWord(n) {
    var a = Math.abs(n) % 100;
    var b = a % 10;
    if (a > 10 && a < 20) return 'дней';
    if (b > 1 && b < 5) return 'дня';
    if (b === 1) return 'день';
    return 'дней';
  }

  // ====================================================================
  //  МИНИ-CANVAS ИКОНКИ
  //  Все иконки HUD — маленькие канвасы, нарисованные кодом: без внешних
  //  ассетов, в общей палитре игры. Функции получают ctx и размер s.
  // ====================================================================

  /** Пиксель-хелпер: закрашенный прямоугольник на мини-канвасе. */
  function px(c, x, y, w, h, col) {
    c.fillStyle = col;
    c.fillRect(x, y, w, h);
  }

  /** Создать канвас-иконку размером s×s и нарисовать её fn(c, s). */
  function icon(fn, size) {
    var cv = document.createElement('canvas');
    cv.width = size;
    cv.height = size;
    var c = cv.getContext('2d');
    if (c) {
      try { fn(c, size); } catch (e) { WS.err('hud icon draw', e && e.message); }
    }
    return cv;
  }

  // палитра (в тон css/base.css)
  var COL = {
    ink: '#d8dee9', dim: '#8b95a5', line: '#2c3a4e',
    blood: '#8a2a22', red: '#b0483f',
    cold: '#7ea3c4', blue: '#5d84a8',
    ok: '#7ea36a', warn: '#c4933f', accent: '#d8a45c',
    hunger: '#a8824f', thirst: '#5d8fb0',
    fat: '#8b86a0', san: '#9a7fb0', wet: '#6fa3c9'
  };

  // --- иконки показателей (20×20) ------------------------------------

  /** Сердце — здоровье. */
  function drawHeart(c, s) {
    var u = s / 10;                                   // юнит
    px(c, 2 * u, 2 * u, 6 * u, 4 * u, COL.blood);    // верх
    px(c, 1 * u, 3 * u, 8 * u, 3 * u, COL.blood);
    px(c, 2 * u, 6 * u, 6 * u, 2 * u, COL.blood);
    px(c, 3 * u, 8 * u, 4 * u, 1 * u, COL.blood);
    px(c, 4 * u, 9 * u, 2 * u, 1 * u, COL.blood);
    px(c, 3 * u, 3 * u, 1 * u, 1 * u, '#c4685c');    // блик
  }

  /** Коврига/сухарь — голод. */
  function drawBread(c, s) {
    var u = s / 10;
    px(c, 1 * u, 4 * u, 8 * u, 4 * u, COL.hunger);
    px(c, 2 * u, 3 * u, 6 * u, 1 * u, COL.hunger);
    px(c, 2 * u, 8 * u, 6 * u, 1 * u, '#8a683c');
    px(c, 3 * u, 5 * u, 1 * u, 1 * u, '#8a683c');    // надрезы
    px(c, 5 * u, 5 * u, 1 * u, 1 * u, '#8a683c');
    px(c, 7 * u, 5 * u, 1 * u, 1 * u, '#8a683c');
  }

  /** Капля — жажда. */
  function drawDrop(c, s) {
    var u = s / 10;
    px(c, 4 * u, 1 * u, 2 * u, 2 * u, COL.thirst);
    px(c, 3 * u, 3 * u, 4 * u, 2 * u, COL.thirst);
    px(c, 2 * u, 5 * u, 6 * u, 3 * u, COL.thirst);
    px(c, 3 * u, 8 * u, 4 * u, 1 * u, COL.thirst);
    px(c, 4 * u, 9 * u, 2 * u, 1 * u, COL.thirst);
    px(c, 3 * u, 5 * u, 1 * u, 2 * u, '#8fb8d4');    // блик
  }

  /** Полумесяц — усталость. */
  function drawMoon(c, s) {
    var u = s / 10;
    px(c, 5 * u, 1 * u, 3 * u, 8 * u, COL.fat);
    px(c, 4 * u, 2 * u, 1 * u, 6 * u, COL.fat);
    px(c, 3 * u, 3 * u, 1 * u, 4 * u, COL.fat);
    px(c, 7 * u, 2 * u, 2 * u, 1 * u, '#101620');     // серп
    px(c, 7 * u, 7 * u, 2 * u, 1 * u, '#101620');
    px(c, 2 * u, 2 * u, 1 * u, 1 * u, COL.dim);       // звезда
    px(c, 8 * u, 8 * u, 1 * u, 1 * u, COL.dim);
  }

  /** Глаз — рассудок. */
  function drawEye(c, s) {
    var u = s / 10;
    px(c, 1 * u, 4 * u, 8 * u, 3 * u, COL.san);
    px(c, 2 * u, 3 * u, 6 * u, 1 * u, COL.san);
    px(c, 2 * u, 7 * u, 6 * u, 1 * u, COL.san);
    px(c, 4 * u, 4 * u, 2 * u, 3 * u, '#e6d9f2');    // белок
    px(c, 4 * u, 5 * u, 2 * u, 1 * u, '#3a2b4a');    // зрачок
  }

  /** Термометр — тепло тела / ощущаемая температура. */
  function drawThermo(c, s) {
    var u = s / 10;
    px(c, 4 * u, 1 * u, 2 * u, 6 * u, COL.cold);     // колба
    px(c, 3 * u, 7 * u, 4 * u, 2 * u, COL.cold);
    px(c, 4 * u, 5 * u, 2 * u, 3 * u, '#b0483f');    // ртуть внизу — холод не грозит
  }

  /** Волна/капли — мокрота. */
  function drawWet(c, s) {
    var u = s / 10;
    px(c, 1 * u, 6 * u, 8 * u, 1 * u, COL.wet);      // линия воды
    px(c, 2 * u, 7 * u, 6 * u, 1 * u, COL.wet);
    px(c, 3 * u, 8 * u, 4 * u, 1 * u, COL.wet);
    px(c, 2 * u, 2 * u, 1 * u, 2 * u, COL.wet);      // брызги
    px(c, 5 * u, 1 * u, 1 * u, 3 * u, COL.wet);
    px(c, 7 * u, 3 * u, 1 * u, 2 * u, COL.wet);
  }

  /** Снежинка — обморожение. */
  function drawFrost(c, s) {
    var u = s / 10;
    px(c, 4 * u, 1 * u, 2 * u, 8 * u, '#bfe3ef');   // вертикаль
    px(c, 1 * u, 4 * u, 8 * u, 2 * u, '#bfe3ef');   // горизонталь
    px(c, 2 * u, 2 * u, 1 * u, 1 * u, '#bfe3ef');   // диагонали
    px(c, 7 * u, 7 * u, 1 * u, 1 * u, '#bfe3ef');
    px(c, 7 * u, 2 * u, 1 * u, 1 * u, '#bfe3ef');
    px(c, 2 * u, 7 * u, 1 * u, 1 * u, '#bfe3ef');
    px(c, 4 * u, 4 * u, 2 * u, 2 * u, '#e9f7fc');   // центр
  }

  // --- иконки слотов экипировки (22×22, серые — «пусто») --------------

  function slotIconBase(c, s, col) {
    // рамка слота рисуется css; здесь — сам предмет-призрак
    return col || COL.dim;
  }

  function drawSlotHead(c, s) {
    var u = s / 11, col = slotIconBase(c, s);
    px(c, 3 * u, 3 * u, 5 * u, 3 * u, col);          // тулья
    px(c, 2 * u, 5 * u, 7 * u, 1 * u, col);          // поля
    px(c, 2 * u, 6 * u, 1 * u, 3 * u, col);          // ушанка: клапан
    px(c, 8 * u, 6 * u, 1 * u, 3 * u, col);
  }

  function drawSlotTorso(c, s) {
    var u = s / 11, col = slotIconBase(c, s);
    px(c, 3 * u, 2 * u, 5 * u, 1 * u, col);          // плечи
    px(c, 2 * u, 3 * u, 7 * u, 5 * u, col);          // корпус
    px(c, 4 * u, 8 * u, 3 * u, 1 * u, col);          // низ
    px(c, 5 * u, 3 * u, 1 * u, 5 * u, '#101620');    // запах
  }

  function drawSlotLegs(c, s) {
    var u = s / 11, col = slotIconBase(c, s);
    px(c, 3 * u, 2 * u, 5 * u, 2 * u, col);          // пояс
    px(c, 3 * u, 4 * u, 2 * u, 5 * u, col);          // штанины
    px(c, 6 * u, 4 * u, 2 * u, 5 * u, col);
  }

  function drawSlotFeet(c, s) {
    var u = s / 11, col = slotIconBase(c, s);
    px(c, 5 * u, 2 * u, 2 * u, 5 * u, col);          // голенище
    px(c, 4 * u, 7 * u, 5 * u, 2 * u, col);          // валенок
  }

  function drawSlotHands(c, s) {
    var u = s / 11, col = slotIconBase(c, s);
    px(c, 3 * u, 3 * u, 4 * u, 4 * u, col);          // варежка
    px(c, 3 * u, 7 * u, 3 * u, 1 * u, col);
    px(c, 7 * u, 3 * u, 1 * u, 3 * u, col);          // большой палец
  }

  function drawSlotBack(c, s) {
    var u = s / 11, col = slotIconBase(c, s);
    px(c, 3 * u, 3 * u, 5 * u, 6 * u, col);          // мешок
    px(c, 4 * u, 2 * u, 3 * u, 1 * u, col);          // горловина
    px(c, 4 * u, 5 * u, 3 * u, 1 * u, '#101620');    // ремень
  }

  function drawSlotHand(c, s) {
    var u = s / 11, col = slotIconBase(c, s);
    px(c, 5 * u, 1 * u, 1 * u, 5 * u, col);          // рукоять
    px(c, 3 * u, 6 * u, 5 * u, 1 * u, col);          // гарда
    px(c, 4 * u, 7 * u, 3 * u, 3 * u, col);          // лезвие-призрак
  }

  var SLOT_DRAW = {
    head: drawSlotHead, torso: drawSlotTorso, legs: drawSlotLegs,
    feet: drawSlotFeet, hands: drawSlotHands, back: drawSlotBack,
    hand1: drawSlotHand, hand2: drawSlotHand
  };

  // --- иконки категорий предметов (для занятых слотов, 18×18) ---------

  var CAT_DRAW = {
    cloth:   function (c, s) { drawSlotTorso(c, s); },
    tool:    function (c, s) { drawSlotHand(c, s); },
    weapon:  function (c, s) { drawSlotHand(c, s); },
    ranged:  function (c, s) { drawSlotHand(c, s); },
    light:   function (c, s) { drawFlame(c, s); },
    ammo:    function (c, s) { drawBullet(c, s); },
    med:     function (c, s) { drawCross(c, s); },
    food:    function (c, s) { drawBread(c, s); },
    drink:   function (c, s) { drawDrop(c, s); },
    book:    function (c, s) { drawBook(c, s); },
    material: function (c, s) { drawLog(c, s); },
    fuel:    function (c, s) { drawLog(c, s); },
    container: function (c, s) { drawSlotBack(c, s); },
    misc:    function (c, s) { drawDot(c, s); }
  };

  function drawFlame(c, s) {
    var u = s / 10;
    px(c, 4 * u, 1 * u, 2 * u, 2 * u, COL.accent);
    px(c, 3 * u, 3 * u, 4 * u, 3 * u, COL.accent);
    px(c, 4 * u, 6 * u, 2 * u, 2 * u, COL.warn);
    px(c, 2 * u, 8 * u, 6 * u, 1 * u, COL.dim);       // лучина
  }

  function drawBullet(c, s) {
    var u = s / 10;
    px(c, 4 * u, 1 * u, 2 * u, 4 * u, COL.accent);
    px(c, 3 * u, 5 * u, 4 * u, 4 * u, COL.dim);
  }

  function drawCross(c, s) {
    var u = s / 10;
    px(c, 4 * u, 1 * u, 2 * u, 8 * u, '#c4685c');
    px(c, 1 * u, 4 * u, 8 * u, 2 * u, '#c4685c');
  }

  function drawBook(c, s) {
    var u = s / 10;
    px(c, 2 * u, 2 * u, 6 * u, 6 * u, COL.accent);
    px(c, 2 * u, 2 * u, 1 * u, 6 * u, COL.accent2);   // корешок
    px(c, 4 * u, 4 * u, 3 * u, 1 * u, '#f4e6c8');     // строчка
  }

  function drawLog(c, s) {
    var u = s / 10;
    px(c, 1 * u, 4 * u, 7 * u, 3 * u, '#7a5a34');
    px(c, 8 * u, 4 * u, 1 * u, 3 * u, '#c9a06a');     // торец
    px(c, 1 * u, 7 * u, 7 * u, 1 * u, '#5c441f');
  }

  function drawDot(c, s) {
    var u = s / 10;
    px(c, 3 * u, 3 * u, 4 * u, 4 * u, COL.dim);
  }

  // --- погодные иконки (34×34) ----------------------------------------
  //  Рисуем заново только при смене типа погоды (кэш по id).

  var lastWeatherId = null;

  function drawWeatherIcon(cv, id) {
    if (!cv || !cv.getContext) return;
    var c = cv.getContext('2d');
    if (!c) return;
    c.clearRect(0, 0, cv.width, cv.height);
    var s = cv.width, u = s / 12;
    var cloud = '#8b95a5', snow = '#dfe9f2', sun = '#d8a45c';
    switch (id) {
      case 'clear':
        px(c, 3 * u, 6 * u, 4 * u, 4 * u, sun);       // низкое солнце
        px(c, 2 * u, 7 * u, 6 * u, 2 * u, sun);
        px(c, 9 * u, 2 * u, 1 * u, 3 * u, '#dfe9f2');  // полярная звезда
        px(c, 8 * u, 3 * u, 3 * u, 1 * u, '#dfe9f2');
        break;
      case 'overcast':
        px(c, 2 * u, 5 * u, 8 * u, 3 * u, cloud);
        px(c, 3 * u, 4 * u, 4 * u, 2 * u, '#6e7889');
        px(c, 1 * u, 7 * u, 6 * u, 2 * u, '#6e7889');
        break;
      case 'snow':
        px(c, 2 * u, 3 * u, 8 * u, 3 * u, cloud);
        px(c, 3 * u, 2 * u, 4 * u, 2 * u, '#a9b3c2');
        px(c, 3 * u, 8 * u, 1 * u, 1 * u, snow);
        px(c, 6 * u, 9 * u, 1 * u, 1 * u, snow);
        px(c, 9 * u, 8 * u, 1 * u, 1 * u, snow);
        break;
      case 'blizzard':
        px(c, 1 * u, 2 * u, 9 * u, 3 * u, '#6e7889');
        px(c, 2 * u, 6 * u, 5 * u, 1 * u, snow);      // косые линии ветра
        px(c, 4 * u, 8 * u, 5 * u, 1 * u, snow);
        px(c, 6 * u, 10 * u, 5 * u, 1 * u, snow);
        break;
      case 'fog':
        px(c, 1 * u, 4 * u, 10 * u, 1 * u, cloud);
        px(c, 2 * u, 6 * u, 9 * u, 1 * u, '#6e7889');
        px(c, 1 * u, 8 * u, 10 * u, 1 * u, '#6e7889');
        break;
      case 'hard_frost':
        px(c, 5 * u, 1 * u, 2 * u, 10 * u, snow);      // кристалл
        px(c, 1 * u, 5 * u, 10 * u, 2 * u, snow);
        px(c, 2 * u, 2 * u, 2 * u, 2 * u, snow);
        px(c, 8 * u, 8 * u, 2 * u, 2 * u, snow);
        px(c, 8 * u, 2 * u, 2 * u, 2 * u, snow);
        px(c, 2 * u, 8 * u, 2 * u, 2 * u, snow);
        break;
      case 'snowstorm':
        px(c, 1 * u, 1 * u, 10 * u, 3 * u, '#5d6775');
        px(c, 2 * u, 5 * u, 6 * u, 1 * u, snow);
        px(c, 5 * u, 7 * u, 6 * u, 1 * u, snow);
        px(c, 1 * u, 9 * u, 7 * u, 1 * u, snow);
        break;
      default:
        px(c, 3 * u, 5 * u, 6 * u, 3 * u, cloud);      // неизвестная — туча
    }
  }

  // ====================================================================
  //  CASUS — атмосферные подписи
  //  Показываются изредка, по событиям, вверху экрана. Это не туториал:
  //  короткие эмоциональные фразы о Севере, смерти и тишине.
  // ====================================================================

  var CASUS = {
    // редкие «фоновые» мысли при смене часа (очень низкий шанс)
    idle: [
      'Мороз рисует на стекле чужие письмена.',
      'Дым из трубы — единственное движение на горизонте.',
      'Снег скрипит под валенками, как половица.',
      'Где-то далеко — гудок. Или почудилось.',
      'Тишина здесь не пустая. Она ждёт.',
      'Небо цвета замёрзшей реки.',
      'Ветер несёт запах дыма — чей-то огонь жив.',
      'Собственный след на снегу — единственная ниточка домой.'
    ],
    // первая ночь
    night: [
      'Ночь здесь — не время, а место.',
      'Темнеет так, будто свет кончился навсегда.',
      'Волчьи глаза видят вас лучше, чем вы их.'
    ],
    // убита стая/волк
    wolf: [
      'Вой затих. Снег под ним — красный.',
      'Тишина. Только ветер.',
      'Шерсть на снегу. Сердце — в горле.',
      'Стаи больше нет. Есть вы.'
    ],
    // убит медведь
    bear: [
      'Хозяин леса лёг. Лес это запомнит.',
      'Такая туша кормит долго. Если дотащите.'
    ],
    // найдена записка
    note: [
      'Чужой почерк. Чужая жизнь. Бумага не греет.',
      'Кто-то писал это, чтобы не сойти с ума.',
      'Слова на морозе живут дольше людей.'
    ],
    // метель/буря
    storm: [
      'Белое безмолвие.',
      'Мир за стеной из ветра.',
      'Дороги нет. Есть только белая мгла.'
    ],
    // полярная ночь
    polar: [
      'Солнце не встанет. Совсем.',
      'Декабрь съел день целиком.',
      'Теперь только лампа, печь и терпение.'
    ],
    // гипотермия 3+
    hypo: [
      'Пальцы не слушаются. Скоро — и голова.',
      'Холод звучит. Низко и терпеливо.',
      'Спать хочется всё сильнее. Этого делать нельзя.'
    ],
    // низкий рассудок
    madness: [
      'Голоса в трубе шепчут ваше имя.',
      'Стены дышат. Или это вы дышите чаще.',
      'Один разговор с самим собой — и станет легче. Наверное.'
    ],
    // рассвет (после долгой ночи)
    dawn: [
      'Серый свет. Он ничего не обещает, но всё же — свет.',
      'Ещё один день отвоёван у тьмы.'
    ]
  };

  var casusCool = 0;      // реальных секунд до следующей подписи
  var casusT = 0;         // сколько текущая уже висит
  var casusOn = false;    // сейчас показана

  /** Показать CASUS-подпись (если прошло ограничение). */
  function casus(text, force) {
    if (!root || !els.casus) return;
    if (!force && casusCool > 0) return;
    setText(els.casus, text);
    showEl(els.casus);
    els.casus.classList.add('on');
    casusOn = true;
    casusT = 0;
    casusCool = CASUS_MIN_GAP;
  }

  /** Случайный элемент массива. */
  function pick(arr) {
    if (!arr || !arr.length) return '';
    return arr[Math.floor(Math.random() * arr.length)];
  }

  /** Тик CASUS: выдержка показа, затемнение, откат. */
  function casusTick(dt) {
    if (casusCool > 0) casusCool = Math.max(0, casusCool - dt);
    if (!casusOn) return;
    casusT += dt;
    if (casusT < CASUS_DUR) return;
    casusOn = false;
    if (els.casus) {
      els.casus.classList.remove('on');
      // убираем из потока после затухания (css transition)
      setTimeout(function () {
        if (!casusOn) hideEl(els.casus);
      }, 900);
    }
  }

  // ====================================================================
  //  ОБУЧАЮЩИЕ ПОДСКАЗКИ (туториал)
  //  Каждая показывается один раз за партию: ключ пишется в
  //  WS.G.story.hints (переживает сейв). Очередь — по одной за раз.
  // ====================================================================

  var HINTS = {
    move:    'WASD / стрелки — идти. Колесо мыши — обзор. Подойдите к шкафу или полке и нажмите E.',
    search:  'E — обыскать мебель и трупы, подобрать вещь, открыть дверь. Без обыска не выжить.',
    inv:     'Находки — в инвентаре (I). Тёплые вещи надевайте сразу: холод не ждёт.',
    fire:    'Спички и дрова дают огонь: E у костра, печи или камина. Огонь — это тепло и горячая еда.',
    craft:   'Своими руками! C — крафт: факелы, стрелы, одежда — всё, что спасает.',
    night:   'Ночь. F — зажечь факел или фонарь в руке. Не уходите далеко от тепла.',
    hurt:    'Кровь на снегу. H — здоровье: бинт остановит кровь, шина — перелом.',
    storm:   'Метель съедает путь и тепло. Пережидайте внутри, огонь не разжечь.',
    cold:    'Дрожь — первый сигнал смерти. Тёплая одежда, огонь, движение.',
    sleep:   'Глаза слипаются. Z — сон: только под крышей и подальше от волков.',
    polar:   'Полярная ночь: солнце не встанет до самого парохода. Считайте спички и керосин.'
  };

  var hintQ = [];          // очередь {key, text}
  var hintT = 0;           // сколько текущая уже висит
  var hintOn = false;

  /** Зарегистрировать подсказку: один раз за партию (story.hints). */
  function tryHint(key, text) {
    var g = WS.G;
    if (!g || !g.story || !g.story.hints) return;
    if (g.story.hints[key]) return;
    g.story.hints[key] = 1;
    for (var i = 0; i < hintQ.length; i++) if (hintQ[i].key === key) return;
    hintQ.push({ key: key, text: text || HINTS[key] || '' });
  }

  /** Тик подсказок: достать следующую из очереди, показать на 8 сек. */
  function hintTick(dt) {
    if (!hintOn) {
      if (hintQ.length) {
        var h = hintQ.shift();
        setText(els.hint, h.text);
        showEl(els.hint);
        els.hint.classList.add('on');
        hintOn = true;
        hintT = 0;
      }
      return;
    }
    hintT += dt;
    if (hintT >= HINT_SEC) {
      hintOn = false;
      els.hint.classList.remove('on');
      setTimeout(function () {
        if (!hintOn) hideEl(els.hint);
      }, 600);
    }
  }

  // ====================================================================
  //  ПОСТРОЕНИЕ DOM
  //  Весь HUD живёт в <div id="hud"> внутри #ui-root (договор с D4).
  //  #hud не перехватывает мышь (pointer-events:none), кроме слотов.
  // ====================================================================

  var root = null;         // #hud
  var els = {};            // кэш элементов
  var built = false;
  var barEls = {};         // полосы: name -> {fill, val}
  var slotEls = {};        // slot -> {box, icoWrap}
  var tipEl = null;        // тултип слота
  var tipSlot = null;      // чей тултип открыт
  var tipTimer = 0;

  function build() {
    if (built) return;
    var uiRoot = document.getElementById('ui-root');
    if (!uiRoot) { WS.err('hud: нет #ui-root'); return; }

    root = el('div', 'hidden');
    root.id = 'hud';
    uiRoot.appendChild(root);
    built = true;

    // --- критические оверлеи (самый нижний слой) --------------------
    els.ovBleed = el('div', 'hud-ov hud-ov-bleed', root);
    els.ovCold = el('div', 'hud-ov hud-ov-cold', root);
    els.ovFrost = el('div', 'hud-ov hud-ov-frost', root);
    els.ovPain = el('div', 'hud-ov hud-ov-pain', root);
    els.ovFaint = el('div', 'hud-ov hud-ov-faint', root);
    var faintTxt = el('div', 'hud-ov-faint-txt', els.ovFaint);
    setText(faintTxt, 'Вы без сознания…');

    // --- CASUS-подпись (верх, по центру) -----------------------------
    els.casus = el('div', 'hud-casus hidden', root);

    // --- верх слева: часы/дата/погода --------------------------------
    var topLeft = el('div', 'hud-tl ws-panel', root);
    var clock = el('div', 'hud-clock', topLeft);
    els.date = el('div', 'hud-date', clock);
    els.dayInfo = el('div', 'hud-dayline', clock);
    var chips = el('div', 'hud-chips', topLeft);
    els.chipSleep = el('span', 'hud-chip chip-sleep', chips);
    setText(els.chipSleep, 'сон');
    els.chipDrunk = el('span', 'hud-chip chip-drunk', chips);
    setText(els.chipDrunk, 'хмель');
    els.chipPolar = el('span', 'hud-chip chip-polar', chips);
    setText(els.chipPolar, 'полярная ночь');
    els.chipSpeed = el('span', 'hud-chip chip-speed', chips);
    setText(els.chipSpeed, '×2');

    var wx = el('div', 'hud-weather', topLeft);
    els.wxIco = document.createElement('canvas');
    els.wxIco.className = 'hud-wx-ico';
    els.wxIco.width = 34;
    els.wxIco.height = 34;
    wx.appendChild(els.wxIco);
    var wxInfo = el('div', 'hud-wx-info', wx);
    els.wxName = el('div', 'hud-wx-name', wxInfo);
    els.wxTemp = el('div', 'hud-wx-temp', wxInfo);
    var wxWind = el('div', 'hud-wx-wind', wxInfo);
    els.windBars = el('span', 'hud-wind-bars', wxWind);
    var i;
    for (i = 0; i < 3; i++) el('i', '', els.windBars);
    els.windTxt = el('span', 'hud-wind-txt', wxWind);
    els.wxFeels = el('div', 'hud-wx-feels', wx);

    // --- верх справа: пусто — там живёт #ws-hud ядра UI (D4: часы,
    //     дней до парохода, кнопка скорости) и место под карту (D3, клавиша M —
    //     полноэкранный экран). Ничего не ставим, чтобы не перекрывать.

    // --- туториальная подсказка (низ, центр) -------------------------
    els.hint = el('div', 'hud-hint hidden', root);

    // --- прогресс действий (низ, центр, над клавишами) ---------------
    var prog = el('div', 'hud-progress ws-panel hidden', root);
    els.prog = prog;
    els.progLbl = el('div', 'hud-prog-lbl', prog);
    var pbar = el('div', 'hud-prog-bar', prog);
    els.progFill = el('div', 'hud-prog-fill', pbar);

    // --- подсказки клавиш (низ, центр) -------------------------------
    var keys = el('div', 'hud-keys', root);
    for (i = 0; i < KEY_HINTS.length; i++) {
      var kh = el('span', 'hud-key', keys);
      el('b', '', kh).textContent = KEY_HINTS[i][0];
      kh.appendChild(document.createTextNode(' ' + KEY_HINTS[i][1]));
    }

    // --- нижняя панель состояния (слева) ------------------------------
    var status = el('div', 'hud-status ws-panel', root);
    var statL = el('div', 'hud-stat-col', status);
    buildBar(statL, 'hp', drawHeart, 'Здоровье', 'hp');
    buildBar(statL, 'hunger', drawBread, 'Сытость', 'hunger');
    buildBar(statL, 'thirst', drawDrop, 'Жажда', 'thirst');
    buildBar(statL, 'fatigue', drawMoon, 'Бодрость', 'fatigue');
    buildBar(statL, 'sanity', drawEye, 'Рассудок', 'sanity');

    var statR = el('div', 'hud-stat-climate', status);
    var tempHead = el('div', 'hud-climate-head', statR);
    var thermo = icon(drawThermo, 20);
    thermo.className = 'hud-ico';
    tempHead.appendChild(thermo);
    els.coreT = el('div', 'hud-core-temp', tempHead);      // feelsLike
    els.stage = el('div', 'hud-stage st0', statR);          // стадия гипотермии
    buildBar(statR, 'wet', drawWet, 'Мокрота', 'wet');
    buildBar(statR, 'frost', drawFrost, 'Обморожение', 'frost');

    // --- экипировка (низ, справа) --------------------------------------
    var equip = el('div', 'hud-equip ws-panel', root);
    var eqTitle = el('div', 'ws-title hud-equip-title', equip);
    setText(eqTitle, 'Экипировка');
    var grid = el('div', 'hud-equip-grid', equip);
    for (i = 0; i < SLOT_ORDER.length; i++) {
      buildSlot(grid, SLOT_ORDER[i]);
    }

    // --- тултип слотов (общий, живёт поверх) ---------------------------
    tipEl = el('div', 'ws-tooltip hud-slot-tip hidden', root);
    tipEl.style.pointerEvents = 'none';
  }

  /** Полоса показателя: иконка + бар + число. */
  function buildBar(parent, name, draw, title, cls) {
    var row = el('div', 'hud-stat', parent);
    row.title = title;
    var ico = icon(draw, 20);
    ico.className = 'hud-ico';
    row.appendChild(ico);
    var bar = el('div', 'hud-bar', row);
    var fill = el('div', 'hud-bar-fill ' + cls, bar);
    var val = el('span', 'hud-stat-val', row);
    barEls[name] = { fill: fill, val: val, row: row };
  }

  /** Слот экипировки: клик — тултип с предметом. */
  function buildSlot(parent, slot) {
    var box = el('div', 'hud-slot', parent);
    box.title = SLOT_NAME[slot];
    box.setAttribute('data-slot', slot);
    var icoWrap = el('div', 'hud-slot-ico', box);
    var ico = icon(SLOT_DRAW[slot] || drawDot, 22);
    icoWrap.appendChild(ico);
    var mark = el('span', 'hud-slot-mark', box);
    setText(mark, '');
    slotEls[slot] = { box: box, icoWrap: icoWrap, mark: mark, item: null };
    box.addEventListener('click', function () {
      onSlotClick(slot);
    });
  }

  // ====================================================================
  //  ТУЛТИПЫ СЛОТОВ
  //  Клик по слоту: показать имя предмета, вес, тепло (warm) и износ.
  //  Пустой слот — короткая подсказка, что сюда надевается.
  // ====================================================================

  function onSlotClick(slot) {
    if (tipSlot === slot) { hideTip(); return; }
    showSlotTip(slot);
  }

  function showSlotTip(slot) {
    if (!tipEl || !slotEls[slot]) return;
    var p = WS.G && WS.G.player;
    var it = p && p.equip ? p.equip[slot] : null;
    var def = it ? itemDef(it.id) : null;
    var name = it ? itemName(it.id) : SLOT_NAME[slot];

    // содержимое
    tipEl.textContent = '';
    var nm = el('div', 'tt-name', tipEl);
    nm.textContent = it ? name : name + ' — пусто';
    if (def && it) {
      var stats = el('div', 'tt-stats', tipEl);
      var parts = [];
      parts.push('вес ' + (typeof def.w === 'number' ? def.w : '?') + ' кг');
      if (typeof def.warm === 'number') parts.push('тепло ' + def.warm);
      if (typeof def.wind === 'number' && def.wind > 0) parts.push('ветрозащита ' + def.wind);
      if (typeof def.def === 'number' && def.def > 0) parts.push('защита ' + def.def);
      if (typeof it.cond === 'number') parts.push('износ ' + Math.round(it.cond) + '%');
      stats.textContent = parts.join(' · ');
      var desc = el('div', 'tt-desc', tipEl);
      desc.textContent = catLabel(def.cat);
    } else if (!it) {
      var d2 = el('div', 'tt-desc', tipEl);
      d2.textContent = slotHint(slot);
    }

    // позиция: над слотом, по центру, не за краем экрана
    showEl(tipEl);
    var r = slotEls[slot].box.getBoundingClientRect();
    tipEl.style.left = '0px';
    tipEl.style.top = '0px';
    var tw = tipEl.offsetWidth;
    var th = tipEl.offsetHeight;
    var x = r.left + r.width / 2 - tw / 2;
    x = Math.max(8, Math.min(x, window.innerWidth - tw - 8));
    var y = r.top - th - 10;
    if (y < 8) y = r.bottom + 10;
    tipEl.style.left = Math.round(x) + 'px';
    tipEl.style.top = Math.round(y) + 'px';
    tipSlot = slot;
    tipTimer = 3.5;                       // сек до автоскрытия
  }

  function hideTip() {
    if (!tipEl) return;
    hideEl(tipEl);
    tipSlot = null;
    tipTimer = 0;
  }

  /** Что надевается в слот — короткая подсказка. */
  function slotHint(slot) {
    switch (slot) {
      case 'head': return 'Шапки, ушанки, шарфы.';
      case 'torso': return 'Шубы, тулупы, пальто.';
      case 'legs': return 'Штаны, онучи.';
      case 'feet': return 'Валенки, сапоги.';
      case 'hands': return 'Рукавицы, перчатки.';
      case 'back': return 'Рюкзаки, котомки.';
      case 'hand1': return 'Правая рука: топор, ружьё, факел.';
      case 'hand2': return 'Левая рука: нож, копьё.';
    }
    return '';
  }

  /** Определение предмета (безопасно). */
  function itemDef(id) {
    try {
      if (WS.Data && WS.Data.items) return WS.Data.items[id] || null;
    } catch (e) { /* нет данных */ }
    return null;
  }

  /** Имя предмета: через инвентарь (I18N/литералы), иначе id. */
  function itemName(id) {
    try {
      if (WS.Inv && WS.Inv.nameOf) {
        var s = WS.Inv.nameOf(id);
        if (s && s !== id) return s;
      }
    } catch (e) { /* ниже */ }
    var d = itemDef(id);
    if (d && d.name) return d.name;
    return id;
  }

  /** Русская подпись категории. */
  function catLabel(cat) {
    var M = {
      food: 'еда', drink: 'питьё', med: 'медицина', tool: 'инструмент',
      weapon: 'оружие', ranged: 'огнестрел', ammo: 'боеприпасы',
      cloth: 'одежда', material: 'материал', book: 'книга',
      light: 'источник света', fuel: 'топливо', container: 'вместилище',
      misc: 'разное'
    };
    return M[cat] || cat || 'вещь';
  }

  // ====================================================================
  //  ОБНОВЛЕНИЕ СЕКЦИЙ
  //  Все чтения чужих модулей — под try/catch и с проверками: HUD не
  //  имеет права уронить кадр, даже если системы ещё не загружены.
  // ====================================================================

  /** Верх слева: дата, день из 60, погода, температура. */
  function updClock() {
    try {
      setText(els.date, WS.Time.fmt() + ' · ' + (WEEKDAY[WS.Time.weekday()] || ''));
      var day = WS.Time.day();
      var left = WS.Time.daysLeft();
      var line = 'День ' + day + ' из 60';
      if (left > 0) line += ' · до парохода ' + left + ' ' + dayWord(left);
      else line += ' · пароход опаздывает…';
      setText(els.dayInfo, line);
    } catch (e) { /* время недоступно */ }

    // чипы состояний
    var snap = null;
    try { if (WS.Needs && WS.Needs.snapshot) snap = WS.Needs.snapshot(); } catch (e2) { snap = null; }
    var sleeping = !!(snap && snap.sleeping);
    var drunk = snap ? snap.drunk : 0;
    if (sleeping) showEl(els.chipSleep); else hideEl(els.chipSleep);
    if (drunk >= 15) { setText(els.chipDrunk, 'хмель ' + drunk + '%'); showEl(els.chipDrunk); }
    else hideEl(els.chipDrunk);

    var polar = false;
    try { polar = WS.Time.isPolarNight(); } catch (e3) { polar = false; }
    if (polar) showEl(els.chipPolar); else hideEl(els.chipPolar);

    // скорость/пауза
    var spTxt = '';
    try {
      if (WS.paused || (WS.Loop && WS.Loop.speed === 0)) spTxt = '‖ пауза';
      else if (WS.Loop && WS.Loop.speed > 1) spTxt = '×' + WS.Loop.speed;
    } catch (e4) { spTxt = ''; }
    if (spTxt) { setText(els.chipSpeed, spTxt); showEl(els.chipSpeed); }
    else hideEl(els.chipSpeed);
  }

  /** Погода: иконка (при смене), имя, наружная температура, ветер. */
  function updWeather() {
    var cur = null;
    try { if (WS.Weather && WS.Weather.current) cur = WS.Weather.current(); } catch (e) { cur = null; }
    var id = cur ? cur.id : 'clear';
    if (id !== lastWeatherId) {
      lastWeatherId = id;
      drawWeatherIcon(els.wxIco, id);
      setText(els.wxName, cur && cur.name ? cur.name : '—');
    }
    var out = null;
    try { if (WS.Temp && WS.Temp.outside) out = WS.Temp.outside(); } catch (e2) { out = null; }
    if (out !== null) setText(els.wxTemp, fmtTemp(out) + 'C');

    var feels = null;
    try { if (WS.Temp && WS.Temp.feelsLike) feels = WS.Temp.feelsLike(); } catch (e3) { feels = null; }
    if (feels !== null) setText(els.wxFeels, 'ощущается как ' + fmtTemp(feels));

    // ветер: три полоски по силе
    var wind = cur ? (cur.wind || 0) : 0;
    var bars = els.windBars ? els.windBars.childNodes : [];
    var i, n = 0;
    if (wind > 0.15) n = 1;
    if (wind > 0.45) n = 2;
    if (wind > 0.75) n = 3;
    for (i = 0; i < bars.length; i++) {
      if (!bars[i] || !bars[i].classList) continue;
      if (i < n) bars[i].classList.add('on');
      else bars[i].classList.remove('on');
    }
    setText(els.windTxt, windWord(wind));
  }

  function windWord(w) {
    if (w < 0.15) return 'тишь';
    if (w < 0.45) return 'ветерок';
    if (w < 0.75) return 'ветер';
    return 'ветрище';
  }

  /** Нужды: полосы + числа (только целочисленные изменения). */
  function updBars() {
    var p = WS.G && WS.G.player;
    if (!p || !p.needs) return;
    var n = p.needs;

    var hp = p.hp, maxHp = p.maxHp || 100;
    setBar('hp', hp / maxHp * 100, Math.round(hp));
    setBar('hunger', n.hunger, Math.round(n.hunger));
    setBar('thirst', n.thirst, Math.round(n.thirst));
    setBar('fatigue', n.fatigue, Math.round(n.fatigue));
    setBar('sanity', n.sanity, Math.round(n.sanity));
  }

  function setBar(name, pct, val) {
    var b = barEls[name];
    if (!b) return;
    setW(b.fill, Math.max(0, Math.min(100, pct)));
    setText(b.val, String(val));
    // тревожный класс полосы: критично низкие значения мигают
    var bad = pct <= 20;
    if (b.row._bad !== bad) {
      b.row._bad = bad;
      if (bad) b.row.classList.add('bad');
      else b.row.classList.remove('bad');
    }
  }

  /** Климат-блок: feelsLike, стадия гипотермии, мокрота, обморожение. */
  function updClimate() {
    var feels = null, stage = 0, wet = 0, frost = 0;
    try {
      if (WS.Temp) {
        if (WS.Temp.feelsLike) feels = WS.Temp.feelsLike();
        if (WS.Temp.hypoStage) stage = WS.Temp.hypoStage();
        if (WS.Temp.wetness) wet = WS.Temp.wetness();
        if (WS.Temp.frostbite) frost = WS.Temp.frostbite();
      }
    } catch (e) { /* температура недоступна */ }

    if (feels !== null) setText(els.coreT, fmtTemp(feels) + 'C');
    var stName = '';
    try { if (WS.Temp && WS.Temp.stageName) stName = WS.Temp.stageName(); } catch (e2) { stName = ''; }
    setText(els.stage, stName || '—');
    setCls(els.stage, 'hud-stage ' + (STAGE_CLS[stage] || 'st0'));

    setBar('wet', wet, wet + '%');
    // обморожение растёт от нуля — полоса «полная» это беда: переворачиваем
    var frostPct = Math.max(0, Math.min(100, frost));
    var fb = barEls.frost;
    if (fb) {
      setW(fb.fill, frostPct);
      setText(fb.val, frost >= 10 ? frost + '%' : '—');
      var on = frost >= 10;
      if (fb.row._bad !== on) {
        fb.row._bad = on;
        if (on) fb.row.classList.add('bad');
        else fb.row.classList.remove('bad');
      }
    }
  }

  /** Слоты экипировки: иконка категории предмета + метка занятости. */
  function updEquip() {
    var p = WS.G && WS.G.player;
    if (!p || !p.equip) return;
    var dirty = equipDirty;
    if (!dirty && !equipEver) { equipEver = true; dirty = true; }
    if (!dirty) return;
    equipDirty = false;
    for (var i = 0; i < SLOT_ORDER.length; i++) {
      var slot = SLOT_ORDER[i];
      var se = slotEls[slot];
      var it = p.equip[slot] || null;
      if (!se) continue;
      if (se.item === it && !dirty) continue;

      // занят/свободен
      if (it) se.box.classList.add('used');
      else se.box.classList.remove('used');

      // иконка: категория предмета или призрак слота
      if (it) {
        var def = itemDef(it.id);
        var draw = CAT_DRAW[def && def.cat] || drawDot;
        se.icoWrap.textContent = '';
        var ico = icon(draw, 18);
        se.icoWrap.appendChild(ico);
      } else {
        se.icoWrap.textContent = '';
        se.icoWrap.appendChild(icon(SLOT_DRAW[slot] || drawDot, 22));
      }
      se.item = it;
    }
  }

  var equipDirty = true;
  var equipEver = false;

  /** Прогресс действий: обыск → крафт → стройка → чтение. */
  function updProgress(dt) {
    var info = progressInfo();
    if (!info) {
      hideEl(els.prog);
      return;
    }
    showEl(els.prog);
    setText(els.progLbl, info.label);
    setW(els.progFill, Math.max(0, Math.min(100, info.pct * 100)));
  }

  /** Универсальный опрос прогресса: первый непустой источник. */
  function progressInfo() {
    try {
      if (WS.Loot && WS.Loot.isSearching && WS.Loot.isSearching()) {
        return { label: 'Обыск…', pct: WS.Loot.progress() };
      }
    } catch (e) { /* пусто */ }
    try {
      if (WS.Craft && WS.Craft.isCrafting && WS.Craft.isCrafting()) {
        var inf = WS.Craft.info();
        return { label: (inf && inf.name ? inf.name : 'Работа') + '…', pct: WS.Craft.progress() };
      }
    } catch (e2) { /* пусто */ }
    try {
      if (WS.Build && WS.Build.building) {
        var b = WS.Build.building();
        if (b) {
          var def = WS.Build.byId ? WS.Build.byId(b.id) : null;
          var nm = def && def.name ? def.name : 'Стройка';
          return { label: nm + '…', pct: b.dur > 0 ? b.t / b.dur : 0 };
        }
      }
    } catch (e3) { /* пусто */ }
    try {
      var p = WS.G && WS.G.player;
      if (p && p.reading && typeof p.reading.progress === 'number') {
        return { label: 'Чтение: ' + itemName(p.reading.itemId) + '…', pct: p.reading.progress };
      }
    } catch (e4) { /* пусто */ }
    return null;
  }

  /** Критические оверлеи: кровотечение, гипотермия, боль, обморожение. */
  function updOverlays() {
    var st = null;
    try { if (WS.Health && WS.Health.status) st = WS.Health.status(); } catch (e) { st = null; }
    var p = WS.G && WS.G.player;

    // кровотечение: пульсирующая красная рамка, сила = bleed/10
    var bleed = st ? (st.bleed || 0) : (p ? (p.bleed || 0) : 0);
    if (bleed > 0) {
      setO(els.ovBleed, Math.min(1, 0.35 + bleed / 12));
      showEl(els.ovBleed);
    } else {
      hideEl(els.ovBleed);
    }

    // гипотермия: синяя виньетка по стадии
    var stage = 0;
    try { if (WS.Temp && WS.Temp.hypoStage) stage = WS.Temp.hypoStage(); } catch (e2) { stage = 0; }
    if (stage >= 2) {
      setO(els.ovCold, Math.min(0.95, 0.25 + (stage - 2) * 0.25));
      showEl(els.ovCold);
    } else {
      hideEl(els.ovCold);
    }

    // боль: тусклая пульсация по краям
    var pain = st ? (st.pain || 0) : (p ? (p.pain || 0) : 0);
    if (pain >= 30) {
      setO(els.ovPain, Math.min(0.8, (pain - 25) / 90 + 0.2));
      showEl(els.ovPain);
    } else {
      hideEl(els.ovPain);
    }

    // обморожение: белёсые мёрзлые углы
    var frost = 0;
    try { if (WS.Temp && WS.Temp.frostbite) frost = WS.Temp.frostbite(); } catch (e3) { frost = 0; }
    if (frost >= 15) {
      setO(els.ovFrost, Math.min(0.85, frost / 100 + 0.2));
      showEl(els.ovFrost);
    } else {
      hideEl(els.ovFrost);
    }

    // обморок: темнота
    var faint = false;
    try {
      if (p && (p._faintT || 0) > 0) faint = true;
      if (WS.Needs && WS.Needs.snapshot) {
        var s2 = WS.Needs.snapshot();
        if (s2 && s2.faint) faint = true;
      }
    } catch (e4) { faint = false; }
    if (faint) showEl(els.ovFaint); else hideEl(els.ovFaint);
  }

  // ====================================================================
  //  ГЛАВНЫЙ ТИК
  // ====================================================================

  var visible = false;

  /** Показать HUD (после game:start / game:load). */
  function show() {
    if (!built) build();
    if (!root) return;
    visible = true;
    root.classList.remove('hidden');
  }

  /** Скрыть HUD (меню, смерть, победа). */
  function hide() {
    visible = false;
    if (root) root.classList.add('hidden');
    hideTip();
  }

  function hudTick(dt) {
    if (!built || !visible) return;
    if (!WS.G || !WS.G.running || WS.dead) return;

    updClock();
    updWeather();
    updBars();
    updClimate();
    updEquip();
    updProgress(dt);
    updOverlays();
    hintTick(dt);
    casusTick(dt);

    // автоскрытие тултипа слота
    if (tipTimer > 0) {
      tipTimer -= dt;
      if (tipTimer <= 0) hideTip();
    }

    // фоновые CASUS: редкие «мысли» без события
    idleCasusChance(dt);
  }

  /** Редкая фоновая мысль: ~ раз в 8-12 минут реального времени. */
  var idleT = 0;
  function idleCasusChance(dt) {
    idleT += dt;
    if (idleT < 60) return;
    idleT = 0;
    if (casusOn || casusCool > 0) return;
    if (Math.random() < 0.10) casus(pick(CASUS.idle));
  }

  // ====================================================================
  //  СОБЫТИЯ
  //  Подписки вешаем на события ядра: туториал, CASUS, показ/скрытие.
  //  Все обработчики — с защитой: HUD не имеет права уронить эмиттер.
  // ====================================================================

  function on(name, fn) {
    WS.Ev.on(name, function (d) {
      try { fn(d); } catch (e) {
        WS.err('hud event "' + name + '"', e && e.message);
      }
    });
  }

  function bindEvents() {
    // --- жизненный цикл партии ----------------------------------------
    on('game:start', function () {
      show();
      lastWeatherId = null;      // перерисовать погодную иконку
      equipDirty = true;
      hintQ.length = 0;
      hintOn = false;
      hideEl(els.hint);
      casusCool = 20;            // первые минуты — тишина, потом атмосфера
      tryHint('move');
      tryHint('search');
    });
    on('game:load', function () {
      show();
      lastWeatherId = null;
      equipDirty = true;
    });
    on('player:die', function () {
      hide();
      hideTip();
    });

    // --- изменения инвентаря/экипировки ---------------------------------
    on('inv:changed', function () { equipDirty = true; });
    on('equip:changed', function () { equipDirty = true; });

    // --- туториал по событиям -------------------------------------------
    on('loot:searched', function () {
      tryHint('inv');
      tryHint('fire');
    });
    on('item:crafted', function () { tryHint('craft'); });
    on('night:fall', function () {
      tryHint('night');
      casus(pick(CASUS.night));
    });
    on('day:dawn', function () {
      if (Math.random() < 0.5) casus(pick(CASUS.dawn));
    });
    on('player:damage', function () { tryHint('hurt'); });
    on('weather:changed', function (d) {
      var to = d && d.to;
      if (to === 'blizzard' || to === 'snowstorm') {
        tryHint('storm');
        casus(pick(CASUS.storm));
      }
    });
    on('temp:stage', function (d) {
      if (d && d.stage === 2) tryHint('cold');
      if (d && d.stage >= 3) casus(pick(CASUS.hypo));
    });
    on('time:day', function (d) {
      // усталость: сон советуем при долгом бодрствовании — в тике ниже
      if (d && d.day === 44) {
        tryHint('polar');
        casus(pick(CASUS.polar));
      }
    });
    on('story:note', function () { casus(pick(CASUS.note)); });
    on('ent:kill', function (d) {
      var e = d && d.ent;
      if (!e) return;
      if (e.kind === 'wolf') casus(pick(CASUS.wolf));
      else if (e.kind === 'bear') casus(pick(CASUS.bear));
    });
    on('player:levelup', function () { /* тихая радость: без подписи */ });
  }

  // ====================================================================
  //  ПУБЛИЧНЫЙ API
  //  Минимальный: показать/скрыть/состояние. Регистрируем как WS.Hud —
  //  НЕ WS.Ui (тот пишет D4 в ui.js).
  // ====================================================================

  var Hud = {
    /** Показать HUD (после game:start / game:load). */
    show: show,
    /** Скрыть HUD (меню, смерть, победа). */
    hide: hide,
    /** Виден ли сейчас. */
    visible: function () { return visible; },
    /** Показать CASUS-подпись вручную (для сценарных модулей). */
    casus: function (text) { casus(text, true); },
    /** Очередь обучающих подсказок: добавить (один раз за партию). */
    hint: function (key, text) { tryHint(key, text); },
    /** Самодиагностика (консоль). */
    selftest: function () {
      var out = [];
      function ok(name, cond) {
        out.push((cond ? '  ok   ' : '  FAIL ') + name);
        return !!cond;
      }
      ok('DOM построен', built);
      ok('#hud в документе', !!document.getElementById('hud'));
      ok('виден при игре', !WS.G || !WS.G.running || visible);
      ok('слотов экипировки: 8', (function () {
        var n = 0;
        for (var k in slotEls) if (slotEls.hasOwnProperty(k)) n++;
        return n === 8;
      })());
      ok('полос показателей: 7', (function () {
        var n = 0;
        for (var k2 in barEls) if (barEls.hasOwnProperty(k2)) n++;
        return n === 7;
      })());
      ok('CASUS-наборы непустые', CASUS.idle.length > 3 && CASUS.wolf.length > 2);
      return out;
    }
  };

  WS.def('Hud', Hud);

  // ====================================================================
  //  BOOT
  // ====================================================================

  WS.boot(function initHud() {
    build();
    bindEvents();
    // тик UI — приоритет 80 (CONTRACT.md). Даже если HUD скрыт — выходим
    // первым же if'ом, кадр не тратим.
    WS.tick(TICK_PRI, hudTick, 'ui:hud');
    WS.log('hud: готов (D1)');
  }, 'hud:init');
})();
