/* Смоук-тест спрайтов (запускать из node): грузим ядро WS.Spr + оба
 * спрайтовых файла с мок-DOM и рендерим КАЖДЫЙ спрайт во всех
 * кадрах/направлениях/вариантах. Ошибка рисования = WS.err -> провал.
 * Использование: node scripts/test_sprites.js
 */
'use strict';

var errLog = [];

function mkCtx() {
  return {
    fillStyle: null,
    imageSmoothingEnabled: false,
    fillRect: function () {},
    clearRect: function () {},
    save: function () {},
    restore: function () {},
    translate: function () {},
    scale: function () {},
    rotate: function () {},
    drawImage: function () {},
    beginPath: function () {},
    ellipse: function () {},
    fill: function () {},
    moveTo: function () {},
    lineTo: function () {},
    closePath: function () {},
    createRadialGradient: function () {
      return { addColorStop: function () {} };
    }
  };
}

global.document = {
  createElement: function () {
    return {
      width: 0,
      height: 0,
      getContext: function () { return mkCtx(); }
    };
  }
};

global.WS = {
  err: function (msg, e) { errLog.push(String(msg) + (e ? (' :: ' + (e && e.message)) : '')); },
  log: function () {},
  def: function (name, api) { WS[name] = api; },
  boot: function () {}
};

require('../js/core/sprites.js');
require('../js/entities/sprites_beasts.js');
require('../js/entities/sprites_critters.js');

var Spr = WS.Spr;
if (!Spr) { console.error('FAIL: WS.Spr не определён'); process.exit(1); }
if (errLog.length) {
  console.error('FAIL: ошибки при загрузке:', errLog);
  process.exit(1);
}

var sets = [
  ['BEASTS', WS.SprBeasts && WS.SprBeasts.beasts],
  ['CRITTERS', WS.SprCritters && WS.SprCritters.critters]
];

var total = 0;
var missing = [];
var failed = [];

function renderAll(label, table) {
  for (var name in table) {
    if (!table.hasOwnProperty(name)) continue;
    var meta = table[name];
    var fr = meta.frames || 1;
    var vr = meta.variants || 1;
    var dd = meta.dirs || 1;
    for (var f = 0; f < fr; f++) {
      for (var d = 0; d < dd; d++) {
        for (var v = 0; v < vr; v++) {
          total++;
          errLog.length = 0;
          var img = Spr.get(name, f, d, v);
          if (!img) { missing.push(name); continue; }
          if (errLog.length) {
            failed.push(label + ' ' + name + ' f' + f + ' d' + d + ' v' + v + ': ' + errLog[0]);
          }
        }
      }
    }
  }
}

sets.forEach(function (s) {
  if (!s[1]) { console.error('FAIL: таблица ' + s[0] + ' не найдена'); process.exit(1); }
  renderAll(s[0], s[1]);
});

// также проверяем полный мировой dir 0..7 у направленских спрайтов
var dirSprites = ['volk_alpha', 'medved_gallop', 'los_velikan', 'sobaka_krupn',
                  'kot_dvoro', 'belka_taiga'];
dirSprites.forEach(function (name) {
  for (var d = 0; d < 8; d++) {
    total++;
    errLog.length = 0;
    var img = Spr.get(name, 0, d, 0);
    if (!img) { missing.push(name); continue; }
    if (errLog.length) failed.push('dir8 ' + name + ' d' + d + ': ' + errLog[0]);
  }
});

console.log('Таблицы:',
  Object.keys(sets[0][1]).length, 'зверей +',
  Object.keys(sets[1][1]).length, 'мелочи =',
  Object.keys(sets[0][1]).length + Object.keys(sets[1][1]).length, 'имён');
console.log('Отрисовано комбинаций (кадр x напр x вариант):', total);

if (missing.length) {
  console.error('FAIL: нет спрайтов:', missing);
  process.exit(1);
}
if (failed.length) {
  console.error('FAIL: ошибки рисования (' + failed.length + '):');
  failed.slice(0, 20).forEach(function (x) { console.error(' -', x); });
  process.exit(1);
}
console.log('OK: все спрайты рисуются без ошибок.');
