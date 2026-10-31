/**
 * ctx_menu.js — КОНТЕКСТНОЕ МЕНЮ ПРЕДМЕТА (ПКМ по объекту мира).
 *
 * ЗАЧЕМ: игрок просил полную схему работы с предметами:
 *   наведение — краткие сведения (это делает world_hover.js),
 *   ЛКМ       — быстрое действие (это делает actions.js quickAction),
 *   ПКМ       — ВСЕ доступные действия с предметом (этот модуль).
 *
 * КАК: чистый UI без игровой логики: принимает список записей
 *   {label, kbd, note, disabled, danger, sep, fn} и показывает меню
 *   у курсора. Список собирает WS.Action.actionsFor(o) — один источник
 *   правды и для меню, и для подсказок. Меню закрывается кликом по
 *   пункту, клику мимо, любой клавишей, потерей фокуса — случайных
 *   «вечных» меню не бывает. Мир под меню живёт (меню не модальное).
 *
 * Связи: entities/actions.js (список действий), ui/world_hover.js
 * (подсказка при наведении), css/ctxmenu.css (вид).
 * Автор игры: DirtyG.
 */
(function () {
  'use strict';

  var root = null;
  var open = false;

  function ensureDom() {
    if (root) return;
    root = document.createElement('div');
    root.id = 'ws-ctxmenu';
    root.className = 'hidden';
    document.body.appendChild(root);
  }

  function hide() {
    if (!open) return;
    open = false;
    if (root) root.classList.add('hidden');
  }

  function isOpen() { return open; }

  /**
   * Показать меню.
   * x, y      — экранные координаты курсора;
   * entries   — [{label, kbd, note, disabled, danger, sep, fn}, ...];
   * title     — необязательный заголовок (имя предмета).
   */
  function show(x, y, entries, title) {
    ensureDom();
    if (!root || !entries || !entries.length) return;
    hide();

    var html = '';
    if (title) html += '<div class="ctx-title"></div>';
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      if (!e) continue;
      if (e.sep) { html += '<div class="ctx-sep"></div>'; continue; }
      html += '<div class="ctx-it' + (e.disabled ? ' off' : '') + (e.danger ? ' bad' : '') + '"' +
        ' data-i="' + i + '">';
      html += '<span class="ctx-lb"></span>';
      if (e.kbd) html += '<span class="ctx-kb"></span>';
      html += '</div>';
      if (e.note) html += '<div class="ctx-note"></div>';
    }
    root.innerHTML = html;

    // текст — через textContent (безопасно, без innerHTML для данных)
    var titleEl = root.querySelector('.ctx-title');
    if (titleEl && title) titleEl.textContent = title;
    var items = root.querySelectorAll('.ctx-it');
    for (var k = 0; k < items.length; k++) {
      var it = items[k];
      var idx = parseInt(it.getAttribute('data-i'), 10);
      var en = entries[idx];
      var lb = it.querySelector('.ctx-lb');
      if (lb) lb.textContent = en ? en.label : '';
      var kb = it.querySelector('.ctx-kb');
      if (kb && en) kb.textContent = en.kbd || '';
    }
    var notes = root.querySelectorAll('.ctx-note');
    var ni = 0;
    for (var q = 0; q < entries.length; q++) {
      if (!entries[q] || !entries[q].note) continue;
      if (ni < notes.length) { notes[ni].textContent = entries[q].note; ni++; }
    }

    // позиция: правее-ниже курсора, не вылезая за экран (с переворотом)
    root.classList.remove('hidden');
    open = true;
    var mw = root.offsetWidth, mh = root.offsetHeight;
    var vw = window.innerWidth, vh = window.innerHeight;
    var px = x + 12, py = y + 10;
    if (px + mw > vw - 6) px = x - mw - 12;      // не хватает справа — влево
    if (px < 6) px = Math.max(6, vw - mw - 6);
    if (py + mh > vh - 6) py = vh - mh - 6;      // не хватает снизу — вверх
    if (py < 6) py = 6;
    root.style.left = px + 'px';
    root.style.top = py + 'px';

    // клик по пункту
    root.onmousedown = function (ev) {
      ev.stopPropagation();
      ev.preventDefault();
      var t = ev.target;
      while (t && t !== root && !t.getAttribute || !t.getAttribute('data-i')) t = t.parentNode;
      var i2 = t && t.getAttribute ? parseInt(t.getAttribute('data-i'), 10) : NaN;
      var en2 = entries[i2];
      hide();
      if (en2 && !en2.disabled && typeof en2.fn === 'function') {
        try { en2.fn(); } catch (err) { WS.err('ctxmenu: действие упало', err && err.message); }
      }
    };
    // клик внутри меню не должен проваливаться в канвас
    root.onclick = function (ev) { ev.stopPropagation(); };
    root.oncontextmenu = function (ev) { ev.preventDefault(); ev.stopPropagation(); };
  }

  // ==================================================================
  //  ЗАКРЫТИЕ: клик мимо / клавиша / прокрутка / потеря фокуса
  // ==================================================================

  WS.boot(function initCtxMenu() {
    ensureDom();
    window.addEventListener('mousedown', function (ev) {
      if (!open) return;
      if (root && root.contains(ev.target)) return;
      hide();
    }, true);
    window.addEventListener('keydown', function (ev) {
      if (!open) return;
      // любую клавишу считаем «уходом» — включая Esc и движение
      hide();
    }, true);
    window.addEventListener('blur', hide);
    window.addEventListener('resize', hide);
    if (WS.Ev && WS.Ev.on) {
      WS.Ev.on('game:start', hide);
      WS.Ev.on('ui:screen', hide);
    }
    WS.log('[CtxMenu] Контекстное меню предметов готово (ПКМ)');
  }, 'ctxmenu:init');

  WS.def('CtxMenu', {
    show: show,
    hide: hide,
    isOpen: isOpen
  });
})();
