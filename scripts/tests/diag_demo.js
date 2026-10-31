// Диагноз смерти от холода: демо 100 сек, трек позиций и задач.
import { createRequire } from 'module';
const require = createRequire('/home/z/.npm-global/lib/node_modules/');
const { chromium } = require('playwright');
const BASE = process.argv[2];

const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(BASE, { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(3500);

  const btn = page.locator('#ws-menu button', { hasText: 'Демо-прохождение' }).first();
  await btn.click();
  await page.waitForTimeout(1500);
  await page.evaluate(() => WS.Demo.pace(1));

  const track = [];
  for (let i = 0; i < 48; i++) {
    await page.waitForTimeout(5000);
    const st = await page.evaluate(() => {
      const d = WS.Demo._state();
      const p = WS.G.player;
      return {
        t: WS.Time.day() + 'д ' + Math.round(WS.Time.hourF()) + 'ч',
        pos: p.x.toFixed(0) + ',' + p.y.toFixed(0),
        temp: (p.temp || 0).toFixed(1),
        hp: Math.round(p.hp),
        task: d.task ? (d.task.type + (d.task.label ? ':' + d.task.label : '')) : '-',
        pathLen: d.path.length,
        plan: d.plan.length,
        speed: d.curSpeed,
        active: d.active,
        lastLog: d.journal.length ? d.journal[d.journal.length - 1].txt.slice(0, 60) : ''
      };
    });
    track.push(st);
    console.log(JSON.stringify(st));
    if (!st.active) break;
  }
  const full = await page.evaluate(() => WS.Demo.journal().map(j => `[${j.t}] ${j.txt}`).join('\n'));
  console.log('\n===== ЖУРНАЛ =====\n' + full);
  console.log('\nОШИБКИ: ' + errors.length);
  errors.slice(0, 5).forEach(e => console.log('  ' + e));
  await browser.close();
};
run().catch(e => { console.error(e); process.exit(1); });
