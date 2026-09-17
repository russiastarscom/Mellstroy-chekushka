#!/bin/bash
# Глава 3: 5 фонов + 3 спрайта врагов (последовательно!)
set -e
mkdir -p /home/z/my-project/scripts/raw
cd /home/z/my-project/scripts/raw

echo "[1/8] bg_snow..."
z-ai image -p "2D game background, cartoon winter mountain pass, snowy pine forest, frozen waterfall, ice cliffs, distant village with smoke, bright daylight, colorful, clean game art, no characters, no text, horizontal parallax background" -o bg_snow.png -s 1344x768

echo "[2/8] bg_desert..."
z-ai image -p "2D game background, cartoon desert canyon with sand dunes, red rock mesas, giant cacti, ancient ruined pyramids, hot sunny sky, colorful, clean game art, no characters, no text, horizontal parallax background" -o bg_desert.png -s 1344x768

echo "[3/8] bg_sky..."
z-ai image -p "2D game background, cartoon sky kingdom above fluffy clouds, floating islands with small factories and pipes, airships, bright sunny day, colorful, clean game art, no characters, no text, horizontal parallax background" -o bg_sky.png -s 1344x768

echo "[4/8] bg_volcano..."
z-ai image -p "2D game background, cartoon volcanic industrial landscape, glowing lava rivers, dark factory chimneys with smoke, orange dramatic sky, embers, clean game art, no characters, no text, horizontal parallax background" -o bg_volcano.png -s 1344x768

echo "[5/8] bg_final..."
z-ai image -p "2D game background, cartoon grand beer bottle factory interior at night, huge glowing golden bottle statue on pedestal, conveyor belts, festive garlands and lights, epic celebration mood, clean game art, no characters, no text, horizontal" -o bg_final.png -s 1344x768

echo "[6/8] flyer..."
z-ai image -p "single cartoon game sprite, angry tribal warrior with red feather headband and big feathered wings spread wide, flying pose side view, full body, thick black outline, flat 2D cartoon style, solid uniform magenta background #FF00FF, no shadow, no ground, no text" -o flyer.png -s 1024x1024

echo "[7/8] jumper..."
z-ai image -p "single cartoon game sprite, angry tribal warrior with feather headband crouching on coiled metal springs instead of legs, ready to jump pose side view, full body, thick black outline, flat 2D cartoon style, solid uniform magenta background #FF00FF, no shadow, no ground, no text" -o jumper.png -s 1024x1024

echo "[8/8] armored..."
z-ai image -p "single cartoon game sprite, angry tribal warrior with feather headband hiding behind a huge round wooden shield with metal rim, pots and pans armor, walking pose side view, full body, thick black outline, flat 2D cartoon style, solid uniform magenta background #FF00FF, no shadow, no ground, no text" -o armored.png -s 1024x1024

echo "DONE"
ls -la
