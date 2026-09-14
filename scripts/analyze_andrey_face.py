#!/usr/bin/env python3
# Где лицо Андрея: детекция кожи по строкам спрайта
from PIL import Image
import numpy as np

im = Image.open('/home/z/my-project/public/game/image/andrey.png').convert('RGBA')
a = np.array(im)
r, g, b, al = a[:, :, 0].astype(int), a[:, :, 1].astype(int), a[:, :, 2].astype(int), a[:, :, 3]
skin = (al > 100) & (r > 90) & (r > g + 12) & (g > b) & (r < 260)
rows = skin.sum(axis=1)
print('row: skin_px  (48x56 sprite)')
for y in range(a.shape[0]):
    bar = '#' * min(60, rows[y])
    print(f'{y:3d}: {rows[y]:3d} {bar}')
ys = np.where(rows > 2)[0]
print('face rows:', ys.min(), '-', ys.max())

# зелёная кайма: сколько пикселей с зелёным доминированием
green = (al > 60) & (g > r + 10) & (g > b + 10)
print('green fringe px:', green.sum())
ysg, xsg = np.where(green)
if len(ysg):
    print('green bbox:', xsg.min(), '-', xsg.max(), 'x', ysg.min(), '-', ysg.max())
