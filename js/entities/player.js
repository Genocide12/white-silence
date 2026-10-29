/**
 * player.js — модуль ИГРОКА «Белого Безмолвия»: движение, коллизии, анимация,
 * выносливость (дыхание), сон, шаги/шум/следы на снегу, fallback урона.
 * Спрайты — entities/sprites_player.js: 'player', 'player_sneak',
 * 'player_sleep', 'player_dead', 'footprint', 'blood_pool', 'drop_generic'.
 * Действия (атака/выстрел/двери/подбор/свет) — entities/actions.js (тик 61).
 * Межмодульная связь через поля WS.G.player: sprName/sprFrame/dir/walkT/
 * breath/sleeping/_swingT — см. заголовок actions.js.
 */
(function () {
  'use strict';

  // ====================================================================
  //  УПРАВЛЕНИЕ (справка; раскладка — core/input.js)
  // --------------------------------------------------------------------
  //   W A S D / стрелки ....... движение ОТНОСИТЕЛЬНО ЭКРАНА (изометрия):
  //                              W = экранный «вверх» = мировой вектор (-1,-1)/√2,
  //                              D = (1,-1), S = (1,1), A = (-1,1) и т.д.
  //   Shift ................... бег (×1.8), тратит дыхание
  //   Ctrl .................... крадучесть (×0.45, шум радиуса 2)
  //   Z ....................... сон/подъём (сон ускоряет время — core/time.js)
  //   E / ПКМ ................. взаимодействие (actions.js)
  //   ЛКМ ..................... удар/выстрел (actions.js)
  //   F ....................... факел/фонарь в руке (actions.js)
  //   Q ....................... выбросить предмет из правой руки (actions.js)
  //   R ....................... перезарядка (actions.js)
  //
  //  ПРИОРИТЕТЫ ТИКОВ (CONTRACT.md):
  //   20 — player:decals ...... распад следов/декалей (WS.World.timers)
  //   60 — player:ctrl ........ управление игроком (этот файл)
  //   61 — action:ctrl ........ действия игрока (actions.js)
  // ====================================================================

  // ====================================================================
  //  НАСТРОЙКИ И КОНСТАНТЫ
  //  Все «магические числа» вынесены сюда: баланс правится в одном месте.
  // ====================================================================

  var TICK_PRI = 60;             // приоритет тика управления игроком
  var DECAL_PRI = 20;            // приоритет тика распада декалей (следы)

  // ---- движение -------------------------------------------------------
  var BASE_SPEED = 2.2;          // тайлов/с — база (дублирует WS.G.player.speed)
  var SNEAK_MUL = 0.45;          // множитель скорости при крадучести
  var SPRINT_MUL = 1.8;          // множитель бега (дублирует p.sprintMul)
  var MIN_MOVE_FACTOR = 0.3;     // минимальный множитель от рельефа (1/cost)
  var PROBE_AHEAD = 0.4;         // на сколько тайлов «щупаем» рельеф вперёд

  // ---- коллизии -------------------------------------------------------
  var OBJ_RADIUS = 0.45;         // радиус игрока против solid-объектов/сущностей
  var ENT_SKIP_KINDS = { drop: 1, fish: 1 };   // сквозь них можно пройти

  // ---- шаги и шум -----------------------------------------------------
  var STEP_WALK = 0.42;          // сек между шагами при ходьбе
  var STEP_RUN = 0.28;           // ... при беге
  var STEP_FIRST = 0.12;         // задержка первого шага после старта движения
  var NOISE_WALK = 5;            // радиус шума обычного шага (тайлы)
  var NOISE_RUN = 14;            // ... бега
  var NOISE_SNEAK = 2;           // ... крадучести
  var VOL_STEP_WALK = 0.6;
  var VOL_STEP_RUN = 0.9;
  var VOL_STEP_SNEAK = 0.28;

  // ---- следы на снегу --------------------------------------------------
  var FOOT_DIST = 1.2;           // тайл пути между следами
  var FOOT_DECAY = 90;           // сек до исчезновения следа
  var FOOT_LIMIT = 300;          // максимум следов в мире
  var FOOT_OFFSET = 0.16;        // поперечное смещение «левой/правой ноги»

  // ---- дыхание (выносливость) 0..1 ------------------------------------
  var BREATH_DRAIN = 0.14;       // /с — расход при беге
  var BREATH_REGEN = 0.09;       // /с — восстановление на ходу
  var BREATH_REGEN_IDLE = 0.15;  // /с — восстановление стоя
  var BREATH_REGEN_SLEEP = 0.2;  // /с — восстановление во сне
  var BREATH_SPRINT_MIN = 0.15;  // ниже — бежать нельзя
  var BREATH_GASP = 0.05;        // ниже — задыхается
  var GASP_SPEED_MUL = 0.6;      // множитель скорости при задыхе
  var GASP_SND_EVERY = 3;        // сек между «всхлипами» дыхания
  var GASP_SND_VOL = 0.25;

  // ---- анимация ---------------------------------------------------------
  var ANIM_FPS = 6;              // кадров/с ходьбы (формула из ТЗ)
  var SWING_ANIM_BOOST = 4;      // ускорение анимации при замахе (удар)
  var SLEEP_BREATH_FPS = 1.1;    // «вдох-выдох» спящего, кадров/с

  // ---- морозный пар изо рта ---------------------------------------------
  // На Русском Севере дыхание видно — маленькая, но дорогая деталь:
  // облако пара у лица в мороз, чаще при беге и задыхании. Внутри зданий
  // пара нет. Использует частицу 'steam' из core/fx.js.
  var PUFF_EVERY_IDLE = 1.7;     // сек между «выдохами» в покое
  var PUFF_EVERY_MOVE = 0.85;    // ... на ходу
  var PUFF_EVERY_HARD = 0.55;    // ... при беге/задыхании
  var PUFF_TEMP_MIN = -3;       // °C: теплее — пара не видно
  var PUFF_LIFE = 1.3;           // сек жизни облачка
  var PUFF_RISE = -2.5;          // «антигравитация»: пар поднимается
  var PUFF_Z = 44;               // высота рта над ногами, px

  // ---- сердце ------------------------------------------------------------
  var HEART_HP = 25;             // ниже этого hp сердце стучит в ушах
  var HEART_MIN_IV = 0.75;       // минимальный интервал ударов, сек
  var HEART_MAX_IV = 1.4;        // максимальный (у порога HEART_HP)

  // ---- спасение из препятствий -------------------------------------------
  // Дверь могла закрыться «на нос», сейв — встать внутрь мебели: вместо
  // вечного застревания мягко выталкиваем в ближайшую свободную точку.
  var STUCK_CHECK_EVERY = 0.5;   // сек между проверками
  var STUCK_SPIRAL_MAX = 3.0;    // радиус поиска свободной точки, тайлы

  // ---- урон: fallback (если системы здоровья B1 не подключены) ----------
  var IMMUNE_FRAME = 0.45;       // сек неуязвимости после попадания
  // синхронизировано с ai.js: то же поле p._aiImmuneT, чтобы два fallback'а
  // (ai.js и этот) не вычли урон дважды за одно попадание

  // Русские причины смерти по типу урона (дополняет ai.js, свои формулировки).
  var DEATH_CAUSES = {
    bite: 'растерзан зверем',
    claw: 'растерзан зверем',
    gun: 'застрелен',
    blade: 'зарезан',
    blunt: 'забит насмерть',
    cold: 'замёрз',
    hunger: 'умер от голода',
    thirst: 'умер от жажды',
    fall: 'разбился',
    burn: 'сгорел заживо'
  };

  // Мировые векторы 8 направлений (индекс = WS.M.dir8, см. sprites_player.js):
  //   0:(0,+y) 1:(-x,+y) 2:(-x,0) 3:(-x,-y) 4:(0,-y) 5:(+x,-y) 6:(+x,0) 7:(+x,+y)
  var DIRVEC = [
    [0, 1], [-1, 1], [-1, 0], [-1, -1],
    [0, -1], [1, -1], [1, 0], [1, 1]
  ];

  // ====================================================================
  //  СОСТОЯНИЕ МОДУЛЯ (вне WS.G — в сейв не попадает)
  // ====================================================================

  var myTime = 0;        // наработанное время модуля, сек; копится в том же
                         // темпе, что aiTime в ai.js (используется для общих
                         // кадров неуязвимости — см. IMMUNE_FRAME)
  var footQueue = [];   // очередь следов (для лимита FOOT_LIMIT)
  var FOOT_TILES = null; // кэш множества тайлов «следопригодных» (ленивый)
  var moduleReady = false;

  // ====================================================================
  //  МАЛЫЕ УТИЛИТЫ
  // ====================================================================

  /** Текущее состояние партии (WS.G) или null. */
  function G() { return WS.G || null; }

  /** Игрок (WS.G.player) или null. */
  function P() { var g = WS.G; return (g && g.player) || null; }

  /** Мир (WS.World) или null. */
  function W() { return WS.World || null; }

  /**
   * Мышь — совместимый доступ. CONTRACT.md описывает WS.Input.mouse() как
   * ФУНКЦИЮ, но текущий core/input.js публикует объект. Поддерживаем оба
   * варианта, чтобы модуль не зависел от способа публикации.
   */
  function mouse() {
    var m = WS.Input && WS.Input.mouse;
    if (!m) return { x: 0, y: 0, wx: 0, wy: 0, tx: -1, ty: -1 };
    if (typeof m === 'function') {
      try { return m(); } catch (e) { return { x: 0, y: 0, wx: 0, wy: 0, tx: -1, ty: -1 }; }
    }
    return m;
  }

  /** Мировой угол направления d (0..7). */
  function dirAng(d) {
    var v = DIRVEC[d & 7];
    return Math.atan2(v[1], v[0]);
  }

  /**
   * Подсказка игроку: тост UI (если есть) или плавающий текст над игроком.
   * Показывает обучающую подсказку не чаще одного раза (G.story.hints).
   */
  function hint(msg, onceKey) {
    var g = G();
    if (onceKey) {
      if (!g || !g.story || !g.story.hints) return;      // некуда писать флаг
      if (g.story.hints[onceKey]) return;                 // уже показывали
      g.story.hints[onceKey] = 1;
    }
    if (WS.Ui && WS.Ui.toast) {
      try { WS.Ui.toast(msg, 'info'); return; } catch (e) { /* ниже — текстом */ }
    }
    var p = P();
    if (WS.Fx && WS.Fx.text && p) {
      WS.Fx.text(msg, p.x, p.y - 0.7, { col: '#cfd6df', size: 12, life: 2.2 });
    }
  }

  /** Звук — всегда через WS.Snd (контракт), позиционно относительно игрока. */
  function snd(name, x, y, vol) {
    if (!WS.Snd || !WS.Snd.play) return;
    try { WS.Snd.play(name, { x: x, y: y, vol: vol }); } catch (e) { /* тишина */ }
  }

  /** Направлен ли экранный вектор движения (учитывает и диагонали). */
  function anyMoveKey() {
    return WS.Input.down('up') || WS.Input.down('down') ||
           WS.Input.down('left') || WS.Input.down('right');
  }

  // ====================================================================
  //  КОЛЛИЗИИ
  //
  //  Три источника непроходимости:
  //   1) тайл: isTileBlocked — стены, окна, заборы, ВООБЩЕ вода и VOID;
  //   2) solid-объекты мира в радиусе OBJ_RADIUS (проверяются objsAt по
  //      до четырёх соседним тайлам вокруг точки);
  //   3) живые сущности с hp, кроме игрока, трупов и дропа.
  //  Движение выполняется по осям раздельно (X, затем Y) — скольжение
  //  вдоль препятствий.
  // ====================================================================

  /**
   * Занята ли точка (мировые координаты) для игрока.
   * opts: { ignoreObjects, ignoreEnts, ignoreObj } — тонкая настройка
   * (ignoreObj: не считать конкретный объект, например дверь под ногами).
   */
  function blockedAt(x, y, opts) {
    opts = opts || {};
    var w = W();
    if (!w || !w.tiles) return true;          // мира нет — никуда не идём
    var tx = Math.floor(x), ty = Math.floor(y);

    // 1) тайл (включая воду: WATER в списке isTileBlocked)
    if (w.isTileBlocked(tx, ty)) return true;

    var r = OBJ_RADIUS;
    var r2 = r * r;

    // 2) solid-объекты: до 4 тайлов вокруг точки покрывают радиус 0.45
    if (!opts.ignoreObjects && w.objsAt) {
      var x0 = Math.floor(x - r), x1 = Math.floor(x + r);
      var y0 = Math.floor(y - r), y1 = Math.floor(y + r);
      for (var cy = y0; cy <= y1; cy++) {
        for (var cx = x0; cx <= x1; cx++) {
          var objs = w.objsAt(cx, cy);
          if (!objs || !objs.length) continue;
          for (var i = 0; i < objs.length; i++) {
            var o = objs[i];
            if (!o.solid) continue;                    // двери/следы не мешают
            if (opts.ignoreObj && o === opts.ignoreObj) continue;
            var odx = o.x - x, ody = o.y - y;
            if (odx * odx + ody * ody < r2) return true;
          }
        }
      }
    }

    // 3) живые сущности, кроме игрока (трупы без hp отсеются сами)
    if (!opts.ignoreEnts && w.ents) {
      var p = P();
      var ents = w.ents;
      for (var k = 0; k < ents.length; k++) {
        var e = ents[k];
        if (!e || e === p) continue;
        if (!e.hp || e.hp <= 0 || e.dead) continue;    // трупы проходимы
        if (ENT_SKIP_KINDS[e.kind]) continue;          // дроп и рыба
        if (e.noCollision) continue;                   // спец-сущности
        var edx = e.x - x, edy = e.y - y;
        if (edx * edx + edy * edy < r2) return true;
      }
    }
    return false;
  }

  /**
   * ПУБЛИЧНО: попытаться сдвинуть игрока на (dx, dy) тайлов с учётом
   * коллизий. Оси применяются раздельно: если по X упёрлись — по Y всё
   * равно двигаемся (скольжение). Возвращает { moved, hitX, hitY }.
   * Скорость/рельеф НЕ применяются — вызывающий код передаёт готовый
   * дельта-вектор (используется и собственным тиком, и чужими модулями —
   * например, отбрасывание игрока взрывом).
   */
  function tryMove(dx, dy, opts) {
    var res = { moved: 0, hitX: false, hitY: false };
    var p = P();
    if (!p) return res;
    if (!dx && !dy) return res;

    // ось X
    if (dx) {
      var nx = p.x + dx;
      if (!blockedAt(nx, p.y, opts)) {
        p.x = nx;
        res.moved += Math.abs(dx);
      } else {
        res.hitX = true;
      }
    }
    // ось Y (отдельно — скольжение вдоль стен)
    if (dy) {
      var ny = p.y + dy;
      if (!blockedAt(p.x, ny, opts)) {
        p.y = ny;
        res.moved += Math.abs(dy);
      } else {
        res.hitY = true;
      }
    }
    return res;
  }

  /**
   * Стоимость рельефа в точке (щуп «вперёд» на PROBE_AHEAD, чтобы глубокий
   * снег тормозил ещё до входа в него). Недопустимые значения (Infinity)
   * подменяются тайлом под ногами, затем единицей — защита от деликатных
   * случаев спавна «в стене».
   */
  function terrainCostAt(x, y, p) {
    var w = W();
    if (!w || !w.terrainMoveCost) return 1;
    var c = w.terrainMoveCost(Math.floor(x), Math.floor(y));
    if (!isFinite(c) || c < 1) {
      c = w.terrainMoveCost(Math.floor(p.x), Math.floor(p.y));
      if (!isFinite(c) || c < 1) c = 1;
    }
    return c;
  }

  // ====================================================================
  //  ДВИЖЕНИЕ
  //  Ввод читается ОТНОСИТЕЛЬНО ЭКРАНА и переводится в мировой вектор
  //  через обратную изометрическую матрицу (WS.M.toWorld):
  //    экран (0,-1) [W] -> мир (-1,-1)/32 -> направление (-1,-1)/√2
  //    экран (+1,0) [D] -> мир (+1,-1)/64 -> направление (1,-1)/√2
  //  Так «вверх» на экране остаётся «вверх» при любой камере/зуме.
  // ====================================================================

  /** Экранные оси ввода: ax/ay = -1..1 (уже скомпенсировано «вниз»). */
  function screenAxes() {
    var ax = 0, ay = 0;
    if (WS.Input.down('right')) ax += 1;
    if (WS.Input.down('left')) ax -= 1;
    if (WS.Input.down('down')) ay += 1;
    if (WS.Input.down('up')) ay -= 1;
    return { ax: ax, ay: ay };
  }

  /**
   * Мировой единичный вектор по экранным осям.
   * Возвращает {x, y, len} либо len = 0, если ввода нет.
   */
  function worldMoveVector(ax, ay) {
    if (!ax && !ay) return { x: 0, y: 0, len: 0 };
    var v = WS.M.toWorld(ax, ay);           // экран -> мир (изометрия 2:1)
    var l = Math.sqrt(v.x * v.x + v.y * v.y);
    if (l < 1e-9) return { x: 0, y: 0, len: 0 };
    return { x: v.x / l, y: v.y / l, len: l };
  }

  /**
   * Итоговая скорость, тайлов/с:
   *   base(2.2) × sneak(0.45) × sprint(1.8) × (1/terrainCost, мин 0.3)
   *   × задыхание(0.6) × p.moveMul (крючок для систем B: перелом, боль...)
   */
  function currentSpeed(p, mx, my, sprinting) {
    var sp = (typeof p.speed === 'number' && p.speed > 0) ? p.speed : BASE_SPEED;
    if (p.sneaking) sp *= SNEAK_MUL;
    if (sprinting) sp *= (typeof p.sprintMul === 'number' && p.sprintMul > 0) ? p.sprintMul : SPRINT_MUL;
    if (typeof p.breath === 'number' && p.breath < BREATH_GASP) sp *= GASP_SPEED_MUL;

    // рельеф: щуп вперёд по направлению движения
    var cost = terrainCostAt(p.x + mx * PROBE_AHEAD, p.y + my * PROBE_AHEAD, p);
    var f = 1 / cost;
    if (f < MIN_MOVE_FACTOR) f = MIN_MOVE_FACTOR;   // «минимум 0.3» из ТЗ
    if (f > 1) f = 1;
    sp *= f;

    // крючок для систем (перелом ноги, прожорливый重伤... любые замедления)
    if (typeof p.moveMul === 'number' && p.moveMul > 0) sp *= p.moveMul;
    return sp;
  }

  /**
   * Один шаг перемещения за кадр: возвращает пройденную дистанцию (0 —
   * упёрлись в стену всем корпусом). Обновляет dir и флаги.
   */
  function moveStep(p, mx, my, dt, sprinting) {
    var sp = currentSpeed(p, mx, my, sprinting);
    var step = sp * dt;
    if (step <= 0) return 0;
    var r = tryMove(mx * step, my * step);
    if (r.moved <= 0) {
      p.moving = false;
      return 0;
    }
    p.moving = true;
    // направление — из мирового вектора движения
    p.dir = WS.M.dir8(mx, my);
    return r.moved;
  }

  // ====================================================================
  //  АНИМАЦИЯ
  //  sprFrame = floor(walkT * 6) % 4 при движении (кадры: idle, шаг, idle,
  //  шаг — см. sprites_player.js), 0 при idle. walkT течёт пропорционально
  //  фактической скорости: в крадучести ноги медленнее, в беге — быстрее.
  // ====================================================================

  function updateAnim(p, moving, dt, speedRatio) {
    if (moving) {
      p.walkT = (p.walkT || 0) + dt * (speedRatio > 0 ? speedRatio : 1);
      p.sprFrame = Math.floor(p.walkT * ANIM_FPS) % 4;
    } else {
      p.walkT = 0;
      p.sprFrame = 0;
    }
    // замах оружием (ставит actions.js): короткая быстрая «прокрутка» кадров
    if (p._swingT > 0) {
      p.walkT = (p.walkT || 0) + dt * SWING_ANIM_BOOST;
      p.sprFrame = Math.floor(p.walkT * ANIM_FPS) % 4;
    }
    // выбор спрайта: сон > крадучесть > обычный
    if (p.sleeping) p.sprName = 'player_sleep';
    else if (p.sneaking) p.sprName = 'player_sneak';
    else p.sprName = 'player';
    // тень под игроком (рисует Gfx через WS.Spr.shadow)
    if (p.shadowR === undefined) p.shadowR = 0.38;
  }

  // ====================================================================
  //  ШАГИ И ШУМ
  //  Таймер шага: 0.42 с ходьба, 0.28 с бег. Каждый шаг — звук по типу
  //  тайла + событие 'noise' (слушает ai.js): бег 14, шаг 5, крадучесть 2.
  // ====================================================================

  /** Название звука шага по типу тайла под ногами. */
  function stepSoundFor(t) {
    var w = W();
    if (!w || !w.T) return 'step_snow';
    var T = w.T;
    if (t === T.SNOW_DEEP) return 'snow_step_deep';         // глубокий снег
    if (t === T.FLOOR_WOOD || t === T.FLOOR_TILE ||          // полы в домах
        t === T.FLOOR_CONCRETE || t === T.FLOOR_DIRT ||
        t === T.PORCH || t === T.BRIDGE || t === T.STAIRS) return 'step_wood';
    return 'step_snow';                                       // прочее — снег
  }

  /**
   * Тик таймера шагов. Вызывать только на кадрах с реальным перемещением.
   * moved <= 0.0001 — упёрлись в стену: не топаем на месте.
   */
  function stepTimer(p, moved, dt, sprinting) {
    if (moved <= 0.0001) return;
    if (p._stepT === undefined || p._stepT <= 0) {
      // первый шаг после старта — почти сразу
      if (p._stepT === undefined) { p._stepT = STEP_FIRST; return; }
    }
    p._stepT -= dt;
    if (p._stepT > 0) return;
    p._stepT += sprinting ? STEP_RUN : STEP_WALK;   // с накоплением остатка
    if (p._stepT < 0) p._stepT = sprinting ? STEP_RUN : STEP_WALK;
    footstep(p, sprinting);
  }

  /** Один шаг: звук + шум + статистика. */
  function footstep(p, sprinting) {
    var w = W();
    if (!w) return;
    var t = w.tileAt(Math.floor(p.x), Math.floor(p.y));
    var vol = VOL_STEP_WALK;
    if (sprinting) vol = VOL_STEP_RUN;
    else if (p.sneaking) vol = VOL_STEP_SNEAK;
    snd(stepSoundFor(t), p.x, p.y, vol);
    makeNoise(sprinting ? NOISE_RUN : (p.sneaking ? NOISE_SNEAK : NOISE_WALK));
    var g = G();
    if (g && g.stats) g.stats.stepsWalked = (g.stats.stepsWalked || 0) + 1;
  }

  /**
   * ПУБЛИЧНО: издать шум радиусом r тайлов в позиции игрока.
   * Слушатели: ai.js (слух зверей/бандитов), возможно погода/эхо.
   */
  function makeNoise(r) {
    var p = P();
    if (!p) return;
    if (typeof r !== 'number' || r <= 0) r = NOISE_WALK;
    try {
      WS.Ev.emit('noise', { x: p.x, y: p.y, r: r });
    } catch (e) {
      WS.err('emit noise:', e && e.message);
    }
  }

  // ====================================================================
  //  СЛЕДЫ НА СНЕГУ
  //  Каждые FOOT_DIST тайла пути — объект-след (спрайт 'footprint',
  //  поворот по dir, чередование левой/правой ноги). След попадает в
  //  WS.World.timers = [{o, t}] и распадается через FOOT_DECAY секунд.
  //  Лимит FOOT_LIMIT: старейшие следы снимаются с мира досрочно.
  // ====================================================================

  /** Множество тайлов, на которых остаются следы (ленивая инициализация). */
  function footTiles() {
    if (FOOT_TILES) return FOOT_TILES;
    FOOT_TILES = {};
    var w = W();
    if (w && w.T) {
      var T = w.T;
      // только природные поверхности: снег, земля, лёд-наст не пишем
      FOOT_TILES[T.SNOW] = true;
      FOOT_TILES[T.SNOW_DEEP] = true;
      FOOT_TILES[T.GRASS] = true;
      FOOT_TILES[T.GRASS2] = true;
      FOOT_TILES[T.DIRT] = true;
      FOOT_TILES[T.MUD] = true;
      FOOT_TILES[T.SHORE] = true;
      FOOT_TILES[T.FARMLAND] = true;
      FOOT_TILES[T.GRAVEL] = true;
    }
    return FOOT_TILES;
  }

  /** Накопитель дистанции между следами. */
  function footprints(p, moved) {
    if (moved <= 0.0001) return;
    p._footAcc = (p._footAcc || 0) + moved;
    while (p._footAcc >= FOOT_DIST) {
      p._footAcc -= FOOT_DIST;
      placeFootprint(p);
    }
  }

  /** Поставить один след (левая/правая нога чередуются). */
  function placeFootprint(p) {
    var w = W();
    if (!w || !w.addObject || !w.removeObject) return;
    // на полу/дороге/льду следов не видно
    var t = w.tileAt(Math.floor(p.x), Math.floor(p.y));
    if (!footTiles()[t]) return;

    p._footSide = ((p._footSide || 0) + 1) & 1;      // 0/1 — левая/правая
    // поперечное смещение от направления движения
    var v = DIRVEC[p.dir & 7];
    var side = p._footSide ? 1 : -1;
    var ox = -v[1] * FOOT_OFFSET * side;
    var oy = v[0] * FOOT_OFFSET * side;

    var o = w.addObject({
      x: p.x + ox, y: p.y + oy,
      sprName: 'footprint',        // спрайт сам поворачивается по dir
      sprFrame: p._footSide,
      dir: p.dir & 7,
      solid: false,                // след никого не блокирует
      shadow: false,               // и не отбрасывает тени
      name: 'След',
      footprint: true,
      decay: FOOT_DECAY
    });

    // регистрируем в общем списке таймеров мира
    if (!w.timers) w.timers = [];
    w.timers.push({ o: o, t: FOOT_DECAY });

    // лимит: старейшие следы убираем
    footQueue.push(o);
    while (footQueue.length > FOOT_LIMIT) {
      var old = footQueue.shift();
      if (old) {
        try { w.removeObject(old); } catch (e) { /* уже снят таймером */ }
      }
    }
  }

  /**
   * ТИК 20 (player:decals): распад временных объектов мира.
   * Работает по WS.World.timers — общий механизм «протухающих» декалей
   * (следы здесь, лужи крови — в actions.js). removeObject безопасен и для
   * уже снятых объектов (indexOf вернёт -1).
   */
  function decalsTick(dt) {
    var w = W();
    if (!w || !w.timers) return;
    var arr = w.timers;
    for (var i = arr.length - 1; i >= 0; i--) {
      var tm = arr[i];
      if (!tm || !tm.o) { arr.splice(i, 1); continue; }
      tm.t -= dt;
      if (tm.t <= 0) {
        try { if (w.removeObject) w.removeObject(tm.o); } catch (e) { /* пусто */ }
        arr.splice(i, 1);
      }
    }
  }

  // ====================================================================
  //  ДЫХАНИЕ (выносливость) 0..1
  //  Бег: -0.14/с. Восстановление: +0.09/с на ходу, +0.15/с стоя,
  //  +0.2/с во сне. Ниже 0.15 бежать нельзя; ниже 0.05 — задыхание:
  //  скорость ×0.6 и сиплый звук каждые 3 секунды.
  // ====================================================================

  function updateBreath(p, moving, sprinting, dt) {
    if (typeof p.breath !== 'number') p.breath = 1;
    var b = p.breath;

    if (sprinting) b -= BREATH_DRAIN * dt;            // бег выдыхает
    else if (p.sleeping) b += BREATH_REGEN_SLEEP * dt; // сон восстанавливает
    else if (!moving) b += BREATH_REGEN_IDLE * dt;     // стоим — дышим глубже
    else b += BREATH_REGEN * dt;                       // на ходу — медленнее

    if (b < 0) b = 0;
    if (b > 1) b = 1;
    p.breath = b;

    // задыхание: скорость уже порезана в currentSpeed, здесь — звук+подсказка
    var gasp = b < BREATH_GASP;
    if (gasp) {
      if (!p._gasp) {
        p._gasp = true;
        hint('Дыхание сбито — сбавь темп', 'gasp');
      }
      p._gasT = (p._gasT || 0) - dt;
      if (p._gasT <= 0) {
        p._gasT = GASP_SND_EVERY;
        snd('fall', p.x, p.y, GASP_SND_VOL);
      }
    } else {
      p._gasp = false;
      p._gasT = 0;
    }
  }

  // ====================================================================
  //  ЗИМНИЕ ЭФФЕКТЫ ПЕРСОНАЖА
  //  Пар дыхания и стук сердца — «атмосфера» модуля игрока: работают
  //  поверх любых систем, ни с кем не интегрируются, только читают мир.
  // ====================================================================

  /**
   * Морозный пар изо рта. На улице при температуре ниже PUFF_TEMP_MIN
   * каждые PUFF_EVERY_* секунд у лица рождается облачко 'steam', которое
   * медленно поднимается (отрицательная гравитация частицы). Внутри
   * зданий пара нет; при беге/задыхании дышим чаще.
   */
  function breathPuffs(p, moving, hard, dt) {
    var w = W();
    if (!w || !WS.Fx || !WS.Fx.spawn) return;

    // в доме тепло — рта не видно
    if (w.isInside && w.isInside(p.x, p.y)) return;

    // температура снаружи: без модуля погоды считаем «морозно всегда»
    // (декабрь 1917-го в согласии с сеттингом простит нам это допущение)
    var temp = -10;
    if (WS.Weather && typeof WS.Weather.tempOutside === 'function') {
      temp = WS.Weather.tempOutside();
    }
    if (temp > PUFF_TEMP_MIN) return;            // тепло — пара нет

    var every = moving ? (hard ? PUFF_EVERY_HARD : PUFF_EVERY_MOVE) : PUFF_EVERY_IDLE;
    p._puffT = (p._puffT === undefined ? every * 0.4 : p._puffT) - dt;
    if (p._puffT > 0) return;
    p._puffT = every;

    // рот — по диагонали «вверх по экрану» от ног: мир (-0.35,-0.35)
    var hx = p.x - 0.35;
    var hy = p.y - 0.35;
    try {
      WS.Fx.spawn('steam', hx, hy, {
        z: PUFF_Z,
        vx: 0.05,               // лёгкий снос по миру (как будто ветер)
        vy: 0.05,
        grav: PUFF_RISE,        // отрицательная — пар поднимается
        life: PUFF_LIFE,
        size: 2 + Math.random() * 1.5
      });
    } catch (e) {
      // частицы не критичны: тишина лучше упавшего тика
    }
  }

  /**
   * Стук сердца при тяжёлом ранении (hp < HEART_HP): чем меньше hp,
   * тем чаще и громче. Звук 'heartbeat' позиционный — у «ушей» игрока.
   */
  function heartbeatTick(p, dt) {
    if (typeof p.hp !== 'number' || p.hp >= HEART_HP) {
      p._heartT = 0;
      return;
    }
    var frac = Math.max(0, Math.min(1, p.hp / HEART_HP));   // 0 = при смерти
    var every = HEART_MIN_IV + (HEART_MAX_IV - HEART_MIN_IV) * frac;
    p._heartT = (p._heartT || 0) - dt;
    if (p._heartT > 0) return;
    p._heartT = every;
    snd('heartbeat', p.x, p.y, 0.45 + (1 - frac) * 0.45);
  }

  /**
   * Спасение из препятствий: если сама точка игрока непроходима (дверь
   * прихлопнула, предмет мебели «накрыл» после загрузки сейва), раз в
   * STUCK_CHECK_EVERY секунд ищем спиралью ближайшую свободную точку и
   * переносим игрока туда. Сущности при поиске игнорируем — зверь,
   // прижавший игрока, не «застревание», а совсем другая история.
   */
  function rescueIfStuck(p, dt) {
    p._stuckT = (p._stuckT || 0) + dt;
    if (p._stuckT < STUCK_CHECK_EVERY) return;
    p._stuckT = 0;
    if (!blockedAt(p.x, p.y, { ignoreEnts: true })) return;   // всё хорошо

    // спиральный поиск свободной точки: r от 0.5 до 3, 12 направлений
    for (var r = 0.5; r <= STUCK_SPIRAL_MAX + 0.01; r += 0.5) {
      for (var a = 0; a < 12; a++) {
        var ang = (a / 12) * Math.PI * 2 + r;      // фаза меняется с радиусом
        var nx = p.x + Math.cos(ang) * r;
        var ny = p.y + Math.sin(ang) * r;
        if (!blockedAt(nx, ny, { ignoreEnts: true })) {
          p.x = nx;
          p.y = ny;
          p._stuckT = -1;                           // следующая проверка позже
          WS.warn('player: вытолкнут из препятствия на (' +
                  nx.toFixed(1) + ', ' + ny.toFixed(1) + ')');
          return;
        }
      }
    }
    // совсем зажат (не бывает в валидном мире) — останемся на месте,
    // движение всё равно будет отклонено коллизиями безопасно
  }

  // ====================================================================
  //  СОН
  //  Z — лечь спать: sprName 'player_sleep', медленное «дыхание» кадрами
  //  0/1. Ускорение времени уже реализовано ядром (WS.Time.timeScale = 8
  //  при G.player.sleeping). Пока спим — никакого управления; пробуждение
  //  любой клавишей движения, клавишей Z или от боли (любой урон будит).
  // ====================================================================

  /** Лечь спать. Никаких ограничений по месту — игрок сам решает, где. */
  function trySleep(p) {
    if (!p || p.sleeping) return false;
    p.sleeping = true;
    p.sneaking = false;
    p.moving = false;
    p.sprName = 'player_sleep';
    p.sprFrame = 0;
    p._sleepT = 0;
    var g = G();
    p._sleepFrom = (g && g.time) ? g.time.totalMin : 0;   // для статистики
    hint('Спишь. Любая клавиша движения — подъём', 'sleep');
    return true;
  }

  /**
   * ПУБЛИЧНО: разбудить игрока (используется actions.js, fallback урона,
   * системами). Возвращает true, если игрок действительно спал.
   */
  function wake(p) {
    if (!p || !p.sleeping) return false;
    p.sleeping = false;
    p.sprName = p.sneaking ? 'player_sneak' : 'player';
    p.sprFrame = 0;
    p.walkT = 0;
    p._sleepT = 0;
    // статистика: «ночей» (часов+) сна
    var g = G();
    if (g && g.time && typeof p._sleepFrom === 'number' && g.stats) {
      var mins = g.time.totalMin - p._sleepFrom;
      if (mins >= 60) g.stats.nightsSlept = (g.stats.nightsSlept || 0) + 1;
    }
    p._sleepFrom = null;
    return true;
  }

  /** Кадр сна: анимация дыхания + контроль пробуждения. */
  function sleepTick(p, dt) {
    p._sleepT = (p._sleepT || 0) + dt;
    p.sprName = 'player_sleep';
    p.sprFrame = Math.floor(p._sleepT * SLEEP_BREATH_FPS) & 1;   // вдох-выдох
    p.moving = false;
    // пробуждение любой клавишей движения (по ТЗ)
    if (anyMoveKey()) {
      wake(p);
      return;
    }
  }

  // ====================================================================
  //  УРОН: FALLBACK-ОБРАБОТЧИК
  //  Основной владелец урона игроку — системы здоровья (B-агент, WS.Health).
  //  Если их нет (сборка без systems/), этот обработчик вычитает hp сам —
  //  иначе игрок был бы бессмертен. Регистрация ТОЛЬКО при отсутствии
  //  WS.Health на момент boot'а (systems грузятся раньше entities —
  //  см. scripts/build.py). Двойное применение с fallback'ом ai.js исключено
  //  общими кадрами неуязвимости p._aiImmuneT (время модулей синхронно).
  // ====================================================================

  function onPlayerDamageFallback(d) {
    if (!d) return;
    var g = G();
    if (!g || !g.player || g.dead) return;
    if (g._dmgHooked) return;                    // систему подключили — её дело
    if (typeof WS.Health !== 'undefined') return; // модуль появился позже
    if (d._fallbackApplied) return;              // уже применил другой fallback
    var p = g.player;
    var amount = Math.max(0, Number(d.amount) || 0);
    if (!amount || p.hp === undefined || p.hp <= 0) return;

    // общие кадры неуязвимости с ai.js (его aiTime идёт в том же темпе)
    if (typeof p._aiImmuneT === 'number' && p._aiImmuneT > myTime) return;
    d._fallbackApplied = true;
    p._aiImmuneT = myTime + IMMUNE_FRAME;

    wake(p);                                      // от боли просыпаемся
    p.hp = Math.max(0, p.hp - amount);

    // эффекты: кровь, тряска камеры
    if (WS.Fx && WS.Fx.burst) {
      try { WS.Fx.burst('blood', p.x, p.y, Math.max(4, Math.min(9, 2 + (amount / 6) | 0))); }
      catch (e) { /* пусто */ }
    }
    if (WS.Cam && WS.Cam.kick) {
      try { WS.Cam.kick(Math.min(8, 2 + amount * 0.12)); } catch (e2) { /* пусто */ }
    }

    // смерть — через главный экран (Main.die), не «сам»
    if (p.hp <= 0) {
      if (WS.Main && WS.Main.die) {
        var cause = DEATH_CAUSES[d.type];
        if (!cause && d.src && d.src.kind) cause = DEATH_CAUSES['by_' + d.src.kind];
        WS.Main.die(cause || 'Убит');
      }
    }
  }

  /** Любой урон будит — регистрируется всегда (не зависит от WS.Health). */
  function wakeOnDamage(d) {
    if (!d) return;
    var p = P();
    if (p && p.sleeping) wake(p);
  }

  /** Смерть игрока (событие 'player:die' от Main.die): поза трупа. */
  function onPlayerDie() {
    var p = P();
    if (!p) return;
    p.sleeping = false;
    p.sneaking = false;
    p.moving = false;
    p.sprName = 'player_dead';
    p.sprFrame = 0;
    // источник света гасим (если вдруг горел)
    if (p._light && W() && W().removeLight) {
      try { W().removeLight(p._light); } catch (e) { /* пусто */ }
      p._light = null;
    }
  }

  // ====================================================================
  //  СБРОС / НОРМАЛИЗАЦИЯ СОСТОЯНИЯ
  //  Новая партия или загрузка сейва: у игрока могут отсутствовать
  //  рантайм-поля (старый сейв) — дополняем и гасим транзиентное.
  // ====================================================================

  function normalizePlayer(p) {
    if (!p) return;
    if (!p.inv) p.inv = [];
    if (!p.equip) {
      p.equip = { head: null, torso: null, legs: null, feet: null, hands: null, back: null, hand1: null, hand2: null };
    }
    if (typeof p.breath !== 'number' || p.breath < 0 || p.breath > 1) p.breath = 1;
    if (typeof p.speed !== 'number' || p.speed <= 0) p.speed = BASE_SPEED;
    if (typeof p.dir !== 'number' || p.dir < 0 || p.dir > 7) p.dir = 4;
    if (!p.sprName) p.sprName = 'player';
    if (typeof p.sprFrame !== 'number') p.sprFrame = 0;
    if (typeof p.walkT !== 'number') p.walkT = 0;
    p.moving = false;
    p.sprinting = false;
    // транзиентный свет не переживает сейв — гасим
    if (p._light && W() && W().removeLight) {
      try { W().removeLight(p._light); } catch (e) { /* пусто */ }
    }
    p._light = null;
    p._sleepFrom = null;
    p._stepT = undefined;
    p._footAcc = 0;
    p._footSide = 0;
    p._swingT = 0;
  }

  /** game:start / game:load: чистим модульное состояние и хвосты мира. */
  function onGameReset() {
    footQueue = [];
    myTime = 0;
    moduleReady = true;
    var w = W();
    if (w && w.timers) w.timers.length = 0;   // следы старой партии не нужны
    normalizePlayer(P());
  }

  // ====================================================================
  //  ГЛАВНЫЙ ТИК ИГРОКА (приоритет 60)
  //  Порядок внутри кадра:
  //   0) страховка координат мыши (если тик камеры снят ядром Loop);
  //   1) смерть -> поза трупа, стоп;
  //   2) модальный экран UI -> стоп (дубль проверки input.down/hit);
  //   3) Z: сон/подъём; источник света следует за игроком;
  //   4) сон -> анимация дыхания, пробуждение, дыхание, выход;
  //   5) крадучесть (Ctrl);
  //   6) движение: экранные оси -> мировой вектор -> tryMove по осям;
  //   7) анимация, шаги/шум, следы;
  //   8) дыхание; таймер замаха.
  // ====================================================================

  function playerTick(dt) {
    var g = G();
    if (!g || !g.running || g.dead) return;
    myTime += dt;                       // синхронно с aiTime (см. IMMUNE_FRAME)
    var p = g.player;
    if (!p) return;
    try {
      // 0) мышь: мировой пересчёт мог не выполниться, если тик камеры
      //    был снят ядром после ошибки — дублируем (операция идемпотентна)
      if (WS.Input && WS.Input.updateMouseWorld) {
        try { WS.Input.updateMouseWorld(); } catch (e0) { /* пусто */ }
      }

      // 1) смерть: поза трупа, управление отсутствует
      if (typeof p.hp === 'number' && p.hp <= 0) {
        p.sleeping = false;
        p.moving = false;
        p.sprinting = false;
        if (p.sprName !== 'player_dead') p.sprName = 'player_dead';
        return;
      }

      // 2) модальный экран (уже есть в input.down/hit — дублируем по ТЗ)
      if (WS.Ui && WS.Ui.modal && WS.Ui.modal()) return;

      // 3) сон/подъём по Z
      if (WS.Input.hit('sleep')) {
        if (p.sleeping) wake(p);
        else trySleep(p);
      }

      // источник света (если зажжён actions.js) следует за игроком
      if (p._light) {
        p._light.x = p.x;
        p._light.y = p.y - 0.2;
      }

      // страховка от застревания (дверь закрылась на нос и т.п.)
      rescueIfStuck(p, dt);

      // 4) сон: никакого управления
      if (p.sleeping) {
        sleepTick(p, dt);
        updateBreath(p, false, false, dt);
        return;
      }

      // 5) крадучесть: удержание Ctrl (приоритет выше бега)
      p.sneaking = WS.Input.down('sneak');
      if (p.sneaking && !p._sneakHinted) {
        p._sneakHinted = true;
        hint('Крадешься: медленно и тихо', 'sneak');
      }

      // 6) движение: экранные оси -> мировой вектор
      var sa = screenAxes();
      var mv = worldMoveVector(sa.ax, sa.ay);
      var moving = false;
      var moved = 0;
      var sprinting = false;
      var sp = 0;

      if (mv.len > 0) {
        // бег: Shift + движение + есть дыхание; крадучесть бег отменяет
        var wantSprint = WS.Input.down('sprint');
        sprinting = !!wantSprint && !p.sneaking &&
                    (typeof p.breath !== 'number' || p.breath > BREATH_SPRINT_MIN);
        sp = currentSpeed(p, mv.x, mv.y, sprinting);
        moved = moveStep(p, mv.x, mv.y, dt, sprinting);
        moving = moved > 0;
        if (!moving && wantSprint && !p.sneaking &&
            typeof p.breath === 'number' && p.breath <= BREATH_SPRINT_MIN) {
          hint('Не хватает дыхания бежать', 'nosprint');
        }
      }
      p.sprinting = sprinting && moving;      // фактический статус для HUD/API
      p.moving = moving;

      // 7) анимация: скорость в долях базовой определяет темп ног
      var ratio = 0;
      if (moving && (typeof p.speed === 'number') && p.speed > 0) ratio = sp / p.speed;
      updateAnim(p, moving, dt, ratio);

      if (moving) {
        stepTimer(p, moved, dt, sprinting);   // звук шага + шум
        footprints(p, moved);                 // следы каждые 1.2 тайла
      } else {
        p._stepT = undefined;                  // стоп — таймер шага сброшен
      }

      // таймер замаха оружием (ставит actions.js)
      if (p._swingT > 0) p._swingT -= dt;

      // 8) дыхание
      updateBreath(p, moving, sprinting && moving, dt);

      // 9) зимние эффекты: пар изо рта и стук сердца
      breathPuffs(p, moving, sprinting && moving, dt);
      heartbeatTick(p, dt);
    } catch (err) {
      // тик не должен умирать: Loop удаляет упавшие тики, а нам нужно
      // держать myTime в синхроне с ai.js — глотаем ошибку и пишем в лог
      WS.err('playerTick:', err && err.message);
    }
  }

  // ====================================================================
  //  СОВМЕСТИМОСТЬ МЫШИ (костыль интеграции core)
  //  CONTRACT.md: «WS.Input — ... mouse() -> {x, y, wx, wy, ...}» — функция.
  //  Реализация core/input.js публикует объект. camera.js зовёт функцию —
  //  и его тик падает с TypeError, после чего Loop УДАЛЯЕТ тик камеры
  //  (следствие: нет следования камеры, зума, пересчёта мыши).
  //  Оборачиваем объект в функцию, возвращающую живой объект: оба стиля
  //  доступа продолжат работать, контракт восстановлен.
  // ====================================================================

  function compatMouseFn() {
    var In = WS.Input;
    if (!In) return;
    var m = In.mouse;
    if (!m || typeof m === 'function') return;   // уже функция — делать нечего
    var live = m;
    In.mouse = function () { return live; };
    WS.log('player: WS.Input.mouse опубликован как функция (по CONTRACT.md)');
  }

  // ====================================================================
  //  ОТЛАДКА
  // ====================================================================

  function debugState() {
    var p = P();
    var g = G();
    return {
      pos: p ? { x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 } : null,
      dir: p ? p.dir : -1,
      hp: p ? p.hp : 0,
      breath: p ? Math.round(p.breath * 100) / 100 : 0,
      sneaking: p ? !!p.sneaking : false,
      sprinting: p ? !!p.sprinting : false,
      sleeping: p ? !!p.sleeping : false,
      moving: p ? !!p.moving : false,
      footprints: footQueue.length,
      timers: W() && W().timers ? W().timers.length : 0,
      running: g ? !!g.running : false,
      moduleTime: Math.round(myTime * 100) / 100,
      ready: moduleReady
    };
  }

  /** ПУБЛИЧНО (отладка/тесты): телепорт с проверкой проходимости. */
  function setPos(x, y) {
    var p = P();
    if (!p) return false;
    if (blockedAt(x, y, { ignoreEnts: true })) return false;
    p.x = x;
    p.y = y;
    return true;
  }

  // ====================================================================
  //  САМОТЕСТ (ручная проверка целостности, вызывается из консоли:
  //    WS.Player.selftest()  — возвращает массив строк с итогами)
  //  Проверяет геометрию изометрии, коллизии, API и наличие спрайтов —
  //  всё, что ломается незаметнее всего при правках соседних модулей.
  // ====================================================================

  function selftest() {
    var out = [];
    var pass = 0, fail = 0;
    function ok(name, cond) {
      if (cond) { pass++; out.push('  ok   ' + name); }
      else { fail++; out.push('  FAIL ' + name); }
      return !!cond;
    }
    function near(a, b, eps) {
      return Math.abs(a - b) <= (eps || 0.01);
    }

    // --- геометрия: экранные оси -> мировые вектора (ТЗ) ---
    var vW = worldMoveVector(0, -1);            // клавиша W
    ok('W -> мир (-0.707, -0.707)',
       near(vW.x, -Math.SQRT1_2) && near(vW.y, -Math.SQRT1_2));
    var vD = worldMoveVector(1, 0);             // клавиша D
    ok('D -> мир (+0.707, -0.707)',
       near(vD.x, Math.SQRT1_2) && near(vD.y, -Math.SQRT1_2));
    var vS = worldMoveVector(0, 1);              // клавиша S
    ok('S -> мир (+0.707, +0.707)',
       near(vS.x, Math.SQRT1_2) && near(vS.y, Math.SQRT1_2));
    var vA = worldMoveVector(-1, 0);             // клавиша A
    ok('A -> мир (-0.707, +0.707)',
       near(vA.x, -Math.SQRT1_2) && near(vA.y, Math.SQRT1_2));
    ok('нет ввода -> нулевой вектор', worldMoveVector(0, 0).len === 0);

    // --- направление и анимация ---
    ok('dir8(W-вектор) = 3 (мир СЗ, экран «вверх»)',
       WS.M.dir8(-Math.SQRT1_2, -Math.SQRT1_2) === 3);
    ok('dir8((0,+1)) = 0', WS.M.dir8(0, 1) === 0);

    // --- спрайты игрока (регистрирует sprites_player.js) ---
    var sprOk = WS.Spr && WS.Spr.get;
    ok("спрайт 'player' есть", !!sprOk && !!WS.Spr.get('player', 0, 0));
    ok("спрайт 'player_sneak' есть", !!sprOk && !!WS.Spr.get('player_sneak', 0, 0));
    ok("спрайт 'player_sleep' есть", !!sprOk && !!WS.Spr.get('player_sleep', 0, 0));
    ok("спрайт 'footprint' есть", !!sprOk && !!WS.Spr.get('footprint', 0, 0));

    // --- коллизии ---
    ok('blockedAt вне карты = true', blockedAt(-5, -5));
    var p = P();
    ok('игрок существует', !!p);
    if (p) {
      var sx = p.x, sy = p.y;
      // гигантский сдвиг упрётся в карту/стену — позиция не изменится
      var r = tryMove(999, 0);
      ok('tryMove в стену: hitX, без телепорта', r.hitX === true && p.x === sx);
      p.x = sx; p.y = sy;                     // вернуть как было
      ok('tryMove(0,0) безвреден', tryMove(0, 0).moved === 0);
    }

    // --- сон ---
    ok('wake без сна = false', wake(null) === false);
    if (p) {
      var wasSleep = !!p.sleeping;
      if (!wasSleep) trySleep(p);
      ok('trySleep усыпляет', p.sleeping === true);
      ok('wake пробуждает', wake(p) === true && p.sleeping === false);
    }

    // --- шум: событие не падает без слушателей ---
    var noiseOk = true;
    try { WS.Ev.emit('noise', { x: 0, y: 0, r: 1 }); } catch (e) { noiseOk = false; }
    ok('emit noise не падает', noiseOk);

    out.unshift('player.selftest: ' + pass + ' ок, ' + fail + ' провалено');
    return out;
  }

  /** Снимок состояния игрока для HUD/оверхедов (B/C-агенты). */
  function getState() {
    var p = P();
    if (!p) return null;
    return {
      x: p.x, y: p.y, dir: p.dir,
      hp: p.hp, maxHp: p.maxHp,
      breath: (typeof p.breath === 'number') ? p.breath : 1,
      sneaking: !!p.sneaking,
      sprinting: !!p.sprinting,
      sleeping: !!p.sleeping,
      moving: !!p.moving,
      weapon: (WS.Action && WS.Action.weaponInfo) ? WS.Action.weaponInfo(p).mode : 'fists',
      lightOn: !!p._light,
      reloading: (p._reloadT || 0) > 0
    };
  }

  // ====================================================================
  //  ПУБЛИЧНЫЙ API МОДУЛЯ (для других модулей, по ТЗ)
  //   WS.Player.tryMove(dx, dy, opts)  — сдвиг с коллизиями (скольжение)
  //   WS.Player.isSprinting()          — бежит ли сейчас (для HUD/ИИ)
  //   WS.Player.makeNoise(r)           — шум радиусом r в позиции игрока
  //   WS.Player.wake()                 — разбудить (системы/события)
  //  Дополнительно: isSneaking/isSleeping/breath/blockedAt/setPos/debug.
  // ====================================================================

  WS.def('Player', {
    // по ТЗ
    tryMove: tryMove,
    isSprinting: function () {
      var p = P();
      return !!(p && p.sprinting && !p.sleeping && p.hp > 0);
    },
    makeNoise: makeNoise,
    wake: function () { return wake(P()); },

    // полезные дополнения
    isSneaking: function () {
      var p = P();
      return !!(p && p.sneaking && !p.sleeping);
    },
    isSleeping: function () {
      var p = P();
      return !!(p && p.sleeping);
    },
    breath: function () {
      var p = P();
      return p ? p.breath : 0;
    },
    blockedAt: function (x, y, opts) { return blockedAt(x, y, opts); },
    setPos: setPos,
    normalize: function () { normalizePlayer(P()); },
    debug: debugState,
    getState: getState,
    selftest: selftest,

    // внутренние, открыты для действий (actions.js не должен дублировать)
    wakeInternal: wake,
    hint: hint
  });

  // ====================================================================
  //  BOOT
  //  Выполняется после загрузки всех скриптов (см. ns.js / main.js):
  //   - регистрируем тики (60 — управление, 20 — распад декалей);
  //   - чиним публикацию мыши ДО первого кадра (иначе тик камеры умрёт);
  //   - fallback урона регистрируем ТОЛЬКО если WS.Health нет (по ТЗ;
    //     systems грузятся раньше entities, поэтому проверка честная);
  //   - подписки на события партии/смерти/урона.
  // ====================================================================

  WS.boot(function initPlayer() {
    // совместимость мыши — до старта Loop (первый кадр уже с рабочей камерой)
    compatMouseFn();

    // тики
    WS.tick(DECAL_PRI, decalsTick, 'player:decals');
    WS.tick(TICK_PRI, playerTick, 'player:ctrl');

    // fallback урона игроку: только без систем здоровья (B1/WS.Health)
    if (typeof WS.Health === 'undefined') {
      WS.Ev.on('player:damage', onPlayerDamageFallback);
      WS.log('player: активен fallback урона (WS.Health не найден)');
    }

    // любой урон будит спящего — независимо от наличия систем здоровья
    WS.Ev.on('player:damage', wakeOnDamage);

    // смерть: поза трупа, гашение света
    WS.Ev.on('player:die', onPlayerDie);

    // новая партия / загрузка: сброс модульного состояния
    WS.Ev.on('game:start', onGameReset);
    WS.Ev.on('game:load', onGameReset);
  }, 'player:init');

})();
