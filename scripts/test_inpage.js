/**
 * test_inpage.js — ПОЛНЫЙ ТЕСТ-НАБОР «БЕЛОГО БЕЗМОЛВИЯ» (инжектится в живую игру).
 *
 * Секции:
 *   S0 санитария партии            S1 действия игрока (все глаголы)
 *   S2 предметы × игрок (ВСЕ)      S3 предметы × предметы (ВСЕ рецепты)
 *   S4 локализация RU/EN           S5 банк фраз (качество/дубли/плейсхолдеры)
 *
 * Ничего не мокает: только настоящие WS.API и ускорение времени через
 * штатные тики (как демо-режим). Возвращает JSON-отчёт в window.__WS_TEST_RESULT.
 */
(function () {
  'use strict';

  function runFullTests() {
    var R = { tests: 0, pass: 0, fail: 0, warn: 0, failures: [], warns: [], skips: [] };

    function ok(name, cond, info) {
      R.tests++;
      if (cond) { R.pass++; return true; }
      R.fail++;
      R.failures.push({ name: name, info: info === undefined ? null : info });
      return false;
    }
    function warn(name, info) {
      R.warn++;
      R.warns.push({ name: name, info: info === undefined ? null : info });
    }
    function skip(name, why) { R.skips.push({ name: name, why: why }); }

    var G = WS.G, p = G && G.player;
    var secs = function () { return (performance.now() / 1000).toFixed(1); };

    // ---------- утилиты ----------
    function pump(sub, dt, n) {
      var fns = WS._tickFns || [];
      var hit = 0;
      for (var i = 0; i < fns.length; i++) {
        if (fns[i].name && fns[i].name.indexOf(sub) >= 0) {
          for (var k = 0; k < (n || 1); k++) {
            try { fns[i].fn(dt || 9999); hit++; } catch (e) { return 'ERR:' + e.message; }
          }
        }
      }
      return hit;
    }
    function invIdx(id) {
      var inv = p.inv || [];
      for (var i = 0; i < inv.length; i++) if (inv[i] && inv[i].id === id) return i;
      return -1;
    }
    function count(id) { return (WS.Inv && WS.Inv.count ? WS.Inv.count(id) : WS.Action.countItem(id)) || 0; }
    function give(id, n) { return WS.Inv ? WS.Inv.give(id, n) : WS.Action.give(id, n); }
    function consume(id, n) { return WS.Inv ? WS.Inv.consume(id, n) : WS.Action.consume(id, n); }
    function teleport(x, y) { p.x = x; p.y = y; if (WS.Cam && WS.Cam.center) { try { WS.Cam.center(); } catch (e) { } } }
    function setSkills(lv) {
      var ids = WS.Skills && WS.Skills.list ? WS.Skills.list() : null;
      p.skills = p.skills || {};
      var src = ids || ['axe', 'melee', 'firearm', 'sneak', 'run', 'cook', 'carpentry', 'tailor', 'survive', 'forage', 'track', 'fish', 'hunt', 'med'];
      for (var i = 0; i < src.length; i++) {
        var id = src[i].id || src[i];
        p.skills[id] = { lv: lv, xp: 0 };
      }
    }
    function clearInv() {
      p.inv = [];
      p.equip = {};
    }

    // ====================================================================
    // S0. САНИТАРИЯ ПАРТИИ
    // ====================================================================
    ok('[S0] партия запущена', !!(G && G.running && p), { running: !!(G && G.running) });
    ok('[S0] мир сгенерирован', WS.World && WS.World.objects && WS.World.objects.length > 100, { objects: WS.World ? WS.World.objects.length : 0 });
    ok('[S0] реестр предметов', WS.Data && WS.Data.items && Object.keys(WS.Data.items).length >= 440, { n: WS.Data && WS.Data.items ? Object.keys(WS.Data.items).length : 0 });
    ok('[S0] реестр рецептов', WS.Data && WS.Data.recipes && WS.Data.recipes.length >= 240, { n: WS.Data && WS.Data.recipes ? WS.Data.recipes.length : 0 });

    // ====================================================================
    // S1. ДЕЙСТВИЯ ИГРОКА (все глаголы)
    // ====================================================================
    var objs = WS.World.objects;
    function findBy(fn) {
      for (var i = 0; i < objs.length; i++) if (fn(objs[i])) return objs[i];
      return null;
    }

    // --- дверь ---
    var door = findBy(function (o) { return o.door && !o.locked; });
    if (!door) skip('[S1] дверь', 'в мире нет незапертой двери');
    else {
      teleport(door.x + 1.2, door.y + 0.5);
      var wasOpen = !!door.open;
      var r1 = WS.Action.toggleDoor(door);
      ok('[S1] дверь: открыть/закрыть', r1 !== false && !!door.open !== wasOpen, { was: wasOpen, now: !!door.open });
      WS.Action.toggleDoor(door);
      ok('[S1] дверь: вернуть', !!door.open === wasOpen, {});
      var acts = WS.Action.actionsFor(door, false);
      ok('[S1] дверь: меню действий', acts.length > 0 && /Открыть|Закрыть/.test(acts[0].label), { acts: acts.map(function (a) { return a.label; }) });
      ok('[S1] дверь: quickAction', typeof WS.Action.quickAction(door) !== 'undefined', {});
    }

    // --- контейнер ---
    var cont = findBy(function (o) { return o.container && !o.corpse; });
    if (!cont) skip('[S1] контейнер', 'нет контейнеров');
    else {
      teleport(cont.x + 1.0, cont.y + 0.5);
      cont.looted = false;
      var r2 = WS.Action.searchContainer(cont);
      pump('sys:loot', 99, 3);
      var gotModal = WS.Ui && WS.Ui.modal && WS.Ui.modal();
      if (WS.Ui && WS.Ui.closeAll) { try { WS.Ui.closeAll(); } catch (e) { } }
      ok('[S1] контейнер: обыск', r2 !== false, { modalOpened: !!gotModal });
      var acts2 = WS.Action.actionsFor(cont, false);
      ok('[S1] контейнер: меню действий', acts2.length > 0, { acts: acts2.map(function (a) { return a.label; }) });
    }

    // --- печь ---
    var pech = findBy(function (o) { return o.sprName === 'pech' || o.sprName === 'stove_iron'; });
    if (!pech) skip('[S1] печь', 'нет печи в мире');
    else {
      clearInv(); give('firewood_bundle', 5); give('matches', 10);
      teleport(pech.x + 1.1, pech.y + 0.5);
      var lit = WS.Fire && WS.Fire.lightStove ? WS.Fire.lightStove(pech) : null;
      var litOk = lit === true || (pech.fire && pech.fireData && pech.fireData.fuel > 0);
      ok('[S1] печь: затопить', !!litOk, { lit: lit, fuel: pech.fireData ? pech.fireData.fuel : null });
      var acts3 = WS.Action.actionsFor(pech, false);
      ok('[S1] печь: меню действий (дрова/топится)', acts3.length > 0, { acts: acts3.map(function (a) { return a.label; }) });
    }

    // --- костёр (свет) ---
    clearInv(); give('firewood_bundle', 3); give('newspaper_stack', 2); give('matches', 3);
    // ищем СВОБОДНУЮ клетку на улице (после телепорта к печи дед стоит в доме —
    // p.y-1 упирается в мебель, «здесь не развести огонь» — тест, не игра)
    var cf = null;
    var vc = (WS.AI && WS.AI.village) ? WS.AI.village : { x: 110, y: 115 };
    outer:
    for (var ry = 0; ry < 14; ry++) {
      for (var rx = 0; rx < 14; rx++) {
        var cx = Math.floor(vc.x) + (rx - 7), cy = Math.floor(vc.y) + (ry - 7);
        if (WS.World.isTileBlocked && WS.World.isTileBlocked(cx, cy)) continue;
        if (WS.World.isInside && WS.World.isInside(cx + 0.5, cy + 0.5)) continue;
        teleport(cx + 0.5, cy + 0.5);
        cf = WS.Fire && WS.Fire.lightCampfire ? WS.Fire.lightCampfire(cx + 0.5, cy - 0.5) : null;
        if (cf === true || (cf && cf.ok) || (cf && cf.x !== undefined)) break outer;
      }
    }
    ok('[S1] костёр: разжечь', cf === true || !!(cf && cf.ok) || !!(cf && cf.x !== undefined), { res: cf });

    // --- бой: манекен-волк ---
    var dummy = { kind: 'wolf', x: p.x + 1.0, y: p.y, hp: 1000, maxHp: 1000, dead: false, _test: true };
    try { WS.World.ents.push(dummy); } catch (e) { dummy = null; }
    if (dummy) {
      clearInv(); give('axe_split', 1);
      var ai = invIdx('axe_split');
      if (ai >= 0 && WS.Inv && WS.Inv.equip) WS.Inv.equip('hand1', ai);
      var m = WS.Input.mouse();
      m.wx = dummy.x; m.wy = dummy.y; m.tx = Math.floor(dummy.x); m.ty = Math.floor(dummy.y);
      p._atkCd = 0; p._swingT = 0;
      var hits = WS.Action.meleeAttack();
      pump('sys:ai', 5, 2);  // дать урон доехать (если через AI-очередь)
      ok('[S1] ближний бой: урон по цели', dummy.hp < 1000 || hits > 0, { hp: dummy.hp, hits: hits });
      // выстрел
      var ranged = null;
      for (var idr in WS.Data.items) {
        var dr = WS.Data.items[idr];
        if (dr.cat === 'ranged' && dr.ammo) { ranged = idr; break; }
      }
      if (!ranged) {
        for (var idr2 in WS.Data.items) {
          var dr2 = WS.Data.items[idr2];
          if (dr2.cat === 'ranged') { ranged = idr2; if (dr2.ammo) break; }
        }
      }
      if (!ranged) skip('[S1] огнестрел', 'нет ranged-предмета с полем ammo');
      else {
        var rdef = WS.Data.items[ranged];
        clearInv(); give(ranged, 1);
        if (rdef.ammo) give(rdef.ammo, 20);
        var ari = invIdx(ranged);
        if (ari >= 0 && WS.Inv && WS.Inv.equip) WS.Inv.equip('hand1', ari);
        var ammoBefore = rdef.ammo ? count(rdef.ammo) : -1;
        m.wx = dummy.x; m.wy = dummy.y;
        p._fireCd = 0; p._reloadT = 0; p._swingT = 0;
        var shot = WS.Action.fireWeapon();
        ok('[S1] огнестрел: выстрел', shot !== false, { shot: shot, weapon: ranged });
        if (rdef.ammo) {
          var ammoAfter = count(rdef.ammo);
          var rl = WS.Action.tryReload();
          ok('[S1] огнестрел: перезарядка', rl !== undefined, { reload: rl, ammoBefore: ammoBefore, ammoAfter: ammoAfter });
        }
      }
      // чистим манекен
      var ix = WS.World.ents.indexOf(dummy);
      if (ix >= 0) WS.World.ents.splice(ix, 1);
    }

    // --- свет: факел ---
    clearInv(); give('torch', 2); give('matches', 5);
    var ti = invIdx('torch');
    if (ti >= 0 && WS.Inv && WS.Inv.equip) WS.Inv.equip('hand1', ti);
    var l1 = WS.Action.toggleLight();
    var hasLight = !!(p._light && p._light.id === 'torch');
    ok('[S1] факел: зажечь', hasLight || l1 === true, { light: p._light ? p._light.id : null });
    WS.Action.removeLight();
    ok('[S1] факел: погасить', !p._light, {});

    // --- дроп/подбор ---
    clearInv(); give('nails', 5);
    var nBefore = count('nails');
    if (WS.Action.makeDrop) {
      // makeDrop(id, count, cond, x, y) — дропы живут в World.ents (kind 'drop')
      var drop = WS.Action.makeDrop('nails', 3, undefined, p.x + 0.4, p.y + 0.2);
      var found = drop && (WS.World.ents.indexOf(drop) >= 0 || drop.x !== undefined);
      ok('[S1] дроп: предмет на землю', !!found, { drop: drop ? drop.itemId : null });
      if (drop) {
        var n0 = count('nails');
        var pu = WS.Action.pickupDrop(drop);
        ok('[S1] дроп: подобрать обратно', count('nails') === n0 + 3 || pu === true, { before: n0, after: count('nails'), pu: pu });
      }
    } else skip('[S1] дроп', 'нет makeDrop');
    ok('[S1] инвентарь: выдано/списано', nBefore >= 5 && count('nails') >= 0, {});

    // ====================================================================
    // S2. ПРЕДМЕТЫ × ИГРОК (все предметы реестра)
    // ====================================================================
    var items = WS.Data.items;
    var cats = {};
    var noName = [], noNameEn = [], eatFail = [], drinkFail = [], equipFail = [], medFail = [], readFail = [];
    var nEdible = 0, nDrink = 0, nCloth = 0, nHand = 0, nMed = 0, nRead = 0;
    var ids = Object.keys(items);
    for (var ii = 0; ii < ids.length; ii++) {
      var id = ids[ii], def = items[id];
      cats[def.cat] = (cats[def.cat] || 0) + 1;
      // имя RU/EN
      var kRu = 'item.' + id + '.name';
      var ru = WS.Data.locales && WS.Data.locales.ru ? WS.Data.locales.ru[kRu] : null;
      var en = WS.Data.locales && WS.Data.locales.en ? WS.Data.locales.en[kRu] : null;
      if (!ru) noName.push(id);
      if (!en) noNameEn.push(id);
      // данные
      if (typeof def.w !== 'number' || def.w < 0) warn('[S2] вес предмета', { id: id, w: def.w });
      // выдать/списать — в ИЗОЛЯЦИИ: чистый инвентарь на каждый предмет,
      // иначе жёсткий потолок веса (×2 от maxWeight) съедает хвост списка
      clearInv();
      give(id, 2);
      if (count(id) < 1) { equipFail.push(id + ':give'); continue; }
      consume(id, 1);
      // применение по типу
      var tags = def.tags || [];
      var edible = tags.indexOf('edible') >= 0 || (def.cal && def.cal > 0);
      var drinkable = tags.indexOf('drinkable') >= 0 || def.thir > 0;
      if (edible) {
        nEdible++;
        give(id, 1);
        var er = WS.Needs.eat(id);
        if (!er || !er.ok) eatFail.push(id + ':' + (er && er.reason));
      } else if (drinkable && def.cat === 'drink') {
        nDrink++;
        give(id, 1);
        var drr = WS.Needs.drink(id);
        if (!drr || !drr.ok) drinkFail.push(id + ':' + (drr && drr.reason));
      }
      if (def.slots && def.slots.length) {
        nCloth++;
        give(id, 1);
        var ci = invIdx(id);
        var eqr = WS.Inv.equip(def.slots[0], ci);
        var slotFilled = p.equip && p.equip[def.slots[0]] && p.equip[def.slots[0]].id === id;
        if ((!eqr || !eqr.ok) && !slotFilled) equipFail.push(id + ':' + (eqr && eqr.reason));
        else if (WS.Inv.unequip) WS.Inv.unequip(def.slots[0]);
      } else if (['tool', 'weapon', 'ranged', 'light'].indexOf(def.cat) >= 0) {
        nHand++;
        give(id, 1);
        var hi = invIdx(id);
        var hr = WS.Inv.equip('hand1', hi);
        if ((!hr || !hr.ok) && !(p.equip && p.equip.hand1 && p.equip.hand1.id === id)) equipFail.push(id + ':' + (hr && hr.reason));
        else if (WS.Inv.unequip) WS.Inv.unequip('hand1');
      }
      var isMed = def.heal !== undefined || def.painkill !== undefined ||
        def.disinfect !== undefined || def.cures !== undefined || def.stopBleed !== undefined;
      if (isMed) {
        nMed++;
        // условия под каждый тип лекарства (у здорового оно честно не нужно)
        p.hp = 50; p.pain = 40; p.infection = 10; p.bleed = 2;
        p.wound = { t: 'cut', treated: false, bleed: 2 };
        p.sick = null; p.fracture = false; p.fracTreat = null;
        if (def.cures === 'fracture') p.fracture = true;
        else if (def.cures) p.sick = { id: def.cures, tea: false };
        give(id, 1);
        var mr = WS.Health.useMed(id);
        if (mr !== true) medFail.push(id + ':' + mr);
        // прибрать за собой — чтобы не ломать последующие проверки
        p.sick = null; p.fracture = false; p.fracTreat = null; p.wound = null; p.bleed = 0;
      } else if (def.cat === 'med' || (def.tags || []).indexOf('heal') >= 0) {
        // грелка/зверобой — не лекарства: тепло/чай-материал, useMed их
        // честно отвергает («это не лекарство») — считаем корректным поведением
      }
      if ((tags.indexOf('readable') >= 0 || def.cat === 'book') && WS.Reading) {
        nRead++;
        give(id, 1);
        var rr = WS.Reading.start(id);
        if (rr !== true) readFail.push(id + ':' + rr);
        else WS.Reading.stop();
      }
    }
    ok('[S2] имена предметов RU (' + ids.length + ' шт.)', noName.length === 0, { missing: noName.slice(0, 25) });
    ok('[S2] имена предметов EN', noNameEn.length === 0, { missing: noNameEn.slice(0, 25) });
    ok('[S2] съедобное съедается (' + nEdible + ' шт.)', eatFail.length === 0, { fail: eatFail.slice(0, 25) });
    ok('[S2] напитки пьются (' + nDrink + ' шт.)', drinkFail.length === 0, { fail: drinkFail.slice(0, 25) });
    ok('[S2] одежда/инструменты надеваются (' + (nCloth + nHand) + ' шт.)', equipFail.length === 0, { fail: equipFail.slice(0, 25) });
    if (nMed) ok('[S2] медикаменты применяются (' + nMed + ' шт.)', medFail.length === 0, { fail: medFail.slice(0, 25) });
    if (nRead) ok('[S2] книги/записки читаются (' + nRead + ' шт.)', readFail.length === 0, { fail: readFail.slice(0, 25) });
    ok('[S2] категории предметов заполнены', !cats['undefined'] && !cats[''], cats);

    // ====================================================================
    // S3. ПРЕДМЕТЫ × ПРЕДМЕТЫ (все рецепты)
    // ====================================================================
    setSkills(10);
    p.sleeping = false;
    // станции: печь уже есть (pech); верстак/наковальню/горн добавляем
    // ЧЕРЕЗ World.addObject (попадает в пространственный индекс query —
    // stationsNear ищет именно им), если сид без кузницы — тестируем
    // МЕХАНИКУ крафта, а не генератор мира
    function spawnStation(spr, x, y) {
      var o = { x: x, y: y, sprName: spr, name: spr, solid: true };
      try {
        if (WS.World.addObject) WS.World.addObject(o);
        else WS.World.objects.push(o);
      } catch (e) { }
      return o;
    }
    var stObj = {
      stove: pech,
      workbench: findBy(function (o) { return o.sprName === 'workbench'; }) || spawnStation('workbench', p.x + 3, p.y),
      anvil: findBy(function (o) { return o.sprName === 'anvil'; }) || spawnStation('anvil', p.x + 5, p.y),
      forge: findBy(function (o) { return o.sprName === 'forge'; }) || spawnStation('forge', p.x + 7, p.y)
    };
    // печь должна гореть для горячих рецептов
    function ensurePechLit() {
      if (!pech) return false;
      if (pech.fireData && pech.fireData.fuel > 0) return true;
      give('firewood_bundle', 5); give('matches', 5);
      teleport(pech.x + 1.1, pech.y + 0.5);
      try { WS.Fire.lightStove(pech); } catch (e) { }
      return !!(pech.fireData && pech.fireData.fuel > 0);
    }
    // зажжённая печь = огонь; плюс пробуем костёр у игрока
    var recipes = WS.Data.recipes;
    var craftFail = [], craftSkip = [], outFail = [];
    var nCraft = 0, nCook = 0;
    for (var ri = 0; ri < recipes.length; ri++) {
      var r = recipes[ri];
      // ингредиенты + инструменты с запасом
      clearInv();
      for (var q = 0; q < r.req.length; q++) give(r.req[q].id, (r.req[q].n || 1) + 1);
      for (var t = 0; t < (r.tools || []).length; t++) give(r.tools[t], 1);
      give('matches', 5); give('firewood_bundle', 5); give('newspaper_stack', 2);
      // станция
      if (r.station) {
        var so = stObj[r.station];
        if (!so && r.station !== 'fire') { craftSkip.push(r.id + ':' + r.station); continue; }
        if (r.station === 'fire') {
          // печь горит = огонь; иначе костёр у ног
          if (!ensurePechLit()) {
            if (WS.Fire && WS.Fire.lightCampfire) WS.Fire.lightCampfire(p.x, p.y - 1);
          }
          if (pech) teleport(pech.x + 1.1, pech.y + 0.5);
        } else {
          teleport(so.x + 1.1, so.y + 0.5);
        }
      } else teleport(p.x, p.y);
      // счётчики «до»
      var outBefore = {};
      for (var oj = 0; oj < r.out.length; oj++) outBefore[r.out[oj].id] = count(r.out[oj].id);
      // крафт или стряпня
      var isCook = (r.cat === 'cook') && WS.Cook && WS.Cook.prepare;
      var res = isCook ? WS.Cook.prepare(r.id) : WS.Craft.craft(r.id);
      if (!res || !res.ok) {
        var why = res && res.reason;
        var det = '';
        if (why === 'ингредиенты') {
          var chk = WS.Inv.hasAll ? WS.Inv.hasAll(r.req) : { missing: [] };
          det = ' missing=[' + (chk.missing || []).join(',') + '] w=' +
            (WS.Inv.weight ? Math.round(WS.Inv.weight() * 10) / 10 : '?') +
            '/' + (WS.Inv.maxWeight ? Math.round(WS.Inv.maxWeight()) : '?');
        }
        craftFail.push(r.id + ':' + why + det);
        continue;
      }
      if (isCook) {
        nCook++;
        // ОКНО ГОТОВНОСТИ: прокачать ровно до готовности (dur игровых
        // минут, gMin делит на speed×timeScale) — перекачка = сгоревшая
        // еда (burnt_food), это честная механика
        var spd = (WS.Loop && WS.Loop.speed) ? WS.Loop.speed : 1;
        var tscl = (WS.Time && WS.Time.timeScale) ? WS.Time.timeScale() : 1;
        var dur = p.cook2 ? p.cook2.dur : 60;
        pump('sys:cooking', dur / (spd * tscl), 1);
        var col = null;
        try { col = WS.Cook.collect(); } catch (e) { col = { ok: false, reason: 'ERR ' + e.message }; }
        if (col && col.ok === false) outFail.push(r.id + ':collect:' + col.reason);
      } else {
        nCraft++;
        pump('sys:craft', 99999, 2);
      }
      // выход произведён?
      var allOut = true;
      for (var ok2 = 0; ok2 < r.out.length; ok2++) {
        var need = r.out[ok2].n || 1;
        if (count(r.out[ok2].id) < outBefore[r.out[ok2].id] + need) { allOut = false; outFail.push(r.id + '→' + r.out[ok2].id); }
      }
      if (!allOut) { /* помечено в outFail */ }
    }
    ok('[S3] рецепты выполняются (' + recipes.length + ' шт., крафт ' + nCraft + ' + стряпня ' + nCook + ')', craftFail.length === 0, { fail: craftFail.slice(0, 30) });
    ok('[S3] изделия появляются на руках', outFail.length === 0, { fail: outFail.slice(0, 30) });
    if (craftSkip.length) warn('[S3] рецепты без станции в мире (SKIP)', { skip: craftSkip.slice(0, 20) });
    ok('[S3] статистика крафта растёт', !G.stats || (G.stats.itemsCrafted || 0) >= nCraft, { crafted: G.stats ? G.stats.itemsCrafted : null });

    // ====================================================================
    // S4. ЛОКАЛИЗАЦИЯ RU/EN
    // ====================================================================
    var ruDict = (WS.Data.locales && WS.Data.locales.ru) || {};
    var enDict = (WS.Data.locales && WS.Data.locales.en) || {};
    var ruKeys = Object.keys(ruDict), enKeys = Object.keys(enDict);
    var ruSet = {}, enSet = {};
    for (var a = 0; a < ruKeys.length; a++) ruSet[ruKeys[a]] = true;
    for (var b = 0; b < enKeys.length; b++) enSet[enKeys[b]] = true;
    var missEn = [], missRu = [];
    for (var c = 0; c < ruKeys.length; c++) if (!enSet[ruKeys[c]]) missEn.push(ruKeys[c]);
    for (var d = 0; d < enKeys.length; d++) if (!ruSet[enKeys[d]]) missRu.push(enKeys[d]);
    ok('[S4] паритет ключей RU→EN', missEn.length === 0, { n: missEn.length, sample: missEn.slice(0, 20) });
    ok('[S4] паритет ключей EN→RU', missRu.length === 0, { n: missRu.length, sample: missRu.slice(0, 20) });
    // смешанные алфавиты
    var mixedEn = [], mixedRu = [];
    var LATIN_OK = /^(FPS|HP|OK|XP|UI|WS|LMB|RMB|ESC|CAPS|Q|E|W|A|S|D|M|J|K|I|C|B|F|T|N|P|R|X|Z|V|G|H|Y|U|O|SPACE|SHIFT|TAB|ENTER|DEL|PAGE|F1|F2|F3|F4|F5|ALT|CTRL|DAYS|DAY|NAME|LABEL|Q|DIRTYG|G)$/;
    for (var e1 = 0; e1 < enKeys.length; e1++) {
      var v = enDict[enKeys[e1]];
      if (typeof v === 'string' && /[\u0400-\u04FF]/.test(v)) mixedEn.push(enKeys[e1]);
    }
    for (var e2 = 0; e2 < ruKeys.length; e2++) {
      var v2 = ruDict[ruKeys[e2]];
      if (typeof v2 !== 'string') continue;
      var mm = v2.match(/[A-Za-z]{2,}/g);
      if (mm) {
        var bad = false;
        for (var e3 = 0; e3 < mm.length; e3++) if (!LATIN_OK.test(mm[e3].toUpperCase())) bad = true;
        if (bad) mixedRu.push(ruKeys[e2] + ':' + mm.join(','));
      }
    }
    ok('[S4] EN-словарь без кириллицы', mixedEn.length === 0, { n: mixedEn.length, sample: mixedEn.slice(0, 20) });
    if (mixedRu.length) warn('[S4] RU-строки с латиницей (проверить)', { n: mixedRu.length, sample: mixedRu.slice(0, 20) });
    // плейсхолдеры {xxx} совпадают
    var phMis = [];
    for (var f = 0; f < ruKeys.length; f++) {
      var k = ruKeys[f];
      if (typeof enDict[k] !== 'string' || typeof ruDict[k] !== 'string') continue;
      var pr = (ruDict[k].match(/\{[a-zA-Z_]+\}/g) || []).sort().join(',');
      var pe = (enDict[k].match(/\{[a-zA-Z_]+\}/g) || []).sort().join(',');
      if (pr !== pe) phMis.push(k + ' ru:[' + pr + '] en:[' + pe + ']');
    }
    ok('[S4] плейсхолдеры RU/EN совпадают', phMis.length === 0, { n: phMis.length, sample: phMis.slice(0, 15) });

    // ====================================================================
    // S5. БАНК ФРАЗ (мысли деда)
    // ====================================================================
    var TT = null;
    try { TT = (WS.Thoughts && WS.Thoughts._db) || null; } catch (e) { }
    if (!TT) {
      ok('[S5] банк фраз доступен', !!WS.Thoughts, {});
      skip('[S5] детальные проверки фраз', 'нет доступа к банку');
    } else {
      var dupAll = [], lenBad = [], phBad = [], few = [], metaMiss = [];
      var tKeys = Object.keys(TT);
      for (var g1 = 0; g1 < tKeys.length; g1++) {
        var key = tKeys[g1], arr = TT[key];
        if (!Array.isArray(arr) || !arr.length) { few.push(key + ':пусто'); continue; }
        if (arr.length < 3) few.push(key + ':' + arr.length);
        var seen = {};
        for (var g2 = 0; g2 < arr.length; g2++) {
          var ph = arr[g2];
          if (seen[ph]) dupAll.push(key + ':' + ph.slice(0, 30));
          seen[ph] = 1;
          if (ph.length < 8 || ph.length > 95) lenBad.push(key + ':' + ph.length + 'сим:' + ph.slice(0, 20));
          var phs = ph.match(/\{[a-zA-Z_]+\}/g) || [];
          for (var g3 = 0; g3 < phs.length; g3++) {
            if (['{item}', '{days}', '{left}', '{name}', '{n}'].indexOf(phs[g3]) < 0) phBad.push(key + ':' + phs[g3]);
          }
        }
      }
      ok('[S5] фраз без дублей (' + tKeys.length + ' категорий)', dupAll.length === 0, { n: dupAll.length, sample: dupAll.slice(0, 15) });
      ok('[S5] длина фраз 8–95', lenBad.length === 0, { n: lenBad.length, sample: lenBad.slice(0, 15) });
      ok('[S5] плейсхолдеры только {item}', phBad.length === 0, { n: phBad.length, sample: phBad.slice(0, 15) });
      if (few.length) warn('[S5] категории с <3 фраз', { n: few.length, sample: few.slice(0, 15) });
    }

    R.doneAt = secs();
    return R;
  }

  window.__WS_RUN_TESTS__ = runFullTests;
})();
