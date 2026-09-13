// ============================================================
// UI: меню, HUD, диалоги, катсцены, экраны
// ============================================================
const UI = (() => {
  const $ = (id) => document.getElementById(id);
  const cb = {}; // колбэки от Game

  const SCREENS = ['gate', 'menu', 'levels', 'controls', 'pause', 'gameover', 'complete', 'ending', 'indev', 'tooyoung'];
  let currentScreen = 'menu';

  // ---------- экраны ----------
  function showScreen(name) {
    currentScreen = name;
    SCREENS.forEach((s) => $('screen-' + s).classList.toggle('hidden', s !== name));
    const inGame = name === null;
    $('hud').classList.toggle('hidden', !inGame && name !== 'pause');
    if (name !== null && name !== 'pause') $('dialogue').classList.add('hidden');
  }

  // ---------- HUD ----------
  function setHud({ hp, bottles, levelName }) {
    if (hp !== undefined) {
      const hearts = $('hud-hearts').children;
      for (let i = 0; i < hearts.length; i++) hearts[i].classList.toggle('empty', i >= hp);
    }
    if (bottles !== undefined) $('hud-bottles-count').textContent = bottles;
    if (levelName !== undefined) $('hud-level').textContent = levelName;
  }

  // ---------- Диалоги (внизу экрана) ----------
  const WHO_PORTRAIT = { andrey: 'andrey', enemy: 'burmaldenets', boss: 'boss', radio: 'checkushka', narrator: null };
  const dlg = { lines: [], i: 0, typing: false, timer: null, resolve: null };

  function dialogue(lines) {
    return new Promise((resolve) => {
      dlg.lines = lines || [];
      dlg.i = 0;
      dlg.resolve = resolve;
      if (!dlg.lines.length) { resolve(); return; }
      $('dialogue').classList.remove('hidden');
      showDlgLine();
    });
  }

  function showDlgLine() {
    const line = dlg.lines[dlg.i];
    const key = WHO_PORTRAIT[line.who];
    const pc = $('portrait-canvas');
    if (key) { pc.style.display = ''; Sprites.portrait(key, pc); }
    else pc.style.display = 'none';
    $('dialogue-name').textContent = line.who === 'narrator' ? '• • •' : (CONFIG.NAMES[line.who] || line.who);
    // печатающийся текст
    const el = $('dialogue-text');
    el.textContent = '';
    dlg.typing = true;
    let pos = 0;
    clearInterval(dlg.timer);
    dlg.timer = setInterval(() => {
      pos += 2;
      el.textContent = line.text.slice(0, pos);
      if (pos >= line.text.length) { clearInterval(dlg.timer); dlg.typing = false; }
    }, 24);
  }

  function advanceDialogue() {
    Audio8.sfx.click();
    if (dlg.typing) {
      clearInterval(dlg.timer);
      $('dialogue-text').textContent = dlg.lines[dlg.i].text;
      dlg.typing = false;
      return;
    }
    dlg.i++;
    if (dlg.i < dlg.lines.length) showDlgLine();
    else {
      $('dialogue').classList.add('hidden');
      const r = dlg.resolve; dlg.resolve = null;
      if (r) r();
    }
  }

  // ---------- Катсцена ----------
  const cut = { scenes: [], i: 0, resolve: null, typing: false, timer: null };

  function cutscene(scenes, bgs) {
    return new Promise((resolve) => {
      cut.scenes = scenes || [];
      cut.bgs = bgs || {};
      cut.i = 0;
      cut.resolve = resolve;
      if (!cut.scenes.length) { resolve(); return; }
      showScreen(null);
      $('screen-cutscene').classList.remove('hidden');
      showCutScene();
    });
  }

  function cutPortrait(who) {
    const key = WHO_PORTRAIT[who];
    const el = $('cutscene-portrait');
    if (!key) { el.style.backgroundImage = 'none'; el.textContent = who === 'narrator' ? '🎬' : '📻'; return; }
    const tmp = document.createElement('canvas');
    tmp.width = 96; tmp.height = 96;
    Sprites.portrait(key, tmp);
    el.textContent = '';
    el.style.backgroundImage = `url(${tmp.toDataURL()})`;
  }

  function showCutScene() {
    const s = cut.scenes[cut.i];
    const bgKey = cut.bgs[cut.i] || 'bg_city';
    const bg = Sprites.get(bgKey);
    const el = $('cutscene-bg');
    if (bg && bg.img) el.style.background = `url(${bg.img.src}) center/cover no-repeat`;
    else el.style.background = 'linear-gradient(180deg, #23234a 0%, #12122b 55%, #3a1f2b 100%)';
    cutPortrait(s.who);
    $('cutscene-name').textContent = s.who === 'narrator' ? '• • •' : (CONFIG.NAMES[s.who] || s.who);
    const textEl = $('cutscene-text');
    textEl.textContent = '';
    cut.typing = true;
    let pos = 0;
    clearInterval(cut.timer);
    cut.timer = setInterval(() => {
      pos += 2;
      textEl.textContent = s.text.slice(0, pos);
      if (pos >= s.text.length) { clearInterval(cut.timer); cut.typing = false; }
    }, 26);
  }

  function advanceCutscene() {
    Audio8.sfx.click();
    if (cut.typing) {
      clearInterval(cut.timer);
      $('cutscene-text').textContent = cut.scenes[cut.i].text;
      cut.typing = false;
      return;
    }
    cut.i++;
    if (cut.i < cut.scenes.length) showCutScene();
    else finishCutscene();
  }

  function finishCutscene() {
    clearInterval(cut.timer);
    $('screen-cutscene').classList.add('hidden');
    const r = cut.resolve; cut.resolve = null;
    if (r) r();
  }

  // ---------- Выбор уровня ----------
  function buildLevelsGrid(progress) {
    const grid = $('levels-grid');
    grid.innerHTML = '';
    LEVELS.forEach((lv, i) => {
      const isLast = lv.type === 'indev';
      const done = progress.done[i];
      const unlocked = isLast ? true : i < progress.unlocked;
      const card = document.createElement('button');
      card.className = 'level-card' + (unlocked ? '' : ' locked');
      const state = isLast ? '🚧' : done ? '✔' : unlocked ? '▶' : '🔒';
      card.innerHTML = `<span class="num">${lv.id}</span><span class="name">${lv.name}</span><span class="state">${state}</span>`;
      card.addEventListener('click', () => { Audio8.resume(); if (!unlocked) { Audio8.sfx.locked(); return; } Audio8.sfx.click(); cb.onLevelPick(i); });
      grid.appendChild(card);
    });
  }

  // ---------- Соцсети ----------
  function buildSocials() {
    const box = $('socials');
    box.innerHTML = '';
    CONFIG.SOCIALS.forEach((s) => {
      const a = document.createElement('a');
      a.className = 'social-btn ' + (s.class || 'tg');
      a.textContent = s.name;
      a.href = s.url || '#';
      a.target = '_blank';
      a.rel = 'noopener';
      box.appendChild(a);
    });
  }

  // ---------- Звук ----------
  function updateSoundButtons() {
    const label = 'ЗВУК: ' + (Audio8.isEnabled() ? 'ВКЛ' : 'ВЫКЛ');
    $('btn-sound').textContent = label;
    $('btn-pause-sound').textContent = label;
  }

  // ---------- Полный экран ----------
  function showComplete(text, hasNext) {
    $('complete-text').innerHTML = text;
    $('btn-next').style.display = hasNext ? '' : 'none';
    showScreen('complete');
  }

  // ---------- Инициализация ----------
  function init(callbacks) {
    Object.assign(cb, callbacks);

    $('btn-play').addEventListener('click', () => { Audio8.resume(); Audio8.sfx.click(); cb.onPlay(); });

    // 18+ гейт
    $('btn-gate-yes').addEventListener('click', () => { Audio8.resume(); Audio8.sfx.click(); showScreen('menu'); });
    $('btn-gate-no').addEventListener('click', () => { Audio8.resume(); Audio8.sfx.click(); showScreen('tooyoung'); });
    $('btn-tooyoung-back').addEventListener('click', () => { Audio8.sfx.click(); showScreen('gate'); });
    $('btn-levels').addEventListener('click', () => { Audio8.resume(); Audio8.sfx.click(); buildLevelsGrid(cb.getProgress()); showScreen('levels'); });
    $('btn-levels-back').addEventListener('click', () => { Audio8.sfx.click(); showScreen('menu'); });
    $('btn-controls').addEventListener('click', () => { Audio8.sfx.click(); showScreen('controls'); });
    $('btn-controls-back').addEventListener('click', () => { Audio8.sfx.click(); showScreen('menu'); });

    $('btn-sound').addEventListener('click', () => { Audio8.setEnabled(!Audio8.isEnabled()); updateSoundButtons(); Audio8.sfx.click(); });
    $('btn-pause-sound').addEventListener('click', () => { Audio8.setEnabled(!Audio8.isEnabled()); updateSoundButtons(); Audio8.sfx.click(); });

    $('btn-pause').addEventListener('click', () => { Audio8.sfx.click(); cb.onPause(); });
    $('btn-resume').addEventListener('click', () => { Audio8.sfx.click(); cb.onResume(); });
    $('btn-restart').addEventListener('click', () => { Audio8.sfx.click(); cb.onRestart(); });
    $('btn-pause-menu').addEventListener('click', () => { Audio8.sfx.click(); cb.onMenu(); });

    $('btn-retry').addEventListener('click', () => { Audio8.sfx.click(); cb.onRetry(); });
    $('btn-gameover-menu').addEventListener('click', () => { Audio8.sfx.click(); cb.onMenu(); });
    $('btn-next').addEventListener('click', () => { Audio8.sfx.click(); cb.onNext(); });
    $('btn-complete-menu').addEventListener('click', () => { Audio8.sfx.click(); cb.onMenu(); });

    $('btn-cutscene-next').addEventListener('click', advanceCutscene);
    $('btn-cutscene-skip').addEventListener('click', () => { Audio8.sfx.click(); finishCutscene(); });
    $('screen-cutscene').addEventListener('click', (e) => {
      if (e.target.id === 'cutscene-bg' || e.target.id === 'screen-cutscene') advanceCutscene();
    });

    $('btn-ending-menu').addEventListener('click', () => { Audio8.sfx.click(); cb.onMenu(); });
    $('btn-indev-menu').addEventListener('click', () => { Audio8.sfx.click(); cb.onMenu(); });

    // диалог: клик по кнопке и по самому окну
    $('dialogue-next').addEventListener('click', advanceDialogue);
    $('dialogue').addEventListener('click', (e) => { if (e.target.id === 'dialogue-text' || e.target.id === 'dialogue-body') advanceDialogue(); });

    // клавиатура в диалогах/катсценах: пробел/enter = далее
    document.addEventListener('keydown', (e) => {
      if ((e.code === 'Space' || e.code === 'Enter')) {
        if (!$('screen-cutscene').classList.contains('hidden')) { e.preventDefault(); advanceCutscene(); }
        else if (!$('dialogue').classList.contains('hidden')) { e.preventDefault(); advanceDialogue(); }
      }
    });

    buildSocials();
    updateSoundButtons();
  }

  return {
    init, showScreen, setHud, dialogue, cutscene,
    buildLevelsGrid, updateSoundButtons, showComplete,
  };
})();
