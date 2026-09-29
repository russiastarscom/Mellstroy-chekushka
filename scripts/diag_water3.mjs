// Диагностика 3: честный прыжок через ямы 3/4/5 тайлов (input на document)
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
await page.evaluate(() => window.GameDebug.startLevel(35)); // id36 гл.2 лава
await sleep(500);
await page.evaluate(async () => {
  const dlg = document.getElementById('dialogue');
  for (let i = 0; i < 14; i++) {
    if (!dlg || dlg.classList.contains('hidden')) break;
    const b = [...dlg.querySelectorAll('button')].find((x) => /Далее|Дальше|▶/.test(x.textContent)) || dlg.querySelector('button');
    if (!b) break; b.click(); await new Promise((s) => setTimeout(s, 340));
  }
});
await sleep(300);

const res = await page.evaluate(async () => {
  const g = window.GameDebug, p = g.player;
  const sleep2 = (ms) => new Promise((s) => setTimeout(s, ms));
  const kd = (c) => document.dispatchEvent(new KeyboardEvent('keydown', { code: c, bubbles: true }));
  const ku = (c) => document.dispatchEvent(new KeyboardEvent('keyup', { code: c, bubbles: true }));
  const out = { pw: p.w, ph: p.h, tests: [] };

  // ямы id36: [21,25]=5, [51,53]=3, [78,82]=5, [97,99]=3
  const pools = [[21, 25, 5], [51, 53, 3]];
  for (const [a, b, W] of pools) {
    const pitL = a * 40, pitR = (b + 1) * 40;
    p.dying = null; p.hp = 99; p.invuln = 0;
    p.x = pitL - p.w - 6; p.y = 9.5 * 40; p.vx = 0; p.vy = 0;
    await sleep2(300);
    // разгон до полной скорости, прыжок ЗА 1 кадр до кромки
    kd('ArrowRight');
    let jumped = false;
    for (let i = 0; i < 200; i++) {
      if (!jumped && p.x + p.w >= pitL - 4) { kd('Space'); jumped = true; }
      await sleep2(16);
      if (jumped) break;
    }
    // ждём приземления по ту сторону
    let drowned = false;
    for (let i = 0; i < 100; i++) {
      await sleep2(16);
      if (p.dying) { drowned = true; break; }
      if (p.onGround && p.x > pitR) break;
    }
    ku('ArrowRight'); ku('Space');
    out.tests.push({ W, pitW: pitR - pitL, crossed: p.x > pitR && !p.dying, drowned, landedX: Math.round(p.x), pitR });
    // вытащить из ямы для следующего теста
    p.dying = null; p.x = pitR + 30; p.y = 9.5 * 40; p.vx = 0; p.vy = 0;
    await sleep2(250);
  }
  return out;
});
console.log(JSON.stringify(res, null, 1));
await browser.close();
