// Зонд: умирает ли волк → подарок-объект, и находит ли его giftNear
import { createRequire } from 'module';
const require = createRequire('/home/z/.npm-global/lib/node_modules/');
const { chromium } = require('playwright');
const BASE = 'http://localhost:3000';

const run = async () => {
  const browser = await chromium.launchPersistentContext('/tmp/ws-demo-profile', {
    viewport: { width: 1600, height: 900 }, args: ['--disable-dev-shm-usage']
  });
  const page = browser.pages()[0] || await browser.newPage();
  page.on('dialog', d => d.accept().catch(() => { }));
  await page.goto(BASE, { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(3500);
  await page.locator('#ws-menu button', { hasText: 'Демо-прохождение' }).first().click();
  await page.waitForTimeout(4000);
  const r = await page.evaluate(() => {
    const out = { steps: [] };
    const p = WS.G.player;
    // ближайший волк
    let wolf = null, wd = 1e9;
    for (const e of WS.World.ents) {
      if (e && e.kind === 'wolf' && !e.dead) {
        const d = WS.M.dist(p.x, p.y, e.x, e.y);
        if (d < wd) { wd = d; wolf = e; }
      }
    }
    out.steps.push(['волк найден', wolf ? `${wolf.kind} @${wolf.x.toFixed(1)},${wolf.y.toFixed(1)} d=${wd.toFixed(1)} hp=${wolf.hp}` : 'НЕТ']);
    if (!wolf) return out;
    // убить как игрок
    const objsBefore = WS.World.objects.length;
    const who = { id: 'player', kind: 'player' };
    try {
      WS.AI.damageEnt(wolf, 99999, who);
    } catch (e) { out.steps.push(['damageEnt ERR', e.message]); }
    out.steps.push(['после удара', `wolf.dead=${!!wolf.dead} hp=${wolf.hp}`]);
    out.steps.push(['объектов', `${objsBefore} → ${WS.World.objects.length}`]);
    // есть ли труп/подарок рядом?
    const w2 = wolf;
    let found = null;
    for (let cy = Math.floor(w2.y) - 2; cy <= Math.floor(w2.y) + 2; cy++) {
      for (let cx = Math.floor(w2.x) - 2; cx <= Math.floor(w2.x) + 2; cx++) {
        const list = WS.World.objsAt(cx, cy) || [];
        for (const o of list) {
          if (o.container || o.corpse || o.sprName === 'crazy_gift') {
            found = found || [];
            found.push(`${o.sprName}@${cx},${cy} container=${o.container} looted=${!!o.looted}`);
          }
        }
      }
    }
    out.steps.push(['objsAt 5×5 вокруг трупа', found ? found.join(' | ') : 'ПУСТО']);
    // полный перебор объектов
    const corpseLike = WS.World.objects.filter(o => o.corpse || o.sprName === 'crazy_gift' || (o.name || '').indexOf('Подарок') >= 0);
    out.steps.push(['в мире подарков/трупов', String(corpseLike.length) + ' ' + corpseLike.slice(-3).map(o => `${o.sprName}@${o.x.toFixed(0)},${o.y.toFixed(0)} inv=${(o.inv || []).length}`).join(' | ')]);
    return out;
  });
  r.steps.forEach(s => console.log('•', s[0] + ':', s[1]));
  await browser.close();
};
run().catch(e => { console.error(e); process.exit(1); });
