// ============================================================
// ЯДРО ИГРЫ
// ============================================================
const Game = (() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  let VIEW_W = 960;
  const VIEW_H = 540;

  // ---------- автрастягивание под весь экран ----------
  // Высота мира всегда 540 (вертикальный геймплей не меняется),
  // ширина обзора подгоняется под пропорции окна — чёрных полос нет.
  function resizeCanvas() {
    const vw = Math.max(1, window.innerWidth), vh = Math.max(1, window.innerHeight);
    const aspect = Math.max(0.5, Math.min(3.2, vw / vh));
    VIEW_W = Math.max(480, Math.min(1920, Math.round(VIEW_H * aspect)));
    canvas.width = VIEW_W;
    canvas.height = VIEW_H;
    ctx.imageSmoothingEnabled = false;
  }

  // ---------- полный экран (Fullscreen API) ----------
  // Тап по экрану только ОТКРЫВАЕТ полный экран — и всё.
  // Обратно не выключаем: выйти можно штатными средствами браузера (Esc).
  function isFullscreen() { return !!document.fullscreenElement; }
  function enterFullscreen() {
    try {
      if (isFullscreen()) return; // уже во весь экран — ничего не делаем
      const el = document.documentElement;
      const fn = el.requestFullscreen || el.webkitRequestFullscreen;
      if (fn) { const p = fn.call(el); if (p && p.catch) p.catch(() => {}); }
    } catch (e) { /* игнор — некоторые окружения запрещают фуллскрин */ }
  }

  let state = 'boot';           // boot | menu | playing | paused | gameover | transition | ending
  let frozen = false;           // true во время диалогов
  let level = null, levelIndex = 0;
  let player = null;
  let enemies = [], tomahawks = [], bottles = [], hearts = [], particles = [];
  let factory = null;
  let cam = 0, shake = 0;
  let bottlesGot = 0, kills = 0;
  let tGlobal = 0, lastT = 0;
  let bossRef = null;
  let hudCache = { hp: -1, bottles: -1 };

  const input = { left: false, right: false, down: false, jumpHeld: false, jumpPressed: false };

  // API для сущностей (передаётся вместо this)
  const api = {
    spawnDust, spawnStars, onPlayerHurt, playerFell, onBossDead,
    get player() { return player; },
    get tomahawks() { return tomahawks; },
    get shake() { return shake; },
    set shake(v) { shake = v; },
    get kills() { return kills; },
    set kills(v) { kills = v; },
  };

  // ---------- прогресс ----------
  const SAVE_KEY = 'melstroy_chekushka_v1';
  let progress = { unlocked: 1, done: {}, sound: true };
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) progress = Object.assign(progress, JSON.parse(raw));
  } catch (e) { /* ignore */ }
  function saveProgress() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(progress)); } catch (e) { /* ignore */ }
  }

  // ---------- загрузка уровня ----------
  function startLevel(i) {
    levelIndex = i;
    const def = LEVELS[i];
    if (!def) return;

    if (def.type === 'indev') { Audio8.stopMusic(); UI.showScreen('indev'); return; }

    if (def.type === 'cutscene') {
      state = 'transition';
      Audio8.stopMusic();
      UI.showScreen(null);
      UI.setHud({ levelName: def.name, hp: CONFIG.PLAYER_HP, bottles: 0 });
      UI.cutscene(def.cutscene, CUTSCENE_BG_BY_INDEX).then(async () => {
        await finishLevel(true);
      });
      return;
    }

    // карта
    level = buildLevel(def);
    enemies = []; tomahawks = []; bottles = []; hearts = []; particles = [];
    bossRef = null;
    level.spawns.enemies.forEach(({ type, c, r }) => {
      if (type === 'e') enemies.push(new Walker(c, r));
      else if (type === 't') enemies.push(new Thrower(c, r));
      else if (type === 'boss') { const b = new Boss(c); enemies.push(b); bossRef = b; }
    });
    level.spawns.bottles.forEach(({ c, r }) => bottles.push(new Bottle(c, r)));
    level.spawns.hearts.forEach(({ c, r }) => hearts.push(new HeartPickup(c, r)));
    factory = new FactoryExit(level.factoryC, !!def.factoryLocked);
    player = new Player(level.spawnC);
    player.hp = CONFIG.PLAYER_HP;
    bottlesGot = 0;
    kills = 0;
    cam = 0; shake = 0;
    hudCache = { hp: -1, bottles: -1 };

    state = 'playing';
    frozen = true; // пока идёт вступительный диалог
    UI.showScreen(null);
    UI.setHud({ levelName: def.name, hp: player.hp, bottles: 0 });
    Audio8.startMusic();

    UI.dialogue(def.dialogue?.intro).then(() => { frozen = false; });
  }

  // ---------- завершение уровня ----------
  async function finishLevel(isIntro = false) {
    const def = LEVELS[levelIndex];
    Audio8.stopMusic();
    Audio8.sfx.win();
    frozen = true;

    if (!isIntro && def.dialogue?.outro) await UI.dialogue(def.dialogue.outro);

    progress.done[levelIndex] = true;
    progress.unlocked = Math.max(progress.unlocked, Math.min(levelIndex + 2, LEVELS.length - 1));
    saveProgress();

    if (levelIndex === 4) {
      // после 4-й карты — финальный экран
      state = 'ending';
      UI.showScreen('ending');
    } else if (levelIndex === 0) {
      UI.showComplete('Вступление пройдено!<br>Дальше — первая карта Буримовки.', true);
    } else {
      const total = bottles.length;
      UI.showComplete(`Чекушки собрано: <b style="color:#ffd23f">${bottlesGot}</b> / ${total}`, true);
    }
    state = 'transition';
  }

  // ---------- события ----------
  function onPlayerHurt() {
    if (player.hp <= 0) gameOver();
  }
  function playerFell() {
    player.hp--;
    shake = 0.35;
    if (player.hp <= 0) { Audio8.sfx.hurt(); gameOver(); }
    else { Audio8.sfx.hurt(); player.respawn(); }
  }
  function gameOver() {
    state = 'gameover';
    Audio8.stopMusic();
    Audio8.sfx.lose();
    UI.showScreen('gameover');
  }
  function onBossDead() {
    // взрыв звёзд
    for (let i = 0; i < 26; i++) particles.push(mkParticle(bossRef.x + bossRef.w / 2, bossRef.y + bossRef.h / 2, 'star'));
    if (factory) factory.unlock();
    frozen = true;
    UI.dialogue(DIALOGUES.outroAfterBoss).then(() => {
      frozen = false;
    });
  }

  // ---------- частицы ----------
  function mkParticle(x, y, kind) {
    const colors = { dust: '#c9c2b8', star: Math.random() < 0.5 ? '#ffd23f' : '#ff4757', sparkle: '#9fd8b4' };
    return {
      x, y,
      vx: (Math.random() - 0.5) * 260,
      vy: kind === 'dust' ? -Math.random() * 120 : (Math.random() - 0.7) * 300,
      g: kind === 'dust' ? 120 : 300,
      life: 0.5 + Math.random() * 0.4, maxLife: 0.9,
      size: kind === 'star' ? 6 : 4,
      color: colors[kind] || '#fff',
    };
  }
  function spawnDust(x, y, n) { for (let i = 0; i < n; i++) particles.push(mkParticle(x, y, 'dust')); }
  function spawnStars(x, y) { for (let i = 0; i < 10; i++) particles.push(mkParticle(x, y, 'star')); }

  // ---------- обновление ----------
  function update(dt) {
    tGlobal += dt;
    if (shake > 0) shake -= dt;

    if (state !== 'playing' || frozen) { input.jumpPressed = false; return; }

    player.update(dt, input, level, api);

    enemies.forEach((e) => e.update(dt, level, api));
    tomahawks.forEach((t) => t.update(dt, level, api));
    tomahawks = tomahawks.filter((t) => !t.dead);

    // столкновения игрок-враги
    enemies.forEach((e) => {
      if (e.dead) return;
      if (!overlaps(player, e)) return;
      const stomping = player.vy > 90 && (player.y + player.h) - e.y < 20;
      if (stomping) {
        if (e instanceof Boss) {
          if (e.invuln > 0) { player.vy = -480; }
          else { e.stomp(api); player.vy = -540; }
        } else {
          e.stomp(api);
          player.vy = -490;
        }
      } else {
        player.hurt(Math.sign(player.x - e.x) || 1, api);
      }
    });
    enemies = enemies.filter((e) => !e.dead);

    // предметы
    bottles.forEach((b) => {
      b.update(dt);
      if (!b.taken && overlaps(player, b.rect())) {
        b.taken = true;
        bottlesGot++;
        Audio8.sfx.coin();
        for (let i = 0; i < 4; i++) particles.push(mkParticle(b.c * TILE + 20, b.r * TILE + 20, 'sparkle'));
      }
    });
    bottles = bottles.filter((b) => !b.taken);
    hearts.forEach((h) => {
      h.update(dt);
      if (!h.taken && overlaps(player, h.rect())) {
        h.taken = true;
        if (player.hp < CONFIG.PLAYER_HP) { player.hp++; Audio8.sfx.heart(); }
        else { bottlesGot++; Audio8.sfx.coin(); }
      }
    });
    hearts = hearts.filter((h) => !h.taken);

    // завод — выход (триггер = всё здание)
    factory.update(dt, player);
    if (!factory.locked && overlaps(player, factory.doorRect())) { finishLevel(); return; }

    // частицы
    particles.forEach((p) => { p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; });
    particles = particles.filter((p) => p.life > 0);

    // камера
    const target = Math.max(0, Math.min(player.x + player.w / 2 - VIEW_W * 0.44, level.w * TILE - VIEW_W));
    cam += (target - cam) * Math.min(1, dt * 9);

    // HUD
    if (hudCache.hp !== player.hp || hudCache.bottles !== bottlesGot) {
      hudCache = { hp: player.hp, bottles: bottlesGot };
      UI.setHud({ hp: player.hp, bottles: bottlesGot });
    }

    input.jumpPressed = false;
  }

  // ---------- рендер ----------
  const BG_COLORS = {
    bg_fields: ['#87ceeb', '#5aa84f'],
    bg_city: ['#9fb4c7', '#6b7a8c'],
    bg_district: ['#e8875a', '#4a3a52'],
    bg_plant: ['#1c2a4a', '#0d1424'],
  };

  function drawBackground(bgKey) {
    const spr = Sprites.get(bgKey);
    if (spr && spr.img) {
      const img = spr.img;
      const scale = VIEW_H / img.height;
      const w = img.width * scale;
      let off = -((cam * 0.28) % w);
      for (let x = off; x < VIEW_W; x += w) ctx.drawImage(img, x, 0, w, VIEW_H);
    } else {
      const [top, bottom] = BG_COLORS[bgKey] || BG_COLORS.bg_fields;
      const grad = ctx.createLinearGradient(0, 0, 0, VIEW_H);
      grad.addColorStop(0, top); grad.addColorStop(1, bottom);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
  }

  function drawTiles() {
    const c0 = Math.max(0, Math.floor(cam / TILE) - 1);
    const c1 = Math.min(level.w - 1, Math.ceil((cam + VIEW_W) / TILE) + 1);
    for (let r = 0; r < ROWS; r++) {
      for (let c = c0; c <= c1; c++) {
        const t = level.grid[r][c];
        if (t === '.') continue;
        const x = c * TILE - cam, y = r * TILE;
        if (t === '#') {
          const grass = !TILE_SOLID.has(level.grid[r - 1]?.[c] || '.');
          ctx.fillStyle = '#7a4a2b';
          ctx.fillRect(x, y, TILE, TILE);
          ctx.fillStyle = '#63391f';
          ctx.fillRect(x + 4, y + 14, 8, 6);
          ctx.fillRect(x + 24, y + 26, 10, 6);
          if (grass) {
            ctx.fillStyle = '#3fa34d';
            ctx.fillRect(x, y, TILE, 12);
            ctx.fillStyle = '#54c15f';
            ctx.fillRect(x, y, TILE, 5);
          }
        } else if (t === 'B') {
          ctx.fillStyle = '#9e5a3c';
          ctx.fillRect(x, y, TILE, TILE);
          ctx.fillStyle = '#7a4029';
          ctx.fillRect(x, y + 19, TILE, 2);
          ctx.fillRect(x, y, 2, TILE);
          ctx.fillRect(x + 19, y + 19, 2, 21);
          ctx.fillRect(x + 39, y, 1, TILE);
        } else if (t === '=') {
          ctx.fillStyle = '#8b5a2b';
          ctx.fillRect(x, y, TILE, 16);
          ctx.fillStyle = '#a9714b';
          ctx.fillRect(x, y, TILE, 6);
          ctx.fillStyle = '#5d3a1a';
          ctx.fillRect(x, y + 14, TILE, 2);
        } else if (t === '^') {
          ctx.fillStyle = '#8d99ae';
          for (let i = 0; i < 2; i++) {
            ctx.beginPath();
            ctx.moveTo(x + i * 20, y + 40);
            ctx.lineTo(x + i * 20 + 10, y + 8);
            ctx.lineTo(x + i * 20 + 20, y + 40);
            ctx.closePath();
            ctx.fill();
          }
        }
      }
    }
  }

  function drawHints() {
    ctx.font = 'bold 15px Arial';
    ctx.textAlign = 'center';
    level.hints.forEach((h) => {
      const x = h.c * TILE - cam + 60, y = 9.2 * TILE;
      ctx.fillStyle = 'rgba(0,0,0,.55)';
      const wTxt = ctx.measureText(h.text).width;
      ctx.fillRect(x - wTxt / 2 - 8, y - 16, wTxt + 16, 24);
      ctx.fillStyle = '#ffe9a8';
      ctx.fillText(h.text, x, y);
    });
    ctx.textAlign = 'left';
  }

  function render() {
    ctx.clearRect(0, 0, VIEW_W, VIEW_H);
    if (!level) return;

    const def = LEVELS[levelIndex];
    drawBackground(def.bg || 'bg_fields');

    ctx.save();
    let sx = 0, sy = 0;
    if (shake > 0) { sx = (Math.random() - 0.5) * 12 * shake; sy = (Math.random() - 0.5) * 12 * shake; }
    ctx.translate(sx, sy);

    drawTiles();
    if (def.type === 'map') drawHints();

    bottles.forEach((b) => b.draw(ctx, cam));
    hearts.forEach((h) => h.draw(ctx, cam));
    factory.draw(ctx, cam);
    enemies.forEach((e) => e.draw(ctx, cam, tGlobal));
    tomahawks.forEach((t) => t.draw(ctx, cam));
    if (player) player.draw(ctx, cam);

    // частицы
    particles.forEach((p) => {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - cam - p.size / 2, p.y - p.size / 2, p.size, p.size);
      ctx.globalAlpha = 1;
    });

    ctx.restore();
  }

  // ---------- цикл ----------
  function loop(t) {
    const dt = Math.min(0.033, (t - lastT) / 1000 || 0.016);
    lastT = t;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  // ---------- пауза ----------
  function togglePause() {
    if (state === 'playing') {
      state = 'paused';
      Audio8.stopMusic();
      UI.showScreen('pause');
    } else if (state === 'paused') {
      state = 'playing';
      UI.showScreen(null);
      Audio8.startMusic();
    }
  }

  function toMenu() {
    state = 'menu';
    Audio8.stopMusic();
    level = null;
    UI.showScreen('menu');
  }

  // ---------- колбэки для UI ----------
  const callbacks = {
    onPlay() {
      // автофуллскрин по жесту пользователя (если окружение разрешает)
      enterFullscreen();
      const firstUndone = LEVELS.findIndex((_, i) => i < LEVELS.length - 1 && !progress.done[i]);
      startLevel(firstUndone === -1 ? 0 : firstUndone);
    },
    onLevelPick(i) { startLevel(i); },
    getProgress() { return progress; },
    onPause() { togglePause(); },
    onResume() { togglePause(); },
    onRestart() { startLevel(levelIndex); },
    onRetry() { startLevel(levelIndex); },
    onMenu() { toMenu(); },
    onNext() { startLevel(levelIndex + 1); },
  };

  // ---------- ввод ----------
  function bindInput() {
    document.addEventListener('keydown', (e) => {
      const codes = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'KeyA', 'KeyD', 'KeyW', 'KeyS', 'KeyP', 'Escape'];
      if (codes.includes(e.code)) e.preventDefault();
      if (state === 'playing' && !frozen) {
        if (e.code === 'ArrowLeft' || e.code === 'KeyA') input.left = true;
        if (e.code === 'ArrowRight' || e.code === 'KeyD') input.right = true;
        if (e.code === 'ArrowDown' || e.code === 'KeyS') input.down = true;
        if ((e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') && !e.repeat) {
          input.jumpHeld = true; input.jumpPressed = true;
        }
      }
      if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
      if (e.code === 'KeyF' && !e.repeat) enterFullscreen();
    });

    // тап/клик по экрану игры — ТОЛЬКО открыть полный экран (без выключения)
    canvas.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      enterFullscreen();
    });
    document.addEventListener('keyup', (e) => {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') input.left = false;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') input.right = false;
      if (e.code === 'ArrowDown' || e.code === 'KeyS') input.down = false;
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') input.jumpHeld = false;
    });

    // тач-кнопки
    const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    if (isTouch) document.getElementById('touch').classList.remove('hidden');
    const bindHold = (id, on, off) => {
      const el = document.getElementById(id);
      const start = (e) => { e.preventDefault(); Audio8.resume(); on(); };
      const end = (e) => { e.preventDefault(); off(); };
      el.addEventListener('pointerdown', start);
      el.addEventListener('pointerup', end);
      el.addEventListener('pointercancel', end);
      el.addEventListener('pointerleave', end);
    };
    bindHold('touch-left', () => input.left = true, () => input.left = false);
    bindHold('touch-right', () => input.right = true, () => input.right = false);
    bindHold('touch-jump', () => { input.jumpHeld = true; input.jumpPressed = true; }, () => input.jumpHeld = false);

    // пауза при уходе со вкладки
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && state === 'playing') togglePause();
    });

    // подсказка поворота
    const checkOrient = () => {
      const portrait = window.innerHeight > window.innerWidth;
      document.getElementById('rotate-hint').classList.toggle('hidden', !(isTouch && portrait));
    };
    window.addEventListener('resize', checkOrient);
    checkOrient();
  }

  // ---------- service worker ----------
  function registerSW() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  // ---------- запуск ----------
  async function boot() {
    Audio8.setEnabled(progress.sound !== false);
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    window.addEventListener('orientationchange', () => setTimeout(resizeCanvas, 120));
    await Sprites.load();
    // иконка чекушки в HUD (скроем, если файла нет)
    const bi = document.getElementById('hud-bottle-icon');
    bi.src = 'image/checkushka.png';
    bi.onerror = () => { bi.style.visibility = 'hidden'; };
    bi.onload = () => { bi.style.visibility = ''; };
    UI.init(callbacks);
    bindInput();
    registerSW();
    UI.showScreen('gate'); // сначала 18+
    state = 'menu';
    // отладочный хук (можно дёргать из консоли)
    window.GameDebug = {
      startLevel, finishLevel,
      get player() { return player; },
      get enemies() { return enemies; },
      get factory() { return factory; },
    };
    requestAnimationFrame((t) => { lastT = t; requestAnimationFrame(loop); });
  }

  window.addEventListener('load', boot);

  // наружу (для отладки)
  return { get state() { return state; } };
})();
