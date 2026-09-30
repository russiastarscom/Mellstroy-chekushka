// Валидация нового dialogs.js: структура + применение к LEVELS + покрытие карт
const fs = require('fs');
const vm = require('vm');

const dialogsCode = fs.readFileSync('/tmp/dialogs_new.js', 'utf8');
const levelsCode = fs.readFileSync('/home/z/my-project/public/game/js/levels.js', 'utf8');

const ctx = { window: {}, console };
vm.createContext(ctx);
vm.runInContext(levelsCode + '\n;this.LEVELS = LEVELS; this.DIALOGUES = DIALOGUES;', ctx, { filename: 'levels.js' });
vm.runInContext(dialogsCode + '\n;this.GAME_DIALOGS = window.GAME_DIALOGS;', ctx, { filename: 'dialogs.js' });

const D = ctx.GAME_DIALOGS, LEVELS = ctx.LEVELS;
const maps = LEVELS.filter((l) => l && l.type === 'map');
const mapIds = maps.map((l) => l.id);

const commonKeys = Object.keys(D.common || {});
const commonCounts = {};
commonKeys.forEach((k) => { commonCounts[k] = (D.common[k] || []).length; });
const byIdKeys = Object.keys(D.byId || {}).map(Number).sort((a, b) => a - b);

let totalLines = 0, totalHints = 0, outroNull = 0, badReplicas = [];
byIdKeys.forEach((id) => {
  const o = D.byId[id];
  (o.intro || []).concat(o.outro && Array.isArray(o.outro) ? o.outro : []).forEach((r) => {
    totalLines++;
    if (!r || typeof r.text !== 'string' || !r.text.trim() || !r.who) badReplicas.push(id + ':' + (r && r.who));
  });
  if (o.outro === null) outroNull++;
  if (Array.isArray(o.hints)) totalHints += o.hints.length;
});
Object.keys(D.common).forEach((k) => (D.common[k] || []).forEach((r) => {
  totalLines++;
  if (!r || typeof r.text !== 'string' || !r.text.trim() || !r.who) badReplicas.push('common:' + k);
}));

// применение к LEVELS
const lv2 = maps.find((l) => l.id === 2);
const applied2 = Array.isArray(lv2.dialogue.intro) && lv2.dialogue.intro[0].text === (D.byId[2].intro[0] || {}).text;
const bossMaps = maps.filter((l) => l.dialogue && l.dialogue.outro === null).length;

// WHO-проверка: допустимые кто
const WHO = new Set(['andrey', 'enemy', 'boss', 'radio', 'narrator']);
const customWho = new Set();
byIdKeys.forEach((id) => {
  const o = D.byId[id];
  (o.intro || []).concat(Array.isArray(o.outro) ? o.outro : []).forEach((r) => { if (r && r.who && !WHO.has(r.who)) customWho.add(r.who); });
});

console.log(JSON.stringify({
  commonKeys, commonCounts,
  byIdCount: byIdKeys.length,
  byIdMin: byIdKeys[0], byIdMax: byIdKeys[byIdKeys.length - 1],
  gameMapCount: maps.length, gameMapIdRange: [Math.min(...mapIds), Math.max(...mapIds)],
  idsInGameButNotInDialogs: mapIds.filter((id) => !byIdKeys.includes(id)),
  idsInDialogsButNotInGame: byIdKeys.filter((id) => !mapIds.includes(id)),
  totalLines, totalHints, outroNull, bossOutroNullInGame: bossMaps,
  badReplicas: badReplicas.slice(0, 10),
  applied2, customWho: [...customWho],
  hintsSample: D.byId[2] && D.byId[2].hints,
}, null, 2));
