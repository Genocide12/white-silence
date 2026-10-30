// Дамп объектов с именами вокруг запечатанных зон
import { createRequire } from 'module';
const require = createRequire('/home/z/.npm-global/lib/node_modules/');
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:3000';
const PROFILE = '/tmp/ws-diag-profile';

const run = async () => {
  const browser = await chromium.launchPersistentContext(PROFILE, {
    viewport: { width: 1400, height: 800 }, args: ['--disable-dev-shm-usage']
  });
  const page = browser.pages()[0] || await browser.newPage();
  page.on('pageerror', e => console.log('PAGEERROR:', e.message));
  page.on('dialog', d => d.accept().catch(() => {}));
  await page.goto(BASE, { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(3000);
  const btn = page.locator('#ws-menu button', { hasText: 'Демо-прохождение' }).first();
  await btn.click();
  await page.waitForTimeout(6000);

  const out = await page.evaluate(() => {
    const w = WS.World;
    const zones = [
      { name: 'store_3', x0: 81, x1: 91, y0: 135, y1: 144 },
      { name: 'warehouse_27', x0: 83, x1: 97, y0: 149, y1: 158 },
      { name: 'warehouse_31', x0: 143, x1: 157, y0: 149, y1: 158 }
    ];
    return zones.map(z => {
      const objs = [];
      for (const o of w.objects) {
        const ox = Math.floor(o.x), oy = Math.floor(o.y);
        if (ox >= z.x0 && ox <= z.x1 && oy >= z.y0 && oy <= z.y1) {
          objs.push({ at: ox + ',' + oy, spr: o.sprName, name: o.name,
            solid: !!o.solid, cont: o.container || null, door: !!o.door,
            heat: !!o.heat });
        }
      }
      return { z: z.name, objs };
    });
  });
  for (const r of out) {
    console.log('=== ' + r.z);
    for (const o of r.objs) console.log('   ' + o.at + ' ' + o.spr + ' "' + o.name + '" solid=' + o.solid + ' cont=' + o.cont + (o.door ? ' DOOR' : '') + (o.heat ? ' HEAT' : ''));
  }
  await browser.close();
};
run().catch(e => { console.error(e); process.exit(1); });
