#!/usr/bin/env python3
# Task 11: фото босса -> image/boss.png
# Фон уже прозрачный: срезаем пустоту (кроп по альфе), вписываем в слот 76x92,
# низ контента = низ слота (босс стоит на земле), центр по X.
from PIL import Image
import numpy as np

SRC = '/home/z/my-project/upload/lv_0_20260913214740.png'
DST = '/home/z/my-project/public/game/image/boss.png'
SLOT = (76, 92)

im = Image.open(SRC).convert('RGBA')
a = np.array(im)
op = a[:, :, 3] > 12
ys, xs = np.where(op)
x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
im = im.crop((x0, y0, x1 + 1, y1 + 1))
print(f'crop bbox=({x0},{y0})-({x1},{y1}) -> {im.size}')

# мягкий кроп полупрозрачной каймы по периметру (останки ореола): альфа<20 -> 0
a = np.array(im)
a[:, :, 3][a[:, :, 3] < 20] = 0
im = Image.fromarray(a)

w, h = im.size
ratio = min(SLOT[0] / w, SLOT[1] / h)
nw, nh = max(1, round(w * ratio)), max(1, round(h * ratio))
im2 = im.resize((nw, nh), Image.LANCZOS)

canvas = Image.new('RGBA', SLOT, (0, 0, 0, 0))
canvas.paste(im2, ((SLOT[0] - nw) // 2, SLOT[1] - nh), im2)   # низ на дно слота
canvas.save(DST)
print(f'boss.png: content {nw}x{nh} in slot {SLOT}, saved')

# Превью портрета (эмуляция portrait(): bbox -> верхние 66% -> contain 96)
im3 = Image.open(DST).convert('RGBA')
aa = np.array(im3)
op = aa[:, :, 3] > 24
ys, xs = np.where(op)
bx0, bx1, by0, by1 = xs.min(), xs.max(), ys.min(), ys.max()
bw, bh = bx1 - bx0 + 1, by1 - by0 + 1
hh = max(1, round(bh * 0.66))
sc = min(96 / bw, 96 / hh)
crop = im3.crop((bx0, by0, bx0 + bw, by0 + hh)).resize((round(bw * sc), round(hh * sc)), Image.NEAREST)
port = Image.new('RGBA', (96, 96), (40, 40, 60, 255))
port.paste(crop, ((96 - crop.width) // 2, (96 - crop.height) // 2), crop)
port.save('/home/z/my-project/scripts/out_task11/boss_portrait_96.png')
print(f'portrait preview: bbox {bw}x{bh}, top66={hh}, scale={sc:.2f}')
