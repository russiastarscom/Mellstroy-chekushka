// ============================================================
// ЯДРО ИГРЫ
// ============================================================
const Game = (() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  let VIEW_W = 960;
  const VIEW_H = 540;
  let ZOOM = 1.4;               // приближение камеры к персонажу
  let camY = 0;                 // вертикальная камера (мир 540 по высоте)

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
    // в портрете зум поменьше — нужно видеть дальше вперёд
    ZOOM = VIEW_W >= VIEW_H ? 1.4 : 1.2;
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
  let plushes = [], hatShots = [];
  let customEnts = [];          // кастомные объекты из админ-панели (скриптуемые)
  let factory = null;
  let cam = 0, shake = 0;
  let bottlesGot = 0, kills = 0;
  let tGlobal = 0, lastT = 0;
  let bossRef = null;
  let hudCache = { hp: -1, bottles: -1, hats: -1 };

  const input = { left: false, right: false, down: false, jumpHeld: false, jumpPressed: false, shootPressed: false };

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

  // API для скриптов кастомных объектов (админ-панель)
  const scriptApi = Object.create(api);
  Object.assign(scriptApi, {
    // гравитация + коллизии с тайлами (вызывай каждый кадр для «физических» объектов)
    gravity(o, d) { o.vy = Math.min((o.vy || 0) + CONFIG.GRAVITY * d, 1100); moveEntity(o, level, d, false); },
    // упёрся ли в стену на прошлом кадре
    solid(o) { return !!o.hitWall; },
    // живые враги на карте: у обычных нет hp — убиваются e.stomp(api), у босса есть hp — бьётся e.hitByHat(api)
    enemies() { return enemies.filter(e => !e.dead); },
    // чекушки на карте: b.taken — подобрана, b.rect() — прямоугольник {x,y,w,h}
    bottles() { return bottles; },
    // твёрдый ли тайл в пиксельной точке
    solidAt(px, py) { return isSolid(level, Math.floor(px / TILE), Math.floor(py / TILE)); },
    playerNear(o, r = 60) { return player ? Math.abs(player.x - o.x) < r && Math.abs(player.y - o.y) < r : false; },
    hurtPlayer(dir = 1) { if (player) player.hurt(dir, api); },
    healPlayer(n = 1) { if (player && player.hp < CONFIG.PLAYER_HP) { player.hp += n; Audio8.sfx.heart(); } },
    ammo(n = 1) { if (player) player.ammo = Math.min(9, player.ammo + n); },
    score(n = 1) { bottlesGot += n; },
    sfx(name = 'coin') { const f = Audio8.sfx[name]; if (f) f(); },
    particles(x, y, kind = 'dust', n = 5) { for (let i = 0; i < n; i++) particles.push(mkParticle(x, y, kind)); },
    shake(v = 0.2) { shake = Math.max(shake, v); },
  });
  // ВАЖНО: px/py/time — живые геттеры. Object.assign вызвал бы их ОДИН раз при
  // загрузке (player ещё null → навсегда 0), поэтому только defineProperties.
  Object.defineProperties(scriptApi, {
    px: { get() { return player ? player.x : 0; } },
    py: { get() { return player ? player.y : 0; } },
    time: { get() { return tGlobal; } },
  });

  // ---------- прогресс ----------
  const SAVE_KEY = 'melstroy_chekushka_v1';
  let progress = { unlocked: 1, done: {}, sound: true, musicVol: 1, sfxVol: 1 };
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

    // прогресс: запоминаем, на каком уровне игрок находится
    progress.cur = i;
    saveProgress();

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
    plushes = []; hatShots = [];
    customEnts = [];
    bossRef = null;
    level.spawns.enemies.forEach(({ type, c, r, hp }) => {
      if (type === 'e') enemies.push(new Walker(c, r));
      else if (type === 't') enemies.push(new Thrower(c, r));
      else if (type === 'f') enemies.push(new Flyer(c, r === undefined ? 6 : r));
      else if (type === 'j') enemies.push(new Jumper(c, r));
      else if (type === 'a') enemies.push(new Armored(c, r));
      else if (type === 'boss') { const b = new Boss(c, { hp, big: hp >= 10 }); enemies.push(b); bossRef = b; }
    });
    level.spawns.bottles.forEach(({ c, r }) => bottles.push(new Bottle(c, r)));
    level.spawns.hearts.forEach(({ c, r }) => hearts.push(new HeartPickup(c, r)));
    (level.spawns.plushes || []).forEach(({ c, r }) => plushes.push(new PlushPickup(c, r)));
    (level.spawns.custom || []).forEach(({ type, c, r }) => { if (CustomObjects.def(type)) customEnts.push(new CustomEnt(type, c, r)); });
    factory = new FactoryExit(level.factoryC, !!def.factoryLocked);
    player = new Player(level.spawnC);
    player.hp = CONFIG.PLAYER_HP;
    player.ammo = 0; player.shootCd = 0;   // боезапас плюшек
    bottlesGot = 0;
    kills = 0;
    cam = 0; shake = 0;
    camY = VIEW_H - VIEW_H / ZOOM; // сразу «прижата к полу»
    hudCache = { hp: -1, bottles: -1, hats: -1 };
    // сброс ввода — чтобы залипшая клавиша/кнопка не тянула Андрея после рестарта
    input.left = false; input.right = false; input.down = false;
    input.jumpHeld = false; input.jumpPressed = false; input.shootPressed = false;

    state = 'playing';
    frozen = true; // пока идёт вступительный диалог
    UI.showScreen(null);
    UI.setHud({ levelName: def.name, hp: player.hp, bottles: 0, hats: 0 });
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

    // финальный экран — после последнего играбельного уровня (дальше только «В разработке» или конец)
    const nextDef = LEVELS[levelIndex + 1];
    if (!nextDef || nextDef.type === 'indev') {
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
    const outro = (LEVELS[levelIndex] && LEVELS[levelIndex].bossOutro) || DIALOGUES.outroAfterBoss;
    UI.dialogue(outro).then(() => {
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

    // ---------- сыпучие платформы: триггер под ногами + обрушение ----------
    if (player.onGround) {
      const fr = Math.floor((player.y + player.h + 2) / TILE);
      const c0 = Math.floor(player.x / TILE), c1 = Math.floor((player.x + player.w - 1) / TILE);
      for (let c = c0; c <= c1; c++) {
        if (tileAt(level, c, fr) === 'C' && !level.crumble.has(c + ',' + fr)) {
          level.crumble.set(c + ',' + fr, { t: 0, broken: false });
          Audio8.sfx.crumble();
        }
      }
    }
    level.crumble.forEach((st, k) => {
      st.t += dt;
      if (!st.broken && st.t > 0.45) {
        st.broken = true; st.t = 0;
        Audio8.sfx.crumble();
        const [cc, rr] = k.split(',').map(Number);
        spawnDust(cc * TILE + 20, rr * TILE + 20, 6);
      } else if (st.broken && st.t > 2.6) {
        level.crumble.delete(k);
      }
    });

    // ---------- плюшки: бросок ----------
    if (player.shootCd > 0) player.shootCd -= dt;
    if (input.shootPressed) {
      input.shootPressed = false;
      if (player.ammo > 0 && player.shootCd <= 0) {
        player.ammo--;
        player.shootCd = 0.45;
        const dir = player.dir || 1;
        const hx = dir > 0 ? player.x + player.w - 4 : player.x - 26;
        hatShots.push(new HatShot(hx, player.y + 2, dir));
        Audio8.sfx.throw();
      } else if (player.ammo <= 0) {
        Audio8.sfx.locked(); // пусто — щёлкаем
      }
    }

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

    // плюшки — подбор боеприпаса
    plushes.forEach((p) => {
      p.update(dt);
      if (!p.taken && overlaps(player, p.rect())) {
        p.taken = true;
        player.ammo = Math.min(9, player.ammo + 3);
        Audio8.sfx.heart();
        for (let i = 0; i < 6; i++) particles.push(mkParticle(p.c * TILE + 20, p.r * TILE + 20, 'sparkle'));
      }
    });
    plushes = plushes.filter((p) => !p.taken);

    // кастомные объекты (админ-панель): скрипт + взаимодействия с игроком
    customEnts.forEach((o) => o.update(dt, level, scriptApi));
    customEnts.forEach((o) => {
      if (o.dead || o.taken) return;
      if (!overlaps(player, o)) return;
      const stomping = player.vy > 90 && (player.y + player.h) - o.y < 24;
      if (o.collect > 0) {
        o.taken = true;
        bottlesGot += o.collect;
        Audio8.sfx.coin();
        scriptApi.particles(o.x + o.w / 2, o.y + o.h / 2, 'sparkle', 5);
      } else if (stomping && o.stompable) {
        o.hurt(api);
        player.vy = -490;
      } else if (o.dangerous) {
        player.hurt(Math.sign(player.x - o.x) || 1, api);
      }
    });
    customEnts = customEnts.filter((o) => !o.dead && !o.taken);

    // летящие плюшки — столкновения
    hatShots.forEach((s) => s.update(dt, level, api));
    hatShots.forEach((s) => {
      if (s.dead) return;
      for (const e of enemies) {
        if (e.dead) continue;
        if (overlaps(s, e)) {
          s.dead = true;
          if (e instanceof Boss) e.hitByHat(api);
          else if (e.armor) e.die(api);
          else e.stomp(api);
          break;
        }
      }
      // плюшки бьют и скриптуемых объектов (вожди-кастомы и прочие stompable)
      if (!s.dead) {
        for (const o of customEnts) {
          if (o.dead || o.taken || !o.stompable) continue;
          if (overlaps(s, o)) { s.dead = true; o.hurt(api); break; }
        }
      }
    });
    hatShots = hatShots.filter((s) => !s.dead);

    // завод — выход (триггер = всё здание)
    factory.update(dt, player);
    if (!factory.locked && overlaps(player, factory.doorRect())) { finishLevel(); return; }

    // частицы
    particles.forEach((p) => { p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; });
    particles = particles.filter((p) => p.life > 0);

    // камера: горизонт + мягкое вертикальное слежение, всё в «приближенных» координатах
    const viewW = VIEW_W / ZOOM, viewH = VIEW_H / ZOOM;
    const target = Math.max(0, Math.min(player.x + player.w / 2 - viewW * 0.44, level.w * TILE - viewW));
    cam += (target - cam) * Math.min(1, dt * 9);
    const ty = Math.max(0, Math.min(player.y + player.h / 2 - viewH * 0.55, VIEW_H - viewH));
    camY += (ty - camY) * Math.min(1, dt * 7);

    // HUD
    if (hudCache.hp !== player.hp || hudCache.bottles !== bottlesGot || hudCache.hats !== player.ammo) {
      hudCache = { hp: player.hp, bottles: bottlesGot, hats: player.ammo };
      UI.setHud({ hp: player.hp, bottles: bottlesGot, hats: player.ammo });
    }

    input.jumpPressed = false;
  }

  // ---------- рендер ----------
  const BG_COLORS = {
    bg_fields: ['#87ceeb', '#5aa84f'],
    bg_city: ['#9fb4c7', '#6b7a8c'],
    bg_district: ['#e8875a', '#4a3a52'],
    bg_plant: ['#1c2a4a', '#0d1424'],
    bg_snow: ['#a8d4f0', '#e8f2fa'],
    bg_desert: ['#ffd9a0', '#e8a75a'],
    bg_sky: ['#8ec9f0', '#cfe8ff'],
    bg_volcano: ['#e8703a', '#3a1f2b'],
    bg_final: ['#2a1f3a', '#0d1424'],
  };

  // Темы тайлов: цвета земли/платформ/шипов/жидкости по фону уровня
  const THEMES = {
    bg_fields:   { ground: '#7a4a2b', dark: '#63391f', top: '#3fa34d', top2: '#54c15f', brick: '#9e5a3c', brickD: '#7a4029', plat: '#8b5a2b', platT: '#a9714b', platD: '#5d3a1a', spike: '#8d99ae', crumb: '#b8a888', haz: '#3e7cb8', haz2: '#6db3e8' },
    bg_city:     { ground: '#6e6a63', dark: '#585450', top: '#7da35a', top2: '#93bd6d', brick: '#8a8378', brickD: '#6b655c', plat: '#7a746b', platT: '#948d82', platD: '#575248', spike: '#8d99ae', crumb: '#b8a888', haz: '#3e7cb8', haz2: '#6db3e8' },
    bg_district: { ground: '#7a4a2b', dark: '#63391f', top: '#8f9a4a', top2: '#adb566', brick: '#9e5a3c', brickD: '#7a4029', plat: '#8b5a2b', platT: '#a9714b', platD: '#5d3a1a', spike: '#8d99ae', crumb: '#b8a888', haz: '#3e7cb8', haz2: '#6db3e8' },
    bg_plant:    { ground: '#4a3f45', dark: '#3a3136', top: '#5a6e50', top2: '#6e8560', brick: '#5f4a52', brickD: '#47363d', plat: '#544750', platT: '#6d5e68', platD: '#38303b', spike: '#8d99ae', crumb: '#8a7f92', haz: '#63d471', haz2: '#a8f0a8' },
    bg_snow:     { ground: '#7186a8', dark: '#5a6d8c', top: '#f0f6fb', top2: '#ffffff', brick: '#93a8c9', brickD: '#7488a8', plat: '#8296b5', platT: '#a5b8d4', platD: '#5f7290', spike: '#bfe3ff', crumb: '#d5e5f5', haz: '#2f6fb0', haz2: '#6db3e8' },
    bg_desert:   { ground: '#c98f4e', dark: '#a8733c', top: '#e8b86a', top2: '#f5d089', brick: '#b57f45', brickD: '#946330', plat: '#b0813f', platT: '#d0a05c', platD: '#8a5f2c', spike: '#6f8a4f', crumb: '#e0c088', haz: '#e8622a', haz2: '#ffa25c' },
    bg_sky:      { ground: '#9aa7c7', dark: '#7e8aad', top: '#ffffff', top2: '#f0f6ff', brick: '#b0bcdc', brickD: '#8e9abc', plat: '#a2b0d2', platT: '#c4d0ec', platD: '#7e8aad', spike: '#8d99ae', crumb: '#e8eefc', haz: '#63d471', haz2: '#a8f0a8' },
    bg_volcano:  { ground: '#5a3a3a', dark: '#462c2c', top: '#8a4a3a', top2: '#a85c48', brick: '#6a4440', brickD: '#523432', plat: '#634041', platT: '#7e5454', platD: '#4a2f30', spike: '#9aa4b2', crumb: '#a08484', haz: '#ff7a2a', haz2: '#ffc25c' },
    bg_final:    { ground: '#41415f', dark: '#333349', top: '#5c5c85', top2: '#7070a0', brick: '#4f4f74', brickD: '#3c3c58', plat: '#4a4a6e', platT: '#60608e', platD: '#35354e', spike: '#8d99ae', crumb: '#8c8cb0', haz: '#63d471', haz2: '#a8f0a8' },
  };
  function theme(bgKey) { return THEMES[bgKey] || THEMES.bg_fields; }

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
    const viewW = VIEW_W / ZOOM;
    const c0 = Math.max(0, Math.floor(cam / TILE) - 1);
    const c1 = Math.min(level.w - 1, Math.ceil((cam + viewW) / TILE) + 1);
    const T = theme(LEVELS[levelIndex].bg);
    for (let r = 0; r < ROWS; r++) {
      for (let c = c0; c <= c1; c++) {
        const t = level.grid[r][c];
        if (t === '.') continue;
        let x = c * TILE - cam, y = r * TILE;
        if (t === '#') {
          const grass = !TILE_SOLID.has(tileAt(level, c, r - 1));
          ctx.fillStyle = T.ground;
          ctx.fillRect(x, y, TILE, TILE);
          ctx.fillStyle = T.dark;
          ctx.fillRect(x + 4, y + 14, 8, 6);
          ctx.fillRect(x + 24, y + 26, 10, 6);
          if (grass) {
            ctx.fillStyle = T.top;
            ctx.fillRect(x, y, TILE, 12);
            ctx.fillStyle = T.top2;
            ctx.fillRect(x, y, TILE, 5);
          }
        } else if (t === 'B') {
          ctx.fillStyle = T.brick;
          ctx.fillRect(x, y, TILE, TILE);
          ctx.fillStyle = T.brickD;
          ctx.fillRect(x, y + 19, TILE, 2);
          ctx.fillRect(x, y, 2, TILE);
          ctx.fillRect(x + 19, y + 19, 2, 21);
          ctx.fillRect(x + 39, y, 1, TILE);
        } else if (t === '=') {
          ctx.fillStyle = T.plat;
          ctx.fillRect(x, y, TILE, 16);
          ctx.fillStyle = T.platT;
          ctx.fillRect(x, y, TILE, 6);
          ctx.fillStyle = T.platD;
          ctx.fillRect(x, y + 14, TILE, 2);
        } else if (t === 'C') {
          // сыпучая платформа: трясётся после триггера, исчезает после обрушения
          const st = level.crumble && level.crumble.get(c + ',' + r);
          if (st && st.broken) continue;
          if (st) x += Math.sin(tGlobal * 42) * 2.2;
          ctx.fillStyle = T.crumb;
          ctx.fillRect(x, y, TILE, 16);
          ctx.fillStyle = '#00000022';
          ctx.fillRect(x + 8, y + 3, 2, 10);
          ctx.fillRect(x + 22, y + 5, 2, 9);
          ctx.fillRect(x + 33, y + 2, 2, 11);
          ctx.fillStyle = '#00000045';
          ctx.fillRect(x, y + 14, TILE, 2);
        } else if (t === '^') {
          ctx.fillStyle = T.spike;
          for (let i = 0; i < 2; i++) {
            ctx.beginPath();
            ctx.moveTo(x + i * 20, y + 40);
            ctx.lineTo(x + i * 20 + 10, y + 8);
            ctx.lineTo(x + i * 20 + 20, y + 40);
            ctx.closePath();
            ctx.fill();
          }
        } else if (t === 'L') {
          // жидкость: полынья / лава / кислота — волнует поверхность и пузырится
          const wave = Math.sin(tGlobal * 3 + c * 1.7) * 3;
          ctx.fillStyle = T.haz;
          ctx.fillRect(x, y + 10 + wave, TILE, TILE - 10 - wave + 4);
          ctx.fillStyle = T.haz2;
          ctx.fillRect(x, y + 10 + wave, TILE, 4);
          const bb = (tGlobal * 1.3 + c * 0.7) % 1;
          ctx.fillStyle = T.haz2;
          ctx.globalAlpha = 0.7 * (1 - bb);
          ctx.fillRect(x + 8 + (c % 3) * 8, y + 34 - bb * 18, 4, 4);
          ctx.globalAlpha = 1;
        } else if (t === 'v') {
          // батут: стойка + пружина + площадка
          ctx.fillStyle = '#3a3a46';
          ctx.fillRect(x + 8, y + 28, 4, 12);
          ctx.fillRect(x + 28, y + 28, 4, 12);
          ctx.fillStyle = '#9e9e9e';
          for (let i = 0; i < 3; i++) ctx.fillRect(x + 12, y + 22 + i * 3, 16, 2);
          const pulse = 0.5 + Math.sin(tGlobal * 5 + c) * 0.5;
          ctx.fillStyle = `rgb(${200 + pulse * 40}, ${60 + pulse * 30}, 60)`;
          ctx.fillRect(x + 6, y + 14, 28, 7);
          ctx.fillStyle = '#ffd23f';
          ctx.fillRect(x + 6, y + 14, 28, 2);
        } else if (t === 'S') {
          // пила: крутится, полутело над землёй
          const cx = x + 20, cy = y + 26, R = 24;
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(tGlobal * 9);
          ctx.fillStyle = '#b8c2cc';
          for (let i = 0; i < 8; i++) {
            ctx.rotate(Math.PI / 4);
            ctx.beginPath();
            ctx.moveTo(R - 6, -5); ctx.lineTo(R + 5, 0); ctx.lineTo(R - 6, 5);
            ctx.closePath(); ctx.fill();
          }
          ctx.fillStyle = '#8d99ae';
          ctx.beginPath(); ctx.arc(0, 0, R - 6, 0, 7); ctx.fill();
          ctx.fillStyle = '#5a6472';
          ctx.beginPath(); ctx.arc(0, 0, 7, 0, 7); ctx.fill();
          ctx.restore();
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
    // приближение: мир рисуется крупнее, камера следит за Андреем
    ctx.scale(ZOOM, ZOOM);
    ctx.translate(0, -camY);

    drawTiles();
    if (def.type === 'map') drawHints();

    bottles.forEach((b) => b.draw(ctx, cam));
    hearts.forEach((h) => h.draw(ctx, cam));
    plushes.forEach((p) => p.draw(ctx, cam));
    factory.draw(ctx, cam);
    enemies.forEach((e) => e.draw(ctx, cam, tGlobal));
    tomahawks.forEach((t) => t.draw(ctx, cam));
    hatShots.forEach((s) => s.draw(ctx, cam));
    customEnts.forEach((o) => o.draw(ctx, cam));
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
    UI.updatePlayButton(); // надпись «ПРОДОЛЖИТЬ: …» по свежему прогрессу
    UI.showScreen('menu');
  }

  // ---------- колбэки для UI ----------
  const callbacks = {
    onPlay() {
      // автофуллскрин по жесту пользователя (если окружение разрешает)
      enterFullscreen();
      // продолжаем с уровня, на котором остановились (иначе — первый непройденный)
      const total = LEVELS.length - 1;
      let start = 0;
      if (progress.cur !== undefined && !progress.done[progress.cur] && progress.cur < total) {
        start = progress.cur;
      } else {
        const firstUndone = LEVELS.findIndex((_, i) => i < total && !progress.done[i]);
        start = firstUndone === -1 ? 0 : firstUndone;
      }
      startLevel(start);
    },
    onLevelPick(i) { startLevel(i); },
    getProgress() { return progress; },
    getSoundPrefs() { return { musicVol: progress.musicVol, sfxVol: progress.sfxVol }; },
    setSoundPrefs(v) { progress.musicVol = v.musicVol; progress.sfxVol = v.sfxVol; saveProgress(); },
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
        if (e.code === 'KeyX' && !e.repeat) input.shootPressed = true; // бросить плюшку
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
    bindHold('touch-shoot', () => { input.shootPressed = true; }, () => {});

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
    Audio8.setVolumes(typeof progress.musicVol === 'number' ? progress.musicVol : 1, typeof progress.sfxVol === 'number' ? progress.sfxVol : 1);
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
    // иконка плюшки в HUD
    const pi = document.getElementById('hud-plush-icon');
    if (pi) {
      pi.src = 'image/plush.png';
      pi.onerror = () => { pi.style.visibility = 'hidden'; };
      pi.onload = () => { pi.style.visibility = ''; };
    }
  // === ADMIN CMS OVERRIDE — НАЧАЛО (временная админ-панель; удалить этот блок + admin.html + api/game-cms при снятии) ===
  function applyLegacyLevels(levels) {
    Object.entries(levels).forEach(([i, def]) => {
      const k = Number(i);
      if (LEVELS[k] && LEVELS[k].type === 'map' && def && def.type === 'map') {
        LEVELS[k] = Object.assign({}, LEVELS[k], def); // диалоги/фон берутся из def или оригинала
      }
    });
  }
  // Применяет пакет из админ-панели: карты (сколько угодно, в любом порядке), разговоры, текстуры, музыку, каналы
  function applyCms(j) {
    // кастомные объекты: текстуры + JS-скрипты (загружаем первыми — нужны картам)
    if (Array.isArray(j.objects) && j.objects.length) {
      CustomObjects.set(j.objects);
      j.objects.forEach((o) => {
        if (!o || !o.id) return;
        if (o.character) {
          CONFIG.NAMES['@' + o.id] = o.name || o.id;
          UI.addSpeaker('@' + o.id, 'obj-' + o.id);
        }
      });
    }
    if (Array.isArray(j.maps) && j.maps.length) {
      const intro = LEVELS[0];
      const defs = j.maps.map((m) => m && m.def).filter((d) => d && (d.type === 'map' || d.type === 'indev'));
      if (defs.length) {
        // старые публикации (без маркера v) всегда заканчивались экраном «В разработке» — сохраняем поведение
        if (!(j.v >= 3) && !defs.some((d) => d.type === 'indev')) {
          const iv = LEVELS.find((x) => x.type === 'indev');
          if (iv) defs.push(JSON.parse(JSON.stringify(iv)));
        }
        LEVELS.splice(0, LEVELS.length, intro, ...defs);
      }
    } else if (j.levels) {
      applyLegacyLevels(j.levels);
    }
    if (j.intro && typeof j.intro === 'object') {
      if (Array.isArray(j.intro.cutscene) && j.intro.cutscene.length && LEVELS[0]) LEVELS[0].cutscene = j.intro.cutscene;
      if (Array.isArray(j.intro.outroAfterBoss) && j.intro.outroAfterBoss.length) DIALOGUES.outroAfterBoss = j.intro.outroAfterBoss;
    }
    if (j.textures && typeof j.textures === 'object') {
      const map = {};
      Object.entries(j.textures).forEach(([k, v]) => { if (v && v.url) map[k] = v.url; });
      Sprites.setCustom(map);
      const bi = document.getElementById('hud-bottle-icon');
      if (bi && map.checkushka) { bi.style.visibility = ''; bi.src = map.checkushka; }
      const pi = document.getElementById('hud-plush-icon');
      if (pi && map.plush) { pi.style.visibility = ''; pi.src = map.plush; }
    }
    if (j.music && Array.isArray(j.music.tracks) && j.music.active) {
      const tr = j.music.tracks.find((t) => t.id === j.music.active);
      if (tr && tr.url) Audio8.setCustomMusic(tr.url);
    }
    if (Array.isArray(j.socials) && j.socials.length) {
      CONFIG.SOCIALS = j.socials.map((s) => ({ name: s.name, class: s.class || 'tg', url: s.url || '#' }));
    }
  }
  async function loadAdminCms() {
    try {
      let cms = null;
      try {
        const r0 = await fetch('/api/game-cms', { cache: 'no-store', signal: AbortSignal.timeout(2500) });
        if (r0.ok) { const j = await r0.json(); if (j && j.ok) cms = j; }
      } catch (e) { /* нет API — норма */ }
      if (!cms) {
        // статичный хостинг: рядом с index.html лежит game-cms.json (экспорт панели)
        try {
          const r1 = await fetch('game-cms.json', { cache: 'no-store', signal: AbortSignal.timeout(2500) });
          if (r1.ok) cms = await r1.json();
        } catch (e) { /* нет файла */ }
      }
      if (cms && (cms.maps || cms.levels || cms.textures || cms.music || cms.socials || cms.intro || cms.objects)) {
        applyCms(cms);
        return;
      }
      try {
        const r2 = await fetch('maps-override.json', { cache: 'no-store', signal: AbortSignal.timeout(2500) });
        if (r2.ok) { const j = await r2.json(); if (j && j.levels) applyLegacyLevels(j.levels); }
      } catch (e) { /* нет файла — норма */ }
    } catch (e) { /* подмена необязательна */ }
  }
  // === ADMIN CMS OVERRIDE — КОНЕЦ ===

  // ---------- запуск ----------
    await loadAdminCms();
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
      get customEnts() { return customEnts; },
      get factory() { return factory; },
      get plushes() { return plushes; },
      get hatShots() { return hatShots; },
      get boss() { return bossRef; },
      get level() { return level; },
    };
    requestAnimationFrame((t) => { lastT = t; requestAnimationFrame(loop); });
  }

  window.addEventListener('load', boot);

  // наружу (для отладки)
  return { get state() { return state; } };
})();
