/**
 * ФИНАЛЬНЫЕ ЭКРАНЫ: перма-смерть и победа.
 *
 * Смерть — «ВОТ ТАК ВЫ ПОГИБЛИ» в духе Project Zomboid: кровавая
 * надпись, причина, дата, статистика партии; кнопки «Начать заново»
 * (тот же персонаж: профессия и черты сохраняются) и «В меню».
 * Победа — «ПАРОХОД ПРИШЁЛ»: вы дожили до 30 декабря. Сдержанный
 * триумф: холодное золото вместо крови.
 *
 * Связи: main.js зовёт WS.Ui.deathScreen(cause) / WS.Ui.victoryScreen();
 * страховкой висит подписка на 'game:victory'. Файл грузится РАНЬШЕ ui.js
 * (алфавит: d < u), поэтому методы вешаются на WS.Ui внутри boot.
 */
(function () {
  'use strict';

  // ====================================================================
  //  СОСТОЯНИЕ
  // ====================================================================

  var dom = {
    root: null,          // общий корень #ws-finale (пересобирается при показе)
    lastKind: null       // 'death' | 'victory' — что открыто сейчас
  };

  // Построен ли каркас (содержимое перезаполняется на каждый показ)
  var built = false;

  // Защита от повторного показа одного и того же финала (Main.victory
  // эмитит событие и тут же зовёт метод напрямую — двойной вызов отсекаем)
  var showing = false;

  // ====================================================================
  //  МАЛЫЕ УТИЛИТЫ
  // ====================================================================

  /** Перевод через словарь, если он есть; иначе — литерал. */
  function T(key, fb) {
    if (WS.I18N && WS.I18N.t) {
      try { return WS.I18N.t(key, fb); } catch (e) { /* словарь не готов */ }
    }
    return (typeof fb === 'string') ? fb : key;
  }

  /** Создать элемент с классом и родителем. */
  function el(tag, cls, parent) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (parent) parent.appendChild(e);
    return e;
  }

  /** Кнопка .ws-btn (со щелчком). */
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

  /** Русская плюрализация. */
  function plural(n, one, few, many) {
    n = Math.abs(Math.round(n)) % 100;
    if (n > 10 && n < 20) return many;
    var d = n % 10;
    if (d === 1) return one;
    if (d >= 2 && d <= 4) return few;
    return many;
  }

  /** Заглавная буква (причины смерти приходят строчными литералами). */
  function capFirst(s) {
    s = String(s || '');
    if (!s) return s;
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  /** Случайный элемент списка (для эпитафий). */
  function pickQuote(list) {
    if (!list || !list.length) return '';
    var i = 0;
    // детерминизм от сида партии: у одной партии — одна эпитафия
    if (WS.G && WS.G.seed) i = (WS.G.seed >>> 0) % list.length;
    else i = Math.floor(Math.random() * list.length);
    return list[i];
  }

  // ====================================================================
  //  ЭПИТАФИИ — скорбные строки для экрана смерти
  // ====================================================================

  var QUOTES_DEATH = [
    'Север не прощает. Север просто ждёт.',
    'Метель заметёт, и никто не найдёт.',
    'Здесь каждый шаг отсчитан — и последний тоже.',
    'Так заканчиваются все, кто остался.',
    'Стужа не злится. Она просто берёт своё.',
    'Волки в лесу, а человек в земле.',
    'Белое безмолвие приняло ещё одного.',
    'Молись, если успел.',
    'Зима спросила — ты ответил.',
    'Тише, тише. Снег идёт.'
  ];

  // Победные строки — сдержанные, без ликования
  var QUOTES_VICTORY = [
    'Гудок парохода — самый сладкий звук на свете.',
    'Ты пережил то, что пережить нельзя.',
    'Изба дожила до весны вместе с тобой.',
    'Белое безмолвие молчит. Ты — нет.',
    'Дым над трубой, хлеб на столе, билет в кармане.',
    'Север отпустил. Не все доживают до этого дня.',
    'Считай, что вторая жизнь началась.',
    'Тридцатое декабря. Ты дома.'
  ];

  // ====================================================================
  //  ДАТА СМЕРТИ/ПОБЕДЫ
  //  Старт партии — 1 ноября 1917. День 60 — 30 декабря 1917.
  // ====================================================================

  /** «14 ноября 1917 года, 08:35» */
  function finaleDate() {
    var g = WS.G;
    var day = (g && g.time) ? g.time.day : 1;
    if (!(day >= 1)) day = 1;
    if (day > 60) day = 60;                     // просрочившие — тоже 30 декабря

    var md = 1 + ((day - 1) % 30);
    var mo = (day <= 30) ? 'ноября' : 'декабря';

    var hh = 0, mm = 0;
    if (g && g.time) {
      hh = Math.floor(g.time.min / 60);
      mm = Math.floor(g.time.min % 60);
    }
    var tm = (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;

    return md + ' ' + mo + ' ' + T('ui.year', '1917 года') + ', ' + tm;
  }

  // ====================================================================
  //  СТАТИСТИКА ПАРТИИ
  //  Первичный источник — WS.State.deathSummary() (контракт), остальное
  //  добираем из WS.G.stats, если он жив (обязательные пары к deathSummary:
  //  days survived, kills, notes).
  // ====================================================================

  /** Краткая сводка смерти (безопасно, даже если G уже нет). */
  function summary() {
    if (WS.State && WS.State.deathSummary) {
      try {
        var s = WS.State.deathSummary();
        if (s && typeof s === 'object') return s;
      } catch (e) { /* считаем руками */ }
    }
    return null;
  }

  /** Полные строки статистики для финального экрана. */
  function statRows(isVictory) {
    var g = WS.G;
    var st = (g && g.stats) || {};
    var sm = summary() || {};
    var rows = [];

    // дней прожито: сначала у deathSummary, потом время партии
    var days = sm.days;
    if (typeof days !== 'number') days = (g && g.time) ? g.time.day : 0;
    if (!(days >= 0)) days = 0;
    rows.push([T('ui.stats.days', 'Прожито'),
               days + ' ' + plural(days, 'день', 'дня', 'дней')]);

    // при победе — со скольким запасом до парохода
    if (isVictory && WS.Time && WS.Time.daysLeft) {
      var left = Math.max(0, WS.Time.daysLeft());
      if (left > 0) {
        rows.push([T('ui.stats.left', 'Дней в запасе'),
                   left + ' ' + plural(left, 'день', 'дня', 'дней')]);
      }
    }

    // убито: волки / медведи / разбойники (сводка даёт только волков)
    var wolves = (typeof sm.wolves === 'number') ? sm.wolves : (st.wolvesKilled || 0);
    rows.push([T('ui.stats.wolves', 'Волков убито'), String(wolves)]);
    if (st.bearsKilled) rows.push([T('ui.stats.bears', 'Медведей убито'), String(st.bearsKilled)]);
    if (st.banditsKilled) rows.push([T('ui.stats.bandits', 'Разбойников убито'), String(st.banditsKilled)]);

    // охота и рыбалка
    if (st.animalsHunted) rows.push([T('ui.stats.hunted', 'Дичи добыто'), String(st.animalsHunted)]);
    if (st.fishCaught) rows.push([T('ui.stats.fish', 'Рыбы поймано'), String(st.fishCaught)]);

    // хозяйство
    var looted = (typeof sm.looted === 'number') ? sm.looted : (st.containersLooted || 0);
    rows.push([T('ui.stats.looted', 'Укрытий обыскано'), String(looted)]);

    var crafted = (typeof sm.crafted === 'number') ? sm.crafted : (st.itemsCrafted || 0);
    rows.push([T('ui.stats.crafted', 'Вещей изготовлено'), String(crafted)]);

    if (st.mealsCooked) rows.push([T('ui.stats.cooked', 'Еды сварено'), String(st.mealsCooked)]);
    if (st.nightsSlept) rows.push([T('ui.stats.slept', 'Ночей в тепле'), String(st.nightsSlept)]);

    // записки: сводка + журнал
    var notes = (typeof sm.notes === 'number') ? sm.notes : (st.notesRead || 0);
    rows.push([T('ui.stats.notes', 'Записок прочтено'), String(notes)]);

    // атмосферные строки — только если было дело
    if (typeof st.coldest === 'number' && st.coldest < -25) {
      rows.push([T('ui.stats.coldest', 'Холод пережит'), st.coldest.toFixed(0) + ' °C']);
    }
    if (typeof st.closestCall === 'number' && st.closestCall > 0 && st.closestCall < 15) {
      rows.push([T('ui.stats.closest', 'На волосок от смерти'),
                 st.closestCall.toFixed(0) + ' ' + T('ui.stats.hp', 'HP')]);
    }

    return rows;
  }

  // ====================================================================
  //  ПОСТРОЕНИЕ ЭКРАНА
  // ====================================================================

  /**
   * Каркас финального экрана. Один корень на смерть и победу:
   * классы .death / .victory переключают цветовую гамму.
   */
  function buildSkeleton() {
    if (built) return;

    var root = document.getElementById('ui-root') || document.body;

    var scr = el('div', 'ws-screen ws-finale death hidden');
    scr.id = 'ws-finale';
    dom.root = scr;

    // тёмная виньетка поверх мира
    el('div', 'fin-vignette', scr);

    var inner = el('div', 'fin-inner', scr);

    el('div', 'fin-kicker', inner);      // строка над заголовком
    var title = el('div', 'fin-title', inner);   // буквы добавим при показе

    el('div', 'fin-cause', inner);       // причина смерти / подпись победы
    el('div', 'fin-date', inner);        // «14 ноября 1917 года, 08:35»

    var stats = el('div', 'fin-stats', inner);
    stats.className = 'fin-stats';

    el('div', 'fin-quote', inner);       // эпитафия

    var btns = el('div', 'fin-btns', inner);

    // «Начать заново» / «Новая зимовка» — тот же персонаж
    var bRestart = btn(T('ui.death.restart', 'Начать заново'), 'primary', function () {
      restart();
    });
    bRestart.className = bRestart.className + ' fin-restart';
    btns.appendChild(bRestart);

    // «⭐ Отправить экспедицию» — превратить зиму в звёзды (мета-слой)
    var bExped = btn('⭐ Отправить экспедицию', 'exped-btn', function () {
      sendExpeditionFromFinale();
    });
    bExped.className = bExped.className + ' fin-exped';
    bExped.title = 'Между зимами дед сходит за звёздами: дни, изгнания и Древо превратятся в перки.';
    btns.appendChild(bExped);

    // «В меню»
    btns.appendChild(btn(T('ui.death.to_menu', 'В меню'), '', function () {
      toMenu();
    }));

    root.appendChild(scr);
    built = true;
  }

  /** Собрать заголовок из букв (появление по одной, как в PZ). */
  function buildTitle(text) {
    var box = dom.root.querySelector('.fin-title');
    if (!box) return;
    while (box.firstChild) box.removeChild(box.firstChild);

    text = String(text || '');
    var delay = 0;
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      if (ch === ' ') {
        var sp = el('span', 'ch-space', box);
        sp.innerHTML = '&nbsp;';
        delay += 0.05;
        continue;
      }
      var s = el('span', 'ch', box);
      s.textContent = ch;
      s.style.animationDelay = delay.toFixed(2) + 's';
      delay += 0.09;
    }
  }

  /** Заполнить таблицу статистики. */
  function buildStats(rows) {
    var box = dom.root.querySelector('.fin-stats');
    if (!box) return;
    while (box.firstChild) box.removeChild(box.firstChild);
    for (var i = 0; i < rows.length; i++) {
      var r = el('div', 'f-row', box);
      var a = el('span', 'f-label', r);
      a.textContent = rows[i][0];
      var b = el('span', 'f-val', r);
      b.textContent = rows[i][1];
    }
  }

  /**
   * Показ финального экрана.
   * kind: 'death' — причина cause; 'victory' — триумф.
   */
  function show(kind, cause) {
    // уже открыт тот же финал — не дёргаем (событие + прямой вызов)
    if (showing) return;
    if (dom.lastKind === kind && built && dom.root &&
        !dom.root.classList.contains('hidden')) return;
    showing = true;

    buildSkeleton();
    var scr = dom.root;
    var isDeath = (kind !== 'victory');

    // гамма: смерть — кровь, победа — холодное золото
    scr.className = 'ws-screen ws-finale ' + (isDeath ? 'death' : 'victory');

    // строка-надзаголовок
    var kicker = scr.querySelector('.fin-kicker');
    kicker.textContent = isDeath
      ? T('ui.death.kicker', 'Белое Безмолвие · зима 1917')
      : T('ui.victory.kicker', 'Белое Безмолвие · зима 1917');

    // заголовок
    buildTitle(isDeath
      ? T('ui.death.title', 'ВОТ ТАК ВЫ ПОГИБЛИ')
      : T('ui.victory.title', 'ПАРОХОД ПРИШЁЛ'));

    // причина / подпись
    var causeEl = scr.querySelector('.fin-cause');
    if (isDeath) {
      var c = (cause == null || cause === '') ? T('msg.death.unknown', 'Погиб') : String(cause);
      causeEl.textContent = capFirst(c);
    } else {
      causeEl.textContent = T('ui.victory.sub', 'Вы выжили. Белое безмолвие отступило.');
    }

    // дата финала
    scr.querySelector('.fin-date').textContent = finaleDate();

    // статистика
    buildStats(statRows(!isDeath));

    // эпитафия / поздравление
    scr.querySelector('.fin-quote').textContent = '«' +
      pickQuote(isDeath ? QUOTES_DEATH : QUOTES_VICTORY) + '»';

    // подпись кнопки рестарта (у победы — другая)
    var restartBtn = scr.querySelector('.fin-restart');
    if (restartBtn) {
      restartBtn.textContent = isDeath
        ? T('ui.death.restart', 'Начать заново')
        : T('ui.victory.restart', 'Новая зимовка');
    }

    // зарегистрировать и открыть через ядро UI:
    // класс .ws-modal => Loop остановит симуляцию, ESC не закроет (noEsc)
    var Ui = WS.Ui;
    if (Ui && Ui.register && !Ui.isOpen('finale')) {
      Ui.register('finale', {
        root: scr,
        isOpen: function () { return !scr.classList.contains('hidden'); },
        noEsc: true
      });
    }
    if (Ui && Ui.open) Ui.open('finale');

    // прячем подсказку и паузу: финал важнее
    if (Ui && Ui.hint) Ui.hint('');
    if (isDeath) {
      WS.dead = true;                    // полный стоп симуляции (Loop)
      if (WS.G) WS.G.dead = true;         // защита от повторного Main.die
    }

    // звук финала
    if (WS.Snd && WS.Snd.play) {
      try { WS.Snd.play(isDeath ? 'death' : 'victory'); } catch (e) { /* тихо */ }
    }

    showing = false;
    dom.lastKind = kind;
  }

  // ====================================================================
  //  ДЕЙСТВИЯ КНОПОК
  // ====================================================================

  /** Спрятать финальный экран. */
  function hide() {
    var Ui = WS.Ui;
    if (built && Ui && Ui.close) Ui.close('finale');
    dom.lastKind = null;
  }

  /**
   * «Начать заново»: тот же персонаж (профессия + черты), новый мир.
   * Пермадет уже сработал — сейв удалён слушателем save.js.
   */
  function restart() {
    var g = WS.G;
    var prof = (g && g.player && g.player.prof) ? g.player.prof : 'telegraph';
    var traits = (g && g.player && g.player.traits) ? g.player.traits : [];
    if (!traits || typeof traits.slice !== 'function') traits = [];

    hide();
    WS.dead = false;

    if (WS.Main && WS.Main.newGame) {
      try {
        WS.Main.newGame(prof, traits.slice(0));   // копия — новый мир, тот же герой
        if (WS.Ui && WS.Ui.toast) {
          WS.Ui.toast(T('msg.new_try', 'Новая попытка. Север всё тот же.'), 'info');
        }
        return;
      } catch (e) {
        WS.err('finale: newGame упал:', e && e.message);
      }
    }
    // не вышло — хотя бы вернуться в меню
    toMenu();
  }

  /** «В меню». */
  function toMenu() {
    hide();
    WS.dead = false;
    var Ui = WS.Ui;
    if (Ui && Ui.showMenu) {
      try { Ui.showMenu(); } catch (e) { WS.err('finale: showMenu упал:', e && e.message); }
    }
  }

  // ====================================================================
  //  ПУБЛИЧНЫЕ ФУНКЦИИ (вешаются на WS.Ui в boot)
  // ====================================================================

  /** Экран смерти. Вызывается из Main.die(cause). */
  function deathScreen(cause) {
    show('death', cause);
  }

  /** Экран победы. Вызывается из Main.victory(). */
  function victoryScreen() {
    show('victory', null);
  }

  /** Отправить экспедицию с финального экрана: зима → звёзды. */
  function sendExpeditionFromFinale() {
    if (!(WS.Expeditions && WS.Expeditions.sendExpedition)) {
      try { WS.Ui.toast('Изба Экспедиций не загружена', 'warn'); } catch (e) { /* пусто */ }
      return;
    }
    var g = WS.G;
    if (!g) return;
    var cz = (WS.Crazy && WS.Crazy.state) ? WS.Crazy.state() : null;
    var treeLv = 0;
    try {
      if (cz && cz.spent) { for (var tk in cz.spent) treeLv += cz.spent[tk] || 0; }
    } catch (e2) { /* пусто */ }
    var fq = (WS.Story && WS.Story.finalQuest) ? WS.Story.finalQuest() : null;
    var isWin = (dom.lastKind === 'victory');
    var res = WS.Expeditions.sendExpedition({
      result: isWin ? 'victory' : 'death',
      day: g.time ? g.time.day : 1,
      banished: cz ? cz.banished : 0,
      treeLv: treeLv,
      stardust: fq ? fq.dust : 0,
      seed: g.seed || 0,
      name: 'Дед (ручной заезд)',
      ritual: fq ? fq.calls : 0
    });
    var bEx = dom.root ? dom.root.querySelector('.fin-exped') : null;
    if (bEx) {
      bEx.disabled = true;
      bEx.textContent = '⭐ +' + res.stars + ' звёзд! (всего ' + res.total + ')';
    }
    try { WS.Ui.toast('⭐ Экспедиция отправлена: +' + res.stars + ' звёзд! Трать их в Избе Экспедиций [X].', 'good'); } catch (e3) { /* пусто */ }
    try { WS.Snd.play('levelup', { vol: 0.5 }); } catch (e4) { /* пусто */ }
  }

  // ====================================================================
  //  BOOT: методы на WS.Ui + страховка события победы
  // ====================================================================

  WS.boot(function initFinale() {
    // этот файл грузится раньше ui.js (алфавит), поэтому довешиваем методы тут
    if (!WS.Ui) WS.Ui = {};
    WS.Ui.deathScreen = deathScreen;
    WS.Ui.victoryScreen = victoryScreen;

    // страховка: если победа прилетит только событием (main.js зовёт и
    // напрямую, и эмитит — двойной показ отсечён флагом внутри show)
    WS.Ev.on('game:victory', function () {
      if (dom.lastKind !== 'victory') victoryScreen();
    });

    WS.log('Finale: экраны смерти и победы готовы');
  }, 'ui:finale');

})();
