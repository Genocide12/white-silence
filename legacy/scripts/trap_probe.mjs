// Ловушка: кто и когда удаляет контейнеры из мира во время демо.
import { createRequire } from 'module';
const require = createRequire('/home/z/.npm-global/lib/node_modules/');
const { chromium } = require('playwright');

const run = async () => {
  const browser = await chromium.launchPersistentContext('/tmp/ws-trap-probe', {
    viewport: { width: 1600, height: 900 }, args: ['--disable-dev-shm-usage']
  });
  const page = browser.pages()[0] || await browser.newPage();
  page.on('dialog', d => d.accept().catch(() => {}));
  page.on('console', m => { const t = m.text(); if (t.includes('TRAP')) console.log(t.slice(0, 400)); });
  await page.goto('http://localhost:3000', { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(3000);
  await page.locator('#ws-menu button', { hasText: 'Демо-прохождение' }).first().click();
  await page.waitForTimeout(2000);

  await page.evaluate(() => {
    // пометить все цели лута бота
    const D = WS.Demo._state();
    if (D.world) D.world.loot.forEach(t => { if (t.o) t.o._trap = 'LOOT'; });
    // и все контейнеры в мире
    WS.World.objects.forEach(o => { if (o.container) o._trap = o._trap || 'CONT'; });
    // ловушка на удаление
    const origRemove = WS.World.removeObject;
    WS.World.removeObject = function (o) {
      if (o && o._trap) {
        const stack = new Error().stack || '';
        console.log('TRAP removed: ' + (o.name || o.sprName) + ' @' + o.x + ',' + o.y +
          ' trap=' + o._trap + ' | ' + stack.split('\n').slice(1, 5).join(' <- '));
      }
      return origRemove.call(WS.World, o);
    };
    // ловушка на добавление новых объектов-контейнеров
    const origAdd = WS.World.addObject;
    WS.World.addObject = function (o) {
      const r = origAdd.call(WS.World, o);
      if (o && o.container && !o._trap) {
        o._trap = 'NEW';
        console.log('TRAP added container: ' + (o.name || o.sprName) + ' @' + o.x + ',' + o.y);
      }
      return r;
    };
    console.log('TRAP armed: ' + WS.World.objects.filter(o => o._trap).length + ' tagged');
  });

  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(5000);
    const st = await page.evaluate(() => {
      const D = WS.Demo._state();
      const p = WS.G.player;
      const task = D.task;
      const lootAlive = D.world ? D.world.loot.slice(0, 3).map(t => ({
        n: t.o && t.o.name, in: t.o ? WS.World.objects.indexOf(t.o) >= 0 : false,
        taken: !!t.taken, fail: (t.o && t.o._demoFail) || 0
      })) : [];
      return { t: WS.Time.fmt(), task: task ? (task.type + ' ' + (task.label || '')) : '-',
               px: +p.x.toFixed(1), py: +p.y.toFixed(1), lootAlive };
    });
    console.log(`[${st.t}] ${st.task} @${st.px},${st.py} loot=${JSON.stringify(st.lootAlive)}`);
  }
  await browser.close();
};
run().catch(e => { console.error(e); process.exit(1); });
