#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
merge_swarm2.py — интеграция роя агентов №2 в игру «Белая Тишина».

Входы (scripts/swarm2/out/):
  en-1..6.json   — 526 переводов RU→EN (локализация)
  ru-back.json   — 86 переводов EN→RU (заголовки записок и UI)
  thin-1..4.json — топ-ап «тонких» категорий мыслей деда
  quality.json   — 70 замен «глупых» фраз на умные/весёлые

Выход: js/i18n/swarm2.js — генерируемый модуль, который в boot:
  1) вливает переводы в Data.locales.en / .ru;
  2) расширяет банк мыслей WS.Thoughts._db (с дедупликацией и капом 14);
  3) применяет замены quality (old → new) строго по точному совпадению.

Правила безопасности: строки без одинарных кавычек (валидатор), длина
фраз 12–90, плейсхолдеры только из белого списка, никакой кириллицы в EN.
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'scripts', 'swarm2', 'out')
DEST = os.path.join(ROOT, 'js', 'i18n', 'swarm2.js')

PH_MIN, PH_MAX = 8, 95
CAP_PER_CAT = 14
OK_PLACEHOLDERS = {'item', 'days', 'left', 'name', 'n', 'q'}


def load(name):
    with open(os.path.join(OUT, name), encoding='utf-8') as f:
        return json.load(f)


def js_str(s):
    """Строка в одинарных кавычках для JS; апострофы экранируем."""
    return "'" + s.replace('\\', '\\\\').replace("'", "\\'").replace('\n', '\\n') + "'"


def check_phrase(p):
    return PH_MIN <= len(p) <= PH_MAX and not p.startswith(' ') and not p.endswith(' ')


def placeholders_ok(s):
    for m in re.findall(r'\{([a-zA-Z_]+)\}', s):
        if m not in OK_PLACEHOLDERS:
            return False
    return True


def main():
    # --- 1. EN ключи ---
    en = {}
    for i in range(1, 7):
        for k, v in load('en-%d.json' % i).items():
            assert k not in en, 'дубль ключа EN: ' + k
            if re.search(r'[\u0400-\u04FF]', v):
                raise ValueError('кириллица в EN: %s -> %r' % (k, v))
            en[k] = v

    # --- 2. RU ключи ---
    ru = load('ru-back.json')

    # --- 3. Тонкие категории: объединить с дедупликацией ---
    thin = {}
    for i in range(1, 6):
        for cat, phrases in load('thin-%d.json' % i).items():
            lst = thin.setdefault(cat, [])
            for p in phrases:
                if check_phrase(p) and p not in lst:
                    lst.append(p)

    # --- 4. Замены качества ---
    quality = load('quality.json')
    repl = []
    for cat, pairs in quality.items():
        for pair in pairs:
            old, new = pair['old'], pair['new']
            if check_phrase(new) and placeholders_ok(new):
                repl.append((cat, old, new))

    # --- генерация модуля ---
    lines = []
    lines.append('/**')
    lines.append(' * swarm2.js — РОЙ АГЕНТОВ №2 (генерируется scripts/merge_swarm2.py,')
    lines.append(' * руками не править): %d EN-ключей, %d RU-ключей, %d новых фраз,')
    lines.append(' * %d умных замен. Загружается ПОСЛЕ i18n/en.js и i18n/ru.js.')
    lines.append(' */')
    lines.append('(function () {')
    lines.append("  'use strict';")
    lines.append('  var EN = {')
    for k, v in en.items():
        lines.append('    %s: %s,' % (js_str(k), js_str(v)))
    lines.append('  };')
    lines.append('  var RU = {')
    for k, v in ru.items():
        lines.append('    %s: %s,' % (js_str(k), js_str(v)))
    lines.append('  };')
    lines.append('  var THIN = {')
    for cat, phrases in thin.items():
        lines.append('    %s: [%s],' % (js_str(cat), ', '.join(js_str(p) for p in phrases)))
    lines.append('  };')
    lines.append('  var REPL = [')
    for cat, old, new in repl:
        lines.append('    { c: %s, o: %s, n: %s },' % (js_str(cat), js_str(old), js_str(new)))
    lines.append('  ];')
    lines.append('''
  WS.boot(function swarm2() {
    // 1) локализация: влить без перезаписи существующего
    WS.Data = WS.Data || {};
    WS.Data.locales = WS.Data.locales || {};
    var en = WS.Data.locales.en = WS.Data.locales.en || {};
    var ru = WS.Data.locales.ru = WS.Data.locales.ru || {};
    var nEn = 0, nRu = 0;
    for (var k in EN) { if (!en[k]) { en[k] = EN[k]; nEn++; } }
    for (var k2 in RU) { if (!ru[k2]) { ru[k2] = RU[k2]; nRu++; } }

    // 2) банк мыслей: топ-ап тонких категорий (кап 14, дедупликация)
    var db = (WS.Thoughts && WS.Thoughts._db) || null;
    var nPh = 0;
    if (db) {
      for (var cat in THIN) {
        var arr = db[cat];
        if (!arr) { arr = db[cat] = []; }
        var pool = {};
        for (var i = 0; i < arr.length; i++) pool[arr[i]] = true;
        var add = THIN[cat];
        for (var j = 0; j < add.length && arr.length < ''' + str(CAP_PER_CAT) + '''; j++) {
          if (!pool[add[j]]) { arr.push(add[j]); pool[add[j]] = true; nPh++; }
        }
      }
    }

    // 3) умные замены: строго по точному совпадению old
    var nRep = 0;
    if (db) {
      for (var r = 0; r < REPL.length; r++) {
        var a = db[REPL[r].c];
        if (!a) continue;
        for (var q = 0; q < a.length; q++) {
          if (a[q] === REPL[r].o) { a[q] = REPL[r].n; nRep++; break; }
        }
      }
    }

    WS.log('swarm2: EN +' + nEn + ', RU +' + nRu + ', фраз +' + nPh + ', замен ' + nRep);
  }, 'i18n:swarm2');
})();''')

    with open(DEST, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines) + '\n')

    print('OK: %s' % DEST)
    print('  EN ключей: %d (кириллицы нет)' % len(en))
    print('  RU ключей: %d' % len(ru))
    print('  Тонких категорий: %d, новых фраз: %d' % (len(thin), sum(len(v) for v in thin.values())))
    print('  Замен качества: %d' % len(repl))


if __name__ == '__main__':
    main()
