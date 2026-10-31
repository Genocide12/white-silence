// ============================================================
// extract-legacy.mjs — выгружает ВЕСЬ контент оригинальной игры
// (legacy/js/**) в JSON для инкременталки «Топка».
//
// Механика: модули — ES5 IIFE, регистрирующие данные через
// WS.def/WS.boot. Поднимаем их в vm-песочнице с браузерными
// заглушками, прогоняем boot-фазы и сериализуем реестры.
//
// Запуск: node scripts/extract-legacy.mjs
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const LEGACY = path.join(ROOT, 'legacy');
const OUT = path.join(ROOT, 'src', 'game', 'data');

// ---- порядок загрузки: ровно как в index.html, кроме main.js ----
const html = fs.readFileSync(path.join(LEGACY, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/src="(js\/[^"]+\.js)"/g)]
  .map((m) => m[1])
  .filter((f) => !f.endsWith('main.js'));
console.log(`модулей к загрузке: ${scripts.length}`);

// ---- браузерные заглушки ----
function noop() { return undefined; }
function makeCtx2d() {
  const grad = { addColorStop: noop };
  const base = {
    canvas: { width: 0, height: 0 },
    measureText: () => ({ width: 10, actualBoundingBoxAscent: 8 }),
    createLinearGradient: () => grad,
    createRadialGradient: () => grad,
    createPattern: () => ({}),
    getImageData: (_x, _y, w, h) => ({ data: new Uint8ClampedArray(Math.max(4, w * h * 4)), width: w, height: h }),
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    isPointInPath: () => false,
  };
  return new Proxy(base, {
    get(t, p) {
      if (p in t) return t[p];
      // любой прочий метод (fillRect, drawImage, save, restore...) — no-op
      return noop;
    },
    set() { return true; }, // fillStyle = ... молча съедаем
  });
}
function makeCanvas() {
  const c = {
    width: 300, height: 150, style: {},
    getContext: () => makeCtx2d(),
    addEventListener: noop, removeEventListener: noop,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    toDataURL: () => 'data:image/png;base64,',
  };
  return c;
}
function makeElement(tag) {
  if (tag === 'canvas') return makeCanvas();
  const el = {
    tag, style: {}, children: [],
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    setAttribute: noop, getAttribute: () => null, removeAttribute: noop,
    appendChild(child) { this.children.push(child); return child; },
    removeChild: noop, addEventListener: noop, removeEventListener: noop,
    getContext: () => makeCtx2d(),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
  };
  return el;
}

const sandbox = {
  console: { log: noop, warn: noop, error: noop, info: noop, debug: noop },
  Math, Date, JSON, Object, Array, String, Number, Boolean, RegExp, Error,
  parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent,
  unescape, escape,
  setTimeout: () => 0, clearTimeout: noop, setInterval: () => 0, clearInterval: noop,
  requestAnimationFrame: () => 0, cancelAnimationFrame: noop,
  performance: { now: () => Date.now() },
  navigator: { userAgent: 'node-extract', language: 'ru-RU', languages: ['ru'] },
  location: { href: 'http://localhost/', protocol: 'http:', host: 'localhost', search: '', hash: '' },
  localStorage: {
    _s: {},
    getItem(k) { return Object.prototype.hasOwnProperty.call(this._s, k) ? this._s[k] : null; },
    setItem(k, v) { this._s[k] = String(v); },
    removeItem(k) { delete this._s[k]; },
  },
  document: {
    createElement: makeElement,
    createElementNS: (_ns, tag) => makeElement(tag),
    getElementById: () => null,
    getElementsByTagName: () => [],
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: noop, removeEventListener: noop,
    body: makeElement('body'),
    documentElement: makeElement('html'),
    hidden: false,
  },
  Uint8ClampedArray, Uint8Array, Float32Array, Float64Array, Int32Array,
  WeakMap, Map, Set, Promise, Symbol, Proxy, Reflect,
};
sandbox.window = sandbox;
sandbox.self = sandbox;
sandbox.globalThis = sandbox;
sandbox.AudioContext = function AudioContext() {
  return {
    createGain: () => ({ connect: noop, gain: { value: 1, setValueAtTime: noop, linearRampToValueAtTime: noop, exponentialRampToValueAtTime: noop } }),
    createOscillator: () => ({ connect: noop, start: noop, stop: noop, frequency: { value: 0, setValueAtTime: noop, linearRampToValueAtTime: noop } }),
    createBuffer: () => ({ getChannelData: () => new Float32Array(1024) }),
    createBufferSource: () => ({ connect: noop, start: noop, buffer: null }),
    createBiquadFilter: () => ({ connect: noop, frequency: { value: 0 }, Q: { value: 0 }, type: 'lowpass' }),
    createDynamicsCompressor: () => ({ connect: noop }),
    destination: { connect: noop },
    sampleRate: 44100,
    currentTime: 0,
    resume: noop, close: noop,
  };
};
sandbox.webkitAudioContext = sandbox.AudioContext;
sandbox.speechSynthesis = { getVoices: () => [], speak: noop, cancel: noop };
sandbox.Audio = function Audio() { return { play: () => Promise.resolve(), pause: noop, canPlayType: () => '' }; };
sandbox.Image = function Image() { return { addEventListener: noop, style: {} }; };
sandbox.devicePixelRatio = 1;
sandbox.innerWidth = 1280;
sandbox.innerHeight = 720;
sandbox.addEventListener = noop;
sandbox.removeEventListener = noop;
sandbox.atob = (s) => Buffer.from(s, 'base64').toString('binary');
sandbox.btoa = (s) => Buffer.from(s, 'binary').toString('base64');

const ctx = vm.createContext(sandbox);
const loadFailures = [];
for (const rel of scripts) {
  const code = fs.readFileSync(path.join(LEGACY, rel), 'utf8');
  try {
    vm.runInContext(code, ctx, { filename: rel });
  } catch (e) {
    loadFailures.push(`${rel}: ${e.message}`);
  }
}
const WS = sandbox.WS;
if (!WS) {
  console.error('WS не создан — ns.js не загрузился:', loadFailures);
  process.exit(1);
}

// ---- страховка для boot-фаз, которые трогают живую игру ----
sandbox.WS.G = {
  story: { flags: {}, chronicle: [], act: 1 },
  player: { x: 26, y: 97, hp: 100, dead: false },
  day: 1,
};
sandbox.WS.Ui = WS.Ui || { toast: noop };
sandbox.WS.Fx = WS.Fx || { text: noop };

// ---- прогон boot-фаз в порядке регистрации ----
const bootFailures = [];
let ran = 0;
for (const rec of WS._bootFns || []) {
  try {
    rec.fn();
    ran++;
  } catch (e) {
    bootFailures.push(`${rec.name || 'anon'}: ${e.message}`);
  }
}
console.log(`boot-фаз: ${WS._bootFns.length}, выполнено: ${ran}, упало: ${bootFailures.length}`);
if (loadFailures.length) console.log('ОШИБКИ ЗАГРУЗКИ:\n  ' + loadFailures.join('\n  '));
if (bootFailures.length) console.log('ОШИБКИ BOOT:\n  ' + bootFailures.slice(0, 25).join('\n  '));

// ---- сериализация с защитой от функций и циклов ----
function safeJson(value) {
  const seen = new WeakSet();
  return JSON.stringify(value, (k, v) => {
    if (typeof v === 'function') return undefined;
    if (typeof v === 'object' && v !== null) {
      if (seen.has(v)) return undefined;
      seen.add(v);
    }
    if (v instanceof Uint8ClampedArray) return undefined;
    return v;
  });
}

fs.mkdirSync(OUT, { recursive: true });

// ---- что выгружаем: ВСЁ содержимое реестров ----
const dumps = {
  'items.json': WS.Data && WS.Data.items,
  'recipes.json': WS.Data && WS.Data.recipes,
  'loot.json': WS.Data && WS.Data.loot,
  'professions.json': WS.Data && WS.Data.professions,
  'start-kits.json': WS.StartKits,
  'loot-professions.json': WS.LootProfessions,
  'town.json': WS.GenTown && WS.GenTown.town,
  'almanac.json': WS.Almanac,
  'animals.json': WS.Animals,
  'bestiary.json': WS.Bestiary,
  'proverbs.json': WS.Proverbs && WS.Proverbs.bank,
  'quotes.json': WS.Quotes,
  'dreams.json': WS.Dreams,
  'radio.json': WS.Radio,
  'gazette.json': WS.Gazette,
  'notes.json': WS.Notes,
  'lore.json': WS.Lore,
  'endings.json': WS.Endings,
  'calendar.json': WS.Calendar,
  'winter-rules.json': WS.Rules,
  'farewell.json': WS.Farewell,
  'carols.json': WS.Carols,
  'epitaph.json': WS.Epitaph,
  'story.json': WS.Story,
  'events.json': WS.Events,
  'encounters.json': WS.Encounters,
  'skills.json': WS.Skills,
  'achievements.json': WS.Ach,
  'quests.json': WS.Quests,
  'dialogues.json': WS.Dialogues,
  'christmas.json': WS.Christmas,
  'difficulty.json': WS.Difficulty,
};

let okFiles = 0;
for (const [name, data] of Object.entries(dumps)) {
  if (data === undefined || data === null) {
    console.log(`⏭  ${name}: реестр пуст`);
    continue;
  }
  const json = safeJson(data);
  if (!json || json === '{}' || json === '[]' || json === 'null') {
    console.log(`⏭  ${name}: пусто после сериализации`);
    continue;
  }
  fs.writeFileSync(path.join(OUT, name), json);
  okFiles++;
  // краткая сводка
  let size = json.length;
  let count = '?';
  try {
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed)) count = String(parsed.length);
    else if (parsed && typeof parsed === 'object') count = String(Object.keys(parsed).length);
  } catch { /* ignore */ }
  const kb = (size / 1024).toFixed(1);
  console.log(`✅ ${name}: ${count} записей, ${kb} KB`);
}

// ---- i18n: словари RU/EN (WS.Data.locales) ----
const locales = WS.Data && WS.Data.locales;
if (locales && Object.keys(locales).length) {
  for (const lang of Object.keys(locales)) {
    const dict = locales[lang];
    const n = Object.keys(dict || {}).length;
    if (n) {
      fs.writeFileSync(path.join(OUT, `i18n-${lang}.json`), safeJson(dict));
      console.log(`✅ i18n-${lang}.json: ${n} ключей`);
    }
  }
} else {
  console.log('⏭  локали не найдены в WS.Data.locales');
}

// ---- данные через API реестров (закрытые переменные) ----
function tryDump(name, fn) {
  try {
    const data = fn();
    if (data === undefined || data === null) return console.log(`⏭  ${name}: API вернул пусто`);
    const json = safeJson(data);
    if (!json || json === '{}' || json === '[]') return console.log(`⏭  ${name}: пусто после сериализации`);
    fs.writeFileSync(path.join(OUT, name), json);
    let count = '?';
    try {
      const p = JSON.parse(json);
      count = Array.isArray(p) ? String(p.length) : String(Object.keys(p).length);
    } catch { /* ok */ }
    console.log(`✅ ${name}: ${count} записей, ${(json.length / 1024).toFixed(1)} KB`);
  } catch (e) {
    console.log(`⚠️  ${name}: ${e.message}`);
  }
}

tryDump('achievements.json', () => WS.Ach && WS.Ach.list && WS.Ach.list());
tryDump('lore.json', () => WS.Lore && WS.Lore.all && WS.Lore.all());
tryDump('death-causes.json', () => {
  if (!WS.Epitaph || !WS.Epitaph.list) return null;
  const list = WS.Epitaph.list();
  return list.map((c) => {
    const full = WS.Epitaph.for(c.name);
    return full ? { id: full.id, name: full.name, quote: full.quote, epitaph: full.epitaph } : c;
  });
});
tryDump('story-acts.json', () => {
  if (!WS.Story) return null;
  const acts = [];
  for (const d of [1, 20, 40, 45, 55, 60]) {
    try {
      acts.push({ day: d, act: WS.Story.act ? WS.Story.act(d) : null, name: WS.Story.actName ? WS.Story.actName(d) : null });
    } catch { /* ignore */ }
  }
  return acts;
});

// ---- здания посёлка: парсинг meta()-вызовов в gen_town.js ----
{
  const src = fs.readFileSync(path.join(LEGACY, 'js/world/gen_town.js'), 'utf8');
  const names = new Map();
  for (const m of src.matchAll(/meta\('([a-z_0-9]+)',\s*'([^']+)'/g)) names.set(m[1], m[2]);
  // размеры/веса из реестра BUILD
  const build = {};
  for (const m of src.matchAll(/([a-z_0-9]+):\s*\{\s*fn:\s*\w+,\s*w0:\s*(\d+),\s*w1:\s*(\d+),\s*h0:\s*(\d+),\s*h1:\s*(\d+),\s*wt:\s*(\d+)\s*\}/g)) {
    build[m[1]] = { w0: +m[2], w1: +m[3], h0: +m[4], h1: +m[5], wt: +m[6] };
  }
  const buildings = [...names.entries()].map(([type, name]) => ({
    type, name,
    ...(build[type] || {}),
  }));
  fs.writeFileSync(path.join(OUT, 'buildings.json'), safeJson(buildings));
  console.log(`✅ buildings.json: ${buildings.length} типов зданий (${Object.keys(build).length} с размерами)`);
}

console.log(`\nИтого файлов: ${okFiles} в ${OUT}`);
