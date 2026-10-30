/**
 * achievements.js — ДОСТИЖЕНИЯ «Белого Безмолвия» (J2).
 * 63 достижения в семи категориях: выживание, охота, мастерство, поиск,
 * «на грани», люди и быт, удача. Регистрация: WS.Ach.def({id, name, desc,
 * cat, hidden?, cond(stats, player, story, watch)}) — cond вызывается
 * тиком раз в 5 секунд. Выдача: тост «Достижение: …», звук levelup,
 * запись в хронику журнала. Хранение: WS.G.story.ach = {id: день}
 * (переживает сейв). Долгие факты партии — в story.flags с префиксом
 * achw_, короткие (волки за ночь, погоня медведя) — в модуле.
 * Связи: state (G.stats/player/story), Time, World, Inv, Ui, Snd, Fx.
 */
(function () {
  'use strict';

  // ====================================================================
  //  КОНСТАНТЫ
  // ====================================================================

  var TICK_PRI = 44;          // системы: после needs/temp (40) и инвентаря (41)
  var CHECK_EVERY = 5;        // проверка условий раз в 5 секунд симуляции
  var CHASE_TIMEOUT = 300;   // сек: погоня медведя старше — сбрасываем
  var CHASE_ESCAPE = 15;     // тайлов: отбежал на столько — «Ахиллес»
  var BITE_WOUNDS = 10;      // укусов волка для «Оборотня»
  var WOLF_NIGHT_N = 5;       // волков за ночь для «Волчьей напасти»
  var AWAKE_MIN = 72 * 60;    // минут без сна для «Трёх ночей»
  var HUNGRY_H = 12;          // часов голода для «Пустого желудка»
  var FROST_H = 24;           // часов при −45° для «Мороза и воли»
  var WATER_SURVIVE_MIN = 60; // минут после проруби — считается «выжил»
  var PACK_KG = 30;           // кг ноши для «Полной сумки»
  var TOWN_LOOT_ALL = 1;      // все здания посёлка обысканы

  // Категории (для будущего экрана достижений и статистики).
  var CATS = {
    survive: { name: 'Выживание', icon: '❄' },
    hunt:    { name: 'Охота',     icon: 'fang' },
    craft:   { name: 'Мастерство', icon: 'hammer' },
    loot:    { name: 'Поиск',     icon: 'box' },
    dark:    { name: 'На грани',  icon: 'skull' },
    home:    { name: 'Люди и быт', icon: 'house' },
    luck:    { name: 'Удача',     icon: 'clover' }
  };

  // ====================================================================
  //  СОСТОЯНИЕ МОДУЛЯ
  // ====================================================================

  var defs = [];              // достижения в порядке регистрации
  var byId = {};              // id -> определение

  var checkT = 0;             // накопитель секунд до следующей проверки
  var simT = 0;               // внутренние часы модуля (сек симуляции)

  // Короткие факты партии (в сейв не идут — восстанавливаются событиями).
  var w = {
    night: false,            // сейчас ночь (21:00–06:00)
    wolvesTonight: 0,        // волков убито за текущую ночь
    bearChase: null,         // {e, t} — медведь, который нас обидел
    visitedB: {},            // ключ здания -> 1 (были внутри)
    lootedB: {},             // ключ здания -> 1 (обыскан контейнер)
    bIndex: null             // ключ здания -> число контейнеров (кэш)
  };

  // ====================================================================
  //  МАЛЫЕ УТИЛИТЫ
  // ====================================================================

  function G() { return WS.G || null; }
  function P() { var g = WS.G; return (g && g.player) || null; }

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  /** Игровое хранилище с гарантированными полями (story.ach и др.). */
  function story() {
    var g = G();
    if (!g) return null;
    if (!g.story || typeof g.story !== 'object') g.story = {};
    var s = g.story;
    if (!s.ach || typeof s.ach !== 'object') s.ach = {};
    if (!s.flags || typeof s.flags !== 'object') s.flags = {};
    if (!s.notes || !s.notes.push) s.notes = [];
    if (!s.radio || !s.radio.push) s.radio = [];
    if (!s.quests || typeof s.quests !== 'object') s.quests = {};
    return s;
  }

  /** Долгие факты — в story.flags с префиксом achw_ (переживают сейв). */
  function wf(n) {
    var s = story();
    return s ? s.flags['achw_' + n] : undefined;
  }

  function wset(n, v) {
    var s = story();
    if (!s) return;
    s.flags['achw_' + n] = (v === undefined ? 1 : v);
  }

  /** Прибавить к числовому факту (округление до сотых — чистый сейв). */
  function wadd(n, d) {
    var cur = Number(wf(n)) || 0;
    wset(n, Math.round((cur + d) * 100) / 100);
  }

  function day() {
    return (WS.Time && WS.Time.day) ? WS.Time.day() : ((G() && G().time) ? G().time.day : 1);
  }

  function hour() {
    return (WS.Time && WS.Time.hour) ? WS.Time.hour() : 8;
  }

  function totalMin() {
    return (WS.Time && WS.Time.totalMin) ? WS.Time.totalMin() : 0;
  }

  /** Игровые минуты за dt реальных секунд (как needs.js: скорость × сон). */
  function gameMin(dt) {
    var sp = (WS.Loop && WS.Loop.speed) ? WS.Loop.speed : 1;
    if (sp < 1) sp = 1;
    var ts = (WS.Time && WS.Time.timeScale) ? WS.Time.timeScale() : 1;
    return dt * sp * ts;
  }

  function playing() {
    var g = G();
    return !!(g && g.running && !g.dead && g.player);
  }

  function isPlayerEnt(e) {
    var p = P();
    return !!(e && p && (e === p || e.id === 'player' || e.kind === 'player'));
  }

  function toast(text, kind) {
    try {
      if (WS.Ui && WS.Ui.toast) { WS.Ui.toast(text, kind || 'info'); return; }
    } catch (e) { /* ниже — текстом */ }
    var p = P();
    if (WS.Fx && WS.Fx.text && p) {
      try { WS.Fx.text(text, p.x, p.y - 1.3, { col: '#e8d9a0', size: 13, life: 3 }); }
      catch (e2) { /* пусто */ }
    }
  }

  function snd(name, vol) {
    if (!WS.Snd || !WS.Snd.play) return;
    var p = P();
    try {
      WS.Snd.play(name, { x: p ? p.x : 0, y: p ? p.y : 0, vol: vol === undefined ? 0.8 : vol });
    } catch (e) { /* тишина */ }
  }

  /** Запись в хронику журнала (та же схема, что у journal_screen). */
  function chron(text, cls) {
    var s = story();
    if (!s) return;
    if (!s.chronicle || !s.chronicle.push) s.chronicle = [];
    var t = '';
    try {
      var h = WS.Time.hour(), m = WS.Time.minute();
      t = (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
    } catch (e) { t = ''; }
    s.chronicle.push({
      day: day(),
      time: t,
      text: String(text || ''),
      cls: cls || ''
    });
    while (s.chronicle.length > 100) s.chronicle.shift();
  }

  /** Определение предмета (мягко, для калорий/слотов одежды). */
  function itemDef(id) {
    try {
      return (WS.Data && WS.Data.items && WS.Data.items[id]) || null;
    } catch (e) { return null; }
  }

  // ====================================================================
  //  ОПРОС МИРА (мягкие мосты к соседям)
  // ====================================================================

  /** Температура за бортом, °C (Weather с фолбэком −12). */
  function tempOut() {
    try {
      if (WS.Temp && typeof WS.Temp.outside === 'function') {
        return WS.Temp.outside();
      }
    } catch (e) { /* фолбэк ниже */ }
    try {
      if (WS.Weather && typeof WS.Weather.tempOutside === 'function') {
        return WS.Weather.tempOutside();
      }
    } catch (e2) { /* фолбэк ниже */ }
    return -12;
  }

  /** Процент исследования карты (мост к MapScreen). */
  function exploredPct() {
    try {
      if (WS.MapScreen && typeof WS.MapScreen.exploredPct === 'function') {
        return Number(WS.MapScreen.exploredPct()) || 0;
      }
    } catch (e) { /* нет карты — нет процента */ }
    return -1;
  }

  /** Вес ноши игрока, кг. */
  function carryWeight() {
    try {
      if (WS.Inv && typeof WS.Inv.weight === 'function') return WS.Inv.weight();
    } catch (e) { /* нет инвентаря */ }
    return 0;
  }

  /** Есть ли где-то поблизости приручённый пёс (событийный модуль E1). */
  function dogTamed() {
    try {
      var world = WS.World;
      if (!world || !world.ents) return false;
      for (var i = 0; i < world.ents.length; i++) {
        var e = world.ents[i];
        if (e && e.kind === 'dog' && e.tamed) return true;
      }
    } catch (e) { /* мир не готов */ }
    return false;
  }

  /** Максимальный уровень среди всех навыков игрока. */
  function maxSkillLv() {
    var p = P();
    if (!p || !p.skills) return 0;
    var mx = 0;
    for (var k in p.skills) {
      if (!p.skills.hasOwnProperty(k)) continue;
      var s = p.skills[k];
      if (s && typeof s === 'object' && (s.lv || 0) > mx) mx = s.lv || 0;
    }
    return mx;
  }

  /** Счётчик боевой статистики от combat.js (shots/hits/melees…). */
  function combatStat(k) {
    var g = G();
    if (!g || !g.stats || !g.stats._combat) return 0;
    return g.stats._combat[k] || 0;
  }

  /** Ключ здания (устойчив к отсутствию id у старых сейвов). */
  function bkey(b) {
    if (!b) return '?';
    return b.id ? String(b.id) : (b.x + ',' + b.y);
  }

  /**
   * Индекс «здание -> число контейнеров». Строится лениво после старта
   * партии и сбрасывается при загрузке (мир пересобирается по сиду).
   */
  function containersPerBuilding() {
    if (w.bIndex) return w.bIndex;
    var idx = {};
    var world = WS.World;
    if (world && world.buildings && world.objects) {
      for (var i = 0; i < world.buildings.length; i++) {
        idx[bkey(world.buildings[i])] = 0;
      }
      for (var j = 0; j < world.objects.length; j++) {
        var o = world.objects[j];
        if (!o || !o.container) continue;
        var b = world.buildingAt(Math.floor(o.x), Math.floor(o.y));
        if (b) idx[bkey(b)] = (idx[bkey(b)] || 0) + 1;
      }
    }
    w.bIndex = idx;
    return idx;
  }

  /** Все ли здания посёлка обысканы (или посещены, если лутать нечего). */
  function townSearched() {
    var world = WS.World;
    if (!world || !world.buildings || !world.buildings.length) return false;
    var idx = containersPerBuilding();
    var done = 0;
    for (var i = 0; i < world.buildings.length; i++) {
      var b = world.buildings[i];
      var k = bkey(b);
      var hasLoot = (idx[k] || 0) > 0;
      if (hasLoot ? !!w.lootedB[k] : !!w.visitedB[k]) done++;
    }
    return done >= world.buildings.length;
  }

  /** Ночь? 21:00–06:00 (по шине — night:fall / day:dawn). */
  function nightNow() {
    var h = hour();
    return h >= 21 || h < 6;
  }

  // ====================================================================
  //  РЕГИСТРАЦИЯ, ХРАНЕНИЕ И ВЫДАЧА
  // ====================================================================

  /**
   * Зарегистрировать достижение.
   * a: {id, name, desc, cat, hidden?, cond(stats, player, story, watch)}
   * cond возвращает истинность получения; вызывается раз в 5 секунд.
   */
  function def(a) {
    if (!a || !a.id || byId[a.id]) return null;
    if (typeof a.cond !== 'function') {
      WS.warn('ach: у «' + (a.id || '?') + '» нет cond — пропущено');
      return null;
    }
    if (!CATS[a.cat]) a.cat = 'survive';
    defs.push(a);
    byId[a.id] = a;
    return a;
  }

  /** Получено ли достижение (и в какой день). */
  function dayOf(id) {
    var s = story();
    return s ? s.ach[id] : undefined;
  }

  function has(id) {
    var d = dayOf(id);
    return !!(d !== undefined && d !== null && d !== 0);
  }

  /** Выдать достижение: пометка, тост, звук, хроника, искры. */
  function grant(a) {
    var s = story();
    if (!a || !s) return false;
    if (s.ach[a.id]) return false;
    s.ach[a.id] = day();

    toast('Достижение: «' + a.name + '»', 'good');
    snd('levelup', 0.9);
    chron('Достижение получено: «' + a.name + '» — ' + a.desc, 'find');

    var p = P();
    if (p && WS.Fx && WS.Fx.burst) {
      try { WS.Fx.burst('spark', p.x, p.y - 0.6, 12); } catch (e) { /* пусто */ }
      try { WS.Fx.text('★ ' + a.name, p.x, p.y - 1.5, { col: '#f4e3a1', size: 15, life: 3 }); }
      catch (e2) { /* пусто */ }
    }
    WS.log('ach: «' + a.name + '» (день ' + s.ach[a.id] + ')');
    return true;
  }

  /** Одна проверка всех условий (мягкая: cond в try/catch). */
  function checkAll() {
    var g = G();
    var p = P();
    var s = story();
    if (!g || !p || !s) return 0;
    var st = g.stats || {};
    var got = 0;
    for (var i = 0; i < defs.length; i++) {
      var a = defs[i];
      if (s.ach[a.id]) continue;
      var res = false;
      try {
        res = !!a.cond(st, p, s, w);
      } catch (e) {
        WS.err('ach: cond «' + a.id + '» упал:', e && e.message);
        continue;
      }
      if (res) {
        if (grant(a)) got++;
      }
    }
    return got;
  }

  // ====================================================================
  //  СОБЫТИЙНЫЕ СЛУШАТЕЛИ — короткие и долгие факты
  // ====================================================================

  /** Новая ночь: волки, вышедшие после 21:00, — «волчьи». */
  function onNightFall() {
    w.night = true;
  }

  function onDayDawn() {
    w.night = false;
    w.wolvesTonight = 0;
  }

  /** Убийство сущности игроком: ночные волки, вожак, медведь. */
  function onEntKill(d) {
    var e = d && d.ent;
    if (!e || !isPlayerEnt(d.by)) return;
    if (!playing()) return;

    if (e.kind === 'wolf') {
      if (w.night) w.wolvesTonight++;
    }
    if (e.kind === 'wolf' && e.qalpha) {
      wset('alpha');            // вожак стаи повержен
    }
    if (e.kind === 'bear') {
      wset('bearkill');         // шатун (или любой медведь) повержен
      w.bearChase = null;       // погоня окончена не в нашу пользу
    }
    if (e.kind === 'bandit' && e.group && e.group.members) {
      wset('squadfight');       // бился с бандой у склада
    }
  }

  /** Тихий охотник: олень, снятый ножом (по данным combat:kill). */
  function onCombatKill(d) {
    if (!d || !isPlayerEnt(d.by)) return;
    if (!playing()) return;
    var e = d.ent;
    if (!e) return;
    if (e.kind === 'deer' && (d.weapon === 'knife' || d.weapon === 'hunting_knife')) {
      wset('deerknife');
    }
  }

  /** Урон игроку: укусы волков, погоня медведя. */
  function onDamage(d) {
    if (!d || !playing()) return;
    var p = P();
    if (!p) return;
    var src = d.src || null;
    var kind = src ? src.kind : null;

    // укус волка (тип урона bite от волчьей пасти)
    if (d.type === 'bite' && kind === 'wolf') {
      wadd('bites', 1);
      if (p.bleed !== undefined && (p.bleed || 0) >= 1) {
        wset('bittenBleed');
        wadd('bleedbites', 1);
      }
    }
    // медведь зацепил — началась (или продолжилась) погоня
    if (kind === 'bear' && src && !src.dead) {
      w.bearChase = { e: src, t: simT };
      if (p.fracture) w.bearChase.broken = true;
    }
    // обвал снега с крыши — редкий факт, посчитаем
    if (kind === 'roof') {
      wadd('roofhits', 1);
    }
  }

  /** Обыск контейнера: здания, склад, схрон, трупы. */
  function onLooted(d) {
    if (!playing()) return;
    var o = d && d.o;
    if (!o) return;
    var world = WS.World;

    // здание, в котором стоит контейнер
    if (world && world.buildingAt) {
      var b = world.buildingAt(Math.floor(o.x), Math.floor(o.y));
      if (b) {
        var k = bkey(b);
        w.lootedB[k] = 1;
        persistB('lootedb', w.lootedB);

        // ключ Аргунова: вскрыт склад при пилораме
        if (b.type === 'warehouse' &&
            (o.container === 'warehouse_crate' ||
             o.container === 'warehouse_barrel' ||
             o.container === 'warehouse_sack')) {
          wset('warehouse');
        }
      }
    }
    // схрон егеря (квест ranger_cache)
    if (o.container === 'ranger_cache') wset('ranger');
    // трупы: трофейщик
    if (typeof o.container === 'string' && o.container.indexOf('corpse_') === 0) {
      wadd('corpses', 1);
    }
  }

  /** Крафт: одежда, боеприпасы, плотницкие изделия, разнообразие. */
  function onCrafted(d) {
    if (!playing() || !d || d.fail) return;
    var r = d.recipe || null;
    var cat = r ? r.cat : (d.cat || null);

    // слоты одежды из выхода рецепта — «Портной»
    var out = d.out || (r && r.out) || null;
    if (out && out.length) {
      for (var i = 0; i < out.length; i++) {
        var slot = out[i];
        if (!slot || !slot.id) continue;
        var def0 = itemDef(slot.id);
        if (!def0) continue;
        var isCloth = (def0.cat === 'cloth') ||
                      (def0.slots && def0.slots.length);
        if (!isCloth) continue;
        var slots = def0.slots || [];
        for (var j = 0; j < slots.length; j++) {
          var sl = slots[j];
          if (sl === 'head') wset('clothh');
          if (sl === 'torso') wset('clotht');
          if (sl === 'legs') wset('clothl');
          if (sl === 'feet') wset('clothf');
          if (sl === 'hands') wset('clothg');
        }
      }
    }

    // боеприпасы: считаем единицы
    if (cat === 'ammo' && out && out.length) {
      var n = 0;
      for (var a = 0; a < out.length; a++) {
        if (out[a] && typeof out[a].n === 'number') n += out[a].n;
        else n += 1;
      }
      wadd('ammo', n);
    }
    // плотницкие изделия
    if (cat === 'carpentry') wadd('carp', 1);

    // разнообразие рецептов
    if (r && r.id) rememberRecipe(r.id);
  }

  /** Разные рецепты за партию (строка в flags: id1,id2,…). */
  function rememberRecipe(id) {
    var raw = wf('recipes');
    var list = (typeof raw === 'string' && raw) ? raw.split(',') : [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] === id) return;
    }
    list.push(id);
    if (list.length > 128) list.shift();
    wset('recipes', list.join(','));
  }

  function recipesKnown() {
    var raw = wf('recipes');
    if (typeof raw !== 'string' || !raw) return 0;
    var n = 0;
    var parts = raw.split(',');
    for (var i = 0; i < parts.length; i++) {
      if (parts[i]) n++;
    }
    return n;
  }

  /** Падение в прорубь: запомним минуту (пережил ли час — покажет тик). */
  function onFallWater() {
    if (playing()) wset('fellwater', totalMin());
  }

  /** Ампутация: сам факт — уже победа над гангреной. */
  function onAmputate() {
    if (playing()) wset('amputated');
  }

  /** Гармошка над снегами. */
  function onPlayed(d) {
    if (playing() && d && d.id) wset('music');
  }

  /** Еда: количество единиц (сырых и готовых — без двойного счёта). */
  function onAte(d) {
    if (!playing() || !d || !d.id) return;
    var def0 = itemDef(d.id);
    wadd('ate', 1);
    if (def0 && def0.cal) wadd('atecal', def0.cal);
    if (def0 && def0.sick) wset('riskyfood');
  }

  /** Питьё: сухой закон следит за спиртом. */
  function onDrank(d) {
    if (!playing() || !d || !d.id) return;
    var id = String(d.id);
    var def0 = itemDef(id);
    if (id === 'vodka' || id === 'moonshine' || id === 'spirit' ||
        (def0 && def0.drunk && def0.drunk >= 15)) {
      wset('boozed');
    }
    wadd('drank', 1);
  }

  /** Рыбалка: каждая рыба — к «Рыбаку». */
  function onFish(d) {
    if (!playing()) return;
    var n = (d && typeof d.n === 'number') ? d.n : 1;
    wadd('fish', n);
    if (d && d.how === 'net') wadd('netfish', n);
  }

  /** Подбор предмета: кладовая и найдёныш. */
  function onPicked(d) {
    if (!playing() || !d || !d.id) return;
    var n = (typeof d.count === 'number') ? Math.max(1, d.count) : 1;
    wadd('picked', n);
    if (d.id === 'rifle_mosin' || d.id === 'shotgun') wset('rifle');
  }

  /** Растоплена печь: если это баня — «Банька по-чёрному». */
  function onFireLit(d) {
    if (!playing() || !d) return;
    if (d.kind !== 'stove' && d.kind !== 'camp') return;
    if (d.kind === 'camp') wset('campfire');
    var world = WS.World;
    if (!world || !world.buildingAt) return;
    var x = (typeof d.x === 'number') ? d.x : 0;
    var y = (typeof d.y === 'number') ? d.y : 0;
    var b = world.buildingAt(Math.floor(x), Math.floor(y));
    if (b && b.type === 'banya') wset('banya');
  }

  /** Растоплен снег во флягу: «акхимия Севера». */
  function onMelted() {
    if (playing()) wadd('melted');
  }

  /** Перевязка: «Лекарь». */
  function onHeal(d) {
    if (!playing() || !d) return;
    if (d.kind === 'bandage' || d.item === 'bandage' ||
        d.item === 'bandage_clean') {
      wadd('bandages');
    }
  }

  /** Победа: пароход пришёл. */
  function onVictory() {
    var s = story();
    if (s) wset('won');
    // финальная проверка — тик после победы уже не ходит
    checkAll();
  }

  /** Новый день: пересчёт «дожитых» вех — не нужен, cond сам смотрит день. */
  function onDay() { /* пусто: cond вычисляют день напрямую */ }

  // ====================================================================
  //  ПЕРСИСТЕНТНОСТЬ КЛЮЧЕЙ ЗДАНИЙ (строка в flags)
  // ====================================================================

  function persistB(name, obj) {
    var arr = [];
    for (var k in obj) {
      if (obj.hasOwnProperty(k) && obj[k]) arr.push(k);
    }
    if (arr.length > 400) arr = arr.slice(arr.length - 400);
    wset(name, arr.join(','));
  }

  function restoreB(name) {
    var out = {};
    var raw = wf(name);
    if (typeof raw === 'string' && raw) {
      var parts = raw.split(',');
      for (var i = 0; i < parts.length; i++) {
        if (parts[i]) out[parts[i]] = 1;
      }
    }
    return out;
  }

  /** Сброс коротких фактов (новая партия) или подъём из флагов (загрузка). */
  function resetWatch(fromSave) {
    w.night = nightNow();
    w.wolvesTonight = 0;
    w.bearChase = null;
    w.bIndex = null;
    w.visitedB = fromSave ? restoreB('visitedb') : {};
    w.lootedB = fromSave ? restoreB('lootedb') : {};
  }

  /** Старт новой партии. */
  function onGameStart() {
    var s = story();
    if (s) s.ach = s.ach || {};
    resetWatch(false);
  }

  /** Загрузка сейва: ach и achw_* приезжают внутри G. */
  function onGameLoad() {
    var s = story();
    if (s) s.ach = s.ach || {};
    resetWatch(true);
  }

  // ====================================================================
  //  МЕДВЕЖЬЯ ПОГОНЯ («Ахиллес»)
  // ====================================================================

  function bearChasePoll() {
    var c = w.bearChase;
    var p = P();
    if (!c || !p) return;

    var e = c.e;
    // зверь погиб или исчез — погони больше нет
    if (!e || e.dead || e.hp <= 0 || e.removed) {
      w.bearChase = null;
      return;
    }
    // затянувшаяся история — забыли
    if (simT - c.t > CHASE_TIMEOUT) {
      w.bearChase = null;
      return;
    }
    // перелом — «на ногах» не вышло
    if (p.fracture) {
      c.broken = true;
      w.bearChase = null;
      return;
    }
    // отбежали достаточно далеко, живы и целы
    var d = WS.M && WS.M.dist ? WS.M.dist(p.x, p.y, e.x, e.y) : 99;
    if (d >= CHASE_ESCAPE) {
      w.bearChase = null;
      wset('achilles');
    }
  }

  /** Посещение зданий (для «Обыскан посёлок»). */
  function visitPoll(p) {
    var world = WS.World;
    if (!world || !world.isInside) return;
    var b = world.isInside(p.x, p.y);
    if (!b) return;
    var k = bkey(b);
    if (!w.visitedB[k]) {
      w.visitedB[k] = 1;
      persistB('visitedb', w.visitedB);
    }
  }

  // ====================================================================
  //  ГЛАВНЫЙ ОПРОС ФАКТОВ — раз в CHECK_EVERY секунд
  // ====================================================================

  function pollFacts() {
    var g = G();
    var p = P();
    if (!g || !p) return;
    var gmin = gameMin(CHECK_EVERY);

    // --- на грани ---
    if (p.hp <= 5) wset('neardeath');
    if (p.hp <= 20 && (p.bleed || 0) >= 3) wset('bloodlow');
    if (p.needs && p.needs.sanity <= 10) wset('madlow');
    if ((p.infection || 0) >= 60) wset('infect60');

    // --- часы мороза и голода (игровые) ---
    var t = tempOut();
    if (t <= -45) wadd('frosth', gmin / 60);
    if (p.needs && p.needs.hunger <= 10) wadd('hungryh', gmin / 60);

    // --- бессонница: копим минуты без сна, сон обнуляет ---
    if (p.sleeping) wset('awake', 0);
    else wadd('awake', gmin);

    // --- прорубь: час спустя ---
    var fell = wf('fellwater');
    if (typeof fell === 'number' && fell >= 0) {
      if (totalMin() - fell >= WATER_SURVIVE_MIN) wset('icesurv');
    }

    // --- пёс приручён (событийный модуль не шлёт событий) ---
    if (!wf('dog') && dogTamed()) wset('dog');

    // --- погоня и визиты ---
    bearChasePoll();
    visitPoll(p);
  }

  // ====================================================================
  //  ТИК МОДУЛЯ
  // ====================================================================

  function achTick(dt) {
    var g = G();
    if (!g || !g.running || g.dead) return;
    simT += dt;
    checkT += dt;
    if (checkT < CHECK_EVERY) return;
    checkT = 0;

    pollFacts();
    checkAll();
  }

  // ====================================================================
  //  ЛИТЕРАТУРНЫЕ ПОДПИСИ (flavor) — строка под достижением в UI
  //  и в тосте выдачи. Ключ — id достижения.
  // ====================================================================

  var FLAVORS = {
    // выживание
    first_day: '«Один день — уже биография», — записал бы учитель, если б дожил.',
    week: 'Семёрка на бересте у порога — так поморы считали недели зимовки.',
    two_weeks: 'Половина ноября за окном, половина пути за плечами.',
    month: 'Календарь кончается вместе с терпением, а вы всё живы.',
    polar_night: 'Солнце ушло под лёд — до весны. Теперь только вы себе заря.',
    to_ship: 'Гудок парохода — самый сладкий звук на свете.',
    no_radio: 'Эфир молчал — и вы не слушали. Оно и к лучшему.',
    well_fed: 'Хлеб да каша — пища наша. Двести раз подряд.',
    dry_law: 'Спирт ушел фельдшеру на примочки. Вы не в счёте.',
    homebody: 'Печка трещит, вьюга воет — а вам тепло.',
    pathfinder: 'Тропа от избушки к избушке набита вашими валенками.',
    cartographer: 'Берестяная карта срастается в целый мир.',
    bookworm: 'Чужие слова грели лучше дров.',
    archivist: 'Мёртвая волость говорит с вами через бумагу.',
    iron_health: 'Ни чиха, ни кашля. Крепкий организм — северная роскошь.',
    book_reader: 'Книга, дочитанная до последней страницы, — как неиспитый чай: греет.',
    // охота
    first_blood: 'Волчья стая помнит того, кто стреляет первым.',
    wolf_ten: 'У околицы считают: десяток — уже промысел.',
    wolf_night: 'Ночь, когда стая узнала ваше имя.',
    alpha_down: 'Вой стал реже и тише. Некому тянуть стаю.',
    shatun_down: 'Шкура шатуна — теплей любой печи. Так говорят.',
    achilles: 'Ноги быстрее клыков. Запишите где-нибудь.',
    werewolf: 'Десять укусов — и на снегу всё ещё ваши следы.',
    hare_storm: 'Зайцы перебегают дорогу — теперь в другую сторону.',
    silent_hunter: 'Нож, дыхание, один точный шаг. Олень не услышал.',
    huntsman: 'Пристань-Тихая ест добытое вами и не спрашивает имени.',
    fisher: 'Прорубь узнаёт вашу тень.',
    sniper: 'Патрон — золото. Вы не разбрасывали золото.',
    first_shot: 'Выстрел над лесом. Птицы снялись разом.',
    net_fisher: 'Сеть — женское ремесло, да уха от неё общая.',
    // мастерство
    first_craft: 'Руки вспомнили, что они умели.',
    craft_50: 'Изба наполнилась вещами, сделанными молча.',
    master: 'Мастерство — это терпение, помноженное на зиму.',
    grandmaster: 'В волости таких было двое. Оба уже не живут.',
    cook_20: 'Щи да каша — пища наша. Так и говорили.',
    tailor_kit: 'С головы до ног — всё иголкой и жилой, всё ваше.',
    gunsmith: 'Гильза, порох, пуля и свеча над столом.',
    carpenter: 'Топор в ваших руках звучит как колокол.',
    golden_hands: 'Пятнадцать рецептов — пятнадцать побед над обстоятельствами.',
    firemaker: 'Спичка чиркнула — и мир стал добрее.',
    // поиск
    first_loot: 'Чужое добро здесь ничьё: хозяева не вернутся.',
    looter_100: 'Сто тайников вскрыто. Совесть давно замёрзла.',
    town: 'Посёлок перевернут до последнего чулана.',
    treasure_hunter: 'Записки сложились в карту, карта — в приз.',
    argunov_key: 'Ключ был у Аргунова. Теперь Аргунов — легенда, а склад — ваш.',
    gravedigger: 'С мёртвых не спросится. С вас, пожалуй, тоже.',
    found_rifle: 'Трёхлинейка в снегу — как крест на погосте: к перемене.',
    pack_mule: 'Спина помнит каждый килограмм.',
    // на грани
    frost_will: 'Мороз спрашивает: сдаёшься? Вы отвечаете: днём.',
    ice_hole: 'Вода подо льдом держала вас ровно столько, чтобы вы запомнили.',
    near_death: 'Смерть постояла рядом и ушла — то ли брезгует, то ли ждёт.',
    bloody_snow: 'Снег вокруг был не белый. Вы всё равно встали.',
    empty_stomach: 'Живот сводило от пустоты, а голова — от мыслей.',
    madness_edge: 'Шёпот за стеной стих. Вы вернулись.',
    three_nights: 'Три ночи без сна — и ни одного признака. Так кажется.',
    second_life: 'Кровь снова чистая. Об этом не расскажешь никому.',
    amputee: 'Пальцы остались где-то в том декабре.',
    bitten_but_alive: 'Шрамы чешутся к перемене погоды. К доброй.',
    // люди и быт
    banya: 'Пар костей не ломит. Зато ломит бока — с непривычки.',
    svyatki: 'Воск лёг — и судьба на минуту приоткрыла дверь.',
    dog_friend: 'Пёс положил морду на ваш сапог. Это к добру.',
    child_saved: 'Мальчик будет жить. Об этом пароход узнает последним.',
    akim_trust: 'Аким молчит. Но молчит уже по-другому.',
    caravan: 'Ненцы помахали из саней. Значит, дорога ещё жива.',
    harmonica: 'Гармонь поёт над снегами — и снег слушает.',
    good_deeds: 'Живым от вас была польза. Это редкая монета.',
    tea_time: 'Пятьдесят глотков тепла. Чай — тоже топливо.',
    healer: 'Перевязка — двадцать раз. Руки не дрогнули.',
    water_maker: 'Снег в котелке — вода во фляге. Алхимия Севера.',
    // удача
    aurora: 'Зелёный огонь в чёрном небе. Поморы крестились.',
    gatherer: 'Ничего не пропало зря — даже того, что валялось.',
    spared_by_beast: 'Волк посмотрел и ушёл. Такого не рассказывают трезвыми.'
  };

  /** Подпись-эпиграф достижения (или ''). */
  function flavorOf(id) {
    var a = byId[id];
    if (a && a.flavor) return a.flavor;
    return FLAVORS[id] || '';
  }

  // ====================================================================
  //  ПУБЛИЧНЫЙ API
  // ====================================================================

  var Ach = {
    /** Регистрация (контракт J2). */
    def: def,

    /** Получено ли достижение. */
    has: has,

    /** В какой день получено (undefined — нет). */
    dayOf: function (id) { return dayOf(id); },

    /** Сколько получено / сколько всего. */
    count: function () {
      var s = story();
      if (!s) return 0;
      var n = 0;
      for (var i = 0; i < defs.length; i++) {
        if (s.ach[defs[i].id]) n++;
      }
      return n;
    },
    total: function () { return defs.length; },

    /** Список для экрана достижений: [{id, name, desc, cat, hidden, day, flavor}]. */
    list: function () {
      var s = story();
      var out = [];
      for (var i = 0; i < defs.length; i++) {
        var a = defs[i];
        var d = s ? s.ach[a.id] : undefined;
        out.push({
          id: a.id, name: a.name, desc: a.desc, cat: a.cat,
          flavor: flavorOf(a.id),
          hidden: !!a.hidden,
          done: !!(d !== undefined && d !== null && d !== 0),
          day: (typeof d === 'number') ? d : 0
        });
      }
      return out;
    },

    /** Категории с числом полученных: {cat: {name, total, done}}. */
    cats: function () {
      var s = story();
      var out = {};
      for (var cat in CATS) {
        if (!CATS.hasOwnProperty(cat)) continue;
        var total = 0, done = 0;
        for (var i = 0; i < defs.length; i++) {
          if (defs[i].cat !== cat) continue;
          total++;
          if (s && s.ach[defs[i].id]) done++;
        }
        out[cat] = { name: CATS[cat].name, total: total, done: done };
      }
      return out;
    },

    /** Снимок для журнала/экрана смерти. */
    snapshot: function () {
      var s = story();
      var list = [];
      var n = 0;
      for (var i = 0; i < defs.length; i++) {
        var a = defs[i];
        var d = s ? s.ach[a.id] : undefined;
        if (d !== undefined && d !== null && d !== 0) {
          n++;
          list.push({ id: a.id, name: a.name, day: d, flavor: flavorOf(a.id) });
        }
      }
      return { count: n, total: defs.length, achieved: list };
    },

    /** Литературная подпись достижения (для UI). */
    flavor: function (id) { return flavorOf(id); },

    /** Прогресс достижения 0..1 (для полоски; скрытые — только 0/1). */
    progress: function (id) {
      var a = byId[id];
      if (!a) return 0;
      if (has(id)) return 1;
      if (a.hidden) return 0;
      var g = G();
      var p = P();
      var s = story();
      if (!g || !p || !s) return 0;
      if (typeof a.prog !== 'function') return 0;
      var v = 0;
      try { v = Number(a.prog(g.stats || {}, p, s, w)) || 0; }
      catch (e) { return 0; }
      return clamp(v, 0, 0.999);
    },

    /** Текстовый отчёт обо всех достижениях (консоль отладки). */
    report: function () {
      var s = story();
      var lines = ['ДОСТИЖЕНИЯ «БЕЛОЕ БЕЗМОЛВИЕ»'];
      var done = 0;
      for (var cat in CATS) {
        if (!CATS.hasOwnProperty(cat)) continue;
        lines.push('');
        lines.push('— ' + CATS[cat].name.toUpperCase() + ' —');
        for (var i = 0; i < defs.length; i++) {
          var a = defs[i];
          if (a.cat !== cat) continue;
          var d = s ? s.ach[a.id] : undefined;
          var got = (d !== undefined && d !== null && d !== 0);
          if (got) done++;
          lines.push((got ? '[x] ' : '[ ] ') + a.name +
                     (got ? (' — день ' + d) : (a.hidden ? ' — ???' : '')));
        }
      }
      lines.push('');
      lines.push('Получено: ' + done + ' из ' + defs.length);
      return lines.join('\n');
    },

    /** Принудительная проверка (кнопка отладки / тесты). */
    check: function () { return checkAll(); },

    /** Выдать вручную (консоль отладки). */
    give: function (id) {
      var a = byId[id];
      if (!a) return false;
      return grant(a);
    },

    /** Сброс всех достижений партии (отладка). */
    reset: function () {
      var s = story();
      if (!s) return;
      s.ach = {};
    },

    /** Внутренний watch (для тестов). */
    _watch: function () { return w; },

    // ------------------------------------------------------------------
    //  САМОТЕСТ (консоль: WS.Ach.selftest())
    // ------------------------------------------------------------------
    selftest: function () {
      var out = [];
      var ok = function (name, cond) {
        out.push((cond ? '  ok  ' : ' FAIL ') + name);
        return !!cond;
      };

      ok('достижений не меньше 50', defs.length >= 50);
      ok('достижений: ' + defs.length, defs.length > 0);

      // уникальность id
      ok('id уникальны', (function () {
        var seen = {};
        for (var i = 0; i < defs.length; i++) {
          if (seen[defs[i].id]) return false;
          seen[defs[i].id] = 1;
        }
        return true;
      })());

      // обязательные из ТЗ
      var must = ['first_day', 'week', 'month', 'polar_night', 'to_ship',
                  'no_radio', 'wolf_night', 'shatun_down', 'achilles',
                  'werewolf', 'silent_hunter', 'tailor_kit', 'town',
                  'treasure_hunter', 'argunov_key', 'frost_will', 'ice_hole',
                  'near_death', 'bloody_snow', 'banya', 'svyatki',
                  'dog_friend', 'child_saved', 'akim_trust', 'caravan',
                  'aurora'];
      ok('все достижения из ТЗ на месте', (function () {
        for (var i = 0; i < must.length; i++) {
          if (!byId[must[i]]) return false;
        }
        return true;
      })());

      // имя/описание у всех
      ok('у всех есть name и desc', (function () {
        for (var i = 0; i < defs.length; i++) {
          if (!defs[i].name || !defs[i].desc) return false;
        }
        return true;
      })());

      // cond вызывается и не падает без партии
      ok('cond живёт без G', (function () {
        var saved = WS.G;
        WS.G = null;
        var bad = 0;
        for (var i = 0; i < defs.length; i++) {
          try { defs[i].cond({}, {}, { flags: {} }, w); }
          catch (e) { bad++; }
        }
        WS.G = saved;
        return bad === 0;
      })());

      // prog (если есть) — возвращает 0..1 и не падает
      ok('prog в границах 0..1', (function () {
        var saved = WS.G;
        WS.G = { running: true, time: { day: 3, min: 600, totalMin: 600 },
                 player: { id: 'player', kind: 'player', x: 0, y: 0, hp: 100,
                           skills: {}, needs: {}, readBooks: {} },
                 story: { flags: {}, ach: {}, notes: [], radio: [], quests: {} },
                 stats: { wolvesKilled: 3, itemsCrafted: 10, mealsCooked: 2 } };
        var bad = 0;
        for (var i = 0; i < defs.length; i++) {
          var a = defs[i];
          if (typeof a.prog !== 'function') continue;
          try {
            var v = Number(a.prog(WS.G.stats, WS.G.player, WS.G.story, w)) || 0;
            if (v < 0 || v > 1) bad++;
          } catch (e) { bad++; }
        }
        WS.G = saved;
        return bad === 0;
      })());

      // у каждого достижения есть литературная подпись
      ok('у всех есть flavor', (function () {
        for (var i = 0; i < defs.length; i++) {
          if (!flavorOf(defs[i].id)) return false;
        }
        return true;
      })());

      // отчёт не пуст и содержит счёт
      ok('report() полный', (function () {
        var r = Ach.report();
        return r.indexOf('ДОСТИЖЕНИЯ') === 0 && r.indexOf('из ' + defs.length) > 0;
      })());

      // выдача и хранение
      ok('give/has работают', (function () {
        var saved = WS.G;
        WS.G = { running: true, time: { day: 3, min: 600, totalMin: 600 },
                 player: { id: 'player', kind: 'player', x: 0, y: 0, hp: 100, skills: {}, needs: {} },
                 story: { flags: {}, ach: {}, notes: [], radio: [], quests: {} },
                 stats: {} };
        var a = byId['first_day'];
        var r1 = Ach.give('first_day');
        var r2 = Ach.has('first_day');
        var day = WS.G.story.ach['first_day'];
        Ach.reset();
        var r3 = Ach.has('first_day');
        WS.G = saved;
        return r1 === true && r2 === true && day === 3 && r3 === false;
      })());

      return out;
    }
  };

  // ====================================================================
  //  ДОСТИЖЕНИЯ
  //  Категории: survive / hunt / craft / loot / dark / home / luck
  //  cond(stats, player, story, watch) — истина = выдать.
  // ====================================================================

  // --------------------------------------------------------------------
  //  ВЫЖИВАНИЕ (survive)
  // --------------------------------------------------------------------

  def({
    id: 'first_day', cat: 'survive', name: 'Первые сутки',
    desc: 'Пережить первый день и первую ночь в Пристань-Тихой.',
    cond: function (st, p) { return day() >= 2; }
  });

  def({
    id: 'week', cat: 'survive', name: 'Неделя',
    desc: 'Дожить до седьмого дня. Север принял вас всерьёз.',
    cond: function (st, p) { return day() >= 7; }
  });

  def({
    id: 'two_weeks', cat: 'survive', name: 'Две недели',
    desc: 'Дожить до четырнадцатого дня — четверти пути до парохода.',
    cond: function (st, p) { return day() >= 14; }
  });

  def({
    id: 'month', cat: 'survive', name: 'Месяц в снегах',
    desc: 'Дожить до тридцатого дня. Декабрь взял своё — но не вас.',
    cond: function (st, p) { return day() >= 30; }
  });

  def({
    id: 'polar_night', cat: 'survive', name: 'Полярная ночь',
    desc: 'Дожить до сорок четвёртого дня: солнце село и уже не встанет ' +
          'до самого парохода.',
    cond: function (st, p) { return day() >= 44; }
  });

  def({
    id: 'to_ship', cat: 'survive', name: 'До парохода',
    desc: 'Дожить до тридцатого декабря. Услышать гудок и уйти живым.',
    cond: function (st, p, story) { return !!wf('won'); }
  });

  def({
    id: 'no_radio', cat: 'survive', name: 'Пароход не нужен',
    desc: 'Дождаться парохода, не послушав ни одной радиопередачи. ' +
          'Обошлись без чужих голосов.',
    hidden: true,
    cond: function (st, p, story) {
      return !!wf('won') && story.radio && story.radio.length === 0;
    }
  });

  def({
    id: 'well_fed', cat: 'survive', name: 'Сытый Север',
    desc: 'Съесть двести единиц еды за партию — от сухаря до каши.',
    cond: function (st, p) { return (Number(wf('ate')) || 0) >= 200; }
  });

  def({
    id: 'dry_law', cat: 'survive', name: 'Сухой закон',
    desc: 'Тридцать дней ни капли спирта. На Севере это дороже денег.',
    hidden: true,
    cond: function (st, p) {
      return day() >= 30 && !wf('boozed');
    }
  });

  def({
    id: 'homebody', cat: 'survive', name: 'Домовитый',
    desc: 'Двадцать ночей спать в тепле — в кровати или у печи.',
    cond: function (st) { return (st.nightsSlept || 0) >= 20; }
  });

  def({
    id: 'pathfinder', cat: 'survive', name: 'Снежная тропа',
    desc: 'Пройти десять тысяч шагов по снегу.',
    cond: function (st) { return (st.stepsWalked || 0) >= 10000; }
  });

  def({
    id: 'cartographer', cat: 'survive', name: 'Картограф',
    desc: 'Исследовать половину окрестностей (карта в журнале).',
    cond: function (st, p) {
      var pct = exploredPct();
      return pct >= 50;
    }
  });

  def({
    id: 'bookworm', cat: 'survive', name: 'Книжник',
    desc: 'Найти и прочесть десять записок. Слова здесь дороже патронов.',
    cond: function (st) { return (st.notesRead || 0) >= 10; }
  });

  def({
    id: 'archivist', cat: 'survive', name: 'Архивариус',
    desc: 'Собрать двадцать записок — целую библиотеку мёртвой волости.',
    cond: function (st) { return (st.notesRead || 0) >= 20; },
    prog: function (st) { return (st.notesRead || 0) / 20; }
  });

  def({
    id: 'book_reader', cat: 'survive', name: 'Читатель',
    desc: 'Дочитать хотя бы одну книгу до последней страницы — в свече, ' +
          'под треск мороза.',
    cond: function (st, p) {
      var rb = p.readBooks;
      if (!rb) return false;
      for (var k in rb) {
        if (rb.hasOwnProperty(k) && rb[k]) return true;
      }
      return false;
    }
  });

  def({
    id: 'iron_health', cat: 'survive', name: 'Крепкий организм',
    desc: 'Дожить до двадцатого дня, ни разу не заболев.',
    cond: function (st, p) { return day() >= 20 && !wf('eversick'); },
    prog: function (st) { return day() / 20; }
  });

  // --------------------------------------------------------------------
  //  ОХОТА (hunt)
  // --------------------------------------------------------------------

  def({
    id: 'first_blood', cat: 'hunt', name: 'Первая кровь',
    desc: 'Убить первого волка. Стая это запомнит.',
    cond: function (st) { return (st.wolvesKilled || 0) >= 1; }
  });

  def({
    id: 'first_shot', cat: 'hunt', name: 'Первый выстрел',
    desc: 'Выстрелить из огнестрела. Лес узнает, что у вас есть голос.',
    cond: function (st) { return combatStat('shots') >= 1; }
  });

  def({
    id: 'wolf_ten', cat: 'hunt', name: 'Волчий счёт',
    desc: 'Убить десять волков за партию.',
    cond: function (st) { return (st.wolvesKilled || 0) >= 10; },
    prog: function (st) { return (st.wolvesKilled || 0) / 10; }
  });

  def({
    id: 'wolf_night', cat: 'hunt', name: 'Волчья напасть',
    desc: 'Убить пять волков за одну ночь — от заката до рассвета.',
    cond: function (st, p, story, watch) {
      return watch.wolvesTonight >= WOLF_NIGHT_N;
    }
  });

  def({
    id: 'alpha_down', cat: 'hunt', name: 'Вожак',
    desc: 'Одолеть вожака волчьей стаи — того, что воет ниже и злее.',
    cond: function (st) { return !!wf('alpha'); }
  });

  def({
    id: 'shatun_down', cat: 'hunt', name: 'Шатун повержен',
    desc: 'Убить медведя-шуна. Об этом будут говорить всю зиму.',
    cond: function (st) { return (st.bearsKilled || 0) >= 1; }
  });

  def({
    id: 'achilles', cat: 'hunt', name: 'Ахиллес',
    desc: 'Уйти от разъярённого медведя на своих двоих — быстро и целым.',
    cond: function (st) { return !!wf('achilles'); }
  });

  def({
    id: 'werewolf', cat: 'hunt', name: 'Оборотень',
    desc: 'Пережить десять волчьих укусов и остаться в живых. ' +
          'Люди скажут, что вас не берёт зверь.',
    hidden: true,
    cond: function (st, p) {
      return (Number(wf('bites')) || 0) >= BITE_WOUNDS && p.hp > 0;
    },
    prog: function (st) { return (Number(wf('bites')) || 0) / BITE_WOUNDS; }
  });

  def({
    id: 'hare_storm', cat: 'hunt', name: 'Гроза зайцев',
    desc: 'Добывать двадцать зайцев — белых, как эта зима.',
    cond: function (st, p) {
      var k = (p.kills && p.kills.hare) || 0;
      return k >= 20;
    }
  });

  def({
    id: 'silent_hunter', cat: 'hunt', name: 'Тихий охотник',
    desc: 'Снять оленя ножом — тихо, без выстрела, по-таёжному.',
    cond: function (st) { return !!wf('deerknife'); }
  });

  def({
    id: 'huntsman', cat: 'hunt', name: 'Промысловик',
    desc: 'Добыть тридцать зверей за партию — на шкуры и мясо.',
    cond: function (st) { return (st.animalsHunted || 0) >= 30; }
  });

  def({
    id: 'fisher', cat: 'hunt', name: 'Рыбак',
    desc: 'Поймать двадцать пять рыб — удочкой, сетью или мордой.',
    cond: function (st) { return (Number(wf('fish')) || 0) >= 25; },
    prog: function (st) { return (Number(wf('fish')) || 0) / 25; }
  });

  def({
    id: 'net_fisher', cat: 'hunt', name: 'Хозяин сети',
    desc: 'Поймать десять рыб сетью подо льдом — тихо, без удочки.',
    hidden: true,
    cond: function (st) { return (Number(wf('netfish')) || 0) >= 10; }
  });

  def({
    id: 'sniper', cat: 'hunt', name: 'Снайпер',
    desc: 'Точность стрельбы не ниже трёх четвертей при двадцати ' +
          'выстрелах и больше.',
    cond: function (st) {
      var shots = combatStat('shots');
      var hits = combatStat('hits');
      return shots >= 25 && hits / shots >= 0.75;
    },
    prog: function (st) {
      var shots = combatStat('shots');
      return Math.min(shots / 25, 0.99);
    }
  });

  // --------------------------------------------------------------------
  //  МАСТЕРСТВО (craft)
  // --------------------------------------------------------------------

  def({
    id: 'first_craft', cat: 'craft', name: 'Первое изделие',
    desc: 'Изготовить любую вещь своими руками.',
    cond: function (st) { return (st.itemsCrafted || 0) >= 1; }
  });

  def({
    id: 'craft_50', cat: 'craft', name: 'Полсотни вещей',
    desc: 'Изготовить пятьдесят предметов — от лучины до тулупа.',
    cond: function (st) { return (st.itemsCrafted || 0) >= 50; },
    prog: function (st) { return (st.itemsCrafted || 0) / 50; }
  });

  def({
    id: 'firemaker', cat: 'craft', name: 'Огниво',
    desc: 'Разжечь первый костёр на снегу. Спичка — и мир подобрел.',
    cond: function (st) { return !!wf('campfire'); }
  });

  def({
    id: 'master', cat: 'craft', name: 'Мастер',
    desc: 'Любой навык доведён до пятого уровня.',
    cond: function (st, p) { return maxSkillLv() >= 5; }
  });

  def({
    id: 'grandmaster', cat: 'craft', name: 'Гроссмейстер',
    desc: 'Любой навык доведён до десятого, последнего уровня.',
    cond: function (st, p) { return maxSkillLv() >= 10; }
  });

  def({
    id: 'cook_20', cat: 'craft', name: 'Кулинар',
    desc: 'Приготовить двадцать блюд — щи, каша, уха, томлёное.',
    cond: function (st) { return (st.mealsCooked || 0) >= 20; },
    prog: function (st) { return (st.mealsCooked || 0) / 20; }
  });

  def({
    id: 'tailor_kit', cat: 'craft', name: 'Портной',
    desc: 'Сшить полный комплект одежды: голову, туловище, ноги, руки ' +
          'и обувь — всё своё, иголкой и жилой.',
    cond: function (st) {
      return !!(wf('clothh') && wf('clotht') && wf('clothl') &&
                wf('clothf') && wf('clothg'));
    }
  });

  def({
    id: 'gunsmith', cat: 'craft', name: 'Оружейник',
    desc: 'Изготовить пятьдесят единиц боеприпасов — патроны или стрелы.',
    cond: function (st) { return (Number(wf('ammo')) || 0) >= 50; },
    prog: function (st) { return (Number(wf('ammo')) || 0) / 50; }
  });

  def({
    id: 'carpenter', cat: 'craft', name: 'Столяр',
    desc: 'Изготовить двадцать пять плотницких изделий.',
    cond: function (st) { return (Number(wf('carp')) || 0) >= 25; },
    prog: function (st) { return (Number(wf('carp')) || 0) / 25; }
  });

  def({
    id: 'golden_hands', cat: 'craft', name: 'Золотые руки',
    desc: 'Освоить пятнадцать разных рецептов за одну зиму.',
    cond: function (st) { return recipesKnown() >= 15; },
    prog: function (st) { return recipesKnown() / 15; }
  });

  // --------------------------------------------------------------------
  //  ПОИСК (loot)
  // --------------------------------------------------------------------

  def({
    id: 'first_loot', cat: 'loot', name: 'Обыщик',
    desc: 'Обыскать первое укрытие. Чужое добро здесь ничьё.',
    cond: function (st) { return (st.containersLooted || 0) >= 1; }
  });

  def({
    id: 'looter_100', cat: 'loot', name: 'Вещевой',
    desc: 'Обыскать сто укрытий — сундуки, погреба, тюки и тайники.',
    cond: function (st) { return (st.containersLooted || 0) >= 100; }
  });

  def({
    id: 'town', cat: 'loot', name: 'Обыскан посёлок',
    desc: 'Перевернуть каждое здание Пристань-Тихой. Всё, что плохо ' +
          'лежало, теперь ваше.',
    cond: function (st, p, story, watch) {
      return !!TOWN_LOOT_ALL && townSearched();
    }
  });

  def({
    id: 'treasure_hunter', cat: 'loot', name: 'Кладоискатель',
    desc: 'Вскрыть схрон егеря: сложить записки в карту, дойти до метки, ' +
          'раскопать снег лопатой.',
    cond: function (st) { return !!wf('ranger'); }
  });

  def({
    id: 'argunov_key', cat: 'loot', name: 'Ключ Аргунова',
    desc: 'Вскрыть склад при пилораме Балакирева. Ключ был у приказчика ' +
          'Аргунова — живым он не вернётся.',
    hidden: true,
    cond: function (st) { return !!wf('warehouse'); }
  });

  def({
    id: 'gravedigger', cat: 'loot', name: 'Трофейщик',
    desc: 'Обыскать десять тел погибших. С мёртвых не спросится.',
    hidden: true,
    cond: function (st) { return (Number(wf('corpses')) || 0) >= 10; }
  });

  def({
    id: 'found_rifle', cat: 'loot', name: 'Найдёныш',
    desc: 'Найти огнестрел — трёхлинейку или обрез. В такой зиме это ' +
          'цена жизни.',
    cond: function (st) { return !!wf('rifle'); }
  });

  def({
    id: 'pack_mule', cat: 'loot', name: 'Полная сумка',
    desc: 'Носить на себе тридцать килограммов скарба — и не сесть в снег.',
    cond: function (st) { return carryWeight() >= PACK_KG; }
  });

  // --------------------------------------------------------------------
  //  НА ГРАНИ (dark)
  // --------------------------------------------------------------------

  def({
    id: 'frost_will', cat: 'dark', name: 'Мороз и воля',
    desc: 'Провести целые сутки за морозом в минус сорок пять и ниже — ' +
          'и остаться живым.',
    cond: function (st) { return (Number(wf('frosth')) || 0) >= FROST_H; },
    prog: function (st) { return (Number(wf('frosth')) || 0) / FROST_H; }
  });

  def({
    id: 'ice_hole', cat: 'dark', name: 'В проруби',
    desc: 'Провалиться под лёд — и выползти. Час спустя всё ещё быть ' +
          'живым.',
    cond: function (st) { return !!wf('icesurv'); }
  });

  def({
    id: 'near_death', cat: 'dark', name: 'При смерти',
    desc: 'Побывать в шаге от смерти — здоровья меньше пяти — ' +
          'и всё-таки подняться.',
    cond: function (st, p) {
      return !!wf('neardeath') && p.hp >= 40;
    }
  });

  def({
    id: 'bloody_snow', cat: 'dark', name: 'Кровавый снег',
    desc: 'Истечь почти досуха — здоровья меньше двадцати при сильном ' +
          'кровотечении — и перевязаться вовремя.',
    cond: function (st, p) {
      return !!wf('bloodlow') && p.hp >= 50;
    }
  });

  def({
    id: 'empty_stomach', cat: 'dark', name: 'Пустой желудок',
    desc: 'Провести двенадцать часов почти без еды — и не сдохнуть ' +
          'с голоду.',
    cond: function (st) { return (Number(wf('hungryh')) || 0) >= HUNGRY_H; },
    prog: function (st) { return (Number(wf('hungryh')) || 0) / HUNGRY_H; }
  });

  def({
    id: 'madness_edge', cat: 'dark', name: 'На грани',
    desc: 'Побывать на самом краю рассудка — и вернуться оттуда целым.',
    cond: function (st, p) {
      return !!wf('madlow') && p.needs && p.needs.sanity >= 50;
    }
  });

  def({
    id: 'three_nights', cat: 'dark', name: 'Три ночи',
    desc: 'Не спать трое суток подряд. Шёпот за стеной — это просто ' +
          'усталость. Наверное.',
    cond: function (st) { return (Number(wf('awake')) || 0) >= AWAKE_MIN; }
  });

  def({
    id: 'second_life', cat: 'dark', name: 'Вторая жизнь',
    desc: 'Пережить заражение ран — когда полоса инфекции подобралась ' +
          'к сепсису — и вытянуть гниль из крови.',
    cond: function (st, p) {
      return !!wf('infect60') && (p.infection || 0) <= 10;
    }
  });

  def({
    id: 'amputee', cat: 'dark', name: 'Цена пальцев',
    desc: 'Пережить ампутацию. Обручальное кольцо осталось в жестянке ' +
          'у фельдшера.',
    hidden: true,
    cond: function (st) { return !!wf('amputated'); }
  });

  def({
    id: 'bitten_but_alive', cat: 'dark', name: 'Шрамами',
    desc: 'Пережить десять тяжёлых волчьих ран с кровотечением — и всё ' +
          'ещё ходить по этой земле.',
    hidden: true,
    cond: function (st) { return (Number(wf('bleedbites')) || 0) >= BITE_WOUNDS; }
  });

  // --------------------------------------------------------------------
  //  ЛЮДИ И БЫТ (home)
  // --------------------------------------------------------------------

  def({
    id: 'banya', cat: 'home', name: 'Банька по-чёрному',
    desc: 'Растопить печь в деревенской бане. Пар костей не ломит.',
    cond: function (st) { return !!wf('banya'); }
  });

  def({
    id: 'svyatki', cat: 'home', name: 'Святки',
    desc: 'Погадать на воске в святочные дни: воск лёг кольцом — ' +
          'к встрече, полосой — к перемене погоды.',
    cond: function (st, p, story) {
      var f = story && story.flags;
      if (!f) return false;
      for (var k in f) {
        if (f.hasOwnProperty(k) && k.indexOf('sv_gad_') === 0) return true;
      }
      return false;
    }
  });

  def({
    id: 'dog_friend', cat: 'home', name: 'Верный пёс',
    desc: 'Приручить пса, что пришёл из леса. Теперь вы не один.',
    cond: function (st) { return !!wf('dog'); }
  });

  def({
    id: 'child_saved', cat: 'home', name: 'Ребёнок спасён',
    desc: 'Спасти мальчика Ваню: принести хинин, детские валенки ' +
          'и горячую кашу.',
    cond: function (st, p, story) {
      return !!(story && story.flags && story.flags.child_saved);
    }
  });

  def({
    id: 'akim_trust', cat: 'home', name: 'Доверие Акима',
    desc: 'Заслужить доверие старца Акима — репутация пять и выше.',
    cond: function (st, p, story) {
      try {
        return !!(story && story.rep && story.rep.hermit >= 5);
      } catch (e) { return false; }
    }
  });

  def({
    id: 'caravan', cat: 'home', name: 'Караван',
    desc: 'Повстречать олений караван ненцев, что проходит трактом ' +
          'на север.',
    cond: function (st, p, story) {
      return !!(story && story.flags && story.flags.ev_caravan);
    }
  });

  def({
    id: 'harmonica', cat: 'home', name: 'Гармонь над снегами',
    desc: 'Сыграть на гармошке. Пусть услышат те, кто ещё жив.',
    cond: function (st) { return !!wf('music'); }
  });

  def({
    id: 'tea_time', cat: 'home', name: 'Чаепитие',
    desc: 'Выпить пятьдесят единиц жидкости — от снежной воды до ' +
          'хвойного чая.',
    cond: function (st) { return (Number(wf('drank')) || 0) >= 50; },
    prog: function (st) { return (Number(wf('drank')) || 0) / 50; }
  });

  def({
    id: 'healer', cat: 'home', name: 'Лекарь себе',
    desc: 'Двадцать раз перевязать свои раны — чисто, как в лазарете.',
    hidden: true,
    cond: function (st) { return (Number(wf('bandages')) || 0) >= 20; }
  });

  def({
    id: 'water_maker', cat: 'home', name: 'Алхимия Севера',
    desc: 'Тридцать раз растопить снег во флягу. Вода из воздуха — ' +
          'почти чудо.',
    hidden: true,
    cond: function (st) { return (Number(wf('melted')) || 0) >= 30; }
  });

  def({
    id: 'good_deeds', cat: 'home', name: 'Дела человеческие',
    desc: 'Завершить четыре разных дела из журнала. Люди не забыты.',
    cond: function (st, p, story) {
      var q = story && story.quests;
      if (!q) return 0 >= 4;
      var n = 0;
      for (var k in q) {
        if (q.hasOwnProperty(k) && q[k] === 'done') n++;
      }
      return n >= 4;
    }
  });

  // --------------------------------------------------------------------
  //  УДАЧА (luck)
  // --------------------------------------------------------------------

  def({
    id: 'aurora', cat: 'luck', name: 'Северное сияние',
    desc: 'Увидеть сполохи над полярной ночью — зелёный огонь, ' +
          'которому молились поморы.',
    cond: function (st, p, story) {
      return !!(story && story.flags && story.flags.ev_aurora_shown);
    }
  });

  def({
    id: 'gatherer', cat: 'luck', name: 'Северная кладовая',
    desc: 'Поднять триста предметов: с земли, из сундуков, из чужих ' +
          'сумок.',
    cond: function (st) { return (Number(wf('picked')) || 0) >= 300; }
  });

  def({
    id: 'spared_by_beast', cat: 'luck', name: 'Пощада',
    desc: 'Волк схватил вас — и отпустил. Такое рассказывают только ' +
          'у печки, и им не верят.',
    hidden: true,
    cond: function (st, p) {
      // укушен волком, но жив и не истёк кровью после
      return (Number(wf('bites')) || 0) >= 1 && p.hp >= 90 &&
             !wf('bloodlow');
    }
  });

  // ====================================================================
  //  BOOT
  // ====================================================================

  WS.def('Ach', Ach);

  WS.boot(function initAchievements() {
    // гарантированные поля — сразу и после каждой загрузки
    story();

    // --- события: факты для достижений ---
    WS.Ev.on('game:start', onGameStart);
    WS.Ev.on('game:load', onGameLoad);
    WS.Ev.on('night:fall', onNightFall);
    WS.Ev.on('day:dawn', onDayDawn);
    WS.Ev.on('time:day', onDay);
    WS.Ev.on('ent:kill', onEntKill);
    WS.Ev.on('combat:kill', onCombatKill);
    WS.Ev.on('player:damage', onDamage);
    WS.Ev.on('loot:searched', onLooted);
    WS.Ev.on('item:crafted', onCrafted);
    WS.Ev.on('player:fall_water', onFallWater);
    WS.Ev.on('player:amputate', onAmputate);
    WS.Ev.on('player:played', onPlayed);
    WS.Ev.on('player:ate', onAte);
    WS.Ev.on('player:drank', onDrank);
    WS.Ev.on('player:sick', function () {
      if (playing()) wset('eversick');
    });
    WS.Ev.on('fish:caught', onFish);
    WS.Ev.on('item:picked', onPicked);
    WS.Ev.on('fire:lit', onFireLit);
    WS.Ev.on('fire:melted', onMelted);
    WS.Ev.on('player:heal', onHeal);
    WS.Ev.on('game:victory', onVictory);

    // --- тик проверки ---
    WS.tick(TICK_PRI, achTick, 'sys:ach');

    WS.log('ach: достижений зарегистрировано: ' + defs.length +
           ' (проверка раз в ' + CHECK_EVERY + ' с)');
  }, 'systems:achievements');

})();
