// РОЙ АГЕНТОВ HEADLESS, ЧАНКАМИ: турнир дедов от начала до победы.
//
// Песочница убивает фоновые процессы между вызовами — как марафон ЭТАПА 7,
// рой идёт чанками по ~8 минут: прогресс живёт в демо-слоте сейва
// (персистентный профиль /tmp/ws-swarm-profile), состояние роя — в
// download/swarm/state.json, киноплёнки копятся по чанкам и склеиваются
// в recordings/*.json для Кинозала.
//
//   node scripts/swarm_run.mjs [baseUrl] [минут_чанка]
//
// Коды выхода: 0 — рой отыграл до конца; 3 — чанк исчерпан, запускай ещё
// раз; 1 — ошибка запуска.
import { createRequire } from 'module';
import { mkdirSync, writeFileSync, appendFileSync, readFileSync, existsSync } from 'fs';
const require = createRequire('/home/z/.npm-global/lib/node_modules/');
const { chromium } = require('playwright');

const BASE = process.argv[2] || 'http://localhost:3000';
const CHUNK = Math.max(1, Math.min(9, parseFloat(process.argv[3] || '8.5')));
const PROFILE = '/tmp/ws-swarm-profile';
const OUT = '/home/z/my-project/download/swarm';
const RECS = new URL('.', import.meta.url).pathname + '../recordings';
mkdirSync(OUT, { recursive: true });
mkdirSync(RECS, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));
const stamp = () => new Date().toISOString().slice(11, 19);
const log = line => {
  const s = '[' + stamp() + '] ' + line;
  console.log(s);
  appendFileSync(OUT + '/РОЙ-журнал.txt', s + '\n');
};

// ---- состояние роя (переживает чанки) ----
const STATE_F = OUT + '/state.json';
const AGENTS = [
  { name: 'Гена-Турбо', strategy: 'rush', speedMul: 3 },
  { name: 'Гена-Лодошка', strategy: 'rush', speedMul: 2 },
  { name: 'Гена-Вантуз', strategy: 'rush', speedMul: 3 }
];

function loadState() {
  if (existsSync(STATE_F)) {
    try { return JSON.parse(readFileSync(STATE_F, 'utf8')); } catch (e) { /* пересоздадим */ }
  }
  return { results: [], films: {}, current: null, startedAt: Date.now() };
}
function saveState(st) { writeFileSync(STATE_F, JSON.stringify(st, null, 1)); }

// ---- склейка киноплёнки агента: события после последней минуты ----
function appendFilm(st, name, rec) {
  const f = st.films[name] || { meta: null, ev: [] };
  f.meta = rec.meta;
  let lastMin = f.ev.length ? f.ev[f.ev.length - 1][0] : -1;
  for (const ev of rec.ev) {
    if (ev[0] < lastMin) continue;          // реплей частичного дня после чанка
    if (ev[0] === lastMin && ev[0] > 0) {   // в одной минуте — только первое событие
      // (позиции раз в 3 мин, дубль не страшен) — пропускаем точные дубли
      const prev = f.ev[f.ev.length - 1];
      if (prev[0] === ev[0] && prev[1] === ev[1]) continue;
    }
    f.ev.push(ev);
    lastMin = ev[0];
  }
  st.films[name] = f;
}

const run = async () => {
  const st = loadState();
  // кого играем следующим?
  if (!st.current) {
    const done = new Set(st.results.map(r => r.name));
    const next = AGENTS.find(a => !done.has(a.name));
    if (!next) {
      // всё отыграно: индекс записей + сводка
      const idxPath = RECS + '/index.json';
      let index = { records: [] };
      if (existsSync(idxPath)) {
        try { index = JSON.parse(readFileSync(idxPath, 'utf8')); } catch (e) { /* новую */ }
      }
      for (const r of st.results) {
        const f = st.films[r.name];
        if (!f || !f.ev.length) continue;
        const file = r.name.replace(/[^\wА-Яа-яЁё-]+/g, '') + '.json';
        const meta = Object.assign({}, f.meta || {}, {
          name: r.name, result: r.result, day: r.day, realSec: r.realSec,
          seed: r.seed, banished: r.banished, calls: r.calls || 0,
          strategy: r.strategy
        });
        writeFileSync(RECS + '/' + file, JSON.stringify({ v: 1, meta, ev: f.ev }));
        index.records = index.records.filter(x => x.file !== file);
        index.records.push({
          file, name: r.name, result: r.result, day: r.day, realSec: r.realSec,
          seed: r.seed, at: Date.now(), banished: r.banished, calls: r.calls || 0
        });
      }
      writeFileSync(idxPath, JSON.stringify(index, null, 1));
      const best = st.results.filter(r => r.result === 'victory').sort((a, b) => a.day - b.day)[0];
      writeFileSync(OUT + '/РОЙ-сводка.json', JSON.stringify({
        at: new Date().toISOString(), agents: st.results,
        totalRealMin: Math.round((Date.now() - st.startedAt) / 60000),
        best: best ? ('«' + best.name + '»: победа на день ' + best.day) : 'никто не победил'
      }, null, 2));
      log('РОЙ ФИНИШ: ' + st.results.length + ' агентов. Лучший: ' +
        (best ? best.name + ' (день ' + best.day + ')' : 'никто'));
      return 0;
    }
    st.current = {
      name: next.name, strategy: next.strategy, speedMul: next.speedMul,
      seed: 40000 + AGENTS.indexOf(next) * 137 + ((Math.random() * 900) | 0),
      startedAt: Date.now(), chunks: 0
    };
    saveState(st);
  }
  const cur = st.current;
  log('ЧАНК ' + (cur.chunks + 1) + ' агента «' + cur.name + '» (' + cur.strategy +
    ', ×' + cur.speedMul + ', зерно ' + cur.seed + ')');

  const browser = await chromium.launchPersistentContext(PROFILE, {
    viewport: { width: 1600, height: 900 },
    args: ['--disable-dev-shm-usage']
  });
  const page = browser.pages()[0] || await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 300)); });
  page.on('dialog', d => { d.accept().catch(() => {}); });

  await page.goto(BASE, { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(4000);

  const booted = await page.evaluate(() => !!(WS.Demo && WS.Replay && WS.Expeditions));
  if (!booted) {
    console.log('МОДУЛИ НЕ ЗАГРУЗИЛИСЬ:', errors.slice(0, 12));
    await browser.close();
    return 1;
  }

  // запуск/возобновление агента (fresh только на первом чанке)
  const started = await page.evaluate(c => {
    try {
      const ok = WS.Demo.start({
        fresh: c.fresh, name: c.name, seed: c.seed,
        strategy: c.strategy, speedMul: c.speedMul,
        human: true, record: true
      });
      if (ok) WS.Demo.setPace(8);
      return ok;
    } catch (e) { return false; }
  }, { fresh: cur.chunks === 0, name: cur.name, seed: cur.seed,
       strategy: cur.strategy, speedMul: cur.speedMul });
  if (!started) {
    log('агент не завёлся — пропускаем');
    st.results.push({ name: cur.name, result: 'fail', day: 0, realSec: 0, banished: 0, seed: cur.seed, strategy: cur.strategy });
    st.current = null;
    saveState(st);
    await browser.close();
    return 3;
  }

  const t0 = Date.now();
  let lastMin = -1, lastMinAt = Date.now(), res = null, lastLog = '';
  while (Date.now() - t0 < CHUNK * 60000) {
    await sleep(20000);
    const s = await page.evaluate(() => {
      const D = WS.Demo._state();
      const g = WS.G || {};
      return {
        active: !!D.active,
        result: D.result || null,
        day: g.time ? g.time.day : 0,
        totalMin: g.time ? g.time.totalMin : 0,
        journal: D.journal ? D.journal.slice(-1).map(j => j.txt)[0] : '',
        banished: (WS.Crazy && WS.Crazy.state) ? (WS.Crazy.state().banished || 0) : 0,
        calls: (WS.Story && WS.Story.finalQuest) ? (WS.Story.finalQuest().calls || 0) : 0,
        torches: (WS.Inv && WS.Inv.count) ? WS.Inv.count('torch') : 0,
        lit: (WS.Story && WS.Story.finalQuest) ? !!WS.Story.finalQuest().lit : false
      };
    }).catch(() => null);
    if (!s) continue;

    if (s.totalMin !== lastMin) { lastMin = s.totalMin; lastMinAt = Date.now(); }
    const line = '  день ' + s.day + ' · мин ' + s.totalMin + ' · изгнано ' +
      s.banished + ' · факелы ' + s.torches + ' · зов ' + s.calls + (s.lit ? ' · ОГОНЬ ГОРИТ' : '') + ' · ' + (s.journal || '').slice(0, 80);
    if (line !== lastLog) { log(line); lastLog = line; }

    if (s.result === 'victory' || s.result === 'death' || !s.active) {
      res = s.result || 'stop';
      break;
    }
    if (Date.now() - lastMinAt > 5 * 60000) {
      log('  ⚠ WATCHDOG: время стоит 5 мин — завис');
      res = 'stuck';
      break;
    }
  }

  // выгрузить кусок киноплёнки и прогресс
  await sleep(1500);
  const rec = await page.evaluate(() => {
    try {
      const D = WS.Demo._state();
      return WS.Replay.exportRec({
        day: (WS.G && WS.G.time) ? WS.G.time.day : 0,
        realSec: Math.round((Date.now() - D.startedAt) / 1000)
      });
    } catch (e) { return null; }
  }).catch(() => null);
  if (rec && rec.ev && rec.ev.length) {
    appendFilm(st, cur.name, rec);
    log('  🎬 плёнка чанка: +' + rec.ev.length + ' событий (всего ' +
      (st.films[cur.name] ? st.films[cur.name].ev.length : 0) + ')');
  }

  cur.chunks++;
  if (res) {
    const fin = await page.evaluate(() => {
      const D = WS.Demo._state();
      const cz = (WS.Crazy && WS.Crazy.state) ? WS.Crazy.state() : null;
      return {
        day: (WS.G && WS.G.time) ? WS.G.time.day : 0,
        banished: cz ? (cz.banished || 0) : 0,
        calls: (WS.Story && WS.Story.finalQuest) ? (WS.Story.finalQuest().calls || 0) : 0,
        torches: (WS.Inv && WS.Inv.count) ? WS.Inv.count('torch') : 0,
        lit: (WS.Story && WS.Story.finalQuest) ? !!WS.Story.finalQuest().lit : false
      };
    }).catch(() => ({ day: 0, banished: 0, calls: 0 }));
    // финальный кусок плёнки с результатом
    if (res === 'victory' || res === 'death') {
      const rec2 = await page.evaluate(r => {
        try { WS.Replay.noteResult(r, (WS.G && WS.G.time) ? WS.G.time.day : 0); return WS.Replay.exportRec({}); }
        catch (e) { return null; }
      }, res).catch(() => null);
      if (rec2) appendFilm(st, cur.name, rec2);
    }
    st.results.push({
      name: cur.name, result: res, day: fin.day,
      realSec: Math.round((Date.now() - cur.startedAt) / 1000),
      banished: fin.banished, seed: cur.seed, strategy: cur.strategy, calls: fin.calls
    });
    log('  ФИНИШ «' + cur.name + '»: ' + res + ', день ' + fin.day + ', изгнано ' +
      fin.banished + ', зов ' + fin.calls);
    st.current = null;
  }
  saveState(st);
  if (errors.length) log('  ошибки консоли (' + errors.length + '): ' + errors.slice(0, 3).join(' | '));
  await browser.close();
  return 3;
};

run().then(code => process.exit(code)).catch(e => { console.error('FATAL', e); process.exit(1); });
