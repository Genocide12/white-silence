/**
 * DEV-ОВЕРЛЕЙ (F3): статистика мира, отладочные тумблеры.
 * Для игроков-моддеров и для отладки: телепорт, погода, время, спавн.
 */
(function () {
  'use strict';

  var el = null;
  var open = false;

  var STATS_KEYS = [
    ['day', 'День'],
    ['weather', 'Погода'],
    ['temp', 'Мороз'],
    ['feels', 'Ощущается'],
    ['pos', 'Позиция'],
    ['ents', 'Сущностей'],
    ['objs', 'Объектов'],
    ['buildings', 'Зданий'],
    ['lights', 'Огней'],
    ['tiles', 'Тайлов'],
    ['chunks', 'Кэш чанков'],
    ['sprites', 'Кэш спрайтов'],
    ['fps', 'FPS'],
    ['ticks', 'Тиков'],
    ['items', 'Предметов всего'],
    ['recipes', 'Рецептов всего'],
    ['loot', 'Таблиц лута']
  ];

  function build() {
    if (el) return el;
    var root = document.getElementById('ui-root');
    if (!root) return null;
    el = document.createElement('div');
    el.id = 'ws-dev';
    el.style.cssText =
      'position:fixed;top:8px;left:8px;z-index:590;background:rgba(8,12,18,0.88);' +
      'border:1px solid #2c3a4e;border-radius:4px;padding:10px 14px;font:12px monospace;' +
      'color:#8b95a5;display:none;min-width:220px;pointer-events:auto;';
    root.appendChild(el);
    return el;
  }

  function fmt() {
    var g = WS.G;
    var lines = [];
    function add(k, label) {
      var v = '';
      switch (k) {
        case 'day': v = g && g.time ? g.time.day + ' (' + WS.Time.fmt() + ')' : '-'; break;
        case 'weather': v = WS.Weather && WS.Weather.current ? WS.Weather.current().id : '-'; break;
        case 'temp': v = WS.Weather && WS.Weather.tempOutside ? Math.round(WS.Weather.tempOutside()) + '°C' : '-'; break;
        case 'feels': v = WS.Temp && WS.Temp.feelsLike ? Math.round(WS.Temp.feelsLike()) + '°C' : '-'; break;
        case 'pos': v = g && g.player ? Math.round(g.player.x) + ', ' + Math.round(g.player.y) : '-'; break;
        case 'ents': v = WS.World ? WS.World.ents.length : '-'; break;
        case 'objs': v = WS.World ? WS.World.objects.length : '-'; break;
        case 'buildings': v = WS.World ? WS.World.buildings.length : '-'; break;
        case 'lights': v = WS.World ? WS.World.lights.length : '-'; break;
        case 'chunks': v = WS.World ? WS.World.ver : '-'; break;
        case 'sprites': v = WS.Spr ? WS.Spr.cacheSize() : '-'; break;
        case 'fps': v = WS.Loop ? WS.Loop.fps() : '-'; break;
        case 'ticks': v = WS._tickFns ? WS._tickFns.length : '-'; break;
        case 'items': v = WS.Data && WS.Data.items ? Object.keys(WS.Data.items).length : '-'; break;
        case 'recipes': v = WS.Data && WS.Data.recipes ? WS.Data.recipes.length : '-'; break;
        case 'loot': v = WS.Data && WS.Data.loot ? Object.keys(WS.Data.loot).length : '-'; break;
      }
      lines.push(label + ': ' + v);
    }
    for (var i = 0; i < STATS_KEYS.length; i++) add(STATS_KEYS[i][0], STATS_KEYS[i][1]);
    // нужды
    if (g && g.player) {
      var n = g.player.needs;
      lines.push('— — —');
      lines.push('hp: ' + Math.round(g.player.hp) + ' temp: ' + g.player.temp.toFixed(1));
      lines.push('голод: ' + Math.round(n.hunger) + ' жажда: ' + Math.round(n.thirst));
      lines.push('сон: ' + Math.round(n.fatigue) + ' рассудок: ' + Math.round(n.sanity));
    }
    return lines.join('<br>');
  }

  var refresh = 0;

  WS.boot(function initDev() {
    build();
    // F3 — переключение
    WS.tick(90, function devTick(dt) {
      if (WS.Input.hitCode('F3')) {
        open = !open;
        if (el) el.style.display = open ? 'block' : 'none';
        WS.log('[dev] overlay ' + (open ? 'on' : 'off'));
      }
      if (!open || !el) return;
      refresh += dt;
      if (refresh > 0.25) {
        refresh = 0;
        el.innerHTML = fmt();
      }
    }, 'dev:overlay');

    // горячие клавиши отладки (работают при открытом оверлее)
    WS.tick(91, function devKeys() {
      if (!open || !WS.G || !WS.G.running) return;
      // U — час вперёд
      if (WS.Input.hitCode('KeyU')) {
        WS.G.time.min += 60;
        WS.Ev.emit('time:hour', { hour: WS.Time.hour(), day: WS.Time.day() });
        WS.log('[dev] +1 час');
      }
      // J — сменить погоду
      if (WS.Input.hitCode('KeyJ')) {
        if (WS.Weather && WS.Weather.cycle) WS.Weather.cycle();
        else WS.Ev.emit('weather:changed', { to: 'debug' });
        WS.log('[dev] погода смена');
      }
      // G — дать стартовый набор
      if (WS.Input.hitCode('KeyG')) {
        var kit = ['matches', 'bread', 'water_flask', 'axe', 'bandage', 'torch', 'firewood_bundle'];
        for (var i = 0; i < kit.length; i++) {
          if (WS.Inv && WS.Inv.give) WS.Inv.give(kit[i], 2);
        }
        WS.log('[dev] набор выдан');
      }
    }, 'dev:keys');
  }, 'dev:init');

  WS.def('Dev', {
    isOpen: function () { return open; },
    toggle: function () {
      open = !open;
      if (el) el.style.display = open ? 'block' : 'none';
    }
  });
})();
