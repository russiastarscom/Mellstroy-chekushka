#!/usr/bin/env python3
# Task 12: фото чекушки -> image/checkushka.png (слот 24x32)
# Фон прозрачный: кроп по альфе, срез ореола, вписывание с пропорциями, низ = дно слота.
from PIL import Image
import numpy as np

SRC = '/home/z/my-project/upload/чеккушка.png'
DST = '/home/z/my-project/public/game/image/checkushka.png'
SLOT = (24, 32)

im = Image.open(SRC).convert('RGBA')
a = np.array(im)
al = a[:, :, 3].astype(int)

# кроп по непрозрачному контенту
ys, xs = np.where(al > 12)
im = im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))

# срез слабого ореола по краям (полупрозрачная кайма от вырезания фона)
a = np.array(im)
a[:, :, 3][a[:, :, 3] < 24] = 0
im = Image.fromarray(a)

w, h = im.size
ratio = min(SLOT[0] / w, SLOT[1] / h)
nw, nh = max(1, round(w * ratio)), max(1, round(h * ratio))
im2 = im.resize((nw, nh), Image.LANCZOS)

canvas = Image.new('RGBA', SLOT, (0, 0, 0, 0))
canvas.paste(im2, ((SLOT[0] - nw) // 2, SLOT[1] - nh), im2)   # низ на дно слота
canvas.save(DST)
print(f'checkushka.png: content {w}x{h} -> {nw}x{nh} в слоте {SLOT}')

# превью x6 (как в игре будет видно)
canvas.resize((SLOT[0] * 6, SLOT[1] * 6), Image.NEAREST).save(
    '/home/z/my-project/scripts/out_task12/checkushka_x6.png')

# превью портрета (радио-диалог): bbox -> верхние 66% -> contain 96
im3 = Image.open(DST).convert('RGBA')
aa = np.array(im3)
op = aa[:, :, 3] > 24
ys, xs = np.where(op)
bw, bh = xs.max() - xs.min() + 1, ys.max() - ys.min() + 1
hh = max(1, round(bh * 0.66))
sc = min(96 / bw, 96 / hh)
crop = im3.crop((xs.min(), ys.min(), xs.max() + 1, ys.min() + hh))
crop = crop.resize((round(bw * sc), round(hh * sc)), Image.NEAREST)
port = Image.new('RGBA', (96, 96), (40, 40, 60, 255))
port.paste(crop, ((96 - crop.width) // 2, (96 - crop.height) // 2), crop)
port.save('/home/z/my-project/scripts/out_task12/checkushka_portrait_96.png')
print(f'portrait: {bw}x{bh}, top66={hh}, scale={sc:.2f}')
