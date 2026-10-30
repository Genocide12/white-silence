/**
 * ЭКРАН НАСТРОЕК: громкость, язык, сложность, скорость, обучение, тумблеры.
 * Открывается из паузы и главного меню. Все настройки применяются сразу и
 * сохраняются в localStorage.
 */
(function () {
  'use strict';

  var KEY = 'ws_options';
  var opts = null;

  var DEFAULTS = {
    volume: 0.7,
    music: 0.5,
    muted: false,
    lang: null,            // null = авто
    difficulty: 'survivor',
    tutorial: true,
    weatherFx: true,       // частицы погоды
    blood: true,           // кровь
    footprints: true,
    autosave: true,
    showFps: false,
    hints: true
  };

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        opts = {};
        var d = JSON.parse(raw);
        for (var k in DEFAULTS) opts[k] = d[k] !== undefined ? d[k] : DEFAULTS[k];
        return;
      }
    } catch (e) { /* пусто */ }
    opts = {};
    for (var d2 in DEFAULTS) opts[d2] = DEFAULTS[d2];
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(opts));
    } catch (e) { /* нет доступа — молча */ }
  }

  function get(k) {
    if (!opts) load();
    return opts[k];
  }

  function set(k, v) {
    if (!opts) load();
    opts[k] = v;
    save();
    apply(k, v);
  }

  /** Применить настройку к живым системам. */
  function apply(k, v) {
    switch (k) {
      case 'volume':
        if (WS.Snd) WS.Snd.setVolume(v);
        break;
      case 'muted':
        if (WS.Snd) WS.Snd.setMuted(!!v);
        break;
      case 'music':
        if (WS.Music && WS.Music.setVolume) WS.Music.setVolume(v);
        break;
      case 'lang':
        if (WS.I18N && WS.I18N.setLang && v) WS.I18N.setLang(v);
        break;
      case 'difficulty':
        if (WS.Difficulty && WS.Difficulty.set) WS.Difficulty.set(v);
        break;
      case 'tutorial':
        if (WS.Tutorial && WS.Tutorial.setEnabled) WS.Tutorial.setEnabled(!!v);
        break;
      case 'weatherFx':
      case 'blood':
      case 'footprints':
      case 'hints':
      case 'autosave':
      case 'showFps':
        // читаются соответствующими системами через WS.Options.get()
        break;
    }
  }

  function applyAll() {
    if (!opts) load();
    for (var k in opts) apply(k, opts[k]);
  }

  // ================================================================ ЭКРАН
  var el = null;

  function build() {
    if (el) return el;
    var root = document.getElementById('ui-root');
    if (!root) return null;

    el = document.createElement('div');
    el.id = 'ws-options';
    el.className = 'ws-panel ws-options hidden';

    var title = document.createElement('div');
    title.className = 'ws-title';
    title.textContent = 'НАСТРОЙКИ';
    el.appendChild(title);

    // --- громкость ---
    el.appendChild(row('Громкость звуков', 'volume', 'slider', 0, 1, 0.05));
    el.appendChild(row('Громкость музыки', 'music', 'slider', 0, 1, 0.05));
    el.appendChild(row('Без звука', 'muted', 'check'));

    el.appendChild(hr());

    // --- язык ---
    el.appendChild(row('Язык интерфейса', 'lang', 'select', null, null, null, [
      { v: null, t: 'Авто' }, { v: 'ru', t: 'Русский' }, { v: 'en', t: 'English' }
    ]));

    // --- сложность ---
    el.appendChild(row('Сложность (новая партия)', 'difficulty', 'select', null, null, null, [
      { v: 'story', t: 'Рассказчик' },
      { v: 'survivor', t: 'Выживший' },
      { v: 'hard', t: 'Север не прощает' },
      { v: 'polar', t: 'Полярная ночь' }
    ]));

    el.appendChild(hr());

    // --- тумблеры ---
    el.appendChild(row('Обучение', 'tutorial', 'check'));
    el.appendChild(row('Частицы погоды', 'weatherFx', 'check'));
    el.appendChild(row('Кровь', 'blood', 'check'));
    el.appendChild(row('Следы на снегу', 'footprints', 'check'));
    el.appendChild(row('Автосохранение (почасовое)', 'autosave', 'check'));
    el.appendChild(row('Счётчик FPS', 'showFps', 'check'));
    el.appendChild(row('Подсказки и события', 'hints', 'check'));

    el.appendChild(hr());

    var btnRow = document.createElement('div');
    btnRow.className = 'ws-options-btns';

    var def = document.createElement('button');
    def.className = 'ws-btn';
    def.textContent = 'По умолчанию';
    def.addEventListener('click', function () {
      for (var k in DEFAULTS) set(k, DEFAULTS[k]);
      refresh();
      toast('Настройки сброшены.');
    });

    var close = document.createElement('button');
    close.className = 'ws-btn primary';
    close.textContent = 'Готово';
    close.addEventListener('click', hide);

    btnRow.appendChild(def);
    btnRow.appendChild(close);
    el.appendChild(btnRow);

    root.appendChild(el);
    return el;
  }

  function hr() {
    var e = document.createElement('div');
    e.className = 'ws-options-hr';
    return e;
  }

  function row(label, key, kind, min, max, step, options) {
    var r = document.createElement('div');
    r.className = 'ws-options-row';

    var lab = document.createElement('label');
    lab.className = 'ws-options-label';
    lab.textContent = label;
    r.appendChild(lab);

    var input;
    if (kind === 'slider') {
      input = document.createElement('input');
      input.type = 'range';
      input.min = String(min);
      input.max = String(max);
      input.step = String(step || 0.1);
      input.value = String(get(key));
      input.addEventListener('input', function () {
        set(key, parseFloat(input.value));
        valEl.textContent = Math.round(parseFloat(input.value) * 100) + '%';
      });
      r.appendChild(input);
      var valEl = document.createElement('span');
      valEl.className = 'ws-options-val';
      valEl.textContent = Math.round(parseFloat(get(key)) * 100) + '%';
      r.appendChild(valEl);
    } else if (kind === 'check') {
      input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = !!get(key);
      input.addEventListener('change', function () {
        set(key, input.checked);
      });
      r.appendChild(input);
    } else if (kind === 'select') {
      input = document.createElement('select');
      for (var i = 0; i < options.length; i++) {
        var op = document.createElement('option');
        op.value = options[i].v === null ? '' : options[i].v;
        op.textContent = options[i].t;
        if (String(get(key)) === String(options[i].v)) op.selected = true;
        input.appendChild(op);
      }
      input.addEventListener('change', function () {
        var v = input.value === '' ? null : input.value;
        set(key, v);
      });
      r.appendChild(input);
    }
    return r;
  }

  function refresh() {
    if (!el) return;
    // перестроить значения
    var parent = el.parentNode;
    if (parent) {
      parent.removeChild(el);
      el = null;
      build();
    }
  }

  function show() {
    build();
    if (!el) return;
    refresh();
    el.classList.remove('hidden');
  }

  function hide() {
    if (el) el.classList.add('hidden');
  }

  function toggle() {
    if (el && !el.classList.contains('hidden')) hide();
    else show();
  }

  function isOpen() {
    return el && !el.classList.contains('hidden');
  }

  function toast(text) {
    if (WS.Ui && WS.Ui.toast) WS.Ui.toast(text, 'info');
  }

  // ================================================================ ЗАПУСК
  WS.boot(function initOptions() {
    load();
    applyAll();
    // повторное применение при старте партии (сложность и т.п.)
    WS.Ev.on('game:start', function () { applyAll(); });
  }, 'options:init');

  WS.def('Options', {
    get: get,
    set: set,
    applyAll: applyAll,
    show: show,
    hide: hide,
    toggle: toggle,
    isOpen: isOpen,
    DEFAULTS: DEFAULTS
  });
})();
