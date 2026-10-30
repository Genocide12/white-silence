/**
 * ЭКРАН «ОБ ИГРЕ»: титры, идеалы проекта, управление, версии.
 * Полноэкранный, из главного меню и паузы.
 */
(function () {
  'use strict';

  var el = null;

  var CREDITS = [
    { role: 'Идея, код, спрайты, звук', who: 'DirtyG — автор игры' },
    { role: 'Мир и генерация', who: 'процедурный движок · зерно 1917' },
    { role: 'Системы деда', who: 'ХП-часы, Древо Мудрости, изгнания' },
    { role: 'ИИ зверей и людей', who: 'волки, медведи, бандиты · мультяшки' },
    { role: 'Интерфейс', who: 'Canvas 2D + DOM' },
    { role: 'Тексты, записки, радио', who: 'лесная библиотека · 100к строк' },
    { role: 'Спрайты и анимация', who: 'процедурная кисть · 300+ спрайтов' },
    { role: 'Звук и музыка', who: 'Web Audio · синтез без файлов' }
  ];

  var ABOUT = [
    '«БЕЛОЕ БЕЗМОЛВИЕ: БЕЗУМНЫЙ ДЕД» — сумасшедший дед живёт один в лесу.',
    'Грибы стёрли ему мозг начисто: он видит мультяшные галлюцинации, думает,',
    'что владеет магией, и «изгоняет» зверей лодошкой и вантузом — после чего',
    'они превращаются в подарки с полезными вещами.',
    '',
    'Деду не нужна еда, вода и тепло. Но его ХП тает с каждым днём: если за',
    '60 дней не разжечь Магический Огонь и не дождаться тарелки — дед уснёт',
    'навсегда. «Смерть» в бою — просто прикорнуть на месте с половиной ХП.',
    'Косяк деда восстанавливает здоровье полностью. Всё по-взрослому.',
    '',
    'Прокачивай Древо Мудрости (T), собирай грибную энергию, изгоняй',
    'мультяшек и улетай на тарелке. Автор игры — DirtyG.'
  ];

  var VERSIONS = [
    { v: '1.0', d: 'Релиз на шестьдесят дней зимы.' }
  ];

  function build() {
    if (el) return el;
    var root = document.getElementById('ui-root');
    if (!root) return null;

    el = document.createElement('div');
    el.id = 'ws-about';
    el.className = 'ws-panel ws-about hidden';

    var title = document.createElement('div');
    title.className = 'ws-about-title';
    title.textContent = 'БЕЛОЕ БЕЗМОЛВИЕ';
    el.appendChild(title);

    var sub = document.createElement('div');
    sub.className = 'ws-about-sub';
    sub.textContent = 'Русский Север · зима 1917 · ' + (WS.VERSION || '1.0');
    el.appendChild(sub);

    var hr1 = document.createElement('div');
    hr1.className = 'ws-about-hr';
    el.appendChild(hr1);

    for (var i = 0; i < ABOUT.length; i++) {
      var line = document.createElement('div');
      line.className = 'ws-about-line' + (ABOUT[i] === '' ? ' empty' : '');
      line.textContent = ABOUT[i];
      el.appendChild(line);
    }

    var hr2 = document.createElement('div');
    hr2.className = 'ws-about-hr';
    el.appendChild(hr2);

    var credTitle = document.createElement('div');
    credTitle.className = 'ws-title';
    credTitle.textContent = 'СОЗДАНО';
    el.appendChild(credTitle);

    var table = document.createElement('div');
    table.className = 'ws-about-credits';
    for (var c = 0; c < CREDITS.length; c++) {
      var row = document.createElement('div');
      row.className = 'ws-about-credit-row';
      var role = document.createElement('span');
      role.className = 'ws-about-role';
      role.textContent = CREDITS[c].role;
      var who = document.createElement('span');
      who.className = 'ws-about-who';
      who.textContent = CREDITS[c].who;
      row.appendChild(role);
      row.appendChild(who);
      table.appendChild(row);
    }
    el.appendChild(table);

    var stat = document.createElement('div');
    stat.className = 'ws-about-stat';
    stat.textContent = '95 000 строк кода · 447 предметов · 300+ спрайтов · 0 зависимостей';
    el.appendChild(stat);

    var ver = document.createElement('div');
    ver.className = 'ws-about-ver';
    ver.textContent = 'Версия 1.0 — «Шестьдесят дней»';
    el.appendChild(ver);

    var close = document.createElement('button');
    close.className = 'ws-btn primary';
    close.textContent = 'Закрыть';
    close.addEventListener('click', hide);
    el.appendChild(close);

    root.appendChild(el);
    return el;
  }

  function show() {
    build();
    if (!el) return;
    el.classList.remove('hidden');
  }

  function hide() {
    if (el) el.classList.add('hidden');
  }

  function toggle() {
    if (el && !el.classList.contains('hidden')) hide();
    else show();
  }

  WS.boot(function initAbout() {
    // «Об игре» из меню: слушаем клики по кнопкам с этим текстом
    document.addEventListener('click', function (e) {
      var t = e.target && e.target.textContent ? e.target.textContent.trim() : '';
      if (t === 'Об игре' || t === 'About') {
        setTimeout(show, 50);
      }
    }, true);
  }, 'about:init');

  WS.def('About', {
    show: show,
    hide: hide,
    toggle: toggle,
    CREDITS: CREDITS
  });
})();
