// Ночной пробник: день → ночь в одной сессии. Замер света + скриншоты + ответ,
// применяется ли тонировка визуально.
import { createRequire } from 'module';
import { mkdirSync } from 'fs';
const require = createRequire('/home/z/.npm-global/lib/node_modules/');
const { chromium } = require('playwright');

const BASE = process.argv[2] || 'http://localhost:3000';
const OUT = '/home/z/my-project/download/nightprobe';
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
  await page.waitForTimeout(4500);

  const dayState = await page.evaluate(() => ({
    hour: WS.Time.hourF(), light: +WS.Time.light().toFixed(3),
    min: WS.G.time.min, day: WS.G.time.day, totalMin: WS.G.time.totalMin
  }));
  await page.screenshot({ path: `${OUT}/A-day.png` });

  await page.evaluate(() => { WS.G.time.min = 22 * 60; });
  await page.waitForTimeout(3000);
  const nightState = await page.evaluate(() => ({
    hour: WS.Time.hourF(), light: +WS.Time.light().toFixed(3),
    min: WS.G.time.min, day: WS.G.time.day, totalMin: WS.G.time.totalMin,
    lightsOn: Object.keys(WS.World.lights || {}).length
  }));
  await page.screenshot({ path: `${OUT}/B-night.png` });

  // возвращаем день и ждём — кадр должен снова посветлеть (обратимость)
  await page.evaluate(() => { WS.G.time.min = 10 * 60; });
  await page.waitForTimeout(1500);
  const dayState2 = await page.evaluate(() => ({ hour: WS.Time.hourF(), light: +WS.Time.light().toFixed(3) }));

  console.log('DAY   ', JSON.stringify(dayState));
  console.log('NIGHT ', JSON.stringify(nightState));
  console.log('DAY2  ', JSON.stringify(dayState2));
  console.log('ERRORS', JSON.stringify(errors.slice(0, 10)));
  await browser.close();
};
run().catch(e => { console.error('FATAL', e); process.exit(1); });
