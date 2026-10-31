// Диагностика ИЗГНАНИЯ в демо-режиме: волк вплотную → что происходит?
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

  const s0 = await page.evaluate(() => {
    return WS.Demo.start({
      fresh: true, name: 'Диагност', seed: 777,
      strategy: 'rush', speedMul: 3, human: false, record: false
    });
  });
  console.log('demo start:', s0);
  await page.waitForTimeout(2000);

  // телепорт деда на чистое место + волк вплотную
  const setup = await page.evaluate(() => {
    const p = WS.G.player;
    p.hp = 100; p.hpShadow = 100;
    // вынести деда на пустую поляну
    let spot = null;
    for (let r = 0; r < 20 && !spot; r++) {
      for (let a = 0; a < 12; a++) {
        const x = 110 + Math.cos(a) * r, y = 115 + Math.sin(a) * r;
        if (!WS.World.isTileBlocked(Math.floor(x), Math.floor(y))) { spot = { x, y }; break; }
      }
    }
    p.x = spot.x; p.y = spot.y;
    const w = { id: 'diag_wolf', kind: 'wolf', x: p.x + 0.8, y: p.y, hp: 20, maxHp: 40,
      dir: 4, speed: 0.0001, target: null, mode: 'idle', aggr: 0 };
    WS.World.addEnt(w);
    return { spot, wolfHp: w.hp };
  });
  console.log('setup:', JSON.stringify(setup));

  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(5000);
    const s = await page.evaluate((tt) => {
      const D = WS.Demo._state();
      const cz = WS.Crazy.state();
      const wolf = WS.World.ents.find(e => e.id === 'diag_wolf');
      return {
        t: tt,
        task: D.task ? D.task.type : null,
        wolfHp: wolf ? Math.round(wolf.hp) : 'dead/gone',
        wolfInWorld: !!wolf,
        banished: cz.banished,
        energy: Math.round(cz.energy),
        journal: D.journal.slice(-3).map(j => j.txt.slice(0, 90)),
        atkCd: WS.G.player._atkCd, swingT: WS.G.player._swingT,
        weapon: (WS.G.player.equip && WS.G.player.equip.hand1) ? WS.G.player.equip.hand1.id : 'none'
      };
    }, i * 5).catch(e => ({ err: e.message }));
    console.log(JSON.stringify(s));
  }
  await browser.close();
};
run().catch(e => { console.error('FATAL', e); process.exit(1); });
