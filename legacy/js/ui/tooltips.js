/**
 * tooltips.js — ОБЩИЕ ТУЛТИПЫ (модуль D2): движок всплывающих подсказок для
 * всех окон игрока (инвентарь / крафт / контейнер), построитель предметного
 * описания (имя, категория, статы, свежесть, износ) и кэш иконок-картинок
 * (dataURL из спрайтов WS.Spr — рисует их inventory_screen.js и craft_screen.js).
 * Наведение — делегированием: любой элемент с атрибутом data-tt и свойством
 * _tt (готовый HTML) получает подсказку у курсора. Связи: все экраны D2,
 * css/panels.css (расширение .ws-tooltip из base.css).
 */
(function () {
  'use strict';

  // ====================================================================
  //  НАСТРОЙКИ И КОНСТАНТЫ
  // ====================================================================

  var SHOW_DELAY = 130;      // задержка перед показом, мс
  var HIDE_DELAY = 90;       // задержка перед скрытием, мс
  var OFFSET_X = 16;         // отступ подсказки от курсора
  var OFFSET_Y = 18;
  var MARGIN = 8;            // запас от краёв окна браузера
  var ICON_SIZE = 48;        // крупный размер иконки в подсказке, px

  /** Русские имена категорий (совпадают с CAT_ORDER в inventory.js). */
  var CAT_RU = {
    tool: 'Инструменты', weapon: 'Оружие', ranged: 'Огнестрел',
    ammo: 'Боеприпасы', light: 'Свет', fuel: 'Топливо',
    med: 'Медицина', food: 'Еда', drink: 'Питьё',
    cloth: 'Одежда', material: 'Материалы', book: 'Книги',
    container: 'Тара', misc: 'Разное'
  };

  /** Порядок категорий в сетке инвентаря (как в WS.Inv.sort). */
  var CAT_ORDER = ['tool', 'weapon', 'ranged', 'ammo', 'light', 'fuel',
                   'med', 'food', 'drink', 'cloth', 'material', 'book',
                   'container', 'misc'];

  /** Русские имена слотов экипировки. */
  var SLOT_RU = {
    head: 'голова', torso: 'торс', legs: 'ноги', feet: 'обувь',
    hands: 'кисти', back: 'спина', hand1: 'рука I', hand2: 'рука II'
  };

  /** Русские имена навыков. */
  var SKILL_RU = {
    axe: 'работа топором', melee: 'драка', firearm: 'стрельба',
    sneak: 'крадучесть', run: 'бег', cook: 'готовка',
    carpentry: 'столярное дело', tailor: 'портняжное дело',
    medic: 'медицина', forage: 'сбор', track: 'следопыт',
    survive: 'выживание'
  };

  /** Человекочитаемые теги предметов (показываем не все, а знакомые). */
  var TAG_RU = {
    edible: 'съедобно', drinkable: 'можно пить', perishable: 'портится',
    cookable: 'можно готовить', firestarter: 'розжиг огня', tinder: 'растопка',
    fuel_wood: 'топливо', digging: 'копает', chopping: 'рубит',
    cutting: 'режет', skinning: 'свежевание', sewing: 'шитьё',
    fishing: 'рыбалка', weapon: 'можно в руки', bait: 'наживка',
    wolf_bait: 'приманка на волка', readable: 'читается',
    waterproof: 'не промокает', noise_scare: 'пугает зверя'
  };

  // ====================================================================
  //  СОСТОЯНИЕ
  // ====================================================================

  var el = null;            // корневой div.ws-tooltip
  var visible = false;      // показан ли сейчас
  var curTarget = null;     // элемент, над которым курсор (или null)
  var showTimer = 0;
  var hideTimer = 0;
  var mx = 0, my = 0;      // последняя позиция мыши

  var urlCache = {};        // "name|size" -> dataURL (иконки-картинки)

  // ====================================================================
  //  МАЛЫЕ ХЕЛПЕРЫ
  // ====================================================================

  /** Экранирование HTML. */
  function esc(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** Определение предмета по id (или null). */
  function defOf(id) {
    return (WS.Data && WS.Data.items && WS.Data.items[id]) || null;
  }

  /** Человекочитаемое имя предмета: WS.Inv.nameOf -> id. */
  function nameOf(id) {
    if (WS.Inv && WS.Inv.nameOf) {
      try { return WS.Inv.nameOf(id); } catch (e) { /* ниже */ }
    }
    return id;
  }

  /** Русское имя категории. */
  function catRu(cat) {
    return CAT_RU[cat] || cat || 'Разное';
  }

  /** Округление до 2 знаков. */
  function n2(v) { return Math.round(v * 100) / 100; }

  /** Подъём по дереву: ближайший предок с селектором (замена closest). */
  function up(node, selAttr) {
    var cur = node;
    while (cur && cur !== document) {
      if (cur.getAttribute && cur.getAttribute(selAttr)) return cur;
      cur = cur.parentNode;
    }
    return null;
  }

  // ====================================================================
  //  СТАТЫ ПРЕДМЕТА — список строк для подсказки/детальной панели
  // ====================================================================

  function statLines(def) {
    var out = [];
    if (!def) return out;
    var i;

    // --- еда и питьё ---
    if (def.cal && def.cal > 0) out.push('Питательность: ' + def.cal + ' ккал');
    if (def.thir) out.push('Жажда: ' + (def.thir > 0 ? '+' : '') + def.thir);
    if (def.sick) out.push('Риск отравления: ' + def.sick + '%');
    if (def.heal) out.push('Заживляет: +' + def.heal + ' здоровья');
    if (def.stopBleed) out.push('Останавливает кровь');
    if (def.painkill) out.push('Обезболивает: ' + def.painkill);
    if (def.drunk) out.push('Хмелесть: +' + def.drunk);

    // --- холодное оружие / инструменты ---
    if (def.dmg) out.push('Урон: ' + def.dmg);
    if (def.range) out.push('Дальность: ' + n2(def.range) + ' м');
    if (def.atkSpd) out.push('Скорость атаки: ' + n2(def.atkSpd));
    if (def.knock) out.push('Отбрасывание: ' + def.knock);
    if (def.crit) out.push('Крит. удар: ' + def.crit + '%');
    if (def.twoHand) out.push('Двуручное');

    // --- огнестрел ---
    if (def.ranged) {
      out.push('Огнестрельное');
      if (def.ammo) out.push('Боеприпас: ' + nameOf(def.ammo));
      if (def.mag) out.push('Магазин: ' + def.mag + ' патр.');
      if (def.accuracy) out.push('Точность: ' + def.accuracy + '%');
      if (def.noise) out.push('Шум: ' + def.noise);
    }

    // --- одежда ---
    if (def.slots && def.slots.length) {
      var sn = [];
      for (i = 0; i < def.slots.length; i++) {
        sn.push(SLOT_RU[def.slots[i]] || def.slots[i]);
      }
      out.push('Надевается: ' + sn.join(', '));
    }
    if (def.warm) out.push('Тепло: +' + def.warm);
    if (def.wind) out.push('Ветрозащита: ' + def.wind + '%');
    if (def.wet) out.push('Влагостойкость: ' + def.wet + '%');
    if (def.def) out.push('Защита: ' + def.def);
    if (def.carry) out.push('Поклажа: +' + def.carry + ' кг');

    // --- свет и топливо ---
    if (def.light) out.push('Свет: радиус ' + def.light);
    if (def.fuelH) out.push('Горит: ' + n2(def.fuelH) + ' ч');
    if (def.fuel) out.push('Топливо: ' + nameOf(def.fuel));

    // --- книги и наборы ---
    if (def.skill) out.push('Обучает: ' + (SKILL_RU[def.skill] || def.skill));
    if (def.pages) out.push('Страниц: ' + def.pages);
    if (def.uses) out.push('Запас: ' + def.uses + ' ед.');

    // --- складывание ---
    if (def.stack && def.stack > 1) out.push('Складывается: до ' + def.stack);

    // --- знакомые теги (короткой строкой) ---
    if (def.tags && def.tags.length) {
      var tt = [];
      for (i = 0; i < def.tags.length; i++) {
        var t = TAG_RU[def.tags[i]];
        if (t) tt.push(t);
      }
      if (tt.length) out.push('Свойства: ' + tt.slice(0, 4).join(', '));
    }
    return out;
  }

  // ====================================================================
  //  СВЕЖЕСТЬ ЕДЫ
  //  per (дней годности) и age (возраст стопки в днях): цвет и подпись.
  //  Возвращает {cls: 'ok'|'mid'|'bad', label, left, ratio} или null.
  // ====================================================================

  function freshness(per, age) {
    per = per || 0;
    age = age || 0;
    if (per <= 0) return null;
    var left = per - age;
    if (left <= 0) {
      return { cls: 'bad', left: 0, ratio: 0,
               label: 'Испортилось — есть опасно!' };
    }
    var ratio = left / per;             // 1 = свежее, 0 = на исходе
    if (ratio <= 0.35) {
      return { cls: 'mid', left: left, ratio: ratio,
               label: 'Увядает: осталось ~' + left + ' дн.' };
    }
    return { cls: 'ok', left: left, ratio: ratio,
             label: 'Свежее: ещё ' + left + ' дн.' };
  }

  // ====================================================================
  //  ПРЕДМЕТНОЕ ОПИСАНИЕ (HTML)
  //  o: {id, name?, count?, cond?, per?, age?, spoiled?} — остальные поля
  //  добираются из определения предмета. Используют все три экрана.
  // ====================================================================

  function itemHtml(o) {
    if (!o || !o.id) return '';
    var def = defOf(o.id);
    var name = o.name || nameOf(o.id);
    var count = (typeof o.count === 'number' && o.count > 1) ? o.count : 0;
    var h = '';

    // шапка: уникальная иконка предмета слева + имя и категория справа
    var iu = (def && WS.Icons && WS.Icons.iconUrl(o.id, ICON_SIZE)) || '';
    if (iu) {
      h += '<div class="tt-head"><img class="tt-ico-big" src="' + iu + '" alt="">' +
           '<div class="tt-head-txt"><div class="tt-name">' + esc(name);
      if (count) h += ' <span class="tt-count">×' + count + '</span>';
      h += '</div>';
      h += '<div class="tt-cat"><img src="' + iconUrl('icon_' + (def.cat || 'misc')) +
           '" alt=""> ' + esc(catRu(def.cat)) + '</div></div></div>';
    } else {
      // имя и количество
      h += '<div class="tt-name">' + esc(name);
      if (count) h += ' <span class="tt-count">×' + count + '</span>';
      h += '</div>';
      if (def) {
        h += '<div class="tt-cat"><img src="' + iconUrl('icon_' + (def.cat || 'misc')) +
             '" alt=""> ' + esc(catRu(def.cat)) + '</div>';
      }
    }

    if (def) {
      // статы
      var lines = statLines(def);
      if (lines.length) {
        h += '<div class="tt-stats">';
        for (var i = 0; i < lines.length; i++) {
          h += '<div>' + esc(lines[i]) + '</div>';
        }
        h += '</div>';
      }

      // свежесть (цветная строка)
      var fr = freshness(def.per || 0, o.age || 0);
      if (fr) {
        h += '<div class="tt-fresh tt-fresh-' + fr.cls + '">' + esc(fr.label) + '</div>';
      }

      // вес стопки и штуки
      if (typeof def.w === 'number' && def.w >= 0) {
        h += '<div class="tt-w">Вес: ' + n2(def.w * (count || 1)) + ' кг';
        if (count && def.w > 0) h += ' (штука: ' + n2(def.w) + ' кг)';
        h += '</div>';
      }
    }

    // состояние (износ)
    if (typeof o.cond === 'number') {
      var c = Math.max(0, Math.min(100, Math.round(o.cond)));
      h += '<div class="tt-cond">Состояние: ' + c + '%</div>';
    }

    return h;
  }

  /** Простое описание из заголовка и строк (для рецептов, слотов и пр.). */
  function plainHtml(title, lines, foot) {
    var h = '<div class="tt-name">' + esc(title) + '</div>';
    if (lines && lines.length) {
      h += '<div class="tt-stats">';
      for (var i = 0; i < lines.length; i++) h += '<div>' + esc(lines[i]) + '</div>';
      h += '</div>';
    }
    if (foot) h += '<div class="tt-desc">' + esc(foot) + '</div>';
    return h;
  }

  // ====================================================================
  //  ИКОНКИ: dataURL из спрайтов WS.Spr (кэш)
  //  Спрайты icon_* объявляет inventory_screen.js, st_* — craft_screen.js.
  // ====================================================================

  /** URL картинки спрайта (рисуем в canvas и запоминаем dataURL). */
  function iconUrl(name, size) {
    if (!WS.Spr || !WS.Spr.get) return '';
    var sp = null;
    try { sp = WS.Spr.get(name); } catch (e) { return ''; }
    if (!sp) return '';
    size = size || sp.width || 24;
    var key = name + '|' + size;
    if (urlCache[key]) return urlCache[key];
    try {
      var cv = document.createElement('canvas');
      cv.width = size; cv.height = size;
      var c = cv.getContext('2d');
      c.imageSmoothingEnabled = false;
      c.drawImage(sp, 0, 0, sp.width, sp.height, 0, 0, size, size);
      var url = cv.toDataURL('image/png');
      urlCache[key] = url;
      return url;
    } catch (e2) {
      return '';
    }
  }

  /** Иконка категории предмета как <img> (или пустой span). */
  function catIconNode(cat, cls) {
    return iconNode('icon_' + (cat || 'misc'), cls);
  }

  /** Готовый <img> спрайта (каждый вызов — новый узел, можно в DOM). */
  function iconNode(name, cls) {
    var url = iconUrl(name);
    if (!url) {
      var s = document.createElement('span');
      s.className = 'no-ico';
      return s;
    }
    var img = document.createElement('img');
    img.src = url;
    img.alt = '';
    if (cls) img.className = cls;
    return img;
  }

  // ====================================================================
  //  ДВИЖОК ПОДСКАЗОК
  // ====================================================================

  /** Создать корневой элемент (лениво, один на страницу). */
  function ensure() {
    if (el) return;
    el = document.createElement('div');
    el.className = 'ws-tooltip hidden';
    document.body.appendChild(el);
  }

  /** Поставить подсказку у точки (x, y), не вылезая за экран. */
  function place(x, y) {
    if (!el) return;
    el.style.left = '0px';
    el.style.top = '0px';
    var w = el.offsetWidth || 220;
    var h = el.offsetHeight || 60;
    var vw = window.innerWidth || 1280;
    var vh = window.innerHeight || 720;
    var nx = x + OFFSET_X;
    var ny = y + OFFSET_Y;
    if (nx + w + MARGIN > vw) nx = x - w - OFFSET_X;      // не влезает справа — влево
    if (nx < MARGIN) nx = MARGIN;
    if (ny + h + MARGIN > vh) ny = y - h - OFFSET_Y;      // не влезает снизу — вверх
    if (ny < MARGIN) ny = MARGIN;
    el.style.left = Math.round(nx) + 'px';
    el.style.top = Math.round(ny) + 'px';
  }

  /**
   * ПУБЛИЧНО: показать подсказку с HTML у точки (x, y).
   */
  function show(x, y, html) {
    ensure();
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = 0; }
    if (!html) { hide(); return; }
    el.innerHTML = html;
    el.classList.remove('hidden');
    visible = true;
    place(x, y);
  }

  /** ПУБЛИЧНО: скрыть подсказку. */
  function hide() {
    if (showTimer) { clearTimeout(showTimer); showTimer = 0; }
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = 0; }
    if (!el || !visible) return;
    el.classList.add('hidden');
    visible = false;
    curTarget = null;
  }

  /** ПУБЛИЧНО: видима ли подсказка. */
  function isVisible() { return visible; }

  /**
   * ПУБЛИЧНО: привязать HTML к элементу (наведение покажет его).
   * Перепривязка обновляет содержимое без снятия наведения.
   */
  function bind(node, html) {
    if (!node) return;
    node.setAttribute('data-tt', '1');
    node._tt = html;
  }

  /** ПУБЛИЧНО: снять привязку. */
  function unbind(node) {
    if (!node) return;
    node.removeAttribute('data-tt');
    try { delete node._tt; } catch (e) { node._tt = undefined; }
    if (curTarget === node) hide();
  }

  // --------------------------------------------------------------------
  //  Делегированное наведение: mouseover/mouseout/mousemove на document.
  //  Подсказка следует за курсором, пока он над тем же элементом.
  // --------------------------------------------------------------------

  function onOver(e) {
    var t = up(e.target, 'data-tt');
    if (!t || !t._tt) return;
    if (t === curTarget) return;         // переход внутри того же элемента
    curTarget = t;
    if (showTimer) clearTimeout(showTimer);
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = 0; }
    showTimer = setTimeout(function () {
      showTimer = 0;
      if (curTarget === t && t._tt) show(mx, my, t._tt);
    }, SHOW_DELAY);
  }

  function onOut(e) {
    var t = up(e.target, 'data-tt');
    if (!t) return;
    if (t !== curTarget) return;
    // курсор ушёл с цели: дать шанс вернуться (HIDE_DELAY) и скрыть
    if (showTimer) { clearTimeout(showTimer); showTimer = 0; }
    hideTimer = setTimeout(function () {
      hideTimer = 0;
      hide();
    }, HIDE_DELAY);
  }

  function onMove(e) {
    mx = e.clientX || (e.pageX || 0);
    my = e.clientY || (e.pageY || 0);
    if (visible) place(mx, my);
  }

  // ====================================================================
  //  САМОТЕСТ (консоль разработчика: WS.ToolTip.selftest())
  // ====================================================================

  function selftest() {
    var out = [];
    var pass = 0, fail = 0;
    function ok(name, cond) {
      if (cond) { pass++; out.push('  ok   ' + name); }
      else { fail++; out.push('  FAIL ' + name); }
      return !!cond;
    }

    ok('модуль зарегистрирован', !!WS.ToolTip);
    ok('esc экранирует', esc('<a&"b>') === '&lt;a&amp;&quot;b&gt;');
    ok('catRu знает категории', catRu('food') === 'Еда' && catRu('zzz') === 'zzz');
    ok('freshness: свежая еда', !!(freshness(6, 1) && freshness(6, 1).cls === 'ok'));
    ok('freshness: увядание', !!(freshness(6, 5) && freshness(6, 5).cls === 'mid'));
    ok('freshness: порча', !!(freshness(6, 7) && freshness(6, 7).cls === 'bad'));
    ok('freshness: не портится', freshness(0, 10) === null);
    ok('statLines без def пуст', statLines(null).length === 0);

    var bread = defOf('bread');
    if (bread) {
      var lines = statLines(bread);
      ok('статы хлеба не пусты', lines.length >= 2);
    } else {
      out.push('  --   хлеба нет в данных (модуль данных не загружен?)');
    }

    ok('itemHtml без предмета пуст', itemHtml(null) === '');
    ok('plainHtml собирает строку', plainHtml('X', ['a'], 'b').indexOf('tt-name') > 0);

    out.unshift('tooltip.selftest: ' + pass + ' ок, ' + fail + ' провалено');
    return out;
  }

  // ====================================================================
  //  ПУБЛИЧНЫЙ API
  // ====================================================================

  WS.def('ToolTip', {
    // --- движок ---
    show: show,
    hide: hide,
    isVisible: isVisible,
    bind: bind,
    unbind: unbind,

    // --- содержимое ---
    itemHtml: itemHtml,
    plainHtml: plainHtml,
    statLines: statLines,
    freshness: freshness,

    // --- иконки ---
    iconUrl: iconUrl,
    iconNode: iconNode,
    catIconNode: catIconNode,

    // --- словари и утилиты (общие для экранов) ---
    esc: esc,
    CAT_RU: CAT_RU,
    CAT_ORDER: CAT_ORDER,
    SLOT_RU: SLOT_RU,
    SKILL_RU: SKILL_RU,

    selftest: selftest
  });

  // ====================================================================
  //  BOOT: слушатели наведения (делегирование на весь документ)
  // ====================================================================

  WS.boot(function initTooltips() {
    document.addEventListener('mouseover', onOver, false);
    document.addEventListener('mouseout', onOut, false);
    document.addEventListener('mousemove', onMove, false);
    // при закрытии окон экраны зовут hide() сами; на всякий случай —
    // прокрутка/зум тоже прячет подсказку (позиция устарела)
    window.addEventListener('blur', function () { hide(); }, false);
    WS.log('tooltip: подсказки зарегистрированы (делегирование document)');
  }, 'tooltip:init');

})();
