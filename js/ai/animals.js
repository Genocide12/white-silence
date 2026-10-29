/**
 * A4 — дичь тайги: олени (стадами, мясной ресурс), зайцы (петляют),
 * вороны (амбиент, кружат над трупами — живой маркер лута для игрока).
 * Плюс подсистема следов: бегущие звери оставляют объекты 'footprint',
 * если такой спрайт определит другой модуль (не обязательно).
 * Убийство: WS.AI.kill -> WS.Loot.makeCorpse('deer'|'hare') от B-агента.
 */
(function () {
  'use strict';

  var AI = null;   // WS.AI (алиас в boot)

  // ================================================================ настройки

  var DEER_HP = 60, DEER_SPEED = 3.2;
  var DEER_SENSE = 8;        // чует игрока днём (ночью 5)
  var DEER_FLEE = 20;        // дистанция бегства стада
  var HARE_HP = 8, HARE_SPEED = 3.8;
  var HARE_SENSE = 4.5;      // бужу зайца совсем близко
  var CROW_HP = 2;
  var PREDATORS = { wolf: 1, bear: 1 };   // кого боятся копытные

  // пиксельные цвета (палитра проекта)
  var D1 = '#96714f', D2 = '#a8865f', D3 = '#7a5a3e';
  var RUMP = '#d8cfc0', ANTL = '#6b5138';
  var H1 = '#e2e6ec', H2 = '#c8ccd2', HEAR = '#2c241c';
  var CB = '#1c1e24', CB2 = '#2b2e38', BEAK = '#d8a44a';

  var herds = [];    // оленьи стада
  var crows = [];    // вороны (для отладки)

  // ================================================================ спрайты

  function p(c, x, y, w, h, col) {
    c.fillStyle = col;
    c.fillRect(x, y, w, h);
  }

  /** Олень в профиль (вправо), 48x40. Кадры 0/1 бег, 2 — пасётся (голова вниз). */
  function deerSide(c, frame) {
    if (frame === 2) {
      // пасётся: шея опущена к земле
      p(c, 10, 14, 26, 10, D1);
      p(c, 11, 13, 24, 2, D2);
      p(c, 8, 12, 6, 6, RUMP);            // белое «зеркало» на крупе
      p(c, 30, 22, 8, 3, D1);            // опущенная шея
      p(c, 36, 24, 9, 6, D1);            // голова у земли
      p(c, 42, 27, 4, 3, D3);
      p(c, 38, 22, 2, 3, D3);            // ухо
      p(c, 34, 24, 2, 2, '#2c241c');     // глаз
      p(c, 40, 20, 2, 6, D2);            // передняя нога
      p(c, 12, 23, 2, 6, D3);
      p(c, 16, 23, 2, 5, D3);
      p(c, 36, 29, 2, 5, D3);
      p(c, 12, 29, 2, 5, D3);
      return;
    }
    var dy = frame === 1 ? 1 : 0;
    // корпус
    p(c, 10, 13 + dy, 27, 10, D1);
    p(c, 11, 12 + dy, 25, 2, D2);
    p(c, 10, 21 + dy, 26, 2, D3);
    p(c, 7, 11 + dy, 6, 6, RUMP);
    p(c, 8, 15 + dy, 2, 4, D3);          // хвостик
    // шея вверх и голова
    p(c, 33, 5 + dy, 5, 11, D1);
    p(c, 34, 4 + dy, 4, 2, D2);
    p(c, 36, 1 + dy, 9, 6, D1);
    p(c, 44, 3 + dy, 4, 4, D3);          // морда
    p(c, 38, 2 + dy, 2, 3, D3);         // ухо
    p(c, 39, 3 + dy, 2, 2, '#2c241c');  // глаз
    // рога самца-вилка
    p(c, 35, 0 + dy, 2, 4, ANTL);
    p(c, 33, 0 + dy, 2, 3, ANTL);
    p(c, 39, 0 + dy, 2, 3, ANTL);
    p(c, 41, 0 + dy, 2, 2, ANTL);
    // ноги — длинные, тонкие
    if (frame === 0) {
      p(c, 12, 23 + dy, 2, 14, D3); p(c, 17, 23 + dy, 2, 13, D3);
      p(c, 31, 23 + dy, 2, 14, D3); p(c, 35, 23 + dy, 2, 13, D3);
    } else {
      p(c, 14, 23 + dy, 2, 13, D3); p(c, 19, 23 + dy, 2, 14, D3);
      p(c, 29, 23 + dy, 2, 13, D3); p(c, 33, 23 + dy, 2, 14, D3);
    }
  }

  /** Олень со спины (на север). */
  function deerUp(c, frame) {
    var dy = frame === 1 ? 1 : 0;
    p(c, 12, 14 + dy, 24, 10, D1);
    p(c, 13, 13 + dy, 22, 2, D2);
    p(c, 12, 12 + dy, 10, 7, RUMP);      // круп к зрителю
    p(c, 20, 6 + dy, 8, 8, D1);          // голова (видна затылок)
    p(c, 21, 4 + dy, 2, 3, D3); p(c, 25, 4 + dy, 2, 3, D3);
    p(c, 20, 1 + dy, 2, 5, ANTL); p(c, 26, 1 + dy, 2, 5, ANTL);
    p(c, 18, 3 + dy, 2, 3, ANTL); p(c, 28, 3 + dy, 2, 3, ANTL);
    if (frame === 0) {
      p(c, 13, 24, 2, 13, D3); p(c, 33, 24, 2, 13, D3);
      p(c, 17, 24, 2, 12, D3); p(c, 29, 24, 2, 12, D3);
    } else {
      p(c, 14, 24, 2, 12, D3); p(c, 32, 24, 2, 12, D3);
      p(c, 18, 24, 2, 13, D3); p(c, 28, 24, 2, 13, D3);
    }
  }

  /** Олень анфас (на юг). */
  function deerDown(c, frame) {
    var dy = frame === 1 ? 1 : 0;
    p(c, 12, 15 + dy, 24, 10, D1);
    p(c, 13, 14 + dy, 22, 2, D2);
    p(c, 18, 6 + dy, 12, 10, D1);        // грудь
    p(c, 19, 2 + dy, 10, 7, D1);         // голова анфас
    p(c, 21, 5 + dy, 2, 2, '#2c241c'); p(c, 25, 5 + dy, 2, 2, '#2c241c');
    p(c, 22, 8 + dy, 5, 3, D3);          // морда
    p(c, 18, 0 + dy, 2, 5, ANTL); p(c, 28, 0 + dy, 2, 5, ANTL);
    p(c, 16, 2 + dy, 2, 3, ANTL); p(c, 30, 2 + dy, 2, 3, ANTL);
    if (frame === 0) {
      p(c, 13, 25, 2, 13, D3); p(c, 33, 25, 2, 13, D3);
      p(c, 18, 25, 2, 12, D3); p(c, 29, 25, 2, 12, D3);
    } else {
      p(c, 14, 25, 2, 12, D3); p(c, 32, 25, 2, 12, D3);
      p(c, 19, 25, 2, 13, D3); p(c, 28, 25, 2, 13, D3);
    }
  }

  function deerDraw(c, w, h, frame, dir) {
    var d4 = (dir === undefined) ? 2 : ((dir | 0) & 2);
    if (d4 === 6) {
      c.save();
      c.translate(w, 0);
      c.scale(-1, 1);
      deerSide(c, frame);
      c.restore();
    } else if (d4 === 2) {
      deerSide(c, frame);
    } else if (d4 === 0) {
      deerUp(c, frame === 2 ? 0 : frame);
    } else {
      deerDown(c, frame === 2 ? 0 : frame);
    }
  }

  /** Заяц-беляк, 24x16. Кадры 0/1 бег, 2 — сидит. */
  function hareSide(c, frame) {
    if (frame === 2) {
      // сидит комком
      p(c, 5, 8, 13, 7, H1);
      p(c, 6, 7, 11, 2, H2);
      p(c, 13, 4, 7, 6, H1);            // голова
      p(c, 14, 5, 2, 2, HEAR);          // глаз
      p(c, 13, 0, 2, 5, H1); p(c, 17, 0, 2, 5, H1);   // уши
      p(c, 13, 0, 2, 2, HEAR); p(c, 17, 0, 2, 2, HEAR);
      p(c, 5, 13, 2, 2, H2);            // лапки
      p(c, 16, 13, 2, 2, H2);
      return;
    }
    // бег: тело вытянуто, уши прижаты назад
    var stretch = frame === 0 ? 2 : 0;
    p(c, 3, 7 + (frame === 1 ? 1 : 0), 15 + stretch, 5, H1);
    p(c, 4, 6 + (frame === 1 ? 1 : 0), 12 + stretch, 2, H2);
    p(c, 14, 4, 7, 6, H1);              // голова вперёд
    p(c, 15, 5, 2, 2, HEAR);
    p(c, 20, 6, 3, 2, H1);              // нос
    p(c, 6, 1, 8, 3, H1);               // уши назад
    p(c, 6, 1, 3, 2, H2);
    if (frame === 0) {
      p(c, 4, 12, 4, 3, H2); p(c, 15, 12, 4, 3, H2);   // лапы вперёд/назад
    } else {
      p(c, 8, 12, 4, 3, H2); p(c, 12, 12, 4, 3, H2);
    }
    p(c, 1, 8, 3, 2, H2);               // хвостик-помпон
  }

  function hareDraw(c, w, h, frame, dir) {
    var d4 = (dir === undefined) ? 2 : ((dir | 0) & 2);
    if (d4 === 6) {
      c.save();
      c.translate(w, 0);
      c.scale(-1, 1);
      hareSide(c, frame);
      c.restore();
    } else if (d4 === 2 || d4 === 0) {
      hareSide(c, frame);
    } else {
      // анфас: комок с ушами и глазами
      if (frame === 2) {
        p(c, 5, 8, 14, 7, H1);
        p(c, 6, 7, 12, 2, H2);
        p(c, 7, 3, 10, 6, H1);
        p(c, 8, 5, 2, 2, HEAR); p(c, 14, 5, 2, 2, HEAR);
        p(c, 8, 0, 2, 5, H1); p(c, 14, 0, 2, 5, H1);
        p(c, 5, 13, 3, 2, H2); p(c, 16, 13, 3, 2, H2);
      } else {
        p(c, 4, 7, 16, 5, H1);
        p(c, 5, 6, 14, 2, H2);
        p(c, 8, 2, 8, 6, H1);
        p(c, 9, 4, 2, 2, HEAR); p(c, 13, 4, 2, 2, HEAR);
        p(c, 9, 0, 2, 4, H1); p(c, 13, 0, 2, 4, H1);
      }
    }
  }

  /** Ворона, 24x16. Два кадра взмаха. */
  function crowDraw(c, w, h, frame) {
    // тело
    p(c, 8, 7, 8, 5, CB);
    p(c, 9, 6, 6, 2, CB2);
    // голова и клюв
    p(c, 14, 5, 5, 4, CB);
    p(c, 19, 6, 4, 2, BEAK);
    p(c, 16, 6, 1, 1, '#d8dce4');       // блик глаза
    // хвост
    p(c, 3, 8, 5, 2, CB2);
    if (frame === 0) {
      // крылья вверх
      p(c, 6, 1, 7, 3, CB2);
      p(c, 10, 0, 7, 3, CB2);
    } else {
      // крылья вниз
      p(c, 5, 9, 7, 3, CB2);
      p(c, 9, 10, 7, 3, CB2);
    }
    // лапки поджаты
    p(c, 10, 12, 2, 2, HEAR);
  }

  // ================================================================ олени

  function mkHerd(R, cx, cy) {
    var herd = {
      id: WS.World.newId('herd'),
      anchor: { x: cx, y: cy },
      members: [],
      state: 'graze',       // 'graze' | 'flee'
      fleePt: null,
      fleeT: 0,
      threat: null
    };
    var n = R.int(2, 4);
    for (var j = 0; j < n; j++) {
      mkDeer(R, herd, cx + R.range(-3, 3), cy + R.range(-2, 2));
    }
    herds.push(herd);
    return herd;
  }

  function mkDeer(R, herd, x, y) {
    var e = WS.World.addEnt({
      kind: 'deer',
      x: x, y: y,
      dir: R.int(0, 7),
      hp: DEER_HP, maxHp: DEER_HP,
      speed: DEER_SPEED,
      sprName: 'deer',
      sprFrame: 2,
      animFrames: 2,
      restFrame: 2,
      shadowR: 0.55,
      state: 'idle', stateT: 0,
      atkCd: 0, lungeT: 0,
      sight: DEER_SENSE,
      brain: { hears: true, noInside: true },
      herd: herd,
      zigPhase: R.f() * Math.PI * 2,
      grazeT: R.f() * 3
    });
    if (herd) herd.members.push(e);
    return e;
  }

  /** Хищник рядом? (волк, медведь). */
  function predatorNear(e, r) {
    var list = WS.World.entsNear(e.x, e.y, r);
    for (var i = 0; i < list.length; i++) {
      if (PREDATORS[list[i].kind]) return true;
    }
    return false;
  }

  /** Стадо снимается с места всей группой. */
  function herdScare(herd, threatX, threatY) {
    if (herd.state === 'flee') return;
    herd.state = 'flee';
    herd.fleeT = 0;
    var a = Math.atan2(herd.anchor.y - threatY, herd.anchor.x - threatX);
    herd.fleePt = {
      x: WS.M.clamp(herd.anchor.x + Math.cos(a) * DEER_FLEE, 4, 215),
      y: WS.M.clamp(herd.anchor.y + Math.sin(a) * DEER_FLEE * 0.8, 4, 215)
    };
    // каждый разбегается чуть в свою сторону
    for (var i = 0; i < herd.members.length; i++) {
      var m = herd.members[i];
      m.fleeTo = {
        x: WS.M.clamp(herd.fleePt.x + (Math.random() - 0.5) * 6, 4, 215),
        y: WS.M.clamp(herd.fleePt.y + (Math.random() - 0.5) * 5, 4, 215)
      };
    }
    AI.snd('snow_step_deep', herd.anchor.x, herd.anchor.y, 0.7);
  }

  function updateDeer(e, dt, R) {
    var p = AI.player();
    var herd = e.herd;
    var night = AI.isNight();
    e.moving = false;

    // испуг: игрок близко, хищник рядом, громкий шум рядом
    var senseR = night ? 5 : DEER_SENSE;
    if (p && WS.M.dist(e.x, e.y, p.x, p.y) < senseR && herd) {
      herdScare(herd, p.x, p.y);
    }
    if (herd && herd.state !== 'flee') {
      if (predatorNear(e, 10)) herdScare(herd, e.x - 1, e.y - 1);
      else if (e.alertTo && AI.now() - e.alertTo.t < 4 &&
               WS.M.dist(e.x, e.y, e.alertTo.x, e.alertTo.y) < 9) {
        herdScare(herd, e.alertTo.x, e.alertTo.y);
      }
    }

    if (herd && herd.state === 'flee' && e.fleeTo) {
      // бегство с зигзагами: направление к точке + синус поперёк
      var dx = e.fleeTo.x - e.x, dy = e.fleeTo.y - e.y;
      var d = Math.sqrt(dx * dx + dy * dy);
      herd.fleeT += dt;
      if (d < 2.5 || herd.fleeT > 14) {
        // отбежали — новая поляна
        herd.state = 'graze';
        herd.anchor = { x: e.fleeTo.x, y: e.fleeTo.y };
        e.fleeTo = null;
      } else {
        var ux = dx / d, uy = dy / d;
        var wob = Math.sin(AI.now() * 3.4 + e.zigPhase) * 0.85;
        var ca = Math.cos(wob), sa = Math.sin(wob);
        var vx = ux * ca - uy * sa, vy = ux * sa + uy * ca;
        AI.tryStep(e, vx, vy, DEER_SPEED, dt);
        e.state = 'flee';
        AI.anim(e, dt, 9);
      }
      return;
    }

    // выпас: стоит, голову то вверх то вниз, изредка шагает
    var anchor = (herd && herd.anchor) || { x: e.x, y: e.y };
    var wanderPt = e.wanderPt;
    if (wanderPt && WS.M.dist(e.x, e.y, wanderPt.x, wanderPt.y) < 0.7) {
      e.wanderPt = null;
      e.wanderWait = 2 + R.f() * 5;
    }
    if (!wanderPt) {
      e.wanderWait = (e.wanderWait || 0) - dt;
      if (e.wanderWait <= 0 && R.chance(dt * 0.25)) {
        var a = R.f() * Math.PI * 2;
        var rr = 1 + R.f() * 3;
        e.wanderPt = {
          x: anchor.x + Math.cos(a) * rr,
          y: anchor.y + Math.sin(a) * rr * 0.8
        };
      }
    } else {
      AI.moveTowards(e, wanderPt.x, wanderPt.y, 0.8, dt);
      AI.anim(e, dt, 3);
    }
    if (!e.moving) {
      // жуёт: кадр «голова вниз» чередуется с «голова вверх»
      e.grazeT += dt;
      e.sprFrame = (Math.floor(e.grazeT / 2.2) % 2) ? 2 : 0;
    }
    e.state = 'wander';
  }

  // ================================================================ зайцы

  function mkHare(R, x, y) {
    var e = WS.World.addEnt({
      kind: 'hare',
      x: x, y: y,
      dir: R.int(0, 7),
      hp: HARE_HP, maxHp: HARE_HP,
      speed: HARE_SPEED,
      sprName: 'hare',
      sprFrame: 2,
      animFrames: 2,
      restFrame: 2,
      shadowR: 0.25,
      state: 'sit', stateT: 0,
      atkCd: 0, lungeT: 0,
      sight: HARE_SENSE,
      brain: { hears: true, noInside: true },
      runLeft: 0, runA: 0, turnT: 0, zigPhase: R.f() * 6.28
    });
    return e;
  }

  function updateHare(e, dt, R) {
    var p = AI.player();
    e.moving = false;

    // слишком близко подошли — бужу зайца
    var dP = p ? WS.M.dist(e.x, e.y, p.x, p.y) : 9999;
    if (e.state === 'sit') {
      if (dP < HARE_SENSE || predatorNear(e, 6) ||
          (e.alertTo && AI.now() - e.alertTo.t < 3 &&
           WS.M.dist(e.x, e.y, e.alertTo.x, e.alertTo.y) < 6)) {
        e.state = 'run';
        e.stateT = 0;
        e.runLeft = 8 + R.f() * 6;
        e.runA = p ? Math.atan2(e.y - p.y, e.x - p.x) : R.f() * 6.28;
        e.turnT = 0;
        AI.snd('snow_step_deep', e.x, e.y, 0.5);
      } else {
        e.sprFrame = 2;   // сидит комком
        return;
      }
    }

    if (e.state === 'run') {
      // петляет: раз в 0.3–0.5 с крутит направление на ±60°
      e.turnT -= dt;
      if (e.turnT <= 0) {
        e.turnT = 0.3 + R.f() * 0.25;
        e.runA += (R.f() - 0.5) * 2.1;
      }
      var vx = Math.cos(e.runA), vy = Math.sin(e.runA);
      var moved = AI.tryStep(e, vx, vy, HARE_SPEED, dt);
      e.runLeft -= moved;
      AI.anim(e, dt, 10);
      if (e.runLeft <= 0 || moved <= 0) {
        // дальше нет сил/некуда — замер и сидит
        e.state = 'sit';
        e.stateT = 0;
        e.sprFrame = 2;
        e.alertTo = null;
      }
    }
  }

  // ================================================================ вороны

  function mkCrow(R, ax, ay) {
    var e = WS.World.addEnt({
      kind: 'crow',
      x: ax + R.range(-3, 3), y: ay + R.range(-3, 3),
      dir: 2,
      hp: CROW_HP, maxHp: CROW_HP,
      speed: 1.6,
      sprName: null,          // рисуется кастомным render (полёт)
      sprFrame: 0,
      animFrames: 2,
      shadowR: 0.16,
      shadow: true,
      state: 'fly', stateT: 0,
      atkCd: 0, lungeT: 0,
      brain: { hears: true },   // ворон не глух, но в дома не ходит: он летает
      zFly: 28 + R.f() * 12,
      anchor: { x: ax, y: ay },
      orbA: R.f() * 6.28,
      orbR: 2 + R.f() * 3,
      scanT: R.f() * 3
    });
    e.render = crowRender;
    crows.push(e);
    return e;
  }

  /** Полёт: спрайт со смещением e.zFly вверх (минус пиксели). */
  function crowRender(ctx, sx, sy, zoom) {
    try {
      var img = WS.Spr.get('crow', this.sprFrame || 0, 0);
      if (!img) return;
      var z = (this.zFly || 28) * zoom;
      var wob = Math.sin(AI.now() * 1.6 + this.orbA) * 2 * zoom;
      ctx.drawImage(img,
        sx - img.width * zoom / 2,
        sy - img.height * zoom - z + wob,
        img.width * zoom, img.height * zoom);
    } catch (err) { /* ворона не должна ронять кадр */ }
  }

  /** Есть ли в мире труп (маркер лута)? */
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

  function updateCrow(e, dt, R) {
    var p = AI.player();
    e.moving = false;

    // высота полёта: покачивание 20..40 px
    e.zFly = 28 + Math.sin(AI.now() * 1.3 + e.orbA) * 10;
    // взмахи крыльев
    e._animT = (e._animT || 0) + dt * 6;
    e.sprFrame = Math.floor(e._animT) % 2;

    // игрок вплотную — перелетает на 10–15 тайлов
    if (p && WS.M.dist(e.x, e.y, p.x, p.y) < 4) {
      flyOff(e, p.x, p.y, 10 + R.f() * 5, R);
      return;
    }
    // резкий шум — вспорхнула
    if (e.alertTo && AI.now() - e.alertTo.t < 2 &&
        WS.M.dist(e.x, e.y, e.alertTo.x, e.alertTo.y) < 10) {
      flyOff(e, e.alertTo.x, e.alertTo.y, 12 + R.f() * 4, R);
      e.alertTo = null;
      return;
    }
    // раз в ~3 с осматривается: трупы притягивают воронью стайку
    e.scanT -= dt;
    if (e.scanT <= 0) {
      e.scanT = 3 + R.f() * 2;
      var corpse = corpseNear(e.anchor.x, e.anchor.y, 30);
      if (corpse && R.chance(0.75)) {
        e.anchor = { x: corpse.x + R.range(-1.5, 1.5), y: corpse.y + R.range(-1.5, 1.5) };
        e.orbR = 1.5 + R.f() * 1.5;   // кружит ниже и ближе
        if (R.chance(0.4)) AI.snd('crow', e.x, e.y, 0.6);
      } else {
        e.orbR = 2 + R.f() * 3;
      }
    }

    // кружение над точкой
    e.orbA += dt * 0.55;
    var tx = e.anchor.x + Math.cos(e.orbA) * e.orbR;
    var ty = e.anchor.y + Math.sin(e.orbA) * e.orbR * 0.8;
    var dx = tx - e.x, dy = ty - e.y;
    var d = Math.sqrt(dx * dx + dy * dy);
    if (d > 0.05) {
      // ворона летает — рельеф не важен
      var step = Math.min(d, e.speed * dt);
      e.x += dx / d * step;
      e.y += dy / d * step;
      e.moving = true;
      AI.setDir(e, dx, dy);
    }
    // карканье изредка, если игрок рядом
    if (p && WS.M.dist(e.x, e.y, p.x, p.y) < 12 && R.chance(dt * 0.02)) {
      AI.snd('crow', e.x, e.y, 0.5);
    }
  }

  /** Вспорхнуть: новая точка в стороне от угрозы. */
  function flyOff(e, dangerX, dangerY, dist, R) {
    var a = Math.atan2(e.y - dangerY, e.x - dangerX) + (R.f() - 0.5) * 1.2;
    e.anchor = {
      x: WS.M.clamp(e.x + Math.cos(a) * dist, 4, 215),
      y: WS.M.clamp(e.y + Math.sin(a) * dist * 0.8, 4, 215)
    };
    e.orbA = R.f() * 6.28;
    if (R.chance(0.6)) AI.snd('crow', e.x, e.y, 0.7);
  }

  // ================================================================ следы

  var TRACK_KINDS = { deer: 1, hare: 1, wolf: 1, bear: 1, bandit: 1 };
  var tracks = [];         // {o, t}
  var TRACK_LIFE = 90;     // секунд
  var TRACK_CAP = 80;       // максимум объектов следов

  function hasFootprintSpr() {
    try {
      var sp = WS.Spr.specs();
      return !!(sp && sp.footprint);
    } catch (e) { return false; }
  }

  /** Следы: бегущие звери продавливают снег (если есть спрайт 'footprint'). */
  function tracksTick(dt) {
    var G = WS.G;
    if (!G || !G.running || G.dead) return;
    var w = WS.World;
    if (!w || !w.ents) return;

    if (hasFootprintSpr()) {
      var list = w.ents.slice();
      for (var i = 0; i < list.length; i++) {
        var e = list[i];
        if (!e || e.dead || !e.moving) continue;
        if (!TRACK_KINDS[e.kind]) continue;
        e._trackT = (e._trackT || 0) + dt;
        if (e._trackT < 0.9) continue;
        e._trackT = 0;
        try {
          var o = w.addObject({
            x: e.x, y: e.y,
            sprName: 'footprint',
            dir: e.dir,
            solid: false,
            z: -0.5
          });
          tracks.push({ o: o, t: AI.now() });
          if (tracks.length > TRACK_CAP) {
            var old = tracks.shift();
            if (old && old.o && !old.o.removed) w.removeObject(old.o);
          }
        } catch (err) { /* следы — косметика */ }
      }
    }
    // старение
    for (var k = tracks.length - 1; k >= 0; k--) {
      if (AI.now() - tracks[k].t > TRACK_LIFE) {
        try {
          if (tracks[k].o && !tracks[k].o.removed) w.removeObject(tracks[k].o);
        } catch (err2) { /* пусто */ }
        tracks.splice(k, 1);
      }
    }
  }

  // ================================================================ спавн

  function spawnAll() {
    var G = WS.G;
    if (!G) return;
    var R = WS.RNG.mk((G.seed ^ 0x0D22) >>> 0);
    var w = WS.World;

    // оленьи стада: опушки леса (y 50..100)
    var herdsN = R.int(4, 6);
    for (var i = 0; i < herdsN; i++) {
      var spot = AI.findSpot(R, {
        y0: 30, y1: 105,
        minVillageD: 14,
        tiles: [w.T.GRASS, w.T.GRASS2],
        tries: 80
      });
      if (!spot) continue;
      mkHerd(R, spot.x, spot.y);
    }

    // зайцы: везде по снегу и траве
    var haresN = R.int(8, 12);
    for (var j = 0; j < haresN; j++) {
      var spot2 = AI.findSpot(R, {
        y0: 15, y1: 140,
        tiles: [w.T.GRASS, w.T.GRASS2, w.T.SNOW, w.T.DIRT],
        tries: 60
      });
      if (!spot2) continue;
      mkHare(R, spot2.x, spot2.y);
    }

    // вороны: над посёлком и лесом
    var crowsN = R.int(7, 10);
    for (var k = 0; k < crowsN; k++) {
      var ax, ay;
      if (R.chance(0.55)) {
        ax = R.range(80, 140); ay = R.range(90, 140);   // посёлок
      } else {
        ax = R.range(20, 200); ay = R.range(15, 75);    // лес
      }
      mkCrow(R, ax, ay);
    }
    WS.log('[AI] оленьих стад:', herds.length, 'ворон:', crows.length);
  }

  // ================================================================ события

  function onEntKill(d) {
    if (!d || !d.ent) return;
    var e = d.ent;
    if (e.kind === 'deer') {
      // убитого оленя стадо в панике уводит дальше
      var herd = e.herd;
      if (herd) {
        var i = herd.members.indexOf(e);
        if (i >= 0) herd.members.splice(i, 1);
        if (d.by) herdScare(herd, d.by.x, d.by.y);
      }
    } else if (e.kind === 'crow') {
      var ci = crows.indexOf(e);
      if (ci >= 0) crows.splice(ci, 1);
    }
  }

  function onEntRemove(d) {
    if (!d || !d.ent) return;
    var e = d.ent;
    if (e.kind === 'deer' && e.herd) {
      var herd = e.herd;
      var i = herd.members.indexOf(e);
      if (i >= 0) herd.members.splice(i, 1);
      if (!herd.members.length) {
        var h = herds.indexOf(herd);
        if (h >= 0) herds.splice(h, 1);
      }
    } else if (e.kind === 'crow') {
      var ci = crows.indexOf(e);
      if (ci >= 0) crows.splice(ci, 1);
    }
  }

  // ================================================================ API модуля

  WS.def('Animals', {
    spawnAll: spawnAll,
    reset: function () {
      herds = [];
      crows = [];
      tracks = [];
    },
    herds: function () { return herds; },
    crows: function () { return crows; },
    /** Отладка: распугать всю дичь вокруг игрока. */
    scareAll: function () {
      var p = AI.player();
      if (!p) return;
      for (var i = 0; i < herds.length; i++) herdScare(herds[i], p.x, p.y);
    }
  });

  // ================================================================ загрузка

  WS.boot(function initAnimalsAI() {
    AI = WS.AI;

    // спрайты зверья
    WS.Spr.def('deer', { w: 48, h: 40, draw: deerDraw });
    WS.Spr.def('hare', { w: 24, h: 16, draw: hareDraw });
    WS.Spr.def('crow', { w: 24, h: 16, draw: crowDraw });

    // поведения
    AI.register('deer', updateDeer);
    AI.register('hare', updateHare);
    AI.register('crow', updateCrow);

    // следы — отдельный лёгкий тик
    WS.tick(50, tracksTick, 'ai:animals:tracks');

    WS.Ev.on('ent:kill', onEntKill);
    WS.Ev.on('ent:remove', onEntRemove);
  }, 'ai:animals:init');
})();
