/**
 * journal_screen.js — ЖУРНАЛ «Белого Безмолвия» (клавиша J).
 * Четыре вкладки: «Хроника» (автособираемая история событий —
 * дни, убийства, находки, погодные аномалии; слушает события и копит
 * в WS.G.story.chronicle, последние 100 записей), «Записки» (найденные
 * letter_old — тексты из WS.Notes, при его отсутствии — заглушки),
 * «Статистика» (WS.G.stats + карта из MapScreen), «Радио» (если
 * WS.Radio есть). Связи: Time, Weather, MapScreen, Loot, Ui.
 */
(function () {
  'use strict';

  // ====================================================================
  //  КОНСТАНТЫ
  // ====================================================================

  var TICK_UI = 80;            // приоритет UI (CONTRACT.md)
  var REFRESH_S = 0.5;         // частота обновления открытой вкладки
  var CHRON_CAP = 100;         // хроника: последние 100 записей (по ТЗ)
  var RADIO_CAP = 50;          // радио: не больше 50 передач
  var NOT_FOUND = '—';

  // ---- вкладки ----
  var TABS = [
    { id: 'chron',  name: 'Хроника' },
    { id: 'notes',  name: 'Записки' },
    { id: 'stats',  name: 'Статистика' },
    { id: 'radio',  name: 'Радио' }
  ];

  // ---- русские имена сущностей (для хроники убийств) ----------------
  var KIND_NAMES = {
    wolf: 'волк',
    bear: 'медведь-шатун',
    bandit: 'бандит',
    hermit: 'отшельник',
    deer: 'олень',
    hare: 'заяц',
    crow: 'ворона',
    fish: 'рыба'
  };

  // ---- русские имена погоды (id из weather.js) -----------------------
  var WEATHER_NAMES = {
    clear: 'ясно',
    overcast: 'пасмурно',
    snow: 'снег',
    blizzard: 'МЕТEЛЬ',
    fog: 'туман',
    hard_frost: 'ЛЮТЫЙ МОРОЗ',
    snowstorm: 'СНЕЖНАЯ БУРЯ'
  };

  // аномалии — о них пишем громко (класс anoms)
  var WEATHER_ANOM = { blizzard: 1, hard_frost: 1, snowstorm: 1, fog: 1 };

  // ---- заглушки записок (до появления content-модуля WS.Notes) ------
  // Выбор текста детерминирован: WS.RNG.strHash(id) по пулу.
  var STUB_NOTES = [
    {
      title: 'Клочок с телеграфного бланка',
      text: '«...станция Пристань-Тихая. Приём молчит третьи сутки. Провода порваны где-то за рекой. Ухожу к посёлку, аппараты не бросаю...»'
    },
    {
      title: 'Затёртая страница дневника',
      text: '«Декабрь. Дров осталось на неделю. Волки обнаглели — воют у самых дворов. Мёрзнет Анисья, мёрзну и я. Если читаешь это — дрова в сарае, за поленницей.»'
    },
    {
      title: 'Рапорт жандарма',
      text: '«...числа сего дезертиры с разъезда разошлись по волостям. Вооружены, голодны. Приказываю обывателям в лес не отлучаться. Подпись неразборчива.»'
    },
    {
      title: 'Записка лавочника',
      text: '«Ушёл за подмогой в уезд. Кому нужда — счеты под прилавком, цена как писано. Товар не трожь, Бог видит. Мирон.»'
    },
    {
      title: 'Обрывок письма',
      text: '«...милая Настенька, пароход дали под лёд у Луды, и я остался зимовать. Работаю за харчи у лесопромышленника. Коли весной придёт судно — жди меня с попутным ветром...»'
    },
    {
      title: 'Помета на полях требника',
      text: '«Год неурожайный, год недобрый. Погост полон, а служить некому. Прости нас, Господи.»'
    },
    {
      title: 'Инструкция егеря',
      text: '«Тайники держу у старых просек: сухарь, леска, коробок спичек. Ежели совсем беда — ищи бугор с жердью. Только ты не первый такой умный.»'
    },
    {
      title: 'Клочок со стены трактира',
      text: '«Тут был Гарка. Пил. Волков не боюсь. (далее карандашом) не ходите за мной к реке»'
    }
  ];

  // ====================================================================
  //  СОСТОЯНИЕ МОДУЛЯ
  // ====================================================================

  var root = null;
  var isOpen = false;
  var curTab = 'chron';
  var refreshT = 0;
  var lastChronLen = -1;       // чтобы не перерисовывать хронику зря
  var inputWasEnabled = null;
  var refs = {};

  // ====================================================================
  //  МАЛЫЕ УТИЛИТЫ
  // ====================================================================

  function playable() {
    return WS.G && WS.G.running && !WS.G.dead && WS.G.player;
  }

  function anyOtherOpen() {
    if (!root || !document.querySelectorAll) return false;
    var list = document.querySelectorAll('.ws-screen.open');
    for (var i = 0; i < list.length; i++) {
      if (list[i] !== root) return true;
    }
    return false;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /** Минимальный каркас WS.Ui, если настоящий UI ещё не загружен. */
  function ensureUiBase() {
    if (WS.Ui) return;
    WS.Ui = {
      modal: function () {
        return !!(document.querySelectorAll &&
                  document.querySelector('.ws-screen.open'));
      },
      toast: function (text, kind) {
        try {
          var holder = document.getElementById('ws-toast-root');
          if (!holder) {
            holder = document.createElement('div');
            holder.id = 'ws-toast-root';
            (document.getElementById('ui-root') || document.body).appendChild(holder);
          }
          while (holder.children.length >= 4) holder.removeChild(holder.firstChild);
          var t = document.createElement('div');
          t.className = 'ws-toast ' + (kind || 'info');
          t.textContent = String(text || '');
          holder.appendChild(t);
          window.setTimeout(function () {
            if (t.parentNode) t.parentNode.removeChild(t);
          }, 3400);
        } catch (e) { WS.warn('toast:', e && e.message); }
      }
    };
  }

  function snd(name, vol) {
    if (WS.Snd && WS.Snd.play) {
      try { WS.Snd.play(name, { vol: vol == null ? 0.5 : vol }); } catch (e) { /* тишина */ }
    }
  }

  /** Сюжетное хранилище с гарантированными полями. */
  function story() {
    var g = WS.G;
    if (!g) return null;
    if (!g.story || typeof g.story !== 'object') g.story = {};
    var s = g.story;
    if (!s.notes || !s.notes.push) s.notes = [];
    if (!s.radio || !s.radio.push) s.radio = [];
    if (!s.chronicle || !s.chronicle.push) s.chronicle = [];
    return s;
  }

  /** Короткое время «ЧЧ:ММ» для записи хроники. */
  function timeShort() {
    try {
      var h = WS.Time.hour(), m = WS.Time.minute();
      return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
    } catch (e) { return ''; }
  }

  // ====================================================================
  //  ХРОНИКА: СБОР СОБЫТИЙ (работает всегда, окно не нужно)
  // ====================================================================

  /**
   * Добавить запись: {day, time, text, cls}. cls управляет цветом:
   * anom (аномалия), kill (убийство), find (находка), death, plain.
   * Храним последние CHRON_CAP записей (по ТЗ — 100).
   */
  function addChron(text, cls) {
    var s = story();
    if (!s) return;
    s.chronicle.push({
      day: (WS.Time && WS.Time.day) ? WS.Time.day() : 1,
      time: timeShort(),
      text: String(text || ''),
      cls: cls || ''
    });
    while (s.chronicle.length > CHRON_CAP) s.chronicle.shift();
  }

  /** Убийца — игрок? */
  function byPlayer(by) {
    var p = WS.G && WS.G.player;
    if (!by || !p) return false;
    return by === p || by.id === 'player' || by.kind === 'player';
  }

  /** Новый день: счётчик и заметки о полярной ночи. */
  function onDay(d) {
    var day = d && d.day ? d.day : (WS.Time ? WS.Time.day() : 1);
    if (day <= 1) return;
    var left = WS.Time ? WS.Time.daysLeft() : 60;
    addChron('Пережит день ' + day + '. До парохода ' + Math.max(0, left) + ' дн.', '');
    if (WS.Time && WS.Time.isPolarNight && day === 44) {
      addChron('Солнце не поднимется больше до самого парохода. Полярная ночь.', 'anom');
    }
  }

  /** Просрочка парохода. */
  function onOverdue(d) {
    addChron('Срок вышел: пароход не пришёл на ' + ((d && d.day) || '?') + '-й день.', 'anom');
  }

  /** Убийство: пишем только свои. */
  function onEntKill(d) {
    var e = d && d.ent;
    if (!e) return;
    var kind = e.kind || 'существо';
    var name = KIND_NAMES[kind] || kind;
    if (byPlayer(d.by)) {
      addChron('Убит ' + name + '.', 'kill');
    } else if (kind === 'player') {
      // смерть игрока попадёт и сюда, и в player:die — оставим второй
    }
  }

  /** Смерть игрока: финальная запись. */
  function onPlayerDie(d) {
    addChron('Смерть. ' + ((d && d.cause) || 'Причина неизвестна.'), 'death');
    close();
  }

  /** Обыск: что нашли. */
  function onLootSearched(d) {
    var o = d && d.o;
    if (!o) return;
    var what = o.name || 'укрытие';
    var found = (d && typeof d.count === 'number') ? d.count : 0;
    addChron('Обыскано: ' + what + ' — ' +
             (found > 0 ? 'найдено ' + found : 'пусто'), 'find');
  }

  /** Крафт. */
  function onCrafted(d) {
    var r = d && d.recipe;
    var name = '';
    if (r) {
      if (r.name_key && WS.I18N && WS.I18N.t) {
        try { name = WS.I18N.t(r.name_key); } catch (e) { name = ''; }
      }
      if (!name || name === r.name_key) name = r.id || 'вещь';
    }
    if (d && d.fail) {
      addChron('Попытка изготовления сорвалась' + (name ? ': ' + name : ''), '');
    } else {
      addChron('Изготовлено: ' + (name || 'вещь'), 'find');
    }
  }

  /** Погода: смены пишем кратко, аномалии — громко. */
  function onWeatherChanged(d) {
    var to = d && d.to;
    var from = d && d.from;
    var name = WEATHER_NAMES[to] || to || 'перемена';
    if (WEATHER_ANOM[to]) {
      addChron('ПОГОДНАЯ АНОМАЛИЯ: ' + name + (from
        ? ' (было: ' + (WEATHER_NAMES[from] || from) + ')' : ''), 'anom');
    } else {
      addChron('Погода сменилась: ' + name, '');
    }
  }

  /** Навык вырос. */
  function onLevelUp(d) {
    if (!d) return;
    var name = d.skill || '';
    if (WS.Skills && WS.Skills.SKILL_DEFS && WS.Skills.SKILL_DEFS[d.skill]) {
      name = WS.Skills.SKILL_DEFS[d.skill].name;
    }
    addChron('Навык вырос: ' + name + ' ' + (d.level || '') + '.', 'find');
  }

  /** Найдена записка: регистрируем в story.notes (если ещё нет). */
  function onStoryNote(d) {
    var s = story();
    if (!s) return;
    var id = d && (d.noteId || d.id);
    if (!id) return;
    // не дублируем
    for (var i = 0; i < s.notes.length; i++) {
      var n = s.notes[i];
      var nid = typeof n === 'string' ? n : (n && n.id);
      if (nid === id) return;
    }
    s.notes.push(id);
    addChron('Найдена записка.', 'find');
  }

  /** Радиопередача: копим тексты. */
  function onRadioMsg(d) {
    var s = story();
    if (!s) return;
    var text = d && (d.text || d.msg);
    if (!text) return;
    s.radio.push({ text: String(text), day: WS.Time ? WS.Time.day() : 1, time: timeShort() });
    while (s.radio.length > RADIO_CAP) s.radio.shift();
  }

  /** Гипотермия: заметка о смертельном холоде. */
  function onTempStage(d) {
    if (!d || !d.stage || d.stage < 4) return;
    addChron(d.stage >= 5 ? 'Тело остыло.' : 'Смертельный холод: тело перестаёт слушаться.', 'anom');
  }

  /** Победа. */
  function onVictory() {
    addChron('ПАРОХОД ПРИШЁЛ. Спасение.', 'find');
    close();
  }

  /** Старт партии: первая запись. */
  function onGameStart(d) {
    var s = story();
    if (!s) return;
    // при загрузке сейва хронику сохраняем, при новой игре — начинаем
    var prof = (WS.G && WS.G.player && WS.G.player.prof) || 'выживший';
    var profName = profInfoName(prof);
    if (!s.chronicle.length) {
      s.chronicle.push({
        day: 1, time: timeShort(),
        text: 'Партия ушла. Я остался один в Пристань-Тихой. Кто я теперь? ' + profName + '.',
        cls: 'death'
      });
    }
    if (d && d.fresh && WS.G && WS.G.player) {
      revealNoteHint();
    }
  }

  /** Небольшая подсказка о записках (однократно). */
  function revealNoteHint() {
    var s = story();
    if (!s || (s.flags && s.flags.noteHint)) return;
    s.flags = s.flags || {};
    s.flags.noteHint = 1;
  }

  /** Имя профессии для первой записи. */
  function profInfoName(id) {
    var table = {
      telegraph: 'телеграфист',
      hunter: 'охотник',
      carpenter: 'плотник',
      doctor: 'фельдшер',
      peasant: 'крестьянин',
      exile: 'ссыльный',
      sailor: 'матрос',
      teacher: 'учитель',
      smith: 'кузнец'
    };
    return table[id] || id;
  }

  // ====================================================================
  //  ЗАПИСКИ: ТЕКСТЫ
  // ====================================================================

  /**
   * Текст записки: сначала WS.Notes (content-модуль), иначе заглушка.
   * Поддержанные формы WS.Notes.get(id): {title, text} | 'строка'.
   */
  function noteText(id) {
    // --- content-модуль, если появится ---
    if (WS.Notes) {
      var got = null;
      if (typeof WS.Notes.get === 'function') {
        try { got = WS.Notes.get(id); } catch (e) { got = null; }
      } else if (WS.Notes[id]) {
        got = WS.Notes[id];
      }
      if (got && typeof got === 'string') {
        return { title: 'Записка', text: got, src: 'WS.Notes' };
      }
      if (got && typeof got === 'object') {
        return {
          title: got.title || 'Записка',
          text: got.text || got.body || '',
          src: 'WS.Notes'
        };
      }
    }

    // --- заглушка: детерминированный выбор из пула ---
    var h = 0;
    if (WS.RNG && WS.RNG.strHash) {
      try { h = WS.RNG.strHash(String(id)); } catch (e) { h = 0; }
    }
    var stub = STUB_NOTES[Math.abs(h) % STUB_NOTES.length];
    return {
      title: stub.title,
      text: stub.text,
      src: 'по памяти'
    };
  }

  // ====================================================================
  //  DOM
  // ====================================================================

  function buildDom() {
    if (root) return;
    var uiRoot = document.getElementById('ui-root');
    if (!uiRoot) { WS.warn('journal: нет #ui-root'); return; }

    root = document.createElement('div');
    root.className = 'ws-panel ws-screen ws-journal-screen hidden';
    root.innerHTML =
      '<div class="ws-frame" style="width:860px;max-width:96vw;height:640px;max-height:92vh">' +
        '<div class="scr-head">' +
          '<span class="scr-title">Журнал</span>' +
          '<span class="scr-sub" id="ws-jr-sub">Записки выживающего</span>' +
          '<span class="scr-key">J</span>' +
          '<button class="scr-close" title="Закрыть (J / Esc)">&#10005;</button>' +
        '</div>' +
        '<div class="jr-tabs" id="ws-jr-tabs"></div>' +
        '<div class="scr-body jr-body">' +
          '<div class="jr-page" id="ws-jr-page"></div>' +
        '</div>' +
        '<div class="scr-foot">' +
          '<b>J / Esc</b> — закрыть · хроника пишется сама: дни, охота, находки, непогода' +
        '</div>' +
      '</div>';

    uiRoot.appendChild(root);
    refs = {
      tabs: root.querySelector('#ws-jr-tabs'),
      page: root.querySelector('#ws-jr-page'),
      sub: root.querySelector('#ws-jr-sub')
    };

    var closeBtn = root.querySelector('.scr-close');
    if (closeBtn) closeBtn.addEventListener('click', function () { close(); }, false);
  }

  // ====================================================================
  //  ВКЛАДКИ
  // ====================================================================

  /** Видна ли вкладка «Радио»: модуль есть или эфир не пуст. */
  function radioAvailable() {
    var s = story();
    if (WS.Radio) return true;
    return !!(s && s.radio && s.radio.length);
  }

  /** Отрисовать панель вкладок (учитывая доступность радио). */
  function renderTabs() {
    if (!refs.tabs) return;
    var s = story();
    var counts = {
      chron: s ? s.chronicle.length : 0,
      notes: s ? s.notes.length : 0,
      stats: 0,
      radio: s ? s.radio.length : 0
    };
    var out = '';
    for (var i = 0; i < TABS.length; i++) {
      var t = TABS[i];
      if (t.id === 'radio' && !radioAvailable()) continue;
      var active = (curTab === t.id) ? ' active' : '';
      var cnt = counts[t.id];
      out += '<button class="jr-tab' + active + '" data-tab="' + t.id + '">' +
             t.name +
             (cnt ? ' <span class="jr-count">×' + cnt + '</span>' : '') +
             '</button>';
    }
    refs.tabs.innerHTML = out;

    var btns = refs.tabs.querySelectorAll('button');
    for (var b = 0; b < btns.length; b++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          switchTab(btn.getAttribute('data-tab'));
        }, false);
      })(btns[b]);
    }
  }

  function switchTab(id) {
    if (curTab === id) return;
    curTab = id;
    snd('select', 0.3);
    renderTabs();
    renderPage(true);
  }

  // ====================================================================
  //  РЕНДЕР ВКЛАДОК
  // ====================================================================

  /** Точка входа перерисовки содержимого. */
  function renderPage(force) {
    if (!root || !isOpen || !refs.page) return;
    if (curTab === 'chron') renderChron(force);
    else if (curTab === 'notes') renderNotes(force);
    else if (curTab === 'stats') renderStats(force);
    else if (curTab === 'radio') renderRadio(force);
    updateSub();
  }

  /** Подзаголовок окна: что открыто. */
  function updateSub() {
    if (!refs.sub) return;
    var names = {
      chron: 'Хроника событий',
      notes: 'Найденные записки',
      stats: 'Статистика выживания',
      radio: 'Эфир'
    };
    var extra = '';
    if (WS.Time && WS.Time.fmt) extra = WS.Time.fmt();
    refs.sub.textContent = (names[curTab] || '') + (extra ? ' · ' + extra : '');
  }

  // ---- хроника -------------------------------------------------------

  function renderChron(force) {
    var s = story();
    var list = s ? s.chronicle : [];
    if (!force && list.length === lastChronLen) return;
    lastChronLen = list.length;

    if (!list.length) {
      refs.page.innerHTML =
        '<div class="jr-empty">Журнал пуст. История ещё не началась —<br>' +
        'пережейте хотя бы день.</div>';
      return;
    }

    // новые сверху: последние события первыми
    var out = '';
    for (var i = list.length - 1; i >= 0; i--) {
      var e = list[i];
      out +=
        '<div class="ch-item ' + esc(e.cls || '') + '">' +
          '<div class="ch-day">День ' + e.day +
            (e.time ? '<small>' + esc(e.time) + '</small>' : '') +
          '</div>' +
          '<div class="ch-text">' + esc(e.text) + '</div>' +
        '</div>';
    }
    refs.page.innerHTML = out;
    // прокрутка вверх: свежее — в начале
    refs.page.scrollTop = 0;
  }

  // ---- записки -------------------------------------------------------

  function renderNotes() {
    var s = story();
    var notes = s ? s.notes : [];
    if (!notes.length) {
      refs.page.innerHTML =
        '<div class="jr-empty">Записок нет. Ищите бумагу в домах, на телеграфе,<br>' +
        'в сумках тех, кто не дошёл. Слова здесь дороже патронов.</div>';
      return;
    }

    var out = '<div class="notes-col">';
    for (var i = notes.length - 1; i >= 0; i--) {
      var raw = notes[i];
      var id = typeof raw === 'string' ? raw : (raw && raw.id);
      var dayFound = (raw && typeof raw === 'object' && raw.day) ? raw.day : null;
      var t = noteText(id || ('записка' + i));
      out +=
        '<div class="note-card">' +
          '<div class="note-title">' + esc(t.title) + '</div>' +
          '<div class="note-text">' + esc(t.text) + '</div>' +
          '<div class="note-src">' + (dayFound ? 'День ' + esc(dayFound) + ' · ' : '') +
            esc(t.src) + '</div>' +
        '</div>';
    }
    out += '</div>';
    refs.page.innerHTML = out;
  }

  // ---- статистика ----------------------------------------------------

  /** Большой блок «число — подпись». */
  function sb(n, label) {
    return '<div class="sb"><div class="sb-n">' + esc(n) + '</div>' +
           '<div class="sb-l">' + esc(label) + '</div></div>';
  }

  /** Строка таблицы статистики. */
  function kv(b, v) {
    return '<div class="kv"><b>' + esc(b) + '</b><span>' + esc(v) + '</span></div>';
  }

  function renderStats() {
    var g = WS.G;
    if (!g) { refs.page.innerHTML = '<div class="jr-empty">Партии нет.</div>'; return; }
    var st = g.stats || {};

    // дней выжито: верим времени, статистика подтягивается needs.js
    var days = g.time ? g.time.day : 1;
    if (st.daysSurvived && st.daysSurvived > days) days = st.daysSurvived;
    var left = WS.Time ? WS.Time.daysLeft() : 60;

    // исследование карты — от экрана карты (D3)
    var explored = NOT_FOUND;
    if (WS.MapScreen && WS.MapScreen.exploredPct) {
      try { explored = WS.MapScreen.exploredPct() + '%'; } catch (e) { /* — */ }
    }

    var big =
      '<div class="stat-big">' +
        sb(days, 'дней выжито') +
        sb(Math.max(0, left), 'до парохода, дн.') +
        sb((st.wolvesKilled || 0) + (st.bearsKilled || 0) + (st.banditsKilled || 0), 'убито врагов') +
        sb(st.notesRead || 0, 'записок прочитано') +
      '</div>';

    var left2 =
      kv('Волков убито', st.wolvesKilled || 0) +
      kv('Медведей убито', st.bearsKilled || 0) +
      kv('Бандитов убито', st.banditsKilled || 0) +
      kv('Дичи добыто', st.animalsHunted || 0) +
      kv('Рыбы поймано', st.fishCaught || 0) +
      kv('Смертей пережито', st.closestCall || 0);

    var right =
      kv('Контейнеров обыскано', st.containersLooted || 0) +
      kv('Вещей скрафчено', st.itemsCrafted || 0) +
      kv('Блюд приготовлено', st.mealsCooked || 0) +
      kv('Шагов пройдено', st.stepsWalked || 0) +
      kv('Ночей сна', st.nightsSlept || 0) +
      kv('Самый лютый мороз', st.coldest ? (st.coldest + '°C') : NOT_FOUND);

    // сумма навыков — из системы навыков
    var skillSum = NOT_FOUND;
    if (WS.Skills && WS.Skills.totalLv) {
      try { skillSum = String(WS.Skills.totalLv()); } catch (e) { /* — */ }
    }
    right += kv('Сумма уровней навыков', skillSum);
    left2 += kv('Карта исследована', explored);

    refs.page.innerHTML =
      '<div class="stats-grid">' + big +
      '<div>' + left2 + '</div>' +
      '<div>' + right + '</div>' +
      '</div>';
  }

  // ---- радио ----------------------------------------------------------

  function renderRadio() {
    var s = story();
    var list = (s && s.radio) || [];

    // живой источник, если модуль радио уже существует
    if (WS.Radio) {
      if (typeof WS.Radio.messages === 'function') {
        try {
          var live = WS.Radio.messages();
          if (live && live.length) list = live;
        } catch (e) { /* берём журнал */ }
      }
      if (!list.length && typeof WS.Radio.status === 'function') {
        var stat = null;
        try { stat = WS.Radio.status(); } catch (e) { stat = null; }
        if (stat) {
          refs.page.innerHTML =
            '<div class="radio-static-line">' + esc(stat) + '</div>' +
            '<div class="jr-empty">Эфир пока молчит. Крутите ручку —<br>' +
            'иногда сквозь треск пробиваются голоса.</div>';
          return;
        }
      }
    }

    if (!list.length) {
      refs.page.innerHTML =
        '<div class="jr-empty">Приёмник есть, да эфир пуст.<br>' +
        'Слышно только ветер и треск помех.</div>';
      return;
    }

    var out = '';
    for (var i = list.length - 1; i >= 0; i--) {
      var e = list[i];
      var text = (e && e.text) ? e.text : String(e);
      var freq = e && e.freq ? e.freq : '— МГц';
      var day = e && e.day ? ('день ' + e.day + (e.time ? ', ' + e.time : '')) : '';
      out +=
        '<div class="radio-item">' +
          '<div class="r-freq">' + esc(freq) + (day ? '<br><small>' + esc(day) + '</small>' : '') + '</div>' +
          '<div class="r-text">' + esc(text) + '</div>' +
        '</div>';
    }
    // помехи между передачами
    out += '<div class="radio-static-line">…щ-щ-щ… (треск помех) …щ-щ-щ…</div>';
    refs.page.innerHTML = out;
  }

  // ====================================================================
  //  ОТКРЫТИЕ / ЗАКРЫТИЕ / ТИК
  // ====================================================================

  function open() {
    if (isOpen) return;
    if (!playable()) return;
    if (anyOtherOpen()) {
      snd('error', 0.35);
      return;
    }
    buildDom();
    if (!root) return;

    isOpen = true;
    root.classList.remove('hidden');
    root.classList.add('open');

    if (WS.Input && WS.Input.isEnabled && WS.Input.setEnabled) {
      inputWasEnabled = WS.Input.isEnabled();
      if (inputWasEnabled) WS.Input.setEnabled(false);
    }

    lastChronLen = -1;
    renderTabs();
    renderPage(true);
    snd('paper' in {} ? 'click' : 'click', 0.35);   // звука 'paper' нет — клик
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    if (root) {
      root.classList.add('hidden');
      root.classList.remove('open');
    }
    if (inputWasEnabled === true && WS.Input && WS.Input.setEnabled) {
      WS.Input.setEnabled(true);
    }
    inputWasEnabled = null;
    snd('click', 0.3);
  }

  function toggle() {
    if (isOpen) close();
    else open();
  }

  function onKey(d) {
    if (!isOpen) return;
    if (d && d.code === 'KeyJ') {
      // съедаем нажатие: опросный путь не должен открыть журнал тут же
      // повторно (повторное нажатие закрывает, а не «переоткрывает»)
      if (WS.Input && WS.Input.consumeCode) WS.Input.consumeCode('KeyJ');
      close();
    } else if (d && d.code === 'Escape') {
      close();
    }
  }

  function uiTick(dt) {
    try {
      if (!isOpen) {
        if (!playable()) return;
        if (anyOtherOpen()) return;
        if (WS.Ui && WS.Ui.modal && WS.Ui.modal()) return;
        if (WS.Input && WS.Input.hit && WS.Input.hit('journal')) open();
        return;
      }
      if (!WS.G.running) { close(); return; }

      // обновляем открытую вкладку (хроника может подрасти)
      refreshT += dt;
      if (refreshT >= REFRESH_S) {
        refreshT = 0;
        if (curTab === 'chron') {
          var s = story();
          var len = s ? s.chronicle.length : 0;
          if (len !== lastChronLen) renderPage(true);
        } else if (curTab === 'stats') {
          renderPage(true);
        }
        updateSub();
      }
    } catch (e) {
      WS.err('journal uiTick:', e && e.message);
    }
  }

  // ====================================================================
  //  ПУБЛИЧНЫЙ API + BOOT
  // ====================================================================

  var JournalScreen = {
    open: open,
    close: close,
    toggle: toggle,
    isOpen: function () { return isOpen; },
    switchTab: switchTab,

    /** Внешний доступ к хронике (для других экранов/тестов). */
    addChron: addChron,
    chronicle: function () {
      var s = story();
      return s ? s.chronicle.slice() : [];
    }
  };

  WS.def('JournalScreen', JournalScreen);

  WS.boot(function bootJournalScreen() {
    ensureUiBase();
    buildDom();

    // --- хроника: слушаем события всегда, окно не обязательно ---
    WS.Ev.on('game:start', onGameStart);
    WS.Ev.on('game:load', onGameStart);
    WS.Ev.on('time:day', onDay);
    WS.Ev.on('time:overdue', onOverdue);
    WS.Ev.on('ent:kill', onEntKill);
    WS.Ev.on('player:die', onPlayerDie);
    WS.Ev.on('loot:searched', onLootSearched);
    WS.Ev.on('item:crafted', onCrafted);
    WS.Ev.on('weather:changed', onWeatherChanged);
    WS.Ev.on('player:levelup', onLevelUp);
    WS.Ev.on('story:note', onStoryNote);
    WS.Ev.on('radio:msg', onRadioMsg);
    WS.Ev.on('temp:stage', onTempStage);
    WS.Ev.on('game:victory', onVictory);

    // --- окно ---
    WS.tick(TICK_UI, uiTick, 'ui:journal');
    WS.Ev.on('key:down', onKey);

    WS.log('ui: журнал готов (J, слушателей хроники: 13)');
  }, 'ui:journal:init');

})();
