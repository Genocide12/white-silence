/**
 * expedition_screen.js — ЭКРАН «ИЗБА ЭКСПЕДИЦИЙ» (клавиша X или меню).
 * Мета-слой между зимами: звёзды ⭐ → перманентные перки и анлоки.
 * Куратор избы — дед-звездочёт Астрал Иваныч (весь из грибов).
 */
(function () {
  'use strict';

  var root = null;
  var els = {};

  function isOpen() { return !!(root && !root.classList.contains('hidden')); }

  function build() {
    if (root) return;
    root = document.createElement('div');
    root.id = 'ws-exped';
    root.className = 'ws-panel ws-screen ws-modal ws-tree-screen ws-exped-screen hidden';
    root.innerHTML =
      '<div class="ws-tree-box">' +
      '  <div class="ws-tree-head">' +
      '    <div class="ws-tree-title">⭐ ИЗБА ЭКСПЕДИЦИЙ</div>' +
      '    <div class="ws-tree-sub">Между зимами дед с мультяшками ходит за звёздами. Наставник — Астрал Иваныч, звездочёт и гриб.</div>' +
      '    <div class="ws-tree-energy">⭐ <b id="we-stars">0</b> звёзд · экспедиций: <b id="we-runs">0</b> · побед: <b id="we-wins">0</b> · рекорд: <b id="we-best">—</b></div>' +
      '  </div>' +
      '  <div class="ws-tree-cols" id="we-cols"></div>' +
      '  <div class="ws-exped-hist" id="we-hist"></div>' +
      '  <div class="ws-tree-foot">' +
      '    <span class="ws-tree-hint">Звёзды капают за экспедиции: дни, изгнания, Древо. Победа до 55-го дня — жирный бонус, спидранер!</span>' +
      '    <button class="ws-btn" id="we-close">Закрыть [X]</button>' +
      '  </div>' +
      '</div>';
    (document.getElementById('ui-root') || document.body).appendChild(root);
    els.cols = root.querySelector('#we-cols');
    els.stars = root.querySelector('#we-stars');
    els.runs = root.querySelector('#we-runs');
    els.wins = root.querySelector('#we-wins');
    els.best = root.querySelector('#we-best');
    els.hist = root.querySelector('#we-hist');
    root.querySelector('#we-close').addEventListener('click', hide);
    root.addEventListener('click', function (e) {
      if (e.target === root) hide();
    });
  }

  function render() {
    build();
    var E = WS.Expeditions;
    if (!E) return;
    var m = E.meta();
    if (els.stars) els.stars.textContent = m.stars;
    if (els.runs) els.runs.textContent = E.runsCount();
    if (els.wins) els.wins.textContent = m.wins || 0;
    if (els.best) els.best.textContent = m.bestDay ? ('победа на день ' + m.bestDay) : '—';

    var html = '';

    // ---- колонка перков ----
    html += '<div class="wt-col wt-perks">';
    html += '<div class="wt-col-name">⭐ ПЕРКИ (навсегда)</div>';
    var perks = E.PERKS;
    for (var i = 0; i < perks.length; i++) {
      var p = perks[i];
      var cur = E.lv(p.id);
      var maxed = cur >= p.max;
      var c = E.cost(p.id);
      var afford = c !== null && m.stars >= c;
      html += '<div class="wt-node' + (cur > 0 ? ' learned' : '') + (maxed ? ' maxed' : '') +
        (c !== null && afford ? ' afford' : '') + '" data-perk="' + p.id + '"' +
        (maxed || !afford ? '' : ' role="button" tabindex="0"') + '>';
      html += '<div class="wt-node-name">' + p.icon + ' ' + p.name + '</div>';
      html += '<div class="wt-node-dots">';
      for (var d = 0; d < p.max; d++) {
        html += '<span class="dot' + (d < cur ? ' on' : '') + '"></span>';
      }
      html += '</div>';
      html += '<div class="wt-node-desc">' + p.desc + '</div>';
      html += '<div class="wt-node-cost">' +
        (maxed ? '✔ МАКСИМУМ' : '⭐ ' + c + (afford ? '' : ' — звёзд мало, зимуй дальше')) + '</div>';
      html += '</div>';
    }
    html += '</div>';

    // ---- колонка систем (анлоки) ----
    html += '<div class="wt-col wt-unlocks">';
    html += '<div class="wt-col-name">🗂️ РАЗВЁРТЫВАНИЕ СИСТЕМ</div>';
    var unl = E.UNLOCKS;
    for (var k = 0; k < unl.length; k++) {
      var u = unl[k];
      var open = E.unlocked(u.id);
      html += '<div class="wt-node' + (open ? ' learned' : '') + '">';
      html += '<div class="wt-node-name">' + u.icon + ' ' + u.name + '</div>';
      html += '<div class="wt-node-desc">' + u.desc + '</div>';
      html += '<div class="wt-node-cost">' +
        (open ? '✔ ОТКРЫТО' : 'экспедиций: ' + E.runsCount() + '/' + u.need) + '</div>';
      html += '</div>';
    }
    html += '</div>';

    // ---- колонка экспедиций ----
    html += '<div class="wt-col wt-runscol">';
    html += '<div class="wt-col-name">🎿 ПОСЛЕДНИЕ ЭКСПЕДИЦИИ</div>';
    var runs = E.runs();
    if (!runs.length) {
      html += '<div class="wt-node"><div class="wt-node-desc">Пока никто никуда не ходил. Сыграй зиму и отправь экспедицию с экрана финала — звёзды сами себя не насобирают, бля.</div></div>';
    }
    for (var r = 0; r < Math.min(runs.length, 8); r++) {
      var run = runs[runs.length - 1 - r];
      var icon = run.result === 'victory' ? '🏆' : '💀';
      html += '<div class="wt-node' + (run.result === 'victory' ? ' learned' : '') + '">';
      html += '<div class="wt-node-name">' + icon + ' ' + (run.name || 'Дед') +
        ' — ' + (run.result === 'victory' ? 'победа' : 'не доехал') + '</div>';
      html += '<div class="wt-node-desc">день ' + (run.day || '?') +
        ' · изгнал: ' + (run.banished || 0) + ' · зов: ' + (run.ritual || 0) + '</div>';
      html += '<div class="wt-node-cost">+' + (run.stars || 0) + ' ⭐</div>';
      html += '</div>';
    }
    html += '</div>';

    els.cols.innerHTML = html;

    var nodes = els.cols.querySelectorAll('.wt-node[data-perk]');
    for (var n = 0; n < nodes.length; n++) {
      (function (el) {
        var id = el.getAttribute('data-perk');
        var act = function () {
          var res = WS.Expeditions.buy(id);
          if (!res.ok) {
            try { WS.Ui.toast(res.why, 'warn'); } catch (e) { /* пусто */ }
          } else {
            try { WS.Ui.toast('⭐ Перк куплен! Дед стал ещё жирнее.', 'good'); } catch (e2) { /* пусто */ }
          }
          render();
        };
        if (el.getAttribute('role') === 'button') {
          el.addEventListener('click', act);
          el.addEventListener('keydown', function (e) {
            if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); act(); }
          });
        }
      })(nodes[n]);
    }
  }

  function show() {
    render();
    root.classList.remove('hidden');
    try { WS.Snd.play('build', { vol: 0.4 }); } catch (e) { /* пусто */ }
  }

  function hide() {
    if (root) root.classList.add('hidden');
  }

  function toggle() {
    if (isOpen()) hide(); else show();
  }

  WS.boot(function initExpedScreen() {
    // горячая клавиша X — только в живой партии и не в модалках
    window.addEventListener('keydown', function (e) {
      if (e.code !== 'KeyX') return;
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      try {
        if (WS.Ui && WS.Ui.modal && WS.Ui.modal()) return;
      } catch (er) { /* пусто */ }
      toggle();
    }, false);
  }, 'exped_screen:init');

  WS.def('ExpedScreen', {
    show: show,
    hide: hide,
    toggle: toggle,
    isOpen: isOpen
  });
})();
