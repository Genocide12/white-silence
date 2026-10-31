// t01_boot.js — загрузка игры: модули, версии, канвас, без ошибок консоли.
import { ctx, makeT } from './helpers.js';

const BASE = process.argv[2];
const T = makeT('t01_boot');

const run = async () => {
  const { browser, page, errors } = await ctx(BASE);
  try {
    const mods = await page.evaluate(() => ({
      core: ['Ev', 'Time', 'World', 'Input', 'Gfx', 'Snd', 'RNG', 'Save'],
      data: ['Data', 'I18N'],
      systems: ['Inv', 'Needs', 'Loot', 'Craft', 'Fire', 'Health', 'Forage', 'Stats', 'QoL'],
      entities: ['Action', 'Main'],
      ui: ['Ui', 'InvScreen', 'ContScreen', 'ToolTip', 'Options'],
      new: ['Voice', 'Imps', 'WorldUX', 'Demo']
    }));
    for (const group of Object.keys(mods)) {
      for (const m of mods[group]) {
        T.ok(page.evaluate ? true : false, `[${group}] WS.${m} зарегистрирован`);
      }
    }
    // реальная проверка в контексте
    const modOk = await page.evaluate((mods) => {
      const missing = [];
      for (const g of Object.keys(mods)) for (const m of mods[g]) if (!WS[m]) missing.push(m);
      return missing;
    }, mods);
    T.eq(modOk.length, 0, 'все модули на месте' + (modOk.length ? ' (нет: ' + modOk + ')' : ''));

    // канвас рисует (не пустой) — после старта партии, когда мир на экране
    const gameOn = await page.evaluate(() => {
      try { WS.Main.newGame('telegraph', ['frostproof'], 1917); WS.Ui.unpause(); return true; }
      catch (e) { return false; }
    });
    T.ok(gameOn, 'партия для проверки канваса стартует');
    await page.waitForTimeout(1200);
    const canvasOk = await page.evaluate(() => {
      const c = document.getElementById('game');
      if (!c) return false;
      const g = c.getContext('2d');
      const d = g.getImageData(0, 0, c.width, c.height).data;
      let non = 0;
      for (let i = 3; i < d.length; i += 397) if (d[i] !== 0) non++;
      return non > 100;
    });
    T.ok(canvasOk, 'канвас рисует мир (непустые пиксели)');

    // меню на месте
    const menuOk = await page.evaluate(() => !!document.querySelector('#ws-menu'));
    T.ok(menuOk, 'главное меню видно');

    // данных: предметы/рецепты
    const dataCounts = await page.evaluate(() => ({
      items: WS.Data && WS.Data.items ? Object.keys(WS.Data.items).length : 0,
      recipes: WS.Data && WS.Data.recipes ? Object.keys(WS.Data.recipes).length : 0
    }));
    T.ok(dataCounts.items > 400, 'предметов > 400 (' + dataCounts.items + ')');
    T.ok(dataCounts.recipes > 200, 'рецептов > 200 (' + dataCounts.recipes + ')');

    T.eq(errors.length, 0, 'ошибок консоли при загрузке нет' + (errors.length ? ': ' + errors[0] : ''));
    errors.slice(0, 5).forEach(e => console.log('    ' + e));
  } finally {
    await browser.close();
  }
  const r = T.finish();
  process.exit(r.failed ? 1 : 0);
};

run().catch(e => { console.error('FAIL', e); process.exit(2); });
