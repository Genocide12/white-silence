// Разведка мира: layout, здания, печи, кровати, контейнеры, пристань.
import { createRequire } from 'module';
const require = createRequire('/home/z/.npm-global/lib/node_modules/');
const { chromium } = require('playwright');

const BASE = process.argv[2] || 'http://localhost:3000';

const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 850 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 160)); });

  await page.goto(BASE, { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(3000);
  await page.locator('text="Случайный герой"').first().click();
  await page.waitForTimeout(300);
  await page.locator('text="Начать"').first().click();
  await page.waitForTimeout(4000);

  const info = await page.evaluate(() => {
    const W = WS.World, G = WS.G;
    const out = {};
    out.map = { w: W.w, h: W.h };
    out.spawn = W.spawnPoint;
    out.player = { x: +G.player.x.toFixed(1), y: +G.player.y.toFixed(1) };
    out.buildings = W.buildings.map(b => ({
      id: b.id, type: b.type, x: b.x, y: b.y, w: b.w, h: b.h, doors: b.door.length
    }));
    // печи/камины/кровати/контейнеры — все объекты по категориям
    const stoves = [], beds = [], containers = [], forage = [];
    for (const o of W.objects) {
      if (o.heat) stoves.push({ x: o.x, y: o.y, spr: o.sprName, cont: o.container || null });
      else if (String(o.sprName || '').indexOf('bed') === 0) beds.push({ x: o.x, y: o.y, spr: o.sprName });
      else if (o.container) containers.push({ x: o.x, y: o.y, spr: o.sprName, cont: o.container });
      else if (o.forage) forage.push({ x: o.x, y: o.y, item: o.forage.item });
    }
    out.stoves = stoves; out.beds = beds;
    out.containersCount = containers.length;
    out.containerTypes = {};
    for (const c of containers) out.containerTypes[c.cont] = (out.containerTypes[c.cont] || 0) + 1;
    out.forageCount = forage.length;
    out.pier = WS.Story ? WS.Story.pier() : null;
    out.story = WS.Story ? WS.Story.finalQuest() : null;
    out.time = WS.Time.fmt();
    out.inv = WS.Inv.snapshot();
    return out;
  });
  console.log(JSON.stringify(info, null, 1).slice(0, 12000));
  console.log('ERRORS:', errors.length, errors.slice(0, 5));
  await browser.close();
};
run().catch(e => { console.error('ERR', e); process.exit(1); });
