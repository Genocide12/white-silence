/**
 * health_screen.js — ЭКРАН ЗДОРОВЬЯ «Белого Безмолвия» (клавиша H).
 * Кукла тела из CSS-зон: голова (обморожение), торс (кровотечение,
 * раны, инфекция), руки (обморожение пальцев), ноги (перелом, раны).
 * Справа — список активных состояний с описаниями и таймерами, полосы
 * здоровья и температуры ядра. Действия: перевязка, гипс, лубок,
 * обезболивающие — через WS.Health (bandage/useMed/splintFromPlanks).
 * Связи: Health.status(), Temp (frostbite/стадии), Inv.count, Ui.
 */
(function () {
  'use strict';

  // ====================================================================
  //  КОНСТАНТЫ
  // ====================================================================

  var TICK_UI = 80;            // приоритет UI (CONTRACT.md)
  var REFRESH_S = 0.25;        // частота обновления показаний, сек

  // пороги обморожения — синхронизированы с temperature.js (B1)
  var FB_MILD = 8;             // лёгкая припухлость — косметика
  var FB_FINGERS = 30;         // «пальцы» (штраф точности)
  var FB_SEVERE = 60;          // тяжёлое обморожение

  // пороги инфекции (для цвета зоны)
  var INFECT_WORRY = 20;

  // шкала температуры ядра для полосы, °C
  var TEMP_LO = 31.5;
  var TEMP_HI = 38.5;

  // анальгетики 1917 года: порядок кнопок
  var PAINKILLERS = [
    { id: 'aspirin',  name: 'Аспирин' },
    { id: 'laudanum', name: 'Лауданум' },
    { id: 'morphine', name: 'Морфий' },
    { id: 'vodka',    name: 'Водка' }
  ];

  // описание действий (для строк подсказок)
  var HINT_BANDAGE = 'Останавливает кровь и закрывает рану';
  var HINT_CAST = 'Гипс: 8 часов постельного режима';
  var HINT_SPLINT = 'Шина: ходить можно, срастётся за 16 часов';

  // ====================================================================
  //  СОСТОЯНИЕ МОДУЛЯ
  // ====================================================================

  var root = null;             // .ws-screen корень
  var isOpen = false;
  var refreshT = 0;           // троттлинг обновления
  var selZone = null;          // выбранная зона куклы (для подробностей)
  var inputWasEnabled = null;  // сохранённое состояние ввода

  // кэш ссылок на элементы
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

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  /**
   * Минимальный каркас WS.Ui (если настоящий UI ещё не загружен):
   * modal() по классу .ws-screen.open, toast() — DOM-тосты.
   */
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

  /** Количество предмета в инвентаре (свой обход, если Inv нет). */
  function invCount(id) {
    if (WS.Inv && WS.Inv.count) {
      try { return WS.Inv.count(id) || 0; } catch (e) { /* ниже */ }
    }
    var p = WS.G && WS.G.player;
    if (!p || !p.inv) return 0;
    var n = 0;
    for (var i = 0; i < p.inv.length; i++) {
      if (p.inv[i] && p.inv[i].id === id) n += (p.inv[i].count || 1);
    }
    return n;
  }

  /** Сводка здоровья (или null, если системы ещё нет). */
  function statusSafe() {
    if (!WS.Health || !WS.Health.status) return null;
    try { return WS.Health.status(); } catch (e) { return null; }
  }

  /** Обморожение 0..100 (из temperature.js; при его отсутствии — 0). */
  function frostbite() {
    if (WS.Temp && WS.Temp.frostbite) {
      try { return WS.Temp.frostbite() || 0; } catch (e) { return 0; }
    }
    var p = WS.G && WS.G.player;
    return p ? Math.round(p.frostbite || 0) : 0;
  }

  /** Температура ядра. */
  function coreTemp() {
    var p = WS.G && WS.G.player;
    return p ? (typeof p.temp === 'number' ? p.temp : 37.0) : 37.0;
  }

  /** Название стадии гипотермии. */
  function tempStageName() {
    if (WS.Temp && WS.Temp.stageName) {
      try { return WS.Temp.stageName() || ''; } catch (e) { /* ниже */ }
    }
    var t = coreTemp();
    if (t >= 36) return 'Тепло';
    if (t >= 35) return 'Холодно';
    if (t >= 34) return 'ОЧЕНЬ холодно';
    if (t >= 33) return 'Гипотермия';
    if (t >= 31) return 'Смертельный холод';
    return 'Смерть';
  }

  /** Минуты -> «X ч Y м». */
  function fmtDur(mins) {
    mins = Math.max(0, Math.round(mins));
    var h = Math.floor(mins / 60);
    var m = mins % 60;
    if (h <= 0) return m + ' м';
    if (m === 0) return h + ' ч';
    return h + ' ч ' + m + ' м';
  }

  /** Часы болезни, оставшиеся до выздоровления. */
  function sickLeft(st) {
    if (!st || !st.sick) return 0;
    var d = Math.max(0, (st.sickDur || 0) - (st.sickT || 0));
    return d;
  }

  // ====================================================================
  //  КУКЛА: ЗОНЫ И ИХ СОСТОЯНИЯ
  // ====================================================================

  /**
   * Классы зоны по сводке. Возвращает массив css-классов.
   * head — обморожение; torso — кровотечение/рана/инфекция;
   * arms — обморожение; legs — перелом/рана.
   */
  function zoneClasses(zone, st, fb) {
    var cls = [];
    if (zone === 'head' || zone === 'arms') {
      if (fb >= FB_SEVERE) cls.push('z-frost3');
      else if (fb >= FB_FINGERS) cls.push('z-frost2');
      else if (fb >= FB_MILD) cls.push('z-frost1');
    }
    if (zone === 'torso') {
      if (st && st.bleed > 0) cls.push('z-bleed');
      if (st && st.infection >= INFECT_WORRY) cls.push('z-infect');
      if (st && st.wound && !st.wound.treated) cls.push('z-wound');
    }
    if (zone === 'legs') {
      if (st && st.fracture) cls.push('z-fract');
      if (st && st.wound && !st.wound.treated) cls.push('z-wound');
      if (st && st.infection >= INFECT_WORRY) cls.push('z-infect');
    }
    if (zone === 'arms' && st && st.fracture) {
      // руки держат вес при хромоте — отметим болью
      if (st.pain >= 60) cls.push('z-wound');
    }
    return cls;
  }

  /** Текст бейджа зоны (число у части тела). */
  function zoneBadge(zone, st, fb) {
    if (zone === 'head') return fb >= FB_MILD ? fb + '%' : '';
    if (zone === 'torso') {
      if (st && st.bleed > 0) return st.bleed.toFixed(1).replace('.', ',');
      if (st && st.infection >= INFECT_WORRY) return st.infection + '%';
      return '';
    }
    if (zone === 'arms') return fb >= FB_MILD ? fb + '%' : '';
    if (zone === 'legs') return (st && st.fracture) ? 'перелом' : '';
    return '';
  }

  /** Подробное описание зоны (панель под куклой). */
  function zoneInfo(zone, st, fb) {
    var nl = '\n';
    if (zone === 'head') {
      var t = '<b>Голова и лицо.</b> ';
      if (fb >= FB_SEVERE) t += 'Тяжёлое обморожение (' + fb + '%): нос и щёки теряют чувствительность, кожа белеет. Нужно тепло, иначе — отмирание тканей.';
      else if (fb >= FB_FINGERS) t += 'Обморожение лица (' + fb + '%): покалывание, тугая кожа. Отогревайтесь у печи.';
      else if (fb >= FB_MILD) t += 'Лёгкое обморожение (' + fb + '%): щиплет щёки и уши. Шапка бы не помешала.';
      else t += 'Цела. Пока что.';
      if (st && st.drunk >= 50) t += nl + 'Опьянение (' + st.drunk + '%): в голове шумит.';
      return t;
    }
    if (zone === 'torso') {
      var t2 = '<b>Торс.</b> ';
      if (st && st.bleed > 0) {
        t2 += 'Кровотечение ' + st.bleed.toFixed(1).replace('.', ',') + ' из 10 — вы теряете около ' +
              (st.bleed * 0.8).toFixed(1).replace('.', ',') + ' hp в час. ';
      } else {
        t2 += 'Кровотечения нет. ';
      }
      if (st && st.wound) {
        t2 += 'Рана ' + st.wound.hours.toFixed(1).replace('.', ',') + ' ч: ' +
              (st.wound.treated ? 'перевязана' : 'открыта') +
              (st.wound.dirty ? ', загрязнена — гниёт' : '') + '. ';
      }
      if (st && st.infection > 0) {
        t2 += 'Инфекция ' + st.infection + '%.';
      }
      return t2;
    }
    if (zone === 'arms') {
      var t3 = '<b>Руки.</b> ';
      if (fb >= FB_SEVERE) t3 += 'Пальцы белые и не слушаются (' + fb + '%) — точность стрельбы сильно падает.';
      else if (fb >= FB_FINGERS) t3 += 'Обморожение пальцев (' + fb + '%): руки не гнутся, ружьё норовит выскользнуть.';
      else if (fb >= FB_MILD) t3 += 'Руки стынут (' + fb + '%). Варежки спасут.';
      else t3 += 'Руки в порядке.';
      return t3;
    }
    if (zone === 'legs') {
      var t4 = '<b>Ноги.</b> ';
      if (st && st.fracture) {
        t4 += 'ПЕРЕЛОМ. ';
        if (st.fracTreat) {
          t4 += (st.fracTreat.mode === 'cast' ? 'Нога в гипсе' : 'Нога в шине') +
                ', осталось ' + fmtDur(st.fracTreat.left) + ' покоя. ';
        } else {
          t4 += 'Без лечения: ходьба через боль, срастётся очень долго. Нужен гипс или лубок. ';
        }
      } else {
        t4 += 'Целы. ';
      }
      if (st && st.wound && !st.wound.treated) t4 += 'Открытая рана на бедре.';
      return t4;
    }
    return 'Выберите часть тела, чтобы рассмотреть подробнее.';
  }

  /** Применить классы и бейджи к частям куклы. */
  function applyZoneStates(st, fb) {
    var zones = ['head', 'torso', 'arms', 'legs'];
    for (var i = 0; i < zones.length; i++) {
      var z = zones[i];
      var el = refs[z];
      if (!el) continue;
      var cls = zoneClasses(z, st, fb);
      // сброс прежних классов состояний
      el.classList.remove('z-frost1', 'z-frost2', 'z-frost3');
      el.classList.remove('z-bleed', 'z-wound', 'z-infect', 'z-fract');
      for (var k = 0; k < cls.length; k++) el.classList.add(cls[k]);
      el.classList.toggle('sel', selZone === z);

      var badge = el.querySelector('.pbadge');
      if (badge) {
        var txt = zoneBadge(z, st, fb);
        if (txt) {
          badge.textContent = txt;
          badge.classList.add('show');
        } else {
          badge.classList.remove('show');
        }
      }
    }
    var info = refs.zoneInfo;
    if (info) info.innerHTML = selZone ? zoneInfo(selZone, st, fb) :
      'Кликните по части тела — появится подробный осмотр.';
  }

  // ====================================================================
  //  ПОЛОСЫ: ЗДОРОВЬЕ И ТЕМПЕРАТУРА ЯДРА
  // ====================================================================

  function applyBars(st) {
    var p = WS.G && WS.G.player;

    // --- hp ---
    if (refs.hpBar) {
      var hp = st ? st.hp : (p ? p.hp : 0);
      var max = st ? st.maxHp : (p ? p.maxHp : 100);
      var frac = clamp(hp / Math.max(1, max), 0, 1);
      refs.hpBar.style.width = (frac * 100).toFixed(1) + '%';
      refs.hpBar.parentNode.className = 'bar ' +
        (frac > 0.66 ? 'b-ok' : (frac > 0.33 ? 'b-warn' : 'b-bad'));
    }
    if (refs.hpVal) {
      refs.hpVal.textContent = st ? (st.hp + ' / ' + st.maxHp) : '—';
    }

    // --- температура ядра ---
    if (refs.tempBar) {
      var t = coreTemp();
      var f = clamp((t - TEMP_LO) / (TEMP_HI - TEMP_LO), 0, 1);
      refs.tempBar.style.width = (f * 100).toFixed(1) + '%';
      // чем ниже температура — тем «холоднее» полоса
      refs.tempBar.parentNode.className = 'bar ' +
        (t >= 36 ? 'b-ok' : (t >= 35 ? 'b-warn' : 'b-cold'));
    }
    if (refs.tempVal) {
      refs.tempVal.textContent = coreTemp().toFixed(1).replace('.', ',') + '°C';
    }
    if (refs.tempStage) {
      refs.tempStage.textContent = tempStageName();
    }
  }

  // ====================================================================
  //  СПИСОК АКТИВНЫХ СОСТОЯНИЙ
  // ====================================================================

  /**
   * Собрать список состояний: [{cls, ico, name, val, desc, timer}].
   * Порядок — по опасности: кровотечение, перелом, инфекция, болезнь,
   * обморожение, боль, опьянение, рана.
   */
  function buildStates(st, fb) {
    var out = [];
    if (!st) return out;

    // --- кровотечение ---
    if (st.bleed > 0) {
      out.push({
        cls: 'c-bad', ico: '! ',
        name: 'Кровотечение',
        val: st.bleed.toFixed(1).replace('.', ',') + ' / 10',
        desc: 'Теряете около ' + (st.bleed * 0.8).toFixed(1).replace('.', ',') +
              ' hp в час; кровь на снегу чуют хищники. Перевязка остановит.',
        timer: 'усиливается'
      });
    }

    // --- рана ---
    if (st.wound) {
      var wdesc = st.wound.treated
        ? 'Повязка держится, рана закрыта.'
        : 'Открытая рана: '.concat(st.wound.dirty ? 'загрязнена, гниёт и гонит инфекцию.' : 'чистая, но кровоточит.');
      out.push({
        cls: st.wound.treated ? 'c-warn' : 'c-bad',
        ico: '— ',
        name: 'Рана',
        val: st.wound.hours.toFixed(1).replace('.', ',') + ' ч',
        desc: wdesc,
        timer: st.wound.treated ? 'заживает' : 'нужна перевязка'
      });
    }

    // --- перелом ---
    if (st.fracture) {
      var fd, ft;
      if (st.fracTreat) {
        var mode = st.fracTreat.mode === 'cast' ? 'гипс' : 'шина';
        fd = 'Нога зафиксирована (' + mode + '). Спите или лежите в помещении — срастётся быстрее.';
        ft = 'осталось ' + fmtDur(st.fracTreat.left);
      } else {
        fd = 'Бег невозможен, ходьба — через боль. Нужен гипс (8 ч постели) или лубок (16 ч, на ногах).';
        ft = 'без лечения';
      }
      out.push({
        cls: st.fracTreat ? 'c-warn' : 'c-bad',
        ico: '/\\',
        name: 'Перелом ноги',
        val: '',
        desc: fd,
        timer: ft
      });
    }

    // --- инфекция ---
    if (st.infection > 0) {
      out.push({
        cls: st.infection >= 60 ? 'c-bad' : 'c-warn',
        ico: '~ ',
        name: 'Инфекция',
        val: st.infection + '%',
        desc: st.infection >= 60
          ? 'Жар и гной: при 100% начнётся сепсис. Нужен антисептик и перевязка.'
          : 'Рана воспаляется. Йод, карболка или чистая повязка не дадут гною разойтись.',
        timer: st.infection >= 60 ? 'сепсис близко' : 'растёт'
      });
    }

    // --- болезнь ---
    if (st.sick) {
      out.push({
        cls: 'c-warn', ico: '° ',
        name: 'Болезнь: ' + st.sick,
        val: sickLeft(st).toFixed(0) + ' ч',
        desc: 'Хворь владеет телом. Сон и горячая еда сокращают срок.',
        timer: 'до выздоровления'
      });
    }

    // --- обморожение ---
    if (fb >= FB_MILD) {
      out.push({
        cls: fb >= FB_SEVERE ? 'c-bad' : 'c-cold',
        ico: '* ',
        name: 'Обморожение',
        val: fb + '%',
        desc: fb >= FB_SEVERE
          ? 'Ткани белеют и отмирают. Срочно в тепло; при гангрене поможет только хирургия.'
          : (fb >= FB_FINGERS
            ? 'Пальцы не гнутся — точность стрельбы и шитья падает.'
            : 'Кожу щиплет. Вернитесь к огню.'),
        timer: fb >= FB_SEVERE ? 'угроза гангрены' : 'отогрев'
      });
    }

    // --- гипотермия ---
    var stageName = tempStageName();
    if (coreTemp() < 35.5) {
      out.push({
        cls: 'c-cold', ico: '° ',
        name: 'Температура ядра: ' + stageName,
        val: coreTemp().toFixed(1).replace('.', ',') + '°C',
        desc: 'Тело остывает. Печь, горячий чай и сухая одежда вернут тепло.',
        timer: 'ниже нормы'
      });
    }

    // --- боль ---
    if (st.pain >= 10) {
      out.push({
        cls: st.pain >= 60 ? 'c-bad' : 'c-warn',
        ico: '# ',
        name: 'Боль',
        val: st.pain + '%',
        desc: 'Точность минус ' + Math.round((st.accPen || 0) * 100) +
              '%, скорость минус ' + (st.pain > 60 ? '10' : '0') + '%.',
        timer: 'спадёт со временем'
      });
    }

    // --- опьянение ---
    if (st.drunk >= 5) {
      out.push({
        cls: st.drunk >= 80 ? 'c-bad' : 'c-warn',
        ico: '% ',
        name: 'Опьянение',
        val: st.drunk + '%',
        desc: st.drunk >= 80
          ? 'Отравление: печень не справляется, рассудок плывёт.'
          : 'Шаткая походка, но боль глухнет, а на душе теплее.',
        timer: 'выветрится'
      });
    }

    // --- всё хорошо ---
    if (!out.length) {
      out.push({
        cls: 'c-ok', ico: '✓ ',
        name: 'Тело цело',
        val: '',
        desc: 'Ран нет, хворь не цепляется. Так держать — север любит крепких.',
        timer: ''
      });
    }
    return out;
  }

  /** Перерисовать список состояний (innerHTML — данных извне нет). */
  function renderStates(st, fb) {
    if (!refs.states) return;
    var list = buildStates(st, fb);
    var out = '';
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      out +=
        '<div class="st-card ' + s.cls + '">' +
          '<div class="st-ico">' + esc(s.ico) + '</div>' +
          '<div class="st-mid">' +
            '<div class="st-name">' + esc(s.name) +
              (s.val ? ' <span class="st-val">' + esc(s.val) + '</span>' : '') +
            '</div>' +
            '<div class="st-desc">' + esc(s.desc) + '</div>' +
          '</div>' +
          (s.timer ? '<div class="st-timer">' + esc(s.timer) + '</div>' : '') +
        '</div>';
    }
    refs.states.innerHTML = out;
  }

  // ====================================================================
  //  ДЕЙСТВИЯ: ПЕРЕВЯЗКА, ГИПС, ЛУБОК, ОБЕЗБОЛИВАЮЩЕЕ
  // ====================================================================

  /** Какой бинт сработает (чистый лучше). */
  function bestBandage() {
    if (invCount('bandage_clean') > 0) return 'bandage_clean';
    if (invCount('bandage') > 0) return 'bandage';
    return null;
  }

  function doBandage() {
    if (!WS.Health || !WS.Health.bandage) { snd('error', 0.3); return; }
    var id = bestBandage();
    if (!id) {
      snd('error', 0.3);
      return;
    }
    var ok;
    try { ok = WS.Health.bandage(id); } catch (e) { ok = false; WS.err('bandage:', e && e.message); }
    if (ok) snd('craft', 0.5);
    refresh(true);
  }

  function doCast() {
    if (!WS.Health || !WS.Health.useMed) { snd('error', 0.3); return; }
    var ok;
    try { ok = WS.Health.useMed('plaster_cast'); } catch (e) { ok = false; WS.err('cast:', e && e.message); }
    if (ok) snd('craft', 0.5);
    refresh(true);
  }

  function doSplint() {
    if (!WS.Health) { snd('error', 0.3); return; }
    var ok = false;
    try {
      if (invCount('splint') > 0 && WS.Health.useMed) {
        ok = WS.Health.useMed('splint');
      } else if (WS.Health.splintFromPlanks) {
        ok = WS.Health.splintFromPlanks();
      }
    } catch (e) { ok = false; WS.err('splint:', e && e.message); }
    if (ok) snd('craft', 0.5);
    refresh(true);
  }

  function doPainkiller(id) {
    if (!WS.Health || !WS.Health.useMed) { snd('error', 0.3); return; }
    var ok;
    try { ok = WS.Health.useMed(id); } catch (e) { ok = false; WS.err('med:', e && e.message); }
    if (ok) snd('drink', 0.5);
    refresh(true);
  }

  /** Обновить доступность и подписи кнопок. */
  function renderActions(st) {
    // --- перевязка ---
    var band = bestBandage();
    var needBand = st && ((st.bleed > 0) || (st.wound && !st.wound.treated));
    if (refs.btnBandage) {
      refs.btnBandage.disabled = !band || !needBand;
      refs.btnBandage.textContent = 'Перевязать' +
        (band === 'bandage_clean' ? ' (чистый бинт ×' + invCount('bandage_clean') + ')' :
         band ? ' (бинт ×' + invCount('bandage') + ')' : ' (нет бинта)');
      refs.btnBandage.title = HINT_BANDAGE;
    }

    // --- гипс ---
    var canCast = st && st.fracture && !st.fracTreat && invCount('plaster_cast') > 0;
    if (refs.btnCast) {
      refs.btnCast.disabled = !canCast;
      refs.btnCast.textContent = 'Гипс' +
        (invCount('plaster_cast') > 0 ? ' (×' + invCount('plaster_cast') + ')' : '');
      refs.btnCast.title = HINT_CAST;
    }

    // --- лубок ---
    var haveSplint = invCount('splint') > 0;
    var canImprov = invCount('plank') > 0 && (invCount('cloth_rag') > 0 || invCount('rope') > 0);
    var canSplint = st && st.fracture && !st.fracTreat && (haveSplint || canImprov);
    if (refs.btnSplint) {
      refs.btnSplint.disabled = !canSplint;
      refs.btnSplint.textContent = haveSplint
        ? 'Лубок (шина ×' + invCount('splint') + ')'
        : (canImprov ? 'Лубок (доска + тряпка)' : 'Лубок');
      refs.btnSplint.title = haveSplint ? HINT_SPLINT :
        'Быстрая шина «на коленке»: 1 доска + тряпка или верёвка. ' + HINT_SPLINT;
    }

    // --- обезболивающие ---
    if (refs.pills) {
      var out = '';
      var p = WS.G && WS.G.player;
      var pain = p ? (p.pain || 0) : 0;
      for (var i = 0; i < PAINKILLERS.length; i++) {
        var pk = PAINKILLERS[i];
        var n = invCount(pk.id);
        out += '<button class="pill-btn" data-med="' + pk.id + '"' +
               (n <= 0 ? ' disabled' : '') + '>' +
               pk.name + (n > 0 ? ' <b>×' + n + '</b>' : '') +
               '</button>';
      }
      refs.pills.innerHTML = out;
      // обработчики (кнопки пересоздаются)
      var btns = refs.pills.querySelectorAll('button');
      for (var b = 0; b < btns.length; b++) {
        (function (btn) {
          btn.addEventListener('click', function () {
            doPainkiller(btn.getAttribute('data-med'));
          }, false);
        })(btns[b]);
      }
    }
  }

  // ====================================================================
  //  DOM: ПОСТРОЕНИЕ ОКНА
  // ====================================================================

  function buildDom() {
    if (root) return;
    var uiRoot = document.getElementById('ui-root');
    if (!uiRoot) { WS.warn('health: нет #ui-root'); return; }

    root = document.createElement('div');
    root.className = 'ws-panel ws-screen ws-health-screen hidden';
    root.innerHTML =
      '<div class="ws-frame" style="width:980px;max-width:96vw;height:640px;max-height:92vh">' +
        '<div class="scr-head">' +
          '<span class="scr-title">Здоровье</span>' +
          '<span class="scr-sub" id="ws-hp-sub">Осмотр тела</span>' +
          '<span class="scr-key">H</span>' +
          '<button class="scr-close" title="Закрыть (H / Esc)">&#10005;</button>' +
        '</div>' +
        '<div class="scr-body hp-body">' +
          '<div class="hp-left">' +
            '<div class="hp-doll-wrap">' +
              '<div class="hp-doll">' +
                '<div class="part d-head" data-zone="head"><span class="pbadge"></span></div>' +
                '<div class="part d-torso" data-zone="torso"><span class="pbadge"></span></div>' +
                '<div class="part d-arm-l" data-zone="arms"><span class="pbadge"></span></div>' +
                '<div class="part d-arm-r" data-zone="arms"><span class="pbadge"></span></div>' +
                '<div class="part d-leg-l" data-zone="legs"><span class="pbadge"></span></div>' +
                '<div class="part d-leg-r" data-zone="legs"><span class="pbadge"></span></div>' +
              '</div>' +
            '</div>' +
            '<div class="hp-zone-info" id="ws-hp-zone-info">' +
              'Кликните по части тела — появится подробный осмотр.' +
            '</div>' +
            '<div class="bar-line">' +
              '<span class="bar-name">Здоровье</span>' +
              '<div class="bar"><i id="ws-hp-bar"></i></div>' +
              '<span class="bar-val" id="ws-hp-val">—</span>' +
            '</div>' +
            '<div class="bar-line">' +
              '<span class="bar-name">Ядро, °C</span>' +
              '<div class="bar"><i id="ws-hp-temp"></i></div>' +
              '<span class="bar-val" id="ws-hp-temp-val">—</span>' +
            '</div>' +
            '<div class="bar-line" style="justify-content:flex-end">' +
              '<span class="tag" id="ws-hp-stage">—</span>' +
            '</div>' +
          '</div>' +
          '<div class="hp-right">' +
            '<div class="hp-states" id="ws-hp-states"></div>' +
            '<div class="hp-actions">' +
              '<h4>Первая помощь</h4>' +
              '<div class="btn-row">' +
                '<button class="ws-btn btn-s" id="ws-hp-bandage" title="' + HINT_BANDAGE + '">Перевязать</button>' +
                '<button class="ws-btn btn-s" id="ws-hp-cast" title="' + HINT_CAST + '">Гипс</button>' +
                '<button class="ws-btn btn-s" id="ws-hp-splint">Лубок</button>' +
              '</div>' +
              '<h4 style="margin-top:12px">Обезболивающее</h4>' +
              '<div class="btn-row" id="ws-hp-pills"></div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="scr-foot">' +
          '<b>H / Esc</b> — закрыть · осмотр останавливает не всё: время идёт' +
        '</div>' +
      '</div>';

    uiRoot.appendChild(root);

    // ссылки на элементы
    refs = {
      head: root.querySelector('.d-head'),
      torso: root.querySelector('.d-torso'),
      arms: root.querySelector('.d-arm-l'),   // бейдж ведём по левой, классы — по обеим
      arms2: root.querySelector('.d-arm-r'),
      legs: root.querySelector('.d-leg-l'),
      legs2: root.querySelector('.d-leg-r'),
      zoneInfo: root.querySelector('#ws-hp-zone-info'),
      hpBar: root.querySelector('#ws-hp-bar'),
      hpVal: root.querySelector('#ws-hp-val'),
      tempBar: root.querySelector('#ws-hp-temp'),
      tempVal: root.querySelector('#ws-hp-temp-val'),
      tempStage: root.querySelector('#ws-hp-stage'),
      states: root.querySelector('#ws-hp-states'),
      btnBandage: root.querySelector('#ws-hp-bandage'),
      btnCast: root.querySelector('#ws-hp-cast'),
      btnSplint: root.querySelector('#ws-hp-splint'),
      pills: root.querySelector('#ws-hp-pills'),
      sub: root.querySelector('#ws-hp-sub')
    };

    // клик по части тела: выбор зоны
    var parts = root.querySelectorAll('.part');
    for (var i = 0; i < parts.length; i++) {
      (function (el) {
        el.addEventListener('click', function () {
          selZone = el.getAttribute('data-zone');
          refresh(true);
          snd('click', 0.25);
        }, false);
      })(parts[i]);
    }

    // закрытие
    var closeBtn = root.querySelector('.scr-close');
    if (closeBtn) closeBtn.addEventListener('click', function () { close(); }, false);

    // действия
    if (refs.btnBandage) refs.btnBandage.addEventListener('click', doBandage, false);
    if (refs.btnCast) refs.btnCast.addEventListener('click', doCast, false);
    if (refs.btnSplint) refs.btnSplint.addEventListener('click', doSplint, false);
  }

  // ====================================================================
  //  ОБНОВЛЕНИЕ / ОТКРЫТИЕ / ЗАКРЫТИЕ
  // ====================================================================

  /** Полное обновление показаний. */
  function refresh(force) {
    if (!root || !isOpen) return;
    var st = statusSafe();
    var fb = frostbite();

    // подзаголовок: температура снаружи
    if (refs.sub && WS.Weather && WS.Weather.tempOutside) {
      try {
        var out = Math.round(WS.Weather.tempOutside());
        refs.sub.textContent = 'Осмотр тела · на дворе ' + out + '°C';
      } catch (e) { /* молча */ }
    }

    applyZoneStates(st, fb);
    applyZoneStatesMirror(st, fb);   // парные конечности
    applyBars(st);
    renderStates(st, fb);
    renderActions(st);
    if (force) renderT = 0;
  }

  /** Правая рука/нога получают те же классы, что и левая. */
  function applyZoneStatesMirror(st, fb) {
    var pairs = [[refs.arms, refs.arms2, 'arms'], [refs.legs, refs.legs2, 'legs']];
    for (var i = 0; i < pairs.length; i++) {
      var a = pairs[i][0], b = pairs[i][1];
      if (!a || !b) continue;
      var cls = zoneClasses(pairs[i][2], st, fb);
      b.classList.remove('z-frost1', 'z-frost2', 'z-frost3');
      b.classList.remove('z-bleed', 'z-wound', 'z-infect', 'z-fract');
      for (var k = 0; k < cls.length; k++) b.classList.add(cls[k]);
      var badgeB = b.querySelector('.pbadge');
      if (badgeB) {
        var txt = zoneBadge(pairs[i][2], st, fb);
        if (txt) {
          badgeB.textContent = txt;
          badgeB.classList.add('show');
        } else {
          badgeB.classList.remove('show');
        }
      }
    }
  }

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

    refresh(true);
    snd('select', 0.4);
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
    if (d && (d.code === 'KeyH' || d.code === 'Escape')) close();
  }

  // ====================================================================
  //  ТИК 80
  // ====================================================================

  function uiTick(dt) {
    try {
      if (!isOpen) {
        if (!playable()) return;
        if (anyOtherOpen()) return;
        if (WS.Ui && WS.Ui.modal && WS.Ui.modal()) return;
        if (WS.Input && WS.Input.hit && WS.Input.hit('health')) open();
        return;
      }
      if (!WS.G.running) { close(); return; }

      // пока окно открыто — показания живут
      refreshT += dt;
      if (refreshT >= REFRESH_S) {
        refreshT = 0;
        refresh(false);
      }
    } catch (e) {
      WS.err('health uiTick:', e && e.message);
    }
  }

  // ====================================================================
  //  ПУБЛИЧНЫЙ API + BOOT
  // ====================================================================

  var HealthScreen = {
    open: open,
    close: close,
    toggle: toggle,
    isOpen: function () { return isOpen; },
    refresh: function () { refresh(true); }
  };

  WS.def('HealthScreen', HealthScreen);

  WS.boot(function bootHealthScreen() {
    ensureUiBase();
    buildDom();

    WS.tick(TICK_UI, uiTick, 'ui:health');
    WS.Ev.on('key:down', onKey);

    // смерть/победа: не заслоняем финальные экраны
    WS.Ev.on('player:die', close);
    WS.Ev.on('game:victory', close);

    WS.log('ui: экран здоровья готов (H)');
  }, 'ui:health:init');

})();
