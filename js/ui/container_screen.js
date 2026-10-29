/**
 * container_screen.js — ОКНО КОНТЕЙНЕРА (модуль D2): две панели — слева
 * содержимое обысканного объекта (o.inv), справа сумка игрока; переносы
 * кликами (двойной щелчок = взять/положить), кнопки «Взять»/«Взять всё»/
 * «Положить», вес обеих сторон, тултипы предметов. Открывается через
 * WS.Ui.openContainer(o) — точку входа назначает inventory_screen.js
 * (looting.js зовёт её после обыска). Связи: WS.Loot (take/takeAll),
 * WS.Inv (snapshot/give/take), WS.ToolTip, css/panels.css.
 */
(function () {
  'use strict';

  // ====================================================================
  //  НАСТРОЙКИ И КОНСТАНТЫ
  // ====================================================================

  /** Дальше этого расстояния окно закрывается (игрок ушёл). */
  var MAX_DIST = 3.5;

  /** Период проверки расстояния, мс. */
  var DIST_MS = 600;

  // ====================================================================
  //  СОСТОЯНИЕ МОДУЛЯ
  // ====================================================================

  var open = false;        // окно открыто
  var cur = null;          // объект-контейнер (o из WS.World.objects)
  var selC = -1;           // выбранный индекс в o.inv
  var selP = -1;           // выбранный индекс в p.inv (из snapshot.i)

  var root = null;         // .scr-container
  var dom = {};            // ссылки на узлы

  var renderTimer = 0;    // отложенная перерисовка (inv:changed)
  var distTimer = 0;      // проверка расстояния

  // ====================================================================
  //  МАЛЫЕ ХЕЛПЕРЫ
  // ====================================================================

  function el(tag, cls, text) {
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    if (text !== undefined) d.textContent = text;
    return d;
  }

  function snd(name, vol) {
    if (WS.Snd && WS.Snd.play) {
      try { WS.Snd.play(name, { vol: vol || 0.4 }); } catch (e) { /* пусто */ }
    }
  }

  function toast(text, kind) {
    if (WS.Ui && WS.Ui.toast) {
      try { WS.Ui.toast(text, kind || 'info'); return; } catch (e) { /* ниже */ }
    }
    try { WS.Ev.emit('ui:toast', { text: text, kind: kind || 'info' }); }
    catch (e2) { /* пусто */ }
  }

  function defOf(id) {
    return (WS.Data && WS.Data.items && WS.Data.items[id]) || null;
  }

  function gameRunning() {
    return !!(WS.G && WS.G.running && !WS.G.dead);
  }

  function clamp(v, a, b) {
    if (v < a) return a;
    if (v > b) return b;
    return v;
  }

  function player() {
    return (WS.G && WS.G.player) || null;
  }

  /** Снимок инвентаря игрока (или пустышка). */
  function snap() {
    if (WS.Inv && WS.Inv.snapshot) return WS.Inv.snapshot();
    return { slots: [], equip: {}, weight: 0, maxWeight: 30, overload: 0 };
  }

  /** Содержимое контейнера (защищённый доступ). */
  function inv() {
    return (cur && cur.inv) ? cur.inv : [];
  }

  /** Вес содержимого контейнера, кг. */
  function contWeight() {
    var list = inv();
    var sum = 0;
    for (var i = 0; i < list.length; i++) {
      var def = defOf(list[i].id);
      if (def && typeof def.w === 'number') {
        sum += def.w * (list[i].count || 1);
      }
    }
    return Math.round(sum * 100) / 100;
  }

  // ====================================================================
  //  ПОСТРОЕНИЕ DOM
  // ====================================================================

  function build() {
    if (root) return;
    var uiRoot = document.getElementById('ui-root');
    if (!uiRoot) return;

    root = el('div', 'scr scr-container hidden');
    var back = el('div', 'scr-backdrop cont-backdrop');
    root.appendChild(back);

    var box = el('div', 'ws-panel cont-box');
    root.appendChild(box);

    // --- шапка ---
    var head = el('div', 'scr-head');
    var title = el('span', 'ws-title', 'Контейнер');
    title.id = 'cont-title';
    head.appendChild(title);
    var sub = el('span', 'scr-sub');
    sub.id = 'cont-sub';
    head.appendChild(sub);
    var closeBtn = el('button', 'scr-close');
    closeBtn.type = 'button';
    closeBtn.textContent = '×';
    closeBtn.title = 'Закрыть (Esc)';
    head.appendChild(closeBtn);
    box.appendChild(head);

    // --- две панели ---
    var layout = el('div', 'cont-layout');
    box.appendChild(layout);

    // левая: контейнер
    var left = el('div', 'cont-side cont-left');
    var lt = el('div', 'pane-title');
    var ltName = el('span', '', 'Содержимое');
    lt.appendChild(ltName);
    var ltW = el('span', 'cont-w');
    ltW.id = 'cont-w-left';
    lt.appendChild(ltW);
    left.appendChild(lt);
    var cgrid = el('div', 'items-grid cont-grid scroll-y');
    cgrid.id = 'cont-grid';
    left.appendChild(cgrid);

    var cbtns = el('div', 'cont-btns');
    var bTake = el('button', 'ws-btn d-btn primary');
    bTake.type = 'button';
    bTake.textContent = 'Взять';
    bTake.title = 'Перенести выбранный предмет в сумку';
    bTake.setAttribute('data-act', 'take');
    cbtns.appendChild(bTake);
    var bAll = el('button', 'ws-btn d-btn');
    bAll.type = 'button';
    bAll.textContent = 'Взять всё';
    bAll.title = 'Забрать всё содержимое (сколько унесёте)';
    bAll.setAttribute('data-act', 'takeall');
    cbtns.appendChild(bAll);
    left.appendChild(cbtns);
    layout.appendChild(left);

    // правая: сумка игрока
    var right = el('div', 'cont-side cont-right');
    var rt = el('div', 'pane-title');
    rt.appendChild(el('span', '', 'Сумка'));
    var rtW = el('span', 'cont-w');
    rtW.id = 'cont-w-right';
    rt.appendChild(rtW);
    right.appendChild(rt);
    var pgrid = el('div', 'items-grid cont-grid scroll-y');
    pgrid.id = 'cont-pgrid';
    right.appendChild(pgrid);

    var pbtns = el('div', 'cont-btns');
    var bPut = el('button', 'ws-btn d-btn');
    bPut.type = 'button';
    bPut.textContent = 'Положить';
    bPut.title = 'Переложить выбранный предмет из сумки в контейнер';
    bPut.setAttribute('data-act', 'put');
    pbtns.appendChild(bPut);
    var bClose = el('button', 'ws-btn d-btn');
    bClose.type = 'button';
    bClose.textContent = 'Закрыть';
    bClose.setAttribute('data-act', 'close');
    pbtns.appendChild(bClose);
    right.appendChild(pbtns);
    layout.appendChild(right);

    uiRoot.appendChild(root);

    dom = {
      back: back, box: box, title: title, sub: sub, closeBtn: closeBtn,
      cgrid: cgrid, pgrid: pgrid, ltW: ltW, rtW: rtW,
      cbtns: cbtns, pbtns: pbtns, bTake: bTake, bAll: bAll, bPut: bPut
    };

    // --- события ---
    back.addEventListener('click', close, false);
    closeBtn.addEventListener('click', close, false);
    cgrid.addEventListener('click', onContClick, false);
    cgrid.addEventListener('dblclick', onContDbl, false);
    pgrid.addEventListener('click', onPlayerClick, false);
    pgrid.addEventListener('dblclick', onPlayerDbl, false);
    cbtns.addEventListener('click', onBtn, false);
    pbtns.addEventListener('click', onBtn, false);
  }

  // ====================================================================
  //  РЕНДЕР
  // ====================================================================

  /** Отложенная перерисовка. */
  function scheduleRender() {
    if (!open) return;
    if (renderTimer) clearTimeout(renderTimer);
    renderTimer = setTimeout(function () {
      renderTimer = 0;
      render();
    }, 40);
  }

  /** Полная перерисовка. */
  function render() {
    if (!open || !root || !cur) return;
    var s = snap();

    // шапка: имя объекта и вес содержимого
    var name = cur.name || 'Контейнер';
    dom.title.textContent = name;
    var cw = contWeight();
    if (WS.M && WS.M.fmtKg) cw = WS.M.fmtKg(cw);
    dom.ltW.textContent = inv().length
      ? (inv().length + ' поз. · ' + cw + ' кг')
      : '';

    // запомнить выбор по id (индексы плывут после переносов)
    var keepC = null, keepP = null;
    if (selC >= 0 && inv()[selC]) keepC = inv()[selC].id;
    if (selP >= 0) {
      for (var i = 0; i < s.slots.length; i++) {
        if (s.slots[i].i === selP) { keepP = s.slots[i].id; break; }
      }
    }

    renderContGrid(keepC);
    renderPlayerGrid(s, keepP);

    // правая шапка: вес игрока
    var pw = s.weight;
    if (WS.M && WS.M.fmtKg) pw = WS.M.fmtKg(pw);
    var pt = pw + ' / ' + (WS.M && WS.M.fmtKg ? WS.M.fmtKg(s.maxWeight) : s.maxWeight) + ' кг';
    if (s.overload === 2) pt += ' — не унести!';
    else if (s.overload === 1) pt += ' — тяжело';
    dom.rtW.textContent = pt;
    dom.rtW.className = 'cont-w' +
      (s.overload === 2 ? ' crit' : (s.overload === 1 ? ' over' : ''));

    // подпись-статус
    if (!inv().length) {
      dom.sub.textContent = 'Пусто';
    } else {
      dom.sub.textContent = 'Клик — выбрать · двойной клик — перенести';
    }
  }

  /** Сетка контейнера. */
  function renderContGrid(keepC) {
    var list = inv();
    var scroll = dom.cgrid.scrollTop;
    var frag = document.createDocumentFragment();

    if (!list.length) {
      frag.appendChild(el('div', 'grid-empty', 'Пусто'));
    }

    for (var i = 0; i < list.length; i++) {
      var cell = buildContCell(list[i], i);
      if (list[i].id === keepC) cell.className += ' sel';
      frag.appendChild(cell);
    }

    while (dom.cgrid.firstChild) dom.cgrid.removeChild(dom.cgrid.firstChild);
    dom.cgrid.appendChild(frag);
    dom.cgrid.scrollTop = scroll;

    // поправить выбор
    selC = -1;
    if (keepC) {
      for (var k = 0; k < list.length; k++) {
        if (list[k].id === keepC) { selC = k; break; }
      }
    }
  }

  /** Ячейка предмета контейнера (записи {id, count} — без cond/возраста). */
  function buildContCell(item, index) {
    var TT = WS.ToolTip;
    var def = defOf(item.id);
    var fr = def && TT.freshness ? TT.freshness(def.per || 0, 0) : null;
    var cls = 'inv-slot cont-slot';
    if (fr) cls += ' fresh-' + fr.cls;

    var cell = el('div', cls);
    cell.setAttribute('data-c', String(index));

    cell.appendChild(TT.catIconNode(def ? def.cat : 'misc', 'slot-ico'));
    if (item.count && item.count > 1) {
      cell.appendChild(el('span', 'slot-count', '×' + item.count));
    }
    if (TT.bind) TT.bind(cell, TT.itemHtml({ id: item.id, count: item.count }));
    return cell;
  }

  /** Сетка сумки игрока (только перенос — без действий). */
  function renderPlayerGrid(s, keepP) {
    var scroll = dom.pgrid.scrollTop;
    var frag = document.createDocumentFragment();

    if (!s.slots.length) {
      frag.appendChild(el('div', 'grid-empty', 'Сумка пуста'));
    }

    for (var i = 0; i < s.slots.length; i++) {
      var info = s.slots[i];
      var def = defOf(info.id);
      var cell = buildItemCell(info, def);
      if (info.id === keepP) cell.className += ' sel';
      frag.appendChild(cell);
    }

    while (dom.pgrid.firstChild) dom.pgrid.removeChild(dom.pgrid.firstChild);
    dom.pgrid.appendChild(frag);
    dom.pgrid.scrollTop = scroll;

    selP = -1;
    if (keepP) {
      for (var k = 0; k < s.slots.length; k++) {
        if (s.slots[k].id === keepP) { selP = s.slots[k].i; break; }
      }
    }
  }

  /** Ячейка сумки (та же разметка, что в инвентаре, но data-p). */
  function buildItemCell(info, def) {
    var TT = WS.ToolTip;
    var cls = 'inv-slot';
    var fr = TT.freshness ? TT.freshness(info.per, info.age) : null;
    if (fr) cls += ' fresh-' + fr.cls;
    if (info.spoiled) cls += ' spoiled';

    var cell = el('div', cls);
    cell.setAttribute('data-p', String(info.i));
    cell.appendChild(TT.catIconNode(def ? def.cat : 'misc', 'slot-ico'));
    if (info.count && info.count > 1) {
      cell.appendChild(el('span', 'slot-count', '×' + info.count));
    }
    if (typeof info.cond === 'number') {
      var cond = el('span', 'slot-cond');
      var f = el('i');
      f.style.width = clamp(info.cond, 0, 100) + '%';
      cond.appendChild(f);
      cell.appendChild(cond);
    }
    if (info.spoiled) cell.appendChild(TT.iconNode('ui_rot', 'slot-rot'));
    if (TT.bind) TT.bind(cell, TT.itemHtml(info));
    return cell;
  }

  // ====================================================================
  //  ПЕРЕНОСЫ
  // ====================================================================

  /** Взять из контейнера (весь остаток стопки). */
  function take(index, quiet) {
    if (!cur || !WS.Loot || !WS.Loot.take) return false;
    var list = inv();
    if (index < 0 || index >= list.length) return false;
    var ok = false;
    try { ok = WS.Loot.take(cur, index, list[index].count); } catch (e) { ok = false; }
    if (!ok) {
      if (!quiet) {
        toast('Не унести — руки полны', 'warn');
        snd('error', 0.4);
      }
      return false;
    }
    selC = -1;
    render();
    return true;
  }

  /** Взять всё содержимое. */
  function takeAll() {
    if (!cur || !WS.Loot || !WS.Loot.takeAll) return;
    var n = 0;
    try { n = WS.Loot.takeAll(cur); } catch (e) { n = 0; }
    if (n > 0) toast('Забрано стопок: ' + n, 'good');
    else toast('Ничего не унести — руки полны', 'warn');
    selC = -1;
    render();
  }

  /**
   * Положить стопку из сумки (index в p.inv) в контейнер.
   * Внимание: формат контейнера хранит только {id, count} — cond и
   * свежесть при переносе теряются (ограничение формата лута).
   */
  function put(index) {
    var p = player();
    if (!p || !p.inv || !cur) return 0;
    var it = p.inv[index];
    if (!it || !it.id) return 0;
    var def = defOf(it.id);
    var stack = (def && def.stack && def.stack > 1) ? def.stack : 1;
    var c = it.count || 1;

    // списать из сумки (вес освобождается сразу)
    if (!WS.Inv || !WS.Inv.take) return 0;
    var taken = WS.Inv.take(it.id, c);
    if (taken <= 0) return 0;

    // досыпать в контейнер (стеки сливаем)
    if (!cur.inv) cur.inv = [];
    var list = cur.inv;
    var left = taken;
    var k, room, add;
    if (stack > 1) {
      for (k = 0; k < list.length && left > 0; k++) {
        if (list[k].id !== it.id) continue;
        if ((list[k].count || 1) >= stack) continue;
        room = stack - (list[k].count || 1);
        add = Math.min(room, left);
        list[k].count = (list[k].count || 1) + add;
        left -= add;
      }
    }
    while (left > 0) {
      add = Math.min(stack, left);
      list.push({ id: it.id, count: add });
      left -= add;
    }
    list._dirty = true;          // сериализация состояния (см. Loot.serialize)
    selP = -1;
    snd('drop', 0.35);
    render();
    return taken;
  }

  // ====================================================================
  //  ОБРАБОТЧИКИ
  // ====================================================================

  function onContClick(e) {
    var t = e.target;
    while (t && t !== dom.cgrid) {
      if (t.className && String(t.className).indexOf('cont-slot') >= 0) break;
      t = t.parentNode;
    }
    if (!t || t === dom.cgrid) return;
    var i = parseInt(t.getAttribute('data-c'), 10);
    if (isNaN(i)) return;
    selC = i;
    selP = -1;
    snd('select', 0.25);
    render();
  }

  function onContDbl(e) {
    onContClick(e);
    if (selC >= 0) take(selC);
  }

  function onPlayerClick(e) {
    var t = e.target;
    while (t && t !== dom.pgrid) {
      if (t.className && String(t.className).indexOf('inv-slot') >= 0) break;
      t = t.parentNode;
    }
    if (!t || t === dom.pgrid) return;
    var i = parseInt(t.getAttribute('data-p'), 10);
    if (isNaN(i)) return;
    selP = i;
    selC = -1;
    snd('select', 0.25);
    render();
  }

  function onPlayerDbl(e) {
    onPlayerClick(e);
    if (selP >= 0) put(selP);
  }

  function onBtn(e) {
    var t = e.target;
    while (t && t.getAttribute && !t.getAttribute('data-act')) t = t.parentNode;
    if (!t || !t.getAttribute) return;
    var act = t.getAttribute('data-act');
    if (act === 'take') {
      if (selC < 0) { toast('Выберите предмет слева', 'info'); return; }
      take(selC);
    } else if (act === 'takeall') {
      takeAll();
    } else if (act === 'put') {
      if (selP < 0) { toast('Выберите предмет справа', 'info'); return; }
      put(selP);
    } else if (act === 'close') {
      close();
    }
  }

  // ====================================================================
  //  ОТКРЫТИЕ / ЗАКРЫТИЕ
  // ====================================================================

  /**
   * ПУБЛИЧНО: открыть окно контейнера. o — объект мира с полем inv
   * (обычно после обыска WS.Loot.search). Вызывается через
   * WS.Ui.openContainer(o) — привязку делает inventory_screen.bindUi.
   */
  function openScreen(o) {
    if (!gameRunning()) return;
    if (!o || typeof o !== 'object') return;
    build();
    if (!root) return;
    if (!o.inv) o.inv = [];         // страховка (лут мог не наполниться)
    cur = o;
    open = true;
    selC = -1;
    selP = -1;
    root.classList.remove('hidden');
    render();
    startDistWatch();
    snd('pickup', 0.3);
    try { WS.Ev.emit('ui:screen', { id: 'container', open: true }); } catch (e) { /* пусто */ }
  }

  function close() {
    if (!open) return;
    open = false;
    cur = null;
    selC = -1;
    selP = -1;
    if (root) root.classList.add('hidden');
    stopDistWatch();
    WS.ToolTip.hide();
    try { WS.Ev.emit('ui:screen', { id: 'container', open: false }); } catch (e) { /* пусто */ }
  }

  /**
   * Проверка расстояния: игрок отошёл — закрыть (окно может висеть,
   * когда модальные экраны не блокируют ввод — см. bindUi в D2).
   */
  function distCheck() {
    if (!open || !cur) return;
    var p = player();
    if (!p) { close(); return; }
    var d = 99;
    if (WS.M && WS.M.dist) {
      try { d = WS.M.dist(p.x, p.y, cur.x, cur.y); } catch (e) { d = 99; }
    }
    if (d > MAX_DIST) {
      toast('Отошли далеко — контейнер закрыт', 'info');
      close();
    }
  }

  function startDistWatch() {
    stopDistWatch();
    distTimer = setInterval(distCheck, DIST_MS);
  }

  function stopDistWatch() {
    if (distTimer) {
      clearInterval(distTimer);
      distTimer = 0;
    }
  }

  // ====================================================================
  //  СОБЫТИЯ
  // ====================================================================

  function bindEvents() {
    WS.Ev.on('inv:changed', scheduleRender);
    WS.Ev.on('game:start', close);
    WS.Ev.on('game:load', close);
    WS.Ev.on('player:die', close);
  }

  // ====================================================================
  //  САМОТЕСТ (консоль разработчика: WS.ContScreen.selftest())
  // ====================================================================

  function selftest() {
    var out = [];
    var pass = 0, fail = 0;
    function ok(name, cond) {
      if (cond) { pass++; out.push('  ok   ' + name); }
      else { fail++; out.push('  FAIL ' + name); }
      return !!cond;
    }

    ok('модуль зарегистрирован', !!WS.ContScreen);
    ok('окно закрыто', open === false);
    ok('контейнера нет после закрытия', cur === null);
    ok('интервал расстояния остановлен', distTimer === 0);
    ok('ограничение дистанции задано', MAX_DIST > 0);

    // расчёт веса контейнера на макете
    var fake = { inv: [{ id: 'plank', count: 3 }] };
    var savedCur = cur;
    cur = fake;
    var def = defOf('plank');
    var w = contWeight();
    cur = savedCur;
    if (def) {
      ok('вес макета считается', w === Math.round((def.w * 3) * 100) / 100);
    } else {
      out.push('  --   доски не объявлены (данных нет) — вес пропущен');
    }

    out.unshift('contScreen.selftest: ' + pass + ' ок, ' + fail + ' провалено');
    return out;
  }

  // ====================================================================
  //  ПУБЛИЧНЫЙ API
  // ====================================================================

  WS.def('ContScreen', {
    open: openScreen,
    close: close,
    isOpen: function () { return open; },
    object: function () { return cur; },

    // переносы (индексы: take — в o.inv, put — в p.inv)
    take: take,
    takeAll: takeAll,
    put: put,

    render: render,
    selftest: selftest
  });

  // ====================================================================
  //  BOOT
  // ====================================================================

  WS.boot(function initContScreen() {
    bindEvents();
    WS.log('contScreen: окно контейнера готово (WS.Ui.openContainer привяжет invScreen)');
  }, 'contscreen:init');

})();
