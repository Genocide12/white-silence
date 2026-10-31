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
    let door = null, dd = 1e9;
    for (const o of (W.World.objects || [])) {
      if (!o || !o.door) continue;
      const d = Math.hypot(o.x - p.x, o.y - p.y);
      if (d < dd) { dd = d; door = o; }
    }
    const s = W.Cam.worldToScreen(door.x, door.y);
    const cv = document.getElementById('game');
    const rect = cv.getBoundingClientRect();
    return { css: { x: s.x * (rect.width / cv.width), y: s.y * (rect.height / cv.height) }, why: W.WorldHover ? W.WorldHover._dbg().lastWhy : 'нет модуля' };
  });
  await page.mouse.move(r.css.x, r.css.y);
  await page.waitForTimeout(700);
  const st = await page.evaluate(() => {
    const all = document.querySelectorAll('.ws-tooltip');
    let vis = null;
    all.forEach(t => { if (!t.classList.contains('hidden')) vis = t; });
    const W = window.WS;
    return {
      tooltipCount: all.length,
      tooltipVisible: !!vis,
      text: vis ? vis.textContent.slice(0, 140) : '',
      why: W.WorldHover ? W.WorldHover._dbg().lastWhy : 'нет'
    };
  });
  console.log(JSON.stringify({ ...st, mouseAt: r.css, beforeWhy: r.why }, null, 1));
  await browser.close();
};
run().catch(e => { console.error('FATAL', e); process.exit(1); });
