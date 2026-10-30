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
 * ТЕМП: на улице часы идут ×6 (мороз честный — бег не успевает за стрелкой),
 * в доме ×14, ожидание ×60, у печи ×90, сон ×120; темп игрока ×1/×2.
 * Прогресс пишется в демо-слот сейва: вкладку можно закрыть и продолжить
 * позже — кнопка «▶ Демо» предложит продолжение. Сейв игрока не трогается.
 * Панель демо: день, час, дело, журнал, темп, стоп, выгрузка журнала (.txt).
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

  // АДАПТИВНАЯ СКОРОСТЬ ДЕМО — РЕАЛИЗМ ВРЕМЕНИ (по требованию игрока:
  // «очень быстро нереально идет время на обычной скорости в демо»).
  // Масштаб игры: при ×1 одна игровая минута = одна реальная секунда
  // (сутки = 24 реальные минуты). Демо держит ЧЕСТНЫЕ ЧАСЫ на улице:
  //   на улице  ×2 — переход через посёлок занимает «игровые минуты»,
  //                 как в жизни: часы ползут, пока дед идёт;
  //   в доме  ×8 — обыски и быт без занудства;
  //   у печи / ожидание / плавка ×30;
  //   сон ×160 — ночь пролетает (это естественно для сна).
  // Темп игрока (кнопки ×1…×8) умножает всё сверху: ×1 — реализм.
  // ГЛАВНОЕ ПРАВИЛО: НА УЛИЦЕ темп низкий, какая бы задача ни шла —
  // иначе часы съедают запасы быстрее, чем дед доходит.
  var SP_WALK = 2, SP_INDOOR = 8, SP_WAIT = 30, SP_WARM = 30, SP_SLEEP = 160;
  var speedHold = 0;                    // сек до следующей смены темпа

  // пороги выживания (0..100)
  var EAT_AT = 48;
  var DRINK_AT = 48;
  var SLEEP_AT = 34;
  var WARM_AT = 36.6;                   // °C ядра — ниже ищем тепло немедленно
  var PANIC_COLD = 35.4;

  var SLEEP_HOUR = 21.4;                // лечь спать
  var WAKE_HOUR = 6.1;                  // встать
  var HOME_HOUR = 17.0;                 // возвращаться к вечеру

  var FINAL_DAY = 55;                   // «дым на реке»
  var TORCHES_NEED = 3;
  var HUNT_FROM_DAY = 12;               // когда начинать охоту (если есть винтовка)

  // что выбрасываем при перевесе (в порядке очереди).
  // ВАЖНО: newspaper_stack НЕ выбрасываем — из газет рвётся трут (тряпьё)
  // для факелов; в дед-режиме это материал Магического Огня.
  var JUNK = ['brick_broken', 'bone_old', 'bottle_empty', 'jar_empty', 'cup_clay',
    'plate_tin', 'spoon_wood', 'mug_tin', 'scrap_metal', 'nails', 'hay_bale',
    'letter_old', 'telegraph_form', 'chuni', 'lapti', 'porshni',
    'staple_iron', 'hinge_iron', 'tar_bucket', 'brick_stack', 'axle_wood'];

  // ДЕД-РЕЖИМ: что НЕЛЬЗЯ выбрасывать и что СТОИТ забирать из контейнеров.
  // Дед не мёрзнет и не ест — еда/одежда/хлам только валят перевес
  // (57 кг на 31,5 = штраф скорости −30%..−85%). Берём лишь материалы
  // Магического Огня, хилки и дедовское оружие.
  var CRAZY_KEEP = {
    // факелы и их материалы (дров дед не берёт: не мёрзнет — только вес)
    torch: 1, plank: 1, cloth_rag: 1, fat: 1, lamp_oil: 1,
    newspaper_stack: 1,
    // дедовские хилки (ХП-часы лечат только они)
    joint_ded: 1, tincture_fly: 1, mushroom_fun: 1, candy_ded: 1,
    // оружие и обувка изгнания
    plunger_magic: 1, hammer_rubber: 1, pan_war: 1, boots_swift: 1,
    // спички — на всякий случай (вес копеечный)
    matches: 1, flint: 1
  };

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
    thinkT: 0,
    keysHeld: {},
    warmOK: false,                      // гистерезис тепла: недавно согрелись
    warmFail: {},                       // id дома -> сколько раз не дошёл
    warmToldId: '',                     // о каком доме warming уже сказано
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
    beaconFired: false,                 // зажжён ли Магический Огонь (дед-режим)
    _ffwdSaidDay: 0,                    // день последней записи про перемотку сном
    _finalSaid: false,                  // сказано ли про зов тарелки
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

  function dist(ax, ay, bx, by) { var dx = bx - ax, dy = by - ay; return Math.sqrt(dx * dx + dy * dy); }
  function hourF() { return WS.Time ? WS.Time.hourF() : 8; }
  function dayN() { return WS.Time ? WS.Time.day() : 1; }
  /** Абсолютная игровая минута партии — для кулдаунов зверей. */
  function absMin() { return (dayN() - 1) * 1440 + hourF() * 60; }
  function outsideTemp() {
    try { return WS.Weather.tempOutside(); } catch (e) { return -15; }
  }
  function invCount(id) {
    try { return WS.Inv.count(id) || 0; } catch (e) { return 0; }
  }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  /** Режим «Безумный Дед»: нужды заморожены, дед не мёрзнет/не голодает —
   *  выживание сводится к ХП-часам, грибной энергии и 3 факелам. */
  function crazy() { return !!(WS.Crazy && WS.Crazy.active && WS.Crazy.active()); }

  /** Грибная энергия (для журнала/решений бота). */
  function shroomEnergy() {
    try { return WS.Crazy && WS.Crazy.energy ? WS.Crazy.energy() : 0; }
    catch (e) { return 0; }
  }

  function fmtTime() {
    var h = Math.floor(hourF()), m = Math.floor((hourF() - h) * 60);
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }

  /** Строка дня для журнала: «Д12 14:35». */
  function stamp() { return 'Д' + dayN() + ' ' + fmtTime(); }

  // ====================================================================
  //  ЖУРНАЛ ДЕМО
  // ====================================================================

  var JKEY = 'wsDemoJournal1917';       // журнал демо (переживает перезапуск вкладки)

  function persistJournal() {
    try { localStorage.setItem(JKEY, JSON.stringify(D.journal.slice(-400))); }
    catch (e) { /* переполнение не критично */ }
  }

  function restoreJournal() {
    try {
      var raw = localStorage.getItem(JKEY);
      if (raw) {
        var a = JSON.parse(raw);
        if (Object.prototype.toString.call(a) === '[object Array]') D.journal = a;
      }
    } catch (e) { /* пусто */ }
  }

  function log(txt, cls) {
    D.journal.push({ t: stamp(), txt: String(txt), cls: cls || '' });
    if (D.journal.length > 900) D.journal.shift();
    try {
      if (WS.Story && WS.Story.chron) WS.Story.chron('[демо] ' + txt, 'anom');
    } catch (e) { /* хроники не критичны */ }
    updatePanelLog();
    persistJournal();                   // пережить закрытие вкладки
  }

  /** Мысль деда (из WS.Thoughts): в журнал отдельным стилем. */
  function thoughtLog(text) {
    D.journal.push({ t: stamp(), txt: '💭 ' + text, cls: 'think' });
    if (D.journal.length > 900) D.journal.shift();
    updatePanelLog();
    persistJournal();
  }

  /** Итоговый текст журнала для выгрузки. */
  function journalText() {
    var g = G();
    var lines = [];
    lines.push('БЕЛОЕ БЕЗМОЛВИЕ — журнал демо-прохождения');
    lines.push('======================================');
    lines.push('Начало: ' + (D.startStamp || '?') +
      ' · профессия: телеграфист · зерно мира: ' + DEMO_SEED);
    if (D.resumedFrom) {
      lines.push('Продолжение сеанса с дня ' + D.resumedFrom +
        ' (прогресс хранился в демо-слоте сейва).');
    }
    lines.push('Скорость демо: адаптивная, реализм времени (ходьба ×' + SP_WALK +
      ' — часы честные, дом ×' + SP_INDOOR + ', сон ×' + SP_SLEEP + '), темп игрока ×' + D.pace + ' · результат: ' +
      (D.result === 'victory' ? (crazy() ? 'ПОБЕДА — тарелка прилетела' : 'ПОБЕДА — пароход пришёл') :
       D.result === 'death' ? (crazy() ? 'ХП деда иссякли — дед уснул' : 'герой погиб') : 'демо остановлено'));
    if (g) {
      var st = g.stats || {};
      if (crazy()) {
        var cz2 = WS.Crazy ? WS.Crazy.state() : null;
        lines.push('Дней прожито: ' + dayN() + '/60 · обыскано: ' + (st.containersLooted || 0) +
          ' · скрафчено: ' + (st.itemsCrafted || 0) +
          ' · изгнано мультяшек: ' + (cz2 ? cz2.banished : 0) +
          ' · прикорнул раз: ' + (cz2 ? cz2.respawns : 0) +
          ' · факелов сожжено в огне: ' + (D.beaconFired ? 'да' : 'нет'));
      } else {
        lines.push('Дней прожито: ' + dayN() + '/60 · обыскано: ' + (st.containersLooted || 0) +
          ' · скрафчено: ' + (st.itemsCrafted || 0) + ' · волков убито: ' + (st.wolvesKilled || 0) +
          ' · оленей/зайцев: ' + (st.animalsHunted || 0));
      }
    }
    lines.push('Выстрелов сделано: ' + D.shotsDone + ' · фляг воды растоплено: ' + D.melted +
      (D.fallbackUsed ? ' · ФАКЕЛЫ ВЫДАНЫ ДЕМО-РЕЖИМОМ (не хватило жира/масла в мире — см. баланс)' : ''));
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

    // база: ближайший к вокзалу ДОМ «С ДЫМОМ» с кроватью (дым = в доме
    // реально тепло, см. Temp.heatedRoom). Дистанция важнее печи: до
    // дальней тёплой избы бот не дойдёт живым в стартовой шинели.
    // Скоринг: тепло +100, печь +15, −1.2 за тайл от вокзала.
    var base = null, baseScore = -1e9;
    for (i = 0; i < bl.length; i++) {
      var c = bl[i];
      if (c.type === 'hermit_hut' || !c.bed) continue;
      var sc = (c.heated ? 100 : 0) + (c.stove ? 15 : 0) - c.distSpawn * 1.2;
      if (sc > baseScore) { baseScore = sc; base = c; }
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
   *  без риска замерзнуть. Потом — всё подряд по близости. */
  /** Дрова/трут/спички — «набор выживания»: без них дальняя ходьба
   *  смертельна (костёр на снегу — единственное тепло в чистом поле). */
  function woodCount() {
    return invCount('firewood_bundle') + invCount('plank') + invCount('log');
  }

  /** Приоритет цели лута: без дров — прежде всего поленницы
   *  (в дед-режиме дрова не нужны — дед не мёрзнет). */
  function lootRank(t, p) {
    var nm = String((t.o && t.o.name) || '').toLowerCase();
    var s = p ? dist(p.x, p.y, t.o.x, t.o.y) : t.d;
    if (!crazy() && woodCount() === 0 && nm.indexOf('оленн') >= 0) s -= 100;   // Поленница!
    if (!crazy() && woodCount() === 0 && nm.indexOf('дровн') >= 0) s -= 100;
    return s;
  }

  function nextLootTarget(n) {
    var p = P();
    var cold = !crazy() && p && (p.temp || 37) < 37.2;
    var out = [];
    var i;
    if (cold) {
      // сначала — тёплые дома: обыск без риска замерзнуть
      for (i = 0; i < D.world.loot.length && out.length < (n || 2); i++) {
        var t = D.world.loot[i];
        if (!t.o || t.o.looted || t.taken) continue;
        if (!t.home || !t.home.heated) continue;
        if ((t.o._demoFail || 0) >= 2) { t.taken = true; continue; }
        out.push(t);
      }
    }
    // остальные — по приоритету от игрока: без дров поленницы важнее
    var byPlayer = [];
    for (i = 0; i < D.world.loot.length; i++) {
      var t2 = D.world.loot[i];
      if (!t2.o || t2.o.looted || t2.taken) continue;
      if (out.indexOf(t2) >= 0) continue;
      if ((t2.o._demoFail || 0) >= 2) { t2.taken = true; continue; }
      byPlayer.push({ t: t2, d: lootRank(t2, p) });
    }
    byPlayer.sort(function (a, b2) { return a.d - b2.d; });
    for (i = 0; i < byPlayer.length && out.length < (n || 2); i++) out.push(byPlayer[i].t);
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
        if (o.door && ignoreDoor !== false) continue;   // дверь откроем на подходе
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
        // ЦЕНА РЕЛЬЕФА: глубокий снег 2.6 / снег 1.5 / дорога 1 —
        // бот больше не лезет напрямик через сугробы со скоростью
        // черепахи, а идёт по дороге/утоптанному (жалоба: «тупит и
        // движется медленно»). Эвристика остаётся адекватной (мин. цена 1).
        var cost = 1;
        try { cost = w.terrainMoveCost(nx, ny) || 1; } catch (eC) { cost = 1; }
        if (!isFinite(cost) || cost <= 0) cost = 1;
        var step = (DIRS[k][0] && DIRS[k][1]) ? Math.SQRT2 * cost : cost;
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

  function releaseKeys() {
    setKeys({});
    // виртуальный джойстик тоже гасим — иначе бот «поплывёт» сам
    try { if (WS.Input && WS.Input.clearVirtual) WS.Input.clearVirtual(); } catch (e) { /* пусто */ }
  }

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

  /** Точка пути пройдена «за себя»: ушли за неё в сторону СЛЕДУЮЩЕЙ
   *  точки (проекция положительна) — снимаем, не доводя до идеала.
   *  Раньше бот кружил вокруг путевой точки: дошёл до 0.5, повернул,
   *  снова 0.5… «Обхожу препятствие» бесконечно. */
  function passedBehind(p, wp, d) {
    if (d >= 1.3) return false;
    var nx = D.path[1];
    if (!nx) return false;
    var vx = p.x - wp.x, vy = p.y - wp.y;      // куда ушли от точки
    var tx = nx.x - wp.x, ty = nx.y - wp.y;    // куда нужно было идти
    return (vx * tx + vy * ty) > 0;            // ушли вперёд за точку
  }

  /** Ведём игрока по пути. Возвращает true, если ещё идём. */
  function driveMovement() {
    var p = P();
    if (!p || p.sleeping || !D.path.length) { releaseKeys(); return false; }
    var wp = D.path[0];
    var dx = wp.x - p.x, dy = wp.y - p.y;
    var d = Math.sqrt(dx * dx + dy * dy);
    if (d < 0.45 || passedBehind(p, wp, d)) {
      D.path.shift();
      D.stuckRebuilds = 0;
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
        try {
          if (WS.Action.toggleDoor(door)) {
            log('Открыл дверь' + (door.name ? ' (' + door.name.toLowerCase() + ')' : ''));
          }
        } catch (e) { /* пусто */ }
        D.doorCd = 0.25;
      }
      return true;
    }

    // ВИРТУАЛЬНЫЙ ДЖОЙСТИК: точное аналоговое направление вместо
    // 8 квантованных WASD. Раньше одна клавиша давала мировую ДИАГОНАЛЬ
    // (±40° от нужного курса) — бот шёл дугой, кружил вокруг путевых
    // точек и вечно «обходил препятствие». Теперь курс точный.
    // Экран = 32*(dx-dy), 16*(dx+dy) — обратная изометрическая матрица.
    var sx = 32 * (dx - dy), sy = 16 * (dx + dy);
    var mAx = Math.max(Math.abs(sx), Math.abs(sy)) || 1;
    try { WS.Input.setVirtual(sx / mAx, sy / mAx); } catch (eV) { /* пусто */ }

    // НА УЛИЦЕ ВСЕГДА БЕГ (если есть дыхание): бег вдвое быстрее и
    // греет +3° — каждая минута на морозе стоит полградуса.
    var outsideNow = !!(W() && W().isInside && !W().isInside(p.x, p.y));
    var want = {};
    if (D.path.length >= 2 && (p.breath || 1) > 0.45 && !p.sneaking &&
        (outsideNow || D.path.length > 5)) {
      want.ShiftLeft = true;
    }
    setKeys(want);
    return true;
  }

  /** Детект застревания: не двигаемся, хотя путь есть.
   *  СПАМ-ФИКС: «Обхожу препятствие» пишется ОДИН раз на эпизод
   *  (жалоба игрока на простыню одинаковых строк), а после 3 неудачных
   *  перестроек задача бросается — бот не залипает на часы. */
  function stuckCheck() {
    var p = P();
    if (!p || !D.path.length) { D.stuckT = 0; D.stuckRebuilds = 0; return; }
    D.stuckCheckT -= 1 / 60;
    if (D.stuckCheckT > 0) return;
    D.stuckCheckT = 0.7;
    var moved = dist(p.x, p.y, D.lastX, D.lastY);
    D.lastX = p.x; D.lastY = p.y;
    if (moved < 0.18) {
      D.stuckT += 0.7;
      if (D.stuckT > 1.4) {
        D.stuckRebuilds = (D.stuckRebuilds || 0) + 1;
        if (D.stuckRebuilds === 1) log('Обхожу препятствие…');
        if (D.stuckRebuilds > 3) {
          D.stuckT = 0; D.stuckRebuilds = 0;
          dropTask('не пробиться, пропускаю');
          return;
        }
        // перестроить путь с текущего места
        var last = D.path[D.path.length - 1];
        var np = findPath(p.x, p.y, last.x, last.y);
        if (np && np.length) { D.path = np; D.stuckT = 0; }
        else { D.stuckT = 0; D.stuckRebuilds = 0; dropTask('путь не найден, пропускаю'); }
      }
    } else {
      D.stuckT = 0;
      D.stuckRebuilds = 0;
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
  var TASK_TIMEOUT = { search: 30, hunt: 120, banish: 100, beacon: 90, melt: 180, warm: 360, sleep: 99999 };

  function runTask() {
    var t = D.task;
    var p = P();
    if (!p) return false;
    t.t += 1 / 60;

    // глобальный таймаут: ни одна задача не живёт дольше 6 минут
    var tLimit = TASK_TIMEOUT[t.type] || 360;
    if (t.t > tLimit) {
      log('Задача «' + taskName(t) + '» зависла — пропускаю');
      return false;
    }

    switch (t.type) {
      case 'goto':
        if (!D.path.length) {
          var np = findPath(p.x, p.y, t.x, t.y);
          if (!np) {
            log('Не нашёл путь к ' + (t.label || ('(' + (t.x | 0) + ',' + (t.y | 0) + ')')));
            if (t.o) t.o._demoFail = (t.o._demoFail || 0) + 1;
            if (t.bldg) D.warmFail[t.bldg.id] = (D.warmFail[t.bldg.id] || 0) + 1;
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
        // ФИКС «вечно иду к цели»: диагональный соседний тайл даёт 1.41 —
        // старый порог 1.35 не пускал обыск НИКОГДА (бот топтался днями).
        // Теперь: доходим до ближайшего возможного тайла и обыскиваем.
        if (d > 1.85) {
          if (!D.path.length) {
            var np2 = findPath(p.x, p.y, o.x, o.y);
            if (!np2) {
              o._demoFail = (o._demoFail || 0) + 1;
              return false;
            }
            D.path = np2;
          }
          // конец пути у самых ног — ближе не подобраться: обыскиваем отсюда
          var lastPt2 = D.path[D.path.length - 1];
          if (dist(p.x, p.y, lastPt2.x, lastPt2.y) > 0.8) return true;   // ещё идём
          D.path = [];
        }
        releaseKeys();
        if (o.looted) return false;
        if (WS.ContScreen && WS.ContScreen.isOpen()) return true;   // смотрим добычу
        if (WS.Loot.isSearching && WS.Loot.isSearching()) return true;
        try {
          if (WS.Loot.search(o)) {
            log('Обыск: ' + (o.name || 'контейнер'));
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
        if (d2 > 1.85) {
          if (!D.path.length) {
            var np3 = findPath(p.x, p.y, o2.x, o2.y);
            if (!np3) return false;
            D.path = np3;
          }
          var lastPt3 = D.path[D.path.length - 1];
          if (dist(p.x, p.y, lastPt3.x, lastPt3.y) > 0.8) return true;
          D.path = [];
        }
        releaseKeys();
        try { WS.Forage.tryHarvest(o2); } catch (e) { /* пусто */ }
        log('Собрал: ' + (o2.name || 'сосулька'));
        return false;
      }

      case 'equip':
        releaseKeys();
        try { WS.Action.equipBest(); log('Переоделся в лучшее из найденного'); } catch (e) { /* пусто */ }
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
          var h = hourF();
          // замерзает во сне (холодный дом/полярная ночь) — разбудить:
          // сон вычитает тепло, гипотермия во сне убивает незаметно
          if (!crazy() && (p.temp || 37) < 34.9 && t.t > 4) {
            try { WS.Needs.wake(); } catch (e) { /* пусто */ }
            log('Проснулся от холода (' + (p.temp || 37).toFixed(1) + '°) — надо греться.', 'warn');
            return false;
          }
          // dayNap — дневная дрёма-перемотка (дед-режим): будит только
          // untilMax, иначе день (6:06–20:00) рвал бы сон мгновенно
          var dayDone = !t.dayNap && (h >= WAKE_HOUR && h < 20);
          var napDone = (t.untilMax && h >= t.untilMax);
          // «выспался» (fatigue>97) в дед-режиме не бывает: crazy.js
          // прикалывает fatigue=100 каждый тик — без guard дед вскакивал
          // через 3,5 игровых часа и циклил «Подъём/Лёг спать» всю ночь
          var rested = !crazy() && (p.needs.fatigue || 0) > 97;
          if (dayDone || napDone || rested) {
            try { WS.Needs.wake(); log('Подъём. ' + greetDay()); } catch (e) { /* пусто */ }
            return false;
          }
          return true;
        }
        // ЛОЖИТЬСЯ ЗАМЕРЗШИМ НЕЛЬЗЯ: сон вычитает тепло (SLEEP_CHILL) —
        // сначала согреться (этим займётся холод-ветка think())
        if ((p.temp || 37) < 35.9) return false;
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
        if (r && r.ok) { log('Лёг спать' + (r.kind === 'bed' ? ' в кровать' : '')); return true; }
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
            // без дров/спичек熔 растапливать нельзя: пауза 4 минуты,
            // приоритет — поход за дровами (поленница у крыльца)
            D.meltFailUntil = performance.now() + 240000;
            log('Растопка не вышла — нужны дрова. Иду искать топливо.', 'warn');
            return false;
          }
          return true;                    // зажгли — в следующий тик начнём таять
        }
        // сосульки — мгновенно
        if (invCount('icicle_chunk') > 0) {
          try {
            if (WS.Forage.meltSnow && WS.Forage.meltSnow()) {
              D.melted++;
              log('Растопил сосульку — полная фляга');
              return true;
            }
          } catch (e) { /* пусто */ }
        }
        // пустые фляги — 15 игровых минут каждая
        if (invCount('flask_empty') > 0 && !(p._melt)) {
          try {
            var mr = WS.Fire.meltSnow ? WS.Fire.meltSnow() : null;
            if (mr && mr.ok) { log('Топлю снег в котелке/фляге…'); return true; }
            if (mr && mr.reason) log('Таяние не вышло: ' + mr.reason);
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
          log('Крафт: ' + (rec ? rec.name : id));
          t.made = (t.made || 0) + 1;
          return t.made < (t.n || 1);      // ждём завершения работы в фоне
        }
        return false;
      }

      case 'craftwait':
        releaseKeys();
        return WS.Craft.isCrafting();

      case 'warm': {
        // погреться: внутри тёплого дома / у печи / у костра до 36.6°
        releaseKeys();
        var tempW = p.temp || 37;
        // без огня дом греет медленно (+0.2°/ч) — ждать полных 36.6
        // бессмысленно: выходим в 36.2 и держим бюджет улицы
        var fireHere = (WS.Fire && WS.Fire.near) ? WS.Fire.near(p.x, p.y, 2.5) : null;
        var warmTargetT = fireHere ? 36.6 : 36.2;
        if (tempW >= warmTargetT || t.t > 300) return false;   // 5 мин реального — потолок
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
          lightStoveNow(stoveW);
          return true;
        }
        // без огня холодный дом не греет вовсе: не стоять тут вечно —
        // сдаёмся по ИГРОВОМУ времени (~40 мин), а не реальному: на ×90
        // двадцать пять реальных секунд = целые сутки игрового холода
        var warmGameMin = t.t * (D.curSpeed || 1);
        if (!fire2 && (t.t > 25 || warmGameMin > 40)) {
          if (!D._saidNoFire) {
            D._saidNoFire = true;
            log('Без огня дом греет медленно: нужны дрова и печь. Ищу топливо.', 'warn');
          }
          return false;
        }
        return true;                       // стоим, греемся
      }

      case 'wait':
        releaseKeys();
        if (t.until !== undefined) {
          var hu = hourF();
          if (hu >= t.until && hu < 20) return false;   // дождались утра
          return t.t < (t.sec || 3600);
        }
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

      case 'banish': {
        // ИЗГНАНИЕ (дед-режим): подойти и бить лодошкой/вантузом —
        // зверь превращается в ПОДАРОК с лутом (+грибная энергия)
        var bt = t.ent;
        var gone = !bt || bt.dead || bt.hp <= 0 || WS.World.ents.indexOf(bt) < 0;
        if (gone) {
          var gift = giftNear(t.gx || 0, t.gy || 0);
          if (gift && !gift.looted && WS.World.objects.indexOf(gift) >= 0) {
            unshiftTask({ type: 'search', o: gift });
          }
          return false;
        }
        t.gx = bt.x; t.gy = bt.y;
        var bd2 = dist(p.x, p.y, bt.x, bt.y);
        // деду плохо — отбой: полечимся, изгоним позже
        if ((p.hp || 100) < 42) {
          log('ХП маловато (' + Math.round(p.hp) + ') — изгнание откладываю.', 'warn');
          return false;
        }
        // АНТИ-ЦИКЛ «вечно догоняю» (старые журналы: «Рядом волк (7 тайлов) —
        // ИЗГОНЯЮ лодошкой» ×81, «Рядом волк (2 тайла)» + «Обхожу препятствие»
        // весь день): зверь держит дистанцию или кружит за забором,
        // дистанция прыгает 1.6–2.1 и до удара (радиус ок 1.5) дело не
        // доходит. Деду даётся 25 сек реального времени сблизиться до
        // боевой дистанции; не вышло — зверь получает персональный
        // кулдаун на 3 игровых часа, дед возвращается к своим делам.
        if (bd2 <= 1.45) {
          t.deadlineT = 0;
        } else {
          t.deadlineT = (t.deadlineT || 0) + 1 / 60;
        }
        if ((t.deadlineT || 0) > 25) {
          bt._demoSkipUntil = absMin() + 180;
          log('🐉 ' + bt.kind + ' кружит и не подпускает — гоняться зря. ' +
              'Иду по делам, вернусь к нему позже.', 'warn');
          return false;
        }
        if (bd2 > 1.45) {
          if (!D.path.length) {
            var npB = findPath(p.x, p.y, bt.x, bt.y);
            if (npB) {
              D.path = npB;
            } else {
              // не дойти (за стеной?) — подождать и сменить цель
              t.waitT = (t.waitT || 0) + 1;
              return t.waitT <= 3;
            }
          }
          return true;
        }
        releaseKeys();
        // навести «мышь» на цель и ударить (кулак/вантуз/топор)
        try {
          var mB = WS.Input.mouse();
          mB.wx = bt.x; mB.wy = bt.y;
          mB.tx = Math.floor(bt.x); mB.ty = Math.floor(bt.y);
          if ((p._atkCd || 0) <= 0 && (p._swingT || 0) <= 0) {
            WS.Action.meleeAttack();
          }
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
        if (q && q.lit) {
          if (!D.beaconFired) {
            D.beaconFired = true;
            log('🔥 МАГИЧЕСКИЙ ОГОНЬ ГОРИТ! 3 факела вспыхнули на мостках — тарелка такой сигнал не пропустит.', 'good');
          }
          return false;
        }
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
          if (r && r.ok) { log('Взял в руки: ' + WS.Inv.nameOf(it.id)); return true; }
        } catch (e) { /* пусто */ }
      }
    }
    return false;
  }

  function fireShot(tgt) {
    var p = P();
    if (!p) return false;
    if (invCount('rifle_round') <= 0 && invCount('shell') <= 0) {
      log('Патроны кончились — охота отложена');
      return false;
    }
    if (!equipRifle()) { log('Огнестрела нет — охота отложена'); return false; }
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

  /** Ближайший зверь/бандит для ИЗГНАНИЯ (дед-режим): грибная энергия
   *  + подарок с лутом (жир для факелов — тушки волка/медведя). */
  function beastNear(r) {
    var p = P();
    if (!p || !W()) return null;
    var list;
    try { list = W().entsNear(p.x, p.y, r || 40); } catch (e) { return null; }
    var best = null, bd = 1e9;
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (!e || e.dead || !e.hp || e.hp <= 0) continue;
      if (e.kind !== 'wolf' && e.kind !== 'bear' && e.kind !== 'bandit' &&
          e.kind !== 'deer' && e.kind !== 'hare') continue;
      // зверь в «кулдауне» (не подпускает / уже надоел) — не цель
      if (e._demoSkipUntil && e._demoSkipUntil > absMin()) continue;
      var d = dist(p.x, p.y, e.x, e.y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  /** Подарок-объект (труп изгнанной мультяшки) возле точки. */
  function giftNear(x, y) {
    var w = W();
    if (!w || !w.objsAt) return null;
    var tx = Math.floor(x), ty = Math.floor(y);
    for (var cy = ty - 1; cy <= ty + 1; cy++) {
      for (var cx = tx - 1; cx <= tx + 1; cx++) {
        var obs;
        try { obs = w.objsAt(cx, cy); } catch (e) { obs = null; }
        if (!obs) continue;
        for (var i = 0; i < obs.length; i++) {
          if (obs[i] && obs[i].container && !obs[i].looted) return obs[i];
        }
      }
    }
    return null;
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
        log('Поел: ' + WS.Inv.nameOf(id));
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
          if (r && r.ok) { log('Выпил: ' + WS.Inv.nameOf(DRINK_IDS[i])); return true; }
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
    var hasWood = invCount('firewood_bundle') > 0 || invCount('plank') > 0 || invCount('log') > 0;
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
      if (r && r.ok) { log('Затопил печь' + (outsideTemp() < -25 ? ' — ночь будет злая' : '')); return true; }
      if (r && r.reason) log('Печь: ' + r.reason);
    } catch (e) { /* пусто */ }
    return false;
  }

  /** Скольких факелов не хватает. */
  function torchesMissing() {
    return Math.max(0, TORCHES_NEED - invCount('torch'));
  }

  /** Есть ли материалы на факел (жир/масло + тряпьё + доска).
   *  Порядок: сперва БЫСТРЫЕ одиночные рецепты (time 3, а не 30 —
   *  на демо-часах это минуты реального времени), «два факела» —
   *  только когда жира заведомо хватает. */
  function canCraftTorch() {
    var rags = invCount('cloth_rag');
    var oil = invCount('lamp_oil');
    var fat = invCount('fat');
    var miss = torchesMissing();
    if (invCount('plank') < 1) return null;
    if (fat >= 1 && rags >= 2 && (fat > miss || miss >= 3)) return 'torch_make'; // 2 факела
    if (fat >= 1 && rags >= 1) return 'torch';
    if (oil >= 1 && rags >= 1) return 'torch_oil';
    return null;
  }

  /** Хватает ли горючего (жир/масло) на все недостающие факела.
   *  Считаем честно по рецептам: «два факела» (1 жир+2 тряпки+доска),
   *  потом одиночные (1 жир|масло+тряпка+доска). */
  function torchFuelMissing() {
    var need = torchesMissing();
    if (need <= 0) return 0;
    var fat = invCount('fat'), oil = invCount('lamp_oil');
    var rags = invCount('cloth_rag'), plank = invCount('plank');
    var tm = Math.min(fat, Math.floor(rags / 2), plank);   // «два факела»
    var can = tm * 2;
    fat -= tm; rags -= tm * 2; plank -= tm;
    can += Math.min(fat + oil, rags, plank);               // одиночные
    return Math.max(0, need - can);
  }

  /** Тряпьё из газет (если не хватает) — трут рвётся без станции/инструментов. */
  function craftRags() {
    if (invCount('cloth_rag') >= 2) return false;
    if (invCount('newspaper_stack') > 0) {
      try {
        var r = WS.Craft.craft('tinder');
        if (r && r.ok) { log('Нарвал трута из газет (тряпьё для факела)'); return true; }
      } catch (e) { /* пусто */ }
    }
    return false;
  }

  function craftTorches() {
    craftRags();
    var made = false;
    var id = canCraftTorch();
    if (!id) return false;
    // не крафтим всё сразу: по одному, чтобы видеть в журнале
    try {
      var r = WS.Craft.craft(id);
      if (r && r.ok) {
        var rec = WS.Craft.recipe(id);
        log('🪵 Делает факел («' + (rec ? rec.name : id) + '») — факелов будет: ' +
          (invCount('torch') + (id === 'torch_make' ? 2 : 1)));
        made = true;
      }
    } catch (e) { /* пусто */ }
    return made;
  }

  /** Авария демо: выдать недостающие факела (бalance-дыра — честно помечаем). */
  function fallbackTorches() {
    var miss = torchesMissing();
    if (miss <= 0) return false;
    if (dayN() < 57) return false;
    try {
      WS.Inv.give('torch', miss);
      D.fallbackUsed = true;
      log('⚠ ДЕМО-РЕЖИМ: выдано ' + miss + ' факела — в мире не хватило жира/масла. '
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

  /** Ближайший дом, где можно согреться: с точкой входа (reachTile) и
   *  «дымом» ИЛИ печью (печь можно растопить самому). БЕЗ reachTile дом
   *  бесполезен: бот вечно «идёт к нему» и замерзает на полдороги —
   *  именно так погибала первая версия демо (barn_10 без входа). */
  function nearestHeatedBuilding(x, y) {
    if (!D.world) return null;
    var best = null, bd = 1e9;
    for (var i = 0; i < D.world.buildings.length; i++) {
      var b = D.world.buildings[i];
      if (!b || !b.b) continue;
      if (!b.heated && !b.stove) continue;          // ни дыма, ни печи
      if (!b.reachTile) continue;                    // в дом не войти
      if ((D.warmFail[b.id] || 0) >= 3) continue;    // уже сдавался — не ходим
      var d = dist(x, y, b.x + b.w / 2, b.y + b.h / 2);
      var score = b.heated ? d : d * 1.6 + 5;        // тёплый дом приоритетнее
      if (score < bd) { bd = score; best = b; }
    }
    return best;
  }

  /** Костёр на месте — аварийное обогревание (трут + дрова + спичка). */
  function emergencyCampfire() {
    var p = P();
    if (!p) return false;
    if (WS.Fire && WS.Fire.near && WS.Fire.near(p.x, p.y, 3)) return true;
    var tinder = invCount('cloth_rag') > 0 || invCount('newspaper_stack') > 0 ||
                 invCount('candle_stump') > 0 || invCount('wadding') > 0;
    var wood = invCount('firewood_bundle') > 0 || invCount('plank') > 0 || invCount('log') > 0;
    var fire = invCount('matches') > 0 || invCount('flint') > 0;
    if (!tinder || !wood || !fire) return false;
    var r = null;
    try { r = WS.Fire.lightCampfire(p.x + 0.8, p.y); } catch (e) { return false; }
    if (r && r.ok) {
      log('⛰ Разжёг аварийный костёр прямо на снегу — греться!', 'warn');
      return true;
    }
    return false;
  }

  /** План «спрятаться от зверя». */
  function fleePlan(threat) {
    var p = P();
    var plan = [];
    // уже в здании — постоять в глубине
    if (insideBuilding()) {
      var cur = buildingOf(p.x, p.y);
      var spot2 = (cur && cur.reachTile) || { x: p.x, y: p.y };
      plan.push(taskGoto(spot2.x, spot2.y, 1, 'убежище'));
      plan.push({ type: 'wait', sec: 8 });
      return plan;
    }
    // бежать к базе (или ближайшему зданию)
    var shelter = D.base;
    if (shelter) {
      var sspot = shelter.reachTile || { x: shelter.x + shelter.w / 2, y: shelter.y + shelter.h / 2 };
      if (shelter.door) {
        plan.push(taskGoto(shelter.door.x, shelter.door.y + 1.2, 0.8, 'дверь убежища'));
      }
      plan.push(taskGoto(sspot.x, sspot.y, 1, 'внутрь'));
      plan.push({ type: 'wait', sec: 8 });
    } else {
      plan.push({ type: 'wait', sec: 5 });
    }
    return plan;
  }

  function greetDay() {
    var t = outsideTemp();
    return ('На дворе ' + Math.round(t) + '°. ' + (t < -28 ? 'Мороз злой.' : (t < -18 ? 'Мороз крепкий.' : 'Терпимо.')));
  }

  /** Смена дня — короткая сводка в журнал. */
  function onDayChange() {
    var p = P();
    if (!p) return;
    var cz = WS.Crazy ? WS.Crazy.state() : null;
    if (cz) {
      // дедовская сводка: ХП-часы, энергия, изгнания
      log('— День ' + dayN() + '/60. ' + greetDay() +
          ' ХП: ' + Math.round(cz.hpShadow) + '/' + (p.maxHp || 100) +
          ', грибной энергии: ' + Math.floor(cz.energy) +
          ', изгнано мультяшек: ' + cz.banished +
          ', прикорнул раз: ' + cz.respawns +
          ', факелов: ' + invCount('torch') + '/' + TORCHES_NEED);
    } else {
      log('— День ' + dayN() + '. ' + greetDay() +
          ' Еды: ' + countFood() + ', воды: ' + waterCount() +
          ', факелов: ' + invCount('torch') + '/' + TORCHES_NEED +
          ', спичек: ' + invCount('matches') + ', температура тела: ' +
          (p.temp || 37).toFixed(1) + '°');
    }
    // контрольная точка: день сменился — пишем демо-слот (переживёт
    // закрытие вкладки и перезапуск браузера)
    try { if (WS.Save && WS.Save.save) WS.Save.save('demo'); } catch (e) { /* пусто */ }
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

  /** План на день в режиме «БЕЗУМНЫЙ ДЕД».
   *  Дед не мёрзнет и не голодает: днём — обыски контейнеров и изгнания
   *  (грибная энергия Древа + материалы факелов: доски/тряпьё/масло/жир),
   *  ночью — сон в кровати. Когда 3 факела собраны и лут кончился —
   *  честная перемотка времени сном (×160) до 55-го дня, потом мостки
   *  и Магический Огонь: тарелка прилетает на 60-й день в 06:00. */
  function nextActivityCrazy() {
    var p = P();
    if (!p) return [];
    var h = hourF();
    var day = dayN();
    var plan = [];

    // === ФИНАЛ: Магический Огонь на мостках ===
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
          if (!D._finalSaid) {
            D._finalSaid = true;
            log('ЗОВ ТАРЕЛКИ! Иду на мостки — зажигать Магический Огонь (3 факела при мне).', 'good');
          }
          var pg = taskGoto(pier.x, pier.y, 1.6, 'мостки-пристань');
          pg.finalTrip = true;            // финальный забег: не рвётся сном/холодом
          plan.push(pg);
          var pb = { type: 'beacon' };
          pb.finalTrip = true;
          plan.push(pb);
          var pw = { type: 'wait', sec: 4 };
          pw.finalTrip = true;
          plan.push(pw);
          return plan;
        }
      }
      // факелов нет — добираем днём (лут/изгнания), ночью спим
    } else if (fq && fq.lit) {
      D.phase = 'shipwait';
    }

    // === ночь: спать в кровати (сон ×160 — главный мотор времени) ===
    if (p.sleeping) return [{ type: 'sleep', bed: D.base ? D.base.bed : null }];
    if (h >= SLEEP_HOUR || h < WAKE_HOUR - 0.2) {
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

    // === день: добыча ===
    var shipwait = !!(fq && fq.lit);          // огонь горит — ждём тарелку (60-й день, 06:00)
    if (h >= 6.4 && h < 19.6) {
      // 1) факелы: скрафтить при любой возможности (внутри — ×8, не на улице)
      if (!shipwait && torchesMissing() > 0) {
        // идём домой крафтить ТОЛЬКО когда есть из чего: иначе бот
        // ходил домой после каждых трёх обысков и тут же обратно
        var crafty = canCraftTorch();
        if (!crafty && invCount('newspaper_stack') > 0 && invCount('cloth_rag') < 2) {
          crafty = 'tinder';                 // трут из газет — тоже дело мастера
        }
        if (crafty && !insideBuilding() && D.base && D.base.reachTile) {
          // крафт на улице при честных часах ×2 слишком долог — идём домой
          var csp = D.base.reachTile;
          plan.push(taskGoto(csp.x, csp.y, 1.5, 'домой (мастерская)'));
          return plan;
        }
        if (craftTorches()) {
          plan.push({ type: 'craftwait' });
          return plan;
        }
        // 1.5) горючее (жир/масло) — узкое место факелов, а зверь недалеко:
        //      ИЗГНАНИЕ даёт подарок с жиром + грибную энергию Древу.
        //      Но НЕ раньше, чем обыщены все контейнеры (жир бывает и в
        //      луте), и не чаще раза в 1,5 игровых часа — иначе охота
        //      съедала все будни деда (фак:0 к Д10, стая в 45 тайлах есть
        //      почти всегда).
        if (torchFuelMissing() > 0 && day >= 12 &&
            absMin() - (D._lastBanishPlanMin || -9999) > 90 &&
            !nextLootTarget(1).length) {
          var beastF = beastNear(45);
          if (beastF) {
            D._lastBanishPlanMin = absMin();
            var bfn = { wolf: 'волк', bear: 'медведь-шатун', bandit: 'бандит',
                        deer: 'олень', hare: 'заяц' }[beastF.kind] || beastF.kind;
            log('Жира/масла на факелы не хватает — иду изгонять ' + bfn +
              ': подарок с жиром и грибная энергия.');
            var bftask = { type: 'banish', ent: beastF };
            bftask.banishing = true;
            plan.push(bftask);
            return plan;
          }
        }
        // 2) обыск: ближайшие контейнеры (энергия + материалы факелов)
        var targets = nextLootTarget(3);
        if (targets.length) {
          for (var i = 0; i < targets.length; i++) {
            var t = targets[i];
            var nm = t.o.name || 'контейнер';
            var home = t.home && t.home.id ? (' (' + t.home.id + ')') : '';
            var gt = taskGoto(t.o.x, t.o.y, 1.2, nm + home);
            gt.o = t.o;                   // чтобы провал пути пометил цель
            plan.push(gt);
            plan.push({ type: 'search', o: t.o });
          }
          plan.push({ type: 'equip' });
          return plan;
        }
        // 3) лут кончился — ИЗГНАНИЕ зверя: жир для факела + энергия
        //    (не чаще раза в 1,5 игровых часа — см. п. 1.5)
        var beast = (absMin() - (D._lastBanishPlanMin || -9999) > 90) ? beastNear(70) : null;
        if (beast) {
          D._lastBanishPlanMin = absMin();
          var bn = { wolf: 'волк', bear: 'медведь-шатун', bandit: 'бандит',
                     deer: 'олень', hare: 'заяц' }[beast.kind] || beast.kind;
          log('Иду изгонять ' + bn + ' — подарок с жиром и грибная энергия.');
          var btask = { type: 'banish', ent: beast };
          btask.banishing = true;
          plan.push(btask);
          return plan;
        }
        // 4) совсем нечего делать — короткая пауза
        plan.push({ type: 'wait', sec: 15 });
        return plan;
      }

      if (shipwait) {
        // огонь уже горит: дед спит до прилёта тарелки (60-й день, 06:00)
        if (D.base && D.base.bed) {
          var wspot = D.base.reachTile || { x: D.base.x + D.base.w / 2, y: D.base.y + D.base.h / 2 };
          plan.push(taskGoto(wspot.x, wspot.y, 1.5, 'домой (ждать тарелку)'));
          plan.push(taskGoto(D.base.bed.x, D.base.bed.y, 1.4, 'кровать'));
          var wnap = { type: 'sleep', bed: D.base.bed, untilMax: 21.5 };
          wnap.dayNap = true;
          wnap.bedTrip = true;
          plan.push(wnap);
          return plan;
        }
      }

      // === факела ГОТОВЫ: соберём остатки энергии и — перемотка сном ===
      var lootLeft = 0;
      if (D.world && D.world.loot) {
        for (var li = 0; li < D.world.loot.length; li++) {
          if (D.world.loot[li].o && !D.world.loot[li].o.looted && !D.world.loot[li].taken) lootLeft++;
        }
      }
      if (lootLeft > 0 && day < 12 && shroomEnergy() < 30) {
        // ещё есть чем заняться: добираем энергию Древа обысками
        var targets2 = nextLootTarget(3);
        if (targets2.length) {
          for (var i2 = 0; i2 < targets2.length; i2++) {
            var t2 = targets2[i2];
            var gt2 = taskGoto(t2.o.x, t2.o.y, 1.2, (t2.o.name || 'контейнер'));
            gt2.o = t2.o;
            plan.push(gt2);
            plan.push({ type: 'search', o: t2.o });
          }
          plan.push({ type: 'equip' });
          return plan;
        }
      }
      if (D.base && D.base.bed) {
        if (day !== D._ffwdSaidDay) {
          D._ffwdSaidDay = day;
          log('Факела собраны (' + invCount('torch') + '/' + TORCHES_NEED +
            (lootLeft > 0 ? ', лут добран' : ', лут собран') +
            '). Дед отсыпается до зова тарелки — день ' + FINAL_DAY + '.');
        }
        var fspot = D.base.reachTile || { x: D.base.x + D.base.w / 2, y: D.base.y + D.base.h / 2 };
        plan.push(taskGoto(fspot.x, fspot.y, 1.5, 'домой (спать)'));
        plan.push(taskGoto(D.base.bed.x, D.base.bed.y, 1.4, 'кровать'));
        var nap = { type: 'sleep', bed: D.base.bed, untilMax: 21.5 };
        nap.dayNap = true;
        nap.bedTrip = true;
        plan.push(nap);
        return plan;
      }
    }

    // === вечер: домой ===
    if (h >= 19.6 && D.base && D.base.bed) {
      var espot = D.base.reachTile || { x: D.base.x + D.base.w / 2, y: D.base.y + D.base.h / 2 };
      if (dist(p.x, p.y, espot.x, espot.y) > 4) {
        var eg = taskGoto(espot.x, espot.y, 1.5, 'домой к ночи');
        eg.homeTrip = true;
        plan.push(eg);
      }
      plan.push({ type: 'wait', sec: 15 });
      return plan;
    }

    plan.push({ type: 'wait', sec: 10 });
    return plan;
  }

  /** Следующее занятие (когда план пуст). */
  function nextActivity() {
    var p = P();
    if (!p) return [];
    // ЛЕЧЕНИЕ ПЕРЕД ВСЕМ: перелом/боль лечим сразу, как заметили
    treatInjuries();
    // БЕЗУМНЫЙ ДЕД — своя стратегия: без печек/питья, только лут,
    // изгнания, факела и сон до тарелки
    if (crazy()) return nextActivityCrazy();
    var h = hourF();
    var day = dayN();
    var plan = [];

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
          log('Дым на реке! Иду на мостки — зажигать сигнальный костёр.', 'good');
          var pg = taskGoto(pier.x, pier.y, 1.6, 'мостки-пристань');
          pg.finalTrip = true;            // финальный забег: не рвётся сном/холодом
          plan.push(pg);
          var pb = { type: 'beacon' };
          pb.finalTrip = true;
          plan.push(pb);
          var pw = { type: 'wait', sec: 4 };
          pw.finalTrip = true;
          plan.push(pw);
          return plan;
        }
      }
    } else if (fq && fq.lit) {
      D.phase = 'shipwait';
    }

    // === ночь: спать ===
    if (p.sleeping) return [{ type: 'sleep', bed: D.base ? D.base.bed : null }];
    if (h >= SLEEP_HOUR || h < WAKE_HOUR - 0.2) {
      if (D.base && D.base.bed) {
        var bspot2 = D.base.reachTile || { x: D.base.x + D.base.w / 2, y: D.base.y + D.base.h / 2 };
        var sg = taskGoto(bspot2.x, bspot2.y, 1.5, 'домой (спать)');
        sg.homeTrip = true; sg.bedTrip = true;
        var sg2 = taskGoto(D.base.bed.x, D.base.bed.y, 1.4, 'кровать');
        sg2.bedTrip = true;
        var sl3 = { type: 'sleep', bed: D.base.bed };
        sl3.bedTrip = true;
        plan.push(sg);
        // холодная база (без дыма) с печью: натопить ПЕРЕД сном —
        // иначе сон в холодном доме выстужает до гипотермии
        if (D.base.stove && !D.base.heated) {
          plan.push({ type: 'warm', stove: D.base.stove, spot: bspot2, bedTrip: true });
        }
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
    // сосульки в округе — собрать (вода на будущее)
    if (waterCount() + invCount('icicle_chunk') < 4) {
      var ice = nearestIcicle(40);
      if (ice && h > 8 && h < 16.5) {
        plan.push(taskGoto(ice.x, ice.y, 1.2, 'сосульки'));
        plan.push({ type: 'harvest', o: ice });
        return plan;
      }
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
          log('Вижу дичь (' + prey.kind + ') — охота!');
          plan.push({ type: 'hunt', ent: prey });
          return plan;
        }
        // пойти к лесу и поискать там
        if (day >= 25 && D.huntsDone < 3) {
          D.huntsDone++;
          var forest = { x: 60 + (day * 37) % 80, y: 40 + (day * 53) % 30 };
          log('Иду к опушке искать дичь (' + D.huntsDone + '/3)');
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
        if ((p.temp || 37) < 36.7 && far) {
          // сначала догреться в ближайшем тёплом доме
          var hb2 = nearestHeatedBuilding(p.x, p.y);
          if (hb2 && hb2 !== D.base) {
            var sp2 = hb2.reachTile || { x: hb2.x + hb2.w / 2, y: hb2.y + hb2.h / 2 };
            plan.push(taskGoto(sp2.x, sp2.y, 1.2, 'согреться перед дорогой'));
            plan.push({ type: 'warm', spot: sp2, stove: hb2.stove });
          }
        }
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
    if (p.needs.fatigue < 26 && D.base && D.base.bed && h >= 8 && h < 17.5) {
      var ng = taskGoto(D.base.bed.x, D.base.bed.y, 1.4, 'кровать (дремка)');
      ng.bedTrip = true;
      var ns = { type: 'sleep', bed: D.base.bed, untilMax: Math.min(h + 3, 17.5) };
      ns.bedTrip = true;
      plan.push(ng);
      plan.push(ns);
      return plan;
    }

    // === день: поход за лутом ===
    if (h >= 7 && h < HOME_HOUR) {
      var targets = nextLootTarget(2);
      // ближе к вечеру — только короткие цели: дальний поход после 15:30
      // не успеть до темноты, и бот встречает ночь на морозе (фикс
      // «полночная вылазка за 27 тайлов от дома»)
      if (h >= 15.5 && p) {
        targets = targets.filter(function (tt) {
          return tt.o && dist(p.x, p.y, tt.o.x, tt.o.y) <= 12;
        });
      }
      if (h >= 16.6) targets = [];
      if (targets.length) {
        for (var i = 0; i < targets.length; i++) {
          var t = targets[i];
          var nm = t.o.name || 'контейнер';
          var home = t.home && t.home.id ? (' (' + t.home.id + ')') : '';
          var gt = taskGoto(t.o.x, t.o.y, 1.2, nm + home);
          gt.o = t.o;                     // чтобы провал пути пометил цель
          plan.push(gt);
          plan.push({ type: 'search', o: t.o });
        }
        plan.push({ type: 'equip' });
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
        log('Героя вырубило (обморок) — пережидаю.', 'warn');
      }
      return;
    }
    if (!p.sleeping) D._faintSaid = false;

    // УСТАЛОСТЬ КРИТИЧНА: не спящего героя игра валит в обмороки, и все
    // планы рассыпаются. Сон в кровати — приоритет, НО ХОЛОД ПРИОРИТЕТНЕЕ:
    // при температуре ядра ниже 35.6° сначала греемся (фикс «пинг-понг
    // сон↔тепло», из-за которого бот стоял и замерзал насмерть).
    // В дед-режиме усталости нет (нужды заморожены) — ветка не нужна.
    if (!crazy() && !p.sleeping && p.needs.fatigue < 22 && D.base && D.base.bed &&
        (p.temp || 37) >= 35.6 &&
        !(D.task && (D.task.bedTrip || D.task.finalTrip))) {
      clearPlan();
      var bs = D.base.reachTile || { x: D.base.x + D.base.w / 2, y: D.base.y + D.base.h / 2 };
      var bg2 = taskGoto(bs.x, bs.y, 1.5, 'кровать (валюсь с ног)');
      bg2.homeTrip = true; bg2.bedTrip = true;
      var bg3 = taskGoto(D.base.bed.x, D.base.bed.y, 1.4, 'кровать');
      bg3.bedTrip = true;
      var sl2 = { type: 'sleep', bed: D.base.bed };
      sl2.bedTrip = true;
      D.plan = [bg2, bg3, sl2];
      D.task = D.plan.shift();
      return;
    }

    // контейнер/экран открыт — подождём (симуляция стоит)
    if (WS.Ui && WS.Ui.modal && WS.Ui.modal()) return;

    // 1) угроза. НОЧЬЮ и в финальном забеге радиус меньше: стая может
    // кружить вокруг всю ночь, а дед вместо сна (или сигнального огня)
    // гонялся бы за каждым сторожковым волком (фикс цикла «ИЗГОНЯЮ
    // лодошкой» каждый игровой час). Отвечаем только на РЕАЛЬНО близкую
    // угрозу; зверей в «кулдауне» тоже пропускаем.
    var nightNow = (hourF() >= 20.0 || hourF() < 6.0);
    var finalRun = !!(D.task && D.task.finalTrip);
    var threat = nearestThreat(finalRun ? 2.5 : (nightNow ? 4.5 : 9));
    if (threat && !p.sleeping &&
        !(threat._demoSkipUntil && threat._demoSkipUntil > absMin())) {
      if (crazy()) {
        // БЕЗУМНЫЙ ДЕД: зверь рядом — это ГРИБНАЯ ЭНЕРГИЯ и ПОДАРОК
        // (жир для факелов). Не прячемся — подходим и изгоняем лодошкой!
        if (!(D.task && (D.task.type === 'banish' || D.task.fleeing))) {
          var kindNameC = { wolf: 'волк', bear: 'медведь-шатун', bandit: 'бандит' }[threat.kind] || threat.kind;
          log('⚠ Рядом ' + kindNameC + ' (' + Math.round(dist(p.x, p.y, threat.x, threat.y)) +
            ' тайлов) — ИЗГОНЯЮ лодошкой: энергия и подарок!', 'bad');
          clearPlan();
          var ban2 = { type: 'banish', ent: threat };
          ban2.banishing = true;
          D.task = ban2;
          D.plan = [];
          return;
        }
      } else if (!(D.task && D.task.fleeing)) {
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

    // 2) экстренные нужды (не отходя от кассы)
    // 2а) БЕЗУМНЫЙ ДЕД: ХП-часы тают — лечимся грибным
    if ((p.hp || 100) < 55) {
      var meds = ['joint_ded', 'tincture_fly', 'mushroom_fun', 'candy_ded'];
      for (var mi = 0; mi < meds.length; mi++) {
        if (invCount(meds[mi]) > 0) {
          var hpBefore = Math.round(p.hp || 0);
          try {
            WS.Health.useMed(meds[mi]);
            log('Лечение деда: ' + meds[mi] + ' (ХП было ' + hpBefore + ', стало ' + Math.round(p.hp) + ')');
          } catch (e) { /* пусто */ }
          break;
        }
      }
    }
    if (p.needs.hunger < 16) {
      if (!eatBest() && !D._noFoodSaid) {
        D._noFoodSaid = true;
        log('Голод, а еды нет — нужен лут!', 'bad');
      }
    }
    if (p.needs.hunger > 40) D._noFoodSaid = false;
    if (p.needs.thirst < 16) {
      if (!drinkBest()) {
        // совсем беда — снег (риск болезни, но лучше чем смерть)
        try {
          WS.Needs.eatSnow();
          log('Пью снег горстью — воды нет (риск простуды)', 'warn');
        } catch (e) { /* пусто */ }
      }
    }

    // 3) холод — главный враг... но НЕ для безумного деда: он не мёрзнет
    //    (нужды заморожены, температура всегда 36.6). Холод-ветка в дед-
    //    режиме только сжирала день: бот грелся в домах без огня часами.
    var temp = p.temp || 37;
    if (temp >= 36.6) { D.warmOK = true; D.warmToldId = ''; }
    if (temp < 35.6) D.warmOK = false;   // гистерезис шире: без огня греемся медленно
    var headingHome = D.task && (D.task.homeTrip || D.task.finalTrip || D.task.type === 'sleep');
    var nightH = (hourF() >= 20.0 || hourF() < 6.0);
    var coldLimit = (headingHome || D.warmOK) ? PANIC_COLD : WARM_AT;
    // финальный забег к мосткам: миссия важнее — рвём план только на
    // настоящем паническом холоде
    if (D.task && D.task.finalTrip) coldLimit = 33.8;
    // короткий рывок за целью (до 9 тайлов) не прерываем: выскочить за
    // дровами к поленнице у крыльца — две секунды, иначе бот взаперти
    var dashNear = false;
    if (D.task && typeof D.task.tx === 'number' && typeof D.task.ty === 'number') {
      dashNear = dist(p.x, p.y, D.task.tx, D.task.ty) < 9;
    }
    if (dashNear && temp >= 33.8) coldLimit = Math.min(coldLimit, 33.8);
    if (!crazy() && temp < coldLimit && !p.sleeping) {
      var fire = (WS.Fire && WS.Fire.near) ? WS.Fire.near(p.x, p.y, 2.5) : null;
      var warmHere = (function () {
        if (!insideBuilding()) return false;
        var b = buildingOf(p.x, p.y);
        return !!(b && WS.Roofs && WS.Roofs.isHeated && WS.Roofs.isHeated(b));
      })();
      if (!fire && !warmHere) {
        // уже идём греться — не перепланируем каждые полсекунды
        var warming = (D.task && D.task.warming) ||
                      (D.plan.length && D.plan[0] && D.plan[0].warming);
        if (!warming) {
          // цель тепла: ближайший ДОМ «С ДЫМОМ» (реально тёплый — см.
          // Temp.heatedRoom); ночью своя база чуть приоритетнее (там кровать)
          var hb = nearestHeatedBuilding(p.x, p.y);
          if (nightH && D.base && D.base.heated && hb && hb !== D.base) {
            var dBaseW = dist(p.x, p.y, D.base.x + D.base.w / 2, D.base.y + D.base.h / 2);
            var dhbW = dist(p.x, p.y, hb.x + hb.w / 2, hb.y + hb.h / 2);
            if (dBaseW < dhbW * 1.4) hb = D.base;
          }
          var dh = hb ? dist(p.x, p.y, hb.x + hb.w / 2, hb.y + hb.h / 2) : 1e9;
          // сильный мороз + тёплый дом не рядом → костёр на месте
          // (порог агрессивный: на 34° до дома можно не дойти)
          if (temp < 34.4 && (dh > 5 || !hb)) {
            // совсем прихватило, а тёплый дом далеко — костёр на месте
            if (emergencyCampfire()) {
              clearPlan();
              D.plan = [{ type: 'warm', warming: true }];
              D.task = D.plan.shift();
              return;
            }
          }
          if (hb && dh <= 60) {
            var spot = hb.reachTile || { x: hb.x + hb.w / 2, y: hb.y + hb.h / 2 };
            // стоим рядом с печью, если она есть — греться быстрее
            var wSpot = spot;
            if (hb.stove) {
              var sSide = nearestPassable(Math.floor(hb.stove.x), Math.floor(hb.stove.y));
              if (sSide) wSpot = { x: sSide.x + 0.5, y: sSide.y + 0.5 };
            }
            // СКАЗАТЬ ОДИН РАЗ: раньше каждые 3 игровых минуты бот
            // перелогировал «бегу в тёплый дом» — журнал тонул в спаме,
            // а герой всё это время стоял на морозе
            if (D.warmToldId !== hb.id) {
              D.warmToldId = hb.id;
              log((temp < PANIC_COLD ? 'Мёрзну (' + temp.toFixed(1) + '°) — бегу в тёплый дом: ' : 'Иду греться в тёплый дом: ') +
                  hb.id + (hb.heated ? '' : ' (растоплю печь)') + (dh > 8 ? ' (' + Math.round(dh) + ' тайлов)' : ''));
            }
            clearPlan();
            var wgoto = taskGoto(wSpot.x, wSpot.y, 1.2, 'тёплый дом ' + hb.id);
            wgoto.warming = true; wgoto.bldg = hb;
            D.plan = [
              wgoto,
              { type: 'warm', warming: true, stove: hb.stove, spot: wSpot }
            ];
            // ВАЖНО: назначить задачу СРАЗУ — раньше план оставался в
            // очереди без задачи, комендантский час видел «пустую» руку и
            // рвал его каждый тик → пинг-понг «тепло↔домой» без движения
            D.task = D.plan.shift();
            return;
          }
        }
      }
    }

    // 3.5) КОМЕНДАНТСКИЙ ЧАС (фикс «полночная вылазка за 27 тайлов»):
    //      после 20:09 бот не начинает новых дел — только домой, в кровать.
    //      Исключения: уже идём домой/спать/греемся/прячемся/ждём рассвета;
    //      финальный забег к мосткам важнее коменданта.
    var hc = hourF();
    var taskSafe = (D.task && (D.task.homeTrip || D.task.bedTrip || D.task.warming ||
      D.task.fleeing || D.task.finalTrip || D.task.type === 'sleep' ||
      D.task.type === 'warm' || D.task.type === 'melt' ||
      D.task.type === 'craftwait' || D.task.type === 'wait')) ||
      (!D.task && D.plan.length > 0);   // план назначит задачу на этом же тике
    if (!taskSafe && !p.sleeping && D.phase !== 'final' && D.base && D.base.bed &&
        (hc >= 20.15 || hc < 5.4)) {
      var tNow2 = p.temp || 37;
      var bldg2 = buildingOf(p.x, p.y);
      var warmBldg2 = !!(bldg2 && WS.Roofs && WS.Roofs.isHeated && WS.Roofs.isHeated(bldg2));
      var dHome2 = dist(p.x, p.y, D.base.x + D.base.w / 2, D.base.y + D.base.h / 2);
      if (warmBldg2 && tNow2 < 36.2 && dHome2 > 18) {
        // ночь, чужой тёплый дом, идти далеко и мёрзнем — сидим до рассвета,
        // утром (5:30) двинемся домой на свежую голову
        clearPlan();
        D.plan = [{ type: 'wait', sec: 3600, until: 5.5, label: 'ночую в тёплом доме' }];
        D.task = D.plan.shift();
        log('Ночь, мёрзну — ночую в тёплом доме до рассвета.', 'warn');
        return;
      }
      clearPlan();
      var cbs = D.base.reachTile || { x: D.base.x + D.base.w / 2, y: D.base.y + D.base.h / 2 };
      var cg1 = taskGoto(cbs.x, cbs.y, 1.5, 'домой (комендантский час)');
      cg1.homeTrip = true; cg1.bedTrip = true;
      var cg2 = taskGoto(D.base.bed.x, D.base.bed.y, 1.4, 'кровать');
      cg2.bedTrip = true;
      var cs = { type: 'sleep', bed: D.base.bed };
      cs.bedTrip = true;
      D.plan = [cg1, cg2, cs];
      D.task = D.plan.shift();
      return;
    }

    // 4) перевес — выбросить хлам (дед-режим: и «почти перевес» тоже —
    //    чистим сумку до того, как штраф скорости ударит по темпу демо)
    try {
      var ovJ = WS.Inv.overload ? WS.Inv.overload() : 0;
      if (ovJ > 0.3) dropJunk();
      else if (crazy() && WS.Inv.snapshot) {
        var sn = WS.Inv.snapshot();
        if (sn.weight > sn.maxWeight * 0.95) dropJunk();
      }
    } catch (e) { /* пусто */ }

    // 5) лечение
    if (p.hp < 55 && (p.bleed || 0) > 0 && invCount('bandage_clean') + invCount('bandage') > 0) {
      try {
        var bid = invCount('bandage_clean') > 0 ? 'bandage_clean' : 'bandage';
        WS.Health.bandage(bid);
        log('Перевязал раны (' + bid + ')');
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
    // ДЕД-РЕЖИМ: хлам — всё, что не в белом списке (еда, одежда, трофеи:
    // дед не мёрзнет и не ест — это мёртвый вес). Выбрасываем ЦЕЛЫМИ
    // стопками и циклом — старый «по одной в секунду» не успевал за
    // потоком добычи, дед плёлся с 57 кг на 31,5.
    if (crazy()) {
      var dropped = 0;
      for (var ci = p.inv.length - 1; ci >= 0 && dropped < 12; ci--) {
        var it = p.inv[ci];
        if (!it || CRAZY_KEEP[it.id]) continue;
        try {
          WS.Inv.drop(ci, it.count || 1);
          dropped++;
        } catch (e) { /* пусто */ }
      }
      if (dropped) log('Разгружаю сумку: выбросил хлама — ' + dropped + ' стопок (деду нужны только факелы и хилки).');
      return;
    }
    for (var j = 0; j < JUNK.length; j++) {
      var id = JUNK[j];
      for (var i = 0; i < p.inv.length; i++) {
        if (p.inv[i] && p.inv[i].id === id) {
          try { WS.Inv.drop(i, 1); log('Выбросил лишнее: ' + WS.Inv.nameOf(id)); } catch (e) { /* пусто */ }
          return;
        }
      }
    }
  }

  /** Дед-режим: забрать из контейнера только нужное (белый список).
   *  Возвращает число взятых стопок. Остальное остаётся в контейнере. */
  function takeCrazyLoot(o) {
    if (!o || !o.inv || !o.inv.length) return 0;
    var n = 0;
    for (var i = o.inv.length - 1; i >= 0; i--) {
      var slot = o.inv[i];
      if (!slot || !CRAZY_KEEP[slot.id]) continue;
      try {
        if (WS.Loot.take(o, i, slot.count)) n++;
      } catch (e) { /* пусто */ }
    }
    return n;
  }

  // ====================================================================
  //  ЭКРАН КОНТЕЙНЕРА (симуляция стоит, пока он открыт)
  // ====================================================================

  /** ЛЕЧЕНИЕ: перелом фиксируем, боль глушим — иначе бот ползёт
   *  со скоростью черепахи и «залипает» (в логе живой пример: перелом
   *  + боль 55 + дыхание 0.13 = скорость 0.89 вместо 2.2). */
  function treatInjuries() {
    var p = P();
    if (!p) return;
    if (p.fracture && !p.fracTreat) {
      if (invCount('plaster_cast') > 0 && WS.Health && WS.Health.useMed) {
        try {
          if (WS.Health.useMed('plaster_cast')) {
            log('Нога в гипсе — лечусь как положено.', 'good');
            return;
          }
        } catch (e) { /* пусто */ }
      }
      if (WS.Health && WS.Health.splintFromPlanks) {
        try {
          if (WS.Health.splintFromPlanks()) {
            log('Смастерил шину из досок — ходить можно.', 'good');
            return;
          }
        } catch (e2) { /* пусто */ }
      }
      log('Перелом без гипса и досок — лечусь сном и валерьянкой.', 'bad');
    }
    if ((p.pain || 0) > 45 && invCount('laudanum') > 0 && WS.Health && WS.Health.useMed) {
      try {
        if (WS.Health.useMed('laudanum')) log('Принял лауданум — боль отступает.', 'good');
      } catch (e3) { /* пусто */ }
    }
  }

  /** Выбросить барахло при перегрузе (обратно на пол — не теряется).
   *  Ценим: еду/мед/патроны/топливо/факелы; жертвуем тяжёлым хламом. */
  function dropJunk() {
    var p = P();
    if (!p || !p.inv || !(WS.Inv && WS.Inv.overload)) return;
    var KEEP = {
      rifle: 1, rifle_round: 1, shell: 1, gunpowder: 1, matches: 1, flint: 1,
      firewood: 1, firewood_bundle: 1, plank: 1, torch: 1, laudanum: 1,
      plaster_cast: 1, bandage: 1, splint: 1, rope: 1, cloth_rag: 1,
      needle: 1, thread: 1, axe: 1, knife: 1, pot_cast: 1, flask_empty: 1,
      flask_water: 1, icicle_chunk: 1
    };
    // еда/мед/топливо — тоже ценим (по категориям определений)
    var dropped = 0;
    for (var guard = 0; guard < 30 && WS.Inv.overload() >= 1; guard++) {
      var worst = null, worstScore = -1;
      for (var i = 0; i < p.inv.length; i++) {
        var it = p.inv[i];
        if (!it || KEEP[it.id]) continue;
        var def = (WS.Data && WS.Data.items && WS.Data.items[it.id]) || {};
        var tags = def.tags || [];
        if (def.cat === 'food' || def.cat === 'med' || def.cat === 'fuel' ||
            def.cat === 'ammo' || def.cat === 'weapon' || def.cat === 'ranged' ||
            tags.indexOf('relic') >= 0 || tags.indexOf('firestarter') >= 0) continue;   // нужное не жертвуем
        var w2 = (def.w || 0.2) * (it.count || 1);
        if (w2 > worstScore) { worstScore = w2; worst = it; }
      }
      if (!worst) break;
      var n = Math.min(worst.count || 1, 3);
      try {
        WS.Inv.take(worst.id, n);
        if (WS.Action && WS.Action.makeDrop) {
          WS.Action.makeDrop(worst.id, n, worst.cond, p.x, p.y, p.dir);
        }
      } catch (e) { break; }
      dropped += n;
    }
    if (dropped > 0) {
      log('Перегруз! Выбросил ' + dropped + ' шт. хлама — идти легче.', 'warn');
    }
  }

  function watchScreens() {
    if (!D.active) return;
    try {
      if (WS.ContScreen && WS.ContScreen.isOpen()) {
        D.contT += 0.4;
        if (D.contT >= 1.6) {
          var o = WS.ContScreen.object();
          if (o) {
            var n = 0;
            // ДИСЦИПЛИНА ВЕСА: перегружен — берём только нужное (белый
            // список), иначе дед тащит 25 кг гречки и ползёт (жалоба:
            // «персонаж тупит и движется медленно»)
            var ov = WS.Inv && WS.Inv.overload ? WS.Inv.overload() : 0;
            if (crazy() || ov >= 1) {
              try { n = takeCrazyLoot(o); } catch (e) { n = 0; }
            } else {
              try { n = (WS.Loot && WS.Loot.takeAll) ? WS.Loot.takeAll(o) : 0; } catch (e) { n = 0; }
            }
            if (n) log('Забрал добычу: ' + (o.name || 'контейнер') + ' (' + n + ' наименований)');
          }
          try { WS.ContScreen.close(); } catch (e) { /* пусто */ }
          D.contT = 0;
          // совсем увязли — сбрасываем барахло на пол
          if (WS.Inv && WS.Inv.overload && WS.Inv.overload() >= 2) dropJunk();
        }
      } else {
        D.contT = 0;
      }
    } catch (e) { /* пусто */ }
    updatePanel();
  }

  // ====================================================================
  //  UI: панель демо
  // ====================================================================

  var dom = {};

  var LS_POS = 'ws.demo.panelPos';   // «x,y» — сохранённая позиция панели
  var LS_COL = 'ws.demo.panelCol';   // '1' — свёрнута

  /** Загрузить сохранённую геометрию панели (позиция/свёрнутость). */
  function panelLoadGeom() {
    if (!dom.root) return;
    var col = null;
    try { col = localStorage.getItem(LS_COL); } catch (e) { /* пусто */ }
    setCollapsed(col === '1', true);
    var pos = null;
    try { pos = localStorage.getItem(LS_POS); } catch (e2) { /* пусто */ }
    if (pos) {
      var xy = String(pos).split(',');
      var x = parseFloat(xy[0]), y = parseFloat(xy[1]);
      if (isFinite(x) && isFinite(y)) panelPlace(x, y);
    }
  }

  /** Поставить панель в экранные координаты с удержанием в кадре. */
  function panelPlace(x, y) {
    var r = dom.root.getBoundingClientRect();
    var W2 = window.innerWidth, H2 = window.innerHeight;
    x = Math.max(4, Math.min(x, W2 - r.width - 4));
    y = Math.max(4, Math.min(y, H2 - 40));
    dom.root.style.left = x + 'px';
    dom.root.style.top = y + 'px';
    dom.root.style.right = 'auto';
  }

  /** Свернуть/развернуть панель (кнопка или двойной клик по шапке). */
  function setCollapsed(v, silent) {
    D.panelCol = !!v;
    if (dom.root) dom.root.classList.toggle('collapsed', !!v);
    if (dom.colBtn) {
      dom.colBtn.textContent = v ? '▸' : '▾';
      dom.colBtn.title = v ? 'Развернуть панель демо (двойной клик по шапке)' : 'Свернуть панель демо (двойной клик по шапке)';
    }
    try { localStorage.setItem(LS_COL, v ? '1' : '0'); } catch (e) { /* пусто */ }
    if (!silent && !v && dom.root) {
      // после разворота — вернуть сохранённую позицию в кадр
      var r = dom.root.getBoundingClientRect();
      panelPlace(r.left, r.top);
    }
  }

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
    var headBtns = document.createElement('span');
    headBtns.className = 'd-head-btns';
    head.appendChild(headBtns);
    dom.colBtn = document.createElement('button');
    dom.colBtn.className = 'd-col';
    dom.colBtn.textContent = '▾';
    dom.colBtn.title = 'Свернуть панель демо';
    dom.colBtn.addEventListener('click', function () { setCollapsed(!D.panelCol); });
    headBtns.appendChild(dom.colBtn);
    var close = document.createElement('button');
    close.className = 'd-stop';
    close.textContent = '■ стоп';
    close.title = 'Остановить демо и вернуть управление';
    close.addEventListener('click', function () { stop('остановлено игроком'); });
    headBtns.appendChild(close);

    // ПЕРЕТАСКИВАНИЕ за шапку + сворачивание двойным кликом.
    // Панель больше не перекрывает кнопки управления: по умолчанию
    // стоит НИЖЕ #ws-hud (часы/скорость), а за шапку её можно утащить
    // куда угодно — позиция запоминается.
    var drag = null;
    head.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      var t = e.target;
      while (t && t !== head) { if (t.tagName === 'BUTTON') return; t = t.parentNode; }
      var r = root.getBoundingClientRect();
      drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
      e.preventDefault();
    });
    window.addEventListener('mousemove', function (e) {
      if (!drag) return;
      panelPlace(e.clientX - drag.dx, e.clientY - drag.dy);
    });
    window.addEventListener('mouseup', function () {
      if (!drag) return;
      drag = null;
      try {
        var r = root.getBoundingClientRect();
        localStorage.setItem(LS_POS, Math.round(r.left) + ',' + Math.round(r.top));
      } catch (e) { /* пусто */ }
    });
    head.addEventListener('dblclick', function (e) {
      var t = e.target;
      while (t && t !== head) { if (t.tagName === 'BUTTON') return; t = t.parentNode; }
      setCollapsed(!D.panelCol);
    });
    // тач-перетаскивание (мобильные)
    var touchDrag = null;
    head.addEventListener('touchstart', function (e) {
      if (!e.touches || !e.touches.length) return;
      var t = e.target;
      while (t && t !== head) { if (t.tagName === 'BUTTON') return; t = t.parentNode; }
      var r = root.getBoundingClientRect();
      touchDrag = { dx: e.touches[0].clientX - r.left, dy: e.touches[0].clientY - r.top };
    }, { passive: true });
    head.addEventListener('touchmove', function (e) {
      if (!touchDrag || !e.touches || !e.touches.length) return;
      panelPlace(e.touches[0].clientX - touchDrag.dx, e.touches[0].clientY - touchDrag.dy);
      if (e.cancelable) e.preventDefault();
    }, { passive: false });
    head.addEventListener('touchend', function () {
      if (!touchDrag) return;
      touchDrag = null;
      try {
        var r = root.getBoundingClientRect();
        localStorage.setItem(LS_POS, Math.round(r.left) + ',' + Math.round(r.top));
      } catch (e) { /* пусто */ }
    });

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
    // ×1 — честное время (реализм), ×2/×4/×8 — ускорить просмотр
    var PACE_INFO = {
      1: 'Реализм: часы идут честно (улица ×2, дом ×8, сон ×160)',
      2: 'Вдвое быстрее — для нетерпеливых',
      4: 'Быстро: удобно смотреть за деньами',
      8: 'Максимум: только чтобы добежать до финала'
    };
    [1, 2, 4, 8].forEach(function (pk) {
      var b = document.createElement('button');
      b.className = 'd-sp' + (pk === D.pace ? ' on' : '');
      b.textContent = '×' + pk;
      b.title = PACE_INFO[pk] || '';
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
    panelLoadGeom();
  }

  function updatePanelLog() {
    if (!dom.log) return;
    var n = D.journal.length;
    var from = Math.max(0, n - 7);
    var html = '';
    for (var i = from; i < n; i++) {
      var j = D.journal[i];
      var lc = j.cls === 'bad' ? ' bad' : j.cls === 'good' ? ' good' : j.cls === 'think' ? ' think' : '';
      html += '<div class="dl-line' + lc + '"><span class="dl-t">' + j.t + '</span> ' +
        escapeHtml(j.txt) + '</div>';
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
    var phaseTxt = {
      intro: 'обустройство', live: 'выживание',
      final: crazy() ? 'финал: Магический Огонь' : 'финал: сигнальный костёр',
      shipwait: crazy() ? 'ждём тарелку' : 'ждём пароход',
      done: 'завершено' }[D.phase] || D.phase;
    dom.status.textContent = 'День ' + dayN() + '/60 · ' + fmtTime() + ' · ' + phaseTxt +
      ' · ' + Math.round(outsideTemp()) + '° · темп ×' + D.curSpeed;
    // свёрнутая полоска тоже показывает день/время — панель маленькая, но информативная
    if (dom.title) {
      dom.title.textContent = D.panelCol
        ? ('ДЕМО · Д' + dayN() + ' ' + fmtTime())
        : 'ДЕМО · автопилот';
    }
    var act = '—';
    if (p && p.sleeping) act = 'спит (храп)';
    else if (D.task) act = (D.task.label || taskName(D.task)) || 'занят делом';
    else if (D.path && D.path.length) act = 'идёт';
    dom.action.textContent = act;
  }

  function taskName(t) {
    var names = {
      search: 'обыск', harvest: 'сбор', equip: 'переодевание', eat: 'еда', drink: 'питьё',
      sleep: 'ложится спать', melt: 'топит снег', craft: 'крафт', craftwait: 'работает',
      warm: 'греется', wait: 'передышка', hunt: 'охота', banish: 'ИЗГНАНИЕ лодошкой!',
      beacon: 'Магический Огонь',
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

  /** Адаптивный темп: контекст решает, насколько гнать время.
   *  РЕАЛИЗМ ВРЕМЕНИ: на улице — ×2 (часы ползут, пока дед идёт —
   *  как в жизни). Высокие множители — только внутри и во сне. */
  function autoSpeed(dt) {
    if (speedHold > 0) { speedHold -= dt; return; }
    var p = P();
    if (!p) return;
    var want;
    var inside = insideBuilding();
    if (p.sleeping) want = inside ? SP_SLEEP : SP_WALK;  // обморок на улице — часы честные
    else if (!inside) want = SP_WALK;         // УЛИЦА: всегда шаг, любой задачей
    else if (D.task && (D.task.type === 'warm')) want = SP_WARM;
    else if (D.task && (D.task.type === 'wait' || D.task.type === 'melt' ||
             D.task.type === 'craftwait')) want = SP_WAIT;
    else want = SP_INDOOR;
    want = Math.round(want * (D.pace || 1));
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
    var prof = null, k;
    if (Array.isArray(profsRaw)) {
      for (k = 0; k < profsRaw.length; k++) if (profsRaw[k].id === DEMO_PROF) prof = profsRaw[k];
    } else {
      prof = profsRaw[DEMO_PROF] || null;
    }
    if (!prof) prof = { id: DEMO_PROF, items: [], skills: {} };
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

  /** Загрузить партию из демо-слота (как Main.loadGame, но слот «demo»). */
  function loadDemoSave() {
    var data = null;
    try { data = WS.Save.load('demo'); } catch (e) { return false; }
    if (!data || !data.core) return false;
    try {
      if (WS.World && WS.World.reset) WS.World.reset();
      if (WS.Fx && WS.Fx.clear) WS.Fx.clear();
      if (WS.Snd && WS.Snd.stopAmbience) WS.Snd.stopAmbience();
      WS.G = data.core;
      if (WS.Gen && WS.Gen.generate) WS.Gen.generate(WS.G.seed);
      if (WS.World && WS.World.deserialize) WS.World.deserialize(data.world);
      if (WS.G.player && WS.World && WS.World.addEnt) {
        var found = false;
        for (var i = 0; i < WS.World.ents.length; i++) {
          if (WS.World.ents[i] && WS.World.ents[i].id === 'player') { found = true; break; }
        }
        if (!found) WS.World.addEnt(WS.G.player);
      }
      if (WS.Weather && WS.Weather.deserialize && WS.G.weather) {
        WS.Weather.deserialize(WS.G.weather);
      }
      WS.G.running = true;
      if (WS.Cam) WS.Cam.follow = WS.G.player;
      WS.Ev.emit('game:load', {});
      return true;
    } catch (e) {
      WS.err('demo: загрузка демо-слота', e && e.message);
      return false;
    }
  }

  function start(opts) {
    opts = opts || {};
    if (D.active) return false;

    // --- продолжение незавершённого демо? (прогресс — в демо-слоте сейва) ---
    var resumed = false;
    if (!opts.fresh && WS.Save && WS.Save.exists && WS.Save.exists('demo')) {
      var meta = null;
      try { meta = WS.Save.meta('demo'); } catch (e) { meta = null; }
      var dayS = meta && meta.day ? meta.day : '?';
      var go = false;
      try {
        go = window.confirm('Найдено незавершённое демо-прохождение (день ' + dayS +
          ' из 60).\nПродолжить его? («Отмена» — начать демо заново.)');
      } catch (e) { go = false; }
      if (go) {
        resumed = loadDemoSave();
        if (!resumed) { try { WS.Save.remove('demo'); } catch (e2) { /* пусто */ } }
      } else {
        try { WS.Save.remove('demo'); } catch (e2) { /* пусто */ }
      }
    }

    if (!resumed) {
      try {
        if (!WS.Main.newGame(DEMO_PROF, DEMO_TRAITS, DEMO_SEED)) return false;
      } catch (e) {
        WS.err('demo: newGame', e && e.message);
        return false;
      }
      applyProfession();
      // ОДЕТЬСЯ НЕМЕДЛЕННО: на морозе каждая минута раздетым — минус градус
      try {
        if (WS.Action.equipBest) WS.Action.equipBest();
      } catch (e) { /* пусто */ }
      try { localStorage.removeItem(JKEY); } catch (e) { /* пусто */ }
    }

    D.active = true;
    D.resumedFrom = resumed ? dayN() : 0;
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
    D.warmFail = {};
    D.warmToldId = '';
    D.startStamp = stamp();
    D.startedAt = Date.now();
    D.world = scanWorld();
    D.base = D.world ? D.world.base : null;
    if (resumed) restoreJournal();
    // БЕЗУМНЫЙ ДЕД: бот прокачивает Древо Мудрости сам
    try { if (WS.Crazy && WS.Crazy.setAutoSpend) WS.Crazy.setAutoSpend(true); } catch (e) { /* пусто */ }

    buildPanel();
    if (dom.root) dom.root.classList.remove('hidden');
    setSpeed(SP_WALK);
    try { WS.Ui.unpause(); } catch (e) { /* пусто */ }

    if (D.watchIv) clearInterval(D.watchIv);
    D.watchIv = setInterval(watchScreens, 400);

    log('ДЕМО старт: безумный дед-телеграфист на станции Пристань-Тихая, зерно мира ' + DEMO_SEED + '.', 'good');
    log('План деда: обчистить посёлок, собрать грибную энергию, прокачать Древо Мудрости (T), '
      + '3 факела к 55-му дню — и Магический Огонь на мостках. Тарелка ждёт!');
    if (D.base) {
      log('База: ' + D.base.id + ' (' + D.base.type + ') @' + D.base.x + ',' + D.base.y +
        (D.base.heated ? ' — из трубы идёт дым, дом тёплый' : ' — дом холодный') +
        (D.base.bed ? ', есть кровать' : '') + (D.base.stove ? ', есть печь' : ''));
    } else {
      log('Тёплая изба с кроватью не нашлась — будет туго.', 'bad');
    }
    var sealed = D.world ? D.world.sealed : null;
    if (sealed && (sealed.beds || sealed.stoves || sealed.containers)) {
      log('⚠ Мир: запечатано генератором — кроватей: ' + sealed.beds + ', печей: ' + sealed.stoves +
        ', контейнеров: ' + sealed.containers + ' (недостижимы даже после ремонта дверей — пропускаю).', 'bad');
    }

    if (resumed) {
      // продолжение: интро не нужно — бот сам разберётся (nextActivity)
      D.phase = dayN() >= FINAL_DAY ? 'final' : 'live';
      D.task = null;
      D.plan = [];
      log('▸ ПРОДОЛЖЕНИЕ демо с дня ' + dayN() + '/60 — партия восстановлена из демо-слота.', 'good');
      if (D.base) log('База по-прежнему: ' + D.base.id + (D.base.heated ? ' (тёплая)' : '') + '.');
      return true;
    }

    // ИНТРО-ПЛАН (выживание дня 1 — тот, что раньше убивал бота):
    //   1) вокзал: обыскать контейнеры у спавна — тёплая одежда и хлам;
    //      одеться сразу: в стартовой шинели дальняя ходьба смертельна;
    //   2) поленница: дрова + трут + спички = костёр в чистом поле
    //      (единственное быстрое тепло на маршруте);
    //   3) база: тёплая изба с кроватью — жить там.
    var p = P();
    if (p && D.world) {
      var startLoot = [];
      for (var s1 = 0; s1 < D.world.loot.length; s1++) {
        var lt = D.world.loot[s1];
        if (!lt.o || lt.o.looted) continue;
        if (dist(p.x, p.y, lt.o.x, lt.o.y) <= 10) startLoot.push(lt);
      }
      startLoot.sort(function (a, b) {
        return dist(p.x, p.y, a.o.x, a.o.y) - dist(p.x, p.y, b.o.x, b.o.y);
      });
      D.plan = [];
      for (var s2 = 0; s2 < startLoot.length && s2 < 3; s2++) {
        D.plan.push(taskGoto(startLoot[s2].o.x, startLoot[s2].o.y, 1.2, 'обыск: вокзал'));
        D.plan.push({ type: 'search', o: startLoot[s2].o });
      }
      D.plan.push({ type: 'equip' });
      // ближайшая поленница (в радиусе 30 тайлов) — дрова для костра/печи
      // (дед-режим: дрова не нужны — дед не мёрзнет)
      var pile = null, pd = 30;
      if (!crazy()) {
        for (var s3 = 0; s3 < D.world.loot.length; s3++) {
          var lo = D.world.loot[s3].o;
          if (!lo || lo.looted) continue;
          var nm = String(lo.name || '').toLowerCase();
          if (nm.indexOf('оленн') < 0 && nm.indexOf('дровн') < 0) continue;
          var dd = dist(p.x, p.y, lo.x, lo.y);
          if (dd < pd) { pd = dd; pile = lo; }
        }
      }
      if (pile) {
        D.plan.push(taskGoto(pile.x, pile.y, 1.2, 'поленница (дрова)'));
        D.plan.push({ type: 'search', o: pile });
      }
    }
    if (D.base) {
      var introSpot = D.base.reachTile || { x: D.base.x + D.base.w / 2, y: D.base.y + D.base.h / 2 };
      var ig = taskGoto(introSpot.x, introSpot.y, 1.4, 'тёплая изба (база)');
      ig.homeTrip = true;                 // поездка к базе неприкасаема для холод-ветки
      D.plan.push(ig);
      for (var c2 = 0; c2 < D.base.containers.length; c2++) {
        D.plan.push(taskGoto(D.base.containers[c2].x, D.base.containers[c2].y, 1.2, 'обыск: изба (база)'));
        D.plan.push({ type: 'search', o: D.base.containers[c2] });
      }
      if (D.base.bed) D.plan.push(taskGoto(D.base.bed.x, D.base.bed.y, 1.4, 'кровать'));
      D.plan.push({ type: 'equip' });
    } else {
      D.plan.push(taskGoto(35.5, 139.5, 1.4, 'вокзал (своя контора)'));
    }
    D.phase = 'live';
    return true;
  }

  function stop(reason) {
    if (!D.active) return;
    D.active = false;
    D.endedAt = Date.now();
    releaseKeys();
    if (D.watchIv) { clearInterval(D.watchIv); D.watchIv = 0; }
    try { WS.Loop.setSpeed(1); } catch (e) { /* пусто */ }
    if (dom.root) dom.root.classList.add('hidden');
    log('Демо остановлено: ' + (reason || 'причина не указана') +
      '. Прогресс сохранён: кнопка «▶ Демо-прохождение» предложит продолжить.');
    WS.log('[Demo] остановлен:', reason || '');
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
      if (crazy()) {
        log('★ ТАРЕЛКА ПРИЛЕТЕЛА! Магический Огонь сработал — дед улетел в Валгаллу мультяшных дедов. Победа за ' + mins + ' мин реального времени.', 'good');
      } else {
        log('★ ПАРОХОД ПРИШЁЛ! Сигнальный костёр сработал. Победа за ' + mins + ' мин реального времени.', 'good');
      }
      log('Нажми «⬇ журнал демо» на панели — выгрузится полный отчёт для разбора полётов.');
    } else {
      if (crazy()) {
        log('✝ ХП деда иссякли — он уснул навсегда. Демо остановлено (' + mins + ' мин).', 'bad');
      } else {
        log('✝ Герой погиб. Демо остановлено (' + mins + ' мин).', 'bad');
      }
    }
    // панель остаётся видимой (журнал + выгрузка); автопилот выключаем
    D.active = false;
    if (D.watchIv) { clearInterval(D.watchIv); D.watchIv = 0; }
    try { WS.Loop.setSpeed(1); } catch (e) { /* пусто */ }
    updatePanel();
    // финал есть финал: демо-слот и журнал чистим (следующий старт — новый)
    try { WS.Save.remove('demo'); } catch (e) { /* пусто */ }
    try { localStorage.removeItem(JKEY); } catch (e) { /* пусто */ }
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
    active: function () { return D.active; },
    setSpeed: setSpeed,
    setPace: function (n) { D.pace = Math.max(1, Math.min(8, n || 1)); speedHold = 0; return D.pace; },
    journal: function () { return D.journal.slice(); },
    journalText: journalText,
    downloadJournal: downloadJournal,
    thoughtLog: thoughtLog,
    /** Отладка в консоли: состояние автопилота. */
    _state: function () { return D; },
    /** Отладка: поиск пути (те же внутренности, что у автопилота). */
    _findPath: function (a, b, c, d) { return findPath(a, b, c, d); },
  });
})();
