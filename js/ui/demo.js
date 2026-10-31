/**
 * demo.js — ДЕМО-ПРОХОЖДЕНИЕ («автопилот»). Кнопка «▶ Демо» в меню
 * запускает партию, которой управляет бот: он сам обустраивается,
 * выживает все 60 дней и в финале зажигает сигнальный костёр парохода.
 *
 * ЗАЧЕМ: это инструмент приёмки игры. Пользователь смотрит, как игра
 * «играется сама», и видит баги, дисбаланс и дыры в контенте. Всё, что
 * делает бот, пишется в ЖУРНАЛ ДЕМО (кнопка «⬇ Журнал» выгружает .txt).
 *
 * КАК ИГРАЕТ БОТ (честно, теми же вызовами, что и игрок):
 *   - ходьба — синтетические WASD через живую карту клавиш WS.Input
 *     (столкновения, шаги, шум, следы и дыхание — настоящие);
 *   - поиск пути — A* по проходимым тайлам, двери открывает [E]-методом;
 *   - обыск/еда/питьё/крафт/печь — те же API, что дергают экраны UI
 *     (WS.Loot.search, WS.Needs.eat/drink, WS.Craft.craft, WS.Fire...);
 *   - выстрелы — WS.Action.fireWeapon с наведением «мыши» на цель.
 *
 * СТРАТЕГИЯ (сид 1917, детерминированный мир):
 *   день 1  — обыск вокзала, переезд в тёплую избу (дым из трубы), экипировка;
 *   дни 2-54 — два похода за лутом в день, вода из снега у печи, сон в кровати,
 *              охота с винтовкой ради жира, 3 факела до дня 50;
 *   день 55 — «дым на реке»: мостки, сигнальный костёр (3 факела);
 *   день 60 — пароход. Победа.
 *
 * Скорость демо ×10/×30/×60 (день ≈ 2.4/0.8/0.4 минуты реального времени
 * с учётом сна ×8). Панель демо: день, час, дело, журнал, скорость, стоп.
 */
(function () {
  'use strict';

  // ====================================================================
  //  КОНСТАНТЫ
  // ====================================================================

  var DEMO_SEED = 1917;                 // фиксированный мир — демо повторяемо
  var DEMO_PROF = 'telegraph';
  var DEMO_TRAITS = ['frostproof', 'patient', 'naive', 'insomniac'];

  var TICK_PRI = 59;                    // до игрока (60): клавиши успевают
  var THINK_EVERY = 0.22;               // сек реального времени между «мыслями»

  // АДАПТИВНАЯ СКОРОСТЬ ДЕМО. Движение в игре — реальное время, а часы
  // ускоряются множителем скорости: на ×60 переход через посёлок «стоит»
  // четыре игровых часа, и герой замерзает насмерть на полдороге.
  // Поэтому демо само выбирает темп:
  //   на улице  ×6  — поход выглядит живым, мороз честный;
  //   в доме  ×12  — обыски и быт;
  //   у печи / ожидание ×24 — согрелся и дальше;
  //   сон ×60  — ночь пролетает (внутренний ×8 сна умножается).
  var SP_WALK = 6, SP_INDOOR = 12, SP_WAIT = 24, SP_WARM = 60, SP_SLEEP = 60;
  var speedHold = 0;                    // сек до следующей смены темпа

  // пороги выживания (0..100)
  var EAT_AT = 48;
  var DRINK_AT = 48;
  var SLEEP_AT = 34;
  var WARM_AT = 36.6;                   // °C ядра — ниже ищем тепло немедленно
  var PANIC_COLD = 35.4;

  var SLEEP_HOUR = 21.4;                // лечь спать
  var WAKE_HOUR = 6.1;                  // встать
  var HOME_HOUR = 16.5;                 // возвращаться к вечеру (раньше —
                                        // темп ×2 удваивает цену мороза: при
                                        // ×12 час ходьбы = −4°)
  var WARM_UNTIL_H = 19.9;              // греться не позже — потом домой

  var FINAL_DAY = 55;                   // «дым на реке»
  var TORCHES_NEED = 3;
  var HUNT_FROM_DAY = 12;               // когда начинать охоту (если есть винтовка)

  // ЧЕСТНЫЙ РЕЖИМ: без выдуманных предметов. Раньше демо могло само выдать
  // факела (дыра баланса) — теперь это только явным флагом для отладки.
  var CHEAT_TORCHES = false;

  // что выбрасываем при перевесе (в порядке очереди)
  var JUNK = ['brick_broken', 'bone_old', 'bottle_empty', 'jar_empty', 'cup_clay',
    'plate_tin', 'spoon_wood', 'mug_tin', 'scrap_metal', 'nails', 'hay_bale',
    'letter_old', 'telegraph_form', 'chuni', 'lapti', 'porshni',
    'staple_iron', 'hinge_iron', 'tar_bucket', 'brick_stack', 'axle_wood'];
  // ВНИМАНИЕ: newspaper_stack и cloth_rag НЕ мусор — это трут для аварийного
  // костра (диагноз Д1: без трута экстренное тепло невозможно, бот замерзал)

  var FOOD_RISKY = {                    // не едим: отравление
    fresh_fish: 1, dough: 1, bad_mushroom: 1, meat_raw: 1, chicken: 1,
    giblets: 1, egg: 1, milk_bottle: 1, smetana: 1, tvorog: 1
  };

  var DRINK_IDS = ['water_flask', 'kvass_flask', 'compote', 'forest_tea'];

  // ====================================================================
  //  СОСТОЯНИЕ
  // ====================================================================

  var D = {
    active: false,
    pace: 1,                            // множитель темпа от игрока (×1/×2)
    curSpeed: 6,
    phase: 'intro',                     // intro | live | final | shipwait | done
    plan: [],                           // очередь задач
    task: null,
    path: [],                           // путевые точки [{x,y}]
    pathT: 0,                           // сколько сек идём по этому пути
    stuckT: 0,
    lastX: 0, lastY: 0,
    stuckCheckT: 0,
    rebuilds: 0,                          // подряд перестроек пути (анти-цикл)
    avoid: {},                            // id дверей, которые не открываются
    thinkT: 0,
    keysHeld: {},
    warmOK: false,                      // гистерезис тепла: недавно согрелись
    doorCd: 0,
    fireCd: 0,
    journal: [],                        // [{t, txt}]
    world: null,                        // скан мира
    base: null,                         // запись здания-базы
    watchIv: 0,                         // setInterval экрана контейнера
    contT: 0,
    huntsDone: 0,
    shotsDone: 0,
    melted: 0,
    fallbackUsed: false,                // выдал ли демо факелы принудительно
    dayMark: 0,
    panelT: 0,
    startedAt: 0,
    endedAt: 0,
    result: ''                          // 'victory' | 'death' | ''
  };

  // ====================================================================
  //  МАЛЫЕ УТИЛИТЫ
  // ====================================================================

  function G() { return WS.G || null; }
  function P() { var g = WS.G; return (g && g.player) || null; }
  function W() { return WS.World || null; }

  /** Детерминированный пикер вариаций фраз: демо повторяемо (без random). */
  var V = {
    n: 0,
    pick: function (a) { this.n++; return a[this.n % a.length]; }
  };

  /** Пачка фраз «обход препятствия» — раньше одна и та же повторялась 14+ раз. */
  var F_DETOUR = [
    'Обхожу препятствие — вежливо, но настойчиво',
    'Снег намёл — иду в обход',
    'Прямой дороги нет: путь вильнул, как провод на ветру',
    'Обхожу: даже вода зимой ищет, где обтечь',
    'Здесь не пройти — обойду, дело житейское',
    'Крюк по дуге: напрямик зимой не ездят'
  ];
  var F_DAY_VERYCOLD = ['Мороз-воевода обходит владенья.', 'Мороз такой, что железо звенит.', 'Стужа серьёзная: не день для прогулок к речке.'];
  var F_DAY_COLD = ['Мороз крепкий: чай стынет раньше, чем допьёшь.', 'Мороз деловой, без лишних разговоров.', 'Мороз крепкий — валенки скрипят, как половицы.'];
  var F_DAY_MILD = ['Терпимо: по местным меркам почти оттепель.', 'Сносно. Для этих широт — курорт.', 'Терпимо: на улице почти можно думать.'];
  var F_SEARCH = [
    'Обыск: {x} — опись имущества, протокол потом',
    'Заглядываю в {x}: что там после людей?',
    '{x}: перетряхиваю, как ревизор',
    'Обыск {x} — без ордера, суровые времена',
    '{x}: не барский сундук, но поглядим'
  ];
  var F_EAT = [
    'Поел: {x}. Сыт, как пристав на именинах',
    'Обед скромный, из одного слова: {x}',
    'Трапеза: {x}. Ресторация закрыта, обошлось домашней'
  ];
  var F_DRINK = [
    'Выпил: {x} — за упокой жажды',
    'Выпил: {x}. Не чай с баранками, но жить можно',
    'Выпил: {x} — фляга честно опустела'
  ];
  var F_STOVE = ['Затопил печь — дом ожил', 'Затопил печь: тепло по расписанию', 'Печь занялась — к вечеру здесь как в депо'];
  var F_HARVEST = [
    'Собрал: {x} — в хозяйстве всё пригодится',
    'Нарвал: {x}, как другой — яблок',
    'Урожай: {x}. Не малина, но сойдёт'
  ];
  var F_DOOR = [
    'Открыл дверь{x} — скрипу на весь околоток',
    'Дверь{x} поддалась: не заперто, и слава богу',
    'Распахнул{x}: вход — гвоздь программы'
  ];
  var F_SLEEP = [
    'Отбой. Кровать скрипит, но честная',
    'Спать. Глаза уже отбивают точку-тире',
    'Лёг спать: устал, как ямская лошадь',
    'Сон — единственный налог, который плачу охотно'
  ];
  var F_WAKE = [
    'Подъём! Контора не ждёт, зато печь ждёт',
    'Встал. Солнце не встало, а я — пожалуйста',
    'Подъём: телеграфист встаёт раньше аппарата',
    'Подъём. День начался — авось и кончится прилично'
  ];
  var F_LOOT = [
    'Забрал добычу: {x}, {n} наименований — опись прилагается',
    'До нитки: {n} наименований из {x}',
    'Хабар из {x}: {n} наименований. Не барыш, а жалованье'
  ];
  var F_MELT = [
    'Топлю снег: зима мало-помалу становится питьём',
    'Котелок на печи: снег примеряет роль чая',
    'Топлю снег. Алхимия без философского камня'
  ];
  var F_ICICLE = [
    'Сосулька пала: фляга полна',
    'Растопил сосульку — лёд сдался без переговоров',
    'Сосулька обратилась водой: фляга довольна'
  ];
  var F_CRAFT = [
    'Крафт: {x}. Гильдия не признала, а мороз признал',
    'Смастерил: {x}. Вчера телеграфист, сегодня мастер на все руки',
    'Изготовил {x}: руки ремесло помнят'
  ];
  var F_EQUIP = [
    'Переоделся: гардероб с чужого плеча, зато тёплый',
    'Приоделся: мохеровый шарф — вот и вся мода',
    'Обновил наряд: с иголочки, иголка нашлась в сундуке',
    'Переоделся. Светское общество не оценит — общества не осталось'
  ];
  var F_TAKEHAND = [
    'Взял в руки: {x}. Аппарат посерьёзнее телеграфного',
    'Взял: {x} — сталь честная',
    'В руки — {x}. Посмотрим, кто кого'
  ];
  var F_DROP = [
    'Выбросил лишнее: {x} — не дотащу и себя',
    'Оставил на снегу {x}: пусть лежит, авось кому сгодится',
    'Расстался с {x} без сожалений'
  ];

  /** Формат шаблона {x}/{n}. */
  function tpl(arr, vars) {
    var s = V.pick(arr);
    if (vars) s = s.replace(/\{x\}/g, vars.x || '').replace(/\{n\}/g, String(vars.n !== undefined ? vars.n : ''));
    return s;
  }

  function dist(ax, ay, bx, by) { var dx = bx - ax, dy = by - ay; return Math.sqrt(dx * dx + dy * dy); }
  function hourF() { return WS.Time ? WS.Time.hourF() : 8; }
  function dayN() { return WS.Time ? WS.Time.day() : 1; }
  function outsideTemp() {
    try { return WS.Weather.tempOutside(); } catch (e) { return -15; }
  }
  function invCount(id) {
    try { return WS.Inv.count(id) || 0; } catch (e) { return 0; }
  }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  function fmtTime() {
    var h = Math.floor(hourF()), m = Math.floor((hourF() - h) * 60);
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }

  /** Строка дня для журнала: «Д12 14:35». */
  function stamp() { return 'Д' + dayN() + ' ' + fmtTime(); }

  // ====================================================================
  //  ЖУРНАЛ ДЕМО
  // ====================================================================

  function log(txt, cls) {
    D.journal.push({ t: stamp(), txt: String(txt), cls: cls || '' });
    if (D.journal.length > 900) D.journal.shift();
    try {
      if (WS.Story && WS.Story.chron) WS.Story.chron('[демо] ' + txt, 'anom');
    } catch (e) { /* хроники не критичны */ }
    // озвучка важных реплик (тост/журнал — глазами, это — ушами)
    try {
      var demoVoiceOn = true;
      try { demoVoiceOn = WS.Options.get('voiceDemo') !== false; } catch (eOpt) { /* пусто */ }
      if (demoVoiceOn && WS.Voice && cls && (cls === 'good' || cls === 'bad')) {
        WS.Voice.say(String(txt).replace(/[⚠★✝⛰·—]/g, ' ').replace(/\s+/g, ' ').trim(), 'demo', cls === 'bad' ? 2 : 1);
      }
    } catch (eV) { /* пусто */ }
    updatePanelLog();
  }

  /** Итоговый текст журнала для выгрузки. */
  function journalText() {
    var g = G();
    var lines = [];
    lines.push('БЕЛОЕ БЕЗМОЛВИЕ — журнал демо-прохождения');
    lines.push('======================================');
    lines.push('Начало: ' + (D.startStamp || '?') +
      ' · профессия: телеграфист · зерно мира: ' + DEMO_SEED);
    lines.push('Скорость демо: адаптивная (ходьба ×' + SP_WALK + ', дом ×' + SP_INDOOR +
      ', сон ×' + SP_SLEEP + '), темп игрока ×' + D.pace + ' · результат: ' +
      (D.result === 'victory' ? 'ПОБЕДА — пароход пришёл' :
       D.result === 'death' ? 'герой погиб' : 'демо остановлено'));
    if (g) {
      var st = g.stats || {};
      lines.push('Дней прожито: ' + dayN() + '/60 · обыскано: ' + (st.containersLooted || 0) +
        ' · скрафчено: ' + (st.itemsCrafted || 0) + ' · волков убито: ' + (st.wolvesKilled || 0) +
        ' · оленей/зайцев: ' + (st.animalsHunted || 0));
    }
    lines.push('Выстрелов сделано: ' + D.shotsDone + ' · фляг воды растоплено: ' + D.melted +
      ' · изгнано мультяшек: ' + (function () { try { return WS.Imps ? WS.Imps.expelled() : 0; } catch (e) { return 0; } })() +
      (D.fallbackUsed ? ' · ФАКЕЛЫ ВЫДАНЫ ДЕМО-РЕЖИМОМ (чит — включён явным флагом)' : ''));
    lines.push('');
    for (var i = 0; i < D.journal.length; i++) {
      var j = D.journal[i];
      lines.push('[' + j.t + '] ' + j.txt);
    }
    return lines.join('\n');
  }

  function downloadJournal() {
    try {
      var blob = new Blob([journalText()], { type: 'text/plain;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'white-silence-demo-' + (D.result || 'log') + '.txt';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () {
        URL.revokeObjectURL(url);
        if (a.parentNode) a.parentNode.removeChild(a);
      }, 1500);
    } catch (e) {
      WS.err('demo: выгрузка журнала', e && e.message);
    }
  }

  // ====================================================================
  //  СКАН МИРА (после старта партии)
  // ====================================================================

  function buildingOf(x, y) {
    var w = W();
    if (!w || !w.buildings) return null;
    for (var i = 0; i < w.buildings.length; i++) {
      var b = w.buildings[i];
      if (x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) return b;
    }
    return null;
  }

  function scanWorld() {
    var w = W();
    if (!w) return null;
    var p = P();
    var sx = p ? p.x : 110, sy = p ? p.y : 110;

    // --- карта достижимости от точки старта (двери открываем, мебель —
    //    препятствие). Всё, что не достижимо — «запечатано» генератором:
    //    такие цели пропускаем и считаем (отчёт пользователю про баг мира).
    var reach = {};
    (function bfs() {
      var q = [{ x: Math.floor(sx), y: Math.floor(sy) }];
      reach[q[0].x + ',' + q[0].y] = 1;
      var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      while (q.length) {
        var c = q.shift();
        for (var d = 0; d < 4; d++) {
          var nx = c.x + dirs[d][0], ny = c.y + dirs[d][1];
          var k = nx + ',' + ny;
          if (reach[k]) continue;
          if (nx < 1 || ny < 1 || nx >= w.w - 1 || ny >= w.h - 1) continue;
          if (w.isTileBlocked(nx, ny)) continue;
          var obs = w.objsAt(nx, ny);
          var solid = false;
          if (obs) {
            for (var i = 0; i < obs.length; i++) {
              if (obs[i] && obs[i].solid && !obs[i].door) { solid = true; break; }
            }
          }
          if (solid) continue;
          reach[k] = 1;
          q.push({ x: nx, y: ny });
        }
      }
    })();
    function objReach(o) {
      var ox = Math.floor(o.x), oy = Math.floor(o.y);
      return !!(reach[(ox + 1) + ',' + oy] || reach[(ox - 1) + ',' + oy] ||
                reach[ox + ',' + (oy + 1)] || reach[ox + ',' + (oy - 1)]);
    }

    var bl = [], i, o;
    var sealedBeds = 0, sealedStoves = 0, sealedConts = 0;
    for (i = 0; i < w.buildings.length; i++) {
      var b = w.buildings[i];
      var rec = {
        b: b, id: b.id, type: b.type, x: b.x, y: b.y, w: b.w, h: b.h,
        heated: !!(WS.Roofs && WS.Roofs.isHeated && WS.Roofs.isHeated(b)),
        stove: null, bed: null, containers: [],
        door: (b.door && b.door[0]) ? { x: b.door[0].x + 0.5, y: b.door[0].y + 0.5 } : null,
        distSpawn: 0
      };
      rec.distSpawn = dist(sx, sy, b.x + b.w / 2, b.y + b.h / 2);
      bl.push(rec);
    }
    var icicles = [];
    for (i = 0; i < w.objects.length; i++) {
      o = w.objects[i];
      var owner = buildingOf(o.x, o.y);
      if (o.heat) {
        if (owner) for (var k = 0; k < bl.length; k++) {
          if (bl[k].b === owner) {
            if (!objReach(o)) sealedStoves++; else if (!bl[k].stove) bl[k].stove = o;
            break;
          }
        }
      } else if (String(o.sprName || '').indexOf('bed') === 0) {
        if (owner) for (k = 0; k < bl.length; k++) {
          if (bl[k].b === owner) {
            if (!objReach(o)) sealedBeds++; else if (!bl[k].bed) bl[k].bed = o;
            break;
          }
        }
      } else if (o.container) {
        if (!objReach(o)) { sealedConts++; continue; }
        if (owner) for (k = 0; k < bl.length; k++) {
          if (bl[k].b === owner) { bl[k].containers.push(o); break; }
        }
        if (!owner) {
          var street = {
            b: null, id: 'street_' + (o.x | 0) + '_' + (o.y | 0), type: 'street',
            x: o.x, y: o.y, w: 1, h: 1, heated: false, stove: null, bed: null,
            containers: [o], door: null, distSpawn: dist(sx, sy, o.x, o.y)
          };
          bl.push(street);
        }
      } else if (o.forage && o.forage.item === 'icicle_chunk') {
        if (objReach(o)) icicles.push(o);
      }
    }

    // база: тёплый дом с достижимой кроватью (и печью — не обязательно)
    var base = null;
    for (i = 0; i < bl.length; i++) {
      var c = bl[i];
      if (c.heated && c.bed && c.type !== 'hermit_hut') {
        if (!base || c.distSpawn < base.distSpawn) base = c;
      }
    }
    if (!base) {
      for (i = 0; i < bl.length; i++) {
        if (bl[i].bed && bl[i].type !== 'hermit_hut') { base = bl[i]; break; }
      }
    }

    // достижимый внутренний тайл каждого здания (центр может быть занят
    // мебелью — и A* «не найдёт путь» к дому). Берём ближайший к центру.
    for (i = 0; i < bl.length; i++) {
      var bb0 = bl[i];
      bb0.reachTile = null;
      var bd2 = 1e9;
      for (var yy0 = bb0.y; yy0 < bb0.y + bb0.h; yy0++) {
        for (var xx0 = bb0.x; xx0 < bb0.x + bb0.w; xx0++) {
          if (!reach[xx0 + ',' + yy0]) continue;
          var dd0 = dist(xx0 + 0.5, yy0 + 0.5, bb0.x + bb0.w / 2, bb0.y + bb0.h / 2);
          if (dd0 < bd2) { bd2 = dd0; bb0.reachTile = { x: xx0 + 0.5, y: yy0 + 0.5 }; }
        }
      }
    }

    // план лута: сначала база, потом от базы по радиусу
    var cx = base ? base.x : sx, cy = base ? base.y : sy;
    var loot = [];
    for (i = 0; i < bl.length; i++) {
      var bb = bl[i];
      if (bb.type === 'hermit_hut') continue;    // изба Акима — не трогаем
      for (var c2 = 0; c2 < bb.containers.length; c2++) {
        var o2 = bb.containers[c2];
        loot.push({ o: o2, d: dist(cx, cy, o2.x, o2.y), home: bb });
      }
    }
    loot.sort(function (a, b2) { return a.d - b2.d; });

    return {
      buildings: bl, base: base, loot: loot, icicles: icicles,
      sealed: { beds: sealedBeds, stoves: sealedStoves, containers: sealedConts }
    };
  }

  /** Ближайший не обысканный контейнер (для походов).
   *  Пока герой не в «полной» теплоте — сперва тёплые дома: обыск
   *  без риска замерзнуть. Потом — всё подряд по близости.
   *  НОВОЕ: при нехватке топлива — поленницы вперёд (дрова = жизнь зимой). */
  function nextLootTarget(n) {
    var p = P();
    var cold = p && (p.temp || 37) < 37.2;
    var out = [];
    var i;
    var fuelLow = (invCount('firewood_bundle') + invCount('plank') + invCount('log')) < 3;
    if (fuelLow) {
      // поленницы/дровяные запасы — приоритет (по имени контейнера)
      for (i = 0; i < D.world.loot.length && out.length < (n || 4); i++) {
        var tw = D.world.loot[i];
        if (!tw.o || tw.o.looted || tw.taken) continue;
        if (!/поленн|дров|костр/i.test(tw.o.name || '')) continue;
        out.push(tw);
      }
    }
    if (cold) {
      for (i = 0; i < D.world.loot.length && out.length < (n || 4); i++) {
        var t = D.world.loot[i];
        if (!t.o || t.o.looted || t.taken) continue;
        if (!t.home || !t.home.heated) continue;
        if (out.indexOf(t) >= 0) continue;
        if ((t.o._demoFail || 0) >= 2) { t.taken = true; continue; }
        out.push(t);
      }
    }
    for (i = 0; i < D.world.loot.length && out.length < (n || 4); i++) {
      var t2 = D.world.loot[i];
      if (!t2.o || t2.o.looted || t2.taken) continue;
      if (out.indexOf(t2) >= 0) continue;
      if ((t2.o._demoFail || 0) >= 2) { t2.taken = true; continue; }
      out.push(t2);
    }
    return out;
  }

  function markLootTaken(o) {
    for (var i = 0; i < D.world.loot.length; i++) {
      if (D.world.loot[i].o === o) { D.world.loot[i].taken = true; return; }
    }
  }

  // ====================================================================
  //  ПОИСК ПУТИ: A* по тайлам (8 направлений, без срезания углов)
  // ====================================================================

  function tilePassable(tx, ty, ignoreDoor) {
    var w = W();
    if (!w) return false;
    if (w.isTileBlocked(tx, ty)) return false;
    var objs = w.objsAt(tx, ty);
    if (objs) {
      for (var i = 0; i < objs.length; i++) {
        var o = objs[i];
        if (!o.solid) continue;
        if (o.door) {
          // дверь, которую бот не смог открыть (заперта) — непроходима
          if (D.avoid[o.id]) return false;
          if (ignoreDoor !== false) continue;   // дверь откроем на подходе
        }
        return false;
      }
    }
    return true;
  }

  /** Ближайший проходимый тайл к цели (когда сама цель занята). */
  function nearestPassable(tx, ty) {
    if (tilePassable(tx, ty)) return { x: tx, y: ty };
    for (var r = 1; r <= 6; r++) {
      for (var dy = -r; dy <= r; dy++) {
        for (var dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          if (tilePassable(tx + dx, ty + dy)) return { x: tx + dx, y: ty + dy };
        }
      }
    }
    return null;
  }

  /**
   * A*: возвращает массив путевых точек [{x,y}] (центры тайлов) или null.
   * Ограничение по расширениям — чтобы не подвесить кадр на дальних целях.
   */
  function findPath(fx, fy, tx, ty) {
    var w = W();
    if (!w) return null;
    var sx = Math.floor(fx), sy = Math.floor(fy);
    var gx = Math.floor(tx), gy = Math.floor(ty);
    var gTarget = nearestPassable(gx, gy);
    if (!gTarget) return null;
    gx = gTarget.x; gy = gTarget.y;
    if (sx === gx && sy === gy) return [{ x: gx + 0.5, y: gy + 0.5 }];

    var MW = w.w, MH = w.h;
    var open = [];                       // бинарная куча [f, idx]
    var came = new Int32Array(MW * MH).fill(-1);
    var gsc = new Float32Array(MW * MH).fill(Infinity);
    var closed = new Uint8Array(MW * MH);
    var inOpen = new Uint8Array(MW * MH);
    var idx = function (x, y) { return y * MW + x; };

    function push(i, f) {
      open.push([f, i]);
      inOpen[i] = 1;
      var c = open.length - 1;
      while (c > 0) {
        var par = (c - 1) >> 1;
        if (open[par][0] <= open[c][0]) break;
        var tmp = open[par]; open[par] = open[c]; open[c] = tmp;
        c = par;
      }
    }
    function pop() {
      var top = open[0];
      var last = open.pop();
      if (open.length) {
        open[0] = last;
        var c = 0;
        for (;;) {
          var l = c * 2 + 1, r = l + 1, m = c;
          if (l < open.length && open[l][0] < open[m][0]) m = l;
          if (r < open.length && open[r][0] < open[m][0]) m = r;
          if (m === c) break;
          var tmp = open[m]; open[m] = open[c]; open[c] = tmp;
          c = m;
        }
      }
      inOpen[top[1]] = 0;
      return top;
    }
    function h(x, y) {
      var dx = Math.abs(x - gx), dy = Math.abs(y - gy);
      return (dx + dy) + (Math.SQRT2 - 2) * Math.min(dx, dy);
    }

    var DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    var startI = idx(sx, sy);
    gsc[startI] = 0;
    push(startI, h(sx, sy));
    var expanded = 0;
    var found = -1;

    while (open.length) {
      var cur = pop();
      var ci = cur[1];
      if (closed[ci]) continue;
      closed[ci] = 1;
      var cxT = ci % MW, cyT = (ci / MW) | 0;
      if (cxT === gx && cyT === gy) { found = ci; break; }
      if (++expanded > 14000) break;

      for (var k = 0; k < 8; k++) {
        var nx = cxT + DIRS[k][0], ny = cyT + DIRS[k][1];
        if (nx < 1 || ny < 1 || nx >= MW - 1 || ny >= MH - 1) continue;
        if (!tilePassable(nx, ny)) continue;
        // диагональ без срезания углов
        if (DIRS[k][0] && DIRS[k][1]) {
          if (!tilePassable(cxT + DIRS[k][0], cyT) || !tilePassable(cxT, cyT + DIRS[k][1])) continue;
        }
        var ni = idx(nx, ny);
        if (closed[ni]) continue;
        var step = (DIRS[k][0] && DIRS[k][1]) ? Math.SQRT2 : 1;
        var ng = gsc[ci] + step;
        if (ng < gsc[ni]) {
          gsc[ni] = ng;
          came[ni] = ci;
          push(ni, ng + h(nx, ny));
        }
      }
    }

    if (found < 0) return null;
    var pts = [];
    var i = found;
    while (i !== startI && i >= 0) {
      pts.push({ x: (i % MW) + 0.5, y: ((i / MW) | 0) + 0.5 });
      i = came[i];
    }
    pts.reverse();
    if (!pts.length) return null;          // пустой путь = неудача
    // Последняя точка: сама цель — только если её тайл проходим. Цель часто
    // ЗАНЯТА объектом (печь, сундук, кровать): стоять В ней нельзя, и бот
    // вечно «вдавливался» в_collision краем. Иначе остаётся центр
    // подобранного проходимого тайла (стоим вплотную к цели — этого
    // достаточно: радиусы задач 1.2-1.8).
    if (pts.length && tilePassable(Math.floor(tx), Math.floor(ty))) {
      pts[pts.length - 1] = { x: tx, y: ty };
    }
    return pts;
  }

  // ====================================================================
  //  ДВИЖЕНИЕ: синтетические клавиши WASD
  // ====================================================================

  function setKeys(want) {
    if (!(WS.Input && WS.Input.keys)) return;
    var keys = WS.Input.keys();
    var code;
    for (code in D.keysHeld) {
      if (D.keysHeld.hasOwnProperty(code) && !want[code]) {
        keys[code] = false;
        delete D.keysHeld[code];
      }
    }
    for (code in want) {
      if (want.hasOwnProperty(code) && !D.keysHeld[code]) {
        keys[code] = true;
        D.keysHeld[code] = true;
      }
    }
  }

  function releaseKeys() { setKeys({}); }

  /** Одноразовое нажатие клавиши (через настоящее событие — для [E]). */
  function tapKey(code) {
    try {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: code, bubbles: true }));
      window.dispatchEvent(new KeyboardEvent('keyup', { code: code, bubbles: true }));
    } catch (e) { WS.err('demo: tapKey', e && e.message); }
  }

  /** Закрытая дверь на пути — открыть. */
  function doorAhead(p) {
    var w = W();
    if (!w) return null;
    var wp = D.path[0];
    if (!wp) return null;
    var ptx = Math.floor(p.x), pty = Math.floor(p.y);
    for (var cy = pty - 2; cy <= pty + 2; cy++) {
      for (var cx = ptx - 2; cx <= ptx + 2; cx++) {
        var objs = w.objsAt(cx, cy);
        if (!objs) continue;
        for (var i = 0; i < objs.length; i++) {
          var o = objs[i];
          if (o.door && !o.open && dist(p.x, p.y, o.x, o.y) < 1.6 &&
              dist(wp.x, wp.y, o.x, o.y) < 2.2) return o;
        }
      }
    }
    return null;
  }

  /** Ведём игрока по пути. Возвращает true, если ещё идём. */
  function driveMovement() {
    var p = P();
    if (!p || p.sleeping || !D.path.length) { releaseKeys(); return false; }
    var wp = D.path[0];
    var dx = wp.x - p.x, dy = wp.y - p.y;
    var d = Math.sqrt(dx * dx + dy * dy);
    if (d < 0.45) {
      D.path.shift();
      if (!D.path.length) { releaseKeys(); return false; }
      wp = D.path[0];
      dx = wp.x - p.x; dy = wp.y - p.y;
      d = Math.sqrt(dx * dx + dy * dy);
    }

    // дверь на пути
    if (D.doorCd > 0) D.doorCd -= 1 / 60;
    var door = doorAhead(p);
    if (door) {
      releaseKeys();
      if (D.doorCd <= 0) {
        var opened = false;
        try { opened = WS.Action.toggleDoor(door); } catch (e) { opened = false; }
        if (opened) {
          log(tpl(F_DOOR, { x: door.name ? ' (' + door.name.toLowerCase() + ')' : '' }));
        } else {
          // ЗАПЕРТО (или кто-то в проёме): раньше бот бился в дверь вечно —
          // «Обхожу препятствие» по кругу на 3+ часа. Теперь дверь помечаем
          // и перестраиваем путь МИМО неё.
          door._demoTries = (door._demoTries || 0) + 1;
          if (door._demoTries >= 2) {
            D.avoid[door.id] = 1;
            var lastWp = D.path[D.path.length - 1];
            var npD = findPath(p.x, p.y, lastWp.x, lastWp.y);
            if (npD && npD.length) {
              D.path = npD;
              log('Дверь заперта — обхожу с другой стороны');
            } else {
              dropTask('дверь заперта, пути нет');
            }
            return true;
          }
        }
        D.doorCd = 0.25;
      }
      return true;
    }

    // экранные оси из мирового вектора (изометрия 2:1):
    // screenX = 32*(dx-dy), screenY = 16*(dx+dy); D/S — плюс, A/W — минус
    var sx = 32 * (dx - dy), sy = 16 * (dx + dy);
    var len = Math.sqrt(sx * sx + sy * sy) || 1;
    var want = {};
    if (sx / len > 0.34) want.KeyD = true;
    if (sx / len < -0.34) want.KeyA = true;
    if (sy / len > 0.34) want.KeyS = true;
    if (sy / len < -0.34) want.KeyW = true;
    // НА УЛИЦЕ ВСЕГДА БЕГ (если есть дыхание): бег вдвое быстрее и
    // греет +3° — каждая минута на морозе стоит полградуса.
    var outsideNow = !!(W() && W().isInside && !W().isInside(p.x, p.y));
    if (D.path.length >= 2 && (p.breath || 1) > 0.45 && !p.sneaking &&
        (outsideNow || D.path.length > 5)) {
      want.ShiftLeft = true;
    }
    setKeys(want);
    return true;
  }

  /** Детект застревания: не двигаемся, хотя путь есть.
   *  Раньше боты бились в одно препятствие годами: перестройка пути A*
   *  возвращала ТОТ ЖЕ маршрут. Теперь считаем перестройки: после трёх —
   *  шаг вбок (расшевелить коллизию), после пяти — задачу долой. */
  function stuckCheck() {
    var p = P();
    if (!p || !D.path.length) { D.stuckT = 0; D.rebuilds = 0; return; }
    D.stuckCheckT -= 1 / 60;
    if (D.stuckCheckT > 0) return;
    D.stuckCheckT = 0.7;
    var moved = dist(p.x, p.y, D.lastX, D.lastY);
    D.lastX = p.x; D.lastY = p.y;
    if (moved < 0.18) {
      D.stuckT += 0.7;
      if (D.stuckT > 1.4) {
        D.rebuilds = (D.rebuilds || 0) + 1;
        var last = D.path[D.path.length - 1];
        if (D.rebuilds >= 5) {
          D.rebuilds = 0;
          D.stuckT = 0;
          dropTask('застрял, пропускаю цель');
          return;
        }
        if (D.rebuilds === 3) {
          // шаг вбок: выйти из «плотной» коллизии прямой командой
          try {
            var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
            var pickD = dirs[(D.rebuilds + last.x + last.y) & 3];
            D.path.unshift({ x: p.x + pickD[0] * 1.5, y: p.y + pickD[1] * 1.5 });
          } catch (e) { /* пусто */ }
        }
        var np = findPath(p.x, p.y, last.x, last.y);
        if (np && np.length) { D.path = np; D.stuckT = 0; log(V.pick(F_DETOUR)); }
        else { D.stuckT = 0; D.rebuilds = 0; dropTask('путь не найден, пропускаю'); }
      }
    } else {
      D.stuckT = 0;
      D.rebuilds = 0;
    }
  }

  // ====================================================================
  //  ЗАДАЧИ
  // ====================================================================

  function pushTask(t) { D.plan.push(t); }
  function unshiftTask(t) { D.plan.unshift(t); }
  function dropTask(why) {
    if (D.task && why) log('…' + why);
    D.task = null;
    D.path = [];
    releaseKeys();
  }
  function clearPlan(why) {
    D.plan = [];
    dropTask(why);
  }

  /** Задача «идти в точку». */
  function taskGoto(x, y, r, label) {
    return { type: 'goto', x: x, y: y, r: r || 0.6, label: label || null, t: 0, tx: x, ty: y };
  }

  /** Выполнение текущей задачи. Возвращает true, если задача ещё жива. */
  // потолок реального времени на задачу (страховка от вечных задач)
  var TASK_TIMEOUT = { search: 30, hunt: 120, fight: 90, beacon: 90, melt: 180, warm: 360, sleep: 99999, fish: 300, cookfish: 120, chopwood: 120, groundsearch: 150 };

  function runTask() {
    var t = D.task;
    var p = P();
    if (!p) return false;
    // ВОЗРАСТ ЗАДАЧИ — ПО НАСТЕННЫМ ЧАСАМ: раньше t.t += 1/60 выполнялся раз
    // в «мысль» (0.22 сек) и копился втрое медленнее реального времени — все
    // таймауты жили ×3.7 дольше задуманного («греться 40 сек» = 9 минут,
    // бот коченел у холодной печи полдня). Теперь возраст честный.
    if (!t._t0) t._t0 = performance.now();
    t.t = (performance.now() - t._t0) / 1000;

    // глобальный таймаут: ни одна задача не живёт дольше 6 минут
    var tLimit = TASK_TIMEOUT[t.type] || 360;
    if (t.t > tLimit) {
      log('Задача «' + taskName(t) + '» буксует — списываю в стол');
      return false;
    }

    switch (t.type) {
      case 'goto':
        if (!D.path.length) {
          var np = findPath(p.x, p.y, t.x, t.y);
          if (!np) {
            log('К ' + (t.label || ('(' + (t.x | 0) + ',' + (t.y | 0) + ')')) + ' не пробраться: сугробы против');
            if (t.o) t.o._demoFail = (t.o._demoFail || 0) + 1;
            return false;
          }
          D.path = np;
          // Цель может быть ЗАНЯТА объектом (кровать/печь/сундук): тогда
          // путь кончается на соседнем тайле, и «сырое» расстояние до цели
          // никогда не станет меньше радиуса — герой вдавливается в мебель.
          // Эффективная точка = последняя точка пути.
          var lastPt = np[np.length - 1];
          if (Math.abs(lastPt.x - t.x) > 0.01 || Math.abs(lastPt.y - t.y) > 0.01) {
            t.effX = lastPt.x; t.effY = lastPt.y;
          }
        }
        var doneG = dist(p.x, p.y, t.x, t.y) <= t.r ||
          (t.effX !== undefined && dist(p.x, p.y, t.effX, t.effY) <= Math.max(t.r, 0.55));
        if (doneG) { releaseKeys(); return false; }
        return true;

      case 'search': {
        var o = t.o;
        if (WS.World.objects.indexOf(o) < 0) return false;    // исчез
        t.tx = o.x; t.ty = o.y;
        var d = dist(p.x, p.y, o.x, o.y);
        // ПОРОГ 2.2 (был 1.35): тайл стояния рядом с мебелью может лежать
        // в 1.5-1.6 от ЦЕНТРА объекта — бот «ходил» к ящику, стоя вплотную,
        // и обыск не начинался никогда (диагноз Д2: 0 успешных обысков)
        if (d > 2.2) {
          if (!D.path.length) {
            var np2 = findPath(p.x, p.y, o.x, o.y);
            if (np2) D.path = np2;
            else { o._demoFail = (o._demoFail || 0) + 1; return false; }
          }
          return true;
        }
        releaseKeys();
        if (o.looted) return false;
        if (WS.ContScreen && WS.ContScreen.isOpen()) return true;   // смотрим добычу
        if (WS.Loot.isSearching && WS.Loot.isSearching()) return true;
        try {
          if (WS.Loot.search(o)) {
            log(tpl(F_SEARCH, { x: o.name || 'контейнер' }));
          } else {
            // обыск не начался (кто-то другой обыскивает?) — не виснем
            o._demoFail = (o._demoFail || 0) + 1;
            return false;
          }
        } catch (e) { return false; }
        return true;
      }

      case 'harvest': {
        var o2 = t.o;
        if (WS.World.objects.indexOf(o2) < 0) return false;
        var d2 = dist(p.x, p.y, o2.x, o2.y);
        if (d2 > 2.0) {
          if (!D.path.length) {
            var np3 = findPath(p.x, p.y, o2.x, o2.y);
            if (np3) D.path = np3; else return false;
          }
          return true;
        }
        releaseKeys();
        try { WS.Forage.tryHarvest(o2); } catch (e) { /* пусто */ }
        log(tpl(F_HARVEST, { x: o2.name || 'сосулька' }));
        return false;
      }

      case 'equip':
        releaseKeys();
        // ЛОГ ТОЛЬКО ПРИ РЕАЛЬНОЙ ЗАМЕНЕ: equipBest возвращает число замен,
        // раньше «Приоделся» писалось при каждом вызове — журнал тонул
        // в переодеваниях, которые не происходили (диагноз Д3-Д16)
        try { var eqN = WS.Action.equipBest(); if (eqN > 0) log(V.pick(F_EQUIP)); } catch (e) { /* пусто */ }
        return false;

      case 'eat':
        // одноразово: следующую трапезу спланирует nextActivity
        releaseKeys();
        eatBest();
        return false;

      case 'drink':
        // одноразово (раньше «не вышло» держало задачу вечно — и бот
        // стоял без воды до смерти)
        releaseKeys();
        drinkBest();
        return false;

      case 'sleep': {
        // дойти до кровати и спать до утра (днём — до untilMax)
        if (p.sleeping) {
          releaseKeys();
          // ЗАМЕРЗАЮЩЕМУ ВО СНЕ — ПОДКИНУТЬ ОГОНЬ (диагноз Д21: при −39°
          // «тёплый» дом без печи остывает, и герой умирает в кровати)
          if ((p.temp || 37) < 35.3) {
            var fireSl = (WS.Fire && WS.Fire.near) ? WS.Fire.near(p.x, p.y, 3) : null;
            if (!fireSl && D.base && D.base.stove) {
              if (lightStoveNow(D.base.stove)) {
                log('Проснулся от холода — печь занялась', 'warn');
              }
            }
            // СОН В САВАНЕ: огня нет, растопить нечем, а на ДВОРЕ ДЕНЬ —
            // вставать есть смысл (утром можно пойти за дровами). Ночью же
            // сон прокручивает часы быстрее стужи: лежать теплее, чем маяться
            // стоя (диагноз t09: ночь без сна → обмороки → 30.9° → смерть).
            var fuelLeft = invCount('firewood_bundle') + invCount('plank') + invCount('log');
            var hSl = hourF();
            if (!fireSl && fuelLeft === 0 && hSl >= 7 && hSl < 20.5) {
              try { WS.Needs.wake(); } catch (eW2) { /* пусто */ }
              D.noSleepUntil = performance.now() + 60000;
              log('День, а в доме ледяная тишина и ни полена: встаю искать топливо.', 'bad');
              return false;
            }
          }
          var h = hourF();
          // ДНЕВНАЯ ДРЕМКА (untilMax) — спит до своего срока: раньше dayDone
          // будил мгновенно ЛЮБОЙ дневной сон, и бот часами ложился-вставал
          // каждые 4 минуты (диагноз Д8: 20 укладок подряд, истощение)
          var dayDone = (h >= WAKE_HOUR && h < 20 && !t.untilMax);
          var napDone = (t.untilMax && h >= t.untilMax);
          if (dayDone || napDone || (p.needs.fatigue || 0) > 97) {
            try { WS.Needs.wake(); log(V.pick(F_WAKE) + ' ' + greetDay()); } catch (e) { /* пусто */ }
            return false;
          }
          return true;
        }
        var bed = t.bed || (D.base && D.base.bed);
        if (bed && dist(p.x, p.y, bed.x, bed.y) > 1.6) {
          if (!D.path.length) {
            var np4 = findPath(p.x, p.y, bed.x, bed.y);
            if (np4) D.path = np4; else return false;
          }
          return true;
        }
        releaseKeys();
        var r = WS.Needs.trySleep();
        if (r && r.ok) { log(V.pick(F_SLEEP) + (r.kind === 'bed' ? ' (в кровать)' : '')); return true; }
        return false;
      }

      case 'melt': {
        // стоим у печи, топим фляги/сосульки
        releaseKeys();
        var stove = t.stove || (D.base && D.base.stove);
        if (!stove) return false;
        var ds = dist(p.x, p.y, stove.x, stove.y);
        if (ds > 2.0) {
          if (!D.path.length) {
            var np5 = findPath(p.x, p.y, stove.x, stove.y);
            if (np5) D.path = np5; else return false;
          }
          return true;
        }
        // огонь нужен
        var fire = (WS.Fire && WS.Fire.near) ? WS.Fire.near(p.x, p.y, 2.5) : null;
        if (!fire) {
          var lr = lightStoveNow(stove);
          if (!lr) {
            // без дров/спичек растапливать нельзя: пауза 4 минуты,
            // приоритет — поход за дровами (поленница у крыльца)
            D.meltFailUntil = performance.now() + 240000;
            log('Растопка не вышла: печь требует дров, как чиновник — справку. Иду за топливом.', 'warn');
            return false;
          }
          return true;                    // зажгли — в следующий тик начнём таять
        }
        // сосульки — мгновенно
        if (invCount('icicle_chunk') > 0) {
          try {
            if (WS.Forage.meltSnow && WS.Forage.meltSnow()) {
              D.melted++;
              log(V.pick(F_ICICLE));
              return true;
            }
          } catch (e) { /* пусто */ }
        }
        // пустые фляги — 15 игровых минут каждая
        if (invCount('flask_empty') > 0 && !(p._melt)) {
          try {
            var mr = WS.Fire.meltSnow ? WS.Fire.meltSnow() : null;
            if (mr && mr.ok) { log(V.pick(F_MELT)); return true; }
            if (mr && mr.reason) log('Снег не поддался: ' + mr.reason);
          } catch (e) { /* пусто */ }
        }
        if (p._melt) return true;         // процесс идёт
        // всё, что могли, — растопили; подкинуть дров не нужно — печь догорит
        return false;
      }

      case 'craft': {
        releaseKeys();
        var id = t.id;
        var r6 = null;
        try { r6 = WS.Craft.craft(id); } catch (e) { return false; }
        if (r6 && r6.ok) {
          var rec = WS.Craft.recipe(id);
          log(tpl(F_CRAFT, { x: rec ? rec.name : id }));
          t.made = (t.made || 0) + 1;
          return t.made < (t.n || 1);      // ждём завершения работы в фоне
        }
        return false;
      }

      case 'craftwait':
        releaseKeys();
        return WS.Craft.isCrafting();

      case 'fish': {
        // у проруби: заброс → поклёвка → подсечка, casts раз
        var hole = t.hole;
        var rawF = invCount('fresh_fish') + invCount('pike_raw') + invCount('burbot_raw');
        if (!hole || (t.casts || 0) <= 0 || countFood() + rawF >= 6) return false;
        if (hole.frozen) { log('Прорубь взялась ледком — рыба спит под одеялом.'); return false; }
        var dfh = dist(p.x, p.y, hole.x, hole.y);
        if (dfh > 1.4) {
          if (!D.path.length) {
            var npF = findPath(p.x, p.y, hole.x, hole.y);
            if (npF) D.path = npF; else return false;
          }
          return true;
        }
        releaseKeys();
        var fs = (WS.Fishing && WS.Fishing.session) ? WS.Fishing.session() : null;
        if (!fs) {
          try {
            var rc = WS.Fishing.startCast(hole);
            if (!rc) return false;
          } catch (e) { return false; }
          return true;
        }
        if (fs.phase === 'bite') {
          try { WS.Fishing.hookFish(); } catch (e) { /* пусто */ }
          t.casts = (t.casts || 0) - 1;
          return true;
        }
        return true;                        // ждём поклёвку
      }

      case 'cookfish': {
        // сырая рыба → печёная (станция fire: печь должна гореть)
        releaseKeys();
        if (invCount('fresh_fish') < 1) return false;
        var fireC = (WS.Fire && WS.Fire.near) ? WS.Fire.near(p.x, p.y, 2.5) : null;
        var stoveC = t.stove || (D.base && D.base.stove);
        if (!fireC && stoveC) {
          if (lightStoveNow(stoveC)) return true;   // зажгли — следующий тик крафт
          return false;                             // нечем топить — не стоять
        }
        if (!fireC) return false;
        try {
          var rf = WS.Craft.craft('cooked_fish');
          if (rf && rf.ok) { log('Печёная рыба: уха без ухи, зато калории на месте.'); return true; }
          if (rf && rf.reason) log('Рыба не печётся: ' + rf.reason, 'warn');
        } catch (e) { /* пусто */ }
        return false;
      }

      case 'warm': {
        // погреться: внутри тёплого дома / у печи / у костра до 36.6°
        releaseKeys();
        var tempW = p.temp || 37;
        var hW = hourF();
        // ИГРОВОЙ ТАЙМ-АУТ: при ×120 час реального времени = два игровых часа,
        // и «греться до 36.6» растягивалось на полдня (голод/жажда шли, а
        // вечер наставал в пути). Больше 1.5 игровых часов не греемся.
        if (t._h0 === undefined) t._h0 = WS.Time ? (WS.Time.day() * 24 + hourF()) : hW;
        var gameH = WS.Time ? (WS.Time.day() * 24 + hourF()) : hW;
        var warmGameH = gameH - t._h0;
        // выход из задачи: согрелись / долго / поздно. КРИТИЧЕСКИЙ ХОЛОД
        // (< 34.6°) лимит 1.5 ч ИГНОРИРУЕТ — бросать согревание на морозе
        // нельзя (раньше задача срывалась именно тогда, когда была нужна)
        if (tempW >= 36.6 || t.t > 300 || hW >= WARM_UNTIL_H || (hW < 5 && t.t > 45) ||
            (warmGameH > 1.5 && tempW >= 34.6)) return false;
        // зайти в точку укрытия
        if (t.spot && dist(p.x, p.y, t.spot.x, t.spot.y) > 1.4) {
          if (!D.path.length) {
            var npW = findPath(p.x, p.y, t.spot.x, t.spot.y);
            if (npW) D.path = npW; else return false;
          }
          return true;
        }
        // печь — только если она в ЭТОМ же укрытии (не через полпосёлка!)
        var stoveW = t.stove || null;
        if (!stoveW && t.spot && D.base && D.base.stove &&
            dist(t.spot.x, t.spot.y, D.base.stove.x, D.base.stove.y) < 8) {
          stoveW = D.base.stove;
        }
        if (stoveW && dist(p.x, p.y, stoveW.x, stoveW.y) > 1.6) {
          if (!D.path.length) {
            var np6 = findPath(p.x, p.y, stoveW.x, stoveW.y);
            if (np6) D.path = np6; else return false;
          }
          return true;
        }
        // у печи: не горит — разжечь (в тёплом доме это ещё и радиант)
        var fire2 = (WS.Fire && WS.Fire.near) ? WS.Fire.near(p.x, p.y, 2.5) : null;
        if (!fire2 && stoveW) {
          if (lightStoveNow(stoveW)) return true;   // зажгли — греемся
        }
        // печи нет/не зажглась, а холод уже серьёзный (< 36°) — костёр прямо
        // в доме (гранарий без печи: раньше бот медленно остывал под крышей
        // насмерть, имея спички и трут в кармане)
        if (!fire2 && (p.temp || 37) < 36.0 && emergencyCampfire()) {
          return true;                              // огонь горит — греемся
        }
        // БЕЗ ОГНЯ: не стоять вечно, но и не уходить умирать на улицу
        if (!fire2) {
          // огня НЕ БУДЕТ (нечем разводить) — сидеть бессмысленно:
          // сразу за топливом (диагноз роя: 240 сек «пережидания» при
          // пустых карманах = замерзание на месте)
          if (!canBurn()) return false;
          // критический холод под крышей (+5°C) — пережидаем до 240 сек
          if (insideBuilding() && (p.temp || 37) < 34.5 && t.t < 240) return true;
          if (t.t > 40) {
            if (!D._saidNoFire) {
              D._saidNoFire = true;
              log('Без огня дом — четыре стены с амбициями. Ищу топливо.', 'warn');
            }
            return false;
          }
          return true;
        }
        return true;                       // огонь горит — стоим, греемся
      }

      case 'groundsearch': {
        // ищем топливо под снегом (5 сек за попытку, n попыток).
        // НАШЛИ ГОРИМОЕ — сразу стоп: спасение разожжёт костёр немедленно,
        // искать «про запас» на вету — минус градусы (диагноз роя №12)
        if (canBurn()) return false;
        // САМООТМЕНА: при < 33.8° стоять на ветру дороже бересты
        if ((p.temp || 37) < 33.2) return false;
        releaseKeys();
        if ((t.n || 0) <= 0) return false;
        if (WS.Forage.isSearching && WS.Forage.isSearching()) return true;
        // ЦЕЛЬ ПОИСКА — ближайший уличный снежный тайл, а не «свой» тайл:
        // стоя на краю дороги, бот искал в дороге и получал «здесь искать
        // нечего» все раунды подряд (диагноз роя №14)
        var tgt2 = nearestOutdoorTile();
        if (!tgt2) return false;
        if (dist(p.x, p.y, tgt2.x, tgt2.y) > 2.2) {
          if (!D.path.length) {
            var npG = findPath(p.x, p.y, tgt2.x, tgt2.y);
            if (npG) D.path = npG; else return false;
          }
          return true;
        }
        var rG = WS.Forage.searchGroundAt(Math.floor(tgt2.x), Math.floor(tgt2.y));
        if (rG) {
          t.n = (t.n || 0) - 1;
          return true;
        }
        return false;                       // и здесь не ищется — выходим
      }

      case 'chopwood': {
        // у дерева: рубить ветки (нужен топор, ~20 с, бревно+лапник).
        // НА МОРОЗЕ НЕ РУБИМ: рубка — 45 секунд стояния, при < 34.6° это
        // замерзание с топором в руках (диагноз роя: бот рубил при 31°)
        var tw = t.o;
        if (!tw || WS.World.objects.indexOf(tw) < 0) return false;
        var dTw = dist(p.x, p.y, tw.x, tw.y);
        if (dTw > 2.0) {
          if (!D.path.length) {
            var npT = findPath(p.x, p.y, tw.x, tw.y);
            if (npT) D.path = npT; else return false;
          }
          return true;
        }
        releaseKeys();
        if (WS.Forage.isChopping && WS.Forage.isChopping()) {
          if ((p.temp || 37) < 34.6) {
            // бросаем начатое: жизнь дороже полена
            return false;
          }
          return true;
        }
        if ((p.temp || 37) < 35.2) return false;   // холодно — сперва тепло
        var rCh = WS.Forage.tryChopTree(tw);
        if (rCh) { log('Топор поёт: рублю ветки — печь будет сыта.'); return true; }
        return false;
      }

      case 'wait':
        releaseKeys();
        return t.t < (t.sec || 2);

      case 'hunt': {
        var tgt = t.ent;
        if (!tgt || tgt.dead || tgt.hp <= 0 || !WS.World.ents.indexOf(tgt) || WS.World.ents.indexOf(tgt) < 0) {
          // цель ушла/мертва — подобрать трофей?
          if (t.corpse) return false;
          return false;
        }
        var dd = dist(p.x, p.y, tgt.x, tgt.y);
        if (dd > 14 || dd < 1.2) {
          // подойти на выстрел
          if (!D.path.length || D.path.length === 0) {
            var np7 = findPath(p.x, p.y, tgt.x, tgt.y);
            if (np7) D.path = np7.slice(0, Math.max(1, np7.length - 8));
          }
          if (dd < 1.2) { releaseKeys(); return true; }
          return true;
        }
        releaseKeys();
        // целиться и стрелять
        if (fireShot(tgt)) {
          return true;
        }
        // нечем стрелять — отбой
        return false;
      }

      case 'fight': {
        // рукопашная с угрозой (топор/нож — когда огнестрела нет)
        var tgtF = t.ent;
        if (!tgtF || tgtF.dead || tgtF.hp <= 0 || !WS.World.ents || WS.World.ents.indexOf(tgtF) < 0) {
          if (tgtF && tgtF.dead) log('Угроза повержена — можно выдыхать', 'good');
          return false;
        }
        var ddF = dist(p.x, p.y, tgtF.x, tgtF.y);
        if (ddF > 2.0) {
          if (!D.path.length) {
            var npF = findPath(p.x, p.y, tgtF.x, tgtF.y);
            if (npF) D.path = npF; else return false;
          }
          return true;
        }
        releaseKeys();
        // навести «мышь» и бить (кулаками тоже лучше, чем ничего)
        try {
          var mF = WS.Input.mouse();
          mF.wx = tgtF.x; mF.wy = tgtF.y;
          mF.tx = Math.floor(tgtF.x); mF.ty = Math.floor(tgtF.y);
          WS.Action.meleeAttack();
        } catch (e) { /* пусто */ }
        return true;
      }

      case 'beacon': {
        // сигнальный костёр на мостках
        var pier = (WS.Story && WS.Story.pier) ? WS.Story.pier() : null;
        if (!pier) return false;
        var dp = dist(p.x, p.y, pier.x, pier.y);
        if (dp > 1.8) {
          if (!D.path.length) {
            var np8 = findPath(p.x, p.y, pier.x, pier.y);
            if (np8) D.path = np8; else return false;
          }
          return true;
        }
        releaseKeys();
        var q = (WS.Story && WS.Story.finalQuest) ? WS.Story.finalQuest() : null;
        if (q && q.lit) return false;
        if ((q ? q.torches : invCount('torch')) < TORCHES_NEED) return false;
        tapKey('KeyE');
        t.fired = (t.fired || 0) + 1;
        if (t.fired > 40) return false;    // не вышло — не висим
        return true;
      }

      default:
        return false;
    }
  }

  // ====================================================================
  //  ВЫСТРЕЛ (охота)
  // ====================================================================

  function equipRifle() {
    var p = P();
    if (!p) return false;
    var h = p.equip && p.equip.hand1;
    if (h && h.id === 'rifle_mosin') return true;
    if (h && h.id === 'pistol_nagant') return true;
    for (var i = 0; i < p.inv.length; i++) {
      var it = p.inv[i];
      if (it && (it.id === 'rifle_mosin' || it.id === 'pistol_nagant' || it.id === 'shotgun')) {
        try {
          var r = WS.Inv.equip('hand1', i);
          if (r && r.ok) { log(tpl(F_TAKEHAND, { x: WS.Inv.nameOf(it.id) })); return true; }
        } catch (e) { /* пусто */ }
      }
    }
    return false;
  }

  function fireShot(tgt) {
    var p = P();
    if (!p) return false;
    if (invCount('rifle_round') <= 0 && invCount('shell') <= 0) {
      log('Патроны вышли: охота переносится на неопределённый срок');
      return false;
    }
    if (!equipRifle()) { log('Огнестрела нет: остаётся дичь разглядывать'); return false; }
    if ((p._fireCd || 0) > 0 || (p._reloadT || 0) > 0) return true;   // ждём
    // навести «мышь» на цель
    try {
      var m = WS.Input.mouse();
      m.wx = tgt.x; m.wy = tgt.y;
      m.tx = Math.floor(tgt.x); m.ty = Math.floor(tgt.y);
      if (WS.Action.fireWeapon()) {
        D.shotsDone++;
        return true;
      }
    } catch (e) { /* пусто */ }
    return false;
  }

  /** Ближайшая дичь для охоты (олень днём). */
  function preyNear(r) {
    var p = P();
    if (!p || !W()) return null;
    var list;
    try { list = W().entsNear(p.x, p.y, r || 40); } catch (e) { return null; }
    var best = null, bd = 1e9;
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (!e || e.dead || !e.hp || e.hp <= 0) continue;
      if (e.kind !== 'deer') continue;
      var d = dist(p.x, p.y, e.x, e.y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  // ====================================================================
  //  ВЫЖИВАНИЕ: еда, вода, печь, крафт
  // ====================================================================

  /** Лучшая еда: портящееся вперёд, без явного риска. */
  function bestFood() {
    var p = P();
    if (!p) return null;
    var need = 100 - p.needs.hunger;
    var best = null, bestScore = -1e9;
    for (var i = 0; i < p.inv.length; i++) {
      var it = p.inv[i];
      if (!it || !it.id) continue;
      var def = WS.Data.items && WS.Data.items[it.id];
      if (!def) continue;
      var cal = def.cal || 0;
      if (cal <= 0) continue;
      if (FOOD_RISKY[it.id]) continue;                       // сырое/рискованное
      if (it.id === 'vodka') continue;                       // спирт берегём
      var fill = cal / 40;
      var per = def.per || 0;
      var age = (it.data && it.data.age) || 0;
      var left = per ? (per - age) : 999;
      var score = 0;
      if (left < 3) score += 60;                             // вот-вот испортится
      else if (per > 0) score += 12;
      score -= Math.abs(fill - need) * 0.6;
      if (score > bestScore) { bestScore = score; best = it.id; }
    }
    return best;
  }

  function eatBest() {
    var id = bestFood();
    if (!id) return false;
    try {
      var r = WS.Needs.eat(id);
      if (r && r.ok) {
        log(tpl(F_EAT, { x: WS.Inv.nameOf(id) }));
        return true;
      }
    } catch (e) { /* пусто */ }
    return false;
  }

  function drinkBest() {
    for (var i = 0; i < DRINK_IDS.length; i++) {
      if (invCount(DRINK_IDS[i]) > 0) {
        try {
          var r = WS.Needs.drink(DRINK_IDS[i]);
          if (r && r.ok) { log(tpl(F_DRINK, { x: WS.Inv.nameOf(DRINK_IDS[i]) })); return true; }
        } catch (e) { /* пусто */ }
      }
    }
    return false;
  }

  function waterCount() {
    var n = 0;
    for (var i = 0; i < DRINK_IDS.length; i++) n += invCount(DRINK_IDS[i]);
    return n;
  }

  /** Разжечь печь (если можно). */
  function lightStoveNow(stove) {
    if (!stove) return false;
    if (WS.Fire && WS.Fire.near && WS.Fire.near(stove.x, stove.y, 2)) return true;
    var hasWood = invCount('firewood_bundle') > 0 || invCount('plank') > 0 || invCount('log') > 0 ||
                  invCount('pine_branch') > 0 || invCount('birch_bark') > 0 || invCount('dry_grass') > 0;
    var hasFire = invCount('matches') > 0 || invCount('flint') > 0;
    if (!hasWood || !hasFire) {
      var k2 = 'stovelog' + dayN();
      if (D._stovelogDay !== k2) {
        D._stovelogDay = k2;
        log('Печь не развести: ' + (!hasWood ? 'нет дров' : 'нет спичек'), 'warn');
      }
      return false;
    }
    try {
      var r = WS.Fire.lightStove(stove);
      if (r && r.ok) { log(V.pick(F_STOVE) + (outsideTemp() < -25 ? ' — ночь будет злая' : '')); return true; }
      if (r && r.reason) log('Печь против: ' + r.reason);
    } catch (e) { /* пусто */ }
    return false;
  }

  /** Скольких факелов не хватает. */
  function torchesMissing() {
    return Math.max(0, TORCHES_NEED - invCount('torch'));
  }

  /** Есть ли материалы на факел (жир или масло + тряпьё). */
  function canCraftTorch() {
    var rags = invCount('cloth_rag');
    var oil = invCount('lamp_oil');
    var fat = invCount('fat');
    if (oil > 0 && rags > 0) return 'torch_oil';
    if (fat > 0 && rags >= 1) return 'torch';       // 1 факел
    if (fat > 0 && rags >= 2) return 'torch_make';  // 2 факела
    return null;
  }

  /** Тряпьё из газет (если не хватает). */
  function craftRags() {
    if (invCount('cloth_rag') > 0) return false;
    if (invCount('newspaper_stack') > 0) {
      try {
        var r = WS.Craft.craft('tinder');
        if (r && r.ok) { log('Из газет наделал трута: новости теперь хотя бы согреют'); return true; }
      } catch (e) { /* пусто */ }
    }
    return false;
  }

  function craftTorches() {
    craftRags();
    var made = false;
    var id = canCraftTorch();
    if (!id) return false;
    // ДРОВА ВАЖНЕЕ: печь — жизнь, факелы — роскошь; не жжём последнюю доску
    var fuelStock = invCount('firewood_bundle') + invCount('log');
    if (fuelStock < 1 && invCount('plank') < 3) {
      return false;                    // доски берегём на печь
    }
    // не крафтим всё сразу: по одному, чтобы видеть в журнале
    try {
      var r = WS.Craft.craft(id);
      if (r && r.ok) {
        var rec = WS.Craft.recipe(id);
        log('Верчу факел («' + (rec ? rec.name : id) + '») — будет ' + (invCount('torch') + (id === 'torch_make' ? 2 : 1)) + ': свет тоже валюта');
        made = true;
      }
    } catch (e) { /* пусто */ }
    return made;
  }

  /** Авария демо: выдать недостающие факела — ТОЛЬКО в чит-режиме отладки.
   *  Честное прохождение играет без этого: факела собираются из лута/охоты. */
  function fallbackTorches() {
    if (!CHEAT_TORCHES) return false;
    var miss = torchesMissing();
    if (miss <= 0) return false;
    if (dayN() < 57) return false;
    try {
      WS.Inv.give('torch', miss);
      D.fallbackUsed = true;
      log('⚠ ДЕМО-РЕЖИМ (чит): выдано ' + miss + ' факела — в мире не хватило жира/масла. '
        + 'Это дыра баланса: мирные 60 дней без охоты факелы не собирают.', 'bad');
      return true;
    } catch (e) { return false; }
  }

  // ====================================================================
  //  МОЗГ: приоритеты и планирование
  // ====================================================================

  function nearestThreat(r) {
    var p = P();
    if (!p) return null;
    var list;
    try { list = W().entsNear(p.x, p.y, r); } catch (e) { return null; }
    var best = null, bd = 1e9;
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (!e || e.dead || !e.hp || e.hp <= 0) continue;
      if (e.kind !== 'wolf' && e.kind !== 'bear' && e.kind !== 'bandit') continue;
      var d = dist(p.x, p.y, e.x, e.y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  function insideBuilding() {
    var w = W();
    var p = P();
    return !!(w && w.isInside && p && w.isInside(p.x, p.y));
  }

  /** Ближайшее ОТЙПЛИВАЕМОЕ здание (дым из трубы) к точке.
   *  «Холодные» дома — в чёрном списке дня: без растопленной печи они
   *  не греют, и бот умирал там циклом «Мёрзну → бегом → не согрелся». */
  function nearestHeatedBuilding(x, y) {
    if (!D.world) return null;
    var best = null, bd = 1e9;
    for (var i = 0; i < D.world.buildings.length; i++) {
      var b = D.world.buildings[i];
      if (!b.heated || !b.b) continue;
      if (D.coldHouses && D.coldHouses[b.id]) continue;
      var d = dist(x, y, b.x + b.w / 2, b.y + b.h / 2);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  /** Костёр на месте — аварийное обогревание (трут + топливо + спичка).
   *  Топливо — любое горящее: поленья, доски, лапник, береста, трава. */
  function emergencyCampfire() {
    var p = P();
    if (!p) return false;
    if (WS.Fire && WS.Fire.near && WS.Fire.near(p.x, p.y, 3)) return true;
    var tinder = invCount('cloth_rag') > 0 || invCount('newspaper_stack') > 0 ||
                 invCount('candle_stump') > 0 || invCount('wadding') > 0 ||
                 invCount('birch_bark') > 0;
    var wood = fuelScore() > 0 || invCount('pine_branch') + invCount('birch_bark') +
               invCount('dry_grass') > 0;
    var fire = invCount('matches') > 0 || invCount('flint') > 0;
    if (!tinder || !wood || !fire) return false;
    // ПОЗИЦИЯ КОСТРА: раньше вслепую p.x+0.8 — у стены это «здесь не развести
    // огонь», и бот замерзал с берестой в зубах (диагноз роя №16). Перебираем
    // восемь позиций вокруг себя — хотя бы одна обычно свободна.
    var offs = [[0.8, 0], [-0.8, 0], [0, 0.8], [0, -0.8],
                [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]];
    for (var i = 0; i < offs.length; i++) {
      var r = null;
      try { r = WS.Fire.lightCampfire(p.x + offs[i][0], p.y + offs[i][1]); } catch (e) { r = null; }
      if (r && r.ok) {
        log('Разжёг костёр прямо на снегу: экстренная палата тепла открыта', 'warn');
        return true;
      }
    }
    return false;
  }

  /** План «спрятаться от зверя/бандита».
   *  Диагноз Д28/Д13/Д12: бот «прятался» в 3 тайлах от стрелка и погибал
   *  трижды. Тактика бандита: у двери стоит 10 сек, ищет 6 сек — УХОДИТ.
   *  Значит: (1) огнестрел — бой; (2) близко и есть оружие — рукопашная;
   *  (3) БЛИЖАЙШИЙ ДОМ и пересидеть 25 сек (не «бежать прочь» — бандит
   *  держит темп и стреляет в спину). */
  function fleePlan(threat) {
    var p = P();
    var plan = [];

    // 1) ВООРУЖЁН И С ПАТРОНАМИ — бой лучше смерти в спине
    var armedGun = (invCount('rifle_round') > 0 || invCount('shell') > 0) &&
      (invCount('rifle_mosin') > 0 || invCount('pistol_nagant') > 0 || invCount('shotgun') > 0);
    if (armedGun && threat.hp > 0) {
      log('Огнестрел при себе — принимаю бой!');
      plan.push({ type: 'hunt', ent: threat });
      return plan;
    }

    // 2) БЛИЗКО (≤4.5) И ЕСТЬ ХОЛОДНОЕ ОРУЖИЕ — дерёмся,
    //     НО НЕ СО СТРЕЛКОМ: у винтовочного бандита дистанция 4-9 и пули —
    //     подход к нему под огнём самоубийственен (диагноз Д12)
    var melee = bestMeleeWeapon();
    var dThreat = dist(p.x, p.y, threat.x, threat.y);
    var gunner = threat.kind === 'bandit' && threat.weapon === 'rifle' && (threat.ammo || 0) > 0;
    if (melee && !gunner && dThreat <= 4.5 && threat.hp > 0) {
      try {
        var idx = p.inv.findIndex(function (it) { return it && it.id === melee; });
        if (idx >= 0) WS.Inv.equip('hand1', idx);
      } catch (e) { /* пусто */ }
      log('Холодное оружие в руках — отбиваюсь!');
      plan.push({ type: 'fight', ent: threat });
      return plan;
    }

    // 3) В ДОМЕ — в глубину и пересидеть (бандит у двери уходит сам)
    if (insideBuilding()) {
      var cur = buildingOf(p.x, p.y);
      var spot2 = (cur && cur.reachTile) || { x: p.x, y: p.y };
      plan.push(taskGoto(spot2.x, spot2.y, 1, 'убежище'));
      plan.push({ type: 'wait', sec: 25 });
      return plan;
    }

    // 4) СНАРУЖИ — БЕЖАТЬ В БЛИЖАЙШЕЕ ЗДАНИЕ (звери и бандиты не заходят)
    var shelter = nearestBuilding(p.x, p.y);
    if (shelter) {
      var sspot = shelter.reachTile || { x: shelter.x + shelter.w / 2, y: shelter.y + shelter.h / 2 };
      if (shelter.door) {
        plan.push(taskGoto(shelter.door.x, shelter.door.y + 1.2, 0.8, 'дверь укрытия'));
      }
      plan.push(taskGoto(sspot.x, sspot.y, 1, 'укрытие'));
      plan.push({ type: 'wait', sec: 25 });
    } else {
      // совсем без зданий — прочь от угрозы
      var dx = p.x - threat.x, dy = p.y - threat.y;
      var len = Math.sqrt(dx * dx + dy * dy) || 1;
      var runX = p.x + (dx / len) * 14;
      var runY = p.y + (dy / len) * 14;
      var w = W();
      if (w) {
        runX = Math.max(3, Math.min(w.w - 4, runX));
        runY = Math.max(3, Math.min(w.h - 4, runY));
      }
      plan.push(taskGoto(runX, runY, 1.5, 'прочь от угрозы'));
      plan.push({ type: 'wait', sec: 8 });
    }
    return plan;
  }

  /** Лучшее рукопашное оружие в сумке (по урону). */
  function bestMeleeWeapon() {
    var p = P();
    if (!p) return null;
    var best = null, bestDmg = 8;          // ниже 8 — кулачный бой не лучше
    for (var i = 0; i < p.inv.length; i++) {
      var it = p.inv[i];
      if (!it || !it.id) continue;
      var def = WS.Data && WS.Data.items ? WS.Data.items[it.id] : null;
      if (!def) continue;
      var dmg = def.dmg || 0;
      if (def.cat === 'ranged') continue;   // огнестрел — отдельная ветка
      if (dmg > bestDmg) { bestDmg = dmg; best = it.id; }
    }
    return best;
  }

  /** Ближайшее здание к точке (любое, не только тёплое). */
  function nearestBuilding(x, y, maxD) {
    if (!D.world) return null;
    var best = null, bd = maxD || 1e9;
    for (var i = 0; i < D.world.buildings.length; i++) {
      var b = D.world.buildings[i];
      if (!b.b || !b.reachTile) continue;
      var d = dist(x, y, b.x + b.w / 2, b.y + b.h / 2);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  function greetDay() {
    var t = outsideTemp();
    var tail;
    if (t < -28) tail = V.pick(F_DAY_VERYCOLD);
    else if (t < -18) tail = V.pick(F_DAY_COLD);
    else tail = V.pick(F_DAY_MILD);
    return 'На дворе ' + Math.round(t) + '°. ' + tail;
  }

  /** Смена дня — короткая сводка в журнал. */
  function onDayChange() {
    var p = P();
    if (!p) return;
    var impsEx = 0;
    try { impsEx = WS.Imps ? WS.Imps.expelled() : 0; } catch (eI) { impsEx = 0; }
    log(V.pick(['— День ' + dayN() + '. Контора подводит итоги.',
                '— День ' + dayN() + '. Сводка, как в депешу:',
                '— День ' + dayN() + '. Ревизия:']) +
        ' ' + greetDay() +
        ' Еды: ' + countFood() + ', воды: ' + waterCount() +
        ', факелов: ' + invCount('torch') + '/' + TORCHES_NEED +
        ', спичек: ' + invCount('matches') + ', температура тела: ' +
        (p.temp || 37).toFixed(1) + '°' +
        (impsEx > 0 ? ', изгнано мультяшек: ' + impsEx : ''));
  }

  function countFood() {
    var p = P();
    if (!p) return 0;
    var n = 0;
    for (var i = 0; i < p.inv.length; i++) {
      var it = p.inv[i];
      if (!it) continue;
      var def = WS.Data.items && WS.Data.items[it.id];
      if (def && (def.cal || 0) > 0 && !FOOD_RISKY[it.id]) n += it.count || 1;
    }
    return n;
  }

  /** Игровое время в минутах (день×1440 + час×60). */
  function gameMinNow() {
    try { return WS.Time.day() * 1440 + WS.Time.hourF() * 60; }
    catch (e) { return 0; }
  }

  /** Добыча еды, когда сундуки иссякли: печёная рыба → удочка → охота.
   *  Возвращает план или null (нечем/некогда). Днём, в тёплой одежде. */
  function planFoodHunt(h) {
    var p = P();
    if (!p) return null;
    var day = dayN();
    var plan = [];
    // 0) сырая рыба в торбе — сперва в печь: сырую не едим (FOOD_RISKY)
    var rawFish0 = invCount('fresh_fish') + invCount('pike_raw') + invCount('burbot_raw');
    if (rawFish0 > 0 && D.base && D.base.stove) {
      plan.push(taskGoto(D.base.stove.x, D.base.stove.y, 1.8, 'печь (рыба)'));
      plan.push({ type: 'cookfish', stove: D.base.stove });
      return plan;
    }
    // 1а) удочки нет, а материалы есть — смастерить (хлыст+леска+крючок)
    if (invCount('fishing_rod') < 1 && invCount('knife') > 0 &&
        invCount('plank') > 0 && invCount('rope') > 0 &&
        invCount('fishing_line') > 0 && invCount('hook_line') > 0) {
      try {
        var rodR = WS.Craft.craft('fishing_rod');
        if (rodR && rodR.ok) {
          log('Верчу удочку: пусть река кормит, а не одни сундуки.');
          plan.push({ type: 'craftwait' });
          return plan;
        }
      } catch (e) { /* пусто */ }
    }
    // 1) удочка + прорубь: река надёжнее пустых сундуков
    var holeT = nearestHole(46);
    if (holeT && invCount('fishing_rod') > 0 && h > 6 && h < 18) {
      log('Кладовая пуста, а река рядом: к проруби с удочкой.');
      plan.push(taskGoto(holeT.x, holeT.y, 1.2, 'прорубь'));
      plan.push({ type: 'fish', hole: holeT, casts: 8 });
      return plan;
    }
    // 2) охота — не только ради жира на факелы: патроны есть — дичь ждёт
    if (invCount('rifle_round') + invCount('shell') > 0 && h > 8 && h < 16) {
      var preyF = preyNear(38);
      if (preyF) {
        log('Дичь на виду (' + preyF.kind + '): ужин ходит сам — охота!');
        plan.push({ type: 'hunt', ent: preyF });
        return plan;
      }
      if ((D.foodHunts || 0) < 3) {
        D.foodHunts = (D.foodHunts || 0) + 1;
        var fforest = { x: 60 + (day * 37) % 80, y: 40 + (day * 53) % 30 };
        log('К опушке за дичью (' + D.foodHunts + '/3): где лес, там и ужин');
        plan.push(taskGoto(fforest.x, fforest.y, 2, 'опушка леса'));
        var preyF2 = preyNear(25);
        if (preyF2) plan.push({ type: 'hunt', ent: preyF2 });
        return plan;
      }
    }
    return null;
  }

  /** Суммарный запас топлива в «единицах огня» (лапник/береста горят слабее). */
  function fuelScore() {
    return invCount('log') + invCount('firewood_bundle') + invCount('plank') +
           invCount('charcoal_bag') + Math.floor(invCount('pine_branch') / 3) +
           Math.floor(invCount('birch_bark') / 4) + Math.floor(invCount('dry_grass') / 5);
  }

  /** Запас огня в «минутах горения» (как в печи): бревно 60, вязанка 40… */
  function fuelValue() {
    return invCount('log') * 60 + invCount('firewood_bundle') * 40 + invCount('plank') * 30 +
           invCount('charcoal_bag') * 50 + invCount('pine_branch') * 10 +
           invCount('birch_bark') * 8 + invCount('dry_grass') * 6;
  }

  /** Может ли вообще развести огонь: топливо + трут + источник огня.
   *  ВАЖНО: считаем ШТУКИ, без floor-деления — две бересты уже горят
   *  (8 минут огня), а floor(2/4)=0 говорил «невозможно», и бот замерзал
   *  с полными карманами трута (диагноз роя №15, главный баг цикла) */
  function canBurn() {
    var tinder = invCount('cloth_rag') + invCount('newspaper_stack') +
                 invCount('candle_stump') + invCount('wadding') +
                 invCount('birch_bark') + invCount('dry_grass');
    var anyFuel = invCount('log') + invCount('firewood_bundle') + invCount('plank') +
                  invCount('charcoal_bag') + invCount('pine_branch') +
                  invCount('birch_bark') + invCount('dry_grass') + invCount('fat');
    var fire = invCount('matches') + invCount('flint');
    return anyFuel > 0 && tinder > 0 && fire > 0;
  }

  /** Следующее занятие (когда план пуст). */
  function nextActivity() {
    var p = P();
    if (!p) return [];
    var h = hourF();
    var day = dayN();
    var plan = [];

    // === ОСАДНАЯ ВЫДЕРЖКА: меньше 2.5 игровых часов назад видели угрозу —
    //     на улицу не выходим (даже если сейчас тихо: стрелок патрулирует
    //     рядом и снимает каждого, кто высунулся; диагноз Д12, три смерти).
    //     ВАЖНО: осада ≠ голодовка — есть/пить/спать в укрытии можно и нужно
    //     (диагноз Д26: бандит у двери 20 часов, бот в wait без еды и сна —
    //     обмороки, истощение, смерть) ===
    var sinceThreat = gameMinNow() - (D.lastThreatMin !== undefined ? D.lastThreatMin : -99999);
    if (sinceThreat < 150 && D.base && insideBuilding()) {
      // домашние дела: поесть, попить (печь), сон, тихое ожидание
      if (p.needs.hunger < 45 && bestFood()) {
        plan.push({ type: 'eat' });
        return plan;
      }
      if (p.needs.thirst < 30) {
        for (var diS = 0; diS < DRINK_IDS.length; diS++) {
          if (invCount(DRINK_IDS[diS]) > 0) { plan.push({ type: 'drink' }); return plan; }
        }
      }
      if (p.needs.thirst < 45 && D.base.stove &&
          (invCount('flask_empty') > 0 || invCount('icicle_chunk') > 0)) {
        plan.push(taskGoto(D.base.stove.x, D.base.stove.y, 1.8, 'печь (осада)'));
        plan.push({ type: 'melt', stove: D.base.stove });
        return plan;
      }
      // спать: ночью ИЛИ валюсь с ног (обморок в осаде опаснее сна)
      if ((h >= SLEEP_HOUR || h < WAKE_HOUR - 0.2 || p.needs.fatigue < 20) && D.base.bed) {
        var bs3 = D.base.reachTile || { x: D.base.x + D.base.w / 2, y: D.base.y + D.base.h / 2 };
        var sg4 = taskGoto(bs3.x, bs3.y, 1.5, 'домой (спать, осада)');
        sg4.homeTrip = true; sg4.bedTrip = true;
        var sg5 = taskGoto(D.base.bed.x, D.base.bed.y, 1.4, 'кровать');
        sg5.bedTrip = true;
        var sl5 = { type: 'sleep', bed: D.base.bed };
        sl5.bedTrip = true;
        plan.push(sg4); plan.push(sg5); plan.push(sl5);
        return plan;
      }
      plan.push({ type: 'wait', sec: 30 });
      return plan;
    }

    // === нужды: поесть и попить (планово, не только в аварийном порядке) ===
    if (p.needs.hunger < EAT_AT && bestFood()) {
      plan.push({ type: 'eat' });
    }
    if (p.needs.thirst < DRINK_AT) {
      var drank = false;
      for (var di2 = 0; di2 < DRINK_IDS.length; di2++) {
        if (invCount(DRINK_IDS[di2]) > 0) { drank = true; break; }
      }
      if (drank) plan.push({ type: 'drink' });
    }

    // === финал: сигнальный костёр ===
    var fq = (WS.Story && WS.Story.finalQuest) ? WS.Story.finalQuest() : null;
    if (day >= FINAL_DAY && fq && !fq.lit) {
      D.phase = 'final';
      if (torchesMissing() > 0) {
        craftTorches();
        fallbackTorches();
      }
      if (torchesMissing() === 0) {
        var pier = (WS.Story && WS.Story.pier) ? WS.Story.pier() : null;
        if (pier) {
          log('Дым на реке! Не труба — пароход. Бегу на мостки — зажигать сигнальный костёр.', 'good');
          plan.push(taskGoto(pier.x, pier.y, 1.6, 'мостки-пристань'));
          plan.push({ type: 'beacon' });
          plan.push({ type: 'wait', sec: 4 });
          return plan;
        }
      }
    } else if (fq && fq.lit) {
      D.phase = 'shipwait';
    }

    // === ночь: спать ===
    if (p.sleeping) return [{ type: 'sleep', bed: D.base ? D.base.bed : null }];
    var noSleep = D.noSleepUntil && performance.now() < D.noSleepUntil;
    if (!noSleep && (h >= SLEEP_HOUR || h < WAKE_HOUR - 0.2)) {
      if (D.base && D.base.bed) {
        var bspot2 = D.base.reachTile || { x: D.base.x + D.base.w / 2, y: D.base.y + D.base.h / 2 };
        var sg = taskGoto(bspot2.x, bspot2.y, 1.5, 'домой (спать)');
        sg.homeTrip = true; sg.bedTrip = true;
        var sg2 = taskGoto(D.base.bed.x, D.base.bed.y, 1.4, 'кровать');
        sg2.bedTrip = true;
        var sl3 = { type: 'sleep', bed: D.base.bed };
        sl3.bedTrip = true;
        plan.push(sg);
        plan.push(sg2);
        plan.push(sl3);
        return plan;
      }
    }

    // === вода ===
    var meltOk = (!D.meltFailUntil || performance.now() > D.meltFailUntil);
    if (meltOk && waterCount() < 2 && (invCount('flask_empty') > 0 || invCount('icicle_chunk') > 0) &&
        D.base && D.base.stove) {
      // есть чем растопить и огонь рядом/можно разжечь?
      var fireNear = (WS.Fire && WS.Fire.near) ? WS.Fire.near(D.base.stove.x, D.base.stove.y, 2) : null;
      var canLight = fireNear || ((invCount('firewood_bundle') + invCount('plank') + invCount('log') > 0) &&
                                  (invCount('matches') + invCount('flint') > 0));
      if (canLight) {
        plan.push(taskGoto(D.base.stove.x, D.base.stove.y, 1.8, 'печь'));
        plan.push({ type: 'melt', stove: D.base.stove });
        return plan;
      }
      // нет огня и нечем разжечь — это проблема ДРОВ, а не воды: идём в лут
    }
    // сосульки в округе — собрать (вода на будущее; днём, не в темноте)
    if (waterCount() + invCount('icicle_chunk') < 4) {
      var ice = nearestIcicle(45);
      if (ice && h > 6 && h < 20) {
        plan.push(taskGoto(ice.x, ice.y, 1.2, 'сосульки'));
        plan.push({ type: 'harvest', o: ice });
        return plan;
      }
    }

    // === КЛАДОВАЯ ПУСТА: активная добыча еды — река и лес кормят,
    //     когда сундуки иссякли (диагноз Д16: весь посёлок обыскан,
    //     еды 0, бот день «переодевался» и умер от голода в кровати) ===
    if (countFood() < 2 && h >= 7 && h < 16.5) {
      var pf = planFoodHunt(h);
      if (pf) return pf;
    }

    // === факелы ===
    if (torchesMissing() > 0 && day >= 20) {
      if (craftTorches()) {
        plan.push({ type: 'craftwait' });
        return plan;
      }
      // охота ради жира
      if (day >= HUNT_FROM_DAY && invCount('rifle_round') + invCount('shell') > 3 && h > 8 && h < 16) {
        var prey = preyNear(38);
        if (prey) {
          log('Дичь на виду (' + prey.kind + '): ужин ходит сам — охота!');
          plan.push({ type: 'hunt', ent: prey });
          return plan;
        }
        // пойти к лесу и поискать там
        if (day >= 25 && D.huntsDone < 3) {
          D.huntsDone++;
          var forest = { x: 60 + (day * 37) % 80, y: 40 + (day * 53) % 30 };
          log('К опушке, искать дичь (' + D.huntsDone + '/3): где лес, там и ужин');
          plan.push(taskGoto(forest.x, forest.y, 2, 'опушка леса'));
          var again = preyNear(25);
          if (again) plan.push({ type: 'hunt', ent: again });
          return plan;
        }
      }
    }

    // === вечер: домой (с полным запасом тепла — дорога холодная) ===
    if (h >= HOME_HOUR) {
      if (D.base) {
        var bspot = D.base.reachTile || { x: D.base.x + D.base.w / 2, y: D.base.y + D.base.h / 2 };
        var far = dist(p.x, p.y, bspot.x, bspot.y) > 6;
        // «СОГРЕТЬСЯ ПЕРЕД ДОРОГОЙ» УБРАНО: ближайший «дымный» дом не греет
        // без растопленной печи, и бот остывал в нём насмерть (диагноз Д1).
        // Вечером — сразу домой, к своей печи и дровам.
        if (far) {
          var hgoto = taskGoto(bspot.x, bspot.y, 1.5, 'домой к ночи');
          hgoto.homeTrip = true;
          plan.push(hgoto);
        }
        // вечером при сильном морозе — натопить
        if (outsideTemp() < -22 && D.base.stove && invCount('matches') > 1) {
          plan.push(taskGoto(D.base.stove.x, D.base.stove.y, 1.8, 'печь'));
          plan.push({ type: 'warm', stove: D.base.stove, spot: bspot });
        }
        plan.push({ type: 'wait', sec: 3 });
        return plan;
      }
    }

    // === устал: вздремнуть до изнеможения (обморок срывает все планы) ===
    // НО: еда важнее дремоты — без припасов идём обыскивать (ловушка Д2-Д5:
    // бот дремал вместо походов и умер от голода с полным посёлком вокруг)
    if (p.needs.fatigue < 26 && D.base && D.base.bed && h >= 8 && h < 17.5 &&
        countFood() > 1 && !(D.noSleepUntil && performance.now() < D.noSleepUntil)) {
      var ng = taskGoto(D.base.bed.x, D.base.bed.y, 1.4, 'кровать (дремка)');
      ng.bedTrip = true;
      var ns = { type: 'sleep', bed: D.base.bed, untilMax: Math.min(h + 3, 17.5) };
      ns.bedTrip = true;
      plan.push(ng);
      plan.push(ns);
      return plan;
    }

    // === АВАРАЛ КРУГЛОСУТОЧНО: огня не развести, а мороз давит — под
    //     снегом у крыльца береста и трава (они и топливо, и трут).
    //     Раньше работало только днём — ночью бот замерзал «по расписанию»
    //     (диагноз роя №10: плотник, 22:41, маятник до смерти)
    if ((p.temp || 37) < 36.4 && !canBurn() &&
        (invCount('matches') > 0 || invCount('flint') > 0)) {
      var outSpotA = nearestOutdoorTile();
      if (outSpotA) {
        log('Ни полена, а печь просит: прошурую снег — авось береста найдётся.', 'warn');
        var ogA = taskGoto(outSpotA.x, outSpotA.y, 0.8, 'крыльцо (поиск топлива)');
        ogA.warming = true;
        plan.push(ogA);
        plan.push({ type: 'groundsearch', n: 3, warming: true });
        return plan;
      }
    }

    // === ДОГРЕТЬСЯ НА БАЗЕ: единственная НАСТОЯЩАЯ печь — дома; «дымные»
    //     дома без растопки не греют. Остывший в дороге бот с топливом в
    //     кармане идёт к СВОЕЙ печи и растапливает её (диагноз роя №13:
    //     лёгкие профессии застревали в ближних амбарах на весь день)
    if ((p.temp || 37) < 36.3 && D.base && h >= 8 && h < 17 && !insideBuilding() &&
        canBurn() &&
        dist(p.x, p.y, D.base.x + D.base.w / 2, D.base.y + D.base.h / 2) > 6) {
      var bspotG = D.base.reachTile || { x: D.base.x + D.base.w / 2, y: D.base.y + D.base.h / 2 };
      var bg4 = taskGoto(bspotG.x, bspotG.y, 1.4, 'база (печь)');
      bg4.homeTrip = true; bg4.warming = true;
      plan.push(bg4);
      plan.push({ type: 'warm', stove: D.base.stove, spot: bspotG, warming: true });
      return plan;
    }

    // === ДЕНЬ: ТОПЛИВО ПРЕЖДЕ ЛЮТА (порядок изменён после диагноза роя:
    //     бот обыскивал дворы, а к ночи оставался без единого полена и
    //     замерзал в «тёплом» доме; дрова — не роскошь, а кругооборот тепла).
    //     Порог — 120 «минут горения»: этого хватает на вечернюю печь. ===
    if (h >= 7 && h < 18.5 && fuelValue() < 120) {
      // а) скрафтить поленья из запаса
      var fwRec2 = null;
      if (invCount('log') > 0 && invCount('axe') > 0) fwRec2 = 'firewood_chop';
      else if (invCount('plank') >= 2 && invCount('axe') > 0) fwRec2 = 'firewood_plank';
      if (fwRec2) {
        try {
          var fwr2 = WS.Craft.craft(fwRec2);
          if (fwr2 && fwr2.ok) {
            log('Топор в руки: рублю дрова — печь должна дышать');
            plan.push({ type: 'craftwait' });
            return plan;
          }
        } catch (e) { /* пусто */ }
      }
      // б) поленница поблизости — сгонять (дальше — только тёплым и в шубе)
      var woodT2 = [];
      for (var wi2 = 0; wi2 < D.world.loot.length; wi2++) {
        var wt2 = D.world.loot[wi2];
        if (!wt2.o || wt2.o.looted || wt2.taken) continue;
        if (!/поленн|дров|склад/i.test(wt2.o.name || '')) continue;
        woodT2.push(wt2);
      }
      if (woodT2.length) {
        woodT2.sort(function (a, b) {
          return dist(p.x, p.y, a.o.x, a.o.y) - dist(p.x, p.y, b.o.x, b.o.y);
        });
        var wP = woodT2[0];
        var dwP = dist(p.x, p.y, wP.o.x, wP.o.y);
        var wsP = 100;
        try { wsP = WS.Inv.warmTotal ? WS.Inv.warmTotal() : 100; } catch (eP) { /* пусто */ }
        var okP = ((p.temp || 37) >= 36.4 && wsP >= 150) ? 68 :
                  ((p.temp || 37) >= 36.4 ? 32 : 16);
        if (dwP <= okP) {
          log('Дрова на исходе — за поленцией (' + Math.round(dwP) + ' тайлов).');
          var pg = taskGoto(wP.o.x, wP.o.y, 1.8, 'поленница (дрова)');
          pg.o = wP.o;
          pg.homeTrip = true; pg.warming = true;   // не прерывать на полпути
          plan.push(pg);
          var ps2 = { type: 'search', o: wP.o };
          ps2.warming = true;
          plan.push(ps2);
          return plan;
        }
      }
      // в) ЛОМАТЬ ВЕТКИ У ДЕРЕВЬЕВ — возобновляемое топливо для ЛЮБОЙ
      //    профессии (топором — бревно, руками — лапник и береста).
      //    Флаги homeTrip+warming: топливный поход НЕ ПРЕРЫВАЕТСЯ холод-
      //    веткой на полпути (диагноз роя: «за поленцией» → «Стыну, в дом» →
      //    возврат ни с чем → ночная смерть)
      var treeF = nearestTree(40);
      if (treeF) {
        var dtF = dist(p.x, p.y, treeF.x, treeF.y);
        var okF = (p.temp || 37) >= 36.2 ? 40 : 18;
        if (dtF <= okF) {
          log('За топливом к дереву (' + Math.round(dtF) + ' тайлов): лес — лавка, что не закрывается.');
          var tgF = taskGoto(treeF.x, treeF.y, 1.6, 'дерево (ветки)');
          tgF.homeTrip = true; tgF.warming = true;   // ходка не прерывается
          plan.push(tgF);
          // рубка с warming: спасение не рвёт её каждые 0.22 сек — мороз
          // отслеживает сама задача (самоотмена при < 34.6°, диагноз №8)
          var cw2 = { type: 'chopwood', o: treeF };
          cw2.warming = true;
          plan.push(cw2);
          return plan;
        }
      }
    }

    // === день: поход за лутом ===
    if (h >= 7 && h < HOME_HOUR) {
      var targets = nextLootTarget(3);
      // БЮДЖЕТ МОРОЗА (туда-обратно), АДАПТИВНЫЙ ПО ОДЕЖДЕ:
      // в тёплом облачении улица стоит вдвое-втрое дешевле за тайл —
      // бот в валенках и полушубке достаёт до дальних дворов (диагноз Д21:
      // ближний лут кончился, а дальний был «за бюджетом» — голодная смерть).
      var warmSum = 100;
      try { warmSum = WS.Inv.warmTotal ? WS.Inv.warmTotal() : 100; } catch (eW) { /* пусто */ }
      var perTile = warmSum >= 170 ? 0.055 : (warmSum >= 130 ? 0.08 : 0.13);
      var tempBudget = Math.max(0, (p.temp || 37) - 34.5);
      var maxLootDist = Math.max(6, Math.floor(tempBudget / (perTile * 2)));
      targets = targets.filter(function (tt) {
        var dd = dist(p.x, p.y, tt.o.x, tt.o.y);
        if (dd <= maxLootDist) return true;
        return !!(tt.home && tt.home.heated && dd <= 22);
      });
      // ВЕЧЕРОМ ДАЛЕКО НЕ ХОДИМ: после 15:00 — только ближний лут (в радиусе
      // 14 тайлов от базы), иначе возврат в темноте замерзает (диагноз Д1).
      if (h >= 15 && D.base) {
        var bx0 = D.base.x + D.base.w / 2, by0 = D.base.y + D.base.h / 2;
        targets = targets.filter(function (tt) {
          return dist(tt.o.x, tt.o.y, bx0, by0) <= 14;
        });
      }
      if (targets.length) {
        for (var i = 0; i < targets.length; i++) {
          var t = targets[i];
          var nm = t.o.name || 'контейнер';
          var home = t.home && t.home.id ? (' (' + t.home.id + ')') : '';
          var gt = taskGoto(t.o.x, t.o.y, 1.8, nm + home);
          gt.o = t.o;                     // чтобы провал пути пометил цель
          plan.push(gt);
          plan.push({ type: 'search', o: t.o });
        }
        plan.push({ type: 'equip' });
        return plan;
      }
      // БЛИЖНИЙ КРУГ ПУСТ — НЕ СИДЕТЬ ДНЯМИ В «ПЕРЕДЫШКЕ» (диагноз Д3–Д16:
      // бот ждал в тёплом доме, припасы таяли 6→0, потом голодная смерть).
      // Дальний круг — С БЮДЖЕТОМ ХОЛОДА: не дальше 24 тайлов и только
      // с полным запасом тепла; по пути бот греется у печей/костров.
      if ((p.temp || 37) >= 36.0 && h < 14) {
        var farCap = Math.min(24, Math.max(12, maxLootDist + 8));
        var farT = nextLootTarget(8).filter(function (tt) {
          var dd = dist(p.x, p.y, tt.o.x, tt.o.y);
          return dd <= farCap;
        });
        farT.sort(function (a, b) {
          return dist(p.x, p.y, a.o.x, a.o.y) - dist(p.x, p.y, b.o.x, b.o.y);
        });
        if (farT.length) {
          log('Ближние дворы пусты — иду дальше, за добычей (' + farT.length + ' целей).');
          for (var fi = 0; fi < Math.min(2, farT.length); fi++) {
            var ft = farT[fi];
            var fnm = (ft.o.name || 'контейнер') + (ft.home && ft.home.id ? ' (' + ft.home.id + ')' : '');
            var fgt = taskGoto(ft.o.x, ft.o.y, 1.8, fnm);
            fgt.o = ft.o;
            plan.push(fgt);
            plan.push({ type: 'search', o: ft.o });
          }
          plan.push({ type: 'equip' });
          return plan;
        }
      }
      // и дальний круг пуст — припасы тают? река и лес кормят заранее,
      // не дожидаясь голодных судорог (порог 5, запас на пару дней)
      if (countFood() < 5) {
        var pf2 = planFoodHunt(h);
        if (pf2 && pf2.length) return pf2;
      }
      // ТОПЛИВНАЯ ДИСЦИПЛИНА: без дров печь мертва, а с ней и зимовка
      // (диагноз Д24-Д25: «Печь не развести: нет дров» при -37° — герой
      // остывал дома, ослабел, и бандит у двери довершил). Порог 4 — ездим
      // за дровами ЗАРАНЕЕ, а не когда печь уже молчит.
      if (invCount('firewood_bundle') + invCount('plank') + invCount('log') < 4) {
        // а) скрафтить из запаса: бревно/доски + топор → поленья
        var fwRec = null;
        if (invCount('log') > 0 && invCount('axe') > 0) fwRec = 'firewood_chop';
        else if (invCount('plank') >= 2 && invCount('axe') > 0) fwRec = 'firewood_plank';
        if (fwRec) {
          try {
            var fwr = WS.Craft.craft(fwRec);
            if (fwr && fwr.ok) {
              log('Топор в руки: рублю дрова — печь должна дышать');
              plan.push({ type: 'craftwait' });
              return plan;
            }
          } catch (e) { /* пусто */ }
        }
        // б) поленница в любом дворе посёлка — за дровами хоть на край
        var woodT = [];
        for (var wi = 0; wi < D.world.loot.length; wi++) {
          var wt = D.world.loot[wi];
          if (!wt.o || wt.o.looted || wt.taken) continue;
          if (!/поленн|дров|склад/i.test(wt.o.name || '')) continue;
          woodT.push(wt);
        }
        if (woodT.length && h >= 7 && h < 16) {
          woodT.sort(function (a, b) {
            return dist(p.x, p.y, a.o.x, a.o.y) - dist(p.x, p.y, b.o.x, b.o.y);
          });
          var w0 = woodT[0];
          var dw = dist(p.x, p.y, w0.o.x, w0.o.y);
          // ВСЕГО 7 поленниц на посёлок, и все — за 40-60 тайлов от базы.
          // Дальний поход — ТОЛЬКО ТЁПЛОМУ (temp ≥ 36.4) и в тёплой одежде:
          // замёрзшему герою 20+ тайлов до поленницы — приговор (диагноз роя:
          // охотник пошёл «за поленцией» при 34.4° и не дошёл).
          var wsF = 100;
          try { wsF = WS.Inv.warmTotal ? WS.Inv.warmTotal() : 100; } catch (eWs) { /* пусто */ }
          var coldOk = ((p.temp || 37) >= 36.4 && wsF >= 150) ? 68 :
                       ((p.temp || 37) >= 36.4 ? 32 : 0);
          if (dw <= coldOk) {
            log('Дрова на исходе — за поленцией (' + Math.round(dw) + ' тайлов): без печи зима не разговаривает.');
            var wgt2 = taskGoto(w0.o.x, w0.o.y, 1.8, 'поленница (дрова)');
            wgt2.o = w0.o;
            plan.push(wgt2);
            plan.push({ type: 'search', o: w0.o });
            return plan;
          }
        }
        // в) ПОЛЕНИЦЫ КОНЧИЛИСЬ — РУБИТЬ ДЕРЕВЬЯ (возобновляемое топливо;
        //    диагноз Д25+: весь посёлок вычищен, «Печь не развести: нет дров» —
        //    структурная смерть без этой ветки)
        if (invCount('axe') > 0 && h >= 7 && h < 17) {
          var treeW = nearestTree(36);
          if (treeW) {
            var dtW = dist(p.x, p.y, treeW.x, treeW.y);
            var chopOk = (p.temp || 37) >= 36.2 ? 36 : 18;
            if (dtW <= chopOk) {
              log('За топливом к дереву (' + Math.round(dtW) + ' тайлов): лес — единственная лавка, что не закрывается.');
              plan.push(taskGoto(treeW.x, treeW.y, 1.6, 'дерево (ветки)'));
              plan.push({ type: 'chopwood', o: treeW });
              return plan;
            }
          }
        }
      }
      // ЛУТ НЕДОСТУПЕН ИЗ-ЗА ХОЛОДА/РАДИУСА — НЕ СИДЕТЬ И ОСТЫВАТЬ
      // (диагноз Д1: 3 часа wait в barn_10 при 36.2°, потом замёрз по
      // дороге домой). Идём на базу и греемся у печи — цикл «тепло →
      // ближний лут → тепло» честно выжимает окрестности базы.
      if ((p.temp || 37) < 36.4 && D.base) {
        var bspot3 = D.base.reachTile || { x: D.base.x + D.base.w / 2, y: D.base.y + D.base.h / 2 };
        var farBase = dist(p.x, p.y, bspot3.x, bspot3.y) > 5;
        if (farBase) {
          var hg3 = taskGoto(bspot3.x, bspot3.y, 1.5, 'домой (согреться)');
          hg3.homeTrip = true;
          plan.push(hg3);
        }
        if (D.base.stove) {
          plan.push(taskGoto(D.base.stove.x, D.base.stove.y, 1.8, 'печь'));
        }
        plan.push({ type: 'warm', stove: D.base.stove, spot: bspot3 });
        return plan;
      }
      // всё обыскано — собрать сосульки/погулять/ждать
      plan.push({ type: 'wait', sec: 4 });
      plan.push({ type: 'equip' });
      return plan;
    }

    plan.push({ type: 'wait', sec: 3 });
    return plan;
  }

  /** Ближайший уличный НЕЗАБЛОКИРОВАННЫЙ снежный тайл (для поиска топлива). */
  function nearestOutdoorTile() {
    var p = P();
    var w = W();
    if (!p || !w) return null;
    for (var r = 1; r <= 5; r++) {
      for (var dy = -r; dy <= r; dy++) {
        for (var dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          var x = Math.floor(p.x) + dx, y = Math.floor(p.y) + dy;
          if (w.isInside && w.isInside(x + 0.5, y + 0.5)) continue;
          if (w.isTileBlocked(x, y)) continue;
          var t = w.tileAt(x, y);
          if (t !== w.T.SNOW && t !== w.T.SNOW_DEEP && t !== w.T.GRASS && t !== w.T.GRASS2) continue;
          return { x: x + 0.5, y: y + 0.5 };
        }
      }
    }
    return null;
  }

  /** Ближайшее дерево (для возобновляемого топлива) в радиусе r. */
  function nearestTree(r) {
    var p = P();
    if (!p || !WS.Forage || !WS.Forage.isTree) return null;
    var day = dayN();
    var objs = WS.World.objects;
    var best = null, bd = r;
    for (var i = 0; i < objs.length; i++) {
      var o = objs[i];
      if (!o || !WS.Forage.isTree(o)) continue;
      if (o._chopDay === day) continue;         // сегодня уже нарублено
      var d = dist(p.x, p.y, o.x, o.y);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  /** Ближайшая незамёрзшая прорубь в радиусе r (для рыбалки). */
  function nearestHole(r) {
    var p = P();
    if (!p || !WS.Fishing || !WS.Fishing.holes) return null;
    var list;
    try { list = WS.Fishing.holes(); } catch (e) { return null; }
    var best = null, bd = r;
    for (var i = 0; i < list.length; i++) {
      var hh = list[i];
      if (!hh || hh.frozen) continue;
      if (WS.World.objects.indexOf(hh.o) < 0) continue;
      var d = dist(p.x, p.y, hh.x, hh.y);
      if (d < bd) { bd = d; best = hh; }
    }
    return best;
  }

  function nearestIcicle(r) {
    var p = P();
    if (!p || !D.world) return null;
    var best = null, bd = r;
    for (var i = 0; i < D.world.icicles.length; i++) {
      var o = D.world.icicles[i];
      if (WS.World.objects.indexOf(o) < 0) continue;
      var d = dist(p.x, p.y, o.x, o.y);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  /** Главная «мысль» — вызывается ~5 раз в секунду. */
  function think() {
    var g = G();
    if (!g || !g.running) return;
    var p = g.player;
    if (!p || p.hp <= 0) return;

    // ОБМОРОК: игра сама усыпила героя (усталость/гипотермия). Наши задачи
    // при спящем герое бессмысленны — ждём, пока отпустит (раньше бот
    // «спал стоя» днями: задачи крутились, герой не двигался).
    if (p.sleeping && (!D.task || D.task.type !== 'sleep')) {
      releaseKeys();
      if (!D._faintSaid) {
        D._faintSaid = true;
        log('Героя выключило, как лампу без керосина — обморок, пережидаю.', 'warn');
      }
      return;
    }
    if (!p.sleeping) D._faintSaid = false;

    // УСТАЛОСТЬ КРИТИЧНА: не спящего героя игра валит в обмороки, и все
    // планы рассыпаются. Сон в кровати — абсолютный приоритет.
    // НО: если мы уже идём греться (ветка холода) — НЕ перетираем её план:
    // раньше эти две ветки чистили друг друга каждые 0.22 сек, бот стоял
    // на месте и замерзал насмерть (диагноз Д1 22:00, «Мёрзну» ×25).
    if (!p.sleeping && p.needs.fatigue < 22 && D.base && D.base.bed &&
        !(D.noSleepUntil && performance.now() < D.noSleepUntil) &&
        !(D.task && (D.task.bedTrip || D.task.warming || D.task.homeTrip))) {
      clearPlan();
      var bs = D.base.reachTile || { x: D.base.x + D.base.w / 2, y: D.base.y + D.base.h / 2 };
      var bg2 = taskGoto(bs.x, bs.y, 1.5, 'кровать (валюсь с ног)');
      bg2.homeTrip = true; bg2.bedTrip = true; bg2.warming = true;
      var bg3 = taskGoto(D.base.bed.x, D.base.bed.y, 1.4, 'кровать');
      bg3.bedTrip = true; bg3.warming = true;
      var sl2 = { type: 'sleep', bed: D.base.bed };
      sl2.bedTrip = true;
      D.plan = [bg2, bg3, sl2];
      D.task = D.plan.shift();
      return;
    }

    // контейнер/экран открыт — подождём (симуляция стоит)
    if (WS.Ui && WS.Ui.modal && WS.Ui.modal()) return;

    // 1) угроза — засечь время встречи (для осадной выдержки)
    var threat = nearestThreat(9);
    if (threat && !p.sleeping) {
      D.lastThreatMin = gameMinNow();
      if (!(D.task && D.task.fleeing)) {
        var kindName = { wolf: 'волк', bear: 'медведь-шатун', bandit: 'бандит' }[threat.kind] || threat.kind;
        log('⚠ Рядом ' + kindName + ' (' + Math.round(dist(p.x, p.y, threat.x, threat.y)) + ' тайлов) — прячусь!', 'bad');
        clearPlan();
        var fp = fleePlan(threat);
        for (var fi = 0; fi < fp.length; fi++) fp[fi].fleeing = true;
        D.plan = fp.slice(1);
        D.task = fp[0] || null;
        return;
      }
    }

    // 1b) ОСАДА: угроза в зоне видимости (≤14 тайлов), а мы в доме —
    //     СИДИМ ВНУТРИ и не выходим, пока не уйдёт (бандит у двери стоит
    //     10 сек, ищет 6 — и возвращается в лагерь; выходить = под пулю)
    var siege = nearestThreat(14);
    if (siege) D.lastThreatMin = gameMinNow();
    if (siege && insideBuilding() && !p.sleeping && !(D.task && D.task.fleeing)) {
      clearPlan();
      // спать и при усталости тоже: обморок в осаде — двойная уязвимость
      var nightSiege = (hourF() >= 21 || hourF() < 6 || p.needs.fatigue < 20);
      if (nightSiege && D.base && D.base.bed) {
        var sg3 = taskGoto(D.base.bed.x, D.base.bed.y, 1.4, 'кровать (пересижу осаду)');
        sg3.bedTrip = true; sg3.fleeing = true;
        var sl4 = { type: 'sleep', bed: D.base.bed };
        sl4.bedTrip = true; sl4.fleeing = true;
        D.plan = [sg3, sl4];
        D.task = D.plan.shift();
      } else {
        D.plan = [{ type: 'wait', sec: 25, fleeing: true }];
        D.task = D.plan.shift();
      }
      return;
    }

    // 2) экстренные нужды (не отходя от кассы)
    if (p.needs.hunger < 16) {
      if (!eatBest() && !D._noFoodSaid) {
        D._noFoodSaid = true;
        log('Голод пришёл, кладовая пуста — пора по чужим сундукам.', 'bad');
      }
    }
    if (p.needs.hunger > 40) D._noFoodSaid = false;
    if (p.needs.thirst < 16) {
      if (!drinkBest()) {
        // совсем беда — снег (риск болезни, но лучше чем смерть)
        try {
          WS.Needs.eatSnow();
          log('Ем снег горстью: воды нет, простуда подождёт (наверное)', 'warn');
        } catch (e) { /* пусто */ }
      }
    }

    // 3) холод — главный враг: улица на адаптивной скорости честно морозит.
    //    ГИСТЕРЕЗИС: после согревания (>=36.6) работаем до 36.0 — иначе бот
    //    маятником ходит «тёплый дом <-> две минуты улицы». Ночью и в пути
    //    домой отвлекаемся только на настоящий холод (PANIC_COLD).
    var temp = p.temp || 37;
    if (temp >= 36.6) D.warmOK = true;
    if (temp < 36.0) D.warmOK = false;
    var headingHome = D.task && (D.task.homeTrip || D.task.type === 'sleep');
    var nightH = (hourF() >= 20.0 || hourF() < 6.0);
    var coldLimit = (headingHome || D.warmOK) ? PANIC_COLD : WARM_AT;
    // короткий рывок за целью (до 9 тайлов) не прерываем: выскочить за
    // дровами к поленнице у крыльца — две секунды, иначе бот взаперти
    var dashNear = false;
    if (D.task && typeof D.task.tx === 'number' && typeof D.task.ty === 'number') {
      dashNear = dist(p.x, p.y, D.task.tx, D.task.ty) < 9;
    }
    if (dashNear && temp >= 33.8) coldLimit = Math.min(coldLimit, 33.8);
    if (temp < coldLimit && !p.sleeping) {
      var fire = (WS.Fire && WS.Fire.near) ? WS.Fire.near(p.x, p.y, 2.5) : null;
      // «Тёплый дом» БЕЗ ГОЛЯЩЕЙ печи — НЕ тепло: флаг heated — это лишь дым
      // из трубы (45% домов), и бот замерзал в таком «тепле», не пытаясь
      // развести огонь (диагноз роя: плотник в barn_10, 35.4→смерть).
      // Спасение планируем всегда, когда рядом нет ЖИВОГО огня.
      // НО: если мы УЖЕ в укрытии, огня нет и РАЗВЕСТИ НЕЧЕМ (топливо/трут
      // на нуле) — холодная ветка уступает топливной: пусть nextActivity
      // собирает лапник/бересту, иначе бот маятником «дом→дом» замерзает
      // (диагноз роя: охотник в granary_16, 35→31° без единого действия)
      if (!fire && !canBurn() && temp >= 33.6) {
        // РАЗВЕСТИ НЕЧЕМ — любая крыша лишь замедляет конец: топливо
        // важнее укрытия, пусть работает топливная ветка nextActivity
        // (диагноз роя №17: самоотмена+монополия = петля до смерти)
      } else if (!fire) {
        // уже идём греться — не перепланируем каждые полсекунды
        // (срезка warming-плана «по таймеру» оказывалась хуже болезни:
        // до базы 24 тайла = 12+ сек пути, и план срезался на полпути —
        // «Мёрзну→бегом→срезал» по кругу до смерти. Движение не трогаем.)
        var warming = (D.task && D.task.warming) ||
                      (D.plan.length && D.plan[0] && D.plan[0].warming);
        // ===== КРИТИЧЕСКИЙ ХОЛОД (< PANIC_COLD): СПАСАНИЕ БЛИЖНИМ =====
        // Порядок: горящий огонь рядом → ЛЮБОЙ дом в 12 тайлах (крыша даёт
        // +5°C — лучше, чем бег к «дымному» дому за 30) → костёр на месте →
        // «дымный» дом ≤25 → база ≤40. Дальние пробеги при <35° — смерть
        // на полпути (диагнозы роя Д1: охотник и плотник погибли так).
        if (!warming && temp < PANIC_COLD) {
          var saved = false;
          // 0) УЖЕ ПОД КРЫШЕЙ и есть чем гореть — костёр ПРЯМО ЗДЕСЬ:
          // гранарий без печи не спасет, а трут+дрова+спички всегда спасут
          if (insideBuilding() && emergencyCampfire()) {
            clearPlan();
            D.plan = [{ type: 'warm', warming: true }];
            saved = true;
          }
          // 1) ближайший ГОЛЯЩИЙ огонь (печи/костры) в 45 тайлах
          if (!saved) {
            var liveFire = (WS.Fire && WS.Fire.near) ? WS.Fire.near(p.x, p.y, 45) : null;
            if (liveFire) {
              clearPlan();
              var fgo = taskGoto(liveFire.x, liveFire.y, 1.4, 'живой огонь');
              fgo.warming = true;
              D.plan = [fgo, { type: 'warm', warming: true, spot: { x: liveFire.x, y: liveFire.y } }];
              log('Мёрзну (' + temp.toFixed(1) + '°) — к живому огню, он ближе тепла из трубы.');
              saved = true;
            }
          }
          // 2) КОСТЁР НА МЕСТЕ — раньше бегства к дому: с топливом в руках
          //    огонь ближе любой крыши (диагноз роя №10: побежал в караулку
          //    с бревном под мышкой и замёрз по дороге)
          if (!saved && emergencyCampfire()) {
            clearPlan();
            D.plan = [{ type: 'warm', warming: true }];
            saved = true;
          }
          // 3) ЛЮБОЙ дом с дверью в 12 тайлах: крыша = +5°C
          if (!saved) {
            var anyB = nearestBuilding(p.x, p.y, 12);
            if (anyB) {
              var aspot = anyB.reachTile || { x: anyB.x + anyB.w / 2, y: anyB.y + anyB.h / 2 };
              clearPlan();
              var ago = taskGoto(aspot.x, aspot.y, 1.2, 'крыша ' + anyB.id);
              ago.warming = true;
              D.plan = [ago, { type: 'warm', warming: true, spot: aspot, stove: anyB.stove }];
              log('Мёрзну (' + temp.toFixed(1) + '°) — в ближайший дом (' + anyB.id + '): крыша греет лучше бега.');
              saved = true;
            }
          }
          // 4) «дымный» дом в 25 тайлах
          if (!saved) {
            var hbC = nearestHeatedBuilding(p.x, p.y);
            var dhC = hbC ? dist(p.x, p.y, hbC.x + hbC.w / 2, hbC.y + hbC.h / 2) : 1e9;
            if (hbC && dhC <= 25) {
              var spotC = hbC.reachTile || { x: hbC.x + hbC.w / 2, y: hbC.y + hbC.h / 2 };
              clearPlan();
              var cgo = taskGoto(spotC.x, spotC.y, 1.2, 'тёплый дом ' + hbC.id);
              cgo.warming = true;
              D.plan = [cgo, { type: 'warm', warming: true, stove: hbC.stove, spot: spotC }];
              log('Мёрзну (' + temp.toFixed(1) + '°) — до тепла бегом: ' + hbC.id);
              saved = true;
            }
          }
          // 5) база в 40 тайлах — последний шанс
          if (!saved && D.base) {
            var dBase = dist(p.x, p.y, D.base.x + D.base.w / 2, D.base.y + D.base.h / 2);
            if (dBase <= 40) {
              var bspotC = D.base.reachTile || { x: D.base.x + D.base.w / 2, y: D.base.y + D.base.h / 2 };
              clearPlan();
              var bgo = taskGoto(bspotC.x, bspotC.y, 1.2, 'база (мороз)');
              bgo.warming = true; bgo.homeTrip = true;
              D.plan = [bgo, { type: 'warm', warming: true, stove: D.base.stove, spot: bspotC }];
              log('Мёрзну (' + temp.toFixed(1) + '°) — прорываюсь к базе (' + Math.round(dBase) + ' тайлов).');
            }
          }
          if (saved) return;
        }
        if (!warming) {
          // БЛИЖАЙШИЙ «ДЫМНЫЙ» ДОМ КАК ПЕРЕВАЛКА: греться у базы за 30 тайлов
          // напролом — верная смерть (диагноз Д1: 34.8° и путь не дошёл).
          // Вечером — всё же база (там печь и дрова), днём — ближайшее тепло.
          var eveningH = hourF() >= (HOME_HOUR - 1.5);
          var hb = (eveningH && D.base) ? D.base : nearestHeatedBuilding(p.x, p.y);
          var dh = hb ? dist(p.x, p.y, hb.x + hb.w / 2, hb.y + hb.h / 2) : 1e9;
          if (temp < PANIC_COLD && (dh > 20 || !hb)) {
            // совсем прихватило, а тепло далеко — костёр на месте
            if (emergencyCampfire()) {
              clearPlan();
              D.plan = [{ type: 'warm', warming: true }];
              return;
            }
          }
          if (hb && dh <= 60) {
            var spot = hb.reachTile || { x: hb.x + hb.w / 2, y: hb.y + hb.h / 2 };
            // ЧЁРНЫЙ СПИСОК: третий забег к дому, который так и не согрел —
            // ставим дом «холодным» до конца дня и ищем другое тепло
            // (диагноз t09: цикл «Мёрзну → granary_16» четыре раза до 31°)
            D._warmTries = D._warmTries || {};
            D._warmTries[hb.id] = (D._warmTries[hb.id] || 0) + 1;
            if (D._warmTries[hb.id] >= 3 && hb !== D.base) {
              D.coldHouses = D.coldHouses || {};
              D.coldHouses[hb.id] = 1;
              delete D._warmTries[hb.id];
              log((hb.id || 'дом') + ' теплом не делится — вычёркиваю из маршрута.', 'warn');
              hb = nearestHeatedBuilding(p.x, p.y);
              if (!hb) return;
              dh = dist(p.x, p.y, hb.x + hb.w / 2, hb.y + hb.h / 2);
              spot = hb.reachTile || { x: hb.x + hb.w / 2, y: hb.y + hb.h / 2 };
            }
            log((temp < PANIC_COLD ? 'Мёрзну (' + temp.toFixed(1) + '°) — до тепла бегом: ' : 'Стыну: иду в тёплый дом — ') +
                hb.id + (dh > 8 ? ' (' + Math.round(dh) + ' тайлов)' : ''));
            clearPlan();
            var wgoto = taskGoto(spot.x, spot.y, 1.2, 'тёплый дом ' + hb.id);
            wgoto.warming = true;
            D.plan = [
              wgoto,
              { type: 'warm', warming: true, stove: hb.stove, spot: spot }
            ];
            return;
          }
        }
      }
    }

    // 4) перевес — выбросить хлам
    try {
      if (WS.Inv.overload && WS.Inv.overload() > 0.3) dropJunk();
    } catch (e) { /* пусто */ }

    // 5) лечение
    if (p.hp < 55 && (p.bleed || 0) > 0 && invCount('bandage_clean') + invCount('bandage') > 0) {
      try {
        var bid = invCount('bandage_clean') > 0 ? 'bandage_clean' : 'bandage';
        WS.Health.bandage(bid);
        log('Перевязался (' + bid + '): заштопан — и обратно в строй');
      } catch (e) { /* пусто */ }
    }

    // 6) усталость днём — короткий сон не планируем: потерпим до ночи

    // 7) выполнение плана
    if (D.task) {
      var alive = false;
      try { alive = runTask(); } catch (e) {
        WS.err('demo: задача упала', e && e.message);
        alive = false;
      }
      if (!alive) {
        D.task = null;
        D.path = [];
        releaseKeys();
      } else {
        return;
      }
    }
    if (D.plan.length) {
      D.task = D.plan.shift();
      // интро-задачи исполняются как все
      return;
    }
    // новый план
    D.plan = nextActivity();
    if (D.plan.length) {
      D.task = D.plan.shift();
    }
  }

  function dropJunk() {
    var p = P();
    if (!p) return;
    for (var j = 0; j < JUNK.length; j++) {
      var id = JUNK[j];
      for (var i = 0; i < p.inv.length; i++) {
        if (p.inv[i] && p.inv[i].id === id) {
          try { WS.Inv.drop(i, 1); log(tpl(F_DROP, { x: WS.Inv.nameOf(id) })); } catch (e) { /* пусто */ }
          return;
        }
      }
    }
  }

  // ====================================================================
  //  ЭКРАН КОНТЕЙНЕРА (симуляция стоит, пока он открыт)
  // ====================================================================

  function watchScreens() {
    if (!D.active) return;
    try {
      if (WS.ContScreen && WS.ContScreen.isOpen()) {
        D.contT += 0.4;
        if (D.contT >= 1.6) {
          var o = WS.ContScreen.object();
          if (o) {
            var n = 0;
            try { n = WS.ContScreen.takeAll(); } catch (e) { n = 0; }
            if (n) log(tpl(F_LOOT, { x: o.name || 'контейнер', n: n }));
          }
          try { WS.ContScreen.close(); } catch (e) { /* пусто */ }
          D.contT = 0;
        }
        // СТРАХОВКА: экран контейнера не должен жить дольше 6 сек — иначе
        // бот замирает (think() стоит, пока Ui.modal()), задачи горят по
        // таймауту, а день утекает (диагноз Д2: 3 игровых часа на одном ящике)
        if (D.contT >= 6) {
          try { WS.ContScreen.close(); } catch (e2) { /* пусто */ }
          D.contT = 0;
          log('Экран добычи застрял — закрываю силой', 'warn');
        }
      } else {
        D.contT = 0;
      }
      // СТРАХОВКА-2: чужая модалка висит больше 10 сек при живом автопилоте —
      // закрываем верхнее окно (диалог/подтверждение не должны остановить демо)
      if (D.active && WS.Ui && WS.Ui.modal && WS.Ui.modal()) {
        D.modalT = (D.modalT || 0) + 0.4;
        if (D.modalT > 10) {
          D.modalT = 0;
          try {
            if (WS.Ui.closeTop) { WS.Ui.closeTop(); log('Закрыл застрявшее окно', 'warn'); }
          } catch (e3) { /* пусто */ }
        }
      } else {
        D.modalT = 0;
      }
    } catch (e) { /* пусто */ }
    updatePanel();
  }

  // ====================================================================
  //  UI: панель демо
  // ====================================================================

  var dom = {};

  function buildPanel() {
    if (dom.root) return;
    var root = document.createElement('div');
    root.id = 'ws-demo';
    root.className = 'hidden';
    document.body.appendChild(root);

    var head = document.createElement('div');
    head.className = 'd-head';
    root.appendChild(head);
    dom.title = document.createElement('span');
    dom.title.className = 'd-title';
    dom.title.textContent = 'ДЕМО · автопилот';
    head.appendChild(dom.title);
    var tools = document.createElement('span');
    tools.className = 'd-head-tools';
    head.appendChild(tools);
    // свернуть/развернуть (повторное — toggle)
    var mini = document.createElement('button');
    mini.className = 'd-mini';
    mini.textContent = '—';
    mini.title = 'Свернуть/развернуть панель';
    mini.addEventListener('click', function () {
      var col = root.classList.toggle('collapsed');
      mini.textContent = col ? '▸' : '—';
      try { localStorage.setItem('ws-demo-collapsed', col ? '1' : '0'); } catch (e) { /* пусто */ }
    });
    tools.appendChild(mini);
    var close = document.createElement('button');
    close.className = 'd-stop';
    close.textContent = '■ стоп';
    close.title = 'Остановить демо и вернуть управление';
    close.addEventListener('click', function () { stop('остановлено игроком'); });
    tools.appendChild(close);

    // ПЕРЕНОС ПАНЕЛИ за шапку (сохраняем позицию между запусками)
    (function makeDraggable() {
      var drag = null;
      head.addEventListener('mousedown', function (e) {
        if (e.button !== 0) return;
        if (e.target.closest('button')) return;      // кнопки не перетаскивают
        var r = root.getBoundingClientRect();
        drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
        root.classList.add('dragging');
        e.preventDefault();
      });
      window.addEventListener('mousemove', function (e) {
        if (!drag) return;
        var x = Math.max(4, Math.min(window.innerWidth - 60, e.clientX - drag.dx));
        var y = Math.max(4, Math.min(window.innerHeight - 40, e.clientY - drag.dy));
        root.style.left = x + 'px';
        root.style.top = y + 'px';
        root.style.right = 'auto';
      });
      window.addEventListener('mouseup', function () {
        if (!drag) return;
        drag = null;
        root.classList.remove('dragging');
        try {
          localStorage.setItem('ws-demo-pos', root.style.left + ';' + root.style.top);
        } catch (e) { /* пусто */ }
      });
    })();
    // восстановить сохранённую позицию/свёрнутость
    try {
      var pos = localStorage.getItem('ws-demo-pos');
      if (pos && pos.indexOf(';') > 0) {
        var pp = pos.split(';');
        root.style.left = pp[0]; root.style.top = pp[1]; root.style.right = 'auto';
      }
      if (localStorage.getItem('ws-demo-collapsed') === '1') {
        root.classList.add('collapsed');
        mini.textContent = '▸';
      }
    } catch (e) { /* пусто */ }

    dom.status = document.createElement('div');
    dom.status.className = 'd-status';
    root.appendChild(dom.status);

    dom.action = document.createElement('div');
    dom.action.className = 'd-action';
    root.appendChild(dom.action);

    var speeds = document.createElement('div');
    speeds.className = 'd-speeds';
    root.appendChild(speeds);
    var paceLbl = document.createElement('span');
    paceLbl.className = 'd-pace-lbl';
    paceLbl.textContent = 'темп:';
    speeds.appendChild(paceLbl);
    [1, 2].forEach(function (pk) {
      var b = document.createElement('button');
      b.className = 'd-sp' + (pk === D.pace ? ' on' : '');
      b.textContent = '×' + pk;
      b.title = pk === 1 ? 'Спокойный темп (рекомендуется)' : 'Торопливый: вдвое быстрее, но холоднее';
      b.addEventListener('click', function () {
        D.pace = pk;
        var all = speeds.querySelectorAll('button.d-sp');
        for (var i = 0; i < all.length; i++) all[i].classList.remove('on');
        b.classList.add('on');
        speedHold = 0;
      });
      speeds.appendChild(b);
    });
    dom.speed = document.createElement('span');
    dom.speed.className = 'd-cur-speed';
    dom.speed.textContent = '×' + D.curSpeed;
    dom.speed.title = 'Текущий автоматический темп (демо подбирает само: ходьба/дом/сон)';
    speeds.appendChild(dom.speed);
    var pause = document.createElement('button');
    pause.className = 'd-sp d-pause';
    pause.textContent = '⏸';
    pause.title = 'Пауза (пробел — продолжить)';
    pause.addEventListener('click', function () {
      var paused = WS.Ui && WS.Ui.isPaused && WS.Ui.isPaused();
      if (paused) { WS.Ui.unpause(); }
      else { WS.Ui.pause(); }
    });
    speeds.appendChild(pause);

    dom.log = document.createElement('div');
    dom.log.className = 'd-log';
    root.appendChild(dom.log);

    var foot = document.createElement('div');
    foot.className = 'd-foot';
    root.appendChild(foot);
    var dl = document.createElement('button');
    dl.className = 'd-dl';
    dl.textContent = '⬇ журнал демо (.txt)';
    dl.title = 'Выгрузить полный журнал прохождения';
    dl.addEventListener('click', downloadJournal);
    foot.appendChild(dl);

    dom.root = root;
  }

  function updatePanelLog() {
    if (!dom.log) return;
    var n = D.journal.length;
    var from = Math.max(0, n - 7);
    var html = '';
    for (var i = from; i < n; i++) {
      var j = D.journal[i];
      html += '<div class="dl-line' + (j.cls === 'bad' ? ' bad' : j.cls === 'good' ? ' good' : '') +
        '"><span class="dl-t">' + j.t + '</span> ' + escapeHtml(j.txt) + '</div>';
    }
    dom.log.innerHTML = html;
    dom.log.scrollTop = dom.log.scrollHeight;
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function updatePanel() {
    if (!dom.root || !D.active) return;
    var g = G();
    var p = g && g.player;
    var phaseTxt = { intro: 'обустройство', live: 'выживание', final: 'финал: сигнальный костёр',
                     shipwait: 'ждём пароход', done: 'завершено' }[D.phase] || D.phase;
    dom.status.textContent = 'День ' + dayN() + '/60 · ' + fmtTime() + ' · ' + phaseTxt +
      ' · ' + Math.round(outsideTemp()) + '° · темп ×' + D.curSpeed;
    var act = '—';
    if (p && p.sleeping) act = V.pick(['спит (храпом скрепляет дом)', 'спит (храп пугает волков)']);
    else if (D.task) act = (D.task.label || taskName(D.task)) || 'занят делом';
    else if (D.path && D.path.length) act = 'идёт';
    dom.action.textContent = act;
  }

  function taskName(t) {
    var names = {
      search: 'обыск', harvest: 'сбор', equip: 'переодевание', eat: 'еда', drink: 'питьё',
      sleep: 'ложится спать', melt: 'топит снег', craft: 'крафт', craftwait: 'работает',
      warm: 'греется', wait: 'передышка', hunt: 'охота', beacon: 'сигнальный костёр',
      fish: 'рыбачит', cookfish: 'печёт рыбу', chopwood: 'рубит ветки',
      groundsearch: 'ищет под снегом',
      goto: 'в пути', _fleeing: 'прячется!'
    };
    return names[t.type] || t.type;
  }

  // ====================================================================
  //  СТАРТ / СТОП
  // ====================================================================

  function setSpeed(n) {
    D.curSpeed = n;
    try { WS.Loop.setSpeed(n); } catch (e) { /* пусто */ }
  }

  /** Адаптивный темп: контекст решает, насколько гнать время. */
  function autoSpeed(dt) {
    if (speedHold > 0) { speedHold -= dt; return; }
    var p = P();
    if (!p) return;
    var want;
    if (p.sleeping) want = SP_SLEEP;
    else if (D.task && (D.task.type === 'warm')) {
      // СКОРОСТЬ ×60 БЕЗ ОГНЯ — СМЕРТЕЛЬНЫЙ FAST-FORWARD: часы летят, а тепло
      // не приходит (костёр прогорел, печь не растоплена) — герой замерзал
      // за «0 минут» (диагноз роя: охотник у догоревшего костра). Без огня —
      // не быстрее ×12.
      var fireSp = (WS.Fire && WS.Fire.near) ? WS.Fire.near(p.x, p.y, 3) : null;
      want = fireSp ? SP_WARM : (insideBuilding() ? 24 : Math.min(SP_INDOOR, 12));
    }
    else if (D.task && (D.task.type === 'wait' || D.task.type === 'melt' ||
             D.task.type === 'craftwait' || D.task.type === 'chopwood')) want = SP_WAIT;
    else if (insideBuilding()) want = SP_INDOOR;
    else want = SP_WALK;
    // ДОЛГИЙ ПЕРЕХОД ПО УЛИЦЕ — ТЕМП ИГРОКА НЕ РАЗГОНЯЕТ МОРОЗ:
    // движение в реальном времени, а часы — множителем; при ×12 тридцать
    // тайлов пути стоят 3+ игровых часа стужи, и бот замерзал на полдороге
    // (диагноз Д1 19:05, −5° за один переход). Дальние цели — всегда ×6.
    var trek = 0;
    if (D.task && typeof D.task.tx === 'number' && typeof D.task.ty === 'number') {
      trek = dist(p.x, p.y, D.task.tx, D.task.ty);
    }
    var longTrek = !p.sleeping && !insideBuilding() && trek > 12 && D.path.length > 12;
    if (longTrek) {
      // ОСТЫВШИЙ ГЕРОЙ ИДЁТ МЕДЛЕННЕЕ (по часам): тот же путь — вдвое
      // меньше игровых часов стужи. Мороз на дистанции решает всё
      // (диагноз роя №18: 40 тайлов интро = −4...−6° насквозь)
      want = Math.min(want, (p.temp || 37) < 35.8 ? 3 : SP_WALK);
    } else {
      want = Math.round(want * (D.pace || 1));
    }
    if (want !== D.curSpeed) {
      setSpeed(want);
      speedHold = 0.4;                  // гистерезис: не дёргаем чаще 2/сек
      updatePanel();
    }
  }

  function applyProfession() {
    // как menu.js onStart: навыки и стартовый груз профессии
    // WS.Data.professions — {id: prof}-карта (menu.js), терпим и массив
    var profsRaw = (WS.Data && WS.Data.professions) || {};
    // профессия ФАКТИЧЕСКОЙ партии (рой агентов играет разными героями),
    // не константой демо — иначе охотник получал бы груз телеграфиста
    var profId = (P() && P().prof) || D._prof || DEMO_PROF;
    var prof = null, k;
    if (Array.isArray(profsRaw)) {
      for (k = 0; k < profsRaw.length; k++) if (profsRaw[k].id === profId) prof = profsRaw[k];
    } else {
      prof = profsRaw[profId] || null;
    }
    if (!prof) prof = { id: profId, items: [], skills: {} };
    var p = P();
    if (!p) return;
    var sk = prof.skills || {};
    for (k in sk) {
      if (sk.hasOwnProperty(k) && p.skills && p.skills[k]) {
        p.skills[k].lv = Math.max(p.skills[k].lv || 0, Math.min(10, sk[k]));
      }
    }
    var items = prof.items || [];
    for (var j = 0; j < items.length; j++) {
      try { WS.Inv.give(items[j].id, items[j].n || 1); } catch (e) { /* пусто */ }
    }
  }

  function start(opts) {
    opts = opts || {};
    if (D.active) return false;
    // ПАРАМЕТРИЧЕСКИЙ СТАРТ: профессия/зерно/черты можно задать снаружи —
    // рой агентов тестирует игру разными героями в разных мирах
    // (требование: игра проходится за ЛЮБУЮ профессию).
    var prof = opts.prof || DEMO_PROF;
    var seed = (opts.seed !== undefined) ? opts.seed : DEMO_SEED;
    var traits = opts.traits || DEMO_TRAITS;
    D._prof = prof;
    D._seed = seed;
    try {
      if (!WS.Main.newGame(prof, traits, seed)) return false;
    } catch (e) {
      WS.err('demo: newGame', e && e.message);
      return false;
    }
    applyProfession();
    // ОДЕТЬСЯ НЕМЕДЛЕННО: на морозе каждая минута раздетым — минус градус
    try {
      if (WS.Action.equipBest) WS.Action.equipBest();
    } catch (e) { /* пусто */ }

    D.active = true;
    D.phase = 'intro';
    D.plan = [];
    D.task = null;
    D.path = [];
    D.journal = [];
    D.result = '';
    D.fallbackUsed = false;
    D.huntsDone = 0;
    D.shotsDone = 0;
    D.melted = 0;
    D.rebuilds = 0;
    D.avoid = {};
    D.startStamp = stamp();
    D.startedAt = Date.now();
    D.world = scanWorld();
    D.base = D.world ? D.world.base : null;

    buildPanel();
    if (dom.root) dom.root.classList.remove('hidden');
    setSpeed(SP_WALK);
    try { WS.Ui.unpause(); } catch (e) { /* пусто */ }

    if (D.watchIv) clearInterval(D.watchIv);
    D.watchIv = setInterval(watchScreens, 400);

    log('ДЕМО старт: ' + profNameRu(prof) + ' сошёл на Пристань-Тихой. Зерно мира — ' + seed + ': год подходящий.', 'good');
    log('План: обжить тёплую избу, пить из снега, к 55-му дню иметь 3 факела — и подать пароходу сигнал. Скромно и по-своему величаво.');
    if (D.base) {
      log('База: ' + D.base.id + ' (' + D.base.type + ') @' + D.base.x + ',' + D.base.y +
        (D.base.heated ? ' — из трубы идёт дым, дом тёплый' : ' — дом холодный') +
        (D.base.bed ? ', есть кровать' : '') + (D.base.stove ? ', есть печь' : ''));
    } else {
      log('Тёплой избы с кроватью не нашлось: ночи будут аскетичные.', 'bad');
    }
    var sealed = D.world ? D.world.sealed : null;
    if (sealed && (sealed.beds || sealed.stoves || sealed.containers)) {
      log('⚠ Мир: запечатано генератором — кроватей: ' + sealed.beds + ', печей: ' + sealed.stoves +
        ', контейнеров: ' + sealed.containers + ' (недостижимы даже после ремонта дверей — пропускаю).', 'bad');
    }

    // интро-план: сразу к тёплой базе — вокзал холодный, и обыски на
    // нуле температуры — верная смерть. По дороге сработает автоподогрев
    // в любом тёплом доме (barn_10 как раз по пути). Вокзал обыщем позже.
    var p = P();
    if (D.base) {
      var introSpot = D.base.reachTile || { x: D.base.x + D.base.w / 2, y: D.base.y + D.base.h / 2 };
      var ig = taskGoto(introSpot.x, introSpot.y, 1.4, 'тёплая изба (база)');
      // homeTrip: порог реагирования на холод — панический (не бросает
      // путь из-за лёгкой прохлады), но укрыться в ближнем дому можно
      ig.homeTrip = true;
      D.plan = [ig];
      for (var c2 = 0; c2 < D.base.containers.length; c2++) {
        D.plan.push(taskGoto(D.base.containers[c2].x, D.base.containers[c2].y, 1.8, 'обыск: изба (база)'));
        D.plan.push({ type: 'search', o: D.base.containers[c2] });
      }
      if (D.base.bed) D.plan.push(taskGoto(D.base.bed.x, D.base.bed.y, 1.4, 'кровать'));
      D.plan.push({ type: 'equip' });
    } else {
      D.plan = [taskGoto(35.5, 139.5, 1.4, 'вокзал (своя контора)')];
    }
    D.phase = 'live';
    return true;
  }

  /** Название профессии по-русски для журнала. */
  function profNameRu(id) {
    var map = { telegraph: 'телеграфист', hunter: 'охотник', carpenter: 'плотник',
                cook: 'повар', medic: 'фельдшер', convict: 'беглый' };
    try {
      if (WS.Data && WS.Data.professions && WS.Data.professions[id] && WS.Data.professions[id].name) {
        return String(WS.Data.professions[id].name).toLowerCase();
      }
    } catch (e) { /* пусто */ }
    return map[id] || id;
  }

  function stop(reason) {
    if (!D.active) return;
    D.active = false;
    D.endedAt = Date.now();
    releaseKeys();
    if (D.watchIv) { clearInterval(D.watchIv); D.watchIv = 0; }
    try { WS.Loop.setSpeed(1); } catch (e) { /* пусто */ }
    if (dom.root) dom.root.classList.add('hidden');
    log('Демо остановлено: ' + (reason || 'причина не указана'));
    WS.log('[Demo] остановлен:', reason || '');
  }

  /** Продолжить демо на ЗАГРУЖЕННОЙ партии — для записи прохождения
   *  по фазам (запись длиннее лимита одного запуска: сейв → новый запуск →
   *  resume с тем же журналом). Честность та же: бот играет теми же правилами. */
  function resume(opts) {
    opts = opts || {};
    if (D.active) return false;
    if (!WS.G || !WS.G.running || !WS.G.player) return false;
    D.active = true;
    D.phase = 'live';
    D.plan = [];
    D.task = null;
    D.path = [];
    D.journal = opts.journal || [];
    D.result = opts.result || '';
    D.fallbackUsed = !!opts.fallbackUsed;
    D.huntsDone = opts.huntsDone || 0;
    D.shotsDone = opts.shotsDone || 0;
    D.melted = opts.melted || 0;
    D.rebuilds = 0;
    D.avoid = {};
    D.startStamp = opts.startStamp || stamp();
    D.startedAt = opts.startedAt || Date.now();
    D.world = scanWorld();
    D.base = D.world ? D.world.base : null;

    buildPanel();
    if (dom.root) dom.root.classList.remove('hidden');
    setSpeed(SP_WALK);
    try { WS.Ui.unpause(); } catch (e) { /* пусто */ }

    if (D.watchIv) clearInterval(D.watchIv);
    D.watchIv = setInterval(watchScreens, 400);

    log('Запись прохождения продолжена (фаза ' + (opts.phase || '?') +
      '): день ' + dayN() + ', герой при деле.', 'good');
    return true;
  }

  // ====================================================================
  //  ФИНАЛ: победа / смерть
  // ====================================================================

  function onFinish(kind) {
    if (!D.active) return;
    D.result = kind;
    D.phase = 'done';
    releaseKeys();
    var mins = Math.round((Date.now() - D.startedAt) / 60000);
    if (kind === 'victory') {
      log('★ ПАРОХОД ПРИШЁЛ — по расписанию, как честный поезд. Победа за ' + mins + ' мин реального времени.', 'good');
      log('Нажми «⬇ журнал демо» на панели — выгрузится полный отчёт для разбора полётов.');
    } else {
      log('✝ Герой погиб (' + mins + ' мин). Север не договаривает — журнал скажет за него.', 'bad');
    }
    // панель остаётся видимой (журнал + выгрузка); автопилот выключаем
    D.active = false;
    if (D.watchIv) { clearInterval(D.watchIv); D.watchIv = 0; }
    try { WS.Loop.setSpeed(1); } catch (e) { /* пусто */ }
    updatePanel();
  }

  // ====================================================================
  //  ТИК АВТОПИЛОТА
  // ====================================================================

  function demoTick(dt) {
    if (!D.active) return;
    var g = G();
    if (!g || !g.running) return;

    // адаптивный темп (до движения и «мыслей»)
    autoSpeed(dt);

    // движение по пути (каждый шаг симуляции — плавно)
    driveMovement();
    stuckCheck();

    // «мысли» — не чаще, чем THINK_EVERY
    D.thinkT -= dt;
    if (D.thinkT <= 0) {
      D.thinkT = THINK_EVERY;
      think();
    }
  }

  // ====================================================================
  //  BOOT
  // ====================================================================

  WS.boot(function initDemo() {
    // автопилот — до игрока (60) и действий (61)
    WS.tick(TICK_PRI, demoTick, 'demo:pilot');

    // сводка дня
    WS.Ev.on('time:day', function () {
      if (D.active) onDayChange();
    });

    // финалы
    WS.Ev.on('game:victory', function () { onFinish('victory'); });
    WS.Ev.on('player:die', function () {
      if (D.active) onFinish('death');
    });

    // клавиша D5/F5? нет: у демо своя кнопка в меню. Горячая клавиша выключения:
    window.addEventListener('keydown', function (e) {
      if (!D.active) return;
      if (e.code === 'F8') { stop('F8'); }
    }, false);

    WS.log('demo: автопилот зарегистрирован (тик ' + TICK_PRI + ')');
  }, 'demo:init');

  // ====================================================================
  //  ПУБЛИЧНЫЙ API
  // ====================================================================

  WS.def('Demo', {
    start: start,
    stop: stop,
    resume: resume,
    active: function () { return D.active; },
    setSpeed: setSpeed,
    /** Темп игрока (1 или 2) — для записи честного прохождения. */
    pace: function (n) {
      if (n === 1 || n === 2) { D.pace = n; speedHold = 0; }
      return D.pace;
    },
    journal: function () { return D.journal.slice(); },
    journalText: journalText,
    downloadJournal: downloadJournal,
    /** Отладка в консоли: состояние автопилота. */
    _state: function () { return D; },
    /** Отладка: поиск пути (те же внутренности, что у автопилота). */
    _findPath: function (a, b, c, d) { return findPath(a, b, c, d); },
  });
})();
