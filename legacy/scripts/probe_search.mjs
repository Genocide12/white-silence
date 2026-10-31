// probe_search.mjs — почему searchGroundAt не даёт боту топлива:
// зовём её 8 раз подряд в живой странице и смотрим результат/инвентарь.
import { createRequire } from 'module';
const require = createRequire('/home/z/.npm-global/lib/node_modules/');
const { chromium } = require('playwright');

const BASE = process.argv[2] || 'http://localhost:3140';
const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const toasts = [];
  page.on('console', m => { if (m.type() === 'log') toasts.push(m.text().slice(0, 90)); });
  await page.goto(BASE, { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(3000);
  await page.evaluate(() => { WS.Main.newGame('telegraph', ['frostproof', 'patient'], 1917); WS.Ui.unpause(); });
  await page.waitForTimeout(1000);

  const res = await page.evaluate(async () => {
    const p = WS.G.player;
    const w = WS.World;
    // найти ближайший уличный снежный тайл
    let tgt = null;
    outer:
    for (let r = 0; r <= 6; r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const x = Math.floor(p.x) + dx, y = Math.floor(p.y) + dy;
        if (w.isInside && w.isInside(x + 0.5, y + 0.5)) continue;
        if (w.isTileBlocked(x, y)) continue;
        const t = w.tileAt(x, y);
        if (t === w.T.SNOW || t === w.T.SNOW_DEEP || t === w.T.GRASS || t === w.T.GRASS2) {
          tgt = { x, y, t, name: Object.keys(w.T).find(k => w.T[k] === t) };
          break outer;
        }
      }
    }
    if (!tgt) return { ok: false, why: 'нет снежного тайла рядом', ptile: w.tileAt(Math.floor(p.x), Math.floor(p.y)) };
    p.x = tgt.x + 0.4; p.y = tgt.y + 0.4;   // встать на тайл
    const out = { ok: true, tgt, results: [], inv: {} };
    const c0 = {};
    for (const id of ['dry_grass', 'pine_branch', 'birch_bark', 'frozen_berries', 'angelica_root', 'mouse_nest']) {
      c0[id] = WS.Inv.count(id);
    }
    out.before = c0;
    for (let i = 0; i < 8; i++) {
      const r = WS.Forage.searchGroundAt(tgt.x, tgt.y);
      out.results.push(String(r));
      if (r) {
        // дождаться завершения поиска (5 сек реальных)
        const t0 = Date.now();
        while (WS.Forage.isSearching() && Date.now() - t0 < 8000) {
          await new Promise(res => setTimeout(res, 250));
        }
      }
    }
    for (const id of ['dry_grass', 'pine_branch', 'birch_bark', 'frozen_berries', 'angelica_root', 'mouse_nest']) {
      out.inv[id] = WS.Inv.count(id);
    }
    return out;
  });
  console.log(JSON.stringify(res, null, 1).slice(0, 1600));
  await browser.close();
};
run().catch(e => { console.error('FAIL', e.message); process.exit(2); });
