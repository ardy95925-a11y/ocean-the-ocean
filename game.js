/* game.js — Core Rhythm Game Engine */

// =============================================
// SONG DEFINITIONS — Procedurally generated patterns
// =============================================
const SONGS = [
  {
    name: "Dance of Embers",
    bpm: 120,
    duration: 90,
    patterns: {
      easy: genPattern(120, 90, 0.4, 0.2),
      normal: genPattern(120, 90, 0.65, 0.35),
      hard: genPattern(120, 90, 0.9, 0.55),
    }
  },
  {
    name: "Blizzard Waltz",
    bpm: 140,
    duration: 90,
    patterns: {
      easy: genPattern(140, 90, 0.45, 0.25),
      normal: genPattern(140, 90, 0.7, 0.4),
      hard: genPattern(140, 90, 0.95, 0.65),
    }
  },
  {
    name: "Eternal Storm",
    bpm: 160,
    duration: 90,
    patterns: {
      easy: genPattern(160, 90, 0.5, 0.3),
      normal: genPattern(160, 90, 0.75, 0.45),
      hard: genPattern(160, 90, 1.0, 0.75),
    }
  }
];

function genPattern(bpm, duration, fireDensity, iceDensity) {
  const notes = [];
  const beatInterval = 60 / bpm;
  const totalBeats = Math.floor(duration / beatInterval);
  const rng = mulberry32(bpm * duration);

  for (let b = 0; b < totalBeats; b++) {
    const t = b * beatInterval + 1.5; // start offset
    if (t > duration - 2) break;

    // Fire notes (bottom, keys F G H J = lanes 0-3)
    for (let lane = 0; lane < 4; lane++) {
      if (rng() < fireDensity * (b % 4 === 0 ? 1.8 : 1) * 0.22) {
        notes.push({ time: t + rng() * beatInterval * 0.25, type: 'fire', lane });
      }
    }
    // Ice notes (top, keys S D K L = lanes 0-3)
    for (let lane = 0; lane < 4; lane++) {
      if (rng() < iceDensity * (b % 4 === 2 ? 1.8 : 1) * 0.18) {
        notes.push({ time: t + rng() * beatInterval * 0.25, type: 'ice', lane });
      }
    }
  }

  // Sort by time
  notes.sort((a, b) => a.time - b.time);

  // Deduplicate (no two notes within 0.12s in same lane+type)
  const filtered = [];
  const lastTime = {};
  for (const n of notes) {
    const key = `${n.type}${n.lane}`;
    if (!lastTime[key] || n.time - lastTime[key] > 0.12) {
      filtered.push(n);
      lastTime[key] = n.time;
    }
  }

  return filtered;
}

// Simple seeded RNG
function mulberry32(seed) {
  let s = seed;
  return function() {
    s |= 0; s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// =============================================
// GAME STATE
// =============================================
const GAME = {
  state: 'menu',          // menu | countdown | playing | paused | result
  difficulty: 'easy',
  songIndex: 0,
  score: 0,
  combo: 0,
  maxCombo: 0,
  perfectCount: 0,
  goodCount: 0,
  missCount: 0,
  startTime: 0,
  elapsed: 0,
  notes: [],              // { time, type, lane, el, hit, missed }
  totalNotes: 0,
  noteSpeed: 2.2,         // seconds to traverse screen height
};

// Lane dimensions
const LANE_KEYS = {
  // Fire (bottom) — F G H J
  'f': { type: 'fire', lane: 0 },
  'g': { type: 'fire', lane: 1 },
  'h': { type: 'fire', lane: 2 },
  'j': { type: 'fire', lane: 3 },
  // Ice (top) — S D K L
  's': { type: 'ice', lane: 0 },
  'd': { type: 'ice', lane: 1 },
  'k': { type: 'ice', lane: 2 },
  'l': { type: 'ice', lane: 3 },
  // Arrows as alternates for ice
  'ArrowLeft':  { type: 'ice', lane: 0 },
  'ArrowDown':  { type: 'ice', lane: 1 },
  'ArrowUp':    { type: 'ice', lane: 2 },
  'ArrowRight': { type: 'ice', lane: 3 },
};

const DIFF_SETTINGS = {
  easy:   { hitWindow: 0.22, goodWindow: 0.4,  noteSpeed: 2.8, bpmMult: 1 },
  normal: { hitWindow: 0.16, goodWindow: 0.3,  noteSpeed: 2.2, bpmMult: 1 },
  hard:   { hitWindow: 0.11, goodWindow: 0.22, noteSpeed: 1.7, bpmMult: 1 },
};

// =============================================
// DOM REFS
// =============================================
const $ = id => document.getElementById(id);
const screens = {
  menu:   $('menuScreen'),
  game:   $('gameScreen'),
  pause:  $('pauseScreen'),
  result: $('resultScreen'),
};

function showScreen(name) {
  Object.keys(screens).forEach(k => {
    screens[k].style.display = 'none';
    screens[k].classList.remove('active');
  });
  if (screens[name]) {
    screens[name].style.display = 'flex';
    screens[name].classList.add('active');
  }
}

// =============================================
// MENU
// =============================================
document.querySelectorAll('.diff-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    GAME.difficulty = btn.dataset.diff;
  });
});

$('startBtn').addEventListener('click', async () => {
  await audioEngine.init();
  GAME.songIndex = Math.floor(Math.random() * SONGS.length);
  startCountdown();
});

// =============================================
// COUNTDOWN
// =============================================
function startCountdown() {
  showScreen('game');
  window._gameRunning = false;

  // Create countdown overlay
  let cd = document.getElementById('countdown');
  if (!cd) {
    cd = document.createElement('div');
    cd.id = 'countdown';
    const num = document.createElement('div');
    num.id = 'countdownNum';
    cd.appendChild(num);
    $('gameScreen').appendChild(cd);
  }
  cd.style.display = 'flex';

  let count = 3;
  const tick = () => {
    const numEl = $('countdownNum');
    if (count > 0) {
      numEl.textContent = count;
      numEl.style.animation = 'none';
      void numEl.offsetWidth; // reflow
      numEl.style.animation = 'countPop 0.8s ease-out forwards';
      audioEngine.playCountdown(count);
      count--;
      setTimeout(tick, 850);
    } else {
      numEl.textContent = 'GO!';
      numEl.style.animation = 'none';
      void numEl.offsetWidth;
      numEl.style.animation = 'countPop 0.8s ease-out forwards';
      audioEngine.playCountdown(0);
      setTimeout(() => {
        cd.style.display = 'none';
        startGame();
      }, 850);
    }
  };
  tick();
}

// =============================================
// GAME START
// =============================================
function startGame() {
  const song = SONGS[GAME.songIndex];
  const diff = DIFF_SETTINGS[GAME.difficulty];
  const pattern = song.patterns[GAME.difficulty];

  // Reset state
  GAME.score = 0;
  GAME.combo = 0;
  GAME.maxCombo = 0;
  GAME.perfectCount = 0;
  GAME.goodCount = 0;
  GAME.missCount = 0;
  GAME.state = 'playing';
  GAME.noteSpeed = diff.noteSpeed;

  // Clear existing notes
  document.querySelectorAll('.note').forEach(n => n.remove());
  GAME.notes = [];

  // Set CSS variable for note speed
  document.documentElement.style.setProperty('--note-speed', `${diff.noteSpeed}s`);

  // Create note objects
  GAME.totalNotes = pattern.length;
  GAME.notes = pattern.map(n => ({
    ...n,
    el: null,
    hit: false,
    missed: false,
    spawned: false,
  }));

  // UI setup
  $('songName').textContent = `${song.name} — ${['EMBER','BLAZE','INFERNO'][['easy','normal','hard'].indexOf(GAME.difficulty)]}`;
  $('bpmDisplay').textContent = `♪ ${song.bpm} BPM`;
  updateUI();

  // Start music
  audioEngine.startMusic(song.bpm);

  // Start game loop
  GAME.startTime = performance.now();
  window._gameRunning = true;
  requestAnimationFrame(gameLoop);
}

// =============================================
// GAME LOOP
// =============================================
let lastRaf = 0;
function gameLoop(timestamp) {
  if (GAME.state !== 'playing') return;

  const song = SONGS[GAME.songIndex];
  GAME.elapsed = (timestamp - GAME.startTime) / 1000;

  // Song progress
  const progress = Math.min(GAME.elapsed / song.duration, 1);
  $('songProgress').style.width = `${progress * 100}%`;

  // Spawn & update notes
  updateNotes(GAME.elapsed);

  // Check for end
  if (GAME.elapsed >= song.duration && GAME.notes.every(n => n.hit || n.missed)) {
    endGame();
    return;
  }
  // Auto-end if past song duration + buffer
  if (GAME.elapsed >= song.duration + 3) {
    endGame();
    return;
  }

  requestAnimationFrame(gameLoop);
}

// =============================================
// NOTE SPAWNING & MOVEMENT
// =============================================
function getLaneEl(type, lane) {
  return document.getElementById(`${type}Lane${lane}`);
}

function updateNotes(elapsed) {
  const speed = GAME.noteSpeed;
  const song = SONGS[GAME.songIndex];

  for (const note of GAME.notes) {
    if (note.hit || note.missed) continue;

    const timeUntilHit = note.time - elapsed;

    // Spawn note when it needs to enter the screen
    if (!note.spawned && timeUntilHit <= speed) {
      spawnNote(note, speed);
    }

    // Position note
    if (note.spawned && note.el) {
      const t = note.time - elapsed;
      // t=speed → top/bottom of screen, t=0 → hit zone
      let progress;

      if (note.type === 'fire') {
        // Fire notes come from bottom, move upward (or notes fall down from top into bottom hitzone)
        // Notes fall from above hit zone to hit zone at bottom
        progress = t / speed; // 1 = at spawn (top), 0 = at hit zone (bottom)
        const laneEl = getLaneEl('fire', note.lane);
        if (!laneEl) continue;
        const laneH = laneEl.offsetHeight;
        const hitZoneH = 64;
        // Place note: at progress=1 → y=0 (top), at progress=0 → y=laneH-hitZoneH-21 (center of hitzone)
        const y = (1 - progress) * (laneH - hitZoneH) + (hitZoneH / 2 - 21);
        note.el.style.top = `${y}px`;
      } else {
        // Ice notes come from above hit zone (at top) going down
        progress = t / speed; // 1 = at spawn (bottom), 0 = at hit zone (top)
        const laneEl = getLaneEl('ice', note.lane);
        if (!laneEl) continue;
        const laneH = laneEl.offsetHeight;
        const hitZoneH = 64;
        // At progress=1 → y=laneH-21 (bottom), at progress=0 → y=hitZoneH/2-21 (center of hitzone at top)
        const y = laneH - progress * (laneH - hitZoneH) - 21;
        note.el.style.top = `${y}px`;
      }

      // Auto-miss: if note passes hit window
      if (elapsed > note.time + 0.4 && !note.hit && !note.missed) {
        note.missed = true;
        registerMiss(note);
      }

      // Fade out if missed
      if (note.missed && note.el) {
        note.el.style.opacity = '0';
        note.el.style.transform = 'scaleY(0.5)';
        setTimeout(() => { if (note.el && note.el.parentNode) note.el.remove(); }, 300);
      }
    }
  }
}

function spawnNote(note, speed) {
  note.spawned = true;
  const laneEl = getLaneEl(note.type, note.lane);
  if (!laneEl) return;

  const el = document.createElement('div');
  el.className = `note ${note.type}-note`;
  // Start at the appropriate edge
  if (note.type === 'fire') {
    el.style.top = '0px';
  } else {
    el.style.top = `${laneEl.offsetHeight - 42}px`;
  }
  el.style.transition = 'none';
  laneEl.appendChild(el);
  note.el = el;
}

// =============================================
// INPUT HANDLING
// =============================================
const pressedKeys = new Set();

document.addEventListener('keydown', e => {
  if (pressedKeys.has(e.key)) return;
  pressedKeys.add(e.key);

  if (GAME.state === 'playing') {
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const mapping = LANE_KEYS[key];
    if (mapping) {
      e.preventDefault();
      handleLanePress(mapping.type, mapping.lane);
    }
    if (e.key === 'Escape') togglePause();
  } else if (GAME.state === 'paused') {
    if (e.key === 'Escape') togglePause();
  }
});

document.addEventListener('keyup', e => {
  pressedKeys.delete(e.key);
});

// Touch support
['fireLane0','fireLane1','fireLane2','fireLane3'].forEach((id, i) => {
  const el = $(id);
  if (el) el.addEventListener('touchstart', (e) => {
    e.preventDefault();
    handleLanePress('fire', i);
  }, { passive: false });
});
['iceLane0','iceLane1','iceLane2','iceLane3'].forEach((id, i) => {
  const el = $(id);
  if (el) el.addEventListener('touchstart', (e) => {
    e.preventDefault();
    handleLanePress('ice', i);
  }, { passive: false });
});

function handleLanePress(type, lane) {
  if (GAME.state !== 'playing') return;
  const elapsed = GAME.elapsed;
  const diff = DIFF_SETTINGS[GAME.difficulty];

  // Visual lane flash
  const laneEl = getLaneEl(type, lane);
  if (laneEl) {
    laneEl.classList.add('active');
    setTimeout(() => laneEl.classList.remove('active'), 120);
  }

  // Particle burst at hit zone
  if (laneEl) {
    const rect = laneEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = type === 'fire' ? rect.bottom - 32 : rect.top + 32;
    if (type === 'fire') window.particles.spawnFireBurst(cx, cy, 10);
    else window.particles.spawnIceBurst(cx, cy, 10);
  }

  // Find closest unhit note in this lane within window
  let best = null;
  let bestDiff = Infinity;

  for (const note of GAME.notes) {
    if (note.hit || note.missed) continue;
    if (note.type !== type || note.lane !== lane) continue;
    const dt = Math.abs(note.time - elapsed);
    if (dt < bestDiff && dt < diff.goodWindow) {
      bestDiff = dt;
      best = note;
    }
  }

  if (!best) return; // No note → no penalty

  best.hit = true;
  if (best.el) {
    best.el.style.transition = 'transform 0.1s, opacity 0.1s';
    best.el.style.transform = 'scale(1.3)';
    best.el.style.opacity = '0';
    setTimeout(() => { if (best.el && best.el.parentNode) best.el.remove(); }, 150);
  }

  const dt = Math.abs(best.time - elapsed);
  if (dt <= diff.hitWindow) {
    registerPerfect(type);
  } else {
    registerGood(type);
  }
}

// =============================================
// SCORING
// =============================================
function registerPerfect(type) {
  GAME.perfectCount++;
  GAME.combo++;
  GAME.maxCombo = Math.max(GAME.maxCombo, GAME.combo);
  const mult = Math.min(1 + GAME.combo * 0.05, 3);
  GAME.score += Math.round(300 * mult);
  showFeedback('PERFECT!', 'perfect');
  if (type === 'fire') audioEngine.playHitFire();
  else audioEngine.playHitIce();
  if (GAME.combo >= 10) audioEngine.playPerfect();
  updateUI();
}

function registerGood(type) {
  GAME.goodCount++;
  GAME.combo++;
  GAME.maxCombo = Math.max(GAME.maxCombo, GAME.combo);
  const mult = Math.min(1 + GAME.combo * 0.03, 2);
  GAME.score += Math.round(100 * mult);
  showFeedback('GOOD', 'good');
  if (type === 'fire') audioEngine.playHitFire();
  else audioEngine.playHitIce();
  updateUI();
}

function registerMiss(note) {
  GAME.missCount++;
  GAME.combo = 0;
  audioEngine.playMiss();

  // Particle miss burst
  const laneEl = getLaneEl(note.type, note.lane);
  if (laneEl) {
    const rect = laneEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = note.type === 'fire' ? rect.bottom - 32 : rect.top + 32;
    window.particles.spawnMissBurst(cx, cy);
  }

  showFeedback('MISS', 'miss');
  updateUI();
}

// =============================================
// UI UPDATES
// =============================================
function updateUI() {
  $('scoreDisplay').textContent = GAME.score.toLocaleString();
  $('scoreDisplay').classList.remove('pop');
  void $('scoreDisplay').offsetWidth;
  $('scoreDisplay').classList.add('pop');

  $('comboValue').textContent = GAME.combo;
  $('comboValue').classList.remove('pop');
  void $('comboValue').offsetWidth;
  if (GAME.combo > 0) $('comboValue').classList.add('pop');

  $('perfectCount').textContent = GAME.perfectCount;
  $('goodCount').textContent = GAME.goodCount;
  $('missCount').textContent = GAME.missCount;
}

function showFeedback(text, cls) {
  const el = $('hitFeedback');
  el.textContent = text;
  el.className = `hit-feedback ${cls}`;
  // Re-trigger animation
  void el.offsetWidth;
  el.className = `hit-feedback ${cls}`;
}

// =============================================
// PAUSE
// =============================================
function togglePause() {
  if (GAME.state === 'playing') {
    GAME.state = 'paused';
    GAME.pauseTime = performance.now();
    audioEngine.stopMusic();
    window._gameRunning = false;
    $('pauseScreen').style.display = 'flex';
    $('pauseScreen').classList.add('active');
  } else if (GAME.state === 'paused') {
    $('pauseScreen').style.display = 'none';
    $('pauseScreen').classList.remove('active');
    // Adjust start time for paused duration
    GAME.startTime += (performance.now() - GAME.pauseTime);
    GAME.state = 'playing';
    audioEngine.startMusic(SONGS[GAME.songIndex].bpm);
    window._gameRunning = true;
    requestAnimationFrame(gameLoop);
  }
}

$('pauseBtn').addEventListener('click', togglePause);
$('resumeBtn').addEventListener('click', togglePause);
$('restartFromPauseBtn').addEventListener('click', () => {
  $('pauseScreen').style.display = 'none';
  $('pauseScreen').classList.remove('active');
  GAME.state = 'menu';
  audioEngine.stopMusic();
  startCountdown();
});
$('quitBtn').addEventListener('click', () => {
  GAME.state = 'menu';
  audioEngine.stopMusic();
  window._gameRunning = false;
  document.querySelectorAll('.note').forEach(n => n.remove());
  showScreen('menu');
});

// =============================================
// END GAME
// =============================================
function endGame() {
  GAME.state = 'result';
  window._gameRunning = false;
  audioEngine.stopMusic();

  const total = GAME.totalNotes || 1;
  const hits  = GAME.perfectCount + GAME.goodCount;
  const acc   = Math.round((hits / total) * 100);

  let grade, title;
  if (acc === 100) { grade = 'S+'; title = 'TRANSCENDENT'; }
  else if (acc >= 95) { grade = 'S';  title = 'LEGENDARY'; }
  else if (acc >= 88) { grade = 'A';  title = 'BLAZING'; }
  else if (acc >= 78) { grade = 'B';  title = 'FIERCE'; }
  else if (acc >= 65) { grade = 'C';  title = 'IGNITED'; }
  else if (acc >= 50) { grade = 'D';  title = 'FLICKERING'; }
  else                { grade = 'F';  title = 'EXTINGUISHED'; }

  $('resultGrade').textContent = grade;
  $('resultTitle').textContent = title;
  $('resultScore').textContent = GAME.score.toLocaleString();
  $('rsPerfect').textContent  = GAME.perfectCount;
  $('rsGood').textContent     = GAME.goodCount;
  $('rsMiss').textContent     = GAME.missCount;
  $('rsMaxCombo').textContent = GAME.maxCombo;
  $('rsAccuracy').textContent = `${acc}%`;

  document.querySelectorAll('.note').forEach(n => n.remove());

  setTimeout(() => showScreen('result'), 300);
}

$('retryBtn').addEventListener('click', async () => {
  await audioEngine.init();
  startCountdown();
});
$('menuBtn').addEventListener('click', () => {
  GAME.state = 'menu';
  window._gameRunning = false;
  showScreen('menu');
});

// =============================================
// INIT
// =============================================
showScreen('menu');
