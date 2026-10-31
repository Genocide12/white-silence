/**
 * РОЙ АГЕНТОВ — «турнир дедов» (тест игры от начала до победы).
 *
 * Каждый агент — отдельный дед со своим именем, характером, стратегией
 * и зерном мира. Агенты играют КАК ЛЮДИ: ходят по домам, обыскивают
 * шкафы, изгоняют мультяшек, спят по ночам, отвлекаются на пейзаж
 * (человеческие заминки в demo.js) — только на максимальной скорости.
 * Цель — найти ЧЕСТНЫЙ способ пройти игру как можно раньше: собрать
 * 3 факела, зажечь Магический Огонь и завершить Грибной Зов.
 *
 * Запускается из меню (кнопка «Рой агентов») или головлесс-раннером
 * scripts/swarm_run.mjs: WS.Swarm.launch({count, names, speedMul}).
 * Каждая партия пишется киноплёнкой (WS.Replay) — смотри в Кинозале.
 *
 * ВНИМАНИЕ: в одной вкладке агенты играют ПО ОЧЕРЕДИ (общий слот демо),
 * для настоящего роя в параллель — swarm_run.mjs открывает вкладки
 * с отдельными профилями браузера.
 */
(function () {
  'use strict';

  // ====================================================================
  //  ЛИЧНОСТИ РОЯ: имя, стратегия, скорость, реплика на старте
  //  classic — осторожный дед (факелы к 55-му дню), rush — спидранер
  //  (факелы → мостки → зов, победа хоть на 4-й день)
  // ====================================================================

  var PERSONAS = [
    { name: 'Гена-Турбо', strategy: 'rush', speedMul: 3, human: true,
      note: 'Спидранер. Живёт быстро, изгоняет больно.' },
    { name: 'Гена-Лодошка', strategy: 'rush', speedMul: 2, human: true,
      note: 'Изгоняет всё, что шевелится. Пыль — дело наживное.' },
    { name: 'Гена-Барахольщик', strategy: 'classic', speedMul: 2, human: true,
      note: 'Сначала обчистит посёлок, потом подумает.' },
    { name: 'Гена-Дрёма', strategy: 'classic', speedMul: 2, human: true,
      note: 'Любит поспать. Проспал бы и тарелку, ан нет — зов.' },
    { name: 'Гена-Телеграфист', strategy: 'classic', speedMul: 3, human: true,
      note: 'Профессионал эфира. Читает все записки, жмёт все кнопки.' },
    { name: 'Гена-Вантуз', strategy: 'rush', speedMul: 2, human: true,
      note: 'Верит в силу сантехники. И правильно делает.' }
  ];

  var SW = {
    running: false,
    queue: [],            // личности на запуск
    idx: 0,
    results: [],          // [{name, result, day, realSec, banished}]
    onDone: null          // колбэк после всего роя (для раннера)
  };

  function logSw(txt) {
    try { WS.log('[Swarm] ' + txt); } catch (e) { /* пусто */ }
  }

  /** Запустить следующего агента из очереди. */
  function next() {
    if (SW.idx >= SW.queue.length) {
      SW.running = false;
      logSw('рой завершён: ' + SW.results.length + ' партий');
      if (SW.onDone) { try { SW.onDone(SW.results.slice()); } catch (e) { /* пусто */ } }
      return;
    }
    var cfg = SW.queue[SW.idx];
    var seed = cfg.seed || (1000 + ((Math.random() * 90000) | 0));
    logSw('агент ' + (SW.idx + 1) + '/' + SW.queue.length + ': «' + cfg.name +
      '» (' + cfg.note + '), зерно ' + seed);
    var ok = false;
    try {
      ok = WS.Demo.start({
        fresh: true,
        name: cfg.name,
        seed: seed,
        strategy: cfg.strategy,
        speedMul: cfg.speedMul,
        human: cfg.human !== false,
        record: true
      });
    } catch (e) {
      WS.err('swarm: запуск агента', e && e.message);
      ok = false;
    }
    if (!ok) {
      // агент не завёлся — следующий
      SW.idx++;
      setTimeout(next, 500);
    }
  }

  /** Финиш агента (слушаем смену активности демо). */
  function watchFinish() {
    //WS.Demo._state().result меняется на 'victory'/'death' в onFinish
    var iv = 0;
    iv = setInterval(function () {
      var D = null;
      try { D = WS.Demo._state(); } catch (e) { D = null; }
      if (!D || !SW.running) { clearInterval(iv); return; }
      if (D.result === 'victory' || D.result === 'death') {
        clearInterval(iv);
        var cfg = SW.queue[SW.idx] || {};
        SW.results.push({
          name: cfg.name || 'Дед',
          result: D.result,
          day: (function () { try { return WS.Time.day(); } catch (e) { return 0; } })(),
          realSec: Math.round((Date.now() - D.startedAt) / 1000),
          banished: (WS.Crazy && WS.Crazy.state) ? (WS.Crazy.state().banished || 0) : 0
        });
        SW.idx++;
        setTimeout(next, 2500);        // пауза между агентами — экран финала
      }
    }, 1000);
    SW._iv = iv;
  }

  /**
   * Запуск роя. opts: { count (1..6), personas: [..], speedMul, seeds }
   */
  function launch(opts) {
    opts = opts || {};
    if (SW.running) return false;
    var n = Math.max(1, Math.min(6, opts.count || 3));
    SW.queue = [];
    var pool = opts.personas && opts.personas.length ? opts.personas : PERSONAS;
    for (var i = 0; i < n; i++) {
      var p = pool[i % pool.length];
      SW.queue.push({
        name: p.name, strategy: p.strategy,
        speedMul: opts.speedMul || p.speedMul || 2,
        human: p.human !== false,
        seed: (opts.seeds && opts.seeds[i]) || undefined,
        note: p.note || ''
      });
    }
    SW.results = [];
    SW.idx = 0;
    SW.running = true;
    SW.onDone = opts.onDone || null;
    watchFinish();
    next();
    return true;
  }

  function stopSwarm() {
    SW.running = false;
    SW.queue = [];
    if (SW._iv) { clearInterval(SW._iv); SW._iv = 0; }
    try { if (WS.Demo && WS.Demo.stop) WS.Demo.stop('рой остановлен'); } catch (e) { /* пусто */ }
  }

  WS.boot(function initSwarm() {
    logSw('рой агентов заряжен: ' + PERSONAS.length + ' личностей');
  }, 'swarm:init');

  WS.def('Swarm', {
    PERSONAS: PERSONAS,
    launch: launch,
    stop: stopSwarm,
    isRunning: function () { return SW.running; },
    results: function () { return SW.results.slice(); },
    _state: function () { return SW; }
  });
})();
