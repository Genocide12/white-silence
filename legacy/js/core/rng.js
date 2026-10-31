/**
 * Детерминированный генератор случайных чисел (mulberry32) + шум.
 * Весь мир генерируется из seed, поэтому сохранение = seed + диффы.
 */
(function () {
  'use strict';

  /** Создать генератор. R = WS.RNG.mk(12345); R.f() -> [0,1). */
  function mk(seed) {
    var a = seed >>> 0;
    if (a === 0) a = 0x9E3779B9;
    var calls = 0;
    var rng = {
      seed: seed >>> 0,
      calls: 0,
      f: function () {          // [0, 1)
        calls++;
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        var t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      },
      range: function (lo, hi) { // [lo, hi)
        return lo + rng.f() * (hi - lo);
      },
      int: function (lo, hi) {   // целое [lo, hi] включительно
        return Math.floor(lo + rng.f() * (hi - lo + 1));
      },
      chance: function (p) {    // true с вероятностью p
        return rng.f() < p;
      },
      pick: function (arr) {    // случайный элемент массива
        return arr[Math.floor(rng.f() * arr.length)];
      },
      /** Перетасовать массив (на месте) и вернуть его. */
      shuffle: function (arr) {
        for (var i = arr.length - 1; i > 0; i--) {
          var j = Math.floor(rng.f() * (i + 1));
          var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
        }
        return arr;
      },
      /** Взвешенный выбор: items = [{w: вес, ...}] или [{weight: w}]. */
      weighted: function (items) {
        var total = 0;
        for (var i = 0; i < items.length; i++) total += items[i].w !== undefined ? items[i].w : (items[i].weight || 1);
        var r = rng.f() * total;
        for (var k = 0; k < items.length; k++) {
          r -= items[k].w !== undefined ? items[k].w : (items[k].weight || 1);
          if (r <= 0) return items[k];
        }
        return items[items.length - 1];
      },
      /** Стабильный хэш строки -> uint32. */
      callsMade: function () { return calls; }
    };
    return rng;
  }

  /** Хэш строки в uint32 (для seed из строк). */
  function strHash(s) {
    var h = 2166136261 >>> 0;
    s = String(s);
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  /** Целочисленный 2D-хэш -> [0,1). Детерминирован, без состояния. */
  function hash2(x, y, seed) {
    var h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + ((seed || 0) | 0)) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0;
    h = Math.imul(h, 1274126177) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  /** Целочисленный 3D-хэш -> [0,1). */
  function hash3(x, y, z, seed) {
    var h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) +
             Math.imul(z | 0, 2246822519) + ((seed || 0) | 0)) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0;
    h = Math.imul(h, 1274126177) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  /** Сглаженный value-noise 2D. */
  function valueNoise2(x, y, seed) {
    var xi = Math.floor(x), yi = Math.floor(y);
    var xf = x - xi, yf = y - yi;
    var u = xf * xf * (3 - 2 * xf);
    var v = yf * yf * (3 - 2 * yf);
    var a = hash2(xi, yi, seed);
    var b = hash2(xi + 1, yi, seed);
    var c = hash2(xi, yi + 1, seed);
    var d = hash2(xi + 1, yi + 1, seed);
    return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
  }

  /** Фрактальный шум (сумма октав). */
  function fbm2(x, y, seed, octaves) {
    octaves = octaves || 4;
    var sum = 0, amp = 0.5, freq = 1, norm = 0;
    for (var i = 0; i < octaves; i++) {
      sum += amp * valueNoise2(x * freq, y * freq, (seed + i * 101) >>> 0);
      norm += amp; amp *= 0.5; freq *= 2;
    }
    return sum / norm;
  }

  WS.def('RNG', {
    mk: mk,
    strHash: strHash,
    hash2: hash2,
    hash3: hash3,
    valueNoise2: valueNoise2,
    fbm2: fbm2
  });
})();
