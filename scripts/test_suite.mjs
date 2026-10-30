// Полный тест-раннер: живая игра в headless-браузере + инжект test_inpage.js.
//   node scripts/test_suite.mjs [baseUrl]
// Выход: 0 — все PASS, 1 — есть FAIL, 2 — ошибка запуска.
import { createRequire } from 'module';
import { mkdirSync, writeFileSync } from 'fs';
const require = createRequire('/home/z/.npm-global/lib/node_modules/');
const { chromium } = require('playwright');

const BASE = process.argv[2] || 'http://localhost:3000';
const OUT = '/home/z/my-project/download/qa';
mkdirSync(OUT, { recursive: true });

const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 200)); });

  await page.goto(BASE, { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(3500);

  // старт партии: случайный герой → начать
  await page.locator('text="Случайный герой"').first().click();
  await page.waitForTimeout(400);
  await page.locator('text="Начать"').first().click();
  await page.waitForTimeout(4500);

  const started = await page.evaluate(() => !!(WS.G && WS.G.running));
  if (!started) {
    console.log('FAIL: партия не стартовала');
    await page.screenshot({ path: `${OUT}/suite-fail-start.png` });
    await browser.close();
    process.exit(2);
  }

  // инжект набора и прогон
  await page.addScriptTag({ path: '/home/z/my-project/scripts/test_inpage.js' });
  const t0 = Date.now();
  const result = await page.evaluate(() => window.__WS_RUN_TESTS__());
  const dt = ((Date.now() - t0) / 1000).toFixed(1);

  console.log('===== ПОЛНЫЙ ТЕСТ-НАБОР =====');
  console.log(`Тестов: ${result.tests} | PASS: ${result.pass} | FAIL: ${result.fail} | WARN: ${result.warn} | SKIP: ${result.skips.length} | время ${dt}с`);
  if (result.failures.length) {
    console.log('\n--- ПРОВАЛЫ ---');
    result.failures.slice(0, 40).forEach(f => console.log('FAIL | ' + f.name + ' | ' + JSON.stringify(f.info).slice(0, 300)));
    if (result.failures.length > 40) console.log('… ещё ' + (result.failures.length - 40));
  }
  if (result.warns.length) {
    console.log('\n--- ПРЕДУПРЕЖДЕНИЯ ---');
    result.warns.slice(0, 25).forEach(w => console.log('WARN | ' + w.name + ' | ' + JSON.stringify(w.info).slice(0, 250)));
  }
  if (result.skips.length) {
    console.log('\n--- ПРОПУЩЕНО ---');
    result.skips.forEach(s => console.log('SKIP | ' + s.name + ' | ' + s.why));
  }
  console.log(`\nОШИБКИ КОНСОЛИ (${errors.length}):`);
  errors.slice(0, 10).forEach(e => console.log('  ' + e));

  writeFileSync(`${OUT}/test-suite-result.json`, JSON.stringify({ ...result, consoleErrors: errors }, null, 2), 'utf8');
  await page.screenshot({ path: `${OUT}/suite-end.png` });
  await browser.close();
  process.exit(result.fail || errors.length ? 1 : 0);
};
run().catch(e => { console.error('SUITE ERROR', e); process.exit(2); });
