// Отладка дыма: живут ли частицы, сколько их, где.
import { createRequire } from 'module';
const require = createRequire('/home/z/.npm-global/lib/node_modules/');
const { chromium } = require('playwright');

const BASE = process.argv[2] || 'http://localhost:3000';

const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 200)); });

  await page.goto(BASE, { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(3000);
  await page.locator('text="Случайный герой"').first().click();
  await page.waitForTimeout(400);
  await page.locator('text="Начать"').first().click();
  await page.waitForTimeout(4000);
  // телепорт к отапливаемому зданию покрупнее и ждём дыма
  await page.evaluate(() => {
    const W = WS.World;
    const b = W.buildings.find(bb => WS.RNG.hash2(bb.x, bb.y, 4242) < 0.45 && bb.w >= 5) ||
              W.buildings.find(bb => WS.RNG.hash2(bb.x, bb.y, 4242) < 0.45);
    if (b) { WS.G.player.x = b.x + b.w / 2 + 3; WS.G.player.y = b.y + b.h / 2 + 4; }
  });
  await page.waitForTimeout(6000);
  await page.screenshot({ path: '/home/z/my-project/download/audit2/10-smoke-close.png' });
  // перехват спавна: сколько chimney-частиц реально живёт
  const spawned = await page.evaluate(() => new Promise(resolve => {
    let n = 0;
    const orig = WS.Fx.spawn;
    WS.Fx.spawn = function (type) { if (type === 'chimney') n++; return orig.apply(this, arguments); };
    setTimeout(() => { WS.Fx.spawn = orig; resolve({ chimneySpawnedIn3s: n }); }, 3000);
  }));
  console.log('SMOKE', JSON.stringify(spawned));

  const dbg = await page.evaluate(() => {
    const G = WS.G, W = WS.World;
    const p = G.player;
    const heatedList = [];
    let heatedCount = 0;
    for (const b of W.buildings) {
      const h = WS.RNG.hash2(b.x, b.y, 4242) < 0.45;
      if (h) heatedCount++;
      const d = Math.hypot(b.x + b.w / 2 - p.x, b.y + b.h / 2 - p.y);
      if (h && d < 60) heatedList.push({ id: b.id, d: Math.round(d), win: (b.windows || []).length });
    }
    return {
      player: { x: +p.x.toFixed(1), y: +p.y.toFixed(1) },
      buildings: W.buildings.length,
      heatedCount,
      heatedNear: heatedList,
      lights: W.lights.filter(l => l.win).length,
      weather: G.weather ? G.weather.cur : null,
      roofsVisible: WS.Roofs.visible(WS.Cam.viewBounds(2)).length,
    };
  });
  console.log('DBG', JSON.stringify(dbg, null, 1));
  await page.waitForTimeout(3000);
  await page.screenshot({ path: '/home/z/my-project/download/audit2/09-smoke-check.png' });
  console.log('ERRORS', JSON.stringify(errors.slice(0, 10), null, 1));
  await browser.close();
};
run().catch(e => { console.error('FATAL', e); process.exit(1); });
