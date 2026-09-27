// ============================================================
// Физика + сущности
// ============================================================
const TILE_SOLID = new Set(['#', 'B']);

function isSolid(level, c, r) {
  if (c < 0 || c >= level.w) return true;   // стены по краям уровня
  if (r < 0 || r >= ROWS) return false;     // сверху/внизу — открыто
  return TILE_SOLID.has(level.grid[r][c]);
}
function isPlat(level, c, r) {
  if (c < 0 || c >= level.w || r < 0 || r >= ROWS) return false;
  const t = level.grid[r][c];
  if (t === '=') return true;
  // сыпучая платформа: твёрдая, пока не обрушилась
  if (t === 'C') {
    const st = level.crumble && level.crumble.get(c + ',' + r);
    return !(st && st.broken);
  }
  return false;
}
function isSpike(level, c, r) {
  if (c < 0 || c >= level.w || r < 0 || r >= ROWS) return false;
  return level.grid[r][c] === '^';
}
function tileAt(level, c, r) {
  if (c < 0 || c >= level.w || r < 0 || r >= ROWS) return '.';
  return level.grid[r][c];
}
function isLiquid(level, c, r) { return tileAt(level, c, r) === 'L'; }

// Движение с разрешением коллизий по тайлам
function moveEntity(ent, level, dt, ignorePlats = false) {
  // --- X ---
  ent.x += ent.vx * dt;
  ent.hitWall = false;
  {
    const r0 = Math.floor(ent.y / TILE), r1 = Math.floor((ent.y + ent.h - 1) / TILE);
    const c1 = Math.floor((ent.x + ent.w - 1) / TILE), c0 = Math.floor(ent.x / TILE);
    if (ent.vx > 0) {
      for (let r = r0; r <= r1; r++) if (isSolid(level, c1, r)) { ent.x = c1 * TILE - ent.w; ent.vx = 0; ent.hitWall = true; break; }
    } else if (ent.vx < 0) {
      for (let r = r0; r <= r1; r++) if (isSolid(level, c0, r)) { ent.x = (c0 + 1) * TILE; ent.vx = 0; ent.hitWall = true; break; }
    }
  }
  // --- Y ---
  const prevBottom = ent.y + ent.h;
  ent.y += ent.vy * dt;
  ent.onGround = false;
  {
    const c0 = Math.floor(ent.x / TILE), c1 = Math.floor((ent.x + ent.w - 1) / TILE);
    // НОГИ: без «-1» — иначе стоящая сущность каждый чётный кадр на 0.6px
    // проваливается в тайл (onGround мигает 0/1 → дрожит отрисовка, напр. Прыгун)
    const r0 = Math.floor(ent.y / TILE), r1 = Math.floor((ent.y + ent.h) / TILE);
    if (ent.vy > 0) {
      for (let c = c0; c <= c1; c++) {
        if (isSolid(level, c, r1)) { ent.y = r1 * TILE - ent.h; ent.vy = 0; ent.onGround = true; break; }
        if (!ignorePlats && isPlat(level, c, r1) && prevBottom <= r1 * TILE + 8) {
          ent.y = r1 * TILE - ent.h; ent.vy = 0; ent.onGround = true; break;
        }
      }
    } else if (ent.vy < 0) {
      for (let c = c0; c <= c1; c++) {
        if (isSolid(level, c, r0)) { ent.y = (r0 + 1) * TILE; ent.vy = 0; break; }
      }
    }
  }
}

function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// ============================================================
// ИГРОК — Андрей
// ============================================================
class Player {
  constructor(colC) {
    this.w = 30; this.h = 50;
    this.x = colC * TILE + 5;
    this.y = 9 * TILE;
    this.vx = 0; this.vy = 0;
    this.dir = 1;
    this.onGround = false;
    this.hp = CONFIG.PLAYER_HP;
    this.invuln = 0;
    this.jumpBuffer = 0;
    this.coyote = 0;
    this.dropTimer = 0;
    this.lastSafe = { x: this.x, y: this.y };
    this.safeTimer = 0;
    this.walkT = 0;
    this.squash = 0;
    // сальто (переворот в прыжке)
    this.flipT = 0;      // остаток времени оборота
    this.flipDur = 0.5;  // полная длительность одного оборота
    this.flipDir = 1;    // +1 = переднее сальто (по часовой), -1 = бэкфлип
    this.flipTurns = 1;  // число оборотов (батут — двойное)
  }

  // Старт сальто: ТОЛЬКО в движении — передний переворот по направлению бега.
  // Прыжок с места — без кувырка (по фидбеку игрока)
  startFlip(turns = 1, dur = 0.5) {
    if (Math.abs(this.vx) <= 40) return;
    this.flipTurns = turns;
    this.flipDur = dur;
    this.flipT = dur;
    this.flipDir = this.dir || 1;
  }

  update(dt, input, level, game) {
    const SPEED = CONFIG.MOVE_SPEED, ACC = 2200, FRICTION = 2600;
    this.flipT = Math.max(0, this.flipT - dt);

    // горизонталь
    if (input.left) { this.vx -= ACC * dt; this.dir = -1; }
    if (input.right) { this.vx += ACC * dt; this.dir = 1; }
    if (!input.left && !input.right) {
      const s = Math.sign(this.vx);
      this.vx -= s * FRICTION * dt;
      if (Math.sign(this.vx) !== s) this.vx = 0;
    }
    this.vx = Math.max(-SPEED, Math.min(SPEED, this.vx));

    // прыжок: буфер + койот
    this.jumpBuffer = input.jumpPressed ? 0.12 : Math.max(0, this.jumpBuffer - dt);
    this.coyote = this.onGround ? 0.1 : Math.max(0, this.coyote - dt);
    this.dropTimer = Math.max(0, this.dropTimer - dt);

    if (this.jumpBuffer > 0 && input.down && this.onGround) {
      // спрыгнуть с платформы
      this.dropTimer = 0.22;
      this.jumpBuffer = 0;
      this.vy = 60;
    } else if (this.jumpBuffer > 0 && (this.coyote > 0)) {
      this.vy = CONFIG.JUMP_VEL;
      this.jumpBuffer = 0;
      this.coyote = 0;
      this.squash = -0.25;
      this.startFlip();
      Audio8.sfx.jump();
      game.spawnDust(this.x + this.w / 2, this.y + this.h, 4);
    }
    // короткий прыжок при отпускании (батут не режем — у него свой импульс-таймер)
    this.springT = Math.max(0, (this.springT || 0) - dt);
    if (!input.jumpHeld && this.springT <= 0 && this.vy < -260) this.vy = -260;

    this.vy = Math.min(this.vy + CONFIG.GRAVITY * dt, 1100);
    moveEntity(this, level, dt, this.dropTimer > 0);

    // приземление — пыль + сквош
    if (this.onGround && this.prevVy > 380) {
      this.squash = 0.3;
      game.spawnDust(this.x + this.w / 2, this.y + this.h, 3);
    }
    this.prevVy = this.vy;
    this.squash *= Math.pow(0.001, dt);

    // безопасная точка (для респауна после ямы)
    this.safeTimer -= dt;
    if (this.onGround && this.safeTimer <= 0 && this.vy === 0) {
      const fc = Math.floor((this.x + this.w / 2) / TILE);
      const fr = Math.floor((this.y + this.h + 6) / TILE);
      if (isSolid(level, fc, fr)) { this.lastSafe = { x: this.x, y: this.y }; this.safeTimer = 0.4; }
    }

    // шипы
    if (this.invuln <= 0) {
      const c0 = Math.floor((this.x + 6) / TILE), c1 = Math.floor((this.x + this.w - 6) / TILE);
      const r = Math.floor((this.y + this.h - 4) / TILE);
      for (let c = c0; c <= c1; c++) {
        if (isSpike(level, c, r)) { this.hurt(c * TILE + 20 < this.x + this.w / 2 ? 1 : -1, game, true); break; }
      }
    }

    // жидкость (полынья/лава/кислота): касание = урон + респавн, как падение в яму
    if (this.invuln <= 0) {
      const c0 = Math.floor((this.x + 4) / TILE), c1 = Math.floor((this.x + this.w - 4) / TILE);
      const r0 = Math.floor((this.y + 8) / TILE), r1 = Math.floor((this.y + this.h - 1) / TILE);
      outer: for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
        if (isLiquid(level, c, r)) { game.playerFell(); return; }
      }
    }

    // пилы: круглая пила в тайле — задевание с любой стороны
    if (this.invuln <= 0) {
      const c0 = Math.floor((this.x - 10) / TILE), c1 = Math.floor((this.x + this.w + 10) / TILE);
      const r0 = Math.floor((this.y - 10) / TILE), r1 = Math.floor((this.y + this.h + 10) / TILE);
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
        if (tileAt(level, c, r) !== 'S') continue;
        const sx = c * TILE + 20, sy = r * TILE + 26, R = 24;
        const nx = Math.max(this.x, Math.min(sx, this.x + this.w));
        const ny = Math.max(this.y, Math.min(sy, this.y + this.h));
        if ((nx - sx) * (nx - sx) + (ny - sy) * (ny - sy) < R * R) {
          this.hurt(sx < this.x + this.w / 2 ? 1 : -1, game, true); break;
        }
      }
    }

    // батут: приземлился/наступил — подброс (тайл батута в клетке ног или под ногами)
    if (this.onGround && this.vy === 0) {
      const sc0 = Math.floor((this.x + 4) / TILE), sc1 = Math.floor((this.x + this.w - 4) / TILE);
      const srA = Math.floor((this.y + this.h - 2) / TILE), srB = Math.floor((this.y + this.h + 2) / TILE);
      for (let c = sc0; c <= sc1; c++) {
        if (tileAt(level, c, srA) === 'v' || tileAt(level, c, srB) === 'v') {
          this.vy = -1180; this.onGround = false; this.squash = -0.4; this.springT = 0.6;
          this.startFlip(2, 0.8); // двойное сальто с батута
          Audio8.sfx.spring();
          game.spawnDust(this.x + this.w / 2, this.y + this.h, 6);
          break;
        }
      }
    }

    // падение в яму
    if (this.y > ROWS * TILE + 60) game.playerFell();

    if (this.invuln > 0) this.invuln -= dt;
    if (Math.abs(this.vx) > 20 && this.onGround) this.walkT += dt * Math.abs(this.vx) / 26;
  }

  hurt(dir, game, fromSpike = false) {
    if (this.invuln > 0) return;
    this.hp--;
    this.invuln = 1.3;
    this.vy = fromSpike ? -430 : -330;
    this.vx = dir * 260;
    Audio8.sfx.hurt();
    game.onPlayerHurt();
  }

  respawn() {
    this.x = this.lastSafe.x; this.y = this.lastSafe.y;
    this.vx = 0; this.vy = 0;
    this.invuln = 1.3;
    this.flipT = 0;
  }

  draw(ctx, camX) {
    if (this.invuln > 0 && Math.floor(this.invuln * 12) % 2 === 0) return; // мигание
    const bob = (Math.abs(this.vx) > 20 && this.onGround) ? Math.abs(Math.sin(this.walkT * 6)) * 3 : 0;
    const sq = this.squash;
    const w = this.w + 10 - Math.abs(sq) * 12;
    const h = this.h - sq * 10;
    const x = this.x - (w - this.w) / 2 - camX;
    const y = this.y + (this.h - h) - bob;
    // тень
    ctx.fillStyle = 'rgba(0,0,0,.25)';
    ctx.beginPath();
    ctx.ellipse(this.x + this.w / 2 - camX, this.y + this.h + 3, 16, 4, 0, 0, 7);
    ctx.fill();
    // —— САЛЬТО: вращение вокруг центра + поджатие в середине оборота + шлейф-призраки ——
    if (this.flipT > 0) {
      const p = 1 - this.flipT / this.flipDur;            // прогресс оборота 0..1
      const ang = p * Math.PI * 2 * this.flipTurns * this.flipDir;
      const tuck = Math.sin(Math.min(1, Math.max(0, p)) * Math.PI); // 0..1..0
      const drawFlip = (pg, alpha) => {
        const gt = Math.sin(Math.min(1, Math.max(0, pg)) * Math.PI);
        const gw = w * (1 + 0.10 * gt);
        const gh = h * (1 - 0.22 * gt);
        Sprites.draw(ctx, 'andrey',
          x + (w - gw) / 2, y + (h - gh) / 2, gw, gh,
          this.dir < 0,
          pg * Math.PI * 2 * this.flipTurns * this.flipDir,
          alpha);
      };
      drawFlip(p - 0.10, 0.25); // шлейф: ~100мс назад
      drawFlip(p - 0.20, 0.10); // шлейф: ~200мс назад
      drawFlip(p, 1);           // сам Андрей
      return;
    }
    Sprites.draw(ctx, 'andrey', x, y, w, h, this.dir < 0);
  }
}

// ============================================================
// БУРМАЛДЕНЕЦ (пехота)
// ============================================================
class Walker {
  constructor(colC, r = 10) {
    this.w = 34; this.h = 46;
    this.x = colC * TILE + 3;
    this.y = r * TILE - this.h + TILE;
    this.vx = -60; this.vy = 0;
    this.dir = -1;
    this.dead = false;
    this.walkT = Math.random() * 3;
  }
  update(dt, level, game) {
    this.vy = Math.min(this.vy + CONFIG.GRAVITY * dt, 900);
    moveEntity(this, level, dt);
    if (this.hitWall) this.flip();
    // не падать с края и не ходить в шипы
    if (this.onGround) {
      const frontX = this.vx > 0 ? this.x + this.w + 3 : this.x - 3;
      const fc = Math.floor(frontX / TILE);
      const fr = Math.floor((this.y + this.h + 8) / TILE);
      if (!isSolid(level, fc, fr) && !isPlat(level, fc, fr)) this.flip();
      const br = Math.floor((this.y + this.h - 6) / TILE);
      if (isSpike(level, fc, br)) this.flip();
    }
    this.walkT += dt * 5;
  }
  flip() { this.vx = -Math.sign(this.vx || this.dir) * 60; this.dir = Math.sign(this.vx); }
  stomp(game) {
    this.dead = true;
    Audio8.sfx.stomp();
    game.spawnStars(this.x + this.w / 2, this.y + 8);
    game.kills++;
  }
  draw(ctx, camX) {
    ctx.fillStyle = 'rgba(0,0,0,.25)';
    ctx.beginPath();
    ctx.ellipse(this.x + this.w / 2 - camX, this.y + this.h + 3, 14, 4, 0, 0, 7);
    ctx.fill();
    const bob = Math.abs(Math.sin(this.walkT)) * 2.5;
    Sprites.draw(ctx, 'burmaldenets', this.x - camX, this.y - bob, this.w + 10, this.h + 12 - 0, this.vx > 0);
  }
}

// ============================================================
// МЕТАТЕЛЬ ТОМАГАВКОВ
// ============================================================
class Thrower extends Walker {
  constructor(colC, r = 10) {
    super(colC, r);
    this.w = 34; this.h = 46;
    this.vx = -36;
    this.throwT = 1.2 + Math.random();
  }
  flip() { this.vx = -Math.sign(this.vx || this.dir) * 36; this.dir = Math.sign(this.vx); }
  update(dt, level, game) {
    super.update(dt, level, game);
    this.throwT -= dt;
    const p = game.player;
    if (this.throwT <= 0 && Math.abs(p.x - this.x) < 360 && Math.abs(p.y - this.y) < 200) {
      this.throwT = 2.4;
      const dir = p.x > this.x ? 1 : -1;
      game.tomahawks.push(new Tomahawk(this.x + this.w / 2, this.y + 8, dir));
      Audio8.sfx.throw();
    }
  }
}

class Tomahawk {
  constructor(x, y, dir) {
    this.w = 18; this.h = 18;
    this.x = x - 9; this.y = y;
    this.vx = dir * 250; this.vy = -300;
    this.rot = 0; this.dead = false;
    this.harmless = 0.12; // чтобы не бить прямо из руки в упор
  }
  update(dt, level, game) {
    this.vy += 1000 * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.rot += dt * 14;
    this.harmless -= dt;
    const c = Math.floor((this.x + 9) / TILE), r = Math.floor((this.y + 9) / TILE);
    if (isSolid(level, c, r)) { this.dead = true; game.spawnDust(this.x + 9, this.y + 9, 4); }
    if (this.y > ROWS * TILE + 40) this.dead = true;
    if (this.harmless <= 0 && this.overlapPlayer(game.player)) {
      this.dead = true;
      game.player.hurt(Math.sign(game.player.x - this.x) || 1, game);
    }
  }
  overlapPlayer(p) {
    return overlaps(this, p);
  }
  draw(ctx, camX) {
    ctx.save();
    ctx.translate(this.x + 9 - camX, this.y + 9);
    ctx.rotate(this.rot);
    const spr = Sprites.get('tomahawk');
    const src = spr.img || spr.fallback;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(src, -10, -10, 20, 20);
    ctx.restore();
  }
}

// ============================================================
// ЛЕТУН — крылатый бурмалденец (патрулирует по воздуху, синус)
// ============================================================
class Flyer {
  constructor(colC, r = 6) {
    this.w = 44; this.h = 38;
    this.x = colC * TILE + (TILE - this.w) / 2;
    this.y = r * TILE;
    this.baseY = r * TILE;
    this.vx = -95; this.vy = 0;
    this.t = Math.random() * 6;
    this.dead = false;
  }
  update(dt, level, game) {
    this.t += dt;
    this.x += this.vx * dt;
    this.y = this.baseY + Math.sin(this.t * 3.2) * 24;
    // разворот у стен и краёв карты
    const fc = Math.floor((this.vx > 0 ? this.x + this.w + 4 : this.x - 4) / TILE);
    const fr = Math.floor((this.y + this.h / 2) / TILE);
    if (fc <= 0 || fc >= level.w - 1 || isSolid(level, fc, fr) || isLiquid(level, fc, fr)) this.vx = -this.vx;
  }
  stomp(game) {
    this.dead = true;
    Audio8.sfx.stomp();
    game.spawnStars(this.x + this.w / 2, this.y + 8);
    game.kills++;
  }
  draw(ctx, camX) {
    const flap = Math.sin(this.t * 14) * 3;
    Sprites.draw(ctx, 'flyer', this.x - camX, this.y - flap, this.w + 14, this.h + 12, this.vx > 0);
  }
}

// ============================================================
// ПРЫГУН — бурмалденец на пружинах (периодически скачет)
// ============================================================
class Jumper extends Walker {
  constructor(colC, r = 10) {
    super(colC, r);
    this.w = 36; this.h = 52;
    this.vx = -52;
    this.jumpT = 0.9 + Math.random() * 1.2;
  }
  flip() { this.vx = -Math.sign(this.vx || this.dir) * 52; this.dir = Math.sign(this.vx); }
  update(dt, level, game) {
    super.update(dt, level, game);
    if (this.onGround) {
      this.jumpT -= dt;
      if (this.jumpT <= 0) {
        this.jumpT = 1.2 + Math.random() * 1.2;
        this.vy = -640;
        game.spawnDust(this.x + this.w / 2, this.y + this.h, 3);
      }
    }
  }
  draw(ctx, camX) {
    ctx.fillStyle = 'rgba(0,0,0,.25)';
    ctx.beginPath();
    ctx.ellipse(this.x + this.w / 2 - camX, this.y + this.h + 3, 14, 4, 0, 0, 7);
    ctx.fill();
    // сквош пропорционален скорости (без порога по знаку — иначе дёрганье на земле и в апексе)
    const k = this.vy * 0.008;
    const sq = this.onGround ? 0 : (k < 0 ? Math.max(k, -4) : Math.min(k, 3));
    Sprites.draw(ctx, 'jumper', this.x - camX - 3, this.y - sq, this.w + 12, this.h + 14, this.vx > 0);
  }
}

// ============================================================
// ЩИТОНОСЕЦ — бронированный: сверху не убить, только плюшкой
// ============================================================
class Armored extends Walker {
  constructor(colC, r = 10) {
    super(colC, r);
    this.w = 38; this.h = 50;
    this.vx = -26;
    this.armor = true;      // плюшка убивает (die), прыжок сверху — нет
    this.flash = 0;
  }
  flip() { this.vx = -Math.sign(this.vx || this.dir) * 26; this.dir = Math.sign(this.vx); }
  stomp(game) {
    // броня: прыжок сверху ничего не даёт (игрок просто отскакивает)
    if (this.flash <= 0) { this.flash = 0.35; Audio8.sfx.locked(); game.spawnDust(this.x + this.w / 2, this.y, 3); }
  }
  die(game) {
    this.dead = true;
    Audio8.sfx.stomp();
    game.spawnStars(this.x + this.w / 2, this.y + 8);
    game.kills++;
  }
  update(dt, level, game) {
    super.update(dt, level, game);
    if (this.flash > 0) this.flash -= dt;
  }
  draw(ctx, camX) {
    ctx.fillStyle = 'rgba(0,0,0,.25)';
    ctx.beginPath();
    ctx.ellipse(this.x + this.w / 2 - camX, this.y + this.h + 3, 15, 4, 0, 0, 7);
    ctx.fill();
    if (this.flash > 0) ctx.globalAlpha = 0.6;
    const bob = Math.abs(Math.sin(this.walkT)) * 2;
    Sprites.draw(ctx, 'armored', this.x - camX - 5, this.y - bob, this.w + 14, this.h + 14, this.vx > 0);
    ctx.globalAlpha = 1;
  }
}

// ============================================================
// ВОЖДЬ БУРМАЛДЕНОВ (босс) — параметры настраиваются уровнем
// ============================================================
class Boss {
  constructor(colC, opts = {}) {
    this.w = opts.big ? 84 : 66;
    this.h = opts.big ? 104 : 84;
    this.x = colC * TILE + (TILE - this.w) / 2;
    this.y = 8 * TILE + (opts.big ? -14 : 0);
    this.vx = -70; this.vy = 0;
    this.dir = -1;
    this.hp = opts.hp || 6; this.maxHp = this.hp;
    this.big = !!opts.big;
    this.dead = false;
    this.invuln = 0;
    this.chargeT = 5;
    this.state = 'walk';      // walk | telegraph | charge
    this.telegraphT = 0;
    this.walkT = 0;
    this.hurtFlash = 0;
  }
  get speed() { return 70 + (this.maxHp - this.hp) * (this.big ? 11 : 22); }

  update(dt, level, game) {
    if (this.invuln > 0) this.invuln -= dt;
    if (this.hurtFlash > 0) this.hurtFlash -= dt;

    if (this.state === 'telegraph') {
      this.telegraphT -= dt;
      this.vx = 0;
      if (this.telegraphT <= 0) { this.state = 'charge'; this.chargeDir = Math.sign(game.player.x - this.x) || 1; this.vx = this.chargeDir * this.speed * 2.4; }
    } else if (this.state === 'charge') {
      this.vx = this.chargeDir * this.speed * 2.4;
      this.chargeT -= 0;
      if (this.hitWall || (this.chargeDir > 0 && game.player.x < this.x && Math.random() < 0.01)) { this.state = 'walk'; this.chargeT = 4.5 + Math.random() * 2; }
    } else {
      this.chargeT -= dt;
      if (this.chargeT <= 0) { this.state = 'telegraph'; this.telegraphT = 0.7; Audio8.sfx.throw(); }
    }

    this.vy = Math.min(this.vy + CONFIG.GRAVITY * dt, 900);
    moveEntity(this, level, dt);
    if (this.hitWall) {
      if (this.state === 'charge') { this.state = 'walk'; this.chargeT = 4.5 + Math.random() * 2; game.shake = 0.25; }
      this.vx = -Math.sign(this.vx || this.dir) * this.speed;
    }
    // не падать с края (в арене и так стены, но на всякий)
    if (this.onGround && this.state === 'walk') {
      const frontX = this.vx > 0 ? this.x + this.w + 3 : this.x - 3;
      const fc = Math.floor(frontX / TILE), fr = Math.floor((this.y + this.h + 8) / TILE);
      if (!isSolid(level, fc, fr) && !isPlat(level, fc, fr)) this.vx = -Math.sign(this.vx) * this.speed;
    }
    this.walkT += dt * 4;
  }

  stomp(game) {
    if (this.invuln > 0) return;
    this.hp--;
    this.invuln = 1.1;
    this.hurtFlash = 0.4;
    game.shake = 0.3;
    game.spawnStars(this.x + this.w / 2, this.y + 10);
    Audio8.sfx.bossHit();
    if (this.hp <= 0) {
      this.dead = true;
      Audio8.sfx.bossDie();
      game.shake = 0.6;
      game.onBossDead();
    }
  }

  // Плюшкой киднули — урон без инвулна (каждая плюшка считается)
  hitByHat(game) {
    this.hp--;
    this.hurtFlash = 0.4;
    game.shake = 0.3;
    game.spawnStars(this.x + this.w / 2, this.y + 10);
    Audio8.sfx.bossHit();
    if (this.hp <= 0) {
      this.dead = true;
      Audio8.sfx.bossDie();
      game.shake = 0.6;
      game.onBossDead();
    }
  }

  draw(ctx, camX, t) {
    // телеграф рывка — мигает
    let flash = false;
    if (this.state === 'telegraph') flash = Math.floor(t * 10) % 2 === 0;
    if (this.hurtFlash > 0) flash = true;
    ctx.fillStyle = 'rgba(0,0,0,.3)';
    ctx.beginPath();
    ctx.ellipse(this.x + this.w / 2 - camX, this.y + this.h + 4, 26, 6, 0, 0, 7);
    ctx.fill();
    if (flash) {
      ctx.save();
      ctx.globalAlpha = 0.45;
      Sprites.draw(ctx, 'boss', this.x - camX - 4, this.y - 4, this.w + 14, this.h + 12, this.vx > 0);
      ctx.restore();
    }
    const bob = Math.abs(Math.sin(this.walkT)) * 3;
    Sprites.draw(ctx, 'boss', this.x - camX, this.y - bob, this.w + 10, this.h + 8, this.vx > 0);
    // HP босса
    if (!this.dead) {
      const bw = 70, bx = this.x + this.w / 2 - bw / 2 - camX, by = this.y - 18;
      ctx.fillStyle = '#00000090'; ctx.fillRect(bx - 1, by - 1, bw + 2, 8);
      ctx.fillStyle = '#ff4757'; ctx.fillRect(bx, by, bw * (this.hp / this.maxHp), 6);
    }
  }
}

// ============================================================
// ПРЕДМЕТЫ
// ============================================================
class Bottle {
  constructor(c, r) { this.c = c; this.r = r; this.t = Math.random() * 6; this.taken = false; }
  rect() { return { x: this.c * TILE + 8, y: this.r * TILE + 4, w: 24, h: 34 }; }
  update(dt) { this.t += dt; }
  draw(ctx, camX) {
    const bob = Math.sin(this.t * 3.2) * 4;
    Sprites.draw(ctx, 'checkushka', this.c * TILE + 8 - camX, this.r * TILE + 4 + bob, 24, 32);
  }
}

class HeartPickup {
  constructor(c, r) { this.c = c; this.r = r; this.t = Math.random() * 6; this.taken = false; }
  rect() { return { x: this.c * TILE + 7, y: this.r * TILE + 8, w: 26, h: 24 }; }
  update(dt) { this.t += dt; }
  draw(ctx, camX) {
    const bob = Math.sin(this.t * 2.6) * 4;
    Sprites.draw(ctx, 'heart', this.c * TILE + 7 - camX, this.r * TILE + 8 + bob, 26, 24);
  }
}

// Гора плюшек — подбор даёт боеприпас (3 плюшки)
class PlushPickup {
  constructor(c, r) { this.c = c; this.r = r; this.t = Math.random() * 6; this.taken = false; }
  rect() { return { x: this.c * TILE + 2, y: this.r * TILE + 8, w: 36, h: 32 }; }
  update(dt) { this.t += dt; }
  draw(ctx, camX) {
    const bob = Math.sin(this.t * 2.8) * 5;
    const x = this.c * TILE + 2 - camX, y = this.r * TILE + 8 + bob;
    // светящийся ореол, чтобы бросалась в глаза
    const pulse = 0.3 + Math.sin(this.t * 4) * 0.15;
    ctx.fillStyle = `rgba(255,170,200,${pulse})`;
    ctx.beginPath(); ctx.ellipse(x + 18, y + 18, 24, 20, 0, 0, 7); ctx.fill();
    Sprites.draw(ctx, 'plush', x, y, 36, 32);
  }
}

// Летящая плюшка — снаряд игрока. Лёгкая дуга, крутится, бьёт врагов и босса.
class HatShot {
  constructor(x, y, dir) {
    this.w = 30; this.h = 26;
    this.x = x; this.y = y;
    this.vx = dir * 470; this.vy = -140;
    this.rot = 0; this.dead = false;
    this.life = 2.0;
  }
  update(dt, level, game) {
    this.vy += 280 * dt;              // мягкая дуга — дальний бросок
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.rot += dt * 16;
    this.life -= dt;
    const c = Math.floor((this.x + this.w / 2) / TILE), r = Math.floor((this.y + this.h / 2) / TILE);
    if (isSolid(level, c, r)) { this.dead = true; game.spawnDust(this.x + this.w / 2, this.y + this.h / 2, 4); }
    if (this.life <= 0 || this.y > ROWS * TILE + 40) this.dead = true;
  }
  draw(ctx, camX) {
    ctx.save();
    ctx.translate(this.x + this.w / 2 - camX, this.y + this.h / 2);
    ctx.rotate(this.rot);
    const spr = Sprites.get('plush');
    const src = spr && (spr.img || spr.fallback);
    if (src) { ctx.imageSmoothingEnabled = false; ctx.drawImage(src, -18, -16, 36, 32); }
    ctx.restore();
  }
}

// ============================================================
// ОБЛОМКИ ЗЕМЛЕТРЯСЕНИЯ — камни с неба (спавнит Quake в main.js)
// Падают, бьют игрока (с инвулном), прибивают мелких врагов,
// разбиваются о землю/стены с пылью и звуком крошения.
// ============================================================
class QuakeDebris {
  constructor(x, y, big = false) {
    this.s = big ? 20 : 13;             // размер камня
    this.w = this.s; this.h = this.s;
    this.x = x; this.y = y;
    this.vx = (Math.random() - 0.5) * 70;
    this.vy = 40 + Math.random() * 90;
    this.rot = Math.random() * 6.28;
    this.rotSpd = (Math.random() < 0.5 ? -1 : 1) * (3 + Math.random() * 4);
    this.big = big;
    // рваный контур генерится ОДИН раз — камень не «мигает» гранями
    this.pts = [];
    const n = 7;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rr = this.s * (0.38 + Math.random() * 0.16);
      this.pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
    }
    this.dead = false;
  }
  update(dt, level, game) {
    this.vy = Math.min(this.vy + CONFIG.GRAVITY * 0.6 * dt, 720);
    moveEntity(this, level, dt);
    this.rot += this.rotSpd * dt;
    // удар о землю/стену/платформу — разбился
    if (this.onGround || this.hitWall) {
      this.dead = true;
      game.spawnDust(this.x + this.s / 2, this.y + this.s, this.big ? 6 : 3);
      Audio8.sfx.crumble();
      return;
    }
    if (this.y > ROWS * TILE + 60) { this.dead = true; return; }
    // задел игрока (инвулн после урона спасает, как у шипов)
    const p = game.player;
    if (p && p.invuln <= 0 && overlaps(this, p)) {
      this.dead = true;
      p.hurt(Math.sign(p.x - this.x) || 1, game);
      return;
    }
  }
  draw(ctx, camX) {
    ctx.save();
    ctx.translate(this.x + this.s / 2 - camX, this.y + this.s / 2);
    ctx.rotate(this.rot);
    ctx.fillStyle = this.big ? '#6b5847' : '#7d6a56';
    ctx.beginPath();
    this.pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.25)';
    ctx.fillRect(-this.s * 0.22, -this.s * 0.05, this.s * 0.3, this.s * 0.26);
    ctx.restore();
  }
}

// Завод — выход с уровня. Стоит НА земле (не зарывается в тайлы!),
// триггером завершения уровня служит всё здание с запасом по краям.
const GROUND_TOP = (ROWS - 2) * TILE; // верх земли — ряд 11 → y = 440

// ============================================================
// КАСТОМНЫЕ ОБЪЕКТЫ (админ-панель): своя текстура + JS-скрипт
// ============================================================
// Скрипт объекта — тело функции, исполняется КАЖДЫЙ КАДР:
//   function(obj, api, dt) { ... }
// obj — сам объект (x, y, w, h, vx, vy, hp, t, data…),
// api — доступ к игре, dt — секунды с прошлого кадра.
const CustomObjects = {
  defs: new Map(),
  runs: new Map(),
  broken: new Set(),   // объекты с ошибкой в скрипте — чтобы не спамить консоль
  set(list) {
    this.defs.clear(); this.runs.clear(); this.broken.clear();
    (list || []).forEach((o) => {
      if (!o || !o.id) return;
      this.defs.set(o.id, o);
      try {
        this.runs.set(o.id, new Function('obj', 'api', 'dt', '"use strict";\n' + String(o.script || '')));
      } catch (e) {
        this.broken.add(o.id);
        console.warn('Объект «' + (o.name || o.id) + '»: ошибка в скрипте — ' + e.message);
      }
      if (o.tex) Sprites.addSlot('obj-' + o.id, { w: o.w, h: o.h, url: o.tex, color: '#9a4de6', portrait: o.character ? [0, 0.66] : null });
    });
  },
  def(id) { return this.defs.get(id) || null; },
  get list() { return Array.from(this.defs.values()); },
};

class CustomEnt {
  constructor(type, c, r) {
    const d = CustomObjects.def(type) || {};
    this.type = type;
    this.w = Math.max(8, Math.min(400, d.w || 32));
    this.h = Math.max(8, Math.min(400, d.h || 32));
    this.x = c * TILE + (TILE - this.w) / 2;
    this.y = (r + 1) * TILE - this.h;      // стоит на дне клетки
    this.vx = 0; this.vy = 0;
    this.dir = -1;
    this.t = 0;                             // время жизни (сек)
    this.hp = 1; this.maxHp = 1;
    this.dead = false; this.taken = false;
    // флаги поведения — скрипт задаёт/меняет:
    this.collect = 0;        // >0: касание игроком = подбор, +collect к чекушкам
    this.dangerous = false;  // касание игроком = урон
    this.stompable = false;  // убивается прыжком сверху и плюшкой
    this.onGround = false; this.hitWall = false;
    this.flash = 0;
    this.data = {};          // переменные скрипта
  }
  hurt(game) {
    this.hp--;
    this.flash = 0.25;
    if (this.hp <= 0) {
      this.dead = true;
      game.kills++;
      game.spawnStars(this.x + this.w / 2, this.y + this.h / 2);
    }
  }
  update(dt, level, game) {
    this.t += dt;
    if (this.flash > 0) this.flash -= dt;
    // упал за пределы карты (например, в яму) — убираем
    if (this.y > ROWS * TILE + 80) this.dead = true;
    const run = CustomObjects.runs.get(this.type);
    if (!run || CustomObjects.broken.has(this.type)) return;
    try { run(this, game, dt); }
    catch (e) {
      CustomObjects.broken.add(this.type);
      console.warn('Объект «' + this.type + '»: ошибка выполнения скрипта — ' + e.message);
    }
    if (this.hp > this.maxHp) this.maxHp = this.hp;
  }
  draw(ctx, camX) {
    if (!Sprites.get('obj-' + this.type)) return;
    ctx.fillStyle = 'rgba(0,0,0,.2)';
    ctx.beginPath();
    ctx.ellipse(this.x + this.w / 2 - camX, this.y + this.h + 2, Math.max(6, this.w * 0.4), 3, 0, 0, 7);
    ctx.fill();
    if (this.flash > 0) ctx.globalAlpha = 0.55;
    Sprites.draw(ctx, 'obj-' + this.type, this.x - camX, this.y, this.w, this.h, this.dir > 0);
    ctx.globalAlpha = 1;
    if (this.maxHp > 1 && !this.dead) {
      const bw = Math.max(30, this.w * 0.8);
      const bx = this.x + this.w / 2 - bw / 2 - camX, by = this.y - 10;
      ctx.fillStyle = '#00000090'; ctx.fillRect(bx - 1, by - 1, bw + 2, 6);
      ctx.fillStyle = '#ff4757'; ctx.fillRect(bx, by, bw * Math.max(0, this.hp / this.maxHp), 4);
    }
  }
}

class FactoryExit {
  constructor(c, locked) {
    this.c = c;
    this.x = c * TILE; this.y = GROUND_TOP - 140;
    this.w = 160; this.h = 140;
    this.locked = locked;
    this.t = 0;
    this.near = 0;   // игрок рядом (для подсказки)
  }
  unlock() { this.locked = false; }
  // зона-триггер: всё здание + 14px по краям, от крыши до земли
  doorRect() { return { x: this.x - 14, y: this.y + 4, w: this.w + 28, h: this.h - 4 }; }
  update(dt, player) {
    this.t += dt;
    const px = player ? player.x + player.w / 2 : -9999;
    this.near = Math.abs(px - (this.x + this.w / 2)) < 300;
  }
  draw(ctx, camX) {
    if (this.locked) ctx.globalAlpha = 0.35;
    Sprites.draw(ctx, 'factory', this.x - camX, this.y, this.w, this.h);
    ctx.globalAlpha = 1;
    const cx = this.x + this.w / 2 - camX;
    if (this.locked) {
      ctx.fillStyle = '#ffd23f';
      ctx.font = 'bold 22px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('🔒', cx, this.y + 34 + Math.sin(this.t * 3) * 3);
      ctx.textAlign = 'left';
    } else {
      // мигающая стрелка над заводом
      const bob = Math.sin(this.t * 4) * 5;
      ctx.fillStyle = '#2ed573';
      ctx.font = 'bold 30px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('▼', cx, this.y - 16 + bob);
      // подсветка зоны триггера, когда игрок близко
      if (this.near) {
        const pulse = 0.35 + Math.sin(this.t * 6) * 0.2;
        ctx.fillStyle = `rgba(46,213,115,${pulse})`;
        ctx.fillRect(this.x - 14 - camX, this.y + this.h - 8, this.w + 28, 8);
      }
      ctx.textAlign = 'left';
    }
  }
}
