// Универсальный Playwright-зонд: грузит URL, собирает все ошибки консоли,
// скриншотит, ищет игровые глобалы и пробует стартовать новую игру.
// Использование: node scripts/probe.mjs <URL> <префикс_скриншотов> [сек_ожидания]
import { createRequire } from 'module';
import { mkdirSync } from 'fs';
const require = createRequire('/home/z/.npm-global/lib/node_modules/');
const { chromium } = require('playwright');

const URL = process.argv[2];
const TAG = process.argv[3] || 'probe';
const OUT = '/home/z/my-project/download/probe';
const WAIT = parseInt(process.argv[4] || '8', 10);
mkdirSync(OUT, { recursive: true });

const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = [], warns = [], failed = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => {
    const t = m.type();
    if (t === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 300));
    else if (t === 'warning') warns.push('WARN: ' + m.text().slice(0, 200));
  });
  page.on('requestfailed', r => failed.push(r.url().split('/').pop() + ' :: ' + (r.failure()?.errorText || '')));
  page.on('response', r => { if (r.status() >= 400) failed.push(`HTTP ${r.status()}: ` + r.url().split('/').pop()); });

  console.log(`== PROBE ${URL} ==`);
  await page.goto(URL, { waitUntil: 'load', timeout: 45000 }).catch(e => console.log('GOTO FAIL:', e.message));
  await page.waitForTimeout(WAIT * 1000);
  await page.screenshot({ path: `${OUT}/${TAG}-1-load.png` });

  // Все видимые кнопки
  const buttons = await page.evaluate(() =>
    [...document.querySelectorAll('button, .btn, [class*=button], a[class*=btn]')]
      .filter(el => el.offsetParent !== null)
      .slice(0, 20).map(el => (el.textContent || '').trim().slice(0, 40)).filter(Boolean));
  console.log('BUTTONS:', JSON.stringify(buttons));

  // Игровые глобалы
  const globals = await page.evaluate(() => {
    const keys = Object.keys(window).filter(k => /^(G|WS|GAME|Game|game|World|world|State|state|S|App)$|game|state|world|engine/i.test(k));
    const out = {};
    for (const k of keys.slice(0, 15)) {
      try {
        const v = window[k];
        out[k] = typeof v === 'object' && v ? '{obj:' + Object.keys(v).slice(0, 8).join(',') + '}' : String(v).slice(0, 50);
      } catch (e) { out[k] = 'ERR'; }
    }
    return out;
  });
  console.log('GLOBALS:', JSON.stringify(globals));
  const canvases = await page.evaluate(() => [...document.querySelectorAll('canvas')].map(c => `${c.width}x${c.height}`));
  console.log('CANVASES:', JSON.stringify(canvases));
  const bodyText = (await page.evaluate(() => document.body.innerText.slice(0, 400)));
  console.log('BODY TEXT:', JSON.stringify(bodyText));

  // Попытка стартовать новую игру
  const startSel = ['Новая игра', 'Начать игру', 'Играть', 'Начать', 'New game', 'Продолжить'];
  for (const s of startSel) {
    const el = page.locator(`text=${s}`).first();
    if (await el.isVisible().catch(() => false)) {
      console.log('CLICK START:', s);
      await el.click().catch(e => console.log('CLICK FAIL:', e.message));
      await page.waitForTimeout(6000);
      await page.screenshot({ path: `${OUT}/${TAG}-2-game.png` });
      const after = await page.evaluate(() => document.body.innerText.slice(0, 300));
      console.log('AFTER START:', JSON.stringify(after));
      break;
    }
  }

  console.log(`\n==== ОШИБКИ (${errors.length}) ====`);
  errors.slice(0, 25).forEach(e => console.log('  ' + e));
  console.log(`==== ПРЕДУПРЕЖДЕНИЯ (${warns.length}) ====`);
  warns.slice(0, 10).forEach(w => console.log('  ' + w));
  console.log(`==== СЕТЕВЫЕ ПРОВАЛЫ (${failed.length}) ====`);
  failed.slice(0, 15).forEach(f => console.log('  ' + f));
  await browser.close();
};
run().catch(e => { console.error('PROBE ERROR', e); process.exit(1); });
