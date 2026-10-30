// Лесной пробник: виден ли игрок после телепорта в лес (40,40).
// Читает позицию игрока/камеры, тайлы вокруг, снимает центр кадра крупно.
import { createRequire } from 'module';
import { mkdirSync } from 'fs';
const require = createRequire('/home/z/.npm-global/lib/node_modules/');
const { chromium } = require('playwright');

const BASE = process.argv[2] || 'http://localhost:3000';
const OUT = '/home/z/my-project/download/forestprobe';
mkdirSync(OUT, { recursive: true });

const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 200)); });

  await page.goto(BASE, { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(3000);
  await page.locator('text="Случайный герой"').first().click();
  await page.waitForTimeout(400);
  await page.locator('text="Начать"').first().click();
  await page.waitForTimeout(4000);

  // телепорт в лес — ровно как в visual.mjs
  await page.evaluate(() => { WS.G.player.x = 40; WS.G.player.y = 40; });
  await page.waitForTimeout(2000);

  const state = await page.evaluate(() => {
    const p = WS.G.player, c = WS.Cam;
    const scr = WS.M.toScreen(p.x - c.cx, p.y - c.cy);
    const center = c.canvasCenter();
    // тайлы 7x7 вокруг игрока
    const tiles = {};
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const t = WS.World.tileAt(Math.floor(p.x) + dx, Math.floor(p.y) + dy);
      const k = (t && (t.t || t.type || t.id)) || 'nil';
      tiles[k] = (tiles[k] || 0) + 1;
    }
    return {
      player: { x: p.x, y: p.y },
      cam: { x: c.cx, y: c.cy },
      screenPx: { x: Math.round(center.x + scr.x), y: Math.round(center.y + scr.y) },
      viewport: { w: innerWidth, h: innerHeight },
      tilesAround: tiles,
      playerSprite: p.sprite || p.spr || null
    };
  });
  console.log(JSON.stringify(state, null, 1));
  await page.screenshot({ path: `${OUT}/forest-full.png` });
  // кроп центра 400x260 вокруг расчётной экранной позиции игрока
  const sx = Math.max(0, state.screenPx.x - 200), sy = Math.max(0, state.screenPx.y - 130);
  await page.screenshot({ path: `${OUT}/forest-center.png`, clip: { x: sx, y: sy, width: 400, height: 260 } });
  console.log('CENTER CROP at', sx, sy, 'ERRORS', JSON.stringify(errors.slice(0, 5)));
  await browser.close();
};
run().catch(e => { console.error('FATAL', e); process.exit(1); });
