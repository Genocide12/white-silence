/**
 * craft_screen.js — ОКНО КРАФТА (модуль D2): категории слева, список
 * рецептов с поиском и фильтром «только доступные», выбранный рецепт —
 * ингредиенты (красным если не хватает), инструменты, станция (иконка),
 * время и навык с риском провала; кнопка «Создать» и полоса прогресса
 * работы (WS.Craft.progress, отмена). Здесь объявлены иконки станций
 * st_* (24x24). Связи: WS.Craft (карточки available/whyNot/craft),
 * WS.ToolTip (иконки и описания), css/panels.css, инвентарь (D2).
 */
(function () {
  'use strict';

  // ====================================================================
  //  НАСТРОЙКИ И КОНСТАНТЫ
  // ====================================================================

  /** Русские имена категорий рецептов (cat из data/recipes.js). */
  var CAT_RU = {
    survival: 'Выживание',
    cook: 'Готовка',
    carpentry: 'Столярка',
    tailor: 'Кройка',
    ammo: 'Боеприпасы',
    misc: 'Разное'
  };

  /** Порядок категорий в левой колонке. */
  var CAT_LIST = ['survival', 'cook', 'carpentry', 'tailor', 'ammo', 'misc'];

  /** Русские имена станций (дублируем WS.Craft.STATION_NAME на случай
   *  отсутствия модуля — иконки свои). */
  var STATION_RU = {
    fire: 'костёр',
    stove: 'печь',
    workbench: 'верстак',
    anvil: 'наковальня',
    forge: 'горн'
  };

  /** Имя спрайта иконки станции. */
  var STATION_SPR = {
    fire: 'st_fire',
    stove: 'st_stove',
    workbench: 'st_workbench',
    anvil: 'st_anvil',
    forge: 'st_forge'
  };

  /** Период опроса прогресса работы, мс. */
  var PROGRESS_MS = 250;

  // ====================================================================
  //  СОСТОЯНИЕ МОДУЛЯ
  // ====================================================================

  var open = false;          // окно открыто
  var curCat = 'survival';   // выбранная категория
  var search = '';           // поисковая строка
  var onlyAvail = false;    // фильтр «только доступные»
  var selId = null;          // id выбранного рецепта

  var root = null;           // .scr-craft
  var dom = {};              // ссылки на узлы

  var renderTimer = 0;      // отложенная перерисовка (inv:changed)
  var progressTimer = 0;    // опрос WS.Craft.progress()
  var wasCrafting = false;  // для отслеживания завершения работы

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

  /** Карточки рецептов (пустой массив, если модуля крафта нет). */
  function cards(cat, filter) {
    if (WS.Craft && WS.Craft.available) {
      try { return WS.Craft.available(cat, filter) || []; } catch (e) { return []; }
    }
    return [];
  }

  /** Одна карточка по id. */
  function cardOf(id) {
    if (!id) return null;
    if (WS.Craft && WS.Craft.availableOne) {
      try { return WS.Craft.availableOne(id); } catch (e) { return null; }
    }
    return null;
  }

  // ====================================================================
  //  ИКОНКИ СТАНЦИЙ (24x24, WS.Spr.def)
  // ====================================================================

  function defStationIcons() {
    var S = WS.Spr;
    if (!S || !S.def) return;

    // --- костёр: пламя над поленьями ---
    S.def('st_fire', { w: 24, h: 24, draw: function (c) {
      S.ell(c, 12, 11, 5, 8, '#e2924a');
      S.ell(c, 12, 13, 3, 6, '#f4b968');
      S.px(c, 10, 4, 2, 6, '#e2924a');
      S.px(c, 13, 3, 2, 5, '#f4b968');
      S.px(c, 4, 17, 16, 2, '#57422e');
      S.px(c, 3, 19, 18, 2, '#6b5138');
    }});

    // --- печь: буржуйка с топкой ---
    S.def('st_stove', { w: 24, h: 24, draw: function (c) {
      S.px(c, 10, 2, 4, 4, '#767a82');
      S.px(c, 5, 6, 14, 3, '#767a82');
      S.px(c, 5, 9, 14, 11, '#5f636b');
      S.px(c, 8, 12, 8, 5, '#e2924a');
      S.px(c, 9, 13, 6, 3, '#f4b968');
      S.px(c, 5, 20, 14, 2, '#4c5058');
    }});

    // --- верстак: столешница с инструментом ---
    S.def('st_workbench', { w: 24, h: 24, draw: function (c) {
      S.px(c, 3, 8, 18, 5, '#8a6d50');
      S.px(c, 3, 8, 18, 1, '#a89a7c');
      S.px(c, 4, 13, 3, 8, '#57422e');
      S.px(c, 17, 13, 3, 8, '#57422e');
      S.px(c, 6, 4, 6, 4, '#767a82');
      S.px(c, 14, 5, 5, 3, '#b9903f');
    }});

    // --- наковальня ---
    S.def('st_anvil', { w: 24, h: 24, draw: function (c) {
      S.px(c, 4, 8, 16, 4, '#5f636b');
      S.px(c, 4, 8, 16, 1, '#8b95a5');
      S.px(c, 2, 9, 3, 3, '#767a82');
      S.px(c, 9, 12, 6, 4, '#5f636b');
      S.px(c, 6, 16, 12, 3, '#4c5058');
      S.px(c, 6, 19, 12, 2, '#3c4048');
    }});

    // --- горн: кирпичный корпус с жерлом ---
    S.def('st_forge', { w: 24, h: 24, draw: function (c) {
      S.px(c, 10, 2, 4, 5, '#767a82');
      S.px(c, 8, 6, 8, 2, '#5f636b');
      S.px(c, 5, 8, 14, 11, '#7a4a3c');
      S.px(c, 5, 8, 14, 1, '#8d584a');
      S.px(c, 8, 11, 8, 5, '#e2924a');
      S.px(c, 9, 12, 6, 3, '#f4b968');
      S.px(c, 5, 19, 14, 2, '#6b4034');
    }});
  }

  /** Иконка станции (img) или пустышка. */
  function stationIconNode(station, cls) {
    var TT = WS.ToolTip;
    var name = STATION_SPR[station];
    if (!name || !TT || !TT.iconNode) return el('span', 'no-ico');
    return TT.iconNode(name, cls);
  }

  // ====================================================================
  //  ПОСТРОЕНИЕ DOM
  // ====================================================================

  function build() {
    if (root) return;
    var uiRoot = document.getElementById('ui-root');
    if (!uiRoot) return;

    root = el('div', 'scr scr-craft hidden');
    var back = el('div', 'scr-backdrop craft-backdrop');
    root.appendChild(back);

    var box = el('div', 'ws-panel craft-box');
    root.appendChild(box);

    // --- шапка: название + станции + закрыть ---
    var head = el('div', 'scr-head');
    head.appendChild(el('span', 'ws-title', 'Ремесло'));
    var stLine = el('span', 'scr-sub');
    stLine.id = 'craft-stations';
    head.appendChild(stLine);
    var closeBtn = el('button', 'scr-close');
    closeBtn.type = 'button';
    closeBtn.textContent = '×';
    closeBtn.title = 'Закрыть (C)';
    head.appendChild(closeBtn);
    box.appendChild(head);

    // --- три колонки ---
    var layout = el('div', 'craft-layout');
    box.appendChild(layout);

    // левая: категории
    var cats = el('div', 'craft-cats');
    cats.appendChild(el('div', 'pane-title', 'Разделы'));
    var catList = el('div', 'cat-list');
    cats.appendChild(catList);
    layout.appendChild(cats);

    // центр: поиск + список рецептов
    var mid = el('div', 'craft-mid');
    var toolbar = el('div', 'craft-toolbar');
    var searchWrap = el('label', 'craft-search');
    var si = el('input', 'craft-search-input');
    si.type = 'text';
    si.placeholder = 'Поиск рецепта...';
    si.id = 'craft-search';
    searchWrap.appendChild(si);
    toolbar.appendChild(searchWrap);
    var chkWrap = el('label', 'craft-chk');
    var ch = el('input');
    ch.type = 'checkbox';
    ch.id = 'craft-only';
    chkWrap.appendChild(ch);
    chkWrap.appendChild(el('span', '', 'Только доступные'));
    toolbar.appendChild(chkWrap);
    mid.appendChild(toolbar);

    var list = el('div', 'craft-list scroll-y');
    list.id = 'craft-list';
    mid.appendChild(list);
    layout.appendChild(mid);

    // правая: деталь рецепта
    var right = el('div', 'craft-right');
    right.appendChild(el('div', 'pane-title', 'Рецепт'));
    var det = el('div', 'recipe-detail scroll-y');
    det.id = 'craft-detail';
    right.appendChild(det);
    layout.appendChild(right);

    // --- подвал: прогресс работы ---
    var foot = el('div', 'craft-foot hidden');
    foot.id = 'craft-foot';
    var prog = el('div', 'progress');
    var fill = el('div', 'progress-fill');
    prog.appendChild(fill);
    var plabel = el('span', 'progress-label');
    prog.appendChild(plabel);
    foot.appendChild(prog);
    var cancel = el('button', 'ws-btn progress-cancel danger');
    cancel.type = 'button';
    cancel.textContent = 'Бросить';
    cancel.title = 'Отменить работу (ингредиенты уже в деле)';
    foot.appendChild(cancel);
    box.appendChild(foot);

    uiRoot.appendChild(root);

    dom = {
      back: back, box: box, stLine: stLine, closeBtn: closeBtn,
      catList: catList, search: si, only: ch, list: list, detail: det,
      foot: foot, fill: fill, plabel: plabel, cancel: cancel
    };

    // --- события ---
    back.addEventListener('click', close, false);
    closeBtn.addEventListener('click', close, false);
    catList.addEventListener('click', onCatClick, false);
    list.addEventListener('click', onListClick, false);
    list.addEventListener('dblclick', onListDbl, false);
    det.addEventListener('click', onDetailClick, false);
    cancel.addEventListener('click', onCancel, false);
    si.addEventListener('input', onSearch, false);
    ch.addEventListener('change', onOnlyAvail, false);
  }

  // ====================================================================
  //  РЕНДЕР
  // ====================================================================

  /** Отложенная перерисовка (инвентарь менялся). */
  function scheduleRender() {
    if (!open) return;
    if (renderTimer) clearTimeout(renderTimer);
    renderTimer = setTimeout(function () {
      renderTimer = 0;
      render();
    }, 120);
  }

  /** Полная перерисовка окна. */
  function render() {
    if (!open || !root) return;
    renderStations();
    renderCats();
    renderList();
    renderDetail();
    renderFoot();
  }

  /** Строка станций рядом (шапка). */
  function renderStations() {
    if (!dom.stLine) return;
    var rep = [];
    if (WS.Craft && WS.Craft.stationReport) {
      try { rep = WS.Craft.stationReport() || []; } catch (e) { rep = []; }
    }
    if (!rep.length) {
      dom.stLine.textContent = 'Станций рядом нет';
      return;
    }
    var parts = [];
    for (var i = 0; i < rep.length && i < 3; i++) {
      parts.push(rep[i].name + ' (' + rep[i].dist + ' м)');
    }
    dom.stLine.textContent = 'Рядом: ' + parts.join(', ');
  }

  /** Левая колонка: категории с числом доступных. */
  function renderCats() {
    if (!dom.catList) return;
    while (dom.catList.firstChild) dom.catList.removeChild(dom.catList.firstChild);

    for (var i = 0; i < CAT_LIST.length; i++) {
      var cat = CAT_LIST[i];
      var list = cards(cat, null);
      var avail = 0;
      for (var k = 0; k < list.length; k++) {
        if (list[k].can) avail++;
      }
      if (!list.length && cat !== curCat) continue;   // пустой раздел не показываем

      var b = el('button', 'cat-btn' + (cat === curCat ? ' on' : ''));
      b.type = 'button';
      b.setAttribute('data-cat', cat);
      b.appendChild(el('span', 'cat-name', CAT_RU[cat] || cat));
      var cnt = el('span', 'cat-cnt' + (avail ? ' has' : ''));
      cnt.textContent = avail + '/' + list.length;
      b.appendChild(cnt);
      dom.catList.appendChild(b);
    }
  }

  /** Центр: список рецептов. */
  function renderList() {
    if (!dom.list) return;
    var scroll = dom.list.scrollTop;
    var list = cards(curCat, search);
    if (onlyAvail) {
      var flt = [];
      for (var f = 0; f < list.length; f++) {
        if (list[f].can) flt.push(list[f]);
      }
      list = flt;
    }

    var frag = document.createDocumentFragment();
    if (!list.length) {
      var empty = el('div', 'grid-empty',
        search ? 'Ничего не найдено' : 'В разделе пусто');
      frag.appendChild(empty);
    }

    for (var i = 0; i < list.length; i++) {
      frag.appendChild(buildRecipeRow(list[i]));
    }

    while (dom.list.firstChild) dom.list.removeChild(dom.list.firstChild);
    dom.list.appendChild(frag);
    dom.list.scrollTop = scroll;

    // выбор мог «уехать» — отметить в списке
    if (selId) {
      var rows = dom.list.childNodes;
      for (var r = 0; r < rows.length; r++) {
        if (rows[r].getAttribute && rows[r].getAttribute('data-r') === selId) {
          rows[r].className += ' sel';
        }
      }
    }
  }

  /** Строка списка рецептов. */
  function buildRecipeRow(c) {
    var TT = WS.ToolTip;
    var row = el('div', 'recipe-row' + (c.can ? '' : ' unavail'));
    row.setAttribute('data-r', c.id);

    // иконка изделия
    var out0 = c.out && c.out.length ? c.out[0] : null;
    var def = out0 ? defOf(out0.id) : null;
    var ico = TT.catIconNode(def ? def.cat : 'misc', 'r-ico');
    row.appendChild(ico);

    // тело: имя + мета
    var body = el('div', 'r-body');
    var name = el('div', 'r-name');
    name.appendChild(el('span', '', c.name || c.id));
    if (c.isNew) name.appendChild(el('span', 'r-new', 'новое'));
    if (c.times > 0) {
      name.appendChild(el('span', 'r-times', '×' + c.times));
    }
    body.appendChild(name);

    var meta = el('div', 'r-meta');
    var metaBits = [];
    metaBits.push(c.time + ' с');
    if (c.station) metaBits.push(STATION_RU[c.station] || c.station);
    if (c.skill && c.skill.id) metaBits.push('навык ' + c.skill.lv);
    if (!c.can) metaBits.push('не хватает');
    meta.appendChild(el('span', '', metaBits.join(' · ')));
    body.appendChild(meta);
    row.appendChild(body);

    // тултип: краткое описание карточки
    if (TT.bind) {
      var lines = [];
      if (c.desc) lines.push(c.desc);
      lines.push('Время: ' + c.time + ' с');
      if (c.station) {
        lines.push((c.stationHere ? 'Станция есть рядом: ' : 'Нужна станция: ') +
                   (STATION_RU[c.station] || c.station));
      }
      if (c.failChance > 0) lines.push('Риск провала: ' + c.failChance + '%');
      TT.bind(row, TT.plainHtml(c.name || c.id, lines, c.can ? null : 'Недоступно'));
    }
    return row;
  }

  /** Правая колонка: деталь выбранного рецепта. */
  function renderDetail() {
    if (!dom.detail) return;
    var TT = WS.ToolTip;
    while (dom.detail.firstChild) dom.detail.removeChild(dom.detail.firstChild);

    var c = cardOf(selId);
    if (!c) {
      dom.detail.appendChild(el('div', 'd-empty', 'Выберите рецепт из списка'));
      return;
    }
    var wrap = el('div', 'd-main');

    // --- имя и описание ---
    wrap.appendChild(el('div', 'd-name', c.name || c.id));
    if (c.desc) wrap.appendChild(el('div', 'd-desc', c.desc));

    // --- результат ---
    var outBox = el('div', 'd-section');
    outBox.appendChild(el('div', 'd-sec-title', 'Результат'));
    for (var i = 0; i < c.out.length; i++) {
      var o = c.out[i];
      var row = el('div', 'ing-row');
      var def = defOf(o.id);
      row.appendChild(TT.catIconNode(def ? def.cat : 'misc', 'ing-ico'));
      row.appendChild(el('span', 'ing-name', o.name + (o.n > 1 ? ' ×' + o.n : '')));
      outBox.appendChild(row);
    }
    wrap.appendChild(outBox);

    // --- ингредиенты ---
    var ingBox = el('div', 'd-section');
    ingBox.appendChild(el('div', 'd-sec-title', 'Ингредиенты'));
    if (!c.req.length) ingBox.appendChild(el('div', 'd-row dim', 'Ничего не нужно'));
    for (var k = 0; k < c.req.length; k++) {
      var q = c.req[k];
      var missing = q.have < q.n;
      var r2 = el('div', 'ing-row' + (missing ? ' miss' : ''));
      var d2 = defOf(q.id);
      r2.appendChild(TT.catIconNode(d2 ? d2.cat : 'misc', 'ing-ico'));
      r2.appendChild(el('span', 'ing-name', q.name));
      var have = el('span', 'ing-have' + (missing ? ' miss' : ''));
      have.textContent = q.have + ' / ' + q.n;
      r2.appendChild(have);
      if (TT.bind) {
        TT.bind(r2, TT.itemHtml({ id: q.id, count: q.n }));
      }
      ingBox.appendChild(r2);
    }
    wrap.appendChild(ingBox);

    // --- инструменты ---
    if (c.tools && c.tools.length) {
      var toolBox = el('div', 'd-section');
      toolBox.appendChild(el('div', 'd-sec-title', 'Инструменты'));
      for (var t = 0; t < c.tools.length; t++) {
        var tid = c.tools[t];
        var has = c.toolsMissing && c.toolsMissing.indexOf(tid) >= 0;
        var tr = el('div', 'ing-row' + (has ? ' miss' : ''));
        var td = defOf(tid);
        tr.appendChild(TT.catIconNode(td ? td.cat : 'tool', 'ing-ico'));
        var nm = (WS.Inv && WS.Inv.nameOf) ? WS.Inv.nameOf(tid) : tid;
        tr.appendChild(el('span', 'ing-name', nm));
        tr.appendChild(el('span', 'ing-have' + (has ? ' miss' : ''),
          has ? 'нет' : 'есть'));
        if (TT.bind) TT.bind(tr, TT.itemHtml({ id: tid }));
        toolBox.appendChild(tr);
      }
      wrap.appendChild(toolBox);
    }

    // --- станция ---
    if (c.station) {
      var stBox = el('div', 'd-section');
      stBox.appendChild(el('div', 'd-sec-title', 'Станция'));
      var stRow = el('div', 'ing-row' + (c.stationHere ? '' : ' miss'));
      stRow.appendChild(stationIconNode(c.station, 'ing-ico'));
      stRow.appendChild(el('span', 'ing-name', STATION_RU[c.station] || c.station));
      stRow.appendChild(el('span', 'ing-have' + (c.stationHere ? '' : ' miss'),
        c.stationHere ? 'рядом' : 'нужна'));
      stBox.appendChild(stRow);
      wrap.appendChild(stBox);
    }

    // --- навык и риск ---
    if (c.skill && c.skill.id) {
      var skBox = el('div', 'd-section');
      skBox.appendChild(el('div', 'd-sec-title', 'Навык'));
      var skName = c.skillName || c.skill.id;
      var lv = 0;
      var p = WS.G && WS.G.player;
      if (p && p.skills && p.skills[c.skill.id]) lv = p.skills[c.skill.id].lv || 0;
      var skRow = el('div', 'ing-row' + (c.skillHere ? '' : ' risk'));
      skRow.appendChild(el('span', 'ing-name',
        skName + ' (у вас ' + lv + ', нужно ' + c.skill.lv + ')'));
      if (c.failChance > 0) {
        skRow.appendChild(el('span', 'ing-have miss',
          'риск провала ' + c.failChance + '%'));
      } else {
        skRow.appendChild(el('span', 'ing-have', 'хватает'));
      }
      skBox.appendChild(skRow);
      wrap.appendChild(skBox);
    }

    // --- время ---
    var tmBox = el('div', 'd-section');
    tmBox.appendChild(el('div', 'd-sec-title', 'Время работы'));
    tmBox.appendChild(el('div', 'd-row', c.time + ' секунд'));
    wrap.appendChild(tmBox);

    // --- кнопка «Создать» ---
    var btn = el('button', 'ws-btn d-btn primary craft-go');
    btn.type = 'button';
    btn.setAttribute('data-act', 'craft');
    var crafting = WS.Craft && WS.Craft.isCrafting && WS.Craft.isCrafting();
    if (!c.can) {
      btn.disabled = true;
      btn.textContent = 'Недоступно';
    } else if (crafting) {
      btn.disabled = true;
      btn.textContent = 'Руки заняты';
    } else {
      btn.textContent = 'Создать';
    }
    wrap.appendChild(btn);

    // почему нельзя (строки)
    if (!c.can && WS.Craft && WS.Craft.whyNot) {
      var why = [];
      try { why = WS.Craft.whyNot(c) || []; } catch (e) { why = []; }
      for (var w = 0; w < why.length; w++) {
        wrap.appendChild(el('div', 'd-row dim', why[w]));
      }
    }

    dom.detail.appendChild(wrap);
  }

  /** Подвал: прогресс работы. */
  function renderFoot() {
    if (!dom.foot) return;
    var crafting = WS.Craft && WS.Craft.isCrafting && WS.Craft.isCrafting();
    if (!crafting) {
      dom.foot.classList.add('hidden');
      wasCrafting = false;
      return;
    }
    dom.foot.classList.remove('hidden');
    wasCrafting = true;
    updateProgress();
  }

  /** Обновить только полосу прогресса (без пересборки DOM). */
  function updateProgress() {
    if (!dom.foot || dom.foot.className.indexOf('hidden') >= 0) return;
    var C = WS.Craft;
    if (!C || !C.isCrafting || !C.isCrafting()) {
      // работа закончилась — полный рендер (список доступности изменился)
      dom.foot.classList.add('hidden');
      if (wasCrafting) {
        wasCrafting = false;
        render();
      }
      return;
    }
    var pr = 0;
    var info = null;
    try { pr = C.progress() || 0; info = C.info(); } catch (e) { pr = 0; }
    dom.fill.style.width = Math.round(clamp(pr, 0, 1) * 100) + '%';
    dom.plabel.textContent = 'Изготовление: ' + (info ? info.name : '') +
      ' — ' + Math.round(pr * 100) + '%' +
      (info ? ' (' + info.t.toFixed(0) + ' / ' + info.dur + ' с)' : '');
  }

  // ====================================================================
  //  ОБРАБОТЧИКИ
  // ====================================================================

  function onCatClick(e) {
    var t = e.target;
    while (t && t !== dom.catList) {
      if (t.getAttribute && t.getAttribute('data-cat')) break;
      t = t.parentNode;
    }
    if (!t || t === dom.catList) return;
    curCat = t.getAttribute('data-cat') || 'survival';
    selId = null;
    snd('select', 0.25);
    render();
  }

  function onListClick(e) {
    var t = e.target;
    while (t && t !== dom.list) {
      if (t.getAttribute && t.getAttribute('data-r')) break;
      t = t.parentNode;
    }
    if (!t || t === dom.list) return;
    selId = t.getAttribute('data-r');
    snd('select', 0.25);
    renderDetail();
    // подсветить выбранную строку
    var rows = dom.list.childNodes;
    for (var i = 0; i < rows.length; i++) {
      if (!rows[i].className) continue;
      var on = rows[i].getAttribute && rows[i].getAttribute('data-r') === selId;
      rows[i].className = String(rows[i].className).replace(/\s*sel/g, '') +
        (on ? ' sel' : '');
    }
  }

  /** Двойной щелчок по рецепту — сразу делать. */
  function onListDbl(e) {
    onListClick(e);
    if (selId) doCraft(selId);
  }

  function onDetailClick(e) {
    var t = e.target;
    while (t && t !== dom.detail) {
      if (t.getAttribute && t.getAttribute('data-act')) break;
      t = t.parentNode;
    }
    if (!t || t === dom.detail) return;
    var act = t.getAttribute('data-act');
    if (act === 'craft' && selId) doCraft(selId);
  }

  function onCancel() {
    if (WS.Craft && WS.Craft.cancel) {
      WS.Craft.cancel();
      render();
    }
  }

  function onSearch(e) {
    search = e.target.value || '';
    renderList();
  }

  function onOnlyAvail(e) {
    onlyAvail = !!e.target.checked;
    renderList();
  }

  /** Запустить изготовление. */
  function doCraft(id) {
    var c = cardOf(id);
    if (!c) return;
    if (!c.can) {
      var why = [];
      if (WS.Craft && WS.Craft.whyNot) {
        try { why = WS.Craft.whyNot(c) || []; } catch (e) { why = []; }
      }
      toast(why.length ? why.join('; ') : 'Рецепт недоступен', 'warn');
      snd('error', 0.4);
      return;
    }
    if (!WS.Craft || !WS.Craft.craft) return;
    var r = null;
    try { r = WS.Craft.craft(id); } catch (e2) { r = { ok: false, reason: 'ошибка' }; }
    if (r && r.ok) {
      snd('craft', 0.35);
      render();
    }
  }

  // ====================================================================
  //  ОТКРЫТИЕ / ЗАКРЫТИЕ
  // ====================================================================

  function openScreen() {
    if (!gameRunning()) return;
    build();
    if (!root) return;
    if (open) return;
    // крафт — самостоятельный экран: инвентарь и контейнер убрать
    if (WS.InvScreen && WS.InvScreen.close) WS.InvScreen.close();
    if (WS.ContScreen && WS.ContScreen.close) WS.ContScreen.close();
    open = true;
    root.classList.remove('hidden');
    render();
    startProgressWatch();
    snd('door', 0.25);
    try { WS.Ev.emit('ui:screen', { id: 'craft', open: true }); } catch (e) { /* пусто */ }
  }

  function close() {
    if (!open) return;
    open = false;
    if (root) root.classList.add('hidden');
    stopProgressWatch();
    WS.ToolTip.hide();
    try { WS.Ev.emit('ui:screen', { id: 'craft', open: false }); } catch (e) { /* пусто */ }
  }

  function toggle() {
    if (open) close();
    else openScreen();
  }

  /** Периодический опрос прогресса (DOM-интервал: тики могут стоять
   *  на паузе модальных окон — а полоса должна жить). */
  function startProgressWatch() {
    stopProgressWatch();
    progressTimer = setInterval(updateProgress, PROGRESS_MS);
  }

  function stopProgressWatch() {
    if (progressTimer) {
      clearInterval(progressTimer);
      progressTimer = 0;
    }
  }

  // ====================================================================
  //  СОБЫТИЯ
  // ====================================================================

  function bindEvents() {
    // инвентарь изменился — доступность рецептов тоже
    WS.Ev.on('inv:changed', scheduleRender);
    WS.Ev.on('equip:changed', scheduleRender);
    WS.Ev.on('item:crafted', scheduleRender);
    WS.Ev.on('game:start', function () {
      close();
      selId = null;
      search = '';
      onlyAvail = false;
    });
    WS.Ev.on('game:load', function () {
      close();
    });
    WS.Ev.on('player:die', close);
  }

  // ====================================================================
  //  САМОТЕСТ (консоль разработчика: WS.CraftScreen.selftest())
  // ====================================================================

  function selftest() {
    var out = [];
    var pass = 0, fail = 0;
    function ok(name, cond) {
      if (cond) { pass++; out.push('  ok   ' + name); }
      else { fail++; out.push('  FAIL ' + name); }
      return !!cond;
    }

    ok('модуль зарегистрирован', !!WS.CraftScreen);
    ok('иконки станций объявлены', !!(WS.Spr && WS.Spr.get && WS.Spr.get('st_fire') &&
                                       WS.Spr.get('st_workbench') && WS.Spr.get('st_forge')));
    ok('категории русские', CAT_RU.survival === 'Выживание' && CAT_RU.ammo === 'Боеприпасы');
    ok('окно закрыто', open === false);
    ok('прогресс-интервал остановлен', progressTimer === 0);

    if (WS.Craft) {
      var list = cards('survival', null);
      ok('карточки выживания читаются', list.length >= 0);
      var one = cardOf(list.length ? list[0].id : null);
      ok('карточка по id читается', !!one || !list.length);
      var why = [];
      if (one && WS.Craft.whyNot) {
        try { why = WS.Craft.whyNot(one); } catch (e) { why = []; }
      }
      ok('whyNot возвращает строки', typeof why.length === 'number');
    } else {
      out.push('  --   WS.Craft не загружен — карточки пропущены');
    }

    out.unshift('craftScreen.selftest: ' + pass + ' ок, ' + fail + ' провалено');
    return out;
  }

  // ====================================================================
  //  ПУБЛИЧНЫЙ API
  // ====================================================================

  WS.def('CraftScreen', {
    open: openScreen,
    close: close,
    toggle: toggle,
    isOpen: function () { return open; },

    // выбранное состояние (для смежных экранов/отладки)
    selected: function () { return selId; },
    category: function () { return curCat; },
    setCategory: function (cat) {
      if (CAT_LIST.indexOf(cat) >= 0) { curCat = cat; if (open) render(); }
    },

    render: render,
    selftest: selftest
  });

  // ====================================================================
  //  BOOT
  // ====================================================================

  WS.boot(function initCraftScreen() {
    defStationIcons();
    bindEvents();
    WS.log('craftScreen: окно крафта готово (клавиша C, тултипы рецептов)');
  }, 'craftscreen:init');

})();
