// ============================================================
// Загрузчик спрайтов из папки image/
// Файл есть  → используется он (замена «на лету» при следующей загрузке)
// Файла нет  → рисуется встроенная пиксельная заглушка
// Просто закинь свои PNG с этими именами в папку image/:
//   andrey.png burmaldenets.png boss.png checkushka.png factory.png
//   tomahawk.png heart.png bg_fields.png bg_city.png bg_district.png bg_plant.png
// ============================================================
const Sprites = (() => {
  const DEFS = {
    andrey:       { file: 'image/andrey.png',       w: 48,  h: 56  },
    burmaldenets: { file: 'image/burmaldenets.png', w: 44,  h: 52  },
    boss:         { file: 'image/boss.png',         w: 76,  h: 92  },
    checkushka:   { file: 'image/checkushka.png',   w: 24,  h: 32  },
    factory:      { file: 'image/factory.png',      w: 176, h: 140 },
    tomahawk:     { file: 'image/tomahawk.png',     w: 20,  h: 20  },
    heart:        { file: 'image/heart.png',        w: 26,  h: 24  },
    bg_fields:    { file: 'image/bg_fields.png',    bg: true },
    bg_city:      { file: 'image/bg_city.png',      bg: true },
    bg_district:  { file: 'image/bg_district.png',  bg: true },
    bg_plant:     { file: 'image/bg_plant.png',     bg: true },
  };

  const store = {}; // key -> {img, fallback, w, h}
  let loaded = false;

  // ---------- вспомогалки для пиксель-арта ----------
  function mkCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    return [c, x];
  }
  function px(x, gx, gy, gw, gh, color, s = 4) {
    x.fillStyle = color;
    x.fillRect(gx * s, gy * s, gw * s, gh * s);
  }

  // ---------- ЗАГЛУШКА: Андрей ----------
  function fbAndrey() {
    const [c, x] = mkCanvas(48, 56);
    const S = 4, W = 12, H = 14;
    px(x, 3, 0, 6, 2, '#2b2118', S);              // волосы
    px(x, 3, 2, 6, 3, '#e8b287', S);              // лицо
    px(x, 7, 3, 1, 1, '#1a1a1a', S);              // глаз
    px(x, 4, 4, 5, 1, '#a4795a', S);              // щетина
    px(x, 2, 5, 8, 6, '#1d1d24', S);              // худи
    px(x, 6, 5, 1, 6, '#3a3a46', S);              // молния
    px(x, 1, 6, 1, 4, '#1d1d24', S);              // рука Л
    px(x, 10, 6, 1, 4, '#1d1d24', S);             // рука П
    px(x, 1, 9, 1, 1, '#e8b287', S);              // кисть
    px(x, 10, 9, 1, 1, '#e8b287', S);
    px(x, 3, 11, 3, 2, '#23232e', S);             // штаны
    px(x, 6, 11, 3, 2, '#23232e', S);
    px(x, 2, 13, 3, 1, '#e8e8e8', S);             // кроссы
    px(x, 7, 13, 3, 1, '#e8e8e8', S);
    return c;
  }

  // ---------- ЗАГЛУШКА: Бурмалденец ----------
  function fbEnemy() {
    const [c, x] = mkCanvas(44, 52);
    const S = 4, W = 11, H = 13;
    px(x, 4, 0, 1, 1, '#e63946', S);              // перья
    px(x, 6, 0, 1, 1, '#ffd23f', S);
    px(x, 5, 1, 1, 1, '#e63946', S);
    px(x, 3, 2, 5, 1, '#c1272d', S);              // повязка
    px(x, 3, 3, 5, 2, '#c68642', S);              // лицо
    px(x, 6, 3, 1, 1, '#1a1a1a', S);              // злой глаз
    px(x, 3, 5, 5, 4, '#a9714b', S);              // торс
    px(x, 2, 5, 1, 3, '#c68642', S);              // руки
    px(x, 8, 5, 1, 3, '#c68642', S);
    px(x, 3, 9, 5, 1, '#8b5a2b', S);              // набедренная
    px(x, 3, 10, 2, 2, '#c68642', S);             // ноги
    px(x, 6, 10, 2, 2, '#c68642', S);
    px(x, 2, 12, 2, 1, '#5d4037', S);             // мокасины
    px(x, 7, 12, 2, 1, '#5d4037', S);
    px(x, 9, 3, 1, 5, '#795548', S);              // томагавк ручка
    px(x, 8, 2, 3, 2, '#9e9e9e', S);              // камень
    return c;
  }

  // ---------- ЗАГЛУШКА: Вождь ----------
  function fbBoss() {
    const [c, x] = mkCanvas(76, 92);
    const S = 4, W = 19, H = 23;
    for (let i = 0; i < 5; i++) px(x, 5 + i, 0, 1, 2, i % 2 ? '#ffd23f' : '#e63946', S); // корона перьев
    px(x, 4, 2, 11, 3, '#e6b422', S);             // шапка вождя
    px(x, 5, 5, 9, 3, '#c68642', S);              // лицо
    px(x, 7, 6, 1, 1, '#1a1a1a', S);              // глаза
    px(x, 11, 6, 1, 1, '#1a1a1a', S);
    px(x, 7, 7, 5, 1, '#7a4a2b', S);              // рот-крик
    px(x, 4, 8, 11, 7, '#a9714b', S);             // торс-гора
    px(x, 2, 9, 2, 5, '#c68642', S);              // руки
    px(x, 15, 9, 2, 5, '#c68642', S);
    px(x, 3, 8, 3, 2, '#c68642', S);              // кулаки
    px(x, 13, 8, 3, 2, '#c68642', S);
    px(x, 6, 15, 3, 1, '#8b5a2b', S);             // набедренная
    px(x, 10, 15, 3, 1, '#8b5a2b', S);
    px(x, 6, 16, 3, 5, '#a9714b', S);             // ноги
    px(x, 10, 16, 3, 5, '#a9714b', S);
    px(x, 5, 21, 4, 2, '#5d4037', S);             // сапоги
    px(x, 10, 21, 4, 2, '#5d4037', S);
    px(x, 16, 4, 2, 10, '#795548', S);            // дубовый томагавк
    px(x, 14, 2, 5, 4, '#9e9e9e', S);             // камень
    return c;
  }

  // ---------- ЗАГЛУШКА: Чекушка ----------
  function fbBottle() {
    const [c, x] = mkCanvas(24, 32);
    px(x, 9, 0, 6, 2, '#2e6fb7');                 // крышка
    px(x, 8, 2, 8, 3, '#9fd8b4');                 // горлышко
    px(x, 8, 2, 2, 3, '#c9efe0');                 // блик
    px(x, 5, 5, 14, 25, '#8fcaa6');               // бутылка
    px(x, 5, 5, 3, 25, '#c9efe0');                // блик
    px(x, 6, 12, 12, 9, '#f2f2f2');               // этикетка
    x.fillStyle = '#c1272d';
    x.font = 'bold 8px Arial';
    x.fillText('МЧ', 8, 19);
    return c;
  }

  // ---------- ЗАГЛУШКА: Завод ----------
  function fbFactory() {
    const [c, x] = mkCanvas(176, 140);
    // трубы
    for (const cx of [10, 34]) {
      for (let i = 0; i < 7; i++) {
        x.fillStyle = i % 2 ? '#e8e8e8' : '#c1272d';
        x.fillRect(cx, 6 + i * 8, 10, 8);
      }
    }
    px(x, 2, 54, 172, 84, '#8f3b2d');             // корпус
    px(x, 2, 54, 172, 6, '#6d2c21');              // тень крыши
    // окна
    for (let i = 0; i < 5; i++) px(x, 8 + i * 9, 64, 6, 8, '#ffd97a');
    for (let i = 0; i < 5; i++) px(x, 8 + i * 9, 80, 6, 8, '#ffd97a');
    // вывеска
    px(x, 30, 92, 60, 16, '#f2f2f2');
    x.fillStyle = '#1a1a1a'; x.font = 'bold 11px Arial'; x.textAlign = 'center';
    x.fillText('ЧЕКУШКА', 60, 103);
    x.textAlign = 'left';
    // ворота
    px(x, 70, 108, 36, 32, '#3a2a22');
    px(x, 86, 108, 2, 32, '#211712');
    return c;
  }

  // ---------- ЗАГЛУШКА: Томагавк ----------
  function fbTomahawk() {
    const [c, x] = mkCanvas(20, 20);
    x.strokeStyle = '#795548'; x.lineWidth = 3;
    x.beginPath(); x.moveTo(4, 16); x.lineTo(15, 4); x.stroke();
    x.fillStyle = '#9e9e9e';
    x.fillRect(11, 1, 8, 6);
    return c;
  }

  // ---------- ЗАГЛУШКА: Сердечко ----------
  function fbHeart() {
    const [c, x] = mkCanvas(26, 24);
    x.fillStyle = '#ff4757';
    x.beginPath();
    x.arc(8, 8, 7, 0, 7); x.arc(18, 8, 7, 0, 7); x.fill();
    x.beginPath();
    x.moveTo(1, 11); x.lineTo(13, 23); x.lineTo(25, 11); x.closePath(); x.fill();
    return c;
  }

  const FALLBACKS = {
    andrey: fbAndrey, burmaldenets: fbEnemy, boss: fbBoss, checkushka: fbBottle,
    factory: fbFactory, tomahawk: fbTomahawk, heart: fbHeart,
  };

  // ---------- Загрузка ----------
  function loadOne(key, def) {
    return new Promise((resolve) => {
      const img = new Image();
      const done = (ok) => {
        store[key] = {
          img: ok ? img : null,
          fallback: FALLBACKS[key] ? FALLBACKS[key]() : null,
          w: def.w, h: def.h, bg: !!def.bg,
        };
        resolve();
      };
      img.onload = () => done(true);
      img.onerror = () => done(false);
      img.src = def.file;
    });
  }

  async function load() {
    if (loaded) return;
    await Promise.all(Object.entries(DEFS).map(([k, d]) => loadOne(k, d)));
    loaded = true;
  }

  function get(key) { return store[key]; }

  // Нарисовать спрайт (img или фолбэк) с флипом
  function draw(ctx, key, x, y, w, h, flip = false) {
    const s = store[key];
    if (!s) return;
    const src = s.img || s.fallback;
    if (!src) return;
    ctx.save();
    if (flip) { ctx.translate(x + w, y); ctx.scale(-1, 1); }
    else ctx.translate(x, y);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(src, 0, 0, w, h);
    ctx.restore();
  }

  // Портрет для диалогов (верхняя часть спрайта)
  function portrait(key, canvas) {
    const s = store[key];
    const x = canvas.getContext('2d');
    x.clearRect(0, 0, canvas.width, canvas.height);
    x.imageSmoothingEnabled = false;
    if (!s) return;
    const src = s.img || s.fallback;
    if (!src) return;
    const sw = src.width, sh = Math.max(1, src.height * 0.5);
    x.drawImage(src, 0, 0, sw, sh, 0, 0, canvas.width, canvas.height);
  }

  return { load, get, draw, portrait, isReady: () => loaded };
})();
