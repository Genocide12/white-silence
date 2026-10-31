/**
 * tree_screen.js — ЭКРАН «ДРЕВО МУДРОСТИ» (клавиша T или кнопка 🌳).
 * Три ветки (Тело / Руки / Дух), 11 навыков, валюта — грибная энергия 🍄.
 * Каждый узел честно влияет на механики (см. systems/crazy.js).
 */
(function () {
  'use strict';

  var root = null;
  var els = {};

  function isOpen() { return !!(root && !root.classList.contains('hidden')); }

  function build() {
    if (root) return;
    root = document.createElement('div');
    root.id = 'ws-tree';
    root.className = 'ws-panel ws-screen ws-modal ws-tree-screen hidden';
    root.innerHTML =
      '<div class="ws-tree-box">' +
      '  <div class="ws-tree-head">' +
      '    <div class="ws-tree-title">🌳 ДРЕВО МУДРОСТИ</div>' +
      '    <div class="ws-tree-sub">Магическая прокачка деда (он уверен, что она настоящая)</div>' +
      '    <div class="ws-tree-energy">🍄 <b id="wt-energy">0</b> грибной энергии</div>' +
      '  </div>' +
      '  <div class="ws-tree-cols" id="wt-cols"></div>' +
      '  <div class="ws-tree-foot">' +
      '    <span class="ws-tree-hint">Энергия капает: изгнания 🎁, обыски 🔍, каждый день ⏳</span>' +
      '    <button class="ws-btn" id="wt-close">Закрыть [T]</button>' +
      '  </div>' +
      '</div>';
    (document.getElementById('ui-root') || document.body).appendChild(root);
    els.cols = root.querySelector('#wt-cols');
    els.energy = root.querySelector('#wt-energy');
    root.querySelector('#wt-close').addEventListener('click', hide);
    root.addEventListener('click', function (e) {
      if (e.target === root) hide();
    });
  }

  function nodeCost(st, nd) {
    var cur = (st.spent && st.spent[nd.id]) || 0;
    if (cur >= nd.max) return null;
    return nd.cost[cur];
  }

  function render() {
    build();
    var st = WS.Crazy ? WS.Crazy.state() : null;
    var tree = WS.Crazy ? WS.Crazy.tree() : [];
    if (!st) return;
    if (els.energy) els.energy.textContent = Math.floor(st.energy);
    var html = '';
    for (var i = 0; i < tree.length; i++) {
      var br = tree[i];
      html += '<div class="wt-col wt-' + br.id + '">';
      html += '<div class="wt-col-name">' + br.icon + ' ' + br.name + '</div>';
      for (var k = 0; k < br.nodes.length; k++) {
        var nd = br.nodes[k];
        var cur = (st.spent && st.spent[nd.id]) || 0;
        var maxed = cur >= nd.max;
        var cost = nodeCost(st, nd);
        var afford = cost !== null && st.energy >= cost;
        html += '<div class="wt-node' + (cur > 0 ? ' learned' : '') + (maxed ? ' maxed' : '') +
          (cost !== null && afford ? ' afford' : '') + '" data-node="' + nd.id + '"' +
          (maxed || !afford ? '' : ' role="button" tabindex="0"') + '>';
        html += '<div class="wt-node-name">' + nd.name + '</div>';
        html += '<div class="wt-node-dots">';
        for (var d = 0; d < nd.max; d++) {
          html += '<span class="dot' + (d < cur ? ' on' : '') + '"></span>';
        }
        html += '</div>';
        html += '<div class="wt-node-desc">' + nd.desc + '</div>';
        html += '<div class="wt-node-cost">' +
          (maxed ? '✔ МАКСИМУМ' : '🍄 ' + cost + (afford ? '' : ' — мало')) + '</div>';
        html += '</div>';
      }
      html += '</div>';
    }
    els.cols.innerHTML = html;
    var nodes = els.cols.querySelectorAll('.wt-node');
    for (var n = 0; n < nodes.length; n++) {
      (function (el) {
        var id = el.getAttribute('data-node');
        var act = function () {
          var r = WS.Crazy.spend(id);
          if (!r.ok) toast(r.why, 'warn');
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

  function toast(text, kind) {
    try { if (WS.Ui && WS.Ui.toast) WS.Ui.toast(text, kind); } catch (e) { /* пусто */ }
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

  WS.boot(function initTreeScreen() {
    // строим лениво при первом открытии
  }, 'tree_screen:init');

  window.addEventListener('keydown', function (ev) {
    if (ev.code === 'Escape' && isOpen()) hide();
  });

  WS.def('TreeScreen', {
    show: show,
    hide: hide,
    toggle: toggle,
    isOpen: isOpen,
    refresh: function () { if (isOpen()) render(); }
  });
})();
