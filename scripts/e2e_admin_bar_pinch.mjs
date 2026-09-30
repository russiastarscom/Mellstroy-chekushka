// E2E: скрываемая нижняя панель + зум карты щипком двумя пальцами (админ-панель)
import { chromium, devices } from 'playwright';
const BASE = 'http://localhost:3000/game';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch();
const errors = [];
const res = {};
const ok = (k, v) => { res[k] = v; console.log((v ? '  ✅' : '  ❌') + ' ' + k + (v === true ? '' : ': ' + JSON.stringify(v).slice(0, 200))); };

// ---------- 1. Мобильный вьюпорт: панель по умолчанию свёрнута ----------
const ctxM = await browser.newContext({ ...devices['iPhone 13'] });
const pm = await ctxM.newPage();
pm.on('pageerror', (e) => errors.push('PAGEERROR-M: ' + e.message));
pm.on('console', (m) => { if (m.type() === 'error' && !/404|game-cms|Failed to load resource/.test(m.text())) errors.push('CONSOLE-M: ' + m.text()); });
await pm.goto(BASE + '/admin.html', { waitUntil: 'load' });
await pm.waitForFunction(() => !!window.ADMIN, null, { timeout: 15000 });
await sleep(400);

const mobDefault = await pm.evaluate(() => ({
  collapsed: document.getElementById('actionbar').classList.contains('collapsed'),
  bodyCls: document.body.classList.contains('bar-collapsed'),
  label: document.getElementById('bar-label').textContent,
  handleVisible: (() => { const h = document.getElementById('bar-handle').getBoundingClientRect(); return h.height > 10 && h.bottom <= innerHeight + 1; })(),
}));
ok('mobile.defaultCollapsed', mobDefault.collapsed === true);
ok('mobile.bodyBarCollapsed', mobDefault.bodyCls === true);
ok('mobile.labelShowPanel', /ПОКАЗАТЬ ПАНЕЛЬ/.test(mobDefault.label));
ok('mobile.handleVisibleWhenCollapsed', mobDefault.handleVisible);

// разворот панели на мобиле
await pm.click('#bar-handle');
await sleep(150);
const mobExpanded = await pm.evaluate(() => ({
  collapsed: document.getElementById('actionbar').classList.contains('collapsed'),
  pubVisible: (() => { const b = document.getElementById('btn-publish').getBoundingClientRect(); return b.height > 20; })(),
  bodyPad: getComputedStyle(document.body).paddingBottom,
}));
ok('mobile.expandOnClick', mobExpanded.collapsed === false);
ok('mobile.publishVisibleWhenOpen', mobExpanded.pubVisible === true);
// localStorage запомнил
ok('mobile.persisted0', await pm.evaluate(() => localStorage.getItem('adminBarCollapsed_v1') === '0'));

// ---------- 2. Pinch-зум на мобиле (синтетические pointer-события) ----------
await pm.click('#bar-handle'); await sleep(150); // свернём обратно — пусть не мешает
// поднимем зум кнопками, чтобы было куда щипать внутрь (на узком экране fitZoom даёт минимум 10px)
await pm.evaluate(() => { for (let i = 0; i < 3; i++) document.getElementById('zoom-in').click(); });
await sleep(150);
const pinch = await pm.evaluate(async () => {
  const cv = document.getElementById('cv');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const fire = (type, id, x, y) => cv.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, bubbles: true, isPrimary: id === 7 }));
  const cs0 = window.zoomCs ? window.zoomCs() : null;
  // состояние зума читаем через DOM-подпись #zoom-val
  const z0 = document.getElementById('zoom-val').textContent;
  const r = cv.getBoundingClientRect();
  const cx = r.left + Math.min(200, r.width / 2), cy = r.top + Math.min(120, r.height / 2);
  // два пальца кладутся на карту
  fire('pointerdown', 7, cx - 60, cy - 40);
  fire('pointerdown', 8, cx + 60, cy + 40);
  // сводим пальцы (щипок внутрь = зум -)
  for (let i = 1; i <= 5; i++) {
    fire('pointermove', 7, cx - 60 + i * 8, cy - 40 + i * 5);
    fire('pointermove', 8, cx + 60 - i * 8, cy + 40 - i * 5);
    await sleep(30);
  }
  const zMid = document.getElementById('zoom-val').textContent;
  // разводим сильнее исходного (щипок наружу = зум +)
  for (let i = 1; i <= 8; i++) {
    fire('pointermove', 7, cx - 60 - 20 - i * 12, cy - 40 - 10 - i * 9);
    fire('pointermove', 8, cx + 60 + 20 + i * 12, cy + 40 + 10 + i * 9);
    await sleep(30);
  }
  const zOut = document.getElementById('zoom-val').textContent;
  fire('pointerup', 7, 0, 0);
  fire('pointerup', 8, 0, 0);
  const parse = (s) => parseInt(s) || 0;
  return { z0, zMid, zOut, z0v: parse(z0), zMidv: parse(zMid), zOutv: parse(zOut) };
});
ok('pinch.zoomOutWorks', pinch.zMidv < pinch.z0v, `${pinch.z0} → ${pinch.zMid}`);
ok('pinch.zoomInWorks', pinch.zOutv > pinch.z0v, `${pinch.z0} → ${pinch.zOut}`);
ok('pinch.clampedRange', pinch.zOutv <= 40 && pinch.zMidv >= 10);

// после щипка один палец не красит карту (кисть выключена до нового касания)
const noPaint = await pm.evaluate(() => {
  const cv = document.getElementById('cv');
  const st = window.ADMIN.CMS.maps[window.ADMIN.curMap].ed;
  const before = JSON.stringify(st.cells);
  const fire = (type, id, x, y) => cv.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, bubbles: true }));
  const r = cv.getBoundingClientRect();
  // «висящий» палец двигается после щипка — красить не должен
  fire('pointermove', 9, r.left + 30, r.top + 30);
  fire('pointerup', 9, r.left + 30, r.top + 30);
  return JSON.stringify(st.cells) === before;
});
ok('pinch.noAccidentalPaint', noPaint === true);

// обычное касание по-прежнему красит (кисть «кирпич» в верхний ряд)
const paintOk = await pm.evaluate(() => {
  const cv = document.getElementById('cv');
  document.querySelector('.tool[data-tool="B"]').click(); // кирпич — любой ряд
  const st = window.ADMIN.CMS.maps[window.ADMIN.curMap].ed;
  const fire = (type, id, x, y) => cv.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, bubbles: true }));
  const r = cv.getBoundingClientRect();
  const cs = parseFloat(document.getElementById('zoom-val').textContent);
  // ищем пустую клетку в 3-м ряду
  let c = -1;
  for (let i = 2; i < st.cells[3].length; i++) if (st.cells[3][i] === '.') { c = i; break; }
  if (c < 0) return 'no-empty-cell';
  const x = r.left + c * cs + 5;
  const y = r.top + 14 + 3 * cs + 5;
  fire('pointerdown', 11, x, y);
  fire('pointerup', 11, x, y);
  return st.cells[3][c] === 'B';
});
ok('tap.stillPaints', paintOk === true || paintOk === 'no-empty-cell', String(paintOk));

// кнопки зума с якорем-центром
const btnZoom = await pm.evaluate(() => {
  document.getElementById('zoom-in').click();
  return document.getElementById('zoom-val').textContent;
});
ok('zoomBtns.work', /px/.test(btnZoom));
await pm.close(); await ctxM.close();

// ---------- 3. Десктоп: панель по умолчанию развёрнута ----------
const ctxD = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const pd = await ctxD.newPage();
pd.on('pageerror', (e) => errors.push('PAGEERROR-D: ' + e.message));
await pd.goto(BASE + '/admin.html', { waitUntil: 'load' });
await pd.waitForFunction(() => !!window.ADMIN, null, { timeout: 15000 });
await sleep(300);
const d = await pd.evaluate(() => ({
  collapsed: document.getElementById('actionbar').classList.contains('collapsed'),
  rows: document.querySelectorAll('#actionbar .row').length,
}));
ok('desktop.defaultExpanded', d.collapsed === false);
ok('desktop.twoRows', d.rows === 2);
// свернуть/развернуть
await pd.click('#bar-handle'); await sleep(120);
const dC = await pd.evaluate(() => ({
  collapsed: document.getElementById('actionbar').classList.contains('collapsed'),
  rowsHidden: [...document.querySelectorAll('#actionbar .row')].every((r) => getComputedStyle(r).display === 'none'),
}));
ok('desktop.collapseOnClick', dC.collapsed === true);
ok('desktop.rowsHidden', dC.rowsHidden === true);
await pd.screenshot({ path: '/home/z/my-project/scripts/e2e-admin-bar-collapsed.png', fullPage: false });
await pd.click('#bar-handle'); await sleep(120);
ok('desktop.expandAgain', await pd.evaluate(() => !document.getElementById('actionbar').classList.contains('collapsed')));

ok('noPageErrors', errors.length === 0, errors.slice(0, 4).join(' | '));
await pd.close(); await ctxD.close();
await browser.close();
const fails = Object.entries(res).filter(([, v]) => v !== true && v !== 'no-empty-cell');
console.log(fails.length ? '\nFAILED: ' + fails.map(([k]) => k).join(', ') : '\nALL PASS (' + Object.keys(res).length + ')');
process.exit(fails.length ? 1 : 0);
