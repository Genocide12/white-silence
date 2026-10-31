/**
 * Ввод: клавиатура + мышь. Единая точка опроса состояния.
 * Оси: WASD и стрелки. Мышь: позиция, кнопки, колесо.
 * Повторное нажатие (repeat) отфильтровано.
 * Перехват: если UI открыл модал — игровой ввод отключён (WS.Ui.modal()).
 */
(function () {
  'use strict';

  var keys = {};        // code -> true (физические коды)
  var pressed = {};     // коды, нажатые в этом кадре
  var released = {};
  var mouse = { x: 0, y: 0, wx: 0, wy: 0, tx: 0, ty: 0, left: false, right: false, middle: false,
                leftP: false, rightP: false, leftR: false, rightR: false, wheel: 0 };
  var overCanvas = true;
  var enabled = true;  // внешний запрет (кутсцены и т.п.)

  // Виртуальный джойстик (для демо-автопилота): точные аналоговые оси
  // вместо 8 квантованных направлений WASD. Ставит демо-бот каждый кадр;
  // реальная клавиатура имеет приоритет, когда виртуаль выключен.
  var virtual = { on: false, ax: 0, ay: 0 };

  var bindings = {
    up: ['KeyW', 'ArrowUp'],
    down: ['KeyS', 'ArrowDown'],
    left: ['KeyA', 'ArrowLeft'],
    right: ['KeyD', 'ArrowRight'],
    sprint: ['ShiftLeft', 'ShiftRight'],
    sneak: ['ControlLeft'],
    interact: ['KeyE'],
    inventory: ['KeyI', 'Tab'],
    craft: ['KeyC'],
    map: ['KeyM'],
    skills: ['KeyK'],
    health: ['KeyH'],
    journal: ['KeyJ'],
    build: ['KeyB'],
    lightSrc: ['KeyF'],      // фонарь/спичка в руке
    sleep: ['KeyZ'],
    pause: ['Escape'],
    speed: ['Space'],
    drop: ['KeyQ'],
    reload: ['KeyR'],
    zoomIn: ['Equal', 'NumpadAdd'],
    zoomOut: ['Minus', 'NumpadSubtract'],
    rotate: ['KeyO'],
    help: ['F1']
  };

  function down(action) {
    if (!enabled || (WS.Ui && WS.Ui.modal())) return false;
    var codes = bindings[action] || [];
    for (var i = 0; i < codes.length; i++) if (keys[codes[i]]) return true;
    return false;
  }

  function hit(action) {   // одноразовое: нажато в этом кадре
    if (!enabled || (WS.Ui && WS.Ui.modal())) return false;
    var codes = bindings[action] || [];
    for (var i = 0; i < codes.length; i++) if (pressed[codes[i]]) return true;
    return false;
  }

  function hitCode(code) {
    return !!pressed[code];
  }

  /** Съесть одноразовое нажатие: событие key:down уже обработало его
   *  (например, закрыло экран) — опросный путь hit()/hitCode() в этом
   *  кадре его НЕ увидит и не откроет экран тут же повторно.
   *  Так «повторное нажатие закрывает меню» работает честно. */
  function consumeCode(code) {
    delete pressed[code];
  }

  function keyIsDown(code) { return !!keys[code]; }

  /** Виртуальный джойстик: задать аналоговые экранные оси -1..1. */
  function setVirtual(ax, ay) {
    virtual.on = true;
    virtual.ax = Math.max(-1, Math.min(1, ax));
    virtual.ay = Math.max(-1, Math.min(1, ay));
  }

  /** Выключить виртуальный джойстик (управление возвращается клавиатуре). */
  function clearVirtual() {
    virtual.on = false;
    virtual.ax = 0;
    virtual.ay = 0;
  }

  /** Текущее состояние джойстика: null или {on, ax, ay}. */
  function virtualAxes() {
    return virtual.on ? { on: true, ax: virtual.ax, ay: virtual.ay } : null;
  }

  function updateMouseWorld() {
    // перевод экранных координат в мировые с учётом камеры.
    // ВАЖНО: mouse.x/y — CSS-пиксели (mousemove), а screenToWorld ждёт
    // ВНУТРЕННИЕ пиксели канваса (cv.width = innerWidth × dpr — Gfx.resize).
    // На HiDPI-экранах (dpr 2) без пересчёта мир «под курсором» уезжал
    // вдвое в сторону — промахи по цели и неверные подсказки.
    var cam = WS.Cam;
    if (!cam) return;
    var k = 1;
    try {
      var cv = document.getElementById('game');
      if (cv) {
        var r = cv.getBoundingClientRect();
        if (r && r.width > 1) k = cv.width / r.width;
      }
    } catch (e) { k = 1; }
    var w = cam.screenToWorld(mouse.x * k, mouse.y * k);
    mouse.wx = w.x; mouse.wy = w.y;
    mouse.tx = Math.floor(w.x); mouse.ty = Math.floor(w.y);
  }

  WS.boot(function initInput() {
    var canvas = document.getElementById('game');
    if (!canvas) return;

    window.addEventListener('keydown', function (e) {
      // не мешаем вводу в текстовые поля
      var tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (!e.repeat) {
        pressed[e.code] = true;
        WS.Ev.emit('key:down', { code: e.code, shift: e.shiftKey, ctrl: e.ctrlKey, alt: e.altKey });
      }
      keys[e.code] = true;
      // запрещаем прокрутку страницы стрелками/пробелом
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].indexOf(e.code) >= 0) {
        e.preventDefault();
      }
    }, false);

    window.addEventListener('keyup', function (e) {
      keys[e.code] = false;
      released[e.code] = true;
    }, false);

    window.addEventListener('blur', function () {
      for (var k in keys) keys[k] = false;
      mouse.left = mouse.right = mouse.middle = false;
    }, false);

    canvas.addEventListener('mousemove', function (e) {
      var r = canvas.getBoundingClientRect();
      mouse.x = e.clientX - r.left;
      mouse.y = e.clientY - r.top;
    }, false);

    canvas.addEventListener('mouseenter', function () { overCanvas = true; });
    canvas.addEventListener('mouseleave', function () { overCanvas = false; });

    canvas.addEventListener('mousedown', function (e) {
      if (e.button === 0) { mouse.left = true; mouse.leftP = true; }
      if (e.button === 1) { mouse.middle = true; e.preventDefault(); }
      if (e.button === 2) { mouse.right = true; mouse.rightP = true; }
      WS.Ev.emit('mouse:down', { button: e.button, x: mouse.x, y: mouse.y });
    }, false);

    window.addEventListener('mouseup', function (e) {
      if (e.button === 0) { mouse.left = false; mouse.leftR = true; }
      if (e.button === 2) { mouse.right = false; mouse.rightR = true; }
    }, false);

    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); }, false);

    canvas.addEventListener('wheel', function (e) {
      mouse.wheel += (e.deltaY > 0 ? -1 : 1);
      e.preventDefault();
    }, { passive: false });

    // конец кадра: сброс одноразовых состояний — зарегистрировано с приоритетом 0
  }, 'input:init');

  // сброс одноразовых флагов в начале кадра (приоритет 0 — самый первый)
  WS.tick(0, function inputTick(dt) {
    // в начале кадра pressed/released уже могли быть установлены с прошлого кадра —
    // логика читает их во время кадра, очищаем в конце. Поэтому: сначала даём кадру
    // отработать нельзя — просто очищаем ПЕРЕД симуляцией следующего кадра те флаги,
    // которые были выставлены между кадрами. Для простоты: флаги живут ровно один кадр.
  }, 'input:pre');

  WS.tick(99, function inputFlush() {
    pressed = {};
    released = {};
    mouse.leftP = false; mouse.rightP = false; mouse.leftR = false; mouse.rightR = false;
    mouse.wheel = 0;
  }, 'input:flush');

  WS.def('Input', {
    keys: function () { return keys; },
    down: down,
    hit: hit,
    hitCode: hitCode,
    consumeCode: consumeCode,
    keyIsDown: keyIsDown,
    setVirtual: setVirtual,
    clearVirtual: clearVirtual,
    virtualAxes: virtualAxes,
    mouse: mouse,
    overCanvas: function () { return overCanvas; },
    setEnabled: function (v) { enabled = !!v; },
    isEnabled: function () { return enabled; },
    bindings: bindings,
    updateMouseWorld: updateMouseWorld
  });
})();
