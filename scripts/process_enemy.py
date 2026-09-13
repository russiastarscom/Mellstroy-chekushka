#!/usr/bin/env python3
# Обработка загруженного спрайта врага (бурмалдинца) под игровой слот 44x52:
# 1) удаляем чёрный фон (связная компонента, к которой принадлежит точка (370,300))
# 2) срезаем зелёную хромакей-кайму + despill
# 3) оставляем только главный силуэт (без мусорных speck'ов)
# 4) кроп -> зеркалим (смотрит чуть вправо, арт врага должен смотреть ВЛЕВО,
#    т.к. флип при vx>0) -> LANCZOS в слот -> бинаризация альфы
# 5) центрируем по X, низ контента на y=41 (низ хитбокса: 46/58*52)
import numpy as np
from PIL import Image
from scipy import ndimage

SRC = '/home/z/my-project/upload/Screenshot_2026091h3-203630gv.png'
DST = '/home/z/my-project/public/game/image/burmaldenets.png'
TARGET = (44, 52)          # слот в sprites.js
BOTTOM_Y = 41              # низ контента в слоте (маппинг низа хитбокса 46/58*52)

im = Image.open(SRC).convert('RGBA')
a = np.array(im).astype(int)
r, g, b, al = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
mx = np.maximum(np.maximum(r, g), b)
mn = np.minimum(np.minimum(r, g), b)

# --- 1) чёрный фон: компонента строгих тёмных, содержащая точку (370,300) ---
dark = (al >= 128) & (mx < 75) & ((mx - mn) < 32)
lab, n = ndimage.label(dark)
bg_label = lab[300, 370]
if bg_label == 0:  # точка могла быть чуть иного тона — берём крупнейшую компоненту
    sizes = np.bincount(lab.ravel()); sizes[0] = 0
    bg_label = int(np.argmax(sizes))
    print(f'fallback bg component #{bg_label}, size={sizes[bg_label]}')
else:
    print(f'bg component #{bg_label}, size={(lab == bg_label).sum()}')
al[lab == bg_label] = 0

# --- 2) яркая зелёная кайма -> прозрачность ---
green = (al >= 128) & (g > 95) & ((g - np.maximum(r, b)) > 25)
print('bright green px removed:', int(green.sum()))
al[green] = 0

# --- 3) ТЁМНУЮ зелень НЕ удаляем (съест шею/волоса), а обесцвечиваем:
#        глобальный мягкий despill (гасит и зелёный оттенок лица от видео) ---
opaque = al >= 128
half = (r + b) // 2
excess = np.where(opaque, g - half - 12, 0)
g = g - np.where(excess > 0, excess, 0)
print('despill soft px:', int((excess > 0).sum()))

# --- 4) главный силуэт (крупнейшая связная непрозрачная компонента) ---
lab2, n2 = ndimage.label(al >= 128)
if n2 > 1:
    sizes2 = np.bincount(lab2.ravel()); sizes2[0] = 0
    main = int(np.argmax(sizes2))
    print(f'silhouette #{main}, size={sizes2[main]}, dropped {n2 - 1} specks')
    al = np.where(lab2 == main, 255, 0).astype(int)

# --- 5) жёсткий despill только на кромке (2 слоя): добиваем зелёный ореол ---
for it in range(2):
    op = al >= 128
    edge = op & ndimage.binary_dilation(~op, iterations=1)
    ex2 = np.where(edge, g - (r + b) // 2 - 4, 0)
    g = g - np.where(ex2 > 0, ex2, 0)
    print(f'edge despill {it}: {int((ex2 > 0).sum())} px')

out = np.stack([r, g, b, al], axis=-1).clip(0, 255).astype(np.uint8)
im = Image.fromarray(out, 'RGBA')

# --- 4) кроп головы (по профилю силуэта: волосы x132-262 y0-155, шея до y175),
#        флип (смотрит чуть вправо -> арт врага должен смотреть ВЛЕВО), ресайз ---
bbox = im.getbbox()
im = im.crop(bbox)
im = im.crop((125, 0, 270, 165))
print('cropped:', im.size)
im = im.transpose(Image.FLIP_LEFT_RIGHT)
# вписываем в ширину слота И в бюджет высоты над линией низа хитбокса
ratio = min(TARGET[0] / im.width, BOTTOM_Y / im.height)
new_size = (max(1, round(im.width * ratio)), max(1, round(im.height * ratio)))
im = im.resize(new_size, Image.LANCZOS)
aa = im.getchannel('A').point(lambda v: 255 if v >= 128 else 0)
im.putalpha(aa)
print('fitted:', new_size)

# --- 5) в слот: по центру X, низ контента на BOTTOM_Y ---
canvas = Image.new('RGBA', TARGET, (0, 0, 0, 0))
canvas.paste(im, ((TARGET[0] - im.width) // 2, BOTTOM_Y - im.height), im)
canvas.save(DST, optimize=True)
print(f'OK -> {DST} | {len(open(DST, "rb").read())} bytes')

# превью x6 для визуальной проверки
canvas.resize((TARGET[0] * 6, TARGET[1] * 6), Image.NEAREST).save(
    '/home/z/my-project/scripts/_enemy_preview.png')
