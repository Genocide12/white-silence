// diag_stuck.mjs — поймать бездействие бота на Д15-Д17 (голодная смерть
// при молчащем журнале). Темп ×30 (диагностика, не запись прохождения).
import { createRequire } from 'module';
const require = createRequire('/home/z/.npm-global/lib/node_modules/');
const { chromium } = require('playwright');

const BASE = process.argv[2] || 'http://localhost:3140';
const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  await page.goto(BASE, { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(3500);

  // старт демо как пользователь + темп ×30
  const btn = page.locator('#ws-menu button', { hasText: 'Демо-прохождение' }).first();
  await btn.click();
  await page.waitForTimeout(2000);
  await page.evaluate(() => WS.Demo.pace(30));

  const t0 = Date.now();
  let lastSig = '';
  let sameCnt = 0;
  while (Date.now() - t0 < 300000) {
    await page.waitForTimeout(4000);
    const st = await page.evaluate(() => {
      const d = WS.Demo._state();
      const p = WS.G && WS.G.player;
      const w = WS.World;
      return {
        day: WS.Time ? WS.Time.day() : 0,
        hour: Math.round(WS.Time.hourF() * 10) / 10,
        hp: p ? Math.round(p.hp) : 0,
        hun: p ? Math.round(p.needs.hunger) : -1,
        thi: p ? Math.round(p.needs.thirst) : -1,
        fat: p ? Math.round(p.needs.fatigue) : -1,
        temp: p ? Math.round((p.temp || 0) * 10) / 10 : 0,
        sleep: p ? !!p.sleeping : false,
        faint: p ? (p._faintT || 0) > 0 : false,
        dead: !!(WS.G && WS.G.dead),
        task: d.task ? (d.task.type + (d.task.label ? ':' + d.task.label : '')) : '—',
        planLen: d.plan ? d.plan.length : 0,
        speed: d.curSpeed || 0,
        x: p ? Math.round(p.x) : 0, y: p ? Math.round(p.y) : 0,
        inside: w && w.isInside && p ? !!w.isInside(p.x, p.y) : false,
        food: (() => { let n = 0; if (p) for (const it of p.inv) { const def = WS.Data.items[it.id]; if (def && (def.cal || 0) > 0) n += it.count || 1; } return n; })(),
        last: d.journal.length ? d.journal[d.journal.length - 1].txt.slice(0, 50) : ''
      };
    });
    const sig = `${st.day}|${st.hour}|${st.task}|${st.x},${st.y}|${st.sleep}`;
    if (sig === lastSig) sameCnt++; else { sameCnt = 0; lastSig = sig; }
    console.log(`д${st.day} ${st.hour}ч hp=${st.hp} еда=${st.hun}/${st.thi}/${st.fat} т=${st.temp}° ` +
      `спит=${st.sleep ? 1 : 0} обм=${st.faint ? 1 : 0} едаΣ=${st.food} скор=${st.speed} ` +
      `задача=${st.task} план=${st.planLen} поз=${st.x},${st.y}${st.inside ? ' (дом)' : ''} повт=${sameCnt}`);
    if (st.dead) { console.log('✝ УМЕР: ' + st.last); const jl = await page.evaluate(() => WS.Demo._state().journal.slice(-12).map(j => j.t + ' ' + j.txt.slice(0,70))); jl.forEach(l => console.log('   ' + l)); break; }
    if (st.day >= 18) { console.log('→ Д18, дальше не нужно'); break; }
  }
  console.log('ошибок: ' + errors.length);
  errors.slice(0, 5).forEach(e => console.log('  ' + e));
  await browser.close();
};
run().catch(e => { console.error('FAIL', e); process.exit(2); });
