// Точное время: сколько мс в кадре уходит на крыши (draw) и на всё остальное.
import { createRequire } from 'module';
const require = createRequire('/home/z/.npm-global/lib/node_modules/');
const { chromium } = require('playwright');

const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.goto('http://localhost:3000', { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(3000);
  await page.locator('text="Случайный герой"').first().click();
  await page.waitForTimeout(400);
  await page.locator('text="Начать"').first().click();
  await page.waitForTimeout(4000);

  const r = await page.evaluate(() => new Promise(res => {
    const orig = WS.Roofs.draw;
    let totalMs = 0, calls = 0, frames = 0, rafMs = 0;
    let t0 = performance.now();
    WS.Roofs.draw = function () {
      const s = performance.now();
      orig.apply(this, arguments);
      totalMs += performance.now() - s; calls++;
    };
    function f() {
      frames++;
      const now = performance.now();
      if (now - t0 < 3000) requestAnimationFrame(f);
      else {
        WS.Roofs.draw = orig;
        res({
          fps: (frames / 3).toFixed(1),
          roofMsPerFrame: (totalMs / frames).toFixed(2),
          roofCallsPerFrame: (calls / frames).toFixed(1),
          frameMs: ((now - t0) / frames).toFixed(2)
        });
      }
    }
    requestAnimationFrame(f);
  }));
  console.log('ROOFS', JSON.stringify(r));
  await browser.close();
};
run().catch(e => { console.error('FATAL', e); process.exit(1); });
