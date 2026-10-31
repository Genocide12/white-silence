// Глубокая диагностика: почему изгнание не срабатывает в реальном рое.
// Воспроизводим: демо classic ×2, скорость как у роя, агрессивный волк.
import { createRequire } from 'module';
const require = createRequire('/home/z/.npm-global/lib/node_modules/');
const { chromium } = require('playwright');

const run = async () => {
  const browser = await chromium.launch({ args: ['--disable-dev-shm-usage'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
  page.on('dialog', d => d.accept().catch(() => {}));
  page.on('pageerror', e => console.log('PAGEERROR:', e.message));
  await page.goto('http://localhost:3000', { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(3000);

  await page.evaluate(() => {
    return WS.Demo.start({ fresh: true, name: 'Диагност3', seed: 555,
      strategy: 'classic', speedMul: 2, human: false, record: false });
  });
  await page.waitForTimeout(2000);

  // скорость как у роя
  await page.evaluate(() => WS.Demo.setPace(8));

  // инструментируем meleeAttack и applyDamage
  const hooked = await page.evaluate(() => {
    window.__hits = 0; window.__dmgs = []; window.__scans = 0; window.__atkCalls = 0;
    const origAtk = WS.Action.meleeAttack;
    WS.Action.meleeAttack = function () {
      window.__atkCalls++;
      const r = origAtk.apply(this, arguments);
      if (r > 0) window.__hits++;
      return r;
    };
    const origScan = WS.Action.sectorScan;
    WS.Action.sectorScan = function (p, r) {
      const res = origScan.apply(this, arguments);
      window.__scans++;
      window.__lastScan = { r: r, n: res.length, kinds: res.map(e => e.kind) };
      return res;
    };
    return true;
  });
  console.log('hooked:', hooked);

  const setup = await page.evaluate(() => {
    const p = WS.G.player;
    p.hp = 100; p.hpShadow = 100;
    // волк в режиме охоты на деда — как ночная осада
    const w = { id: 'diag_w3', kind: 'wolf', x: p.x + 2.0, y: p.y, hp: 40, maxHp: 40,
      dir: 4, speed: 2.0, target: p, mode: 'chase', aggr: 100, fear: 0 };
    WS.World.addEnt(w);
    return { px: p.x, py: p.y, weapon: (p.equip && p.equip.hand1) ? p.equip.hand1.id : 'none',
      speed: WS.Loop.speed || WS.Loop.getSpeed ? (WS.Loop.getSpeed ? WS.Loop.getSpeed() : '?') : '?' };
  });
  console.log('setup:', JSON.stringify(setup));

  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(5000);
    const s = await page.evaluate((tt) => {
      const D = WS.Demo._state();
      const cz = WS.Crazy.state();
      const w = WS.World.ents.find(e => e.id === 'diag_w3');
      const p = WS.G.player;
      return {
        t: tt, task: D.task ? D.task.type : null,
        atkCalls: window.__atkCalls, hits: window.__hits, scans: window.__scans,
        lastScan: window.__lastScan,
        wolf: w ? { hp: Math.round(w.hp), d: Math.round(Math.hypot(w.x - p.x, w.y - p.y) * 10) / 10, mode: w.mode } : 'gone',
        hp: Math.round(p.hp), banished: cz.banished,
        loopSpeed: WS.Loop.getSpeed ? WS.Loop.getSpeed() : '?'
      };
    }, (i + 1) * 5).catch(e => ({ err: e.message }));
    console.log(JSON.stringify(s));
  }
  await browser.close();
};
run().catch(e => { console.error('FATAL', e); process.exit(1); });
