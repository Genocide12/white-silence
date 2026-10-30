/**
 * ДЕКОРАЦИИ МИРА: именные кресты кладбища, вехи, ориентиры, придорожные детали.
 * Добавляет «человечность» ландшафту: у каждой вещи — история.
 */
(function () {
  'use strict';

  // ================================================================ СПРАЙТЫ
  function defSprites() {
    var S = WS.Spr;

    // крест деревянный восьмиконечный
    S.def('cross_named', { w: 24, h: 40, draw: function (c) {
      S.px(c, 10, 8, 4, 30, '#5c4730');
      S.px(c, 4, 14, 16, 3, '#5c4730');
      S.px(c, 6, 20, 12, 2, '#4c3a27');           // косая перекладина
      c.globalAlpha = 0.5; S.ell(c, 12, 38, 9, 3, '#dfe6ee'); c.globalAlpha = 1;
      S.px(c, 9, 6, 6, 3, 'rgba(226,232,240,0.7)'); // снежная шапка
    }});
    // веха — шест с пучком сена
    S.def('veja_marker', { w: 14, h: 48, draw: function (c) {
      S.px(c, 6, 10, 2, 38, '#5c4730');
      S.px(c, 3, 6, 8, 8, '#9c8f6a');             // сено
      S.px(c, 4, 4, 6, 3, '#b0a37c');
      c.globalAlpha = 0.4; S.ell(c, 7, 47, 6, 2, '#dfe6ee'); c.globalAlpha = 1;
    }});
    // поленница двора круглая
    S.def('wood_round_stack', { w: 40, h: 28, draw: function (c) {
      for (var r = 0; r < 3; r++) {
        for (var i = 0; i < 6; i++) {
          S.ell(c, 8 + i * 5, 8 + r * 7, 3, 2.5, r % 2 ? '#7d6046' : '#8a6d50');
          S.px(c, 7 + i * 5, 7 + r * 7, 1, 1, '#57422e');
        }
      }
      S.px(c, 4, 2, 32, 4, 'rgba(226,232,240,0.55)'); // снег сверху
    }});
    // заметённая лодка
    S.def('boat_snowed', { w: 52, h: 24, draw: function (c) {
      c.beginPath(); c.moveTo(4, 10); c.quadraticCurveTo(26, 22, 48, 10);
      c.lineTo(44, 6); c.quadraticCurveTo(26, 14, 8, 6); c.closePath();
      c.fillStyle = '#6b5138'; c.fill();
      S.px(c, 8, 4, 36, 4, 'rgba(226,232,240,0.8)');
      S.px(c, 24, 2, 2, 14, '#4c3a27');          // уключина
    }});
    // вмёрзшая сеть
    S.def('net_frozen', { w: 36, h: 20, draw: function (c) {
      c.strokeStyle = 'rgba(90, 95, 106, 0.7)';
      c.lineWidth = 1;
      for (var i = 0; i < 5; i++) {
        c.beginPath(); c.moveTo(2 + i * 8, 2); c.lineTo(6 + i * 8, 16); c.stroke();
      }
      c.strokeStyle = 'rgba(226, 232, 240, 0.5)';
      c.beginPath(); c.moveTo(0, 8); c.lineTo(36, 8); c.stroke();
    }});
    // рыболовная жердь-визир у проруби
    S.def('fish_marker', { w: 12, h: 36, draw: function (c) {
      S.px(c, 5, 8, 2, 28, '#4c3a27');
      S.px(c, 3, 4, 6, 5, '#d8a45c');             // флажок
    }});
    // скворечник-гайка на столбе
    S.def('birdhouse', { w: 16, h: 20, draw: function (c) {
      S.px(c, 4, 6, 8, 10, '#8a6d50');
      c.beginPath(); c.moveTo(2, 6); c.lineTo(8, 0); c.lineTo(14, 6); c.closePath();
      c.fillStyle = '#6b5138'; c.fill();
      S.px(c, 7, 9, 2, 3, '#2a241a');             // дупло
      S.px(c, 3, 4, 10, 2, 'rgba(226,232,240,0.6)');
    }});
    // подтаявший сугроб-указатель формы
    S.def('snowdrift_shape', { w: 32, h: 16, draw: function (c) {
      S.ell(c, 16, 10, 14, 6, '#d3dbe6');
      S.ell(c, 20, 8, 8, 4, '#e2e8f0');
      S.ell(c, 10, 12, 6, 3, '#bcc7d6');
    }});
    // обломок телеги
    S.def('cart_wheel_snow', { w: 28, h: 28, draw: function (c) {
      c.strokeStyle = '#57422e'; c.lineWidth = 2;
      c.beginPath(); c.arc(14, 14, 10, 0, Math.PI * 2); c.stroke();
      for (var i = 0; i < 4; i++) {
        c.beginPath(); c.moveTo(14, 14);
        c.lineTo(14 + 10 * Math.cos(i * Math.PI / 4), 14 + 10 * Math.sin(i * Math.PI / 4));
        c.stroke();
      }
      S.ell(c, 14, 24, 10, 3, 'rgba(226,232,240,0.7)');
    }});
    // крылья мельницы (обломок)
    S.def('mill_blade', { w: 40, h: 40, draw: function (c) {
      c.save(); c.translate(20, 20);
      for (var i = 0; i < 4; i++) {
        c.rotate(Math.PI / 2);
        S.px(c, -2, 0, 4, 16, '#8a6d50');
        S.px(c, -1, 2, 2, 12, '#a89a7c');
      }
      c.restore();
      c.strokeStyle = '#4c3a27';
      c.beginPath(); c.arc(20, 20, 3, 0, Math.PI * 2); c.stroke();
    }});
    // часовенка у дороги
    S.def('road_shrine', { w: 20, h: 34, draw: function (c) {
      S.px(c, 4, 16, 12, 16, '#6b5138');          // столб
      c.beginPath(); c.moveTo(2, 16); c.lineTo(10, 6); c.lineTo(18, 16); c.closePath();
      c.fillStyle = '#57422e'; c.fill();          // кровля
      S.px(c, 7, 20, 6, 8, '#2a241a');            // ниша тёмная
      S.px(c, 8, 22, 4, 4, '#8a6d50');            // иконка
      c.globalAlpha = 0.4; S.ell(c, 10, 32, 8, 2.5, '#dfe6ee'); c.globalAlpha = 1;
    }});
  }

  // ================================================================ КЛАДБИЩЕНСКИЕ КРЕСТЫ
  var EPITAPHS = [
    { n: 'Феодот Абрамов', y: '1861 – 1902', e: '«Помер на рыбном промысле. Море отдало весло.»' },
    { n: 'Аграфена, жена его', y: '1865 – 1911', e: '«Ждала третью зиму. Не дождалась четвёртой.»' },
    { n: 'Младенец Никита', y: '1901 – 1901', e: '«От слабости. Пять дней от роду.»' },
    { n: 'Семён Балакирев', y: '1849 – 1913', e: '«Купец. Построил пилораму и церковь. Долгов не остаётся.»' },
    { n: 'Марья Тимофеевна', y: '1830 – 1915', e: '«Первая учительница Пристани. Восемь детей выучила, своих не случилось.»' },
    { n: 'Неизвестный', y: '— 1914', e: '«Найден весной под льдом. Так и не сказали, чей.»' },
    { n: 'Лука Прохоров', y: '1870 – 1915', e: '«Брат лавочника. Умер от запоя или от сердца, что одно.»' },
    { n: 'Дарья', y: '1884 – 1916', e: '«Родами померла. Дитя живо, взяла сестра.»' },
    { n: 'Отец Митрофан', y: '1836 – 1916', e: '«Сорок лет служил. Служил бы и сорок первый.»' },
    { n: 'Ермолай Зверев', y: '1878 – 1917', e: '«Задрали волки у Красной гривы. Охотник, но не в тот день.»' },
    { n: 'Устинья, дочь кузнеца', y: '1899 – 1917', e: '«В лихомань ушла с золотой осенью. Что с ней — пишут по-разному.»' },
    { n: 'Солдат Гурьян', y: '1890 – 1917', e: '«Пришёл с фронта умирать домой. Дома — тишина, и она долечила.»' },
    { n: 'Двое безымянных', y: '— 1917', e: '«Растерзаны зверем у мельницы. Бог да узнает их.»' },
    { n: 'Анисья', y: '1855 – 1917', e: '«Травница. Учила Матрёну всему, что та знает теперь.»' },
    { n: 'Александр, телеграфист', y: '1885 – 1917', e: '«Строку держал до последнего. Так и не дождался ответа.»' }
  ];

  /** Расставить кресты на кладбище (ищем область с CRYPT/FENCE рядом с церковью). */
  function placeGraves(R) {
    var W = WS.World;
    var placed = 0;
    var used = {};
    var shuffled = EPITAPHS.slice();
    // перетасовка без мутации
    for (var i = shuffled.length - 1; i > 0; i--) {
      var j = Math.floor(R.f() * (i + 1));
      var tmp = shuffled[i]; shuffled[i] = shuffled[j]; shuffled[j] = tmp;
    }
    // сканируем карту: места рядом с FENCE и CRYPT
    for (var y = 4; y < W.h - 4 && placed < shuffled.length; y += 1) {
      for (var x = 4; x < W.w - 4 && placed < shuffled.length; x += 2) {
        if (used[x + ',' + y]) continue;
        var t = W.tileAt(x, y);
        if (t !== W.T.GRASS && t !== W.T.GRASS2 && t !== W.T.SNOW) continue;
        if (W.isTileBlocked(x, y)) continue;
        // ищем поблизости кладбище
        var nearCrypt = false;
        for (var dy = -6; dy <= 6 && !nearCrypt; dy += 2) {
          for (var dx = -6; dx <= 6 && !nearCrypt; dx += 2) {
            var tt = W.tileAt(x + dx, y + dy);
            if (tt === W.T.CRYPT || tt === W.T.FENCE) nearCrypt = true;
          }
        }
        if (!nearCrypt) continue;
        if (R.f() > 0.3) continue;
        var person = shuffled[placed];
        W.addObject({
          x: x + 0.5, y: y + 0.5,
          sprName: 'cross_named', solid: true,
          name: 'Могила: ' + person.n,
          grave: person
        });
        placed++;
        // пометить занятость
        for (var oy = -1; oy <= 1; oy++) for (var ox = -1; ox <= 1; ox++) used[(x + ox) + ',' + (y + oy)] = 1;
      }
    }
    WS.log('[decor] крестов поставлено:', placed);
  }

  /** Чтение могилы. */
  function readGrave(o) {
    if (!o || !o.grave) return;
    var g = o.grave;
    var text = g.n + ' (' + g.y + ')\n\n' + g.e;
    if (WS.Ui && WS.Ui.confirm) {
      WS.Ui.confirm('Крест с именем\n\n' + text, function () {});
    } else if (WS.Fx && WS.G) {
      WS.Fx.text(g.n, o.x, o.y - 1, { life: 2.5 });
    }
    if (WS.G && WS.G.player) {
      WS.G.player.needs.sanity = Math.max(0, WS.G.player.needs.sanity - 1);
    }
  }

  // ================================================================ ДОРОЖНЫЕ ДЕТАЛИ
  function placeRoadDecor(R) {
    var W = WS.World;
    var count = 0;
    // вехи вдоль главной дороги
    for (var x = 6; x < W.w - 6 && count < 26; x += R.int(5, 9)) {
      for (var y = 6; y < W.h - 6; y++) {
        if (W.tileAt(x, y) === W.T.ROAD && W.tileAt(x, y - 1) !== W.T.ROAD) {
          var ty = y - 1;
          if (!W.isTileBlocked(x, ty) && R.f() > 0.3) {
            W.addObject({
              x: x + 0.3, y: ty + 0.5,
              sprName: 'veja_marker', solid: false,
              name: 'Веха'
            });
            count++;
          }
          break;
        }
      }
    }
    // часовенки: 2-3 шт на карте, у дорог в лесу
    var shrines = 0;
    var tries = 0;
    while (shrines < 3 && tries < 500) {
      tries++;
      var sx = 8 + Math.floor(R.f() * (W.w - 16));
      var sy = 8 + Math.floor(R.f() * (W.h - 16));
      if (W.tileAt(sx, sy) !== W.T.GRASS && W.tileAt(sx, sy) !== W.T.GRASS2) continue;
      // рядом должна быть дорога
      var nearRoad = false;
      for (var r = 1; r <= 4 && !nearRoad; r++) {
        for (var a = 0; a < 8; a++) {
          var tx = sx + Math.round(Math.cos(a) * r), ty2 = sy + Math.round(Math.sin(a) * r);
          if (W.tileAt(tx, ty2) === W.T.ROAD || W.tileAt(tx, ty2) === W.T.ROAD_SIDE) { nearRoad = true; break; }
        }
      }
      if (!nearRoad) continue;
      W.addObject({ x: sx + 0.5, y: sy + 0.5, sprName: 'road_shrine', solid: true, name: 'Часовенка' });
      shrines++;
    }
    // скворечники на некоторых столбах (объекты telegraph столбов — по sprName)
    var poles = W.objects.filter(function (o) { return /telegraph|stolb/.test(o.sprName || ''); });
    for (var p = 0; p < poles.length; p++) {
      if (R.f() < 0.3) {
        W.addObject({
          x: poles[p].x + 0.4, y: poles[p].y + 0.3,
          sprName: 'birdhouse', solid: false, name: 'Скворечник'
        });
      }
    }
    // у реки: вмёрзшие лодки и сети (по тайлам ICE/SHORE)
    var boats = 0; tries = 0;
    while (boats < 8 && tries < 900) {
      tries++;
      var bx = 6 + Math.floor(R.f() * (W.w - 12));
      var by = 6 + Math.floor(R.f() * (W.h - 12));
      var bt = W.tileAt(bx, by);
      if (bt !== W.T.SHORE && bt !== W.T.ICE) continue;
      if (W.isTileBlocked(bx, by)) continue;
      var spr = R.f() < 0.6 ? 'boat_snowed' : 'net_frozen';
      W.addObject({
        x: bx + 0.5, y: by + 0.5,
        sprName: spr, solid: spr === 'boat_snowed',
        name: spr === 'boat_snowed' ? 'Вмёрзшая лодка' : 'Вмёрзшая сеть',
        container: spr === 'boat_snowed' ? 'boat_supply' : null
      });
      boats++;
    }
    // дровники у случайных домов
    var homes = W.buildings.filter(function (b) { return /izba|dacha|house/.test(b.type || ''); });
    for (var h = 0; h < homes.length && h < 40; h++) {
      if (R.f() < 0.5) {
        var hx = homes[h].x + R.int(1, homes[h].w - 2);
        var hy = homes[h].y + homes[h].h;   // у южной стены
        if (!W.isTileBlocked(hx, hy)) {
          W.addObject({
            x: hx + 0.5, y: hy + 0.4,
            sprName: 'wood_round_stack', solid: true,
            name: 'Поленница',
            container: 'wood_pile'
          });
        }
      }
    }
    // обломки у мельницы/пилорамы: колёса и крылья
    var mills = W.buildings.filter(function (b) { return /mill|sawmill/.test(b.type || ''); });
    for (var m = 0; m < mills.length; m++) {
      for (var k = 0; k < 3; k++) {
        var mx = mills[m].x + R.int(-2, mills[m].w + 2);
        var my = mills[m].y + R.int(-2, mills[m].h + 2);
        if (!W.isTileBlocked(mx, my) && R.f() > 0.3) {
          W.addObject({
            x: mx + 0.5, y: my + 0.5,
            sprName: R.f() < 0.5 ? 'cart_wheel_snow' : 'mill_blade',
            solid: true, name: 'Обломок'
          });
        }
      }
    }
    // сугробы-формы: чистая косметика
    var drifts = 0; tries = 0;
    while (drifts < 30 && tries < 600) {
      tries++;
      var dx2 = 4 + Math.floor(R.f() * (W.w - 8));
      var dy2 = 4 + Math.floor(R.f() * (W.h - 8));
      var t2 = W.tileAt(dx2, dy2);
      if (t2 !== W.T.SNOW && t2 !== W.T.GRASS) continue;
      if (W.isTileBlocked(dx2, dy2)) continue;
      W.addObject({ x: dx2 + 0.5, y: dy2 + 0.5, sprName: 'snowdrift_shape', solid: false, name: 'Сугроб' });
      drifts++;
    }
    WS.log('[decor] дорожные детали: вех', count, 'часовен', shrines, 'лодок', boats, 'сугробов', drifts);
  }

  // ================================================================ ИНИЦИАЛИЗАЦИЯ
  WS.boot(function initDecor() {
    defSprites();
    WS.Ev.on('gen:interiors', function (d) {
      var R = d && d.R ? d.R : WS.RNG.mk(777);
      try { placeGraves(R); } catch (e) { WS.err('decor graves:', e); }
      try { placeRoadDecor(R); } catch (e) { WS.err('decor roads:', e); }
    });
    // чтение могил: ПКМ/E
    WS.Ev.on('mouse:down', function (m) {
      if (!WS.G || !WS.G.running || (WS.Ui && WS.Ui.modal && WS.Ui.modal())) return;
      if (m.button !== 2) return;
      var objs = WS.World.objsAt(WS.Input.mouse().tx, WS.Input.mouse().ty);
      for (var i = 0; i < objs.length; i++) {
        if (objs[i].grave) { readGrave(objs[i]); return; }
      }
    });
  }, 'decor:init');

  WS.def('Decor', {
    EPITAPHS: EPITAPHS,
    readGrave: readGrave
  });
})();
