/**
 * Изометрическая камера: следование за игроком/целью, зум, границы мира.
 * Камера хранит мировые координаты центра (cx, cy) и zoom.
 * screenX = (wx - wy) * 32 * zoom - camScreenX + canvasW/2 ... — реализовано ниже.
 */
(function () {
  'use strict';

  var M = null;   // WS.M (заполняется в boot)

  var Cam = {
    cx: 0, cy: 0,          // центр камеры в мировых координатах
    zoom: 1,
    minZoom: 0.5,
    maxZoom: 2.0,
    follow: null,           // сущность для следования ({x, y})
    target: null,           // временная цель (при осмотре)
    shake: 0,               // сила тряски
    _shakeX: 0, _shakeY: 0,

    /** Экран -> мир (с учётом зума и смещения канваса). */
    screenToWorld: function (sx, sy) {
        var c = Cam.canvasCenter();
        var s = M.toScreen(sx - c.x, sy - c.y);
        // обратный порядок: сначала убрать зум, потом изометрия
        var ux = (sx - c.x) / Cam.zoom;
        var uy = (sy - c.y) / Cam.zoom;
        var w = M.toWorld(ux, uy);
        return { x: w.x + Cam.cx + Cam._shakeX, y: w.y + Cam.cy + Cam._shakeY };
    },

    /** Мир -> экран (пиксели канваса). */
    worldToScreen: function (wx, wy) {
        var c = Cam.canvasCenter();
        var s = M.toScreen(wx - Cam.cx - Cam._shakeX, wy - Cam.cy - Cam._shakeY);
        return { x: s.x * Cam.zoom + c.x, y: s.y * Cam.zoom + c.y };
    },

    canvasCenter: function () {
      var cv = document.getElementById('game');
      return { x: cv.width / 2, y: cv.height / 2 };
    },

    /** Прямоугольник видимой области мира (для кулинга).
     *  Видимая в изометрии область — ромб: (wx-wy) в пределах экранной полуширины,
     *  (wx+wy) в пределах полувысоты. AABB этого ромба — полуширина (sx+sy)/2. */
    viewBounds: function (pad) {
      pad = pad || 2;
      var c = Cam.canvasCenter();
      var sx = (c.x / Cam.zoom) / M.HW;
      var sy = (c.y / Cam.zoom) / M.HH;
      var r = (sx + sy) / 2 + pad;
      return {
        x0: Cam.cx - r, x1: Cam.cx + r,
        y0: Cam.cy - r, y1: Cam.cy + r
      };
    },

    /** Тряска (урон, взрывы). */
    kick: function (power) {
      Cam.shake = Math.min(18, Cam.shake + power);
    },

    setZoom: function (z) {
      Cam.zoom = Math.max(Cam.minZoom, Math.min(Cam.maxZoom, z));
    }
  };

  WS.boot(function initCam() {
    M = WS.M;
    WS.tick(5, function camTick(dt) {
      // цель следования
      var target = Cam.follow;
      if (Cam.target) target = Cam.target;
      if (target && typeof target.x === 'number') {
        var k = 1 - Math.pow(0.0015, dt);
        Cam.cx += (target.x - Cam.cx) * k;
        Cam.cy += (target.y - Cam.cy) * k;
      }
      // границы мира
      var w = WS.World;
      if (w && w.w) {
        Cam.cx = M.clamp(Cam.cx, 4, w.w - 4);
        Cam.cy = M.clamp(Cam.cy, 4, w.h - 4);
      }
      // тряска затухает
      if (Cam.shake > 0.01) {
        Cam._shakeX = (Math.random() - 0.5) * Cam.shake * 0.5;
        Cam._shakeY = (Math.random() - 0.5) * Cam.shake * 0.5;
        Cam.shake *= Math.pow(0.02, dt);
      } else { Cam._shakeX = 0; Cam._shakeY = 0; Cam.shake = 0; }
      // зум колесом
      var m = WS.Input.mouse();
      if (m.wheel !== 0 && !(WS.Ui && WS.Ui.modal())) {
        Cam.setZoom(Cam.zoom * (m.wheel > 0 ? 1.15 : 0.87));
      }
      // обновить мировые координаты мыши
      if (WS.Input.updateMouseWorld) WS.Input.updateMouseWorld();
    }, 'cam');
  }, 'cam:init');

  WS.def('Cam', Cam);
})();
