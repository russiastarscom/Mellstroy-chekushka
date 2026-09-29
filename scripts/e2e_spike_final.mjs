import { chromium } from 'playwright';
const BASE = 'http://localhost:3000/game';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(BASE + '/index.html', { waitUntil: 'load' });
await page.waitForFunction(() => !!window.GameDebug, null, { timeout: 15000 });
await page.evaluate(() => { [...document.querySelectorAll('#screen-gate button')].find((b) => /18/.test(b.textContent)).click(); });
await sleep(400);
await page.evaluate(() => window.GameDebug.startLevel(2));
await sleep(400);
await page.evaluate(async () => {
  const dlg = document.getElementById('dialogue');
  for (let i = 0; i < 12; i++) {
    if (!dlg || dlg.classList.contains('hidden')) break;
    const b = [...dlg.querySelectorAll('button')].find((x) => /Далее|Дальше|▶/.test(x.textContent)) || dlg.querySelector('button');
    if (!b) break;
    b.click(); await new Promise((s) => setTimeout(s, 400));
  }
});
await sleep(250);
// реальный api: kill() зовёт hurt с настоящим api → pendingGameOver → gameover после анимации
const r = await page.evaluate(async () => {
  const d = window.GameDebug, p = d.player;
  p.invuln = 0;
  d.kill(1);
  const seq = [];
  for (let i = 0; i < 14; i++) {
    await new Promise((s) => setTimeout(s, 200));
    seq.push({ t: +p.deathT.toFixed(2), dying: p.dying, land: p.dLand });
    if (!p.dying && i > 2) break;
  }
  return { hp: p.hp, landed: !!seq.find((s) => s.land), animDone: !p.dying };
});
await sleep(600);
const go = await page.evaluate(() => !document.getElementById('screen-gameover').classList.contains('hidden'));
console.log(JSON.stringify({ ...r, gameoverScreen: go, errors }, null, 1));
await browser.close();
