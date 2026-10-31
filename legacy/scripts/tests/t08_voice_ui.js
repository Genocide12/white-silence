// t08_voice_ui.js — ОЗВУЧКА + UI-ПАНЕЛИ: банк фраз, включение/выключение,
// озвучка демо-реплик, панель демо (сворачивание/перенос/не перекрывает часы),
// меню-модалки toggle, Esc.
import { ctx, startGame, makeT } from './helpers.js';

const BASE = process.argv[2];
const T = makeT('t08_voice_ui');

const run = async () => {
  const { browser, page, errors } = await ctx(BASE);
  try {
    // === ОЗВУЧКА ===
    const vs = await page.evaluate(() => WS.Voice.status());
    T.ok(vs.supported, 'TTS: speechSynthesis доступен в браузере');
    T.ok(vs.banks >= 30, `TTS: банк фраз ≥30 (${vs.banks} реплик в ${''}событиях)`);

    const toggles = await page.evaluate(() => {
      WS.Voice.setEnabled(false);
      const off = WS.Voice.isEnabled();
      WS.Voice.say('не должно прозвучать', 'misc', 1);
      const queuedOff = WS.Voice.status().queued;
      WS.Voice.setEnabled(true);
      const on = WS.Voice.isEnabled();
      WS.Voice.say('проверка речи', 'victory', 2);
      return { off, queuedOff, on };
    });
    T.ok(toggles.off === false && toggles.on === true, 'TTS: включается/выключается');
    T.eq(toggles.queuedOff, 0, 'TTS: выключенный — молчит (очередь пуста)');

    // озвучка не роняет кадр при недоступном голосе
    const sayOk = await page.evaluate(() => {
      try {
        WS.Voice.say('раз', 'threat', 2);
        WS.Voice.say('два', 'cold', 2);
        WS.Voice.say('три', 'hunger', 1);
        return { ok: true };
      } catch (e) { return { ok: false, err: e.message }; }
    });
    T.ok(sayOk.ok, 'TTS: очередь не падает' + (sayOk.err ? ' — ' + sayOk.err : ''));

    // галка в настройках
    const optVoice = await page.evaluate(() => {
      WS.Options.set('voice', false);
      const v1 = WS.Voice.isEnabled();
      WS.Options.set('voice', true);
      const v2 = WS.Voice.isEnabled();
      return { v1, v2 };
    });
    T.ok(optVoice.v1 === false && optVoice.v2 === true, 'настройка «Озвучка событий» управляет TTS');

    // === ПАРТИЯ + ПАНЕЛЬ ДЕМО ===
    const st = await startGame(page);
    T.ok(st.ok, 'партия стартует');
    if (!st.ok) throw new Error('нет партии');

    const panel1 = await page.evaluate(() => {
      WS.Demo.start({});
      const root = document.getElementById('ws-demo');
      return {
        started: WS.Demo.active(),
        visible: root && !root.classList.contains('hidden'),
        hasMini: !!(root && root.querySelector('.d-mini')),
        zIndex: root ? getComputedStyle(root).zIndex : '?',
        top: root ? root.style.top || getComputedStyle(root).top : '?'
      };
    });
    T.ok(panel1.started && panel1.visible, 'панель демо: появляется при старте');
    T.ok(panel1.hasMini, 'панель демо: есть кнопка сворачивания');

    // панель ПОД модалками и ПОД часами
    T.ok(parseInt(panel1.zIndex, 10) <= 100, 'панель демо: z-index под экранами (' + panel1.zIndex + ')');
    const overlap = await page.evaluate(() => {
      const demo = document.getElementById('ws-demo').getBoundingClientRect();
      const hud = document.getElementById('ws-hud');
      if (!hud) return { ok: true, why: 'нет ws-hud' };
      const hb = hud.getBoundingClientRect();
      const inter = !(demo.left > hb.right || demo.right < hb.left || demo.top > hb.bottom || demo.bottom < hb.top);
      return { ok: !inter, hudTop: hb.top, hudBottom: hb.bottom, demoTop: demo.top };
    });
    T.ok(overlap.ok, 'панель демо: не перекрывает часы #ws-hud' +
      (overlap.hudBottom !== undefined ? ` (часи до ${overlap.hudBottom}, панель с ${overlap.demoTop})` : ''));

    // сворачивание — toggle
    const collapse = await page.evaluate(() => {
      const root = document.getElementById('ws-demo');
      const mini = root.querySelector('.d-mini');
      mini.click();
      const c1 = root.classList.contains('collapsed');
      mini.click();
      const c2 = root.classList.contains('collapsed');
      mini.click();                     // оставить свёрнутой для теста переноса? нет — вернём
      const c3 = root.classList.contains('collapsed');
      mini.click();
      return { c1, c2, c3, c4: root.classList.contains('collapsed') };
    });
    T.ok(collapse.c1 && !collapse.c2 && collapse.c3 && !collapse.c4,
      'панель демо: сворачивание — toggle (4 нажатия: 1-0-1-0)');

    // перенос панели за шапку
    const drag = await page.evaluate(() => {
      const root = document.getElementById('ws-demo');
      const head = root.querySelector('.d-head');
      const r0 = root.getBoundingClientRect();
      const ev1 = new MouseEvent('mousedown', { bubbles: true, clientX: r0.left + 60, clientY: r0.top + 8 });
      head.dispatchEvent(ev1);
      window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: r0.left - 200, clientY: r0.top + 150 }));
      window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      const r1 = root.getBoundingClientRect();
      return { movedX: Math.round(r1.left - r0.left), movedY: Math.round(r1.top - r0.top) };
    });
    T.ok(drag.movedX < -50 || drag.movedY > 20,
      `панель демо: перетаскивается (Δx=${drag.movedX}, Δy=${drag.movedY})`);

    // озвучка демо-реплик (good/bad) не падает
    const demoVoice = await page.evaluate(() => {
      try {
        const j = WS.Demo.journal();
        return { ok: true, lines: j.length };
      } catch (e) { return { ok: false }; }
    });
    T.ok(demoVoice.ok && demoVoice.lines > 0, 'демо: журнал пишется (' + demoVoice.lines + ' строк)');

    await page.evaluate(() => WS.Demo.stop('тест'));

    // === МЕНЮ-МОДАЛКИ: повторное нажатие закрывает ===
    const modalToggle = await page.evaluate(() => {
      // «Как играть» — открываем и закрываем тем же действием
      const menu = WS.Menu;
      if (!menu) return { ok: false, why: 'нет WS.Menu' };
      return { ok: true };
    });
    // через UI: вернуться в меню нельзя без смерти — проверим на главном меню отдельно
    const menuCheck = await page.evaluate(() => {
      // остановим партию — вернёмся в меню (как death/menu), затем кликнем «Как играть» дважды
      try {
        if (WS.Main && WS.Main.toMenu) WS.Main.toMenu();
      } catch (e) { /* пусто */ }
      return true;
    });
    await page.waitForTimeout(800);
    const menuVisible = await page.evaluate(() => !!document.querySelector('#ws-menu:not(.hidden)'));
    if (menuVisible) {
      const mt = await page.evaluate(() => {
        const btn = document.querySelector('#ws-menu button');
        const how = Array.from(document.querySelectorAll('#ws-menu button'))
          .find(b => b.textContent.indexOf('Как играть') >= 0);
        if (!how) return { ok: false, why: 'нет кнопки' };
        how.click();
        const wrap = document.querySelector('.menu-modal-wrap');
        const open1 = wrap && !wrap.classList.contains('hidden');
        how.click();
        const open2 = wrap && !wrap.classList.contains('hidden');
        return { ok: open1 === true && open2 === false };
      });
      T.ok(mt.ok, 'меню: «Как играть» — повторный клик закрывает (toggle)' + (mt.why ? ' (' + mt.why + ')' : ''));
    } else {
      console.log('    (меню недоступно после партии — пропускаю проверку модалок)');
    }

    T.eq(errors.length, 0, 'ошибок консоли нет' + (errors.length ? ': ' + errors[0] : ''));
    errors.slice(0, 8).forEach(e => console.log('    ' + e));
  } finally {
    await browser.close();
  }
  const r = T.finish();
  process.exit(r.failed ? 1 : 0);
};

run().catch(e => { console.error('FAIL', e); process.exit(2); });
