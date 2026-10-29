/**
 * A4 — волчьи стаи, ГЛАВНАЯ угроза «Белого Безмолвия» (аналог зомби PZ).
 * Стая: {members, alpha, territory, mode 'den'|'patrol'|'hunt', target}.
 * День: патруль территории (r=25), игрок дальше 15 тайлов не существует,
 * огонь (костры) и фонарь игрока отпугивают. Ночь (и полярная ночь):
 * вой, охота на окраины посёлка, чутьё крови/мяса/спящего игрока,
 * окружение цели кольцом и очерёдные атаки (не больше двух волков у цели).
 * Убийство: hp<=0 -> WS.AI.kill (труп через WS.Loot.makeCorpse).
 */
(function () {
  'use strict';

  var AI = null;   // WS.AI (алиас назначается в boot, договор CONTRACT.md)

  // ================================================================ настройки

  var TERRITORY_R = 25;          // радиус патрулируемой территории, тайлов
  var DAY_IGNORE = 15;           // дальше — волк игрока «не замечает»
  var DAY_DEFEND = 8;            // ближе — защита территории атакой
  var NIGHT_SPD = 3.1 / 2.8;     // ночью волки быстрее (2.8 -> 3.1)
  var FEAR_FIRE_R = 4.5;         // радиус паники от огня
  var SMELL_RANGE = 45;          // ночью чуют кровь за 45 тайлов
  var ATTACK_RING_X = 3.2;       // эллипс окружения цели (изометрия)
  var ATTACK_RING_Y = 2.4;
  var PACK_TICK = 0.4;           // контролёр стаи — 2.5 раза в секунду

  // пиксельные цвета (из палитры WS.Spr.pal)
  var W1 = '#8b909b', W2 = '#a7adb8', WD = '#5a5f6a', WS0 = '#3f434c';
  var EYE = '#ffd75e';           // янтарные глаза

  var packs = [];                // все стаи карты

  // ================================================================ спрайты

  /** Мелкая заливка-пиксель. */
  function p(c, x, y, w, h, col) {
    c.fillStyle = col;
    c.fillRect(x, y, w, h);
  }

  /** Волк в профиль, морда вправо (кадры бега 0/1). */
  function wolfSide(c, frame, bob) {
    var dy = frame === 1 ? 1 : 0;   // лёгкое покачивание корпуса
    // хвост — пушистый, поднят
    p(c, 1, 9 + dy, 7, 5, W1);
    p(c, 0, 7 + dy, 4, 4, W2);
    p(c, 6, 12 + dy, 2, 2, WD);
    // корпус — поджарый, спина выше крестца
    p(c, 8, 11 + dy, 26, 8, W1);
    p(c, 9, 10 + dy, 24, 2, W2);
    p(c, 9, 17 + dy, 24, 2, WD);
    p(c, 12, 19 + dy, 16, 1, WD);
    // грудь глубже у передних лап
    p(c, 27, 13 + dy, 6, 6, W1);
    p(c, 28, 13 + dy, 4, 3, W2);
    // шея и голова
    p(c, 31, 6 + dy, 10, 8, W1);
    p(c, 32, 5 + dy, 8, 2, W2);
    p(c, 39, 8 + dy, 4, 5, W1);
    // уши
    p(c, 32, 1 + dy, 3, 5, W1);
    p(c, 37, 1 + dy, 3, 5, W1);
    p(c, 33, 2 + dy, 1, 3, WD);
    p(c, 38, 2 + dy, 1, 3, WD);
    // морда и нос
    p(c, 40, 9 + dy, 6, 4, WD);
    p(c, 45, 9 + dy, 2, 3, '#1a1c20');
    // глаз — светящийся янтарь
    p(c, 37, 8 + dy, 2, 2, EYE);
    // ноги: рысь — два кадра «разножка/сближение»
    if (frame === 0) {
      p(c, 32, 18 + dy, 3, 9, WD); p(c, 27, 18 + dy, 3, 9, WD);
      p(c, 14, 18 + dy, 3, 9, WD); p(c, 9, 18 + dy, 3, 9, WD);
      p(c, 32, 25 + dy, 3, 2, WS0); p(c, 9, 25 + dy, 3, 2, WS0);
    } else {
      p(c, 30, 18 + dy, 3, 9, WD); p(c, 28, 18 + dy, 3, 9, WD);
      p(c, 12, 18 + dy, 3, 9, WD); p(c, 10, 18 + dy, 3, 9, WD);
      p(c, 30, 25 + dy, 3, 2, WS0); p(c, 10, 25 + dy, 3, 2, WS0);
    }
    if (bob) p(c, 20, 20, 1, 1, WS0);   // метка отладки (не используется)
  }

  /** Волк со спины (идёт на север): хвост к зрителю. */
  function wolfUp(c, frame) {
    var dy = frame === 1 ? 1 : 0;
    // корпус
    p(c, 14, 12 + dy, 20, 10, W1);
    p(c, 15, 11 + dy, 18, 2, W2);
    p(c, 15, 21 + dy, 18, 1, WD);
    // голова (видна сзади, выше и дальше)
    p(c, 19, 4 + dy, 10, 8, W1);
    p(c, 20, 3 + dy, 8, 2, W2);
    p(c, 19, 2 + dy, 3, 4, W1); p(c, 26, 2 + dy, 3, 4, W1);
    p(c, 20, 3 + dy, 1, 2, WD); p(c, 27, 3 + dy, 1, 2, WD);
    // хвост — к зрителю, пушистый
    p(c, 20, 21 + dy, 8, 6, W1);
    p(c, 22, 26 + dy, 4, 2, W2);
    // ноги
    if (frame === 0) {
      p(c, 13, 22 + dy, 3, 5, WD); p(c, 32, 22 + dy, 3, 5, WD);
      p(c, 17, 22 + dy, 3, 4, WD); p(c, 28, 22 + dy, 3, 4, WD);
    } else {
      p(c, 14, 22 + dy, 3, 5, WD); p(c, 31, 22 + dy, 3, 5, WD);
      p(c, 18, 22 + dy, 3, 4, WD); p(c, 27, 22 + dy, 3, 4, WD);
    }
  }

  /** Волк мордой к зрителю (идёт на юг): видны оба глаза. */
  function wolfDown(c, frame) {
    var dy = frame === 1 ? 1 : 0;
    // корпус-грудь
    p(c, 15, 13 + dy, 18, 9, W1);
    p(c, 17, 12 + dy, 14, 2, W2);
    p(c, 16, 20 + dy, 16, 2, WD);
    // голова крупная, анфас
    p(c, 17, 2 + dy, 14, 11, W1);
    p(c, 18, 1 + dy, 12, 2, W2);
    p(c, 16, 0 + dy, 3, 4, W1); p(c, 29, 0 + dy, 3, 4, W1);
    p(c, 17, 1 + dy, 1, 2, WD); p(c, 30, 1 + dy, 1, 2, WD);
    // морда и нос
    p(c, 21, 9 + dy, 6, 4, WD);
    p(c, 23, 10 + dy, 2, 2, '#1a1c20');
    // пара светящихся глаз
    p(c, 20, 5 + dy, 2, 2, EYE);
    p(c, 26, 5 + dy, 2, 2, EYE);
    // ноги
    if (frame === 0) {
      p(c, 16, 22 + dy, 3, 5, WD); p(c, 29, 22 + dy, 3, 5, WD);
      p(c, 20, 22 + dy, 3, 4, WD); p(c, 25, 22 + dy, 3, 4, WD);
    } else {
      p(c, 17, 22 + dy, 3, 5, WD); p(c, 28, 22 + dy, 3, 5, WD);
      p(c, 21, 22 + dy, 3, 4, WD); p(c, 24, 22 + dy, 3, 4, WD);
    }
  }

  /**
   * Общий отрисовщик: 4 стороны (N/S/E/W через dir&2), 2 кадра бега.
   * Запад — зеркало востока.
   */
  function wolfDraw(c, w, h, frame, dir) {
    var d4 = (dir === undefined) ? 2 : ((dir | 0) & 2);   // 0 N, 2 E, 4 S, 6 W
    if (d4 === 6) {
      c.save();
      c.translate(w, 0);
      c.scale(-1, 1);
      wolfSide(c, frame, false);
      c.restore();
    } else if (d4 === 2) {
      wolfSide(c, frame, false);
    } else if (d4 === 0) {
      wolfUp(c, frame);
    } else {
      wolfDown(c, frame);
    }
  }

  /**
   * Ночная подсветка глаз: рисуется ПОСЛЕ основного спрайта
   * (Gfx вызывает e.render(ctx, sx, sy, zoom)).
   */
  function makeWolfRender(e) {
    return function (ctx, sx, sy, zoom) {
      try {
        if (!AI || !AI.isNight()) return;
        var t = performance.now() / 850;
        var glow = 0.5 + 0.3 * Math.sin(t + e.x * 3 + e.y * 5);
        var a = Math.round(glow * 100) / 100;
        var d4 = (e.dir || 0) & 2;
        var hx = 0, hy = -13;
        if (d4 === 2) { hx = 9; hy = -12; }
        else if (d4 === 6) { hx = -9; hy = -12; }
        else if (d4 === 4) { hy = -14; }
        else { return; }   // со спины глаз не видно
        var s = Math.max(1.5, 2.4 * zoom * (e.scale || 1));
        var cxp = sx + hx * zoom * (e.scale || 1);
        var cyp = sy + hy * zoom * (e.scale || 1);
        // мягкое свечение
        if (ctx.createRadialGradient) {
          var g = ctx.createRadialGradient(cxp, cyp, 0, cxp, cyp, s * 2.5);
          g.addColorStop(0, 'rgba(255,215,94,' + (a * 0.5) + ')');
          g.addColorStop(1, 'rgba(255,215,94,0)');
          ctx.fillStyle = g;
          ctx.fillRect(cxp - s * 2.5, cyp - s * 2.5, s * 5, s * 5);
        }
        ctx.fillStyle = 'rgba(255,225,120,' + a + ')';
        if (d4 === 4) {
          // анфас — два глаза
          ctx.fillRect(cxp - s * 1.6, cyp - s / 2, s, s);
          ctx.fillRect(cxp + s * 0.8, cyp - s / 2, s, s);
        } else {
          // профиль — один
          ctx.fillRect(cxp - s / 2, cyp - s / 2, s, s);
        }
      } catch (err) { /* рендер глаз не должен ронять кадр */ }
    };
  }

  // ================================================================ создание

  function mkPack(R, cx, cy) {
    var pack = {
      id: WS.World.newId('pack'),
      members: [],
      alpha: null,
      territory: { x: cx, y: cy, r: TERRITORY_R },
      mode: 'patrol',            // 'den' | 'patrol' | 'hunt'
      target: null,              // сущность игрока или точка {x, y}
      aggroT: 0,                 // месть игроку, сек
      panicT: 0,                 // паника (убит вожак), сек
      panicPt: null,
      huntPt: null,              // район охоты на окраине посёлка
      huntT: 0,                   // сколько уже топтались у окраины
      retarget: 0,
      interestT: 0,              // время «расследования» точки
      howlDelay: 0,
      lastHowl: -999
    };
    packs.push(pack);
    return pack;
  }

  function mkWolf(R, pack, x, y, isAlpha) {
    var e = WS.World.addEnt({
      kind: 'wolf',
      x: x, y: y,
      dir: R.int(0, 7),
      hp: isAlpha ? 60 : 45,
      maxHp: isAlpha ? 60 : 45,
      speed: isAlpha ? 2.9 : 2.8,
      dmg: isAlpha ? 16 : 12,
      atkSpd: 1.1,
      sprName: 'wolf',
      sprFrame: 0,
      animFrames: 2,
      shadowR: 0.5,
      scale: isAlpha ? 1.18 : 1,
      state: 'idle', stateT: 0,
      atkCd: 0, lungeT: 0,
      sight: 9,
      brain: { hears: true, noInside: true },
      pack: pack,
      alpha: !!isAlpha
    });
    e.render = makeWolfRender(e);
    if (pack) {
      pack.members.push(e);
      if (isAlpha || !pack.alpha) pack.alpha = e;
    }
    return e;
  }

  // ================================================================ спавн

  /** 3–5 стай по 3–6 волков в лесу (y < 80), подальше от посёлка. */
  function spawnAll() {
    var G = WS.G;
    if (!G) return;
    var R = WS.RNG.mk((G.seed ^ 0x0B1D) >>> 0);   // детерминизм от сида
    var n = R.int(3, 5);
    var spawned = 0;
    for (var i = 0; i < n; i++) {
      var spot = AI.findSpot(R, {
        y0: 8, y1: 74,           // лес
        minVillageD: 42,         // подальше от посёлка
        needTree: true,
        tries: 90
      });
      if (!spot) continue;
      var pack = mkPack(R, spot.x, spot.y);
      var size = R.int(3, 6);
      for (var j = 0; j < size; j++) {
        mkWolf(R, pack,
          spot.x + R.range(-2.5, 2.5),
          spot.y + R.range(-2, 2),
          j === 0);
        spawned++;
      }
    }
    WS.log('[AI] волков:', spawned, 'стай:', packs.length);
  }

  // ================================================================ контролёр стаи

  var packAcc = 0;

  function packTick(dt) {
    var G = WS.G;
    if (!G || !G.running || G.dead) return;
    packAcc += dt;
    if (packAcc < PACK_TICK) return;
    var pdt = packAcc;
    packAcc = 0;
    var night = AI.isNight();
    for (var i = packs.length - 1; i >= 0; i--) {
      var pack = packs[i];
      // чистка мёртвых из состава
      var alive = [];
      for (var m = 0; m < pack.members.length; m++) {
        if (!pack.members[m].dead) alive.push(pack.members[m]);
      }
      pack.members = alive;
      if (!pack.members.length) { packs.splice(i, 1); continue; }
      if (!pack.alpha || pack.alpha.dead) pack.alpha = pack.members[0];

      // таймеры стаи
      if (pack.panicT > 0) pack.panicT -= pdt;
      if (pack.aggroT > 0) pack.aggroT -= pdt;
      if (pack.howlDelay > 0) {
        pack.howlDelay -= pdt;
        if (pack.howlDelay <= 0) howl(pack);
      }
      pack.retarget -= pdt;

      // смена режима: ночь/день (в полярную ночь охота не прекращается)
      if (night && pack.mode !== 'hunt') {
        pack.mode = 'hunt';
        pack.huntPt = pickOutskirts();
        pack.huntT = 0;
        pack.retarget = 0;
        pack.howlDelay = RUNTIME_RANGE(0.5, 5);   // разнобой воя
      } else if (!night && pack.mode === 'hunt' && !AI.isPolarNight()) {
        pack.mode = 'patrol';
        pack.target = null;
      }

      // выбор цели
      if (pack.retarget <= 0) {
        pack.retarget = 1.2;
        pickTarget(pack, night);
      }

      // «выветривание» точки интереса (запах/шум)
      if (pack.interestT > 0) {
        pack.interestT -= pdt;
        if (pack.interestT <= 0 && pack.target && !pack.target.kind) {
          pack.target = null;
        }
      }

      // обход окраины: постояли в одном районе — сменить
      if (night && pack.mode === 'hunt' && !pack.target) {
        var c = packCenter(pack);
        if (WS.M.dist(c.x, c.y, pack.huntPt.x, pack.huntPt.y) < 10) {
          pack.huntT += pdt;
          if (pack.huntT > 30) {
            pack.huntPt = pickOutskirts();
            pack.huntT = 0;
          }
        }
      }

      // повторный вой в затяжной охоте — чтобы игрок не расслаблялся
      if (night && pack.mode === 'hunt' && AI.now() - pack.lastHowl > 50) {
        if (Math.random() < 0.05) howl(pack, true);
      }
    }
  }

  function RUNTIME_RANGE(a, b) { return a + Math.random() * (b - a); }

  /** Окраина посёлка (для ночной охоты). */
  function pickOutskirts() {
    return {
      x: 55 + Math.random() * 110,    // x 55..165
      y: AI.consts.VILLAGE_Y0 + 2 + Math.random() * 8   // y 82..90
    };
  }

  /**
   * Приоритет цели ночной охоты:
   * месть > запах крови > шум > спящий игрок > игрок с мясом > нет.
   * Днём: месть > близкий шум > нет.
   */
  function pickTarget(pack, night) {
    var p = AI.player();
    if (pack.panicT > 0) { pack.target = null; return; }
    // 1. месть: стаю тронули — помнят обидчика
    if (pack.aggroT > 0 && p && p.hp > 0) { pack.target = p; return; }
    if (!night) {
      // днём сами на людей не охотятся, но шум рядом проверят
      var al = freshestAlert(pack);
      if (al && WS.M.dist(al.x, al.y, pack.alpha.x, pack.alpha.y) < 16) {
        pack.target = { x: al.x, y: al.y };
        pack.interestT = 10;
        return;
      }
      pack.target = null;
      return;
    }
    // 2. запах крови (память 60 сек)
    var c = packCenter(pack);
    var sm = AI.smell.nearest(c.x, c.y, SMELL_RANGE);
    if (sm) {
      pack.target = { x: sm.x, y: sm.y };
      pack.interestT = 20;
      return;
    }
    // 3. недавний шум (выстрел, крик) — ночью идут проверить издалека
    var noise = freshestAlert(pack);
    if (noise && AI.now() - noise.t < 8) {
      pack.target = { x: noise.x, y: noise.y };
      pack.interestT = 12;
      return;
    }
    if (!p || p.hp <= 0) { pack.target = null; return; }
    // 4. спящий игрок — лёгкая добыча, чуют издалека
    if (p.sleeping && WS.M.dist(c.x, c.y, p.x, p.y) < 28) {
      pack.target = p;
      return;
    }
    // 5. запах мяса в инвентаре игрока
    if (playerHasMeat(p) && WS.M.dist(c.x, c.y, p.x, p.y) < 16) {
      pack.target = p;
      return;
    }
    pack.target = null;
  }

  /** Самый свежий alertTo среди первых членов стаи. */
  function freshestAlert(pack) {
    var best = null;
    var n = Math.min(pack.members.length, 4);
    for (var i = 0; i < n; i++) {
      var a = pack.members[i].alertTo;
      if (a && (!best || a.t > best.t)) best = a;
    }
    return best;
  }

  /** Есть ли у игрока мясо/рыба (запах приманивает ночью). */
  function playerHasMeat(p) {
    if (!p || !p.inv) return false;
    for (var i = 0; i < p.inv.length; i++) {
      var it = p.inv[i];
      if (!it) continue;
      var id = String(it.id || '');
      if (id.indexOf('meat') >= 0 || id.indexOf('fish') >= 0 ||
          id.indexOf('carcass') >= 0) return true;
    }
    return false;
  }

  function packCenter(pack) {
    var x = 0, y = 0, n = 0;
    for (var i = 0; i < pack.members.length; i++) {
      var m = pack.members[i];
      if (m.dead) continue;
      x += m.x; y += m.y; n++;
    }
    if (!n) return { x: pack.territory.x, y: pack.territory.y };
    return { x: x / n, y: y / n };
  }

  /** Вой: сигнал игроку и всей стае. */
  function howl(pack, quiet) {
    var a = pack.alpha || pack.members[0];
    if (!a) return;
    var p = AI.player();
    var d = p ? WS.M.dist(a.x, a.y, p.x, p.y) : 999;
    if (d > 60) return;   // слишком далеко — не озвучиваем
    AI.snd('howl', a.x, a.y, quiet ? 0.6 : 1);
    if (d < 55) AI.msg('Вы слышите волчий вой...', '#a9b6c9');
    pack.lastHowl = AI.now();
  }

  // ================================================================ поведение волка

  function spdBase(e, night) {
    return e.speed * (night ? NIGHT_SPD : 1);
  }

  /** Сколько сородичей стоят к цели ближе, чем я (очерёдность атаки). */
  function countCloser(pack, e, tgt) {
    var myD = WS.M.dist(e.x, e.y, tgt.x, tgt.y);
    var n = 0;
    for (var i = 0; i < pack.members.length; i++) {
      var m = pack.members[i];
      if (m === e || m.dead) continue;
      if (WS.M.dist(m.x, m.y, tgt.x, tgt.y) < myD - 0.3) n++;
    }
    return n;
  }

  /** Своя позиция в кольце окружения (медленно вращающемся). */
  function orbitSlot(e, pack, cx, cy, rx, ry) {
    var members = (pack && pack.members) || [e];
    var idx = members.indexOf(e);
    if (idx < 0) idx = 0;
    var n = Math.max(1, members.length);
    var a = (idx / n) * Math.PI * 2 + AI.now() * 0.22;
    return {
      x: cx + Math.cos(a) * rx,
      y: cy + Math.sin(a) * ry
    };
  }

  /** Мгновенный сдвиг (отскок после укуса) с проверкой проходимости. */
  function displaceAway(e, tx, ty, tiles) {
    var dx = e.x - tx, dy = e.y - ty;
    var d = Math.sqrt(dx * dx + dy * dy) || 1;
    var ux = dx / d, uy = dy / d;
    for (var k = 1; k >= 0.25; k -= 0.25) {
      var nx = e.x + ux * tiles * k;
      var ny = e.y + uy * tiles * k;
      if (AI.passable(nx, ny, e)) { e.x = nx; e.y = ny; return; }
    }
  }

  /** Укус игрока. */
  function bite(e) {
    e.atkCd = 1 / (e.atkSpd || 1.1);
    e.lungeT = 0;
    AI.damagePlayer(e.dmg, 'bite', e);
    displaceAway(e, WS.G.player.x, WS.G.player.y, 0.9);   // отпрыгнул
  }

  function updateWolf(e, dt, R) {
    var p = AI.player();
    var night = AI.isNight();
    var pack = e.pack;
    e.moving = false;

    // --- 1. паника стаи (убит вожак): 30 секунд хаотичного бегства
    if (pack && pack.panicT > 0) {
      if (!e.panicTo) {
        var a = Math.random() * Math.PI * 2;
        var rr = 14 + Math.random() * 12;
        e.panicTo = {
          x: WS.M.clamp(pack.panicPt ? pack.panicPt.x + Math.cos(a) * rr : e.x, 3, 216),
          y: WS.M.clamp(pack.panicPt ? pack.panicPt.y + Math.sin(a) * rr : e.y, 3, 216)
        };
      }
      AI.moveTowards(e, e.panicTo.x, e.panicTo.y, spdBase(e, night) * 1.2, dt);
      e.state = 'flee';
      AI.anim(e, dt, 9);
      return;
    }
    e.panicTo = null;

    // --- 2. огонь: волк не работает рядом с пламенем
    var fire = AI.fireNear(e.x, e.y, FEAR_FIRE_R);
    if (fire) {
      AI.moveAway(e, fire.x, fire.y, spdBase(e, night) * 1.25, dt);
      e.state = 'flee'; e.stateT = 0; e.fleeT = 3;
      AI.anim(e, dt, 10);
      return;
    }

    // --- 3. тяжело ранен — бегство с поля боя
    if (e.hp <= e.maxHp * 0.3 && e.state !== 'flee') {
      e.state = 'flee';
      e.stateT = 0;
      e.fleeT = 6 + R.f() * 5;
      var th = (e.threat && AI.now() - (e.threatT || 0) < 25) ? e.threat : null;
      e.fleeFrom = th ? { x: th.x, y: th.y } : { x: e.x + R.range(-8, 8), y: e.y + R.range(-8, 8) };
      if (R.chance(0.6)) AI.snd('growl', e.x, e.y, 0.5);
    }
    if (e.state === 'flee') {
      e.fleeT -= dt;
      if (e.fleeFrom) {
        AI.moveAway(e, e.fleeFrom.x, e.fleeFrom.y, spdBase(e, night) * 1.15, dt);
      } else {
        AI.wanderInArea(e, e.x, e.y, 6, dt, spdBase(e, night));
      }
      AI.anim(e, dt, 9);
      if (e.fleeT <= 0) { e.state = 'idle'; e.stateT = 0; e.fleeFrom = null; }
      return;
    }

    var tgt = pack ? pack.target : null;
    var isPrey = !!(tgt && tgt.kind === 'player' && !tgt.dead && tgt.hp > 0);

    // --- 4. охота (ночь или месть)
    if (pack && (pack.mode === 'hunt' || pack.aggroT > 0)) {
      if (!tgt) {
        // цели нет — проулка у окраин посёлка
        var hp2 = pack.huntPt || pack.territory;
        AI.wanderInArea(e, hp2.x, hp2.y, 10, dt, spdBase(e, night) * 0.7);
        e.state = 'wander';
        AI.anim(e, dt, 6);
        return;
      }
      var tx = tgt.x, ty = tgt.y;
      var dT = WS.M.dist(e.x, e.y, tx, ty);
      var spd = spdBase(e, night);

      if (isPrey) {
        // игрок спрятался в доме: стая кружит вокруг здания
        var bld = WS.World.isInside(tx, ty);
        if (bld) {
          var bx = bld.x + bld.w / 2, by = bld.y + bld.h / 2;
          var rr2 = Math.max(bld.w, bld.h) / 2 + 2.5;
          var slot = orbitSlot(e, pack, bx, by, rr2, rr2 * 0.8);
          AI.moveTowards(e, slot.x, slot.y, spd * 0.8, dt);
          e.state = 'hunt';
          if (R.f() < dt * 0.06) AI.snd('growl', e.x, e.y, 0.35);
          AI.anim(e, dt, 6);
          return;
        }
        // фонарь игрока: 50% отпор — волк держит дистанцию
        var lamp = AI.lampNear(tx, ty, 3);
        var closer = countCloser(pack, e, tgt);
        var slot2 = orbitSlot(e, pack, tx, ty, ATTACK_RING_X, ATTACK_RING_Y);
        if (lamp && dT < 3.6 && R.chance(0.5)) {
          AI.moveTowards(e, slot2.x, slot2.y, spd, dt);
          e.state = 'hunt';
          AI.anim(e, dt, 7);
          return;
        }
        // дисциплина атаки: у цели не больше двух волков
        if (closer >= 2 && dT < 2.8) {
          AI.moveTowards(e, slot2.x, slot2.y, spd * 0.9, dt);
          e.state = 'hunt';
          AI.anim(e, dt, 7);
          return;
        }
        // рывок перед укусом (скорость x1.6 на 0.5 с)
        if (dT < 3.4 && dT > 1.2 && e.atkCd <= 0 && e.lungeT <= 0) {
          e.lungeT = 0.5;
          if (R.chance(0.5)) AI.snd('growl', e.x, e.y, 0.6);
        }
        if (e.lungeT > 0) spd *= 1.6;
        AI.moveTowards(e, tx, ty, spd, dt);
        if (dT < 1.2 && e.atkCd <= 0) bite(e);
        e.state = dT < 5 ? 'attack' : 'hunt';
      } else {
        // точка интереса: запах, шум — идут посмотреть
        AI.moveTowards(e, tx, ty, spd * 0.9, dt);
        e.state = 'hunt';
      }
      AI.anim(e, dt, 8);
      return;
    }

    // --- 5. дневное поведение: патруль территории / настороженность
    if (p && p.hp > 0) {
      var dP = WS.M.dist(e.x, e.y, p.x, p.y);
      if (dP <= DAY_IGNORE) {
        var threatened = e.threat && AI.now() - (e.threatT || 0) < 12;
        if (dP < DAY_DEFEND || threatened) {
          // защита территории: короткая атака, отстают, если игрок ушёл
          AI.moveTowards(e, p.x, p.y, spdBase(e, night), dt);
          if (dP < 1.2 && e.atkCd <= 0) bite(e);
          e.state = 'attack';
          if (R.f() < dt * 0.04) AI.snd('growl', e.x, e.y, 0.45);
        } else {
          // «провожают» по дуге, не приближаясь
          var slot3 = orbitSlot(e, pack || { members: [e] }, p.x, p.y, 8, 6);
          AI.moveTowards(e, slot3.x, slot3.y, spdBase(e, night) * 0.8, dt);
          e.state = 'alert';
          if (R.f() < dt * 0.03) AI.snd('growl', e.x, e.y, 0.3);
        }
        AI.anim(e, dt, 6);
        return;
      }
    }
    // спокойный патруль своей территории
    var ter = pack ? pack.territory : { x: e.x, y: e.y, r: 12 };
    AI.wanderInArea(e, ter.x, ter.y, ter.r || TERRITORY_R, dt, spdBase(e, night) * 0.5);
    e.state = 'wander';
    AI.anim(e, dt, 5);
  }

  // ================================================================ события

  /** Убийство волка: паника стаи или месть. */
  function onEntKill(d) {
    if (!d || !d.ent || d.ent.kind !== 'wolf') return;
    var e = d.ent;
    var pack = e.pack;
    if (!pack) return;
    var i = pack.members.indexOf(e);
    if (i >= 0) pack.members.splice(i, 1);
    if (pack.alpha === e) {
      // вожак пал — стая в панике 30 секунд
      pack.panicT = 30;
      pack.panicPt = { x: (d.by && d.by.x) || e.x, y: (d.by && d.by.y) || e.y };
      pack.target = null;
      pack.mode = 'patrol';
      pack.aggroT = 0;
      for (var m = 0; m < pack.members.length; m++) {
        pack.members[m].panicTo = null;   // направление выберут в тике
      }
      AI.snd('howl', e.x, e.y, 0.9);   // скорбный вой над вожаком
    } else if (d.by && (d.by.kind === 'player' || d.by.id === 'player')) {
      // месть: стая помнит обидчика 45 секунд
      pack.aggroT = 45;
      pack.target = d.by;
    }
  }

  /** Сущность убрали из мира (смерть/десериализация) — чистим состав. */
  function onEntRemove(d) {
    if (!d || !d.ent || d.ent.kind !== 'wolf') return;
    var e = d.ent;
    for (var i = packs.length - 1; i >= 0; i--) {
      var pack = packs[i];
      var j = pack.members.indexOf(e);
      if (j >= 0) {
        pack.members.splice(j, 1);
        if (pack.alpha === e && pack.members.length) pack.alpha = pack.members[0];
        if (!pack.members.length) packs.splice(i, 1);
      }
    }
  }

  /** Ночь: стаи поднимаются с воем. */
  function onNightFall() {
    for (var i = 0; i < packs.length; i++) {
      packs[i].mode = 'hunt';
      packs[i].huntPt = pickOutskirts();
      packs[i].huntT = 0;
      packs[i].howlDelay = RUNTIME_RANGE(0.4, 6);   // эхо по лесу
    }
  }

  /** Рассвет: охота сворачивается (кроме полярной ночи). */
  function onDayDawn() {
    if (AI.isPolarNight()) return;   // солнце не встанет — охота продолжается
    for (var i = 0; i < packs.length; i++) {
      packs[i].mode = 'patrol';
      packs[i].target = null;
    }
  }

  // ================================================================ API модуля

  WS.def('Wolf', {
    spawnAll: spawnAll,
    reset: function () {
      packs = [];
      packAcc = 0;
    },
    packs: function () { return packs; },
    count: function () {
      var n = 0;
      for (var i = 0; i < packs.length; i++) n += packs[i].members.length;
      return n;
    },
    /** Отладка/сюжет: заставить все стаи охотиться на игрока. */
    huntPlayer: function (sec) {
      for (var i = 0; i < packs.length; i++) {
        packs[i].aggroT = sec || 60;
        var p = AI.player();
        if (p) packs[i].target = p;
      }
    }
  });

  // ================================================================ загрузка

  WS.boot(function initWolfAI() {
    AI = WS.AI;   // алиас (модуль ai.js загружен раньше)

    // спрайт: 4 стороны (dir&2), 2 кадра бега
    WS.Spr.def('wolf', { w: 48, h: 28, draw: wolfDraw });

    // регистрация поведения волка в фреймворке
    AI.register('wolf', updateWolf);

    // контролёр стаи — частота 2.5 Гц, отдельным тиком
    WS.tick(50, packTick, 'ai:wolf:packs');

    // события
    WS.Ev.on('ent:kill', onEntKill);
    WS.Ev.on('ent:remove', onEntRemove);
    WS.Ev.on('night:fall', onNightFall);
    WS.Ev.on('day:dawn', onDayDawn);
  }, 'ai:wolf:init');
})();
