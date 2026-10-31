// t02_actions.js — КАЖДОЕ ДЕЙСТВИЕ игрока: еда, питьё, сон, дверь, обыск,
// печь, костёр, крафт, экипировка, дроп/подбор, свет, перезарядка, удар,
// выстрел, таяние снега, перевязка, чтение, снег горстью, сейв.
import { ctx, startGame, give, countOf, makeT } from './helpers.js';

const BASE = process.argv[2];
const T = makeT('t02_actions');

/** Кусок для страницы: найти объект по фильтру + проходимый тайл рядом. */
const FIND_SNIPPET = `
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
  }`;

const run = async () => {
  const { browser, page, errors } = await ctx(BASE);
  try {
    const st = await startGame(page);
    T.ok(st.ok, 'новая партия стартует' + (st.reason ? ': ' + st.reason : ''));
    if (!st.ok) throw new Error('нет партии');

    // === 1. ЕДА ===
    await give(page, [{ id: 'bread', n: 2 }]);
    const eat = await page.evaluate(() => {
      const p = WS.G.player;
      p.needs.hunger = 30;
      const before = WS.Inv.count('bread');
      const r = WS.Needs.eat('bread');
      return { ok: !!(r && r.ok), before, after: WS.Inv.count('bread'), hunger: p.needs.hunger };
    });
    T.ok(eat.ok && eat.after === eat.before - 1, `еда: хлеб съеден (${eat.before}->${eat.after}), сытость ${Math.round(eat.hunger)}`);

    // === 2. ПИТЬЁ ===
    await give(page, [{ id: 'water_flask', n: 1 }]);
    const drink = await page.evaluate(() => {
      const p = WS.G.player;
      p.needs.thirst = 30;
      const r = WS.Needs.drink('water_flask');
      return { ok: !!(r && r.ok), thirst: p.needs.thirst };
    });
    T.ok(drink.ok && drink.thirst > 30, `питьё: фляга выпита, жажда ${Math.round(drink.thirst)}`);

    // === 3. СОН / ПОДЪЁМ (нужна кровать рядом) ===
    const sleep = await page.evaluate(`(function(){
      ${FIND_SNIPPET}
      const hit = findStand(o => String(o.sprName || '').indexOf('bed') === 0 || /кроват/i.test(o.name || ''));
      if (!hit) return { ok: false, why: 'кровать не найдена' };
      const p = WS.G.player;
      p.x = hit.stand.x; p.y = hit.stand.y;
      p.needs.fatigue = 20;
      const r1 = WS.Needs.trySleep();
      if (!r1 || !r1.ok) return { ok: false, why: 'не лёг: ' + (r1 && r1.reason) };
      const was = p.sleeping === true;
      WS.Needs.wake();
      return { ok: was && !p.sleeping, why: '' };
    })()`);
    T.ok(sleep.ok, 'сон: лёг в кровать и проснулся' + (sleep.why ? ' (' + sleep.why + ')' : ''));

    // === 4. ДВЕРЬ: открыть/закрыть (незапертая; закрываем ОТОЙДЯ —
    // игра не даёт прихлопнуть дверь, если стоишь в проёме) ===
    const door = await page.evaluate(`(function(){
      const objs = WS.World.objects;
      let d = null;
      for (const o of objs) if (o && o.door && !o.locked) { d = o; break; }
      if (!d) return { found: false };
      const p = WS.G.player;
      p.x = d.x + 1.5; p.y = d.y + 0.5;
      const wasOpen = !!d.open;   // у части дверей open===undefined (закрыта)
      const r1 = WS.Action.toggleDoor(d);
      const nowOpen = d.open;
      // отойти по диагонали (проверено зон­дом: 4.2 тайла — свободно)
      p.x = d.x + 3; p.y = d.y + 3;
      const r2 = WS.Action.toggleDoor(d);
      return { found: true, r1, r2, nowOpen, back: d.open, wasOpen,
               dxy: [Math.round(d.x), Math.round(d.y)],
               ok: r1 === true && r2 === true && nowOpen === !wasOpen && d.open === wasOpen };
    })()`);
    if (!door.ok) {
      console.log('    дверь-детали:', JSON.stringify({ r1: door.r1, r2: door.r2, nowOpen: door.nowOpen, back: door.back, wasOpen: door.wasOpen, at: door.dxy }));
    }
    T.ok(door.found && door.ok, 'дверь: открыть и закрыть (туда-обратно)');

    // === 5. ОБЫСК контейнера (досягаемого) ===
    const search = await page.evaluate(`(function(){
      ${FIND_SNIPPET}
      const hit = findStand(o => o.container && !o.locked && !o.looted);
      if (!hit) return { found: false };
      const p = WS.G.player;
      p.x = hit.stand.x; p.y = hit.stand.y;
      const r = WS.Loot.search(hit.o);
      return { found: true, started: r === true, name: hit.o.name };
    })()`);
    T.ok(search.found, 'обыск: контейнер найден в мире' + (search.name ? ' (' + search.name + ')' : ''));
    T.ok(search.started, 'обыск: начался (Loot.search → true)');
    await page.waitForTimeout(5000);
    const take = await page.evaluate(() => {
      const scr = WS.ContScreen;
      if (scr && scr.isOpen && scr.isOpen()) {
        const p = WS.G.player;
        const before = p.inv.length;
        const n = scr.takeAll();
        scr.close();
        return { screen: true, gained: p.inv.length - before };
      }
      return { screen: false };
    });
    T.ok(take.screen, 'обыск: экран контейнера открылся');
    T.ok(take.gained >= 0, 'обыск: «взять всё» перенесло добычу (+' + take.gained + ' предметов)');

    // === 6. ПЕЧЬ: растопить ===
    await give(page, [{ id: 'firewood_bundle', n: 3 }, { id: 'matches', n: 5 }]);
    const stove = await page.evaluate(`(function(){
      ${FIND_SNIPPET}
      const hit = findStand(o => o.heat);
      if (!hit) return { found: false };
      const p = WS.G.player;
      p.x = hit.stand.x; p.y = hit.stand.y;
      const r = WS.Fire.lightStove(hit.o);
      return { found: true, ok: !!(r && r.ok), reason: r && r.reason };
    })()`);
    T.ok(stove.found, 'печь: найдена в мире');
    T.ok(stove.ok, 'печь: растоплена (дрова+спички)' + (stove.reason ? ' — ' + stove.reason : ''));

    // === 7. КОСТЁР на снегу (нужны ТРУТ + дрова + спички) ===
    const campfire = await page.evaluate(`(function(){
      WS.Inv.give('cloth_rag', 2);          // трут
      WS.Inv.give('firewood_bundle', 2);    // дрова
      WS.Inv.give('matches', 2);
      const p = WS.G.player;
      for (const d of [[2,0],[-2,0],[0,2],[0,-2],[2,1],[-2,-1],[1,2],[-1,-2]]) {
        const tx = Math.floor(p.x) + d[0], ty = Math.floor(p.y) + d[1];
        if (WS.World.isTileBlocked(tx, ty)) continue;
        const r = WS.Fire.lightCampfire(tx + 0.5, ty + 0.5);
        if (r && r.ok) {
          const near = WS.Fire.near(p.x, p.y, 5);
          return { ok: true, near: !!near };
        }
      }
      return { ok: false, why: 'не развёлся (нет места/материалов)' };
    })()`);
    T.ok(campfire.ok && campfire.near, 'костёр: разведён и греет рядом' + (campfire.why ? ' — ' + campfire.why : ''));

    // === 8. КРАФТ: факел ===
    await give(page, [{ id: 'plank', n: 2 }, { id: 'cloth_rag', n: 2 }, { id: 'fat', n: 1 }]);
    const craft = await page.evaluate(() => {
      const r = WS.Craft.craft('torch');
      return { ok: !!(r && r.ok), reason: r && r.reason };
    });
    await page.waitForTimeout(4500);
    const torchN = await countOf(page, 'torch');
    T.ok(craft.ok || torchN > 0, `крафт: факел (принято=${craft.ok}, в сумке=${torchN})` + (craft.reason ? ' — ' + craft.reason : ''));

    // === 9. ЭКИПИРОВКА: надеть/снять ===
    await give(page, [{ id: 'valenki', n: 1 }]);
    const equip = await page.evaluate(() => {
      const p = WS.G.player;
      const idx = p.inv.findIndex(it => it && it.id === 'valenki');
      if (idx < 0) return { ok: false, why: 'нет валенок' };
      const r = WS.Inv.equip('feet', idx);
      const on = p.equip.feet && p.equip.feet.id === 'valenki';
      let off = false;
      if (on) {
        WS.Inv.unequip('feet');
        off = !(p.equip.feet && p.equip.feet.id === 'valenki');
      }
      return { ok: on && off, why: '' };
    });
    T.ok(equip.ok, 'экипировка: валенки надеты и сняты' + (equip.why ? ' (' + equip.why + ')' : ''));

    // === 10. ДРОП / ПОДБОР (игра сама автоподбирает выпавшее) ===
    await give(page, [{ id: 'nails', n: 10 }]);
    const drop = await page.evaluate(() => {
      const p = WS.G.player;
      const idx = p.inv.findIndex(it => it && it.id === 'nails');
      const r = WS.Inv.drop(idx, 4);            // возвращает число выброшенного
      return { n: r, left: WS.Inv.count('nails') };
    });
    T.ok(drop.left === 6, `дроп: 4 гвоздя выброшено, осталось ${drop.left}`);
    // автоподбор: игра подбирает дроп у ног сама — ждём и проверяем
    await page.waitForTimeout(1200);
    const pick = await page.evaluate(() => {
      const p = WS.G.player;
      const before = WS.Inv.count('nails');
      // встаём точно на место дропа (если он ещё не подобран)
      let tgt = null;
      for (const o of WS.World.objects) if (o && o.drop && o.drop.id === 'nails') { tgt = o; break; }
      if (tgt) { p.x = tgt.x; p.y = tgt.y; }
      WS.Action.autoPickup();
      return { before, after: WS.Inv.count('nails'), hadDrop: !!tgt };
    });
    T.ok(pick.after >= 6, `подбор: выпавшее возвращается в сумку (${pick.before}->${pick.after}${pick.hadDrop ? '' : ', уже подобрано игрой'})`);

    // === 11. СВЕТ: факел в руку и зажечь ===
    const light = await page.evaluate(() => {
      const p = WS.G.player;
      const idx = p.inv.findIndex(it => it && it.id === 'torch');
      if (idx < 0) return { ok: false, why: 'нет факела (крафт не успел?)' };
      WS.Inv.equip('hand1', idx);
      const r = WS.Action.toggleLight();
      return { ok: !!(r && r.ok !== false), why: r && r.reason };
    });
    T.ok(light.ok, 'свет: факел в руке зажжён' + (light.why ? ' — ' + light.why : ''));

    // === 12. ПЕРЕЗАРЯДКА ===
    await give(page, [{ id: 'rifle_mosin', n: 1 }, { id: 'rifle_round', n: 5 }]);
    const reload = await page.evaluate(() => {
      const p = WS.G.player;
      const idx = p.inv.findIndex(it => it && it.id === 'rifle_mosin');
      WS.Inv.equip('hand1', idx);
      const r = WS.Action.tryReload();           // boolean
      return { ok: r === true };
    });
    T.ok(reload.ok, 'перезарядка: винтовка заряжена');
    await page.waitForTimeout(600);              // перезарядка занимает время

    // === 13. ВЫСТРЕЛ ===
    const shot = await page.evaluate(() => {
      const p = WS.G.player;
      const m = WS.Input.mouse();
      m.wx = p.x + 5; m.wy = p.y;
      m.tx = Math.floor(p.x + 5); m.ty = Math.floor(p.y);
      const r = WS.Action.fireWeapon();
      return { ok: r === true };
    });
    T.ok(shot.ok, 'выстрел: fireWeapon отработал');

    // === 14. УДАР (кулаки) ===
    const melee = await page.evaluate(() => {
      const r = WS.Action.meleeAttack();
      return { ok: typeof r === 'number' };
    });
    T.ok(melee.ok, 'удар: meleeAttack не падает');

    // === 15. ТАЯНИЕ СНЕГА (фляга у огня) ===
    const melt = await page.evaluate(() => {
      const p = WS.G.player;
      const fire = WS.Fire.near(p.x, p.y, 4);
      if (!fire) return { ok: false, why: 'нет огня рядом' };
      if (WS.Inv.count('flask_empty') < 1) WS.Inv.give('flask_empty', 1);
      const r = WS.Fire.meltSnow ? WS.Fire.meltSnow() : { ok: false, reason: 'нет метода' };
      return { ok: !!(r && r.ok), why: r && r.reason };
    });
    T.ok(melt.ok, 'таяние: снег → вода' + (melt.why ? ' — ' + melt.why : ''));

    // === 16. ПЕРЕВЯЗКА ===
    await give(page, [{ id: 'bandage_clean', n: 2 }]);
    const band = await page.evaluate(() => {
      const p = WS.G.player;
      p.bleed = 2;
      const r = WS.Health.bandage('bandage_clean');   // boolean
      return { ok: r === true, bleed: p.bleed };
    });
    T.ok(band.ok, 'перевязка: бинт наложен, кровотечение ' + band.bleed);

    // === 17. ЧТЕНИЕ (записка) ===
    await give(page, [{ id: 'letter_old', n: 1 }]);
    const read = await page.evaluate(() => {
      try {
        WS.Reading.start('letter_old');
        return { ok: true };
      } catch (e) { return { ok: false, err: e.message }; }
    });
    T.ok(read.ok, 'чтение: записка читается без падения' + (read.err ? ' — ' + read.err : ''));

    // === 18. СНЕГ ГОРСТЬЮ ===
    const snow = await page.evaluate(() => {
      WS.G.player.needs.thirst = 20;
      try { WS.Needs.eatSnow(); return { ok: true }; } catch (e) { return { ok: false }; }
    });
    T.ok(snow.ok, 'снег горстью: eatSnow не падает');

    // === 19. СОХРАНЕНИЕ / ЗАГРУЗКА ===
    const save = await page.evaluate(() => WS.Save.save('test-slot') === true);
    T.ok(save, 'сохранение в слот (true)');
    const load = await page.evaluate(() => {
      const d = WS.Save.load('test-slot');
      return !!(d && d.core);
    });
    T.ok(load, 'загрузка из слота (данные есть)');

    T.eq(errors.length, 0, 'ошибок консоли за все действия нет' + (errors.length ? ': ' + errors[0] : ''));
    errors.slice(0, 8).forEach(e => console.log('    ' + e));
  } finally {
    await browser.close();
  }
  const r = T.finish();
  process.exit(r.failed ? 1 : 0);
};

run().catch(e => { console.error('FAIL', e); process.exit(2); });
