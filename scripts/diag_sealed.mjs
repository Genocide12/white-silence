// Диагностика: почему контейнеры/печи «запечатаны» (недостижимы для BFS бота)?
import { createRequire } from 'module';
const require = createRequire('/home/z/.npm-global/lib/node_modules/');
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:3000';
const PROFILE = '/tmp/ws-diag-profile';

const run = async () => {
  const browser = await chromium.launchPersistentContext(PROFILE, {
    viewport: { width: 1400, height: 800 }, args: ['--disable-dev-shm-usage']
  });
  const page = browser.pages()[0] || await browser.newPage();
  page.on('pageerror', e => console.log('PAGEERROR:', e.message));
  page.on('dialog', d => d.accept().catch(() => {}));
  await page.goto(BASE, { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(3000);
  // стартуем демо — оно создаёт игру с сидом 1917
  const btn = page.locator('#ws-menu button', { hasText: 'Демо-прохождение' }).first();
  await btn.click();
  await page.waitForTimeout(6000);

  const report = await page.evaluate(() => {
    const w = WS.World, p = WS.G.player;
    const sx = Math.floor(p.x), sy = Math.floor(p.y);
    // BFS как у бота
    const reach = {};
    const q = [{ x: sx, y: sy }];
    reach[sx + ',' + sy] = 1;
    const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
    while (q.length) {
      const c = q.shift();
      for (let d = 0; d < 4; d++) {
        const nx = c.x + dirs[d][0], ny = c.y + dirs[d][1];
        const k = nx + ',' + ny;
        if (reach[k]) continue;
        if (nx < 1 || ny < 1 || nx >= w.w - 1 || ny >= w.h - 1) continue;
        if (w.isTileBlocked(nx, ny)) continue;
        const obs = w.objsAt(nx, ny);
        let solid = false;
        if (obs) for (let i = 0; i < obs.length; i++)
          if (obs[i] && obs[i].solid && !obs[i].door) { solid = true; break; }
        if (solid) continue;
        reach[k] = 1; q.push({ x: nx, y: ny });
      }
    }
    const tileName = (x, y) => {
      const t = w.tileAt(x, y);
      const names = {};
      for (let k in w.T) names[w.T[k]] = k;
      return names[t] || t;
    };
    const objReach = o => {
      const ox = Math.floor(o.x), oy = Math.floor(o.y);
      return !!(reach[(ox+1)+','+oy] || reach[(ox-1)+','+oy] || reach[ox+','+(oy+1)] || reach[ox+','+(oy-1)]);
    };
    // а также: достижим ли САМ тайл объекта
    const tileSelf = o => !!reach[Math.floor(o.x)+','+Math.floor(o.y)];
    const out = { player: { x: sx, y: sy, tile: tileName(sx, sy) }, sealed: [], ok: 0, sealedN: 0 };
    for (const o of w.objects) {
      if (!o.container && !o.heat) continue;
      if (objReach(o)) { out.ok++; continue; }
      const ox = Math.floor(o.x), oy = Math.floor(o.y);
      const nb = {};
      for (const [dx, dy] of dirs) {
        const k = 'n' + dx + ',' + dy;
        const x = ox + dx, y = oy + dy;
        let why = [];
        if (reach[x + ',' + y]) why.push('REACH');
        else {
          if (w.isTileBlocked(x, y)) why.push('tile:' + tileName(x, y));
          const obs = w.objsAt(x, y);
          if (obs) for (const ob of obs)
            if (ob && ob.solid && !ob.door) why.push('obj:' + (ob.sprName || ob.name));
        }
        nb[k] = why.join('|') || '?';
      }
      out.sealed.push({
        what: o.heat ? 'STOVE' : (o.container ? 'CONT ' + (o.name || o.sprName) : '?'),
        pos: ox + ',' + oy, selfTile: tileName(ox, oy), selfReach: tileSelf(o),
        selfBlocked: w.isTileBlocked(ox, oy),
        selfObjs: (w.objsAt(ox, oy) || []).map(ob => (ob.sprName || ob.name) + (ob.solid ? '(S)' : '') + (ob.door ? '(D)' : '')),
        nb
      });
      out.sealedN++;
    }
    out.totalContainers = w.objects.filter(o => o.container).length;
    out.totalStoves = w.objects.filter(o => o.heat).length;
    out.reachTiles = Object.keys(reach).length;
    return out;
  });
  console.log(JSON.stringify(report, null, 1).slice(0, 6000));
  await browser.close();
};
run().catch(e => { console.error(e); process.exit(1); });
