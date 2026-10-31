/**
 * world_hover.js — ПОДСКАЗКИ ПРИ НАВЕДЕНИИ НА ОБЪЕКТЫ МИРА.
 *
 * ЗАЧЕМ: пользователь просил, чтобы подсказки показывались ВСЕГДА при
 * наведении на предметы, а не при нажатии на них. Раньше игрок узнавал,
 * что за объект перед ним, только нажав [E] (одна строка hint). Теперь:
 * курсор над печью/дверью/контейнером/кроватью/зверем — рядом с курсором
 * сразу висит карточка: имя, состояние и что можно сделать (клавиша).
 *
 * КАК: тик раз в ~0.12 сек опрашивает мышь (WS.Input), переводит в мир,
 * ищет объект под курсором (World.objAt + ближайший в радиусе) или
 * сущность. Строит HTML через WS.ToolTip.plainHtml и показывает тем же
 * движком тултипов — один визуальный язык для UI и мира.
 * Автор игры: DirtyG.
 */
(function () {
  'use strict';

  var POLL = 0.12;          // сек между проверками
  var NEAR_R = 1.1;         // радиус захвата объекта от курсора, тайлы
  var t = 0;

  function P() { return (WS.G && WS.G.player) || null; }
  function dist(ax, ay, bx, by) {
    var dx = ax - bx, dy = ay - by;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /** Есть ли перед нами печь (как в actions.isStoveObj). */
  function isStove(o) {
    if (!o) return false;
    if (o.heat) return true;
    var n = String(o.sprName || '');
    return n === 'pech' || n === 'stove_iron' || n.indexOf('stove') >= 0;
  }

  /** HTML карточки объекта мира. */
  function objHtml(o, p) {
    var TT = WS.ToolTip;
    if (!TT) return '';
    var name = o.name || '';
    var lines = [];
    var foot = '';
    var inReach = dist(p.x, p.y, o.x, o.y) <= 1.6;

    if (o.door) {
      name = name || 'Дверь';
      if (o.locked && !o.open) { lines.push('🔒 Заперто'); }
      else lines.push('[ЛКМ]/[E] ' + (o.open ? 'Закрыть' : 'Открыть') + ' · [ПКМ] действия');
      if (!inReach) lines.push('Подойти ближе');
    } else if (o.container) {
      if (!name) name = 'Контейнер';
      if (o.corpse) { name = o.name || 'Труп'; lines.push('[ЛКМ] Обыскать · [ПКМ] действия'); }
      else if (o.sprName === 'crazy_gift') {
        name = 'Подарок';
        lines.push('[ЛКМ] Забрать подарок');
        foot = 'Осталось от «изгнанной мультяшки».';
      } else {
        lines.push(o.looted ? 'Обыскано' : '[ЛКМ] Обыскать · [ПКМ] действия');
      }
    } else if (isStove(o)) {
      name = name || 'Печь';
      var lit = !!(o.fire && o.fireData && o.fireData.fuel > 0);
      if (lit) {
        var f = Math.round((o.fireData.fuel / 240) * 100);
        lines.push('🔥 Топится · топливо ~' + f + '%');
        lines.push('[ЛКМ] Подкинуть дров · греет комнату');
      } else {
        lines.push('[ЛКМ] Затопить печь · [ПКМ] действия');
        lines.push('Нужны: дрова + спичка или огниво');
      }
    } else if (/^bed/.test(String(o.sprName || ''))) {
      name = name || 'Кровать';
      lines.push('[ЛКМ]/[Z] Спать');
      foot = 'Во сне время летит, силы восстанавливаются.';
    } else if (o.forage) {
      name = name || 'Растение';
      lines.push('[ЛКМ]/[E] Собрать');
    } else if (o.drop || o.kind === 'drop') {
      name = name || 'Предмет';
      lines.push('[ЛКМ] Подобрать в инвентарь');
    } else if (o.radio || o.sprName === 'radio_recv') {
      name = name || 'Радиоприёмник';
      lines.push('📻 Работает рядом с вами');
      foot = 'Новости эфира слышны возле приёмника.';
    } else if (/tree|fir|pine|birch|spruce|stump/i.test(String(o.sprName || ''))) {
      name = name || 'Дерево';
      lines.push('Дрова ищи в поленницах и ящиках');
    } else if (/ice_hole|polynya/i.test(String(o.sprName || '')) ||
               /Прорубь|Полынь/i.test(name)) {
      name = name || 'Прорубь';
      lines.push('[ЛКМ] Ловить рыбу · [ПКМ] действия');
      foot = 'Лёд можно растопить у огня — получится вода.';
    } else {
      name = name || 'Объект';
      lines.push(inReach ? '[E] Осмотреть' : 'Осмотр [E] — подойти ближе');
    }
    return TT.plainHtml(name, lines, foot);
  }

  /** HTML карточки существа. */
  function entHtml(e) {
    var TT = WS.ToolTip;
    if (!TT) return '';
    var RU = {
      wolf: 'Волк', bear: 'Медведь', bandit: 'Бандит', deer: 'Олень',
      hare: 'Заяц', crow: 'Ворон', hermit: 'Отшельник',
      wanderer: 'Странник', player: 'Вы'
    };
    var name = e.name || RU[e.kind] || e.kind || 'Существо';
    var lines = [];
    if (e.kind === 'wolf' || e.kind === 'bear' || e.kind === 'bandit') {
      lines.push('⚠ Опасен!');
      lines.push('Атака: [ЛКМ] · выстрел: [ЛКМ] с ружьём');
    } else {
      lines.push('Атака: [ЛКМ]');
    }
    if (typeof e.hp === 'number') lines.push('Здоровье: ' + Math.max(0, Math.round(e.hp)));
    return TT.plainHtml(name, lines, '');
  }

  /** Найти объект под курсором: точно в тайле или ближайший в радиусе. */
  function objAtCursor(wx, wy) {
    var w = WS.World;
    if (!w) return null;
    var direct = null;
    try { direct = w.objAt(Math.floor(wx), Math.floor(wy)); } catch (e) { direct = null; }
    if (direct) return direct;
    // ближайший в радиусе (мелкие объекты между тайлами)
    var best = null, bd = NEAR_R;
    try {
      var list = w.query ? w.query(wx - NEAR_R - 1, wy - NEAR_R - 1,
                                    wx + NEAR_R + 1, wy + NEAR_R + 1)
                         : (w.objects || []);
      for (var i = 0; i < list.length; i++) {
        var o = list[i];
        if (!o) continue;
        var d = dist(wx, wy, o.x, o.y);
        if (d < bd) { bd = d; best = o; }
      }
    } catch (e2) { /* пусто */ }
    return best;
  }

  /** Существо под курсором (дроп-предметы — отдельно, ниже). */
  function entAtCursor(wx, wy) {
    var w = WS.World;
    if (!w || !w.ents) return null;
    var best = null, bd = 0.9;
    for (var i = 0; i < w.ents.length; i++) {
      var e = w.ents[i];
      if (!e || e.dead || e.id === 'player') continue;
      if (e.kind === 'drop' || e.drop) continue;   // предметы — своя карточка
      var d = dist(wx, wy, e.x, e.y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  /** Дроп-предмет под курсором: карточка с именем предмета. */
  function dropAtCursor(wx, wy) {
    var w = WS.World;
    if (!w || !w.ents) return null;
    var best = null, bd = 1.0;
    for (var i = 0; i < w.ents.length; i++) {
      var e = w.ents[i];
      if (!e || e.dead) continue;
      if (e.kind !== 'drop' && !e.drop) continue;
      var d = dist(wx, wy, e.x, e.y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  /** HTML карточка дропа: имя предмета и действие. */
  function dropHtml(e, p) {
    var TT = WS.ToolTip;
    if (!TT) return '';
    var name = 'Предмет';
    var lines = [];
    try {
      var dr = (WS.Action && WS.Action.parseDrop) ? WS.Action.parseDrop(e) : null;
      if (dr && dr.id) {
        var nm = (WS.Action && WS.Action.itemName) ? WS.Action.itemName(dr.id) : dr.id;
        name = nm || name;
        if (dr.count > 1) name += ' ×' + dr.count;
      }
    } catch (err) { /* пусто */ }
    var inReach = dist(p.x, p.y, e.x, e.y) <= 1.9;
    if (inReach) lines.push('[ЛКМ] Подобрать в инвентарь');
    else lines.push('Подойти ближе — [ЛКМ] подобрать');
    return TT.plainHtml(name, lines, '');
  }

  function hoverTick(dt) {
    t -= dt;
    if (t > 0) return;
    t = POLL;
    dbg.ticks++;

    var g = WS.G;
    var p = P();
    if (!g || !g.running || !p || g.dead) { dbg.lastWhy = 'не идёт партия'; hideIfWorld(); return; }
    // модал открыт — мир не подсказывает (тултипы UI сами)
    if (WS.Ui && WS.Ui.modal && WS.Ui.modal()) { dbg.lastWhy = 'модал'; hideIfWorld(); return; }
    // WS.Input.mouse может быть объектом (input.js) или функцией-обёрткой
    // (player.js, CONTRACT.md) — поддерживаем оба стиля доступа
    var m = WS.Input && WS.Input.mouse;
    if (typeof m === 'function') m = m();
    if (!m || !WS.Input.overCanvas()) { dbg.lastWhy = 'курсор вне канваса'; hideIfWorld(); return; }

    // мир под курсором
    try { if (WS.Input.updateMouseWorld) WS.Input.updateMouseWorld(); } catch (e) { /* пусто */ }
    var html = '';
    var ent = entAtCursor(m.wx, m.wy);
    if (ent) {
      html = entHtml(ent);
    } else {
      var dr0 = dropAtCursor(m.wx, m.wy);
      if (dr0) {
        html = dropHtml(dr0, p);
      } else {
        var o = objAtCursor(m.wx, m.wy);
        if (o) html = objHtml(o, p);
      }
    }
    if (html && WS.ToolTip && WS.ToolTip.show) {
      dbg.lastWhy = 'показано';
      WS.ToolTip.show(m.x + 14, m.y + 16, html);
      worldShown = true;
    } else {
      dbg.lastWhy = ent ? 'сущность без карточки' : 'под курсором пусто';
      hideIfWorld();
    }
  }

  var worldShown = false;
  var dbg = { ticks: 0, lastWhy: '—' };
  function hideIfWorld() {
    if (!worldShown) return;
    worldShown = false;
    try { if (WS.ToolTip && WS.ToolTip.hide) WS.ToolTip.hide(); } catch (e) { /* пусто */ }
  }

  WS.def('WorldHover', {
    _dbg: function () { return dbg; }
  });

  WS.boot(function initWorldHover() {
    WS.tick(52, hoverTick, 'worldhover:tick');
    WS.log('[WorldHover] Подсказки мира при наведении подключены');
  }, 'worldhover:init');
})();
