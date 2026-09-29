// E2E Task 25: секретные комнаты под землёй (обманка-вход, камера вниз, лут,
// батут-выход из колодца) + земля снизу без фона. node scripts/e2e_under_rooms.mjs
import { chromium } from 'playwright';
const BASE = 'http://localhost:3000/game';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
const res = {};

await page.goto(BASE + '/index.html', { waitUntil: 'load' });
await page.waitForFunction(() => !!window.GameDebug, null, { timeout: 15000 });
await page.evaluate(() => { [...document.querySelectorAll('#screen-gate button')].find((b) => /18/.test(b.textContent)).click(); });
await sleep(400);
await page.evaluate(() => window.GameDebug.startLevel(2)); // id3 Улицы: under c0:114 well[114,115] decoys[118,119]
await sleep(500);
await page.evaluate(async () => {
  const dlg = document.getElementById('dialogue');
  for (let i = 0; i < 12; i++) {
    if (!dlg || dlg.classList.contains('hidden')) break;
    const b = [...dlg.querySelectorAll('button')].find((x) => /Далее|Дальше|▶/.test(x.textContent)) || dlg.querySelector('button');
    if (!b) break;
    b.click();
    await new Promise((s) => setTimeout(s, 420));
  }
});
await sleep(400);

// 1. низ поверхности: земля, не фон (пиксель низа канваса)
res.bottomSurface = await page.evaluate(() => {
  const cv = document.getElementById('game');
  const x = cv.getContext('2d').getImageData(cv.width >> 1, cv.height - 6, 1, 1).data;
  return { r: x[0], g: x[1], b: x[2], isGround: x[0] < 150 };
});
await page.screenshot({ path: '/home/z/my-project/scripts/e2e-surface-bottom.png' });

// 2. провал через обманку (118-119) в секретку
await page.evaluate(() => { const p = window.GameDebug.player; p.x = 118 * 40 + 5; p.y = 10 * 40; p.vx = 0; p.vy = 0; });
await sleep(1300);
res.fellIn = await page.evaluate(() => {
  const p = window.GameDebug.player;
  const u = window.GameDebug.level.def.under[0];
  return { y: Math.round(p.y), inRoom: p.y > 600, room: { c0: u.c0, c1: u.c1, well: u.well, decoys: u.decoys } };
});
await page.screenshot({ path: '/home/z/my-project/scripts/e2e-under-room.png' });

// 3. камера в пещере: низ экрана тёмный (cave), не небо
res.cavePixels = await page.evaluate(() => {
  const cv = document.getElementById('game');
  const g = cv.getContext('2d');
  const bot = g.getImageData(cv.width >> 1, cv.height - 8, 1, 1).data;
  const top = g.getImageData(cv.width >> 1, 8, 1, 1).data;
  return { bottomDark: bot[0] < 90 && bot[1] < 90, bottom: [bot[0], bot[1], bot[2]], top: [top[0], top[1], top[2]] };
});

// 4. лут в комнате (чекушки ряд 16, сердце ряд 14)
res.loot = await page.evaluate(() => {
  const sp = window.GameDebug.level.spawns;
  const u = window.GameDebug.level.def.under[0];
  const inner = sp.bottles.filter((b) => b.r === 16 && b.c >= u.c0 && b.c <= u.c1).length;
  const heart = sp.hearts.some((h) => h.r === 14 && h.c >= u.c0 && h.c <= u.c1);
  return { bottlesR16: inner, heartR14: heart };
});

// 5. батут-выход: телепорт в колодец → подброс → сэмплы высоты
await page.evaluate(() => { const p = window.GameDebug.player; p.x = 114 * 40 + 5; p.y = 11 * 40 + 10; p.vx = 0; p.vy = 0; });
const ys = [];
for (let i = 0; i < 16; i++) { await sleep(120); ys.push(await page.evaluate(() => Math.round(window.GameDebug.player.y))); }
res.wellExit = { minY: Math.min(...ys), ejected: Math.min(...ys) < 400, endY: ys[ys.length - 1], backOnSurface: ys[ys.length - 1] < 470 };

// 6. сгенерённая секретка (id8 Замёрзший ручей → index 6): провал через обманку
await page.evaluate(() => window.GameDebug.startLevel(7));
await sleep(500);
await page.evaluate(async () => {
  const dlg = document.getElementById('dialogue');
  for (let i = 0; i < 10; i++) {
    if (!dlg || dlg.classList.contains('hidden')) break;
    const b = [...dlg.querySelectorAll('button')].find((x) => /Далее|Дальше|▶/.test(x.textContent)) || dlg.querySelector('button');
    if (!b) break;
    b.click();
    await new Promise((s) => setTimeout(s, 420));
  }
});
await sleep(300);
res.generated = await page.evaluate(async () => {
  const u = (window.GameDebug.level.def.under || [])[0];
  if (!u) return { has: false };
  const p = window.GameDebug.player;
  p.x = (u.decoys[0] + 0.5) * 40; p.y = 10 * 40; p.vx = 0; p.vy = 0;
  await new Promise((s) => setTimeout(s, 1300));
  return { has: true, fellIn: p.y > 600, y: Math.round(p.y), decoys: u.decoys, well: u.well };
});
res.errors = errors;
console.log(JSON.stringify(res, null, 1));
await browser.close();
