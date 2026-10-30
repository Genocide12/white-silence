/**
 * КРЫШИ ЗДАНИЙ: двускатные заснеженные крыши с трубой и дымом.
 *
 * Снаружи здание накрывается крышей (сплошной силуэт, внутри не видно),
 * при входе игрока крыша растворяется, а южные/восточные стены (те, что
 * закрывали бы обзор) скрываются — интерьер полностью виден.
 *
 * API для рендера (gfx.js):
 *   WS.Roofs.visible(vb)  — псевдо-сущности крыш в зоне видимости
 *   WS.Roofs.draw(ctx, b, zoom) — нарисовать крышу здания b
 *   WS.Roofs.hideWall(tx, ty)  — скрыть стену (игрок внутри этого здания)
 */
(function () {
  'use strict';

  var M = null;
  var cache = {};        // "w|h|mat" -> canvas
  var alphas = {};       // b.id -> текущая альфа крыши
  var insideB = null;    // здание, внутри которого камера
  var smokeT = {};       // b.id -> таймер дыма

  var MATS = {
    log:   { gable: '#5c4730', gableDark: '#4c3a27', trim: '#43331f' },
    wood:  { gable: '#6b5138', gableDark: '#57422e', trim: '#4a3a28' },
    brick: { gable: '#7a4a3c', gableDark: '#63402f', trim: '#54332a' },
    stone: { gable: '#6f737b', gableDark: '#5c6068', trim: '#4c5058' }
  };

  /** Псевдо-сущности крыш для drawSorted. */
  function visible(vb) {
    var out = [];
    var bs = WS.World ? WS.World.buildings : [];
    for (var i = 0; i < bs.length; i++) {
      var b = bs[i];
      if (!b || !b.w || !b.h) continue;
      if (b.x > vb.x1 + 2 || b.x + b.w < vb.x0 - 2 ||
          b.y > vb.y1 + 2 || b.y + b.h < vb.y0 - 2) continue;
      var a = alpha(b);
      if (a < 0.03) continue;
      out.push({ isRoof: true, b: b, x: b.x + b.w - 0.5, y: b.y + b.h - 0.5 });
    }
    return out;
  }

  function alpha(b) {
    var a = alphas[b.id];
    return a === undefined ? 1 : a;
  }

  /** Текущая альфа с анимацией входа/выхода. */
  function draw(ctx, b, zoom) {
    var a = alpha(b);
    var cv = roofCanvas(b);
    if (!cv) return;
    var cam = WS.Cam;
    var s = M.toScreen(b.x - cam.cx - cam._shakeX, b.y - cam.cy - cam._shakeY);
    var c = cam.canvasCenter();
    ctx.save();
    if (a < 1) ctx.globalAlpha = a;   // при полной непрозрачности — быстрый блит без альфы
    // мягкая тень здания на снегу: пятно чуть больше пятна к ЮВ от здания
    var shx = 1.6, shy = 1.6;
    var pts = [
      M.toScreen(b.x - 0.4 - cam.cx, b.y - 0.4 - cam.cy),
      M.toScreen(b.x + b.w + shx - cam.cx, b.y - 0.4 - cam.cy),
      M.toScreen(b.x + b.w + shx - cam.cx, b.y + b.h + shy - cam.cy),
      M.toScreen(b.x - 0.4 - cam.cx, b.y + b.h + shy - cam.cy)
    ];
    ctx.fillStyle = 'rgba(14,20,34,0.24)';
    ctx.beginPath();
    for (var i = 0; i < pts.length; i++) {
      var px = c.x + pts[i].x * zoom, py = c.y + pts[i].y * zoom;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.drawImage(cv.cv,
      Math.round(c.x + (s.x - cv.lx) * zoom), Math.round(c.y + (s.y - cv.ty) * zoom),
      Math.ceil(cv.cv.width * zoom), Math.ceil(cv.cv.height * zoom));
    ctx.restore();
  }

  /** Скрыть ли стену на тайле (игрок внутри — прячем южный ряд и восточный столбец). */
  function hideWall(tx, ty) {
    if (!insideB) return false;
    var b = insideB;
    if (ty === b.y + b.h - 1 && tx >= b.x && tx < b.x + b.w) return true;   // южный ряд
    if (tx === b.x + b.w - 1 && ty >= b.y && ty < b.y + b.h) return true;   // восточный столбец
    return false;
  }

  // ---------------------------------------------------------------- генерация

  /** Кэшированный канвас крыши + якоря (lx, ty — сдвиг верхнего левого угла от N-угла). */
  /** Кэшированный канвас крыши + якоря (lx, ty — сдвиг верхнего левого угла от N-угла).
   *  Геометрия: свесы крыши на ВЫСОТЕ ВЕРХА СТЕН (WH=32 над землёй), конёк выше
   *  на RH. Рисуем все видимые из южной камеры плоскости:
   *  вдоль X: задний скат, передний скат, восточный и западный фронтоны;
   *  вдоль Y: западный и восточный скаты, южный фронтон, северный фронтон (дальний).
   */
  function roofCanvas(b) {
    var key = b.w + '|' + b.h + '|' + (MATS[b.material] ? b.material : 'wood');
    if (cache[key]) return cache[key];

    var w = b.w, h = b.h;
    var mat = MATS[b.material] || MATS.wood;
    var along = w >= h;                     // конёк вдоль длинной оси
    var B = along ? h : w;
    var RH = Math.round(13 + Math.min(6, B) * 2.4);   // высота конька над стеной
    var WH = 32;                            // высота стены ( верх тайла-куба)
    var OV = 8;                             // вынос свеса за пятно

    // Углы пятна в экранных координатах относительно N-угла здания, ПОДНЯТЫЕ
    // на высоту стены WH (свес лежит на верху стены):
    //   N=(0,-WH) E=(32w,16w-WH) S=(32(w-h),16(w+h)-WH) W=(-32h,16h-WH)
    function lift(p) { return { x: p.x, y: p.y - WH }; }
    var N = lift({ x: 0, y: 0 });
    var E = lift({ x: 32 * w, y: 16 * w });
    var S = lift({ x: 32 * (w - h), y: 16 * (w + h) });
    var Wc = lift({ x: -32 * h, y: 16 * h });

    // Концы конька (подняты на WH + RH)
    var R1, R2;   // R1 — западный/северный конец, R2 — восточный/южный
    if (along) {
      R1 = { x: -16 * h, y: 8 * h - WH - RH };
      R2 = { x: 32 * w - 16 * h, y: 16 * w + 8 * h - WH - RH };
    } else {
      R2 = { x: 16 * w, y: 8 * w - WH - RH };                       // северный конец
      R1 = { x: 16 * w - 32 * h, y: 16 * h + 8 * w - WH - RH };     // южный конец
    }

    var minX = Math.min(N.x, Wc.x, S.x, E.x, R1.x, R2.x) - OV;
    var maxX = Math.max(N.x, Wc.x, S.x, E.x, R1.x, R2.x) + OV;
    var minY = Math.min(N.y, R1.y, R2.y) - 34;   // запас под трубу со снегом
    var maxY = Math.max(S.y, E.y, Wc.y) + 12;    // сосульки и тень свеса на стенах

    var cv = document.createElement('canvas');
    cv.width = Math.ceil(maxX - minX);
    cv.height = Math.ceil(maxY - minY);
    var c = cv.getContext('2d');
    c.imageSmoothingEnabled = false;
    var LX = -minX, TY = -minY;
    function P(p) { return { x: p.x + LX, y: p.y + TY }; }
    function poly() {
      c.beginPath();
      for (var i = 0; i < arguments.length; i++) {
        var p = P(arguments[i]);
        if (i === 0) c.moveTo(p.x, p.y); else c.lineTo(p.x, p.y);
      }
      c.closePath();
    }

    var pN = P(N), pE = P(E), pS = P(S), pW = P(Wc), pR1 = P(R1), pR2 = P(R2);

    if (along) {
      // 1) задний (северный) скат — виден над коньком, чуть темнее
      c.fillStyle = '#c3cddc';
      poly(N, E, R2, R1); c.fill();
      // 2) передний (южный) скат — главный, светлый снег
      c.fillStyle = '#dde5ef';
      poly(Wc, S, R2, R1); c.fill();
      // 3) восточный фронтон (вертикальный торец)
      c.fillStyle = mat.gable;
      poly(E, S, R2); c.fill();
      c.fillStyle = 'rgba(8,12,22,0.16)';
      poly(E, S, R2); c.fill();
      // 4) западный фронтон (дальний торец) — темнее
      c.fillStyle = mat.gableDark;
      poly(N, Wc, R1); c.fill();
    } else {
      // 1) западный скат
      c.fillStyle = '#dde5ef';
      poly(N, Wc, R1, R2); c.fill();
      // 2) восточный скат — чуть темнее
      c.fillStyle = '#c9d3e2';
      poly(E, S, R1, R2); c.fill();
      // 3) северный фронтон (дальний) — виден над коньком
      c.fillStyle = mat.gableDark;
      poly(N, E, R2); c.fill();
      // 4) южный фронтон (ближний, к камере) — вертикальная стена-торец
      c.fillStyle = mat.gable;
      poly(Wc, S, R1); c.fill();
      c.fillStyle = 'rgba(8,12,22,0.16)';
      poly(Wc, S, R1); c.fill();
    }

    // штрихи-доски на переднем скате (вдоль конька)
    c.strokeStyle = 'rgba(150,160,178,0.28)';
    c.lineWidth = 1;
    for (var f = 1; f <= 3; f++) {
      var t = f / 4;
      c.beginPath();
      if (along) {
        c.moveTo(pW.x + (pS.x - pW.x) * t, pW.y + (pS.y - pW.y) * t);
        c.lineTo(pR1.x + (pR2.x - pR1.x) * t, pR1.y + (pR2.y - pR1.y) * t);
      } else {
        c.moveTo(pN.x + (pW.x - pN.x) * t, pN.y + (pW.y - pN.y) * t);
        c.lineTo(pR2.x + (pR1.x - pR2.x) * t, pR2.y + (pR1.y - pR2.y) * t);
      }
      c.stroke();
    }
    // светлый снег у конька
    c.strokeStyle = 'rgba(242,247,253,0.95)';
    c.lineWidth = 3;
    c.beginPath(); c.moveTo(pR1.x, pR1.y); c.lineTo(pR2.x, pR2.y); c.stroke();
    c.strokeStyle = 'rgba(214,223,232,0.5)';
    c.lineWidth = 2;
    c.beginPath(); c.moveTo(pR1.x, pR1.y + 3); c.lineTo(pR2.x, pR2.y + 3); c.stroke();

    // тень свеса на стенах (юг и восток) — мягкая тёмная полоса под кромкой
    c.strokeStyle = 'rgba(10,14,24,0.30)';
    c.lineWidth = 6;
    c.beginPath();
    c.moveTo(pW.x, pW.y + 2); c.lineTo(pS.x, pS.y + 2); c.lineTo(pE.x, pE.y + 2);
    c.stroke();
    c.strokeStyle = 'rgba(10,14,24,0.22)';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(pW.x, pW.y + 2); c.lineTo(pS.x, pS.y + 2); c.lineTo(pE.x, pE.y + 2);
    c.stroke();

    // карниз: тёмная линия кромки
    c.strokeStyle = mat.trim;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(pW.x, pW.y + 1); c.lineTo(pS.x, pS.y + 1); c.lineTo(pE.x, pE.y + 1);
    c.stroke();

    // сосульки на южном и восточном свесах (W→S→E)
    c.fillStyle = 'rgba(196,218,240,0.9)';
    var nIc = Math.max(5, Math.round(w + h));
    for (var i = 0; i <= nIc; i++) {
      var tt = i / nIc;
      var ix, iy;
      if (tt < 0.5) { var t2 = tt * 2; ix = pW.x + (pS.x - pW.x) * t2; iy = pW.y + (pS.y - pW.y) * t2; }
      else { var t3 = (tt - 0.5) * 2; ix = pS.x + (pE.x - pS.x) * t3; iy = pS.y + (pE.y - pS.y) * t3; }
      var len = 4 + ((i * 7) % 6);
      c.beginPath();
      c.moveTo(ix - 2, iy + 2); c.lineTo(ix + 2, iy + 2); c.lineTo(ix, iy + 2 + len);
      c.closePath(); c.fill();
    }

    // труба на коньке (60% вдоль) — кирпичная, со снежной шапкой
    var px = pR1.x + (pR2.x - pR1.x) * 0.6;
    var py = pR1.y + (pR2.y - pR1.y) * 0.6;
    c.fillStyle = mat.gableDark;
    c.fillRect(px - 6, py - 22, 12, 22);
    c.fillStyle = mat.gable;
    c.fillRect(px - 6, py - 22, 7, 22);
    c.fillStyle = 'rgba(20,16,12,0.5)';
    c.fillRect(px - 6, py - 14, 12, 1); c.fillRect(px - 6, py - 7, 12, 1);
    c.fillStyle = 'rgba(16,12,9,0.9)';
    c.fillRect(px - 4, py - 21, 8, 3);
    c.fillStyle = 'rgba(232,238,246,0.98)';
    c.fillRect(px - 7, py - 25, 14, 4);
    c.fillRect(px - 7, py - 25, 4, 6); c.fillRect(px + 3, py - 25, 4, 6);

    var rec = { cv: cv, lx: LX, ty: TY };
    cache[key] = rec;
    return rec;
  }

  // ---------------------------------------------------------------- тик

  /** Отапливается ли здание (дым + тёплые окна). Детерминировано от позиции. */
  function heated(b) {
    return WS.RNG.hash2(b.x, b.y, 4242) < 0.45;
  }

  var winLights = [];    // [{L, tileKey}] — свет окон отапливаемых домов

  /** Добавить тёплый свет к окнам отапливаемых зданий (после генерации). */
  function addWindowLights() {
    removeWindowLights();
    var W = WS.World;
    if (!W || !W.buildings) return;
    for (var i = 0; i < W.buildings.length; i++) {
      var b = W.buildings[i];
      if (!b || !b.windows || !heated(b)) continue;
      for (var k = 0; k < b.windows.length; k++) {
        var wn = b.windows[k];
        var L = W.addLight({
          x: wn.x + 0.5, y: wn.y + 0.5, r: 40, a: 0.55,
          win: true, flicker: true
        });
        winLights.push({ L: L, key: wn.x + ',' + wn.y });
      }
    }
  }

  function removeWindowLights() {
    var W = WS.World;
    for (var i = 0; i < winLights.length; i++) {
      if (W && W.removeLight) W.removeLight(winLights[i].L);
    }
    winLights = [];
  }

  WS.boot(function initRoofs() {
    M = WS.M;
    // после генерации мира — зажечь окна в отапливаемых домах
    WS.Ev.on('gen:interiors', function () { addWindowLights(); });
    WS.Ev.on('game:start', function () { addWindowLights(); });
    WS.Ev.on('game:load', function () { addWindowLights(); });
    WS.tick(6, function roofsTick(dt) {
      var G = WS.G;
      var cam = WS.Cam;
      if (!G || !G.running || !WS.World || !WS.World.buildings) { insideB = null; return; }

      // здание под камерой (камера следует за игроком)
      var nowInside = WS.World.isInside(cam.cx, cam.cy);
      if (nowInside !== insideB) {
        insideB = nowInside;
        if (WS.Gfx && WS.Gfx.dirty) WS.Gfx.dirty();   // перестроить чанки со скрытыми стенами
      }

      // анимация альф
      var bs = WS.World.buildings;
      for (var i = 0; i < bs.length; i++) {
        var b = bs[i];
        if (!b || !b.id) continue;
        var target = (b === insideB) ? 0 : 1;
        var cur = alphas[b.id] === undefined ? 1 : alphas[b.id];
        if (cur !== target) {
          var step = dt * 3.4;
          cur = cur + Math.max(-step, Math.min(step, target - cur));
          alphas[b.id] = cur;
        }
      }

      // дым из труб отапливаемых домов рядом с камерой
      var p = G.player;
      for (var k = 0; k < bs.length; k++) {
        var bb = bs[k];
        if (!bb || !bb.w) continue;
        if (!heated(bb)) continue;
        var dx = bb.x + bb.w / 2 - (p ? p.x : 1e9);
        var dy = bb.y + bb.h / 2 - (p ? p.y : 1e9);
        if (dx * dx + dy * dy > 60 * 60) continue;
        smokeT[bb.id] = (smokeT[bb.id] || Math.random()) - dt;
        if (smokeT[bb.id] <= 0) {
          smokeT[bb.id] = 0.34 + Math.random() * 0.4;
          var along = bb.w >= bb.h;
          var RH = Math.round(13 + Math.min(6, (along ? bb.h : bb.w)) * 2.4);
          var wx = along ? bb.x + bb.w * 0.6 : bb.x + bb.w / 2;
          var wy = along ? bb.y + bb.h / 2 : bb.y + bb.h * 0.6;
          if (WS.Fx && WS.Fx.spawn) {
            WS.Fx.spawn('chimney', wx, wy, {
              world: true, z: 32 + RH + 30,   // конёк на высоте стены + конёк + труба
              vx: 0.05 + Math.random() * 0.09, vy: -0.02,
              grav: -14, life: 4.2 + Math.random() * 1.6,
              size: 8 + Math.random() * 5, col: '#7e8a9c'
            });
          }
        }
      }
      // пар дыхания игрока на морозе
      if (p && !p.sleeping) {
        var airT = (G.weather && typeof G.weather.temp === 'number') ? G.weather.temp : -15;
        if (airT < -5) {
          breathT = (breathT === undefined ? 1.6 : breathT) - dt;
          if (breathT <= 0) {
            breathT = 1.8 + Math.random() * 1.6 - Math.min(1.0, -airT / 25);
            if (WS.Fx && WS.Fx.spawn) {
              var dirV = [[0, -1], [0.7, -0.7], [1, 0], [0.7, 0.7], [0, 1], [-0.7, 0.7], [-1, 0], [-0.7, -0.7]][p.dir || 0] || [0, -1];
              WS.Fx.spawn('breath', p.x, p.y, {
                world: true, z: 26,
                vx: dirV[0] * 0.14, vy: dirV[1] * 0.14,
                grav: -3, life: 1.3 + Math.random() * 0.6,
                size: 5, col: '#c9d4e2'
              });
            }
          }
        }
      }
    }, 'roofs');
  }, 'roofs:init');

  var breathT;

  WS.def('Roofs', {
    visible: visible,
    draw: draw,
    hideWall: hideWall,
    inside: function () { return insideB; }
  });
})();
