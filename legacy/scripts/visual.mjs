// Полный визуальный тест: город снаружи, интерьер изнутри, ночь, лес.
import { createRequire } from 'module';
import { mkdirSync } from 'fs';
const require = createRequire('/home/z/.npm-global/lib/node_modules/');
const { chromium } = require('playwright');

const BASE = process.argv[2] || 'http://localhost:3000';
const OUT = '/home/z/my-project/download/audit2';
mkdirSync(OUT, { recursive: true });

const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 300)); });

  await page.goto(BASE, { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(3000);
  await page.locator('text="Случайный герой"').first().click();
  await page.waitForTimeout(400);
  await page.locator('text="Начать"').first().click();
  await page.waitForTimeout(4500);

  // 1) город днём (старт)
  await page.screenshot({ path: `${OUT}/01-town-day.png` });

  // 2) камера отдалена — общий план города с крышами
  await page.evaluate(() => { WS.Cam.setZoom(0.6); });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/02-town-zoomout.png` });
  await page.evaluate(() => { WS.Cam.setZoom(1); });
  await page.waitForTimeout(600);

  // 3) вход в здание: телепорт к двери и внутрь
  const inside = await page.evaluate(() => {
    const W = WS.World;
    const b = W.buildings.find(bb => bb.w >= 5 && bb.h >= 4) || W.buildings[0];
    if (!b) return null;
    // ставим игрока в центр здания
    WS.G.player.x = b.x + b.w / 2;
    WS.G.player.y = b.y + b.h / 2;
    return { id: b.id, type: b.type, w: b.w, h: b.h, mat: b.material };
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/03-inside.png` });
  const roofState = await page.evaluate(() => ({
    inside: WS.Roofs.inside() ? WS.Roofs.inside().id : null,
    roofsVisible: WS.Roofs.visible(WS.Cam.viewBounds(2)).length
  }));
  console.log('INSIDE', JSON.stringify(inside), 'ROOF', JSON.stringify(roofState));

  // 4) выход из здания
  await page.evaluate(() => {
    const b = WS.Roofs.inside();
    if (b) { WS.G.player.x = b.x + b.w + 2; WS.G.player.y = b.y + b.h + 2; }
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/04-outside-again.png` });
  const roofState2 = await page.evaluate(() => ({
    inside: WS.Roofs.inside() ? WS.Roofs.inside().id : null,
    roofsVisible: WS.Roofs.visible(WS.Cam.viewBounds(2)).length
  }));
  console.log('OUTSIDE ROOF', JSON.stringify(roofState2));

  // 5) ночь с крышами и окнами
  await page.evaluate(() => { WS.G.time.min = 21 * 60; });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/05-night-town.png` });

  // 6) день, телепорт в лес
  await page.evaluate(() => {
    WS.G.time.min = 12 * 60;
    WS.G.player.x = 40; WS.G.player.y = 40;
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/06-forest.png` });

  // 7) метель (погода)
  const bliz = await page.evaluate(() => {
    if (WS.Weather && WS.Weather.set) { WS.Weather.set('blizzard'); return 'set'; }
    return 'no-api';
  });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/07-blizzard.png` });
  console.log('WEATHER', bliz);

  // 8) инвентарь поверх мира
  await page.evaluate(() => { if (WS.Weather && WS.Weather.set) WS.Weather.set('clear'); });
  await page.waitForTimeout(800);
  await page.keyboard.press('i');
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/08-inventory.png` });

  console.log('ERRORS', JSON.stringify(errors.slice(0, 15), null, 1));
  await browser.close();
};
run().catch(e => { console.error('FATAL', e); process.exit(1); });
