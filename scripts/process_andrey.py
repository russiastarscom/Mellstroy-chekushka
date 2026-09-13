#!/usr/bin/env python3
# Обработка загруженного спрайта Андрея под игровой слот 48x56:
# кроп по контенту -> зеркалим (смотрел влево, надо ВПРАВО) ->
# ресайз LANCZOS -> бинаризация альфы (без ореолов) -> оптимизированное PNG
from PIL import Image

SRC = '/home/z/my-project/upload/andrey.png'
DST = '/home/z/my-project/public/game/image/andrey.png'
TARGET = (48, 56)  # слот в sprites.js

im = Image.open(SRC).convert('RGBA')

# 1) кроп по непрозрачному контенту
bbox = im.getbbox()
if bbox:
    im = im.crop(bbox)

# 2) направление: в игре флип при движении влево -> арт должен смотреть ВПРАВО.
#    На фото Андрей повёрнут чуть влево -> зеркалим.
im = im.transpose(Image.FLIP_LEFT_RIGHT)

# 3) ресайз под слот с сохранением пропорций (вписываем, не растягиваем)
ratio = min(TARGET[0] / im.width, TARGET[1] / im.height)
new_size = (max(1, round(im.width * ratio)), max(1, round(im.height * ratio)))
im = im.resize(new_size, Image.LANCZOS)

# 4) бинаризация альфы: LANCZOS дал полупрозрачную кайму -> убираем
a = im.getchannel('A').point(lambda v: 255 if v >= 128 else 0)
im.putalpha(a)

# 5) центрируем в слоте 48x56
canvas = Image.new('RGBA', TARGET, (0, 0, 0, 0))
canvas.paste(im, ((TARGET[0] - im.width) // 2, (TARGET[1] - im.height) // 2), im)

canvas.save(DST, optimize=True)
print(f'OK -> {DST} | content {new_size} in slot {TARGET} | {len(open(DST,"rb").read())} bytes')
