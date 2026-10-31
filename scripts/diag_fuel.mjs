// diag_fuel.mjs — прицельная диагностика топливного цикла: после рубки
// веток бот гибнет. Снимаем инвентарь топлива/трута и события каждую 3с.
import { createRequire } from 'module';
const require = createRequire('/home/z/.npm-global/lib/node_modules/');
const { chromium } = require('playwright');

const BASE = process.argv[2] || 'http://localhost:3140';
const PROF = process.argv[3] || 'telegraph';
const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 200)));
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text().slice(0, 200)); });
  await page.goto(BASE, { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(3000);
  await page.evaluate(p => WS.Demo.start({ prof: p, seed: 1917 }), PROF);
  await page.waitForTimeout(1200);
  await page.evaluate(() => WS.Demo.pace(1));

  const t0 = Date.now();
  let lastJ = 0;
  while (Date.now() - t0 < 150000) {
    await page.waitForTimeout(3000);
    const st = await page.evaluate(() => {
      const d = WS.Demo._state();
      const p = WS.G && WS.G.player;
      const c = id => (WS.Inv ? WS.Inv.count(id) : 0);
      return {
        day: WS.Time ? WS.Time.day() : 0,
        hour: Math.round(WS.Time.hourF() * 10) / 10,
        hp: p ? Math.round(p.hp) : 0,
        temp: p ? Math.round((p.temp || 0) * 10) / 10 : 0,
        task: d.task ? d.task.type + (d.task.label ? ':' + d.task.label : '') : '—',
        pos: p ? Math.round(p.x) + ',' + Math.round(p.y) : '',
        inside: WS.World.isInside && p ? !!WS.World.isInside(p.x, p.y) : false,
        fire: (WS.Fire && WS.Fire.near && p && WS.Fire.near(p.x, p.y, 4)) ? Math.round(WS.Fire.near(p.x, p.y, 4).d) : -1,
        chop: WS.Forage && WS.Forage.isChopping ? WS.Forage.isChopping() : false,
        // топливо и трут
        log: c('log'), fw: c('firewood_bundle'), pl: c('plank'),
        br: c('pine_branch'), bark: c('birch_bark'), grass: c('dry_grass'),
        rag: c('cloth_rag'), np: c('newspaper_stack'),
        mt: c('matches'), fl: c('flint'),
        jn: d.journal.length
      };
    });
    console.log(`д${st.day} ${st.hour}ч hp=${st.hp} ${st.temp}° [${st.task}] ${st.pos}` +
      `${st.inside ? ' дом' : ''} огонь=${st.fire >= 0 ? st.fire + 'т' : 'нет'} рубит=${st.chop ? 1 : 0} ` +
      `брев=${st.log} пол=${st.fw} дос=${st.pl} лап=${st.br} берк=${st.bark} трава=${st.grass} ` +
      `трут=${st.rag + st.bark + st.grass + st.np} спич=${st.mt}`);
    // новые строки журнала
    const newLines = await page.evaluate(n => WS.Demo._state().journal.slice(n).map(j => j.t + ' ' + j.txt.slice(0, 80)), lastJ);
    newLines.forEach(l => console.log('    Ж: ' + l));
    lastJ += newLines.length;
    if (st.hp <= 0) break;
  }
  errs.slice(0, 8).forEach(e => console.log('  ! ' + e));
  await browser.close();
};
run().catch(e => { console.error('FAIL', e.message); process.exit(2); });
