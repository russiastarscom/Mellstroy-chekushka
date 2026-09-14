#!/usr/bin/env python3
# Детальный анализ альфы фото босса + превью портретов Андрея
from PIL import Image
import numpy as np

UP = '/home/z/my-project/upload/lv_0_20260913214740.png'
OUT = '/home/z/my-project/scripts/out_task11'

im = Image.open(UP).convert('RGBA')
a = np.array(im)
al = a[:, :, 3]
print('alpha stats: min', al.min(), 'max', al.max())
op = al > 12
print('opaque px:', op.sum(), f'({op.sum() / al.size * 100:.1f}%)')
ys, xs = np.where(op)
print('opaque bbox:', xs.min(), '..', xs.max(), ' x ', ys.min(), '..', ys.max())

# Профиль непрозрачных по строкам (верх/низ) и колонкам
rows = op.sum(axis=1)
cols = op.sum(axis=0)
print('rows with opaque >0:', np.where(rows > 0)[0].min(), '-', np.where(rows > 0)[0].max())
print('cols with opaque >0:', np.where(cols > 0)[0].min(), '-', np.where(cols > 0)[0].max())

# Непрозрачные, но ПОЧТИ ЧЁРНЫЕ (это фон-остаток или тёмные волосы?)
rgb = a[:, :, :3].astype(int)
mx = rgb.max(axis=2)
opdark = op & (mx < 30)
print('opaque&dark:', opdark.sum())
# где они
ys2, xs2 = np.where(opdark)
if len(ys2):
    print('opaque&dark bbox:', xs2.min(), '..', xs2.max(), ' x ', ys2.min(), '..', ys2.max())

# Визуализация: альфа-маска
mask = (op * 255).astype(np.uint8)
Image.fromarray(mask).save(f'{OUT}/boss_alpha_mask.png')

# Уменьшенное превью альфа-маски
Image.fromarray(mask).resize((540, 370)).save(f'{OUT}/boss_alpha_mask_half.png')

# Превью непрозрачной части на белом фоне
white = Image.new('RGBA', im.size, (255, 255, 255, 255))
white.paste(im, (0, 0), im)
white.convert('RGB').resize((540, 370)).save(f'{OUT}/boss_on_white_half.png')
print('saved masks')
