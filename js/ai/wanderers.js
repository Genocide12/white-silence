/**
 * wanderers.js — ВЫЖИВШИЕ В ЗАБРОШЕННОМ МИРЕ (модуль K2, NPC).
 * Три человека и одна лошадь, которых нет на карте посёлка в первый
 * день, — но они есть в мире:
 *
 *   СЕМЁН-КОНЮХ    — прячется в конюшне (b.type 'stable') с 5-го дня:
 *                    боялся, выходит, если игрок три раза принёс еду
 *                    (или доверие 3+). Рассказывает о лошадях (все пали,
 *                    кроме кобылы Вишни) и о бандитах (видел самого
 *                    атамана). Квест «Вишня»: загон у мельницы-пилорамы;
 *                    привести лошадь → сани (переноска веса x2) и молоко.
 *                    Может погибнуть (волки/мороз), если не помочь.
 *   БАБКА МАТРЁНА   — изба-травницкая на отшибе (сгенерирована нами при
 *                    'gen:interiors': маленький сруб + грядки). Тор­гует
 *                    отварами (дягиль, чага, зверобой), учит распознавать
 *                    поганки (forage +1), расскажет про мальчика Ванятку
 *                    и где логово шатуна; за водку — песня (sanity +10).
 *   ФЁДОР-ДЕЗЕРТИР  — бродит по дорогам с 12-го дня: без оружия, замерзает.
 *                    Спасти (еда + тепло) → расскажет про фронт, обучит
 *                    стрельбе (firearm +1), может пойти союзником и драться
 *                    с бандитами. Бросить умирать — sanity -15.
 *   ВИШНЯ (лошадь)  — кобыла конюха: загон у мельницы, идёт за игроком,
 *                    возит сани. kind 'wr_horse', спрайт 'wr_horse'.
 *
 * Сущности {kind:'semen'|'matrena'|'fedor'|'wr_horse'}, простое блуждание
 * около своей точки, разговор по [E] через WS.Dialog (деревья — в
 * content/dialogues.js, WS.Dialogues.npc(id)). Репутации: story.rep.semen
 * / matrena / fedor. Все одноразовые решения — в story.flags ('wr_*').
 *
 * Связи: systems/dialog.js (окно разговора), content/dialogues.js (деревья),
 * content/quests.js (WS.Quests.def «Вишня»), ai/ai.js (register/anim/
 * wanderInArea/fireNear), world/world.js (addEnt/addObject/carve),
 * content/story.js (флаги child_*, ратуша парохода), core/time.js.
 */
(function () {
  'use strict';

  // ====================================================================
  //  КОНСТАНТЫ
  // ====================================================================

  var TALK_R = 1.9;            // радиус разговора по [E]
  var SEMEN_DAY = 5;           // Семён заводится в конюшне с этого дня
  var SEMEN_GIFTS = 3;         // сколько раз принести еду, чтобы он вышел
  var SEMEN_DANGER_DAY = 18;   // с этого дня без помощи он может погибнуть
  var SEMEN_DANGER_P = 0.22;   // шанс беды в день без единого подарка
  var FEDOR_DAY = 12;          // Фёдор выходит на дорогу
  var FEDOR_DIE_DAYS = 3;      // столько дней живёт без помощи
  var HUT_W = 4, HUT_H = 3;    // сруб Матрёны
  var PEN_W = 5, PEN_H = 4;    // загон Вишни (в тайлах забора)
  var TICK_PRI = 61;           // тик взаимодействий (перед hermit:62)

  // пиксельные цвета (в тон палитры WS.Spr.pal)
  var C_SKIN = '#c9a186', C_SKIN_D = '#a97f66';
  var C_COAT_S = '#7a6248';    // тулуп Семёна (овчина, светлее)
  var C_COAT_S2 = '#64503a';
  var C_FUR_S = '#96835f';
  var C_HAT = '#54432f';       // ушанка
  var C_HAT2 = '#6a5540';
  var C_SKIRT = '#3c3742';     // юбка Матрёны
  var C_PLAT = '#6a4a52';      // платок
  var C_PLAT2 = '#7d5a63';
  var C_SHINEL = '#5c5a4a';    // шинель Фёдора
  var C_SHINEL2 = '#494738';
  var C_BASH = '#4f4636';      // башлык
  var C_BOOT = '#2c2620';
  var C_EYE = '#2b2320';
  // Вишня: гнедая кобыла с белой «звёздочкой»
  var H_BODY = '#7a4f36', H_BODY2 = '#8f6144', H_DARK = '#5c3a27';
  var H_MANE = '#3d2718', H_BLOND = '#d9c9a8', H_HOO = '#2a2118';

  // ====================================================================
  //  ЖИВОЕ СОСТОЯНИЕ МОДУЛЯ
  // ====================================================================

  var st = {
    semen: null,       // сущность конюха
    matrena: null,     // сущность травницы
    fedor: null,       // сущность дезертира
    horse: null,       // сущность Вишни
    hut: null,         // {x, y, w, h} — изба Матрёны
    pen: null,         // {x, y} — центр загона Вишни
    fire: null,        // объект костра Фёдора (для отогрева)
    builtIzba: false,
    builtPen: false
  };

  function G() { return WS.G; }
  function P() { var g = WS.G; return (g && g.player) ? g.player : null; }

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  function day() { return (WS.Time && WS.Time.day) ? WS.Time.day() : 1; }
  function hour() { return (WS.Time && WS.Time.hour) ? WS.Time.hour() : 8; }

  /** Сюжетное хранилище с гарантированными полями. */
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

  function toast(text, kind) {
    if (!text) return;
    if (WS.Ui && WS.Ui.toast) {
      try { WS.Ui.toast(text, kind || 'info'); return; } catch (e) { /* ниже */ }
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

  function playerDist(x, y) {
    var p = P();
    if (!p) return 9999;
    return WS.M.dist(p.x, p.y, x, y);
  }

  function addSanity(v) {
    var p = P();
    if (!p || !p.needs || !v) return;
    p.needs.sanity = clamp(p.needs.sanity + v, 0, 100);
    if (WS.Fx && WS.Fx.text && Math.abs(v) >= 3) {
      WS.Fx.text((v > 0 ? '+' : '') + Math.round(v) + ' рассудок',
        p.x, p.y - 1.2, { col: v > 0 ? '#8fbf7a' : '#c46a5a', life: 1.2 });
    }
  }

  /** Поднять навык ровно на один уровень (урок от NPC). */
  function teachLevel(id, why) {
    if (!WS.Skills || !WS.Skills.addXp) return false;
    var p = P();
    if (!p || !p.skills || !p.skills[id]) return false;
    var need = WS.Skills.xpToNext ? WS.Skills.xpToNext(id) : 0;
    if (need <= 0) return false;
    WS.Skills.addXp(id, need, why || 'наука выживания');
    return true;
  }

  /** Репутация NPC (через движок диалогов). */
  function rep(id) {
    if (WS.Dialog && WS.Dialog.rep) {
      try { return WS.Dialog.rep(id); } catch (e) { return 0; }
    }
    var s = F();
    return (s && s.rep && typeof s.rep[id] === 'number') ? s.rep[id] : 0;
  }

  function repAdd(id, n, why) {
    if (WS.Dialog && WS.Dialog.repAdd) {
      try { return WS.Dialog.repAdd(id, n, why); } catch (e) { /* пусто */ }
    }
    return rep(id);
  }

  /** Сеяный ГПСЧ партии (детерминизм дневных бросков). */
  function dayRNG(salt) {
    var g = G();
    var seed = (g && typeof g.seed === 'number') ? (g.seed >>> 0) : 1917;
    return WS.RNG.mk(((seed ^ (day() * 2654435761 % 65521) ^ salt) >>> 0));
  }

  // ====================================================================
  //  ПИКСЕЛЬ-АРТ: ПОМОЩНИКИ
  // ====================================================================

  function p(c, x, y, w, h, col) {
    c.fillStyle = col;
    c.fillRect(x, y, w, h);
  }

  function mirror(c, w, fn) {
    c.save();
    c.translate(w, 0);
    c.scale(-1, 1);
    fn();
    c.restore();
  }

  function dir4(dir) {
    if (dir === undefined || dir === null) return 4;
    return (dir | 0) & 6;
  }

  // ====================================================================
  //  СПРАЙТ: СЕМЁН-КОНЮХ (36x54; 4 ракурса, кадры 0/1 — шаг)
  // ====================================================================

  /** Семён в лицо: широкий, овчинный тулуп, ушанка, солома за пазухой. */
  function semenFront(c, frame, dy) {
    dy = dy || 0;
    var step = frame === 1;
    if (step) {
      p(c, 13, 44 + dy, 6, 8, C_BOOT);
      p(c, 19, 44 + dy, 6, 7, C_BOOT);
    } else {
      p(c, 12, 44 + dy, 6, 8, C_BOOT);
      p(c, 19, 44 + dy, 6, 8, C_BOOT);
    }
    // тулуп — широкий, до колен
    p(c, 9, 19 + dy, 19, 27, C_COAT_S);
    p(c, 10, 19 + dy, 17, 2, '#8a7355');
    p(c, 9, 43 + dy, 19, 3, C_COAT_S2);
    p(c, 9, 43 + dy, 19, 2, C_FUR_S);          // меховой подол
    p(c, 12, 17 + dy, 13, 3, C_FUR_S);         // ворот
    // складки
    p(c, 14, 24 + dy, 1, 17, C_COAT_S2);
    p(c, 21, 26 + dy, 1, 15, C_COAT_S2);
    // ремень
    p(c, 10, 29 + dy, 17, 2, '#4a3a26');
    // руки-варежки
    p(c, 23, 21 + dy, 6, 14, C_COAT_S);
    p(c, 23, 33 + dy, 6, 4, C_FUR_S);
    p(c, 7, 21 + dy, 6, 14, C_COAT_S);
    p(c, 7, 33 + dy, 6, 4, C_FUR_S);
    // голова: круглое лицо, светлые усы
    p(c, 12, 4 + dy, 14, 13, C_SKIN);
    p(c, 12, 4 + dy, 14, 2, C_SKIN_D);
    p(c, 15, 10 + dy, 2, 2, C_EYE);
    p(c, 21, 10 + dy, 2, 2, C_EYE);
    p(c, 13, 7 + dy, 5, 1, '#8a6a42');         // брови
    p(c, 20, 7 + dy, 5, 1, '#8a6a42');
    p(c, 18, 11 + dy, 2, 2, C_SKIN_D);         // нос картошкой
    p(c, 15, 14 + dy, 9, 2, '#9c7a50');        // усы
    // ушанка: мех + верх
    p(c, 10, 2 + dy, 18, 5, C_HAT);
    p(c, 10, 6 + dy, 3, 6, C_HAT2);
    p(c, 25, 6 + dy, 3, 6, C_HAT2);
    p(c, 12, 1 + dy, 14, 2, C_HAT2);
    // соломина за пазухой — примета конюха
    p(c, 22, 22 + dy, 6, 1, '#c9b464');
    p(c, 26, 20 + dy, 1, 3, '#c9b464');
  }

  /** Семён со спины: затылок ушанки, спина тулупа. */
  function semenBack(c, frame, dy) {
    dy = dy || 0;
    if (frame === 1) {
      p(c, 13, 44 + dy, 6, 8, C_BOOT);
      p(c, 19, 44 + dy, 6, 7, C_BOOT);
    } else {
      p(c, 12, 44 + dy, 6, 8, C_BOOT);
      p(c, 19, 44 + dy, 6, 8, C_BOOT);
    }
    p(c, 9, 19 + dy, 19, 27, C_COAT_S2);
    p(c, 12, 19 + dy, 13, 24, '#6e5740');
    p(c, 9, 43 + dy, 19, 3, '#7d6a4c');
    p(c, 18, 21 + dy, 1, 20, C_COAT_S2);
    p(c, 7, 21 + dy, 5, 14, C_COAT_S2);
    p(c, 24, 21 + dy, 5, 14, C_COAT_S2);
    p(c, 10, 2 + dy, 18, 12, C_HAT);
    p(c, 13, 5 + dy, 12, 8, '#453726');
    // хомут на спине — конюх всегда при деле
    p(c, 13, 24 + dy, 12, 5, '#6e5740');
    p(c, 13, 26 + dy, 12, 1, '#57432e');
  }

  /** Семён в профиль (восток): ведро в руке. */
  function semenSide(c, frame, dy) {
    dy = dy || 0;
    if (frame === 1) {
      p(c, 13, 44 + dy, 6, 8, C_BOOT);
      p(c, 18, 44 + dy, 6, 7, C_BOOT);
    } else {
      p(c, 12, 44 + dy, 6, 8, C_BOOT);
      p(c, 19, 44 + dy, 6, 8, C_BOOT);
    }
    p(c, 10, 19 + dy, 14, 25, C_COAT_S);
    p(c, 10, 19 + dy, 14, 2, '#8a7355');
    p(c, 10, 42 + dy, 14, 3, C_FUR_S);
    // рука с деревянным ведром
    p(c, 20, 22 + dy, 7, 12, C_COAT_S);
    p(c, 23, 32 + dy, 5, 3, C_FUR_S);
    p(c, 24, 35 + dy, 8, 6, '#6a5238');        // ведро
    p(c, 24, 35 + dy, 8, 1, '#7d6046');
    p(c, 30, 36 + dy, 1, 3, '#7d6046');        // дужка
    // голова в профиль
    p(c, 13, 4 + dy, 13, 12, C_SKIN);
    p(c, 24, 10 + dy, 2, 2, C_SKIN_D);        // нос
    p(c, 20, 10 + dy, 2, 2, C_EYE);
    p(c, 26, 14 + dy, 3, 2, '#9c7a50');        // усы
    p(c, 11, 1 + dy, 14, 6, C_HAT);
    p(c, 11, 6 + dy, 3, 5, C_HAT2);
  }

  function semenDraw(c, w, h, frame, dir) {
    var d = dir4(dir);
    var dy = (frame === 1) ? 1 : 0;
    if (d === 6) {
      mirror(c, w, function () { semenSide(c, frame, dy); });
    } else if (d === 2) {
      semenSide(c, frame, dy);
    } else if (d === 0) {
      semenBack(c, frame, dy);
    } else {
      semenFront(c, frame, dy);
    }
  }

  // ====================================================================
  //  СПРАЙТ: БАБКА МАТРЁНА (32x50; сгорблена, платок, юбка в пол)
  // ====================================================================

  function matrenaFront(c, frame, dy) {
    dy = dy || 0;
    var step = frame === 1;
    // юбка в пол — видны только носки валенок
    p(c, 10, 40 + dy, 14, 9, C_SKIRT);
    p(c, 10, 40 + dy, 14, 2, '#46404c');
    if (step) p(c, 13, 47 + dy, 3, 2, C_BOOT);
    else p(c, 17, 47 + dy, 3, 2, C_BOOT);
    // кофта и передник
    p(c, 11, 20 + dy, 12, 21, '#52483c');
    p(c, 14, 24 + dy, 6, 15, '#8d7c63');      // передник
    p(c, 14, 24 + dy, 6, 1, '#9d8b70');
    p(c, 12, 22 + dy, 1, 12, '#453c32');
    // сложенные под передником руки
    p(c, 19, 25 + dy, 4, 8, '#52483c');
    p(c, 8, 25 + dy, 4, 8, '#52483c');
    // голова в платке — лицо старое, доброе
    p(c, 12, 6 + dy, 10, 9, C_SKIN);
    p(c, 13, 11 + dy, 2, 1, C_EYE);
    p(c, 19, 11 + dy, 2, 1, C_EYE);
    p(c, 17, 13 + dy, 1, 2, C_SKIN_D);
    p(c, 14, 15 + dy, 7, 1, '#8a6a52');       // морщинки у рта
    // платок: узел сзади, концы на плечах
    p(c, 10, 2 + dy, 14, 6, C_PLAT);
    p(c, 10, 7 + dy, 3, 5, C_PLAT2);
    p(c, 21, 7 + dy, 3, 5, C_PLAT2);
    p(c, 13, 1 + dy, 8, 2, C_PLAT2);
    // седая прядь из-под платка
    p(c, 21, 8 + dy, 2, 4, '#c8c2b6');
  }

  function matrenaBack(c, frame, dy) {
    dy = dy || 0;
    p(c, 10, 40 + dy, 14, 9, C_SKIRT);
    p(c, 11, 20 + dy, 12, 21, '#453e33');
    p(c, 14, 24 + dy, 6, 15, '#7d6d56');
    p(c, 8, 25 + dy, 3, 8, '#453e33');
    p(c, 20, 25 + dy, 3, 8, '#453e33');
    // затылок платка: узел
    p(c, 10, 2 + dy, 14, 11, C_PLAT2);
    p(c, 14, 8 + dy, 6, 5, C_PLAT);
  }

  function matrenaSide(c, frame, dy) {
    dy = dy || 0;
    p(c, 9, 40 + dy, 13, 9, C_SKIRT);
    p(c, 10, 20 + dy, 11, 21, '#52483c');
    p(c, 11, 24 + dy, 6, 14, '#8d7c63');
    // узелок в руке
    p(c, 20, 26 + dy, 7, 7, C_PLAT2);
    p(c, 21, 25 + dy, 4, 2, C_PLAT);
    // голова в профиль
    p(c, 13, 6 + dy, 9, 9, C_SKIN);
    p(c, 21, 11 + dy, 2, 2, C_SKIN_D);
    p(c, 19, 10 + dy, 2, 1, C_EYE);
    p(c, 10, 1 + dy, 13, 7, C_PLAT);
    p(c, 10, 6 + dy, 3, 4, C_PLAT2);
  }

  function matrenaDraw(c, w, h, frame, dir) {
    var d = dir4(dir);
    var dy = (frame === 1) ? 1 : 0;
    if (d === 6) {
      mirror(c, w, function () { matrenaSide(c, frame, dy); });
    } else if (d === 2) {
      matrenaSide(c, frame, dy);
    } else if (d === 0) {
      matrenaBack(c, frame, dy);
    } else {
      matrenaFront(c, frame, dy);
    }
  }

  // ====================================================================
  //  СПРАЙТ: ФЁДОР-ДЕЗЕРТИР (34x54; шинель, башлык, обмотки)
  // ====================================================================

  function fedorFront(c, frame, dy) {
    dy = dy || 0;
    var step = frame === 1;
    if (step) {
      p(c, 12, 44 + dy, 5, 8, C_BOOT);
      p(c, 19, 44 + dy, 5, 7, C_BOOT);
    } else {
      p(c, 12, 44 + dy, 5, 8, C_BOOT);
      p(c, 19, 44 + dy, 5, 8, C_BOOT);
    }
    // обмотки на икрах
    p(c, 12, 42 + dy, 5, 3, '#6a6353');
    p(c, 19, 42 + dy, 5, 3, '#6a6353');
    // шинель до колен, грубая
    p(c, 9, 18 + dy, 18, 26, C_SHINEL);
    p(c, 10, 18 + dy, 16, 2, '#6a6854');
    p(c, 9, 42 + dy, 18, 3, C_SHINEL2);
    // пуговицы в ряд — царская выправка
    p(c, 17, 22 + dy, 1, 1, '#8a8468');
    p(c, 17, 26 + dy, 1, 1, '#8a8468');
    p(c, 17, 30 + dy, 1, 1, '#8a8468');
    p(c, 17, 34 + dy, 1, 1, '#8a8468');
    // пояс с пряжкой (шинельный ремень ушёл в товарке)
    p(c, 10, 27 + dy, 16, 2, '#3a362c');
    p(c, 16, 27 + dy, 2, 2, '#8a8468');
    // руки: рукава пустые, кисти красные от мороза
    p(c, 23, 20 + dy, 5, 13, C_SHINEL);
    p(c, 23, 32 + dy, 5, 4, C_SKIN_D);
    p(c, 8, 20 + dy, 5, 13, C_SHINEL);
    p(c, 8, 32 + dy, 5, 4, C_SKIN_D);
    // голова: башлык вокруг молодой бородки
    p(c, 12, 5 + dy, 12, 11, C_SKIN);
    p(c, 14, 10 + dy, 2, 2, C_EYE);
    p(c, 20, 10 + dy, 2, 2, C_EYE);
    p(c, 13, 7 + dy, 4, 1, '#5a4432');
    p(c, 19, 7 + dy, 4, 1, '#5a4432');
    p(c, 17, 11 + dy, 2, 2, C_SKIN_D);
    p(c, 14, 14 + dy, 9, 4, '#6a5a42');       // молодая бородка
    // башлык: капюшор и «лопаты» на груди
    p(c, 10, 2 + dy, 16, 4, C_BASH);
    p(c, 10, 5 + dy, 3, 8, C_BASH);
    p(c, 23, 5 + dy, 3, 8, C_BASH);
    // иней на бородке (замерзает)
    p(c, 15, 14 + dy, 2, 1, '#dfe6ee');
    p(c, 20, 15 + dy, 2, 1, '#dfe6ee');
  }

  function fedorBack(c, frame, dy) {
    dy = dy || 0;
    if (frame === 1) {
      p(c, 12, 44 + dy, 5, 8, C_BOOT);
      p(c, 19, 44 + dy, 5, 7, C_BOOT);
    } else {
      p(c, 12, 44 + dy, 5, 8, C_BOOT);
      p(c, 19, 44 + dy, 5, 8, C_BOOT);
    }
    p(c, 9, 18 + dy, 18, 26, C_SHINEL2);
    p(c, 12, 18 + dy, 12, 24, '#514f40');
    p(c, 9, 42 + dy, 18, 3, '#3f3d31');
    // шов хребта и скатка через плечо
    p(c, 17, 20 + dy, 1, 22, C_SHINEL2);
    p(c, 10, 24 + dy, 16, 4, '#6a6353');
    p(c, 10, 2 + dy, 16, 10, C_BASH);
  }

  function fedorSide(c, frame, dy) {
    dy = dy || 0;
    if (frame === 1) {
      p(c, 13, 44 + dy, 5, 8, C_BOOT);
      p(c, 18, 44 + dy, 5, 7, C_BOOT);
    } else {
      p(c, 12, 44 + dy, 5, 8, C_BOOT);
      p(c, 19, 44 + dy, 5, 8, C_BOOT);
    }
    p(c, 10, 18 + dy, 14, 25, C_SHINEL);
    p(c, 10, 18 + dy, 14, 2, '#6a6854');
    p(c, 10, 41 + dy, 14, 3, C_SHINEL2);
    // рукава скрещены на груди — греет пальцы
    p(c, 12, 23 + dy, 11, 6, C_SHINEL2);
    p(c, 12, 23 + dy, 11, 1, '#6a6854');
    // голова в профиль
    p(c, 12, 5 + dy, 12, 11, C_SKIN);
    p(c, 23, 10 + dy, 2, 2, C_SKIN_D);
    p(c, 19, 10 + dy, 2, 2, C_EYE);
    p(c, 18, 14 + dy, 7, 4, '#6a5a42');
    p(c, 9, 1 + dy, 15, 6, C_BASH);
    p(c, 9, 6 + dy, 3, 5, '#5a5140');
  }

  function fedorDraw(c, w, h, frame, dir) {
    var d = dir4(dir);
    var dy = (frame === 1) ? 1 : 0;
    if (d === 6) {
      mirror(c, w, function () { fedorSide(c, frame, dy); });
    } else if (d === 2) {
      fedorSide(c, frame, dy);
    } else if (d === 0) {
      fedorBack(c, frame, dy);
    } else {
      fedorFront(c, frame, dy);
    }
  }

  // ====================================================================
  //  СПРАЙТ: КОБЫЛА ВИШНЯ (60x44; гнедая, звёздочка, попона)
  // ====================================================================

  function horseSide(c, frame) {
    var stride = frame === 1;
    // ноги: пара ближняя/дальняя
    if (stride) {
      p(c, 14, 30, 4, 12, H_BODY2);
      p(c, 40, 30, 4, 11, H_BODY2);
      p(c, 20, 30, 4, 10, H_DARK);
      p(c, 46, 30, 4, 12, H_DARK);
    } else {
      p(c, 13, 30, 4, 12, H_BODY2);
      p(c, 42, 30, 4, 12, H_BODY2);
      p(c, 22, 30, 4, 11, H_DARK);
      p(c, 49, 30, 4, 10, H_DARK);
    }
    // копыта
    p(c, 13, 40, 4, 2, H_HOO);
    p(c, 42, 40, 4, 2, H_HOO);
    p(c, 22, 39, 4, 2, H_HOO);
    p(c, 49, 39, 4, 2, H_HOO);
    // корпус
    p(c, 10, 12, 42, 19, H_BODY);
    p(c, 12, 10, 38, 4, H_BODY2);             // спина
    p(c, 10, 26, 42, 5, H_DARK);             // живот
    // попона-рундук с кумачовой каймой
    p(c, 14, 11, 30, 15, '#8d7c63');
    p(c, 14, 11, 30, 2, '#a08a6c');
    p(c, 14, 24, 30, 2, '#8f2a26');
    // шея
    p(c, 42, 6, 12, 12, H_BODY);
    p(c, 43, 5, 3, 12, H_BODY2);
    // голова: морда вниз к сену
    p(c, 50, 6, 9, 9, H_BODY);
    p(c, 56, 10, 4, 6, H_BODY2);
    p(c, 56, 14, 4, 2, H_DARK);              // ноздря-тень
    // звёздочка на лбу
    p(c, 52, 7, 3, 2, H_BLOND);
    // глаз
    p(c, 53, 9, 2, 2, '#1c1712');
    // уши
    p(c, 44, 2, 3, 5, H_BODY2);
    p(c, 48, 3, 3, 4, H_BODY2);
    // грива
    p(c, 40, 3, 5, 10, H_MANE);
    p(c, 43, 5, 3, 8, H_MANE);
    // хвост
    p(c, 6, 12, 5, 18, H_MANE);
    p(c, 8, 24, 4, 6, '#33210f');
    // снежная пыль на спине
    p(c, 16, 10, 26, 1, 'rgba(226,232,240,0.55)');
  }

  function horseFront(c, frame) {
    var stride = frame === 1;
    // ноги попарно
    if (stride) {
      p(c, 18, 30, 4, 12, H_BODY2);
      p(c, 38, 30, 4, 11, H_BODY2);
      p(c, 24, 30, 4, 10, H_DARK);
      p(c, 44, 30, 4, 12, H_DARK);
    } else {
      p(c, 18, 30, 4, 11, H_BODY2);
      p(c, 38, 30, 4, 12, H_BODY2);
      p(c, 24, 30, 4, 12, H_DARK);
      p(c, 44, 30, 4, 10, H_DARK);
    }
    p(c, 18, 40, 4, 2, H_HOO);
    p(c, 24, 40, 4, 2, H_HOO);
    p(c, 38, 40, 4, 2, H_HOO);
    p(c, 44, 40, 4, 2, H_HOO);
    // грудь широкая
    p(c, 16, 12, 30, 20, H_BODY);
    p(c, 18, 10, 26, 3, H_BODY2);
    p(c, 16, 28, 30, 4, H_DARK);
    p(c, 24, 14, 18, 13, '#8d7c63');         // попона
    p(c, 24, 25, 18, 2, '#8f2a26');
    // шея и голова к зрителю
    p(c, 26, 2, 10, 12, H_BODY);
    p(c, 23, 4, 6, 9, H_BODY2);
    p(c, 33, 4, 6, 9, H_BODY2);
    p(c, 27, 4, 8, 8, H_BODY);
    p(c, 29, 8, 2, 2, '#1c1712');
    p(c, 34, 8, 2, 2, '#1c1712');
    p(c, 31, 11, 3, 3, H_BLOND);             // звёздочка-блинец
    p(c, 30, 14, 4, 3, H_DARK);              // морда
    // уши вперёд
    p(c, 24, 0, 3, 5, H_BODY2);
    p(c, 35, 0, 3, 5, H_BODY2);
    // чёлка
    p(c, 26, 2, 10, 2, H_MANE);
    p(c, 16, 10, 30, 1, 'rgba(226,232,240,0.5)');
  }

  function horseBack(c, frame) {
    var stride = frame === 1;
    if (stride) {
      p(c, 18, 30, 4, 12, H_BODY2);
      p(c, 38, 30, 4, 11, H_BODY2);
      p(c, 24, 30, 4, 10, H_DARK);
      p(c, 44, 30, 4, 12, H_DARK);
    } else {
      p(c, 18, 30, 4, 11, H_BODY2);
      p(c, 38, 30, 4, 12, H_BODY2);
      p(c, 24, 30, 4, 12, H_DARK);
      p(c, 44, 30, 4, 10, H_DARK);
    }
    p(c, 18, 40, 4, 2, H_HOO);
    p(c, 24, 40, 4, 2, H_HOO);
    p(c, 38, 40, 4, 2, H_HOO);
    p(c, 44, 40, 4, 2, H_HOO);
    p(c, 16, 12, 30, 20, H_DARK);
    p(c, 18, 10, 26, 3, '#523021');
    // круп и хвост к зрителю
    p(c, 22, 12, 20, 14, '#8d7c63');
    p(c, 22, 24, 20, 2, '#8f2a26');
    p(c, 20, 14, 6, 22, H_MANE);
    // шея и уши
    p(c, 26, 2, 10, 12, H_DARK);
    p(c, 24, 0, 3, 5, '#523021');
    p(c, 35, 0, 3, 5, '#523021');
    p(c, 16, 10, 30, 1, 'rgba(226,232,240,0.5)');
  }

  function horseDraw(c, w, h, frame, dir) {
    var d = dir4(dir);
    if (d === 6) {
      mirror(c, w, function () { horseSide(c, frame); });
    } else if (d === 2) {
      horseSide(c, frame);
    } else if (d === 0) {
      horseBack(c, frame);
    } else {
      horseFront(c, frame);
    }
  }

  // ====================================================================
  //  СПРАЙТ: ГРЯДКИ МАТРЁНЫ (зимние: снег + чёрные борозды + сухие стебли)
  // ====================================================================

  function defBedsSprite() {
    WS.Spr.def('wr_beds', { w: 34, h: 20, draw: function (c) {
      // снежная шапка
      WS.Spr.ell(c, 17, 8, 15, 6, 'rgba(226,232,240,0.85)');
      // борозды выглядывают из-под снега
      for (var i = 0; i < 3; i++) {
        p(c, 4, 10 + i * 4, 26, 2, '#2e2820');
        p(c, 6, 10 + i * 4, 22, 1, '#3d362b');
      }
      // сухие стебли прошлой травы
      p(c, 8, 5, 1, 6, '#7a6a4e');
      p(c, 10, 4, 1, 7, '#8d7c5e');
      p(c, 13, 6, 1, 5, '#7a6a4e');
      p(c, 25, 5, 1, 6, '#8d7c5e');
      p(c, 27, 4, 1, 7, '#7a6a4e');
      // пучок снега на стеблях
      p(c, 9, 4, 2, 1, 'rgba(226,232,240,0.9)');
      p(c, 26, 3, 2, 1, 'rgba(226,232,240,0.9)');
    }});
  }

  /** Все спрайты модуля. */
  function defSprites() {
    WS.Spr.def('npc_semen', { w: 36, h: 54, draw: semenDraw });
    WS.Spr.def('npc_matrena', { w: 32, h: 50, draw: matrenaDraw });
    WS.Spr.def('npc_fedor', { w: 34, h: 54, draw: fedorDraw });
    WS.Spr.def('wr_horse', { w: 60, h: 44, draw: horseDraw });
    defBedsSprite();
  }

  // ====================================================================
  //  ПРЕДМЕТЫ: травы и отвары Матрёны
  // ====================================================================

  function declareData() {
    WS.Data = WS.Data || {};
    WS.Data.items = WS.Data.items || {};

    if (!WS.Data.items.wr_stonewort) {
      // зверобой, сушёный пучок (в мире его нет — только у Матрёны)
      WS.Data.items.wr_stonewort = {
        id: 'wr_stonewort', cat: 'med', w: 0.08, stack: 8,
        sanity: 4, tags: ['heal', 'tea_mat']
      };
    }
    if (!WS.Data.items.wr_decoction_angelica) {
      // отвар дягиля: крепкий, лечит раны и простуду
      WS.Data.items.wr_decoction_angelica = {
        id: 'wr_decoction_angelica', cat: 'med', w: 0.5, stack: 4,
        heal: 22, cures: 'fever', sanity: 3, tags: ['heal', 'drinkable']
      };
    }
    if (!WS.Data.items.wr_decoction_chaga) {
      // отвар чаги: сытный дымный чай, греет и укрепляет рассудок
      WS.Data.items.wr_decoction_chaga = {
        id: 'wr_decoction_chaga', cat: 'drink', w: 0.5, stack: 4,
        cal: 120, thir: 25, sanity: 10, tags: ['drinkable']
      };
    }
    if (!WS.Data.items.wr_decoction_stonewort) {
      // отвар зверобоя: от тоски и боли
      WS.Data.items.wr_decoction_stonewort = {
        id: 'wr_decoction_stonewort', cat: 'med', w: 0.5, stack: 4,
        painkill: 30, sanity: 12, tags: ['heal', 'drinkable']
      };
    }
  }

  // ====================================================================
  //  ПОИСК МЕСТ И ЗДАНИЙ
  // ====================================================================

  /** Природа ли тайл (можно строить). */
  function natT(t) {
    var T = WS.World.T;
    return t === T.SNOW || t === T.GRASS || t === T.GRASS2 ||
           t === T.SNOW_DEEP || t === T.DIRT;
  }

  /** Здание по типу (первое попавшееся или ближайшее к точке). */
  function buildingOf(type, nearX, nearY) {
    var w = WS.World;
    if (!w || !w.buildings) return null;
    var best = null, bd = 1e9;
    for (var i = 0; i < w.buildings.length; i++) {
      var b = w.buildings[i];
      if (!b || b.type !== type) continue;
      if (nearX === undefined) return b;
      var d = WS.M.dist(b.x + b.w / 2, b.y + b.h / 2, nearX, nearY);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  /** Свободный пол внутри здания. */
  function freeTileIn(b) {
    var w = WS.World;
    if (!w || !b) return null;
    var T = w.T;
    var floors = [T.FLOOR_WOOD, T.FLOOR_TILE, T.FLOOR_CONCRETE, T.FLOOR_DIRT];
    for (var t = 0; t < 40; t++) {
      var x = b.x + 1 + Math.floor(Math.random() * Math.max(1, b.w - 2));
      var y = b.y + 1 + Math.floor(Math.random() * Math.max(1, b.h - 2));
      if (floors.indexOf(w.tileAt(x, y)) < 0) continue;
      if (w.isTileBlocked && w.isTileBlocked(x, y)) continue;
      var objs = w.objsAt ? w.objsAt(x, y) : [];
      var busy = false;
      for (var i = 0; i < (objs ? objs.length : 0); i++) {
        if (objs[i] && objs[i].solid) { busy = true; break; }
      }
      if (busy) continue;
      return { x: x + 0.5, y: y + 0.5 };
    }
    return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  }

  /** Убрать природные объекты с пятна застройки. */
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

  // ====================================================================
  //  ИЗБА МАТРЁНЫ: маленький сруб на отшибе + грядки
  // ====================================================================

  /**
   * Поиск места: подальше от центра посёлка (18..44 вёрсты), но не в
   * северном лесу отшельника и не в воде. Сеяный ГПСЧ — детерминизм.
   */
  function findMatrenaSpot(R) {
    var w = WS.World;
    if (!w || !w.tiles) return null;
    var T = w.T;
    for (var t = 0; t < 500; t++) {
      var x = Math.floor(R.range(30, w.w - 30));
      var y = Math.floor(R.range(84, w.h - 40));     // юг и середина
      var ok = true;
      for (var yy = y - 1; yy <= y + HUT_H + 4 && ok; yy++) {
        for (var xx = x - 1; xx <= x + HUT_W + 1 && ok; xx++) {
          if (!natT(w.tileAt(xx, yy))) { ok = false; break; }
          if (w.isTileBlocked && w.isTileBlocked(xx, yy)) { ok = false; break; }
        }
      }
      if (!ok) continue;
      if (w.isInside && w.isInside(x, y)) continue;
      var d = WS.M.dist(x, y, 110, 115);
      if (d < 18 || d > 44) continue;
      // не вплотную к избушке отшельника (он на севере — но проверим)
      if (WS.Hermit && WS.Hermit.hut) {
        var h = WS.Hermit.hut();
        if (h && WS.M.dist(x, y, h.x, h.y) < 20) continue;
      }
      // не на точке появления
      if (w.spawnPoint && WS.M.dist(x, y, w.spawnPoint.x, w.spawnPoint.y) < 16) continue;
      return { x: x, y: y };
    }
    return { x: 96, y: 96 };
  }

  /**
   * Построить избу: сруб 4×3, дверь на юг, окно, печь, нары, стол;
   * снаружи — грядки, поленница, лавка. Координаты запоминаются во
   * флагах (wr_mh_x/y) — при загрузке мир строится там же.
   */
  function buildMatrenaHut() {
    var w = WS.World;
    if (!w || !w.carve || !w.addObject) return null;
    var T = w.T;

    // уже стоит? (повторная генерация мира)
    for (var i = 0; i < w.buildings.length; i++) {
      if (w.buildings[i] && w.buildings[i].type === 'matrena_hut') {
        var bb = w.buildings[i];
        st.hut = { x: bb.x, y: bb.y, w: bb.w, h: bb.h };
        st.builtIzba = true;
        return st.hut;
      }
    }

    // место: сперва флаги (та же партия), затем сеяный поиск
    var spot = null;
    if (typeof fg('wr_mh_x') === 'number' && typeof fg('wr_mh_y') === 'number') {
      spot = { x: fg('wr_mh_x'), y: fg('wr_mh_y') };
    } else {
      var seed = (G() && typeof G().seed === 'number') ? (G().seed >>> 0) : 777;
      var R = WS.RNG.mk(((seed ^ 0x9A7A) >>> 0));
      spot = findMatrenaSpot(R);
    }

    var x = spot.x, y = spot.y;
    clearRect(x - 0.6, y - 0.6, x + HUT_W + 0.6, y + HUT_H + 3.6);

    // коробка
    w.carve(x, y, HUT_W, HUT_H, T.FLOOR_WOOD);
    for (var xx = x; xx < x + HUT_W; xx++) {
      w.setTile(xx, y, T.WALL_LOG);
      w.setTile(xx, y + HUT_H - 1, T.WALL_LOG);
    }
    for (var yy = y; yy < y + HUT_H; yy++) {
      w.setTile(x, yy, T.WALL_LOG);
      w.setTile(x + HUT_W - 1, yy, T.WALL_LOG);
    }
    var doorX = x + 1, doorY = y + HUT_H - 1;
    w.setTile(doorX, doorY, T.DOORWAY);
    w.setTile(x + HUT_W - 1, y + 1, T.WINDOW);

    // мета-здание
    var b = {
      id: 'matrena_hut_1',
      type: 'matrena_hut',
      x: x, y: y, w: HUT_W, h: HUT_H,
      name: 'Изба травницы',
      material: 'log',
      rooms: [{ x: x + 1, y: y + 1, w: HUT_W - 2, h: HUT_H - 2, role: 'kitchen' }],
      door: [{ x: doorX, y: doorY }],
      windows: [{ x: x + HUT_W - 1, y: y + 1 }]
    };
    w.buildings.push(b);

    // дверь-объект (не заперта: Матрёна гостей чает)
    w.addObject({
      x: doorX + 0.5, y: doorY + 0.5,
      sprName: 'door_obj',
      solid: true,
      name: 'Дверь избы',
      door: { open: false, locked: false }
    });

    // утварь: печь в углу, нары, стол, травы под потолком
    w.addObject({
      x: x + HUT_W - 1.5, y: y + 0.5,
      sprName: 'pech', solid: true, name: 'Печь Матрёны', heat: true
    });
    w.addObject({
      x: x + 0.5, y: y + 0.5,
      sprName: 'bed_wood', solid: true, name: 'Кровать'
    });
    w.addObject({
      x: x + 1.5, y: y + 0.5,
      sprName: 'table_wood', solid: true, name: 'Стол'
    });
    w.addObject({
      x: x + 2.2, y: y + 0.4,
      sprName: 'candle_table', solid: false, name: 'Лампадка',
      light: 22, z: 14
    });
    w.addObject({
      x: x + 1.5, y: y + 0.3,
      sprName: 'hm_herbs', solid: false,
      name: 'Пучки трав', z: 16
    });

    // двор: грядки, поленница, тропинка
    w.addObject({
      x: x - 1.4, y: y + HUT_H + 0.8,
      sprName: 'wr_beds', solid: false, name: 'Зимние грядки', z: 1
    });
    w.addObject({
      x: x - 1.6, y: y + HUT_H + 2.2,
      sprName: 'wr_beds', solid: false, name: 'Зимние грядки', z: 1
    });
    w.addObject({
      x: x + HUT_W + 1.2, y: y + HUT_H + 0.6,
      sprName: 'wood_pile', solid: true, name: 'Поленница'
    });
    if (natT(w.tileAt(doorX, doorY + 1))) w.setTile(doorX, doorY + 1, T.DIRT);
    if (natT(w.tileAt(doorX, doorY + 2))) w.setTile(doorX, doorY + 2, T.DIRT);

    st.hut = { x: x, y: y, w: HUT_W, h: HUT_H };
    st.builtIzba = true;
    fs('wr_mh_x', x);
    fs('wr_mh_y', y);
    WS.log('[Wanderers] изба Матрёны поставлена: (' + x + ',' + y + ')');
    return st.hut;
  }

  // ====================================================================
  //  ЗАГОН ВИШНИ: у мельницы-пилорамы (тип 'sawmill'), не то — у житницы
  // ====================================================================

  /** Здание «мельницы»: пилорама у воды (sawmill), запас — житница. */
  function millBuilding() {
    var w = WS.World;
    if (!w) return null;
    var m = buildingOf('sawmill');
    if (m) return m;
    m = buildingOf('granary');
    if (m) return m;
    return buildingOf('barn');
  }

  /** Огородить PEN_W×PEN_H забором с проходом на юге, сено внутри. */
  function buildHorsePen() {
    var w = WS.World;
    if (!w || !w.setTile || !w.addObject) return null;
    var T = w.T;

    // уже помним место этой партии — строим там же
    var bx = fg('wr_pen_x'), by = fg('wr_pen_y');
    if (typeof bx !== 'number' || typeof by !== 'number') {
      var m = millBuilding();
      if (!m) return null;
      bx = m.x + m.w + 2;
      by = m.y - 1;
      // не лезем в воду/дороги: ищем свободную площадку рядом
      var ok = true;
      for (var yy = by; yy < by + PEN_H && ok; yy++) {
        for (var xx = bx; xx < bx + PEN_W && ok; xx++) {
          if (!natT(w.tileAt(xx, yy))) ok = false;
        }
      }
      if (!ok) {
        // площадка восточнее
        bx = m.x + m.w + 4;
        by = m.y + 2;
        for (var yy2 = by; yy2 < by + PEN_H; yy2++) {
          for (var xx2 = bx; xx2 < bx + PEN_W; xx2++) {
            if (!natT(w.tileAt(xx2, yy2))) { fs('wr_pen_bad', 1); }
          }
        }
      }
      fs('wr_pen_x', bx);
      fs('wr_pen_y', by);
    }

    // забор по периметру, проход — южная середина
    var cx = bx + Math.floor(PEN_W / 2);
    for (var px = bx; px < bx + PEN_W; px++) {
      if (w.tileAt(px, by) === T.WATER) continue;
      if (natT(w.tileAt(px, by))) w.setTile(px, by, T.FENCE);
      if (px !== cx && natT(w.tileAt(px, by + PEN_H - 1))) {
        w.setTile(px, by + PEN_H - 1, T.FENCE);
      }
    }
    for (var py = by; py < by + PEN_H; py++) {
      if (natT(w.tileAt(bx, py))) w.setTile(bx, py, T.FENCE);
      if (natT(w.tileAt(bx + PEN_W - 1, py))) w.setTile(bx + PEN_W - 1, py, T.FENCE);
    }

    // сено и колоду внутри
    var inX = bx + PEN_W / 2, inY = by + PEN_H / 2;
    w.addObject({
      x: bx + 1.5, y: by + 1.5,
      sprName: 'haystack', solid: true, name: 'Сено в загоне', z: 2
    });
    w.addObject({
      x: bx + PEN_W - 1.5, y: by + PEN_H - 1.5,
      sprName: 'koryto', solid: true, name: 'Корыто', z: 2
    });

    st.pen = { x: inX, y: inY };
    st.builtPen = true;
    return st.pen;
  }

  // ====================================================================
  //  СУЩНОСТИ: создание
  // ====================================================================

  function aliveEnt(e) { return !!(e && !e.dead); }

  /** Семён: заводится в конюшне с 5-го дня. */
  function spawnSemen() {
    var w = WS.World;
    if (!w || !w.addEnt || aliveEnt(st.semen) || fg('wr_semen_dead')) return st.semen;
    var b = buildingOf('stable');
    if (!b) return null;
    var pt = freeTileIn(b);
    var out = isSemenOut();
    var e = w.addEnt({
      kind: 'semen',
      id: 'wr_semen',
      x: pt.x, y: pt.y,
      dir: 4,
      hp: 55, maxHp: 55,
      speed: out ? 1.0 : 0,
      sprName: 'npc_semen',
      sprFrame: 2,
      animFrames: 2,
      restFrame: 2,
      shadowR: 0.42,
      state: out ? 'idle' : 'hide',
      stateT: 0,
      home: { x: b.x + b.w / 2, y: b.y + b.h + 1.2 },
      stable: { x: b.x + b.w / 2, y: b.y + b.h / 2 },
      brain: { hears: false }
    });
    st.semen = e;
    return e;
  }

  /** Доверие конюха: вышел или ещё сидит за поленницей. */
  function isSemenOut() {
    return !!fg('wr_semen_out') || rep('semen') >= 3;
  }

  /** Матрёна: живёт у своей избы. */
  function spawnMatrena() {
    var w = WS.World;
    if (!w || !w.addEnt || aliveEnt(st.matrena) || fg('wr_matrena_dead')) return st.matrena;
    if (!st.hut) return null;
    var doorX = st.hut.x + 1.5, doorY = st.hut.y + st.hut.h + 1.2;
    var e = w.addEnt({
      kind: 'matrena',
      id: 'wr_matrena',
      x: doorX, y: doorY,
      dir: 4,
      hp: 35, maxHp: 35,
      speed: 0.6,
      sprName: 'npc_matrena',
      sprFrame: 0,
      animFrames: 2,
      restFrame: 0,
      shadowR: 0.34,
      state: 'idle', stateT: 0,
      home: { x: doorX, y: doorY },
      hut: { x: st.hut.x, y: st.hut.y, w: st.hut.w, h: st.hut.h },
      brain: { hears: false }
    });
    st.matrena = e;
    return e;
  }

  /** Фёдор: выходит на дорогу с 12-го дня, замерзающий. */
  function spawnFedor() {
    var w = WS.World;
    if (!w || !w.addEnt || aliveEnt(st.fedor) || fg('wr_fedor_dead')) return st.fedor;
    if (fg('wr_fedor') === 'gone') return null;
    var p = P();
    if (!p) return null;

    // точка на тракте, подальше от игрока
    var best = null;
    for (var t = 0; t < 160 && !best; t++) {
      var x = 12 + Math.floor(Math.random() * (w.w - 24));
      var y = 60 + Math.floor(Math.random() * (w.h - 90));
      if (w.tileAt(x, y) !== w.T.ROAD) continue;
      if (w.isTileBlocked && w.isTileBlocked(x, y)) continue;
      var d = WS.M.dist(x, y, p.x, p.y);
      if (d < 30 || d > 90) continue;
      best = { x: x + 0.5, y: y + 0.5 };
    }
    if (!best) best = { x: w.w / 2, y: 140 };

    var saved = fg('wr_fedor');
    var e = w.addEnt({
      kind: 'fedor',
      id: 'wr_fedor',
      x: best.x, y: best.y,
      dir: 4,
      hp: 45, maxHp: 60,
      speed: saved === 'lost' ? 0.45 : 1.15,
      sprName: 'npc_fedor',
      sprFrame: 0,
      animFrames: 2,
      restFrame: 0,
      shadowR: 0.4,
      state: saved === 'ally' ? 'ally' : (saved === 'saved' ? 'camp' : 'lost'),
      stateT: 0,
      atkCd: 0,
      home: null,
      brain: { hears: true }
    });
    if (!fg('wr_fedor_day')) fs('wr_fedor_day', day());
    st.fedor = e;
    return e;
  }

  /** Вишня: в загоне (пока квест жив) или за спиной игрока. */
  function spawnHorse() {
    var w = WS.World;
    if (!w || !w.addEnt || aliveEnt(st.horse) || fg('wr_vishnya_dead')) return st.horse;
    if (!fg('wr_mare_q')) return null;       // загон скрыт, пока квест не начат
    if (!st.pen) buildHorsePen();
    if (!st.pen) return null;

    var mode = fg('wr_vishnya') || 'pen';
    var x = st.pen.x, y = st.pen.y;
    if (mode === 'follow' || mode === 'handed') {
      var p = P();
      if (p) { x = p.x + 1.5; y = p.y + 1; }
    }
    var e = w.addEnt({
      kind: 'wr_horse',
      id: 'wr_vishnya',
      x: x, y: y,
      dir: 4,
      hp: 80, maxHp: 80,
      speed: 2.5,
      sprName: 'wr_horse',
      sprFrame: 0,
      animFrames: 2,
      restFrame: 0,
      shadowR: 0.7,
      state: mode, stateT: 0,
      home: { x: st.pen.x, y: st.pen.y },
      brain: { hears: false, noInside: true }
    });
    st.horse = e;
    return e;
  }

  // ====================================================================
  //  ПОВЕДЕНИЕ: СЕМЁН
  // ====================================================================

  function updateSemen(e, dt, R) {
    e.moving = false;
    var p = P();

    if (e.state === 'hide') {
      // сидит между поленницей и стеной: не движется, дышит
      e.sprFrame = 2;
      if (p && playerDist(e.x, e.y) < 6) WS.AI.setDir(e, p.x - e.x, p.y - e.y);
      return;
    }

    // вышел к людям: подходит к игроку, бродит по конюшенному двору
    if (p && p.hp > 0) {
      var d = WS.M.dist(e.x, e.y, p.x, p.y);
      if (d < 3.2 && d > 1.35) {
        WS.AI.moveTowards(e, p.x, p.y, e.speed, dt);
        WS.AI.anim(e, dt, 4);
        return;
      }
      if (d < 6) WS.AI.setDir(e, p.x - e.x, p.y - e.y);
    }
    WS.AI.wanderInArea(e, e.stable.x, e.stable.y + 2, 4, dt, e.speed * 0.6);
    WS.AI.anim(e, dt, 4);
  }

  // ====================================================================
  //  ПОВЕДЕНИЕ: МАТРЁНА
  // ====================================================================

  function updateMatrena(e, dt, R) {
    e.moving = false;
    var p = P();
    var night = hour() >= 20 || hour() < 7;

    // ночью — к печи
    if (night && e.hut) {
      var bed = { x: e.hut.x + 1.5, y: e.hut.y + 1.5 };
      if (WS.M.dist(e.x, e.y, bed.x, bed.y) > 1) {
        WS.AI.moveTowards(e, bed.x, bed.y, e.speed, dt);
        WS.AI.anim(e, dt, 3);
      }
      return;
    }

    // днём: подходит к гостю, копается на грядках
    if (p && p.hp > 0) {
      var d = WS.M.dist(e.x, e.y, p.x, p.y);
      if (d < 3 && d > 1.3) {
        WS.AI.moveTowards(e, p.x, p.y, e.speed, dt);
        WS.AI.anim(e, dt, 3);
        return;
      }
      if (d < 6) WS.AI.setDir(e, p.x - e.x, p.y - e.y);
    }
    WS.AI.wanderInArea(e, e.home.x, e.home.y, 3.5, dt, e.speed * 0.7);
    WS.AI.anim(e, dt, 3);
  }

  // ====================================================================
  //  ПОВЕДЕНИЕ: ФЁДОР (замерзает / сидит у костра / союзник в бою)
  // ====================================================================

  /** Ближайший враг в радиусе r от Фёдора. */
  function fedorTarget(e, r) {
    var w = WS.World;
    if (!w || !w.entsNear) return null;
    var list = w.entsNear(e.x, e.y, r);
    var best = null, bd = 1e9;
    for (var i = 0; i < list.length; i++) {
      var t = list[i];
      if (!t || t.dead || t === e) continue;
      if (t.kind !== 'bandit' && t.kind !== 'wolf' && t.kind !== 'bear') continue;
      var d = WS.M.dist(e.x, e.y, t.x, t.y);
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  }

  function updateFedor(e, dt, R) {
    e.moving = false;
    var p = P();

    // --- замерзающий дезертир: бредёт, спотыкается ---
    if (e.state === 'lost') {
      WS.AI.wanderInArea(e, e.x, e.y, 3, dt, e.speed);
      WS.AI.anim(e, dt, 2);
      // пар изо рта — дышит ещё
      if (Math.random() < dt * 0.4 && WS.Fx && WS.Fx.spawn) {
        try {
          WS.Fx.spawn('smoke', e.x + 0.3, e.y - 0.8, {
            vx: 0.1, vy: -0.2, z: 18, life: 0.8, size: 2
          });
        } catch (err) { /* пусто */ }
      }
      return;
    }

    // --- спасённый: греется у своего костра ---
    if (e.state === 'camp') {
      var camp = { x: e.x, y: e.y };
      if (fg('wr_fedor_fire_x')) {
        camp = { x: fg('wr_fedor_fire_x'), y: fg('wr_fedor_fire_y') };
      }
      if (p && WS.M.dist(e.x, e.y, p.x, p.y) < 3 && WS.M.dist(e.x, e.y, p.x, p.y) > 1.4) {
        WS.AI.moveTowards(e, p.x, p.y, e.speed, dt);
        WS.AI.anim(e, dt, 4);
        return;
      }
      WS.AI.wanderInArea(e, camp.x, camp.y, 3, dt, e.speed * 0.6);
      WS.AI.anim(e, dt, 4);
      return;
    }

    // --- союзник: следует за игроком и дерётся ---
    if (e.state === 'ally' && p && p.hp > 0) {
      if (e.atkCd > 0) e.atkCd -= dt;
      var hurt = e.hp < e.maxHp * 0.3;

      var foe = fedorTarget(e, hurt ? 0 : 7);
      if (foe) {
        var fd = WS.M.dist(e.x, e.y, foe.x, foe.y);
        if (fd > 1.1) {
          WS.AI.moveTowards(e, foe.x, foe.y, e.speed * 1.25, dt);
        } else if (e.atkCd <= 0) {
          e.atkCd = 1.1;
          // удар прикладом (ружья нет — кулаки и подсечка)
          WS.AI.damageEntity(foe, 8 + Math.random() * 5, e);
          snd('hit', e.x, e.y, 0.5);
          if (WS.Fx && WS.Fx.burst) {
            try { WS.Fx.burst('blood', foe.x, foe.y, 4); } catch (er) { /* пусто */ }
          }
          // ответка: зверь огрызается
          if (Math.random() < 0.5) {
            e.hp = Math.max(0, e.hp - (3 + Math.random() * 4));
            if (e.hp <= 0) { fedorDies('полег в бою, прикрывая вас'); return; }
          }
        }
        WS.AI.anim(e, dt, 5);
        return;
      }

      // за спиной игрока, в полушаге
      var d = WS.M.dist(e.x, e.y, p.x, p.y);
      if (d > 2.6) {
        WS.AI.moveTowards(e, p.x - 0.8, p.y + 0.6, e.speed, dt);
        WS.AI.anim(e, dt, 5);
      } else if (d > 9) {
        // отстал сильно — догоняет бегом
        WS.AI.moveTowards(e, p.x, p.y, e.speed * 1.6, dt);
        WS.AI.anim(e, dt, 6);
      }
      return;
    }
  }

  /** Смерть Фёдора: хроника и удар по рассудку. */
  function fedorDies(why) {
    var e = st.fedor;
    if (!e || e.dead) return;
    e.dead = true;
    fs('wr_fedor_dead', 1);
    fs('wr_fedor', 'dead');
    if (e && WS.World && WS.World.removeEnt) {
      try { WS.World.removeEnt(e); } catch (er) { /* пусто */ }
    }
    st.fedor = null;
    addSanity(-10);
    chron('Беглый солдат Фёдор погиб — ' + (why || 'зима добрала его') + '.', 'death');
    toast('Фёдор погиб. «Дослужился», — как он сам бы сказал.', 'bad');
    snd('death', undefined, undefined, 0.4);
  }

  // ====================================================================
  //  ПОВЕДЕНИЕ: ВИШНЯ
  // ====================================================================

  function updateHorse(e, dt, R) {
    e.moving = false;
    var p = P();
    var mode = fg('wr_vishnya') || 'pen';

    // идёт за игроком (или за Семёном, пока не сдан квест)
    if (mode === 'follow' || mode === 'handed') {
      if (p) {
        var d = WS.M.dist(e.x, e.y, p.x, p.y);
        if (d > 2.4) {
          WS.AI.moveTowards(e, p.x - 1.2, p.y + 0.8, e.speed, dt);
          WS.AI.anim(e, dt, 4);
        } else if (d > 12) {
          // не отставать: переношу поближе (сани тяжелы)
          e.x = p.x + 1.5; e.y = p.y + 1;
        }
        return;
      }
    }

    // в загоне: тычется мордой в сено, обходит круг
    WS.AI.wanderInArea(e, e.home.x, e.home.y, 1.6, dt, e.speed * 0.25);
    WS.AI.anim(e, dt, 2);
  }

  // ====================================================================
  //  ВЗАИМОДЕЙСТВИЯ: [E] — разговоры (деревья в content/dialogues.js)
  // ====================================================================

  /** NPC-описание для движка диалогов (дерево возьмёт из WS.Dialogues). */
  function npcFor(id) {
    var base = {
      semen: {
        name: 'Семён, конюх',
        sprName: 'npc_semen',
        sprFrame: 2,
        portraitFrames: [2, 0],
        repId: 'semen',
        cap: 'конюх · пережил свою конюшню'
      },
      matrena: {
        name: 'Бабка Матрёна',
        sprName: 'npc_matrena',
        sprFrame: 0,
        portraitFrames: [0, 1],
        repId: 'matrena',
        cap: 'травница · всех пережила'
      },
      fedor: {
        name: 'Фёдор',
        sprName: 'npc_fedor',
        sprFrame: 0,
        portraitFrames: [0, 1],
        repId: 'fedor',
        cap: 'беглый солдат · без оружия'
      },
      horse: {
        name: 'Вишня',
        sprName: 'wr_horse',
        sprFrame: 0,
        portraitFrames: [0, 1],
        repId: 'vishnya',
        cap: 'кобыла · гнедая, со звёздочкой',
        optsHint: false
      }
    };
    var o = base[id];
    if (!o) return null;
    o.id = id;
    // дерево — из модуля диалогов; там же все условия и действия
    if (WS.Dialogues && WS.Dialogues.npc) {
      o.tree = WS.Dialogues.npc(id);
    } else {
      // страховка: модуль деревьев не загрузился — короткий монолог
      o.tree = {
        start: 'a',
        nodes: { a: { text: '…', options: [{ txt: 'Уйти', end: true }] } }
      };
    }
    return o;
  }

  /** Открыть разговор (или подсказать, что из себя NPC представляет). */
  function talkTo(id) {
    var npc = npcFor(id);
    if (!npc) return false;
    try {
      return WS.Dialog.start(npc);
    } catch (e) {
      WS.err('wanderers: диалог ' + id + ' не открылся:', e && e.message);
      return false;
    }
  }

  /** Чужой интерактив рядом не занят? */
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

  /** Подсказка Ui.hint. */
  function hint(text) {
    if (WS.Ui && WS.Ui.hint) {
      try { WS.Ui.hint(text); } catch (e) { /* пусто */ }
    }
  }

  /**
   * Главный тик взаимодействий (приоритет 61 — перед hermit:62 и
   * story:63, чтобы наши реплики не перебивались их окнами).
   */
  function interactTick(dt) {
    var g = G();
    if (!g || !g.running || g.dead) return;
    if (WS.Ui && WS.Ui.modal && WS.Ui.modal()) return;
    var p = P();
    if (!p || p.sleeping) return;

    // Семён
    if (aliveEnt(st.semen)) {
      var e = st.semen;
      if (playerDist(e.x, e.y) <= TALK_R && noOtherInteract()) {
        hint(e.state === 'hide' ? 'Прислушаться: за поленницей кто-то есть' : 'Поговорить с конюхом');
        if (hitInteract()) talkTo('semen');
        return;
      }
    }
    // Матрёна
    if (aliveEnt(st.matrena)) {
      var m = st.matrena;
      if (playerDist(m.x, m.y) <= TALK_R && noOtherInteract()) {
        hint('Поговорить с бабкой Матрёной');
        if (hitInteract()) talkTo('matrena');
        return;
      }
    }
    // Фёдор
    if (aliveEnt(st.fedor)) {
      var f = st.fedor;
      if (playerDist(f.x, f.y) <= TALK_R + 0.3 && noOtherInteract()) {
        hint(f.state === 'lost' ? 'Человек замерзает. Поговорить' :
             (f.state === 'ally' ? 'Слово с Фёдором' : 'Поговорить с солдатом'));
        if (hitInteract()) talkTo('fedor');
        return;
      }
    }
    // Вишня
    if (aliveEnt(st.horse)) {
      var h = st.horse;
      if (playerDist(h.x, h.y) <= 2.2 && noOtherInteract()) {
        hint('Кобыла Вишня');
        if (hitInteract()) talkTo('horse');
        return;
      }
    }
  }

  // ====================================================================
  //  ЛОГИКА КВЕСТА «ВИШНЯ»
  // ====================================================================

  /** Семён вышел к людям (три подарка еды или доверие 3+). */
  function semenComeOut() {
    if (fg('wr_semen_out')) return true;
    fs('wr_semen_out', 1);
    fs('wr_semen_out_day', day());
    var e = st.semen;
    if (e) {
      e.state = 'idle';
      e.speed = 1.0;
    }
    toast('Семён решился: вышел из-за поленницы, отряхивает солому с тулупа.', 'good');
    chron('Конюх Семён перестал прятаться. В конюшне — живой человек.', 'find');
    snd('levelup', undefined, undefined, 0.4);
    return true;
  }

  /** Сколько раз приносили еду прячущемуся Семёну. */
  function semenGifts() { return fg('wr_semen_gifts') || 0; }

  /** Принести еду прячущемуся Семёну (действие из диалога). */
  function giveSemenFood() {
    var food = null;
    var foods = ['bread', 'rusk', 'kasha', 'meat_cooked', 'canned_fish',
                 'galley_biscuits', 'dried_fish', 'salt_fish'];
    for (var i = 0; i < foods.length; i++) {
      if (invCount(foods[i]) > 0) { food = foods[i]; break; }
    }
    if (!food) return 'semen_gift_nofood';
    if (invConsume(food, 1) < 1) return 'semen_gift_nofood';
    var n = semenGifts() + 1;
    fs('wr_semen_gifts', n);
    repAdd('semen', 1, 'Еда для конюха.');
    snd('eat', undefined, undefined, 0.4);
    chron('Оставил еду прячущемуся в конюшне человеку (' + n + ').', '');
    if (n >= SEMEN_GIFTS) {
      semenComeOut();
      return 'semen_gift_third';
    }
    if (n === 2) return 'semen_gift_second';
    return 'semen_gift_first';
  }

  /** Начать квест «Вишня»: показать загон у мельницы. */
  function startMareQuest() {
    if (fg('wr_mare_q')) return 'semen_mare_known';
    fs('wr_mare_q', 1);
    buildHorsePen();
    spawnHorse();
    if (WS.Quests && WS.Quests.start) {
      try { WS.Quests.start('semen_mare'); } catch (e) { /* пусто */ }
    }
    return 'semen_mare_told';
  }

  /** Игрок позвал Вишню с собой (действие из диалога с лошадью). */
  function leadHorse() {
    if (!aliveEnt(st.horse)) return 'horse_none';
    var mode = fg('wr_vishnya') || 'pen';
    if (mode === 'pen') {
      fs('wr_vishnya', 'follow');
      st.horse.state = 'follow';
      toast('Вишня тянется к рукам и идёт следом. Копыта звенят по насту.', 'good');
      chron('Взял кобылу Вишню из загона у мельницы.', 'find');
      snd('select', undefined, undefined, 0.5);
      return 'horse_follow';
    }
    return 'horse_already';
  }

  /** Вишня рядом с Семёном (сдача квеста)? */
  function horseNearSemen() {
    if (!aliveEnt(st.horse) || !aliveEnt(st.semen)) return false;
    return WS.M.dist(st.horse.x, st.horse.y, st.semen.x, st.semen.y) < 6;
  }

  /** Награда Семёна: сани (переноска веса x2) и молоко. */
  function rewardSemen() {
    if (fg('wr_semen_rewarded')) return 'semen_reward_again';
    if (!horseNearSemen()) return 'semen_reward_far';
    fs('wr_semen_rewarded', 1);
    fs('wr_vishnya', 'handed');
    if (aliveEnt(st.horse)) st.horse.state = 'handed';
    invGive('sledge', 1);
    invGive('milk_bottle', 2);
    repAdd('semen', 3, 'Вишня вернулась к конюху.');
    if (WS.Quests && WS.Quests.complete) {
      try { WS.Quests.complete('semen_mare'); } catch (e) { /* пусто */ }
    }
    chron('Семён запряг Вишню: сани, молоко и низкий поклон.', 'find');
    toast('Получено: сани (переносимый вес вдвое больше) и молоко.', 'good');
    snd('levelup', undefined, undefined, 0.5);
    return 'semen_reward_done';
  }

  /** Уйти на восток всей семьёй (финал «Семья»). */
  function leaveEast() {
    if (WS.Endings && WS.Endings.trigger) {
      try { WS.Endings.trigger('family'); } catch (e) { /* пусто */ }
    }
    return null;
  }

  // ====================================================================
  //  ЛОГИКА ФЁДОРА: спасти, обучить, взять в товарищи
  // ====================================================================

  /** Накормить замерзающего. */
  function fedorFeed() {
    var food = null;
    var foods = ['bread', 'rusk', 'kasha', 'meat_cooked', 'canned_fish',
                 'galley_biscuits', 'dried_fish'];
    for (var i = 0; i < foods.length; i++) {
      if (invCount(foods[i]) > 0) { food = foods[i]; break; }
    }
    if (!food) return 'fedor_nofood';
    if (invConsume(food, 1) < 1) return 'fedor_nofood';
    fs('wr_fedor_fed', 1);
    repAdd('fedor', 1, 'Накормил солдата.');
    snd('eat', undefined, undefined, 0.5);
    chron('Накормил беглого солдата. Он ел, не разжимая зубы.', '');
    return 'fedor_fed';
  }

  /** Есть ли огонь поблизости от Фёдора (свой костёр или костёр игрока). */
  function fireNearFedor() {
    var f = st.fedor;
    if (!f) return false;
    if (fg('wr_fedor_fire_x')) {
      var fx = fg('wr_fedor_fire_x'), fy = fg('wr_fedor_fire_y');
      if (WS.M.dist(fx, fy, f.x, f.y) < 8) return true;
    }
    if (WS.AI && WS.AI.fireNear) {
      try { return !!WS.AI.fireNear(f.x, f.y, 5); } catch (e) { return false; }
    }
    return false;
  }

  /** Развести костёр прямо подле Фёдора (действие из диалога). */
  function fedorMakeFire() {
    var f = st.fedor;
    if (!f) return 'fedor_warm_fail';
    if (WS.Fire && WS.Fire.lightCampfire) {
      var near = { x: Math.floor(f.x) + 1, y: Math.floor(f.y) + 1 };
      var res = null;
      try { res = WS.Fire.lightCampfire(near.x + 0.5, near.y + 0.5); } catch (e) { res = null; }
      if (res && res.ok) {
        fs('wr_fedor_fire_x', near.x + 0.5);
        fs('wr_fedor_fire_y', near.y + 0.5);
        return fedorWarm();
      }
      return 'fedor_warm_fail';
    }
    return 'fedor_warm_fail';
  }

  /** Отогрелся — спасён. */
  function fedorWarm() {
    var f = st.fedor;
    if (!f) return 'fedor_warm_fail';
    if (fg('wr_fedor') === 'saved' || f.state === 'camp') return 'fedor_saved_already';
    fs('wr_fedor', 'saved');
    f.state = 'camp';
    f.speed = 1.15;
    f.hp = Math.max(f.hp, 50);
    repAdd('fedor', 2, 'Спас солдата от стужи.');
    addSanity(8);
    toast('Фёдор отогрелся. Щёки порозовели, руки слушаются.', 'good');
    chron('Беглый солдат Фёдор спасён: еда и огонь сделали своё.', 'find');
    snd('craft', undefined, undefined, 0.5);
    return 'fedor_saved';
  }

  /** Урок стрельбы (один раз). */
  function fedorTeach() {
    if (fg('wr_fedor_taught')) return 'fedor_taught_already';
    fs('wr_fedor_taught', 1);
    teachLevel('firearm', 'наука Фёдора: винтовка');
    return 'fedor_taught';
  }

  /** Позвать с собой (союзник). */
  function fedorAlly() {
    var f = st.fedor;
    if (!f) return 'fedor_ally_fail';
    fs('wr_fedor', 'ally');
    f.state = 'ally';
    f.speed = 1.9;
    repAdd('fedor', 1, 'Взял солдата в товарищи.');
    toast('Фёдор поправляет подсумок и идёт за вами. «Вдвоём — не пропадём».', 'good');
    chron('Фёдор пошёл со мной. Теперь нас двое.', 'find');
    snd('levelup', undefined, undefined, 0.4);
    return 'fedor_ally';
  }

  /** Перевязать Фёдора. */
  function fedorHeal() {
    var f = st.fedor;
    if (!f) return null;
    var used = invCount('bandage_clean') > 0 ? 'bandage_clean' :
               (invCount('bandage') > 0 ? 'bandage' : null);
    if (!used) return 'fedor_heal_noband';
    invConsume(used, 1);
    f.hp = Math.min(f.maxHp, f.hp + 30);
    repAdd('fedor', 1, 'Перевязал солдата.');
    snd('craft', undefined, undefined, 0.4);
    return 'fedor_healed';
  }

  // ====================================================================
  //  КВЕСТ В ЖУРНАЛЕ: «ВИШНЯ» (WS.Quests)
  // ====================================================================

  function defMareQuest() {
    if (!WS.Quests || !WS.Quests.def) return;
    WS.Quests.def({
      id: 'semen_mare',
      title: 'Вишня',
      desc: 'Конюх Семён просит спасти его кобылу: единственную живую ' +
            'лошадь на весь посёлок держат в загоне у старой мельницы-пилорамы, ' +
            'у самой воды. Приведите Вишню к конюшне — и Семён даст сани.',
      reward: 'Сани (переносимый вес вдвое больше), молоко, друг на четыре ноги',
      steps: [
        { id: 'talk', text: 'Разговорить конюха Семёна', done: function () {
            return !!fg('wr_semen_out');
          }, silent: true },
        { id: 'pen', text: 'Отыскать загон у мельницы', done: function () {
            var mode = fg('wr_vishnya') || 'pen';
            if (mode !== 'pen') return true;
            var px = fg('wr_pen_x'), py = fg('wr_pen_y');
            if (typeof px !== 'number') return false;
            return playerDist(px + PEN_W / 2, py + PEN_H / 2) < 9;
          } },
        { id: 'lead', text: 'Привести Вишню к Семёну', done: function () {
            return horseNearSemen() || !!fg('wr_semen_rewarded');
          } },
        { id: 'done', text: 'Получить сани', done: function () {
            return !!fg('wr_semen_rewarded');
          }, silent: true }
      ],
      onComplete: function () {
        chron('Вишня снова при конюхе. Сани скрипят по снегу — по-хорошему.', 'find');
      },
      onFail: function () {
        chron('Вишня погибла. Конюх осел в конюшне молча.', 'death');
      }
    });
  }

  // ====================================================================
  //  СОБЫТИЯ ДНЕЙ: беды, спавны, провалы
  // ====================================================================

  function onDay(d0) {
    var g = G();
    if (!g || !g.running || g.dead) return;
    var d = (d0 && d0.day) ? d0.day : day();

    // --- Семён заводится с 5-го дня ---
    if (d >= SEMEN_DAY && !aliveEnt(st.semen) && !fg('wr_semen_dead')) {
      spawnSemen();
      if (st.semen) {
        toast('В конюшне на восточной стороне — шорох и кашель. Кто-то живой.', 'info');
        chron('В конюшне кто-то прячется. Дышит — значит, живой.', 'anom');
      }
    }

    // --- Семён без помощи может не дожить до весны ---
    if (d >= SEMEN_DANGER_DAY && !fg('wr_semen_dead') && !isSemenOut() &&
        fg('wr_semen_gifts') === undefined) {
      var R = dayRNG(0x5EED);
      if (R.chance(SEMEN_DANGER_P)) {
        var e = st.semen;
        fs('wr_semen_dead', 1);
        if (e) {
          if (WS.World && WS.World.removeEnt) {
            try { WS.World.removeEnt(e); } catch (er) { /* пусто */ }
          }
          st.semen = null;
        }
        addSanity(-5);
        toast('В конюшне тихо. Семён замерз за поленницей, так и не выйдя к людям.', 'bad');
        chron('Конюх Семён погиб: мороз и волки добрали его в конюшне.', 'death');
        snd('bell', undefined, undefined, 0.25);
      }
    }

    // --- Фёдор выходит на дорогу ---
    if (d >= FEDOR_DAY && !aliveEnt(st.fedor) && !fg('wr_fedor_dead') &&
        fg('wr_fedor') !== 'gone' && !fg('wr_fedor_day')) {
      fs('wr_fedor', 'lost');
      var f = spawnFedor();
      if (f) {
        toast('На тракте бредёт человек. Шинель без ремня, в руках — ничего.', 'warn');
        chron('На дороге — беглый солдат. Замерзает.', 'anom');
      }
    }

    // --- Фёдор не дождался помощи ---
    if (aliveEnt(st.fedor) && st.fedor.state === 'lost') {
      var spawnDay = fg('wr_fedor_day') || FEDOR_DAY;
      if (d - spawnDay >= FEDOR_DIE_DAYS) {
        var f2 = st.fedor;
        fs('wr_fedor_dead', 1);
        fs('wr_fedor', 'dead');
        if (f2 && WS.World && WS.World.removeEnt) {
          try { WS.World.removeEnt(f2); } catch (er2) { /* пусто */ }
        }
        st.fedor = null;
        addSanity(-15);
        toast('Вы больше не встретите его. Замерзший солдат так и стоял у дороги, опершись на веху.', 'bad');
        chron('Беглый солдат умер от стужи: вы прошли мимо.', 'death');
        snd('bell', undefined, undefined, 0.3);
      }
    }
  }

  // ====================================================================
  //  СМЕРТИ СУЩНОСТЕЙ: волки/мороз/игрок
  // ====================================================================

  function onEntKill(d) {
    var e = d && d.ent;
    if (!e) return;
    var byPlayer = !!(d.by && (d.by.kind === 'player' || d.by.id === 'player'));

    if (e.kind === 'semen') {
      fs('wr_semen_dead', 1);
      st.semen = null;
      addSanity(byPlayer ? -15 : -8);
      chron('Конюх Семён погиб. ' + (byPlayer ? 'От вашей руки.' : 'Зима забрала и его.'), 'death');
      toast('Семён погиб. Конюшня теперь совсем пустая.', 'bad');
      if (WS.Quests && WS.Quests.state && WS.Quests.state('semen_mare') === 'active') {
        try { WS.Quests.fail('semen_mare', 'конюха больше нет'); } catch (er) { /* пусто */ }
      }
    }

    if (e.kind === 'matrena') {
      fs('wr_matrena_dead', 1);
      st.matrena = null;
      addSanity(byPlayer ? -15 : -8);
      chron('Бабка Матрёна погибла. ' + (byPlayer ? 'От вашей руки.' : 'Тише стало на отшибе.'), 'death');
      toast('Матрёна погибла. Изба травницы стоит без дыма.', 'bad');
    }

    if (e.kind === 'fedor') {
      fedorDies(byPlayer ? 'ваша пуля нашла его' : 'зима добрала его');
    }

    if (e.kind === 'wr_horse') {
      fs('wr_vishnya_dead', 1);
      st.horse = null;
      addSanity(-8);
      chron('Кобыла Вишня погибла. ' + (byPlayer ? 'Что ж ты наделал.' : 'Волки? Мороз? Теперь неважно.'), 'death');
      toast('Вишня погибла. Сани будут пылиться без лошади.', 'bad');
      if (WS.Quests && WS.Quests.state && WS.Quests.state('semen_mare') === 'active') {
        try { WS.Quests.fail('semen_mare', 'кобылы больше нет'); } catch (er2) { /* пусто */ }
      }
    }
  }

  // ====================================================================
  //  ГЕНЕРАЦИЯ МИРА / ЗАГРУЗКА / НОВАЯ ПАРТИЯ
  // ====================================================================

  function onGenInteriors() {
    try {
      st.semen = null;
      st.matrena = null;
      st.fedor = null;
      st.horse = null;
      st.builtIzba = false;
      st.builtPen = false;

      buildMatrenaHut();
      if (day() >= SEMEN_DAY) spawnSemen();
      spawnMatrena();
      if (fg('wr_mare_q')) {
        buildHorsePen();
        spawnHorse();
      }
      if (fg('wr_fedor') && !fg('wr_fedor_dead')) spawnFedor();
      if (WS.Gfx && WS.Gfx.dirty) WS.Gfx.dirty();
    } catch (e) {
      WS.err('wanderers: gen:', e && e.message);
    }
  }

  function onGameLoad() {
    // мир уже пересобран gen-обработчиком: поправим живые состояния
    try {
      if (aliveEnt(st.semen)) st.semen.state = isSemenOut() ? 'idle' : 'hide';
      if (aliveEnt(st.fedor)) {
        st.fedor.state = fg('wr_fedor') === 'ally' ? 'ally' :
          (fg('wr_fedor') === 'saved' ? 'camp' : 'lost');
      }
    } catch (e) {
      WS.err('wanderers: load:', e && e.message);
    }
  }

  function onGameStart() {
    // новая партия: живое состояние чисто, флаги обнулены ядром
    st.semen = null;
    st.matrena = null;
    st.fedor = null;
    st.horse = null;
  }

  // ====================================================================
  //  ПУБЛИЧНЫЙ API МОДУЛЯ
  // ====================================================================

  var Wanderers = {
    /** Жив ли NPC ('semen'|'matrena'|'fedor'|'horse'). */
    alive: function (id) {
      if (id === 'horse') return aliveEnt(st.horse);
      if (id === 'semen') return aliveEnt(st.semen);
      if (id === 'matrena') return aliveEnt(st.matrena);
      if (id === 'fedor') return aliveEnt(st.fedor);
      return false;
    },

    /** Сущность NPC (или null). */
    ent: function (id) {
      if (id === 'horse') return aliveEnt(st.horse) ? st.horse : null;
      if (id === 'semen') return aliveEnt(st.semen) ? st.semen : null;
      if (id === 'matrena') return aliveEnt(st.matrena) ? st.matrena : null;
      if (id === 'fedor') return aliveEnt(st.fedor) ? st.fedor : null;
      return null;
    },

    /** Открыть разговор напрямую (для тестов/соседей). */
    talk: talkTo,

    // ---- Семён и Вишня ----
    semenOut: isSemenOut,
    semenGifts: semenGifts,
    giveSemenFood: giveSemenFood,
    startMareQuest: startMareQuest,
    leadHorse: leadHorse,
    horseNearSemen: horseNearSemen,
    rewardSemen: rewardSemen,
    leaveEast: leaveEast,
    pen: function () { return st.pen ? { x: st.pen.x, y: st.pen.y } : null; },

    // ---- Матрёна ----
    matrenaHut: function () {
      return st.hut ? { x: st.hut.x, y: st.hut.y, w: st.hut.w, h: st.hut.h } : null;
    },

    // ---- Фёдор ----
    fedorFeed: fedorFeed,
    fedorMakeFire: fedorMakeFire,
    fedorWarm: fedorWarm,
    fedorTeach: fedorTeach,
    fedorAlly: fedorAlly,
    fedorHeal: fedorHeal,
    fireNearFedor: fireNearFedor,

    /** Общий подъём навыка (для dialogues.js). */
    teachLevel: teachLevel,

    selftest: selftest
  };

  /** Самотест (консоль): спрайты, квест, безопасность без партии. */
  function selftest() {
    var out = [];
    var ok = function (name, cond) {
      out.push((cond ? '  ok  ' : ' FAIL ') + name);
      return !!cond;
    };
    ok('спрайты объявлены', !!(WS.Spr.specs && WS.Spr.specs().npc_semen &&
      WS.Spr.specs().npc_matrena && WS.Spr.specs().npc_fedor &&
      WS.Spr.specs().wr_horse && WS.Spr.specs().wr_beds));
    ok('отвары объявлены', !!(WS.Data && WS.Data.items &&
      WS.Data.items.wr_decoction_angelica && WS.Data.items.wr_decoction_chaga &&
      WS.Data.items.wr_decoction_stonewort && WS.Data.items.wr_stonewort));
    ok('квест «Вишня» в реестре', !!(WS.Quests && WS.Quests.byId &&
      (function () { try { return !!WS.Quests.byId('semen_mare'); } catch (e) { return false; } })()));
    ok('npc() даёт дерево', !!(WS.Dialogues && WS.Dialogues.npc &&
      (function () { try { return !!WS.Dialogues.npc('semen'); } catch (e) { return false; } })()));
    ok('alive без партии не падает', (function () {
      try { Wanderers.alive('semen'); return true; } catch (e) { return false; }
    })());
    ok('изба Матрёны — это здание', (function () {
      var w = WS.World;
      if (!w || !w.buildings) return false;
      for (var i = 0; i < w.buildings.length; i++) {
        if (w.buildings[i] && w.buildings[i].type === 'matrena_hut') return true;
      }
      return false;
    })());
    out.unshift('wanderers.selftest: пройдено');
    return out;
  }

  // ====================================================================
  //  BOOT
  // ====================================================================

  WS.boot(function initWanderers() {
    defSprites();
    declareData();
    defMareQuest();

    // поведение в реестре ИИ
    if (WS.AI && WS.AI.register) {
      WS.AI.register('semen', updateSemen);
      WS.AI.register('matrena', updateMatrena);
      WS.AI.register('fedor', updateFedor);
      WS.AI.register('wr_horse', updateHorse);
    } else {
      WS.warn('wanderers: нет WS.AI — выжившие стоят столбами');
    }

    // генерация мира: изба и загон ставятся по 'gen:interiors'
    WS.Ev.on('gen:interiors', onGenInteriors);

    // смерти сущностей
    WS.Ev.on('ent:kill', onEntKill);

    // тик взаимодействий: [E] около выживших
    WS.tick(TICK_PRI, interactTick, 'wanderers:talk');

    // события времени и партии
    WS.Ev.on('time:day', onDay);
    WS.Ev.on('game:load', onGameLoad);
    WS.Ev.on('game:start', onGameStart);

    WS.log('[Wanderers] выжившие готовы: конюх, травница, дезертир и кобыла');
  }, 'wanderers:init');

  WS.def('Wanderers', Wanderers);
})();
