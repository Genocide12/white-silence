/**
 * Математика: векторы, утилиты, изометрические преобразования.
 * Изометрия 2:1 — ромб 64x32: screenX = (wx-wy)*32, screenY = (wx+wy)*16.
 */
(function () {
  'use strict';

  var TW = 64, TH = 32, HW = 32, HH = 16;   // размеры тайла на экране

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function dist(ax, ay, bx, by) { var dx = bx - ax, dy = by - ay; return Math.sqrt(dx * dx + dy * dy); }
  function dist2(ax, ay, bx, by) { var dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; }
  function ang(ax, ay, bx, by) { return Math.atan2(by - ay, bx - ax); }

  /** Направление в 8 сторон из вектора. 0=В, 1=СВ, 2=С, 3=СЗ, 4=З, 5=ЮЗ, 6=Ю, 7=ЮВ (экранные). */
  function dir8(dx, dy) {
    var a = Math.atan2(dy, dx);
    var oct = Math.round(a / (Math.PI / 4)) & 7;   // 0=E..7=SE
    return (oct + 6) & 7;                          // 0=N,1=NE,2=E,3=SE,4=S,5=SW,6=W,7=NW
  }

  function dir4(dx, dy) { return dir8(dx, dy) & 3 ? ((dir8(dx, dy) + 1) >> 1) & 3 : 0; }

  /** Мир -> экран. Возвращает {x, y} в пикселях относительно 0,0 мира. */
  function toScreen(wx, wy) {
    return { x: (wx - wy) * HW, y: (wx + wy) * HH };
  }

  /** Экран -> мир (обратное преобразование). */
  function toWorld(sx, sy) {
    return { x: (sx / HW + sy / HH) / 2, y: (sy / HH - sx / HW) / 2 };
  }

  /** Округление к ближайшему тайлу. */
  function snap(wx, wy) { return { x: Math.floor(wx), y: Math.floor(wy) }; }

  /** Стандартное отклонение/гаусс: Box-Muller с переданным R. */
  function gauss(rng) {
    var u = 1 - rng.f(), v = rng.f();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /** Плавное приближение current к target: dt — время кадра. */
  function approach(cur, target, rate, dt) {
    var d = target - cur;
    var step = rate * dt;
    if (Math.abs(d) <= step) return target;
    return cur + Math.sign(d) * step;
  }

  /** Проверка пересечения прямоугольников. */
  function rectHit(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  /** Расстояние от точки до отрезка. */
  function pointSegDist(px, py, x1, y1, x2, y2) {
    var dx = x2 - x1, dy = y2 - y1;
    var l2 = dx * dx + dy * dy;
    if (l2 === 0) return dist(px, py, x1, y1);
    var t = clamp(((px - x1) * dx + (py - y1) * dy) / l2, 0, 1);
    return dist(px, py, x1 + t * dx, y1 + t * dy);
  }

  /** Нормализация угла в [-PI, PI]. */
  function angNorm(a) {
    while (a > Math.PI) a -= 2 * Math.PI;
    while (a < -Math.PI) a += 2 * Math.PI;
    return a;
  }

  /** Разница углов a->b через короткую дугу. */
  function angDiff(a, b) { return angNorm(b - a); }

  /** Форматирование веса: 0.456 -> "0.46". */
  function fmtKg(kg) { return (Math.round(kg * 100) / 100).toFixed(2); }

  WS.def('M', {
    TW: TW, TH: TH, HW: HW, HH: HH,
    clamp: clamp, lerp: lerp, dist: dist, dist2: dist2, ang: ang,
    dir8: dir8, dir4: dir4,
    toScreen: toScreen, toWorld: toWorld, snap: snap,
    gauss: gauss, approach: approach,
    rectHit: rectHit, pointSegDist: pointSegDist,
    angNorm: angNorm, angDiff: angDiff, fmtKg: fmtKg
  });
})();
