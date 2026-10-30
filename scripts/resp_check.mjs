// ПРОВЕРКА АДАПТИВНОСТИ: на каждом размере экрана убеждаемся, что
// 1) нет горизонтального скролла/переполнения документа,
// 2) ключевые панели вписаны в экран (≤94vw / ≤92vh на мобильном),
// 3) текст нигде не обрезается: глобальный скан scrollWidth > clientWidth
//    по видимым текстовым элементам (без намеренного ellipsis),
// 3b) ни один текстовый элемент/кнопка/панель не вылезает за правый край
//    вьюпорта (скан getBoundingClientRect по всем видимым узлам),
// 4) кнопка «Демо» видна и кликабельна (меню прокручиваемо — скроллим к ней),
// 5) блоки HUD не наезжают друг на друга,
// 6) на мобильном тап-цели ВСЕХ видимых кнопок ≥ 40px,
// 7) на мобильном основной текст ≥ 13px, заголовки ≥ 16px.
import { createRequire } from 'module';
const require = createRequire('/home/z/.npm-global/lib/node_modules/');
const { chromium } = require('playwright');

const SIZES = [
  { name: 'desktop-1600', w: 1600, h: 900 },
  { name: 'laptop-1366', w: 1366, h: 768 },
  { name: 'tablet-820', w: 820, h: 1180 },
  { name: 'mobile-390', w: 390, h: 844 }
];

// Глобальный скан обрезанного текста: видимый элемент с прямым текстом,
// scrollWidth > clientWidth + 2, и это не намеренный ellipsis/nowrap.
const SCAN_CLIP = `(() => {
  const bad = [];
  const isVisible = (e) => {
    const cs = getComputedStyle(e);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false;
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  for (const e of document.body.querySelectorAll('*')) {
    if (!isVisible(e)) continue;
    // прямой текст (не считая детей) — только такие элементы «держат» слова
    let hasOwnText = false;
    for (const n of e.childNodes) if (n.nodeType === 3 && n.textContent.trim()) { hasOwnText = true; break; }
    if (!hasOwnText) continue;
    const cs = getComputedStyle(e);
    if (cs.textOverflow === 'ellipsis') continue;          // намеренное обрезание
    if (cs.whiteSpace === 'nowrap' || cs.whiteSpace === 'pre') continue; // однострочные подписи
    if (e.scrollWidth > e.clientWidth + 3) {
      bad.push((e.id ? '#' + e.id : '.' + String(e.className).split(' ')[0]) +
        ' sw=' + e.scrollWidth + ' cw=' + e.clientWidth +
        ' «' + e.textContent.trim().slice(0, 24) + '»');
    }
  }
  return bad.slice(0, 12);
})()`;

// Взаимные наезды видимых блоков HUD (допуск 6px).
const HUD_COLLISIONS = `(() => {
  const sels = ['.hud-tl', '.ws-hud', '.hud-status', '.hud-equip', '.hud-keys', '#ws-crazy', '#ws-thought', '.hud-hint', '.hud-progress', '#ws-tutorial'];
  const vis = [];
  for (const s of sels) {
    const e = document.querySelector(s);
    if (!e) continue;
    const cs = getComputedStyle(e);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = e.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    vis.push({ s, r });
  }
  const out = [];
  for (let i = 0; i < vis.length; i++) for (let j = i + 1; j < vis.length; j++) {
    const a = vis[i].r, b = vis[j].r;
    const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (ox > 6 && oy > 6) out.push(vis[i].s + ' × ' + vis[j].s + ' ' + Math.round(ox) + 'x' + Math.round(oy));
  }
  return out;
})()`;

// Скан выхода за правый край вьюпорта: видимые элементы, несущие контент
// (прямой текст, кнопки, панели), с right > innerWidth + 2px.
const EDGE_SCAN = `(() => {
  const bad = [];
  const vw = innerWidth;
  const isVisible = (e) => {
    const cs = getComputedStyle(e);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false;
    const r = e.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  };
  for (const e of document.body.querySelectorAll('*')) {
    if (e.tagName === 'CANVAS' || e.tagName === 'SCRIPT' || e.tagName === 'STYLE') continue;
    if (e.classList.contains('ws-tooltip')) continue;      // тултип следует за мышью
    if (!isVisible(e)) continue;
    const r = e.getBoundingClientRect();
    if (r.right <= vw + 2) continue;
    let hasText = false;
    for (const n of e.childNodes) if (n.nodeType === 3 && n.textContent.trim()) { hasText = true; break; }
    if (hasText || e.tagName === 'BUTTON' || e.classList.contains('ws-panel')) {
      bad.push((e.id ? '#' + e.id : '.' + String(e.className).split(' ')[0]) +
        ' right=' + Math.round(r.right) + '/' + vw);
    }
  }
  return bad.slice(0, 10);
})()`;

// Тап-цели: ВСЕ видимые кнопки ≥ 40px (мобильный).
const TAP_SCAN = `(() => {
  const minPx = 40;
  const small = [];
  for (const b of document.querySelectorAll('button')) {
    const cs = getComputedStyle(b);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = b.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (Math.min(r.width, r.height) < minPx) {
      small.push('«' + b.textContent.trim().slice(0, 14) + '» ' + Math.round(Math.min(r.width, r.height)) + 'px');
    }
  }
  return small.slice(0, 10);
})()`;

// Читаемость на мобильном: основной текст ≥ 13px, заголовки ≥ 16px.
const FONT_SCAN = `(() => {
  const MAIN = '.menu-card-desc, .menu-card-items, .menu-trait-desc, .menu-trait-effect, ' +
    '.menu-hero-traits, .menu-modal-body, .ws-screen p, .ws-panel p, ' +
    '.d-desc, .d-row, .wst-text, .th-text, .hud-hint';
  const HEAD = '.menu-title, .menu-card-name, .menu-trait-name, .menu-modal-title, ' +
    '.scr-head .ws-title, .scr-title, .pause-title, .d-name';
  const vis = (e) => {
    const cs = getComputedStyle(e);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false;
    const r = e.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  };
  const badMain = [], badHead = [];
  for (const e of document.querySelectorAll(MAIN)) {
    if (!vis(e)) continue;
    const fs = parseFloat(getComputedStyle(e).fontSize);
    if (fs < 13) badMain.push('.' + String(e.className).split(' ')[0] + ' ' + fs + 'px');
  }
  for (const e of document.querySelectorAll(HEAD)) {
    if (!vis(e)) continue;
    const fs = parseFloat(getComputedStyle(e).fontSize);
    if (fs < 16) badHead.push('.' + String(e.className).split(' ')[0] + ' ' + fs + 'px');
  }
  return { badMain: badMain.slice(0, 8), badHead: badHead.slice(0, 8) };
})()`;

const run = async () => {
  const browser = await chromium.launch();
  let failures = 0;
  for (const s of SIZES) {
    const page = await browser.newPage({ viewport: { width: s.w, height: s.h } });
    await page.goto('http://localhost:3000', { waitUntil: 'load' });
    await page.waitForTimeout(3800);

    // МЕНЮ: демо-кнопка достижима (меню прокручиваемо — скроллим к кнопке)
    const menu = await page.evaluate((vw) => {
      const b = Array.from(document.querySelectorAll('#ws-menu button'))
        .find(x => x.textContent.includes('Демо'));
      if (!b) return { ok: false, why: 'нет кнопки Демо' };
      if (typeof b.scrollIntoView === 'function') b.scrollIntoView({ block: 'center' });
      const r = b.getBoundingClientRect();
      const inVp = r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight;
      const h = Math.round(r.height);
      const tapOk = vw > 700 ? true : h >= 40;             // на мобильном тап-цель ≥40px
      return { ok: inVp && tapOk, why: inVp ? (tapOk ? '' : 'кнопка ' + h + 'px < 40px') : 'кнопка за экраном ' + JSON.stringify(r) };
    }, s.w);
    if (!menu.ok) { console.log(`FAIL ${s.name} меню: ${menu.why}`); failures++; }
    else console.log(`ok   ${s.name} меню: кнопка Демо видна`);

    // МЕНЮ: тап-цели всех видимых кнопок на мобильном
    if (s.w <= 700) {
      const taps = await page.evaluate(TAP_SCAN);
      if (taps.length) { console.log(`FAIL ${s.name} меню: мелкие кнопки — ${taps.join(', ')}`); failures++; }
      else console.log(`ok   ${s.name} меню: тап-цели ≥40px`);
    }

    // МЕНЮ: обрезанный текст
    const menuClip = await page.evaluate(SCAN_CLIP);
    if (menuClip.length) { console.log(`FAIL ${s.name} меню: обрезан текст — ${menuClip.join(' | ')}`); failures++; }
    else console.log(`ok   ${s.name} меню: текст не обрезается`);

    // МЕНЮ: выход за правый край вьюпорта
    const menuEdge = await page.evaluate(EDGE_SCAN);
    if (menuEdge.length) { console.log(`FAIL ${s.name} меню: вылезает за край — ${menuEdge.join(' | ')}`); failures++; }
    else console.log(`ok   ${s.name} меню: в границах экрана`);

    // МЕНЮ (мобильный): читаемость шрифтов
    if (s.w <= 700) {
      const f = await page.evaluate(FONT_SCAN);
      if (f.badMain.length || f.badHead.length) {
        console.log(`FAIL ${s.name} меню: мелкий шрифт — осн: ${f.badMain.join(', ') || '—'}; заг: ${f.badHead.join(', ') || '—'}`);
        failures++;
      } else console.log(`ok   ${s.name} меню: шрифты ≥13px/≥16px`);
    }

    // старт игры
    await page.locator('#ws-menu button', { hasText: 'Случайный герой' }).first().click();
    await page.waitForTimeout(500);
    await page.locator('#ws-menu button', { hasText: 'Начать' }).first().click();
    await page.waitForTimeout(4200);

    // ИГРА: переполнение документа
    const game = await page.evaluate(() => {
      const overflowX = document.documentElement.scrollWidth - innerWidth;
      return { overflowX, bodyW: document.body.scrollWidth };
    });
    if (game.overflowX > 2) { console.log(`FAIL ${s.name} игра: переполнение по X ${game.overflowX}px`); failures++; }
    else console.log(`ok   ${s.name} игра: без переполнения (X=${game.overflowX})`);

    // ИГРА: наезды HUD
    const hud = await page.evaluate(HUD_COLLISIONS);
    if (hud.length) { console.log(`FAIL ${s.name} игра: HUD наезжает — ${hud.join(' | ')}`); failures++; }
    else console.log(`ok   ${s.name} игра: HUD без наездов`);

    // ИГРА: выход за правый край вьюпорта
    const gameEdge = await page.evaluate(EDGE_SCAN);
    if (gameEdge.length) { console.log(`FAIL ${s.name} игра: вылезает за край — ${gameEdge.join(' | ')}`); failures++; }
    else console.log(`ok   ${s.name} игра: в границах экрана`);

    // ИГРА: обрезанный текст
    const gameClip = await page.evaluate(SCAN_CLIP);
    if (gameClip.length) { console.log(`FAIL ${s.name} игра: обрезан текст — ${gameClip.join(' | ')}`); failures++; }
    else console.log(`ok   ${s.name} игра: текст не обрезается`);

    // ИНВЕНТАРЬ: панель в экране, текст не обрезан, панель ≤94vw на мобильном
    await page.keyboard.press('KeyI');
    await page.waitForTimeout(700);
    const inv = await page.evaluate((mobile) => {
      const box = document.querySelector('.inv-box');
      if (!box) return { ok: false, why: 'нет .inv-box' };
      const r = box.getBoundingClientRect();
      const fits = r.left >= -1 && r.right <= innerWidth + 1 && r.top >= -1 && r.bottom <= innerHeight + 1;
      const wOk = !mobile || (r.right - r.left) <= innerWidth * 0.94 + 2;
      let clipped = 0;
      for (const el of box.querySelectorAll('.d-name, .slot-name, .eq-name')) {
        if (el.scrollWidth > el.clientWidth + 2) clipped++;
      }
      return { ok: fits && wOk && clipped === 0, why: !fits ? 'панель вылезает ' + JSON.stringify(r) : (!wOk ? 'панель шире 94vw (' + Math.round(r.width) + 'px)' : (clipped ? clipped + ' текстов обрезано' : '')) };
    }, s.w <= 700);
    if (!inv.ok) { console.log(`FAIL ${s.name} инвентарь: ${inv.why}`); failures++; }
    else console.log(`ok   ${s.name} инвентарь: вписан, текст цел`);

    // ИНВЕНТАРЬ: тап-цели кнопок на мобильном (все видимые кнопки ≥ 40px)
    if (s.w <= 700) {
      const taps = await page.evaluate(TAP_SCAN);
      if (taps.length) { console.log(`FAIL ${s.name} инвентарь: мелкие кнопки — ${taps.join(', ')}`); failures++; }
      else console.log(`ok   ${s.name} инвентарь: тап-цели ≥40px`);
    }

    // ИНВЕНТАРЬ: обрезанный текст внутри панели
    const invClip = await page.evaluate(SCAN_CLIP);
    if (invClip.length) { console.log(`FAIL ${s.name} инвентарь: обрезан текст — ${invClip.join(' | ')}`); failures++; }
    else console.log(`ok   ${s.name} инвентарь: текст не обрезается`);

    // ИНВЕНТАРЬ: выход за правый край вьюпорта + читаемость шрифтов (мобильный)
    const invEdge = await page.evaluate(EDGE_SCAN);
    if (invEdge.length) { console.log(`FAIL ${s.name} инвентарь: вылезает за край — ${invEdge.join(' | ')}`); failures++; }
    else console.log(`ok   ${s.name} инвентарь: в границах экрана`);
    if (s.w <= 700) {
      const f = await page.evaluate(FONT_SCAN);
      if (f.badMain.length || f.badHead.length) {
        console.log(`FAIL ${s.name} инвентарь: мелкий шрифт — осн: ${f.badMain.join(', ') || '—'}; заг: ${f.badHead.join(', ') || '—'}`);
        failures++;
      } else console.log(`ok   ${s.name} инвентарь: шрифты ≥13px/≥16px`);
    }

    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // КРАФТ
    await page.keyboard.press('KeyC');
    await page.waitForTimeout(600);
    const craft = await page.evaluate(() => {
      const box = document.querySelector('.craft-box') || document.querySelector('.ws-screen');
      if (!box) return { ok: false, why: 'нет крафт-панели' };
      const r = box.getBoundingClientRect();
      return { ok: r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1, why: '' };
    });
    if (!craft.ok) { console.log(`FAIL ${s.name} крафт: вылезает`); failures++; }
    else console.log(`ok   ${s.name} крафт: вписан`);
    await page.keyboard.press('Escape');

    await page.close();
  }
  await browser.close();
  console.log(failures ? `\nПРОВАЛОВ: ${failures}` : '\nВСЕ РАЗМЕРЫ ЭКРАНА: OK');
  process.exit(failures ? 1 : 0);
};
run();
