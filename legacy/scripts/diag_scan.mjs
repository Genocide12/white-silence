// Диагностика: что видит СКАН МИРА демо (D.world.sealed) на свежей партии.
// Отличие от diag_sealed.mjs: читаем результат scanWorld бота, а не свой BFS.
import { createRequire } from 'module';
const require = createRequire('/home/z/.npm-global/lib/node_modules/');
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:3000';
const PROFILE = '/tmp/ws-diag-profile2';

const run = async () => {
  const browser = await chromium.launchPersistentContext(PROFILE, {
    viewport: { width: 1400, height: 800 }, args: ['--disable-dev-shm-usage']
  });
  const page = browser.pages()[0] || await browser.newPage();
  page.on('pageerror', e => console.log('PAGEERROR:', e.message));
  page.on('dialog', d => d.accept().catch(() => {}));
  await page.goto(BASE, { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(3000);
  const btn = page.locator('#ws-menu button', { hasText: 'Демо-прохождение' }).first();
  await btn.click();
  await page.waitForTimeout(5000);
  const report = await page.evaluate(() => {
    const D = WS.Demo._state();
    const w = WS.World;
    // повторяем BFS бота для сверки + ищем «почему» для каждого запечатанного
    const p = WS.G.player;
    const sx = Math.floor(p.x), sy = Math.floor(p.y);
    const reach = {};
    const q = [{ x: sx, y: sy }];
    reach[sx + ',' + sy] = 1;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
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
    const why = [];
    for (const o of w.objects) {
      if (!o.container && !o.heat && !String(o.sprName || '').startsWith('bed')) continue;
      const ox = Math.floor(o.x), oy = Math.floor(o.y);
      const r = !!(reach[(ox + 1) + ',' + oy] || reach[(ox - 1) + ',' + oy] ||
        reach[ox + ',' + (oy + 1)] || reach[ox + ',' + (oy - 1)]);
      if (r) continue;
      const info = {
        what: o.heat ? 'STOVE' : (o.container ? 'CONT ' + (o.name || o.sprName) : 'BED'),
        pos: ox + ',' + oy, bldg: (WS.World.buildings.find(b =>
          ox >= b.x && ox < b.x + b.w && oy >= b.y && oy < b.y + b.h) || {}).id,
        nb: []
      };
      for (const [dx, dy] of dirs) {
        const x = ox + dx, y = oy + dy;
        if (reach[x + ',' + y]) { info.nb.push('REACH'); continue; }
        let w2 = [];
        if (w.isTileBlocked(x, y)) {
          let nm = ''; for (let k in w.T) if (w.T[k] === w.tileAt(x, y)) nm = k;
          w2.push('tile:' + nm);
        }
        const obs = w.objsAt(x, y);
        if (obs) for (const ob of obs)
          if (ob && ob.solid && !ob.door) w2.push('obj:' + (ob.sprName || ob.name));
        info.nb.push(w2.join('|') || '?');
      }
      why.push(info);
    }
    return {
      demoSealed: D.world ? D.world.sealed : null,
      base: D.base ? { id: D.base.id, bed: !!D.base.bed, stove: !!D.base.stove } : null,
      lootCount: D.world ? D.world.loot.length : 0,
      sealedList: why
    };
  });
  console.log(JSON.stringify(report, null, 1));
  await browser.close();
};
run().catch(e => { console.error(e); process.exit(1); });
