// toggle_probe.mjs — детальный тест тогглов экранов: key:down close + hit() reopen.
import { createRequire } from 'module';
const require = createRequire('/home/z/.npm-global/lib/node_modules/');
const { chromium } = require('playwright');
const URL = process.argv[2] || 'http://localhost:3000/';

const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('pageerror', e => console.log('PAGEERROR:', e.message));
  await page.goto(URL, { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(3500);
  const rnd = page.locator('text="Случайный герой"').first();
  if (await rnd.isVisible().catch(() => false)) { await rnd.click(); await page.waitForTimeout(400); }
  const start = page.locator('text="Начать"').first();
  if (await start.isVisible().catch(() => false)) { await start.click(); }
  await page.waitForTimeout(6000);

  const snap = () => page.evaluate(() => {
    const vis = (sel) => { const el = document.querySelector(sel); return !!(el && !el.classList.contains('hidden')); };
    const open = [];
    if (vis('.scr-inventory')) open.push('INV');
    if (vis('.scr-craft')) open.push('CRAFT');
    if (window.WS.MapScreen && window.WS.MapScreen.isOpen()) open.push('MAP');
    if (window.WS.JournalScreen && window.WS.JournalScreen.isOpen()) open.push('JOURNAL');
    if (window.WS.HealthScreen && window.WS.HealthScreen.isOpen()) open.push('HEALTH');
    if (window.WS.SkillsScreen && window.WS.SkillsScreen.isOpen()) open.push('SKILLS');
    if (window.WS.TreeScreen && window.WS.TreeScreen.isOpen()) open.push('TREE');
    if (window.WS.BuildUI && window.WS.BuildUI.isOpen) open.push('BUILD');
    if (vis('#ws-confirm:not(.hidden)')) open.push('CONFIRM');
    return { screens: open, modal: !!(window.WS.Ui && window.WS.Ui.modal && window.WS.Ui.modal()), paused: !!window.WS.paused };
  });

  // единый тест: press → состояние; press → состояние (должно вернуться)
  const testKey = async (name, code) => {
    let s0 = await snap();
    await page.keyboard.press(code);
    await page.waitForTimeout(300);
    let s1 = await snap();
    await page.keyboard.press(code);
    await page.waitForTimeout(300);
    let s2 = await snap();
    const opened = JSON.stringify(s1) !== JSON.stringify(s0);
    const closedBack = JSON.stringify(s2) === JSON.stringify(s0);
    console.log(`${name}: s0=${JSON.stringify(s0.screens)} → after1=${JSON.stringify(s1.screens)} → after2=${JSON.stringify(s2.screens)} | открылось=${opened} тоггл=${closedBack ? 'OK' : 'FAIL'}`);
    // зачистка: Esc до полного закрытия
    for (let i = 0; i < 3; i++) {
      const s = await snap();
      if (!s.screens.length && !s.paused) break;
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
    }
  };

  await testKey('M', 'KeyM');
  await testKey('J', 'KeyJ');
  await testKey('H', 'KeyH');
  await testKey('K', 'KeyK');
  await testKey('I', 'KeyI');
  await testKey('C', 'KeyC');
  await testKey('B', 'KeyB');
  await testKey('F1', 'F1');
  await browser.close();
};
run().catch(e => { console.error('FATAL', e); process.exit(1); });
