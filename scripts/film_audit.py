#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Аудит плёнки кинозала: что зритель видит на экране и в каком темпе.

Считает экранное время (real sec = gameMin / baseRate, как в cinema.js
calcBaseRate), зоны тишины, долю «молчаливого хождения», топ действий,
драматургию глав и ХП. Использование: python3 film_audit.py [ИмяФайла]"""
import json, sys, os, statistics

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LIVE_TPM = 2.2          # живой темп, тайлов/игр.мин (как в cinema.js)

def base_rate(pl):
    rates = []
    for i in range(1, len(pl)):
        dmin = pl[i][0] - pl[i-1][0]
        if dmin <= 0: continue
        d = abs(pl[i][2]-pl[i-1][2]) + abs(pl[i][3]-pl[i-1][3])
        if d > 0.15: rates.append(d/dmin)
    if len(rates) < 8: return 1
    rates.sort()
    med = rates[len(rates)//2]
    if not med > 0.01: return 1
    return max(1, min(60, LIVE_TPM/med))

def fmt(sec):
    return f"{int(sec//60)}:{int(sec%60):02d}"

def audit(fname):
    rec = json.load(open(os.path.join(BASE, 'recordings', fname + '.json')))
    ev = rec['ev']; meta = rec.get('meta', {})
    pl = [e for e in ev if e[1] == 0]
    k = base_rate(pl)
    t0 = ev[0][0]; total = ev[-1][0] - t0
    scr = total / k                      # экранная длительность, сек
    print(f"=== {fname} ===")
    print(f"метa: результат={meta.get('result')} день={meta.get('day')} "
          f"изгнаний={meta.get('banished')} зовоов={meta.get('calls')} realSec={meta.get('realSec')}")
    print(f"baseRate=×{k:.0f}  экранное время: {fmt(scr)}  (день = {1440/k:.0f} сек)")

    # движение vs стояние в экранном времени
    mv = st = 0.0
    for i in range(1, len(pl)):
        dmin = pl[i][0]-pl[i-1][0]; s = dmin/k
        d = abs(pl[i][2]-pl[i-1][2]) + abs(pl[i][3]-pl[i-1][3])
        if d > 0.15: mv += s
        else: st += s
    print(f"экранное время: идёт {fmt(mv)} ({mv/scr*100:.0f}%) | стоит {fmt(st)} ({st/scr*100:.0f}%)")

    # видимые события: мысль(1) пузырь, действие(2) лента, глава(4) лента, финал(5)
    vis = sorted([e for e in ev if e[1] in (1,2,4,5)], key=lambda e: e[0])
    acts = [e for e in ev if e[1] == 2]
    print(f"видимых событий: {len(vis)} (действий {len(acts)}, мыслей {sum(1 for e in ev if e[1]==1)}, "
          f"глав {sum(1 for e in ev if e[1]==4)}) — одно на {scr/max(1,len(vis)):.0f} сек экрана")

    # топ действий — монотонность
    from collections import Counter
    top = Counter(e[2] for e in acts).most_common(12)
    print("топ действий:", '; '.join(f"{t}×{n}" for t, n in top))

    # паузы между видимыми событиями в экранных секундах
    gaps = []
    for i in range(1, len(vis)):
        gaps.append((vis[i][0]-vis[i-1][0])/k)
    if gaps:
        gaps_s = sorted(gaps)
        print(f"паузы между событиями: медиана {statistics.median(gaps):.0f} сек, "
              f"p90 {gaps_s[int(len(gaps_s)*0.9)]:.0f} сек, максимум {max(gaps):.0f} сек")
        # мёртвые зоны: что дед делал в это время
        dead = []
        for i in range(1, len(vis)):
            g = (vis[i][0]-vis[i-1][0])/k
            if g >= 45:
                lo, hi = vis[i-1][0], vis[i][0]
                moved = sum(abs(pl[j][2]-pl[j-1][2])+abs(pl[j][3]-pl[j-1][3])
                            for j in range(1, len(pl)) if lo < pl[j][0] <= hi)
                dead.append((g, lo, hi, moved > 2))
        dead.sort(reverse=True)
        if dead:
            print(f"мёртвых зон ≥45 сек: {len(dead)} суммарно {fmt(sum(d[0] for d in dead))} "
                  f"({sum(d[0] for d in dead)/scr*100:.0f}% фильма)")
            for g, lo, hi, walking in dead[:5]:
                what = "идёт по снегу" if walking else "стоит на месте"
                print(f"  {fmt((lo-t0)/k)}→{fmt((hi-t0)/k)}  {fmt(g)} молча, {what}; "
                      f"после этого: «{vis[[v[0] for v in vis].index(hi)][2][:50]}»")

    # «живое» время: ±10 сек вокруг событий (что останется после монтажа)
    marks = [(e[0]-t0)/k for e in vis]
    iv = []
    for m in marks:
        a, b = max(0, m-10), min(scr, m+10)
        if iv and a <= iv[-1][1]: iv[-1] = (iv[-1][0], max(iv[-1][1], b))
        else: iv.append((a, b))
    live = sum(b-a for a, b in iv)
    print(f"после монтажа (±10 сек вокруг событий) осталось бы {fmt(live)} "
          f"({live/scr*100:.0f}% фильма)")

    # драматургия: главы и ХП
    for e in ev:
        if e[1] == 4:
            print(f"  глава @ {fmt((e[0]-t0)/k)}: {e[2]}")
    hp = [e for e in ev if e[1] == 3]
    drops = [(hp[i-1], hp[i]) for i in range(1, len(hp)) if hp[i][2] < hp[i-1][2] - 5]
    print(f"ХП-событий: {len(hp)}, падений >5: {len(drops)}", end='')
    if drops:
        w = max(drops, key=lambda p: p[0][2]-p[1][2])
        print(f" (худшее {w[0][2]}→{w[1][2]} @ {fmt((w[1][0]-t0)/k)})", end='')
    print()
    print()

if __name__ == '__main__':
    files = sys.argv[1:] or ['Гена-Турбо']
    for f in files:
        audit(f)
