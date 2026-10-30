// Что лежит во всех контейнерах мира при сиде 1917 (детерминизм лута).
import { createRequire } from 'module';
const require = createRequire('/home/z/.npm-global/lib/node_modules/');
const { chromium } = require('playwright');

const BASE = process.argv[2] || 'http://localhost:3000';
const SEED = 1917;

const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 700 } });
  await page.goto(BASE, { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(3000);
  // старт партии с сидом 1917 через API меню
  await page.evaluate((seed) => {
    const m = document.getElementById('ws-menu');
    if (m) m.classList.add('hidden');
    WS.Main.newGame('telegraph', [], seed);
    // стартовый груз профессии (как menu.onStart)
    for (const it of [{ id: 'book_survive', n: 1 }, { id: 'matches', n: 8 }, { id: 'water_flask', n: 1 }, { id: 'rusk', n: 4 }]) {
      try { WS.Inv.give(it.id, it.n); } catch (e) {}
    }
  }, SEED);
  await page.waitForTimeout(3500);

  const report = await page.evaluate(() => {
    const W = WS.World;
    const interesting = {};
    const totals = {};
    const perType = {};
    for (const o of W.objects) {
      if (!o.container) continue;
      WS.Loot.fill(o);                    // детерминированное наполнение
      const inv = o.inv || [];
      for (const it of inv) {
        totals[it.id] = (totals[it.id] || 0) + it.count;
        if (!perType[o.container]) perType[o.container] = {};
        perType[o.container][it.id] = (perType[o.container][it.id] || 0) + it.count;
      }
    }
    // ключевые для демо предметы
    const keys = ['lamp_oil', 'fat', 'torch', 'plank', 'cloth_rag', 'matches', 'flint',
      'bread', 'rusk', 'canned_fish', 'potato', 'kasha', 'flour_bag', 'semolina', 'oat_flakes',
      'firewood_bundle', 'log', 'axe', 'hatchet', 'axe_small', 'knife', 'rifle_mosin', 'rifle_round',
      'wool_coat', 'coat_fur', 'tulup_ovchinniy', 'ushanka', 'valenki', 'wool_socks', 'bedroll',
      'icicle_chunk', 'water_flask', 'sugar_loaf', 'salt_fish', 'dried_fish', 'galley_biscuits',
      'meat_raw', 'meat_cooked', 'vodka', 'tea_brick', 'wolf_pelt'];
    for (const k of keys) interesting[k] = totals[k] || 0;
    return { interesting, nContainers: W.objects.filter(o => o.container).length, seed: WS.G.seed };
  });
  console.log('SEED:', report.seed, 'containers:', report.nContainers);
  console.log('=== КЛЮЧЕВЫЕ ПРЕДМЕТЫ (весь посёлок, сид 1917) ===');
  for (const [k, v] of Object.entries(report.interesting)) console.log(`  ${k}: ${v}`);
  // полный дамп всех предметов
  const all = await page.evaluate(() => {
    const t = {};
    for (const o of WS.World.objects) { if (!o.container) continue; for (const it of (o.inv || [])) t[it.id] = (t[it.id] || 0) + it.count; }
    return t;
  });
  console.log('=== ПОЛНЫЙ ДАМП ===');
  const sorted = Object.entries(all).sort((a, b) => b[1] - a[1]);
  for (const [k, v] of sorted) console.log(`  ${k}: ${v}`);
  await browser.close();
};
run().catch(e => { console.error('ERR', e); process.exit(1); });
