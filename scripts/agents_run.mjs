// agents_run.mjs — РОЙ ПАРАЛЛЕЛЬНЫХ АГЕНТОВ-ПЛЕЙТЕСТЕРОВ «Белого Безмолвия».
//
// Инкрементальный цикл разработки:
//   1) K браузеров ОДНОВРЕМЕННО играют демо-автопилотом (честный темп ×1),
//      каждый — своей профессией в своём мире (отдельный localStorage).
//   2) По исчерпании бюджета каждый агент сохраняет партию + журнал в
//      download/agents/<имя>/ — следующий запуск ПРОДОЛЖАЕТ с того же места.
//   3) Агент, погибший или победивший, стартует заново (свежая партия).
//
// Смерть/победа/ошибки пишутся в report.json каждого агента — внешний
// аналитик (я) читает их, чинит игру, и цикл повторяется: агенты доходят
// всё дальше с каждым инкрементом.
//
// Использование: node scripts/agents_run.mjs [база] [бюджет_сек] [имена_через_запятую]
import { createRequire } from 'module';
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync } from 'fs';
import path from 'path';

const require = createRequire('/home/z/.npm-global/lib/node_modules/');
const { chromium } = require('playwright');

const BASE = process.argv[2] || 'http://localhost:3140';
const BUDGET_S = parseInt(process.argv[3] || '380', 10);
const DIR = '/home/z/my-project/download/agents';

// стартовый состав роя: разные профессии, разные миры
const ROSTER = [
  { name: 'A1-telegraph', prof: 'telegraph', seed: 1917 },
  { name: 'A2-hunter',    prof: 'hunter',    seed: 1917 },
  { name: 'A3-carpenter', prof: 'carpenter', seed: 1917 }
];

/** Один агент: свой браузер, свой localStorage, свой отчёт. */
async function runAgent(agent, idx) {
  const aDir = path.join(DIR, agent.name);
  mkdirSync(aDir, { recursive: true });
  const lsFile = path.join(aDir, 'localStorage.json');
  const metaFile = path.join(aDir, 'meta.json');
  const report = {
    agent: agent.name, prof: agent.prof, seed: agent.seed,
    startedAt: new Date().toISOString(), budgetS: BUDGET_S,
    resumed: false, result: '', errors: [], timeline: [], journalTail: []
  };

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.on('pageerror', e => report.errors.push('PAGEERROR: ' + e.message.slice(0, 160)));
    page.on('console', m => {
      if (m.type() === 'error') report.errors.push('CONSOLE: ' + m.text().slice(0, 160));
    });

    await page.goto(BASE, { waitUntil: 'load', timeout: 45000 });
    await page.waitForTimeout(3000);

    // --- продолжение или свежая партия ---
    if (existsSync(lsFile) && existsSync(metaFile)) {
      const dump = JSON.parse(readFileSync(lsFile, 'utf-8'));
      await page.evaluate(items => {
        for (const k in items) localStorage.setItem(k, items[k]);
      }, dump);
      await page.reload({ waitUntil: 'load' });
      await page.waitForTimeout(3500);
      const meta = JSON.parse(readFileSync(metaFile, 'utf-8'));
      const ok = await page.evaluate(m => {
        if (!WS.Main.loadGame()) return false;
        return WS.Demo.resume({
          journal: m.journal || [], startedAt: m.startedAt || Date.now(),
          startStamp: m.startStamp || '', phase: m.phase || 1,
          shotsDone: m.shotsDone || 0, melted: m.melted || 0, huntsDone: m.huntsDone || 0
        });
      }, meta).catch(() => false);
      if (ok) {
        report.resumed = true;
        await page.evaluate(() => WS.Demo.pace(1));
      } else {
        // сейв битый — свежая партия
        await page.evaluate(a => WS.Demo.start({ prof: a.prof, seed: a.seed }), agent);
        await page.waitForTimeout(1500);
      }
    } else {
      const ok = await page.evaluate(a => WS.Demo.start({ prof: a.prof, seed: a.seed }), agent);
      if (!ok) { report.result = 'start-fail'; writeReport(agent, report, aDir); await browser.close(); return; }
      await page.waitForTimeout(1500);
      await page.evaluate(() => WS.Demo.pace(1));
    }

    // --- игровой цикл агента ---
    const t0 = Date.now();
    let lastSnap = 0;
    while (Date.now() - t0 < BUDGET_S * 1000) {
      await page.waitForTimeout(2500);
      const st = await page.evaluate(() => {
        const d = WS.Demo._state();
        const p = WS.G && WS.G.player;
        let food = 0;
        if (p) for (const it of p.inv) {
          const def = WS.Data.items && WS.Data.items[it.id];
          if (def && (def.cal || 0) > 0) food += it.count || 1;
        }
        return {
          active: d.active, result: d.result,
          dead: !!(WS.G && WS.G.dead),
          day: WS.Time ? WS.Time.day() : 0,
          hour: Math.round(WS.Time.hourF() * 10) / 10,
          hp: p ? Math.round(p.hp) : 0,
          temp: p ? Math.round((p.temp || 0) * 10) / 10 : 0,
          hunger: p ? Math.round(p.needs.hunger) : -1,
          thirst: p ? Math.round(p.needs.thirst) : -1,
          fatigue: p ? Math.round(p.needs.fatigue) : -1,
          food, water: WS.Inv ? WS.Inv.count('water_flask') : 0,
          torches: WS.Inv ? WS.Inv.count('torch') : 0,
          imps: WS.Imps ? WS.Imps.expelled() : 0,
          task: d.task ? d.task.type : '—',
          journalLen: d.journal.length,
          last: d.journal.length ? d.journal[d.journal.length - 1].txt.slice(0, 64) : ''
        };
      }).catch(() => null);
      if (!st) { report.errors.push('state-read-fail'); break; }

      if (Date.now() - lastSnap > 30000) {
        lastSnap = Date.now();
        report.timeline.push({
          t: Math.round((Date.now() - t0) / 1000), day: st.day, hour: st.hour,
          hp: st.hp, temp: st.temp, food: st.food, water: st.water,
          task: st.task
        });
      }

      if (st.result === 'victory' || st.result === 'death' || st.dead || !st.active && st.result) {
        report.result = st.result || 'death';
        report.finalState = st;
        break;
      }
    }

    // --- сохранить состояние для следующего инкремента ---
    const meta = await page.evaluate(() => {
      const d = WS.Demo._state();
      return {
        journal: d.journal, startedAt: d.startedAt, startStamp: d.startStamp,
        phase: (d.phaseSeq || 1), shotsDone: d.shotsDone || 0,
        melted: d.melted || 0, huntsDone: d.huntsDone || 0,
        lastResult: d.result || ''
      };
    }).catch(() => null);
    if (meta) {
      // если герой погиб/победил — сейв не нужен, следующий прогон свежий
      if (!report.result) {
        await page.evaluate(() => { try { WS.Save.save('main'); } catch (e) { /* пусто */ } })
          .catch(() => {});
        const dump = await page.evaluate(() => {
          const out = {};
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            out[k] = localStorage.getItem(k);
          }
          return out;
        }).catch(() => ({}));
        writeFileSync(lsFile, JSON.stringify(dump), 'utf-8');
        writeFileSync(metaFile, JSON.stringify(meta), 'utf-8');
      } else {
        // гибель/победа: сбрасываем профиль агента для свежего старта
        // (journal.json и report.json остаются — это материалы для разбора)
        try {
          readdirSync(aDir).forEach(f => {
            if (f !== 'report.json' && f !== 'journal.json') unlinkSync(path.join(aDir, f));
          });
        } catch (e) { /* пусто */ }
      }
      report.journalTail = (meta.journal || []).slice(-14).map(j => '[' + j.t + '] ' + j.txt.slice(0, 90));
      // ПОЛНЫЙ журнал — главная улика для анализа смертей (хранится всегда)
      try {
        writeFileSync(path.join(aDir, 'journal.json'),
          JSON.stringify(meta.journal || [], null, 1), 'utf-8');
      } catch (eJ) { /* пусто */ }
      // день из штампа последней строки («Д12 15:35» → 12)
      report.dayReached = 0;
      for (let i = (meta.journal || []).length - 1; i >= 0; i--) {
        const mD = /^Д(\d+)/.exec(meta.journal[i].t || '');
        if (mD) { report.dayReached = parseInt(mD[1], 10); break; }
      }
    }
    report.finishedAt = new Date().toISOString();
    writeReport(agent, report, aDir);
    await browser.close();
  } catch (e) {
    report.result = report.result || 'error: ' + e.message.slice(0, 120);
    writeReport(agent, report, aDir);
    await browser.close().catch(() => {});
  }
}

function writeReport(agent, report, aDir) {
  const brief = { ...report, timeline: undefined, journalTail: undefined };
  writeFileSync(path.join(aDir, 'report.json'), JSON.stringify(report, null, 1), 'utf-8');
  const lines = [
    `АГЕНТ ${report.agent} (${report.prof}, seed ${report.seed})` +
      (report.resumed ? ' · ПРОДОЛЖЕНИЕ' : ' · свежая партия'),
    `  результат: ${report.result || 'бюджет исчерпан (продолжение в след. инкременте)'}`,
    `  день: ${report.dayReached || '?'} · ошибок: ${report.errors.length}`
  ];
  report.timeline.slice(-4).forEach(t =>
    lines.push(`  ${t.t}с: д${t.day} ${t.hour}ч hp=${t.hp} ${t.temp}° еда=${t.food} вода=${t.water} [${t.task}]`));
  report.journalTail.slice(-4).forEach(l => lines.push('    ' + l));
  report.errors.slice(0, 3).forEach(e => lines.push('  ! ' + e));
  console.log(lines.join('\n'));
}

// --- запуск роя параллельно ---
const run = async () => {
  console.log(`РОЙ: ${ROSTER.length} агентов × ${BUDGET_S}с параллельно, база ${BASE}`);
  const t0 = Date.now();
  await Promise.all(ROSTER.map((a, i) => runAgent(a, i)));
  console.log(`\nРОЙ завершён за ${Math.round((Date.now() - t0) / 1000)}с. Отчёты: ${DIR}/<агент>/report.json`);
};
run().catch(e => { console.error('SWARM FAIL', e); process.exit(2); });
