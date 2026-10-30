// QA-харнесс «Белого Безмолвия»: полный цикл партию за партией.
// Меню → случайный герой → старт → движение → ночь → панели → сейв →
// перезагрузка → «Продолжить» → сверка состояния → FPS.
// Использование: node scripts/qa100k.mjs [URL]
import { createRequire } from 'module';
import { mkdirSync } from 'fs';
const require = createRequire('/home/z/.npm-global/lib/node_modules/');
const { chromium } = require('playwright');

const BASE = process.argv[2] || 'http://localhost:3000';
const OUT = '/home/z/my-project/download/qa100k';
mkdirSync(OUT, { recursive: true });
const results = [];
const log = (name, ok, info) => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} | ${name} | ${JSON.stringify(info)}`); };

async function startGame(page) {
  await page.goto(BASE, { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(3500);
  await page.locator('text="Случайный герой"').first().click();
  await page.waitForTimeout(400);
  const btn = page.locator('text="Начать"').first();
  const disabled = await btn.isDisabled();
  if (disabled) throw new Error('кнопка «Начать» заблокирована');
  await btn.click();
  await page.waitForTimeout(4000);
}

const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 200)); });

  await startGame(page);
  const g = () => page.evaluate(() => {
    const G = window.WS && WS.G; if (!G) return null;
    return {
      px: +G.player.x.toFixed(1), py: +G.player.y.toFixed(1), hp: Math.round(G.player.hp),
      temp: +G.player.temp.toFixed(1), day: WS.Time.day(), fmt: WS.Time.fmt(),
      running: G.running, inv: WS.Inv ? WS.Inv.count() : null,
    };
  });
  const s0 = await g();
  log('партия стартовала', !!s0 && s0.running, s0);
  await page.screenshot({ path: `${OUT}/01-start.png` });

  // Движение W
  const before = { x: s0.px, y: s0.py };
  await page.keyboard.down('w'); await page.waitForTimeout(2000); await page.keyboard.up('w');
  const s1 = await g();
  const d = Math.hypot(s1.px - before.x, s1.py - before.y);
  log('движение W', d > 2, { dist: +d.toFixed(2) });
  await page.screenshot({ path: `${OUT}/02-move.png` });

  // Ночь: проматываем время (day 1 → 22:00)
  await page.evaluate(() => { WS.G.time.min = 22 * 60; });
  await page.waitForTimeout(2500);
  const night = await page.evaluate(() => ({
    light: +(WS.Time.light()).toFixed(2),
    hour: WS.Time.hour(),
    lightsOn: Object.keys(WS.World.lights || {}).length,
  }));
  log('ночь наступает (свет < 0.3)', night.light < 0.3, night);
  await page.screenshot({ path: `${OUT}/03-night.png` });

  // Возврат дня + панели
  await page.evaluate(() => { WS.G.time.min = 10 * 60; });
  await page.waitForTimeout(1000);
  for (const [k, n] of [['i', 'инвентарь'], ['c', 'крафт'], ['m', 'карта'], ['j', 'журнал'], ['k', 'навыки']]) {
    await page.keyboard.press(k);
    await page.waitForTimeout(700);
    const vis = await page.evaluate(() => document.querySelectorAll('#ui-root .ws-panel:not(.hidden), #ui-root [class*=screen]:not(.hidden)').length);
    log(`панель ${n} (${k})`, vis > 0, { panels: vis });
    if (n === 'инвентарь' || n === 'крафт') await page.screenshot({ path: `${OUT}/04-panel-${k}.png` });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }

  // Крафт-экран: список рецептов рендерится
  await page.keyboard.press('c');
  await page.waitForTimeout(800);
  const craft = await page.evaluate(() => {
    const el = document.querySelector('#ui-root');
    return { text: el ? el.innerText.slice(0, 200) : '', items: el ? el.querySelectorAll('*').length : 0 };
  });
  log('крафт: контент есть', craft.items > 20 && craft.text.length > 30, { items: craft.items });
  await page.keyboard.press('Escape');

  // Сейв → перезагрузка → Продолжить
  const saved = await page.evaluate(() => { try { WS.Save.save(); return true; } catch (e) { return 'ERR: ' + e.message; } });
  log('сейв создаётся', saved === true, { saved });
  const preSave = await g();
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(3500);
  const cont = page.locator('text="Продолжить"').first();
  const contVisible = await cont.isVisible().catch(() => false);
  log('кнопка «Продолжить» появилась', contVisible, {});
  if (contVisible) {
    await cont.click();
    await page.waitForTimeout(4500);
    const s2 = await g();
    log('загрузка сейва: партия жива', !!s2 && s2.running, s2);
    if (s2) {
      const posOk = Math.hypot(s2.px - preSave.px, s2.py - preSave.py) < 3;
      log('позиция игрока восстановлена', posOk, { was: [preSave.px, preSave.py], now: [s2.px, s2.py] });
      const dayOk = s2.day === preSave.day;
      log('день восстановлен', dayOk, { was: preSave.day, now: s2.day });
      await page.screenshot({ path: `${OUT}/05-after-load.png` });
    }
  }

  // FPS за 10 сек реального геймплея
  const fps = await page.evaluate(() => new Promise(res => {
    let n = 0; const t0 = performance.now();
    const f = () => { n++; if (performance.now() - t0 < 10000) requestAnimationFrame(f); else res(+(n / 10).toFixed(1)); };
    requestAnimationFrame(f);
  }));
  log('FPS ≥ 30 (цель 60)', fps >= 30, { fps });

  console.log(`\nОШИБКИ КОНСОЛИ (${errors.length}):`);
  errors.slice(0, 12).forEach(e => console.log('  ' + e));
  const failed = results.filter(r => !r.ok);
  console.log(`\n==== ИТОГ: ${results.length - failed.length}/${results.length} PASS ====`);
  await browser.close();
  process.exit(failed.length || errors.length ? 1 : 0);
};
run().catch(e => { console.error('QA ERROR', e); process.exit(2); });
