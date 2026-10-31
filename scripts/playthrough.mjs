// playthrough.mjs — ЧЕСТНАЯ ЗАПИСЬ ПРОХОЖДЕНИЯ «Белого Безмолвия» по фазам.
//
// Прохождение длиннее лимита одного запуска, поэтому гоняется фазами:
//   фаза N: бот играет (кнопка «Демо», темп ×1) → сейв 'main' + журнал в
//           localStorage → дамп в download/playthrough/phase.json → выход
//   фаза N+1: страница → вернуть localStorage → WS.Main.loadGame() →
//           WS.Demo.resume(журнал) → бот продолжает теми же правилами
//
// ЧЕСТНОСТЬ: никакой раздачи предметов, бессмертия и читов — бот играет
// как в демо-режиме (CHEAT_TORCHES=false), темп ×1, все смерти/нужды честны.
//
// Выход: 0 — ПОБЕДА (пароход), 1 — смерть героя, 2 — бюджет фазы исчерпан
//        (продолжить следующей фазой), 3 — ошибка.
import { createRequire } from 'module';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';

const require = createRequire('/home/z/.npm-global/lib/node_modules/');
const { chromium } = require('playwright');

const BASE = process.argv[2] || 'http://localhost:3131';
const DIR = process.argv[3] || '/home/z/my-project/download/playthrough';
const BUDGET_S = parseInt(process.argv[4] || '480', 10);   // сек на фазу
const PHASE_FILE = path.join(DIR, 'phase.json');
const LS_FILE = path.join(DIR, 'localStorage.json');

mkdirSync(DIR, { recursive: true });

const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => {
    if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 200));
  });

  // --- восстановить localStorage прошлой фазы (если была) ---
  const isResume = existsSync(LS_FILE);
  await page.goto(BASE, { waitUntil: 'load', timeout: 45000 });
  if (isResume) {
    const dump = JSON.parse(readFileSync(LS_FILE, 'utf-8'));
    await page.evaluate((items) => {
      for (const k in items) localStorage.setItem(k, items[k]);
    }, dump);
    console.log('[фаза] localStorage восстановлен (' + Object.keys(dump).length + ' ключей)');
  }
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(4000);

  const meta = isResume && existsSync(PHASE_FILE)
    ? JSON.parse(readFileSync(PHASE_FILE, 'utf-8'))
    : { phase: 0, journal: [], startedAt: 0, startStamp: '', shotsDone: 0, melted: 0, huntsDone: 0, result: '' };
  meta.phase = (meta.phase || 0) + 1;
  console.log(`[фаза ${meta.phase}] ${isResume ? 'продолжение' : 'свежая партия'}, бюджет ${BUDGET_S}с`);

  // --- старт/возобновление ---
  if (!isResume) {
    // КАК ПОЛЬЗОВАТЕЛЬ: кнопка «▶ Демо-прохождение» в меню
    const btn = page.locator('#ws-menu button', { hasText: 'Демо-прохождение' }).first();
    await btn.click();
    await page.waitForTimeout(2000);
    await page.evaluate(() => WS.Demo.pace(1));
  } else {
    const resumed = await page.evaluate((m) => {
      const okLoad = WS.Main.loadGame();
      if (!okLoad) return { ok: false, why: 'loadGame вернул false' };
      const okRes = WS.Demo.resume({
        journal: m.journal || [],
        startedAt: m.startedAt || Date.now(),
        startStamp: m.startStamp || '',
        phase: m.phase,
        fallbackUsed: false,
        shotsDone: m.shotsDone || 0,
        melted: m.melted || 0,
        huntsDone: m.huntsDone || 0
      });
      return { ok: okRes, day: WS.Time ? WS.Time.day() : 0, why: okRes ? '' : 'resume вернул false' };
    }, meta);
    console.log('[фаза] resume:', JSON.stringify(resumed));
    if (!resumed.ok) {
      await browser.close();
      console.error('RESUME FAIL:', resumed.why);
      process.exit(3);
    }
    await page.evaluate(() => WS.Demo.pace(1));
  }

  const started = Date.now();
  let shotN = (meta.shotsDone || 0);
  let lastSnap = 0;
  let outcome = null;   // 'victory' | 'death'

  // --- игровой цикл фазы ---
  while (Date.now() - started < BUDGET_S * 1000) {
    await page.waitForTimeout(2000);
    const st = await page.evaluate(() => {
      const d = WS.Demo._state();
      return {
        active: d.active,
        result: d.result,
        running: !!(WS.G && WS.G.running),
        dead: !!(WS.G && WS.G.dead),
        day: WS.Time ? WS.Time.day() : 0,
        hour: WS.Time ? Math.round(WS.Time.hourF()) : 0,
        hp: WS.G && WS.G.player ? Math.round(WS.G.player.hp) : 0,
        temp: WS.G && WS.G.player ? Math.round((WS.G.player.temp || 0) * 10) / 10 : 0,
        journalLen: d.journal.length,
        torches: WS.Inv ? WS.Inv.count('torch') : 0,
        imps: WS.Imps ? WS.Imps.expelled() : 0,
        last: d.journal.length ? d.journal[d.journal.length - 1].txt.slice(0, 70) : ''
      };
    });

    // снимок каждые ~45 сек
    if (Date.now() - lastSnap > 45000) {
      lastSnap = Date.now();
      shotN++;
      await page.screenshot({ path: path.join(DIR, `day${String(st.day).padStart(2, '0')}-${String(shotN).padStart(3, '0')}.png`) });
    }

    // финалы
    if (st.result === 'victory' || (!st.running && st.dead)) outcome = 'victory-or-death';
    if (st.result === 'victory' || st.result === 'death') { outcome = st.result; break; }
    if (!st.active && st.result) { outcome = st.result; break; }

    // короткая сводка в консоль
    if (Math.random() < 0.2) {
      console.log(`  д${st.day} ${st.hour}ч hp=${st.hp} ${st.temp}° факелы=${st.torches} мульт=${st.imps} журн=${st.journalLen} | ${st.last}`);
    }
  }

  // --- сохранить состояние фазы ---
  const dump = await page.evaluate(() => {
    const out = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      out[k] = localStorage.getItem(k);
    }
    return out;
  });
  const stEnd = await page.evaluate(() => {
    const d = WS.Demo._state();
    return {
      result: d.result,
      journal: d.journal,
      startedAt: d.startedAt,
      startStamp: d.startStamp,
      shotsDone: shotCounterBrowser(),
      melted: d.melted,
      huntsDone: d.huntsDone,
      day: WS.Time ? WS.Time.day() : 0
    };
    function shotCounterBrowser() { return 0; }   // счётчик снимков ведёт раннер
  });
  // сейв игры (в localStorage — попадёт в дамп)
  await page.evaluate(() => {
    try { WS.Save.save('main'); } catch (e) { /* пусто */ }
  });

  meta.shotsDone = shotN;
  meta.journal = stEnd.journal;
  meta.startedAt = stEnd.startedAt;
  meta.startStamp = stEnd.startStamp;
  meta.melted = stEnd.melted;
  meta.huntsDone = stEnd.huntsDone;
  meta.result = stEnd.result || meta.result || '';
  meta.day = stEnd.day;
  writeFileSync(PHASE_FILE, JSON.stringify(meta), 'utf-8');
  writeFileSync(LS_FILE, JSON.stringify(dump), 'utf-8');
  await page.screenshot({ path: path.join(DIR, `phase${meta.phase}-end.png`) });

  console.log(`[фаза ${meta.phase}] итог: день ${stEnd.day}, журнал ${stEnd.journal.length} строк, ошибок ${errors.length}`);
  console.log('    последние: ' + (stEnd.journal.slice(-3).map(j => j.txt.slice(0, 60)).join(' | ')));
  if (errors.length) errors.slice(0, 5).forEach(e => console.log('    ' + e));

  await browser.close();

  if (outcome === 'victory' || meta.result === 'victory') {
    // ФИНАЛ: полный журнал в .txt
    const text = await (async () => {
      // journalText в контексте страницы уже недоступен — соберём из meta
      const lines = [];
      lines.push('БЕЛОЕ БЕЗМОЛВИЕ — ЧЕСТНОЕ ПРОХОЖДЕНИЕ (запись демо)');
      lines.push('======================================');
      lines.push('Профессия: телеграфист · зерно мира: 1917 · темп: ×1 (честный)');
      lines.push('Фаз записи: ' + meta.phase + ' · дней пройдено: ' + meta.day + '/60');
      lines.push('');
      for (const j of meta.journal) lines.push('[' + j.t + '] ' + j.txt);
      return lines.join('\n');
    })();
    writeFileSync(path.join(DIR, 'ПРОХОЖДЕНИЕ-полный-журнал.txt'), text, 'utf-8');
    console.log('★ ПОБЕДА! Журнал: ' + path.join(DIR, 'ПРОХОЖДЕНИЕ-полный-журнал.txt'));
    process.exit(0);
  }
  if (outcome === 'death' || meta.result === 'death') {
    console.log('✝ Герой погиб на записи. Смотри журнал фазы.');
    process.exit(1);
  }
  console.log('[фаза] бюджет исчерпан — продолжить следующей фазой (exit 2)');
  process.exit(2);
};

run().catch(e => { console.error('FAIL', e); process.exit(3); });
