#!/usr/bin/env python3
"""
Обработка сгенерированных спрайтов:
- вырезает маджента-фон (#FF00FF) -> прозрачность (хромакей)
- убирает маджента-отлив с краёв (despill)
- обрезает по непрозрачной области и ресайзит до игровых размеров
Копирует фоны как есть (с лёгким даунскейлом).
"""
import os
from PIL import Image

RAW = "/home/z/my-project/scripts/raw"
OUT = "/home/z/my-project/public/game/image"
os.makedirs(OUT, exist_ok=True)

# key -> (файл, целевая ширина, целевая высота)
SPRITES = {
    "andrey":       ("andrey.png", 64, 72),
    "burmaldenets": ("burmaldenets.png", 54, 64),
    "boss":         ("boss.png", 96, 116),
    "checkushka":   ("checkushka.png", 32, 40),
    "factory":      ("factory.png", 200, 160),
}
BGS = {
    "bg_fields":   "bg_fields.png",
    "bg_city":     "bg_city.png",
    "bg_district": "bg_district.png",
    "bg_plant":    "bg_plant.png",
}


def chroma_key(img: Image.Image) -> Image.Image:
    img = img.convert("RGBA")
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            magenta = min(r, b) - g  # насколько пиксель "маджентовый"
            if magenta > 100 and min(r, b) > 120:
                px[x, y] = (r, g, b, 0)
            elif magenta > 40:
                # полупрозрачный край + ослабление ореола
                af = max(0, min(1, (100 - magenta) / 60.0))
                nr = int(g + (r - g) * 0.55)
                nb = int(g + (b - g) * 0.55)
                px[x, y] = (nr, g, nb, int(255 * af))
            elif magenta > 18:
                # despill: убираем розовый отлив
                nr = int(g + (r - g) * 0.7)
                nb = int(g + (b - g) * 0.7)
                px[x, y] = (nr, g, nb, a)
    return img


def crop_resize(img: Image.Image, tw: int, th: int) -> Image.Image:
    bbox = img.getbbox()
    if bbox:
        img = img.crop(bbox)
    # вписываем с сохранением пропорций, затем pad до точного размера
    scale = min(tw / img.width, th / img.height)
    nw, nh = max(1, round(img.width * scale)), max(1, round(img.height * scale))
    img = img.resize((nw, nh), Image.LANCZOS)
    canvas = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    canvas.paste(img, ((tw - nw) // 2, (th - nh) // 2))
    return canvas


def key_bg_flood(img: Image.Image, test) -> Image.Image:
    """Удаляет фон, заливая от границ картинки (не трогает внутренние пиксели)."""
    from collections import deque
    img = img.convert("RGBA")
    w, h = img.size
    px = img.load()
    seen = [[False] * w for _ in range(h)]
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if not seen[y][x] and test(px[x, y]):
                q.append((x, y)); seen[y][x] = True
    for y in range(h):
        for x in (0, w - 1):
            if not seen[y][x] and test(px[x, y]):
                q.append((x, y)); seen[y][x] = True
    while q:
        x, y = q.popleft()
        px[x, y] = (0, 0, 0, 0)
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not seen[ny][nx] and test(px[nx, ny]):
                seen[ny][nx] = True
                q.append((nx, ny))
    return img


def red_bg_test(p):
    r, g, b, a = p
    return a != 0 and r - max(g, b) > 50 and r > 100


def cleanup_alpha(img: Image.Image) -> Image.Image:
    """1) Заливка от границ по полупрозрачным пикселям (дымка фона).
    2) Бинаризация альфы — пиксель либо есть, либо нет (пиксель-арт)."""
    from collections import deque
    img = img.convert("RGBA")
    w, h = img.size
    px = img.load()
    seen = [[False] * w for _ in range(h)]
    q = deque()
    def is_haze(p):
        return p[3] > 0 and p[3] < 250
    for x in range(w):
        for y in (0, h - 1):
            if not seen[y][x] and is_haze(px[x, y]):
                q.append((x, y)); seen[y][x] = True
    for y in range(h):
        for x in (0, w - 1):
            if not seen[y][x] and is_haze(px[x, y]):
                q.append((x, y)); seen[y][x] = True
    while q:
        x, y = q.popleft()
        r, g, b, a = px[x, y]
        px[x, y] = (r, g, b, 0)
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not seen[ny][nx] and is_haze(px[nx, ny]):
                seen[ny][nx] = True
                q.append((nx, ny))
    # бинаризация
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            px[x, y] = (r, g, b, 255) if a >= 128 else (r, g, b, 0)
    return img


def process(name: str, src: str, tw: int, th: int, extra_flood=False):
    path = os.path.join(RAW, src)
    if not os.path.isfile(path):
        print(f"skip {name}: {src} not ready")
        return
    img = Image.open(path)
    keyed = chroma_key(img)
    if extra_flood:
        keyed = key_bg_flood(keyed, red_bg_test)
    keyed = cleanup_alpha(keyed)
    final = crop_resize(keyed, tw, th)
    final.save(os.path.join(OUT, src))
    print(f"ok {name} -> {src} {final.size}")


def copy_bg(key: str, src: str):
    path = os.path.join(RAW, src)
    if not os.path.isfile(path):
        print(f"skip {key}: {src} not ready")
        return
    img = Image.open(path).convert("RGB")
    img = img.resize((1152, 648), Image.LANCZOS)
    img.save(os.path.join(OUT, src), optimize=True)
    print(f"ok {key} -> {src}")


if __name__ == "__main__":
    for k, (f, w_, h_) in SPRITES.items():
        process(k, f, w_, h_, extra_flood=(k == "checkushka"))
    for k, f in BGS.items():
        copy_bg(k, f)
    print("done")
