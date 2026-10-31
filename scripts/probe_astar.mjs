// probe_astar.mjs — повторяет A* бота (tilePassable из demo.js) и ищет
// путь (25,120) → izba_21. Показывает, где теряется проходимость.
import { createRequire } from 'module';
const require = createRequire('/home/z/.npm-global/lib/node_modules/');
const { chromium } = require('playwright');

const BASE = process.argv[2] || 'http://localhost:3140';
const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  await page.goto(BASE, { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(3500);
  await page.evaluate(() => { WS.Main.newGame('telegraph', ['frostproof', 'patient'], 1917); WS.Ui.unpause(); });
  await page.waitForTimeout(1200);

  const res = await page.evaluate(() => {
    const w = WS.World;
    const D = { avoid: {} };
    function tilePassable(tx, ty) {
      if (w.isTileBlocked(tx, ty)) return false;
      const objs = w.objsAt(tx, ty);
      if (objs) {
        for (let i = 0; i < objs.length; i++) {
          const o = objs[i];
          if (!o.solid) continue;
          if (o.door) { if (D.avoid[o.id]) return false; continue; }
          return false;
        }
      }
      return true;
    }
    // BFS от (25,120) — куда вообще можно дойти?
    const seen = {};
    const q = [{ x: 25, y: 120 }];
    seen['25,120'] = 1;
    let n = 0;
    while (q.length && n < 200000) {
      const c = q.shift(); n++;
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx = c.x + dx, ny = c.y + dy, k = nx + ',' + ny;
        if (seen[k]) continue;
        if (nx < 1 || ny < 1 || nx >= w.w - 1 || ny >= w.h - 1) continue;
        if (!tilePassable(nx, ny)) continue;
        seen[k] = 1;
        q.push({ x: nx, y: ny });
      }
    }
    // зона избы
    let izbaReach = 0, doorReach = false;
    for (let y = 97; y <= 103; y++) for (let x = 26; x <= 33; x++) {
      if (seen[x + ',' + y]) izbaReach++;
    }
    // двери избы: ищем все двери возле избы
    const doors = [];
    for (const o of w.objects) {
      if (o.door && Math.abs(o.x - 29) < 12 && Math.abs(o.y - 100) < 12) {
        doors.push({ x: o.x, y: o.y, open: !!o.open, reach: !!seen[(o.x | 0) + ',' + (o.y | 0)], blocked: w.isTileBlocked(o.x | 0, o.y | 0) });
      }
    }
    // достигаемость клеток рядом с дверями
    return {
      bfsCells: Object.keys(seen).length,
      izbaInteriorReach: izbaReach,
      doors: doors.slice(0, 8),
      // достижимость точки возле двери izba_21 (24,99):
      nearDoor: !!seen['24,99'] || !!seen['23,99'] || !!seen['24,98'],
      sampleReach: { '25,110': !!seen['25,110'], '24,113': !!seen['24,113'], '23,100': !!seen['23,100'], '28,105': !!seen['28,105'] }
    };
  });
  console.log(JSON.stringify(res, null, 1));
  await browser.close();
};
run().catch(e => { console.error('FAIL', e); process.exit(2); });
