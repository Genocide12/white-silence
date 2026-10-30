// swarm_verify.mjs — верификация роя: база загрузилась, think() работает,
// новые события реально срабатывают, у found_item подставляется имя предмета.
import { createRequire } from 'module';
const require = createRequire('/home/z/.npm-global/lib/node_modules/');
const { chromium } = require('playwright');
const URL = process.argv[2] || 'http://localhost:3000/';
const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 200)); });
  await page.goto(URL, { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(3500);
  const rnd = page.locator('text="Случайный герой"').first();
  if (await rnd.isVisible().catch(() => false)) { await rnd.click(); await page.waitForTimeout(400); }
  const start = page.locator('text="Начать"').first();
  if (await start.isVisible().catch(() => false)) await start.click();
  await page.waitForTimeout(6000);

  // 1) база в живой игре
  const base = await page.evaluate(() => {
    const W = window.WS;
    const st = W.Thoughts.stats();
    const keys = W.Thoughts.keys();
    const newKeys = keys.filter(k => k.indexOf('new_') === 0);
    // голос: параметры деда
    return { stats: st, newKeys, voice: W.Thoughts.voiceInfo() };
  });
  console.log('БАЗА:', JSON.stringify(base.stats), '| новых событий:', base.newKeys.length, '| голос:', JSON.stringify(base.voice));

  // 2) принудительный think по 5 категориям — пузырь живой, фразы различны
  const spoken = await page.evaluate(() => {
    const W = window.WS;
    const out = [];
    const probe = ['wolf_spotted', 'frostbite', 'loot_great', 'new_low_matches', 'new_wolf_howl'];
    for (const k of probe) {
      W.Thoughts.think(k, { silent: true, cd: -1, prio: 3 });
      const el = document.querySelector('#ws-thought:not(.hidden)');
      out.push({ key: k, text: el ? el.textContent : 'НЕТ ПУЗЫРЯ' });
    }
    return out;
  });
  for (const s of spoken) console.log('  «' + s.key + '» → ' + s.text);
  const allDiff = new Set(spoken.map(s => s.text)).size === spoken.length;

  // 3) found_item: подстановка имени предмета
  const subst = await page.evaluate(() => {
    const W = window.WS;
    W.Thoughts.think('found_item', { silent: true, cd: -1, prio: 3, vars: { item: 'нож походный' } });
    const el = document.querySelector('#ws-thought:not(.hidden)');
    return el ? el.textContent : '';
  });
  console.log('  found_item → ', subst, subst.indexOf('нож походный') >= 0 ? '(имя подставлено ОК)' : '(ИМЯ НЕ ПОДСТАВЛЕНО!)');

  // 4) случайная фраза не совпадает при повторе (антиповтор)
  const anti = await page.evaluate(() => {
    const W = window.WS;
    const seen = [];
    for (let i = 0; i < 6; i++) {
      const t = W.Thoughts.think('night', { silent: true, cd: -1, prio: 3 });
      if (t) seen.push(t);
    }
    return { n: seen.length, uniq: new Set(seen).size, sample: seen.slice(0, 3) };
  });
  console.log('  антиповтор night: ' + anti.uniq + ' разных из ' + anti.n + ' попыток → ' + (anti.uniq > 1 ? 'ОК' : 'ПОВТОРЫ'));

  console.log('ПУЗЫРИ:', allDiff ? 'все разные ОК' : 'ЕСТЬ ПОВТОРЫ!');
  console.log('ОШИБКИ:', errors.length ? errors.slice(0, 6) : 'нет');
  await browser.close();
};
run().catch(e => { console.error('FATAL', e); process.exit(1); });
