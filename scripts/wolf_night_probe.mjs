// wolf_night_probe.mjs — волки должны прийти к жилью игрока ночью.
// Жалоба: «врагов нет» — ближайший хищник был в 72 тайлах.
import { createRequire } from 'module';
const require = createRequire('/home/z/.npm-global/lib/node_modules/');
const { chromium } = require('playwright');
const URL = process.argv[2] || 'http://localhost:3000/';
const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('pageerror', e => console.log('PAGEERROR:', e.message));
  await page.goto(URL, { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(3500);
  const rnd = page.locator('text="Случайный герой"').first();
  if (await rnd.isVisible().catch(() => false)) { await rnd.click(); await page.waitForTimeout(400); }
  const start = page.locator('text="Начать"').first();
  if (await start.isVisible().catch(() => false)) await start.click();
  await page.waitForTimeout(6000);

  // прыжок в 22:00 (ночь) — время двигается, волки выходят на охоту
  await page.evaluate(() => {
    const W = window.WS;
    // минут до 22:00
    const nowH = W.Time.hourF();
    let addMin = (22 - nowH) * 60;
    if (addMin < 0) addMin += 1440;
    for (let i = 0; i < Math.ceil(addMin / 30); i++) W.Time.update(30 * 60); // крупные шаги
    // время.update(dt сек?) — проверим сигнатуру через G.time
  });
  const t1 = await page.evaluate(() => window.WS.Time.fmt());
  console.log('время после прыжка:', t1);

  // ждём 60 реальных секунд (ночь, охота идёт) — сэмплируем дистанцию волков
  const samples = [];
  for (let i = 0; i < 48; i++) {
    await page.waitForTimeout(5000);
    const s = await page.evaluate(() => {
      const W = window.WS;
      const p = W.G.player;
      let best = 1e9, n = 0;
      for (const e of (W.World.ents || [])) {
        if (!e || e.dead || e.kind !== 'wolf') continue;
        n++;
        const d = Math.hypot(e.x - p.x, e.y - p.y);
        if (d < best) best = d;
      }
      const j = W.Demo ? null : null;
      // ближайшая стая: режим
      return {
        time: W.Time.fmt(), wolves: n,
        nearest: Math.round(best * 10) / 10,
        hour: W.Time.hourF()
      };
    });
    samples.push(s);
    console.log(`${s.time} волков=${s.wolves} ближайший=${s.nearest} тайлов`);
  }
  const min = Math.min(...samples.map(s => s.nearest));
  const withHowl = await page.evaluate(() => {
    const W = window.WS;
    return { thought: !!(W.Thoughts), sndCtx: !!(W.Snd) };
  });
  console.log(min <= 15 ? `ОК: волки подошли на ${Math.round(min)} тайлов (охота у жилья)` : `FAIL: ближайший волк ${Math.round(min)} тайлов — «врагов нет»`);
  await browser.close();
};
run().catch(e => { console.error('FATAL', e); process.exit(1); });
