/**
 * tutorial.js — ОБУЧЕНИЕ (модуль J1): пошаговый туториал по действиям.
 * 15 шагов: движение, осмотр, дверь, обыск, инвентарь, экипировка, холод,
 * огонь, ночь, еда, сон, шум, волки, сохранение, радио. Каждый шаг ждёт
 * РЕАЛЬНОГО действия игрока (не тост-спам): панель внизу по центру висит,
 * пока шаг не выполнен; по таймауту — повторная подсказка через очередь
 * HUD-хинтов (WS.Hud.hint, ключи tut_*), а не новые тосты.
 *
 * Хранение прогресса: WS.G.story.hints (переживает сейв; см. state.js) —
 * ключи 'tut_<id>'. Завершённый шаг дополнительно гасит однострочный
 * HUD-хинт той же темы (move/search/inv/fire/night/cold/sleep) — не
 * дублируем, а расширяем очередь D1.
 *
 * Отключение: кнопка в панели, переключатель в оверлее «ПАУЗА»
 * (#ws-pause, вживлётся лениво т.к. ui.js строит его позже) и
 * WS.Tutorial.setEnabled(false) для соседей. Выбор живёт в localStorage
 * ('ws.tutorial') и в G.story.flags.tutorialOff на текущую партию.
 *
 * Связи: WS.Ui (toast/confirm/isOpen), WS.Hud (очередь хинтов),
 * WS.Input (down/hit/mouse), WS.Cam (zoom), WS.World (objsAt/entsNear/
 * isInside), WS.Time (ночь), события 'game:start' | 'game:load' |
 * 'player:damage' | 'night:fall' | 'item:picked' | 'loot:searched' |
 * 'inv:changed' | 'equip:changed' | 'fire:lit' | 'player:ate' |
 * 'game:save' | 'day:dawn' | 'ui:screen'.
 */
(function () {
  'use strict';

  // ====================================================================
  //  КОНСТАНТЫ И НАСТРОЙКИ
  // ====================================================================

  /** Приоритет тика UI (CONTRACT.md: 80 — UI). */
  var TICK_PRI = 80;

  /** Ключ localStorage: 'off' — обучение отключено игроком навсегда. */
  var LS_KEY = 'ws.tutorial';

  /** Пауза после game:start до первого шага, сек. */
  var START_DELAY = 1.6;

  /** Шаг «Движение»: сколько секунд идти, чтобы засчиталось. */
  var MOVE_NEED = 2.0;

  /** Первая повторная подсказка по таймауту, сек от активации шага. */
  var REMIND_1 = 40;

  /** Вторая (последняя) повторная подсказка, сек от активации шага. */
  var REMIND_2 = 150;

  /** Радиус «дверь близко» (активация шага «Первая дверь»), тайлов. */
  var DOOR_ARM_R = 3.0;

  /** Радиус «дверь открыта где-то рядом» (завершение шага), тайлов. */
  var DOOR_DONE_R = 6.0;

  /** Радиус «контейнер близко» (активация шага «Первый обыск»), тайлов. */
  var CONT_ARM_R = 2.5;

  /** Дед-ветка: радиус «мультяшка рядом» (шаг «Первое изгнание»). */
  var CZ_BANISH_ARM_R = 6.0;

  /** Дед-ветка: радиус «подарок рядом» (шаг «Подарок»). */
  var CZ_GIFT_ARM_R = 3.0;

  /** Радиус «кровать рядом» (активация шага «Сон»), тайлов. */
  var BED_ARM_R = 2.2;

  /** Радиус «волк слышен/виден» (активация шага «Волки»), тайлов. */
  var WOLF_ARM_R = 12.0;

  /** Усталость ниже этого значения — пора советовать сон. */
  var FATIGUE_ARM = 45;

  /** Порог температуры тела для шага «Холод» (по заданию J1). */
  var COLD_TEMP = 36.0;

  /** Сколько секунд шаг «Шум» висит сам, без нажатия «Понял». */
  var NOISE_TTL = 25;

  /** Период ленивой вживлялки кнопки в оверлей ПАУЗЫ, сек. */
  var PAUSE_RETRY = 2.0;

  // ====================================================================
  //  СОСТОЯНИЕ МОДУЛЯ
  // ====================================================================

  /** Живые состояния шага: WAIT — ждёт триггера, ACTIVE — учит,
   *  DONE — выполнен, SKIP — пропущен игроком. */
  var WAIT = 0, ACTIVE = 1, DONE = 2, SKIP = 3;

  /** Реестр шагов (заполняется ниже, STEPS). */
  var steps = [];

  /** id -> объект шага (для быстрых проверок). */
  var byId = {};

  /** Очередь активных шагов к показу (отсортирована по порядку). */
  var queue = [];

  /** Шаг, показанный в панели прямо сейчас (null — панель спрятана). */
  var shown = null;

  /** Панель свёрнута в «жетон» кнопкой «Понял»/стрелкой. */
  var minimized = false;

  /** Обучение включено? (localStorage + флаг партии). */
  var enabled = true;

  /** Сколько шаг пребывает активным (для повторных подсказок и TTL —
   *  копится в самом шаге, см. pollCompletes). */
  // (счётчики времени и реплик живут в полях шага: st.activeT, st.reminded)

  /** Накопитель секунд ходьбы (шаг «Движение»). */
  var moveT = 0;

  /** Запомненный зум при активации шага «Осмотр». */
  var zoomRef = 0;

  /** Таймер отложенного старта первого шага (игровых сек). */
  var startT = -1;
  var activeT = 0;      // сколько сек активен текущий шаг (TTL/напоминания)
  var reminders = 0;    // сколько раз напомнили о текущем шаге

  /** Таймер ленивой вживлялки кнопки в #ws-pause. */
  var pauseT = 0;

  /** Кнопка в оверлее паузы уже вживлена? */
  var pauseInjected = false;

  /** Панель сейчас спрятана из-за чужого модального окна? */
  var modalHidden = false;

  /** DOM панели и жетона (строится в boot). */
  var dom = {
    root: null, chip: null,
    stepNo: null, title: null, text: null, dots: null, hint: null,
    ok: null, skip: null, off: null, min: null,
    chipLabel: null
  };

  var built = false;        // DOM построен
  var bound = false;        // события подписаны

  // ====================================================================
  //  МАЛЫЕ УТИЛИТЫ
  // ====================================================================

  /** Перевод: словарь i18n, иначе русский литерал (контракт п.4). */
  function T(key, fb) {
    if (WS.I18N && WS.I18N.t) {
      try { return WS.I18N.t(key, fb); } catch (e) { /* словарь не готов */ }
    }
    return (typeof fb === 'string') ? fb : key;
  }

  /** Создать элемент: тег, класс, текст, (необязательный) родитель. */
  function el(tag, cls, text, parent) {
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    if (text !== undefined && text !== null) d.textContent = text;
    if (parent) parent.appendChild(d);
    return d;
  }

  /** Кнопка в стиле .ws-btn (со щелчком, как Ui.btn — но без зависимости). */
  function btn(label, cls, onClick) {
    var b = el('button', 'ws-btn' + (cls ? ' ' + cls : ''));
    b.type = 'button';
    b.textContent = label;
    b.addEventListener('click', function (ev) {
      if (WS.Snd && WS.Snd.play) {
        try { WS.Snd.play('click', { vol: 0.3 }); } catch (e) { /* тихо */ }
      }
      if (onClick) onClick(ev);
    });
    return b;
  }

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  /** Безопасная подписка на событие: ошибки туториала не роняют эмиттер. */
  function on(name, fn) {
    WS.Ev.on(name, function (d) {
      try { fn(d); } catch (e) {
        WS.err('tutorial: событие "' + name + '"', e && e.message);
      }
    });
  }

  /** Партия жива? (не меню, не смерть, не победа). */
  function running() {
    return !!(WS.G && WS.G.running && !WS.G.dead && WS.G.player);
  }

  /** Краткая ссылка на игрока (или null). */
  function P() {
    return (WS.G && WS.G.player) ? WS.G.player : null;
  }

  /** Краткая ссылка на мир (или null). */
  function W() {
    return (WS.World && WS.World.objects) ? WS.World : null;
  }

  /** Хранилище подсказок WS.G.story.hints (гарантированно есть). */
  function hints() {
    var g = WS.G;
    if (!g) return null;
    if (!g.story || typeof g.story !== 'object') g.story = {};
    if (!g.story.hints || typeof g.story.hints !== 'object') g.story.hints = {};
    return g.story.hints;
  }

  /** Флаги сюжета (тут живёт tutorialOff на текущую партию). */
  function flags() {
    var g = WS.G;
    if (!g) return null;
    if (!g.story || typeof g.story !== 'object') g.story = {};
    if (!g.story.flags || typeof g.story.flags !== 'object') g.story.flags = {};
    return g.story.flags;
  }

  /** Сколько предмета id в инвентаре (через WS.Inv, если он есть). */
  function invCount(id) {
    var p = P();
    if (!p || !p.inv) return 0;
    var n = 0;
    for (var i = 0; i < p.inv.length; i++) {
      if (p.inv[i] && p.inv[i].id === id) n += (p.inv[i].count || 1);
    }
    return n;
  }

  /** Определение предмета из данных. */
  function defOf(id) {
    return (WS.Data && WS.Data.items && WS.Data.items[id]) || null;
  }

  /** Есть ли в инвентаре предмет с тегом (например 'firestarter')? */
  function invHasTag(tag) {
    var p = P();
    if (!p || !p.inv) return false;
    for (var i = 0; i < p.inv.length; i++) {
      var d = defOf(p.inv[i] && p.inv[i].id);
      if (d && d.tags && d.tags.indexOf(tag) >= 0) return true;
    }
    return false;
  }

  /** Есть ли в инвентаре еда (cat 'food'/'drink')? */
  function hasFoodItem() {
    var p = P();
    if (!p || !p.inv) return false;
    for (var i = 0; i < p.inv.length; i++) {
      var d = defOf(p.inv[i] && p.inv[i].id);
      if (d && (d.cat === 'food' || d.cat === 'drink')) return true;
    }
    return false;
  }

  /** Есть ли надеваемая вещь (у определения есть slots)? */
  function hasEquippable() {
    var p = P();
    if (!p || !p.inv) return false;
    for (var i = 0; i < p.inv.length; i++) {
      var d = defOf(p.inv[i] && p.inv[i].id);
      if (d && d.slots && d.slots.length) return true;
    }
    return false;
  }

  // ====================================================================
  //  ПОИСК ОБЪЕКТОВ ВОКРУГ ИГРОКА
  //  (дешёвая квадратная развертка objsAt в радиусе r тайлов)
  // ====================================================================

  /** Первый объект, для которого pred(o) истинен и он ближе r тайлов. */
  function nearObj(r, pred) {
    var w = W();
    var p = P();
    if (!w || !p || !w.objsAt) return null;
    var R = Math.ceil(r);
    var ptx = Math.floor(p.x), pty = Math.floor(p.y);
    for (var cy = pty - R; cy <= pty + R; cy++) {
      for (var cx = ptx - R; cx <= ptx + R; cx++) {
        var list = w.objsAt(cx, cy);
        if (!list || !list.length) continue;
        for (var i = 0; i < list.length; i++) {
          var o = list[i];
          if (!o || !pred(o)) continue;
          if (WS.M.dist(p.x, p.y, o.x, o.y) <= r) return o;
        }
      }
    }
    return null;
  }

  /** Дверь в радиусе r? */
  function nearDoor(r) {
    return nearObj(r, function (o) { return !!o.door; });
  }

  /** Открытая дверь в радиусе r? (завершение шага «Первая дверь») */
  function nearOpenDoor(r) {
    return nearObj(r, function (o) { return !!(o.door && o.open); });
  }

  /** Не обчищенный контейнер в радиусе r? */
  function nearContainer(r) {
    return nearObj(r, function (o) {
      return !!(o.container && !o.looted);
    });
  }

  /** Кровать/тахта в радиусе r? (спрайты bed_wood / bed_fancy) */
  function nearBed(r) {
    return nearObj(r, function (o) {
      return !!(o.sprName && o.sprName.indexOf('bed') === 0);
    });
  }

  /** Волк в радиусе r? (слышен вой — активация шага «Волки») */
  function wolfNear(r) {
    var w = W();
    var p = P();
    if (!w || !p || !w.entsNear) return false;
    var list = w.entsNear(p.x, p.y, r);
    if (!list) return false;
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].kind === 'wolf' && !list[i].dead) return true;
    }
    return false;
  }

  /** Игрок внутри здания? */
  function inside() {
    var w = W();
    var p = P();
    if (!w || !p || !w.isInside) return false;
    try { return !!w.isInside(p.x, p.y); } catch (e) { return false; }
  }

  // ====================================================================
  //  ОПРЕДЕЛЕНИЯ ШАГОВ
  //  mode: 'wait'   — ждёт действия (панель висит, «Понял» сворачивает);
  //        'advice' — совет (панель висит до «Понял» или условия);
  //  auto: true     — стартует сам по порядку (без внешнего триггера);
  //  hudKey:        — какой однострочный хинт HUD погасить по завершении
  //                   (не дублируем очередь D1 — расширяем её);
  //  remind:        — текст повторной подсказки по таймауту;
  //  arm/complete   — функции триггера и проверки (см. движок ниже).
  // ====================================================================

  function STEPS() {
    return [
      // ------------------------------------------------------------
      // 1. ДВИЖЕНИЕ — первые секунды игры. Ждём 2 секунды непрерывной
      //    (или суммарной — см. moveT) ходьбы. Телеграфист долго сидел
      //    в тёплой конторе: пусть разомнёт ноги, пока мороз не взялся.
      // ------------------------------------------------------------
      {
        id: 'move', order: 1, mode: 'wait', auto: true, hudKey: 'move',
        title: T('tut.move.title', 'Первые шаги'),
        text: T('tut.move.text',
          'WASD или стрелки — идти. Пройдитесь по снегу: осмотритесь, ' +
          'где вы и что вокруг. Зима долгая — привыкайте к ногам.'),
        remind: T('tut.move.remind',
          'Шагните: W, A, S или D (можно стрелки).'),
        wait: T('tut.move.wait', 'Идите — 2 секунды хватит.'),
        done: T('tut.move.done', 'Ноги помнят дорогу'),
        arm: null,   // стартует сам на game:start
        complete: null   // особый случай: накопитель moveT в тике
      },

      // ------------------------------------------------------------
      // 2. ОСМОТР — камера и зум. Ждём любого изменения приближения.
      //    Увиденное на Севере дороже припасов: издалека и дым виднее,
      //    и волчий след читается.
      // ------------------------------------------------------------
      {
        id: 'look', order: 2, mode: 'wait', auto: true, hudKey: null,
        title: T('tut.look.title', 'Осмотр'),
        text: T('tut.look.text',
          'Колесо мыши — приблизить и отдалить камеру. Покрутите: ' +
          'зимой увиденное дороже припасов. Клавиши «+» и «−» делают то же.'),
        remind: T('tut.look.remind',
          'Покрутите колесо мыши — смените приближение.'),
        wait: T('tut.look.wait', 'Крутаните колесо мыши.'),
        done: T('tut.look.done', 'Глаз — первое орудие промысла'),
        arm: null,   // активируется после завершения шага «Движение»
        complete: null   // особый случай: изменение зума в тике
      },

      // ------------------------------------------------------------
      // 3. ПЕРВАЯ ДВЕРЬ. Когда игрок в ~3 тайлах от двери — совет [E].
      //    Выполнение: любая дверь рядом оказалась открытой.
      // ------------------------------------------------------------
      {
        id: 'door', order: 3, mode: 'wait', hudKey: null,
        title: T('tut.door.title', 'Первая дверь'),
        text: T('tut.door.text',
          'Рядом дверь. Встаньте вплотную и нажмите [E] — открыть. ' +
          'Двери здесь скрипят на весь квартал: и вам слышно, и волку.'),
        remind: T('tut.door.remind',
          '[E] у двери — открыть или закрыть.'),
        wait: T('tut.door.wait', 'Откройте дверь клавишей [E].'),
        done: T('tut.door.done', 'Скрип слышал весь квартал'),
        arm: function () { return !!nearDoor(DOOR_ARM_R); },
        complete: function () { return !!nearOpenDoor(DOOR_DONE_R); }
      },

      // ------------------------------------------------------------
      // 4. ПЕРВЫЙ ОБЫСК. У контейнера — совет. Выполнение: событие
      //    'loot:searched' (обыск завершён). Чужие припасы — своя зима.
      // ------------------------------------------------------------
      {
        id: 'search', order: 4, mode: 'wait', hudKey: 'search',
        title: T('tut.search.title', 'Первый обыск'),
        text: T('tut.search.text',
          'Шкафы, полки, сундуки — всё обыск: подойдите вплотную и ' +
          'нажмите [E]. Без чужих припасов своя зима коротка.'),
        remind: T('tut.search.remind',
          'Встаньте у шкафа или полки и нажмите [E].'),
        wait: T('tut.search.wait', 'Обыщите шкаф или полку: [E].'),
        done: T('tut.search.done', 'Чужое добро — своя зима'),
        arm: function () { return !!nearContainer(CONT_ARM_R); },
        complete: null   // событие loot:searched
      },

      // ------------------------------------------------------------
      // 5. ИНВЕНТАРЬ. После первых находок — клавиша I. Выполнение:
      //    окно инвентаря открылось (событие 'ui:screen' / опрос).
      // ------------------------------------------------------------
      {
        id: 'inv', order: 5, mode: 'wait', hudKey: 'inv',
        title: T('tut.inv.title', 'Инвентарь'),
        text: T('tut.inv.text',
          'Находки лежат в инвентаре. Откройте его: [I] или [Tab]. ' +
          'Вещи можно надевать, есть, читать и чинить — всё оттуда.'),
        remind: T('tut.inv.remind',
          'Откройте инвентарь: [I] или [Tab].'),
        wait: T('tut.inv.wait', 'Откройте инвентарь: [I] или [Tab].'),
        done: T('tut.inv.done', 'Всё своё — на виду'),
        arm: function () {
          // после первого обыска или первой подобранной вещи
          var h = hints();
          return !!(h && (h.tut_search || h._tutFirstPick));
        },
        complete: function () {
          try {
            return !!(WS.Ui && WS.Ui.isOpen && WS.Ui.isOpen('inventory'));
          } catch (e) { return false; }
        }
      },

      // ------------------------------------------------------------
      // 6. ЭКИПИРОВКА. Когда в сумке появилась надеваемая вещь — совет.
      //    Выполнение: событие 'equip:changed'. Шапка и валенки на
      //    Севере дороже золота — и мемориал не нужен, примерзнет.
      // ------------------------------------------------------------
      {
        id: 'equip', order: 6, mode: 'wait', hudKey: null,
        title: T('tut.equip.title', 'Экипировка'),
        text: T('tut.equip.text',
          'Тёплая одежда надевается в инвентаре: выберите вещь и нажмите ' +
          '«Надеть» (или дважды щёлкните по ней). Слоты — на панели внизу. ' +
          'Шапка и валенки на Севере дороже золота.'),
        remind: T('tut.equip.remind',
          'Выберите одежду в инвентаре ([I]) и наденьте её.'),
        wait: T('tut.equip.wait', 'Наденьте что-нибудь тёплое.'),
        done: T('tut.equip.done', 'Теперь ветер не так страшен'),
        arm: function () { return hasEquippable(); },
        complete: null   // событие equip:changed
      },

      // ------------------------------------------------------------
      // 7. ХОЛОД. Первый раз температура тела < 36° — предупреждение
      //    и совет (это совет, не действие). Снимается «Понял» или
      //    согреванием обратно до 36.5°.
      // ------------------------------------------------------------
      {
        id: 'cold', order: 7, mode: 'advice', hudKey: 'cold',
        title: T('tut.cold.title', 'Холод'),
        text: T('tut.cold.text',
          'Вас знобит: температура тела упала ниже 36°. Тёплая одежда, ' +
          'крыша и огонь вернут тепло; горячая еда и движение гонят кровь. ' +
          'Долго стоять на ветру — верная смерть: ветер холоднее мороза.'),
        remind: T('tut.cold.remind',
          'Вы замерзаете: одежда, огонь, укрытие от ветра.'),
        wait: T('tut.cold.wait', 'Согрейтесь — или признайте совет понятым.'),
        done: T('tut.cold.done', 'Тепло вернулось'),
        arm: function () {
          var p = P();
          return !!(p && typeof p.temp === 'number' && p.temp < COLD_TEMP);
        },
        complete: function () {
          var p = P();
          return !!(p && typeof p.temp === 'number' && p.temp >= 36.5);
        }
      },

      // ------------------------------------------------------------
      // 8. ОГОНЬ. Нашёл спички/огниво — рассказ, как разжечь:
      //    B → строительство → «Кострище» (трут + дрова + спичка),
      //    либо [E] у готовой печи/камина. Выполнение: 'fire:lit'.
      // ------------------------------------------------------------
      {
        id: 'fire', order: 8, mode: 'wait', hudKey: 'fire',
        title: T('tut.fire.title', 'Огонь'),
        text: T('tut.fire.text',
          'Огонь — это тепло, горячая еда и отпор зверю. Разжечь свой ' +
          'костёр: [B] — строительство, выберите «Кострище» (нужны трут, ' +
          'дрова и спичка). Готовые печи, камины и костровища зажигаются ' +
          'клавишей [E] вплотную.'),
        remind: T('tut.fire.remind',
          '[B] → «Кострище»: развести костёр (спички + дрова).'),
        wait: T('tut.fire.wait', 'Разведите огонь: кострище [B] или печь [E].'),
        done: T('tut.fire.done', 'Огонь — твой друг до самого парохода'),
        arm: function () {
          // «после нахождения спичек»: подобрал огниво/спички либо
          // уже обыскал что-то и носит их с собой
          var h = hints();
          return invHasTag('firestarter') &&
                 !!(h && (h._tutFirstPick || h.tut_search));
        },
        complete: null   // событие fire:lit
      },

      // ------------------------------------------------------------
      // 9. НОЧЬ. Первый night:fall — «найдите укрытие до темноты».
      //    Снимается «Понял», входом в здание или рассветом.
      // ------------------------------------------------------------
      {
        id: 'night', order: 9, mode: 'advice', hudKey: 'night',
        title: T('tut.night.title', 'Ночь'),
        text: T('tut.night.text',
          'Темнеет. Найдите укрытие до темноты: под крышей теплее и ' +
          'спокойнее. Ночью хозяйничают волки, а без света и спички не ' +
          'найти — [F] зажжёт факел или фонарь в руке.'),
        remind: T('tut.night.remind',
          'Ночь близко: крыша, огонь, свет в руке ([F]).'),
        wait: T('tut.night.wait', 'Спрячьтесь под крышу — или признайте совет.'),
        done: T('tut.night.done', 'Ночь переждана'),
        arm: null,   // событие night:fall
        complete: function () { return inside(); }   // + day:dawn/Понял
      },

      // ------------------------------------------------------------
      // 10. ЕДА. Первая съестная находка — как есть: I → выбрать →
      //     «Съесть» (или двойной щелчок). Выполнение: 'player:ate'.
      // ------------------------------------------------------------
      {
        id: 'food', order: 10, mode: 'wait', hudKey: null,
        title: T('tut.food.title', 'Еда'),
        text: T('tut.food.text',
          'В сумке съестное. Откройте инвентарь [I], выберите еду и ' +
          'нажмите «Съесть» (или дважды щёлкните). Сырое мясо лучше ' +
          'сперва приготовить на огне — иначе наживёте болезнь.'),
        remind: T('tut.food.remind',
          'Инвентарь [I] → выберите еду → «Съесть».'),
        wait: T('tut.food.wait', 'Съешьте что-нибудь ([I] → «Съесть»).'),
        done: T('tut.food.done', 'Сытое брюхо к ученью глухо'),
        arm: function () {
          var h = hints();
          return hasFoodItem() && !!(h && (h._tutFirstPick || h.tut_search));
        },
        complete: null   // событие player:ate
      },

      // ------------------------------------------------------------
      // 11. СОН. Усталость, кровать рядом или спальник в сумке — совет
      //     спать: [Z] лечь, любая клавиша движения — подъём.
      //     Выполнение: игрок заснул (p.sleeping) либо «Понял».
      // ------------------------------------------------------------
      {
        id: 'sleep', order: 11, mode: 'advice', hudKey: 'sleep',
        title: T('tut.sleep.title', 'Сон'),
        text: T('tut.sleep.text',
          'Усталость копится: без сна руки дрожат, а веки тяжелеют. Спать ' +
          'лучше на кровати или в спальнике, под крышей и подальше от ' +
          'волчьих троп. [Z] — лечь, любая клавиша движения — подъём.'),
        remind: T('tut.sleep.remind',
          '[Z] — лечь спать (кровать или спальник — теплее).'),
        wait: T('tut.sleep.wait', 'Поспите: [Z] у кровати или спальника.'),
        done: T('tut.sleep.done', 'Утро вечера мудренее'),
        arm: function () {
          var p = P();
          if (!p) return false;
          if (p.needs && typeof p.needs.fatigue === 'number' &&
              p.needs.fatigue < FATIGUE_ARM) return true;
          if (invCount('bedroll') > 0) return true;
          return !!nearBed(BED_ARM_R);
        },
        complete: function () {
          var p = P();
          return !!(p && p.sleeping);
        }
      },

      // ------------------------------------------------------------
      // 12. ШУМ. Первый бег — предупреждение: на снегу топот слышно
      //     издалека, волки не глупы. Снимается «Понял» или само
      //     через NOISE_TTL секунд.
      // ------------------------------------------------------------
      {
        id: 'noise', order: 12, mode: 'advice', hudKey: null,
        title: T('tut.noise.title', 'Шум'),
        text: T('tut.noise.text',
          'Бег — это шум. На снегу топот слышен издалека, а волки не ' +
          'глупы. Крадучись ([Ctrl]) вы почти неслышны, но и медленны. ' +
          'Бегите — только когда это спасает жизнь.'),
        remind: T('tut.noise.remind',
          'Бег шумный: [Ctrl] — крадучись, тише.'),
        wait: T('tut.noise.wait', 'Шумите меньше — живите дольше.'),
        done: T('tut.noise.done', 'Тишина — тоже оружие'),
        arm: function () {
          var p = P();
          return !!(p && p.sprinting);
        },
        complete: null   // «Понял» или авто по NOISE_TTL
      },

      // ------------------------------------------------------------
      // 13. ВОЛКИ. Первый вой (волк в ~12 тайлах) или атака волка —
      //     совет из лора: не бегите, отступайте к огню, свет факела
      //     зверь уважает; охотятся ночью и слабых.
      // ------------------------------------------------------------
      {
        id: 'wolves', order: 13, mode: 'advice', hudKey: null,
        title: T('tut.wolves.title', 'Волки'),
        text: T('tut.wolves.text',
          'Вой. Стая где-то рядом. Правило тайги: не бегите от волка — ' +
          'догонит. Стойте лицом, отступайте к огню и свету: костёр и ' +
          'факел зверь уважает. Волки охотятся ночью и любят слабых — ' +
          'раненый на снегу для них зов на обед.'),
        remind: T('tut.wolves.remind',
          'Волки рядом: к огню, лицом к зверю, не бегите.'),
        wait: T('tut.wolves.wait', 'Запомните правило: не бегите от волка.'),
        done: T('tut.wolves.done', 'Стая запомнила ваш запах'),
        arm: function () { return wolfNear(WOLF_ARM_R); },
        complete: null   // «Понял» (или уйти от волков — сами справятся)
      },

      // ------------------------------------------------------------
      // 14. СОХРАНЕНИЕ. Первый автосейв (каждый игровой час) — короткий
      //     урок пермадета: смерть сотрёт сейв. Это Север.
      // ------------------------------------------------------------
      {
        id: 'save', order: 14, mode: 'advice', hudKey: null,
        title: T('tut.save.title', 'Сохранение'),
        text: T('tut.save.text',
          'Игра сохраняется сама — каждый час по игральным часам, вверху ' +
          'справа это видно. Но смерть окончательна: сохранение сотрётся ' +
          'вместе с вами. Это Север — здесь не начинают заново.'),
        remind: T('tut.save.remind',
          'Автосейв — каждый час. Смерть стирает сохранение.'),
        wait: T('tut.save.wait', 'Смерть здесь окончательна.'),
        done: T('tut.save.done', 'Сейв есть — вас пока нет'),
        arm: null,   // событие game:save
        complete: null   // «Понял»
      },

      // ------------------------------------------------------------
      // 15. РАДИО. Нашёл кристаллический приёмник (radio_crystal) —
      //     совет: с ним слышны передачи, а на вокзале приём ловит
      //     лучше. Снимается «Понял».
      // ------------------------------------------------------------
      {
        id: 'radio', order: 15, mode: 'advice', hudKey: null,
        title: T('tut.radio.title', 'Радио'),
        text: T('tut.radio.text',
          'Кристаллический приёмник! Тяжёлая стеклянная пластина в ' +
          'дубовой раме. Носите с собой — и в эфире время от времени ' +
          'раздадутся голоса: сводки, цены, чужая беда. В здании вокзала ' +
          'слышимость лучше — там и антенны, и память провода.'),
        remind: T('tut.radio.remind',
          'Приёмник с собой: передачи слышно и в дороге.'),
        wait: T('tut.radio.wait', 'Эфир ждёт — несите приёмник бережно.'),
        done: T('tut.radio.done', 'Голос в пустоте — уже компания'),
        arm: function () { return invCount('radio_crystal') > 0; },
        complete: null   // «Понял»
      }
    ];
  }

  // ====================================================================
  //  ДЕД-ВЕТКА (ЭТАП 14): режим «Безумный Дед» — своя короткая серия
  //  шагов. Никаких «наденьте тёплое» и «поешьте»: нужды заморожены,
  //  дед не мёрзнет. Сердце онбординга — ПЕРВОЕ ИЗГНАНИЕ: без него
  //  игрок не понимает главную механику игры.
  // ====================================================================

  function CRAZY_STEPS() {
    return [
      // 1. ДВИЖЕНИЕ — то же, что в обычной ветке
      {
        id: 'move', order: 1, mode: 'wait', auto: true, hudKey: 'move',
        title: T('tut.move.title', 'Первые шаги'),
        text: T('tut.cz.move.text',
          'Дед, ноги затекли! WASD или стрелки — идти. Пройдитесь по ' +
          'снегу, разомнитесь — тарелка сама не найдёт седого.'),
        remind: T('tut.move.remind',
          'Шагните: W, A, S или D (можно стрелки).'),
        wait: T('tut.move.wait', 'Идите — 2 секунды хватит.'),
        done: T('tut.move.done', 'Ноги помнят дорогу'),
        arm: null,
        complete: null   // накопитель moveT в тике
      },

      // 2. КАМЕРА — зум
      {
        id: 'look', order: 2, mode: 'wait', auto: true, hudKey: null,
        title: T('tut.look.title', 'Осмотр'),
        text: T('tut.cz.look.text',
          'Колесо мыши — приблизить и отдалить. Мультяшек издалека ' +
          'заметнее, а деду нужен обзор — мало ли кто бродит.'),
        remind: T('tut.look.remind',
          'Покрутите колесо мыши — смените приближение.'),
        wait: T('tut.look.wait', 'Крутаните колесо мыши.'),
        done: T('tut.look.done', 'Глаз — первое орудие промысла'),
        arm: null,
        complete: null   // изменение зума в тике
      },

      // 3. ОБЫСК [E] — источник подарков и скарба
      {
        id: 'search', order: 3, mode: 'wait', hudKey: 'search',
        title: T('tut.cz.search.title', 'Обыск'),
        text: T('tut.cz.search.text',
          'Шкафы и полки — подойти и [E]. Дед ведь не только изгоняет: ' +
          'в домах осталась память о людях, а деду — факелы и добро.'),
        remind: T('tut.cz.search.remind',
          'Встаньте у шкафа или полки и нажмите [E].'),
        wait: T('tut.cz.search.wait', 'Обыщите шкаф или полку: [E].'),
        done: T('tut.cz.search.done', 'Чужое добро — дедова зима'),
        arm: function () { return !!nearContainer(CONT_ARM_R); },
        complete: null   // событие loot:searched
      },

      // 4. ПЕРВОЕ ИЗГНАНИЕ — сердце игры. Бой: ЛКМ/пробел лодошкой.
      {
        id: 'banish', order: 4, mode: 'wait', hudKey: null,
        title: T('tut.cz.banish.title', 'Первое изгнание!'),
        text: T('tut.cz.banish.text',
          'Вон мультяшка! Волк, бандит — не важно: подходи и бей ' +
          'ЛОДОШКОЙ (ЛКМ или пробел). Изгнанник оставит Подарок, а деду ' +
          'капнёт 🍄 грибная энергия. Это главная механика, дед!'),
        remind: T('tut.cz.banish.remind',
          'Подойди к мультяшке и бей: ЛКМ или Пробел.'),
        wait: T('tut.cz.banish.wait', 'Изгони первую мультяшку!'),
        done: T('tut.cz.banish.done', 'ПУФ! Мультяшка — в подарок'),
        arm: function () { return !!nearBeast(CZ_BANISH_ARM_R); },
        complete: null   // событие crazy:banish
      },

      // 5. ПОДАРОК — обыскать труп-подарок после изгнания
      {
        id: 'gift', order: 5, mode: 'wait', hudKey: null,
        title: T('tut.cz.gift.title', 'Подарок'),
        text: T('tut.cz.gift.text',
          'Изгнанник оставил Подарок — подойди и обыщи его [E]. Внутри ' +
          'добро: жир для факелов, тряпьё, а бывает и дедовское счастье.'),
        remind: T('tut.cz.gift.remind',
          'Обыщи Подарок: [E].'),
        wait: T('tut.cz.gift.wait', 'Обыщи Подарок: [E].'),
        done: T('tut.cz.gift.done', 'ПУФ — и с прибытком!'),
        arm: function () { return !!nearGift(CZ_GIFT_ARM_R); },
        complete: null   // событие loot:searched по подарку
      },

      // 6. СЪЕШЬ ГРИБ — ПРИХОД: топливо петли. Пока дед в трипе,
      //    мультяшки сами идут к нему; трезвому — серый пустой мир.
      {
        id: 'shroom', order: 6, mode: 'wait', hudKey: null,
        title: T('tut.cz.shroom.title', 'Съешь гриб!'),
        text: T('tut.cz.shroom.text',
          'Грибы — не только лекарство, дед: это ТОПЛИВО. Открой сумку ' +
          '[I], выбери Весёлый Гриб и съешь. ПРИХОД 🧠 вырастет — мир ' +
          'заиграет красками, и мультяшки сами полезут к тебе. Приход ' +
          'тает: трезвому деду мир сер и скучен.'),
        remind: T('tut.cz.shroom.remind',
          'Съешь гриб: [I] → Весёлый Гриб → «Съесть».'),
        wait: T('tut.cz.shroom.wait', 'Съешь Весёлый Гриб: [I].'),
        done: T('tut.cz.shroom.done', 'Вот и мультики вернулись!'),
        arm: function () {
          // предложить, когда приход начал спадать (или сразу после дара)
          var cz = WS.G && WS.G.crazy ? WS.G.crazy : null;
          return !!(cz && cz.trip < 0.5);
        },
        complete: function () {
          var cz = WS.G && WS.G.crazy ? WS.G.crazy : null;
          return !!(cz && cz.trip >= 0.9);
        }
      },

      // 7. ДРЕВО МУДРОСТИ [T] — куда тратить энергию
      {
        id: 'tree', order: 7, mode: 'wait', hudKey: null,
        title: T('tut.cz.tree.title', 'Древо Мудрости'),
        text: T('tut.cz.tree.text',
          '🍄 Грибная энергия копится за изгнания и обыски. Открой Древо ' +
          'Мудрости [T] и вложи её в деда: Скорость Ежа, Крепкий Организм, ' +
          'Вантуз-Мастер... Дед станет легендой.'),
        remind: T('tut.cz.tree.remind',
          'Открой Древо Мудрости: [T].'),
        wait: T('tut.cz.tree.wait', 'Открой Древо Мудрости: [T].'),
        done: T('tut.cz.tree.done', 'Дед стал мудрее на один гриб'),
        arm: function () { return !!((WS.G && WS.G.crazy && WS.Crazy && WS.Crazy.energy && WS.Crazy.energy() >= 2)); },
        complete: function () {
          try { return !!(WS.TreeScreen && WS.TreeScreen.isOpen && WS.TreeScreen.isOpen()); }
          catch (e) { return false; }
        }
      },

      // 8. ГЛАВНАЯ ЦЕЛЬ — совет (снимается «Понял»); arm — после того,
      //    как игрок побывал в Древе (энергия уже тратилась)
      {
        id: 'goal', order: 8, mode: 'advice', hudKey: null,
        title: T('tut.cz.goal.title', 'Зачем всё это'),
        text: T('tut.cz.goal.text',
          'Слушай сюда, дед: через 60 дней прилетит ТАРЕЛКА. Собери 3 ' +
          'факела, разведи Магический Огонь на мостках у реки, набросай ' +
          'Звёздной Пыли и подай 3 Грибных Зова — тарелка заберёт деда ' +
          'к звёздам раньше срока. ХП-часы тикают: не успеешь — дед ' +
          'уснёт навсегда. Скучно станет — ГРИБНОЙ ЗАЛП [G]: 20 🍄, и ' +
          'весь лес бежит к тебе.'),
        remind: T('tut.cz.goal.remind',
          '60 дней, 3 факела, Магический Огонь, 3 Зова — и к звёздам.'),
        wait: T('tut.cz.goal.wait', 'К звёздам, дед!'),
        done: T('tut.cz.goal.done', 'План на зиму есть'),
        arm: function () {
          // Древо уже открыли (шаг закрыт) — пора рассказать про тарелку
          var h = hints();
          return !!(h && h.tut_tree);
        },
        complete: null   // «Понял»
      }
    ];
  }

  /** Зверь в радиусе? (для шага «Первое изгнание») */
  function nearBeast(r) {
    var w = W();
    if (!w || !w.ents) return false;
    var p = P();
    if (!p) return false;
    var BEASTS = { wolf: 1, bear: 1, bandit: 1, cartoon: 1 };
    for (var i = 0; i < w.ents.length; i++) {
      var e = w.ents[i];
      if (!e || e.dead || !BEASTS[e.kind]) continue;
      if (WS.M.dist(p.x, p.y, e.x, e.y) <= r) return true;
    }
    return false;
  }

  /** Подарок (труп изгнанника) в радиусе? (для шага «Подарок») */
  function nearGift(r) {
    var w = W();
    if (!w || !w.objects) return false;
    var p = P();
    if (!p) return false;
    for (var i = 0; i < w.objects.length; i++) {
      var o = w.objects[i];
      if (!o || !o.sprName || o.sprName !== 'crazy_gift') continue;
      if (WS.M.dist(p.x, p.y, o.x, o.y) <= r) return true;
    }
    return false;
  }

  // ====================================================================
  //  ПЕРСИСТЕНТНОСТЬ: ВКЛ/ВЫКЛ ОБУЧЕНИЯ
  // ====================================================================

  /** Прочитать настройку из localStorage (ошибки молча игнорируем). */
  function readStoredOff() {
    try {
      return window.localStorage.getItem(LS_KEY) === 'off';
    } catch (e) { return false; }
  }

  /** Записать настройку в localStorage. */
  function writeStoredOff(off) {
    try {
      window.localStorage.setItem(LS_KEY, off ? 'off' : 'on');
    } catch (e) { /* приватный режим — переживём */ }
  }

  /** Учесть флаг партии (game:load мог принести tutorialOff в сейве). */
  function syncFromFlags() {
    var f = flags();
    if (f && f.tutorialOff) enabled = false;
  }

  /** Включить/выключить обучение (публичное API и кнопки UI). */
  function setEnabled(v) {
    var was = enabled;
    enabled = !!v;
    writeStoredOff(!enabled);
    var f = flags();
    if (f) f.tutorialOff = !enabled;

    if (enabled && !was) {
      // включили на живой партии — продолжаем с первого незакрытого шага
      if (running()) armAutoSteps(true);
    } else if (!enabled && was) {
      stopAll('tutorial off');
    }
    updatePauseButton();
    if (WS.Ui && WS.Ui.toast) {
      try {
        WS.Ui.toast(enabled
          ? T('tut.enabled.msg', 'Обучение включено')
          : T('tut.disabled.msg', 'Обучение отключено'), 'info');
      } catch (e) { /* пусто */ }
    }
  }

  function isEnabled() { return enabled; }

  // ====================================================================
  //  ДВИЖОК ШАГОВ
  //
  //  Архитектура в двух словах:
  //
  //    WAIT ──(arm: триггер из мира/события)──> ACTIVE ──(complete или
  //      «Понял»)──> DONE          «Пропустить» ──> SKIP (равно «закрыт»)
  //
  //  * ACTIVE-шаги стоят в очереди `queue` (отсортирована по порядку);
  //    верхний показан в панели `shown`. Панель НЕ модальная: игра идёт.
  //  * pollArms() каждый тик спрашивает у WAIT-шагов «пора?» (arm);
  //    pollCompletes() — у ACTIVE-шагов «сделано?» (complete/события).
  //  * События — приоритетнее опроса (мгновенная реакция), опрос —
  //    страховка (не пропустить то, что событием не покрыто).
  //  * Состояния переживают сейв через WS.G.story.hints[tut_<id>]:
  //    ключ есть — шаг закрыт. Загруженная партия не навязывает
  //    авто-шаги: только живые триггеры.
  //  * Отключение (localStorage + флаг партии) глушит всё разом и
  //    навсегда: ни панелей, ни напоминаний, ни салюта в конце.
  // ====================================================================

  /** Сброс рантайма (новая партия / загрузка). */
  function resetRuntime() {
    queue.length = 0;
    shown = null;
    minimized = false;
    activeT = 0;
    reminders = 0;
    moveT = 0;
    zoomRef = 0;
    startT = -1;
    hidePanel();
    updateChip();
  }

  /** Пометить шаг выполненным (писать в story.hints + погасить HUD-хинт). */
  function markDone(st) {
    st.st = DONE;
    var h = hints();
    if (h) h[st.key] = 1;
    // расширяем очередь HUD-хинтов D1: тему закрыли — не повторять
    if (st.hudKey && h) h[st.hudKey] = 1;
  }

  /** Активировать шаг: ждёт показа в очереди (или сразу, если панель вольна).
   *  ВАЖНО: ключ в story.hints пишется только при ЗАВЕРШЕНИИ/пропуске —
   *  «начатый» шаг не считается закрытым и после загрузки сейва честно
   *  попросит доделать (триггер сработает снова). */
  function activate(id) {
    var st = byId[id];
    if (!st || !enabled || !running()) return;
    if (st.st !== WAIT) return;
    st.st = ACTIVE;
    st.activeT = 0;
    st.reminded = 0;   // при повторной активации — реплики заново (ключи HUD одноразовы сами по себе)
    queuePush(st);
    if (!shown && !minimized) showNext();
    else updateChip();
  }

  /** Очередь держим отсортированной по порядку шагов. */
  function queuePush(st) {
    for (var i = 0; i < queue.length; i++) {
      if (queue[i].order > st.order) { queue.splice(i, 0, st); return; }
    }
    queue.push(st);
  }

  /** Показать следующий шаг из очереди (если он есть). */
  function showNext() {
    shown = queue.shift() || null;
    minimized = false;
    if (shown) {
      // шаг «Осмотр» запоминает зум на момент показа
      if (shown.id === 'look') zoomRef = camZoom();
      renderPanel();
      updateChip();
    } else {
      hidePanel();
      updateChip();
    }
  }

  /** Завершить шаг (действием или кнопкой «Понял» для советов). */
  function completeStep(st, byUser) {
    if (!st || st.st !== ACTIVE) return;
    markDone(st);
    // из очереди/панели — убрать
    var idx = queue.indexOf(st);
    if (idx >= 0) queue.splice(idx, 1);
    if (shown === st) {
      if (byUser || st.mode === 'advice') {
        showNext();
      } else {
        // действие выполнено: короткое подтверждение и дальше
        toastDone(st);
        showNext();
      }
    }
    // цепочка «движение → осмотр»
    if (st.id === 'move' && byId.look && byId.look.st === WAIT) {
      activate('look');
    }
    // после первого обыска стоит напомнить про инвентарь
    if (st.id === 'search' && byId.inv && byId.inv.st === WAIT) {
      activate('inv');
    }
    checkAllDone();
    updateChip();
  }

  /** Пропустить шаг кнопкой «Пропустить» (считается закрытым). */
  function skipStep(st) {
    if (!st || st.st !== ACTIVE) return;
    st.st = SKIP;
    var h = hints();
    if (h) h[st.key] = 1;
    var idx = queue.indexOf(st);
    if (idx >= 0) queue.splice(idx, 1);
    if (shown === st) showNext();
    else updateChip();
    // цепочки пропуска не рвут: «движение» пропущено — «осмотр» всё равно
    if (st.id === 'move' && byId.look && byId.look.st === WAIT) {
      activate('look');
    }
    checkAllDone();   // пропуск тоже закрывает шаг — вдруг это последний
  }

  /** Все 15 шагов закрыты? Один раз за партию — маленький салют:
   *  игрок умеет всё, что нужно для Севера. Флаг в story.hints не даёт
   *  повториться даже после загрузки сейва. */
  function checkAllDone() {
    var h = hints();
    if (!h || h.tut_all_done) return;
    var n = 0;
    for (var i = 0; i < steps.length; i++) {
      if (steps[i].st === DONE || steps[i].st === SKIP) n++;
    }
    if (n < steps.length) return;
    h.tut_all_done = 1;
    if (WS.Ui && WS.Ui.toast) {
      try {
        WS.Ui.toast(T('tut.all.done',
          'Обучение пройдено. Дальше — только вы и Север.'), 'good');
      } catch (e) { /* пусто */ }
    }
    if (WS.Snd && WS.Snd.play) {
      try { WS.Snd.play('levelup', { vol: 0.5 }); } catch (e2) { /* тихо */ }
    }
    WS.log('tutorial: все шаги пройдены');
  }

  /** Полностью остановить обучение (смерть, отключение). */
  function stopAll(reason) {
    for (var i = 0; i < steps.length; i++) {
      if (steps[i].st === ACTIVE) steps[i].st = WAIT;
    }
    queue.length = 0;
    shown = null;
    hidePanel();
    updateChip();
    if (reason) WS.log('tutorial: остановлен (' + reason + ')');
  }

  /** Одноразовая реплика-тост о выполненном шаге (не спам: только экшены).
   *  Текст — лорный «done» шага, не сухой «Шаг закрыт». */
  function toastDone(st) {
    if (!WS.Ui || !WS.Ui.toast) return;
    try {
      WS.Ui.toast(T('tut.done', 'Готово') + ': ' + (st.done || st.title), 'good');
    } catch (e) { /* пусто */ }
  }

  /** Повторная подсказка по таймауту — через очередь HUD-хинтов
   *  (WS.Hud.hint с уникальным ключом tut_<id>_rN — один раз за партию,
   *  НЕ тост-спам). Счётчик реплик — у каждого шага свой: даже шаг,
   *  ждущий в очереди за показанной панелью, имеет право напомнить
   *  о себе, когда дойдёт до экрана. */
  function maybeRemind(st) {
    if (st.mode !== 'wait') return;
    if (st.reminded >= 2) return;
    var at = st.activeT;
    if (st.reminded === 0 && at >= REMIND_1) {
      st.reminded = 1;
      hudHint(st.key + '_r1', st.remind);
    } else if (st.reminded === 1 && at >= REMIND_2) {
      st.reminded = 2;
      hudHint(st.key + '_r2', st.remind);
    }
  }

  /** Добавить строку в очередь HUD-подсказок (или тост-фолбэк). */
  function hudHint(key, text) {
    if (WS.Hud && WS.Hud.hint) {
      try { WS.Hud.hint(key, text); return; } catch (e) { /* ниже */ }
    }
    if (WS.Ui && WS.Ui.toast) {
      try { WS.Ui.toast(text, 'info'); } catch (e2) { /* пусто */ }
    }
  }

  /** Текущий зум камеры (или 0). */
  function camZoom() {
    try { return (WS.Cam && WS.Cam.zoom) ? WS.Cam.zoom : 0; }
    catch (e) { return 0; }
  }

  // ====================================================================
  //  ТРИГГЕРЫ И ПРОВЕРКИ (каждый тик, только по живым WAIT/ACTIVE шагам)
  // ====================================================================

  /** Опросить триггеры WAIT-шагов (порядок соблюдать не обязателен:
   *  реальная жизнь игрока и есть сценарий обучения). */
  function pollArms() {
    for (var i = 0; i < steps.length; i++) {
      var st = steps[i];
      if (st.st !== WAIT || !st.arm) continue;
      var fire = false;
      try { fire = !!st.arm(); } catch (e) { fire = false; }
      if (fire) activate(st.id);
    }
  }

  /** Опросить завершения ACTIVE-шагов (и события, и проверки). */
  function pollCompletes(dt) {
    for (var i = 0; i < steps.length; i++) {
      var st = steps[i];
      if (st.st !== ACTIVE) continue;
      st.activeT += dt;

      // --- особый случай: накопитель ходьбы ---------------------
      if (st.id === 'move') {
        var p = P();
        if (p && p.moving) moveT += dt;
        else moveT = Math.max(0, moveT - dt * 0.5);   // остановка «оттаивает»
        if (moveT >= MOVE_NEED) { completeStep(st, false); continue; }
      }

      // --- особый случай: смена зума / колесо --------------------
      if (st.id === 'look') {
        var wheel = 0;
        try {
          var m = WS.Input && WS.Input.mouse ? WS.Input.mouse() : null;
          wheel = m ? m.wheel : 0;
        } catch (eW) { wheel = 0; }
        if (wheel !== 0 || camZoom() !== zoomRef) {
          completeStep(st, false);
          continue;
        }
      }

      // --- особый случай: «Шум» сам гаснет через NOISE_TTL -------
      if (st.id === 'noise' && st.activeT >= NOISE_TTL) {
        completeStep(st, true);
        continue;
      }

      // --- общая проверка complete -------------------------------
      if (st.complete) {
        var ok = false;
        try { ok = !!st.complete(); } catch (eC) { ok = false; }
        if (ok) { completeStep(st, false); continue; }
      }

      // --- повторные подсказки по таймауту (у каждого шага свои) ---
      maybeRemind(st);
    }
  }

  /** Шаги со auto:true (движение/осмотр) — стартовать при старте партии. */
  function armAutoSteps(fromToggle) {
    if (!enabled || !running()) return;
    var h = hints();
    for (var i = 0; i < steps.length; i++) {
      var st = steps[i];
      if (st.auto && st.st === WAIT && !(h && h[st.key])) {
        activate(st.id);
      }
    }
    void fromToggle;
  }

  // ====================================================================
  //  DOM: ПАНЕЛЬ ОБУЧЕНИЯ (низ, центр) + ЖЕТОН (свёрнутое состояние)
  //  Стили — инжект-<style> с префиксом .wst- (своего css-файла нет:
  //  задача J1 — ровно два js-файла).
  // ====================================================================

  function injectStyles() {
    if (document.getElementById('ws-tutorial-style')) return;
    var s = document.createElement('style');
    s.id = 'ws-tutorial-style';
    s.textContent =
      '#ws-tutorial{position:fixed;left:50%;bottom:138px;transform:translateX(-50%);' +
        'width:540px;max-width:94vw;z-index:55;pointer-events:auto;' +
        'padding:0 0 10px;animation:wst-in .3s ease-out both;}' +
      '#ws-tutorial.wst-mini{bottom:138px;}' +
      '@keyframes wst-in{from{opacity:0;transform:translateX(-50%) translateY(14px)}' +
        'to{opacity:1;transform:translateX(-50%) translateY(0)}}' +
      '.wst-head{display:flex;align-items:baseline;gap:10px;padding:8px 14px 6px;' +
        'border-bottom:1px solid var(--line);background:rgba(30,40,54,.55);}' +
      '.wst-no{font-size:11px;color:var(--ink-dim);letter-spacing:.06em;' +
        'white-space:nowrap;font-variant-numeric:tabular-nums;}' +
      '.wst-title{flex:1 1 auto;overflow:hidden;text-overflow:ellipsis;' +
        'white-space:nowrap;}' +
      '.wst-min{background:none;border:none;color:var(--ink-dim);cursor:pointer;' +
        'font-family:Georgia,serif;font-size:14px;padding:0 4px;}' +
      '.wst-min:hover{color:#f0d8b4;}' +
      '.wst-text{padding:10px 14px 4px;font-size:14px;line-height:1.55;' +
        'color:var(--ink);}' +
      '.wst-hint{padding:0 14px 6px;font-size:11.5px;color:var(--ink-dim);' +
        'font-style:italic;}' +
      '.wst-btns{display:flex;align-items:center;gap:8px;padding:4px 14px 0;}' +
      '.wst-btns .ws-btn{padding:5px 14px;font-size:13.5px;}' +
      '.wst-off{margin-left:auto;font-size:11px;color:var(--ink-dim);cursor:pointer;' +
        'text-decoration:underline dotted;border-bottom:none;background:none;' +
        'border-top:none;border-left:none;border-right:none;padding:0;' +
        'font-family:inherit;}' +
      '.wst-off:hover{color:#b0483f;}' +
      '.wst-dots{display:flex;gap:4px;padding:8px 14px 2px;flex-wrap:wrap;}' +
      '.wst-dot{width:9px;height:9px;border-radius:50%;background:#243248;' +
        'border:1px solid #2c3a4e;}' +
      '.wst-dot.done{background:var(--accent2);border-color:#8a6224;}' +
      '.wst-dot.act{background:var(--accent);border-color:#a87f3a;' +
        'animation:wst-pulse 1.4s ease-in-out infinite;}' +
      '.wst-dot.skip{background:#33393f;border-style:dashed;}' +
      '@keyframes wst-pulse{0%,100%{box-shadow:0 0 2px rgba(216,164,92,.2)}' +
        '50%{box-shadow:0 0 9px rgba(216,164,92,.7)}}' +
      '#ws-tutorial-chip{position:fixed;left:50%;bottom:138px;' +
        'transform:translateX(-50%);z-index:55;pointer-events:auto;' +
        'padding:6px 16px;cursor:pointer;font-size:13px;color:var(--accent);' +
        'letter-spacing:.04em;}' +
      '#ws-tutorial-chip:hover{border-color:#4a6285;}' +
      '#ws-tutorial-chip small{color:var(--ink-dim);margin-left:8px;}' +
      '#ws-pause .wst-pause-row{pointer-events:auto;margin-top:6px;}' +
      '#ws-pause .wst-pause-btn{pointer-events:auto;cursor:pointer;' +
        'background:linear-gradient(180deg,#243248,#1a2334);color:var(--ink);' +
        'border:1px solid #354863;padding:7px 20px;font-family:\'PT Serif\',Georgia,serif;' +
        'font-size:14px;border-radius:3px;letter-spacing:.04em;}' +
      '#ws-pause .wst-pause-btn:hover{background:linear-gradient(180deg,#2d3f5a,#212d42);' +
        'border-color:#4a6285;}' +
      '#ws-pause .wst-pause-btn .st{color:var(--accent);}';
    document.head.appendChild(s);
  }

  /** Построить панель и жетон (однократно, в boot). */
  function buildDom() {
    if (built) return;
    var uiRoot = document.getElementById('ui-root');
    if (!uiRoot) { WS.warn('tutorial: нет #ui-root'); return; }
    injectStyles();

    // --- панель шага -----------------------------------------------
    var root = el('div', 'ws-panel');
    root.id = 'ws-tutorial';
    root.classList.add('hidden');

    var head = el('div', 'wst-head');
    root.appendChild(head);
    dom.stepNo = el('span', 'wst-no', '', head);
    dom.title = el('span', 'ws-title wst-title', '', head);
    dom.min = el('button', 'wst-min', '–', head);
    dom.min.type = 'button';
    dom.min.title = T('tut.min.title', 'Свернуть подсказку');
    dom.min.addEventListener('click', function () {
      if (!shown) return;
      minimized = true;
      hidePanel();
      updateChip();
    }, false);

    dom.text = el('div', 'wst-text', '', root);
    dom.hint = el('div', 'wst-hint', '', root);

    var btns = el('div', 'wst-btns');
    root.appendChild(btns);
    dom.ok = btn(T('tut.ok', 'Понял'), 'primary', onOkClick);
    dom.skip = btn(T('tut.skip', 'Пропустить'), '', onSkipClick);
    btns.appendChild(dom.ok);
    btns.appendChild(dom.skip);
    dom.off = el('button', 'wst-off',
      T('tut.off', 'отключить обучение'));
    dom.off.type = 'button';
    dom.off.title = T('tut.off.title',
      'Больше не показывать обучение (можно вернуть в паузе)');
    dom.off.addEventListener('click', onOffClick, false);
    btns.appendChild(dom.off);

    var dots = el('div', 'wst-dots');
    root.appendChild(dots);
    dom.dots = dots;

    root.addEventListener('mousedown', function (e) { e.stopPropagation(); }, false);
    uiRoot.appendChild(root);
    dom.root = root;

    // --- жетон (свёрнутое обучение) --------------------------------
    var chip = el('div', 'ws-panel');
    chip.id = 'ws-tutorial-chip';
    chip.classList.add('hidden');
    dom.chipLabel = el('span', '', 'Обучение');
    chip.appendChild(dom.chipLabel);
    var chipTail = el('small', '', ' — показать');
    chip.appendChild(chipTail);
    chip.addEventListener('click', function () {
      minimized = false;
      updateChip();
      renderPanel();
    }, false);
    uiRoot.appendChild(chip);
    dom.chip = chip;

    built = true;
  }

  /** Нарисовать панель текущего шага (пока открыт чужой модальный экран
   *  не рисуем — вернёмся к этому на переходе в tutTick). */
  function renderPanel() {
    if (!built) return;
    if (!shown || !enabled || !running() || uiModal()) { hidePanel(); return; }

    var st = shown;
    dom.stepNo.textContent = T('tut.step',
      'Шаг {n} из {m}')
      .replace('{n}', String(st.order)).replace('{m}', String(steps.length));
    dom.title.textContent = st.title;
    dom.text.textContent = st.text;

    // подсказка-приписка: что именно ждём от игрока сейчас
    dom.hint.textContent = st.wait || ((st.mode === 'advice')
      ? T('tut.wait.advice', 'Совет закроется кнопкой «Понял».')
      : T('tut.wait.action', 'Выполните действие — подсказка закроется сама.'));
    dom.ok.textContent = (st.mode === 'advice')
      ? T('tut.ok', 'Понял')
      : T('tut.ok.min', 'Свернуть');
    dom.skip.textContent = T('tut.skip', 'Пропустить');

    // точки прогресса
    while (dom.dots.firstChild) dom.dots.removeChild(dom.dots.firstChild);
    for (var i = 0; i < steps.length; i++) {
      var s = steps[i];
      var cls = 'wst-dot';
      if (s.st === DONE) cls += ' done';
      else if (s.st === ACTIVE) cls += ' act';
      else if (s.st === SKIP) cls += ' skip';
      var d = el('span', cls);
      d.title = s.order + '. ' + s.title;
      dom.dots.appendChild(d);
    }

    dom.root.classList.remove('hidden');
  }

  /** Спрятать панель (не трогает жетон — его обновляет updateChip). */
  function hidePanel() {
    if (dom.root) dom.root.classList.add('hidden');
  }

  /** Жетон: виден, когда обучение идёт, панель скрыта/свёрнута и
   *  не открыт чужой модальный экран (под окнами жетону делать нечего). */
  function updateChip() {
    if (!built || !dom.chip) return;
    var activeCount = queue.length + (shown ? 1 : 0);
    var show = enabled && running() && activeCount > 0 && !modalHidden &&
               (minimized || !shown);
    if (show) {
      dom.chipLabel.textContent = T('tut.chip',
        'Обучение: {t}').replace('{t}', shown ? shown.title : (queue[0] ? queue[0].title : ''));
      dom.chip.classList.remove('hidden');
    } else {
      dom.chip.classList.add('hidden');
    }
  }

  // ====================================================================
  //  КНОПКИ ПАНЕЛИ
  // ====================================================================

  /** «Понял»: совет — закрыть шаг; действие — свернуть панель в жетон. */
  function onOkClick() {
    if (!shown) return;
    if (shown.mode === 'advice') {
      completeStep(shown, true);
    } else {
      minimized = true;
      hidePanel();
      updateChip();
    }
  }

  /** «Пропустить»: закрыть шаг как пропущенный. */
  function onSkipClick() {
    if (!shown) return;
    skipStep(shown);
  }

  /** «отключить обучение»: подтверждение (нативный confirm запрещён). */
  function onOffClick() {
    var text = T('tut.off.confirm',
      'Отключить обучение? Подсказки больше не появятся — ни в этой ' +
      'партии, ни в следующих. Вернуть можно будет в паузе (Esc) или ' +
      'клавишей F1 в справке.');
    var yes = function () { setEnabled(false); };
    if (WS.Ui && WS.Ui.confirm) {
      try { WS.Ui.confirm(text, yes, { yes: T('tut.off.yes', 'Отключить') }); return; }
      catch (e) { /* ниже — сами */ }
    }
    setEnabled(false);
  }

  // ====================================================================
  //  ОВЕРЛЕЙ «ПАУЗА»: ПЕРЕКЛЮЧАТЕЛЬ ОБУЧЕНИЯ
  //  ui.js строит #ws-pause в СВОЁМ boot (файл ui.js идёт после нас),
  //  поэтому кнопку вживляем лениво из тика.
  // ====================================================================

  function tryInjectPauseButton() {
    if (pauseInjected) return;
    var pause = document.getElementById('ws-pause');
    if (!pause) return;
    if (pause.querySelector('.wst-pause-row')) {
      pauseInjected = true;
      return;
    }
    var row = el('div', 'wst-pause-row');
    var b = el('button', 'wst-pause-btn', '');
    b.type = 'button';
    b.addEventListener('click', function () {
      setEnabled(!enabled);
    }, false);
    row.appendChild(b);
    pause.appendChild(row);
    dom.pauseBtn = b;
    pauseInjected = true;
    updatePauseButton();
    WS.log('tutorial: переключатель встроен в оверлей паузы');
  }

  /** Подпись кнопки в паузе (вызывается при смене состояния). */
  function updatePauseButton() {
    if (!dom.pauseBtn) return;
    dom.pauseBtn.innerHTML = '';
    dom.pauseBtn.appendChild(document.createTextNode(
      T('tut.pause.btn', 'Обучение: ') + ' '));
    var st = el('span', 'st',
      enabled ? T('tut.pause.on', 'ВКЛ') : T('tut.pause.off', 'ВЫКЛ'));
    dom.pauseBtn.appendChild(st);
  }

  // ====================================================================
  //  СОБЫТИЯ
  // ====================================================================

  function bindEvents() {
    if (bound) return;
    bound = true;

    // --- жизненный цикл партии ------------------------------------
    on('game:start', function () {
      // ЭТАП 14: дед-режиму — свою ветку шагов (7 вместо 15);
      // старая ветка учила игре, которой больше нет (одежда при
      // замороженных нуждах и т.п.)
      makeSteps();
      resetRuntime();
      syncFromFlags();
      // пересобрать состояния шагов из сейва/новой игры
      var h = hints();
      for (var i = 0; i < steps.length; i++) {
        var st = steps[i];
        st.st = (h && h[st.key]) ? DONE : WAIT;
        st.activeT = 0;
        st.reminded = 0;
      }
      if (enabled) startT = START_DELAY;   // отложенный старт «Движения»
    });

    on('game:load', function () {
      makeSteps();
      resetRuntime();
      syncFromFlags();
      var h = hints();
      for (var i = 0; i < steps.length; i++) {
        steps[i].st = (h && h[steps[i].key]) ? DONE : WAIT;
        steps[i].activeT = 0;
        steps[i].reminded = 0;
      }
      // загрузили сейв — авто-шаги не навязываем, триггеры сами решат
      startT = -1;
    });

    on('player:die', function () { stopAll('смерть'); });
    on('game:victory', function () { stopAll('победа'); });

    // --- шаг «Первый обыск»: событие завершённого обыска ----------
    on('loot:searched', function (d) {
      var st = byId.search;
      if (st && st.st === ACTIVE) completeStep(st, false);
      // дед-ветка: обыск подарка закрывает шаг «Подарок»
      if (byId.gift && byId.gift.st === ACTIVE && d && d.obj &&
          d.obj.sprName === 'crazy_gift') {
        completeStep(byId.gift, false);
      }
      // спички/еда при себе после обыска — arm шагов «Огонь»/«Еда»
      if (byId.fire && byId.fire.st === WAIT && invHasTag('firestarter')) {
        activate('fire');
      }
      if (byId.food && byId.food.st === WAIT && hasFoodItem()) {
        activate('food');
      }
    });

    // --- дед-ветка: первое изгнание → шаг «Изгнание» закрыт,
    //     активировать «Подарок» ---------------------------------
    on('crazy:banish', function () {
      if (byId.banish && byId.banish.st === ACTIVE) {
        completeStep(byId.banish, false);
      }
      if (byId.gift && byId.gift.st === WAIT) activate('gift');
    });

    // --- дед-ветка: открыл Древо Мудрости → шаг «Древо» закрыт
    //     (экран модальный, тики стоят — ловим событие, не опрос).
    //     Шаг «Зачем всё это» активируется своим arm-условием в тике.
    on('crazy:tree_open', function () {
      if (byId.tree && byId.tree.st === ACTIVE) completeStep(byId.tree, false);
    });

    // --- шаг «Инвентарь»: окно открылось ---------------------------
    on('ui:screen:open', function (d) {
      if (!d || d.name !== 'inventory') return;
      var st = byId.inv;
      if (st && st.st === ACTIVE) completeStep(st, false);
    });

    // --- шаг «Экипировка»: что-то надели --------------------------
    on('equip:changed', function () {
      var st = byId.equip;
      if (st && st.st === ACTIVE) completeStep(st, false);
    });

    // --- шаг «Огонь»: огонь разведён ------------------------------
    on('fire:lit', function () {
      var st = byId.fire;
      if (st && st.st === ACTIVE) completeStep(st, false);
    });

    // --- шаг «Еда»: поели -----------------------------------------
    on('player:ate', function () {
      var st = byId.food;
      if (st && st.st === ACTIVE) completeStep(st, false);
    });

    // --- шаг «Ночь»: ночь наступила / рассвет снял совет ----------
    on('night:fall', function () {
      if (byId.night && byId.night.st === WAIT) activate('night');
    });
    on('day:dawn', function () {
      var st = byId.night;
      if (st && st.st === ACTIVE) completeStep(st, true);
    });

    // --- шаг «Сохранение»: первый автосейв -----------------------
    on('game:save', function () {
      if (byId.save && byId.save.st === WAIT) activate('save');
    });

    // --- предмет подобран: сразу несколько триггеров --------------
    on('item:picked', function (d) {
      var h = hints();
      if (h) h._tutFirstPick = 1;      // служебный флаг: «руки уже не пусты»

      var id = d && d.id;
      var def = defOf(id);

      // радио-кристалл — шаг «Радио»
      if (id === 'radio_crystal' && byId.radio && byId.radio.st === WAIT) {
        activate('radio');
        return;
      }

      // спички/огниво — шаг «Огонь»
      if (def && def.tags && def.tags.indexOf('firestarter') >= 0 &&
          byId.fire && byId.fire.st === WAIT) {
        activate('fire');
        return;
      }

      // надеваемая вещь — шаг «Экипировка»
      if (def && def.slots && def.slots.length &&
          byId.equip && byId.equip.st === WAIT) {
        activate('equip');
        return;
      }

      // еда — шаг «Еда»
      if (def && (def.cat === 'food' || def.cat === 'drink') &&
          byId.food && byId.food.st === WAIT) {
        activate('food');
        return;
      }

      // любая вещь при пустом шаге «Инвентарь» — намекнуть про [I]
      if (byId.inv && byId.inv.st === WAIT) activate('inv');
    });

    // --- инвентарь менялся: страховка триггеров «Экипировка» -----
    on('inv:changed', function () {
      if (byId.equip && byId.equip.st === WAIT && hasEquippable()) {
        activate('equip');
      }
    });

    // --- урон от волка: мгновенный урок «Волки» -------------------
    on('player:damage', function (d) {
      var src = d && d.src;
      if (src && src.kind === 'wolf' && byId.wolves &&
          byId.wolves.st === WAIT) {
        activate('wolves');
      }
    });
  }

  // ====================================================================
  //  ТИК (приоритет 80 — UI)
  // ====================================================================

  /** Открыт ли чужой модальный экран (инвентарь, крафт, справка…)?
   *  На это время панель и жетон прячем — не мешаться под окнами. */
  function uiModal() {
    try { return !!(WS.Ui && WS.Ui.modal && WS.Ui.modal()); }
    catch (e) { return false; }
  }

  function tutTick(dt) {
    if (!built || !bound) return;

    // ленивая вживлялка кнопки в оверлей паузы (ui.js строит его позже нас)
    pauseT += dt;
    if (pauseT >= PAUSE_RETRY) {
      pauseT = 0;
      if (!pauseInjected) tryInjectPauseButton();
    }

    if (!enabled || !running()) {
      if (shown || queue.length) stopAll(null);
      return;
    }

    // отложенный старт первого шага (даём игроку увидеть мир)
    if (startT >= 0) {
      startT -= dt;
      if (startT < 0) {
        startT = -1;
        armAutoSteps(false);
      }
    }

    // время активного шага — у самого шага (st.activeT в pollCompletes)

    pollArms();
    pollCompletes(dt);

    // панель не спорит с чужими окнами: пока открыт модальный экран —
    // прячем и панель, и жетон; как закрыли — возвращаем (переход, а
    // не каждый кадр: renderPanel тяжеловат для per-frame)
    var modalNow = uiModal();
    if (modalNow !== modalHidden) {
      modalHidden = modalNow;
      if (modalNow) {
        hidePanel();
        if (dom.chip) dom.chip.classList.add('hidden');
      } else {
        if (shown && !minimized) renderPanel();
        updateChip();
      }
    }

    updateChip();
  }

  // ====================================================================
  //  ПУБЛИЧНОЕ ПЕРЕСЧИТАНИЕ / ОТЛАДКА
  // ====================================================================

  /** Сводка шагов для справки (F1) и отладки: массив коротких описей. */
  function report() {
    var out = [];
    for (var i = 0; i < steps.length; i++) {
      var st = steps[i];
      out.push({
        id: st.id, order: st.order, title: st.title, mode: st.mode,
        state: ['wait', 'active', 'done', 'skip'][st.st]
      });
    }
    return out;
  }

  /** Одна строка о состоянии обучения — для подвала справки (F1):
   *  «Пройдено 7 из 15 шагов» / «Обучение отключено». */
  function statusText() {
    if (!enabled) return T('tut.status.off', 'Обучение отключено');
    var n = WS.Tutorial ? WS.Tutorial.progress() : 0;
    return T('tut.status.line', 'Пройдено шагов обучения: {n} из {m}')
      .replace('{n}', String(n)).replace('{m}', String(steps.length));
  }

  /** Показать произвольный шаг принудительно (для тестов/справки). */
  function force(id) {
    var st = byId[id];
    if (!st) return false;
    if (st.st === DONE) st.st = WAIT;
    activate(id);
    return true;
  }

  /** Сброс прогресса обучения (консоль/настройки): чистит story.hints
   *  от ключей tut_* — следующая партия начнёт с начала. */
  function resetProgress() {
    var h = hints();
    if (h) {
      for (var i = 0; i < steps.length; i++) delete h[steps[i].key];
      delete h._tutFirstPick;
    }
    for (var k = 0; k < steps.length; k++) steps[k].st = WAIT;
    resetRuntime();
  }

  /** Самодиагностика (консоль разработчика: WS.Tutorial.selftest()). */
  function selftest() {
    var out = [];
    var pass = 0, fail = 0;
    function ok(name, cond) {
      if (cond) { pass++; out.push('  ok   ' + name); }
      else { fail++; out.push('  FAIL ' + name); }
      return !!cond;
    }

    ok('модуль зарегистрирован (WS.Tutorial)', !!WS.Tutorial);
    ok('шагов определено: 15', steps.length === 15);
    ok('ключи шагов уникальны (tut_*)', (function () {
      var seen = {};
      for (var i = 0; i < steps.length; i++) {
        if (seen[steps[i].key]) return false;
        seen[steps[i].key] = 1;
      }
      return true;
    })());
    ok('порядок шагов 1..15 без дыр', (function () {
      for (var i = 0; i < steps.length; i++) {
        if (steps[i].order !== i + 1) return false;
      }
      return true;
    })());
    ok('у всех шагов есть текст, ожидание, напоминание и реплика успеха',
      (function () {
        for (var i = 0; i < steps.length; i++) {
          var s = steps[i];
          if (!s.title || !s.text || !s.remind || !s.wait || !s.done) {
            return false;
          }
        }
        return true;
      })());
    ok('режимы шагов корректны (wait/advice)', (function () {
      for (var i = 0; i < steps.length; i++) {
        if (steps[i].mode !== 'wait' && steps[i].mode !== 'advice') return false;
      }
      return true;
    })());
    ok('у экшен-шагов есть arm или событие (auto/по списку)', (function () {
      // авто-шаги и чисто событийные (night/save) без arm — законны;
      // всё прочее должно уметь вооружаться само
      var eventOnly = { night: 1, save: 1 };
      for (var i = 0; i < steps.length; i++) {
        var s = steps[i];
        if (s.auto) continue;
        if (eventOnly[s.id]) continue;
        if (typeof s.arm !== 'function') return false;
      }
      return true;
    })());
    ok('сводка report() даёт 15 записей', (function () {
      var r = report();
      return r && r.length === 15;
    })());
    ok('progress() в границах 0..15', (function () {
      var p = WS.Tutorial ? WS.Tutorial.progress() : 0;
      return p >= 0 && p <= 15;
    })());
    ok('isBusy() — булево значение', typeof (WS.Tutorial ? WS.Tutorial.isBusy() : false) === 'boolean');
    ok('панель построена (#ws-tutorial)', !!document.getElementById('ws-tutorial'));
    ok('жетон построен (#ws-tutorial-chip)', !!document.getElementById('ws-tutorial-chip'));
    ok('панель скрыта вне партии', (function () {
      var r = document.getElementById('ws-tutorial');
      return !r || r.classList.contains('hidden') || !!shown;
    })());
    ok('force() вне партии вежливо молчит', (function () {
      if (running()) return true;          // в партии — не трогаем живое
      return force('move') === false;
    })());
    ok('force() с кривым id не падает', force('no-such-step') === false);
    ok('настройка читается из localStorage', typeof readStoredOff() === 'boolean');
    ok('флаг «панель под модальным окном» — булев', typeof modalHidden === 'boolean');
    ok('ключи шагов не конфликтуют с ключами HUD D1', (function () {
      // наши — 'tut_*', их — голые 'move'/'search'/... : префикс разводит
      for (var i = 0; i < steps.length; i++) {
        if (steps[i].key.indexOf('tut_') !== 0) return false;
      }
      return true;
    })());

    out.push('  --   итог: ' + pass + ' ок, ' + fail + ' провал');
    return out;
  }

  // ====================================================================
  //  ИНИЦИАЛИЗАЦИЯ ШАГОВ (массив создают на загрузке, состояния — в boot)
  // ====================================================================

  function makeSteps() {
    // дед-режим? — дед-ветка (ID шагов совпадают там, где суть та же:
    // move/look/search — переиспользуем сохранённый прогресс честно)
    var cz = false;
    try { cz = !!(WS.G && WS.G.crazy); } catch (e) { cz = false; }
    var raw = cz ? CRAZY_STEPS() : STEPS();
    steps.length = 0;
    byId = {};
    for (var i = 0; i < raw.length; i++) {
      var st = raw[i];
      st.key = 'tut_' + st.id;
      st.st = WAIT;
      st.activeT = 0;      // сколько шаг активен (сек) — напоминания/TTL
      st.reminded = 0;     // сколько повторных подсказок уже ушло (0..2)
      steps.push(st);
      byId[st.id] = st;
    }
  }

  // ====================================================================
  //  ПУБЛИЧНЫЙ API
  // ====================================================================

  var Tutorial = {
    /** Включить/выключить обучение (кнопки UI, пауза, справка F1). */
    setEnabled: setEnabled,
    isEnabled: isEnabled,

    /** Принудительно показать шаг (тесты, справка). */
    force: force,

    /** Сброс прогресса обучения (story.hints, ключи tut_*). */
    resetProgress: resetProgress,

    /** Сводка шагов: [{id, order, title, mode, state}]. */
    report: report,

    /** Строка о состоянии обучения — для справки (F1). */
    statusText: statusText,

    /** Сколько шагов закрыто (done+skip) — для справки. */
    progress: function () {
      var n = 0;
      for (var i = 0; i < steps.length; i++) {
        if (steps[i].st === DONE || steps[i].st === SKIP) n++;
      }
      return n;
    },

    /** Идёт ли сейчас какой-то шаг. */
    isBusy: function () { return !!(shown || queue.length); },

    /** Самодиагностика (консоль). */
    selftest: selftest
  };

  // ====================================================================
  //  BOOT
  // ====================================================================

  WS.boot(function initTutorial() {
    makeSteps();
    buildDom();
    bindEvents();
    enabled = !readStoredOff();
    WS.tick(TICK_PRI, tutTick, 'ui:tutorial');
    WS.log('tutorial: готов (J1, шагов: ' + steps.length + ', обучение ' +
           (enabled ? 'включено' : 'отключено') + ')');
  }, 'ui:tutorial:init');

  WS.def('Tutorial', Tutorial);
})();
