// Проверка item_icons.js: покрытие всех предметов + рисование без ошибок.
// Заглушка canvas-контекста — проверяем, что drawerFor(id) есть и draw не падает.
const fs = require('fs');

// --- собираем все id предметов из js/data/*.js ---
const files = fs.readdirSync('js/data').filter(f => f.endsWith('.js'));
const ids = new Set();
for (const f of files) {
  const t = fs.readFileSync('js/data/' + f, 'utf8');
  const re = /id:\s*'([a-z0-9_]+)'/g;
  let m;
  while ((m = re.exec(t))) ids.add(m[1]);
}
// плюс предметы деда
ids.add('joint_ded'); ids.add('mushroom_fun'); ids.add('tincture_fly');
ids.add('candy_ded'); ids.add('plunger_magic'); ids.add('hammer_rubber');
ids.add('pan_war'); ids.add('boots_swift');
console.log('предметов найдено:', ids.size);

// --- мини-DOM заглушка ---
const calls = [];
const ctxStub = new Proxy({}, {
  get(t, prop) {
    if (prop === 'fillStyle' || prop === 'strokeStyle' || prop === 'lineWidth' ||
        prop === 'lineCap') return t[prop];
    return function (...a) { calls.push(prop); if (prop === 'createLinearGradient') return { addColorStop(){} }; return undefined; };
  },
  set(t, p, v) { t[p] = v; return true; }
});
global.document = {
  createElement() {
    return {
      width: 0, height: 0,
      getContext() { return ctxStub; },
      toDataURL() { return 'data:image/png;base64,x'; }
    };
  }
};
global.window = {};

// --- загружаем WS-каркас + модуль ---
const WS = { defs: {}, boot(fn, n) { this._boots = this._boots || []; this._boots.push([fn, n]); },
  def(n, o) { this.defs[n] = o; this[n] = o; }, log() {}, err() {} };
global.WS = WS;
// данные предметов не грузим — фолбэк использует cat 'misc'
eval(fs.readFileSync('js/systems/item_icons.js', 'utf8'));
// запускаем boot
for (const [fn] of (WS._boots || [])) fn();

const Icons = WS.Icons;
if (!Icons) { console.error('FAIL: WS.Icons не определён'); process.exit(1); }

let ok = 0, fail = 0, fallbacks = [];
for (const id of ids) {
  calls.length = 0;
  try {
    const url = Icons.iconUrl(id, 24);
    if (url && calls.length > 0) { ok++; }
    else { fail++; console.log('FAIL (пусто):', id); }
    // определить, фолбэк ли (по счётчику сложно — проверим drawerFor)
  } catch (e) {
    fail++;
    console.log('FAIL', id, e.message);
  }
}
console.log('нарисовано без ошибок:', ok, '/ неудач:', fail);

// покрытие: у скольких предметов СВОЙ рисовальщик (не фолбэк)
let own = 0, fb = 0;
for (const id of ids) {
  const fn = Icons._drawerFor(id);
  if (fn.name && fn.name.startsWith('fallbackDraw')) { fb++; fallbacks.push(id); }
  else own++;
}
console.log('семейные/точные значки:', own, '· фолбэк с узором:', fb);
console.log('фолбэк-предметы:', fallbacks.join(' '));
