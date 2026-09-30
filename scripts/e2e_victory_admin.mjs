// E2E: победная анимация + единый файл диалогов + админ-панель v2 (моб. редизайн, экспорт/импорт)
import { chromium } from 'playwright';
const BASE = 'http://localhost:3000/game';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/404|tomahawk|heart|maps-override|game-cms\.json|blob:fake/.test(m.text())) errors.push('CONSOLE: ' + m.text()); });
const res = {};
const ok = (k, v) => { res[k] = v; console.log((v ? '  ✅' : '  ❌') + ' ' + k + (v === true ? '' : ': ' + JSON.stringify(v).slice(0, 160))); };

await page.goto(BASE + '/index.html', { waitUntil: 'load' });
await page.waitForFunction(() => !!window.GameDebug, null, { timeout: 15000 });
await page.evaluate(() => { [...document.querySelectorAll('#screen-gate button')].find((b) => /18/.test(b.textContent)).click(); });
await sleep(400);

// ---------- 1. dialogs.js: единый файл подключён и применился ----------
const d = await page.evaluate(() => {
  const G = window.GAME_DIALOGS;
  const ids = G ? Object.keys(G.byId).map(Number) : [];
  const lv2 = LEVELS.find((x) => x && x.id === 2);
  const sameIntro = !!lv2 && Array.isArray(lv2.dialogue.intro) && Array.isArray(G.byId[2].intro)
    && lv2.dialogue.intro[0].text === G.byId[2].intro[0].text;
  return {
    hasGameDialogs: !!G,
    byIdCount: ids.length,
    commonKeys: G ? Object.keys(G.common) : [],
    level2IntroApplied: sameIntro,
    cutsceneRefKept: LEVELS[0].cutscene === DIALOGUES.intro,
    hintsApplied: Array.isArray(lv2.hints) && lv2.hints.length > 0,
    externalTag: !!document.querySelector('script[src="js/dialogs.js"]'),
  };
});
ok('dialogs.fileLoaded', d.hasGameDialogs);
ok('dialogs.byIdMaps65', d.byIdCount >= 60);
ok('dialogs.commonKeys', d.commonKeys.length >= 4);
ok('dialogs.overrideApplied', d.level2IntroApplied);
ok('dialogs.cutsceneRefKept', d.cutsceneRefKept);
ok('dialogs.hintsApplied', d.hintsApplied);
ok('dialogs.externalInBuild', d.externalTag);

// ---------- 2. Победная анимация ----------
async function skipDialogue() {
  await page.evaluate(async () => {
    const dlg = document.getElementById('dialogue');
    for (let i = 0; i < 14; i++) {
      if (!dlg || dlg.classList.contains('hidden')) break;
      const b = [...dlg.querySelectorAll('button')].find((x) => /Далее|Дальше|▶/.test(x.textContent)) || dlg.querySelector('button');
      if (!b) break; b.click(); await new Promise((s) => setTimeout(s, 300));
    }
  });
}
await page.evaluate(() => GameDebug.startLevel(1));
await sleep(500);
await page.evaluate(() => { GameDebug.finishLevel(); }); // не ждём промис: сначала закроем диалог
await sleep(600);
await skipDialogue();
await sleep(600);
const v = await page.evaluate(() => ({
  completeVisible: !document.getElementById('screen-complete').classList.contains('hidden'),
  confetti: document.querySelectorAll('#confetti-win i').length,
  stamp: !!document.querySelector('#win-stamp'),
  rays: !!document.querySelector('#win-rays'),
  bottle: !!document.querySelector('#win-bottle'),
  titleText: (document.querySelector('#screen-complete .win-title') || {}).textContent || '',
  stampAnim: getComputedStyle(document.querySelector('#win-stamp')).animationName,
}));
ok('victory.screenShown', v.completeVisible);
ok('victory.confetti64', v.confetti >= 50);
ok('victory.stampPresent', v.stamp && v.rays && v.bottle);
ok('victory.title', v.titleText.includes('КАРТА ЗАЧИЩЕНА'));
ok('victory.animRunning', v.stampAnim && v.stampAnim !== 'none');
await page.screenshot({ path: '/home/z/my-project/scripts/e2e-victory.png' });

// ---------- 3. Админ-панель v2 ----------
const ap = await browser.newPage({ viewport: { width: 390, height: 844 } }); // iPhone-размер
const aerr = [];
ap.on('pageerror', (e) => aerr.push('PAGEERROR: ' + e.message));
ap.on('console', (m) => { if (m.type() === 'error' && !/404|maps-override|game-cms\.json|blob:fake|Failed to load resource/.test(m.text())) aerr.push('CONSOLE: ' + m.text()); });
await ap.goto(BASE + '/admin.html', { waitUntil: 'load' });
await ap.waitForTimeout(1800);
const a = await ap.evaluate(() => ({
  tabs: document.querySelectorAll('#modes button[data-mode]').length,
  badge: document.getElementById('rev-badge').textContent,
  statusText: document.getElementById('status').textContent.slice(0, 30),
  tools: document.querySelectorAll('.tool[data-tool]').length,
  canvasReady: !!document.getElementById('cv') && document.getElementById('cv').width > 0,
  lvlTabs: document.querySelectorAll('#lvl-tabs button').length,
  importBtn: !!document.getElementById('btn-import') && !!document.getElementById('importfile'),
  githubBtn: !!document.getElementById('btn-github'),
  dlgIntroLines: document.querySelectorAll('#dlg-intro .line').length,
  dlgIntroFirst: (document.querySelector('#dlg-intro .line textarea') || {}).value || '',
  exportBtn: !!document.getElementById('btn-export'),
}));
ok('admin.noJsErrors', aerr.length === 0);
ok('admin.tabs7', a.tabs === 7);
ok('admin.badge', /ревизия v4-liquid/.test(a.badge));
ok('admin.tools', a.tools >= 19);
ok('admin.canvas', a.canvasReady);
ok('admin.lvlTabs65', a.lvlTabs >= 60);
ok('admin.importPresent', a.importBtn);
ok('admin.githubPresent', a.githubBtn);
ok('admin.dialogsFromDialogsJs', a.dlgIntroLines > 0 && /Город Буримовка/.test(a.dlgIntroFirst));

// вкладки переключаются
for (const m of ['dialogs', 'textures', 'objects', 'music', 'socials', 'quake', 'maps']) {
  await ap.evaluate((m) => document.querySelector(`#modes button[data-mode="${m}"]`).click(), m);
  await ap.waitForTimeout(120);
}
const sw = await ap.evaluate(() => ({
  activePane: document.querySelector('.pane.active').id,
  quakeSliders: !!document.getElementById('qk-power-val') && !!document.getElementById('qk-interval-val'),
  texCards: document.querySelectorAll('#texgrid .tex').length,
}));
ok('admin.tabSwitch', sw.activePane === 'pane-maps' && sw.quakeSliders && sw.texCards > 0);

// модалка GitHub
await ap.evaluate(() => document.getElementById('btn-github').click());
await ap.waitForTimeout(200);
ok('admin.ghHelpOpens', await ap.evaluate(() => document.getElementById('gh-help').classList.contains('open')));
await ap.screenshot({ path: '/home/z/my-project/scripts/e2e-admin-mobile.png' });
await ap.evaluate(() => document.getElementById('btn-gh-close').click());
ok('admin.ghHelpCloses', await ap.evaluate(() => !document.getElementById('gh-help').classList.contains('open')));

// экспорт: клик должен вызвать скачивание (перехватываем blob)
await ap.evaluate(() => { window.__dl = null; const orig = URL.createObjectURL; URL.createObjectURL = (b) => { window.__dl = b && b.size; return 'blob:fake'; }; document.getElementById('btn-export').click(); URL.createObjectURL = orig; });
await ap.waitForTimeout(300);
ok('admin.exportBuildsPayload', await ap.evaluate(() => window.__dl > 5000));

// моб. вид: панель по умолчанию СВЁРНУТА (не перекрывает карту), вкладки в одну строку
const mob = await ap.evaluate(() => {
  const ab = document.getElementById('actionbar').getBoundingClientRect();
  const modes = document.getElementById('modes');
  return {
    abFixedBottom: Math.abs(ab.bottom - window.innerHeight) < 3,
    modesScrollable: modes.scrollWidth >= modes.clientWidth - 4,
    collapsedByDefault: document.getElementById('actionbar').classList.contains('collapsed'),
    handleVisible: document.getElementById('bar-handle').getBoundingClientRect().height > 10,
    lowProfile: ab.height < 60,
  };
});
ok('admin.mobile.actionbar', mob.abFixedBottom);
ok('admin.mobile.modesScroll', mob.modesScrollable);
ok('admin.mobile.barCollapsedByDefault', mob.collapsedByDefault);
ok('admin.mobile.handleVisible', mob.handleVisible);
ok('admin.mobile.lowProfileWhenCollapsed', mob.lowProfile);
// разворачиваем — появляются оба ряда кнопок (сначала закрываем модалку GitHub-инструкции от теста экспорта)
await ap.evaluate(() => document.getElementById('gh-help').classList.remove('open'));
await ap.click('#bar-handle');
await ap.waitForTimeout(250);
ok('admin.mobile.twoRows', await ap.evaluate(() => {
  const ab = document.getElementById('actionbar').getBoundingClientRect();
  return ab.height > 90 && !document.getElementById('actionbar').classList.contains('collapsed');
}));

console.log('\n==== ИТОГ ====');
const fails = Object.entries(res).filter(([, v]) => v === false);
console.log('ПРОЙДЕНО:', Object.values(res).filter((x) => x === true).length, '/', Object.keys(res).length);
if (fails.length) { console.log('ПРОВАЛЫ:', fails.map(([k]) => k).join(', ')); }
if (errors.length) console.log('ОШИБКИ ИГРЫ:', errors.slice(0, 5));
if (aerr.length) console.log('ОШИБКИ АДМИНКИ:', aerr.slice(0, 5));
await browser.close();
process.exit(fails.length || errors.length || aerr.length ? 1 : 0);
