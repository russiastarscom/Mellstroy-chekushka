// Диагностика 2: лава гл.2, кислота гл.3, прыжок через 4- и 5-тайловую яму
import { chromium } from 'playwright';
const BASE = 'http://localhost:3000/game';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));

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
      if (!b) break; b.click(); await new Promise((s) => setTimeout(s, 340));
    }
  });
}

// карта id36 (гл.2, слот 35) — лава с 5-широкими ямами
await page.evaluate(() => window.GameDebug.startLevel(35));
await sleep(500); await skipDialogue(); await sleep(300);
const liq = await page.evaluate(() => window.GameDebug.level.def.liquids);
console.log('id36 liquids:', JSON.stringify(liq.slice(0, 6)));
await page.evaluate(() => { const p = window.GameDebug.player; const [a, b] = window.GameDebug.level.def.liquids.find(l => l[1] - l[0] >= 4) || [13, 14]; p.x = a * 40 - 70; p.y = 8 * 40; p.vx = 0; p.vy = 0; });
await sleep(800);
await page.screenshot({ path: '/home/z/my-project/scripts/diag-lava.png' });

// ПРЫЖОК через 5-широкую яму: разгон + прыжок у края
const jump = await page.evaluate(async () => {
  const g = window.GameDebug; const p = g.player;
  const [a, b] = g.level.def.liquids.find(l => l[1] - l[0] + 1 >= 5);
  const pitL = a * 40, pitR = (b + 1) * 40; // границы ямы в px
  p.x = pitL - p.w - 2; p.y = 9.5 * 40; p.vx = 0; p.vy = 0; p.invuln = 0; p.dying = null; p.hp = 99;
  await new Promise(s => setTimeout(s, 250));
  // бежим вправо и прыгаем в последний момент (правый край игрока у кромки)
  const api = g.__api || null;
  // симулируем input через клавиши игры
  const kd = (k) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, code: k, bubbles: true }));
  const ku = (k) => window.dispatchEvent(new KeyboardEvent('keyup', { key: k, code: k, bubbles: true }));
  kd('ArrowRight'); kd('Shift'); // Shift/ArrowUp = прыжок? пробуем и W
  await new Promise(s => setTimeout(s, 400));
  kd('w'); kd('ArrowUp');
  const t0 = performance.now();
  let minX = 1e9, maxX = -1e9, drowned = false;
  for (let i = 0; i < 90; i++) {
    await new Promise(s => setTimeout(s, 16));
    if (p.dying) drowned = true;
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x + p.w);
    if (p.x > pitR + 60) break;
    if (i > 40 && p.onGround && p.x > pitL) break;
  }
  ku('ArrowRight'); ku('Shift'); ku('w'); ku('ArrowUp');
  return { pitL, pitR, pitW: pitR - pitL, crossed: p.x > pitR, drowned, landedX: Math.round(p.x), maxX: Math.round(maxX), hp: p.hp };
});
console.log('5-wide jump result:', JSON.stringify(jump));
await browser.close();
