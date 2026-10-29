/**
 * Рендерер: canvas 2D, изометрия, чанковый кэш террейна, освещение, погодный слой.
 * Порядок отрисовки кадра:
 *   1. террейн (кэш чанков)  2. объекты и сущности (сортировка по x+y)
 *   3. эффекты/частицы       4. тонировка времени суток (multiply)
 *   5. тьма + источники света (composite)   6. погода  7. виньетка
 */
(function () {
  'use strict';

  var CHUNK = 16;                    // тайлов на чанк
  var cv = null, ctx = null;
  var lightCv = null, lightCtx = null;
  var chunkCache = {};               // "cx,cy" -> {cv, ver}
  var M = null;

  var Gfx = {
    init: function () {
      cv = document.getElementById('game');
      ctx = cv.getContext('2d', { alpha: false });
      Gfx.resize();
      window.addEventListener('resize', Gfx.resize);
      lightCv = document.createElement('canvas');
      lightCtx = lightCv.getContext('2d');
      ctx.imageSmoothingEnabled = false;
    },
    resize: function () {
      if (!cv) return;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = Math.floor(window.innerWidth * dpr);
      cv.height = Math.floor(window.innerHeight * dpr);
      cv.style.width = window.innerWidth + 'px';
      cv.style.height = window.innerHeight + 'px';
      if (ctx) { ctx.imageSmoothingEnabled = false; }
      if (lightCv) { lightCv.width = cv.width; lightCv.height = cv.height; }
      Gfx.dirty();
    },
    canvas: function () { return cv; },
    c: function () { return ctx; },
    dirty: function () { chunkCache = {}; },

    /** Сборка кадра. Вызывается из Loop (рендер-приоритет 70). */
    frame: function () {
      if (!ctx || !WS.World || !WS.World.tiles) return;
      var cam = WS.Cam;
      var zoom = cam.zoom;
      var vb = cam.viewBounds(4);
      ctx.fillStyle = '#0a0e14';
      ctx.fillRect(0, 0, cv.width, cv.height);

      ctx.save();
      // эмуляция transform: рисуем в экранных координатах, умножая на зум
      // 1) террейн чанками
      var c0 = Math.floor(vb.x0 / CHUNK), c1 = Math.floor(vb.x1 / CHUNK);
      var r0 = Math.floor(vb.y0 / CHUNK), r1 = Math.floor(vb.y1 / CHUNK);
      for (var cy = r0; cy <= r1; cy++) {
        for (var cx = c0; cx <= c1; cx++) {
          drawChunk(cx, cy, zoom);
        }
      }
      // 2) объекты/сущности с сортировкой
      drawSorted(vb, zoom);
      ctx.restore();

      // 3) частицы мира
      if (WS.Fx) WS.Fx.drawWorld(ctx, cam);

      // 4) тонировка и тьма
      applyLight();

      // 5) погода
      if (WS.Weather) WS.Weather.draw(ctx, cam);

      // 6) виньетка
      drawVignette();

      // 7) флоат-текст (урон, события)
      if (WS.Fx) WS.Fx.drawScreen(ctx, cam);
    }
  };

  /** Отрисовка чанка террейна через кэш. */
  function drawChunk(cx, cy, zoom) {
    var key = cx + ',' + cy;
    var w = WS.World;
    if (!w.chunkValid) w.chunkValid = 1;
    var entry = chunkCache[key];
    if (!entry || entry.ver !== w.ver) {
      entry = renderChunkToCanvas(cx, cy);
      chunkCache[key] = entry;
    }
    var c = WS.Cam.canvasCenter();
    // верхний угол чанка в мировых координатах
    var wx = cx * CHUNK, wy = cy * CHUNK;
    var s = M.toScreen(wx, wy);
    ctx.drawImage(entry.cv,
      c.x + (s.x) * zoom, c.y + (s.y) * zoom,
      entry.cv.width * zoom, entry.cv.height * zoom);
  }

  function renderChunkToCanvas(cx, cy) {
    var w = WS.World;
    var pxW = CHUNK * M.TW, pxH = CHUNK * M.TH + M.TH;  // + запас на высокие спрайты
    var off = document.createElement('canvas');
    off.width = pxW; off.height = pxH;
    var octx = off.getContext('2d');
    octx.imageSmoothingEnabled = false;
    for (var ly = 0; ly < CHUNK; ly++) {
      for (var lx = 0; lx < CHUNK; lx++) {
        var tx = cx * CHUNK + lx, ty = cy * CHUNK + ly;
        if (tx < 0 || ty < 0 || tx >= w.w || ty >= w.h) continue;
        var s = M.toScreen(lx, ly);
        var tile = w.tileAt(tx, ty);
        var spr = WS.Spr ? WS.Spr.tile(tile, tx, ty) : null;
        if (!spr) continue;
        octx.drawImage(spr, s.x - M.HW, s.y, spr.width, spr.height);
        // накладной слой (снег на объектах и т.п.)
        var over = WS.Spr ? WS.Spr.tileOverlay(tile, tx, ty) : null;
        if (over) octx.drawImage(over, s.x - M.HW, s.y, over.width, over.height);
      }
    }
    return { cv: off, ver: w.ver };
  }

  /** Сущности и объекты — сортировка по (x+y), рисуем с тенями. */
  function drawSorted(vb, zoom) {
    var list = WS.World.query(vb.x0 - 3, vb.y0 - 3, vb.x1 + 3, vb.y1 + 3);
    if (!list.length) return;
    var c = WS.Cam.canvasCenter();
    list.sort(function (a, b) { return (a.x + a.y) - (b.x + b.y); });
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (e.hidden) continue;
      var s = M.toScreen(e.x - WS.Cam.cx - WS.Cam._shakeX, e.y - WS.Cam.cy - WS.Cam._shakeY);
      var sx = c.x + s.x * zoom, sy = c.y + s.y * zoom;
      // тень
      if (e.shadow !== false && WS.Spr) {
        var sh = WS.Spr.shadow(e);
        if (sh) {
          ctx.drawImage(sh, sx - sh.width * zoom * 0.5, sy - sh.height * zoom * 0.5,
                         sh.width * zoom, sh.height * zoom);
        }
      }
      var img = e.spr;
      if (!img && e.sprName && WS.Spr) img = WS.Spr.get(e.sprName, e.sprFrame || 0, e.dir || 0);
      if (img) {
        var iw = img.width * zoom * (e.scale || 1);
        var ih = img.height * zoom * (e.scale || 1);
        ctx.drawImage(img, sx - iw / 2, sy - ih, iw, ih);
      }
      if (e.render && typeof e.render === 'function') e.render(ctx, sx, sy, zoom);
    }
  }

  /** Тонировка времени суток + тьма с вырезанными источниками света. */
  function applyLight() {
    if (!WS.Time) return;
    var t = WS.Time.hourF();
    var day = WS.Time.day();

    // ambient: от солнца (0 ночью .. 1 днём) с учётом погоды
    var sun = WS.Time.light();
    var weatherDim = WS.Weather ? WS.Weather.lightDim() : 0;
    var ambient = Math.max(0, sun * (1 - weatherDim * 0.5));
    var darkness = 1 - ambient;

    // тон времени суток
    var tint = null;
    if (t >= 5 && t < 8) tint = 'rgba(255,190,140,0.10)';          // рассвет
    else if (t >= 16 && t < 19) tint = 'rgba(255,150,90,0.14)';    // закат
    else if (t >= 19 || t < 5) tint = 'rgba(60,90,160,0.16)';      // синие сумерки
    if (tint && WS.Time.light() > 0.05) {
      ctx.fillStyle = tint;
      ctx.fillRect(0, 0, cv.width, cv.height);
    }

    var polar = WS.Time.isPolarNight ? WS.Time.isPolarNight() : false;
    var maxDark = polar ? 0.93 : 0.88;
    if (darkness <= 0.04) return;

    var alpha = darkness * maxDark;
    lightCtx.clearRect(0, 0, lightCv.width, lightCv.height);
    lightCtx.globalCompositeOperation = 'source-over';
    // цвет тьмы: глубокий сине-фиолетовый северной ночи
    lightCtx.fillStyle = 'rgba(4,8,20,' + alpha + ')';
    lightCtx.fillRect(0, 0, lightCv.width, lightCv.height);

    // вырезаем свет источников: 'destination-out' радиальные градиенты
    lightCtx.globalCompositeOperation = 'destination-out';
    var c = WS.Cam.canvasCenter();
    var lights = WS.World ? WS.World.lightsIn(vb2(6)) : [];
    for (var i = 0; i < lights.length; i++) {
      var L = lights[i];
      var s = M.toScreen(L.x - WS.Cam.cx, L.y - WS.Cam.cy);
      var sx = c.x + s.x * WS.Cam.zoom, sy = c.y + s.y * WS.Cam.zoom;
      var r = (L.r || 64) * WS.Cam.zoom * 1.6;
      // мерцание огня
      if (L.flicker) {
        var tms = performance.now() / 1000;
        r *= 0.92 + 0.08 * Math.sin(tms * 9 + L.x * 7 + L.y * 3) *
                    (0.5 + 0.5 * Math.sin(tms * 23 + L.y * 5));
      }
      var g = lightCtx.createRadialGradient(sx, sy - 8 * WS.Cam.zoom, 0, sx, sy - 8 * WS.Cam.zoom, r);
      var punch = Math.min(1, (L.a !== undefined ? L.a : 0.95) * darkness);
      g.addColorStop(0, 'rgba(0,0,0,' + punch + ')');
      g.addColorStop(0.5, 'rgba(0,0,0,' + (punch * 0.45) + ')');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      lightCtx.fillStyle = g;
      lightCtx.beginPath();
      lightCtx.arc(sx, sy - 8 * WS.Cam.zoom, r, 0, Math.PI * 2);
      lightCtx.fill();
    }
    lightCtx.globalCompositeOperation = 'source-over';
    ctx.drawImage(lightCv, 0, 0);
  }

  function vb2(pad) { return WS.Cam.viewBounds(pad || 4); }

  var vignette = null;
  function drawVignette() {
    if (!vignette || vignette.width !== cv.width || vignette.height !== cv.height) {
      vignette = document.createElement('canvas');
      vignette.width = cv.width; vignette.height = cv.height;
      var vctx = vignette.getContext('2d');
      var g = vctx.createRadialGradient(
        cv.width / 2, cv.height / 2, Math.min(cv.width, cv.height) * 0.35,
        cv.width / 2, cv.height / 2, Math.max(cv.width, cv.height) * 0.72);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(2,6,14,0.42)');
      vctx.fillStyle = g;
      vctx.fillRect(0, 0, cv.width, cv.height);
    }
    ctx.drawImage(vignette, 0, 0);
  }

  WS.boot(function initGfx() {
    M = WS.M;
    Gfx.init();
    // рендер идёт из Loop.frame -> Gfx.frame, приоритет 70 зарегистрирован ниже
    WS.tick(70, function renderTick() {
      Gfx.frame();
    }, 'gfx:render');
  }, 'gfx:init');

  WS.def('Gfx', Gfx);
})();
