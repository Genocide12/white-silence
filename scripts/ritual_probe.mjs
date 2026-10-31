// ritual_probe.mjs — тест РАННЕЙ ПОБЕДЫ: факелы → Магический Огонь →
// Грибной Зов ×3 → прилёт тарелки. Проверяет всю цепочку story.js
// честными взаимодействиями (телепорт + клавиша E), без читов логики.
import { createRequire } from 'module';
const require = createRequire('/home/z/.npm-global/lib/node_modules/');
const { chromium } = require('playwright');

const BASE = process.argv[2] || 'http://localhost:3000';

const run = async () => {
  const browser = await chromium.launch({ args: ['--disable-dev-shm-usage'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => {
    if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 200));
  });
  await page.goto(BASE, { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(3500);

  const boot = await page.evaluate(() => ({
    hasG: !!WS.G,
    crazy: !!(WS.Crazy && WS.Crazy.active && WS.Crazy.active()),
    story: !!WS.Story,
    exped: !!WS.Expeditions,
    replay: !!WS.Replay,
    swarm: !!WS.Swarm,
    cinema: !!WS.Cinema,
    voicebox: !!WS.VoiceBox
  }));
  console.log('BOOT:', JSON.stringify(boot));

  // 1) новая партия
  const started = await page.evaluate(() => {
    try { return WS.Main.newGame('telegraph', ['frostproof', 'patient'], 1917); }
    catch (e) { return 'ERR ' + e.message; }
  });
  await page.waitForTimeout(1200);
  console.log('NEWGAME:', started);

  // 2) дать деду факелы и пыль, подкинуть энергии
  const give = await page.evaluate(() => {
    try {
      WS.Inv.give('torch', 5);
      WS.Inv.give('stardust', 4);
      const cz = WS.Crazy.state();
      cz.energy = 200;
      const fq = WS.Story.finalQuest();
      return { torches: fq.torches, dust: fq.dust, energy: cz.energy, need: fq.need, callNeed: fq.callNeed, callCost: fq.callCost };
    } catch (e) { return 'ERR ' + e.message; }
  });
  console.log('GIVE:', JSON.stringify(give));

  // 3) телепорт к мосткам + E (розжиг Магического Огня)
  const pier = await page.evaluate(() => {
    const p = WS.Story.pier();
    return p ? { x: p.x, y: p.y } : null;
  });
  console.log('PIER:', JSON.stringify(pier));
  if (!pier) { console.log('НЕТ МОСТКОВ — ФЕЙЛ'); await browser.close(); process.exit(1); }

  await page.evaluate((pt) => {
    WS.G.player.x = pt.x + 0.8; WS.G.player.y = pt.y;
    WS.Cam.cx = pt.x; WS.Cam.cy = pt.y;
  }, pier);
  await page.waitForTimeout(400);
  // E — как игрок
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(600);
  const fq1 = await page.evaluate(() => WS.Story.finalQuest());
  console.log('ПОСЛЕ E (розжиг):', JSON.stringify(fq1));

  // 4) три Грибных Зова
  for (let i = 1; i <= 4; i++) {
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(500);
    const fq = await page.evaluate(() => WS.Story.finalQuest());
    console.log('ЗОВ #' + i + ':', JSON.stringify(fq));
    if (fq.plateCalled) break;
  }

  // 5) перемотать время на 3 игровых часа — тарелка прилетает
  const victory = await page.evaluate(async () => {
    let fired = false;
    WS.Ev.on('game:victory', () => { fired = true; });
    WS.G.time.totalMin += 190;
    WS.G.time.day = Math.floor(WS.G.time.totalMin / 1440) + 1;
    WS.G.time.min = WS.G.time.totalMin % 1440;
    await new Promise(r => setTimeout(r, 1500));
    return { fired, day: WS.Time.day(), victoryFlag: !!(WS.G.story && WS.G.story.flags.story_victory) };
  });
  console.log('ПОБЕДА:', JSON.stringify(victory));

  // 6) экспедиция + запись
  const meta = await page.evaluate(() => {
    try {
      const res = WS.Expeditions.sendExpedition({
        result: 'victory', day: WS.Time.day(), banished: 3, treeLv: 2,
        stardust: 1, seed: 1917, name: 'Тест-Раш', ritual: 3
      });
      return { stars: res.stars, total: res.total };
    } catch (e) { return 'ERR ' + e.message; }
  });
  console.log('ЭКСПЕДИЦИЯ:', JSON.stringify(meta));

  // 7) кинозал: открыть/закрыть
  const cinema = await page.evaluate(() => {
    try {
      WS.Cinema.show();
      const open = WS.Cinema.isOpen();
      WS.Cinema.hide();
      return { open, closedAfter: !WS.Cinema.isOpen() };
    } catch (e) { return 'ERR ' + e.message; }
  });
  console.log('КИНОЗАЛ:', JSON.stringify(cinema));

  // 8) изба экспедиций
  const exped = await page.evaluate(() => {
    try {
      WS.ExpedScreen.show();
      const open = WS.ExpedScreen.isOpen();
      WS.ExpedScreen.hide();
      return { open, stars: WS.Expeditions.stars() };
    } catch (e) { return 'ERR ' + e.message; }
  });
  console.log('ИЗБА ЭКСПЕДИЦИЙ:', JSON.stringify(exped));

  console.log('ERRORS:', errors.slice(0, 8));
  await page.screenshot({ path: '/home/z/my-project/download/ritual_probe.png' });
  await browser.close();

  const ok = victory.fired && fq1.lit;
  console.log(ok ? '=== РИТУАЛЬНАЯ ЦЕПОЧКА РАБОТАЕТ ===' : '=== ЧТО-ТО СЛОМАНО ===');
  process.exit(ok ? 0 : 2);
};

run().catch(e => { console.error('FATAL', e); process.exit(1); });
