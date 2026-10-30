/**
 * НАБЛЮДАТЕЛЬ ПОГОДЫ: альманах,(predictions) предсказания, реакция мира.
 * Барометр, народные приметы, журнал наблюдений для игрока.
 */
(function () {
  'use strict';

  function toast(text, kind) {
    if (WS.Ui && WS.Ui.toast) WS.Ui.toast(text, kind || 'info');
  }

  // ================================================================ ПРИМЕТЫ
  var SIGNS = [
    { id: 'smoke_down', txt: 'Дым стелется по земле — к снегу.',
      pred: 'snow', conf: 0.8 },
    { id: 'sun_halo', txt: 'Солнце в кольце — к лютому морозу.',
      pred: 'hard_frost', conf: 0.7 },
    { id: 'crows_loud', txt: 'Вороньё галдит и садится на верхушки — к метели.',
      pred: 'blizzard', conf: 0.65 },
    { id: 'stars_dim', txt: 'Звёзды мутные и редкие — к оттепели.',
      pred: 'thaw', conf: 0.6 },
    { id: 'wind_turn', txt: 'Ветер зашёл на север — к ясному морозу.',
      pred: 'clear', conf: 0.7 },
    { id: 'dogs_queer', txt: 'Собаки валяются в снегу — к вьюге.',
      pred: 'snowstorm', conf: 0.55 },
    { id: 'trees_crack', txt: 'Деревья трещат на весь лес — к крепкому морозу.',
      pred: 'hard_frost', conf: 0.75 },
    { id: 'sky_red', txt: 'Небо на закате цвета меди — к ветру.',
      pred: 'snowstorm', conf: 0.6 },
    { id: 'snow_squeak', txt: 'Снег скрипит под ногами звонко — мороз укрепился.',
      pred: 'hard_frost', conf: 0.7 },
    { id: 'fire_bright', txt: 'Огонь горит ярко и гулко — к стуже.',
      pred: 'hard_frost', conf: 0.6 },
    { id: 'icicles_drip', txt: 'Сосульки заплакали — быть оттепели.',
      pred: 'thaw', conf: 0.7 },
    { id: 'night_glow', txt: 'Над лесом стоит зарница без грома — к перемене.',
      pred: 'any', conf: 0.5 }
  ];

  // ================================================================ ЖУРНАЛ НАБЛЮДЕНИЙ
  var log = [];   // {day, hour, temp, wind, weather}

  function record() {
    if (!WS.G || !WS.G.running) return;
    if (!WS.Weather) return;
    log.push({
      day: WS.Time.day(),
      hour: WS.Time.hour(),
      temp: Math.round(WS.Weather.tempOutside ? WS.Weather.tempOutside() : -20),
      wind: Math.round((WS.Weather.windLevel ? WS.Weather.windLevel() : 0.3) * 10) / 10,
      w: WS.Weather.current ? (WS.Weather.current().id || 'clear') : 'clear'
    });
    if (log.length > 240) log.shift();
  }

  // ================================================================ ПРЕДСКАЗАНИЕ (барометр)
  /** Предсказание погоды на сутки вперёд. withBarometer — точность выше. */
  function forecast(withBarometer) {
    var acc = withBarometer ? 0.85 : 0.55;
    var cur = WS.Weather && WS.Weather.current ? WS.Weather.current().id : 'clear';
    // простая цепочка: из текущей погоды вероятностно
    var next = { clear: ['clear', 'overcast', 'snow'], overcast: ['snow', 'clear', 'fog'],
      snow: ['snowstorm', 'overcast', 'blizzard'], blizzard: ['snow', 'overcast'],
      fog: ['overcast', 'clear'], hard_frost: ['clear', 'overcast'],
      snowstorm: ['blizzard', 'snow'] }[cur] || ['overcast'];
    var pick = next[Math.floor(Math.random() * next.length)];
    if (Math.random() > acc) pick = next[Math.floor(Math.random() * next.length)];
    return {
      from: cur,
      to: pick,
      conf: Math.round(acc * 100),
      withTool: !!withBarometer
    };
  }

  var NAMES = {
    clear: 'ясно', overcast: 'пасмурно', snow: 'снег', blizzard: 'метель',
    fog: 'туман', hard_frost: 'лютый мороз', snowstorm: 'снежная буря',
    thaw: 'оттепель'
  };

  function forecastText(withBarometer) {
    var f = forecast(withBarometer);
    var out = (NAMES[f.to] || f.to) + ' (' + f.conf + '%';
    out += f.withTool ? ', барометр)' : ', по приметам)';
    return out;
  }

  // ================================================================ ОГЛАШЕНИЕ ПРИМЕТ
  var signTimer = 0;
  var lastSign = -1;

  function maybeSign(dt) {
    if (!WS.G || !WS.G.running || !WS.G.player) return;
    if (WS.Ui && WS.Ui.modal && WS.Ui.modal()) return;
    signTimer += dt;
    if (signTimer < 90) return;    // раз в 90 секунд реального
    signTimer = 0;
    if (Math.random() > 0.5) return;
    // выбираем примету, подходящую контексту
    var idx = Math.floor(Math.random() * SIGNS.length);
    if (idx === lastSign) idx = (idx + 1) % SIGNS.length;
    lastSign = idx;
    var sign = SIGNS[idx];
    toast('Примета: ' + sign.txt, 'info');
    if (WS.G.story && WS.G.story.chronicle) {
      WS.G.story.chronicle.push({ day: WS.Time.day(), text: sign.txt });
    }
  }

  // ================================================================ ОСОБЫЕ НАБЛЮДЕНИЯ
  function specialObservations() {
    var p = WS.G && WS.G.player;
    if (!p) return;
    var t = WS.Weather ? (WS.Weather.tempOutside ? WS.Weather.tempOutside() : -20) : -20;
    // хруст снега
    if (t < -30 && Math.random() < 0.2) {
      if (WS.Snd) WS.Snd.play('trap_snap', { x: p.x + 6, y: p.y + 6, vol: 0.15 });
    }
    // треск деревьев при жестоком морозе
    if (t < -35 && Math.random() < 0.25) {
      WS.Snd.play('gunshot', { x: p.x + 10, y: p.y - 8, vol: 0.12 });
      if (Math.random() < 0.4) toast('Лес трещит от мороза, будто выстрелы.', 'info');
    }
    // пар дыхания при -25
    if (t < -25 && Math.random() < 0.5 && WS.Fx) {
      WS.Fx.spawn('steam', p.x, p.y - 0.3, { z: 26, life: 1.2 });
    }
  }

  var obsTimer = 0;
  function obsTick(dt) {
    obsTimer += dt;
    if (obsTimer < 4) return;
    obsTimer = 0;
    specialObservations();
  }

  // ================================================================ API ЖУРНАЛА
  function summary() {
    if (!log.length) return 'Наблюдений нет.';
    var minT = 999, maxT = -999, winds = 0;
    var counts = {};
    for (var i = 0; i < log.length; i++) {
      var e = log[i];
      if (e.temp < minT) minT = e.temp;
      if (e.temp > maxT) maxT = e.temp;
      winds += e.wind;
      counts[e.w] = (counts[e.w] || 0) + 1;
    }
    var top = null, topN = 0;
    for (var k in counts) if (counts[k] > topN) { top = k; topN = counts[k]; }
    return 'Наблюдений: ' + log.length + '. Мороз: до −' + Math.abs(minT) +
      '°, в оттепели: до ' + maxT + '°. Чаще всего: ' + (NAMES[top] || top) +
      '. Ветер в среднем: ' + (Math.round(winds / log.length * 10) / 10) + '.';
  }

  /** Стол нарисовать график температур (мини-график для журнала). */
  function drawTempGraph(ctx, x, y, w, h) {
    if (log.length < 2) return;
    ctx.save();
    ctx.strokeStyle = 'rgba(126, 163, 196, 0.8)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    var minT = 999, maxT = -999;
    for (var i = 0; i < log.length; i++) {
      if (log[i].temp < minT) minT = log[i].temp;
      if (log[i].temp > maxT) maxT = log[i].temp;
    }
    var range = Math.max(1, maxT - minT);
    for (var j = 0; j < log.length; j++) {
      var px = x + (j / (log.length - 1)) * w;
      var py = y + h - ((log[j].temp - minT) / range) * h;
      if (j === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
    // подписи
    ctx.fillStyle = '#8b95a5';
    ctx.font = '10px Georgia';
    ctx.fillText('−' + Math.abs(minT) + '°', x - 2, y + h + 10);
    ctx.fillText(maxT + '°', x - 2, y - 3);
    ctx.restore();
  }

  // ================================================================ ЗАПУСК
  WS.boot(function initAlmanac() {
    // запись раз в игровой час
    WS.Ev.on('time:hour', record);
    // тики
    WS.tick(48, function almanacTick(dt) {
      maybeSign(dt);
      obsTick(dt);
    }, 'almanac:tick');
    // чтение барометра
    WS.Ev.on('mouse:down', function (m) {
      if (!WS.G || !WS.G.running || (WS.Ui && WS.Ui.modal && WS.Ui.modal())) return;
      if (m.button !== 2) return;
      var objs = WS.World.objsAt(WS.Input.mouse().tx, WS.Input.mouse().ty);
      for (var i = 0; i < objs.length; i++) {
        var sp = objs[i].sprName || '';
        if (/barometr/.test(sp)) {
          toast('Барометр: ожидается ' + forecastText(true) + '.', 'info');
          return;
        }
      }
    });
  }, 'almanac:init');

  WS.def('Almanac', {
    SIGNS: SIGNS,
    forecast: forecast,
    forecastText: forecastText,
    summary: summary,
    drawTempGraph: drawTempGraph,
    log: function () { return log; }
  });
})();
