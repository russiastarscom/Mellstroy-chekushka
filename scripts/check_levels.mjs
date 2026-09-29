// Валидатор уровней: лут в шипах/пилах/жиже/батутах/стенах, лут без опоры,
// враги в опасностях/стенах, спавн/завод на опасных тайлах. node scripts/check_levels.mjs
import fs from 'fs';
import vm from 'vm';
const SRC = '/home/z/my-project/public/game/js/levels.js';
const ctx = vm.createContext({ console });
vm.runInContext(fs.readFileSync(SRC, 'utf8'), ctx, { filename: 'levels.js' });
const { LEVELS, buildLevel, ROWS, TILE } = vm.runInContext('({ LEVELS, buildLevel, ROWS, TILE })', ctx);
const HAZ = new Set(['^', 'S', 'L']);
const SOLID = new Set(['#', 'B', 'C']);
const SUP = new Set(['#', 'B', 'C', '=', 'v', 'D']);
let maps = 0, issues = [];
const tile = (lv, c, r) => (c < 0 || c >= lv.w || r < 0 || r >= ROWS) ? '.' : lv.grid[r][c];
const sup = (lv, c, r) => {
  // над входом/ямой (ряды 11-12 не сплошные: воздух или жижа) — лут берётся в прыжке/падении
  const g1 = tile(lv, c, 11), g2 = tile(lv, c, 12);
  if (g1 !== '#' && g1 !== 'B' && g2 !== '#' && g2 !== 'B') return true;
  for (let k = 1; k <= 4; k++) if (SUP.has(tile(lv, c, r + k))) return true;
  return false;
};
for (const def of LEVELS) {
  if (def.type !== 'map') continue;
  maps++;
  const lv = buildLevel(def);
  const tag = `№${def.id} «${def.name}» (w=${def.width})`;
  const iss = [];
  lv.spawns.bottles.forEach(({ c, r }) => {
    const t = tile(lv, c, r);
    if (HAZ.has(t)) iss.push(`чекушка (${c},${r}) в опасности «${t}»`);
    else if (t !== '.' ) iss.push(`чекушка (${c},${r}) в тайле «${t}»`);
    else if (!sup(lv, c, r)) iss.push(`чекушка (${c},${r}) без опоры`);
  });
  [...lv.spawns.hearts, ...lv.spawns.plushes].forEach(({ c, r }) => {
    const t = tile(lv, c, r);
    if (HAZ.has(t) || t !== '.') iss.push(`сердце/плюшка (${c},${r}) на «${t}»`);
    else if (!sup(lv, c, r)) iss.push(`сердце/плюшка (${c},${r}) без опоры`);
  });
  lv.spawns.enemies.forEach(({ type, c, r }) => {
    const t = tile(lv, c, r);
    if (HAZ.has(t)) iss.push(`враг ${type} (${c},${r}) в опасности «${t}»`);
    else if (SOLID.has(t)) iss.push(`враг ${type} (${c},${r}) в стене «${t}»`);
    else if (t !== '.' && t !== 'v') iss.push(`враг ${type} (${c},${r}) на «${t}»`);
  });
  (def.under || []).forEach((u, i) => {
    if (!(u.c1 > u.c0)) { iss.push(`секретка#${i}: c1<=c0`); return; }
    for (let r = 13; r <= 16; r++) for (let c = u.c0; c <= u.c1; c++)
      if (tile(lv, c, r) === '#') { iss.push(`секретка#${i}: не вырезана (${c},${r})`); break; }
    (u.well || []).forEach((c) => {
      if (tile(lv, c, 16) !== 'v') iss.push(`секретка#${i}: нет батута в колодце (${c})`);
      if (tile(lv, c, 11) === '#' && tile(lv, c, 12) === '#') iss.push(`секретка#${i}: колодец (${c}) не открыт`);
    });
    (u.decoys || []).forEach((c) => {
      if (tile(lv, c, 11) !== 'D' || tile(lv, c, 12) !== 'D') iss.push(`секретка#${i}: обманка (${c}) не 'D'`);
    });
    const loot = lv.spawns.bottles.filter((b) => b.r >= 13 && b.c >= u.c0 && b.c <= u.c1).length;
    if (loot < 3) iss.push(`секретка#${i}: мало чекушек внутри (${loot})`);
  });
  const sc = lv.spawnC;
  if (HAZ.has(tile(lv, sc, 10))) iss.push(`спавн (${sc}) на опасности`);
  const fc = lv.factoryC;
  if (HAZ.has(tile(lv, fc, 10)) || tile(lv, fc, 10) === 'v') iss.push(`завод (${fc}) на «${tile(lv, fc, 10)}»`);
  if (iss.length) { issues.push(tag); iss.forEach((m) => issues.push('  ✗ ' + m)); }
}
console.log(`Карт: ${maps}, ROWS=${ROWS}, TILE=${TILE}`);
if (!issues.length) console.log('✓ ПРОБЛЕМ НЕ НАЙДЕНО');
else { console.log(`✗ ПРОБЛЕМ: ${issues.filter(s => s.includes('✗')).length}`); console.log(issues.join('\n')); }
