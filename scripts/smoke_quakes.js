// Смоук: quake-оверрайды корректно легли на LEVELS (Task 24)
const fs = require('fs');
const vm = require('vm');
const ctx = { window: {}, console };
vm.createContext(ctx);
const src = fs.readFileSync('public/game/js/levels.js', 'utf8');
vm.runInContext(src + '\n;globalThis.__L = LEVELS;', ctx);
const L = ctx.__L;
console.log('slots:', L.length);
const maps = L.filter((d) => d.type === 'map');
const withQ = maps.filter((d) => d.quake && d.quake.on);
console.log('maps:', maps.length, '| with quake:', withQ.length);
const bosses = maps.filter((d) => d.boss).map((d) => d.id);
const clash = withQ.filter((d) => d.boss).map((d) => d.id);
console.log('boss ids:', bosses.join(','), '| quake on boss:', clash.length ? 'FAIL ' + clash : 'OK none');
console.log('per-map list:', withQ.map((d) => `${d.id}:${d.name} p${d.quake.power}/i${d.quake.interval}/d${d.quake.dur}${d.quake.rocks ? '+rocks' : ''}`).join('\n  '));
// геометрия не сломана: у всех map-уровней есть ground и width
const bad = maps.filter((d) => !(d.width >= 20) || !Array.isArray(d.ground));
console.log('geometry check:', bad.length ? 'FAIL' : 'OK');
// валидация полей quake
const badQ = withQ.filter((d) => typeof d.quake.power !== 'number' || typeof d.quake.interval !== 'number' || typeof d.quake.dur !== 'number' || typeof d.quake.rocks !== 'boolean');
console.log('quake fields:', badQ.length ? 'FAIL' : 'OK');
