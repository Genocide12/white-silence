// Зонд: достижима ли изба из точки (25,127) и что там за тайлы.
import { createRequire } from 'module';
const require = createRequire('/home/z/.npm-global/lib/node_modules/');
const { chromium } = require('playwright');
const BASE = process.argv[2];

const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(BASE, { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(3500);
  const res = await page.evaluate(() => {
    WS.Main.newGame('telegraph', ['frostproof'], 1917);
    const out = {};
    // 1) где изба
    const b = WS.World.buildings.find(x => x.id === 'izba_21');
    out.izba = b ? { x: b.x, y: b.y, w: b.w, h: b.h } : null;
    // 2) тайлы вокруг (25,127)
    const tiles = [];
    for (let y = 125; y <= 129; y++) {
      const row = [];
      for (let x = 23; x <= 27; x++) {
        row.push(WS.World.isTileBlocked(x, y) ? 'X' : '.');
      }
      tiles.push(row.join(''));
    }
    out.tilesAround = tiles;
    // 3) путь из (25,127) к избе
    const spot = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    const path = WS.Demo._findPath(25.5, 127.5, spot.x, spot.y);
    out.pathFromRiver = path ? path.length : null;
    // 4) путь из точки старта к избе
    const p = WS.G.player;
    out.spawn = { x: p.x, y: p.y };
    const path2 = WS.Demo._findPath(p.x, p.y, spot.x, spot.y);
    out.pathFromSpawn = path2 ? path2.length : null;
    // 5) какие тайлы вокруг игрока в точке (25,127): тип
    const t = WS.World.tileAt ? WS.World.tileAt(25, 127) : '?';
    out.tileTypeAt = t;
    // 6) BFS достижимость вручную от (25,127)
    let reach = 0;
    const seen = {};
    const q = [[25, 127]];
    seen['25,127'] = 1;
    while (q.length && reach < 20000) {
      const [cx, cy] = q.shift();
      reach++;
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx = cx + dx, ny = cy + dy;
        const k = nx + ',' + ny;
        if (seen[k]) continue;
        if (nx < 1 || ny < 1 || nx >= WS.World.w - 1 || ny >= WS.World.h - 1) continue;
        if (WS.World.isTileBlocked(nx, ny)) continue;
        seen[k] = 1;
        q.push([nx, ny]);
      }
    }
    out.reachFromRiver = reach;
    out.izbaReachable = !!(b && seen[(b.x + 1) + ',' + (b.y + 1)]);
    return out;
  });
  console.log(JSON.stringify(res, null, 1));
  await browser.close();
};
run().catch(e => { console.error(e); process.exit(1); });
