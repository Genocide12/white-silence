// stuck_trace.mjs — трассировка движения бота в застрявшем состоянии:
// позиция каждые 0.5с, клавиши, waypoint, fracture/pain, скорость.
import { createRequire } from 'module';
const require = createRequire('/home/z/.npm-global/lib/node_modules/');
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:3000';
const SECONDS = parseFloat(process.argv[3] || '40');

const run = async () => {
  const browser = await chromium.launchPersistentContext('/tmp/ws-demo-profile', {
    viewport: { width: 1600, height: 900 }, args: ['--disable-dev-shm-usage']
  });
  const page = browser.pages()[0] || await browser.newPage();
  page.on('dialog', d => d.accept().catch(() => {}));
  await page.goto(BASE, { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(3500);
  const cont = page.locator('text="Продолжить демо"').first();
  if (await cont.isVisible().catch(() => false)) { await cont.click(); }
  else {
    const cont2 = page.locator('text="Продолжить"').first();
    if (await cont2.isVisible().catch(() => false)) { await cont2.click(); }
  }
  await page.waitForTimeout(2000);
  // если партии нет — стартуем демо кнопкой
  const running = await page.evaluate(() => !!(window.WS && window.WS.G && window.WS.G.running));
  if (!running) {
    const btn = page.locator('#ws-menu button', { hasText: 'Демо-прохождение' }).first();
    if (await btn.isVisible().catch(() => false)) await btn.click();
    await page.waitForTimeout(3000);
  }

  const samples = await page.evaluate(async (secs) => {
    const W = window.WS;
    const out = [];
    const t0 = performance.now();
    while (performance.now() - t0 < secs * 1000) {
      const D = W.Demo._state();
      const p = W.G.player;
      out.push({
        t: Math.round((performance.now() - t0) / 100) / 10,
        x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100,
        mv: !!p.moving, keys: Object.keys(D.keysHeld || {}).join(','),
        wp: D.path && D.path[0] ? [D.path[0].x, D.path[0].y] : null,
        stuck: Math.round((D.stuckT || 0) * 100) / 100,
        spd: Math.round((p.speed || 0) * 100) / 100,
        frac: !!p.fracture, pain: Math.round((p.pain || 0) * 10) / 10,
        breath: Math.round((p.breath || 0) * 100) / 100
      });
      await new Promise(r => setTimeout(r, 500));
    }
    return out;
  }, SECONDS);

  let prev = null;
  for (const s of samples) {
    const d = prev ? Math.round(Math.hypot(s.x - prev.x, s.y - prev.y) * 100) / 100 : 0;
    console.log(`t=${s.t}s pos=(${s.x},${s.y}) Δ=${d} mv=${s.mv ? 1 : 0} keys=[${s.keys}] wp=${s.wp ? s.wp.join(',') : '-'} stuck=${s.stuck} spd=${s.spd} frac=${s.frac ? 1 : 0} pain=${s.pain} br=${s.breath}`);
    prev = s;
  }
  const p0 = samples[0], p1 = samples[samples.length - 1];
  console.log(`ИТОГО за ${SECONDS}с: смещение ${Math.hypot(p1.x - p0.x, p1.y - p0.y).toFixed(2)} тайлов`);
  await browser.close();
};
run().catch(e => { console.error('FATAL', e); process.exit(1); });
