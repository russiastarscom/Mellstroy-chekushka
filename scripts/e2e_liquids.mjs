// E2E Task 26: вода в прологе, перепрыгиваемость жиж, 3 вида утопления (вода/лава/кислота)
import { chromium } from 'playwright';
const BASE = 'http://localhost:3000/game';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/404|tomahawk|heart|maps-override/.test(m.text())) errors.push('CONSOLE: ' + m.text()); });
const res = {};

await page.goto(BASE + '/index.html', { waitUntil: 'load' });
await page.waitForFunction(() => !!window.GameDebug, null, { timeout: 15000 });
await page.evaluate(() => { [...document.querySelectorAll('#screen-gate button')].find((b) => /18/.test(b.textContent)).click(); });
await sleep(400);

async function skipDialogue() {
  await page.evaluate(async () => {
    const dlg = document.getElementById('dialogue');
    for (let i = 0; i < 14; i++) {
      if (!dlg || dlg.classList.contains('hidden')) break;
      const b = [...dlg.querySelectorAll('button')].find((x) => /Далее|Дальше|▶/.test(x.textContent)) || dlg.querySelector('button');
      if (!b) break; b.click(); await new Promise((s) => setTimeout(s, 330));
    }
  });
}
const kd = (c) => page.evaluate((c) => document.dispatchEvent(new KeyboardEvent('keydown', { code: c, bubbles: true })), c);
const ku = (c) => page.evaluate((c) => document.dispatchEvent(new KeyboardEvent('keyup', { code: c, bubbles: true })), c);

// ---------- 1. ПРОЛОГ id4: вода появилась, утоп водой ----------
await page.evaluate(() => window.GameDebug.startLevel(3)); // id4 Заводской район
await sleep(500); await skipDialogue(); await sleep(300);
res.prologue = await page.evaluate(() => {
  const d = window.GameDebug.level.def;
  return { liquids: d.liquids, hints: (d.hints || []).map(h => h.text) };
});
// вода видна? пиксель середины ямы 15-17 (мир ~ (16*40+20, 12*40+25) = (660, 505))
await page.evaluate(() => { const p = window.GameDebug.player; p.x = 12 * 40; p.y = 8 * 40; p.vx = 0; p.vy = 0; });
await sleep(900);
res.waterPixel = await page.evaluate(() => {
  const cv = document.getElementById('game'); const g = cv.getContext('2d');
  // найдём пиксель: cam неизвестен снаружи — ищем синий пиксель в нижней трети экрана около центра
  const img = g.getImageData(cv.width >> 1 - 60, Math.floor(cv.height * 0.72), 120, 80).data;
  let blue = 0;
  for (let i = 0; i < img.length; i += 4) if (img[i + 2] > 120 && img[i + 2] > img[i] + 30 && img[i + 2] > img[i + 1] + 30) blue++;
  return { bluePixels: blue };
});
// входим в воду → анимация утопа (вода)
await page.evaluate(() => { const p = window.GameDebug.player; p.x = 15 * 40 + 8; p.y = 9 * 40; p.vx = 0; p.vy = 0; p.invuln = 0; p.hp = 3; });
await sleep(700);
res.drownWater = await page.evaluate(() => {
  const p = window.GameDebug.player;
  return { dying: p.dying, kind: p.dKind || null, y: Math.round(p.y), surf: Math.round(p.dSurfaceY || 0), hp: p.hp };
});
await page.screenshot({ path: '/home/z/my-project/scripts/e2e-drown-water.png' });
await sleep(1400);
res.waterAfter = await page.evaluate(() => ({ dying: window.GameDebug.player.dying, y: Math.round(window.GameDebug.player.y) }));

// ---------- 2. ЛАВА (id36, гл.2): dKind=lava, искры, пламя ----------
await page.evaluate(() => window.GameDebug.startLevel(35));
await sleep(500); await skipDialogue(); await sleep(300);
res.lavaMap = await page.evaluate(() => {
  const d = window.GameDebug.level.def;
  return { bg: d.bg, liquids: d.liquids.slice(0, 4) };
});
const lavaPool = await page.evaluate(() => {
  const d = window.GameDebug.level.def.liquids;
  return d.find(l => l[1] - l[0] >= 2) || d[0];
});
await page.evaluate(([a, b]) => { const p = window.GameDebug.player; p.x = a * 40 + 8; p.y = 9 * 40; p.vx = 0; p.vy = 0; p.invuln = 0; p.hp = 3; }, lavaPool);
await sleep(700);
res.drownLava = await page.evaluate(() => {
  const p = window.GameDebug.player;
  return { dying: p.dying, kind: p.dKind, y: Math.round(p.y), surf: Math.round(p.dSurfaceY || 0), hp: p.hp };
});
await page.screenshot({ path: '/home/z/my-project/scripts/e2e-drown-lava.png' });
await sleep(1400);

// ---------- 3. КИСЛОТА (id46, гл.3): dKind=acid, зелёные пузыри ----------
await page.evaluate(() => window.GameDebug.startLevel(45));
await sleep(500); await skipDialogue(); await sleep(300);
res.acidMap = await page.evaluate(() => {
  const d = window.GameDebug.level.def;
  return { bg: d.bg, liquids: d.liquids.slice(0, 3) };
});
const acidPool = await page.evaluate(() => window.GameDebug.level.def.liquids[0]);
await page.evaluate(([a, b]) => { const p = window.GameDebug.player; p.x = a * 40 + 8; p.y = 9 * 40; p.vx = 0; p.vy = 0; p.invuln = 0; p.hp = 3; }, acidPool);
await sleep(700);
res.drownAcid = await page.evaluate(() => {
  const p = window.GameDebug.player;
  return { dying: p.dying, kind: p.dKind, y: Math.round(p.y), surf: Math.round(p.dSurfaceY || 0), hp: p.hp };
});
await page.screenshot({ path: '/home/z/my-project/scripts/e2e-drown-acid.png' });
await sleep(1400);

// ---------- 4. ПРЫЖОК через 4-тайловую лаву (id36 [21,24]) ----------
await page.evaluate(() => window.GameDebug.startLevel(35));
await sleep(500); await skipDialogue(); await sleep(300);
res.jump4 = await page.evaluate(async () => {
  const g = window.GameDebug, p = g.player;
  const sleep2 = (ms) => new Promise((s) => setTimeout(s, ms));
  const kd = (c) => document.dispatchEvent(new KeyboardEvent('keydown', { code: c, bubbles: true }));
  const ku = (c) => document.dispatchEvent(new KeyboardEvent('keyup', { code: c, bubbles: true }));
  const [a, b] = g.level.def.liquids.find(l => l[1] - l[0] === 3) || g.level.def.liquids[0];
  const pitL = a * 40, pitR = (b + 1) * 40;
  p.dying = null; p.hp = 99; p.invuln = 0;
  p.x = pitL - p.w - 6; p.y = 9.5 * 40; p.vx = 0; p.vy = 0;
  await sleep2(300);
  kd('ArrowRight');
  let jumped = false;
  for (let i = 0; i < 200; i++) {
    if (!jumped && p.x + p.w >= pitL - 4) { kd('Space'); jumped = true; }
    await sleep2(16);
    if (jumped) break;
  }
  let drowned = false;
  for (let i = 0; i < 100; i++) {
    await sleep2(16);
    if (p.dying) { drowned = true; break; }
    if (p.onGround && p.x > pitR) break;
  }
  ku('ArrowRight'); ku('Space');
  return { pitW: pitR - pitL, crossed: p.x > pitR && !p.dying, drowned, margin: Math.round(p.x - pitR) };
});

// ---------- 5. все жижи ≤4 — проверено валидатором scripts/check_levels.mjs (node) ----------

console.log(JSON.stringify(res, null, 1));
console.log('ERRORS:', errors.length ? errors.join(' | ') : 'clean');
await browser.close();
