/**
 * A4 — медведь-шатун: босс тайги (не спит зимой, голоден и зол).
 * Один-два на карту. Слышит выстрелы за 40 тайлов и идёт проверять,
 * чует кровь. Увидев игрока — ВСТАЁТ на задние лапы (bear_rear, рык,
 * тряска камеры) и атакует: мощный отброс на 2 тайла, шанс перелома.
 * 260 hp; на половине здоровья может уйти (30%), а может озлитьиться.
 * Убийство: WS.AI.kill -> WS.Loot.makeCorpse('bear') от B-агента.
 */
(function () {
  'use strict';

  var AI = null;   // WS.AI (алиас в boot)

  // ================================================================ настройки

  var BEAR_HP = 260;
  var BEAR_SPEED = 3.4;         // тайлов/с — быстрее игрока (2.2)!
  var BEAR_DMG = 40;
  var BEAR_ATKSPD = 0.6;        // удар раз в ~1.7 с
  var SIGHT = 12;               // зрение днём (ночью canShow режет x0.4)
  var SMELL_R = 30;             // чует кровь
  var NOISE_R = 40;             // идёт проверять шум (выстрелы)
  var REAR_TIME = 1.4;          // вставание на лапы
  var KNOCK = 2.0;              // отброс игрока, тайлов
  var FRACTURE_CHANCE = 0.25;   // шанс перелома лапы игрока
  var LOSE_TIME = 10;          // секунд без контакта — теряет цель
  var ROAM_EVERY = 40;          // смена района блужданий

  // пиксельные цвета (палитра проекта)
  var B1 = '#4e3b2c', B2 = '#634c39', B3 = '#3a2c20';
  var MUZ = '#8a6a4a', CLW = '#d8d2c4', EYED = '#151009';

  var bears = [];   // все медведи карты (для отладки/подсчёта)

  // ================================================================ спрайты

  function p(c, x, y, w, h, col) {
    c.fillStyle = col;
    c.fillRect(x, y, w, h);
  }

  /** Медведь в профиль (морда вправо), 64x40. */
  function bearSide(c, frame) {
    var dy = frame === 1 ? 1 : 0;
    // массивный корпус с горбом-загривком
    p(c, 6, 16 + dy, 44, 15, B1);
    p(c, 8, 14 + dy, 40, 3, B2);
    p(c, 26, 10 + dy, 22, 7, B1);      // загривок выше
    p(c, 28, 10 + dy, 18, 2, B2);
    p(c, 8, 28 + dy, 40, 3, B3);       // брюхо в тени
    // голова
    p(c, 44, 9 + dy, 14, 14, B1);
    p(c, 45, 8 + dy, 12, 2, B2);
    p(c, 46, 4 + dy, 5, 5, B1); p(c, 54, 4 + dy, 5, 5, B1);   // уши
    p(c, 47, 5 + dy, 2, 2, B3); p(c, 55, 5 + dy, 2, 2, B3);
    // морда светлая, нос
    p(c, 54, 15 + dy, 8, 7, MUZ);
    p(c, 60, 16 + dy, 3, 3, '#100c08');
    // глаз
    p(c, 51, 12 + dy, 2, 2, EYED);
    // когти на лапах видны при шаге
    if (frame === 0) {
      p(c, 40, 30, 7, 8, B3); p(c, 10, 30, 7, 8, B3);
      p(c, 46, 36, 2, 2, CLW); p(c, 49, 36, 2, 2, CLW);
      p(c, 10, 36, 2, 2, CLW); p(c, 13, 36, 2, 2, CLW);
    } else {
      p(c, 42, 30, 7, 8, B3); p(c, 12, 30, 7, 8, B3);
      p(c, 12, 36, 2, 2, CLW); p(c, 15, 36, 2, 2, CLW);
      p(c, 44, 36, 2, 2, CLW); p(c, 47, 36, 2, 2, CLW);
    }
  }

  /** Медведь со спины (на север), 64x40. */
  function bearUp(c, frame) {
    var dy = frame === 1 ? 1 : 0;
    p(c, 14, 14 + dy, 36, 18, B1);
    p(c, 16, 12 + dy, 32, 3, B2);
    p(c, 18, 30 + dy, 28, 3, B3);
    // затылок с ушами выглядывает над спиной
    p(c, 24, 6 + dy, 16, 10, B1);
    p(c, 25, 5 + dy, 14, 2, B2);
    p(c, 23, 2 + dy, 5, 5, B1); p(c, 36, 2 + dy, 5, 5, B1);
    // круп и хвостик
    p(c, 26, 28 + dy, 12, 5, B2);
    if (frame === 0) {
      p(c, 16, 32, 8, 6, B3); p(c, 40, 32, 8, 6, B3);
      p(c, 24, 32, 6, 6, B3); p(c, 34, 32, 6, 6, B3);
    } else {
      p(c, 17, 32, 8, 6, B3); p(c, 39, 32, 8, 6, B3);
      p(c, 25, 32, 6, 6, B3); p(c, 33, 32, 6, 6, B3);
    }
  }

  /** Медведь мордой к зрителю (на юг), 64x40. */
  function bearDown(c, frame) {
    var dy = frame === 1 ? 1 : 0;
    // корпус за головой
    p(c, 18, 18 + dy, 28, 15, B1);
    p(c, 20, 17 + dy, 24, 2, B2);
    p(c, 20, 31 + dy, 24, 2, B3);
    // крупная голова анфас
    p(c, 22, 4 + dy, 20, 16, B1);
    p(c, 23, 3 + dy, 18, 2, B2);
    p(c, 20, 0 + dy, 6, 6, B1); p(c, 38, 0 + dy, 6, 6, B1);
    p(c, 21, 1 + dy, 2, 3, B3); p(c, 41, 1 + dy, 2, 3, B3);
    // светлая морда и нос
    p(c, 27, 13 + dy, 10, 8, MUZ);
    p(c, 30, 14 + dy, 4, 3, '#100c08');
    // глаза
    p(c, 25, 8 + dy, 3, 3, EYED);
    p(c, 36, 8 + dy, 3, 3, EYED);
    // лапы
    if (frame === 0) {
      p(c, 18, 33, 7, 6, B3); p(c, 39, 33, 7, 6, B3);
      p(c, 25, 33, 6, 6, B3); p(c, 33, 33, 6, 6, B3);
    } else {
      p(c, 19, 33, 7, 6, B3); p(c, 38, 33, 7, 6, B3);
      p(c, 26, 33, 6, 6, B3); p(c, 32, 33, 6, 6, B3);
    }
  }

  function bearDraw(c, w, h, frame, dir) {
    var d4 = (dir === undefined) ? 2 : ((dir | 0) & 2);
    if (d4 === 6) {
      c.save();
      c.translate(w, 0);
      c.scale(-1, 1);
      bearSide(c, frame);
      c.restore();
    } else if (d4 === 2) {
      bearSide(c, frame);
    } else if (d4 === 0) {
      bearUp(c, frame);
    } else {
      bearDown(c, frame);
    }
  }

  /** Стоящий на задних лапах медведь (угроза!), 48x72, 2 кадра покачивания. */
  function bearRearDraw(c, w, h, frame) {
    var sway = frame === 1 ? 2 : 0;
    // задние лапы
    p(c, 13, 52, 9, 18, B3);
    p(c, 26, 52, 9, 18, B3);
    p(c, 13, 68, 9, 2, B1);
    p(c, 26, 68, 9, 2, B1);
    // мощный корпус
    p(c, 8 + sway, 20, 32, 34, B1);
    p(c, 10 + sway, 19, 28, 3, B2);
    p(c, 16 + sway, 26, 16, 22, MUZ);   // светлая грудь
    // передние лапы свисают, с когтями
    p(c, 1, 24 + sway, 7, 24, B1);
    p(c, 40, 24 - sway, 7, 24, B1);
    p(c, 1, 24 + sway, 7, 3, B2);
    p(c, 40, 24 - sway, 7, 3, B2);
    p(c, 2, 47 + sway, 5, 2, CLW);
    p(c, 41, 47 - sway, 5, 2, CLW);
    // голова
    p(c, 13 + sway, 3, 22, 17, B1);
    p(c, 14 + sway, 2, 20, 2, B2);
    p(c, 10 + sway, 0, 6, 6, B1); p(c, 32 + sway, 0, 6, 6, B1);
    p(c, 11 + sway, 1, 2, 3, B3); p(c, 35 + sway, 1, 2, 3, B3);
    // светлая морда, нос, пасть
    p(c, 18 + sway, 13, 12, 7, MUZ);
    p(c, 22 + sway, 14, 4, 3, '#100c08');
    p(c, 19 + sway, 18, 10, 1, '#2a1c12');
    // злые глаза
    p(c, 16 + sway, 8, 3, 3, EYED);
    p(c, 29 + sway, 8, 3, 3, EYED);
  }

  /**
   * Глаза зверя: янтарные точки ночью, КРАСНЫЕ — в ярости
   * (рисуется поверх спрайта, Gfx вызывает e.render).
   */
  function makeBearRender(e) {
    return function (ctx, sx, sy, zoom) {
      try {
        var enraged = e.enraged;
        if (!enraged && !(AI && AI.isNight && AI.isNight())) return;
        var d4 = (e.dir || 0) & 2;
        var hx = 0, hy = -12, both = false;
        if (d4 === 2) { hx = 12; hy = -12; }
        else if (d4 === 6) { hx = -12; hy = -12; }
        else if (d4 === 4) { hx = 0; hy = -16; both = true; }
        else { return; }   // со спины глаз не видно
        var col = enraged ? 'rgba(255,70,50,0.9)' : 'rgba(255,215,94,0.55)';
        var s = Math.max(1.5, (enraged ? 3.2 : 2.2) * zoom);
        var cxp = sx + hx * zoom;
        var cyp = sy + hy * zoom;
        if (enraged && ctx.createRadialGradient) {
          var g = ctx.createRadialGradient(cxp, cyp, 0, cxp, cyp, s * 3);
          g.addColorStop(0, 'rgba(255,60,40,0.5)');
          g.addColorStop(1, 'rgba(255,60,40,0)');
          ctx.fillStyle = g;
          ctx.fillRect(cxp - s * 3, cyp - s * 3, s * 6, s * 6);
        }
        ctx.fillStyle = col;
        if (both) {
          ctx.fillRect(cxp - s * 1.8, cyp - s / 2, s, s);
          ctx.fillRect(cxp + s * 1.0, cyp - s / 2, s, s);
        } else {
          ctx.fillRect(cxp - s / 2, cyp - s / 2, s, s);
        }
      } catch (err) { /* не роняем кадр */ }
    };
  }

  // ================================================================ создание

  function mkBear(R, x, y) {
    var e = WS.World.addEnt({
      kind: 'bear',
      x: x, y: y,
      dir: R.int(0, 7),
      hp: BEAR_HP, maxHp: BEAR_HP,
      speed: BEAR_SPEED,
      dmg: BEAR_DMG,
      atkSpd: BEAR_ATKSPD,
      sprName: 'bear',
      sprFrame: 0,
      animFrames: 2,
      shadowR: 0.9,
      scale: 1,
      state: 'wander', stateT: 0,
      atkCd: 0, lungeT: 0,
      sight: SIGHT,
      brain: { hears: true, noInside: true },
      home: { x: x, y: y, r: 20 },
      roamPt: null,
      roamT: 0,
      rearDone: false,       // уже вставал при этой встрече
      enraged: false,
      retreatDone: false,    // шанс ухода на 50% hp уже использован
      lastSeen: null,
      loseT: 0,
      stepT: 0,
      eatPt: null,
      eatT: 0,
      restT: 0
    });
    // реакция на урон (ярость/уход) — методом, damageEntity вызовет
    e.onDamaged = function (dmg, by) { onBearDamaged.call(e, dmg, by); };
    e.render = makeBearRender(e);
    bears.push(e);
    return e;
  }

  /** 1–2 медведя в глубине леса, максимально далеко от посёлка. */
  function spawnAll() {
    var G = WS.G;
    if (!G) return;
    var R = WS.RNG.mk((G.seed ^ 0xB3A2) >>> 0);
    var n = R.int(1, 2);
    for (var i = 0; i < n; i++) {
      var spot = AI.findSpot(R, {
        y0: 6, y1: 68,            // глухой лес
        minVillageD: 55,
        needTree: true,
        tries: 120
      });
      if (!spot) continue;
      mkBear(R, spot.x, spot.y);
    }
    WS.log('[AI] медведей-шатунов:', bears.length);
  }

  // ================================================================ поведение

  /** Тяжёлая поступь: слышно и видно снег, когда зверь близко. */
  function bearSteps(e, dt) {
    if (!e.moving) return;
    var pl = AI.player();
    if (!pl) return;
    var d = WS.M.dist(e.x, e.y, pl.x, pl.y);
    if (d > 16) return;   // дальше не слышно
    e.stepT = (e.stepT || 0) + dt;
    if (e.stepT < 0.45) return;
    e.stepT = 0;
    AI.snd('snow_step_deep', e.x, e.y, 0.9);
    if (WS.Fx && WS.Fx.spawn && d < 10) {
      WS.Fx.spawn('snow', e.x + (Math.random() - 0.5), e.y + (Math.random() - 0.5),
        { z: 2, life: 0.5, size: 4 });
    }
    if (d < 6 && WS.Cam && WS.Cam.kick) WS.Cam.kick(1.2);   // земля дрожит
  }

  /** Труп рядом? (шатун не брезгует падалью). */
  function corpseNear(x, y, r) {
    var w = WS.World;
    if (!w || !w.objects) return null;
    var best = null, bd = r;
    for (var i = 0; i < w.objects.length; i++) {
      var o = w.objects[i];
      if (!o) continue;
      var isCorpse = o.corpse ||
        (o.container && String(o.container).indexOf('corpse') >= 0);
      if (!isCorpse) continue;
      var d = WS.M.dist(o.x, o.y, x, y);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  /** Отброс игрока от источника удара (напрямую двигаем player.x/y). */
  function knockPlayer(src, tiles) {
    var pl = AI.player();
    if (!pl) return;
    var a = WS.M.ang(src.x, src.y, pl.x, pl.y);
    for (var d = 0.5; d <= tiles; d += 0.5) {
      var nx = pl.x + Math.cos(a) * 0.5;
      var ny = pl.y + Math.sin(a) * 0.5;
      if (AI.passable(nx, ny, null)) { pl.x = nx; pl.y = ny; }
      else break;   // упёрся в стену/дерево
    }
    if (WS.Fx && WS.Fx.spawn) {
      WS.Fx.spawn('snow', pl.x, pl.y, { z: 4, life: 0.5 });
    }
  }

  /** Мощный удар лапой. */
  function swipe(e) {
    var pl = AI.player();
    e.atkCd = 1 / (e.atkSpd || BEAR_ATKSPD);
    AI.damagePlayer(e.dmg, 'claw', e);
    knockPlayer(e, KNOCK);
    if (WS.Cam && WS.Cam.kick) WS.Cam.kick(8);
    AI.snd('hit_flesh', e.x, e.y, 0.9);
    if (Math.random() < FRACTURE_CHANCE) {
      // перелом: пусть системы здоровья применят (или выставят флаг сами)
      try { WS.Ev.emit('player:fracture', { src: e, force: true }); }
      catch (err) { WS.err('player:fracture', err); }
      if (WS.G && WS.G.player && WS.G.player.fracture !== undefined) {
        WS.G.player.fracture = true;   // страховка, если системы нет
      }
    }
    if (pl && WS.Fx && WS.Fx.text) {
      WS.Fx.text('ХРУСЬ!', pl.x, pl.y - 1, { life: 1.1, col: '#e2924a', size: 16 });
    }
  }

  /** Встать на задние лапы: рык, тряска камеры, смена спрайта. */
  function rearUp(e) {
    e.state = 'rear';
    e.stateT = 0;
    e.sprName = 'bear_rear';
    e.sprFrame = 0;
    AI.snd('bear_roar', e.x, e.y, 1);
    if (WS.Cam && WS.Cam.kick) WS.Cam.kick(6);
    var pl = AI.player();
    if (pl && WS.M.dist(e.x, e.y, pl.x, pl.y) < 20 && WS.Fx && WS.Fx.text) {
      WS.Fx.text('МЕДВЕДЬ-ШАТУН!', pl.x, pl.y - 1.4, { life: 1.6, col: '#d94f4f', size: 18 });
    }
  }

  function updateBear(e, dt, R) {
    var pl = AI.player();
    var night = AI.isNight();
    e.moving = false;
    var spd = e.speed * (e.enraged ? 1.18 : 1);

    // в состоянии «на лапах» — тикаем покачивание и ждём атаки
    if (e.state === 'rear') {
      e.sprFrame = Math.floor(AI.now() * 2) % 2;
      if (e.stateT >= REAR_TIME) {
        e.state = 'attack';
        e.stateT = 0;
        e.sprName = 'bear';
      }
      return;
    }

    // --- отступление (ранен, но не озверел)
    if (e.state === 'retreat') {
      var away = e.retreatTo || e.home;
      AI.moveTowards(e, away.x, away.y, spd, dt);
      AI.anim(e, dt, 5);
      // передумал: бьют в спину или игрок вплотную — ярость
      var dP0 = pl ? WS.M.dist(e.x, e.y, pl.x, pl.y) : 99;
      if (e.hp < e.retreatHp - 15 || dP0 < 5) enrage(e);
      if (WS.M.dist(e.x, e.y, away.x, away.y) < 3) {
        e.state = 'wander';
        e.retreatDone = false;
      }
      return;
    }

    // --- атака
    if (e.state === 'attack') {
      if (!pl || pl.hp <= 0) { e.state = 'wander'; return; }
      var dP = WS.M.dist(e.x, e.y, pl.x, pl.y);
      var sees = AI.canSee(e, pl, SIGHT);
      // игрок спрятался в доме — зверь не достанет, теряет интерес
      var inside = WS.World.isInside(pl.x, pl.y);
      if (inside && e.stateT > 8) {
        e.state = 'investigate';
        e.rearDone = false;   // новая встреча — снова встанет на лапы
        e.lastSeen = { x: pl.x, y: pl.y };
        e.loseT = LOSE_TIME;
        return;
      }
      if (sees) { e.lastSeen = { x: pl.x, y: pl.y }; e.loseT = 0; }
      else {
        e.loseT += dt;
        if (e.loseT > LOSE_TIME) {
          // потерял — идёт к последнему месту, нюхает
          e.state = 'investigate';
          e.rearDone = false;
          return;
        }
      }
      var tgt2 = e.lastSeen || pl;
      AI.moveTowards(e, tgt2.x, tgt2.y, spd, dt);
      if (dP < 1.6 && e.atkCd <= 0 && sees) swipe(e);
      if (R.f() < dt * 0.05) AI.snd('growl', e.x, e.y, 0.7);
      AI.anim(e, dt, 6);
      return;
    }

    // --- отдых: наелся или отлеживается после ночи
    if (e.state === 'rest') {
      e.restT -= dt;
      e.moving = false;
      e.sprFrame = 0;
      e.hp = Math.min(e.maxHp, e.hp + dt * 2);   // зализывает раны
      // разбудить может только появление игрока
      if (pl && pl.hp > 0 && AI.canSee(e, pl, SIGHT)) {
        e.rearDone = false;
        checkRear(e);
      }
      if (e.restT <= 0) { e.state = 'wander'; e.stateT = 0; }
      return;
    }

    // --- ест найденную падаль
    if (e.state === 'eat') {
      var c = e.eatPt;
      if (!c || c.removed) { e.state = 'wander'; e.eatPt = null; return; }
      var dE = WS.M.dist(e.x, e.y, c.x, c.y);
      if (dE > 1.4) {
        AI.moveTowards(e, c.x, c.y, spd * 0.6, dt);
        bearSteps(e, dt);
        AI.anim(e, dt, 3);
      } else {
        e.eatT += dt;
        e.moving = false;
        e.hp = Math.min(e.maxHp, e.hp + dt * 5);   // насыщается
        if (R.f() < dt * 0.5) AI.snd('eat', e.x, e.y, 0.5);
        if (e.eatT > 8) {
          // доел (объект помечен как труп — можно съесть)
          e.eatT = 0;
          if (c.corpse === true) {
            try { WS.World.removeObject(c); } catch (err) { /* пусто */ }
          }
          e.eatPt = null;
          // после еды заваливается спать
          e.state = 'rest';
          e.restT = 25 + R.f() * 15;
        }
      }
      // за трапезой может заметить игрока
      if (pl && pl.hp > 0 && AI.canSee(e, pl, SIGHT)) { e.rearDone = false; checkRear(e); }
      return;
    }

    // --- проверка точки (шум/запах/последнее место)
    if (e.state === 'investigate') {
      var pt = e.lastSeen;
      if (!pt && e.alertTo) pt = { x: e.alertTo.x, y: e.alertTo.y };
      if (!pt) {
        var sm = AI.smell.nearest(e.x, e.y, SMELL_R);
        if (sm) pt = { x: sm.x, y: sm.y };
      }
      if (!pt) { e.state = 'wander'; return; }
      var dPt = WS.M.dist(e.x, e.y, pt.x, pt.y);
      if (dPt > 2) {
        AI.moveTowards(e, pt.x, pt.y, spd * 0.8, dt);
        bearSteps(e, dt);
        AI.anim(e, dt, 5);
      } else {
        // обнюхал — постоял и ушёл
        e.sniffT = (e.sniffT || 0) + dt;
        if (e.sniffT > 5) {
          e.sniffT = 0;
          e.lastSeen = null;
          e.alertTo = null;
          e.state = 'wander';
          e.rearDone = false;
        }
      }
      // по пути может заметить игрока
      if (pl && AI.canSee(e, pl, SIGHT)) { e.rearDone = false; checkRear(e); }
      return;
    }

    // --- блуждание (обычное состояние)
    // услышал шум поблизости — идёт проверить (шатун любопытен и голоден)
    if (e.alertTo && AI.now() - e.alertTo.t < 12) {
      var dN = WS.M.dist(e.x, e.y, e.alertTo.x, e.alertTo.y);
      if (dN < NOISE_R && dN > 2) {
        e.state = 'investigate';
        return;
      }
    }
    // чует кровь
    var sm2 = AI.smell.nearest(e.x, e.y, SMELL_R * (night ? 1.3 : 1));
    if (sm2) {
      e.lastSeen = { x: sm2.x, y: sm2.y };
      e.state = 'investigate';
      return;
    }
    // увидел игрока — встаёт на лапы и нападает
    if (pl && pl.hp > 0 && AI.canSee(e, pl, SIGHT)) {
      checkRear(e);
      return;
    }
    // почуял падаль — идёт кормиться (шатун всегда голоден)
    var carr = corpseNear(e.x, e.y, 22);
    if (carr) {
      e.state = 'eat';
      e.eatPt = carr;
      e.eatT = 0;
      return;
    }

    // смена района: шатается и в посёлок (30% целей — окраина)
    e.roamT -= dt;
    if (!e.roamPt || e.roamT <= 0 || WS.M.dist(e.x, e.y, e.roamPt.x, e.roamPt.y) < 2) {
      e.roamT = ROAM_EVERY + R.f() * 30;
      if (R.chance(0.3)) {
        // окраина посёлка: шатун лезет к людям
        e.roamPt = {
          x: 60 + R.f() * 100,
          y: AI.consts.VILLAGE_Y0 + R.f() * 10
        };
      } else {
        var a = R.f() * Math.PI * 2;
        var rr = R.f() * 18;
        e.roamPt = {
          x: WS.M.clamp(e.home.x + Math.cos(a) * rr, 3, 216),
          y: WS.M.clamp(e.home.y + Math.sin(a) * rr, 3, 216)
        };
      }
    }
    var dRoam = WS.M.dist(e.x, e.y, e.roamPt.x, e.roamPt.y);
    if (dRoam > 2.5) {
      AI.moveTowards(e, e.roamPt.x, e.roamPt.y, spd * 0.45, dt);
      bearSteps(e, dt);
      AI.anim(e, dt, 3);
    } else {
      AI.wanderInArea(e, e.roamPt.x, e.roamPt.y, 6, dt, spd * 0.3);
      AI.anim(e, dt, 2);
    }
    // спокойный медведь потихоньу заживает раны
    if (e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + dt * 0.5);
  }

  /** Первая встреча за погоню — встаёт на лапы; дальше сразу в атаку. */
  function checkRear(e) {
    if (!e.rearDone) {
      e.rearDone = true;
      rearUp(e);
    } else {
      e.state = 'attack';
      e.stateT = 0;
      e.lastSeen = AI.player() ? { x: AI.player().x, y: AI.player().y } : null;
    }
  }

  /** Ярость: скорость и урон растут. */
  function enrage(e) {
    if (e.enraged) return;
    e.enraged = true;
    e.dmg = Math.round(e.dmg * 1.25);
    e.atkSpd = BEAR_ATKSPD * 1.25;
    e.state = 'attack';
    e.stateT = 0;
    AI.snd('bear_roar', e.x, e.y, 1);
    if (WS.Cam && WS.Cam.kick) WS.Cam.kick(6);
    var pl = AI.player();
    if (pl && WS.Fx && WS.Fx.text && WS.M.dist(e.x, e.y, pl.x, pl.y) < 20) {
      WS.Fx.text('Шатун в ярости!', pl.x, pl.y - 1.4, { life: 1.5, col: '#d94f4f', size: 16 });
    }
  }

  /** Рассвет: побитый ночью зверь заваливается отлёживаться. */
  function onDayDawn() {
    for (var i = 0; i < bears.length; i++) {
      var e = bears[i];
      if (e.dead || e.state === 'attack' || e.state === 'rear') continue;
      if (e.hp < e.maxHp * 0.8 && Math.random() < 0.6) {
        e.state = 'rest';
        e.restT = 30 + Math.random() * 20;
      }
    }
  }

  /** Реакция на урон: ярость или (на 50% hp, один раз) попытка уйти. */
  function onBearDamaged(dmg, by) {
    var e = this;
    if (e.state === 'retreat') { enrage(e); return; }
    if (!e.retreatDone && e.hp <= e.maxHp * 0.5) {
      e.retreatDone = true;
      if (Math.random() < 0.3) {
        // сытость перевесила злобу: уходит в чащу
        e.state = 'retreat';
        e.stateT = 0;
        e.retreatHp = e.hp;
        e.retreatTo = e.home;
        e.sprName = 'bear';
        AI.snd('growl', e.x, e.y, 0.8);
        return;
      }
    }
    if (e.hp <= e.maxHp * 0.2) { enrage(e); return; }
    if (e.state !== 'attack' && e.state !== 'rear') checkRear(e);
  }

  // ================================================================ события

  function onEntKill(d) {
    if (!d || !d.ent || d.ent.kind !== 'bear') return;
    var i = bears.indexOf(d.ent);
    if (i >= 0) bears.splice(i, 1);
  }

  function onEntRemove(d) {
    if (!d || !d.ent || d.ent.kind !== 'bear') return;
    var i = bears.indexOf(d.ent);
    if (i >= 0) bears.splice(i, 1);
  }

  // ================================================================ API модуля

  WS.def('Bear', {
    spawnAll: spawnAll,
    reset: function () { bears = []; },
    bears: function () { return bears; },
    count: function () { return bears.length; },
    /** Отладка/сюжет: разъярить ближайшего к игроку медведя. */
    enrageNearest: function () {
      var pl = AI.player();
      if (!pl || !bears.length) return false;
      var best = null, bd = 1e9;
      for (var i = 0; i < bears.length; i++) {
        var d = WS.M.dist(bears[i].x, bears[i].y, pl.x, pl.y);
        if (d < bd) { bd = d; best = bears[i]; }
      }
      if (best) { enrage(best); return true; }
      return false;
    }
  });

  // ================================================================ загрузка

  WS.boot(function initBearAI() {
    AI = WS.AI;

    // спрайты: ходячий (4 стороны x 2 кадра) и стоящий (2 кадра покачивания)
    WS.Spr.def('bear', { w: 64, h: 40, draw: bearDraw });
    WS.Spr.def('bear_rear', { w: 48, h: 72, draw: function (c, w, h, frame) {
      bearRearDraw(c, w, h, frame);
    }});

    AI.register('bear', updateBear);

    WS.Ev.on('ent:kill', onEntKill);
    WS.Ev.on('ent:remove', onEntRemove);
  }, 'ai:bear:init');
})();
