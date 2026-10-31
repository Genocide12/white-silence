// СКРИНШОТЫ АДАПТИВНОСТИ: разные размеры экранов (меню + игра).
// Использование: node scripts/shots_responsive.mjs
import { createRequire } from 'module';
const require = createRequire('/home/z/.npm-global/lib/node_modules/');
const { chromium } = require('playwright');

const OUT = '/home/z/my-project/download/demo';
import { mkdirSync } from 'fs';
mkdirSync(OUT, { recursive: true });

const SIZES = [
  { name: 'desktop-1600', w: 1600, h: 900 },
  { name: 'laptop-1366', w: 1366, h: 768 },
  { name: 'tablet-820', w: 820, h: 1180 },
  { name: 'mobile-390', w: 390, h: 844 }
];

const run = async () => {
  const browser = await chromium.launch();
  for (const s of SIZES) {
    const page = await browser.newPage({ viewport: { width: s.w, height: s.h } });
    await page.goto('http://localhost:3000', { waitUntil: 'load' });
    await page.waitForTimeout(3800);
    await page.screenshot({ path: `${OUT}/resp-${s.name}-menu.png` });
    // старт: случайный герой → Начать
    try {
      await page.locator('#ws-menu button', { hasText: 'Случайный герой' }).first().click({ timeout: 5000 });
      await page.waitForTimeout(500);
      await page.locator('#ws-menu button', { hasText: 'Начать' }).first().click({ timeout: 5000 });
      await page.waitForTimeout(4200);
      await page.screenshot({ path: `${OUT}/resp-${s.name}-game.png` });
      // инвентарь
      await page.keyboard.press('KeyI');
      await page.waitForTimeout(700);
      await page.screenshot({ path: `${OUT}/resp-${s.name}-inv.png` });
    } catch (e) {
      console.log(s.name, 'START FAIL:', e.message.slice(0, 80));
    }
    await page.close();
    console.log(s.name, 'done');
  }
  await browser.close();
};
run();
