/**
 * СВЯТКИ: событийный контент дней 35-42 (старый стиль).
 * Колядки на дверях, гадание, крещенские морозы, святочный рассказ.
 */
(function () {
  'use strict';

  function toast(text, kind) {
    if (WS.Ui && WS.Ui.toast) WS.Ui.toast(text, kind || 'info');
    else if (WS.Fx && WS.G) WS.Fx.text(text, WS.G.player.x, WS.G.player.y - 1, { life: 3 });
  }

  function chron(text) {
    if (WS.G && WS.G.story) {
      if (!WS.G.story.chronicle) WS.G.story.chronicle = [];
      WS.G.story.chronicle.push({ day: WS.Time.day(), text: text });
    }
  }

  function flags() { return WS.G && WS.G.story ? WS.G.story.flags : {}; }
  function once(k) { flags()['sv_' + k] = true; }
  function isOnce(k) { return !!flags()['sv_' + k]; }

  // ================================================================ КОЛЯДКИ
  var KOLYADKI = [
    'На двери мелом выведено: «Колядовали, ничем не угостили. — Околосные ребята». Дом запомнил.',
    'Под дверью — мёрзлый снопик ржаной. Примета: к достатку.',
    'Кто-то оставил на крыльце берестяную звезду. Восемь лучей, вырезана старательно.',
    'Слышался стук и смех — и стихло. На пороге горсть замёрзших конфет-пастилок.',
    'Кто-то колядовал и ушёл, не дождавшись. На снегу — следы маленьких валенок.'
  ];

  function tryKolyadki() {
    var day = WS.Time.day();
    if (day < 35 || day > 41) return;
    if (WS.Time.hour() !== 19) return;
    if (isOnce('kolyad_' + day)) return;
    once('kolyad_' + day);
    var pick = KOLYADKI[Math.floor(Math.random() * KOLYADKI.length)];
    toast(pick, 'info');
    if (Math.random() < 0.4) {
      // угостили — вспомнили добрым
      WS.G.player.needs.sanity = Math.min(100, WS.G.player.needs.sanity + 4);
    }
    chron('Святки: ' + pick.slice(0, 50));
  }

  // ================================================================ ГАДАНИЕ
  var PREDICTIONS = [
    { txt: 'Воск лёг дорогой — к дальней вести.', eff: 'speed', dur: 1 },
    { txt: 'Кольцо — к встрече. Не с волком, так с человеком.', eff: 'sanity', dur: 1 },
    { txt: 'Полоса поперёк — к перемене погоды.', eff: 'weather', dur: 1 },
    { txt: 'Звезда — к ясному утру и лёгкой дороге.', eff: 'speed', dur: 1 },
    { txt: 'Колокол — к звону в ушах от мороза. Одевайтесь теплее.', eff: 'warmth', dur: 1 },
    { txt: 'Птица — к удаче в охоте.', eff: 'hunt', dur: 1 },
    { txt: 'Лодка — к рыбе в проруби.', eff: 'fish', dur: 1 },
    { txt: 'Дом — к ночёвке под крышей. Не пренебрегайте ею.', eff: 'shelter', dur: 1 },
    { txt: 'Крест — к испытанию. Держите оружие под рукой.', eff: 'danger', dur: 1 },
    { txt: 'Дерево — к дровам. Заготовьте ещё, чем бы воск ни говорил.', eff: 'wood', dur: 1 }
  ];

  var activeBuffs = {};    // eff -> до какого дня

  function gadanie() {
    var day = WS.Time.day();
    if (day < 35 || day > 42) { toast('Не святки — не гадают.', 'warn'); return; }
    if (isOnce('gad_' + day)) { toast('Сегодня уже гадали. Дважды не велят.', 'warn'); return; }
    if (WS.Inv && WS.Inv.count && WS.Inv.count('candle_stump') <= 0) {
      toast('Нужна хотя бы огарочная свеча.', 'warn');
      return;
    }
    once('gad_' + day);
    if (WS.Inv && WS.Inv.take) WS.Inv.take('candle_stump', 1);
    var p = PREDICTIONS[Math.floor(Math.random() * PREDICTIONS.length)];
    activeBuffs[p.eff] = day + (p.dur || 1);
    toast('Гадание на воске: ' + p.txt, 'good');
    WS.Snd.play('match', { vol: 0.5 });
    WS.Fx.burst('spark', WS.G.player.x, WS.G.player.y - 0.5, 8);
    chron('Гадание: ' + p.txt.slice(0, 40));
  }

  // эффекты гаданий
  function buffActive(eff) {
    return activeBuffs[eff] && WS.Time.day() <= activeBuffs[eff];
  }

  // ================================================================ КРЕЩЕНСКИЕ МОРОЗЫ
  function tryEpiphanyFrost() {
    var day = WS.Time.day();
    if (day !== 39) return;
    if (isOnce('epiphany')) return;
    once('epiphany');
    if (WS.Weather && WS.Weather.forceTemp) WS.Weather.forceTemp(-16, 2);
    toast('Крещенские морозы. Дыхание леденеет в воздухе.', 'bad');
    chron('Крещенские морозы ударили');
    if (WS.Snd) WS.Snd.play('howl', { vol: 0.3 });
  }

  // ================================================================ СВЯТОЧНЫЙ РАССКАЗ
  var TALES = [
    'Старуха рассказывала: в святки душа может уйти погулять — и не найти назад дороги, если тело замёрзло. Сиди у печи, коли голова кругом.',
    'Про реку говорили: в крещенскую ночь вода в ней святая вся, до дна. Даже в полынье. Особенно в полынье.',
    'Ефим с мельницы видал: волки в святки не воют, а поют. И от этого пения хуже, чем от воя.',
    'Батюшка Никодим учил: свеча в святки горит за тех, кто не дожил. Пусть ваша — за вас.',
    'Вера Андреевна писала: дети верят, что год кончается не в декабре, а когда кончается снег. По их счёту, тут всегда новый год.',
    'Отец говорил: в святки нельзя отказывать в еде. Ни человеку, ни зверю. Особенно зверю.'
  ];

  function trySviatkiTale() {
    var day = WS.Time.day();
    if (day < 35 || day > 42) return;
    var h = WS.Time.hour();
    if (h < 18 || h > 22) return;
    if (!WS.World.isInside(WS.G.player.x, WS.G.player.y)) return;
    if (isOnce('tale_' + day)) return;
    if (Math.random() > 0.4) return;
    once('tale_' + day);
    var t = TALES[Math.floor(Math.random() * TALES.length)];
    toast('Святочный вечер. ' + t, 'info');
    WS.G.player.needs.sanity = Math.min(100, WS.G.player.needs.sanity + 6);
    chron('У костра вспомнился святочный рассказ');
  }

  // ================================================================ ТАЙМЕР
  WS.boot(function () {
    WS.tick(46, function svTick() {
      if (!WS.G || !WS.G.running || !WS.G.player) return;
      if (WS.Ui && WS.Ui.modal && WS.Ui.modal()) return;
      tryKolyadki();
      tryEpiphanyFrost();
      trySviatkiTale();
    }, 'sviatki:tick');
  }, 'sviatki:init');

  WS.def('Sviatki', {
    gadanie: gadanie,
    buffActive: buffActive,
    isActive: function () {
      var d = WS.Time.day();
      return d >= 35 && d <= 42;
    },
    isEpiphany: function () { return WS.Time.day() === 39; }
  });
})();
