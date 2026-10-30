/**
 * sprites_player.js — спрайты игрока и сопутствующие декали.
 * Связь: ядро WS.Spr (core/sprites.js), модуль игрока js/entities/player.js
 * (sprName/sprFrame/dir), боёвка js/entities/actions.js (blood_pool, corpse).
 *
 * ВСЕ спрайты регистрируются ПРИ ЗАГРУЗКЕ ФАЙЛА (WS.Spr.def/defmap),
 * НЕ в boot — по требованию контракта задачи A3.
 *
 * ВАЖНО про WS.Spr.defmap: defmap не умеет выбирать карту по frame/dir
 * (draw игнорирует их). Поэтому много-кадровые/направленные спрайты собраны
 * как набор defmap-подспрайтов '#имя.вид.поза' + диспетчер на WS.Spr.def,
 * который собирает кадр по (frame, dir): 8 направлений x 4 кадра (idle, шаг,
 * idle, шаг). Формат карт — тот же defmap (строки + легенда).
 */
(function () {
  'use strict';

  var Spr = WS.Spr;
  if (!Spr) { WS.err('sprites_player: WS.Spr не загружен (порядок скриптов!)'); return; }
  var pal = Spr.pal;

  // ====================================================================
  //  ЛЕГЕНДА ПЕРСОНАЖА (общая для всех карт игрока)
  //  Мужчина: ушанка с наушниками, бородой; тулуп с меховым воротом,
  //  кушаком; рукавицы в рукавах; валенки.
  // ====================================================================
  var PLEG = {
    K: '#14161d',      // контур (тёмная обводка)
    F: pal.fur,        // мех ушанки, основной
    G: '#5d4e3a',      // мех, тень (затылок, тёмная сторона)
    W: '#9c8d73',      // мех светлый: кант, ворот тулупа
    S: pal.skin,       // кожа лица
    s: pal.skin2,      // кожа, тень
    E: '#1a1210',      // глаз
    R: '#6b5947',      // борода
    r: '#524434',      // борода, тень
    C: pal.coat,       // тулуп, основной
    D: pal.coat2,      // тулуп, тень/складки/кушак
    L: '#5a6a80',      // тулуп, блик (грудь на вдохе)
    P: pal.pants,      // штаны
    V: '#b3a78d',      // валенки (светлый войлок)
    v: '#93876c',      // валенки, подошва/тень
    M: '#5d5344',      // рукавицы (кожа/мех)
    m: '#463f33',      // рукавицы, тень (дальняя рука)
    X: pal.blood       // кровь
  };

  // Легенда трупа/свёртка (мрачнее, припорошено снегом)
  var CLEG = {
    K: '#14161d',
    D: '#343a46',      // тёмная масса тела под снегом
    W: '#9c8d73',      // снег на теле
    M: '#5d5344'       // рука в рукавице
  };

  // Легенда узла-предмета на земле
  var DLEG = {
    K: '#14161d',
    C: '#8a7d64',      // мешковина
    B: '#4a3a28'       // обвязка/верёвка
  };

  // Легенда следа на снегу: едва заметные вдавленности (полупрозрачные)
  var FLEG = {
    A: 'rgba(96,116,146,0.30)',   // край следа
    B: 'rgba(96,116,146,0.16)'    // дно следа (светлее)
  };

  // ====================================================================
  //  ГЕОМЕТРИЯ НАПРАВЛЕНИЙ
  //
  //  WS.M.dir8(dx,dy) возвращает 0..7. В МИРОВЫХ осях это:
  //    0:(0,+y) 1:(-x,+y) 2:(-x,0) 3:(-x,-y) 4:(0,-y) 5:(+x,-y) 6:(+x,0) 7:(+x,+y)
  //  На ЭКРАНЕ (изометрия 2:1) те же направления выглядят:
  //    0: вниз-влево  1: влево        2: вверх-влево  3: вверх
  //    4: вверх-вправо 5: вправо      6: вниз-вправо  7: вниз
  //
  //  Рисуем 5 уникальных видов, 3 из них зеркалим:
  //    front — лицом к камере (dir 7)
  //    fleft — в три четверти, виден левый бок (dir 0, 6 зеркально)
  //    left  — левый профиль (dir 1, 5 зеркально)
  //    bleft — спина в три четверти (dir 2, 4 зеркально)
  //    back  — спина (dir 3)
  // ====================================================================
  var DIRVIEW_FULL = [
    { v: 'fleft', f: 0 },   // 0: экран ЮЗ — мир (+y)
    { v: 'left',  f: 0 },   // 1: экран З  — мир (-x,+y)
    { v: 'bleft', f: 0 },   // 2: экран СЗ — мир (-x)
    { v: 'back',  f: 0 },   // 3: экран С  — мир (-x,-y), спина
    { v: 'bleft', f: 1 },   // 4: экран СВ — мир (+x,-y), спина вправо
    { v: 'left',  f: 1 },   // 5: экран В  — мир (+x)
    { v: 'fleft', f: 1 },   // 6: экран ЮВ — мир (+x,+y)
    { v: 'front', f: 0 }    // 7: экран Ю  — мир (-x,-y), лицо
  ];

  // Присед: три вида достаточно, диагонали сводим к ближайшему
  var DIRVIEW_SNEAK = [
    { v: 'front', f: 0 },   // 0
    { v: 'left',  f: 0 },   // 1
    { v: 'back',  f: 0 },   // 2
    { v: 'back',  f: 0 },   // 3
    { v: 'back',  f: 1 },   // 4
    { v: 'left',  f: 1 },   // 5
    { v: 'front', f: 1 },   // 6
    { v: 'front', f: 0 }    // 7
  ];

  // Кадр анимации 0..3 -> поза (по заданию: idle, шаг1, idle, шаг2)
  var FRAME_POSE = ['idle', 'w1', 'idle', 'w2'];
  var POSES = ['idle', 'w1', 'w2'];

  // Мировой вектор направления по индексу dir (для поворота следов)
  var DIRVEC = [
    [0, 1], [-1, 1], [-1, 0], [-1, -1],
    [0, -1], [1, -1], [1, 0], [1, 1]
  ];

  // Угол поворота следа (в экранных координатах) для каждого dir
  var FP_ANG = [];
  (function () {
    for (var d = 0; d < 8; d++) {
      var s = WS.M.toScreen(DIRVEC[d][0], DIRVEC[d][1]);
      // карта следа нарисована «носком вверх» (экранный -Y)
      FP_ANG.push(Math.atan2(s.y, s.x) + Math.PI / 2);
    }
  })();

  // ====================================================================
  //  КАРТЫ: СТОЯ (16x24 логических пикселей, scale 2 -> 32x48)
  //
  //  Тело: строки 0..19 (строка 0 — пустая набивка под «подскок» при шаге).
  //  Ноги: строки 20..23, три варианта (стоя/шаг1/шаг2).
  // ====================================================================

  // -------------------- ВИД СПЕРЕДИ (front, dir 7) --------------------
  // Ушанка: тулья (K/F/G), меховая полоса надо лбом (r05), наушники по щекам
  // (FF колонки), борода (R) поверх ворот- меха (W), кушак (D), рукавицы (M).
  var B_FRONT = [
    "................",
    "......KKKK......",
    ".....KFFFFK.....",
    "....KFFFFFFK....",
    "....KFGGGGFK....",
    "...KKFFFFFFKK...",
    "..KFFKSSSSKFFK..",
    "..KFFSESSESFFK..",
    "..KFFSRRRRSFFK..",
    "..KGRRRRRRRRGK..",
    "...KWWRRRRWWK...",
    "..KWWCCCCCCWWK..",
    ".KCCCKCCCCKCCCK.",
    ".KCCKCCCCCCKCCK.",
    ".KCCKCCCCCCKCCK.",
    ".KMCKCCCCCCKMCK.",
    ".KMMKDDDDDDKMMK.",
    "..KKCCCCCCCCKK..",
    "...KCCCCCCCCK...",
    "...KCCCCCCCCK..."
  ];

  // -------------------- ВИД СЗАДИ (back, dir 3) --------------------
  // Затылок в ушанке, шов тульи (W), спина тулупа без пряжки.
  var B_BACK = [
    "................",
    "......KKKK......",
    ".....KFFFFK.....",
    "....KFFFFFFK....",
    "....KGGGGGGK....",
    "...KKFGGGGFKK...",
    "..KFFGGGGGGFFK..",
    "..KFFGGWWGGFFK..",
    "..KFFFGGGGFFFK..",
    "...KKGGGGGGKK...",
    "...KWWWWWWWWK...",
    "..KWWCCCCCCWWK..",
    ".KCCCKCCCCKCCCK.",
    ".KCCKCCCCCCKCCK.",
    ".KCCKCCCCCCKCCK.",
    ".KMCKCCCCCCKMCK.",
    ".KMMKDDDDDDKMMK.",
    "..KKCCCCCCCCKK..",
    "...KCCCCCCCCK...",
    "...KCCCCCCCCK..."
  ];

  // -------------------- ЛЕВЫЙ ПРОФИЛЬ (left, dir 1) --------------------
  // Лицом к левому краю экрана: нос/усы слева, наушник на ухе, спина справа.
  var B_LEFT = [
    "................",
    "......KKKK......",
    ".....KFFFFK.....",
    "....KFFFFFFK....",
    "....KFFFGGGK....",
    "...KKFFFFGGKK...",
    "..KSSKFFFGGGK...",
    ".KSESKFFFFGGK...",
    ".KSRRKFFFGGK....",
    ".KRRRRKGGGGK....",
    "..KRRKGGGGK.....",
    ".KWWCCCCCCCGK...",
    "KCCCCCCCCCCGK...",
    "KCCCDDCCCCCGK...",
    "KCCCCDDDDCCGK...",
    "KMCCCDDDDCCGK...",
    "KMMCDDDDDCGK....",
    ".KKCCCCCCCCGK...",
    ".KCCCCCCCCCK....",
    "..KCCCCCCCCK...."
  ];

  // -------------------- ТРИ ЧЕТВЕРТИ, ЛИЦО (fleft, dir 0) --------------------
  // Виден левый бок: лицо чуть смещено влево, дальняя рука темнее (m).
  var B_FLEFT = [
    "................",
    "......KKKK......",
    ".....KFFFFK.....",
    "....KFFFFFFK....",
    "....KFFFGGKK....",
    "...KKFFFFGGKK...",
    "..KFFSSSSSFK....",
    "..KFFSESSEK.....",
    "..KFFSRRRRFK....",
    "..KGRRRRRRRGK...",
    "..KWWRRRRWWK....",
    ".KWWCCCCCCWWK...",
    ".KCCKCCCCKCCCK..",
    ".KCCKCCCCCKCCK..",
    ".KCCKCCCCCKCCK..",
    ".KMCKCCCCCKmCK..",
    ".KMMKDDDDDKmMK..",
    "..KKCCCCCCCCK...",
    "...KCCCCCCCCK...",
    "...KCCCCCCCCK..."
  ];

  // -------------------- ТРИ ЧЕТВЕРТИ, СПИНА (bleft, dir 2) --------------------
  // Затылок-профиль, шов тульи, дальняя рука в тени.
  var B_BLEFT = [
    "................",
    "......KKKK......",
    ".....KFFFFK.....",
    "....KFFFFFFK....",
    "....KFFFGGKK....",
    "...KKFFFFGGKK...",
    "..KFFKGGGGK.....",
    "..KFFGGGGGGK....",
    "..KFFGGWWGGK....",
    "...KKGGGGKK.....",
    "...KWWWWWWWK....",
    ".KWWCCCCCCWWK...",
    ".KCCKCCCCKCCCK..",
    ".KCCKCCCCCKCCK..",
    ".KCCKCCCCCKCCK..",
    ".KMCKCCCCCKmCK..",
    ".KMMKDDDDDKmMK..",
    "..KKCCCCCCCCK...",
    "...KCCCCCCCCK...",
    "...KCCCCCCCCK..."
  ];

  // -------------------- НОГИ, вид спереди/сзади --------------------
  // Стоя: обе валенки на земле. Шаг: правая (левая) нога приподнята,
  // вторая поза — зеркало первой (флаг flip в LEGS).
  var L_FRONT_IDLE = [
    "....KPPKKPPK....",
    "....KPPKKPPK....",
    "...KVVVK.KVVVK..",
    "...KvvvK.KvvvK.."
  ];
  var L_FRONT_W1 = [
    "....KPPKKPPK....",
    "....KPPKKPPK....",
    "...KVVVK.KVvVK..",
    "...KvvvK........"
  ];

  // -------------------- НОГИ, три четверти --------------------
  var L_FLEFT_IDLE = [
    "....KPPKKPPK....",
    "....KPPKKPPK....",
    "...KVVVK.KVVVK..",
    "...KvvvK.KvvvK.."
  ];
  var L_FLEFT_W1 = [      // ближняя (левая) нога шагает вперёд-вниз
    "...KPPK..KPPK...",
    "..KPPK...KPPK...",
    ".KVVVK...KVvVK..",
    ".KvvvK.........."
  ];
  var L_FLEFT_W2 = [      // дальняя нога переносится
    "....KPPK.KPPK...",
    "....KPPK..KPPK..",
    "....KvvvK.KVVVK.",
    "..........KvvvK."
  ];

  // -------------------- НОГИ, профиль --------------------
  var L_LEFT_IDLE = [
    "....KPPPPK......",
    "....KPPPPK......",
    "..KVVVVVVK......",
    "..KvvvvvvK......"
  ];
  var L_LEFT_W1 = [       // ближняя нога вперед (носок влево)
    "...KPPK.KPPK....",
    "..KPPK..KPPK....",
    ".KVVVK..KVvVK...",
    ".KvvvK.........."
  ];
  var L_LEFT_W2 = [       // дальняя нога вперед
    "...KPPK.KPPK....",
    "..KPPK..KPPK....",
    ".KvvvK..KVvVK...",
    "........KvvvK..."
  ];

  // Таблица наборов ног для стоячего актора:
  //  w2 у front/back — зеркало w1 (flip), у профилей — своя карта.
  var LEGS = {
    front: {
      idle: { rows: L_FRONT_IDLE },
      w1:   { rows: L_FRONT_W1 },
      w2:   { rows: L_FRONT_W1, flip: true }
    },
    back: {
      idle: { rows: L_FRONT_IDLE },
      w1:   { rows: L_FRONT_W1 },
      w2:   { rows: L_FRONT_W1, flip: true }
    },
    fleft: {
      idle: { rows: L_FLEFT_IDLE },
      w1:   { rows: L_FLEFT_W1 },
      w2:   { rows: L_FLEFT_W2 }
    },
    bleft: {
      idle: { rows: L_FLEFT_IDLE },
      w1:   { rows: L_FLEFT_W1 },
      w2:   { rows: L_FLEFT_W2 }
    },
    left: {
      idle: { rows: L_LEFT_IDLE },
      w1:   { rows: L_LEFT_W1 },
      w2:   { rows: L_LEFT_W2 }
    }
  };

  var BODY = {
    front: B_FRONT,
    back:  B_BACK,
    left:  B_LEFT,
    fleft: B_FLEFT,
    bleft: B_BLEFT
  };

  // ====================================================================
  //  КАРТЫ: ПРИСЕД (16x20 логических, scale 2 -> 32x40)
  //  Согнутая спина, голова ниже, ноги согнуты — «чуть ниже» роста.
  // ====================================================================

  var S_FRONT = [
    "................",
    "......KKKK......",
    ".....KFFFFK.....",
    "....KFGGGGFK....",
    "...KKFFFFFFKK...",
    "..KFFKSSSSKFFK..",
    "..KFFSESSESFFK..",
    "..KFFSRRRRSFFK..",
    "..KGRRRRRRRRGK..",
    "..KWWRRRRRRWWK..",
    ".KWWCCCCCCCCWWK.",
    "KCCCCCCCCCCCCCK.",
    "KMCCCDDDDCCCMK..",
    "KMMCDDDDDDCMMK..",
    "..KKCCCCCCCCKK..",
    "...KCCCCCCCCK..."
  ];
  var S_LEFT = [
    "................",
    "......KKKK......",
    ".....KFFFFK.....",
    "....KFFFGGGK....",
    "...KKFFFFGGKK...",
    "..KSSKFFFGGGK...",
    ".KSESKFFFGGK....",
    ".KSRRKFFFGGK....",
    ".KRRRRKGGGGK....",
    "..KWWKGGGGK.....",
    ".KWWCCCCCCGK....",
    "KCCCCCCCCCGK....",
    "KMCCCDDCCCGK....",
    "KMMCDDDDDGK.....",
    "..KKCCCCCGK.....",
    "..KCCCCCCCK....."
  ];
  var S_BACK = [
    "................",
    "......KKKK......",
    ".....KFFFFK.....",
    "....KGGGGGGK....",
    "...KKFGGGGFKK...",
    "..KFFKGGGGKFFK..",
    "..KFFGGGGGGFFK..",
    "..KFFGGWWGGFFK..",
    "...KKGGGGGGKK...",
    "...KWWWWWWWWK...",
    ".KWWCCCCCCCCWWK.",
    "KCCCCCCCCCCCCCK.",
    "KMCCCDDDDCCCMK..",
    "KMMCDDDDDDCMMK..",
    "..KKCCCCCCCCKK..",
    "...KCCCCCCCCK..."
  ];

  var SL_FRONT_IDLE = [
    "....KPPKKPPK....",
    "....KPPKKPPK....",
    "...KVvVK.KVvVK..",
    "...KvvvK.KvvvK.."
  ];
  var SL_FRONT_W1 = [
    "...KPPK..KPPK...",
    "..KPPK...KPPK...",
    ".KVvVK...KVvVK..",
    ".KvvvK.........."
  ];
  var SL_LEFT_IDLE = [
    "....KPPPPK......",
    "....KPPPPK......",
    "..KVvVVVK.......",
    "..KvvvvvK......."
  ];
  var SL_LEFT_W1 = [
    "...KPPK.KPPK....",
    "..KPPK..KPPK....",
    ".KVvVK..KVvVK...",
    ".KvvvK.........."
  ];
  var SL_LEFT_W2 = [
    "...KPPK.KPPK....",
    "..KPPK..KPPK....",
    ".KvvvK..KVvVK...",
    "........KvvvK..."
  ];

  var SLEGS = {
    front: {
      idle: { rows: SL_FRONT_IDLE },
      w1:   { rows: SL_FRONT_W1 },
      w2:   { rows: SL_FRONT_W1, flip: true }
    },
    back: {
      idle: { rows: SL_FRONT_IDLE },
      w1:   { rows: SL_FRONT_W1 },
      w2:   { rows: SL_FRONT_W1, flip: true }
    },
    left: {
      idle: { rows: SL_LEFT_IDLE },
      w1:   { rows: SL_LEFT_W1 },
      w2:   { rows: SL_LEFT_W2 }
    }
  };

  var SBODY = {
    front: S_FRONT,
    left:  S_LEFT,
    back:  S_BACK
  };

  // ====================================================================
  //  КАРТЫ: СОН (26x14, scale 2 -> 52x28)
  //  Лежит на боку, голова слева в ушанке, накрыт тулупом, валенки справа.
  //  Кадр 1: глаза закрыты (s), грудь на вдохе (LL).
  // ====================================================================
  var SLEEP0 = [
    "..........................",
    "...KKKK...................",
    "..KFFFFK..................",
    "..KFGGGGFK................",
    "...KKSSSSKKK..............",
    "..KSESSKCCCCCCK...........",
    "..KSRRKCCCCCCCCKK.........",
    "...KKCCCCCCCCCCCCCKK......",
    "....CCCCCCCCCCCCCCCKK.....",
    "....CCCCCCCCCCCCCKPPKK....",
    "...CCCCCCCCCCCCCKPPPVVK...",
    "..DDDDDDDDDDDDDDDDDDDDDDD.",
    "..........................",
    ".........................."
  ];
  var SLEEP1 = [
    "..........................",
    "...KKKK...................",
    "..KFFFFK..................",
    "..KFGGGGFK................",
    "...KKSSSSKKK..............",
    "..KSsSSKCCCCCCK...........",
    "..KSRRKCCCCCCCCKK.........",
    "...KKCCCLLCCCCCCCCKK......",
    "....CCCCLLCCCCCCCCCKK.....",
    "....CCCCCCCCCCCCCKPPKK....",
    "...CCCCCCCCCCCCCKPPPVVK...",
    "..DDDDDDDDDDDDDDDDDDDDDDD.",
    "..........................",
    ".........................."
  ];

  // ====================================================================
  //  КАРТЫ: ТРУП ИГРОКА (26x14)
  //  Лежит на спине: глаза открыты (E), шапка свалилась рядом,
  //  кровь (X) расползается снизу-слева (дополняется спрайтом blood_pool).
  // ====================================================================
  var DEAD = [
    "..........................",
    "....KKKK..................",
    "...KFFFFK....KKKK.........",
    "..KFGGGGFK..KSSSSK........",
    "...........KSESESK........",
    "..........KSSRRKCCCCCK....",
    "XX.......KRRRRKCCCCCCCCK..",
    ".XXX.....KRRRRKCCCCCCCCK..",
    "..XXXX...KKKKCCCCCCCCCCKK.",
    ".XXXXXX...KKCCCCCCCCKPPPVK",
    "..XXXX....KKKKKKKKKKKKKK..",
    "..........................",
    "..........................",
    ".........................."
  ];

  // ====================================================================
  //  КАРТЫ: ТРУП ОБЩИЙ (24x12, 2 кадра)
  //  Припорошенная снегом тёмная масса: тулуп (D), снег (W).
  //  Кадр 1 — рука в рукавице торчит из-под сугроба (M).
  // ====================================================================
  var CORPSE0 = [
    "........................",
    "........................",
    "......KKKKK.............",
    "....KKDDDDDKK...........",
    "...KDDDDDDDDDK..........",
    "..KDDWWDDDDDDDKK........",
    ".KDDDDDDDDDDDDDDKK......",
    ".KDDDDDDDDDDDDDDDDDKK...",
    "KDDDDDDDDDDDDDDDDDDDDKK.",
    ".KKKKKKKKKKKKKKKKKKKKKK.",
    "........................",
    "........................"
  ];
  var CORPSE1 = [
    "........................",
    "........................",
    "......KKKKK.............",
    "....KKDDDDDKK...........",
    "...KDDDDDDDDDK..........",
    "..KDDDDWWDDDDDKK........",
    ".KDDDDDDDDDDDDDKK.......",
    ".KDDDDDDDDDDDDDDMMKK....",
    "KDDDDDDDDDDDDDDDDDDDKK..",
    ".KKKKKKKKKKKKKKKKKKKKK..",
    "........................",
    "........................"
  ];

  // ====================================================================
  //  КАРТЫ: УЗЕЛ-ПРЕДМЕТ (10x8) — дроп на земле до спрайтов предметов.
  // ====================================================================
  var DROP = [
    "....KK....",
    "...KCCK...",
    "..KCCCCK..",
    ".KBBCCCK..",
    "KCCCCCCCCK",
    "KCBBCCCCK.",
    ".KCCCCCCK.",
    "..KKKKKK.."
  ];

  // ====================================================================
  //  КАРТЫ: СЛЕД ВАЛЕНКА (10x6, scale 2 -> 20x12)
  //  Едва заметный, полупрозрачный. 2 кадра: левая/правая нога.
  //  Ориентация «носок вверх», поворот по dir делает диспетчер.
  // ====================================================================
  var FOOT0 = [
    "...AAAA...",
    "..AABBAA..",
    ".ABBBBBBA.",
    ".ABBBBBBA.",
    "..ABBBBA..",
    "...AAAA..."
  ];
  var FOOT1 = [
    "...AAAA...",
    "..AABBAA..",
    ".ABBBBBBA.",
    "..ABBBBA..",
    "..ABBBBA..",
    "...AAAA..."
  ];

  // ====================================================================
  //  МЕХАНИЗМ РЕГИСТРАЦИИ
  //  1) defPoseSet: каждый (вид x поза) склеивается (тело + ноги)
  //     и регистрируется НАСТОЯЩИМ WS.Spr.defmap под именем '#имя.вид.поза'.
  //  2) drawActor: диспетчер на WS.Spr.def выбирает подспрайт по dir/frame,
  //     зеркалит при необходимости, добавляет «подскок» на шаговых кадрах.
  // ====================================================================

  /** Зарегистрировать набор поз через WS.Spr.defmap. */
  function defPoseSet(prefix, bodyMap, legsMap) {
    for (var v in bodyMap) {
      if (!bodyMap.hasOwnProperty(v)) continue;
      for (var pi = 0; pi < POSES.length; pi++) {
        var pose = POSES[pi];
        var leg = legsMap[v] && legsMap[v][pose];
        if (!leg) continue;
        var rows = bodyMap[v].concat(leg.rows);
        Spr.defmap(prefix + v + '.' + pose, rows, PLEG, 2);
      }
    }
  }

  /** Отрисовать кадр актора: выбор вида по dir, позы по frame, зеркало. */
  function drawActor(c, W, H, frame, dir, prefix, dirview, legsMap) {
    var dv = dirview[(dir || 0) & 7];
    if (!dv) dv = dirview[0];
    var pose = FRAME_POSE[(frame || 0) & 3];
    var leg = legsMap[dv.v] && legsMap[dv.v][pose];
    if (!leg) leg = legsMap[dv.v].idle;
    var sub = Spr.get(prefix + dv.v + '.' + pose, 0, 0);
    if (!sub) return;
    var flip = (!!dv.f) !== (!!leg.flip);
    // на шаговых кадрах всё тело чуть подскакивает (1 логический пиксель)
    var bob = (pose === 'w1' || pose === 'w2') ? -2 : 0;
    c.save();
    if (flip) {
      c.translate(W, 0);
      c.scale(-1, 1);
    }
    c.drawImage(sub, 0, bob);
    c.restore();
  }

  // ---- игрок стоя: 8 направлений x 4 кадра ----
  defPoseSet('#player.', BODY, LEGS);
  Spr.def('player', {
    w: 32, h: 48,
    draw: function (c, W, H, frame, dir) {
      drawActor(c, W, H, frame, dir, '#player.', DIRVIEW_FULL, LEGS);
    }
  });

  // ---- игрок присев: те же направления, но три базовых вида ----
  defPoseSet('#sneak.', SBODY, SLEGS);
  Spr.def('player_sneak', {
    w: 32, h: 40,
    draw: function (c, W, H, frame, dir) {
      drawActor(c, W, H, frame, dir, '#sneak.', DIRVIEW_SNEAK, SLEGS);
    }
  });

  // ---- сон: 2 кадра дыхания, направление не важно ----
  Spr.defmap('#sleep.0', SLEEP0, PLEG, 2);
  Spr.defmap('#sleep.1', SLEEP1, PLEG, 2);
  Spr.def('player_sleep', {
    w: 52, h: 28,
    draw: function (c, W, H, frame) {
      var sub = Spr.get('#sleep.' + ((frame || 0) & 1), 0, 0);
      if (sub) c.drawImage(sub, 0, 0);
    }
  });

  // ---- труп игрока ----
  Spr.defmap('#dead.0', DEAD, PLEG, 2);
  Spr.def('player_dead', {
    w: 52, h: 28,
    draw: function (c) {
      var sub = Spr.get('#dead.0', 0, 0);
      if (sub) c.drawImage(sub, 0, 0);
    }
  });

  // ---- труп общий (зверь/бандит до своих спрайтов) ----
  Spr.defmap('#corpse.0', CORPSE0, CLEG, 2);
  Spr.defmap('#corpse.1', CORPSE1, CLEG, 2);
  Spr.def('corpse_generic', {
    w: 48, h: 24,
    draw: function (c, W, H, frame) {
      var sub = Spr.get('#corpse.' + ((frame || 0) & 1), 0, 0);
      if (sub) c.drawImage(sub, 0, 0);
    }
  });

  // ---- узел-предмет на земле ----
  Spr.defmap('drop_generic', DROP, DLEG, 2);

  // ---- след на снегу: 2 ноги + поворот по направлению ----
  Spr.defmap('#foot.0', FOOT0, FLEG, 2);
  Spr.defmap('#foot.1', FOOT1, FLEG, 2);
  Spr.def('footprint', {
    w: 20, h: 12,
    draw: function (c, W, H, frame, dir) {
      var sub = Spr.get('#foot.' + ((frame || 0) & 1), 0, 0);
      if (!sub) return;
      var ang = FP_ANG[(dir || 0) & 7];
      c.save();
      c.translate(W / 2, H / 2);
      c.rotate(ang);
      c.drawImage(sub, -W / 2, -H / 2);
      c.restore();
    }
  });

  // ====================================================================
  //  ЛУЖА КРОВИ — 3 стадии роста, рисуется программно (эллипсы + брызги).
  //  Детерминированно от номера кадра: спрайт кэшируется один раз.
  // ====================================================================
  Spr.def('blood_pool', {
    w: 56, h: 32,
    draw: function (c, W, H, frame) {
      var st = (frame || 0) % 3;
      var R = WS.RNG.mk(9001 + st * 37);
      var cx = W / 2, cy = H / 2 + 3;
      var rx = [10, 16, 23][st];
      var ry = rx * 0.55;
      Spr.ell(c, cx, cy, rx, ry, '#4f1414');                       // тёмный контур
      Spr.ell(c, cx - rx * 0.15, cy - 1, rx * 0.8, ry * 0.8, '#631a1a');
      Spr.ell(c, cx - 2, cy - 2, rx * 0.45, ry * 0.5, '#7a2020');  // блик
      // брызги по краям — больше на поздних стадиях
      var n = st * 3 + 2;
      for (var i = 0; i < n; i++) {
        var a = R.f() * Math.PI * 2;
        var d = rx * (0.75 + R.f() * 0.55);
        Spr.ell(c, cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.55,
                1.5 + R.f() * 3, 1 + R.f() * 2,
                R.f() < 0.5 ? '#631a1a' : '#7a2020');
      }
    }
  });

  // ====================================================================
  //  САМОПРОВЕРКА КАРТ (для отладки): все строки одной карты равной длины
  //  и состоят из символов легенды. Вызывается вручную из консоли.
  // ====================================================================
  function validate() {
    var bad = [];
    function check(rows, legend, name) {
      var w = rows[0] ? rows[0].length : 0;
      for (var y = 0; y < rows.length; y++) {
        var line = rows[y];
        if (line.length !== w) bad.push(name + ': строка ' + y + ' = ' + line.length + ' (нужно ' + w + ')');
        for (var x = 0; x < line.length; x++) {
          var ch = line.charAt(x);
          if (ch !== '.' && !legend[ch]) bad.push(name + ': символ "' + ch + '" не в легенде, строка ' + y);
        }
      }
    }
    var v;
    for (v in BODY) check(BODY[v], PLEG, 'BODY.' + v);
    for (v in LEGS) {
      for (var p in LEGS[v]) check(LEGS[v][p].rows, PLEG, 'LEGS.' + v + '.' + p);
    }
    for (v in SBODY) check(SBODY[v], PLEG, 'SBODY.' + v);
    for (v in SLEGS) {
      for (var q in SLEGS[v]) check(SLEGS[v][q].rows, PLEG, 'SLEGS.' + v + '.' + q);
    }
    check(SLEEP0, PLEG, 'SLEEP0');
    check(SLEEP1, PLEG, 'SLEEP1');
    check(DEAD, PLEG, 'DEAD');
    check(CORPSE0, CLEG, 'CORPSE0');
    check(CORPSE1, CLEG, 'CORPSE1');
    check(DROP, DLEG, 'DROP');
    check(FOOT0, FLEG, 'FOOT0');
    check(FOOT1, FLEG, 'FOOT1');
    return bad.length ? bad : 'ok';
  }

  // Небольшой публичный API для других модулей/отладки:
  // варианты персонажа, легенда, самопроверка, углы следов.
  WS.def('SprPlayer', {
    validate: validate,
    legend: PLEG,
    dirview: DIRVIEW_FULL,
    dirviewSneak: DIRVIEW_SNEAK,
    dirvec: DIRVEC,
    footAngle: FP_ANG,
    framePose: FRAME_POSE
  });
})();
