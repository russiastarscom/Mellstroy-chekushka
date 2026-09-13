#!/usr/bin/env python3
# Анализ Task 11: эмуляция portrait() для Андрея + анализ фото босса
from PIL import Image
import numpy as np

UP = '/home/z/my-project/upload/lv_0_20260913214740.png'
ANDREY = '/home/z/my-project/public/game/image/andrey.png'
OUT = '/home/z/my-project/scripts/out_task11'
import os
os.makedirs(OUT, exist_ok=True)

# ---------- 1. Эмуляция portrait() для Андрея ----------
im = Image.open(ANDREY).convert('RGBA')
a = np.array(im)
alpha = a[:, :, 3]
ys, xs = np.where(alpha > 24)
x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
bw, bh = x1 - x0 + 1, y1 - y0 + 1
print(f'ANDREY: img {im.size}, bbox=({x0},{y0},{bw}x{bh})')
hh = max(1, round(bh * 0.66))
# канвас портрета — как в диалоге (проверю размер по CSS ниже, тут 128 как типичный)
for CW in (96, 128):
    sc = min(CW / bw, CW / hh)
    dw, dh = int(bw * sc), int(hh * sc)
    crop = im.crop((x0, y0, x0 + bw, y0 + hh)).resize((dw, dh), Image.NEAREST)
    canvas = Image.new('RGBA', (CW, CW), (40, 40, 60, 255))
    canvas.paste(crop, ((CW - dw) // 2, (CW - dh) // 2), crop)
    canvas.save(f'{OUT}/andrey_portrait_{CW}.png')
    print(f'  portrait {CW}: scale={sc:.2f} draw={dw}x{dh} (canvas {CW}x{CW})')

# также покажу верхние 66% крупно как есть
crop = im.crop((x0, y0, x0 + bw, y0 + hh))
crop.resize((bw * 4, hh * 4), Image.NEAREST).save(f'{OUT}/andrey_top66_x4.png')

# ---------- 2. Анализ фото босса ----------
im = Image.open(UP).convert('RGBA')
a = np.array(im)
print(f'\nBOSS SRC: {im.size}')
rgb = a[:, :, :3].astype(int)
mx = rgb.max(axis=2)
# углы — какой фон
for name, (yy, xx) in {'TL': (5, 5), 'TR': (5, -5), 'BL': (-5, 5), 'BR': (-5, -5)}.items():
    print(f'  corner {name}: {a[yy, xx]}')
# гистограмма яркости фона: доля почти-чёрных
dark = (mx < 30).sum()
print(f'  pixels max<30: {dark} ({dark / mx.size * 100:.1f}%)')
# bbox неот-чёрного
content = mx >= 30
ys, xs = np.where(content)
print(f'  content bbox (max>=30): x {xs.min()}..{xs.max()}, y {ys.min()}..{ys.max()}')
# светлые пиксели у нижней кромки (та светлая полоса)
bottom = a[-8:, :, :3].astype(int).max(axis=2)
light_cols = np.where((bottom > 80).any(axis=0))[0]
if len(light_cols):
    print(f'  light strip at bottom rows: cols {light_cols.min()}..{light_cols.max()}, count={len(light_cols)}')
# превью с усилением контраста тёмного
prev = (np.clip(rgb, 0, 255)).astype(np.uint8)
Image.fromarray(prev).resize((im.width // 2, im.height // 2)).save(f'{OUT}/boss_src_half.png')
# что в области светлой полосы снизу
strip = a[730:741, 440:580]
if strip.size:
    print('  strip sample colors:', [tuple(strip[0, i, :3]) for i in range(0, strip.shape[1], 30)])
