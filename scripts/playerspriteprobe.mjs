// Пробник спрайта игрока: рисуется ли 'player' вообще, что в его пикселях.
import { createRequire } from 'module';
const require = createRequire('/home/z/.npm-global/lib/node_modules/');
const { chromium } = require('playwright');

const BASE = process.argv[2] || 'http://localhost:3000';
const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('pageerror', e => console.log('PAGEERROR:', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE-ERR:', m.text().slice(0, 200)); });
  await page.goto(BASE, { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(3000);
  await page.locator('text="Случайный герой"').first().click();
  await page.waitForTimeout(400);
  await page.locator('text="Начать"').first().click();
  await page.waitForTimeout(4000);
  const r = await page.evaluate(() => {
    const p = WS.G.player;
    const out = {
      sprName: p.sprName, sprFrame: p.sprFrame, dir: p.dir,
      inQuery: false, marker: !!p.marker
    };
    // есть ли игрок в списке отрисовки
    const vb = WS.Cam.viewBounds(4);
    const q = WS.World.query(vb.x0 - 3, vb.y0 - 3, vb.x1 + 3, vb.y1 + 3);
    for (const e of q) if (e === p || e.marker) { out.inQuery = true; out.listedEntity = { sprName: e.sprName, spr: !!e.spr, marker: !!e.marker, x: e.x, y: e.y }; }
    // пиксели спрайта 'player' по всем dir
    out.spritePixels = {};
    for (let d = 0; d < 8; d++) {
      const cv = WS.Spr.get('player', 0, d);
      if (!cv) { out.spritePixels['dir' + d] = 'NULL'; continue; }
      const cx = cv.getContext('2d');
      const im = cx.getImageData(0, 0, cv.width, cv.height).data;
      let n = 0;
      for (let i = 3; i < im.length; i += 4) if (im[i] > 10) n++;
      out.spritePixels['dir' + d] = `${cv.width}x${cv.height}, непрозрачных пикселей: ${n}`;
    }
    // кадры ходьбы
    const cvf = WS.Spr.get('player', 1, 0);
    if (cvf) {
      const im = cvf.getContext('2d').getImageData(0, 0, cvf.width, cvf.height).data;
      let n = 0; for (let i = 3; i < im.length; i += 4) if (im[i] > 10) n++;
      out.frame1dir0 = `${cvf.width}x${cvf.height}, непрозрачных: ${n}`;
    }
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  await browser.close();
};
run().catch(e => { console.error('FATAL', e); process.exit(1); });
