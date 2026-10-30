// Пробник языка и HUD: какие язык и тексты в живой сессии.
import { createRequire } from 'module';
const require = createRequire('/home/z/.npm-global/lib/node_modules/');
const { chromium } = require('playwright');

const BASE = process.argv[2] || 'http://localhost:3000';
const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.goto(BASE, { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(3000);
  await page.locator('text="Случайный герой"').first().click();
  await page.waitForTimeout(400);
  await page.locator('text="Начать"').first().click();
  await page.waitForTimeout(4000);
  const facts = await page.evaluate(() => ({
    navLang: navigator.language,
    stored: localStorage.getItem('ws.lang'),
    engineLang: WS.I18N.getLang(),
    shipWidget: (document.querySelector('.hud-ship') || {}).textContent || null,
    clockWidget: (document.querySelector('.hud-clock') || {}).textContent || null,
    t_direct: WS.I18N.t('ui.ship.left', 'до парохода'),
    has_ru: WS.I18N.has('ui.ship.left'),
    htmlLang: document.documentElement.lang
  }));
  console.log(JSON.stringify(facts, null, 1));
  await browser.close();
};
run().catch(e => { console.error('FATAL', e); process.exit(1); });
