// Пробник заслонения: что рисуется поверх игрока в лесу (40,40).
import { createRequire } from 'module';
import { mkdirSync } from 'fs';
const require = createRequire('/home/z/.npm-global/lib/node_modules/');
const { chromium } = require('playwright');

const BASE = process.argv[2] || 'http://localhost:3000';
const OUT = '/home/z/my-project/download/forestprobe';
mkdirSync(OUT, { recursive: true });

const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.goto(BASE, { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(3000);
  await page.locator('text="Случайный герой"').first().click();
  await page.waitForTimeout(400);
  await page.locator('text="Начать"').first().click();
  await page.waitForTimeout(4000);

  await page.evaluate(() => { WS.G.player.x = 40; WS.G.player.y = 40; });
  await page.waitForTimeout(2000);

  const r = await page.evaluate(() => {
    const p = WS.G.player;
    const list = WS.World.query(37, 37, 43, 43).slice(0, 200);
    list.sort((a, b) => (a.x + a.y) - (b.x + b.y));
    const pKey = p.x + p.y;
    return {
      player: { x: p.x, y: p.y, key: pKey, sprName: p.sprName, dir: p.dir, frame: p.sprFrame },
      nearby: list.map(e => ({
        n: e.sprName || e.spr, x: e.x, y: e.y, key: Math.round((e.x + e.y) * 10) / 10,
        over: (e.x + e.y) >= pKey, h: (e.spr && e.spr.height) || (e.sprName ? 'spr' : '?')
      })),
      tileUnder: WS.World.tileAt(40, 40), tileName: (function () {
        const T = WS.World.T; for (const k in T) if (T[k] === WS.World.tileAt(40, 40)) return k; return '?';
      })()
    };
  });
  console.log(JSON.stringify(r, null, 1));
  await page.screenshot({ path: `${OUT}/forest-after.png` });
  await browser.close();
};
run().catch(e => { console.error('FATAL', e); process.exit(1); });
