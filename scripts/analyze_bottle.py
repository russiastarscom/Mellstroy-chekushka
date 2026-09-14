#!/usr/bin/env python3
# Анализ фото чекушки: альфа/фон/контент
from PIL import Image
import numpy as np

SRC = '/home/z/my-project/upload/чеккушка.png'
OUT = '/home/z/my-project/scripts/out_task12'
import os
os.makedirs(OUT, exist_ok=True)

im = Image.open(SRC)
print('mode:', im.mode, 'size:', im.size)
im = im.convert('RGBA')
a = np.array(im)
al = a[:, :, 3]
print('alpha: min', al.min(), 'max', al.max(), 'opaque(<12):', int((al > 12).sum()), f'{(al > 12).sum() / al.size * 100:.1f}%')

if (al > 12).sum() < al.size:  # есть прозрачность
    ys, xs = np.where(al > 12)
    print('opaque bbox:', xs.min(), '..', xs.max(), ' x ', ys.min(), '..', ys.max())
else:
    # белый фон? углы
    for name, (yy, xx) in {'TL': (2, 2), 'TR': (2, -3), 'BL': (-3, 2), 'BR': (-3, -3)}.items():
        print(f'corner {name}:', a[yy, xx])
    rgb = a[:, :, :3].astype(int)
    # почти-белые
    white = (rgb.min(axis=2) > 235)
    print('near-white px:', int(white.sum()), f'{white.sum() / white.size * 100:.1f}%')

# превью на шахматке для наглядности
bg = Image.new('RGBA', im.size, (255, 0, 255, 255))
bg.paste(im, (0, 0), im)
bg.convert('RGB').save(f'{OUT}/src_on_magenta.png')
