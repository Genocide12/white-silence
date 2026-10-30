// Проверка новых систем на живой странице: Thoughts, Icons, WorldHover,
// радио-приёмники, подсказки. Использование: node scripts/newsys_probe.mjs [url]
import { createRequire } from 'module';
const require = createRequire('/home/z/.npm-global/lib/node_modules/');
const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://localhost:3000';
const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 200)); });
  await page.goto(URL, { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(3000);

  // 1) модули зарегистрированы?
  const mods = await page.evaluate(() => ({
    thoughts: !!WS.Thoughts, icons: !!WS.Icons, crazy: !!WS.Crazy,
    radio: !!WS.Radio, demo: !!WS.Demo,
    thoughtCats: WS.Thoughts ? Object.keys(WS.Thoughts._db).length : 0,
    iconFamilies: WS.Icons ? WS.Icons._families : 0
  }));
  console.log('МОДУЛИ:', JSON.stringify(mods));

  // 2) иконки рисуются для реальных предметов?
  const icons = await page.evaluate(() => {
    const ids = ['bread', 'rifle_mosin', 'valenki', 'vodka', 'mushrooms_fried',
                 'samovar_brass', 'axe', 'bandage', 'book_cook', 'plunger_magic',
                 'torch', 'matches', 'wolf_pelt', 'ushanka'];
    const out = {};
    for (const id of ids) {
      const u = WS.Icons.iconUrl(id, 24);
      out[id] = u ? u.length : 0;
    }
    out._total = WS.Icons.generated();
    return out;
  });
  console.log('ИКОНКИ (длина dataURL):', JSON.stringify(icons));

  // 3) старт игры -> мысль деда, радио-приёмники в мире
  await page.evaluate(() => { WS.Main.newGame('telegraph', ['frostproof', 'patient'], 1917); });
  await page.waitForTimeout(1500);
  const world = await page.evaluate(() => {
    const objs = WS.World.objects || [];
    let radios = 0, stoves = 0, beds = 0, containers = 0;
    for (const o of objs) {
      if (!o) continue;
      if (o.radio) radios++;
      if (o.heat) stoves++;
      if (/^bed/.test(o.sprName || '')) beds++;
      if (o.container) containers++;
    }
    // мысль деда вручную
    const thought = WS.Thoughts.think('wolf_spotted');
    const said = WS.Thoughts.say('Проверка голоса деда, блять.', 'probe', { cd: 1 });
    return { radios, stoves, beds, containers, total: objs.length,
             thought, said, crazy: WS.Crazy.active() };
  });
  console.log('МИР:', JSON.stringify(world));

  // 4) подсказка при наведении на объект мира: двигаем мышь на печь
  const hover = await page.evaluate(() => {
    const objs = WS.World.objects || [];
    const stove = objs.find(o => o && o.heat) || objs[0];
    if (!stove) return { ok: false };
    const sc = WS.Cam.worldToScreen(stove.x, stove.y);
    return { ok: true, sx: Math.round(sc.x), sy: Math.round(sc.y), name: stove.name };
  });
  if (hover.ok) {
    await page.mouse.move(hover.sx, hover.sy);
    await page.waitForTimeout(400);
    const tt = await page.evaluate(() => {
      const el = document.querySelector('.ws-tooltip');
      return el && !el.classList.contains('hidden') ? el.textContent.slice(0, 80) : '';
    });
    console.log('НАВЕДЕНИЕ на «' + hover.name + '» → тултип:', JSON.stringify(tt));
  } else {
    console.log('НАВЕДЕНИЕ: объектов нет?!', JSON.stringify(hover));
  }

  // 5) пузырь мысли в DOM
  const bubble = await page.evaluate(() => {
    const el = document.getElementById('ws-thought');
    return el ? { visible: !el.classList.contains('hidden'), text: el.textContent.slice(0, 60) } : null;
  });
  console.log('ПУЗЫРЬ МЫСЛИ:', JSON.stringify(bubble));

  console.log('ОШИБКИ (' + errors.length + '):', errors.slice(0, 8));
  await page.screenshot({ path: '/home/z/my-project/download/demo/newsys.png' });
  await browser.close();
  process.exit(errors.length ? 1 : 0);
};
run().catch(e => { console.error('PROBE ERROR', e); process.exit(2); });
