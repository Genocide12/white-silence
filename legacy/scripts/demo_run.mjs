// Полный прогон демо-прохождения: клик по кнопке в меню → до победы/смерти.
// ЧАНКОВЫЙ РЕЖИМ: прогресс демо хранится в демо-слоте (localStorage),
// профиль браузера персистентен (/tmp/ws-demo-profile) — прогон можно
// продолжать следующими запусками до самой победы.
//
//   node scripts/demo_run.mjs [baseUrl] [минут_чанка] [меткаЧанка] [темп]
//
// темп (1..8, дефолт 1) — как кнопки ×1…×8 у игрока: пропорционально
// ускоряет И часы, И движение (честное соотношение сохраняется).
// Дефолт ×1 — честные часы; верификационные прогоны можно гнать быстрее.
//
// Выход: 0 — победа (пароход), 2 — смерть, 3 — чанк исчерпан (продолжай
// следующим запуском), 4 — демо зависло, 1 — ошибка запуска.
import { createRequire } from 'module';
import { mkdirSync, writeFileSync, appendFileSync } from 'fs';
const require = createRequire('/home/z/.npm-global/lib/node_modules/');
const { chromium } = require('playwright');

const BASE = process.argv[2] || 'http://localhost:3000';
const MINUTES = parseFloat(process.argv[3] || '8');
const TAG = process.argv[4] || 'a';
const PROFILE = '/tmp/ws-demo-profile';
const OUT = '/home/z/my-project/download/demo';
mkdirSync(OUT, { recursive: true });

const run = async () => {
  const browser = await chromium.launchPersistentContext(PROFILE, {
    viewport: { width: 1600, height: 900 },
    args: ['--disable-dev-shm-usage']
  });
  const page = browser.pages()[0] || await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => {
    if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 300));
  });
  // подтверждение «Продолжить демо?» — принимаем (чанк-режим)
  page.on('dialog', d => { d.accept().catch(() => {}); });

  await page.goto(BASE, { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(3500);

  // 1) клик по кнопке «Демо» в меню — как это сделает пользователь
  const btn = page.locator('#ws-menu button', { hasText: 'Демо-прохождение' }).first();
  await btn.click();
  await page.waitForTimeout(2500);

  const started = await page.evaluate(() => !!(WS.Demo && WS.Demo.active()));
  console.log('ДЕМО ЗАПУЩЕНО КНОПКОЙ:', started);
  if (!started) {
    await page.screenshot({ path: `${OUT}/fail-start.png` });
    console.log('ERRORS:', errors.slice(0, 10));
    await browser.close();
    process.exit(1);
  }
  const resumed = await page.evaluate(() => WS.Demo._state().resumedFrom || 0);
  if (resumed) console.log('ПРОДОЛЖЕНИЕ с дня', resumed);

  // темп демо (пропорциональное ускорение всего — как Space у игрока)
  const PACE = Math.max(1, Math.min(8, parseInt(process.argv[5] || '1', 10) || 1));
  if (PACE > 1) {
    await page.evaluate((n) => WS.Demo.setPace(n), PACE);
    console.log('ТЕМП ДЕМО: ×' + PACE + ' (часы и ходьба ускорены пропорционально)');
  }

  // 2) ждать финала, снимая кадры и статистику
  const t0 = Date.now();
  let shots = 0;
  let lastDayShot = 0;
  let result = '';
  let prevGameMin = -1;
  let stagnantSamples = 0;
  while (Date.now() - t0 < MINUTES * 60000) {
    await page.waitForTimeout(15000);
    const st = await page.evaluate(() => {
      const G = WS.G;
      if (!G) return null;
      const p = G.player;
      const D = WS.Demo._state();
      let modal = '-', screens = '-';
      try {
        modal = WS.Ui.modal() ? 'ДА' : 'нет';
        const sl = [];
        document.querySelectorAll('#ui-root .ws-modal, #ui-root .ws-screen:not(.hidden)').forEach(el => sl.push(el.id || el.className.split(' ')[0]));
        screens = sl.slice(0, 4).join(',') || '-';
      } catch (e) { /* пусто */ }
      return {
        day: WS.Time.day(), fmt: WS.Time.fmt(),
        gameMin: WS.Time.day() * 1440 + Math.floor(WS.Time.hour() * 60),
        px: +p.x.toFixed(1), py: +p.y.toFixed(1),
        hp: Math.round(p.hp), temp: +(p.temp || 37).toFixed(1),
        hunger: Math.round(p.needs.hunger), thirst: Math.round(p.needs.thirst),
        fatigue: Math.round(p.needs.fatigue),
        torches: WS.Inv.count('torch'), matches: WS.Inv.count('matches'),
        dead: !!G.dead, running: G.running, demo: WS.Demo.active(),
        result: D.result, phase: D.phase, resumed: D.resumedFrom,
        speed: D.curSpeed, modal, screens,
        action: D.task ? (D.task.type + ' ' + (D.task.label || '')) : '-',
        journal: D.journal.slice(-2).map(j => j.t + ' ' + j.txt),
        fps: WS.Loop.fps(),
        demoSave: !!(WS.Save && WS.Save.exists && WS.Save.exists('demo'))
      };
    });
    const mins = ((Date.now() - t0) / 60000).toFixed(1);
    if (!st) { console.log(`[${mins}м] G=null`); continue; }
    console.log(`[${mins}м] д${st.day} ${st.fmt} x${st.speed} fps:${st.fps} hp:${st.hp} T:${st.temp} гол:${st.hunger} жаж:${st.thirst} уст:${st.fatigue} фак:${st.torches} мод:${st.modal}[${st.screens}] дело:${st.action}`);
    st.journal.forEach(j => console.log('   | ' + j));
    // прогресс-чек: игровое время должно идти
    if (st.gameMin === prevGameMin && st.demo && st.running) stagnantSamples++;
    else stagnantSamples = 0;
    prevGameMin = st.gameMin;
    // ключевые кадры: каждый 5-й день + первый
    if ((st.day > lastDayShot && st.day % 5 === 0) || (shots === 0)) {
      if (st.day >= lastDayShot) {
        lastDayShot = st.day % 5 === 0 ? st.day : lastDayShot;
        shots++;
        await page.screenshot({ path: `${OUT}/chunk-${TAG}-d${st.day}.png` });
      }
    }
    if (st.result === 'victory' || st.result === 'death' || st.dead) {
      result = st.result || 'death';
      break;
    }
    if (!st.demo && !st.running) { result = 'stopped'; break; }
    if (stagnantSamples >= 10) { result = 'stuck'; break; }   // 2.5 мин без хода часов
  }

  await page.screenshot({ path: `${OUT}/chunk-${TAG}-end.png` });

  // 3) зафиксировать прогресс: демо-слот + журнал
  await page.evaluate(() => {
    try { if (WS.Save && WS.Save.save && WS.G && WS.G.running) WS.Save.save('demo'); } catch (e) { /* пусто */ }
  });
  const jr = await page.evaluate(() => WS.Demo.journalText());
  writeFileSync(`${OUT}/demo-journal.txt`, jr, 'utf8');
  appendFileSync(`${OUT}/demo-progress.log`,
    `[chunk ${TAG}] ${(MINUTES)}мин → ${result || 'timeout'} · ${new Date().toISOString()}\n`, 'utf8');
  console.log('\n===== РЕЗУЛЬТАТ ЧАНКА:', result || 'TIMEOUT', '=====');
  console.log('Журнал сохранён:', `${OUT}/demo-journal.txt`);

  console.log('\nОШИБКИ КОНСОЛИ (' + errors.length + '):');
  errors.slice(0, 15).forEach(e => console.log('  ' + e));
  await browser.close();

  process.exit(result === 'victory' ? 0 :
               result === 'death' ? 2 :
               result === 'stuck' ? 4 :
               result === 'stopped' ? 5 : 3);
};
run().catch(e => { console.error('RUN ERROR', e); process.exit(1); });
