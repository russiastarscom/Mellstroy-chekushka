#!/usr/bin/env python3
"""Генерация иконок PWA для игры (пиксельная бутылка чекушки)."""
from PIL import Image, ImageDraw, ImageFont

OUT = "/home/z/my-project/public/game/image"

def draw_bottle_icon(size: int) -> Image.Image:
    img = Image.new("RGB", (size, size), (13, 13, 26))
    d = ImageDraw.Draw(img)
    s = size / 512  # масштаб

    # рамка-сетка
    grid = int(16 * s)
    for i in range(0, size, grid):
        d.line([(i, 0), (i, size)], fill=(18, 18, 36))
        d.line([(0, i), (size, i)], fill=(18, 18, 36))

    # бутылка (пиксель-стиль: прямоугольники с шагом)
    step = size / 32
    def px(x0, y0, x1, y1, color):
        d.rectangle([x0 * step, y0 * step, (x1) * step - 1, (y1) * step - 1], fill=color)

    CAP = (46, 111, 183)
    GLASS = (143, 202, 166)
    LIGHT = (201, 239, 224)
    LABEL = (242, 242, 242)
    DARK = (26, 26, 26)
    RED = (193, 39, 45)

    # крышка
    px(13, 3, 19, 6, CAP)
    # горлышко
    px(12, 6, 20, 11, GLASS)
    px(12, 6, 14, 11, LIGHT)
    # корпус
    px(9, 11, 23, 29, GLASS)
    px(9, 11, 12, 29, LIGHT)
    # этикетка
    px(11, 16, 21, 24, LABEL)
    # надпись МЧ
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", int(7.4 * step))
    except Exception:
        font = ImageFont.load_default()
    d.text((16 * step, 20 * step), "МЧ", font=font, fill=DARK, anchor="mm")
    # красная полоска на этикетке
    px(11, 24, 21, 25, RED)

    return img

def with_safe_zone(size: int) -> Image.Image:
    """Maskable-иконка: контент в центральных 80%."""
    base = draw_bottle_icon(size)
    bg = Image.new("RGB", (size, size), (13, 13, 26))
    inner = int(size * 0.78)
    small = base.resize((inner, inner), Image.NEAREST)
    off = (size - inner) // 2
    bg.paste(small, (off, off))
    return bg

img512 = draw_bottle_icon(512)
img512.save(f"{OUT}/icon-512.png")
img512.resize((192, 192), Image.NEAREST).save(f"{OUT}/icon-192.png")
with_safe_zone(512).save(f"{OUT}/icon-512-maskable.png")
print("icons done:", OUT)
