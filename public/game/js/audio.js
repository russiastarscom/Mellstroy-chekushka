// ============================================================
// 8-битный звук на WebAudio (без внешних файлов)
// ============================================================
const Audio8 = (() => {
  let ctx = null;
  let master = null;
  let musicGain = null;
  let enabled = true;
  let musicTimer = null;
  let step = 0;

  function ensure() {
    if (ctx) return true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.16;
      musicGain.connect(master);
    } catch (e) { ctx = null; return false; }
    return true;
  }

  function resume() {
    if (ensure() && ctx.state === 'suspended') ctx.resume();
  }

  // Один тон со скольжением частоты
  function tone(freq, dur, type = 'square', vol = 0.18, slideTo = null, dest = null) {
    if (!enabled || !ensure()) return;
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g); g.connect(dest || master);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }

  // Шум (для томагавка/взрыва)
  function noise(dur = 0.2, vol = 0.2) {
    if (!enabled || !ensure()) return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(g); g.connect(master);
    src.start();
  }

  function seq(notes, type = 'square', vol = 0.15) {
    let t = 0;
    for (const [freq, dur] of notes) {
      setTimeout(() => tone(freq, dur, type, vol), t * 1000);
      t += dur * 0.9;
    }
  }

  const sfx = {
    jump:   () => tone(300, 0.14, 'square', 0.14, 620),
    coin:   () => seq([[988, 0.07], [1319, 0.12]], 'square', 0.13),
    stomp:  () => { tone(220, 0.12, 'square', 0.2, 70); noise(0.08, 0.12); },
    hurt:   () => tone(190, 0.28, 'sawtooth', 0.22, 55),
    heart:  () => seq([[523, 0.08], [659, 0.08], [784, 0.14]], 'triangle', 0.16),
    throw:  () => tone(700, 0.12, 'sawtooth', 0.08, 250),
    click:  () => tone(740, 0.05, 'square', 0.1),
    bossHit:() => { tone(140, 0.2, 'square', 0.24, 60); noise(0.15, 0.2); },
    bossDie:() => { noise(0.5, 0.3); seq([[196, 0.15], [147, 0.15], [98, 0.3]], 'sawtooth', 0.2); },
    win:    () => seq([[523, 0.12], [659, 0.12], [784, 0.12], [1047, 0.25], [784, 0.1], [1047, 0.4]], 'square', 0.16),
    lose:   () => seq([[392, 0.2], [330, 0.2], [262, 0.2], [196, 0.4]], 'sawtooth', 0.16),
    locked: () => tone(160, 0.15, 'square', 0.12, 120),
  };

  // ---------- Музыка: простой чиптюн-луп ----------
  // Бас + изредка мелодия. Играется пока state === playing.
  const BASS = [110, 110, 131, 110, 98, 98, 147, 131]; // A2, C3, G2, D3...
  const MELODY = [
    [440, 494, 523, 494], [440, 392, 330, 392],
    [349, 392, 440, 392], [523, 494, 440, 392],
  ];
  const STEP_MS = 165; // ~восточный темп

  function musicTick() {
    if (!enabled || !ctx) return;
    const s = step % 8;
    // бас
    tone(BASS[s], 0.14, 'triangle', 0.5, null, musicGain);
    // хэт
    if (s % 2 === 0) {
      const len = Math.floor(ctx.sampleRate * 0.03);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource(); src.buffer = buf;
      const g = ctx.createGain(); g.gain.value = 0.10;
      src.connect(g); g.connect(musicGain); src.start();
    }
    // мелодия (каждый второй такт)
    if (step % 16 >= 8) {
      const m = MELODY[Math.floor(step / 16) % MELODY.length];
      tone(m[step % 4], 0.16, 'square', 0.22, null, musicGain);
    }
    step++;
  }

  function startMusic() {
    if (!ensure()) return;
    stopMusic();
    step = 0;
    musicTimer = setInterval(musicTick, STEP_MS);
  }
  function stopMusic() {
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  }

  function setEnabled(v) {
    enabled = v;
    if (!enabled) stopMusic();
  }

  return { sfx, resume, startMusic, stopMusic, setEnabled, isEnabled: () => enabled };
})();
