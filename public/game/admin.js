// ============================================================
// ВРЕМЕННАЯ АДМИН-ПАНЕЛЬ v2: карты (сколько угодно), разговоры,
// текстуры, музыка, каналы. Удаляется по команде владельца
// вместе с admin.html + api/game-cms + блоком ADMIN CMS OVERRIDE в main.js.
// ============================================================
const $ = (id) => document.getElementById(id);
const API = '/api/game-cms';
// ROWS берётся из js/levels.js (13) — не переобъявляем

// ---------- данные ----------
const MAP_LEVELS = LEVELS.filter((d) => d.type === 'map');
const CMS = {
  maps: [],            // {key, id, def|null(ориг), ed:{cells,ents,spawn,factory,name,bg,dirty,undo,dialogs:{intro,outro,hints}}}
  intro: { cutscene: [], outroAfterBoss: [] },
  textures: {},        // key -> {id,url}
  music: { active: null, tracks: [] },
  socials: [],
  objects: [],         // кастомные объекты: {id,name,emoji,w,h,tex,texId,script,character}
  quake: null,         // настройки землетрясений (DEFAULT_QUAKE), заполнится ниже
};
const DEFAULT_QUAKE = {
  enabled: true,   // авто-землетрясения на обычных картах глав
  prologue: false, // и на прологе (первые карты без главы)
  rocks: true,     // камни с неба (урон)
  power: 1,        // множитель силы 0.5..2
  interval: 20,    // средний интервал между толчками, сек (8..40)
  dur: 5,          // средняя длительность толчка, сек (2..10)
};
CMS.quake = Object.assign({}, DEFAULT_QUAKE);
let introDirty = false, socialsDirty = false, texturesDirty = false, musicDirty = false, objectsDirty = false, quakeDirty = false;
let mapsListDirty = false; // состав списка карт менялся (добавление/удаление) — нужна перепубликация
let pubAt = null;
let mode = 'maps';
let curMap = 0;        // индекс в CMS.maps
let tool = 'ground';
let zoom = { cs: 26 };
let hover = null;

const WHO_LIST = [
  ['andrey', 'Андрей'], ['enemy', 'Бурмалденец'], ['boss', 'Вождь'],
  ['radio', 'Радио/Новости'], ['narrator', 'Рассказчик'],
];
const TEX_SLOTS = [
  ['andrey', 'Андрей (герой)', '48×56', 'PNG с прозрачным фоном'],
  ['burmaldenets', 'Враг', '44×52', 'PNG с прозрачным фоном'],
  ['boss', 'Вождь (босс)', '76×92', 'PNG с прозрачным фоном'],
  ['checkushka', 'Чекушка', '24×32', 'PNG с прозрачным фоном'],
  ['plush', 'Плюшка (снаряд)', '36×32', 'PNG с прозрачным фоном'],
  ['heart', 'Сердечко', '26×24', 'PNG с прозрачным фоном'],
  ['tomahawk', 'Томагавк', '20×20', 'PNG с прозрачным фоном'],
  ['factory', 'Завод', '176×140', 'PNG с прозрачным фоном'],
  ['bg_fields', 'Фон «Поля»', '960×540', 'JPG/PNG, без прозрачности'],
  ['bg_city', 'Фон «Город»', '960×540', 'JPG/PNG, без прозрачности'],
  ['bg_district', 'Фон «Район»', '960×540', 'JPG/PNG, без прозрачности'],
  ['bg_plant', 'Фон «Завод, ночь»', '960×540', 'JPG/PNG, без прозрачности'],
];
const SOC_PRESETS = [
  ['tg', 'Telegram'], ['yt', 'YouTube'], ['tt', 'TikTok'], ['vk', 'ВКонтакте'],
  ['tw', 'Twitch'], ['ds', 'Discord'], ['other', 'Другое'],
];

// Шаблоны скриптов кастомных объектов (исполняются каждый кадр: obj, api, dt)
const OBJ_TEMPLATES = {
  collect: { label: '🍾 Предмет (подбор = чекушки)', code: '// Предмет: подбор даёт чекушки\nobj.collect = 1;\n// лёгкое покачивание:\nobj.y += Math.sin(obj.t * 3) * 0.3;' },
  static: { label: '🗿 Декорация (просто стоит)', code: '// Декорация — ничего не делает.\n// Пример покачивания: obj.y += Math.sin(obj.t * 3) * 0.3;' },
  danger: { label: '⚠ Ловушка (урон при касании)', code: '// Ловушка: касается игрок — получает урон\nobj.dangerous = true;' },
  enemy: { label: '👊 Враг (ходит, убивается прыжком)', code: '// Враг: ходит, опасен, убивается прыжком сверху (и плюшкой)\n// ВАЖНО: настройки задаются ОДИН РАЗ (иначе урон будет сбрасываться!)\nif (!obj.data.init) {\n  obj.data.init = true;\n  obj.hp = 2; obj.maxHp = 2;\n  obj.stompable = true; obj.dangerous = true;\n  obj.data.speed = 60;\n}\nobj.vx = obj.data.speed * obj.dir;\napi.gravity(obj, dt);\nif (api.solid(obj)) obj.dir = -obj.dir;' },
  boss: { label: '👑 Вождь (босс 6 HP, прыгает)', code: '// Вождь: 6 HP, опасен, убивается прыжком и плюшками\n// Настройки — ОДИН РАЗ, физика — каждый кадр\nif (!obj.data.init) {\n  obj.data.init = true;\n  obj.hp = 6; obj.maxHp = 6;\n  obj.stompable = true; obj.dangerous = true;\n  obj.data.speed = 70;\n}\nobj.vx = obj.data.speed * obj.dir;\napi.gravity(obj, dt);\nif (api.solid(obj)) obj.dir = -obj.dir;\n// каждые 4 секунды прыжок в сторону игрока\nif (Math.floor(obj.t / 4) !== obj.data.jmp) {\n  obj.data.jmp = Math.floor(obj.t / 4);\n  obj.vy = -520;\n  obj.dir = (api.px > obj.x) ? 1 : -1;\n}' },
  empty: { label: '📝 Пустой (напишу сам)', code: '// Свой код. Доступно каждый кадр:\n// obj — объект: x, y, w, h, vx, vy, hp, t (сек), dir, data (свои переменные)\n// api.gravity(obj, dt) — физика+коллизии;  api.solid(obj) — упёрся в стену\n// api.hurtPlayer(1); api.healPlayer(1); api.ammo(3); api.score(5);\n// api.sfx(\'coin\'); api.particles(x, y, \'star\', 10); api.shake(0.3);\n// api.quake(1, 4) — ЗЕМЛЕТРЯСЕНИЕ (сила 0.3-1.6, секунды): тряска + камни с неба\n// api.px, api.py — координаты игрока; api.solidAt(px, py) — твёрдый ли тайл\n// СОВЕТ: одноразовые настройки делай через if (!obj.data.init) { ... }' },
};

const toastEl = $('toast');
let toastTimer = null;
function toast(msg, ok = false) {
  toastEl.textContent = msg;
  toastEl.classList.toggle('ok', ok);
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3200);
}

// ============================================================
// def <-> состояние редактора
// ============================================================
function defToState(def) {
  const w = def.width;
  const cells = Array.from({ length: ROWS }, () => Array(w).fill('.'));
  (def.ground || []).forEach(([c0, c1]) => {
    for (let r = 11; r < ROWS; r++) for (let c = c0; c <= c1; c++) if (c >= 0 && c < w) cells[r][c] = '#';
  });
  (def.bricks || []).forEach(([c0, r0, c1, r1]) => {
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++)
      if (r >= 0 && r < ROWS && c >= 0 && c < w) cells[r][c] = 'B';
  });
  (def.plats || []).forEach(([c, r, len]) => {
    for (let i = 0; i < len; i++) { const cc = c + i; if (r >= 0 && r < ROWS && cc >= 0 && cc < w) cells[r][cc] = '='; }
  });
  (def.crumble || []).forEach(([c, r, len]) => {
    for (let i = 0; i < len; i++) { const cc = c + i; if (r >= 0 && r < ROWS && cc >= 0 && cc < w) cells[r][cc] = 'C'; }
  });
  (def.spikes || []).forEach(([c0, c1, r]) => {
    const row = (r === undefined || r === null) ? 10 : r;
    for (let c = c0; c <= c1; c++) if (row >= 0 && row < ROWS && c >= 0 && c < w) cells[row][c] = '^';
  });
  (def.liquids || []).forEach(([c0, c1, r]) => {
    const row = (r === undefined || r === null) ? 12 : r;
    for (let c = c0; c <= c1; c++) if (row >= 0 && row < ROWS && c >= 0 && c < w) cells[row][c] = 'L';
  });
  (def.springs || []).forEach(([c, r]) => {
    const row = (r === undefined || r === null) ? 10 : r;
    if (row >= 0 && row < ROWS && c >= 0 && c < w) cells[row][c] = 'v';
  });
  (def.saws || []).forEach(([c, r]) => {
    const row = (r === undefined || r === null) ? 10 : r;
    if (row >= 0 && row < ROWS && c >= 0 && c < w) cells[row][c] = 'S';
  });
  const ents = [];
  const add = (t, c, r) => { if (c >= 0 && c < w && r >= 0 && r < ROWS) ents.push({ t, c, r }); };
  (def.bottles?.runs || []).forEach(([c0, c1, r]) => { for (let c = c0; c <= c1; c++) add('bottle', c, r); });
  (def.bottles?.singles || []).forEach(([c, r]) => add('bottle', c, r));
  (def.hearts || []).forEach(([c, r]) => add('heart', c, r));
  (def.plushes || []).forEach(([c, r]) => add('plush', c, r));
  (def.enemies || []).forEach(([t, c, r]) => add(t, c, (r === undefined || r === null) ? 10 : r));
  if (def.boss) add('G', def.boss.col, 9);
  // кастомные объекты: def.custom = { 'obj-id': [[c,r],...] }
  if (def.custom && typeof def.custom === 'object') {
    Object.entries(def.custom).forEach(([id, list]) => (list || []).forEach(([c, r]) => add('@' + id, c, r)));
  }
  return {
    cells, ents, undo: [], dirty: false,
    spawn: def.spawn?.c ?? 2, factory: def.factory?.c ?? (w - 6),
    name: def.name || 'Карта', bg: def.bg || 'bg_fields',
    bossHp: (def.boss && typeof def.boss.hp === 'number') ? def.boss.hp : 6,
    quake: (def.quake && def.quake.on) ? {
      on: true,
      power: (typeof def.quake.power === 'number') ? def.quake.power : 1,
      interval: (typeof def.quake.interval === 'number') ? def.quake.interval : 20,
      dur: (typeof def.quake.dur === 'number') ? def.quake.dur : 5,
      rocks: def.quake.rocks !== false,
    } : null,
    dialogs: {
      intro: (def.dialogue?.intro || []).map((l) => ({ who: l.who, text: l.text })),
      outro: (def.dialogue?.outro || []).map((l) => ({ who: l.who, text: l.text })),
      hints: (def.hints || []).map((h) => ({ c: h.c, text: h.text })),
    },
  };
}

function indevState(name, dirty) {
  // экран «В разработке» — уровень без террейна
  return { isIndev: true, cells: null, ents: null, undo: [], dirty: !!dirty, spawn: 2, factory: 0, bg: 'bg_fields', name: name || 'В разработке', dialogs: { intro: [], outro: [], hints: [] } };
}
function officialIndev() {
  const d = LEVELS.find((x) => x.type === 'indev');
  if (!d) return null;
  return { key: 'indev', id: d.id || 6, def: JSON.parse(JSON.stringify(d)), ed: indevState(d.name, false) };
}

function stateToDef(m) {
  const st = m.ed;
  if (st.isIndev) {
    return { id: m.id, type: 'indev', name: (st.name || 'В разработке').slice(0, 40) };
  }
  const { cells, ents } = st;
  const w = st.cells[0].length;
  // база — оригинальный def: поля, которых редактор не редактирует (chapter,
  // chapterTitle, bossOutro и любые будущие), НЕ теряются при публикации
  const base = (m.def && m.def.type === 'map') ? JSON.parse(JSON.stringify(m.def)) : {};
  const ground = [], bricks = [], plats = [], spikes = [];
  const crumble = [], liquids = [], springs = [], saws = [];
  const singles = [], hearts = [], plushes = [], enemies = [];
  const custom = {};
  let bossCol = null;
  for (let r = 11; r < ROWS; r++) {
    let c = 0;
    while (c < w) {
      if (cells[r][c] === '#') {
        const c0 = c; while (c < w && cells[r][c] === '#') c++;
        if (!ground.some((g) => g[0] === c0 && g[1] === c - 1)) ground.push([c0, c - 1]);
      } else c++;
    }
  }
  for (let r = 0; r < ROWS; r++) {
    let c = 0;
    while (c < w) {
      const ch = cells[r][c];
      if (ch === 'B' || ch === '=' || ch === '^' || ch === 'C' || ch === 'L' || ch === 'v' || ch === 'S') {
        const c0 = c; while (c < w && cells[r][c] === ch) c++;
        if (ch === 'B') bricks.push([c0, r, c - 1, r]);
        else if (ch === '=') plats.push([c0, r, c - c0]);
        else if (ch === 'C') crumble.push([c0, r, c - c0]);
        else if (ch === 'L') liquids.push([c0, c - 1, r]);
        else if (ch === 'v') for (let k = c0; k < c; k++) springs.push([k, r]); // каждый батут — отдельный (соседние не склеивать)
        else if (ch === 'S') for (let k = c0; k < c; k++) saws.push([k, r]);
        else spikes.push([c0, c - 1, r]);
      } else c++;
    }
  }
  ents.forEach((e) => {
    if (e.t === 'bottle') singles.push([e.c, e.r]);
    else if (e.t === 'heart') hearts.push([e.c, e.r]);
    else if (e.t === 'plush') plushes.push([e.c, e.r]);
    else if (e.t === 'e' || e.t === 't' || e.t === 'f' || e.t === 'j' || e.t === 'a') enemies.push([e.t, e.c, e.r]);
    else if (e.t === 'G') bossCol = e.c;
    else if (e.t[0] === '@') {
      const id = e.t.slice(1);
      (custom[id] = custom[id] || []).push([e.c, e.r]);
    }
  });
  const dlg = st.dialogs || { intro: [], outro: [], hints: [] };
  const def = Object.assign(base, {
    id: m.id, type: 'map', bg: st.bg || 'bg_fields', width: w,
    name: (st.name || 'Карта').slice(0, 40),
    ground, bricks, plats, spikes, crumble, liquids, springs, saws,
    bottles: { runs: [], singles },
    hearts, plushes, enemies,
    spawn: { c: st.spawn }, factory: { c: st.factory },
  });
  if (bossCol !== null) {
    def.boss = Object.assign({}, (base.boss && typeof base.boss === 'object') ? base.boss : {}, { col: bossCol });
    if (typeof st.bossHp === 'number' && st.bossHp >= 1) def.boss.hp = st.bossHp;
  } else delete def.boss;
  if (Object.keys(custom).length) def.custom = custom; else delete def.custom;
  // пер-картное землетрясение: сохраняем в def только если включено
  if (st.quake && st.quake.on) {
    def.quake = {
      on: true,
      power: Math.max(0.3, Math.min(2.5, +st.quake.power || 1)),
      interval: Math.max(5, Math.min(90, Math.round(+st.quake.interval || 20))),
      dur: Math.max(1.5, Math.min(15, +st.quake.dur || 5)),
      rocks: st.quake.rocks !== false,
    };
  } else delete def.quake;
  if (dlg.intro.length || dlg.outro.length) def.dialogue = { intro: dlg.intro, outro: dlg.outro }; else delete def.dialogue;
  if (dlg.hints.length) def.hints = dlg.hints.map((h) => ({ c: h.c, text: h.text })); else delete def.hints;
  return def;
}

function validateMap(m) {
  const st = m.ed;
  if (st.isIndev) return null; // экран-заглушка — проверять нечего
  const w = st.cells[0].length;
  if (st.spawn < 1 || st.spawn > w - 2) return 'Старт Андрея вне карты';
  if (st.factory < 1 || st.factory > w - 2) return 'Завод вне карты';
  if (st.cells[10][st.spawn] !== '.') return `Старт (${st.spawn},10) занят тайлом — убери его`;
  for (const e of st.ents) {
    if (e.c < 0 || e.c >= w) return 'Сущность вне карты';
    if (e.r >= 11) return 'Сущность внутри земли — подними выше';
  }
  if (m.def && m.def.factoryLocked && !st.ents.some((e) => e.t === 'G'))
    return 'На босс-карте обязателен Вождь 👑 (без него завод не откроется)';
  return null;
}

// ============================================================
// Черновики (localStorage, автосохранение)
// ============================================================
const DRAFT_KEY = 'adminCmsDrafts_v2';
// Ревизия официального списка уровней. ПОВЫШАТЬ при любом изменении официальных LEVELS
// (добавление глав, правка слотов). Черновик панели без этого маркера или с другой ревизией
// сделан ДО обновления официальных уровней — его список карт устарел и не должен
// затирать новые официальные карты (иначе у пользователя «исчезают» 65 уровней).
const OFFICIAL_REV = 'v2-65lvl';
let saveTimer = null;
function saveDrafts() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      const out = {
        savedAt: Date.now(),
        officialRev: OFFICIAL_REV, // маркер версии официальных уровней, против которых сделан черновик
        maps: CMS.maps.map((m) => ({
          key: m.key, id: m.id, def: m.def ? JSON.parse(JSON.stringify(m.def)) : null,
          ed: { cells: m.ed.cells, ents: m.ed.ents, spawn: m.ed.spawn, factory: m.ed.factory, name: m.ed.name, bg: m.ed.bg, dialogs: m.ed.dialogs, isIndev: !!m.ed.isIndev, quake: m.ed.quake || null, clean: !m.ed.dirty },
        })),
        listV: 3, // маркер: список карт уже управляет экраном «В разработке»
        intro: CMS.intro, introClean: !introDirty,
        socials: CMS.socials, socialsClean: !socialsDirty,
        textures: CMS.textures, texturesClean: !texturesDirty,
        musicActive: CMS.music.active, musicClean: !musicDirty,
        objects: CMS.objects, objectsClean: !objectsDirty,
        quake: CMS.quake, quakeClean: !quakeDirty,
        listClean: !mapsListDirty,
      };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(out));
    } catch (e) { /* приватный режим */ }
  }, 300);
}
function loadDrafts() {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
    return (d && d.maps) ? d : null;
  } catch (e) { return null; }
}
function applyDrafts(d) {
  let any = false;
  // черновик — источник истины по списку карт (включая добавленные/удалённые)
  const list = d.maps || [];
  const restored = [];
  list.forEach((s) => {
    const def = s.def ? JSON.parse(JSON.stringify(s.def)) : null;
    const ed = s.ed || {};
    // экран «В разработке» — отдельный вид уровня без террейна
    if (ed.isIndev || (def && def.type === 'indev')) {
      const nm = ed.name || (def && def.name) || 'В разработке';
      restored.push({ key: s.key || 'indev', id: s.id || 6, def: (def && def.type === 'indev') ? def : { id: s.id || 6, type: 'indev', name: nm }, ed: indevState(nm, ed.clean === false) });
      any = true;
      return;
    }
    const w = def ? def.width : (Array.isArray(ed.cells) && ed.cells[0] ? ed.cells[0].length : 0);
    let base = null;
    if (w >= 20 && Array.isArray(ed.cells) && ed.cells.length === ROWS && ed.cells[0] && ed.cells[0].length === w && Array.isArray(ed.ents)) {
      base = ed;
    } else if (def) {
      base = defToState(def); base.dirty = true; // битый ed — берём def как есть
    } else return; // ни валидного ed, ни def — карту пропускаем
    restored.push({
      key: s.key, id: s.id || 2, def,
      ed: {
        cells: base.cells, ents: base.ents, undo: [],
        spawn: (typeof base.spawn === 'number') ? base.spawn : 2,
        factory: (typeof base.factory === 'number') ? base.factory : (w - 6),
        name: base.name || 'Карта', bg: base.bg || 'bg_fields',
        quake: base.quake || null,
        dialogs: base.dialogs || { intro: [], outro: [], hints: [] },
        dirty: !ed.clean,
      },
    });
    any = true;
  });
  // старый черновик (сделан ДО появления управления «В разработке») — добавляем официальный экран
  if (d.listV !== 3 && !restored.some((m) => m.ed.isIndev)) {
    const iv = officialIndev();
    if (iv) { restored.push(iv); any = true; }
  }
  if (restored.length) CMS.maps = restored;
  if (d.intro && Array.isArray(d.intro.cutscene)) {
    CMS.intro = { cutscene: d.intro.cutscene, outroAfterBoss: d.intro.outroAfterBoss || [] };
    introDirty = !d.introClean; any = true;
  }
  if (Array.isArray(d.socials)) { CMS.socials = d.socials; socialsDirty = !d.socialsClean; any = true; }
  if (d.textures && typeof d.textures === 'object') { CMS.textures = d.textures; texturesDirty = !d.texturesClean; any = true; }
  if (d.musicActive !== undefined) { CMS.music.active = d.musicActive; musicDirty = !d.musicClean; }
  if (Array.isArray(d.objects)) { CMS.objects = d.objects; objectsDirty = !d.objectsClean; any = true; }
  if (d.quake && typeof d.quake === 'object') { CMS.quake = Object.assign({}, DEFAULT_QUAKE, d.quake); quakeDirty = !d.quakeClean; any = true; }
  if (d.listClean !== undefined) mapsListDirty = !d.listClean;
  return any;
}

// ============================================================
// РЕЖИМ КАРТ: редактор
// ============================================================
const cv = $('cv');
const IMG = {};
['andrey', 'burmaldenets', 'boss', 'checkushka', 'heart', 'plush', 'factory'].forEach((k) => {
  const im = new Image();
  im.src = 'image/' + k + '.png';
  im.onload = () => { if (mode === 'maps') draw(); };
  IMG[k] = im;
});

function curEd() { return CMS.maps[curMap] ? CMS.maps[curMap].ed : null; }

function buildMapTabs() {
  const box = $('lvl-tabs');
  box.innerHTML = '';
  CMS.maps.forEach((m, i) => {
    const b = document.createElement('button');
    // № — позиция в игре (катсцена = №1), а не постоянный id: цифры меняются вместе с порядком
    b.innerHTML = `${m.ed.isIndev ? '🚧 ' : ''}№${i + 2} ${m.ed.name || 'Карта'}${m.ed.dirty ? ' <span class="dirty">●</span>' : ''}`;
    b.title = m.ed.isIndev ? 'Экран «В разработке» — можно настроить или удалить' : 'Карта';
    b.onclick = () => { curMap = i; syncMapOpts(); draw(); buildMapTabs(); };
    if (i === curMap) b.classList.add('active');
    box.appendChild(b);
  });
  const add = document.createElement('button');
  add.id = 'btn-add-map';
  add.textContent = '+ ДОБАВИТЬ КАРТУ';
  add.onclick = addMap;
  box.appendChild(add);
}
function nextMapId() {
  // максимальный id среди ВСЕХ уровней (включая катсцену и «В разработке»), чтобы не было дубликатов номеров
  const maxAll = LEVELS.reduce((mx, d) => Math.max(mx, d.id || 0), 0);
  return Math.max(maxAll, CMS.maps.reduce((mx, m) => Math.max(mx, m.id), 0)) + 1;
}
function addMap() {
  const w = 60;
  const id = nextMapId();
  const ed = {
    cells: Array.from({ length: ROWS }, () => Array(w).fill('.')),
    ents: [], undo: [], dirty: true,
    spawn: 2, factory: w - 6, name: 'Новая карта ' + id, bg: 'bg_fields',
    dialogs: { intro: [], outro: [], hints: [] },
  };
  for (let c = 0; c < w; c++) { ed.cells[11][c] = '#'; ed.cells[12][c] = '#'; }
  // вставляем сразу ПОСЛЕ выбранной карты («создать в другом месте»), но перед экраном «В разработке»
  const at = (CMS.maps[curMap] && CMS.maps[curMap].ed.isIndev) ? curMap : curMap + 1;
  CMS.maps.splice(at, 0, { key: 'map-' + Date.now().toString(36), id, def: null, ed });
  curMap = at;
  mapsListDirty = true;
  saveDrafts(); markDirty();
  syncMapOpts(); draw(); buildMapTabs(); buildDlgMapSelect();
  toast('Карта вставлена на это место — стрелками ↑/↓ можно передвинуть', true);
}
function delMap() {
  const m = CMS.maps[curMap];
  if (!m) return;
  const msg = m.ed.isIndev
    ? `Удалить уровень «${m.ed.name}» (№${curMap + 2}, экран «в разработке»)? Игра будет заканчиваться финальным экраном после последней карты.`
    : `Удалить карту «${m.ed.name}» (№${curMap + 2}) из публикации? У игроков сдвинутся номера последующих карт.`;
  if (!confirm(msg)) return;
  CMS.maps.splice(curMap, 1);
  curMap = Math.max(0, Math.min(curMap, CMS.maps.length - 1));
  mapsListDirty = true;
  saveDrafts(); markDirty();
  syncMapOpts(); draw(); buildMapTabs(); buildDlgMapSelect();
  toast('Уровень удалён из списка (не забудь ОПУБЛИКОВАТЬ)', true);
}
function moveMap(dir) {
  const j = curMap + dir;
  if (!CMS.maps[curMap] || j < 0 || j >= CMS.maps.length) return;
  const [m] = CMS.maps.splice(curMap, 1);
  CMS.maps.splice(j, 0, m);
  curMap = j;
  mapsListDirty = true;
  saveDrafts(); markDirty();
  syncMapOpts(); draw(); buildMapTabs(); buildDlgMapSelect();
  toast(dir < 0 ? 'Уровень передвинут выше по порядку' : 'Уровень передвинут ниже по порядку', true);
}
function indevToMap() {
  const m = CMS.maps[curMap];
  if (!m || !m.ed.isIndev) return;
  const w = 60;
  const name = (!m.ed.name || m.ed.name === 'В разработке') ? 'Новая карта' : m.ed.name;
  const ed = { cells: Array.from({ length: ROWS }, () => Array(w).fill('.')), ents: [], undo: [], dirty: true, spawn: 2, factory: w - 6, name, bg: 'bg_fields', dialogs: { intro: [], outro: [], hints: [] } };
  for (let c = 0; c < w; c++) { ed.cells[11][c] = '#'; ed.cells[12][c] = '#'; }
  m.ed = ed; m.def = null; m.key = 'map-' + Date.now().toString(36);
  mapsListDirty = true;
  saveDrafts(); markDirty();
  syncMapOpts(); draw(); buildMapTabs(); buildDlgMapSelect();
  toast('Уровень стал обычной картой — рисуй террейн и публикуй', true);
}
function resetMap() {
  const m = CMS.maps[curMap];
  if (!m) return;
  if (m.def) {
    m.ed = defToState(m.def);
  } else {
    const w = m.ed.cells[0].length;
    const ed = { cells: Array.from({ length: ROWS }, () => Array(w).fill('.')), ents: [], undo: [], dirty: true, spawn: 2, factory: w - 6, name: m.ed.name, bg: m.ed.bg, bossHp: 6, quake: null, dialogs: { intro: [], outro: [], hints: [] } };
    for (let c = 0; c < w; c++) { ed.cells[11][c] = '#'; ed.cells[12][c] = '#'; }
    m.ed = ed;
  }
  m.ed.dirty = true;
  saveDrafts(); markDirty();
  syncMapOpts(); draw(); buildMapTabs();
  toast('Карта сброшена (не забудь ОПУБЛИКОВАТЬ)', true);
}

function syncMapOpts() {
  const m = CMS.maps[curMap];
  if (!m) return;
  const ind = !!m.ed.isIndev;
  $('indevopts').style.display = ind ? '' : 'none';
  ['toolbar', 'canvaswrap', 'cellinfo', 'mapopts'].forEach((id) => { $(id).style.display = ind ? 'none' : ''; });
  if (ind) {
    $('indevname').value = m.ed.name || '';
  } else {
    $('lvlname').value = m.ed.name || '';
    $('lvbg').value = m.ed.bg || 'bg_fields';
    $('bosshp').value = (typeof m.ed.bossHp === 'number') ? m.ed.bossHp : 6;
    const q = m.ed.quake || null;
    $('lvquake').checked = !!q;
    $('quakeopts').style.display = q ? 'inline-flex' : 'none';
    if (q) {
      $('qkpow').value = q.power; $('qkpowv').textContent = (+q.power).toFixed(1);
      $('qkint').value = q.interval; $('qkintv').textContent = q.interval + 'с';
      $('qkdur').value = q.dur; $('qkdurv').textContent = q.dur + 'с';
      $('qkrocks').checked = q.rocks !== false;
    }
  }
}

// ---------- рендер карты ----------
function fitZoom() {
  if (!curEd() || curEd().isIndev) return;
  const w = curEd().cells[0].length;
  const availW = $('canvaswrap').clientWidth - 30;
  const top = $('canvaswrap').getBoundingClientRect().top;
  const availH = Math.max(240, window.innerHeight - top - 84);
  const csW = Math.floor(availW / w);
  const csH = Math.floor((availH - 14) / ROWS);
  zoom.cs = Math.max(10, Math.min(36, Math.min(csW, csH)));
  $('zoom-val').textContent = zoom.cs + 'px';
}
function draw() {
  const st = curEd();
  if (!st || st.isIndev) return;
  const w = st.cells[0].length;
  const cs = zoom.cs;
  const TOP = 14;
  const dpr = window.devicePixelRatio || 1;
  cv.width = (w * cs) * dpr;
  cv.height = (TOP + ROWS * cs) * dpr;
  cv.style.width = (w * cs) + 'px';
  cv.style.height = (TOP + ROWS * cs) + 'px';
  const x = cv.getContext('2d');
  x.setTransform(dpr, 0, 0, dpr, 0, 0);
  x.fillStyle = '#1c1c30'; x.fillRect(0, 0, w * cs, TOP + ROWS * cs);
  x.fillStyle = '#55557a'; x.font = '9px Arial'; x.textAlign = 'center';
  for (let c = 0; c < w; c += 5) x.fillText(c, c * cs + cs / 2, 10);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < w; c++) {
      const ch = st.cells[r][c];
      const px = c * cs, py = TOP + r * cs;
      if (ch === '#') { x.fillStyle = '#7a4a2b'; x.fillRect(px, py, cs, cs); x.fillStyle = '#4caf50'; x.fillRect(px, py, cs, Math.max(3, cs * .22)); }
      else if (ch === 'B') { x.fillStyle = '#9c4a2d'; x.fillRect(px, py, cs, cs); x.strokeStyle = '#5d2c1a'; x.lineWidth = 1; x.strokeRect(px + .5, py + .5, cs - 1, cs - 1); x.beginPath(); x.moveTo(px, py + cs / 2); x.lineTo(px + cs, py + cs / 2); x.stroke(); }
      else if (ch === '=') { x.fillStyle = '#b98a4a'; x.fillRect(px, py + cs * .2, cs, cs * .45); x.fillStyle = '#8a6234'; x.fillRect(px, py + cs * .5, cs, cs * .15); }
      else if (ch === '^') { x.fillStyle = '#b9b9c9'; for (let k = 0; k < 2; k++) { x.beginPath(); x.moveTo(px + k * cs / 2, py + cs); x.lineTo(px + k * cs / 2 + cs / 4, py + cs * .25); x.lineTo(px + (k + 1) * cs / 2, py + cs); x.closePath(); x.fill(); } }
      else if (ch === 'C') { x.fillStyle = '#c9a15a'; x.fillRect(px, py + cs * .25, cs, cs * .5); x.strokeStyle = '#8a6a34'; x.lineWidth = 1; x.beginPath(); x.moveTo(px + cs * .3, py + cs * .3); x.lineTo(px + cs * .6, py + cs * .7); x.moveTo(px + cs * .65, py + cs * .35); x.lineTo(px + cs * .45, py + cs * .6); x.stroke(); }
      else if (ch === 'L') { x.fillStyle = '#2b7fd4'; x.fillRect(px, py + cs * .2, cs, cs * .8); x.fillStyle = '#5fb0f0'; x.fillRect(px, py + cs * .2, cs, cs * .16); }
      else if (ch === 'v') { x.fillStyle = '#e63946'; x.fillRect(px + cs * .15, py + cs * .55, cs * .7, cs * .3); x.fillStyle = '#ffd23f'; x.fillRect(px + cs * .3, py + cs * .35, cs * .4, cs * .2); }
      else if (ch === 'S') { x.fillStyle = '#9aa0b5'; x.beginPath(); x.arc(px + cs / 2, py + cs / 2, cs * .38, 0, 7); x.fill(); x.strokeStyle = '#5d6275'; x.lineWidth = 2; for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + .6; x.beginPath(); x.moveTo(px + cs / 2 + Math.cos(a) * cs * .38, py + cs / 2 + Math.sin(a) * cs * .38); x.lineTo(px + cs / 2 + Math.cos(a) * cs * .5, py + cs / 2 + Math.sin(a) * cs * .5); x.stroke(); } }
      if (r === 11 && st.cells[r][c] === '.' && (st.cells[r - 1] && st.cells[r - 1][c]) !== '#') { x.fillStyle = '#22223a'; x.fillRect(px, py, cs, cs * 2 / 3); }
    }
  }
  x.strokeStyle = '#ffffff12'; x.lineWidth = 1;
  for (let c = 0; c <= w; c++) { x.beginPath(); x.moveTo(c * cs + .5, TOP); x.lineTo(c * cs + .5, TOP + ROWS * cs); x.stroke(); }
  for (let r = 0; r <= ROWS; r++) { x.beginPath(); x.moveTo(0, TOP + r * cs + .5); x.lineTo(w * cs, TOP + r * cs + .5); x.stroke(); }
  drawFactory(x, st.factory, cs, TOP);
  st.ents.forEach((e) => drawEnt(x, e, cs, TOP));
  drawSpawn(x, st.spawn, cs, TOP);
  if (hover) { x.strokeStyle = '#ffd23f'; x.lineWidth = 2; x.strokeRect(hover.c * cs + 1, TOP + hover.r * cs + 1, cs - 2, cs - 2); }
  $('cellinfo').textContent = hover ? `колонка ${hover.c}, ряд ${hover.r}` : '';
}
function imgFit(x, im, cx, bottomY, maxW, maxH) {
  if (!im.complete || !im.naturalWidth) return false;
  const k = Math.min(maxW / im.naturalWidth, maxH / im.naturalHeight);
  const dw = im.naturalWidth * k, dh = im.naturalHeight * k;
  x.drawImage(im, cx - dw / 2, bottomY - dh, dw, dh);
  return true;
}
function drawEnt(x, e, cs, TOP) {
  const cx = e.c * cs + cs / 2, by = TOP + (e.r + 1) * cs;
  // кастомный объект: своя текстура (или эмодзи-заглушка)
  if (e.t[0] === '@') {
    const o = CMS.objects.find((z) => z.id === e.t.slice(1));
    const im = OBJ_IMG[e.t.slice(1)];
    const box = Math.max(cs, cs * Math.min(2.2, Math.max(1, ((o && o.h) || 32) / 40))) * 1.05;
    if (im && !imgFit(x, im, cx, by, box, box)) { /* пока не загрузилась — рисуем эмодзи */ }
    if (!im || !im.complete || !im.naturalWidth) {
      x.font = Math.floor(cs * 0.72) + 'px Arial';
      x.textAlign = 'center';
      x.fillText((o && o.emoji) || '🧩', cx, by - cs * 0.22);
    }
    return;
  }
  const map = { e: 'burmaldenets', t: 'burmaldenets', G: 'boss', bottle: 'checkushka', heart: 'heart', plush: 'plush' };
  const spr = IMG[map[e.t]];   // неизвестный тип сущности не должен ломать весь редактор
  if (!spr || !imgFit(x, spr, cx, by, e.t === 'G' ? cs * 1.8 : cs * .95, e.t === 'G' ? cs * 1.9 : cs * .95)) {
    const col = { f: '#7ad0ff', j: '#8ee08a', a: '#c0c6d4' }[e.t] || (e.t === 'G' ? '#ffd23f' : '#e63946');
    x.fillStyle = col;
    x.beginPath(); x.arc(cx, by - cs / 2, cs * .3, 0, 7); x.fill();
  }
  if (e.t === 't') { x.fillStyle = '#fff'; x.font = 'bold 9px Arial'; x.textAlign = 'center'; x.fillText('T', cx, by - cs - 1); }
  if (e.t === 'f' || e.t === 'j' || e.t === 'a') { x.fillStyle = '#1a1a2e'; x.font = 'bold 9px Arial'; x.textAlign = 'center'; x.fillText(e.t.toUpperCase(), cx, by - cs * .65); }
}
function drawSpawn(x, c, cs, TOP) {
  const cx = c * cs + cs / 2, by = TOP + 11 * cs;
  imgFit(x, IMG.andrey, cx, by, cs, cs * 1.2);
  x.fillStyle = '#ffd23f'; x.font = 'bold 9px Arial'; x.textAlign = 'center';
  x.fillText('СТАРТ', cx, by - cs * 1.15);
}
function drawFactory(x, c, cs, TOP) {
  const cx = c * cs + cs / 2, by = TOP + 11 * cs;
  if (!imgFit(x, IMG.factory, cx, by, cs * 4, cs * 3.2)) {
    x.fillStyle = '#8f3b2d'; x.fillRect(c * cs, by - cs * 2, cs * 2, cs * 2);
  }
  x.fillStyle = '#9fe8a0'; x.font = 'bold 9px Arial'; x.textAlign = 'center';
  x.fillText('ЗАВОД', cx, by - cs * 3.1);
}

// ---------- ввод/инструменты ----------
let painting = false;
function cellAt(ev) {
  const rect = cv.getBoundingClientRect();
  const cs = zoom.cs, TOP = 14;
  const px = (ev.clientX - rect.left) * (cv.width / (window.devicePixelRatio || 1) / rect.width);
  const py = (ev.clientY - rect.top) * (cv.height / (window.devicePixelRatio || 1) / rect.height);
  const c = Math.floor(px / cs), r = Math.floor((py - TOP) / cs);
  const w = curEd().cells[0].length;
  if (c < 0 || c >= w || r < 0 || r >= ROWS) return null;
  return { c, r };
}
function pushUndo() {
  const st = curEd();
  st.undo.push(JSON.stringify({ cells: st.cells, ents: st.ents, spawn: st.spawn, factory: st.factory }));
  if (st.undo.length > 40) st.undo.shift();
}
function applyTool(c, r) {
  const st = curEd();
  const w = st.cells[0].length;
  const entAt = (cc, rr) => st.ents.find((e) => e.c === cc && e.r === rr);
  if (tool === 'ground') {
    if (r < 11) { toast('Земля — только нижние ряды 11–12. Выше ставь кирпич или платформу.'); return; }
    if (st.cells[r][c] !== '#') { st.cells[11][c] = '#'; st.cells[12][c] = '#'; st.dirty = true; }
  } else if (tool === 'B' || tool === '=' || tool === '^' || tool === 'C' || tool === 'L' || tool === 'v' || tool === 'S') {
    if (st.cells[r][c] !== tool) {
      if (r >= 11 && tool !== 'B' && tool !== 'L' && st.cells[r][c] === '#') { toast('Сначала сотри землю ластиком.'); return; }
      st.cells[r][c] = tool; st.dirty = true;
    }
  } else if (tool === 'erase') {
    const e = entAt(c, r);
    if (e) { st.ents.splice(st.ents.indexOf(e), 1); st.dirty = true; }
    if (st.cells[r][c] !== '.') {
      if (r >= 11 && st.cells[r][c] === '#') { st.cells[11][c] = '.'; st.cells[12][c] = '.'; }
      else st.cells[r][c] = '.';
      st.dirty = true;
    }
  } else if (tool === 'spawn') {
    if (st.cells[10][c] !== '.') { toast('Клетка старта занята тайлом — сотри его.'); return; }
    if (st.spawn !== c) { st.spawn = c; st.dirty = true; }
  } else if (tool === 'factory') {
    if (st.factory !== c) { st.factory = c; st.dirty = true; }
  } else {
    if (r >= 11) { toast('В землю сущности не ставятся.'); return; }
    const e = entAt(c, r);
    if (e && e.t === tool) return;
    if (e) st.ents.splice(st.ents.indexOf(e), 1);
    st.ents.push({ t: tool, c, r: tool === 'G' ? Math.min(r, 9) : r });
    st.dirty = true;
  }
  draw(); buildMapTabs(); saveDrafts(); setStatus();
}
cv.addEventListener('pointerdown', (ev) => {
  if (!curEd()) return;
  const p = cellAt(ev); if (!p) return;
  pushUndo();
  painting = true;
  cv.setPointerCapture(ev.pointerId);
  applyTool(p.c, p.r);
});
cv.addEventListener('pointermove', (ev) => {
  const p = cellAt(ev);
  hover = p;
  if (painting && p) applyTool(p.c, p.r); else draw();
});
window.addEventListener('pointerup', () => { painting = false; });
cv.addEventListener('pointerleave', () => { hover = null; draw(); });

document.querySelectorAll('.tool[data-tool]').forEach((b) => {
  b.onclick = () => {
    document.querySelectorAll('.tool[data-tool]').forEach((z) => z.classList.remove('active'));
    b.classList.add('active');
    tool = b.dataset.tool;
  };
});
document.querySelector('.tool[data-tool="ground"]').classList.add('active');
$('btn-undo').onclick = () => {
  const st = curEd();
  const snap = st.undo.pop();
  if (!snap) { toast('Отменять нечего'); return; }
  Object.assign(st, JSON.parse(snap));
  st.dirty = true; draw(); buildMapTabs(); saveDrafts(); setStatus();
};
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') { e.preventDefault(); $('btn-undo').click(); }
});
$('zoom-in').onclick = () => { zoom.cs = Math.min(40, zoom.cs + 4); $('zoom-val').textContent = zoom.cs + 'px'; draw(); };
$('zoom-out').onclick = () => { zoom.cs = Math.max(10, zoom.cs - 4); $('zoom-val').textContent = zoom.cs + 'px'; draw(); };
$('lvlname').addEventListener('input', () => { curEd().name = $('lvlname').value; curEd().dirty = true; buildMapTabs(); saveDrafts(); setStatus(); });
$('lvbg').addEventListener('change', () => { curEd().bg = $('lvbg').value; curEd().dirty = true; saveDrafts(); setStatus(); });
$('bosshp').addEventListener('input', () => {
  const ed = curEd(); if (!ed || ed.isIndev) return;
  const v = Math.max(1, Math.min(30, Math.round(+$('bosshp').value || 6)));
  if (ed.bossHp !== v) { ed.bossHp = v; ed.dirty = true; saveDrafts(); setStatus(); }
});
// —— пер-картное землетрясение ——
function qkApply() {
  const ed = curEd(); if (!ed || ed.isIndev) return;
  const on = $('lvquake').checked;
  ed.quake = on ? {
    on: true,
    power: +$('qkpow').value || 1,
    interval: Math.round(+$('qkint').value || 20),
    dur: +$('qkdur').value || 5,
    rocks: $('qkrocks').checked,
  } : null;
  ed.dirty = true; syncMapOpts(); saveDrafts(); setStatus();
}
$('lvquake').addEventListener('change', qkApply);
$('qkrocks').addEventListener('change', qkApply);
['qkpow', 'qkint', 'qkdur'].forEach((id) => $(id).addEventListener('input', () => {
  const ed = curEd(); if (!ed || ed.isIndev || !ed.quake) return;
  ed.quake.power = +$('qkpow').value || 1;
  ed.quake.interval = Math.round(+$('qkint').value || 20);
  ed.quake.dur = +$('qkdur').value || 5;
  $('qkpowv').textContent = ed.quake.power.toFixed(1);
  $('qkintv').textContent = ed.quake.interval + 'с';
  $('qkdurv').textContent = ed.quake.dur + 'с';
  ed.dirty = true; saveDrafts();
}));
$('btn-reset-level').onclick = resetMap;
$('btn-del-map').onclick = delMap;
$('btn-move-up').onclick = () => moveMap(-1);
$('btn-move-down').onclick = () => moveMap(1);
$('btn-indev-to-map').onclick = indevToMap;
$('btn-del-level').onclick = delMap;
$('indevname').addEventListener('input', () => {
  const m = CMS.maps[curMap];
  if (!m || !m.ed.isIndev) return;
  m.ed.name = $('indevname').value;
  m.ed.dirty = true;
  buildMapTabs(); saveDrafts(); setStatus();
});

function markDirty() { /* все dirty-флаги уже выставлены вызывающим кодом */ }

// ============================================================
// РЕЖИМ РАЗГОВОРЫ
// ============================================================
function buildDlgMapSelect() {
  const sel = $('dlg-map');
  sel.innerHTML = '';
  CMS.maps.forEach((m, i) => {
    if (m.ed.isIndev) return; // у экрана «В разработке» нет разговоров
    const o = document.createElement('option');
    o.value = i;
    o.textContent = `№${i + 2} ${m.ed.name || 'Карта'}`;
    sel.appendChild(o);
  });
  sel.value = String(curMap);
}
$('dlg-map').addEventListener('change', () => {
  curMap = Number($('dlg-map').value) || 0;
  syncMapOpts(); draw(); buildMapTabs();
  renderAllDialogs();
});

function dlgLineEditor(list, i, container, onChange) {
  const line = list[i];
  const div = document.createElement('div');
  div.className = 'line';
  const top = document.createElement('div');
  top.className = 'line-top';
  const sel = document.createElement('select');
  sel.className = 'who';
  // базовые персонажи + кастомные объекты с флагом «говорит в диалогах»
  const whos = WHO_LIST.concat(
    CMS.objects.filter((o) => o.character).map((o) => ['@' + o.id, (o.emoji || '🧩') + ' ' + o.name])
  );
  whos.forEach(([v, n]) => {
    const o = document.createElement('option'); o.value = v; o.textContent = n; sel.appendChild(o);
  });
  if (!whos.some(([v]) => v === (line.who || 'andrey'))) line.who = 'andrey';
  sel.value = line.who || 'andrey';
  sel.addEventListener('change', () => { line.who = sel.value; onChange(); });
  top.appendChild(sel);
  const up = document.createElement('button'); up.className = 'iconbtn'; up.textContent = '↑'; up.title = 'Выше';
  up.onclick = () => { if (i > 0) { [list[i - 1], list[i]] = [list[i], list[i - 1]]; onChange(true); } };
  const down = document.createElement('button'); down.className = 'iconbtn'; down.textContent = '↓'; down.title = 'Ниже';
  down.onclick = () => { if (i < list.length - 1) { [list[i + 1], list[i]] = [list[i], list[i + 1]]; onChange(true); } };
  const del = document.createElement('button'); del.className = 'iconbtn del'; del.textContent = '✕'; del.title = 'Удалить реплику';
  del.onclick = () => { list.splice(i, 1); onChange(true); };
  top.appendChild(up); top.appendChild(down); top.appendChild(del);
  div.appendChild(top);
  const ta = document.createElement('textarea');
  ta.value = line.text || '';
  ta.placeholder = 'Текст реплики…';
  ta.addEventListener('input', () => { line.text = ta.value; onChange(); });
  div.appendChild(ta);
  container.appendChild(div);
}
function renderList(containerId, list, onChange, isHint) {
  const box = $(containerId);
  box.innerHTML = '';
  list.forEach((_, i) => {
    if (isHint) {
      const h = list[i];
      const div = document.createElement('div');
      div.className = 'line';
      const top = document.createElement('div');
      top.className = 'line-top';
      const inp = document.createElement('input');
      inp.className = 'hintc'; inp.type = 'number'; inp.min = '0'; inp.value = h.c;
      inp.addEventListener('input', () => { h.c = Number(inp.value) || 0; onChange(); });
      const lbl = document.createElement('span');
      lbl.style.cssText = 'color:#8a8aa0;font-size:12px';
      lbl.textContent = 'колонка №';
      const del = document.createElement('button'); del.className = 'iconbtn del'; del.textContent = '✕';
      del.onclick = () => { list.splice(i, 1); onChange(true); };
      top.appendChild(lbl); top.appendChild(inp); top.appendChild(del);
      div.appendChild(top);
      const ta = document.createElement('textarea');
      ta.value = h.text || '';
      ta.addEventListener('input', () => { h.text = ta.value; onChange(); });
      div.appendChild(ta);
      box.appendChild(div);
      return;
    }
    dlgLineEditor(list, i, box, onChange);
  });
  if (!list.length) {
    const e = document.createElement('div');
    e.style.cssText = 'color:#55557a;font-size:12px;padding:2px 0 8px';
    e.textContent = 'Пока пусто — добавь реплику.';
    box.appendChild(e);
  }
}
function touchIntro() { introDirty = true; saveDrafts(); setStatus(); }
function touchMapDialogs() { curEd().dirty = true; saveDrafts(); setStatus(); buildMapTabs(); }
function renderAllDialogs() {
  renderList('dlg-intro', CMS.intro.cutscene, (rebuild) => { touchIntro(); if (rebuild) renderAllDialogs(); });
  renderList('dlg-outroBoss', CMS.intro.outroAfterBoss, (rebuild) => { touchIntro(); if (rebuild) renderAllDialogs(); });
  const m = CMS.maps[curMap];
  if (m && !m.ed.isIndev) {
    renderList('dlg-mapIntro', m.ed.dialogs.intro, (rebuild) => { touchMapDialogs(); if (rebuild) renderAllDialogs(); });
    renderList('dlg-mapOutro', m.ed.dialogs.outro, (rebuild) => { touchMapDialogs(); if (rebuild) renderAllDialogs(); });
    renderList('dlg-hints', m.ed.dialogs.hints, (rebuild) => { touchMapDialogs(); if (rebuild) renderAllDialogs(); }, true);
  }
}
document.querySelectorAll('.addline[data-add]').forEach((b) => {
  b.onclick = () => {
    const k = b.dataset.add;
    const blank = { who: 'andrey', text: '' };
    if (k === 'intro') { CMS.intro.cutscene.push(blank); touchIntro(); renderAllDialogs(); }
    else if (k === 'outroBoss') { CMS.intro.outroAfterBoss.push({ who: 'boss', text: '' }); touchIntro(); renderAllDialogs(); }
    else if (k === 'mapIntro') { curEd().dialogs.intro.push(blank); touchMapDialogs(); renderAllDialogs(); }
    else if (k === 'mapOutro') { curEd().dialogs.outro.push({ who: 'enemy', text: '' }); touchMapDialogs(); renderAllDialogs(); }
    else if (k === 'hints') { curEd().dialogs.hints.push({ c: 10, text: 'Новая подсказка' }); touchMapDialogs(); renderAllDialogs(); }
  };
});

// ============================================================
// РЕЖИМ ТЕКСТУРЫ
// ============================================================
async function uploadAsset(kind, name, base64) {
  try {
    const r = await fetch(API + '/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, name, data: base64 }) });
    const j = await r.json();
    if (!j.ok) { toast('Ошибка загрузки: ' + (j.error || r.status)); return null; }
    return j;
  } catch (e) { toast('Сервер недоступен: ' + e.message); return null; }
}
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split(',')[1]);
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
}
function renderTextures() {
  const grid = $('texgrid');
  grid.innerHTML = '';
  TEX_SLOTS.forEach(([key, title, size, note]) => {
    const custom = CMS.textures[key];
    const card = document.createElement('div');
    card.className = 'tex';
    const prev = document.createElement('div');
    prev.className = 'prev';
    const img = document.createElement('img');
    img.alt = title;
    img.src = custom ? custom.url : ('image/' + key + '.png');
    img.onerror = () => { img.style.visibility = 'hidden'; };
    prev.appendChild(img);
    card.appendChild(prev);
    const nm = document.createElement('div');
    nm.className = 'tname';
    nm.innerHTML = title + (custom ? '<span class="badge">СВОЯ</span>' : '');
    card.appendChild(nm);
    const inf = document.createElement('div');
    inf.className = 'tinfo';
    inf.textContent = `Слот ${size} • ${note}`;
    card.appendChild(inf);
    const row = document.createElement('div');
    row.className = 'trow';
    const up = document.createElement('button');
    up.className = 'addline'; up.textContent = '⬆ Загрузить'; up.style.flex = '1';
    up.onclick = () => pickTexture(key, title);
    row.appendChild(up);
    if (custom) {
      const rs = document.createElement('button');
      rs.className = 'iconbtn del'; rs.textContent = '↺'; rs.title = 'Вернуть официальную';
      rs.onclick = () => { delete CMS.textures[key]; texturesDirty = true; saveDrafts(); setStatus(); renderTextures(); };
      row.appendChild(rs);
    }
    card.appendChild(row);
    grid.appendChild(card);
  });
}
function pickTexture(key, title) {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = 'image/png,image/jpeg,image/webp,image/gif';
  inp.onchange = async () => {
    const f = inp.files && inp.files[0];
    if (!f) return;
    if (f.size > 4.2e6) { toast('Слишком большой файл (макс 4 МБ)'); return; }
    toast('Загружаю…');
    const b64 = await fileToBase64(f);
    const j = await uploadAsset('texture', f.name, b64);
    if (j) {
      CMS.textures[key] = { id: j.id, url: j.url };
      texturesDirty = true;
      saveDrafts(); setStatus(); renderTextures();
      toast(`${title}: загружено! Не забудь ОПУБЛИКОВАТЬ.`, true);
    }
  };
  inp.click();
}

// ============================================================
// РЕЖИМ ОБЪЕКТЫ: своя текстура + JS-скрипт = новый объект игры
// ============================================================
const OBJ_IMG = {}; // id -> Image (превью в редакторе карт)
function objLoadImg(o) {
  if (!o.tex) { delete OBJ_IMG[o.id]; return; }
  if (OBJ_IMG[o.id] && OBJ_IMG[o.id].src === o.tex) return;
  const im = new Image();
  im.onload = () => { if (mode === 'maps' || mode === 'objects') draw(); };
  im.src = o.tex;
  OBJ_IMG[o.id] = im;
}
function objTouch() { objectsDirty = true; saveDrafts(); setStatus(); }

function renderObjects() {
  const box = $('objlist');
  box.innerHTML = '';
  CMS.objects.forEach(objLoadImg);
  if (!CMS.objects.length) {
    const e = document.createElement('div');
    e.style.cssText = 'color:#55557a;font-size:12px;padding:4px 0 8px';
    e.textContent = 'Объектов пока нет. Создай свой: PNG + скрипт — и он появится в редакторе карт кнопкой.';
    box.appendChild(e);
  }
  CMS.objects.forEach((o) => {
    const card = document.createElement('div');
    card.className = 'objcard';

    // строка 1: превью + имя + эмодзи + размеры + удалить
    const r1 = document.createElement('div');
    r1.className = 'orow';
    const prev = document.createElement('div');
    prev.className = 'prev';
    const setPrev = () => {
      prev.innerHTML = '';
      if (o.tex) {
        const im = document.createElement('img');
        im.src = o.tex;
        im.onerror = () => { im.remove(); prev.innerHTML = '<span>' + (o.emoji || '🧩') + '</span>'; };
        prev.appendChild(im);
      } else prev.innerHTML = '<span>' + (o.emoji || '🧩') + '</span>';
    };
    setPrev();
    r1.appendChild(prev);
    const nm = document.createElement('input');
    nm.className = 'nm'; nm.value = o.name; nm.placeholder = 'Название';
    nm.maxLength = 30;
    nm.addEventListener('input', () => { o.name = nm.value; objTouch(); buildCustomTools(); });
    r1.appendChild(nm);
    const em = document.createElement('input');
    em.className = 'emoji'; em.value = o.emoji || '🧩'; em.title = 'Иконка-кнопка в редакторе';
    em.maxLength = 4;
    em.addEventListener('input', () => { o.emoji = em.value; objTouch(); setPrev(); buildCustomTools(); });
    r1.appendChild(em);
    const wl = document.createElement('span');
    wl.style.cssText = 'color:#8a8aa0;font-size:12px'; wl.textContent = 'размер';
    r1.appendChild(wl);
    const wi = document.createElement('input');
    wi.className = 'dim'; wi.type = 'number'; wi.min = '8'; wi.max = '400'; wi.value = o.w; wi.title = 'Ширина, px';
    wi.addEventListener('input', () => { o.w = Math.max(8, Math.min(400, Number(wi.value) || 32)); objTouch(); });
    const xi = document.createElement('span');
    xi.style.cssText = 'color:#8a8aa0'; xi.textContent = '×';
    const hi = document.createElement('input');
    hi.className = 'dim'; hi.type = 'number'; hi.min = '8'; hi.max = '400'; hi.value = o.h; hi.title = 'Высота, px';
    hi.addEventListener('input', () => { o.h = Math.max(8, Math.min(400, Number(hi.value) || 32)); objTouch(); });
    r1.appendChild(wi); r1.appendChild(xi); r1.appendChild(hi);
    const up = document.createElement('button');
    up.className = 'addline'; up.textContent = '⬆ PNG';
    up.onclick = () => pickObjectTexture(o, setPrev);
    r1.appendChild(up);
    const chk = document.createElement('label');
    chk.className = 'chk';
    const chb = document.createElement('input');
    chb.type = 'checkbox'; chb.checked = !!o.character;
    chb.addEventListener('change', () => { o.character = chb.checked; objTouch(); renderAllDialogs(); });
    chk.appendChild(chb);
    chk.appendChild(document.createTextNode('🗣 говорит в диалогах'));
    r1.appendChild(chk);
    const del = document.createElement('button');
    del.className = 'iconbtn del'; del.textContent = '✕'; del.title = 'Удалить объект';
    del.onclick = () => {
      const used = CMS.maps.filter((m) => m.ed && Array.isArray(m.ed.ents) && m.ed.ents.some((e) => e.t === '@' + o.id)).length;
      if (!confirm('Удалить объект «' + o.name + '»?' + (used ? `\nОн стоит на ${used} карте(ах) — с карт он тоже уберётся при публикации.` : ''))) return;
      CMS.objects.splice(CMS.objects.indexOf(o), 1);
      delete OBJ_IMG[o.id];
      objTouch();
      renderObjects(); buildCustomTools(); renderAllDialogs();
    };
    r1.appendChild(del);
    card.appendChild(r1);

    // строка 2: шаблон скрипта
    const r2 = document.createElement('div');
    r2.className = 'orow';
    const tplLbl = document.createElement('span');
    tplLbl.style.cssText = 'color:#8a8aa0;font-size:12px';
    tplLbl.textContent = 'Шаблон:';
    r2.appendChild(tplLbl);
    const tpl = document.createElement('select');
    Object.entries(OBJ_TEMPLATES).forEach(([k, t]) => {
      const opt = document.createElement('option');
      opt.value = k; opt.textContent = t.label;
      tpl.appendChild(opt);
    });
    const curTpl = Object.entries(OBJ_TEMPLATES).find(([, t]) => t.code === o.script);
    tpl.value = curTpl ? curTpl[0] : 'empty';
    const applyTpl = () => {
      o.script = OBJ_TEMPLATES[tpl.value].code;
      ta.value = o.script;
      objTouch();
    };
    tpl.addEventListener('change', applyTpl);
    r2.appendChild(tpl);
    card.appendChild(r2);

    // строка 3: код скрипта
    const ta = document.createElement('textarea');
    ta.className = 'script';
    ta.value = o.script || OBJ_TEMPLATES.collect.code;
    ta.spellcheck = false;
    ta.addEventListener('input', () => { o.script = ta.value; objTouch(); });
    card.appendChild(ta);

    // подсказка по API
    const note = document.createElement('div');
    note.className = 'apinote';
    note.innerHTML = 'Код выполняется каждый кадр: <b>obj</b> — объект (x, y, hp, t — время, data — свои переменные), <b>api</b> — игра, <b>dt</b> — секунды. Флаги: <b>obj.collect=1</b> подбор, <b>obj.dangerous=true</b> урон, <b>obj.stompable=true</b> убивается прыжком/плюшкой (плюс HP). <b>api.gravity(obj, dt)</b> — физика, <b>api.solid(obj)</b> — стена, <b>api.hurtPlayer/healPlayer/ammo/score/sfx/particles/shake</b>, <b>api.quake(сила, сек)</b> — землетрясение, <b>api.px/api.py</b> — игрок.';
    card.appendChild(note);

    box.appendChild(card);
  });
}

function pickObjectTexture(o, setPrev) {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = 'image/png,image/jpeg,image/webp,image/gif';
  inp.onchange = async () => {
    const f = inp.files && inp.files[0];
    if (!f) return;
    if (f.size > 4.2e6) { toast('Слишком большой файл (макс 4 МБ)'); return; }
    toast('Загружаю…');
    const b64 = await fileToBase64(f);
    const j = await uploadAsset('object', f.name, b64);
    if (j) {
      o.tex = j.url; o.texId = j.id;
      objTouch();
      renderObjects(); buildCustomTools();
      toast('Текстура загружена! Не забудь ОПУБЛИКОВАТЬ.', true);
    }
  };
  inp.click();
}

$('btn-obj-add').onclick = () => {
  const n = CMS.objects.length + 1;
  CMS.objects.push({
    id: 'obj-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    name: 'Объект ' + n, emoji: '🧩', w: 32, h: 32,
    tex: null, texId: null, script: OBJ_TEMPLATES.collect.code, character: false,
  });
  objTouch();
  renderObjects(); buildCustomTools();
  toast('Объект создан — загрузи PNG и выбери шаблон поведения', true);
};

// Кнопки кастомных объектов в тулбаре редактора карт (перед «отмена»)
function buildCustomTools() {
  const box = $('custom-tools');
  if (!box) return;
  box.innerHTML = '';
  CMS.objects.forEach((o) => {
    const b = document.createElement('button');
    b.className = 'tool';
    b.dataset.tool = '@' + o.id;
    b.title = o.name + ' — кастомный объект';
    b.innerHTML = `<b>${o.emoji || '🧩'}</b>${(o.name || '').slice(0, 10)}`;
    b.onclick = () => {
      document.querySelectorAll('.tool[data-tool]').forEach((z) => z.classList.remove('active'));
      b.classList.add('active');
      tool = '@' + o.id;
    };
    box.appendChild(b);
  });
}

// ============================================================
// РЕЖИМ МУЗЫКА
// ============================================================
function renderMusic() {
  const box = $('tracks');
  box.innerHTML = '';
  if (!CMS.music.tracks.length) {
    const e = document.createElement('div');
    e.style.cssText = 'color:#55557a;font-size:12px;padding:4px 0';
    e.textContent = 'Треков пока нет. Загрузи MP3 — он станет фоновой музыкой для всех игроков.';
    box.appendChild(e);
  }
  CMS.music.tracks.forEach((tr, i) => {
    const row = document.createElement('div');
    row.className = 'track' + (CMS.music.active === tr.id ? ' active' : '');
    const nm = document.createElement('div');
    nm.className = 'tname';
    nm.textContent = tr.name;
    row.appendChild(nm);
    if (CMS.music.active === tr.id) {
      const tag = document.createElement('span');
      tag.className = 'tagok';
      tag.textContent = 'ИГРАЕТ У ВСЕХ';
      row.appendChild(tag);
    }
    const use = document.createElement('button');
    use.className = 'act';
    use.textContent = CMS.music.active === tr.id ? '▶ Сейчас играет' : 'Сделать фоновой';
    if (CMS.music.active === tr.id) use.style.opacity = .6;
    use.onclick = () => {
      CMS.music.active = (CMS.music.active === tr.id) ? null : tr.id;
      musicDirty = true;
      saveDrafts(); setStatus(); renderMusic();
    };
    row.appendChild(use);
    const del = document.createElement('button');
    del.className = 'iconbtn del'; del.textContent = '✕'; del.title = 'Убрать из списка';
    del.onclick = () => {
      if (CMS.music.active === tr.id) { CMS.music.active = null; musicDirty = true; }
      CMS.music.tracks.splice(i, 1);
      musicDirty = true;
      saveDrafts(); setStatus(); renderMusic();
    };
    row.appendChild(del);
    box.appendChild(row);
  });
}
$('btn-mus-add').onclick = () => $('musfile').click();
$('musfile').addEventListener('change', async () => {
  const f = $('musfile').files && $('musfile').files[0];
  $('musfile').value = '';
  if (!f) return;
  if (f.size > 12e6) { toast('Слишком большой файл (макс 10 МБ)'); return; }
  toast('Загружаю трек…');
  const b64 = await fileToBase64(f);
  const j = await uploadAsset('music', f.name, b64);
  if (j) {
    CMS.music.tracks.push({ id: j.id, name: f.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 40) || 'Трек', url: j.url });
    CMS.music.active = j.id;
    musicDirty = true;
    saveDrafts(); setStatus(); renderMusic();
    toast('Трек загружен! Нажми ОПУБЛИКОВАТЬ, чтобы включить у всех.', true);
  }
});

// ============================================================
// РЕЖИМ КАНАЛЫ
// ============================================================
function renderSocials() {
  const box = $('soclist');
  box.innerHTML = '';
  CMS.socials.forEach((s, i) => {
    const row = document.createElement('div');
    row.className = 'soc';
    const nm = document.createElement('input');
    nm.className = 'name'; nm.value = s.name; nm.placeholder = 'Название';
    nm.addEventListener('input', () => { s.name = nm.value; socialsDirty = true; saveDrafts(); setStatus(); });
    const cls = document.createElement('select');
    SOC_PRESETS.forEach(([v, n]) => {
      const o = document.createElement('option'); o.value = v; o.textContent = n; cls.appendChild(o);
    });
    cls.value = s.class || 'tg';
    cls.addEventListener('change', () => { s.class = cls.value; socialsDirty = true; saveDrafts(); setStatus(); });
    const url = document.createElement('input');
    url.className = 'url'; url.value = s.url; url.placeholder = 'https://t.me/твой_канал';
    url.addEventListener('input', () => { s.url = url.value; socialsDirty = true; saveDrafts(); setStatus(); });
    const del = document.createElement('button');
    del.className = 'iconbtn del'; del.textContent = '✕'; del.title = 'Удалить канал';
    del.onclick = () => { CMS.socials.splice(i, 1); socialsDirty = true; saveDrafts(); setStatus(); renderSocials(); };
    row.appendChild(nm); row.appendChild(cls); row.appendChild(url); row.appendChild(del);
    box.appendChild(row);
  });
  if (!CMS.socials.length) {
    const e = document.createElement('div');
    e.style.cssText = 'color:#55557a;font-size:12px;padding:4px 0 10px';
    e.textContent = 'Каналов нет — на финальном экране не будет кнопок.';
    box.appendChild(e);
  }
}
$('btn-soc-add').onclick = () => {
  CMS.socials.push({ name: 'Telegram', class: 'tg', url: '' });
  socialsDirty = true;
  saveDrafts(); setStatus(); renderSocials();
};

// ============================================================
// ПЕРЕКЛЮЧЕНИЕ РЕЖИМОВ
// ============================================================
document.querySelectorAll('#modes button').forEach((b) => {
  b.onclick = () => {
    document.querySelectorAll('#modes button').forEach((z) => z.classList.remove('active'));
    b.classList.add('active');
    mode = b.dataset.mode;
    document.querySelectorAll('.pane').forEach((p) => p.classList.remove('active'));
    $('pane-' + mode).classList.add('active');
    if (mode === 'maps') { fitZoom(); draw(); }
    if (mode === 'dialogs') { buildDlgMapSelect(); renderAllDialogs(); }
    if (mode === 'textures') renderTextures();
    if (mode === 'objects') renderObjects();
    if (mode === 'music') renderMusic();
    if (mode === 'socials') renderSocials();
    if (mode === 'quake') renderQuake();
  };
});

// ============================================================
// ПУБЛИКАЦИЯ / ЭКСПОРТ / СБРОС
// ============================================================
function buildPayload() {
  return {
    v: 4, // маркер формата: список карт + кастомные объекты (скриптуемые)
    maps: CMS.maps.map((m) => ({ key: m.key, def: stateToDef(m) })),
    intro: { cutscene: CMS.intro.cutscene, outroAfterBoss: CMS.intro.outroAfterBoss },
    textures: CMS.textures,
    music: { active: CMS.music.active, tracks: CMS.music.tracks },
    socials: CMS.socials,
    objects: CMS.objects,
    quake: CMS.quake,
  };
}
async function publish() {
  for (const m of CMS.maps) {
    const err = validateMap(m);
    if (err) { toast(`Карта №${m.id}: ${err}`); curMap = CMS.maps.indexOf(m); switchMode('maps'); syncMapOpts(); draw(); buildMapTabs(); return null; }
  }
  try {
    const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(buildPayload()) });
    const j = await r.json();
    if (!j.ok) { toast('Ошибка публикации: ' + (j.error || r.status)); return null; }
    CMS.maps.forEach((m) => { m.ed.dirty = false; });
    introDirty = socialsDirty = texturesDirty = musicDirty = mapsListDirty = objectsDirty = quakeDirty = false;
    pubAt = j.updatedAt || Date.now();
    saveDrafts();
    setStatus();
    buildMapTabs();
    return j;
  } catch (e) { toast('Сервер недоступен: ' + e.message); return null; }
}
$('btn-publish').onclick = async () => { if (await publish()) toast('Опубликовано! Все игроки получат новый контент.', true); };
$('btn-test').onclick = async () => { if (await publish()) { toast('Опубликовано, открываю игру…', true); setTimeout(() => window.open('/game/index.html', '_blank'), 400); } };
$('btn-export').onclick = () => {
  const blob = new Blob([JSON.stringify(buildPayload())], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'game-cms.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  toast('game-cms.json скачан — положи рядом с index.html для статичного хостинга', true);
};
$('btn-reset-all').onclick = async () => {
  if (!confirm('Убрать ВСЕ опубликованные правки (карты, текстуры, музыку, каналы) и вернуть официальные?')) return;
  try { await fetch(API, { method: 'DELETE' }); } catch (e) { toast('Сервер недоступен'); return; }
  try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
  location.reload();
};

function anyDirty() {
  return introDirty || socialsDirty || texturesDirty || musicDirty || mapsListDirty || objectsDirty || quakeDirty || CMS.maps.some((m) => m.ed.dirty);
}
function setStatus() {
  const el = $('status');
  if (anyDirty()) {
    el.textContent = '⚠ Есть НЕОПУБЛИКОВАННЫЕ правки — черновик сохранён в браузере, но игроки его пока не видят. Нажми «ОПУБЛИКОВАТЬ».';
    el.classList.remove('none'); el.classList.add('dirty');
  } else if (pubAt) {
    el.textContent = 'Опубликовано: ' + new Date(pubAt).toLocaleString('ru') + ' — игроки получают контент с сервера';
    el.classList.remove('none', 'dirty');
  } else {
    el.textContent = 'Публикаций нет — у всех игроков официальный контент';
    el.classList.add('none'); el.classList.remove('dirty');
  }
}
function switchMode(m) {
  const b = document.querySelector(`#modes button[data-mode="${m}"]`);
  if (b) b.click();
}

// ============================================================
// ЗЕМЛЕТРЯСЕНИЯ (настройки автотолчков)
// ============================================================
function renderQuake() {
  const q = CMS.quake || (CMS.quake = Object.assign({}, DEFAULT_QUAKE));
  const en = $('qk-enabled'), pr = $('qk-prologue'), rk = $('qk-rocks');
  const pw = $('qk-power'), iv = $('qk-interval'), du = $('qk-dur');
  en.checked = q.enabled !== false;
  pr.checked = !!q.prologue;
  rk.checked = q.rocks !== false;
  pw.value = q.power; iv.value = q.interval; du.value = q.dur;
  const vals = () => {
    $('qk-power-val').textContent = Number(pw.value).toFixed(1) + '×';
    $('qk-interval-val').textContent = iv.value + ' сек';
    $('qk-dur-val').textContent = du.value + ' сек';
  };
  vals();
  if (!en.dataset.bound) {
    en.dataset.bound = '1'; pr.dataset.bound = '1'; rk.dataset.bound = '1';
    pw.dataset.bound = '1'; iv.dataset.bound = '1'; du.dataset.bound = '1';
    en.onchange = () => { q.enabled = en.checked; quakeDirty = true; saveDrafts(); setStatus(); };
    pr.onchange = () => { q.prologue = pr.checked; quakeDirty = true; saveDrafts(); setStatus(); };
    rk.onchange = () => { q.rocks = rk.checked; quakeDirty = true; saveDrafts(); setStatus(); };
    pw.oninput = () => { q.power = +pw.value; vals(); quakeDirty = true; saveDrafts(); setStatus(); };
    iv.oninput = () => { q.interval = +iv.value; vals(); quakeDirty = true; saveDrafts(); setStatus(); };
    du.oninput = () => { q.dur = +du.value; vals(); quakeDirty = true; saveDrafts(); setStatus(); };
  }
}

// ============================================================
// ЗАГРУЗКА
// ============================================================
function officialMapsToCms() {
  MAP_LEVELS.forEach((d, i) => {
    CMS.maps.push({ key: 'map-' + (i + 1), id: d.id || (i + 2), def: JSON.parse(JSON.stringify(d)), ed: defToState(d) });
  });
  const iv = officialIndev();
  if (iv) CMS.maps.push(iv); // экран «В разработке» тоже редактируется/удаляется
  CMS.intro = {
    cutscene: (DIALOGUES.intro || []).map((l) => ({ who: l.who, text: l.text })),
    outroAfterBoss: (DIALOGUES.outroAfterBoss || []).map((l) => ({ who: l.who, text: l.text })),
  };
  CMS.socials = (CONFIG.SOCIALS || []).map((s) => ({ name: s.name, class: s.class || 'tg', url: s.url || '#' }));
}
function serverMapsToCms(j) {
  const newList = j.v >= 3; // маркер публикации новой панели — список карт уже управляет экраном «В разработке»
  if (Array.isArray(j.maps) && j.maps.length) {
    CMS.maps = j.maps.filter((m) => m && m.def).map((m) => {
      if (m.def.type === 'indev') return { key: m.key || 'indev', id: m.def.id || 6, def: m.def, ed: indevState(m.def.name, false) };
      return { key: m.key, id: m.def.id || 2, def: m.def, ed: defToState(m.def) };
    });
    if (!newList && !CMS.maps.some((m) => m.ed.isIndev)) {
      const iv = officialIndev();
      if (iv) CMS.maps.push(iv); // старая публикация — добавляем официальный экран
    }
  } else if (j.levels && typeof j.levels === 'object') {
    // миграция со старого формата levels:{idx:def}
    CMS.maps = [];
    Object.keys(j.levels).map(Number).sort((a, b) => a - b).forEach((k) => {
      const def = j.levels[k];
      if (def && def.type === 'map') CMS.maps.push({ key: 'map-' + k, id: def.id || (k + 2), def, ed: defToState(def) });
    });
    if (!CMS.maps.length) officialMapsToCms();
    else { const iv = officialIndev(); if (iv) CMS.maps.push(iv); }
  } else {
    officialMapsToCms();
  }
  if (j.intro && Array.isArray(j.intro.cutscene)) {
    CMS.intro = {
      cutscene: j.intro.cutscene,
      outroAfterBoss: Array.isArray(j.intro.outroAfterBoss) ? j.intro.outroAfterBoss : [],
    };
  }
  if (j.textures && typeof j.textures === 'object') CMS.textures = j.textures;
  if (j.music && typeof j.music === 'object') CMS.music = { active: j.music.active || null, tracks: j.music.tracks || [] };
  if (Array.isArray(j.socials)) CMS.socials = j.socials;
  if (Array.isArray(j.objects)) CMS.objects = j.objects;
  if (j.quake && typeof j.quake === 'object') CMS.quake = Object.assign({}, DEFAULT_QUAKE, j.quake);
}
async function boot() {
  let j = null;
  try { const r = await fetch(API, { cache: 'no-store' }); j = await r.json(); if (!j || !j.ok) j = null; } catch (e) { /* нет API */ }
  if (j) serverMapsToCms(j);
  else officialMapsToCms();
  // черновик браузера применяем, только если он не старше публикации с сервера
  const dr = loadDrafts();
  let applied = false, hadDirty = false;
  if (dr && (!dr.officialRev || dr.officialRev !== OFFICIAL_REV)) {
    // Черновик сделан ДО обновления официальных уровней: его список карт устарел
    // (затирал бы новые официальные 65 уровней). Карты отбрасываем, остальное
    // (текстуры/музыка/объекты/диалоги/соцсети/землетрясения) сохраняем.
    const trimmed = Object.assign({}, dr, { maps: [], listV: 3, officialRev: OFFICIAL_REV, savedAt: Date.now() });
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(trimmed)); } catch (e) {}
    applied = applyDrafts(trimmed);
    setTimeout(() => toast('Черновик карт от старой версии игры отброшен — загружены официальные уровни (' + MAP_LEVELS.length + ')', true), 500);
  } else if (dr) {
    const pubTs = (j && j.updatedAt) ? (new Date(j.updatedAt).getTime() || 0) : 0;
    if (!pubTs || (dr.savedAt || 0) >= pubTs) {
      applied = applyDrafts(dr);
      hadDirty = applied && anyDirty();
    } else {
      try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
      setTimeout(() => toast('На сервере публикация новее — старый черновик отброшен', true), 600);
    }
  }
  pubAt = (j && j.updatedAt) || null;
  setStatus();
  const rb = document.getElementById('rev-badge');
  if (rb) rb.textContent = 'уровней: ' + MAP_LEVELS.length + ' • ревизия ' + OFFICIAL_REV;
  fitZoom(); buildMapTabs(); buildCustomTools(); syncMapOpts(); draw();
  buildDlgMapSelect(); renderAllDialogs(); renderTextures(); renderObjects(); renderMusic(); renderSocials(); renderQuake();
  if (hadDirty) toast('Черновик восстановлен — есть НЕОПУБЛИКОВАННЫЕ правки', true);
  else if (applied) toast('Черновик восстановлен из браузера', true);
  if (j && j.updatedAt) toast('Загружено ОПУБЛИКОВАННОЕ (редактируешь его)', true);
  if (!j) setTimeout(() => toast('Сервер недоступен — правки только как черновик/экспорт', false), 800);
  // отладочный хук (E2E)
  window.ADMIN = {
    get CMS() { return CMS; },
    get curMap() { return curMap; },
    paint: (c, r, t) => { tool = t; applyTool(c, r); },
    addMap, stateToDef, publish, buildPayload, switchMode, moveMap, indevToMap,
    renderAll: { textures: renderTextures, music: renderMusic, socials: renderSocials, dialogs: renderAllDialogs, objects: renderObjects, quake: renderQuake },
    buildCustomTools,
    get dirty() { return anyDirty(); },
  };
}
window.addEventListener('resize', () => { if (mode === 'maps') { fitZoom(); draw(); } });
boot();
