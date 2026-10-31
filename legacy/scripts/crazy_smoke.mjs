// Смоук-тест «Безумного Деда»: загрузка, старт демо, замеры механик.
import { createRequire } from 'module';
const require = createRequire('/home/z/.npm-global/lib/node_modules/');
const { chromium } = require('playwright');

const run = async () => {
  const browser = await chromium.launchPersistentContext('/tmp/ws-crazy-smoke', {
    viewport: { width: 1600, height: 900 }, args: ['--disable-dev-shm-usage']
  });
  const page = browser.pages()[0] || await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 300)); });
  page.on('dialog', d => d.accept().catch(() => {}));

  await page.goto('http://localhost:3000', { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(3000);

  // есть ли режим в WS
  const hasCrazy = await page.evaluate(() => !!(WS.Crazy && WS.Crazy.active));
  console.log('Crazy-модуль загружен:', hasCrazy);

  // стартуем демо кнопкой
  await page.locator('#ws-menu button', { hasText: 'Демо-прохождение' }).first().click();
  await page.waitForTimeout(5000);

  const st1 = await page.evaluate(() => {
    const g = WS.G, p = g && g.player, st = WS.Crazy.state();
    return {
      running: g && g.running,
      needs: p ? { h: p.needs.hunger, t: p.needs.thirst, f: p.needs.fatigue } : null,
      temp: p ? p.temp : null,
      hp: p ? +p.hp.toFixed(1) : null,
      energy: st ? +st.energy.toFixed(1) : null,
      panel: !!document.getElementById('ws-crazy'),
      day: WS.Time.day(), tm: WS.Time.totalMin()
    };
  });
  console.log('СТАРТ:', JSON.stringify(st1));

  // ждём 40 сек реального — демо должно жить, ХП-часы тикают, нужды заморожены
  await page.waitForTimeout(40000);
  const st2 = await page.evaluate(() => {
    const g = WS.G, p = g && g.player, st = WS.Crazy.state();
    return {
      dead: g && g.dead,
      needs: p ? { h: +p.needs.hunger.toFixed(1), t: +p.needs.thirst.toFixed(1), f: +p.needs.fatigue.toFixed(1) } : null,
      temp: p ? p.temp : null,
      hp: p ? +p.hp.toFixed(2) : null,
      energy: st ? +st.energy.toFixed(1) : null,
      day: WS.Time.day(), fmt: WS.Time.fmt(),
      banished: st ? st.banished : null,
      action: WS.Demo._state().task ? WS.Demo._state().task.type : '-',
      px: p ? +p.x.toFixed(1) : null, py: p ? +p.y.toFixed(1) : null
    };
  });
  console.log('ЧЕРЕЗ 40с:', JSON.stringify(st2));

  // тест изгнания: создаём волка рядом и изгоняем вантузом
  const banishTest = await page.evaluate(() => {
    const p = WS.G.player;
    // вручную добавим волчью сущность (kill-путь только ищет kind/hp)
    const w = { kind: 'wolf', id: 'testwolf', x: p.x + 2, y: p.y, hp: 45, maxHp: 45, dir: 4 };
    WS.World.addEnt(w);
    const before = WS.Crazy.state().banished;
    WS.Inv.give('plunger_magic', 1);
    try { WS.Action.equipBest(); } catch (e) { /* пусто */ }
    WS.AI.damageEnt(w, 999, p, {});
    return {
      spawned: true,
      before: before,
      after: WS.Crazy.state().banished,
      gift: WS.World.objects.some(o => o.sprName === 'crazy_gift'),
      energy: +WS.Crazy.state().energy.toFixed(1),
      gifts: WS.World.objects.filter(o => o.sprName === 'crazy_gift').length
    };
  });
  console.log('ИЗГНАНИЕ:', JSON.stringify(banishTest));

  // тест ХП-часов: сон не лечит, дренаж тикает (крутим время на час)
  const drainTest = await page.evaluate(() => {
    const st = WS.Crazy.state();
    const p = WS.G.player;
    const hp0 = st.hpShadow;
    // симулируем 3 игровых часа дренирования напрямую (как тик, но сразу)
    const dm = 180;
    st.hpShadow -= 100 / (60 * 1440) * dm * WS.Crazy.drainMul();
    p.hp = st.hpShadow;
    // теперь «сон»: health отрегенерил бы — имитируем кадр pre/post
    p.hp = hp0;                 // health прибавил (регенерация)
    // postTick на следующем кадре проигнорирует + и вернёт тень:
    return { hpBefore: +hp0.toFixed(2), hpAfterDrain: +st.hpShadow.toFixed(2) };
  });
  console.log('ХП-ЧАСЫ:', JSON.stringify(drainTest));
  // вернуть честное состояние: перечитаем тень в p.hp через кадр
  await page.waitForTimeout(1200);
  const drainReal = await page.evaluate(() => {
    const st = WS.Crazy.state();
    return { shadow: +st.hpShadow.toFixed(2), hp: +WS.G.player.hp.toFixed(2) };
  });
  console.log('ХП-ЧАСЫ (после кадра):', JSON.stringify(drainReal));

  // тест прикорнутья: убиваем деда
  const respawnTest = await page.evaluate(() => {
    const g = WS.G, p = g.player;
    const before = WS.Crazy.state().respawns;
    p.hp = 1;
    WS.Health.damagePlayer ? WS.Health.damagePlayer(50, 'bite') : (p.hp = 0, WS.Main.die('тест'));
    return {
      respawnsBefore: before,
      respawnsAfter: WS.Crazy.state().respawns,
      dead: g.dead,
      running: g.running,
      hp: +p.hp.toFixed(1),
      maxHp: p.maxHp
    };
  });
  console.log('ПРИКОРНУТЬЕ:', JSON.stringify(respawnTest));

  // тест косяка
  const jointTest = await page.evaluate(() => {
    const p = WS.G.player;
    p.hp = 20;
    WS.Inv.give('joint_ded', 1);
    const r = WS.Health.useMed('joint_ded');
    return { used: r, hp: +p.hp.toFixed(1), highT: +WS.Crazy.state().highT.toFixed(1), rainbow: document.body.classList.contains('crazy-high') };
  });
  console.log('КОСЯК:', JSON.stringify(jointTest));

  // тест древа
  const treeTest = await page.evaluate(() => {
    const st = WS.Crazy.state();
    st.energy = 50;
    const r1 = WS.Crazy.spend('speed');
    const r2 = WS.Crazy.spend('organs');
    const r3 = WS.Crazy.spend('plunger');
    const bad = WS.Crazy.spend('nope');
    WS.TreeScreen.show();
    const visible = !document.getElementById('ws-tree').classList.contains('hidden');
    const nodes = document.querySelectorAll('.wt-node').length;
    WS.TreeScreen.hide();
    return { r1, r2, r3, bad, visible, nodes, energyLeft: +st.energy.toFixed(1),
             speedLv: WS.Crazy.lv('speed'), drainMul: +WS.Crazy.drainMul().toFixed(2) };
  });
  console.log('ДРЕВО:', JSON.stringify(treeTest));

  // прогресс демо: журнал последних записей
  const jr = await page.evaluate(() => WS.Demo.journalText().split('\n').slice(-6).join('\n'));
  console.log('ЖУРНАЛ (конец):\n' + jr);

  console.log('\nОШИБКИ (' + errors.length + '):');
  errors.slice(0, 12).forEach(e => console.log('  ' + e));
  await page.screenshot({ path: '/home/z/my-project/download/demo/crazy-smoke.png' });
  await browser.close();
};
run().catch(e => { console.error('RUN ERROR', e); process.exit(1); });
