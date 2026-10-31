/**
 * A4 — фреймворк ИИ зверей и бандитов «Белого Безмолвия».
 * Реестр поведений WS.AI.register(kind, fn), общий тик (приоритет 50) с LOD:
 * далёкие от игрока сущности «спят» и обновляются раз в 0.5–2 с.
 * Сенсоры: зрение canSee (ночь ×0.4, крадущийся игрок ×0.5, стены режут взгляд),
 * слух (событие 'noise' -> e.alertTo), обоняние WS.AI.smell ('blood', 60 с).
 * Движение с обходом препятствий по перпендикуляру, единый урон/смерть
 * сущностей, fallback урона игроку (если WS.Health ещё не подключён).
 * Исполнители поведений: js/ai/wolf.js, bear.js, bandit.js, animals.js.
 */
(function () {
  'use strict';

  // ================================================================ настройки

  var TICK_PRI = 50;      // приоритет тика ИИ (договор CONTRACT.md)
  var LOD_R1 = 40;        // дальше 40 тайлов от игрока — редкий апдейт
  var LOD_T1 = 0.5;       // ... раз в 0.5 с (примерно 1/10 частоты логики)
  var LOD_R2 = 80;        // совсем далеко — «глубокий сон»
  var LOD_T2 = 2.0;       // ... раз в 2 с
  var SMELL_TTL = 60;     // волки помнят запах крови 60 секунд
  var ALERT_TTL = 30;     // сколько сущность помнит точку услышанного шума

  // мировые константы генератора (карта 220x220, договор с A-агентом)
  var MAP_W = 220, MAP_H = 220;
  var FOREST_YMAX = 80;                  // лес — верхняя половина карты
  var VILLAGE_Y0 = 80, VILLAGE_Y1 = 150; // посёлок — середина
  var RIVER_Y = 150;                     // река — низ карты
  var VILLAGE = { x: 110, y: 115 };      // приблизительный центр посёлка

  // ================================================================ состояние

  var registry = {};   // kind -> updateFn(e, dt, R)
  var aiTime = 0;      // наработанное ИИ-время (сек); на паузе не растёт

  // лёгкий рантайм-ГПСЧ: поведение живого мира, на детерминизм
  // генерации не влияет (спавн использует свой seeded WS.RNG.mk)
  var RUNTIME = {
    f: function () { return Math.random(); },
    range: function (lo, hi) { return lo + Math.random() * (hi - lo); },
    int: function (lo, hi) { return Math.floor(lo + Math.random() * (hi - lo + 1)); },
    chance: function (p) { return Math.random() < p; },
    pick: function (arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  };

  // ------------------------------------------------- обоняние (запахи крови/мяса)

  var smellPts = [];   // {x, y, r, t}

  var smell = {
    /** Добавить запах (кровь, свежее мясо). Слушаем событие 'blood'. */
    add: function (x, y, r) {
      if (typeof x !== 'number' || typeof y !== 'number') return;
      smellPts.push({ x: x, y: y, r: r || 6, t: aiTime });
      if (smellPts.length > 48) smellPts.shift();   // не копим бесконечно
    },
    /** Ближайший «живой» запах не дальше maxR (в тайлах). */
    nearest: function (x, y, maxR) {
      var best = null, bd = maxR || 20;
      for (var i = 0; i < smellPts.length; i++) {
        var p = smellPts[i];
        if (aiTime - p.t > SMELL_TTL) continue;
        var d = WS.M.dist(x, y, p.x, p.y) - p.r * 0.3;   // радиус запаха «съедает» дистанцию
        if (d < bd) { bd = d; best = p; }
      }
      return best;
    },
    /** Подчистка протухших следов (вызывается из тика раз в пару секунд). */
    gc: function () {
      for (var i = smellPts.length - 1; i >= 0; i--) {
        if (aiTime - smellPts[i].t > SMELL_TTL) smellPts.splice(i, 1);
      }
    },
    clear: function () { smellPts = []; },
    count: function () { return smellPts.length; }
  };

  // ================================================================ утилиты

  function now() { return aiTime; }

  function player() {
    return (WS.G && WS.G.player) || null;
  }

  function playerDist(e) {
    var p = player();
    if (!p || p.x === undefined) return 9999;
    return WS.M.dist(e.x, e.y, p.x, p.y);
  }

  /** Ночь? По освещённости: в полярную ночь (после 14 декабря) — всегда. */
  function isNight() {
    if (!WS.Time || !WS.Time.light) return false;
    return WS.Time.light() < 0.22;
  }

  /** Полярная ночь: солнце не встаёт, волки охотятся круглосуточно. */
  function isPolarNight() {
    return !!(WS.Time && WS.Time.isPolarNight && WS.Time.isPolarNight());
  }

  /** Текст-сообщение игроку (над персонажем, как «Вы слышите вой...»). */
  function msg(str, col) {
    var p = player();
    if (!p || !WS.Fx || !WS.Fx.text) return;
    try {
      WS.Fx.text(str, p.x, p.y - 1.2, { life: 2.6, col: col || '#c9d2e0', size: 15 });
    } catch (e) { WS.err('AI.msg', e); }
  }

  /** Позиционный звук с защитой от отсутствия аудио. */
  function snd(name, x, y, vol) {
    if (!WS.Snd || !WS.Snd.play) return;
    try { WS.Snd.play(name, { x: x, y: y, vol: vol !== undefined ? vol : 0.8 }); }
    catch (e) { WS.err('AI.snd', e); }
  }

  /** Смена состояния с сбросом таймера. */
  function setState(e, s) {
    if (e.state !== s) { e.state = s; e.stateT = 0; }
  }

  // ================================================================ сенсоры

  /**
   * Видит ли сущность цель. range — базовая дальность в тайлах.
   * Ночью (свет < 0.3) зрение × 0.4; крадущийся игрок × 0.5;
   * смотреть изнутри дома наружу (и наоборот) — × 0.45;
   * стены/окна перекрывают линию взгляда.
   */
  function canSee(e, target, range) {
    if (!e || !target || target.x === undefined) return false;
    range = range || e.sight || 10;
    var p = player();
    if (WS.Time && WS.Time.light() < 0.3) range *= 0.4;
    if (target === p && p && p.sneaking) range *= 0.5;
    var w = WS.World;
    if (w && w.isInside) {
      var ein = w.isInside(e.x, e.y);
      var tin = w.isInside(target.x, target.y);
      if (!!ein !== !!tin) range *= 0.45;   // сквозь оконца плохо видно
    }
    var d = WS.M.dist(e.x, e.y, target.x, target.y);
    if (d > range) return false;
    return losClear(e.x, e.y, target.x, target.y);
  }

  /** Линия взгляда: стены, окна и крипта непрозрачны; двери просвечивают. */
  function losClear(x0, y0, x1, y1) {
    var w = WS.World;
    if (!w || !w.tileAt) return true;
    var d = WS.M.dist(x0, y0, x1, y1);
    var steps = Math.max(1, Math.ceil(d / 0.45));
    for (var i = 1; i < steps; i++) {
      var t = i / steps;
      var x = x0 + (x1 - x0) * t;
      var y = y0 + (y1 - y0) * t;
      var tile = w.tileAt(Math.floor(x), Math.floor(y));
      if (tile === w.T.WALL_WOOD || tile === w.T.WALL_BRICK || tile === w.T.WALL_STONE ||
          tile === w.T.WALL_LOG || tile === w.T.WINDOW || tile === w.T.CRYPT) return false;
    }
    return true;
  }

  /** Слух: событие 'noise' {x, y, r} будит все сущности в радиусе. */
  function onNoise(n) {
    var G = WS.G;
    if (!n || !G || !G.running) return;
    var w = WS.World;
    if (!w || !w.ents) return;
    if (typeof n.x !== 'number' || typeof n.y !== 'number') return;
    var r = n.r || 10;
    var night = isNight();
    var list = w.ents.slice();   // копия: шум может убить/добавить сущность
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (!e || e.dead || !e.brain) continue;
      if (e.brain.deaf) continue;                       // глухие (ворона)
      var hearMul = e.brain.hearMul || (night ? 1.35 : 1);
      var d = WS.M.dist(e.x, e.y, n.x, n.y);
      if (d > r * hearMul) continue;
      e.alertTo = { x: n.x, y: n.y, t: aiTime };
    }
  }

  /** Горящий источник света (костёр, факел) рядом? */
  function lightNear(x, y, r, fireOnly) {
    var w = WS.World;
    if (!w || !w.lightsNear) return null;
    var list = w.lightsNear(x, y, r);
    for (var i = 0; i < list.length; i++) {
      if (fireOnly && !list[i].fire) continue;
      return list[i];
    }
    return null;
  }

  function fireNear(x, y, r) { return lightNear(x, y, r, true); }

  /** Фонарь/лампа (свет без огня) — отпугивает волков с вероятностью 50%. */
  function lampNear(x, y, r) {
    var w = WS.World;
    if (!w || !w.lightsNear) return null;
    var list = w.lightsNear(x, y, r);
    for (var i = 0; i < list.length; i++) {
      if (!list[i].fire) return list[i];
    }
    return null;
  }

  // ================================================================ движение

  /** Поворот вектора на угол a (радианы). */
  function rotVec(x, y, a) {
    var c = Math.cos(a), s = Math.sin(a);
    return { x: x * c - y * s, y: x * s + y * c };
  }

  /** Проходима ли точка (в мировых координатах) для сущности e. */
  function passable(x, y, e) {
    var w = WS.World;
    if (!w) return false;
    var tx = Math.floor(x), ty = Math.floor(y);
    if (tx < 1 || ty < 1 || tx >= w.w - 1 || ty >= w.h - 1) return false;
    if (w.isTileBlocked(tx, ty)) return false;
    // звери и бандиты не заходят в дома (договор: дом — убежище игрока)
    if (e && e.brain && e.brain.noInside && w.isInside && w.isInside(x, y)) return false;
    // непроходимые объекты (деревья, камни, мебель)
    var objs = w.objsAt(tx, ty);
    if (objs && objs.length) {
      for (var i = 0; i < objs.length; i++) {
        if (objs[i].solid) return false;
      }
    }
    return true;
  }

  /** Множитель скорости от рельефа (снег/грязь замедляют). */
  function terrainMul(x, y) {
    var w = WS.World;
    if (!w || !w.terrainMoveCost) return 1;
    var cost = w.terrainMoveCost(Math.floor(x), Math.floor(y));
    if (!isFinite(cost) || cost < 1) cost = 1;
    return 1 / cost;
  }

  /**
   * Один шаг с обходом препятствий: сначала прямой вектор, затем
   * повороты по перпендикуляру (упрощённый обход, без поиска пути).
   * Возвращает пройденную дистанцию (0 — упёрлись).
   */
  function tryStep(e, ux, uy, speed, dt) {
    var cand = [
      { x: ux, y: uy, w: 1 },
      { x: ux, y: uy, w: 0.92, a: 0.75 },
      { x: ux, y: uy, w: 0.92, a: -0.75 },
      { x: ux, y: uy, w: 0.8, a: 1.5 },
      { x: ux, y: uy, w: 0.8, a: -1.5 }
    ];
    for (var i = 0; i < cand.length; i++) {
      var c = cand[i];
      if (c.a) { var v = rotVec(ux, uy, c.a); c.x = v.x; c.y = v.y; }
      var mul = terrainMul(e.x, e.y);
      var step = speed * dt * c.w * mul;
      if (step <= 0) return 0;
      var nx = e.x + c.x * step;
      var ny = e.y + c.y * step;
      if (!passable(nx, ny, e)) continue;
      e.x = nx; e.y = ny;
      e.moving = true;
      e._stuck = 0;
      setDir(e, c.x, c.y);
      return step;
    }
    // полностью зажаты — пробуем резкий случайный боковой уход
    e._stuck = (e._stuck || 0) + dt;
    if (e._stuck > 0.5) {
      var a = Math.random() * Math.PI * 2;
      var vx = Math.cos(a), vy = Math.sin(a);
      var jx = e.x + vx * speed * dt;
      var jy = e.y + vy * speed * dt;
      if (passable(jx, jy, e)) {
        e.x = jx; e.y = jy; e.moving = true;
        setDir(e, vx, vy);
      }
      if (e._stuck > 2) e._stuck = 0;
    }
    return 0;
  }

  /** Движение к точке. Возвращает пройденную дистанцию. */
  function moveTowards(e, x, y, speed, dt) {
    var dx = x - e.x, dy = y - e.y;
    var d = Math.sqrt(dx * dx + dy * dy);
    if (d < 0.05 || !speed || speed <= 0 || !dt || dt <= 0) return 0;
    return tryStep(e, dx / d, dy / d, speed, dt);
  }

  /** Движение прочь от точки (бегство). */
  function moveAway(e, tx, ty, speed, dt) {
    var dx = e.x - tx, dy = e.y - ty;
    var d = Math.sqrt(dx * dx + dy * dy) || 1;
    return tryStep(e, dx / d, dy / d, speed, dt);
  }

  /**
   * Ленивое блуждание по кругу (cx, cy, r): идём к случайной точке,
   * постояли, выбрали следующую. speed — скорость ходьбы.
   */
  function wanderInArea(e, cx, cy, r, dt, speed) {
    var W = e.wanderPt;
    if (W) {
      var d = WS.M.dist(e.x, e.y, W.x, W.y);
      if (d < 0.7) {
        e.wanderPt = null;
        e.wanderWait = RUNTIME.range(1.5, 5);
      } else if (speed > 0) {
        moveTowards(e, W.x, W.y, speed, dt);
      }
    } else {
      e.wanderWait = (e.wanderWait || 0) - dt;
      if (e.wanderWait <= 0) {
        var a = RUNTIME.f() * Math.PI * 2;
        var rr = RUNTIME.f() * (r || 8);
        e.wanderPt = {
          x: WS.M.clamp(cx + Math.cos(a) * rr, 2, MAP_W - 3),
          y: WS.M.clamp(cy + Math.sin(a) * rr * 0.8, 2, MAP_H - 3)
        };
      }
    }
  }

  /** Направление сущности из вектора движения. */
  function setDir(e, dx, dy) {
    if (dx || dy) e.dir = WS.M.dir8(dx, dy);
  }

  /**
   * Наземная анимация: sprFrame гонится, пока e.moving,
   * в покое — e.restFrame (обычно 0). fps — кадров в секунду.
   */
  function anim(e, dt, fps) {
    if (e.moving) {
      e._animT = (e._animT || 0) + dt * (fps || 6);
      var frames = e.animFrames || 2;
      e.sprFrame = Math.floor(e._animT) % frames;
    } else {
      e._animT = 0;
      e.sprFrame = e.restFrame || 0;
    }
  }

  // ================================================================ урон и смерть

  /**
   * Урон игроку — ВСЕГДА через это. Системы здоровья (B1) применят сами;
   * если их нет — fallback-обработчик ниже вычтет hp напрямую.
   */
  function damagePlayer(amount, type, src) {
    var G = WS.G;
    if (!G || !G.player || G.dead) return;
    if (G.player.hp <= 0) return;
    WS.Ev.emit('player:damage', { amount: amount, type: type || 'hit', src: src });
  }

  /**
   * Урон сущности. Применяет hp, эмитит 'ent:damage' {ent, dmg, by, applied},
   * оставляет запах крови, запоминает обидчика (e.threat) и убивает при hp<=0.
   */
  function damageEntity(e, dmg, by) {
    if (!e || e.dead || e.hp === undefined) return;
    dmg = Math.max(0, dmg);
    if (!dmg) return;
    e.hp -= dmg;
    try {
      WS.Ev.emit('ent:damage', { ent: e, dmg: dmg, by: by, applied: true });
    } catch (err) { WS.err('ent:damage emit', err); }
    // кровь — приманка для хищников и след для игрока
    try { WS.Ev.emit('blood', { x: e.x, y: e.y, r: 6 }); } catch (err2) { /* пусто */ }
    if (WS.Fx && WS.Fx.burst) {
      WS.Fx.burst('blood', e.x, e.y, Math.max(3, Math.min(8, 2 + Math.floor(dmg / 8))));
    }
    // запомнить обидчика (если это игрок) — зверь ответит или побежит
    if (by && (by.kind === 'player' || by.id === 'player')) {
      e.threat = by;
      e.threatT = aiTime;
    }
    if (e.hp <= 0) {
      kill(e, by);
    } else if (typeof e.onDamaged === 'function') {
      try { e.onDamaged(dmg, by); } catch (err3) { WS.err('onDamaged', err3); }
    }
  }

  /**
   * Смерть сущности: статистика, событие 'ent:kill', удаление из мира.
   * Труп больше НЕ создаём напрямую: его делает слушатель 'ent:kill' в
   * js/systems/looting.js через экспорт WS.Loot.makeCorpse (обёртка
   * дед-режима превращает его в подарок). Раньше прямой вызов + слушатель
   * оставляли на тайле ДВА объекта (подарок и обычный труп).
   */
  function kill(e, by) {
    if (!e || e.dead) return;
    e.dead = true;
    e.state = 'dead';
    e.moving = false;
    var byPlayer = !!(by && (by.kind === 'player' || by.id === 'player'));
    var G = WS.G;
    if (G && G.stats && byPlayer) {
      var map = {
        wolf: 'wolvesKilled', bear: 'bearsKilled', bandit: 'banditsKilled',
        deer: 'animalsHunted', hare: 'animalsHunted', crow: 'animalsHunted'
      };
      if (map[e.kind]) G.stats[map[e.kind]]++;
    }
    try { WS.Ev.emit('ent:kill', { ent: e, by: by }); }
    catch (err) { WS.err('ent:kill emit', err); }
    // труп с лутом создаёт слушатель 'ent:kill' в js/systems/looting.js
    // (через экспорт WS.Loot.makeCorpse — ровно один объект на тайле)
    // эффекты
    if (WS.Fx && WS.Fx.burst) WS.Fx.burst('blood', e.x, e.y, 8);
    snd('death', e.x, e.y, 0.5);
    try { WS.World.removeEnt(e); }
    catch (err3) { WS.err('removeEnt(' + e.kind + ')', err3); }
  }

  /**
   * Чужие эмиты 'ent:damage' (например, атака игрока из combat-модуля,
   * который не вызывает damageEntity): применяем урон сами.
   * Пометка applied защищает от двойного вычета.
   */
  function onExternalDamage(d) {
    if (!d || d.applied) return;
    var e = d.ent;
    if (!e || e.dead || e.hp === undefined) return;
    d.applied = true;
    var dmg = Math.max(0, d.dmg || 0);
    if (!dmg) return;
    e.hp -= dmg;
    try { WS.Ev.emit('blood', { x: e.x, y: e.y, r: 6 }); } catch (err) { /* пусто */ }
    if (WS.Fx && WS.Fx.burst) WS.Fx.burst('blood', e.x, e.y, 4);
    if (d.by && (d.by.kind === 'player' || d.by.id === 'player')) {
      e.threat = d.by;
      e.threatT = aiTime;
    }
    if (e.hp <= 0) kill(e, d.by);
    else if (typeof e.onDamaged === 'function') {
      try { e.onDamaged(dmg, d.by); } catch (err2) { WS.err('onDamaged ext', err2); }
    }
  }

  /**
   * Fallback урона игроку: если систему здоровья (WS.Health) ещё не
   * подключили и никто не выставил WS.G._dmgHooked — вычитаем hp сами.
   * С короткими «неуязвимыми» кадрами, чтобы стая не shred-дила мгновенно.
   */
  var DEATH_CAUSES = {
    bite: 'растерзан волчьей стаей',
    claw: 'убит медведем-шатуном',
    gun: 'застрелен бандитом-дезертиром',
    blade: 'зарезан бандитом-дезертиром',
    blunt: 'забит насмерть'
  };

  function onPlayerDamageFallback(d) {
    if (!d) return;
    var G = WS.G;
    if (!G || !G.player || G.player.hp === undefined) return;
    if (G._dmgHooked) return;          // систему подключили — она и решает
    if (WS.Health) return;             // модуль здоровья есть (B1) — не дублируем
    var p = G.player;
    var amount = Math.max(0, d.amount || 0);
    if (!amount || p.hp <= 0 || G.dead) return;
    // короткие кадры неуязвимости (0.4 с) — честность против стаи
    if (p._aiImmuneT !== undefined && p._aiImmuneT > aiTime) return;
    p._aiImmuneT = aiTime + 0.4;
    p.hp = Math.max(0, p.hp - amount);
    if (WS.Fx && WS.Fx.burst) WS.Fx.burst('blood', p.x, p.y, 4);
    if (WS.Cam && WS.Cam.kick) WS.Cam.kick(Math.min(8, 2 + amount * 0.12));
    if (p.hp <= 0 && WS.Main && WS.Main.die) {
      var src = d.src && d.src.kind;
      var cause = DEATH_CAUSES[d.type] || ('убит: ' + (src || 'неизвестная угроза'));
      WS.Main.die(cause);
    }
  }

  // ================================================================ тик ИИ

  function runBehavior(fn, e, dt) {
    // общие таймеры сущности
    e.stateT = (e.stateT || 0) + dt;
    if (e.atkCd > 0) e.atkCd -= dt;
    if (e.lungeT > 0) e.lungeT -= dt;
    if (e.alertTo && aiTime - e.alertTo.t > ALERT_TTL) e.alertTo = null;
    try {
      fn(e, dt, RUNTIME);
    } catch (err) {
      WS.err('ИИ "' + e.kind + '" (' + (e.id || '?') + '):', err && err.message);
    }
  }

  function aiTick(dt) {
    var G = WS.G;
    if (!G || !G.running || G.dead) return;
    aiTime += dt;
    // подчистка запахов — лениво, раз в ~2 с
    smell._t = (smell._t || 0) + dt;
    if (smell._t > 2) { smell._t = 0; smell.gc(); }
    var w = WS.World;
    if (!w || !w.ents || !w.ents.length) return;
    var snapshot = w.ents.slice();   // копия: поведение может убивать сущности
    var p = G.player;
    for (var i = 0; i < snapshot.length; i++) {
      var e = snapshot[i];
      if (!e || e.dead || !e.brain) continue;
      var fn = registry[e.kind];
      if (!fn) continue;
      // LOD: далёкие «спящие» сущности обновляются редко
      var d = (p && p.x !== undefined) ? WS.M.dist(e.x, e.y, p.x, p.y) : 9999;
      var iv = 0;
      if (d > LOD_R2) iv = LOD_T2;
      else if (d > LOD_R1) iv = LOD_T1;
      if (iv > 0) {
        e._lodAcc = (e._lodAcc || 0) + dt;
        if (e._lodAcc < iv) continue;
        var ldt = e._lodAcc;
        e._lodAcc = 0;
        runBehavior(fn, e, ldt);   // передаём НАКОПЛЕННЫЙ dt — скорость честная
      } else {
        runBehavior(fn, e, dt);
      }
    }
  }

  // ================================================================ заселение мира

  /** Есть ли уже зверь/бандиты в мире (защита от двойного спавна). */
  function hasWildlife() {
    var w = WS.World;
    if (!w || !w.ents) return false;
    var kinds = { wolf: 1, bear: 1, bandit: 1, deer: 1, hare: 1, crow: 1 };
    for (var i = 0; i < w.ents.length; i++) {
      var e = w.ents[i];
      if (e && kinds[e.kind]) return true;
    }
    return false;
  }

  function callSpawn(name) {
    var m = WS[name];
    if (!m) return;
    if (m.reset) {
      try { m.reset(); } catch (e1) { WS.err('AI reset ' + name, e1); }
    }
    if (m.spawnAll) {
      try { m.spawnAll(); } catch (e2) { WS.err('AI spawn ' + name, e2); }
    }
  }

  /**
   * Заселение: волчьи стаи (3–5 по 3–6), медведи-шатуны (1–2),
   * лагеря бандитов, оленьи стада, зайцы, вороны.
   * Каждый модуль сам ищет места (AI.findSpot) seeded-ГПСЧ.
   */
  function populateWorld() {
    if (!WS.G) return;
    if (hasWildlife()) return;
    callSpawn('Wolf');
    callSpawn('Bear');
    callSpawn('Bandit');
    callSpawn('Animals');
    WS.log('[AI] мир заселён:', JSON.stringify(kindCounts()));
  }

  /**
   * Поиск точки спавна. o: {
   *   x0,y0,x1,y1 — рамки; tiles — допустимые тайлы; minVillageD —
   *   мин. дистанция до посёлка; needTree — рядом должен быть лес;
   *   tries — число попыток
   * }
   */
  function findSpot(R, o) {
    o = o || {};
    var w = WS.World;
    if (!w || !w.tiles || !w.T) return null;
    var allowed = o.tiles || [w.T.GRASS, w.T.GRASS2];
    var x0 = o.x0 !== undefined ? o.x0 : 6;
    var x1 = o.x1 !== undefined ? o.x1 : MAP_W - 6;
    var y0 = o.y0 !== undefined ? o.y0 : 6;
    var y1 = o.y1 !== undefined ? o.y1 : MAP_H - 6;
    var minV = o.minVillageD || 0;
    var tries = o.tries || 70;
    var fallback = null;
    for (var i = 0; i < tries; i++) {
      var x = Math.floor(R.range(x0, x1));
      var y = Math.floor(R.range(y0, y1));
      if (allowed.indexOf(w.tileAt(x, y)) < 0) continue;
      if (w.isTileBlocked(x, y)) continue;
      if (w.isInside && w.isInside(x, y)) continue;
      if (minV > 0 && WS.M.dist(x, y, VILLAGE.x, VILLAGE.y) < minV) continue;
      // не вплотную к точке появления игрока (если генератор уже выставил её)
      var sp = w.spawnPoint;
      if (sp && sp.x > 5 && WS.M.dist(x, y, sp.x, sp.y) < 20) continue;
      if (o.needTree) {
        // «рядом с деревьями» — на этапе интерьеров леса может ещё не быть,
        // тогда берём запасную точку на траве
        if (!treeNear(x, y, 3)) {
          if (!fallback) fallback = { x: x + 0.5, y: y + 0.5 };
          continue;
        }
      }
      return { x: x + 0.5, y: y + 0.5 };
    }
    return fallback;
  }

  /** Есть ли объект-дерево в радиусе r тайлов от точки. */
  function treeNear(x, y, r) {
    var w = WS.World;
    if (!w || !w.query) return false;
    var list = w.query(x - r, y - r, x + r, y + r);
    for (var i = 0; i < list.length; i++) {
      var o = list[i];
      if (o.hp) continue;   // сущности не считаем
      var n = String(o.sprName || o.spr || '');
      if (n.indexOf('tree') >= 0 || n.indexOf('pine') >= 0 || n.indexOf('spruce') >= 0 ||
          n.indexOf('ёлк') >= 0 || n.indexOf('елк') >= 0) return true;
    }
    return false;
  }

  // -------------------------------------------------- отладка/статистика

  function kindCounts() {
    var out = {};
    var w = WS.World;
    if (!w || !w.ents) return out;
    for (var i = 0; i < w.ents.length; i++) {
      var k = w.ents[i] && w.ents[i].kind;
      if (k) out[k] = (out[k] || 0) + 1;
    }
    return out;
  }

  function registeredKinds() {
    var out = [];
    for (var k in registry) if (registry.hasOwnProperty(k)) out.push(k);
    return out;
  }

  // ================================================================ API модуля

  var AI = {
    // реестр поведений
    register: function (kind, fn) { registry[kind] = fn; },
    unregister: function (kind) { delete registry[kind]; },
    registeredKinds: registeredKinds,

    // время и игрок
    now: now,
    player: player,
    playerDist: playerDist,
    isNight: isNight,
    isPolarNight: isPolarNight,

    // сенсоры
    canSee: canSee,
    losClear: losClear,
    fireNear: fireNear,
    lampNear: lampNear,
    lightNear: lightNear,

    // обоняние
    smell: smell,

    // движение
    moveTowards: moveTowards,
    moveAway: moveAway,
    wanderInArea: wanderInArea,
    tryStep: tryStep,
    passable: passable,
    setDir: setDir,
    anim: anim,

    // состояния
    setState: setState,

    // урон
    damageEntity: damageEntity,
    damagePlayer: damagePlayer,
    kill: kill,

    // заселение
    populate: populateWorld,
    hasWildlife: hasWildlife,
    findSpot: findSpot,
    treeNear: treeNear,

    // сообщения/звук/отладка
    msg: msg,
    snd: snd,
    kindCounts: kindCounts,

    // мировые константы (договор с генератором)
    consts: {
      MAP_W: MAP_W, MAP_H: MAP_H,
      FOREST_YMAX: FOREST_YMAX,
      VILLAGE_Y0: VILLAGE_Y0, VILLAGE_Y1: VILLAGE_Y1,
      RIVER_Y: RIVER_Y
    },
    village: VILLAGE,

    // полный сброс (новая игра): чистим запахи, модули чистятся своим reset()
    reset: function () {
      smell.clear();
      aiTime = 0;
    }
  };

  // ================================================================ загрузка

  WS.def('AI', AI);

  WS.boot(function initAIFramework() {
    // главный тик ИИ — приоритет 50 по договору
    WS.tick(TICK_PRI, aiTick, 'ai:core');

    // слух: любой шум будит сущности в радиусе
    WS.Ev.on('noise', onNoise);

    // обоняние: кровь и мясо оставляют запах
    WS.Ev.on('blood', function (b) {
      if (b) smell.add(b.x, b.y, b.r || 6);
    });

    // чужие эмиты урона сущностям — применяем сами
    WS.Ev.on('ent:damage', onExternalDamage);

    // fallback урона игроку (если нет WS.Health / WS.G._dmgHooked)
    WS.Ev.on('player:damage', onPlayerDamageFallback);

    // заселение мира: основной канал — 'gen:interiors' от генератора
    // (A-агент эмитит после внутренней отделки посёлка), страховка —
    // 'game:start'/'game:load' на случай, если событие не пришло
    WS.Ev.on('gen:interiors', populateWorld);
    WS.Ev.on('game:start', populateWorld);
    WS.Ev.on('game:load', populateWorld);
  }, 'ai:init');
})();
