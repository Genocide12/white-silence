/**
 * СОБИРАТЕЛЬСТВО: растения леса, поиск под снегом, сбор воды.
 * WS.Forage: спавн ресурсов в лесу, интерактивный сбор.
 */
(function () {
  'use strict';

  function toast(text, kind) {
    if (WS.Ui && WS.Ui.toast) WS.Ui.toast(text, kind || 'info');
    else if (WS.Fx && WS.G) WS.Fx.text(text, WS.G.player.x, WS.G.player.y - 1, { life: 2 });
  }

  function give(id, n) {
    if (WS.Inv && WS.Inv.give) return WS.Inv.give(id, n);
    if (WS.Action && WS.Action.give) return WS.Action.give(id, n);
    return 0;
  }

  function hasTool(tag) {
    var eq = WS.G.player.equip;
    for (var slot in eq) {
      var it = eq[slot];
      if (it) {
        var spec = WS.Data.items && WS.Data.items[it.id];
        if (spec && spec.tags && spec.tags.indexOf(tag) >= 0) return true;
      }
    }
    var inv = WS.G.player.inv || [];
    for (var i = 0; i < inv.length; i++) {
      var sp = WS.Data.items && WS.Data.items[inv[i].id];
      if (sp && sp.tags && sp.tags.indexOf(tag) >= 0) return true;
    }
    return false;
  }

  // ================================================================ ПРЕДМЕТЫ
  function defItems() {
    WS.Data = WS.Data || {};
    WS.Data.items = WS.Data.items || {};
    var I = function (o) { WS.Data.items[o.id] = o; };
    I({ id: 'chaga_chunk', cat: 'food', w: 0.15, stack: 12, cal: 50, thir: 5, per: 0, heal: 3, sanity: 2, tags: ['edible', 'tea_mat'] });
    I({ id: 'pine_branch', cat: 'material', w: 0.5, stack: 10, tags: ['tea_mat', 'bedding'] });
    I({ id: 'dry_grass', cat: 'material', w: 0.1, stack: 20, tags: ['tinder', 'bedding'] });
    I({ id: 'frozen_berries', cat: 'food', w: 0.1, stack: 10, cal: 200, thir: -5, per: 4, tags: ['perishable', 'edible'] });
    I({ id: 'frozen_mushroom', cat: 'food', w: 0.12, stack: 10, cal: 180, thir: -5, per: 4, cook: 'dried_mushrooms', tags: ['perishable', 'edible', 'cookable'] });
    I({ id: 'icicle_chunk', cat: 'drink', w: 0.3, stack: 6, thir: 10, per: 0, sick: 8, tags: ['drinkable'] });
    I({ id: 'mouse_nest', cat: 'material', w: 0.4, stack: 4, warm: 8, tags: ['bedding'] });
    I({ id: 'birch_bark', cat: 'material', w: 0.1, stack: 15, tags: ['tinder'] });
    I({ id: 'willow_twigs', cat: 'material', w: 0.3, stack: 12, tags: ['craft'] });
    I({ id: 'angelica_root', cat: 'med', w: 0.08, stack: 8, heal: 5, tags: ['heal', 'tea_mat'] });
    I({ id: 'bad_mushroom', cat: 'food', w: 0.1, stack: 10, cal: 100, thir: -5, per: 3, sick: 60, tags: ['edible'] });
    I({ id: 'snow_water', cat: 'drink', w: 0.5, stack: 4, thir: 12, per: 0, sick: 6, tags: ['drinkable'] });
  }

  // ================================================================ СПРАЙТЫ
  function defSprites() {
    var S = WS.Spr;
    // чага — чёрный нарост
    S.def('plant_chaga', { w: 20, h: 24, draw: function (c) {
      S.px(c, 4, 8, 10, 12, '#2a2320');
      S.px(c, 6, 6, 6, 3, '#3a3129');
      S.ell(c, 9, 14, 6, 7, '#332b26');
    }});
    // еловая лапка
    S.def('plant_pine', { w: 28, h: 20, draw: function (c) {
      S.px(c, 2, 12, 24, 4, '#3d4a3c');
      S.px(c, 5, 8, 18, 4, '#4d5c4a');
      S.px(c, 8, 5, 12, 3, '#5d6c5a');
      S.px(c, 4, 10, 20, 2, 'rgba(226,232,240,0.5)');
    }});
    // сухая трава
    S.def('plant_grass', { w: 20, h: 12, draw: function (c) {
      for (var i = 0; i < 7; i++) {
        S.px(c, 2 + i * 2.5, 4 + (i % 3), 1, 7, i % 2 ? '#8a7d5a' : '#9c8f6a');
      }
    }});
    // мороженая брусника — кустик с красным
    S.def('plant_berries', { w: 18, h: 12, draw: function (c) {
      S.ell(c, 9, 8, 8, 4, '#4a5c48');
      S.px(c, 4, 5, 2, 2, '#a03030'); S.px(c, 9, 4, 2, 2, '#b04038');
      S.px(c, 13, 6, 2, 2, '#a03030'); S.px(c, 7, 7, 2, 2, '#8f2828');
      c.globalAlpha = 0.3; S.ell(c, 9, 9, 8, 3, '#dfe6ee'); c.globalAlpha = 1;
    }});
    // гриб на пне
    S.def('plant_mushroom', { w: 14, h: 12, draw: function (c) {
      S.px(c, 5, 6, 4, 5, '#c9c2b4');
      S.ell(c, 7, 6, 6, 3, '#8a6d50');
      c.globalAlpha = 0.35; S.ell(c, 7, 4, 5, 2, '#dfe6ee'); c.globalAlpha = 1;
    }});
    // сосулька
    S.def('plant_icicle', { w: 10, h: 22, draw: function (c) {
      S.px(c, 3, 2, 4, 8, '#a9c6dd');
      c.beginPath(); c.moveTo(3, 10); c.lineTo(7, 10); c.lineTo(5, 20); c.closePath();
      c.fillStyle = '#c3d8ea'; c.fill();
    }});
    // поганка
    S.def('plant_badmush', { w: 12, h: 10, draw: function (c) {
      S.px(c, 4, 5, 3, 4, '#d8d4c4');
      S.ell(c, 5, 5, 5, 3, '#7a5a4a');
      S.px(c, 3, 3, 1, 1, '#e8e2d0'); S.px(c, 6, 4, 1, 1, '#e8e2d0');
    }});
    // мышиное гнездо
    S.def('plant_nest', { w: 18, h: 10, draw: function (c) {
      S.ell(c, 9, 6, 8, 3.5, '#8a7d5a');
      S.ell(c, 9, 5, 6, 2.5, '#9c8f6a');
    }});
    // береста
    S.def('plant_bark', { w: 16, h: 14, draw: function (c) {
      S.px(c, 2, 4, 12, 7, '#d8d0be');
      S.px(c, 4, 6, 3, 1, '#a89a7c'); S.px(c, 8, 8, 4, 1, '#a89a7c');
      c.globalAlpha = 0.4; S.ell(c, 8, 11, 7, 2.5, '#dfe6ee'); c.globalAlpha = 1;
    }});
  }

  // ================================================================ СПАВН В МИРЕ
  var PLANTS = [
    { spr: 'plant_chaga', item: 'chaga_chunk', n: [1, 2], name: 'Чага', nearBirch: true, w: 0.5 },
    { spr: 'plant_pine', item: 'pine_branch', n: [1, 3], name: 'Еловая лапка', w: 1.0 },
    { spr: 'plant_grass', item: 'dry_grass', n: [1, 4], name: 'Сухая трава', w: 0.8 },
    { spr: 'plant_berries', item: 'frozen_berries', n: [1, 3], name: 'Мороженая брусника', w: 0.35 },
    { spr: 'plant_mushroom', item: 'frozen_mushroom', n: [1, 3], name: 'Замёрзший гриб', w: 0.3 },
    { spr: 'plant_badmush', item: 'bad_mushroom', n: [1, 2], name: 'Поганка', w: 0.25 },
    { spr: 'plant_icicle', item: 'icicle_chunk', n: [1, 2], name: 'Сосулька', w: 0.2 },
    { spr: 'plant_nest', item: 'mouse_nest', n: [1, 1], name: 'Мышиное гнездо', w: 0.15 },
    { spr: 'plant_bark', item: 'birch_bark', n: [1, 3], name: 'Береста', w: 0.6 }
  ];

  function spawnWorld(R) {
    var W = WS.World;
    // лес: северная половина карты
    var placed = 0;
    var tries = 0;
    while (placed < 130 && tries < 3000) {
      tries++;
      var x = 4 + Math.floor(R.f() * (W.w - 8));
      var y = 4 + Math.floor(R.f() * 74);   // лес
      var t = W.tileAt(x, y);
      if (t !== W.T.GRASS && t !== W.T.GRASS2 && t !== W.T.SNOW && t !== W.T.DIRT) continue;
      if (W.isTileBlocked(x, y)) continue;
      var pick = R.weighted(PLANTS);
      if (pick.nearBirch) {
        // рядом должна быть берёза
        var found = false;
        var objs = W.objsAt(x - 1, y - 1).concat(W.objsAt(x + 1, y), W.objsAt(x, y + 1));
        for (var i = 0; i < objs.length; i++) {
          if (objs[i].sprName === 'tree_birch') { found = true; break; }
        }
        if (!found) continue;
      }
      var spr = pick.spr;
      W.addObject({
        x: x + 0.5, y: y + 0.5,
        sprName: spr, solid: false,
        forage: { item: pick.item, n: R.int(pick.n[0], pick.n[1]) },
        name: pick.name
      });
      placed++;
    }
    WS.log('[forage] размещено растений:', placed);
  }

  // ================================================================ ПОИСК ПОД СНЕГОМ
  var searching = null;

  function trySearchGround() {
    var m = WS.Input.mouse();
    return searchGroundAt(m.tx, m.ty);
  }

  /** Поиск под снегом в указанной точке (бот-автопилот ищет под собой). */
  function searchGroundAt(tx, ty) {
    if (searching) return false;
    var p = WS.G.player;
    if (!p) return false;
    // рядом с игроком?
    if (WS.M.dist(p.x, p.y, tx + 0.5, ty + 0.5) > 2.5) {
      toast('Слишком далеко.', 'warn');
      return false;
    }
    var t = WS.World.tileAt(tx, ty);
    if (t !== WS.World.T.GRASS && t !== WS.World.T.GRASS2 && t !== WS.World.T.SNOW && t !== WS.World.T.SNOW_DEEP) {
      toast('Здесь искать нечего.', 'warn');
      return false;
    }
    if (WS.World.isInside(tx, ty)) {
      toast('Это не лес.', 'warn');
      return false;
    }
    searching = { t: 0, dur: 5, tx: tx, ty: ty };
    toast('Искать под снегом...', 'info');
    WS.Ev.emit('noise', { x: p.x, y: p.y, r: 4 });
    return true;
  }

  var GROUND_FINDS = [
    { id: 'dry_grass', w: 30, n: [1, 4], txt: 'пучок сухой травы' },
    { id: 'pine_branch', w: 20, n: [1, 2], txt: 'еловую лапку' },
    { id: 'birch_bark', w: 18, n: [1, 3], txt: 'кусок бересты' },
    { id: 'frozen_berries', w: 10, n: [1, 2], txt: 'несколько ягод брусники' },
    { id: 'mouse_nest', w: 6, n: [1, 1], txt: 'мышиное гнездо — тёплая подстилка' },
    { id: 'angelica_root', w: 5, n: [1, 1], txt: 'корень дягиля' },
    { id: 'bad_mushroom', w: 8, n: [1, 2], txt: 'поганку (несъедобна!)' },
    { id: null, w: 25, n: [0, 0], txt: null }
  ];

  function updateSearch(dt) {
    if (!searching) return;
    searching.t += dt;
    if (searching.t < searching.dur) return;
    var done = searching;
    searching = null;
    // усталость
    WS.G.player.needs.fatigue = Math.max(0, WS.G.player.needs.fatigue - 5);
    // шанс находки зависит от навыка
    var lv = WS.Skills && WS.Skills.lvid ? WS.Skills.lvid('forage') : 0;
    var chance = 0.35 + lv * 0.08;
    if (Math.random() > chance) {
      toast('Под снегом ничего не нашлось.', 'warn');
      return;
    }
    var pool = GROUND_FINDS.slice();
    // фильтр: поганка только с навыком 1+ (иначе не отличил бы)
    if (lv < 1) {
      var filtered = [];
      for (var i = 0; i < pool.length; i++) if (pool[i].id !== 'bad_mushroom') filtered.push(pool[i]);
      pool = filtered;
    }
    var pick = pool[Math.floor(Math.random() * pool.length)];
    // взвешенный выбор вручную
    var total = 0, k;
    for (k = 0; k < pool.length; k++) total += pool[k].w;
    var r = Math.random() * total;
    for (k = 0; k < pool.length; k++) {
      r -= pool[k].w;
      if (r <= 0) { pick = pool[k]; break; }
    }
    if (!pick.id) {
      toast('Под снегом ничего не нашлось.', 'warn');
      if (WS.Skills && WS.Skills.addXp) WS.Skills.addXp('forage', 1);
      return;
    }
    var n = pick.n[0] + Math.floor(Math.random() * (pick.n[1] - pick.n[0] + 1));
    var got = give(pick.id, n);
    if (got > 0) {
      toast('Вы нашли ' + pick.txt + (got > 1 ? ' ×' + got : '') + '.', 'good');
      WS.Snd.play('pickup');
      if (WS.Skills && WS.Skills.addXp) WS.Skills.addXp('forage', 2 + lv);
      WS.Ev.emit('item:picked', { id: pick.id, count: got, from: 'forage' });
    }
  }

  // ================================================================ СБОР РАСТЕНИЙ
  function tryHarvest(o) {
    if (!o || !o.forage) return false;
    var got = give(o.forage.item, o.forage.n);
    if (got > 0) {
      toast('Собрано: ' + (o.name || o.forage.item) + (got > 1 ? ' ×' + got : ''), 'good');
      WS.Snd.play('chop', { x: o.x, y: o.y, vol: 0.3 });
      WS.Fx.burst('snow', o.x, o.y, 5);
      if (WS.Skills && WS.Skills.addXp) WS.Skills.addXp('forage', 2);
      WS.World.removeObject(o);
      WS.Ev.emit('item:picked', { id: o.forage.item, count: got, from: 'plant' });
      return true;
    }
    toast('Некуда положить.', 'warn');
    return true;   // обработали взаимодействие
  }

  /** Есть ли под мышью собираемое растение. */
  function plantAt(tx, ty) {
    var objs = WS.World.objsAt(tx, ty);
    for (var i = 0; i < objs.length; i++) {
      if (objs[i].forage) return objs[i];
    }
    return null;
  }

  // ================================================================ ТАЯНИЕ СНЕГА (вода)
  function meltSnow() {
    // у огня: сосулька/снег → вода
    var p = WS.G.player;
    // FIX (демо-этап): раньше звали несуществующий WS.Fire.isFireNear —
    // функция всегда возвращала false и сосульку нельзя было растопить.
    // Теперь используем реальный WS.Fire.near(x, y, r).
    var fire = (WS.Fire && WS.Fire.near) ? WS.Fire.near(p.x, p.y, 2.5) : null;
    if (!fire) {
      toast('Нужен огонь рядом.', 'warn');
      return false;
    }
    var haveIcicle = WS.Inv && WS.Inv.count ? WS.Inv.count('icicle_chunk') : 0;
    var havePot = WS.Inv && WS.Inv.count ? WS.Inv.count('pot_cast') : 0;
    if (haveIcicle <= 0 && havePot <= 0) {
      // просто растопить снег котелком
      toast('Нужна сосулька или котелок со снегом.', 'warn');
      return false;
    }
    if (haveIcicle > 0) {
      WS.Inv.take('icicle_chunk', 1);
      var g = WS.Inv.give('water_flask', 1);
      if (g > 0) {
        toast('Сосулька растаяла — чистая вода.', 'good');
        WS.Snd.play('drink');
        return true;
      }
      // вода не влезла — вернуть
      WS.Inv.give('icicle_chunk', 1);
      toast('Некуда налить воду.', 'warn');
    }
    return false;
  }

  // ================================================================ РУБКА ВЕТОК (возобновляемое топливо)
  // Деревья не исчезают: с каждого раз в сутки можно нарубить бревно и
  // лапника. Без этого к Д25 посёлок вычищен и герой замерзает без дров
  // (структурная дыра баланса, найдена роем агентов).

  var TREE_SPRS = { tree_pine: 1, tree_pine_small: 1, tree_birch: 1 };

  function isTree(o) {
    return !!(o && TREE_SPRS[String(o.sprName || '')]);
  }

  function treeAt(tx, ty) {
    var objs = WS.World.objsAt(tx, ty);
    for (var i = 0; i < objs.length; i++) if (isTree(objs[i])) return objs[i];
    return null;
  }

  var chopping = null;   // {t, dur, o, day, sndT}

  function tryChopTree(o) {
    if (!o || !isTree(o)) return false;
    var p = WS.G.player;
    if (!p) return false;
    if (WS.M.dist(p.x, p.y, o.x, o.y) > 2.2) {
      toast('Подойдите к дереву.', 'warn');
      return true;                       // клик обработан
    }
    if (chopping) { toast('Руки заняты', 'warn'); return true; }
    var hasAxe = WS.Inv && WS.Inv.count ? WS.Inv.count('axe') : 0;
    var day = WS.Time ? WS.Time.day() : 0;
    if (o._chopDay === day) {
      toast('С этого дерева сегодня нарублено — ищите следующее.', 'warn');
      return true;
    }
    if (hasAxe) {
      chopping = { t: 0, dur: 20, o: o, day: day, sndT: 0, axe: true };
      toast('Рубим ветки и валежник…', 'info');
      WS.Ev.emit('noise', { x: o.x, y: o.y, r: 10 });   // волки слышат топор
    } else {
      // БЕЗ ТОПОРА: ломать сухие сучья руками — дольше, без брёвен,
      // но лапник и береста тоже горят (выживание без топора возможно)
      chopping = { t: 0, dur: 45, o: o, day: day, sndT: 0, axe: false };
      toast('Ломаю сухые сучья руками — без топора только лапник…', 'info');
      WS.Ev.emit('noise', { x: o.x, y: o.y, r: 6 });
    }
    return true;
  }

  function updateChop(dt) {
    if (!chopping) return;
    var o = chopping.o;
    if (WS.World.objects.indexOf(o) < 0) { chopping = null; return; }
    chopping.t += dt;
    chopping.sndT -= dt;
    if (chopping.sndT <= 0) {
      chopping.sndT = 2.2;
      WS.Snd.play('chop', { x: o.x, y: o.y, vol: chopping.axe ? 0.5 : 0.25 });
      WS.Ev.emit('noise', { x: o.x, y: o.y, r: chopping.axe ? 10 : 6 });
      WS.Fx.burst('snow', o.x, o.y - 0.5, 3);
    }
    if (chopping.t < chopping.dur) return;
    var day = chopping.day;
    var withAxe = chopping.axe;
    chopping = null;
    var p = WS.G.player;
    if (!p) return;
    p.needs.fatigue = Math.max(0, (p.needs.fatigue || 0) - (withAxe ? 8 : 12));
    o._chopDay = day;                                   // раз в сутки с дерева
    if (withAxe) {
      var logs = 1 + (Math.random() < 0.35 ? 1 : 0);
      var got = WS.Inv.give('log', logs);
      var lap = 1 + (Math.random() < 0.5 ? 1 : 0);
      WS.Inv.give('pine_branch', lap);
      toast('Нарублено: бревно ×' + got + ', еловая лапка ×' + lap + '.', 'good');
      try { WS.Ev.emit('tree:chopped', { o: o, logs: got }); } catch (e) { /* пусто */ }
    } else {
      var lap2 = 2 + (Math.random() < 0.5 ? 1 : 0);
      WS.Inv.give('pine_branch', lap2);
      WS.Inv.give('birch_bark', 1);
      toast('Наломано: еловая лапка ×' + lap2 + ', береста ×1.', 'good');
      try { WS.Ev.emit('tree:chopped', { o: o, logs: 0 }); } catch (e) { /* пусто */ }
    }
    WS.Snd.play('pickup');
    if (WS.Skills && WS.Skills.addXp) WS.Skills.addXp('axe', withAxe ? 4 : 1);
  }

  function isChopping() { return !!chopping; }

  // ================================================================ ТИК И СОБЫТИЯ
  WS.boot(function initForage() {
    defItems();
    defSprites();
    // спавн растений после генерации мира
    WS.Ev.on('gen:interiors', function (d) {
      var R = d && d.R ? d.R : WS.RNG.mk(999);
      spawnWorld(R);
    });
    // поиск под снегом + рубка
    WS.tick(42, function forageTick(dt) {
      if (!WS.G || !WS.G.running || !WS.G.player) return;
      updateSearch(dt);
      updateChop(dt);
    }, 'forage:search');
    // контекстное действие: ПКМ по растениям — СБОР; Alt+ПКМ по снегу — ПОИСК
    WS.Ev.on('mouse:down', function (m) {
      if (!WS.G || !WS.G.running || (WS.Ui && WS.Ui.modal && WS.Ui.modal())) return;
      if (m.button !== 2) return;
      var plant = plantAt(WS.Input.mouse().tx, WS.Input.mouse().ty);
      if (plant) { tryHarvest(plant); return; }
    });
  }, 'forage:init');

  WS.def('Forage', {
    trySearchGround: trySearchGround,
    searchGroundAt: searchGroundAt,
    tryHarvest: tryHarvest,
    plantAt: plantAt,
    meltSnow: meltSnow,
    tryChopTree: tryChopTree,
    treeAt: treeAt,
    isTree: isTree,
    isChopping: isChopping,
    isSearching: function () { return !!searching; },
    progress: function () { return searching ? searching.t / searching.dur : 0; },
    PLANTS: PLANTS
  });
})();
