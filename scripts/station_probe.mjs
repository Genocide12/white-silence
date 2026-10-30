// Зонд: какие станции есть в мире (спрайты объектов)
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
    const spr = {};
    const objs = WS.World.objects;
    for (const o of objs) {
      const k = o.sprName || o.spr || '?';
      spr[k] = (spr[k] || 0) + 1;
    }
    const interesting = {};
    for (const k of Object.keys(spr)) {
      if (/pech|workbench|anvil|forge|stove|campfire|door|bed|table|wardrobe/i.test(k)) interesting[k] = spr[k];
    }
    return {
      totalObjects: objs.length,
      stations: interesting,
      hasInteriorsArray: !!WS.World.interiors,
      otherKeys: Object.keys(WS.World).filter(k => /inter|indoor|room/i.test(k)),
      sample: objs.slice(0, 3).map(o => ({ sprName: o.sprName, spr: o.spr, keys: Object.keys(o).slice(0, 12) }))
    };
  });
  console.log(JSON.stringify(res, null, 2));
  await browser.close();
};
run().catch(e => { console.error(e); process.exit(1); });
