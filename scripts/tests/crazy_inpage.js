/**
 * crazy_inpage.js — ТЕСТ РЕЖИМА «БЕЗУМНЫЙ ДЕД» (T-4): дед-предметы и имена,
 * изгнания (подарки/пыль/факельное топливо), прикорнутье-респаун и настоящий
 * финал, Древо Мудрости (автоспенд), перки экспедиций (множители/потолки),
 * панель HUD, лечение косяком/грибом/конфетой, тумблер голоса.
 * Протокол: window.__T = {pass, fail, fails, bugs, done} (см. run_tests.mjs).
 * Бой — по паттерну S1 из scripts/test_inpage.js (манекен-волк + meleeAttack).
 */
(function () {
  'use strict';
  var T = window.__T = { pass: 0, fail: 0, fails: [], bugs: [], done: false };
  function ok(name, cond, data) {
    if (cond) { T.pass++; console.log('  ok   ' + name); }
    else { T.fail++; T.fails.push(name); console.log('  FAIL ' + name + (data ? ' ' + JSON.stringify(data) : '')); }
  }
  function bug(d) { T.bugs.push(String(d)); console.log('  🐞 ' + d); }
  function fin() { T.done = true; }

  // ---------- утилиты ----------
  function dist(ax, ay, bx, by) {
    var dx = ax - bx, dy = ay - by;
    return Math.sqrt(dx * dx + dy * dy);
  }
  function invIndexOf(id) {
    var p = WS.G.player, inv = p.inv || [];
    for (var i = 0; i < inv.length; i++) if (inv[i] && inv[i].id === id) return i;
    return -1;
  }
  function hasIdInSlots(slots, id) {
    if (!slots) return false;
    for (var i = 0; i < slots.length; i++) if (slots[i] && slots[i].id === id) return true;
    return false;
  }
  /** Изгнать манекен-волка лодошкой (паттерн S1: цель вплотную + meleeAttack). */
  function banishDummy(hp) {
    var p = WS.G.player;
    var m = WS.Input.mouse();
    var dummy = { kind: 'wolf', x: p.x + 0.8, y: p.y, hp: hp, maxHp: hp * 2, dir: 4, dead: false };
    WS.World.addEnt(dummy);
    var kx = p.x + 0.8, ky = p.y;           // позиция гибели (до отброса)
    for (var k = 0; k < 6; k++) {
      dummy.x = p.x + 0.8; dummy.y = p.y;   // вернуть в сектор удара после отброса
      m.wx = dummy.x; m.wy = dummy.y;
      m.tx = Math.floor(dummy.x); m.ty = Math.floor(dummy.y);
      p._atkCd = 0; p._swingT = 0;
      WS.Action.meleeAttack();
      if (dummy.hp <= 0 || WS.World.ents.indexOf(dummy) < 0) return { killed: true, x: kx, y: ky };
    }
    return { killed: false, x: kx, y: ky };
  }
  /** Все crazy_gift в радиусе r от игрока. */
  function giftsNear(r) {
    var p = WS.G.player, out = [];
    var objs = WS.World.objects;
    for (var i = 0; i < objs.length; i++) {
      var o = objs[i];
      if (o && o.sprName === 'crazy_gift' && dist(o.x, o.y, p.x, p.y) <= r) out.push(o);
    }
    return out;
  }
  function extraHas(gift, id) {
    var ex = gift && gift._crazyExtra;
    if (!ex) return false;
    for (var i = 0; i < ex.length; i++) if (ex[i] && ex[i].id === id) return true;
    return false;
  }

  try {
    window.confirm = function () { return true; };

    // ====================================================================
    // ФАЗА A. Санитария: API, новая партия, Лодошка, предметы, панель
    // ====================================================================
    ok('API WS.Crazy на месте (state/active/energy/spend/setAutoSpend/tree)',
       !!(WS.Crazy && WS.Crazy.state && WS.Crazy.active && WS.Crazy.energy &&
          WS.Crazy.spend && WS.Crazy.setAutoSpend && WS.Crazy.tree &&
          WS.Crazy.voice && WS.Crazy._kindEnergy));
    ok('экспедиции и мысли загружены', !!(WS.Expeditions && WS.Thoughts && WS.Health && WS.Loot && WS.Inv));

    var r = WS.Main.newGame('telegraph', ['frostproof', 'patient'], 4242);
    ok('newGame стартует (профиль telegraph, сид 4242)', r === true);
    ok('партия жива и режим деда активен', !!(WS.G && WS.G.running && WS.Crazy.active() === true));
    var st = WS.Crazy.state();
    ok('state() несёт banished/energy/respawns/voiceOn/autoSpend',
       !!(st && typeof st.banished === 'number' && typeof st.energy === 'number' &&
          typeof st.respawns === 'number' && typeof st.voiceOn === 'boolean' &&
          typeof st.autoSpend === 'boolean' && typeof st.spent === 'object'));
    var p = WS.G.player;

    // --- Лодошка Деда ---
    var palmEq = !!(p.equip && p.equip.hand1 && p.equip.hand1.id === 'palm_ded');
    var palmInv = invIndexOf('palm_ded') >= 0;
    ok('Лодошка Деда при старте — в руке или в сумке', palmEq || palmInv,
       { hand1: p.equip && p.equip.hand1 ? p.equip.hand1.id : null });
    var wi = WS.Action.weaponInfo(p);
    ok('weaponInfo: Лодошка — режим ближнего боя', wi.mode === 'melee', { mode: wi.mode });
    ok('weaponInfo: урон Лодошки 12', Math.abs(wi.dmg - 12) < 0.01, { dmg: wi.dmg });
    var pd = WS.Data.items && WS.Data.items.palm_ded;
    ok('palm_ded в реестре: cat=weapon, dmg=12, range=1.1',
       !!(pd && pd.cat === 'weapon' && pd.dmg === 12 && Math.abs(pd.range - 1.1) < 0.001));

    // --- все дед-предметы + имена RU/EN ---
    var CRAZY = ['palm_ded', 'plunger_magic', 'hammer_rubber', 'pan_war', 'boots_swift',
                 'joint_ded', 'mushroom_fun', 'tincture_fly', 'candy_ded', 'stardust'];
    var missItems = [], missRu = [], missEn = [];
    for (var ci = 0; ci < CRAZY.length; ci++) {
      var cid = CRAZY[ci];
      if (!(WS.Data.items && WS.Data.items[cid])) missItems.push(cid);
      if (!(WS.Data.locales && WS.Data.locales.ru && WS.Data.locales.ru['item.' + cid + '.name'])) missRu.push(cid);
      if (!(WS.Data.locales && WS.Data.locales.en && WS.Data.locales.en['item.' + cid + '.name'])) missEn.push(cid);
    }
    ok('все 10 CRAZY_ITEMS в WS.Data.items', missItems.length === 0, { missing: missItems });
    ok('русские имена всех дед-предметов (locales.ru)', missRu.length === 0, { missing: missRu });
    ok('английские имена всех дед-предметов (locales.en)', missEn.length === 0, { missing: missEn });
    ok('хилки деда: косяк 9999 / гриб 25 / конфета 10',
       !!(WS.Data.items.joint_ded && WS.Data.items.joint_ded.heal === 9999 &&
          WS.Data.items.mushroom_fun && WS.Data.items.mushroom_fun.heal === 25 &&
          WS.Data.items.candy_ded && WS.Data.items.candy_ded.heal === 10));

    // --- панель HUD деда ---
    var panel = document.getElementById('ws-crazy');
    ok('панель деда #ws-crazy построена после newGame', !!panel);
    ok('панель видима, в ней энергия (#cz-energy) и ХП (#cz-hp)',
       !!(panel && panel.className.indexOf('hidden') < 0 &&
          document.getElementById('cz-energy') && document.getElementById('cz-hp')));
    var czHp = document.getElementById('cz-hp');
    ok('панель: ХП в формате «100/100»',
       !!(czHp && /^\d+\/\d+$/.test(czHp.textContent) && parseInt(czHp.textContent, 10) >= 95),
       { text: czHp ? czHp.textContent : null });

    // --- числа режима ---
    ok('KIND_ENERGY: волк даёт 8 грибной энергии',
       !!(WS.Crazy._kindEnergy && WS.Crazy._kindEnergy.wolf === 8));
    ok('finalMin = 60 дней (86400 игровых минут)', WS.Crazy.finalMin === 86400);
    ok('Древо Мудрости: 3 ветки с узлами',
       (function () { var t = WS.Crazy.tree(); return !!(t && t.length === 3 && t[0].nodes && t[0].nodes.length >= 3); })());
    ok('шанс звёздной пыли ≥ 0.4', WS.Expeditions.dustChance() >= 0.4, { dust: WS.Expeditions.dustChance() });
    ok('шанс подарка при изгнании ≥ 0.35', WS.Crazy.dropChance() >= 0.35, { c: WS.Crazy.dropChance() });

    // --- голос ---
    ok('озвучка деда включена по умолчанию (voiceOn + Thoughts)',
       st.voiceOn === true && WS.Thoughts.isVoiceOn() === true);
    var vOff = WS.Crazy.voice.toggle();
    ok('тумблер голоса: выключается (Thoughts + state)',
       vOff === false && WS.Thoughts.isVoiceOn() === false && WS.Crazy.state().voiceOn === false);
    var vOn = WS.Crazy.voice.toggle();
    ok('тумблер голоса: включается обратно',
       vOn === true && WS.Thoughts.isVoiceOn() === true && WS.Crazy.state().voiceOn === true);
    // setVoiceOn(bool) из API-шпаргалки — прямой тумблер (фикс: раньше
    // метод не экспортировался, голос переключался только парой toggle())
    ok('WS.Crazy.setVoiceOn экспортирован (функция)',
       typeof WS.Crazy.setVoiceOn === 'function');
    var svOff = WS.Crazy.setVoiceOn(false);
    ok('setVoiceOn(false): глушит Thoughts и пишет state().voiceOn',
       svOff === false && WS.Thoughts.isVoiceOn() === false && WS.Crazy.state().voiceOn === false,
       { ret: svOff, thoughts: WS.Thoughts.isVoiceOn(), st: WS.Crazy.state().voiceOn });
    var svOn = WS.Crazy.setVoiceOn(true);
    ok('setVoiceOn(true): возвращает голос, состояние синхронно',
       svOn === true && WS.Thoughts.isVoiceOn() === true && WS.Crazy.state().voiceOn === true,
       { ret: svOn, thoughts: WS.Thoughts.isVoiceOn(), st: WS.Crazy.state().voiceOn });

    // убрать диких хищников у точки старта — чтобы не мешали замерам
    for (var ri = WS.World.ents.length - 1; ri >= 0; ri--) {
      var re = WS.World.ents[ri];
      if (re && re !== p && (re.kind === 'wolf' || re.kind === 'bear' || re.kind === 'bandit') &&
          dist(re.x, re.y, p.x, p.y) < 30) WS.World.removeEnt(re);
    }

    // ====================================================================
    // ФАЗА B. Изгнание: манекен-волк 20 ХП → подарок + энергия
    // ====================================================================
    var bBan = WS.Crazy.state().banished, bEn = WS.Crazy.energy();
    var kb = banishDummy(20);
    ok('манекен-волк (20 ХП) изгнан лодошкой за ≤3 удара', kb.killed, { hp: 20 });
    ok('счётчик изгнаний +1', WS.Crazy.state().banished === bBan + 1,
       { was: bBan, now: WS.Crazy.state().banished });
    ok('грибная энергия выросла (+8 за волка)', WS.Crazy.energy() - bEn >= 8,
       { was: bEn, now: WS.Crazy.energy() });
    var tileObjs = WS.World.objsAt(Math.floor(kb.x), Math.floor(kb.y));
    var gift1 = null, giftN = 0, corpse1 = 0;
    for (var ti = 0; ti < tileObjs.length; ti++) {
      if (tileObjs[ti].sprName === 'crazy_gift') { gift1 = tileObjs[ti]; giftN++; }
      else if ((tileObjs[ti].sprName || '').indexOf('corpse_') === 0) corpse1++;
    }
    ok('на месте изгнания появился объект crazy_gift (objsAt)', !!gift1);
    // ФИКС (двойной труп): раньше на тайле оставались ОБА объекта — и
    // crazy_gift, и обычный corpse_wolf (прямой вызов makeCorpse из
    // ai.js kill() + дубль из слушателя ent:kill в looting.js)
    ok('подарок на тайле РОВНО один (двойного спавна больше нет)', giftN === 1,
       { gifts: giftN });
    ok('обычного трупа на тайле НЕТ (дед-режим: трупы — подарками)', corpse1 === 0,
       { corpses: corpse1 });
    ok('подарок — контейнер с полем _crazyExtra',
       !!(gift1 && gift1.container && gift1._crazyExtra && typeof gift1._crazyExtra.length === 'number'),
       { container: gift1 ? gift1.container : null });
    ok('подарок подписан «Подарок (был волк)»',
       !!(gift1 && typeof gift1.name === 'string' &&
          gift1.name.indexOf('Подарок') === 0 && gift1.name.indexOf('волк') >= 0),
       { name: gift1 ? gift1.name : null });
    if (corpse1 > 0) {
      // регресс-детектор: двойной спавн вернулся (раньше причинами были
      // прямой вызов makeCorpse из ai.js kill() плюс дубль из слушателя
      // ent:kill в looting.js — обёртка дед-режима перехватывала только
      // экспорт WS.Loot.makeCorpse)
      bug('РЕГРЕССИЯ (двойной труп): после изгнания на тайле снова и crazy_gift, и обычный труп (' + corpse1 + ' шт.)');
    }

    // ====================================================================
    // ФАЗА C. Серия изгнаний: пыль и факельное топливо (инвентарь пуст)
    // ====================================================================
    p.inv = [];                                  // пусто: факелов/жира/тряпок нет
    var N = 18, okKills = 0;
    var cBan = WS.Crazy.state().banished, cEn = WS.Crazy.energy();
    for (var si = 0; si < N; si++) if (banishDummy(20).killed) okKills++;
    ok('серия изгнаний: 18/18 манекенов-волков', okKills === N, { done: okKills });
    ok('banished вырос на 18 за серию', WS.Crazy.state().banished - cBan === N,
       { was: cBan, now: WS.Crazy.state().banished });
    ok('энергия выросла на 8×18=144 за серию', WS.Crazy.energy() - cEn >= N * 8,
       { was: cEn, now: WS.Crazy.energy() });
    var gifts = giftsNear(6);
    var fuelN = 0, dustN = 0, nonEmpty = 0;
    for (var gi = 0; gi < gifts.length; gi++) {
      var ex = gifts[gi]._crazyExtra || [];
      if (ex.length) nonEmpty++;
      if (extraHas(gifts[gi], 'fat') || extraHas(gifts[gi], 'lamp_oil')) fuelN++;
      if (extraHas(gifts[gi], 'stardust')) dustN++;
    }
    ok('пока факелов < 3: подарки несут факельное топливо (fat/lamp_oil)',
       fuelN >= 1, { fuel: fuelN, gifts: gifts.length });
    ok('звёздная пыль выпадает из изгнанных (шанс 40%+)',
       dustN >= 1, { dust: dustN, gifts: gifts.length });

    // ====================================================================
    // ФАЗА D. Подарок обыскивается (асинхронно: обыск 2-4 сек)
    // ====================================================================
    var target = null, wantId = null;
    for (var gj = 0; gj < gifts.length; gj++) {
      if (extraHas(gifts[gj], 'stardust')) { target = gifts[gj]; wantId = 'stardust'; break; }
    }
    if (!target) {
      for (var gk = 0; gk < gifts.length; gk++) {
        if (gifts[gk]._crazyExtra && gifts[gk]._crazyExtra.length) {
          target = gifts[gk]; wantId = gifts[gk]._crazyExtra[0].id; break;
        }
      }
    }
    if (!target) target = gifts.length ? gifts[0] : null;
    var dEn = WS.Crazy.energy();
    var started = false, dEx = null;
    if (target) {
      try { started = WS.Loot.search(target); } catch (eS) { dEx = eS; }
    }
    ok('обыск подарка запускается без исключения (Loot.search)',
       started === true && !dEx, { err: dEx && dEx.message, noGift: !target });

    setTimeout(function () {
      try {
        // --- результаты обыска ---
        ok('подарок обыскан: looted = true', !!(target && target.looted === true));
        ok('энергия за обыск +1 (SEARCH_ENERGY)', WS.Crazy.energy() - dEn >= 1,
           { was: dEn, now: WS.Crazy.energy() });
        if (wantId && target) {
          var merged = false, invIds = [];
          if (target.inv) for (var ii = 0; ii < target.inv.length; ii++) invIds.push(target.inv[ii].id);
          if (invIds.indexOf(wantId) >= 0) merged = true;
          ok('бонус _crazyExtra («' + wantId + '») влит в содержимое подарка',
             target._crazyGiven === 1 && merged, { inv: invIds, given: target._crazyGiven });
        }
        try { if (WS.Ui && WS.Ui.closeAll) WS.Ui.closeAll(); } catch (eC) { /* пусто */ }
        var czEnergy = document.getElementById('cz-energy');
        ok('панель HUD показывает накопленную энергию',
           !!(czEnergy && parseInt(czEnergy.textContent, 10) >= 150),
           { text: czEnergy ? czEnergy.textContent : null });

        // ================================================================
        // ФАЗА E. Прикорнутье: die при живом деде — не финал
        // ================================================================
        var nearWolf = { kind: 'wolf', x: p.x + 1, y: p.y, hp: 30, maxHp: 30, dir: 4, dead: false };
        var farWolf = { kind: 'wolf', x: p.x + 20, y: p.y, hp: 30, maxHp: 30, dir: 4, dead: false };
        WS.World.addEnt(nearWolf);
        WS.World.addEnt(farWolf);
        var r0 = WS.Crazy.state().respawns;
        var dieRes = WS.Main.die('тест: прикорнул');
        ok('die в дед-режиме — прикорнутье, вернул true', dieRes === true, { res: dieRes });
        ok('партия жива после прикорнутья (G.running)', WS.G.running === true);
        ok('счётчик прикорнутья +1', WS.Crazy.state().respawns === r0 + 1,
           { was: r0, now: WS.Crazy.state().respawns });
        ok('ХП восстановлен (50% от максимального)', Math.round(p.hp) === 50, { hp: p.hp });
        ok('обидчик в радиусе 14 изгнан', WS.World.ents.indexOf(nearWolf) < 0);
        ok('дальний волк (за радиусом 14) не тронут', WS.World.ents.indexOf(farWolf) >= 0);
        var finScr = document.getElementById('ws-finale');
        ok('экран смерти НЕ показан после прикорнутья',
           !(finScr && !finScr.classList.contains('hidden')));
        WS.World.removeEnt(farWolf);

        // ================================================================
        // ФАЗА F. Лечение: косяк, гриб, конфета
        // ================================================================
        p.hp = 10; WS.Crazy.state().hpShadow = 10;
        WS.Inv.give('joint_ded', 1);
        var med1 = WS.Health.useMed('joint_ded');
        ok('косяк деда применяется (useMed)', med1 === true, { res: med1 });
        ok('косяк: ХП полностью восстановлены (heal 9999)',
           Math.round(p.hp) === p.maxHp && p.maxHp === 100, { hp: p.hp, max: p.maxHp });
        ok('косяк списан из инвентаря', WS.Crazy._invCount('joint_ded') === 0);
        p.hp = 30; WS.Crazy.state().hpShadow = 30;
        WS.Inv.give('mushroom_fun', 1);
        var med2 = WS.Health.useMed('mushroom_fun');
        ok('весёлый гриб лечит на 25', med2 === true && Math.round(p.hp) === 55, { hp: p.hp });
        p.hp = 30; WS.Crazy.state().hpShadow = 30;
        WS.Inv.give('candy_ded', 1);
        var med3 = WS.Health.useMed('candy_ded');
        ok('конфета «Дедовская» лечит на 10', med3 === true && Math.round(p.hp) === 40, { hp: p.hp });

        // ================================================================
        // ФАЗА G. Сапоги-Скороходы: надевание и множитель скорости
        // ================================================================
        WS.Inv.give('boots_swift', 1);
        var bix = invIndexOf('boots_swift');
        var eqB = (bix >= 0) ? WS.Inv.equip('feet', bix) : null;
        // ФИКС: у boots_swift появилось slots:['feet'] — сапоги надеваются
        // через инвентарь (раньше def.slots не было, Inv.equip('feet')
        // отказывал «не сюда», а бонус +15% скорости из crazy.js читается
        // именно с equip.feet — был мёртвым кодом)
        ok('сапоги-скороходы надеваются на ноги (слот feet, через инвентарь)',
           !!(eqB && eqB.ok === true && eqB.slot === 'feet'), { res: eqB });
        ok('сапоги в экипировке: equip.feet.id = boots_swift',
           !!(p.equip && p.equip.feet && p.equip.feet.id === 'boots_swift'),
           { feet: p.equip && p.equip.feet ? p.equip.feet.id : null });
        if (!(eqB && eqB.ok)) {
          bug('РЕГРЕССИЯ: boots_swift снова не надевается в feet (' +
              (eqB && eqB.reason ? eqB.reason : 'нет предмета') + ') — slots:["feet"] потерян');
          // страховка ветки теста: механику множителя проверим напрямую
          p.equip.feet = { id: 'boots_swift', cond: 1 };
        }

        setTimeout(function () {
          try {
            ok('скорость деда в сапогах ×1.15 (_extMoveMul)',
               typeof p._extMoveMul === 'number' && Math.abs(p._extMoveMul - 1.15) < 0.02,
               { mul: p._extMoveMul });

            // ============================================================
            // ФАЗА H. Древо Мудрости: автоспенд энергии
            // ============================================================
            WS.Crazy.setAutoSpend(true);
            ok('setAutoSpend(true) включил бота прокачки', WS.Crazy.state().autoSpend === true);
            WS.Crazy.state().energy = 500;

            setTimeout(function () {
              try {
                var stH = WS.Crazy.state();
                var spentSum = 0, ids = [];
                for (var k in stH.spent) {
                  if (stH.spent.hasOwnProperty(k)) { ids.push(k); spentSum += stH.spent[k]; }
                }
                ok('Древо Мудрости: автоспенд прокачал узлы (за тики)',
                   spentSum >= 10 && ids.length >= 5, { sum: spentSum, nodes: ids.length });
                ok('энергия потрачена на Древо (500 → меньше)',
                   stH.energy < 500, { energy: Math.round(stH.energy) });
                ok('первый приоритет бота — «Грибная Сила» (shroom) до 3',
                   (stH.spent.shroom || 0) === 3, { shroom: stH.spent.shroom });
                var spMax = WS.Crazy.spend('shroom');
                ok('spend на максимальном узле отклонён',
                   !!(spMax && spMax.ok === false), spMax);
                WS.Crazy.setAutoSpend(false);
                ok('setAutoSpend(false) выключил бота', WS.Crazy.state().autoSpend === false);

                // ========================================================
                // ФАЗА I. Экспедиции: звёзды → перки → мнители/потолки
                // ========================================================
                var M = WS.Expeditions.meta();
                M.stars = 0; M.perks = {}; M.wins = 0; M.runs = [];
                var dmg0 = WS.Expeditions.dmgMul(), spd0 = WS.Expeditions.speedMul(),
                    en0 = WS.Expeditions.energyMul(), dust0 = WS.Expeditions.dustChance();
                ok('перки экспедиций: без прокачки множители = 1',
                   dmg0 === 1 && spd0 === 1 && en0 === 1, { dmg: dmg0, spd: spd0, en: en0 });
                var sent = WS.Expeditions.sendExpedition({ result: 'victory', day: 10, banished: 200, treeLv: 5 });
                ok('экспедиция (победа, 200 изгнаний) приносит ≥100 звёзд',
                   !!(sent && sent.stars >= 100 && WS.Expeditions.stars() === sent.stars), sent);
                var palmBuys = 0;
                for (var pb = 0; pb < 3; pb++) {
                  var b = WS.Expeditions.buy('palm');
                  if (b && b.ok) palmBuys++;
                }
                ok('перк «Ладошка-Гром» куплен ×3', palmBuys === 3, { bought: palmBuys });
                ok('dmgMul вырос (1 → ' + WS.Expeditions.dmgMul().toFixed(2) + ') и в потолке 2.5',
                   WS.Expeditions.dmgMul() > dmg0 && WS.Expeditions.dmgMul() <= 2.5,
                   { now: WS.Expeditions.dmgMul() });
                for (var bb = 0; bb < 3; bb++) WS.Expeditions.buy('boots');
                ok('speedMul вырос (сапоги ×3) и в потолке 1.25',
                   WS.Expeditions.speedMul() > spd0 && WS.Expeditions.speedMul() <= 1.25,
                   { now: WS.Expeditions.speedMul() });
                for (var ab = 0; ab < 5; ab++) WS.Expeditions.buy('appetite');
                ok('energyMul вырос (аппетит ×5) и в потолке 2',
                   WS.Expeditions.energyMul() > en0 && WS.Expeditions.energyMul() <= 2,
                   { now: WS.Expeditions.energyMul() });
                ok('dustChance вырос от перка и ≤ 0.85',
                   WS.Expeditions.dustChance() > dust0 && WS.Expeditions.dustChance() <= 0.85,
                   { now: WS.Expeditions.dustChance() });
                var bMax = WS.Expeditions.buy('palm');
                ok('покупка перка на максимуме отклоняется',
                   !!(bMax && bMax.ok === false), bMax);
                var dc0 = WS.Crazy.dropChance();
                WS.Expeditions.buy('magpie');
                ok('Crazy.dropChance подхватывает перк «Сорока-Воровка»',
                   WS.Crazy.dropChance() > dc0, { was: dc0, now: WS.Crazy.dropChance() });

                // ========================================================
                // ФАЗА J. Настоящий финал: _crazyFinal → экран смерти
                // ========================================================
                WS.G._crazyFinal = true;
                var dieRes2 = WS.Main.die('тест: настоящий финал');
                ok('настоящий финал: партия остановлена и мертва',
                   WS.G.running === false && WS.G.dead === true,
                   { res: dieRes2, running: WS.G.running, dead: WS.G.dead });
                var finEl = document.getElementById('ws-finale');
                ok('финальный экран смерти показан (#ws-finale, гамма death)',
                   !!(finEl && !finEl.classList.contains('hidden') && finEl.className.indexOf('death') >= 0),
                   { cls: finEl ? finEl.className : null });
                fin();
              } catch (e) {
                bug('исключение в фазах Древо/Экспедиции/Финал: ' + (e && e.message));
                fin();
              }
            }, 4500);
          } catch (e) {
            bug('исключение в фазе сапог/древа: ' + (e && e.message));
            fin();
          }
        }, 600);
      } catch (e) {
        bug('исключение в фазах обыска/респауна/лечения: ' + (e && e.message));
        fin();
      }
    }, 7000);
  } catch (e) {
    bug('фатально: ' + (e && e.message));
    fin();
  }
})();
