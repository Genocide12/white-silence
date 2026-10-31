/**
 * ЯДРО UI «Белого Безмолвия»: реестр экранов, модальность, тосты,
 * пауза/скорость времени, контекстная подсказка [E], окно подтверждения,
 * запасное главное меню (если D1 не выставил своё #ws-menu).
 *
 * Связи:
 *  - main.js вызывает WS.Ui.showMenu() при старте и WS.Ui.deathScreen() при
 *    смерти (deathScreen живёт в ui/death_screen.js, довешивается в boot);
 *  - Loop/input останавливают симуляцию, пока WS.Ui.modal() === true;
 *  - параллельные экраны (D1 меню, D2 инвентарь, D3 карта/журнал) регистрируются
 *    через WS.Ui.register(name, {open, close, isOpen}) и открываются open(name).
 */
(function () {
  'use strict';

  // ====================================================================
  //  СОСТОЯНИЕ МОДУЛЯ (всё лениво, создаётся в boot)
  // ====================================================================

  var screens = {};        // name -> описание экрана (реестр для D1/D2/D3)
  var stack = [];           // стек открытых модальных экранов (для ESC)
  var bootDone = false;     // boot прошёл — можно дёргать DOM

  // DOM-каркас (создаётся ensureDom, лежит в #ui-root)
  var dom = {
    root: null,             // #ui-root
    toasts: null,           // #ws-toasts — стек сообщений
    hint: null,             // #ws-hint — подсказка [E]
    hud: null,              // #ws-hud — часы + индикатор скорости
    clock: null,             // .hud-clock — дата/время
    ship: null,             // .hud-ship — дней до парохода
    speed: null,            // .hud-speed — ×1/×2/×3/‖
    pause: null,            // #ws-pause — оверлей «ПАУЗА»
    menu: null,             // #ws-menu-fb — своё меню (запасное)
    about: null,            // #ws-about — окно «Об игре»
    confirm: null,           // #ws-confirm — окно подтверждения
    confirmText: null,
    confirmTitle: null
  };

  var speedMode = 1;        // текущий режим времени: 1..3 (×1..×3) или 0 (пауза)
  var resumeSpeed = 1;      // скорость до паузы (для возобновления)
  var hintText = '';        // текущий текст подсказки (пусто = скрыта)
  var pendingYes = null;    // колбэк подтверждения
  var lastClockStr = '';    // кэш строки часов (обновляем не каждый кадр)
  var clockAcc = 0;         // накопитель времени для часов

  /** Глифы тостов — типографские символы, которые есть в PT Serif. */
  var TOAST_GLYPHS = {
    info: 'i',
    good: '✓',
    warn: '!',
    bad: '✕'
  };

  /** Режимы скорости по кругу: ×1 → ×2 → ×3 → пауза → ×1… */
  var SPEED_CYCLE = [1, 2, 3, 0];

  // ====================================================================
  //  МАЛЫЕ УТИЛИТЫ
  // ====================================================================

  /** Перевод строки: словарь i18n, если есть; иначе литерал. */
  function T(key, fb) {
    if (WS.I18N && WS.I18N.t) {
      try { return WS.I18N.t(key, fb); } catch (e) { /* словарь ещё не готов */ }
    }
    return (typeof fb === 'string') ? fb : key;
  }

  /** Создать элемент с классом и (опционально) родителем. */
  function el(tag, cls, parent) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (parent) parent.appendChild(e);
    return e;
  }

  /** Кнопка .ws-btn с подписью, стилем и обработчиком. */
  function btn(label, cls, onClick) {
    var b = el('button', 'ws-btn' + (cls ? ' ' + cls : ''));
    b.type = 'button';
    b.textContent = label;
    b.addEventListener('click', function (ev) {
      if (WS.Snd && WS.Snd.play) { try { WS.Snd.play('click'); } catch (e) { /* тихо */ } }
      if (onClick) onClick(ev);
    });
    return b;
  }

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  /** Заглавная буква строки (для причин смерти и прочих литералов систем). */
  function capFirst(s) {
    s = String(s || '');
    if (!s) return s;
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  /** Русская плюрализация: plural(2, 'день', 'дня', 'дней'). */
  /** Слово «день» в нужной форме — через словари (EN-режим больше не
   *  показывает «until the steamship: 59 дней»). */
  function dayWord(n) {
    n = Math.abs(Math.round(n)) % 100;
    if (n > 10 && n < 20) return T('ui.day.many', 'дней');
    var d = n % 10;
    if (d === 1) return T('ui.day.one', 'день');
    if (d >= 2 && d <= 4) return T('ui.day.few', 'дня');
    return T('ui.day.many', 'дней');
  }

  function plural(n, one, few, many) {
    n = Math.abs(Math.round(n)) % 100;
    if (n > 10 && n < 20) return many;
    var d = n % 10;
    if (d === 1) return one;
    if (d >= 2 && d <= 4) return few;
    return many;
  }

  // ====================================================================
  //  DOM-КАРКАС (однократно, при boot)
  // ====================================================================

  function ensureDom() {
    if (bootDone && dom.root) return;

    dom.root = document.getElementById('ui-root');
    if (!dom.root) {
      // страховка: тело страницы вместо отсутствующего корня
      dom.root = document.body;
    }

    // --- стек тостов (справа снизу) ---
    if (!dom.toasts) {
      dom.toasts = el('div', 'ws-toasts');
      dom.toasts.id = 'ws-toasts';
      dom.root.appendChild(dom.toasts);
    }

    // --- подсказка [E] у курсора ---
    if (!dom.hint) {
      dom.hint = el('div', 'ws-hint hidden');
      dom.hint.id = 'ws-hint';
      dom.root.appendChild(dom.hint);
    }

    // --- HUD: часы + индикатор скорости (правый верхний угол) ---
    // скрыт по умолчанию: в меню и на финальных экранах ему нечего делать
    if (!dom.hud) {
      dom.hud = el('div', 'ws-hud hidden');
      dom.hud.id = 'ws-hud';
      dom.clock = el('div', 'hud-clock', dom.hud);
      dom.ship = el('div', 'hud-ship hidden', dom.hud);
      dom.speed = el('div', 'hud-speed', dom.hud);
      dom.speed.id = 'ws-speed';
      dom.speed.title = T('ui.speed.hint', 'Пробел — пауза и скорость времени');
      dom.speed.addEventListener('click', function () {
        if (WS.G && WS.G.running && !modal()) cycleSpeed();
      });
      dom.root.appendChild(dom.hud);
    }

    // --- оверлей ПАУЗА (не модальный, клики не ловит) ---
    if (!dom.pause) {
      dom.pause = el('div', 'ws-pause hidden');
      dom.pause.id = 'ws-pause';
      var w = el('div', 'p-word', dom.pause);
      w.textContent = T('ui.pause.word', 'ПАУЗА');
      var h = el('div', 'p-hint', dom.pause);
      h.textContent = T('ui.pause.hint', 'Пробел — продолжить · Esc — окна');
      dom.root.appendChild(dom.pause);
    }

    // --- окно подтверждения ---
    if (!dom.confirm) {
      dom.confirm = el('div', 'ws-confirm hidden');
      dom.confirm.id = 'ws-confirm';
      var panel = el('div', 'c-panel', dom.confirm);
      dom.confirmTitle = el('div', 'c-title', panel);
      dom.confirmText = el('div', 'c-text', panel);
      var row = el('div', 'c-btns', panel);
      var yes = btn(T('ui.yes', 'Да'), 'primary', function () { answerConfirm(true); });
      var no = btn(T('ui.no', 'Отмена'), '', function () { answerConfirm(false); });
      row.appendChild(yes);
      row.appendChild(no);
      dom.root.appendChild(dom.confirm);
    }

    updateSpeedWidget();
  }

  // ====================================================================
  //  РЕЕСТР ЭКРАНОВ
  //  Экран = {open(...), close(), isOpen()} — то, что регистрируют
  //  соседи (D2 инвентарь, D3 карта). Каждый экран по умолчанию модален:
  //  открытым добавляется класс .ws-modal, WS.Ui.modal() -> true, Loop
  //  ставит симуляцию на паузу (см. core/loop.js).
  // ====================================================================

  /** Зарегистрировать экран. Псевдонимы: show/hide/visible. */
  function register(name, def) {
    def = def || {};
    screens[name] = {
      name: name,
      open: def.open || def.show || null,
      close: def.close || def.hide || null,
      isOpen: def.isOpen || def.visible || null,
      root: def.root || null,          // Element | CSS-селектор | null
      modal: (def.modal === false) ? false : true,
      noEsc: !!def.noEsc               // ESC не закрывает (смерть, меню)
    };
    return screens[name];
  }

  /** Найти корневой элемент экрана (для класса .ws-modal / .hidden). */
  function rootOf(scr) {
    if (!scr || !scr.root) return null;
    if (typeof scr.root === 'string') {
      try { return document.querySelector(scr.root); } catch (e) { return null; }
    }
    return scr.root;
  }

  /** Открыт ли экран (спрашиваем у него, иначе смотрим на DOM/стек). */
  function isOpen(name) {
    var scr = screens[name];
    if (!scr) {
      // чужой экран без реестра — смотрим только на DOM
      var node = document.getElementById(name);
      return !!(node && !node.classList.contains('hidden'));
    }
    if (scr.isOpen) {
      try { if (scr.isOpen()) return true; } catch (e) { /* спросим ниже */ }
    }
    var r = rootOf(scr);
    if (r) return !r.classList.contains('hidden');
    return stack.indexOf(name) >= 0;
  }

  /** Открыть экран реестра. Остальные аргументы уходят в screen.open. */
  function open(name) {
    var scr = screens[name];
    if (!scr) {
      // сосед не регистрировался, но мог повесить элемент с таким id
      var node = document.getElementById(name);
      if (node) {
        node.classList.remove('hidden');
        node.classList.add('ws-modal');
        if (stack.indexOf(name) < 0) stack.push(name);
        hideHint();
        return true;
      }
      WS.warn('Ui.open: экран "' + name + '" не зарегистрирован');
      return false;
    }
    if (isOpen(name)) return true;

    var args = [];
    for (var i = 1; i < arguments.length; i++) args.push(arguments[i]);

    try {
      if (scr.open) scr.open.apply(null, args);
    } catch (e) {
      WS.err('Ui.open("' + name + '") упал:', e && e.message);
      return false;
    }

    var r = rootOf(scr);
    if (r) {
      r.classList.remove('hidden');
      if (scr.modal !== false) r.classList.add('ws-modal');
    }
    if (stack.indexOf(name) < 0) stack.push(name);
    hideHint();
    try { WS.Ev.emit('ui:screen:open', { name: name }); } catch (e) { /* пусто */ }
    return true;
  }

  /** Закрыть экран реестра. */
  function close(name) {
    var scr = screens[name];
    var idx = stack.indexOf(name);

    if (!scr) {
      // чужой элемент: гасим классами, вынимаем из стека
      var node = document.getElementById(name);
      if (node) {
        node.classList.add('hidden');
        node.classList.remove('ws-modal');
      }
      if (idx >= 0) stack.splice(idx, 1);
      return true;
    }

    var wasOpen = (idx >= 0) || isOpen(name);

    try {
      if (scr.close) scr.close();
    } catch (e) {
      WS.err('Ui.close("' + name + '") упал:', e && e.message);
    }

    var r = rootOf(scr);
    if (r) {
      r.classList.add('hidden');
      if (scr.modal !== false) r.classList.remove('ws-modal');
    }
    if (idx >= 0) stack.splice(idx, 1);

    if (wasOpen) {
      try { WS.Ev.emit('ui:screen:close', { name: name }); } catch (e) { /* пусто */ }
    }
    return true;
  }

  /** Закрыть верхний экранируемый экран (для ESC). */
  function closeTop() {
    for (var i = stack.length - 1; i >= 0; i--) {
      var scr = screens[stack[i]];
      if (!scr || !scr.noEsc) {
        var nm = stack[i];
        close(nm);
        return nm;
      }
    }
    return null;
  }

  /** Закрыть все экраны стека (кроме защищённых от Esc — их тоже: смерть
   *  закрывается явно при рестарте, а здесь — общий аварийный сброс). */
  function closeAll() {
    // идём с конца: close() вынимает из стека сам
    var guard = 32;
    while (stack.length && guard-- > 0) {
      close(stack[stack.length - 1]);
    }
  }

  /** Список имён открытых экранов (верхний — последний). */
  function opened() { return stack.slice(); }

  /** Имена зарегистрированных экранов. */
  function names() {
    var out = [];
    for (var k in screens) if (screens.hasOwnProperty(k)) out.push(k);
    return out;
  }

  // ====================================================================
  //  МОДАЛЬНОСТЬ
  //  modal() -> true, когда открыт хоть один полноэкранный экран.
  //  Loop и Input по этому флагу глушат симуляцию и игровой ввод.
  // ====================================================================

  function modal() {
    // 1) экраны реестра (все они по умолчанию модальны)
    for (var i = 0; i < stack.length; i++) {
      var scr = screens[stack[i]];
      if (!scr || scr.modal !== false) return true;
    }
    // 2) страховка: чужие элементы, повесившие класс .ws-modal сами
    try {
      if (document.querySelector('.ws-modal:not(.hidden)')) return true;
    } catch (e) { /* пусто */ }
    return false;
  }

  // ====================================================================
  //  ТОСТЫ — стек справа снизу
  //  kinds: info (серый), good (зелёный), warn (жёлтый), bad (красный).
  //  Автоскрытие 4 с, максимум 5 штук, клик — убрать.
  // ====================================================================

  var TOAST_LIFE = 4000;   // мс
  var TOAST_MAX = 5;

  /** Убрать тост из DOM (мгновенно или с анимацией). */
  function removeToast(node, instant) {
    if (!node || !node.parentNode) return;
    if (node._tm) { clearTimeout(node._tm); node._tm = null; }
    if (node._tm2) { clearTimeout(node._tm2); node._tm2 = null; }
    if (instant) {
      node.parentNode.removeChild(node);
      return;
    }
    node.classList.add('out');
    node._tm2 = setTimeout(function () {
      if (node.parentNode) node.parentNode.removeChild(node);
      node._tm2 = null;
    }, 360);
  }

  /** Показать тост. */
  function toast(text, kind) {
    if (text == null || text === '') return;
    ensureDom();

    var k = TOAST_GLYPHS[kind] ? kind : 'info';
    var box = dom.toasts;

    // максимум TOAST_MAX штук: старые уходят первыми
    while (box.children.length >= TOAST_MAX) {
      removeToast(box.firstChild, true);
    }

    var t = el('div', 'ws-toast ' + k);
    var ico = el('span', 't-ico', t);
    ico.textContent = TOAST_GLYPHS[k];
    var tx = el('span', 't-txt', t);
    tx.textContent = String(text);

    // клик — скрыть (тосты не должны мешать)
    t.addEventListener('click', function () { removeToast(t, false); });

    box.appendChild(t);
    // принудительный reflow, чтобы анимация появления сработала
    void t.offsetWidth;
    t.classList.add('in');

    t._tm = setTimeout(function () { removeToast(t, false); }, TOAST_LIFE);
  }

  // ====================================================================
  //  ПОДСКАЗКА ВЗАИМОДЕЙСТВИЯ — «[E] Обыскать шкаф» у курсора
  // ====================================================================

  /** Задать/сбросить подсказку. Пустой текст скрывает её. */
  function hint(text) {
    ensureDom();
    if (text == null || text === '') {
      hintText = '';
      dom.hint.classList.add('hidden');
      return;
    }
    var s = String(text);
    // авто-префикс клавиши, если сосед не оформил его сам
    if (s.charAt(0) !== '[') s = '[E] ' + s;
    hintText = s;
    dom.hint.textContent = s;
    dom.hint.classList.remove('hidden');
    positionHint();
  }

  /** Позиция подсказки — у курсора, не вылезая за экран. */
  function positionHint() {
    if (!dom.hint || !hintText) return;
    var m = (WS.Input && WS.Input.mouse) ? WS.Input.mouse() : null;
    if (!m) return;
    var vw = window.innerWidth || 1280;
    var vh = window.innerHeight || 720;
    var w = dom.hint.offsetWidth || 140;
    var h = dom.hint.offsetHeight || 26;
    var x = m.x + 18;
    var y = m.y + 24;
    if (x + w > vw - 8) x = m.x - w - 14;    // упёрлись справа — влево от курсора
    if (y + h > vh - 8) y = m.y - h - 14;    // упёрлись снизу — над курсором
    if (x < 8) x = 8;
    if (y < 8) y = 8;
    dom.hint.style.left = x + 'px';
    dom.hint.style.top = y + 'px';
  }

  function hideHint() {
    if (dom.hint && hintText) hint('');
  }

  // ====================================================================
  //  ОКНО ПОДТВЕРЖДЕНИЯ — confirm(text, onYes)
  //  (нативный confirm запрещён контрактом)
  // ====================================================================

  function confirmBox(text, onYes, opts) {
    opts = opts || {};
    ensureDom();
    if (isOpen('confirm')) close('confirm');

    dom.confirmTitle.textContent = opts.title || T('ui.confirm.title', 'Подтверждение');
    dom.confirmText.textContent = String(text == null ? '' : text);
    pendingYes = (typeof onYes === 'function') ? onYes : null;

    // перезаписываем подписи кнопок (могут быть кастомные)
    var row = dom.confirm.querySelector('.c-btns');
    if (row && opts.yes) row.children[0].textContent = opts.yes;
    if (row && opts.no) row.children[1].textContent = opts.no;

    open('confirm');
  }

  /** Ответ на подтверждение. */
  function answerConfirm(yes) {
    var cb = pendingYes;
    pendingYes = null;
    close('confirm');
    if (yes && cb) {
      try { cb(); } catch (e) { WS.err('Ui.confirm: колбэк упал:', e && e.message); }
    }
  }

  // ====================================================================
  //  СКОРОСТЬ ВРЕМЕНИ И ПАУЗА
  //  Пробел циклично: ×1 → ×2 → ×3 → пауза → ×1.
  //  Пауза — глобальный флаг WS.paused (Loop его уважает), скорости —
  //  через WS.Loop.setSpeed (множитель игровых минут).
  // ====================================================================

  /** Применить текущий режим к движку. */
  function applySpeed() {
    if (WS.Loop && WS.Loop.setSpeed) {
      try { WS.Loop.setSpeed(speedMode || 1); } catch (e) { /* пусто */ }
    }
  }

  /** Сменить режим (1..3 или 0=пауза) и обновить индикатор. */
  function setMode(mode) {
    var was = speedMode;
    speedMode = mode;
    if (speedMode === 0) {
      resumeSpeed = was || 1;
      WS.paused = true;
    } else {
      WS.paused = false;
      applySpeed();
    }
    if (was !== speedMode) updateSpeedWidget();
    updatePauseOverlay();
  }

  /** Оверлей «ПАУЗА» — событийно, не тиком: на паузе кадры симуляции
   *  не идут (Loop их глушит), тик бы никогда не увидел флага. */
  function updatePauseOverlay() {
    if (!dom.pause) return;
    var show = (speedMode === 0) && WS.G && WS.G.running && !modal();
    if (show) dom.pause.classList.remove('hidden');
    else dom.pause.classList.add('hidden');
  }

  /** Пауза. */
  function pause() {
    if (speedMode !== 0) setMode(0);
  }

  /** Снять паузу (вернуть прежнюю скорость). */
  function unpause() {
    if (speedMode === 0) setMode(resumeSpeed || 1);
  }

  /** Переключить паузу. */
  function togglePause() {
    if (speedMode === 0) unpause(); else pause();
  }

  /** Пробел: ×1 → ×2 → ×3 → пауза → ×1. */
  function cycleSpeed() {
    var idx = 0;
    for (var i = 0; i < SPEED_CYCLE.length; i++) {
      if (SPEED_CYCLE[i] === speedMode) { idx = i; break; }
    }
    var next = SPEED_CYCLE[(idx + 1) % SPEED_CYCLE.length];
    setMode(next);
  }

  /** Обновить индикатор скорости в углу. */
  function updateSpeedWidget() {
    if (!dom.speed) return;
    if (speedMode === 0) {
      dom.speed.textContent = '‖';
      dom.speed.className = 'hud-speed paused';
    } else {
      dom.speed.textContent = '×' + speedMode;
      dom.speed.className = 'hud-speed x' + speedMode;
    }
    dom.speed.title = T('ui.speed.hint', 'Пробел — пауза и скорость времени');
  }

  /** Часы + «до парохода» (каждый кадр симуляции, дёшево).
   *  Важно: пока партия на паузе/в окне — тики не идут и время стоит,
   *  так что часы не устаревают: они обновляются ровно тогда, когда
   *  время реально течёт. */
  function hudTick(dt) {
    if (!bootDone || !dom.hud) return;

    var running = !!(WS.G && WS.G.running);

    // часы: перерисовываем раз в ~0.5 с, чтобы не дёргать DOM
    clockAcc += dt;
    if (clockAcc > 0.5) {
      clockAcc = 0;
      var s = '';
      if (WS.Time && WS.Time.fmt) {
        try { s = WS.Time.fmt(); } catch (e) { s = ''; }
      }
      if (s !== lastClockStr) {
        lastClockStr = s;
        if (dom.clock) dom.clock.textContent = s;
      }
      // дней до парохода
      if (dom.ship) {
        if (running && WS.Time && WS.Time.daysLeft) {
          var dl = WS.Time.daysLeft();
          dom.ship.textContent = T('ui.ship.left', 'до парохода') + ' ' +
            dl + ' ' + dayWord(dl);
          dom.ship.classList.remove('hidden');
        } else {
          dom.ship.classList.add('hidden');
        }
      }
    }

    // подсказка: позиция за курсором, вне игры — скрыта
    if (hintText) {
      if (!running || modal()) hideHint();
      else positionHint();
    }
  }

  // ====================================================================
  //  ЗАПАСНОЕ ГЛАВНОЕ МЕНЮ
  //  Показывает меню D1 (#ws-menu), если оно есть; иначе — своё простое:
  //  «Продолжить» (если сейв) / «Новая игра» / «Об игре».
  // ====================================================================

  /** Показать главное меню (точка входа из main.js). */
  function showMenu() {
    ensureDom();

    // 1) меню агента D1: элемент #ws-menu — показываем и не лезем дальше
    var d1 = document.getElementById('ws-menu');
    if (d1) {
      d1.classList.remove('hidden');
      // если D1 зарегистрировал меню в реестре — проведём по всем правилам
      if (screens['menu']) open('menu');
      return;
    }

    // 2) зарегистрированное кем-то меню
    if (screens['menu']) { open('menu'); return; }

    // 3) своё простое меню
    buildMenu();
    open('menu');
  }

  /** Спрятать любое главное меню. */
  function hideMenu() {
    var d1 = document.getElementById('ws-menu');
    if (d1) d1.classList.add('hidden');
    close('menu');   // close сам разберётся: реестр или чужой элемент
  }

  /** Построить запасное меню (однократно). */
  function buildMenu() {
    if (dom.menu) return;

    var m = el('div', 'ws-screen ws-menu-fb');
    m.id = 'ws-menu-fb';
    dom.menu = m;

    var inner = el('div', 'm-inner', m);

    var title = el('div', 'm-title', inner);
    title.textContent = T('ui.app_name', 'БЕЛОЕ БЕЗМОЛВИЕ');

    var sub = el('div', 'm-sub', inner);
    sub.textContent = T('ui.app_sub', 'Русский Север · зима 1917 года');

    var snow = el('div', 'm-snow', m);   // декоративная кромка (css)
    void snow;

    var btns = el('div', 'm-buttons', inner);

    // «Продолжить» — только если есть сейв
    var hasSave = false;
    try { hasSave = !!(WS.Save && WS.Save.exists && WS.Save.exists()); } catch (e) { hasSave = false; }

    if (hasSave) {
      btns.appendChild(btn(T('ui.continue', 'Продолжить'), 'primary wide', function () {
        var ok = false;
        try { ok = !!(WS.Main && WS.Main.loadGame && WS.Main.loadGame()); } catch (e) { ok = false; }
        if (!ok) toast(T('msg.load_failed', 'Не удалось загрузить сохранение'), 'bad');
      }));
    }

    btns.appendChild(btn(T('ui.new_game', 'Новая игра'), (hasSave ? '' : 'primary') + ' wide', function () {
      // простое меню: стартовый персонаж — телеграфист без черт
      try {
        if (WS.Main && WS.Main.newGame) WS.Main.newGame('telegraph', []);
      } catch (e) {
        WS.err('newGame упал:', e && e.message);
      }
    }));

    btns.appendChild(btn(T('ui.about', 'Об игре'), 'wide', function () {
      showAbout();
    }));

    var foot = el('div', 'm-foot', inner);
    foot.textContent = T('ui.menu.foot', '60 дней до весеннего парохода. Доживёте?');

    dom.root.appendChild(m);

    // регистрируем как экран: ESC его не закрывает (нечего открывать взамен)
    register('menu', {
      root: m,
      open: null, close: null,
      isOpen: function () { return !m.classList.contains('hidden'); },
      noEsc: true
    });
  }

  /** Окно «Об игре»: описание, управление, версия. */
  function showAbout() {
    if (dom.about) { open('about'); return; }

    var a = el('div', 'ws-screen ws-about');
    a.id = 'ws-about';
    dom.about = a;

    var inner = el('div', 'a-inner', a);

    var title = el('div', 'ws-title', inner);
    title.textContent = T('ui.about.title', 'ОБ ИГРЕ');

    var body = el('div', 'a-body', inner);

    var p1 = el('p', '', body);
    p1.textContent = T('ui.about.p1',
      'Изометрический сурвайвл в духе Project Zomboid: Русский Север, ' +
      'ноябрь 1917 года. Революция прокатилась по стране, а до вашей ' +
      ' фактории добрался только слух — весеннего парохода ждать шестьдесят дней.');

    var p2 = el('p', '', body);
    p2.textContent = T('ui.about.p2',
      'Ищите еду и топливо, топите печи, ставьте силки на зайца, шейте ' +
      'валенки из шкур, читайте чужие письма. Волки голодны этой зимой, ' +
      'дезертиры — тоже. Смерть окончательна: сохранение уничтожается.');

    // управление
    var keysTitle = el('div', 'ws-title', inner);
    keysTitle.textContent = T('ui.keys.title', 'УПРАВЛЕНИЕ');

    var table = el('div', 'a-keys', inner);
    var KEYS = [
      ['WASD / ←→↑↓', T('ui.keys.move', 'движение')],
      ['Shift', T('ui.keys.sprint', 'бег')],
      ['Ctrl', T('ui.keys.sneak', 'красться')],
      ['E', T('ui.keys.interact', 'действие: обыск, двери, подъём')],
      ['I / Tab', T('ui.keys.inventory', 'инвентарь')],
      ['C', T('ui.keys.craft', 'крафт')],
      ['M', T('ui.keys.map', 'карта')],
      ['J', T('ui.keys.journal', 'журнал и записки')],
      ['K', T('ui.keys.skills', 'навыки')],
      ['H', T('ui.keys.health', 'здоровье')],
      ['B', T('ui.keys.build', 'строительство и баррикады')],
      ['F', T('ui.keys.light', 'зажечь/убрать источник света')],
      ['Z', T('ui.keys.sleep', 'спать (на кровати или спальнике)')],
      ['Q', T('ui.keys.drop', 'выбросить предмет')],
      ['R', T('ui.keys.reload', 'перезарядка')],
      ['Пробел', T('ui.keys.speed', 'пауза / скорость ×1 ×2 ×3')],
      ['Esc', T('ui.keys.esc', 'закрыть окно / пауза')],
      ['Колесо', T('ui.keys.zoom', 'приближение камеры')]
    ];
    for (var i = 0; i < KEYS.length; i++) {
      var row = el('div', 'k-row', table);
      var k = el('span', 'k-key', row);
      k.textContent = KEYS[i][0];
      var v = el('span', 'k-val', row);
      v.textContent = KEYS[i][1];
    }

    var ver = el('div', 'a-ver', inner);
    ver.textContent = 'v' + WS.VERSION + ' · build ' + WS.BUILD;

    var rowBtn = el('div', 'a-btns', inner);
    rowBtn.appendChild(btn(T('ui.back', 'Назад'), 'primary', function () {
      close('about');
    }));

    dom.root.appendChild(a);

    register('about', {
      root: a,
      isOpen: function () { return !a.classList.contains('hidden'); }
    });
    open('about');
  }

  // ====================================================================
  //  СОБЫТИЯ ПАРТИИ
  // ====================================================================

  /** Новая партия или загрузка: спрятать меню, сбросить время. */
  function onGameStart() {
    hideMenu();
    closeAll();          // закрыть окна, оставшиеся с прошлой партии
    WS.paused = false;
    speedMode = 1;
    resumeSpeed = 1;
    applySpeed();
    updateSpeedWidget();
    updatePauseOverlay();
    hideHint();
    if (dom.hud) dom.hud.classList.remove('hidden');
  }

  /** Конец партии (смерть/победа): HUD прочь — финал важнее. */
  function onGameOver() {
    if (dom.hud) dom.hud.classList.add('hidden');
    if (dom.pause) dom.pause.classList.add('hidden');
    hideHint();
  }

  /** Начало новой игры — приветственный тост. */
  function onGameNew(d) {
    void d;
    var days = (WS.Time && WS.Time.DAYS_TO_SHIP) ? WS.Time.DAYS_TO_SHIP : 60;
    toast(T('msg.start', 'До весеннего парохода — ' + days + ' дней. Держитесь.'), 'info');
  }

  // ====================================================================
  //  КЛАВИАТУРА: Esc — верхнее окно, Пробел — пауза/скорость
  //  (событие 'key:down' — единственный источник, повторы отфильтрованы)
  // ====================================================================

  function onKeyDown(d) {
    if (!bootDone || !d || !d.code) return;

    if (d.code === 'Escape') {
      onEscKey();
    } else if (d.code === 'Space') {
      onSpaceKey();
    }
  }

  /** Esc: закрыть верхний экран; если окон нет — пауза. */
  function onEscKey() {
    if (!bootDone) return;
    var top = closeTop();
    if (top) return;
    if (WS.G && WS.G.running) togglePause();
  }

  /** Пробел: пауза/скорость — только в живой игре и без модальных окон. */
  function onSpaceKey() {
    if (!bootDone) return;
    if (modal()) return;                 // открытые окна едят пробел
    if (!(WS.G && WS.G.running)) return;  // в меню/смерти — не трогаем
    cycleSpeed();
  }

  // ====================================================================
  //  ТИК UI (приоритет 80 — последний в кадре)
  // ====================================================================

  function uiTick(dt) {
    if (!bootDone) return;
    hudTick(dt);
  }

  // ====================================================================
  //  BOOT: каркас DOM, встроенные экраны, подписки на события
  // ====================================================================

  WS.boot(function initUiCore() {
    ensureDom();

    // встроенные экраны реестра
    register('confirm', {
      root: dom.confirm,
      isOpen: function () { return !dom.confirm.classList.contains('hidden'); }
    });

    // тосты можно кидать и событием (контракт: 'ui:toast' {text, kind})
    WS.Ev.on('ui:toast', function (d) {
      if (d && d.text) toast(d.text, d.kind);
    });

    // партия началась/загрузилась: убрать меню, сбросить время
    WS.Ev.on('game:start', function (d) { onGameStart(); onGameNew(d); });
    WS.Ev.on('game:load', function () { onGameStart(); });

    // финал: смерть или победа — спрятать HUD и подсказки
    WS.Ev.on('player:die', onGameOver);
    WS.Ev.on('game:victory', onGameOver);

    // единый вход клавиатуры UI
    WS.Ev.on('key:down', onKeyDown);

    // первый кадр: если игра уже почему-то идёт — меню не показываем
    bootDone = true;
    WS.log('Ui: ядро интерфейса готово (' + names().length + ' встроенных экранов)');
  }, 'ui:core');

  WS.tick(80, uiTick, 'ui:core');

  // ====================================================================
  //  ПУБЛИЧНЫЙ API
  // ====================================================================

  var Ui = {
    // модальность и реестр
    modal: modal,
    register: register,
    open: open,
    close: close,
    closeTop: closeTop,
    closeAll: closeAll,
    isOpen: isOpen,
    opened: opened,
    screens: names,

    // сообщения
    toast: toast,
    hint: hint,

    // подтверждение (вместо запрещённого alert/confirm)
    confirm: confirmBox,

    // меню
    showMenu: showMenu,
    hideMenu: hideMenu,
    showAbout: showAbout,

    // пауза и скорость
    pause: pause,
    unpause: unpause,
    togglePause: togglePause,
    cycleSpeed: cycleSpeed,
    setSpeed: function (n) {
      n = clamp(Math.floor(n), 0, 3);
      setMode(n);
    },
    speed: function () { return speedMode; },
    isPaused: function () { return speedMode === 0; },

    // утилиты для соседних экранов
    t: T,
    plural: plural,
    capFirst: capFirst,
    el: el,
    btn: btn
  };

  WS.def('Ui', Ui);
})();
