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
  return level.grid[r][c] === '=';
}
function isSpike(level, c, r) {
  if (c < 0 || c >= level.w || r < 0 || r >= ROWS) return false;
  return level.grid[r][c] === '^';
}

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
    const r0 = Math.floor(ent.y / TILE), r1 = Math.floor((ent.y + ent.h - 1) / TILE);
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
  }

  update(dt, input, level, game) {
    const SPEED = CONFIG.MOVE_SPEED, ACC = 2200, FRICTION = 2600;

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
      Audio8.sfx.jump();
      game.spawnDust(this.x + this.w / 2, this.y + this.h, 4);
    }
    // короткий прыжок при отпускании
    if (!input.jumpHeld && this.vy < -260) this.vy = -260;

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
// ВОЖДЬ БУРМАЛДЕНОВ (босс)
// ============================================================
class Boss {
  constructor(colC) {
    this.w = 66; this.h = 84;
    this.x = colC * TILE + 7;
    this.y = 8 * TILE;
    this.vx = -70; this.vy = 0;
    this.dir = -1;
    this.hp = 6; this.maxHp = 6;
    this.dead = false;
    this.invuln = 0;
    this.chargeT = 5;
    this.state = 'walk';      // walk | telegraph | charge
    this.telegraphT = 0;
    this.walkT = 0;
    this.hurtFlash = 0;
  }
  get speed() { return 70 + (this.maxHp - this.hp) * 22; }

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

// Завод — выход с уровня. Стоит НА земле (не зарывается в тайлы!),
// триггером завершения уровня служит всё здание с запасом по краям.
const GROUND_TOP = (ROWS - 2) * TILE; // верх земли — ряд 11 → y = 440

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
