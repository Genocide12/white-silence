// Извлечение заданий для роя агентов: недостающие переводы + банк фраз
import { createRequire } from 'module';
import { mkdirSync, writeFileSync } from 'fs';
const require = createRequire('/home/z/.npm-global/lib/node_modules/');
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:3000';
const OUT = '/home/z/my-project/scripts/swarm2';
mkdirSync(OUT, { recursive: true });

const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(BASE, { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(3500);
  await page.locator('text="Случайный герой"').first().click();
  await page.waitForTimeout(400);
  await page.locator('text="Начать"').first().click();
  await page.waitForTimeout(4500);
  const res = await page.evaluate(() => {
    const ru = WS.Data.locales.ru || {}, en = WS.Data.locales.en || {};
    const missEn = {}, missRu = {};
    for (const k in ru) if (!en[k]) missEn[k] = ru[k];
    for (const k in en) if (!ru[k]) missRu[k] = en[k];
    const bank = (WS.Thoughts && WS.Thoughts._db) || {};
    const thin = {};
    for (const cat in bank) {
      const arr = bank[cat];
      if (Array.isArray(arr) && arr.length > 0 && arr.length < 10) thin[cat] = arr.slice();
    }
    return { missEn, missRu, thin, bank };
  });
  writeFileSync(`${OUT}/en-missing.json`, JSON.stringify(res.missEn, null, 1), 'utf8');
  writeFileSync(`${OUT}/ru-missing.json`, JSON.stringify(res.missRu, null, 1), 'utf8');
  writeFileSync(`${OUT}/thin-cats.json`, JSON.stringify(res.thin, null, 1), 'utf8');
  writeFileSync(`${OUT}/all-phrases.json`, JSON.stringify(res.bank, null, 1), 'utf8');
  console.log('RU→EN недостаёт:', Object.keys(res.missEn).length);
  console.log('EN→RU недостаёт:', Object.keys(res.missRu).length);
  console.log('Тонких категорий (<10 фраз):', Object.keys(res.thin).length);
  console.log('Всего категорий фраз:', Object.keys(res.bank).length,
    'фраз:', Object.values(res.bank).reduce((s, a) => s + (a ? a.length : 0), 0));
  await browser.close();
};
run().catch(e => { console.error(e); process.exit(1); });
