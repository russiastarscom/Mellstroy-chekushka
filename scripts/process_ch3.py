#!/usr/bin/env python3
"""Обработка ассетов Главы 3: фоны (ресайз) и враги (хромакей flood-fill + кроп + ресайз)."""
import os
from collections import deque
from PIL import Image

RAW = "/home/z/my-project/scripts/raw"
OUT = "/home/z/my-project/public/game/image"
os.makedirs(OUT, exist_ok=True)

BGS = {
    "bg_snow": "bg_snow.png",
    "bg_desert": "bg_desert.png",
    "bg_sky": "bg_sky.png",
    "bg_volcano": "bg_volcano.png",
    "bg_final": "bg_final.png",
}
# key -> (файл, целевая ширина, высота)
ENEMIES = {
    "flyer": ("flyer.png", 60, 52),
    "jumper": ("jumper.png", 52, 72),
    "armored": ("armored.png", 56, 64),
}


def flood_key(img: Image.Image, tol: float = 90.0) -> Image.Image:
    """Flood-fill с краёв: удаляет фон (и тень под ногами), похожий на цвет краёв."""
    img = img.convert("RGBA")
    w, h = img.size
    px = img.load()

    def close(c1, c2, t):
        return (c1[0] - c2[0]) ** 2 + (c1[1] - c2[1]) ** 2 + (c1[2] - c2[2]) ** 2 <= t * t

    # усредняем цвет по 4 углам 20x20
    samples = []
    for cx, cy in [(2, 2), (w - 22, 2), (2, h - 22), (w - 22, h - 22)]:
        rs = gs = bs = n = 0
        for y in range(cy, cy + 20):
            for x in range(cx, cx + 20):
                r, g, b, a = px[x, y]
                rs += r; gs += g; bs += b; n += 1
        samples.append((rs / n, gs / n, bs / n))

    seen = [[False] * w for _ in range(h)]
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            q.append((x, y))
    for (x, y) in list(q):
        r, g, b, a = px[x, y]
        if not any(close((r, g, b), s, tol) for s in samples):
            continue
        if seen[y][x]:
            continue
        # BFS от этого краевого пикселя
        stack = [(x, y)]
        while stack:
            cx, cy = stack.pop()
            if cx < 0 or cy < 0 or cx >= w or cy >= h or seen[cy][cx]:
                continue
            r, g, b, a = px[cx, cy]
            if not any(close((r, g, b), s, tol) for s in samples):
                continue
            seen[cy][cx] = True
            px[cx, cy] = (r, g, b, 0)
            stack.extend([(cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)])
    # despill: полупрозрачные края
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if 0 < a < 255:
                px[x, y] = (r, g, b, 255 if a > 140 else 0)
    return img


def crop_resize(img: Image.Image, tw: int, th: int) -> Image.Image:
    bbox = img.getbbox()
    if bbox:
        img = img.crop(bbox)
    bw, bh = img.size
    sc = min(tw / bw, th / bh)
    img = img.resize((max(1, int(bw * sc)), max(1, int(bh * sc))), Image.NEAREST)
    out = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    out.paste(img, ((tw - img.width) // 2, (th - img.height) // 2))
    return out


for key, fname in BGS.items():
    img = Image.open(os.path.join(RAW, fname)).convert("RGB")
    img = img.resize((1152, 576), Image.LANCZOS)
    img.save(os.path.join(OUT, f"{key}.png"), optimize=True)
    print(f"{key}: {img.size}")

for key, (fname, tw, th) in ENEMIES.items():
    img = Image.open(os.path.join(RAW, fname))
    img = flood_key(img)
    img = crop_resize(img, tw, th)
    img.save(os.path.join(OUT, f"{key}.png"), optimize=True)
    print(f"{key}: {img.size} ok")
print("DONE")
