// Трассировка порядка addObject при генерации: кто и когда ставит объекты
import { createRequire } from 'module';
const require = createRequire('/home/z/.npm-global/lib/node_modules/');
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:3000';
const PROFILE = '/tmp/ws-diag-profile';

const run = async () => {
  const browser = await chromium.launchPersistentContext(PROFILE, {
    viewport: { width: 1400, height: 800 }, args: ['--disable-dev-shm-usage']
  });
  const page = browser.pages()[0] || await browser.newPage();
  page.on('pageerror', e => console.log('PAGEERROR:', e.message));
  page.on('dialog', d => d.accept().catch(() => {}));
  await page.goto(BASE, { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(3000);

  // патчим addObject до старта демо
  await page.evaluate(() => {
    window.__addLog = [];
    const orig = WS.World.addObject.bind(WS.World);
    WS.World.addObject = function (o) {
      window.__addLog.push({ spr: o.sprName, x: Math.floor(o.x), y: Math.floor(o.y),
        cont: o.container || null, name: o.name || '' });
      return orig(o);
    };
    window.__rmLog = [];
    const origRm = WS.World.removeObject.bind(WS.World);
    WS.World.removeObject = function (o) {
      window.__rmLog.push({ spr: o.sprName, x: Math.floor(o.x), y: Math.floor(o.y) });
      return origRm(o);
    };
  });

  const btn = page.locator('#ws-menu button', { hasText: 'Демо-прохождение' }).first();
  await btn.click();
  await page.waitForTimeout(8000);

  const out = await page.evaluate(() => {
    const log = window.__addLog;
    const store3 = [];
    log.forEach((e, i) => {
      if (e.x >= 81 && e.x <= 91 && e.y >= 135 && e.y <= 144) store3.push({ i, ...e });
    });
    const wh27 = [];
    log.forEach((e, i) => {
      if (e.x >= 83 && e.x <= 97 && e.y >= 149 && e.y <= 158) wh27.push({ i, ...e });
    });
    return { total: log.length, store3, wh27,
      genLog: (window.console && []) || [] };
  });
  console.log('total addObject:', out.total);
  console.log('--- store_3 (порядок добавления):');
  for (const e of out.store3) console.log('   #' + e.i + ' ' + e.x + ',' + e.y + ' ' + e.spr + ' "' + e.name + '" cont=' + e.cont);
  console.log('--- warehouse_27 (порядок добавления):');
  for (const e of out.wh27) console.log('   #' + e.i + ' ' + e.x + ',' + e.y + ' ' + e.spr + ' "' + e.name + '" cont=' + e.cont);
  await browser.close();
};
run().catch(e => { console.error(e); process.exit(1); });
