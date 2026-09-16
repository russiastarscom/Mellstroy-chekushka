import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// ============================================================
// ВРЕМЕННЫЙ АДМИН-МОДУЛЬ ИГРЫ v2 (CMS: карты, текстуры, музыка, каналы).
// Убирается вместе с /game/admin.html и блоком ADMIN CMS OVERRIDE
// в public/game/js/main.js по команде владельца.
// Хранит всё в data/game-cms.json, файлы ассетов в data/game-assets/.
// КАЖДАЯ публикация автоматически коммитится в git (data/ раньше
// терялась при перезапуске окружения — теперь переживает ребут).
// ============================================================

export const dynamic = 'force-dynamic';

const FILE = path.join(process.cwd(), 'data', 'game-cms.json');
const OLD_MAPS = path.join(process.cwd(), 'data', 'game-maps-override.json');
const ASSET_DIR = path.join(process.cwd(), 'data', 'game-assets');

// Персистентность: фиксируем data/ в git, чтобы публикации выживали
// при пересборке окружения. Любая ошибка git не ломает публикацию.
function gitPersist(what: string) {
  try {
    execSync('git add -A data', { cwd: process.cwd(), stdio: 'ignore', timeout: 10000 });
    execSync('git -c user.name=cms-bot -c user.email=cms@local commit -m "cms-persist: ' + what + '" --no-verify', { cwd: process.cwd(), stdio: 'ignore', timeout: 10000 });
  } catch { /* git недоступен/нечего коммитить — не критично */ }
}

const TEXTURE_KEYS = ['andrey', 'burmaldenets', 'boss', 'checkushka', 'factory', 'tomahawk', 'heart', 'plush', 'bg_fields', 'bg_city', 'bg_district', 'bg_plant'];

type TextureRef = { id: string; url: string };
type Track = { id: string; name: string; url: string };
type Social = { name: string; class: string; url: string };
// Кастомный объект: своя текстура + JS-скрипт поведения (Task 17)
type CustomObject = {
  id: string; name: string; emoji: string;
  w: number; h: number;
  tex: string | null;       // URL текстуры (или null — цветная заглушка)
  script: string;           // JS-код, исполняется каждый кадр
  character: boolean;       // можно выбирать говорящим в диалогах
};
type Cms = {
  levels: Record<string, unknown> | null;
  v: number | null;
  maps: { key: string; def: Record<string, unknown> }[] | null;
  intro: { cutscene: unknown[]; outroAfterBoss: unknown[] } | null;
  textures: Record<string, TextureRef> | null;
  music: { active: string | null; tracks: Track[] } | null;
  socials: Social[] | null;
  objects: CustomObject[] | null;
  updatedAt: string;
};

function emptyCms(): Omit<Cms, 'updatedAt'> {
  return { levels: null, v: null, maps: null, intro: null, textures: null, music: null, socials: null, objects: null };
}

function readCms(): Omit<Cms, 'updatedAt'> & { updatedAt: string | null } {
  // Миграция: если нового файла ещё нет, но старый game-maps-override.json есть — используем его уровни
  try {
    const cms = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return { ...emptyCms(), ...cms };
  } catch { /* нет файла */ }
  const base = emptyCms();
  try {
    const old = JSON.parse(fs.readFileSync(OLD_MAPS, 'utf8'));
    if (old && old.levels) base.levels = old.levels;
  } catch { /* нет старого */ }
  return base;
}

function validateMaps(maps: unknown): string | null {
  if (!Array.isArray(maps)) return 'maps must be an array';
  if (maps.length > 40) return 'too many maps (max 40)';
  for (const m of maps) {
    if (!m || typeof m !== 'object') return 'map: not an object';
    const { key, def } = m as { key: unknown; def: unknown };
    if (typeof key !== 'string' || !/^[\w-]{1,40}$/.test(key)) return `bad map key "${key}"`;
    if (!def || typeof def !== 'object') return `map ${key}: bad def`;
    const dtype = (def as { type?: string }).type;
    // экран «В разработке» — уровень-заглушка без террейна
    if (dtype === 'indev') {
      const d = def as Record<string, unknown>;
      if (typeof d.name !== 'string' || !(d.name as string).trim()) return `map ${key}: indev needs a name`;
      continue;
    }
    if (dtype !== 'map') return `map ${key}: type must be "map" or "indev"`;
    const d = def as Record<string, unknown>;
    const w = d.width;
    if (typeof w !== 'number' || w < 20 || w > 600) return `map ${key}: width 20..600`;
    for (const field of ['ground', 'bricks', 'plats', 'spikes', 'hearts', 'plushes', 'enemies', 'hints']) {
      if (d[field] !== undefined && !Array.isArray(d[field])) return `map ${key}: ${field} must be an array`;
    }
    const b = d.bottles as Record<string, unknown> | undefined;
    if (b !== undefined && (typeof b !== 'object' || b === null)) return `map ${key}: bottles must be an object`;
  }
  return null;
}

function validateCms(body: Record<string, unknown>): string | null {
  if (body.maps !== undefined && body.maps !== null) {
    const err = validateMaps(body.maps);
    if (err) return err;
  }
  if (body.textures !== undefined && body.textures !== null) {
    const t = body.textures as Record<string, unknown>;
    if (typeof t !== 'object' || Array.isArray(t)) return 'textures must be an object';
    for (const [k, v] of Object.entries(t)) {
      if (!TEXTURE_KEYS.includes(k)) return `unknown texture slot "${k}"`;
      if (!v || typeof v !== 'object') return `texture ${k}: bad ref`;
      const r = v as { id?: unknown; url?: unknown };
      if (typeof r.id !== 'string' || typeof r.url !== 'string') return `texture ${k}: need {id,url}`;
    }
  }
  if (body.music !== undefined && body.music !== null) {
    const m = body.music as Record<string, unknown>;
    if (typeof m !== 'object') return 'music must be an object';
    if (!Array.isArray(m.tracks)) return 'music.tracks must be an array';
    if (m.tracks.length > 30) return 'too many tracks (max 30)';
    for (const tr of m.tracks) {
      const t = tr as Record<string, unknown>;
      if (!t || typeof t.id !== 'string' || typeof t.name !== 'string' || typeof t.url !== 'string') return 'music track: need {id,name,url}';
    }
  }
  if (body.socials !== undefined && body.socials !== null) {
    if (!Array.isArray(body.socials)) return 'socials must be an array';
    if ((body.socials as unknown[]).length > 12) return 'too many socials (max 12)';
    for (const s of body.socials) {
      const o = s as Record<string, unknown>;
      if (!o || typeof o.name !== 'string' || typeof o.url !== 'string') return 'social: need {name,url}';
    }
  }
  if (body.intro !== undefined && body.intro !== null) {
    const i = body.intro as Record<string, unknown>;
    if (typeof i !== 'object') return 'intro must be an object';
    if (i.cutscene !== undefined && !Array.isArray(i.cutscene)) return 'intro.cutscene must be an array';
    if (i.outroAfterBoss !== undefined && !Array.isArray(i.outroAfterBoss)) return 'intro.outroAfterBoss must be an array';
    if (Array.isArray(i.cutscene) && i.cutscene.length > 60) return 'intro.cutscene: too many lines';
  }
  if (body.objects !== undefined && body.objects !== null) {
    if (!Array.isArray(body.objects)) return 'objects must be an array';
    if ((body.objects as unknown[]).length > 40) return 'too many objects (max 40)';
    const ids = new Set<string>();
    for (const o of body.objects as Record<string, unknown>[]) {
      if (!o || typeof o !== 'object') return 'object: not an object';
      if (typeof o.id !== 'string' || !/^obj-[\w-]{1,40}$/.test(o.id)) return `object: bad id "${o.id}"`;
      if (ids.has(o.id)) return `object: duplicate id "${o.id}"`;
      ids.add(o.id);
      if (typeof o.name !== 'string' || !o.name.trim() || o.name.length > 30) return `object ${o.id}: name 1..30`;
      if (typeof o.emoji !== 'string' || o.emoji.length > 8) return `object ${o.id}: emoji too long`;
      if (typeof o.w !== 'number' || o.w < 8 || o.w > 400) return `object ${o.id}: width 8..400`;
      if (typeof o.h !== 'number' || o.h < 8 || o.h > 400) return `object ${o.id}: height 8..400`;
      if (o.tex !== null && typeof o.tex !== 'string') return `object ${o.id}: bad tex`;
      if (typeof o.script !== 'string') return `object ${o.id}: bad script`;
      if (o.script.length > 30000) return `object ${o.id}: script too long (max 30000)`;
      if (typeof o.character !== 'boolean') return `object ${o.id}: bad character flag`;
    }
  }
  return null;
}

export async function GET() {
  const cms = readCms();
  return NextResponse.json(
    { ok: true, ...cms },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const err = validateCms(body);
    if (err) return NextResponse.json({ ok: false, error: err }, { status: 400 });
    const cur = readCms();
    const next = { ...emptyCms(), ...cur };
    // маркер формата панели (список карт управляет экраном «В разработке» и порядком уровней)
    if (typeof body.v === 'number') next.v = body.v;
    // maps — новый формат списка карт (заменяет старое levels)
    if (body.maps !== undefined) next.maps = (body.maps as Cms['maps']) || null;
    if (body.levels !== undefined && body.maps === undefined) next.levels = (body.levels as Cms['levels']) || null;
    if (body.intro !== undefined) next.intro = (body.intro as Cms['intro']) || null;
    if (body.textures !== undefined) next.textures = (body.textures as Cms['textures']) || null;
    if (body.music !== undefined) next.music = (body.music as Cms['music']) || null;
    if (body.socials !== undefined) next.socials = (body.socials as Cms['socials']) || null;
    if (body.objects !== undefined) next.objects = (body.objects as Cms['objects']) || null;
    const payload = { ...next, updatedAt: new Date().toISOString() };
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(payload));
    gitPersist('publish ' + payload.updatedAt);
    return NextResponse.json({ ok: true, updatedAt: payload.updatedAt }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 400 });
  }
}

export async function DELETE() {
  try { fs.rmSync(FILE, { force: true }); } catch { /* ок */ }
  try { fs.rmSync(OLD_MAPS, { force: true }); } catch { /* ок */ }
  try {
    fs.mkdirSync(ASSET_DIR, { recursive: true });
    for (const f of fs.readdirSync(ASSET_DIR)) {
      if (/^[\w-]+\.[\w]+$/.test(f)) fs.rmSync(path.join(ASSET_DIR, f), { force: true });
    }
  } catch { /* ок */ }
  gitPersist('reset-all');
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
