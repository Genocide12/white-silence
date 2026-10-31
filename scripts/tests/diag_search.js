// Зонд обыска: почему search() не работает.
import { createRequire } from 'module';
const require = createRequire('/home/z/.npm-global/lib/node_modules/');
const { chromium } = require('playwright');
const BASE = process.argv[2];

const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', m => console.log('[b]', m.text().slice(0, 160)));
  page.on('pageerror', e => console.log('[PAGEERROR]', e.message));
  await page.goto(BASE, { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(3500);

  const probe = await page.evaluate(() => {
    WS.Main.newGame('telegraph', ['frostproof'], 1917);
    WS.Ui.unpause();
    const objs = WS.World.objects;
    let c = null;
    for (const o of objs) {
      if (o && o.container && !o.locked && !o.looted) {
        // найти со стоячим тайлом
        for (const d of [[1,0],[-1,0],[0,1],[0,-1]]) {
          const tx = Math.floor(o.x)+d[0], ty = Math.floor(o.y)+d[1];
          if (!WS.World.isTileBlocked(tx, ty)) { c = o; break; }
        }
        if (c) break;
      }
    }
    const p = WS.G.player;
    p.x = c.x + 1; p.y = c.y + 0.5;
    const r1 = WS.Loot.search(c);
    return { name: c.name, started: r1, isSearching: WS.Loot.isSearching() };
  });
  console.log('ШАГ1:', JSON.stringify(probe));

  await page.waitForTimeout(1000);
  const s2 = await page.evaluate(() => ({
    isSearching: WS.Loot.isSearching(),
    modal: WS.Ui.modal(),
    paused: WS.Ui.isPaused ? WS.Ui.isPaused() : null,
    loopSpeed: WS.Loop.speed
  }));
  console.log('ШАГ2 (1с):', JSON.stringify(s2));

  await page.waitForTimeout(5000);
  const s3 = await page.evaluate(() => {
    const o = WS.ContScreen.isOpen() ? WS.ContScreen.object() : null;
    return {
      isSearching: WS.Loot.isSearching(),
      modal: WS.Ui.modal(),
      contOpen: WS.ContScreen.isOpen(),
      contName: o ? o.name : null,
      contInv: o && o.inv ? o.inv.length : null,
      looted: o ? !!o.looted : null
    };
  });
  console.log('ШАГ3 (6с):', JSON.stringify(s3));
  await browser.close();
};
run().catch(e => { console.error(e); process.exit(1); });
