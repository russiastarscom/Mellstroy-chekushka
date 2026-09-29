// E2E Task 24: смерти с анимациями + пер-картные землетрясения + админ-панель
// Запуск: node scripts/e2e_deaths_quakes.mjs
import { chromium } from 'playwright';

const BASE = 'http://localhost:3000/game';
const out = (o) => console.log(JSON.stringify(o, null, 1));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

const res = {};

// ---------- 1. Игра: гейт → карта id3 (Улицы) ----------
await page.goto(BASE + '/index.html', { waitUntil: 'load' });
await page.waitForFunction(() => !!window.GameDebug, null, { timeout: 15000 });
await page.evaluate(() => { [...document.querySelectorAll('#screen-gate button')].find((b) => /18/.test(b.textContent)).click(); });
await sleep(400);
await page.evaluate(() => window.GameDebug.startLevel(2)); // id=3 Улицы Буримовки (MAP_QUAKES[3])
await sleep(500);
// закрыть интро-диалог
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
await sleep(300);

// ---------- 2. Пер-картный quake ----------
res.quake = await page.evaluate(() => {
  const q = window.GameDebug.quakeState;
  return { auto: q.auto, override: q.override, nextAt: q.nextAt, phase: q.phase };
});
// форс-толчок для скриншота warn-фазы
await page.evaluate(() => window.GameDebug.quake(0.6, 4));
await sleep(300);
res.warnBanner = await page.evaluate(() => {
  const c = document.querySelector('canvas');
  return { quakePhase: window.GameDebug.quakeState.phase, canvas: !!c };
});
await page.screenshot({ path: 'scripts/e2e-quake-warn.png' });

// ---------- 3. Утоп: анимация погружения ----------
await page.evaluate(() => { const p = window.GameDebug.player; p.hp = 3; window.GameDebug.drown(); });
await sleep(700);
res.drownMid = await page.evaluate(() => ({ ...window.GameDebug.deathState }));
await page.screenshot({ path: 'scripts/e2e-drown-mid.png' });
// дождаться конца (респаун, hp>0)
await page.waitForFunction(() => { const s = window.GameDebug.deathState; return s && !s.dying; }, null, { timeout: 6000 });
res.drownDone = await page.evaluate(() => ({ hp: window.GameDebug.player.hp, dying: window.GameDebug.deathState.dying }));

// ---------- 4. Смерть от шипов: отскок + пласт + gameover ----------
await page.evaluate(() => { const p = window.GameDebug.player; p.hp = 1; window.GameDebug.kill(1); });
await sleep(350);
res.spikeEarly = await page.evaluate(() => ({ ...window.GameDebug.deathState }));
await page.screenshot({ path: 'scripts/e2e-spike-tumble.png' });
// дождаться лежащей тушки (land)
await page.waitForFunction(() => { const s = window.GameDebug.deathState; return s && (s.land || !s.dying); }, null, { timeout: 6000 });
res.spikeLand = await page.evaluate(() => ({ ...window.GameDebug.deathState }));
await page.screenshot({ path: 'scripts/e2e-spike-land.png' });
// дождаться экрана gameover
await page.waitForFunction(() => !document.getElementById('screen-gameover').classList.contains('hidden'), null, { timeout: 6000 });
res.gameoverShown = true;

// ---------- 5. Урон БЕЗ смерти: обычный отскок (без анимации смерти) ----------
await page.evaluate(() => window.GameDebug.startLevel(2));
await sleep(400);
await page.evaluate(async () => {
  const dlg = document.getElementById('dialogue');
  for (let i = 0; i < 12; i++) {
    if (!dlg || dlg.classList.contains('hidden')) break;
    const b = [...dlg.querySelectorAll('button')].find((x) => /Далее|Дальше|▶/.test(x.textContent)) || dlg.querySelector('button');
    if (!b) break;
    b.click();
    await new Promise((s) => setTimeout(s, 400));
  }
});
await sleep(200);
res.nonlethal = await page.evaluate(() => {
  const d = window.GameDebug, p = d.player;
  p.hp = 3; p.invuln = 0;
  p.hurt(1, { spawnDust: () => {}, onPlayerHurt: () => {}, shake: 0 }, true);
  return { hp: p.hp, dying: p.dying, vy: Math.round(p.vy) };
});

// ---------- 6. Админ-панель: пер-картная тряска ----------
const adm = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await adm.goto(BASE + '/admin.html', { waitUntil: 'load' });
await adm.waitForFunction(() => !!window.ADMIN, null, { timeout: 15000 });
await sleep(600);
// выбрать карту №2 (первая в списке, key map-1 → id 2)
await adm.evaluate(() => { [...document.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith('№2 ')).click(); });
await sleep(300);
res.adminBefore = await adm.evaluate(() => ({
  quakeChecked: document.getElementById('lvquake').checked,
  optsHidden: document.getElementById('quakeopts').style.display,
}));
// включить тряску и настроить
await adm.evaluate(() => {
  document.getElementById('lvquake').checked = true;
  document.getElementById('lvquake').dispatchEvent(new Event('change', { bubbles: true }));
  document.getElementById('qkpow').value = '1.4';
  document.getElementById('qkpow').dispatchEvent(new Event('input', { bubbles: true }));
  document.getElementById('qkint').value = '15';
  document.getElementById('qkint').dispatchEvent(new Event('input', { bubbles: true }));
  document.getElementById('qkdur').value = '6';
  document.getElementById('qkdur').dispatchEvent(new Event('input', { bubbles: true }));
});
await sleep(500); // debounce saveDrafts 300мс
res.adminEd = await adm.evaluate(() => {
  const m = window.ADMIN.CMS.maps[0];
  return { edQuake: m.ed.quake, defQuake: window.ADMIN.stateToDef(m).quake };
});
// реверсивный тест: defToState(stateToDef) сохраняет quake
res.adminRoundTrip = await adm.evaluate(() => {
  const m = window.ADMIN.CMS.maps[0];
  const def = window.ADMIN.stateToDef(m);
  const st = (typeof defToState === 'function') ? defToState(def) : null;
  return st ? { kept: !!st.quake && st.quake.on && st.quake.power === 1.4 } : { kept: 'defToState недоступен из window' };
});
await adm.screenshot({ path: 'scripts/e2e-admin-quakemap.png' });

// чистим черновик панели (тестовый), сервер не трогаем (публикацию не делали)
await adm.evaluate(() => localStorage.removeItem('adminCmsDrafts_v2'));

res.errors = errors;
out(res);
await browser.close();
