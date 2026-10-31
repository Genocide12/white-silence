// t05_localization.js — ЛОКАЛИЗАЦИЯ: парность ключей, русские имена ВСЕХ
// предметов, смешанные строки, битые символы, дубли id.
import { ctx, makeT } from './helpers.js';

const BASE = process.argv[2];
const T = makeT('t05_localization');

const run = async () => {
  const { browser, page, errors } = await ctx(BASE);
  try {
    // === 1. ПАРНОСТЬ КЛЮЧЕЙ ru/en ===
    const parity = await page.evaluate(() => {
      const ru = WS.Data.locales.ru || {};
      const en = WS.Data.locales.en || {};
      const ruOnly = [], enOnly = [];
      for (const k in ru) if (!Object.prototype.hasOwnProperty.call(en, k)) ruOnly.push(k);
      for (const k in en) if (!Object.prototype.hasOwnProperty.call(ru, k)) enOnly.push(k);
      return { ru: Object.keys(ru).length, en: Object.keys(en).length, ruOnly: ruOnly.length, enOnly: enOnly.length, enOnlySample: enOnly.slice(0, 5) };
    });
    console.log(`    ключей: ru=${parity.ru}, en=${parity.en}, только-ru=${parity.ruOnly}, только-en=${parity.enOnly}`);
    T.ok(parity.ru > 900, 'словарь ru достаточно полный (' + parity.ru + ' ключей)');
    // en-only допустимы (by design: заметки), ru-only — проблема для EN-игрока,
    // но контент русскоязычен по дизайну; фиксируем как информацию
    console.log('    en-only примеры: ' + parity.enOnlySample.join(', '));

    // === 2. РУССКИЕ ИМЕНА ВСЕХ ПРЕДМЕТОВ (главный баг: 133 англ. имени) ===
    const names = await page.evaluate(() => {
      const items = WS.Data.items;
      const bad = [];
      for (const id in items) {
        const nm = WS.Inv.nameOf(id);
        // английское smart-fallback: каждое слово с заглавной, только латиница
        if (/^[A-Z][a-z]+( [A-Za-z]+)*$/.test(nm) && !/[а-яё]/i.test(nm)) {
          bad.push(id + '→"' + nm + '"');
        }
      }
      return { total: Object.keys(items).length, bad };
    });
    T.ok(names.bad.length === 0,
      `ВСЕ предметы имеют русские имена (${names.total} шт.)` +
      (names.bad.length ? ' — английские: ' + names.bad.slice(0, 10).join(', ') : ''));
    if (names.bad.length) console.log('    все англ.: ' + names.bad.slice(0, 25).join(', '));

    // === 3. СМЕШАННЫЕ СТРОКИ в значениях словарей ===
    const mixed = await page.evaluate(() => {
      const bad = [];
      const check = (dict, lang) => {
        for (const k in dict) {
          const v = String(dict[k]);
          // кириллица в en-словаре или латиница-слова в ru-значениях (кроме плейсхолдеров)
          if (lang === 'en' && /[а-яё]/i.test(v)) bad.push('en:' + k);
          if (lang === 'ru') {
            const stripped = v.replace(/\{[^}]+\}/g, '');
            if (/(^|[^A-Za-zÀ-ÿ])(the|and|with|until|need|not|have|you|is|are)([^A-Za-zÀ-ÿ]|$)/i.test(stripped)) {
              bad.push('ru:' + k + '→"' + v.slice(0, 40) + '"');
            }
          }
        }
      };
      check(WS.Data.locales.ru || {}, 'ru');
      check(WS.Data.locales.en || {}, 'en');
      return bad;
    });
    T.ok(mixed.length === 0, 'словари не смешивают языки' + (mixed.length ? ' — ' + mixed.slice(0, 8).join(', ') : ''));

    // === 4. БИТЫЕ СИМВОЛЫ в контенте (читаемом игроком) ===
    const broken = await page.evaluate(() => {
      const bad = [];
      const re = /(\uFFFD|[а-яё][a-z]+[а-яё]|[a-z]+[а-яё]|ArgumentNullException|,ittings|Вorem|Кrest|vizhи)/i;
      const sources = [
        { name: 'notes', arr: (WS.Notes && Array.isArray(WS.Notes.all)) ? WS.Notes.all : [] },
      ];
      for (const src of sources) {
        for (const n of src.arr) {
          const text = [n.title, n.text].filter(Boolean).join(' ');
          if (re.test(text)) bad.push(src.name + ':' + (n.id || '?'));
        }
      }
      return bad;
    });
    T.ok(broken.length === 0, 'записки без битых слов' + (broken.length ? ' — ' + broken.join(', ') : ''));

    // === 5. ДУБЛИ ПРЕДМЕТОВ (prianik/pryanik и подобные) ===
    const dupes = await page.evaluate(() => {
      const items = WS.Data.items;
      const seen = {};
      const bad = [];
      for (const id in items) {
        let nm = items[id] && items[id].name;
        if (!nm) nm = WS.Inv.nameOf(id);
        const key = String(nm).toLowerCase().replace(/ё/g, 'е').replace(/[^а-я0-9]/g, '');
        if (key && seen[key]) bad.push(seen[key] + ' + ' + id + ' ("' + nm + '")');
        else if (key) seen[key] = id;
      }
      return bad;
    });
    T.ok(dupes.length === 0, 'нет предметов-двойников с одинаковыми именами' +
      (dupes.length ? ' — ' + dupes.join(', ') : ''));

    // === 6. ПЕРЕКЛЮЧЕНИЕ ЯЗЫКА не ломает UI ===
    const langSwitch = await page.evaluate(() => {
      try {
        WS.I18N.setLang('en');
        const enOk = typeof WS.I18N.t('ui.ship.left') === 'string';
        WS.I18N.setLang('ru');
        const ruOk = WS.I18N.t('ui.ship.left') === 'до парохода';
        return { enOk, ruOk };
      } catch (e) {
        return { enOk: false, ruOk: false, err: e.message };
      }
    });
    T.ok(langSwitch.enOk && langSwitch.ruOk, 'переключение ru↔en работает' +
      (langSwitch.err ? ' — ' + langSwitch.err : ''));

    // === 7. ФОРМЫ ДНЕЙ (фикс «until the steamship: 59 дней») ===
    const dayWord = await page.evaluate(() => {
      try {
        WS.I18N.setLang('en');
        const w1 = WS.I18N.t('ui.day.one');
        const wMany = WS.I18N.t('ui.day.many');
        WS.I18N.setLang('ru');
        const ru1 = WS.I18N.t('ui.day.one');
        return { en1: w1, enMany: wMany, ru1 };
      } catch (e) { return { err: e.message }; }
    });
    T.ok(/day/i.test(dayWord.en1 || '') && /день/i.test(dayWord.ru1 || ''),
      'формы дней в обоих словарях (' + dayWord.ru1 + '/' + dayWord.en1 + ')');

    T.eq(errors.length, 0, 'ошибок консоли нет' + (errors.length ? ': ' + errors[0] : ''));
    errors.slice(0, 5).forEach(e => console.log('    ' + e));
  } finally {
    await browser.close();
  }
  const r = T.finish();
  process.exit(r.failed ? 1 : 0);
};

run().catch(e => { console.error('FAIL', e); process.exit(2); });
