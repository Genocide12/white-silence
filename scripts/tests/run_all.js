// run_all.js — ЕДИНЫЙ РАННЕР ВСЕХ ТЕСТОВ «Белого Безмолвия».
// Поднимает сервер, прогоняет тесты по очереди, пишет отчёт.
// Использование: node scripts/tests/run_all.js [порт]
import { spawn } from 'child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = process.argv[2] || '3130';
const BASE = `http://localhost:${PORT}`;

const TESTS = [
  't01_boot.js',
  't02_actions.js',
  't03_items_player.js',
  't04_items_items.js',
  't05_localization.js',
  't06_worldux.js',
  't07_enemies.js',
  't08_voice_ui.js',
  't09_demo_short.js'
];

const run = async () => {
  // сервер — ребёнок этого процесса (живёт весь прогон)
  const srv = spawn('node', ['scripts/serve.mjs', PORT], { cwd: ROOT, stdio: 'ignore' });
  await new Promise((res) => {
    const t0 = Date.now();
    const ping = setInterval(() => {
      if (Date.now() - t0 > 20000) { clearInterval(ping); res(); }
      fetch(BASE + '/').then(r => { if (r.ok) { clearInterval(ping); res(); } }).catch(() => {});
    }, 300);
  });

  const report = [];
  let allOk = true;
  for (const t of TESTS) {
    console.log('\n====================================================');
    console.log('ТЕСТ: ' + t);
    console.log('====================================================');
    const rc = await new Promise((res) => {
      const p = spawn('node', [path.join(ROOT, 'scripts/tests', t), BASE], { cwd: ROOT, stdio: 'inherit' });
      p.on('close', (code) => res(code || 0));
    });
    const ok = rc === 0;
    if (!ok) allOk = false;
    report.push({ test: t, exit: rc, status: ok ? 'PASS' : 'FAIL' });
  }

  srv.kill();

  // сводка
  const lines = [];
  lines.push('БЕЛОЕ БЕЗМОЛВИЕ — ОТЧЁТ ТЕСТОВ');
  lines.push('Дата: ' + new Date().toISOString());
  lines.push('База: ' + BASE);
  lines.push('');
  for (const r of report) lines.push(`${r.status === 'PASS' ? '✓' : '✗'} ${r.test} — ${r.status} (exit ${r.exit})`);
  lines.push('');
  lines.push(`ИТОГ: ${report.filter(r => r.status === 'PASS').length}/${report.length} PASS` +
    (allOk ? ' — ВСЁ ЗЕЛЁНОЕ' : ' — ЕСТЬ ПРОВАЛЫ'));
  const text = lines.join('\n');
  console.log('\n' + text);
  const outDir = path.join(ROOT, 'download/tests');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, 'report.txt'), text, 'utf-8');
  process.exit(allOk ? 0 : 1);
};

run().catch(e => { console.error('RUNNER FAIL', e); process.exit(2); });
