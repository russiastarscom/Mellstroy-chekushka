import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// ============================================================
// ВРЕМЕННЫЙ АДМИН-МОДУЛЬ ИГРЫ v2: загрузка ассетов (PNG-текстуры, музыка).
// POST JSON { kind: 'texture'|'music', name, data } — data = base64 без префикса.
// Убирается вместе с /game/admin.html по команде владельца.
// ============================================================

export const dynamic = 'force-dynamic';

const ASSET_DIR = path.join(process.cwd(), 'data', 'game-assets');

const MIMES: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
  mp3: 'audio/mpeg', ogg: 'audio/ogg', oga: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac',
};
const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'webp', 'gif'];
const AUDIO_EXT = ['mp3', 'ogg', 'oga', 'wav', 'm4a', 'aac'];

function mkId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { kind?: string; name?: string; data?: string };
    const kind = body.kind === 'music' ? 'music' : 'texture';
    const raw = String(body.data || '');
    if (!raw || raw.length > 15_000_000) {
      return NextResponse.json({ ok: false, error: 'Файл пустой или слишком большой (макс ~10 МБ)' }, { status: 400 });
    }
    const buf = Buffer.from(raw, 'base64');
    if (!buf.length) return NextResponse.json({ ok: false, error: 'Пустой файл' }, { status: 400 });

    const srcName = String(body.name || (kind === 'music' ? 'track' : 'texture'));
    let ext = (srcName.includes('.') ? srcName.split('.').pop()! : '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const allowed = kind === 'music' ? AUDIO_EXT : IMAGE_EXT;
    if (!allowed.includes(ext)) {
      // пробуем угадать по сигнатуре
      if (kind === 'texture' && buf[0] === 0x89 && buf[1] === 0x50) ext = 'png';
      else if (kind === 'music' && buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) ext = 'mp3';
      else return NextResponse.json({ ok: false, error: `Неверный формат. Разрешено: ${allowed.join(', ')}` }, { status: 400 });
    }
    const limit = kind === 'music' ? 12_000_000 : 4_000_000;
    if (buf.length > limit) return NextResponse.json({ ok: false, error: `Слишком большой файл (макс ${Math.round(limit / 1e6)} МБ)` }, { status: 400 });

    fs.mkdirSync(ASSET_DIR, { recursive: true });
    const id = mkId();
    fs.writeFileSync(path.join(ASSET_DIR, `${id}.${ext}`), buf);
    return NextResponse.json(
      { ok: true, id, url: `/api/game-cms/file/${id}.${ext}`, mime: MIMES[ext], size: buf.length },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 400 });
  }
}
