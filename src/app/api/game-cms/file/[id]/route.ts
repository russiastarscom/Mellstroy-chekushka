import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// ============================================================
// ВРЕМЕННЫЙ АДМИН-МОДУЛЬ ИГРЫ v2: раздача загруженных ассетов.
// GET /api/game-cms/file/<id>.<ext> — отдаёт файл из data/game-assets/.
// Убирается вместе с /game/admin.html по команде владельца.
// ============================================================

export const dynamic = 'force-dynamic';

const ASSET_DIR = path.join(process.cwd(), 'data', 'game-assets');

const MIMES: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
  mp3: 'audio/mpeg', ogg: 'audio/ogg', oga: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac',
};

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // защита от path traversal
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9]{2,5}$/.test(id)) {
    return NextResponse.json({ ok: false, error: 'bad asset id' }, { status: 400 });
  }
  const full = path.join(ASSET_DIR, id);
  try {
    const buf = fs.readFileSync(full);
    const ext = id.split('.').pop()!.toLowerCase();
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': MIMES[ext] || 'application/octet-stream',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch {
    return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 });
  }
}
