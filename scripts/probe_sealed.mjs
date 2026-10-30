// Диагностика деталей: карта тайлов вокруг запечатанных объектов + здания
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
  const btn = page.locator('#ws-menu button', { hasText: 'Демо-прохождение' }).first();
  await btn.click();
  await page.waitForTimeout(6000);

  const out = await page.evaluate(() => {
    const w = WS.World;
    const spots = [[83,137],[84,138],[86,151],[87,152],[146,151],[145,152],[208,180]];
    const res = [];
    const tileName = (x, y) => {
      const t = w.tileAt(x, y);
      const names = {};
      for (let k in w.T) names[w.T[k]] = k;
      return names[t] || t;
    };
    for (const [cx, cy] of spots) {
      const area = [];
      for (let y = cy - 5; y <= cy + 5; y++) {
        const row = [];
        for (let x = cx - 7; x <= cx + 7; x++) {
          let ch = '.';
          const t = tileName(x, y);
          if (t === 'WALL_WOOD' || t === 'WALL_BRICK' || t === 'WALL_STONE' || t === 'WALL_LOG') ch = '#';
          else if (t === 'WINDOW') ch = 'W';
          else if (t === 'DOORWAY' || t === 'DOOR') ch = 'D';
          else if (t === 'WATER') ch = '~';
          else if (t === 'ICE') ch = '=';
          else if (t === 'SHORE') ch = 's';
          else if (t === 'FLOOR_WOOD' || t === 'FLOOR_TILE' || t === 'FLOOR_CONCRETE' || t === 'FLOOR_DIRT') ch = ',';
          const obs = w.objsAt(x, y);
          if (obs && obs.length) {
            const solid = obs.some(o => o && o.solid && !o.door);
            const door = obs.some(o => o && o.door);
            const cont = obs.some(o => o && o.container);
            if (door) ch = 'd';
            else if (solid) ch = cont ? 'C' : 'o';
            else if (obs.length) ch = cont ? 'c' : '.';
          }
          if (x === cx && y === cy) ch = '@';
          row.push(ch);
        }
        area.push(row.join(''));
      }
      const b = w.buildings.find(bb => cx >= bb.x && cx < bb.x + bb.w && cy >= bb.y && cy < bb.y + bb.h);
      let binfo = null;
      if (b) {
        binfo = {
          id: b.id, type: b.type, x: b.x, y: b.y, w: b.w, h: b.h,
          doors: b.door.map(d => ({ x: d.x, y: d.y })),
          rooms: b.rooms.map(r => ({ role: r.role, x: r.x, y: r.y, w: r.w, h: r.h }))
        };
      }
      res.push({ at: cx + ',' + cy, building: binfo, area });
    }
    return res;
  });
  for (const r of out) {
    console.log('=== ' + r.at + ' ' + (r.building ? r.building.id + ' (' + r.building.type + ') doors=' + JSON.stringify(r.building.doors) + ' rooms=' + JSON.stringify(r.building.rooms) : 'нет здания'));
    for (const row of r.area) console.log('   ' + row);
  }
  await browser.close();
};
run().catch(e => { console.error(e); process.exit(1); });
