/**
 * menu.js — стартовый экран (модуль D1): «БЕЛОЕ БЕЗМОЛВИЕ», выбор профессии
 * (6 карточек) и черт (до 3 сильных + ровно 2 слабости), кнопки «Начать» /
 * «Продолжить» / «Как играть» / «Об игре». Здесь же объявлены таблицы
 * WS.Data.professions и WS.Data.traits.
 * Связи: WS.Main.newGame/loadGame, WS.Save.exists, WS.State.deathSummary,
 * WS.Inv.give (стартовый груз), WS.Skills. НЕ регистрирует ничего в WS.Ui:
 * ядро UI — параллельный агент D4 (ui.js). ДОГОВОР: корень этого меню —
 * <div id="ws-menu"> — D4.Ui.showMenu() находит его по id и показывает
 * вместо своего запасного меню; скрывает по классу .hidden (как и мы сами).
 */
(function () {
  'use strict';

  // ====================================================================
  //  ДАННЫЕ: ПРОФЕССИИ
  //  items: [{id, n}] — стартовый груз; skills: {id: lv} — стартовые уровни.
  //  Регистрируются в WS.Data.professions при boot (контракт CONTRACT.md).
  // ====================================================================

  // СТАРТОВАЯ ОДЕЖДА (фикс: раньше все профессии начинали РАЗДЕТЫМИ —
  // «в кармане шинели» было только в описании, и на −14° герой замерзал
  // за два игровых часа до первого шкафа). Теперь каждый одет по чину.
  var PROFESSIONS = [
    {
      id: 'telegraph',
      name: 'Телеграфист',
      desc: 'Служащий станции у посёлка. Начитан, аккуратен, непривычен к морозу. ' +
            'Стартует у вокзала — в шинели и валенках, с книгой выживания и спичками.',
      items: [
        { id: 'coat_cloth', n: 1 },
        { id: 'ushanka', n: 1 },
        { id: 'valenki', n: 1 },
        { id: 'book_survive', n: 1 },
        { id: 'matches', n: 8 },
        { id: 'water_flask', n: 1 },
        { id: 'rusk', n: 4 }
      ],
      skills: { survive: 1 }
    },
    {
      id: 'hunter',
      name: 'Охотник',
      desc: 'Таёжный промысловик. Ружьё, патроны и охотничий нож — а главное, ' +
            'умение читать следы и стрелять. Мороз для него — работа.',
      items: [
        { id: 'coat_fur', n: 1 },
        { id: 'ushanka', n: 1 },
        { id: 'valenki', n: 1 },
        { id: 'rifle_mosin', n: 1 },
        { id: 'rifle_round', n: 12 },
        { id: 'hunting_knife', n: 1 }
      ],
      skills: { track: 2, firearm: 2 }
    },
    {
      id: 'carpenter',
      name: 'Плотник',
      desc: 'Мастеровой с лесопилки. Топор, гвозди, доски — из них он построит ' +
            'и забор от волка, и лежанку у печи.',
      items: [
        { id: 'chuika', n: 1 },
        { id: 'kartuz', n: 1 },
        { id: 'valenki', n: 1 },
        { id: 'axe', n: 1 },
        { id: 'nails', n: 24 },
        { id: 'plank', n: 6 }
      ],
      skills: { carpentry: 2 }
    },
    {
      id: 'cook',
      name: 'Кухарка',
      desc: 'Стряпала при постоялом дворе. Знает, как из костей и топлёного сала ' +
            'сделать сытный ужин, и всегда носит с собой чай.',
      items: [
        { id: 'poddevka', n: 1 },
        { id: 'kartuz', n: 1 },
        { id: 'valenki', n: 1 },
        { id: 'bread', n: 2 },
        { id: 'kasha', n: 1 },
        { id: 'tea_brick', n: 2 },
        { id: 'salt_bag', n: 1 },
        { id: 'matches', n: 4 }
      ],
      skills: { cook: 2 }
    },
    {
      id: 'medic',
      name: 'Фельдшер',
      desc: 'Медичка с земской станции. Бинты, йод, аспирин и морфий — и умение ' +
            'вправить ногу в метель. Книгу читала не для развлечения.',
      items: [
        { id: 'chuika', n: 1 },
        { id: 'kartuz', n: 1 },
        { id: 'valenki', n: 1 },
        { id: 'bandage', n: 4 },
        { id: 'bandage_clean', n: 2 },
        { id: 'iodine_tincture', n: 2 },
        { id: 'aspirin', n: 6 },
        { id: 'morphine', n: 1 }
      ],
      skills: { medic: 2 }
    },
    {
      id: 'convict',
      name: 'Беглый каторжник',
      desc: 'Ни вещей, ни имени — только крепкие кулаки и привычка убегать. ' +
            'Зато вынослив как лось и бьёт так, что волк запомнит.',
      items: [
        { id: 'pidzhak_stary', n: 1 },
        { id: 'lapti', n: 1 }
      ],
      skills: { melee: 2, run: 2, sneak: 1 }
    }
  ];

  // ====================================================================
  //  ДАННЫЕ: ЧЕРТЫ
  //  Баланс: до 3 сильных + ровно 2 слабости (обязательно).
  //  effect — короткая механическая расшифровка для карточки; системы
  //  выживания (needs/temperature/health) читают p.traits по этим id.
  // ====================================================================

  var TRAITS = [
    // --- сильные стороны (до 3) ---
    {
      id: 'sleeper', name: 'Крепкий сон', neg: false,
      desc: 'Спит как убитый и просыпается новым человеком.',
      effect: 'сон восстанавливает больше'
    },
    {
      id: 'stomach', name: 'Железный желудок', neg: false,
      desc: 'Сырое, просроченное и «пахнет подозрительно» — не аргумент.',
      effect: 'отравления слабее вдвое'
    },
    {
      id: 'patient', name: 'Терпеливый', neg: false,
      desc: 'Привык ждать. Голод, жажда и усталость подкрадываются медленнее.',
      effect: 'нужды тают на 15% медленнее'
    },
    {
      id: 'eagle', name: 'Зоркий', neg: false,
      desc: 'Замечает блеск жестянки в сугробе и зверя — раньше зверя.',
      effect: 'дальше видит, находит больше'
    },
    {
      id: 'quiet', name: 'Тихий шаг', neg: false,
      desc: 'Ходит по насту так, что снег не скрипит.',
      effect: 'шум шагов −30%'
    },
    {
      id: 'frostproof', name: 'Морозостойкий', neg: false,
      desc: 'Кровь погорячее обычного. Ген хрономёра?',
      effect: 'теплопотери тела −15%'
    },
    // --- слабости (ровно 2 обязательны) ---
    {
      id: 'frail', name: 'Хрупкий', neg: true,
      desc: 'Кости тонкие: удар медведя может стать последним.',
      effect: 'здоровье −20'
    },
    {
      id: 'naive', name: 'Наивный', neg: true,
      desc: 'Людям верит на слово. На Севере это дорого стоит.',
      effect: 'обман и засады страшнее'
    },
    {
      id: 'insomniac', name: 'Плохой сон', neg: true,
      desc: 'Сон тревожный: просыпается чаще, чем высыпается.',
      effect: 'сон восстанавливает меньше'
    },
    {
      id: 'claustro', name: 'Клаустрофобия', neg: true,
      desc: 'Замкнутые комнаты давят на рассудок.',
      effect: 'рассудок падает в помещениях'
    },
    {
      id: 'shaky', name: 'Дрожащие руки', neg: true,
      desc: 'С детства трясутся: промах там, где нужен глаз.',
      effect: 'точность −10%'
    },
    {
      id: 'dull', name: 'Тупица', neg: true,
      desc: 'Учиться тяжело. Опыт идёт со скрипом.',
      effect: 'опыт −20%'
    }
  ];

  var MAX_POS = 3;       // максимум сильных черт
  var NEED_NEG = 2;      // ровно столько слабостей обязателно

  // ====================================================================
  //  ЭПИГРАФЫ
  //  Под заголовком при каждом показе мелькает новый — настроение
  //  без сюжета: Север говорит сам за себя.
  // ====================================================================

  var EPIGRAPHS = [
    '«Зима спросит — ответишь молчанием.»',
    '«Здесь не холодно. Здесь — минус.»',
    '«Пурга не злится. Пурга работает.»',
    '«Снег помнит каждый шаг. И прощает только весне.»',
    '«Тепло — не право. Тепло — заслуга.»',
    '«Девять месяцев зима, остальное — подготовка к ней.»',
    '«Мороз не бегает за людьми. Он просто ждёт.»',
    '«В тундре нет свидетелей. Есть выжившие.»',
    '«Пароход придёт весной. Сначала дожить до весны.»',
    '«Тишина здесь — не отсутствие звука. Она сама звук.»'
  ];

  // ====================================================================
  //  УТИЛИТЫ DOM
  // ====================================================================

  function el(tag, cls, parent) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (parent) parent.appendChild(e);
    return e;
  }

  function setText(e, txt) {
    if (!e || e._txt === txt) return;
    e._txt = txt;
    e.textContent = txt;
  }

  function showEl(e) { if (e && e.classList.contains('hidden')) e.classList.remove('hidden'); }
  function hideEl(e) { if (e && !e.classList.contains('hidden')) e.classList.add('hidden'); }

  /** Тихий клик интерфейса. */
  function snd(name) {
    try { if (WS.Snd && WS.Snd.play) WS.Snd.play(name, { vol: 0.5 }); } catch (e) { /* звук не критичен */ }
  }

  /** Имя предмета: через инвентарь (I18N), иначе id. */
  function itemName(id) {
    try {
      if (WS.Inv && WS.Inv.nameOf) {
        var s = WS.Inv.nameOf(id);
        if (s && s !== id) return s;
      }
    } catch (e) { /* ниже */ }
    if (WS.Data && WS.Data.items && WS.Data.items[id] && WS.Data.items[id].name) {
      return WS.Data.items[id].name;
    }
    return id;
  }

  /** Русская подпись навыка. */
  var SKILL_NAME = {
    axe: 'топор', melee: 'дерущийся', firearm: 'стрельба', sneak: 'крадущийся',
    run: 'бег', cook: 'готовка', carpentry: 'столярное', tailor: 'шитьё',
    medic: 'медицина', forage: 'поисковик', track: 'следопыт', survive: 'выживание'
  };

  function skillName(id) { return SKILL_NAME[id] || id; }

  /** Существует ли предмет в реестре (страховка от расхождения датафайлов). */
  function itemKnown(id) {
    return !!(WS.Data && WS.Data.items && WS.Data.items[id]);
  }

  // ====================================================================
  //  DOM МЕНЮ
  //  Корень — <div id="ws-menu"> (договор с D4: его WS.Ui.showMenu()
  //  ищет этот id и показывает меню D1 вместо своего запасного #ws-menu-fb;
  //  скрытие — общий класс .hidden). Снег — 30 div'ов с рандомной анимацией.
  // ====================================================================

  var root = null;            // #ws-menu (договор с D4)
  var built = false;
  var visible = false;
  var els = {};
  var profSel = null;         // id выбранной профессии
  var posSel = {};            // id -> true (сильные черты)
  var negSel = {};            // id -> true (слабости)
  var cardEls = {};           // id профессии -> карточка
  var traitEls = {};          // id черты -> элемент
  var modalOpen = null;       // 'how' | 'about' | null

  function build() {
    if (built) return;
    var uiRoot = document.getElementById('ui-root');
    if (!uiRoot) { WS.err('menu: нет #ui-root'); return; }
    built = true;

    root = el('div', 'menu-wrap hidden');
    root.id = 'ws-menu';
    uiRoot.appendChild(root);

    // --- фоны: тьма, градиент, снег ------------------------------------
    var bg = el('div', 'menu-bg', root);
    var snow = el('div', 'menu-snow', root);
    makeSnow(snow, 30);

    // --- содержимое ------------------------------------------------------
    var wrap = el('div', 'menu-content', root);

    var title = el('h1', 'menu-title', wrap);
    setText(title, 'БЕЛОЕ БЕЗМОЛВИЕ');

    var sub = el('div', 'menu-sub', wrap);
    setText(sub, 'Русский Север. Зима 1917 года. Продержись 60 дней до парохода.');

    // эпиграф: при каждом показе — новый (меняется в show())
    els.epigraph = el('div', 'menu-epigraph', wrap);
    setText(els.epigraph, EPIGRAPHS[0]);

    // баннер смерти (показывается после player:die)
    els.death = el('div', 'menu-death hidden', wrap);
    els.deathCause = el('div', 'menu-death-cause', els.death);
    els.deathStats = el('div', 'menu-death-stats', els.death);

    // --- профессии -------------------------------------------------------
    var secProf = el('div', 'menu-section', wrap);
    var profHead = el('div', 'menu-sec-head', secProf);
    var profTitle = el('div', 'ws-title', profHead);
    setText(profTitle, 'Профессия');
    var profHint = el('div', 'menu-sec-hint', profHead);
    setText(profHint, 'кем вы встретили эту зиму');

    var cards = el('div', 'menu-cards', secProf);
    var i, k;
    for (i = 0; i < PROFESSIONS.length; i++) {
      buildCard(cards, PROFESSIONS[i], i + 1);
    }

    // --- черты ------------------------------------------------------------
    var secTraits = el('div', 'menu-section', wrap);
    var trHead = el('div', 'menu-sec-head', secTraits);
    var trTitle = el('div', 'ws-title', trHead);
    setText(trTitle, 'Черты');
    els.traitHint = el('div', 'menu-sec-hint', trHead);
    setText(els.traitHint, '');

    var tCols = el('div', 'menu-traits-cols', secTraits);
    var colPos = el('div', 'menu-traits-col', tCols);
    var colPosT = el('div', 'menu-traits-col-t pos', colPos);
    setText(colPosT, 'сильные стороны — до ' + MAX_POS);
    var colNeg = el('div', 'menu-traits-col', tCols);
    var colNegT = el('div', 'menu-traits-col-t neg', colNeg);
    setText(colNegT, 'слабости — ровно ' + NEED_NEG + ' (обязательно)');

    for (k = 0; k < TRAITS.length; k++) {
      buildTrait(TRAITS[k].neg ? colNeg : colPos, TRAITS[k]);
    }

    // --- сводка героя: живой предпросмотр выбора --------------------------
    var secHero = el('div', 'menu-hero ws-panel', wrap);
    var heroT = el('div', 'ws-title', secHero);
    setText(heroT, 'Ваш герой');
    els.heroName = el('div', 'menu-hero-name', secHero);
    els.heroTraits = el('div', 'menu-hero-traits', secHero);
    els.heroFlavor = el('div', 'menu-hero-flavor', secHero);
    updateHeroSummary();

    // --- дополнительно: зерно мира ----------------------------------------
    var extra = el('div', 'menu-extra', wrap);
    var exLbl = el('label', 'menu-extra-lbl', extra);
    setText(exLbl, 'зерно мира:');
    els.seed = el('input', 'menu-seed', extra);
    els.seed.type = 'text';
    els.seed.maxLength = 12;
    els.seed.placeholder = 'случайное';
    els.seed.title = 'Одинаковые числа — одинаковый мир. Пусто — случайный мир.';
    var btnRndSeed = el('button', 'ws-btn menu-btn-small', extra);
    setText(btnRndSeed, '⟲ случайное');
    btnRndSeed.addEventListener('click', function () {
      snd('click');
      els.seed.value = String((Math.random() * 1e9) >>> 0);
    });

    // --- сообщения и кнопки ------------------------------------------------
    els.err = el('div', 'menu-err hidden', wrap);

    var actions = el('div', 'menu-actions', wrap);

    els.btnStart = el('button', 'ws-btn primary menu-btn-start', actions);
    setText(els.btnStart, 'Начать');
    els.btnStart.addEventListener('click', onStart);

    els.btnCont = el('button', 'ws-btn', actions);
    setText(els.btnCont, 'Продолжить');
    els.btnCont.addEventListener('click', onContinue);

    var btnRnd = el('button', 'ws-btn', actions);
    setText(btnRnd, 'Случайный герой');
    btnRnd.title = 'Судьба сама выберет профессию и черты.';
    btnRnd.addEventListener('click', onRandomHero);

    // Демо-прохождение: автопилот сам играет партию до парохода (js/ui/demo.js)
    var btnDemo = el('button', 'ws-btn demo-btn', actions);
    setText(btnDemo, '▶ Демо-прохождение');
    btnDemo.title = 'Автопилот сам сыграет всю партию: обыски, костёр, охота, ' +
      'сигнальный огонь и пароход. Смотрите и ищите баги. Журнал — в .txt.';
    btnDemo.addEventListener('click', onDemo);

    var btnHow = el('button', 'ws-btn', actions);
    setText(btnHow, 'Как играть');
    btnHow.addEventListener('click', function () { openModal('how'); });

    var btnAbout = el('button', 'ws-btn', actions);
    setText(btnAbout, 'Об игре');
    btnAbout.addEventListener('click', function () { openModal('about'); });

    // --- подвал ------------------------------------------------------------
    var foot = el('div', 'menu-foot', wrap);
    var ver = 'v' + (WS.VERSION || '1.0.0') + ' · сборка ' + (WS.BUILD || '1917');
    setText(foot, ver + ' · студия «studioigor» · изометрический сурвайвл по мотивам Севера');

    // --- модальные окна (внутри меню) ---------------------------------------
    buildModals(root);

    // Esc закрывает модал (само меню — вход в игру, его Esc не убирает);
    // стрелки/цифры/Enter работают с выбором, R — случайный герой.
    // Видимость смотрим по DOM: D4 может показать/спрятать меню сам,
    // классом .hidden, минуя наши show()/hide().
    document.addEventListener('keydown', function (ev) {
      if (!isShown()) return;
      if (ev.keyCode === 27 && modalOpen) { closeModal(); return; }
      if (modalOpen) return;
      // не отбираем клавиши у поля зерна мира
      if (ev.target && ev.target.tagName === 'INPUT') return;
      onMenuKey(ev);
    });

    refreshTraits();
    refreshStartState();
  }

  /** Снег: n div'ов с рандомными позицией, размером, скоростью. */
  function makeSnow(parent, n) {
    for (var i = 0; i < n; i++) {
      var f = el('div', 'menu-flake', parent);
      var size = 2 + Math.random() * 5;                     // px
      var dur = 7 + Math.random() * 11;                     // сек падения
      var delay = -Math.random() * 18;                       // старт «из середины»
      var sway = 10 + Math.random() * 26;                   // размах сноса
      f.style.left = (Math.random() * 100).toFixed(2) + '%';
      f.style.width = size.toFixed(1) + 'px';
      f.style.height = size.toFixed(1) + 'px';
      f.style.opacity = (0.25 + Math.random() * 0.6).toFixed(2);
      f.style.animationDuration = dur.toFixed(2) + 's';
      f.style.animationDelay = delay.toFixed(2) + 's';
      f.style.setProperty('--sway', sway.toFixed(1) + 'px');
    }
  }

  /** Карточка профессии (num — порядковый номер для клавиши 1..6). */
  function buildCard(parent, prof, num) {
    var card = el('div', 'menu-card ws-panel', parent);
    card.setAttribute('data-id', prof.id);
    card.setAttribute('data-num', num || '·');
    card.title = 'клавиша ' + (num || '·');

    var nm = el('div', 'menu-card-name', card);
    setText(nm, prof.name);

    var ds = el('div', 'menu-card-desc', card);
    setText(ds, prof.desc);

    // груз: компактной строкой; неизвестные предметы — тихо пропускаем
    // (датафайлы идут параллельными агентами, id могут ещё ехать)
    var known = [];
    var unknown = [];
    if (prof.items && prof.items.length) {
      for (var i = 0; i < prof.items.length; i++) {
        var it = prof.items[i];
        if (!itemKnown(it.id)) { unknown.push(it.id); continue; }
        known.push(itemName(it.id) + (it.n > 1 ? ' ×' + it.n : ''));
      }
    }
    if (known.length) {
      var inv = el('div', 'menu-card-items', card);
      setText(inv, known.join(', '));
    } else if (unknown.length) {
      var inv0 = el('div', 'menu-card-items none', card);
      setText(inv0, 'с пустыми руками');
    } else {
      var inv2 = el('div', 'menu-card-items none', card);
      setText(inv2, 'ничего, кроме крепких кулаков');
    }
    if (unknown.length) {
      WS.warn('menu: профессия «' + prof.id + '» ждёт предметы: ' + unknown.join(', '));
    }

    // навыки: чипы
    var sk = prof.skills || {};
    var keys = [];
    for (var k in sk) if (sk.hasOwnProperty(k)) keys.push(k);
    if (keys.length) {
      var chips = el('div', 'menu-card-skills', card);
      for (var j = 0; j < keys.length; j++) {
        var chip = el('span', 'menu-chip', chips);
        setText(chip, skillName(keys[j]) + ' ' + sk[keys[j]]);
      }
    }

    card.addEventListener('click', function () {
      snd('select');
      profSel = (profSel === prof.id) ? null : prof.id;
      refreshCards();
      refreshStartState();
    });
    cardEls[prof.id] = card;
  }

  /** Карточка черты (переключалка). */
  function buildTrait(parent, tr) {
    var box = el('div', 'menu-trait' + (tr.neg ? ' neg' : ''), parent);
    box.setAttribute('data-id', tr.id);

    var head = el('div', 'menu-trait-head', box);
    var mark = el('span', 'menu-trait-mark', head);
    setText(mark, tr.neg ? '−' : '+');
    var nm = el('span', 'menu-trait-name', head);
    setText(nm, tr.name);

    var ds = el('div', 'menu-trait-desc', box);
    setText(ds, tr.desc);

    var eff = el('div', 'menu-trait-effect', box);
    setText(eff, tr.effect);

    box.addEventListener('click', function () {
      snd('click');
      toggleTrait(tr);
    });
    traitEls[tr.id] = box;
  }

  /** Переключить черту с правилами баланса. */
  function toggleTrait(tr) {
    if (tr.neg) {
      if (negSel[tr.id]) delete negSel[tr.id];
      else negSel[tr.id] = true;
    } else {
      if (posSel[tr.id]) {
        delete posSel[tr.id];
      } else {
        var n = countKeys(posSel);
        if (n >= MAX_POS) {
          // лимит: тихий отказ, строка подсказки
          setText(els.traitHint, 'сильных сторон не больше ' + MAX_POS + ' — снимите одну');
          return;
        }
        posSel[tr.id] = true;
      }
    }
    refreshTraits();
    refreshStartState();
  }

  function countKeys(o) {
    var n = 0;
    for (var k in o) if (o.hasOwnProperty(k)) n++;
    return n;
  }

  // ====================================================================
  //  МОДАЛЬНЫЕ ОКНА: «Как играть» и «Об игре»
  //  Свои, внутри меню: WS.Ui.modal() принадлежит D4 и может отсутствовать.
  // ====================================================================

  function buildModals(parent) {
    els.modalWrap = el('div', 'menu-modal-wrap hidden', parent);
    els.modalWrap.addEventListener('click', function (ev) {
      if (ev.target === els.modalWrap) closeModal();
    });

    var box = el('div', 'ws-panel menu-modal', els.modalWrap);
    els.modalTitle = el('div', 'ws-title menu-modal-title', box);
    els.modalBody = el('div', 'menu-modal-body', box);

    var close = el('button', 'ws-btn menu-modal-close', box);
    setText(close, 'Закрыть');
    close.addEventListener('click', function () { closeModal(); });
  }

  function openModal(kind) {
    if (!built) return;
    snd('click');
    modalOpen = kind;
    els.modalBody.textContent = '';

    if (kind === 'how') {
      setText(els.modalTitle, 'Как играть');
      buildHowTo(els.modalBody);
    } else if (kind === 'about') {
      setText(els.modalTitle, 'Об игре');
      buildAbout(els.modalBody);
    }
    showEl(els.modalWrap);
  }

  function closeModal() {
    modalOpen = null;
    hideEl(els.modalWrap);
    snd('click');
  }

  /** Содержимое «Как играть»: управление + первые шаги. */
  function buildHowTo(parent) {
    var p1 = el('p', '', parent);
    p1.textContent = 'Выжить 60 дней — до прихода весеннего парохода. Холод, голод, ' +
      'жажда, усталость и рассудок — пять врагов, которые не договариваются.';

    var h1 = el('div', 'menu-modal-h', parent);
    h1.textContent = 'Управление';
    var keys = el('div', 'menu-keys', parent);
    var KH = [
      ['WASD / стрелки', 'движение'],
      ['мышь', 'камера и прицел'],
      ['колесо', 'приблизить/отдалить'],
      ['E', 'действие: обыскать, открыть, взять, разжечь'],
      ['I или Tab', 'инвентарь'],
      ['C', 'крафт'],
      ['B', 'строительство и разбор'],
      ['H', 'здоровье и перевязка'],
      ['M', 'карта'],
      ['J', 'журнал и записки'],
      ['F', 'источник света в руке'],
      ['Z', 'сон / проснуться'],
      ['Q', 'бросить предмет'],
      ['R', 'перезарядка'],
      ['Space', 'пауза и скорость времени'],
      ['Shift', 'бег (тратит силы)'],
      ['Ctrl', 'красться']
    ];
    for (var i = 0; i < KH.length; i++) {
      var row = el('div', 'menu-key-row', keys);
      var b = el('b', '', row);
      b.textContent = KH[i][0];
      var s = el('span', '', row);
      s.textContent = KH[i][1];
    }

    var h2 = el('div', 'menu-modal-h', parent);
    h2.textContent = 'Первые шаги';
    var steps = [
      'Обыщите дом, где стоите: еда, спички, тёплая одежда.',
      'Наденьте всё тёплое: шуба, валенки, ушанка — между вами и смертью.',
      'Разожгите печь или сложите костёр до темноты.',
      'Растапливайте снег в котелке: сырой снег — путь к болезни.',
      'Не выходите в метель. Не спите на снегу. Не бейте волка ножом.'
    ];
    var ul = el('ul', '', parent);
    for (var k = 0; k < steps.length; k++) {
      var li = el('li', '', ul);
      li.textContent = steps[k];
    }

    var h3 = el('div', 'menu-modal-h', parent);
    h3.textContent = 'Пять врагов';
    var foes = [
      ['Голод', 'еда — подчас гнилая; горячая еда ещё и греет изнутри'],
      ['Жажда', 'снег топите, иначе простуда; флягу держите полной'],
      ['Усталость', 'без сна падает скорость и точность; спите под крышей'],
      ['Рассудок', 'одиночество, тьма и трупы грызут его; помогает чай, табак, молитва'],
      ['Холод', 'главный: считает одежду, ветер, мокроту, огонь и даже еду']
    ];
    var foesBox = el('div', 'menu-foes', parent);
    for (var f = 0; f < foes.length; f++) {
      var row = el('div', 'menu-foe', foesBox);
      var b2 = el('b', '', row);
      b2.textContent = foes[f][0] + '. ';
      var sp = el('span', '', row);
      sp.textContent = foes[f][1];
    }

    var h4 = el('div', 'menu-modal-h', parent);
    h4.textContent = 'Про тепло — коротко';
    var warm = el('div', 'menu-foes', parent);
    var warmRows = [
      'Стадии холода: холодно → очень холодно (дрожь) → гипотермия → смертельный холод → конец.',
      'Мокрая одежда на морозе теряет тепло втрое быстрее: сушиитесь у огня.',
      'В доме теплее, чем на улице, а топленая печь греет по-настоящему.',
      'Горячая еда и чай дают час-другой внутреннего тепла.',
      'Полярная ночь с 14 декабря: солнце не встанет до самого парохода.'
    ];
    for (var w = 0; w < warmRows.length; w++) {
      var wr = el('div', 'menu-foe', warm);
      wr.textContent = warmRows[w];
    }

    var h5 = el('div', 'menu-modal-h', parent);
    h5.textContent = 'Звери и люди';
    var beasts = [
      ['Волки', 'охотятся стаей, чуют кровь и звук; отступают к огню и факелу'],
      ['Медведь-шатун', 'не спит и не боится; обходите берлоги стороной'],
      ['Олени и зайцы', 'мясо и шкуры; след читайте по снегу'],
      ['Бандиты', 'люди хуже зверей: у них ружья и жадность'],
      ['Отшельник', 'может поделиться солью — или выстрелить на испуг'],
      ['Трупы', 'обыскивайте: у мёртвых есть чему поучиться']
    ];
    var beastsBox = el('div', 'menu-foes', parent);
    for (var b3 = 0; b3 < beasts.length; b3++) {
      var br = el('div', 'menu-foe', beastsBox);
      var bb = el('b', '', br);
      bb.textContent = beasts[b3][0] + '. ';
      var bs = el('span', '', br);
      bs.textContent = beasts[b3][1];
    }

    var p2 = el('p', 'menu-modal-note', parent);
    p2.textContent = 'Смерть окончательна: сохранение уничтожается, мир — новый.';
  }

  /** Содержимое «Об игре». */
  function buildAbout(parent) {
    var p1 = el('p', '', parent);
    p1.textContent = '«Белое Безмолвие» — изометрический сурвайвл в духе Project ' +
      'Zomboid: тихий Русский Север, зима 1917 года, шестьдесят дней до парохода.';

    var p2 = el('p', '', parent);
    p2.textContent = 'Один неверный шаг — и метель заметает след. Один мокрый ' +
      'тулуп — и гипотермия. Один пропущенный час у печи — и обмороженные пальцы ' +
      'уже не держат спичку.';

    var meta = el('div', 'menu-about-meta', parent);
    var rows = [
      ['Версия', 'v' + (WS.VERSION || '1.0.0') + ', сборка ' + (WS.BUILD || '1917')],
      ['Жанр', 'изометрический сурвайвл-рогалик, пермадет'],
      ['Мир', '220×220 тайлов: посёлок, лес, река, станция'],
      ['Время', '1 ноября — 30 декабря 1917, 60 дней до парохода'],
      ['Пайплайн', 'studioigor: идея → волны → плейтесты'],
      ['Движок', 'свой: canvas-рендер, DOM-интерфейс, без внешних библиотек']
    ];
    for (var i = 0; i < rows.length; i++) {
      var r = el('div', 'menu-about-row', meta);
      var k = el('span', 'menu-about-k', r);
      k.textContent = rows[i][0];
      var v = el('span', 'menu-about-v', r);
      v.textContent = rows[i][1];
    }

    var p3 = el('p', 'menu-modal-note', parent);
    p3.textContent = 'Играется в духе времени: медленно, осторожно и с уважением к холоду.';
  }

  // ====================================================================
  //  СОСТОЯНИЕ ВЫБОРА
  // ====================================================================

  /** Атмосферные строки под сводку героя (по профессии). */
  var HERO_FLAVOR = {
    telegraph: 'Ключ от станции в кармане, телеграф молчит уже неделю.',
    hunter: 'Ружьё смазано, порох сухой. Лес знает вас по звуку шагов.',
    carpenter: 'Руки помнят топор с детства. Дерево не подводит.',
    cook: 'Из ничего — навар. Из навара — ужин. Из ужина — жизнь.',
    medic: 'Люди здесь мрут от пустяков. Вы — от пустяков не дадите.',
    convict: 'Имени нет. Есть только путь по снегу — и тот заметает.'
  };

  /** Живой предпросмотр выбора: имя, черты, строка настроения. */
  function updateHeroSummary() {
    if (!els.heroName) return;
    var prof = null;
    var i;
    for (i = 0; i < PROFESSIONS.length; i++) {
      if (PROFESSIONS[i].id === profSel) prof = PROFESSIONS[i];
    }
    setText(els.heroName, prof ? prof.name : '— выберите профессию —');

    var parts = [];
    for (i = 0; i < TRAITS.length; i++) {
      var t = TRAITS[i];
      if (t.neg ? negSel[t.id] : posSel[t.id]) {
        parts.push((t.neg ? '−' : '+') + ' ' + t.name);
      }
    }
    setText(els.heroTraits, parts.length ? parts.join(' · ') : 'черты не выбраны');

    setText(els.heroFlavor, prof ? (HERO_FLAVOR[prof.id] || '') : '');
  }

  function refreshCards() {
    for (var i = 0; i < PROFESSIONS.length; i++) {
      var p = PROFESSIONS[i];
      var c = cardEls[p.id];
      if (!c) continue;
      if (profSel === p.id) c.classList.add('sel');
      else c.classList.remove('sel');
    }
  }

  function refreshTraits() {
    for (var i = 0; i < TRAITS.length; i++) {
      var t = TRAITS[i];
      var e = traitEls[t.id];
      if (!e) continue;
      var on = t.neg ? !!negSel[t.id] : !!posSel[t.id];
      if (on) e.classList.add('sel');
      else e.classList.remove('sel');
    }
    // строка баланса
    var np = countKeys(posSel);
    var nn = countKeys(negSel);
    var txt = 'сильных ' + np + '/' + MAX_POS + ' · слабостей ' + nn + '/' + NEED_NEG;
    if (nn < NEED_NEG) txt += ' — выберите ещё ' + (NEED_NEG - nn);
    else if (nn > NEED_NEG) txt += ' — лишние, снимите';
    setText(els.traitHint, txt);
    updateHeroSummary();
  }

  function refreshStartState() {
    var nn = countKeys(negSel);
    var ok = !!profSel && nn === NEED_NEG;
    if (els.btnStart) els.btnStart.disabled = !ok;
  }

  /** Есть ли сохранение (кнопка «Продолжить» + краткая сводка сейва). */
  function refreshSave() {
    var has = false;
    try { if (WS.Save && WS.Save.exists) has = WS.Save.exists(); } catch (e) { has = false; }
    if (has) {
      // подпись: «Продолжить — день 12, охотник» (если меты нет — просто)
      var label = 'Продолжить';
      try {
        if (WS.Save && WS.Save.meta) {
          var m = WS.Save.meta();
          if (m) {
            var profName = m.prof && WS.Data && WS.Data.professions &&
              WS.Data.professions[m.prof] ? WS.Data.professions[m.prof].name : null;
            label += ' — день ' + (m.day || 1) +
              (profName ? ', ' + profName.toLowerCase() : '');
          }
        }
      } catch (e2) { /* без меты */ }
      setText(els.btnCont, label);
      showEl(els.btnCont);
    } else {
      setText(els.btnCont, 'Продолжить');
      hideEl(els.btnCont);
    }
  }

  /** Сброс выбора (новая партия после смерти). */
  function resetSelection(keepTraits) {
    profSel = null;
    posSel = {};
    negSel = {};
    refreshCards();
    refreshTraits();
    refreshStartState();
  }

  // ====================================================================
  //  ДЕЙСТВИЯ КНОПОК
  // ====================================================================

  function showErr(txt) {
    setText(els.err, txt);
    showEl(els.err);
    setTimeout(function () { hideEl(els.err); }, 4000);
  }

  /** «Начать»: собрать выбор и создать партию. */
  function onStart() {
    if (!built) return;
    var nn = countKeys(negSel);
    if (!profSel) { showErr('Выберите профессию.'); return; }
    if (nn !== NEED_NEG) {
      showErr('Слабостей должно быть ровно ' + NEED_NEG + ': зима не спрашивает согласия.');
      return;
    }

    var prof = null;
    for (var i = 0; i < PROFESSIONS.length; i++) {
      if (PROFESSIONS[i].id === profSel) prof = PROFESSIONS[i];
    }
    if (!prof) { showErr('Профессия не найдена.'); return; }

    var traits = [];
    for (var k = 0; k < TRAITS.length; k++) {
      var t = TRAITS[k];
      if (t.neg ? negSel[t.id] : posSel[t.id]) traits.push(t.id);
    }

    snd('bell');
    var okNew = false;
    try { okNew = WS.Main.newGame(prof.id, traits, parseSeed()); } catch (e) {
      WS.err('menu newGame', e && e.message);
      okNew = false;
    }
    if (!okNew) { showErr('Не удалось начать игру.'); return; }

    applyProfession(prof);
    hide();
  }

  /** «Продолжить»: загрузка сохранения. */
  function onContinue() {
    if (!built) return;
    snd('click');
    var ok = false;
    try { ok = WS.Main.loadGame(); } catch (e) {
      WS.err('menu loadGame', e && e.message);
      ok = false;
    }
    if (!ok) { showErr('Сохранение не читается.'); return; }
    hide();
  }

  /**
   * «▶ Демо-прохождение»: запускает демо-автопилот (js/ui/demo.js).
   * Подтверждение не нужно: демо не трогает сейвы (своя партия в памяти).
   */
  function onDemo() {
    if (!built) return;
    snd('bell');
    if (!(WS.Demo && WS.Demo.start)) { showErr('Модуль демо не загружен.'); return; }
    var ok = false;
    try { ok = WS.Demo.start({}); } catch (e) {
      WS.err('menu demo start', e && e.message);
      ok = false;
    }
    if (!ok) { showErr('Не удалось запустить демо.'); return; }
    hide();
  }

  /**
   * Применить профессию к свежей партии: стартовые навыки и груз.
   * Вызывается сразу после WS.Main.newGame — игрок уже в мире.
   */
  function applyProfession(prof) {
    var g = WS.G;
    if (!g || !g.player) return;
    var p = g.player;

    // навыки: поднимаем до профилированного уровня (не выше 10)
    var sk = prof.skills || {};
    for (var k in sk) {
      if (!sk.hasOwnProperty(k)) continue;
      if (p.skills && p.skills[k]) {
        p.skills[k].lv = Math.max(p.skills[k].lv || 0, Math.min(10, sk[k]));
      }
    }

    // груз: через инвентарь (вес/стаки/события); неизвестные — мимо
    var items = prof.items || [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (!itemKnown(it.id)) continue;
      var given = 0;
      try {
        if (WS.Inv && WS.Inv.give) given = WS.Inv.give(it.id, it.n || 1);
      } catch (e2) { given = 0; }
      if (!given) {
        try {
          if (WS.Action && WS.Action.give) WS.Action.give(it.id, it.n || 1);
        } catch (e3) { /* совсем без инвентаря — молчим */ }
      }
    }
  }

  /** Разбор зерна мира: '' -> undefined; число; иначе хэш строки. */
  function parseSeed() {
    if (!els.seed) return undefined;
    var v = String(els.seed.value || '').trim();
    if (!v) return undefined;
    if (/^\d+$/.test(v)) return (parseInt(v, 10) >>> 0);
    // строка — детерминированный хэш (одна и та же — один и тот же мир)
    try {
      if (WS.RNG && WS.RNG.strHash) return (WS.RNG.strHash(v) >>> 0);
    } catch (e) { /* ниже */ }
    var h = 2166136261;
    for (var i = 0; i < v.length; i++) {
      h ^= v.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    return h;
  }

  /** «Случайный герой»: судьба решает за игрока. */
  function onRandomHero() {
    if (!built) return;
    snd('select');
    // профессия
    var p = PROFESSIONS[Math.floor(Math.random() * PROFESSIONS.length)];
    profSel = p.id;
    // сильные черты: 0..MAX_POS случайных
    posSel = {};
    var pos = [];
    var negs = [];
    var i;
    for (i = 0; i < TRAITS.length; i++) {
      if (TRAITS[i].neg) negs.push(TRAITS[i]); else pos.push(TRAITS[i]);
    }
    var wantPos = Math.floor(Math.random() * (MAX_POS + 1));
    shuffle(pos);
    for (i = 0; i < wantPos; i++) posSel[pos[i].id] = true;
    // слабости: ровно NEED_NEG
    negSel = {};
    shuffle(negs);
    for (i = 0; i < NEED_NEG; i++) negSel[negs[i].id] = true;

    refreshCards();
    refreshTraits();
    refreshStartState();
  }

  /** Тасование Фишера—Йетса. */
  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  /** Клавиатура меню: стрелки, 1—6, Enter, R. */
  function onMenuKey(ev) {
    var code = ev.keyCode;
    var i;
    if (code === 37 || code === 39) {           // влево/вправо — профессии
      ev.preventDefault();
      var idx = -1;
      for (i = 0; i < PROFESSIONS.length; i++) {
        if (PROFESSIONS[i].id === profSel) idx = i;
      }
      var dir = (code === 39) ? 1 : -1;
      idx = (idx + dir + PROFESSIONS.length) % PROFESSIONS.length;
      profSel = PROFESSIONS[idx].id;
      snd('select');
      refreshCards();
      refreshStartState();
      return;
    }
    if (code >= 49 && code <= 54) {              // 1..6 — прямой выбор
      i = code - 49;
      if (PROFESSIONS[i]) {
        profSel = PROFESSIONS[i].id;
        snd('select');
        refreshCards();
        refreshStartState();
      }
      return;
    }
    if (code === 13) {                          // Enter — начать
      if (els.btnStart && !els.btnStart.disabled) onStart();
      return;
    }
    if (code === 82 || code === 114) {          // R — случайный герой
      onRandomHero();
    }
  }

  // ====================================================================
  //  ПОКАЗ / СКРЫТИЕ
  // ====================================================================

  /**
   * Показать меню.
   * mode: 'start' (обычный) | 'dead' (после смерти — с баннером).
   * cause: строка причины смерти для режима 'dead'.
   */
  function show(mode, cause) {
    if (!built) build();
    if (!root) return;
    visible = true;

    // баннер смерти
    if (mode === 'dead') {
      var sum = null;
      try { if (WS.State && WS.State.deathSummary) sum = WS.State.deathSummary(); } catch (e) { sum = null; }
      setText(els.deathCause, cause ? ('Вы погибли. ' + cause + '.') : 'Вы погибли.');
      var s = '';
      if (sum) {
        s = 'Прожито дней: ' + sum.days +
          ' · волков убито: ' + sum.wolves +
          ' · обыскано: ' + sum.looted +
          ' · сделано своими руками: ' + sum.crafted +
          ' · записок прочитано: ' + sum.notes;
      }
      setText(els.deathStats, s);
      showEl(els.death);
      resetSelection(true);
    } else {
      hideEl(els.death);
    }

    // новый эпиграф — каждый показ свой
    if (els.epigraph && EPIGRAPHS.length) {
      setText(els.epigraph, EPIGRAPHS[Math.floor(Math.random() * EPIGRAPHS.length)]);
    }

    refreshSave();
    refreshTraits();
    refreshStartState();
    root.classList.remove('hidden');
  }

  function hide() {
    visible = false;
    if (!root) return;
    root.classList.add('hidden');
    if (modalOpen) closeModal();
  }

  /** Видимость по факту DOM (D4 может трогать классы напрямую). */
  function isShown() {
    return !!(root && !root.classList.contains('hidden'));
  }

  // ====================================================================
  //  СОБЫТИЯ
  // ====================================================================

  function bindEvents() {
    // партия стартовала (кем бы то ни было) — меню убрать
    WS.Ev.on('game:start', function () {
      try { hide(); } catch (e) { WS.err('menu hide on start', e && e.message); }
    });
    WS.Ev.on('game:load', function () {
      try { hide(); } catch (e) { WS.err('menu hide on load', e && e.message); }
    });

    // смерть: экран смерти делает D4 (WS.Ui.deathScreen); если его нет —
    // через 500 мс показываем своё меню с баннером
    WS.Ev.on('player:die', function (d) {
      if (WS.Ui && WS.Ui.deathScreen) return;        // D4 владеет смертью
      setTimeout(function () {
        try { show('dead', d && d.cause); } catch (e) { WS.err('menu death show', e && e.message); }
      }, 500);
    });
  }

  // ====================================================================
  //  ПУБЛИЧНЫЙ API (WS.Menu — НЕ WS.Ui, тот пишет D4)
  // ====================================================================

  var Menu = {
    show: show,
    hide: hide,
    visible: function () { return isShown(); },
    /** Выбранная профессия (id) — для отладки и D4. */
    prof: function () { return profSel; },
    /** Выбранные черты (массив id). */
    traits: function () {
      var out = [];
      for (var k = 0; k < TRAITS.length; k++) {
        var t = TRAITS[k];
        if (t.neg ? negSel[t.id] : posSel[t.id]) out.push(t.id);
      }
      return out;
    },
    /** Применить профессию к текущей партии (используется после newGame). */
    apply: applyProfession,
    /** Самодиагностика (консоль). */
    selftest: function () {
      var out = [];
      function ok(name, cond) {
        out.push((cond ? '  ok   ' : '  FAIL ') + name);
        return !!cond;
      }
      ok('DOM построен', built);
      ok('#ws-menu в документе (договор с D4)', !!document.getElementById('ws-menu'));
      ok('профессий: 6', PROFESSIONS.length === 6);
      ok('черт: 12 (6+6)', TRAITS.length === 12);
      ok('профессии в WS.Data', !!(WS.Data && WS.Data.professions &&
        WS.Data.professions.hunter && WS.Data.professions.convict));
      ok('черты в WS.Data', !!(WS.Data && WS.Data.traits && WS.Data.traits.frail));
      ok('id профессий уникальны', (function () {
        var seen = {};
        for (var i = 0; i < PROFESSIONS.length; i++) {
          if (seen[PROFESSIONS[i].id]) return false;
          seen[PROFESSIONS[i].id] = 1;
        }
        return true;
      })());
      ok('id черт уникальны', (function () {
        var seen = {};
        for (var i = 0; i < TRAITS.length; i++) {
          if (seen[TRAITS[i].id]) return false;
          seen[TRAITS[i].id] = 1;
        }
        return true;
      })());
      ok('карточки построены', (function () {
        var n = 0;
        for (var k in cardEls) if (cardEls.hasOwnProperty(k)) n++;
        return n === 6;
      })());
      ok('у всех профессий есть имя и описание', (function () {
        for (var i = 0; i < PROFESSIONS.length; i++) {
          var p = PROFESSIONS[i];
          if (!p.id || !p.name || !p.desc) return false;
        }
        return true;
      })());
      ok('у всех черт есть имя и эффект', (function () {
        for (var j = 0; j < TRAITS.length; j++) {
          var t = TRAITS[j];
          if (!t.id || !t.name || !t.effect) return false;
        }
        return true;
      })());
      ok('эпиграфы на месте', EPIGRAPHS.length >= 8);
      ok('сводка героя обновляется', typeof updateHeroSummary === 'function');
      return out;
    }
  };

  WS.def('Menu', Menu);

  // ====================================================================
  //  BOOT
  // ====================================================================

  WS.boot(function initMenu() {
    // 1) данные профессий и черт — в общий реестр (контракт: data в boot)
    WS.Data = WS.Data || {};
    WS.Data.professions = WS.Data.professions || {};
    WS.Data.traits = WS.Data.traits || {};
    var i;
    for (i = 0; i < PROFESSIONS.length; i++) {
      WS.Data.professions[PROFESSIONS[i].id] = PROFESSIONS[i];
    }
    for (i = 0; i < TRAITS.length; i++) {
      WS.Data.traits[TRAITS[i].id] = TRAITS[i];
    }

    // 2) DOM и события
    build();
    bindEvents();

    // 3) страховка входа: main.js зовёт WS.Ui.showMenu(). Ядро UI (D4) находит
    //    наш корень #ws-menu и показывает его (visible=true, см. isShown()).
    //    Если через 100 мс меню никто не показал (D4 не приехал) — показываем
    //    себя сами: без этого входа игрок не увидит выбор профессии.
    setTimeout(function () {
      if (isShown()) return;                              // уже показано (D4)
      if (WS.Ui && WS.Ui.showMenu) return;               // UI есть: он владеет меню
      if (document.getElementById('ws-menu-fb')) return;  // запасное меню D4
      try { show('start'); } catch (e) {
        WS.err('menu fallback show', e && e.message);
      }
    }, 100);

    WS.log('menu: готов (D1)');
  }, 'menu:init');
})();
