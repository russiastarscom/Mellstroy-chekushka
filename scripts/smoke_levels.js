// Смоук-тест генератора уровней (vm, как в браузере)
const fs = require('fs');
const vm = require('vm');
const ctx = { console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('/home/z/my-project/public/game/js/config.js', 'utf8'), ctx, { filename: 'config.js' });
vm.runInContext(fs.readFileSync('/home/z/my-project/public/game/js/levels.js', 'utf8'), ctx, { filename: 'levels.js' });
const test = `
const L = LEVELS;
console.log('TOTAL:', L.length, '(ожидаем 65: пролог + 60 новых)');
console.log('idx5:', L[5].name, '| idx6:', L[6].name, '| idx24:', L[24].name, '| idx25:', L[25].name, '| idx44:', L[44].name, '| idx45:', L[45].name, '| idx64:', L[64].name, '| bg64:', L[64].bg);
const chC = {};
L.forEach(l => { chC[l.chapter || 0] = (chC[l.chapter || 0] || 0) + 1; });
console.log('по главам:', JSON.stringify(chC));
let issues = 0;
const bad = (...a) => { console.log('BAD:', ...a); issues++; };
for (let i = 5; i < L.length; i++) {
  const def = L[i];
  const w = def.width;
  if (def.ground[def.ground.length - 1][1] !== w - 1) bad('ground end', i, def.name, def.ground[def.ground.length-1], 'w=' + w);
  if (def.ground[0][0] !== 0) bad('ground start', i);
  if (!def.ground.some(([a, b]) => 2 >= a && 2 <= b)) bad('SPAWN GAP', i, def.name);
  for (const [t, ec] of def.enemies) {
    if (ec !== undefined && ec < 7 && t !== 'f') bad('ENEMY AT SPAWN', i, def.name, t, ec);
    if (t === 'f' && ec !== undefined && ec < 7) bad('FLYER AT SPAWN', i, def.name, ec);
  }
  for (const [a, b] of (def.liquids || [])) { if (b >= w - 9) bad('LIQUID AT FACTORY', i, def.name, a, b); if (b - a + 1 > 5) console.log('note: wide pit', i, def.name, b - a + 1); }
  for (const [a, b] of (def.spikes || [])) { if (b >= w - 9) bad('SPIKES AT FACTORY', i, def.name); }
  for (const [sv] of (def.saws || [])) { if (sv >= w - 9) bad('SAW AT FACTORY', i, def.name); }
  for (const [sv] of (def.springs || [])) { if (sv >= w - 9) bad('SPRING AT FACTORY', i, def.name); }
  const rows = [];
  def.bottles.runs.forEach(([c0, c1, r]) => rows.push([c0, r]));
  def.bottles.singles.forEach(([c, r]) => rows.push([c, r]));
  for (const [c, r] of rows) if (r < 1 || r > 10) bad('BOTTLE ROW', i, def.name, c, r);
  for (const [c, r] of def.hearts) if (r < 1 || r > 10) bad('HEART ROW', i, def.name, c, r);
  for (const e of def.enemies) if (e[2] !== undefined && (e[2] < 1 || e[2] > 9)) bad('ENEMY ROW', i, def.name, e);
  // ширина ямы против max прыжка (5 тайлов)
  const grounds = def.ground.slice().sort((a, b) => a[0] - b[0]);
  for (let g = 1; g < grounds.length; g++) {
    const gap = grounds[g][0] - grounds[g - 1][1] - 1;
    if (gap > 5) bad('UNJUMPABLE GAP', i, def.name, gap);
  }
}
console.log('issues:', issues);
const tot = k => L.slice(6).reduce((s, l) => s + (Array.isArray(l[k]) ? l[k].length : 0), 0);
console.log('stats: enemies', tot('enemies'), '| plats', tot('plats'), '| liquids', tot('liquids'), '| springs', tot('springs'), '| saws', tot('saws'), '| crumble', tot('crumble'), '| plushes', tot('plushes'));
console.log('boss levels:', L.filter(l => l.boss).map(l => l.id + ':' + l.boss.hp).join(', '));
`;
vm.runInContext(test, ctx, { filename: 'test.js' });
