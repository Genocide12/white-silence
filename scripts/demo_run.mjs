// Полный прогон демо-прохождения: клик по кнопке в меню → до победы/смерти.
// Скриншоты и журнал — в download/demo/.
import { createRequire } from 'module';
import { mkdirSync, writeFileSync } from 'fs';
const require = createRequire('/home/z/.npm-global/lib/node_modules/');
const { chromium } = require('playwright');

const BASE = process.argv[2] || 'http://localhost:3000';
const SPEED = parseInt(process.argv[3] || '60', 10);
const MAX_MIN = parseInt(process.argv[4] || '45', 10);
const OUT = '/home/z/my-project/download/demo';
mkdirSync(OUT, { recursive: true });

const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => {
    if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 300));
  });

  await page.goto(BASE, { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(3500);

  // 1) клик по кнопке «Демо» в меню — как это сделает пользователь
  const btn = page.locator('#ws-menu button', { hasText: 'Демо-прохождение' }).first();
  await btn.click();
  await page.waitForTimeout(2000);

  const started = await page.evaluate(() => !!(WS.Demo && WS.Demo.active()));
  console.log('ДЕМО ЗАПУЩЕНО КНОПКОЙ:', started);
  if (!started) {
    await page.screenshot({ path: `${OUT}/00-fail-start.png` });
    console.log('ERRORS:', errors.slice(0, 10));
    await browser.close();
    process.exit(1);
  }

  // 2) темп демо адаптивный — кнопки не трогаем

  // 3) ждать финала, снимая кадры и статистику
  const t0 = Date.now();
  const shots = [];
  let lastDay = 0;
  let result = '';
  while (Date.now() - t0 < MAX_MIN * 60000) {
    await page.waitForTimeout(15000);
    const st = await page.evaluate(() => {
      const G = WS.G;
      if (!G) return null;
      const p = G.player;
      return {
        day: WS.Time.day(), fmt: WS.Time.fmt(),
        px: +p.x.toFixed(1), py: +p.y.toFixed(1),
        hp: Math.round(p.hp), temp: +(p.temp || 37).toFixed(1),
        hunger: Math.round(p.needs.hunger), thirst: Math.round(p.needs.thirst),
        fatigue: Math.round(p.needs.fatigue), sanity: Math.round(p.needs.sanity),
        torches: WS.Inv.count('torch'), matches: WS.Inv.count('matches'),
        food: (() => { let n = 0; for (const it of p.inv) { const d = WS.Data.items[it.id]; if (d && d.cal > 0) n += it.count || 1; } return n; })(),
        dead: !!G.dead, running: G.running, demo: WS.Demo.active(),
        result: WS.Demo._state().result,
        action: WS.Demo._state().task ? (WS.Demo._state().task.type + ' ' + (WS.Demo._state().task.label || '')) : '-',
        fps: WS.Loop.fps()
      };
    });
    const mins = ((Date.now() - t0) / 60000).toFixed(1);
    console.log(`[${mins}м]`, JSON.stringify(st));
    if (st && st.day > lastDay) {
      lastDay = st.day;
    }
    // ключевые кадры
    const tag = st ? `d${st.day}-${st.fmt.replace(':', '').replace(' ', '')}` : 'x';
    if (shots.length < 14) {
      shots.push(tag);
      await page.screenshot({ path: `${OUT}/demo-${String(shots.length).padStart(2, '0')}-${tag}.png` });
    }
    if (st && (st.result === 'victory' || st.result === 'death' || st.dead)) {
      result = st.result || 'death';
      break;
    }
    if (st && !st.demo && !st.running) { result = 'stopped'; break; }
  }

  await page.screenshot({ path: `${OUT}/demo-final.png` });

  // 4) журнал демо
  const jr = await page.evaluate(() => WS.Demo.journalText());
  writeFileSync(`${OUT}/demo-journal.txt`, jr, 'utf8');
  console.log('\n===== РЕЗУЛЬТАТ:', result || 'TIMEOUT', '=====');
  console.log('Журнал сохранён:', `${OUT}/demo-journal.txt`);

  // 5) финальное состояние
  const fin = await page.evaluate(() => {
    const G = WS.G;
    return G ? {
      day: WS.Time.day(), stats: G.stats, inv: WS.Inv.snapshot().slots.filter(Boolean).length,
      story: WS.Story ? WS.Story.finalQuest() : null
    } : null;
  });
  console.log('ФИНАЛ:', JSON.stringify(fin, null, 1));
  console.log('\nОШИБКИ КОНСОЛИ (' + errors.length + '):');
  errors.slice(0, 15).forEach(e => console.log('  ' + e));

  await browser.close();
  process.exit(result === 'victory' ? 0 : 2);
};
run().catch(e => { console.error('RUN ERROR', e); process.exit(1); });
