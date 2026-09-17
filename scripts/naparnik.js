// 🐶 НАПАРНИК — бегает за игроком, прыгает по платформам,
// убивает врагов касанием, собирает чекушки, имеет 3 HP.
// Каждый убитый враг кусается: -1 HP. На нуле напарник погибает.


// --- одноразовая настройка ---
if (!obj.data.init) {
  obj.data.init = 1;
  obj.hp = obj.maxHp = 3;   // жизнь напарника (полоска HP появится сама)
  obj.data.cd = 0;          // неуязвимость после укуса, сек
  obj.data.jcd = 0;         // кулдаун прыжка, сек
}

// прямоугольное пересечение двух сущностей
const hit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

obj.data.cd = Math.max(0, obj.data.cd - dt);
obj.data.jcd = Math.max(0, obj.data.jcd - dt);

// --- 1. БЕГАЕТ ЗА ИГРОКОМ (держится в 70px) ---
const dx = api.px - obj.x, dy = api.py - obj.y;
const far = Math.abs(dx);
if (far > 70) { obj.vx = Math.sign(dx) * 200; obj.dir = Math.sign(dx); }
else obj.vx = 0;

// --- 1.5 ВРАГ ПРИБЛИЗИЛСЯ К ИГРОКУ — БРОСОК НА ПЕРЕХВАТ ---
let threat = null, tdist = 1e9;
for (const e of api.enemies()) {
  if (e.hp !== undefined) continue;              // босса перехватом не считаем
  const d = Math.abs(e.x - api.px) + Math.abs(e.y - api.py);
  if (d < tdist) { tdist = d; threat = e; }
}
if (threat && tdist < 170) {
  obj.vx = Math.sign(threat.x - obj.x) * 240;
  obj.dir = Math.sign(threat.x - obj.x);
}

// --- 2. ПРЫГАЕТ: пропасть впереди / стена / игрок выше ---
const aheadX = obj.vx > 0 ? obj.x + obj.w + 6 : obj.x - 6;
const gap  = obj.onGround && obj.vx !== 0 && !api.solidAt(aheadX, obj.y + obj.h + 8);
const wall = api.solid(obj) || (obj.vx !== 0 && api.solidAt(aheadX, obj.y + obj.h - 14));
const high = dy < -70 && far < 300;
if (obj.onGround && obj.data.jcd <= 0 && (gap || wall || high)) {
  obj.vy = -720;
  obj.data.jcd = 0.45;
  api.sfx('jump');
}

// --- 3. ФИЗИКА (гравитация + столкновения с тайлами) ---
api.gravity(obj, dt);

// --- 4. УБИВАЕТ ВРАГОВ КАСАНИЕМ (любой враг кусается: -1 HP) ---
for (const e of api.enemies()) {
  if (!hit(obj, e)) continue;
  if (e.hp !== undefined) {           // босс: снимаем 1 HP, как плюшкой
    if (e.hitByHat) e.hitByHat(api);
  } else {                            // обычный враг: погибает
    e.stomp(api);
    api.particles(e.x + e.w / 2, e.y + e.h / 2, 'sparkle', 6);
  }
  if (obj.data.cd <= 0) {             // ...но кусается: -1 HP напарнику
    obj.data.cd = 0.8;
    obj.hurt(api);
    api.sfx('hurt');
    if (obj.dead) api.sfx('stomp');   // напарник погиб — звук смерти
  }
}

// --- 5. СОБИРАЕТ ЧЕКУШКИ (зона чуть выше головы — как у игрока) ---
for (const b of api.bottles()) {
  if (b.taken) continue;
  const r = b.rect();
  const reach = { x: obj.x, y: obj.y - 10, w: obj.w, h: obj.h + 10 };
  if (hit(reach, r)) {
    b.taken = true;
    api.score(1);
    api.sfx('coin');
    api.particles(r.x + r.w / 2, r.y + r.h / 2, 'sparkle', 4);
  }
}
