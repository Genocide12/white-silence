/**
 * СИСТЕМА ОБЫСКА И ТРУПОВ. WS.Loot.fill/search/take/makeCorpse/dropItem.
 * Контейнеры лениво наполняются при первом обыске (детерминизм: seed от id объекта и seed мира).
 */
(function () {
  'use strict';

  /** Спрайты трупов и дропа. */
  function defCorpseSprites() {
    var S = WS.Spr;
    // лежачий силуэт зверя: вытянутое тело, лапы, кровь
    S.def('corpse_wolf', { w: 52, h: 26, draw: function (c, w, h) {
      S.px(c, 8, 12, 34, 10, '#8b909b');          // тело
      S.px(c, 2, 10, 10, 9, '#a7adb8');           // голова
      S.px(c, 0, 8, 4, 3, '#5a5f6a');             // морда
      S.px(c, 14, 22, 4, 4, '#8b909b');           // лапа
      S.px(c, 30, 22, 4, 4, '#8b909b');
      S.px(c, 20, 6, 8, 7, '#8b909b');            // бок
      S.ell(c, 26, 24, 24, 6, 'rgba(122,32,32,0.5)'); // кровь
    }});
    S.def('corpse_bear', { w: 64, h: 34, draw: function (c) {
      S.px(c, 8, 14, 46, 16, '#4e3b2c');
      S.px(c, 2, 12, 12, 12, '#634c39');
      S.px(c, 16, 30, 6, 4, '#4e3b2c');
      S.px(c, 40, 30, 6, 4, '#4e3b2c');
      S.ell(c, 32, 32, 30, 7, 'rgba(122,32,32,0.5)');
    }});
    S.def('corpse_deer', { w: 56, h: 26, draw: function (c) {
      S.px(c, 10, 12, 34, 9, '#96714f');
      S.px(c, 2, 8, 10, 7, '#a5825f');
      S.px(c, 3, 3, 2, 6, '#7a5c40'); S.px(c, 6, 2, 2, 7, '#7a5c40'); // рога
      S.px(c, 18, 21, 3, 4, '#96714f'); S.px(c, 34, 21, 3, 4, '#96714f');
      S.ell(c, 28, 24, 24, 5, 'rgba(122,32,32,0.45)');
    }});
    S.def('corpse_hare', { w: 28, h: 16, draw: function (c) {
      S.px(c, 6, 8, 16, 6, '#c8ccd2');
      S.px(c, 2, 7, 6, 5, '#c8ccd2');
      S.px(c, 22, 5, 3, 6, '#c8ccd2');           // ухо
      S.ell(c, 14, 14, 12, 3, 'rgba(122,32,32,0.4)');
    }});
    S.def('corpse_bandit', { w: 44, h: 22, draw: function (c) {
      S.px(c, 10, 8, 22, 8, '#4a5568');          // шинель
      S.px(c, 4, 6, 8, 6, '#c9a186');            // голова
      S.px(c, 2, 5, 4, 3, '#3c4656');            // папаха
      S.px(c, 30, 10, 14, 2, '#57422e');         // винтовка рядом
      S.ell(c, 22, 18, 20, 5, 'rgba(122,32,32,0.5)');
    }});
    S.def('corpse_crow', { w: 20, h: 12, draw: function (c) {
      S.ell(c, 10, 7, 8, 4, '#1c1f26');
      S.ell(c, 16, 6, 3, 2, '#1c1f26');
    }});
    S.def('corpse_generic', { w: 40, h: 20, draw: function (c) {
      S.px(c, 8, 8, 22, 8, '#6a6f78');
      S.ell(c, 20, 17, 18, 4, 'rgba(122,32,32,0.4)');
    }});
    S.def('drop_pouch', { w: 18, h: 14, draw: function (c) {
      S.ell(c, 9, 8, 7, 5, '#7d6a52');
      S.px(c, 7, 1, 4, 4, '#57422e');
      S.ell(c, 9, 12, 7, 2, 'rgba(8,12,22,0.3)');
    }});
    S.def('blood_pool', { w: 36, h: 18, draw: function (c, w, h, f, d, v) {
      var r = 0.6 + 0.4 * (v / 4 || 0.5);
      c.globalAlpha = 0.55;
      S.ell(c, 18, 9, 16 * r, 7 * r, '#7a2020');
      S.ell(c, 14, 8, 8 * r, 4 * r, '#8f2a26');
      c.globalAlpha = 1;
    }});
  }

  /** Генерация содержимого контейнера. */
  function fill(o) {
    if (!o || !o.container) return;
    if (o.inv && o.inv.length) return;   // уже наполнен
    var table = WS.Data.loot ? WS.Data.loot[o.container] : null;
    if (!table) { o.inv = []; return; }
    // детерминированный RNG: id объекта + seed мира
    var seed = (WS.RNG.strHash(o.id || ('o' + o.x + ',' + o.y)) ^ (WS.G ? WS.G.seed : 0)) >>> 0;
    var R = WS.RNG.mk(seed);
    var rolls = R.int(table.rolls[0], table.rolls[1]);
    var inv = [];
    var items = table.items.slice();
    for (var i = 0; i < rolls; i++) {
      var pick = R.weighted(items);
      if (!pick || !pick.id) continue;
      var count = R.int(pick.min, pick.max);
      if (count <= 0) continue;
      // стакается ли
      var spec = WS.Data.items ? WS.Data.items[pick.id] : null;
      var stack = spec && spec.stack ? spec.stack : 1;
      var merged = false;
      if (stack > 1) {
        for (var k = 0; k < inv.length; k++) {
          if (inv[k].id === pick.id && inv[k].count < stack) {
            var add = Math.min(count, stack - inv[k].count);
            inv[k].count += add; count -= add; merged = true;
            if (count <= 0) break;
          }
        }
      }
      if (count > 0) inv.push({ id: pick.id, count: count });
    }
    o.inv = inv;
    o.looted = false;
  }

  /** Обыск (2-4 сек). Возвращает true если начат. */
  var searching = null;    // {o, t, dur}

  function search(o) {
    if (!o || !o.container) return false;
    if (searching) return false;
    fill(o);
    searching = { o: o, t: 0, dur: 2 + Math.random() * 2 };
    if (WS.Fx) WS.Fx.text('Обыск...', o.x, o.y - 0.5, { col: '#9db0c8' });
    WS.Ev.emit('noise', { x: o.x, y: o.y, r: 6 });
    WS.Snd.play('build', { x: o.x, y: o.y, vol: 0.3 });
    return true;
  }

  function updateSearch(dt) {
    if (!searching) return;
    searching.t += dt;
    var p = WS.G ? WS.G.player : null;
    // прогресс над объектом
    if (searching.t < searching.dur) {
      if (WS.Fx && Math.random() < dt * 8) {
        WS.Fx.spawn('smoke', searching.o.x, searching.o.y, { z: 20, life: 0.4 });
      }
      return;
    }
    // завершён
    var o = searching.o;
    searching = null;
    o.looted = true;
    var found = (o.inv && o.inv.length) || 0;
    WS.Snd.play('pickup', { vol: 0.6 });
    if (WS.Ui && WS.Ui.openContainer) {
      WS.Ui.openContainer(o);
    } else if (WS.Fx) {
      if (found > 0) WS.Fx.text('Найдено: ' + found, o.x, o.y - 0.8, { col: '#d8a45c' });
      else WS.Fx.text('Пусто', o.x, o.y - 0.8, { col: '#8b95a5' });
    }
    WS.Ev.emit('loot:searched', { o: o, count: found });
  }

  /** Забрать предмет из контейнера в инвентарь игрока. */
  function take(o, index, count) {
    if (!o.inv || !o.inv[index]) return false;
    var slot = o.inv[index];
    var n = Math.min(count || slot.count, slot.count);
    var given = 0;
    if (WS.Inv && WS.Inv.give) given = WS.Inv.give(slot.id, n);
    else if (WS.Action && WS.Action.give) given = WS.Action.give(slot.id, n);
    if (given <= 0) return false;
    slot.count -= given;
    if (slot.count <= 0) o.inv.splice(index, 1);
    o.inv._dirty = true;
    var spec = WS.Data.items ? WS.Data.items[slot.id] : null;
    if (WS.Fx) WS.Fx.text('+' + given + ' ' + (spec ? (WS.I18N && WS.I18N.t ? WS.I18N.t('item.' + slot.id + '.name') : slot.id) : ''), o.x, o.y - 0.8, { col: '#7ea36a' });
    WS.Snd.play('pickup');
    WS.Ev.emit('item:picked', { id: slot.id, count: given });
    if (WS.G && WS.G.stats) WS.G.stats.containersLooted++;
    return true;
  }

  /** Взять всё. */
  function takeAll(o) {
    if (!o || !o.inv) return 0;
    var n = 0;
    for (var i = o.inv.length - 1; i >= 0; i--) {
      if (take(o, i, o.inv[i].count)) n++;
    }
    return n;
  }

  /** Труп сущности. */
  function makeCorpse(x, y, kind) {
    var spr = 'corpse_generic';
    var known = ['wolf', 'bear', 'deer', 'hare', 'bandit', 'crow'];
    for (var i = 0; i < known.length; i++) {
      if (kind === known[i]) { spr = 'corpse_' + kind; break; }
    }
    var cont = (WS.Data.loot && WS.Data.loot[kind + '_body']) ? kind + '_body' : null;
    var o = WS.World.addObject({
      x: x, y: y,
      sprName: spr,
      solid: false,
      name: 'Труп',
      container: cont,
      corpse: true
    });
    if (WS.G && WS.G.stats) {
      if (kind === 'wolf') WS.G.stats.wolvesKilled++;
      else if (kind === 'bear') WS.G.stats.bearsKilled++;
      else if (kind === 'bandit') WS.G.stats.banditsKilled++;
      else if (kind === 'deer' || kind === 'hare') WS.G.stats.animalsHunted++;
    }
    // лужа крови
    if (WS.Fx) WS.Fx.burst('blood', x, y, 10);
    WS.Ev.emit('blood', { x: x, y: y, r: 12 });   // волки почуют
    return o;
  }

  /** Дроп предмета на пол (объект-мешочек). */
  function dropItem(id, count, x, y) {
    var o = WS.World.addObject({
      x: x, y: y,
      sprName: 'drop_pouch',
      solid: false,
      name: 'Вещи',
      drop: { id: id, count: count || 1 }
    });
    return o;
  }

  /** Подбор дропа с земли. */
  function pickupDrop(o) {
    if (!o || !o.drop) return false;
    var d = o.drop;
    var given = 0;
    if (WS.Inv && WS.Inv.give) given = WS.Inv.give(d.id, d.count);
    else if (WS.Action && WS.Action.give) given = WS.Action.give(d.id, d.count);
    if (given <= 0) return false;
    WS.World.removeObject(o);
    WS.Ev.emit('item:picked', { id: d.id, count: given });
    return true;
  }

  /** Сериализация состояния контейнеров (для сейва). */
  function serialize() {
    var st = {};
    var objs = WS.World.objects;
    for (var i = 0; i < objs.length; i++) {
      var o = objs[i];
      if (o.inv && o.inv._dirty) st[o.id] = o.inv;
      else if (o.looted) st[o.id] = [];
    }
    return st;
  }

  WS.boot(function initLoot() {
    defCorpseSprites();
    WS.tick(42, function lootTick(dt) { updateSearch(dt); }, 'loot:search');
    // трупы при смерти сущностей
    WS.Ev.on('ent:kill', function (d) {
      var e = d && d.ent;
      if (!e || e.noCorpse) return;
      if (e.kind === 'player') return;
      makeCorpse(e.x, e.y, e.kind);
    });
  }, 'loot:init');

  WS.def('Loot', {
    fill: fill,
    search: search,
    take: take,
    takeAll: takeAll,
    makeCorpse: makeCorpse,
    dropItem: dropItem,
    pickupDrop: pickupDrop,
    serialize: serialize,
    isSearching: function () { return !!searching; },
    progress: function () { return searching ? searching.t / searching.dur : 0; }
  });
})();
