// Зонд: почему stretcher/charcoal_burn не крафтятся + useMed + станции
import { createRequire } from 'module';
const require = createRequire('/home/z/.npm-global/lib/node_modules/');
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:3000';

const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(BASE, { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(3500);
  await page.locator('text="Случайный герой"').first().click();
  await page.waitForTimeout(400);
  await page.locator('text="Начать"').first().click();
  await page.waitForTimeout(4500);
  const res = await page.evaluate(() => {
    const G = WS.G, p = G.player;
    const out = {};
    // 1) что не хватает stretcher / charcoal_burn
    for (const rid of ['stretcher', 'charcoal_burn']) {
      p.inv = []; p.equip = {};
      const r = WS.Data.recipesById[rid];
      for (const q of r.req) WS.Inv.give(q.id, (q.n || 1) + 1);
      for (const t of (r.tools || [])) WS.Inv.give(t, 1);
      WS.Inv.give('matches', 5); WS.Inv.give('firewood_bundle', 5);
      const chk = WS.Inv.hasAll(r.req);
      out[rid] = {
        missing: chk.missing,
        reqDetail: r.req.map(q => ({ id: q.id, n: q.n, count: WS.Inv.count(q.id), defExists: !!WS.Data.items[q.id], w: WS.Data.items[q.id] ? WS.Data.items[q.id].w : null })),
        weight: Math.round(WS.Inv.weight() * 10) / 10,
        maxW: WS.Inv.maxWeight()
      };
    }
    // 2) useMed на раненом
    p.inv = []; p.equip = {};
    p.hp = 50; p.pain = 40; p.infection = 10;
    p.wound = { t: 'cut', treated: false, bleed: 2 };
    const meds = ['bandage_clean', 'iodine_tincture', 'vodka', 'aspirin', 'morphine'];
    out.meds = {};
    for (const m of meds) {
      WS.Inv.give(m, 2);
      const before = p.hp;
      const r = WS.Health.useMed(m);
      out.meds[m] = { res: r, hpDelta: +(p.hp - before).toFixed(1), left: WS.Inv.count(m) };
    }
    // 3) gMin скорость
    out.speeds = {
      loop: WS.Loop ? WS.Loop.speed : 'n/a',
      timeScale: WS.Time && WS.Time.timeScale ? WS.Time.timeScale() : 'n/a'
    };
    // 4) World API для объектов
    out.worldApi = Object.keys(WS.World).filter(k => typeof WS.World[k] === 'function' && /add|put|spawn|query/i.test(k));
    return out;
  });
  console.log(JSON.stringify(res, null, 2));
  await browser.close();
};
run().catch(e => { console.error(e); process.exit(1); });
