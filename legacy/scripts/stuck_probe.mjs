// Зонд застревания бота: детальная телеметрия задач и экранов.
import { createRequire } from 'module';
const require = createRequire('/home/z/.npm-global/lib/node_modules/');
const { chromium } = require('playwright');

const run = async () => {
  const browser = await chromium.launchPersistentContext('/tmp/ws-stuck-probe', {
    viewport: { width: 1600, height: 900 }, args: ['--disable-dev-shm-usage']
  });
  const page = browser.pages()[0] || await browser.newPage();
  page.on('pageerror', e => console.log('PAGEERROR:', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE:', m.text().slice(0, 200)); });
  page.on('dialog', d => d.accept().catch(() => {}));
  await page.goto('http://localhost:3000', { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(3000);
  await page.locator('#ws-menu button', { hasText: 'Демо-прохождение' }).first().click();
  await page.waitForTimeout(2500);

  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(3000);
    const st = await page.evaluate(() => {
      const D = WS.Demo._state();
      const p = WS.G.player;
      const task = D.task;
      return {
        t: WS.Time.fmt(),
        task: task ? task.type : null,
        label: task ? (task.label || task.o?.name || '') : '',
        looted: task && task.o ? !!task.o.looted : null,
        plan: D.plan.length,
        path: D.path.length,
        cont: !!(WS.ContScreen && WS.ContScreen.isOpen()),
        searching: !!(WS.Loot && WS.Loot.isSearching && WS.Loot.isSearching()),
        modal: WS.Ui.modal(),
        px: +p.x.toFixed(1), py: +p.y.toFixed(1),
        speed: D.curSpeed,
        lastJr: D.journal.slice(-1).map(j => j.txt)[0] || ''
      };
    });
    console.log(`[${st.t}] task=${st.task}(${st.label}) plan=${st.plan} path=${st.path} cont=${st.cont} srch=${st.searching} modal=${st.modal} @${st.px},${st.py} x${st.speed} | ${st.lastJr.slice(0, 60)}`);
  }
  await browser.close();
};
run().catch(e => { console.error(e); process.exit(1); });
