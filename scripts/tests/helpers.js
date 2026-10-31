// helpers.js — общие утилиты тестов «Белого Безмолвия» (Playwright).
import { createRequire } from 'module';
export const require2 = createRequire('/home/z/.npm-global/lib/node_modules/');
import { chromium } from 'playwright';

export const SEED = 1917;
export const PROF = 'telegraph';

/** Контекст одного теста: браузер+страница+лог ошибок. */
export async function ctx(base, opts = {}) {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: opts.width || 1600, height: opts.height || 900 }
  });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => {
    if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 200));
  });
  await page.goto(base, { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(opts.bootWait || 3500);
  return { browser, page, errors };
}

/** Старт новой партии (как демо, но без автопилота). */
export async function startGame(page) {
  return page.evaluate((args) => {
    try {
      const ok = WS.Main.newGame(args.prof, args.traits, args.seed);
      if (!ok) return { ok: false, reason: 'newGame вернул false' };
      try { WS.Ui.unpause(); } catch (e) { /* пусто */ }
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: e.message };
    }
  }, { prof: PROF, traits: ['frostproof', 'patient'], seed: SEED });
}

/** Дать предметы и дождаться появления в инвентаре. */
export async function give(page, items) {
  return page.evaluate((list) => {
    const out = {};
    for (const it of list) {
      try { out[it.id] = WS.Inv.give(it.id, it.n || 1); } catch (e) { out[it.id] = 'ERR ' + e.message; }
    }
    return out;
  }, items);
}

export async function countOf(page, id) {
  return page.evaluate((x) => WS.Inv.count(x), id);
}

/** Найти объект мира по предикату (в контексте страницы). */
export function findObjSrc(predName) {
  // сериализуемый фрагмент: выполняется в странице
  return `(function(){
    const objs = WS.World.objects;
    const pred = ${predName};
    for (let i = 0; i < objs.length; i++) if (pred(objs[i])) return objs[i];
    return null;
  })()`;
}

/** Простой ассерт-счётчик. */
export function makeT(name) {
  const results = [];
  return {
    ok(cond, label) {
      results.push({ pass: !!cond, label: String(label) });
      console.log((cond ? '  ✓ ' : '  ✗ ') + label);
      return !!cond;
    },
    eq(a, b, label) {
      const pass = a === b;
      results.push({ pass, label: `${label} (${JSON.stringify(a)} ${pass ? '==' : '!='} ${JSON.stringify(b)})` });
      console.log((pass ? '  ✓ ' : '  ✗ ') + label + ` [${JSON.stringify(a)} vs ${JSON.stringify(b)}]`);
      return pass;
    },
    finish() {
      const failed = results.filter(r => !r.pass);
      console.log(`${name}: ${results.length - failed.length}/${results.length} PASS`);
      return { name, total: results.length, failed: failed.length, results };
    }
  };
}
