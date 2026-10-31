/**
 * economy_inpage.js — ТЕСТ ЭКОНОМИКИ и I18N «Белого Безмолвия» (T-8).
 *
 * Зона: предметы × рецепты × лут × инвентарь × локализация. Глубже и шире
 * сюита scripts/test_inpage.js (S2–S5): циклы по ВСЕМ реестрам (528 пред-
 * метов, 286 рецептов, 75 лут-таблиц, 1881 ключ словарей), поведенческие
 * проверки инвентаря (вес/перегруз/экипировка), выборочный крафт на ВСЕХ
 * станциях с проверкой причин отказа, зелья экспедиций (в т.ч. эффект
 * «Ёрш-Драйва»), концовки (данные + determineEnding) и мат-банк.
 *
 * Синхронный, ES5, без моков: только живые WS.* на http://localhost:3000.
 * Протокол: window.__T {pass, fail, fails, bugs, done} (см. run_tests.mjs).
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

  // ======================= КОНСТАНТЫ =======================
  // Прежде здесь жили стражи «известных призраков» (мёртвый лут, безы-
  // мянные рецепты, зелья без id…) — кластер FE их починил, и теперь
  // каждое нарушение данных роняет тест сразу, без белых списков.
  var CATS_ITEMS = ['food', 'drink', 'med', 'tool', 'weapon', 'ranged', 'ammo',
    'cloth', 'material', 'book', 'light', 'fuel', 'container', 'misc'];
  var CATS_RECIPES = ['survival', 'carpentry', 'cook', 'tailor', 'ammo', 'misc',
    'weapon', 'med'];            // последние две — вне списка CONTRACT.md (баг №3)
  var STATIONS = [null, 'fire', 'stove', 'workbench', 'anvil', 'forge'];
  var SKILLS = ['axe', 'melee', 'firearm', 'sneak', 'run', 'cook', 'carpentry',
    'tailor', 'medic', 'forage', 'track', 'survive'];
  var END_KINDS = ['victory', 'survival', 'victory_alt', 'dark', 'legend', 'poetic'];
  var WL_RU_LATIN = { 'HP': 1, '°C': 1 };  // легитимные латинские ru-значения

  try {
    window.confirm = function () { return true; };

    // ======================= УТИЛИТЫ =======================
    function pump(sub, dt, n) {
      var fns = WS._tickFns || [];
      for (var i = 0; i < fns.length; i++) {
        if (fns[i].name && fns[i].name.indexOf(sub) >= 0) {
          for (var k = 0; k < (n || 1); k++) fns[i].fn(dt || 9999);
        }
      }
    }
    function invIdx(p, id) {
      for (var i = 0; i < p.inv.length; i++) if (p.inv[i] && p.inv[i].id === id) return i;
      return -1;
    }
    function clearInv(p) { p.inv = []; p.equip = {}; }
    function teleport(p, x, y) { p.x = x; p.y = y; }
    function findBySpr(spr) {
      var objs = WS.World.objects;
      for (var i = 0; i < objs.length; i++) if (objs[i] && objs[i].sprName === spr) return objs[i];
      return null;
    }
    function spawnStation(spr, x, y) {
      var o = { x: x, y: y, sprName: spr, name: spr, solid: true };
      try {
        if (WS.World.addObject) WS.World.addObject(o);
        else WS.World.objects.push(o);
      } catch (e) { /* пусто */ }
      return o;
    }

    // ======================= E0. САНИТАРИЯ =======================
    ok('[E0] реестры экономики загружены (528/286/75/30)',
      !!(WS.Data && WS.Data.items && WS.Data.recipes && WS.Data.loot &&
        WS.Data.locales && WS.Data.matPhrases) &&
      Object.keys(WS.Data.items).length >= 520 &&
      WS.Data.recipes.length >= 280 &&
      Object.keys(WS.Data.loot).length >= 70 &&
      Object.keys(WS.Data.matPhrases).length >= 30,
      { items: Object.keys(WS.Data.items).length, recipes: WS.Data.recipes.length,
        loot: Object.keys(WS.Data.loot).length });

    var rNg = WS.Main.newGame('telegraph', ['frostproof', 'patient'], 4242);
    ok('[E0] новая партия (сид 4242)', rNg === true && !!(WS.G && WS.G.running));
    var p = WS.G.player;
    ok('[E0] игрок в границах мира', !!(p && p.x > 0 && p.y > 0 && p.x < WS.World.w && p.y < WS.World.h));

    var items = WS.Data.items;
    var recipes = WS.Data.recipes;
    var byId = WS.Data.recipesById;
    var ruD = WS.Data.locales.ru || {};
    var enD = WS.Data.locales.en || {};
    var itemIds = Object.keys(items);

    ok('[E0] Craft API смотрит на те же данные',
      WS.Craft.recipes() === recipes && WS.Craft.recipe('torch') === byId.torch &&
      WS.Craft.recipe('no_such_recipe') === null);

    // ======================= E1. РЕЦЕПТЫ (цикл по 286) =======================
    var rMiss = [], rTime = [], rCat = [], rCatContract = [], rStation = [];
    var rN = [], rSkillId = [], rSkillLv0 = [], rNoName = [], rKeyRu = [], rKeyEn = [];
    var seen = {}, rDup = [], notInIdx = [];
    var i, j, k;
    for (i = 0; i < recipes.length; i++) {
      var r = recipes[i];
      // целостность ссылок
      for (j = 0; j < r.req.length; j++) {
        if (!items[r.req[j].id]) rMiss.push(r.id + ':req:' + r.req[j].id);
        if (!(r.req[j].n >= 1)) rN.push(r.id + ':req:' + r.req[j].id + ':n=' + r.req[j].n);
      }
      for (j = 0; j < (r.tools || []).length; j++) {
        if (!items[r.tools[j]]) rMiss.push(r.id + ':tool:' + r.tools[j]);
      }
      for (j = 0; j < r.out.length; j++) {
        if (!items[r.out[j].id]) rMiss.push(r.id + ':out:' + r.out[j].id);
        if (!(r.out[j].n >= 1)) rN.push(r.id + ':out:' + r.out[j].id + ':n=' + r.out[j].n);
        if (!ruD['item.' + r.out[j].id + '.name']) rNoName.push(r.id + '→' + r.out[j].id);
      }
      if (!(r.time > 0)) rTime.push(r.id + ':' + r.time);
      if (CATS_RECIPES.indexOf(r.cat) < 0) rCat.push(r.id + ':' + r.cat);
      if (['survival', 'carpentry', 'cook', 'tailor', 'ammo', 'misc'].indexOf(r.cat) < 0) {
        rCatContract.push(r.id + ':' + r.cat);
      }
      if (STATIONS.indexOf(r.station) < 0) rStation.push(r.id + ':' + r.station);
      if (r.skill) {
        if (r.skill.id && SKILLS.indexOf(r.skill.id) < 0) rSkillId.push(r.id + ':' + r.skill.id);
        if (r.skill.id && !(r.skill.lv >= 1)) rSkillLv0.push(r.id + ':' + r.skill.lv);
      }
      if (!r.name || typeof r.name !== 'string') rNoName.push(r.id + ':r.name');
      var nk = r.name_key || ('recipe.' + r.id + '.name');
      if (!ruD[nk]) rKeyRu.push(nk);
      if (!enD[nk]) rKeyEn.push(nk);
      // дубликаты + индекс
      if (seen[r.id]) rDup.push(r.id);
      seen[r.id] = 1;
      if (!byId[r.id]) notInIdx.push(r.id);
    }
    var idxNotInArr = [];
    for (k in byId) {
      if (!Object.prototype.hasOwnProperty.call(byId, k)) continue;
      var found = false;
      for (i = 0; i < recipes.length; i++) if (recipes[i].id === k) { found = true; break; }
      if (!found) idxNotInArr.push(k);
    }

    ok('[E1] все id рецептов существуют в предметах (' + recipes.length + ' шт.)',
      rMiss.length === 0, { bad: rMiss.slice(0, 25) });
    ok('[E1] время рецептов положительное', rTime.length === 0, { bad: rTime.slice(0, 25) });
    ok('[E1] категории рецептов из допустимого множества', rCat.length === 0, { bad: rCat.slice(0, 25) });
    ok('[E1] категории рецептов в пределах списка CONTRACT.md (6 вкладок UI)',
      rCatContract.length === 0, { bad: rCatContract.slice(0, 25) });
    ok('[E1] станции рецептов из допустимого множества', rStation.length === 0, { bad: rStation.slice(0, 25) });
    ok('[E1] количества req/out ≥ 1 (ноль трактуются как 1 — нечестно)',
      rN.length === 0, { bad: rN.slice(0, 25) });
    ok('[E1] навыки рецептов — известные навыки игрока', rSkillId.length === 0, { bad: rSkillId.slice(0, 25) });
    ok('[E1] уровни навыков рецептов ≥ 1 (lv=0 клампится в 1)',
      rSkillLv0.length === 0, { bad: rSkillLv0.slice(0, 25) });
    ok('[E1] дубликатов id рецептов в массиве нет', rDup.length === 0, { bad: rDup });
    ok('[E1] согласованность массив ↔ recipesById (оба направления)',
      notInIdx.length === 0 && idxNotInArr.length === 0,
      { notInIdx: notInIdx, idxNotInArr: idxNotInArr });
    ok('[E1] у каждого рецепта есть имя r.name (иначе меню показывает сырой id)',
      rNoName.length === 0, { безымянные: rNoName.slice(0, 25) });
    ok('[E1] recipe.<id>.name есть в ru для всех рецептов',
      rKeyRu.length === 0, { безКлюча: rKeyRu.slice(0, 25) });
    ok('[E1] recipe.<id>.name есть в en ровно там же, где и в ru',
      rKeyEn.length === rKeyRu.length && rKeyEn.length === 0,
      { ru: rKeyRu.length, en: rKeyEn.length });

    // ======================= E2. ЛУТ (цикл по 75 таблицам) =======================
    var lootIds = Object.keys(WS.Data.loot);
    var lRolls = [], lNull = [], lGhost = [], lW = [], lMinMax = [];
    var lEmpty = [], lNoWeight = [];
    for (i = 0; i < lootIds.length; i++) {
      var t = lootIds[i], L = WS.Data.loot[t];
      var rr = L.rolls;
      if (!Array.isArray(rr) || rr.length !== 2 || !(rr[0] >= 1) || !(rr[1] <= 10) || rr[0] > rr[1]) {
        lRolls.push(t + ':' + JSON.stringify(rr));
      }
      if (!Array.isArray(L.items) || !L.items.length) { lEmpty.push(t); continue; }
      var tw = 0;
      for (j = 0; j < L.items.length; j++) {
        var it = L.items[j];
        tw += (it.w || 0);
        if (it.id === null) {
          // «пустой» слот: min=0, max=0 — шанс ничего не найти
          if (it.min !== 0 || it.max !== 0) lNull.push(t + ':null:min=' + it.min + ',max=' + it.max);
          continue;
        }
        if (!items[it.id]) {
          // мёртвая ссылка: предмет выпадет в контейнер, но «взять» нельзя
          lGhost.push(t + ':' + it.id + ':w=' + it.w);
          continue;
        }
        if (typeof it.w !== 'number' || it.w < 0) lW.push(t + ':' + it.id + ':w=' + it.w);
        if (it.min > it.max) lMinMax.push(t + ':' + it.id + ':' + it.min + '>' + it.max);
        if (it.min < 1) lMinMax.push(t + ':' + it.id + ':min=' + it.min);
      }
      if (!(tw > 0)) lNoWeight.push(t);
    }
    ok('[E2] rolls всех таблиц — [1..10] и по возрастанию (' + lootIds.length + ' шт.)',
      lRolls.length === 0, { bad: lRolls.slice(0, 25) });
    ok('[E2] «пустые» слоты (id:null) с min=max=0', lNull.length === 0, { bad: lNull.slice(0, 25) });
    ok('[E2] лут не ссылается на несуществующие предметы',
      lGhost.length === 0, { мёртвыеСсылки: lGhost.slice(0, 25) });
    ok('[E2] веса записей — числа ≥ 0', lW.length === 0, { bad: lW.slice(0, 25) });
    ok('[E2] min ≤ max и min ≥ 1 для предметов', lMinMax.length === 0, { bad: lMinMax.slice(0, 25) });
    ok('[E2] таблицы непустые и с положительным суммарным весом',
      lEmpty.length === 0 && lNoWeight.length === 0, { empty: lEmpty, noWeight: lNoWeight });

    // ======================= E3. ПРЕДМЕТЫ (цикл по 528) =======================
    var iCat = [], iW = [], iHeavy = [], iStack = [], iNoStack = [], iBigStack = [];
    var iCal = [], iDmg = [], iMed = [], iMedNew = [], iNoId = [], iNoIdNew = [];
    var iNameRu = [], iNameEn = [], iEmptyName = [];
    var nFood = 0, nWpn = 0, nMed = 0;
    // белые списки исторических исключений (ЭТАП 10 закрыл почти все:
    // potion_zoom получил zoom-эффект в useMed, wr_stonewort — sanity).
    // Осталась одна грелка: тёплая, но не лекарство (cat можно сменить
    // на misc — держим задокументированной, чтобы новые не проскакивали).
    var MED_NO_FX = { hot_water_bottle: 1 };
    var NO_ID = {};
    for (i = 0; i < itemIds.length; i++) {
      var id = itemIds[i], d = items[id];
      if (CATS_ITEMS.indexOf(d.cat) < 0) iCat.push(id + ':' + d.cat);
      if (typeof d.w !== 'number' || isNaN(d.w) || d.w < 0) iW.push(id + ':' + d.w);
      else if (d.w > 15) iHeavy.push(id + ':' + d.w);
      if (typeof d.stack === 'number') {
        if (d.stack < 1) iStack.push(id + ':' + d.stack);
        else if (d.stack > 100) iBigStack.push(id + ':' + d.stack);
      } else if (d.stack !== undefined) iStack.push(id + ':' + d.stack);
      else iNoStack.push(id);
      if (d.cat === 'food') {
        nFood++;
        if (typeof d.cal !== 'number' || d.cal < 0) iCal.push(id + ':' + d.cal);
      }
      if (d.cat === 'weapon' || d.cat === 'ranged') {
        nWpn++;
        if (!(d.dmg > 0)) iDmg.push(id + ':' + d.dmg);
      }
      if (d.cat === 'med') {
        nMed++;
        // фкс-набор расширен: useMed реально применяет sanity (health.js:971)
        // и zoom — зелье скорости из экспедиций (ЭТАП 10)
        var fx = d.heal !== undefined || d.painkill !== undefined ||
          d.disinfect !== undefined || d.cures !== undefined || d.stopBleed !== undefined ||
          d.sanity !== undefined || d.zoom !== undefined;
        if (!fx) {
          if (!MED_NO_FX[id]) iMedNew.push(id);
        }
      }
      if (d.id !== id) {
        if (!NO_ID[id]) iNoIdNew.push(id + '→' + d.id);
        iNoId.push(id + '→' + d.id);
      }
      var vru = ruD['item.' + id + '.name'];
      if (typeof vru !== 'string' || !vru.length) iNameRu.push(id);
      else if (!vru.replace(/\s+/g, '').length) iEmptyName.push(id);
      if (typeof enD['item.' + id + '.name'] !== 'string' ||
        !enD['item.' + id + '.name'].length) iNameEn.push(id);
    }
    ok('[E3] категории всех предметов валидны (' + itemIds.length + ' шт.)',
      iCat.length === 0, { bad: iCat.slice(0, 25) });
    ok('[E3] вес — число 0..15 кг у всех', iW.length === 0 && iHeavy.length === 0,
      { bad: iW.concat(iHeavy).slice(0, 25) });
    ok('[E3] стек — число 1..100 (или без поля: дефолт 1)', iStack.length === 0 && iBigStack.length === 0,
      { bad: iStack.concat(iBigStack).slice(0, 25) });
    if (iNoStack.length) {
      // БАГ (гигиена): без явного stack инвентарь считает предмет одинарным
      bug('БАГ: ' + iNoStack.length + ' предметов без явного поля stack (дефолт 1, не стакуются): ' +
        iNoStack.join(', '));
    }
    ok('[E3] еда: cal ≥ 0 (' + nFood + ' шт.)', iCal.length === 0, { bad: iCal.slice(0, 25) });
    ok('[E3] оружие/огнестрел: dmg > 0 (' + nWpn + ' шт.)', iDmg.length === 0, { bad: iDmg.slice(0, 25) });
    ok('[E3] медикаменты с эффектами (кроме грелки, всего ' + nMed + ')',
      iMedNew.length === 0, { новыеБесполезные: iMedNew });
    if (iMed.length) {
      // БАГ: cat='med' без единого мед-эффекта — useMed честно отвергает
      bug('БАГ: «медикаменты» без мед-эффектов (useMed отвергает): ' +
        'hot_water_bottle (грелка: warm 10 — греть, не лечить) — cat стоит сменить на misc');
    }
    ok('[E3] def.id совпадает с ключом (кроме 2 задокументированных)', iNoIdNew.length === 0,
      { новыеБезId: iNoIdNew });
    if (iNoId.length) {
      // БАГ: у potion_heal и potion_zoom нет поля id — код, читающий def.id, получит undefined
      bug('БАГ: ' + iNoId.length + ' предмета без поля id (def.id === undefined): ' + iNoId.join(', '));
    }
    ok('[E3] непустые имена RU у всех предметов', iNameRu.length === 0 && iEmptyName.length === 0,
      { нет: iNameRu.slice(0, 25), пробелы: iEmptyName });
    ok('[E3] непустые имена EN у всех предметов', iNameEn.length === 0, { нет: iNameEn.slice(0, 25) });

    // ======================= E4. I18N — ПОЛНЫЙ ПАРИТЕТ =======================
    var ruKeys = Object.keys(ruD), enKeys = Object.keys(enD);
    var ruSet = {}, enSet = {};
    for (i = 0; i < ruKeys.length; i++) ruSet[ruKeys[i]] = 1;
    for (i = 0; i < enKeys.length; i++) enSet[enKeys[i]] = 1;
    var mEn = [], mRu = [], enCyr = [], ruLat = [], emptyV = [];
    for (i = 0; i < ruKeys.length; i++) {
      if (!enSet[ruKeys[i]]) mEn.push(ruKeys[i]);
      var v1 = ruD[ruKeys[i]];
      if (typeof v1 === 'string') {
        if (!v1.length) emptyV.push('ru:' + ruKeys[i]);
        if (!/[\u0400-\u04FF]/.test(v1) && /[A-Za-z]/.test(v1) && !WL_RU_LATIN[v1]) {
          ruLat.push(ruKeys[i] + ' → ' + v1.slice(0, 40));
        }
      }
    }
    for (i = 0; i < enKeys.length; i++) {
      if (!ruSet[enKeys[i]]) mRu.push(enKeys[i]);
      var v2 = enD[enKeys[i]];
      if (typeof v2 === 'string') {
        if (!v2.length) emptyV.push('en:' + enKeys[i]);
        if (/[\u0400-\u04FF]/.test(v2)) enCyr.push(enKeys[i] + ' → ' + v2.slice(0, 40));
      }
    }
    ok('[E4] паритет ключей RU→EN (' + ruKeys.length + ' шт.)', mEn.length === 0, { нет: mEn.slice(0, 25) });
    ok('[E4] паритет ключей EN→RU (' + enKeys.length + ' шт.)', mRu.length === 0, { нет: mRu.slice(0, 25) });
    ok('[E4] в EN-значениях нет кириллицы', enCyr.length === 0, { bad: enCyr.slice(0, 25) });
    ok('[E4] в RU-значениях нет чисто-латинических (кроме HP, °C)', ruLat.length === 0,
      { bad: ruLat.slice(0, 25) });
    ok('[E4] пустых строк в словарях нет', emptyV.length === 0, { bad: emptyV.slice(0, 25) });

    // мягкая проверка описаний: у item.<id>.name хорошо бы иметь .desc
    var withDesc = 0, noDesc = [];
    for (i = 0; i < itemIds.length; i++) {
      if (ruD['item.' + itemIds[i] + '.desc']) withDesc++;
      else noDesc.push(itemIds[i]);
    }
    ok('[E4] описания предметов (мягко: ≥85% имеют item.<id>.desc)',
      withDesc / itemIds.length >= 0.85,
      { есть: withDesc, нет: noDesc.length, примеры: noDesc.slice(0, 12) });
    if (noDesc.length) {
      // БАГ (мягко): предметы без описаний — тултипы/осмотр показывают пустоту
      bug('БАГ (мягко): ' + noDesc.length + ' предметов без item.<id>.desc: ' +
        noDesc.slice(0, 12).join(', ') + '…');
    }
    // обратное: .desc у существующего предмета всегда имеет .name
    var descNoName = [], orphanNames = 0, orphanDescs = [];
    for (i = 0; i < ruKeys.length; i++) {
      var kk = ruKeys[i];
      var mn = kk.match(/^item\.([a-z0-9_]+)\.name$/);
      var md = kk.match(/^item\.([a-z0-9_]+)\.desc$/);
      if (mn && !items[mn[1]]) orphanNames++;
      if (md) {
        if (!items[md[1]]) orphanDescs.push(md[1]);
        else if (!ruD['item.' + md[1] + '.name']) descNoName.push(md[1]);
      }
    }
    ok('[E4] у существующих предметов .desc всегда парой с .name', descNoName.length === 0,
      { bad: descNoName.slice(0, 25) });
    if (orphanNames || orphanDescs.length) {
      // БАГ: словарь хранит имена/описания предметов, которых нет в реестре
      // (переименованные/вырезанные id + призраки лута)
      bug('БАГ: сиротские ключи словаря: ' + orphanNames + ' шт. item.*.name и ' +
        orphanDescs.length + ' шт. item.*.desc для несуществующих предметов (' +
        'wadding_pack, bandage_rag, splint, bow, torch_oil, mug_tin, …) — мусор/легаси');
    }

    // ======================= E5. КРАФТ-API (до телодвижений) =======================
    var cards = WS.Craft.available();
    var torchCard = null;
    for (i = 0; i < cards.length; i++) if (cards[i].id === 'torch') { torchCard = cards[i]; break; }
    ok('[E5] available() выдаёт карточку на каждый рецепт (' + cards.length + ' шт.)',
      cards.length === recipes.length && !!torchCard,
      { cards: cards.length, recipes: recipes.length });
    ok('[E5] карточка факела заполнена и честно требует ингредиенты',
      !!torchCard && torchCard.can === false && torchCard.req.length > 0 &&
      torchCard.out.length > 0 && typeof torchCard.name === 'string' && torchCard.name.length > 0,
      { card: torchCard ? { id: torchCard.id, can: torchCard.can, name: torchCard.name } : null });
    ok('[E5] recipesFor(torch) находит все способы сделать факел',
      WS.Craft.recipesFor('torch').length >= 2,
      { ids: WS.Craft.recipesFor('torch').map(function (x) { return x.id; }) });
    var cats = WS.Craft.categories();
    var catSum = 0, catKeys = Object.keys(cats);
    for (i = 0; i < catKeys.length; i++) catSum += cats[catKeys[i]];
    ok('[E5] categories() считает рецепты по шести вкладкам',
      catSum === recipes.length - rCatContract.length && cats.cook > 0 && cats.survival > 0,
      { сумма: catSum, всегоРецептов: recipes.length, вкл: cats });
    var cookCards = WS.Craft.available('cook');
    ok('[E5] available(cook) фильтрует по категории', cookCards.length === cats.cook,
      { cook: cookCards.length });

    // ======================= E6. ИНВЕНТАРЬ: ПОВЕДЕНИЕ =======================
    // Лодошка Деда — стартовое оружие в hand1 (проверяем снятие/надевание)
    ok('[E6] Лодошка Деда надета в hand1 при старте',
      !!(p.equip && p.equip.hand1 && p.equip.hand1.id === 'palm_ded'));
    var un1 = WS.Inv.unequip('hand1');
    var palmIx = invIdx(p, 'palm_ded');
    ok('[E6] снять Лодошку → вернулась в сумку', un1 && un1.ok === true &&
      palmIx >= 0 && WS.Inv.count('palm_ded') >= 1, { res: un1 });
    var eq1 = WS.Inv.equip('hand1', palmIx);
    ok('[E6] надеть Лодошку обратно в hand1', eq1 && eq1.ok === true &&
      p.equip.hand1 && p.equip.hand1.id === 'palm_ded', { res: eq1 });

    // give/count/consume roundtrip
    clearInv(p);
    var g5 = WS.Inv.give('nails', 5);
    var c5 = WS.Inv.count('nails');
    var u2 = WS.Inv.consume('nails', 2);
    var c3 = WS.Inv.count('nails');
    var u99 = WS.Inv.consume('nails', 99);
    var c0 = WS.Inv.count('nails');
    ok('[E6] roundtrip: give 5 → count 5 → consume 2 → count 3',
      g5 === 5 && c5 === 5 && u2 === 2 && c3 === 3,
      { g5: g5, c5: c5, u2: u2, c3: c3 });
    ok('[E6] consume сверх наличия списывает остаток и возвращает его (семантика take)',
      u99 === 3 && c0 === 0, { вернул: u99, осталось: c0 });
    var noThrow1 = true, ghostGive = -1;
    try { ghostGive = WS.Inv.give('ghost_item_xyz', 3); } catch (e1) { noThrow1 = false; }
    ok('[E6] give несуществующего id — 0 и без исключения', noThrow1 && ghostGive === 0,
      { ret: ghostGive });
    var noThrow2 = true, ghostTake = -1;
    try { ghostTake = WS.Inv.consume('ghost_item_xyz', 3); } catch (e2) { noThrow2 = false; }
    ok('[E6] consume несуществующего id — 0 и без исключения', noThrow2 && ghostTake === 0,
      { ret: ghostTake });

    // вес и перегруз
    var wBase = WS.Inv.weight();
    var maxW = WS.Inv.maxWeight();
    WS.Inv.give('plank', 20);
    var wMid = WS.Inv.weight();
    ok('[E6] 20 досок: вес вырос на 40 кг, перегруз 1, штраф скорости 0.7',
      Math.abs(wMid - wBase - 40) < 0.01 && WS.Inv.overload() === 1 && p._extMoveMul === 0.7,
      { было: wBase, стало: wMid, max: maxW, overload: WS.Inv.overload(), mul: p._extMoveMul });
    var added = WS.Inv.give('plank', 100);
    var wCap = WS.Inv.weight();
    ok('[E6] жёсткий потолок 2×maxWeight: больше 60 кг в руки не взять',
      added <= 10 && Math.abs(wCap - wBase - 2 * maxW) < 0.01 &&
      WS.Inv.overload() === 2 && p._extMoveMul === 0.15,
      { добавилось: added, всего: WS.Inv.count('plank'), вес: wCap, потолок: 2 * maxW, mul: p._extMoveMul });
    WS.Inv.consume('plank', WS.Inv.count('plank'));
    ok('[E6] разгрузка: вес вернулся, перегруз снят, штраф скорости удалён',
      Math.abs(WS.Inv.weight() - wBase) < 0.01 && WS.Inv.overload() === 0 &&
      typeof p._extMoveMul === 'undefined',
      { вес: WS.Inv.weight(), overload: WS.Inv.overload() });

    // ======================= E7. ЭКИПИРОВКА =======================
    // валенки — честная обувь со slots:['feet']
    clearInv(p);
    WS.Inv.give('valenki', 1);
    var vIx = invIdx(p, 'valenki');
    var eqV = WS.Inv.equip('feet', vIx);
    ok('[E6/E7] валенки надеваются в feet и снимаются обратно',
      eqV && eqV.ok === true && p.equip.feet && p.equip.feet.id === 'valenki' &&
      WS.Inv.unequip('feet').ok === true && WS.Inv.count('valenki') === 1,
      { eq: eqV });
    // Сапоги-Скороходы — заявлены как обувь (+15% скорости, crazy.js),
    // но slots не имеют → в feet не надеваются (БАГ)
    WS.Inv.give('boots_swift', 1);
    var bIx = invIdx(p, 'boots_swift');
    var eqB = WS.Inv.equip('feet', bIx);
    // ФИКС (был БАГ): boots_swift получил slots:['feet'] (crazy.js) —
    // сапоги надеваются, бонус +15% скорости больше не мёртвый код
    ok('[E7] Сапоги-Скороходы: в feet надеваются (фикс: slots:[\'feet\'])',
      !!(eqB && eqB.ok) && !!(p.equip.feet && p.equip.feet.id === 'boots_swift'),
      { res: eqB });
    var eqBad1 = WS.Inv.equip('nosuch_slot', 0);
    var eqBad2 = WS.Inv.equip('feet', 999);
    ok('[E7] отказы: несуществующий слот и пустой индекс',
      eqBad1 && eqBad1.ok === false && eqBad2 && eqBad2.ok === false,
      { a: eqBad1, b: eqBad2 });

    // ======================= E8. ВЫБОРОЧНЫЙ КРАФТ (8 рецептов, все станции) =======================
    // навыки на максимум — исключить случайный провал (шанс провала < уровня навыка)
    for (k in p.skills) {
      if (Object.prototype.hasOwnProperty.call(p.skills, k)) {
        p.skills[k].lv = 10; p.skills[k].xp = 0;
      }
    }
    p.sleeping = false;

    // --- причины отказа (глубже S3: S3 всегда телепортирует к станциям) ---
    teleport(p, 5.5, 5.5);          // угол карты: станций нет
    clearInv(p);
    var rl = byId.lantern;
    for (j = 0; j < rl.req.length; j++) WS.Inv.give(rl.req[j].id, (rl.req[j].n || 1) + 1);
    for (j = 0; j < (rl.tools || []).length; j++) WS.Inv.give(rl.tools[j], 1);
    var rej1 = WS.Craft.craft('lantern');
    var rejC = WS.Cook.prepare('borscht');
    ok('[E8] отказ «станция» без станции (крафт и стряпня)',
      rej1 && rej1.ok === false && rej1.reason === 'станция' &&
      rejC && rejC.ok === false && rejC.reason === 'станция', { a: rej1, b: rejC });

    // печь из мира (сид 4242 детерминирован), растапливаем
    var pech = findBySpr('pech');
    ok('[E8] печь найдена в мире', !!pech, { x: pech && pech.x, y: pech && pech.y });
    var px = pech.x + 1.1, py = pech.y + 0.5;
    teleport(p, px, py);
    WS.Inv.give('firewood_bundle', 5); WS.Inv.give('matches', 5);
    var litRes = WS.Fire.lightStove(pech);
    ok('[E8] печь растоплена (fireData.fuel > 0)',
      (litRes && litRes.ok === true) || (pech.fireData && pech.fireData.fuel > 0),
      { fuel: pech.fireData ? pech.fireData.fuel : null });

    // верстак/наковальня/горн — рядом с игроком (как S3: механика, не генератор)
    spawnStation('workbench', px + 1.5, py - 1.0);
    spawnStation('anvil', px - 1.5, py - 1.0);
    spawnStation('forge', px - 1.5, py + 1.2);
    var stNear = WS.Craft.stationsNear();
    ok('[E8] все станции в радиусе игрока (stationsNear)',
      !!stNear.stove && !!stNear.fire && !!stNear.workbench &&
      !!stNear.anvil && !!stNear.forge,
      { stove: !!stNear.stove, fire: !!stNear.fire, workbench: !!stNear.workbench,
        anvil: !!stNear.anvil, forge: !!stNear.forge });
    // БАГ (мелкий): stationReport() не показывает неявный огонь от горящей
    // печи (stationsNear его подставляет: out.fire = out.stove), а панель UI
    // (craft_screen.js:329) читает именно stationReport — у печи не напишет «костёр»
    var stRepFire = false;
    var stRepArr = WS.Craft.stationReport();
    for (i = 0; i < stRepArr.length; i++) if (stRepArr[i].station === 'fire') stRepFire = true;
    if (!stRepFire) {
      bug('БАГ (мелкий): Craft.stationReport() не включает неявный огонь от горящей печи ' +
        '(js/systems/craft.js:269-275 — out.fire = out.stove есть только в stationsNear) — ' +
        'панель станций в UI у печи не упомянет возможность варки «на огне»');
    }

    // отказ «ингредиенты» и «инструменты» — у правильной станции
    clearInv(p);
    for (j = 0; j < (rl.tools || []).length; j++) WS.Inv.give(rl.tools[j], 1);
    var rej2 = WS.Craft.craft('lantern');
    clearInv(p);
    for (j = 0; j < rl.req.length; j++) WS.Inv.give(rl.req[j].id, (rl.req[j].n || 1) + 1);
    var rej3 = WS.Craft.craft('lantern');
    var rejC2 = WS.Cook.prepare('borscht');
    ok('[E8] отказы «ингредиенты» (крафт и стряпня)',
      rej2 && rej2.ok === false && rej2.reason === 'ингредиенты' &&
      rejC2 && rejC2.ok === false && rejC2.reason === 'ингредиенты', { a: rej2, b: rejC2 });
    ok('[E8] отказ «инструменты» (без плоскогубцев у горна)',
      rej3 && rej3.ok === false && rej3.reason === 'инструменты', { res: rej3 });

    // --- исполнитель: 8 сложных рецептов на всех станциях ---
    var crafted = 0, cooked = 0, craftFails = [];

    function runCraft(id, stationLabel) {
      var r = byId[id];
      clearInv(p);
      teleport(p, px, py);
      for (var q = 0; q < r.req.length; q++) WS.Inv.give(r.req[q].id, (r.req[q].n || 1) + 1);
      for (var t2 = 0; t2 < (r.tools || []).length; t2++) WS.Inv.give(r.tools[t2], 1);
      var st0 = WS.G.stats ? (WS.G.stats.itemsCrafted || 0) : 0;
      var res = WS.Craft.craft(id);
      if (!res || !res.ok) { craftFails.push(id + ':' + (res && res.reason)); return false; }
      // ингредиенты списываются СРАЗУ (уносит работу с собой)
      var consumedOk = WS.Inv.count(r.req[0].id) === 1;
      pump('sys:craft', 99999, 2);
      var outOk = true, outs = [];
      for (var o2 = 0; o2 < r.out.length; o2++) {
        var need = r.out[o2].n || 1;
        var have = WS.Inv.count(r.out[o2].id);
        outs.push(r.out[o2].id + ':' + have + '/' + need);
        if (have < need) outOk = false;
      }
      var st1 = WS.G.stats ? (WS.G.stats.itemsCrafted || 0) : st0;
      if (!consumedOk) craftFails.push(id + ':ингредиенты не списаны сразу');
      if (!outOk) craftFails.push(id + ':изделия нет (' + outs.join(',') + ')');
      if (st1 !== st0 + 1) craftFails.push(id + ':itemsCrafted ' + st0 + '→' + st1);
      crafted++;
      return consumedOk && outOk && st1 === st0 + 1;
    }

    function runCook(id) {
      var r = byId[id];
      clearInv(p);
      teleport(p, px, py);
      for (var q = 0; q < r.req.length; q++) WS.Inv.give(r.req[q].id, (r.req[q].n || 1) + 1);
      for (var t2 = 0; t2 < (r.tools || []).length; t2++) WS.Inv.give(r.tools[t2], 1);
      var m0 = WS.G.stats ? (WS.G.stats.mealsCooked || 0) : 0;
      var res = WS.Cook.prepare(id);
      if (!res || !res.ok) { craftFails.push(id + ':' + (res && res.reason)); return false; }
      var spd = (WS.Loop && WS.Loop.speed) ? WS.Loop.speed : 1;
      var tscl = (WS.Time && WS.Time.timeScale) ? WS.Time.timeScale() : 1;
      var dur = p.cook2 ? p.cook2.dur : 60;
      pump('sys:cooking', dur / (spd * tscl), 1);       // ровно до готовности
      var col = WS.Cook.collect();
      if (!col || col.ok !== true) { craftFails.push(id + ':collect:' + (col && col.reason)); return false; }
      var outOk = true, outs = [];
      for (var o2 = 0; o2 < r.out.length; o2++) {
        var need = r.out[o2].n || 1;
        var have = WS.Inv.count(r.out[o2].id);
        outs.push(r.out[o2].id + ':' + have + '/' + need);
        if (have < need) outOk = false;
      }
      var m1 = WS.G.stats ? (WS.G.stats.mealsCooked || 0) : m0;
      if (!outOk) craftFails.push(id + ':блюда нет (' + outs.join(',') + ')');
      if (m1 !== m0 + 1) craftFails.push(id + ':mealsCooked ' + m0 + '→' + m1);
      cooked++;
      return outOk && m1 === m0 + 1;
    }

    var rT1 = runCraft('tincture_iodine', 'fire');        // fire, cat med, 3 req
    ok('[E8] крафт у огня: настойка йода (fire, 3 ингредиента)',
      rT1 === true, { fails: craftFails.slice(0, 6) });
    var rT2 = runCook('goroh_soup');                        // fire, стряпня, 4 req
    ok('[E8] стряпня у огня: гороховый суп (fire, 4 ингредиента)',
      rT2 === true, { fails: craftFails.slice(0, 6) });
    var rT3 = runCook('borscht');                           // stove, 5 req
    ok('[E8] стряпня у печи: борщ (stove, 5 ингредиентов — самый длинный)',
      rT3 === true, { fails: craftFails.slice(0, 6) });
    var rT4 = runCook('bear_paw');                          // stove, 4 req
    ok('[E8] стряпня у печи: медвежья лапа (stove, 4 ингредиента)',
      rT4 === true, { fails: craftFails.slice(0, 6) });
    var rT5 = runCraft('bow', 'workbench');                 // workbench, 4 req
    ok('[E8] крафт у верстака: лук (workbench, 4 ингредиента)',
      rT5 === true, { fails: craftFails.slice(0, 6) });
    var rT6 = runCraft('sled_hand', 'workbench');           // workbench, 3 req, 120 сек
    ok('[E8] крафт у верстака: ручные сани (workbench, 3 ингредиента, 120 сек)',
      rT6 === true, { fails: craftFails.slice(0, 6) });
    var rT7 = runCraft('trap_wolf_make', 'anvil');          // anvil, 3 req, 140 сек
    ok('[E8] крафт у наковальни: волчий капкан (anvil, 3 ингредиента, 140 сек)',
      rT7 === true, { fails: craftFails.slice(0, 6) });

    // фонарь у горна + проверка «руки заняты» и мгновенного списания
    var rF = byId.lantern;
    clearInv(p);
    teleport(p, px, py);
    for (j = 0; j < rF.req.length; j++) WS.Inv.give(rF.req[j].id, (rF.req[j].n || 1) + 1);
    for (j = 0; j < (rF.tools || []).length; j++) WS.Inv.give(rF.tools[j], 1);
    var resL = WS.Craft.craft('lantern');
    var busyL = WS.Craft.craft('lantern');                  // вторая работа — отказ
    pump('sys:craft', 99999, 2);
    if (resL && resL.ok === true && WS.Inv.count('lantern') >= 1) crafted++;
    ok('[E8] крафт у горна: фонарь (forge) + «руки заняты» при повторе',
      resL && resL.ok === true && busyL && busyL.ok === false && busyL.reason === 'руки заняты' &&
      WS.Inv.count('lantern') >= 1,
      { старт: resL, повтор: busyL, фонарей: WS.Inv.count('lantern') });

    ok('[E8] сводка: 5 крафтов + 3 стряпни, статистика растёт',
      crafted === 5 && cooked === 3 && craftFails.length === 0 &&
      (WS.G.stats.itemsCrafted || 0) >= 5 && (WS.G.stats.mealsCooked || 0) >= 3,
      { crafted: crafted, cooked: cooked, itemsCrafted: WS.G.stats.itemsCrafted,
        mealsCooked: WS.G.stats.mealsCooked, fails: craftFails });

    // ======================= E9. КОНЦОВКИ =======================
    var E = WS.Endings.ENDINGS;
    var eIds = Object.keys(E);
    var eBad = [];
    for (i = 0; i < eIds.length; i++) {
      var ee = E[eIds[i]];
      if (typeof ee.title !== 'string' || !ee.title.length) eBad.push(eIds[i] + ':title');
      if (typeof ee.text !== 'string' || ee.text.length < 50) eBad.push(eIds[i] + ':text');
      if (typeof ee.epigraph !== 'string' || !ee.epigraph.length) eBad.push(eIds[i] + ':epigraph');
      if (END_KINDS.indexOf(ee.kind) < 0) eBad.push(eIds[i] + ':kind=' + ee.kind);
    }
    ok('[E9] концовки: title/text/epigraph непусты, kind из фактического множества (' +
      eIds.length + ' шт.)', eBad.length === 0,
      { bad: eBad, kinds: END_KINDS.join(',') });
    ok('[E9] концовка ship_early присутствует', !!E.ship_early && E.ship_early.kind === 'victory');

    // поведенчески: determine() по флагам/статистике
    WS.G.story = WS.G.story || {};
    var flagsSaved = WS.G.story.flags;
    var wolvesSaved = WS.G.stats ? WS.G.stats.wolvesKilled : 0;
    WS.G.story.flags = {};
    if (WS.G.stats) WS.G.stats.wolvesKilled = 0;
    var dNone = WS.Endings.determine();
    // ФИКС ФЛАГА: story.js lightBeacon() ставит 'signal_lit' — старое имя
    // 'signal_fire_lit' никто не читал, ранняя победа не срабатывала
    WS.G.story.flags = { plate_called: true, signal_lit: true };
    var dEarly = WS.Endings.determine();
    WS.G.story.flags = { child_saved: true, semen_alive: true, horse_saved: true };
    var dFam = WS.Endings.determine();
    WS.G.story.flags = {};
    if (WS.G.stats) WS.G.stats.wolvesKilled = 100;
    var dWolf = WS.Endings.determine();
    ok('[E9] determine(): зов+огонь до 55-го дня → ship_early; семья → family; 100 волков → wolf_king',
      dEarly === E.ship_early && dFam === E.family && dWolf === E.wolf_king,
      { early: dEarly && dEarly.title, family: dFam && dFam.title, wolf: dWolf && dWolf.title });
    // ФИКС КОНТРАКТА: determine() больше не возвращает null — непокрытые
    // случаи безопасно считаются зимовкой (дед жив, тарелку пересидит),
    // иначе экран финала мог остаться без концовки
    ok('[E9] determine(): без условий → зимовка-дефолт (не null — фикс контракта)',
      dNone === E.wintering, { рез: dNone && dNone.title });
    // сверка списка: рода 'death' в ENDINGS нет — обычная смерть идёт мимо
    // концовок (экран смерти отдельно), только aurora ('poetic') перехватывает
    if (WS.G.stats) WS.G.stats.wolvesKilled = wolvesSaved || 0;   // вернуть ДО зимовки
    var daySaved = WS.G.time.day;
    WS.G.time.day = 61;
    var dWint = WS.Endings.determine();
    WS.G.time.day = daySaved;
    WS.G.story.flags = flagsSaved || {};
    ok('[E9] determine(): день 61 без огня → wintering (и состояние возвращено)',
      dWint === E.wintering && WS.G.time.day === daySaved, { рез: dWint && dWint.title });

    // ======================= E10. МАТ-БАНК =======================
    var M = WS.Data.matPhrases;
    var TB = (WS.Thoughts && WS.Thoughts._db) || null;
    var mKeys = Object.keys(M);
    var mNotArr = [], mLen = [], mPh = [], mNotInT = [], mDup = [], mEmpty = [];
    for (i = 0; i < mKeys.length; i++) {
      var key = mKeys[i], arr = M[key];
      if (!Array.isArray(arr) || !arr.length) { mNotArr.push(key); continue; }
      if (!TB || !TB[key]) mNotInT.push(key);
      var seenM = {};
      for (j = 0; j < arr.length; j++) {
        var ph = arr[j];
        if (typeof ph !== 'string' || !ph.length) { mEmpty.push(key + ':' + j); continue; }
        if (ph.length < 8 || ph.length > 120) mLen.push(key + ':' + ph.length + 'сим');
        var phs = ph.match(/\{[a-zA-Z_]+\}/g) || [];
        for (k = 0; k < phs.length; k++) mPh.push(key + ':' + phs[k]);
        if (seenM[ph]) mDup.push(key);
        seenM[ph] = 1;
      }
    }
    ok('[E10] мат-банк: все категории — непустые массивы строк (' + mKeys.length + ' шт.)',
      mNotArr.length === 0 && mEmpty.length === 0, { bad: mNotArr.concat(mEmpty).slice(0, 25) });
    ok('[E10] длины мат-фраз 8..120 символов', mLen.length === 0, { bad: mLen.slice(0, 25) });
    ok('[E10] в мат-фразах нет плейсхолдеров {item} и пр. (озвучка идёт по тексту)',
      mPh.length === 0, { bad: mPh.slice(0, 25) });
    ok('[E10] каждая категория мат-банка есть в T-базе мыслей (выключение мата не оголит категории)',
      mNotInT.length === 0 && !!TB,
      { нетВT: mNotInT, категорийT: TB ? Object.keys(TB).length : 0 });
    ok('[E10] дублей мат-фраз внутри категорий нет', mDup.length === 0, { bad: mDup.slice(0, 25) });

    fin();
  } catch (e) {
    bug('фатально: ' + (e && e.message));
    fin();
  }
})();
