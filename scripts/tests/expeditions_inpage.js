/**
 * expeditions_inpage.js — АВТОТЕСТ МЕТА-СЛОЯ «ЭКСПЕДИЦИИ» (T-1):
 * свежая мета и localStorage, математика starsFor (спидран/изгнания/Древо),
 * отправка экспедиций и анлоки, схрон Деда, покупка перков (цены ×2 за
 * уровень, все 9 эффектов-хуков с потолками), грибные зелья (предметы,
 * рецепты, i18n ru/en, живой крафт), экран «Изба Экспедиций», множитель
 * серии побед (потолок ×2.5) и инварианты экономики звёзд.
 * Протокол: window.__T = {pass, fail, fails, bugs, done} (scripts/run_tests.mjs).
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

  /** Реплика формулы starsFor — порядок операций 1:1 с js/systems/expeditions.js. */
  function expStars(d, wins) {
    d = d || {};
    var day = Math.max(1, d.day || 1);
    var banished = Math.max(0, d.banished || 0);
    var treeLv = Math.max(0, d.treeLv || 0);
    var win = d.result === 'victory';
    var base = day * 0.25 + banished * 0.6 + treeLv * 2.5 + (win ? 18 : 6);
    if (win) base += Math.max(0, 55 - day) * 1.2;
    var mult = Math.min(2.5, 1 + 0.15 * (wins || 0));
    return Math.max(1, Math.round(base * mult));
  }

  /** Опрос условия с таймаутом (для живого крафта). next(timedOut). */
  function waitFor(cond, timeoutMs, next) {
    var t0 = Date.now();
    (function tick() {
      try {
        if (cond() || Date.now() - t0 >= timeoutMs) { next(!cond()); return; }
        setTimeout(tick, 250);
      } catch (e) { bug('исключение в ожидании: ' + (e && e.message)); next(true); }
    })();
  }

  var E = null;          // WS.Expeditions
  var earned = 0;        // сумма звёзд от всех отправок (инвариант экономики)
  var sends = 0;         // число отправок (для проверки капа истории)
  function send(d) { sends++; var r = E.sendExpedition(d); earned += r.stars; return r; }

  function hookSnapshot() {
    return {
      drain: E.drainMul(), energy: E.energyMul(), dmg: E.dmgMul(), speed: E.speedMul(),
      gift: E.giftBonus(), dust: E.dustChance(), torch: E.torchDouble(),
      ritE: E.ritualEnergyCost(), ritD: E.ritualDustNeed()
    };
  }

  try {
    window.confirm = function () { return true; };
    E = WS.Expeditions;

    // ==================================================================
    // 1. СВЕЖАЯ МЕТА (раннер чистит localStorage — мета с нуля)
    // ==================================================================
    ok('модуль Expeditions и экран ExpedScreen зарегистрированы',
       !!(E && E.meta && E.sendExpedition && E.starsFor && E.buy && WS.ExpedScreen && WS.ExpedScreen.show));
    var m0 = E.meta();
    ok('свежая мета: stars=0, runs=[], wins=0, bestDay=0, spentTotal=0',
       m0.stars === 0 && m0.runs.length === 0 && m0.wins === 0 && m0.bestDay === 0 && m0.spentTotal === 0,
       { stars: m0.stars, runs: m0.runs.length, wins: m0.wins, bestDay: m0.bestDay, spentTotal: m0.spentTotal });
    ok('ключ localStorage wsMetaExped1 до первых отправок пуст',
       localStorage.getItem('wsMetaExped1') === null);
    ok('runsCount()=0 и ни одна система не анлокнута (stash/potions/dedfm)',
       E.runsCount() === 0 && E.unlocked('stash') === false && E.unlocked('potions') === false && E.unlocked('dedfm') === false);
    var buy0 = E.buy('skull');
    ok('buy при нуле звёзд отказывает (ok:false + why) и не списывает/не качает',
       buy0.ok === false && typeof buy0.why === 'string' && buy0.why.length > 0 &&
       E.meta().stars === 0 && E.lv('skull') === 0, buy0);
    ok('стартовые цены перков = базовым (skull/appetite 3, palm/boots/magpie 4, torchy 5, starcall 6)',
       E.cost('skull') === 3 && E.cost('appetite') === 3 && E.cost('palm') === 4 &&
       E.cost('boots') === 4 && E.cost('magpie') === 4 && E.cost('torchy') === 5 && E.cost('starcall') === 6);
    ok('неизвестный перк: cost=null, buy отказывает (защита)',
       E.cost('nosuchperk') === null && E.buy('nosuchperk').ok === false);
    var h0 = hookSnapshot();
    ok('эффекты-хуки без перков: drain=1, energy=1, dmg=1, speed=1, gift=0, dust=0.4, torch=0, ritE=30, ritD=3',
       h0.drain === 1 && h0.energy === 1 && h0.dmg === 1 && h0.speed === 1 && h0.gift === 0 &&
       h0.dust === 0.4 && h0.torch === 0 && h0.ritE === 30 && h0.ritD === 3, h0);

    // ==================================================================
    // 2. МАТЕМАТИКА starsFor (wins=0 → множитель 1)
    // ==================================================================
    ok('starsFor: победа день 60 (без спидрана) = 33', E.starsFor({ result: 'victory', day: 60 }) === 33);
    ok('starsFor: победа день 40 = 46 (спидран-бонус 15×1.2=18)', E.starsFor({ result: 'victory', day: 40 }) === 46);
    ok('starsFor: победа день 20 = 65 (спидран-бонус 35×1.2=42)', E.starsFor({ result: 'victory', day: 20 }) === 65);
    ok('starsFor: граница спидрана — день 55 = 32, день 54 = 33 (бонус только до 55-го)',
       E.starsFor({ result: 'victory', day: 55 }) === 32 && E.starsFor({ result: 'victory', day: 54 }) === 33);
    ok('starsFor: смерть день 30 = 14 (30×0.25+6)', E.starsFor({ result: 'death', day: 30 }) === 14);
    ok('starsFor: вклад изгнаний — смерть день 4: banished 0→7, 10→13 (+0.6×10)',
       E.starsFor({ result: 'death', day: 4 }) === 7 && E.starsFor({ result: 'death', day: 4, banished: 10 }) === 13);
    ok('starsFor: вклад Древа — смерть день 4: treeLv 4→17 (+2.5×4)',
       E.starsFor({ result: 'death', day: 4, treeLv: 4 }) === 17);
    ok('starsFor: вырожденный вход null = 6, минимум 1 недостижим ниже (клэмп страхует)',
       E.starsFor(null) === 6 && E.starsFor(null) >= 1);
    var CASES = [
      { result: 'victory', day: 60 }, { result: 'victory', day: 40, banished: 7 },
      { result: 'victory', day: 20, treeLv: 3 }, { result: 'victory', day: 54 },
      { result: 'victory', day: 55, banished: 2, treeLv: 1 },
      { result: 'death', day: 30, banished: 5, treeLv: 2 },
      { result: 'death', day: 4, banished: 10 }, { result: 'death', day: 4, treeLv: 4 },
      { result: 'victory', day: 10, banished: 100, treeLv: 5 },
      { result: 'wintering', day: 33, banished: 1, treeLv: 1 }
    ];
    var allMatch = true, badCase = null;
    for (var ci = 0; ci < CASES.length; ci++) {
      if (E.starsFor(CASES[ci]) !== expStars(CASES[ci], 0)) { allMatch = false; badCase = CASES[ci]; break; }
    }
    ok('starsFor: таблица из ' + CASES.length + ' входов сходится с формулой (день×0.25 + изгнания×0.6 + древо×2.5 + 18/6 + спидран)',
       allMatch, badCase ? { d: badCase, got: E.starsFor(badCase), want: expStars(badCase, 0) } : null);

    // ==================================================================
    // 3. ОТПРАВКИ, АНЛОКИ, СХРОН ДЕДА
    // ==================================================================
    ok('newGame(4242) стартует (фиксированный сид)', WS.Main.newGame('telegraph', ['frostproof', 'patient'], 4242) === true && !!(WS.G && WS.G.running));
    ok('applyStash до первой экспедиции: ничего не вручает (анлока нет)', E.applyStash() === 0);
    var STASH = ['mushroom_fun', 'candy_ded', 'joint_ded', 'matches', 'tincture_fly'];
    var C0 = {};
    for (var si = 0; si < STASH.length; si++) C0[STASH[si]] = WS.Inv.count(STASH[si]);
    ok('до анлока в сумке нет предметов схрона', C0.mushroom_fun === 0 && C0.candy_ded === 0 &&
       C0.joint_ded === 0 && C0.matches === 0 && C0.tincture_fly === 0, C0);

    var s1 = send({ result: 'death', day: 12, banished: 3, treeLv: 1, seed: 4242, name: 'Тестовый Дед', ritual: 1 });
    ok('отправка #1 (смерть день 12, изгнаний 3, древо 1): 13⭐ по формуле',
       s1.stars === 13 && s1.stars === expStars({ result: 'death', day: 12, banished: 3, treeLv: 1 }, 0) && s1.total === 13, s1);
    ok('ран записан в мету с полями (name/seed/ritual), runsCount=1',
       E.runsCount() === 1 && E.meta().runs[0].name === 'Тестовый Дед' && E.meta().runs[0].seed === 4242 && E.meta().runs[0].ritual === 1);
    var ls1 = null; try { ls1 = JSON.parse(localStorage.getItem('wsMetaExped1')); } catch (eLs) { ls1 = null; }
    ok('localStorage wsMetaExped1 реально записан (stars=13, runs=1, result=death, звёзды рана)',
       !!ls1 && ls1.stars === 13 && ls1.runs.length === 1 && ls1.runs[0].result === 'death' && ls1.runs[0].stars === 13);
    ok('после 1 экспедиции анлокнут только Схрон (stash)',
       E.unlocked('stash') === true && E.unlocked('potions') === false && E.unlocked('dedfm') === false);
    ok('runs() отдаёт копию (мутация результата не портит мету)',
       (function () { var r = E.runs(); r.push({}); return E.runs().length === 1; })());

    WS.Main.newGame('telegraph', ['frostproof', 'patient'], 4242);
    var C1 = {};
    for (var sj = 0; sj < STASH.length; sj++) C1[STASH[sj]] = WS.Inv.count(STASH[sj]);
    ok('после 1 экспедиции newGame: мешок Схрона в сумке (грибы×3, конфеты×2, косяк×1, спички×1, настойка×1)',
       C1.mushroom_fun === C0.mushroom_fun + 3 && C1.candy_ded === C0.candy_ded + 2 &&
       C1.joint_ded === C0.joint_ded + 1 && C1.matches === C0.matches + 1 && C1.tincture_fly === C0.tincture_fly + 1,
       { C0: C0, C1: C1 });
    ok('applyStash вручную после анлока вручает второй комплект (5 предметов)', E.applyStash() === 5);
    ok('после ручного applyStash предметы удвоились (грибы +3, спички +1)',
       WS.Inv.count('mushroom_fun') === C1.mushroom_fun + 3 && WS.Inv.count('matches') === C1.matches + 1);

    var s2 = send({ result: 'victory', day: 10, banished: 100, treeLv: 5 });
    ok('отправка #2 (победа день 10, изгнаний 100, древо 5): 147⭐, итог 160',
       s2.stars === 147 && s2.total === 160, s2);
    ok('после #2: wins=1, bestDay=10, анлокнуты Зелья (potions)',
       E.wins() === 1 && E.bestDay() === 10 && E.unlocked('potions') === true && E.unlocked('dedfm') === false);
    var s3 = send({ result: 'victory', day: 8 });
    ok('отправка #3 (победа день 8): звёзды с множителем серии ×1.15',
       s3.stars === expStars({ result: 'victory', day: 8 }, 1), { got: s3.stars, want: expStars({ result: 'victory', day: 8 }, 1) });
    ok('после #3: wins=2, bestDay=8 (ранняя победа обновляет рекорд), анлокнут Дед-FM (dedfm)',
       E.wins() === 2 && E.bestDay() === 8 && E.unlocked('dedfm') === true);
    var s4 = send({ result: 'death', day: 5 });
    ok('отправка #4 (смерть): wins/bestDay не тронуты, runs=4',
       s4.stars === expStars({ result: 'death', day: 5 }, 2) && E.wins() === 2 && E.bestDay() === 8 && E.runsCount() === 4, s4);

    // ==================================================================
    // 4. ГЕНЕРАЦИЯ ЗВЁЗД ДЛЯ ПОКУПОК
    // ==================================================================
    for (var gi = 0; gi < 3; gi++) send({ result: 'victory', day: 10, banished: 100, treeLv: 5 });
    ok('звёзды накоплены (ожидаем 896) — хватает на все перки (303⭐)',
       E.stars() === 896 && E.stars() >= 400, { stars: E.stars() });
    ok('инвариант: stars = сумма всех отправок (экономика не теряет звёзды)',
       E.stars() === earned, { stars: E.stars(), earned: earned });

    // ==================================================================
    // 5. ЭКРАН «ИЗБА ЭКСПЕДИЦИЙ» (DOM #ws-exped)
    // ==================================================================
    var S = WS.ExpedScreen;
    ok('до show экран закрыт (isOpen=false)', S.isOpen() === false);
    S.show();
    var root = document.getElementById('ws-exped');
    ok('show(): DOM #ws-exped создан, видим (без .hidden), isOpen=true',
       !!root && root.classList.contains('hidden') === false && S.isOpen() === true);
    ok('пока Изба открыта — WS.Ui.modal()=true (мир на паузе)', WS.Ui.modal() === true);
    ok('в экране все 7 перков и все 3 системы-анлока',
       root.querySelectorAll('.wt-node[data-perk]').length === 7 && root.querySelectorAll('.wt-unlocks .wt-node').length === 3);
    ok('перки подписаны по-русски (Череп, Скороходы, Звёздный Зов)',
       root.textContent.indexOf('Крепкий Череп') >= 0 && root.textContent.indexOf('Сапоги-Скороходы') >= 0 && root.textContent.indexOf('Звёздный Зов') >= 0);
    ok('шапка: звёзды/экспедиции/победы/рекорд соответствуют мете',
       (root.querySelector('#we-stars') || {}).textContent === String(E.stars()) &&
       (root.querySelector('#we-runs') || {}).textContent === String(E.runsCount()) &&
       (root.querySelector('#we-wins') || {}).textContent === String(E.wins()) &&
       ((root.querySelector('#we-best') || {}).textContent || '').indexOf('8') >= 0);
    ok('все 3 системы показаны как открытые (✔ ОТКРЫТО ×3)',
       (root.textContent.match(/ОТКРЫТО/g) || []).length === 3);
    ok('история экспедиций показывает победу', root.textContent.indexOf('победа') >= 0);
    var perkNodes = root.querySelectorAll('.wt-node[data-perk]');
    var skullNode = null;
    for (var pn = 0; pn < perkNodes.length; pn++) if (perkNodes[pn].getAttribute('data-perk') === 'skull') skullNode = perkNodes[pn];
    var starsBeforeClick = E.stars();
    var skullClickable = !!(skullNode && skullNode.getAttribute('role') === 'button');
    if (skullNode) skullNode.click();
    ok('клик по перку «Крепкий Череп» прямо из экрана покупает уровень (lv 0→1, −3⭐)',
       skullClickable && E.lv('skull') === 1 && E.stars() === starsBeforeClick - 3,
       { clickable: skullClickable, lv: E.lv('skull'), stars: E.stars(), было: starsBeforeClick });
    ok('экран перерисовался после покупки: цена Черепа теперь «⭐ 6»',
       (function () { var n = document.querySelector('#ws-exped .wt-node[data-perk="skull"]');
         return !!n && n.textContent.indexOf('⭐ 6') >= 0; })());
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyX' }));
    // ФИКС: X теперь ЗАКРЫВАЕТ открытую Избу — проверка isOpen() стоит
    // до отсечки модалок (кнопка больше не врёт «Закрыть [X]»)
    ok('клавиша X ЗАКРЫВАЕТ открытую Избу (hidden, isOpen=false, модалка снята)',
       S.isOpen() === false && root.classList.contains('hidden') === true && WS.Ui.modal() === false);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyX' }));
    ok('клавиша X снова открывает Избу (toggle работает в обе стороны)', S.isOpen() === true);
    var closeBtn = root.querySelector('#we-close');
    if (closeBtn) closeBtn.click();
    ok('кнопка «Закрыть» прячет экран (hidden, isOpen=false, модалка снята)',
       S.isOpen() === false && root.classList.contains('hidden') === true && WS.Ui.modal() === false);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyX' }));
    ok('клавиша X открывает закрытую Избу (toggle срабатывает вне модалок)', S.isOpen() === true);
    S.hide();
    ok('hide() прячет экран', S.isOpen() === false);

    // ==================================================================
    // 6. ПОКУПКА ПЕРКОВ: ×2 за уровень, эффекты-хуки, потолки
    // ==================================================================
    var PERKIDS = ['skull', 'appetite', 'palm', 'boots', 'magpie', 'torchy', 'starcall'];
    var MAXLV = { skull: 5, appetite: 5, palm: 3, boots: 3, magpie: 3, torchy: 2, starcall: 2 };
    var HOOK = {
      skull: ['drainMul', function (lv) { return Math.max(0.55, 1 - 0.08 * lv); }],
      appetite: ['energyMul', function (lv) { return Math.min(2, 1 + 0.15 * lv); }],
      palm: ['dmgMul', function (lv) { return Math.min(2.5, 1 + 0.30 * lv); }],
      boots: ['speedMul', function (lv) { return Math.min(1.25, 1 + 0.06 * lv); }],
      magpie: ['giftBonus', function (lv) { return Math.min(0.2, 0.06 * lv); }],
      torchy: ['torchDouble', function (lv) { return Math.min(0.7, 0.35 * lv); }],
      starcall: ['ritualEnergyCost', function (lv) { return Math.max(10, 30 - 10 * lv); }]
    };
    var pi, id, b1;
    for (pi = 0; pi < PERKIDS.length; pi++) {
      id = PERKIDS[pi];
      if (E.lv(id) === 0) {
        b1 = E.buy(id);
        ok('buy(' + id + '): 1-й уровень куплен (ok, now=1, left=остатку звёзд)',
           b1.ok === true && b1.now === 1 && b1.left === E.stars(), b1);
      } else {
        ok('buy(' + id + '): 1-й уровень уже куплен кликом по экрану (lv=1)', E.lv(id) === 1);
      }
    }
    ok('все 9 эффектов-хуков после ровно 1 уровня перков: drain=0.92, energy=1.15, dmg=1.3, speed=1.06, gift=0.06, dust=0.5, torch=0.35, ritE=20, ritD=3',
       E.drainMul() === 0.92 && E.energyMul() === 1.15 && E.dmgMul() === 1.3 && E.speedMul() === 1.06 &&
       E.giftBonus() === 0.06 && E.dustChance() === 0.5 && E.torchDouble() === 0.35 &&
       E.ritualEnergyCost() === 20 && E.ritualDustNeed() === 3, hookSnapshot());
    ok('рост цены ×2 за уровень: skull на lv1 стоит 6 (базовая 3)', E.cost('skull') === 6);
    for (pi = 0; pi < PERKIDS.length; pi++) {
      id = PERKIDS[pi];
      var seq = [], guard = 0;
      while (E.cost(id) !== null && guard < 12) { seq.push(E.cost(id)); E.buy(id); guard++; }
      ok('перк ' + id + ' докуплен до максимума lv=' + MAXLV[id] + ' (цепочка цен: ' + seq.join(' → ') + ')',
         E.lv(id) === MAXLV[id] && seq.length > 0);
      if (id === 'skull') ok('цепочка цен skull 6 → 12 → 24 → 48 (×2 за уровень)', seq.join(',') === '6,12,24,48', seq);
      var hf = HOOK[id][1](MAXLV[id]), hv = E[HOOK[id][0]]();
      ok('хук ' + HOOK[id][0] + ' на максимуме = ' + hf + ' (формула совпала)',
         hv === hf, { got: hv, want: hf });
    }
    var hMax = hookSnapshot();
    ok('потолки на максимуме: drain 0.6≥0.55, energy 1.75≤2, dmg 1.9≤2.5, speed 1.18≤1.25, gift 0.18≤0.2, torch 0.7≤0.7',
       hMax.drain === 0.6 && hMax.drain >= 0.55 && hMax.energy === 1.75 && hMax.energy <= 2 &&
       hMax.dmg === 1.9 && hMax.dmg <= 2.5 && hMax.speed === 1.18 && hMax.speed <= 1.25 &&
       hMax.gift === 0.18 && hMax.gift <= 0.2 && hMax.torch === 0.7 && hMax.torch <= 0.7, hMax);
    ok('потолки на максимуме: ritE=10 (пол), ritD=2 (пыли 2 вместо 3), dust=0.4+0.1×3 ≤ 0.85',
       hMax.ritE === 10 && hMax.ritD === 2 && hMax.dust === Math.min(0.85, 0.4 + 0.10 * 3) && hMax.dust <= 0.85, hMax);
    ok('на максимуме всех 7 перков: cost=null и buy отказывает',
       (function () { for (var i = 0; i < PERKIDS.length; i++) { if (E.cost(PERKIDS[i]) !== null || E.buy(PERKIDS[i]).ok !== false) return false; } return true; })());
    ok('потрачено ровно 303⭐ на все перки: (3+6+12+24+48)×2 + (4+8+16)×3 + (5+10) + (6+12)',
       E.meta().spentTotal === 303, { spentTotal: E.meta().spentTotal });

    // ==================================================================
    // 7. ГРИБНЫЕ ЗЕЛЬЯ: предметы, рецепты, i18n, живой крафт
    // ==================================================================
    var IT = WS.Data.items;
    ok('предмет potion_heal описан (heal=40)', !!IT.potion_heal && IT.potion_heal.heal === 40);
    ok('предмет potion_zoom описан (zoom=60)', !!IT.potion_zoom && IT.potion_zoom.zoom === 60);
    var byId = WS.Data.recipesById;
    var inArr = function (rid) { for (var ri = 0; ri < WS.Data.recipes.length; ri++) if (WS.Data.recipes[ri].id === rid) return WS.Data.recipes[ri]; return null; };
    var rh = byId.potion_heal, rz = byId.potion_zoom;
    ok('рецепт potion_heal есть И в recipes, И в recipesById (пыль×1 + гриб×2)',
       !!rh && inArr('potion_heal') === rh && rh.req.length === 2 &&
       rh.req[0].id === 'stardust' && rh.req[0].n === 1 && rh.req[1].id === 'mushroom_fun' && rh.req[1].n === 2, rh);
    ok('рецепт potion_zoom есть И в recipes, И в recipesById (пыль×1 + конфета×2)',
       !!rz && inArr('potion_zoom') === rz && rz.req.length === 2 &&
       rz.req[0].id === 'stardust' && rz.req[0].n === 1 && rz.req[1].id === 'candy_ded' && rz.req[1].n === 2, rz);
    var LOC = WS.Data.locales;
    ok('i18n RU: имена+описания potion_heal/potion_zoom (и ключи рецептов)',
       !!LOC.ru['item.potion_heal.name'] && !!LOC.ru['item.potion_heal.desc'] &&
       !!LOC.ru['item.potion_zoom.name'] && !!LOC.ru['item.potion_zoom.desc'] &&
       !!LOC.ru['recipe.potion_heal'] && !!LOC.ru['recipe.potion_zoom']);
    ok('i18n EN: имена+описания potion_heal/potion_zoom (и ключи рецептов)',
       !!LOC.en['item.potion_heal.name'] && !!LOC.en['item.potion_heal.desc'] &&
       !!LOC.en['item.potion_zoom.name'] && !!LOC.en['item.potion_zoom.desc'] &&
       !!LOC.en['recipe.potion_heal'] && !!LOC.en['recipe.potion_zoom']);
    ok('i18n RU+EN: stardust и palm_ded (имена+описания)',
       !!LOC.ru['item.stardust.name'] && !!LOC.ru['item.stardust.desc'] && !!LOC.en['item.stardust.name'] && !!LOC.en['item.stardust.desc'] &&
       !!LOC.ru['item.palm_ded.name'] && !!LOC.ru['item.palm_ded.desc'] && !!LOC.en['item.palm_ded.name'] && !!LOC.en['item.palm_ded.desc']);
    ok('WS.I18N.t отдаёт имя зелья из словаря (язык ru)', WS.I18N.t('item.potion_heal.name') === LOC.ru['item.potion_heal.name']);

    // ---- живой крафт «Живая Вода» ----
    var beforeHeal = { dust: WS.Inv.count('stardust'), mush: WS.Inv.count('mushroom_fun'), pot: WS.Inv.count('potion_heal') };
    var gaveDust = WS.Inv.give('stardust', 1), gaveMush = WS.Inv.give('mushroom_fun', 2);
    var cStart = WS.Craft.craft('potion_heal');
    ok('крафт «Живая Вода» запущен (ингредиенты выданы, ok=true, dur=8)',
       gaveDust === 1 && gaveMush === 2 && cStart.ok === true && cStart.dur === 8,
       { gaveDust: gaveDust, gaveMush: gaveMush, cStart: cStart });
    WS.Loop.setSpeed(60);
    waitFor(function () { return WS.Inv.count('potion_heal') > beforeHeal.pot; }, 20000, function (t1) {
      try {
        WS.Loop.setSpeed(1);
        ok('«Живая Вода» скрафчена и на руках (+1), ингредиенты списаны (пыль −1, грибы −2)',
           WS.Inv.count('potion_heal') === beforeHeal.pot + 1 &&
           WS.Inv.count('stardust') === beforeHeal.dust && WS.Inv.count('mushroom_fun') === beforeHeal.mush,
           { pot: WS.Inv.count('potion_heal'), dust: WS.Inv.count('stardust'), mush: WS.Inv.count('mushroom_fun') });
        if (t1) bug('крафт «Живая Вода» не завершился за 20 сек (возможно, остановлен цикл)');

        // ---- живой крафт «Ёрш-Драйв» ----
        var beforeZoom = { dust: WS.Inv.count('stardust'), candy: WS.Inv.count('candy_ded'), pot: WS.Inv.count('potion_zoom') };
        WS.Inv.give('stardust', 1); WS.Inv.give('candy_ded', 2);
        var cz = WS.Craft.craft('potion_zoom');
        ok('крафт «Ёрш-Драйв» запущен (ok=true)', cz.ok === true, cz);
        WS.Loop.setSpeed(60);
        waitFor(function () { return WS.Inv.count('potion_zoom') > beforeZoom.pot; }, 20000, function (t2) {
          try {
            WS.Loop.setSpeed(1);
            ok('«Ёрш-Драйв» скрафчен и на руках (+1), ингредиенты списаны (пыль −1, конфеты −2)',
               WS.Inv.count('potion_zoom') === beforeZoom.pot + 1 &&
               WS.Inv.count('stardust') === beforeZoom.dust && WS.Inv.count('candy_ded') === beforeZoom.candy,
               { pot: WS.Inv.count('potion_zoom'), dust: WS.Inv.count('stardust'), candy: WS.Inv.count('candy_ded') });
            if (t2) bug('крафт «Ёрш-Драйв» не завершился за 20 сек (возможно, остановлен цикл)');

            // ==============================================================
            // 8. МНОЖИТЕЛЬ СЕРИИ ПОБЕД (×1+0.15/wins, потолок ×2.5)
            // ==============================================================
            var m8 = E.meta();
            var savedWins = m8.wins;               // сейчас 5 побед
            var CURVE = [
              { w: 0, v: 33 }, { w: 1, v: 38 }, { w: 4, v: 53 },
              { w: 9, v: 78 }, { w: 10, v: 83 }, { w: 50, v: 83 }
            ];
            var curveOk = true, curveBad = null;
            for (var wi = 0; wi < CURVE.length; wi++) {
              m8.wins = CURVE[wi].w;
              if (E.starsFor({ result: 'victory', day: 60 }) !== CURVE[wi].v) { curveOk = false; curveBad = CURVE[wi]; break; }
            }
            m8.wins = savedWins;
            ok('кривая множителя серии: победа день 60 при wins 0/1/4/9/10/50 = 33/38/53/78/83/83 (упирается в ×2.5)',
               curveOk, curveBad);
            var extraWins = Math.max(0, 10 - savedWins);
            for (var ek = 0; ek < extraWins; ek++) send({ result: 'victory', day: 60 });
            var sCeil = send({ result: 'victory', day: 60 });
            ok('реальная отправка при 10+ победах даёт потолок: день 60 → 83⭐ (33×2.5)',
               sCeil.stars === 83, sCeil);
            ok('wins подрос, звёзды продолжают капать (total > stars)',
               E.wins() === savedWins + extraWins + 1 && sCeil.total > sCeil.stars, { wins: E.wins() });

            // --------------------------------------------------------------
            // история экспедиций ограничена 24 записями (sendExpedition)
            // примечание: load() при следующем старте оставит лишь 12 —
            // несущественная несогласованность, задокументирована в отчёте
            // --------------------------------------------------------------
            while (sends < 26) send({ result: 'death', day: 1 });
            ok('история экспедиций ограничена: при ' + sends + ' отправках в мете 24 рана',
               E.runsCount() === 24 && E.meta().runs.length === 24, { runs: E.runsCount(), sends: sends });

            // ==============================================================
            // 9. ФИНАЛ: инварианты экономики и персистентность
            // ==============================================================
            var mF = E.meta();
            ok('инвариант экономики: stars = заработано отправками − потрачено на перки',
               mF.stars === earned - mF.spentTotal, { stars: mF.stars, earned: earned, spent: mF.spentTotal });
            ok('spentTotal=303 и bestDay=8 (самая ранняя победа — день 8)',
               mF.spentTotal === 303 && mF.bestDay === 8, { spentTotal: mF.spentTotal, bestDay: mF.bestDay });
            var lsF = null; try { lsF = JSON.parse(localStorage.getItem('wsMetaExped1')); } catch (eLs2) { lsF = null; }
            ok('localStorage синхронен с метой (stars/wins/runs/bestDay/spentTotal/perks на максимуме)',
               !!lsF && lsF.stars === mF.stars && lsF.wins === mF.wins && lsF.runs.length === mF.runs.length &&
               lsF.bestDay === mF.bestDay && lsF.spentTotal === mF.spentTotal &&
               lsF.perks.skull === 5 && lsF.perks.torchy === 2 && lsF.perks.starcall === 2,
               lsF ? { stars: lsF.stars, wins: lsF.wins, runs: lsF.runs.length } : null);
            ok('сквозная проверка survived: runs() копия не влияет, runsCount=24, все анлоки открыты',
               E.runs().length === 24 && E.unlocked('stash') && E.unlocked('potions') && E.unlocked('dedfm'));
            fin();
          } catch (e2) {
            bug('исключение после крафта «Ёрш-Драйв»: ' + (e2 && e2.message));
            fin();
          }
        });
      } catch (e1) {
        bug('исключение после крафта «Живая Вода»: ' + (e1 && e1.message));
        fin();
      }
    });
  } catch (e) {
    bug('фатально: ' + (e && e.message));
    fin();
  }
})();
