// Скриншоты живого геймплея «Белого Безмолвия» для визуальной проверки.
import { createRequire } from 'module';
import { mkdirSync } from 'fs';
const require = createRequire('/home/z/.npm-global/lib/node_modules/');
const { chromium } = require('playwright');

const BASE = process.argv[2] || 'http://localhost:3000';
const OUT = '/home/z/my-project/download/audit';
mkdirSync(OUT, { recursive: true });

const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 300)); });

  await page.goto(BASE, { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${OUT}/00-menu.png` });

  await page.locator('text="Случайный герой"').first().click();
  await page.waitForTimeout(400);
  await page.locator('text="Начать"').first().click();
  await page.waitForTimeout(5000);
  await page.screenshot({ path: `${OUT}/01-start.png` });

  // двигаемся и скриним в движении
  await page.keyboard.down('w');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/02-moving.png` });
  await page.keyboard.up('w');
  await page.waitForTimeout(800);

  // поворачиваем камеру/персонажа и смотрим в другую сторону
  for (let i = 0; i < 6; i++) { await page.keyboard.press('e'); await page.waitForTimeout(200); }
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/03-turned.png` });

  // открываем инвентарь
  await page.keyboard.press('i');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/04-inventory.png` });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  // ночь
  await page.evaluate(() => { WS.G.time.min = 22 * 60; });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/05-night.png` });

  // день, интерьер/дом? попробуем телепорт в дом
  await page.evaluate(() => { WS.G.time.min = 12 * 60; });
  await page.waitForTimeout(1500);

  // статистика рендера: сколько сущностей видит камера
  const stats = await page.evaluate(() => {
    const G = WS.G;
    const cam = WS.Cam || (G.cam) || null;
    let ents = 0, spritesOk = 0, spritesMiss = 0;
    if (G && G.ents) ents = G.ents.length;
    // проверка спрайтов
    const Spr = WS.Spr;
    let missing = [];
    if (Spr && Spr.has) {
      const names = ['floor_snow', 'wall_log', 'tree_pine', 'player', 'campfire', 'door', 'window'];
      for (const n of names) { if (Spr.has(n)) spritesOk++; else { spritesMiss++; missing.push(n); } }
    }
    return {
      ents, spritesOk, spritesMiss, missing,
      camX: cam ? +cam.cx.toFixed(0) : null, camY: cam ? +cam.cy.toFixed(0) : null,
      zoom: cam ? +cam.zoom.toFixed(2) : null,
      drawCalls: (window.__drawCalls !== undefined) ? window.__drawCalls : null,
      sprCount: Spr && Spr.count ? Spr.count() : (Spr ? Object.keys(Spr).filter(k => typeof Spr[k] !== 'function').length : null),
    };
  });
  console.log('STATS', JSON.stringify(stats, null, 1));

  // телепорт к дому если есть
  const house = await page.evaluate(() => {
    const G = WS.G;
    const b = (G.ents || []).find(e => e.kind === 'house' || e.type === 'house' || (e.def && String(e.def).includes('house')));
    if (b) { G.player.x = b.x + 2; G.player.y = b.y + 2; return { x: b.x, y: b.y }; }
    return null;
  });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/06-house.png` });
  console.log('HOUSE', JSON.stringify(house));

  console.log('ERRORS', JSON.stringify(errors.slice(0, 20), null, 1));
  await browser.close();
};
run().catch(e => { console.error('FATAL', e); process.exit(1); });
