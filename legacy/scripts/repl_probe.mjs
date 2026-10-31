// Ручная реплика ветки search: почему не запускается обыск.
import { createRequire } from 'module';
const require = createRequire('/home/z/.npm-global/lib/node_modules/');
const { chromium } = require('playwright');

const run = async () => {
  const browser = await chromium.launchPersistentContext('/tmp/ws-repl-probe', {
    viewport: { width: 1600, height: 900 }, args: ['--disable-dev-shm-usage']
  });
  const page = browser.pages()[0] || await browser.newPage();
  page.on('dialog', d => d.accept().catch(() => {}));
  page.on('console', m => console.log('PAGE:', m.text().slice(0, 300)));
  await page.goto('http://localhost:3000', { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(3000);
  await page.locator('#ws-menu button', { hasText: 'Демо-прохождение' }).first().click();
  await page.waitForTimeout(2000);
  await page.evaluate(() => {
    const entry = WS._tickFns.find(t => t.name === 'demo:pilot');
    if (entry) {
      const orig = entry.fn;
      entry.fn = function (dt) {
        window.__demoTicks = (window.__demoTicks || 0) + 1;
        window.__lastDt = dt;
        return orig(dt);
      };
    }
    const cEntry = WS._tickFns.find(t => t.name === 'crazy:post');
    if (cEntry) {
      const cOrig = cEntry.fn;
      cEntry.fn = function (dt) {
        window.__crazyTicks = (window.__crazyTicks || 0) + 1;
        return cOrig(dt);
      };
    }
  });
  await page.waitForTimeout(40000);

  await page.waitForTimeout(75000);
  for (let i = 0; i < 5; i++) {
    await page.waitForTimeout(5000);
    const out = await page.evaluate(() => {
      const D = WS.Demo._state();
      const p = WS.G.player;
      const t = D.task;
      const target = t && t.o ? {
        name: t.o.name, x: t.o.x, y: t.o.y,
        d: +Math.hypot(p.x - t.o.x, p.y - t.o.y).toFixed(2),
        looted: !!t.o.looted, fail: t.o._demoFail || 0,
        inWorld: WS.World.objects.indexOf(t.o) >= 0
      } : null;
      return {
        t: WS.Time.fmt(),
        task: t ? t.type + (t.o ? ':' + t.o.name : (t.label ? ':' + t.label : '')) : null,
        taskT: t ? +(t.t || 0).toFixed(2) : null,
        taskXY: t ? [+(t.x||0).toFixed(1), +(t.y||0).toFixed(1)] : null,
        effXY: t && t.effX !== undefined ? [+(t.effX||0).toFixed(1), +(t.effY||0).toFixed(1)] : null,
        r: t ? t.r : null,
        path: D.path.length,
        pathTail: D.path.length ? [+(D.path[D.path.length-1].x).toFixed(1), +(D.path[D.path.length-1].y).toFixed(1)] : null,
        stuck: +D.stuckT.toFixed(1),
        px: +p.x.toFixed(1), py: +p.y.toFixed(1),
        target,
        plan: D.plan.map(x => x.type + (x.o ? ':' + x.o.name : (x.label ? ':' + x.label : ''))).slice(0, 4)
      };
    });
    console.log(JSON.stringify(out));
  }
  await browser.close();
};
run().catch(e => { console.error(e); process.exit(1); });
