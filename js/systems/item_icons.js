/**
 * item_icons.js — УНИКАЛЬНЫЕ ЗНАЧКИ ПРЕДМЕТОВ.
 *
 * ЗАЧЕМ: пользователь просил, «чтобы у всех предметов были свои значки
 * разные и дизайн» — раньше все предметы одной категории делили одну
 * картинку (icon_food, icon_tool...). Теперь КАЖДЫЙ из 437 предметов
 * получает собственный значок: узнаваемый силуэт по семейству
 * (хлеб — буханка, рыба — рыба, валенки — валенок...) + детерминированный
 * оттенок/акценты из хэша id — двух одинаковых не существует.
 *
 * КАК: значки рисуются процедурно на canvas 24×24 и отдаются как dataURL
 * (кэш). Семейства — по регуляркам на id, реликвии и знаковые предметы —
 * индивидуальные рисунки. Фолбэк: силуэт категории + уникальный узор.
 *
 * Используют: inventory_screen, container_screen, craft_screen, tooltips.
 * Автор игры: DirtyG.
 */
(function () {
  'use strict';

  var SZ = 24;                    // размер значка
  var urlCache = {};              // "id|size" -> dataURL

  // ====================================================================
  //  ПРИМИТИВЫ РИСОВАНИЯ (c — 2d-контекст)
  // ====================================================================

  function R(c, x, y, w, h, col) { c.fillStyle = col; c.fillRect(x, y, w, h); }
  function E(c, cx, cy, rx, ry, col) {
    c.fillStyle = col; c.beginPath();
    c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); c.fill();
  }
  function C(c, cx, cy, r, col) { E(c, cx, cy, r, r, col); }
  function L(c, x1, y1, x2, y2, col, w) {
    c.strokeStyle = col; c.lineWidth = w || 1.4; c.lineCap = 'round';
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
  }
  function TRI(c, x1, y1, x2, y2, x3, y3, col) {
    c.fillStyle = col; c.beginPath();
    c.moveTo(x1, y1); c.lineTo(x2, y2); c.lineTo(x3, y3);
    c.closePath(); c.fill();
  }
  /** Скруглённый прямоугольник. */
  function RR(c, x, y, w, h, r, col) {
    c.fillStyle = col; c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath(); c.fill();
  }

  /** Детерминированный хэш id -> целое. */
  function hash(s) {
    var h = 2166136261;
    s = String(s);
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h * 16777619) | 0;
    }
    return (h >>> 0);
  }
  function hsl(h, s, l) { return 'hsl(' + (h % 360) + ',' + s + '%,' + l + '%)'; }
  /** Тень-подложка под предметом. */
  function shadow(c) { E(c, 12, 21.4, 8.6, 2.1, 'rgba(0,0,0,0.28)'); }
  /** Блик-точка (свет). */
  function glint(c, x, y) { C(c, x, y, 1.1, 'rgba(255,255,255,0.65)'); }

  // ====================================================================
  //  СЕМЕЙСТВА ЗНАЧКОВ
  //  Каждый рисует по id и h (хэш) — оттенок варьируется, силуэт общий.
  // ====================================================================

  var WOOD = '#8a5a2b', WOOD_D = '#6b4420', STEEL = '#b9c2cc', STEEL_D = '#7d8896',
      IRON = '#8d949c', GOLD = '#d9a441', SILVER = '#cdd6de', DARK = '#2a3138';

  // ---- выпечка и мучное ----------------------------------------------

  function dLoaf(c, h) {           // буханка хлеба
    shadow(c);
    var col = hsl(28, 45, 38 + (h % 12));
    RR(c, 4, 8, 16, 9, 3.5, col);
    RR(c, 4, 8, 16, 3.5, 2, hsl(30, 50, 50 + (h % 14)));
    L(c, 8, 10.5, 8, 14, 'rgba(0,0,0,0.35)', 1.1);
    L(c, 12, 10.5, 12, 14, 'rgba(0,0,0,0.35)', 1.1);
    L(c, 16, 10.5, 16, 14, 'rgba(0,0,0,0.35)', 1.1);
    glint(c, 7, 10);
  }
  function dRoundLoaf(c, h) {      // каравай
    shadow(c);
    E(c, 12, 13, 8.4, 6, hsl(30, 46, 40));
    E(c, 12, 11.4, 6.4, 3.4, hsl(32, 52, 52));
    C(c, 12, 11.4, 1.5, hsl(35, 55, 62));
    glint(c, 9, 10);
  }
  function dBaranka(c, h) {        // баранка/сушка
    shadow(c);
    var col = hsl(33, 48, 46 + (h % 10));
    c.strokeStyle = col; c.lineWidth = 3.4;
    c.beginPath(); c.ellipse(12, 12, 7, 6, 0, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = hsl(36, 55, 60); c.lineWidth = 1.1;
    c.beginPath(); c.ellipse(12, 12, 7, 6, 0, 0, Math.PI * 2); c.stroke();
  }
  function dPryanik(c, h) {        // пряник
    shadow(c);
    RR(c, 4.5, 7, 15, 11, 2.5, hsl(26, 42, 34 + (h % 10)));
    // глазурь-завитушки
    L(c, 7, 10, 17, 10, 'rgba(255,246,214,0.8)', 1);
    L(c, 7, 13, 17, 13, 'rgba(255,246,214,0.8)', 1);
    C(c, 9, 16, 1, '#f2dfae'); C(c, 13, 16, 1, '#f2dfae'); C(c, 17, 16, 1, '#f2dfae');
  }
  function dBlin(c, h) {           // стопка блинов
    shadow(c);
    var col = hsl(38, 55, 52 + (h % 10));
    E(c, 12, 16.5, 8.5, 2.6, hsl(30, 40, 30));
    E(c, 12, 14, 8, 2.6, col);
    E(c, 12, 11.5, 8, 2.6, hsl(40, 60, 58));
    E(c, 12, 9, 8, 2.6, col);
    E(c, 12, 6.8, 7, 2.2, hsl(42, 62, 62));
    C(c, 12, 6.6, 1.2, '#c9562f');
  }
  function dPirog(c, h) {          // пирог/пирожок
    shadow(c);
    TRI(c, 4, 15, 12, 6, 20, 15, hsl(30, 44, 42 + (h % 10)));
    RR(c, 4, 14, 16, 4.5, 2, hsl(28, 40, 34));
    C(c, 9, 12, 1.1, '#e8d9a0'); C(c, 12, 10.5, 1.1, '#e8d9a0'); C(c, 15, 12, 1.1, '#e8d9a0');
    glint(c, 10, 8);
  }
  function dKulich(c, h) {         // кулич
    shadow(c);
    RR(c, 7.5, 7, 9, 13, 1.5, hsl(35, 46, 42));
    E(c, 12, 7, 4.5, 2.6, '#f4f0e4');
    C(c, 12, 5.8, 1.2, '#d94f4f');
    L(c, 10, 9.5, 10, 13, 'rgba(0,0,0,0.25)', 0.9);
    L(c, 14, 9.5, 14, 13, 'rgba(0,0,0,0.25)', 0.9);
  }
  function dCakeSlice(c, h) {      // торт/медовик — кусок
    shadow(c);
    var base = hsl((20 + h % 40), 45, 42);
    TRI(c, 5, 17, 12, 7, 19, 17, base);
    L(c, 7.5, 13.6, 16.5, 13.6, '#f2e6c8', 1.3);
    L(c, 6.2, 15.4, 17.8, 15.4, '#f2e6c8', 1.3);
    C(c, 12, 8.6, 1.2, '#e8c86a');
  }

  // ---- каши и супы (миска) -------------------------------------------

  function dBowl(c, h, col) {
    shadow(c);
    // пар
    L(c, 9, 4.5, 8.4, 2.5, 'rgba(220,230,240,0.5)', 1);
    L(c, 12.5, 4, 12.5, 1.8, 'rgba(220,230,240,0.5)', 1);
    L(c, 16, 4.5, 16.6, 2.5, 'rgba(220,230,240,0.5)', 1);
    // содержимое
    E(c, 12, 11, 8, 2.8, col || hsl(40, 50, 46));
    // миска
    c.fillStyle = '#cfd6dd';
    c.beginPath();
    c.moveTo(4, 11); c.lineTo(20, 11);
    c.quadraticCurveTo(18.5, 18.5, 12, 18.5);
    c.quadraticCurveTo(5.5, 18.5, 4, 11);
    c.closePath(); c.fill();
    R(c, 4, 10.4, 16, 1.6, '#aab4be');
    // крупинки/зелень
    C(c, 9, 10.6, 0.8, 'rgba(255,255,255,0.55)');
    C(c, 13.5, 10.2, 0.8, 'rgba(90,120,60,0.7)');
    C(c, 16, 11, 0.7, 'rgba(255,255,255,0.5)');
  }

  // ---- рыба и мясо -----------------------------------------------------

  function dFish(c, h) {
    shadow(c);
    var col = hsl(200 + (h % 40), 34, 52);
    E(c, 11, 12, 6.4, 3.4, col);
    TRI(c, 16.4, 12, 21, 8.6, 21, 15.4, hsl(200 + (h % 40), 30, 42));
    TRI(c, 9, 8.8, 11, 6.6, 12.4, 8.8, col);
    C(c, 7, 11.2, 0.9, DARK);
    L(c, 9.5, 12, 14, 12, 'rgba(0,0,0,0.2)', 0.8);
    glint(c, 10, 10.4);
  }
  function dMeat(c, h) {
    shadow(c);
    var col = hsl(6 + (h % 14), 55, 46);
    E(c, 11, 12.5, 7, 4.6, col);
    E(c, 11, 12.5, 7, 4.6, col);
    // жила
    L(c, 7, 11, 15, 14, 'rgba(255,255,255,0.35)', 1.2);
    // косточка
    R(c, 16.5, 11.6, 5, 1.8, '#efe9dc');
    C(c, 21, 11.6, 1.3, '#efe9dc'); C(c, 21, 13.4, 1.3, '#efe9dc');
  }
  function dSalo(c, h) {
    shadow(c);
    RR(c, 5, 8.5, 14, 8, 2, '#efe9e0');
    RR(c, 5, 8.5, 14, 3, 2, '#f8f4ec');
    R(c, 7, 13, 2.4, 1.6, 'rgba(255,255,255,0.85)');
    R(c, 12, 12.6, 2.4, 1.6, 'rgba(255,255,255,0.85)');
    R(c, 15, 14, 1.8, 1.4, 'rgba(230,220,205,0.9)');
  }
  function dDrumstick(c, h) {
    shadow(c);
    var col = hsl(28, 50, 44 + (h % 12));
    E(c, 9.5, 10, 5.4, 4.2, col);
    E(c, 12.5, 12.5, 4, 3.2, col);
    L(c, 15.5, 15, 20, 19, '#efe9dc', 2.2);
    C(c, 20.4, 19.4, 1.6, '#efe9dc');
  }
  function dPelmeni(c, h) {
    shadow(c);
    var col = hsl(36, 34, 62 + (h % 12));
    E(c, 8.5, 11, 4, 3, col); E(c, 15.5, 12.5, 4, 3, col); E(c, 11.5, 16, 4, 3, col);
    L(c, 6.5, 9.5, 10.5, 9.5, 'rgba(0,0,0,0.18)', 1);
    L(c, 13.5, 11, 17.5, 11, 'rgba(0,0,0,0.18)', 1);
    L(c, 9.5, 14.5, 13.5, 14.5, 'rgba(0,0,0,0.18)', 1);
  }

  // ---- овощи и грибы ---------------------------------------------------

  function dPotato(c, h) {
    shadow(c);
    E(c, 12, 12.5, 6.6, 5, hsl(38, 32, 44 + (h % 10)));
    C(c, 9.5, 11, 0.7, 'rgba(0,0,0,0.22)');
    C(c, 14, 13.6, 0.7, 'rgba(0,0,0,0.22)');
    C(c, 12.4, 10.2, 0.6, 'rgba(0,0,0,0.22)');
  }
  function dCarrot(c) {
    shadow(c);
    TRI(c, 4.6, 18.6, 17.5, 8.4, 20, 11.4, '#e07830');
    L(c, 6.5, 16.5, 9, 15.2, '#c4651f', 0.9);
    L(c, 9.5, 13.8, 12, 12.6, '#c4651f', 0.9);
    L(c, 16, 9, 15, 5.5, '#4e7a33', 1.4);
    L(c, 17.5, 9.8, 20, 7, '#4e7a33', 1.4);
  }
  function dCabbage(c, h) {
    shadow(c);
    var g = hsl(95 + (h % 20), 38, 42);
    E(c, 12, 12.5, 7, 6, g);
    c.strokeStyle = hsl(95 + (h % 20), 42, 30); c.lineWidth = 1.2;
    c.beginPath(); c.arc(12, 12.5, 4.4, -0.6, 2.2); c.stroke();
    c.beginPath(); c.arc(12, 12.5, 2.6, 2.6, 5.2); c.stroke();
  }
  function dOnion(c) {
    shadow(c);
    E(c, 12, 13, 6, 5.4, '#d8b25f');
    L(c, 12, 7.6, 12, 4.6, '#b98e3e', 1.4);
    L(c, 12, 5.6, 9.6, 3.6, '#8fae5c', 1.2);
    L(c, 12, 5.6, 14.4, 3.6, '#8fae5c', 1.2);
    L(c, 8.4, 11, 15.6, 11, 'rgba(0,0,0,0.15)', 0.8);
  }
  function dBeet(c) {
    shadow(c);
    E(c, 12, 13.4, 6, 5.2, '#7e2b52');
    E(c, 10.6, 12, 2.4, 1.8, '#96395f');
    L(c, 12, 8.4, 12, 5.4, '#4e7a33', 1.6);
    L(c, 12, 6.4, 9, 4.2, '#5c8c3c', 1.3);
    L(c, 12, 6.4, 15, 4.2, '#5c8c3c', 1.3);
  }
  function dTurnip(c) {
    shadow(c);
    E(c, 12, 13.5, 6, 5.4, '#e8ddc0');
    E(c, 10.6, 12.2, 2.2, 1.6, '#f4ecd8');
    L(c, 12, 8.4, 12, 5.8, '#6f9a44', 1.6);
    L(c, 12, 6.6, 9.4, 4.6, '#7fae55', 1.2);
    L(c, 12, 6.6, 14.6, 4.6, '#7fae55', 1.2);
  }
  function dMushroom(c, h) {
    shadow(c);
    var capC = hsl((h % 30), 48, 44);
    R(c, 10.6, 12, 2.8, 7, '#e6dcc4');
    E(c, 12, 11, 7, 4.6, capC);
    E(c, 12, 9.6, 5.2, 2.6, hsl((h % 30), 52, 56));
    C(c, 9, 10.4, 0.9, 'rgba(255,255,255,0.5)');
    C(c, 14.6, 11, 0.7, 'rgba(255,255,255,0.5)');
  }
  function dBerries(c, h) {
    shadow(c);
    var col = hsl((h % 360), 52, 44);
    C(c, 9, 13.5, 3, col); C(c, 14.5, 14, 3, hsl((h % 360), 48, 38));
    C(c, 11.8, 10.2, 3, hsl((h % 360), 55, 50));
    L(c, 11.8, 7.2, 12.6, 4.6, '#4e7a33', 1.3);
    L(c, 11.8, 7.2, 9.4, 5.4, '#5c8c3c', 1.1);
    glint(c, 10.8, 9.2);
  }
  function dAppleDried(c) {        // сухофрукт-колечко
    shadow(c);
    c.strokeStyle = '#a86b3a'; c.lineWidth = 3;
    c.beginPath(); c.ellipse(12, 12.5, 6.4, 5.6, 0, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = '#c4854e'; c.lineWidth = 1;
    c.beginPath(); c.ellipse(12, 12.5, 6.4, 5.6, 0, 0, Math.PI * 2); c.stroke();
  }

  // ---- напитки и молочное ----------------------------------------------

  function dBottle(c, h, liquid) {
    shadow(c);
    R(c, 10, 3.4, 4, 3.4, '#4b3a26');
    RR(c, 8.6, 6.6, 6.8, 3, 1, '#3c2f1f');
    RR(c, 7.4, 9.4, 9.2, 10.8, 2, 'rgba(200,215,230,0.35)');
    R(c, 8.2, 12, 7.6, 7, liquid || hsl(28 + (h % 30), 56, 44));
    R(c, 8.2, 12, 2, 7, 'rgba(255,255,255,0.22)');
  }
  function dCup(c, h, liquid) {
    shadow(c);
    L(c, 9, 5, 8.4, 3, 'rgba(220,230,240,0.5)', 1);
    L(c, 12.5, 4.6, 12.5, 2.4, 'rgba(220,230,240,0.5)', 1);
    L(c, 16, 5, 16.6, 3, 'rgba(220,230,240,0.5)', 1);
    RR(c, 6.4, 7, 11.2, 3, 1.4, liquid || hsl(30 + (h % 30), 52, 42));
    c.fillStyle = '#e8e2d4';
    c.beginPath();
    c.moveTo(6.4, 9.4); c.lineTo(17.6, 9.4);
    c.quadraticCurveTo(16.6, 18.4, 12, 18.4);
    c.quadraticCurveTo(7.4, 18.4, 6.4, 9.4);
    c.closePath(); c.fill();
    R(c, 17.6, 11, 2.6, 1.4, '#e8e2d4');
  }
  function dFlask(c, h) {          // фляга
    shadow(c);
    RR(c, 7, 7.6, 10, 11, 3, hsl(180 + (h % 40), 20, 40));
    RR(c, 9.6, 5, 4.8, 3, 1, '#6b6f74');
    R(c, 9.6, 4.2, 4.8, 1.4, '#4b4f54');
    R(c, 8.4, 12, 3, 4, 'rgba(255,255,255,0.2)');
    glint(c, 10, 10);
  }
  function dEgg(c, h) {
    shadow(c);
    E(c, 12, 12.8, 4.6, 5.8, hsl(42, 34, 82 + (h % 8)));
    E(c, 10.6, 11, 1.6, 2.2, 'rgba(255,255,255,0.6)');
  }
  function dButter(c) {
    shadow(c);
    RR(c, 5.4, 9, 13.2, 8, 1.6, '#f2d95c');
    RR(c, 5.4, 9, 13.2, 2.6, 1.6, '#f8e88a');
    R(c, 8, 12.4, 2.6, 1.2, '#e6c53f');
    R(c, 12.6, 13.6, 2.6, 1.2, '#e6c53f');
  }
  function dCheese(c, h) {         // творог/сметана — горка в миске
    shadow(c);
    E(c, 12, 10.6, 7.4, 3.4, '#f6f2e6');
    E(c, 9.6, 9.6, 2.4, 1.4, '#ffffff');
    c.fillStyle = '#d9d2c0';
    c.beginPath();
    c.moveTo(4.6, 10.6); c.lineTo(19.4, 10.6);
    c.quadraticCurveTo(18, 17.6, 12, 17.6);
    c.quadraticCurveTo(6, 17.6, 4.6, 10.6);
    c.closePath(); c.fill();
  }

  // ---- инструменты -------------------------------------------------------

  function dAxe(c, h) {
    shadow(c);
    L(c, 7, 19, 16.4, 6.4, WOOD, 2.6);
    c.fillStyle = STEEL;
    c.beginPath();
    c.moveTo(13.4, 3.4);
    c.quadraticCurveTo(21, 5.4, 20.4, 10.4);
    c.quadraticCurveTo(16.4, 8.6, 12.4, 9.4);
    c.closePath(); c.fill();
    L(c, 13.4, 4, 13, 9, STEEL_D, 1.2);
    glint(c, 17, 6);
  }
  function dSaw(c) {
    shadow(c);
    L(c, 4.4, 8.4, 17, 8.4, WOOD, 2.6);
    c.fillStyle = STEEL;
    c.beginPath();
    c.moveTo(4, 9.8); c.lineTo(19.6, 9.8); c.lineTo(19.6, 12.4);
    c.closePath(); c.fill();
    for (var i = 0; i < 6; i++) TRI(c, 4 + i * 2.6, 12.4, 5.3 + i * 2.6, 14.6, 6.6 + i * 2.6, 12.4, STEEL_D);
  }
  function dHammer(c) {
    shadow(c);
    L(c, 8, 19.4, 15, 7, WOOD, 2.6);
    RR(c, 10.6, 3.4, 9, 5.4, 1, STEEL);
    R(c, 10.6, 3.4, 9, 1.6, '#cdd6de');
    glint(c, 17.4, 5);
  }
  function dKnife(c, h) {
    shadow(c);
    TRI(c, 4, 20, 10.4, 9.4, 12, 11.4, WOOD_D);
    TRI(c, 10.4, 10.4, 19.6, 3.4, 12.6, 12.4, STEEL);
    L(c, 11, 11.4, 18.4, 5.4, 'rgba(255,255,255,0.5)', 0.9);
  }
  function dShovel(c) {
    shadow(c);
    L(c, 12, 3.6, 12, 14.4, WOOD, 2.6);
    R(c, 10.2, 3, 3.6, 1.8, WOOD_D);
    c.fillStyle = STEEL;
    c.beginPath();
    c.moveTo(8, 14.4); c.lineTo(16, 14.4); c.lineTo(15, 20);
    c.quadraticCurveTo(12, 21.6, 9, 20);
    c.closePath(); c.fill();
  }
  function dPitchfork(c) {
    shadow(c);
    L(c, 12, 20.4, 12, 8, WOOD, 2.4);
    L(c, 7.4, 3, 7.4, 9, STEEL, 1.6);
    L(c, 12, 2.4, 12, 9, STEEL, 1.6);
    L(c, 16.6, 3, 16.6, 9, STEEL, 1.6);
    L(c, 7.4, 8.6, 16.6, 8.6, STEEL, 1.6);
  }
  function dCrowbar(c) {
    shadow(c);
    L(c, 6, 18.6, 17.6, 6.6, IRON, 2.6);
    c.strokeStyle = IRON; c.lineWidth = 2.6;
    c.beginPath(); c.arc(16.4, 8.4, 2.6, Math.PI * 0.7, Math.PI * 1.7); c.stroke();
  }
  function dScissors(c) {
    shadow(c);
    L(c, 6, 4.4, 17, 17, STEEL, 1.8);
    L(c, 17, 4.4, 6, 17, STEEL, 1.8);
    C(c, 7.2, 19, 2.2, '#5b6470'); C(c, 16.8, 19, 2.2, '#5b6470');
  }
  function dNeedle(c) {
    shadow(c);
    L(c, 5, 19, 18, 5.4, SILVER, 1.7);
    C(c, 18.4, 5, 1.7, DARK);
    L(c, 18.4, 5, 22, 1.8, '#d8c86a', 1);
  }
  function dPliers(c) {
    shadow(c);
    L(c, 8, 20.4, 10.6, 10, IRON, 2.2);
    L(c, 16, 20.4, 13.4, 10, IRON, 2.2);
    TRI(c, 9.6, 10.4, 14.4, 10.4, 12, 4.4, STEEL);
    TRI(c, 10.6, 3.4, 13.4, 3.4, 12, 1.6, STEEL_D);
  }
  function dFile(c) {
    shadow(c);
    RR(c, 4, 13.4, 14, 3, 1.2, WOOD);
    TRI(c, 18, 13.4, 21.4, 12, 18, 16.4, STEEL);
    R(c, 4.6, 12.6, 12, 1, STEEL_D);
  }
  function dChisel(c) {
    shadow(c);
    RR(c, 4, 10.4, 10, 3.4, 1.2, WOOD);
    RR(c, 13.4, 10.8, 6.6, 2.6, 0.6, STEEL);
    TRI(c, 20, 10.8, 22.4, 12.1, 20, 13.4, SILVER);
  }
  function dScrewdriver(c) {
    shadow(c);
    RR(c, 4, 11, 8, 3.6, 1.4, '#b0453a');
    L(c, 11.6, 12.8, 20.4, 12.8, STEEL, 1.8);
    R(c, 20.4, 12, 1.8, 1.6, SILVER);
  }
  function dWhetstone(c) {
    shadow(c);
    RR(c, 4.4, 9.6, 15.2, 6.4, 1.4, '#8d97a1');
    RR(c, 4.4, 9.6, 15.2, 2, 1.4, '#a7b2bd');
    R(c, 6, 13, 3, 1.4, '#6d7780'); R(c, 11, 13, 3, 1.4, '#6d7780');
  }
  function dMatches(c) {
    shadow(c);
    RR(c, 4.6, 8.6, 11.6, 9.4, 1.2, '#a86b3a');
    RR(c, 4.6, 8.6, 11.6, 2.6, 1.2, '#c4854e');
    L(c, 17, 10, 21, 7.4, WOOD, 1.5);
    C(c, 21.4, 7, 1.8, '#d94f2f');
    C(c, 21.4, 7, 0.9, '#f2b04a');
  }
  function dTorch(c) {
    shadow(c);
    L(c, 12, 20.6, 12, 10, WOOD, 3);
    // пламя
    E(c, 12, 7.4, 3.4, 4.6, '#f28a2f');
    E(c, 12, 8.4, 2.1, 3, '#f8c84a');
    E(c, 12, 9.4, 1.1, 1.7, '#fdf1b8');
  }
  function dCandle(c) {
    shadow(c);
    RR(c, 9, 10, 6, 10, 1, '#e8e0cc');
    L(c, 12, 10, 12, 7.6, '#4b3a26', 1.1);
    E(c, 12, 6, 1.7, 2.4, '#f8c84a');
    E(c, 12, 6.8, 0.9, 1.3, '#fdf1b8');
  }
  function dLantern(c, h) {
    shadow(c);
    R(c, 9, 3.4, 6, 2, IRON);
    RR(c, 7.4, 5.4, 9.2, 9.6, 1.6, 'rgba(200,215,230,0.4)');
    E(c, 12, 10.2, 2.6, 3.2, '#f8c84a');
    E(c, 12, 10.6, 1.3, 1.8, '#fdf1b8');
    R(c, 8, 15, 8, 1.8, IRON);
    L(c, 12, 3.4, 12, 1.4, IRON, 1.2);
  }

  // ---- оружие ------------------------------------------------------------

  function dRifle(c) {
    shadow(c);
    L(c, 2.6, 13.6, 19.4, 7.4, WOOD_D, 2.2);
    L(c, 10, 11.4, 20.4, 6, STEEL, 1.8);
    L(c, 4.4, 12.6, 4.4, 17.4, WOOD, 2.4);
    TRI(c, 8.6, 11.4, 10.4, 8.4, 11.4, 11, STEEL);
    glint(c, 16, 8);
  }
  function dPistol(c) {
    shadow(c);
    RR(c, 4, 8.6, 12.4, 3, 0.8, IRON);
    c.fillStyle = IRON;
    c.beginPath();
    c.moveTo(6.4, 11.6); c.lineTo(11, 11.6); c.lineTo(9.6, 17.6);
    c.lineTo(5.4, 17.6); c.closePath(); c.fill();
    C(c, 6.4, 12.6, 1.3, WOOD_D);
    TRI(c, 16.4, 8.6, 20.4, 7.4, 16.4, 11.4, STEEL_D);
  }
  function dBow(c) {
    shadow(c);
    c.strokeStyle = WOOD; c.lineWidth = 2;
    c.beginPath(); c.arc(8, 12, 8.4, -Math.PI / 2.4, Math.PI / 2.4); c.stroke();
    L(c, 11, 4.4, 11, 19.6, 'rgba(230,230,220,0.75)', 1);
    L(c, 11, 12, 20.6, 12, '#c9b28a', 1.2);
    TRI(c, 20.6, 10.8, 22.6, 12, 20.6, 13.2, STEEL);
  }
  function dArrow(c) {
    shadow(c);
    L(c, 3.4, 18.6, 18, 6, WOOD, 1.5);
    TRI(c, 17.4, 6.6, 21.4, 3.4, 19.4, 8.6, STEEL);
    TRI(c, 6, 18, 3, 21, 8.4, 19.4, '#e8e0cc');
    TRI(c, 8.4, 15.4, 5.4, 18.4, 10.8, 16.8, '#e8e0cc');
  }
  function dBullet(c, h) {
    shadow(c);
    RR(c, 8.6, 9.6, 5.2, 8.6, 1, GOLD);
    c.fillStyle = '#b0453a';
    c.beginPath();
    c.moveTo(8.6, 9.6); c.lineTo(13.8, 9.6); c.lineTo(11.2, 3.6);
    c.closePath(); c.fill();
    glint(c, 10, 12);
  }
  function dGunpowder(c) {
    shadow(c);
    RR(c, 6, 7.6, 12, 11.4, 1.4, '#4b4238');
    R(c, 6, 7.6, 12, 2.2, '#5c5245');
    C(c, 9.4, 13.4, 0.8, '#2a251f'); C(c, 12.4, 15, 0.8, '#2a251f');
    C(c, 14.6, 12, 0.8, '#2a251f'); C(c, 11, 11.6, 0.8, '#2a251f');
  }

  // ---- топливо и материалы ----------------------------------------------

  function dLog(c, h) {
    shadow(c);
    RR(c, 4, 9.4, 15, 6.6, 2.4, WOOD);
    E(c, 19, 12.7, 1.6, 3.3, '#c9a86a');
    E(c, 19, 12.7, 0.7, 1.5, '#a8845a');
    L(c, 6.4, 11.4, 15, 11.4, 'rgba(0,0,0,0.2)', 0.9);
  }
  function dPlank(c) {
    shadow(c);
    RR(c, 3, 10, 18, 4.6, 0.8, '#b98a52');
    R(c, 3, 10, 18, 1.4, '#caa268');
    L(c, 5.4, 13.6, 8, 13.6, 'rgba(0,0,0,0.25)', 0.8);
    L(c, 15.4, 13.6, 18, 13.6, 'rgba(0,0,0,0.25)', 0.8);
  }
  function dCharcoal(c) {
    shadow(c);
    POLY3(c, '#3a3f45');
    function POLY3(c2, col) {
      c.fillStyle = col;
      c.beginPath();
      c.moveTo(7, 6.4); c.lineTo(17, 8); c.lineTo(18, 15.4);
      c.lineTo(10, 18.4); c.lineTo(5.4, 12.4);
      c.closePath(); c.fill();
    }
    L(c, 9, 9.4, 13, 12.4, '#565d66', 1.4);
    glint(c, 14.6, 9.6);
  }
  function dNails(c) {
    shadow(c);
    L(c, 6, 4.6, 6, 15, STEEL, 1.5); L(c, 4.4, 4.6, 7.6, 4.6, STEEL, 1.5);
    L(c, 12, 7, 12, 18, STEEL, 1.5); L(c, 10.4, 7, 13.6, 7, STEEL, 1.5);
    L(c, 18, 4.6, 18, 14, STEEL, 1.5); L(c, 16.4, 4.6, 19.6, 4.6, STEEL, 1.5);
  }
  function dRope(c) {
    shadow(c);
    c.strokeStyle = '#c9b28a'; c.lineWidth = 2.6;
    c.beginPath(); c.moveTo(4, 8); c.bezierCurveTo(10, 4, 14, 16, 20, 12); c.stroke();
    c.strokeStyle = '#a8895a'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(4, 8); c.bezierCurveTo(10, 4, 14, 16, 20, 12); c.stroke();
    C(c, 4, 8, 2, '#8a6f47'); C(c, 20, 12, 2, '#8a6f47');
  }
  function dClothBolt(c, h) {
    shadow(c);
    var col = hsl(h % 360, 40, 46);
    RR(c, 5, 7.6, 14, 9.4, 1.4, col);
    E(c, 19, 12.3, 1.8, 4.7, hsl(h % 360, 34, 58));
    L(c, 7, 10, 16, 10, 'rgba(255,255,255,0.3)', 1);
    L(c, 7, 14, 16, 14, 'rgba(0,0,0,0.18)', 1);
  }

  // ---- медицина ------------------------------------------------------------

  function dBandage(c, h) {
    shadow(c);
    RR(c, 5.4, 8.6, 13.2, 7.6, 3.4, '#eee8da');
    R(c, 5.4, 11.2, 13.2, 2.4, 'rgba(0,0,0,0.1)');
    C(c, 8.4, 12.4, 0.9, '#c9bfa8'); C(c, 12, 12.4, 0.9, '#c9bfa8'); C(c, 15.6, 12.4, 0.9, '#c9bfa8');
  }
  function dPill(c, h) {
    shadow(c);
    RR(c, 5, 9, 14, 6.6, 3, '#f4f0e4');
    R(c, 5, 9, 7, 6.6, '#e05a4a');
    R(c, 12, 9, 7, 6.6, '#f4f0e4');
    glint(c, 8, 11);
  }
  function dBottleMed(c, h) {
    shadow(c);
    R(c, 10, 3.2, 4, 3, '#4b3a26');
    RR(c, 8.4, 6.2, 7.2, 3.4, 1, '#3c2f1f');
    RR(c, 7, 9.4, 10, 10.8, 1.6, 'rgba(180,200,190,0.4)');
    R(c, 8, 12, 8, 6.4, '#5c7a68');
    R(c, 9, 10.4, 6, 1.6, '#e8e0cc');
  }
  function dCross(c) {
    shadow(c);
    R(c, 10.4, 5, 3.2, 13, '#e05a4a');
    R(c, 6.4, 9, 11.2, 3.2, '#e05a4a');
  }

  // ---- одежда ---------------------------------------------------------------

  function dHatUshanka(c, h) {
    shadow(c);
    var col = hsl(h % 360, 30, 38);
    E(c, 12, 9, 6.6, 3.6, col);
    E(c, 12, 7.6, 5, 2.6, hsl(h % 360, 28, 48));
    R(c, 4.6, 8.4, 3.4, 5, hsl(h % 360, 26, 32));
    R(c, 16, 8.4, 3.4, 5, hsl(h % 360, 26, 32));
    C(c, 12, 6.8, 1.4, '#c9a86a');
  }
  function dHatCap(c, h) {
    shadow(c);
    var col = hsl(h % 360, 32, 40);
    E(c, 11, 9, 6.4, 4.4, col);
    RR(c, 11, 6.6, 8.6, 2.6, 1, hsl(h % 360, 30, 34));
    C(c, 11, 6.8, 1.1, '#c9a86a');
  }
  function dCoat(c, h) {
    shadow(c);
    var col = hsl(h % 360, 28, 38);
    // корпус
    c.fillStyle = col;
    c.beginPath();
    c.moveTo(8.6, 4.4); c.lineTo(15.4, 4.4); c.lineTo(18, 19.4);
    c.lineTo(6, 19.4); c.closePath(); c.fill();
    // воротник
    TRI(c, 8.6, 4.4, 12, 8.6, 10, 4.4, hsl(h % 360, 26, 50));
    TRI(c, 15.4, 4.4, 12, 8.6, 14, 4.4, hsl(h % 360, 26, 50));
    // планка и пуговицы
    L(c, 12, 8.6, 12, 19, 'rgba(0,0,0,0.25)', 1);
    C(c, 10.6, 11, 0.7, '#d8c86a'); C(c, 10.6, 14.4, 0.7, '#d8c86a'); C(c, 10.6, 17.6, 0.7, '#d8c86a');
  }
  function dPants(c, h) {
    shadow(c);
    var col = hsl(h % 360, 26, 36);
    RR(c, 7, 4.4, 10, 6, 1, col);
    R(c, 7, 9.4, 4, 9.6, col);
    R(c, 13, 9.4, 4, 9.6, hsl(h % 360, 24, 32));
    R(c, 10.4, 9.4, 3.2, 2, 'rgba(0,0,0,0.2)');
  }
  function dBoot(c, h) {
    shadow(c);
    var col = hsl(h % 360, 24, 30);
    RR(c, 8.4, 4, 5.6, 10, 1.4, col);
    c.fillStyle = col;
    c.beginPath();
    c.moveTo(8.4, 13.4); c.lineTo(14, 13.4); c.lineTo(18.6, 16.4);
    c.lineTo(18.6, 19.4); c.lineTo(8.4, 19.4);
    c.closePath(); c.fill();
    R(c, 8.4, 17.6, 10.2, 1.8, '#1f1812');
    glint(c, 10.4, 6);
  }
  function dValenki(c, h) {
    shadow(c);
    var col = hsl((h % 40) + 20, 34, 56);
    RR(c, 8.6, 5, 5.4, 9, 2.4, col);
    c.fillStyle = col;
    c.beginPath();
    c.moveTo(8.6, 13.4); c.quadraticCurveTo(8, 17.6, 11, 17.8);
    c.lineTo(17.4, 17.8); c.quadraticCurveTo(19.4, 17.4, 18.6, 15.4);
    c.lineTo(14, 13.4);
    c.closePath(); c.fill();
    R(c, 8.8, 16.4, 9.6, 1.6, hsl((h % 40) + 20, 30, 44));
    L(c, 9.6, 7, 13, 7, 'rgba(255,255,255,0.3)', 1);
  }
  function dMitten(c, h) {
    shadow(c);
    var col = hsl(h % 360, 34, 42);
    RR(c, 8, 6, 8, 9, 3.4, col);
    RR(c, 15, 9.4, 4, 5.4, 2, hsl(h % 360, 30, 50));
    RR(c, 7.4, 14, 9.2, 4.4, 1.6, hsl(h % 360, 28, 34));
    L(c, 9.4, 8.4, 13.4, 8.4, 'rgba(255,255,255,0.25)', 1);
  }
  function dScarf(c, h) {
    shadow(c);
    var col = hsl(h % 360, 40, 44);
    RR(c, 5, 6.4, 14, 4.6, 2, col);
    R(c, 8.6, 11, 4.6, 8.4, col);
    R(c, 13.6, 11, 4, 7, hsl(h % 360, 36, 38));
    L(c, 9.6, 13, 12.2, 13, 'rgba(0,0,0,0.2)', 0.9);
    L(c, 9.6, 15.4, 12.2, 15.4, 'rgba(0,0,0,0.2)', 0.9);
  }
  function dSock(c, h) {
    shadow(c);
    var col = hsl(h % 360, 36, 46);
    RR(c, 9, 4, 5, 8, 1.6, col);
    c.fillStyle = col;
    c.beginPath();
    c.moveTo(9, 11.4); c.lineTo(14, 11.4); c.lineTo(15.4, 16.4);
    c.quadraticCurveTo(15.6, 18.6, 12.6, 18.4);
    c.lineTo(8.6, 17.4);
    c.closePath(); c.fill();
    R(c, 9, 4, 5, 2, hsl(h % 360, 34, 60));
    R(c, 9, 8.4, 5, 1.4, hsl(h % 360, 34, 60));
  }
  function dShirt(c, h) {
    shadow(c);
    var col = hsl(h % 360, 30, 52);
    c.fillStyle = col;
    c.beginPath();
    c.moveTo(9, 4.4); c.lineTo(15, 4.4); c.lineTo(18.4, 7.4);
    c.lineTo(16.4, 10.4); c.lineTo(15.4, 8.6); c.lineTo(15.4, 19.4);
    c.lineTo(8.6, 19.4); c.lineTo(8.6, 8.6); c.lineTo(7.6, 10.4);
    c.lineTo(5.6, 7.4);
    c.closePath(); c.fill();
    L(c, 12, 4.4, 12, 8, 'rgba(0,0,0,0.15)', 0.9);
    C(c, 12, 5.6, 0.6, '#d8c86a');
  }
  function dBlanket(c, h) {
    shadow(c);
    var col = hsl(h % 360, 34, 44);
    RR(c, 4.4, 7.6, 15.2, 10, 1.6, col);
    L(c, 4.4, 11, 19.6, 11, hsl(h % 360, 30, 58), 1.2);
    L(c, 4.4, 14.4, 19.6, 14.4, hsl(h % 360, 30, 58), 1.2);
    R(c, 4.4, 7.6, 15.2, 1.6, hsl(h % 360, 28, 32));
  }

  // ---- книги и бумага ----------------------------------------------------

  function dBook(c, h) {
    shadow(c);
    var col = hsl(h % 360, 34, 34);
    RR(c, 5.4, 4.6, 13.2, 15.2, 1.4, col);
    R(c, 5.4, 4.6, 2.6, 15.2, hsl(h % 360, 30, 24));
    RR(c, 9, 6.4, 8.4, 11.6, 0.6, '#e8dfc8');
    L(c, 10.4, 8.6, 16, 8.6, 'rgba(0,0,0,0.3)', 0.8);
    L(c, 10.4, 10.6, 16, 10.6, 'rgba(0,0,0,0.3)', 0.8);
    L(c, 10.4, 12.6, 14, 12.6, 'rgba(0,0,0,0.3)', 0.8);
  }
  function dPaper(c, h) {
    shadow(c);
    RR(c, 6.4, 4, 11.2, 15.6, 0.6, '#eee8d8');
    L(c, 8.4, 7.4, 15.6, 7.4, 'rgba(0,0,0,0.4)', 0.8);
    L(c, 8.4, 10, 15.6, 10, 'rgba(0,0,0,0.4)', 0.8);
    L(c, 8.4, 12.6, 15.6, 12.6, 'rgba(0,0,0,0.4)', 0.8);
    L(c, 8.4, 15.2, 13, 15.2, 'rgba(0,0,0,0.4)', 0.8);
    C(c, 14.6, 15.6, 1.4, 'rgba(140,30,30,0.8)');
  }
  function dNewspaper(c) {
    shadow(c);
    RR(c, 4, 6, 16, 12.4, 0.6, '#e6e0d0');
    R(c, 4.8, 7, 6.4, 3.4, 'rgba(0,0,0,0.35)');
    L(c, 12, 7.6, 19, 7.6, 'rgba(0,0,0,0.3)', 0.7);
    L(c, 12, 9.4, 19, 9.4, 'rgba(0,0,0,0.3)', 0.7);
    L(c, 4.8, 12.4, 19.2, 12.4, 'rgba(0,0,0,0.3)', 0.7);
    L(c, 4.8, 14.4, 19.2, 14.4, 'rgba(0,0,0,0.3)', 0.7);
    L(c, 4.8, 16.4, 16, 16.4, 'rgba(0,0,0,0.3)', 0.7);
  }

  // ---- посуда и тара -------------------------------------------------------

  function dPot(c, h) {
    shadow(c);
    var col = hsl(20 + (h % 20), 26, 38);
    RR(c, 5.4, 8, 13.2, 9.6, 1.6, col);
    R(c, 4, 7.4, 16, 1.8, hsl(20 + (h % 20), 22, 28));
    L(c, 5, 8.4, 2.4, 8.4, STEEL, 1.4);
    L(c, 19, 8.4, 21.6, 8.4, STEEL, 1.4);
    E(c, 12, 8.2, 5.4, 1.2, 'rgba(0,0,0,0.35)');
    glint(c, 7.4, 10.4);
  }
  function dJar(c, h, fillCol) {
    shadow(c);
    RR(c, 7, 7, 10, 12.4, 1.6, 'rgba(200,220,230,0.35)');
    R(c, 8.2, 10.4, 7.6, 8, fillCol || hsl(50 + (h % 60), 52, 48));
    RR(c, 6.6, 5, 10.8, 2.6, 1, '#8a6f47');
    R(c, 8.4, 8.2, 2.6, 9, 'rgba(255,255,255,0.28)');
  }
  function dSack(c, h) {
    shadow(c);
    var col = hsl(34, 28, 44 + (h % 10));
    c.fillStyle = col;
    c.beginPath();
    c.moveTo(9, 6.4); c.quadraticCurveTo(4.4, 12, 7, 17.6);
    c.quadraticCurveTo(12, 20.8, 17, 17.6);
    c.quadraticCurveTo(19.6, 12, 15, 6.4);
    c.closePath(); c.fill();
    L(c, 9, 6.4, 15, 6.4, '#8a6f47', 2);
    L(c, 10.4, 9, 13.6, 9, 'rgba(0,0,0,0.2)', 0.9);
    L(c, 11, 11.4, 13, 11.4, 'rgba(0,0,0,0.2)', 0.9);
  }
  function dPouch(c, h) {
    shadow(c);
    E(c, 12, 13.4, 6.4, 5.6, hsl(h % 360, 30, 36));
    L(c, 8.6, 8.6, 15.4, 8.6, '#5c4a32', 1.8);
    C(c, 12, 8, 1.6, GOLD);
    glint(c, 9.6, 11.6);
  }

  // ---- реликвии и особые предметы ----------------------------------------

  function dSamovar(c) {
    shadow(c);
    E(c, 12, 13, 6.4, 6, GOLD);
    E(c, 12, 7.6, 3.6, 1.8, GOLD);
    R(c, 11, 3.6, 2, 2.6, '#b0453a');
    L(c, 5.6, 12, 2.6, 9.6, GOLD, 1.8);
    L(c, 18.4, 12, 21.4, 9.6, GOLD, 1.8);
    C(c, 2.4, 9.2, 1.4, GOLD); C(c, 21.6, 9.2, 1.4, GOLD);
    E(c, 9.6, 11.6, 1.8, 2.6, '#f2dfae');
    R(c, 10, 17.6, 4, 1.6, '#8a6f2f');
  }
  function dIcon(c) {
    shadow(c);
    RR(c, 5, 4.6, 14, 15, 1.2, '#8a6f2f');
    RR(c, 6.6, 6.2, 10.8, 12, 0.6, '#c9a15a');
    E(c, 12, 11, 3, 3.4, '#e8c86a');
    TRI(c, 12, 6.2, 9.4, 12.4, 14.6, 12.4, '#b0453a');
    C(c, 12, 5.4, 0.9, GOLD);
  }
  function dHarmonica(c) {
    shadow(c);
    R(c, 4, 9.4, 16, 6, '#5c4a32');
    for (var i = 0; i < 5; i++) R(c, 6 + i * 2.8, 7.6, 1.2, 9.6, STEEL);
    R(c, 4, 9.4, 16, 1.2, '#7a6347');
    R(c, 4, 14.6, 16, 1.2, '#4b3a26');
  }
  function dBalalaika(c) {
    shadow(c);
    TRI(c, 12, 3.4, 8, 12, 16, 12, WOOD);
    E(c, 12, 13.6, 5, 4.4, WOOD);
    E(c, 12, 13.6, 2.6, 2.2, '#3a2c1c');
    L(c, 12, 3.4, 12, 8.4, '#3a2c1c', 1);
    L(c, 12, 5.6, 19.6, 3.6, '#e8e0cc', 0.8);
  }
  function dChess(c) {
    shadow(c);
    RR(c, 4.4, 14.6, 15.2, 4, 1, '#8a6f47');
    for (var i = 0; i < 4; i++) R(c, 4.4 + i * 3.8, 14.6, 1.9, 4, '#3a2c1c');
    C(c, 9.6, 11.4, 2, '#eee8da'); R(c, 8.6, 13, 2, 1.8, '#eee8da'); C(c, 9.6, 9, 0.8, '#eee8da');
    C(c, 15, 11.4, 2, '#4b4238'); R(c, 14, 13, 2, 1.8, '#4b4238'); C(c, 15, 9, 0.8, '#4b4238');
  }
  function dCamera(c) {
    shadow(c);
    RR(c, 4.6, 8.6, 14.8, 9.6, 1.6, '#4b4238');
    C(c, 12, 13.4, 3.4, '#2a251f');
    C(c, 12, 13.4, 2.2, '#6d94b0');
    C(c, 11.2, 12.6, 0.8, 'rgba(255,255,255,0.7)');
    R(c, 8, 6.6, 4, 2, '#3a332a');
    C(c, 17.4, 10.4, 1, GOLD);
  }
  function dCompass(c) {
    shadow(c);
    C(c, 12, 12, 7.4, GOLD);
    C(c, 12, 12, 6, '#e8dfc8');
    TRI(c, 12, 6.6, 10.6, 12, 13.4, 12, '#b0453a');
    TRI(c, 12, 17.4, 10.6, 12, 13.4, 12, '#2a3140');
    C(c, 12, 12, 1, DARK);
  }
  function dWatch(c) {
    shadow(c);
    L(c, 7.4, 5.4, 6.6, 3, SILVER, 1.4);
    L(c, 16.6, 5.4, 17.4, 3, SILVER, 1.4);
    C(c, 12, 12.4, 6, SILVER);
    C(c, 12, 12.4, 4.8, '#f4f0e4');
    L(c, 12, 12.4, 12, 8.8, DARK, 1.3);
    L(c, 12, 12.4, 14.6, 13.6, DARK, 1.1);
    C(c, 12, 12.4, 0.9, GOLD);
  }
  function dRing(c) {
    shadow(c);
    c.strokeStyle = GOLD; c.lineWidth = 2.6;
    c.beginPath(); c.arc(12, 14, 4.6, 0, Math.PI * 2); c.stroke();
    TRI(c, 12, 4.4, 9.6, 9.4, 14.4, 9.4, '#d8e2ee');
    TRI(c, 12, 6.4, 10.8, 9, 13.2, 9, '#f4f8fc');
    glint(c, 11.6, 6.6);
  }
  function dMedal(c) {
    shadow(c);
    L(c, 8, 3.6, 10.4, 9, '#b0453a', 2.2);
    L(c, 16, 3.6, 13.6, 9, '#b0453a', 2.2);
    C(c, 12, 13.6, 5, GOLD);
    C(c, 12, 13.6, 3.6, '#f2dfae');
    C(c, 12, 12.6, 1.4, '#b0453a');
  }
  function dBell(c) {
    shadow(c);
    c.fillStyle = GOLD;
    c.beginPath();
    c.moveTo(7, 14.4);
    c.quadraticCurveTo(7, 7.4, 12, 7.4);
    c.quadraticCurveTo(17, 7.4, 17, 14.4);
    c.closePath(); c.fill();
    R(c, 6.4, 14.4, 11.2, 1.8, '#b0453a');
    C(c, 12, 17.6, 1.4, '#b0453a');
    C(c, 12, 6.4, 1.4, GOLD);
  }
  function dSaber(c) {
    shadow(c);
    c.strokeStyle = SILVER; c.lineWidth = 2.2;
    c.beginPath();
    c.moveTo(4, 19.6);
    c.quadraticCurveTo(12, 15.4, 19, 4.6);
    c.stroke();
    L(c, 4.4, 17.6, 8.4, 19.4, GOLD, 2.4);
    C(c, 4, 19, 1.4, GOLD);
  }
  function dScales(c) {
    shadow(c);
    L(c, 12, 4, 12, 15, '#6b5a3a', 1.6);
    L(c, 6.4, 5.6, 17.6, 5.6, '#6b5a3a', 1.6);
    c.strokeStyle = '#6b5a3a'; c.lineWidth = 1;
    c.beginPath(); c.arc(6.4, 5.6, 3.4, 0, Math.PI); c.stroke();
    c.beginPath(); c.arc(17.6, 5.6, 3.4, 0, Math.PI); c.stroke();
    E(c, 6.4, 10.4, 3, 1.2, GOLD); E(c, 17.6, 10.4, 2.4, 1.2, GOLD);
    C(c, 12, 4, 1.4, GOLD);
    R(c, 9, 15.6, 6, 2, '#6b5a3a');
  }
  function dMap(c) {
    shadow(c);
    RR(c, 4.4, 6, 15.2, 12, 0.6, '#e8dfc0');
    L(c, 6.4, 16.4, 10, 10.4, '#b0453a', 1.1);
    L(c, 10, 10.4, 14.6, 12.4, '#b0453a', 1.1);
    L(c, 14.6, 12.4, 17.6, 8.6, '#b0453a', 1.1);
    C(c, 17.6, 8.6, 1.4, '#2a3140');
    C(c, 6.4, 16.4, 1.1, DARK);
    L(c, 7.6, 8.4, 12, 7.4, 'rgba(90,120,160,0.8)', 0.9);
  }
  function dSpinningWheel(c) {
    shadow(c);
    L(c, 6, 19, 8, 5, WOOD, 1.8);
    L(c, 17, 19, 16, 7, WOOD, 1.8);
    C(c, 12, 9.6, 4.4, WOOD);
    C(c, 12, 9.6, 2.8, '#c9a86a');
    L(c, 12, 6.4, 12, 2.6, '#8a6f47', 1);
    E(c, 16.6, 5.4, 1.6, 2.2, '#e8dfc8');
  }
  function dTeapot(c) {
    shadow(c);
    E(c, 11, 12.6, 6.4, 5, SILVER);
    c.strokeStyle = SILVER; c.lineWidth = 1.8;
    c.beginPath(); c.arc(17.4, 12.6, 2.6, Math.PI * 0.6, Math.PI * 1.5); c.stroke();
    C(c, 5.6, 10.4, 1.6, SILVER);
    E(c, 11, 8, 2.6, 1.2, '#aab4be');
    R(c, 10.4, 6.4, 1.4, 1.6, '#8d97a1');
    glint(c, 8.6, 11);
  }
  function dGramophone(c) {      // грамота/свиток
    shadow(c);
    RR(c, 5.4, 6.4, 13.2, 11.6, 1, '#eee8d0');
    L(c, 7.4, 9, 16.6, 9, 'rgba(0,0,0,0.35)', 0.8);
    L(c, 7.4, 11.4, 16.6, 11.4, 'rgba(0,0,0,0.35)', 0.8);
    L(c, 7.4, 13.8, 14, 13.8, 'rgba(0,0,0,0.35)', 0.8);
    C(c, 17, 15.6, 1.4, 'rgba(140,30,30,0.85)');
    L(c, 5.4, 6.4, 5.4, 18, '#c9a86a', 1.4);
    L(c, 18.6, 6.4, 18.6, 18, '#c9a86a', 1.4);
  }

  // ====================================================================
  //  КАРТА СЕМЕЙСТВ: [регулярка, рисовальщик] — проверяются по порядку.
  //  h — хэш id (для вариации цвета), id — полный идентификатор.
  // ====================================================================

  var FAMILIES = [
    // --- выпечка ---
    [/^karavay$/, dRoundLoaf],
    [/baranki|sushki|suslik_ring/, dBaranka],
    [/pryanik|prianik/, dPryanik],
    [/blin|oladj|oladji/, dBlin],
    [/pirog|pirozhk|kulebyaka|sochnik|shang|vatrushka/, dPirog],
    [/kulich|pascha/, dKulich],
    [/medovik|prianik_honey|cake|tort/, dCakeSlice],
    [/bread|karavai_blessed|galebisc|galley|suhari|rusk|toast|dranik/, dLoaf],

    // --- рыба ---
    [/^fish_smoked$|^fish_dried$|^dried_fish$/, function (c, h) { dFish(c, h); L(c, 8, 8.6, 10, 7, 'rgba(0,0,0,0.3)', 1); }],
    [/ukha|kalya|solyanka_fish|fish_stew|fish_vertushka/, function (c, h) { dBowl(c, h, hsl(30 + (h % 20), 48, 44)); C(c, 10, 10.4, 1.1, '#8a97a5'); }],
    [/fish/, dFish],

    // --- супы и каши ---
    [/kasha|polevaya|grech|semolina|millet|buckwheat|tolokno/, function (c, h) { dBowl(c, h, hsl(42, 46, 52)); }],
    [/soup|shchi|rassolnik|solyanka|lapsha|vinegret|borscht|kholodets|grib/, function (c, h) { dBowl(c, h, hsl(20 + (h % 30), 48, 42)); }],

    // --- мясо ---
    [/pelmeni|varenik/, dPelmeni],
    [/salo|lard|potato_salo/, dSalo],
    [/chicken|roast|hare|giblets|jellied/, dDrumstick],
    [/meat|kotlety|chops|befstrog|butcher/, dMeat],

    // --- овощи, грибы, ягоды ---
    [/mushroom|grib|chaga/, function (c, h) { dMushroom(c, h + 200); }],
    [/berries|cranberri|mors|pastila|tart_berries|berry/, function (c, h) { dBerries(c, h + 300); }],
    [/apple_dried|dried_apple/, dAppleDried],
    [/potato|kartoshka/, dPotato],
    [/carrot/, dCarrot],
    [/cabbage|sauerkraut/, dCabbage],
    [/onion/, dOnion],
    [/beet|borsch/, dBeet],
    [/turnip|repka/, dTurnip],
    [/pumpkin/, function (c) { shadow(c); E(c, 12, 13, 7, 5.6, '#d9822f'); L(c, 12, 7.6, 12, 4.8, '#5c7a3a', 2); E(c, 9.4, 12, 1.6, 3.4, '#c46e26'); }],
    [/nettle|ivan_grass|fir_needles|forest_tea|tea_ivan|tea_pine|tea_chaga/, function (c, h) { shadow(c); L(c, 6, 18.6, 10, 5, '#4e7a33', 1.8); L(c, 9, 18.6, 13, 6, '#5c8c3c', 1.8); L(c, 12.6, 18.6, 17, 6.6, '#4e7a33', 1.8); L(c, 8, 9, 15, 11, '#6f9a44', 1.2); }],

    // --- молочка, яйца ---
    [/egg/, dEgg],
    [/butter/, dButter],
    [/tvorog|smetana|varenets|curd/, dCheese],
    [/milk/, function (c, h) { dBottle(c, h, '#f4f0e4'); }],

    // --- напитки ---
    [/vodka|samogon|nastoyka|tincture/, function (c, h) { dBottle(c, h, 'rgba(210,230,240,0.85)'); }],
    [/kvass|sbiten|kissel|compote|mors|drink|tea_brew/, function (c, h) { dCup(c, h, hsl(20 + (h % 40), 52, 38)); }],
    [/honey_jar|jam|pickles|jar_/, function (c, h) { dJar(c, h); }],
    [/flask|bottle_empty/, dFlask],
    [/water_flask/, dFlask],

    // --- инструменты ---
    [/axe|topor|hatchet/, dAxe],
    [/^saw$/, dSaw],
    [/hammer|mолоток/, dHammer],
    [/knife|scalpel|nozh/, dKnife],
    [/shovel|lopata|peel_oven/, dShovel],
    [/pitchfork|vili/, dPitchfork],
    [/crowbar|lom/, dCrowbar],
    [/scissors/, dScissors],
    [/needle|thimble|sewing/, dNeedle],
    [/pliers|pincet|kusachki/, dPliers],
    [/file_|file$|nadir/, dFile],
    [/chisel|doloto/, dChisel],
    [/screwdriver|vert/, dScrewdriver],
    [/whetstone|brusok|tochil/, dWhetstone],
    [/matches|spichki/, dMatches],
    [/torch|fakel/, dTorch],
    [/candle/, dCandle],
    [/lantern|lamp_flashlight|lamp_oil|fonar/, dLantern],
    [/wicks|fitil/, dCandle],
    [/hand_drill|drill|sverlo|brace_bit/, function (c) { shadow(c); L(c, 7, 5, 15, 17, WOOD, 2.4); C(c, 7, 5, 2.2, IRON); C(c, 15, 17.4, 1.2, STEEL); }],
    [/plane|rubanok/, function (c) { shadow(c); RR(c, 4, 10, 16, 5.4, 1, WOOD); R(c, 4, 8.6, 3, 3, IRON); R(c, 10, 12.6, 6, 1.6, STEEL); }],
    [/ice_pick/, function (c) { shadow(c); L(c, 8, 5, 13, 18, WOOD, 2.4); TRI(c, 12, 17, 15.4, 21.4, 10.4, 19.4, STEEL); }],
    [/ramrod|shompol/, function (c) { shadow(c); L(c, 4, 18.6, 19, 5.4, STEEL, 1.5); C(c, 4, 18.6, 1.4, STEEL_D); C(c, 19, 5.4, 1.2, STEEL_D); }],
    [/tongs|kleshchi/, function (c) { shadow(c); L(c, 6, 4.4, 10, 14, IRON, 2); L(c, 18, 4.4, 14, 14, IRON, 2); C(c, 12, 16, 2.4, STEEL_D); }],
    [/brush|marker/, function (c) { shadow(c); L(c, 7, 4, 10, 12, WOOD, 2.2); RR(c, 9, 12, 5, 4, 1, SILVER); L(c, 10, 16, 11.5, 20, '#3a3f45', 2); }],
    [/soldering|pajalnik/, function (c) { shadow(c); L(c, 6, 5, 14, 14, WOOD, 2.6); TRI(c, 13, 13, 18, 18, 10.4, 18.4, IRON); }],

    // --- оружие ---
    [/rifle|mosin/, dRifle],
    [/shotgun|drobovik/, dRifle],
    [/pistol|nagant|revolver/, dPistol],
    [/bow_hunting/, dBow],
    [/arrow|strela/, dArrow],
    [/bullet|rifle_round|patron/, dBullet],
    [/shell/, dBullet],
    [/gunpowder|poroh/, dGunpowder],
    [/gun_case|chester/, function (c, h) { dSack(c, h); L(c, 9, 13.4, 15, 13.4, '#4b4238', 1.2); }],
    [/spear|kopio/, function (c) { shadow(c); L(c, 4, 19.6, 18, 6, WOOD, 1.8); TRI(c, 17, 6.6, 21, 3.4, 19.6, 8.6, STEEL); }],
    [/trap_wolf|trap_hare|kapkan/, function (c) { shadow(c); c.strokeStyle = IRON; c.lineWidth = 1.8; c.beginPath(); c.arc(12, 13, 6, Math.PI, 0); c.stroke(); L(c, 6, 13, 6, 18, IRON, 1.8); L(c, 18, 13, 18, 18, IRON, 1.8); R(c, 7, 17, 10, 2, IRON); }],
    [/snare|silka/, function (c) { shadow(c); c.strokeStyle = '#c9b28a'; c.lineWidth = 1.3; c.beginPath(); c.ellipse(12, 12, 7, 5, 0, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.ellipse(12, 12, 4, 2.6, 0, 0, Math.PI * 2); c.stroke(); }],

    // --- топливо, материалы ---
    [/firewood|log|drova/, dLog],
    [/plank|doska/, dPlank],
    [/charcoal|ugol/, dCharcoal],
    [/kerosene|neft|benzin/, function (c, h) { dBottle(c, h, '#5c6d7a'); }],
    [/tar_|smola/, function (c, h) { dPot(c, 40); E(c, 12, 8.4, 4.6, 1, '#2a251f'); }],
    [/nails|gvozd/, dNails],
    [/staple|skob/, function (c) { shadow(c); c.strokeStyle = STEEL; c.lineWidth = 1.6; c.beginPath(); c.moveTo(6, 6); c.lineTo(6, 16); c.lineTo(12, 16); c.lineTo(12, 8); c.lineTo(18, 8); c.lineTo(18, 18); c.stroke(); }],
    [/rope|kanat|verevka/, dRope],
    [/cloth_rag|tkan|fabric/, dClothBolt],
    [/scrap_metal|metallolom/, function (c) { shadow(c); R(c, 5, 12, 8, 3, IRON); R(c, 10, 8, 6, 3, STEEL_D); R(c, 8, 15.6, 8, 3, STEEL); L(c, 6, 13.4, 10, 16, 'rgba(0,0,0,0.2)', 1); }],
    [/sinew|suhozhil/, function (c) { shadow(c); L(c, 5, 6, 9, 18, '#c9b8a0', 1.6); L(c, 9, 6, 13, 18, '#b8a88f', 1.6); L(c, 13, 6, 17, 18, '#c9b8a0', 1.6); }],
    [/wadding|vata/, function (c) { shadow(c); C(c, 10, 12, 5, '#f4f0e4'); C(c, 15, 13.6, 4, '#e8e2d4'); C(c, 8.6, 10.4, 1.6, '#ffffff'); }],
    [/soap|mylo/, function (c, h) { shadow(c); RR(c, 5.4, 9, 13.2, 7, 2.4, hsl(120 + (h % 80), 24, 72)); E(c, 12, 10.4, 3.4, 1, 'rgba(255,255,255,0.7)'); }],

    // --- медицина ---
    [/bandage|bint/, dBandage],
    [/plaster|gips/, dBandage],
    [/aspirin|pill|tablet|quinine|morphine|laudanum/, dPill],
    [/iodine|carbolic|zelenka|tincture/, dBottleMed],
    [/medical|med_/, dCross],
    [/hot_water/, function (c) { shadow(c); RR(c, 6, 7, 12, 11, 2.4, '#8a6f47'); E(c, 9, 7, 1.4, 1, '#c9a86a'); R(c, 10.4, 5.4, 3.2, 2, '#6b5a3a'); }],

    // --- одежда ---
    [/ushanka|treukh|shapka|furazhka|kartuz|shlyapa|malakhai|kapor|bashlyk|shlem|bogatyrka|_cap$|^cap/, dHatUshanka],
    [/valenki|unty/, dValenki],
    [/lapti|lapot/, function (c) { shadow(c); E(c, 12, 12, 7, 4.4, '#c9a86a'); L(c, 6, 10.4, 18, 13.6, '#8a6f47', 1.1); L(c, 6, 13.6, 18, 10.4, '#8a6f47', 1.1); L(c, 8, 8.4, 8, 5, '#8a6f47', 1.2); L(c, 16, 8.4, 16, 5, '#8a6f47', 1.2); }],
    [/sapogi|boot|boty|galoshi|chuni|porshni/, dBoot],
    [/rukavitsy|varezhki|mittens|mitenki|perchatki/, dMitten],
    [/sock|nosok|portyanki/, dSock],
    [/platok|shal|scarf|kosynka/, dScarf],
    [/rubakha|kosovorotka|kitel|gimnastyorka|pidzhak|zhilet|sviter|dzhemper|kitel_feldshera|tunic/, dShirt],
    [/portki|shtany|bryuki|sharovary|kalsony|pant/, dPants],
    [/shinel|tulup|polushubok|armyak|chuika|zipun|poddevka|shuba|bekesha|doha|coat|palto|nakidka|mundir|ryasa|tuzhurka|kholod/, dCoat],
    [/blanket|linen|sheet|skatka|bedroll|odeyalo/, dBlanket],
    [/pelt|shkura|koja|rug/, function (c, h) { shadow(c); E(c, 12, 12, 7.6, 5.6, hsl(24 + (h % 20), 36, 40)); TRI(c, 4.4, 12, 8, 8.4, 8, 15.6, hsl(24 + (h % 20), 32, 30)); TRI(c, 19.6, 12, 16, 8.4, 16, 15.6, hsl(24 + (h % 20), 32, 30)); }],

    // --- книги и бумаги ---
    [/book|kniga|psaltyr|azbuka/, dBook],
    [/newspaper|gazeta/, dNewspaper],
    [/journal_page|letter|gramota|mandat|passport|warrant|note|page/, dPaper],
    [/map|karta/, dMap],

    // --- посуда и тара ---
    [/pot|kastryulya|skillet|pan/, dPot],
    [/jar_empty|banka/, function (c) { dJar(c, 30, 'rgba(200,220,230,0.4)'); }],
    [/sack|meshok|kotomka|ranets|matras|sumka|bag/, dSack],
    [/purse|koshel|pouch|tobacco_pouch/, dPouch],
    [/salt_bag|flour|sugar|muka/, dSack],
    [/samovar/, dSamovar],

    // --- музыка, игры, реликвии ---
    [/harmon|garmon|bayan/, dHarmonica],
    [/balalaika|gusli/, dBalalaika],
    [/chess|shakhmat/, dChess],
    [/domino/, function (c) { shadow(c); R(c, 5, 8, 6.4, 8, '#eee8da'); R(c, 12.6, 8, 6.4, 8, '#3a2c1c'); L(c, 8.2, 8, 8.2, 16, '#8a6f47', 0.8); C(c, 6.6, 10, 0.7, DARK); C(c, 9.6, 14, 0.7, DARK); C(c, 14.4, 9.4, 0.7, '#eee8da'); C(c, 17.2, 12, 0.7, '#eee8da'); }],
    [/deck_cards|karty/, function (c) { shadow(c); RR(c, 6, 5.4, 9, 13, 1, '#eee8da'); RR(c, 8.6, 4, 9, 13, 1, '#f6f2e6'); R(c, 10.6, 6, 5, 2.6, '#b0453a'); C(c, 13, 12, 2, DARK); }],
    [/icon|kazan|gospel|crucifix|cross_silver|sygnum|psalter/, dIcon],
    [/camera|fotograf/, dCamera],
    [/compass/, dCompass],
    [/watch|chasy/, dWatch],
    [/ring/, dRing],
    [/medal|order|georgii/, dMedal],
    [/bell|kolokol/, dBell],
    [/saber|shashka|sablya/, dSaber],
    [/scales|vesy/, dScales],
    [/spinning|pralk|pryalka/, dSpinningWheel],
    [/teapot|chainik/, dTeapot],
    [/gramota|svitok|scroll/, dGramophone],
    [/relic/, dGramophone],      // реликвии без точного маппинга — свиток-грамота

    // --- прочее ---
    [/skis|lyzhi|sledge|sani|voz/, function (c) { shadow(c); L(c, 4, 8.4, 19, 4.4, WOOD, 2.2); L(c, 4, 12.4, 19, 8.4, WOOD, 2.2); L(c, 4, 8.4, 4, 12.4, STEEL, 1.6); }],
    [/yoke|koromyslo/, function (c) { shadow(c); c.strokeStyle = WOOD; c.lineWidth = 2.4; c.beginPath(); c.moveTo(4, 6); c.quadraticCurveTo(12, 14, 20, 6); c.stroke(); L(c, 6, 8.4, 6, 16, '#8a6f47', 1.2); L(c, 18, 8.4, 18, 16, '#8a6f47', 1.2); }],
    [/washboard|talka|pralka/, function (c) { shadow(c); RR(c, 6, 4.6, 12, 14.4, 1, WOOD); for (var i = 0; i < 4; i++) L(c, 8, 8 + i * 2.8, 16, 8 + i * 2.8, '#6b4420', 1.1); }],
    [/barometer|termometr/, function (c) { shadow(c); C(c, 12, 12, 6.4, '#e8dfc8'); C(c, 12, 12, 5, '#f4f0e4'); L(c, 12, 12, 15, 8.6, '#b0453a', 1.4); C(c, 12, 12, 1.2, DARK); }],
    [/inkwell|chernil/, function (c) { shadow(c); RR(c, 8, 9, 8, 8, 1.4, '#2a3140'); R(c, 9.4, 7.6, 5.2, 1.6, '#1f2530'); E(c, 12, 11, 2.4, 1.4, '#10141c'); }],
    [/feather|pero|quill/, function (c) { shadow(c); c.strokeStyle = '#e8e0cc'; c.lineWidth = 2; c.beginPath(); c.moveTo(6, 19); c.quadraticCurveTo(10, 10, 17, 4.4); c.stroke(); L(c, 6, 19, 8.6, 14, '#c9b28a', 1); }],
    [/coin|moneta|den_ga/, function (c) { shadow(c); C(c, 12, 12, 6.4, GOLD); C(c, 12, 12, 5, '#f2dfae'); C(c, 12, 12, 3, GOLD); C(c, 12, 12, 1.4, '#b0453a'); }],
    [/key|kluch/, function (c) { shadow(c); C(c, 8, 8, 3.4, GOLD); C(c, 8, 8, 1.4, '#3a2c1c'); L(c, 10.4, 10.4, 19, 19, GOLD, 2); L(c, 16.4, 16.4, 18.6, 14.2, GOLD, 2); }],
    [/candle|lamp|light|fonar/, dLantern],
    [/smoking|pipe|trubka|tabacco|tobacco/, function (c) { shadow(c); RR(c, 7, 11, 8, 4.4, 1.6, WOOD); L(c, 14, 12.4, 20, 9, WOOD, 2); E(c, 11, 11, 2.6, 1, '#3a3f45'); }],
    [/candy|konfeta|pryanik_s/, dPryanik],
    [/joint|koleda/, function (c) { shadow(c); L(c, 5, 16, 18, 8, '#c9b28a', 3); L(c, 12, 12.4, 16.4, 10.2, '#6f9a44', 3); E(c, 5.6, 15.6, 1.4, '#f28a2f'); }],
    [/mushroom_fun|vesel/, function (c, h) { dMushroom(c, h + 300); C(c, 9, 10, 0.8, '#f4f0e4'); C(c, 14, 11, 0.8, '#f4f0e4'); }],
    [/crazy_gift|gift|podarok/, function (c) { shadow(c); R(c, 6, 9, 12, 10, '#b3541e'); R(c, 6, 9, 12, 2.4, '#d86a28'); R(c, 11, 4.6, 2, 14, '#ffd76e'); R(c, 6, 12.4, 12, 2, '#ffd76e'); TRI(c, 11, 5, 7, 3, 9.4, 7, '#ffd76e'); TRI(c, 13, 5, 17, 3, 14.6, 7, '#ffd76e'); }],
    [/plunger|vantuz/, function (c) { shadow(c); L(c, 12, 3.6, 12, 12, WOOD, 2.4); c.fillStyle = '#b0453a'; c.beginPath(); c.moveTo(6, 12); c.lineTo(18, 12); c.quadraticCurveTo(18, 19, 12, 19.4); c.quadraticCurveTo(6, 19, 6, 12); c.closePath(); c.fill(); E(c, 12, 13, 5, 1.6, '#8a3630'); }]
  ];

  // Точные соответствия (самое важное / где регулярка не ловит).
  var EXACT = {
    rifle_mosin: dRifle, pistol_nagant: dPistol, bow_hunting: dBow,
    axe: dAxe, saw: dSaw, hammer: dHammer, shovel: dShovel, matches: dMatches,
    torch: dTorch, candle_stump: dCandle, lantern: dLantern,
    bread: dLoaf, bread_rye_black: dLoaf, bread_white: dLoaf,
    fresh_fish: dFish, meat_raw: dMeat, meat_cooked: dMeat,
    egg: dEgg, egg_boiled: dEgg, egg_fried: dEgg,
    potato: dPotato, carrot: dCarrot, onion: dOnion, beet: dBeet, turnip: dTurnip,
    vodka: function (c, h) { dBottle(c, h, 'rgba(216,232,240,0.9)'); },
    tea_brick: dSack,
    valenki: dValenki, ushanka: dHatUshanka, lapti: null,
    book_cook: dBook, map_old: dMap, letter_old: dPaper,
    pot: dPot, jar_empty: function (c) { dJar(c, 30, 'rgba(200,220,230,0.4)'); },
    nails: dNails, rope: dRope, log: dLog, plank: dPlank, charcoal: dCharcoal,
    firewood_bundle: dLog,
    bandage: dBandage, aspirin: dPill, iodine_tincture: dBottleMed,
    coin_purse: dPouch, meshok_ohotnika: dSack, kotomka: dSack,
    samovar_brass: dSamovar, samovar_squeaky: dSamovar,
    relic_icon_kazan: dIcon, relic_bell_small: dBell, relic_camera: dCamera,
    relic_compass_legasy: dCompass, relic_watch_chain: dWatch,
    relic_ring_wedding: dRing, relic_medal_stanislav: dMedal,
    relic_saber_cossack: dSaber, relic_scales: dScales,
    relic_spinning: dSpinningWheel, relic_teapot_silver: dTeapot,
    relic_map_hand: dMap, relic_gramota: dGramophone, relic_gospel: dIcon,
    relic_sygnum: dIcon, relic_harmon_chromka: dHarmonica,
    relic_samovar_tula: dSamovar, relic_karavai_blessed: dRoundLoaf,
    relic_axe_branded: dAxe, relic_saw_frame: dSaw,
    harmonica: dHarmonica, balalaika: dBalalaika, chess_set: dChess,
    dominoes: null, deck_cards: null,
    compass_brass: dCompass, watch_silver: dWatch, barometer_timofeich: null,
    inkwell: null, argunov_key: null, cross_silver: dIcon, crucifix_wood: dIcon,
    joint_ded: null, mushroom_fun: null, candy_ded: dPryanik,
    plunger_magic: null, hammer_rubber: dHammer, pan_war: dPot, boots_swift: dBoot,
    fishing_rod: function (c) {
      shadow(c);
      L(c, 4, 18.6, 19, 4.4, WOOD, 1.8);
      L(c, 19, 4.4, 19, 12, 'rgba(230,230,220,0.7)', 0.8);
      C(c, 19, 13.4, 1.8, '#b0453a');
      C(c, 4.4, 18.4, 1.4, '#8a6f47');
    },
    hunting_knife: dKnife, scalpel: dKnife, ice_pick: null,
    bear_pelt: function (c, h) { dCoat(c, 20); }, wolf_pelt: function (c, h) { dCoat(c, 210); },
    bearskin_rug: function (c) { shadow(c); E(c, 12, 13, 8, 5.6, '#6b4a2f'); E(c, 12, 11.6, 5.6, 3, '#8a6240'); },
    suhari: dLoaf, rusk: dLoaf, galley_biscuits: dLoaf, baranki: dBaranka,
    tobacco_pipe: null, soap_lump: null, washboard: null,
    skis: null, skis_hunting: null, sledge: null, yoke: null,
    snare_loop: null, snare_wire: null, trap_hare: null, trap_wolf: null,
    gunpowder: dGunpowder, bullet_cast: dBullet, rifle_round: dBullet, shell: dBullet,
    arrow: dArrow, spear: null, ramrod: null,
    wadding: null, sinew: null, scrap_metal: null, staple_iron: null,
    birch_chaga: function (c) { shadow(c); E(c, 12, 12.6, 6.4, 4.6, '#5c4a3a'); E(c, 10.6, 11, 3, 1.8, '#8a7360'); C(c, 15, 13.6, 1.2, '#3a2f26'); },
    fir_needles: null, ivan_grass: null, nettle: null, forest_tea: null,
    tea_chaga_brew: function (c, h) { dCup(c, h, '#6b4a2f'); },
    kvass_flask: dFlask, water_flask: dFlask, flask_empty: dFlask,
    honey_jar: function (c) { dJar(c, 45, '#d9a441'); },
    cranberries_jar: function (c) { dJar(c, 350, '#b03050'); },
    pickles: function (c) { dJar(c, 90, '#6f8c3a'); },
    sugar_loaf: function (c) { shadow(c); TRI(c, 6, 18, 12, 5, 18, 18, '#eee8da'); TRI(c, 7.4, 15, 12, 7.4, 16.6, 15, '#f8f4ec'); },
    salt_bag: dSack, flour_bag: dSack,
    kerosene: null, tar_bucket: null,
    oil_can_gun: function (c) { shadow(c); RR(c, 7, 8, 10, 9, 2, STEEL_D); L(c, 14, 9, 19, 5.6, STEEL, 1.6); C(c, 19, 5.4, 1.2, STEEL); },
    gun_case: null, kitel_feldshera: dShirt, mundir_telegrafa: dCoat,
    medal_bravery: dMedal, gramota_church: dGramophone, mandat_red: dPaper,
    passport: dPaper, road_warrant: dPaper, photo_family: dPaper,
    newspaper_stack: dNewspaper, journal_page: dPaper,
    child_valenki: dValenki, bedroll: dBlanket, blanket: dBlanket,
    linen_sheet: dBlanket, skatka: dBlanket,
    bolt_empty: null,
    hook_line: function (c) {
      shadow(c);
      c.strokeStyle = STEEL; c.lineWidth = 1.7;
      c.beginPath();
      c.moveTo(15, 4); c.quadraticCurveTo(6, 6, 9, 12);
      c.quadraticCurveTo(11.4, 16.4, 15, 13);
      c.stroke();
      c.strokeStyle = SILVER; c.lineWidth = 1;
      c.beginPath(); c.arc(13.4, 17.4, 2.4, -0.4, Math.PI * 1.3); c.stroke();
      C(c, 15, 3.6, 1.3, '#b0453a');
    },
    net_fishing: function (c) {
      shadow(c);
      c.strokeStyle = '#c9b28a'; c.lineWidth = 0.9;
      for (var i = 0; i < 4; i++) L(c, 5 + i * 4.6, 4.4, 3.4 + i * 4.6, 19.4, '#c9b28a', 0.9);
      for (var k = 0; k < 4; k++) L(c, 4, 7 + k * 4, 20, 6 + k * 4, '#c9b28a', 0.9);
      R(c, 4, 3.4, 16, 1.4, '#8a6f47');
    }
  };

  // ====================================================================
  //  ФОЛБЭК: силуэт категории + уникальный узор из хэша.
  //  Гарантирует «у всех предметов — разные значки».
  // ====================================================================

  function fallbackDraw(cat, id) {
    return function (c) {
      var h = hash(id);
      var hue = h % 360;
      var col = hsl(hue, 36, 44);
      shadow(c);
      switch (cat) {
        case 'food': case 'drink':
          dBowl(c, h, col); break;
        case 'weapon': case 'ranged':
          dKnife(c, h); break;
        case 'ammo':
          dBullet(c, h); break;
        case 'light':
          dCandle(c); break;
        case 'fuel':
          dLog(c, h); break;
        case 'med':
          dPill(c, h); break;
        case 'cloth':
          dShirt(c, h); break;
        case 'book':
          dBook(c, h); break;
        case 'container':
          dSack(c, h); break;
        case 'material':
          dClothBolt(c, h); break;
        case 'tool':
          dHammer(c); break;
        default:
          RR(c, 6, 6, 12, 12, 3, col);
      }
      // уникальный акцент: расположение меток зависит от хэша id
      var bits = h % 8;
      var ax = 8 + (bits % 3) * 4, ay = 16 + ((bits >> 2) & 1) * 2.6;
      C(c, ax, ay, 1, hsl((hue + 180) % 360, 60, 62));
      if (bits & 1) C(c, 19 - ax + 5, ay - 1.6, 0.8, hsl((hue + 90) % 360, 60, 55));
      if (bits & 2) L(c, 6, 8.4, 9, 5.4, hsl((hue + 40) % 360, 55, 60), 1);
    };
  }

  // ====================================================================
  //  ВЫБОР РИСОВАЛЬЩИКА И ГЕНЕРАЦИЯ dataURL
  // ====================================================================

  function drawerFor(id) {
    if (EXACT.hasOwnProperty(id)) {
      var fn = EXACT[id];
      if (fn) return fn;
    }
    var idu = String(id);
    for (var i = 0; i < FAMILIES.length; i++) {
      if (FAMILIES[i][0].test(idu)) return FAMILIES[i][1];
    }
    var def = (WS.Data && WS.Data.items && WS.Data.items[id]) || null;
    return fallbackDraw(def ? def.cat : 'misc', id);
  }

  /** dataURL значка предмета (кэш). size — px (по умолчанию 24). */
  function iconUrl(id, size) {
    if (!id) return '';
    size = size || SZ;
    var key = id + '|' + size;
    if (urlCache[key]) return urlCache[key];
    try {
      var cv = document.createElement('canvas');
      cv.width = size; cv.height = size;
      var c = cv.getContext('2d');
      c.imageSmoothingEnabled = false;
      if (size !== SZ) { c.scale(size / SZ, size / SZ); }
      var fn = drawerFor(id);
      fn(c, hash(id));
      var url = cv.toDataURL('image/png');
      urlCache[key] = url;
      return url;
    } catch (e) {
      return '';
    }
  }

  /** Готовый <img> значка (каждый вызов — новый узел). */
  function iconNode(id, cls) {
    var url = iconUrl(id);
    if (!url) {
      // фолбэк на старую иконку категории
      try {
        var def = (WS.Data && WS.Data.items && WS.Data.items[id]) || null;
        if (WS.ToolTip && WS.ToolTip.catIconNode) {
          return WS.ToolTip.catIconNode(def ? def.cat : 'misc', cls);
        }
      } catch (e) { /* пусто */ }
      var s = document.createElement('span');
      s.className = 'no-ico';
      return s;
    }
    var img = document.createElement('img');
    img.src = url;
    img.alt = '';
    if (cls) img.className = cls;
    return img;
  }

  /** Сколько значков уже сгенерировано (диагностика). */
  function generated() { return Object.keys(urlCache).length; }

  WS.def('Icons', {
    iconUrl: iconUrl,
    iconNode: iconNode,
    generated: generated,
    _drawerFor: drawerFor,
    _families: FAMILIES.length
  });

  WS.boot(function initIcons() {
    WS.log('[Icons] Уникальные значки предметов: ' +
           FAMILIES.length + ' семейств рисования, фолбэк с узором из хэша id');
  }, 'icons:init');
})();
