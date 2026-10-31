// stuck_inspect.mjs — прицепиться к живому демо в /tmp/ws-demo-profile и
// при «Обхожу препятствие» снять диагноз: позиция, путь, цель, блокеры.
import { createRequire } from 'module';
const require = createRequire('/home/z/.npm-global/lib/node_modules/');
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:3000';
const MINUTES = parseFloat(process.argv[3] || '8');

const run = async () => {
  const browser = await chromium.launchPersistentContext('/tmp/ws-demo-profile', {
    viewport: { width: 1600, height: 900 }, args: ['--disable-dev-shm-usage']
  });
  const page = browser.pages()[0] || await browser.newPage();
  page.on('dialog', d => d.accept().catch(() => {}));
  await page.goto(BASE, { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(3500);
  // продолжить демо, если предложить
  const cont = page.locator('text="Продолжить демо"').first();
  if (await cont.isVisible().catch(() => false)) { await cont.click(); }
  else {
    const btn = page.locator('#ws-menu button', { hasText: 'Демо-прохождение' }).first();
    if (await btn.isVisible().catch(() => false)) await btn.click();
  }
  await page.waitForTimeout(1500);

  const t0 = Date.now();
  let lastDiag = 0;
  while (Date.now() - t0 < MINUTES * 60000) {
    await page.waitForTimeout(2000);
    const diag = await page.evaluate(() => {
      const W = window.WS;
      if (!W || !W.Demo || !W.Demo.active()) return { active: false };
      const D = W.Demo._state();
      const p = W.G.player;
      const out = {
        active: true,
        day: W.Time.day(), time: W.Time.fmt(),
        task: D.task && (D.task.type + ':' + (D.task.label || '')),
        pathLen: (D.path || []).length,
        stuckT: Math.round((D.stuckT || 0) * 100) / 100,
        px: Math.round(p.x * 10) / 10, py: Math.round(p.y * 10) / 10,
        keys: Object.keys(D.keysHeld || {}),
        speed: Math.round((p.speed || 0) * 100) / 100,
        moving: !!p.moving, sneaking: !!p.sneaking, sleeping: !!p.sleeping,
        hp: p.hp, temp: p.temp,
        curfew: !!(D.curfew || (D.task && /комендантск/.test(D.task.label || '')))
      };
      if ((D.path || []).length) {
        out.wp0 = D.path[0];
        out.wpLast = D.path[D.path.length - 1];
      }
      if (D.task) {
        out.tx = D.task.x; out.ty = D.task.y;
        out.tEff = D.task.effX !== undefined ? [D.task.effX, D.task.effY] : null;
        out.tT = Math.round((D.task.t || 0) * 10) / 10;
      }
      // объекты вокруг игрока (solid) — что мешает
      const near = [];
      for (const o of (W.World.objects || [])) {
        if (!o) continue;
        const d = Math.hypot(o.x - p.x, o.y - p.y);
        if (d < 2.2) near.push({
          n: (o.name || o.sprName || '?').slice(0, 18),
          spr: o.sprName, d: Math.round(d * 10) / 10,
          solid: !!o.solid, door: !!o.door, open: !!o.open, cont: !!o.container
        });
      }
      out.near = near;
      // сущности рядом
      const ents = [];
      for (const e of (W.World.ents || [])) {
        if (!e || e.dead || e.kind === 'player') continue;
        const d = Math.hypot(e.x - p.x, e.y - p.y);
        if (d < 3) ents.push({ k: e.kind, d: Math.round(d * 10) / 10 });
      }
      out.ents = ents;
      // тайл под игроком и под первой точкой пути
      const tl = (x, y) => {
        const tx = Math.floor(x), ty = Math.floor(y);
        return { tx, ty, blocked: W.World.isTileBlocked(tx, ty), t: W.World.tileAt(tx, ty), inside: W.World.isInside ? W.World.isInside(x, y) : null };
      };
      out.tileP = tl(p.x, p.y);
      if (out.wp0) out.tileWp = tl(out.wp0.x, out.wp0.y);
      out.journal = W.Demo.journal().slice(-4);
      return out;
    });
    if (diag.active && diag.stuckT > 0.3) {
      console.log('=== STUCK ' + diag.day + ' ' + diag.time + ' ===');
      console.log(JSON.stringify(diag, null, 1));
      lastDiag++;
      if (lastDiag > 6) break;
    } else if (diag.active && Date.now() - t0 > 20000 && lastDiag === 0) {
      console.log('пока жив:', diag.day, diag.time, diag.task, 'path', diag.pathLen, 'pos', diag.px, diag.py);
    }
  }
  await browser.close();
};
run().catch(e => { console.error('FATAL', e); process.exit(1); });
