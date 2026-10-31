// Глубокий диг: почему бот вечно ходит к «Сундуку».
import { createRequire } from 'module';
const require = createRequire('/home/z/.npm-global/lib/node_modules/');
const { chromium } = require('playwright');

const run = async () => {
  const browser = await chromium.launchPersistentContext('/tmp/ws-dig-probe', {
    viewport: { width: 1600, height: 900 }, args: ['--disable-dev-shm-usage']
  });
  const page = browser.pages()[0] || await browser.newPage();
  page.on('dialog', d => d.accept().catch(() => {}));
  await page.goto('http://localhost:3000', { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(3000);
  await page.locator('#ws-menu button', { hasText: 'Демо-прохождение' }).first().click();
  await page.waitForTimeout(5000);

  // немного погонять бота
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(4000);
    const st = await page.evaluate(() => {
      const D = WS.Demo._state();
      const p = WS.G.player;
      const task = D.task;
      // глубокий разбор текущей search-цели
      let targetInfo = null;
      if (task && task.o) {
        const o = task.o;
        targetInfo = {
          name: o.name, x: o.x, y: o.y, container: o.container,
          inWorld: WS.World.objects.indexOf(o) >= 0,
          looted: !!o.looted, fail: o._demoFail || 0,
          dist: +Math.hypot(p.x - o.x, p.y - o.y).toFixed(2),
          taskT: +(task.t || 0).toFixed(2)
        };
      }
      // первые цели лута
      const lootTop = D.world ? D.world.loot.slice(0, 4).map(t => ({
        name: t.o && t.o.name, taken: !!t.taken, fail: (t.o && t.o._demoFail) || 0,
        inWorld: t.o ? WS.World.objects.indexOf(t.o) >= 0 : false
      })) : [];
      // поиск сундуков рядом
      const chests = WS.World.objects.filter(o => o.container && /сундук/i.test(o.name || '') &&
        Math.hypot(o.x - p.x, o.y - p.y) < 10).map(o => ({
          id: o.id, x: o.x, y: o.y, inWorld: true, looted: !!o.looted, fail: o._demoFail || 0
        }));
      return {
        t: WS.Time.fmt(), task: task ? task.type : null,
        label: task ? (task.label || '') : '',
        targetInfo, lootTop, chests,
        searching: !!(WS.Loot.isSearching && WS.Loot.isSearching())
      };
    });
    console.log(JSON.stringify(st));
  }
  await browser.close();
};
run().catch(e => { console.error(e); process.exit(1); });
