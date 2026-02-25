// ── GAME.JS ── Main game engine

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// ── Globals
let W, H;
let shop, water, boat;
let gameState = 'menu'; // menu | playing | gameover
let lastTime = 0;
let stats = {};

// ── Camera
const camera = { x: 0, y: 0, targetX: 0, targetY: 0 };

// ── Player
const player = {
  x: 0, y: 0, vx: 0, vy: 0,
  w: 28, h: 48,
  inWater: false, onBoat: false,
  air: 30, maxAir: 30,
  angle: 0,
  animT: 0,
  trail: [],
  bubbles: [],
};

// ── World
let scrollX = 0;
const WORLD_WIDTH = 3000;
const WATER_BASE = 0.38; // fraction of screen

// ── Resources
let resources = [];
let particles = [];
let fish = [];
let seaweedList = [];
let coralList = [];
let treasures = [];
let jellyfish = [];
let dolphins = [];

// ── Run state
let runResources = { coral: 0, gem: 0, shell: 0, chest: 0 };
let maxDepth = 0;
let runMoney = 0;

// ── Input
const keys = {};
let touchInput = { up: false, down: false, left: false, right: false, jump: false };

// ──────────────────────────────────────────────────────
function resize() {
  W = canvas.width = window.innerWidth;
  H = canvas.height = window.innerHeight;
  if (water) {
    water.width = WORLD_WIDTH;
    water.spacing = WORLD_WIDTH / (water.numPoints - 1);
    water.baseY = H * WATER_BASE;
  }
}

function init() {
  shop = new ShopManager();
  shop.updateMoneyDisplays();
  resize();
  setupUI();
  setupInput();
  requestAnimationFrame(loop);
}

// ──────────────────────────────────────────────────────
function startGame() {
  stats = shop.getStats();

  // Init water
  water = new WaterPhysics(WORLD_WIDTH);
  water.baseY = H * WATER_BASE;

  // Init boat
  boat = new BoatPhysics(W * 0.5, water);
  boat.x = W * 0.5;

  // Player start
  player.x = boat.x;
  player.y = water.baseY - 60;
  player.vx = 0; player.vy = 0;
  player.inWater = false; player.onBoat = true;
  player.air = stats.maxAir;
  player.maxAir = stats.maxAir;
  player.angle = 0;
  player.trail = [];
  player.bubbles = [];

  // Camera
  scrollX = 0;
  camera.x = 0;
  camera.y = 0;

  // Run state
  runResources = { coral: 0, gem: 0, shell: 0, chest: 0 };
  maxDepth = 0;
  runMoney = 0;

  // Generate world
  generateWorld();

  // Tut on first time
  const seen = localStorage.getItem('tut_seen');
  if (!seen) {
    document.getElementById('tutorial-overlay').classList.remove('hidden');
    localStorage.setItem('tut_seen', '1');
  }

  gameState = 'playing';
  document.getElementById('menu-screen').classList.add('hidden');
  document.getElementById('gameover-screen').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
  document.getElementById('touch-controls').classList.remove('hidden');

  updateHUD();
}

function generateWorld() {
  resources = [];
  fish = [];
  seaweedList = [];
  coralList = [];
  treasures = [];
  jellyfish = [];
  particles = [];
  dolphins = [];

  const wY = water.baseY;
  const depthScale = [1, 1.5, 2.2][Math.min(stats.maxDepth, 2)];
  const maxWorldDepth = H * depthScale * 3;

  // Seaweed
  for (let i = 0; i < 60; i++) {
    seaweedList.push({
      x: rand(100, WORLD_WIDTH - 100),
      y: wY + rand(80, maxWorldDepth),
      height: rand(40, 120),
      sway: rand(0, Math.PI * 2),
      color: randChoice(['#1a7a2a', '#0f5e1a', '#2da84a', '#0d6630']),
    });
  }

  // Coral
  for (let i = 0; i < 50; i++) {
    coralList.push({
      x: rand(100, WORLD_WIDTH - 100),
      y: wY + rand(60, maxWorldDepth),
      size: rand(20, 55),
      type: Math.floor(rand(0, 4)),
      color: randChoice(['#ff6b6b', '#ff9f43', '#ff4fa0', '#ffd700', '#a29bfe', '#00d4ff']),
    });
  }

  // Resources
  const types = ['coral', 'gem', 'shell'];
  const emojis = { coral: '🪸', gem: '💎', shell: '🐚' };
  const values = { coral: 10, gem: 40, shell: 20 };
  for (let i = 0; i < 80; i++) {
    const type = randChoice(types);
    const depth = rand(60, maxWorldDepth);
    resources.push({
      id: i, type, x: rand(60, WORLD_WIDTH - 60),
      y: wY + depth,
      emoji: emojis[type], value: values[type],
      glow: rand(0, Math.PI * 2),
      collected: false, scale: 1,
    });
  }

  // Treasure chests (if map)
  if (stats.treasureMap) {
    for (let i = 0; i < 5; i++) {
      treasures.push({
        x: rand(100, WORLD_WIDTH - 100),
        y: wY + rand(200, maxWorldDepth),
        collected: false, glow: 0, scale: 1,
      });
    }
  }

  // Fish schools
  for (let i = 0; i < 20; i++) {
    const bx = rand(0, WORLD_WIDTH);
    const by = wY + rand(40, 300);
    const color = randChoice(['#ffd700', '#ff6b6b', '#00d4ff', '#a8e6cf', '#ff9f43', '#74b9ff']);
    for (let j = 0; j < rand(3, 7); j++) {
      fish.push({
        x: bx + rand(-60, 60), y: by + rand(-30, 30),
        vx: rand(-1.2, 1.2), vy: rand(-0.3, 0.3),
        size: rand(6, 12), color,
        t: rand(0, Math.PI * 2), school: i,
        flip: Math.random() > 0.5,
      });
    }
  }

  // Jellyfish (deep)
  for (let i = 0; i < 18; i++) {
    jellyfish.push({
      x: rand(100, WORLD_WIDTH - 100),
      y: wY + rand(200, maxWorldDepth),
      t: rand(0, Math.PI * 2),
      size: rand(16, 32),
      color: randChoice(['rgba(255,120,200,0.8)', 'rgba(120,200,255,0.8)', 'rgba(200,120,255,0.8)']),
      pulse: rand(0, Math.PI * 2),
    });
  }

  // Dolphin buddy
  if (stats.buddy) {
    dolphins.push({ x: boat.x + 80, y: water.baseY - 20, t: 0, vx: 0, vy: 0 });
  }
}

// ──────────────────────────────────────────────────────
function loop(ts) {
  requestAnimationFrame(loop);
  const dt = Math.min((ts - lastTime) / 1000, 0.05);
  lastTime = ts;

  if (gameState === 'playing') {
    update(dt, ts);
  }
  render(ts);
}

function update(dt, ts) {
  water.update();

  const wY = water.baseY;
  const moveSpeed = 220 * stats.swimSpeed;

  // ── Input to velocity (underwater)
  const up = keys['ArrowUp'] || keys['w'] || touchInput.up;
  const down = keys['ArrowDown'] || keys['s'] || touchInput.down;
  const left = keys['ArrowLeft'] || keys['a'] || touchInput.left;
  const right = keys['ArrowRight'] || keys['d'] || touchInput.right;

  if (player.inWater) {
    if (up) player.vy -= moveSpeed * dt * 1.4;
    if (down) player.vy += moveSpeed * dt * 0.8;
    if (left) { player.vx -= moveSpeed * dt; player.angle = lerp(player.angle, -0.4, 0.1); }
    if (right) { player.vx += moveSpeed * dt; player.angle = lerp(player.angle, 0.4, 0.1); }
    if (!left && !right) player.angle = lerp(player.angle, 0, 0.08);

    // Water drag
    player.vx *= 0.86;
    player.vy *= 0.86;

    // Gravity when not swimming
    if (!up) player.vy += 28 * dt;

    player.animT += dt * 3;

    // Air drain
    player.air -= dt * stats.airDrain;
    if (player.air <= 0) {
      player.air = 0;
      endRun();
      return;
    }

    // Depth
    const depth = Math.max(0, Math.floor(player.y - wY));
    maxDepth = Math.max(maxDepth, depth);

    // Bubbles
    if (Math.random() < 0.15) {
      player.bubbles.push({
        x: player.x + rand(-8, 8), y: player.y - 10,
        vx: rand(-0.3, 0.3), vy: rand(-1.2, -0.6),
        r: rand(2, 6), life: 1, maxLife: 1,
      });
    }

    // Magnet pickup
    if (stats.magnetRange > 0) {
      for (const r of resources) {
        if (!r.collected) {
          const dx = r.x - player.x, dy = r.y - player.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < stats.magnetRange) {
            r.x += (player.x - r.x) * 0.06;
            r.y += (player.y - r.y) * 0.06;
          }
        }
      }
    }

    // Check surface
    const surfaceY = water.getY(player.x);
    if (player.y < surfaceY) {
      player.y = surfaceY;
      player.vy = Math.abs(player.vy) * 0.3;
      player.inWater = false;
      water.splash(player.x, player.vy * 0.5);
      spawnSplashParticles(player.x, surfaceY);
    }
  } else if (!player.onBoat) {
    // On surface, air refills
    player.air = Math.min(player.maxAir, player.air + dt * 8);
    player.vy += 200 * dt; // gravity
    player.vx *= 0.92;

    const surfaceY = water.getY(player.x);
    if (player.y + player.h * 0.5 > surfaceY) {
      player.y = surfaceY - player.h * 0.5;
      player.vy = 0;
    }
  }

  // ── Collect resources
  for (const r of resources) {
    if (!r.collected) {
      const dx = r.x - player.x, dy = r.y - player.y;
      if (Math.abs(dx) < 28 && Math.abs(dy) < 28) {
        r.collected = true;
        runResources[r.type]++;
        spawnCollectParticles(r.x, r.y, r.emoji);
        runMoney += r.value * stats.cargoMulti;
        if (stats.camera && Math.random() < 0.3) runMoney += 25; // bonus
      }
      r.glow += dt * 2;
    }
  }

  // Treasures
  for (const t of treasures) {
    if (!t.collected) {
      const dx = t.x - player.x, dy = t.y - player.y;
      if (Math.abs(dx) < 36 && Math.abs(dy) < 36) {
        t.collected = true;
        runResources.chest = (runResources.chest || 0) + 1;
        runMoney += 150 * stats.cargoMulti;
        spawnCollectParticles(t.x, t.y, '💰');
      }
      t.glow += dt * 3;
    }
  }

  // ── Move player
  player.x += player.vx * dt * 60;
  player.y += player.vy * dt * 60;
  player.x = Math.max(20, Math.min(WORLD_WIDTH - 20, player.x));

  // ── Camera follow
  const targetCamX = player.x - W * 0.5;
  const targetCamY = player.inWater
    ? Math.max(0, player.y - H * 0.45)
    : 0;
  camera.x = lerp(camera.x, Math.max(0, Math.min(WORLD_WIDTH - W, targetCamX)), 0.08);
  camera.y = lerp(camera.y, targetCamY, 0.06);
  scrollX = camera.x;

  // ── Boat update
  boat.update(dt, scrollX);

  // ── Fish AI
  updateFish(dt, ts);

  // ── Jellyfish
  for (const j of jellyfish) {
    j.t += dt;
    j.pulse += dt * 2;
    j.y += Math.sin(j.t * 0.6) * 0.4;
    j.x += Math.sin(j.t * 0.3) * 0.2;
  }

  // ── Dolphins
  updateDolphins(dt, ts);

  // ── Bubbles
  for (const b of player.bubbles) {
    b.x += b.vx;
    b.y += b.vy;
    b.r *= 0.995;
    b.life -= dt * 0.6;
  }
  player.bubbles = player.bubbles.filter(b => b.life > 0 && b.r > 0.5);

  // ── Particles
  for (const p of particles) {
    p.x += p.vx;
    p.y += p.vy;
    p.life -= dt;
    p.vy += p.gravity || 0;
  }
  particles = particles.filter(p => p.life > 0);

  // ── Trail
  player.trail.push({ x: player.x, y: player.y, life: 0.4 });
  player.trail.forEach(t => t.life -= dt);
  player.trail = player.trail.filter(t => t.life > 0);

  updateHUD();
}

function updateFish(dt, ts) {
  for (const f of fish) {
    f.t += dt;
    // School cohesion
    const school = fish.filter(o => o.school === f.school && o !== f);
    if (school.length) {
      const cx = school.reduce((s, o) => s + o.x, 0) / school.length;
      const cy = school.reduce((s, o) => s + o.y, 0) / school.length;
      f.vx += (cx - f.x) * 0.001;
      f.vy += (cy - f.y) * 0.001;
    }
    // Wander
    f.vx += rand(-0.08, 0.08);
    f.vy += rand(-0.03, 0.03);
    // Speed limit
    const spd = Math.sqrt(f.vx * f.vx + f.vy * f.vy);
    if (spd > 1.5) { f.vx = f.vx / spd * 1.5; f.vy = f.vy / spd * 1.5; }
    // Clamp depth
    const minY = water.baseY + 20;
    if (f.y < minY) { f.vy += 0.1; }
    if (f.y > water.baseY + H * 2) { f.vy -= 0.1; }
    // Flee player
    const dx = player.x - f.x, dy = player.y - f.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 80 && player.inWater) {
      f.vx -= (dx / dist) * 0.5;
      f.vy -= (dy / dist) * 0.5;
    }
    f.flip = f.vx < 0;
    f.x += f.vx;
    f.y += f.vy;
    f.x = Math.max(20, Math.min(WORLD_WIDTH - 20, f.x));
  }
}

function updateDolphins(dt, ts) {
  for (const d of dolphins) {
    d.t += dt;
    // Follow player loosely
    const tx = player.x + 100, ty = Math.min(water.baseY - 30, player.y - 20);
    d.vx = lerp(d.vx, (tx - d.x) * 0.02, 0.1);
    d.vy = lerp(d.vy, (ty - d.y) * 0.02, 0.1);
    d.x += d.vx;
    d.y += d.vy + Math.sin(d.t * 2) * 1.5;

    // Dolphin collects nearby resources for player
    if (stats.buddy) {
      for (const r of resources) {
        if (!r.collected) {
          const dx = r.x - d.x, dy = r.y - d.y;
          if (Math.abs(dx) < 50 && Math.abs(dy) < 50) {
            r.collected = true;
            runResources[r.type]++;
            runMoney += r.value * stats.cargoMulti;
            spawnCollectParticles(r.x, r.y, r.emoji);
          }
        }
      }
    }
  }
}

// ──────────────────────────────────────────────────────
function render(ts) {
  ctx.clearRect(0, 0, W, H);

  if (gameState !== 'playing') {
    renderMenuBackground(ts);
    return;
  }

  const camY = camera.y;
  const wY = water.baseY;

  // ── Sky / atmosphere
  drawSky(camY, wY);

  // ── Underwater environment
  drawUnderwater(camY, wY, ts);

  // ── Water surface
  water.draw(ctx, scrollX, camY, H);

  // ── Above-water layer
  drawAboveWater(camY, wY, ts);

  // ── Player
  drawPlayer(ts, camY);

  // ── Bubbles
  drawBubbles(camY);

  // ── Particles
  drawParticles(camY);

  // ── Boat
  boat.draw(ctx, scrollX, camY);

  // ── Sonar overlay
  if (stats.sonar && player.inWater) {
    drawSonar(camY, wY);
  }

  // ── Dolphins
  drawDolphins(camY);
}

function drawSky(camY, wY) {
  // Only visible when near surface
  const skyH = (wY - camY);
  if (skyH > 0) {
    const skyGrad = ctx.createLinearGradient(0, 0, 0, skyH);
    skyGrad.addColorStop(0, '#0a1a3a');
    skyGrad.addColorStop(0.5, '#1a3a6e');
    skyGrad.addColorStop(1, '#2a5fa8');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, W, skyH);

    // Stars (only at top)
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    for (let i = 0; i < 40; i++) {
      const sx = ((i * 137 + 50) % WORLD_WIDTH - scrollX + WORLD_WIDTH) % WORLD_WIDTH;
      if (sx < 0 || sx > W) continue;
      const sy = (i * 79 + 10) % (skyH * 0.6);
      ctx.beginPath();
      ctx.arc(sx, sy, 0.8, 0, Math.PI * 2);
      ctx.fill();
    }

    // Sun
    const sunX = 200 - scrollX * 0.05;
    const sunY = 50;
    const sunGrad = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 60);
    sunGrad.addColorStop(0, 'rgba(255,220,100,0.9)');
    sunGrad.addColorStop(0.4, 'rgba(255,160,50,0.4)');
    sunGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = sunGrad;
    ctx.fillRect(sunX - 60, 0, 120, 120);

    // Light rays into water
    if (skyH > 20) {
      for (let r = 0; r < 5; r++) {
        const rx = sunX + rand(-40, 40);
        ctx.beginPath();
        ctx.moveTo(rx, skyH);
        ctx.lineTo(rx - 20 + r * 8, skyH);
        ctx.strokeStyle = `rgba(255,220,100,${0.06 - r * 0.008})`;
        ctx.lineWidth = 30 - r * 4;
        ctx.stroke();
      }
    }
  }
}

function drawUnderwater(camY, wY, ts) {
  // Deep gradient
  const depthGrad = ctx.createLinearGradient(0, wY - camY, 0, H);
  depthGrad.addColorStop(0, 'rgba(0,60,120,0)');
  depthGrad.addColorStop(0.3, 'rgba(0,30,80,0.95)');
  depthGrad.addColorStop(1, 'rgba(0,5,25,1)');
  ctx.fillStyle = depthGrad;
  ctx.fillRect(0, wY - camY, W, H);

  // Caustic shimmer (near surface)
  const playerDepth = player.y - wY;
  if (playerDepth < 400) {
    const alpha = Math.max(0, 1 - playerDepth / 400) * 0.08;
    ctx.fillStyle = `rgba(100,200,255,${alpha})`;
    for (let i = 0; i < 8; i++) {
      const cx = ((i * 317 + Math.floor(ts * 0.001) * 50) % WORLD_WIDTH - scrollX + WORLD_WIDTH) % WORLD_WIDTH;
      const cy = wY - camY + (i * 71) % 200 + Math.sin(ts * 0.003 + i) * 20;
      ctx.beginPath();
      ctx.arc(cx, cy, rand(20, 60), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Seaweed
  for (const s of seaweedList) {
    const sx = s.x - scrollX, sy = s.y - camY;
    if (sx < -80 || sx > W + 80 || sy > H + 100 || sy < -200) continue;
    drawSeaweed(sx, sy, s.height, s.sway, s.color, ts);
  }

  // Coral
  for (const c of coralList) {
    const cx = c.x - scrollX, cy = c.y - camY;
    if (cx < -80 || cx > W + 80 || cy > H + 50 || cy < -100) continue;
    drawCoral(cx, cy, c.size, c.type, c.color);
  }

  // Fish
  for (const f of fish) {
    const fx = f.x - scrollX, fy = f.y - camY;
    if (fx < -30 || fx > W + 30) continue;
    drawFish(fx, fy, f.size, f.color, f.vx, f.t);
  }

  // Jellyfish
  for (const j of jellyfish) {
    const jx = j.x - scrollX, jy = j.y - camY;
    if (jx < -60 || jx > W + 60 || jy > H + 60 || jy < -60) continue;
    drawJellyfish(jx, jy, j.size, j.color, j.pulse);
  }

  // Resources
  for (const r of resources) {
    if (r.collected) continue;
    const rx = r.x - scrollX, ry = r.y - camY;
    if (rx < -40 || rx > W + 40 || ry < -40 || ry > H + 40) continue;
    drawResource(rx, ry, r, ts);
  }

  // Treasures
  if (stats.treasureMap) {
    for (const t of treasures) {
      if (t.collected) continue;
      const tx2 = t.x - scrollX, ty2 = t.y - camY;
      if (tx2 < -40 || tx2 > W + 40) continue;
      drawTreasure(tx2, ty2, t.glow, ts);
    }
  }

  // Deep vents / abyss effects
  if (camY > H * 1.5) {
    drawAbyssParticles(camY, ts);
  }
}

function drawAboveWater(camY, wY, ts) {
  // Nothing extra needed – boat drawn separately
}

function drawSeaweed(x, y, height, sway, color, ts) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  const segments = 6;
  let cx = x, cy = y;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    const swayAmt = Math.sin(ts * 0.001 + sway + i * 0.5) * 12 * t;
    ctx.quadraticCurveTo(
      cx + swayAmt * 1.5, cy - height / segments * (i - 0.5),
      cx + swayAmt, cy - height / segments * i
    );
    cx += swayAmt * 0.2;
    cy -= height / segments;
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = 5;
  ctx.stroke();

  // Leaves
  for (let i = 1; i <= 3; i++) {
    const lx = x + Math.sin(ts * 0.001 + sway + i) * 8;
    const ly = y - height * (i / 3.5);
    ctx.beginPath();
    ctx.ellipse(lx + 10, ly, 10, 5, -0.4, 0, Math.PI * 2);
    ctx.fillStyle = color + 'cc';
    ctx.fill();
  }
  ctx.restore();
}

function drawCoral(x, y, size, type, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color + '66';
  ctx.lineWidth = 1.5;

  if (type === 0) {
    // Branch coral
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.bezierCurveTo(x + i * size * 0.5, y - size * 0.5, x + i * size * 0.8, y - size * 0.7, x + i * size * 0.6, y - size);
      ctx.lineWidth = 4;
      ctx.strokeStyle = color;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x + i * size * 0.6, y - size, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (type === 1) {
    // Fan coral
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI * 0.8 + (i / 6) * Math.PI * 1.6;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * size, y + Math.sin(a) * size * 0.8);
      ctx.lineWidth = 2;
      ctx.strokeStyle = color + 'aa';
      ctx.stroke();
    }
  } else if (type === 2) {
    // Dome coral
    ctx.beginPath();
    ctx.arc(x, y, size * 0.5, Math.PI, 0);
    ctx.fill();
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const bx = x - size * 0.4 + i * size * 0.2;
      ctx.arc(bx, y, size * 0.12, 0, Math.PI * 2);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fill();
  } else {
    // Tube coral
    for (let i = -1; i <= 1; i += 0.5) {
      ctx.beginPath();
      ctx.roundRect(x + i * size * 0.3, y - size, size * 0.15, size, 4);
      ctx.fillStyle = color;
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawFish(x, y, size, color, vx, t) {
  ctx.save();
  ctx.translate(x, y);
  if (vx > 0) ctx.scale(-1, 1);
  ctx.rotate(Math.sin(t * 2) * 0.1);

  // Body
  ctx.beginPath();
  ctx.ellipse(0, 0, size, size * 0.5, 0, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  // Tail
  ctx.beginPath();
  ctx.moveTo(-size, 0);
  ctx.lineTo(-size - size * 0.8, -size * 0.5 + Math.sin(t * 4) * size * 0.3);
  ctx.lineTo(-size - size * 0.8, size * 0.5 + Math.sin(t * 4) * size * 0.3);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();

  // Eye
  ctx.beginPath();
  ctx.arc(size * 0.4, -size * 0.1, size * 0.15, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(size * 0.42, -size * 0.1, size * 0.08, 0, Math.PI * 2);
  ctx.fillStyle = '#000';
  ctx.fill();

  // Stripe
  ctx.beginPath();
  ctx.moveTo(0, -size * 0.5);
  ctx.lineTo(0, size * 0.5);
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.restore();
}

function drawJellyfish(x, y, size, color, pulse) {
  ctx.save();
  ctx.translate(x, y);

  const pScale = 1 + Math.sin(pulse) * 0.15;

  // Bell
  ctx.beginPath();
  ctx.arc(0, 0, size * pScale, Math.PI, 0);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, 0, size * pScale, size * 0.3 * pScale, 0, 0, Math.PI * 2);
  ctx.fillStyle = color.replace('0.8', '0.4');
  ctx.fill();

  // Inner glow
  const g = ctx.createRadialGradient(0, -size * 0.3, 0, 0, 0, size * pScale);
  g.addColorStop(0, 'rgba(255,255,255,0.4)');
  g.addColorStop(1, 'transparent');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, size * pScale, Math.PI, 0);
  ctx.fill();

  // Tentacles
  for (let i = 0; i < 6; i++) {
    const tx = (i - 2.5) * size * 0.25;
    ctx.beginPath();
    ctx.moveTo(tx, 0);
    const waveOffset = pulse + i * 0.8;
    for (let seg = 0; seg <= 6; seg++) {
      const sy = seg * size * 0.5;
      const sx = tx + Math.sin(waveOffset + seg * 0.6) * 6;
      seg === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
    }
    ctx.strokeStyle = color.replace('0.8', '0.5');
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  ctx.restore();
}

function drawResource(x, y, r, ts) {
  ctx.save();
  ctx.translate(x, y);
  const glow = Math.sin(r.glow + ts * 0.002) * 0.5 + 0.5;

  // Glow halo
  const glowColors = { coral: '#ff6b6b', gem: '#00d4ff', shell: '#ffd700' };
  const gc = glowColors[r.type] || '#fff';
  const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 24);
  g.addColorStop(0, gc + '66');
  g.addColorStop(1, 'transparent');
  ctx.fillStyle = g;
  ctx.fillRect(-24, -24, 48, 48);

  // Emoji icon
  ctx.font = `${20 + glow * 4}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.globalAlpha = 0.9 + glow * 0.1;
  ctx.fillText(r.emoji, 0, 0);
  ctx.restore();
}

function drawTreasure(x, y, glow, ts) {
  ctx.save();
  ctx.translate(x, y);
  const pulse = Math.sin(glow + ts * 0.003) * 0.5 + 0.5;

  // Glow
  const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 40);
  g.addColorStop(0, `rgba(255,215,0,${0.4 + pulse * 0.3})`);
  g.addColorStop(1, 'transparent');
  ctx.fillStyle = g;
  ctx.fillRect(-40, -40, 80, 80);

  // Chest body
  ctx.fillStyle = '#8B4513';
  ctx.fillRect(-20, -10, 40, 25);
  ctx.fillStyle = '#D2691E';
  ctx.fillRect(-20, -20, 40, 12);
  // Lid curve
  ctx.beginPath();
  ctx.arc(0, -20, 20, Math.PI, 0);
  ctx.fillStyle = '#A0522D';
  ctx.fill();

  // Latch
  ctx.beginPath();
  ctx.roundRect(-5, -12, 10, 14, 2);
  ctx.fillStyle = '#ffd700';
  ctx.fill();

  // Shine
  ctx.font = `${16 + pulse * 6}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('✨', 0, -30 - pulse * 8);

  ctx.restore();
}

function drawPlayer(ts, camY) {
  const px = player.x - scrollX;
  const py = player.y - camY;

  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(player.angle);

  if (player.inWater || !player.onBoat) {
    // Diver
    // Fins
    ctx.fillStyle = '#ff9900';
    ctx.beginPath();
    ctx.ellipse(-10, 22, 14, 6, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(10, 22, 14, 6, 0.3, 0, Math.PI * 2);
    ctx.fill();

    // Suit body
    const bodyGrad = ctx.createLinearGradient(-14, -20, 14, 20);
    bodyGrad.addColorStop(0, '#1a5fa8');
    bodyGrad.addColorStop(1, '#0d3d6e');
    ctx.beginPath();
    ctx.roundRect(-14, -20, 28, 42, 6);
    ctx.fillStyle = bodyGrad;
    ctx.fill();

    // Arms (animated swim)
    const armSwing = Math.sin(player.animT) * 20;
    ctx.save();
    ctx.rotate((armSwing / 180) * Math.PI);
    ctx.fillStyle = '#1a5fa8';
    ctx.beginPath();
    ctx.ellipse(-22, 0, 8, 4, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.rotate((-armSwing / 180) * Math.PI);
    ctx.fillStyle = '#1a5fa8';
    ctx.beginPath();
    ctx.ellipse(22, 0, 8, 4, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Helmet
    ctx.beginPath();
    ctx.arc(0, -20, 16, 0, Math.PI * 2);
    ctx.fillStyle = '#333';
    ctx.fill();
    // Visor
    ctx.beginPath();
    ctx.arc(0, -20, 12, -Math.PI * 0.7, Math.PI * 0.7);
    const visorGrad = ctx.createRadialGradient(0, -23, 2, 0, -20, 12);
    visorGrad.addColorStop(0, 'rgba(100,220,255,0.8)');
    visorGrad.addColorStop(1, 'rgba(0,100,200,0.6)');
    ctx.fillStyle = visorGrad;
    ctx.fill();
    // Visor shine
    ctx.beginPath();
    ctx.arc(-4, -24, 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fill();

    // Air tank
    ctx.beginPath();
    ctx.roundRect(12, -16, 8, 22, 3);
    ctx.fillStyle = '#666';
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(10, -16, 8, 22, 3);
    ctx.fillStyle = '#888';
    ctx.fill();
  } else {
    // Standing on boat - simplified diver figure
    ctx.fillStyle = '#1a5fa8';
    ctx.beginPath();
    ctx.roundRect(-8, -30, 16, 36, 4);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, -32, 10, 0, Math.PI * 2);
    ctx.fillStyle = '#333';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, -32, 7, -Math.PI * 0.6, Math.PI * 0.6);
    ctx.fillStyle = 'rgba(100,220,255,0.8)';
    ctx.fill();
  }

  ctx.restore();

  // Trail
  ctx.save();
  for (let i = 0; i < player.trail.length; i++) {
    const t = player.trail[i];
    const alpha = t.life * 0.3;
    ctx.beginPath();
    ctx.arc(t.x - scrollX, t.y - camY, 3, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(100,200,255,${alpha})`;
    ctx.fill();
  }
  ctx.restore();
}

function drawBubbles(camY) {
  ctx.save();
  for (const b of player.bubbles) {
    const alpha = b.life * 0.6;
    ctx.beginPath();
    ctx.arc(b.x - scrollX, b.y - camY, b.r, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(150,230,255,${alpha})`;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = `rgba(200,240,255,${alpha * 0.3})`;
    ctx.fill();
  }
  ctx.restore();
}

function drawParticles(camY) {
  ctx.save();
  for (const p of particles) {
    ctx.globalAlpha = p.life;
    ctx.font = `${p.size}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(p.emoji || '✨', p.x - scrollX, p.y - camY);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawSonar(camY, wY) {
  ctx.save();
  const px = player.x - scrollX;
  const py = player.y - camY;
  for (const r of resources) {
    if (r.collected) continue;
    const rx = r.x - scrollX, ry = r.y - camY;
    const dx = rx - px, dy = ry - py;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 250) {
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(rx, ry);
      ctx.strokeStyle = `rgba(0,255,150,${0.15 - dist * 0.0005})`;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(rx, ry, 6, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,255,150,0.5)';
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawDolphins(camY) {
  for (const d of dolphins) {
    const dx = d.x - scrollX;
    const dy = d.y - camY;
    ctx.save();
    ctx.translate(dx, dy);
    // Simple dolphin shape
    ctx.fillStyle = '#6bb8d4';
    ctx.beginPath();
    ctx.ellipse(0, 0, 28, 11, d.vx * 0.05, 0, Math.PI * 2);
    ctx.fill();
    // Fin
    ctx.beginPath();
    ctx.moveTo(0, -11);
    ctx.lineTo(8, -22);
    ctx.lineTo(14, -11);
    ctx.fillStyle = '#5aa8c4';
    ctx.fill();
    // Eye
    ctx.beginPath();
    ctx.arc(18, -2, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#1a1a2e';
    ctx.fill();
    ctx.restore();
  }
}

function drawAbyssParticles(camY, ts) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,150,255,0.15)';
  for (let i = 0; i < 12; i++) {
    const px2 = ((i * 257 + Math.floor(ts * 0.05)) % WORLD_WIDTH - scrollX + WORLD_WIDTH) % WORLD_WIDTH;
    const py2 = ((i * 113 + ts * 0.02) % H);
    ctx.beginPath();
    ctx.arc(px2, py2, rand(1, 4), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function renderMenuBackground(ts) {
  // Animated ocean background for menu
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#000d1a');
  grad.addColorStop(0.5, '#001f3f');
  grad.addColorStop(1, '#003366');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
}

// ──────────────────────────────────────────────────────
function spawnSplashParticles(x, y) {
  for (let i = 0; i < 10; i++) {
    particles.push({
      x, y, emoji: '',
      vx: rand(-3, 3), vy: rand(-4, -1),
      gravity: 0.15, size: 1,
      life: rand(0.3, 0.7),
      _isSplash: true,
    });
  }
}

function spawnCollectParticles(x, y, emoji) {
  for (let i = 0; i < 6; i++) {
    particles.push({
      x: x + rand(-10, 10), y: y + rand(-10, 10),
      emoji, vx: rand(-1, 1), vy: rand(-2.5, -0.5),
      gravity: 0.05, size: 18,
      life: 1.0,
    });
  }
  // Also emit splash at surface
  water.splash(x, -3);
}

// ──────────────────────────────────────────────────────
function endRun() {
  gameState = 'gameover';

  // Award money
  const earned = Math.floor(runMoney);
  shop.addMoney(earned);

  document.getElementById('hud').classList.add('hidden');
  document.getElementById('touch-controls').classList.add('hidden');
  document.getElementById('gameover-screen').classList.remove('hidden');
  document.getElementById('go-depth').textContent = maxDepth + 'm';
  const totalRes = runResources.coral + runResources.gem + runResources.shell + (runResources.chest || 0);
  document.getElementById('go-resources').textContent = totalRes;
  document.getElementById('go-earnings').textContent = '+' + earned;
  document.getElementById('go-total').textContent = shop.money;
  shop.updateMoneyDisplays();
}

function updateHUD() {
  const pct = (player.air / player.maxAir) * 100;
  document.getElementById('air-bar').style.width = pct + '%';
  // Color warning
  const bar = document.getElementById('air-bar');
  if (pct < 25) {
    bar.style.background = 'linear-gradient(90deg, #ff4444, #ff8888)';
    bar.style.boxShadow = '0 0 8px #ff4444';
  } else if (pct < 50) {
    bar.style.background = 'linear-gradient(90deg, #ffaa00, #ffdd55)';
    bar.style.boxShadow = '0 0 8px #ffaa00';
  } else {
    bar.style.background = 'linear-gradient(90deg, #00d4ff, #7ef0ff)';
    bar.style.boxShadow = '0 0 8px #00d4ff';
  }
  const depth = Math.max(0, Math.floor(player.y - water.baseY));
  document.getElementById('depth-val').textContent = depth;
  const total = runResources.coral + runResources.gem + runResources.shell + (runResources.chest || 0);
  document.getElementById('res-display').textContent = `🪸 ${runResources.coral}  💎 ${runResources.gem}  🐚 ${runResources.shell}`;
  document.getElementById('money-display').textContent = shop.money;
}

// ──────────────────────────────────────────────────────
function setupUI() {
  document.getElementById('btn-play').addEventListener('click', startGame);
  document.getElementById('btn-replay').addEventListener('click', startGame);
  document.getElementById('btn-go-menu').addEventListener('click', () => {
    document.getElementById('gameover-screen').classList.add('hidden');
    document.getElementById('menu-screen').classList.remove('hidden');
    gameState = 'menu';
    shop.updateMoneyDisplays();
  });
  document.getElementById('btn-go-shop').addEventListener('click', () => {
    document.getElementById('gameover-screen').classList.add('hidden');
    shop.openShop();
  });
  document.getElementById('btn-tut-close').addEventListener('click', () => {
    document.getElementById('tutorial-overlay').classList.add('hidden');
  });
}

function setupInput() {
  // Keyboard
  window.addEventListener('keydown', e => {
    keys[e.key] = true;
    if (e.key === ' ' && gameState === 'playing') toggleDive();
  });
  window.addEventListener('keyup', e => { keys[e.key] = false; });

  // Touch D-pad
  const btns = {
    'btn-up': 'up', 'btn-down': 'down', 'btn-left': 'left', 'btn-right': 'right'
  };
  for (const [id, dir] of Object.entries(btns)) {
    const btn = document.getElementById(id);
    btn.addEventListener('touchstart', e => { e.preventDefault(); touchInput[dir] = true; btn.classList.add('pressed'); }, { passive: false });
    btn.addEventListener('touchend', e => { e.preventDefault(); touchInput[dir] = false; btn.classList.remove('pressed'); }, { passive: false });
    btn.addEventListener('touchcancel', e => { touchInput[dir] = false; btn.classList.remove('pressed'); });
    // Mouse fallback
    btn.addEventListener('mousedown', () => touchInput[dir] = true);
    btn.addEventListener('mouseup', () => touchInput[dir] = false);
  }

  // Jump/dive button
  const jumpBtn = document.getElementById('btn-jump');
  jumpBtn.addEventListener('touchstart', e => { e.preventDefault(); toggleDive(); }, { passive: false });
  jumpBtn.addEventListener('click', toggleDive);
}

function toggleDive() {
  if (gameState !== 'playing') return;
  if (player.onBoat) {
    // Jump into water
    player.onBoat = false;
    player.inWater = false;
    player.vy = 2;
    player.vx = 0;
    water.splash(player.x, 8);
    spawnSplashParticles(player.x, water.baseY);
  } else if (!player.inWater) {
    // Surface → dive
    player.inWater = true;
    player.vy = 3;
  } else {
    // Try to surface
    player.vy = -5;
  }
}

// ──────────────────────────────────────────────────────
// Helpers
function rand(a, b) { return a + Math.random() * (b - a); }
function randChoice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function lerp(a, b, t) { return a + (b - a) * t; }

// ──────────────────────────────────────────────────────
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 300));
window.addEventListener('load', init);
