// userfix_diag.mjs — диагностика по жалобам игрока (этап UI+враги+тогглы).
// Проверяет: 1) спавн врагов; 2) тогглы экранов (M/J/H/K/I/C/B/F1);
// 3) перекрытие панели демо и #ws-hud; 4) клик по предметам (ЛКМ/ПКМ).
// Использование: node scripts/userfix_diag.mjs <URL>
import { createRequire } from 'module';
const require = createRequire('/home/z/.npm-global/lib/node_modules/');
const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://localhost:3000/';

const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 200)); });

  await page.goto(URL, { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(3500);

  // старт: Случайный герой → Начать
  const rnd = page.locator('text="Случайный герой"').first();
  if (await rnd.isVisible().catch(() => false)) { await rnd.click(); await page.waitForTimeout(400); }
  const start = page.locator('text="Начать"').first();
  if (await start.isVisible().catch(() => false)) { await start.click(); }
  await page.waitForTimeout(6000);

  // --- 1) враги ---
  const enemies = await page.evaluate(() => {
    const W = window.WS; const counts = {};
    if (!W || !W.World || !W.World.ents) return { error: 'no ents' };
    for (const e of W.World.ents) { if (e && !e.dead) counts[e.kind] = (counts[e.kind] || 0) + 1; }
    const p = W.G && W.G.player;
    return { counts, px: p && p.x, py: p && p.y, day: W.Time && W.Time.day() };
  });
  console.log('== ВРАГИ ==', JSON.stringify(enemies));

  // расстояние до ближайшего волка/бандита
  const wolfDist = await page.evaluate(() => {
    const W = window.WS; const p = W.G.player;
    let best = 1e9, bk = null;
    for (const e of (W.World.ents || [])) {
      if (!e || e.dead) continue;
      if (['wolf', 'bear', 'bandit'].indexOf(e.kind) < 0) continue;
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d < best) { best = d; bk = e.kind; }
    }
    return { kind: bk, dist: Math.round(best * 10) / 10 };
  });
  console.log('== БЛИЖАЙШИЙ ХИЩНИК ==', JSON.stringify(wolfDist));

  // --- 2) тогглы экранов ---
  const press = async (code) => {
    await page.keyboard.press(code);
    await page.waitForTimeout(350);
  };
  const screenState = () => page.evaluate(() => {
    const W = window.WS;
    const st = {};
    const vis = (sel) => { const el = document.querySelector(sel); return !!(el && !el.classList.contains('hidden')); };
    st.inv = vis('#ws-inv') || !!(W.Ui && W.Ui.modal && W.Ui.modal());
    st.map = vis('.ws-map') || !!(W.MapScreen && W.MapScreen.isOpen && W.MapScreen.isOpen());
    st.modal = !!(W.Ui && W.Ui.modal && W.Ui.modal());
    return st;
  });
  const results = [];
  for (const [key, code] of [['M', 'KeyM'], ['J', 'KeyJ'], ['H', 'KeyH'], ['K', 'KeyK'], ['I', 'KeyI'], ['C', 'KeyC'], ['B', 'KeyB']]) {
    const before = await screenState();
    await press(code);          // открыть
    const opened = await screenState();
    await press(code);          // повторно — должно ЗАКРЫТЬ
    const after = await screenState();
    const wasOpened = JSON.stringify(opened) !== JSON.stringify(before);
    const wasClosed = JSON.stringify(after) === JSON.stringify(before);
    results.push({ key, wasOpened, toggleWorks: wasClosed && wasOpened, after: JSON.stringify(after) });
    // страховка: закрыть всё, если осталось открытым
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
  }
  console.log('== ТОГГЛЫ ==');
  for (const r of results) console.log('  ' + r.key + ': открылось=' + r.wasOpened + ' · повторное нажатие закрыло=' + r.toggleWorks + (r.toggleWorks ? '' : '  ← ПРОБЛЕМА ' + r.after));

  // --- 3) перекрытие демо-панели ---
  const overlap = await page.evaluate(() => {
    const demo = document.querySelector('#ws-demo');
    const hud = document.querySelector('#ws-hud');
    if (!demo || !hud) return { demo: !!demo, hud: !!hud };
    const a = demo.getBoundingClientRect(), b = hud.getBoundingClientRect();
    const ox = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
    const oy = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    return { demo: true, hud: true, overlapPx: Math.round(ox * oy), demoVisible: !demo.classList.contains('hidden') };
  });
  console.log('== ДЕМО-ПАНЕЛЬ vs #ws-hud ==', JSON.stringify(overlap));

  // --- 4) объекты под курсором: есть ли интерактив рядом с игроком ---
  const nearInteract = await page.evaluate(() => {
    const W = window.WS; const p = W.G.player;
    const list = [];
    for (const o of (W.World.objects || [])) {
      if (!o) continue;
      const d = Math.hypot(o.x - p.x, o.y - p.y);
      if (d < 4 && (o.container || o.door || o.drop || o.sprName)) {
        list.push({ n: (o.name || o.sprName || '').slice(0, 24), d: Math.round(d * 10) / 10, c: !!o.container, dr: !!o.door, spr: o.sprName });
      }
    }
    return list.slice(0, 12);
  });
  console.log('== ИНТЕРАКТИВ РЯДОМ ==', JSON.stringify(nearInteract, null, 1));

  console.log('== ОШИБКИ ==', errors.length ? errors.slice(0, 8) : 'нет');
  await browser.close();
};
run().catch(e => { console.error('FATAL', e); process.exit(1); });
