// Глубокий зонд игрового цикла «Белого Безмолвия»: меню → Начать → игра.
// Использование: node scripts/probe2.mjs <URL> <тег> 
import { createRequire } from 'module';
import { mkdirSync } from 'fs';
const require = createRequire('/home/z/.npm-global/lib/node_modules/');
const { chromium } = require('playwright');

const URL = process.argv[2];
const TAG = process.argv[3] || 'p2';
const OUT = '/home/z/my-project/download/probe';
mkdirSync(OUT, { recursive: true });

const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = [], warns = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message + (e.stack ? ' | ' + String(e.stack).split('\n')[1] : '')));
  page.on('console', m => {
    if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 250));
    if (m.type() === 'warning' && !m.text().includes('AudioContext')) warns.push('WARN: ' + m.text().slice(0, 180));
  });

  console.log(`== PROBE2 ${URL} ==`);
  await page.goto(URL, { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${OUT}/${TAG}-1-menu.png` });

  // Диагностика WS до старта
  const pre = await page.evaluate(() => {
    const W = window.WS; if (!W) return { error: 'нет WS' };
    return { booted: !!W.booted, dead: !!W.dead, ver: W.VERSION, hasG: !!W.G };
  });
  console.log('WS до старта:', JSON.stringify(pre));

  // Клик «Начать» (точное совпадение)
  const btn = page.locator('text="Начать"').first();
  if (await btn.isVisible().catch(() => false)) {
    console.log('КЛИК: Начать');
    await btn.click();
  } else {
    console.log('КНОПКА «Начать» НЕ НАЙДЕНА');
  }
  await page.waitForTimeout(9000);
  await page.screenshot({ path: `${OUT}/${TAG}-2-after-start.png` });

  // Полная диагностика состояния
  const ws = await page.evaluate(() => {
    const W = window.WS; if (!W) return { error: 'нет WS' };
    const G = W.G;
    const pick = (o, ks) => { const r = {}; ks.forEach(k => { if (o && o[k] !== undefined) r[k] = typeof o[k] === 'object' ? '{...}' : o[k]; }); return r; };
    let player = null;
    if (G) { for (const k of ['player', 'p', 'hero', 'pc']) if (G[k]) { player = { ref: k, ...pick(G[k], ['x', 'y', 'hp', 'dir', 'moving', 'temp', 'warmth']) }; break; } }
    return {
      booted: !!W.booted, dead: !!W.dead,
      hasG: !!G,
      gKeys: G ? Object.keys(G).slice(0, 30) : null,
      player,
      mode: G ? (G.mode ?? G.screen ?? G.phase ?? G.state) : null,
      time: W.Time ? { day: W.Time.day && W.Time.day(), hourF: +(W.Time.hourF && W.Time.hourF()).toFixed(2), fmt: W.Time.fmt && W.Time.fmt() } : null,
      loop: W.Loop ? pick(W.Loop, ['running', 'fps', 'speed', 'raf', 'acc']) : null,
      cam: W.Cam ? pick(W.Cam, ['cx', 'cy', 'zoom']) : null,
      world: W.World ? pick(W.World, ['w', 'h']) : null,
      uiRoot: (document.getElementById('ui-root') || {}).childElementCount,
      bodySnippet: document.body.innerText.replace(/\s+/g, ' ').slice(0, 250),
    };
  });
  console.log('WS ПОСЛЕ СТАРТА:', JSON.stringify(ws, null, 1));

  // Движение W 2.5 сек
  const posBefore = ws.player ? { x: ws.player.x, y: ws.player.y } : null;
  if (ws.player) {
    await page.keyboard.down('w');
    await page.waitForTimeout(2500);
    await page.keyboard.up('w');
    const posAfter = await page.evaluate(() => {
      const G = window.WS.G; if (!G) return null;
      for (const k of ['player', 'p', 'hero', 'pc']) if (G[k]) return { x: G[k].x, y: G[k].y };
    });
    const d = posAfter && posBefore ? Math.hypot(posAfter.x - posBefore.x, posAfter.y - posBefore.y) : -1;
    console.log(`ДВИЖЕНИЕ W: ${posBefore && posAfter ? JSON.stringify(posBefore) + ' → ' + JSON.stringify(posAfter) + ' dist=' + d.toFixed(2) : 'нет позиции'}`);
    await page.screenshot({ path: `${OUT}/${TAG}-3-move.png` });
  }

  // Панели: инвентарь (I), крафт (C), здоровье (H), справка (F1)
  for (const [key, name] of [['i', 'inventory'], ['c', 'craft'], ['h', 'health'], ['F1', 'help']]) {
    await page.keyboard.press(key);
    await page.waitForTimeout(900);
    const ui = await page.evaluate(() => ({
      panels: document.querySelectorAll('#ui-root > *').length,
      text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 120),
    }));
    console.log(`ПАНЕЛЬ ${name} (${key}):`, JSON.stringify(ui));
    await page.screenshot({ path: `${OUT}/${TAG}-4-panel-${name}.png` });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }

  // Сейв
  await page.waitForTimeout(1000);
  const save = await page.evaluate(() => {
    const keys = Object.keys(localStorage);
    let saved = null;
    try { if (window.WS && WS.Save) { WS.Save.save(); saved = 'ok'; } } catch (e) { saved = 'ERR: ' + e.message; }
    return { localStorageKeys: keys, saveCall: saved, afterSave: Object.keys(localStorage) };
  });
  console.log('СЕЙВ:', JSON.stringify(save));

  console.log(`\n==== ОШИБКИ (${errors.length}) ====`);
  errors.slice(0, 30).forEach(e => console.log('  ' + e));
  console.log(`==== WARN (${warns.length}) ====`);
  warns.slice(0, 10).forEach(w => console.log('  ' + w));
  await browser.close();
};
run().catch(e => { console.error('PROBE2 ERROR', e); process.exit(1); });
