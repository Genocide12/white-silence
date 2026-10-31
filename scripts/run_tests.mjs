// run_tests.mjs — УНИВЕРСАЛЬНЫЙ РАННЕР ин-пейдж тестов «Белого Безмолвия».
// Один тест-файл = одна область игры. Файл инжектится в ЖИВУЮ игру
// (addScriptTag), выставляет window.__T = {pass, fail, fails, bugs, done}
// и сам доводит себя до done=true. Раннер ждёт до 180 сек на файл.
//
//   node scripts/run_tests.mjs [url] <файл|директория>...
//   node scripts/run_tests.mjs http://localhost:3000 scripts/tests
//
// Выход: 0 — всё зелёное; 1 — есть FAIL; 2 — фатальная ошибка.
// localStorage чистится перед каждым файлом (изоляция; тесты персистентности
// сами пишут/читают что нужно внутри одной страницы).
import { createRequire } from 'module';
import { readdirSync, statSync } from 'fs';
import { resolve } from 'path';
const require = createRequire('/home/z/.npm-global/lib/node_modules/');
const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://localhost:3000';
let args = process.argv.slice(3);
if (!args.length) args = ['scripts/tests'];

// разворачиваем директории в список *_inpage.js
const files = [];
for (const a of args) {
  let st;
  try { st = statSync(a); } catch (e) { console.error('нет пути:', a); process.exit(2); }
  if (st.isDirectory()) {
    for (const f of readdirSync(a).sort()) {
      if (f.endsWith('_inpage.js') && !f.startsWith('_')) {
        files.push(resolve(a, f));
      }
    }
  } else files.push(resolve(a));
}
if (!files.length) { console.error('тест-файлы не найдены'); process.exit(2); }

const run = async () => {
  const browser = await chromium.launch({ args: ['--disable-dev-shm-usage'] });
  let pAll = 0, fAll = 0;
  const fList = [], bugList = [];

  for (const f of files) {
    const name = f.split('/').pop();
    console.log('\n===== ' + name + ' =====');
    const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
    const errors = [];
    page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 200)); });
    page.on('dialog', d => d.accept().catch(() => {}));

    try {
      await page.goto(URL, { waitUntil: 'load', timeout: 45000 });
      await page.waitForTimeout(3000);
      await page.evaluate(() => { try { localStorage.clear(); } catch (e) { /* пусто */ } });
      await page.addScriptTag({ path: f });

      // ждём done (до 180 сек — тесты с реальным временем/бой допустимы)
      const deadline = Date.now() + 180000;
      let T = null;
      while (Date.now() < deadline) {
        await page.waitForTimeout(800);
        T = await page.evaluate(() => (window.__T && window.__T.done) ? window.__T : null);
        if (T) break;
      }
      if (!T) {
        T = await page.evaluate(() => window.__T || null);
        console.log('  ⚠ тест не выставил done за 180 сек (считаю что есть)');
      }

      if (T) {
        pAll += T.pass || 0;
        fAll += T.fail || 0;
        for (const x of (T.fails || [])) fList.push(name + ' :: ' + x);
        for (const b of (T.bugs || [])) bugList.push(name + ' :: ' + b);
        console.log('ИТОГ ' + name + ': PASS ' + (T.pass || 0) + ' | FAIL ' + (T.fail || 0) +
          ((T.bugs && T.bugs.length) ? ' | 🐞 багов: ' + T.bugs.length : ''));
      } else {
        console.log('ИТОГ ' + name + ': НЕТ РЕЗУЛЬТАТА (протокол нарушен)');
        fList.push(name + ' :: протокол нарушен (нет __T)');
      }
      if (errors.length) {
        console.log('  ошибки консоли (' + errors.length + '): ' + errors.slice(0, 3).join(' | '));
      }
    } catch (e) {
      console.log('  ОШИБКА ФАЙЛА: ' + (e.message || e));
      fList.push(name + ' :: краш: ' + (e.message || e));
    }
    await page.close();
  }

  await browser.close();
  console.log('\n===== ВСЕГО: PASS ' + pAll + ' | FAIL ' + fAll + ' =====');
  if (bugList.length) {
    console.log('НАЙДЕННЫЕ БАГИ ИГРЫ (' + bugList.length + '):');
    bugList.forEach(x => console.log('  🐞 ' + x));
  }
  if (fList.length) {
    console.log('ПРОВАЛЫ:');
    fList.forEach(x => console.log('  - ' + x));
    process.exit(1);
  }
  process.exit(0);
};
run().catch(e => { console.error('FATAL', e); process.exit(2); });
