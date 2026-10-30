// Отладка: почему бот «зависает на search» — дамп состояния автопилота.
import { createRequire } from 'module';
const require = createRequire('/home/z/.npm-global/lib/node_modules/');
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:3000';
const PROFILE = '/tmp/ws-diag-profile3';
const WAIT_MS = parseInt(process.argv[3] || '90000', 10);

const run = async () => {
  const browser = await chromium.launchPersistentContext(PROFILE, {
    viewport: { width: 1400, height: 800 }, args: ['--disable-dev-shm-usage']
  });
  const page = browser.pages()[0] || await browser.newPage();
  page.on('pageerror', e => console.log('PAGEERROR:', e.message));
  page.on('console', m => {
    const t = m.text();
    if (m.type() === 'error') console.log('CONSOLE-ERR:', t.slice(0, 200));
  });
  page.on('dialog', d => d.accept().catch(() => {}));
  await page.goto(BASE, { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(3000);
  const btn = page.locator('#ws-menu button', { hasText: 'Демо-прохождение' }).first();
  await btn.click();
  await page.waitForTimeout(8000);

  const t0 = Date.now();
  let i = 0;
  while (Date.now() - t0 < WAIT_MS) {
    await page.waitForTimeout(10000);
    const st = await page.evaluate(() => {
      const D = WS.Demo._state();
      const p = WS.G.player;
      const modalEls = Array.from(document.querySelectorAll('.ws-modal:not(.hidden)'))
        .map(e => e.id || e.className.slice(0, 40));
      const visibleScr = Array.from(document.querySelectorAll('.scr:not(.hidden)'))
        .map(e => e.className.slice(0, 40));
      return {
        day: WS.Time.day(), fmt: WS.Time.fmt(),
        task: D.task ? (D.task.type + ' ' + (D.task.label || '') + ' t=' + (D.task.t || 0).toFixed(1) +
          ' o=' + (D.task.o ? (D.task.o.name || D.task.o.sprName) + (D.task.o.looted ? ' [looted]' : ' [full]') : '-')) : null,
        planLen: D.plan.length,
        planTypes: D.plan.slice(0, 6).map(t => t.type + (t.o ? ':' + (t.o.name || '?') : '')),
        pathLen: D.path.length,
        px: +p.x.toFixed(1), py: +p.y.toFixed(1),
        contOpen: WS.ContScreen.isOpen(),
        searching: !!(WS.Loot && WS.Loot.isSearching && WS.Loot.isSearching()),
        uiModal: WS.Ui.modal(),
        modalEls, visibleScr,
        inv: WS.Inv.snapshot().slots.map(s => s.id + 'x' + s.count).slice(0, 25),
        weight: WS.Inv.snapshot().weight.toFixed(1) + '/' + WS.Inv.snapshot().maxWeight,
        journal: D.journal.slice(-3).map(j => j.t + ' ' + j.txt)
      };
    });
    console.log('=== sample ' + (++i) + ' ===');
    console.log(JSON.stringify(st, null, 1));
  }
  await browser.close();
};
run().catch(e => { console.error(e); process.exit(1); });
