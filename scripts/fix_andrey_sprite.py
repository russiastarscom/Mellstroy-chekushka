#!/usr/bin/env python3
# Task 11: чистка зелёной хромакей-каймы на спрайте Андрея (без изменения формы):
# зелёно-доминантные пиксели обесцвечиваем (g -> среднее r,b), сильная зелень -> приглушаем до кромки.
from PIL import Image
import numpy as np

P = '/home/z/my-project/public/game/image/andrey.png'
im = Image.open(P).convert('RGBA')
a = np.array(im).astype(int)
r, g, b, al = a[:, :, 0], a[:, :, 1], a[:, :, 2], a[:, :, 3]

greenish = (al > 40) & (g > r + 6) & (g > b + 6)          # любой зелёный перевес
strong = (al > 40) & (g > r + 22) & (g > b + 22)          # яркая кайма
print('greenish:', greenish.sum(), 'strong:', strong.sum())

# despill: g = (r+b)/2 + чуть яркости
g_new = ((r + b) // 2 + 8)
g[greenish] = g_new[greenish]
# сильную кайму дополнительно притемняем к цвету волос (тёмно-коричневый)
r[strong] = (r[strong] * 0.55).astype(int)
b[strong] = (b[strong] * 0.55).astype(int)
g[strong] = (g[strong] * 0.60).astype(int)

out = np.stack([np.clip(r, 0, 255), np.clip(g, 0, 255), np.clip(b, 0, 255), al], axis=2).astype(np.uint8)
Image.fromarray(out).save(P)

# контрольный прогон
a2 = np.array(Image.open(P).convert('RGBA')).astype(int)
gr = (a2[:, :, 3] > 40) & (a2[:, :, 1] > a2[:, :, 0] + 10) & (a2[:, :, 1] > a2[:, :, 2] + 10)
print('green after:', gr.sum())
