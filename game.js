const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let width = (canvas.width = window.innerWidth);
let height = (canvas.height = window.innerHeight);

const THEMES = {
  hall: {
    name: 'დიდი დარბაზი',
    planks: ['#462a18', '#392112', '#4d2f1b', '#3f2515'],
    rugFill: '#581c1c',
    rugBorder: '#d97706',
    darkness: 0,
  },
  library: {
    name: 'ბიბლიოთეკა',
    planks: ['#2c1d14', '#241710', '#332218', '#291b13'],
    rugFill: '#064e3b',
    rugBorder: '#34d399',
    darkness: 0.18,
  },
  night: {
    name: 'ღამის დარბაზი',
    planks: ['#1e1b24', '#17141c', '#25212c', '#1a1720'],
    rugFill: '#312e81',
    rugBorder: '#818cf8',
    darkness: 0.78,
  },
};

const state = {
  running: false,
  mode: 'game',
  theme: 'hall',
  level: 1,
  score: 0,
  highScore: Number(localStorage.getItem('hogwarts_sweeper_highscore') || 0),
  timeLeft: 65,
  lastTimestamp: 0,
  broomType: 'classic',
  totalTasks: 0,
  completedTasks: 0,
  combo: 0,
  comboTimer: 0,
  shakeTime: 0,
  spells: {
    accio: { active: false, timer: 0, cooldown: 0, maxCd: 10 },
    ventus: { active: false, timer: 0, cooldown: 0, maxCd: 8 },
    lumos: { active: false, timer: 0, cooldown: 0, maxCd: 14 },
    geminio: { active: false, timer: 0, cooldown: 0, maxCd: 16 },
  },
  targetPointer: { x: width / 2, y: height / 2 },
  broom: { x: width / 2, y: height / 2, vx: 0, vy: 0, angle: -0.4, trail: [] },
  snitch: null,
  particles: [],
  stains: [],
  cobwebs: [],
  shockwaves: [],
  ambientDust: [],
  sparkles: [],
  floatingTexts: [],
  obstacles: [],
  rug: { x: 0, y: 0, w: 0, h: 0 },
  dustpan: { x: 0, y: 0, radius: 58 },
  woodPattern: null,
};

function initAmbientDust() {
  state.ambientDust = [];
  for (let i = 0; i < 40; i++) {
    state.ambientDust.push({
      x: Math.random() * width,
      y: Math.random() * height,
      r: 1 + Math.random() * 2.2,
      vx: (Math.random() - 0.5) * 14,
      vy: -5 - Math.random() * 12,
      alpha: 0.15 + Math.random() * 0.4,
    });
  }
}

function createWoodFloorPattern() {
  const themeCfg = THEMES[state.theme];
  const pCanvas = document.createElement('canvas');
  pCanvas.width = 240;
  pCanvas.height = 120;
  const pCtx = pCanvas.getContext('2d');

  pCtx.fillStyle = themeCfg.planks[0];
  pCtx.fillRect(0, 0, 240, 120);

  for (let i = 0; i < 4; i++) {
    const y = i * 30;
    pCtx.fillStyle = themeCfg.planks[i];
    pCtx.fillRect(0, y, 240, 29);

    pCtx.strokeStyle = 'rgba(10, 5, 2, 0.5)';
    pCtx.lineWidth = 1.5;
    pCtx.beginPath();
    pCtx.moveTo(0, y + 29);
    pCtx.lineTo(240, y + 29);
    pCtx.stroke();

    pCtx.strokeStyle = 'rgba(255, 210, 160, 0.04)';
    pCtx.beginPath();
    pCtx.moveTo(0, y + 8);
    pCtx.bezierCurveTo(80, y + 4, 160, y + 14, 240, y + 8);
    pCtx.stroke();
  }

  pCtx.strokeStyle = 'rgba(10, 5, 2, 0.55)';
  pCtx.beginPath();
  pCtx.moveTo(120, 0);
  pCtx.lineTo(120, 30);
  pCtx.moveTo(60, 30);
  pCtx.lineTo(60, 60);
  pCtx.moveTo(180, 60);
  pCtx.lineTo(180, 90);
  pCtx.moveTo(90, 90);
  pCtx.lineTo(90, 120);
  pCtx.stroke();

  state.woodPattern = ctx.createPattern(pCanvas, 'repeat');
}

function setupArenaGeometry() {
  const margin = Math.min(width, height) * 0.1;
  state.dustpan = {
    x: width - Math.max(88, margin),
    y: height - Math.max(95, margin),
    radius: Math.max(54, Math.min(width, height) * 0.075),
  };

  state.rug = {
    x: width * 0.22,
    y: height * 0.24,
    w: width * 0.44,
    h: height * 0.46,
  };

  state.obstacles = [];
  const count = state.mode === 'zen' ? 2 : Math.min(1 + state.level, 5);
  const labels = ['🌿', '🪑', '🏺', '📚', '🕯️'];

  for (let i = 0; i < count; i++) {
    const radius = Math.max(28, Math.min(width, height) * 0.045);
    let ox, oy, valid;
    let attempts = 0;
    do {
      valid = true;
      ox = 110 + Math.random() * (width - 240);
      oy = 120 + Math.random() * (height - 260);
      if (Math.hypot(ox - state.dustpan.x, oy - state.dustpan.y) < state.dustpan.radius + radius + 80) {
        valid = false;
      }
      for (const ob of state.obstacles) {
        if (Math.hypot(ox - ob.x, oy - ob.y) < radius + ob.radius + 55) valid = false;
      }
      attempts++;
    } while (!valid && attempts < 30);

    state.obstacles.push({
      x: ox,
      y: oy,
      radius,
      icon: labels[i % labels.length],
    });
  }

  state.cobwebs = [
    { x: 42, y: 105, hp: 100 },
    { x: width - 42, y: 105, hp: 100 },
    { x: 42, y: height - 95, hp: 100 },
  ];
}

function spawnMess(trashCount, stainCount) {
  const types = [
    { kind: 'dust', color: '#a8a29e', radius: 6, mass: 0.7, points: 10 },
    { kind: 'leaf', color: '#ea580c', radius: 10, mass: 1.0, points: 15 },
    { kind: 'leafGold', color: '#eab308', radius: 9, mass: 0.9, points: 15 },
    { kind: 'paper', color: '#f8fafc', radius: 11, mass: 1.35, points: 25 },
    { kind: 'candy', color: '#ec4899', radius: 8, mass: 1.15, points: 30 },
  ];

  for (let i = 0; i < trashCount; i++) {
    const spec = types[Math.floor(Math.random() * types.length)];
    let px, py, ok;
    let tries = 0;
    do {
      ok = true;
      px = 65 + Math.random() * (width - 150);
      py = 105 + Math.random() * (height - 210);
      if (Math.hypot(px - state.dustpan.x, py - state.dustpan.y) < state.dustpan.radius + 50) ok = false;
      for (const ob of state.obstacles) {
        if (Math.hypot(px - ob.x, py - ob.y) < ob.radius + 25) ok = false;
      }
      tries++;
    } while (!ok && tries < 25);

    state.particles.push({
      x: px,
      y: py,
      vx: (Math.random() - 0.5) * 1.5,
      vy: (Math.random() - 0.5) * 1.5,
      radius: spec.radius + (Math.random() * 2 - 1),
      mass: spec.mass,
      color: spec.color,
      kind: spec.kind,
      points: spec.points,
      rotation: Math.random() * Math.PI * 2,
      vRot: (Math.random() - 0.5) * 0.08,
    });
  }

  const stainColors = ['rgba(147, 51, 234, 0.55)', 'rgba(14, 165, 233, 0.5)', 'rgba(217, 119, 6, 0.55)'];
  for (let j = 0; j < stainCount; j++) {
    let sx, sy, ok;
    let tries = 0;
    do {
      ok = true;
      sx = 100 + Math.random() * (width - 220);
      sy = 125 + Math.random() * (height - 250);
      if (Math.hypot(sx - state.dustpan.x, sy - state.dustpan.y) < state.dustpan.radius + 70) ok = false;
      for (const ob of state.obstacles) {
        if (Math.hypot(sx - ob.x, sy - ob.y) < ob.radius + 45) ok = false;
      }
      tries++;
    } while (!ok && tries < 25);

    state.stains.push({
      x: sx,
      y: sy,
      radius: 26 + Math.random() * 10,
      hp: 100,
      color: stainColors[j % stainColors.length],
    });
  }

  state.totalTasks =
    state.completedTasks + state.particles.length + state.stains.length + state.cobwebs.length;
}

function spawnGoldenSnitch() {
  state.snitch = {
    x: 120 + Math.random() * (width - 240),
    y: 120 + Math.random() * (height - 260),
    vx: (Math.random() > 0.5 ? 1 : -1) * 155,
    vy: (Math.random() > 0.5 ? 1 : -1) * 120,
    wingPhase: 0,
  };
}

function castSpell(name) {
  if (!state.running) return;
  const sp = state.spells[name];
  if (!sp || sp.cooldown > 0 || sp.active) return;

  audio.playSpellSound(name);
  state.shakeTime = 0.25;

  if (name === 'accio') {
    sp.active = true;
    sp.timer = 3.2;
    sp.cooldown = sp.maxCd;
    addFloatingText(state.dustpan.x, state.dustpan.y - 45, '🪄 ACCIO!', '#fbbf24');
  } else if (name === 'ventus') {
    sp.cooldown = sp.maxCd;
    const b = state.broom;
    state.shockwaves.push({ x: b.x, y: b.y, radius: 15, maxRadius: 240, alpha: 1 });
    addFloatingText(b.x, b.y - 35, '🌪️ VENTUS!', '#38bdf8');

    for (const pt of state.particles) {
      const dx = pt.x - b.x;
      const dy = pt.y - b.y;
      const dist = Math.hypot(dx, dy) || 1;
      if (dist < 260) {
        const force = (1 - dist / 260) * 26;
        pt.vx += (dx / dist) * force;
        pt.vy += (dy / dist) * force;
      }
    }
    for (let i = state.stains.length - 1; i >= 0; i--) {
      const st = state.stains[i];
      if (Math.hypot(st.x - b.x, st.y - b.y) < 200) {
        st.hp -= 60;
        if (st.hp <= 0) {
          state.stains.splice(i, 1);
          state.completedTasks++;
          awardPoints(40, st.x, st.y, 'გაპრიალდა!');
        }
      }
    }
  } else if (name === 'lumos') {
    sp.active = true;
    sp.timer = 4.5;
    sp.cooldown = sp.maxCd;
    addFloatingText(state.broom.x, state.broom.y - 40, '☀️ LUMOS MAXIMA!', '#fde047');
  } else if (name === 'geminio') {
    sp.active = true;
    sp.timer = 6.0;
    sp.cooldown = sp.maxCd;
    document.getElementById('doubleScoreBadge').classList.remove('hidden');
    addFloatingText(state.broom.x, state.broom.y - 40, '💎 2X ქულები!', '#c084fc');
  }
}

function addFloatingText(x, y, text, color = '#fde047') {
  state.floatingTexts.push({ x, y, text, color, life: 1.25 });
}

function awardPoints(base, x, y, label = '') {
  const mult = state.spells.geminio.active ? 2 : 1;
  const total = base * mult;
  state.score += total;
  const txt = label ? `${label} +${total}` : `+${total}`;
  addFloatingText(x, y, txt, mult > 1 ? '#e879f9' : '#fde047');
}

function initSession(mode, level = 1) {
  audio.init();
  state.mode = mode;
  state.level = level;
  if (level === 1) state.score = 0;
  state.timeLeft = Math.max(40, 70 - (level - 1) * 5);
  state.completedTasks = 0;
  state.particles = [];
  state.stains = [];
  state.sparkles = [];
  state.shockwaves = [];
  state.floatingTexts = [];
  state.combo = 0;
  state.broom.trail = [];
  state.running = true;

  Object.values(state.spells).forEach((s) => {
    s.active = false;
    s.timer = 0;
    s.cooldown = 0;
  });
  document.getElementById('doubleScoreBadge').classList.add('hidden');

  if (mode === 'game') {
    const themeKeys = ['hall', 'library', 'night'];
    state.theme = themeKeys[(level - 1) % themeKeys.length];
    document.getElementById('themeSelect').value = state.theme;
  }

  createWoodFloorPattern();
  setupArenaGeometry();

  const trashCount = mode === 'zen' ? 45 : 26 + level * 10;
  const stainCount = mode === 'zen' ? 3 : Math.min(2 + level, 6);
  spawnMess(trashCount, stainCount);
  spawnGoldenSnitch();

  document.getElementById('welcomeModal').classList.add('hidden');
  document.getElementById('resultModal').classList.add('hidden');
  document.getElementById('topHud').classList.remove('hidden');
  document.getElementById('spellsBar').classList.remove('hidden');
  document.getElementById('highScoreText').textContent = state.highScore.toLocaleString();
  document.getElementById('themeNameLabel').textContent = THEMES[state.theme].name;

  const levelBadge = document.getElementById('levelBadge');
  const timerBox = document.getElementById('timerBox');
  const zenBtn = document.getElementById('zenScatterBtn');

  if (mode === 'zen') {
    levelBadge.textContent = '🌿 Zen';
    timerBox.classList.add('hidden');
    zenBtn.classList.remove('hidden');
  } else {
    levelBadge.textContent = `დონე ${level}`;
    timerBox.classList.remove('hidden');
    zenBtn.classList.add('hidden');
  }

  updateHUD();
}

function updateHUD() {
  document.getElementById('timerText').textContent = `${Math.ceil(state.timeLeft)}s`;
  document.getElementById('scoreText').textContent = state.score.toLocaleString();

  if (state.score > state.highScore) {
    state.highScore = state.score;
    localStorage.setItem('hogwarts_sweeper_highscore', String(state.highScore));
    document.getElementById('highScoreText').textContent = state.highScore.toLocaleString();
  }

  const pct =
    state.totalTasks === 0
      ? 100
      : Math.min(100, Math.round((state.completedTasks / state.totalTasks) * 100));
  document.getElementById('cleanPercent').textContent = `${pct}%`;
  document.getElementById('cleanBar').style.width = `${pct}%`;

  const spellMap = [
    { key: 'accio', btnId: 'spellAccio', statusId: 'statusAccio' },
    { key: 'ventus', btnId: 'spellVentus', statusId: 'statusVentus' },
    { key: 'lumos', btnId: 'spellLumos', statusId: 'statusLumos' },
    { key: 'geminio', btnId: 'spellGeminio', statusId: 'statusGeminio' },
  ];

  for (const item of spellMap) {
    const sp = state.spells[item.key];
    const btn = document.getElementById(item.btnId);
    const st = document.getElementById(item.statusId);
    if (sp.active) {
      btn.classList.add('spell-running');
      st.textContent = `${sp.timer.toFixed(1)}s`;
      st.className = 'text-[10px] text-amber-300 font-extrabold';
    } else if (sp.cooldown > 0) {
      btn.classList.remove('spell-running');
      st.textContent = `${Math.ceil(sp.cooldown)}s`;
      st.className = 'text-[10px] text-white/45 font-semibold';
    } else {
      btn.classList.remove('spell-running');
      st.textContent = 'მზადაა';
      st.className = 'text-[10px] text-emerald-300 font-semibold';
    }
  }
}

function finishLevel(won) {
  state.running = false;
  audio.updateSweep(0, state.broomType);
  if (won) audio.playWinFanfare();

  const bonus = won ? Math.ceil(state.timeLeft) * 15 : 0;
  const total = state.score + bonus;
  state.score = total;
  updateHUD();

  document.getElementById('resultIcon').textContent = won ? '🏆' : '⏳';
  document.getElementById('resultTitle').textContent = won
    ? `დონე ${state.level} გავლილია!`
    : 'დრო ამოიწურა!';
  document.getElementById('resultSubtitle').textContent = won
    ? 'დარბაზი ბზინავს! მზად ხართ შემდეგი გამოწვევისთვის?'
    : 'გამოიყენეთ Accio და Ventus შელოცვები უფრო სწრაფი შედეგისთვის.';
  document.getElementById('finalScore').textContent = (total - bonus).toLocaleString();
  document.getElementById('timeBonus').textContent = `+${bonus.toLocaleString()}`;
  document.getElementById('totalFinalScore').textContent = total.toLocaleString();

  document.getElementById('nextLevelBtn').style.display = won ? 'block' : 'none';
  document.getElementById('resultModal').classList.remove('hidden');
}

function updatePhysics(dt) {
  for (const d of state.ambientDust) {
    d.x += d.vx * dt;
    d.y += d.vy * dt;
    if (d.y < 0) d.y = height;
    if (d.x < 0) d.x = width;
    if (d.x > width) d.x = 0;
  }

  if (!state.running) return;

  if (state.shakeTime > 0) state.shakeTime = Math.max(0, state.shakeTime - dt);

  const timeScale = state.spells.lumos.active ? 0.45 : 1.0;

  if (state.mode === 'game') {
    state.timeLeft -= dt * timeScale;
    if (state.timeLeft <= 0) {
      state.timeLeft = 0;
      updateHUD();
      finishLevel(false);
      return;
    }
  }

  for (const [key, sp] of Object.entries(state.spells)) {
    if (sp.active) {
      sp.timer -= dt;
      if (sp.timer <= 0) {
        sp.active = false;
        if (key === 'geminio') {
          document.getElementById('doubleScoreBadge').classList.add('hidden');
        }
      }
    } else if (sp.cooldown > 0) {
      sp.cooldown = Math.max(0, sp.cooldown - dt);
    }
  }

  if (state.comboTimer > 0) {
    state.comboTimer -= dt;
    if (state.comboTimer <= 0) state.combo = 0;
  }

  const b = state.broom;
  const prevX = b.x;
  const prevY = b.y;
  const smoothness = 1 - Math.pow(0.0008, dt);
  b.x += (state.targetPointer.x - b.x) * smoothness;
  b.y += (state.targetPointer.y - b.y) * smoothness;
  b.vx = b.x - prevX;
  b.vy = b.y - prevY;

  const speed = Math.hypot(b.vx, b.vy);
  if (speed > 0.8) {
    const targetAngle = Math.atan2(b.vy, b.vx) + Math.PI / 2;
    b.angle += (targetAngle - b.angle) * 0.22;
  }

  b.trail.push({ x: b.x, y: b.y, alpha: 0.48 });
  if (b.trail.length > 15) b.trail.shift();
  for (const tr of b.trail) tr.alpha *= 0.88;

  audio.updateSweep(speed, state.broomType);

  if (state.broomType === 'wizard' && speed > 2.2) {
    for (let i = 0; i < 2; i++) {
      state.sparkles.push({
        x: b.x + (Math.random() - 0.5) * 40,
        y: b.y + (Math.random() - 0.5) * 40,
        vx: (Math.random() - 0.5) * 2.2,
        vy: (Math.random() - 0.5) * 2.2 - 0.6,
        life: 1,
        color: Math.random() > 0.4 ? '#fbbf24' : '#38bdf8',
      });
    }
  }

  for (let i = state.shockwaves.length - 1; i >= 0; i--) {
    const sw = state.shockwaves[i];
    sw.radius += 520 * dt;
    sw.alpha = 1 - sw.radius / sw.maxRadius;
    if (sw.radius >= sw.maxRadius) state.shockwaves.splice(i, 1);
  }

  if (state.snitch) {
    const s = state.snitch;
    s.wingPhase += dt * 30;
    s.x += s.vx * dt * timeScale;
    s.y += s.vy * dt * timeScale + Math.sin(s.wingPhase * 0.25) * 1.5;

    if (s.x < 75 || s.x > width - 75) s.vx *= -1;
    if (s.y < 105 || s.y > height - 95) s.vy *= -1;

    if (Math.hypot(s.x - b.x, s.y - b.y) < 58) {
      state.shakeTime = 0.2;
      if (state.mode === 'game') state.timeLeft += 5;
      audio.playCollectChime(14);
      awardPoints(150, s.x, s.y - 10, '⚡ ოქროს სნიჩი! (+5s)');
      for (let k = 0; k < 20; k++) {
        state.sparkles.push({
          x: s.x,
          y: s.y,
          vx: (Math.random() - 0.5) * 9,
          vy: (Math.random() - 0.5) * 9,
          life: 1.2,
          color: '#fde047',
        });
      }
      state.snitch = null;
    }
  }

  const broomRadius = state.broomType === 'wizard' ? 56 : state.broomType === 'modern' ? 50 : 45;
  const sweepPower = state.broomType === 'wizard' ? 1.35 : 1.1;

  for (let i = state.stains.length - 1; i >= 0; i--) {
    const st = state.stains[i];
    if (Math.hypot(st.x - b.x, st.y - b.y) < broomRadius + st.radius * 0.6 && speed > 1.5) {
      const polishRate = state.broomType === 'wizard' ? 95 : 70;
      st.hp -= polishRate * dt;
      if (Math.random() < 0.25) {
        state.sparkles.push({
          x: st.x + (Math.random() - 0.5) * st.radius,
          y: st.y + (Math.random() - 0.5) * st.radius,
          vx: (Math.random() - 0.5) * 2,
          vy: -1 - Math.random() * 2,
          life: 0.8,
          color: '#38bdf8',
        });
      }
      if (st.hp <= 0) {
        state.stains.splice(i, 1);
        state.completedTasks++;
        audio.playPolishSound();
        awardPoints(45, st.x, st.y, '✨ ბზინავს!');
      }
    }
  }

  for (let i = state.cobwebs.length - 1; i >= 0; i--) {
    const cw = state.cobwebs[i];
    if (Math.hypot(cw.x - b.x, cw.y - b.y) < broomRadius + 30 && speed > 2) {
      cw.hp -= 160 * dt;
      if (cw.hp <= 0) {
        state.cobwebs.splice(i, 1);
        state.completedTasks++;
        audio.playPolishSound();
        awardPoints(35, cw.x, cw.y, '🕸️ გაიწმინდა!');
      }
    }
  }

  for (let i = state.particles.length - 1; i >= 0; i--) {
    const pt = state.particles[i];

    if (state.spells.accio.active) {
      const dx = state.dustpan.x - pt.x;
      const dy = state.dustpan.y - pt.y;
      const dist = Math.hypot(dx, dy) || 1;
      pt.vx += (dx / dist) * 0.72;
      pt.vy += (dy / dist) * 0.72;
    }

    const distBroom = Math.hypot(pt.x - b.x, pt.y - b.y);

    if (state.broomType === 'modern' && distBroom < broomRadius * 2.2 && distBroom > broomRadius) {
      pt.vx += ((b.x - pt.x) / distBroom) * 0.35;
      pt.vy += ((b.y - pt.y) / distBroom) * 0.35;
    }

    if (distBroom < broomRadius + pt.radius) {
      const nx = (pt.x - b.x) / (distBroom || 1);
      const ny = (pt.y - b.y) / (distBroom || 1);
      const overlap = broomRadius + pt.radius - distBroom;

      pt.x += nx * overlap * 0.85;
      pt.y += ny * overlap * 0.85;

      pt.vx += (b.vx * 0.54 + nx * 3.5) * (sweepPower / pt.mass);
      pt.vy += (b.vy * 0.54 + ny * 3.5) * (sweepPower / pt.mass);
      pt.vRot += (Math.random() - 0.5) * 0.16;
    }

    const onRug =
      pt.x > state.rug.x &&
      pt.x < state.rug.x + state.rug.w &&
      pt.y > state.rug.y &&
      pt.y < state.rug.y + state.rug.h;
    const friction = onRug ? 0.85 : 0.915;

    pt.x += pt.vx;
    pt.y += pt.vy;
    pt.vx *= friction;
    pt.vy *= friction;
    pt.rotation += pt.vRot;
    pt.vRot *= 0.92;

    const pad = pt.radius + 14;
    if (pt.x < pad) {
      pt.x = pad;
      pt.vx *= -0.6;
    } else if (pt.x > width - pad) {
      pt.x = width - pad;
      pt.vx *= -0.6;
    }
    if (pt.y < 80 + pt.radius) {
      pt.y = 80 + pt.radius;
      pt.vy *= -0.6;
    } else if (pt.y > height - 75 - pt.radius) {
      pt.y = height - 75 - pt.radius;
      pt.vy *= -0.6;
    }

    for (const ob of state.obstacles) {
      const dx = pt.x - ob.x;
      const dy = pt.y - ob.y;
      const dist = Math.hypot(dx, dy);
      const minDist = pt.radius + ob.radius;
      if (dist < minDist) {
        const nx = dx / (dist || 1);
        const ny = dy / (dist || 1);
        pt.x = ob.x + nx * minDist;
        pt.y = ob.y + ny * minDist;
        pt.vx += nx * 2.2;
        pt.vy += ny * 2.2;
      }
    }

    const distPan = Math.hypot(pt.x - state.dustpan.x, pt.y - state.dustpan.y);
    if (distPan < state.dustpan.radius * 1.45) {
      pt.vx += (state.dustpan.x - pt.x) * 0.09;
      pt.vy += (state.dustpan.y - pt.y) * 0.09;
    }

    if (distPan < state.dustpan.radius * 0.76) {
      state.particles.splice(i, 1);
      state.completedTasks++;
      state.combo++;
      state.comboTimer = 1.7;

      const mult = state.spells.geminio.active ? 2 : 1;
      const gained = (pt.points + Math.min(state.combo * 5, 50)) * mult;
      state.score += gained;
      audio.playCollectChime(state.combo);

      const praise = state.combo === 5 ? ' 🔥 სერია!' : state.combo === 10 ? ' ⚡ მაგიური!' : '';
      addFloatingText(
        state.dustpan.x + (Math.random() - 0.5) * 34,
        state.dustpan.y - 25,
        state.combo > 2 ? `+${gained} (x${state.combo})${praise}` : `+${gained}`,
        mult > 1 ? '#e879f9' : '#fde047'
      );

      for (let s = 0; s < 6; s++) {
        state.sparkles.push({
          x: state.dustpan.x,
          y: state.dustpan.y,
          vx: (Math.random() - 0.5) * 5,
          vy: (Math.random() - 0.5) * 5,
          life: 1,
          color: '#34d399',
        });
      }
    }
  }

  for (let i = state.sparkles.length - 1; i >= 0; i--) {
    const sp = state.sparkles[i];
    sp.x += sp.vx;
    sp.y += sp.vy;
    sp.life -= dt * 2.1;
    if (sp.life <= 0) state.sparkles.splice(i, 1);
  }

  for (let i = state.floatingTexts.length - 1; i >= 0; i--) {
    const ft = state.floatingTexts[i];
    ft.y -= 36 * dt;
    ft.life -= dt * 1.25;
    if (ft.life <= 0) state.floatingTexts.splice(i, 1);
  }

  updateHUD();

  if (
    state.mode === 'game' &&
    state.particles.length === 0 &&
    state.stains.length === 0 &&
    state.cobwebs.length === 0
  ) {
    finishLevel(true);
  }
}

function drawScene() {
  ctx.save();
  if (state.shakeTime > 0) {
    const mag = state.shakeTime * 18;
    ctx.translate((Math.random() - 0.5) * mag, (Math.random() - 0.5) * mag);
  }

  ctx.clearRect(0, 0, width, height);

  if (state.woodPattern) {
    ctx.fillStyle = state.woodPattern;
    ctx.fillRect(0, 0, width, height);
  } else {
    ctx.fillStyle = '#3b2314';
    ctx.fillRect(0, 0, width, height);
  }

  const themeCfg = THEMES[state.theme];
  const r = state.rug;
  ctx.save();
  ctx.fillStyle = themeCfg.rugFill;
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 18;
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, 16);
  ctx.fill();

  ctx.strokeStyle = themeCfg.rugBorder;
  ctx.lineWidth = 4;
  ctx.strokeRect(r.x + 12, r.y + 12, r.w - 24, r.h - 24);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(r.x + 20, r.y + 20, r.w - 40, r.h - 40);
  ctx.restore();

  for (const st of state.stains) {
    ctx.save();
    ctx.globalAlpha = Math.max(0.15, st.hp / 100);
    ctx.fillStyle = st.color;
    ctx.beginPath();
    ctx.arc(st.x, st.y, st.radius, 0, Math.PI * 2);
    ctx.arc(st.x + st.radius * 0.55, st.y + 5, st.radius * 0.65, 0, Math.PI * 2);
    ctx.arc(st.x - st.radius * 0.5, st.y - 4, st.radius * 0.6, 0, Math.PI * 2);
    ctx.fill();

    if (st.hp < 100) {
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(st.x, st.y, st.radius + 5, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * (100 - st.hp)) / 100);
      ctx.stroke();
    }
    ctx.restore();
  }

  for (const cw of state.cobwebs) {
    ctx.save();
    ctx.globalAlpha = Math.max(0.2, cw.hp / 100);
    ctx.strokeStyle = 'rgba(241, 245, 249, 0.65)';
    ctx.lineWidth = 1.5;
    for (let ring = 12; ring <= 44; ring += 11) {
      ctx.beginPath();
      ctx.arc(cw.x, cw.y, ring, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
      ctx.beginPath();
      ctx.moveTo(cw.x, cw.y);
      ctx.lineTo(cw.x + Math.cos(a) * 46, cw.y + Math.sin(a) * 46);
      ctx.stroke();
    }
    ctx.restore();
  }

  const dp = state.dustpan;
  ctx.save();
  ctx.translate(dp.x, dp.y);

  if (state.spells.accio.active) {
    const wave = (performance.now() * 0.08) % 90;
    ctx.beginPath();
    ctx.arc(0, 0, dp.radius + wave, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(251, 191, 36, ${1 - wave / 90})`;
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  const pulse = 1 + Math.sin(performance.now() * 0.005) * 0.04;
  ctx.beginPath();
  ctx.arc(0, 0, dp.radius * pulse, 0, Math.PI * 2);
  ctx.fillStyle = state.spells.accio.active ? 'rgba(245, 158, 11, 0.28)' : 'rgba(16, 185, 129, 0.16)';
  ctx.fill();
  ctx.strokeStyle = state.spells.accio.active ? 'rgba(251, 191, 36, 0.9)' : 'rgba(52, 211, 153, 0.6)';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 6]);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = '#1e293b';
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.roundRect(-dp.radius * 0.65, -dp.radius * 0.55, dp.radius * 1.3, dp.radius * 1.1, 12);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#f59e0b';
  ctx.beginPath();
  ctx.roundRect(dp.radius * 0.55, -7, 36, 14, 6);
  ctx.fill();

  ctx.fillStyle = '#a7f3d0';
  ctx.font = 'bold 11px "Noto Sans Georgian", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('აქანდაზი', 0, dp.radius + 18);
  ctx.restore();

  for (const ob of state.obstacles) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(ob.x, ob.y + 5, ob.radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(ob.x, ob.y, ob.radius, 0, Math.PI * 2);
    ctx.fillStyle = '#291d16';
    ctx.fill();
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.45)';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.font = `${Math.round(ob.radius * 1.1)}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ob.icon, ob.x, ob.y + 2);
    ctx.restore();
  }

  for (const pt of state.particles) {
    ctx.save();
    ctx.translate(pt.x, pt.y);
    ctx.rotate(pt.rotation);

    if (pt.kind === 'dust') {
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(0, 0, pt.radius, 0, Math.PI * 2);
      ctx.arc(pt.radius * 0.6, pt.radius * 0.3, pt.radius * 0.65, 0, Math.PI * 2);
      ctx.fill();
    } else if (pt.kind === 'leaf' || pt.kind === 'leafGold') {
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, pt.radius * 1.2, pt.radius * 0.65, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (pt.kind === 'paper') {
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        const ang = (k / 6) * Math.PI * 2;
        const rad = pt.radius * (k % 2 === 0 ? 1 : 0.72);
        if (k === 0) ctx.moveTo(Math.cos(ang) * rad, Math.sin(ang) * rad);
        else ctx.lineTo(Math.cos(ang) * rad, Math.sin(ang) * rad);
      }
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.roundRect(-pt.radius, -pt.radius * 0.6, pt.radius * 2, pt.radius * 1.2, 4);
      ctx.fill();
    }
    ctx.restore();
  }

  for (const sw of state.shockwaves) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(56, 189, 248, ${sw.alpha})`;
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.restore();
  }

  if (state.snitch) {
    const s = state.snitch;
    ctx.save();
    ctx.translate(s.x, s.y);
    const wingY = Math.sin(s.wingPhase) * 10;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-6, 0);
    ctx.quadraticCurveTo(-22, -16 + wingY, -30, -4 + wingY);
    ctx.moveTo(6, 0);
    ctx.quadraticCurveTo(22, -16 + wingY, 30, -4 + wingY);
    ctx.stroke();

    ctx.shadowColor = '#fbbf24';
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const effectiveDarkness = state.spells.lumos.active ? 0 : themeCfg.darkness;
  if (effectiveDarkness > 0) {
    const b = state.broom;
    const nightGrad = ctx.createRadialGradient(b.x, b.y, 70, b.x, b.y, 260);
    nightGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    nightGrad.addColorStop(1, `rgba(4, 3, 10, ${effectiveDarkness})`);
    ctx.fillStyle = nightGrad;
    ctx.fillRect(0, 0, width, height);
  }

  for (const d of state.ambientDust) {
    ctx.save();
    ctx.fillStyle = `rgba(253, 224, 71, ${d.alpha})`;
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  for (const sp of state.sparkles) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, sp.life);
    ctx.fillStyle = sp.color;
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  for (const ft of state.floatingTexts) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, ft.life);
    ctx.font = '800 15px "Noto Sans Georgian", sans-serif';
    ctx.fillStyle = ft.color;
    ctx.textAlign = 'center';
    ctx.fillText(ft.text, ft.x, ft.y);
    ctx.restore();
  }

  drawBroom();
  ctx.restore();
}

function drawBroom() {
  const b = state.broom;

  for (let i = 0; i < b.trail.length; i++) {
    const tr = b.trail[i];
    ctx.save();
    ctx.beginPath();
    ctx.arc(tr.x, tr.y, (i / b.trail.length) * 28, 0, Math.PI * 2);
    ctx.fillStyle =
      state.broomType === 'wizard'
        ? `rgba(251, 191, 36, ${tr.alpha * 0.28})`
        : state.broomType === 'modern'
        ? `rgba(56, 189, 248, ${tr.alpha * 0.25})`
        : `rgba(255, 255, 255, ${tr.alpha * 0.14})`;
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(b.angle);

  const radius = state.broomType === 'wizard' ? 56 : state.broomType === 'modern' ? 50 : 45;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.strokeStyle =
    state.broomType === 'wizard'
      ? 'rgba(251, 191, 36, 0.38)'
      : state.broomType === 'modern'
      ? 'rgba(56, 189, 248, 0.35)'
      : 'rgba(255, 255, 255, 0.16)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.shadowColor = 'rgba(0,0,0,0.65)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 8;

  if (state.broomType === 'wizard') {
    const handleGrad = ctx.createLinearGradient(-5, -135, 5, 0);
    handleGrad.addColorStop(0, '#451a03');
    handleGrad.addColorStop(1, '#92400e');
    ctx.fillStyle = handleGrad;
    ctx.beginPath();
    ctx.roundRect(-4.5, -135, 9, 125, 5);
    ctx.fill();

    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(-6, -15, 12, 6);

    ctx.fillStyle = '#b45309';
    ctx.beginPath();
    ctx.moveTo(-8, -10);
    ctx.lineTo(8, -10);
    ctx.lineTo(26, 36);
    ctx.quadraticCurveTo(0, 44, -26, 36);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#fde68a';
    ctx.lineWidth = 1.2;
    for (let bx = -18; bx <= 18; bx += 6) {
      ctx.beginPath();
      ctx.moveTo(bx * 0.35, -8);
      ctx.lineTo(bx, 35);
      ctx.stroke();
    }
  } else if (state.broomType === 'modern') {
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.roundRect(-4, -130, 8, 120, 4);
    ctx.fill();

    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-34, -10, 68, 22, 8);
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.fillStyle = '#a16207';
    ctx.beginPath();
    ctx.roundRect(-4, -130, 8, 118, 4);
    ctx.fill();

    ctx.fillStyle = '#eab308';
    ctx.beginPath();
    ctx.moveTo(-12, -12);
    ctx.lineTo(12, -12);
    ctx.lineTo(28, 30);
    ctx.lineTo(-28, 30);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-14, -2);
    ctx.lineTo(14, -2);
    ctx.stroke();
  }

  ctx.restore();
}

function gameLoop(timestamp) {
  if (!state.lastTimestamp) state.lastTimestamp = timestamp;
  const dt = Math.min((timestamp - state.lastTimestamp) / 1000, 0.05);
  state.lastTimestamp = timestamp;

  updatePhysics(dt);
  drawScene();

  requestAnimationFrame(gameLoop);
}

window.addEventListener('pointermove', (e) => {
  state.targetPointer.x = e.clientX;
  state.targetPointer.y = e.clientY;
});

window.addEventListener('pointerdown', (e) => {
  audio.init();
  state.targetPointer.x = e.clientX;
  state.targetPointer.y = e.clientY;
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'Digit1' || e.code === 'Space') {
    e.preventDefault();
    castSpell('accio');
  } else if (e.code === 'Digit2') {
    castSpell('ventus');
  } else if (e.code === 'Digit3') {
    castSpell('lumos');
  } else if (e.code === 'Digit4') {
    castSpell('geminio');
  }
});

window.addEventListener('resize', () => {
  width = canvas.width = window.innerWidth;
  height = canvas.height = window.innerHeight;
  createWoodFloorPattern();
  setupArenaGeometry();
});

document.querySelectorAll('.broom-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const selected = btn.getAttribute('data-broom');
    state.broomType = selected;
    document.querySelectorAll('.broom-btn').forEach((b) => {
      if (b.getAttribute('data-broom') === selected) {
        b.classList.add('bg-amber-500', 'text-black', 'font-bold');
        b.classList.remove('text-amber-200/75');
      } else {
        b.classList.remove('bg-amber-500', 'text-black', 'font-bold');
        b.classList.add('text-amber-200/75');
      }
    });
  });
});

document.getElementById('themeSelect').addEventListener('change', (e) => {
  state.theme = e.target.value;
  document.getElementById('themeNameLabel').textContent = THEMES[state.theme].name;
  createWoodFloorPattern();
});

document.getElementById('spellAccio').addEventListener('click', () => castSpell('accio'));
document.getElementById('spellVentus').addEventListener('click', () => castSpell('ventus'));
document.getElementById('spellLumos').addEventListener('click', () => castSpell('lumos'));
document.getElementById('spellGeminio').addEventListener('click', () => castSpell('geminio'));

document.getElementById('startGameModeBtn').addEventListener('click', () => initSession('game', 1));
document.getElementById('startZenModeBtn').addEventListener('click', () => initSession('zen', 1));
document.getElementById('zenScatterBtn').addEventListener('click', () => spawnMess(22, 2));
document.getElementById('restartBtn').addEventListener('click', () => initSession(state.mode, state.level));
document.getElementById('retryLevelBtn').addEventListener('click', () => initSession(state.mode, state.level));
document.getElementById('nextLevelBtn').addEventListener('click', () => initSession('game', state.level + 1));

document.getElementById('menuBtn').addEventListener('click', () => {
  state.running = false;
  audio.updateSweep(0, state.broomType);
  document.getElementById('topHud').classList.add('hidden');
  document.getElementById('spellsBar').classList.add('hidden');
  document.getElementById('welcomeModal').classList.remove('hidden');
});

document.getElementById('soundToggleBtn').addEventListener('click', (e) => {
  audio.init();
  const isMuted = audio.toggleMute();
  e.currentTarget.textContent = isMuted ? '🔇' : '🔊';
});

createWoodFloorPattern();
initAmbientDust();
setupArenaGeometry();
requestAnimationFrame(gameLoop);