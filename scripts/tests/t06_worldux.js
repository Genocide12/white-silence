// t06_worldux.js — UX ПРЕДМЕТОВ: hover-тултип, ЛКМ-быстрое действие,
// ПКМ-меню всех действий (мир, инвентарь, контейнер), toggle-закрытие.
import { ctx, startGame, makeT } from './helpers.js';

const BASE = process.argv[2];
const T = makeT('t06_worldux');

const run = async () => {
  const { browser, page, errors } = await ctx(BASE);
  try {
    const st = await startGame(page);
    T.ok(st.ok, 'партия стартует');
    if (!st.ok) throw new Error('нет партии');

    // === подготовка: встать рядом с контейнером (на проходимом тайле!),
    // найти его и навести «мышь» ===
    const target = await page.evaluate(`(function(){
      function findStand(filterFn) {
        const objs = WS.World.objects;
        for (let i = 0; i < objs.length; i++) {
          const o = objs[i];
          if (!o || !filterFn(o)) continue;
          const bx = Math.floor(o.x), by = Math.floor(o.y);
          for (const d of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]) {
            const tx = bx + d[0], ty = by + d[1];
            try {
              if (WS.World.isTileBlocked(tx, ty)) continue;
              const obs = WS.World.objsAt(tx, ty);
              let solid = false;
              if (obs) for (const oo of obs) if (oo && oo.solid && !oo.door) { solid = true; break; }
              if (solid) continue;
              return { o, stand: { x: tx + 0.5, y: ty + 0.5 } };
            } catch (e) { /* пусто */ }
          }
        }
        return null;
      }
      const hit = findStand(o => o.container && !o.locked && !o.looted);
      if (!hit) return { found: false };
      const c = hit.o;
      const p = WS.G.player;
      p.x = hit.stand.x; p.y = hit.stand.y;
      // КУРСОР «НА» ОБЪЕКТ: каждый кадр updateMouseWorld() пересчитывает
      // wx/tx из экранных координат — замораживаем пересчёт на время теста
      // (иначе под мышью оказывается сосед — Камыш/Стог, а не контейнер)
      const m = WS.Input.mouse();
      m.tx = Math.floor(c.x); m.ty = Math.floor(c.y);
      m.wx = c.x; m.wy = c.y;
      m.x = 500; m.y = 300;
      WS.Input.updateMouseWorld = function () {};   // разморозим в конце теста
      return { found: true, name: c.name, x: c.x, y: c.y };
    })()`);
    T.ok(target.found, 'контейнер для теста найден, игрок рядом (на свободном тайле)');
    await page.waitForTimeout(300);   // тик hover (20/сек)

    // === 1. HOVER: тултип с краткими сведениями ===
    const hover = await page.evaluate(() => {
      const h = WS.WorldUX._hover();
      return {
        hasObj: !!h.obj,
        name: h.obj ? h.obj.name : null,
        container: h.obj ? !!h.obj.container : false,
        tipVisible: WS.WorldUX._tipVisible()
      };
    });
    T.ok(hover.hasObj && hover.container, 'hover: объект под курсором распознан (' + hover.name + ')');
    T.ok(hover.tipVisible, 'hover: тултип виден');

    const tipText = await page.evaluate(() => {
      const el = document.querySelector('.ws-wtt');
      return el ? el.textContent : '';
    });
    T.ok(/контейнер/i.test(tipText) && /ЛКМ|ПКМ/.test(tipText),
      'hover: тултип содержит тип и подсказки действий');

    // === 2. ЛКМ: быстрое действие (обыск) ===
    const lmb = await page.evaluate(() => {
      WS.Ev.emit('mouse:down', { button: 0, x: 500, y: 300 });
      return { consumed: WS.WorldUX.consumedClick() };
    });
    T.ok(lmb.consumed, 'ЛКМ: клик съеден быстрым действием');
    await page.waitForTimeout(2500);
    const lmbState = await page.evaluate(() => ({
      searching: WS.Loot.isSearching ? WS.Loot.isSearching() : false,
      screen: !!(WS.ContScreen && WS.ContScreen.isOpen && WS.ContScreen.isOpen())
    }));
    T.ok(lmbState.searching || lmbState.screen, 'ЛКМ: обыск начался (обыск=' + lmbState.searching + ', экран=' + lmbState.screen + ')');
    // дождаться и закрыть
    await page.waitForTimeout(4000);
    await page.evaluate(() => {
      if (WS.ContScreen && WS.ContScreen.isOpen && WS.ContScreen.isOpen()) {
        WS.ContScreen.takeAll();
        WS.ContScreen.close();
      }
    });

    // === 3. ПКМ: меню всех действий (мир; СВЕЖИЙ контейнер — не обысканный ЛКМ) ===
    const rmb = await page.evaluate(async () => {
      // найти ещё не тронутый контейнер и навести мышь
      const objs = WS.World.objects;
      let c2 = null;
      for (const o of objs) {
        if (o && o.container && !o.locked && !o.looted) { c2 = o; break; }
      }
      if (!c2) c2 = (function () { for (const o of objs) if (o && o.container) return o; return null; })();
      if (!c2) return { open: false };
      const p = WS.G.player;
      p.x = c2.x + 1.2; p.y = c2.y + 0.5;
      const m = WS.Input.mouse();
      m.tx = Math.floor(c2.x); m.ty = Math.floor(c2.y);
      m.wx = c2.x; m.wy = c2.y;
      // дать тику hover увидеть новый объект (иначе в меню останется старый)
      await new Promise(r => setTimeout(r, 150));
      WS.Ev.emit('mouse:down', { button: 2, x: 500, y: 300 });
      return { open: WS.WorldUX.menuOpen() };
    });
    await page.waitForTimeout(200);
    const menuState = await page.evaluate(() => ({
      open: WS.WorldUX.menuOpen(),
      items: WS.WorldUX._menuItems()
    }));
    T.ok(menuState.open, 'ПКМ: меню открылось');
    T.ok(menuState.items.length >= 2, 'ПКМ: в меню есть действия (' + menuState.items.join(' | ') + ')');

    // === 4. TOGGLE: повторный ПКМ по ТОМУ ЖЕ объекту закрывает ===
    const toggle = await page.evaluate(async () => {
      // меню уже открыто предыдущим шагом — ждём стабильного hover и жмём снова
      await new Promise(r => setTimeout(r, 100));
      const wasOpen = WS.WorldUX.menuOpen();
      WS.Ev.emit('mouse:down', { button: 2, x: 500, y: 300 });
      return !WS.WorldUX.menuOpen() && wasOpen;
    });
    T.ok(toggle, 'ПКМ: повторное нажатие закрывает меню (toggle)');

    // === 5. ПКМ по предмету в ИНВЕНТАРЕ (ищем СЛОТ ХЛЕБА конкретно) ===
    await page.evaluate(() => {
      WS.Inv.give('bread', 3);
      WS.Inv.give('valenki', 1);
      WS.InvScreen.open();
    });
    await page.waitForTimeout(400);
    const invMenu = await page.evaluate(() => {
      const p = WS.G.player;
      const breadIdx = p.inv.findIndex(it => it && it.id === 'bread');
      if (breadIdx < 0) return { ok: false, why: 'хлеба нет в сумке' };
      const slot = document.querySelector('#inv-grid .inv-slot[data-i="' + breadIdx + '"]');
      if (!slot) return { ok: false, why: 'нет слота хлеба' };
      slot.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 300, clientY: 300 }));
      return { ok: WS.WorldUX.menuOpen(), items: WS.WorldUX._menuItems(), breadIdx };
    });
    T.ok(invMenu.ok, 'ПКМ в инвентаре: меню открылось' + (invMenu.why ? ' (' + invMenu.why + ')' : ''));
    T.ok(invMenu.items && /Съесть|Надеть|Выбросить/.test(invMenu.items.join(',')),
      'ПКМ в инвентаре: есть действия предмета (' + (invMenu.items || []).join(' | ') + ')');
    // действие из меню: «Съесть»
    const ate = await page.evaluate(() => {
      const before = WS.Inv.count('bread');
      const btns = document.querySelectorAll('.ws-ctxmenu .ctx-item');
      for (const b of btns) {
        if (b.querySelector('.ctx-lbl').textContent === 'Съесть') { b.click(); return { clicked: true, before }; }
      }
      return { clicked: false, before };
    });
    const afterBread = await page.evaluate(() => WS.Inv.count('bread'));
    T.ok(ate.clicked && afterBread === ate.before - 1,
      `действие из меню: «Съесть» съедает хлеб (${ate.before}->${afterBread})`);
    await page.evaluate(() => { WS.WorldUX.closeMenu(); WS.InvScreen.close(); });

    // === 6. ПКМ по предмету в КОНТЕЙНЕРЕ ===
    const contMenu = await page.evaluate(`(function(){
      function findStand(filterFn) {
        const objs = WS.World.objects;
        for (let i = 0; i < objs.length; i++) {
          const o = objs[i];
          if (!o || !filterFn(o)) continue;
          const bx = Math.floor(o.x), by = Math.floor(o.y);
          for (const d of [[1,0],[-1,0],[0,1],[0,-1]]) {
            const tx = bx + d[0], ty = by + d[1];
            try {
              if (WS.World.isTileBlocked(tx, ty)) continue;
              return { o, stand: { x: tx + 0.5, y: ty + 0.5 } };
            } catch (e) { /* пусто */ }
          }
        }
        return null;
      }
      const hit = findStand(o => o.container && !o.locked);
      if (!hit) return { ok: false, why: 'нет контейнера' };
      const c = hit.o;
      const p = WS.G.player;
      p.x = hit.stand.x; p.y = hit.stand.y;
      // экран читает o.inv (не o.container): кладём КОНКРЕТНО гвозди,
      // чтобы проверять именно их (fill() даёт случайный лут)
      try { WS.Loot.fill(c); } catch (eFill) { /* пусто */ }
      c.inv = [{ id: 'nails', count: 5 }];
      WS.ContScreen.open(c);
      return { ok: true };
    })()`);
    await page.waitForTimeout(600);
    const contMenuState = await page.evaluate(() => {
      const debug = {
        screenOpen: WS.ContScreen.isOpen(),
        invLen: WS.ContScreen.object() ? (WS.ContScreen.object().inv || []).length : -1,
        slots: document.querySelectorAll('#cont-grid .cont-slot').length
      };
      const slot = document.querySelector('#cont-grid .cont-slot[data-c]');
      if (!slot) return { ok: false, why: 'нет слота контейнера', debug };
      slot.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 300, clientY: 300 }));
      return { ok: WS.WorldUX.menuOpen(), items: WS.WorldUX._menuItems(), debug };
    });
    if (contMenuState.debug) console.log('    контейнер-экран:', JSON.stringify(contMenuState.debug));
    T.ok(contMenuState.ok, 'ПКМ в контейнере: меню открылось' + (contMenuState.why ? ' (' + contMenuState.why + ')' : ''));
    T.ok(contMenuState.items && /Взять/.test(contMenuState.items.join(',')),
      'ПКМ в контейнере: есть «Взять» (' + (contMenuState.items || []).join(' | ') + ')');
    // «Взять» из меню (с диагностикой)
    const took = await page.evaluate(() => {
      const before = WS.Inv.count('nails');
      const btns = document.querySelectorAll('.ws-ctxmenu .ctx-item');
      let clickedBtn = null;
      for (const b of btns) {
        if (b.querySelector('.ctx-lbl').textContent.indexOf('Взять в сумку') === 0) { clickedBtn = b; break; }
      }
      if (!clickedBtn) return { clicked: false, before, why: 'нет кнопки' };
      clickedBtn.click();
      return { clicked: true, before };
    });
    await page.waitForTimeout(300);
    const afterNails = await page.evaluate(() => WS.Inv.count('nails'));
    T.ok(took.clicked && afterNails > took.before,
      `действие из меню: «Взять в сумку» переносит (${took.before}->${afterNails}${took.why ? ' — ' + took.why : ''})`);
    await page.evaluate(() => { WS.WorldUX.closeMenu(); WS.ContScreen.close(); });

    // === 7. Esc закрывает меню (и размораживаем пересчёт мыши) ===
    await page.evaluate(() => {
      const m = WS.Input.mouse();
      m.tx = Math.floor(WS.G.player.x) - 1; m.ty = Math.floor(WS.G.player.y);
      WS.Ev.emit('mouse:down', { button: 2, x: 500, y: 300 });
    });
    await page.waitForTimeout(150);
    const escOk = await page.evaluate(() => {
      if (!WS.WorldUX.menuOpen()) return false;
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true }));
      return new Promise(res => setTimeout(() => {
        // вернуть честный пересчёт мыши (заморожен в начале теста)
        try { delete WS.Input.updateMouseWorld; } catch (e) { /* пусто */ }
        res(!WS.WorldUX.menuOpen());
      }, 120));
    });
    T.ok(escOk, 'Esc закрывает контекстное меню');

    T.eq(errors.length, 0, 'ошибок консоли нет' + (errors.length ? ': ' + errors[0] : ''));
    errors.slice(0, 8).forEach(e => console.log('    ' + e));
  } finally {
    await browser.close();
  }
  const r = T.finish();
  process.exit(r.failed ? 1 : 0);
};

run().catch(e => { console.error('FAIL', e); process.exit(2); });
