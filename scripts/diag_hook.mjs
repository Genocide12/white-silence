// diag_hook.mjs — перехват searchGroundAt/lightCampfire у живого бота:
// что реально происходит в цепочке аврал→поиск→костёр.
import { createRequire } from 'module';
const require = createRequire('/home/z/.npm-global/lib/node_modules/');
const { chromium } = require('playwright');

const BASE = process.argv[2] || 'http://localhost:3140';
const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(BASE, { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(3000);

  // перехват вызовов
  await page.evaluate(() => {
    window.__calls = [];
    const sga = WS.Forge ? null : WS.Forage.searchGroundAt;
    WS.Forage.searchGroundAt = function (tx, ty) {
      const r = sga.call(WS.Forage, tx, ty);
      window.__calls.push('search(' + tx + ',' + ty + ')→' + r);
      return r;
    };
    const lc = WS.Fire.lightCampfire;
    WS.Fire.lightCampfire = function (x, y) {
      const r = lc.call(WS.Fire, x, y);
      window.__calls.push('campfire(' + Math.round(x) + ',' + Math.round(y) + ')→' +
        JSON.stringify(r).slice(0, 80));
      return r;
    };
    const ct = WS.Forage.tryChopTree;
    WS.Forage.tryChopTree = function (o) {
      const r = ct.call(WS.Forage, o);
      window.__calls.push('chop→' + r);
      return r;
    };
  });

  await page.evaluate(() => WS.Demo.start({ prof: 'telegraph', seed: 1917 }));
  await page.waitForTimeout(1000);
  await page.evaluate(() => WS.Demo.pace(1));

  const t0 = Date.now();
  let lastJ = 0;
  while (Date.now() - t0 < 120000) {
    await page.waitForTimeout(4000);
    const st = await page.evaluate(jn => {
      const d = WS.Demo._state();
      const p = WS.G.player;
      const c = id => WS.Inv.count(id);
      const calls = window.__calls.splice(0, 12);
      const newLines = d.journal.slice(jn).map(x => x.t + ' ' + x.txt.slice(0, 60));
      const tinder = c('cloth_rag') + c('birch_bark') + c('dry_grass') + c('newspaper_stack');
      const fuel = c('log') + c('firewood_bundle') + c('plank') + c('pine_branch') + c('birch_bark') + c('dry_grass');
      return {
        day: WS.Time.day(), hour: Math.round(WS.Time.hourF() * 10) / 10,
        hp: Math.round(p.hp), temp: Math.round((p.temp || 0) * 10) / 10,
        task: d.task ? d.task.type : '—',
        tinder, fuel, matches: c('matches'),
        canBurn: fuel > 0 && tinder > 0 && c('matches') > 0,
        bark: c('birch_bark'), grass: c('dry_grass'), br: c('pine_branch'),
        rag: c('cloth_rag'), log: c('log'), fw: c('firewood_bundle'), pl: c('plank'),
        calls, newLines
      };
    }, lastJ);
    console.log(`д${st.day} ${st.hour}ч hp=${st.hp} ${st.temp}° [${st.task}] ` +
      `трут=${st.tinder} топл=${st.fuel} спич=${st.matches} canBurn=${st.canBurn ? 1 : 0} ` +
      `(берк=${st.bark} трава=${st.grass} лап=${st.br} тряп=${st.rag} брев=${st.log} вяз=${st.fw} дос=${st.pl})`);
    st.calls.forEach(c => console.log('    ⚙ ' + c));
    st.newLines.forEach(l => console.log('    Ж: ' + l));
    const jl = await page.evaluate(() => WS.Demo._state().journal.length);
    lastJ = jl;
    if (st.hp <= 0) break;
  }
  await browser.close();
};
run().catch(e => { console.error('FAIL', e.message); process.exit(2); });
