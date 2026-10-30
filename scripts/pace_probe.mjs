// Пейсинг-зонд: сколько контейнеров/дней реально проходит бот за 3 минуты.
import { createRequire } from 'module';
const require = createRequire('/home/z/.npm-global/lib/node_modules/');
const { chromium } = require('playwright');

const run = async () => {
  const browser = await chromium.launchPersistentContext('/tmp/ws-pace-probe', {
    viewport: { width: 1600, height: 900 }, args: ['--disable-dev-shm-usage']
  });
  const page = browser.pages()[0] || await browser.newPage();
  page.on('dialog', d => d.accept().catch(() => {}));
  page.on('pageerror', e => console.log('PAGEERROR:', e.message));
  await page.goto('http://localhost:3000', { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(3000);
  await page.locator('#ws-menu button', { hasText: 'Демо-прохождение' }).first().click();

  const t0 = Date.now();
  let lastDay = 0;
  while (Date.now() - t0 < 180000) {
    await page.waitForTimeout(15000);
    const st = await page.evaluate(() => {
      const D = WS.Demo._state();
      const p = WS.G.player;
      const cz = WS.Crazy.state();
      const lootedCount = WS.World.objects.filter(o => o.container && o.looted).length;
      return {
        day: WS.Time.day(), fmt: WS.Time.fmt(),
        hp: +cz.hpShadow.toFixed(1), energy: Math.floor(cz.energy),
        looted: lootedCount, respawns: cz.respawns,
        task: D.task ? D.task.type : '-',
        speed: D.curSpeed, fps: WS.Loop.fps(),
        jrN: D.journal.length,
        jr: D.journal.slice(-3).map(j => j.t + ' ' + j.txt)
      };
    });
    const m = ((Date.now() - t0) / 60000).toFixed(1);
    console.log(`[${m}м] д${st.day} ${st.fmt} x${st.speed} fps:${st.fps} hp:${st.hp} en:${st.energy} обыскано:${st.looted} дело:${st.task}`);
    st.jr.forEach(j => console.log('   | ' + j));
    if (st.day !== lastDay) lastDay = st.day;
  }
  const jr = await page.evaluate(() => WS.Demo.journalText());
  console.log('\n===== ЖУРНАЛ ПОЛНОСТЬЮ =====');
  console.log(jr);
  await browser.close();
};
run().catch(e => { console.error(e); process.exit(1); });
