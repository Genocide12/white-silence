/**
 * actions.js — ДЕЙСТВИЯ ИГРОКА: атака, выстрел, двери, обыск, подбор,
 * свет (факел/фонарь), перезарядка, выброс предметов + БАЗОВЫЙ инвентарь.
 * Инвентарное ядро (findItem/countItem/consume/give/equipBest) объявлено
 * именно здесь в WS.Action — будущий WS.Inv (B-агент) строится поверх,
 * не дублируя. Движение/анимация/дыхание — entities/player.js (тик 60),
 * этот модуль — тик 61 (та же домена «игрок»).
 * Общие поля WS.G.player между файлами: _swingT (замах), _atkCd, _fireCd,
 * _reloadT (кулдауны), _light (зажжённый источник света), sneaking/sprinting.
 */
(function () {
  'use strict';

  // ====================================================================
  //  КЛАВИШИ ДЕЙСТВИЙ (раскладка — core/input.js)
  // --------------------------------------------------------------------
  //   ЛКМ ......... удар оружием / кулаками / выстрел (по типу в hand1)
  //   ПКМ, E ...... взаимодействие: дверь, контейнер, труп
  //   F ........... зажечь/погасить факел или фонарь в правой руке
  //   Q ........... выбросить предмет из правой руки на пол
  //   R ........... перезарядка огнестрела (3 секунды)
  //
  //  ИЕРАРХИЯ СИСТЕМ (проверки существования — по контракту):
  //   WS.Combat.fire(p, wx, wy) ... полноценный огнестрел (B-агент);
  //                                  здесь — мгновенная трасса-fallback.
  //   WS.Loot.search(o) ........... обыск контейнеров/трупов (B-агент);
  //                                  здесь — заглушка-осмотр.
  //   WS.AI.damageEnt/damageEntity  урон сущностям; fallback — напрямую
  //                                  hp -= dmg + emit('ent:damage').
  //   WS.Health ................... урон игроку; fallback — в player.js.
  // ====================================================================

  // ====================================================================
  //  НАСТРОЙКИ И КОНСТАНТЫ
  // ====================================================================

  var TICK_PRI = 61;              // приоритет тика действий (после player:60)

  /** Последняя трасса выстрела: {x0, y0, x1, y1, hit} — отладка/рендер UI. */
  var lastTrace = null;

  // ---- ближний бой ------------------------------------------------------
  var FIST_DMG = 3;               // урон кулаком (по ТЗ)
  var FIST_RANGE = 0.9;           // дальность кулака, тайлы
  var FIST_ATKSPD = 1.6;          // атак/с кулаками
  var FIST_KNOCK = 8;             // сила отброса (8 × 0.0625 = 0.5 тайла)
  var SECTOR_HALF_ANG = Math.PI / 3;   // сектор удара: 60° от направления
  var SWING_T = 0.15;             // длительность анимации замаха, сек
  var WEAR_PER_HIT = 0.5;         // износ оружия за удар (если есть cond)
  var KNOCK_TILES = 0.0625;       // тайлов отброса на единицу knock
  var DMG_VARIANCE = 0.2;         // разброс урона ±10% (0.9..1.1)

  // ---- стрельба (fallback-трасса) --------------------------------------
  var FIRE_RANGE = 18;            // дальность выстрела, тайлы
  var FIRE_STEP = 0.25;           // шаг трассы, тайлы
  var FIRE_FALLOFF = 0.5;         // на макс. дистанции урон падает до 50%
  var FIRE_CD = 1.15;             // кулдаун между выстрелами, сек
  var TRACE_ENT_R = 0.3;          // радиус захвата цели трассой
  var GUN_NOISE = 60;             // радиус шума выстрела (по ТЗ)
  var GUN_KICK = 3.5;             // тряска камеры от выстрела

  // ---- перезарядка -------------------------------------------------------
  var RELOAD_T = 3;               // сек (по ТЗ)

  // ---- взаимодействие ----------------------------------------------------
  var INTERACT_R = 1.5;           // радиус досягаемости объекта (по ТЗ)
  var DOOR_NOISE = 8;             // шум хлопающей двери (по ТЗ)
  var DOOR_LOCKED_NOISE = 4;      // шум дёрганья запертой
  var DOOR_TRAP_R = 0.75;         // ближе — не закрываем (прихлопнем себя)

  // ---- подбор/дроп --------------------------------------------------------
  var PICKUP_R = 0.6;             // радиус автоподбора (по ТЗ)
  var PICKUP_R2 = PICKUP_R * PICKUP_R;
  var PICKUP_PER_FRAME = 5;       // максимум предметов за кадр (анти-спам)

  // ---- декали -------------------------------------------------------------
  var BLOOD_DECAY = 120;          // сек жизни лужи крови
  var CORPSE_DECAY = 600;         // труп исчезает через 10 минут (fallback)

  // Мировые векторы 8 направлений (как в player.js / sprites_player.js).
  var DIRVEC = [
    [0, 1], [-1, 1], [-1, 0], [-1, -1],
    [0, -1], [1, -1], [1, 0], [1, 1]
  ];

  // Статистика убийств по kind (дублирует карту ai.js — на случай сборки
  // без ИИ; при наличии ИИ статистикой занимается его kill()).
  var KILL_STAT = {
    wolf: 'wolvesKilled', bear: 'bearsKilled', bandit: 'banditsKilled',
    deer: 'animalsHunted', hare: 'animalsHunted', crow: 'animalsHunted'
  };

  // ====================================================================
  //  МАЛЫЕ УТИЛИТЫ
  // ====================================================================

  function G() { return WS.G || null; }
  function P() { var g = WS.G; return (g && g.player) || null; }
  function W() { return WS.World || null; }

  /**
   * Мышь — совместимый доступ (CONTRACT.md объявляет mouse() функцией,
   * реализация core/input.js публикует объект; boot player.js оборачивает
   * его в функцию — здесь терпим оба варианта).
   */
  function mouse() {
    var m = WS.Input && WS.Input.mouse;
    if (!m) return { x: 0, y: 0, wx: 0, wy: 0, tx: -1, ty: -1, leftP: false, rightP: false };
    if (typeof m === 'function') {
      try { return m(); } catch (e) { return { x: 0, y: 0, wx: 0, wy: 0, tx: -1, ty: -1, leftP: false, rightP: false }; }
    }
    return m;
  }

  /** Данные предметов (js/data/items_*.js копируют в WS.Data.items). */
  function itemsTable() {
    return (WS.Data && WS.Data.items) || {};
  }

  /** Определение предмета по id или null. */
  function itemDef(id) {
    if (!id) return null;
    return itemsTable()[id] || null;
  }

  /**
   * Человеческое имя предмета: I18N если словарь подключён, иначе id
   * с подчёркиваниями, заменёнными на пробелы («canned_fish» -> «canned fish»).
   */
  function itemName(id) {
    if (WS.I18N && WS.I18N.t) {
      var key = 'item.' + id + '.name';
      try {
        var s = WS.I18N.t(key);
        if (s && s !== key) return s;      // словарь знает предмет
      } catch (e) { /* идём к заглушке */ }
    }
    return String(id).replace(/_/g, ' ');
  }

  /** Подсказка: тост UI или плавающий текст (дублирует player.js — файлы
   *  самостоятельны, helpers крошечные). */
  function hint(msg) {
    if (WS.Ui && WS.Ui.toast) {
      try { WS.Ui.toast(msg, 'info'); return; } catch (e) { /* текстом ниже */ }
    }
    var p = P();
    if (WS.Fx && WS.Fx.text && p) {
      WS.Fx.text(msg, p.x, p.y - 0.7, { col: '#cfd6df', size: 12, life: 2.0 });
    }
  }

  /** Позиционный звук (всегда через WS.Snd — контракт). */
  function snd(name, x, y, vol) {
    if (!WS.Snd || !WS.Snd.play) return;
    try { WS.Snd.play(name, { x: x, y: y, vol: vol }); } catch (e) { /* тишина */ }
  }

  function dirAng(d) {
    var v = DIRVEC[d & 7];
    return Math.atan2(v[1], v[0]);
  }

  // ====================================================================
  //  БАЗОВЫЙ ИНВЕНТАРЬ (ядро для WS.Inv от B-агента)
  //
  //  Формат слотов инвентаря (CONTRACT.md / core/state.js):
  //    p.inv  = [{ id, count, cond?, data? }, ...]   — стопки;
  //    p.equip = { head, torso, legs, feet, hands, back, hand1, hand2 }
  //             — слоты-объекты { id, cond } без count.
  //  Методы ниже — ЕДИНСТВЕННАЯ точка изменения inv у этого модуля;
  //  B-агенту достаточно вызвать их из своего UI, не трогая массивы.
  // ====================================================================

  /**
   * Найти запись предмета. from: 'inv' (по умолчанию) | 'equip' | 'any'.
   * Возвращает саму запись (живую ссылку!) или null. Для consume/изменений
   * используйте только записи из 'inv' — слоты экипировки однопредметные.
   */
  function findItem(id, from) {
    var p = P();
    if (!p || !id) return null;
    if (!p.inv) p.inv = [];
    from = from || 'inv';
    if (from === 'inv' || from === 'any') {
      for (var i = 0; i < p.inv.length; i++) {
        if (p.inv[i] && p.inv[i].id === id) return p.inv[i];
      }
    }
    if (from === 'equip' || from === 'any') {
      var eq = p.equip || {};
      for (var slot in eq) {
        if (!eq.hasOwnProperty(slot)) continue;
        if (eq[slot] && eq[slot].id === id) return eq[slot];
      }
    }
    return null;
  }

  /** Сколько предметов id лежит в инвентаре (экипировка не считается). */
  function countItem(id) {
    var p = P();
    if (!p || !id || !p.inv) return 0;
    var n = 0;
    for (var i = 0; i < p.inv.length; i++) {
      var it = p.inv[i];
      if (it && it.id === id) n += (typeof it.count === 'number' ? it.count : 1);
    }
    return n;
  }

  /**
   * Потратить n предметов id из инвентаря. Возвращает фактически потраченное
   * (может быть меньше, если не хватало). Пустые записи удаляются, событие
   * 'inv:changed' эмитится только при реальном изменении.
   */
  function consume(id, n) {
    var p = P();
    if (!p || !id) return 0;
    if (!p.inv) p.inv = [];
    n = Math.max(1, Math.floor(n || 1));
    var left = n;
    for (var i = p.inv.length - 1; i >= 0 && left > 0; i--) {
      var it = p.inv[i];
      if (!it || it.id !== id) continue;
      var c = (typeof it.count === 'number' ? it.count : 1);
      if (c <= left) {
        left -= c;
        p.inv.splice(i, 1);
      } else {
        it.count = c - left;
        left = 0;
      }
    }
    var used = n - left;
    if (used > 0) invChanged();
    return used;
  }

  /**
   * Положить n предметов id в инвентарь (со стекованием по def.stack).
   * Возвращает количество добавленного (для некорректного id — 0: предмет
   * без определения складывать нельзя — защита от мусорных дропов).
   */
  function give(id, n) {
    var p = P();
    if (!p || !id) return 0;
    if (!p.inv) p.inv = [];
    var def = itemDef(id);
    if (!def) return 0;                       // неизвестный предмет не берём
    n = Math.max(1, Math.floor(n || 1));
    var stack = (typeof def.stack === 'number' && def.stack > 0) ? def.stack : 1;
    var left = n;

    // дописываем в существующие стеки
    if (stack > 1) {
      for (var i = 0; i < p.inv.length && left > 0; i++) {
        var it = p.inv[i];
        if (!it || it.id !== id) continue;
        var c = (typeof it.count === 'number' ? it.count : 1);
        var room = stack - c;
        if (room > 0) {
          var add = Math.min(room, left);
          it.count = c + add;
          left -= add;
        }
      }
    }
    // новые записи
    while (left > 0) {
      var cnt = Math.min(stack, left);
      p.inv.push({ id: id, count: cnt });
      left -= cnt;
    }
    invChanged();
    return n;
  }

  /** Уведомление об изменении инвентаря (событие контракта). */
  function invChanged() {
    try { WS.Ev.emit('inv:changed', {}); } catch (e) { WS.err('emit inv:changed', e && e.message); }
  }

  /** Уведомление об изменении экипировки. */
  function equipChanged(slot) {
    try { WS.Ev.emit('equip:changed', { slot: slot }); } catch (e) { /* пусто */ }
  }

  /** Ценность одежды для автоснаряжения: тепло + ветер + защита. */
  function clothScore(def) {
    if (!def) return -1;
    return (def.warm || 0) * 0.6 + (def.wind || 0) * 0.2 + (def.def || 0) * 3;
  }

  /** Ценность оружия ближнего боя для автоснаряжения. */
  function meleeScore(def) {
    if (!def || def.ranged || !def.dmg) return -1;
    return def.dmg * (def.atkSpd || 1);
  }

  /**
   * Автоснаряжение лучшим: одежда по слотам (head..back), оружие в СВОБОДНУЮ
   * правую руку. Старая вещь возвращается в инвентарь. Возвращает число
   * произведённых замен. Эмитит 'equip:changed'/'inv:changed'.
   */
  function equipBest() {
    var p = P();
    if (!p) return 0;
    if (!p.inv) p.inv = [];
    if (!p.equip) {
      p.equip = { head: null, torso: null, legs: null, feet: null, hands: null, back: null, hand1: null, hand2: null };
    }
    var changes = 0;
    var SLOTS = ['head', 'torso', 'legs', 'feet', 'hands', 'back'];
    var s, i;

    // 1) одежда: сравниваем с надетым, меняем при строгом перевесе
    for (s = 0; s < SLOTS.length; s++) {
      var slot = SLOTS[s];
      var cur = p.equip[slot];
      var bestScore = cur ? clothScore(itemDef(cur.id)) : -1;
      var bestIdx = -1;
      for (i = 0; i < p.inv.length; i++) {
        var it = p.inv[i];
        if (!it) continue;
        var def = itemDef(it.id);
        if (!def || !def.slots) continue;
        if (def.slots.indexOf(slot) < 0) continue;
        var sc = clothScore(def);
        if (sc > bestScore) { bestScore = sc; bestIdx = i; }
      }
      if (bestIdx >= 0) {
        var chosen = p.inv.splice(bestIdx, 1)[0];
        if (cur) p.inv.push(cur);       // старую — в сумку
        p.equip[slot] = chosen;
        changes++;
        equipChanged(slot);
      }
    }

    // 2) оружие ближнего боя — только в пустую hand1
    if (!p.equip.hand1) {
      var wIdx = -1, wScore = 0;
      for (i = 0; i < p.inv.length; i++) {
        var w = p.inv[i];
        if (!w) continue;
        var wsc = meleeScore(itemDef(w.id));
        if (wsc > wScore) { wScore = wsc; wIdx = i; }
      }
      if (wIdx >= 0) {
        p.equip.hand1 = p.inv.splice(wIdx, 1)[0];
        changes++;
        equipChanged('hand1');
      }
    }

    if (changes > 0) invChanged();
    return changes;
  }

  // ====================================================================
  //  ОРУЖИЕ: ЧТО В РУКЕ
  //  Классификация предмета в equip.hand1:
  //    ranged — def.ranged === true (нужен def.ammo);
  //    melee  — def.dmg > 0 и не ranged (топор, нож, копьё, факел...);
  //    fists  — всё остальное (включая пустую руку и фонарь).
  // ====================================================================

  /**
   * Сводка о текущем оружии. Возвращает
   *   { mode: 'melee'|'ranged'|'fists', slot, def,
   *     dmg, range, atkSpd, knock, ammo }
   * Параметры кулаков — из констант модуля.
   */
  function weaponInfo(p) {
    p = p || P();
    var slot = (p && p.equip) ? p.equip.hand1 : null;
    var def = slot ? itemDef(slot.id) : null;
    if (def && def.ranged) {
      return { mode: 'ranged', slot: slot, def: def, ammo: def.ammo || null,
               dmg: def.dmg || 20, range: FIRE_RANGE, atkSpd: 1, knock: 2 };
    }
    if (def && def.dmg > 0) {
      return { mode: 'melee', slot: slot, def: def, ammo: null,
               dmg: def.dmg, range: def.range || 1.0,
               atkSpd: def.atkSpd || 1.1, knock: def.knock || 3 };
    }
    return { mode: 'fists', slot: null, def: null, ammo: null,
             dmg: FIST_DMG, range: FIST_RANGE, atkSpd: FIST_ATKSPD, knock: FIST_KNOCK };
  }

  // ====================================================================
  //  УРОН СУЩНОСТЯМ
  //  Приоритет: WS.AI.damageEnt / WS.AI.damageEntity (единая точка ИИ —
  //  статы, угрозы, запах крови). Fallback: прямой hp -= dmg и
  //  emit('ent:damage', {applied: true}) — пометка applied защищает от
  //  повторного применения чужим обработчиком (ai.js слушает это событие).
  // ====================================================================

  function applyDamage(e, dmg, by) {
    if (!e || typeof e.hp !== 'number' || e.hp <= 0 || e.dead) return false;
    dmg = Math.max(0, dmg);
    if (!dmg) return false;
    var A = WS.AI;
    if (A && typeof (A.damageEnt || A.damageEntity) === 'function') {
      try {
        (A.damageEnt || A.damageEntity)(e, dmg, by);
        return true;
      } catch (err) {
        WS.err('AI.damageEnt:', err && err.message);
        // падение ИИ не должно отменять удар — идём в fallback ниже
      }
    }
    // fallback: своими руками
    e.hp -= dmg;
    try { WS.Ev.emit('ent:attack', { src: by, dst: e, dmg: dmg }); } catch (e2) { /* пусто */ }
    try { WS.Ev.emit('ent:damage', { ent: e, dmg: dmg, by: by, applied: true }); }
    catch (err2) { WS.err('emit ent:damage:', err2 && err2.message); }
    if (WS.Fx && WS.Fx.burst) {
      try { WS.Fx.burst('blood', e.x, e.y, Math.max(3, Math.min(8, 2 + (dmg / 8) | 0))); }
      catch (e3) { /* пусто */ }
    }
    if (e.hp <= 0) killEnt(e, by);
    else if (typeof e.onDamaged === 'function') {
      try { e.onDamaged(dmg, by); } catch (e4) { WS.err('onDamaged:', e4 && e4.message); }
    }
    return true;
  }

  /**
   * Смерть сущности (fallback без ИИ): флаги, статистика, события,
   * труп-объект (спрайт 'corpse_generic' из sprites_player.js) и лужа
   * крови ('blood_pool') с распадом через WS.World.timers.
   * При живом ИИ эту работу делает его kill() — здесь только страховка.
   */
  function killEnt(e, by) {
    if (!e || e.dead) return;
    var w = W();
    e.dead = true;
    e.state = 'dead';
    e.moving = false;
    var g = G();
    var byPlayer = !!(by && (by.kind === 'player' || by.id === 'player'));
    if (g && g.stats && byPlayer && e.kind && KILL_STAT[e.kind]) {
      g.stats[KILL_STAT[e.kind]] = (g.stats[KILL_STAT[e.kind]] || 0) + 1;
    }
    try { WS.Ev.emit('ent:kill', { ent: e, by: by }); } catch (err) { /* пусто */ }

    // труп как объект мира: можно обыскать, когда появится Loot (B-агент);
    // спрайт corpse_generic — 2 варианта (рука из-под снега)
    if (w && w.addObject) {
      var corpse = w.addObject({
        x: e.x, y: e.y,
        sprName: 'corpse_generic',
        sprFrame: Math.random() < 0.5 ? 0 : 1,
        solid: false,
        shadow: false,
        name: 'Труп',
        corpse: true,
        container: 'corpse_' + (e.kind || 'generic'),
        decay: CORPSE_DECAY
      });
      if (!w.timers) w.timers = [];
      w.timers.push({ o: corpse, t: CORPSE_DECAY });
    }
    bloodDecal(e.x, e.y);

    if (w && w.removeEnt) {
      try { w.removeEnt(e); } catch (err2) { WS.err('removeEnt:', err2 && err2.message); }
    }
  }

  /** Лужа крови: 3 стадии роста, распад через WS.World.timers (тик 20). */
  function bloodDecal(x, y) {
    var w = W();
    if (!w || !w.addObject) return;
    var o = w.addObject({
      x: x, y: y,
      sprName: 'blood_pool',
      sprFrame: Math.floor(Math.random() * 3) & 3,
      solid: false,
      shadow: false,
      name: 'Кровь',
      decay: BLOOD_DECAY
    });
    if (!w.timers) w.timers = [];
    w.timers.push({ o: o, t: BLOOD_DECAY });
  }

  /**
   * Отбросить сущность от игрока: e сдвигается на dist тайлов по направлению
   * ang. Стена по пути гасит импульс (проверяем тайл; объекты не проверяем —
   * сущности в изометрии проходят «сквозь» мебель, это допустимо для ИИ).
   */
  function knockback(e, ang, dist) {
    if (!e || !(dist > 0)) return;
    var w = W();
    if (!w) return;
    var dx = Math.cos(ang) * dist;
    var dy = Math.sin(ang) * dist;
    var nx = e.x + dx, ny = e.y + dy;
    if (w.isTileBlocked(Math.floor(nx), Math.floor(ny))) {
      nx = e.x + dx * 0.5;
      ny = e.y + dy * 0.5;
      if (w.isTileBlocked(Math.floor(nx), Math.floor(ny))) return;
    }
    e.x = nx;
    e.y = ny;
  }

  /** Износ оружия: cond -= 0.5 за удар, только если поле существует. */
  function wearWeapon(slot) {
    if (!slot || typeof slot.cond !== 'number') return;
    slot.cond = Math.max(0, slot.cond - WEAR_PER_HIT);
    // поломку (cond -> 0) решает система предметов B-агента: здесь только
    // честный износ, чтобы не ломать чужую механику дублированием
  }

  /**
   * Сущности в секторе удара: дистанция <= radius от игрока И направление
   * на цель в пределах SECTOR_HALF_ANG (60°) от направления взгляда dir.
   * Идём прямым проходом по World.ents — пространственный хэш мира не
   * отслеживает перемещения сущностей (см. world.js), массив точен всегда.
   */
  function sectorScan(p, radius) {
    var out = [];
    var w = W();
    if (!w || !w.ents) return out;
    var face = dirAng(p.dir);
    var r2 = radius * radius;
    for (var i = 0; i < w.ents.length; i++) {
      var e = w.ents[i];
      if (!e || e === p) continue;
      if (!e.hp || e.hp <= 0 || e.dead) continue;      // трупы не бьём
      var dx = e.x - p.x, dy = e.y - p.y;
      if (dx * dx + dy * dy > r2) continue;
      var ang = Math.atan2(dy, dx);
      if (Math.abs(WS.M.angDiff(face, ang)) > SECTOR_HALF_ANG) continue;
      out.push(e);
    }
    return out;
  }

  /** Первая сущность с hp в круге r вокруг точки (для трассы выстрела). */
  function entAt(x, y, r, p) {
    var w = W();
    if (!w || !w.ents) return null;
    var r2 = r * r;
    for (var i = 0; i < w.ents.length; i++) {
      var e = w.ents[i];
      if (!e || e === p) continue;
      if (!e.hp || e.hp <= 0 || e.dead) continue;
      var dx = e.x - x, dy = e.y - y;
      if (dx * dx + dy * dy <= r2) return e;
    }
    return null;
  }

  // ====================================================================
  //  БЛИЖНИЙ БОЙ (ЛКМ с melee/кулаками)
  //  Удар: кулдаун 1/atkSpd; замах 0.15 с (анимация в player.js);
  //  цели — ВСЕ сущности в секторе 60° на дистанции range + 0.5;
  //  урон с разбросом ±10%; отброс knock × 0.0625 тайла; звук 'hit_flesh';
  //  тряска камеры 1.5; износ оружия cond -= 0.5.
  // ====================================================================

  function meleeAttack(p, wi) {
    var m = mouse();
    // повернуться к цели (к курсору) — сектор считается от взгляда
    var ux = m.wx - p.x, uy = m.wy - p.y;
    if (ux || uy) p.dir = WS.M.dir8(ux, uy);

    p._swingT = SWING_T;                      // замах (анимация в player.js)
    p._atkCd = 1 / (wi.atkSpd || 1.1);         // кулдаун 1/atkSpd

    var targets = sectorScan(p, (wi.range || 1) + 0.5);
    if (!targets.length) {
      // промах: лёгкий толчок камеры, звук не нужен (в audio нет «свиста»)
      if (WS.Cam && WS.Cam.kick) {
        try { WS.Cam.kick(0.4); } catch (e) { /* пусто */ }
      }
      return 0;
    }

    var total = 0;
    for (var i = 0; i < targets.length; i++) {
      var t = targets[i];
      var dmg = wi.dmg * (1 - DMG_VARIANCE / 2 + Math.random() * DMG_VARIANCE);
      var ang = Math.atan2(t.y - p.y, t.x - p.x);
      applyDamage(t, dmg, p);
      knockback(t, ang, (wi.knock || 3) * KNOCK_TILES);
      total += dmg;
    }

    snd('hit_flesh', p.x, p.y, 0.9);
    if (WS.Cam && WS.Cam.kick) {
      try { WS.Cam.kick(1.5); } catch (e2) { /* пусто */ }
    }
    wearWeapon(wi.slot);
    // шум драки: ближний бой слышен недалеко
    try { WS.Ev.emit('noise', { x: p.x, y: p.y, r: 4 }); } catch (e3) { /* пусто */ }
    return total;
  }

  // ====================================================================
  //  ОГНЕСТРЕЛ (ЛКМ с ranged)
  //  Если есть WS.Combat (B-агент) — вся баллистика у него. Иначе —
  //  fallback-трасса: мгновенная линия шагами по 0.25 тайла до 18 тайлов,
  //  первая сущность с hp получает урон с падением до 50% на дистанции.
  //  Патроны: consume(ammo, 1). Перезарядка R (3 с, звук 'reload').
  // ====================================================================

  /** Выстрел: основной вход (вызывается из actionTick по ЛКМ). */
  function fireWeapon(p, wi) {
    var m = mouse();

    // полноценная боевая система подключена — делегируем
    if (WS.Combat && typeof WS.Combat.fire === 'function') {
      try {
        WS.Combat.fire(p, m.wx, m.wy);
        return true;
      } catch (err) {
        WS.err('Combat.fire:', err && err.message);
        // продолжаем fallback-трассой — выстрел не должен пропасть
      }
    }

    // патроны: consume(ammo, 1) — по ТЗ, на каждый выстрел
    var ammoId = wi.ammo;
    if (!ammoId || countItem(ammoId) < 1) {
      snd('error', p.x, p.y, 0.5);
      if (WS.Fx && WS.Fx.text) WS.Fx.text('Нет патронов', p.x, p.y - 0.6, { col: '#d8a0a0' });
      return false;
    }
    consume(ammoId, 1);
    p._fireCd = FIRE_CD;

    // повернуться к цели
    var ux = m.wx - p.x, uy = m.wy - p.y;
    if (ux || uy) p.dir = WS.M.dir8(ux, uy);

    fireTrace(p, m.wx, m.wy, wi.def);

    // звук, шум, тряска, дым у дула — по ТЗ. Радиус шума берём из
    // определения оружия (def.noise, шкала 0..110): винтовка 100 -> 60
    // (в точности по ТЗ), лук 8 -> 12 (тихий). Без поля — 60.
    var noiseR = GUN_NOISE;
    if (wi.def && typeof wi.def.noise === 'number' && wi.def.noise > 0) {
      noiseR = Math.max(12, Math.round(wi.def.noise * 0.6));
    }
    snd('gunshot', p.x, p.y, 1.0);
    try { WS.Ev.emit('noise', { x: p.x, y: p.y, r: noiseR }); } catch (e) { /* пусто */ }
    if (WS.Cam && WS.Cam.kick) {
      try { WS.Cam.kick(GUN_KICK); } catch (e2) { /* пусто */ }
    }
    if (WS.Fx && WS.Fx.burst) {
      var a = Math.atan2(m.wy - p.y, m.wx - p.x);
      try { WS.Fx.burst('smoke', p.x + Math.cos(a) * 0.5, p.y + Math.sin(a) * 0.5, 4, { life: 0.5 }); }
      catch (e3) { /* пусто */ }
    }
    return true;
  }

  /**
   * Fallback-трасса выстрела: мгновенная линия от игрока к (tx, ty),
   * шаг FIRE_STEP, до FIRE_RANGE тайлов. Стена обрывает трассу; первая
   * сущность с hp в радиусе TRACE_ENT_R получает урон с падением по
   * дистанции (на макс. дальности — 50% от базового урона) и лёгкий
   * отброс. Возвращает {hit, x, y} — точку конца трассы.
   */
  function fireTrace(p, tx, ty, def) {
    var w = W();
    if (!w) return { hit: null, x: p.x, y: p.y };

    var dx = tx - p.x, dy = ty - p.y;
    var d = Math.sqrt(dx * dx + dy * dy);
    if (d < 0.01) {
      // цели нет — стреляем по взгляду
      var v = DIRVEC[p.dir & 7];
      dx = v[0]; dy = v[1]; d = 1;
    }
    var ux = dx / d, uy = dy / d;
    if (d > FIRE_RANGE) d = FIRE_RANGE;       // ограничение дальности

    var base = (def && def.dmg) ? def.dmg : 30;
    var hit = null, hitD = 0;
    var t, x, y;
    var stepIdx = 0;

    for (t = FIRE_STEP; t <= d; t += FIRE_STEP) {
      x = p.x + ux * t;
      y = p.y + uy * t;
      // редкие дымки-трассеры вдоль линии — «пуле́т» читается глазом
      if ((stepIdx++ & 3) === 0 && WS.Fx && WS.Fx.spawn) {
        try {
          WS.Fx.spawn('smoke', x, y, { z: 14, life: 0.3, size: 2, grav: -1 });
        } catch (eTr) { /* частицы не критичны */ }
      }
      // стена/скала останавливает пулю
      if (w.isTileBlocked(Math.floor(x), Math.floor(y))) {
        // попадание в стену — сноп снега/пыли
        if (WS.Fx && WS.Fx.burst) {
          try { WS.Fx.burst('snow', x - ux * FIRE_STEP * 0.5, y - uy * FIRE_STEP * 0.5, 4, { life: 0.4 }); }
          catch (e) { /* пусто */ }
        }
        lastTrace = { x0: p.x, y0: p.y, x1: x, y1: y, hit: null };
        return { hit: null, x: x, y: y };
      }
      var e = entAt(x, y, TRACE_ENT_R, p);
      if (e) { hit = e; hitD = t; break; }
    }

    var endX = p.x + ux * d, endY = p.y + uy * d;
    if (hit) {
      // падение урона по дистанции: до 50% на FIRE_RANGE
      var dmg = Math.max(1, Math.round(base * (1 - FIRE_FALLOFF * (hitD / FIRE_RANGE))));
      applyDamage(hit, dmg, p);
      var ang = Math.atan2(hit.y - p.y, hit.x - p.x);
      knockback(hit, ang, 0.3);
      endX = hit.x; endY = hit.y;
      if (WS.Fx && WS.Fx.burst) {
        try { WS.Fx.burst('spark', endX, endY, 3, { life: 0.3 }); } catch (e2) { /* пусто */ }
      }
    } else if (WS.Fx && WS.Fx.burst) {
      // пуля ушла «в молоко» — дымок в точке конца
      try { WS.Fx.burst('smoke', endX, endY, 3, { life: 0.6 }); } catch (e3) { /* пусто */ }
    }
    lastTrace = { x0: p.x, y0: p.y, x1: endX, y1: endY, hit: hit || null };
    return { hit: hit, x: endX, y: endY };
  }

  // ====================================================================
  //  ПЕРЕЗАРЯДКА (R)
  //  Базовая модель: 3 секунды занятости (звук 'reload' в начале),
  //  выстрел на это время заблокирован. Полный учёт магазина/обоймы —
  //  в WS.Combat (B-агент); здесь — ритуал и блокировка по ТЗ.
  // ====================================================================

  function tryReload() {
    var p = P();
    if (!p) return false;
    if ((p._reloadT || 0) > 0) return false;         // уже перезаряжаем
    var wi = weaponInfo(p);
    if (wi.mode !== 'ranged') return false;           // не огнестрел
    if (!wi.ammo || countItem(wi.ammo) < 1) {
      snd('error', p.x, p.y, 0.5);
      if (WS.Fx && WS.Fx.text) WS.Fx.text('Нет патронов', p.x, p.y - 0.6, { col: '#d8a0a0' });
      return false;
    }
    p._reloadT = RELOAD_T;
    snd('reload', p.x, p.y, 0.9);
    return true;
  }

  /** Завершение перезарядки (вызывается из actionTick при обнулении). */
  function reloadDone(p) {
    snd('click', p.x, p.y, 0.5);
    if (WS.Fx && WS.Fx.text) {
      WS.Fx.text('Заряжено', p.x, p.y - 0.6, { col: '#b8d0a8', life: 1.2 });
    }
  }

  // ====================================================================
  //  ВЗАИМОДЕЙСТВИЕ (ПКМ / E)
  //  Цель: объект под курсором (WS.World.objAt(mouse.tx, mouse.ty)),
  //  досягаемый в радиусе 1.5, ИЛИ ближайший интерактивный объект рядом
  //  с игроком (дверь/контейнер, радиус 1.5). Двери-тайлы без объекта
  //  материализуются лениво, если спрайты дверей уже определены.
  // ====================================================================

  /**
   * Найти цель взаимодействия. Возвращает объект мира или null.
   * Приоритет: под курсором -> рядом с игроком -> дверь-тайл под курсором.
   */
  function interactTarget(p) {
    var w = W();
    if (!w) return null;
    var m = mouse();

    // 1) объект прямо под курсором, если дотягиваемся
    var o = null;
    if (m.tx >= 0 && m.ty >= 0 && w.inB && w.inB(m.tx, m.ty)) {
      o = w.objAt(m.tx, m.ty);
    } else {
      o = w.objAt(m.tx, m.ty);
    }
    if (o && WS.M.dist(p.x, p.y, o.x, o.y) <= INTERACT_R) return o;

    // 2) ближайший интерактивный объект в радиусе 1.5 вокруг игрока
    var best = null, bd = INTERACT_R;
    var ptx = Math.floor(p.x), pty = Math.floor(p.y);
    for (var cy = pty - 2; cy <= pty + 2; cy++) {
      for (var cx = ptx - 2; cx <= ptx + 2; cx++) {
        var list = w.objsAt(cx, cy);
        if (!list || !list.length) continue;
        for (var i = 0; i < list.length; i++) {
          var c = list[i];
          if (!c.door && !c.container) continue;    // только интерактив
          var d = WS.M.dist(p.x, p.y, c.x, c.y);
          if (d <= bd) { bd = d; best = c; }
        }
      }
    }
    if (best) return best;

    // 3) дверь-тайл (T.DOOR) без объекта: ленивая материализация
    if (!o && m.tx >= 0 && m.ty >= 0) {
      var t = w.tileAt(m.tx, m.ty);
      if (w.T && t === w.T.DOOR &&
          WS.M.dist(p.x, p.y, m.tx + 0.5, m.ty + 0.5) <= INTERACT_R) {
        return lazyDoor(m.tx, m.ty);
      }
    }
    return null;
  }

  /**
   * Дверь-тайл без объекта-двери: создать объект, ЕСЛИ спрайты дверей
   * уже определены чьим-то модулем ('door_obj' в WS.Spr.specs). Без
   * спрайта невидимый solid-блокер превратил бы проём в ловушку —
   * ограничиваемся скрипом двери (тайл проходим).
   * Возвращает объект-дверь (уже создан, закрыт) или null.
   */
  function lazyDoor(tx, ty) {
    var w = W();
    if (!w || !w.addObject) return null;
    var specs = (WS.Spr && WS.Spr.specs) ? WS.Spr.specs() : null;
    if (!specs || !specs['door_obj']) {
      snd('door', tx + 0.5, ty + 0.5, 0.6);
      try { WS.Ev.emit('noise', { x: tx + 0.5, y: ty + 0.5, r: DOOR_NOISE }); } catch (e) { /* пусто */ }
      return null;
    }
    return w.addObject({
      x: tx + 0.5, y: ty + 0.5,
      sprName: 'door_obj',
      solid: true,                // закрытая дверь блокирует тайл
      door: true,
      open: false,
      shadow: false,
      name: 'Дверь'
    });
  }

  /**
   * Дверь: открыть/закрыть. open = !open, solid = !open, спрайт
   * door_obj/door_open, звук 'door' / 'door_locked' (если locked),
   * шум r = 8. Закрытие при стоящем в проёме игроке запрещено — иначе
   * заблокируем сами себя. Взлом запертой — позже (сила/лом, B-агент).
   * Возвращает true, если состояние двери изменилось.
   */
  function toggleDoor(o) {
    var p = P();
    var w = W();
    if (!o || !o.door) return false;

    // заперто: только звук и дёрганье (шум меньше — некому слышать)
    if (o.locked && !o.open) {
      snd('door_locked', o.x, o.y, 0.9);
      hint('Заперто');
      try { WS.Ev.emit('noise', { x: o.x, y: o.y, r: DOOR_LOCKED_NOISE }); } catch (e) { /* пусто */ }
      return false;
    }

    var wantOpen = !o.open;

    // не прихлопнуть себя: игрок в опасной близости к полотну
    if (!wantOpen && p && WS.M.dist(p.x, p.y, o.x, o.y) < DOOR_TRAP_R) {
      hint('Кто-то стоит в проёме');
      return false;
    }

    o.open = wantOpen;
    o.solid = !o.open;
    o.sprName = o.open ? 'door_open' : 'door_obj';

    // состояние дверей переживает сейв (World.serialize -> doorState)
    if (w) {
      w.doorState = w.doorState || {};
      w.doorState[o.id] = o.open ? 1 : 0;
    }

    snd('door', o.x, o.y, 0.9);
    try { WS.Ev.emit('noise', { x: o.x, y: o.y, r: DOOR_NOISE }); } catch (e2) { /* пусто */ }
    return true;
  }

  /**
   * Обыск контейнера/трупа. Основная система — WS.Loot.search (B-агент):
   * ленивая генерация содержимого по o.container (таблицы WS.Data.loot),
   * перенос в инвентарь, пометка looted. Без системы — заглушка-осмотр,
   * чтобы кнопка не молчала и не падала.
   */
  function searchContainer(o) {
    if (!o || !o.container) return false;
    if (WS.Loot && typeof WS.Loot.search === 'function') {
      try {
        return !!WS.Loot.search(o);
      } catch (err) {
        WS.err('Loot.search:', err && err.message);
        return false;
      }
    }
    // fallback: системы лута нет
    snd('click', o.x, o.y, 0.6);
    hint((o.name ? o.name + ': ' : '') + 'пусто');
    return false;
  }

  /** Диспетчер взаимодействия по типу объекта. */
  function doInteract(p) {
    var o = interactTarget(p);
    if (!o) return false;
    if (o.door) return toggleDoor(o);
    if (o.container) return searchContainer(o);
    // прочее: просто осмотр
    hint(o.name || 'Ничего особенного');
    snd('click', o.x, o.y, 0.4);
    return false;
  }

  // ====================================================================
  //  ПРЕДМЕТЫ НА ПОЛУ: ДРОП И АВТОПОДБОР
  //  Дроп — сущность {kind:'drop', itemId, count, cond, sprName:
  //  'drop_generic'} либо объект мира с полем drop. Всё в радиусе 0.6
  //  подбирается автоматически: give + текст «+ Имя» + звук 'pickup'.
  // ====================================================================

  /**
   * Разобрать дроп любой формы в {id, count, cond} или null.
   * Поддерживаемые формы (на случай формата B-агента):
   *   ent: {kind:'drop', itemId, count, cond} | {drop:{id,count,cond}}
   *   obj: {drop:'bread'} | {drop:{id:'bread', count:2}}
   */
  function parseDrop(e) {
    if (!e) return null;
    var d = e.drop;
    if (typeof d === 'string') return { id: d, count: 1, cond: undefined };
    if (d && typeof d === 'object' && d.id) {
      return { id: d.id, count: d.count || 1, cond: d.cond };
    }
    if (e.itemId) {
      return { id: e.itemId, count: e.count || 1, cond: e.cond };
    }
    if (e.item && typeof e.item === 'string') {
      return { id: e.item, count: 1, cond: undefined };
    }
    return null;
  }

  /** Эффект подбора: плавающий текст и звук. */
  function pickupFx(dr, x, y) {
    var label = '+ ' + itemName(dr.id) + (dr.count > 1 ? ' ×' + dr.count : '');
    if (WS.Fx && WS.Fx.text) {
      try { WS.Fx.text(label, x, y, { col: '#cfe0d0', life: 1.4 }); } catch (e) { /* пусто */ }
    }
    snd('pickup', x, y, 0.7);
    try { WS.Ev.emit('item:picked', { id: dr.id, count: dr.count }); } catch (e2) { /* пусто */ }
  }

  /**
   * Автоподбор: раз в кадр, максимум PICKUP_PER_FRAME предметов.
   * Сущности-дропы удаляются из мира, объекты-дропы — removeObject.
   */
  function autoPickup(p) {
    var w = W();
    if (!w) return;
    var picked = 0;

    // 1) сущности kind 'drop' (и любые с полем drop)
    if (w.ents) {
      for (var i = w.ents.length - 1; i >= 0 && picked < PICKUP_PER_FRAME; i--) {
        var e = w.ents[i];
        if (!e || e === p) continue;
        if (e.kind !== 'drop' && !e.drop) continue;
        var dx = e.x - p.x, dy = e.y - p.y;
        if (dx * dx + dy * dy > PICKUP_R2) continue;
        var dr = parseDrop(e);
        if (!dr || !dr.id || !itemDef(dr.id)) continue;   // мусор не трогаем
        if (give(dr.id, dr.count || 1) <= 0) continue;    // не влезло/нет def
        pickupFx(dr, e.x, e.y);
        try { w.removeEnt(e); } catch (err) { WS.err('removeEnt(drop):', err && err.message); }
        picked++;
      }
    }

    // 2) объекты мира с полем drop (тайл игрока и соседи)
    var ptx = Math.floor(p.x), pty = Math.floor(p.y);
    for (var cy = pty - 1; cy <= pty + 1 && picked < PICKUP_PER_FRAME; cy++) {
      for (var cx = ptx - 1; cx <= ptx + 1 && picked < PICKUP_PER_FRAME; cx++) {
        var list = w.objsAt(cx, cy);
        if (!list || !list.length) continue;
        for (var k = 0; k < list.length && picked < PICKUP_PER_FRAME; k++) {
          var o = list[k];
          if (!o || !o.drop || o.solid) continue;         // мебель не собираем
          var odx = o.x - p.x, ody = o.y - p.y;
          if (odx * odx + ody * ody > PICKUP_R2) continue;
          var dr2 = parseDrop(o);
          if (!dr2 || !dr2.id || !itemDef(dr2.id)) continue;
          if (give(dr2.id, dr2.count || 1) <= 0) continue;
          pickupFx(dr2, o.x, o.y);
          try { w.removeObject(o); } catch (err2) { WS.err('removeObject(drop):', err2 && err2.message); }
          picked++;
        }
      }
    }
  }

  /**
   * Положить предмет как дроп-сущность на пол (для Q и будущих механик).
   * Позиция — перед игроком; если там стена, кладём под ноги.
   */
  function makeDrop(id, count, cond, x, y, dir) {
    var w = W();
    if (!w || !w.addEnt) return null;
    var e = {
      kind: 'drop',
      x: x, y: y,
      sprName: 'drop_generic',
      sprFrame: Math.random() < 0.5 ? 0 : 1,
      dir: dir || 0,
      itemId: id,
      count: count || 1,
      cond: cond,
      shadow: false,
      name: itemName(id)
    };
    if (cond !== undefined) e.cond = cond;
    return w.addEnt(e);
  }

  /**
   * Q: выбросить предмет из правой руки (equip.hand1). Дроп появляется
   * перед игроком; источник света, если был, гаснет. Возвращает true,
   * если что-то выброшено.
   */
  function dropHand1() {
    var p = P();
    var w = W();
    if (!p || !p.equip) return false;
    var slot = p.equip.hand1;
    if (!slot || !slot.id) {
      hint('В правой руке пусто');
      return false;
    }
    // факел/фонарь в руке гасим при выбросе
    if (p._light) removeLightNow(p);

    // позиция перед игроком; стена — кладём под ноги
    var v = DIRVEC[p.dir & 7];
    var x = p.x + v[0] * 0.7, y = p.y + v[1] * 0.7;
    if (w && w.isTileBlocked && w.isTileBlocked(Math.floor(x), Math.floor(y))) {
      x = p.x; y = p.y;
    }
    makeDrop(slot.id, 1, slot.cond, x, y, p.dir);

    p.equip.hand1 = null;
    snd('drop', x, y, 0.8);
    equipChanged('hand1');
    return true;
  }

  // ====================================================================
  //  ИСТОЧНИК СВЕТА (F)
  //  В руке torch/lantern (def.light > 0): F зажигает World.addLight
  //  {x, y - 0.2, r: def.light, a: 0.85, flicker: true, fire: torch}.
  //  Позицию света за игроком тянет тик 60 (player.js). Повторное F или
  //  смена/выброс предмета — removeLight. Топливо/расход — системы B.
  // ====================================================================

  /** Погасить свет игрока (безопасно вызывать при любом состоянии). */
  function removeLightNow(p) {
    p = p || P();
    if (!p || !p._light) return;
    var w = W();
    if (w && w.removeLight) {
      try { w.removeLight(p._light); } catch (e) { /* уже снят */ }
    }
    p._light = null;
  }

  /**
   * F: зажечь/погасить факел или фонарь в правой руке.
   * Возвращает true, если состояние света изменилось.
   */
  function toggleLight() {
    var p = P();
    var w = W();
    if (!p || !p.equip || !w || !w.addLight) return false;
    var slot = p.equip.hand1;
    var def = slot ? itemDef(slot.id) : null;
    if (!def || !def.light) {
      hint('В руке нет факела или фонаря');
      return false;
    }
    if (p._light) {
      removeLightNow(p);
      return false;
    }
    // зажигаем: радиус из определения предмета (torch 55, lantern 85)
    p._light = w.addLight({
      x: p.x,
      y: p.y - 0.2,
      r: def.light,
      a: 0.85,
      flicker: true,
      fire: def.id === 'torch'
    });
    snd('match', p.x, p.y, 0.8);            // чирканье спички
    return true;
  }

  /**
   * Согласование света с предметом в руке: предмет сменили/выбросили —
   * гасим; факел заменили фонарём — обновляем радиус и тип пламени.
   * Вызывается каждый кадр (дёшево: пара сравнений).
   */
  function lightSanity(p) {
    if (!p._light) return;
    var slot = p.equip ? p.equip.hand1 : null;
    var def = slot ? itemDef(slot.id) : null;
    if (!def || !def.light) { removeLightNow(p); return; }
    if (p._light.r !== def.light) p._light.r = def.light;
    var isFire = def.id === 'torch';
    if (!!p._light.fire !== isFire) p._light.fire = isFire;
  }

  // ====================================================================
  //  ГЛАВНЫЙ ТИК ДЕЙСТВИЙ (приоритет 61)
  //  Порядок: кулдауны -> проверки (смерть/модал/сон) -> ввод ->
   //  автоподбор -> согласование света.
  // ====================================================================

  function actionTick(dt) {
    var g = G();
    if (!g || !g.running || g.dead) return;
    var p = g.player;
    if (!p) return;
    try {
      // кулдауны и таймеры (тикают даже спящему — чтобы не «замораживать»
      // недавний выстрел при пробуждении)
      if (p._atkCd > 0) p._atkCd -= dt;
      if (p._fireCd > 0) p._fireCd -= dt;
      if (p._reloadT > 0) {
        p._reloadT -= dt;
        if (p._reloadT <= 0) {
          p._reloadT = 0;
          reloadDone(p);
        }
      }

      // смерть: действий нет
      if (typeof p.hp === 'number' && p.hp <= 0) return;

      // модальный экран UI (дубль проверки input — по ТЗ)
      if (WS.Ui && WS.Ui.modal && WS.Ui.modal()) return;

      // во сне управления нет (кроме пробуждения — его делает player.js)
      if (p.sleeping) return;

      var m = mouse();

      // ЛКМ: удар/выстрел/кулаки
      if (m.leftP) onPrimary(p);

      // ПКМ или E: взаимодействие
      if (m.rightP || WS.Input.hit('interact')) doInteract(p);

      // F: факел/фонарь
      if (WS.Input.hit('lightSrc')) toggleLight();

      // Q: выбросить из руки
      if (WS.Input.hit('drop')) dropHand1();

      // R: перезарядка
      if (WS.Input.hit('reload')) tryReload();

      // автоподбор дропа под ногами
      autoPickup(p);

      // свет следует предмету в руке
      lightSanity(p);
    } catch (err) {
      WS.err('actionTick:', err && err.message);
    }
  }

  /** ЛКМ по типу оружия в руке. */
  function onPrimary(p) {
    var wi = weaponInfo(p);
    if (wi.mode === 'ranged') {
      if (p._fireCd > 0) return;               // кулдаун выстрела
      if ((p._reloadT || 0) > 0) return;        // занят перезарядкой
      fireWeapon(p, wi);
      return;
    }
    if (p._atkCd > 0) return;                   // кулдаун удара
    meleeAttack(p, wi);
  }

  // ====================================================================
  //  САМОТЕСТ (ручная проверка целостности; вызывается из консоли)
  // ====================================================================

  function selftest() {
    var out = [];
    var ok = function (name, cond) {
      out.push((cond ? '  ok  ' : ' FAIL ') + name);
      return !!cond;
    };
    var p = P();
    ok('игрок существует', !!p);
    ok('инвентарь — массив', !p || Array.isArray(p.inv));
    ok('экипировка — объект', !p || typeof p.equip === 'object');
    ok('items-таблица', !!itemsTable());
    var wi = p ? weaponInfo(p) : null;
    ok('weaponInfo работает', !!wi && (wi.mode === 'melee' || wi.mode === 'ranged' || wi.mode === 'fists'));

    // стекование/расход на «виртуальном» предмете невозможны без def —
    // проверяем на настоящем из items_seed (хлеб всегда есть в данных)
    if (p && itemsTable().bread) {
      var before = countItem('bread');
      give('bread', 3);
      ok('give/countItem (+3)', countItem('bread') === before + 3);
      ok('consume (-2)', consume('bread', 2) === 2);
      ok('countItem вернулось', countItem('bread') === before + 1);
    } else {
      out.push('  --   bread нет: give/consume пропущен');
    }

    // дверь/контейнер: методы не падают на null
    ok('toggleDoor(null) безопасен', toggleDoor(null) === false);
    ok('searchContainer(null) безопасен', searchContainer(null) === false);

    // свет без факела в руке — только подсказка
    if (p && !(p.equip && p.equip.hand1 && itemDef(p.equip.hand1.id) && itemDef(p.equip.hand1.id).light)) {
      ok('toggleLight без факела', toggleLight() === false);
    }

    // выстрел кулаками по воздуху не падает
    if (p) {
      p._atkCd = 0;
      ok('meleeAttack (кулаки, воздух)', typeof meleeAttack(p, weaponInfo(p)) === 'number');
    }
    return out;
  }

  // ====================================================================
  //  ПУБЛИЧНЫЙ API МОДУЛЯ
  //  Базовый инвентарь (ядро для WS.Inv B-агента) + действия.
  //  ВСЕ методы безопасны при отсутствии партии (возвращают нули/false).
  // ====================================================================

  WS.def('Action', {
    // --- базовый инвентарь (ТЗ: «объяви их и в WS.Action») ---
    findItem: findItem,
    countItem: countItem,
    consume: consume,
    give: give,
    equipBest: equipBest,

    // --- оружие ---
    weaponInfo: weaponInfo,
    applyDamage: applyDamage,
    knockback: knockback,
    sectorScan: function (p, radius) { return sectorScan(p || P(), radius); },
    meleeAttack: function () { var p = P(); return p ? meleeAttack(p, weaponInfo(p)) : 0; },
    fireWeapon: function () { var p = P(); return p ? fireWeapon(p, weaponInfo(p)) : false; },
    tryReload: tryReload,

    // --- взаимодействие ---
    interact: function () { var p = P(); return p ? doInteract(p) : false; },
    interactTarget: function () { var p = P(); return p ? interactTarget(p) : null; },
    toggleDoor: toggleDoor,
    searchContainer: searchContainer,

    // --- предметы на полу ---
    dropHand1: dropHand1,
    makeDrop: makeDrop,
    parseDrop: parseDrop,
    autoPickup: function () { var p = P(); if (p) autoPickup(p); },

    // --- свет ---
    toggleLight: toggleLight,
    removeLight: function () { removeLightNow(P()); },

    // --- служебное ---
    itemName: itemName,
    selftest: selftest
  });

  // ====================================================================
  //  BOOT
  //  Регистрируем только тик действий (61). Инвентарные методы — чистые
  //  функции над WS.G.player, подписок на события этому модулю не нужно:
  //  сброс партии игрока обрабатывает player.js (normalizePlayer).
  // ====================================================================

  WS.boot(function initActions() {
    WS.tick(TICK_PRI, actionTick, 'action:ctrl');
    WS.log('actions: тик действий зарегистрирован (pri ' + TICK_PRI + ')');
  }, 'action:init');

})();
