#!/bin/bash
# Генерация плейсхолдер-спрайтов для треш-платформера "Мировая чекушка"
# Спрайты генерируются на сплошном маджента-фоне (#FF00FF), чтобы потом вырезать прозрачность
RAW=/home/z/my-project/scripts/raw
mkdir -p "$RAW"

gen() {
  local prompt="$1" out="$2" size="$3"
  for attempt in 1 2 3; do
    if [ -s "$RAW/$out" ]; then echo "OK(skip): $out"; return 0; fi
    z-ai image -p "$prompt" -o "$RAW/$out" -s "$size" && [ -s "$RAW/$out" ] \
      && echo "OK: $out" && return 0
    echo "RETRY($attempt): $out"; sleep 3
  done
  echo "FAIL: $out"
}

# ---------- Волна 1: спрайты персонажей/предметов (маджента-фон) ----------
gen "16-bit pixel art video game sprite of a young man, short dark hair, light beard stubble, black hoodie and black track pants, confident smirk, full body, side view facing right, standing idle pose, retro platformer hero character, crisp large pixels, flat solid magenta background #FF00FF filling entire background, no shadow, no text" "andrey.png" "1024x1024" && true
gen "16-bit pixel art video game sprite of a funny cartoon tribal warrior enemy, tan skin, red headband with three feathers, holding small stone tomahawk, angry comical expression, loincloth with simple pattern, full body, side view facing left, walking pose, retro platformer enemy, crisp large pixels, flat solid magenta background #FF00FF filling entire background, no shadow, no text" "burmaldenets.png" "1024x1024" && true
gen "16-bit pixel art video game sprite of a huge muscular tribal chief boss, tall golden feather headdress, big stone tomahawk, angry shouting face, massive arms, full body, side view facing left, retro platformer boss character, crisp large pixels, flat solid magenta background #FF00FF filling entire background, no shadow, no text" "boss.png" "1024x1024" && true
gen "16-bit pixel art video game item sprite of one small glass vodka bottle, clear glass with light green tint, white rectangular label, blue cap, retro platformer collectible, crisp large pixels, flat solid magenta background #FF00FF filling entire background, no shadow, no text" "checkushka.png" "1024x1024" && true
gen "16-bit pixel art video game sprite of a small old red brick factory building with two chimneys with white-red stripes, gate and sign board, side view, retro platformer level exit building, crisp large pixels, flat solid magenta background #FF00FF filling entire background, no shadow, no text" "factory.png" "1024x1024" && true

# ---------- Волна 2: фоны уровней ----------
gen "16-bit pixel art parallax game background, rural countryside at summer noon, green fields, birch trees, wooden village houses with fences, dirt road, blue sky with fluffy clouds, retro platformer level background, crisp pixels, no characters, no text" "bg_fields.png" "1344x768" && true
gen "16-bit pixel art parallax game background, small provincial town street, gray panel apartment buildings, small shops with colorful signs, parked old cars, overcast sky, retro platformer level background, crisp pixels, no characters, no text" "bg_city.png" "1344x768" && true
gen "16-bit pixel art parallax game background, industrial factory district at dusk, brick factories with smoking chimneys, pipes, warehouses, orange purple sky, retro platformer level background, crisp pixels, no characters, no text" "bg_district.png" "1344x768" && true
gen "16-bit pixel art parallax game background, large vodka plant courtyard at evening, huge industrial building with big illuminated bottle sign on roof, tanks and pipes, warm lights in windows, dark blue sky, retro platformer level background, crisp pixels, no characters, no readable text" "bg_plant.png" "1344x768" && true

echo "=== DONE ==="
ls -la "$RAW"
