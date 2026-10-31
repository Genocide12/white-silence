// Быстрый smoke: загрузка игры, старт демо-кнопкой, новые модули,
// сворачивание панели, отсутствие ошибок консоли.
import { createRequire } from 'module';
const require = createRequire('/home/z/.npm-global/lib/node_modules/');
const { chromium } = require('playwright');

const BASE = process.argv[2] || 'http://localhost:3120';
const errors = [];

const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => {
    if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 200));
  });

  await page.goto(BASE, { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(4000);

  // 1) модули зарегистрированы
  const mods = await page.evaluate(() => ({
    voice: !!WS.Voice,
    imps: !!WS.Imps,
    worldux: !!WS.WorldUX,
    demo: !!WS.Demo,
    options: !!WS.Options
  }));
  console.log('МОДУЛИ:', JSON.stringify(mods));

  // 2) банк фраз озвучки
  const vs = await page.evaluate(() => WS.Voice ? WS.Voice.status() : null);
  console.log('VOICE:', JSON.stringify(vs));

  // 3) локализация: имена предметов, раньше терявшиеся
  const l10n = await page.evaluate(() => {
    const probe = ['needle_sewing', 'trap_wolf', 'samovar_tula', 'old_newspaper'];
    const out = {};
    for (const id of probe) out[id] = WS.Inv ? WS.Inv.nameOf(id) : '?';
    return out;
  });
  console.log('L10N:', JSON.stringify(l10n));

  // 4) старт демо кнопкой из меню (как пользователь)
  const btn = page.locator('#ws-menu button', { hasText: 'Демо-прохождение' }).first();
  await btn.click();
  await page.waitForTimeout(2500);
  const demoOn = await page.evaluate(() => WS.Demo.active());
  console.log('ДЕМО ЗАПУЩЕНО:', demoOn);

  // 5) панель демо: сворачивание (toggle)
  const collapsed = await page.evaluate(() => {
    const root = document.getElementById('ws-demo');
    if (!root) return 'нет панели';
    const mini = root.querySelector('.d-mini');
    if (!mini) return 'нет кнопки';
    mini.click();
    const col1 = root.classList.contains('collapsed');
    mini.click();
    const col2 = root.classList.contains('collapsed');
    return `toggle: ${col1} -> ${col2}`;
  });
  console.log('ПАНЕЛЬ СВОРАЧИВАНИЕ:', collapsed);

  // 6) счётчик мультяшек в API
  const imps = await page.evaluate(() => ({ count: WS.Imps.count(), expelled: WS.Imps.expelled() }));
  console.log('МУЛЬТЯШКИ:', JSON.stringify(imps));

  // 7) 25 секунд жизни демо: журнал, скриншот
  await page.waitForTimeout(25000);
  const demo2 = await page.evaluate(() => ({
    active: WS.Demo.active(),
    day: WS.Time ? WS.Time.day() : 0,
    hour: WS.Time ? Math.round(WS.Time.hourF()) : 0,
    journal: WS.Demo.journal().slice(0, 6).map(j => j.txt),
    imps: WS.Imps.expelled()
  }));
  console.log('ДЕМО ЧЕРЕЗ 25с:', JSON.stringify(demo2, null, 1));
  await page.screenshot({ path: '/tmp/smoke-demo.png' });

  await page.evaluate(() => WS.Demo.stop('smoke'));
  await browser.close();

  console.log('ОШИБКИ (' + errors.length + '):');
  errors.slice(0, 15).forEach(e => console.log('  ' + e));
  process.exit(errors.length ? 1 : 0);
};

run().catch(e => { console.error('FAIL', e); process.exit(2); });
