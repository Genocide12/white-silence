/**
 * ЛОКАЛИЗАЦИЯ: рантайм переключения языков — расширение WS.I18N.
 *
 * Архитектура из трёх файлов (контракт «один движок, много словарей»):
 *  - ru.js  — базовый движок WS.I18N (t/has/setLang/langs/size/lang) и
 *             русский словарь в WS.Data.locales.ru;
 *  - en.js  — английский словарь в WS.Data.locales.en (регистрируется
 *             уже на загрузке файла — WS.def('Data.locales.en', …));
 *  - i18n.js (этот файл) — «жизнь» локализации поверх базового движка:
 *    t(key)/setLang('ru'|'en')/getLang()/register(dict, lang), автовыбор
 *    языка по navigator.language, сохранение выбора в localStorage
 *    ('ws.lang'), горячая клавиша F9 (переключение на лету, тост-подсказка)
 *    и умный fallback: 'item.bread.name' -> 'Bread' (последний значимый
 *    сегмент ключа с заглавной буквой).
 *
 * ПОРЯДОК ЗАГРУЗКИ (scripts/build.py, алфавит): en.js -> i18n.js -> ru.js,
 * поэтому базовый движок определяется ПОСЛЕ нас. Решение: наш init стоит в
 * НАЧАЛЕ boot-очереди (WS._bootFns) — к моменту его запуска все файлы уже
 * загружены, WS.I18N из ru.js существует, а язык применяется ДО построения
 * статичных надписей UI (оверлей «ПАУЗА», кнопки подтверждения). Если же
 * порядок иной — init работает и в обычной очереди, а на случай «словарь
 * опоздал» есть повтор после первого кадра. Если ru.js вдруг нет —
 * поднимаем собственный самодостаточный движок (см. Engine).
 *
 * События: 'i18n:lang' {lang} — язык сменился (слушайте для перерисовки).
 * Связи: js/i18n/ru.js, js/i18n/en.js, js/ui/ui.js (тосты, T()),
 * js/content/notes.js (обёртка WS.Notes.get для заголовков записок).
 */
(function () {
  'use strict';

  // ====================================================================
  //  КОНСТАНТЫ И МАЛЫЕ УТИЛИТЫ
  // ====================================================================

  /** Ключ localStorage с выбранным языком. */
  var STORAGE_KEY = 'ws.lang';

  /** Свойство словаря без прототипной грязи. */
  function own(d, k) { return Object.prototype.hasOwnProperty.call(d, k); }

  /** Нормализация кода языка: 'EN' / ' en ' -> 'en'. */
  function normalize(code) {
    return String(code == null ? '' : code).toLowerCase().replace(/^\s+|\s+$/g, '');
  }

  /** Подстановка {токен} из объекта параметров (симметрично ru.js). */
  function subst(str, params) {
    return String(str).replace(/\{([a-zA-Z0-9_]+)\}/g, function (all, name) {
      return (params[name] != null) ? String(params[name]) : all;
    });
  }

  /**
   * Умный fallback: 'item.bread.name' -> 'Bread', 'ui.inventory' ->
   * 'Inventory'. Служебный хвост (.name/.desc/.title/.label) отбрасываем —
   * нужен не он, а идентификатор предмета; подчёркивания — в пробелы.
   */
  function smartFallback(key) {
    var s = String(key == null ? '' : key);
    if (!s) return s;
    var seg = s.split('.');
    var last = seg[seg.length - 1];
    if (seg.length > 1 &&
        (last === 'name' || last === 'desc' || last === 'title' || last === 'label')) {
      seg.pop();
    }
    var word = seg.length ? seg[seg.length - 1] : s;
    word = String(word).replace(/_/g, ' ');
    if (!word) word = s;
    return word.charAt(0).toUpperCase() + word.slice(1);
  }

  /** Словарь языка из контрактового хранилища (или null). */
  function dictOf(code) {
    if (WS.Data && WS.Data.locales && WS.Data.locales[code]) return WS.Data.locales[code];
    return null;
  }

  // ====================================================================
  //  ВЫБОР ЯЗЫКА: localStorage И navigator
  // ====================================================================

  function readStored() {
    try { return window.localStorage.getItem(STORAGE_KEY); }
    catch (e) { return null; }                // приватный режим — просто игнорим
  }

  function saveStored(code) {
    try { window.localStorage.setItem(STORAGE_KEY, code); }
    catch (e) { /* не переживаем: в памяти язык и так выбран */ }
  }

  /** navigator.language начинается с 'ru' -> ru, иначе en. */
  function detectLang() {
    var n = window.navigator || {};
    var l = String(n.language || n.userLanguage || n.browserLanguage || '').toLowerCase();
    return (l.indexOf('ru') === 0) ? 'ru' : 'en';
  }

  // ====================================================================
  //  ЗАПАСНОЙ ДВИЖОК (если базовый из ru.js почему-то не загрузился)
  //  Семантика та же: текущий словарь -> русский (канонический запасной)
  //  -> литерал вторым аргументом -> умный fallback.
  // ====================================================================

  var liveLang = 'ru';

  function engineHas(key) {
    var d = dictOf(liveLang);
    if (d && own(d, key)) return true;
    if (liveLang !== 'ru') {
      var r = dictOf('ru');
      if (r && own(r, key)) return true;
    }
    return false;
  }

  function engineT(key, a) {
    var v;
    var d = dictOf(liveLang);
    if (d && own(d, key)) v = d[key];
    else if (liveLang !== 'ru') {
      var r = dictOf('ru');
      if (r && own(r, key)) v = r[key];
    }
    if (v == null && typeof a === 'string' && a) v = a;
    if (v == null) v = smartFallback(key);
    if (a && typeof a === 'object') v = subst(v, a);
    return v;
  }
  engineT.__wsI18nSmart = true;              // уже умеет умный fallback

  function engineSetLang(code) {
    code = normalize(code);
    if (dictOf(code)) { liveLang = code; return true; }
    WS.warn('I18N: нет словаря "' + code + '"');
    return false;
  }

  function engineLangs() {
    var out = [];
    if (WS.Data && WS.Data.locales) {
      for (var k in WS.Data.locales) if (own(WS.Data.locales, k)) out.push(k);
    }
    return out.length ? out : ['ru'];
  }

  function engineSize(code) {
    var d = dictOf(code || liveLang);
    if (!d) return 0;
    var n = 0;
    for (var k in d) if (own(d, k)) n++;
    return n;
  }

  var Engine = {
    t: engineT,
    has: engineHas,
    setLang: engineSetLang,
    langs: engineLangs,
    size: engineSize,
    lang: function () { return liveLang; },
    getLang: function () { return liveLang; },
    register: function (dict, code) { return registerDict(dict, code); },
    toggle: function () { return toggleLang(); }
  };

  // ====================================================================
  //  ПУБЛИЧНЫЕ ФУНКЦИИ РАНТАЙМА
  //  (живут поверх ЛЮБОГО движка — базового из ru.js или запасного)
  // ====================================================================

  /** Текущий язык живого движка. */
  function getLangLive() {
    var I = WS.I18N;
    if (I && typeof I.getLang === 'function') return I.getLang();
    if (I && typeof I.lang === 'function') return I.lang();
    return 'ru';
  }

  /**
   * register(dict, lang): подключить новый словарь в WS.Data.locales.
   * Вернёт true при успехе. Пример: WS.I18N.register(DE, 'de').
   */
  function registerDict(dict, code) {
    if (!dict || typeof dict !== 'object') {
      WS.warn('I18N.register: первым аргументом нужен словарь-объект');
      return false;
    }
    code = normalize(code);
    if (!code || code === 'constructor' || code === '__proto__' || code === 'hasOwnProperty') {
      WS.warn('I18N.register: укажите код языка, например WS.I18N.register(DICT, "en")');
      return false;
    }
    WS.Data = WS.Data || {};
    WS.Data.locales = WS.Data.locales || {};
    WS.Data.locales[code] = dict;
    WS.log('I18N: зарегистрирован словарь «' + code + '» — ' + engineSize(code) + ' ключей');
    return true;
  }

  /** Смена языка «на лету»: F9, тост-подсказка, событие, сохранение. */
  function toggleLang() {
    var I = WS.I18N;
    if (!I || typeof I.setLang !== 'function') return null;
    var next = (getLangLive() === 'ru') ? 'en' : 'ru';
    return I.setLang(next) ? next : null;
  }

  /**
   * Побочные эффекты установленного языка: localStorage, <html lang>,
   * событие 'i18n:lang' и (не молча) тост-подсказка.
   */
  function applyLang(code, silent) {
    saveStored(code);
    try {
      if (document && document.documentElement) document.documentElement.lang = code;
    } catch (e) { /* DOM недоступен — переживём */ }
    if (WS.Ev && WS.Ev.emit) {
      try { WS.Ev.emit('i18n:lang', { lang: code }); } catch (e) { /* */ }
    }
    if (!silent && WS.Ui && WS.Ui.toast) {
      var line;
      if (code === 'en') line = WS.I18N.t('msg.i18n.switched', 'Language: English · press F9 for Russian');
      else line = WS.I18N.t('msg.i18n.switched', 'Язык: русский · F9 — English');
      try { WS.Ui.toast(line, 'info'); } catch (e) { /* */ }
    }
  }

  /** Повторная попытка применить язык после первого кадра (словарь опоздал). */
  function retryLater(code) {
    if (typeof WS.afterFirstFrame !== 'function') return;
    WS.afterFirstFrame(function () {
      try {
        var I = WS.I18N;
        if (I && typeof I.setLang === 'function' && getLangLive() !== code) {
          var ok = I.setLang(code);
          if (ok) WS.log('I18N: язык «' + code + '» применён после первого кадра');
        }
      } catch (e) { WS.warn('I18N: повтор не удался:', e && e.message); }
    });
  }

  // ====================================================================
  //  РАСШИРЕНИЕ ДВИЖКА (достраиваем API поверх ru.js, не трогая его файл)
  // ====================================================================

  /** Оригинальный setLang живого движка (для тихой установки при старте). */
  var rawSetLang = null;

  function safeHas(I, key) {
    try { return !!I.has(key); } catch (e) { return false; }
  }

  function extendEngine(I) {
    if (!I) return;

    // t(): умный fallback, если ключа нет ни в одном словаре и нет литерала
    if (typeof I.t === 'function' && !I.t.__wsI18nSmart) {
      var baseT = I.t;
      var wrappedT = function (key, a) {
        var known = (typeof I.has === 'function') ? safeHas(I, key) : false;
        var literal = (typeof a === 'string' && a) ? true : false;
        if (!known && !literal) {
          var fb = smartFallback(key);
          if (a && typeof a === 'object') fb = subst(fb, a);
          return fb;
        }
        return baseT.call(I, key, a);
      };
      wrappedT.__wsI18nSmart = true;
      I.t = wrappedT;
    }

    // setLang(): выбор языка теперь запоминается и объявляется событием
    if (typeof I.setLang === 'function' && !I.setLang.__wsI18nPersist) {
      var baseSet = I.setLang;
      rawSetLang = baseSet;
      var wrappedSet = function (code) {
        var ok = baseSet.call(I, code);
        if (ok) applyLang(normalize(code), false);
        return ok;
      };
      wrappedSet.__wsI18nPersist = true;
      I.setLang = wrappedSet;
    }

    // новые методы (чужие не перетираем)
    if (typeof I.getLang !== 'function') {
      I.getLang = function () {
        return (typeof I.lang === 'function') ? I.lang() : 'ru';
      };
    }
    if (typeof I.register !== 'function') I.register = function (dict, code) { return registerDict(dict, code); };
    if (typeof I.toggle !== 'function') I.toggle = function () { return toggleLang(); };
  }

  // ====================================================================
  //  F9: ПЕРЕКЛЮЧЕНИЕ НА ЛЕТУ
  // ====================================================================

  var f9Bound = false;

  function bindF9() {
    if (f9Bound) return;
    f9Bound = true;
    window.addEventListener('keydown', function (e) {
      if (!e || e.code !== 'F9' || e.repeat) return;
      var tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      try { e.preventDefault(); } catch (err) { /* у F9 нет своего действия */ }
      var next = toggleLang();               // тост покажет applyLang()
      if (!next) WS.warn('I18N: не удалось переключить язык (нет словаря?)');
    }, false);
  }

  // ====================================================================
  //  ЗАПИСКИ: локализация заголовков (тексты писем остаются голосом
  //  посёлка — по-русски; интерфейсу нужны название и место находки)
  // ====================================================================

  /** Найти метаданные бумаги в WS.Notes.all (id -> {place, …}). */
  function noteMeta(id) {
    var all = (WS.Notes && WS.Notes.all) || [];
    for (var i = 0; i < all.length; i++) {
      if (all[i] && all[i].id === id) return all[i];
    }
    return null;
  }

  function hookNotes() {
    if (!WS.Notes || typeof WS.Notes.get !== 'function') return;
    if (WS.Notes.get.__wsI18nHook) return;   // уже обёрнуто
    var baseGet = WS.Notes.get;
    var wrappedGet = function (id) {
      var n = baseGet.call(WS.Notes, id);
      try {
        if (n && getLangLive() !== 'ru' && WS.I18N && typeof WS.I18N.has === 'function') {
          var tk = 'note.' + id + '.title';
          if (WS.I18N.has(tk)) n.title = WS.I18N.t(tk);
          var meta = noteMeta(id);
          if (meta) {
            var pk = 'note.place.' + meta.place;
            if (WS.I18N.has(pk)) n.place = WS.I18N.t(pk);
          }
        }
      } catch (e) { /* журнал важнее локализации */ }
      return n;
    };
    wrappedGet.__wsI18nHook = true;
    WS.Notes.get = wrappedGet;
  }

  // ====================================================================
  //  INIT: применить язык, расширить движок, повесить F9
  // ====================================================================

  var inited = false;

  function initRuntime() {
    if (inited) return;
    inited = true;

    // 1) движок: базовый из ru.js (его WS.def уже выполнен при загрузке
    //    файла) либо, если его нет, наш самодостаточный запасной
    if (!WS.I18N) WS.def('I18N', Engine);
    var I = WS.I18N;
    extendEngine(I);

    // 2) язык: сохранённый выбор -> язык браузера -> русский.
    //    «ru» доступен всегда — это значение по умолчанию движка, словарь
    //    к этому моменту может быть ещё не зарегистрирован (boot ru.js).
    var stored = normalize(readStored());
    var target = (stored === 'ru' || dictOf(stored)) ? stored : detectLang();
    var cur = getLangLive();

    if (target !== cur) {
      var ok = rawSetLang ? rawSetLang.call(I, target) : I.setLang(target);
      if (ok) applyLang(target, true);        // тихо: UI ещё строится
      else retryLater(target);               // словарь опоздал — повторим
    } else {
      applyLang(target, true);                // закрепить авто-выбор
    }
    if (target !== 'ru' || cur !== 'ru') {
      WS.log('I18N: язык интерфейса — «' + getLangLive() + '»');
    }

    // 3) горячая клавиша и заголовки записок
    bindF9();
    hookNotes();
  }

  // ====================================================================
  //  ЗАГРУЗКА ФАЙЛА: ранний boot
  // ====================================================================

  if (WS.booted) {
    // файл подключили динамически, когда бут уже прошёл — стартуем сразу
    initRuntime();
  } else {
    WS.boot(initRuntime, 'i18n:init');

    // Переставляем наш init в НАЧАЛО boot-очереди (WS._bootFns, core/ns.js):
    // язык должен быть выбран до того, как UI построит статичные надписи
    // (оверлей «ПАУЗА», кнопки подтверждения, подсказка скорости). Очередь —
    // обычный массив без приоритетов, наш init ни от кого не зависит, а
    // словарь en уже зарегистрирован на загрузке en.js (WS.def). Если
    // перестановка не удалась — init просто выполнится в обычном порядке.
    try {
      var q = WS._bootFns;
      if (q && q.length) {
        for (var qi = q.length - 1; qi >= 0; qi--) {
          if (q[qi] && q[qi].fn === initRuntime) { q.splice(qi, 1); break; }
        }
        q.unshift({ fn: initRuntime, name: 'i18n:init-early' });
      }
    } catch (e) {
      WS.warn('I18N: ранний boot не переставлен — работаем в общем порядке');
    }
  }
})();
