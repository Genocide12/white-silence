/** _dbg_t6.js — временный отладочный зонд T-6 (не тест: печатает значения через bug()). */
(function () {
  'use strict';
  var T = window.__T = { pass: 0, fail: 0, fails: [], bugs: [], done: false };
  function bug(d) { T.bugs.push(String(d)); console.log('  🐞 ' + d); }
  window.confirm = function () { return true; };
  var t0 = Date.now();
  var r = WS.Demo.start({ fresh: true, name: 'Дебаг', seed: 777, strategy: 'rush', speedMul: 1, human: false, record: true });
  bug('start=' + r + ' мс=' + (Date.now() - t0));
  setTimeout(function () {
    var mD = null;
    try { mD = WS.Save.meta('demo'); } catch (e) { mD = null; }
    bug('meta=' + JSON.stringify(mD) + ' gameMin=' + WS.G.time.min +
        ' totalMin=' + WS.G.time.totalMin + ' diff=' + (WS.G.time.min - (mD ? mD.min : -1)));
    var raw = null;
    try { raw = localStorage.getItem('ws_save_main'); } catch (e2) { raw = 'err'; }
    bug('ws_save_main до: ' + (raw ? 'ЕСТЬ(' + raw.length + ' байт)' : 'нет'));
    WS.Demo.stop('дебаг');
    // репро утечки в main-слот: игра демо продолжает жить после stop
    WS.Ev.emit('time:hour', {});
    var raw2 = null;
    try { raw2 = localStorage.getItem('ws_save_main'); } catch (e3) { raw2 = 'err'; }
    bug('ws_save_main после синтетического time:hour: ' + (raw2 ? 'ЕСТЬ(' + raw2.length + ' байт) — УТЕЧКА В СЛОТ ИГРОКА' : 'нет'));
    bug('G.running после stop=' + WS.G.running + ' Replay=' + WS.Replay.isActive() + ' speed=' + WS.Loop.speed);
    try { localStorage.removeItem('ws_save_main'); } catch (e4) { /* пусто */ }
    T.done = true;
  }, 8200);
})();
