// ============================================================
// КАСТОМНЫЕ ПРЕДМЕТЫ, ВРАГИ И ВОЖДИ (админ-панель, CMS)
// Панель хранит на сервере: items[] (подбираемые/враги) и bosses[]
// (вожди с личными разговорами). У каждого — своя текстура (PNG)
// и опциональный JS-скрипт с хуками. Функции поведения пишутся
// прямо в панели и применяются «для всех» после публикации.
//
// Скрипт выполняется ОДИН раз при загрузке и возвращает объект хуков:
//   return { init, update, onPickup, onStomp, onHit, onDeath, draw }
// В хуки передаётся (self, api, dt), в draw — (self, api, ctx, camX).
// ============================================================
const CustomDefs = (() => {
  const items = [];   // нормализованные определения предметов
  const bosses = [];  // нормализованные определения вождей
  let API = null;     // игровой api (привязывается из main.js)

  function clampNum(v, min, max, dflt) {
    const n = Number(v);
    if (!isFinite(n)) return dflt;
    return Math.max(min, Math.min(max, n));
  }

  // ---------- компиляция скриптов ----------
  function compile(code) {
    if (!code || !String(code).trim()) return {};
    try {
      const f = new Function(String(code) + '\n//# sourceURL=custom-script.js');
      const hooks = f();
      return (hooks && typeof hooks === 'object') ? hooks : {};
    } catch (e) {
      console.error('[custom script] ошибка компиляции:', e);
      return {};
    }
  }

  // безопасный вызов хука: ошибка в скрипте не роняет игру
  function callHook(hooks, name, ...args) {
    const f = hooks && hooks[name];
    if (typeof f !== 'function') return undefined;
    try { return f(...args); }
    catch (e) { console.error('[custom hook ' + name + ']', e); return undefined; }
  }

  // ---------- нормализация определений ----------
  function normItem(d) {
    const kind = d.kind === 'enemy' ? 'enemy' : 'pickup';
    const props = (d.props && typeof d.props === 'object') ? d.props : {};
    return {
      id: d.id,
      kind,
      name: String(d.name || 'Предмет').slice(0, 40),
      texId: d.texId || null,
      texUrl: d.texUrl || null,
      texKey: 'ci:' + d.id,
      w: Math.round(clampNum(d.w, 10, 120, 30)),
      h: Math.round(clampNum(d.h, 10, 130, 30)),
      props: {
        gives: ['none', 'bottle', 'heart', 'ammo'].includes(props.gives) ? props.gives : 'none',
        amount: Math.round(clampNum(props.amount, 1, 9, 1)),
        speed: clampNum(props.speed, 5, 400, 60),
        hp: Math.round(clampNum(props.hp, 1, 9, 1)),
        patrol: props.patrol !== false,
      },
      hooks: compile(d.script),
    };
  }

  function normBoss(d) {
    const dialog = {
      intro: Array.isArray(d.intro) ? d.intro.filter((l) => l && typeof l.text === 'string') : [],
      outro: Array.isArray(d.outro) ? d.outro.filter((l) => l && typeof l.text === 'string') : [],
    };
    return {
      id: d.id,
      name: String(d.name || 'Вождь').slice(0, 40),
      texId: d.texId || null,
      texUrl: d.texUrl || null,
      texKey: 'cb:' + d.id,
      w: Math.round(clampNum(d.w, 40, 200, 66)),
      h: Math.round(clampNum(d.h, 50, 240, 84)),
      hp: Math.round(clampNum(d.hp, 1, 30, 6)),
      speed: clampNum(d.speed, 0, 400, 0), // 0 — авто (как у официального вождя)
      dialog,
      hooks: compile(d.script),
    };
  }

  // ---------- загрузка пакета из CMS ----------
  function load(itemDefs, bossDefs) {
    items.length = 0;
    bosses.length = 0;
    (Array.isArray(itemDefs) ? itemDefs : []).forEach((d) => {
      if (d && d.id) items.push(normItem(d));
    });
    (Array.isArray(bossDefs) ? bossDefs : []).forEach((d) => {
      if (d && d.id) bosses.push(normBoss(d));
    });
    // регистрация текстур в Sprites (слоты ci:/cb:)
    items.forEach((d) => { if (d.texUrl) Sprites.register(d.texKey, d.texUrl, d.w, d.h); });
    bosses.forEach((d) => { if (d.texUrl) Sprites.register(d.texKey, d.texUrl, d.w, d.h); });
  }

  function bindApi(api) { API = api; }
  function apiOr(explain) {
    if (!API) console.warn('[custom] api ещё не привязан (' + explain + ')');
    return API || {};
  }

  function getItem(id) { return items.find((d) => d.id === id) || null; }
  function getBoss(id) { return bosses.find((d) => d.id === id) || null; }

  // для диалогов: ключ портрета и имя говорящего
  function portraitKey(who) {
    if (getBoss(who)) return 'cb:' + who;
    if (getItem(who)) return 'ci:' + who;
    return null;
  }
  function displayName(who) {
    const b = getBoss(who);
    if (b) return b.name;
    const i = getItem(who);
    if (i) return i.name;
    return null;
  }

  // ---------- фабрики сущностей ----------
  // предмет (подбираемый или враг) на карте
  function spawn(ref, c, r) {
    const def = getItem(ref);
    if (!def) return null;
    return def.kind === 'enemy' ? new CustomEnemy(def, c, r) : new CustomPickup(def, c, r);
  }

  // ============================================================
  // ПОДБИРАЕМЫЙ ПРЕДМЕТ
  // ============================================================
  class CustomPickup {
    constructor(def, c, r) {
      this.def = def;
      this.kind = 'pickup';
      this.c = c; this.r = r;
      this.w = Math.min(def.w, 60);
      this.h = Math.min(def.h, 60);
      this.x = c * TILE + (TILE - this.w) / 2;
      this.y = r * TILE + TILE - this.h - 2;
      this.t = Math.random() * 6;
      this.taken = false;
      this.dead = false;
      callHook(def.hooks, 'init', this, apiOr('pickup init'));
    }
    rect() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }
    update(dt) {
      this.t += dt;
      callHook(this.def.hooks, 'update', this, apiOr('pickup update'), dt);
    }
    // подбор Андреем: сначала базовые свойства, потом скрипт
    take(game) {
      const p = this.def.props;
      const n = p.amount;
      if (p.gives === 'bottle') { game.addBottles(n); Audio8.sfx.coin(); }
      else if (p.gives === 'heart') { game.heal(n); Audio8.sfx.heart(); }
      else if (p.gives === 'ammo') { game.addAmmo(n); Audio8.sfx.heart(); }
      else Audio8.sfx.coin();
      game.sparkle(this.x + this.w / 2, this.y + this.h / 2, 6);
      callHook(this.def.hooks, 'onPickup', this, apiOr('pickup'));
    }
    draw(ctx, camX) {
      const bob = Math.sin(this.t * 3) * 4;
      const x = this.x - camX, y = this.y + bob;
      // мягкое свечение, чтобы предмет бросался в глаза
      const pulse = 0.18 + Math.sin(this.t * 3.6) * 0.1;
      ctx.fillStyle = `rgba(255,210,63,${pulse})`;
      ctx.beginPath();
      ctx.ellipse(x + this.w / 2, y + this.h / 2, this.w * 0.9, this.h * 0.9, 0, 0, 7);
      ctx.fill();
      Sprites.draw(ctx, this.def.texKey, x, y, this.w, this.h);
      callHook(this.def.hooks, 'draw', this, apiOr('draw'), ctx, camX);
    }
  }

  // ============================================================
  // КАСТОМНЫЙ ВРАГ (физика как у бурмалденца)
  // ============================================================
  class CustomEnemy {
    constructor(def, c, r) {
      this.def = def;
      this.kind = 'enemy';
      this.isBoss = false;
      this.w = Math.max(16, Math.min(120, def.w));
      this.h = Math.max(16, Math.min(130, def.h));
      this.x = c * TILE + (TILE - this.w) / 2;
      this.y = r * TILE + TILE - this.h;
      this.speed = def.props.speed;
      this.hp = def.props.hp;
      this.maxHp = this.hp;
      this.vx = -this.speed; this.vy = 0;
      this.dir = -1;
      this.dead = false;
      this.walkT = Math.random() * 3;
      this.t = 0;
      this.hurtT = 0; // мигание после урона
      callHook(def.hooks, 'init', this, apiOr('enemy init'));
    }
    flip() { this.vx = -Math.sign(this.vx || this.dir) * this.speed; this.dir = Math.sign(this.vx); }
    update(dt, level, game) {
      if (this.hurtT > 0) this.hurtT -= dt;
      this.vy = Math.min(this.vy + CONFIG.GRAVITY * dt, 900);
      moveEntity(this, level, dt);
      if (this.hitWall) this.flip();
      // не падать с края и не ходить в шипы (если включён патруль)
      if (this.onGround && this.def.props.patrol) {
        const frontX = this.vx > 0 ? this.x + this.w + 3 : this.x - 3;
        const fc = Math.floor(frontX / TILE);
        const fr = Math.floor((this.y + this.h + 8) / TILE);
        if (!isSolid(level, fc, fr) && !isPlat(level, fc, fr)) this.flip();
        const br = Math.floor((this.y + this.h - 6) / TILE);
        if (isSpike(level, fc, br)) this.flip();
      }
      this.walkT += dt * 5;
      this.t += dt;
      callHook(this.def.hooks, 'update', this, apiOr('enemy update'), dt);
    }
    // прыжок сверху или попадание плюшкой
    stomp(game) {
      this.hp--;
      this.hurtT = 0.35;
      Audio8.sfx.stomp();
      game.spawnStars(this.x + this.w / 2, this.y + 8);
      const keep = callHook(this.def.hooks, 'onStomp', this, apiOr('onStomp'));
      if (this.hp <= 0 && keep !== false) { this.dead = true; game.kills++; }
    }
    draw(ctx, camX) {
      ctx.fillStyle = 'rgba(0,0,0,.25)';
      ctx.beginPath();
      ctx.ellipse(this.x + this.w / 2 - camX, this.y + this.h + 3, this.w * 0.4, 4, 0, 0, 7);
      ctx.fill();
      const bob = Math.abs(Math.sin(this.walkT)) * 2.5;
      const x = this.x - camX, y = this.y - bob;
      if (this.hurtT > 0 && Math.floor(this.hurtT * 16) % 2 === 0) {
        ctx.save(); ctx.globalAlpha = 0.5;
        Sprites.draw(ctx, this.def.texKey, x - 3, y - 3, this.w + 6, this.h + 6, this.vx > 0);
        ctx.restore();
      } else {
        Sprites.draw(ctx, this.def.texKey, x, y, this.w, this.h, this.vx > 0);
      }
      // полоска HP, если здоровья больше 1
      if (this.maxHp > 1 && !this.dead) {
        const bw = Math.max(26, this.w * 0.8), bx = this.x + this.w / 2 - bw / 2 - camX, by = this.y - 10;
        ctx.fillStyle = '#00000090'; ctx.fillRect(bx - 1, by - 1, bw + 2, 6);
        ctx.fillStyle = '#ff4757'; ctx.fillRect(bx, by, bw * (this.hp / this.maxHp), 4);
      }
      callHook(this.def.hooks, 'draw', this, apiOr('draw'), ctx, camX);
    }
  }

  // ============================================================
  // КАСТОМНЫЙ ВОЖДЬ (на базе официального босса)
  // ============================================================
  class CustomBoss extends Boss {
    constructor(def, colC) {
      super(colC);
      this.def = def;
      this.w = def.w;
      this.h = def.h;
      this.x = colC * TILE + (TILE - this.w) / 2;
      this.y = 8 * TILE + (84 - this.h);
      this.hp = def.hp; this.maxHp = def.hp;
      this.texKey = def.texKey;
      this.name = def.name;
      this.dialog = def.dialog;
      this.baseSpeed = def.speed;
      this.chargeT = 4 + Math.random() * 2;
      callHook(def.hooks, 'init', this, apiOr('boss init'));
    }
    get speed() {
      const lost = this.maxHp - this.hp;
      if (this.baseSpeed > 0) return Math.max(20, this.baseSpeed + lost * 6);
      return 70 + lost * 22;
    }
    update(dt, level, game) {
      super.update(dt, level, game);
      callHook(this.def.hooks, 'update', this, apiOr('boss update'), dt);
    }
    stomp(game) {
      callHook(this.def.hooks, 'onHit', this, apiOr('onHit'));
      super.stomp(game);
    }
    hitByHat(game) {
      callHook(this.def.hooks, 'onHit', this, apiOr('onHit'));
      super.hitByHat(game);
    }
    die(game) {
      callHook(this.def.hooks, 'onDeath', this, apiOr('onDeath'));
      super.die(game);
    }
  }

  // классы и реестр — глобально (стиль entities.js: spawnBoss в main.js использует CustomBoss,
  // ui.js берёт портреты/имена вождей через window.CustomDefs)
  window.CustomDefs = {
    load, bindApi, spawn, getItem, getBoss, portraitKey, displayName,
    get items() { return items; },
    get bosses() { return bosses; },
  };
  window.CustomPickup = CustomPickup;
  window.CustomEnemy = CustomEnemy;
  window.CustomBoss = CustomBoss;

  return window.CustomDefs;
})();
