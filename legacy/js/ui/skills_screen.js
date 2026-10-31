/**
 * skills_screen.js — ЭКРАН НАВЫКОВ «Белого Безмолвия» (клавиша K).
 * Сетка 12 навыков: монограмма, имя, уровень 0–10, XP-бар, описание
 * эффекта текущего уровня. Сумма уровней, профессия и черты характера
 * с описаниями (из WS.Data, при отсутствии — местный справочник).
 * Связи: Skills.list/totalLv/bonus, G.player (prof, traits), Ui.
 */
(function () {
  'use strict';

  // ====================================================================
  //  КОНСТАНТЫ И СПРАВОЧНИКИ
  // ====================================================================

  var TICK_UI = 80;            // приоритет UI (CONTRACT.md)
  var REFRESH_S = 0.5;         // редкое обновление (уровни меняются нечасто)

  // монограммы навыков (первая буква имени, различимая в ромбе)
  var MONOGRAMS = {
    axe: 'Т', melee: 'Р', firearm: 'О', sneak: 'К', run: 'Б', cook: 'Г',
    carpentry: 'П', tailor: 'Ш', medic: 'М', forage: 'Х', track: 'С', survive: 'В'
  };

  // категории -> css-класс карточки
  var CAT_CLASS = {
    'боевые': 'cat-war',
    'скрытные': 'cat-stealth',
    'бытовые': 'cat-home'
  };

  // ---- профессии: локальный справочник на случай, если data ещё нет ----
  var PROFS = {
    telegraph: {
      name: 'Телеграфист',
      desc: 'Служащий станции: грамотен, точен, знает аппарат и порядок дел. Остался в посёлке, когда партия ушла на запад.'
    },
    hunter: {
      name: 'Охотник',
      desc: 'Тайга кормит: следы, тропы, повадки зверя. Ружьё — инструмент, а не роскошь.'
    },
    carpenter: {
      name: 'Плотник',
      desc: 'Топор и пила слушаются руки: постройки крепче, работа спорится.'
    },
    doctor: {
      name: 'Фельдшер',
      desc: 'Йод, карболка, шина: половина врачевания — руки, половина — терпение больного.'
    },
    peasant: {
      name: 'Крестьянин',
      desc: 'Земля и скотина научили главному: работать и не хныкать.'
    },
    exile: {
      name: 'Ссыльный',
      desc: 'Чужой здесь всеми, кроме зимы. Зато вороватость и скрытность — не грех, а способ выжить.'
    },
    sailor: {
      name: 'Матрос',
      desc: 'Порты, туманы, узлы. Море приучило к холоду и дисциплине.'
    },
    teacher: {
      name: 'Учитель',
      desc: 'Книжки да чернильница: знаешь больше, можешь меньше — но не сдаёшься.'
    },
    smith: {
      name: 'Кузнец',
      desc: 'Молот и наковальня: руки помнят металл лучше, чем бумагу.'
    }
  };

  // ---- черты характера (id из WS.G.player.traits) --------------------
  var TRAITS = {
    sturdy:      { name: 'Крепкий',      neg: false, desc: 'Организм как печка: хворь цепляется хуже.' },
    frail:       { name: 'Хилый',        neg: true,  desc: 'Тело слабее обычного: раны заживают дольше.' },
    night_owl:   { name: 'Ночная душа',  neg: false, desc: 'В темноте ориентируется чуть лучше.' },
    cold_blood:  { name: 'Холодная кровь', neg: false, desc: 'Мороз щиплет меньше, дрожь приходит позже.' },
    sleepless:   { name: 'Бессонный',    neg: false, desc: 'Спит мало и всё равно высыпается.' },
    greedy:      { name: 'Скупой',       neg: true,  desc: 'Тащит в карман всё, что плохо лежит.' },
    lucky:       { name: 'Удачливый',    neg: false, desc: 'Находит чуть больше положенного.' },
    marksman:    { name: 'Меткий',      neg: false, desc: 'Прицел — от рождения.' },
    drunkard:    { name: 'Пьяница',     neg: true,  desc: 'Без чарки руки трясутся, с чаркой — голова.' },
    coward:      { name: 'Трус',        neg: true,  desc: 'Держится подальше от беды — и живёт.' },
    scarred:     { name: 'Шрамированный', neg: false, desc: 'Старые раны: боль знакома и терпима.' },
    iron_stomach:{ name: 'Железный живот', neg: false, desc: 'Плохую пищу желудок принимает безропотно.' },
    fast_hands:  { name: 'Быстрые руки', neg: false, desc: 'Работа спорится: крафт чуть быстрее.' },
    quiet_step:  { name: 'Тихий шаг',   neg: false, desc: 'Зверь слышит его позже.' }
  };

  // ====================================================================
  //  СОСТОЯНИЕ МОДУЛЯ
  // ====================================================================

  var root = null;
  var isOpen = false;
  var refreshT = 0;
  var raisedSkill = null;      // id навыка для «вспышки» роста
  var raisedT = 0;
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

  /** Список навыков из системы (или пустой). */
  function skillsList() {
    if (WS.Skills && WS.Skills.list) {
      try { return WS.Skills.list(); } catch (e) { /* ниже */ }
    }
    return [];
  }

  /** Сумма уровней. */
  function totalLv() {
    if (WS.Skills && WS.Skills.totalLv) {
      try { return WS.Skills.totalLv(); } catch (e) { return 0; }
    }
    var list = skillsList();
    var n = 0;
    for (var i = 0; i < list.length; i++) n += list[i].lv;
    return n;
  }

  // ====================================================================
  //  ПРОФЕССИЯ И ЧЕРТЫ
  // ====================================================================

  /** Данные профессии: сначала WS.Data.professions, затем справочник. */
  function profInfo(id) {
    id = id || 'telegraph';
    var d = null;
    if (WS.Data && WS.Data.professions && WS.Data.professions[id]) {
      d = WS.Data.professions[id];
    }
    var local = PROFS[id];
    return {
      id: id,
      name: (d && d.name) || (local && local.name) || ('Профессия: ' + id),
      desc: (d && d.desc) || (local && local.desc) ||
            'До катастрофы была и другая жизнь. Север помнит всех.'
    };
  }

  /** Данные черты. */
  function traitInfo(id) {
    var d = null;
    if (WS.Data && WS.Data.traits && WS.Data.traits[id]) {
      d = WS.Data.traits[id];
    }
    var local = TRAITS[id];
    var name = (d && d.name) || (local && local.name) || String(id);
    // человекочитаемое имя из id: 'iron_stomach' -> 'Железный желудок'-заглушка
    if (!d && !local) {
      name = id.replace(/_/g, ' ');
      name = name.charAt(0).toUpperCase() + name.substring(1);
    }
    return {
      id: id,
      name: name,
      desc: (d && d.desc) || (local && local.desc) || 'Черта характера: сказывается на выживании.',
      neg: (d && d.neg) || (local && local.neg) || false
    };
  }

  // ====================================================================
  //  РЕНДЕР
  // ====================================================================

  /** Пипсы 0..10. */
  function pipsHtml(lv) {
    var out = '<div class="pips">';
    for (var i = 0; i < 10; i++) {
      out += '<i' + (i < lv ? ' class="on"' : '') + '></i>';
    }
    return out + '</div>';
  }

  /** Одна карточка навыка. */
  function skillCard(s, bonusNow) {
    var mono = MONOGRAMS[s.id] || (s.name ? s.name.charAt(0).toUpperCase() : '?');
    var catCls = CAT_CLASS[s.cat] || 'cat-home';
    var xpPct = s.maxed ? 100 : Math.round(s.frac * 100);
    var xpTxt = s.maxed
      ? 'мастер — потолок'
      : s.xp + ' / ' + s.need + ' XP';
    var effect = s.fx || s.desc || '';
    // текущий численный эффект: (bonus - 1) * 100 %
    var nowPct = '';
    if (typeof bonusNow === 'number' && s.lv > 0) {
      var p = Math.round((bonusNow - 1) * 100);
      nowPct = p !== 0 ? ' Сейчас: ' + (p > 0 ? '+' : '') + p + '%' : '';
    }
    var raised = (raisedSkill === s.id) ? ' raised' : '';

    return (
      '<div class="sk-card ' + catCls + raised + '" data-skill="' + esc(s.id) + '">' +
        '<div class="sk-top">' +
          '<div class="sk-ico"><span>' + esc(mono) + '</span></div>' +
          '<div class="sk-head">' +
            '<div class="sk-name">' + esc(s.name) +
              '<span class="tag">' + esc(s.cat) + '</span>' +
              '<span class="sk-lv">' + s.lv + '<small>/10</small></span>' +
            '</div>' +
            pipsHtml(s.lv) +
          '</div>' +
        '</div>' +
        '<div class="sk-fx">' + esc(effect) + '.' + nowPct + '</div>' +
        '<div class="sk-xp-line">' +
          '<div class="bar b-xp"><i style="width:' + xpPct + '%"></i></div>' +
          '<span class="sk-xp-num">' + esc(xpTxt) + '</span>' +
        '</div>' +
      '</div>'
    );
  }

  /** Профиль персонажа: профессия + черты. */
  function profileHtml(p) {
    var prof = profInfo(p.prof);
    var out =
      '<div class="sk-prof">' +
        '<h3>' + esc(prof.name) + '</h3>' +
        '<div class="sk-prof-desc">' + esc(prof.desc) + '</div>' +
      '</div>' +
      '<div class="sk-traits">' +
        '<h4>Черты характера</h4>';

    var traits = p.traits || [];
    if (!traits.length) {
      out += '<div style="font-size:12.5px;color:var(--ink-dim);font-style:italic">' +
             'Обычный человек — что уже само по себе редкость в эти времена.</div>';
    } else {
      for (var i = 0; i < traits.length; i++) {
        var t = traitInfo(traits[i]);
        out += '<span class="sk-trait' + (t.neg ? ' neg' : '') + '" title="' +
               esc(t.desc) + '">' + esc(t.name) + '</span>';
      }
    }
    out += '</div>';
    return out;
  }

  /** Полное обновление содержимого. */
  function refresh() {
    if (!root || !isOpen) return;
    var p = WS.G && WS.G.player;
    if (!p) return;

    // сумма уровней в шапке
    if (refs.sum) {
      refs.sum.innerHTML = 'Сумма уровней: <b>' + totalLv() + '</b> из 120' +
        (WS.Time && WS.Time.daysLeft
          ? ' · до парохода ' + Math.max(0, WS.Time.daysLeft()) + ' дн.'
          : '');
    }

    // карточки
    var list = skillsList();
    var out = '';
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      var bonusNow = null;
      if (WS.Skills && WS.Skills.bonus) {
        try { bonusNow = WS.Skills.bonus(s.id); } catch (e) { bonusNow = null; }
      }
      out += skillCard(s, bonusNow);
    }
    if (!list.length) {
      out = '<div class="jr-empty">Система навыков ещё не проснулась.</div>';
    }
    if (refs.grid) refs.grid.innerHTML = out;

    // профиль
    if (refs.profile) refs.profile.innerHTML = profileHtml(p);
  }

  // ====================================================================
  //  DOM
  // ====================================================================

  function buildDom() {
    if (root) return;
    var uiRoot = document.getElementById('ui-root');
    if (!uiRoot) { WS.warn('skills: нет #ui-root'); return; }

    root = document.createElement('div');
    root.className = 'ws-panel ws-screen ws-skills-screen hidden';
    root.innerHTML =
      '<div class="ws-frame" style="width:1040px;max-width:96vw;height:660px;max-height:92vh">' +
        '<div class="scr-head">' +
          '<span class="scr-title">Навыки</span>' +
          '<span class="scr-sub sk-sum" id="ws-sk-sum"></span>' +
          '<span class="scr-key">K</span>' +
          '<button class="scr-close" title="Закрыть (K / Esc)">&#10005;</button>' +
        '</div>' +
        '<div class="scr-body sk-body">' +
          '<div class="sk-profile" id="ws-sk-profile"></div>' +
          '<div class="sk-grid" id="ws-sk-grid"></div>' +
        '</div>' +
        '<div class="scr-foot">' +
          '<b>K / Esc</b> — закрыть · опыт растёт от дела: руби, кради, стряпай, читай книги' +
        '</div>' +
      '</div>';

    uiRoot.appendChild(root);
    refs = {
      sum: root.querySelector('#ws-sk-sum'),
      grid: root.querySelector('#ws-sk-grid'),
      profile: root.querySelector('#ws-sk-profile')
    };

    var closeBtn = root.querySelector('.scr-close');
    if (closeBtn) closeBtn.addEventListener('click', function () { close(); }, false);
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

    refresh();
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
    if (d && d.code === 'KeyK') {
      if (WS.Input && WS.Input.consumeCode) WS.Input.consumeCode('KeyK');
      close();
    } else if (d && d.code === 'Escape') {
      close();
    }
  }

  /** Рост навыка, пока окно открыто: подсветить карточку. */
  function onLevelUp(d) {
    if (!isOpen || !d) return;
    raisedSkill = d.skill || null;
    raisedT = 1.2;
    refresh();
    snd('levelup', 0.35);
  }

  function uiTick(dt) {
    try {
      if (!isOpen) {
        if (!playable()) return;
        if (anyOtherOpen()) return;
        if (WS.Ui && WS.Ui.modal && WS.Ui.modal()) return;
        if (WS.Input && WS.Input.hit && WS.Input.hit('skills')) open();
        return;
      }
      if (!WS.G.running) { close(); return; }

      // вспышка «уровень вырос»
      if (raisedT > 0) {
        raisedT -= dt;
        if (raisedT <= 0) {
          raisedSkill = null;
          refresh();
        }
      }

      // редкое обновление: уровни меняются не каждый кадр
      refreshT += dt;
      if (refreshT >= REFRESH_S) {
        refreshT = 0;
        refresh();
      }
    } catch (e) {
      WS.err('skills uiTick:', e && e.message);
    }
  }

  // ====================================================================
  //  ПУБЛИЧНЫЙ API + BOOT
  // ====================================================================

  var SkillsScreen = {
    open: open,
    close: close,
    toggle: toggle,
    isOpen: function () { return isOpen; },
    refresh: function () { refresh(); }
  };

  WS.def('SkillsScreen', SkillsScreen);

  WS.boot(function bootSkillsScreen() {
    ensureUiBase();
    buildDom();

    WS.tick(TICK_UI, uiTick, 'ui:skills');
    WS.Ev.on('key:down', onKey);
    WS.Ev.on('player:levelup', onLevelUp);

    WS.Ev.on('player:die', close);
    WS.Ev.on('game:victory', close);

    WS.log('ui: экран навыков готов (K)');
  }, 'ui:skills:init');

})();
