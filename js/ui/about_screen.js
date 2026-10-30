/**
 * ЭКРАН «ОБ ИГРЕ»: титры, идеалы проекта, управление, версии.
 * Полноэкранный, из главного меню и паузы.
 */
(function () {
  'use strict';

  var el = null;

  var CREDITS = [
    { role: 'Мир и генерация', who: 'studioigor pipeline · агенты' },
    { role: 'Системы выживания', who: 'studioigor pipeline · агенты' },
    { role: 'ИИ зверей и людей', who: 'studioigor pipeline · агенты' },
    { role: 'Интерфейс', who: 'studioigor pipeline · агенты' },
    { role: 'Тексты, записки, радио', who: 'studioigor pipeline · агенты' },
    { role: 'Спрайты и анимация', who: 'процедурная кисть · 300+ спрайтов' },
    { role: 'Звук и музыка', who: 'Web Audio · синтез без файлов' },
    { role: 'Идея и требования', who: 'заказчик' },
    { role: 'Пайплайн', who: 'studioigor-skill' }
  ];

  var ABOUT = [
    '«Белое Безмолвие» — изометрический сурвайвл о зимовке на Русском Севере',
    '1917 года. Ни зомби, ни фантастики: только холод, зверь и человек.',
    '',
    'До весеннего парохода — шестьдесят дней. Полярная ночь наступит на',
    'сорок четвёртый. У каждой смерти — имя и эпитафия.',
    '',
    'Вдохновение: Project Zomboid, The Long Dark, Джек Лондон, поморский сказ.'
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
