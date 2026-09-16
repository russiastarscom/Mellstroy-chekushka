import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// ============================================================
// ВРЕМЕННЫЙ АДМИН-МОДУЛЬ ИГРЫ: загрузка ассетов (base64 → data/game-assets/).
// Виды: texture (≤4 МБ), music (≤10 МБ), object (текстура объекта, ≤4 МБ).
// Убирается вместе с /game/admin.html по команде владельца.
// ============================================================

export const dynamic = 'force-dynamic';

const ASSET_DIR = path.join(process.cwd(), 'data', 'game-assets');

const LIMITS: Record<string, number> = { texture: 4.2e6, object: 4.2e6, music: 12e6 };

// угадываем расширение по сигнатуре файла
function sniff(b64: string): string | null {
  const bin = Buffer.from(b64, 'base64');
  const h = bin.subarray(0, 12);
  if (h[0] === 0x89 && h[1] === 0x50) return 'png';
  if (h[0] === 0xff && h[1] === 0xd8) return 'jpg';
  if (h[0] === 0x47 && h[1] === 0x49) return 'gif';
  if (h[8] === 0x57 && h[9] === 0x45 && h[10] === 0x42 && h[11] === 0x50) return 'webp';
  if (h[0] === 0x49 && h[1] === 0x44 && h[2] === 0x33) return 'mp3';
  if (h[0] === 0xff && (h[1] & 0xe0) === 0xe0) return 'mp3';
  if (h[0] === 0x4f && h[1] === 0x67 && h[2] === 0x67) return 'ogg';
  if (h[0] === 0x52 && h[1] === 0x49 && h[2] === 0x46) return 'wav';
  if (h[4] === 0x66 && h[5] === 0x74 && h[6] === 0x79 && h[7] === 0x70) return 'm4a';
  return null;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { kind?: string; name?: string; data?: string };
    const kind = body.kind || 'texture';
    if (!LIMITS[kind]) return NextResponse.json({ ok: false, error: 'bad kind' }, { status: 400 });
    if (!body.data || typeof body.data !== 'string') return NextResponse.json({ ok: false, error: 'no data' }, { status: 400 });
    const size = Math.floor((body.data.length * 3) / 4);
    if (size > LIMITS[kind]) return NextResponse.json({ ok: false, error: `too big (max ${Math.floor(LIMITS[kind] / 1e6)} МБ)` }, { status: 400 });
    const ext = sniff(body.data);
    if (!ext) return NextResponse.json({ ok: false, error: 'unknown file type' }, { status: 400 });
    if (kind === 'music' && !/^(mp3|ogg|wav|m4a)$/.test(ext)) return NextResponse.json({ ok: false, error: 'not audio' }, { status: 400 });
    if (kind !== 'music' && !/^(png|jpg|jpeg|webp|gif)$/.test(ext)) return NextResponse.json({ ok: false, error: 'not image' }, { status: 400 });
    const id = kind + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    fs.mkdirSync(ASSET_DIR, { recursive: true });
    fs.writeFileSync(path.join(ASSET_DIR, id + '.' + ext), Buffer.from(body.data, 'base64'));
    return NextResponse.json({ ok: true, id, url: '/api/game-cms/file/' + id + '.' + ext });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 400 });
  }
}
