// ctxdbg.mjs — быстрая отладка cursorTarget: где игрок, где дверь, что видит модуль.
import { createRequire } from 'module';
const require = createRequire('/home/z/.npm-global/lib/node_modules/');
const { chromium } = require('playwright');
const URL = process.argv[2] || 'http://localhost:3000/';
const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('pageerror', e => console.log('PAGEERROR:', e.message));
  await page.goto(URL, { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(3500);
  const rnd = page.locator('text="Случайный герой"').first();
  if (await rnd.isVisible().catch(() => false)) { await rnd.click(); await page.waitForTimeout(400); }
  const start = page.locator('text="Начать"').first();
  if (await start.isVisible().catch(() => false)) await start.click();
  await page.waitForTimeout(6000);

  const dbg = await page.evaluate(() => {
    const W = window.WS;
    const p = W.G.player;
    let door = null, dd = 1e9;
    for (const o of (W.World.objects || [])) {
      if (!o || !o.door || o.locked) continue;
      const d = Math.hypot(o.x - p.x, o.y - p.y);
      if (d < dd) { dd = d; door = o; }
    }
    // телепорт к двери: ближайший СВОБОДНЫЙ тайл (не занятый объектами)
    let spot = null, bd = 1e9;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const x = Math.floor(door.x) + dx, y = Math.floor(door.y) + dy;
      if (W.World.isTileBlocked(x, y)) continue;
      const objs = W.World.objsAt(x, y) || [];
      if (objs.some(o => o && o.solid)) continue;
      const d = Math.hypot(x + 0.5 - door.x, y + 0.5 - door.y);
      if (d < bd) { bd = d; spot = { x: x + 0.5, y: y + 0.5 }; };
    }
    const ok = spot ? W.Player.setPos(spot.x, spot.y) : false;
    const distNow = Math.hypot(p.x - door.x, p.y - door.y);
    // переводим мышь на дверь: WS.Input.mouse — ФУНКЦИЯ (обёртка player.js)
    const s = W.Cam.worldToScreen(door.x, door.y);
    const mObj = (typeof W.Input.mouse === 'function') ? W.Input.mouse() : W.Input.mouse;
    mObj.x = s.x; mObj.y = s.y;
    if (W.Input.updateMouseWorld) W.Input.updateMouseWorld();
    const m = mObj;
    const tgt = W.Action.cursorTarget();
    return {
      door: { x: door.x, y: door.y, id: door.id },
      spot, setPosOk: ok, px: p.x, py: p.y, distNow,
      mouse: { x: m.x, y: m.y, wx: m.wx, wy: m.wy, tx: m.tx, ty: m.ty },
      target: tgt ? { far: tgt.far, ent: tgt.ent, spr: tgt.o.sprName, dist: Math.hypot(tgt.o.x - p.x, tgt.o.y - p.y) } : null,
      camZoom: W.Cam.zoom
    };
  });
  console.log(JSON.stringify(dbg, null, 1));
  await browser.close();
};
run().catch(e => { console.error('FATAL', e); process.exit(1); });
