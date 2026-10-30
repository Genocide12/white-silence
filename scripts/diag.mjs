// Диагностика: почему не рисуется земля?
import { createRequire } from 'module';
const require = createRequire('/home/z/.npm-global/lib/node_modules/');
const { chromium } = require('playwright');

const BASE = process.argv[2] || 'http://localhost:3000';

const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 300)); });

  await page.goto(BASE, { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(3000);
  await page.locator('text="Случайный герой"').first().click();
  await page.waitForTimeout(400);
  await page.locator('text="Начать"').first().click();
  await page.waitForTimeout(4000);

  const diag = await page.evaluate(() => {
    const out = {};
    const G = WS.G, W = WS.World, Spr = WS.Spr, M = WS.M, Cam = WS.Cam;
    out.worldExists = !!W && !!W.tiles;
    out.playerPos = { x: +G.player.x.toFixed(1), y: +G.player.y.toFixed(1) };
    out.camPos = { x: +Cam.cx.toFixed(1), y: +Cam.cy.toFixed(1), zoom: Cam.zoom };

    // что за тайлы вокруг игрока?
    const px = Math.floor(G.player.x), py = Math.floor(G.player.y);
    const around = [];
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++)
        around.push(W.tileAt(px + dx, py + dy));
    out.tilesAroundPlayer = around;
    out.tileNames = [...new Set(around)].map(t => {
      const names = Object.keys(W.T).filter(k => W.T[k] === t);
      return t + '=' + names.join('/');
    });

    // есть ли спрайты для этих тайлов?
    out.spriteForPlayerTile = !!Spr.tile(W.tileAt(px, py), px, py);
    out.spriteForSnow = !!Spr.tile(10, 3, 5);

    // гистограмма тайлов всего мира
    const hist = {};
    for (let i = 0; i < W.tiles.length; i++) {
      const t = W.tiles[i];
      hist[t] = (hist[t] || 0) + 1;
    }
    out.tileHistogram = hist;

    // размер канваса
    const cv = document.getElementById('game');
    out.canvasSize = { w: cv.width, h: cv.height };

    // перехват drawImage: рисуется ли terrain вообще?
    return out;
  });
  console.log(JSON.stringify(diag, null, 1));

  // Проверим фактическую отрисовку: скриним только канвас и считаем не-чёрные пиксели
  const pixels = await page.evaluate(() => {
    const cv = document.getElementById('game');
    const c = cv.getContext('2d');
    // читаем маленькую область в центре вокруг игрока
    const img = c.getImageData(cv.width / 2 - 100, cv.height / 2 - 50, 200, 100);
    let dark = 0, bright = 0, mid = 0;
    for (let i = 0; i < img.data.length; i += 4) {
      const lum = (img.data[i] + img.data[i+1] + img.data[i+2]) / 3;
      if (lum < 24) dark++;
      else if (lum > 120) bright++;
      else mid++;
    }
    const total = img.data.length / 4;
    return { dark: +(100 * dark / total).toFixed(1), mid: +(100 * mid / total).toFixed(1), bright: +(100 * bright / total).toFixed(1), sample: Array.from(img.data.slice(0, 12)) };
  });
  console.log('CENTER PIXELS %', JSON.stringify(pixels));

  // Проверим чанк-кэш: что реально лежит в offscreen канвасе чанка
  const chunkDiag = await page.evaluate(() => {
    // получим доступ к chunkCache через хак: у Gfx нет экспорта кэша,
    // но renderChunkToCanvas можно вызвать косвенно — проверим Gfx API
    return {
      gfxApi: Object.keys(WS.Gfx),
      sprCount: WS.Spr.cacheSize(),
    };
  });
  console.log('CHUNK', JSON.stringify(chunkDiag));
  console.log('ERRORS', JSON.stringify(errors.slice(0, 10), null, 1));
  await browser.close();
};
run().catch(e => { console.error('FATAL', e); process.exit(1); });
