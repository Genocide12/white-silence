// t09_demo_short.js — ДЕМО-АВТОПИЛОТ (короткая проверка): старт кнопкой,
// выживание ~2 минут, адаптивная скорость, честный режим (без читов),
// сворачиваемость панели, журнал, отсутствие зацикливания «обхожу препятствие».
import { ctx, makeT } from './helpers.js';

const BASE = process.argv[2];
const T = makeT('t09_demo_short');
const MINUTES = parseFloat(process.argv[3] || '3');

const run = async () => {
  const { browser, page, errors } = await ctx(BASE);
  try {
    // старт КНОПКОЙ как пользователь
    const btn = page.locator('#ws-menu button', { hasText: 'Демо-прохождение' }).first();
    await btn.click();
    await page.waitForTimeout(2000);
    const on = await page.evaluate(() => WS.Demo.active());
    T.ok(on, 'демо: запускается кнопкой из меню');

    // темп ×2 (для быстрой проверки честной игры)
    await page.evaluate(() => WS.Demo.pace(1));
    const pace = await page.evaluate(() => WS.Demo.pace());
    T.eq(pace, 1, "демо: честный темп ×1 установлен");

    // живём MINUTES минут
    await page.waitForTimeout(MINUTES * 60000);

    const state = await page.evaluate(() => {
      const j = WS.Demo.journal();
      const detours = j.filter(x => /обхожу|обход/i.test(x.txt)).length;
      const dState = WS.Demo._state();
      return {
        active: WS.Demo.active(),
        day: WS.Time ? WS.Time.day() : 0,
        hour: WS.Time ? Math.round(WS.Time.hourF()) : 0,
        hp: WS.G && WS.G.player ? Math.round(WS.G.player.hp) : 0,
        temp: WS.G && WS.G.player ? WS.G.player.temp : 0,
        journal: j.length,
        detours,
        fallbackUsed: dState.fallbackUsed,
        speed: dState.curSpeed,
        imps: WS.Imps ? WS.Imps.expelled() : 0,
        last: j.slice(-5).map(x => x.txt)
      };
    });
    console.log('    состояние:', JSON.stringify(state, null, 1));
    T.ok(state.active, `демо: живо после ${MINUTES} мин`);
    T.ok(state.hp > 0, `демо: герой жив (HP=${state.hp}, ${state.temp}°)`);
    T.ok(state.journal > 5, `демо: журнал пишется (${state.journal} строк)`);
    T.ok(!state.fallbackUsed, 'демо: ЧЕСТНЫЙ режим — факелы не выданы читами');
    T.ok(state.detours <= 6, `демо: «обхожу препятствие» не зацикливается (${state.detours} раз за ${MINUTES} мин)`);
    console.log('    последние строки журнала:');
    state.last.forEach(l => console.log('      ' + l));

    await page.screenshot({ path: '/tmp/t09-demo.png' });
    await page.evaluate(() => WS.Demo.stop('тест'));

    T.eq(errors.length, 0, 'ошибок консоли нет' + (errors.length ? ': ' + errors[0] : ''));
    errors.slice(0, 8).forEach(e => console.log('    ' + e));
  } finally {
    await browser.close();
  }
  const r = T.finish();
  process.exit(r.failed ? 1 : 0);
};

run().catch(e => { console.error('FAIL', e); process.exit(2); });
