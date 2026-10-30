/**
 * dialog.js — ДВИЖОК NPC-ДИАЛОГОВ «Белого Безмолвия» (модуль F2).
 * Модальное окно разговора: портрет (крупный canvas-спрайт), имя, текст,
 * печатающийся посимвольно со звуком пера, варианты-ответы списком кнопок.
 * Дерево диалога: {start, nodes: {id: {text, options: [{txt, next, cond, action}]}}}.
 * ESC закрывает; пока окно открыто — мир на паузе (WS.Ui.modal, класс .ws-modal).
 * Репутация WS.G.story.rep = {hermit: 0}: Dialog.rep/repAdd — узлы с cond
 * по доверию. История тем: WS.G.story.dialogSeen.
 * Связи: ui/ui.js (register/open/close — Esc и стек), content/notes.js
 * (стиль листа), ai/hermit.js (главный пользователь), content/quests.js.
 */
(function () {
  'use strict';

  // ====================================================================
  //  НАСТРОЙКИ
  // ====================================================================

  var TYPE_MS = 16;        // мс на букву (посимвольная печать)
  var SND_EVERY = 3;       // звук пера — раз в N букв
  var SND_VOL = 0.12;       // тихое «тыканье» пера
  var MAX_OPTS = 9;        // кнопок-ответов не больше девяти (клавиши 1..9)
  var PORCH_W = 156;       // окно портрета, px
  var PORCH_H = 212;

  // ====================================================================
  //  БЫСТРЫЕ УТИЛИТЫ (свои — контракт запрещает полагаться на соседей
  //  на этапе загрузки, а внутри тика дёшево продублировать)
  // ====================================================================

  function G() { return WS.G; }
  function P() { var g = WS.G; return (g && g.player) ? g.player : null; }

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  function el(tag, cls, parent) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (parent) parent.appendChild(e);
    return e;
  }

  function snd(name, vol) {
    try {
      if (WS.Snd && WS.Snd.play) WS.Snd.play(name, { vol: vol === undefined ? 0.6 : vol });
    } catch (e) { /* тишина — не беда */ }
  }

  function toast(text, kind) {
    if (!text) return;
    if (WS.Ui && WS.Ui.toast) {
      try { WS.Ui.toast(text, kind || 'info'); return; } catch (e) { /* ниже */ }
    }
    try { WS.Ev.emit('ui:toast', { text: text, kind: kind || 'info' }); } catch (e2) { /* пусто */ }
  }

  /** Перевод с литеральным запасом (как в соседних модулях). */
  function T(key, fb) {
    if (WS.I18N && WS.I18N.t) {
      try { return WS.I18N.t(key, fb); } catch (e) { /* словарь не готов */ }
    }
    return (typeof fb === 'string') ? fb : key;
  }

  /** Доступ к сюжетному хранилищу с гарантированными полями. */
  function F() {
    var g = WS.G;
    var s = g && g.story;
    if (!s) {
      if (!g) return null;
      s = g.story = { notes: [], radio: [], flags: {}, hints: {} };
    }
    if (!s.flags) s.flags = {};
    if (!s.rep) s.rep = {};
    if (!s.dialogSeen) s.dialogSeen = {};
    return s;
  }

  // ====================================================================
  //  СОСТОЯНИЕ ОКНА
  // ====================================================================

  var dom = {
    root: null,      // .ws-dialog — корень экрана
    frame: null,     // .d-frame
    name: null,      // .d-name
    rep: null,       // .d-rep — строка доверия
    canvas: null,    // портрет
    cap: null,       // подпись под портретом
    text: null,      // .d-text — печатаемый текст
    opts: null,      // .d-opts — кнопки
    foot: null
  };

  var st = {
    open: false,
    npc: null,        // {name, sprName, sprFrame?, portraitFrame?, repId?, cap?}
    tree: null,       // текущее дерево
    node: null,       // текущий узел (объект)
    nodeId: null,
    full: '',         // полный текст узла
    pos: 0,           // сколько букв напечатано
    timer: null,      // setInterval печати
    sndAcc: 0,        // счётчик букв для звука
    optEls: [],      // живые кнопки
    portraitT: 0,     // лёгкое «дыхание» портрета
    portraitF: 0     // текущий кадр портрета
  };

  // ====================================================================
  //  CSS: панель разговора в общем стиле (PT Serif, тёмное дерево)
  // ====================================================================

  var CSS =
    '.ws-dialog {' +
      'position: fixed; left: 0; top: 0; width: 100%; height: 100%;' +
      'z-index: 170; display: flex; align-items: center; justify-content: center;' +
      'background: rgba(4, 6, 10, 0.66); animation: screen-in 0.18s ease-out both;' +
    '}' +
    '.ws-dialog.hidden { display: none; }' +
    '.ws-dialog .d-frame {' +
      'display: flex; flex-direction: column; width: 760px; max-width: 95vw;' +
      'max-height: 92vh; padding: 0; overflow: hidden;' +
      'background: linear-gradient(180deg, rgba(22, 30, 43, 0.98), rgba(13, 18, 27, 0.98));' +
      'border: 1px solid var(--line, #2c3a4e); border-radius: 4px;' +
      'box-shadow: 0 22px 70px rgba(0, 0, 0, 0.75);' +
      'animation: d-rise 0.22s cubic-bezier(0.2, 0.9, 0.3, 1.15) both;' +
    '}' +
    '@keyframes d-rise {' +
      'from { opacity: 0; transform: translateY(-10px) scale(0.97); }' +
      'to   { opacity: 1; transform: translateY(0) scale(1); }' +
    '}' +
    '.ws-dialog .d-head {' +
      'display: flex; align-items: baseline; gap: 12px;' +
      'padding: 12px 16px 10px; border-bottom: 1px solid rgba(60, 76, 100, 0.35);' +
    '}' +
    '.ws-dialog .d-name {' +
      "font-family: 'PT Serif', Georgia, serif; font-size: 19px; color: #d8cfb8;" +
      'letter-spacing: 0.04em;' +
    '}' +
    '.ws-dialog .d-rep {' +
      "font-family: 'PT Serif', Georgia, serif; font-size: 12px; color: #8fa06e;" +
      'letter-spacing: 0.06em; margin-left: auto; white-space: nowrap;' +
    '}' +
    '.ws-dialog .d-close {' +
      'width: 24px; height: 24px; padding: 0; border: 1px solid #5a4a33;' +
      'border-radius: 50%; background: transparent; color: #8a7a5a;' +
      'font-size: 11px; line-height: 1; cursor: pointer; flex: 0 0 auto;' +
    '}' +
    '.ws-dialog .d-close:hover { background: rgba(120, 96, 60, 0.18); color: #d8c9a0; }' +
    '.ws-dialog .d-main { display: flex; gap: 0; min-height: 0; }' +
    '.ws-dialog .d-portrait {' +
      'flex: 0 0 ' + PORCH_W + 'px; display: flex; flex-direction: column;' +
      'align-items: center; padding: 14px 12px 10px;' +
      'background: linear-gradient(180deg, rgba(12, 17, 26, 0.6), rgba(9, 12, 18, 0.2));' +
      'border-right: 1px solid rgba(60, 76, 100, 0.3);' +
    '}' +
    '.ws-dialog .d-portrait canvas {' +
      'image-rendering: pixelated; border: 1px solid #3a4658; border-radius: 3px;' +
      'background: radial-gradient(ellipse at 50% 70%, #1c2534 0%, #0d121b 80%);' +
      'box-shadow: inset 0 0 24px rgba(0, 0, 0, 0.6);' +
    '}' +
    '.ws-dialog .d-cap {' +
      "font-family: 'PT Serif', Georgia, serif; font-size: 11px; color: #77839a;" +
      'text-align: center; margin-top: 8px; letter-spacing: 0.05em;' +
      'line-height: 1.35; max-width: ' + (PORCH_W - 10) + 'px;' +
    '}' +
    '.ws-dialog .d-right { flex: 1 1 auto; display: flex; flex-direction: column; min-width: 0; }' +
    '.ws-dialog .d-text {' +
      "font-family: 'PT Serif', Georgia, serif; font-size: 16.5px; line-height: 1.62;" +
      'color: #cfd6e0; padding: 18px 20px 12px; white-space: pre-line;' +
      'overflow-y: auto; max-height: 40vh; min-height: 96px;' +
      'text-shadow: 0 1px 0 rgba(0, 0, 0, 0.5);' +
    '}' +
    '.ws-dialog .d-text.d-done { color: #dfe4ec; }' +
    '.ws-dialog .d-opts {' +
      'display: flex; flex-direction: column; gap: 6px; padding: 8px 16px 14px;' +
      'overflow-y: auto;' +
    '}' +
    '.ws-dialog .d-opt {' +
      'display: flex; align-items: center; gap: 10px; text-align: left;' +
      'width: 100%; padding: 7px 12px; min-height: 34px;' +
      'background: linear-gradient(180deg, rgba(30, 40, 56, 0.6), rgba(20, 27, 38, 0.6));' +
      'border: 1px solid #3a4a62; border-radius: 3px;' +
      "font-family: 'PT Serif', Georgia, serif; font-size: 14.5px; color: #b9c3d4;" +
      'cursor: pointer; transition: background 0.12s, border-color 0.12s;' +
    '}' +
    '.ws-dialog .d-opt:hover:not(:disabled) {' +
      'background: linear-gradient(180deg, #2d3f5a, #212d42); border-color: #4a6285; color: #e2e8f2;' +
    '}' +
    '.ws-dialog .d-opt:disabled { opacity: 0.5; cursor: default; }' +
    '.ws-dialog .d-opt .d-num {' +
      'flex: 0 0 auto; font-size: 11px; color: #67789a; width: 14px;' +
      'text-align: center; letter-spacing: 0;' +
    '}' +
    '.ws-dialog .d-opt .d-note {' +
      'margin-left: auto; font-size: 11.5px; color: #8b95a5; white-space: nowrap;' +
    '}' +
    '.ws-dialog .d-opt.d-primary { border-color: #7c5f2e; }' +
    '.ws-dialog .d-opt.d-primary .d-num { color: #a98b4c; }' +
    '.ws-dialog .d-opt.d-end .d-num { color: #6a7a8a; }' +
    '.ws-dialog .d-foot {' +
      'padding: 8px 16px; border-top: 1px solid rgba(60, 76, 100, 0.3);' +
      "font-family: 'PT Serif', Georgia, serif; font-size: 11.5px; color: #67788f;" +
      'letter-spacing: 0.04em;' +
    '}' +
    '.ws-dialog .d-foot b { color: #9aa8bd; font-weight: normal; }' +
    '@media (max-width: 700px) {' +
      '.ws-dialog .d-frame { width: 96vw; }' +
      '.ws-dialog .d-main { flex-direction: column; }' +
      '.ws-dialog .d-portrait { flex-direction: row; border-right: none;' +
        'border-bottom: 1px solid rgba(60, 76, 100, 0.3); }' +
      '.ws-dialog .d-portrait canvas { width: 96px; height: auto; }' +
    '}';

  // ====================================================================
  //  DOM: построение один раз, лениво
  // ====================================================================

  function ensureDom() {
    if (dom.root) return true;
    var uiRoot = document.getElementById('ui-root');
    if (!uiRoot) {
      WS.warn('dialog: нет #ui-root — разговоры недоступны');
      return false;
    }
    try {
      var style = document.getElementById('ws-dialog-style');
      if (!style) {
        style = document.createElement('style');
        style.id = 'ws-dialog-style';
        style.textContent = CSS;
        document.head.appendChild(style);
      }

      var root = document.createElement('div');
      root.className = 'ws-dialog ws-modal hidden';
      root.id = 'ws-dialog';
      root.innerHTML =
        '<div class="d-frame ws-panel">' +
          '<div class="d-head">' +
            '<span class="d-name" id="ws-dlg-name"></span>' +
            '<span class="d-rep" id="ws-dlg-rep"></span>' +
            '<button class="d-close" title="Закрыть (Esc)">&#10005;</button>' +
          '</div>' +
          '<div class="d-main">' +
            '<div class="d-portrait">' +
              '<canvas id="ws-dlg-face" width="' + PORCH_W + '" height="' + PORCH_H + '"></canvas>' +
              '<div class="d-cap" id="ws-dlg-cap"></div>' +
            '</div>' +
            '<div class="d-right">' +
              '<div class="d-text" id="ws-dlg-text"></div>' +
              '<div class="d-opts" id="ws-dlg-opts"></div>' +
            '</div>' +
          '</div>' +
          '<div class="d-foot" id="ws-dlg-foot">' +
            '<b>Esc</b> — уйти · <b>клик по тексту</b> — дописать · <b>1–9</b> — ответ' +
          '</div>' +
        '</div>';
      uiRoot.appendChild(root);

      dom.root = root;
      dom.frame = root.querySelector('.d-frame');
      dom.name = root.querySelector('#ws-dlg-name');
      dom.rep = root.querySelector('#ws-dlg-rep');
      dom.canvas = root.querySelector('#ws-dlg-face');
      dom.cap = root.querySelector('#ws-dlg-cap');
      dom.text = root.querySelector('#ws-dlg-text');
      dom.opts = root.querySelector('#ws-dlg-opts');
      dom.foot = root.querySelector('#ws-dlg-foot');

      // закрытие: крестик и клик по затемнению
      root.querySelector('.d-close').addEventListener('click', function () {
        snd('click', 0.4);
        closeDialog();
      }, false);
      root.addEventListener('click', function (e) {
        if (e.target === root) closeDialog();
      }, false);

      // клик по тексту — дописать мгновенно
      dom.text.addEventListener('click', function () {
        skipTyping();
      }, false);

      return true;
    } catch (e) {
      WS.err('dialog: DOM не собрался:', e && e.message);
      dom.root = null;
      return false;
    }
  }

  // ====================================================================
  //  ПОРТРЕТ: крупный спрайт NPC в рамке
  // ====================================================================

  /** Нарисовать портрет: спрайт npc крупно, с «дыханием» кадра. */
  function drawPortrait() {
    if (!dom.canvas || !st.npc) return;
    var c = dom.canvas.getContext('2d');
    if (!c) return;
    c.clearRect(0, 0, PORCH_W, PORCH_H);
    var sprName = st.npc.sprName;
    if (!sprName || !WS.Spr || !WS.Spr.get) {
      // запасной силуэт: силуэт человека в капюшоне
      c.fillStyle = '#20293a';
      c.beginPath();
      c.ellipse(PORCH_W / 2, 128, 44, 60, 0, 0, Math.PI * 2);
      c.fill();
      return;
    }
    var frame = st.portraitF;
    var img = WS.Spr.get(sprName, frame, 4);   // в лицо — самое выразительное
    if (!img) img = WS.Spr.get(sprName, 0, 0);
    if (!img) return;
    // масштаб: вписать с запасом, пиксели — квадратные
    var zoom = Math.min((PORCH_W - 26) / img.width, (PORCH_H - 26) / img.height);
    var w = Math.round(img.width * zoom);
    var h = Math.round(img.height * zoom);
    var x = Math.round((PORCH_W - w) / 2);
    var y = Math.round(PORCH_H - h - 14);   // стоит «на полу» рамки
    c.imageSmoothingEnabled = false;
    try { c.drawImage(img, x, y, w, h); } catch (e) { /* пусто */ }
    // мягкая тень под ногами
    c.fillStyle = 'rgba(0, 0, 0, 0.35)';
    c.beginPath();
    c.ellipse(PORCH_W / 2, PORCH_H - 12, w * 0.32, 7, 0, 0, Math.PI * 2);
    c.fill();
  }

  /** «Дыхание» портрета: раз в ~900 мс чередуем кадр спрайта. */
  function portraitTick() {
    if (!st.open) return;
    st.portraitT += TYPE_MS;
    if (st.portraitT < 900) return;
    st.portraitT = 0;
    var f = (st.npc && st.npc.portraitFrames) || [0, 2];
    var i = f.indexOf(st.portraitF);
    st.portraitF = f[(i + 1) % f.length];
    drawPortrait();
  }

  // ====================================================================
  //  ПЕЧАТНАЯ МАШИНКА
  // ====================================================================

  /** Остановить печать (интервал). */
  function stopTyping() {
    if (st.timer) {
      clearInterval(st.timer);
      st.timer = null;
    }
  }

  /** Дописать текст мгновенно. */
  function skipTyping() {
    if (!st.open || st.pos >= st.full.length) return;
    st.pos = st.full.length;
    renderText();
    onTyped();
  }

  /** Один шаг печати: пара букв за интервал. */
  function typeStep() {
    if (!st.open) { stopTyping(); return; }
    if (st.pos >= st.full.length) {
      stopTyping();
      onTyped();
      return;
    }
    // буквы печатаются пачкой по две — живее, чем по одной
    var add = (st.full.charAt(st.pos) === '\n') ? 1 : 2;
    st.pos = Math.min(st.full.length, st.pos + add);
    st.sndAcc += add;
    if (st.sndAcc >= SND_EVERY) {
      st.sndAcc = 0;
      snd('click', SND_VOL);
    }
    renderText();
    // автоскролл текста
    if (dom.text.scrollHeight > dom.text.clientHeight) {
      dom.text.scrollTop = dom.text.scrollHeight;
    }
  }

  /** Отрисовать напечатанную часть текста. */
  function renderText() {
    if (!dom.text) return;
    dom.text.textContent = st.full.slice(0, st.pos);
    dom.text.classList.toggle('d-done', st.pos >= st.full.length);
  }

  /** Текст допечатан — показать варианты ответа. */
  function onTyped() {
    if (!st.open || !st.node) return;
    renderText();
    renderOptions();
  }

  // ====================================================================
  //  УЗЛЫ: контекст и переходы
  // ====================================================================

  /** Контекст узла: всё, что могут попросить txt/cond/action/next. */
  function ctx() {
    return {
      npc: st.npc,
      tree: st.tree,
      node: st.node,
      nodeId: st.nodeId,
      D: Dialog,          // публичный API движка
      player: P(),
      day: (WS.Time && WS.Time.day) ? WS.Time.day() : 1,
      hour: (WS.Time && WS.Time.hour) ? WS.Time.hour() : 8
    };
  }

  /** Развернуть поле-функцию или строку в значение. */
  function resolve(v, c) {
    if (typeof v === 'function') {
      try { return v(c); } catch (e) {
        WS.err('dialog: поле-функция упала:', e && e.message);
        return null;
      }
    }
    return v;
  }

  /** Безопасный вызов условия. false на любой беде. */
  function checkCond(fn, c) {
    if (typeof fn !== 'function') return true;
    try { return !!fn(c); } catch (e) {
      WS.err('dialog: cond упал:', e && e.message);
      return false;
    }
  }

  /** Найти узел дерева по id (с мягкой диагностикой). */
  function nodeOf(tree, id) {
    if (!tree || !tree.nodes) return null;
    var n = tree.nodes[id];
    if (!n) {
      WS.warn('dialog: узла "' + id + '" нет в дереве');
      return null;
    }
    return n;
  }

  /**
   * Показать узел: остановить старую печать, посчитать текст, запустить
   * новую. Узел без options и без next — последний (закроется сам).
   */
  function showNode(id) {
    if (!st.open || !st.tree) return;
    var n = nodeOf(st.tree, id);
    if (!n) { closeDialog(); return; }
    st.node = n;
    st.nodeId = id;
    markSeen(st.npc, id);

    // текст узла (может быть функцией — динамическая реплика)
    var c = ctx();
    var txt = resolve(n.text, c);
    st.full = (txt == null) ? '' : String(txt);
    st.pos = 0;
    st.sndAcc = 0;

    // вход в узел: побочный эффект (дать предмет, поднять флаг...)
    if (typeof n.onEnter === 'function') {
      try { n.onEnter(c); } catch (e) { WS.err('dialog: onEnter:', e && e.message); }
    }

    // имя/портрет узла могут переопределять_npc-шные
    var nm = resolve(n.name, c);
    if (nm && dom.name) dom.name.textContent = String(nm);
    else if (dom.name && st.npc) dom.name.textContent = st.npc.name || '';
    var cap = resolve(n.cap, c);
    if (dom.cap) dom.cap.textContent = (cap != null) ? String(cap) :
      ((st.npc && st.npc.cap) ? st.npc.cap : '');

    updateRepLabel();
    drawPortrait();

    // чистим кнопки, запускаем печать
    if (dom.opts) dom.opts.innerHTML = '';
    st.optEls = [];
    renderText();
    stopTyping();
    if (st.full.length) {
      st.timer = setInterval(typeStep, TYPE_MS);
    } else {
      onTyped();
    }
    snd('select', 0.25);
  }

  // ====================================================================
  //  ВАРИАНТЫ ОТВЕТА
  // ====================================================================

  /**
   * Нарисовать кнопки-ответы. cond скрывает вариант; note (строка) к
   * скрытому варианту позволяет показать его «серым» с причиной.
   * Порядок как в дереве; не больше MAX_OPTS.
   */
  function renderOptions() {
    if (!dom.opts || !st.node) return;
    dom.opts.innerHTML = '';
    st.optEls = [];
    var opts = st.node.options;
    if (!opts || !opts.length) {
      // узел-монолог без продолжения: единственная кнопка «Уйти»
      addOpt({
        txt: T('ui.dialog.leave', 'Уйти'),
        end: true,
        primary: true
      }, -1);
      return;
    }
    var c = ctx();
    var shown = 0;
    for (var i = 0; i < opts.length && shown < MAX_OPTS; i++) {
      var o = opts[i];
      if (!o) continue;
      var ok = checkCond(o.cond, c);
      var usedUp = isUsed(o);
      if (!ok && !o.note) continue;       // скрытый без подсказки — мимо
      if (usedUp && o.once) continue;     // одноразовый уже потрачен
      addOpt(o, ok ? shown : -1, !ok, usedUp);
      if (ok) shown++;
    }
    // не осталось живых вариантов — кнопка закрытия
    if (!shown && !st.optEls.length) {
      addOpt({ txt: T('ui.dialog.leave', 'Уйти'), end: true, primary: true }, -1);
    }
    // фокус на первую кнопку — клавиатура сразу в деле
    if (st.optEls.length && st.optEls[0].focus) {
      try { st.optEls[0].focus(); } catch (e) { /* пусто */ }
    }
  }

  /** Создать одну кнопку-ответ. */
  function addOpt(o, num, disabled, usedUp) {
    var c = ctx();
    var b = el('button', 'd-opt' + (o.primary ? ' d-primary' : '') + (o.end ? ' d-end' : ''), dom.opts);
    b.type = 'button';
    var numEl = el('span', 'd-num', b);
    numEl.textContent = (num >= 0) ? String(num + 1) : '·';
    var txt = resolve(o.txt, c);
    var label = el('span', 'd-txt', b);
    label.textContent = String(txt == null ? '…' : txt);
    if (o.note) {
      var nt = el('span', 'd-note', b);
      nt.textContent = String(o.note);
    }
    if (disabled) {
      b.disabled = true;
      return;
    }
    b.addEventListener('click', function () {
      snd('select', 0.45);
      choose(o);
    }, false);
    st.optEls.push(b);
  }

  /** Выбор варианта: действие, затем переход (action может вернуть id). */
  function choose(o) {
    if (!st.open) return;
    if (o.once) markUsed(o);
    var c = ctx();
    var jump = null;
    if (typeof o.action === 'function') {
      try { jump = o.action(c); } catch (e) {
        WS.err('dialog: action упал:', e && e.message);
      }
    }
    if (o.end) {
      closeDialog();
      return;
    }
    // action закрыл нас сам (например, открыл другой экран) — смириться
    if (!st.open) return;
    var next = (jump != null) ? jump : resolve(o.next, c);
    if (next == null || typeof next === 'undefined') {
      // продолжения нет — закрыть
      closeDialog();
      return;
    }
    if (typeof next === 'string') {
      showNode(next);
      return;
    }
    closeDialog();
  }

  // ====================================================================
  //  ИСТОРИЯ ТЕМ И ОДНОРАЗОВЫЕ ВАРИАНТЫ
  // ====================================================================

  /** Отметить узел показанным (WS.G.story.dialogSeen). */
  function markSeen(npc, nodeId) {
    var s = F();
    if (!s || !npc || !npc.repId || !nodeId) return;
    var d = s.dialogSeen;
    if (!d[npc.repId]) d[npc.repId] = {};
    d[npc.repId][nodeId] = 1;
  }

  /** Видел ли игрок узел у этого NPC. */
  function wasSeen(npc, nodeId) {
    var s = F();
    if (!s || !npc || !npc.repId) return false;
    var d = s.dialogSeen[npc.repId];
    return !!(d && d[nodeId]);
  }

  /** Ключ одноразовости варианта. */
  function optKey(o) {
    var c = ctx();
    return String(st.npc && st.npc.repId ? st.npc.repId : 'npc') + '|' +
           String(st.nodeId || '?') + '|' +
           String(resolve(o.key, c) || (resolve(o.txt, c) || '') + '');
  }

  /** Одноразовый вариант уже использован? */
  function isUsed(o) {
    var s = F();
    if (!s || !o || !o.once) return false;
    var d = s.dialogUsed;
    return !!d[optKey(o)];
  }

  /** Пометить одноразовый вариант использованным. */
  function markUsed(o) {
    var s = F();
    if (!s) return;
    if (!s.dialogUsed) s.dialogUsed = {};
    s.dialogUsed[optKey(o)] = 1;
  }

  // ====================================================================
  //  РЕПУТАЦИЯ: WS.G.story.rep = {hermit: 0}
  // ====================================================================

  /** Текущая репутация npcId (0, если мира нет). */
  function rep(id) {
    var s = F();
    return (s && s.rep && typeof s.rep[id] === 'number') ? s.rep[id] : 0;
  }

  /**
   * Изменить репутацию. n может быть отрицательным (обида).
   * why — короткое объяснение для тоста (необязательно).
   */
  function repAdd(id, n, why) {
    var s = F();
    if (!s || !n) return rep(id);
    var was = rep(id);
    s.rep[id] = clamp(was + n, -10, 20);
    var d = s.rep[id] - was;
    if (d === 0) return was;
    var names = {
      hermit: 'Аким'
      // будущие NPC добавят свои имена сюда
    };
    var who = names[id] || id;
    if (d > 0) {
      toast((why ? why + ' ' : '') + who + ' стал относиться к вам с бо́льшим доверием (+' + d + ').', 'good');
    } else {
      toast((why ? why + ' ' : '') + who + ' смотрит на вас холоднее (' + d + ').', 'warn');
    }
    // всплывающая цифра над игроком
    var p = P();
    if (p && WS.Fx && WS.Fx.text) {
      WS.Fx.text((d > 0 ? '+' : '') + d + ' доверие',
        p.x, p.y - 1.4, { col: d > 0 ? '#8fbf7a' : '#c46a5a', life: 1.4 });
    }
    if (st.open) updateRepLabel();
    return s.rep[id];
  }

  /** Строка доверия в шапке окна. */
  function updateRepLabel() {
    if (!dom.rep || !st.npc) return;
    if (!st.npc.repId) { dom.rep.textContent = ''; return; }
    var v = rep(st.npc.repId);
    var word = 'доверие';
    if (v <= -5) word = 'неприязнь';
    else if (v < 0) word = 'настороженность';
    else if (v === 0) word = 'настороженность';
    else if (v < 3) word = 'знакомство';
    else if (v < 6) word = 'доверие';
    else if (v < 10) word = 'уважение';
    else word = 'почитание';
    dom.rep.textContent = word + ': ' + v;
  }

  // ====================================================================
  //  ОТКРЫТИЕ / ЗАКРЫТИЕ
  // ====================================================================

  /**
   * Начать разговор с npc.
   * npc: {name, sprName, sprFrame?, portraitFrames?, repId?, cap?, tree}
   *   tree — дерево узлов ИЛИ функция(ctx) -> дерево (живые темы).
   */
  function startDialog(npc) {
    if (!npc) return false;
    if (st.open) closeDialog();
    if (WS.Ui && WS.Ui.modal && WS.Ui.modal()) {
      // чужое окно открыто — не перебиваем
      WS.warn('dialog: поверх чужого окна разговор не открывается');
      return false;
    }
    if (!ensureDom()) return false;
    var tree = npc.tree;
    if (typeof tree === 'function') {
      try { tree = tree(ctx()); } catch (e) {
        WS.err('dialog: дерево-функция упала:', e && e.message);
        return false;
      }
    }
    if (!tree || !tree.nodes) {
      WS.warn('dialog: у npc нет дерева разговора');
      return false;
    }
    st.npc = npc;
    st.tree = tree;
    st.portraitF = (npc.portraitFrames && npc.portraitFrames[0]) || npc.sprFrame || 0;
    st.portraitT = 0;

    if (dom.name) dom.name.textContent = npc.name || '';
    if (dom.cap) dom.cap.textContent = npc.cap || '';
    if (dom.foot) {
      dom.foot.innerHTML = '<b>Esc</b> — уйти · <b>клик по тексту</b> — дописать' +
        ((npc.optsHint === false) ? '' : ' · <b>1–9</b> — ответ');
    }

    var startId = (typeof tree.start === 'string') ? tree.start :
      ((typeof tree.start === 'function') ? resolve(tree.start, { npc: npc, D: Dialog }) : 'start');
    if (!startId || !tree.nodes[startId]) {
      // вход по первому ключу
      for (var k in tree.nodes) { startId = k; break; }
    }

    // открываем через реестр экранов (Esc, стек, модальность):
    // Ui.open сам вызовет наш open() — он и поднимет st.open с классами
    var openedViaUi = false;
    if (WS.Ui && WS.Ui.register && WS.Ui.open) {
      try {
        WS.Ui.register('dialog', {
          root: dom.root,
          open: function () {
            if (!st.open) {
              st.open = true;
              reveal();
            }
          },
          close: function () { closeDialog(true); },
          isOpen: function () { return st.open; }
        });
        WS.Ui.open('dialog');
        openedViaUi = st.open;
      } catch (e) { openedViaUi = false; }
    }
    if (!openedViaUi) {
      st.open = true;
      reveal();
    }
    showNode(startId);
    return true;
  }

  /** Показать окно (классы). Вызывается из реестра или напрямую. */
  function reveal() {
    if (!dom.root) return;
    dom.root.classList.remove('hidden');
    dom.root.classList.add('ws-modal');
  }

  /**
   * Закрыть разговор. fromUi — закрытие уже пришло из реестра экранов
   * (тогда стеком занимается сам реестр, нам — только прибраться).
   */
  function closeDialog(fromUi) {
    if (!st.open) return;
    st.open = false;
    stopTyping();
    var root = dom.root;
    if (!fromUi && WS.Ui && WS.Ui.close) {
      // реестр вынет из стека и снимет классы сам (scr.root зарегистрирован);
      // наш scr.close в этот момент уже ничего не сделает — st.open погашен
      try { WS.Ui.close('dialog'); } catch (e) { /* ниже сами */ }
    }
    if (root) {
      root.classList.add('hidden');
      root.classList.remove('ws-modal');
    }
    st.npc = null;
    st.tree = null;
    st.node = null;
  }

  function isOpen() { return st.open; }

  /** Показать простое дерево одним вызовом: WS.Dialog.show(tree, npc). */
  function showTree(tree, npc) {
    var o = npc || {};
    o.tree = tree;
    return startDialog(o);
  }

  // ====================================================================
  //  КЛАВИАТУРА: Esc (страховка к реестру), 1..9 — выбор ответа
  // ====================================================================

  function onKeyDown(d) {
    if (!st.open || !d || !d.code) return;
    if (d.code === 'Escape') {
      // реестр экранов уже закрыл бы нас; если по какой-то причине нет —
      if (!WS.Ui || !WS.Ui.opened || WS.Ui.opened().indexOf('dialog') < 0) {
        closeDialog();
      }
      return;
    }
    // цифры 1..9 — выбор варианта (только когда текст допечатан)
    if (st.pos < st.full.length) return;
    var m = /^Digit([1-9])$/.exec(d.code);
    if (!m) return;
    var i = parseInt(m[1], 10) - 1;
    var opts = st.node && st.node.options;
    if (!opts || !opts.length) return;
    // пропускаем скрытые cond-ом — считаем только доступные
    var c = ctx();
    var shown = 0;
    for (var k = 0; k < opts.length && shown <= i; k++) {
      var o = opts[k];
      if (!o) continue;
      var ok = checkCond(o.cond, c);
      var usedUp = isUsed(o);
      if (!ok && !o.note) continue;
      if (usedUp && o.once) continue;
      if (shown === i) {
        if (ok) {
          snd('select', 0.45);
          choose(o);
        }
        return;
      }
      if (ok) shown++;
    }
  }

  // ====================================================================
  //  ТИК: пока мир стоит (модалка), оживляем окно интервалами —
  //  печать и «дыхание» портрета работают и на паузе
  // ====================================================================

  /** Общий интервал окна: печатная машинка уже свой, здесь — портрет. */
  function startLiveLoop() {
    if (st.live) return;
    st.live = setInterval(function () {
      if (!st.open) return;
      portraitTick();
    }, 120);
  }

  // ====================================================================
  //  КОНСТРУКТОР ДЕРЕВЬЕВ: маленькие помощники для соседей
  // ====================================================================

  /** Узел-монолог: текст + варианты. Сокращение для больших деревьев. */
  function N(id, text, options) {
    return { id: id, text: text, options: options || [] };
  }

  /** Вариант-переход. */
  function O(txt, next, extra) {
    var o = { txt: txt, next: next };
    if (extra) {
      for (var k in extra) if (extra.hasOwnProperty(k)) o[k] = extra[k];
    }
    return o;
  }

  /** Вариант-конец. */
  function OEnd(txt, extra) {
    return O(txt, null, (function () {
      var e = extra || {};
      e.end = true;
      return e;
    })());
  }

  // ====================================================================
  //  САМОТЕСТ (консоль): целостность движка без партии
  // ====================================================================

  function selftest() {
    var out = [];
    var ok = function (name, cond) {
      out.push((cond ? '  ok  ' : ' FAIL ') + name);
      return !!cond;
    };
    ok('DOM строится', ensureDom());
    ok('закрыт по умолчанию', !isOpen());
    ok('репутация без партии = 0', rep('hermit') === 0);
    ok('мини-дерево валидно', (function () {
      var t = { start: 'a', nodes: { a: { text: 'x', options: [{ txt: 'у', next: 'b' }] }, b: { text: 'y' } } };
      return !!(t.nodes.a && t.nodes[t.nodes.a.options[0].next]);
    })());
    out.unshift('dialog.selftest: пройдено');
    return out;
  }

  // ====================================================================
  //  ПУБЛИЧНЫЙ API
  // ====================================================================

  var Dialog = {
    /** Начать разговор с npc (дерево может быть функцией). */
    start: startDialog,
    /** Показать готовое дерево: WS.Dialog.show(tree, {name, sprName...}). */
    show: showTree,
    /** Закрыть разговор. */
    close: function () { closeDialog(false); },
    /** Открыт ли разговор. */
    isOpen: isOpen,

    /** Печать ещё идёт? (для соседей, что ждут конца текста) */
    typing: function () { return st.open && st.pos < st.full.length; },
    /** Дописать мгновенно. */
    skip: skipTyping,

    // ---- репутация ----
    rep: rep,
    repAdd: repAdd,
    /** Репутация npc по его repId (удобно в cond: ctx.D.repNpc(ctx) >= 3). */
    repNpc: function (c) {
      var npc = c && c.npc;
      return npc && npc.repId ? rep(npc.repId) : 0;
    },

    // ---- история тем ----
    seen: function (npc, nodeId) { return wasSeen(npc, nodeId); },
    seenId: function (npcId, nodeId) {
      var s = F();
      var d = s && s.dialogSeen;
      return !!(d && d[npcId] && d[npcId][nodeId]);
    },

    // ---- конструкторы узлов для соседей ----
    N: N,
    O: O,
    OEnd: OEnd,

    /** Внутреннее состояние (отладка). */
    _state: function () { return st; },

    selftest: selftest
  };

  // ====================================================================
  //  BOOT
  // ====================================================================

  WS.boot(function initDialog() {
    ensureDom();
    startLiveLoop();

    // клавиатура: Esc-страховка и цифры 1..9
    WS.Ev.on('key:down', onKeyDown);

    // смерть/победа закрывают разговор
    WS.Ev.on('player:die', function () { if (st.open) closeDialog(true); });
    WS.Ev.on('game:victory', function () { if (st.open) closeDialog(true); });

    WS.log('[Dialog] движок разговоров зарегистрирован');
  }, 'dialog:init');

  WS.def('Dialog', Dialog);
})();
