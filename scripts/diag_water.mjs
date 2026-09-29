// Диагностика: видна ли вода на картах, ширины ям, прыгаемость
import { chromium } from 'playwright';
const BASE = 'http://localhost:3000/game';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

await page.goto(BASE + '/index.html', { waitUntil: 'load' });
await page.waitForFunction(() => !!window.GameDebug, null, { timeout: 15000 });
await page.evaluate(() => { [...document.querySelectorAll('#screen-gate button')].find((b) => /18/.test(b.textContent)).click(); });
await sleep(400);

// карта id6 «Морозный старт» (гл.1) — первая с водой [13,14],[23,24],[32,33],[46,47]
await page.evaluate(() => window.GameDebug.startLevel(5));
await sleep(600);
await page.evaluate(async () => {
  const dlg = document.getElementById('dialogue');
  for (let i = 0; i < 12; i++) {
    if (!dlg || dlg.classList.contains('hidden')) break;
    const b = [...dlg.querySelectorAll('button')].find((x) => /Далее|Дальше|▶/.test(x.textContent)) || dlg.querySelector('button');
    if (!b) break; b.click(); await new Promise((s) => setTimeout(s, 380));
  }
});
// ставим Андрея прямо перед первой полыньёй (колонки 13-14)
await page.evaluate(() => {
  const p = window.GameDebug.player;
  p.x = 11 * 40; p.y = 8 * 40; p.vx = 0; p.vy = 0;
  window.GameDebug.camFollow && window.GameDebug.camFollow();
});
await sleep(900);
const info = await page.evaluate(() => {
  const g = window.GameDebug; const p = g.player;
  return { x: Math.round(p.x), y: Math.round(p.y), hp: p.hp, dying: p.dying };
});
console.log('player at pool edge:', JSON.stringify(info));
await page.screenshot({ path: '/home/z/my-project/scripts/diag-pool.png' });

// пиксель поверхности жидкости (колонка 13, ряд 12: мир y≈490) — есть ли цвет жижи
const px = await page.evaluate(() => {
  const cv = document.getElementById('game'); const g = cv.getContext('2d');
  // найдём экранные координаты: мир (13*40+20, 12*40+20) → экран
  const d = window.GameDebug; const cam = d.cam !== undefined ? d.cam : null;
  return { camExposed: cam !== null };
});
console.log('cam exposure:', JSON.stringify(px));
await sleep(200);
console.log('ERRORS:', errors.length ? errors.slice(0, 5).join(' | ') : 'clean');
await browser.close();
