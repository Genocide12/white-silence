#!/usr/bin/env python3
"""Сборка: сканирует js/, вставляет <script> в index.html, считает строки кода."""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

ORDER = [
    'core', 'data', 'world', 'systems', 'ai', 'entities', 'ui', 'content', 'i18n'
]

MAIN = 'js/main.js'

SKIP_MARKER = '<!-- СПИСОК СКРИПТОВ'


def scan_js():
    files = []
    # ядро: ns.js всегда первым, math вторым, затем остальное
    core_dir = os.path.join(ROOT, 'js', 'core')
    files.append('js/core/ns.js')
    files.append('js/core/math.js')
    for fn in sorted(os.listdir(core_dir)):
        if fn.endswith('.js') and fn not in ('ns.js', 'math.js'):
            files.append(os.path.join('js', 'core', fn))
    for cat in ORDER:
        if cat == 'core':
            continue
        d = os.path.join(ROOT, 'js', cat)
        if not os.path.isdir(d):
            continue
        for fn in sorted(os.listdir(d)):
            if fn.endswith('.js'):
                files.append(os.path.join('js', cat, fn))
    if os.path.isfile(os.path.join(ROOT, MAIN)):
        files.append(MAIN)
    return files


def count_lines(files):
    total = 0
    per = {}
    for rel in files:
        path = os.path.join(ROOT, rel)
        with open(path, encoding='utf-8') as f:
            n = sum(1 for _ in f)
        per[rel] = n
        total += n
    return total, per


HTML_TEMPLATE = '''<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="Белое Безмолвие — изометрический сурвайвл в духе Project Zomboid: Русский Север, зима 1917 года.">
  <meta name="theme-color" content="#070a10">
  <title>Белое Безмолвие — White Silence</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' fill='%%23070a10'/><circle cx='16' cy='16' r='8' fill='%%23dfe6ee'/><circle cx='13' cy='14' r='6' fill='%%23a9c6dd'/></svg>">
  <link rel="stylesheet" href="css/base.css">
%(css_tags)s
</head>
<body>
  <canvas id="game" width="1280" height="720"></canvas>
  <div id="ui-root"></div>
  <!-- ==== СКРИПТЫ ИГРЫ (генерируется scripts/build.py) ====
       Порядок: core -> data -> world -> systems -> ai -> entities -> ui -> content -> i18n -> main -->
%(script_tags)s
</body>
</html>
'''


def build_index(files):
    css_files = []
    css_dir = os.path.join(ROOT, 'css')
    if os.path.isdir(css_dir):
        for fn in sorted(os.listdir(css_dir)):
            if fn.endswith('.css'):
                css_files.append(fn)
    css_tags = '\n'.join('  <link rel="stylesheet" href="css/%s">' % f for f in css_files)
    script_tags = '\n'.join('  <script src="%s"></script>' % rel for rel in files)
    html = HTML_TEMPLATE % {'css_tags': css_tags, 'script_tags': script_tags}
    with open(os.path.join(ROOT, 'index.html'), 'w', encoding='utf-8') as f:
        f.write(html)


def main():
    files = scan_js()
    total, per = count_lines(files)
    build_index(files)
    # css строки
    css_total = 0
    css_dir = os.path.join(ROOT, 'css')
    css_files = []
    if os.path.isdir(css_dir):
        for fn in sorted(os.listdir(css_dir)):
            if fn.endswith('.css'):
                with open(os.path.join(css_dir, fn), encoding='utf-8') as f:
                    n = sum(1 for _ in f)
                css_files.append((fn, n))
                css_total += n
    html_lines = 0
    with open(os.path.join(ROOT, 'index.html'), encoding='utf-8') as f:
        html_lines = sum(1 for _ in f)

    print('Файлов JS: %d' % len(files))
    for rel in files:
        print('  %-46s %6d' % (rel, per[rel]))
    print('Строк JS:    %d' % total)
    print('Строк CSS:   %d (%s)' % (css_total, ', '.join(f for f, _ in css_files)))
    print('Строк HTML:  %d' % html_lines)
    print('ИТОГО:       %d' % (total + css_total + html_lines))
    return 0


if __name__ == '__main__':
    sys.exit(main())
