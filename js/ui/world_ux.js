/**
 * world_ux.js — UX ПРЕДМЕТОВ: наведение, быстрое действие, меню действий.
 *
 * ЗАПРОС ПОЛЬЗОВАТЕЛЯ:
 *   «при наведении на предмет показывать краткие сведения о нем,
 *    при нажатии — быстрое действие с предметом, если нет активного
 *    действия — перетаскивать себе в инвентарь, при нажатии правой
 *    кнопкой мыши показывать все действия с предметом».
 *
 * КАК РАБОТАЕТ:
 *  - МИР (canvas): hover — карточка у курсора (имя, состояние, подсказки);
 *    ЛКМ по досягаемому объекту — быстрое действие (обыскать дверь/контейнер,
 *    подобрать дроп, собрать сосульку; иначе — удар, как раньше);
 *    ПКМ — меню ВСЕХ действий объекта (открыть, обыскать, растопить, спать,
 *    осмотреть). Повторный ПКМ/Esc/клик мимо — закрыть (toggle).
 *  - ЭКРАН КОНТЕЙНЕРА: ЛКМ по вещи — взять в сумку (быстрое действие);
 *    ПКМ — меню (взять, взять всё, съесть, надеть, положить).
 *  - ИНВЕНТАРЬ: ПКМ по вещи — меню (съесть, выпить, надеть, в руку,
 *    читать, выбросить, разделить).
 *
 * Связи: input.js (mouse:down, mouse), actions.js (быстрое действие),
 * tooltips.js (стиль .ws-tooltip), css/worldux.css.
 */
(function () {
  'use strict';

  var INTERACT_R = 1.6;         // чуть щедрее действий (1.5) — для подсказок
  var TOOLTIP_GAP = 16;

  var tipEl = null;             // тултип мира
  var menuEl = null;            // контекстное меню
  var menuTarget = null;        // чем меню открыто ('world' | 'inv' | 'cont')
  var menuKey = '';             // ключ повторного открытия (toggle)
  var hoverObj = null;          // объект под курсором
  var hoverDrop = null;         // дроп-сущность под курсором
  var consumeT = 0;             // до какого момента ЛКМ «съеден» быстрым действием
  var mouseOnGame = true;       // курсор над игровым канвасом (не над DOM-панелью)

  // ====================================================================
  //  УТИЛИТЫ
  // ====================================================================

  function G() { return WS.G || null; }
  function P() { var g = WS.G; return (g && g.player) || null; }
  function W() { return WS.World || null; }
  function dist(ax, ay, bx, by) { var dx = bx - ax, dy = by - ay; return Math.sqrt(dx * dx + dy * dy); }

  function inGame() {
    var g = G();
    return !!(g && g.running && g.player && g.player.hp > 0);
  }

  function modalOpen() {
    try { return !!(WS.Ui && WS.Ui.modal && WS.Ui.modal()); } catch (e) { return false; }
  }

  function playing() {
    return inGame() && !modalOpen();
  }

  function nameOfItem(id) {
    try { return WS.Inv.nameOf(id); } catch (e) { return id; }
  }

  function defOf(id) {
    return (WS.Data && WS.Data.items) ? WS.Data.items[id] : null;
  }

  function canEat(def) { return !!(def && ((def.cal && def.cal > 0) || (def.tags && def.tags.indexOf('edible') >= 0))); }
  function canDrink(def) { return !!(def && (def.tags && def.tags.indexOf('drinkable') >= 0)); }
  function handable(def) { return !!(def && (def.tags && def.tags.indexOf('weapon') >= 0)); }
  function readable(def) { return !!(def && (def.tags && def.tags.indexOf('readable') >= 0)); }

  function equipSlots(def) {
    return (def && def.slots && def.slots.length) ? def.slots : null;
  }

  // ====================================================================
  //  ПОИСК ЦЕЛИ ПОД КУРСОРОМ
  // ====================================================================

  /** Самый «интересный» объект на тайле курсора. */
  function objAtMouse() {
    var w = W();
    var m = WS.Input.mouse();
    if (!w || m.tx < 0) return null;
    var list = null;
    try { list = w.objsAt(m.tx, m.ty); } catch (e) { list = null; }
    if (!list || !list.length) {
      try { var one = w.objAt(m.tx, m.ty); if (one) list = [one]; } catch (e2) { /* пусто */ }
    }
    if (!list) return null;
    var best = null, bestScore = -1;
    for (var i = 0; i < list.length; i++) {
      var o = list[i];
      if (!o) continue;
      var score = 0;
      if (o.container) score += 5;
      else if (o.door) score += 4;
      else if (o.heat) score += 3;
      else if (o.forage) score += 3;
      else if (String(o.sprName || '').indexOf('bed') === 0) score += 3;
      else if (o.drop) score += 2;
      else score += 1;
      if (score > bestScore) { bestScore = score; best = o; }
    }
    return best;
  }

  /** Дроп-сущность под курсором (кто-то бросил вещь на снег). */
  function dropAtMouse() {
    var w = W();
    var m = WS.Input.mouse();
    if (!w || m.tx < 0) return null;
    var list;
    try { list = w.entsNear(m.wx, m.wy, 1.2); } catch (e) { return null; }
    if (!list) return null;
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (!e || e.dead) continue;
      if (e.kind === 'drop' || e.drop) {
        if (dist(m.wx, m.wy, e.x, e.y) < 1.0) return e;
      }
    }
    return null;
  }

  function inReach(x, y) {
    var p = P();
    if (!p) return false;
    return dist(p.x, p.y, x, y) <= INTERACT_R;
  }

  // ====================================================================
  //  ТУЛТИП МИРА (hover)
  // ====================================================================

  function ensureTip() {
    if (tipEl) return;
    tipEl = document.createElement('div');
    tipEl.className = 'ws-tooltip ws-wtt hidden';
    tipEl.style.pointerEvents = 'none';
    tipEl.style.zIndex = '350';
    document.body.appendChild(tipEl);
  }

  function describeObj(o) {
    var p = P();
    var reach = inReach(o.x, o.y);
    var lines = [];
    var kind = '';

    if (o.door) {
      kind = o.open ? 'дверь · открыта' : 'дверь · закрыта';
      if (o.locked && !o.open) kind += ' · ЗАПЕРТО';
    } else if (o.container) {
      kind = o.looted ? 'контейнер · обыскан' : 'контейнер · не тронут';
    } else if (o.heat) {
      var lit = false;
      try { lit = !!(WS.Fire && WS.Fire.near && WS.Fire.near(o.x, o.y, 2)); } catch (e) { /* пусто */ }
      kind = lit ? 'печь · горит' : 'печь · холодная';
    } else if (String(o.sprName || '').indexOf('bed') === 0) {
      kind = 'кровать · можно спать';
    } else if (o.forage) {
      kind = 'можно собрать';
    } else if (o.drop) {
      kind = 'выпавшая вещь';
    } else {
      kind = 'объект';
    }

    lines.push({ t: o.name || 'Без названия', cls: 'tt-name' });
    lines.push({ t: kind, cls: 'tt-kind' });
    if (o.drop && typeof o.drop === 'object' && o.drop.id) {
      lines.push({ t: nameOfItem(o.drop.id) + (o.drop.count > 1 ? ' ×' + o.drop.count : ''), cls: 'tt-stats' });
    }
    if (p && !reach) lines.push({ t: 'далеко — подойдите ближе', cls: 'tt-far' });
    else lines.push({ t: quickActionLabel(o), cls: 'tt-act' });
    return lines;
  }

  function quickActionLabel(o) {
    if (o.door) return o.open ? 'ЛКМ — закрыть · ПКМ — все действия' : 'ЛКМ — открыть · ПКМ — все действия';
    if (o.container) return 'ЛКМ — обыскать · ПКМ — все действия';
    if (o.heat) return 'ПКМ — растопить / все действия';
    if (String(o.sprName || '').indexOf('bed') === 0) return 'Z — лечь спать · ПКМ — все действия';
    if (o.forage) return 'ЛКМ — собрать · ПКМ — все действия';
    if (o.drop) return 'ЛКМ — подобрать · ПКМ — все действия';
    return 'ЛКМ — осмотреть';
  }

  function showTipAt(x, y, o) {
    ensureTip();
    var lines = describeObj(o);
    tipEl.innerHTML = '';
    for (var i = 0; i < lines.length; i++) {
      var d = document.createElement('div');
      d.className = lines[i].cls || '';
      d.textContent = lines[i].t;
      tipEl.appendChild(d);
    }
    tipEl.classList.remove('hidden');
    // позиция с клампом к экрану
    var r = tipEl.getBoundingClientRect();
    var px = x + TOOLTIP_GAP, py = y + TOOLTIP_GAP;
    if (px + r.width > window.innerWidth - 8) px = x - r.width - TOOLTIP_GAP;
    if (py + r.height > window.innerHeight - 8) py = y - r.height - TOOLTIP_GAP;
    tipEl.style.left = Math.max(8, px) + 'px';
    tipEl.style.top = Math.max(8, py) + 'px';
  }

  function hideTip() {
    if (tipEl) tipEl.classList.add('hidden');
  }

  function refreshHover() {
    if (!playing()) { hoverObj = null; hoverDrop = null; hideTip(); return; }
    var m = WS.Input.mouse();
    var o = objAtMouse();
    var d = dropAtMouse();
    // дроп приоритетнее декора
    var target = d || o;
    if (target !== hoverObj && target !== hoverDrop) {
      hoverObj = d ? null : o;
      hoverDrop = d || null;
    }
    var show = hoverObj || hoverDrop;
    // показываем, пока курсор «на игре»: над канвасом или ещё никуда не уходил
    // (overCanvas из input.js в headless может ложно молчать — ведём свой учёт)
    if (!show || !mouseOnGame) { hideTip(); return; }
    showTipAt(m.x, m.y, show);
  }

  // ====================================================================
  //  МЕНЮ ДЕЙСТВИЙ (общее)
  // ====================================================================

  function ensureMenu() {
    if (menuEl) return;
    menuEl = document.createElement('div');
    menuEl.className = 'ws-ctxmenu hidden';
    menuEl.style.zIndex = '950';
    document.body.appendChild(menuEl);
    // клик мимо — закрыть
    setTimeout(function () {
      window.addEventListener('mousedown', function (e) {
        if (menuEl.classList.contains('hidden')) return;
        if (menuEl.contains(e.target)) return;
        closeMenu();
      }, true);
      window.addEventListener('keydown', function (e) {
        if (e.code === 'Escape') closeMenu();
      }, true);
      window.addEventListener('blur', closeMenu);
    }, 0);
  }

  /**
   * Открыть меню у курсора.
   * items: [{label, hint, danger, disabled, fn}]
   */
  function openMenu(x, y, items, key) {
    ensureMenu();
    // toggle: тот же ключ — закрыть
    if (!menuEl.classList.contains('hidden') && menuKey === key) {
      closeMenu();
      return;
    }
    menuKey = key || '';
    menuEl.innerHTML = '';
    for (var i = 0; i < items.length; i++) {
      (function (it) {
        var b = document.createElement('button');
        b.className = 'ctx-item' + (it.danger ? ' danger' : '') + (it.disabled ? ' disabled' : '');
        var lbl = document.createElement('span');
        lbl.className = 'ctx-lbl';
        lbl.textContent = it.label;
        b.appendChild(lbl);
        if (it.hint) {
          var h = document.createElement('span');
          h.className = 'ctx-hint';
          h.textContent = it.hint;
          b.appendChild(h);
        }
        if (!it.disabled) {
          b.addEventListener('click', function () {
            closeMenu();
            try { it.fn(); } catch (e) { /* пусто */ }
          });
        }
        menuEl.appendChild(b);
      })(items[i]);
    }
    menuEl.classList.remove('hidden');
    var r = menuEl.getBoundingClientRect();
    var px = x, py = y;
    if (px + r.width > window.innerWidth - 8) px = window.innerWidth - r.width - 8;
    if (py + r.height > window.innerHeight - 8) py = window.innerHeight - r.height - 8;
    menuEl.style.left = Math.max(8, px) + 'px';
    menuEl.style.top = Math.max(8, py) + 'px';
  }

  function closeMenu() {
    if (menuEl) menuEl.classList.add('hidden');
    menuKey = '';
  }

  function menuOpen() {
    return menuEl && !menuEl.classList.contains('hidden');
  }

  // ====================================================================
  //  ДЕЙСТВИЯ МИРА
  // ====================================================================

  /** Быстрое действие ЛКМ по объекту. true — клик «съеден». */
  function quickActionWorld() {
    if (!playing()) return false;
    var target = hoverDrop || hoverObj;
    if (!target) return false;
    if (!inReach(target.x, target.y)) {
      // не дотянуться — не едим клик: пусть будет удар/ничего
      return false;
    }
    consumeT = performance.now() + 120;   // подавить удар этим же кликом
    if (hoverDrop) {
      try { WS.Action.autoPickup(); } catch (e) { /* пусто */ }
      return true;
    }
    var o = target;
    if (o.door) {
      try { WS.Action.toggleDoor(o); } catch (e) { /* пусто */ }
      return true;
    }
    if (o.container) {
      try { WS.Loot.search(o); } catch (e) {
        try { WS.Action.searchContainer(o); } catch (e2) { /* пусто */ }
      }
      return true;
    }
    if (o.forage) {
      try { WS.Forage.tryHarvest(o); } catch (e) { /* пусто */ }
      return true;
    }
    // прочее — осмотр (и клик съеден, чтобы не махать кулаками в печь)
    try {
      WS.Ui && WS.Ui.toast && WS.Ui.toast(o.name || 'Ничего особенного', 'info');
      WS.Snd && WS.Snd.play('click', { x: o.x, y: o.y, vol: 0.4 });
    } catch (e) { /* пусто */ }
    return true;
  }

  /** Полное меню действий объекта мира (ПКМ). */
  function menuWorld(x, y) {
    var target = hoverDrop || hoverObj;
    if (!target) return;
    var reach = inReach(target.x, target.y);
    var items = [];
    var key = 'world:' + (target.id || (target.x + ',' + target.y));

    if (hoverDrop) {
      items.push({ label: 'Подобрать', hint: 'в сумку', disabled: !reach, fn: function () {
        try { WS.Action.autoPickup(); } catch (e) { /* пусто */ }
      } });
      var dr = null;
      try { dr = WS.Action.parseDrop(hoverDrop); } catch (e) { dr = null; }
      if (dr) items.push({ label: 'Осмотреть', hint: nameOfItem(dr.id), fn: function () {
        try { WS.Ui.toast(nameOfItem(dr.id) + (dr.count > 1 ? ' ×' + dr.count : ''), 'info'); } catch (e) { /* пусто */ }
      } });
    } else {
      var o = target;
      if (o.door) {
        items.push({ label: o.open ? 'Закрыть дверь' : 'Открыть дверь', disabled: !reach, fn: function () {
          try { WS.Action.toggleDoor(o); } catch (e) { /* пусто */ }
        } });
      }
      if (o.container) {
        items.push({ label: o.looted ? 'Осмотреть ещё раз' : 'Обыскать', hint: 'E', disabled: !reach, fn: function () {
          try { WS.Loot.search(o); } catch (e) { /* пусто */ }
        } });
        if (!o.looted) {
          items.push({ label: 'Обыскать и забрать всё', disabled: !reach, fn: function () {
            try {
              WS.Loot.search(o);
              // экран откроется — takeAll сделает watch-режим контейнера
            } catch (e) { /* пусто */ }
          } });
        }
      }
      if (o.heat) {
        items.push({ label: 'Растопить печь', hint: 'нужны дрова и спички', disabled: !reach, fn: function () {
          var r = null;
          try { r = WS.Fire.lightStove(o); } catch (e) { r = null; }
          if (r && r.ok) WS.Ui.toast('Печь затоплена', 'good');
          else WS.Ui.toast('Не вышло: ' + ((r && r.reason) || 'нет дров или спичек'), 'warn');
        } });
      }
      if (String(o.sprName || '').indexOf('bed') === 0) {
        items.push({ label: 'Лечь спать', hint: 'Z', disabled: !reach, fn: function () {
          try { WS.Needs.trySleep(); } catch (e) { /* пусто */ }
        } });
      }
      if (o.forage) {
        items.push({ label: 'Собрать', hint: nameOfItem(o.forage.item), disabled: !reach, fn: function () {
          try { WS.Forage.tryHarvest(o); } catch (e) { /* пусто */ }
        } });
      }
      items.push({ label: 'Осмотреть', disabled: !reach, fn: function () {
        try { WS.Ui.toast(o.name || 'Ничего особенного', 'info'); } catch (e) { /* пусто */ }
      } });
    }
    openMenu(x, y, items, key);
  }

  // ====================================================================
  //  МЕНЮ ПРЕДМЕТОВ ЭКРАНОВ (инвентарь / контейнер)
  // ====================================================================

  /** Инвентарь игрока (экран инвентаря ИЛИ экран контейнера, сторона игрока). */
  function menuInvItem(x, y, idx, inContainer) {
    var p = P();
    if (!p || !p.inv || !p.inv[idx]) return;
    var it = p.inv[idx];
    var def = defOf(it.id);
    if (!def) return;
    var items = [];
    var key = 'inv:' + idx + ':' + it.id;

    if (canEat(def)) items.push({ label: 'Съесть', fn: function () {
      try { WS.Needs.eat({ id: it.id }); } catch (e) { /* пусто */ }
    } });
    if (canDrink(def)) items.push({ label: 'Выпить', fn: function () {
      try { WS.Needs.drink({ id: it.id }); } catch (e) { /* пусто */ }
    } });
    var slots = equipSlots(def);
    if (slots) items.push({ label: 'Надеть', hint: slots[0], fn: function () {
      try { WS.Inv.equip(slots[0], idx); } catch (e) { /* пусто */ }
    } });
    else if (handable(def)) items.push({ label: 'Взять в руку', fn: function () {
      try { WS.Inv.equip('hand1', idx); } catch (e) { /* пусто */ }
    } });
    if (readable(def)) items.push({ label: 'Читать', fn: function () {
      try { WS.Reading.start(it.id); } catch (e) { /* пусто */ }
    } });
    if (inContainer) items.push({ label: 'Положить в контейнер', fn: function () {
      try { WS.ContScreen.put(idx); } catch (e) { /* пусто */ }
    } });
    if ((it.count || 1) > 1) items.push({ label: 'Разделить стопку', fn: function () {
      try { WS.Inv.split(idx); } catch (e) { /* пусто */ }
    } });
    items.push({ label: 'Выбросить', danger: true, fn: function () {
      try { WS.Inv.drop(idx, 1); } catch (e) { /* пусто */ }
    } });

    openMenu(x, y, items, key);
  }

  /** Вещь со стороны контейнера. */
  function menuContItem(x, y, idx) {
    var o = WS.ContScreen ? WS.ContScreen.object() : null;
    // экран контейнера работает с o.inv (записи {id, count}), а НЕ с o.container
    // (там лежит спецификация лута) — раньше меню молча не открывалось
    if (!o || !o.inv) return;
    var it = o.inv[idx];
    var def = defOf(it.id);
    if (!def) return;
    var items = [];
    var key = 'cont:' + idx + ':' + it.id;

    // быстрое действие: сначала взять (запрос пользователя), потом юзать
    items.push({ label: 'Взять в сумку', hint: 'ЛКМ', fn: function () {
      try { WS.ContScreen.take(idx); } catch (e) { /* пусто */ }
    } });
    items.push({ label: 'Взять всё', fn: function () {
      try { WS.ContScreen.takeAll(); } catch (e) { /* пусто */ }
    } });
    items.push({ label: 'Съесть на месте', disabled: !canEat(def), fn: function () {
      // сначала возьмём, потом съедим
      try {
        if (WS.ContScreen.take(idx)) WS.Needs.eat({ id: it.id });
      } catch (e) { /* пусто */ }
    } });
    items.push({ label: 'Осмотреть', fn: function () {
      try { WS.Ui.toast(nameOfItem(it.id) + (it.count > 1 ? ' ×' + it.count : ''), 'info'); } catch (e) { /* пусто */ }
    } });
    openMenu(x, y, items, key);
  }

  // ====================================================================
  //  СОБЫТИЯ
  // ====================================================================

  function onCanvasMouseDown(d) {
    if (!d) return;
    var mx = d.x, my = d.y;
    if (d.button === 0) {
      // ЛКМ: в мире — быстрое действие (если наведён объект)
      if (playing() && (hoverObj || hoverDrop)) quickActionWorld();
    } else if (d.button === 2) {
      // ПКМ: меню
      if (playing() && (hoverObj || hoverDrop)) {
        menuWorld(mx, my);
        consumeT = performance.now() + 120;   // подавить «взаимодействие» ПКМ
      }
    }
  }

  /** Делегированный contextmenu по экранам (инвентарь/контейнер). */
  function onScreenContext(e) {
    if (e.defaultPrevented) return;
    var t = e.target;
    if (!t || !t.closest) return;
    var inCont = false;
    try { inCont = !!(WS.ContScreen && WS.ContScreen.isOpen()); } catch (er) { inCont = false; }

    // слот стороны контейнера: .cont-slot[data-c]
    var cs = t.closest('.cont-slot');
    if (cs && inCont) {
      var ci = parseInt(cs.getAttribute('data-c'), 10);
      if (!isNaN(ci)) {
        e.preventDefault();
        menuContItem(e.clientX, e.clientY, ci);
        return;
      }
    }
    // слот игрока (экран контейнера): .inv-slot[data-p]
    var ps = t.closest('.inv-slot[data-p]');
    if (ps && inCont) {
      var pi = parseInt(ps.getAttribute('data-p'), 10);
      if (!isNaN(pi)) {
        e.preventDefault();
        menuInvItem(e.clientX, e.clientY, pi, true);
        return;
      }
    }
    // слот инвентаря (экран инвентаря): .inv-slot[data-i]
    var is = t.closest('.inv-slot[data-i]');
    if (is) {
      var ii = parseInt(is.getAttribute('data-i'), 10);
      if (!isNaN(ii)) {
        e.preventDefault();
        menuInvItem(e.clientX, e.clientY, ii, false);
      }
    }
  }

  // ====================================================================
  //  ТИК: обновление hover
  // ====================================================================

  var hoverAcc = 0;
  function uxTick(dt) {
    hoverAcc += dt;
    if (hoverAcc < 0.05) return;          // 20 раз/сек хватает
    hoverAcc = 0;
    refreshHover();
  }

  // ====================================================================
  //  BOOT
  // ====================================================================

  WS.boot(function initWorldUX() {
    // canvas-события через шину
    WS.Ev.on('mouse:down', onCanvasMouseDown);

    // свой учёт «курсор над игрой»: DOM mousemove говорит, над чем курсор на
    // самом деле (канвас или панель интерфейса). В headless событий нет —
    // считаем, что над игрой (по умолчанию true).
    document.addEventListener('mousemove', function (e) {
      mouseOnGame = !!(e.target && (e.target.id === 'game' ||
        (e.target.tagName === 'CANVAS')));
    }, false);

    // движение мыши — обновляем тултип в тике (дешевле, чем на каждый mousemove)
    WS.tick(70, uxTick, 'ux:world');

    // contextmenu на всём документе — экраны делегированием
    document.addEventListener('contextmenu', onScreenContext, false);

    // модалка открылась — прибрать своё
    WS.Ev.on('ui:screen:open', function () { hideTip(); closeMenu(); });
    WS.Ev.on('game:start', function () { hideTip(); closeMenu(); });

    WS.log('worldux: наведение/ЛКМ/ПКМ готовы');
  }, 'worldux:init');

  WS.def('WorldUX', {
    /** actions.js спрашивает: съеден ли текущий ЛКМ быстрым действием. */
    consumedClick: function () { return performance.now() < consumeT; },
    closeMenu: closeMenu,
    menuOpen: menuOpen,
    /** Тестам: что под курсором. */
    _hover: function () { return { obj: hoverObj, drop: hoverDrop }; },
    /** Тестам: тултип виден? */
    _tipVisible: function () { return !!(tipEl && !tipEl.classList.contains('hidden')); },
    /** Тестам: пункты меню. */
    _menuItems: function () {
      if (!menuEl || menuEl.classList.contains('hidden')) return [];
      var out = [], b = menuEl.querySelectorAll('.ctx-item');
      for (var i = 0; i < b.length; i++) out.push(b[i].querySelector('.ctx-lbl').textContent);
      return out;
    },
    /** Тестам: открыть меню объекта под курсором. */
    _openMenuAt: function (x, y) { menuWorld(x, y); }
  });
})();
