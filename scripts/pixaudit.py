#!/usr/bin/env python3
# Пиксельный аудит скриншотов: доля тёмных пикселей в центральной области,
# доля «снежных» ярких пикселей, число уникальных цветов.
# Метрика из RESCUE.md: сломанная версия = 93.6% тёмных в центре кадра.
import sys
from PIL import Image

def audit(path, box_frac=0.5, dark_th=40, snow_th=185):
    im = Image.open(path).convert('RGB')
    w, h = im.size
    bw, bh = int(w * box_frac), int(h * box_frac)
    box = (w // 2 - bw // 2, h // 2 - bh // 2, w // 2 + bw // 2, h // 2 + bh // 2)
    c = im.crop(box)
    px = list(c.getdata())
    n = len(px)
    dark = sum(1 for r, g, b in px if (r + g + b) / 3 < dark_th)
    snow = sum(1 for r, g, b in px if (r + g + b) / 3 > snow_th)
    uniq = len(set(im.getdata()))
    return {'dark%': round(100 * dark / n, 1), 'bright%': round(100 * snow / n, 1),
            'uniq_colors': uniq, 'size': f'{w}x{h}'}

if __name__ == '__main__':
    for p in sys.argv[1:]:
        try:
            print(f"{p.split('/')[-1]:26s} {audit(p)}")
        except Exception as e:
            print(f"{p}: ERROR {e}")
