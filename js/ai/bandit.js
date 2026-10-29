/**
 * A4 — бандиты-дезертиры: люди с оружием, главная «человеческая» угроза.
 * Лагеря по 2–4 человека у костра (лес/опушка), днём патрулируют дороги.
 * Увидев игрока (12 тайлов днём, 6 ночью) — окрик «Стой!» на 1.5 с,
 * затем: стрелок приседает и стреляет (патроны ограничены), ближник
 * бежит и бьёт. В дома не лезут: стоят у двери 10 секунд и уходят.
 * Смерть -> WS.AI.kill -> WS.Loot.makeCorpse('bandit') (оружие, патроны, еда).
 */
(function () {
  'use strict';

  var AI = null;   // WS.AI (алиас в boot)

  // ================================================================ настройки

  var SIGHT_DAY = 12;       // обнаружение игрока днём
  var SIGHT_NIGHT = 6;     // ночью
  var SHOUT_TIME = 1.5;    // «Стой! Стрелять буду!»
  var GUN_DMG = 45;        // урон выстрела
  var GUN_RANGE_MIN = 4;   // ближний предел стрельбы (отходит)
  var GUN_RANGE_MAX = 9;   // дальний предел (приближается)
  var AIM_TIME = 1.1;      // прицеливание
  var RELOAD_T = 2.4;      // между выстрелами
  var DOOR_WAIT = 10;      // сколько стоят у двери
  var CAMP_R = 4;          // радиус отдыха у костра
  var HEAL_RATE = 0.6;     // регенерация в лагере, hp/с

  // оружие: спрайт, урон, период удара
  var WEAPONS = {
    rifle: { spr: 'bandit', meleeDmg: 8, meleeCd: 1.2 },
    knife: { spr: 'bandit_knife', meleeDmg: 10, meleeCd: 1.0 },
    axe:   { spr: 'bandit_axe', meleeDmg: 18, meleeCd: 1.6 }
  };

  // пиксельные цвета (палитра проекта)
  var COAT = '#3c4656', COAT2 = '#4a5568', BELT = '#2a2118';
  var SKIN = '#c9a186', SKIN2 = '#a97f66', FUR = '#7d6a52', FUR2 = '#8f7c63';
  var BOOT = '#2c2620', GUN = '#4a3a2a', STEEL = '#aab2bc';

  var groups = [];   // все бандитские группировки

  // ================================================================ спрайты

  function p(c, x, y, w, h, col) {
    c.fillStyle = col;
    c.fillRect(x, y, w, h);
  }

  /** Бандит в профиль (вправо) с оружием weapon, 32x48. */
  function banditSide(c, frame, weapon) {
    var dy = 0;   // вертикальный сдвиг позы
    var sit = frame === 3;
    var aim = frame === 2;
    if (sit) dy = 10;
    else if (aim) dy = 4;
    // сапоги и ноги
    if (sit) {
      p(c, 10, 40, 12, 8, BOOT);                 // ноги вытянуты вперёд
      p(c, 8, 36, 6, 6, BOOT);
    } else if (frame === 1) {
      p(c, 13, 38, 4, 10, BOOT); p(c, 17, 38, 4, 10, BOOT);
    } else {
      p(c, 11, 38, 4, 10, BOOT); p(c, 19, 38, 4, 10, BOOT);
    }
    // шинель до колен
    p(c, 9, 18 + dy, 15, 20 - dy, COAT);
    p(c, 10, 17 + dy, 13, 2, COAT2);
    p(c, 8, 34 - (sit ? 4 : 0), 17, 5, COAT);    // юбка шинели шире
    p(c, 9, 29 + dy, 15, 2, BELT);               // ремень
    p(c, 16, 29 + dy, 2, 2, '#6b5138');          // пряжка
    // воротник и плечи
    p(c, 8, 16 + dy, 17, 3, COAT2);
    // голова, папаха
    p(c, 13, 9 + dy, 8, 7, SKIN);
    p(c, 14, 10 + dy, 2, 2, '#2c241c');          // глаз
    p(c, 18, 13 + dy, 3, 2, SKIN2);              // тень скулы
    p(c, 11, 3 + dy, 12, 6, FUR);
    p(c, 11, 7 + dy, 12, 2, FUR2);
    p(c, 12, 3 + dy, 10, 1, '#5d4e3c');
    // задняя рука
    p(c, 7, 20 + dy, 4, 11, COAT);
    // оружие в передних руках
    if (weapon === 'rifle') {
      if (aim) {
        // прицеливание: винтовка горизонтально
        p(c, 22, 22, 10, 2, GUN);
        p(c, 30, 22, 3, 2, STEEL);               // штык
        p(c, 20, 23, 4, 3, COAT2);              // руки
        p(c, 26, 23, 3, 2, SKIN);
        p(c, 21, 20, 3, 2, GUN);                // прицел
      } else if (sit) {
        p(c, 14, 20, 3, 22, GUN);               // винтовка у колена
      } else {
        // винтовка «по-походному» через плечо
        p(c, 6, 24, 3, 3, GUN);
        p(c, 9, 20, 3, 4, GUN);
        p(c, 12, 17, 3, 4, GUN);
        p(c, 15, 15, 3, 3, STEEL);
        p(c, 20, 21, 4, 3, COAT2);              // рука держит
      }
    } else if (weapon === 'knife') {
      p(c, 21, 24 + dy, 4, 3, COAT2);           // рука
      p(c, 25, 24 + dy, 2, 5, STEEL);           // клинок вниз
      p(c, 25, 23 + dy, 2, 2, '#6b5138');       // рукоять
    } else {   // axe
      p(c, 21, 22 + dy, 3, 3, COAT2);
      p(c, 24, 18 + dy, 2, 12, '#6b5138');      // топорище
      p(c, 22, 17 + dy, 6, 4, STEEL);           // лезвие
    }
  }

  /** Бандит анфас (на юг). */
  function banditFront(c, frame, weapon) {
    var dy = 0;
    var sit = frame === 3;
    if (sit) dy = 10;
    // ноги
    if (sit) {
      p(c, 8, 40, 16, 8, BOOT);
    } else {
      p(c, 11, 38, 4, 10, BOOT); p(c, 17, 38, 4, 10, BOOT);
      p(c, 10, 36, 12, 3, COAT);
    }
    // шинель анфас: два борта
    p(c, 8, 17 + dy, 16, 21 - dy, COAT);
    p(c, 15, 18 + dy, 3, 18 - dy, COAT2);       // свет на борту
    p(c, 8, 29 + dy, 16, 2, BELT);
    p(c, 14, 29 + dy, 3, 2, '#6b5138');
    p(c, 7, 16 + dy, 18, 3, COAT2);             // плечи
    // голова анфас
    p(c, 12, 9 + dy, 9, 7, SKIN);
    p(c, 13, 11 + dy, 2, 2, '#2c241c'); p(c, 18, 11 + dy, 2, 2, '#2c241c');
    p(c, 15, 13 + dy, 3, 1, SKIN2);
    p(c, 10, 3 + dy, 13, 6, FUR);
    p(c, 10, 7 + dy, 13, 2, FUR2);
    p(c, 11, 3 + dy, 11, 1, '#5d4e3c');
    // оружие: винтовка поперёк груди
    if (weapon === 'rifle') {
      p(c, 6, 26 + dy, 20, 2, GUN);
      p(c, 5, 25 + dy, 3, 2, STEEL);
      p(c, 22, 25 + dy, 4, 3, COAT2);
    } else if (weapon === 'knife') {
      p(c, 20, 24 + dy, 3, 5, STEEL);
      p(c, 20, 22 + dy, 3, 2, '#6b5138');
    } else {
      p(c, 21, 18 + dy, 2, 10, '#6b5138');
      p(c, 19, 17 + dy, 6, 4, STEEL);
    }
  }

  /** Бандит со спины (на север). */
  function banditBack(c, frame, weapon) {
    var dy = frame === 3 ? 10 : 0;
    if (frame === 3) {
      p(c, 8, 40, 16, 8, BOOT);
    } else {
      p(c, 11, 38, 4, 10, BOOT); p(c, 17, 38, 4, 10, BOOT);
    }
    p(c, 8, 17 + dy, 16, 21 - dy, COAT);
    p(c, 9, 18 + dy, 3, 18 - dy, '#333c4a');    // тень борта
    p(c, 8, 29 + dy, 16, 2, BELT);
    p(c, 7, 16 + dy, 18, 3, COAT2);
    // со спины лица нет, только папаха
    p(c, 11, 9 + dy, 10, 6, SKIN2);
    p(c, 10, 3 + dy, 12, 6, FUR);
    p(c, 10, 7 + dy, 12, 2, FUR2);
    // винтовка за плечом
    if (weapon === 'rifle') {
      p(c, 20, 16 + dy, 3, 4, GUN);
      p(c, 23, 13 + dy, 3, 4, STEEL);
    }
  }

  /** Общий отрисовщик бандита: 4 стороны, кадры 0/1 ходьба, 2 прицел, 3 сидит. */
  function banditDraw(weapon) {
    return function (c, w, h, frame, dir) {
      var d4 = (dir === undefined) ? 4 : ((dir | 0) & 2);
      if (d4 === 6) {
        c.save();
        c.translate(w, 0);
        c.scale(-1, 1);
        banditSide(c, frame, weapon);
        c.restore();
      } else if (d4 === 2) {
        banditSide(c, frame, weapon);
      } else if (d4 === 0) {
        banditBack(c, frame, weapon);
      } else {
        banditFront(c, frame, weapon);
      }
    };
  }

  /** Костёр лагеря: 2 кадра пламени. */
  function campfireDraw(c, w, h, frame) {
    // камни по кругу
    p(c, 2, 18, 4, 3, '#5f636b');
    p(c, 26, 18, 4, 3, '#767a82');
    p(c, 6, 22, 3, 2, '#5f636b');
    p(c, 23, 22, 3, 2, '#767a82');
    // брёвна крестом
    p(c, 5, 17, 22, 3, '#57422e');
    p(c, 8, 15, 16, 3, '#6b5138');
    // пламя
    if (frame === 0) {
      p(c, 11, 8, 10, 9, '#e2924a');
      p(c, 13, 4, 6, 8, '#f4b968');
      p(c, 14, 2, 4, 5, '#f8dc9a');
    } else {
      p(c, 12, 9, 8, 8, '#e2924a');
      p(c, 12, 5, 5, 8, '#f4b968');
      p(c, 15, 3, 4, 4, '#f8dc9a');
    }
    // угли
    p(c, 10, 16, 12, 2, '#8a4a20');
  }

  /** Палатка лагеря. */
  function tentDraw(c, w, h) {
    // полотно палатки пирамидой
    for (var i = 0; i < 13; i++) {
      var y = 30 - i * 2;
      var half = i * 1.7;
      p(c, Math.round(24 - half), y, Math.round(half * 2), 2, i % 2 ? '#a89a7c' : '#998c6f');
    }
    // вход (тёмный проём)
    p(c, 20, 22, 8, 9, '#2c2620');
    p(c, 21, 23, 6, 8, '#1a1612');
    // снег на макушке
    p(c, 22, 2, 4, 2, '#e2e8f0');
    p(c, 19, 5, 10, 1, '#e2e8f0');
    // колышки
    p(c, 6, 28, 2, 4, '#57422e');
    p(c, 40, 28, 2, 4, '#57422e');
  }

  /** Ящик с припасами. */
  function crateDraw(c, w, h) {
    p(c, 2, 4, 20, 16, '#6b5138');
    p(c, 3, 5, 18, 3, '#8a6d50');
    p(c, 2, 10, 20, 2, '#57422e');
    p(c, 2, 15, 20, 2, '#57422e');
    p(c, 10, 4, 2, 16, '#57422e');
    p(c, 4, 6, 2, 2, '#8a6d50'); p(c, 18, 6, 2, 2, '#8a6d50');
    p(c, 2, 19, 20, 2, '#3f3225');
  }

  // ================================================================ лагерь

  /** Найти точки патруля: дороги в 30 тайлах от лагеря. */
  function findPatrol(R, cx, cy) {
    var w = WS.World;
    var pts = [];
    var tries = 140;
    for (var i = 0; i < tries && pts.length < 3; i++) {
      var x = Math.floor(cx + R.range(-32, 32));
      var y = Math.floor(cy + R.range(-32, 32));
      if (x < 4 || y < 4 || x > w.w - 5 || y > w.h - 5) continue;
      if (w.tileAt(x, y) !== w.T.ROAD) continue;
      if (w.isTileBlocked(x, y)) continue;
      var dup = false;
      for (var k = 0; k < pts.length; k++) {
        if (WS.M.dist(pts[k].x, pts[k].y, x, y) < 8) { dup = true; break; }
      }
      if (dup) continue;
      pts.push({ x: x + 0.5, y: y + 0.5 });
    }
    return pts;
  }

  /**
   * Лагерь: костёр (свет с огнём), палатка, ящик с припасами,
   * 2–4 бандита. Располагается на опушке/у дороги, вдали от посёлка.
   */
  function spawnCamp(R) {
    var spot = AI.findSpot(R, {
      y0: 66, y1: 146,          // лес и опушка до посёлка
      minVillageD: 22,
      tiles: [WS.World.T.GRASS, WS.World.T.GRASS2, WS.World.T.DIRT, WS.World.T.GRAVEL],
      tries: 110
    });
    if (!spot) return null;

    // костёр: источник света с огнём (волки боятся)
    var fire = WS.World.addObject({
      x: spot.x, y: spot.y,
      sprName: 'ai_campfire',
      solid: true,
      light: 5,
      fireLight: true,
      name: 'Костёр бандитов',
      z: 0
    });
    // палатка чуть в стороне
    WS.World.addObject({
      x: spot.x - 1.6, y: spot.y - 0.9,
      sprName: 'ai_tent',
      solid: true,
      name: 'Палатка',
      z: 6
    });
    // ящик с припасами (лут — таблица 'bandit_camp' от B-агента)
    var crateOpts = {
      x: spot.x + 1.7, y: spot.y - 0.6,
      sprName: 'ai_crate',
      solid: true,
      name: 'Ящик с припасами',
      z: 2
    };
    if (WS.Data && WS.Data.loot && WS.Data.loot.bandit_camp) {
      crateOpts.container = 'bandit_camp';
    }
    WS.World.addObject(crateOpts);

    var group = {
      id: WS.World.newId('bandits'),
      camp: { x: spot.x, y: spot.y },
      fire: fire,
      members: [],
      initSize: 0,
      patrol: findPatrol(R, spot.x, spot.y),
      alertT: 0,       // общий сигнал «наш!»
      angryT: 0,       // месть за убитого
      routed: false,   // разбиты морально
      healT: 0
    };

    var n = R.int(2, 4);
    for (var j = 0; j < n; j++) {
      mkBandit(R, group,
        spot.x + R.range(-2.2, 2.2),
        spot.y + R.range(-1.6, 1.8));
    }
    group.initSize = group.members.length;
    groups.push(group);
    return group;
  }

  function mkBandit(R, group, x, y) {
    // оружие по вероятности: винтовка 50%, нож 30%, топор 20%
    var weapon = R.weighted([
      { id: 'rifle', w: 5 },
      { id: 'knife', w: 3 },
      { id: 'axe', w: 2 }
    ]).id;
    var e = WS.World.addEnt({
      kind: 'bandit',
      x: x, y: y,
      dir: R.int(0, 7),
      hp: 80, maxHp: 80,
      speed: 2.0,
      weapon: weapon,
      ammo: weapon === 'rifle' ? R.int(4, 10) : 0,
      sprName: WEAPONS[weapon].spr,
      sprFrame: 3,               // сидит у костра
      animFrames: 2,
      restFrame: 3,
      shadowR: 0.42,
      state: 'camp', stateT: 0,
      atkCd: 0, lungeT: 0,
      aimT: 0, shootCd: 0,
      routeIdx: 0, routeWait: 0,
      lastSeen: null, loseT: 0,
      sight: SIGHT_DAY,
      brain: { hears: true, noInside: true },
      group: group
    });
    group.members.push(e);
    return e;
  }

  /** 1–2 лагеря по 2–4 бандита. */
  function spawnAll() {
    var G = WS.G;
    if (!G) return;
    var R = WS.RNG.mk((G.seed ^ 0xDE52) >>> 0);
    var n = R.int(1, 2);
    var made = 0;
    for (var i = 0; i < n; i++) {
      if (spawnCamp(R)) made++;
    }
    WS.log('[AI] бандитских лагерей:', made);
  }

  // ================================================================ поведение

  function sightRange() {
    return AI.isNight() ? SIGHT_NIGHT : SIGHT_DAY;
  }

  /** Ближайшая дверь здания (или ближайший угол). */
  function buildingDoor(bld, fx, fy) {
    if (bld.door && bld.door.length) {
      var best = bld.door[0], bd = 1e9;
      for (var i = 0; i < bld.door.length; i++) {
        var d = WS.M.dist(bld.door[i].x, bld.door[i].y, fx, fy);
        if (d < bd) { bd = d; best = bld.door[i]; }
      }
      return { x: best.x, y: best.y };
    }
    // дверей нет — ближайший угол
    var cx = bld.x + bld.w / 2, cy = bld.y + bld.h / 2;
    var dx = fx < cx ? bld.x - 1 : bld.x + bld.w;
    var dy = fy < cy ? bld.y - 1 : bld.y + bld.h;
    return { x: dx, y: dy };
  }

  /** Выстрел: звук, трассер, шанс попадания. */
  function shoot(e, pl, R) {
    e.ammo--;
    e.shootCd = RELOAD_T;
    e.aimT = 0;
    AI.snd('gunshot', e.x, e.y, 1);
    // выстрел слышен всему лесу
    try { WS.Ev.emit('noise', { x: e.x, y: e.y, r: 35 }); } catch (err) { /* пусто */ }
    // вспышка
    if (WS.Fx && WS.Fx.burst) WS.Fx.burst('spark', e.x, e.y - 0.3, 3);
    if (WS.Cam && WS.Cam.kick) WS.Cam.kick(2);
    // шанс попадания: база, минус дистанция, крадучись, ночь
    var d = WS.M.dist(e.x, e.y, pl.x, pl.y);
    var hit = 0.75 - d * 0.05;
    if (pl.sneaking) hit -= 0.15;
    if (AI.isNight()) hit -= 0.2;
    hit = WS.M.clamp(hit, 0.1, 0.85);
    if (R.f() < hit) {
      AI.damagePlayer(GUN_DMG, 'gun', e);
    } else {
      // промах: снег вскипает у ног
      if (WS.Fx && WS.Fx.burst) {
        WS.Fx.burst('snow', pl.x + R.range(-1, 1), pl.y + R.range(-1, 1), 4);
      }
      var pl2 = AI.player();
      if (pl2 && WS.Fx && WS.Fx.text && WS.M.dist(e.x, e.y, pl2.x, pl2.y) < 14) {
        WS.Fx.text('Мимо!', pl2.x, pl2.y - 1, { life: 0.9, col: '#9fb0c4', size: 13 });
      }
    }
  }

  function updateBandit(e, dt, R) {
    var pl = AI.player();
    var group = e.group;
    e.moving = false;
    var night = AI.isNight();
    var sr = sightRange();
    var dP = pl ? WS.M.dist(e.x, e.y, pl.x, pl.y) : 9999;
    var sees = !!(pl && pl.hp > 0 && dP <= sr && AI.canSee(e, pl, sr));

    // --- паника/бегство
    if (e.state === 'flee') {
      var camp = group ? group.camp : { x: e.x, y: e.y };
      var dC = WS.M.dist(e.x, e.y, camp.x, camp.y);
      if (dC > 2.5) {
        AI.moveTowards(e, camp.x, camp.y, e.speed * 1.3, dt);
        AI.anim(e, dt, 8);
      } else {
        e.state = 'camp';
        e.stateT = 0;
      }
      // у костра отлеживается, но при виде игрока — снова в бой
      if (sees && dP < sr * 0.8) { e.state = 'fight'; e.stateT = 0; }
      return;
    }

    // --- бой
    if (e.state === 'fight') {
      if (!pl || pl.hp <= 0) { e.state = 'camp'; e.stateT = 0; return; }
      // игрок в доме — к двери и жду
      var bld = WS.World.isInside(pl.x, pl.y);
      if (bld && !WS.World.isInside(e.x, e.y)) {
        e.state = 'door';
        e.stateT = 0;
        e.doorPt = buildingDoor(bld, e.x, e.y);
        return;
      }
      // здоровье на исходе — в бегство (мораль)
      if (e.hp < e.maxHp * 0.3 && R.chance(dt * 0.5)) {
        e.state = 'flee';
        e.stateT = 0;
        return;
      }
      if (sees) { e.lastSeen = { x: pl.x, y: pl.y }; e.loseT = 0; }
      else {
        e.loseT += dt;
        if (e.loseT > 5 && dP > sr * 1.4) { e.state = 'search'; e.stateT = 0; return; }
      }
      var melee = WEAPONS[e.weapon];
      if (e.weapon === 'rifle' && e.ammo > 0 && dP >= GUN_RANGE_MIN) {
        // стрелок: держит дистанцию 4..9 и стреляет
        e.shootCd -= dt;
        if (dP > GUN_RANGE_MAX) {
          AI.moveTowards(e, pl.x, pl.y, e.speed * 1.15, dt);
          AI.anim(e, dt, 6);
        } else if (dP < GUN_RANGE_MIN) {
          AI.moveAway(e, pl.x, pl.y, e.speed, dt);
          AI.anim(e, dt, 6);
        } else {
          // присел, целится
          e.moving = false;
          e.sprFrame = 2;
          AI.setDir(e, pl.x - e.x, pl.y - e.y);
          e.aimT += dt;
          if (e.aimT >= AIM_TIME && e.shootCd <= 0) shoot(e, pl, R);
          return;
        }
      } else {
        // ближний бой (или патроны кончились — приклад)
        if (dP > 1.15) {
          AI.moveTowards(e, pl.x, pl.y, e.speed * 1.25, dt);
          AI.anim(e, dt, 7);
        } else if (e.atkCd <= 0) {
          e.atkCd = melee.meleeCd;
          AI.damagePlayer(melee.meleeDmg, e.weapon === 'axe' ? 'blade' : 'blade', e);
          AI.snd('hit', e.x, e.y, 0.8);
        }
      }
      return;
    }

    // --- окрик
    if (e.state === 'challenge') {
      e.moving = false;
      e.sprFrame = 0;
      if (pl) AI.setDir(e, pl.x - e.x, pl.y - e.y);
      if (e.stateT >= SHOUT_TIME) {
        // не ушёл? — бой
        if (pl && pl.hp > 0 && (sees || dP < sr * 1.6)) {
          e.state = 'fight';
          e.stateT = 0;
        } else {
          e.state = 'search';
          e.lastSeen = pl ? { x: pl.x, y: pl.y } : null;
          e.stateT = 0;
        }
      }
      return;
    }

    // --- у двери дома (игрок спрятался)
    if (e.state === 'door') {
      if (e.doorPt) {
        var dD = WS.M.dist(e.x, e.y, e.doorPt.x, e.doorPt.y);
        if (dD > 1.2) {
          AI.moveTowards(e, e.doorPt.x, e.doorPt.y, e.speed, dt);
          AI.anim(e, dt, 6);
        } else if (pl && WS.M.dist(e.x, e.y, pl.x, pl.y) < 3 && !WS.World.isInside(pl.x, pl.y)) {
          // вышел всё-таки
          e.state = 'fight';
          e.stateT = 0;
        }
      }
      if (e.stateT > DOOR_WAIT) {
        e.state = 'search';
        e.stateT = 0;
      }
      return;
    }

    // --- поиск пропавшего игрока
    if (e.state === 'search') {
      var pt = e.lastSeen;
      if (pt) {
        var dS = WS.M.dist(e.x, e.y, pt.x, pt.y);
        if (dS > 2) {
          AI.moveTowards(e, pt.x, pt.y, e.speed, dt);
          AI.anim(e, dt, 6);
        }
      }
      if (e.stateT > 6) {
        e.state = group && group.patrol && group.patrol.length && !night ? 'patrol' : 'camp';
        e.stateT = 0;
      }
      if (sees) { e.state = 'fight'; e.stateT = 0; }
      return;
    }

    // --- патруль дорог (днём, если маршрут есть)
    if (e.state === 'patrol') {
      // ночь или разбитые — в лагерь
      if (night || !group || !group.patrol || !group.patrol.length) {
        e.state = 'camp';
        e.stateT = 0;
        return;
      }
      if (sees || (group && group.alertT > 0 && dP < sr + 4)) { startChallenge(e, pl, group); return; }
      // маршрут: лагерь -> точки -> лагерь
      var route = [group.camp].concat(group.patrol).concat([group.camp]);
      var wp = route[e.routeIdx % route.length];
      var dW = WS.M.dist(e.x, e.y, wp.x, wp.y);
      if (dW > 1.5) {
        AI.moveTowards(e, wp.x, wp.y, e.speed * 0.9, dt);
        AI.anim(e, dt, 5);
      } else {
        e.routeWait -= dt;
        if (e.routeWait <= 0) {
          e.routeWait = 2 + R.f() * 4;   // осмотреться
          e.routeIdx = (e.routeIdx + 1) % route.length;
        }
      }
      return;
    }

    // --- лагерь (по умолчанию): костёр, отдых
    if (group) {
      var camp2 = group.camp;
      var dC2 = WS.M.dist(e.x, e.y, camp2.x, camp2.y);
      if (dC2 > CAMP_R + 1) {
        AI.moveTowards(e, camp2.x, camp2.y, e.speed, dt);
        AI.anim(e, dt, 5);
      } else {
        // сидит у огня: редкие вставания, повороты
        e.moving = false;
        e.sprFrame = 3;
        if (R.f() < dt * 0.03) e.dir = R.int(0, 7);
        // медленный реген у костра
        if (e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + HEAL_RATE * dt);
        // утром живой лагерь высылает патруль
        if (!night && !group.routed && group.patrol && group.patrol.length && R.f() < dt * 0.02) {
          e.state = 'patrol';
          e.stateT = 0;
          e.routeIdx = 0;
          e.routeWait = 0;
        }
      }
      // общий сигнал «наш!» или месть — в бой без окрика
      if (sees) { startChallenge(e, pl, group); return; }
      if (((group.alertT > 0 && dP < 14) || (group.angryT > 0 && dP < 20)) &&
          pl && pl.hp > 0) {
        e.state = 'fight';
        e.stateT = 0;
      }
      return;
    }

    // без группы — бродит
    AI.wanderInArea(e, e.x, e.y, 10, dt, e.speed * 0.5);
    AI.anim(e, dt, 4);
  }

  /** Окрик «Стой!». */
  function startChallenge(e, pl, group) {
    e.state = 'challenge';
    e.stateT = 0;
    e.aimT = 0;
    AI.snd('bandit_shout', e.x, e.y, 1);
    // крик слышен и товарищам, и зверью
    try { WS.Ev.emit('noise', { x: e.x, y: e.y, r: 16 }); } catch (err) { /* пусто */ }
    if (WS.Fx && WS.Fx.text) {
      WS.Fx.text('Стой!', e.x, e.y - 1, { life: 1.2, col: '#e8b9a0', size: 15 });
    }
    if (group) group.alertT = 25;
  }

  // ================================================================ контролёр групп

  var groupAcc = 0;

  function groupTick(dt) {
    var G = WS.G;
    if (!G || !G.running || G.dead) return;
    groupAcc += dt;
    if (groupAcc < 0.5) return;
    var gdt = groupAcc;
    groupAcc = 0;
    var t = AI.now();

    for (var i = groups.length - 1; i >= 0; i--) {
      var group = groups[i];
      // чистка состава
      var alive = [];
      for (var m = 0; m < group.members.length; m++) {
        if (!group.members[m].dead) alive.push(group.members[m]);
      }
      group.members = alive;
      if (!group.members.length) {
        // лагерь пуст: костёр догорает, ящик остаётся
        groups.splice(i, 1);
        continue;
      }
      // таймеры
      if (group.alertT > 0) group.alertT -= gdt;
      if (group.angryT > 0) group.angryT -= gdt;
      // мораль: потеряли больше половины — разбиты, сидят в лагере
      if (!group.routed && group.members.length <= Math.ceil(group.initSize / 2) &&
          group.initSize >= 3) {
        group.routed = true;
        for (var k = 0; k < group.members.length; k++) {
          if (group.members[k].state !== 'camp') {
            group.members[k].state = 'flee';
            group.members[k].stateT = 0;
          }
        }
      }
      // анимация костра (мерцание пламени)
      if (group.fire) {
        group.fire.sprFrame = Math.floor(t * 3) % 2;
      }
    }
  }

  // ================================================================ события

  function onEntKill(d) {
    if (!d || !d.ent || d.ent.kind !== 'bandit') return;
    var e = d.ent;
    var group = e.group;
    if (!group) return;
    var i = group.members.indexOf(e);
    if (i >= 0) group.members.splice(i, 1);
    if (d.by && (d.by.kind === 'player' || d.by.id === 'player')) {
      // месть:_remaining поднимаются
      group.angryT = 40;
      for (var k = 0; k < group.members.length; k++) {
        var m = group.members[k];
        if (m.state === 'camp' || m.state === 'patrol') {
          m.state = 'fight';
          m.stateT = 0;
        }
      }
      var pl = AI.player();
      if (pl && WS.Fx && WS.Fx.text) {
        WS.Fx.text('Сволочи! Убью!', e.x, e.y - 1, { life: 1.4, col: '#d94f4f', size: 14 });
      }
    }
  }

  function onEntRemove(d) {
    if (!d || !d.ent || d.ent.kind !== 'bandit') return;
    var e = d.ent;
    for (var i = groups.length - 1; i >= 0; i--) {
      var group = groups[i];
      var j = group.members.indexOf(e);
      if (j >= 0) group.members.splice(j, 1);
      if (!group.members.length) groups.splice(i, 1);
    }
  }

  // ================================================================ API модуля

  WS.def('Bandit', {
    spawnAll: spawnAll,
    reset: function () {
      groups = [];
      groupAcc = 0;
    },
    groups: function () { return groups; },
    count: function () {
      var n = 0;
      for (var i = 0; i < groups.length; i++) n += groups[i].members.length;
      return n;
    }
  });

  // ================================================================ загрузка

  WS.boot(function initBanditAI() {
    AI = WS.AI;

    // спрайты бандитов: три варианта по оружию (кадры 0/1 ходьба, 2 прицел, 3 сидит)
    WS.Spr.def('bandit', { w: 32, h: 48, draw: banditDraw('rifle') });
    WS.Spr.def('bandit_knife', { w: 32, h: 48, draw: banditDraw('knife') });
    WS.Spr.def('bandit_axe', { w: 32, h: 48, draw: banditDraw('axe') });

    // реквизит лагеря
    WS.Spr.def('ai_campfire', { w: 32, h: 24, draw: campfireDraw });
    WS.Spr.def('ai_tent', { w: 48, h: 32, draw: tentDraw });
    WS.Spr.def('ai_crate', { w: 24, h: 22, draw: crateDraw });

    AI.register('bandit', updateBandit);

    WS.tick(50, groupTick, 'ai:bandit:groups');

    WS.Ev.on('ent:kill', onEntKill);
    WS.Ev.on('ent:remove', onEntRemove);
  }, 'ai:bandit:init');
})();
