// probe_path.mjs — почему бот застревает на 25,120 при goto к базе izba_21.
import { createRequire } from 'module';
const require = createRequire('/home/z/.npm-global/lib/node_modules/');
const { chromium } = require('playwright');

const BASE = process.argv[2] || 'http://localhost:3140';
const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto(BASE, { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(3500);
  await page.evaluate(() => { WS.Main.newGame('telegraph', ['frostproof', 'patient'], 1917); WS.Ui.unpause(); });
  await page.waitForTimeout(1500);

  const info = await page.evaluate(() => {
    const out = {};
    const p = WS.G.player;
    p.x = 25; p.y = 120;
    // где база демо? демо-мир строится при старте демо... а у нас просто newGame.
    // Аналог D.base: найдём izba_21 в зданиях мира
    const w = WS.World;
    let izba = null;
    for (const b of w.buildings) if (b.id === 'izba_21') { izba = b; break; }
    out.izba = izba ? { x: izba.x, y: izba.y, w: izba.w, h: izba.h, reach: izba.reachTile || null } : null;
    // проходимость по вертикали x=25..26 от y=120 до y=97
    
    const rows = [];
    for (let y = 118; y >= 95; y--) {
      let xs = [];
      for (let x = 12; x <= 42; x++) {
        const b = w.isTileBlocked(x, y);
        let solid = false;
        try { const os = w.objsAt(x, y) || []; solid = os.some(o => o && o.solid); } catch (e) {}
        if (b || solid) xs.push(x);
      }
      if (xs.length) rows.push('y=' + y + ' блок: x=' + (xs.length > 30 ? 'много(' + xs.length + ')' : xs.join(',')));
    }
    out.blockedRows = rows;
    // объекты вокруг позиции 25,120 в радиусе 2
    const near = [];
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      try {
        const objs = w.objsAt(25 + dx, 120 + dy) || [];
        for (const o of objs) if (o && o.solid) near.push(`(${25 + dx},${120 + dy}) ${o.name || o.sprName}${o.door ? '[дверь]' : ''}`);
      } catch (e) { /* пусто */ }
    }
    out.near = near;
    return out;
  });
  console.log(JSON.stringify(info, null, 1).slice(0, 3000));
  await browser.close();
};
run().catch(e => { console.error('FAIL', e); process.exit(2); });
