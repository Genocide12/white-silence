// t04_items_items.js — ВЗАИМОДЕЙСТВИЕ ПРЕДМЕТ↔ПРЕДМЕТ: все рецепты крафта
// (ингредиенты → изделие), готовка, починка инструментом, топливо для печи.
import { ctx, startGame, makeT } from './helpers.js';

const BASE = process.argv[2];
const T = makeT('t04_items_items');

const run = async () => {
  const { browser, page, errors } = await ctx(BASE);
  try {
    const st = await startGame(page);
    T.ok(st.ok, 'партия стартует');
    if (!st.ok) throw new Error('нет партии');

    // === ВСЕ РЕЦЕПТЫ: выдать ингредиенты+инструменты → крафтить ===
    // Инструменты в рецептах — ЭТО ID предметов (hasTool по WS.Inv.count(id)),
    // а станции (наковальня/кухня) на спавне нет — честно учитываем отдельно.
    const craftAll = await page.evaluate(async () => {
      const list = WS.Craft.recipes();          // массив объектов рецептов
      const out = { total: list.length, ok: 0, stationless: 0, stationlessOk: 0,
                    needStation: 0, fail: [], bad: [] };
      for (const rec of list) {
        if (!rec || !rec.id) continue;
        const id = rec.id;
        // поддерживать жизнь: прогон долгий, а герой стоит на морозе
        try {
          const pp = WS.G.player;
          if (pp && pp.needs) {
            pp.needs.hunger = 80; pp.needs.thirst = 80; pp.needs.fatigue = 80;
            pp.temp = 37; pp.hp = pp.maxHp || 100;
          }
        } catch (eLife) { /* пусто */ }
        try {
          try { WS.Craft.cancel && WS.Craft.cancel(); } catch (eC) { /* пусто */ }
          for (const rq of (rec.req || [])) WS.Inv.give(rq.id, rq.n || 1);
          for (const tid of (rec.tools || [])) WS.Inv.give(tid, 1);   // инструменты — id предметов
          const r = WS.Craft.craft(id);
          if (r && r.ok) {
            out.ok++;
            if (!rec.station) out.stationlessOk++;
            const t0 = Date.now();
            while (WS.Craft.isCrafting && WS.Craft.isCrafting() && Date.now() - t0 < 3000) {
              await new Promise(res => setTimeout(res, 150));
            }
          } else {
            out.fail.push(id + ':' + ((r && r.reason) || '?'));
          }
        } catch (e) {
          out.bad.push(id + ':' + (e && e.message));
        }
        if (!rec.station) out.stationless++; else out.needStation++;
        // очистить инвентарь напрямую: drop() спавнит объекты мира,
        // и за 284 рецепта посёлок тонет в тысячах выброшенных предметов
        // (рендер захлёбывается — Chromium крэшится). Чистим без спавна.
        try {
          const p = WS.G.player;
          p.inv.length = 0;
          p.invWeight = 0;
          // экипированное не трогаем — предметы в слотах не мешают крафту
        } catch (eClr) { /* пусто */ }
      }
      return out;
    });
    const rate = craftAll.stationlessOk / Math.max(1, craftAll.stationless);
    console.log(`    рецепты: всего ${craftAll.total}, без станции ${craftAll.stationless}` +
      ` (скрафчено ${craftAll.stationlessOk}), со станцией ${craftAll.needStation}`);
    T.ok(craftAll.bad.length === 0, 'крафт: ни один рецепт не кидает исключений' +
      (craftAll.bad.length ? ' — ' + craftAll.bad.slice(0, 5).join(',') : ''));
    T.ok(rate >= 0.9, `крафт: ≥90% рецептов БЕЗ станции выполняются с полными ингредиентами (${craftAll.stationlessOk}/${craftAll.stationless})`);
    if (craftAll.fail.length) console.log('    не скрафтилось: ' + craftAll.fail.slice(0, 12).join(', '));

    // === РЕЦЕПТ: ингредиенты существуют в данных (статическая проверка) ===
    const refs = await page.evaluate(() => {
      const items = WS.Data.items;
      const list = WS.Craft.recipes();
      const bad = [];
      for (const rec of list) {
        if (!rec) continue;
        for (const rq of (rec.req || [])) {
          if (!items[rq.id]) bad.push(rec.id + '→req:' + rq.id);
        }
        for (const o of (rec.out || [])) {
          if (!items[o.id]) bad.push(rec.id + '→out:' + o.id);
        }
      }
      return bad;
    });
    T.eq(refs.length, 0, 'все ссылки рецептов ведут на существующие предметы' +
      (refs.length ? ' — ' + refs.slice(0, 8).join(', ') : ''));

    // === ПРЕДМЕТ↔ПРЕДМЕТ через стол/станцию: готовка у печи ===
    const cook = await page.evaluate(async () => {
      // жив ли герой + отменить зависший крафт (иначе «руки заняты»)
      if (!WS.G || !WS.G.running || !WS.G.player) return { found: false, why: 'нет партии' };
      try { WS.Craft.cancel && WS.Craft.cancel(); } catch (eCancel) { /* пусто */ }
      try {
        const pp = WS.G.player;
        pp.needs.hunger = 80; pp.needs.thirst = 80; pp.needs.fatigue = 80;
        pp.temp = 37; pp.hp = pp.maxHp || 100;
      } catch (e) { /* пусто */ }
      // разжечь печь рядом
      const objs = WS.World.objects;
      let s = null;
      for (let i = 0; i < objs.length; i++) if (objs[i] && objs[i].heat) { s = objs[i]; break; }
      if (!s) return { found: false };
      const p = WS.G.player;
      p.x = s.x + 1.0; p.y = s.y + 0.5;
      WS.Inv.give('firewood_bundle', 2);
      WS.Inv.give('matches', 2);
      WS.Fire.lightStove(s);
      // найти кулинарный рецепт с meat_raw
      const list = WS.Craft.recipes();
      let cookId = null;
      for (const rec of list) {
        if (!rec) continue;
        const req = rec.req || [];
        if (req.some(r => r.id === 'meat_raw') && rec.cat === 'cook') { cookId = rec.id; break; }
      }
      if (!cookId) return { found: true, cookable: false };
      for (const rq of WS.Data.recipesById[cookId].req) WS.Inv.give(rq.id, rq.n || 1);
      const r = WS.Craft.craft(cookId);
      return { found: true, cookable: true, id: cookId, ok: !!(r && r.ok), reason: r && r.reason };
    });
    T.ok(!cook.found || cook.cookable === false || cook.ok,
      'готовка у печи: мясо жарится' + (cook.reason ? ' — ' + cook.reason : ''));

    // === ТОПЛИВО: поленья кормят печь (предмет→печь) ===
    const fuel = await page.evaluate(() => {
      if (!WS.G || !WS.G.running || !WS.G.player) return { found: false };
      try { WS.Craft.cancel && WS.Craft.cancel(); } catch (eCancel2) { /* пусто */ }
      try {
        const pp = WS.G.player;
        pp.needs.hunger = 80; pp.needs.thirst = 80; pp.needs.fatigue = 80;
        pp.temp = 37; pp.hp = pp.maxHp || 100;
      } catch (e) { /* пусто */ }
      const objs = WS.World.objects;
      let s = null;
      for (let i = 0; i < objs.length; i++) if (objs[i] && objs[i].heat) { s = objs[i]; break; }
      if (!s) return { found: false };
      const p = WS.G.player;
      p.x = s.x + 1.0; p.y = s.y + 0.5;
      WS.Inv.give('firewood_bundle', 1);
      WS.Inv.give('matches', 1);
      const r1 = WS.Fire.lightStove(s);
      const near = WS.Fire.near(s.x, s.y, 2);
      return { found: true, ok: (r1 && r1.ok) || !!near };
    });
    T.ok(!fuel.found || fuel.ok, 'топливо: поленья+спички зажигают печь');

    // === ПОЧИНКА: инструмент + материал + предмет ===
    const repair = await page.evaluate(() => {
      WS.Inv.give('sewing_kit', 1);
      WS.Inv.give('cloth_rag', 3);           // материал для шитья
      WS.Inv.give('valenki', 1);
      const p = WS.G.player;
      const idx = p.inv.findIndex(it => it && it.id === 'valenki');
      if (idx < 0) return { ok: false, why: 'нет валенок' };
      p.inv[idx].cond = 40;
      const r = WS.Inv.repair(idx);
      return { ok: !!(r && r.ok), why: r && r.reason, cond: p.inv[idx] ? p.inv[idx].cond : null };
    });
    T.ok(repair.ok, 'починка: игла + тряпьё чинят валенки' +
      (repair.why ? ' — ' + repair.why : '') + (repair.cond !== null ? ' (износ ' + repair.cond + '%)' : ''));

    // === СТАПЛИВАНИЕ: 1+1 предмета = 2 в ячейке (предмет↔предмет) ===
    const stack = await page.evaluate(() => {
      WS.Inv.give('nails', 1);
      WS.Inv.give('nails', 1);
      return { count: WS.Inv.count('nails') };
    });
    T.ok(stack.count >= 2, 'стак: одинаковые предметы складываются (' + stack.count + ')');

    T.eq(errors.length, 0, 'ошибок консоли нет' + (errors.length ? ': ' + errors[0] : ''));
    errors.slice(0, 8).forEach(e => console.log('    ' + e));
  } finally {
    await browser.close();
  }
  const r = T.finish();
  process.exit(r.failed ? 1 : 0);
};

run().catch(e => { console.error('FAIL', e); process.exit(2); });
