/**
 * inventory_screen.js — ОКНО ИНВЕНТАРЯ + ПАУЗА (модуль D2): экипировка слева,
 * сетка предметов в центре, деталь предмета справа; вес, свежесть (цветная
 * рамка + иконка гнили), износ, действия (съесть/выпить/надеть/в руки/
 * разделить/починить/бросить/в контейнер). Здесь же объявлены иконки
 * категорий icon_* (24x24), экран паузы (Esc) и ЕДИНЫЙ роутер клавиш D2
 * (I/Tab, C, Escape) + привязка точек входа к WS.Ui (openContainer и др.,
 * их зовёт looting.js и хоткеи агента D4). Связи: WS.Inv, WS.Needs,
 * WS.ToolTip, WS.ContScreen, WS.CraftScreen, css/panels.css.
 */
(function () {
  'use strict';

  // ====================================================================
  //  НАСТРОЙКИ И КОНСТАНТЫ
  // ====================================================================

  /** Подписи слотов экипировки (порядок = WS.Inv.SLOTS). */
  var SLOT_LABEL = {
    head: 'Голова', torso: 'Торс', legs: 'Ноги', feet: 'Обувь',
    hands: 'Кисти', back: 'Спина', hand1: 'Рука I', hand2: 'Рука II'
  };

  /** Подсказка под пустым слотом экипировки. */
  var SLOT_HINT = {
    head: 'шапка', torso: 'одежда', legs: 'штаны', feet: 'валенки',
    hands: 'рукавицы', back: 'спальник, нарты', hand1: 'оружие, инструмент',
    hand2: 'второе руку не занять двуручным'
  };

  /** Режимы сортировки сетки. */
  var SORT_RU = { cat: 'По категории', w: 'По весу', name: 'По имени' };

  // ====================================================================
  //  СОСТОЯНИЕ МОДУЛЯ
  // ====================================================================

  var open = false;          // окно инвентаря открыто
  var pauseOpen = false;     // экран паузы открыт
  var selIdx = -1;           // выбранный индекс в p.inv (из snapshot.i)
  var selEquip = null;       // или выбранный слот экипировки ('hand1'...)
  var sortMode = 'cat';      // режим сортировки: cat | w | name

  var root = null;           // .scr-inventory
  var proot = null;          // .scr-pause
  var dom = {};              // ссылки на узлы инвентаря
  var pdom = {};             // ссылки на узлы паузы

  var renderTimer = 0;      // отложенная перерисовка (inv:changed)
  var uiTimer = 0;           // интервал перепривязки WS.Ui
  var uiBound = false;       // register уже выполнен

  /** Метки времени обработки клавиш (защита от двойного срабатывания
   *  keydown-роутера и тика 80). */
  var keyConsumed = {};

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

  /** Можно ли есть (совпадает с логикой WS.Needs.eat). */
  function canEat(def) {
    if (!def) return false;
    return (def.cal && def.cal > 0) ||
           (def.tags && def.tags.indexOf('edible') >= 0);
  }

  /** Можно ли пить. */
  function canDrink(def) {
    if (!def) return false;
    return (def.thir && def.thir > 0) ||
           (def.tags && def.tags.indexOf('drinkable') >= 0) ||
           def.cat === 'drink';
  }

  /** Можно ли взять в руку (как WS.Inv — дубль логики, чтобы не лезть внутрь). */
  function handable(def) {
    if (!def) return false;
    if (def.dmg > 0) return true;
    if (def.ranged) return true;
    return ['tool', 'weapon', 'ranged', 'light'].indexOf(def.cat) >= 0;
  }

  // ====================================================================
  //  ИКОНКИ КАТЕГОРИЙ (24x24, WS.Spr.def)
  //  Одна на каждую категорию предмета; рисуем пиксель-арт кодом в
  //  приглушённой палитре севера. Забираются через WS.ToolTip.iconUrl.
  // ====================================================================

  function defIcons() {
    var S = WS.Spr;
    if (!S || !S.def) return;

    // --- еда: батон хлеба с надрезами ---
    S.def('icon_food', { w: 24, h: 24, draw: function (c) {
      S.px(c, 3, 10, 18, 7, '#a8763e');
      S.px(c, 4, 9, 16, 2, '#c08d4c');
      S.px(c, 3, 16, 18, 2, '#8a5f30');
      S.px(c, 7, 10, 2, 5, '#e2c79a');
      S.px(c, 11, 10, 2, 5, '#e2c79a');
      S.px(c, 15, 10, 2, 5, '#e2c79a');
    }});

    // --- питьё: фляга с водой ---
    S.def('icon_drink', { w: 24, h: 24, draw: function (c) {
      S.px(c, 9, 2, 6, 3, '#8a6a4a');
      S.px(c, 8, 5, 8, 3, '#6b6f78');
      S.ell(c, 12, 14, 7, 7, '#7d828c');
      S.ell(c, 12, 14, 5, 5, '#5d8bab');
      S.px(c, 9, 11, 2, 2, '#a9c6dd');
    }});

    // --- инструмент: молоток ---
    S.def('icon_tool', { w: 24, h: 24, draw: function (c) {
      S.px(c, 4, 4, 14, 5, '#767a82');
      S.px(c, 4, 4, 14, 1, '#aab2bc');
      S.px(c, 16, 5, 4, 3, '#5f636b');
      S.px(c, 10, 9, 3, 11, '#6b5138');
      S.px(c, 10, 9, 1, 11, '#8a6d50');
    }});

    // --- оружие: нож ---
    S.def('icon_weapon', { w: 24, h: 24, draw: function (c) {
      S.px(c, 11, 3, 3, 10, '#aab2bc');
      S.px(c, 12, 3, 1, 10, '#d3dae2');
      S.px(c, 9, 13, 7, 2, '#57422e');
      S.px(c, 10, 15, 4, 6, '#4a3a2a');
      S.px(c, 10, 15, 1, 6, '#6b5138');
    }});

    // --- огнестрел: винтовка ---
    S.def('icon_ranged', { w: 24, h: 24, draw: function (c) {
      S.px(c, 2, 12, 16, 2, '#767a82');
      S.px(c, 2, 12, 16, 1, '#aab2bc');
      S.px(c, 14, 11, 6, 4, '#57422e');
      S.px(c, 8, 14, 4, 3, '#57422e');
      S.px(c, 4, 9, 5, 2, '#6b5138');
    }});

    // --- боеприпасы: патрон ---
    S.def('icon_ammo', { w: 24, h: 24, draw: function (c) {
      S.px(c, 10, 7, 5, 12, '#b9903f');
      S.px(c, 10, 7, 5, 1, '#d8b46a');
      S.px(c, 11, 3, 3, 4, '#c98a4a');
      S.px(c, 11, 19, 3, 2, '#8a6224');
    }});

    // --- свет: фонарь ---
    S.def('icon_light', { w: 24, h: 24, draw: function (c) {
      S.px(c, 10, 2, 5, 2, '#767a82');
      S.px(c, 8, 4, 9, 12, '#57422e');
      S.px(c, 10, 6, 5, 8, '#f4b968');
      S.px(c, 11, 7, 1, 4, '#fde8bc');
      S.px(c, 7, 16, 11, 2, '#57422e');
      S.px(c, 9, 18, 7, 3, '#4a3a2a');
    }});

    // --- топливо: полено ---
    S.def('icon_fuel', { w: 24, h: 24, draw: function (c) {
      S.ell(c, 13, 12, 9, 5, '#57422e');
      S.px(c, 3, 10, 18, 4, '#6b5138');
      S.ell(c, 4, 12, 2, 4, '#a89a7c');
      S.px(c, 3, 17, 18, 2, '#4a3a2a');
    }});

    // --- медицина: рулон бинта ---
    S.def('icon_med', { w: 24, h: 24, draw: function (c) {
      S.ell(c, 10, 12, 7, 7, '#d8dee9');
      S.ell(c, 10, 12, 3, 3, '#8b95a5');
      S.px(c, 16, 9, 5, 8, '#c9c2b4');
      S.px(c, 16, 15, 5, 2, '#b3ac9e');
    }});

    // --- одежда: рукавица ---
    S.def('icon_cloth', { w: 24, h: 24, draw: function (c) {
      S.ell(c, 12, 9, 6, 6, '#7d6046');
      S.px(c, 4, 8, 6, 7, '#7d6046');
      S.px(c, 6, 15, 11, 6, '#8f7c63');
      S.px(c, 6, 15, 11, 1, '#6b5138');
    }});

    // --- материалы: доски и гвоздь ---
    S.def('icon_material', { w: 24, h: 24, draw: function (c) {
      S.px(c, 3, 6, 18, 4, '#8a6d50');
      S.px(c, 3, 12, 18, 4, '#7d6046');
      S.px(c, 11, 4, 2, 14, '#aab2bc');
      S.px(c, 10, 4, 4, 1, '#d3dae2');
    }});

    // --- книги: том с корешком ---
    S.def('icon_book', { w: 24, h: 24, draw: function (c) {
      S.px(c, 5, 4, 14, 16, '#7a4a3c');
      S.px(c, 7, 4, 12, 16, '#c9c2b4');
      S.px(c, 7, 4, 3, 16, '#5f6b55');
      S.px(c, 11, 8, 7, 1, '#8b95a5');
      S.px(c, 11, 11, 7, 1, '#8b95a5');
    }});

    // --- тара: мешок ---
    S.def('icon_container', { w: 24, h: 24, draw: function (c) {
      S.px(c, 9, 3, 6, 3, '#57422e');
      S.px(c, 10, 5, 4, 2, '#8a6d50');
      S.ell(c, 12, 13, 8, 8, '#a89a7c');
      S.ell(c, 10, 11, 3, 2, '#bfae8e');
    }});

    // --- разное: вещевой узел ---
    S.def('icon_misc', { w: 24, h: 24, draw: function (c) {
      S.ell(c, 12, 13, 8, 6, '#8b95a5');
      S.px(c, 8, 5, 8, 3, '#6b6f78');
      S.px(c, 10, 3, 4, 2, '#57422e');
      S.px(c, 3, 11, 4, 3, '#8b95a5');
      S.px(c, 17, 11, 4, 3, '#8b95a5');
    }});

    // --- гниль: метка испорченной еды (уголок слота) ---
    S.def('ui_rot', { w: 24, h: 24, draw: function (c) {
      S.ell(c, 12, 13, 9, 8, 'rgba(94,128,52,0.92)');
      S.ell(c, 9, 10, 3, 2, '#7ea36a');
      S.px(c, 8, 8, 3, 3, '#d8dee9');
      S.px(c, 14, 12, 3, 3, '#d8dee9');
      S.px(c, 10, 15, 2, 2, '#d8dee9');
      S.px(c, 15, 6, 2, 2, '#d8dee9');
    }});
  }

  // ====================================================================
  //  ПОСТРОЕНИЕ DOM: ОКНО ИНВЕНТАРЯ
  // ====================================================================

  function build() {
    if (root) return;
    var uiRoot = document.getElementById('ui-root');
    if (!uiRoot) return;

    root = el('div', 'scr scr-inventory hidden');
    var back = el('div', 'scr-backdrop inv-backdrop');
    root.appendChild(back);

    var box = el('div', 'ws-panel inv-box');
    root.appendChild(box);

    // --- шапка ---
    var head = el('div', 'scr-head');
    head.appendChild(el('span', 'ws-title', 'Инвентарь'));
    var sub = el('span', 'scr-sub');
    sub.id = 'inv-sub';
    head.appendChild(sub);
    var closeBtn = el('button', 'scr-close');
    closeBtn.type = 'button';
    closeBtn.textContent = '×';
    closeBtn.title = 'Закрыть (I)';
    head.appendChild(closeBtn);
    box.appendChild(head);

    // --- три колонки ---
    var layout = el('div', 'inv-layout');
    box.appendChild(layout);

    // левая: экипировка
    var left = el('div', 'inv-left');
    left.appendChild(el('div', 'pane-title', 'Экипировка'));
    var eqList = el('div', 'eq-list');
    var i;
    for (i = 0; i < WS.Inv.SLOTS.length; i++) {
      eqList.appendChild(buildEquipSlot(WS.Inv.SLOTS[i]));
    }
    left.appendChild(eqList);
    var eqSum = el('div', 'eq-sum');
    eqSum.id = 'inv-eqsum';
    left.appendChild(eqSum);
    layout.appendChild(left);

    // центр: сортировка + сетка
    var mid = el('div', 'inv-mid');
    var bar = el('div', 'inv-toolbar');
    var sorts = ['cat', 'w', 'name'];
    for (i = 0; i < sorts.length; i++) {
      var b = el('button', 'chip chip-sort');
      b.type = 'button';
      b.textContent = SORT_RU[sorts[i]];
      b.setAttribute('data-sort', sorts[i]);
      bar.appendChild(b);
    }
    var comp = el('button', 'chip chip-compact');
    comp.type = 'button';
    comp.textContent = 'Уложить';
    comp.title = 'Сложить одинаковые стопки (WS.Inv.compact)';
    comp.setAttribute('data-act', 'compact');
    bar.appendChild(comp);
    mid.appendChild(bar);

    var grid = el('div', 'items-grid scroll-y');
    grid.id = 'inv-grid';
    mid.appendChild(grid);
    layout.appendChild(mid);

    // правая: деталь предмета
    var right = el('div', 'inv-right');
    right.appendChild(el('div', 'pane-title', 'Предмет'));
    var det = el('div', 'detail-body scroll-y');
    det.id = 'inv-detail';
    right.appendChild(det);
    layout.appendChild(right);

    // --- подвал: вес ---
    var foot = el('div', 'inv-foot');
    var wb = el('div', 'weight-bar');
    var fill = el('div', 'wb-fill');
    wb.appendChild(fill);
    var wtext = el('span', 'wb-text');
    wb.appendChild(wtext);
    foot.appendChild(wb);
    var cnt = el('span', 'inv-count');
    cnt.id = 'inv-count';
    foot.appendChild(cnt);
    box.appendChild(foot);

    uiRoot.appendChild(root);

    dom = {
      back: back, box: box, sub: sub, closeBtn: closeBtn,
      eqList: eqList, eqSum: eqSum, grid: grid, detail: det,
      wbFill: fill, wbText: wtext, count: cnt
    };

    // --- события (делегирование) ---
    back.addEventListener('click', closeInventory, false);
    closeBtn.addEventListener('click', closeInventory, false);
    eqList.addEventListener('click', onEquipClick, false);
    eqList.addEventListener('dblclick', onEquipDbl, false);
    grid.addEventListener('click', onGridClick, false);
    grid.addEventListener('dblclick', onGridDbl, false);
    det.addEventListener('click', onDetailAction, false);
    bar.addEventListener('click', onToolbar, false);
  }

  /** Один слот экипировки (без содержимого — оно в renderEquip). */
  function buildEquipSlot(slot) {
    var d = el('div', 'eq-slot empty');
    d.setAttribute('data-slot', slot);
    d.appendChild(el('span', 'eq-label', SLOT_LABEL[slot] || slot));
    var body = el('div', 'eq-body');
    d.appendChild(body);
    return d;
  }

  // ====================================================================
  //  ПОСТРОЕНИЕ DOM: ЭКРАН ПАУЗЫ
  // ====================================================================

  function buildPause() {
    if (proot) return;
    var uiRoot = document.getElementById('ui-root');
    if (!uiRoot) return;

    proot = el('div', 'scr scr-pause hidden');
    var back = el('div', 'scr-backdrop pause-backdrop');
    proot.appendChild(back);

    var box = el('div', 'ws-panel pause-box');
    proot.appendChild(box);

    box.appendChild(el('div', 'pause-title', 'Пауза'));
    var info = el('div', 'pause-info');
    info.id = 'pause-info';
    box.appendChild(info);

    var btns = el('div', 'pause-btns');
    btns.appendChild(pauseBtn('Продолжить', 'primary', 'resume'));
    btns.appendChild(pauseBtn('Сохранить', '', 'save'));
    btns.appendChild(pauseBtn('Настройки', '', 'settings'));
    btns.appendChild(pauseBtn('Выйти в меню', 'danger', 'exit'));
    box.appendChild(btns);

    // --- настройки (раскрываются кнопкой) ---
    var st = el('div', 'pause-settings hidden');
    st.id = 'pause-settings';

    var row1 = el('div', 'set-row');
    row1.appendChild(el('span', 'set-label', 'Громкость'));
    var vol = el('input', 'set-volume');
    vol.type = 'range';
    vol.min = '0'; vol.max = '100'; vol.step = '5';
    vol.id = 'pause-volume';
    row1.appendChild(vol);
    var volV = el('span', 'set-value');
    volV.id = 'pause-volume-val';
    row1.appendChild(volV);
    st.appendChild(row1);

    var row2 = el('div', 'set-row');
    row2.appendChild(el('span', 'set-label', 'Скорость игры'));
    var speeds = el('div', 'speed-btns');
    var SPD = [['1', 1], ['2', 2], ['3', 3], ['4', 4]];
    for (var i = 0; i < SPD.length; i++) {
      var sb = el('button', 'chip chip-speed');
      sb.type = 'button';
      sb.textContent = '×' + SPD[i][0];
      sb.setAttribute('data-speed', String(SPD[i][1]));
      speeds.appendChild(sb);
    }
    row2.appendChild(speeds);
    st.appendChild(row2);

    box.appendChild(st);
    uiRoot.appendChild(proot);

    pdom = { back: back, box: box, info: info, settings: st, vol: vol, volV: volV };

    // --- события ---
    back.addEventListener('click', closePause, false);
    btns.addEventListener('click', onPauseBtn, false);
    vol.addEventListener('input', onVolume, false);
    speeds.addEventListener('click', onSpeed, false);
  }

  function pauseBtn(text, cls, act) {
    var b = el('button', 'ws-btn pause-btn' + (cls ? ' ' + cls : ''));
    b.type = 'button';
    b.textContent = text;
    b.setAttribute('data-pact', act);
    return b;
  }

  // ====================================================================
  //  РЕНДЕР: ИНВЕНТАРЬ
  // ====================================================================

  /** Снимок инвентаря (или пустышка, если игры нет). */
  function snap() {
    if (WS.Inv && WS.Inv.snapshot) return WS.Inv.snapshot();
    return { slots: [], equip: {}, weight: 0, maxWeight: 30, overload: 0 };
  }

  /** Отложенная перерисовка (событие inv:changed). */
  function scheduleRender() {
    if (!open) return;
    if (renderTimer) clearTimeout(renderTimer);
    renderTimer = setTimeout(function () {
      renderTimer = 0;
      render();
    }, 40);
  }

  /** Полная перерисовка окна. */
  function render() {
    if (!open || !root) return;
    var s = snap();

    // запомнить выбранное — вернуть по id после пересборки
    var keepId = null;
    if (selIdx >= 0) {
      for (var i = 0; i < s.slots.length; i++) {
        if (s.slots[i].i === selIdx) { keepId = s.slots[i].id; break; }
      }
    }

    renderEquip(s);
    renderGrid(s, keepId);
    renderDetail(s);
    renderWeight(s);
    renderSortChips();

    if (WS.Time && WS.Time.fmt) {
      dom.sub.textContent = 'День ' + (WS.Time.day ? WS.Time.day() : 1) + ' · ' + WS.Time.fmt();
    } else {
      dom.sub.textContent = '';
    }
  }

  /** Подсветка активного режима сортировки. */
  function renderSortChips() {
    if (!dom.box) return;
    var chips = dom.box.querySelectorAll('.chip-sort');
    for (var i = 0; i < chips.length; i++) {
      var m = chips[i].getAttribute('data-sort');
      chips[i].className = 'chip chip-sort' + (m === sortMode ? ' on' : '');
    }
  }

  /** Колонка экипировки. */
  function renderEquip(s) {
    if (!dom.eqList) return;
    var kids = dom.eqList.childNodes;
    var i, k, slot, info, cell;
    for (k = 0; k < kids.length; k++) {
      slot = kids[k].getAttribute('data-slot');
      info = s.equip ? s.equip[slot] : null;
      cell = kids[k];
      var body = cell.querySelector ? cell.querySelector('.eq-body') : null;
      if (!body) continue;

      // очистить тело слота
      while (body.firstChild) body.removeChild(body.firstChild);
      cell.className = 'eq-slot' + (info ? '' : ' empty') +
        (selEquip === slot ? ' sel' : '');
      if (!info) {
        var hint = el('span', 'eq-hint', SLOT_HINT[slot] || '—');
        body.appendChild(hint);
        WS.ToolTip.unbind(cell);
        continue;
      }
      var def = defOf(info.id);
      var ico = (WS.Icons && info && info.id) ? WS.Icons.iconNode(info.id, 'eq-ico')
        : WS.ToolTip.catIconNode(def ? def.cat : 'misc', 'eq-ico');
      body.appendChild(ico);
      var nm = el('span', 'eq-name', info.name);
      body.appendChild(nm);
      if (typeof info.cond === 'number' && info.cond < 100) {
        var cb = el('span', 'eq-cond');
        var f = el('i');
        f.style.width = clamp(info.cond, 0, 100) + '%';
        cb.appendChild(f);
        body.appendChild(cb);
      }
      WS.ToolTip.bind(cell, WS.ToolTip.itemHtml({
        id: info.id, name: info.name, cond: info.cond
      }));
    }

    // сводка тепла/защиты (WS.Inv.warmTotal/defTotal)
    var warm = (WS.Inv && WS.Inv.warmTotal) ? WS.Inv.warmTotal() : 0;
    var prot = (WS.Inv && WS.Inv.defTotal) ? WS.Inv.defTotal() : 0;
    dom.eqSum.textContent = 'Тепло: +' + warm + ' · Защита: ' + prot;
  }

  /** Сетка предметов (с сохранением выбора по id). */
  function renderGrid(s, keepId) {
    if (!dom.grid) return;
    var scroll = dom.grid.scrollTop;
    var frag = document.createDocumentFragment();
    var i, info, def, cell;

    if (!s.slots.length) {
      var empty = el('div', 'grid-empty', 'Сумка пуста');
      frag.appendChild(empty);
    }

    for (i = 0; i < s.slots.length; i++) {
      info = s.slots[i];
      def = defOf(info.id);
      cell = buildItemCell(info, def);
      if ((keepId && info.id === keepId) || (!keepId && selIdx === info.i)) {
        cell.className += ' sel';
      }
      frag.appendChild(cell);
    }

    while (dom.grid.firstChild) dom.grid.removeChild(dom.grid.firstChild);
    dom.grid.appendChild(frag);
    dom.grid.scrollTop = scroll;

    // счётчик стопок и предметов
    var total = 0;
    for (i = 0; i < s.slots.length; i++) total += s.slots[i].count || 1;
    dom.count.textContent = 'Стопок: ' + s.slots.length + ' · Предметов: ' + total;

    // поправить выбор: тот же id или сброс
    if (keepId) {
      var found = -1;
      for (i = 0; i < s.slots.length; i++) {
        if (s.slots[i].id === keepId) { found = s.slots[i].i; break; }
      }
      selIdx = found;
      if (found < 0) selEquip = null;
    } else if (selIdx >= 0) {
      var alive = false;
      for (i = 0; i < s.slots.length; i++) {
        if (s.slots[i].i === selIdx) { alive = true; break; }
      }
      if (!alive) selIdx = -1;
    }
  }

  /** Ячейка предмета сетки. */
  function buildItemCell(info, def) {
    var TT = WS.ToolTip;
    var cls = 'inv-slot';
    var fr = TT.freshness ? TT.freshness(info.per, info.age) : null;
    if (fr) cls += ' fresh-' + fr.cls;
    if (info.spoiled) cls += ' spoiled';

    var cell = el('div', cls);
    cell.setAttribute('data-i', String(info.i));

    var ico = (WS.Icons && info && info.id) ? WS.Icons.iconNode(info.id, 'slot-ico')
        : TT.catIconNode(def ? def.cat : 'misc', 'slot-ico');
    cell.appendChild(ico);

    if (info.count && info.count > 1) {
      var cb = el('span', 'slot-count', '×' + info.count);
      cell.appendChild(cb);
    }
    if (typeof info.cond === 'number') {
      var cond = el('span', 'slot-cond');
      var f = el('i');
      f.style.width = clamp(info.cond, 0, 100) + '%';
      cond.appendChild(f);
      cell.appendChild(cond);
    }
    if (info.spoiled) {
      var rot = TT.iconNode('ui_rot', 'slot-rot');
      cell.appendChild(rot);
    }
    if (TT.bind) TT.bind(cell, TT.itemHtml(info));
    return cell;
  }

  /** Правая колонка: деталь выбранного. */
  function renderDetail(s) {
    if (!dom.detail) return;
    var TT = WS.ToolTip;
    while (dom.detail.firstChild) dom.detail.removeChild(dom.detail.firstChild);

    // --- выбран слот экипировки ---
    if (selEquip) {
      var eq = s.equip ? s.equip[selEquip] : null;
      if (!eq) {
        dom.detail.appendChild(el('div', 'd-empty', 'Слот пуст'));
        return;
      }
      dom.detail.appendChild(buildDetailMain(eq.id, eq.name, eq.cond, true));
      return;
    }

    // --- выбран предмет сумки ---
    var info = null;
    if (selIdx >= 0) {
      for (var i = 0; i < s.slots.length; i++) {
        if (s.slots[i].i === selIdx) { info = s.slots[i]; break; }
      }
    }
    if (!info) {
      dom.detail.appendChild(el('div', 'd-empty',
        'Выберите предмет в сумке или слот экипировки'));
      return;
    }
    dom.detail.appendChild(buildDetailMain(info.id, info.name, info.cond, false, info));
  }

  /**
   * Детальная карточка: большая иконка, имя, категория, статы, полоски,
   * кнопки действий. fromEquip — из слота экипировки (не из сумки).
   */
  function buildDetailMain(id, name, cond, fromEquip, slotInfo) {
    var TT = WS.ToolTip;
    var def = defOf(id);
    var wrap = el('div', 'd-main');

    // --- иконка с рамкой свежести ---
    var icoBox = el('div', 'd-ico');
    var fr = null;
    if (slotInfo && TT.freshness) fr = TT.freshness(slotInfo.per, slotInfo.age);
    if (fr) icoBox.className += ' fresh-' + fr.cls;
    icoBox.appendChild((WS.Icons && slotInfo && slotInfo.id) ? WS.Icons.iconNode(slotInfo.id)
        : TT.catIconNode(def ? def.cat : 'misc'));
    if (slotInfo && slotInfo.spoiled) icoBox.appendChild(TT.iconNode('ui_rot', 'slot-rot'));
    wrap.appendChild(icoBox);

    // --- имя и категория ---
    wrap.appendChild(el('div', 'd-name', name));
    if (def) {
      wrap.appendChild(el('div', 'd-cat',
        (TT.CAT_RU && TT.CAT_RU[def.cat]) || def.cat || 'Разное'));
    }

    // --- статы ---
    var lines = TT.statLines ? TT.statLines(def) : [];
    if (lines.length) {
      var st = el('div', 'd-stats');
      for (var i = 0; i < lines.length; i++) {
        st.appendChild(el('div', 'd-row', lines[i]));
      }
      wrap.appendChild(st);
    }

    // --- полоски: свежесть и износ ---
    if (fr) {
      var fb = el('div', 'd-bar fresh-' + fr.cls);
      var ff = el('div', 'd-bar-fill');
      ff.style.width = Math.round(fr.ratio * 100) + '%';
      fb.appendChild(ff);
      fb.appendChild(el('span', 'd-bar-label', fr.label));
      wrap.appendChild(fb);
    }
    if (typeof cond === 'number') {
      var cb2 = el('div', 'd-bar cond-bar');
      var cf = el('div', 'd-bar-fill');
      cf.style.width = clamp(cond, 0, 100) + '%';
      cb2.appendChild(cf);
      cb2.appendChild(el('span', 'd-bar-label',
        'Износ: ' + clamp(cond, 0, 100) + '%'));
      wrap.appendChild(cb2);
    }

    // --- кнопки действий ---
    var acts = el('div', 'd-actions');
    var btns = [];
    var b, i2;

    if (!fromEquip && def) {
      if (canEat(def)) btns.push(actionBtn('Съесть', 'primary', 'eat'));
      if (canDrink(def)) btns.push(actionBtn('Выпить', 'primary', 'drink'));
      if (def.slots && def.slots.length) {
        var slotName = def.slots[0];
        btns.push(actionBtn('Надеть (' + (SLOT_LABEL[slotName] || slotName) + ')',
          '', 'equip', slotName));
      }
      if (handable(def)) btns.push(actionBtn('В руки', '', 'equip', 'hand1'));
      if (slotInfo && slotInfo.count > 1 && slotInfo.stackMax > 1) {
        btns.push(actionBtn('Разделить', '', 'split'));
      }
      if (WS.Inv && WS.Inv.repairInfo) {
        var ri = null;
        try { ri = WS.Inv.repairInfo(selIdx); } catch (e) { ri = null; }
        if (ri && ri.ok) btns.push(actionBtn('Починить', '', 'repair'));
      }
      if (WS.ContScreen && WS.ContScreen.isOpen && WS.ContScreen.isOpen()) {
        btns.push(actionBtn('В контейнер', '', 'tocontainer'));
      }
    }
    if (fromEquip) {
      btns.push(actionBtn('Снять', 'primary', 'unequip'));
      if (WS.Inv && WS.Inv.repairInfo) {
        var ri2 = null;
        try { ri2 = WS.Inv.repairInfo(selEquip); } catch (e2) { ri2 = null; }
        if (ri2 && ri2.ok) btns.push(actionBtn('Починить', '', 'repair'));
      }
    }
    if (!fromEquip) btns.push(actionBtn('Бросить', 'danger', 'drop'));

    for (i2 = 0; i2 < btns.length; i2++) acts.appendChild(btns[i2]);
    if (!btns.length) acts.appendChild(el('div', 'd-empty', 'Действий нет'));
    wrap.appendChild(acts);

    // подсказка про выброс
    if (!fromEquip) {
      wrap.appendChild(el('div', 'd-hint',
        'Двойной щелчок — съесть / надеть. Q — выбросить из руки.'));
    }
    return wrap;
  }

  function actionBtn(text, cls, act, arg) {
    var b = el('button', 'ws-btn d-btn' + (cls ? ' ' + cls : ''));
    b.type = 'button';
    b.textContent = text;
    b.setAttribute('data-act', act);
    if (arg) b.setAttribute('data-arg', arg);
    return b;
  }

  /** Полоса веса внизу. */
  function renderWeight(s) {
    if (!dom.wbFill) return;
    var max = s.maxWeight || 30;
    if (max <= 0) max = 30;
    var ratio = clamp(s.weight / max, 0, 2);
    dom.wbFill.style.width = clamp(ratio * 50, 0, 100) + '%';  // 100% = 2x
    var cls = 'wb-fill';
    if (s.overload === 2) cls += ' wb-crit';
    else if (s.overload === 1) cls += ' wb-over';
    else cls += ' wb-ok';
    dom.wbFill.className = cls;

    var txt = '';
    if (WS.M && WS.M.fmtKg) txt = WS.M.fmtKg(s.weight) + ' / ' + WS.M.fmtKg(max) + ' кг';
    else txt = Math.round(s.weight) + ' / ' + max + ' кг';
    if (s.overload === 2) txt += ' — не унести!';
    else if (s.overload === 1) txt += ' — тяжело';
    dom.wbText.textContent = txt;
  }

  // ====================================================================
  //  ОБРАБОТЧИКИ ИНВЕНТАРЯ
  // ====================================================================

  /** Клик по ячейке сетки — выбор. */
  function onGridClick(e) {
    var t = e.target;
    while (t && t !== dom.grid) {
      if (t.className && String(t.className).indexOf('inv-slot') >= 0) break;
      t = t.parentNode;
    }
    if (!t || t === dom.grid) return;
    var i = parseInt(t.getAttribute('data-i'), 10);
    if (isNaN(i)) return;
    selIdx = i;
    selEquip = null;
    snd('select', 0.25);
    render();
  }

  /** Двойной щелчок — основное действие. */
  function onGridDbl(e) {
    var t = e.target;
    while (t && t !== dom.grid) {
      if (t.className && String(t.className).indexOf('inv-slot') >= 0) break;
      t = t.parentNode;
    }
    if (!t || t === dom.grid) return;
    var i = parseInt(t.getAttribute('data-i'), 10);
    if (isNaN(i)) return;
    selIdx = i;
    selEquip = null;
    primaryAction();
  }

  /** Клик по слоту экипировки — выбор. */
  function onEquipClick(e) {
    var t = e.target;
    while (t && t !== dom.eqList) {
      if (t.className && String(t.className).indexOf('eq-slot') >= 0) break;
      t = t.parentNode;
    }
    if (!t || t === dom.eqList) return;
    var slot = t.getAttribute('data-slot');
    if (!slot) return;
    selEquip = slot;
    selIdx = -1;
    snd('select', 0.25);
    render();
  }

  /** Двойной щелчок по экипировке — снять. */
  function onEquipDbl(e) {
    var t = e.target;
    while (t && t !== dom.eqList) {
      if (t.className && String(t.className).indexOf('eq-slot') >= 0) break;
      t = t.parentNode;
    }
    if (!t || t === dom.eqList) return;
    var slot = t.getAttribute('data-slot');
    if (!slot) return;
    selEquip = slot;
    actUnequip();
  }

  /** Кнопки действий из детальной панели. */
  function onDetailAction(e) {
    var t = e.target;
    while (t && t !== dom.detail) {
      if (t.getAttribute && t.getAttribute('data-act')) break;
      t = t.parentNode;
    }
    if (!t || t === dom.detail) return;
    var act = t.getAttribute('data-act');
    var arg = t.getAttribute('data-arg');
    doAction(act, arg);
  }

  /** Основное действие по двойному щелчку. */
  function primaryAction() {
    if (selIdx < 0) return;
    var s = snap();
    var info = null;
    for (var i = 0; i < s.slots.length; i++) {
      if (s.slots[i].i === selIdx) { info = s.slots[i]; break; }
    }
    if (!info) return;
    var def = defOf(info.id);
    if (!def) return;
    if (canEat(def)) { doAction('eat'); return; }
    if (canDrink(def)) { doAction('drink'); return; }
    if (def.slots && def.slots.length) { doAction('equip', def.slots[0]); return; }
    if (handable(def)) { doAction('equip', 'hand1'); return; }
  }

  /** Выполнить действие по коду. */
  function doAction(act, arg) {
    switch (act) {
      case 'eat': actEat(); break;
      case 'drink': actDrink(); break;
      case 'equip': actEquip(arg); break;
      case 'split': actSplit(); break;
      case 'repair': actRepair(); break;
      case 'drop': actDrop(); break;
      case 'unequip': actUnequip(); break;
      case 'tocontainer': actToContainer(); break;
      case 'compact':
        if (WS.Inv && WS.Inv.compact) {
          WS.Inv.compact();
          toast('Стопки уложены', 'info');
        }
        break;
    }
    render();
  }

  function selInfo() {
    if (selIdx < 0) return null;
    var s = snap();
    for (var i = 0; i < s.slots.length; i++) {
      if (s.slots[i].i === selIdx) return s.slots[i];
    }
    return null;
  }

  function actEat() {
    var info = selInfo();
    if (!info) return;
    if (info.spoiled) toast('Осторожно: это испортилось', 'warn');
    if (WS.Needs && WS.Needs.eat) {
      var r = null;
      try { r = WS.Needs.eat({ id: info.id }); } catch (e) { r = null; }
      if (!r || !r.ok) toast('Не вышло: ' + ((r && r.reason) || 'неизвестно'), 'warn');
    } else {
      toast('Еда недоступна (нет WS.Needs)', 'warn');
    }
  }

  function actDrink() {
    var info = selInfo();
    if (!info) return;
    if (WS.Needs && WS.Needs.drink) {
      var r = null;
      try { r = WS.Needs.drink({ id: info.id }); } catch (e) { r = null; }
      if (!r || !r.ok) toast('Не вышло: ' + ((r && r.reason) || 'неизвестно'), 'warn');
    } else {
      toast('Питьё недоступно (нет WS.Needs)', 'warn');
    }
  }

  function actEquip(slot) {
    if (selIdx < 0) return;
    if (!WS.Inv || !WS.Inv.equip) { toast('Нет WS.Inv', 'warn'); return; }
    var r = WS.Inv.equip(slot || 'hand1', selIdx);
    if (!r.ok) {
      toast(r.reason || 'не удалось', 'warn');
      snd('error', 0.4);
    } else {
      snd('select', 0.35);
    }
  }

  function actUnequip() {
    if (!selEquip) return;
    if (!WS.Inv || !WS.Inv.unequip) return;
    var r = WS.Inv.unequip(selEquip);
    if (!r.ok) {
      toast(r.reason || 'не удалось', 'warn');
      snd('error', 0.4);
    }
  }

  function actSplit() {
    if (selIdx < 0) return;
    if (!WS.Inv || !WS.Inv.split) return;
    var ni = WS.Inv.split(selIdx);
    if (ni >= 0) {
      selIdx = ni;
      snd('select', 0.3);
    }
  }

  function actRepair() {
    if (!WS.Inv || !WS.Inv.repair) return;
    var target = (selEquip !== null) ? selEquip : selIdx;
    var r = null;
    try { r = WS.Inv.repair(target); } catch (e) { r = null; }
    if (!r || !r.ok) {
      toast((r && r.reason) || 'не починить', 'warn');
      snd('error', 0.4);
    }
  }

  function actDrop() {
    if (selIdx < 0) return;
    if (!WS.Inv || !WS.Inv.drop) return;
    var n = WS.Inv.drop(selIdx);
    if (n <= 0) toast('Не вышло выбросить', 'warn');
    selIdx = -1;
  }

  function actToContainer() {
    if (selIdx < 0) return;
    if (WS.ContScreen && WS.ContScreen.put) {
      WS.ContScreen.put(selIdx);
    }
  }

  /** Панель сортировки. */
  function onToolbar(e) {
    var t = e.target;
    while (t && t !== this) {
      if (t.getAttribute && t.getAttribute('data-sort')) break;
      t = t.parentNode;
    }
    if (t && t !== this) {
      sortMode = t.getAttribute('data-sort') || 'cat';
      if (WS.Inv && WS.Inv.sort) WS.Inv.sort(sortMode);
      return;
    }
    var a = e.target;
    while (a && a !== this) {
      if (a.getAttribute && a.getAttribute('data-act')) break;
      a = a.parentNode;
    }
    if (a && a !== this) doAction(a.getAttribute('data-act'), null);
  }

  // ====================================================================
  //  ПАУЗА: открытие, настройки, выход
  // ====================================================================

  function openPause() {
    if (!gameRunning() || pauseOpen) return;
    // пауза — единственный экран: всё остальное закрыть
    closeInventory();
    craftClose();
    contClose();
    buildPause();
    if (!proot) return;
    pauseOpen = true;
    proot.classList.remove('hidden');
    WS.paused = true;                 // мир замер (см. Loop)
    renderPause();
    snd('click', 0.3);
  }

  function closePause() {
    if (!pauseOpen) return;
    pauseOpen = false;
    if (proot) proot.classList.add('hidden');
    WS.paused = false;
    WS.ToolTip.hide();
  }

  function togglePause() {
    if (pauseOpen) closePause();
    else openPause();
  }

  /** Обновить данные паузы: день/время, громкость, скорость. */
  function renderPause() {
    if (!pdom.info) return;
    var line = '';
    if (WS.Time) {
      line = 'День ' + (WS.Time.day ? WS.Time.day() : 1);
      if (WS.Time.fmt) line += ' · ' + WS.Time.fmt();
    }
    if (WS.G && WS.G.stats) {
      line += ' · Обыскано: ' + (WS.G.stats.containersLooted || 0);
    }
    pdom.info.textContent = line;

    // громкость
    var vol = 70;
    if (WS.Snd && WS.Snd.getVolume) vol = Math.round(WS.Snd.getVolume() * 100);
    if (pdom.vol) pdom.vol.value = String(vol);
    if (pdom.volV) pdom.volV.textContent = vol + '%';

    // скорость
    var spd = (WS.Loop && WS.Loop.speed) ? WS.Loop.speed : 1;
    var chips = pdom.box.querySelectorAll('.chip-speed');
    for (var i = 0; i < chips.length; i++) {
      var v = parseInt(chips[i].getAttribute('data-speed'), 10);
      chips[i].className = 'chip chip-speed' + (v === spd ? ' on' : '');
    }
  }

  function onPauseBtn(e) {
    var t = e.target;
    while (t && t.getAttribute && !t.getAttribute('data-pact')) t = t.parentNode;
    if (!t || !t.getAttribute) return;
    var act = t.getAttribute('data-pact');
    if (act === 'resume') closePause();
    else if (act === 'save') pauseSave();
    else if (act === 'settings') toggleSettings();
    else if (act === 'exit') exitToMenu();
  }

  function toggleSettings() {
    if (!pdom.settings) return;
    var hidden = pdom.settings.className.indexOf('hidden') >= 0;
    if (hidden) pdom.settings.classList.remove('hidden');
    else pdom.settings.classList.add('hidden');
    snd('click', 0.25);
  }

  function pauseSave() {
    if (WS.Save && WS.Save.save) {
      var ok = WS.Save.save();
      if (ok) toast('Игра сохранена', 'good');
      else toast('Сохранить не удалось', 'bad');
      snd(ok ? 'select' : 'error', 0.4);
    }
  }

  function onVolume(e) {
    var v = parseInt(e.target.value, 10);
    if (isNaN(v)) return;
    if (WS.Snd && WS.Snd.setVolume) WS.Snd.setVolume(v / 100);
    if (pdom.volV) pdom.volV.textContent = v + '%';
  }

  function onSpeed(e) {
    var t = e.target;
    while (t && t.getAttribute && !t.getAttribute('data-speed')) t = t.parentNode;
    if (!t || !t.getAttribute) return;
    var v = parseInt(t.getAttribute('data-speed'), 10);
    if (isNaN(v)) return;
    if (WS.Loop && WS.Loop.setSpeed) WS.Loop.setSpeed(v);
    renderPause();
    snd('click', 0.3);
  }

  /** Выход в главное меню (или перезагрузка, если меню ещё нет). */
  function exitToMenu() {
    if (WS.Save && WS.Save.save) WS.Save.save();
    closePause();
    if (WS.Ui && WS.Ui.showMenu) {
      try { WS.Ui.showMenu(); return; } catch (e) { /* ниже */ }
    }
    // модуля меню нет (агент D4 ещё не собран) — честно перезапускаем страницу:
    // сейв в localStorage, меню подхватит его, когда появится
    toast('Возврат в меню...', 'info');
    window.location.reload();
  }

  // ====================================================================
  //  ОТКРЫТИЕ / ЗАКРЫТИЕ ИНВЕНТАРЯ
  // ====================================================================

  function openInventory() {
    if (!gameRunning()) return;
    build();
    if (!root) return;
    if (open) return;
    open = true;
    root.classList.remove('hidden');
    render();
    snd('door', 0.25);
    try { WS.Ev.emit('ui:screen', { id: 'inventory', open: true }); } catch (e) { /* пусто */ }
  }

  function closeInventory() {
    if (!open) return;
    open = false;
    if (root) root.classList.add('hidden');
    WS.ToolTip.hide();
    try { WS.Ev.emit('ui:screen', { id: 'inventory', open: false }); } catch (e) { /* пусто */ }
  }

  function toggleInventory() {
    if (open) closeInventory();
    else openInventory();
  }

  // ====================================================================
  //  РОУТЕР КЛАВИШ D2 (I/Tab, C, Escape)
  //  Два пути, защищённые от двойного срабатывания:
  //   1) document keydown — работает всегда (даже когда WS.Ui.modal()
  //      отключил WS.Input, и когда тики не идут без WS.Ui);
  //   2) тик 80 — обычный путь хоткеев (задание D2), с проверкой меток.
  // ====================================================================

  function now() {
    return (window.performance && performance.now) ? performance.now() : Date.now();
  }

  function consumeKey(code) {
    keyConsumed[code] = now();
  }

  function consumedRecently(code) {
    var t = keyConsumed[code];
    if (!t) return false;
    return (now() - t) < 300;
  }

  /** Открыт ли хоть один экран D2 (мой или соседних файлов). */
  function anyOpenMine() {
    if (open || pauseOpen) return true;
    if (WS.CraftScreen && WS.CraftScreen.isOpen && WS.CraftScreen.isOpen()) return true;
    if (WS.ContScreen && WS.ContScreen.isOpen && WS.ContScreen.isOpen()) return true;
    return false;
  }

  /** Закрыть верхний экран D2 (порядок: инвентарь → крафт → контейнер → пауза). */
  function closeTopMine() {
    if (open) { closeInventory(); return; }
    if (WS.CraftScreen && WS.CraftScreen.isOpen && WS.CraftScreen.isOpen()) {
      WS.CraftScreen.close();
      return;
    }
    if (WS.ContScreen && WS.ContScreen.isOpen && WS.ContScreen.isOpen()) {
      WS.ContScreen.close();
      return;
    }
    if (pauseOpen) { closePause(); }
  }

  function craftToggle() {
    if (WS.CraftScreen && WS.CraftScreen.toggle) WS.CraftScreen.toggle();
  }

  function craftClose() {
    if (WS.CraftScreen && WS.CraftScreen.close) WS.CraftScreen.close();
  }

  function contClose() {
    if (WS.ContScreen && WS.ContScreen.close) WS.ContScreen.close();
  }

  /** Прямой обработчик клавиш (document keydown). */
  function onKey(e) {
    if (e.repeat) return;
    var tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    var code = e.code;
    if (!code) return;

    var mine = anyOpenMine();
    var modal = !!(WS.Ui && WS.Ui.modal && WS.Ui.modal());

    // --- мои экраны открыты: клавиши веду я ---
    if (mine) {
      if (code === 'KeyI' || code === 'Tab') {
        e.preventDefault();
        consumeKey(code);
        toggleInventory();
        return;
      }
      if (code === 'KeyC') {
        consumeKey(code);
        craftToggle();
        return;
      }
      if (code === 'Escape') {
        consumeKey(code);
        closeTopMine();
        return;
      }
      return;
    }

    // --- ничего моего не открыто: открыть можно только в игре
    //     и не поверх чужого модального экрана ---
    if (!gameRunning() || modal) return;
    if (code === 'KeyI' || code === 'Tab') {
      e.preventDefault();
      consumeKey(code);
      openInventory();
      return;
    }
    if (code === 'KeyC') {
      consumeKey(code);
      craftToggle();
      return;
    }
    if (code === 'Escape') {
      consumeKey(code);
      openPause();
    }
  }

  /** Тик 80: страховочные хоткеи + перепривязка WS.Ui. */
  function uiTick() {
    bindUi();
    if (!gameRunning()) return;
    if (!WS.Input || !WS.Input.hit) return;
    if (WS.Input.hit('inventory') &&
        !consumedRecently('KeyI') && !consumedRecently('Tab')) {
      toggleInventory();
    } else if (WS.Input.hit('craft') && !consumedRecently('KeyC')) {
      craftToggle();
    } else if (WS.Input.hit('pause') && !consumedRecently('Escape')) {
      togglePause();
    }
  }

  // ====================================================================
  //  ПРИВЯЗКА К WS.Ui (агент D4 может появиться позже — перепривязываем)
  //  looting.js зовёт WS.Ui.openContainer(o); хоткеи D4 могут звать
  //  openInventory/openCraft. Стабильные обёртки — одно назначение.
  // ====================================================================

  function uiOpenContainer(o) {
    if (WS.ContScreen && WS.ContScreen.open) WS.ContScreen.open(o);
  }

  function uiOpenInventory() { openInventory(); }
  function uiCloseInventory() { closeInventory(); }
  function uiToggleInventory() { toggleInventory(); }

  function uiOpenCraft() {
    if (WS.CraftScreen && WS.CraftScreen.open) WS.CraftScreen.open();
  }

  function uiTogglePause() { togglePause(); }

  function bindUi() {
    if (!WS.Ui) return;
    var U = WS.Ui;
    // точки входа (сравнение — чтобы не дёргать свойство без нужды)
    if (U.openContainer !== uiOpenContainer) U.openContainer = uiOpenContainer;
    if (U.openInventory !== uiOpenInventory) U.openInventory = uiOpenInventory;
    if (U.closeInventory !== uiCloseInventory) U.closeInventory = uiCloseInventory;
    if (U.toggleInventory !== uiToggleInventory) U.toggleInventory = uiToggleInventory;
    if (U.openCraft !== uiOpenCraft) U.openCraft = uiOpenCraft;
    if (U.togglePause !== uiTogglePause) U.togglePause = uiTogglePause;
    if (U.pauseMenu !== uiTogglePause) U.pauseMenu = uiTogglePause;

    // регистрация экранов (если D4 поддерживает реестр модальных окон)
    if (!uiBound && typeof U.register === 'function') {
      uiBound = true;
      try {
        U.register('inventory', { open: uiOpenInventory, close: uiCloseInventory });
        U.register('craft', {
          open: uiOpenCraft,
          close: function () { craftClose(); }
        });
        U.register('container', {
          open: uiOpenContainer,
          close: function () { contClose(); }
        });
        U.register('pause', { open: uiTogglePause, close: function () { closePause(); } });
        WS.log('invScreen: экраны D2 зарегистрированы в WS.Ui');
      } catch (e) {
        WS.warn('invScreen: WS.Ui.register не принял экраны:', e && e.message);
      }
    }
  }

  // ====================================================================
  //  СОБЫТИЯ
  // ====================================================================

  function onGameStart() {
    closeInventory();
    closePause();
    selIdx = -1;
    selEquip = null;
  }

  function bindEvents() {
    WS.Ev.on('inv:changed', scheduleRender);
    WS.Ev.on('equip:changed', scheduleRender);
    WS.Ev.on('game:start', onGameStart);
    WS.Ev.on('game:load', onGameStart);
    WS.Ev.on('player:die', function () {
      closeInventory();
      closePause();
    });
    // контейнер закрылся — обновить кнопку «В контейнер» в деталях
    WS.Ev.on('ui:screen', function (d) {
      if (d && d.id === 'container' && !d.open && open) render();
    });
  }

  // ====================================================================
  //  САМОТЕСТ (консоль разработчика: WS.InvScreen.selftest())
  // ====================================================================

  function selftest() {
    var out = [];
    var pass = 0, fail = 0;
    function ok(name, cond) {
      if (cond) { pass++; out.push('  ok   ' + name); }
      else { fail++; out.push('  FAIL ' + name); }
      return !!cond;
    }

    ok('модуль зарегистрирован', !!WS.InvScreen);
    ok('иконки категорий объявлены', !!(WS.Spr && WS.Spr.get && WS.Spr.get('icon_food') &&
                                        WS.Spr.get('icon_cloth') && WS.Spr.get('ui_rot')));
    ok('иконка даёт dataURL', WS.ToolTip && WS.ToolTip.iconUrl &&
       WS.ToolTip.iconUrl('icon_food').indexOf('data:image') === 0);
    ok('canEat по калориям', canEat({ cal: 100 }) === true);
    ok('canEat по тегу', canEat({ tags: ['edible'] }) === true);
    ok('canDrink по категории', canDrink({ cat: 'drink' }) === true);
    ok('handable нож', handable({ dmg: 8 }) === true);
    ok('handable тряпка', handable({ cat: 'material' }) === false);
    ok('пауза закрыта', pauseOpen === false);
    ok('инвентарь закрыт', open === false);
    ok('роутер клавиш установлен', typeof onKey === 'function');
    if (WS.G && WS.G.running && WS.Inv) {
      var s = WS.Inv.snapshot();
      ok('снимок инвентаря читается', s && typeof s.maxWeight === 'number');
    } else {
      out.push('  --   партии нет — DOM-проверки пропущены');
    }

    out.unshift('invScreen.selftest: ' + pass + ' ок, ' + fail + ' провалено');
    return out;
  }

  // ====================================================================
  //  ПУБЛИЧНЫЙ API
  // ====================================================================

  WS.def('InvScreen', {
    open: openInventory,
    close: closeInventory,
    toggle: toggleInventory,
    isOpen: function () { return open; },

    openPause: openPause,
    closePause: closePause,
    togglePause: togglePause,
    isPauseOpen: function () { return pauseOpen; },

    // внутреннее — для смежных экранов/отладки
    render: render,
    selftest: selftest
  });

  // ====================================================================
  //  BOOT
  // ====================================================================

  WS.boot(function initInvScreen() {
    // иконки категорий (до первого рендера, WS.Spr уже есть)
    defIcons();

    // DOM строим лениво при первом открытии (openInventory/build),
    // слушатели роутера — сразу: документ живёт с загрузки страницы
    document.addEventListener('keydown', onKey, false);

    // тик UI-зоны (80): хоткеи + перепривязка WS.Ui
    WS.tick(80, uiTick, 'ui:invscreen');

    // WS.Ui может объявиться позже (агент D4) — периодическая привязка
    uiTimer = setInterval(bindUi, 800);
    bindUi();

    bindEvents();

    WS.log('invScreen: окно инвентаря и пауза готовы (тик 80, клавиши I/Tab/C/Esc)');
  }, 'invscreen:init');

})();
