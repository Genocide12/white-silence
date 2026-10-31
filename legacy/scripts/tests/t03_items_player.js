// t03_items_player.js — ВЗАИМОДЕЙСТВИЕ ПРЕДМЕТ↔ИГРОК: каждая съедобная еда,
// каждое питьё, вся одежда, инструменты в руку, оружие, книги, медикаменты.
import { ctx, startGame, makeT } from './helpers.js';

const BASE = process.argv[2];
const T = makeT('t03_items_player');

const run = async () => {
  const { browser, page, errors } = await ctx(BASE);
  try {
    const st = await startGame(page);
    T.ok(st.ok, 'партия стартует');
    if (!st.ok) throw new Error('нет партии');

    // --- все предметы по категориям ---
    const cats = await page.evaluate(() => {
      const out = { food: [], drink: [], cloth: [], weapon: [], ranged: [], book: [], med: [], tool: [] };
      const items = WS.Data.items;
      for (const id in items) {
        const d = items[id];
        if (!d) continue;
        if ((d.cal || 0) > 0 || (d.tags || []).indexOf('edible') >= 0) out.food.push(id);
        if ((d.tags || []).indexOf('drinkable') >= 0) out.drink.push(id);
        if (d.slots && d.slots.length && d.slots[0] !== 'hand1' && d.slots[0] !== 'hand2') out.cloth.push(id);
        if (d.cat === 'weapon' || ((d.tags || []).indexOf('weapon') >= 0 && !d.slots)) out.weapon.push(id);
        if (d.cat === 'ranged') out.ranged.push(id);
        if (d.cat === 'book' || (d.tags || []).indexOf('readable') >= 0) out.book.push(id);
        if (d.cat === 'med') out.med.push(id);
        if (d.cat === 'tool') out.tool.push(id);
      }
      return out;
    });
    console.log('    категорий: ' + Object.keys(cats).map(k => k + '=' + cats[k].length).join(', '));

    // --- ЕДА: каждую попытаться съесть (голодный, полный инвентарь предмета) ---
    const eatResults = await page.evaluate(async (ids) => {
      const out = { ok: 0, fail: [], bad: [] };
      for (const id of ids) {
        const p = WS.G.player;
        WS.Inv.give(id, 1);
        p.needs.hunger = 10;                       // голодный
        const before = WS.Inv.count(id);
        let r = null;
        try { r = WS.Needs.eat(id); } catch (e) { out.bad.push(id + ':EX'); continue; }
        const after = WS.Inv.count(id);
        if (r && r.ok && after < before) out.ok++;
        else if (r && r.ok) out.ok++;              // съелось из стакающейся стопки
        else out.fail.push(id + ':' + ((r && r.reason) || '?'));
        // подчистить, чтобы не мешать
        while (WS.Inv.count(id) > 0) {
          const idx = p.inv.findIndex(it => it && it.id === id);
          if (idx < 0) break;
          WS.Inv.drop(idx, 99);
        }
      }
      return out;
    }, cats.food);
    console.log(`    еда: съедобно ${eatResults.ok}/${cats.food.length}`);
    T.ok(eatResults.bad.length === 0, 'еда: ни одно съедание не кидает исключений' + (eatResults.bad.length ? ' — ' + eatResults.bad.join(',') : ''));
    T.ok(eatResults.ok >= Math.floor(cats.food.length * 0.7),
      `еда: ≥70% предметов реально съедаются (${eatResults.ok}/${cats.food.length})`);
    if (eatResults.fail.length) console.log('    не съелись: ' + eatResults.fail.slice(0, 10).join(', '));

    // --- ПИТЬЁ ---
    const drinkResults = await page.evaluate((ids) => {
      const out = { ok: 0, bad: [], fail: [] };
      for (const id of ids) {
        const p = WS.G.player;
        WS.Inv.give(id, 1);
        p.needs.thirst = 10;
        let r = null;
        try { r = WS.Needs.drink(id); } catch (e) { out.bad.push(id); continue; }
        if (r && r.ok) out.ok++;
        else out.fail.push(id + ':' + ((r && r.reason) || '?'));
        const idx = p.inv.findIndex(it => it && it.id === id);
        if (idx >= 0) WS.Inv.drop(idx, 99);
      }
      return out;
    }, cats.drink);
    T.ok(drinkResults.bad.length === 0, 'питьё: без исключений');
    T.ok(drinkResults.ok >= Math.floor(cats.drink.length * 0.6),
      `питьё: ≥60% питья пьётся (${drinkResults.ok}/${cats.drink.length})`);
    if (drinkResults.fail.length) console.log('    не пьётся: ' + drinkResults.fail.slice(0, 8).join(', '));

    // --- ОДЕЖДА: каждую надеть в её слот и снять ---
    const clothResults = await page.evaluate((ids) => {
      const out = { ok: 0, bad: [], fail: [] };
      for (const id of ids) {
        const p = WS.G.player;
        WS.Inv.give(id, 1);
        const def = WS.Data.items[id];
        const slot = def.slots[0];
        const idx = p.inv.findIndex(it => it && it.id === id);
        if (idx < 0) { out.fail.push(id + ':нет в сумке'); continue; }
        try {
          const r = WS.Inv.equip(slot, idx);
          const on = p.equip[slot] && p.equip[slot].id === id;
          if (on) {
            WS.Inv.unequip(slot);
            out.ok++;
          } else out.fail.push(id + ':' + ((r && r.reason) || 'не наделось'));
        } catch (e) { out.bad.push(id + ':' + e.message); }
        const idx2 = p.inv.findIndex(it => it && it.id === id);
        if (idx2 >= 0) WS.Inv.drop(idx2, 99);
      }
      return out;
    }, cats.cloth);
    T.ok(clothResults.bad.length === 0, 'одежда: без исключений');
    T.ok(clothResults.ok >= Math.floor(cats.cloth.length * 0.85),
      `одежда: ≥85% надевается (${clothResults.ok}/${cats.cloth.length})`);
    if (clothResults.fail.length) console.log('    не наделось: ' + clothResults.fail.slice(0, 8).join(', '));

    // --- ОРУЖИЕ В РУКУ ---
    const handResults = await page.evaluate((ids) => {
      const out = { ok: 0, bad: [] };
      for (const id of ids.slice(0, 25)) {          // выборка из 25
        const p = WS.G.player;
        WS.Inv.give(id, 1);
        const idx = p.inv.findIndex(it => it && it.id === id);
        try {
          WS.Inv.equip('hand1', idx);
          const on = p.equip.hand1 && p.equip.hand1.id === id;
          if (on) { WS.Inv.unequip('hand1'); out.ok++; }
        } catch (e) { out.bad.push(id); }
        const idx2 = p.inv.findIndex(it => it && it.id === id);
        if (idx2 >= 0) WS.Inv.drop(idx2, 99);
      }
      return out;
    }, cats.weapon);
    T.ok(handResults.bad.length === 0 && handResults.ok > 0,
      `оружие в руку: ${handResults.ok}/${Math.min(25, cats.weapon.length)} без исключений`);

    // --- КНИГИ: чтение не падает ---
    const bookResults = await page.evaluate((ids) => {
      const out = { ok: 0, bad: [] };
      for (const id of ids.slice(0, 20)) {
        try {
          WS.Inv.give(id, 1);
          WS.Reading.start(id);
          WS.Reading.stop && WS.Reading.stop();
          out.ok++;
        } catch (e) { out.bad.push(id); }
        const idx = WS.G.player.inv.findIndex(it => it && it.id === id);
        if (idx >= 0) WS.Inv.drop(idx, 99);
      }
      return out;
    }, cats.book);
    T.ok(bookResults.bad.length === 0, `книги: чтение без падений (${bookResults.ok})`);

    // --- ИГРОК ЖИВ ПОСЛЕ ВСЕГО ---
    const alive = await page.evaluate(() => WS.G.player && WS.G.player.hp > 0);
    T.ok(alive, 'игрок жив после всех манипуляций');

    T.eq(errors.length, 0, 'ошибок консоли нет' + (errors.length ? ': ' + errors[0] : ''));
    errors.slice(0, 8).forEach(e => console.log('    ' + e));
  } finally {
    await browser.close();
  }
  const r = T.finish();
  process.exit(r.failed ? 1 : 0);
};

run().catch(e => { console.error('FAIL', e); process.exit(2); });
