// Детальная карта зоны вокруг «запечатанных» объектов: тайлы + объекты + двери здания.
import { createRequire } from 'module';
const require = createRequire('/home/z/.npm-global/lib/node_modules/');
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:3000';

const run = async () => {
  const browser = await chromium.launchPersistentContext('/tmp/ws-diag2-profile', {
    viewport: { width: 1400, height: 800 }, args: ['--disable-dev-shm-usage']
  });
  const page = browser.pages()[0] || await browser.newPage();
  page.on('dialog', d => d.accept().catch(() => {}));
  await page.goto(BASE, { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(3000);
  await page.locator('#ws-menu button', { hasText: 'Демо-прохождение' }).first().click();
  await page.waitForTimeout(6000);

  const targets = process.argv.slice(3); // "29,115" "111,151" ...
  const out = await page.evaluate((targets) => {
    const w = WS.World;
    const names = {};
    for (let k in w.T) names[w.T[k]] = k;
    const res = [];
    for (const t of targets) {
      const [tx, ty] = t.split(',').map(Number);
      const b = w.buildings.find(b => tx >= b.x && tx < b.x + b.w && ty >= b.y && ty < b.y + b.h);
      const R = 10;
      const map = [];
      for (let y = Math.max(0, ty - R); y <= Math.min(w.h - 1, ty + R); y++) {
        let row = '';
        for (let x = Math.max(0, tx - R); x <= Math.min(w.w - 1, tx + R); x++) {
          const tn = names[w.tileAt(x, y)] || '?';
          let ch = '.';
          if (tn.startsWith('WALL')) ch = '#';
          else if (tn === 'WINDOW') ch = 'W';
          else if (tn === 'DOOR' || tn === 'DOORWAY') ch = 'D';
          else if (tn === 'WATER') ch = '~';
          else if (tn === 'FLOOR') ch = ',';
          else if (tn === 'VOID') ch = ' ';
          const obs = w.objsAt(x, y);
          if (obs) for (const o of obs) {
            if (o.door) ch = 'd';
            else if (o.container) ch = 'C';
            else if (o.heat) ch = 'H';
            else if (o.solid) ch = 'o';
          }
          row += ch;
        }
        map.push(row);
      }
      res.push({
        target: t, building: b ? { id: b.id, type: b.type, x: b.x, y: b.y, w: b.w, h: b.h,
          doors: b.door, rooms: b.rooms && b.rooms.length } : null,
        map: map.join('\n')
      });
    }
    return res;
  }, targets);
  for (const r of out) {
    console.log('===== ' + r.target + ' building=' + (r.building ? r.building.id + ' (' + r.building.type + ') doors=' + JSON.stringify(r.building.doors) : 'NONE'));
    console.log(r.map);
  }
  await browser.close();
};
run().catch(e => { console.error(e); process.exit(1); });
