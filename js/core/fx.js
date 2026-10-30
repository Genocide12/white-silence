/**
 * Частицы и плавающий текст (урон, события).
 * WS.Fx.spawn(type, x, y, o) — частица в мире.
 * WS.Fx.text(str, x, y, o) — плавающий текст над точкой.
 * WS.Fx.update(dt) / drawWorld / drawScreen.
 */
(function () {
  'use strict';

  var parts = [];    // частицы в мировых координатах
  var texts = [];    // плавающие тексты (мировые координаты)
  var M = null;

  function spawn(type, x, y, o) {
    o = o || {};
    var p = {
      type: type,
      x: x, y: y,
      vx: o.vx || 0, vy: o.vy || 0,
      life: o.life || 0.6,
      t: 0,
      size: o.size || 3,
      col: o.col || '#fff',
      grav: o.grav !== undefined ? o.grav : 6,
      world: o.world !== false,
      z: o.z || 10        // высота над землёй (px)
    };
    parts.push(p);
    return p;
  }

  function burst(type, x, y, n, o) {
    n = n || 6;
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2;
      var sp = 0.5 + Math.random() * 2;
      var oo = o || {};
      oo.vx = Math.cos(a) * sp;
      oo.vy = Math.sin(a) * sp;
      oo.z = 6 + Math.random() * 14;
      spawn(type, x, y, oo);
    }
  }

  function text(str, x, y, o) {
    o = o || {};
    texts.push({
      s: String(str),
      x: x, y: y,
      t: 0,
      life: o.life || 1.4,
      col: o.col || '#e8e2d0',
      size: o.size || 14,
      vy: o.vy !== undefined ? o.vy : -18
    });
  }

  function update(dt) {
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      p.t += dt;
      if (p.t >= p.life) { parts.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z -= p.grav * dt;
      if (p.z < 0) { p.z = 0; p.vx *= 0.4; p.vy *= 0.4; }
    }
    for (var k = texts.length - 1; k >= 0; k--) {
      var t2 = texts[k];
      t2.t += dt;
      if (t2.t >= t2.life) texts.splice(k, 1);
      else t2.y += t2.vy * dt;
    }
  }

  function drawWorld(ctx, cam) {
    var c = cam.canvasCenter();
    var zoom = cam.zoom;
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      var s = M.toScreen(p.x - cam.cx, p.y - cam.cy);
      var sx = c.x + s.x * zoom, sy = c.y + s.y * zoom - p.z * zoom;
      var a = 1 - p.t / p.life;
      ctx.globalAlpha = a;
      ctx.fillStyle = p.col;
      var sz = p.size * zoom * (0.5 + 0.5 * a);
      if (p.type === 'blood') ctx.fillStyle = '#7a2020';
      else if (p.type === 'snow') ctx.fillStyle = '#dfe6ee';
      else if (p.type === 'smoke') { ctx.fillStyle = '#3a3f4a'; ctx.globalAlpha = a * 0.5; }
      else if (p.type === 'spark') ctx.fillStyle = '#f4b968';
      else if (p.type === 'wood') ctx.fillStyle = '#8a6d50';
      else if (p.type === 'steam') { ctx.fillStyle = '#c8d2de'; ctx.globalAlpha = a * 0.4; }
      else if (p.type === 'chimney') {
        // печной дым: тёмно-серый, разрастается и тает — виден и на снегу, и на ночном небе
        ctx.fillStyle = '#7e8a9c';
        ctx.globalAlpha = Math.min(1, a * 0.78);
        sz = p.size * zoom * (0.6 + 1.15 * (p.t / p.life));
      }
      else if (p.type === 'breath') {
        // пар дыхания на морозе: маленький, тающий
        ctx.fillStyle = '#c9d4e2';
        ctx.globalAlpha = a * 0.62;
        sz = p.size * zoom * (0.5 + 0.8 * (p.t / p.life));
      }
      ctx.fillRect(sx - sz / 2, sy - sz / 2, sz, sz);
    }
    ctx.globalAlpha = 1;
  }

  function drawScreen(ctx, cam) {
    var c = cam.canvasCenter();
    var zoom = cam.zoom;
    ctx.textAlign = 'center';
    for (var i = 0; i < texts.length; i++) {
      var t = texts[i];
      var s = M.toScreen(t.x - cam.cx, t.y - cam.cy);
      var sx = c.x + s.x * zoom, sy = c.y + s.y * zoom - 24 * zoom;
      var a = t.t < 0.15 ? t.t / 0.15 : (1 - (t.t - 0.15) / (t.life - 0.15));
      ctx.globalAlpha = Math.max(0, Math.min(1, a));
      ctx.font = 'bold ' + Math.round(t.size * (0.8 + 0.4 * Math.max(0, 1 - t.t * 2))) + 'px "PT Serif", Georgia, serif';
      ctx.strokeStyle = 'rgba(8,10,16,0.85)';
      ctx.lineWidth = 3;
      ctx.strokeText(t.s, sx, sy);
      ctx.fillStyle = t.col;
      ctx.fillText(t.s, sx, sy);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }

  WS.boot(function initFx() {
    M = WS.M;
    WS.tick(35, function fxTick(dt) { update(dt); }, 'fx');
  }, 'fx:init');

  WS.def('Fx', {
    spawn: spawn,
    burst: burst,
    text: text,
    drawWorld: drawWorld,
    drawScreen: drawScreen,
    count: function () { return parts.length; },
    clear: function () { parts = []; texts = []; }
  });
})();
