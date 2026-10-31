// diag_speed.mjs — почему часы летят ×500: снимает скорость петли,
// сон/обморок и состояние каждые 5 сек у ОДНОГО агента (без параллельной
// нагрузки CPU, чтобы исключить троттлинг).
import { createRequire } from 'module';
const require = createRequire('/home/z/.npm-global/lib/node_modules/');
const { chromium } = require('playwright');

const BASE = process.argv[2] || 'http://localhost:3140';
const PROF = process.argv[3] || 'telegraph';
const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(BASE, { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(3000);
  await page.evaluate(p => WS.Demo.start({ prof: p, seed: 1917 }), PROF);
  await page.waitForTimeout(1200);
  await page.evaluate(() => WS.Demo.pace(1));

  const t0 = Date.now();
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 150)));
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text().slice(0, 150)); });
  let lastH = 8;
  while (Date.now() - t0 < 150000) {
    await page.waitForTimeout(5000);
    const st = await page.evaluate((errsN) => {
      const d = WS.Demo._state();
      const p = WS.G && WS.G.player;
      return {
        realS: Math.round((Date.now() - (d.startedAt || Date.now())) / 1000),
        day: WS.Time ? WS.Time.day() : 0,
        hour: Math.round(WS.Time.hourF() * 10) / 10,
        loopSpeed: (WS.G ? WS.G.speed : null),
        timeScale: WS.Time && WS.Time.timeScale ? WS.Time.timeScale() : null,
        curSpeed: d.curSpeed,
        sleeping: p ? !!p.sleeping : null,
        faint: p ? (p._faintT || 0) : 0,
        sleepKind: p ? (p._sleepKind || null) : null,
        hp: p ? Math.round(p.hp) : 0,
        temp: p ? Math.round((p.temp || 0) * 10) / 10 : 0,
        task: d.task ? d.task.type : '—',
        x: p ? Math.round(p.x) : 0, y: p ? Math.round(p.y) : 0,
        inside: WS.World.isInside && p ? !!WS.World.isInside(p.x, p.y) : false,
        fire: (WS.Fire && WS.Fire.near && p) ? !!WS.Fire.near(p.x, p.y, 4) : false,
        modal: WS.Ui && WS.Ui.modal ? !!WS.Ui.modal() : null,
        contOpen: WS.ContScreen && WS.ContScreen.isOpen ? WS.ContScreen.isOpen() : null,
        paused: WS.G ? !!WS.G.paused : null,
        running: WS.G ? !!WS.G.running : null,
        errsN: 0
      };
    }, errs.length);
    const dtH = st.hour - lastH;
    lastH = st.hour;
    const mult = Math.round((dtH * 3600) / 5);
    console.log(`${st.realS}с: д${st.day} ${st.hour}ч (Δ${dtH.toFixed(1)}ч ≈ ×${mult}) ` +
      `скор=${st.curSpeed} loop=${st.loopSpeed} ts=${st.timeScale} сон=${st.sleeping ? 1 : 0}` +
      `${st.sleepKind ? '(' + st.sleepKind + ')' : ''} обм=${st.faint > 0 ? 1 : 0} ` +
      `hp=${st.hp} ${st.temp}° [${st.task}] модал=${st.modal ? 1 : 0} конт=${st.contOpen ? 1 : 0} пауза=${st.paused ? 1 : 0} жива=${st.running ? 1 : 0} ошиб=${st.errsN} поз=${st.x},${st.y}${st.inside ? ' дом' : ''}${st.fire ? ' огонь' : ''}`);
    if (st.hp <= 0) break;
  }
  errs.slice(0, 10).forEach(e => console.log('  ! ' + e));
  await browser.close();
};
run().catch(e => { console.error('FAIL', e.message); process.exit(2); });
