#!/usr/bin/env python3
# Спрайт врага = ОРИГИНАЛ как загружен пользователем, без чисток и переворотов.
# Единственная обработка: срез полностью прозрачных полей и вписывание в слот
# с сохранением пропорций оригинала (низ на линии хитбокса).
import numpy as np
from PIL import Image

SRC = '/home/z/my-project/upload/Screenshot_2026091h3-203630gv.png'
DST = '/home/z/my-project/public/game/image/burmaldenets.png'
TARGET = (44, 52)          # слот в sprites.js
BOTTOM_Y = 41              # низ контента в слоте (низ хитбокса 46/58*52)

im = Image.open(SRC).convert('RGBA')

# срез прозрачных полей (только чтобы ориг не болтался в пустоте слота)
bbox = im.getbbox()
im = im.crop(bbox)
print('original content:', im.size)

# вписываем целиком, пропорции оригинала
ratio = min(TARGET[0] / im.width, BOTTOM_Y / im.height)
new_size = (max(1, round(im.width * ratio)), max(1, round(im.height * ratio)))
im = im.resize(new_size, Image.LANCZOS)
print('fitted:', new_size)

# низ контента на BOTTOM_Y, по центру X
canvas = Image.new('RGBA', TARGET, (0, 0, 0, 0))
canvas.paste(im, ((TARGET[0] - im.width) // 2, BOTTOM_Y - im.height), im)
canvas.save(DST, optimize=True)
print(f'OK -> {DST} | {len(open(DST, "rb").read())} bytes')

canvas.resize((TARGET[0] * 6, TARGET[1] * 6), Image.NEAREST).save(
    '/home/z/my-project/scripts/_enemy_preview.png')
