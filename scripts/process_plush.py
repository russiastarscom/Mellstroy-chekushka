#!/usr/bin/env python3
# Плюшевый снаряд из upload -> image/plush.png (слот 36x32):
# 1) срез ЗЕЛЁНОЙ каймы (остатки хромакея) по маске
# 2) кроп по контенту, ресайз LANCZOS, бинаризация альфы
from PIL import Image

SRC = '/home/z/my-project/upload/Screenshot_20260913-200959cc.png'
DST = '/home/z/my-project/public/game/image/plush.png'
TARGET = (36, 32)  # слот в sprites.js

im = Image.open(SRC).convert('RGBA')
print('source:', im.size)

px = im.load()
w, h = im.size
# 1) зелёная кайма -> прозрачная; чуть подрезаем и полупрозрачные края
changed = 0
for y in range(h):
    for x in range(w):
        r, g, b, a = px[x, y]
        if a > 0 and g > r + 18 and g > b + 18:
            px[x, y] = (r, g, b, 0)
            changed += 1
print('green fringe removed px:', changed)

# 2) кроп по контенту
bbox = im.getbbox()
if bbox:
    im = im.crop(bbox)

# 3) ресайз в слот с сохранением пропорций
ratio = min(TARGET[0] / im.width, TARGET[1] / im.height)
new_size = (max(1, round(im.width * ratio)), max(1, round(im.height * ratio)))
im = im.resize(new_size, Image.LANCZOS)

# 4) бинаризация альфы + удаление одиночных полупрозрачных ореолов
a = im.getchannel('A').point(lambda v: 255 if v >= 120 else 0)
im.putalpha(a)

# 5) центрируем в слоте
canvas = Image.new('RGBA', TARGET, (0, 0, 0, 0))
canvas.paste(im, ((TARGET[0] - im.width) // 2, (TARGET[1] - im.height) // 2), im)
canvas.save(DST, optimize=True)
print(f'OK -> {DST} | content {new_size} in slot {TARGET}')

# превью x6 для проверки
big = canvas.resize((TARGET[0] * 6, TARGET[1] * 6), Image.NEAREST)
big.save('/home/z/my-project/scripts/plush_preview.png')
print('preview saved')
