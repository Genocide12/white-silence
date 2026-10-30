#!/usr/bin/env python3
# merge_swarm.py — слияние 70 файлов роя (scripts/swarm/*.json) в базу мыслей
# thoughts.js: валидация → дедупликация → экранирование → пересборка блока T
# + META для новых событий + отладочный stats() для зондов.
import json, glob, re, sys

ROOT = '/home/z/my-project'
TH = ROOT + '/js/systems/thoughts.js'
src = open(TH, encoding='utf-8').read()

# ---------- 1. разобрать существующий T ----------
t_start = src.index('  var T = {')
t_end = src.index('  // ====================================================================\n  //  ПАРАМЕТРЫ КАТЕГОРИЙ')
t_block = src[t_start:t_end]

# порядок ключей как в файле
key_order = re.findall(r'^    ([a-z_0-9]+): \[', t_block, re.M)
existing = {}
for m in re.finditer(r'^    ([a-z_0-9]+): \[((?:.|\n)*?)\n    \]', t_block, re.M):
    key = m.group(1)
    phrases = re.findall(r"'((?:\\.|[^'\\])*)'", m.group(2))
    existing[key] = phrases

print('существующих категорий:', len(key_order), '| фраз в них:', sum(len(v) for v in existing.values()))

# ---------- 2. загрузить рой ----------
def esc(s):
    return s.replace('\\', '\\\\').replace("'", "\\'")

PLACEHOLDER_KEYS = {'found_item', 'day_mark'}
stats = {'files': 0, 'taken': 0, 'drop_len': 0, 'drop_dup': 0, 'drop_ph': 0, 'drop_quote': 0}
seen_norm = set()
for v in existing.values():
    for p in v:
        seen_norm.add(re.sub(r'[^\wа-яё]+', '', p.lower()))

merged = {k: list(v) for k, v in existing.items()}
new_keys_order = []
new_events_desc = {}

for f in sorted(glob.glob(ROOT + '/scripts/swarm/*.json')):
    try:
        d = json.load(open(f, encoding='utf-8'))
    except Exception as e:
        print('ПРОПУСК', f, e); continue
    stats['files'] += 1
    key = d.get('key')
    phs = d.get('phrases') or []
    if not key or not isinstance(key, str): continue
    is_new = key.startswith('new_')
    if is_new:
        new_events_desc[key] = d.get('event', '')
        if key not in merged: new_keys_order.append(key); merged[key] = []
    elif key not in merged:
        continue
    for p in phs:
        p = str(p).strip().replace('\u00a0', ' ')
        p = re.sub(r'\s+', ' ', p)
        if not (8 <= len(p) <= 95): stats['drop_len'] += 1; continue
        if "'" in p: stats['drop_quote'] += 1; continue          # просили не использовать
        if key == 'found_item' and '{item}' not in p: stats['drop_ph'] += 1; continue
        if key != 'found_item' and '{item}' in p: stats['drop_ph'] += 1; continue
        norm = re.sub(r'[^\wа-яё]+', '', p.lower())
        if not norm or norm in seen_norm: stats['drop_dup'] += 1; continue
        seen_norm.add(norm)
        merged[key].append(p)
        stats['taken'] += 1

# ---------- 3. собрать новый блок T ----------
CAP = 14
out_lines = ['  var T = {', '']
cur_group = None
def group_of(k):
    if k.startswith('new_'): return 'новые события (рой агентов)'
    if k in ('stove_cold','stove_ok','stove_lit','bed','container_first','gift','radio','ice_hole','tree','locked_door','building_warm'): return 'восприятие: предметы рядом'
    if k in ('wolf_near','wolf_spotted','bear_near','bear_spotted','bandit_near','bandit_spotted','hurt','lowhp','lowhp_crit','cz_sleeping'): return 'опасность (приоритет 3, прерывает речь)'
    if k in ('night','dawn','blizzard','hard_frost','frostbite','freezing','warmed_up','hunger','thirst','tired','wet','sanity_low'): return 'состояние, погода, время'
    return 'события: обыск, крафт, еда, охота'

all_keys = key_order + new_keys_order
for k in all_keys:
    phs = merged.get(k, [])[:CAP]
    if not phs: continue
    g = group_of(k)
    if g != cur_group:
        out_lines.append('    // ---- ' + g + ' ' + '-' * max(3, 40 - len(g)) + '')
        cur_group = g
    out_lines.append('    %s: [' % k)
    for p in phs:
        out_lines.append("      '%s'," % esc(p))
    out_lines.append('    ],')
out_lines.append('  };')
new_t = '\n'.join(out_lines) + '\n\n'

src = src[:t_start] + new_t + src[t_end:]

# ---------- 4. META для новых событий ----------
meta_add = """    // ---- новые события (рой агентов, 2026-10-31) -------------------
    new_low_matches: { prio: 2, cd: 900 },
    new_low_ammo: { prio: 2, cd: 900 },
    new_low_fuel: { prio: 2, cd: 1200 },
    new_lost_forest: { prio: 2, cd: 600 },
    new_wolf_howl: { prio: 2, cd: 500 },
    new_found_note: { prio: 1, cd: 200 },
    new_gear_torn: { prio: 2, cd: 900 },
    new_ship_hope: { prio: 1, cd: 4000 },
    new_home_sweet: { prio: 1, cd: 800 },
    new_storm: { prio: 2, cd: 900 },
"""
anchor = "    respawn: { prio: 2, cd: 30 }\n  };"
assert anchor in src, 'META anchor not found'
src = src.replace(anchor, "    respawn: { prio: 2, cd: 30 },\n" + meta_add.rstrip('\n,') + "\n  };")

# ---------- 5. stats() для зондов ----------
anchor2 = "  WS.def('Thoughts', {\n    /** Подумать категорией из базы (см. T выше). */"
assert anchor2 in src, 'Thoughts def anchor not found'
src = src.replace(anchor2,
"""  WS.def('Thoughts', {
    /** Статистика базы (зонды/QA): категорий и фраз. */
    stats: function () {
      var n = 0, k = 0;
      for (var key in T) { if (T.hasOwnProperty(key)) { k++; n += T[key].length; } }
      return { cats: k, phrases: n };
    },
    /** Отладка: список ключей базы. */
    keys: function () { var a = []; for (var k in T) if (T.hasOwnProperty(k)) a.push(k); return a; },
    /** Подумать категорией из базы (см. T выше). */""")

open(TH, 'w', encoding='utf-8').write(src)

total_p = sum(len(v[:CAP]) for v in merged.values())
print('слито: файлов=%d, взято=%d, отброшено (длина=%d, дубль=%d, плейсхолдер=%d, кавычка=%d)' %
      (stats['files'], stats['taken'], stats['drop_len'], stats['drop_dup'], stats['drop_ph'], stats['drop_quote']))
print('новых событий:', len(new_keys_order), list(new_keys_order))
print('ИТОГО в базе: категорий=%d, фраз=%d' % (len([k for k in merged if merged[k]]), total_p))
