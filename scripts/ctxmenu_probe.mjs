// ctxmenu_probe.mjs — проверка схемы предмета: наведение/ЛКМ/ПКМ.
// 1) ПКМ по двери → контекстное меню с «Открыть дверь»
// 2) ЛКМ по двери → дверь открывается
// 3) ЛКМ по контейнеру → экран обыска
// 4) ЛКМ по дропу → предмет в инвентаре
// 5) ПКМ по пустому месту → меню НЕ появляется
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
  const rnd = page.locator('text="Случайный герой"').first();
  if (await rnd.isVisible().catch(() => false)) { await rnd.click(); await page.waitForTimeout(400); }
  const start = page.locator('text="Начать"').first();
  if (await start.isVisible().catch(() => false)) await start.click();
  await page.waitForTimeout(6000);

  // подготовка: поставить игрока рядом с дверью и контейнером из мира
  const prep = await page.evaluate(() => {
    const W = window.WS;
    const p = W.G.player;
    // найти ближайшую дверь и контейнер
    let door = null, cont = null, dd = 1e9, cd = 1e9;
    for (const o of (W.World.objects || [])) {
      if (!o) continue;
      const d = Math.hypot(o.x - p.x, o.y - p.y);
      if (o.door && !o.locked && d < dd) { dd = d; door = o; }
      if (o.container && !o.looted && d < cd) { cd = d; cont = o; }
    }
    // дроп под ногами: положим хлеб
    let drop = null;
    try { drop = W.Action.makeDrop('bread', 2, 100, p.x + 0.6, p.y + 0.3, 2); } catch (e) { drop = null; }
    return {
      door: door ? { x: door.x, y: door.y, open: !!door.open, id: door.id } : null,
      cont: cont ? { x: cont.x, y: cont.y, name: cont.name, id: cont.id } : null,
      drop: !!drop,
      px: p.x, py: p.y
    };
  });
  console.log('ПОДГОТОВКА:', JSON.stringify(prep));

  const mouseToWorld = async (wx, wy) => {
    // мировые -> канвас -> CSS-пиксели страницы (канвас растянут CSS)
    const s = await page.evaluate((w) => {
      const W = window.WS;
      const c = W.Cam.worldToScreen(w.x, w.y);
      const cv = document.getElementById('game');
      const r = cv.getBoundingClientRect();
      return { x: c.x * (r.width / cv.width), y: c.y * (r.height / cv.height) };
    }, { x: wx, y: wy });
    await page.mouse.move(s.x, s.y);
    await page.waitForTimeout(450);
    return s;
  };

  const res = { rmbDoor: null, lmbDoor: null, lmbCont: null, lmbDrop: null, rmbEmpty: null, hover: null };

  const teleportNear = async (tx, ty) => {
    await page.evaluate((t) => {
      const W = window.WS;
      // ближайший СВОБОДНЫЙ тайл (не занятый solidity-объектами)
      let best = null, bd = 1e9;
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
        const x = Math.floor(t.x) + dx, y = Math.floor(t.y) + dy;
        if (W.World.isTileBlocked(x, y)) continue;
        const objs = W.World.objsAt(x, y) || [];
        if (objs.some(o => o && o.solid)) continue;
        const d = Math.hypot(x + 0.5 - t.x, y + 0.5 - t.y);
        if (d < bd) { bd = d; best = { x: x + 0.5, y: y + 0.5 }; }
      }
      if (best) W.Player.setPos(best.x, best.y);
    }, { x: tx, y: ty });
    await page.waitForTimeout(300);
  };

  // --- 1+2) дверь: ПКМ → меню, ЛКМ → открыть ---
  if (prep.door) {
    await teleportNear(prep.door.x, prep.door.y);
    const s = await mouseToWorld(prep.door.x, prep.door.y);
    // наведение: тултип должен появиться
    res.hover = await page.evaluate(() => {
      const tt = document.querySelector('.ws-tooltip');
      return tt ? !tt.classList.contains('hidden') : false;
    });
    // ПКМ
    await page.mouse.click(s.x, s.y, { button: 'right' });
    await page.waitForTimeout(350);
    res.rmbDoor = await page.evaluate(() => {
      const m = document.querySelector('#ws-ctxmenu');
      if (!m || m.classList.contains('hidden')) return { shown: false };
      const items = Array.from(m.querySelectorAll('.ctx-it .ctx-lb')).map(e => e.textContent);
      const title = m.querySelector('.ctx-title');
      return { shown: true, title: title ? title.textContent : '', items };
    });
    // закрыть меню кликом мимо
    await page.mouse.click(60, 700);
    await page.waitForTimeout(250);
    // ЛКМ по двери — открыть
    const doorState0 = await page.evaluate((id) => {
      const o = window.WS.World.objects.find(o => o && o.id === id);
      return o ? o.open : null;
    }, prep.door.id);
    await page.mouse.click(s.x, s.y, { button: 'left' });
    await page.waitForTimeout(300);
    const doorState1 = await page.evaluate((id) => {
      const o = window.WS.World.objects.find(o => o && o.id === id);
      return o ? o.open : null;
    }, prep.door.id);
    res.lmbDoor = { before: doorState0, after: doorState1, toggled: doorState0 !== doorState1 };
  }

  // --- 3) ЛКМ по контейнеру → экран обыска ---
  if (prep.cont) {
    await teleportNear(prep.cont.x, prep.cont.y);
    const s = await mouseToWorld(prep.cont.x, prep.cont.y);
    await page.mouse.click(s.x, s.y, { button: 'left' });
    // обыск идёт 2-4 секунды (Loot.search) — ждём открытия окна
    await page.waitForTimeout(5500);
    res.lmbCont = await page.evaluate(() => {
      const W = window.WS;
      return { contOpen: !!(W.ContScreen && W.ContScreen.isOpen()), looted: !!(W.Forage && false) };
    });
    // закрыть
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }

  // --- 4) ЛКМ по дропу → предмет в инвентаре ---
  if (prep.drop) {
    // кладём хлеб ПОДАЛЬШЕ (вне автоподбора), подходим на 1 тайл, ЛКМ
    const placed = await page.evaluate(() => {
      const W = window.WS;
      const p = W.G.player;
      const d = W.Action.makeDrop('bread', 2, 100, p.x + 2.2, p.y - 1.5, 2);
      return d ? { x: p.x + 2.2, y: p.y - 1.5 } : null;
    });
    if (placed) {
      await teleportNear(placed.x, placed.y);
      const before = await page.evaluate(() => window.WS.Action.countItem('bread'));
      const s = await mouseToWorld(placed.x, placed.y);
      await page.mouse.click(s.x, s.y, { button: 'left' });
      await page.waitForTimeout(500);
      const after = await page.evaluate(() => window.WS.Action.countItem('bread'));
      res.lmbDrop = { before, after, picked: after === before + 2 };
    }
  }

  // --- 5) ПКМ по пустому снегу → меню НЕ появляется ---
  {
    const s = await page.evaluate(() => {
      // точка вдали от объектов: уводим экранную позицию в сторону от игрока
      return window.WS.Cam.worldToScreen(window.WS.G.player.x - 6, window.WS.G.player.y - 6);
    });
    await page.mouse.move(s.x, s.y);
    await page.mouse.click(s.x, s.y, { button: 'right' });
    await page.waitForTimeout(300);
    res.rmbEmpty = await page.evaluate(() => {
      const m = document.querySelector('#ws-ctxmenu');
      return { shown: !!(m && !m.classList.contains('hidden')) };
    });
  }

  console.log('РЕЗУЛЬТАТЫ:', JSON.stringify(res, null, 1));
  console.log('ОШИБКИ:', errors.length ? errors.slice(0, 6) : 'нет');
  await browser.close();
};
run().catch(e => { console.error('FATAL', e); process.exit(1); });
