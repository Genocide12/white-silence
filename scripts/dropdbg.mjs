import { createRequire } from 'module';
const require = createRequire('/home/z/.npm-global/lib/node_modules/');
const { chromium } = require('playwright');
const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('pageerror', e => console.log('PAGEERROR:', e.message));
  await page.goto('http://localhost:3000/', { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(3500);
  const rnd = page.locator('text="Случайный герой"').first();
  if (await rnd.isVisible().catch(() => false)) { await rnd.click(); await page.waitForTimeout(400); }
  const start = page.locator('text="Начать"').first();
  if (await start.isVisible().catch(() => false)) await start.click();
  await page.waitForTimeout(6000);
  const r = await page.evaluate(() => {
    const W = window.WS;
    const p = W.G.player;
    const d = W.Action.makeDrop('bread', 2, 100, p.x + 2.2, p.y - 1.5, 2);
    if (!d) return { placed: false };
    // мышь точно на дроп (внутренние пиксели)
    const m = (typeof W.Input.mouse === 'function') ? W.Input.mouse() : W.Input.mouse;
    const s = W.Cam.worldToScreen(d.x, d.y);
    m.x = s.x; m.y = s.y;
    if (W.Input.updateMouseWorld) W.Input.updateMouseWorld();
    const tgt = W.Action.cursorTarget();
    const before = W.Action.countItem('bread');
    const qa = tgt ? W.Action.quickAction(tgt.o) : null;
    const after = W.Action.countItem('bread');
    return {
      placed: true, dropAt: { x: d.x, y: d.y }, playerAt: { x: p.x, y: p.y },
      pDist: Math.hypot(p.x - d.x, p.y - d.y),
      mouseWorld: { wx: m.wx, wy: m.wy },
      tgt: tgt ? { far: tgt.far, ent: tgt.ent, kind: tgt.o.kind } : null,
      before, after, picked: after === before + 2
    };
  });
  console.log(JSON.stringify(r, null, 1));
  await browser.close();
};
run().catch(e => { console.error('FATAL', e); process.exit(1); });
