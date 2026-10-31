// t07_enemies.js — ВРАГИ: морозные мультяшки. Спавн, приближение, кража еды,
// изгнание (свет / шум / удар), счётчик «изгнано мультяшек», чип HUD.
import { ctx, startGame, makeT } from './helpers.js';

const BASE = process.argv[2];
const T = makeT('t07_enemies');

const run = async () => {
  const { browser, page, errors } = await ctx(BASE);
  try {
    const st = await startGame(page);
    T.ok(st.ok, 'партия стартует');
    if (!st.ok) throw new Error('нет партии');

    // === 1. СПАВН мультяшки рядом с игроком ===
    const spawned = await page.evaluate(() => {
      const p = WS.G.player;
      const e = WS.Imps._spawn(p.x + 3, p.y);
      if (!e) return { ok: false };
      return { ok: true, kind: e.kind, hp: e.hp, count: WS.Imps.count(), dist: Math.round(Math.hypot(e.x - p.x, e.y - p.y)) };
    });
    T.ok(spawned.ok && spawned.kind === 'imp' && spawned.count >= 1,
      `спавн: мультяшка создана (kind=${spawned.kind}, hp=${spawned.hp}, в ${spawned.dist} тайлах)`);

    // === 2. СПРАЙТ зарегистрирован ===
    const spr = await page.evaluate(() => {
      const specs = WS.Spr.specs ? WS.Spr.specs() : {};
      return { imp: !!specs.imp };
    });
    T.ok(spr.imp, 'спрайт мультяшки зарегистрирован');

    // === 3. ПОВЕДЕНИЕ: идёт к игроку (пара секунд) ===
    await page.waitForTimeout(2500);
    const moved = await page.evaluate(() => {
      const p = WS.G.player;
      const list = WS.Imps._list();
      if (!list.length) return { ok: false, why: 'пропала (изгнана при спавне?)' };
      const e = list[0];
      return { ok: true, d: Math.round(Math.hypot(e.x - p.x, e.y - p.y)) };
    });
    console.log('    дистанция до игрока: ' + (moved.d !== undefined ? moved.d : moved.why));
    T.ok(moved.ok, 'мультяшка жива и ведёт себя');

    // === 4. КРАЖА: подходит вплотную — ворует еду ===
    const steal = await page.evaluate(() => {
      const p = WS.G.player;
      WS.Inv.give('bread', 2);
      const list = WS.Imps._list();
      if (!list.length) return { ok: false, why: 'нет мультяшки' };
      const e = list[0];
      e.x = p.x + 0.5; e.y = p.y;      // вплотную
      return { ok: true, before: WS.Inv.count('bread') };
    });
    await page.waitForTimeout(1500);
    const stolen = await page.evaluate(() => WS.Inv.count('bread'));
    const fleeing = await page.evaluate(() => {
      const list = WS.Imps._list();
      return list.length ? (list[0].imp ? list[0].imp.fleeT : -1) : -2;
    });
    T.ok(stolen < steal.before || fleeing > 0,
      `кража: еда украдена (${steal.before}->${stolen}) или воришка бежит (flee=${fleeing})`);

    // === 5. ИЗГНАНИЕ ШУМОМ (выстрел/громкий шум) ===
    const noiseExpel = await page.evaluate(() => {
      const list = WS.Imps._list();
      if (!list.length) return { ok: false, why: 'некого изгонять' };
      const e = list[0];
      const before = WS.Imps.expelled();
      WS.Ev.emit('noise', { x: e.x, y: e.y, r: 12 });
      return { ok: true, before, after: WS.Imps.expelled(), count: WS.Imps.count() };
    });
    T.ok(noiseExpel.ok && noiseExpel.after > noiseExpel.before,
      `изгнание шумом: счётчик ${noiseExpel.before}->${noiseExpel.after}`);

    // === 6. ИЗГНАНИЕ УДАРОМ ===
    const meleeExpel = await page.evaluate(() => {
      const p = WS.G.player;
      const e = WS.Imps._spawn(p.x + 1, p.y);
      if (!e) return { ok: false };
      const before = WS.Imps.expelled();
      // удар по мультяшке — имитация ent:attack
      WS.Ev.emit('ent:attack', { src: p, dst: e, dmg: 5 });
      return { ok: true, before, after: WS.Imps.expelled() };
    });
    T.ok(meleeExpel.ok && meleeExpel.after > meleeExpel.before,
      `изгнание ударом: счётчик ${meleeExpel.before}->${meleeExpel.after}`);

    // === 7. ИЗГНАНИЕ СВЕТОМ (факел в руке) ===
    const lightExpel = await page.evaluate(() => {
      const p = WS.G.player;
      WS.Inv.give('torch', 1);
      const idx = p.inv.findIndex(it => it && it.id === 'torch');
      WS.Inv.equip('hand1', idx);
      const e = WS.Imps._spawn(p.x + 2, p.y);
      if (!e) return { ok: false };
      const before = WS.Imps.expelled();
      return { ok: true, before, id: e.id };
    });
    // свет проверяется в тике updateImp — подождём (0.35 сек внутри + тик)
    await page.waitForTimeout(2500);
    const lightAfter = await page.evaluate(() => WS.Imps.expelled());
    T.ok(lightAfter > lightExpel.before,
      `изгнание светом факела: счётчик ${lightExpel.before}->${lightAfter}`);

    // === 8. ЧИП HUD «изгнано мультяшек» ===
    const chip = await page.evaluate(() => {
      const els = document.querySelectorAll('.hud-chip');
      for (const el of els) {
        if (/изгнано мультяшек/i.test(el.textContent)) {
          return { ok: true, text: el.textContent, visible: !el.classList.contains('hidden') };
        }
      }
      return { ok: false };
    });
    T.ok(chip.ok && chip.visible, 'чип HUD: «' + (chip.text || 'нет') + '» виден');

    // === 9. СОБЫТИЕ imp:expelled стреляет ===
    const evtOk = await page.evaluate(() => {
      let fired = 0;
      const h = (d) => { fired++; };
      WS.Ev.on('imp:expelled', h);
      const p = WS.G.player;
      const e = WS.Imps._spawn(p.x + 1, p.y);
      if (e) WS.Imps._expel(e, 'тест-событие');
      return { fired };
    });
    T.ok(evtOk.fired >= 1, 'событие imp:expelled генерируется');

    T.eq(errors.length, 0, 'ошибок консоли нет' + (errors.length ? ': ' + errors[0] : ''));
    errors.slice(0, 8).forEach(e => console.log('    ' + e));
  } finally {
    await browser.close();
  }
  const r = T.finish();
  process.exit(r.failed ? 1 : 0);
};

run().catch(e => { console.error('FAIL', e); process.exit(2); });
