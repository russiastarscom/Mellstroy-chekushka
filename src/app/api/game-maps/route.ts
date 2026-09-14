import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// ============================================================
// ВРЕМЕННЫЙ АДМИН-МОДУЛЬ ИГРЫ (редактор карт).
// Убирается вместе с /game/admin.html и блоком ADMIN MAP OVERRIDE
// в public/game/js/main.js по команде владельца.
// Хранит подменённые карты в data/game-maps-override.json.
// ============================================================

export const dynamic = 'force-dynamic';

const FILE = path.join(process.cwd(), 'data', 'game-maps-override.json');

function readOverride(): { levels: Record<string, unknown>; updatedAt: string } | null {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return null;
  }
}

function validateLevels(levels: unknown): string | null {
  if (!levels || typeof levels !== 'object' || Array.isArray(levels)) return 'levels must be an object';
  for (const [k, def] of Object.entries(levels as Record<string, unknown>)) {
    if (!/^\d+$/.test(k)) return `bad level index "${k}"`;
    const d = def as Record<string, unknown>;
    if (!d || typeof d !== 'object') return `level ${k}: not an object`;
    if (d.type !== 'map') return `level ${k}: type must be "map"`;
    const w = d.width;
    if (typeof w !== 'number' || w < 20 || w > 600) return `level ${k}: width 20..600`;
    for (const field of ['ground', 'bricks', 'plats', 'spikes', 'hearts', 'plushes', 'enemies']) {
      if (d[field] !== undefined && !Array.isArray(d[field])) return `level ${k}: ${field} must be an array`;
    }
    const b = d.bottles as Record<string, unknown> | undefined;
    if (b !== undefined && (typeof b !== 'object' || b === null)) return `level ${k}: bottles must be an object`;
  }
  return null;
}

export async function GET() {
  const ov = readOverride();
  return NextResponse.json(
    { ok: true, levels: ov ? ov.levels : null, updatedAt: ov ? ov.updatedAt : null },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const err = validateLevels(body?.levels);
    if (err) return NextResponse.json({ ok: false, error: err }, { status: 400 });
    const payload = { levels: body.levels, updatedAt: new Date().toISOString() };
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(payload));
    return NextResponse.json({ ok: true, updatedAt: payload.updatedAt }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 400 });
  }
}

export async function DELETE() {
  try {
    fs.rmSync(FILE, { force: true });
  } catch {
    /* уже нет файла — ок */
  }
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
