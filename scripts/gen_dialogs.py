#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Генератор js/dialogs.js — ЕДИНОГО ФАЙЛА ДИАЛОГОВ игры
«Мелстрой: Мировая Чекушка».

Извлекает ВСЕ тексты (катсцену, диалоги карт, подсказки, реплики боссов)
из js/levels.js (исполняя его в Node) и пишет js/dialogs.js с объектом
window.GAME_DIALOGS + блоком применения оверрайдов.

Перезапуск после правок уровней:  python3 scripts/gen_dialogs.py
"""
import json
import pathlib
import subprocess

ROOT = pathlib.Path('/home/z/my-project/public/game')
GAME = ROOT

NODE_PROBE = r"""
const fs = require('fs');
let code = fs.readFileSync(process.argv[2], 'utf8');
code += '\n;__OUT({ LEVELS, DIALOGUES, CHAPTER_META });';
function __OUT(o) {
  const lines = [];
  const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
  const L = (x) => { lines.push(x); };
  const dumpLines = (arr, indent) => {
    if (!Array.isArray(arr)) return 'null';
    const pad = ' '.repeat(indent);
    const inner = arr.map((l) => pad + "  { who: '" + esc(l.who) + "', text: '" + esc(l.text) + "' }").join(',\n');
    return '[\n' + inner + '\n' + pad + ']';
  };
  const dumpHints = (arr, indent) => {
    if (!Array.isArray(arr) || !arr.length) return '[]';
    const pad = ' '.repeat(indent);
    return '[\n' + arr.map((h) => pad + "  { c: " + Number(h.c) + ", text: '" + esc(h.text) + "' }").join(',\n') + '\n' + pad + ']';
  };
  // ---- common ----
  L('window.GAME_DIALOGS = {');
  L('  common: {');
  const C = o.DIALOGUES;
  ['intro', 'outroAfterBoss', 'happyAfterBoss', 'happyOutro'].forEach((k) => {
    if (C[k]) L('    ' + k + ': ' + dumpLines(C[k], 4) + ',');
  });
  L('  },');
  // ---- byId ----
  L('  byId: {');
  o.LEVELS.forEach((d) => {
    if (!d || d.type !== 'map') return;
    const dlg = d.dialogue || {};
    L('    // ---- #' + d.id + ' ' + (d.name || '') + ' ----');
    const intro = Array.isArray(dlg.intro) ? dumpLines(dlg.intro, 4) : 'null';
    const outro = ('outro' in dlg) ? (Array.isArray(dlg.outro) ? dumpLines(dlg.outro, 4) : 'null') : 'null';
    L('    "' + d.id + '": {');
    L('      intro: ' + intro + ',');
    L('      outro: ' + outro + ',');
    L('      hints: ' + dumpHints(d.hints, 6) + ',');
    L('    },');
  });
  L('  },');
  L('};');
  console.log(lines.join('\n'));
}
try { eval(code); } catch (e) { console.error('EVAL FAIL: ' + e.message); process.exit(1); }
"""

HEADER = """// ============================================================
// ДИАЛОГИ ИГРЫ — ЕДИНЫЙ ФАЙЛ  (js/dialogs.js)
// ============================================================
// ЗДЕСЬ ВСЕ ТЕКСТЫ ИГРЫ. Правь ТОЛЬКО этот файл (например,
// попроси ИИ переписать его целиком) — levels.js подхватит их сам.
//
// Формат реплики:  { who: 'кто', text: 'текст' }
//   кто: andrey | enemy | boss | radio | narrator | '@id' (свой объект)
//   Пи*** = самозатёртый мат (18+ держим в рамках платформы).
//
// common.intro          — катсцена в самом начале игры
// common.outroAfterBoss — финал после ПОСЛЕДНЕГО босса игры
// common.happyAfterBoss — разговор сразу после босса главы 3
// common.happyOutro     — финальный экран «Чекушка свободна»
//
// byId["<id карты>"] — реплики и подсказки конкретной карты:
//   intro  — при старте карты,  outro — после завода (null = особый
//   финал босса), hints — плавающие подсказки { c: колонка, text }.
//
// ПРИОРИТЕТ ТЕКСТОВ: админ-панель (CMS/game-cms.json) > этот файл >
// старые тексты внутри levels.js (там больше НЕ редактировать).
// ============================================================
window.GAME_DIALOGS = {
"""

APPLY = """
// ============================================================
// ПРИМЕНЕНИЕ (не редактировать) — оверрайд текстов в levels.js
// ============================================================
(function applyGameDialogs() {
  try {
    const D = window.GAME_DIALOGS;
    if (!D || typeof LEVELS === 'undefined' || typeof DIALOGUES === 'undefined') return;
    const norm = (a) => (Array.isArray(a) ? a.filter((l) => l && l.text).map((l) => ({ who: l.who || 'narrator', text: l.text })) : null);
    // common — мутируем НА МЕСТЕ: на эти массивы уже ссылаются катсцена и боссы
    const putInPlace = (dst, src) => {
      if (!Array.isArray(dst) || !Array.isArray(src)) return;
      const next = norm(src);
      if (!next) return;
      dst.splice(0, dst.length, ...next);
    };
    putInPlace(DIALOGUES.intro, D.common.intro);
    putInPlace(DIALOGUES.outroAfterBoss, D.common.outroAfterBoss);
    putInPlace(DIALOGUES.happyAfterBoss, D.common.happyAfterBoss);
    putInPlace(DIALOGUES.happyOutro, D.common.happyOutro);
    // byId — полная замена диалогов/подсказок по id карты
    Object.keys(D.byId || {}).forEach((k) => {
      const lv = LEVELS.find((x) => x && x.type === 'map' && x.id === Number(k));
      if (!lv) return;
      const o = D.byId[k] || {};
      const dlg = lv.dialogue || (lv.dialogue = {});
      const intro = norm(o.intro);
      if (intro) dlg.intro = intro;
      if ('outro' in o) {
        const outro = norm(o.outro);
        dlg.outro = Array.isArray(o.outro) ? (outro || []) : o.outro; // null = особый финал босса
      }
      if (Array.isArray(o.hints)) {
        lv.hints = o.hints.filter((h) => h && typeof h.c === 'number' && h.text).map((h) => ({ c: h.c, text: h.text }));
      }
    });
  } catch (e) { console.error('[dialogs.js]', e); }
})();
"""


def main():
    probe = GAME / '_dialogs_probe.js'
    probe.write_text(NODE_PROBE, encoding='utf-8')
    try:
        out = subprocess.run(
            ['node', str(probe), str(GAME / 'js' / 'levels.js')],
            capture_output=True, text=True, timeout=30, cwd=str(GAME),
        )
    finally:
        probe.unlink(missing_ok=True)
    if out.returncode != 0:
        raise SystemExit('Node extraction failed:\n' + out.stderr)
    body = out.stdout.strip()
    assert body.startswith('window.GAME_DIALOGS'), body[:200]
    body = '\n'.join(body.split('\n')[1:])  # открывающую строку уже содержит HEADER
    (GAME / 'js' / 'dialogs.js').write_text(HEADER + body + '\n' + APPLY, encoding='utf-8')
    size = (GAME / 'js' / 'dialogs.js').stat().st_size
    print(f'OK -> js/dialogs.js ({size} bytes)')


if __name__ == '__main__':
    main()
