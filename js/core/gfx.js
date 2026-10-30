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
      // ВАЖНО: lightCv создаётся ДО resize() — иначе resize пропустит его
      // размер (if (lightCv)) и канвас тьмы останется дефолтным 300x150:
      // ночью затемнялся только угол 300x150, весь остальной кадр оставался
      // дневным (баг найден пиксельным аудитом ночного кадра).
      lightCv = document.createElement('canvas');
      lightCtx = lightCv.getContext('2d');
      Gfx.resize();
      window.addEventListener('resize', Gfx.resize);
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

  /** Отрисовка чанка террейна через кэш.
   *  Координаты чанка — ОТНОСИТЕЛЬНО КАМЕРЫ: toScreen(wx - cam.cx, wy - cam.cy).
   *  Внутренний канвас чанка сдвинут по X на CHUNK*HW (ромб изометрии уходит
   *  в минус по X при lx < ly — без сдвига половина тайлов обрезалась бы).
   */
  function drawChunk(cx, cy, zoom) {
    var key = cx + ',' + cy;
    var w = WS.World;
    var entry = chunkCache[key];
    if (!entry || entry.ver !== w.ver) {
      entry = renderChunkToCanvas(cx, cy);
      chunkCache[key] = entry;
    }
    var c = WS.Cam.canvasCenter();
    var wx = cx * CHUNK, wy = cy * CHUNK;
    // верхний угол чанка относительно камеры (с учётом запаса YOFF сверху)
    var s = M.toScreen(wx - WS.Cam.cx - WS.Cam._shakeX, wy - WS.Cam.cy - WS.Cam._shakeY);
    // округляем позицию и добавляем 1px перекрытия — иначе на дробном зуме
    // между чанками мерцают чёрные швы
    var dx = Math.round(c.x + (s.x - CHUNK * M.HW) * zoom);
    var dy = Math.round(c.y + (s.y - YOFF) * zoom);
    ctx.drawImage(entry.cv, dx, dy,
      Math.ceil(entry.cv.width * zoom) + 1, Math.ceil(entry.cv.height * zoom) + 1);
  }

  var XOFF = 512, YOFF = 32;   // сдвиги внутри чанк-канваса (изометрия уходит в минус)

  function renderChunkToCanvas(cx, cy) {
    var w = WS.World;
    var pxW = CHUNK * M.TW;
    var pxH = CHUNK * M.TH + M.TH * 2;   // запас: сверху высокие тайлы, снизу грани
    var off = document.createElement('canvas');
    off.width = pxW; off.height = pxH;
    var octx = off.getContext('2d');
    octx.imageSmoothingEnabled = false;
    var X = XOFF, Y = YOFF;

    // Сбор и сортировка тайлов чанка: сначала все плоские полы (они не
    // перекрываются), затем высокие (стены) в порядке (lx+ly) — чтобы грань
    // стены всегда ложилась поверх пола перед ней. Высокие тайлы якорятся
    // НИЗОМ в ромб тайла.
    var flat = [], tall = [];
    for (var ly = 0; ly < CHUNK; ly++) {
      for (var lx = 0; lx < CHUNK; lx++) {
        var tx = cx * CHUNK + lx, ty = cy * CHUNK + ly;
        if (tx < 0 || ty < 0 || tx >= w.w || ty >= w.h) continue;
        // внутри здания — прячем южные/восточные стены (Roofs управляет)
        if (WS.Roofs && WS.Roofs.hideWall(tx, ty)) continue;
        var tile = w.tileAt(tx, ty);
        var spr = WS.Spr ? WS.Spr.tile(tile, tx, ty) : null;
        if (!spr) continue;
        (spr.height > M.TH ? tall : flat).push({ lx: lx, ly: ly, spr: spr, tile: tile, tx: tx, ty: ty });
      }
    }
    for (var i = 0; i < flat.length; i++) drawTile(octx, flat[i], X, Y);
    tall.sort(function (a, b) { return (a.lx + a.ly) - (b.lx + b.ly) || a.lx - b.lx; });
    for (var j = 0; j < tall.length; j++) drawTile(octx, tall[j], X, Y);
    return { cv: off, ver: w.ver };
  }

  var STAND_T = null;   // тайлы-«стоячие» декорации: база — центр ромба, как у сущностей

  var _rimCache = {}, _rimSeq = 0;
  /** Силуэт спрайта светлым тоном (для контура героя): рисуем картинку,
   *   заливаем цветом через source-in. Кэшируется по ссылке на канвас. */
  function rimSprite(img) {
    var key = img._rimK || (img._rimK = 'rim' + (_rimSeq++));
    var c = _rimCache[key];
    if (c) return c;
    var cv = document.createElement('canvas');
    cv.width = img.width + 8; cv.height = img.height + 8;
    var x = cv.getContext('2d');
    x.imageSmoothingEnabled = false;
    x.drawImage(img, 4, 4);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = '#e8f2ff';
    x.fillRect(0, 0, cv.width, cv.height);
    _rimCache[key] = cv;
    return cv;
  }

  function drawTile(octx, t, X, Y) {
    var s = M.toScreen(t.lx, t.ly);
    if (!STAND_T) {
      var T = WS.World.T;
      STAND_T = {};
      if (T) { STAND_T[T.FENCE] = 1; STAND_T[T.RAIL] = 1; }
    }
    var y;
    if (STAND_T[t.tile]) {
      // стоячая декорация (забор, перила): стоит в центре тайла
      y = s.y + M.HH - t.spr.height + Y;
    } else if (t.spr.height > M.TH) {
      // стены-кубы: низ базового ромба совпадает с ромбом тайла
      y = s.y + M.TH - t.spr.height + Y;
    } else {
      y = s.y + Y;
    }
    octx.drawImage(t.spr, s.x - M.HW + X, y, t.spr.width, t.spr.height);
    var over = WS.Spr ? WS.Spr.tileOverlay(t.tile, t.tx, t.ty) : null;
    if (over) octx.drawImage(over, s.x - M.HW + X, y, over.width, over.height);
  }

  /** Сущности и объекты — сортировка по (x+y), рисуем с тенями. */
  function drawSorted(vb, zoom) {
    var list = WS.World.query(vb.x0 - 3, vb.y0 - 3, vb.x1 + 3, vb.y1 + 3);
    // крыши зданий рядом — как псевдо-сущности с ключом сортировки в южном
    // углу здания: всё, что южнее, рисуется поверх крыши
    if (WS.Roofs) list = list.concat(WS.Roofs.visible(vb));
    if (!list.length) return;
    var c = WS.Cam.canvasCenter();
    list.sort(function (a, b) { return (a.x + a.y) - (b.x + b.y); });
    // Экранный прямоугольник героя — для заслонения крон: деревья, чьи
    // спрайты перекрывают героя на экране И рисуются после него (ключ
    // сортировки >=), притапливаются прозрачностью. Без этого в густом
    // лесу герой полностью прятался под кронами (найдено VLM-аудитом
    // кадра леса: маркер под ногами виден, спрайта нет).
    var pEnt = (WS.G && WS.G.player && !WS.G.player.hidden) ? WS.G.player : null;
    var pr = null;
    if (pEnt && list.indexOf(pEnt) >= 0) {
      var ps = M.toScreen(pEnt.x - WS.Cam.cx - WS.Cam._shakeX, pEnt.y - WS.Cam.cy - WS.Cam._shakeY);
      var psx2 = c.x + ps.x * zoom, psy2 = c.y + (ps.y + M.HH) * zoom;
      pr = { x0: psx2 - 18 * zoom, x1: psx2 + 18 * zoom, y0: psy2 - 50 * zoom, y1: psy2 + 4 * zoom };
    }
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (e.hidden) continue;
      if (e.isRoof) { WS.Roofs.draw(ctx, e.b, zoom); continue; }
      var s = M.toScreen(e.x - WS.Cam.cx - WS.Cam._shakeX, e.y - WS.Cam.cy - WS.Cam._shakeY);
      // ноги сущности — в ЦЕНТРЕ ромба тайла (+HH), а не в верхнем углу
      var sx = c.x + s.x * zoom, sy = c.y + (s.y + M.HH) * zoom;
      // маркер игрока: мягкая подложка ПОД тенью (слабое свечение снега)
      if (e.marker) {
        ctx.save();
        ctx.globalAlpha = 0.22;
        ctx.fillStyle = '#dce8ff';
        ctx.beginPath();
        ctx.ellipse(sx, sy + 2 * zoom, 17 * zoom, 8 * zoom, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
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
        var sc = (e.scale || 1) * (e.marker ? 1.12 : 1);   // герой чуть крупнее — читаемость
        // деревья: детерминированное разнообразие размера (лес не по линейке)
        if (!e.scale && e.sprName && e.sprName.indexOf('tree_') === 0) {
          sc *= 0.86 + WS.RNG.hash2(e.x, e.y, 555) * 0.34;
        }
        var iw = img.width * zoom * sc;
        var ih = img.height * zoom * sc;
        // крона заслоняет героя? — рисуем полупрозрачно (герой читается сквозь)
        var occl = false;
        if (pr && e !== pEnt && e.sprName && e.sprName.indexOf('tree_') === 0 &&
            (e.x + e.y) >= (pEnt.x + pEnt.y) &&
            sx - iw / 2 < pr.x1 && sx + iw / 2 > pr.x0 && sy - ih < pr.y1 && sy > pr.y0) {
          occl = true;
        }
        if (occl) { ctx.save(); ctx.globalAlpha = 0.45; }
        // морозный контур героя: светлый силуэт чуть крупнее — герой читается
        // на любом фоне (тёмный лес, сумерки, кроны)
        if (e.marker && !occl) {
          var rim = rimSprite(img);
          var rw = iw * 1.22, rh = ih * 1.22;
          ctx.save();
          ctx.globalAlpha = 0.65;
          ctx.drawImage(rim, sx - rw / 2, sy - rh + 3 * zoom, rw, rh);
          ctx.restore();
        }
        ctx.drawImage(img, sx - iw / 2, sy - ih, iw, ih);
        if (occl) ctx.restore();
      }
      // маркер игрока — ПОВЕРХ тени и спрайта обода: герой всегда виден на снегу
      if (e.marker) {
        ctx.save();
        ctx.globalAlpha = 0.30;
        ctx.fillStyle = '#eaf2ff';
        ctx.beginPath();
        ctx.ellipse(sx, sy + 2 * zoom, 15 * zoom, 6.5 * zoom, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.62;
        ctx.strokeStyle = 'rgba(250,252,255,0.9)';
        ctx.lineWidth = Math.max(1, zoom);
        ctx.beginPath();
        ctx.ellipse(sx, sy + 2 * zoom, 15 * zoom, 6.5 * zoom, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      if (e.render && typeof e.render === 'function') e.render(ctx, sx, sy, zoom);
    }
  }

  /** Тонировка времени суток + тьма с вырезанными источниками света. */
  function applyLight() {
    if (!WS.Time) return;
    var t = WS.Time.hourF();
    var day = WS.Time.day();

    // ambient: от солнца (0 ночью .. 1 днём) с учётом погоды.
    // Подъём корнем: полярным днём (свет 0.3-0.7 в ноябре) мир остаётся
    // читаемым, снег — белым; ночью тьма по-прежнему полная.
    // Линейная формула затемняла утро 8:00 на 59% — кадр превращался
    // в серую кашу (поймано пиксельным аудитом после фикса размера lightCv).
    var sun = WS.Time.light();
    var weatherDim = WS.Weather ? WS.Weather.lightDim() : 0;
    var ambient = Math.sqrt(Math.max(0, sun * (1 - weatherDim * 0.5)));
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

    // вырезаем свет источников: 'destination-out' КЭШИРОВАННЫМ спрайтом-градиентом
    // (создание радиального градиента на каждый свет каждый кадр — узкое место)
    var punchSpr = getPunchSprite();
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
      // за пределами экрана (с запасом радиуса) — не рисуем
      if (sx < -r || sy < -r || sx > cv.width + r || sy > cv.height + r) continue;
      var punch = Math.min(1, (L.a !== undefined ? L.a : 0.95) * darkness);
      lightCtx.globalAlpha = punch;
      lightCtx.drawImage(punchSpr, sx - r, sy - 8 * WS.Cam.zoom - r, r * 2, r * 2);
    }
    lightCtx.globalAlpha = 1;
    lightCtx.globalCompositeOperation = 'source-over';
    ctx.drawImage(lightCv, 0, 0);

    // тёплый блик окон: аддитивное свечение КЭШИРОВАННЫМ спрайтом (только L.win)
    var glowSpr = getWindowGlowSprite();
    var glowA = Math.min(0.5, darkness * 0.55);
    if (glowA > 0.03) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (var wg = 0; wg < lights.length; wg++) {
        var WL = lights[wg];
        if (!WL.win) continue;
        var ws2 = M.toScreen(WL.x - WS.Cam.cx, WL.y - WS.Cam.cy);
        var wsx = c.x + ws2.x * WS.Cam.zoom, wsy = c.y + ws2.y * WS.Cam.zoom;
        var wr = (WL.r || 40) * WS.Cam.zoom * 1.35;
        if (wsx < -wr || wsy < -wr || wsx > cv.width + wr || wsy > cv.height + wr) continue;
        ctx.globalAlpha = glowA;
        ctx.drawImage(glowSpr, wsx - wr, wsy - 6 * WS.Cam.zoom - wr, wr * 2, wr * 2);
      }
      ctx.restore();
    }
  }

  var _punchSpr = null, _glowSpr = null;

  /** Спрайт-градиент «вырезания тьмы» (белый центр → прозрачный край), 128x128. */
  function getPunchSprite() {
    if (_punchSpr) return _punchSpr;
    var s = document.createElement('canvas');
    s.width = s.height = 128;
    var sc = s.getContext('2d');
    var g = sc.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(0.5, 'rgba(0,0,0,0.45)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    sc.fillStyle = g;
    sc.fillRect(0, 0, 128, 128);
    _punchSpr = s;
    return s;
  }

  /** Тёплый спрайт-свечение окон (янтарный центр → прозрачный), 128x128. */
  function getWindowGlowSprite() {
    if (_glowSpr) return _glowSpr;
    var s = document.createElement('canvas');
    s.width = s.height = 128;
    var sc = s.getContext('2d');
    var g = sc.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,196,120,0.85)');
    g.addColorStop(0.4, 'rgba(255,166,90,0.38)');
    g.addColorStop(1, 'rgba(255,150,80,0)');
    sc.fillStyle = g;
    sc.fillRect(0, 0, 128, 128);
    _glowSpr = s;
    return s;
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
