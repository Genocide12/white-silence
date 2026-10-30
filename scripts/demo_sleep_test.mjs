// Микро-тест: почему trySleep не срабатывает у кровати базы?
import { createRequire } from 'module';
const require = createRequire('/home/z/.npm-global/lib/node_modules/');
const { chromium } = require('playwright');

const BASE = process.argv[2] || 'http://localhost:3000';
const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
  page.on('pageerror', e => console.log('PAGEERROR:', e.message));
  await page.goto(BASE, { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(3000);
  const btn = page.locator('#ws-menu button', { hasText: 'Демо-прохождение' }).first();
  await btn.click();
  await page.waitForTimeout(1500);

  const r = await page.evaluate(() => {
    const D = WS.Demo._state();
    const p = WS.G.player;
    const bed = D.base && D.base.bed;
    const out = { baseId: D.base && D.base.id, bed: bed ? { x: bed.x, y: bed.y, spr: bed.sprName, name: bed.name } : null };
    // телепорт к кровати
    p.x = bed.x + 0.8; p.y = bed.y + 0.9;
    WS.Cam.follow && (WS.Cam.x = p.x, WS.Cam.y = p.y);
    // что видит bedNear?
    const w = WS.World;
    const list = w.query(p.x - 2.2, p.y - 2.2, p.x + 2.2, p.y + 2.2);
    out.queryNear = list.filter(o => !o.hp).map(o => ({ spr: o.sprName, d: +WS.M.dist(p.x, p.y, o.x, o.y).toFixed(2) }));
    // все кровати мира по objects
    out.bedsInWorld = w.objects.filter(o => String(o.sprName || '').indexOf('bed') === 0).length;
    // попробовать уснуть
    const res = WS.Needs.trySleep();
    out.trySleep = res;
    out.sleepingAfter = !!p.sleeping;
    return out;
  });
  console.log(JSON.stringify(r, null, 1));

  // проверить здоровье-тик (крашили в фоне)
  const h = await page.evaluate(() => {
    const p = WS.G.player;
    p.hp = 60;
    try {
      // дёрнуть health-тик вручную нельзя — проверим через секунды игры
      return { ok: true, hp: p.hp };
    } catch (e) { return { err: e.message }; }
  });
  await page.waitForTimeout(2500);
  const h2 = await page.evaluate(() => ({ hp: WS.G.player.hp, frost: WS.G.player.frostbite }));
  console.log('HEALTH:', JSON.stringify(h2));

  await browser.close();
};
run().catch(e => { console.error('RUN ERROR', e); process.exit(1); });
