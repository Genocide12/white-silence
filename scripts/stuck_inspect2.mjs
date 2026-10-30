// Диагностика зависания демо: грузит демо-профиль, ждёт стагнации времени,
// вскрывает состояние (модалки, задачи, скорость, объект под курсором).
import { createRequire } from 'module';
const require = createRequire('/home/z/.npm-global/lib/node_modules/');
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:3000';

const run = async () => {
  const browser = await chromium.launchPersistentContext('/tmp/ws-demo-profile', {
    viewport: { width: 1600, height: 900 }, args: ['--disable-dev-shm-usage']
  });
  const page = browser.pages()[0] || await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('dialog', d => d.accept().catch(() => { }));
  await page.goto(BASE, { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(3500);
  // продолжить демо кнопкой
  const btn = page.locator('#ws-menu button', { hasText: 'Демо-прохождение' }).first();
  await btn.click();
  await page.waitForTimeout(2500);
  const started = await page.evaluate(() => !!(WS.Demo && WS.Demo.active()));
  console.log('ДЕМО:', started);

  let prevMin = -1, stagnant = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 5 * 60000) {
    await page.waitForTimeout(10000);
    const st = await page.evaluate(() => {
      const G = WS.G; if (!G) return null;
      const D = WS.Demo._state();
      const p = G.player;
      let modalName = null;
      try {
        const stack = WS.Ui && WS.Ui._stack;
        modalName = stack ? stack.join(',') : (WS.Ui.modal() ? 'unknown' : null);
      } catch (e) { modalName = 'ERR'; }
      const screens = [];
      document.querySelectorAll('#ui-root .ws-modal, #ui-root .ws-screen:not(.hidden)').forEach(el => {
        screens.push(el.id || el.className.split(' ')[0]);
      });
      return {
        min: WS.Time.totalMin(), day: WS.Time.day(), fmt: WS.Time.fmt(),
        speed: WS.Loop.speed, paused: WS.Loop.paused, modal: WS.Ui.modal(),
        modalName, screens: screens.slice(0, 6),
        task: D.task ? D.task.type + ':' + (D.task.label || '') : '-',
        hp: Math.round(p.hp), sleeping: !!p.sleeping, dead: !!G.dead,
        wolves: WS.World.ents.filter(e => e && e.kind === 'wolf' && !e.dead).length,
        px: +p.x.toFixed(1), py: +p.y.toFixed(1)
      };
    });
    if (!st) continue;
    console.log(`[${((Date.now() - t0) / 60000).toFixed(1)}м] д${st.day} ${st.fmt} spd:${st.speed} modal:${st.modal}(${st.modalName}) screens:[${st.screens}] task:${st.task} hp:${st.hp} sleep:${st.sleeping} wolves:${st.wolves} @${st.px},${st.py}`);
    if (st.min === prevMin) stagnant++; else stagnant = 0;
    prevMin = st.min;
    if (stagnant >= 3) {
      console.log('=== СТАГНАЦИЯ 30с — вскрываем ===');
      const deep = await page.evaluate(() => {
        const D = WS.Demo._state();
        const p = WS.G.player;
        return {
          journal: D.journal.slice(-8).map(j => j.t + ' ' + j.txt),
          keys: Object.keys(WS.Ui).filter(k => /stack|open|modal|close/i.test(k)),
          uiStack: WS.Ui._stack || null,
          topScreen: WS.Ui.top ? (WS.Ui.top() || null) : null,
          inv: p.inv.length,
          atkCd: p._atkCd, swing: p._swingT
        };
      });
      console.log(JSON.stringify(deep, null, 1).slice(0, 1500));
      await page.screenshot({ path: '/tmp/stuck-state.png' });
      break;
    }
  }
  console.log('ERRS:', errs.slice(0, 5));
  await browser.close();
};
run().catch(e => { console.error(e); process.exit(1); });
