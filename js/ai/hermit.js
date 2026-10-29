/**
 * hermit.js — СТАРЕЦ АКИМ, отшельник-схимник (модуль F2, NPC).
 * Лесная избушка на севере карты (y < 40): сруб 5×4 из WALL_LOG, печь,
 * нары, сушёные травы (лут), крест старой веры у входа. Сам Аким:
 * сущность {kind:'hermit'} — не враждебен, бандиты и волки его двора
 * боятся. Разговор — через WS.Dialog (дерево тем: схимник, зимовка,
 * торговля шкурами, волки, медведь, пароход, приют). Репутация —
 * WS.G.story.rep.hermit: обмены +1, водка +2, табак +1; при 5+ — дар
 * (лук или книга). Редкое событие (день 20+): волки задели старца —
 * перевязать → rep +5.
 * Связи: systems/dialog.js (окно разговора), world/world.js (addEnt/
 * addObject/carve), ai/ai.js (register/anim/wander), ai/wolf.js
 * (поле fleeFrom), content/lore.js (советы), content/story.js (флаги).
 */
(function () {
  'use strict';

  // ====================================================================
  //  КОНСТАНТЫ
  // ====================================================================

  var HUT_W = 5, HUT_H = 4;      // сруб: 5×4 тайла
  var HERMIT_Y0 = 10, HERMIT_Y1 = 38;   // лесная зона поиска места
  var MIN_VILLAGE_D = 55;        // от посёлка — подальше
  var TALK_R = 1.9;              // радиус разговора по [E]
  var APPROACH_R = 3.2;          // подходит, если игрок ближе 3 тайлов
  var SCARE_R = 7;               // радиус «двора», где зверь не смеет
  var TRADES_PER_DAY = 3;        // обменов в день он не делает больше
  var WOUNCED_DAY = 20;         // со скольких дней может приключиться беда
  var WOUND_SELF_DAYS = 3;      // сам не поправится столько дней
  var REP_SHELTER = 3;          // приют при rep > 2
  var REP_GIFT = 5;             // дар при rep >= 5

  // пиксельные цвета (в тон палитре WS.Spr.pal)
  var C_COAT = '#6a5c48';        // тулуп
  var C_COAT_D = '#57492f';      // тулуп, тень
  var C_FUR = '#8d7c63';         // мех оторочки
  var C_FUR_D = '#74654f';
  var C_BEARD = '#b8b4ac';       // седая борода
  var C_BEARD_D = '#918d85';
  var C_SKIN = '#c9a186';
  var C_SKIN_D = '#a97f66';
  var C_HOOD = '#4a4438';        // куколь-капюшон
  var C_HOOD_D = '#3a352c';
  var C_STAFF = '#7a5f3d';       // посох
  var C_STAFF_D = '#5c4629';
  var C_BOOT = '#3a2e22';        // валенки
  var C_EYE = '#2b2320';

  // ====================================================================
  //  ЖИВОЕ СОСТОЯНИЕ МОДУЛЯ
  // ====================================================================

  var st = {
    hut: null,        // {x, y, w, h} — прямоугольник избы
    door: null,       // {x, y} — тайл двери
    akim: null,       // сущность
    built: false,     // изба построена в этой генерации
    scareT: 0,        // таймер обхода двора
    greeted: false    // окликал ли игрока в этой партии
  };

  function G() { return WS.G; }
  function P() { var g = WS.G; return (g && g.player) ? g.player : null; }

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  function day() { return (WS.Time && WS.Time.day) ? WS.Time.day() : 1; }
  function hour() { return (WS.Time && WS.Time.hour) ? WS.Time.hour() : 8; }

  /** Доступ к сюжетному хранилищу (репутация — в WS.G.story.rep). */
  function F() {
    var g = WS.G;
    var s = g && g.story;
    if (!s) {
      if (!g) return null;
      s = g.story = { notes: [], radio: [], flags: {}, hints: {} };
    }
    if (!s.flags) s.flags = {};
    if (!s.rep) s.rep = {};
    return s;
  }

  function fg(n) { var s = F(); return s ? s.flags[n] : undefined; }
  function fs(n, v) { var s = F(); if (s) s.flags[n] = (v === undefined ? 1 : v); }

  function rep() {
    var s = F();
    return (s && s.rep && typeof s.rep.hermit === 'number') ? s.rep.hermit : 0;
  }

  function toast(text, kind) {
    if (!text) return;
    if (WS.Ui && WS.Ui.toast) {
      try { WS.Ui.toast(text, kind || 'info'); return; } catch (e) { /* молча */ }
    }
    try { WS.Ev.emit('ui:toast', { text: text, kind: kind || 'info' }); } catch (e2) { /* пусто */ }
  }

  function snd(name, x, y, vol) {
    try {
      if (!WS.Snd || !WS.Snd.play) return;
      var o = { vol: vol === undefined ? 0.8 : vol };
      if (x !== undefined) { o.x = x; o.y = y; }
      WS.Snd.play(name, o);
    } catch (e) { /* звук не критичен */ }
  }

  /** Хроника — через публичный вход сюжетного модуля. */
  function chron(text, cls) {
    if (WS.Story && WS.Story.chron) {
      try { WS.Story.chron(text, cls || ''); return; } catch (e) { /* ниже */ }
    }
    var s = F();
    if (s) {
      if (!s.chronicle) s.chronicle = [];
      s.chronicle.push({ day: day(), time: '', text: String(text), cls: cls || '' });
    }
  }

  function invCount(id) {
    if (WS.Inv && WS.Inv.count) { try { return WS.Inv.count(id); } catch (e) { return 0; } }
    return 0;
  }

  function invConsume(id, n) {
    if (WS.Inv && WS.Inv.consume) { try { return WS.Inv.consume(id, n || 1); } catch (e) { return 0; } }
    return 0;
  }

  function invGive(id, n) {
    if (WS.Inv && WS.Inv.give) { try { return WS.Inv.give(id, n || 1); } catch (e) { return 0; } }
    return 0;
  }

  function itemDef(id) {
    return (WS.Data && WS.Data.items) ? WS.Data.items[id] : null;
  }

  /** Человекочитаемое имя предмета (i18n или литерал). */
  function itemName(id) {
    if (WS.I18N && WS.I18N.t) {
      try {
        var s = WS.I18N.t('item.' + id + '.name', '');
        if (s && s !== 'item.' + id + '.name') return s;
      } catch (e) { /* пусто */ }
    }
    var d = itemDef(id);
    return (d && d.name) ? d.name : id;
  }

  function playerDist(x, y) {
    var p = P();
    if (!p) return 9999;
    return WS.M.dist(p.x, p.y, x, y);
  }

  // ====================================================================
  //  СПРАЙТ: СТАРЕЦ АКИМ (4 ракурса, кадры 0/1 ходьба, 2 покой, 3 ранен)
  // ====================================================================

  function p(c, x, y, w, h, col) {
    c.fillStyle = col;
    c.fillRect(x, y, w, h);
  }

  /** Посох в правой руке (вертикальный, с сучком-рукоятью). */
  function staff(c, dx, topY, botY) {
    p(c, 28 + dx, topY, 3, botY - topY, C_STAFF);
    p(c, 28 + dx, topY, 1, botY - topY, C_STAFF_D);
    // сучок
    p(c, 26 + dx, topY + 2, 2, 2, C_STAFF);
    // навершие — обмотанная ветошью рукоять
    p(c, 27 + dx, topY - 3, 5, 4, C_HOOD);
    p(c, 27 + dx, topY - 1, 5, 1, '#5a4a30');
  }

  /** Аким в лицо (юг, dir 4): борода лопата, куколь, тулуп. */
  function hermitFront(c, frame, dy) {
    dy = dy || 0;
    var walk = (frame === 0 || frame === 1);

    // посох справа
    staff(c, 0, 6 + dy, 50);

    // ноги-валенки (при ходьбе шагают)
    if (frame === 1) {
      p(c, 13, 44 + dy, 6, 8, C_BOOT);
      p(c, 19, 44 + dy, 6, 7, C_BOOT);
    } else {
      p(c, 12, 44 + dy, 6, 8, C_BOOT);
      p(c, 19, 44 + dy, 6, 8, C_BOOT);
    }

    // тулуп — трапеция ниже плеч, до колен
    p(c, 10, 20 + dy, 17, 26, C_COAT);
    p(c, 11, 20 + dy, 15, 2, '#7a6a54');
    p(c, 10, 42 + dy, 17, 3, C_COAT_D);
    // меховая оторочка по подолу и вороту
    p(c, 10, 43 + dy, 17, 3, C_FUR);
    p(c, 10, 43 + dy, 17, 1, C_FUR_D);
    p(c, 12, 18 + dy, 13, 3, C_FUR);
    // складки тулупа
    p(c, 15, 24 + dy, 1, 18, C_COAT_D);
    p(c, 20, 26 + dy, 1, 15, C_COAT_D);
    // пояс — верёвка
    p(c, 11, 30 + dy, 15, 2, '#4a3a26');

    // руки в рукавах: правая на посохе, левая сжата в рукав
    p(c, 24, 22 + dy, 5, 14, C_COAT);
    p(c, 24, 22 + dy, 5, 2, '#7a6a54');
    p(c, 25, 33 + dy, 4, 4, C_FUR);
    p(c, 7, 23 + dy, 5, 13, C_COAT);
    p(c, 7, 33 + dy, 4, 4, C_FUR);

    // голова: куколь (капюшон схимника) вокруг лица
    p(c, 11, 4 + dy, 15, 12, C_HOOD);
    p(c, 12, 3 + dy, 13, 2, C_HOOD_D);
    p(c, 11, 14 + dy, 3, 6, C_HOOD);
    p(c, 23, 14 + dy, 3, 6, C_HOOD);
    // лицо
    p(c, 14, 7 + dy, 9, 8, C_SKIN);
    p(c, 14, 7 + dy, 9, 1, C_SKIN_D);
    // глаза: правый «слеп» — бельмо
    p(c, 15, 10 + dy, 2, 2, C_EYE);
    p(c, 19, 10 + dy, 2, 2, '#8f97a0');
    // брови — густые, седые
    p(c, 14, 8 + dy, 4, 1, C_BEARD);
    p(c, 18, 8 + dy, 4, 1, C_BEARD);
    // нос
    p(c, 18, 11 + dy, 1, 2, C_SKIN_D);
    // борода — лопатой, ниже груди
    p(c, 13, 15 + dy, 12, 12, C_BEARD);
    p(c, 14, 15 + dy, 10, 3, '#c6c2ba');
    p(c, 13, 25 + dy, 12, 2, C_BEARD_D);
    p(c, 15, 27 + dy, 8, 1, C_BEARD_D);
    // усы
    p(c, 15, 14 + dy, 8, 2, C_BEARD_D);
  }

  /** Аким со спины (север, dir 0): затылок куколя, борода не видна. */
  function hermitBack(c, frame, dy) {
    dy = dy || 0;
    staff(c, 0, 6 + dy, 50);

    if (frame === 1) {
      p(c, 13, 44 + dy, 6, 8, C_BOOT);
      p(c, 19, 44 + dy, 6, 7, C_BOOT);
    } else {
      p(c, 12, 44 + dy, 6, 8, C_BOOT);
      p(c, 19, 44 + dy, 6, 8, C_BOOT);
    }

    p(c, 10, 20 + dy, 17, 26, C_COAT_D);
    p(c, 12, 20 + dy, 13, 24, '#5f523c');
    p(c, 10, 43 + dy, 17, 3, C_FUR_D);
    // шов спины
    p(c, 18, 22 + dy, 1, 20, C_COAT_D);

    // руки
    p(c, 7, 23 + dy, 4, 13, C_COAT_D);
    p(c, 24, 22 + dy, 5, 14, C_COAT_D);
    p(c, 25, 33 + dy, 4, 4, C_FUR_D);

    // затылок куколя
    p(c, 11, 4 + dy, 15, 13, C_HOOD_D);
    p(c, 13, 6 + dy, 11, 9, '#403a30');
    // складка
    p(c, 13, 10 + dy, 11, 1, '#2f2b24');
  }

  /** Аким в профиль (восток, dir 2): борода вперёд, посох впереди. */
  function hermitSide(c, frame, dy) {
    dy = dy || 0;
    // посох — перед ним, чуть наклонён
    p(c, 27, 6 + dy, 3, 44, C_STAFF);
    p(c, 27, 6 + dy, 1, 44, C_STAFF_D);
    p(c, 26, 3 + dy, 5, 4, C_HOOD);

    // ноги
    if (frame === 1) {
      p(c, 13, 44 + dy, 6, 8, C_BOOT);
      p(c, 18, 44 + dy, 6, 7, C_BOOT);
    } else {
      p(c, 12, 44 + dy, 6, 8, C_BOOT);
      p(c, 19, 44 + dy, 6, 8, C_BOOT);
    }

    // тулуп в профиль
    p(c, 10, 20 + dy, 13, 24, C_COAT);
    p(c, 10, 20 + dy, 13, 2, '#7a6a54');
    p(c, 10, 42 + dy, 13, 3, C_FUR);
    p(c, 10, 42 + dy, 13, 1, C_FUR_D);
    // рукав к посоху
    p(c, 19, 22 + dy, 7, 12, C_COAT);
    p(c, 22, 32 + dy, 5, 4, C_FUR);
    // левая рука прижата
    p(c, 11, 23 + dy, 4, 12, C_COAT_D);

    // голова в профиль
    p(c, 13, 4 + dy, 13, 12, C_HOOD);
    p(c, 14, 3 + dy, 11, 2, C_HOOD_D);
    p(c, 16, 7 + dy, 8, 8, C_SKIN);
    // профиль: нос, глаз, седой хохолок
    p(c, 23, 10 + dy, 2, 2, C_SKIN_D);
    p(c, 20, 10 + dy, 2, 2, C_EYE);
    p(c, 15, 5 + dy, 4, 3, C_BEARD_D);
    // борода вперёд и вниз
    p(c, 18, 14 + dy, 10, 12, C_BEARD);
    p(c, 20, 14 + dy, 8, 3, '#c6c2ba');
    p(c, 18, 24 + dy, 10, 2, C_BEARD_D);
    // усы свисают
    p(c, 21, 13 + dy, 6, 2, C_BEARD_D);
  }

  /** Раненый Аким (кадр 3): сидит, сгорбился, бок перетянут тряпицей. */
  function hermitWounded(c) {
    // посох валяется рядом — лежит на земле
    p(c, 2, 48, 30, 2, C_STAFF);
    p(c, 2, 48, 30, 1, C_STAFF_D);

    // сидит: ноги вытянуты
    p(c, 10, 42, 18, 7, C_BOOT);
    p(c, 10, 44, 18, 2, '#2c2118');
    // тулуп сгорблен
    p(c, 8, 18, 22, 26, C_COAT);
    p(c, 8, 18, 22, 3, '#7a6a54');
    p(c, 8, 41, 22, 3, C_FUR);
    // перевязь на боку — грязная тряпица
    p(c, 8, 26, 22, 4, '#9a8878');
    p(c, 8, 27, 22, 1, '#7a3030');
    p(c, 12, 24, 3, 8, '#9a8878');
    p(c, 22, 24, 3, 8, '#9a8878');
    // рука прижимает бок
    p(c, 6, 24, 5, 12, C_COAT);
    p(c, 6, 34, 5, 4, C_FUR);
    // голова опущена, куколь сполз
    p(c, 12, 2, 14, 12, C_HOOD);
    p(c, 13, 1, 12, 2, C_HOOD_D);
    p(c, 15, 6, 9, 7, C_SKIN);
    // глаза полузакрыты
    p(c, 16, 9, 2, 1, C_EYE);
    p(c, 20, 9, 2, 1, C_EYE);
    // борода свисает на грудь
    p(c, 14, 12, 11, 14, C_BEARD);
    p(c, 15, 22, 9, 2, C_BEARD_D);
  }

  /** Общий отрисовщик старца: dir -> ракурс, запад — зеркало востока. */
  function hermitDraw(c, w, h, frame, dir) {
    var d4 = (dir === undefined) ? 4 : ((dir | 0) & 2);
    if (frame === 3) {
      hermitWounded(c);
      return;
    }
    var dy = (frame === 1) ? 1 : 0;
    if (d4 === 6) {
      c.save();
      c.translate(w, 0);
      c.scale(-1, 1);
      hermitSide(c, frame, dy);
      c.restore();
    } else if (d4 === 2) {
      hermitSide(c, frame, dy);
    } else if (d4 === 0) {
      hermitBack(c, frame, dy);
    } else {
      hermitFront(c, frame, dy);
    }
  }

  // ====================================================================
  //  СПРАЙТЫ: УБОР ИЗБУШКИ
  // ====================================================================

  /** Сушёные травы: пучки под потолком (контейнер лута). */
  function defHerbsSprite() {
    WS.Spr.def('hm_herbs', { w: 30, h: 34, draw: function (c) {
      // бечёвка под потолком
      p(c, 2, 1, 26, 1, '#6a5f4a');
      // пучки: зверобой, чабрец, чага на верёвке
      for (var i = 0; i < 4; i++) {
        var x = 3 + i * 7;
        p(c, x, 2, 5, 2, '#8a7a5a');          // обвязка
        p(c, x, 4, 5, 12, '#6a7458');          // сами травы
        p(c, x + 1, 4, 3, 12, '#7d8a66');
        p(c, x, 15, 5, 2, '#5a6248');
        p(c, x + 1, 8, 1, 6, '#4f5840');
      }
      // снежок на верхних
      p(c, 4, 1, 22, 1, 'rgba(226,232,240,0.5)');
    }});
  }

  /** Крест старой веры: восьмиконечный, у тропы. */
  function defCrossSprite() {
    WS.Spr.def('hm_cross', { w: 30, h: 52, draw: function (c) {
      // столб
      p(c, 12, 10, 5, 40, '#5c4730');
      p(c, 12, 10, 1, 40, '#4a3826');
      // верхняя малая перекладина (косая — старая вера)
      p(c, 6, 14, 18, 3, '#6a5238');
      // средняя прямая
      p(c, 3, 22, 23, 4, '#6a5238');
      p(c, 3, 22, 23, 1, '#7a6044');
      // нижняя малая
      p(c, 8, 30, 13, 3, '#6a5238');
      // навершие
      p(c, 13, 6, 3, 4, '#6a5238');
      p(c, 12, 5, 5, 2, '#7a6044');
      // снег на перекладинах
      p(c, 3, 21, 23, 1, 'rgba(226,232,240,0.7)');
      p(c, 8, 29, 13, 1, 'rgba(226,232,240,0.6)');
      p(c, 12, 9, 5, 1, 'rgba(226,232,240,0.6)');
    }});
  }

  /** Колода-сиденье у входа (несущественная, но живая деталь). */
  function defStumpSprite() {
    WS.Spr.def('hm_stump', { w: 34, h: 22, draw: function (c) {
      // срез
      WS.Spr.ell(c, 17, 8, 13, 5, '#8a6d50');
      WS.Spr.ell(c, 17, 8, 10, 3.5, '#9c7f60');
      // годовые кольца
      WS.Spr.ell(c, 17, 8, 6, 2, '#8a6d50');
      p(c, 16, 7, 2, 2, '#7a6044');
      // кора
      p(c, 4, 8, 26, 11, '#57422e');
      p(c, 4, 8, 3, 11, '#6a5238');
      p(c, 27, 8, 3, 11, '#4a3826');
      // снег сверху
      WS.Spr.ell(c, 10, 6, 6, 2, 'rgba(226,232,240,0.85)');
      WS.Spr.ell(c, 24, 6, 5, 2, 'rgba(226,232,240,0.8)');
    }});
  }

  /** Все спрайты модуля. */
  function defSprites() {
    WS.Spr.def('hermit', { w: 36, h: 54, draw: hermitDraw });
    defHerbsSprite();
    defCrossSprite();
    defStumpSprite();
  }

  // ====================================================================
  //  ПРЕДМЕТЫ И ЛУТ: травы с чердака избушки
  // ====================================================================

  function declareData() {
    WS.Data = WS.Data || {};
    WS.Data.items = WS.Data.items || {};
    WS.Data.loot = WS.Data.loot || {};

    // столик трав: целебные и чайные запасы старца
    if (!WS.Data.loot.hermit_herbs) {
      WS.Data.loot.hermit_herbs = {
        rolls: [2, 3],
        items: [
          { id: 'birch_chaga', w: 24, min: 1, max: 2 },
          { id: 'fir_needles', w: 22, min: 1, max: 3 },
          { id: 'dried_mushrooms', w: 14, min: 1, max: 3 },
          { id: 'tea_brick', w: 8, min: 1, max: 1 },
          { id: 'bandage_clean', w: 6, min: 1, max: 1 },
          { id: null, w: 12, min: 0, max: 0 }
        ]
      };
    }
  }

  // ====================================================================
  //  МЕСТО ПОД ИБУ: северный лес, подальше от посёлка
  // ====================================================================

  /** Природный ли тайл (можно ставить избу). */
  function natT(t) {
    var T = WS.World.T;
    return t === T.SNOW || t === T.GRASS || t === T.GRASS2 ||
           t === T.SNOW_DEEP || t === T.DIRT;
  }

  /** Есть ли деревья в радиусе r от точки (для «в лесу»). */
  function treeNear(x, y, r) {
    var w = WS.World;
    if (!w || !w.query) return false;
    var list = w.query(x - r, y - r, x + r, y + r);
    for (var i = 0; i < list.length; i++) {
      var o = list[i];
      if (o.hp) continue;
      var n = String(o.sprName || o.spr || '');
      if (n.indexOf('tree') >= 0 || n.indexOf('pine') >= 0 || n.indexOf('spruce') >= 0) return true;
    }
    return false;
  }

  /**
   * Поиск места: перебор с сеяным ГПСЧ (детерминизм от сида мира —
   * изба встаёт на то же место при каждой загрузке сейва).
   */
  function findSpot(R) {
    var w = WS.World;
    if (!w || !w.tiles) return null;
    var T = w.T;
    for (var t = 0; t < 600; t++) {
      var x = Math.floor(R.range(18, w.w - 18 - HUT_W));
      var y = Math.floor(R.range(HERMIT_Y0, HERMIT_Y1));
      // рамка с запасом: всё — природа
      var ok = true;
      for (var yy = y - 1; yy <= y + HUT_H + 1 && ok; yy++) {
        for (var xx = x - 1; xx <= x + HUT_W + 1 && ok; xx++) {
          if (!natT(w.tileAt(xx, yy))) { ok = false; break; }
          if (w.isTileBlocked(xx, yy)) { ok = false; break; }
        }
      }
      if (!ok) continue;
      if (w.isInside && w.isInside(x, y)) continue;
      // от посёлка — не ближе MIN_VILLAGE_D
      if (WS.M.dist(x, y, 110, 115) < MIN_VILLAGE_D) continue;
      // не на точке появления игрока
      if (w.spawnPoint && WS.M.dist(x, y, w.spawnPoint.x, w.spawnPoint.y) < 30) continue;
      // в лесу: деревья в округе
      if (!treeNear(x + HUT_W / 2, y + HUT_H / 2, 5)) continue;
      return { x: x, y: y };
    }
    // запасной тихий угол — север, середина карты
    return { x: 104, y: 20 };
  }

  // ====================================================================
  //  ПОСТРОЙКА ИЗБУШКИ
  // ====================================================================

  /** Убрать природные объекты (деревья, камни) с пятна застройки. */
  function clearRect(x0, y0, x1, y1) {
    var w = WS.World;
    if (!w || !w.objects) return;
    for (var i = w.objects.length - 1; i >= 0; i--) {
      var o = w.objects[i];
      if (!o || o.hp) continue;    // сущности не трогаем
      if (o.x >= x0 && o.x <= x1 && o.y >= y0 && o.y <= y1) {
        try { w.removeObject(o); } catch (e) { /* пусто */ }
      }
    }
  }

  /**
   * Сруб: стены WALL_LOG, пол FLOOR_WOOD, окно, дверь с объектом,
   * мебель (нары, печь, стол, травы) и двор (крест, колода, поленница).
   */
  function buildHut() {
    var w = WS.World;
    if (!w || !w.carve || !w.addObject) return null;
    var T = w.T;
    var seed = (G() && typeof G().seed === 'number') ? (G().seed >>> 0) : 7;
    var R = WS.RNG.mk(((seed ^ 0x4C1DE) >>> 0));

    // уже стоит? (повторная генерация мира)
    for (var i = 0; i < w.buildings.length; i++) {
      if (w.buildings[i] && w.buildings[i].type === 'hermit_hut') {
        st.hut = w.buildings[i];
        st.built = true;
        return st.hut;
      }
    }

    var spot = findSpot(R);
    var x = spot.x, y = spot.y;
    var W5 = HUT_W, H4 = HUT_H;

    // 0) расчистить пятно (деревья в сруб не идут)
    clearRect(x - 0.6, y - 0.6, x + W5 + 0.6, y + H4 + 3);

    // 1) коробка: пол внутри + брёвна по периметру
    w.carve(x, y, W5, H4, T.FLOOR_WOOD);
    for (var xx = x; xx < x + W5; xx++) {
      w.setTile(xx, y, T.WALL_LOG);
      w.setTile(xx, y + H4 - 1, T.WALL_LOG);
    }
    for (var yy = y; yy < y + H4; yy++) {
      w.setTile(x, yy, T.WALL_LOG);
      w.setTile(x + W5 - 1, yy, T.WALL_LOG);
    }

    // 2) дверь — южная стена, середина; окно — восточная
    var doorX = x + 2, doorY = y + H4 - 1;
    w.setTile(doorX, doorY, T.DOORWAY);
    w.setTile(x + W5 - 1, y + 1, T.WINDOW);

    // 3) мета-здание: изба считается домом (зверь внутрь не сунется)
    var b = {
      id: 'hermit_hut_1',
      type: 'hermit_hut',
      x: x, y: y, w: W5, h: H4,
      name: 'Избушка отшельника',
      material: 'log',
      rooms: [{ x: x + 1, y: y + 1, w: W5 - 2, h: H4 - 2, role: 'kitchen' }],
      door: [{ x: doorX, y: doorY }],
      windows: [{ x: x + W5 - 1, y: y + 1 }]
    };
    w.buildings.push(b);

    // 4) дверь-объект (закрыта, но не заперта: старец гостей не чает)
    w.addObject({
      x: doorX + 0.5, y: doorY + 0.5,
      sprName: 'door_obj',
      solid: true,
      name: 'Дверь избушки',
      door: { open: false, locked: false }
    });

    // 5) мебель: нары у западной стены, печь у восточной, стол, травы
    w.addObject({
      x: x + 1.5, y: y + 1.5,
      sprName: 'bed_wood',
      solid: true,
      name: 'Нары старца'
    });
    w.addObject({
      x: x + 3.5, y: y + 1.5,
      sprName: 'pech',
      solid: true,
      name: 'Печурка',
      heat: true,
      container: 'kitchen_pech'
    });
    w.addObject({
      x: x + 1.5, y: y + 2.5,
      sprName: 'table_wood',
      solid: true,
      name: 'Стол'
    });
    // свеча на столе: тёплый огонёк ночи
    w.addObject({
      x: x + 1.5, y: y + 2.2,
      sprName: 'candle_table',
      solid: false,
      name: 'Свеча',
      light: 26,
      z: 14
    });
    // травы под потолком — можно обобрать (старец не в обиде... почти)
    w.addObject({
      x: x + 3.5, y: y + 2.3,
      sprName: 'hm_herbs',
      solid: false,
      name: 'Сушёные травы',
      container: 'hermit_herbs',
      z: 16
    });

    // 6) двор: крест старой веры, колода, поленница, тропа
    w.addObject({
      x: x + 0.5, y: y + H4 + 1.5,
      sprName: 'hm_cross',
      solid: true,
      name: 'Крест старой веры',
      z: 4
    });
    w.addObject({
      x: x + 3.5, y: y + H4 + 1.5,
      sprName: 'hm_stump',
      solid: true,
      name: 'Колода'
    });
    w.addObject({
      x: x + W5 + 1.2, y: y + 1.5,
      sprName: 'wood_pile',
      solid: true,
      name: 'Поленница'
    });
    // утоптанная тропа от двери на юг
    if (natT(w.tileAt(doorX, doorY + 1))) w.setTile(doorX, doorY + 1, T.DIRT);
    if (natT(w.tileAt(doorX, doorY + 2))) w.setTile(doorX, doorY + 2, T.DIRT);

    st.hut = { x: x, y: y, w: W5, h: H4, door: { x: doorX, y: doorY } };
    st.door = { x: doorX, y: doorY };
    st.built = true;
    WS.log('[Hermit] избушка поставлена: (' + x + ',' + y + ')');
    return st.hut;
  }

  /** Центр двора (для блуждания и отпугивания зверя). */
  function yardCenter() {
    if (!st.hut) return { x: 110, y: 24 };
    return { x: st.hut.x + st.hut.w / 2, y: st.hut.y + st.hut.h + 1 };
  }

  // ====================================================================
  //  САМ АКИМ: сущность
  // ====================================================================

  /** Жив ли старец в этом мире. */
  function alive() {
    return !!(st.akim && !st.akim.dead);
  }

  /** Создать сущность (после постройки избы; повторно — не создаём). */
  function mkAkim() {
    var w = WS.World;
    if (!w || !w.addEnt || alive()) return st.akim;
    var yard = yardCenter();
    var e = w.addEnt({
      kind: 'hermit',
      id: 'hermit_akim',
      x: yard.x + 1, y: yard.y + 0.2,
      dir: 4,
      hp: 50, maxHp: 50,
      speed: 0.9,
      sprName: 'hermit',
      sprFrame: 2,
      animFrames: 2,
      restFrame: 2,
      shadowR: 0.4,
      state: 'idle', stateT: 0,
      atkCd: 0, lungeT: 0,
      sight: 9,
      brain: { hears: true, noInside: false },
      home: { x: yard.x, y: yard.y },
      hermit: true
    });
    st.akim = e;
    // если партия грузилась со «раненым» событием — применить вид
    applyWoundedLook();
    return e;
  }

  /** Раненый вид: кадр 3, хромота. */
  function applyWoundedLook() {
    var e = st.akim;
    if (!e) return;
    if (fg('hermit_wounded')) {
      e.restFrame = 3;
      e.sprFrame = 3;
      e.hp = Math.min(e.hp, 20);
      e.speed = 0.3;
    } else {
      e.restFrame = 2;
      e.sprFrame = 2;
      e.speed = 0.9;
    }
  }

  // ====================================================================
  //  ПОВЕДЕНИЕ: ИИ старца
  // ====================================================================

  /** Напугать зверя у двора: волк получает бегство, бандит — к лагерю. */
  function scareAway(e) {
    var yard = yardCenter();
    if (e.kind === 'wolf') {
      // волк: поле state='flee' с точкой бегства — движок wolf.js поймёт
      e.state = 'flee';
      e.stateT = 0;
      e.fleeT = 8 + Math.random() * 4;
      e.fleeFrom = { x: yard.x, y: yard.y };
      e.panicTo = null;
      if (Math.random() < 0.3) snd('growl', e.x, e.y, 0.4);
      return true;
    }
    if (e.kind === 'bandit') {
      // бандит: прочь со двора (к своему лагерю — далеко на юг)
      e.state = 'flee';
      e.stateT = 0;
      if (e.group) { e.group.alertT = 0; e.group.angryT = 0; }
      if (Math.random() < 0.25) snd('bandit_shout', e.x, e.y, 0.5);
      return true;
    }
    return false;
  }

  /** Обход двора: раз в ~0.8 с смотрим, не забрёл ли зверь. */
  function scareTick(dt) {
    st.scareT -= dt;
    if (st.scareT > 0) return;
    st.scareT = 0.8;
    var w = WS.World;
    if (!w || !w.entsNear) return;
    var yard = yardCenter();
    var list = w.entsNear(yard.x, yard.y, SCARE_R);
    var scared = 0;
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (!e || e.dead || e === st.akim) continue;
      if (e.kind === 'wolf' || e.kind === 'bandit') {
        if (scareAway(e)) scared++;
      }
    }
    // стая взяла след на двор — старец постучит посохом
    if (scared > 0 && alive() && Math.random() < 0.25) {
      snd('hit', st.akim.x, st.akim.y, 0.35);
    }
  }

  /** Главный апдейт поведения (регистрируется в WS.AI). */
  function updateHermit(e, dt, R) {
    var w = WS.World;
    var p = P();
    e.moving = false;

    // --- охрана двора ---
    try { scareTick(dt); } catch (err) { WS.err('hermit scare', err); }

    // --- ранен: добрёл до нар и сидит ---
    if (fg('hermit_wounded')) {
      if (st.hut) {
        var bed = { x: st.hut.x + 1.5, y: st.hut.y + 1.7 };
        if (WS.M.dist(e.x, e.y, bed.x, bed.y) > 1) {
          WS.AI.moveTowards(e, bed.x, bed.y, 0.3, dt);
          WS.AI.anim(e, dt, 3);
        } else {
          e.moving = false;
          e.sprFrame = 3;
          if (p && AIseesCheck(e, p)) WS.AI.setDir(e, p.x - e.x, p.y - e.y);
        }
      } else {
        e.moving = false;
        e.sprFrame = 3;
      }
      return;
    }

    // --- оклик один раз за партию ---
    if (!st.greeted && p && playerDist(e.x, e.y) < 8) {
      st.greeted = true;
      fs('hm_greeted', 1);
      toast('У лесной избушки вас окликают: — Эй, служивый! Не бойся, подойди.', 'info');
      snd('hit', e.x, e.y, 0.3);
    }

    // --- игрок рядом: подойти и повернуться ---
    if (p && p.hp > 0) {
      var d = WS.M.dist(e.x, e.y, p.x, p.y);
      if (d < APPROACH_R && d > 1.35) {
        WS.AI.moveTowards(e, p.x, p.y, e.speed, dt);
        WS.AI.anim(e, dt, 4);
        e.state = 'greet';
        return;
      }
      if (d < 6) {
        WS.AI.setDir(e, p.x - e.x, p.y - e.y);
        e.state = 'greet';
      }
    }

    // --- вечный обход двора ---
    var yard = e.home || yardCenter();
    WS.AI.wanderInArea(e, yard.x, yard.y, 3, dt, e.speed * 0.7);
    e.state = 'idle';
    WS.AI.anim(e, dt, 4);
  }

  /** Виден ли игрок старику (день/ночь — без фанатизма). */
  function AIseesCheck(e, p) {
    try {
      return WS.AI.canSee(e, p, 8);
    } catch (err) { return true; }
  }

  // ====================================================================
  //  ВЗАИМОДЕЙСТВИЕ: [E] — разговор
  // ====================================================================

  /** Чужой интерактив рядом не занят? (как в story.js) */
  function noOtherInteract() {
    if (WS.Action && WS.Action.interactTarget) {
      try {
        var t = WS.Action.interactTarget();
        if (t) return false;
      } catch (e) { /* пусто */ }
    }
    return true;
  }

  function hitInteract() {
    if (!WS.Input || !WS.Input.hit) return false;
    try { return WS.Input.hit('interact'); } catch (e) { return false; }
  }

  /** NPC-объект для движка диалогов. */
  function akimNpc() {
    return {
      name: 'Старец Аким',
      sprName: 'hermit',
      sprFrame: 2,
      portraitFrames: [2, 0],
      repId: 'hermit',
      cap: 'схимник · двадцать лет в лесу',
      optsHint: true,
      tree: buildTree
    };
  }

  /** Тик взаимодействия (приоритет 62 — рядом с notes/story). */
  function interactTick(dt) {
    var g = G();
    if (!g || !g.running || g.dead) return;
    if (!alive()) return;
    if (WS.Ui && WS.Ui.modal && WS.Ui.modal()) return;
    var p = P();
    if (!p || p.sleeping) return;
    var e = st.akim;
    if (playerDist(e.x, e.y) > TALK_R) return;
    if (!noOtherInteract()) return;

    if (WS.Ui && WS.Ui.hint) {
      try {
        WS.Ui.hint(fg('hermit_wounded')
          ? 'Перевязать старца'
          : 'Поговорить со старцем');
      } catch (err) { /* пусто */ }
    }
    if (hitInteract()) {
      // разговор (дерево само решит — ранен или здрав)
      try {
        WS.Dialog.start(akimNpc());
      } catch (err2) {
        WS.err('hermit: диалог не открылся:', err2 && err2.message);
      }
    }
  }

  // ====================================================================
  //  СЛОВАРЬ ТЕКСТОВ: реплики старца (окающий северный говор)
  // ====================================================================

  var TX = {
    greetFirst:
      'Ну вот и гость. Двадцать годков никто не хаживал — а тут ты.\n' +
      'Садись на колоду, только снег отряхни. Я — Аким. Меня так звать,\n' +
      'покуда помню. А тебя никак не звать — и это хорошо: безымянному\n' +
      'в лесу рады больше, чем казённому чину.',
    greetKnown:
      'Здравствуй, служивый. Печь ещё не остыла, чага — горячая.\n' +
      'Худо в миру? Садись, сказывай. У старика и времени много, и слов — целая изба.',
    greetCold:
      'Опять ты. Ну, садись, покуда снег не завалил тропу.\n' +
      'Молчать тоже можно. Я и с молчанием умею говорить.',
    who1:
      'Кто я? Схимник я, мирской человек отлучённый.\n' +
      'Двадцать лет тому ушёл из Пристань-Тихой: как поп Никодим новые\n' +
      'книги по благословению владыки принял, а я старые — да сжёг мосты.\n' +
      'Не ересь то, служивый, а вера дедова. Только дедовой верой село\n' +
      'кормиться не хотело, и меня проводили с песнями. А я и не в обиде.',
    who2:
      'Живу тут — печка, нары, псалтырь да ворон соседний.\n' +
      'Волков не считаю: они меня считают, я их — нет, несправедливо\n' +
      'выходит. На шкурах и живу: меняемся с заезжим человеком, он\n' +
      'привозил мне крупу да порох. Да вот уже который месяц не видать его.',
    who3:
      'А чего мне сделается? Семидесяти годков не дожил — всего шестьдесят восемь.\n' +
      'Старость — не хворь, старость — тишина. Худо, когда тишина наружу\n' +
      'выходит: тогда она зовётся смертью, и её слышно за версту.',
    winterPre: 'Слушай, что старость помнит. Даром не скажу, а за так — вот:',
    wolvesPre: 'Про волка спрашиваешь? Волк — честный зверь, беда — в погоде.',
    wolvesEmpty:
      'Стая нынче далеко, к северу держит. Тебе туда не надо — и не спрашивай.',
    wolvesAlphaNote:
      'А про вожака ихнего наслышан: зверь — что твой унтер-офицер.\n' +
      'Огня не чтит, с подветренной заходит. Такого не пугнёшь — только',
    wolvesAlphaNote2: 'положишь. И то — с третьего выстрела.',
    bearPre:
      'Медведь? Про того скажу, что охотой знаю, а сказки оставь.\n' +
      'Логово — под выворотнем, на сухом взгорье, входом на подветренную\n' +
      'сторону: чтобы самого не учуяли. Осьминашкин выворотень за Шатровой\n' +
      'гривой — три года как знаю. Не ходи туда до снегу, и он к тебе не выйдет.',
    bearShatun:
      'А только нынче, чую, шатун пошёл: зверь больной, зимовать не лёг.\n' +
      'Такого огонь не держит и колокол не берёт. Не беги — догонит,\n' +
      'кричи, железом стучи, огонь в морду суй. И к реке отходи: по льду\n' +
      'он скользит, как поп на масленице.',
    ship1:
      '«Святитель Николай» — пароход честный, товаро-пассажирский.\n' +
      'Ходит раз в месяц: Архангельск — Пристань-Тихая — Мезень.\n' +
      'Капитан Ковалёв, команды двенадцать душ, уголь экономят,\n' +
      ' зато гудок дают от души.',
    ship2:
      'Последний раз перед новым годом пройдёт — тридцатого декабря.\n' +
      'Да только он, служивый, мимо идёт, ежели его не позвать:\n' +
      'стоянка у мостков — сорок минут, и только ежели сигнал видать.\n' +
      'Мостки-пристань у реки. Разведёшь сигнальный костёр — три факела\n' +
      'в него кинь — придёт. Не разведёшь — уходить тебе в лес насовсем.',
    shelterNo:
      'Оставаться? Изба маленькая, да печь не казённая — пустой не стоит.\n' +
      'Принеси дров да принеси доверья: поглядим.',
    shelterYes:
      'Оставайся. Нары тесные, два человека — уже приход.\n' +
      'Печь истоплю, ты сиди, не суетись: в избе суета — что в полыньи прыжки.',
    woundedLine:
      'Ох, служивый... Ночью волки двор обложили. Отбился посохом,\n' +
      'да бок разодрали. Перевязи нет, силы — на три псалма.\n' +
      'Не пройдёт ли хворь сама — не знаю. Помирать старику не страшно,\n' +
      'страшно — неуправленным лечь.',
    woundedAfter:
      'Ну вот и ладно. Тянет, чешется — значит, живое.\n' +
      'Твоя доброта, служивый, мне в зачёт не пойдёт — а тебе пойдёт.',
    giftBow:
      'Держи. Сам делал, боярскому не сродни, а волка за сто шагов берёт.\n' +
      'Тетиву от мороза береги: в стужу под тулуп клади, как дитя.',
    giftBook:
      'Возьми книгу. По ней я два десятка лет живу, и она ещё ни разу\n' +
      'не соврала. Читай помаленьку: буквы старые, но верные.',
    giftAlready:
      'Всё, что было лишнего, отдал. Осталось — то, с чем в землю лягу.',
    tradeIntro:
      'Меняться? Это можно. Шкура — она у тебя, крупа да порох — у меня.\n' +
      'Только в день по три раза не меняюсь: жадность, она как ржавчина.',
    tradeDone:
      'Вот и славно. Приходи ещё — тайга без обмена, что изба без трубы.',
    tradeEmpty:
      'С пустыми руками меняешь? Так и я с пустыми отвечу.\n' +
      'Шкуры неси, служивый: волчья, медвежья — всякая в дело.',
    tradeLimit:
      'Всё на сегодня, служивый. Приходи поутри — и совесть, и запас\n' +
      'подновятся.',
    vodkaThanks:
      'Ну, за помин живых. — Старец делает глоток, крякает и долго\n' +
      'смотрит в огонь. — Добрая. С такой и на том свете не скучно.',
    tobaccoThanks:
      'Табачок? Это хорошо. Дым — единственная моя беседа,\n' +
      'которая не спорит.',
    childSaved:
      'Слыхал я: мальчонку в деревне отходили. Это ты его отходил?\n' +
      'Хорошо. Зимой дитя — что свеча на ветру: погасить всякий дурак\n' +
      'может, уберечь — не всякий. Спасибо тебе, и от меня тоже.'
  };

  // ====================================================================
  //  ДЕРЕВО РАЗГОВОРА
  // ====================================================================

  /** Случайный совет из энциклопедии (WS.Lore) — категории выживания. */
  function randomLoreText() {
    var cats = ['cold', 'stove', 'wolfs', 'hunt', 'life', 'weather'];
    var pool = [];
    if (WS.Lore && WS.Lore.byCat) {
      for (var i = 0; i < cats.length; i++) {
        var arr = WS.Lore.byCat(cats[i]) || [];
        for (var k = 0; k < arr.length; k++) pool.push(arr[k]);
      }
    }
    if (!pool.length) {
      return TX.winterPre + '\n\nЕшь жир, а не хлеб: жир горит внутри долго и ровно.\n' +
        'Валенки с портянками держат тепло день. Ветер холоднее мороза.';
    }
    var e = pool[Math.floor(Math.random() * pool.length)];
    return TX.winterPre + '\n\n«' + e.title + '»\n\n' + e.text;
  }

  /** Сторона света от посёлка к точке (коротким словом). */
  function dirWord(x, y) {
    var dx = x - 110, dy = y - 115;
    var s = '';
    if (dy < -8) s = 'север'; else if (dy > 8) s = 'юг';
    if (dx < -8) s += (s ? 'о-' : '') + 'запад';
    else if (dx > 8) s += (s ? 'о-' : '') + 'восток';
    return s || 'сам посёлок';
  }

  /** Живая сводка по стаям (WS.Wolf). */
  function wolvesText() {
    var lines = [TX.wolvesPre];
    var packs = (WS.Wolf && WS.Wolf.packs) ? WS.Wolf.packs() : [];
    var alivePacks = [];
    for (var i = 0; i < packs.length; i++) {
      var pk = packs[i];
      var alive = 0;
      for (var m = 0; m < pk.members.length; m++) {
        if (!pk.members[m].dead) alive++;
      }
      if (alive > 0) alivePacks.push({ pk: pk, n: alive });
    }
    if (!alivePacks.length) {
      lines.push(TX.wolvesEmpty);
      return lines.join('\n\n');
    }
    lines.push('Стай в лесу — ' + alivePacks.length + ', и каждой есть чем дышать:');
    for (var j = 0; j < alivePacks.length && j < 4; j++) {
      var a = alivePacks[j];
      var t = a.pk.territory;
      lines.push('• ' + a.n + ' ' + pluralWolves(a.n) + ' — ' + dirWord(t.x, t.y) +
        ', от Посадской дороги — ' + Math.round(WS.M.dist(t.x, t.y, 110, 115)) + ' вёрст.');
    }
    if (fg('q_alpha_alive')) {
      lines.push(TX.wolvesAlphaNote + '\n' + TX.wolvesAlphaNote2);
    }
    lines.push('Ночуй с огнём — и спи. Ночуй без огня — не спи вовсе.');
    return lines.join('\n');
  }

  function pluralWolves(n) {
    if (n % 10 === 1 && n % 100 !== 11) return 'волк';
    if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return 'волка';
    return 'волков';
  }

  /** Сколько обменов сделано сегодня. */
  function tradesToday() {
    var d = fg('hm_trades_day');
    if (typeof d !== 'number' || d !== day()) return 0;
    return fg('hm_trades_n') || 0;
  }

  function bumpTrade() {
    var n = (fg('hm_trades_day') === day()) ? (fg('hm_trades_n') || 0) : 0;
    fs('hm_trades_day', day());
    fs('hm_trades_n', n + 1);
  }

  function tradeLeft() {
    return tradesToday() < TRADES_PER_DAY;
  }

  /** Динамическое описание торгового узла. */
  function tradeText() {
    var t = TX.tradeIntro;
    if (!tradeLeft()) t = TX.tradeLimit;
    else if (invCount('wolf_pelt') + invCount('bear_pelt') + invCount('hare_pelt') === 0 &&
             invCount('bread') + invCount('kasha') === 0) {
      t = TX.tradeEmpty;
    }
    return t + '\n\n(шкурок при тебе: волчьих — ' + invCount('wolf_pelt') +
      ', медвежьих — ' + invCount('bear_pelt') + ')';
  }

  /** Общее действие обмена: списать, выдать, доверие +1, узел «спасибо». */
  function doTrade(take, give, nextId) {
    return function () {
      var i;
      for (i = 0; i < take.length; i++) {
        if (invConsume(take[i].id, take[i].n) < take[i].n) {
          toast('Не хватает: ' + itemName(take[i].id), 'warn');
          // предмет «уехал» между показом кнопки и нажатием — сидим в мене
          return 'trade';
        }
      }
      for (i = 0; i < give.length; i++) invGive(give[i].id, give[i].n);
      bumpTrade();
      if (WS.Dialog && WS.Dialog.repAdd) WS.Dialog.repAdd('hermit', 1);
      snd('pickup', undefined, undefined, 0.6);
      return 'trade_done';
    };
  }

  /**
   * Полное дерево разговора. Собирается заново при каждом «здравствуй»:
   * живые темы — про волков, погоду, ребёнка и доверие.
   */
  function buildTree() {
    // ---- раненый старец: отдельное короткое дерево ----
    if (fg('hermit_wounded')) {
      return {
        start: 'wound',
        nodes: {
          wound: {
            text: TX.woundedLine,
            options: [
              { txt: function () {
                  return (invCount('bandage_clean') > 0 || invCount('bandage') > 0)
                    ? 'Перевязать раны (бинт)' : 'Перевязать раны (нужен бинт)';
                },
                cond: function () {
                  return invCount('bandage_clean') > 0 || invCount('bandage') > 0;
                },
                note: 'нет бинта',
                action: function () {
                  var used = invCount('bandage_clean') > 0 ? 'bandage_clean' : 'bandage';
                  invConsume(used, 1);
                  fs('hermit_wounded', 0);
                  fs('hermit_wounded_healed', 1);
                  if (st.akim) {
                    st.akim.hp = 45;
                    st.akim.restFrame = 2;
                    st.akim.sprFrame = 2;
                    st.akim.speed = 0.9;
                  }
                  if (WS.Dialog && WS.Dialog.repAdd) WS.Dialog.repAdd('hermit', 5);
                  chron('Перевязал старца Акима после волчьей ночи.', 'find');
                  toast('Старец перевязан. Он уже посмеивается над волками.', 'good');
                  snd('craft', undefined, undefined, 0.5);
                  return 'wound_after';
                },
                next: 'wound_after'
              },
              { txt: '«Держись, старик. Я вернусь»', end: true },
              { txt: 'Ничем не могу помочь', end: true }
            ]
          },
          wound_after: {
            text: TX.woundedAfter,
            options: [
              { txt: '«Ты отдохни. Я зайду ещё»', end: true }
            ]
          }
        }
      };
    }

    // ---- здравый старец ----
    var greeting = 'greet_first';
    if (rep() >= REP_SHELTER) greeting = 'greet_known';
    else if (WS.Dialog && WS.Dialog.seenId('hermit', 'greet_first')) greeting = 'greet_cold';

    var nodes = {

      // ---- приветствие ----
      greet_first: { text: TX.greetFirst },
      greet_known: { text: TX.greetKnown },
      greet_cold: { text: TX.greetCold },

      // ---- кто ты ----
      who1: {
        text: TX.who1,
        options: [
          { txt: '«И давно ты здесь один?»', next: 'who2' },
          { txt: '«Не страшно — двадцать лет в лесу?»', next: 'who3' },
          { txt: '«Ладно, старик»', next: 'main' }
        ]
      },
      who2: { text: TX.who2, options: [{ txt: '«Понял»', next: 'main' }] },
      who3: { text: TX.who3, options: [{ txt: '«Ладно, старик»', next: 'main' }] },

      // ---- советы на зиму ----
      winter: {
        text: function () { return randomLoreText(); },
        options: [
          { txt: '«Ещё спросить есть»', next: 'winter2' },
          { txt: '«Спасибо, старик»', next: 'main' }
        ]
      },
      winter2: {
        text: function () { return randomLoreText(); },
        options: [
          { txt: '«И ещё одно»', next: 'winter' },
          { txt: '«Хватит на сегодня»', next: 'main' }
        ]
      },

      // ---- торговля ----
      trade: {
        text: tradeText,
        options: [
          { txt: function () {
              return 'Две волчьи шкуры — на еду (' + invCount('wolf_pelt') + ' при тебе)';
            },
            cond: function () {
              return tradeLeft() && invCount('wolf_pelt') >= 2;
            },
            action: doTrade(
              [{ id: 'wolf_pelt', n: 2 }],
              [{ id: 'kasha', n: 2 }, { id: 'rusk', n: 4 }]
            ),
            next: 'trade_done'
          },
          { txt: function () {
              return 'Две волчьи шкуры — на лекарства (' + invCount('wolf_pelt') + ' при тебе)';
            },
            cond: function () {
              return tradeLeft() && invCount('wolf_pelt') >= 2;
            },
            action: doTrade(
              [{ id: 'wolf_pelt', n: 2 }],
              [{ id: 'bandage_clean', n: 2 }, { id: 'quinine', n: 1 }]
            ),
            next: 'trade_done'
          },
          { txt: function () {
              return 'Три волчьи шкуры — на патроны (' + invCount('wolf_pelt') + ' при тебе)';
            },
            cond: function () {
              return tradeLeft() && invCount('wolf_pelt') >= 3;
            },
            action: doTrade(
              [{ id: 'wolf_pelt', n: 3 }],
              [{ id: 'rifle_round', n: 8 }]
            ),
            next: 'trade_done'
          },
          { txt: function () {
              return 'Медвежья шкура — на всё сразу (' + invCount('bear_pelt') + ' при тебе)';
            },
            cond: function () {
              return tradeLeft() && invCount('bear_pelt') >= 1;
            },
            action: doTrade(
              [{ id: 'bear_pelt', n: 1 }],
              [
                { id: 'kasha', n: 2 }, { id: 'vodka', n: 1 },
                { id: 'bandage_clean', n: 2 }, { id: 'rifle_round', n: 6 }
              ]
            ),
            next: 'trade_done'
          },
          { txt: function () {
              return 'Хлеб за травы: чага да хвоя (' +
                (invCount('bread') + invCount('kasha')) + ' еды при тебе)';
            },
            cond: function () {
              return tradeLeft() && (invCount('bread') > 0 || invCount('kasha') > 0);
            },
            action: function () {
              var food = invCount('bread') > 0 ? 'bread' : 'kasha';
              return doTrade(
                [{ id: food, n: 1 }],
                [{ id: 'birch_chaga', n: 2 }, { id: 'fir_needles', n: 3 }]
              )();
            },
            next: 'trade_done'
          },
          { txt: '«После поговорим»', next: 'main' }
        ]
      },
      trade_done: {
        text: function () { return tradeLeft() ? TX.tradeDone : TX.tradeLimit; },
        options: [
          { txt: '«Ещё обмен»', next: 'trade' },
          { txt: '«Ещё дело есть»', next: 'main' }
        ]
      },

      // ---- про волков ----
      wolves: {
        text: wolvesText,
        options: [
          { txt: '«Как отбиться от стаи?»', next: 'wolves_def' },
          { txt: '«Понял»', next: 'main' }
        ]
      },
      wolves_def: {
        text:
          'Первое — спина к стене. Волк берёт сзади, за жилу под коленом.\n' +
          'Второе — не беги: бегущего чует жертвой. Иди на него, кричи,\n' +
          'железом стучи. Третье — бей первого смелого: молодые после\n' +
          'крови дух теряют. И огонь держи: гори — не тлел.',
        options: [{ txt: '«Учту»', next: 'main' }]
      },

      // ---- про медведя ----
      bear: {
        text: function () {
          return TX.bearPre + '\n\n' + (fg('r_bear_day') && day() >= (fg('r_bear_day') || 26) && !fg('shatun_done')
            ? TX.bearShatun : 'А пока — тихо. Слыхать его не слыхать, и то хорошо.');
        },
        options: [
          { txt: '«Где его искать?»', next: 'bear_where' },
          { txt: '«Ладно»', next: 'main' }
        ]
      },
      bear_where: {
        text:
          'Шатрова грива — к северу от старой гати, где река крутит.\n' +
          'Выворотень — за гривой, приметный: корневище что чёрная борода.\n' +
          'Только чаю не ходи: кто к логову без нужды ходит, тот из него\n' +
          'обычно не выходит.',
        options: [{ txt: '«Понял»', next: 'main' }]
      },

      // ---- про пароход ----
      ship1: {
        text: TX.ship1,
        options: [
          { txt: '«А когда он пройдёт?»', next: 'ship2' },
          { txt: '«Ладно»', next: 'main' }
        ]
      },
      ship2: {
        text: TX.ship2,
        options: [
          { txt: '«Мне бы уплыть отсюда»', next: 'main' },
          { txt: '«Просто спрашивал»', next: 'main' }
        ]
      },

      // ---- приют ----
      shelter: {
        text: TX.shelterYes,
        options: [
          { txt: '«Погреться у печи» (до утра)', action: warmShelter, next: 'main' },
          { txt: '«Спать лягу, старик»', action: warmShelter, next: 'main' },
          { txt: '«Позже»', next: 'main' }
        ]
      },

      // ---- дары старца (rep 5+) ----
      gift_offer: {
        text:
          'Служивый. Ты мне — не гость уже, а свой. Хозяйство у меня\n' +
          'нехитрое, а лишнее — есть. Выбирай, что к рукам лучше липнет.',
        options: [
          { txt: 'Взять лук со стрелами', once: true, key: 'gift_bow',
            action: function () {
              invGive('bow_hunting', 1);
              invGive('arrow', 6);
              fs('hermit_gift_done', 1);
              toast('Получено: охотничий лук, 6 стрел.', 'good');
              return 'gift_bow';
            },
            next: 'gift_bow'
          },
          { txt: 'Взять книгу о лесе', once: true, key: 'gift_book',
            action: function () {
              invGive('book_survive', 1);
              fs('hermit_gift_done', 1);
              toast('Получено: потрёпанная книга «О северном лесе».', 'good');
              return 'gift_book';
            },
            next: 'gift_book'
          },
          { txt: '«Оставь себе, старик»', next: 'main' }
        ]
      },
      gift_bow: { text: TX.giftBow, options: [{ txt: '«Благодарю»', next: 'main' }] },
      gift_book: { text: TX.giftBook, options: [{ txt: '«Благодарю»', next: 'main' }] }
    };

    // ---- главный узел: все темы ----
    nodes.main = {
      text: function () {
        var r = rep();
        if (r >= REP_GIFT) {
          return 'Ну, что ещё? Спрашивай, служивый, или молчи — я и так тебя слышу.';
        }
        if (r >= REP_SHELTER) {
          return 'Слушаю, служивый. Печь топлена, вода — из проруби, время — наше.';
        }
        return 'Ну?';
      },
      options: [
        { txt: '«Кто ты, старик?»', next: 'who1' },
        { txt: '«Как пережить зиму?»', next: 'winter' },
        { txt: '«Меняться бы»', next: 'trade' },
        { txt: '«Что волки?»', next: 'wolves' },
        { txt: '«Про медведя спросить»', next: 'bear' },
        { txt: '«Про пароход»', next: 'ship1' },
        { txt: '«Остаться до утра можно?»',
          next: 'shelter',
          cond: function () { return rep() >= REP_SHELTER; },
          note: 'нужно доверие 3'
        },
        { txt: 'Угостить водкой',
          cond: function () { return invCount('vodka') > 0; },
          note: 'нет водки',
          action: function () {
            invConsume('vodka', 1);
            if (WS.Dialog && WS.Dialog.repAdd) WS.Dialog.repAdd('hermit', 2, 'Угостил старца.');
            snd('drink', undefined, undefined, 0.5);
            return 'vodka_thanks';
          },
          next: 'vodka_thanks'
        },
        { txt: 'Поднести табаку',
          cond: function () { return invCount('tobacco_pouch') > 0; },
          note: 'нет табаку',
          action: function () {
            invConsume('tobacco_pouch', 1);
            if (WS.Dialog && WS.Dialog.repAdd) WS.Dialog.repAdd('hermit', 1, 'Табак для старца.');
            snd('pickup', undefined, undefined, 0.5);
            return 'tobacco_thanks';
          },
          next: 'tobacco_thanks'
        },
        { txt: '«Дар у тебя есть ко мне, старик?»',
          cond: function () {
            return rep() >= REP_GIFT && !fg('hermit_gift_done');
          },
          note: rep() < REP_GIFT ? ('нужно доверие ' + REP_GIFT) : 'уже одарил',
          next: 'gift_offer'
        },
        // живая тема: ребёнок спасён — старец благодарит
        { txt: '«Ты слышал — мальчика в деревне спасли»',
          cond: function () { return !!fg('child_saved') && !fg('hm_child_told'); },
          action: function () {
            fs('hm_child_told', 1);
            return 'child_saved';
          },
          next: 'child_saved'
        },
        { txt: '«Пора мне»', end: true, primary: true }
      ]
    };

    // ---- поблагодарности ----
    nodes.vodka_thanks = { text: TX.vodkaThanks, options: [{ txt: '«Ещё дело есть»', next: 'main' }] };
    nodes.tobacco_thanks = { text: TX.tobaccoThanks, options: [{ txt: '«Ещё дело есть»', next: 'main' }] };
    nodes.child_saved = {
      text: TX.childSaved,
      options: [{ txt: '«Спасибо на добром слове»', next: 'main' }]
    };

    return {
      start: greeting,
      nodes: nodes
    };
  }

  /** Приют: тепло печи + приглашение спать на нарах. */
  function warmShelter() {
    var p = P();
    if (!p) return 'main';
    p.needs.warmth = clamp((p.needs.warmth || 50) + 45, 0, 100);
    if (p.temp && WS.M) p.temp = clamp(p.temp + 0.8, 33, 37.5);
    fs('hermit_shelter_day', day());
    chron('Ночевал у старца Акима: печь, чага и тишина.', '');
    toast('Старец подкинул дров в печь. Тепло растекается по телу.', 'good');
    snd('match', undefined, undefined, 0.5);
    if (!fg('hm_shelter_first')) {
      fs('hm_shelter_first', 1);
      if (WS.Dialog && WS.Dialog.repAdd) WS.Dialog.repAdd('hermit', 1);
    }
    return 'main';
  }

  // ====================================================================
  //  РЕДКОЕ СОБЫТИЕ: раненый Аким (день 20+)
  // ====================================================================

  /** Проверка дня: не приключилась ли беда со старцем. */
  function onDay(d0) {
    var g = G();
    if (!g || !g.running || g.dead) return;
    var d = (d0 && d0.day) ? d0.day : day();
    if (!alive()) return;

    // ещё не было — может случиться (шанс 35% в день, но не раньше WOUNCED_DAY)
    if (d >= WOUNCED_DAY && !fg('hermit_wounded_happened') && !fg('hermit_wounded')) {
      var seed = (typeof g.seed === 'number') ? (g.seed >>> 0) : 1;
      var R = WS.RNG.mk(((seed ^ (d * 7331)) >>> 0));
      if (R.chance(0.35)) {
        fs('hermit_wounded', 1);
        fs('hermit_wounded_day', d);
        fs('hermit_wounded_happened', 1);
        var e = st.akim;
        if (e) {
          e.hp = 18;
          e.restFrame = 3;
          e.sprFrame = 3;
          e.speed = 0.3;
        }
        snd('howl', undefined, undefined, 0.25);
        toast('Ворон встревоженно кружит над лесной избушкой. Со двора — стоны.', 'warn');
        chron('Со стороны лесной избушки — волчий след и стоны старца.', 'anom');
        return;
      }
    }

    // ранен давно и не вылечен — сам оклемался (слабо)
    if (fg('hermit_wounded') && d - (fg('hermit_wounded_day') || d) >= WOUND_SELF_DAYS) {
      fs('hermit_wounded', 0);
      if (st.akim) {
        st.akim.hp = 40;
        st.akim.restFrame = 2;
        st.akim.sprFrame = 2;
        st.akim.speed = 0.9;
      }
      toast('Старец, кряхтя, сам перевязался: «Обошлось, служивый».', 'info');
      chron('Старец оправился от волчьих ран сам.', '');
    }
  }

  // ====================================================================
  //  ГЕНЕРАЦИЯ И ПЕРЕПОДКЛЮЧЕНИЕ
  // ====================================================================

  /** Генерация мира: поставить избу и старца. */
  function onGenInteriors() {
    try {
      st.built = false;
      st.akim = null;
      st.hut = null;
      buildHut();
      mkAkim();
      if (WS.Gfx && WS.Gfx.dirty) WS.Gfx.dirty();
    } catch (e) {
      WS.err('hermit: gen:', e && e.message);
    }
  }

  /** Загрузка сейва: мир пересобран генератором, старец уже на месте —
   *  остаётся применить раненый вид по флагам. */
  function onGameLoad() {
    try {
      applyWoundedLook();
      st.greeted = !!(fg('hm_greeted'));
    } catch (e) {
      WS.err('hermit: load:', e && e.message);
    }
  }

  /** Новая партия: сброс живого состояния. */
  function onGameStart() {
    st.greeted = false;
  }

  // ====================================================================
  //  ПУБЛИЧНЫЙ API МОДУЛЯ
  // ====================================================================

  var Hermit = {
    /** Жив ли старец. */
    alive: alive,
    /** Изба построена? */
    built: function () { return st.built; },
    /** Координаты избы (или null). */
    hut: function () {
      return st.hut ? { x: st.hut.x, y: st.hut.y, w: st.hut.w, h: st.hut.h } : null;
    },
    /** Сущность старца (или null). */
    akim: function () { return alive() ? st.akim : null; },
    /** Доверие старца (0..). */
    rep: rep,
    /** Ранен ли сейчас. */
    wounded: function () { return !!fg('hermit_wounded'); },
    /** Открыть разговор напрямую (для соседей/тестов). */
    talk: function () { return WS.Dialog.start(akimNpc()); },
    /** Двор: отпугнуть зверя вручную (для тестов). */
    scare: scareAway,
    /** Внутреннее состояние (отладка). */
    _state: function () { return st; },

    /** Самотест (консоль). */
    selftest: function () {
      var out = [];
      var ok = function (name, cond) {
        out.push((cond ? '  ok  ' : ' FAIL ') + name);
        return !!cond;
      };
      ok('спрайты объявлены', !!(WS.Spr.specs && WS.Spr.specs().hermit));
      ok('изба в мире — это здание', (function () {
        var w = WS.World;
        if (!w || !w.buildings) return false;
        for (var i = 0; i < w.buildings.length; i++) {
          if (w.buildings[i].type === 'hermit_hut') return true;
        }
        return false;
      })());
      ok('старец жив', alive());
      ok('старец — kind hermit', alive() && st.akim.kind === 'hermit');
      ok('репутация читается', typeof rep() === 'number');
      out.unshift('hermit.selftest: пройдено');
      return out;
    }
  };

  // ====================================================================
  //  BOOT
  // ====================================================================

  WS.boot(function initHermit() {
    defSprites();
    declareData();

    // поведение в реестре ИИ
    if (WS.AI && WS.AI.register) {
      WS.AI.register('hermit', updateHermit);
    } else {
      WS.warn('hermit: нет WS.AI — старец стоит столбом');
    }

    // генерация мира: изба ставится по 'gen:interiors' (после мебели —
    // соседние модули уже разложили своё, мы только добавляем)
    WS.Ev.on('gen:interiors', onGenInteriors);

    // смерть старца: трагедия — на совести игрока
    WS.Ev.on('ent:kill', function (d) {
      var e = d && d.ent;
      if (!e || e.kind !== 'hermit') return;
      var p = P();
      if (p && p.needs) {
        p.needs.sanity = Math.max(0, p.needs.sanity - 20);
      }
      chron('Старец Аким убит. Лес остался без свидетеля, вы — без собеседника.', 'death');
      toast('Старец убит. Снег засыпает избу, и некому топить печь.', 'bad');
      st.akim = null;
    });

    // тик взаимодействия: [E] около старца (приоритет 62 — как notes)
    WS.tick(62, interactTick, 'hermit:talk');

    // события времени
    WS.Ev.on('time:day', onDay);
    WS.Ev.on('game:load', onGameLoad);
    WS.Ev.on('game:start', onGameStart);

    WS.log('[Hermit] старец Аким готов: изба, посох и двадцать лет тишины');
  }, 'hermit:init');

  WS.def('Hermit', Hermit);
})();
