// Быстрая проверка бут-валидации: грузим страницу, собираем консоль 6 сек.
// Использование: node scripts/bootcheck.mjs [URL]
import { createRequire } from 'module';
const require = createRequire('/home/z/.npm-global/lib/node_modules/');
const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://localhost:3000';
const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = [], warns = [], logs = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => {
    const t = m.text();
    if (m.type() === 'error') errors.push(t.slice(0, 200));
    else if (m.type() === 'warning' && !t.includes('AudioContext')) warns.push(t.slice(0, 250));
    else if (/\[WS\]|рецепт|registered|зарегистри/i.test(t)) logs.push(t.slice(0, 150));
  });
  await page.goto(URL, { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(6000);
  console.log(`ОШИБКИ (${errors.length}):`); errors.slice(0, 10).forEach(e => console.log('  ' + e));
  console.log(`WARN (${warns.length}):`); warns.slice(0, 10).forEach(w => console.log('  ' + w));
  console.log(`ЛОГ WS (${logs.length}):`); logs.slice(0, 25).forEach(l => console.log('  ' + l));
  await browser.close();
  process.exit(errors.length || warns.length ? 1 : 0);
};
run().catch(e => { console.error('BOOTCHECK ERROR', e); process.exit(2); });
