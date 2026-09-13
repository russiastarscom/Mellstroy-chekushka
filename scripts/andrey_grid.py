#!/usr/bin/env python3
# Андрей x8 с сеткой каждые 2px + номера строк
from PIL import Image, ImageDraw

im = Image.open('/home/z/my-project/public/game/image/andrey.png').convert('RGBA')
S = 8
big = im.resize((im.width * S, im.height * S), Image.NEAREST)
bg = Image.new('RGBA', big.size, (70, 70, 110, 255))
bg.paste(big, (0, 0), big)
d = ImageDraw.Draw(bg)
for y in range(0, im.height, 2):
    col = (255, 60, 60, 255) if y % 10 == 0 else (255, 255, 255, 60)
    d.line([(0, y * S), (big.width, y * S)], fill=col, width=1)
    if y % 10 == 0:
        d.text((2, y * S + 2), str(y), fill=(255, 255, 0, 255))
for x in range(0, im.width, 10):
    d.line([(x * S, 0), (x * S, big.height)], fill=(255, 255, 255, 40), width=1)
bg.convert('RGB').save('/home/z/my-project/scripts/out_task11/andrey_grid.png')
print('ok')
