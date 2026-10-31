// Проба демо: замер фактического темпа симуляции (игровых минут за реальную минуту),
// поведение бота, ошибки. Короткий прогон ~4 минуты.
import { createRequire } from 'module';
const require = createRequire('/home/z/.npm-global/lib/node_modules/');
const { chromium } = require('playwright');

const BASE = process.argv[2] || 'http://localhost:3000';
const PACE = parseInt(process.argv[3] || '2', 10);
const MINUTES = parseInt(process.argv[4] || '4', 10);

const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 200)); });

  await page.goto(BASE, { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(3500);

  const btn = page.locator('#ws-menu button', { hasText: 'Демо-прохождение' }).first();
  await btn.click();
  await page.waitForTimeout(1500);

  const started = await page.evaluate(() => !!(WS.Demo && WS.Demo.active()));
  console.log('ДЕМО СТАРТ:', started);
  if (!started) {
    await page.screenshot({ path: '/tmp/demo-probe-fail.png' });
    console.log('ERRORS:', errors.slice(0, 10));
    await browser.close(); process.exit(1);
  }

  // темп — через отладочный API (как кнопку ×2 в панели)
  await page.evaluate((p) => { WS.Demo._state().pace = p; }, PACE);

  const t0 = Date.now();
  let prevSteps = 0, prevDayMin = 0;
  const samples = [];
  while (Date.now() - t0 < MINUTES * 60000) {
    await page.waitForTimeout(20000);
    const st = await page.evaluate(() => {
      const G = WS.G; if (!G) return null;
      const p = G.player; const D = WS.Demo._state();
      return {
        day: WS.Time.day(), hour: WS.Time.fmt(),
        gameMin: WS.Time.day() * 1440 + Math.floor(WS.Time.hour() * 60),
        steps: WS.Loop.stepsRun, fps: WS.Loop.fps(),
        px: +p.x.toFixed(1), py: +p.y.toFixed(1),
        dBed: (D.base && D.base.bed) ? +Math.hypot(p.x - D.base.bed.x, p.y - D.base.bed.y).toFixed(1) : -1,
        pathLen: D.path.length, planLen: D.plan.length,
        hp: Math.round(p.hp), temp: +(p.temp || 37).toFixed(1),
        hunger: Math.round(p.needs.hunger), thirst: Math.round(p.needs.thirst),
        fatigue: Math.round(p.needs.fatigue),
        sleeping: !!p.sleeping, faint: Math.round(p._faintT || 0),
        dead: !!G.dead,
        result: D.result,
        phase: D.phase,
        task: D.task ? (D.task.type + ' ' + (D.task.label || '')) : '-',
        curSpeed: D.curSpeed,
        journal: D.journal.slice(-3).map(j => j.t + ' ' + j.txt)
      };
    });
    if (!st) { console.log('G is null'); break; }
    const mins = ((Date.now() - t0) / 60000).toFixed(1);
    const dSteps = st.steps - prevSteps; prevSteps = st.steps;
    const dGame = st.gameMin - prevDayMin; prevDayMin = st.gameMin;
    const rate = (dGame / (dSteps / 60)).toFixed(1); // игровых мин на 60 шагов
    samples.push({ mins, ...st, dSteps, dGame });
    console.log(`[${mins}м] д${st.day} ${st.hour} x${st.curSpeed} fps:${st.fps} @${st.px},${st.py} кров:${st.dBed} пут:${st.pathLen} пла:${st.planLen} hp:${st.hp} T:${st.temp} гол:${st.hunger} жаж:${st.thirst} уст:${st.fatigue} спит:${st.sleeping ? 1 : 0} обм:${st.faint} дело:${st.task}`);
    st.journal.forEach(j => console.log('   | ' + j));
    if (st.dead || st.result) { console.log('ФИНАЛ:', st.result || 'death'); break; }
  }

  console.log('\nОШИБКИ (' + errors.length + '):');
  errors.slice(0, 12).forEach(e => console.log('  ' + e));

  // полный журнал + состояние мира для разбора
  const full = await page.evaluate(() => {
    const D = WS.Demo._state();
    const p = WS.G && WS.G.player;
    return {
      journal: D.journal.map(j => `[${j.t}] ${j.txt}`),
      base: D.base ? { id: D.base.id, type: D.base.type, heated: D.base.heated,
        hasStove: !!D.base.stove, hasBed: !!D.base.bed, x: D.base.x, y: D.base.y } : null,
      wood: WS.Inv.count('firewood_bundle') + WS.Inv.count('plank') + WS.Inv.count('log'),
      matches: WS.Inv.count('matches'),
      clothes: p && p.equip ? Object.keys(p.equip).filter(k => p.equip[k]).map(k => k + ':' + p.equip[k].id) : [],
      warm: (() => { try { return WS.Temp ? WS.Temp.debug && WS.Temp.debug() : null; } catch (e) { return 'n/a'; } })(),
      clothWarm: (() => { try { return WS.Temp && WS.Temp.clothing ? WS.Temp.clothing(p).warm : null; } catch (e) { return 'n/a'; } })()
    };
  });
  console.log('\n===== БАЗА:', JSON.stringify(full.base));
  console.log('===== ДРОВА:', full.wood, '· СПИЧКИ:', full.matches,
    '· ТЕПЛО ОДЕЖДЫ:', full.clothWarm);
  console.log('===== ОДЕЖДА:', full.clothes.join(', '));
  console.log('\n===== ПОЛНЫЙ ЖУРНАЛ (' + full.journal.length + ') =====');
  full.journal.forEach(l => console.log(l));
  await browser.close();
};
run().catch(e => { console.error('RUN ERROR', e); process.exit(1); });
