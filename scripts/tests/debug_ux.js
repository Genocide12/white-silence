// Дебаг worldux: пошагово проверяю состояния hover/playing/overCanvas.
import { createRequire } from 'module';
const require = createRequire('/home/z/.npm-global/lib/node_modules/');
const { chromium } = require('playwright');
const BASE = process.argv[2];

const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('console', m => console.log('[browser]', m.text().slice(0, 150)));
  page.on('pageerror', e => console.log('[PAGEERROR]', e.message));
  await page.goto(BASE, { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(3500);

  await page.evaluate(() => {
    WS.Main.newGame('telegraph', ['frostproof'], 1917);
    WS.Ui.unpause();
  });
  await page.waitForTimeout(500);

  const setup = await page.evaluate(() => {
    const objs = WS.World.objects;
    let c = null;
    for (let i = 0; i < objs.length; i++) {
      const o = objs[i];
      if (o && o.container && !o.locked && !o.looted) { c = o; break; }
    }
    const p = WS.G.player;
    p.x = c.x + 1.0; p.y = c.y + 0.5;
    const m = WS.Input.mouse();
    m.tx = Math.floor(c.x); m.ty = Math.floor(c.y);
    m.wx = c.x; m.wy = c.y;
    m.x = 500; m.y = 300;
    return { name: c.name, container: !!c.container, objsAt: WS.World.objsAt(m.tx, m.ty).length };
  });
  console.log('SETUP:', JSON.stringify(setup));

  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(300);
    const st = await page.evaluate(() => ({
      running: WS.G.running,
      modal: WS.Ui.modal(),
      overCanvas: WS.Input.overCanvas(),
      hoverObj: !!(WS.WorldUX._hover().obj),
      tipVisible: WS.WorldUX._tipVisible(),
      tipHtml: (document.querySelector('.ws-wtt') || {}).textContent || null
    }));
    console.log('T+' + ((i + 1) * 300) + 'ms:', JSON.stringify(st));
  }

  // ЛКМ с логами
  const lmb = await page.evaluate(() => {
    console.log('LMB: hover=', !!WS.WorldUX._hover().obj, 'modal=', WS.Ui.modal());
    WS.Ev.emit('mouse:down', { button: 0, x: 500, y: 300 });
    console.log('LMB: consumed=', WS.WorldUX.consumedClick());
    return { consumed: WS.WorldUX.consumedClick() };
  });
  console.log('LMB RESULT:', JSON.stringify(lmb));
  await page.waitForTimeout(1500);
  const after = await page.evaluate(() => ({
    searching: WS.Loot.isSearching(),
    screen: !!(WS.ContScreen && WS.ContScreen.isOpen && WS.ContScreen.isOpen())
  }));
  console.log('AFTER:', JSON.stringify(after));
  await browser.close();
};
run().catch(e => { console.error(e); process.exit(1); });
